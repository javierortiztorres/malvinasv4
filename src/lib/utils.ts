import type { ActivoFormula } from '@/db/schema';
import { PREFIJO_LOTE_PI } from './config';

// ---- Fechas ----
export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function sumarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1 + meses, d));
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
  const hoy = new Date();
  const a = Date.UTC(y, m - 1, d);
  const b = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((a - b) / 86400000);
}

// datetime-local: 2026-07-15T09:20 → 15/07/26 - 09:20
export function fechaHoraAR(v: string): string {
  if (!v) return '';
  const [f, h] = v.split('T');
  return h ? `${fechaAR(f)} - ${h}` : fechaAR(f);
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
