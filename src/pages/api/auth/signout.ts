import type { APIRoute } from "astro";
import { captureEvent, flush } from "@/lib/posthog";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  let userId: string | undefined;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id;
    await supabase.auth.signOut();
  }

  if (userId) {
    captureEvent({ distinctId: userId, event: "logout" });
    await flush();
  }

  return context.redirect("/");
};
