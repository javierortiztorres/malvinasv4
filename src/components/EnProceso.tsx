'use client';
import { useState } from 'react';
import type { Registro } from '@/db/schema';
import type { Catalogos } from '@/app/page';
import { colorDeGrupo } from '@/lib/colors';
import { coincideFiltro, diasHasta, fechaAR, formatoLote } from '@/lib/utils';
import RegistroEditor from './RegistroEditor';

// =====================================================================
// MODO FOCO: la lista muestra tarjetas compactas por paciente; al abrir
// una, ese paciente ocupa TODA la pantalla con marco y cabecera de su
// color (imposible cruzar datos). Chips arriba para saltar de paciente.
// =====================================================================

export default function EnProceso({
  registros,
  catalogos,
  onCambio,
  onActualizado,
  enProduccion,
}: {
  registros: Registro[];
  catalogos: Catalogos;
  onCambio: () => void;
  onActualizado: (r: Registro) => void;
  enProduccion: boolean;
}) {
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [filtro, setFiltro] = useState('');

  // Pasa el registro a la otra solapa (Pendientes ↔ En producción)
  async function mover(r: Registro) {
    const next = { ...r, enProduccion: !r.enProduccion, updatedAt: new Date() } as Registro;
    onActualizado(next); // cambio de solapa instantáneo
    try {
      const res = await fetch(`/api/registros/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error();
    } catch {
      onActualizado(r); // revertir si falló
      alert('No se pudo mover el registro. Revisá la conexión.');
    }
  }

  const visibles = registros.filter((r) =>
    coincideFiltro(
      filtro,
      r.paciente, r.medico, r.tituloFormula, r.indicacion,
      formatoLote(r.lotePrefijo, r.loteNumero),
      (r.formula ?? []).map((a) => a.activo).join(' ')
    )
  );

  if (registros.length === 0) {
    return (
      <div className="card p-10 text-center text-slate-500">
        No hay registros en proceso. Cargá una receta desde el <b>Lector de recetas</b>.
      </div>
    );
  }

  const abierto = registros.find((r) => r.id === abiertoId) ?? null;

  // ---------------- MODO FOCO: un paciente, pantalla entera ----------------
  if (abierto) {
    const color = colorDeGrupo(abierto.grupoPaciente || abierto.paciente);
    return (
      <div>
        {/* Selector rápido de pacientes en proceso */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={() => setAbiertoId(null)}>← Todos</button>
          {registros.map((r) => {
            const c = colorDeGrupo(r.grupoPaciente || r.paciente);
            const activo = r.id === abierto.id;
            return (
              <button key={r.id} onClick={() => setAbiertoId(r.id)}
                className={`rounded-full border-2 px-3 py-1 text-sm font-bold uppercase transition-all ${
                  activo ? 'scale-105 shadow' : 'opacity-60 hover:opacity-100'
                }`}
                style={{ background: c.bg, borderColor: c.border }}>
                {r.paciente || 'SIN NOMBRE'} · {r.tituloFormula}
                {r.capsulasTotales ? ` · ${r.capsulasTotales} cáps` : ''}
              </button>
            );
          })}
        </div>

        {/* Marco completo del color del paciente */}
        <div className="overflow-hidden rounded-2xl border-4 bg-white shadow-sm"
          style={{ borderColor: color.border }}>
          <div className="sticky top-0 z-10 px-5 py-3"
            style={{ background: color.bg, borderBottom: `4px solid ${color.border}` }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-3xl font-black uppercase leading-none tracking-tight">
                {abierto.paciente || 'SIN NOMBRE'}
                {abierto.capsulasTotales ? (
                  <span className="ml-2 text-xl font-bold normal-case">({abierto.capsulasTotales} cápsulas)</span>
                ) : null}
              </p>
              <p className="text-sm font-semibold">
                Fórmula {abierto.tituloFormula || '—'}
                {abierto.indicacion && <> · {abierto.indicacion}</>} · Lote{' '}
                <b>{formatoLote(abierto.lotePrefijo, abierto.loteNumero)}</b>
              </p>
            </div>
          </div>
          <RegistroEditor
            key={abierto.id}
            registro={abierto}
            catalogos={catalogos}
            colorPaciente={color}
            onCambio={onCambio}
            onActualizado={onActualizado}
          />
        </div>
      </div>
    );
  }

  // ---------------- LISTA: tarjetas compactas ----------------
  return (
    <div className="space-y-3">
      <input className="input max-w-md" placeholder="🔍 Buscar por paciente, médico, lote, activo…"
        value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      {registros.length === 0 && !filtro && (
        <div className="card p-8 text-center text-slate-500">
          {enProduccion
            ? 'No hay registros en producción. Pasá los del día desde la solapa 📋 Pendientes.'
            : 'No hay registros pendientes.'}
        </div>
      )}
      {visibles.length === 0 && filtro && (
        <div className="card p-8 text-center text-slate-500">Ningún paciente coincide con la búsqueda.</div>
      )}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visibles.map((r) => {
        const color = colorDeGrupo(r.grupoPaciente || r.paciente);
        return (
          <div key={r.id} role="button" tabIndex={0}
            className="card cursor-pointer overflow-hidden text-left transition-transform hover:scale-[1.01]"
            style={{ borderColor: color.border, borderWidth: 2 }}
            onClick={() => setAbiertoId(r.id)}
            onKeyDown={(e) => e.key === 'Enter' && setAbiertoId(r.id)}>
            <div className="px-4 py-3" style={{ background: color.bg, borderBottom: `4px solid ${color.border}` }}>
              <p className="text-2xl font-black uppercase leading-none tracking-tight">
                {r.paciente || 'SIN NOMBRE'}
                {r.capsulasTotales ? (
                  <span className="ml-1.5 text-base font-bold normal-case">({r.capsulasTotales} cápsulas)</span>
                ) : null}
              </p>
            </div>
            <div className="space-y-1 px-4 py-3 text-sm text-slate-600">
              <p>Fórmula <b>{r.tituloFormula || '—'}</b>{r.indicacion && <> · {r.indicacion}</>}</p>
              <p>Médico <b>{r.medico || '—'}</b></p>
              <p>Lote <b>{formatoLote(r.lotePrefijo, r.loteNumero)}</b></p>
              <DeadlineBadge deadline={r.deadline} />
              <p className="text-xs text-slate-400">
                {(r.formula ?? []).slice(0, 3).map((a) => a.activo).join(' · ')}
                {(r.formula ?? []).length > 3 && ` +${r.formula.length - 3}`}
              </p>
              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-xs font-semibold text-teal-700">Abrir en pantalla completa →</p>
                <button
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                    enProduccion
                      ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                  title={enProduccion ? 'Sacar de producción (vuelve a Pendientes)' : 'Pasar a la solapa En producción'}
                  onClick={(e) => { e.stopPropagation(); mover(r); }}>
                  {enProduccion ? '↩ A pendientes' : '🖨️ A producción'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}

// Semáforo de fecha límite de entrega: rojo ≤3 días (o vencida),
// amarillo ≤5 días, gris el resto. No se muestra si no hay deadline.
function DeadlineBadge({ deadline }: { deadline: string }) {
  const dias = diasHasta(deadline);
  if (dias === null) return null;
  const clase =
    dias <= 3 ? 'bg-red-100 text-red-700' : dias <= 5 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
  const texto =
    dias < 0 ? `vencida hace ${-dias} día${dias === -1 ? '' : 's'}`
    : dias === 0 ? '¡sale HOY!'
    : `faltan ${dias} día${dias === 1 ? '' : 's'}`;
  return (
    <p>
      <span className={`badge ${clase}`}>⏰ Entrega {fechaAR(deadline)} · {texto}</span>
    </p>
  );
}
