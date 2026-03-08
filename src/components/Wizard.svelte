<script>
  import { appState, setStep, applyTheme } from '../lib/store.svelte.js';
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import ProgressBar from './ProgressBar.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import Upload from './Upload.svelte';
  import GridOverlay from './GridOverlay.svelte';
  import CharMap from './CharMap.svelte';
  import Preview from './Preview.svelte';
  import Generate from './Generate.svelte';

  const steps = ['Upload', 'Detect', 'Characters', 'Preview', 'Generate'];

  onMount(() => {
    applyTheme(appState.theme);
  });

  function canAdvance() {
    switch (appState.currentStep) {
      case 0: return !!appState.uploadedImage;
      case 1: return !!appState.grid;
      case 2: return appState.charMap.length > 0;
      case 3: return !!appState.glyphPaths;
      case 4: return true;
      default: return false;
    }
  }

  function next() {
    if (canAdvance() && appState.currentStep < steps.length - 1) {
      setStep(appState.currentStep + 1);
    }
  }

  function back() {
    if (appState.currentStep > 0) {
      setStep(appState.currentStep - 1);
    }
  }
</script>

<div class="min-h-screen flex flex-col">
  <ThemeToggle />

  <!-- Header -->
  <header class="pt-6 pb-2 text-center">
    <h1 class="text-3xl sm:text-4xl font-bold text-indigo-600 dark:text-indigo-400">
      image2ttf
    </h1>
    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
      Convert handwriting to a font file
    </p>
  </header>

  <!-- Progress -->
  <div class="px-4 pt-4">
    <ProgressBar currentStep={appState.currentStep} {steps} />
  </div>

  <!-- Error toast -->
  {#if appState.error}
    <div
      transition:fade={{ duration: 200 }}
      class="mx-auto max-w-lg mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm"
      role="alert"
    >
      {appState.error}
    </div>
  {/if}

  <!-- Step content -->
  <main class="flex-1 px-4 py-6">
    {#key appState.currentStep}
      <div in:fly={{ x: 100, duration: 250 }} out:fly={{ x: -100, duration: 200 }}>
        {#if appState.currentStep === 0}
          <Upload />
        {:else if appState.currentStep === 1}
          <GridOverlay />
        {:else if appState.currentStep === 2}
          <CharMap />
        {:else if appState.currentStep === 3}
          <Preview />
        {:else if appState.currentStep === 4}
          <Generate />
        {/if}
      </div>
    {/key}
  </main>

  <!-- Navigation -->
  <nav class="sticky bottom-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-t dark:border-gray-700 px-4 py-3">
    <div class="max-w-lg mx-auto flex items-center justify-between">
      <button
        onclick={back}
        disabled={appState.currentStep === 0}
        class="px-4 py-2 text-sm font-medium rounded-lg border
               dark:border-gray-600 dark:text-gray-300
               hover:bg-gray-50 dark:hover:bg-gray-800
               disabled:opacity-30 disabled:cursor-not-allowed
               transition-colors"
      >
        Back
      </button>

      <span class="text-xs text-gray-400">
        Step {appState.currentStep + 1} of {steps.length}
      </span>

      {#if appState.currentStep < steps.length - 1}
        <button
          onclick={next}
          disabled={!canAdvance() || appState.isProcessing}
          class="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white
                 hover:bg-indigo-700
                 disabled:opacity-50 disabled:cursor-not-allowed
                 transition-colors"
        >
          Next
        </button>
      {:else}
        <div class="w-16"></div>
      {/if}
    </div>
  </nav>
</div>
