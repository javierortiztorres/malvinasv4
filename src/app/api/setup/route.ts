import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { usuarios } from '@/db/schema';
import { db, withTransaction } from '@/db';
import { crearSesionToken, SESSION_COOKIE, SESSION_COOKIE_OPTS } from '@/lib/session';

// Estado del bootstrap: si `usuarios` está vacía, la app todavía no tiene
// dueño y hay que mostrar el asistente. Público (sin sesión) a propósito.
export async function GET() {
  const filas = await db.select({ id: usuarios.id }).from(usuarios).limit(1);
  return NextResponse.json({ necesitaSetup: filas.length === 0 });
}

// Crea el primer admin. Sólo funciona una vez: el check-then-insert corre
// dentro de una transacción para que dos envíos simultáneos no puedan
// crear dos primeros admins a la vez.
export async function POST(req: NextRequest) {
  const { nombre, usuario, password } = await req.json();
  if (!nombre?.trim() || !usuario?.trim() || !password) {
    return NextResponse.json({ error: 'Nombre, usuario y contraseña requeridos' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
  }

  const usuarioNorm = String(usuario).trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const creado = await withTransaction(async (tx) => {
    const existentes = await tx.select({ id: usuarios.id }).from(usuarios).limit(1);
    if (existentes.length > 0) return null;
    const [fila] = await tx
      .insert(usuarios)
      .values({ nombre: nombre.trim(), usuario: usuarioNorm, passwordHash, rol: 'admin', activo: true })
      .returning();
    return fila;
  });

  if (!creado) {
    return NextResponse.json({ error: 'Ya existe un administrador configurado' }, { status: 409 });
  }

  const token = await crearSesionToken({
    uid: creado.id,
    usuario: creado.usuario,
    nombre: creado.nombre,
    rol: 'admin',
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, { ...SESSION_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 30 });
  return res;
}
