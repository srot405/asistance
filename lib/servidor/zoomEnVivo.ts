import "server-only";
import { presentesDeParticipantes } from "../zoomPresentes.mjs";
import type { PresenteZoom } from "../zoomPresentes.d.mts";

// TOC-153: participantes EN VIVO de Zoom para conciliar «ahora en sala» (En vivo y Lista en vivo). Es un REFUERZO: nunca lanza; si
// falta configuracion, Zoom falla o responde 429, devuelve estado != "ok" y el panel sigue con los webhooks.
// Ruta (probada 2026-10-22, solo conteos). El token Server-to-Server NO tiene dashboard:read:list_meetings:admin, asi que no se
// listan todas las reuniones de la cuenta: se recorre cada host de ZOOM_HOSTS (correos separados por coma).
//   GET /users/{host}/meetings?type=live -> GET /meetings/{id} (uuid de la instancia en curso)
//   -> GET /metrics/meetings/{uuid doble-codificado}/participants?type=live (status in_meeting / in_waiting_room)
// Concurrencia y cuota: cache compartido TTL_ZOOM_MS para todos los visitantes y las dos pestanas, una sola lectura en vuelo, y tras
// un 429 o un fallo general una pausa (PAUSA_TRAS_FALLO_MS) sin llamar a Zoom. Cada llamada HTTP tiene su propio tiempo limite.
// En memoria quedan correos y nombres de los presentes (como en leerVivoNominal.ts); leerVivo.ts los compacta a hashes al recibirlos.
export const TTL_ZOOM_MS = 20_000;
export const PAUSA_TRAS_FALLO_MS = 60_000;
export const LIMITE_HTTP_MS = 5_000;
// Tope de TODA la lectura: queda muy por debajo del limite de 20 s de leerVivo/leerVivoNominal, para que un Zoom lento nunca tumbe
// el panel (se sigue con webhooks).
export const LIMITE_TOTAL_MS = 6_000;
const MAX_PAGINAS = 5;               // 300 por pagina: sobra para una clase
const API = "https://api.zoom.us/v2";

export type EstadoZoom = "ok" | "apagado" | "fallo" | "limite";
export type LecturaZoom = { estado: EstadoZoom; salas: Map<string, PresenteZoom[]> | null };
type Config = { accountId: string; clientId: string; secreto: string; hosts: string[] };
type Fetch = typeof fetch;

class ErrorZoom extends Error {
  constructor(readonly status: number) { super(`zoom ${status}`); }
}

let token: { valor: string; venceMs: number } | null = null;
let cache: { ms: number; data: LecturaZoom } | null = null;
let enCurso: Promise<LecturaZoom> | null = null;
let pausaHastaMs = 0;

export function vaciarCacheZoom() { token = null; cache = null; enCurso = null; pausaHastaMs = 0; }

export function configZoom(env: Record<string, string | undefined> = process.env): Config | null {
  const accountId = env.ZOOM_ACCOUNT_ID?.trim(), clientId = env.ZOOM_CLIENT_ID?.trim(), secreto = env.ZOOM_CLIENT_SECRET?.trim();
  const hosts = (env.ZOOM_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  if (!accountId || !clientId || !secreto || !hosts.length) return null;
  return { accountId, clientId, secreto, hosts };
}

async function pedir(f: Fetch, url: string, init: RequestInit = {}): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), LIMITE_HTTP_MS);
  try {
    const r = await f(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) throw new ErrorZoom(r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function obtenerToken(cfg: Config, f: Fetch, ahoraMs: number): Promise<string> {
  if (token && ahoraMs < token.venceMs) return token.valor;
  const basic = Buffer.from(`${cfg.clientId}:${cfg.secreto}`).toString("base64");
  const r = await pedir(f, `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(cfg.accountId)}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } });
  if (!r?.access_token) throw new ErrorZoom(0);
  token = { valor: String(r.access_token), venceMs: ahoraMs + Math.max(60, Number(r.expires_in ?? 3600) - 120) * 1000 };
  return token.valor;
}

// Zoom exige doble codificacion cuando el uuid empieza por "/" o contiene "//"; doble siempre es la forma probada.
export const uuidParaRuta = (uuid: string) => encodeURIComponent(encodeURIComponent(uuid));

async function leer(cfg: Config, f: Fetch, ahoraMs: number): Promise<LecturaZoom> {
  const auth = { headers: { Authorization: `Bearer ${await obtenerToken(cfg, f, ahoraMs)}` } };
  const salas = new Map<string, PresenteZoom[]>();
  let fallos = 0;
  // hosts en paralelo (cada uno es una cuenta distinta); dentro de un host, sus reuniones en serie
  await Promise.all(cfg.hosts.map(async (host) => {
    try {
      const lista = await pedir(f, `${API}/users/${encodeURIComponent(host)}/meetings?type=live&page_size=30`, auth);
      for (const m of lista?.meetings ?? []) {
        try {
          const det = await pedir(f, `${API}/meetings/${encodeURIComponent(String(m.id))}`, auth);
          const uuid = String(det?.uuid ?? m.uuid ?? "");
          if (!uuid || salas.has(uuid)) continue;
          const participantes = [];
          let siguiente = "";
          for (let p = 0; p < MAX_PAGINAS; p += 1) {
            const pag = await pedir(f, `${API}/metrics/meetings/${uuidParaRuta(uuid)}/participants?type=live&page_size=300`
              + (siguiente ? `&next_page_token=${encodeURIComponent(siguiente)}` : ""), auth);
            participantes.push(...(pag?.participants ?? []));
            siguiente = String(pag?.next_page_token ?? "");
            if (!siguiente) break;
          }
          salas.set(uuid, presentesDeParticipantes(participantes));
        } catch (e) {
          // una reunion que no se pudo leer queda fuera: su clase sigue con webhooks (ver presentesDeClase)
          if (e instanceof ErrorZoom && (e.status === 429 || e.status === 401)) throw e;
          fallos += 1;
        }
      }
    } catch (e) {
      if (e instanceof ErrorZoom && (e.status === 429 || e.status === 401)) throw e;
      fallos += 1;
    }
  }));
  return { estado: fallos && !salas.size ? "fallo" : "ok", salas };
}

// Presentes de Zoom por uuid de sala. Nunca lanza. `f` y `env` solo se inyectan en pruebas.
export async function presentesZoom(ahoraMs: number = Date.now(), f: Fetch = fetch,
  env: Record<string, string | undefined> = process.env): Promise<LecturaZoom> {
  const cfg = configZoom(env);
  if (!cfg) return { estado: "apagado", salas: null };
  if (cache && ahoraMs >= cache.ms && ahoraMs - cache.ms < TTL_ZOOM_MS) return cache.data;
  if (ahoraMs < pausaHastaMs) return { estado: cache?.data.estado === "limite" ? "limite" : "fallo", salas: null };
  if (enCurso) return enCurso;
  let t: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => { t = setTimeout(() => rechazar(new ErrorZoom(0)), LIMITE_TOTAL_MS); });
  const p = Promise.race([leer(cfg, f, ahoraMs), limite])
    .catch((e): LecturaZoom => {
      const st = e instanceof ErrorZoom ? e.status : 0;
      if (st === 401) token = null;
      return { estado: st === 429 ? "limite" : "fallo", salas: null };
    })
    .then((data) => {
      if (data.estado !== "ok") pausaHastaMs = ahoraMs + PAUSA_TRAS_FALLO_MS;
      cache = { ms: ahoraMs, data };
      return data;
    })
    .finally(() => { clearTimeout(t); enCurso = null; });
  enCurso = p;
  return p;
}
