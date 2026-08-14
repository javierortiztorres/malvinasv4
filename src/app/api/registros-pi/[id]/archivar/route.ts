import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registrosPi } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

// Archivar / desarchivar un lote de PI (v2.1.3 — reemplaza al DELETE).
// Mismas reglas que en PT: archivar pueden los roles que antes podían
// eliminar (todos menos Impresión y Atención, que no ven PI); desarchivar
// SOLO Admin. El "Deshacer" de Necesidades también pasa por acá.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol === 'impresion' || session.rol === 'atencion') {
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
    .update(registrosPi)
    .set({
      archivado,
      archivadoEn: archivado ? ahora : null,
      archivadoPor: archivado ? session.nombre : null,
      updatedAt: ahora,
    })
    .where(eq(registrosPi.id, Number(params.id)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  return NextResponse.json(row);
}
