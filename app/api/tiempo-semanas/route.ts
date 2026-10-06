import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { leerTiempoSemanas } from "../../../lib/servidor/leerTiempo";

const headers = { "Cache-Control": "private, no-store" };

// Serie semana a semana (solo agregados, sin PII). Sin tablas -> 200 { disponible:false }; fallo -> 503 sin detalles.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!(MODO_DEMO && params.get("demo") === "1")) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
  }
  try {
    return NextResponse.json(await leerTiempoSemanas(), { headers });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
}
