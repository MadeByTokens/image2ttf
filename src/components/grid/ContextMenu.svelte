<script>
  let {
    contextMenu = $bindable(null),
    onchangelabel,
    onrelabel,
    onsplitcell,
    ondeletecell,
    onaddcell,
    onaddrowatseparator,
    onaddrowbelow,
    ondeleterow,
    onaddrowatposition
  } = $props();
</script>

{#if contextMenu}
  <div
    role="menu"
    tabindex="-1"
    class="fixed z-50 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-lg py-1 min-w-36"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => { if (e.key === 'Escape') contextMenu = null; }}
  >
    {#if contextMenu.type === 'cell'}
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => onchangelabel?.()}>
        Change label
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => onrelabel?.()}>
        Relabel from here...
      </button>
      <hr class="border-gray-200 dark:border-gray-600 my-0.5" />
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => onsplitcell?.()}>
        Split cell
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400" onclick={() => ondeletecell?.()}>
        Delete cell
      </button>
    {:else if contextMenu.type === 'empty'}
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => onaddcell?.()}>
        Add cell here
      </button>
      <hr class="border-gray-200 dark:border-gray-600 my-0.5" />
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => { contextMenu = { ...contextMenu, type: 'rowSep', boundary: 'top' }; onaddrowatseparator?.(); }}>
        Add row above
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => onaddrowbelow?.()}>
        Add row below
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400" onclick={() => { contextMenu = { ...contextMenu, type: 'rowSep', boundary: 'top' }; ondeleterow?.(); }}>
        Delete this row
      </button>
    {:else if contextMenu.type === 'rowSep'}
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => onaddrowatseparator?.()}>
        Add row here
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400" onclick={() => ondeleterow?.()}>
        Delete row
      </button>
    {:else if contextMenu.type === 'noRow'}
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => onaddrowatposition?.()}>
        Add row here
      </button>
    {/if}
  </div>
{/if}
