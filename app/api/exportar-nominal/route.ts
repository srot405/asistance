import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { construirCsvNominal, construirCsvPresencia } from "../../../lib/exportarNominal.mjs";
import { construirCsvReporte } from "../../../lib/reporteSemana.mjs";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { leerReporteSemana, listarAusentesNominal, nivelSemana, semanaTieneDetalle } from "../../../lib/servidor/leerDetalleSemana";
import { listarPresenciaNominal } from "../../../lib/servidor/leerPresenciaClase";

const headers = { "Cache-Control": "private, no-store", "Content-Type": "text/csv; charset=utf-8" };

// CSV con nombre: SIEMPRE detrás de exigirAcceso (Bearer @tocaunavida.org), igual
// que /api/exportar. En MODO_DEMO usa nombres 100% sintéticos ("Persona Demo NN",
// ver lib/detalle-demo.mjs) — jamás datos reales, y esta ruta jamás toca
// producción cuando MODO_DEMO está activo (ver leerDetalleSemana.ts).
//
// `vista=presencia` (TOC-91, 2026-09-29): mismo CSV nominal, reusado en vez de
// crear una ruta aparte — Presente/Entró y salió/Nunca entró de UNA franja,
// con nombre; el resto de parámetros (alcance/ciudad/cuenta) no aplican ahí.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const semana = q.get("semana") ?? "";
  const vista = q.get("vista") === "presencia" ? "presencia" : q.get("vista") === "reporte" ? "reporte" : "ausentes";
  const alcance = q.get("alcance") ?? "semana";
  const fecha = q.get("fecha") || undefined;
  const demoAllowed = MODO_DEMO && q.get("demo") === "1";
  if (!demoAllowed) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana))
    return NextResponse.json({ error: "Semana inválida" }, { status: 400, headers });
  // vista=reporte: se decide por la EXISTENCIA del roster congelado, no por asist_semana_resumen
  // (la semana en curso aun no tiene resumen). Solo una semana explicitamente "Solo semanal" se
  // rechaza (400); sin roster -> 404 claro; sin resumen -> se sirve y RESUMEN declara "resumen no generado".
  if (vista === "reporte") {
    try {
      const nivel = await nivelSemana(semana);
      if (nivel && nivel !== "Detalle")
        return NextResponse.json({ error: `Esta semana es "${nivel}": no tiene roster nominal por clase` },
          { status: 400, headers });
      const reporte = await leerReporteSemana(semana);
      if (!reporte)
        return NextResponse.json({ error: "Esta semana no tiene roster congelado todavía" }, { status: 404, headers });
      const csv = construirCsvReporte(reporte);
      return new NextResponse(csv.contenido, { headers: {
        ...headers, "Content-Disposition": `attachment; filename="asistencia_${semana}_${csv.archivo}.csv"`,
      } });
    } catch {
      return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
    }
  }

  let tieneDetalle: boolean;
  try {
    tieneDetalle = await semanaTieneDetalle(semana);
  } catch {
      return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
  if (!tieneDetalle)
    return NextResponse.json({ error: "Esta semana no tiene roster nominal (nivel distinto de Detalle)" },
      { status: 400, headers });

  if (vista === "presencia") {
    const franja = q.get("franja") ?? "";
    if (!franja) return NextResponse.json({ error: "Falta la franja (clase)" }, { status: 400, headers });
    try {
      const filas = await listarPresenciaNominal(semana, franja);
      const csv = construirCsvPresencia(filas);
      const nombre = `asistencia_${semana}_${franja}_${csv.archivo}.csv`;
      return new NextResponse(csv.contenido, { headers: {
        ...headers, "Content-Disposition": `attachment; filename="${nombre}"`,
      } });
    } catch {
      return NextResponse.json({ error: "No disponible" }, { status: 500, headers });
    }
  }

  if (alcance !== "semana" && alcance !== "dia")
    return NextResponse.json({ error: "Alcance inválido" }, { status: 400, headers });
  if (alcance === "dia" && !fecha)
    return NextResponse.json({ error: "Falta la fecha del día" }, { status: 400, headers });
  const filtro = {
    ciudad: q.get("ciudad") || undefined,
    franja: q.get("franja") || undefined,
    cuenta: q.get("cuenta") || undefined,
    fecha: alcance === "dia" ? fecha : undefined,
  };
  try {
    const filas = await listarAusentesNominal(semana, filtro);
    const csv = construirCsvNominal(filas, alcance);
    const nombre = `asistencia_${semana}_${csv.archivo}.csv`;
    return new NextResponse(csv.contenido, { headers: {
      ...headers, "Content-Disposition": `attachment; filename="${nombre}"`,
    } });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 500, headers });
  }
}
