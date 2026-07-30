import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 100% of transactions in development, lower in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Capture 100% of Replays for sessions with errors
  replaysOnErrorSampleRate: 1.0,

  // Capture 10% of all sessions as Replays
  replaysSessionSampleRate: 0.1,

  debug: false,

  integrations: [
    Sentry.replayIntegration(),
  ],
});
