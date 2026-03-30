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
    // Disable minification to prevent TDZ from variable reordering
    // in the 1500-line EditorPage component
    minify: false,
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
