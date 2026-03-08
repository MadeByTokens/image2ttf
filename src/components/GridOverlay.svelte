<script>
  import { appState, setError, resyncCharMap } from '../lib/store.svelte.js';
  import { autoDetectGrid } from '../lib/segmentation.js';
  import { DEFAULT_CHARSET, DARK_PIXEL_THRESHOLD, ROW_DENSITY_THRESHOLD, COL_DENSITY_THRESHOLD, MIN_ROW_HEIGHT, MIN_COL_WIDTH, MIN_GAP_FRACTION } from '../lib/constants.js';
  import { onMount, untrack } from 'svelte';

  let canvasEl = $state(null);
  let containerEl = $state(null);
  let displayScale = 1;
  let mode = $state('auto'); // 'auto' | 'edit'
  let selectedCell = $state(null);
  let dragState = $state(null);
  let contextMenu = $state(null);
  let showAdvanced = $state(false);

  // Advanced parameters (editable copies of constants)
  let darkThreshold = $state(DARK_PIXEL_THRESHOLD);
  let rowDensity = $state(ROW_DENSITY_THRESHOLD);
  let colDensity = $state(COL_DENSITY_THRESHOLD);
  let minRowH = $state(MIN_ROW_HEIGHT);
  let minColW = $state(MIN_COL_WIDTH);
  let gapFraction = $state(MIN_GAP_FRACTION);

  /** Full reset: re-run auto-detection from scratch, replacing grid and labels */
  function resetDetection() {
    if (!appState.imageCanvas) return;
    try {
      const ctx = appState.imageCanvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, appState.imageCanvas.width, appState.imageCanvas.height);
      const grid = autoDetectGrid(imageData, {
        darkPixelThreshold: darkThreshold,
        rowDensityThreshold: rowDensity,
        colDensityThreshold: colDensity,
        minRowHeight: minRowH,
        minColWidth: minColW,
        minGapFraction: gapFraction
      });

      if (grid.cells.length === 0) {
        setError('Could not detect character rows. Try adjusting the image or parameters.');
        return;
      }

      appState.grid = grid;
      const flatCells = grid.cells.flat();
      appState.charMap = DEFAULT_CHARSET.slice(0, flatCells.length);
      selectedCell = null;
      contextMenu = null;
      drawOverlay();
    } catch (err) {
      setError('Grid detection failed: ' + err.message);
    }
  }

  /** Re-detect labels: keep current bboxes, re-assign labels from DEFAULT_CHARSET */
  function redetectLabels() {
    if (!appState.grid) return;
    resyncCharMap();
    drawOverlay();
  }

  onMount(() => {
    if (appState.imageCanvas && !appState.grid) {
      resetDetection();
    } else if (appState.grid) {
      drawOverlay();
    }
  });

  function applyUniformGrid() {
    if (!appState.imageCanvas) return;
    const input = prompt('Enter rows x cols (e.g. "5x22"):', '5x22');
    if (!input) return;
    const match = input.match(/^(\d+)\s*[x×,]\s*(\d+)$/i);
    if (!match) {
      setError('Invalid format. Use "rows x cols" like "5x22".');
      return;
    }
    const numRows = parseInt(match[1]);
    const numCols = parseInt(match[2]);
    if (numRows < 1 || numCols < 1 || numRows > 50 || numCols > 100) {
      setError('Rows must be 1-50, cols must be 1-100.');
      return;
    }

    const imgW = appState.imageCanvas.width;
    const imgH = appState.imageCanvas.height;
    const cellW = Math.floor(imgW / numCols);
    const cellH = Math.floor(imgH / numRows);

    const rows = [];
    const cells = [];
    for (let r = 0; r < numRows; r++) {
      const y = r * cellH;
      const h = r === numRows - 1 ? imgH - y : cellH;
      rows.push({ start: y, end: y + h });
      const rowCells = [];
      for (let c = 0; c < numCols; c++) {
        const x = c * cellW;
        const w = c === numCols - 1 ? imgW - x : cellW;
        rowCells.push({ x, y, w, h });
      }
      cells.push(rowCells);
    }

    appState.grid = { rows, cells };
    const totalCells = numRows * numCols;
    appState.charMap = DEFAULT_CHARSET.slice(0, totalCells);
    while (appState.charMap.length < totalCells) {
      appState.charMap.push('?');
    }
    selectedCell = null;
    contextMenu = null;
    drawOverlay();
  }

  function drawOverlay() {
    if (!canvasEl || !appState.imageCanvas || !appState.grid) return;

    const img = appState.imageCanvas;
    const maxWidth = containerEl?.clientWidth || 800;
    displayScale = Math.min(1, maxWidth / img.width);

    canvasEl.width = img.width * displayScale;
    canvasEl.height = img.height * displayScale;

    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);

    const cells = appState.grid.cells;

    let charIdx = 0;
    for (let ri = 0; ri < cells.length; ri++) {
      for (let ci = 0; ci < cells[ri].length; ci++) {
        const cell = cells[ri][ci];
        const isSelected = selectedCell && selectedCell.rowIdx === ri && selectedCell.colIdx === ci;

        if (isSelected) {
          ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
          ctx.fillRect(
            cell.x * displayScale, cell.y * displayScale,
            cell.w * displayScale, cell.h * displayScale
          );
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
          ctx.lineWidth = 2.5;
        } else {
          ctx.strokeStyle = 'rgba(79, 70, 229, 0.6)';
          ctx.lineWidth = 1.5;
        }

        ctx.strokeRect(
          cell.x * displayScale, cell.y * displayScale,
          cell.w * displayScale, cell.h * displayScale
        );

        if (charIdx < appState.charMap.length) {
          ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.95)' : 'rgba(79, 70, 229, 0.9)';
          ctx.font = `${Math.max(10, 12 * displayScale)}px monospace`;
          ctx.fillText(
            appState.charMap[charIdx],
            cell.x * displayScale + 2,
            cell.y * displayScale + 12 * displayScale
          );
        }
        charIdx++;
      }
    }

    // Draw row separators in edit mode (dashed lines between rows)
    if (mode === 'edit' && cells.length > 1) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(234, 88, 12, 0.8)'; // orange
      for (let ri = 0; ri < cells.length; ri++) {
        const row = appState.grid.rows[ri];
        // Draw top boundary of each row
        const y = row.start * displayScale;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasEl.width, y);
        ctx.stroke();
        // Draw bottom boundary of last row
        if (ri === cells.length - 1) {
          const yEnd = row.end * displayScale;
          ctx.beginPath();
          ctx.moveTo(0, yEnd);
          ctx.lineTo(canvasEl.width, yEnd);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  $effect(() => {
    const grid = appState.grid;
    const canvas = canvasEl;
    if (grid && canvas) {
      untrack(() => drawOverlay());
    }
  });

  // --- Edit mode interactions ---

  function getCellAt(canvasX, canvasY) {
    if (!appState.grid) return null;
    const imgX = canvasX / displayScale;
    const imgY = canvasY / displayScale;
    const cells = appState.grid.cells;
    for (let ri = 0; ri < cells.length; ri++) {
      for (let ci = 0; ci < cells[ri].length; ci++) {
        const c = cells[ri][ci];
        if (imgX >= c.x && imgX <= c.x + c.w && imgY >= c.y && imgY <= c.y + c.h) {
          return { rowIdx: ri, colIdx: ci };
        }
      }
    }
    return null;
  }

  /** Check if cursor is near a row boundary (between two rows). Returns { rowIdx, boundary } or null. */
  function getRowSeparatorAt(canvasX, canvasY) {
    if (!appState.grid) return null;
    const imgY = canvasY / displayScale;
    const hitZone = 8 / displayScale;
    const rows = appState.grid.rows;
    for (let ri = 0; ri < rows.length; ri++) {
      // Top boundary (shared with previous row's bottom)
      if (Math.abs(imgY - rows[ri].start) < hitZone) {
        return { rowIdx: ri, boundary: 'top' };
      }
      // Bottom boundary of last row
      if (ri === rows.length - 1 && Math.abs(imgY - rows[ri].end) < hitZone) {
        return { rowIdx: ri, boundary: 'bottom' };
      }
    }
    return null;
  }

  function getEdgeAt(canvasX, canvasY) {
    if (!appState.grid) return null;
    const imgX = canvasX / displayScale;
    const imgY = canvasY / displayScale;
    const hitZone = 8 / displayScale;
    const cells = appState.grid.cells;
    for (let ri = 0; ri < cells.length; ri++) {
      for (let ci = 0; ci < cells[ri].length; ci++) {
        const c = cells[ri][ci];
        if (imgY >= c.y - hitZone && imgY <= c.y + c.h + hitZone) {
          if (Math.abs(imgX - (c.x + c.w)) < hitZone && imgY >= c.y && imgY <= c.y + c.h) {
            return { rowIdx: ri, colIdx: ci, edge: 'right' };
          }
          if (Math.abs(imgX - c.x) < hitZone && imgY >= c.y && imgY <= c.y + c.h) {
            return { rowIdx: ri, colIdx: ci, edge: 'left' };
          }
        }
        if (imgX >= c.x - hitZone && imgX <= c.x + c.w + hitZone) {
          if (Math.abs(imgY - (c.y + c.h)) < hitZone && imgX >= c.x && imgX <= c.x + c.w) {
            return { rowIdx: ri, colIdx: ci, edge: 'bottom' };
          }
          if (Math.abs(imgY - c.y) < hitZone && imgX >= c.x && imgX <= c.x + c.w) {
            return { rowIdx: ri, colIdx: ci, edge: 'top' };
          }
        }
      }
    }
    return null;
  }

  function getRowAt(canvasX, canvasY) {
    if (!appState.grid) return -1;
    const imgY = canvasY / displayScale;
    const rows = appState.grid.rows;
    for (let ri = 0; ri < rows.length; ri++) {
      if (imgY >= rows[ri].start && imgY <= rows[ri].end) return ri;
    }
    return -1;
  }

  function handleCanvasMouseDown(e) {
    if (mode !== 'edit') return;
    contextMenu = null;

    const rect = canvasEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // Check row separator first (higher priority than cell edges)
    const sepHit = getRowSeparatorAt(cx, cy);
    if (sepHit) {
      const rows = appState.grid.rows;
      dragState = {
        type: 'rowSep',
        ...sepHit,
        startY: cy,
        origY: sepHit.boundary === 'top' ? rows[sepHit.rowIdx].start : rows[sepHit.rowIdx].end
      };
      e.preventDefault();
      return;
    }

    const edgeHit = getEdgeAt(cx, cy);
    if (edgeHit) {
      const cell = appState.grid.cells[edgeHit.rowIdx][edgeHit.colIdx];
      dragState = { ...edgeHit, startX: cx, startY: cy, origRect: { ...cell } };
      e.preventDefault();
      return;
    }

    const cellHit = getCellAt(cx, cy);
    if (cellHit) {
      selectedCell = cellHit;
      drawOverlay();
    } else {
      selectedCell = null;
      drawOverlay();
    }
  }

  function handleCanvasMouseMove(e) {
    if (mode !== 'edit' || !canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (dragState) {
      if (dragState.type === 'rowSep') {
        // Dragging a row separator
        const dy = (cy - dragState.startY) / displayScale;
        const newY = Math.max(0, dragState.origY + dy);
        const { rowIdx, boundary } = dragState;
        const rows = appState.grid.rows;
        const cells = appState.grid.cells;

        if (boundary === 'top') {
          // Moving the top of this row (and bottom of previous row if exists)
          const minY = rowIdx > 0 ? rows[rowIdx - 1].start + 10 : 0;
          const maxY = rows[rowIdx].end - 10;
          const clampedY = Math.max(minY, Math.min(maxY, newY));
          rows[rowIdx].start = clampedY;
          if (rowIdx > 0) rows[rowIdx - 1].end = clampedY;
          // Update all cells in this row
          for (const c of cells[rowIdx]) {
            c.y = clampedY;
            c.h = rows[rowIdx].end - clampedY;
          }
          // Update cells in previous row
          if (rowIdx > 0) {
            for (const c of cells[rowIdx - 1]) {
              c.h = clampedY - c.y;
            }
          }
        } else {
          // Moving bottom of last row
          const minY = rows[rowIdx].start + 10;
          const clampedY = Math.max(minY, newY);
          rows[rowIdx].end = clampedY;
          for (const c of cells[rowIdx]) {
            c.h = clampedY - c.y;
          }
        }
        drawOverlay();
        return;
      }

      const dx = (cx - dragState.startX) / displayScale;
      const dy = (cy - dragState.startY) / displayScale;
      const cell = appState.grid.cells[dragState.rowIdx][dragState.colIdx];
      const orig = dragState.origRect;

      if (dragState.edge === 'right') cell.w = Math.max(5, orig.w + dx);
      else if (dragState.edge === 'left') { const nw = orig.w - dx; if (nw > 5) { cell.x = orig.x + dx; cell.w = nw; } }
      else if (dragState.edge === 'bottom') cell.h = Math.max(5, orig.h + dy);
      else if (dragState.edge === 'top') { const nh = orig.h - dy; if (nh > 5) { cell.y = orig.y + dy; cell.h = nh; } }
      drawOverlay();
      return;
    }

    // Cursor hints
    const sepHit = getRowSeparatorAt(cx, cy);
    if (sepHit) {
      canvasEl.style.cursor = 'row-resize';
    } else {
      const edgeHit = getEdgeAt(cx, cy);
      if (edgeHit) {
        canvasEl.style.cursor = (edgeHit.edge === 'left' || edgeHit.edge === 'right') ? 'col-resize' : 'row-resize';
      } else {
        canvasEl.style.cursor = getCellAt(cx, cy) ? 'pointer' : 'default';
      }
    }
  }

  function handleCanvasMouseUp() {
    if (dragState) {
      dragState = null;
      appState.grid = { ...appState.grid };
    }
  }

  function handleCanvasDblClick(e) {
    if (mode !== 'edit' || !appState.grid) return;

    const rect = canvasEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (getCellAt(cx, cy)) return;

    const ri = getRowAt(cx, cy);
    if (ri < 0) return;

    const imgX = cx / displayScale;
    const row = appState.grid.rows[ri];
    const rowCells = appState.grid.cells[ri];

    const avgW = rowCells.length > 0
      ? rowCells.reduce((s, c) => s + c.w, 0) / rowCells.length : 40;

    const newCell = {
      x: Math.max(0, imgX - avgW / 2),
      y: row.start, w: avgW, h: row.end - row.start
    };

    let insertIdx = rowCells.findIndex(c => c.x > newCell.x);
    if (insertIdx === -1) insertIdx = rowCells.length;
    rowCells.splice(insertIdx, 0, newCell);

    appState.grid = { ...appState.grid };
    resyncCharMap();
    selectedCell = { rowIdx: ri, colIdx: insertIdx };
    drawOverlay();
  }

  function handleContextMenu(e) {
    if (mode !== 'edit') return;
    e.preventDefault();

    const rect = canvasEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // Check row separator first
    const sepHit = getRowSeparatorAt(cx, cy);
    if (sepHit) {
      contextMenu = { x: e.clientX, y: e.clientY, ...sepHit, type: 'rowSep' };
      return;
    }

    const cellHit = getCellAt(cx, cy);
    if (cellHit) {
      contextMenu = { x: e.clientX, y: e.clientY, ...cellHit, type: 'cell' };
      selectedCell = cellHit;
      drawOverlay();
    } else {
      const ri = getRowAt(cx, cy);
      if (ri >= 0) {
        const imgX = cx / displayScale;
        contextMenu = { x: e.clientX, y: e.clientY, rowIdx: ri, imgX, type: 'empty' };
      } else {
        // Outside any row — offer to add a row at this Y position
        const imgY = cy / displayScale;
        contextMenu = { x: e.clientX, y: e.clientY, imgY, type: 'noRow' };
      }
    }
  }

  function addCellAtContextMenu() {
    if (!contextMenu || contextMenu.type !== 'empty') return;
    const { rowIdx, imgX } = contextMenu;
    const row = appState.grid.rows[rowIdx];
    const rowCells = appState.grid.cells[rowIdx];
    const avgW = rowCells.length > 0
      ? rowCells.reduce((s, c) => s + c.w, 0) / rowCells.length : 40;
    const newCell = {
      x: Math.max(0, imgX - avgW / 2),
      y: row.start, w: avgW, h: row.end - row.start
    };
    let insertIdx = rowCells.findIndex(c => c.x > newCell.x);
    if (insertIdx === -1) insertIdx = rowCells.length;
    rowCells.splice(insertIdx, 0, newCell);
    appState.grid = { ...appState.grid };
    resyncCharMap();
    selectedCell = { rowIdx, colIdx: insertIdx };
    contextMenu = null;
    drawOverlay();
  }

  /** Add a new row by splitting an existing row at the separator boundary */
  function addRowAtSeparator() {
    if (!contextMenu || contextMenu.type !== 'rowSep') return;
    const { rowIdx, boundary } = contextMenu;
    const rows = appState.grid.rows;
    const cells = appState.grid.cells;

    // Split: insert a new row by dividing this row at its midpoint
    const row = rows[rowIdx];
    const midY = Math.round((row.start + row.end) / 2);
    const newRow = { start: midY, end: row.end };
    row.end = midY;

    // Update existing cells in this row
    for (const c of cells[rowIdx]) {
      c.h = midY - c.y;
    }

    // Create cells for new row (copy column structure)
    const newCells = cells[rowIdx].map(c => ({
      x: c.x, y: midY, w: c.w, h: newRow.end - midY
    }));

    rows.splice(rowIdx + 1, 0, newRow);
    cells.splice(rowIdx + 1, 0, newCells);

    appState.grid = { ...appState.grid };
    resyncCharMap();
    contextMenu = null;
    drawOverlay();
  }

  /** Add a new row below the current row (splits space below it) */
  function addRowBelow() {
    if (!contextMenu) return;
    const { rowIdx } = contextMenu;
    const rows = appState.grid.rows;
    const cells = appState.grid.cells;
    const imgH = appState.imageCanvas.height;

    const currentRow = rows[rowIdx];
    const nextStart = rowIdx + 1 < rows.length ? rows[rowIdx + 1].start : imgH;
    const gap = nextStart - currentRow.end;

    let newStart, newEnd;
    if (gap > 20) {
      // There's space between rows — use it
      newStart = currentRow.end;
      newEnd = nextStart;
    } else {
      // No gap — split the current row's bottom half
      const midY = Math.round((currentRow.start + currentRow.end) / 2);
      newEnd = currentRow.end;
      newStart = midY;
      currentRow.end = midY;
      for (const c of cells[rowIdx]) {
        c.h = midY - c.y;
      }
    }

    const newRow = { start: newStart, end: newEnd };
    // Copy column structure from current row
    const newCells = cells[rowIdx].map(c => ({
      x: c.x, y: newStart, w: c.w, h: newEnd - newStart
    }));

    rows.splice(rowIdx + 1, 0, newRow);
    cells.splice(rowIdx + 1, 0, newCells);

    appState.grid = { ...appState.grid };
    resyncCharMap();
    contextMenu = null;
    drawOverlay();
  }

  /** Delete a row and all its cells */
  function deleteRow() {
    if (!contextMenu) return;
    const rowIdx = contextMenu.rowIdx;
    const rows = appState.grid.rows;
    const cells = appState.grid.cells;
    if (rows.length <= 1) return; // keep at least one row

    rows.splice(rowIdx, 1);
    cells.splice(rowIdx, 1);

    appState.grid = { ...appState.grid };
    resyncCharMap();
    contextMenu = null;
    selectedCell = null;
    drawOverlay();
  }

  /** Add a new row at a Y position outside existing rows */
  function addRowAtPosition() {
    if (!contextMenu || contextMenu.type !== 'noRow') return;
    const imgY = contextMenu.imgY;
    const imgH = appState.imageCanvas.height;
    const imgW = appState.imageCanvas.width;
    const rows = appState.grid.rows;
    const cells = appState.grid.cells;

    // Determine row height from existing rows or default
    const avgH = rows.length > 0
      ? rows.reduce((s, r) => s + (r.end - r.start), 0) / rows.length
      : Math.round(imgH / 5);
    const halfH = Math.round(avgH / 2);
    const start = Math.max(0, Math.round(imgY - halfH));
    const end = Math.min(imgH, start + Math.round(avgH));
    const newRow = { start, end };

    // Find insert position (sorted by Y)
    let insertIdx = rows.findIndex(r => r.start > start);
    if (insertIdx === -1) insertIdx = rows.length;

    // Create default cells (use average column count from existing rows)
    const avgCols = rows.length > 0
      ? Math.round(cells.reduce((s, r) => s + r.length, 0) / cells.length)
      : 10;
    const colW = Math.round(imgW / avgCols);
    const newCells = [];
    for (let c = 0; c < avgCols; c++) {
      const x = c * colW;
      const w = c === avgCols - 1 ? imgW - x : colW;
      newCells.push({ x, y: start, w, h: end - start });
    }

    rows.splice(insertIdx, 0, newRow);
    cells.splice(insertIdx, 0, newCells);

    appState.grid = { ...appState.grid };
    resyncCharMap();
    contextMenu = null;
    drawOverlay();
  }

  function splitCell() {
    if (!contextMenu) return;
    const { rowIdx, colIdx } = contextMenu;
    const cells = appState.grid.cells[rowIdx];
    const cell = cells[colIdx];
    const halfW = cell.w / 2;
    cells.splice(colIdx, 1, { x: cell.x, y: cell.y, w: halfW, h: cell.h }, { x: cell.x + halfW, y: cell.y, w: halfW, h: cell.h });
    appState.grid = { ...appState.grid };
    resyncCharMap();
    contextMenu = null;
    selectedCell = { rowIdx, colIdx };
    drawOverlay();
  }

  function deleteCell() {
    if (!contextMenu) return;
    const { rowIdx, colIdx } = contextMenu;
    appState.grid.cells[rowIdx].splice(colIdx, 1);
    appState.grid = { ...appState.grid };
    resyncCharMap();
    contextMenu = null;
    selectedCell = null;
    drawOverlay();
  }

  function handleWindowClick() {
    if (contextMenu) contextMenu = null;
  }

  /** Get flat index for a cell given row/col indices */
  function getFlatIndex(rowIdx, colIdx) {
    if (!appState.grid) return -1;
    let idx = 0;
    for (let r = 0; r < rowIdx; r++) idx += appState.grid.cells[r].length;
    return idx + colIdx;
  }

  /** Update the label for a single cell */
  function updateCellLabel(rowIdx, colIdx, newChar) {
    const idx = getFlatIndex(rowIdx, colIdx);
    if (idx >= 0 && idx < appState.charMap.length && newChar.length === 1) {
      appState.charMap[idx] = newChar;
      appState.charMap = [...appState.charMap]; // trigger reactivity
      drawOverlay();
    }
  }

  /** Relabel from a given cell onward using DEFAULT_CHARSET starting at a given char */
  function relabelFrom(rowIdx, colIdx, startChar) {
    const flatIdx = getFlatIndex(rowIdx, colIdx);
    if (flatIdx < 0) return;
    const charsetIdx = DEFAULT_CHARSET.indexOf(startChar);
    if (charsetIdx < 0) return;
    for (let i = flatIdx, ci = charsetIdx; i < appState.charMap.length && ci < DEFAULT_CHARSET.length; i++, ci++) {
      appState.charMap[i] = DEFAULT_CHARSET[ci];
    }
    appState.charMap = [...appState.charMap];
    drawOverlay();
  }

  function promptRelabel() {
    if (!contextMenu) return;
    const { rowIdx, colIdx } = contextMenu;
    const flatIdx = getFlatIndex(rowIdx, colIdx);
    const currentChar = appState.charMap[flatIdx] || '?';
    const input = prompt(
      `Relabel from this cell onward.\nEnter the character this cell should be (current: "${currentChar}"):`,
      currentChar
    );
    if (input && input.length === 1) {
      relabelFrom(rowIdx, colIdx, input);
    }
    contextMenu = null;
  }

  function promptChangeLabel() {
    if (!contextMenu) return;
    const { rowIdx, colIdx } = contextMenu;
    const flatIdx = getFlatIndex(rowIdx, colIdx);
    const currentChar = appState.charMap[flatIdx] || '?';
    const input = prompt(`Change label for this cell (current: "${currentChar}"):`, currentChar);
    if (input && input.length === 1) {
      updateCellLabel(rowIdx, colIdx, input);
    }
    contextMenu = null;
  }

  const totalCells = $derived(appState.grid ? appState.grid.cells.flat().length : 0);
  const totalRows = $derived(appState.grid ? appState.grid.cells.length : 0);
  const selectedInfo = $derived.by(() => {
    if (!selectedCell || !appState.grid) return null;
    const cell = appState.grid.cells[selectedCell.rowIdx]?.[selectedCell.colIdx];
    if (!cell) return null;
    const idx = getFlatIndex(selectedCell.rowIdx, selectedCell.colIdx);
    return { char: appState.charMap[idx] || '?', w: Math.round(cell.w), h: Math.round(cell.h), idx };
  });
</script>

<svelte:window onmouseup={handleCanvasMouseUp} onclick={handleWindowClick} />

<div class="flex flex-col items-center gap-4">
  <h2 class="text-2xl font-bold">Adjust Grid</h2>
  <p class="text-gray-500 dark:text-gray-400 text-center max-w-md">
    The grid was auto-detected. Verify that each character is in its own box.
  </p>

  <!-- Toolbar -->
  <div class="flex flex-wrap items-center gap-2">
    <button
      onclick={applyUniformGrid}
      class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
             hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >Uniform Grid</button>
    <button
      onclick={redetectLabels}
      class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
             hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      title="Keep current boxes, re-assign labels from charset"
    >Re-label</button>
    <button
      onclick={resetDetection}
      class="px-3 py-1.5 text-sm rounded-lg border border-red-300 dark:border-red-600
             text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      title="Re-run full auto-detection, replacing all boxes and labels"
    >Reset</button>
    <div class="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
      <button
        onclick={() => { mode = 'auto'; selectedCell = null; contextMenu = null; drawOverlay(); }}
        class="px-3 py-1.5 text-sm transition-colors {mode === 'auto'
          ? 'bg-indigo-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
      >Auto</button>
      <button
        onclick={() => { mode = 'edit'; }}
        class="px-3 py-1.5 text-sm transition-colors {mode === 'edit'
          ? 'bg-indigo-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
      >Edit</button>
    </div>
    <button
      onclick={() => { showAdvanced = !showAdvanced; }}
      class="px-3 py-1.5 text-sm rounded-lg border transition-colors
             {showAdvanced
               ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
               : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}"
    >Advanced</button>
  </div>

  <!-- Advanced parameters panel -->
  {#if showAdvanced}
    <div class="w-full max-w-3xl border rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700">
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Tweak detection parameters and click Re-detect to apply.
      </p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
        <label class="flex flex-col gap-1">
          <span class="text-gray-600 dark:text-gray-300">Dark pixel threshold</span>
          <input type="range" min="20" max="200" bind:value={darkThreshold} class="w-full" />
          <span class="text-xs text-gray-400 text-center">{darkThreshold}</span>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-gray-600 dark:text-gray-300">Row density</span>
          <input type="range" min="0.001" max="0.1" step="0.001" bind:value={rowDensity} class="w-full" />
          <span class="text-xs text-gray-400 text-center">{rowDensity.toFixed(3)}</span>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-gray-600 dark:text-gray-300">Column density</span>
          <input type="range" min="0.0005" max="0.05" step="0.0005" bind:value={colDensity} class="w-full" />
          <span class="text-xs text-gray-400 text-center">{colDensity.toFixed(4)}</span>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-gray-600 dark:text-gray-300">Min row height</span>
          <input type="number" min="3" max="100" bind:value={minRowH}
                 class="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 w-full" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-gray-600 dark:text-gray-300">Min col width</span>
          <input type="number" min="1" max="50" bind:value={minColW}
                 class="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 w-full" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-gray-600 dark:text-gray-300">Gap fraction</span>
          <input type="range" min="0.01" max="0.5" step="0.01" bind:value={gapFraction} class="w-full" />
          <span class="text-xs text-gray-400 text-center">{gapFraction.toFixed(2)}</span>
        </label>
      </div>
      <div class="flex gap-2 mt-3">
        <button
          onclick={resetDetection}
          class="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >Apply & Reset</button>
        <button
          onclick={() => { darkThreshold = DARK_PIXEL_THRESHOLD; rowDensity = ROW_DENSITY_THRESHOLD; colDensity = COL_DENSITY_THRESHOLD; minRowH = MIN_ROW_HEIGHT; minColW = MIN_COL_WIDTH; gapFraction = MIN_GAP_FRACTION; }}
          class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >Reset defaults</button>
      </div>
    </div>
  {/if}

  {#if appState.grid}
    <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
      <span>Detected {totalRows} rows, {totalCells} cells</span>
      {#if mode === 'edit' && selectedInfo}
        {@const info = selectedInfo}
        <span class="text-indigo-500 font-medium inline-flex items-center gap-1">
          Selected:
          <input
            type="text"
            value={info.char}
            maxlength="1"
            class="w-8 text-center font-mono font-bold border border-indigo-400 rounded px-0.5 py-0
                   dark:bg-gray-800 dark:border-indigo-500 dark:text-indigo-300
                   focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            oninput={(e) => {
              if (e.target.value.length === 1) {
                updateCellLabel(selectedCell.rowIdx, selectedCell.colIdx, e.target.value);
              }
            }}
            aria-label="Edit label for selected cell"
          />
          ({info.w}&times;{info.h}px)
        </span>
      {/if}
    </div>
  {/if}

  {#if mode === 'edit'}
    <p class="text-xs text-gray-400 dark:text-gray-500 max-w-md text-center">
      Click to select &amp; edit label. Drag cell edges to resize. Drag orange row lines to adjust row boundaries. Double-click to add cell. Right-click for more.
    </p>
  {/if}

  <div bind:this={containerEl} class="w-full max-w-3xl overflow-auto border rounded-lg dark:border-gray-700 relative">
    <canvas
      bind:this={canvasEl}
      class="block mx-auto"
      onmousedown={handleCanvasMouseDown}
      onmousemove={handleCanvasMouseMove}
      ondblclick={handleCanvasDblClick}
      oncontextmenu={handleContextMenu}
    ></canvas>
  </div>

  {#if !appState.grid}
    <p class="text-amber-600 dark:text-amber-400 text-sm">
      Detecting character grid...
    </p>
  {/if}
</div>

<!-- Context menu -->
{#if contextMenu}
  <div
    role="menu"
    tabindex="-1"
    class="fixed z-50 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-lg py-1 min-w-36"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => { if (e.key === 'Escape') contextMenu = null; }}
  >
    {#if contextMenu.type === 'cell'}
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={promptChangeLabel}>
        Change label
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={promptRelabel}>
        Relabel from here...
      </button>
      <hr class="border-gray-200 dark:border-gray-600 my-0.5" />
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={splitCell}>
        Split cell
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400" onclick={deleteCell}>
        Delete cell
      </button>
    {:else if contextMenu.type === 'empty'}
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={addCellAtContextMenu}>
        Add cell here
      </button>
      <hr class="border-gray-200 dark:border-gray-600 my-0.5" />
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => { contextMenu = { ...contextMenu, type: 'rowSep', boundary: 'top' }; addRowAtSeparator(); }}>
        Add row above
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={addRowBelow}>
        Add row below
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400" onclick={() => { contextMenu = { ...contextMenu, type: 'rowSep', boundary: 'top' }; deleteRow(); }}>
        Delete this row
      </button>
    {:else if contextMenu.type === 'rowSep'}
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={addRowAtSeparator}>
        Add row here
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400" onclick={deleteRow}>
        Delete row
      </button>
    {:else if contextMenu.type === 'noRow'}
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={addRowAtPosition}>
        Add row here
      </button>
    {/if}
  </div>
{/if}
