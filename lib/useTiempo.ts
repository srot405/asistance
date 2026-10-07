"use client";
import { useCallback, useEffect, useState } from "react";
import { sesionActual } from "./auth";
import { estadoVistaTiempo } from "./tiempoVista.mjs";
import { aplicarRolDemo, rolDemoActual, type RolUi } from "./rolUi";
import type { FiltroTiempo, TiempoNoDisponible, TiempoSemanaResponse, TiempoSerieResponse } from "./tiempoContrato.d.mts";
import type { VisitasRespuesta } from "./visitasCalculo.d.mts";
import type { ConfianzaSemanaResponse } from "./confianzaClase.d.mts";
import type { EstadisticasRespuesta } from "./estadisticasCalculo.d.mts";

type Modo = "demo" | "real";
export type EstadoTiempo = "cargando" | "ok" | "no_disponible" | "vacio" | "no_detalle" | "error";
type Respuesta<T> = { estado: EstadoTiempo; datos: T | null; recargar: () => void };

// Cache en memoria por (ruta|parametros): cambiar de pestana no repite la consulta (egress de Supabase limitado).
const cache = new Map<string, unknown>();
let usuarioDelCache: string | null = null;

export function guardarCacheTiempo(clave: string, datos: unknown): void { cache.set(clave, datos); }
export function tamanoCacheTiempo(): number { return cache.size; }
export function vaciarCacheTiempoCliente(): void { cache.clear(); usuarioDelCache = null; }

// El caché guarda datos de UN usuario: al cerrar sesión o entrar otro usuario en el mismo navegador se vacía.
// `userId` viene de la sesión de Supabase; TOKEN_REFRESHED del mismo usuario no lo vacía.
export function alCambiarSesionTiempo(evento: string, userId: string | null | undefined): void {
  if (evento === "SIGNED_OUT") { vaciarCacheTiempoCliente(); return; }
  if (userId && usuarioDelCache && userId !== usuarioDelCache) cache.clear();
  if (userId) usuarioDelCache = userId;
}

class ErrorHttp extends Error {
  constructor(readonly status: number) { super(`HTTP ${status}`); }
}

async function pedir<T>(ruta: string, params: URLSearchParams, modo: Modo): Promise<T> {
  const headers: Record<string, string> = {};
  if (modo === "demo") { params.set("demo", "1"); aplicarRolDemo(params); }
  else {
    const sesion = await sesionActual();
    if (!sesion?.access_token) throw new ErrorHttp(401);
    headers.Authorization = `Bearer ${sesion.access_token}`;
  }
  const response = await fetch(`${ruta}?${params}`, { headers, cache: "no-store" });
  if (!response.ok) throw new ErrorHttp(response.status);
  return (await response.json()) as T;
}

// Cualquier fallo se vuelve estado, nunca excepcion: la pestana Tiempo no puede romper el resto del panel.
function usarPeticion<T>(clave: string | null, cargar: () => Promise<T>): Respuesta<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<{ status?: number } | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!clave) { setDatos(null); setError(null); return; }
    if (version === 0 && cache.has(clave)) { setDatos(cache.get(clave) as T); setError(null); return; }
    let cancelado = false;
    setDatos(null); setError(null);
    cargar().then((d) => { guardarCacheTiempo(clave, d); if (!cancelado) setDatos(d); })
      .catch((e) => { if (!cancelado) setError({ status: e instanceof ErrorHttp ? e.status : undefined }); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, version]);
  const recargar = useCallback(() => { if (clave) cache.delete(clave); setVersion((v) => v + 1); }, [clave]);
  const estado = clave ? estadoVistaTiempo(datos as never, error) : "cargando";
  return { estado: estado as EstadoTiempo, datos, recargar };
}

export function useTiempoSemana(semana: string, filtro: FiltroTiempo, modo: Modo, activa = true, ligero = false):
  Respuesta<TiempoSemanaResponse | TiempoNoDisponible> {
  // ligero (tarjeta de la pestana Semana): sin filtros ni vista por persona; clave propia para no mezclarse con la completa.
  const clave = activa && semana ? `${ligero ? "tl" : "t"}|${modo}|${semana}|${filtro.ciudad ?? ""}|${filtro.franja ?? ""}|${filtro.cuenta ?? ""}` : null;
  return usarPeticion(clave, () => {
    const params = new URLSearchParams({ semana });
    if (ligero) params.set("ligero", "1");
    else for (const k of ["ciudad", "franja", "cuenta"] as const) if (filtro[k]) params.set(k, String(filtro[k]));
    return pedir<TiempoSemanaResponse | TiempoNoDisponible>("/api/tiempo", params, modo);
  });
}

// Confianza de la captura y estado del cuadre por clase (TOC-151): una sola lectura por semana, compartida por Semana, Presencia y Tiempo.
export function useConfianzaSemana(semana: string, modo: Modo, activa = true): Respuesta<ConfianzaSemanaResponse> {
  const clave = activa && semana ? `c|${modo}|${semana}` : null;
  return usarPeticion(clave, () => pedir<ConfianzaSemanaResponse>("/api/confianza", new URLSearchParams({ semana }), modo));
}

// Visitas nominales (TOC-147): mismos filtros que Tiempo; se pide solo cuando la pestaña ya tiene tiempos (activa).
export function useVisitasSemana(semana: string, filtro: FiltroTiempo, modo: Modo, activa = true): Respuesta<VisitasRespuesta> {
  const clave = activa && semana ? `v|${modo}|${modo === "demo" ? rolDemoActual() : ""}|${semana}|${filtro.ciudad ?? ""}|${filtro.franja ?? ""}|${filtro.cuenta ?? ""}` : null;
  return usarPeticion(clave, () => {
    const params = new URLSearchParams({ semana });
    for (const k of ["ciudad", "franja", "cuenta"] as const) if (filtro[k]) params.set(k, String(filtro[k]));
    return pedir<VisitasRespuesta>("/api/visitas", params, modo);
  });
}

export function useTiempoSerie(modo: Modo, activa = true): Respuesta<TiempoSerieResponse> {
  return usarPeticion(activa ? `s|${modo}` : null, () => pedir<TiempoSerieResponse>("/api/tiempo-semanas", new URLSearchParams(), modo));
}

// Rol del usuario para la interfaz (TOC-148). Una lectura por sesion y rol de practica; si falla, la UI no ofrece el nominal.
export function useRolAcceso(modo: Modo, activa = true): Respuesta<RolUi> {
  return usarPeticion(activa ? `r|${modo}|${modo === "demo" ? rolDemoActual() : ""}` : null, () => pedir<RolUi>("/api/rol", new URLSearchParams(), modo));
}

// Estadisticas (TOC-150): agregados de v_asist_corte / v_asist_corte_nivel de UNA semana (+ la serie por ciudad). Una lectura por semana;
// los filtros se resuelven en el navegador con lib/estadisticasCalculo.mjs, asi cambiar un filtro no repite la consulta (egress).
export function useEstadisticas(semana: string, modo: Modo, activa = true): Respuesta<EstadisticasRespuesta> {
  return usarPeticion(activa && semana ? `e|${modo}|${semana}` : null, () => pedir<EstadisticasRespuesta>("/api/estadisticas", new URLSearchParams({ semana }), modo));
}
