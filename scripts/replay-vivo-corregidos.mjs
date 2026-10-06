// Una sola lectura: cuantas entradas del backend fueron por correo corregido (typo/cedula), por sesion. Solo conteos.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const semana = process.argv[2];
const env = {};
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await sb.from("asist_entradas").select("sesion_id").eq("semana", semana).eq("correo_corregido", true).order("sesion_id").range(0, 999);
if (error) throw new Error(error.code);
const c = {}; for (const r of data) c[r.sesion_id.split("|")[1].replace("backend-", "")] = (c[r.sesion_id.split("|")[1].replace("backend-", "")] ?? 0) + 1;
console.log(JSON.stringify(c));
