import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { usuarios } from '@/db/schema';
import { crearSesionToken, SESSION_COOKIE, SESSION_COOKIE_OPTS } from '@/lib/session';

export async function POST(req: NextRequest) {
  const { usuario, password } = await req.json();
  if (!usuario || !password) {
    return NextResponse.json({ error: 'Usuario y contraseña requeridos' }, { status: 400 });
  }

  const usuarioNorm = String(usuario).trim().toLowerCase();
  const [cuenta] = await db.select().from(usuarios).where(eq(usuarios.usuario, usuarioNorm)).limit(1);

  if (!cuenta || !cuenta.activo || !(await bcrypt.compare(password, cuenta.passwordHash))) {
    return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 });
  }

  const token = await crearSesionToken({
    uid: cuenta.id,
    usuario: cuenta.usuario,
    nombre: cuenta.nombre,
    rol: cuenta.rol as 'admin' | 'impresion' | 'formulacion',
  });
  const res = NextResponse.json({ ok: true, nombre: cuenta.nombre, rol: cuenta.rol });
  res.cookies.set(SESSION_COOKIE, token, { ...SESSION_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 30 });
  return res;
}
