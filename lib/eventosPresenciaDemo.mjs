// Eventos joined/left SINTÉTICOS para la pestaña "Presencia" en MODO_DEMO
// (TOC-91, pedido de Samuel 2026-09-29). Determinista a partir de persona_id
// (mismo resultado siempre, sin Math.random): reparte el tiempo conectado
// entre 10% y 100% de la franja, a propósito a ambos lados del umbral 0.70
// (backend/etl/estado_presencia.py) para que la pestaña muestre las 3
// categorías con datos, no solo una.
//
// Solo se llama para personas que SÍ ingresaron (ver
// lib/servidor/leerPresenciaClase.ts) — a quien nunca entró no se le inventan
// eventos, se clasifica directo como "nunca_entro" con la misma información
// que ya usa el resto del panel (asist_entradas / asist_celda_semana).

// Hash simple (polinómico, base 31) + un finalizador de mezcla de bits
// (variante de Murmur3 fmix32). El hash polinómico solo no alcanza: para IDs
// casi idénticos que solo difieren en un sufijo numérico ("...-14-1",
// "...-14-2", …, como persona_id en este archivo), sus valores mod 1000 salen
// muy correlacionados entre sí (probado: 50 IDs consecutivos caían todos en
// la banda 0.01–0.14) y una franja entera terminaba sin ningún "presente".
// El finalizador dispersa esos bits antes de tomar el módulo.
function hash01(texto) {
  let h = 0;
  for (let i = 0; i < texto.length; i += 1) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000; // [0, 1)
}

export function eventosDemoParaPersona(personaId, inicioMs, finMs) {
  const duracionMs = finMs - inicioMs;
  const ratio = 0.10 + hash01(personaId) * 0.90; // [0.10, 1.00)
  const finConexionMs = Math.min(inicioMs + Math.round(duracionMs * ratio), finMs);
  return [
    { evento: "joined", hora_ms: inicioMs },
    { evento: "left", hora_ms: finConexionMs },
  ];
}
