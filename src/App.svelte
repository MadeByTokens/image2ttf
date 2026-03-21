<script>
  import Wizard from './components/Wizard.svelte';

  const version = __APP_VERSION__;
</script>

<main class="min-h-screen pb-8">
  <Wizard />
</main>

<footer class="fixed bottom-0 right-0 p-2 text-xs text-gray-400 dark:text-gray-600 select-none flex items-center gap-2">
  <a
    href="#api/ready"
    class="px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-700
           hover:border-teal-400 hover:text-teal-500 dark:hover:text-teal-400 transition-colors
           font-mono"
    title="Programmatic API available — navigate to #api/ready or check window.__image2ttf_api"
  >API</a>
  v{version}
</footer>
