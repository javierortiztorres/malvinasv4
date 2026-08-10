import type { CapaTinta } from '@/db/schema';
import type { Rol } from '@/lib/session';

// Navegación por rol (B-30b). El ruteo Pendientes↔Pre-producción↔En
// producción es de B-31: Pre-producción existe pero por ahora siempre
// queda vacía, no hay lógica que mueva registros ahí.
export type TabDef = { id: string; label: string };

// Agenda primera en los perfiles de área; en Admin va primero el Lector
// (decisión de Tomi, 10-ago). Admin ve las dos vistas de Agenda separadas
// por tipo (mismo filtro PT/PI que ya usan Impresión/Formulación) en vez
// de la vieja vista combinada.
const TABS_ADMIN: TabDef[] = [
  { id: 'lector', label: '📄 Lector de recetas' },
  { id: 'cotizaciones', label: '💰 Cotizaciones' },
  { id: 'agenda-pt', label: '🗓️ Agenda PT' },
  { id: 'agenda-pi', label: '🗓️ Agenda PI' },
  { id: 'agenda-ac', label: '🗓️ Agenda AC' },
  { id: 'prod', label: '🖨️ En producción' },
  { id: 'preprod', label: '🧱 Pre-producción' },
  { id: 'pt', label: '📋 Pendientes' },
  { id: 'pi', label: '🧪 Producto Intermedio' },
  { id: 'neces', label: '📊 Necesidades' },
  { id: 'terminados', label: '✅ Terminados' },
  { id: 'estadistica', label: '📈 Estadística' },
  { id: 'gestion', label: '🗂️ Gestión' },
  { id: 'cotizador', label: '⚙️ Cotizador' },
  { id: 'usuarios', label: '👤 Usuarios' },
];

const TABS_IMPRESION: TabDef[] = [
  { id: 'agenda', label: '🗓️ Agenda' },
  { id: 'prod', label: '🖨️ En producción' },
  { id: 'preprod', label: '🧱 Pre-producción' },
  { id: 'terminados', label: '✅ Terminados' },
];

const TABS_FORMULACION: TabDef[] = [
  { id: 'agenda', label: '🗓️ Agenda' },
  { id: 'pi', label: '🧪 Producto Intermedio' },
  { id: 'terminados', label: '✅ Terminados' },
];

// Atención al cliente (branch atencion-cliente): recibe la receta, la lee
// con el MISMO lector, cotiza, gestiona el cobro y la ENTREGA. Lo que crea
// entra en "Pendiente de pago" y recién pasa a Pendientes (producción) al
// subir el comprobante o con el botón de enviar sin pago. Su Agenda va
// primera (regla 12: perfiles de área arrancan en la Agenda).
const TABS_ATENCION: TabDef[] = [
  { id: 'agenda-ac', label: '🗓️ Agenda' },
  { id: 'lector', label: '📄 Lector de recetas' },
  { id: 'cotizaciones', label: '💰 Cotizaciones' },
];

export const TABS_POR_ROL: Record<Rol, TabDef[]> = {
  admin: TABS_ADMIN,
  impresion: TABS_IMPRESION,
  formulacion: TABS_FORMULACION,
  atencion: TABS_ATENCION,
};

// Firma de una capa sin `ref` (posición, se recalcula al reordenar) ni
// `lote` (el único otro campo editable para Impresión). Si dos arreglos de
// capas tienen el mismo multiset de firmas, la única diferencia posible
// entre ellos es el orden y/o el lote de cada capa.
function firmaCapa(c: CapaTinta): string {
  const { ref, lote, ...resto } = c;
  return JSON.stringify(resto);
}

export function capasSoloOrdenYLoteCambiaron(original: CapaTinta[], nuevo: unknown): boolean {
  if (!Array.isArray(original) || !Array.isArray(nuevo)) return false;
  if (original.length !== nuevo.length) return false;
  try {
    const firmasOriginal = original.map(firmaCapa).sort();
    const firmasNuevo = (nuevo as CapaTinta[]).map(firmaCapa).sort();
    return JSON.stringify(firmasOriginal) === JSON.stringify(firmasNuevo);
  } catch {
    return false;
  }
}
