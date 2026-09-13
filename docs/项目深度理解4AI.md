# CeXplore 项目深度理解 4AI 与后续开发地图

> 这是一份面向 AI/开发者后续续建的源码级心智模型，不替代用户手册或指标方法文档。结论以当前工作区（`HEAD ca1e23c` 加尚未提交的 group-analysis、group trails、division connection、temporal-axis、Mean Worker cache、完整三自由度视角、group/individual projected motion、group membership/I/O 和 import-time frame sampling 更新）源码、测试和生产构建为准，最后复核于 2026-09-10。

## 1. 项目本质与边界

CeXplore 是一个纯浏览器端的 *C. elegans* 胚胎细胞谱系、3D 核位置和群体空间指标探索器。它把多个来源文件标准化为一个内存数据集，让谱系树、3D 胚胎、细胞列表、分组、颜色和时间轴共享同一个 Zustand 状态；Mean position 与分析任务分别使用独立 Worker，前者预计算显示缓存，后者按需计算群体指标。

当前产品边界很明确：

- 输入是 CSV、TSV/TXT 或 XLS/XLSX；没有后端、数据库、账号或云同步。
- 每次导入必须选 Time 或 Frame；canonical 表只解析 lineage topology，不提供纵轴时间。
- 不做坐标线性插值、不配准、不推断坐标轴方向；但默认抽帧和可选 Mean 缺帧模式会做上一完整 embryo frame 的 zero-order hold。
- 导入默认把所有 selected embryos 的 union time grid 均匀压缩到 185 个目标帧，并为 cell coverage 添加必要帧；选择 All 才保留原始 exact frame grid。
- 多胚胎 `Mean position` 对当前工作数据集中同 step/cell 的可用坐标求平均；All import 可在 exact-only 和 hold-last 之间切换。
- 谱系来自仓库内 canonical 表，输入的非空 parent 可以覆盖 canonical parent。
- Session 只保存映射、颜色、分组和显示设置，不保存 observation。
- Group analysis 已接入 UI，但只在用户点击 Run analysis 后计算；它不使用 3D Mean position，而是逐 embryo、逐真实 time/frame 独立测量。
- 当前四项指标和 matched null 是探索性描述，不是因果检验、正式显著性检验或多重比较校正。

## 2. 一张图理解运行链路

```text
main.tsx
  └─ App
      ├─ 无 dataset：欢迎页 + FileLoader
      └─ 有 dataset：
          ├─ AppHeader（数据摘要、重新导入、Session）
          ├─ 四块共享视图
              ├─ LineageTree（SVG + D3 zoom）
              ├─ Embryo3D（Three.js/WebGL）
              ├─ ListPanel（Cells / Cell groups）
              └─ ControlDeck（播放、显示、CellInfo）
          └─ AnalysisPanel（覆盖式、可收起的按需分析抽屉）

文件选择
  → inspectFile：只预览 header / worksheet
  → ColumnMapper：列映射，并扫描 embryo ID
  → loadMappedRows：按已选 embryo 解析所需行
  → FileLoader：给 source/embryo 建内部 ID，顺序合并多个文件
  → sampleRowsByFrame：可选 union-time 抽样、cell coverage、上一完整 embryo frame 保持
  → buildDatasetFromRows：清洗、去重、归一化、建索引
  → resolveLineage：canonical + supplied parent，补连接祖先
  → useExplorerStore.setDataset
  → 所有视图响应同一个 store

用户点击 Run analysis
  → 当前 selection/saved group + activeEmbryoIds + 参数
  → 从 embryoIndex 复制选中 embryo 的 cellId/step/AP/LR/VD
  → Web Worker：dynamic membership → per-embryo/time kNN → metrics + null
  → GroupAnalysisResult：趋势图、当前汇总、胚胎表、CSV

用户首次选择 Mean position / 改变 active embryos / 切换 All-import 缺帧模式
  → observations + activeEmbryoIds + frameValues + holdLastFrame structured clone 到 meanPosition.worker
  → 一次聚合全部 step/cell
  → mean frameIndex + mean trajectoryIndex 写回 store cache
  → 播放、CellInfo、Mean trails 和 division links 只读缓存
```

项目的关键设计不是某一个组件，而是五条稳定边界：

1. `RawMappedRow → sampled RawMappedRow → EmbryoDataset`：文件格式和原始超大时间网格在此之后不再影响业务代码。
2. `EmbryoDataset → LineageModel`：空间观测与谱系拓扑分离。
3. Zustand store：所有交互只改一份 authoritative state，视图不各存一份 selection。
4. `MeanPositionRequest → MeanPositionSerializedCache`：平均位置是可取消、可按 embryo selection 失效的 derived cache。
5. `GroupAnalysisRequest → GroupAnalysisResult`：分析是可序列化纯数据合同，计算层不依赖 React、Three.js 或 Zustand。

## 3. 核心数据模型

### 3.1 `ColumnMapping`

保存用户为某个 source 选择的列：cell、AP/LR/VD、Time 或 Frame、parent、embryo 和 worksheet。Frame 模式还保存 `frameIntervalSeconds`。`frameSampleCount` 为正整数时启用共享帧抽样（`DEFAULT_FRAME_SAMPLE_COUNT` 与 UI 默认均为 185），为 `undefined` 时表示 All。`embryoValues` 是当前多选字段；单值 `embryoValue` 只为读取 v0.1 session 保留。

多文件数据集同时保留：

- 顶层 `dataset.mapping`：第一份 source 的 mapping，主要用于兼容和 Session 导出；
- `dataset.sources[].mapping`：每份文件自己的真实 mapping。

### 3.2 `Observation`

这是渲染和查询的基本单位：

```ts
{
  cellId,
  embryoId,          // 内部 namespaced ID，不是原始 label
  step,              // 原始数值 time 或 frame
  x, y, z,           // 原始 AP/LR/VD，供信息面板和分析使用
  renderX/Y/Z,       // 全局中心化和统一缩放后的渲染坐标
  parentId?,
  contributingEmbryoIds? // 只用于 mean observation
}
```

