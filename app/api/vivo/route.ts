import { NextResponse } from "next/server";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { leerVivo } from "../../../lib/servidor/leerVivo";

const headers = { "Cache-Control": "private, no-store" };

// TOC-142. SOLO conteos por clase (nunca nombres, correos ni persona_id) y SIN parametros: no hay forma de pedir mas detalle.
// exigirAcceso va antes de toda lectura. Un fallo -> 503 sin detalles internos y sin cachear. El cache de servidor (30 s) se
// comparte entre visitantes y vive en lib/servidor/leerVivo.ts.
export async function GET(request: Request) {
  const access = await exigirAcceso(request);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json(await leerVivo(), { headers });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
}
