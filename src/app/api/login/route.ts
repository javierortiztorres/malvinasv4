import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'APP_PASSWORD no configurada' }, { status: 500 });
  }
  const { password } = await req.json();
  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('badra_auth', password, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
  return res;
}
