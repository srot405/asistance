import { NextResponse } from "next/server";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { leerCobertura } from "../../../lib/servidor/leerCobertura";

const headers = { "Cache-Control": "private, no-store" };

// Solo agregados: clases del roster semanal y cuántas personas distintas entraron a cada
// una según el registro en vivo de Zoom. Sin nombres, correos ni cédulas.
export async function GET(request: Request) {
  const access = await exigirAcceso(request);
  if (access instanceof NextResponse) return access;
  const params = new URL(request.url).searchParams;
  const semana = params.get("semana") ?? "";
  const materia = params.get("materia") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana))
    return NextResponse.json({ error: "Semana inválida" }, { status: 400, headers });
  if (!/^[\p{L}\d .-]{2,40}$/u.test(materia))
    return NextResponse.json({ error: "Materia inválida" }, { status: 400, headers });
  try {
    return NextResponse.json(await leerCobertura(semana, materia), { headers });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 500, headers });
  }
}