内部 embryo ID 使用 `source-N::encodeURIComponent(originalId)`，所以不同文件中同名 embryo 不会碰撞。没有 embryo 列的文件被当作一个 embryo，label 为去扩展名后的文件名。

### 3.3 `EmbryoDataset`

除 observation 外，构建阶段一次性生成：

- `frameValues`：所有 observation 的唯一 step 升序并集；
- `frameIndex: Map<step, Observation[]>`：当前帧读取入口；
- `embryoIndex: Map<embryoId, Observation[]>`：按 embryo 快速准备分析请求；值仍引用原 observation，不在 dataset 内复制对象；
- `trajectoryIndex: Map<embryoId + NUL + cellId, Observation[]>`：单 embryo 单 cell 轨迹；
- `cells` / `cellIds`：跨所有 embryo 汇总的 cell 摘要；
- `parentOverrides`：按 `cellId` 汇总的非空 supplied parent；
- `bounds`：所有 embryo、所有 step 的全局坐标范围；
- `sources` / `embryos`：来源和显示元数据；
- `warnings`：无效行和重复 `(embryoId, step, cellId)` 行统计。

重要含义：`cells`、bounds、谱系布局都是整个导入数据集级别，不随当前勾选 embryo 重建。`embryoIndex` 只改善读取路径；启动分析时仍会把被选 embryo 的最小字段复制为 Worker 可 structured-clone 的普通对象。

### 3.4 `LineageModel`

每个 `LineageNode` 记录 parent、children、是否真实出现在数据中（`represented`）、是否解析成功、关系来源和 canonical/observation 摘要。

`represented: false` 的节点不是虚假 observation，而是为了把稀疏数据接回谱系根而插入的 connecting ancestor。Lineage selection 默认只返回 represented descendants，因此不会把这些连接节点塞进 cell group。

### 3.5 Analysis 数据合同

分析层不直接传递 `EmbryoDataset`、Map 或 store。`GroupAnalysisRequest` 只包含：

- dataset 名和 temporal mode；
- 本次 captured embryo IDs；
- 精简后的 `{cellId, embryoId, step, x, y, z}`；
- 扁平 `parentByCell`；
- group snapshot、metric 列表、k、null 次数、minimum group size 和随机种子。

`GroupAnalysisResult.points` 的每一行是一个 `embryoId × step`，包含 group size、该帧总细胞数、low-n eligibility，以及所选 metric 的 observed/null/z/percentile。group 不存在的帧也保留 row，但 metric 字段为空。

## 4. 导入流程与数据规则

### 4.1 导入是逐文件状态机

`FileLoader` 使用 React state 保存当前文件和 inspection，使用 refs 累积 rows、sources 和 embryo descriptors：

1. 一次选择一个或多个文件；
2. 逐个 `inspectFile` 并弹出 Column Mapper；
3. 如映射 embryo 列，完整扫描一次 distinct IDs，默认只选第一个；
4. 用户确认后再次解析文件，只保留已选 embryo；
5. 当前文件成功后进入下一文件；
6. 最后一份文件完成后统一构建 dataset 和 lineage，再原子写入 store。

多文件强制 `playback` 类型一致，即都为 Time 或都为 Frame；Frame 还强制 `frameIntervalSeconds` 一致。代码不验证列名、Time 单位、采样协议或数值范围是否真的可比较。

同一文件多选 embryo 时，保留行会用显式循环追加并写入 namespaced embryo ID，不能使用 `target.push(...rows)`。后者会把每行变成一个函数参数，在约 10–12 万行时便可触发浏览器 `Maximum call stack size exceeded`；给定数据每胚胎约 20,926 行，所以旧实现恰好表现为约 5 个胚胎能加载、6 个开始失败。现实现没有这个人为行数上限；解析数组的重复引用会在合并后立即释放，Sample 输入的原始累积行也会在生成 sampled rows 后、构建 dataset 前释放。两个长同步阶段前先让浏览器绘制 progress label。

导入 modal 内会直接显示 loader 异常。若当前文件已累积后才在抽样/建索引阶段失败，整个未完成 import 会被清除，避免再点 Load 时把同一 source 重复追加。这只移除了 spread/call-stack 硬上限，总数据量仍受浏览器可用 RAM 和 WebGL 资源限制。

### 4.2 CSV/TSV 与 XLSX 路径不同

- Delimited 文件：Papa Parse `worker: true` + `step`，逐行扫描；不匹配的 embryo 立即丢弃。但所有保留行仍会累积在内存中，随后再统一建 dataset。
- XLS/XLSX：动态 import SheetJS，整个 workbook 读入内存，再选 worksheet 和过滤。
- 文件 inspection 对 delimited 文件只读取前 512 KiB，最多取 200 行解析、50 行 sample。

### 4.3 清洗和去重

`buildDatasetFromRows` 的有效行条件是：

- 非空 `cellId`；
- AP/LR/VD 都可转换为有限数；
- Time/Frame step 可转换为有限数。

重复键为 `(internal embryoId, numeric step, cellId)`，最后一个有效值覆盖之前值并计入 duplicate warning。相同 step 但不同 cell 不是重复，而是同一播放帧的正常成员。

两种模式中 parent 只要非空就写入全局 `parentOverrides[cellId]`，因此不同 embryo/source 对同一 cell 给出冲突 parent 时，最后出现的非空值胜出，目前没有冲突 warning，也不是 embryo-specific lineage。

### 4.4 坐标归一化

原始 `x/y/z` 永远保留。渲染坐标使用所有 observation 的全局中心，并用最大轴跨度计算一个统一比例，使最长轴长度为 16：

```text
renderAxis = (originalAxis - globalCenterAxis) * 16 / max(AP span, LR span, VD span)
```

三个轴没有分别拉伸，所以输入的各向异性被保留。多个 embryo 必须预先位于共同 AP/LR/VD 坐标系；应用不做 registration、旋转、翻转或符号推断。

## 5. 时间语义

`mapping.playback` 最终映射为：

- `time → temporalMode: 'time'`
- `frame → temporalMode: 'frame'`

