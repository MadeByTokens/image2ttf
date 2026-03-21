<script>
  import { appState, setError } from '../lib/store.svelte.js';
  import { createFont, downloadFont } from '../lib/font-builder.js';
  import { t } from '../lib/i18n.svelte.js';

  let generating = $state(false);
  let generated = $state(false);

  function generate() {
    if (!appState.glyphPaths || appState.glyphPaths.size === 0) {
      setError(t('generate.errorNoGlyphs'));
      return;
    }

    generating = true;

    try {
      const font = createFont(appState.glyphPaths, {
        familyName: appState.fontName || 'MyHandwriting',
        glyphAdjustments: appState.glyphAdjustments
      });
      appState.generatedFont = font;
      generated = true;
    } catch (err) {
      setError(t('generate.errorBuild', { error: err.message }));
    } finally {
      generating = false;
    }
  }

  function download() {
    if (!appState.generatedFont) return;
    const filename = (appState.fontName || 'handwriting').replace(/[^a-zA-Z0-9_-]/g, '_') + '.ttf';
    const kerning = Object.keys(appState.kerningPairs).length > 0 ? appState.kerningPairs : null;
    downloadFont(appState.generatedFont, filename, kerning);
  }

  const glyphCount = $derived(appState.glyphPaths ? appState.glyphPaths.size : 0);
</script>

<div class="flex flex-col items-center gap-6">
  <h2 class="text-2xl font-bold">{t('generate.title')}</h2>

  <div class="w-full max-w-md">
    <label for="font-name" class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
      {t('generate.fontName')}
    </label>
    <input
      id="font-name"
      type="text"
      bind:value={appState.fontName}
      class="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200
             focus:ring-2 focus:ring-teal-500 focus:outline-none"
      placeholder="MyHandwriting"
    />
  </div>

  <div class="text-sm text-gray-500 dark:text-gray-400">
    {t('generate.glyphCount', { count: glyphCount })}
  </div>

  {#if !generated}
    <button
      onclick={generate}
      disabled={generating || !appState.glyphPaths}
      class="px-6 py-3 bg-teal-600 text-white rounded-lg font-semibold
             hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed
             transition-colors"
    >
      {#if generating}
        <svg class="w-4 h-4 animate-spin inline-block mr-1" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        {t('generate.generating')}
      {:else}
        {t('generate.generateBtn')}
      {/if}
    </button>
  {:else}
    <div class="flex flex-col items-center gap-4">
      <div class="flex items-center gap-2 text-green-600 dark:text-green-400">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <span class="font-medium">{t('generate.success')}</span>
      </div>

      <button
        onclick={download}
        class="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold
               hover:bg-green-700 transition-colors flex items-center gap-2"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {t('generate.download', { name: appState.fontName || 'handwriting' })}
      </button>

      <button
        onclick={() => { generated = false; }}
        class="text-sm text-gray-500 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400"
      >
        {t('generate.regenerate')}
      </button>
    </div>
  {/if}
</div>
