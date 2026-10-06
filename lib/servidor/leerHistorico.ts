import "server-only";
import { HISTORICO_DEMO } from "../historico-demo.mjs";
import { MODO_DEMO } from "../demo.js";
import type { HistoricoData, ResumenHistorico } from "../types";
import { supabaseServidor } from "./supabase";

const COLUMNAS = [
  "semana", "materia", "nivel", "poblacion", "asistieron", "nunca",
  "porcentaje_retencion", "porcentaje_nunca", "clases_programadas",
  "clases_capturadas", "porcentaje_cobertura", "captura_completa", "sabado_excluido", "aviso",
  "metodo", "fuentes", "cuadre", "detalle_dias", "detalle_clases",
  "no_identificados", "nunca_periodo", "periodo_desde", "periodo_hasta",
].join(",");

export async function leerHistorico(): Promise<HistoricoData> {
  if (MODO_DEMO) return HISTORICO_DEMO;
  const { data, error } = await supabaseServidor().from("asist_semana_resumen")
    .select(COLUMNAS).order("semana", { ascending: true }).order("materia", { ascending: true });
  if (error) throw error;
  const resultados = (data ?? []) as unknown as ResumenHistorico[];
  // TOC-136: fecha en que se congeló el roster de cada semana (base del denominador).
  const { data: semanas, error: errorSemanas } = await supabaseServidor().from("asist_semanas")
    .select("semana,congelada_en,notas");
  if (errorSemanas) throw errorSemanas;
  const congelacion = new Map((semanas ?? []).map((s) => [s.semana as string, s]));
  for (const fila of resultados) {
    const c = congelacion.get(fila.semana);
    if (c) { fila.congelada_en = c.congelada_en ?? null; fila.roster_reconstruido = /reconstruid/i.test(c.notas ?? ""); }
  }
  return { resultados, nunca_periodo: resultados.find((fila) => fila.nunca_periodo != null)?.nunca_periodo ?? null };
}
