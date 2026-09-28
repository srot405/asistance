import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { leerHistorico } from "../../../lib/servidor/leerHistorico";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!(MODO_DEMO && params.get("demo") === "1")) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
  }
  try {
    const data = await leerHistorico();
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 500, headers });
  }
}
