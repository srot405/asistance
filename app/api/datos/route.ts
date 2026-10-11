import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { aplicarResumenVivo, leerHistorico } from "../../../lib/servidor/leerHistorico";
import { leerPoblacion } from "../../../lib/servidor/leerPoblacion";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!(MODO_DEMO && params.get("demo") === "1")) {
    const access = await exigirAcceso(request);
    if (access instanceof NextResponse) return access;
  }
  try {
    let data = await leerHistorico();
    // Fase 1.1 plan veracidad (2026-10-09): en semanas "Detalle" el hero usa la MISMA cifra del calendario, calculada en vivo
    // (cache corta compartida); la del ETL queda como *_etl. Si falla, cada fila conserva el ETL marcado resumen_fuente="etl".
    try { data = await aplicarResumenVivo(data); } catch { console.error("aplicarResumenVivo fallo: se muestra el resumen del ETL"); }
    // TOC-91 (auditoria 2026-10-09): "nunca ingresaron en el periodo" se calcula en vivo por cedula desde las tablas del panel
    // (rastreable 1 a 1 con el CSV de /api/poblacion). El numero congelado del ETL queda como nunca_periodo_etl. Si el calculo
    // falla, se muestra el del ETL marcado como tal (nunca se inventa una cifra).
    data.nunca_periodo_etl = data.nunca_periodo;
    data.nunca_periodo_fuente = "etl";
    try {
      const p = await leerPoblacion();
      if (p) { data.nunca_periodo = p.conteos.nunca; data.nunca_periodo_fuente = "vivo"; data.nunca_periodo_calculado_en = p.calculado_en; }
    } catch { console.error("leerPoblacion fallo: se muestra el nunca_periodo del ETL"); }
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "No disponible" }, { status: 500, headers });
  }
}
