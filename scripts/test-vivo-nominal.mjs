import assert from "node:assert/strict";
import { armarListaVivo, cedulaSinCeros, esPersonal, filasCsv, indexarRoster, personasDeClase, recortarPorPermiso } from "../lib/vivoNominal.mjs";
import { LISTA_VIVO_DEMO } from "../lib/vivoNominal-demo.mjs";
import { mismaCiudad } from "../lib/rolesCalculo.mjs";

// «Lista en vivo» (TOC-153): calculo puro con datos 100 % sinteticos.
const d = LISTA_VIVO_DEMO;
assert.equal(d.disponible, true);
assert.equal(d.clases.length, 2, "solo las dos clases del sabado");
const [c08, c10] = d.clases;
const por = (c, nombre) => c.personas.find((p) => p.nombre === nombre || p.correo === nombre);

// 08:00 — roster por correo, por cedula del registro, otra franja, sin correo, personal
assert.equal(c08.estado, "terminada");
assert.deepEqual(c08.cifras.roster, { total: 6, en_sala: 1 }, "5 por correo + 1 por cedula (la 3 no tiene salida registrada)");
assert.equal(por(c08, "Persona Demo 03").como, "cédula del registro de Zoom");
assert.equal(por(c08, "Persona Demo 03").correo, "otrocorreo3@ejemplo.test");
const p17 = por(c08, "Persona Demo 17");
assert.equal(p17.senal, "otra_franja");
assert.match(p17.su_clase, /Miércoles 18:00-20:00/);
assert.equal(por(c08, "Invitado Fulano").senal, "no_identificado");
assert.equal(por(c08, "monitor@tocaunavida.org").senal, "personal");

// 10:00 — en curso; persona 7 del sabado 8 entra a las 10 -> otra franja; bot -> personal
assert.equal(c10.estado, "abierta");
assert.equal(por(c10, "Persona Demo 07").senal, "otra_franja");
assert.match(por(c10, "Persona Demo 07").su_clase, /Sábado 08:00-10:00/);
assert.deepEqual(c10.cifras.roster, { total: 5, en_sala: 4 }, "persona 13 salio");
const nuevo = por(c10, "nuevo@ejemplo.test");
assert.equal(nuevo.senal, "no_identificado");
assert.equal(nuevo.cedula, "1099999999", "la cedula del registro se muestra aunque no este en el roster");
assert.equal(por(c10, "desconocido@ejemplo.test").como, "correo sin registro ni roster");
assert.equal(c10.cifras.personal.total, 1, "bot de notas = personal");

// cedula con cero adelante (Ecuador): mismo persona_id con o sin ceros
assert.equal(cedulaSinCeros("0912345678"), "912345678");
const SAB = "2026-10-10", COT = (h) => Date.parse(`${SAB}T${h}:00-05:00`);
const fr = [{ slot_id: "s8", dia: "sábado", fecha: SAB, hora_inicio: 8, hora_fin: 10, tipo: "Basico", cuenta_zoom: "comunicaciones", roster_n: 1 }];
const r = armarListaVivo({ semana: "2026-10-05", franjasHoy: fr, salas: [{ uuid: "u", host: "comunicaciones", topic: "Backend", activo: true,
  eventos: [{ id: 1, evento: "joined", ms: COT("08:05"), correo: "x@ejemplo.test", nombre: "X" }] }],
  roster: [{ persona_id: "0912345678", correo_norm: "otro@ejemplo.test", nombre: "Ecuatoriana Demo", ciudad: "Quito", slot_id: "s8" }],
  registrantes: [{ correo_norm: "x@ejemplo.test", cedula_digitos: "912345678", nombre: "X", apellido: "" }], ahoraMs: COT("08:30") });
assert.equal(r.clases[0].personas[0].senal, "roster");
assert.equal(r.clases[0].personas[0].nombre, "Ecuatoriana Demo");

