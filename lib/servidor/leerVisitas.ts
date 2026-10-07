import "server-only";
import { MODO_DEMO } from "../demo.js";
import { TIEMPO_DEMO } from "../tiempo-demo.mjs";
import type { FiltroTiempo, FranjaTiempo, TiempoNoDisponible } from "../tiempoContrato.d.mts";
import { armarVisitas } from "../visitasCalculo.mjs";
import type { FilaClaseVisitas, FilaNoIdentificadoDb, FilaVisitaDb, VisitasRespuesta } from "../visitasCalculo.d.mts";
import { NO_DISPONIBLE, esTablaAusente, tablaTiempo } from "./leerTiempo";

// "Entro a clase ajena" (TOC-147). Lee v_asist_tiempo_persona SOLO las filas es_visita (con nombre: PII, la ruta ya exigio acceso),
// asist_tiempo_clase (para cuadrar el total), asist_franjas y asist_no_identificados. Pagina siempre con tablaTiempo
// (PostgREST corta en 1000 filas sin avisar). No recalcula veredictos: muestra el estado_tiempo guardado por el backend.
const COLUMNAS_VISITA = "sesion_id,franja_tiempo,fecha,nombre,ciudad,franja_propia,estado_tiempo,pct_tiempo,es_visita";

export async function leerVisitasSemana(semana: string, filtro: FiltroTiempo = {}): Promise<VisitasRespuesta> {
  if (MODO_DEMO) {
    const d = (TIEMPO_DEMO as Record<string, any>)[semana];
    if (!d) throw new Error(`Sin datos demo de tiempo para ${semana}`);
    return armarVisitas({ semana, filas: d.personas, franjas: d.franjas, clases: d.clases, noIdentificados: d.noIdentificados, filtro });
  }
  try {
    const [filas, franjas, clases, noIdentificados] = await Promise.all([
      tablaTiempo<FilaVisitaDb>("v_asist_tiempo_persona", COLUMNAS_VISITA, semana, ["sesion_id", "persona_id"], { es_visita: true }),
      tablaTiempo<FranjaTiempo>("asist_franjas", "slot_id,fecha,cuenta_zoom,horario_texto", semana, ["slot_id"]),
      tablaTiempo<FilaClaseVisitas>("asist_tiempo_clase", "sesion_id,slot_id,visitas", semana, ["sesion_id"]),
      tablaTiempo<FilaNoIdentificadoDb>("asist_no_identificados", "sesion_id,motivo,cantidad", semana, ["sesion_id", "motivo"]),
    ]);
    return armarVisitas({ semana, filas, franjas, clases, noIdentificados, filtro });
  } catch (error) {
    if (esTablaAusente(error)) return NO_DISPONIBLE as TiempoNoDisponible;
    throw error;
  }
}
