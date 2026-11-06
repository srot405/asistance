import "server-only";
import { calcularSemanaJcon, construirBaseJcon, filasNominalJcon, hoyCOT, listarSemanasJcon } from "../semanaJcon.mjs";
import type { AsistenciaJcon, ClaseJcon, DatosJcon, EstudianteSemanaJcon, FiltroJcon, OpcionSemanaJcon, SemanaJconResponse } from "../semanaJcon.d.mts";
import { COHORTE_JCON } from "../vivoJcon.mjs";
import { supabaseServidor } from "./supabase";

// TOC-208 fase 2: JC-ON en la pestana «Semana». Lector PARALELO y aislado de JC: solo lee el esquema `jcon` (estudiantes, clases,
// asistencia de la cohorte), nunca asist_*; su cache es propio y no comparte nada con leerDetalleSemana.ts / leerHistorico.ts.
// Egress: la cohorte completa son ~75 estudiantes, 2 clases x 2 grupos por semana y solo filas de quien entro (cientos), asi que se lee
// TODO una vez y se calcula cada semana en memoria. Cache de 60 s compartido (el cargador corre cada 30 min), una lectura en vuelo,
// tiempo limite de 20 s y techo de paginas. Un fallo lanza y no se cachea: la ruta responde 503 y JC sigue igual.
const PAGINA = 1000;
const MAX_PAGINAS = 10;
export const TTL_CACHE_SEMANA_JCON_MS = 60_000;
export const LIMITE_LECTURA_MS = 20_000;

let cache: { ms: number; datos: DatosJcon; truncado: boolean } | null = null;
let enCurso: Promise<{ datos: DatosJcon; truncado: boolean }> | null = null;

export function vaciarCacheSemanaJcon() { cache = null; enCurso = null; }

function conTiempoLimite<T>(p: Promise<T>, ms = LIMITE_LECTURA_MS): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => { t = setTimeout(() => rechazar(new Error("lectura sin respuesta")), ms); });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}

async function leerPaginado<T>(construir: () => any): Promise<{ filas: T[]; truncado: boolean }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const filas: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p += 1) {
    const { data, error } = await construir().range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as T[];
    filas.push(...lote);
    if (lote.length < PAGINA) return { filas, truncado: false };
  }
  return { filas, truncado: true };
}

async function cargar(): Promise<{ datos: DatosJcon; truncado: boolean }> {
  const sb = supabaseServidor().schema("jcon");
  const [estudiantes, clases] = await Promise.all([
    leerPaginado<EstudianteSemanaJcon>(() => sb.from("estudiantes").select("id,cohorte_jcon,cedula,nombres,apellidos,horario,estado,grupo_ciudad")
      .eq("cohorte_jcon", COHORTE_JCON).order("id", { ascending: true })),
    leerPaginado<ClaseJcon>(() => sb.from("clases").select("id,cohorte_jcon,fecha,horario,tema,tipo,numero_semana")
      .eq("cohorte_jcon", COHORTE_JCON).order("id", { ascending: true })),
  ]);
  const ids = clases.filas.map((c) => Number(c.id));
  const asistencia: AsistenciaJcon[] = [];
  let truncado = estudiantes.truncado || clases.truncado;
  // Por lotes de clase_id (la URL de PostgREST tiene limite); solo filas de quien entro.
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const r = await leerPaginado<AsistenciaJcon>(() => sb.from("asistencia").select("clase_id,estudiante_id,asistio,fuente").in("clase_id", lote)
      .eq("asistio", true).order("clase_id", { ascending: true }).order("estudiante_id", { ascending: true }));
    asistencia.push(...r.filas);
    truncado = truncado || r.truncado;
  }
  return { datos: { estudiantes: estudiantes.filas, clases: clases.filas, asistencia }, truncado };
}

async function datosJcon(ahoraMs: number): Promise<{ datos: DatosJcon; truncado: boolean; ms: number }> {
  if (cache && ahoraMs - cache.ms < TTL_CACHE_SEMANA_JCON_MS && ahoraMs >= cache.ms) return cache;
  if (!enCurso) enCurso = conTiempoLimite(cargar()).then((r) => { cache = { ms: ahoraMs, ...r }; return r; }).finally(() => { enCurso = null; });
  const r = await enCurso;
  return { ...r, ms: cache?.ms ?? ahoraMs };
}

const AVISO_TRUNCADO = "Hay más filas de las que se leen; las cifras de JC-ON pueden estar incompletas.";

// Opciones del selector (solo agregados).
export async function listarSemanasJconServidor(ahoraMs: number = Date.now()): Promise<OpcionSemanaJcon[]> {
  const { datos } = await datosJcon(ahoraMs);
  return listarSemanasJcon(datos.clases);
}

// null = la semana no es de JC-ON (la ruta responde 404).
export async function leerSemanaJcon(semana: string, filtro: FiltroJcon = {}, ahoraMs: number = Date.now()): Promise<SemanaJconResponse | null> {
  const { datos, truncado, ms } = await datosJcon(ahoraMs);
  if (!listarSemanasJcon(datos.clases).some((o) => o.semana === semana)) return null;
  const base = construirBaseJcon(semana, datos, hoyCOT(ahoraMs));
  return { ...calcularSemanaJcon(base, filtro), actualizado_en: new Date(ms).toISOString(), aviso: truncado ? AVISO_TRUNCADO : null };
}

// Nominal (PII). Solo lo llama la ruta DESPUES de exigirAcceso + autorizarNominal; ciudad del monitor ya va en el filtro.
export async function filasNominalSemanaJcon(semana: string, filtro: FiltroJcon = {}, ahoraMs: number = Date.now()): Promise<string[][] | null> {
  const { datos } = await datosJcon(ahoraMs);
  if (!listarSemanasJcon(datos.clases).some((o) => o.semana === semana)) return null;
  return filasNominalJcon(construirBaseJcon(semana, datos, hoyCOT(ahoraMs)), filtro);
}
