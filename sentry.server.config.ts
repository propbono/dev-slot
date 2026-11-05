import * as Sentry from "@sentry/astro";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.05,
  // Never auto-collect user info (IP, identity), cookies, headers, request
  // bodies, or local variable values — the v11 equivalent of `sendDefaultPii: false`.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    stackFrameVariables: false,
  },
  integrations: [
    // Allowlist request context: method + url (path) + query string ONLY.
    // The default would capture POST bodies, which here contain `answer`,
    // `jd`, `content`, `email`, and `password`.
    Sentry.requestDataIntegration({
      include: {
        cookies: false,
        data: false,
        headers: false,
        ip: false,
        query_string: true,
        url: true,
      },
    }),
    // Capture console.error calls (e.g. evaluation retry exhaustion).
    Sentry.captureConsoleIntegration({ levels: ["error"] }),
  ],
  beforeSend(event) {
    // Defense in depth: strip anything sensitive that leaks in.
    if (event.request?.data) delete event.request.data;
    if (event.request?.cookies) delete event.request.cookies;
    if (event.request?.headers) delete event.request.headers;
    return event;
  },
});
