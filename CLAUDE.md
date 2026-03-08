# image2ttf

Convert handwritten character grids into TTF font files, entirely client-side.

## Stack

- **Svelte 5** (runes: `$state`, `$derived`, `$effect`) + **Vite 6** + **Tailwind CSS v4**
- **opentype.js** for font generation, **imagetracerjs** for bitmap-to-SVG tracing
- No server — everything runs in the browser, deploys as a static site

## Architecture

### Pipeline (wizard steps)
1. **Upload** → loads image onto a canvas (`appState.imageCanvas`)
2. **GridOverlay** → auto-detects or manually defines character cell grid
3. **CharMap** → maps detected cells to characters
4. **Preview** → traces glyphs, renders preview using `@font-face` blob URL
5. **Generate** → builds final TTF via opentype.js, offers download

### Key files
- `src/lib/store.svelte.js` — global state via `appState` (not `state`, avoids `$state` naming conflict)
- `src/lib/segmentation.js` — grid auto-detection (horizontal/vertical projection)
- `src/lib/tracing.js` — imagetracerjs wrapper, SVG→opentype path conversion
- `src/lib/font-builder.js` — `createFont()` builds opentype.Font from glyph map
- `src/lib/constants.js` — detection thresholds, font metrics, default charset
- `src/components/Wizard.svelte` — step navigation container

## Commands

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run test       # Run vitest (26 tests: 14 unit + 12 e2e)
npm run deploy     # Build + publish to GitHub Pages via gh-pages
```

## Conventions

- Event handlers in Svelte 5: use `onclick={handler}`, not `on:click`. No pipe modifiers — use `(e) => e.stopPropagation()` inline.
- a11y: interactive non-button elements need `role`, `tabindex`, and keyboard handler.
- Grid edits must call `resyncCharMap()` to keep `appState.charMap` aligned with cell count.
- Store imports from `constants.js` — avoid circular dependencies with component files.
- Tests use jsdom + `canvas` npm package; `tests/setup.js` polyfills `ImageData` and `createCanvas`.

## Testing

- **Unit tests** (`tests/unit/segmentation.test.js`, `tracing.test.js`, `font-builder.test.js`) — 14 tests on synthetic shapes
- **E2E closed-loop test** (`tests/unit/e2e-font-png.test.js`) — 12 tests using real `font.png`:
  - Grid detection: row count, cell count, cell dimensions, no overlaps
  - Cell cropping: verifies most cells have ink
  - Tracing: traces all cells, checks success rate (>70%)
  - Font round-trip: build TTF → serialize → parse back → verify all glyphs present
  - **Visual similarity (IoU)**: renders each glyph from TTF back to bitmap, compares against original source cell. Checks per-glyph IoU >= 0.10 and average IoU >= 0.15
- `font.png` is in `.gitignore` — e2e tests auto-skip when it's missing (CI-safe via `describe.skip`)
- `tests/validate-font.js` — standalone script for manual TTF validation

## Svelte 5 Pitfalls

- **`$derived` vs `$derived.by`**: Use `$derived(expr)` for simple expressions. Use `$derived.by(() => { ... return val; })` for multi-statement blocks. `$derived(() => ...)` returns the function itself, not its result.
- **`$effect` infinite loops**: Effects track ALL reactive reads inside called functions. If a function both reads and writes a `$state` var, it creates `effect_update_depth_exceeded`. Fix: use plain `let` for internal-only vars, or wrap calls in `untrack(() => fn())`.
- **`untrack()`**: Import from `'svelte'`. Use inside `$effect` to read state without adding it as a dependency.

## Deployment

- Remote: `github.com:MadeByTokens/image2ttf.git`, branch `main`
- GitHub Pages via `gh-pages` package targeting `dist/`
