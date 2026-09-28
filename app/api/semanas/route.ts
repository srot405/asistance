import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { supabaseServidor } from "../../../lib/servidor/supabase";
import { semanaActualCOT } from "../../../lib/conteos";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const demoAllowed =
    MODO_DEMO && new URL(request.url).searchParams.get("demo") === "1";
  if (!demoAllowed) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
  }
  if (MODO_DEMO) {
    const semanas = [];
    for (const week of ["2026-09-14", "2026-09-07"]) {
      const d = JSON.parse(
        await readFile(
          resolve(process.cwd(), "data/demo", `semana-${week}.json`),
          "utf8",
        ),
      );
      semanas.push({ semana: week, estado: d.estado_semana, materia: d.materia });
    }
    const semanaActual = semanaActualCOT();
    return NextResponse.json({ semanas, semanaActual,
      semanaActualRegistrada: semanas.some((w) => w.semana === semanaActual) }, { headers });
  }
  const { data, error } = await supabaseServidor()
    .from("asist_semanas")
    .select("semana,materia,estado")
    .order("semana", { ascending: false });
  if (error)
    return NextResponse.json(
      { error: "No disponible" },
      { status: 500, headers },
    );
  const semanaActual = semanaActualCOT();
  return NextResponse.json({ semanas: data ?? [], semanaActual,
    semanaActualRegistrada: (data ?? []).some((w) => w.semana === semanaActual) }, { headers });
}
