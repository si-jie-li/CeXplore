# C. elegans Lineage Explorer Lite

A lightweight local browser application for exploring *C. elegans* embryonic cell lineage together with frame-resolved 3D nuclear positions. The lineage tree, 3D embryo, cell list, colors, and saved groups all use one shared selection state.

中文文档：

- [开发与实现说明](docs/开发与实现说明.md)
- [项目深度理解 4AI 与后续开发地图](docs/项目深度理解4AI.md)
- [用户使用指南](docs/用户使用指南.md)

## Install and run

Node.js 20.19+ or 22.12+ is recommended.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173`). Data stays in the browser; no backend or database is used.

Other useful commands:

```bash
npm test
npm run build
npm run preview
```

## Input data

Supported formats:

- CSV
- TSV or other consistently delimited text
- XLS/XLSX (choose a worksheet during column mapping)

Required mappings are cell ID/name, AP, LR, VD, and either Time or Frame. Parent cell and embryo/sample ID are optional. If both temporal columns exist, choose which one controls playback. For Time input, equal numeric time values form one frame, unique values are played in ascending order, and values are interpreted as minutes on the lineage tree. For Frame input, enter the seconds represented by one frame; the lineage-tree y-axis displays `(frame × interval seconds) / 60` in minutes.

Select one or several files in the file dialog. Each file is mapped in sequence. When an **Embryo / sample column** is mapped, CeXplore scans its distinct IDs and presents checkboxes; only checked embryos are retained. A file without an embryo column is treated as one embryo named after that file. Large CSV/TSV files are scanned in a Web Worker rather than loaded wholesale into memory.

Example:

```csv
cell_name,frame,AP,LR,VD,parent
P0,0,0,0,0,
AB,1,1.2,0.4,0.1,P0
P1,1,-1.1,-0.3,-0.1,P0
ABa,2,1.8,1.0,0.3,AB
ABp,2,1.5,-0.5,-0.2,AB
```

Use **Explore example** on the opening screen to load the bundled dataset at `public/examples/synthetic_lineage.csv`. For the supplied research table, the mapper automatically suggests:

- Cell: `cell_name`
- Coordinates: `A_pos`, `L_pos`, `D_pos`
- Time: `time`
- Embryo filter: `embryo_id` (all IDs are listed; check one or several)

## Main interactions

- Drag, right-drag, and scroll in the 3D view to rotate, pan, and zoom. Open **Angle** to enter exact azimuth/elevation/roll degrees or jump to ±AP/±LR/±VD orthogonal views while preserving the current focus target and zoom distance. Roll rotates the image around the current viewing direction. The camera remains unchanged during playback; Reset, Focus, and Angle move it only when explicitly requested.
- Open **Embryos** in the 3D header to show any subset of imported embryos. Use **Overlay** for their individual nuclei, **Mean position** to average each available cell across the checked embryos, or **Color by embryo** to distinguish overlaid embryos. The first Mean selection precomputes every frame in a Web Worker; playback, mean trails, and division links then read cached frame/trajectory indexes. Changing the embryo list invalidates and rebuilds that cache.
- Play/pause, step, scrub the authoritative observations, and select 0.25×–4× playback speed. Positions are not interpolated.
- Pan and zoom the classical SVG lineage tree. Vertical segments are cell lifetimes and horizontal segments are divisions. The y-axis is in minutes: Time input uses the uploaded minute values, while Frame input converts its seconds-per-frame interval to minutes. For a dataset beginning after fertilization, the axis starts at the first observed branch instead of inventing earlier times. The first six lineage levels are labeled; hover later branches for names. Choose **Cell** or **Lineage** click mode. Cell clicks replace the selection unless Command/Control is held; lineage clicks and Shift-clicks always add represented descendants to the existing selection.
- Search or check multiple cells in the cell list. Its lineage button adds the cell plus represented descendants without clearing the current selection.
- Choose a palette color after selecting cells. The same persistent color is applied to 3D nuclei, list markers, and lineage branches. “Save colored selection as a group” is enabled by default, and assigning the same color again merges the new cells into the existing same-color group.
- Rename, recolor, show/hide, select, focus, or delete saved groups in the **Cell groups** tab. Add the current selection to a group, expand its readable member list, remove checked members, and import/export portable group-list JSON files.
- Use **Color groups**, **Highlight**, or **Isolate** display mode. Several visible groups can be shown together.
- Turn on trails for saved cell groups (all groups and all previous frames by default), choose exactly which groups to show, and retain trails after clearing the live selection. Keep **All previous**, show the previous user-entered N frames, or enter an explicit start/end frame (start/end time for Time data); future points are never revealed before playback reaches them. The compact icon tabs for **Group analysis** and **Projected motion** sit vertically at the middle-left; hover for their names. Either drawer expands only across the left lineage/list column, leaving Spatial view unobstructed. In Projected motion, group color identifies the population, while solid/dotted/long-dash lines identify AP/LR/VD. Groups and axes can be filtered independently. Time data and interval-scaled Frame data use minutes, while displacement uses source pixels. Old/distant trail points are nearly transparent, pale, and desaturated; they become opaque, darker, and more saturated toward recent/current time.
- Hover or click a nucleus to see original coordinates, parent, ancestors, and represented-descendant count.
- Expand **Group analysis** to calculate selected metrics only when requested. Each selected embryo/time is measured independently with a symmetric kNN graph. The panel shows cohort median/IQR time trends, current and across-time embryo tables, local size-matched random-group comparisons, and full CSV export.
- Export/import a small session JSON containing mapping, groups, colors, and display settings. The source dataset itself is not duplicated.

## Architecture

```text
src/
  data/          multi-file inspection/loading, validation, embryo views, frame/trajectory indexes
  analysis/      dynamic lineage membership, kNN metrics, matched null, Worker, CSV summaries
  lineage/       canonical parent adapter, resolver, descendants, SVG tree layout
  state/         shared Zustand state, groups, colors, playback, cell appearance
  components/    loader, mapper, SVG tree, instanced 3D view, lists, controls, info
  services/      clean query API for future quantitative work
  utils/         palette, formatting, session helpers
