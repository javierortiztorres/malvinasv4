import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { SESSION_COOKIE, verificarSesionToken } from '@/lib/session';

// Rutas públicas: login, el asistente de configuración inicial (B-30a) y
// sus respectivos endpoints. Todo lo demás requiere sesión válida.
const PUBLICAS = ['/login', '/setup', '/api/login', '/api/setup', '/_next', '/favicon.ico'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = await verificarSesionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  // Sin sesión válida: si todavía no existe ningún usuario, hay que guiar
  // a crear el primer admin en vez de mandar a un login que nadie puede
  // pasar todavía. Si la consulta falla (DB caída, tabla no migrada aún)
  // se asume que NO hace falta setup — nunca se abre la app sin login.
  let necesitaSetup = false;
  if (process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL);
      const filas = await sql`SELECT 1 FROM usuarios LIMIT 1`;
      necesitaSetup = filas.length === 0;
    } catch (e) {
      console.error('middleware: chequeo de necesitaSetup falló', e);
      necesitaSetup = false;
    }
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  return NextResponse.redirect(new URL(necesitaSetup ? '/setup' : '/login', req.url));
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
