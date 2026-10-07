import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { leerEstadisticas } from "../../../lib/servidor/leerEstadisticas";

// TOC-150. SOLO agregados (conteos por ciudad/dia/clase, ya suprimidos n<5 en la vista): sin nombres, correos ni persona_id, asi que
// esta ruta sirve a TODO usuario autenticado del dominio (admin, monitor o sin rol): no consulta el rol. Cache privado corto; un fallo
// -> 503 sin detalles internos y sin cachear. Sin las vistas 085/087 -> 200 { disponible:false } (la pantalla lo explica).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const semana = params.get("semana") ?? "";
  const demoAllowed = MODO_DEMO && params.get("demo") === "1";
  if (!demoAllowed) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana))
    return NextResponse.json({ error: "Semana inválida" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  try {
    return NextResponse.json(await leerEstadisticas(semana), { headers: { "Cache-Control": "private, max-age=30" } });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
