import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  base: '/image2ttf/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    tailwindcss(),
    svelte()
  ],
  build: {
    sourcemap: true
  }
});
