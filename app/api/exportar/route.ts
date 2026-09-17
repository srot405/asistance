import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { supabaseServidor } from "../../../lib/servidor/supabase";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Type": "text/csv; charset=utf-8",
  };
  const q = new URL(request.url).searchParams;
  const demoAllowed = MODO_DEMO && q.get("demo") === "1";
  let user: any = null;
  if (!demoAllowed) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
    user = access;
  }
  const week = q.get("semana") ?? "2026-09-14";
  const vista = q.get("vista") ?? "Resumen";
  if (MODO_DEMO) {
    return new NextResponse(
      "vista,semana\n" + JSON.stringify(vista) + "," + week + "\n",
      { headers },
    );
  }
  const { data, error } = await supabaseServidor()
    .from("asist_celda_semana")
    .select("persona_id,estado")
    .eq("semana", week);
  if (error)
    return NextResponse.json({ error: "No disponible" }, { status: 500 });
  await supabaseServidor()
    .from("asist_corridas")
    .insert({
      script: "export_web",
      resumen: { correo: user.email, semana: week, filas: data.length },
    });
  return new NextResponse(
    "persona_id,estado\n" +
      (data ?? []).map((r) => `${r.persona_id},${r.estado}`).join("\n"),
    { headers },
  );
}
