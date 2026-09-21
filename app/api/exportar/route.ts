import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MODO_DEMO } from "../../../lib/demo.js";
import { agregarDatos } from "../../../lib/agregados";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { supabaseServidor } from "../../../lib/servidor/supabase";

const headers = { "Cache-Control": "private, no-store", "Content-Type": "text/csv; charset=utf-8" };
const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const semana = q.get("semana") ?? "2026-09-14";
  const demoAllowed = MODO_DEMO && q.get("demo") === "1";
  let user: any = null;
  if (!demoAllowed) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
    user = access;
  }
  if (MODO_DEMO) {
    const raw = JSON.parse(await readFile(resolve(process.cwd(), "data/demo", `semana-${semana}.json`), "utf8"));
    const data = agregarDatos(raw);
    const rows = data.por_franja.map((r) => [r.fecha, r.slot_id, r.roster, r.entro, r.aOtra, r.colados, r.falto]);
    return new NextResponse(["fecha,franja,roster,entro,a_otra,colados,falto", ...rows.map((row) => row.map(csv).join(","))].join("\n") + "\n", { headers });
  }
  const sb = supabaseServidor();
  const [{ data: franjas, error }, { data: sesiones }] = await Promise.all([
    sb.from("asist_franjas").select("slot_id,fecha,roster_n").eq("semana", semana).order("fecha").order("slot_id"),
    sb.from("asist_sesiones").select("slot_id,estado_captura,personas_visita,entradas_totales").eq("semana", semana),
  ]);
  if (error) return NextResponse.json({ error: "No disponible" }, { status: 500 });
  const porSlot = new Map((sesiones ?? []).map((s) => [s.slot_id, s]));
  const rows = (franjas ?? []).map((f) => {
    const s = porSlot.get(f.slot_id);
    return [f.fecha, f.slot_id, f.roster_n, s?.entradas_totales ?? 0, s?.personas_visita ?? 0, s?.estado_captura ?? "sin_captura"];
  });
  await sb.from("asist_corridas").insert({ script: "export_web", resumen: { correo: user.email, semana, filas: rows.length } });
  return new NextResponse(["fecha,franja,roster,entradas_totales,personas_visita,estado_captura", ...rows.map((row) => row.map(csv).join(","))].join("\n") + "\n", { headers });
}
