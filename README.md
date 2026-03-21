# image2ttf

Convert handwritten character grid images into TTF font files -- entirely client-side, no server required.

Upload a photo of your handwriting arranged in a grid, and image2ttf will detect the characters, trace them into vector paths, and generate a downloadable `.ttf` font.

## Features

- **5-step wizard**: Upload -> Detect grid -> Map characters -> Preview & adjust -> Generate TTF
- **Full grid editing**: auto-detection with manual fine-tuning (drag edges, split/add/delete cells, adjust baselines)
- **Per-glyph adjustments**: baseline offset, left/right bearing sliders with live SVG preview
- **Two-slider tracing**: Detail (point count) + Smoothing (Chaikin corner-cutting)
- **Kerning editor**: add spacing pairs with GPOS + legacy kern table injection
- **Live font preview**: type and see your handwriting rendered in real time
- **Multi-language UI**: English, Portuguese (Brazil), Spanish, French -- with browser language detection
- **Dark/light/auto theme**
- **Web Workers**: heavy computation (grid detection, tracing) runs off the main thread
- **100% client-side**: no data leaves the browser, deploys as a static site

## Quick Start

```bash
npm install
npm run dev          # Start dev server at localhost:5173
```

## Commands

```bash
npm run dev            # Start dev server
npm run build          # Run tests + production build
npm run test           # Run vitest (78 tests: 67 unit + 11 e2e)
npm run test:coverage  # Run tests with v8 coverage report
npm run deploy         # Run tests + build + publish to GitHub Pages
```

## Programmatic API (for AI agents & automation)

image2ttf exposes a hash-based API so AI agents or scripts can drive the full pipeline without manual interaction.

### Discovery

On any page load, check `window.__image2ttf_api` for the full self-documenting spec (endpoints, parameters, types, defaults, examples).

```js
// In browser console or agent JS eval:
console.log(JSON.stringify(window.__image2ttf_api, null, 2));
```

### Strategy A: URL-driven (simplest)

Navigate to:
```
https://your-site.com/#api/generate?imageUrl=https://example.com/grid.png&fontName=MyFont&detail=5&smoothing=2
```

The app loads, runs the full pipeline, and reports status via `document.title` (`api:done` when finished).

### Strategy B: JS-driven (most flexible)

```
1. Navigate to: https://your-site.com/#api/ready
2. Execute JS:
   await window.__image2ttf.run({
     image: 'data:image/png;base64,iVBORw0KGgo...',
     fontName: 'MyHandwriting',
     detail: 5,
     smoothing: 2,
   });
3. Get the result:
   window.__image2ttf.fontBlobUrl      // blob: URL to fetch the .ttf
   window.__image2ttf.fontArrayBuffer  // raw ArrayBuffer
   window.__image2ttf.glyphCount       // number of glyphs
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `imageUrl` | string | -- | URL to fetch the grid image (requires CORS) |
| `imageData` | string | -- | Base64 image data (or full data URI) |
| `fontName` | string | `MyHandwriting` | Font family name |
| `detail` | number | `5` | 1-10: tracing detail (1 = many points, 10 = fewer) |
| `smoothing` | number | `2` | 0-5: curve smoothing iterations |
| `spaceWidth` | number | `60` | Space width as % of avg lowercase width |
| `charset` | string | default a-z,A-Z,0-9,punct | Pipe-separated rows: `abc\|def\|...` |
| `autoDownload` | boolean | `false` | Trigger browser download on completion |

### Status channels

Status is reported through 4 parallel channels:

1. `document.title` -- e.g. `"api:tracing 12/88"` or `"api:done"`
2. `document.querySelector('#api-status').textContent`
3. `window.__image2ttf.status` (+ `.progress`, `.total`, `.message`)
4. `console.log('__API__:...')`

## Stack

- [Svelte 5](https://svelte.dev) (runes) + [Vite 6](https://vite.dev) + [Tailwind CSS v4](https://tailwindcss.com)
- [opentype.js](https://opentype.js.org) for font generation
- [imagetracerjs](https://github.com/nickt/imagetracerjs) for bitmap-to-SVG tracing

## Adding a new language

1. Create `src/lib/i18n/{locale}.js` copying the structure from `en.js`
2. Add an entry to the `LOCALES` array in `src/lib/i18n.svelte.js`

## License

MIT
