import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { accesoDemo, autorizarNominal, filtrarPorCiudad } from "../../../lib/rolesCalculo.mjs";
import type { Acceso } from "../../../lib/rolesCalculo.d.mts";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { registrarDescarga } from "../../../lib/servidor/auditoria";
import { semanaTieneDetalle } from "../../../lib/servidor/leerDetalleSemana";
import { leerVisitasSemana } from "../../../lib/servidor/leerVisitas";

const headers = { "Cache-Control": "private, no-store" };

// NOMINAL (visitante con nombre): SIEMPRE detras de exigirAcceso, igual que /api/exportar-nominal. La matriz origen -> destino
// que devuelve va sin nombres y con las celdas de menos de 5 personas suprimidas (ver lib/visitasCalculo.mjs). Sin tablas de
// tiempo -> 200 { disponible:false }; un fallo de lectura -> 503 JSON sin detalles internos.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const semana = params.get("semana") ?? "";
  const demoAllowed = MODO_DEMO && params.get("demo") === "1";
  // TOC-148 (V2): la tabla lleva nombres -> rol. Sin rol 403, RPC de roles caida 503, monitor solo su ciudad (aqui, en el servidor).
  let acceso: Acceso = accesoDemo(params);
  let correo: string | null = null;
  if (!demoAllowed) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
    acceso = access.acceso;
    correo = access.email ?? null;
  }
  const permiso = autorizarNominal(acceso, params.get("ciudad"));
  if (!permiso.ok) return NextResponse.json({ error: permiso.mensaje }, { status: permiso.status, headers });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana))
    return NextResponse.json({ error: "Semana inválida" }, { status: 400, headers });
  let tieneDetalle: boolean;
  try {
    tieneDetalle = await semanaTieneDetalle(semana);
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
  if (!tieneDetalle)
    return NextResponse.json({ error: "Esta semana no tiene visitas por clase (nivel distinto de Detalle)" },
      { status: 400, headers });
  const filtro = { ciudad: permiso.ciudad ?? (params.get("ciudad") || null), franja: params.get("franja") || null, cuenta: params.get("cuenta") || null };
  try {
    const lectura = await leerVisitasSemana(semana, filtro);
    if (!lectura.disponible) return NextResponse.json(lectura, { headers });
    // Defensa en profundidad: el monitor jamas recibe un visitante de otra ciudad, aunque el lector fallara al filtrar.
    const visitas = filtrarPorCiudad(lectura.visitas, permiso.ciudad);
    if (!demoAllowed) {
      const ok = await registrarDescarga(acceso, { correo, vista: "visitas", semana, ciudad: filtro.ciudad, filas: visitas.length });
      if (!ok) return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
    }
    return NextResponse.json({ ...lectura, visitas }, { headers });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
}