时间轴滑块保存的是 `currentFrameIndex`，真正的时间/帧值通过 `dataset.frameValues[index]` 获取。All import 时，`frameValues` 是全部有效 step 去重后的升序列表；Time 模式中相同 time 值的所有 cells 同属一帧，不同 time 值按数值顺序逐帧播放。这也允许 1、2、5、20 这类不连续 step。

默认 Sample import 先在所有 selected embryos 的 union steps 上按索引均匀取目标数，检查所有 valid cell IDs 是否至少在一个 exact selected step 出现，并以 greedy coverage 加入遗漏细胞所需帧，所以 185 是目标而非绝对上限。随后每个 embryo 在每个目标 step 使用 exact frame，否则复制其最近上一完整 frame；首个 embryo frame 以前不补。得到的 rows 才进入 `buildDatasetFromRows`，所以 dataset 的 observations/indexes/cells/bounds，以及所有 projection、metric、Mean、trail 和 lineage summary，都只认识抽样后的帧。这是 piecewise-constant hold，不是两个位置间的线性插值。

Frame 模式中，`mapping.frameIntervalSeconds` 是大于 0 的用户输入，默认建议值为 1。它不改变 observation.step、`frameValues`、播放速度或 analysis step；只在 lineage y 轴上通过 `lineageAxisValue = frame × intervalSeconds / 60` 换算为 elapsed minutes。Time 模式的原 time 值则直接按 minutes 解释。

播放定时器间隔固定为 `360ms / playbackSpeed`，不会按相邻 time 值的真实差值等待；到末尾后循环到开头。轨迹范围默认 `All previous`；也可选择按 `frameValues` 索引计算的 `Previous N frames`，或输入 start/end frame（Time 模式输入 time）。custom 范围会吸附到实际存在的 `frameValues`，且 end 始终被当前播放 step 截断，因此不会提前显示未来位置。

分析同样使用当前 dataset 的 authoritative numeric step：不同 embryo 只有 step 数值完全相同才会进入同一个 cohort 时间切片；它不额外做时间配准、线性插值或 nearest-time pooling。Sample import 已经固化的 hold-last observations 会正常进入 metric。点击分析曲线时，UI 才把所点 series step 映射到 dataset 中最近的 `frameValues` index。

## 6. 多胚胎视图的真实语义

`activeEmbryoIds` 至少保留一个有效 embryo，默认全选。

### Overlay

返回当前 step 中属于 active embryos 的原 observation。同名 cell 可以同时出现多次。轨迹按 embryo 分开；CellInfo 在 hover 时知道具体 observation，只有通过其他视图选中 cell 时，会显示当前可见列表中找到的第一个 embryo observation。

### Mean position

数值语义是按 step/cell 平均原始坐标和 render 坐标；结果 embryo ID 固定为 `__mean__`。Sample import 的 input 已包含抽样时生成的 hold-last observations。All import 默认 exact-only，分母是该 step 实际存在该 cell 的 active embryos 数量；用户勾选 `Hold each embryo's last frame at missing times` 后，Worker 在 union `frameValues` 上为每个 embryo 取 exact 或最近上一完整 frame，尚未开始的 embryo 和该完整帧不存在的 cell 不进入分母。两者都不读取未来帧。

该计算不发生在每次 render：第一次选择 Mean 时由 `meanPosition.worker.ts` 一次预计算全部 frames，得到 `frameIndex` 和 `trajectoryIndex` 两个缓存，播放时直接读取。

缓存由 `explorerStore` 管理，key 是排序后的 active embryo IDs 加 `exact/hold` 模式，状态为 `idle/loading/ready/error`。active embryo list 或 All-import 缺帧选项改变会取消旧 job、清缓存并自动重算；Overlay 可继续保留有效缓存；关闭/替换 dataset 会取消 job 并释放缓存。Session 只保存用户设置，不保存这份可重建的 derived data。

### 谱系树与 active embryos

- 树的拓扑和纵向布局来自整个 imported dataset 的 `cells` 汇总，因此不会随 embryo checkbox 改变。
- `past/current/future` 状态会重新扫描 active embryos 的 observation range，所以视觉状态会变。
- 多胚胎的 cell birth/last step 在基础 layout 中是全局最早/最晚值，不代表某一个胚胎的精确 lineage timing。

### Group analysis 与 active embryos

- 分析读取运行按钮被点击当时的 `activeEmbryoIds`，与 3D 面板的 Overlay/Mean 开关无关；
- 每个 embryo/step 单独建图和计算，绝不先合并 embryo；
- active embryos 后续改变时，旧结果保留但标记 stale，不自动重算；
- cohort median/IQR 只汇总在该 exact step 有有效 metric 的 embryo，所以每个时间点的 `n` 可以不同。

## 7. 谱系解析与布局

### 7.1 Canonical 数据

`complete_embryo_lineage_list.csv` 随 bundle 以 raw text 导入。当前表有 1,341 个唯一 cell、一个根 `P0`、无重复 cell ID、无缺失 parent 引用、无 parent cycle。

`canonicalLineage.ts` 还显式覆盖早期非对称关系，包括 `P0/P1/P2/P3/P4`、`AB`、`EMS`、`MS`、`E`、`C`、`D`、`Z2`、`Z3`。因此绝不能用“删除 cell 名最后一个字符”替代当前解析器。

### 7.2 关系优先级

对每个 cell：

```text
非空 supplied parent > canonical parent > unresolved root
```

解析器沿 parent 向上补祖先，单条链最多走 64 层，并用 visited 防止解析阶段死循环；然后反向生成 children。后代和祖先查询也有 visited 防护。

注意：布局算法假设最终拓扑无环。当前 canonical 表无环，但 supplied parent 没有显式 cycle validation；若输入造成环，可能没有 root，并可能使递归布局失败。将来自用户的自定义谱系扩展为正式功能前，应先加 parent conflict/cycle/depth validation。

### 7.3 SVG 布局

