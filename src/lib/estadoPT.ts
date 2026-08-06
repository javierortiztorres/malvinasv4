import type { Registro } from '@/db/schema';

// ---------------------------------------------------------------
// Máquina de estados única de PT (B-31): Pendientes → Pre-producción →
// En producción → Terminado, con retroceso manual entre las 3 primeras.
//
// El campo `registros.estado` en la base sigue siendo texto libre (como ya
// era). No hay migración de datos masiva: las filas viejas ('en_proceso' +
// el booleano en_produccion) se siguen leyendo bien acá abajo, y cada fila
// "migra" sola, en el momento, la primera vez que se mueve con los
// controles nuevos — así no hay ventana donde el código viejo (mientras el
// PR no esté mergeado/desplegado) se rompa por datos reescritos a mano.
// ---------------------------------------------------------------

export type EstadoActivo = 'pendiente' | 'pre_produccion' | 'en_produccion';
export type EstadoPT = EstadoActivo | 'terminado';

const RANGO: Record<EstadoActivo, number> = { pendiente: 0, pre_produccion: 1, en_produccion: 2 };

export const ESTADOS_ACTIVOS: EstadoActivo[] = ['pendiente', 'pre_produccion', 'en_produccion'];

export const LABEL_ESTADO: Record<EstadoPT, string> = {
  pendiente: '📋 Pendientes',
  pre_produccion: '🧱 Pre-producción',
  en_produccion: '🖨️ En producción',
  terminado: '✅ Terminado',
};

// Único punto que decide en qué de los 4 estados está un registro PT.
// Reconoce tanto los valores nuevos y explícitos como los viejos
// ('en_proceso' + en_produccion boolean, o cualquier valor desconocido).
export function estadoPT(r: Pick<Registro, 'estado' | 'enProduccion'>): EstadoPT {
  if (r.estado === 'terminado') return 'terminado';
  if (r.estado === 'pre_produccion') return 'pre_produccion';
  if (r.estado === 'pendiente') return 'pendiente';
  if (r.estado === 'en_produccion') return 'en_produccion';
  // Legado: 'en_proceso' (o cualquier otro valor viejo) — el booleano decide.
  return r.enProduccion ? 'en_produccion' : 'pendiente';
}

export function esAvance(actual: EstadoActivo, destino: EstadoActivo): boolean {
  return RANGO[destino] > RANGO[actual];
}

// Reglas de movimiento manual entre Pendientes ↔ Pre-producción ↔ En
// producción (B-31). Terminado tiene su propio flujo aparte (marcar
// terminado / reabrir), no pasa por acá.
//
// - Admin: cualquier movimiento, en cualquier sentido.
// - Impresión: avanza Pre-producción→Producción (lo que ya ve en su menú);
//   retrocede Producción→Pre-producción (normal, mismo par de solapas) y,
//   más ampliamente, Pre-producción→Pendientes (aunque no tenga esa solapa)
//   para corregir un error.
// - Formulación: solo el retroceso especial Producción→Pre-producción,
//   cuando detecta un problema con el Producto Intermedio (ver el botón de
//   devolución automática por lote en la pantalla de Producto Intermedio).
export function puedeTransicionar(rol: string, actual: EstadoActivo, destino: EstadoActivo): boolean {
  if (actual === destino) return false;
  if (rol === 'admin') return true;
  if (rol === 'impresion') {
    if (actual === 'pre_produccion' && destino === 'en_produccion') return true;
    if (actual === 'en_produccion' && destino === 'pre_produccion') return true;
    if (actual === 'pre_produccion' && destino === 'pendiente') return true;
    return false;
  }
  if (rol === 'formulacion') {
    return actual === 'en_produccion' && destino === 'pre_produccion';
  }
  return false;
}

export function destinosDisponibles(rol: string, actual: EstadoActivo): EstadoActivo[] {
  return ESTADOS_ACTIVOS.filter((d) => puedeTransicionar(rol, actual, d));
}

// Qué solapa muestra cada estado activo (null para terminado: tiene su
// propia solapa aparte, no navega por acá).
const TAB_POR_ESTADO: Record<EstadoActivo, string> = {
  pendiente: 'pt',
  pre_produccion: 'preprod',
  en_produccion: 'prod',
};
export function tabDeEstadoPT(est: EstadoPT): string | null {
  return est === 'terminado' ? null : TAB_POR_ESTADO[est];
}

// Formato datetime-local (YYYY-MM-DDTHH:mm), hora de Argentina (Córdoba,
// UTC-3) — mismo formato que ya usan a mano los campos "Inicio producción" /
// "Fin producción" del editor, para que auto-completado y edición manual
// sean intercambiables.
export function datetimeLocalDeFecha(fecha: Date | string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const partes = Object.fromEntries(fmt.formatToParts(new Date(fecha)).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

export function ahoraDatetimeLocal(): string {
  return datetimeLocalDeFecha(new Date());
}
