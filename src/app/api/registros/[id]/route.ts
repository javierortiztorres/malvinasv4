import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registros } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { faltantes } from '@/lib/validation';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const [row] = await db.select().from(registros).where(eq(registros.id, Number(params.id)));
  if (!row) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const body = await req.json();
  const terminar = req.nextUrl.searchParams.get('terminar') === '1';

  delete body.id;
  delete body.createdAt;
  body.updatedAt = new Date();

  if (terminar) {
    // VALIDACIÓN ESTRICTA en el servidor: no se puede terminar incompleto.
    const faltan = faltantes(body);
    if (faltan) {
      return NextResponse.json(
        { error: 'Registro incompleto', faltantes: faltan },
        { status: 422 }
      );
    }
    body.estado = 'terminado';
  }

  const [row] = await db.update(registros).set(body).where(eq(registros.id, id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await db.delete(registros).where(eq(registros.id, Number(params.id)));
  return NextResponse.json({ ok: true });
}
