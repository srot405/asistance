"use client";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { DOMINIO_PERMITIDO, correoConAcceso } from "./auth.config.js";
let cliente: SupabaseClient | null = null;
export function clienteAuth() {
  if (!cliente)
    cliente = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      { auth: { persistSession: true, autoRefreshToken: true } },
    );
  return cliente;
}
export function authConfigurada() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
export { correoConAcceso };
export async function iniciarSesionGoogle() {
  await clienteAuth().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: { hd: DOMINIO_PERMITIDO, prompt: "select_account" },
    },
  });
}
export async function cerrarSesion() {
  await clienteAuth().auth.signOut();
}
export async function sesionActual(): Promise<Session | null> {
  const { data } = await clienteAuth().auth.getSession();
  return data.session ?? null;
}
