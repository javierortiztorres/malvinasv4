import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registrosPi } from '@/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

const REINTENTOS_LOTE = 3;

function esConflictoDeUnicidad(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

// Producto intermedio (PI): Impresión no tiene ninguna solapa que lo use
// (el "Lote PI usado" del editor de PT es texto libre, no consulta esta
// tabla) y no debe poder verlo ni de este lado (B-30b).
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol === 'impresion' || session.rol === 'atencion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const estado = req.nextUrl.searchParams.get('estado');
  // Archivado (v2.1.3): igual que en /api/registros — la lista normal
  // excluye archivados; ?archivados=1 devuelve solo los archivados.
  const soloArchivados = req.nextUrl.searchParams.get('archivados') === '1';
  const porArchivo = eq(registrosPi.archivado, soloArchivados);
  const q = estado
    ? db.select().from(registrosPi).where(and(eq(registrosPi.estado, estado), porArchivo)).orderBy(desc(registrosPi.createdAt))
    : db.select().from(registrosPi).where(porArchivo).orderBy(desc(registrosPi.createdAt));
  return NextResponse.json(await q);
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol === 'impresion' || session.rol === 'atencion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const body = await req.json();
  const [row] = await db.insert(registrosPi).values(body).returning();

  // El lote de PI se numera POR TINTA, asignado en el servidor al crear (no
  // al terminar): los operadores lo escriben en las jeringas durante la
  // producción. Misma sentencia atómica + retry ante 23505 que B-05 (PT),
  // pero acá sobre la fila recién insertada. El índice único
  // ux_registros_pi_lote (tinta_id, lote_numero) es quien garantiza que dos
  // creaciones simultáneas de la misma tinta nunca repitan número.
  if (row.tintaId != null && row.loteNumero == null) {
    let asignado: number | null = null;
    for (let intento = 1; intento <= REINTENTOS_LOTE && asignado === null; intento++) {
      try {
        const resultado = await db.execute<{ lote_numero: number }>(sql`
          UPDATE registros_pi
          SET lote_numero = (
            SELECT COALESCE(MAX(lote_numero), 0) + 1
            FROM registros_pi
            WHERE tinta_id = ${row.tintaId}
          )
          WHERE id = ${row.id}
          RETURNING lote_numero
        `);
        asignado = resultado.rows[0]?.lote_numero ?? null;
      } catch (e) {
        if (esConflictoDeUnicidad(e) && intento < REINTENTOS_LOTE) continue;
        // Se agotaron los reintentos o fue otro error: no dejamos una
        // producción huérfana sin número — se borra y se avisa.
        await db.delete(registrosPi).where(eq(registrosPi.id, row.id));
        if (esConflictoDeUnicidad(e)) {
          return NextResponse.json(
            { error: 'No se pudo asignar el número de lote para esta tinta. Probá de nuevo.' },
            { status: 409 }
          );
        }
        throw e;
      }
    }
    row.loteNumero = asignado;
  }

  return NextResponse.json(row);
}
