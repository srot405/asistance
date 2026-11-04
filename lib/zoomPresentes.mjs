// TOC-153: conciliacion de «ahora en sala» con lo que Zoom ve en vivo. Calculo puro, sin I/O (la lectura vive en
// lib/servidor/zoomEnVivo.ts). Zoom es un REFUERZO de los webhooks: los webhooks pierden reentradas (08-oct: 33 en el panel
// frente a 36 en Zoom), pero si Zoom no responde el panel sigue con los webhooks.
//
// Entrada: participantes de GET /metrics/meetings/{uuid}/participants?type=live. Solo cuenta status "in_meeting": la sala de
// espera (in_waiting_room) todavia no esta en clase. Una persona = un correo (Zoom repite filas por cada reentrada); sin correo,
// el nombre visible si es util; si tampoco, cada fila anonima es una persona. Personal (@tocaunavida.org y robots de notas) se
// separa por correo + nombre visible, igual que compactarEvento, porque el correo institucional lo comparten varias personas.
import { compactarEvento } from "./vivoCalculo.mjs";

export const ESTADO_EN_SALA = "in_meeting";

// -> [{ correo, nombre, join_ms }] sin duplicados. Se queda con la entrada mas temprana de cada persona.
export function presentesDeParticipantes(participantes) {
  const porClave = new Map();
  const anonimos = [];
  for (const p of participantes ?? []) {
    if (p?.status !== ESTADO_EN_SALA) continue;
    const correo = String(p.email ?? "").trim().toLowerCase() || null;
    const nombre = String(p.user_name ?? p.name ?? "").trim() || null;
    const join = Date.parse(String(p.join_time ?? ""));
    const x = { correo, nombre, join_ms: Number.isFinite(join) ? join : null };
    const { clave } = compactarEvento({ id: 0, evento: "joined", hora_ms: 0, correo, nombre });
    if (clave == null) { anonimos.push(x); continue; }
    const previo = porClave.get(clave);
    if (!previo || (x.join_ms != null && (previo.join_ms == null || x.join_ms < previo.join_ms))) porClave.set(clave, x);
  }
  return [...porClave.values(), ...anonimos];
}

// Presentes -> eventos compactos (solo hashes) para la pestana En vivo, que no guarda texto en memoria.
export const compactarPresentes = (presentes) =>
  (presentes ?? []).map((p, i) => compactarEvento({ id: -(i + 1), evento: "joined", hora_ms: p.join_ms ?? 0, correo: p.correo, nombre: p.nombre }));
// La regla de que clase se concilia (presentesDeClase) vive en vivoCalculo.mjs: la usan En vivo y Lista en vivo.
