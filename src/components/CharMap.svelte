<script>
  import { appState } from '../lib/store.svelte.js';
  import { generateThumbnailsAsync, abortCompute } from '../lib/compute.js';
  import { createLogger } from '../lib/logger.js';

  const logger = createLogger('CharMap');

  let thumbnails = $state([]);
  let computing = $state(false);
  let progress = $state({ current: 0, total: 0 });
  let adjustingChar = $state(null);  // char being adjusted, or null

  // Generate thumbnails when this step is shown
  $effect(() => {
    if (appState.grid && appState.imageCanvas && appState.charMap.length > 0) {
      generateThumbnails();
    }
  });

  async function generateThumbnails() {
    computing = true;
    progress = { current: 0, total: 0 };

    try {
      const rawThumbs = await generateThumbnailsAsync(
        appState.imageCanvas,
        appState.grid.cells,
        appState.charMap,
        (current, total) => { progress = { current, total }; }
      );

      // Convert ImageData to data URLs on main thread (fast)
      const thumbs = [];
      for (const thumb of rawThumbs) {
        let dataUrl = '';
        if (!thumb.empty && thumb.imageData) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = thumb.imageData.width;
          tempCanvas.height = thumb.imageData.height;
          const ctx = tempCanvas.getContext('2d');
          ctx.putImageData(thumb.imageData, 0, 0);
          dataUrl = tempCanvas.toDataURL();
        }
        thumbs.push({
          char: thumb.char,
          dataUrl,
          empty: thumb.empty,
          index: thumb.index
        });
      }
      thumbnails = thumbs;
    } catch (err) {
      if (err.message === 'Aborted') return;
      logger.warn('Thumbnail generation failed:', err);
    } finally {
      computing = false;
    }
  }

  function updateChar(index, newChar) {
    appState.charMap[index] = newChar;
  }

  function openAdjustDialog(char) {
    if (!char || char === ' ') return;
    adjustingChar = char;
  }

  function getAdj(char) {
    return appState.glyphAdjustments[char] || { baseline: 0, bearingLeft: 0, bearingRight: 0 };
  }

  function setAdj(char, field, value) {
    const current = getAdj(char);
    const updated = { ...current, [field]: Number(value) };
    if (updated.baseline === 0 && updated.bearingLeft === 0 && updated.bearingRight === 0) {
      const copy = { ...appState.glyphAdjustments };
      delete copy[char];
      appState.glyphAdjustments = copy;
    } else {
      appState.glyphAdjustments = { ...appState.glyphAdjustments, [char]: updated };
    }
  }

  function resetAdj(char) {
    const copy = { ...appState.glyphAdjustments };
    delete copy[char];
    appState.glyphAdjustments = copy;
  }

  function hasAdj(char) {
    const a = appState.glyphAdjustments[char];
    return a && (a.baseline !== 0 || a.bearingLeft !== 0 || a.bearingRight !== 0);
  }

  const adjustingThumb = $derived(
    adjustingChar ? thumbnails.find(t => t.char === adjustingChar) : null
  );
  const adjustingAdj = $derived(adjustingChar ? getAdj(adjustingChar) : null);
</script>

