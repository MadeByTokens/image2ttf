<script>
  import { appState, setError, resyncCharMap } from '../lib/store.svelte.js';
  import { detectGridAsync, redetectColumnsAsync, abortCompute } from '../lib/compute.js';
  import { DEFAULT_CHARSET, DARK_PIXEL_THRESHOLD, ROW_DENSITY_THRESHOLD, COL_DENSITY_THRESHOLD, MIN_ROW_HEIGHT, MIN_COL_WIDTH, MIN_GAP_FRACTION } from '../lib/constants.js';
  import { onMount, untrack } from 'svelte';
  import ContextMenu from './grid/ContextMenu.svelte';
  import AdvancedPanel from './grid/AdvancedPanel.svelte';

  let canvasEl = $state(null);
  let containerEl = $state(null);
  let displayScale = 1;
  let zoomLevel = $state(1);
  let mode = $state('auto'); // 'auto' | 'edit'
  let selectedCell = $state(null);
  let dragState = $state(null);
  let contextMenu = $state(null);
  let showAdvanced = $state(false);
  let computing = $state(false);

  // Advanced parameters (editable copies of constants)
  let darkThreshold = $state(DARK_PIXEL_THRESHOLD);
  let rowDensity = $state(ROW_DENSITY_THRESHOLD);
  let colDensity = $state(COL_DENSITY_THRESHOLD);
  let minRowH = $state(MIN_ROW_HEIGHT);
  let minColW = $state(MIN_COL_WIDTH);
  let gapFraction = $state(MIN_GAP_FRACTION);

  /** Full reset: re-run auto-detection from scratch, replacing grid and labels */
  async function resetDetection() {
    if (!appState.imageCanvas) return;
    computing = true;
    try {
      const grid = await detectGridAsync(appState.imageCanvas, {
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
      appState.glyphAdjustments = {};
      selectedCell = null;
      contextMenu = null;
      drawOverlay();
    } catch (err) {
      if (err.message === 'Aborted') return;
      setError('Grid detection failed: ' + err.message + '. Try adjusting Dark pixel threshold in Advanced settings, or use Uniform Grid.');
    } finally {
      computing = false;
    }
  }

  /** Re-detect labels: keep current bboxes, re-assign labels from DEFAULT_CHARSET */
  function redetectLabels() {
    if (!appState.grid) return;
    resyncCharMap();
    drawOverlay();
  }

  /** Re-detect columns: keep row boundaries, use baseline midpoints as clip bounds */
  async function redetectColumns() {
    if (!appState.grid || !appState.imageCanvas) return;
    computing = true;
    try {
      const result = await redetectColumnsAsync(appState.imageCanvas, appState.grid.rows, {
        darkPixelThreshold: darkThreshold,
        colDensityThreshold: colDensity,
        minColWidth: minColW,
        minGapFraction: gapFraction
      });

      appState.grid = result;
      resyncCharMap();
      appState.glyphAdjustments = {};
      selectedCell = null;
      contextMenu = null;
      drawOverlay();
    } catch (err) {
      if (err.message === 'Aborted') return;
      setError('Column detection failed: ' + err.message);
    } finally {
      computing = false;
    }
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
      const baseline = Math.round(y + h * 0.75);
      rows.push({ start: y, end: y + h, baseline });
      const rowCells = [];
      for (let c = 0; c < numCols; c++) {
        const x = c * cellW;
        const w = c === numCols - 1 ? imgW - x : cellW;
        rowCells.push({ x, y, w, h, baseline });
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
    const baseScale = Math.min(1, maxWidth / img.width);
    displayScale = baseScale * zoomLevel;

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
          ctx.strokeStyle = 'rgba(13, 148, 136, 0.6)';
          ctx.lineWidth = 1.5;
        }

        ctx.strokeRect(
          cell.x * displayScale, cell.y * displayScale,
          cell.w * displayScale, cell.h * displayScale
        );

        if (charIdx < appState.charMap.length) {
          ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.95)' : 'rgba(13, 148, 136, 0.9)';
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

    // Draw row bands, baselines, and boundaries in edit mode
    if (mode === 'edit' && cells.length > 0) {
      const rows = appState.grid.rows;
      const rowColors = [
        { line: 'rgba(234, 88, 12, 0.5)', base: 'rgba(234, 88, 12, 1)', fill: 'rgba(234, 88, 12, 0.06)' },
        { line: 'rgba(6, 182, 212, 0.5)', base: 'rgba(6, 182, 212, 1)', fill: 'rgba(6, 182, 212, 0.06)' },
      ];

      // Draw row band shading
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const color = rowColors[ri % 2];
        const y1 = row.start * displayScale;
        const y2 = row.end * displayScale;
        ctx.fillStyle = color.fill;
        ctx.fillRect(0, y1, canvasEl.width, y2 - y1);
      }

      // Draw overlap zones in red
      for (let ri = 0; ri < rows.length - 1; ri++) {
        const gap = rows[ri + 1].start - rows[ri].end;
        if (gap < 0) {
          const overlapTop = rows[ri + 1].start * displayScale;
          const overlapBot = rows[ri].end * displayScale;
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
          ctx.fillRect(0, overlapTop, canvasEl.width, overlapBot - overlapTop);
        }
      }

      // Draw top/bottom boundaries as subtle dashed lines
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const color = rowColors[ri % 2];
        ctx.strokeStyle = color.line;

        const yTop = row.start * displayScale;
        ctx.beginPath(); ctx.moveTo(0, yTop); ctx.lineTo(canvasEl.width, yTop); ctx.stroke();

        const yBot = row.end * displayScale;
        ctx.beginPath(); ctx.moveTo(0, yBot); ctx.lineTo(canvasEl.width, yBot); ctx.stroke();
      }
      ctx.restore();

      // Draw baselines as prominent solid lines (where characters sit)
      ctx.save();
      ctx.setLineDash([]);
      ctx.lineWidth = 2.5;
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const color = rowColors[ri % 2];
        const baseline = row.baseline ?? Math.round(row.start + (row.end - row.start) * 0.75);
        const yBase = baseline * displayScale;

        ctx.strokeStyle = color.base;
        ctx.beginPath(); ctx.moveTo(0, yBase); ctx.lineTo(canvasEl.width, yBase); ctx.stroke();

        // Row label near baseline
        ctx.fillStyle = color.base;
        ctx.font = `bold ${Math.max(9, 10 * displayScale)}px sans-serif`;
        ctx.fillText(`R${ri + 1}`, 3, yBase - 4);
      }
      ctx.restore();
    }
  }

  $effect(() => {
    const grid = appState.grid;
    const canvas = canvasEl;
    const _mode = mode; // track mode changes to redraw row separators
    const _zoom = zoomLevel; // track zoom changes
    if (grid && canvas) {
      untrack(() => drawOverlay());
    }
  });

  function handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoomLevel = Math.max(0.5, Math.min(5, zoomLevel * delta));
  }

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
    // Check baselines first (highest priority — the main draggable lines)
    for (let ri = 0; ri < rows.length; ri++) {
      const baseline = rows[ri].baseline ?? Math.round(rows[ri].start + (rows[ri].end - rows[ri].start) * 0.75);
      if (Math.abs(imgY - baseline) < hitZone) {
        return { rowIdx: ri, boundary: 'baseline' };
      }
    }
    // Then bottom boundaries
    for (let ri = 0; ri < rows.length; ri++) {
      if (Math.abs(imgY - rows[ri].end) < hitZone) {
        return { rowIdx: ri, boundary: 'bottom' };
      }
    }
    // Then top boundaries
    for (let ri = 0; ri < rows.length; ri++) {
      if (Math.abs(imgY - rows[ri].start) < hitZone) {
        return { rowIdx: ri, boundary: 'top' };
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
      const row = rows[sepHit.rowIdx];
      const origY = sepHit.boundary === 'top' ? row.start
        : sepHit.boundary === 'bottom' ? row.end
        : (row.baseline ?? Math.round(row.start + (row.end - row.start) * 0.75));
      dragState = {
        type: 'rowSep',
        ...sepHit,
        startY: cy,
        origY
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
        const dy = (cy - dragState.startY) / displayScale;
        const newY = Math.max(0, dragState.origY + dy);
        const { rowIdx, boundary } = dragState;
        const rows = appState.grid.rows;

        if (boundary === 'baseline') {
          // Drag baseline — moves the baseline on row AND all cells in that row
          const minY = rows[rowIdx].start + 5;
          const maxY = rows[rowIdx].end - 5;
          const newBaseline = Math.round(Math.max(minY, Math.min(maxY, newY)));
          rows[rowIdx].baseline = newBaseline;
          // Sync baseline to all cells in this row
          for (const c of appState.grid.cells[rowIdx]) {
            c.baseline = newBaseline;
          }
        } else if (boundary === 'top') {
          // Drag row top — does NOT move cell bboxes (they're independent)
          const bl = rows[rowIdx].baseline ?? rows[rowIdx].end;
          const clampedY = Math.max(0, Math.min(bl - 5, newY));
          rows[rowIdx].start = clampedY;
        } else {
          // Drag row bottom — does NOT move cell bboxes (they're independent)
          const bl = rows[rowIdx].baseline ?? rows[rowIdx].start;
          const clampedY = Math.max(bl + 5, newY);
          rows[rowIdx].end = clampedY;
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

    const baseline = row.baseline ?? Math.round(row.start + (row.end - row.start) * 0.75);
    const newCell = {
      x: Math.max(0, imgX - avgW / 2),
      y: row.start, w: avgW, h: row.end - row.start,
      baseline
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
    const baseline = row.baseline ?? Math.round(row.start + (row.end - row.start) * 0.75);
    const newCell = {
      x: Math.max(0, imgX - avgW / 2),
      y: row.start, w: avgW, h: row.end - row.start,
      baseline
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
    const newRow = { start: midY, end: row.end, baseline: Math.round(midY + (row.end - midY) * 0.75) };
    row.end = midY;
    row.baseline = Math.round(row.start + (midY - row.start) * 0.75);

    // Update existing cells in this row
    for (const c of cells[rowIdx]) {
      c.h = midY - c.y;
      c.baseline = row.baseline;
    }

    // Create cells for new row (copy column structure)
    const newCells = cells[rowIdx].map(c => ({
      x: c.x, y: midY, w: c.w, h: newRow.end - midY,
      baseline: newRow.baseline
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

    const newRow = { start: newStart, end: newEnd, baseline: Math.round(newStart + (newEnd - newStart) * 0.75) };
    // Copy column structure from current row
    const newCells = cells[rowIdx].map(c => ({
      x: c.x, y: newStart, w: c.w, h: newEnd - newStart,
      baseline: newRow.baseline
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
    const newRow = { start, end, baseline: Math.round(start + (end - start) * 0.75) };

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
      newCells.push({ x, y: start, w, h: end - start, baseline: newRow.baseline });
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
    cells.splice(colIdx, 1, { x: cell.x, y: cell.y, w: halfW, h: cell.h, baseline: cell.baseline }, { x: cell.x + halfW, y: cell.y, w: halfW, h: cell.h, baseline: cell.baseline });
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
  <h2 class="text-2xl font-bold">Detect</h2>
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
      onclick={redetectColumns}
      class="px-3 py-1.5 text-sm rounded-lg border border-teal-300 dark:border-teal-600
             text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
      title="Keep row boundaries, re-detect columns within each row"
    >Re-detect</button>
    <button
      onclick={resetDetection}
      class="px-3 py-1.5 text-sm rounded-lg border border-red-300 dark:border-red-600
             text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      title="Re-run full auto-detection from scratch, replacing all rows and cells"
    >Reset</button>
    <div class="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
      <button
        onclick={() => { mode = 'auto'; selectedCell = null; contextMenu = null; drawOverlay(); }}
        class="px-3 py-1.5 text-sm transition-colors {mode === 'auto'
          ? 'bg-teal-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
      >Auto</button>
      <button
        onclick={() => { mode = 'edit'; }}
        class="px-3 py-1.5 text-sm transition-colors {mode === 'edit'
          ? 'bg-teal-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
      >Edit</button>
    </div>
    <button
      onclick={() => { showAdvanced = !showAdvanced; }}
      class="px-3 py-1.5 text-sm rounded-lg border transition-colors
             {showAdvanced
               ? 'border-teal-500 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20'
               : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}"
    >Advanced</button>
  </div>

  <!-- Advanced parameters panel -->
  {#if showAdvanced}
    <AdvancedPanel
      bind:darkThreshold
      bind:rowDensity
      bind:colDensity
      bind:minRowH
      bind:minColW
      bind:gapFraction
      onapply={redetectColumns}
    />
  {/if}

  {#if appState.grid}
    <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
      <span>Detected {totalRows} rows, {totalCells} cells</span>
      {#if mode === 'edit' && selectedInfo}
        {@const info = selectedInfo}
        <span class="text-teal-500 font-medium inline-flex items-center gap-1">
          Selected:
          <input
            type="text"
            value={info.char}
            maxlength="1"
            class="w-8 text-center font-mono font-bold border border-teal-400 rounded px-0.5 py-0
                   dark:bg-gray-800 dark:border-teal-500 dark:text-teal-300
                   focus:ring-1 focus:ring-teal-500 focus:outline-none"
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
      Drag the solid baseline to set where characters sit. Drag dashed lines to adjust row bounds. Drag cell edges to resize individually. Double-click to add cell. Right-click for more.
    </p>
  {/if}

  <!-- Zoom controls -->
  <div class="flex items-center gap-2">
    <button
      onclick={() => { zoomLevel = Math.max(0.5, zoomLevel / 1.25); }}
      class="px-2 py-0.5 text-sm rounded border border-gray-300 dark:border-gray-600
             hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      aria-label="Zoom out"
    >-</button>
    <span class="text-xs text-gray-500 dark:text-gray-400 w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
    <button
      onclick={() => { zoomLevel = Math.min(5, zoomLevel * 1.25); }}
      class="px-2 py-0.5 text-sm rounded border border-gray-300 dark:border-gray-600
             hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      aria-label="Zoom in"
    >+</button>
    {#if zoomLevel !== 1}
      <button
        onclick={() => { zoomLevel = 1; }}
        class="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600
               hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >Reset</button>
    {/if}
  </div>

  <div bind:this={containerEl} class="w-full max-w-3xl overflow-auto border rounded-lg dark:border-gray-700 relative max-h-[70vh]"
       onwheel={handleWheel}>
    {#if computing}
      <div class="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm">
        <div class="flex flex-col items-center gap-2">
          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            Detecting...
          </div>
          <button
            onclick={() => { abortCompute(); computing = false; }}
            class="px-3 py-1 text-xs rounded border border-gray-400 dark:border-gray-500
                   text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >Cancel</button>
        </div>
      </div>
    {/if}
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
<ContextMenu
  bind:contextMenu
  onchangelabel={promptChangeLabel}
  onrelabel={promptRelabel}
  onsplitcell={splitCell}
  ondeletecell={deleteCell}
  onaddcell={addCellAtContextMenu}
  onaddrowatseparator={addRowAtSeparator}
  onaddrowbelow={addRowBelow}
  ondeleterow={deleteRow}
  onaddrowatposition={addRowAtPosition}
/>
