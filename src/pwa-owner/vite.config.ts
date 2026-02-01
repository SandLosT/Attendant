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
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
