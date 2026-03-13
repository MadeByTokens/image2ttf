<script>
  import { fade } from 'svelte/transition';

  let { step = 0, open = $bindable(false) } = $props();

  const helpContent = [
    // Step 0: Upload
    {
      title: 'Upload',
      basic: [
        'Upload an image containing characters arranged in a grid (rows and columns).',
        'Supports PNG, JPG, and WebP formats. Drag & drop or click to browse.',
        'Use "Try with example image" to see how it works before using your own.',
      ],
      advanced: [
        'Pan / Rotate / Zoom — use the mode toggle to switch. Drag to interact, scroll to zoom.',
        'Rotation is applied to the processing canvas — straighten tilted scans here.',
        'Character layout — expand to type the characters as they appear in your image (one row per line). This guides grid detection and sets correct labels automatically.',
        'Reset returns to the original view and rotation.',
      ],
    },
    // Step 1: Detect
    {
      title: 'Detect',
      basic: [
        'The grid of characters is auto-detected. Verify each character sits inside its own box.',
        'Use Edit mode to manually fix any misaligned boxes or boundaries.',
        'Uniform Grid creates an evenly spaced grid if auto-detection struggles.',
      ],
      advanced: [
        'Edit mode: drag cell edges to resize individual boxes. Drag solid baseline lines to set where characters sit. Drag dashed row boundaries to adjust row height.',
        'Double-click in empty row space to add a cell.',
        'Right-click a cell: change label, relabel from here, split cell, or delete cell.',
        'Right-click empty row area: add cell, add/delete row.',
        'Right-click outside rows: add a new row at that position.',
        'Re-label keeps boxes but reassigns labels from the character layout.',
        'Re-detect keeps row boundaries but re-detects columns within each row.',
        'Advanced panel: tune the 6 detection parameters (dark pixel threshold, row/column density, minimum sizes, gap fraction).',
      ],
    },
    // Step 2: Characters
    {
      title: 'Characters',
      basic: [
        'Each detected cell is shown with its assigned character label.',
        'Edit labels by typing in the input field below each thumbnail.',
        'Verify the labels match what\'s actually in each cell.',
      ],
      advanced: [
        'Click a thumbnail to open the per-glyph adjustment dialog with baseline offset, left bearing, and right bearing sliders.',
        'Space width slider controls whitespace width as a percentage of average lowercase letter width.',
        'Cells with adjustments show an amber dot indicator.',
        'Adjustments are cleared when you re-detect or reset the grid.',
      ],
    },
    // Step 3: Preview
    {
      title: 'Preview',
      basic: [
        'Characters are traced into vector paths and assembled into a font.',
        'Type in the preview box to see how your font looks in real time.',
        'Use Re-trace after changing Detail or Smoothing to regenerate all glyphs.',
      ],
      advanced: [
        'Detail slider (1-10): controls the number of traced points. Lower = more detail, higher = simpler paths.',
        'Smoothing slider (0-5): applies curve smoothing (Chaikin corner-cutting). 0 = sharp corners, 5 = very smooth.',
        'Show Glyphs: inspect each glyph\'s SVG outline. Click a glyph to see details, retrace it individually, or delete it.',
        'Kerning: add spacing adjustments between specific letter pairs (e.g., reduce space between "A" and "V"). Changes are reflected in the live preview.',
      ],
    },
    // Step 4: Generate
    {
      title: 'Generate',
      basic: [
        'Set a name for your font and click Generate to build the final TTF file.',
        'Click Download to save the .ttf file to your computer.',
        'Install the font on your system or use it in design tools and documents.',
      ],
      advanced: [
        'Kerning pairs from the Preview step are embedded in the font (both GPOS and legacy kern tables).',
        'Per-glyph adjustments (baseline, bearings) from the Characters step are applied.',
        'Go back to any previous step to make changes, then regenerate.',
      ],
    },
  ];

  const content = $derived(helpContent[step] || helpContent[0]);
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
    aria-label="Help for {content.title} step"
  >
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
      <!-- Header -->
      <div class="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-5 py-4 flex items-center justify-between rounded-t-xl">
        <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">
          {content.title} — Help
        </h3>
        <button
          onclick={() => { open = false; }}
          class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Close help"
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
            Basics
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
            Advanced
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
