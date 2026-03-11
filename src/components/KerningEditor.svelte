<script>
  import { appState } from '../lib/store.svelte.js';

  let { onrebuild } = $props();

  let newPairLeft = $state('');
  let newPairRight = $state('');
  let kernDebounceTimer = null;

  // Common kerning pairs that typically need adjustment
  const COMMON_PAIRS = [
    'AV','AW','AT','AY','AC','AO',
    'FA','LT','LV','LW','LY',
    'PA','TA','TO','Te','To','Tr','Tu','Tw','Ty',
    'VA','Ve','Vo','Wa','We','Wo',
    'Ya','Ye','Yo','av','aw','ay',
  ];

  function addCommonPairs() {
    if (!appState.glyphPaths) return;
    const existing = { ...appState.kerningPairs };
    for (const pair of COMMON_PAIRS) {
      if (pair in existing) continue;
      if (appState.glyphPaths.has(pair[0]) && appState.glyphPaths.has(pair[1])) {
        existing[pair] = 0;
      }
    }
    appState.kerningPairs = existing;
  }

  function addCustomPair() {
    if (newPairLeft.length !== 1 || newPairRight.length !== 1) return;
    const key = newPairLeft + newPairRight;
    if (key in appState.kerningPairs) return;
    appState.kerningPairs = { ...appState.kerningPairs, [key]: 0 };
    newPairLeft = '';
    newPairRight = '';
  }

  function updateKernValue(pair, value) {
    appState.kerningPairs = { ...appState.kerningPairs, [pair]: value };
    clearTimeout(kernDebounceTimer);
    kernDebounceTimer = setTimeout(() => onrebuild?.(), 250);
  }

  function removeKernPair(pair) {
    const copy = { ...appState.kerningPairs };
    delete copy[pair];
    appState.kerningPairs = copy;
    onrebuild?.();
  }

  function clearAllKerning() {
    appState.kerningPairs = {};
    onrebuild?.();
  }

  const kernPairList = $derived(Object.entries(appState.kerningPairs).sort((a, b) => a[0].localeCompare(b[0])));
</script>

<div class="w-full max-w-lg border rounded-lg p-4 bg-white dark:bg-gray-800 dark:border-gray-700">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Kerning Pairs</h3>
    <div class="flex gap-2">
      <button
        onclick={addCommonPairs}
        class="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600
               hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >Add common pairs</button>
      {#if kernPairList.length > 0}
        <button
          onclick={clearAllKerning}
          class="px-2 py-1 text-xs rounded border border-red-300 dark:border-red-600
                 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >Clear all</button>
      {/if}
    </div>
  </div>

  <!-- Add custom pair -->
  <div class="flex items-center gap-2 mb-3">
    <input
      type="text"
      maxlength="1"
      bind:value={newPairLeft}
      placeholder="A"
      class="w-8 text-center text-sm font-mono border rounded px-1 py-0.5
             dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200
             focus:ring-1 focus:ring-teal-500 focus:outline-none"
    />
    <input
      type="text"
      maxlength="1"
      bind:value={newPairRight}
      placeholder="V"
      class="w-8 text-center text-sm font-mono border rounded px-1 py-0.5
             dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200
             focus:ring-1 focus:ring-teal-500 focus:outline-none"
    />
    <button
      onclick={addCustomPair}
      disabled={newPairLeft.length !== 1 || newPairRight.length !== 1}
      class="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600
             hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors
             disabled:opacity-40 disabled:cursor-not-allowed"
    >Add pair</button>
    <span class="text-xs text-gray-400 ml-auto">Values in font units</span>
  </div>

  <!-- Pair list -->
  {#if kernPairList.length > 0}
    <div class="max-h-64 overflow-y-auto space-y-1">
      {#each kernPairList as [pair, value] (pair)}
        <div class="flex items-center gap-2">
          <span class="text-sm font-mono w-8 text-center text-gray-700 dark:text-gray-300">{pair}</span>
          <input
            type="range"
            min="-200"
            max="100"
            value={value}
            oninput={(e) => updateKernValue(pair, parseInt(e.target.value))}
            class="flex-1"
          />
          <input
            type="number"
            min="-200"
            max="100"
            value={value}
            oninput={(e) => updateKernValue(pair, parseInt(e.target.value) || 0)}
            class="w-16 text-center text-xs font-mono border rounded px-1 py-0.5
                   dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
          />
          <button
            onclick={() => removeKernPair(pair)}
            class="text-red-400 hover:text-red-600 text-xs px-1"
            aria-label="Remove pair {pair}"
          >x</button>
        </div>
      {/each}
    </div>
  {:else}
    <p class="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
      No kerning pairs defined. Click "Add common pairs" to get started.
    </p>
  {/if}
</div>
