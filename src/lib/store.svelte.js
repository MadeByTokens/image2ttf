import { DEFAULT_CHARSET } from './constants.js';

// Svelte 5 runes-based global state
export const appState = $state({
  currentStep: 0,
  uploadedImage: null,      // HTMLImageElement
  imageCanvas: null,         // HTMLCanvasElement with the image drawn
  grid: null,                // { rows, cells } from autoDetectGrid
  charMap: [],               // flat array of characters
  glyphPaths: null,          // Map<string, {commands, width}>
  spaceWidthPercent: 60,     // space width as % of avg lowercase width (0 = auto)
  smoothness: 5,             // 1 = precise, 10 = very smooth curves
  glyphAdjustments: {},        // e.g. { "A": { baseline: 20, bearingLeft: 10, bearingRight: 5 } }
  kerningPairs: {},           // e.g. { "AV": -80, "To": -40 }
  fontName: 'MyHandwriting',
  generatedFont: null,       // opentype.Font object
  isProcessing: false,
  progress: 0,
  progressTotal: 0,
  error: null,               // string error message or null
  theme: typeof localStorage !== 'undefined'
    ? localStorage.getItem('theme') || 'system'
    : 'system'
});

export function setStep(step) {
  appState.currentStep = step;
  appState.error = null;
}

export function setError(message) {
  appState.error = message;
  // Auto-clear after 5 seconds
  setTimeout(() => {
    if (appState.error === message) appState.error = null;
  }, 5000);
}

export function clearError() {
  appState.error = null;
}

export function setTheme(theme) {
  appState.theme = theme;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('theme', theme);
  }
  applyTheme(theme);
}

/**
 * Resync charMap to match the current grid cell count.
 * Extends from DEFAULT_CHARSET or truncates as needed.
 */
export function resyncCharMap() {
  if (!appState.grid) return;
  const totalCells = appState.grid.cells.flat().length;
  const current = appState.charMap;

  if (current.length === totalCells) return;

  if (current.length < totalCells) {
    // Extend with characters from DEFAULT_CHARSET that aren't already used
    const needed = totalCells - current.length;
    const available = DEFAULT_CHARSET.filter(c => !current.includes(c));
    const extra = available.slice(0, needed);
    // If we still need more, fill with '?'
    while (extra.length < needed) extra.push('?');
    appState.charMap = [...current, ...extra];
  } else {
    appState.charMap = current.slice(0, totalCells);
  }
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const body = document.body;
  body.classList.remove('dark', 'light');
  if (theme !== 'system') {
    body.classList.add(theme);
  }
}
