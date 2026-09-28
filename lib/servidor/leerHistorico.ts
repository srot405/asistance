import "server-only";
import { HISTORICO_DEMO } from "../historico-demo.mjs";
import { MODO_DEMO } from "../demo.js";
import type { HistoricoData, ResumenHistorico } from "../types";
import { supabaseServidor } from "./supabase";

const COLUMNAS = [
  "semana", "materia", "nivel", "poblacion", "asistieron", "nunca",
  "porcentaje_retencion", "porcentaje_nunca", "clases_programadas",
  "clases_capturadas", "porcentaje_cobertura", "captura_completa", "aviso",
  "metodo", "fuentes", "cuadre", "detalle_dias", "detalle_clases",
  "no_identificados", "nunca_periodo", "periodo_desde", "periodo_hasta",
].join(",");

export async function leerHistorico(): Promise<HistoricoData> {
  if (MODO_DEMO) return HISTORICO_DEMO;
  const { data, error } = await supabaseServidor().from("asist_semana_resumen")
    .select(COLUMNAS).order("semana", { ascending: true }).order("materia", { ascending: true });
  if (error) throw error;
  const resultados = (data ?? []) as unknown as ResumenHistorico[];
  return { resultados, nunca_periodo: resultados.find((fila) => fila.nunca_periodo != null)?.nunca_periodo ?? null };
}
