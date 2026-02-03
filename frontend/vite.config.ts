import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [react(), tsconfigPaths()],
    server: {
        port: 3000,
        open: true,
    },
    build: {
        outDir: 'build',
        rollupOptions: {
            output: {
                manualChunks: {
                    // Core vendor libraries
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    // Large UI library
                    'vendor-antd': ['antd'],
                    // DnD libraries
                    'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable'],
                    // Socket.io
                    'vendor-socket': ['socket.io-client'],
                },
            },
        },
        // Increase chunk size warning limit to 2000 kB since we're splitting properly
        chunkSizeWarningLimit: 2000,
    },
});
