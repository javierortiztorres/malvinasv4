import type { CapaTinta } from '@/db/schema';
import type { Rol } from '@/lib/session';

// Navegación por rol (B-30b). El ruteo Pendientes↔Pre-producción↔En
// producción es de B-31: Pre-producción existe pero por ahora siempre
// queda vacía, no hay lógica que mueva registros ahí.
export type TabDef = { id: string; label: string };

const TABS_ADMIN: TabDef[] = [
  { id: 'agenda', label: '🗓️ Agenda' },
  { id: 'lector', label: '📄 Lector de recetas' },
  { id: 'prod', label: '🖨️ En producción' },
  { id: 'pt', label: '📋 Pendientes' },
  { id: 'preprod', label: '🧱 Pre-producción' },
  { id: 'pi', label: '🧪 Producto Intermedio' },
  { id: 'neces', label: '📊 Necesidades' },
  { id: 'terminados', label: '✅ Terminados' },
  { id: 'estadistica', label: '📈 Estadística' },
  { id: 'gestion', label: '🗂️ Gestión' },
  { id: 'usuarios', label: '👤 Usuarios' },
];

const TABS_IMPRESION: TabDef[] = [
  { id: 'agenda', label: '🗓️ Agenda' },
  { id: 'prod', label: '🖨️ En producción' },
  { id: 'preprod', label: '🧱 Pre-producción' },
  { id: 'terminados', label: '✅ Terminados' },
];

const TABS_FORMULACION: TabDef[] = [
  { id: 'pi', label: '🧪 Producto Intermedio' },
  { id: 'agenda', label: '🗓️ Agenda' },
  { id: 'terminados', label: '✅ Terminados' },
];

export const TABS_POR_ROL: Record<Rol, TabDef[]> = {
  admin: TABS_ADMIN,
  impresion: TABS_IMPRESION,
  formulacion: TABS_FORMULACION,
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
