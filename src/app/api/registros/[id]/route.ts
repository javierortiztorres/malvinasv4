import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registros } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { faltantes } from '@/lib/validation';

const REINTENTOS_LOTE = 3;

function esConflictoDeUnicidad(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

function mensajeLoteDuplicado(prefijo: string) {
  return `Ese número de lote ya existe para el prefijo ${prefijo}`;
}

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
    // El lote de PT se asigna en el servidor, no al cargar la receta: si el
    // registro no trae un número puesto a mano, se toma acá el siguiente
    // correlativo del prefijo con una sentencia atómica. El índice único
    // ux_registros_lote (lote_prefijo, lote_numero) es quien garantiza que
    // dos "terminar" simultáneos nunca puedan repetir número: si dos
    // solicitudes calculan el mismo MAX+1 a la vez, la base deja pasar solo
    // una — la otra choca contra el índice (23505) y reintenta con el MAX
    // ya actualizado.
    if (body.loteNumero == null) {
      let asignado: number | null = null;
      for (let intento = 1; intento <= REINTENTOS_LOTE && asignado === null; intento++) {
        try {
          const resultado = await db.execute<{ lote_numero: number }>(sql`
            UPDATE registros
            SET lote_numero = (
              SELECT COALESCE(MAX(lote_numero), 0) + 1
              FROM registros
              WHERE lote_prefijo = ${body.lotePrefijo}
            )
            WHERE id = ${id}
            RETURNING lote_numero
          `);
          asignado = resultado.rows[0]?.lote_numero ?? null;
        } catch (e) {
          if (esConflictoDeUnicidad(e) && intento < REINTENTOS_LOTE) continue;
          if (esConflictoDeUnicidad(e)) {
            return NextResponse.json({ error: mensajeLoteDuplicado(body.lotePrefijo) }, { status: 409 });
          }
          throw e;
        }
      }
      body.loteNumero = asignado;
    }

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

  try {
    const [row] = await db.update(registros).set(body).where(eq(registros.id, id)).returning();
    return NextResponse.json(row);
  } catch (e) {
    // Número puesto a mano que choca con el índice único: no queda terminado.
    if (terminar && esConflictoDeUnicidad(e)) {
      return NextResponse.json({ error: mensajeLoteDuplicado(body.lotePrefijo) }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await db.delete(registros).where(eq(registros.id, Number(params.id)));
  return NextResponse.json({ ok: true });
}
