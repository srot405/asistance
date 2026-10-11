import "server-only";
import { HISTORICO_DEMO } from "../historico-demo.mjs";
import { MODO_DEMO } from "../demo.js";
import type { HistoricoData, ResumenHistorico } from "../types";
import { supabaseServidor } from "./supabase";
import { calcularDetalleSemana, clasificar } from "../detalleCalculo.mjs";
import { cargarBase } from "./leerDetalleSemana";

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
    .select("semana,congelada_en,cerrada_en,notas");
  if (errorSemanas) throw errorSemanas;
  const congelacion = new Map((semanas ?? []).map((s) => [s.semana as string, s]));
  for (const fila of resultados) {
    const c = congelacion.get(fila.semana);
    if (c) { fila.congelada_en = c.congelada_en ?? null; fila.cerrada_en = c.cerrada_en ?? null; fila.roster_reconstruido = /reconstruid/i.test(c.notas ?? ""); }
  }
  return { resultados, nunca_periodo: resultados.find((fila) => fila.nunca_periodo != null)?.nunca_periodo ?? null };
}

// ── Hero "en vivo" (fase 1.1 plan veracidad, 2026-10-09) ────────────────────────────────────────────────────────────────────
// asist_semana_resumen es la FOTO del ETL y puede quedar vieja (2026-10-05: 170/230 mientras el calendario daba 174/233). Para
// semanas nivel "Detalle" el hero muestra la MISMA cifra del calendario: calcularDetalleSemana(...).resumen sin filtros, sobre la
// misma base (cargarBase). La cifra del ETL queda como *_etl. "Solo semanal"/"Sin dato" siguen con el ETL (no tienen detalle).
// Si el calculo falla, la fila queda con el ETL marcado resumen_fuente="etl" (nunca se inventa). Egress: ~700 roster + entradas
// por semana Detalle; cache compartida por semana: 2 min si la semana esta abierta, 60 min si ya se cerro (cerrada_en).
export type CamposResumenVivo = {
  resumen_fuente?: "vivo" | "etl";
  resumen_calculado_en?: string;
  poblacion_etl?: number | null;
  asistieron_etl?: number | null;
  nunca_etl?: number | null;
  porcentaje_retencion_etl?: number | null;
  porcentaje_nunca_etl?: number | null;
  cuadre_etl?: ResumenHistorico["cuadre"];
};
export type ResumenConVivo = ResumenHistorico & CamposResumenVivo;
type Vivo = Pick<ResumenHistorico, "poblacion" | "asistieron" | "nunca" | "porcentaje_retencion" | "porcentaje_nunca" | "cuadre">
  & { calculado_en: string };
export const TTL_VIVO_ABIERTA_MS = 2 * 60_000;
export const TTL_VIVO_CERRADA_MS = 60 * 60_000;
const cacheVivo = new Map<string, { ms: number; ttl: number; data: Vivo }>();
const enCursoVivo = new Map<string, Promise<Vivo>>();
export function vaciarCacheResumenVivo() { cacheVivo.clear(); enCursoVivo.clear(); }

async function calcularVivo(semana: string): Promise<Vivo> {
  const base = await cargarBase(semana);
  if (base.roster.length === 0) throw new Error(`sin roster para ${semana}`);
  const r = calcularDetalleSemana(semana, base).resumen;
  const cuadre = { roster: base.roster.length, medibles: 0, sin_dato: 0, pendientes: 0, sin_clase: 0 };
  for (const p of base.roster) {
    const c = clasificar(p, base);
    if (c === "medible") cuadre.medibles += 1; else if (c === "pendiente") cuadre.pendientes += 1;
    else if (c === "sin_dato") cuadre.sin_dato += 1; else cuadre.sin_clase += 1;
  }
  return { poblacion: r.poblacion, asistieron: r.asistieron, nunca: r.nunca, porcentaje_retencion: r.porcentaje_retencion,
    porcentaje_nunca: r.porcentaje_nunca, cuadre, calculado_en: new Date().toISOString() };
}

async function resumenVivo(semana: string, cerrada: boolean): Promise<Vivo> {
  const ahora = Date.now();
  const hit = cacheVivo.get(semana);
  if (hit && ahora - hit.ms < hit.ttl) return hit.data;
  const pendiente = enCursoVivo.get(semana);
  if (pendiente) return pendiente;
  const promesa = calcularVivo(semana).then((data) => {
    cacheVivo.set(semana, { ms: Date.now(), ttl: cerrada ? TTL_VIVO_CERRADA_MS : TTL_VIVO_ABIERTA_MS, data });
    return data;
  }).finally(() => enCursoVivo.delete(semana));
  enCursoVivo.set(semana, promesa);
  return promesa;
}

// Devuelve una copia (no muta HISTORICO_DEMO ni la cache). En MODO_DEMO no recalcula: el demo sigue con su historico fijo.
export async function aplicarResumenVivo(data: HistoricoData): Promise<HistoricoData> {
  if (MODO_DEMO) return data;
  const resultados = await Promise.all(data.resultados.map(async (fila): Promise<ResumenConVivo> => {
    if (fila.nivel !== "Detalle") return fila;
    const etl = { poblacion_etl: fila.poblacion, asistieron_etl: fila.asistieron, nunca_etl: fila.nunca,
      porcentaje_retencion_etl: fila.porcentaje_retencion, porcentaje_nunca_etl: fila.porcentaje_nunca, cuadre_etl: fila.cuadre };
    try {
      const { calculado_en, ...vivo } = await resumenVivo(fila.semana, Boolean(fila.cerrada_en));
      return { ...fila, ...etl, ...vivo, resumen_fuente: "vivo", resumen_calculado_en: calculado_en };
    } catch {
      console.error(`resumen en vivo fallo (${fila.semana}): se muestra la cifra del ETL`);
      return { ...fila, ...etl, resumen_fuente: "etl" };
    }
  }));
  return { ...data, resultados };
}
