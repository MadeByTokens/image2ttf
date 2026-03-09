# image2ttf

Convert a photo of handwritten characters into a working TrueType font (.ttf) — entirely in the browser. No server, no uploads, no account required.

**Live demo:** [madebytokens.github.io/image2ttf](https://madebytokens.github.io/image2ttf/)

## What it does

1. You write letters on paper in a grid layout (a-z, A-Z, 0-9, punctuation)
2. You take a photo or scan and upload it
3. The app auto-detects the grid, traces each character into vector outlines, and builds a real TTF font you can download and install

Everything runs client-side using Web Workers. Your image never leaves your browser.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173/image2ttf/
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Run tests + production build |
| `npm run test` | Run vitest (54 tests) |
| `npm run test:watch` | Run vitest in watch mode |
| `npm run test:coverage` | Tests + v8 coverage report (text + HTML) |
| `npm run deploy` | Run tests + build + publish to GitHub Pages |

Both `build` and `deploy` include a test gate — the build fails if any test fails.

## Stack

| Layer | Technology |
|---|---|
| UI framework | Svelte 5 (runes: `$state`, `$derived`, `$effect`) |
| Bundler | Vite 6 |
| Styling | Tailwind CSS v4 |
| Font generation | opentype.js |
| Bitmap-to-vector tracing | imagetracerjs |
| Testing | Vitest + jsdom + node-canvas |
| Deployment | GitHub Pages via gh-pages |

Zero backend. The entire app deploys as a static site.

## User-facing pipeline

The app is a 5-step wizard:

| Step | Component | What happens |
|---|---|---|
| 1. Upload | `Upload.svelte` | Load image. Pan/rotate/zoom viewer with mode toggle. Rotation is applied to canvas pixel data. |
| 2. Detect | `GridOverlay.svelte` | Auto-detect character grid from pixel density analysis. Full manual editing: drag cell edges, drag baselines, right-click context menus for add/delete/split/relabel. Advanced panel exposes 6 detection parameters. |
| 3. Characters | `CharMap.svelte` | Map detected cells to characters. Editable labels with thumbnails. Space width slider (20-150% of avg lowercase width). |
| 4. Preview | `Preview.svelte` | Trace all glyphs via imagetracerjs. Smoothness slider (1-10). Glyph gallery with SVG inspection, retrace, delete. Kerning pair editor. Live font preview using `@font-face` blob URLs. |
| 5. Generate | `Generate.svelte` | Build final TTF with opentype.js + manual kern table injection. Download. |

## Architecture

### Directory structure

```
src/
  lib/                          # Core logic (no DOM, testable)
    constants.js                # Font metrics, grid detection defaults, DEFAULT_CHARSET
    store.svelte.js             # Global state (appState), setError, resyncCharMap
    segmentation.js             # Grid detection: detectRows, detectColumns, autoDetectGrid, cropCell
    tracing.js                  # imagetracerjs wrapper, SVG→opentype path conversion, winding fix
    glyph-utils.js              # Shared: computeGlyphWidth, computeSpaceWidth, traceCell
    pipeline.js                 # Full tracing pipeline: runTracing(grid, charMap, canvas, ...)
    font-builder.js             # createFont, buildGlyph, injectKernTable, buildKernPairs, downloadFont
    redetect-columns.js         # Shared baseline-aware column re-detection
    compute.js                  # Web Worker manager with async API and main-thread fallback
    compute-worker.js           # Worker thread: grid detect, thumbnails, tracing
    logger.js                   # Structured debug logging (localStorage toggle)
    errors.js                   # Custom error classes: ImageLoadError, GridDetectionError, etc.
  components/
    Wizard.svelte               # Step navigation
    Upload.svelte               # Image upload + pan/rotate/zoom viewer
    GridOverlay.svelte           # Grid detection + manual editing canvas
    CharMap.svelte              # Character label mapping + thumbnails
    Preview.svelte              # Tracing orchestration + font preview
    GlyphGallery.svelte         # Glyph grid with SVG rendering + inspector
    KerningEditor.svelte        # Kerning pair editor with sliders
    Generate.svelte             # Font generation + download
    ProgressBar.svelte          # Reusable progress indicator
    ThemeToggle.svelte          # Light/dark/system theme switch
    grid/
      ContextMenu.svelte        # Right-click menu for grid editing
      AdvancedPanel.svelte      # Detection parameter sliders
tests/
  setup.js                     # Polyfills: node-canvas ImageData + createCanvas
  validate-font.js             # Standalone TTF validator (manual use)
  unit/
    segmentation.test.js        # Synthetic grid detection tests
    tracing.test.js             # Trace + SVG→opentype conversion tests
    font-builder.test.js        # Font creation + TTF round-trip tests
    font-builder-kern.test.js   # Kern table injection round-trip tests
    pipeline.test.js            # Full tracing pipeline tests
    glyph-utils.test.js         # Glyph width + space width + traceCell tests
    errors.test.js              # Custom error class tests
    e2e-font-png.test.js        # End-to-end: image → detect → trace → TTF → render → IoU compare
```

### Data flow

```
Image (canvas pixels)
  → autoDetectGrid(imageData, opts)        → { rows, cells[][] }
  → cropCell(canvas, cell)                 → { imageData, trimRect, empty }
  → traceGlyph(imageData, opts)            → SVG path strings (dark fills only)
  → svgPathToOpentypePath(paths, w, h, em) → opentype path commands (Y-flipped, scaled, winding-fixed)
  → cleanupPaths(commands)                 → noise-filtered commands
  → computeGlyphWidth(commands)            → advance width
  → createFont(glyphMap)                   → opentype.Font
  → font.toArrayBuffer()                   → TTF binary
  → injectKernTable(buffer, pairs)         → TTF binary with kern table
  → Blob → download
```

### Web Workers

All heavy computation runs off the main thread:

- **Grid detection** — pixel density row/column analysis
- **Thumbnail generation** — cropping cells for CharMap preview
- **Glyph tracing** — imagetracerjs + path conversion for all characters

`compute.js` manages the worker lifecycle. If Worker creation fails (e.g., in restricted environments), it automatically falls back to main-thread execution. All operations support abort via `abortCompute()`.

### Global state

`store.svelte.js` exports a single `appState` object (Svelte 5 `$state` rune):

```js
appState = {
  currentStep,        // 0-4 wizard step
  uploadedImage,      // HTMLImageElement
  imageCanvas,        // HTMLCanvasElement (rotated source)
  grid,               // { rows, cells[][] }
  charMap,            // string[] — flat array of character labels
  glyphPaths,         // Map<string, {commands, width}>
  spaceWidthPercent,  // 20-150 (default 60)
  smoothness,         // 1-10 (default 5)
  kerningPairs,       // { "AV": -80, "To": -40, ... }
  fontName,           // string
  generatedFont,      // opentype.Font
  isProcessing,       // boolean
  progress,           // current progress count
  progressTotal,      // total items
  error,              // string | null (auto-clears after 5s)
  theme,              // 'light' | 'dark' | 'system'
}
```

### Font metrics

| Constant | Value | Purpose |
|---|---|---|
| `EM_SQUARE` | 1000 | Font units per em |
| `ASCENDER` | 800 | Ascent line |
| `DESCENDER` | -200 | Descent line |

### Kern table injection

opentype.js cannot serialize kern or GPOS tables. `injectKernTable(buffer, pairs)` manually builds a TrueType kern table (version 0, format 0) and splices it into the SFNT table directory:

1. Build kern subtable binary: header (4 bytes) + subtable header (14 bytes) + pairs (6 bytes each)
2. Sort pairs by `(leftGlyphIndex << 16) | rightGlyphIndex`
3. Compute binary search fields (searchRange, entrySelector, rangeShift)
4. Insert a new 16-byte table record into the SFNT directory
5. Shift all existing table offsets by 16 to accommodate the new record
6. Append kern data at the end of the buffer

## Key gotchas for contributors

### imagetracerjs color filtering

imagetracerjs with `numberofcolors: 2` outputs paths for both black (ink) and white (background). You must parse the SVG output and filter by fill brightness:

```js
const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
if (brightness < 128) { /* keep — this is ink */ }
```

Without this, glyphs appear hollow/inverted.

### TrueType winding direction

TrueType uses Y-up coordinates. The trapezoidal signed area formula gives:
- **Negative** = clockwise (CW) — used for outer contours (filled regions)
- **Positive** = counter-clockwise (CCW) — used for inner contours (holes)

`fixWinding()` in `tracing.js` uses point-in-polygon containment testing (not just area comparison) to correctly handle multi-component glyphs like `i`, `j`, `!`, `:`, `%`.

### Uniform glyph scaling

All glyphs must use a single `refHeight = max(all cell heights)` for scaling. Using per-row heights causes uppercase and lowercase to render at different scales. This is enforced in `pipeline.js`, `compute-worker.js`, and `Preview.svelte`'s retrace function.

### SVG Y-flip for glyph gallery

Font coordinates have Y going up; SVG has Y going down. `commandsToSvgPath` in `GlyphGallery.svelte` flips via `ASCENDER - y`.

### Svelte 5 runes

This codebase uses Svelte 5 runes exclusively:

- `$state(value)` for reactive state
- `$derived(expr)` for computed values (not `$derived(() => expr)` — that returns the function itself)
- `$derived.by(() => { ... })` for multi-statement derived blocks
- `$effect(() => { ... })` tracks all reads transitively — never read and write the same `$state` in an effect
- Event handlers: `onclick={fn}` not `on:click={fn}`, no event modifiers

## Testing

**54 tests** (43 unit + 11 e2e), all must pass before any commit.

### Unit tests

Synthetic data (no real images needed):

- **segmentation** — row/column detection on generated black-block images
- **tracing** — black square tracing, SVG-to-opentype conversion, coordinate scaling
- **font-builder** — glyph construction, font creation, TTF binary round-trip
- **font-builder-kern** — kern table injection: empty/single/multiple pairs round-trip, sorting, buildKernPairs filtering
- **pipeline** — full tracing pipeline: multi-cell tracing, space glyph generation, progress callbacks, empty cell handling
- **glyph-utils** — width computation, space width from lowercase average, traceCell
- **errors** — custom error class names and messages

### E2E tests

Require `font.png` (gitignored, auto-skips when missing). Full closed-loop:

1. Detect grid from real handwriting image
2. Crop and trace all cells
3. Build TTF font
4. Parse font back with opentype.js
5. Render each glyph to canvas
6. Compare rendered output against source cell crops using bbox-normalized IoU

Thresholds: per-glyph IoU >= 0.20, average >= 0.30, pass rate > 60%. Current average: ~0.765.

## Debug logging

Enable verbose logging in the browser console:

```js
localStorage.setItem('debug', '1');
```

This activates timestamped module-prefixed logging (`[compute]`, `[pipeline]`, `[Preview]`, etc.) for all `log()` and `time()`/`timeEnd()` calls. `warn()` and `error()` always print regardless of the debug flag.

## Deployment

- Remote: `github.com:MadeByTokens/image2ttf.git`
- Branch: `main`
- GitHub Pages via `gh-pages` package targeting `dist/`
- Base path: `/image2ttf/` (configured in `vite.config.js`)
- Version from `package.json` injected at build time via Vite `define` as `__APP_VERSION__`

