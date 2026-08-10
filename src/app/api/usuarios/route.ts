import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { usuarios } from '@/db/schema';
import { getSession } from '@/lib/auth';

const ROLES_VALIDOS = ['admin', 'impresion', 'formulacion'];

// Gestión de usuarios: solo rol admin, chequeado acá en el servidor (no
// alcanza con ocultar el botón en el cliente).
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const filas = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre, usuario: usuarios.usuario, rol: usuarios.rol, activo: usuarios.activo })
    .from(usuarios)
    .orderBy(usuarios.nombre);
  return NextResponse.json(filas);
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { nombre, usuario, password, rol } = await req.json();
  if (!nombre?.trim() || !usuario?.trim() || !password || !ROLES_VALIDOS.includes(rol)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
  }

  const usuarioNorm = String(usuario).trim().toLowerCase();
  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.usuario, usuarioNorm)).limit(1);
  if (existente) {
    return NextResponse.json({ error: 'Ya existe un usuario con ese nombre de usuario' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [creado] = await db
    .insert(usuarios)
    .values({ nombre: nombre.trim(), usuario: usuarioNorm, passwordHash, rol, activo: true })
    .returning({ id: usuarios.id, nombre: usuarios.nombre, usuario: usuarios.usuario, rol: usuarios.rol, activo: usuarios.activo });
  return NextResponse.json(creado);
}
