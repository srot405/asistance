// Replay de solo lectura de la pestana En vivo (TOC-142) sobre el cache local sin PII que deja replay-vivo-extraer.mjs.
// Reproduce cada 5 min la respuesta de armarRespuestaVivo y la compara con el resultado final del backend (asist_sesiones).
// Uso: node scripts/replay-vivo.mjs <semana-lunes> <fecha1,fecha2>
import { readFileSync } from "node:fs";
import { armarRespuestaVivo, esClase, ventanaClase } from "../lib/vivoCalculo.mjs";

const [, , semana, fechasArg] = process.argv;
const d = JSON.parse(readFileSync(new URL(`../../../admin-usable/tools/backups/panel_vivo/cache_${semana}.json`, import.meta.url), "utf8"));
const fechas = fechasArg.split(",");
const roster = new Set(d.roster.map((r) => r.h));
const meta = new Map(d.reuniones.map((r) => [r.uuid, r]));
const porUuid = new Map();
for (const e of d.eventos) {
  if (!esClase(e.curso)) continue;
  if (!porUuid.has(e.uuid)) porUuid.set(e.uuid, []);
  porUuid.get(e.uuid).push({ id: e.id, evento: e.evento, ms: e.hora_ms, clave: e.h ? "c:" + e.h : e.hn ? "n:" + e.hn : null, correoHash: e.h, personal: e.staff });
}
const salasEn = (ahora) => [...porUuid].map(([uuid, eventos]) => {
  const m = meta.get(uuid) ?? {};
  return { uuid, host: m.host ?? null, topic: m.topic ?? null, activo: false, eventos: eventos.filter((e) => e.ms <= ahora) };
}).filter((s) => s.eventos.length);

const franjasDia = d.franjas.filter((f) => fechas.includes(f.fecha));
const filas = [];
for (const f of franjasDia) {
  const v = ventanaClase(f);
  let maxAhora = 0, picoDesc = 0, pasos = 0;
  for (let t = v.desdeMs; t <= v.hastaMs; t += 5 * 60000) {
    const r = armarRespuestaVivo({ semana, franjas: d.franjas, salas: salasEn(t), rosterPorCorreo: roster, ahoraMs: t });
    const c = r.clases.find((x) => x.slot_id === f.slot_id);
    if (!c) continue;
    pasos += 1; maxAhora = Math.max(maxAhora, c.roster_ahora_aprox); picoDesc = Math.max(picoDesc, c.desconocidos_ahora_aprox);
  }
  const final = armarRespuestaVivo({ semana, franjas: d.franjas, salas: salasEn(v.hastaMs + 60000), rosterPorCorreo: roster, ahoraMs: v.hastaMs + 60000 });
  const c = final.clases.find((x) => x.slot_id === f.slot_id);
  const ses = d.sesiones.find((s) => s.slot_id === f.slot_id);
  filas.push({ slot: f.slot_id.replace("backend-", ""), cuenta: f.cuenta_zoom, roster_total: f.roster_n, burbuja_roster_max: c?.roster_maximo ?? null,
    backend_roster: ses?.personas_roster ?? null, backend_visita: ses?.personas_visita ?? null, backend_entradas: ses?.entradas_totales ?? null,
    desconocidos_max: c?.desconocidos_maximo ?? null, personal_max: c?.personal_maximo ?? null, pico_roster_ahora: maxAhora, pico_desc_ahora: picoDesc,
    eventos: c?.eventos ?? null, cobertura_baja: c?.cobertura_baja ?? null, pasos });
}
console.table(filas);
const fallos = filas.filter((x) => x.burbuja_roster_max != null && x.backend_roster != null && x.burbuja_roster_max < x.backend_roster);
console.log(`RESUMEN: franjas=${filas.length} burbuja>=backend_en=${filas.length - fallos.length}/${filas.length} (menores: ${fallos.map((x) => x.slot).join(",") || "ninguna"})`);
