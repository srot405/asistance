import { NextResponse } from "next/server";
import { line } from "../../../lib/csvSeguro.mjs";
import { MODO_DEMO } from "../../../lib/demo.js";
import { accesoDemo, autorizarNominal, mismaCiudad } from "../../../lib/rolesCalculo.mjs";
import type { Acceso } from "../../../lib/rolesCalculo.d.mts";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { registrarDescarga } from "../../../lib/servidor/auditoria";
import { leerListaVivo } from "../../../lib/servidor/leerVivoNominal";
import { filasCsv, recortarPorPermiso } from "../../../lib/vivoNominal.mjs";
import type { ListaVivoResponse } from "../../../lib/vivoNominal.d.mts";

const headersJson = { "Cache-Control": "private, no-store" };
const headersCsv = { "Cache-Control": "private, no-store", "Content-Type": "text/csv; charset=utf-8" };
// Auditoria de la PANTALLA: como mucho una fila por persona y minuto (el cliente sondea cada 45 s). Cada CSV se registra siempre.
const VENTANA_AUDITORIA_PANTALLA_MS = 60_000;
const ultimaAuditoria = new Map<string, number>();

// TOC-153 «Lista en vivo»: nombres, cedulas y correos de quien entro hoy a cada clase. exigirAcceso + autorizarNominal ANTES de
// leer nada: admin/compatibilidad ven todo; monitor solo personas del roster de su ciudad (sin no identificados ni personal);
// sin rol 403; RPC de roles caida 503. ?formato=csv descarga lo mismo que se ve.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const csv = q.get("formato") === "csv";
  const headers = csv ? headersCsv : headersJson;
  const demo = MODO_DEMO && q.get("demo") === "1";
  let acceso: Acceso = accesoDemo(q);
  let correo: string | null = null;
  if (!demo) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
    acceso = access.acceso;
    correo = access.email ?? null;
  }
  const permiso = autorizarNominal(acceso, q.get("ciudad"));
  if (!permiso.ok) return NextResponse.json({ error: permiso.mensaje }, { status: permiso.status, headers: headersJson });

  let datos: ListaVivoResponse;
  try {
    datos = demo ? (await import("../../../lib/vivoNominal-demo.mjs")).LISTA_VIVO_DEMO as ListaVivoResponse : await leerListaVivo();
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers: headersJson });
  }
  const visible = recortarPorPermiso(datos, permiso, mismaCiudad);
  const filas = visible.clases.reduce((n, c) => n + c.personas.length, 0);

  if (!demo) {
    const clave = (correo ?? "").toLowerCase();
    const ahora = Date.now();
    const toca = csv || ahora - (ultimaAuditoria.get(clave) ?? 0) >= VENTANA_AUDITORIA_PANTALLA_MS;
    if (toca) {
      const ok = await registrarDescarga(acceso, { correo, vista: csv ? "vivo-nominal-csv" : "vivo-nominal", semana: visible.semana,
        ciudad: permiso.ciudad, filas });
      if (!ok) return NextResponse.json({ error: "No disponible" }, { status: 503, headers: headersJson });
      if (!csv) { ultimaAuditoria.set(clave, ahora); if (ultimaAuditoria.size > 500) ultimaAuditoria.delete(ultimaAuditoria.keys().next().value as string); }
    }
  }
  if (csv) return new NextResponse("﻿" + filasCsv(visible).map(line).join("\r\n"), { headers: headersCsv });
  return NextResponse.json({ ...visible, alcance: permiso.ciudad ? { ciudad: permiso.ciudad } : { ciudad: null } }, { headers });
}
