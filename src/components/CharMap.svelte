<script>
  import { appState } from '../lib/store.svelte.js';
  import { cropCell } from '../lib/segmentation.js';

  let thumbnails = $state([]);

  // Generate thumbnails when this step is shown
  $effect(() => {
    if (appState.grid && appState.imageCanvas && appState.charMap.length > 0) {
      generateThumbnails();
    }
  });

  function generateThumbnails() {
    const cells = appState.grid.cells.flat();
    const thumbs = [];

    for (let i = 0; i < cells.length && i < appState.charMap.length; i++) {
      try {
        const cropped = cropCell(appState.imageCanvas, cells[i]);
        // Convert to data URL for display
        let dataUrl = '';
        if (!cropped.empty) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = cropped.imageData.width;
          tempCanvas.height = cropped.imageData.height;
          const ctx = tempCanvas.getContext('2d');
          ctx.putImageData(cropped.imageData, 0, 0);
          dataUrl = tempCanvas.toDataURL();
        }
        thumbs.push({
          char: appState.charMap[i],
          dataUrl,
          empty: cropped.empty,
          index: i
        });
      } catch {
        thumbs.push({ char: appState.charMap[i], dataUrl: '', empty: true, index: i });
      }
    }

    thumbnails = thumbs;
  }

  function updateChar(index, newChar) {
    appState.charMap[index] = newChar;
  }
</script>

<div class="flex flex-col items-center gap-4">
  <h2 class="text-2xl font-bold">Character Map</h2>
  <p class="text-gray-500 dark:text-gray-400 text-center max-w-md">
    Verify each detected character is labeled correctly. Click a label to edit.
  </p>

  <div class="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-13 gap-2 w-full max-w-4xl">
    {#each thumbnails as thumb (thumb.index)}
      <div class="flex flex-col items-center gap-1 p-1 rounded border dark:border-gray-700
                  {thumb.empty ? 'opacity-40' : ''}">
        <div class="w-12 h-12 flex items-center justify-center bg-white dark:bg-gray-800 rounded overflow-hidden">
          {#if thumb.dataUrl}
            <img src={thumb.dataUrl} alt={thumb.char} class="max-w-full max-h-full object-contain" />
          {:else}
            <span class="text-gray-300 text-xs">empty</span>
          {/if}
        </div>
        <input
          type="text"
          value={thumb.char}
          maxlength="1"
          class="w-10 text-center text-sm font-mono border rounded px-1 py-0.5
                 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200
                 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          oninput={(e) => updateChar(thumb.index, e.target.value)}
          aria-label="Character label for cell {thumb.index + 1}"
        />
      </div>
    {/each}
  </div>

  {#if thumbnails.length === 0}
    <p class="text-amber-600 dark:text-amber-400 text-sm">
      No cells detected. Go back and check the grid.
    </p>
  {/if}
</div>
