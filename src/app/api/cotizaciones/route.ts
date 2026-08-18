import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { comprobantes, cotizaciones, recetas, registros } from '@/db/schema';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { lineasDesdeRegistros } from '@/lib/cotizador';
import { cotizarLineas, snapshotParametros } from '@/lib/cotizadorServer';

// Cotizaciones: las ven y gestionan Admin y Atención al cliente.
// Impresión/Formulación no tienen nada que ver con precios (regla de
// privacidad entre roles del backlog).
function sinPermiso(rol: string): boolean {
  return rol !== 'admin' && rol !== 'atencion';
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sinPermiso(session.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const dni = req.nextUrl.searchParams.get('dni');
  const q = dni
    ? db.select().from(cotizaciones).where(eq(cotizaciones.dni, dni)).orderBy(desc(cotizaciones.createdAt))
    : db.select().from(cotizaciones).orderBy(desc(cotizaciones.createdAt));
  const filas = await q;

  // Cuántos comprobantes tiene cada cotización (v2.2.1): la lista lo usa
  // para el aviso "📎 Comprobante recibido" en las pendientes — clave ahora
  // que el paciente puede subirlo solo desde el checkout y alguien tiene
  // que verificar y apretar ✅ PAGADO. Solo el conteo: los archivos nunca
  // viajan por acá.
  const conteos = await db
    .select({ cotizacionId: comprobantes.cotizacionId, n: sql<number>`count(*)::int` })
    .from(comprobantes)
    .groupBy(comprobantes.cotizacionId);
  const porCot = new Map(conteos.map((c) => [c.cotizacionId, c.n]));

  return NextResponse.json(filas.map((c) => ({ ...c, comprobantesCount: porCot.get(c.id) ?? 0 })));
}

// Crea una cotización a partir de registros PT existentes (los del grupo del
// paciente que todavía no tienen cotización): copia la composición como
// snapshot, mueve los registros a "pendiente_pago" y los vincula. Es el
// camino manual — el Lector de Atención hace esto solo al crear registros.
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sinPermiso(session.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body?.registroIds)
    ? body.registroIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Faltan los registros a cotizar' }, { status: 400 });
  }

  const filas = await db.select().from(registros).where(inArray(registros.id, ids));
  if (filas.length === 0) return NextResponse.json({ error: 'No existen esos registros' }, { status: 404 });
  const yaCotizados = filas.filter((r) => r.cotizacionId != null);
  if (yaCotizados.length > 0) {
    return NextResponse.json(
      { error: `Algún registro ya tiene cotización (#${yaCotizados[0].cotizacionId})` },
      { status: 409 }
    );
  }
  const terminados = filas.filter((r) => r.estado === 'terminado');
  if (terminados.length > 0) {
    return NextResponse.json({ error: 'No se puede cotizar un registro terminado' }, { status: 409 });
  }

  // El motor pone precio en el momento si todas las drogas matchean
  // (envío "sin" por defecto; se ajusta desde la pantalla).
  const calc = await cotizarLineas(lineasDesdeRegistros(filas), 'sin');
  const [cot] = await db
    .insert(cotizaciones)
    .values({
      paciente: filas[0].paciente,
      dni: filas[0].dni,
      grupoPaciente: filas[0].grupoPaciente,
      lineas: calc.lineas,
      parametros: snapshotParametros(calc, 'sin'),
      precioTotal: calc.totales?.precioTotal ?? null,
      precioTransferencia: calc.totales?.precioTransferencia ?? null,
      historial: calc.totales
        ? [{
            fecha: new Date().toISOString(),
            usuario: session.nombre,
            precioTotal: calc.totales.precioTotal,
            precioTransferencia: calc.totales.precioTransferencia,
            motivo: 'Cotización automática (motor)',
          }]
        : [],
      cotizadoPor: session.nombre,
    })
    .returning();

  await db
    .update(registros)
    .set({ estado: 'pendiente_pago', enProduccion: false, cotizacionId: cot.id, updatedAt: new Date() })
    .where(inArray(registros.id, filas.map((r) => r.id)));

  // Si las fórmulas nacieron de una receta guardada (v2.2.0), la receta
  // queda vinculada también al pedido recién creado.
  const recetaId = filas.find((r) => r.recetaId != null)?.recetaId;
  if (recetaId != null) {
    await db.update(recetas).set({ cotizacionId: cot.id }).where(eq(recetas.id, recetaId));
  }

  return NextResponse.json(cot);
}
