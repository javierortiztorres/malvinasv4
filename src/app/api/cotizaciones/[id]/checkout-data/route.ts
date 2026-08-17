import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { cotizaciones, registros } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { primerNombre } from '@/lib/cotizador';
import { cargarConfig } from '@/lib/cotizadorServer';
import { firmaCortaValida } from '@/lib/checkoutFirma';

// Datos de una cotización para el CHECKOUT PROPIO, pedidos con el LINK
// CORTO (pedido de Tomi 14-ago: "el link es SUPER largo"): la URL lleva
// solo /c/{id}/{t} y el checkout viene acá a buscar los datos vigentes.
// t = HMAC-SHA256("c|{id}") con el secreto compartido — sin la firma no
// hay datos, y conocer el nº de cotización no alcanza para fabricarla.
// Ventaja extra del link corto: los precios salen SIEMPRE de la
// cotización vigente (si se edita después de mandar el link, el paciente
// ve lo actual), y si ya está paga el checkout lo sabe y no deja pagar
// dos veces. Ruta PÚBLICA (sin sesión): pasa por el middleware con regex,
// igual que pagada-externa.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const secreto = process.env.CHECKOUT_SECRET ?? '';
  const t = req.nextUrl.searchParams.get('t') ?? '';
  const id = Number(params.id);
  if (!secreto || !Number.isFinite(id)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!firmaCortaValida(id, t, secreto)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const [cot] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cot) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  if (cot.precioTotal == null || cot.precioTransferencia == null) {
    return NextResponse.json({ error: 'La cotización todavía no tiene precio' }, { status: 409 });
  }

  const [cfg, regs] = await Promise.all([
    cargarConfig(),
    db.select({ deadline: registros.deadline }).from(registros).where(eq(registros.cotizacionId, id)),
  ]);
  const deadline = regs.map((r) => r.deadline).filter(Boolean).sort().pop();

  return NextResponse.json({
    v: 1,
    o: cot.id,
    n: primerNombre(cot.paciente) || cot.paciente || '',
    tr: Math.round(cot.precioTransferencia),
    li: Math.round(cot.precioTotal),
    ec: cfg.envioCorto,
    el: cfg.envioLargo,
    ...(deadline ? { d: deadline } : {}),
    pagada: cot.estadoPago === 'pagada',
  });
}
