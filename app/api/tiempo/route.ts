import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { semanaConPersonas } from "../../../lib/servidor/leerDetalleSemana";
import { leerTiempoSemana } from "../../../lib/servidor/leerTiempo";

const headers = { "Cache-Control": "private, no-store" };

// Solo AGREGADOS: nunca devuelve nombre, persona_id ni correo (ver lib/servidor/leerTiempo.ts). El nominal vive
// en /api/exportar-nominal?vista=tiempo, detras del mismo exigirAcceso. Sin tablas de tiempo -> 200 { disponible:false }
// (la pantalla muestra "Tiempo aun no disponible"); un fallo de lectura -> 503 JSON sin detalles internos.
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
  let reconstruida = false;
  try {
    const gate = await semanaConPersonas(semana);              // acepta «Solo semanal» reconstruidas con detalle por persona
    tieneDetalle = gate.ok;
    reconstruida = gate.reconstruida;
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
  if (!tieneDetalle)
    return NextResponse.json({ error: "Esta semana no tiene tiempo por persona" },
      { status: 400, headers });
  const filtro = { ciudad: params.get("ciudad") || null, franja: params.get("franja") || null, cuenta: params.get("cuenta") || null };
  // Semana reconstruida: la clase de cada persona es la asignacion actual, asi que no se publican cortes por clase ni por cuenta (solo ciudad).
  if (reconstruida && (filtro.franja || filtro.cuenta))
    return NextResponse.json({ error: "En una semana reconstruida solo se puede filtrar por ciudad" }, { status: 400, headers });
  try {
    const ligero = params.get("ligero") === "1";
    const data = await leerTiempoSemana(semana, filtro, { ligero });
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
}
