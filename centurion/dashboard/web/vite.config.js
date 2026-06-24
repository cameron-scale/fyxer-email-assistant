import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build output goes to dist/ which the Flask backend serves. Relative base so
// the assets load no matter what host/port Centurion runs on.
// During dev, /api is proxied to the Flask backend on :8000.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/webhook": "http://localhost:8000",
    },
  },
});
