<script>
  import { appState, setError } from '../lib/store.svelte.js';
  import { onMount } from 'svelte';

  let dragOver = $state(false);
  let fileInput;
  let currentObjectUrl = null;

  // Pan/zoom/rotate state
  let viewerEl = $state(null);
  let panX = $state(0);
  let panY = $state(0);
  let zoom = $state(1);
  let rotation = $state(0);
  let isPanning = $state(false);
  let panStart = { x: 0, y: 0 };
  let panOrigin = { x: 0, y: 0 };

  // Pinch tracking
  let activePointers = new Map();
  let lastPinchDist = 0;

  function handleFile(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, etc.)');
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
      setError('Failed to load image. Please try another file.');
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
    const ctx = canvas.getContext('2d');
    ctx.translate(newW / 2, newH / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -w / 2, -h / 2);
    appState.imageCanvas = canvas;
    // Reset grid when image changes
    appState.grid = null;
    appState.glyphPaths = null;
  }

  function rotate(deg) {
    rotation = (rotation + deg) % 360;
    if (appState.uploadedImage) {
      applyTransformToCanvas(appState.uploadedImage, rotation);
    }
  }

  function resetView() {
    panX = 0;
    panY = 0;
    zoom = 1;
  }

  // --- Pointer events for pan (mouse + touch) ---
  function onPointerDown(e) {
    if (!appState.uploadedImage) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewerEl?.setPointerCapture(e.pointerId);

    if (activePointers.size === 1) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panOrigin = { x: panX, y: panY };
    } else if (activePointers.size === 2) {
      isPanning = false;
      const pts = [...activePointers.values()];
      lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }
  }

  function onPointerMove(e) {
    if (!appState.uploadedImage) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 1 && isPanning) {
      panX = panOrigin.x + (e.clientX - panStart.x);
      panY = panOrigin.y + (e.clientY - panStart.y);
    } else if (activePointers.size === 2) {
      const pts = [...activePointers.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (lastPinchDist > 0) {
        const scale = dist / lastPinchDist;
        zoom = Math.max(0.25, Math.min(5, zoom * scale));
      }
      lastPinchDist = dist;
    }
  }

  function onPointerUp(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size === 0) {
      isPanning = false;
    } else if (activePointers.size === 1) {
      // Reset pan start to remaining pointer
      const pt = [...activePointers.values()][0];
      panStart = { x: pt.x, y: pt.y };
      panOrigin = { x: panX, y: panY };
      isPanning = true;
      lastPinchDist = 0;
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
      setError('Could not load example image: ' + err.message);
    }
  }
</script>

<div class="flex flex-col items-center gap-6">
  <h2 class="text-2xl font-bold">Upload Your Handwriting</h2>
  <p class="text-gray-500 dark:text-gray-400 text-center max-w-md">
    Upload an image of your handwritten characters arranged in a grid
    (rows of a-z, A-Z, 0-9, and punctuation), or try the example below first.
  </p>

  <button
    onclick={loadExample}
    class="px-4 py-2 text-sm font-medium rounded-lg border border-indigo-300 dark:border-indigo-600
           text-indigo-600 dark:text-indigo-400
           hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
  >
    Try with example image
  </button>

  {#if !appState.uploadedImage}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-full max-w-lg h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors
        {dragOver
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
          : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400'}"
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
        <span class="font-semibold text-indigo-600 dark:text-indigo-400">Click to upload</span> or drag and drop
      </p>
      <p class="text-xs text-gray-400">PNG, JPG, or WebP</p>
    </div>
  {:else}
    <!-- Image viewer with pan/zoom/rotate -->
    <div class="w-full max-w-3xl flex flex-col items-center gap-3">
      <!-- Controls -->
      <div class="flex flex-wrap items-center gap-2">
        <button
          onclick={() => rotate(-90)}
          class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Rotate 90° counter-clockwise"
        >Rotate Left</button>
        <button
          onclick={() => rotate(90)}
          class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Rotate 90° clockwise"
        >Rotate Right</button>
        <button
          onclick={() => { zoom = Math.min(5, zoom * 1.3); }}
          class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >Zoom In</button>
        <button
          onclick={() => { zoom = Math.max(0.25, zoom / 1.3); }}
          class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >Zoom Out</button>
        <button
          onclick={resetView}
          class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >Reset View</button>
        <button
          onclick={() => fileInput.click()}
          class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >Change Image</button>
      </div>

      <p class="text-xs text-gray-400 dark:text-gray-500">
        Drag to pan. Scroll or pinch to zoom. {rotation !== 0 ? `Rotated ${rotation}°` : ''}
      </p>

      <!-- Viewer -->
      <div
        bind:this={viewerEl}
        class="w-full max-h-96 overflow-hidden border rounded-lg dark:border-gray-700 bg-gray-100 dark:bg-gray-900 cursor-grab touch-none select-none"
        class:cursor-grabbing={isPanning}
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
          alt="Uploaded handwriting"
          class="block mx-auto max-w-none pointer-events-none"
          style="transform: translate({panX}px, {panY}px) scale({zoom}) rotate({rotation}deg); transform-origin: center center;"
        />
      </div>

      <p class="text-sm text-green-600 dark:text-green-400">
        Image loaded ({appState.imageCanvas?.width || 0} &times; {appState.imageCanvas?.height || 0}px)
      </p>
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
