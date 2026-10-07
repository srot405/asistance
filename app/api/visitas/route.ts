import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { semanaTieneDetalle } from "../../../lib/servidor/leerDetalleSemana";
import { leerVisitasSemana } from "../../../lib/servidor/leerVisitas";

const headers = { "Cache-Control": "private, no-store" };

// NOMINAL (visitante con nombre): SIEMPRE detras de exigirAcceso, igual que /api/exportar-nominal. La matriz origen -> destino
// que devuelve va sin nombres y con las celdas de menos de 5 personas suprimidas (ver lib/visitasCalculo.mjs). Sin tablas de
// tiempo -> 200 { disponible:false }; un fallo de lectura -> 503 JSON sin detalles internos.
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
    return NextResponse.json({ error: "Esta semana no tiene visitas por clase (nivel distinto de Detalle)" },
      { status: 400, headers });
  const filtro = { ciudad: params.get("ciudad") || null, franja: params.get("franja") || null, cuenta: params.get("cuenta") || null };
  try {
    return NextResponse.json(await leerVisitasSemana(semana, filtro), { headers });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  }
}
