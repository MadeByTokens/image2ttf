import { describe, it, expect } from 'vitest';
import { ImageLoadError, GridDetectionError, TracingError, FontBuildError } from '../../src/lib/errors.js';

describe('errors', () => {
  it('ImageLoadError has correct name and default message', () => {
    const err = new ImageLoadError();
    expect(err.name).toBe('ImageLoadError');
    expect(err.message).toBe('Failed to load image');
    expect(err).toBeInstanceOf(Error);
  });

  it('ImageLoadError accepts custom message', () => {
    const err = new ImageLoadError('custom msg');
    expect(err.message).toBe('custom msg');
  });

  it('GridDetectionError has correct name and default message', () => {
    const err = new GridDetectionError();
    expect(err.name).toBe('GridDetectionError');
    expect(err.message).toBe('Failed to detect character grid');
    expect(err).toBeInstanceOf(Error);
  });

  it('TracingError has correct name and default message', () => {
    const err = new TracingError();
    expect(err.name).toBe('TracingError');
    expect(err.message).toBe('Failed to trace glyphs');
    expect(err).toBeInstanceOf(Error);
  });

  it('FontBuildError has correct name and default message', () => {
    const err = new FontBuildError();
    expect(err.name).toBe('FontBuildError');
    expect(err.message).toBe('Failed to build font');
    expect(err).toBeInstanceOf(Error);
  });
});
