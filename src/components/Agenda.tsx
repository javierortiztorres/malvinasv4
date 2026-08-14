'use client';
import { useState } from 'react';
import { diasHasta, fechaAR, hoyISO, sumarMeses } from '@/lib/utils';

// =====================================================================
// AGENDA: pantalla principal. Reemplaza el Google Calendar en el que
// Tomi llevaba a mano "qué receta sale qué día". Semana Lun→Dom (arranque
// de semana elegido acá, no hay convención previa en el proyecto) y mes
// en grilla de 6 semanas. Fechas siempre en base a hoyISO()/diasHasta()
// (huso Argentina) — nunca new Date() crudo, ver lecciones B-07/B-15.
//
// Genérica desde B-30b: no conoce Registro/RegistroPi — cada solapa
// (PT para Admin/Impresión, PI para Formulación) le pasa sus propios
// "eventos" ya adaptados. La navegación al hacer click queda 100% a
// cargo de quien la usa (onIrAEvento/onIrASinFecha), porque el destino
// depende de qué solapas tiene ese rol.
// =====================================================================

export type EventoAgenda = {
  id: number;
  deadline: string;
  titulo: string;
  subtitulo?: string;
  original: unknown;
  // Clases CSS que REEMPLAZAN el semáforo de urgencia por deadline. Lo usa
  // la Agenda de Atención al cliente (colores por ESTADO del pedido:
  // rojo/amarillo/verde/azul/gris) — las agendas de PT/PI no lo mandan y
  // siguen con el semáforo de siempre.
  clase?: string;
  // false = no cuenta para el badge de "vencidas" aunque el deadline haya
  // pasado (p.ej. pedidos ya entregados en la Agenda de Atención).
  vencible?: boolean;
};

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Suma/resta días a una fecha ISO tratándola como fecha "pura" (Date.UTC,
// mismo patrón que sumarMeses en utils.ts) para no arrastrar drift de huso.
function addDiasISO(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

function diaSemanaISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dom..6=Sáb
}

function inicioSemana(iso: string): string {
  const dow = diaSemanaISO(iso);
  const offset = dow === 0 ? -6 : 1 - dow; // retrocede hasta el lunes
  return addDiasISO(iso, offset);
}

function nombreMes(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}

// Mismos umbrales que DeadlineBadge en EnProceso.tsx — si cambian ahí,
// cambiar acá también (semáforo único de urgencia en toda la app).
function claseUrgencia(dias: number): string {
  return dias <= 3
    ? 'bg-red-100 text-red-700 border-red-300'
    : dias <= 5
    ? 'bg-amber-100 text-amber-800 border-amber-300'
    : 'bg-slate-100 text-slate-600 border-slate-300';
}

function EventoPill({ evento, onClick }: { evento: EventoAgenda; onClick: () => void }) {
  const dias = diasHasta(evento.deadline) ?? 0;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={`${evento.titulo || 'SIN NOMBRE'} · ${evento.subtitulo || ''}`}
      className={`block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-xs font-semibold ${evento.clase ?? claseUrgencia(dias)}`}
    >
      {evento.titulo || 'SIN NOMBRE'}
      {evento.subtitulo && <span className="font-normal opacity-75"> · {evento.subtitulo}</span>}
    </button>
  );
}

export default function Agenda({
  eventos,
  onIrAEvento,
  onIrASinFecha,
}: {
  eventos: EventoAgenda[];
  onIrAEvento: (original: unknown) => void;
  onIrASinFecha: () => void;
}) {
  const [vista, setVista] = useState<'semana' | 'mes'>('semana');
  const [ancla, setAncla] = useState(hoyISO());
  const hoy = hoyISO();

  const conFecha = eventos.filter((r) => r.deadline);
  const sinFecha = eventos.filter((r) => !r.deadline);
  const vencidas = conFecha
    .filter((r) => r.vencible !== false && (diasHasta(r.deadline) ?? 0) < 0)
    .sort((a, b) => (diasHasta(a.deadline) ?? 0) - (diasHasta(b.deadline) ?? 0));

  const porFecha = new Map<string, EventoAgenda[]>();
  for (const r of conFecha) {
    const arr = porFecha.get(r.deadline) ?? [];
    arr.push(r);
    porFecha.set(r.deadline, arr);
  }

  function irVencidas() {
    if (vencidas.length === 0) return;
    onIrAEvento(vencidas[0].original);
  }

  function anterior() {
    setAncla(vista === 'semana' ? addDiasISO(ancla, -7) : sumarMeses(ancla, -1));
  }
  function siguiente() {
    setAncla(vista === 'semana' ? addDiasISO(ancla, 7) : sumarMeses(ancla, 1));
  }

  const diasGrilla: string[] = vista === 'semana'
    ? Array.from({ length: 7 }, (_, i) => addDiasISO(inicioSemana(ancla), i))
    : Array.from({ length: 42 }, (_, i) => addDiasISO(inicioSemana(`${ancla.slice(0, 7)}-01`), i));

  const titulo = vista === 'semana'
    ? `${fechaAR(diasGrilla[0])} – ${fechaAR(diasGrilla[6])}`
    : nombreMes(`${ancla.slice(0, 7)}-01`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={anterior}>← Anterior</button>
          <button className="btn-ghost" onClick={() => setAncla(hoyISO())}>Hoy</button>
          <button className="btn-ghost" onClick={siguiente}>Siguiente →</button>
          <p className="ml-2 text-lg font-bold capitalize text-turba">{titulo}</p>
        </div>
        <div className="flex overflow-hidden rounded-xl border border-slate-200">
          {(['semana', 'mes'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`px-3 py-1.5 text-sm font-semibold capitalize ${
                vista === v ? 'bg-profundo text-hueso' : 'bg-white text-turba hover:bg-slate-50'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {vencidas.length > 0 && (
          <button
            onClick={irVencidas}
            className="badge border border-red-300 bg-red-100 text-red-700 hover:bg-red-200"
          >
            ⚠ {vencidas.length} receta{vencidas.length === 1 ? '' : 's'} vencida{vencidas.length === 1 ? '' : 's'}
          </button>
        )}
        {sinFecha.length > 0 && (
          <button
            onClick={onIrASinFecha}
            className="badge border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            {sinFecha.length} sin fecha
          </button>
        )}
      </div>

      {eventos.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          No hay registros en proceso todavía.
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {DIAS_SEMANA.map((d) => (
            <p key={d} className="text-center text-xs font-bold uppercase text-niebla">{d}</p>
          ))}
          {diasGrilla.map((iso) => {
            const eventosDia = porFecha.get(iso) ?? [];
            const esHoy = iso === hoy;
            const esOtroMes = vista === 'mes' && iso.slice(0, 7) !== ancla.slice(0, 7);
            return (
              <div
                key={iso}
                className={`rounded-xl border p-1.5 ${vista === 'semana' ? 'min-h-[260px]' : 'min-h-[92px]'} ${
                  esHoy ? 'border-2 border-tussok bg-tussok/5' : 'border-slate-200 bg-white'
                } ${esOtroMes ? 'opacity-40' : ''}`}
              >
                <p className={`mb-1 text-xs font-bold ${esHoy ? 'text-tussok' : 'text-slate-400'}`}>
                  {vista === 'semana' ? fechaAR(iso).slice(0, 5) : iso.slice(8, 10)}
                </p>
                <div className="space-y-1 overflow-y-auto" style={{ maxHeight: vista === 'semana' ? 220 : 70 }}>
                  {eventosDia.map((evento) => (
                    <EventoPill key={evento.id} evento={evento} onClick={() => onIrAEvento(evento.original)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
