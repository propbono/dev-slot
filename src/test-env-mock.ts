export const SUPABASE_URL = "https://test.supabase.co";
export const SUPABASE_KEY = "test-key";
export const SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
export const DEEPSEEK_API_KEY = "test-key";
export const DEEPSEEK_MODEL = "deepseek-flash";
export const STRIPE_SECRET_KEY = "test-stripe-secret";
export const STRIPE_WEBHOOK_SECRET = "test-webhook-secret";
export const STRIPE_PRICE_ID_PRO = "test-price-pro";
export const STRIPE_PRICE_ID_UNLIMITED = "test-price-unlimited";

export const AI_RATE_LIMIT_WINDOW_SECONDS = 60;
export const AI_RATE_LIMIT_PER_USER = 10;
export const AI_RATE_LIMIT_PER_IP = 30;
export const AI_GLOBAL_RATE_LIMIT_PER_WINDOW = 120;
export const AI_DAILY_CALL_LIMIT = 100;
export const AI_MONTHLY_CALL_LIMIT = 500;

// Empty key keeps PostHog in no-op mode across the test suite (the helper
// treats an unset/empty key as disabled). Tests that need a live path mock
// `posthog-node` + `astro:env/server` directly.
export const POSTHOG_API_KEY = "";
export const POSTHOG_API_HOST = "https://us.i.posthog.com";
