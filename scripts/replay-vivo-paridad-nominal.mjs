// Solo lectura: compara, para las clases de un dia, los conteos de "En vivo" (vivoCalculo, identidad en hashes) con los de
// "Lista en vivo" (armarListaVivo de vivoNominal). Imprime SOLO conteos por clase (sin correos, nombres ni cedulas).
// Uso: node --env-file=.env.local scripts/replay-vivo-paridad-nominal.mjs 2026-10-08 [10]   (hora de inicio opcional)
import { createClient } from "@supabase/supabase-js";
import { armarRespuestaVivo, compactarEvento, conRegistro, esClase, indexarRegistroVivo, indexarRosterVivo, ventanaClase, COT_MS } from "../lib/vivoCalculo.mjs";
import { armarListaVivo } from "../lib/vivoNominal.mjs";

const [, , fecha = "2026-10-08", horaArg] = process.argv;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const lunes = (() => { const d = new Date(`${fecha}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
async function todo(construir) {
  const out = [];
  for (let p = 0; ; p += 1) {
    const { data, error } = await construir().range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...data); if (data.length < 1000) return out;
  }
}
const franjasSemana = await todo(() => sb.from("asist_franjas").select("slot_id,dia,fecha,hora_inicio,hora_fin,tipo,cuenta_zoom,roster_n").eq("semana", lunes).order("slot_id"));
const roster = await todo(() => sb.from("asist_roster").select("persona_id,correo_norm,nombre,ciudad,slot_id").eq("semana", lunes).order("persona_id").order("slot_id"));
const registrantes = await todo(() => sb.from("zoom_registrantes").select("correo_norm,cedula_digitos,nombre,apellido").eq("fecha_sesion", fecha).order("registrant_id"));
const inicioDia = Date.parse(`${fecha}T00:00:00Z`) + COT_MS;
const eventos = await todo(() => sb.from("zoom_live_log").select("id,evento,correo,nombre,hora_ms,uuid,curso").in("evento", ["joined", "left"])
  .gte("hora_ms", inicioDia).lt("hora_ms", inicioDia + 86400000).or("curso.ilike.BACKEND*,curso.ilike.DESARROLLO*WEB*").order("id"));
const uuids = [...new Set(eventos.filter((e) => e.uuid && esClase(e.curso)).map((e) => e.uuid))];
const meta = new Map((uuids.length ? await todo(() => sb.from("zoom_reuniones_activas").select("uuid,host,topic").in("uuid", uuids).order("uuid")) : []).map((m) => [m.uuid, m]));

let hoy = franjasSemana.filter((f) => f.fecha === fecha);
if (horaArg) hoy = hoy.filter((f) => Number(f.hora_inicio) === Number(horaArg));
const porUuid = new Map();
for (const e of eventos) { if (!e.uuid || !esClase(e.curso)) continue; if (!porUuid.has(e.uuid)) porUuid.set(e.uuid, []); porUuid.get(e.uuid).push(e); }
const salaBase = (uuid) => ({ uuid, host: meta.get(uuid)?.host ?? null, topic: meta.get(uuid)?.topic ?? porUuid.get(uuid)[0].curso, activo: false });

const ident = conRegistro(indexarRosterVivo(roster), indexarRegistroVivo(registrantes));
const filas = [];
for (const f of hoy) {
  const ahora = ventanaClase(f).hastaMs + 60_000;
  const vivo = armarRespuestaVivo({ semana: lunes, franjas: hoy, rosterPorCorreo: ident, ahoraMs: ahora,
    salas: [...porUuid].map(([u, evs]) => ({ ...salaBase(u), eventos: evs.map(compactarEvento) })) }).clases.find((c) => c.slot_id === f.slot_id);
  const soloCorreo = armarRespuestaVivo({ semana: lunes, franjas: hoy, rosterPorCorreo: conRegistro(indexarRosterVivo(roster), null), ahoraMs: ahora,
    salas: [...porUuid].map(([u, evs]) => ({ ...salaBase(u), eventos: evs.map(compactarEvento) })) }).clases.find((c) => c.slot_id === f.slot_id);
  const lista = armarListaVivo({ semana: lunes, franjasHoy: hoy, franjasSemana, roster, registrantes, ahoraMs: ahora,
    salas: [...porUuid].map(([u, evs]) => ({ ...salaBase(u), eventos: evs.map((e) => ({ id: Number(e.id), evento: e.evento, ms: Number(e.hora_ms), correo: e.correo, nombre: e.nombre })) })) })
    .clases.find((c) => c.slot_id === f.slot_id);
  const L = lista?.cifras;
  filas.push({ clase: f.slot_id, "vivo roster": vivo?.roster_maximo, "lista roster": L?.roster.total, "vivo otra": vivo?.otra_franja_maximo, "lista otra": L?.otra_franja.total,
    "vivo desc": vivo?.desconocidos_maximo, "lista no_id": L?.no_identificado.total, "vivo personal": vivo?.personal_maximo, "lista personal": L?.personal.total,
    "antes roster": soloCorreo?.roster_maximo, "antes desc": soloCorreo?.desconocidos_maximo });
}
console.table(filas);
const iguales = filas.filter((x) => x["vivo roster"] === x["lista roster"] && x["vivo otra"] === x["lista otra"] && x["vivo desc"] === x["lista no_id"] && x["vivo personal"] === x["lista personal"]);
console.log(`RESUMEN: fecha=${fecha} clases=${filas.length} coinciden=${iguales.length}/${filas.length}`);
