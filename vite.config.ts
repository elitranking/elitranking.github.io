import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Org-sajt på elitranking.github.io serveras från roten.
  base: "/",
  build: { outDir: "dist", sourcemap: false },
});
