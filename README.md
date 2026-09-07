# C. elegans Lineage Explorer Lite

A lightweight local browser application for exploring *C. elegans* embryonic cell lineage together with frame-resolved 3D nuclear positions. The lineage tree, 3D embryo, cell list, colors, and saved groups all use one shared selection state.

中文文档：

- [开发与实现说明](docs/开发与实现说明.md)
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

Required mappings are cell ID/name, AP, LR, and VD. Time, frame, parent cell, and embryo/sample ID are optional. If both time and frame exist, choose which one controls playback. With no temporal column the spatial data is shown as one static state and the tree uses the built-in canonical developmental-time table.

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

- Drag, right-drag, and scroll in the 3D view to rotate, pan, and zoom. The camera remains unchanged during playback; Reset and Focus move it only when explicitly clicked.
- Open **Embryos** in the 3D header to show any subset of imported embryos. Use **Overlay** for their individual nuclei, **Mean position** to average each available cell across the checked embryos, or **Color by embryo** to distinguish overlaid embryos.
- Play/pause, step, scrub the authoritative observations, and select 0.25×–4× playback speed. Positions are not interpolated.
- Pan and zoom the classical SVG lineage tree. Vertical segments are cell lifetimes and horizontal segments are divisions. The y-axis uses uploaded time/frame, or canonical minutes when neither is supplied. The first six lineage levels are labeled; hover later branches for names. Choose **Cell** or **Lineage** click mode; Shift-click selects descendants and Command/Control-click adds or removes cells/lineages from the current selection.
- Search or check multiple cells in the cell list. Its lineage button selects the cell plus represented descendants.
- Choose a palette color after selecting cells. The same persistent color is applied to 3D nuclei, list markers, and lineage branches. “Save colored selection as a group” is enabled by default.
- Rename, recolor, show/hide, select, focus, or delete saved groups in the **Cell groups** tab.
- Use **Color groups**, **Highlight**, or **Isolate** display mode. Several visible groups can be shown together.
- Turn on trails for selected cells and choose 5, 10, 25, or all previous frames. Labels and AP/LR/VD axes are optional.
- Hover or click a nucleus to see original coordinates, parent, ancestors, and represented-descendant count.
- Export/import a small session JSON containing mapping, groups, colors, and display settings. The source dataset itself is not duplicated.

## Architecture

```text
src/
  data/          multi-file inspection/loading, validation, embryo views, frame/trajectory indexes
  lineage/       canonical table adapter, resolver, descendants, static tree layout
  state/         shared Zustand state, groups, colors, playback, cell appearance
  components/    loader, mapper, SVG tree, instanced 3D view, lists, controls, info
  services/      clean query API for future quantitative work
  utils/         palette, formatting, session helpers
```

The canonical adapter reads the repository-local `src/lineage/data/complete_embryo_lineage_list.csv` and explicitly safeguards asymmetric early relationships (`P0/P1/P2/P3/P4`, `AB`, `EMS`, `MS`, `E`, `C`, `D`, `Z2`, and `Z3`). It never infers a parent by blindly deleting the last character. A supplied parent column overrides or supplements the table. Unknown cells remain spatially visible and are marked unresolved.

`createExplorerDataApi` exposes `getGroupCells`, `getGroupPositions`, `getCellTrajectory`, and `getDescendants` without coupling future metrics to React components.

## Coordinate and data behavior

Original coordinates are retained for inspection. Rendering subtracts the global center and applies one uniform scale based on the largest axis span, preserving anisotropy rather than stretching axes independently. The mapper and viewer label the three coordinates AP/LR/VD. CeXplore does not infer orientation or flip signs: the user must map columns whose meanings and signs already match those biological axes.

Missing IDs, invalid coordinates/time values, and duplicates create import warnings. Invalid rows are skipped; for a duplicate cell within the same embryo and time/frame, the last valid observation wins. Cells may appear or disappear between frames. Playback always displays supplied observations, with no interpolation. Mean mode averages only embryos in which that cell has an observation at the current time.

## Current limitations

- Files combined in one import must use the same temporal mode, and their time/frame values must already be comparable.
- Multi-embryo overlays and means assume the coordinates are already registered to a common AP/LR/VD system; CeXplore does not perform embryo registration.
- Canonical lineage coverage is limited to the supplied table; novel names need an explicit parent to resolve.
- Tree branches use represented-cell birth/division times where they are observed. In an uploaded time/frame view, a missing connecting ancestor is placed one observed step before its earliest child; with no temporal column the canonical minute clock is used directly. This remains an exploratory view, not embryo-specific lineage-time calibration.
- XLSX parsing loads the selected workbook into memory, while CSV/TSV parsing is streamed.
- Labels are capped to selected cells when a frame contains more than 160 nuclei to protect interaction speed.
- Overlapping groups use the most recently created visible group’s color for shared cells.
- Session import expects the source dataset to be loaded first and stores no source observations.

## Planned extensions

The data/service boundary is ready for group cohesion, neighborhood purity, connectedness, distance, motion-correlation, and symmetry metrics; custom lineages and annotations; subset export; and later embryo registration, variability envelopes, consensus timing, and perturbation comparison. None of those quantitative analyses are implemented in this version.
