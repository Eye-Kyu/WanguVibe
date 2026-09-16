import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // injectManifest (a hand-written src/sw.js), not the default
      // generateSW — a `push` event listener can only live in custom
      // service-worker code, and generateSW's fully auto-generated worker
      // has no hook for one. src/sw.js does its own precacheAndRoute +
      // re-registers the /api/styles NetworkFirst rule that generateSW used
      // to wire up automatically (see the workbox config below, now unused
      // by the build itself but kept as the source of truth for that rule).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        // sw.js imports workbox-precaching/routing/strategies directly —
        // don't also bundle Workbox's runtime a second time into the
        // precache manifest.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // The main JS bundle passed Workbox's default 2 MiB precache limit
        // once the Tier 4 admin-page sweep (analytics, forecasting, margin
        // report, webhooks, API keys, etc.) grew it past that — raised
        // rather than excluding it from precache, since precaching the app
        // shell is the whole point of 4a's offline-first design. The build
        // already warns separately (unrelated to this) that this bundle
        // should eventually be code-split; that's a Tier 5 polish concern,
        // not a blocker for offline caching to keep working today.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      // devOptions.enabled was tried to activate the service worker under
      // `vite dev` too, but hit a real upstream bug: workbox-build@7.4.1's
      // service-worker bundling is incompatible with esbuild@0.25.x in dev
      // mode specifically ("Source phase import ... must be external" on a
      // plain `import './_version.js'` inside workbox's own source — not
      // something wrong in this app's code, and reproduces on stock
      // workbox-strategies/workbox-core files regardless of which workbox
      // module the runtime-caching config happens to pull in). Production
      // builds (`npm run build`) never hit this — `generateSW` there takes a
      // different internal path. PWA install/offline testing should be done
      // against `npm run build && npm run preview` (or a real deploy), which
      // is the standard way to test service-worker behavior anyway — Chrome's
      // own guidance is to test installability against a production build,
      // not a dev server.
      manifest: {
        name: 'Wanguvibe POS',
        short_name: 'Wanguvibe',
        description: 'Wanguvibe boutique point of sale',
        theme_color: '#6366f1',
        background_color: '#ffffff',
        display: 'standalone',
        // '/' (login), not '/pos' — /pos is behind ProtectedRoute and
        // client-side-redirects an unauthenticated visitor to '/' anyway;
        // '/' is the real entry point regardless of auth state.
        start_url: '/',
        // PNG, not SVG — confirmed via a live Chrome installability check
        // that an SVG-only icon set fails Chrome's icon loader entirely
        // ("Icon ... failed to load" / "Most operating systems require
        // square icons"), even though SVG is spec-valid for manifest icons.
        // Rasterized once from icon.svg via a temporary sharp install (not a
        // runtime dependency — removed again after generating these).
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // No `workbox: { runtimeCaching }` option here anymore — that's a
      // generateSW-only option and is silently ignored under
      // strategies: 'injectManifest'. The equivalent /api/styles
      // NetworkFirst rule is now registered directly in src/sw.js.
    }),
  ],
})
