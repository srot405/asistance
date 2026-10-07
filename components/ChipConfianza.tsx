import { AYUDA_CUADRE, CHIPS_CONFIANZA, TEXTO_CUADRE } from "../lib/confianzaClase.mjs";
import type { ConfianzaClase, ConfianzaSemanaResponse } from "../lib/confianzaClase.d.mts";

// Mapa slot_id -> confianza para una pestaña. Si la lectura no está (cargando, 084 sin aplicar, error) devuelve un mapa vacío:
// los chips simplemente no aparecen y el resto de la pestaña sigue igual (degradado elegante).
export function mapaConfianza(datos: ConfianzaSemanaResponse | { disponible: false } | null | undefined): Map<string, ConfianzaClase> {
  return new Map(datos && datos.disponible ? datos.clases.map((c) => [c.slot_id, c]) : []);
}

// Chip de confianza de la captura (TOC-151) + estado del cuadre automático de la clase. Icono + texto, nunca solo color. La ayuda va en
// `title` (ratón) Y como texto accesible (aria-label + texto solo para lectores de pantalla), porque `title` no llega a táctil ni a teclado.
export default function ChipConfianza({ c }: { c?: ConfianzaClase }) {
  if (!c) return null;
  const chip = CHIPS_CONFIANZA[c.confianza];
  const q = c.cuadre;
  const detalle = q && q.estado === "con_diferencias"
    ? ` (${q.n_diferencias} ${q.n_diferencias === 1 ? "diferencia" : "diferencias"})` : "";
  return <span className="chips-conf">
    <span className={`chip-conf chip-conf-${c.confianza}`} title={chip.ayuda} aria-label={`Captura: ${chip.texto}. ${chip.ayuda}`} data-testid="chip-confianza">
      <b aria-hidden="true">{chip.icono}</b> {chip.texto}<span className="est-sr"> — {chip.ayuda}</span></span>
    {q && <span className={`chip-conf chip-cuadre-${q.estado}`} title={AYUDA_CUADRE[q.estado]} aria-label={`Cuadre: ${TEXTO_CUADRE[q.estado]}${detalle}. ${AYUDA_CUADRE[q.estado]}`} data-testid="chip-cuadre">
      <b aria-hidden="true">{q.estado === "cuadrada" ? "✓" : q.estado === "con_diferencias" ? "⚠" : "◌"}</b> {TEXTO_CUADRE[q.estado]}{detalle}<span className="est-sr"> — {AYUDA_CUADRE[q.estado]}</span></span>}
  </span>;
}
