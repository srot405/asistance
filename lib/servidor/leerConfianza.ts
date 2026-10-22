import "server-only";
import { armarConfianza, cuadreSinteticoDemo } from "../confianzaClase.mjs";
import type { ConfianzaSemanaResponse, CuadreClaseDb, SesionConfianzaDb } from "../confianzaClase.d.mts";
import { MODO_DEMO } from "../demo.js";
import { DETALLE_DEMO_BASE } from "../detalle-demo.mjs";
import { esTablaAusente, tablaTiempo } from "./leerTiempo";

// Confianza de la captura por clase (asist_sesiones.estado_captura) y estado del cuadre automatico (asist_cuadre_clase, 084).
// SOLO agregados por clase: ni nombre ni persona_id (asist_cuadre_diferencia es PII y nunca se lee aqui). Si 084 no esta en esa
// base, el cuadre queda en null y la confianza sigue funcionando.
const COLUMNAS_084 = "sesion_id,slot_id,n_panel,n_api,n_webhook,n_ok,n_diferencias,n_informativas,estado";
const COLUMNAS_090 = "nivel,origen,motivo";   // TOC-156 D5.5: chip «Parcial» y «Cuadrada (interna)»

function esColumnaAusente(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist/i.test(e.message ?? ""));
}

export async function leerConfianzaSemana(semana: string): Promise<ConfianzaSemanaResponse> {
  if (MODO_DEMO) {
    const sesiones = ((DETALLE_DEMO_BASE as Record<string, { sesiones: SesionConfianzaDb[] }>)[semana]?.sesiones);
    if (!sesiones) throw new Error(`Sin datos demo para ${semana}`);
    return armarConfianza({ semana, sesiones, cuadre: cuadreSinteticoDemo(sesiones) });
  }
  const sesiones = await tablaTiempo<SesionConfianzaDb>("asist_sesiones", "sesion_id,slot_id,fecha,estado_captura", semana, ["sesion_id"]);
  let cuadre: CuadreClaseDb[] | null = null;
  try {
    try {
      cuadre = await tablaTiempo<CuadreClaseDb>("asist_cuadre_clase", `${COLUMNAS_084},${COLUMNAS_090}`, semana, ["sesion_id"]);
    } catch (error) {
      // 090 sin aplicar en esa base (columna inexistente): se lee como 084, sin nivel/motivo.
      if (!esColumnaAusente(error)) throw error;
      cuadre = await tablaTiempo<CuadreClaseDb>("asist_cuadre_clase", COLUMNAS_084, semana, ["sesion_id"]);
    }
  } catch (error) {
    if (!esTablaAusente(error)) throw error;
  }
  return armarConfianza({ semana, sesiones, cuadre });
}
