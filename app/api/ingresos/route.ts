import { NextResponse } from "next/server";
import { line } from "../../../lib/csvSeguro.mjs";
import { MODO_DEMO } from "../../../lib/demo.js";
import type { TipoIngreso } from "../../../lib/detalleCalculo.d.mts";
import { accesoDemo, autorizarNominal, mismaCiudad } from "../../../lib/rolesCalculo.mjs";
import type { Acceso } from "../../../lib/rolesCalculo.d.mts";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { registrarDescarga } from "../../../lib/servidor/auditoria";
import { listarIngresosNominal, semanaTieneDetalle } from "../../../lib/servidor/leerDetalleSemana";

const headers = { "Cache-Control": "private, no-store" };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ETIQUETA = { horario: "Horario correcto", colados: "Solo colado" };

// CSV con nombres de los filtros del calendario (TOC-91): horario correcto / solo colados / ambos, de la semana o del dia de SU
// clase (?fecha=). Las cifras en pantalla salen de /api/detalle (lib/detalleCalculo.mjs, mismo calculo). Pasa por
// autorizarNominal (monitor solo su ciudad, sin rol 403) y queda en panel_descargas.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const semana = q.get("semana") ?? "";
  const fecha = q.get("fecha") || undefined;
  const tipo = (["horario", "colados", "ambos"].includes(q.get("tipo") ?? "") ? q.get("tipo") : "ambos") as TipoIngreso;
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
  const permiso = autorizarNominal(acceso, q.get("ciudad"));
  if (!permiso.ok) return NextResponse.json({ error: permiso.mensaje }, { status: permiso.status, headers });
  const ciudadRol = permiso.ciudad;
  try {
    if (!(await semanaTieneDetalle(semana)))
      return NextResponse.json({ error: "Esta semana no tiene detalle por día" }, { status: 400, headers });
    const filas = (await listarIngresosNominal(semana, { tipo, fecha, ciudad: ciudadRol ?? (q.get("ciudad") || undefined),
      franja: q.get("franja") || undefined, cuenta: q.get("cuenta") || undefined }))
      .filter((f) => !ciudadRol || mismaCiudad(f.ciudad, ciudadRol));   // defensa en profundidad
    if (!demo) {
      const ok = await registrarDescarga(acceso, { correo, vista: `ingresos-${tipo}${fecha ? "-dia" : "-semana"}`, semana,
        ciudad: ciudadRol ?? (q.get("ciudad") || null), filas: filas.length });
      if (!ok) return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
    }
    const csv = [["fecha_su_clase", "su_clase", "tipo", "nombre", "cedula", "ciudad", "entro_a"],
      ...filas.map((f) => [f.fecha, f.su_clase, ETIQUETA[f.tipo], f.nombre, f.cedula, f.ciudad, f.entro_a])];
    return new NextResponse("﻿" + csv.map(line).join("\r\n"), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
}
