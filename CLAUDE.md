# image2ttf

Convert handwritten character grids into TTF font files, entirely client-side.

## Stack

- **Svelte 5** (runes: `$state`, `$derived`, `$effect`) + **Vite 6** + **Tailwind CSS v4**
- **opentype.js** for font generation, **imagetracerjs** for bitmap-to-SVG tracing
- No server — everything runs in the browser, deploys as a static site

## Architecture

### Pipeline (wizard steps)
1. **Upload** → loads image onto canvas; "Try with example" loads `public/font_test.png`
2. **GridOverlay** → auto-detects grid; Advanced panel exposes 6 tunable params; Edit mode for manual cell manipulation
3. **CharMap** → maps cells to characters, click labels to reassign
4. **Preview** → traces glyphs, glyph gallery with SVG inspect/retrace/delete, live font preview via `@font-face` blob URL
5. **Generate** → builds final TTF via opentype.js, offers download

### Key files
- `src/lib/store.svelte.js` — global state via `appState` (NOT `state`), exports `resyncCharMap()`
- `src/lib/segmentation.js` — grid detection with `opts` param for all thresholds; valley splitting, noise filtering
- `src/lib/tracing.js` — imagetracerjs wrapper; filters by fill color; fixes TrueType winding
- `src/lib/font-builder.js` — `createFont()` builds opentype.Font from glyph map
- `src/lib/constants.js` — default thresholds, font metrics, DEFAULT_CHARSET

## Commands

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run test       # Run vitest (25 tests: 14 unit + 11 e2e)
npm run deploy     # Build + publish to GitHub Pages via gh-pages
```

## Svelte 5 Rules

- `onclick={handler}`, not `on:click`. No pipe modifiers — use `(e) => e.stopPropagation()`.
- `$derived(expr)` for simple; `$derived.by(() => { ... })` for blocks. `$derived(() => ...)` returns the function itself!
- `$effect` tracks ALL reads in called functions. Never read+write same `$state` inside an effect. Use plain `let` for internal vars, or `untrack(() => fn())`.
- a11y: non-button interactive elements need `role`, `tabindex`, keyboard handler.

## Testing

- **Unit tests** (14) — synthetic shapes for segmentation, tracing, font-builder
- **E2E tests** (11) — real `font.png` (gitignored, auto-skips when missing):
  - Full pipeline: detect → crop → trace → build TTF → parse → render → IoU compare
  - Bbox-normalized IoU: avg ~0.71, thresholds: per-glyph ≥0.20, avg ≥0.30
- `tests/validate-font.js` — standalone manual TTF validator

## Workflow Rules

- **Always run tests before committing**: `npx vitest run` — all 25 tests must pass before any commit or deploy.
- **Always run build after code changes**: `npx vite build` — verify no build errors before committing.
- **Record discoveries**: When you find a bug, gotcha, or important insight, immediately update MEMORY.md and/or CLAUDE.md so it persists across sessions.

## Key Gotchas

- **imagetracerjs** outputs paths for ALL colors. Must filter by `fill="rgb(...)"` — only keep dark fills.
- **TrueType winding**: trapezoidal signedArea gives negative=CW in Y-up. Outer contours must be CW (area<0), inner CCW (area>0).
- **Grid detection**: `autoDetectGrid(imageData, opts)` accepts overrides for all 6 thresholds. Valley splitting handles lined paper merging rows. Noise rows filtered by peak < 2% of width.
- Grid edits must call `resyncCharMap()`.
- **Glyph scaling**: `svgPathToOpentypePath` accepts `metrics: { cellHeight, trimOffsetY }` for uniform scaling based on row height. Without this, all chars get stretched to the same height regardless of ascenders/descenders.
- **SVG Y-flip for glyph gallery**: Font coords are Y-up, SVG is Y-down. `commandsToSvgPath` in Preview.svelte flips Y via `ASCENDER - y`.

## Deployment

- Remote: `github.com:MadeByTokens/image2ttf.git`, branch `main`
- GitHub Pages via `gh-pages` targeting `dist/`
