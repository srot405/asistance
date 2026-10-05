import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { leerPresenciaClase, semanaTieneDetalle } from "../../../lib/servidor/leerPresenciaClase";

const headers = { "Cache-Control": "private, no-store" };

// Solo agregados (conteos): nunca devuelve nombre, cédula ni correo — ver
// lib/servidor/leerPresenciaClase.ts. Nombre + CSV nominal viven detrás de
// exigirAcceso en /api/exportar-nominal (vista=presencia).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const semana = params.get("semana") ?? "";
  const franja = params.get("franja") ?? "";
  const demoAllowed = MODO_DEMO && params.get("demo") === "1";
  if (!demoAllowed) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana))
    return NextResponse.json({ error: "Semana inválida" }, { status: 400, headers });
  if (!(await semanaTieneDetalle(semana)))
    return NextResponse.json({ error: "Esta semana no tiene presencia por clase (nivel distinto de Detalle)" },
      { status: 400, headers });
  if (!franja)
    return NextResponse.json({ error: "Falta la franja (clase)" }, { status: 400, headers });
  try {
    const data = await leerPresenciaClase(semana, franja);
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 500, headers });
  }
}
