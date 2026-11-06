import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths, so the built game still works when Capacitor later serves
  // it from inside the APK instead of from a web server root.
  base: './',
  build: {
    // Keep every image as a real file. Phaser's loader is happiest with URLs.
    assetsInlineLimit: 0,
  },
});
