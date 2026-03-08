<script>
  import { appState, setError, resyncCharMap } from '../lib/store.svelte.js';
  import { autoDetectGrid } from '../lib/segmentation.js';
  import { DEFAULT_CHARSET } from '../lib/constants.js';
  import { onMount } from 'svelte';

  let canvasEl = $state(null);
  let containerEl = $state(null);
  let displayScale = $state(1);
  let mode = $state('auto'); // 'auto' | 'edit'
  let selectedCell = $state(null); // { rowIdx, colIdx }
  let dragState = $state(null); // { rowIdx, colIdx, edge, startX, startY, origRect }
  let contextMenu = $state(null); // { x, y, rowIdx, colIdx }

  function runDetection() {
    if (!appState.imageCanvas) return;
    try {
      const ctx = appState.imageCanvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, appState.imageCanvas.width, appState.imageCanvas.height);
      const grid = autoDetectGrid(imageData);

      if (grid.cells.length === 0) {
        setError('Could not detect character rows. Try adjusting the image.');
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

  onMount(() => {
    if (appState.imageCanvas) {
      runDetection();
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
    // Pad with '?' if charset is too small
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

    // Draw cell rectangles
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

        // Draw label
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
  }

  $effect(() => {
    if (appState.grid && canvasEl) {
      drawOverlay();
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
          // Right edge
          if (Math.abs(imgX - (c.x + c.w)) < hitZone && imgY >= c.y && imgY <= c.y + c.h) {
            return { rowIdx: ri, colIdx: ci, edge: 'right' };
          }
          // Left edge
          if (Math.abs(imgX - c.x) < hitZone && imgY >= c.y && imgY <= c.y + c.h) {
            return { rowIdx: ri, colIdx: ci, edge: 'left' };
          }
        }
        if (imgX >= c.x - hitZone && imgX <= c.x + c.w + hitZone) {
          // Bottom edge
          if (Math.abs(imgY - (c.y + c.h)) < hitZone && imgX >= c.x && imgX <= c.x + c.w) {
            return { rowIdx: ri, colIdx: ci, edge: 'bottom' };
          }
          // Top edge
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

    const edgeHit = getEdgeAt(cx, cy);
    if (edgeHit) {
      const cell = appState.grid.cells[edgeHit.rowIdx][edgeHit.colIdx];
      dragState = {
        ...edgeHit,
        startX: cx,
        startY: cy,
        origRect: { ...cell }
      };
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
      const dx = (cx - dragState.startX) / displayScale;
      const dy = (cy - dragState.startY) / displayScale;
      const cell = appState.grid.cells[dragState.rowIdx][dragState.colIdx];
      const orig = dragState.origRect;

      if (dragState.edge === 'right') {
        cell.w = Math.max(5, orig.w + dx);
      } else if (dragState.edge === 'left') {
        const newX = orig.x + dx;
        const newW = orig.w - dx;
        if (newW > 5) {
          cell.x = newX;
          cell.w = newW;
        }
      } else if (dragState.edge === 'bottom') {
        cell.h = Math.max(5, orig.h + dy);
      } else if (dragState.edge === 'top') {
        const newY = orig.y + dy;
        const newH = orig.h - dy;
        if (newH > 5) {
          cell.y = newY;
          cell.h = newH;
        }
      }
      drawOverlay();
      return;
    }

    // Update cursor based on hover
    const edgeHit = getEdgeAt(cx, cy);
    if (edgeHit) {
      canvasEl.style.cursor = (edgeHit.edge === 'left' || edgeHit.edge === 'right')
        ? 'col-resize' : 'row-resize';
    } else {
      canvasEl.style.cursor = getCellAt(cx, cy) ? 'pointer' : 'default';
    }
  }

  function handleCanvasMouseUp() {
    if (dragState) {
      dragState = null;
      // Grid was mutated in-place, trigger reactivity
      appState.grid = { ...appState.grid };
    }
  }

  function handleCanvasDblClick(e) {
    if (mode !== 'edit' || !appState.grid) return;

    const rect = canvasEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // If double-clicking an existing cell, ignore
    if (getCellAt(cx, cy)) return;

    // Find which row we're in
    const ri = getRowAt(cx, cy);
    if (ri < 0) return;

    const imgX = cx / displayScale;
    const row = appState.grid.rows[ri];
    const rowCells = appState.grid.cells[ri];

    // Compute average cell width for this row
    const avgW = rowCells.length > 0
      ? rowCells.reduce((s, c) => s + c.w, 0) / rowCells.length
      : 40;

    const newCell = {
      x: Math.max(0, imgX - avgW / 2),
      y: row.start,
      w: avgW,
      h: row.end - row.start
    };

    // Insert in sorted order by x
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
    const cellHit = getCellAt(cx, cy);
    if (!cellHit) return;

    contextMenu = { x: e.clientX, y: e.clientY, ...cellHit };
    selectedCell = cellHit;
    drawOverlay();
  }

  function splitCell() {
    if (!contextMenu) return;
    const { rowIdx, colIdx } = contextMenu;
    const cells = appState.grid.cells[rowIdx];
    const cell = cells[colIdx];
    const halfW = cell.w / 2;

    const left = { x: cell.x, y: cell.y, w: halfW, h: cell.h };
    const right = { x: cell.x + halfW, y: cell.y, w: halfW, h: cell.h };

    cells.splice(colIdx, 1, left, right);
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

  function closeContextMenu() {
    contextMenu = null;
  }

  // Close context menu on any outside click
  function handleWindowClick() {
    if (contextMenu) contextMenu = null;
  }

  const totalCells = $derived(appState.grid ? appState.grid.cells.flat().length : 0);
  const totalRows = $derived(appState.grid ? appState.grid.cells.length : 0);
  const selectedInfo = $derived(() => {
    if (!selectedCell || !appState.grid) return null;
    const cell = appState.grid.cells[selectedCell.rowIdx]?.[selectedCell.colIdx];
    if (!cell) return null;
    let idx = 0;
    for (let r = 0; r < selectedCell.rowIdx; r++) {
      idx += appState.grid.cells[r].length;
    }
    idx += selectedCell.colIdx;
    return {
      char: appState.charMap[idx] || '?',
      w: Math.round(cell.w),
      h: Math.round(cell.h)
    };
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
    >
      Uniform Grid
    </button>
    <button
      onclick={runDetection}
      class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
             hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >
      Re-detect
    </button>
    <div class="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
      <button
        onclick={() => { mode = 'auto'; selectedCell = null; contextMenu = null; drawOverlay(); }}
        class="px-3 py-1.5 text-sm transition-colors {mode === 'auto'
          ? 'bg-indigo-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
      >
        Auto
      </button>
      <button
        onclick={() => { mode = 'edit'; }}
        class="px-3 py-1.5 text-sm transition-colors {mode === 'edit'
          ? 'bg-indigo-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
      >
        Edit
      </button>
    </div>
  </div>

  {#if appState.grid}
    <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
      <span>Detected {totalRows} rows, {totalCells} cells</span>
      {#if mode === 'edit' && selectedInfo()}
        {@const info = selectedInfo()}
        <span class="text-indigo-500 font-medium">
          Selected: "{info.char}" ({info.w}&times;{info.h}px)
        </span>
      {/if}
    </div>
  {/if}

  {#if mode === 'edit'}
    <p class="text-xs text-gray-400 dark:text-gray-500 max-w-md text-center">
      Click to select. Drag edges to resize. Double-click empty area to add cell. Right-click for split/delete.
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
    <button
      class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700"
      onclick={splitCell}
    >
      Split cell
    </button>
    <button
      class="w-full px-4 py-2 text-sm text-left hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
      onclick={deleteCell}
    >
      Delete cell
    </button>
  </div>
{/if}
