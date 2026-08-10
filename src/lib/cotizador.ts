import type { Cotizacion, LineaCotizacion, Registro } from '@/db/schema';

// ---------------------------------------------------------------
// Cotizador (branch atencion-cliente).
//
// ETAPA ACTUAL: la estructura y el flujo completo (estados, historial,
// comprobantes, mensaje) están funcionando, y el PRECIO se carga a mano —
// igual que hoy lo hace Tomi con el Excel al lado. El motor que replica el
// Excel "NUEVO COTIZADOR" (costos por droga, cápsulas, envase, tiempo
// operador, markup, envíos) se enchufa acá cuando terminemos de portarlo:
// la única función a reemplazar es calcularLineas() y los parámetros
// pasan a leerse de la tabla de costos que administra el Admin.
// ---------------------------------------------------------------

// % de descuento por pago por transferencia (el que usa el mensaje actual
// de WhatsApp). Pasa a ser configurable desde la pantalla del cotizador
// cuando esté la tabla de parámetros.
export const DESCUENTO_TRANSFERENCIA = 0.15;

export function redondearPeso(v: number): number {
  return Math.round(v);
}

export function precioTransferenciaSugerido(precioTotal: number | null): number | null {
  if (precioTotal == null) return null;
  return redondearPeso(precioTotal * (1 - DESCUENTO_TRANSFERENCIA));
}

// Armar las líneas de una cotización a partir de los registros PT creados
// por el Lector: una línea por fórmula, con la composición copiada (la
// cotización es un snapshot: si después borran el registro, la línea queda).
// Los costos quedan en null hasta que el motor del Excel esté portado.
export function lineasDesdeRegistros(regs: Registro[]): LineaCotizacion[] {
  return regs.map((r) => ({
    registroId: r.id,
    titulo: r.tituloFormula || '',
    nCapsulas: r.capsulasTotales ?? null,
    activos: (r.formula ?? []).map((a) => ({
      nombre: a.activo,
      dosis: a.dosis,
      unidad: a.unidad,
      costo: null,
    })),
    costoCapsulas: null,
    costoEnvase: null,
    costoTiempo: null,
    costoExtra: null,
    precioSugerido: null,
    precioComercial: null,
  }));
}

export function formatoPeso(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + Math.round(v).toLocaleString('es-AR');
}

// "miércoles 12 de agosto" a partir de un deadline YYYY-MM-DD.
export function fechaLargaES(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const f = new Date(Date.UTC(y, m - 1, d));
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${dias[f.getUTCDay()]} ${d} de ${meses[m - 1]}`;
}

function primerNombre(paciente: string): string {
  const limpio = (paciente || '').trim();
  if (!limpio) return '';
  // "APELLIDO, NOMBRE" → NOMBRE; si no hay coma, la primera palabra.
  const partes = limpio.includes(',') ? limpio.split(',')[1] : limpio.split(/\s+/)[0];
  const nombre = (partes || '').trim().split(/\s+/)[0] || '';
  return nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
}

// Mensaje de WhatsApp listo para copiar y pegar.
// ⚠️ PLANTILLA PROVISORIA: basada en el mensaje real que usa Tomi hoy (el
// ejemplo "Nil" del backlog). Se reemplaza por la versión definitiva cuando
// Tomi pase el mensaje actual y los problemas que quiere resolver.
export function mensajeWhatsApp(cot: Cotizacion, regsDeLaCotizacion: Registro[]): string {
  const nombre = primerNombre(cot.paciente) || cot.paciente || '';
  const totalCapsulas = cot.lineas.reduce((acc, l) => acc + (l.nCapsulas ?? 0), 0);
  const nActivos = new Set(cot.lineas.flatMap((l) => l.activos.map((a) => a.nombre.toLowerCase()))).size;
  const deadline = regsDeLaCotizacion
    .map((r) => r.deadline)
    .filter(Boolean)
    .sort()
    .pop();

  const lineas: string[] = [];
  lineas.push(`${nombre}, ¡acá va tu cotización! 🩵`);
  const desc = [
    nActivos ? `${nActivos} activo${nActivos !== 1 ? 's' : ''}` : '',
    totalCapsulas ? `${totalCapsulas} cápsulas` : '',
  ].filter(Boolean).join(', ');
  lineas.push(
    `Tu tratamiento personalizado${desc ? ` (${desc})` : ''} tiene un valor de ${formatoPeso(cot.precioTotal)}`
  );
  lineas.push('Tenés dos formas de pagarlo 👇');
  lineas.push(`💳 3 cuotas sin interés → ${formatoPeso(cot.precioTotal)}`);
  if (cot.linkPago) lineas.push(cot.linkPago);
  const pct = Math.round(DESCUENTO_TRANSFERENCIA * 100);
  lineas.push(
    `✅ Transferencia al alias pill.ar con un ${pct}% de descuento → ${formatoPeso(cot.precioTransferencia ?? precioTransferenciaSugerido(cot.precioTotal))}`
  );
  lineas.push('(PILL.AR S.A. · CUIT 30-71816734-1)');
  lineas.push('Cuando lo abones, mandame el comprobante y arrancamos con la producción 🚀');
  if (deadline) lineas.push(`Calculamos que estaría listo para el ${fechaLargaES(deadline)}.`);
  lineas.push(`¡Gracias${nombre ? `, ${nombre}` : ''}! 🩵`);
  return lineas.join('\n');
}
