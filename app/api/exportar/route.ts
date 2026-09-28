import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { leerSemana } from "../../../lib/servidor/leerSemana";
import { construirCsv } from "../../../lib/exportar.mjs";

const headers = { "Cache-Control": "private, no-store", "Content-Type": "text/csv; charset=utf-8" };

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const semana = q.get("semana") ?? "2026-09-14";
  const vista = q.get("vista") ?? "Resumen";
  const demoAllowed = MODO_DEMO && q.get("demo") === "1";
  if (!demoAllowed) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana))
    return NextResponse.json({ error: "Semana inválida" }, { status: 400, headers });
  if (!(["Resumen", "Asistencia por horario"] as string[]).includes(vista))
    return NextResponse.json({ error: "Vista de exportación no válida" }, { status: 400, headers });
  try {
    const demo = MODO_DEMO;
    const data = await leerSemana(semana, !demo);
    const csv = construirCsv(data, vista, demo);
    const nombre = `asistencia_${semana}_${csv.archivo}.csv`;
    return new NextResponse(csv.contenido, { headers: {
      ...headers, "Content-Disposition": `attachment; filename="${nombre}"`,
    } });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 500, headers });
  }
}
