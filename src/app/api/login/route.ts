import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('badra_auth', password, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
  return res;
}
