// Textos y reglas PURAS de la pestana "En vivo" (TOC-142). Sin I/O. Solo conteos: nunca nombres ni correos.
export const INTERVALO_MS = 30_000;
export const MAX_ERRORES = 3;
export const TEXTO_NO_DISPONIBLE = "En vivo no disponible";
export const TEXTO_SIN_CLASE = "No hay clase en este momento";
export const TEXTO_COBERTURA_BAJA = "El conteo puede estar por debajo de la realidad (Zoom perdió entradas en esta sala)";
export const TEXTO_CIFRA_FINAL = "Cifra final del webhook; el cierre oficial lo calcula el sistema";
export const AYUDA_DESCONOCIDOS = "Personas que entraron a Zoom y no pudimos identificar con el roster. Incluye correos mal escritos: se corrigen al cerrar la clase.";
export const AYUDA_PERSONAL = "Monitores y equipo de la Fundación presentes en la sala; no cuentan en el roster.";
export const ESTADOS = Object.freeze({
  abierta: { icono: "●", texto: "En curso" }, proxima: { icono: "◷", texto: "Próxima" },
  terminada: { icono: "✔", texto: "Terminada" }, sin_sala: { icono: "○", texto: "Sin sala" },
});
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
export function resumenAnuncio(datos) {
  if (!datos) return "";
  return ordenarClases(datos.clases).map((c) => c.estado === "proxima" || c.estado === "sin_sala"
    ? `${tituloClase(c)}: ${ESTADOS[c.estado].texto}.`
    : `${tituloClase(c)}: del roster ${c.roster_maximo} de ${c.roster_total}; en sala ${c.roster_ahora_aprox}; sin identificar ${c.desconocidos_maximo}; personal ${c.personal_maximo}.`).join(" ");
}
export function esVivoValido(x) {
  return Boolean(x) && typeof x === "object" && Array.isArray(x.clases) && typeof x.disponible === "boolean";
}
// Espera tras el error n (1, 2): 5 s, 10 s. Al llegar a MAX_ERRORES se pausa y se ofrece "Reintentar".
export const esperaTrasError = (n) => Math.min(5_000 * 2 ** (n - 1), 60_000);