- 叶节点按 canonical `xPosition/treeOrder` 排序，未知叶按自然字符串顺序；
- 内部节点 x 是 children x 的平均值；
- cell lifetime 是竖线，division 是母节点 endY 上的水平线；
- 上传 Time/Frame 时，represented cell 的 birth/last 来自全局 observation summary；
- Time 纵轴使用原 minute time，Frame 纵轴使用 `frame × intervalSeconds / 60`；
- 缺失的 connecting ancestor 收拢到其最早 observed descendant，不伪造更早时间；
- `minValue` 直接取最早 birth value，第一个 tick 和 branch 同高；从 2-cell/4-cell 期起步时不会向 0 扩展空白区；
- depth 0–5 标签常驻，更深标签 hover 才出现；
- D3 只管理 zoom/pan transform，不负责谱系计算。

## 8. 全局状态与交互同步

`useExplorerStore` 是唯一共享状态，主要分为：

- 数据：`dataset`, `lineage`
- 播放：`currentFrameIndex`, `playing`, `playbackSpeed`
- 多胚胎：`activeEmbryoIds`
- 选择：`selection`, `selectionMeta`, `inspectedCellId`, `hoveredObservation`
- 外观：`cellColors`, `groups`, `settings`
- 相机命令：`cameraCommand` discriminated union，包含 `reset | focus | angle` 和递增 `nonce`

Analysis 的 UI 状态是一个刻意的例外：drawer open、target、metrics、k、null sample、progress、result 和 stale fingerprint 都保存在 `AnalysisPanel` 本地 React state，不进入 Zustand，也不进入 Session。它只从 store 读取 dataset、lineage、groups、selection、active embryos 和 current frame，并用 `setCurrentFrameIndex` 把图表点击同步回全局时间轴。

Trails 的目标选择与范围是全局 `settings` 的一部分，会跟 Session 导出：`trailGroupIds` 为 `'all' | string[]`，但其语义是“在 visible groups 之外额外加入的 hidden group IDs”，默认 `[]`；`'all'` 表示加入所有 hidden groups。`trailRangeMode` 为 `'all' | 'previous' | 'custom'`，默认 `'all'`，previous 数量在 `trailPreviousFrames`（默认 10），custom 数值在 `trailRangeStart/trailRangeEnd`。当存在 saved groups 时，trail targets 是 `visible groups ∪ explicit extras`，与 live `selection` 解耦；所有 saved groups 被删除后才回退到 live selection。

典型交互：

```text
点击 tree branch
  → setSelection / selectLineage
  → selection Set 更新
  → tree、3D、cell list、CellInfo 同时重渲染
  → applyColor
  → cellColors 更新，可选创建显式 cellIds group
```

`toggleCells` 的批量语义是：如果传入 IDs 已全部选中则全部移除，否则全部添加，它只用于 Cell 级选择。`selectLineage` 的语义不同：lineage branch、Shift-click 和 CellList 的 lineage 按钮始终把 represented descendants union 到已有 selection，从不清空或 toggle 旧选择。已有 selection 时 `selectionMeta` 转为 manual，避免后续保存时误把混合选择标成单一 lineage。

`GroupPanel` 展开成员不再保存局部 marked state；每个 checkbox 直接读 `selection.has(cellId)` 并调用 `toggleCell`。因此树上选中的 lineage 会同时勾选 Cells list 和相应 group members，`Remove selected` 用 `group.cellIds ∩ selection` 删除，可从任何视图建立待删集合。

`GroupPanel` 还以 case-insensitive substring 过滤 group name；搜索结果计数为 `matched/total`。All/None 只把当前过滤后展示的 group 批量设为 visible/hidden，未命中的 group 不变。`setGroupsVisible` 使这次批量更新成为单个 Zustand transaction。

换帧不修改 `cameraCommand`。Reset/Focus/Angle 才递增 `nonce`。Angle 使用 `cameraOffsetFromAngles` 设置 azimuth/elevation，并由 `cameraUpFromAngles` 将 up-vector 绕当前视线旋转 roll：LR/Y 为基准 up，azimuth 0° 从 +VD 看、90° 从 +AP 看，elevation 限制为 ±89.9°；camera-target distance 保持，因此三个姿态角都不改变 zoom。±AP/±LR/±VD presets 使用 roll=0。

## 9. 颜色、分组和可见性优先级

颜色规则集中在 `getCellAppearance`，三类视图共用。优先级为：

```text
最近创建的 visible group 颜色
  > cellColors 中的持久颜色
  > 当前 selection 红色
  > 默认灰色
```

关键边界：

- 一个 cell 属于多个 visible groups 时，数组中最后一个 group 的颜色胜出。
- 一个 cell 属于至少一个 group、且它所属的所有 groups 都 hidden 时，它在所有 display modes 中都被隐藏。
- `Highlight`：visible group、selection 或有 assigned color 的 cell 不透明，其他为 `unselectedOpacity`。
- `Color groups`：着色/选择 cell 不透明，其他 opacity 为 0.62。
- `Isolate`：有 group 时只显示 visible groups；只有整个 `groups` 为空时，selection 才可单独显示。
- `Color by embryo` 只在 3D Overlay 中覆盖 cell/group 颜色；树和列表仍显示 cell/group 颜色，选中 nucleus 仍通过尺寸放大表达。

同色是 group identity 的用户级规则：`applyColor` 给两次不同 selection 分配相同颜色时会 union 到已有组；`setGroupColor` 撞到已有颜色时也会合并，并把 `trailGroupIds` 中被移除的 group id 重定向到保留组。`addCellsToGroup` 提供显式加入；`removeCellsFromGroup` 删除成员，空组自动删除。lineage group 被手工删减后必须转成 manual/root undefined，否则 analysis 的动态 lineage membership 会把被删 descendants 再补回来。任何 group mutation 如果改变了 visible group ID 集合，会将 Trails 的 extra IDs 重置为 `[]`；纯改名、改成员不会误触发重置。

颜色回收使用 `reconcileAffectedCellColors`：只重算受 group 改色、删成员或删除影响的 cells，因此关闭 “Save colored selection as a group” 得到的无关 standalone colors 不再被整表覆盖。重叠异色 groups 仍按数组中最后一个 visible group 决定显示色。

