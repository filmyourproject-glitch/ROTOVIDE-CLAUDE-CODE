import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Use terser instead of esbuild for minification — esbuild reorders
    // const declarations within function scope causing TDZ crashes in
    // large components (EditorPage 1500+ lines)
    minify: "terser",
    terserOptions: {
      compress: {
        // Preserve declaration order to prevent TDZ
        sequences: false,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-hls": ["hls.js"],
          "vendor-face": [
            "@tensorflow/tfjs",
            "@tensorflow-models/blazeface",
          ],
          "vendor-charts": ["recharts"],
        },
      },
    },
  },
}));
