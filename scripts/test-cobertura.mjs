// lib/coberturaClases.mjs (fase 1.6): el estado de cada clase sale de asist_sesiones.estado_captura, sin heuristica sobre el log crudo.
import assert from "node:assert/strict";
import { calcularCobertura, estadoCobertura } from "../lib/coberturaClases.mjs";

const F = (slot_id, fecha, hi, tipo = "Basico") => ({ slot_id, fecha, tipo, cuenta_zoom: "x", horario_texto: slot_id,
  hora_inicio: hi, hora_fin: hi + 2, roster_n: 50, captura_automatica: true });
const S = (slot_id, estado_captura, personas_roster = 0, personas_visita = 0) => ({ slot_id, fecha: "2026-10-03", estado_captura, personas_roster, personas_visita });

const franjas = [F("mar-18", "2026-09-29", 18), F("mie-18", "2026-09-30", 18), F("sab-08-uno", "2026-10-03", 8), F("sab-08-dos", "2026-10-03", 8),
  F("sab-10", "2026-10-03", 10), F("sab-14", "2026-10-03", 14), F("sab-16", "2026-10-03", 16), F("sab-18", "2026-10-03", 18)];
const sesiones = [S("mar-18", "capturada", 30, 1), S("mie-18", "recuperada_api", 44, 2), S("sab-08-uno", "zoom_limit_pendiente", 9, 0),
  S("sab-08-dos", "en_curso", 12, 3), S("sab-10", "por_ocurrir"), S("sab-14", "sin_captura"), S("sab-16", "estado_futuro_raro"),
  S("otra-franja", "capturada", 5, 0)];
const r = calcularCobertura(franjas, sesiones);
const por = Object.fromEntries(r.clases.map((c) => [c.slot_id, c]));
assert.equal(por["mar-18"].estado, "capturada");
assert.equal(por["mar-18"].personas_roster, 30, "personas del ETL, no del webhook");
assert.equal(por["mar-18"].personas_visita, 1);
assert.equal(por["mie-18"].estado, "capturada", "recuperada_api cuenta como capturada (misma traduccion que confianzaClase)");
assert.equal(por["sab-08-uno"].estado, "zoom_limit");
assert.equal(por["sab-08-uno"].personas_roster, null, "sin captura confiable no muestra cifra");
assert.equal(por["sab-08-dos"].estado, "en_curso");
assert.equal(por["sab-10"].estado, "pendiente");
assert.equal(por["sab-14"].estado, "sin_captura");
assert.equal(por["sab-16"].estado, "dudosa", "estado desconocido nunca es capturada");
assert.equal(por["sab-18"].estado, "sin_sesion", "franja sin sesion del ETL");
assert.deepEqual(r.resumen, { programadas: 8, dictadas: 6, capturadas: 2, en_curso: 1, faltan: 3, pendientes: 1, sin_sesion: 1 });
assert.equal(r.sesiones_sin_clase, 1);
assert.equal(estadoCobertura([{ estado_captura: "capturada" }, { estado_captura: "sin_captura" }]), "sin_captura", "manda la peor");
assert.deepEqual(r.clases.map((c) => c.slot_id).slice(0, 2), ["mar-18", "mie-18"], "orden por fecha y hora");
console.log("RESUMEN: tests=cobertura fuente=asist_sesiones estado=verde");
