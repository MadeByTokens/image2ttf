<script>
  import { i18n, LOCALES, setLocale, dismissLanguagePrompt, detectBrowserLocale, t } from '../lib/i18n.svelte.js';
  import { fade } from 'svelte/transition';

  const detected = detectBrowserLocale();
  const shouldShow = $derived(
    !i18n.promptDismissed &&
    detected &&
    detected !== i18n.locale
  );

  const detectedLabel = $derived(
    detected ? (LOCALES.find(l => l.id === detected)?.label || detected) : ''
  );

  function accept() {
    if (detected) setLocale(detected);
    dismissLanguagePrompt();
  }

  function dismiss() {
    dismissLanguagePrompt();
  }
</script>

{#if shouldShow}
  <div
    transition:fade={{ duration: 200 }}
    class="w-full bg-teal-50 dark:bg-teal-900/30 border-b border-teal-200 dark:border-teal-800 px-4 py-2.5"
  >
    <div class="max-w-lg mx-auto flex flex-wrap items-center justify-center gap-2 text-sm">
      <span class="text-teal-700 dark:text-teal-300">
        {t('langPrompt.message', { language: detectedLabel })}
      </span>
      <button
        onclick={accept}
        class="px-3 py-1 rounded-lg bg-teal-600 text-white text-xs font-medium
               hover:bg-teal-700 transition-colors"
      >
        {t('langPrompt.accept', { language: detectedLabel })}
      </button>
      <button
        onclick={dismiss}
        class="px-3 py-1 rounded-lg border border-teal-300 dark:border-teal-600 text-teal-600 dark:text-teal-400
               text-xs font-medium hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors"
      >
        {t('langPrompt.dismiss')}
      </button>
    </div>
  </div>
{/if}
