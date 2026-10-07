// Roles del panel (TOC-148, V2). Sin I/O: traduce la respuesta de la RPC panel_rol_de (086) a un permiso sobre el NOMINAL
// (nombres, correos, cedulas) y decide a quien se le niega. Los agregados NO pasan por aqui: siguen abiertos a todo el dominio.
//  - compatibilidad (panel_roles vacia): todo usuario del dominio como antes del V2.
//  - estricto: admin ve todo; monitor solo su ciudad; sin_rol no ve nominal.
// Degradacion SEGURA: una respuesta ilegible o una RPC caida es `error` -> el nominal se niega (503), nunca se abre.

export function normalizarCiudad(valor) {
  return String(valor ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}
export const mismaCiudad = (a, b) => normalizarCiudad(a) === normalizarCiudad(b);

export const ACCESO_ERROR = Object.freeze({ modo: "error", rol: null, ciudad: null, nominal: "error" });

// payload = lo que devuelve la RPC (objeto jsonb). Cualquier forma inesperada -> ACCESO_ERROR.
export function resolverAcceso(payload) {
  if (!payload || typeof payload !== "object") return ACCESO_ERROR;
  if (payload.modo === "compatibilidad") return { modo: "compatibilidad", rol: null, ciudad: null, nominal: "todo" };
  if (payload.modo !== "estricto") return ACCESO_ERROR;
  if (payload.rol === "admin") return { modo: "estricto", rol: "admin", ciudad: null, nominal: "todo" };
  if (payload.rol === "monitor") {
    const ciudad = typeof payload.ciudad === "string" && payload.ciudad.trim() ? payload.ciudad.trim() : null;
    // Un monitor sin ciudad no deberia existir (check de la tabla); si llega asi, no se adivina: sin nominal.
    return { modo: "estricto", rol: "monitor", ciudad, nominal: ciudad ? "ciudad" : "ninguno" };
  }
  if (payload.rol === "sin_rol") return { modo: "estricto", rol: "sin_rol", ciudad: null, nominal: "ninguno" };
  return ACCESO_ERROR;
}

export const MENSAJE_SIN_NOMINAL = "Tu cuenta no tiene permiso para ver o descargar datos con nombres. Los agregados siguen disponibles.";
export const MENSAJE_CIUDAD_AJENA = "Solo puedes ver o descargar el nominal de tu ciudad.";

// -> { ok:true, ciudad: null | <ciudad del monitor> } | { ok:false, status, mensaje }. `acceso` ausente se trata como error (cierra).
export function autorizarNominal(acceso, ciudadPedida = null) {
  const nominal = acceso?.nominal;
  if (nominal === "todo") return { ok: true, ciudad: null };
  if (nominal === "ciudad" && acceso.ciudad) {
    if (ciudadPedida && !mismaCiudad(ciudadPedida, acceso.ciudad)) return { ok: false, status: 403, mensaje: MENSAJE_CIUDAD_AJENA };
    return { ok: true, ciudad: acceso.ciudad };
  }
  if (nominal === "ninguno") return { ok: false, status: 403, mensaje: MENSAJE_SIN_NOMINAL };
  return { ok: false, status: 503, mensaje: "No disponible" };
}

// Defensa en profundidad: aunque el lector ya filtro, nunca sale una fila de otra ciudad para un monitor.
export function filtrarPorCiudad(filas, ciudad, campo = "ciudad") {
  return ciudad ? filas.filter((f) => mismaCiudad(f[campo], ciudad)) : filas;
}

// Solo MODO_DEMO con ?demo=1: ?rol_demo=admin|monitor|sin_rol (&ciudad_demo=). Sin parametro = compatibilidad.
export function accesoDemo(params) {
  const rol = params.get("rol_demo");
  if (rol === "admin") return resolverAcceso({ modo: "estricto", rol: "admin", ciudad: null });
  if (rol === "monitor") return resolverAcceso({ modo: "estricto", rol: "monitor", ciudad: params.get("ciudad_demo") || "Cali" });
  if (rol === "sin_rol") return resolverAcceso({ modo: "estricto", rol: "sin_rol", ciudad: null });
  return resolverAcceso({ modo: "compatibilidad" });
}

// Lo unico del acceso que viaja al navegador (nunca el correo).
export const vistaAcceso = (a) => ({ modo: a.modo, rol: a.rol, ciudad: a.ciudad, nominal: a.nominal });
