<script>
  const { currentStep = 0, steps = [] } = $props();
</script>

<nav aria-label="Progress" class="mb-8">
  <ol class="flex items-center justify-center gap-2 sm:gap-4">
    {#each steps as stepLabel, i}
      <li class="flex items-center gap-1 sm:gap-2">
        <div
          class="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-colors
            {i < currentStep
              ? 'bg-indigo-600 text-white'
              : i === currentStep
                ? 'bg-indigo-500 text-white ring-2 ring-indigo-300'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}"
          aria-current={i === currentStep ? 'step' : undefined}
        >
          {#if i < currentStep}
            &#10003;
          {:else}
            {i + 1}
          {/if}
        </div>
        <span class="hidden sm:inline text-xs font-medium
          {i <= currentStep ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}">
          {stepLabel}
        </span>
        {#if i < steps.length - 1}
          <div class="w-6 sm:w-12 h-0.5 {i < currentStep ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}"></div>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
