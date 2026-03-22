<script>
  import { appState, setStep, applyTheme } from '../lib/store.svelte.js';
  import { t } from '../lib/i18n.svelte.js';
  import { isApiMode } from '../lib/api.js';
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import ProgressBar from './ProgressBar.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import LanguagePicker from './LanguagePicker.svelte';
  import LanguagePrompt from './LanguagePrompt.svelte';
  import Upload from './Upload.svelte';
  import GridOverlay from './GridOverlay.svelte';
  import CharMap from './CharMap.svelte';
  import Preview from './Preview.svelte';
  import Generate from './Generate.svelte';
  import HelpDialog from './HelpDialog.svelte';
  import ApiMode from './ApiMode.svelte';

  const stepKeys = ['upload', 'detect', 'characters', 'preview', 'generate'];
  const steps = $derived(stepKeys.map(k => t(`steps.${k}`)));

  let helpOpen = $state(false);
  let apiMode = $state(isApiMode());

  onMount(() => {
    applyTheme(appState.theme);

    function onHashChange() {
      apiMode = isApiMode();
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
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

{#if apiMode}
  <ApiMode />
{:else}
<div class="min-h-screen flex flex-col">
  <ThemeToggle />
  <LanguagePicker />

  <!-- Language prompt banner -->
  <LanguagePrompt />

  <!-- Header -->
  <header class="pt-6 pb-2 text-center">
    <h1 class="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-teal-600 to-emerald-500 dark:from-teal-400 dark:to-emerald-300 bg-clip-text text-transparent">
      image2ttf
    </h1>
    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
      {t('header.subtitle')}
    </p>
  </header>

  <!-- Help button (fixed position, top-left) -->
  <button
    onclick={() => { helpOpen = true; }}
    class="fixed top-3 left-3 z-40 w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600
           bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400
           hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400
           shadow-sm hover:shadow transition-all flex items-center justify-center"
    aria-label={t('help.aria')}
    title={t('help.tooltip')}
  >
    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01" />
    </svg>
  </button>

  <HelpDialog step={appState.currentStep} bind:open={helpOpen} />

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
  <nav class="sticky bottom-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-t dark:border-gray-700 px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] dark:shadow-[0_-2px_10px_rgba(0,0,0,0.3)]">
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
        {t('common.back')}
      </button>

      <span class="text-xs text-gray-400">
        {t('common.stepOf', { current: appState.currentStep + 1, total: steps.length })}
      </span>

      {#if appState.currentStep < steps.length - 1}
        <button
          onclick={next}
          disabled={!canAdvance() || appState.isProcessing}
          class="px-5 py-2 text-sm font-semibold rounded-lg bg-teal-600 text-white shadow-sm
                 hover:bg-teal-700 hover:shadow-md
                 disabled:opacity-50 disabled:cursor-not-allowed
                 transition-all"
        >
          {t('common.next')}
        </button>
      {:else}
        <div class="w-16"></div>
      {/if}
    </div>
  </nav>
</div>
{/if}
