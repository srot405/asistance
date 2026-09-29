// Espejo de backend/etl/test_estado_presencia.py — mismos 15 casos, misma
// aritmética, corridos contra lib/estadoPresencia.mjs (JS). El test de
// contrato que compara ambas implementaciones con el mismo input vive en
// scripts/test-estado-presencia-contrato.mjs.
import assert from "node:assert/strict";
import {
  ESTADO_ENTRO_Y_SALIO, ESTADO_NUNCA_ENTRO, ESTADO_PRESENTE, UMBRAL_PRESENTE,
  clasificarGrupo, clasificarPresencia, duracionFranjaMs, minutosEnSala,
} from "../lib/estadoPresencia.mjs";

const MIN = 60000;
const INICIO = 1_000_000_000_000; // ancla arbitraria en ms, igual que el test Python.
const FIN = INICIO + 120 * MIN; // franja de 120 min

const evento = (tipo, minutosDesdeInicio) => ({ evento: tipo, hora_ms: INICIO + minutosDesdeInicio * MIN });

assert.equal(UMBRAL_PRESENTE, 0.70, "umbral 0.70");

// 1) Nunca entró: sin ningún evento "joined" (aunque haya un "left" huérfano).
let r = clasificarPresencia([], INICIO, FIN);
assert.equal(r.estado, ESTADO_NUNCA_ENTRO); assert.equal(r.minutos, 0);
r = clasificarPresencia([evento("left", 10)], INICIO, FIN);
assert.equal(r.estado, ESTADO_NUNCA_ENTRO, "nunca_entro con left huérfano"); assert.equal(r.minutos, 0);

// 2) Entra y se queda toda la clase (100% >= 70%): presente.
r = clasificarPresencia([evento("joined", 0), evento("left", 120)], INICIO, FIN);
assert.equal(r.estado, ESTADO_PRESENTE); assert.equal(r.minutos, 120); assert.equal(r.porcentaje, 100);

// 2b) Justo en el umbral (84/120 = 70.0%): debe caer en presente (>=, no >).
r = clasificarPresencia([evento("joined", 0), evento("left", 84)], INICIO, FIN);
assert.equal(r.estado, ESTADO_PRESENTE, "borde exacto del umbral"); assert.equal(r.porcentaje, 70);

// 3) Entra y sale rápido (< 70%): entró y salió.
r = clasificarPresencia([evento("joined", 0), evento("left", 20)], INICIO, FIN);
assert.equal(r.estado, ESTADO_ENTRO_Y_SALIO); assert.equal(r.minutos, 20);
r = clasificarPresencia([evento("joined", 0), evento("left", 83)], INICIO, FIN);
assert.equal(r.estado, ESTADO_ENTRO_Y_SALIO, "justo debajo del umbral"); assert.ok(r.porcentaje < 70);

// 4) Entra, sale, vuelve a entrar: dos intervalos, suma correcta.
r = clasificarPresencia([evento("joined", 0), evento("left", 30), evento("joined", 60), evento("left", 150)], INICIO, FIN);
assert.equal(r.minutos, 90, "30+60=90, recortado a la franja"); assert.equal(r.estado, ESTADO_PRESENTE);

// 4b) Reconexión que se solapa: se fusiona, no se suma doble.
r = clasificarPresencia([evento("joined", 0), evento("joined", 10), evento("left", 50)], INICIO, FIN);
assert.equal(r.minutos, 50, "joined duplicado no reinicia el intervalo");

// 5) Sale sin entrada previa: se ignora, nunca produce minutos negativos.
r = clasificarPresencia([evento("left", 5), evento("joined", 10), evento("left", 40)], INICIO, FIN);
assert.equal(r.minutos, 30, "left huérfano antes del primer joined se ignora"); assert.ok(r.minutos >= 0);

// 6) Entra sin salida: se cierra al fin de la franja.
r = clasificarPresencia([evento("joined", 100)], INICIO, FIN);
assert.equal(r.minutos, 20, "100->120 = 20 min"); assert.equal(r.estado, ESTADO_ENTRO_Y_SALIO);

// 7) minutosEnSala nunca negativo con eventos fuera de la franja.
const eventosFuera = [{ evento: "joined", hora_ms: INICIO - 500000 }, { evento: "left", hora_ms: INICIO - 100000 }];
assert.equal(minutosEnSala(eventosFuera, INICIO, FIN), 0, "intervalo antes de inicio_franja_ms");

// 8) evento no reconocido lanza RangeError.
assert.throws(() => clasificarPresencia([{ evento: "ping", hora_ms: INICIO }], INICIO, FIN), RangeError);

// 9) duracionFranjaMs: usa horaFin si existe, si no aplica el default de 120 min.
assert.equal(duracionFranjaMs(INICIO, FIN), FIN, "respeta horaFin explícita");
assert.equal(duracionFranjaMs(INICIO, null), INICIO + 120 * MIN, "default 120 min si falta horaFin");

// 10) clasificarGrupo: conteos + detalle por persona.
const grupo = clasificarGrupo({
  p1: [evento("joined", 0), evento("left", 119)], // presente (~99%)
  p2: [evento("joined", 0), evento("left", 10)],  // entro_y_salio
  p3: [],                                          // nunca_entro
}, INICIO, FIN);
assert.deepEqual(grupo.conteos, { [ESTADO_PRESENTE]: 1, [ESTADO_ENTRO_Y_SALIO]: 1, [ESTADO_NUNCA_ENTRO]: 1 });
assert.equal(grupo.detalle.p1.estado, ESTADO_PRESENTE);
assert.equal(grupo.detalle.p3.minutos, 0);

// 11) clasificarGrupo acepta un Map (además de objeto plano).
const grupoMap = clasificarGrupo(new Map([["p1", [evento("joined", 0), evento("left", 119)]]]), INICIO, FIN);
assert.equal(grupoMap.conteos[ESTADO_PRESENTE], 1, "clasificarGrupo con Map");

console.log("RESUMEN: tests=estado-presencia casos=16 estado=verde");
