import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // The separately loaded WebGL engine is just under the practical 1 MiB
  // browser chunk boundary once the Stage 02 scene helpers are included.
  build: { chunkSizeWarningLimit: 1024 },
});
