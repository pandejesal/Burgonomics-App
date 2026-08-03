/**
 * Mobile / Capacitor build config.
 *
 * Produces a plain static SPA in `dist/mobile` (with `index.html`) so
 * `npx cap sync` can package Android + iOS shells. Kept intentionally
 * separate from `vite.config.ts` (SSR + Nitro) to avoid regressing the
 * production web deployment.
 *
 *   bun run build:mobile   # emits dist/mobile/index.html + hashed assets
 *   npx cap sync           # copies dist/mobile into android/ + ios/
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: path.resolve(__dirname, "src/routes"),
      generatedRouteTree: path.resolve(__dirname, "src/routeTree.gen.ts"),
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: { "@": path.resolve(__dirname, "src") },
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
    "import.meta.env.IS_CAPACITOR_BUILD": "true",
  },
  build: {
    outDir: "dist/mobile",
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false,
    minify: "esbuild",
    cssMinify: true,
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: { port: 8080, host: true },
});