`src/utils/groupList.ts` 定义独立于 Session 的可读 `cexplore-group-list` v1。导出刻意省略内部随机 id、createdAt 和显示 settings，只保留 dataset/exportedAt 与 name/color/cells/visible/source/rootCell。导入先严格校验 format/version/hex color/cell array，再按当前 dataset 的 cell 名过滤；文件名不同和未知 cell 只产生提示，同色 entry 合并到已有组。这个格式适合人工检查、版本控制和跨同类数据集复用；完整 UI 状态恢复仍使用 Session JSON。

## 10. 3D 渲染实现

3D 使用 React Three Fiber：

- nucleus 共用一份低面数 sphere geometry；
- 当前帧按 opacity 分成 opaque/subdued 两个 `InstancedMesh`；
- 每帧更新 instance matrix 和 instance color，不为每个 nucleus 建独立 mesh；
- mesh capacity 使用整个 dataset 的 `maxObservationsPerFrame`，足够容纳 overlay 的最大帧；
- AP/LR/VD 映射到 Three.js X/Y/Z；
- OrbitControls 管旋转、平移、缩放和 damping；
- 标签通过 Drei `Html` 渲染；超过 160 个可见 observation 时只标 selection；
- 点击 instance 依靠 `instanceId` 反查 observation。

### 10.1 Trails 的目标、颜色与分裂连续性

`src/state/trails.ts` 将轨迹目标规则和 React 分离：

- 有 saved groups：默认合并当前 visible groups 的 explicit `cellIds`；DisplayControls 可逐个勾选 hidden groups 作为 extras，也可 All extras/Clear extras。清空 live selection、点 3D 空白区都不会使轨迹消失。
- 无 saved groups：为保留旧的即时探索路径，使用 live selection。
- group 的 `visible` 同时是 Trails 和 Projected motion 的基础选择；因此 visible checkbox 在两个 picker 中为锁定勾选，hidden group 仍可手工加为 extra。Cell groups 中 visible ID 集合一变，两处 extras 都清空，用户需要基于新 visible 集合重新勾选。
- 轨迹颜色取最后一个包含该 cell 的已选 trail group 颜色；Overlay + `Color by embryo` 时 embryo 颜色优先。
- 每个轨迹点使用 RGBA vertex color：`trailProgressAtStep` 把当前 trail window 归一化为 0–1；`trailVertexColor` 让 alpha 从 0.04 非线性增加到 1，同时从高明度/低饱和过渡到较深/高饱和，因此时间方向比单独改变透明度更明显。Drei `Line` 在 GPU 内插值这些通道，不增加逐 segment React object。
- `settings.trailWidth` 是持久化 display setting，DisplayControls 暴露 0.5–4 px slider，默认 1.1 px。宽度在每条 line 内保持一致；这是有意的性能取舍，避免在数百个 cells × 多 embryo 时为了逐段宽度变化成倍增加 draw calls。
- `resolveTrailStepRange` 负责显示范围：all 模式为 `[firstFrame, currentStep]`；previous 模式从有序 `frameValues` 截取包含当前帧的最后 N 个实际帧；custom 模式将 start/end 排序，取范围内首尾实际值，并以 `currentStep` 截断上界。播放尚未进入 custom range 时返回 `undefined`。

普通轨迹仍由 `getCellTrajectories` 在每个 `(embryoId, cellId)` 内连续连点。跨 cell ID 的分裂不在该 index 内，所以由 `getDivisionConnections` 另外补线：当 mother 和 child 都在 trail targets 中，将时间窗口内 mother 的最后观测连到 child 的最早观测。两个 daughters 各产生一条连线；Overlay 严格限于同一 embryo，Mean 则直接读取 Worker 预建的 cell trajectory cache，再以相同规则连接。Division line 的 mother/child 端点同样使用各自 step 的 alpha。这里不会额外做坐标插值，也不会把 target 以外的 mother/child 强行加入。

`TrailProjectionPanel` 和 Group analysis 是左侧中部上下排列的 36 px 纯图标入口（hover `title` 提示名称）。展开态都限定为 `grid-column: 1; grid-row: 1 / -1`，只覆盖 workspace 左列的 lineage/list 两行并在内部纵向滚动，不遮挡右侧 Spatial view。Projection z-index 15、Analysis z-index 14，都高于左侧基础 panel；关闭态不再占用左下颜色选择区域。

`trailProjection.ts` 默认对每个 selected group/step 求该帧所有显式 group cell observations 的 raw AP/LR/VD centroid，并直接输出三个轴坐标，不再以首个位置归零，也不插入 range-start 人工零点。Projection 的 group local state 只保存 hidden extras，实际 selected groups 复用 `resolveTrailGroups(groups, extras)` 得到 visible union extras；`visibleGroupKey` 变化的 effect 会清空局部 extras。Individual checkbox 打开后，组件对每个 explicit cell ID 单独计算；如果当前 frame observations 来自多个 displayed embryos，则同名 cell 先跨 embryo 求 mean。组件从 lineage model 找组内 parent/child，把 parent series 末点直连每个 daughter series 首点，因此两个 daughters 显示为 fork。

Multiple axis mode 中，每个 group×cell×axis 一条 path：stroke 取 group color；AP 为 solid；LR 使用 `stroke-dasharray="1 6"` 加 round linecap 形成圆点；VD 使用 `14 7` long dash。Single mode 用 radio 选择 AP/LR/VD，所有 series 和 fork connectors 强制 solid。x 以 range start 为 0；Time 和带 interval 的 Frame 显示 minutes，无 interval 的 Frame 显示 frame。

交互仍留在 `TrailProjectionPanel` local state，不进入 Zustand/Session：透明宽 hit paths 在 hover 时寻找该 series 最近 observation，显示 individual cell/group、axis、elapsed x 和 exact coordinate；pointer rectangle 与 wheel修改 x/coordinate display domain，clipPath 裁剪并可 Reset。`projectionSeriesToCsv` 导出当前选择的完整 Trails-range series（zoom 只改变视窗）以及 group/cell/axis/step/elapsed/unit/axis position/sample count。

### 10.2 DOM/WebGL overlay 层级

Drei `Html` labels 是覆盖在 canvas 上的 DOM，不是 WebGL sprite。当前层级合同是：

