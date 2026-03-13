<script>
  import { appState, setError } from '../lib/store.svelte.js';
  import { createFont, injectKernTable, injectGposTable, buildKernPairs } from '../lib/font-builder.js';
  import { smoothnessToOpts } from '../lib/tracing.js';
  import { traceCell } from '../lib/glyph-utils.js';
  import { runTracingAsync, abortCompute } from '../lib/compute.js';
  import { createLogger } from '../lib/logger.js';
  import { onMount, untrack } from 'svelte';
  import GlyphGallery from './GlyphGallery.svelte';
  import KerningEditor from './KerningEditor.svelte';

  const logger = createLogger('Preview');

  let previewText = $state('Hello World');
  let tracing = $state(false);
  let traced = $state(false);
  let fontBlobUrl = $state(null);
  let fontFamily = $state('PreviewFont');
  let fontVersion = 0;
  let showGlyphs = $state(false);
  let glyphEntries = $state([]);
  let selectedGlyph = $state(null);
  let showKerning = $state(false);

  async function startTracing() {
    if (!appState.grid || !appState.imageCanvas || appState.charMap.length === 0) {
      setError('Missing grid or character map data.');
      return;
    }

    tracing = true;
    appState.isProcessing = true;
    appState.progress = 0;

    try {
      const glyphMap = await runTracingAsync(
        appState.imageCanvas,
        appState.grid.cells,
        appState.charMap,
        {
          spaceWidthPercent: appState.spaceWidthPercent,
          detail: appState.detail,
          smoothing: appState.smoothing
        },
        (current, total) => {
          appState.progress = current;
          appState.progressTotal = total;
        }
      );

      appState.glyphPaths = glyphMap;
      traced = true;
      buildGlyphEntries();
      buildPreviewFont();
    } catch (err) {
      if (err.message === 'Aborted') return;
      setError('Tracing failed: ' + err.message + '. Try reducing Smoothness or going back to check the grid.');
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
      entries.push({ char, commands: data.commands, width: data.width });
    }
    glyphEntries = entries;
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
      const refHeight = Math.max(...flatCells.map(c => c.h));
      const tracingOpts = smoothnessToOpts(appState.detail);
      const result = traceCell(appState.imageCanvas, cell, refHeight, tracingOpts, appState.smoothing);

      if (!result) {
        setError(`Cell for "${char}" is empty or produced no paths`);
        return;
      }

      appState.glyphPaths.set(char, result);
      appState.glyphPaths = new Map(appState.glyphPaths);
      buildGlyphEntries();
      buildPreviewFont();
    } catch (err) {
      setError(`Retrace failed for "${char}": ${err.message}`);
    }
  }

  async function buildPreviewFont() {
    if (!appState.glyphPaths || appState.glyphPaths.size === 0) return;

    try {
      fontVersion++;
      const buildVersion = fontVersion;
      const name = `PreviewFont${buildVersion}`;
      const font = createFont(appState.glyphPaths, {
        familyName: name,
        glyphAdjustments: appState.glyphAdjustments
      });

      const kerning = appState.kerningPairs;
      let buffer = font.toArrayBuffer();
      if (kerning && Object.keys(kerning).length > 0) {
        const pairs = buildKernPairs(font, kerning);
        if (pairs.length > 0) {
          buffer = injectGposTable(buffer, pairs);
          buffer = injectKernTable(buffer, pairs);
        }
      }

      const blob = new Blob([buffer], { type: 'font/ttf' });
      const newUrl = URL.createObjectURL(blob);

      const face = new FontFace(name, `url(${newUrl})`);
      await face.load();

      if (buildVersion !== fontVersion) {
        URL.revokeObjectURL(newUrl);
        return;
      }

      document.fonts.add(face);
      if (fontBlobUrl) URL.revokeObjectURL(fontBlobUrl);
      fontBlobUrl = newUrl;
      fontFamily = name;
    } catch (err) {
      logger.warn('Preview font build failed:', err);
    }
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
    };
  });

  const tracedCount = $derived(appState.glyphPaths ? appState.glyphPaths.size : 0);
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
          class="h-full bg-teal-500 rounded-full transition-all"
          style="width: {appState.progressTotal > 0 ? (appState.progress / appState.progressTotal * 100) : 0}%"
        ></div>
      </div>
      <button
        onclick={() => { abortCompute(); tracing = false; appState.isProcessing = false; }}
        class="px-3 py-1 text-xs rounded border border-gray-400 dark:border-gray-500
               text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >Cancel</button>
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
                 ? 'border-teal-500 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20'
                 : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}"
      >
        {showGlyphs ? 'Hide' : 'Show'} Glyphs
      </button>
      <button
        onclick={() => { showKerning = !showKerning; }}
        class="px-3 py-1 text-sm rounded-lg border transition-colors
               {showKerning
                 ? 'border-teal-500 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20'
                 : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}"
      >
        Kerning
      </button>
    </div>

    <!-- Detail & Smoothness controls -->
    <div class="w-full max-w-md flex flex-col items-center gap-2">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label class="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
          Detail:
          <input
            type="range"
            min="1"
            max="10"
            bind:value={appState.detail}
            class="w-24"
          />
          <span class="text-xs text-gray-400 w-6 text-center">{appState.detail}</span>
        </label>
        <label class="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
          Smoothing:
          <input
            type="range"
            min="0"
            max="5"
            bind:value={appState.smoothing}
            class="w-24"
          />
          <span class="text-xs text-gray-400 w-4 text-center">{appState.smoothing}</span>
        </label>
        <button
          onclick={() => { tracingStarted = false; traced = false; startTracing(); }}
          disabled={tracing}
          class="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600
                 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors
                 disabled:opacity-40 disabled:cursor-not-allowed"
        >Re-trace</button>
      </div>
      <p class="text-xs text-gray-400 dark:text-gray-500">
        Detail: 1 = many points, 10 = fewer points. Smoothing: 0 = sharp, 5 = very smooth curves.
      </p>
    </div>

    <!-- Glyph gallery -->
    {#if showGlyphs}
      <GlyphGallery
        {glyphEntries}
        bind:selectedGlyph
        onretrace={retraceGlyph}
        ondelete={deleteGlyph}
        glyphAdjustments={appState.glyphAdjustments}
      />
    {/if}

    <!-- Kerning controls -->
    {#if showKerning}
      <KerningEditor onrebuild={buildPreviewFont} />
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
               focus:ring-2 focus:ring-teal-500 focus:outline-none"
        placeholder="Type something..."
      />
    </div>

    <div class="w-full max-w-lg min-h-24 p-6 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 flex items-center justify-center">
      {#if fontBlobUrl}
        <p style="font-family: '{fontFamily}', monospace; font-size: 2rem; line-height: 1.4; word-break: break-word; white-space: pre-wrap; font-kerning: normal; font-feature-settings: 'kern' 1;"
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
