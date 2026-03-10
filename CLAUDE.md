# image2ttf

Convert handwritten character grids into TTF font files, entirely client-side.

## Stack

- **Svelte 5** (runes: `$state`, `$derived`, `$effect`) + **Vite 6** + **Tailwind CSS v4**
- **opentype.js** for font generation, **imagetracerjs** for bitmap-to-SVG tracing
- No server — everything runs in the browser, deploys as a static site

## Architecture

### Pipeline (wizard steps)
1. **Upload** → loads image; pan/rotate/zoom viewer (mode-based: Pan/Rotate/Zoom toggle); rotation applied to canvas data
2. **Detect** (GridOverlay) → auto-detects grid; Advanced panel (6 params); Edit mode: drag cell edges, drag orange row separators, right-click for cell/row operations (add/delete/split/relabel)
3. **Characters** (CharMap) → maps cells to chars; editable labels; space width slider (20-150% of avg lowercase); per-glyph adjustment dialog (baseline, left/right bearing)
4. **Preview** → traces glyphs (smoothness slider 1-10), glyph gallery with SVG inspect/retrace/delete, kerning pair editor, live font preview via `@font-face` blob URL with GPOS+kern tables
5. **Generate** → builds final TTF via opentype.js with GPOS+kern table injection, offers download

### Key files
- `src/lib/store.svelte.js` — global state via `appState` (NOT `state`), exports `resyncCharMap()`. Has `spaceWidthPercent`, `smoothness` (1-10), `kerningPairs` (char pair → value), `glyphAdjustments` (char → {baseline, bearingLeft, bearingRight}).
- `src/lib/segmentation.js` — grid detection with `opts` param; exports `autoDetectGrid`, `detectColumns`, `detectRows`, `cropCell`
- `src/lib/tracing.js` — imagetracerjs wrapper; `svgPathToOpentypePath(svgPaths, w, h, em, metrics)` where `metrics = { cellHeight, trimOffsetY }`; exports `smoothnessToOpts(1-10)` for mapping slider to imagetracerjs params
- `src/lib/glyph-utils.js` — shared glyph utilities: `computeGlyphWidth`, `computeSpaceWidth`, `traceCell` (used by pipeline, worker, Preview)
- `src/lib/redetect-columns.js` — shared `redetectColumnsForRows()` (used by worker and compute fallback)
- `src/lib/pipeline.js` — `runTracing(grid, charMap, canvas, onProgress, opts)` — opts includes `spaceWidthPercent`, `smoothness`
- `src/lib/font-builder.js` — `createFont(glyphMap, options)` builds opentype.Font (options includes `glyphAdjustments`); `applyGlyphAdjustments(commands, width, adj)` shifts coords/width; `injectGposTable(buffer, pairs)` builds GPOS kern feature for browsers; `injectKernTable(buffer, pairs)` builds legacy kern table; `downloadFont(font, filename, kerningMap)` injects both tables
- `src/lib/constants.js` — default thresholds, font metrics, DEFAULT_CHARSET
- `src/lib/errors.js` — custom error classes: `ImageLoadError`, `GridDetectionError`, `TracingError`, `FontBuildError`
- `src/lib/logger.js` — structured logger toggled via `localStorage.setItem('debug', '1')`
- `src/lib/compute-worker.js` — Web Worker for heavy computation (grid detect, thumbnails, tracing)
- `src/lib/compute.js` — async API wrapping the worker with abort support and main-thread fallback
- `src/components/GlyphGallery.svelte` — glyph grid + inspector (extracted from Preview)
- `src/components/KerningEditor.svelte` — kerning pair editor (extracted from Preview)
- `src/components/grid/ContextMenu.svelte` — right-click context menu (extracted from GridOverlay)
- `src/components/grid/AdvancedPanel.svelte` — advanced detection parameters (extracted from GridOverlay)

## Commands

