"use client";
import { useCallback, useEffect, useState } from "react";
import { sesionActual } from "./auth";
import { estadoVistaTiempo } from "./tiempoVista.mjs";
import type { FiltroTiempo, TiempoNoDisponible, TiempoSemanaResponse, TiempoSerieResponse } from "./tiempoContrato.d.mts";

type Modo = "demo" | "real";
export type EstadoTiempo = "cargando" | "ok" | "no_disponible" | "vacio" | "no_detalle" | "error";
type Respuesta<T> = { estado: EstadoTiempo; datos: T | null; recargar: () => void };

// Cache en memoria por (ruta|parametros): cambiar de pestana no repite la consulta (egress de Supabase limitado).
const cache = new Map<string, unknown>();

class ErrorHttp extends Error {
  constructor(readonly status: number) { super(`HTTP ${status}`); }
}

async function pedir<T>(ruta: string, params: URLSearchParams, modo: Modo): Promise<T> {
  const headers: Record<string, string> = {};
  if (modo === "demo") params.set("demo", "1");
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
    cargar().then((d) => { cache.set(clave, d); if (!cancelado) setDatos(d); })
      .catch((e) => { if (!cancelado) setError({ status: e instanceof ErrorHttp ? e.status : undefined }); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, version]);
  const recargar = useCallback(() => { if (clave) cache.delete(clave); setVersion((v) => v + 1); }, [clave]);
  const estado = clave ? estadoVistaTiempo(datos as never, error) : "cargando";
  return { estado: estado as EstadoTiempo, datos, recargar };
}

export function useTiempoSemana(semana: string, filtro: FiltroTiempo, modo: Modo, activa = true):
  Respuesta<TiempoSemanaResponse | TiempoNoDisponible> {
  const clave = activa && semana ? `t|${modo}|${semana}|${filtro.ciudad ?? ""}|${filtro.franja ?? ""}|${filtro.cuenta ?? ""}` : null;
  return usarPeticion(clave, () => {
    const params = new URLSearchParams({ semana });
    for (const k of ["ciudad", "franja", "cuenta"] as const) if (filtro[k]) params.set(k, String(filtro[k]));
    return pedir<TiempoSemanaResponse | TiempoNoDisponible>("/api/tiempo", params, modo);
  });
}

export function useTiempoSerie(modo: Modo, activa = true): Respuesta<TiempoSerieResponse> {
  return usarPeticion(activa ? `s|${modo}` : null, () => pedir<TiempoSerieResponse>("/api/tiempo-semanas", new URLSearchParams(), modo));
}
