import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registros } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

// Marca de ENTREGADO al paciente (Agenda de Atención al cliente, azul).
// Se marca el pedido completo (todas las fórmulas del grupo) y solo tiene
// sentido sobre registros TERMINADOS: acá no se toca el flujo de
// producción, es la última milla. `deshacer: true` la revierte (regla 14:
// siempre se puede volver atrás para corregir un error).
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol !== 'admin' && session.rol !== 'atencion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body?.registroIds)
    ? body.registroIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Faltan los registros' }, { status: 400 });

  const ahora = new Date();

  if (body?.deshacer === true) {
    const filas = await db
      .update(registros)
      .set({ entregadoEn: null, entregadoPor: null, updatedAt: ahora })
      .where(inArray(registros.id, ids))
      .returning({ id: registros.id });
    return NextResponse.json({ ok: true, afectados: filas.length, deshecho: true });
  }

  // Solo se entregan fórmulas terminadas — si ninguna lo está, avisar en
  // vez de marcar silenciosamente algo que todavía se está produciendo.
  const filas = await db
    .update(registros)
    .set({ entregadoEn: ahora, entregadoPor: session.nombre, updatedAt: ahora })
    .where(and(inArray(registros.id, ids), eq(registros.estado, 'terminado')))
    .returning({ id: registros.id });

  if (filas.length === 0) {
    return NextResponse.json(
      { error: 'Ninguna fórmula del pedido está terminada todavía' },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, afectados: filas.length });
}
