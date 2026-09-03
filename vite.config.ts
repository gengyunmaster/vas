import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // GitHub Pages serves the app under /<repo>/; local dev and Docker stay at "/".
  const base = loadEnv(mode, "", "VAS_").VAS_BASE ?? "/";

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        manifest: {
          name: "vas — handwriting notes",
          short_name: "vas",
          description: "Handwriting notes and whiteboard in the browser",
          theme_color: "#ffffff",
          background_color: "#e8e8e6",
          display: "standalone",
          start_url: base,
          scope: base,
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "icons/icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
            { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          ],
          // Launches the installed PWA when the OS opens a .json/.zip/.pdf
          // file with it; handled by pwa/fileHandling.ts. Chromium-only.
          file_handlers: [
            {
              action: base,
              accept: {
                "application/json": [".json"],
                "application/zip": [".zip"],
                "application/pdf": [".pdf"],
              },
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,mjs,css,html,svg,png,webmanifest,wasm,ttf,woff,woff2}"],
          navigateFallback: `${base}index.html`,
          // Geometry chunks (compute-engine, jsxgraph, mathlive) exceed the 2 MiB default.
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
      }),
    ],
    server: {
      host: true,
    },
    test: {
      environment: "node",
      exclude: ["**/node_modules/**", "e2e/**"],
    },
  };
});
