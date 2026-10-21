import assert from "node:assert/strict";
import { renderizar } from "./render-componente.mjs";
import { visibilidadClase, estadoClase } from "../lib/vivoCalculo.mjs";
import { visibilidadPorFin, visibilidadClase as visibilidadContrato, clasesVisibles, ahoraServidorMs, resumenAnuncio, diaBogota } from "../lib/vivoVista.mjs";
import { VIVO_DEMO } from "../lib/vivo-demo.mjs";

// TOC-153: clase cerrada = visible atenuada con marca «Cerrada» hasta el fin de su dia (America/Bogota); al dia siguiente, oculta.
// Datos sinteticos. Franja de hoy: 10:00-12:00 Bogota del sabado 2026-10-03.
const COT = (fecha, hhmm) => Date.parse(`${fecha}T${hhmm}:00-05:00`);
const franja = { slot_id: "backend-sábado-10", dia: "sábado", fecha: "2026-10-03", hora_inicio: 10, hora_fin: 12, tipo: "Basico", cuenta_zoom: "comunicaciones", roster_n: 50 };

// ---------- funcion pura sobre la franja
assert.equal(visibilidadClase(franja, COT("2026-10-03", "11:59")), "abierta", "11:59: aun abierta");
assert.equal(visibilidadClase(franja, COT("2026-10-03", "12:00")), "cerrada", "12:00 exacto: ya cerrada");
assert.equal(visibilidadClase(franja, COT("2026-10-03", "12:01")), "cerrada", "12:01: cerrada, mismo dia");
assert.equal(visibilidadClase(franja, COT("2026-10-03", "23:59")), "cerrada", "23:59: sigue cerrada el mismo dia");
assert.equal(visibilidadClase(franja, COT("2026-10-04", "00:01")), "oculta", "00:01 del dia siguiente: oculta");
assert.equal(visibilidadClase(franja, COT("2026-10-09", "10:00")), "oculta", "una semana despues: oculta");
assert.equal(visibilidadClase(franja, COT("2026-10-03", "07:00")), "abierta", "antes de empezar no esta cerrada");

// ---------- servidor en UTC: a las 20:30 Bogota (01:30 UTC del dia siguiente) el dia Bogota aun no cambio
{
  const ahora = Date.parse("2026-10-04T01:30:00Z"); // = 2026-10-03 20:30 -05:00
  assert.equal(new Date(ahora).getUTCDate(), 4, "en UTC ya es el dia siguiente");
  assert.equal(diaBogota(ahora), "2026-10-03");
  assert.equal(visibilidadClase(franja, ahora), "cerrada", "dia Bogota aun es el de la clase: cerrada, no oculta");
  const justo = Date.parse("2026-10-04T05:00:00Z"); // = 2026-10-04 00:00 Bogota
  assert.equal(visibilidadClase(franja, justo - 1), "cerrada", "23:59:59.999 Bogota");
  assert.equal(visibilidadClase(franja, justo), "oculta", "00:00 Bogota: oculta");
}
// clase que termina a las 24:00: su dia es el de la clase, no el siguiente
{ const noche = { ...franja, hora_inicio: 22, hora_fin: 24 };
  assert.equal(visibilidadClase(noche, COT("2026-10-04", "00:00")), "oculta");
  assert.equal(visibilidadClase(noche, COT("2026-10-03", "23:30")), "abierta"); }
// el estado de sala existente no cambia: sigue "abierta" en el margen de 30 min tras el fin si hay sala activa
assert.equal(estadoClase(franja, COT("2026-10-03", "12:10"), { salaActiva: true }), "abierta");
assert.equal(visibilidadPorFin(NaN, 1), "abierta", "dato invalido no oculta nada");

// ---------- sobre el contrato (c.fin ISO) y la lista de clases
const clase = (slot, fin) => ({ ...VIVO_DEMO.en_curso.clases[0], slot_id: slot, fin });
const cs = [clase("a", "2026-10-03T17:00:00.000Z"), clase("b", "2026-10-02T17:00:00.000Z"), clase("c", "2026-10-03T23:00:00.000Z")];
const ahora = COT("2026-10-03", "13:00"); // 18:00Z
assert.deepEqual(cs.map((c) => visibilidadContrato(c, ahora)), ["cerrada", "oculta", "abierta"]);
assert.deepEqual(clasesVisibles(cs, ahora).map((c) => c.slot_id), ["a", "c"], "la oculta no aparece");

// ---------- render: tarjeta cerrada atenuada con marca; oculta fuera; abierta sin marca
const P = "components/EnVivoPantalla.tsx";
const base = VIVO_DEMO.en_curso;
const c0 = base.clases[0];
const datos = (clases) => ({ ...base, clases });
const html = (d, edadSeg = 0) => renderizar(P, { fase: "ok", datos: d, edadSeg, reintentar() {} }, { html: true });
const texto = (d, edadSeg = 0) => renderizar(P, { fase: "ok", datos: d, edadSeg, reintentar() {} });
const finMs = Date.parse(c0.fin);
{
  const d = { ...datos([c0]), actualizado_en: new Date(finMs - 60000).toISOString() };
  assert.ok(!(await html(d)).includes("vivo-cerrada"), "1 min antes del fin: sin marca");
  const dc = { ...d, actualizado_en: new Date(finMs + 60000).toISOString() };
  const h = await html(dc);
  assert.match(h, /class="vivo-tarjeta [^"]*vivo-cerrada"/, "tarjeta atenuada");
  assert.match(h, /data-visibilidad="cerrada"/);
  assert.match(h, /data-testid="vivo-cerrada"[^>]*>.*Cerrada/, "marca visible");
  assert.ok((await texto(dc)).includes("Cerrada"));
  assert.match(resumenAnuncio(dc, finMs + 60000), /\(Cerrada\)/, "lector de pantalla tambien la anuncia");
  // edadSeg avanza el reloj: mismo dato, 2 minutos despues de la lectura
  assert.ok((await html(d, 120)).includes("vivo-cerrada"), "la edad de la lectura cuenta para cerrar");
  // al dia siguiente (Bogota) desaparece
  const dm = { ...d, actualizado_en: new Date(Date.parse(`${diaBogota(finMs + 24 * 3600000)}T00:01:00-05:00`)).toISOString() };
  const hm = await html(dm);
  assert.ok(!hm.includes("<article "), "oculta: sin tarjeta");
  assert.ok(hm.includes("No hay clase en este momento"), "queda el mensaje de sin clase");
}
console.log("RESUMEN: vivo_cierre=ok abierta/cerrada/oculta=ok utc_vs_bogota=ok render=ok");
