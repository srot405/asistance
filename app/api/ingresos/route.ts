import { NextResponse } from "next/server";
import { line } from "../../../lib/csvSeguro.mjs";
import { MODO_DEMO } from "../../../lib/demo.js";
import { contarPorDia, filasCsvIngresos, filtrarTipo } from "../../../lib/ingresosDia.mjs";
import type { TipoIngreso } from "../../../lib/ingresosDia.d.mts";
import { accesoDemo, autorizarNominal, mismaCiudad } from "../../../lib/rolesCalculo.mjs";
import type { Acceso } from "../../../lib/rolesCalculo.d.mts";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { registrarDescarga } from "../../../lib/servidor/auditoria";
import { leerIngresos, semanaTieneDetalle } from "../../../lib/servidor/leerDetalleSemana";

const headers = { "Cache-Control": "private, no-store" };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Botones generales del calendario (TOC-91): «En su horario» / «Se colaron a otra clase» / «Ambos».
// - Sin formato: SOLO conteos por dia y de la semana (agregados, abiertos a todo el dominio como /api/detalle). Nunca nombres.
// - ?formato=csv: el nominal (nombre, cedula, ciudad, clase a la que entro, su clase, hora) de la semana o de ?fecha=.
//   Pasa por autorizarNominal (monitor solo su ciudad, sin rol 403) y queda en panel_descargas.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const semana = q.get("semana") ?? "";
  const fecha = q.get("fecha") || null;
  const tipo = (["propias", "otras", "ambos"].includes(q.get("tipo") ?? "") ? q.get("tipo") : "ambos") as TipoIngreso;
  const csv = q.get("formato") === "csv";
  const demo = MODO_DEMO && q.get("demo") === "1";
  let acceso: Acceso = accesoDemo(q);
  let correo: string | null = null;
  if (!demo) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
    acceso = access.acceso;
    correo = access.email ?? null;
  }
  if (!FECHA.test(semana) || (fecha && !FECHA.test(fecha))) return NextResponse.json({ error: "Semana o fecha inválida" }, { status: 400, headers });
  let ciudadRol: string | null = null;
  if (csv) {
    const permiso = autorizarNominal(acceso, q.get("ciudad"));
    if (!permiso.ok) return NextResponse.json({ error: permiso.mensaje }, { status: permiso.status, headers });
    ciudadRol = permiso.ciudad;
  }
  try {
    if (!(await semanaTieneDetalle(semana)))
      return NextResponse.json({ error: "Esta semana no tiene detalle por día" }, { status: 400, headers });
    const filtro = { ciudad: ciudadRol ?? (q.get("ciudad") || undefined), franja: q.get("franja") || undefined, cuenta: q.get("cuenta") || undefined };
    const r = await leerIngresos(semana, csv ? fecha : null, filtro);
    if (!csv) return NextResponse.json({ semana, conteo: r.conteo, porDia: contarPorDia(r.filas) }, { headers });
    // Defensa en profundidad: ninguna fila de otra ciudad sale para un monitor.
    const filas = filtrarTipo(r, tipo).filter((f) => !ciudadRol || mismaCiudad(f.ciudad, ciudadRol));
    if (!demo) {
      const ok = await registrarDescarga(acceso, { correo, vista: `ingresos-${tipo}${fecha ? "-dia" : "-semana"}`, semana,
        ciudad: ciudadRol ?? (q.get("ciudad") || null), filas: filas.length });
      if (!ok) return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
    }
    return new NextResponse("﻿" + filasCsvIngresos(filas).map(line).join("\r\n"), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
}
