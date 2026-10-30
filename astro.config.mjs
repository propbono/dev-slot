// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";

// https://astro.build/config
export default defineConfig({
  site: "https://dev-slot.vercel.app",
  output: "server",
  adapter: vercel(),
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      DEEPSEEK_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // AI abuse/spend protection. Server-side knobs with sensible defaults;
      // override via Vercel env vars to tune for real traffic.
      AI_RATE_LIMIT_WINDOW_SECONDS: envField.number({ context: "server", access: "secret", default: 60 }),
      AI_RATE_LIMIT_PER_USER: envField.number({ context: "server", access: "secret", default: 10 }),
      AI_RATE_LIMIT_PER_IP: envField.number({ context: "server", access: "secret", default: 30 }),
      AI_GLOBAL_RATE_LIMIT_PER_WINDOW: envField.number({ context: "server", access: "secret", default: 120 }),
      AI_DAILY_CALL_LIMIT: envField.number({ context: "server", access: "secret", default: 100 }),
      AI_MONTHLY_CALL_LIMIT: envField.number({ context: "server", access: "secret", default: 500 }),
    },
  },
});
