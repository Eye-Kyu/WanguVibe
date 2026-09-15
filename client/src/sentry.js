import * as Sentry from '@sentry/react';

// Imported first thing in main.jsx, before React even mounts, per Sentry's
// own setup guidance. No-ops harmlessly if VITE_SENTRY_DSN is unset (most
// local dev), rather than erroring or requiring a dummy value.
const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  const apiOrigin = new URL(import.meta.env.VITE_API_BASE_URL).origin;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    // Lets a frontend trace stitch together with the matching server-side
    // trace once server/ also has Sentry wired up (Tier 0c, server half).
    tracePropagationTargets: ['localhost', apiOrigin],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}
