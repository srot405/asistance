import "server-only";
import { MODO_DEMO } from "../demo.js";
import { clasificar } from "../detalleCalculo.mjs";
import { armarPoblacion, correosABuscar } from "../poblacionCalculo.mjs";
import { cargarBase } from "./leerDetalleSemana";
import { supabaseServidor } from "./supabase";

// Poblacion del periodo (TOC-91, auditoria 2026-10-09): "nunca ingresaron en el periodo", "sin rastro en Zoom", "solo colados" y
// "solo en el log crudo", calculados en vivo desde las tablas del panel por cedula (ver lib/poblacionCalculo.mjs). Reemplaza el
// numero congelado del ETL (asist_semana_resumen.nunca_periodo). Egress: ~6k filas de roster + ~3k entradas + ~4k registrantes,
// cacheado 10 min y compartido; el log crudo solo se consulta para los ~50 candidatos sin entradas.
const PAGINA = 1000;
export const TTL_POBLACION_MS = 10 * 60_000;
type Poblacion = ReturnType<typeof armarPoblacion> & { periodo_desde: string; periodo_hasta: string; calculado_en: string };
let cache: { ms: number; data: Poblacion } | null = null;
let enCurso: Promise<Poblacion> | null = null;
// Tiempo limite de una lectura compartida (sabado 2026-10-10): si una consulta a Supabase se cuelga (caida de red/DNS sin
// respuesta), la promesa en vuelo nunca terminaba y TODAS las lecturas siguientes la esperaban: la pantalla quedaba congelada
// hasta reiniciar el servidor. Con el limite, la lectura falla, se libera `enCurso` y la siguiente vuelve a leer.
export const LIMITE_LECTURA_MS = 60_000;
function conTiempoLimite<T>(p: Promise<T>, ms = LIMITE_LECTURA_MS): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => { t = setTimeout(() => rechazar(new Error("lectura sin respuesta")), ms); });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}

export function vaciarCachePoblacion() { cache = null; enCurso = null; }

async function paginado<T>(construir: () => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const salida: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await construir().range(desde, desde + PAGINA - 1);
    if (error) throw error;
    salida.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGINA) return salida;
  }
}

async function calcular(): Promise<Poblacion> {
  const sb = supabaseServidor();
  const semanas = (await paginado<{ semana: string }>(() => sb.from("asist_semanas").select("semana").order("semana", { ascending: true })))
    .map((s) => s.semana);
  const { data: res, error } = await sb.from("asist_semana_resumen").select("periodo_desde").not("periodo_desde", "is", null)
    .order("periodo_desde", { ascending: true }).limit(1);
  if (error) throw error;
  const desde = (res?.[0] as { periodo_desde?: string } | undefined)?.periodo_desde ?? semanas[0];
  const enPeriodo = semanas.filter((s) => s >= desde);
  const ultima = enPeriodo.at(-1) ?? desde;
  const periodo = <T,>(tabla: string, columnas: string, orden: string[]) => paginado<T>(() => {
    let q = sb.from(tabla).select(columnas).gte("semana", desde).lte("semana", ultima);
    for (const col of orden) q = q.order(col, { ascending: true });
    return q;
  });
  type Fila = Record<string, string>;
  const [rosterPeriodo, franjas, entradas, sesiones, registrantes, celdas] = await Promise.all([
    periodo<Fila>("asist_roster", "semana,persona_id,nombre,ciudad,correo_norm,slot_id", ["semana", "persona_id", "slot_id"]),
    periodo<Fila>("asist_franjas", "semana,slot_id,horario_texto", ["semana", "slot_id"]),
    periodo<Fila>("asist_entradas", "semana,persona_id,sesion_id", ["persona_id", "sesion_id"]),
    periodo<Fila>("asist_sesiones", "semana,sesion_id,slot_id", ["sesion_id"]),
    paginado<Fila>(() => sb.from("zoom_registrantes").select("registrant_id,correo_norm,cedula_digitos").order("registrant_id", { ascending: true })),
    paginado<{ persona_id: string; estado: string }>(() => sb.from("asist_celda_semana").select("persona_id,estado").eq("semana", ultima)
      .order("persona_id", { ascending: true })),
  ]);
  // Evidencia cruda: entradas a CLASE en zoom_live_log de quienes no tienen asist_entradas (por correo o cedula del registro).
  const buscar = correosABuscar({ rosterPeriodo, ultimaSemana: ultima, entradas, registrantes });
  const soloLog = new Set<string>();
  const lista = [...buscar.keys()];
  const inicioMs = Date.parse(`${desde}T05:00:00Z`);
  for (let i = 0; i < lista.length; i += 100) {
    const lote = lista.slice(i, i + 100);
    const { data, error: e } = await sb.from("zoom_live_log").select("correo").eq("evento", "joined").gte("hora_ms", inicioMs)
      .in("correo", lote).or("curso.ilike.BACKEND*,curso.ilike.DESARROLLO*WEB*").limit(1000);
    if (e) throw e;
    for (const f of (data ?? []) as { correo: string }[]) { const id = buscar.get(String(f.correo).toLowerCase()); if (id) soloLog.add(id); }
  }
  const resultado = armarPoblacion({ rosterPeriodo, ultimaSemana: ultima, franjas, entradas, sesiones, registrantes, soloLog,
    celdas: new Map(celdas.map((c) => [String(c.persona_id), c.estado])) });
  return { ...resultado, periodo_desde: desde, periodo_hasta: ultima, calculado_en: new Date().toISOString() };
}

export async function leerPoblacion(ahoraMs = Date.now()): Promise<Poblacion | null> {
  if (MODO_DEMO) return null;   // el demo no tiene log crudo ni registro de Zoom: sin cifra en vez de inventarla
  if (cache && ahoraMs - cache.ms < TTL_POBLACION_MS) return cache.data;
  if (enCurso) return enCurso;
  enCurso = conTiempoLimite(calcular()).then((data) => { cache = { ms: ahoraMs, data }; return data; }).finally(() => { enCurso = null; });
  return enCurso;
}

// No medibles de UNA semana (P o sin dato), separando por que: sin clase todavia/declarada, pendiente o sin dato.
const MOTIVO: Record<string, string> = { sin_clase: "Sin clase (su clase aún no ocurre o no hubo clase)", pendiente: "Pendiente de cierre", sin_dato: "Sin dato de captura" };
export async function listarNoMedibles(semana: string) {
  const base = await cargarBase(semana);
  const salida: Record<string, string>[] = [];
  for (const p of base.roster) {
    const c = clasificar(p, base);
    if (c === "medible") continue;
    const f = p.slot_id ? base.franjas.get(p.slot_id) : undefined;
    salida.push({ cedula: p.persona_id, nombre: p.nombre, correo: p.correo_norm ?? "", ciudad: p.ciudad, su_clase: f?.horario_texto ?? p.slot_id ?? "", motivo: MOTIVO[c] ?? c });
  }
  return salida.sort((a, b) => a.motivo.localeCompare(b.motivo) || a.nombre.localeCompare(b.nombre, "es"));
}
