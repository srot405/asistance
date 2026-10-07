import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { leerConfianzaSemana } from "../../../lib/servidor/leerConfianza";
import { semanaTieneDetalle } from "../../../lib/servidor/leerDetalleSemana";

const headers = { "Cache-Control": "private, no-store" };

// Solo AGREGADOS por clase (estado de captura y cuadre): nunca nombre, persona_id ni correo. Mismo contrato de errores que /api/tiempo.
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
  let tieneDetalle: boolean;
  try {
    tieneDetalle = await semanaTieneDetalle(semana);
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
  if (!tieneDetalle)
    return NextResponse.json({ error: "Esta semana no tiene confianza por clase (nivel distinto de Detalle)" },
      { status: 400, headers });
  try {
    return NextResponse.json(await leerConfianzaSemana(semana), { headers });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
}
