import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { leerHistorico } from "../../../lib/servidor/leerHistorico";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const demoAllowed =
    MODO_DEMO && new URL(request.url).searchParams.get("demo") === "1";
  if (!demoAllowed) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
  }
  try {
    const data = await leerHistorico();
    return NextResponse.json({ semanas: data.resultados.map(({ semana, materia, nivel }) =>
      ({ semana, materia, nivel })) }, { headers });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 500, headers });
  }
}
