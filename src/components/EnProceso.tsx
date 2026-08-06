'use client';
import { useEffect, useState } from 'react';
import type { Registro } from '@/db/schema';
import type { Catalogos } from '@/app/page';
import { colorDeGrupo } from '@/lib/colors';
import { coincideFiltro, diasHasta, fechaAR, fechaHoraAR, formatoLote } from '@/lib/utils';
import {
  destinosDisponibles, estadoPT, esAvance, datetimeLocalDeFecha, LABEL_ESTADO, type EstadoActivo,
} from '@/lib/estadoPT';
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
  estadoActual,
  focoInicialId,
  onFocoConsumido,
  rol,
}: {
  registros: Registro[];
  catalogos: Catalogos;
  onCambio: () => void;
  onActualizado: (r: Registro) => void;
  // Cuál de las 3 solapas activas (Pendientes / Pre-producción / En
  // producción) es esta instancia — decide qué botones de movimiento se
  // ofrecen (B-31).
  estadoActual: EstadoActivo;
  // Foco pedido desde afuera (ej. click en un evento de la Agenda): se
  // aplica una sola vez y se avisa al padre para que no se re-dispare.
  focoInicialId?: number | null;
  onFocoConsumido?: () => void;
  rol?: string;
}) {
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    if (focoInicialId == null) return;
    if (!registros.some((r) => r.id === focoInicialId)) return;
    setAbiertoId(focoInicialId);
    onFocoConsumido?.();
  }, [focoInicialId, registros, onFocoConsumido]);
  // Si el navegador bloquea el popup al terminar un PT, la tarjeta ya
  // volvió a la lista (modo foco se cierra) cuando llega la respuesta: el
  // aviso vive acá arriba, no en RegistroEditor, para no perderse.
  const [avisoDoc, setAvisoDoc] = useState<string | null>(null);

  // Mueve el registro a otra de las 3 solapas activas (B-31). El servidor
  // vuelve a validar el permiso por rol y aplica los efectos automáticos
  // (timestamp de inicio, indicador de "devuelto") — acá solo se pide.
  //
  // Si el registro estaba abierto en modo foco, cierra la vista apenas se
  // confirma el movimiento: RegistroEditor guarda su propia copia local (el
  // autosave) que no se entera de este cambio, así que dejarlo montado
  // arriesgaría que un autoguardado posterior pise el estado nuevo con el
  // viejo. Sale solo de vuelta a la lista, que ya no lo va a mostrar acá.
  const [moviendoId, setMoviendoId] = useState<number | null>(null);
  async function moverA(r: Registro, destino: EstadoActivo) {
    setMoviendoId(r.id);
    try {
      const res = await fetch(`/api/registros/${r.id}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destino }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? 'No se pudo mover el registro.');
        return;
      }
      const actualizado = await res.json();
      onActualizado(actualizado);
      setAbiertoId((id) => (id === r.id ? null : id));
    } catch {
      alert('No se pudo mover el registro. Revisá la conexión.');
    } finally {
      setMoviendoId(null);
    }
  }

  const visibles = ordenarPorDeadline(
    registros.filter((r) =>
      coincideFiltro(
        filtro,
        r.paciente, r.medico, r.tituloFormula, r.indicacion,
        formatoLote(r.lotePrefijo, r.loteNumero),
        (r.formula ?? []).map((a) => a.activo).join(' ')
      )
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
            <BotonesMovimiento registro={abierto} rol={rol} moviendo={moviendoId === abierto.id} onMover={moverA} />
          </div>
          <BadgeDevuelto registro={abierto} />
          <RegistroEditor
            key={abierto.id}
            registro={abierto}
            catalogos={catalogos}
            colorPaciente={color}
            onCambio={onCambio}
            onActualizado={onActualizado}
            onPopupBloqueado={setAvisoDoc}
            rol={rol}
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

      {avisoDoc && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-amber-500 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">
            ⚠ El navegador bloqueó la pestaña del documento del PT recién terminado.
          </p>
          <div className="flex items-center gap-2">
            <a className="btn-primary" href={avisoDoc} target="_blank" rel="noopener"
              onClick={() => setAvisoDoc(null)}>
              📄 Abrir documento
            </a>
            <button className="btn-ghost" onClick={() => setAvisoDoc(null)}>✕</button>
          </div>
        </div>
      )}

      {registros.length === 0 && !filtro && (
        <div className="card p-8 text-center text-slate-500">
          {estadoActual === 'en_produccion'
            ? 'No hay registros en producción. Pasá los del día desde la solapa 📋 Pendientes o 🧱 Pre-producción.'
            : estadoActual === 'pre_produccion'
            ? 'No hay registros en pre-producción.'
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
              {r.devueltoPor && (
                <p className="text-xs font-semibold text-amber-700">
                  ↩ Devuelto por {r.devueltoPor}{r.devueltoEn && ` · ${fechaHoraAR(datetimeLocalDeFecha(r.devueltoEn))}`}
                </p>
              )}
              <p className="text-xs text-slate-400">
                {(r.formula ?? []).slice(0, 3).map((a) => a.activo).join(' · ')}
                {(r.formula ?? []).length > 3 && ` +${r.formula.length - 3}`}
              </p>
              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-xs font-semibold text-profundo">Abrir en pantalla completa →</p>
                <div onClick={(e) => e.stopPropagation()}>
                  <BotonesMovimiento registro={r} rol={rol} moviendo={moviendoId === r.id} onMover={moverA} compacto />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}

// Orden de las tarjetas: vencidas arriba de todo, después por proximidad
// de deadline, sin deadline al final. Desempate estable: lote más viejo
// primero (loteNumero) y, si no hay o empata, createdAt (siempre presente).
function ordenarPorDeadline(regs: Registro[]): Registro[] {
  return [...regs].sort((a, b) => {
    const da = diasHasta(a.deadline);
    const db = diasHasta(b.deadline);
    if (da === null && db === null) return ordenSecundario(a, b);
    if (da === null) return 1;
    if (db === null) return -1;
    if (da !== db) return da - db;
    return ordenSecundario(a, b);
  });
}

function ordenSecundario(a: Registro, b: Registro): number {
  if (a.loteNumero != null && b.loteNumero != null && a.loteNumero !== b.loteNumero) {
    return a.loteNumero - b.loteNumero;
  }
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
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

// Botones de movimiento manual entre Pendientes/Pre-producción/Producción
// (B-31): qué destinos aparecen depende del rol y del estado actual —
// puedeTransicionar() en @/lib/estadoPT es la única fuente de verdad, acá
// solo se pintan los botones que esa función habilita.
function BotonesMovimiento({
  registro, rol, moviendo, onMover, compacto,
}: {
  registro: Registro;
  rol?: string;
  moviendo: boolean;
  onMover: (r: Registro, destino: EstadoActivo) => void;
  compacto?: boolean;
}) {
  if (!rol) return null;
  const actual = estadoPT(registro);
  if (actual === 'terminado') return null;
  const destinos = destinosDisponibles(rol, actual);
  if (destinos.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${compacto ? '' : 'mt-2'}`}>
      {destinos.map((d) => {
        const avance = esAvance(actual, d);
        return (
          <button key={d} disabled={moviendo}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold disabled:opacity-50 ${
              avance ? 'bg-tussok text-profundo hover:opacity-90' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            title={`${avance ? 'Pasar a' : 'Devolver a'} ${LABEL_ESTADO[d]}`}
            onClick={() => onMover(registro, d)}>
            {avance ? '→' : '↩'} {LABEL_ESTADO[d]}
          </button>
        );
      })}
    </div>
  );
}

// Aviso de que el registro fue devuelto manualmente a un estado anterior
// (B-31): visible para cualquiera que lo vea después, para que no pase
// desapercibido. Se limpia solo la próxima vez que el registro avanza.
function BadgeDevuelto({ registro }: { registro: Registro }) {
  if (!registro.devueltoPor) return null;
  return (
    <p className="bg-amber-50 px-5 py-2 text-sm font-semibold text-amber-800">
      ↩ Devuelto por {registro.devueltoPor}
      {registro.devueltoEn && ` · ${fechaHoraAR(datetimeLocalDeFecha(registro.devueltoEn))}`}
    </p>
  );
}
