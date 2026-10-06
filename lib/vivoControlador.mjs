// Controlador del sondeo de "En vivo" (TOC-142), sin React: lo usa lib/useVivo.ts y lo prueban los tests con relojes y fetch falsos.
// Reglas: sondea SOLO si esta iniciado Y la pestana del navegador esta visible; 1 peticion a la vez; 3 errores seguidos = pausa
// hasta "Reintentar"; 503 / disponible:false es un estado (no cuenta como error); sin sondeo en segundo plano.
import { INTERVALO_MS, MAX_ERRORES, esVivoValido, esperaTrasError } from "./vivoVista.mjs";

export function crearControlador({ pedir, alCambiar, visible = () => true, ahora = () => Date.now(),
  poner = setTimeout, quitar = clearTimeout, intervalo = INTERVALO_MS, estadoInicial = null }) {
  let estado = { fase: "cargando", datos: null, leidoEn: 0, errores: 0, ...(estadoInicial ?? {}) };
  let timer = null, abort = null, activo = false, generacion = 0, enCurso = false;
  const emitir = (cambio) => { estado = { ...estado, ...cambio }; alCambiar(estado); };
  const programar = (ms) => { quitar(timer); timer = activo && visible() ? poner(leer, ms) : null; };
  const cancelar = () => { generacion++; enCurso = false; quitar(timer); timer = null; abort?.abort(); abort = null; };

  async function leer() {
    timer = null;
    if (!activo || !visible() || enCurso) return;
    enCurso = true; const mia = ++generacion; abort = new AbortController();
    try {
      const r = await pedir(abort.signal);
      if (mia !== generacion || !activo) return;
      if (r.status === 503 || (r.status === 200 && r.body && r.body.disponible === false)) {
        emitir({ fase: "no_disponible", datos: null, errores: 0, leidoEn: ahora(), fallo: false }); programar(intervalo);
      } else if (r.status === 200 && esVivoValido(r.body)) {
        emitir({ fase: "ok", datos: r.body, errores: 0, leidoEn: ahora(), fallo: false }); programar(intervalo);
      } else throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (mia !== generacion || !activo || e?.name === "AbortError") return;
      const errores = estado.errores + 1;
      if (errores >= MAX_ERRORES) emitir({ fase: "pausado", errores, fallo: true });
      else { emitir({ fase: estado.datos ? "ok" : "error", errores, fallo: true }); programar(esperaTrasError(errores)); }
    } finally { if (mia === generacion) { enCurso = false; abort = null; } }
  }

  return {
    estado: () => estado,
    iniciar() {
      activo = true;
      if (!visible()) return;
      const edad = ahora() - estado.leidoEn;
      if (estado.datos && edad < intervalo) programar(intervalo - edad); else leer();
    },
    detener() { activo = false; cancelar(); },
    // visibilitychange: oculta = cancelar todo; visible = leer ya si lo ultimo es viejo.
    visibilidad() {
      if (!activo) return;
      if (!visible()) { cancelar(); return; }
      if (estado.fase === "pausado") return;
      const edad = ahora() - estado.leidoEn;
      if (!estado.datos || edad >= intervalo) leer(); else programar(intervalo - edad);
    },
    reintentar() {
      if (!activo) return;
      quitar(timer); timer = null;
      emitir({ fase: estado.datos ? "ok" : "cargando", errores: 0, fallo: false });
      leer();
    },
  };
}
