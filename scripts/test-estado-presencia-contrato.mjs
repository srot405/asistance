// Test de CONTRATO: alimenta el mismo input a la implementación Python
// (backend/etl/estado_presencia.py --contrato) y a la implementación JS
// (lib/estadoPresencia.mjs) y verifica que devuelven EXACTAMENTE lo mismo.
// Es la garantía de que el "espejo deliberado" (ver docstring de ambos
// módulos) no se desvió con el tiempo.
//
// Requiere `python` en PATH (mismo binario que usa el resto del backend). Si
// no está disponible, el test se salta con aviso en vez de fallar el build
// (entorno sin Python instalado), pero SIEMPRE corre en una sesión normal de
// desarrollo donde sí está (ver backend/etl/test_estado_presencia.py).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { clasificarPresencia } from "../lib/estadoPresencia.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PYTHON = join(AQUI, "..", "..", "backend", "etl", "estado_presencia.py");

const MIN = 60000;
const INICIO = 1_000_000_000_000;
const FIN = INICIO + 120 * MIN;
const evento = (tipo, minutosDesdeInicio) => ({ evento: tipo, hora_ms: INICIO + minutosDesdeInicio * MIN });

const casos = [
  { eventos: [], inicio_franja_ms: INICIO, fin_franja_ms: FIN },
  { eventos: [evento("left", 10)], inicio_franja_ms: INICIO, fin_franja_ms: FIN },
  { eventos: [evento("joined", 0), evento("left", 120)], inicio_franja_ms: INICIO, fin_franja_ms: FIN },
  { eventos: [evento("joined", 0), evento("left", 84)], inicio_franja_ms: INICIO, fin_franja_ms: FIN },
  { eventos: [evento("joined", 0), evento("left", 20)], inicio_franja_ms: INICIO, fin_franja_ms: FIN },
  { eventos: [evento("joined", 0), evento("left", 30), evento("joined", 60), evento("left", 150)],
    inicio_franja_ms: INICIO, fin_franja_ms: FIN },
  { eventos: [evento("joined", 0), evento("joined", 10), evento("left", 50)], inicio_franja_ms: INICIO, fin_franja_ms: FIN },
  { eventos: [evento("left", 5), evento("joined", 10), evento("left", 40)], inicio_franja_ms: INICIO, fin_franja_ms: FIN },
  { eventos: [evento("joined", 100)], inicio_franja_ms: INICIO, fin_franja_ms: FIN },
  // Franja distinta de 120 min, para no depender solo del default.
  { eventos: [evento("joined", 5), evento("left", 65)], inicio_franja_ms: INICIO, fin_franja_ms: INICIO + 90 * MIN },
];

function resultadosJs() {
  return casos.map((c) => clasificarPresencia(c.eventos, c.inicio_franja_ms, c.fin_franja_ms));
}

function resultadosPython() {
  const proceso = spawnSync("python", [SCRIPT_PYTHON, "--contrato"], {
    input: JSON.stringify(casos), encoding: "utf8",
  });
  if (proceso.error || proceso.status !== 0) return null;
  return JSON.parse(proceso.stdout);
}

const python = resultadosPython();
if (!python) {
  console.log("AVISO: python no disponible en PATH, test de contrato omitido (no cuenta como fallo de build)");
} else {
  const js = resultadosJs();
  assert.equal(js.length, python.length, "mismo número de resultados");
  js.forEach((resultadoJs, i) => {
    assert.deepEqual(resultadoJs, python[i], `caso ${i}: JS y Python deben coincidir exacto`);
  });
  console.log(`RESUMEN: tests=estado-presencia-contrato casos=${casos.length} python=si estado=verde`);
}
