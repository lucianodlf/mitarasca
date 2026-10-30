import { URL, fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "Mitarasca",
        short_name: "Mitarasca",
        description: "Gestión de finanzas personales",
        lang: "es",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        // ponytail: sin icons hasta tener assets reales (no hay ImageMagick disponible);
        // agregar pwa-192x192.png / pwa-512x512.png a public/ y restaurar este array antes de publicar.
      },
      workbox: {
        navigateFallbackDenylist: [/^\/trpc/, /^\/health/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // En dev el cliente tRPC apunta a /trpc relativo → sin CORS.
      "/trpc": {
        target: "http://localhost:3787",
        changeOrigin: true,
      },
    },
  },
});
