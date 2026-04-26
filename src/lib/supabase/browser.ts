import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

export function createBrowserSupabaseClient() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey);
}
