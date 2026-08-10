// Helper de servidor para leer la sesión actual en las rutas API
// (Node runtime). El middleware ya filtra las requests sin sesión
// válida, pero cada endpoint sensible vuelve a verificar acá —
// nunca confía solo en que el cliente oculte un botón.
import { NextRequest } from 'next/server';
import { SESSION_COOKIE, verificarSesionToken, type SessionPayload } from '@/lib/session';

export async function getSession(req: NextRequest): Promise<SessionPayload | null> {
  return verificarSesionToken(req.cookies.get(SESSION_COOKIE)?.value);
}
