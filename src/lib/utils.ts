import type { ActivoFormula, RegistroPi } from '@/db/schema';
import { PREFIJO_LOTE_PI } from './config';
import { fmtPct } from './engine';

// ---- Fechas ----
// Fecha del día en Argentina (Córdoba, UTC-3), no la del servidor (Vercel corre en UTC).
export function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Cordoba' });
}

export function sumarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const totalMeses = m - 1 + meses;
  const targetYear = y + Math.floor(totalMeses / 12);
  const targetMes = ((totalMeses % 12) + 12) % 12;
  const ultimoDiaDelMes = new Date(Date.UTC(targetYear, targetMes + 1, 0)).getUTCDate();
  const f = new Date(Date.UTC(targetYear, targetMes, Math.min(d, ultimoDiaDelMes)));
  return f.toISOString().slice(0, 10);
}

// Formato argentino corto: 2026-07-15 → 15/07/26
export function fechaAR(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}

// Días de hoy hasta una fecha ISO (0 = hoy, negativo = vencida)
export function diasHasta(iso: string): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!d) return null;
  const [hy, hm, hd] = hoyISO().split('-').map(Number);
  const a = Date.UTC(y, m - 1, d);
  const b = Date.UTC(hy, hm - 1, hd);
  return Math.round((a - b) / 86400000);
}

// Fecha (ISO, "YYYY-MM-DD") en la que se considera PRODUCIDO un registro,
// para reportes/estadística. Mismo orden de precedencia que ya usa Terminados
// para ordenar por terminación (fechaHoraFin → fechaElab → createdAt):
// updatedAt NO es confiable acá (sin $onUpdate en el esquema).
export function fechaProduccion(r: { fechaHoraFin: string; fechaElab: string; createdAt: Date | string }): string {
  const iso = r.fechaHoraFin || r.fechaElab || (r.createdAt ? new Date(r.createdAt).toISOString() : '');
  return iso ? iso.slice(0, 10) : '';
}

// datetime-local: 2026-07-15T09:20 → 15/07/26 - 09:20
export function fechaHoraAR(v: string): string {
  if (!v) return '';
  const [f, h] = v.split('T');
  return h ? `${fechaAR(f)} - ${h}` : fechaAR(f);
}

// % listo para mostrar junto al nombre de un PI (ej. "Minoxidil · 5%"):
// null si no hay dato, para que el llamador lo omita sin mostrar "0%"/"—".
// Único punto que formatea este % "opcional" — no reimplementar el guard
// null/0 en cada componente.
export function fmtPctOpcional(c: number | null | undefined): string | null {
  if (c == null || typeof c !== 'number' || !Number.isFinite(c) || c === 0) return null;
  return fmtPct(c);
}

// Búsqueda sin distinción de mayúsculas ni tildes, contra varios campos
export function coincideFiltro(filtro: string, ...campos: (string | number | null | undefined)[]): boolean {
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const f = norm(filtro.trim());
  if (!f) return true;
  return campos.some((c) => c != null && norm(String(c)).includes(f));
}

// ---- Lotes ----
export function formatoLote(prefijo: string, numero: number | null): string {
  if (numero == null) return `${prefijo} / P—`;
  return `${prefijo} / P${String(numero).padStart(3, '0')}`;
}

export function formatoLotePI(poe: string, numero: number | null): string {
  const p = numero == null ? 'P—' : `P${String(numero).padStart(3, '0')}`;
  return `${PREFIJO_LOTE_PI}/${poe || 'FPI.—'}/${p}`;
}

// Criterio único de "PI pendiente": el mismo que usa la solapa Producto
// Intermedio (page.tsx). Cualquier otra pantalla que necesite la misma
// lista (ej. la planilla de pesadas) debe reusar esto, no reimplementarlo.
export function esPiPendiente(r: Pick<RegistroPi, 'estado'>): boolean {
  return r.estado === 'en_proceso';
}

// ---- Dosis por cápsula (para el rótulo y el documento) ----
export function dosisPorCapsula(a: ActivoFormula, capsulasPorToma: number): string {
  const v = a.dosis / (capsulasPorToma || 1);
  const redondeado = Math.round(v * 1000) / 1000;
  return `${redondeado} ${a.unidad}`;
}

// ---- Cálculo de cápsulas totales ----
// 60 días con 1 cápsula/toma = 60 cápsulas; con 2 por toma = 120.
export function capsulasSugeridas(dias: number | null, capsulasPorToma: number): number | null {
  if (!dias) return null;
  return dias * (capsulasPorToma || 1);
}

// ---- Roles canónicos de operador ----
// Únicos literales de rol del sistema: los usan los selects de operador/
// supervisor (PT y PI) y el catálogo de operadores en Gestión.
export const ROL_OPERADOR_PRODUCE = 'produce';
export const ROL_OPERADOR_REVISA = 'revisa';
export const ROLES_OPERADOR = [ROL_OPERADOR_PRODUCE, ROL_OPERADOR_REVISA];

// ---- Operadores por rol, con fallback ----
// Si un operador tiene el rol con typo o mayúsculas en la base, igual entra
// acá (comparación normalizada). Si el filtro queda VACÍO (ningún operador
// con ese rol, ni siquiera normalizado), se devuelven todos: un typo en la
// base nunca más deja un select sin opciones.
export function operadoresPorRol<T extends { rol?: string | null }>(operadores: T[], rol: string): T[] {
  const filtrados = operadores.filter((o) => (o.rol ?? '').trim().toLowerCase() === rol);
  return filtrados.length > 0 ? filtrados : operadores;
}
