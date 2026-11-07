// Test-only shim for the Astro virtual module `astro:middleware`.
// `defineMiddleware` is just a typing helper; at runtime it returns its input.
export const defineMiddleware = (fn: unknown) => fn;
