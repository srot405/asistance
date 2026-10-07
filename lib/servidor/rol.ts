import "server-only";
import { ACCESO_ERROR, resolverAcceso } from "../rolesCalculo.mjs";
import type { Acceso } from "../rolesCalculo.d.mts";
import { supabaseServidor } from "./supabase";

// Rol del correo autenticado (TOC-148, V2) con la RPC panel_rol_de (086, solo service_role). Cache en memoria por correo:
// ~60 s el acierto (un cambio de rol tarda como maximo eso) y pocos segundos el fallo, para no martillar una RPC caida.
// Degradacion SEGURA: si la RPC falla o responde algo ilegible, el acceso es `error` y el nominal se niega (503); nunca se abre.
export const TTL_ROL_MS = 60_000;
export const TTL_ROL_ERROR_MS = 5_000;
const MAX_CORREOS = 200;
type Rpc = (correo: string) => Promise<unknown>;
const cache = new Map<string, { hasta: number; acceso: Acceso }>();
export function vaciarCacheRol(): void { cache.clear(); }

const rpcSupabase: Rpc = async (correo) => {
  const { data, error } = await supabaseServidor().rpc("panel_rol_de", { p_correo: correo });
  if (error) throw error;
  return data;
};

export async function rolDe(correo: string | null | undefined, rpc: Rpc = rpcSupabase, ahora: () => number = Date.now): Promise<Acceso> {
  const clave = (correo ?? "").trim().toLowerCase();
  if (!clave) return ACCESO_ERROR;
  const hit = cache.get(clave);
  if (hit && ahora() < hit.hasta) return hit.acceso;
  let acceso: Acceso;
  try {
    acceso = resolverAcceso(await rpc(clave));
  } catch {
    acceso = ACCESO_ERROR; // sin detalles en el log: el mensaje de Supabase puede traer datos de la consulta
    console.error("panel_rol_de fallo: el nominal queda cerrado hasta que responda");
  }
  cache.set(clave, { hasta: ahora() + (acceso.modo === "error" ? TTL_ROL_ERROR_MS : TTL_ROL_MS), acceso });
  while (cache.size > MAX_CORREOS) cache.delete(cache.keys().next().value as string);
  return acceso;
}
