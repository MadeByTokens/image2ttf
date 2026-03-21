<script>
  import { onMount } from 'svelte';
  import { autoRunFromHash, initApi, parseApiHash } from '../lib/api.js';

  let status = $state('idle');
  let message = $state('Initializing...');
  let progress = $state(0);
  let total = $state(0);
  let fontBlobUrl = $state(null);
  let fontName = $state('MyHandwriting');
  let glyphCount = $state(0);

  const parsed = parseApiHash();
  const params = parsed?.params || {};

  // Poll window.__image2ttf for status updates (the API module is the source of truth)
  let pollTimer;

  function pollStatus() {
    const api = window.__image2ttf;
    if (!api) return;
    status = api.status;
    message = api.message;
    progress = api.progress;
    total = api.total;
    fontBlobUrl = api.fontBlobUrl;
    fontName = api.fontName || 'MyHandwriting';
    glyphCount = api.glyphCount;

    if (status === 'done' || status === 'error') {
      clearInterval(pollTimer);
    }
  }

  onMount(() => {
    initApi();
    pollTimer = setInterval(pollStatus, 200);
    // Auto-run from hash params (async, fire and forget)
    autoRunFromHash();
    return () => clearInterval(pollTimer);
  });

  function download() {
    if (!fontBlobUrl) return;
    const a = document.createElement('a');
    a.href = fontBlobUrl;
    a.download = `${fontName.replace(/[^a-zA-Z0-9_-]/g, '_')}.ttf`;
    a.click();
  }

  const progressPct = $derived(total > 0 ? Math.round(progress / total * 100) : 0);

  const statusIcon = $derived(
    status === 'done' ? '\u2713' :
    status === 'error' ? '\u2717' :
    '\u2022'
  );
</script>

<div class="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
  <div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-lg border dark:border-gray-700 p-6">
    <!-- Header -->
    <div class="flex items-center gap-2 mb-4">
      <h1 class="text-xl font-bold bg-gradient-to-r from-teal-600 to-emerald-500 dark:from-teal-400 dark:to-emerald-300 bg-clip-text text-transparent">
        image2ttf
      </h1>
      <span class="px-2 py-0.5 text-xs font-mono rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
        API Mode
      </span>
    </div>

    <!-- Status -->
    <div id="api-status"
         class="text-sm font-medium mb-3
                {status === 'done' ? 'text-green-600 dark:text-green-400' :
                 status === 'error' ? 'text-red-600 dark:text-red-400' :
                 'text-gray-700 dark:text-gray-300'}">
      {statusIcon} {message}
    </div>

    <!-- Progress bar -->
    {#if status === 'tracing' || status === 'detecting' || status === 'loading' || status === 'building'}
      <div class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
        {#if total > 0}
          <div class="h-full bg-teal-500 rounded-full transition-all" style="width: {progressPct}%"></div>
        {:else}
          <div class="h-full bg-teal-500 rounded-full animate-pulse" style="width: 100%"></div>
        {/if}
      </div>
      {#if total > 0}
        <p class="text-xs text-gray-400 dark:text-gray-500 text-center mb-3">{progress}/{total} ({progressPct}%)</p>
      {/if}
    {/if}

    <!-- Parameters -->
    <div class="text-xs text-gray-500 dark:text-gray-400 space-y-1 mb-4">
      <div><span class="font-medium">Font:</span> {fontName}</div>
      {#if params.detail}<div><span class="font-medium">Detail:</span> {params.detail}</div>{/if}
      {#if params.smoothing}<div><span class="font-medium">Smoothing:</span> {params.smoothing}</div>{/if}
      {#if params.spaceWidth}<div><span class="font-medium">Space width:</span> {params.spaceWidth}%</div>{/if}
    </div>

    <!-- Result -->
    {#if status === 'done'}
      <div class="flex flex-col items-center gap-3 pt-2 border-t dark:border-gray-700">
        <p class="text-sm text-green-600 dark:text-green-400 font-medium">{glyphCount} glyphs generated</p>
        <button
          onclick={download}
          class="px-5 py-2.5 bg-green-600 text-white rounded-lg font-semibold
                 hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download {fontName}.ttf
        </button>
        {#if fontBlobUrl}
          <p class="text-xs text-gray-400 dark:text-gray-500 font-mono break-all">
            Blob: {fontBlobUrl}
          </p>
        {/if}
      </div>
    {/if}

    {#if status === 'error'}
      <div class="pt-2 border-t dark:border-gray-700">
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Check window.__image2ttf for details. Call window.__image2ttf.run({'{...}'}) to retry.
        </p>
      </div>
    {/if}

    <!-- Agent info -->
    <div class="mt-4 pt-3 border-t dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 space-y-1">
      <p class="font-medium">Agent access:</p>
      <p class="font-mono">window.__image2ttf.status → "{status}"</p>
      <p class="font-mono">window.__image2ttf.run({'{...}'})</p>
      <p class="font-mono">window.__image2ttf.fontBlobUrl</p>
    </div>
  </div>
</div>
