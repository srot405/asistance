import { NextResponse } from "next/server";
import { exigirAcceso } from "../../../lib/servidor/acceso";
import { leerVivo } from "../../../lib/servidor/leerVivo";
import { leerVivoJcon } from "../../../lib/servidor/leerVivoJcon";
import { combinarRespuestas } from "../../../lib/vivoJcon.mjs";

const headers = { "Cache-Control": "private, no-store" };

// TOC-142. SOLO conteos por clase (nunca nombres, correos ni persona_id) y SIN parametros: no hay forma de pedir mas detalle.
// exigirAcceso va antes de toda lectura. Un fallo -> 503 sin detalles internos y sin cachear. El cache de servidor (30 s) se
// comparte entre visitantes y vive en lib/servidor/leerVivo.ts.
// JC-ON se lee APARTE (lib/servidor/leerVivoJcon.ts, estado propio) y se agrega al final de `clases` con programa "jcon".
// Si JC-ON falla, JC sale intacto con aviso; si JC falla y JC-ON tiene clase hoy, sale JC-ON con aviso (lib/vivoJcon.mjs combinarRespuestas).
export async function GET(request: Request) {
  const access = await exigirAcceso(request);
  if (access instanceof NextResponse) return access;
  const [jc, jcon] = await Promise.allSettled([leerVivo(), leerVivoJcon()]);
  const datos = combinarRespuestas(jc.status === "fulfilled" ? jc.value : null, jcon.status === "fulfilled" ? jcon.value : null,
    { falloJc: jc.status === "rejected", falloJcon: jcon.status === "rejected" });
  if (!datos) return NextResponse.json({ error: "No disponible" }, { status: 503, headers });
  return NextResponse.json(datos, { headers });
}
