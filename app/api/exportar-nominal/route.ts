import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { construirCsvNominal, construirCsvPresencia, construirCsvTiempo } from "../../../lib/exportarNominal.mjs";
import { construirCsvReporte } from "../../../lib/reporteSemana.mjs";
import { accesoDemo, autorizarNominal, filtrarPorCiudad } from "../../../lib/rolesCalculo.mjs";
import type { Acceso } from "../../../lib/rolesCalculo.d.mts";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { registrarDescarga } from "../../../lib/servidor/auditoria";
import { leerReporteSemana, listarAusentesNominal, nivelSemana, semanaTieneDetalle } from "../../../lib/servidor/leerDetalleSemana";
import { listarPresenciaNominal } from "../../../lib/servidor/leerPresenciaClase";
import { listarTiempoNominal } from "../../../lib/servidor/leerTiempo";

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
  const vista = q.get("vista") === "presencia" ? "presencia" : q.get("vista") === "reporte" ? "reporte"
    : q.get("vista") === "tiempo" ? "tiempo" : "ausentes";
  const alcance = q.get("alcance") ?? "semana";
  const fecha = q.get("fecha") || undefined;
  const demoAllowed = MODO_DEMO && q.get("demo") === "1";
  // TOC-148 (V2): el nominal depende del rol. Admin y compatibilidad ven todo; el monitor SOLO su ciudad (filtrada aqui, en el
  // servidor: un ?ciudad= ajeno es 403 y ademas ninguna fila de otra ciudad sale); sin rol -> 403; RPC de roles caida -> 503.
  let acceso: Acceso = accesoDemo(q);
  let correo: string | null = null;
  if (!demoAllowed) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
    acceso = access.acceso;
    correo = access.email ?? null;
  }
  const permiso = autorizarNominal(acceso, q.get("ciudad"));
  if (!permiso.ok) return NextResponse.json({ error: permiso.mensaje }, { status: permiso.status, headers });
  const ciudadRol = permiso.ciudad;
  // Auditoria (D3): una fila por descarga, sin contenido. En estricto, sin registro no hay descarga (503); en compatibilidad solo se loguea.
  const auditar = async (vistaCsv: string, filas: number): Promise<NextResponse | null> => {
    if (demoAllowed) return null;
    const ok = await registrarDescarga(acceso, { correo, vista: vistaCsv, semana, ciudad: ciudadRol ?? (q.get("ciudad") || null), filas });
    return ok ? null : NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  };
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
      const visible = { ...reporte, filas: filtrarPorCiudad(reporte.filas, ciudadRol) };
      const csv = construirCsvReporte(visible);
      const bloqueo = await auditar("reporte", visible.filas.length);
      if (bloqueo) return bloqueo;
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

  // vista=tiempo (TOC-140): una fila por persona-sesion con el veredicto guardado por el backend (cumple_50 + pct_tiempo).
  // Sin tablas de tiempo: 200 con estado_tiempo=no_calculado (no es un error). Siempre tras exigirAcceso (arriba).
  if (vista === "tiempo") {
    try {
      const filas = filtrarPorCiudad(await listarTiempoNominal(semana, {
        ciudad: ciudadRol ?? (q.get("ciudad") || null), franja: q.get("franja") || null, cuenta: q.get("cuenta") || null }), ciudadRol);
      const csv = construirCsvTiempo(filas);
      const bloqueo = await auditar("tiempo", filas.length);
      if (bloqueo) return bloqueo;
      return new NextResponse(csv.contenido, { headers: {
        ...headers, "Content-Disposition": `attachment; filename="asistencia_${semana}_${csv.archivo}.csv"`,
      } });
    } catch {
      return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
    }
  }

  if (vista === "presencia") {
    const franja = q.get("franja") ?? "";
    if (!franja) return NextResponse.json({ error: "Falta la franja (clase)" }, { status: 400, headers });
    // La franja viaja al nombre del archivo (Content-Disposition): solo letras, digitos, "_" y "-" (los ids reales
    // llevan tildes: backend-sábado-08-uno, por eso se admite Latin-1 ademas de \w). Comillas/saltos de linea -> 400.
    if (!/^[\wÀ-ÿ-]+$/.test(franja)) return NextResponse.json({ error: "Franja inválida" }, { status: 400, headers });
    try {
      const filas = filtrarPorCiudad(await listarPresenciaNominal(semana, franja), ciudadRol);
      const csv = construirCsvPresencia(filas);
      const bloqueo = await auditar("presencia", filas.length);
      if (bloqueo) return bloqueo;
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
    ciudad: ciudadRol ?? (q.get("ciudad") || undefined),
    franja: q.get("franja") || undefined,
    cuenta: q.get("cuenta") || undefined,
    fecha: alcance === "dia" ? fecha : undefined,
  };
  try {
    const filas = filtrarPorCiudad(await listarAusentesNominal(semana, filtro), ciudadRol);
    const csv = construirCsvNominal(filas, alcance);
    const bloqueo = await auditar(alcance === "dia" ? "ausentes_dia" : "ausentes_semana", filas.length);
    if (bloqueo) return bloqueo;
    const nombre = `asistencia_${semana}_${csv.archivo}.csv`;
    return new NextResponse(csv.contenido, { headers: {
      ...headers, "Content-Disposition": `attachment; filename="${nombre}"`,
    } });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 500, headers });
  }
}
