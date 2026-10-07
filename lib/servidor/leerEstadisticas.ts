import "server-only";
import { MODO_DEMO } from "../demo.js";
import { ESTADISTICAS_DEMO, SERIE_DEMO, construirCortesDemo, MATERIA_DEMO } from "../estadisticas-demo.mjs";
import type { EstadisticasRespuesta, FilaClaseCorte, FilaNivel } from "../estadisticasCalculo.d.mts";
import { NO_DISPONIBLE, esTablaAusente, tablaTiempo } from "./leerTiempo";

// Estadisticas (TOC-150): lee SOLO las vistas sin PII v_asist_corte (085) y v_asist_corte_nivel (087). La supresion n<5 ya la hizo
// la vista (cifras en null); aqui no se recalcula nada. Pagina siempre (PostgREST corta en 1000 filas sin avisar).
// Cache de servidor 60 s: son agregados iguales para todo usuario autenticado (el acceso se exige en la ruta), asi que compartirlo
// no mezcla permisos y evita releer las vistas (egress limitado) cada vez que alguien cambia de pestana.
const CIFRAS = "suprimido,roster,entraron_a_su_clase,fueron_a_otra,no_aparecieron,no_medibles,visitas_recibidas";
const COLUMNAS_NIVEL = `semana,nivel,ciudad,dia,materia,${CIFRAS}`;
const COLUMNAS_CLASE = `semana,ciudad,slot_id,materia,dia,fecha,hora_inicio,hora_fin,cuenta_zoom,tipo,sala,estado_captura,${CIFRAS},mediana_pct_tiempo`;
export const TTL_CACHE_ESTADISTICAS_MS = 60_000;
const cache = new Map<string, { en: number; lectura: Promise<EstadisticasRespuesta> }>();
export function vaciarCacheEstadisticas(): void { cache.clear(); }

async function leer(semana: string): Promise<EstadisticasRespuesta> {
  if (MODO_DEMO) {
    const d = (ESTADISTICAS_DEMO as Record<string, any>)[semana] ?? construirCortesDemo(semana);
    return { disponible: true, semana, materia: (MATERIA_DEMO as Record<string, string>)[semana] ?? "Demo", niveles: d.niveles, clases: d.clases, serie: SERIE_DEMO };
  }
  try {
    const [niveles, clases, serie] = await Promise.all([
      tablaTiempo<FilaNivel>("v_asist_corte_nivel", COLUMNAS_NIVEL, semana, ["nivel", "ciudad", "dia"]),
      tablaTiempo<FilaClaseCorte>("v_asist_corte", COLUMNAS_CLASE, semana, ["fecha", "slot_id", "ciudad"]),
      tablaTiempo<FilaNivel>("v_asist_corte_nivel", COLUMNAS_NIVEL, null, ["semana", "ciudad"], { nivel: "ciudad" }),
    ]);
    return { disponible: true, semana, materia: niveles[0]?.materia ?? clases[0]?.materia ?? null, niveles, clases, serie };
  } catch (error) {
    if (esTablaAusente(error)) return { ...NO_DISPONIBLE, motivo: "sin_vistas" };
    throw error;
  }
}

export function leerEstadisticas(semana: string): Promise<EstadisticasRespuesta> {
  const ahora = Date.now();
  const hit = cache.get(semana);
  if (hit && ahora - hit.en < TTL_CACHE_ESTADISTICAS_MS) return hit.lectura;
  const lectura = leer(semana);
  cache.set(semana, { en: ahora, lectura });
  lectura.catch(() => { if (cache.get(semana)?.lectura === lectura) cache.delete(semana); });   // un fallo no se cachea
  while (cache.size > 6) cache.delete(cache.keys().next().value as string);
  return lectura;
}
