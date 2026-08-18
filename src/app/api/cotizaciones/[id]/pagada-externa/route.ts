import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { db } from '@/db';
import { cotizaciones, registros, type VersionCotizacion } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { formatoPeso } from '@/lib/cotizador';
import { cargarConfig } from '@/lib/cotizadorServer';

// Aviso de PAGO APROBADO desde el checkout propio (webhook de Mercado
// Pago → pillar-checkout → acá). Autenticado con el secreto compartido
// (header x-checkout-secret), NO con sesión: lo llama una máquina.
// Hace lo mismo que el botón ✅ PAGADO — marca pagada, deja historial con
// los datos del pago y libera las fórmulas retenidas a Pendientes — tal
// como lo decidió Tomi: pago por MP = automático; transferencias siguen
// manuales.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const secreto = process.env.CHECKOUT_SECRET ?? '';
  const recibido = req.headers.get('x-checkout-secret') ?? '';
  const a = Buffer.from(secreto);
  const b = Buffer.from(recibido);
  if (!secreto || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const id = Number(params.id);
  const [cot] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cot) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  // 409 para los reintentos del webhook: ya está hecha, todo bien.
  if (cot.estadoPago === 'pagada') {
    return NextResponse.json({ error: 'Ya estaba pagada' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const monto = Number(body?.monto);
  const detalle = [
    '💳 PAGADA por Mercado Pago (checkout)',
    body?.pagoId ? `pago #${body.pagoId}` : null,
    Number.isFinite(monto) ? formatoPeso(monto) : null,
    body?.cuotas && Number(body.cuotas) > 1 ? `${body.cuotas} cuotas` : null,
    body?.metodo ? String(body.metodo) : null,
    body?.envio ? `envío: ${body.envio}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const ahora = new Date();
  const entrada: VersionCotizacion = {
    fecha: ahora.toISOString(),
    usuario: 'Mercado Pago',
    precioTotal: cot.precioTotal,
    precioTransferencia: cot.precioTransferencia,
    motivo: detalle,
  };

  // Seguimiento (v2.2.0): además del historial-texto, los datos del pago
  // quedan estructurados para la solapa 📒 — monto real cobrado, medio,
  // envío elegido en el checkout y (cuando el checkout los pida) celular
  // y dirección de envío del paciente.
  const cuotasN = Number(body?.cuotas);
  const medioPago = [
    'Mercado Pago',
    Number.isFinite(cuotasN) && cuotasN > 1 ? `${cuotasN} cuotas` : null,
    body?.metodo ? String(body.metodo).slice(0, 40) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // Envío en $: explícito si el checkout lo manda; si no, se mapea el
  // NOMBRE que ya viene en el aviso ('colegio' gratis / 'cordoba' /
  // 'fuera') con los costos de la config del cotizador.
  const envioMontoBody = Number(body?.envioMonto);
  let envioMonto: number | null =
    Number.isFinite(envioMontoBody) && envioMontoBody >= 0 ? envioMontoBody : null;
  const envioNombre = String(body?.envio ?? '');
  if (envioMonto === null && ['colegio', 'cordoba', 'fuera'].includes(envioNombre)) {
    const cfg = await cargarConfig();
    envioMonto = envioNombre === 'cordoba' ? cfg.envioCorto : envioNombre === 'fuera' ? cfg.envioLargo : 0;
  }
  const celular = typeof body?.celular === 'string' ? body.celular.trim().slice(0, 60) : '';
  const direccion = typeof body?.direccion === 'string' ? body.direccion.trim().slice(0, 300) : '';

  const [cotActualizada] = await db
    .update(cotizaciones)
    .set({
      estadoPago: 'pagada',
      pagadaEn: ahora,
      historial: [...(cot.historial ?? []), entrada],
      ...(Number.isFinite(monto) ? { montoCobrado: monto } : {}),
      medioPago,
      ...(envioMonto !== null ? { envioMonto } : {}),
      ...(celular ? { celular } : {}),
      ...(direccion ? { direccionEnvio: direccion } : {}),
      updatedAt: ahora,
    })
    .where(eq(cotizaciones.id, id))
    .returning();

  const liberados = await db
    .update(registros)
    .set({ estado: 'pendiente', enProduccion: false, updatedAt: ahora })
    .where(and(eq(registros.cotizacionId, id), eq(registros.estado, 'pendiente_pago')))
    .returning({ id: registros.id });

  return NextResponse.json({ cotizacion: cotActualizada, liberados: liberados.length });
}
