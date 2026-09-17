export const DOMINIO_PERMITIDO = 'tocaunavida.org';
function esDelDominio(correo) { const i = correo.lastIndexOf('@'); return i > 0 && correo.slice(i + 1) === DOMINIO_PERMITIDO; }
export function correoConAcceso(email) { return !!email && esDelDominio(email.trim().toLowerCase()); }
export function usuarioAutorizado(user) {
  if (!user?.email || !correoConAcceso(user.email) || !user.email_confirmed_at) return false;
  const app = user.app_metadata ?? {}; const providers = app.providers ?? (app.provider ? [app.provider] : []);
  if (!providers.includes('google')) return false;
  const hd = user.user_metadata?.custom_claims?.hd ?? user.user_metadata?.hd;
  return hd === DOMINIO_PERMITIDO;
}
