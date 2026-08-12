import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist/public/mfe',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'esbuild',
    lib: { entry: 'src/mfe/entry.ts', formats: ['es'], fileName: () => 'entry.js' }
  }
});
