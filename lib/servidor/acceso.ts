import "server-only";
import { NextResponse } from "next/server";
import { usuarioAutorizado } from "../auth.config.js";
import { supabaseServidor } from "./supabase";
type UsuarioSupabase = {
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: { provider?: string; providers?: string[] } | null;
  user_metadata?: { custom_claims?: { hd?: string }; hd?: string } | null;
};
export function noAutorizado() {
  return NextResponse.json(
    { error: "No autorizado" },
    { status: 401, headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function usuarioDesdeRequest(
  request: Request,
): Promise<UsuarioSupabase | null> {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const { data, error } = await supabaseServidor().auth.getUser(token);
    if (error || !data.user || !usuarioAutorizado(data.user as UsuarioSupabase))
      return null;
    return data.user as UsuarioSupabase;
  } catch {
    return null;
  }
}
export async function exigirAcceso(request: Request) {
  const user = await usuarioDesdeRequest(request);
  return user ? user : noAutorizado();
}
