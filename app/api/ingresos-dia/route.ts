import { NextResponse } from "next/server";
import { line } from "../../../lib/csvSeguro.mjs";
import { MODO_DEMO } from "../../../lib/demo.js";
import { filasCsvIngresos, filtrarTipo } from "../../../lib/ingresosDia.mjs";
import type { TipoIngreso } from "../../../lib/ingresosDia.d.mts";
import { accesoDemo, autorizarNominal, mismaCiudad } from "../../../lib/rolesCalculo.mjs";
import type { Acceso } from "../../../lib/rolesCalculo.d.mts";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { registrarDescarga } from "../../../lib/servidor/auditoria";
import { leerIngresosDia, semanaTieneDetalle } from "../../../lib/servidor/leerDetalleSemana";

const headers = { "Cache-Control": "private, no-store" };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Calendario de la pestana Semana (TOC-91): quien entro ESE dia en su horario, quien se colo a otra clase, o ambos.
// Nominal: exigirAcceso + autorizarNominal antes de leer; el monitor solo recibe personas de su ciudad (filtrado aqui).
// ?formato=csv descarga la misma lista. Cada consulta queda en panel_descargas (sin contenido).
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const semana = q.get("semana") ?? "";
  const fecha = q.get("fecha") ?? "";
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
  const permiso = autorizarNominal(acceso, q.get("ciudad"));
  if (!permiso.ok) return NextResponse.json({ error: permiso.mensaje }, { status: permiso.status, headers });
  if (!FECHA.test(semana) || !FECHA.test(fecha)) return NextResponse.json({ error: "Semana o fecha inválida" }, { status: 400, headers });
  try {
    if (!(await semanaTieneDetalle(semana)))
      return NextResponse.json({ error: "Esta semana no tiene detalle por día" }, { status: 400, headers });
    const filtro = { ciudad: permiso.ciudad ?? (q.get("ciudad") || undefined), franja: q.get("franja") || undefined, cuenta: q.get("cuenta") || undefined };
    const r = await leerIngresosDia(semana, fecha, filtro);
    // Defensa en profundidad: aunque el lector ya filtro por ciudad, ninguna fila de otra ciudad sale para un monitor.
    const todas = permiso.ciudad ? r.filas.filter((f) => mismaCiudad(f.ciudad, permiso.ciudad)) : r.filas;
    const base = { ...r, filas: todas, conteo: { propias: todas.filter((f) => f.tipo === "propia").length,
      otras: todas.filter((f) => f.tipo === "otra").length, ambos: todas.length } };
    const filas = filtrarTipo(base, tipo);
    if (!demo) {
      const ok = await registrarDescarga(acceso, { correo, vista: `ingresos-dia-${tipo}${csv ? "-csv" : ""}`, semana,
        ciudad: permiso.ciudad ?? (q.get("ciudad") || null), filas: filas.length });
      if (!ok) return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
    }
    if (csv) return new NextResponse("﻿" + filasCsvIngresos(filas, fecha).map(line).join("\r\n"),
      { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
    return NextResponse.json({ fecha, tipo, conteo: base.conteo, filas }, { headers });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
}
