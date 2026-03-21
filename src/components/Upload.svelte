<script>
  import { appState, setError } from '../lib/store.svelte.js';
  import { DEFAULT_CHAR_LAYOUT } from '../lib/constants.js';
  import { ImageLoadError } from '../lib/errors.js';
  import { t } from '../lib/i18n.svelte.js';

  let dragOver = $state(false);
  let fileInput;
  let currentObjectUrl = null;

  // View state
  let viewerEl = $state(null);
  let panX = $state(0);
  let panY = $state(0);
  let zoom = $state(1);
  let rotation = $state(0);

  // Interaction mode: 'pan' | 'rotate' | 'zoom'
  let mode = $state('pan');
  let dragging = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginPanX = 0;
  let dragOriginPanY = 0;
  let dragOriginZoom = 1;
  let dragOriginRotation = 0;

  function handleFile(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError(t('upload.errorNotImage'));
      return;
    }

    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
    }

    const img = new Image();
    currentObjectUrl = URL.createObjectURL(file);
    img.onload = () => {
      appState.uploadedImage = img;
      applyTransformToCanvas(img, 0);
      rotation = 0;
      panX = 0;
      panY = 0;
      zoom = 1;
    };
    img.onerror = () => {
      setError(t('upload.errorLoadFailed'));
    };
    img.src = currentObjectUrl;
  }

  /** Apply rotation to create the processing canvas */
  function applyTransformToCanvas(img, angleDeg) {
    const rad = angleDeg * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const newW = Math.round(w * cos + h * sin);
    const newH = Math.round(w * sin + h * cos);

    const canvas = document.createElement('canvas');
    canvas.width = newW;
    canvas.height = newH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.translate(newW / 2, newH / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -w / 2, -h / 2);
    appState.imageCanvas = canvas;
    appState.grid = null;
    appState.glyphPaths = null;
  }

  function commitRotation() {
    if (appState.uploadedImage) {
      applyTransformToCanvas(appState.uploadedImage, rotation);
    }
  }

  function resetView() {
    panX = 0;
    panY = 0;
    zoom = 1;
    rotation = 0;
    commitRotation();
  }

  // --- Pointer events (unified mouse + touch) ---
  function onPointerDown(e) {
    if (!appState.uploadedImage) return;
    viewerEl?.setPointerCapture(e.pointerId);
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOriginPanX = panX;
    dragOriginPanY = panY;
    dragOriginZoom = zoom;
    dragOriginRotation = rotation;
  }

  function onPointerMove(e) {
    if (!dragging || !appState.uploadedImage) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (mode === 'pan') {
      panX = dragOriginPanX + dx;
      panY = dragOriginPanY + dy;
    } else if (mode === 'rotate') {
      // Horizontal drag: ~1 degree per 2 pixels
      rotation = dragOriginRotation + dx * 0.5;
    } else if (mode === 'zoom') {
      // Vertical drag: drag up to zoom in, down to zoom out
      const factor = Math.pow(1.005, -dy);
      zoom = Math.max(0.25, Math.min(5, dragOriginZoom * factor));
    }
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    // Commit rotation to canvas when done dragging in rotate mode
    if (mode === 'rotate' && Math.abs(rotation - dragOriginRotation) > 0.5) {
      commitRotation();
    }
  }

  function onWheel(e) {
    if (!appState.uploadedImage) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoom = Math.max(0.25, Math.min(5, zoom * delta));
  }

  function onDrop(e) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    handleFile(file);
  }

  function onDragOver(e) {
    e.preventDefault();
    dragOver = true;
  }

  function onDragLeave() {
    dragOver = false;
  }

  function onFileChange(e) {
    handleFile(e.target.files[0]);
  }

  async function loadExample() {
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'font_test.png');
      if (!res.ok) throw new Error('Failed to fetch example image');
      const blob = await res.blob();
      const file = new File([blob], 'font_test.png', { type: 'image/png' });
      handleFile(file);
    } catch (err) {
      setError(t('upload.errorExample', { error: err.message }));
    }
  }

  // Character layout — one line per row
  let layoutText = $state(appState.charLayout.join('\n'));
  let layoutCollapsed = $state(true);

  function onLayoutChange(e) {
    layoutText = e.target.value;
    // Parse non-empty lines into charLayout
    const lines = layoutText.split('\n').filter(l => l.length > 0);
    appState.charLayout = lines.length > 0 ? lines : [...DEFAULT_CHAR_LAYOUT];
  }

  const layoutCharCount = $derived(
    layoutText.split('\n').filter(l => l.length > 0).reduce((s, l) => s + l.length, 0)
  );

  const cursorClass = $derived(
    mode === 'pan' ? (dragging ? 'cursor-grabbing' : 'cursor-grab') :
    mode === 'rotate' ? 'cursor-ew-resize' :
    'cursor-ns-resize'
  );
