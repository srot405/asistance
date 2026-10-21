// Textos y reglas PURAS de la pestana "En vivo" (TOC-142). Sin I/O. Solo conteos: nunca nombres ni correos.
export const INTERVALO_MS = 45_000; // el cache de servidor dura 30 s (leerVivo): leer mas seguido que eso no trae datos nuevos
export const MAX_ERRORES = 3;
// Tras MAX_ERRORES se pausa, pero se reintenta sola cada PAUSA_MS (antes esperaba a que alguien oprimiera "Reintentar").
export const PAUSA_MS = 120_000;
export const TEXTO_NO_DISPONIBLE = "En vivo no disponible";
export const TEXTO_SIN_CLASE = "No hay clase en este momento";
export const TEXTO_COBERTURA_BAJA = "El conteo puede estar por debajo de la realidad (Zoom perdió entradas en esta sala)";
export const TEXTO_CIFRA_FINAL = "Cifra final del webhook; el cierre oficial lo calcula el sistema";
export const AYUDA_DESCONOCIDOS = "Personas que entraron a Zoom y no pudimos identificar con el roster. Incluye correos mal escritos: se corrigen al cerrar la clase. Si dos personas sin correo se llaman igual, se cuentan como una; los nombres genéricos (iPhone, Invitado, Usuario, Zoom user) se cuentan una vez por cada entrada.";
export const AYUDA_OTRA_FRANJA = "Estudiantes que entraron a esta sala pero pertenecen a otra clase (colados)";
export const AVISO_CIFRA_NO_DISPONIBLE = "Cifra final no disponible aquí; ver pestaña Presencia";
export const TEXTO_SUPERA_ROSTER = "supera el roster esperado";
export const AYUDA_PERSONAL = "Monitores y equipo de la Fundación presentes en la sala; no cuentan en el roster.";
export const ESTADOS = Object.freeze({
  abierta: { icono: "●", texto: "En curso" }, proxima: { icono: "◷", texto: "Próxima" },
  terminada: { icono: "✔", texto: "Terminada" }, sin_sala: { icono: "○", texto: "Sin sala" },
});
export const TEXTO_CERRADA = "Cerrada";

// (TOC-153) Visibilidad por hora de FIN nominal de la clase (no por estado de la sala): abierta = aun no llega el fin; cerrada = ya
// paso el fin pero sigue el mismo dia (se ve atenuada con la marca «Cerrada»); oculta = el dia Bogota de la clase ya termino.
// El dia se compara con America/Bogota explicita (no la zona del servidor ni la del navegador). finMs puede caer justo en 00:00 del
// dia siguiente (clase que termina a las 24:00): el dia de la clase es el del instante anterior al fin.
const FORMATO_DIA_BOGOTA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });
export const diaBogota = (ms) => FORMATO_DIA_BOGOTA.format(new Date(ms));
export function visibilidadPorFin(finMs, ahoraMs) {
  if (!Number.isFinite(finMs) || !Number.isFinite(ahoraMs)) return "abierta";
  if (ahoraMs < finMs) return "abierta";
  return diaBogota(ahoraMs) === diaBogota(finMs - 1) ? "cerrada" : "oculta";
}
// Sobre una clase del contrato (usa c.fin ISO). ahoraMs: hora del servidor ya corregida (ver ahoraServidorMs).
export const visibilidadClase = (c, ahoraMs) => visibilidadPorFin(Date.parse(c.fin), ahoraMs);
export const ahoraServidorMs = (datos, edadSeg) => Date.parse(datos.actualizado_en) + edadSeg * 1000;
export const clasesVisibles = (clases, ahoraMs) => (clases ?? []).filter((c) => visibilidadClase(c, ahoraMs) !== "oculta");
const ORDEN = { abierta: 0, proxima: 1, sin_sala: 2, terminada: 3 };

export function horaCorta(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" }).format(d);
}
export const tituloClase = (c) => `Clase de las ${horaCorta(c.inicio)} · ${c.etiqueta}`;

// En curso primero; luego por hora de inicio; terminadas al final.
export function ordenarClases(clases) {
  return [...(clases ?? [])].sort((a, b) => (ORDEN[a.estado] ?? 9) - (ORDEN[b.estado] ?? 9) || Date.parse(a.inicio) - Date.parse(b.inicio));
}
export const hayEnCurso = (clases) => (clases ?? []).some((c) => c.estado === "abierta");
export function proximaClase(clases) {
  return ordenarClases(clases).filter((c) => c.estado === "proxima")[0] ?? null;
}
// «X de Y» nunca con X>Y: si el maximo supera el roster esperado se dice con texto neutro. valorBarra <= totalBarra siempre.
export function textoRoster(c) {
  const x = Math.max(0, Number(c.roster_maximo) || 0), y = Math.max(0, Number(c.roster_total) || 0);
  const excede = x > y;
  return { excede, texto: excede ? `${x} (${TEXTO_SUPERA_ROSTER})` : `${x} de ${y}`, valorBarra: Math.min(x, y), totalBarra: y };
}
// La cifra final no esta en la memoria del servidor: la tarjeta NO muestra burbujas (nunca un 0/0/0 engañoso).
export const cifraNoDisponible = (c) => c.estado === "terminada" && typeof c.aviso === "string" && c.aviso.includes(AVISO_CIFRA_NO_DISPONIBLE);
export function porcentajeRoster(c) {
  if (!c.roster_total || c.roster_total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((c.roster_maximo / c.roster_total) * 100)));
}
// Segundos desde la ultima lectura, corrigiendo el desfase entre el reloj del servidor y el de la lectura.
export function edadSegundos(datos, leidoEnMs, ahoraMs) {
  const desfase = Math.max(0, Date.parse(datos.hora_servidor) - Date.parse(datos.actualizado_en));
  return Math.max(0, Math.floor((ahoraMs - leidoEnMs + (Number.isFinite(desfase) ? desfase : 0)) / 1000));
}
export function textoEdad(seg) {
  if (seg < 60) return `Actualizado hace ${seg} s`;
  return `Actualizado hace ${Math.floor(seg / 60)} min`;
}
// Texto del anuncio para lectores de pantalla: cambia SOLO si cambia una cifra.
export function resumenAnuncio(datos, ahoraMs = null) {
  if (!datos) return "";
  const cerrada = (c) => ahoraMs != null && visibilidadClase(c, ahoraMs) === "cerrada" ? ` (${TEXTO_CERRADA})` : "";
  return ordenarClases(datos.clases).map((c) => c.estado === "proxima" || c.estado === "sin_sala"
    ? `${tituloClase(c)}${cerrada(c)}: ${ESTADOS[c.estado].texto}.`
    : cifraNoDisponible(c) ? `${tituloClase(c)}${cerrada(c)}: ${AVISO_CIFRA_NO_DISPONIBLE}.`
    : `${tituloClase(c)}${cerrada(c)}: en su horario ${textoRoster(c).texto}; en sala ${c.roster_ahora_aprox}; sin identificar ${c.desconocidos_maximo}; personal ${c.personal_maximo}${c.otra_franja_maximo > 0 ? `; colados (otra clase) ${c.otra_franja_maximo}` : ""}.`).join(" ");
}
export function esVivoValido(x) {
  return Boolean(x) && typeof x === "object" && Array.isArray(x.clases) && typeof x.disponible === "boolean";
}
// Espera tras el error n (1, 2): 5 s, 10 s. Al llegar a MAX_ERRORES se pausa y se ofrece "Reintentar".
export const esperaTrasError = (n) => Math.min(5_000 * 2 ** (n - 1), 60_000);
