'use client';
import { useMemo, useState } from 'react';
import type { Registro, RegistroPi } from '@/db/schema';
import { hoyISO, fechaProduccion } from '@/lib/utils';
import { limpiarNombreTinta } from '@/lib/engine';

// =====================================================================
// 📊 ESTADÍSTICA — números completos del admin, SOLO "producido"
// (nada de "vendido": eso llega con el cotizador en la Fase 3). Lee los
// registros PT y PI ya TERMINADOS que el padre ya carga (sin API nueva) y
// agrega todo en el cliente. Período: mes (default mes actual, navegable)
// o rango libre desde/hasta. El "día de producción" de un registro es el
// mismo que ya usa Terminados.tsx para ordenar (fechaHoraFin → fechaElab →
// createdAt: updatedAt no es confiable, ver fechaProduccion en utils.ts).
// =====================================================================

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function nombreMes(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!m) return key;
  return `${MESES_ES[m - 1]} ${y}`;
}
function nombreMesCorto(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!m) return key;
  return `${MESES_CORTOS[m - 1]} ${String(y).slice(2)}`;
}

// Suma/resta meses a una clave "YYYY-MM" (mismo criterio que sumarMeses,
// pero operando directo sobre la clave sin necesitar un día del mes).
function addMesesClave(clave: string, n: number): string {
  const [y, m] = clave.split('-').map(Number);
  const total = m - 1 + n;
  const y2 = y + Math.floor(total / 12);
  const m2 = ((total % 12) + 12) % 12;
  return `${y2}-${String(m2 + 1).padStart(2, '0')}`;
}

