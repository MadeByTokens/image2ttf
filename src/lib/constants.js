// Default character layout — one string per row, matching the example image
export const DEFAULT_CHAR_LAYOUT = [
  'abcdefghijklm',
  'nopqrstuvwxyz',
  'ABCDEFGHIJKLM',
  'NOPQRSTUVWXYZ',
  "@!1234567890$.,'\"-():;"
];

// Flat character set derived from the layout
export const DEFAULT_CHARSET = DEFAULT_CHAR_LAYOUT.flatMap(row => row.split(''));

// Em square size for the font
export const EM_SQUARE = 1000;

// Default font metrics
export const ASCENDER = 800;
export const DESCENDER = -200;

// Grid detection defaults
export const MIN_ROW_HEIGHT = 10;
export const MIN_COL_WIDTH = 3;
export const DARK_PIXEL_THRESHOLD = 100; // pixels darker than this count as "ink" (aggressive to ignore lined paper)
export const ROW_DENSITY_THRESHOLD = 0.01; // minimum fraction of dark pixels to count as content row
export const COL_DENSITY_THRESHOLD = 0.001;

// Gap detection
export const MIN_GAP_FRACTION = 0.08; // minimum gap size as fraction of average cell size
