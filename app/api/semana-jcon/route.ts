import { NextResponse } from "next/server";
import { line } from "../../../lib/csvSeguro.mjs";
import { MODO_DEMO } from "../../../lib/demo.js";
import { accesoDemo, autorizarNominal } from "../../../lib/rolesCalculo.mjs";
import type { Acceso } from "../../../lib/rolesCalculo.d.mts";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { registrarDescarga } from "../../../lib/servidor/auditoria";
import { filasNominalSemanaJcon, leerSemanaJcon, listarSemanasJconServidor } from "../../../lib/servidor/leerSemanaJcon";
import { calcularSemanaJcon, construirBaseJcon, filasNominalJcon, listarSemanasJcon, mismaCiudadJcon } from "../../../lib/semanaJcon.mjs";
import type { FiltroJcon } from "../../../lib/semanaJcon.d.mts";

const headersJson = { "Cache-Control": "private, no-store" };
const headersCsv = { "Cache-Control": "private, no-store", "Content-Type": "text/csv; charset=utf-8" };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// JC-ON fase 2: JC-ON en la pestana «Semana». Ruta PROPIA (no toca /api/datos ni /api/detalle de JC): si JC-ON falla, esta ruta
// responde 503 y el panel de JC sigue igual. Tres usos, todos detras de exigirAcceso:
//   sin ?semana                  -> { semanas: [...] } opciones del selector (solo agregados);
//   ?semana=<lunes>              -> agregados de la semana (codigos por clase, semana a semana, por grupo). Sin nombres ni cedulas;
//                                   ?ciudad= y ?grupo=V|S filtran. Sin supresion n<5 (excepcion JC-ON, ADR-0018);
//   ?semana=<lunes>&formato=csv  -> lista nominal (PII): autorizarNominal (monitor solo su ciudad = jcon.estudiantes.grupo_ciudad,
//                                   sin rol 403) + registro en panel_descargas, igual que /api/ingresos.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const demo = MODO_DEMO && q.get("demo") === "1";
  let acceso: Acceso = accesoDemo(q);
  let correo: string | null = null;
  if (!demo) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
    acceso = access.acceso;
    correo = access.email ?? null;
  }
  const semana = q.get("semana");
  const csv = q.get("formato") === "csv";
  const demoMod = demo ? await import("../../../lib/semanaJcon-demo.mjs") : null;
  if (!semana) {
    try {
      const semanas = demoMod ? listarSemanasJcon(demoMod.DATOS_DEMO_JCON.clases) : await listarSemanasJconServidor();
      return NextResponse.json({ semanas }, { headers: headersJson });
    } catch {
      return NextResponse.json({ error: "No disponible" }, { status: 503, headers: headersJson });
    }
  }
  if (!FECHA.test(semana)) return NextResponse.json({ error: "Semana inválida" }, { status: 400, headers: headersJson });
  const grupo = q.get("grupo");
  const filtro: FiltroJcon = { ciudad: q.get("ciudad") || undefined, grupo: grupo === "V" || grupo === "S" ? grupo : undefined };
  const baseDemo = () => demoMod && listarSemanasJcon(demoMod.DATOS_DEMO_JCON.clases).some((o) => o.semana === semana)
    ? construirBaseJcon(semana, demoMod.DATOS_DEMO_JCON, demoMod.HOY_DEMO_JCON) : null;

  if (!csv) {
    try {
      const datos = demoMod ? (() => { const b = baseDemo(); return b ? { ...calcularSemanaJcon(b, filtro), aviso: null } : null; })()
        : await leerSemanaJcon(semana, filtro);
      if (!datos) return NextResponse.json({ error: "Esa semana no tiene clases de JC-ON" }, { status: 404, headers: headersJson });
      return NextResponse.json(datos, { headers: headersJson });
    } catch {
      return NextResponse.json({ error: "No disponible" }, { status: 503, headers: headersJson });
    }
  }

  const permiso = autorizarNominal(acceso, q.get("ciudad"));
  if (!permiso.ok) return NextResponse.json({ error: permiso.mensaje }, { status: permiso.status, headers: headersJson });
  const ciudad = permiso.ciudad ?? filtro.ciudad;
  try {
    const todas = demoMod ? (() => { const b = baseDemo(); return b ? filasNominalJcon(b, { ...filtro, ciudad }) : null; })()
      : await filasNominalSemanaJcon(semana, { ...filtro, ciudad });
    if (!todas) return NextResponse.json({ error: "Esa semana no tiene clases de JC-ON" }, { status: 404, headers: headersJson });
    const [cab, ...cuerpo] = todas;
    const filas = cuerpo.filter((f) => !permiso.ciudad || mismaCiudadJcon(f[2], permiso.ciudad));   // defensa en profundidad
    if (!demo) {
      const ok = await registrarDescarga(acceso, { correo, vista: "jcon-semana", semana, ciudad: ciudad ?? null, filas: filas.length });
      if (!ok) return NextResponse.json({ error: "No disponible" }, { status: 503, headers: headersJson });
    }
    return new NextResponse("﻿" + [cab, ...filas].map(line).join("\r\n"), { headers: headersCsv });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers: headersJson });
  }
}
