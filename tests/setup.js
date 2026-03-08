// Vitest setup — polyfill canvas for jsdom
import { createCanvas, ImageData } from 'canvas';

// Make ImageData available globally for tests
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = ImageData;
}

// Provide createCanvas helper
globalThis.createCanvas = createCanvas;
