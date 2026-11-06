import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";

export type ConfigStatus = {
  name: string;
  configured: boolean;
  message: string;
  docsUrl?: string;
  docsLabel?: string;
};

export const configStatuses: ConfigStatus[] = [
  {
    name: "Supabase",
    configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
    message: "Supabase is not configured — authentication features are disabled.",
    docsUrl: "https://github.com/propbono/dev-slot#supabase-configuration",
    docsLabel: "View configuration instructions",
  },
];

export const missingConfigs = configStatuses.filter((s) => !s.configured);
