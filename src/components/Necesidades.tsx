'use client';
import { Fragment, useMemo, useState } from 'react';
import type { Registro, RegistroPi, MateriaPrima } from '@/db/schema';
import type { Catalogos } from '@/app/page';
import { hoyISO, sumarMeses, formatoLote, formatoLotePI, fechaAR, fechaProduccion } from '@/lib/utils';
import { estadoPT, LABEL_ESTADO, type EstadoActivo } from '@/lib/estadoPT';
import { MESES_VENCIMIENTO } from '@/lib/config';
import {
  extrusionCapa, pesadasPI, limpiarNombreTinta, fmtG, fmtMl, fmtPct,
  MERMA_PI, activoConMerma,
} from '@/lib/engine';

// ---------------------------------------------------------------------
// 📦 Stock/autonomía de PI (B-34) — parche de VISIBILIDAD sobre datos que
// ya existen (no hay tabla de stock real todavía). "Producido histórico"
// = suma de jeringas×volumenJeringaMl de los lotes de PI TERMINADOS de esa
// tinta (mismo criterio que usa 📈 Estadística para "mL producidos").
// "Consumido histórico" = Σ extrusionCapa()×cápsulas de todos los PT
// TERMINADOS cuyas capas referencian esa tinta (mismo cálculo de mL que ya
// usa la necesidad en vivo de acá abajo, aplicado a TODO el historial en
// vez de solo lo activo). Stock aprox = producido − consumido, nunca < 0.
// Velocidad de consumo = "promedio reciente" con criterio fijo: ventana de
// 8 semanas (56 días) hacia atrás desde hoy, total mL consumidos en esa
// ventana ÷ 8 → mL/semana (sin ponderar semanas sin producción). Autonomía
// = stock ÷ velocidad × 7 días; si no hubo consumo en la ventana pero hay
// stock, autonomía se trata como "amplia" (verde); si no hay stock ni
// consumo reciente, autonomía = 0 (rojo, urge producir).
// ---------------------------------------------------------------------
const VENTANA_SEMANAS_CONSUMO = 8;
const DIAS_VENTANA_CONSUMO = VENTANA_SEMANAS_CONSUMO * 7;

function addDiasISO(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}
function mesAnteriorClave(claveHoy: string): string {
  const [y, m] = claveHoy.split('-').map(Number);
  const total = m - 1 - 1;
  const y2 = y + Math.floor(total / 12);
  const m2 = ((total % 12) + 12) % 12;
  return `${y2}-${String(m2 + 1).padStart(2, '0')}`;
}

type ColorAutonomia = 'gris' | 'rojo' | 'amarillo' | 'verde';
const RANGO_COLOR: Record<ColorAutonomia, number> = { gris: 0, rojo: 1, amarillo: 2, verde: 3 };
const BADGE_COLOR: Record<ColorAutonomia, string> = {
  gris: 'bg-slate-200 text-slate-700',
  rojo: 'bg-red-100 text-red-700',
  amarillo: 'bg-amber-100 text-amber-800',
  verde: 'bg-emerald-100 text-emerald-800',
};
const LABEL_COLOR: Record<ColorAutonomia, string> = {
  gris: 'sin historial',
  rojo: 'crítico',
  amarillo: 'atención',
  verde: 'ok',
};

type IndicadorPI = {
  key: string;
  tintaId: number;
  nombreLimpio: string;
  concentracion: number;
  poe: string;
  ip: number;
  stockMl: number;
  velocidadSemanalMl: number;
  autonomiaDias: number;
  producidoHistorico: boolean;
  color: ColorAutonomia;
  sugeridoG: number;
  consumoMesAnteriorG: number;
};

// =====================================================================
// 📊 NECESIDADES DE PRODUCCIÓN
// Lee TODOS los registros activos (Pendientes + Pre-producción + En
// producción) y suma, tinta por tinta, cuánto PRINCIPIO ACTIVO hace falta
// para cubrirlos (también muestra la tinta y los mL equivalentes). Es 100%
// en vivo: cuando un paciente pasa a Terminados, sus gramos desaparecen de
// acá solos. El botón "Hacer" crea el registro de PI armado DESDE EL
// ACTIVO: activo = necesidad × 1.45 (merma 45%), total = activo ÷
// concentración, excipientes por porcentaje. Es reversible con «↩ Deshacer».
// La estadística de producción vive en la solapa 📈 Estadística (B-19).
// =====================================================================

