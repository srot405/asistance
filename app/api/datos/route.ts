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
  const [
    { data: semanas, error: e1 },
    { data: franjas, error: e2 },
    { data: roster, error: e3 },
    { data: celdas_dia, error: e4 },
    { data: celdas_semana, error: e5 },
    { data: no_identificados, error: e6 },
  ] = await Promise.all([
    sb.from("asist_semanas").select("*").eq("semana", week),
    sb.from("asist_franjas").select("*").eq("semana", week).order("fecha"),
    sb.from("asist_roster").select("*").eq("semana", week).order("persona_id"),
    sb.from("asist_celda_dia").select("*").eq("semana", week).order("fecha"),
    sb.from("asist_celda_semana").select("*").eq("semana", week),
    sb.from("asist_no_identificados").select("*").eq("semana", week),
  ]);
  const error = [e1, e2, e3, e4, e5, e6].find(Boolean);
  if (error)
    return NextResponse.json(
      { error: "No disponible" },
      { status: 500, headers },
    );
  const body = JSON.stringify({
    semana: week,
    materia: semanas?.[0]?.materia,
    estado_semana: semanas?.[0]?.estado,
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