// Días entre dos fechas ISO (fecha "pura", mismo patrón Date.UTC que
// diasHasta/sumarMeses en utils.ts): b − a, en días.
function difDiasISO(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
function addDiasISO(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

function normalizarNombre(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : '—';
}

// Delta contra el período anterior: null = sin base para comparar → "—".
function delta(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

function Delta({ v }: { v: number | null }) {
  if (v == null) return <span className="text-xs text-niebla">—</span>;
  const color = v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-600' : 'text-niebla';
  const flecha = v > 0 ? '↑' : v < 0 ? '↓' : '·';
  return <span className={`text-xs font-semibold ${color}`}>{flecha} {Math.abs(v)}%</span>;
}

function Tile({ label, valor, cmp }: { label: string; valor: string | number; cmp: number | null }) {
  return (
    <div className="tile gap-0.5 py-3">
      <p className="text-2xl font-black text-profundo">{valor}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-niebla">{label}</p>
      <Delta v={cmp} />
    </div>
  );
}

// KPI destacado: tarjeta grande para las 3-5 métricas principales del
// período, con más jerarquía tipográfica que .tile (usado en los bloques
// de detalle) para que no todos los números pesen igual visualmente.
function KpiDestacado({ label, valor, cmp }: { label: string; valor: string | number; cmp: number | null }) {
  return (
    <div className="card flex flex-col gap-1 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-niebla">{label}</p>
      <p className="font-archivo text-4xl font-black text-profundo">{valor}</p>
      <Delta v={cmp} />
    </div>
  );
}

type Ranking = { nombre: string; a: number; b: number | string };

function TablaRanking({
  titulo, filas, colA, colB, vacio,
}: {
  titulo: string; filas: Ranking[]; colA: string; colB: string; vacio: string;
}) {
  return (
    <div className="card overflow-hidden">
      <h3 className="border-b border-slate-100 px-4 py-2 font-archivo text-sm font-bold text-turba">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="p-4 text-sm text-niebla">{vacio}</p>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-niebla">
              <tr><th className="px-4 py-1.5">Nombre</th><th className="text-right">{colA}</th><th className="px-4 text-right">{colB}</th></tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-4 py-1.5 font-semibold">{f.nombre}</td>
                  <td className="text-right">{f.a}</td>
                  <td className="px-4 text-right">{f.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Evolucion({ titulo, meses, valores, mesActivo }: { titulo: string; meses: string[]; valores: number[]; mesActivo: string }) {
  const max = Math.max(...valores, 1);
  return (
    <div className="card p-4">
      <h3 className="mb-3 font-archivo text-sm font-bold text-turba">{titulo}</h3>
      {valores.every((v) => v === 0) ? (
        <p className="text-sm text-niebla">Sin producción en este período.</p>
      ) : (
        <div className="flex h-32 items-end gap-1">
          {meses.map((m, i) => {
            const v = valores[i];
            const h = Math.max(2, Math.round((v / max) * 100));
            const activo = m === mesActivo;
            return (
              <div key={m} className="flex flex-1 flex-col items-center gap-1" title={`${nombreMes(m)}: ${v}`}>
                <div className="flex h-24 w-full items-end">
                  <div
                    className={`w-full rounded-t ${activo ? 'bg-tussok' : 'bg-profundo/80'}`}
                    style={{ height: `${h}%` }}
                  />
                </div>
                <p className="text-[9px] text-niebla">{nombreMesCorto(m)}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Fila de barra horizontal: una sola magnitud, misma paleta que Evolucion
// (Profundo/Tussok/Niebla, sin librería de gráficos — B-19.3).
function BarraHorizontal({
  label, valor, max, formato, color = 'bg-profundo', destacado = false,
}: {
  label: string; valor: number; max: number; formato?: (v: number) => string;
  color?: string; destacado?: boolean;
}) {
  const ancho = max > 0 ? Math.max(2, Math.round((valor / max) * 100)) : 0;
  const texto = formato ? formato(valor) : String(valor);
  return (
    <div className="flex items-center gap-2" title={`${label}: ${texto}`}>
      <p className="w-24 shrink-0 truncate text-xs text-turba sm:w-32">{label}</p>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${destacado ? 'bg-tussok' : color}`}
          style={{ width: `${ancho}%` }}
        />
      </div>
      <p className="min-w-[3rem] shrink-0 text-right text-xs font-bold text-profundo">{texto}</p>
    </div>
  );
}

// Gráfico "este período vs anterior": misma comparativa que ya muestra
// <Delta>, en forma de barras (Producción, Pacientes — B-19.3).
function GraficoComparativo({
  metricas, hayAnterior,
}: {
  metricas: { label: string; actual: number; anterior: number; formato?: (v: number) => string }[];
  hayAnterior: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {metricas.map((m) => {
        const max = Math.max(m.actual, hayAnterior ? m.anterior : 0, 1);
        return (
          <div key={m.label}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-niebla">{m.label}</p>
            <div className="space-y-1.5">
              <BarraHorizontal label="Este período" valor={m.actual} max={max} formato={m.formato} destacado />
              {hayAnterior && (
                <BarraHorizontal label="Anterior" valor={m.anterior} max={max} formato={m.formato} color="bg-niebla" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Ranking en barras: mismo orden/valor que ya arma cada TablaRanking
// (top 8 para que no se haga interminable en mobile — B-19.3).
function GraficoRanking({
  titulo, filas, formato, vacio,
}: {
  titulo: string; filas: { nombre: string; valor: number }[]; formato?: (v: number) => string; vacio: string;
}) {
  const top = filas.slice(0, 8);
  const max = Math.max(...top.map((f) => f.valor), 1);
  return (
    <div className="card p-4">
      <h4 className="mb-2 font-archivo text-sm font-bold text-turba">{titulo}</h4>
      {top.length === 0 ? (
        <p className="text-sm text-niebla">{vacio}</p>
      ) : (
        <div className="space-y-1.5">
          {top.map((f, i) => (
            <BarraHorizontal key={f.nombre} label={f.nombre} valor={f.valor} max={max} formato={formato} destacado={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

// Selector Tabla/Gráfico: misma vista, otra forma — nunca reemplaza la
// tabla/tarjeta original (B-19.3).
function SelectorVista({ vista, onChange }: { vista: 'tabla' | 'grafico'; onChange: (v: 'tabla' | 'grafico') => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-200 text-xs">
      {(['tabla', 'grafico'] as const).map((v) => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-2.5 py-1 font-semibold capitalize ${
            vista === v ? 'bg-profundo text-hueso' : 'bg-white text-turba hover:bg-slate-50'
          }`}>
          {v === 'tabla' ? 'Tabla' : 'Gráfico'}
        </button>
      ))}
    </div>
  );
}

export default function Estadistica({
  registros,
  registrosPi,
}: {
  registros: Registro[]; // SOLO terminados
  registrosPi: RegistroPi[]; // SOLO terminados
}) {
  const [modo, setModo] = useState<'mes' | 'rango'>('mes');
  const [mes, setMes] = useState(() => hoyISO().slice(0, 7));
  const [desde, setDesde] = useState(() => `${hoyISO().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(() => hoyISO());
  const [vistaProduccion, setVistaProduccion] = useState<'tabla' | 'grafico'>('tabla');
  const [vistaPacientes, setVistaPacientes] = useState<'tabla' | 'grafico'>('tabla');
  const [vistaRanking, setVistaRanking] = useState<'tabla' | 'grafico'>('tabla');

  // ---------------- Rango efectivo del período elegido ----------------
  const { dentro, prevDentro, tituloPeriodo } = useMemo(() => {
    const dentroFn = (f: string) =>
      modo === 'mes' ? f.slice(0, 7) === mes : f >= desde && f <= hasta;
    let prevFn: (f: string) => boolean;
    let titulo: string;
    if (modo === 'mes') {
      const prevMes = addMesesClave(mes, -1);
      prevFn = (f: string) => f.slice(0, 7) === prevMes;
      titulo = nombreMes(mes);
    } else {
      const dias = difDiasISO(desde, hasta) + 1;
      const prevHasta = addDiasISO(desde, -1);
      const prevDesde = addDiasISO(prevHasta, -(dias - 1));
      prevFn = (f: string) => f >= prevDesde && f <= prevHasta;
      titulo = `${desde} a ${hasta}`;
    }
    return { dentro: dentroFn, prevDentro: prevFn, tituloPeriodo: titulo };
  }, [modo, mes, desde, hasta]);

  const ptPeriodo = useMemo(() => registros.filter((r) => dentro(fechaProduccion(r))), [registros, dentro]);
  const piPeriodo = useMemo(() => registrosPi.filter((r) => dentro(fechaProduccion(r))), [registrosPi, dentro]);
  const ptPrevio = useMemo(() => registros.filter((r) => prevDentro(fechaProduccion(r))), [registros, prevDentro]);
  const piPrevio = useMemo(() => registrosPi.filter((r) => prevDentro(fechaProduccion(r))), [registrosPi, prevDentro]);
  const hayPeriodoAnterior = ptPrevio.length + piPrevio.length > 0;

  // ---------------- Métricas PT: cápsulas, pacientes, rankings ----------------
  const statsPT = useMemo(() => {
    function calcular(lista: Registro[]) {
      let capsulas = 0;
      const pacientes = new Set<string>();
      const activos = new Map<string, { nombre: string; mg: number; capsulas: number }>();
      const formulas = new Map<string, { nombre: string; capsulas: number; lotes: number }>();
      const medicos = new Map<string, { nombre: string; recetas: number; capsulas: number }>();
      const diagnosticos = new Map<string, { nombre: string; recetas: number }>();

      for (const r of lista) {
        const caps = r.capsulasTotales ?? 0;
        capsulas += caps;
        if (r.paciente.trim()) pacientes.add(normalizarNombre(r.paciente));

        const nombresVistos = new Set<string>();
        for (const c of r.capas ?? []) {
          const nombre = limpiarNombreTinta(c.tinta || c.activoReceta) || 'Sin nombre';
          const mg = ((c.dosisMg ?? 0) / (r.capsulasPorToma || 1)) * caps;
          const a = activos.get(nombre) ?? { nombre, mg: 0, capsulas: 0 };
          a.mg += mg;
          if (!nombresVistos.has(nombre)) { a.capsulas += caps; nombresVistos.add(nombre); }
          activos.set(nombre, a);
        }

        const claveFormula = r.tituloFormula.trim() || 'Sin fórmula';
        const f = formulas.get(claveFormula) ?? { nombre: claveFormula, capsulas: 0, lotes: 0 };
        f.capsulas += caps; f.lotes += 1;
        formulas.set(claveFormula, f);

        const claveMedico = r.medico.trim() || 'Sin médico';
        const m = medicos.get(claveMedico) ?? { nombre: claveMedico, recetas: 0, capsulas: 0 };
        m.recetas += 1; m.capsulas += caps;
        medicos.set(claveMedico, m);

        const claveDiag = r.diagnostico.trim() || 'Sin diagnóstico';
        const d = diagnosticos.get(claveDiag) ?? { nombre: claveDiag, recetas: 0 };
        d.recetas += 1;
        diagnosticos.set(claveDiag, d);
      }

      return {
        capsulas,
        pacientes: pacientes.size,
        activos: Array.from(activos.values()).sort((a, b) => b.mg - a.mg),
        formulas: Array.from(formulas.values()).sort((a, b) => b.capsulas - a.capsulas),
        medicos: Array.from(medicos.values()).sort((a, b) => b.recetas - a.recetas),
        diagnosticos: Array.from(diagnosticos.values()).sort((a, b) => b.recetas - a.recetas),
      };
    }
    return { actual: calcular(ptPeriodo), previo: calcular(ptPrevio) };
  }, [ptPeriodo, ptPrevio]);

  // ---------------- Métricas PI: jeringas, mL ----------------
  const statsPI = useMemo(() => {
    function calcular(lista: RegistroPi[]) {
      let jeringas10 = 0, jeringas60 = 0, otras = 0, ml = 0;
      for (const r of lista) {
        const j = r.jeringas ?? 0;
        const v = r.volumenJeringaMl ?? 0;
        if (v === 10) jeringas10 += j;
        else if (v === 60) jeringas60 += j;
        else otras += j;
        ml += j * v;
      }
      return { jeringas10, jeringas60, otras, ml };
    }
    return { actual: calcular(piPeriodo), previo: calcular(piPrevio) };
  }, [piPeriodo, piPrevio]);

  // ---------------- Evolución mes a mes ----------------
  const mesesEvolucion = useMemo(() => {
    let claves: string[];
    if (modo === 'mes') {
      claves = Array.from({ length: 12 }, (_, i) => addMesesClave(mes, i - 11));
    } else {
      const ini = desde.slice(0, 7);
      const fin = hasta.slice(0, 7);
      claves = [];
      let cur = ini;
      let guard = 0;
      while (cur <= fin && guard < 500) { claves.push(cur); cur = addMesesClave(cur, 1); guard++; }
      if (claves.length > 36) claves = claves.slice(-36);
    }
    return claves;
  }, [modo, mes, desde, hasta]);

  const truncadoEvolucion = modo === 'rango' && difDiasISO(desde, hasta) > 36 * 31;

  const capsulasPorMes = useMemo(
    () => mesesEvolucion.map((m) => registros.filter((r) => fechaProduccion(r).slice(0, 7) === m)
      .reduce((s, r) => s + (r.capsulasTotales ?? 0), 0)),
    [mesesEvolucion, registros]
  );
  const jeringasPorMes = useMemo(
    () => mesesEvolucion.map((m) => registrosPi.filter((r) => fechaProduccion(r).slice(0, 7) === m)
      .reduce((s, r) => s + (r.jeringas ?? 0), 0)),
    [mesesEvolucion, registrosPi]
  );

  const mesActivoEvolucion = modo === 'mes' ? mes : hoyISO().slice(0, 7);

  const aPT = statsPT.actual;
  const pPT = statsPT.previo;
  const aPI = statsPI.actual;
  const pPI = statsPI.previo;

  return (
    <div className="space-y-8">
      {/* ================= Selector de período ================= */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex overflow-hidden rounded-xl border border-slate-200">
          {(['mes', 'rango'] as const).map((v) => (
            <button key={v} onClick={() => setModo(v)}
              className={`px-3 py-1.5 text-sm font-semibold capitalize ${
                modo === v ? 'bg-profundo text-hueso' : 'bg-white text-turba hover:bg-slate-50'
              }`}>
              {v === 'mes' ? 'Mes' : 'Rango libre'}
            </button>
          ))}
        </div>
        {modo === 'mes' ? (
          <div className="flex items-center gap-2">
            <button className="btn-ghost" onClick={() => setMes((m) => addMesesClave(m, -1))}>← Anterior</button>
            <button className="btn-ghost" onClick={() => setMes(hoyISO().slice(0, 7))}>Mes actual</button>
            <button className="btn-ghost" onClick={() => setMes((m) => addMesesClave(m, 1))}>Siguiente →</button>
            <p className="ml-2 text-lg font-bold capitalize text-turba">{tituloPeriodo}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Desde</label>
            <input type="date" className="input w-auto" value={desde} onChange={(e) => setDesde(e.target.value)} />
            <label className="text-sm text-slate-500">Hasta</label>
            <input type="date" className="input w-auto" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        )}
      </div>

      {!hayPeriodoAnterior && (
        <p className="text-xs text-niebla">Sin período anterior con datos: la comparativa muestra “—”.</p>
      )}

      {/* ================= KPIs destacados ================= */}
      <section>
        <h2 className="section-title">📊 KPIs destacados — {tituloPeriodo}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiDestacado label="Cápsulas producidas" valor={aPT.capsulas} cmp={hayPeriodoAnterior ? delta(aPT.capsulas, pPT.capsulas) : null} />
          <KpiDestacado label="Pacientes atendidos" valor={aPT.pacientes} cmp={hayPeriodoAnterior ? delta(aPT.pacientes, pPT.pacientes) : null} />
          <KpiDestacado label="mL de PI producidos" valor={Number(aPI.ml.toFixed(1))} cmp={hayPeriodoAnterior ? delta(aPI.ml, pPI.ml) : null} />
        </div>
      </section>

      {/* ================= Producción ================= */}
      <section className="border-t border-linea pt-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="section-title mb-0">📦 Producción</h2>
          <SelectorVista vista={vistaProduccion} onChange={setVistaProduccion} />
        </div>
        {vistaProduccion === 'tabla' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Cápsulas producidas" valor={aPT.capsulas} cmp={hayPeriodoAnterior ? delta(aPT.capsulas, pPT.capsulas) : null} />
            <Tile label="Jeringas de 10" valor={aPI.jeringas10} cmp={hayPeriodoAnterior ? delta(aPI.jeringas10, pPI.jeringas10) : null} />
            <Tile label="Jeringas de 60" valor={aPI.jeringas60} cmp={hayPeriodoAnterior ? delta(aPI.jeringas60, pPI.jeringas60) : null} />
            <Tile label="mL de PI producidos" valor={Number(aPI.ml.toFixed(1))} cmp={hayPeriodoAnterior ? delta(aPI.ml, pPI.ml) : null} />
          </div>
        ) : (
          <div className="card p-4">
            <GraficoComparativo
              hayAnterior={hayPeriodoAnterior}
              metricas={[
                { label: 'Cápsulas producidas', actual: aPT.capsulas, anterior: pPT.capsulas },
                { label: 'Jeringas de 10', actual: aPI.jeringas10, anterior: pPI.jeringas10 },
                { label: 'Jeringas de 60', actual: aPI.jeringas60, anterior: pPI.jeringas60 },
                { label: 'mL de PI producidos', actual: Number(aPI.ml.toFixed(1)), anterior: Number(pPI.ml.toFixed(1)) },
              ]}
            />
          </div>
        )}
        {aPI.otras > 0 && (
          <p className="mt-2 text-xs text-niebla">+ {aPI.otras} jeringa{aPI.otras === 1 ? '' : 's'} de otro volumen (no 10 ni 60 mL).</p>
        )}
      </section>

      {/* ================= Pacientes ================= */}
      <section className="border-t border-linea pt-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="section-title mb-0">🧑‍🤝‍🧑 Pacientes</h2>
          <SelectorVista vista={vistaPacientes} onChange={setVistaPacientes} />
        </div>
        {vistaPacientes === 'tabla' ? (
          <div className="max-w-[200px]">
            <Tile label="Pacientes atendidos" valor={aPT.pacientes} cmp={hayPeriodoAnterior ? delta(aPT.pacientes, pPT.pacientes) : null} />
          </div>
        ) : (
          <div className="card max-w-sm p-4">
            <GraficoComparativo
              hayAnterior={hayPeriodoAnterior}
              metricas={[{ label: 'Pacientes atendidos', actual: aPT.pacientes, anterior: pPT.pacientes }]}
            />
          </div>
        )}
      </section>

      {/* ================= Ranking ================= */}
      <section className="space-y-4 border-t border-linea pt-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title mb-0">🏆 Ranking del período</h2>
          <SelectorVista vista={vistaRanking} onChange={setVistaRanking} />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-bold text-turba">⭐ Cápsula estrella</h3>
          {aPT.formulas.length === 0 ? (
            <div className="card p-6 text-center text-niebla">No hay producto terminado en {tituloPeriodo}.</div>
          ) : vistaRanking === 'tabla' ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {aPT.formulas.slice(0, 5).map((f, i) => (
                <div key={f.nombre} className={`card p-3 ${i === 0 ? 'border-2 border-tussok' : ''}`}>
                  <p className="truncate text-sm font-black uppercase" title={f.nombre}>{i === 0 && '⭐ '}{f.nombre}</p>
                  <p className="text-xl font-black text-profundo">{f.capsulas}</p>
                  <p className="text-xs text-niebla">cáps · {f.lotes} lote{f.lotes === 1 ? '' : 's'} · {pct(f.capsulas, aPT.capsulas)}</p>
                </div>
              ))}
            </div>
          ) : (
            <GraficoRanking
              titulo="⭐ Cápsula estrella — cápsulas por fórmula"
              filas={aPT.formulas.map((f) => ({ nombre: f.nombre, valor: f.capsulas }))}
              vacio="No hay producto terminado en este período."
            />
          )}
        </div>

        {vistaRanking === 'tabla' ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <TablaRanking
              titulo="🧪 Activos usados"
              filas={aPT.activos.map((a) => ({ nombre: a.nombre, a: a.capsulas, b: Number(a.mg.toFixed(1)) }))}
              colA="Cáps" colB="mg totales"
              vacio="Sin activos en este período."
            />
            <TablaRanking
              titulo="🩺 Médicos derivadores"
              filas={aPT.medicos.map((m) => ({ nombre: m.nombre, a: m.recetas, b: m.capsulas }))}
              colA="Recetas" colB="Cáps"
              vacio="Sin médicos en este período."
            />
            <TablaRanking
              titulo="📋 Diagnósticos"
              filas={aPT.diagnosticos.map((d) => ({ nombre: d.nombre, a: d.recetas, b: pct(d.recetas, ptPeriodo.length) }))}
              colA="Recetas" colB="%"
              vacio="Sin diagnósticos en este período."
            />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <GraficoRanking
              titulo="🧪 Activos usados (mg totales)"
              filas={aPT.activos.map((a) => ({ nombre: a.nombre, valor: Number(a.mg.toFixed(1)) }))}
              formato={(v) => `${v} mg`}
              vacio="Sin activos en este período."
            />
            <GraficoRanking
              titulo="🩺 Médicos derivadores (recetas)"
              filas={aPT.medicos.map((m) => ({ nombre: m.nombre, valor: m.recetas }))}
              vacio="Sin médicos en este período."
            />
            <GraficoRanking
              titulo="📋 Diagnósticos (recetas)"
              filas={aPT.diagnosticos.map((d) => ({ nombre: d.nombre, valor: d.recetas }))}
              vacio="Sin diagnósticos en este período."
            />
          </div>
        )}
      </section>

      {/* ================= Evolución ================= */}
      <section className="border-t border-linea pt-6">
        <h2 className="section-title">📈 Evolución mes a mes</h2>
        {truncadoEvolucion && (
          <p className="mb-2 text-xs text-amber-600">⚠ Rango muy amplio: se muestran los últimos 36 meses.</p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <Evolucion titulo="Cápsulas producidas" meses={mesesEvolucion} valores={capsulasPorMes} mesActivo={mesActivoEvolucion} />
          <Evolucion titulo="Jeringas de PI producidas" meses={mesesEvolucion} valores={jeringasPorMes} mesActivo={mesActivoEvolucion} />
        </div>
      </section>
    </div>
  );
}