const VOLUMEN_JERINGA_ML = 10;

type DetalleNecesidad = {
  registroId: number;
  paciente: string;
  formula: string;
  lote: string;
  estado: EstadoActivo;
  ml: number;
  gramos: number;
};

type GrupoNecesidad = {
  key: string;
  tintaId: number | null;
  tintaNombre: string; // nombre interno de la tinta (con concentración)
  nombreLimpio: string; // solo el activo
  concentracion: number; // concentración del LOTE a producir (puede ser dilución)
  esDilucion: boolean; // concentración distinta a la del catálogo
  ip: number;
  poe: string;
  ml: number;
  gramos: number; // g de TINTA (activo + excipiente) que consume la impresora
  gramosActivo: number; // g de PRINCIPIO ACTIVO adentro de esa tinta
  jeringas: number;
  detalles: DetalleNecesidad[];
};

type Incompleto = { paciente: string; formula: string; motivo: string };

export default function Necesidades({
  registros,
  registrosTerminados,
  registrosPiTerminados,
  catalogos,
  onCambio,
  onIrPI,
}: {
  registros: Registro[]; // SOLO activos (Pendientes + Pre-producción + En producción)
  registrosTerminados: Registro[]; // SOLO terminados (B-34: consumo histórico real de PI)
  registrosPiTerminados: RegistroPi[]; // SOLO terminados (B-34: producido histórico de PI)
  catalogos: Catalogos;
  onCambio: () => void;
  onIrPI: () => void;
}) {
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [creando, setCreando] = useState<string | null>(null);
  // Lotes creados desde este dashboard en esta visita → permite Deshacer
  const [hechos, setHechos] = useState<Record<string, { id: number; lote: string }>>({});
  // Fila de indicador con el editor de cantidad "A Producción" abierto
  const [produciendo, setProduciendo] = useState<string | null>(null);
  const [cantidadEditable, setCantidadEditable] = useState<Record<string, string>>({});

  // ---------------- Necesidades en vivo ----------------
  const { grupos, incompletos } = useMemo(() => {
    const mapa = new Map<string, GrupoNecesidad>();
    const incompletos: Incompleto[] = [];

    for (const r of registros) {
      const caps = r.capsulasTotales;
      if (!caps || caps <= 0) {
        if ((r.capas ?? []).length > 0)
          incompletos.push({ paciente: r.paciente, formula: r.tituloFormula, motivo: 'sin cápsulas totales' });
        continue;
      }
      for (const c of r.capas ?? []) {
        if (!c.tinta && c.tintaId == null) continue; // capa sin tinta elegida
        const ext = extrusionCapa(c.dosisMg, c.concentracion, c.ip, r.capsulasPorToma);
        if (!ext || !c.ip || !c.concentracion) {
          incompletos.push({
            paciente: r.paciente, formula: r.tituloFormula,
            motivo: `capa "${c.tinta || c.activoReceta}" sin dosis/concentración/IP`,
          });
          continue;
        }
        const ml = ext * caps;
        const gramos = ml * c.ip; // masa de tinta (g) = volumen (mL) × IP
        const key = `${c.tintaId ?? `manual:${c.tinta}`}|${c.concentracion.toFixed(6)}`;
        let g = mapa.get(key);
        if (!g) {
          const t = c.tintaId != null ? catalogos.tintas.find((x) => x.id === c.tintaId) : undefined;
          g = {
            key,
            tintaId: c.tintaId,
            tintaNombre: c.tinta || (t?.nombre ?? ''),
            nombreLimpio: limpiarNombreTinta(c.tinta || t?.nombre || c.activoReceta),
            concentracion: c.concentracion,
            esDilucion: t ? Math.abs(t.concentracion - c.concentracion) > 1e-9 : false,
            ip: c.ip,
            poe: c.poe || t?.poe || '',
            ml: 0, gramos: 0, gramosActivo: 0, jeringas: 0, detalles: [],
          };
          mapa.set(key, g);
        }
        g.ml += ml;
        g.gramos += gramos;
        g.gramosActivo += gramos * c.concentracion; // activo = tinta × concentración
        g.detalles.push({
          registroId: r.id, paciente: r.paciente, formula: r.tituloFormula,
          lote: formatoLote(r.lotePrefijo, r.loteNumero),
          estado: estadoPT(r) as EstadoActivo, ml, gramos,
        });
      }
    }
    const grupos = Array.from(mapa.values())
      .map((g) => ({ ...g, jeringas: Math.ceil(g.ml / VOLUMEN_JERINGA_ML) }))
      .sort((a, b) => b.gramosActivo - a.gramosActivo);
    return { grupos, incompletos };
  }, [registros, catalogos.tintas]);

  // ---------------- Indicadores de stock/autonomía de PI (B-34) ----------------
  const indicadores = useMemo(() => {
    const hoy = hoyISO();
    const corte = addDiasISO(hoy, -DIAS_VENTANA_CONSUMO);
    const claveMesAnterior = mesAnteriorClave(hoy.slice(0, 7));

    return catalogos.tintas
      .filter((t) => t.activo)
      .map((t): IndicadorPI => {
        let producidoMl = 0;
        for (const r of registrosPiTerminados) {
          if (r.tintaId !== t.id) continue;
          producidoMl += (r.jeringas ?? 0) * (r.volumenJeringaMl ?? 0);
        }

        let consumidoTotalMl = 0;
        let consumidoVentanaMl = 0;
        let consumoMesAnteriorG = 0;
        for (const r of registrosTerminados) {
          const caps = r.capsulasTotales;
          if (!caps || caps <= 0) continue;
          const fecha = fechaProduccion(r);
          for (const c of r.capas ?? []) {
            if (c.tintaId !== t.id) continue;
            const ext = extrusionCapa(c.dosisMg, c.concentracion, c.ip, r.capsulasPorToma);
            if (!ext || !c.ip) continue;
            const ml = ext * caps;
            consumidoTotalMl += ml;
            if (fecha && fecha >= corte) consumidoVentanaMl += ml;
            if (fecha && fecha.slice(0, 7) === claveMesAnterior) consumoMesAnteriorG += ml * c.ip;
          }
        }

        const stockMl = Math.max(0, producidoMl - consumidoTotalMl);
        const velocidadSemanalMl = consumidoVentanaMl / VENTANA_SEMANAS_CONSUMO;
        const autonomiaDias = velocidadSemanalMl > 0 ? (stockMl / velocidadSemanalMl) * 7
          : stockMl > 0 ? Infinity : 0;
        const producidoHistorico = producidoMl > 0;
        const color: ColorAutonomia = !producidoHistorico ? 'gris'
          : autonomiaDias < 15 ? 'rojo'
          : autonomiaDias < 25 ? 'amarillo'
          : 'verde';

        return {
          key: `${t.id}|${t.concentracion.toFixed(6)}`,
          tintaId: t.id,
          nombreLimpio: limpiarNombreTinta(t.nombre),
          concentracion: t.concentracion,
          poe: t.poe,
          ip: t.ip,
          stockMl,
          velocidadSemanalMl,
          autonomiaDias,
          producidoHistorico,
          color,
          sugeridoG: Math.round(consumoMesAnteriorG * 1.5 * 100) / 100,
          consumoMesAnteriorG: Math.round(consumoMesAnteriorG * 100) / 100,
        };
      })
      .sort((a, b) => RANGO_COLOR[a.color] - RANGO_COLOR[b.color] || a.autonomiaDias - b.autonomiaDias);
  }, [catalogos.tintas, registrosPiTerminados, registrosTerminados]);

  // ---------------- Crear el PI precargado (compartido por ambos botones) ----------------
  async function crearLotePI(params: {
    key: string; tintaId: number | null; tintaNombre: string; nombreLimpio: string;
    concentracion: number; poe: string; ip: number; cantidadProductoG: number;
  }) {
    const { key, tintaId, tintaNombre, nombreLimpio, concentracion, poe, ip, cantidadProductoG } = params;
    const t = tintaId != null ? catalogos.tintas.find((x) => x.id === tintaId) : undefined;
    if (!poe) {
      alert(`Esta tinta no tiene Nº POE cargado. Cargalo una vez en Gestión → ${nombreLimpio} y volvé a intentar.`);
      return;
    }
    setCreando(key);
    try {
      const cantidad = Math.round(cantidadProductoG * 100) / 100; // g de producto total
      const jeringas = Math.ceil(cantidad / ip / VOLUMEN_JERINGA_ML);
      const teoricas = pesadasPI(nombreLimpio, concentracion, cantidad, t?.excipientes ?? [], catalogos.tintas);
      const materiasPrimas: MateriaPrima[] = teoricas.map((p, i) => ({
        ref: i + 1,
        nombre: p.nombre,
        pureza: p.esPI ? 'N.A.' : '-',
        lote: '',
        esPI: p.esPI,
        cantidadTeorica: Math.round(p.gramos * 100) / 100,
        pesadaReal: '',
      }));
      const fechaElab = hoyISO();
      const res = await fetch('/api/registros-pi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: 'en_proceso',
          tintaId,
          tintaNombre,
          nombreProducto: `TINTA DE ${nombreLimpio.toUpperCase()}`,
          poe,
          // El número lo asigna el servidor al crear (P### propio de esta tinta).
          loteNumero: null,
          concentracion,
          cantidadProductoG: cantidad,
          jeringas,
          volumenJeringaMl: VOLUMEN_JERINGA_ML,
          materiasPrimas,
          fechaElab,
          fechaVto: sumarMeses(fechaElab, MESES_VENCIMIENTO),
          fechaHoraInicio: '',
          fechaHoraFin: '',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? 'No se pudo crear el registro de PI.');
        return;
      }
      const creado = await res.json();
      setHechos((h) => ({ ...h, [key]: { id: creado.id, lote: formatoLotePI(poe, creado.loteNumero) } }));
      onCambio();
    } catch {
      alert('No se pudo crear el registro de PI. Revisá la conexión.');
    } finally {
      setCreando(null);
    }
  }

  // "Hacer" de una necesidad en vivo: cantidad DESDE EL ACTIVO (× 1.45 de
  // merma, total = activo ÷ concentración) — comportamiento sin cambios.
  async function hacer(g: GrupoNecesidad) {
    const t = g.tintaId != null ? catalogos.tintas.find((x) => x.id === g.tintaId) : undefined;
    const poe = t?.poe || g.poe;
    const activo = activoConMerma(g.gramosActivo);
    const cantidad = Math.round((activo / g.concentracion) * 100) / 100; // g de producto total
    await crearLotePI({
      key: g.key, tintaId: g.tintaId, tintaNombre: g.tintaNombre, nombreLimpio: g.nombreLimpio,
      concentracion: g.concentracion, poe, ip: g.ip, cantidadProductoG: cantidad,
    });
  }

  // "A Producción" desde un indicador de stock: cantidad editable, precargada
  // con consumo del mes anterior × 1.5 (margen de merma) — nunca se manda
  // fija, el usuario la confirma o la cambia antes de crear el lote.
  async function hacerDesdeIndicador(ind: IndicadorPI) {
    const cantidad = parseFloat(cantidadEditable[ind.key] ?? '');
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      alert('Ingresá una cantidad de producto (g) mayor a cero.');
      return;
    }
    await crearLotePI({
      key: ind.key, tintaId: ind.tintaId, tintaNombre: ind.nombreLimpio, nombreLimpio: ind.nombreLimpio,
      concentracion: ind.concentracion, poe: ind.poe, ip: ind.ip, cantidadProductoG: cantidad,
    });
    setProduciendo(null);
  }

  // Deshacer: elimina el lote de PI recién creado desde este dashboard
  async function deshacer(key: string) {
    const h = hechos[key];
    if (!h) return;
    try {
      const res = await fetch(`/api/registros-pi/${h.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setHechos((prev) => {
        const { [key]: _, ...resto } = prev;
        return resto;
      });
      onCambio();
    } catch {
      alert('No se pudo deshacer. Podés eliminarlo desde la solapa Producto Intermedio.');
    }
  }

  return (
    <div className="space-y-6">
      {/* ================= Stock/autonomía de PI (B-34) ================= */}
      <div>
        <h2 className="section-title">📦 Stock y autonomía de PI</h2>
        <p className="mb-3 text-xs text-slate-400">
          Aproximado: producido histórico − consumido histórico, no hay tabla de stock real todavía.
          Velocidad = consumo de las últimas {VENTANA_SEMANAS_CONSUMO} semanas ÷ {VENTANA_SEMANAS_CONSUMO}.
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-2">Producto intermedio</th>
                <th className="px-2 py-2 text-right">Stock aprox.</th>
                <th className="px-2 py-2 text-right">Consumo</th>
                <th className="px-2 py-2 text-right">Autonomía</th>
                <th className="px-4 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {indicadores.map((ind) => {
                const hecho = hechos[ind.key];
                const abierto = produciendo === ind.key;
                return (
                  <Fragment key={ind.key}>
                    <tr className="border-b border-slate-50">
                      <td className="px-4 py-2">
                        <span className={`badge mr-2 ${BADGE_COLOR[ind.color]}`}>{LABEL_COLOR[ind.color]}</span>
                        <span className="font-semibold uppercase">{ind.nombreLimpio}</span>{' '}
                        <span className="text-xs text-slate-400">al {fmtPct(ind.concentracion)}</span>
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{fmtMl(ind.stockMl, 1)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs text-slate-500">
                        {fmtMl(ind.velocidadSemanalMl, 1)}/sem
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {!ind.producidoHistorico ? '—' : ind.autonomiaDias === Infinity ? '25+ d' : `${Math.round(ind.autonomiaDias)} d`}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {hecho ? (
                          <span className="badge bg-emerald-100 font-mono text-xs text-emerald-800">✔ {hecho.lote}</span>
                        ) : (
                          <button
                            className="text-sm font-semibold text-indigo-700 hover:underline"
                            onClick={() => {
                              setProduciendo(abierto ? null : ind.key);
                              if (!abierto) setCantidadEditable((c) => ({ ...c, [ind.key]: String(ind.sugeridoG) }));
                            }}
                          >
                            {abierto ? 'cerrar' : '🏭 A Producción'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {abierto && (
                      <tr className="border-b border-slate-50 bg-indigo-50/40">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-slate-500">
                              Sugerido: consumo del mes anterior ({fmtG(ind.consumoMesAnteriorG)}) × 1.5 de merma —
                            </span>
                            <input
                              type="number" min="0" step="0.01"
                              className="w-28 rounded border border-slate-300 px-2 py-1 font-mono"
                              value={cantidadEditable[ind.key] ?? ''}
                              onChange={(e) => setCantidadEditable((c) => ({ ...c, [ind.key]: e.target.value }))}
                            />
                            <span className="text-slate-400">g de producto</span>
                            <button className="btn-primary" disabled={creando === ind.key}
                              onClick={() => hacerDesdeIndicador(ind)}>
                              {creando === ind.key ? '… creando' : 'Confirmar'}
                            </button>
                            <button className="text-slate-500 hover:underline" onClick={() => setProduciendo(null)}>
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= Necesidades en vivo ================= */}
      <div>
        <h2 className="section-title">📊 Necesidad de tinta para cubrir Pendientes + Pre-producción + En producción</h2>
        <p className="mb-3 text-sm text-slate-500">
          Se calcula en vivo con los pacientes pendientes y en producción; cuando un lote pasa a
          Terminados, sus gramos dejan de contar solos. El número grande es el <b>principio activo</b>;
          «Hacer» arma el lote desde el activo con <b>45% de merma</b> (total = activo ÷ concentración,
          excipientes por porcentaje) y <b>todo queda editable</b> en el registro de PI.
        </p>

        {incompletos.length > 0 && (
          <div className="alerta-quimica mb-3 text-xs">
            ⚠ {incompletos.length} capa{incompletos.length === 1 ? '' : 's'} no suma{incompletos.length === 1 ? '' : 'n'} al
            cálculo por datos incompletos:{' '}
            {incompletos.slice(0, 4).map((x) => `${x.paciente || 'SIN NOMBRE'} (${x.motivo})`).join(' · ')}
            {incompletos.length > 4 && ` · +${incompletos.length - 4} más`}
          </div>
        )}

        {grupos.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">
            No hay necesidades pendientes: no hay registros activos (Pendientes, Pre-producción o En producción) con capas calculadas.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {grupos.map((g) => {
              const abierto = expandido[g.key] ?? false;
              const hecho = hechos[g.key];
              const activo = activoConMerma(g.gramosActivo);
              const producto = Math.round((activo / g.concentracion) * 100) / 100;
              return (
                <div key={g.key} className="card overflow-hidden border-l-4 border-l-indigo-600">
                  <div className="flex flex-wrap items-start justify-between gap-2 bg-indigo-50/60 px-4 py-3">
                    <div>
                      <p className="text-xl font-black uppercase leading-none">{g.nombreLimpio}</p>
                      <p className="mt-1 text-sm font-medium text-slate-600">
                        {g.tintaNombre && g.tintaNombre !== g.nombreLimpio ? `${g.tintaNombre} · ` : ''}
                        al <b>{fmtPct(g.concentracion)}</b>
                        {g.esDilucion && <span className="badge ml-2 bg-violet-100 text-violet-700">⚗ dilución</span>}
                        {g.poe && <span className="ml-2 font-mono text-xs">{g.poe}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black leading-none text-indigo-700">
                        {fmtG(g.gramosActivo)} <span className="text-sm font-bold">de activo</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        = {fmtG(g.gramos)} de tinta · {fmtMl(g.ml, 1)} · ~{g.jeringas} jeringa{g.jeringas === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <button className="text-sm font-semibold text-indigo-700 hover:underline"
                      onClick={() => setExpandido((e) => ({ ...e, [g.key]: !abierto }))}>
                      {abierto ? '▾' : '▸'} {g.detalles.length} paciente{g.detalles.length === 1 ? '' : 's'}
                    </button>
                    {hecho ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="badge bg-emerald-100 font-mono text-emerald-800">✔ {hecho.lote} creado</span>
                        <button className="font-semibold text-indigo-700 hover:underline" onClick={onIrPI}>
                          Ver en Producto Intermedio →
                        </button>
                        <button className="font-semibold text-red-600 hover:underline"
                          title="Elimina el lote de PI recién creado"
                          onClick={() => deshacer(g.key)}>
                          ↩ Deshacer
                        </button>
                      </div>
                    ) : (
                      <div className="text-right">
                        <button className="btn-primary" disabled={creando === g.key}
                          title={`Crea el registro de PI armado desde el activo: ${activo} g de activo (necesidad + ${MERMA_PI * 100}% de merma) ÷ ${fmtPct(g.concentracion)} = ${producto} g de producto. Pesadas, jeringas y lote precargados; todo editable.`}
                          onClick={() => hacer(g)}>
                          {creando === g.key ? '… creando' : `🧪 Hacer ${activo} g de activo →`}
                        </button>
                        <p className="mt-1 text-[11px] text-slate-400">
                          con {MERMA_PI * 100}% de merma → {producto} g de producto
                        </p>
                      </div>
                    )}
                  </div>
                  {abierto && (
                    <table className="w-full border-t border-slate-100 text-xs">
                      <thead>
                        <tr className="text-left uppercase text-slate-400">
                          <th className="px-4 py-1">Paciente</th><th>Lote</th><th>Estado</th>
                          <th className="pr-4 text-right">Tinta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.detalles.map((d, i) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-4 py-1 font-semibold">{d.paciente || 'SIN NOMBRE'} · {d.formula}</td>
                            <td className="font-mono">{d.lote}</td>
                            <td>{LABEL_ESTADO[d.estado]}</td>
                            <td className="pr-4 text-right">
                              {fmtG(d.gramos * g.concentracion)} act. · {fmtG(d.gramos)} tinta · {fmtMl(d.ml, 1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
