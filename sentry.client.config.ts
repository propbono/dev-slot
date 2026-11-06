import * as Sentry from "@sentry/astro";

Sentry.init({
  dsn: import.meta.env.PUBLIC_SENTRY_DSN,
  environment: import.meta.env.PUBLIC_SENTRY_ENV,
  release: import.meta.env.PUBLIC_SENTRY_RELEASE,
  tracesSampleRate: 0.05,
  // Session Replay is DISABLED. It would record the candidate's answer text
  // and JD in the DOM. Enable only with masking + explicit owner sign-off.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
