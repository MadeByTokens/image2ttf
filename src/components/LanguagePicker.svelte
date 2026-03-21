<script>
  import { i18n, LOCALES, setLocale, dismissLanguagePrompt, t } from '../lib/i18n.svelte.js';

  let open = $state(false);

  function select(id) {
    setLocale(id);
    dismissLanguagePrompt();
    open = false;
  }

  const currentLabel = $derived(LOCALES.find(l => l.id === i18n.locale)?.label || 'English');
</script>

<div class="relative">
  <button
    onclick={() => { open = !open; }}
    class="fixed top-4 right-16 z-50 px-2.5 py-1.5 rounded-lg text-sm font-medium
           bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200
           hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-1"
    aria-label={t('langPicker.aria')}
  >
    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
      <path stroke-linecap="round" stroke-linejoin="round" d="M3.6 9h16.8M3.6 15h16.8" />
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 3a15 15 0 014 9 15 15 0 01-4 9 15 15 0 01-4-9 15 15 0 014-9z" />
    </svg>
    <span class="hidden sm:inline">{currentLabel}</span>
  </button>

  {#if open}
    <!-- Backdrop -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50" onclick={() => { open = false; }} onkeydown={(e) => { if (e.key === 'Escape') open = false; }}></div>

    <!-- Dropdown -->
    <div class="fixed top-12 right-16 z-50 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-lg py-1 min-w-36">
      {#each LOCALES as locale (locale.id)}
        <button
          onclick={() => select(locale.id)}
          class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2
                 {locale.id === i18n.locale ? 'text-teal-600 dark:text-teal-400 font-medium' : ''}"
        >
          {locale.label}
          {#if locale.id === i18n.locale}
            <svg class="w-4 h-4 ml-auto" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
