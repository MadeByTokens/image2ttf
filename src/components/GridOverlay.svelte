<script>
  import { appState, setError } from '../lib/store.svelte.js';
  import { autoDetectGrid } from '../lib/segmentation.js';
  import { DEFAULT_CHARSET } from '../lib/constants.js';
  import { onMount } from 'svelte';

  let canvasEl = $state(null);
  let containerEl = $state(null);
  let displayScale = $state(1);

  // Run auto-detection on mount
  onMount(() => {
    if (appState.imageCanvas) {
      try {
        const ctx = appState.imageCanvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, appState.imageCanvas.width, appState.imageCanvas.height);
        const grid = autoDetectGrid(imageData);

        if (grid.cells.length === 0) {
          setError('Could not detect character rows. Try adjusting the image.');
          return;
        }

        appState.grid = grid;

        // Build default charMap from detected cells
        const flatCells = grid.cells.flat();
        appState.charMap = DEFAULT_CHARSET.slice(0, flatCells.length);

        drawOverlay();
      } catch (err) {
        setError('Grid detection failed: ' + err.message);
      }
    }
  });

  function drawOverlay() {
    if (!canvasEl || !appState.imageCanvas || !appState.grid) return;

    const img = appState.imageCanvas;
    // Fit to container
    const maxWidth = containerEl?.clientWidth || 800;
    displayScale = Math.min(1, maxWidth / img.width);

    canvasEl.width = img.width * displayScale;
    canvasEl.height = img.height * displayScale;

    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // Draw image
    ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);

    // Draw grid overlay
    ctx.strokeStyle = 'rgba(79, 70, 229, 0.6)';
    ctx.lineWidth = 1.5;

    const cells = appState.grid.cells;
    for (const row of cells) {
      for (const cell of row) {
        ctx.strokeRect(
          cell.x * displayScale,
          cell.y * displayScale,
          cell.w * displayScale,
          cell.h * displayScale
        );
      }
    }

    // Draw character labels
    ctx.fillStyle = 'rgba(79, 70, 229, 0.9)';
    ctx.font = `${Math.max(10, 12 * displayScale)}px monospace`;

    let charIdx = 0;
    for (const row of cells) {
      for (const cell of row) {
        if (charIdx < appState.charMap.length) {
          ctx.fillText(
            appState.charMap[charIdx],
            cell.x * displayScale + 2,
            cell.y * displayScale + 12 * displayScale
          );
          charIdx++;
        }
      }
    }
  }

  // Redraw when grid changes
  $effect(() => {
    if (appState.grid && canvasEl) {
      drawOverlay();
    }
  });

  const totalCells = $derived(appState.grid ? appState.grid.cells.flat().length : 0);
  const totalRows = $derived(appState.grid ? appState.grid.cells.length : 0);
</script>

<div class="flex flex-col items-center gap-4">
  <h2 class="text-2xl font-bold">Adjust Grid</h2>
  <p class="text-gray-500 dark:text-gray-400 text-center max-w-md">
    The grid was auto-detected. Verify that each character is in its own box.
  </p>

  {#if appState.grid}
    <div class="text-sm text-gray-500 dark:text-gray-400">
      Detected {totalRows} rows, {totalCells} cells
    </div>
  {/if}

  <div bind:this={containerEl} class="w-full max-w-3xl overflow-auto border rounded-lg dark:border-gray-700">
    <canvas
      bind:this={canvasEl}
      class="block mx-auto"
    ></canvas>
  </div>

  {#if !appState.grid}
    <p class="text-amber-600 dark:text-amber-400 text-sm">
      Detecting character grid...
    </p>
  {/if}
</div>
