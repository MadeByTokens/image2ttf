<script>
  import { t } from '../../lib/i18n.svelte.js';
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
        {t('contextMenu.changeLabel')}
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => onrelabel?.()}>
        {t('contextMenu.relabelFrom')}
      </button>
      <hr class="border-gray-200 dark:border-gray-600 my-0.5" />
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => onsplitcell?.()}>
        {t('contextMenu.splitCell')}
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400" onclick={() => ondeletecell?.()}>
        {t('contextMenu.deleteCell')}
      </button>
    {:else if contextMenu.type === 'empty'}
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => onaddcell?.()}>
        {t('contextMenu.addCellHere')}
      </button>
      <hr class="border-gray-200 dark:border-gray-600 my-0.5" />
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => { contextMenu = { ...contextMenu, type: 'rowSep', boundary: 'top' }; onaddrowatseparator?.(); }}>
        {t('contextMenu.addRowAbove')}
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => onaddrowbelow?.()}>
        {t('contextMenu.addRowBelow')}
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400" onclick={() => { contextMenu = { ...contextMenu, type: 'rowSep', boundary: 'top' }; ondeleterow?.(); }}>
        {t('contextMenu.deleteThisRow')}
      </button>
    {:else if contextMenu.type === 'rowSep'}
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => onaddrowatseparator?.()}>
        {t('contextMenu.addRowHere')}
      </button>
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400" onclick={() => ondeleterow?.()}>
        {t('contextMenu.deleteRow')}
      </button>
    {:else if contextMenu.type === 'noRow'}
      <button class="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => onaddrowatposition?.()}>
        {t('contextMenu.addRowHere')}
      </button>
    {/if}
  </div>
{/if}
