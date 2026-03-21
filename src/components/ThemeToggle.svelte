<script>
  import { appState, setTheme } from '../lib/store.svelte.js';
  import { t } from '../lib/i18n.svelte.js';

  function toggle() {
    const modes = ['system', 'light', 'dark'];
    const idx = modes.indexOf(appState.theme);
    setTheme(modes[(idx + 1) % modes.length]);
  }

  const label = $derived(
    appState.theme === 'system' ? t('theme.auto') : appState.theme === 'light' ? t('theme.light') : t('theme.dark')
  );
</script>

<button
  onclick={toggle}
  class="fixed top-4 right-4 z-50 px-3 py-1.5 rounded-lg text-sm font-medium
         bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200
         hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
  aria-label={t('theme.toggleAria', { label })}
>
  {#if appState.theme === 'system'}
    <span>&#9788;</span>
  {:else if appState.theme === 'light'}
    <span>&#9728;</span>
  {:else}
    <span>&#9790;</span>
  {/if}
  {label}
</button>
