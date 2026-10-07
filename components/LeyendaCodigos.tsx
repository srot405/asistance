import { CODIGOS_CELDA } from "../lib/codigosCelda.mjs";

// Leyenda global (TOC-146): vive en el encabezado para que cualquier pestana o CSV con SI/NO/NO?/ZL/P/SC se entienda sin salir de la pagina.
export default function LeyendaCodigos() {
  return <details className="leyenda-codigos">
    <summary>Leyenda de códigos: SI · NO · NO? · ZL · P · SC</summary>
    <dl>{CODIGOS_CELDA.map((c) => <div key={c.codigo}><dt>{c.codigo}</dt><dd>{c.texto}</dd></div>)}</dl>
  </details>;
}
