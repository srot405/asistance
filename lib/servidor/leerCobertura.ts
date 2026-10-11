import "server-only";
import { calcularCobertura } from "../coberturaClases.mjs";
import type { FranjaCobertura, SesionCobertura } from "../coberturaClases.mjs";
import { MODO_DEMO } from "../demo.js";
import type { CoberturaResponse } from "../types";
import { supabaseServidor } from "./supabase";

// Solo agregados (conteos por clase): ni nombre ni correo salen de aquí.
// Fase 1.6 (plan de veracidad 2026-10-09): el estado de cada clase sale de asist_sesiones.estado_captura (fuente única del ETL).
// Ya no se lee zoom_live_log: eran ~3.000 eventos por carga y daban otra definición de «capturada». Ahora son ~2×14 filas.
export async function leerCobertura(semana: string, materia: string): Promise<CoberturaResponse> {
  if (MODO_DEMO) throw new Error("La cobertura usa el estado de captura real; no existe en modo práctica");
  const db = supabaseServidor();
  const [franjas, sesiones] = await Promise.all([
    db.from("asist_franjas")
      .select("slot_id,fecha,tipo,cuenta_zoom,horario_texto,hora_inicio,hora_fin,roster_n,captura_automatica")
      .eq("semana", semana),
    db.from("asist_sesiones")
      .select("slot_id,fecha,estado_captura,personas_roster,personas_visita")
      .eq("semana", semana),
  ]);
  if (franjas.error) throw franjas.error;
  if (sesiones.error) throw sesiones.error;
  return { semana, materia, ahora: new Date().toISOString(),
    ...calcularCobertura((franjas.data ?? []) as FranjaCobertura[], (sesiones.data ?? []) as SesionCobertura[]) };
}
