import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_BUILD_TIME": JSON.stringify(new Date().toISOString()),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5174,
    proxy: {
      // Hermes API server (OpenAI-compat) — runs on :8642
      "/v1": {
        target: "http://127.0.0.1:8642",
        changeOrigin: true,
      },
      // Hermes web server (admin API) — runs on :9119
      "/api": {
        target: "http://127.0.0.1:9119",
        changeOrigin: true,
      },
    },
  },
});
