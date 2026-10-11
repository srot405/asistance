import { NextResponse } from "next/server";
import { line } from "../../../lib/csvSeguro.mjs";
import { COLUMNAS_POBLACION, VISTAS_POBLACION, filtrarCiudad } from "../../../lib/poblacionCalculo.mjs";
import type { VistaPoblacion } from "../../../lib/poblacionCalculo.d.mts";
import { autorizarNominal } from "../../../lib/rolesCalculo.mjs";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { registrarDescarga } from "../../../lib/servidor/auditoria";
import { leerPoblacion, listarNoMedibles } from "../../../lib/servidor/leerPoblacion";

const headers = { "Cache-Control": "private, no-store" };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Poblacion del periodo (TOC-91, auditoria 2026-10-09).
// - Sin `vista`: solo CONTEOS (agregados, abiertos al dominio): nunca / sin rastro / solo colados / solo en log crudo.
// - ?vista=nunca|sin_rastro|solo_colados|solo_log (periodo) o ?vista=no_medibles&semana= : CSV con nombres. Pasa por
//   autorizarNominal (monitor solo su ciudad, sin rol 403) y queda en panel_descargas.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const access = await exigirAcceso(request);
  if (access instanceof NextResponse) return access;
  const vista = q.get("vista");
  try {
    if (!vista) {
      const p = await leerPoblacion();
      if (!p) return NextResponse.json({ disponible: false }, { headers });
      return NextResponse.json({ disponible: true, poblacion: p.poblacion, conteos: p.conteos, periodo_desde: p.periodo_desde,
        periodo_hasta: p.periodo_hasta, calculado_en: p.calculado_en }, { headers });
    }
    const valida = vista === "no_medibles" || (VISTAS_POBLACION as string[]).includes(vista);
    if (!valida) return NextResponse.json({ error: "Vista inválida" }, { status: 400, headers });
    const permiso = autorizarNominal(access.acceso, q.get("ciudad"));
    if (!permiso.ok) return NextResponse.json({ error: permiso.mensaje }, { status: permiso.status, headers });
    let filas: Record<string, string>[];
    let semana: string;
    if (vista === "no_medibles") {
      semana = q.get("semana") ?? "";
      if (!FECHA.test(semana)) return NextResponse.json({ error: "Semana inválida" }, { status: 400, headers });
      filas = await listarNoMedibles(semana);
    } else {
      const p = await leerPoblacion();
      if (!p) return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
      semana = p.periodo_hasta;
      filas = p.listas[vista as VistaPoblacion];
    }
    filas = filtrarCiudad(filtrarCiudad(filas, permiso.ciudad), q.get("ciudad"));
    const ok = await registrarDescarga(access.acceso, { correo: access.email ?? null, vista: `poblacion-${vista}`, semana,
      ciudad: permiso.ciudad ?? (q.get("ciudad") || null), filas: filas.length });
    if (!ok) return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
    const columnas = COLUMNAS_POBLACION[vista as keyof typeof COLUMNAS_POBLACION];
    const csv = [columnas, ...filas.map((f) => columnas.map((c) => f[c] ?? ""))];
    return new NextResponse("﻿" + csv.map(line).join("\r\n"), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
}