```

The canonical adapter reads the repository-local `src/lineage/data/complete_embryo_lineage_list.csv` and explicitly safeguards asymmetric early relationships (`P0/P1/P2/P3/P4`, `AB`, `EMS`, `MS`, `E`, `C`, `D`, `Z2`, and `Z3`). It never infers a parent by blindly deleting the last character. A supplied parent column overrides or supplements the table. Unknown cells remain spatially visible and are marked unresolved.

`createExplorerDataApi` exposes `getGroupCells`, `getGroupPositions`, `getCellTrajectory`, and `getDescendants` without coupling future metrics to React components.

## Coordinate and data behavior

Original coordinates are retained for inspection. Rendering subtracts the global center and applies one uniform scale based on the largest axis span, preserving anisotropy rather than stretching axes independently. The mapper and viewer label the three coordinates AP/LR/VD. CeXplore does not infer orientation or flip signs: the user must map columns whose meanings and signs already match those biological axes.

Missing IDs, invalid coordinates/time values, and duplicates create import warnings. Invalid rows are skipped; for a duplicate cell within the same embryo and uploaded time/frame, the last valid observation wins. Cells may appear or disappear between frames. Playback always displays supplied observations, with no interpolation. Mean mode averages only embryos in which that cell has an observation at the current time.

## Current limitations

- Files combined in one import must use the same temporal mode, their time/frame values must already be comparable, and Frame files must use the same interval.
- Multi-embryo overlays and means assume the coordinates are already registered to a common AP/LR/VD system; CeXplore does not perform embryo registration.
- Canonical lineage coverage is limited to the supplied table; novel names need an explicit parent to resolve.
- Tree branches use represented-cell birth/division values where they are observed. Missing connecting ancestors are collapsed onto their first observed descendant, so a partial-stage dataset begins at its first represented branches. This remains an exploratory view, not embryo-specific lineage-time calibration.
- XLSX parsing loads the selected workbook into memory, while CSV/TSV parsing is streamed.
- Labels are capped to selected cells when a frame contains more than 160 nuclei to protect interaction speed.
- Overlapping groups use the most recently created visible group’s color for shared cells.
- Session import expects the source dataset to be loaded first and stores no source observations.
- Group metrics are exploratory. The current null matches group size and local spatial region separately at each time; it does not preserve a random lineage through time, match division history, or perform multiple-testing correction.

## Planned extensions

The first analysis layer now provides neighborhood purity, largest-component connectedness, AP-normalized radius of gyration, covariance-shape anisotropy, and local matched-null summaries. Planned extensions include persistent-lineage nulls, motion correlation, bilateral symmetry metrics, custom lineages and annotations, subset export, embryo registration, variability envelopes, consensus timing, and perturbation comparison.
