import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "singlefile" ? [viteSingleFile()] : [],
  build: {
    outDir: mode === "singlefile" ? "dist-release" : "dist",
    emptyOutDir: true,
  },
}));
