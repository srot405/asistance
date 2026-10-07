import { NextResponse } from "next/server";
import { MODO_DEMO } from "../../../lib/demo.js";
import { accesoDemo, vistaAcceso } from "../../../lib/rolesCalculo.mjs";
import { exigirAcceso } from "../../../lib/servidor/acceso";

const headers = { "Cache-Control": "private, no-store" };

// TOC-148: lo que el navegador necesita para ocultar botones de CSV nominal (la seguridad real es de cada ruta, no de este aviso).
// Devuelve modo/rol/ciudad/nominal, nunca el correo. Con la RPC de roles caida responde nominal:"error" (la UI no ofrece el nominal).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (MODO_DEMO && params.get("demo") === "1") return NextResponse.json(vistaAcceso(accesoDemo(params)), { headers });
  const access = await exigirAcceso(request);
  if (access instanceof NextResponse) return access;
  return NextResponse.json(vistaAcceso(access.acceso), { headers });
}
