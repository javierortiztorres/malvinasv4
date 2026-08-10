import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { cotizadorDrogas } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

// Lista de costos de drogas del cotizador. La VE también Atención (la
// necesita para matchear y cotizar); la EDITA solo el Admin (decisión de
// Tomi 10-ago: costos solo Admin).

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol !== 'admin' && session.rol !== 'atencion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  return NextResponse.json(await db.select().from(cotizadorDrogas).orderBy(asc(cotizadorDrogas.nombre)));
}

function limpiar(item: Record<string, unknown>) {
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  return {
    nombre: String(item.nombre ?? '').trim(),
    keywords: String(item.keywords ?? '').trim(),
    unidad: String(item.unidad ?? 'mg').trim() || 'mg',
    costoUnitario: num(item.costoUnitario),
    precioComercialUnitario: num(item.precioComercialUnitario),
    activo: item.activo === undefined ? true : Boolean(item.activo),
  };
}

// POST: una droga nueva, o una LISTA para carga masiva (el seed inicial
// desde el Excel). En masivo, los nombres ya existentes se saltean.
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo el Admin edita los costos' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const items = Array.isArray(body) ? body : [body];
  let creadas = 0;
  const salteadas: string[] = [];
  for (const crudo of items) {
    const item = limpiar(crudo ?? {});
    if (!item.nombre) continue;
    try {
      await db.insert(cotizadorDrogas).values({ ...item, updatedAt: new Date() });
      creadas++;
    } catch (e) {
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505') {
        salteadas.push(item.nombre); // ya existe (índice único por nombre)
      } else {
        throw e;
      }
    }
  }
  return NextResponse.json({ creadas, salteadas });
}

export async function PUT(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo el Admin edita los costos' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });
  const item = limpiar(body);
  if (!item.nombre) return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 });
  try {
    const [row] = await db
      .update(cotizadorDrogas)
      .set({ ...item, updatedAt: new Date() })
      .where(eq(cotizadorDrogas.id, id))
      .returning();
    if (!row) return NextResponse.json({ error: 'No existe' }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Ya existe una droga con ese nombre' }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo el Admin edita los costos' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });
  await db.delete(cotizadorDrogas).where(eq(cotizadorDrogas.id, id));
  return NextResponse.json({ ok: true });
}
