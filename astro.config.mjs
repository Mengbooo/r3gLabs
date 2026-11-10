import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
const projectRoot = fileURLToPath(new URL('./projects/', import.meta.url));

export default defineConfig({
  output: 'static',
  devToolbar: { enabled: false },
  vite: {
    plugins: [
      {
        name: 'labs-project-reload',
        configureServer(server) {
          server.watcher.add(projectRoot);
          server.watcher.on('all', (_event, filename) => {
            if (filename.startsWith(projectRoot))
              server.ws.send({ type: 'full-reload' });
          });
        },
      },
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/three/')) return 'three';
            if (id.includes('/node_modules/gsap/')) return 'motion';
          },
        },
      },
    },
  },
});
