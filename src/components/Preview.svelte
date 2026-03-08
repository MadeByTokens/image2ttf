<script>
  import { appState, setError } from '../lib/store.svelte.js';
  import { runTracing } from '../lib/pipeline.js';
  import { createFont } from '../lib/font-builder.js';
  import { onMount } from 'svelte';

  let previewText = $state('Hello World');
  let tracing = $state(false);
  let traced = $state(false);
  let fontBlobUrl = $state(null);
  let styleEl = $state(null);

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
        }
      );

      appState.glyphPaths = glyphMap;
      traced = true;
      buildPreviewFont();
    } catch (err) {
      setError('Tracing failed: ' + err.message);
    } finally {
      tracing = false;
      appState.isProcessing = false;
    }
  }

  function buildPreviewFont() {
    if (!appState.glyphPaths || appState.glyphPaths.size === 0) return;

    try {
      const font = createFont(appState.glyphPaths, { familyName: 'PreviewFont' });
      const buffer = font.toArrayBuffer();
      const blob = new Blob([buffer], { type: 'font/ttf' });

      // Clean up old blob URL
      if (fontBlobUrl) {
        URL.revokeObjectURL(fontBlobUrl);
      }
      fontBlobUrl = URL.createObjectURL(blob);

      // Inject @font-face style
      if (!styleEl) {
        styleEl = document.createElement('style');
        document.head.appendChild(styleEl);
      }
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

  // Auto-start tracing once when step is shown
  let tracingStarted = false;
  $effect(() => {
    if (appState.grid && appState.imageCanvas && !tracingStarted) {
      tracingStarted = true;
      startTracing();
    }
  });

  // Rebuild preview font when glyphPaths changes after initial trace
  $effect(() => {
    if (traced && appState.glyphPaths) {
      buildPreviewFont();
    }
  });

  // Cleanup on unmount
  onMount(() => {
    return () => {
      if (fontBlobUrl) {
        URL.revokeObjectURL(fontBlobUrl);
      }
      if (styleEl) {
        styleEl.remove();
      }
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
          class="h-full bg-indigo-500 rounded-full transition-all"
          style="width: {appState.progressTotal > 0 ? (appState.progress / appState.progressTotal * 100) : 0}%"
        ></div>
      </div>
    </div>
  {:else if traced}
    <p class="text-sm text-green-600 dark:text-green-400">
      {tracedCount} glyphs traced successfully
    </p>

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
        <p style="font-family: 'PreviewFont', monospace; font-size: 2rem; line-height: 1.4; word-break: break-word;"
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
