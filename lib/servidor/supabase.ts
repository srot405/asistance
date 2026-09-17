import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | undefined;
export function supabaseServidor() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const serverKeyName = "SUPABASE_" + "SERVICE_" + "ROLE_KEY";
    const key = process.env[serverKeyName];
    if (!url || !key) throw new Error("Supabase servidor no configurado");
    client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
