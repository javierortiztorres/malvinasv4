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

// ---------------------------------------------------------------
// Agenda de Atención al cliente: estado de ENTREGA de un pedido (el grupo
// de fórmulas de una receta), pedido por Tomi 10-ago:
//   rojo = pendientes · amarillo = pre-producción/producción ·
//   verde = terminado (para entregar) · azul = ENTREGADO (lo marca
//   Atención) · gris = no se puede producir (cómo se marca queda para
//   definir con Formulación/Impresión — el estado ya se muestra).
// ---------------------------------------------------------------

export type EstadoEntregaAC = 'rojo' | 'amarillo' | 'verde' | 'azul' | 'gris';

export function estadoGrupoAC(regs: Pick<Registro, 'estado' | 'enProduccion' | 'entregadoEn' | 'noProducibleMotivo'>[]): EstadoEntregaAC {
  if (regs.length === 0) return 'gris';
  if (regs.some((r) => r.noProducibleMotivo)) return 'gris';
  if (regs.every((r) => r.entregadoEn != null)) return 'azul';
  const estados = regs.map((r) => estadoDeRegistro(r));
  if (estados.every((e) => e === 'terminado')) return 'verde';
  if (estados.some((e) => e === 'pendiente' || e === 'pendiente_pago')) return 'rojo';
  return 'amarillo';
}

// Copia mínima de estadoPT() para no importar estadoPT.ts acá (evita
// dependencia circular con schema): reconoce los mismos valores.
function estadoDeRegistro(r: Pick<Registro, 'estado' | 'enProduccion'>): string {
  if (r.estado === 'terminado') return 'terminado';
  if (r.estado === 'pendiente_pago') return 'pendiente_pago';
  if (r.estado === 'pre_produccion') return 'pre_produccion';
  if (r.estado === 'pendiente') return 'pendiente';
  if (r.estado === 'en_produccion') return 'en_produccion';
  return r.enProduccion ? 'en_produccion' : 'pendiente';
}

export const CLASE_AC: Record<EstadoEntregaAC, string> = {
  rojo: 'bg-red-100 text-red-700 border-red-300',
  amarillo: 'bg-amber-100 text-amber-800 border-amber-300',
  verde: 'bg-green-100 text-green-800 border-green-300',
  azul: 'bg-sky-100 text-sky-800 border-sky-300',
  gris: 'bg-slate-200 text-slate-600 border-slate-400',
};

export const LABEL_AC: Record<EstadoEntregaAC, string> = {
  rojo: '🔴 Pendiente',
  amarillo: '🟡 En producción',
  verde: '🟢 Terminado — para entregar',
  azul: '🔵 Entregado',
  gris: '⚪ No se puede producir',
};

// Mensajes de seguimiento por estado (⚠️ PROVISORIOS — se ajustan con
// Tomi; el de producción sale de su ejemplo del 10-ago).
export function mensajeSeguimiento(estado: EstadoEntregaAC, paciente: string): string | null {
  const n = primerNombre(paciente);
  if (estado === 'amarillo') {
    return `${n}, ¡me alegra contarte que tu pedido ya está en producción! 🚀 Te aviso apenas esté listo. 🩵`;
  }
  if (estado === 'verde') {
    return `${n}, ¡tu pedido ya está listo! 🎉 Decime cuándo te queda cómodo coordinar la entrega. 🩵`;
  }
  if (estado === 'azul') {
    return `${n}, ¡gracias por confiar en PILL.AR! 🩵 Cualquier cosa que necesites sobre tu tratamiento, escribime por acá.`;
  }
  return null;
}

// Mensaje de WhatsApp listo para copiar y pegar.
// ⚠️ PLANTILLA PROVISORIA v2 (10-ago), rediseñada contra los dos problemas
// que contó Tomi: (1) los pacientes transfieren el precio total sin ver el
// descuento → la opción transferencia va PRIMERA, en negrita de WhatsApp y
// con el ahorro en pesos, y el precio "total" queda pegado a las cuotas;
// (2) preguntan "¿cuándo está listo?" → la fecha va en su propia línea, en
// negrita y con emoji. Cuando esté la web del CEO (envíos a domicilio /
// colegio de farmacéuticos, gratis >$200.000), el link entra acá.
export function mensajeWhatsApp(cot: Cotizacion, regsDeLaCotizacion: Registro[]): string {
  const nombre = primerNombre(cot.paciente) || cot.paciente || '';
  const totalCapsulas = cot.lineas.reduce((acc, l) => acc + (l.nCapsulas ?? 0), 0);
  const nActivos = new Set(cot.lineas.flatMap((l) => l.activos.map((a) => a.nombre.toLowerCase()))).size;
  const deadline = regsDeLaCotizacion
    .map((r) => r.deadline)
    .filter(Boolean)
    .sort()
    .pop();

  const total = cot.precioTotal;
  const transf = cot.precioTransferencia ?? precioTransferenciaSugerido(total);
  const ahorro = total != null && transf != null ? total - transf : null;
  const cuota = total != null ? redondearPeso(total / 3) : null;
  const pct = Math.round(DESCUENTO_TRANSFERENCIA * 100);
  const desc = [
    nActivos ? `${nActivos} activo${nActivos !== 1 ? 's' : ''}` : '',
    totalCapsulas ? `${totalCapsulas} cápsulas` : '',
  ].filter(Boolean).join(', ');

  const lineas: string[] = [];
  lineas.push(`${nombre}, ¡acá va tu cotización! 🩵`);
  lineas.push(`Tu tratamiento personalizado${desc ? ` (${desc})` : ''} tiene dos formas de pago 👇`);
  lineas.push('');
  lineas.push(`✅ *Transferencia: ${formatoPeso(transf)}* (te ahorrás ${formatoPeso(ahorro)} — ${pct}% OFF)`);
  lineas.push('→ alias *pill.ar* (PILL.AR S.A. · CUIT 30-71816734-1)');
  lineas.push('');
  lineas.push(`💳 3 cuotas sin interés de ${formatoPeso(cuota)} (total ${formatoPeso(total)})`);
  if (cot.linkPago) lineas.push(cot.linkPago);
  lineas.push('');
  if (deadline) lineas.push(`📦 *Fecha estimada de entrega: ${fechaLargaES(deadline)}*`);
  lineas.push('Cuando lo abones, mandame el comprobante y arrancamos con la producción 🚀');
  lineas.push(`¡Gracias${nombre ? `, ${nombre}` : ''}! 🩵`);
  return lineas.join('\n');
}