// anonimos: dos "iPhone" distintos no colapsan; una salida descuenta al mas antiguo
const r2 = armarListaVivo({ semana: "2026-10-05", franjasHoy: fr, salas: [{ uuid: "u", host: "comunicaciones", topic: "Backend", activo: true,
  eventos: [{ id: 1, evento: "joined", ms: COT("08:01"), correo: null, nombre: "iPhone" }, { id: 2, evento: "joined", ms: COT("08:02"), correo: null, nombre: "iPhone" },
    { id: 3, evento: "left", ms: COT("08:20"), correo: null, nombre: "iPhone" }] }], roster: [], registrantes: [], ahoraMs: COT("08:30") });
assert.deepEqual(r2.clases[0].cifras.no_identificado, { total: 2, en_sala: 1 });

// permiso: monitor de Cali solo ve personas de roster/otra_franja de Cali; las cifras no se recortan
const cali = recortarPorPermiso(d, { ciudad: "Cali" }, mismaCiudad);
for (const c of cali.clases) for (const p of c.personas) { assert.ok(["roster", "otra_franja", "ausente"].includes(p.senal)); assert.ok(mismaCiudad(p.ciudad, "Cali")); }
assert.deepEqual(cali.clases[0].cifras, d.clases[0].cifras);
assert.equal(recortarPorPermiso(d, { ciudad: null }, mismaCiudad), d);

assert.ok(esPersonal("", "Otter.ai")); assert.ok(!esPersonal("persona1@ejemplo.test", "Persona"));
// robots reales vistos en zoom_live_log, y nombres reales que NO deben caer
for (const [c, n] of [["", "Read.ai Meeting Notes"], ["fred@fireflies.ai", "Fireflies.ai Notetaker Val"], ["", "Elvira's meeting notes - tldv"]]) assert.ok(esPersonal(c, n), n);
for (const n of ["Yaira Botero", "Ana Potter", "Luis Otterbein", "Abbot Ruiz"]) assert.ok(!esPersonal("x@ejemplo.test", n), n);
{ // personal con correo institucional compartido: una persona por nombre visible
  const idx = indexarRoster([]);
  const r = (id, evento, nombre, min) => ({ id, evento, nombre, correo: "jovenescreativos@tocaunavida.org", ms: Date.parse("2026-10-03T13:00:00Z") + min * 60000 });
  const ps = personasDeClase([r(1, "joined", "jovenes creativos", 0), r(2, "joined", "Ana Demo - Monitora", 1), r(3, "joined", "Ana Demo - Monitora", 2)],
    "slot", idx, new Map(), (s) => s, Date.parse("2026-10-03T14:00:00Z"));
  assert.equal(ps.length, 2, "2 personas de personal con el mismo correo y distinto nombre");
  assert.ok(ps.every((p) => p.senal === "personal" && p.en_sala));
}
const csv = filasCsv(d);
assert.equal(csv[0][1], "senal");
assert.equal(csv.length, 1 + d.clases.reduce((n, c) => n + c.personas.length, 0));

