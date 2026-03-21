/**
 * English translations (default / source of truth).
 */
export const en = {
  // ── Common ──────────────────────────────────────────────
  common: {
    back: 'Back',
    next: 'Next',
    cancel: 'Cancel',
    reset: 'Reset',
    close: 'Close',
    apply: 'Apply',
    done: 'Done',
    delete: 'Delete',
    stepOf: 'Step {current} of {total}',
  },

  // ── Step names (ProgressBar + HelpDialog titles) ───────
  steps: {
    upload: 'Upload',
    detect: 'Detect',
    characters: 'Characters',
    preview: 'Preview',
    generate: 'Generate',
  },

  // ── Header ─────────────────────────────────────────────
  header: {
    subtitle: 'Create fonts from character grid images — handwriting, calligraphy, or custom designs',
  },

  // ── Theme toggle ───────────────────────────────────────
  theme: {
    auto: 'Auto',
    light: 'Light',
    dark: 'Dark',
    toggleAria: 'Toggle theme: {label}',
  },

  // ── Language prompt banner ─────────────────────────────
  langPrompt: {
    message: 'Would you like to use image2ttf in {language}?',
    accept: 'Yes, switch to {language}',
    dismiss: 'No, keep English',
  },

  // ── Language picker ────────────────────────────────────
  langPicker: {
    aria: 'Change language',
  },

  // ── Help dialog ────────────────────────────────────────
  help: {
    aria: 'Help for current step',
    tooltip: 'Help',
    closeAria: 'Close help',
    titleSuffix: '— Help',
    basics: 'Basics',
    advanced: 'Advanced',

    upload: {
      basic: [
        'Upload an image containing characters arranged in a grid (rows and columns).',
        'Supports PNG, JPG, and WebP formats. Drag & drop or click to browse.',
        'Use "Try with example image" to see how it works before using your own.',
      ],
      advanced: [
        'Pan / Rotate / Zoom — use the mode toggle to switch. Drag to interact, scroll to zoom.',
        'Rotation is applied to the processing canvas — straighten tilted scans here.',
        'Character layout — expand to type the characters as they appear in your image (one row per line). This guides grid detection and sets correct labels automatically.',
        'Reset returns to the original view and rotation.',
      ],
    },
    detect: {
      basic: [
        'The grid of characters is auto-detected. Verify each character sits inside its own box.',
        'Use Edit mode to manually fix any misaligned boxes or boundaries.',
        'Uniform Grid creates an evenly spaced grid if auto-detection struggles.',
      ],
      advanced: [
        'Edit mode: drag cell edges to resize individual boxes. Drag solid baseline lines to set where characters sit. Drag dashed row boundaries to adjust row height.',
        'Double-click in empty row space to add a cell.',
        'Right-click a cell: change label, relabel from here, split cell, or delete cell.',
        'Right-click empty row area: add cell, add/delete row.',
        'Right-click outside rows: add a new row at that position.',
        'Re-label keeps boxes but reassigns labels from the character layout.',
        'Re-detect keeps row boundaries but re-detects columns within each row.',
        'Advanced panel: tune the 6 detection parameters (dark pixel threshold, row/column density, minimum sizes, gap fraction).',
      ],
    },
    characters: {
      basic: [
        'Each detected cell is shown with its assigned character label.',
        'Edit labels by typing in the input field below each thumbnail.',
        'Verify the labels match what\'s actually in each cell.',
      ],
      advanced: [
        'Click a thumbnail to open the per-glyph adjustment dialog with baseline offset, left bearing, and right bearing sliders.',
        'Space width slider controls whitespace width as a percentage of average lowercase letter width.',
        'Cells with adjustments show an amber dot indicator.',
        'Adjustments are cleared when you re-detect or reset the grid.',
      ],
    },
    preview: {
      basic: [
        'Characters are traced into vector paths and assembled into a font.',
        'Type in the preview box to see how your font looks in real time.',
        'Use Re-trace after changing Detail or Smoothing to regenerate all glyphs.',
      ],
      advanced: [
        'Detail slider (1-10): controls the number of traced points. Lower = more detail, higher = simpler paths.',
        'Smoothing slider (0-5): applies curve smoothing (Chaikin corner-cutting). 0 = sharp corners, 5 = very smooth.',
        'Show Glyphs: inspect each glyph\'s SVG outline. Click a glyph to see details, retrace it individually, or delete it.',
        'Kerning: add spacing adjustments between specific letter pairs (e.g., reduce space between "A" and "V"). Changes are reflected in the live preview.',
      ],
    },
    generate: {
      basic: [
        'Set a name for your font and click Generate to build the final TTF file.',
        'Click Download to save the .ttf file to your computer.',
        'Install the font on your system or use it in design tools and documents.',
      ],
      advanced: [
        'Kerning pairs from the Preview step are embedded in the font (both GPOS and legacy kern tables).',
        'Per-glyph adjustments (baseline, bearings) from the Characters step are applied.',
        'Go back to any previous step to make changes, then regenerate.',
      ],
    },
  },

  // ── Progress bar aria ──────────────────────────────────
  progress: {
    aria: 'Progress',
  },

  // ── Upload step ────────────────────────────────────────
  upload: {
    title: 'Upload Your Handwriting',
    description: 'Upload an image of your handwritten characters arranged in a grid (rows of a-z, A-Z, 0-9, and punctuation), or try the example below first.',
    tryExample: 'Try with example image',
    clickToUpload: 'Click to upload',
    orDragDrop: 'or drag and drop',
    formats: 'PNG, JPG, or WebP',
    pan: 'Pan',
    rotate: 'Rotate',
    zoom: 'Zoom',
    changeImage: 'Change Image',
    panHelp: 'Drag to move the image. Scroll to zoom.',
    rotateHelp: 'Drag left/right to rotate. Scroll to zoom.',
    zoomHelp: 'Drag up/down to zoom. Scroll also works.',
    rotated: 'Rotated {angle}\u00B0.',
    imageLoaded: 'Image loaded ({width} \u00D7 {height}px)',
    altText: 'Uploaded handwriting',
    layoutHeader: 'Character layout ({count} chars, {rows} rows)',
    layoutHelp: 'Type the characters as they appear in your image, one row per line. This helps grid detection and sets the correct labels.',
    layoutAria: 'Character layout \u2014 one row per line',
    errorNotImage: 'Please upload an image file (PNG, JPG, etc.)',
    errorLoadFailed: 'Failed to load image. Please try another file.',
    errorExample: 'Could not load example image: {error}',
  },

  // ── Detect step ────────────────────────────────────────
  detect: {
    title: 'Detect',
    subtitle: 'The grid was auto-detected. Verify that each character is in its own box.',
    uniformGrid: 'Uniform Grid',
    reLabel: 'Re-label',
    reLabelTitle: 'Keep current boxes, re-assign labels from charset',
    reDetect: 'Re-detect',
    reDetectTitle: 'Keep row boundaries, re-detect columns within each row',
    resetTitle: 'Re-run full auto-detection from scratch, replacing all rows and cells',
    auto: 'Auto',
    edit: 'Edit',
    advancedBtn: 'Advanced',
    status: 'Detected {rows} rows, {cells} cells',
    selected: 'Selected:',
    editLabelAria: 'Edit label for selected cell',
    editHint: 'Drag the solid baseline to set where characters sit. Drag dashed lines to adjust row bounds. Drag cell edges to resize individually. Double-click to add cell. Right-click for more.',
    zoomOutAria: 'Zoom out',
    zoomInAria: 'Zoom in',
    detecting: 'Detecting...',
    detectingGrid: 'Detecting character grid...',
    errorNoRows: 'Could not detect character rows. Try adjusting the image or parameters.',
    errorDetection: 'Grid detection failed: {error}. Try adjusting Dark pixel threshold in Advanced settings, or use Uniform Grid.',
    errorColumns: 'Column detection failed: {error}',
    errorUniformFormat: 'Invalid format. Use "rows x cols" like "5x22".',
    errorUniformRange: 'Rows must be 1-50, cols must be 1-100.',
    uniformPrompt: 'Enter rows x cols (e.g. "5x22"):',
    changeLabelPrompt: 'Change label for this cell (current: "{current}"):',
    relabelPrompt: 'Relabel from this cell onward.\nEnter the character this cell should be (current: "{current}"):',
  },

  // ── Context menu ───────────────────────────────────────
  contextMenu: {
    changeLabel: 'Change label',
    relabelFrom: 'Relabel from here...',
    splitCell: 'Split cell',
    deleteCell: 'Delete cell',
    addCellHere: 'Add cell here',
    addRowAbove: 'Add row above',
    addRowBelow: 'Add row below',
    deleteThisRow: 'Delete this row',
    addRowHere: 'Add row here',
    deleteRow: 'Delete row',
  },

  // ── Advanced panel ─────────────────────────────────────
  advancedPanel: {
    hint: 'Tweak detection parameters and click Re-detect to apply.',
    darkPixelThreshold: 'Dark pixel threshold',
    rowDensity: 'Row density',
    columnDensity: 'Column density',
    minRowHeight: 'Min row height',
    minColWidth: 'Min col width',
    gapFraction: 'Gap fraction',
    resetDefaults: 'Reset defaults',
  },

  // ── Characters step ────────────────────────────────────
  charmap: {
    title: 'Character Map',
    subtitle: 'Verify each detected character is labeled correctly. Click a thumbnail to adjust glyph metrics.',
    generatingThumbs: 'Generating thumbnails...',
    adjustAria: 'Adjust metrics for {char}',
    empty: 'empty',
    labelAria: 'Character label for cell {index}',
    spaceWidth: 'Space width:',
    spaceWidthHelp: 'Percentage of average lowercase letter width',
    noCells: 'No cells detected. Go back and check the grid.',
    adjustTitle: 'Adjust "{char}"',
    baselineOffset: 'Baseline offset',
    down: 'Down',
    up: 'Up',
    leftBearing: 'Left bearing',
    tighter: 'Tighter',
    wider: 'Wider',
    rightBearing: 'Right bearing',
    adjustHint: 'Values in font units. Cleared on re-detect or reset.',
  },

  // ── Preview step ───────────────────────────────────────
  preview: {
    title: 'Preview',
    tracingProgress: 'Tracing glyphs... {current}/{total}',
    tracedCount: '{count} glyphs traced',
    showGlyphs: 'Show Glyphs',
    hideGlyphs: 'Hide Glyphs',
    kerning: 'Kerning',
    detail: 'Detail:',
    smoothing: 'Smoothing:',
    retrace: 'Re-trace',
    detailHelp: 'Detail: 1 = many points, 10 = fewer points. Smoothing: 0 = sharp, 5 = very smooth curves.',
    typeToPreview: 'Type to preview',
    placeholder: 'Type something...',
    buildingFont: 'Building preview font...',
    waitingTracing: 'Waiting for tracing to start...',
    errorMissing: 'Missing grid or character map data.',
    errorTracing: 'Tracing failed: {error}. Try reducing Smoothness or going back to check the grid.',
    errorCellNotFound: 'Cannot find cell for "{char}"',
    errorCellEmpty: 'Cell for "{char}" is empty or produced no paths',
    errorRetrace: 'Retrace failed for "{char}": {error}',
  },

  // ── Glyph gallery ──────────────────────────────────────
  glyphGallery: {
    hint: 'Click a glyph to inspect. Use buttons to delete or retrace individual characters.',
    width: 'Width: {width}',
    pathCommands: '{count} path commands',
    retrace: 'Retrace',
  },

  // ── Kerning editor ─────────────────────────────────────
  kerningEditor: {
    title: 'Kerning Pairs',
    addCommon: 'Add common pairs',
    clearAll: 'Clear all',
    addPair: 'Add pair',
    valuesInFontUnits: 'Values in font units',
    removePairAria: 'Remove pair {pair}',
    noPairs: 'No kerning pairs defined. Click "Add common pairs" to get started.',
  },

  // ── Generate step ──────────────────────────────────────
  generate: {
    title: 'Generate Font',
    fontName: 'Font Name',
    glyphCount: '{count} glyphs ready to include',
    generateBtn: 'Generate TTF Font',
    generating: 'Generating...',
    success: 'Font generated successfully!',
    download: 'Download {name}.ttf',
    regenerate: 'Regenerate with different settings',
    errorNoGlyphs: 'No traced glyphs available. Go back to the Preview step.',
    errorBuild: 'Font generation failed: {error}. Try going back to Preview and removing problematic glyphs.',
  },
};
