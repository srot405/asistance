import type { ClaseVivo } from "../lib/vivoContrato.d.mts";
import {
  AYUDA_DESCONOCIDOS, AYUDA_OTRA_FRANJA, AYUDA_PERSONAL, ESTADOS, TEXTO_CIFRA_FINAL, TEXTO_COBERTURA_BAJA,
  cifraNoDisponible, horaCorta, porcentajeRoster, textoRoster, tituloClase,
} from "../lib/vivoVista.mjs";

// Una tarjeta por clase (TOC-142). Solo conteos: sin nombres ni correos. El color nunca va solo: cada burbuja lleva texto
// y un borde distinto (liso / punteado / doble). Los numeros de las burbujas son los del contrato, sin recalcular.
export default function EnVivoTarjeta({ clase: c }: { clase: ClaseVivo }) {
  const est = ESTADOS[c.estado] ?? ESTADOS.sin_sala;
  const titulo = tituloClase(c);
  const idAyuda = `vivo-ayuda-${c.slot_id}`;
  const sinCifra = cifraNoDisponible(c); // terminada y el servidor no tiene la cifra: ni burbujas ni "cifra final"
  const empezo = (c.estado === "abierta" || c.estado === "terminada") && !sinCifra;
  const otra = c.otra_franja_maximo ?? 0;
  const roster = textoRoster(c);
  const abierta = c.estado === "abierta";
  const pct = porcentajeRoster(c);
  return <article className={`vivo-tarjeta vivo-${c.estado}`} aria-labelledby={`vivo-t-${c.slot_id}`} data-estado={c.estado}>
    <header className="vivo-cab">
      <h3 id={`vivo-t-${c.slot_id}`}>{titulo}</h3>
      <span className={`vivo-estado vivo-estado-${c.estado}`}><span aria-hidden="true">{est.icono}</span> {est.texto}</span>
    </header>
    <p className="vivo-meta">Cuenta Zoom: {c.cuenta_zoom} · {horaCorta(c.inicio)} a {horaCorta(c.fin)}</p>

    {c.cobertura_baja && <div className="vivo-banda" role="note">
      <b><span aria-hidden="true">⚠</span> {TEXTO_COBERTURA_BAJA}</b>
      {c.aviso && <span className="vivo-aviso">{c.aviso}</span>}
    </div>}
    {!c.cobertura_baja && c.aviso && <p className="vivo-aviso-simple">{c.aviso}</p>}

    {c.estado === "proxima" && <p className="vivo-pendiente">Todavía no empieza. Roster de esta clase: {c.roster_total} personas.</p>}
    {c.estado === "sin_sala" && <p className="vivo-pendiente">Todavía no hay una sala de Zoom abierta para esta clase. Roster de esta clase: {c.roster_total} personas.</p>}

    {empezo && <div className="vivo-burbujas">
      <div className="vivo-burbuja vivo-b-roster">
        <span className="vivo-circulo" aria-hidden="true">{c.roster_maximo}</span>
        <div className="vivo-b-texto">
          <p className="vivo-b-etq"><span>Del roster:</span> <strong>{roster.texto}</strong></p>
          <div className="vivo-barra" role="progressbar" aria-valuemin={0} aria-valuemax={roster.totalBarra} aria-valuenow={roster.valorBarra}
            aria-valuetext={roster.texto} aria-label={`Del roster: ${roster.texto}`}><span style={{ width: `${pct}%` }} /></div>
          {abierta
            ? <small>ahora en sala (aprox.): {c.roster_ahora_aprox}</small>
            : <small>máximo que llegó a estar en la sala</small>}
        </div>
      </div>
      <div className="vivo-burbuja vivo-b-desconocidos">
        <span className="vivo-circulo" aria-hidden="true">{c.desconocidos_maximo}</span>
        <div className="vivo-b-texto">
          <p className="vivo-b-etq"><span>No sabemos quién es:</span> <strong>{c.desconocidos_maximo}</strong>
            <span className="vivo-ayuda" tabIndex={0} role="note" title={AYUDA_DESCONOCIDOS} aria-label={`Qué significa: ${AYUDA_DESCONOCIDOS}`}
              aria-describedby={idAyuda}>ⓘ</span></p>
          {abierta && <small>ahora en sala (aprox.): {c.desconocidos_ahora_aprox}</small>}
          <span id={idAyuda} className="sr-only">{AYUDA_DESCONOCIDOS}</span>
        </div>
      </div>
      <div className="vivo-burbuja vivo-b-personal">
        <span className="vivo-circulo" aria-hidden="true">{c.personal_maximo}</span>
        <div className="vivo-b-texto">
          <p className="vivo-b-etq"><span>Personal:</span> <strong>{c.personal_maximo}</strong>
            <span className="vivo-ayuda" tabIndex={0} role="note" title={AYUDA_PERSONAL} aria-label={`Qué significa: ${AYUDA_PERSONAL}`}>ⓘ</span></p>
          {abierta && <small>ahora en sala (aprox.): {c.personal_ahora_aprox}</small>}
        </div>
      </div>
    </div>}

    {empezo && otra > 0 && <p className="vivo-otra" data-testid="vivo-otra-franja" title={AYUDA_OTRA_FRANJA}>
      <span aria-hidden="true">⇄</span> De otra franja: <strong>{otra}</strong>
      <span className="vivo-ayuda" tabIndex={0} role="note" title={AYUDA_OTRA_FRANJA} aria-label={`Qué significa: ${AYUDA_OTRA_FRANJA}`}>ⓘ</span></p>}

    {c.estado === "terminada" && !sinCifra && <p className="vivo-final">{TEXTO_CIFRA_FINAL}.</p>}
  </article>;
}