</script>

<div class="flex flex-col items-center gap-6">
  <h2 class="text-2xl font-bold">{t('upload.title')}</h2>
  <p class="text-gray-500 dark:text-gray-400 text-center max-w-md">
    {t('upload.description')}
  </p>

  <button
    onclick={loadExample}
    class="px-4 py-2 text-sm font-medium rounded-lg border border-teal-300 dark:border-teal-600
           text-teal-600 dark:text-teal-400
           hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors"
  >
    {t('upload.tryExample')}
  </button>

  {#if !appState.uploadedImage}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-full max-w-lg h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors
        {dragOver
          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
          : 'border-gray-300 dark:border-gray-600 hover:border-teal-400'}"
      ondrop={onDrop}
      ondragover={onDragOver}
      ondragleave={onDragLeave}
      onclick={() => fileInput.click()}
      role="button"
      tabindex="0"
      onkeydown={(e) => e.key === 'Enter' && fileInput.click()}
    >
      <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        <span class="font-semibold text-teal-600 dark:text-teal-400">{t('upload.clickToUpload')}</span> {t('upload.orDragDrop')}
      </p>
      <p class="text-xs text-gray-400">{t('upload.formats')}</p>
    </div>
  {:else}
    <!-- Image viewer with mode-based interaction -->
    <div class="w-full max-w-3xl flex flex-col items-center gap-3">
      <!-- Mode toggle + actions -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
          <button
            onclick={() => { mode = 'pan'; }}
            class="px-3 py-1.5 text-sm transition-colors {mode === 'pan'
              ? 'bg-teal-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
          >{t('upload.pan')}</button>
          <button
            onclick={() => { mode = 'rotate'; }}
            class="px-3 py-1.5 text-sm transition-colors {mode === 'rotate'
              ? 'bg-teal-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
          >{t('upload.rotate')}</button>
          <button
            onclick={() => { mode = 'zoom'; }}
            class="px-3 py-1.5 text-sm transition-colors {mode === 'zoom'
              ? 'bg-teal-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
          >{t('upload.zoom')}</button>
        </div>
        <button
          onclick={resetView}
          class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >{t('common.reset')}</button>
        <button
          onclick={() => fileInput.click()}
          class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >{t('upload.changeImage')}</button>
      </div>

      <p class="text-xs text-gray-400 dark:text-gray-500">
        {#if mode === 'pan'}
          {t('upload.panHelp')}
        {:else if mode === 'rotate'}
          {t('upload.rotateHelp')}
        {:else}
          {t('upload.zoomHelp')}
        {/if}
        {rotation !== 0 ? ` ${t('upload.rotated', { angle: Math.round(rotation) })}` : ''}
      </p>

      <!-- Viewer -->
      <div
        bind:this={viewerEl}
        class="w-full max-h-96 overflow-hidden border rounded-lg dark:border-gray-700 bg-gray-100 dark:bg-gray-900 touch-none select-none {cursorClass}"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
        onwheel={onWheel}
        ondrop={onDrop}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
      >
        <img
          src={appState.uploadedImage.src}
          alt={t('upload.altText')}
          class="block mx-auto max-w-none pointer-events-none"
          style="transform: translate({panX}px, {panY}px) scale({zoom}) rotate({rotation}deg); transform-origin: center center;"
        />
      </div>

      <p class="text-sm text-green-600 dark:text-green-400">
        {t('upload.imageLoaded', { width: appState.imageCanvas?.width || 0, height: appState.imageCanvas?.height || 0 })}
      </p>

      <!-- Character layout input -->
      <div class="w-full max-w-lg">
        <button
          onclick={() => { layoutCollapsed = !layoutCollapsed; }}
          class="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
        >
          <svg class="w-4 h-4 transition-transform {layoutCollapsed ? '' : 'rotate-90'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
          {t('upload.layoutHeader', { count: layoutCharCount, rows: layoutText.split('\n').filter(l => l.length > 0).length })}
        </button>

        {#if !layoutCollapsed}
          <div class="mt-2 flex flex-col gap-1.5">
            <p class="text-xs text-gray-400 dark:text-gray-500">
              {t('upload.layoutHelp')}
            </p>
            <textarea
              value={layoutText}
              oninput={onLayoutChange}
              rows="6"
              spellcheck="false"
              autocomplete="off"
              class="w-full font-mono text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200
                     focus:ring-2 focus:ring-teal-500 focus:border-teal-500 focus:outline-none
                     resize-y"
              aria-label={t('upload.layoutAria')}
            ></textarea>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    class="hidden"
    onchange={onFileChange}
  />
</div>
