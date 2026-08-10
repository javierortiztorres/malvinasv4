// ---------------------------------------------------------------
// Sesión real de login (B-30a): cookie firmada (HMAC-SHA256) sin
// estado en servidor — no hay tabla de sesiones que limpiar ni
// expirar a mano. Se firma con una clave derivada de SESSION_SECRET
// si está configurada, o de DATABASE_URL si no (ambas son secretos
// que ya viven solo en las env vars de Vercel/Neon, nunca en el
// repo) — así no hace falta configurar nada nuevo para que la app
// funcione, pero se puede rotar la clave de sesión aparte del DB
// seteando SESSION_SECRET.
//
// Usa Web Crypto (crypto.subtle, global tanto en el runtime de
// Node de las rutas API como en el Edge runtime del middleware)
// para poder verificar la cookie en ambos lugares con el mismo
// código, sin depender de Buffer (no existe en Edge).
// ---------------------------------------------------------------

export const SESSION_COOKIE = 'malvinas_session';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 días

export type Rol = 'admin' | 'impresion' | 'formulacion' | 'atencion';

export type SessionPayload = {
  uid: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  exp: number;
};

function bufToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuf(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

let cachedKey: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const secreto = process.env.SESSION_SECRET || process.env.DATABASE_URL || '';
  cachedKey = crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(`malvinas-session:${secreto}`))
    .then((material) => crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  return cachedKey;
}

export async function crearSesionToken(datos: Omit<SessionPayload, 'exp'>): Promise<string> {
  const payload: SessionPayload = { ...datos, exp: Date.now() + SESSION_MAX_AGE_MS };
  const payloadB64 = bufToBase64url(new TextEncoder().encode(JSON.stringify(payload)).buffer);
  const key = await getKey();
  const firma = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${bufToBase64url(firma)}`;
}

export async function verificarSesionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [payloadB64, firmaB64] = token.split('.');
  if (!payloadB64 || !firmaB64) return null;
  try {
    const key = await getKey();
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      base64urlToBuf(firmaB64),
      new TextEncoder().encode(payloadB64),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64urlToBuf(payloadB64))) as SessionPayload;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_OPTS = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};
