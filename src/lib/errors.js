/**
 * Custom error types and error handling utilities
 */

export class ImageLoadError extends Error {
  constructor(message = 'Failed to load image') {
    super(message);
    this.name = 'ImageLoadError';
  }
}

export class GridDetectionError extends Error {
  constructor(message = 'Failed to detect character grid') {
    super(message);
    this.name = 'GridDetectionError';
  }
}

export class TracingError extends Error {
  constructor(message = 'Failed to trace glyphs') {
    super(message);
    this.name = 'TracingError';
  }
}

export class FontBuildError extends Error {
  constructor(message = 'Failed to build font') {
    super(message);
    this.name = 'FontBuildError';
  }
}