```text
Embryo panel stacking context: z-index 1; isolation: isolate
  └─ Drei Html labels: zIndexRange [3, 0]
Analysis drawer: z-index 14
App header / Open datasets trigger context: z-index 20
  └─ modal backdrop: z-index 100
```

因此 labels 无法跨出 embryo panel 压住 drawer 或 Open datasets modal。两个 drawer 展开后也只存在于左列，Spatial view 不依赖层级竞争即可保持完全可见。

Mean trajectory 原有的乘法型重复计算已移除：Mean nuclei、trails 和 division connections 共用同一个 Worker 预计算 cache。剩余成本主要是第一次选择/embryo list 改变时向 Worker structured-clone observations、后台线性聚合，以及大 group 实际提交给 WebGL 的 line 数量；这些不会再随每个播放 frame 重复执行。

## 11. Session 与兼容性

Session schema 当前固定 `version: 1`，保存：

- `datasetName`
- 第一 source 的顶层 `mapping`
- `cellColors`
- `groups`
- `settings`
- `activeEmbryoIds`

Session 不保存 analysis target、参数、运行结果或导出的 CSV。刷新页面会丢失分析结果；重新打开数据后必须再次 Run analysis。

导入前必须已有 dataset。代码按当前 `cellIds` 过滤颜色和 group，并按当前 embryo IDs 过滤 active embryos；dataset 名不同只 warning，不阻止导入。保存的 mapping 不会被重新应用或比较。

Session validation 是浅层的：只检查 version、groups 是数组、settings 存在。内部字段不合法时可能在 store import 阶段抛错并由 UI catch。多文件 dataset 名只是类似 `2 files`，所以它不是可靠身份标识。内部 embryo ID 依赖相同导入顺序（`source-1`, `source-2`）；改变文件顺序后 active embryo 恢复可能失效。

若要把 Session 做成长期稳定格式，应增加 schema validation、source fingerprints、每 source mapping、稳定 embryo identity 和 migration。

## 12. Group analysis 实现

完整统计公式和面向使用者的解释见 `docs/群体空间指标.md`。本节强调代码真实行为、生命周期和扩展边界。

### 12.1 Target 与动态成员

Analysis target 可以来自当前 selection 或 saved group：

- selectionMeta 是 `group` 时，重新找到原 saved group，保留其原始 `source/rootCell`；
- `source === 'lineage'` 且有 `rootCell` 时，分析沿 `parentByCell` 扫描所有后代，再与每帧实际 cell IDs 相交；
- `manual`、`cell` 和 `group` source 都只使用 explicit `cellIds`，不会自动跟随 division；
- connecting ancestor 可存在于 parent map，但没有 observation 就不会进入 frame group。

因此 lineage group 是“拓扑规则 + 当前帧存在性”，saved explicit IDs 只是可复现快照和起点。母细胞消失后，已出现的 daughters 会接替它；不存在的母细胞和未来后代不会同时计数。

### 12.2 最小计算单位与主流程

最小单位严格是一个 embryo 的一个真实 step：

```text
target snapshot + active embryo IDs + metrics/k/null
  → 从 embryoIndex 抽取原始 x/y/z 最小字段
  → structured clone 到 analysis.worker
  → 按 embryoId + NUL + step 分帧并排序
  → 动态 group membership ∩ frame cells
  → 当前帧全部 nuclei 建一张 symmetric kNN graph
  → observed metrics
  → 同一张 graph 上计算 local size-matched null groups
  → 一个 AnalysisPoint
  → GroupAnalysisResult → chart/table/CSV
```

Analysis 从不使用 `renderX/Y/Z`、mean observation 或 overlay 后的数组。所有 metric 基于每个 embryo 原始 AP/LR/VD。不同 embryo 的 metric 只在计算结束后做 median/IQR 等汇总。

`groupFrames` 会为选中 embryo 中每个有任意 observation 的 step 建 row；即使 group size 为 0 也保留。进度每完成 4 个 frame 或最后一个 frame报告一次。

### 12.3 Symmetric kNN 与四项指标

`buildSymmetricKnnGraph` 对每个 nucleus 找 k 个最近邻，只要 `i → j` 或 `j → i` 任一成立，就在无向图保留 `i—j`。有效 k 会 clamp 到 `0...n-1`，距离并列时按 frame array index 打破平局。实现扫描全部 pair，但只维护长度 k 的 nearest list，适合当前很小的 k。

四项 metric 为：

- `purity = 2E_internal / (2E_internal + E_boundary)`；单 cell 且无 incident edge 返回 0，其他无可用 edge 情况返回 null；
- `connectedness = largest induced-group component size / group size`；单 cell 定义为 1；
- `compactness = radius of gyration / 当前 embryo-step 全部 nuclei 的 AP span`；AP span 为 0 时返回 null；
- `shape = (λ1 - λ3) / λ1`，λ 来自 group 原始坐标 population covariance 的 3×3 Jacobi eigenvalue；少于 2 cells 或 λ1 近 0 时为 null。

Shape 的定义会让细线和薄平面都接近 1；必须结合导出的 `λ1/λ2/λ3` 才能区分 elongation 与 flatness。Compactness 只除以 AP span：对三轴统一缩放不变，但对 axis-specific scaling、未注册 embryo 或 AP span 异常敏感。

### 12.4 Local size-matched null

每个 embryo-step 独立构造 null：

1. 求 observed group centroid；
2. 用该帧各轴 span 标准化到 centroid 的平方距离；
3. 候选池大小为 `min(total, max(4n, n+8, 24))`；
4. 从候选池无放回抽 n 个 cell；
5. 在同一 kNN graph 上计算相同指标；
6. UI 可选 50/100/250 次，固定基础 seed 1729，再与 `hash(embryoId:step)` XOR。

所以相同 request 可重复。候选池包含 observed group cells，random group 可与真实 group 重叠；它只局部匹配 size/region，不保持跨时间 identity、lineage、division history、fate 或初始形态。

输出使用 population null SD：

```text
z = (observed - nullMean) / nullSd
percentile = (1 + count(null <= observed)) / (validNullCount + 1)
```

