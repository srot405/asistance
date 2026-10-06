import { textoBaseSeguimiento } from "../lib/baseSeguimiento.mjs";
import { coberturaTiempo, nivelCobertura, textoCobertura } from "../lib/tiempoVista.mjs";

type Conteos = { n_ingresaron: number; n_medibles: number };

// "N de M con tiempo medido" SIEMPRE visible junto a cualquier cifra de tiempo. N = medibles (cumple + rojo),
// M = personas que ingresaron a SU clase. Una cifra de tiempo sin su cobertura no se muestra.
export default function CoberturaTiempo({ conteos, roster, congeladaEn, reconstruida }: {
  conteos: Conteos; roster?: number | null; congeladaEn?: string | null; reconstruida?: boolean;
}) {
  const frac = coberturaTiempo(conteos);
  const nivel = nivelCobertura(frac);
  const pct = frac == null ? null : Math.round(frac * 1000) / 10;
  return <div className="cobertura-tiempo" data-testid="cobertura-tiempo">
    <p className="cob-texto"><b>{textoCobertura(conteos)}</b>{pct != null && <> ({pct.toFixed(1)} %)</>}
      {nivel === "baja" && <span className="badge-cobertura-baja"> ⚠ cobertura baja: leer con cuidado</span>}</p>
    <div className={`cob-barra ${nivel}`} role="img"
      aria-label={`${conteos.n_medibles} de ${conteos.n_ingresaron} con tiempo medido`}>
      <i style={{ width: `${pct ?? 0}%` }} />
    </div>
    {roster != null && roster > 0 && <p className="nota" data-testid="base-seguimiento-tiempo">
      {textoBaseSeguimiento(roster, congeladaEn, { reconstruida })}</p>}
  </div>;
}
