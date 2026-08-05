import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { usuarios } from '@/db/schema';
import { db } from '@/db';
import { crearSesionToken, SESSION_COOKIE, SESSION_COOKIE_OPTS } from '@/lib/session';

// Estado del bootstrap: si `usuarios` está vacía, la app todavía no tiene
// dueño y hay que mostrar el asistente. Público (sin sesión) a propósito.
export async function GET() {
  try {
    const filas = await db.select({ id: usuarios.id }).from(usuarios).limit(1);
    return NextResponse.json({ necesitaSetup: filas.length === 0 });
  } catch (e) {
    console.error('GET /api/setup', e);
    return NextResponse.json({ error: 'No se pudo consultar la base de datos' }, { status: 500 });
  }
}

// Crea el primer admin. Sólo funciona una vez: se usa la misma conexión
// simple por HTTP (`db`) que el resto de la app — nada de transacciones con
// Pool/WebSocket, que en el runtime serverless de Vercel se cuelga (ver
// B-30a-fix2). El check-then-insert no es atómico, pero esto lo dispara una
// sola persona una sola vez; si dos envíos chocaran con el mismo nombre de
// usuario, el índice único de `usuarios.usuario` lo rechaza igual.
export async function POST(req: NextRequest) {
  try {
    const { nombre, usuario, password } = await req.json();
    if (!nombre?.trim() || !usuario?.trim() || !password) {
      return NextResponse.json({ error: 'Nombre, usuario y contraseña requeridos' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
    }

    const existentes = await db.select({ id: usuarios.id }).from(usuarios).limit(1);
    if (existentes.length > 0) {
      return NextResponse.json({ error: 'Ya existe un administrador configurado' }, { status: 409 });
    }

    const usuarioNorm = String(usuario).trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);
    const [creado] = await db
      .insert(usuarios)
      .values({ nombre: nombre.trim(), usuario: usuarioNorm, passwordHash, rol: 'admin', activo: true })
      .returning();

    const token = await crearSesionToken({
      uid: creado.id,
      usuario: creado.usuario,
      nombre: creado.nombre,
      rol: 'admin',
    });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, { ...SESSION_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 30 });
    return res;
  } catch (e) {
    console.error('POST /api/setup', e);
    const duplicado = (e as { code?: string })?.code === '23505';
    return NextResponse.json(
      { error: duplicado ? 'Ya existe un usuario con ese nombre de usuario' : 'No se pudo crear la cuenta' },
      { status: duplicado ? 409 : 500 },
    );
  }
}
