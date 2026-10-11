import assert from "node:assert/strict";
import { armarListaVivo, cedulaSinCeros, esPersonal, filasCsv, recortarPorPermiso } from "../lib/vivoNominal.mjs";
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
for (const c of cali.clases) for (const p of c.personas) { assert.ok(["roster", "otra_franja"].includes(p.senal)); assert.ok(mismaCiudad(p.ciudad, "Cali")); }
assert.deepEqual(cali.clases[0].cifras, d.clases[0].cifras);
assert.equal(recortarPorPermiso(d, { ciudad: null }, mismaCiudad), d);

assert.ok(esPersonal("", "Otter.ai")); assert.ok(!esPersonal("persona1@ejemplo.test", "Persona"));
const csv = filasCsv(d);
assert.equal(csv[0][1], "senal");
assert.equal(csv.length, 1 + d.clases.reduce((n, c) => n + c.personas.length, 0));
console.log("test-vivo-nominal: OK");
