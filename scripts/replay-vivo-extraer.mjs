// Extraccion UNICA de solo lectura para el replay de la pestana En vivo (TOC-142). Guarda un cache local
// (admin-usable\tools\backups\panel_vivo\, gitignoreado) SIN nombres ni correos: solo hash del correo.
// Uso: node scripts/replay-vivo-extraer.mjs <semana-lunes> <fecha1,fecha2,...>   (no repetir: gasta egress)
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [, , semana, fechasArg] = process.argv;
const fechas = (fechasArg ?? "").split(",").filter(Boolean);
const SALIDA = new URL("../../../admin-usable/tools/backups/panel_vivo/", import.meta.url);
mkdirSync(SALIDA, { recursive: true });
const destino = new URL(`cache_${semana}.json`, SALIDA);
if (existsSync(destino) && !process.env.FORZAR) { console.log("Cache ya existe; no se vuelve a leer."); process.exit(0); }
const env = {};
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const norm = (s) => String(s ?? "").trim().toLowerCase();
async function pagina(tabla, cols, filtrar, orden) {
  const out = [];
  for (let d = 0; ; d += 1000) {
    let q = filtrar(sb.from(tabla).select(cols));
    for (const o of orden) q = q.order(o, { ascending: true });
    const { data, error } = await q.range(d, d + 999);
    if (error) throw new Error(`${tabla}: ${error.code}`);
    out.push(...data); if (data.length < 1000) return out;
  }
}
const cot = (f, h) => Date.parse(`${f}T00:00:00Z`) + (h + 5) * 3600000;
const franjas = await pagina("asist_franjas", "slot_id,dia,fecha,hora_inicio,hora_fin,tipo,cuenta_zoom,roster_n", (q) => q.eq("semana", semana), ["slot_id"]);
const roster = (await pagina("asist_roster", "correo_norm,persona_id,slot_id", (q) => q.eq("semana", semana), ["persona_id"]))
  .map((r) => ({ h: hash(norm(r.correo_norm)), slot_id: r.slot_id }));
const sesiones = await pagina("asist_sesiones", "sesion_id,slot_id,fecha,personas_roster,personas_visita,entradas_totales,estado_captura", (q) => q.eq("semana", semana), ["sesion_id"]);
const desde = Math.min(...fechas.map((f) => cot(f, 0))), hasta = Math.max(...fechas.map((f) => cot(f, 24)));
const eventos = await pagina("zoom_live_log", "id,evento,correo,nombre,hora_ms,uuid,meeting_id,curso,origen",
  (q) => q.eq("origen", "webhook").in("evento", ["joined", "left"]).gte("hora_ms", desde).lt("hora_ms", hasta), ["id"]);
const uuids = [...new Set(eventos.map((e) => e.uuid))];
const reuniones = uuids.length ? await pagina("zoom_reuniones_activas", "uuid,host,topic,meeting_id,activo", (q) => q.in("uuid", uuids), ["uuid"]) : [];
// sin PII: correo -> hash (y marca de dominio staff); nombre -> hash solo para contar distintos sin correo
const limpio = eventos.map((e) => { const c = norm(e.correo); return { id: e.id, evento: e.evento, h: c ? hash(c) : null, staff: c.endsWith("@tocaunavida.org"),
  hn: e.nombre ? hash(norm(e.nombre)) : null, hora_ms: e.hora_ms, uuid: e.uuid, meeting_id: e.meeting_id, curso: e.curso }; });
writeFileSync(destino, JSON.stringify({ semana, fechas, franjas, roster, sesiones, eventos: limpio, reuniones }));
console.log(`franjas=${franjas.length} roster=${roster.length} sesiones=${sesiones.length} eventos=${limpio.length} reuniones=${reuniones.length}`);
