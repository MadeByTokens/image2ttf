// Svelte 5 runes-based global state
export const appState = $state({
  currentStep: 0,
  uploadedImage: null,      // HTMLImageElement
  imageCanvas: null,         // HTMLCanvasElement with the image drawn
  grid: null,                // { rows, cells } from autoDetectGrid
  charMap: [],               // flat array of characters
  glyphPaths: null,          // Map<string, {commands, width}>
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

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const body = document.body;
  body.classList.remove('dark', 'light');
  if (theme !== 'system') {
    body.classList.add(theme);
  }
}
