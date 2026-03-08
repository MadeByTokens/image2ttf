<script>
  import { DARK_PIXEL_THRESHOLD, ROW_DENSITY_THRESHOLD, COL_DENSITY_THRESHOLD, MIN_ROW_HEIGHT, MIN_COL_WIDTH, MIN_GAP_FRACTION } from '../../lib/constants.js';

  let {
    darkThreshold = $bindable(DARK_PIXEL_THRESHOLD),
    rowDensity = $bindable(ROW_DENSITY_THRESHOLD),
    colDensity = $bindable(COL_DENSITY_THRESHOLD),
    minRowH = $bindable(MIN_ROW_HEIGHT),
    minColW = $bindable(MIN_COL_WIDTH),
    gapFraction = $bindable(MIN_GAP_FRACTION),
    onapply,
  } = $props();

  function resetDefaults() {
    darkThreshold = DARK_PIXEL_THRESHOLD;
    rowDensity = ROW_DENSITY_THRESHOLD;
    colDensity = COL_DENSITY_THRESHOLD;
    minRowH = MIN_ROW_HEIGHT;
    minColW = MIN_COL_WIDTH;
    gapFraction = MIN_GAP_FRACTION;
  }
</script>

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
      onclick={() => onapply?.()}
      class="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
    >Apply</button>
    <button
      onclick={resetDefaults}
      class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >Reset defaults</button>
  </div>
</div>
