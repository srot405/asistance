import "server-only";
import { calcularCobertura } from "../coberturaClases.mjs";
import type { EventoCobertura, FranjaCobertura } from "../coberturaClases.mjs";
import { msDesdeFechaHoraCOT } from "../horarioFranja.mjs";
import { MODO_DEMO } from "../demo.js";
import type { CoberturaResponse } from "../types";
import { supabaseServidor } from "./supabase";

const PAGINA = 1000;
// Margen para no perder entradas tempranas o tardías de la primera/última clase.
const MARGEN_MS = 60 * 60000;

// Solo agregados (conteos por clase): ni nombre ni correo salen de aquí.
export async function leerCobertura(semana: string, materia: string): Promise<CoberturaResponse> {
  if (MODO_DEMO) throw new Error("La cobertura usa el registro real de Zoom; no existe en modo práctica");
  const db = supabaseServidor();
  const { data: franjas, error } = await db.from("asist_franjas")
    .select("slot_id,fecha,tipo,cuenta_zoom,horario_texto,hora_inicio,hora_fin,roster_n,captura_automatica")
    .eq("semana", semana);
  if (error) throw error;
  const lista = (franjas ?? []) as FranjaCobertura[];
  if (lista.length === 0) return { semana, materia, ahora: new Date().toISOString(), ...calcularCobertura([], [], Date.now()) };

  const desde = Math.min(...lista.map((f) => msDesdeFechaHoraCOT(f.fecha, f.hora_inicio))) - MARGEN_MS;
  const hasta = Math.max(...lista.map((f) => msDesdeFechaHoraCOT(f.fecha, f.hora_fin ?? f.hora_inicio + 2))) + MARGEN_MS;
  const eventos: EventoCobertura[] = [];
  for (let desdeFila = 0; ; desdeFila += PAGINA) {
    const { data, error: err } = await db.from("zoom_live_log")
      .select("uuid,curso,correo,nombre,hora_ms")
      .in("evento", ["joined", "left"])
      .ilike("curso", `%${materia}%`)
      .gte("hora_ms", desde).lt("hora_ms", hasta)
      .order("id", { ascending: true })
      .range(desdeFila, desdeFila + PAGINA - 1);
    if (err) throw err;
    eventos.push(...((data ?? []) as EventoCobertura[]));
    if (!data || data.length < PAGINA) break;
  }
  const ahoraMs = Date.now();
  return { semana, materia, ahora: new Date(ahoraMs).toISOString(), ...calcularCobertura(lista, eventos, ahoraMs) };
}
