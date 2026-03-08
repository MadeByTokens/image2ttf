<script>
  import { appState, setError } from '../lib/store.svelte.js';

  let dragOver = $state(false);
  let fileInput;
  let currentObjectUrl = null;

  function handleFile(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, etc.)');
      return;
    }

    // Revoke previous object URL to prevent memory leak
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
    }

    const img = new Image();
    currentObjectUrl = URL.createObjectURL(file);
    img.onload = () => {
      appState.uploadedImage = img;

      // Draw to canvas for processing
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      appState.imageCanvas = canvas;
    };
    img.onerror = () => {
      setError('Failed to load image. Please try another file.');
    };
    img.src = currentObjectUrl;
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
    {#if appState.uploadedImage}
      <img
        src={appState.uploadedImage.src}
        alt="Uploaded handwriting"
        class="max-h-56 max-w-full object-contain rounded"
      />
    {:else}
      <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        <span class="font-semibold text-indigo-600 dark:text-indigo-400">Click to upload</span> or drag and drop
      </p>
      <p class="text-xs text-gray-400">PNG, JPG, or WebP</p>
    {/if}
  </div>

  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    class="hidden"
    onchange={onFileChange}
  />

  {#if appState.uploadedImage}
    <p class="text-sm text-green-600 dark:text-green-400">
      Image loaded ({appState.uploadedImage.naturalWidth} x {appState.uploadedImage.naturalHeight}px)
    </p>
  {/if}
</div>
