import type { VivoResponse } from "../lib/vivoContrato.d.mts";
import type { FaseVivo } from "../lib/vivoControlador.mjs";
import {
  AVISO_CIFRA_NO_DISPONIBLE, ESTADOS, TEXTO_NO_DISPONIBLE, TEXTO_SIN_CLASE, cifraNoDisponible, hayEnCurso, horaCorta, ordenarClases,
  proximaClase, resumenAnuncio, textoEdad, tituloClase,
} from "../lib/vivoVista.mjs";
import EnVivoTarjeta from "./EnVivoTarjeta";

type Props = { fase: FaseVivo; datos: VivoResponse | null; edadSeg: number; fallo?: boolean; aviso?: string | null; reintentar: () => void };

// Pantalla pura de "En vivo" (sin hooks): recibe el estado ya resuelto. Asi se prueba cada estado sin navegador.
export default function EnVivoPantalla({ fase, datos, edadSeg, fallo, aviso, reintentar }: Props) {
  const clases = datos ? ordenarClases(datos.clases) : [];
  const proxima = datos ? proximaClase(datos.clases) : null;
  const sinEnCurso = datos ? !hayEnCurso(datos.clases) : false;
  return <section className="panel vivo-panel" aria-label="En vivo" aria-busy={fase === "cargando" && !datos}>
    <div className="section-heading"><div><h2>En vivo</h2>
      <p>Cuántas personas hay en cada clase ahora mismo. Solo cifras, sin nombres.</p></div></div>

    {/* Anuncia SOLO cuando cambia una cifra (el contador de segundos queda fuera de esta region). */}
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="vivo-anuncio">{resumenAnuncio(datos)}</div>

    {fase === "cargando" && !datos && <p className="nota" role="status">Cargando En vivo…</p>}
    {fase === "no_disponible" && <p className="historical-notice missing-notice" role="status" data-testid="vivo-no-disponible">{TEXTO_NO_DISPONIBLE}</p>}
    {fase === "no_disponible" && aviso && <p className="historical-notice weekly-notice" data-testid="vivo-no-disponible-motivo">{aviso}</p>}
    {fase === "error" && !datos && <p className="historical-notice missing-notice" role="status">No se pudo leer En vivo. Reintentando solo…</p>}
    {fase === "pausado" && <div className="historical-notice missing-notice vivo-pausa" role="alert" data-testid="vivo-pausado">
      <span>Se detuvo la actualización automática porque falló tres veces seguidas.</span>{" "}
      <button type="button" className="control" onClick={reintentar}>Reintentar</button></div>}

    {datos && fase !== "no_disponible" && <>
      <p className="vivo-edad" data-testid="vivo-edad">{textoEdad(edadSeg)}
        {fallo && fase !== "pausado" && <span> · la última lectura falló, se reintenta solo</span>}
        {fase !== "pausado" && <span className="vivo-auto"> · se actualiza cada 45 s mientras esta pestaña esté visible</span>}</p>
      {datos.aviso_general && <p className="historical-notice weekly-notice">{datos.aviso_general}</p>}

      {clases.length === 0 && <p className="vivo-vacio" data-testid="vivo-vacio">{TEXTO_SIN_CLASE}</p>}
      {clases.length > 0 && sinEnCurso && <p className="vivo-vacio" data-testid="vivo-vacio">{TEXTO_SIN_CLASE}.
        {proxima ? ` Próxima clase de hoy: ${tituloClase(proxima)} (empieza a las ${horaCorta(proxima.inicio)}).` : ""}</p>}

      <div className="vivo-tarjetas">{clases.map((c) => <EnVivoTarjeta key={c.slot_id} clase={c} />)}</div>

      {clases.length > 0 && <table className="sr-only">
        <caption>Clases de hoy: cifras en vivo</caption>
        <thead><tr><th scope="col">Clase</th><th scope="col">Estado</th><th scope="col">En su horario (máximo)</th><th scope="col">Inscritas (total)</th>
          <th scope="col">Ahora en sala (aprox.)</th><th scope="col">Sin identificar (máximo)</th><th scope="col">Sin identificar, ahora (aprox.)</th>
          <th scope="col">Personal (máximo)</th><th scope="col">Personal, ahora (aprox.)</th><th scope="col">Colados (otra clase) (máximo)</th></tr></thead>
        <tbody>{clases.map((c) => <tr key={c.slot_id}><th scope="row">{tituloClase(c)}</th><td>{(ESTADOS[c.estado] ?? ESTADOS.sin_sala).texto}</td>
          {cifraNoDisponible(c) ? <td colSpan={8}>{AVISO_CIFRA_NO_DISPONIBLE}</td> : <>
          <td>{c.roster_maximo}</td><td>{c.roster_total}</td><td>{c.roster_ahora_aprox}</td><td>{c.desconocidos_maximo}</td>
          <td>{c.desconocidos_ahora_aprox}</td><td>{c.personal_maximo}</td><td>{c.personal_ahora_aprox}</td><td>{c.otra_franja_maximo ?? 0}</td></>}</tr>)}</tbody>
      </table>}
    </>}
  </section>;
}
