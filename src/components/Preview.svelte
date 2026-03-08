<script>
  import { appState, setError } from '../lib/store.svelte.js';
  import { runTracing } from '../lib/pipeline.js';

  let previewText = $state('Hello World');
  let tracing = $state(false);
  let traced = $state(false);

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
    } catch (err) {
      setError('Tracing failed: ' + err.message);
    } finally {
      tracing = false;
      appState.isProcessing = false;
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
      <p class="text-gray-400 dark:text-gray-500 text-sm italic">
        Font preview will be available after generation
      </p>
    </div>
  {:else}
    <p class="text-gray-500 dark:text-gray-400 text-sm">
      Waiting for tracing to start...
    </p>
  {/if}
</div>