```bash
npm run dev            # Start dev server
npm run build          # Run tests + production build
npm run test           # Run vitest (66 tests: 55 unit + 11 e2e)
npm run test:coverage  # Run tests with v8 coverage report
npm run deploy         # Run tests + build + publish to GitHub Pages via gh-pages
```

## Svelte 5 Rules

- `onclick={handler}`, not `on:click`. No pipe modifiers — use `(e) => e.stopPropagation()`.
- `$derived(expr)` for simple; `$derived.by(() => { ... })` for blocks. `$derived(() => ...)` returns the function itself!
- `$effect` tracks ALL reads in called functions. Never read+write same `$state` inside an effect. Use plain `let` for internal vars, or `untrack(() => fn())`.
- a11y: non-button interactive elements need `role`, `tabindex`, keyboard handler.

## Workflow Rules

- **Always run tests before committing**: `npx vitest run` — all 66 tests must pass before any commit or deploy.
- **Always run build after code changes**: `npx vite build` — verify no build errors before committing.
- **Record discoveries**: When you find a bug, gotcha, or important insight, immediately update MEMORY.md and/or CLAUDE.md so it persists across sessions.

## Testing

- **Unit tests** (55) — segmentation, tracing, font-builder, glyph adjustments, kern+GPOS injection, pipeline, glyph-utils, errors
- **E2E tests** (11) — real `font.png` (gitignored, auto-skips when missing):
  - Full pipeline: detect → crop → trace → build TTF → parse → render → IoU compare
  - Bbox-normalized IoU: avg ~0.68, thresholds: per-glyph ≥0.20, avg ≥0.30
- `tests/validate-font.js` — standalone manual TTF validator
- Coverage: `npm run test:coverage` generates text + HTML report for `src/lib/`

## Key Gotchas

- **imagetracerjs** outputs paths for ALL colors. Must filter by `fill="rgb(...)"` — only keep dark fills.
- **TrueType winding**: trapezoidal signedArea gives negative=CW in Y-up. Outer contours must be CW (area<0), inner CCW (area>0). `fixWinding` uses point-in-polygon containment test to handle multi-component glyphs (i, j, !, :, %).
- **Grid detection**: `autoDetectGrid(imageData, opts)` accepts overrides for all 6 thresholds. Valley splitting handles lined paper. `detectColumns` can be re-run independently to keep row boundaries.
- Grid edits must call `resyncCharMap()`. GridOverlay preserves edits on re-mount (only resets when user clicks Reset).
- **Glyph scaling**: Uses single `refHeight = max(all cell heights)` across entire grid for uniform scaling. All rows share the same scale factor so uppercase/lowercase align on same baseline.
- **SVG Y-flip for glyph gallery**: Font coords Y-up, SVG Y-down. `commandsToSvgPath` in GlyphGallery.svelte flips Y via `ASCENDER - y`.
- **Space glyph**: Auto-generated via `computeSpaceWidth()` in glyph-utils.js from avg lowercase width × `spaceWidthPercent`. Configurable via slider in CharMap.
- **Version**: Injected from package.json via Vite `define` (`__APP_VERSION__`), displayed in footer.
- **Kerning**: opentype.js cannot write kern/GPOS tables. opentype.js produces CFF (OTTO) fonts, and browsers ignore `kern` tables in CFF fonts — they only read GPOS. `injectGposTable` builds a GPOS table with PairPosFormat1 under a 'kern' feature. `injectKernTable` builds a legacy kern table for older renderers. Both are injected into the SFNT. Pairs use glyph indices, sorted by left glyph.
- **Smoothness**: `smoothnessToOpts(1-10)` maps slider to imagetracerjs params (`ltres`, `qtres`, `rightangleenhance`, `blurradius`, `pathomit`). Threaded through pipeline.js and Preview retrace.
- **.notdef winding**: Outer CW, inner CCW in Y-up. Previously was backwards causing some renderers to misinterpret font conventions.

## Deployment

- Remote: `github.com:MadeByTokens/image2ttf.git`, branch `main`
- GitHub Pages via `gh-pages` targeting `dist/`
