import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { cotizaciones, registros, type LineaCotizacion, type VersionCotizacion } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { lineasDesdeRegistros, normalizarNombre, LABEL_ENVIO, type Envio } from '@/lib/cotizador';
import { cotizarLineas, snapshotParametros } from '@/lib/cotizadorServer';

function sinPermiso(rol: string): boolean {
  return rol !== 'admin' && rol !== 'atencion';
}

// Recalcula la cotización con el MOTOR (drogas + parámetros vigentes):
// 1. refresca la composición desde los registros actuales (si el Admin
//    corrigió la receta, acá se entera el precio),
// 2. conserva las drogas asignadas a mano,
// 3. calcula costos y totales según el envío elegido,
// 4. si el precio cambia, entrada de historial automática.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sinPermiso(session.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const id = Number(params.id);
  const [cot] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cot) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  if (cot.estadoPago === 'pagada' && session.rol !== 'admin') {
    return NextResponse.json({ error: 'La cotización ya está paga: solo el Admin puede recalcular' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const envio: Envio = body?.envio === 'largo' || body?.envio === 'corto' ? body.envio : 'sin';
  // Descuento extra: si viene en el body se actualiza; si no, se usa el
  // guardado en la cotización.
  const descCrudo = Number(body?.descuentoExtraPct);
  const descuentoExtraPct = Number.isFinite(descCrudo)
    ? Math.min(Math.max(descCrudo, 0), 100)
    : cot.descuentoExtraPct ?? 0;

  // Composición fresca desde los registros vivos; si no queda ninguno
  // (borrados), se recalcula sobre el snapshot existente.
  const regs = await db.select().from(registros).where(eq(registros.cotizacionId, id));
  let base: LineaCotizacion[] = regs.length > 0 ? lineasDesdeRegistros(regs) : cot.lineas;

  // Conservar drogas asignadas a mano en ediciones anteriores (por nombre
  // normalizado del activo).
  const asignadas = new Map<string, number>();
  for (const l of cot.lineas) {
    for (const a of l.activos) {
      if (a.drogaId != null) asignadas.set(normalizarNombre(a.nombre), a.drogaId);
    }
  }
  base = base.map((l) => ({
    ...l,
    activos: l.activos.map((a) => ({
      ...a,
      drogaId: a.drogaId ?? asignadas.get(normalizarNombre(a.nombre)) ?? null,
    })),
  }));

  const calc = await cotizarLineas(base, envio, descuentoExtraPct);

  const patch: Record<string, unknown> = {
    lineas: calc.lineas,
    parametros: snapshotParametros(calc, envio),
    descuentoExtraPct,
    updatedAt: new Date(),
  };

  if (calc.totales) {
    patch.precioTotal = calc.totales.precioTotal;
    patch.precioTransferencia = calc.totales.precioTransferencia;
    if (calc.totales.precioTotal !== cot.precioTotal) {
      const entrada: VersionCotizacion = {
        fecha: new Date().toISOString(),
        usuario: session.nombre,
        precioTotal: calc.totales.precioTotal,
        precioTransferencia: calc.totales.precioTransferencia,
        motivo: `Cálculo con motor — ${LABEL_ENVIO[envio]}${descuentoExtraPct > 0 ? ` — ${descuentoExtraPct}% off extra` : ''}`,
      };
      patch.historial = [...(cot.historial ?? []), entrada];
    }
  }

  const [row] = await db.update(cotizaciones).set(patch).where(eq(cotizaciones.id, id)).returning();
  return NextResponse.json({ cotizacion: row, faltantes: calc.faltantes, calculado: calc.totales != null });
}
