<script>
  import Wizard from './components/Wizard.svelte';

  const version = __APP_VERSION__;
</script>

<main class="min-h-screen pb-8">
  <Wizard />
</main>

<footer class="fixed bottom-0 right-0 p-2 text-xs text-gray-400 dark:text-gray-600 select-none">
  v{version}
</footer>
