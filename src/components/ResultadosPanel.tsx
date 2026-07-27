'use client';
import type { ResultadoCapsula } from '@/lib/engine';
import {
  CAPACIDAD_TRABAJO_ML, CAPACIDAD_CUERPO_ML, CAPACIDAD_TAPA_ML,
  MINIMO_ACEPTADO_ML, OBJETIVO_LLENADO_ML, fmtMl, fmtPct,
} from '@/lib/engine';

const COLORES = ['#10b981', '#0ea5e9', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16'];

import type { Tinta } from '@/db/schema';

export default function ResultadosPanel({
  resultado,
  tintas,
  manual,
  onCambiarDivision,
  onAplicarDilucion,
}: {
  resultado: ResultadoCapsula;
  tintas: Tinta[];
  manual: boolean;
  onCambiarDivision: (v: 'auto' | number) => void;
  onAplicarDilucion: () => void;
}) {
  const r = resultado;
  const segments = r.capas
    .filter((c) => (c.extrusion ?? 0) > 0)
    .map((c, i) => ({
      nombre: c.tinta || c.activoReceta,
      pct: ((c.extrusion ?? 0) / CAPACIDAD_TRABAJO_ML) * 100,
      vol: c.extrusion ?? 0,
      color: COLORES[i % COLORES.length],
    }));
  const alertas = Array.from(new Set(r.capas.filter((c) => c.alerta).map((c) => `${c.tinta}: ${c.alerta}`)));
  const manoplas = r.capas.filter((c) => c.aManopla).map((c) => c.tinta);

  return (
    <div className="card sticky top-4 space-y-4 p-4">
      <h3 className="section-title">🧪 Resultados</h3>

      {/* AVISO ROJO de división — imposible de no ver */}
      {r.seDivide && (
        <div className="aviso-rojo animate-pulse text-center text-base">
          🔴 SE DIVIDE EN {r.capsulasPorToma} CÁPSULAS POR TOMA
        </div>
      )}

      {/* Cápsula visual */}
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-semibold">Ocupación de cápsula</span>
          <span className="font-bold text-slate-700">{r.ocupacionPct.toFixed(1)}%</span>
        </div>
        <div className="relative h-14 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100">
          <div className="absolute inset-0 flex">
            {segments.map((s, i) => (
              <div key={i} style={{ width: `${Math.min(s.pct, 100)}%`, background: s.color }}
                title={`${s.nombre}: ${fmtMl(s.vol)}`} className="transition-all duration-300" />
            ))}
          </div>
        </div>
        {segments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {segments.map((s, i) => (
              <span key={i} className="flex items-center gap-1 text-xs">
                <span className="h-3 w-3 rounded" style={{ background: s.color }} />
                <span className="max-w-[110px] truncate">{s.nombre}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Números clave */}
      <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
        <div className="flex justify-between">
          <span>Volumen total:</span><b>{fmtMl(r.volumenTotal)}</b>
        </div>
        <div className="flex justify-between">
          <span>Capacidad de trabajo:</span><b>{CAPACIDAD_TRABAJO_ML} mL</b>
        </div>
        <div className={`flex justify-between ${r.excedeCuerpo ? 'font-bold text-red-600' : ''}`}>
          <span>Cuerpo:</span>
          <span>{fmtMl(r.volumenCuerpo)} / {CAPACIDAD_CUERPO_ML} mL {r.excedeCuerpo && '⚠'}</span>
        </div>
        <div className={`flex justify-between ${r.excedeTapa ? 'font-bold text-red-600' : ''}`}>
          <span>Tapa:</span>
          <span>{fmtMl(r.volumenTapa)} / {CAPACIDAD_TAPA_ML} mL {r.excedeTapa && '⚠'}</span>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 pt-2">
          <span>Cápsulas por toma:</span>
          <span className="flex items-center gap-2">
            <span className={`badge ${r.seDivide ? 'bg-red-100 text-red-700' : 'bg-teal-50 text-teal-700'} text-base`}>
              {r.capsulasPorToma}
            </span>
            <select className="input w-auto py-1 text-xs"
              value={manual ? String(r.capsulasPorToma) : 'auto'}
              onChange={(e) => onCambiarDivision(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}>
              <option value="auto">Auto ({r.capsulasPorTomaAuto})</option>
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>forzar {n}</option>)}
            </select>
          </span>
        </div>
      </div>

      {/* Cápsula vacía + sugerencia de dilución */}
      {r.muyVacia && (
        <div className="alerta-quimica">
          ⚠ La cápsula queda <b>demasiado vacía</b> ({fmtMl(r.volumenTotal)} &lt; {MINIMO_ACEPTADO_ML} mL).
        </div>
      )}
      {r.sugerenciaDilucion && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <p className="mb-2">
            💡 <b>Sugerencia:</b> diluir <b>{r.sugerenciaDilucion.tinta}</b> de{' '}
            {fmtPct(r.sugerenciaDilucion.concentracionActual)} a{' '}
            <b>{fmtPct(r.sugerenciaDilucion.concentracionSugerida, 3)}</b> para llenar{' '}
            {OBJETIVO_LLENADO_ML} mL (el IP se mantiene).
          </p>
          <button className="btn-primary w-full py-1.5 text-xs" onClick={onAplicarDilucion}>
            Aplicar dilución en la capa
          </button>
        </div>
      )}

      {/* Alertas químicas */}
      {alertas.map((a, i) => (
        <div key={i} className="alerta-quimica">⚠ {a}</div>
      ))}
      {manoplas.length > 0 && (
        <div className="alerta-quimica">🧤 A manopla (no se imprime): {manoplas.join(', ')}</div>
      )}

      {/* Configuración de impresora por tinta */}
      <ConfigImpresora capas={r.capas} tintas={tintas} />
    </div>
  );
}

function ConfigImpresora({ capas, tintas }: { capas: ResultadoCapsula['capas']; tintas: Tinta[] }) {
  const conParametros = capas
    .filter((c) => c.tintaId)
    .map((c) => ({ capa: c, tinta: tintas.find((t) => t.id === c.tintaId) }))
    .filter((x) => x.tinta?.parametros);
  if (conParametros.length === 0) return null;
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">🖨️ Configuración de impresora</p>
      {conParametros.map(({ capa, tinta }) => {
        const p = tinta!.parametros!;
        const tiles: [string, string | number][] = [
          ['Temp', `${p.temp}°C`],
          ['Vel.Ext', p.velExt],
          ['Vel.Ret', p.velRet],
          ['Retrac.', p.retraccion],
          ['Pausa', p.pausa],
          ['Descarte', p.descarte],
          ['P.Bal', p.pausaBal],
        ];
        return (
          <div key={capa.ref}>
            <p className="mb-1 truncate text-xs font-medium text-slate-600">
              Capa {capa.ref} · {tinta!.nombre}
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {tiles.map(([label, val]) => (
                <div key={label} className="tile">
                  <span className="text-sm font-bold leading-tight">{val}</span>
                  <span className="text-[10px] text-slate-400">{label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
