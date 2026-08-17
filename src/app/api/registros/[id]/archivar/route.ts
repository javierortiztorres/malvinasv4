import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registros } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

// Archivar / desarchivar un registro PT (v2.1.3 — reemplaza al DELETE).
//
// PUT con body { archivado: true | false }:
// - archivar (true): mismos roles que antes podían eliminar (todos menos
//   Formulación, que no ve PT).
// - desarchivar (false): SOLO Admin — es el control para restaurar algo
//   archivado por error.
//
// El registro conserva estado, datos y número de lote; al desarchivar
// vuelve solo a la solapa que le corresponde por su estado. La numeración
// de lotes NUNCA se reutiliza: los MAX de lote miran también archivados.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol === 'formulacion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const archivado = body?.archivado;
  if (typeof archivado !== 'boolean') {
    return NextResponse.json({ error: 'Falta archivado: true | false' }, { status: 400 });
  }
  if (!archivado && session.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo Admin puede desarchivar' }, { status: 403 });
  }

  const ahora = new Date();
  const [row] = await db
    .update(registros)
    .set({
      archivado,
      archivadoEn: archivado ? ahora : null,
      archivadoPor: archivado ? session.nombre : null,
      updatedAt: ahora,
    })
    .where(eq(registros.id, Number(params.id)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  return NextResponse.json(row);
}
