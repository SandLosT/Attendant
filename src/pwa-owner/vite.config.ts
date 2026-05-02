import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,

  // Em produção/build, o PWA continua preparado para rodar em /owner/pwa/.
  // No dev server, também permite abrir http://localhost:5173/owner/pwa/
  // sem o proxy mandar essa rota para o backend.
  base: "/owner/pwa/",

  plugins: [react()],

  publicDir: "public",

  server: {
    port: 5173,

    proxy: {
      // Não proxyar /owner/pwa/*, porque essa rota pertence ao frontend.
      // Proxyar apenas as APIs /owner/*, como /owner/orcamentos, /owner/agenda etc.
      "^/owner/(?!pwa(?:/|$)).*": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },

      "/uploads": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});