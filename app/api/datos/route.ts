import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { supabaseServidor } from "../../../lib/servidor/supabase";
const headers = { "Cache-Control": "private, no-store" };
const cache = new Map<string, { at: number; body: string }>();
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const week = params.get("semana") ?? "2026-09-14";
  if (!(MODO_DEMO && params.get("demo") === "1")) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
  }
  if (MODO_DEMO) {
    const raw = await readFile(
      resolve(process.cwd(), "data/demo", `semana-${week}.json`),
      "utf8",
    );
    return new NextResponse(raw, {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  const cached = cache.get(week);
  if (cached && Date.now() - cached.at < 300_000)
    return new NextResponse(cached.body, {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  const sb = supabaseServidor();
  // PostgREST devuelve COMO MÁXIMO 1.000 filas por petición, y lo hace en
  // silencio: no da error ni avisa de que truncó. `asist_celda_dia` tiene 3.630
  // filas por semana (726 personas × 5 días), así que hasta el 2026-09-21 el
  // panel mostraba solo el 27% de las celdas diarias y todos sus conteos
  // estaban mal. Hay que pedir por tramos SIEMPRE que la tabla pueda superar
  // las 1.000 filas.
  async function traerTodo(tabla: string, ...orden: string[]) {
    const paso = 1000;
    const filas: unknown[] = [];
    for (let desde = 0; ; desde += paso) {
      let consulta = sb.from(tabla).select("*").eq("semana", week);
      // El orden tiene que ser total y estable: si hay empates, la paginación
      // puede repetir u omitir filas entre tramos.
      for (const columna of orden) consulta = consulta.order(columna);
      const { data, error } = await consulta.range(desde, desde + paso - 1);
      if (error) throw error;
      filas.push(...(data ?? []));
      if (!data || data.length < paso) return filas;
    }
  }
  let semanas, franjasBase, roster, celdas_dia, celdas_semana, no_identificados;
  let sesiones;
  try {
    [
      semanas,
      franjasBase,
      roster,
      celdas_dia,
      celdas_semana,
      no_identificados,
      sesiones,
    ] = await Promise.all([
      traerTodo("asist_semanas", "semana"),
      traerTodo("asist_franjas", "fecha", "slot_id"),
      traerTodo("asist_roster", "persona_id"),
      traerTodo("asist_celda_dia", "fecha", "persona_id"),
      traerTodo("asist_celda_semana", "persona_id"),
      traerTodo("asist_no_identificados", "sesion_id"),
      traerTodo("asist_sesiones", "slot_id"),
    ]);
  } catch {
    return NextResponse.json(
      { error: "No disponible" },
      { status: 500, headers },
    );
  }
  // `asist_franjas` describe el horario; `asist_sesiones`, lo que pasó en él
  // (estado de captura, cuánta gente del roster entró y cuánta ajena). El panel
  // solo leía franjas, así que `estado_captura` llegaba undefined y la pestaña
  // ZOOM-LIMIT contaba 0 siempre con datos reales. Se unen aquí por slot_id.
  const porSlot = new Map(
    (sesiones as Array<Record<string, unknown>>).map((s) => [s.slot_id, s]),
  );
  const franjas = (franjasBase as Array<Record<string, unknown>>).map((f) => ({
    ...f,
    ...(porSlot.get(f.slot_id) ?? {}),
  }));
  const body = JSON.stringify({
    semana: week,
    materia: (semanas as Array<{ materia?: string }>)?.[0]?.materia,
    estado_semana: (semanas as Array<{ estado?: string }>)?.[0]?.estado,
    roster,
    franjas,
    celdas_dia,
    celdas_semana,
    no_identificados,
    counts: {},
  });
  cache.set(week, { at: Date.now(), body });
  return new NextResponse(body, {
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
