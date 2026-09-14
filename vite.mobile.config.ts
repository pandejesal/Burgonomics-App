/**
 * Mobile / Capacitor build config.
 *
 * Static SPA in `dist/mobile` (with `index.html`) for `npx cap sync`
 * into Android + iOS shells. Separate output from `vite.config.ts`
 * (web → `dist` for Netlify) so the two deployments never share a folder.
 *
 *   npm run build:mobile   # emits dist/mobile/index.html + hashed assets
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
      routesDirectory: path.resolve(import.meta.dirname, "src/routes"),
      generatedRouteTree: path.resolve(import.meta.dirname, "src/routeTree.gen.ts"),
      routeFileIgnorePattern: "\\.test\\.(ts|tsx)$",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: { "@": path.resolve(import.meta.dirname, "src") },
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
      input: path.resolve(import.meta.dirname, "index.html"),
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: { port: 8080, host: true },
});
