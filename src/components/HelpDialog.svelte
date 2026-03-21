<script>
  import { fade } from 'svelte/transition';
  import { t, i18n, LOCALES } from '../lib/i18n.svelte.js';

  let { step = 0, open = $bindable(false) } = $props();

  const stepKeys = ['upload', 'detect', 'characters', 'preview', 'generate'];

  /** Resolve an i18n array key like 'help.upload.basic' to the actual string[] */
  function resolveArray(locale, key) {
    const parts = key.split('.');
    const translations = LOCALES.find(l => l.id === locale)?.translations;
    if (!translations) return [];
    let obj = translations;
    for (const p of parts) {
      if (obj == null || typeof obj !== 'object') return [];
      obj = obj[p];
    }
    // Fall back to English if not found
    if (!Array.isArray(obj)) {
      const enTranslations = LOCALES.find(l => l.id === 'en')?.translations;
      obj = enTranslations;
      for (const p of parts) {
        if (obj == null || typeof obj !== 'object') return [];
        obj = obj[p];
      }
    }
    return Array.isArray(obj) ? obj : [];
  }

  const content = $derived.by(() => {
    const key = stepKeys[step] || stepKeys[0];
    // Access i18n.locale to make this reactive to language changes
    const locale = i18n.locale;
    return {
      title: t(`steps.${key}`),
      basic: resolveArray(locale, `help.${key}.basic`),
      advanced: resolveArray(locale, `help.${key}.advanced`),
    };
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    transition:fade={{ duration: 150 }}
    onclick={(e) => { if (e.target === e.currentTarget) open = false; }}
    onkeydown={(e) => { if (e.key === 'Escape') open = false; }}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="{t('help.aria')}"
  >
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
      <!-- Header -->
      <div class="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-5 py-4 flex items-center justify-between rounded-t-xl">
        <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">
          {content.title} {t('help.titleSuffix')}
        </h3>
        <button
          onclick={() => { open = false; }}
          class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label={t('help.closeAria')}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="px-5 py-4 flex flex-col gap-5">
        <!-- Basics section -->
        <div>
          <h4 class="text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400 mb-2">
            {t('help.basics')}
          </h4>
          <ul class="flex flex-col gap-2">
            {#each content.basic as item}
              <li class="text-sm text-gray-700 dark:text-gray-300 flex gap-2">
                <span class="text-teal-500 mt-0.5 shrink-0">&#8226;</span>
                <span>{item}</span>
              </li>
            {/each}
          </ul>
        </div>

        <!-- Advanced section -->
        <div>
          <h4 class="text-sm font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-2">
            {t('help.advanced')}
          </h4>
          <ul class="flex flex-col gap-2">
            {#each content.advanced as item}
              <li class="text-sm text-gray-700 dark:text-gray-300 flex gap-2">
                <span class="text-amber-500 mt-0.5 shrink-0">&#8226;</span>
                <span>{item}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </div>
  </div>
{/if}