// ausentes (amarillo): del roster de la franja que nunca entraron; filas al final, fuera de cifras
{
  const aus = (c) => c.personas.filter((p) => p.senal === "ausente");
  assert.deepEqual(aus(c08).map((p) => p.nombre), ["Persona Demo 07", "Persona Demo 08"], "la 7 entro a otra clase: en la suya es ausente");
  assert.deepEqual(aus(c10).map((p) => p.nombre), ["Persona Demo 14", "Persona Demo 15", "Persona Demo 16"]);
  assert.equal(c08.ausentes, 2); assert.equal(c10.ausentes, 3);
  for (const p of [...aus(c08), ...aus(c10)]) assert.deepEqual([p.entradas, p.en_sala, p.primera_entrada, p.ultima_salida, p.su_clase], [0, false, null, null, null]);
  assert.ok(!("ausente" in c08.cifras), "cifras solo de asistencia");
  const suma = (c) => Object.values(c.cifras).reduce((n, x) => n + x.total, 0);
  assert.equal(suma(c08) + c08.ausentes, c08.personas.length, "cifras + ausentes = filas");
  assert.equal(c10.personas.at(-1).senal, "ausente", "ausentes al final");
  assert.ok(cali.clases.some((c) => c.personas.some((p) => p.senal === "ausente")), "el monitor ve los ausentes de su ciudad");
  // clase que aun no empieza: sin ausentes; en curso sin nadie: todo el roster ausente; roster que entro no es ausente
  const fr2 = [{ slot_id: "s8", dia: "sábado", fecha: SAB, hora_inicio: 8, hora_fin: 10, tipo: "Basico", cuenta_zoom: "comunicaciones", roster_n: 2 }];
  const ros = [1, 2].map((i) => ({ persona_id: String(2000000000 + i), correo_norm: `r${i}@ejemplo.test`, nombre: `Ausente Demo ${i}`, ciudad: "Cali", slot_id: "s8" }));
  const sala = (eventos, activo = true) => [{ uuid: "u", host: "comunicaciones", topic: "Backend", activo, eventos }];
  const proxima = armarListaVivo({ semana: "2026-10-05", franjasHoy: fr2, salas: [], roster: ros, registrantes: [], ahoraMs: COT("07:50") }).clases[0];
  assert.deepEqual([proxima.estado, proxima.ausentes, proxima.personas.length], ["proxima", 0, 0]);
  const vacia = armarListaVivo({ semana: "2026-10-05", franjasHoy: fr2, salas: sala([]), roster: ros, registrantes: [], ahoraMs: COT("08:30") }).clases[0];
  assert.deepEqual([vacia.estado, vacia.ausentes, vacia.cifras.roster.total], ["abierta", 2, 0]);
  const una = armarListaVivo({ semana: "2026-10-05", franjasHoy: fr2, salas: sala([{ id: 1, evento: "joined", ms: COT("08:05"), correo: "r1@ejemplo.test", nombre: "R1" }]),
    roster: ros, registrantes: [], ahoraMs: COT("08:30") }).clases[0];
  assert.deepEqual(una.personas.map((p) => [p.nombre, p.senal]), [["Ausente Demo 1", "roster"], ["Ausente Demo 2", "ausente"]]);
  assert.deepEqual([una.cifras.roster, una.ausentes], [{ total: 1, en_sala: 1 }, 1]);
  // CSV: los ausentes salen con su etiqueta y sin entradas
  const fila = filasCsv({ clases: [una] }).find((f) => f[1] === "No ha entrado");
  assert.deepEqual([fila[2], fila[9], fila[10]], ["Ausente Demo 2", 0, "NO"]);
}

// en sala vs salio: ultima_salida y en_sala distinguen a quien sigue de quien ya se fue (y a quien volvio)
{
  const p2 = por(c08, "Persona Demo 02");
  assert.deepEqual([p2.en_sala, p2.ultima_salida], [false, new Date(COT("09:50")).toISOString()], "salio 09:50");
  assert.deepEqual([por(c08, "Persona Demo 03").en_sala, por(c08, "Persona Demo 03").ultima_salida], [true, null], "sigue en sala, sin salida");
  const idx = indexarRoster([{ persona_id: "3000000001", correo_norm: "v@ejemplo.test", nombre: "Vuelve Demo", ciudad: "Cali", slot_id: "s8" }]);
  const e = (id, evento, hhmm) => ({ id, evento, ms: COT(hhmm), correo: "v@ejemplo.test", nombre: "V" });
  const [v] = personasDeClase([e(1, "joined", "08:01"), e(2, "left", "08:20"), e(3, "joined", "08:25")], "s8", idx, new Map(), (s) => s, COT("08:30"));
  assert.deepEqual([v.en_sala, v.entradas, v.ultima_salida], [true, 2, new Date(COT("08:20")).toISOString()], "salio y volvio: en sala");
}
console.log("test-vivo-nominal: OK");
