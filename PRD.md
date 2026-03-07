# PRD: image2ttf — Browser-Based Image-to-TTF Font Converter

## Overview

A single-page web application that converts images of handwritten or drawn characters into downloadable TrueType Font (.ttf) files. The entire pipeline runs client-side in the browser with no server dependencies, enabling deployment as a static site on Cloudflare Pages.

## Problem Statement

Creating a custom font from handwritten characters traditionally requires specialized desktop software (FontForge, Glyphs, etc.) with steep learning curves. Users who simply want to turn their handwriting into a usable font need a fast, accessible tool that works on any device.

## Target Users

- People who want a font from their handwriting
- Designers prototyping custom lettering
- Educators and students exploring typography
- Anyone with a phone camera and paper

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Build tool | Vite | Fast dev server, zero-config static builds |
| UI framework | Svelte | Tiny bundle, no runtime overhead, simple reactivity |
| Styling | Tailwind CSS | Responsive utilities, consistent design system |
| Bitmap tracing | imagetracerjs or potrace-wasm | Convert raster glyphs to vector outlines in-browser |
| Font generation | opentype.js | Create valid TTF files entirely client-side |
| Testing (unit) | Vitest | Fast, Vite-native test runner |
| Testing (E2E) | Playwright | Browser automation for full pipeline verification |

## User Flow

### Step 1: Upload Image
- User uploads an image (PNG, JPG, WebP) containing handwritten characters arranged in a grid-like layout (see `font.png` for reference format)
- Accepted input: photo of paper with characters written in rows — lowercase a-z, uppercase A-Z, digits 0-9, common punctuation
- Drag-and-drop or file picker; both work on all devices

### Step 2: Grid Overlay & Segmentation
- The app displays the uploaded image with an adjustable grid overlay
- Auto-detection attempts to find character boundaries based on content rows
- User can adjust grid rows/columns, drag edges, and fine-tune which cell maps to which character
- Grid handles are minimum 44px touch targets for mobile usability

### Step 3: Character Mapping
- Each grid cell is assigned to a character (a, b, c, A, B, C, 0, 1, ...)
- Default mapping follows the expected layout (alphabetical rows, then digits/symbols)
- User can reassign, skip, or clear individual cells

### Step 4: Preview & Adjust
- Live preview showing sample text rendered with the extracted glyphs
- User can type custom text to preview
- Basic adjustments: baseline alignment, glyph sizing/spacing

### Step 5: Generate & Download
- User clicks "Generate Font"
- Pipeline: crop each cell -> trace to vector paths -> build TTF with opentype.js
- Progress indicator during generation
- Download button for the resulting `.ttf` file
- Option to set font family name before download

## Core Pipeline (Technical Detail)

```
Image (raster)
  |
  v
Grid segmentation (Canvas API — crop each cell)
  |
  v
Per-glyph cleanup (threshold, remove background/lines)
  |
  v
Bitmap-to-vector tracing (imagetracerjs / potrace-wasm)
  |
  v
Path normalization (scale to em-square, set bearings)
  |
  v
TTF assembly (opentype.js — Font, Glyph, Path objects)
  |
  v
.ttf file (Blob download)
```

## UI/UX Requirements

### Design
- Clean, modern, minimal interface — dark/light mode support
- Step-by-step wizard layout (not all steps visible at once)
- Progress indicator showing current step
- Smooth transitions between steps

### Responsive Layout
- Fluid layout using Tailwind responsive breakpoints
- Mobile-first: single column on phones, wider layout on tablets/desktops
- Image + grid overlay scales to fit viewport while remaining interactive
- All interactive elements meet 44px minimum touch target size

### Input Handling
- Use Pointer Events API throughout (unified mouse/touch/pen)
- Drag interactions for grid adjustment work identically with mouse and finger
- No hover-dependent functionality (all interactions accessible via tap)

## Non-Functional Requirements

### Performance
- Image processing and tracing happen in the main thread with progress feedback (or Web Workers if blocking becomes an issue)
- TTF generation for a full character set (62+ glyphs) should complete in under 10 seconds on a mid-range phone

### Deployment
- `npm run build` produces a fully static `dist/` folder
- No environment variables, API keys, or server endpoints
- Deployable to Cloudflare Pages via `git push` or direct upload
- All assets cacheable (immutable hashed filenames via Vite)

### Browser Support
- Modern evergreen browsers: Chrome, Firefox, Safari, Edge (last 2 versions)
- Mobile: iOS Safari 15+, Chrome for Android

## Testing Strategy

### Unit Tests (Vitest)
- Image segmentation: given a known image, verify correct cell extraction
- Tracing: given a raster glyph, verify vector output has expected path count
- TTF generation: given vector paths, verify opentype.js produces a parseable font with correct glyph count and character mappings
- Run via `npx vitest`

### E2E Tests (Playwright MCP)
- Start dev server, navigate to app
- Upload `font.png` via file upload
- Verify grid overlay appears
- Step through the wizard
- Trigger font generation
- Validate the downloaded TTF (parse with opentype.js in a test script)
- Screenshot at each step for visual verification

### Responsive Verification
- Playwright viewport resizing: 375x667 (phone), 768x1024 (tablet), 1440x900 (desktop)
- Screenshot comparison at each breakpoint to verify layout integrity

### TTF Validation
- Node script using opentype.js to parse generated font
- Verify: glyph count, character coverage, valid metrics, non-empty paths

## File Structure (Planned)

```
image2ttf/
  src/
    lib/
      segmentation.js    — grid detection, cell cropping
      tracing.js         — bitmap-to-vector wrapper
      font-builder.js    — opentype.js TTF assembly
    components/
      Upload.svelte      — step 1
      GridOverlay.svelte  — step 2
      CharMap.svelte      — step 3
      Preview.svelte      — step 4
      Generate.svelte     — step 5
    App.svelte
    main.js
  tests/
    unit/
    e2e/
  static/
    font.png             — reference test image
  index.html
  vite.config.js
  tailwind.config.js
  package.json
```

## Out of Scope (v1)

- Multi-page / multi-style fonts
- OpenType features (ligatures, kerning pairs)
- WOFF/WOFF2 output (TTF only)
- Cloud storage / user accounts
- Font editing (moving individual vector points)
- Automatic handwriting recognition / OCR

## Success Criteria

1. User can upload `font.png`, step through the wizard, and download a valid `.ttf` in under 2 minutes
2. The downloaded font installs on macOS/Windows/Linux and renders all mapped characters correctly
3. The entire flow works on an iPhone (Safari) without any usability issues
4. All unit and E2E tests pass
5. `npm run build` produces a static site under 1MB (excluding test assets)
