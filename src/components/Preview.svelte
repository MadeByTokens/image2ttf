<script>
  import { appState, setError } from '../lib/store.svelte.js';
  import { runTracing } from '../lib/pipeline.js';
  import { createFont, injectKernTable, buildKernPairs } from '../lib/font-builder.js';
  import { cropCell } from '../lib/segmentation.js';
  import { traceGlyph, svgPathToOpentypePath, cleanupPaths, smoothnessToOpts } from '../lib/tracing.js';
  import { EM_SQUARE, ASCENDER } from '../lib/constants.js';
  import { onMount, untrack } from 'svelte';

  let previewText = $state('Hello World');
  let tracing = $state(false);
  let traced = $state(false);
  let fontBlobUrl = $state(null);
  let styleEl = $state(null);
  let showGlyphs = $state(false);
  let glyphEntries = $state([]);
  let selectedGlyph = $state(null);
  let showKerning = $state(false);
  let newPairLeft = $state('');
  let newPairRight = $state('');

  // Common kerning pairs that typically need adjustment
  const COMMON_PAIRS = [
    'AV','AW','AT','AY','AC','AO',
    'FA','LT','LV','LW','LY',
    'PA','TA','TO','Te','To','Tr','Tu','Tw','Ty',
    'VA','Ve','Vo','Wa','We','Wo',
    'Ya','Ye','Yo','av','aw','ay',
  ];

  async function startTracing() {
    if (!appState.grid || !appState.imageCanvas || appState.charMap.length === 0) {
      setError('Missing grid or character map data.');
      return;
    }

    tracing = true;
    appState.isProcessing = true;
    appState.progress = 0;

    try {
      const glyphMap = await runTracing(
        appState.grid.cells,
        appState.charMap,
        appState.imageCanvas,
        (current, total) => {
          appState.progress = current;
          appState.progressTotal = total;
        },
        {
          spaceWidthPercent: appState.spaceWidthPercent,
          smoothness: appState.smoothness
        }
      );

      appState.glyphPaths = glyphMap;
      traced = true;
      buildGlyphEntries();
      buildPreviewFont();
    } catch (err) {
      setError('Tracing failed: ' + err.message);
    } finally {
      tracing = false;
      appState.isProcessing = false;
    }
  }

  function buildGlyphEntries() {
    if (!appState.glyphPaths) return;
    const entries = [];
    for (const [char, data] of appState.glyphPaths) {
      if (char === ' ') continue;
      entries.push({
        char,
        commands: data.commands,
        width: data.width,
        svgPath: commandsToSvgPath(data.commands)
      });
    }
    glyphEntries = entries;
  }

  function commandsToSvgPath(commands) {
    const fy = (y) => ASCENDER - y;
    let d = '';
    for (const cmd of commands) {
      switch (cmd.type) {
        case 'M': d += `M${cmd.x} ${fy(cmd.y)} `; break;
        case 'L': d += `L${cmd.x} ${fy(cmd.y)} `; break;
        case 'Q': d += `Q${cmd.x1} ${fy(cmd.y1)} ${cmd.x} ${fy(cmd.y)} `; break;
        case 'C': d += `C${cmd.x1} ${fy(cmd.y1)} ${cmd.x2} ${fy(cmd.y2)} ${cmd.x} ${fy(cmd.y)} `; break;
        case 'Z': d += 'Z '; break;
      }
    }
    return d.trim();
  }

  function deleteGlyph(char) {
    if (!appState.glyphPaths) return;
    appState.glyphPaths.delete(char);
    appState.glyphPaths = new Map(appState.glyphPaths);
    buildGlyphEntries();
    if (selectedGlyph === char) selectedGlyph = null;
    buildPreviewFont();
  }

  function retraceGlyph(char) {
    if (!appState.grid || !appState.imageCanvas) return;
    const flatCells = appState.grid.cells.flat();
    const idx = appState.charMap.indexOf(char);
    if (idx < 0 || idx >= flatCells.length) {
      setError(`Cannot find cell for "${char}"`);
      return;
    }

    try {
      const cell = flatCells[idx];
      const cropped = cropCell(appState.imageCanvas, cell);
      if (cropped.empty) {
        setError(`Cell for "${char}" is empty`);
        return;
      }

      const tracingOpts = smoothnessToOpts(appState.smoothness);
      const svgPaths = traceGlyph(cropped.imageData, tracingOpts);
      if (svgPaths.length === 0) {
        setError(`No paths traced for "${char}"`);
        return;
      }

      const refHeight = Math.max(...flatCells.map(c => c.h));
      const commands = svgPathToOpentypePath(svgPaths, cropped.imageData.width, cropped.imageData.height, EM_SQUARE, { cellHeight: refHeight, trimOffsetY: cropped.trimRect.y });
      const cleaned = cleanupPaths(commands);
      if (cleaned.length === 0) return;

      let minX = Infinity, maxX = -Infinity;
      for (const cmd of cleaned) {
        if (cmd.x !== undefined) { minX = Math.min(minX, cmd.x); maxX = Math.max(maxX, cmd.x); }
      }
      const width = maxX > minX ? maxX - minX + EM_SQUARE * 0.15 : EM_SQUARE * 0.5;

      appState.glyphPaths.set(char, { commands: cleaned, width: Math.min(width, EM_SQUARE) });
      appState.glyphPaths = new Map(appState.glyphPaths);
      buildGlyphEntries();
      buildPreviewFont();
    } catch (err) {
      setError(`Retrace failed for "${char}": ${err.message}`);
    }
  }

  function buildPreviewFont() {
    if (!appState.glyphPaths || appState.glyphPaths.size === 0) return;

    try {
      const font = createFont(appState.glyphPaths, { familyName: 'PreviewFont' });

      // Set kerning pairs for runtime preview
      const kerning = appState.kerningPairs;
      if (kerning && Object.keys(kerning).length > 0) {
        for (const [pairStr, value] of Object.entries(kerning)) {
          if (pairStr.length !== 2 || value === 0) continue;
          const left = font.charToGlyphIndex(pairStr[0]);
          const right = font.charToGlyphIndex(pairStr[1]);
          if (left > 0 && right > 0) {
            font.kerningPairs[left + ',' + right] = value;
          }
        }
      }

      let buffer = font.toArrayBuffer();

      // Inject kern table into the binary for proper rendering
      if (kerning && Object.keys(kerning).length > 0) {
        const pairs = buildKernPairs(font, kerning);
        if (pairs.length > 0) {
          buffer = injectKernTable(buffer, pairs);
        }
      }

      const blob = new Blob([buffer], { type: 'font/ttf' });

      if (fontBlobUrl) URL.revokeObjectURL(fontBlobUrl);
      fontBlobUrl = URL.createObjectURL(blob);

      if (!styleEl) {
        styleEl = document.createElement('style');
        document.head.appendChild(styleEl);
      }
      // Use unique URL param to force browser to reload the font
      styleEl.textContent = `
        @font-face {
          font-family: 'PreviewFont';
          src: url('${fontBlobUrl}') format('truetype');
          font-weight: normal;
          font-style: normal;
        }
      `;
    } catch (err) {
      console.warn('Preview font build failed:', err);
    }
  }

  // Kerning helpers
  function addCommonPairs() {
    if (!appState.glyphPaths) return;
    const existing = { ...appState.kerningPairs };
    for (const pair of COMMON_PAIRS) {
      if (pair in existing) continue;
      // Only add if both chars exist in the font
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
    buildPreviewFont();
  }

  function removeKernPair(pair) {
    const copy = { ...appState.kerningPairs };
    delete copy[pair];
    appState.kerningPairs = copy;
    buildPreviewFont();
  }

  function clearAllKerning() {
    appState.kerningPairs = {};
    buildPreviewFont();
  }

  let tracingStarted = false;
  $effect(() => {
    if (appState.grid && appState.imageCanvas && !tracingStarted) {
      tracingStarted = true;
      startTracing();
    }
  });

  onMount(() => {
    return () => {
      if (fontBlobUrl) URL.revokeObjectURL(fontBlobUrl);
      if (styleEl) styleEl.remove();
    };
  });

  const tracedCount = $derived(appState.glyphPaths ? appState.glyphPaths.size : 0);
  const kernPairList = $derived(Object.entries(appState.kerningPairs).sort((a, b) => a[0].localeCompare(b[0])));
</script>

<div class="flex flex-col items-center gap-6">
  <h2 class="text-2xl font-bold">Preview</h2>

  {#if tracing}
    <div class="flex flex-col items-center gap-2">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Tracing glyphs... {appState.progress}/{appState.progressTotal}
      </p>
      <div class="w-64 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-indigo-500 rounded-full transition-all"
          style="width: {appState.progressTotal > 0 ? (appState.progress / appState.progressTotal * 100) : 0}%"
        ></div>
      </div>
    </div>
  {:else if traced}
    <div class="flex flex-wrap items-center gap-3">
      <p class="text-sm text-green-600 dark:text-green-400">
        {tracedCount} glyphs traced
      </p>
      <button
        onclick={() => { showGlyphs = !showGlyphs; }}
        class="px-3 py-1 text-sm rounded-lg border transition-colors
               {showGlyphs
                 ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                 : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}"
      >
        {showGlyphs ? 'Hide' : 'Show'} Glyphs
      </button>
      <button
        onclick={() => { showKerning = !showKerning; }}
        class="px-3 py-1 text-sm rounded-lg border transition-colors
               {showKerning
                 ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                 : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}"
      >
        Kerning
      </button>
    </div>

    <!-- Smoothness control -->
    <div class="w-full max-w-sm flex flex-col items-center gap-1">
      <label class="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
        Smoothness:
        <input
          type="range"
          min="1"
          max="10"
          bind:value={appState.smoothness}
          class="w-32"
        />
        <span class="text-xs text-gray-400 w-6 text-center">{appState.smoothness}</span>
        <button
          onclick={() => { tracingStarted = false; traced = false; startTracing(); }}
          disabled={tracing}
          class="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600
                 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors
                 disabled:opacity-40 disabled:cursor-not-allowed"
        >Re-trace</button>
      </label>
      <p class="text-xs text-gray-400 dark:text-gray-500">
        1 = precise details, 10 = smooth curves
      </p>
    </div>

    <!-- Glyph gallery -->
    {#if showGlyphs}
      <div class="w-full max-w-4xl">
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-2 text-center">
          Click a glyph to inspect. Use buttons to delete or retrace individual characters.
        </p>
        <div class="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-13 gap-1.5">
          {#each glyphEntries as entry (entry.char)}
            <button
              onclick={() => { selectedGlyph = selectedGlyph === entry.char ? null : entry.char; }}
              class="flex flex-col items-center gap-0.5 p-1 rounded border transition-colors
                     {selectedGlyph === entry.char
                       ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                       : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'}"
            >
              <svg viewBox="-50 -50 1100 1100" class="w-10 h-10 bg-white dark:bg-gray-800 rounded">
                <path d={entry.svgPath} fill="currentColor" class="text-gray-900 dark:text-gray-100" />
              </svg>
              <span class="text-xs font-mono text-gray-600 dark:text-gray-400">{entry.char}</span>
            </button>
          {/each}
        </div>

        {#if selectedGlyph}
          {@const entry = glyphEntries.find(e => e.char === selectedGlyph)}
          {#if entry}
            <div class="mt-3 p-4 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 flex flex-col sm:flex-row gap-4 items-start">
              <svg viewBox="-50 -50 1100 1100" class="w-32 h-32 border rounded bg-gray-50 dark:bg-gray-900 dark:border-gray-700 shrink-0">
                <path d={entry.svgPath} fill="currentColor" class="text-gray-900 dark:text-gray-100" />
              </svg>
              <div class="flex-1 min-w-0">
                <p class="font-mono text-lg mb-1">"{entry.char}" <span class="text-sm text-gray-400">U+{entry.char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}</span></p>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Width: {Math.round(entry.width)} · {entry.commands.length} path commands
                </p>
                <div class="flex gap-2 mt-3">
                  <button
                    onclick={() => retraceGlyph(entry.char)}
                    class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                           hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >Retrace</button>
                  <button
                    onclick={() => deleteGlyph(entry.char)}
                    class="px-3 py-1.5 text-sm rounded-lg border border-red-300 dark:border-red-600
                           text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >Delete</button>
                </div>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- Kerning controls -->
    {#if showKerning}
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
                   focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
          <input
            type="text"
            maxlength="1"
            bind:value={newPairRight}
            placeholder="V"
            class="w-8 text-center text-sm font-mono border rounded px-1 py-0.5
                   dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200
                   focus:ring-1 focus:ring-indigo-500 focus:outline-none"
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
    {/if}

    <!-- Preview text -->
    <div class="w-full max-w-lg">
      <label for="preview-text" class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
        Type to preview
      </label>
      <input
        id="preview-text"
        type="text"
        bind:value={previewText}
        class="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200
               focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        placeholder="Type something..."
      />
    </div>

    <div class="w-full max-w-lg min-h-24 p-6 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 flex items-center justify-center">
      {#if fontBlobUrl}
        <p style="font-family: 'PreviewFont', monospace; font-size: 2rem; line-height: 1.4; word-break: break-word; white-space: pre-wrap;"
           class="text-gray-900 dark:text-gray-100 text-center w-full">
          {previewText}
        </p>
      {:else}
        <p class="text-gray-400 dark:text-gray-500 text-sm italic">
          Building preview font...
        </p>
      {/if}
    </div>
  {:else}
    <p class="text-gray-500 dark:text-gray-400 text-sm">
      Waiting for tracing to start...
    </p>
  {/if}
</div>
