import "server-only";
import type { Acceso } from "../rolesCalculo.d.mts";
import { supabaseServidor } from "./supabase";

// Registro de descargas nominales (TOC-148, D3): quien, que vista, semana, ciudad y CUANTAS filas. Nunca el contenido.
// Compatibilidad: un fallo se registra en el log y la descarga sigue. Estricto: el nominal sin rastro no sale (cierra).
type Insertar = (fila: Record<string, unknown>) => Promise<{ error: unknown }>;
const insertarSupabase: Insertar = async (fila) => supabaseServidor().from("panel_descargas").insert(fila);

export type Descarga = { correo: string | null | undefined; vista: string; semana: string; ciudad: string | null; filas: number };

// -> true si la descarga puede salir.
export async function registrarDescarga(acceso: Acceso, d: Descarga, insertar: Insertar = insertarSupabase): Promise<boolean> {
  let error: unknown = null;
  try {
    const correo = (d.correo ?? "").trim().toLowerCase();
    if (!correo) throw new Error("sin correo");
    ({ error } = await insertar({ correo, vista: d.vista, semana: d.semana, ciudad: d.ciudad, filas: d.filas }));
  } catch (e) { error = e ?? new Error("fallo"); }
  if (!error) return true;
  console.error(`panel_descargas: no se pudo registrar la descarga (${d.vista}, modo ${acceso.modo})`);
  return acceso.modo !== "estricto";
}
