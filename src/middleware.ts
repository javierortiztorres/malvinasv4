import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }
  const cookie = req.cookies.get('badra_auth')?.value;
  if (cookie === process.env.APP_PASSWORD) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
