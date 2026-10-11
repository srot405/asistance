import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { aplicarResumenVivo, leerHistorico } from "../../../lib/servidor/leerHistorico";
import { construirCsv } from "../../../lib/exportar.mjs";

const headers = { "Cache-Control": "private, no-store", "Content-Type": "text/csv; charset=utf-8" };

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const semana = q.get("semana") ?? "";
  const vista = q.get("vista") ?? "Resumen";
  const demoAllowed = MODO_DEMO && q.get("demo") === "1";
  if (!demoAllowed) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana))
    return NextResponse.json({ error: "Semana inválida" }, { status: 400, headers });
  if (vista !== "Resumen")
    return NextResponse.json({ error: "Vista de exportación no válida" }, { status: 400, headers });
  try {
    let data = await leerHistorico();
    // TOC-91 (fase 1, 2026-10-09): mismas cifras que el resumen de la pestana Semana (recalculadas en vivo para semanas
    // Detalle); si el recalculo falla, sale la foto del ETL como antes.
    try { data = await aplicarResumenVivo(data); } catch { console.error("aplicarResumenVivo fallo: el CSV usa el resumen del ETL"); }
    const materia = q.get("materia");
    const fila = data.resultados.find((item) => item.semana === semana &&
      (!materia || item.materia === materia));
    if (!fila)
      return NextResponse.json({ error: "Semana no disponible" }, { status: 404, headers });
    const csv = construirCsv(fila, vista);
    const nombre = `asistencia_${semana}_${csv.archivo}.csv`;
    return new NextResponse(csv.contenido, { headers: {
      ...headers, "Content-Disposition": `attachment; filename="${nombre}"`,
    } });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 500, headers });
  }
}
