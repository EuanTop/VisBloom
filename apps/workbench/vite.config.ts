import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig(({ mode }) => {
  const publicPortal = mode === 'public-portal';
  const creatorKit = mode === 'creator-kit';
  const input: Record<string, string> = publicPortal ? { portal: entry('./portal.html') } : creatorKit ? { workbench: entry('./index.html') } : {
    workbench: entry('./index.html'),
    portal: entry('./portal.html'),
  };
  return {
    root: entry('.'),
    plugins: [react()],
    build: {
      outDir: publicPortal ? '../../dist/portal' : creatorKit ? '../../dist/creator-workbench' : '../../dist/workbench',
      copyPublicDir: !publicPortal && !creatorKit,
      emptyOutDir: true,
      rollupOptions: { input },
    },
    server: { host: '127.0.0.1' },
  };
});