Percentile 始终是 lower-tail empirical percentile，不按 metric 的 favorable direction 翻转，也不是双侧 p-value。Compactness 更紧凑对应负 z/低 percentile；其他指标的正 z 只表示数值高于 null。

### 12.5 Low-n、warnings 与实际展示

`minimumGroupSize` 当前固定为 4，但只生成 `eligible` flag：

- group size 1–3 仍计算 metric 和 null；
- 时间图、当前 cohort summary、Across-time median 和 descriptive insight 目前都不会过滤 `eligible === false`；
- CSV 用 `minimum_n_pass` 暴露该标记；解释时必须由使用者过滤或谨慎处理；
- group size 0 不计算 metric，但 row 仍导出。

Runner 还会警告：所有帧都没有 group、没有任何 eligible frame、AP span 为 0，以及某些帧 group 等于整个 embryo。Purity 在“整个 embryo 都属于 group”时缺少外部对照，即使数值可能为 1。

### 12.6 Worker 与任务生命周期

`startGroupAnalysis` 每次创建一个 module Worker。request 通过 structured clone 发送，Worker 同步运行纯函数并回传 progress/result/error；成功或错误后 terminate。没有 Worker 的测试环境使用 `setTimeout(0)` fallback，此时真正计算仍在主线程。

当前 UI 没有 Cancel 按钮，运行时 Run disabled；收起 drawer 不会取消任务。AnalysisPanel unmount 会 terminate 当前 Worker。真实 Worker 的 `cancel()` 只 terminate、不 resolve/reject 原 promise，所以旧 promise 会保持 pending，但 `jobRef` identity 防止旧任务结果写回当前 UI。

计算复杂度主要来自每 embryo-step 的全 pair kNN（约 O(n²k)）和每个 null sample 对同一 graph 重算所选 metric。Null 不重建 kNN 是关键优化；Worker 保证 UI 不被 CPU 循环直接阻塞，但 structured clone 仍会复制本次 active embryos 的 observation payload。

### 12.7 Result、stale 与可视化语义

Result fingerprint 包含 target ID/cells/source/root、active embryos、metric set、k 和 null sample；不包含 target name/color，因为 rename/recolor 会直接更新 result metadata。输入变化不会自动计算，只显示 stale 提示并保留旧结果。

需要注意，fingerprint 也不包含 dataset identity。替换 dataset 时 AnalysisPanel 的本地 state 可能继续存在，通常因 selection 被清空而显示 stale，但旧结果仍可见和导出；后续应在 dataset identity 变化时显式 cancel/clear result，或把 dataset fingerprint 加入 key。

展示层语义：

- Current summary：当前 exact step 的跨 embryo median、25%/75% quantile 和有效值 n；
- Trend chart：每个 exact step 单独做跨 embryo median/IQR，无插值；点击跳主时间轴最近 step；
- Now table：当前 exact step 每 embryo 的 group size 和 raw metric；
- Across time：每 embryo 在 `groupSize > 0` 的 frames 上取 raw metric median，`n` 是出现帧数；
- 表格深浅色只是本次 embryo 集合内 raw value 的相对排序，shape 的“高”不天然等于生物学更好；
- Descriptive readout：先取每 embryo 的跨时间 median z，再在有 valid z 的 embryos 中判断是否至少 60% 超过 `|z| > 1` 的预设方向；它不检查 low-n eligibility，也不是显著性结论；
- CSV：一行一个 embryo-step，只输出被选 metric，Shape 额外输出三个 eigenvalues，并正确转义逗号/引号/换行。

## 13. 预留 API 与当前未使用路径

`createExplorerDataApi` 暴露 `getGroupCells/getGroupPositions/getCellTrajectory/getDescendants`，但当前仍没有调用方。新的 analysis 层没有使用它，而是直接从 `dataset.embryoIndex` 和 lineage model 构造强类型 Worker request。

旧 API 的 trajectory 会跨所有 embryos 合并，group positions 也返回某 step 的所有 embryo observations，因此不适合作为当前 per-embryo metric 的无修改入口。保留或扩展它之前应先确定 API 的 embryo/view-mode 语义。

`loadDataset` 是单文件 convenience wrapper；主 UI 走 `loadMappedRows + buildDatasetFromRows` 多文件流程，目前没有调用方。

## 14. 已验证内容与测试缺口

在 Node 22.14.0 / npm 10.9.2 下：

- `npm test`：24 个 test files、67 个 tests 全部通过；
- `npm run build`：TypeScript strict build 和 Vite production build 通过；
- production build 包含独立 `meanPosition.worker`（约 1.4 KB）和 `analysis.worker`（约 6.8 KB）chunks；
- canonical 表：1,341 unique IDs、1 root、0 missing parent refs、0 cycles；
- build 唯一告警仍是主 JS 超过 Vite 默认 500 KB chunk 提示；XLSX、Mean worker 和 analysis worker 已分别拆分。

新增测试覆盖：visible-base + hidden-extra Trail/Projection 解析、visible 变更清空 extras、group-name 过滤及对当前结果批量 All/None，超过 10 万行的多 embryo 累积不再触发 spread argument/call-stack 溢出、可关闭 import warning、默认 185/All import、union-time frame sampling、hold-last、短暂 cell coverage、All-import Mean exact/hold 缓存、tree/list/group-member checkbox 双向同步、direct axis positions、无人工零点、single-axis solid、zoom、individual tooltip/forks 和 projection CSV，以及 lineage additive selection、同色 group 合并、显式成员增删、可读 group-list round trip/校验/导入、完整 camera azimuth/elevation/roll、previous-N trail range、lineage-aware dynamic membership、synthetic purity/LCC/normalized-Rg/shape、per-embryo frame isolation、deterministic null、analysis CSV schema/escaping、trail 时间渐变、Overlay/Mean mother→daughter connections、unique-time 升序帧索引、frame interval minute 纵轴，以及 partial-stage 起点对齐。原有 mapping、analysis、3D 周边交互和 timeline 测试继续通过。