<div class="flex flex-col items-center gap-4">
  <h2 class="text-2xl font-bold">Character Map</h2>
  <p class="text-gray-500 dark:text-gray-400 text-center max-w-md">
    Verify each detected character is labeled correctly. Click a thumbnail to adjust glyph metrics.
  </p>

  {#if computing}
    <div class="flex flex-col items-center gap-2 py-8">
      <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        Generating thumbnails...
        {#if progress.total > 0}
          <span class="text-xs">{progress.current}/{progress.total}</span>
        {/if}
      </div>
      {#if progress.total > 0}
        <div class="w-48 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div class="h-full bg-indigo-500 rounded-full transition-all"
               style="width: {progress.current / progress.total * 100}%"></div>
        </div>
      {/if}
      <button
        onclick={() => { abortCompute(); computing = false; }}
        class="px-3 py-1 text-xs rounded border border-gray-400 dark:border-gray-500
               text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >Cancel</button>
    </div>
  {/if}

  <div class="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-13 gap-2 w-full max-w-4xl">
    {#each thumbnails as thumb (thumb.index)}
      <div class="flex flex-col items-center gap-1 p-1 rounded border transition-colors
                  {thumb.empty ? 'opacity-40' : ''}
                  {hasAdj(thumb.char) ? 'border-amber-400 dark:border-amber-500' : 'dark:border-gray-700'}">
        <button
          onclick={() => openAdjustDialog(thumb.char)}
          class="w-12 h-12 flex items-center justify-center bg-white dark:bg-gray-800 rounded overflow-hidden
                 cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all relative"
          aria-label="Adjust metrics for {thumb.char}"
        >
          {#if thumb.dataUrl}
            <img src={thumb.dataUrl} alt={thumb.char} class="max-w-full max-h-full object-contain" />
          {:else}
            <span class="text-gray-300 text-xs">empty</span>
          {/if}
          {#if hasAdj(thumb.char)}
            <span class="absolute top-0 right-0 w-2 h-2 bg-amber-400 rounded-full"></span>
          {/if}
        </button>
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

  <!-- Space width control -->
  <div class="w-full max-w-sm flex flex-col items-center gap-1 mt-2">
    <label class="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
      Space width:
      <input
        type="range"
        min="20"
        max="150"
        bind:value={appState.spaceWidthPercent}
        class="w-32"
      />
      <span class="text-xs text-gray-400 w-10 text-center">{appState.spaceWidthPercent}%</span>
    </label>
    <p class="text-xs text-gray-400 dark:text-gray-500">
      Percentage of average lowercase letter width
    </p>
  </div>

  {#if thumbnails.length === 0 && !computing}
    <p class="text-amber-600 dark:text-amber-400 text-sm">
      No cells detected. Go back and check the grid.
    </p>
  {/if}
</div>

<!-- Glyph adjustment dialog -->
{#if adjustingChar && adjustingAdj}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    onclick={(e) => { if (e.target === e.currentTarget) adjustingChar = null; }}
    onkeydown={(e) => { if (e.key === 'Escape') adjustingChar = null; }}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Adjust glyph metrics for {adjustingChar}"
  >
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold">
          Adjust "<span class="font-mono">{adjustingChar}</span>"
        </h3>
        <button
          onclick={() => { adjustingChar = null; }}
          class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Close"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Visual preview with adjustment guides -->
      {#if adjustingThumb?.dataUrl && adjustingAdj}
        {@const bl = adjustingAdj.baseline}
        {@const bL = adjustingAdj.bearingLeft}
        {@const bR = adjustingAdj.bearingRight}
        {@const scale = 0.12}
        {@const imgShiftY = -bl * scale}
        {@const leftW = Math.max(0, bL * scale)}
        {@const rightW = Math.max(0, bR * scale)}
        <div class="flex justify-center mb-4">
          <div class="relative bg-gray-50 dark:bg-gray-900 rounded-lg border dark:border-gray-700 overflow-hidden"
               style="width: 160px; height: 100px;">
            <!-- Left bearing indicator -->
            {#if bL !== 0}
              <div class="absolute top-0 bottom-0 left-0 border-r-2 transition-all
                          {bL > 0 ? 'bg-blue-200 dark:bg-blue-900/30 border-blue-400' : 'bg-red-200 dark:bg-red-900/30 border-red-400'}"
                   style="width: {Math.abs(bL * scale)}px;"></div>
            {/if}
            <!-- Right bearing indicator -->
            {#if bR !== 0}
              <div class="absolute top-0 bottom-0 right-0 border-l-2 transition-all
                          {bR > 0 ? 'bg-blue-200 dark:bg-blue-900/30 border-blue-400' : 'bg-red-200 dark:bg-red-900/30 border-red-400'}"
                   style="width: {Math.abs(bR * scale)}px;"></div>
            {/if}
            <!-- Baseline reference line (fixed) -->
            <div class="absolute left-0 right-0 border-t border-dashed border-gray-300 dark:border-gray-600"
                 style="top: 75%;"></div>
            <!-- Glyph image (shifts with baseline) -->
            <div class="absolute inset-0 flex items-center justify-center transition-transform"
                 style="transform: translateY({imgShiftY}px); padding-left: {leftW}px; padding-right: {rightW}px;">
              <img src={adjustingThumb.dataUrl} alt={adjustingChar} class="max-w-full max-h-full object-contain" />
            </div>
            <!-- Adjusted baseline line -->
            {#if bl !== 0}
              <div class="absolute left-0 right-0 border-t-2 border-amber-500 dark:border-amber-400 transition-all"
                   style="top: calc(75% + {imgShiftY}px);"></div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Sliders -->
      <div class="flex flex-col gap-4">
        <label class="block">
          <span class="text-sm text-gray-600 dark:text-gray-300 flex items-center justify-between mb-1">
            <span>Baseline offset</span>
            <span class="text-xs font-mono text-gray-400 w-12 text-right">{adjustingAdj.baseline}</span>
          </span>
          <input
            type="range"
            min="-200"
            max="200"
            step="5"
            value={adjustingAdj.baseline}
            oninput={(e) => setAdj(adjustingChar, 'baseline', e.target.value)}
            class="w-full"
          />
          <span class="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>Down</span>
            <span>Up</span>
          </span>
        </label>

        <label class="block">
          <span class="text-sm text-gray-600 dark:text-gray-300 flex items-center justify-between mb-1">
            <span>Left bearing</span>
            <span class="text-xs font-mono text-gray-400 w-12 text-right">{adjustingAdj.bearingLeft}</span>
          </span>
          <input
            type="range"
            min="-100"
            max="200"
            step="5"
            value={adjustingAdj.bearingLeft}
            oninput={(e) => setAdj(adjustingChar, 'bearingLeft', e.target.value)}
            class="w-full"
          />
          <span class="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>Tighter</span>
            <span>Wider</span>
          </span>
        </label>

        <label class="block">
          <span class="text-sm text-gray-600 dark:text-gray-300 flex items-center justify-between mb-1">
            <span>Right bearing</span>
            <span class="text-xs font-mono text-gray-400 w-12 text-right">{adjustingAdj.bearingRight}</span>
          </span>
          <input
            type="range"
            min="-100"
            max="200"
            step="5"
            value={adjustingAdj.bearingRight}
            oninput={(e) => setAdj(adjustingChar, 'bearingRight', e.target.value)}
            class="w-full"
          />
          <span class="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>Tighter</span>
            <span>Wider</span>
          </span>
        </label>
      </div>

      <!-- Actions -->
      <div class="flex justify-between mt-5">
        <button
          onclick={() => resetAdj(adjustingChar)}
          class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >Reset</button>
        <button
          onclick={() => { adjustingChar = null; }}
          class="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white
                 hover:bg-indigo-700 transition-colors"
        >Done</button>
      </div>

      <p class="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
        Values in font units. Cleared on re-detect or reset.
      </p>
    </div>
  </div>
{/if}
