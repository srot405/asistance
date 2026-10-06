import assert from "node:assert/strict";
import { calcularCobertura } from "../lib/coberturaClases.mjs";

const ms = (fecha, h, m = 0) => Date.parse(`${fecha}T00:00:00Z`) + (h * 60 + m) * 60000 + 5 * 3600000;
const F = (slot_id, fecha, hi, tipo = "Basico") => ({ slot_id, fecha, tipo, cuenta_zoom: "x", horario_texto: slot_id,
  hora_inicio: hi, hora_fin: hi + 2, roster_n: 50, captura_automatica: true });
const E = (uuid, curso, correo, fecha, h, m = 0) => ({ uuid, curso, correo, nombre: null, hora_ms: ms(fecha, h, m) });

const franjas = [F("mar-18", "2026-09-29", 18), F("sab-08-uno", "2026-10-03", 8), F("sab-08-dos", "2026-10-03", 8),
  F("sab-08-avanzado", "2026-10-03", 8, "Avanzado"), F("sab-10", "2026-10-03", 10), F("sab-14", "2026-10-03", 14)];
const eventos = [
  E("u1", "Backend: APIs", "a@x.com", "2026-09-29", 17, 52), E("u1", "Backend: APIs", "a@x.com", "2026-09-29", 18, 5),
  E("u1", "Backend: APIs", "b@x.com", "2026-09-29", 18, 6), E("u1", "Backend: APIs", "mentor@tocaunavida.org", "2026-09-29", 18, 7),
  E("s1", "Backend - Sala 1", "c@x.com", "2026-10-03", 7, 38), E("s2", "Backend - Sala 2", "d@x.com", "2026-10-03", 7, 56),
  E("s2", "Backend - Sala 2", "e@x.com", "2026-10-03", 7, 57), E("s3", "Backend - Avanzado", "f@x.com", "2026-10-03", 7, 46),
  E("s4", "Backend", "g@x.com", "2026-10-03", 9, 58),
];
const r = calcularCobertura(franjas, eventos, ms("2026-10-03", 8, 48));
const por = Object.fromEntries(r.clases.map((c) => [c.slot_id, c]));
assert.equal(por["mar-18"].personas, 2, "excluye @tocaunavida.org y cuenta personas distintas");
assert.equal(por["mar-18"].estado, "capturada");
assert.equal(por["sab-08-uno"].personas, 1);
assert.equal(por["sab-08-dos"].personas, 2);
assert.equal(por["sab-08-avanzado"].personas, 1, "avanzado no se mezcla con básico");
assert.equal(por["sab-10"].personas, 1, "sesión de las 9:58 va a la franja de las 10, no a la de las 8");
assert.equal(por["sab-08-uno"].estado, "en_curso");
assert.equal(por["sab-14"].estado, "pendiente");
assert.equal(r.resumen.programadas, 6);

const tarde = calcularCobertura([F("jue-10", "2026-10-01", 10)], [], ms("2026-10-01", 13));
assert.equal(tarde.clases[0].estado, "sin_captura", "dictada sin ninguna sesión = falta");
assert.equal(tarde.resumen.faltan, 1);
const aun = calcularCobertura([F("jue-10", "2026-10-01", 10)], [], ms("2026-10-01", 10, 20));
assert.equal(aun.clases[0].estado, "sin_entradas_aun");
console.log("RESUMEN: tests=cobertura estado=verde");