此前在引入 frame sampling 前，真实 326 MB `01_wt_truncated_axis_aligned.tsv` 曾以 Time/All 等价路径跑通：`ctr_emb1` 保留 20,926/20,926 个有效 observations，识别 185 个升序 time frames（range 1–185）、722 cells、0 warnings；lineage y 轴从第一个 observed value `1` 开始。当前默认 Sample 185 路径已有 synthetic integration test，但尚未对这份 326 MB 文件重新做真实浏览器性能验收。

明显测试缺口：

- 浏览器中真实 module Worker 的消息、进度、错误和 termination 路径；
- Analysis result stale/dataset replacement、运行中改变输入和 malformed result；
- AnalysisTrendChart 点击、缺 step、单 step 和极端数值；
- low-n 是否应进入 chart/summary/insight 的产品语义；
- kNN ties、重复坐标、极小 frame、whole-embryo group、zero AP span 和 null SD=0 的完整边界；
- 大数据 structured-clone、O(n²) kNN 和 250 null samples 的性能/内存基准；
- XLS/XLSX worksheet 实际导入、Session malformed input/迁移、多文件 identity；
- supplied parent conflict/cycle，以及 Sample/All + Mean hold 在大型多 embryo Worker payload 下的性能；
- WebGL 中实际 trail/division line 渲染、labels/drawer/modal 层级、收起标签的实际占位、窄/矮 viewport 和可访问性的真实浏览器验收；CSS 仍要求 `body min-width: 1040px`。

本次没有运行 `validate:analysis`（它用于验证指定 embryos 的 ABpl/MS/C analysis）。当前环境没有提供浏览器控制执行接口，因此视觉交互结论来自源码、jsdom 和 production build。

## 15. 后续功能应该改哪里

| 需求 | 首选位置 | 同时关注 |
|---|---|---|
| 新文件格式/列别名 | `src/data/loaders.ts`, `columnMapping.ts` | `types.ts`, loader tests |
| 数据校验/去重策略 | `src/data/frameIndex.ts` | 三类 index、warning、parent conflict |
| Time/Frame 映射或 interval | `src/data/columnMapping.ts`, `ColumnMapper.tsx` | `types.ts`、多文件一致性、lineage axis |
| 抽帧数量/覆盖/缺帧保持 | `src/data/frameSampling.ts`, `FileLoader.tsx` | 多文件 union steps、下游 index/metric 语义、内存峰值 |
| embryo 配准/变换 | 新建 registration/analysis 纯函数 | raw 与 render 坐标、metric denominator |
| 新 overlay/consensus 规则 | `src/data/embryoView.ts` | trails、CellInfo、与 analysis 独立性 |
| 谱系解析/自定义 parent | `src/lineage/lineageResolver.ts` | cycle/conflict、dynamic membership |
| 树的时间和布局 | `src/lineage/lineageTree.ts` | active embryo vs global timing |
| 新 selection/group 行为 | `src/state/explorerStore.ts` | `GroupPanel.tsx`、`state/trails.ts`、Trail/Projection extras reset、Analysis target source/root 语义 |
| 新显示模式 | `cellAppearance.ts` | 3D opacity 分桶、tree/list CSS |
| 3D geometry/interaction | `src/components/Embryo3D.tsx` | `embryoView.ts` division connectors、InstancedMesh、Mean Worker cache |
| Overlay 层级/drawer 占位 | `src/styles.css` | Drei `Html.zIndexRange`、stacking context、modal |
| 新空间指标 | `analysis/types.ts`, `groupMetrics.ts` | runner、result utils、chart、CSV、synthetic test |
| 新 null model | `analysis/runAnalysis.ts` | deterministic seed、候选池、统计解释 |
| 分析任务调度/cache | `analysisService.ts`, `AnalysisPanel.tsx` | cancellation、dataset fingerprint、Worker payload |
| 分析展示 | `AnalysisPanel.tsx`, `AnalysisTrendChart.tsx` | exact-step、low-n、cohort n、direction |
| Session 稳定化 | `utils/session.ts`, `explorerStore.ts` | schema/migration/source identity、是否保存分析配置 |

继续保持“纯计算先行”：membership、geometry、null、summary 写成不依赖 React/DOM 的纯函数并用小型可解释几何测试；runner 只做编排；Worker 只做传输；组件只处理 snapshot、job lifecycle 和展示。

## 16. 修改前的快速检查清单

1. 功能语义是 entire dataset、active embryos、单 embryo、overlay，还是 mean？Analysis 当前固定为 active embryos 各自独立。
2. 使用原始 AP/LR/VD 还是 render 坐标？现有 metric 全部使用原始坐标。
3. `frame` 指 array index 还是 authoritative step value？store 使用 index，dataset/service/analysis row 使用原 step value，只有 lineage frame axis 使用 `step × intervalSeconds`。
4. 时间来自 All exact grid 还是 Sample grid？Sample 已把上一完整 embryo frame 固化为目标 step；All 的 analysis 仍 exact-only，只有 Mean 可选 hold-last。两者都不做坐标线性插值或 nearest-time pooling。
5. Group 是 explicit 还是 lineage-dynamic？只有 `source === 'lineage'` 自动补后代。
6. Low-n 是只标记还是排除？当前只标记，UI 汇总也包含。
7. 新 metric 的数值方向、null percentile、CSV 字段和 descriptive wording 是否一致？
8. 是否保持 parent override 全局语义，还是需要 embryo-specific lineage？
9. 新状态是否应进 Zustand/Session？Analysis result 当前只在组件本地。
10. dataset/group/embryo/parameter 改变时，旧结果应清除、标 stale 还是可复用？
11. Worker 是否可取消，payload/结果是否值得 cache 或使用 transferable/增量索引？
12. 是否会破坏 group overlap、hidden group、standalone color 或播放相机稳定性？
13. Trails 的 visible-groups + hidden-extras 规则是否还需要其他 preset？是否需要跨 division cell ID？目前有 groups 时不读 live selection，且只连接 target 内的 mother/child。
14. 新增 cell 是否只在短时间存在？修改 sampling 后必须验证 requested frame target 之外的 coverage frame 规则。
15. 至少运行 `npm test` 和 `npm run build`；涉及 WebGL、Worker 或 drawer 布局时再做真实浏览器验收。
