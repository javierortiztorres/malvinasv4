import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registros } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { estadoPT, esAvance, puedeTransicionar, ahoraDatetimeLocal, type EstadoActivo } from '@/lib/estadoPT';

const DESTINOS_VALIDOS = new Set<EstadoActivo>(['pendiente_pago', 'pendiente', 'pre_produccion', 'en_produccion']);

// Movimiento manual bidireccional Pendientes ↔ Pre-producción ↔ En
// producción (B-31). Endpoint aparte del PUT genérico: acá vive el control
// de permisos por rol y los efectos automáticos (timestamp de inicio,
// indicador de "devuelto"), sin que el cliente pueda mandarlos a mano.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const id = Number(params.id);
  const body = await req.json().catch(() => ({}));
  const destino = body?.destino;
  if (typeof destino !== 'string' || !DESTINOS_VALIDOS.has(destino as EstadoActivo)) {
    return NextResponse.json({ error: 'Destino inválido' }, { status: 400 });
  }

  const [actual] = await db.select().from(registros).where(eq(registros.id, id));
  if (!actual) return NextResponse.json({ error: 'No existe' }, { status: 404 });

  const estadoActual = estadoPT(actual);
  if (estadoActual === 'terminado') {
    return NextResponse.json({ error: 'Un registro terminado no se mueve por acá' }, { status: 409 });
  }
  if (!puedeTransicionar(session.rol, estadoActual, destino as EstadoActivo)) {
    return NextResponse.json({ error: 'No tenés permiso para mover este registro a ese estado' }, { status: 403 });
  }

  const ahora = new Date();
  const patch: Record<string, unknown> = {
    estado: destino,
    enProduccion: destino === 'en_produccion',
    updatedAt: ahora,
  };

  if (esAvance(estadoActual, destino as EstadoActivo)) {
    // Al avanzar se da por corregido lo que haya motivado un retroceso previo.
    patch.devueltoPor = null;
    patch.devueltoEn = null;
    if (destino === 'en_produccion') {
      patch.fechaHoraInicio = ahoraDatetimeLocal();
    }
  } else {
    // Retroceso manual: se pierde el timestamp de inicio (si lo tenía — se
    // toma uno nuevo si más adelante vuelve a entrar a Producción) y queda
    // registrado quién lo devolvió y cuándo, para que no pase desapercibido.
    patch.fechaHoraInicio = '';
    patch.devueltoPor = session.nombre;
    patch.devueltoEn = ahora;
  }

  const [row] = await db.update(registros).set(patch).where(eq(registros.id, id)).returning();
  return NextResponse.json(row);
}
