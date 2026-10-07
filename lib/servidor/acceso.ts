import "server-only";
import { NextResponse } from "next/server";
import { usuarioAutorizado } from "../auth.config.js";
import type { Acceso } from "../rolesCalculo.d.mts";
import { rolDe } from "./rol";
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
// TOC-148: ademas del usuario devuelve `acceso` (rol/ciudad/permiso nominal). Los agregados no lo consultan; las rutas con
// nombres lo pasan por autorizarNominal. Si la RPC de roles cae, `acceso.nominal` es "error" y solo el nominal se niega.
export async function exigirAcceso(request: Request) {
  const user = await usuarioDesdeRequest(request);
  if (!user) return noAutorizado();
  const acceso: Acceso = await rolDe(user.email);
  return { ...user, acceso };
}
