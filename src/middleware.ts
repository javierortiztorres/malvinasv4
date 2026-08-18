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

  // Rutas del checkout propio, que llegan SIN cookie de sesión y se
  // autentican solas con el secreto compartido: pagada-externa (aviso de
  // pago, header x-checkout-secret), contacto-externa (celular/dirección
  // que el paciente escribe al pagar, v2.2.0) y checkout-data (datos del
  // link corto, firma HMAC en la query) — ver sus route.ts.
  if (/^\/api\/cotizaciones\/\d+\/(pagada-externa|contacto-externa|checkout-data)$/.test(pathname)) {
    return NextResponse.next();
  }

  const session = await verificarSesionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    // Documentos PT/PI (B-30b): navegación directa a la URL no debe saltarse
    // la restricción por rol — Formulación nunca ve una receta de PT, e
    // Impresión no tiene ningún motivo para ver lotes de PI.
    if (session.rol === 'formulacion' && pathname.startsWith('/registro/')) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    if (session.rol === 'impresion' && pathname.startsWith('/registro-pi/')) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    // Atención al cliente cotiza y cobra: no tiene nada que hacer en los
    // documentos legales de producción (ni PT ni PI).
    if (session.rol === 'atencion' && (pathname.startsWith('/registro/') || pathname.startsWith('/registro-pi/'))) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  // Sin sesión válida: si todavía no existe ningún usuario, hay que guiar
  // a crear el primer admin en vez de mandar a un login que nadie puede
  // pasar todavía. Si la consulta falla (DB caída, tabla no migrada aún)
  // se asume que NO hace falta setup — nunca se abre la app sin login.
  let necesitaSetup = false;
  const dbUrl = process.env.DATABASE_URL ?? '';
  const esNeon = dbUrl.includes('neon.tech') || dbUrl.includes('neon.database');
  if (esNeon) {
    // Solo en Neon (edge-compatible). En Docker/local usa postgres-js vía TCP
    // y el middleware corre en Edge, así que saltamos el chequeo.
    try {
      const sql = neon(dbUrl);
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
