import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  base: "/pwa/",
  plugins: [react()],
  publicDir: "public",
  server: {
    proxy: {
      "/owner": "http://localhost:3001",
      "/uploads": "http://localhost:3001",
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
