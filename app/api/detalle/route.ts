import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { leerDetalleSemana, SEMANAS_DETALLE } from "../../../lib/servidor/leerDetalleSemana";

const headers = { "Cache-Control": "private, no-store" };

// Aritmético/agregado únicamente: nunca devuelve nombre, cédula ni correo. El
// desglose por ciudad/franja/cuenta solo existe para semanas nivel "Detalle"
// (roster congelado real) — ver lib/servidor/leerDetalleSemana.ts.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const semana = params.get("semana") ?? "";
  const demoAllowed = MODO_DEMO && params.get("demo") === "1";
  if (!demoAllowed) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana))
    return NextResponse.json({ error: "Semana inválida" }, { status: 400, headers });
  if (!SEMANAS_DETALLE.has(semana))
    return NextResponse.json({ error: "Esta semana no tiene detalle por día (nivel distinto de Detalle)" },
      { status: 400, headers });
  const filtro = {
    ciudad: params.get("ciudad") || undefined,
    franja: params.get("franja") || undefined,
    cuenta: params.get("cuenta") || undefined,
  };
  try {
    const data = await leerDetalleSemana(semana, filtro);
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 500, headers });
  }
}
