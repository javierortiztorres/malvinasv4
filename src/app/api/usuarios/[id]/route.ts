import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { usuarios } from '@/db/schema';
import { getSession } from '@/lib/auth';

// Única operación soportada: desactivar una cuenta existente. Reactivar,
// editar rol/nombre, etc. quedan fuera de esta entrega (B-30a).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session || session.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const id = Number(params.id);
  const { activo } = await req.json();
  if (!Number.isInteger(id) || activo !== false) {
    return NextResponse.json({ error: 'Operación no soportada' }, { status: 400 });
  }
  if (id === session.uid) {
    return NextResponse.json({ error: 'No podés desactivar tu propia cuenta' }, { status: 400 });
  }

  const [objetivo] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
  if (!objetivo) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  if (objetivo.rol === 'admin' && objetivo.activo) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(usuarios)
      .where(and(eq(usuarios.rol, 'admin'), eq(usuarios.activo, true)));
    if (Number(count) <= 1) {
      return NextResponse.json({ error: 'No se puede desactivar el último administrador activo' }, { status: 400 });
    }
  }

  await db.update(usuarios).set({ activo: false, updatedAt: new Date() }).where(eq(usuarios.id, id));
  return NextResponse.json({ ok: true });
}
