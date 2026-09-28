import "server-only";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MODO_DEMO } from "../demo.js";
import { agregarDatos } from "../agregados";
import { supabaseServidor } from "./supabase";
import type { DemoData } from "../types";

const vacia = (semana: string, semana_registrada = false) => agregarDatos({
  semana, semana_registrada, roster: [], franjas: [], entradas: [],
  celdas_dia: [], celdas_semana: [], no_identificados: [],
});

export async function leerSemana(semana: string, incluirNombres = false): Promise<DemoData> {
  if (MODO_DEMO) {
    try {
      const raw = JSON.parse(await readFile(resolve(process.cwd(), "data/demo", `semana-${semana}.json`), "utf8"));
      return agregarDatos({ ...raw, semana_registrada: true }, { incluirNombres: false });
    } catch {
      return vacia(semana);
    }
  }

  const sb = supabaseServidor();
  const { data: semanaRow, error: errorSemana } = await sb.from("asist_semanas")
    .select("semana,materia,estado").eq("semana", semana).maybeSingle();
  if (errorSemana) throw errorSemana;
  if (!semanaRow) return vacia(semana);

  async function traerTodo(tabla: string, ...orden: string[]) {
    const filas: Record<string, unknown>[] = [];
    for (let desde = 0; ; desde += 1000) {
      let query = sb.from(tabla).select("*").eq("semana", semana);
      for (const columna of orden) query = query.order(columna);
      const { data, error } = await query.range(desde, desde + 999);
      if (error) throw error;
      filas.push(...((data ?? []) as Record<string, unknown>[]));
      if (!data || data.length < 1000) return filas;
    }
  }
  const [franjasBase, roster, entradas, celdas_dia, celdas_semana, no_identificados, sesiones] = await Promise.all([
    traerTodo("asist_franjas", "fecha", "slot_id"), traerTodo("asist_roster", "persona_id"),
    traerTodo("asist_entradas", "persona_id", "sesion_id"), traerTodo("asist_celda_dia", "fecha", "persona_id"),
    traerTodo("asist_celda_semana", "persona_id"), traerTodo("asist_no_identificados", "sesion_id", "motivo"),
    traerTodo("asist_sesiones", "slot_id"),
  ]);
  const porSlot = new Map(sesiones.map((s) => [s.slot_id, s]));
  const franjas = franjasBase.map((f) => ({ ...f, ...(porSlot.get(f.slot_id) ?? {}) }));
  return agregarDatos({ semana, materia: semanaRow.materia, estado_semana: semanaRow.estado,
    semana_registrada: true, roster, franjas, entradas, celdas_dia,
    celdas_semana, no_identificados }, { incluirNombres });
}
