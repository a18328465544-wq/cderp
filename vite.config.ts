import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const frontendPort = Number(env.FRONTEND_V2_PORT || 3010);
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3011';
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: frontendPort,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const moduleId = id.replaceAll("\\", "/");
            if (moduleId.includes("/node_modules/react/") || moduleId.includes("/node_modules/react-dom/") || moduleId.includes("/node_modules/scheduler/")) return "vendor-react";
            if (moduleId.includes("/node_modules/lucide-react/")) return "vendor-icons";
            // Keep high-cost optional libraries in a separately cacheable chunk.
            // Chart primitives stay synchronous at runtime; React.lazy is unsafe
            // for Recharts forwardRef components such as ResponsiveContainer.
            if (moduleId.includes("/node_modules/recharts/") || moduleId.includes("/node_modules/victory-vendor/")) return "vendor-charts";
            if (moduleId.includes("/node_modules/react-day-picker/")) return "vendor-date";
            if (moduleId.includes("/node_modules/@base-ui/react/")) return "vendor-base-ui";
          },
        },
      },
    },
  };
});
