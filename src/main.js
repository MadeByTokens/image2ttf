import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

// ── Agent API capability advertisement ──────────────────
// Always present on every page load so agents can discover the API.
// An agent visiting the page can check: window.__image2ttf_api
window.__image2ttf_api = {
  name: 'image2ttf',
  description: 'Convert handwritten character grid images into TTF font files. Entirely client-side.',
  version: '1.0',
  usage: {
    quickStart: 'Navigate to this URL with #api/generate?imageUrl=<url>&fontName=<name> to generate a font automatically.',
    jsStart: 'Navigate to #api/ready, then call window.__image2ttf.run({ image, fontName, ... }) from JavaScript.',
  },
  endpoints: {
    generate: {
      hash: '#api/generate',
      description: 'Run the full pipeline: load image → detect grid → trace glyphs → build TTF font.',
      params: {
        imageUrl:     { type: 'string',  description: 'URL to fetch the grid image from (requires CORS headers).' },
        imageData:    { type: 'string',  description: 'Base64-encoded image (prefix with data:image/png;base64, or raw base64).' },
        fontName:     { type: 'string',  default: 'MyHandwriting', description: 'Name for the generated font family.' },
        detail:       { type: 'number',  default: 5, min: 1, max: 10, description: 'Tracing detail: 1 = many points, 10 = fewer points.' },
        smoothing:    { type: 'number',  default: 2, min: 0, max: 5, description: 'Curve smoothing iterations (Chaikin corner-cutting).' },
        spaceWidth:   { type: 'number',  default: 60, min: 20, max: 150, description: 'Space character width as % of avg lowercase width.' },
        charset:      { type: 'string',  description: 'Character layout, pipe-separated rows. Default: abcdefghijklm|nopqrstuvwxyz|ABCDEFGHIJKLM|NOPQRSTUVWXYZ|@!1234567890$.,\'-":();' },
        autoDownload: { type: 'boolean', default: false, description: 'Trigger browser file download on completion.' },
      },
    },
    ready: {
      hash: '#api/ready',
      description: 'Enter API mode and wait. Call window.__image2ttf.run({...}) to start.',
    },
  },
  result: {
    description: 'After pipeline completes, results are available on window.__image2ttf:',
    fields: {
      status:         'string — idle|loading|detecting|tracing|building|done|error',
      progress:       'number — current step',
      total:          'number — total steps',
      message:        'string — human-readable status',
      fontBlobUrl:    'string — blob: URL to fetch the .ttf file',
      fontArrayBuffer:'ArrayBuffer — raw font bytes',
      glyphCount:     'number — number of glyphs generated',
      fontName:       'string — font family name used',
    },
  },
  statusChannels: [
    'document.title — e.g. "api:tracing 12/88" or "api:done"',
    'document.querySelector("#api-status").textContent',
    'window.__image2ttf.status',
    'console output: __API__:status:message',
  ],
  examples: [
    '#api/generate?imageUrl=https://example.com/handwriting.png&fontName=MyFont&detail=5&smoothing=2',
    '#api/generate?imageData=iVBORw0KGgo...&fontName=MyFont&autoDownload=true',
    '#api/ready   → then call: window.__image2ttf.run({ image: "data:image/png;base64,...", fontName: "X" })',
  ],
};

const app = mount(App, {
  target: document.getElementById('app')
});

export default app;
