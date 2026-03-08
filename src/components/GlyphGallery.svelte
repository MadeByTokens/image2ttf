<script>
  import { ASCENDER } from '../lib/constants.js';

  let { glyphEntries = [], selectedGlyph = $bindable(null), onretrace, ondelete } = $props();

  function commandsToSvgPath(commands) {
    const fy = (y) => ASCENDER - y;
    let d = '';
    for (const cmd of commands) {
      switch (cmd.type) {
        case 'M': d += `M${cmd.x} ${fy(cmd.y)} `; break;
        case 'L': d += `L${cmd.x} ${fy(cmd.y)} `; break;
        case 'Q': d += `Q${cmd.x1} ${fy(cmd.y1)} ${cmd.x} ${fy(cmd.y)} `; break;
        case 'C': d += `C${cmd.x1} ${fy(cmd.y1)} ${cmd.x2} ${fy(cmd.y2)} ${cmd.x} ${fy(cmd.y)} `; break;
        case 'Z': d += 'Z '; break;
      }
    }
    return d.trim();
  }

  const displayEntries = $derived(glyphEntries.map(e => ({
    ...e,
    svgPath: commandsToSvgPath(e.commands)
  })));
</script>

<div class="w-full max-w-4xl">
  <p class="text-xs text-gray-400 dark:text-gray-500 mb-2 text-center">
    Click a glyph to inspect. Use buttons to delete or retrace individual characters.
  </p>
  <div class="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-13 gap-1.5">
    {#each displayEntries as entry (entry.char)}
      <button
        onclick={() => { selectedGlyph = selectedGlyph === entry.char ? null : entry.char; }}
        class="flex flex-col items-center gap-0.5 p-1 rounded border transition-colors
               {selectedGlyph === entry.char
                 ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                 : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'}"
      >
        <svg viewBox="-50 -50 1100 1100" class="w-10 h-10 bg-white dark:bg-gray-800 rounded">
          <path d={entry.svgPath} fill="currentColor" class="text-gray-900 dark:text-gray-100" />
        </svg>
        <span class="text-xs font-mono text-gray-600 dark:text-gray-400">{entry.char}</span>
      </button>
    {/each}
  </div>

  {#if selectedGlyph}
    {@const entry = displayEntries.find(e => e.char === selectedGlyph)}
    {#if entry}
      <div class="mt-3 p-4 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 flex flex-col sm:flex-row gap-4 items-start">
        <svg viewBox="-50 -50 1100 1100" class="w-32 h-32 border rounded bg-gray-50 dark:bg-gray-900 dark:border-gray-700 shrink-0">
          <path d={entry.svgPath} fill="currentColor" class="text-gray-900 dark:text-gray-100" />
        </svg>
        <div class="flex-1 min-w-0">
          <p class="font-mono text-lg mb-1">"{entry.char}" <span class="text-sm text-gray-400">U+{entry.char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}</span></p>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Width: {Math.round(entry.width)} · {entry.commands.length} path commands
          </p>
          <div class="flex gap-2 mt-3">
            <button
              onclick={() => onretrace?.(entry.char)}
              class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                     hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >Retrace</button>
            <button
              onclick={() => ondelete?.(entry.char)}
              class="px-3 py-1.5 text-sm rounded-lg border border-red-300 dark:border-red-600
                     text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >Delete</button>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
