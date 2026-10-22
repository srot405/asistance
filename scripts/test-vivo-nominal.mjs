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
assert.deepEqual(c08.cifras.roster, { total: 7, en_sala: 2 }, "5 por correo + 1 por cedula + 1 por registrant_id (la 3 y la 8 no tienen salida registrada)");
assert.equal(por(c08, "Persona Demo 08").como, "registro de Zoom (ID)");
assert.equal(por(c08, "Persona Demo 08").correo, "celular8@ejemplo.test");
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
for (const c of cali.clases) for (const p of c.personas) { assert.ok(["roster", "otra_franja"].includes(p.senal)); assert.ok(mismaCiudad(p.ciudad, "Cali")); }
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
{ // TOC-153 paso 2: registrant_id del webhook -> registro de Zoom -> cedula -> roster
  const rost = [{ persona_id: "1000001", correo_norm: "uno@ejemplo.test", nombre: "Uno Demo", ciudad: "Cali", slot_id: "s8" },
    { persona_id: "0912345678", correo_norm: "ecu@ejemplo.test", nombre: "Ecuatoriana Demo", ciudad: "Quito", slot_id: "s8" }];
  const porId = [
    { registrant_id: "RID-1", correo_norm: "registro1@ejemplo.test", cedula_digitos: "1000001", nombre: "Uno", apellido: "Registro" },
    { registrant_id: "RID-ECU", correo_norm: "x@ejemplo.test", cedula_digitos: "912345678", nombre: "Ecu", apellido: "Registro" },
    { registrant_id: "RID-SIN", correo_norm: "sin@ejemplo.test", cedula_digitos: null, nombre: "Sin", apellido: "Cedula" },
    { registrant_id: "RID-FUERA", correo_norm: "fuera@ejemplo.test", cedula_digitos: "5550001", nombre: "Fuera", apellido: "Roster" },
  ];
  const evs = [
    { id: 1, evento: "joined", ms: COT("08:01"), correo: "distinto@ejemplo.test", nombre: "Alias", registrant_id: "RID-1" },   // correo distinto
    { id: 2, evento: "joined", ms: COT("08:02"), correo: "otro.ecu@ejemplo.test", nombre: "E", registrant_id: "RID-ECU" },     // cedula con ceros
    { id: 3, evento: "joined", ms: COT("08:03"), correo: "sin.cedula@ejemplo.test", nombre: "S", registrant_id: "RID-SIN" },   // registro sin cedula
    { id: 4, evento: "joined", ms: COT("08:04"), correo: "fuera.x@ejemplo.test", nombre: "F", registrant_id: "RID-FUERA" },    // cedula fuera del roster
    { id: 5, evento: "left", ms: COT("08:20"), correo: "distinto@ejemplo.test", nombre: "Alias", registrant_id: null },       // 'salio' sin id
  ];
  const lista = (registrantesPorId) => armarListaVivo({ semana: "2026-10-05", franjasHoy: fr, salas: [{ uuid: "u", host: "comunicaciones", topic: "Backend",
    activo: true, eventos: evs }], roster: rost, registrantes: [], registrantesPorId, ahoraMs: COT("08:30") }).clases[0];
  const c = lista(porId);
  const de = (correo) => c.personas.find((p) => p.correo === correo);
  assert.equal(de("distinto@ejemplo.test").senal, "roster"); assert.equal(de("distinto@ejemplo.test").nombre, "Uno Demo");
  assert.equal(de("distinto@ejemplo.test").como, "registro de Zoom (ID)"); assert.equal(de("distinto@ejemplo.test").cedula, "1000001");
  assert.equal(de("distinto@ejemplo.test").en_sala, false, "el 'salio' sin registrant_id descuenta a la misma persona");
  assert.equal(de("otro.ecu@ejemplo.test").senal, "roster", "cedula del registro sin ceros = persona_id con ceros");
  assert.equal(de("sin.cedula@ejemplo.test").senal, "no_identificado"); assert.equal(de("sin.cedula@ejemplo.test").cedula, null);
  assert.equal(de("fuera.x@ejemplo.test").senal, "no_identificado"); assert.equal(de("fuera.x@ejemplo.test").cedula, "5550001", "cedula del registro por ID");
  assert.equal(de("fuera.x@ejemplo.test").como, "registro de Zoom (cédula fuera del roster)");
  assert.equal(c.personas.length, 4); assert.deepEqual(c.cifras.roster, { total: 2, en_sala: 1 });
  // registrant_id null / sin registros por ID: comportamiento anterior intacto
  const sinId = lista([]);
  assert.equal(sinId.cifras.roster.total, 0); assert.equal(sinId.personas.find((p) => p.correo === "distinto@ejemplo.test").como, "correo sin registro ni roster");
  // el correo del roster sigue mandando sobre el registrant_id
  const r3 = armarListaVivo({ semana: "2026-10-05", franjasHoy: fr, salas: [{ uuid: "u", host: "comunicaciones", topic: "Backend", activo: true,
    eventos: [{ id: 1, evento: "joined", ms: COT("08:01"), correo: "uno@ejemplo.test", nombre: "U", registrant_id: "RID-ECU" }] }], roster: rost, registrantes: [],
    registrantesPorId: porId, ahoraMs: COT("08:30") });
  assert.equal(r3.clases[0].personas[0].nombre, "Uno Demo"); assert.equal(r3.clases[0].personas[0].como, "correo del roster");
  // sin correo pero con registrant_id que resuelve: identificada (nunca por nombre)
  const r4 = armarListaVivo({ semana: "2026-10-05", franjasHoy: fr, salas: [{ uuid: "u", host: "comunicaciones", topic: "Backend", activo: true,
    eventos: [{ id: 1, evento: "joined", ms: COT("08:01"), correo: null, nombre: "iPhone", registrant_id: "RID-1" }] }], roster: rost, registrantes: [],
    registrantesPorId: porId, ahoraMs: COT("08:30") });
  assert.equal(r4.clases[0].personas[0].senal, "roster"); assert.equal(r4.clases[0].personas[0].como, "registro de Zoom (ID)");
}
const csv = filasCsv(d);
assert.equal(csv[0][1], "senal");
assert.equal(csv.length, 1 + d.clases.reduce((n, c) => n + c.personas.length, 0));
console.log("test-vivo-nominal: OK");
