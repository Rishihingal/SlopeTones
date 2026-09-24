import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const nodeImport = "await import('node:module')";
const browserImport = "Promise.reject(new Error('Node-only NAM worklet path'))";
const browserSafeNamWorklet = {
  name: 'browser-safe-nam-worklet',
  enforce: 'post',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (!request.url?.endsWith('/neural-amp-modeler-wasm/dist/engine/nam-worklet.js')) {
        next();
        return;
      }
      const sourcePath = resolve('node_modules/neural-amp-modeler-wasm/dist/engine/nam-worklet.js');
      const source = readFileSync(sourcePath, 'utf8').replace(nodeImport, browserImport);
      response.setHeader('Content-Type', 'application/javascript');
      response.end(source);
    });
  },
  writeBundle(options, bundle) {
    for (const output of Object.values(bundle)) {
      if (!output.fileName.includes('nam-worklet-') || !output.fileName.endsWith('.js')) continue;
      const outputPath = resolve(options.dir || 'dist', output.fileName);
      const source = readFileSync(outputPath, 'utf8');
      writeFileSync(outputPath, source.replace(nodeImport, browserImport));
    }
  },
};

// COOP/COEP headers are required for SharedArrayBuffer / threaded WASM builds, which
// NAM Core WASM builds commonly use. Without these, the worklet still loads but you'll
// get silent perf/threading issues on some browsers.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react(), browserSafeNamWorklet],
  optimizeDeps: { exclude: ['neural-amp-modeler-wasm'] },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
});
