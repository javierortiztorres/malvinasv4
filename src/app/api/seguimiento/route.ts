import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { cotizaciones, comprobantes, recetas, registros } from '@/db/schema';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { estadoPT, LABEL_ESTADO } from '@/lib/estadoPT';
import { montoEnvio, type Envio } from '@/lib/cotizador';
import { cargarConfig } from '@/lib/cotizadorServer';

// 📒 Seguimiento (v2.2.0, solo Admin): una fila por pedido PAGADO, la más
// nueva arriba. Junta cotización (cobro, celular, dirección), registros
// (médico, estados de producción, receta) y los METADATOS de comprobantes
// y recetas — los archivos en sí nunca viajan por acá (van por
// /api/comprobantes/[id] y /api/recetas/[id]).
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const cots = await db
    .select()
    .from(cotizaciones)
    .where(eq(cotizaciones.estadoPago, 'pagada'))
    // DESC en Postgres pone los NULL primero — un pago viejo sin fecha no
    // tiene que quedar arriba de los pagos de hoy.
    .orderBy(sql`${cotizaciones.pagadaEn} DESC NULLS LAST`, desc(cotizaciones.createdAt));

  if (cots.length === 0) return NextResponse.json([]);
  const ids = cots.map((c) => c.id);

  const [regs, comps, recsPorCot, cfg] = await Promise.all([
    db
      .select({
        id: registros.id,
        cotizacionId: registros.cotizacionId,
        estado: registros.estado,
        enProduccion: registros.enProduccion,
        medico: registros.medico,
        matricula: registros.matricula,
        entregadoEn: registros.entregadoEn,
        archivado: registros.archivado,
        recetaId: registros.recetaId,
      })
      .from(registros)
      .where(inArray(registros.cotizacionId, ids)),
    db
      .select({ id: comprobantes.id, cotizacionId: comprobantes.cotizacionId, nombreArchivo: comprobantes.nombreArchivo })
      .from(comprobantes)
      .where(inArray(comprobantes.cotizacionId, ids)),
    db
      .select({ id: recetas.id, cotizacionId: recetas.cotizacionId, createdAt: recetas.createdAt })
      .from(recetas)
      .where(inArray(recetas.cotizacionId, ids)),
    cargarConfig(),
  ]);

  const filas = cots.map((cot) => {
    const misRegs = regs.filter((r) => r.cotizacionId === cot.id);
    const misComps = comps.filter((c) => c.cotizacionId === cot.id);

    // Receta: la vinculada a la cotización (la más nueva si hay varias) o,
    // si no, la que traen sus registros desde el Lector.
    const recetaDeCot = recsPorCot
      .filter((r) => r.cotizacionId === cot.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const recetaId = recetaDeCot?.id ?? misRegs.find((r) => r.recetaId != null)?.recetaId ?? null;

    // Médico: el primero que tenga alguno de sus registros.
    const conMedico = misRegs.find((r) => r.medico);

    // Envío incluido en el cobro: columna explícita si está; si no, se
    // deriva del snapshot de la cotización (parametros.envio + los costos
    // congelados al cotizar; config vigente como último recurso).
    const params = (cot.parametros ?? {}) as Record<string, unknown>;
    const envioSnap = params.envio === 'corto' || params.envio === 'largo' ? (params.envio as Envio) : 'sin';
    const cfgSnap = (params.config ?? {}) as Record<string, unknown>;
    const cfgParaEnvio = {
      ...cfg,
      envioCorto: Number.isFinite(Number(cfgSnap.envioCorto)) ? Number(cfgSnap.envioCorto) : cfg.envioCorto,
      envioLargo: Number.isFinite(Number(cfgSnap.envioLargo)) ? Number(cfgSnap.envioLargo) : cfg.envioLargo,
    };
    const envioMonto = cot.envioMonto ?? montoEnvio(envioSnap, cfgParaEnvio);

    // Medio de pago detectado en el historial (para pedidos anteriores a
    // esta versión, donde el detalle quedó solo como texto del historial).
    const historial = cot.historial ?? [];
    const entradaMp = [...historial].reverse().find((h) => (h.motivo ?? '').includes('PAGADA por Mercado Pago'));
    const medioDetectado = entradaMp ? entradaMp.motivo : '';

    return {
      id: cot.id,
      paciente: cot.paciente,
      dni: cot.dni,
      pagadaEn: cot.pagadaEn,
      createdAt: cot.createdAt,
      medico: conMedico?.medico ?? '',
      matricula: conMedico?.matricula ?? '',
      celular: cot.celular,
      direccionEnvio: cot.direccionEnvio,
      medioPago: cot.medioPago,
      medioDetectado,
      montoCobrado: cot.montoCobrado,
      precioTotal: cot.precioTotal,
      precioTransferencia: cot.precioTransferencia,
      envioMonto,
      envioExplicito: cot.envioMonto != null,
      comprobantes: misComps.map((c) => ({ id: c.id, nombreArchivo: c.nombreArchivo })),
      recetaId,
      registros: misRegs
        .filter((r) => !r.archivado)
        .map((r) => ({
          id: r.id,
          estado: LABEL_ESTADO[estadoPT(r)],
          entregado: r.entregadoEn != null,
        })),
      archivados: misRegs.filter((r) => r.archivado).length,
    };
  });

  return NextResponse.json(filas);
}
