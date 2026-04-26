import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

export function createServerSupabaseClient() {
  const serviceRoleKey = env.supabaseServiceRoleKey;

  if (!serviceRoleKey) {
    throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(env.supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
