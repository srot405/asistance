import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MODO_DEMO } from "../../../lib/demo.js";
import { agregarDatos } from "../../../lib/agregados";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { supabaseServidor } from "../../../lib/servidor/supabase";

const headers = { "Cache-Control": "private, no-store" };
const cache = new Map<string, { at: number; body: string }>();

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const semana = params.get("semana") ?? "2026-09-14";
  if (!(MODO_DEMO && params.get("demo") === "1")) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
  }
  if (MODO_DEMO) {
    const raw = JSON.parse(await readFile(resolve(process.cwd(), "data/demo", `semana-${semana}.json`), "utf8"));
    return NextResponse.json(agregarDatos(raw), { headers });
  }
  const cached = cache.get(semana);
  if (cached && Date.now() - cached.at < 300_000)
    return new NextResponse(cached.body, { headers: { ...headers, "Content-Type": "application/json" } });
  const sb = supabaseServidor();
  async function traerTodo(tabla: string, ...orden: string[]) {
    const paso = 1000;
    const filas: Record<string, unknown>[] = [];
    for (let desde = 0; ; desde += paso) {
      let consulta = sb.from(tabla).select("*").eq("semana", semana);
      for (const columna of orden) consulta = consulta.order(columna);
      const { data, error } = await consulta.range(desde, desde + paso - 1);
      if (error) throw error;
      filas.push(...((data ?? []) as Record<string, unknown>[]));
      if (!data || data.length < paso) return filas;
    }
  }
  try {
    const [semanas, franjasBase, roster, celdas_dia, celdas_semana, no_identificados, sesiones] = await Promise.all([
      traerTodo("asist_semanas", "semana"), traerTodo("asist_franjas", "fecha", "slot_id"),
      traerTodo("asist_roster", "persona_id"), traerTodo("asist_celda_dia", "fecha", "persona_id"),
      traerTodo("asist_celda_semana", "persona_id"), traerTodo("asist_no_identificados", "sesion_id"),
      traerTodo("asist_sesiones", "slot_id"),
    ]);
    const porSlot = new Map(sesiones.map((s) => [s.slot_id, s]));
    const franjas = franjasBase.map((f) => ({ ...f, ...(porSlot.get(f.slot_id) ?? {}) }));
    const body = JSON.stringify(agregarDatos({ semana, materia: (semanas[0] as any)?.materia, estado_semana: (semanas[0] as any)?.estado, roster, franjas, celdas_dia, celdas_semana, no_identificados }));
    cache.set(semana, { at: Date.now(), body });
    return new NextResponse(body, { headers: { ...headers, "Content-Type": "application/json" } });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 500, headers });
  }
}
