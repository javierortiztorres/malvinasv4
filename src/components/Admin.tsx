'use client';
import { useMemo, useState } from 'react';
import type { Catalogos } from '@/app/page';
import type { Tinta, ExcipienteTinta, ParametrosImpresion } from '@/db/schema';
import { fmtPct } from '@/lib/engine';

// =================== GESTIÓN ===================
// Principio I+D: TODO lo de una tinta es editable acá —
// concentración, IP, excipientes con sus fracciones exactas,
// parámetros de impresora, alertas, keywords de mapeo y POE.

export default function Admin({ catalogos, onCambio }: { catalogos: Catalogos; onCambio: () => void }) {
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Tinta | 'nueva' | null>(null);

  const tintasFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase();
    return catalogos.tintas.filter((t) => t.nombre.toLowerCase().includes(q));
  }, [catalogos.tintas, busqueda]);

  async function borrarTinta(id: number) {
    if (!confirm('¿Eliminar esta tinta del catálogo?')) return;
    await fetch('/api/catalogos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabla: 'tintas', id }),
    });
    onCambio();
  }

  return (
    <div className="space-y-5">
      {/* ---------- TINTAS ---------- */}
      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="section-title mb-0">🧪 Tintas (productos intermedios) · {catalogos.tintas.length}</h3>
          <div className="flex gap-2">
            <input className="input w-64" placeholder="Buscar tinta…" value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)} />
            <button className="btn-primary" onClick={() => setEditando('nueva')}>+ Nueva tinta</button>
          </div>
        </div>
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="py-1.5">Tinta</th><th>Conc.</th><th>IP</th>
                <th>Ubicación</th><th>POE</th><th>Excipientes</th><th></th>
              </tr>
            </thead>
            <tbody>
              {tintasFiltradas.map((t) => (
                <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-1.5 pr-2 font-medium">
                    {t.nombre}
                    {t.aManopla && <span className="ml-1 badge bg-slate-100 text-slate-600">🧤 manopla</span>}
                    {t.alerta && <span className="ml-1" title={t.alerta}>⚠️</span>}
                  </td>
                  <td className="pr-2">{fmtPct(t.concentracion)}</td>
                  <td className="pr-2">{t.ip}</td>
                  <td className="pr-2">
                    <span className={`badge ${t.ubicacion === 'tapa' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}
                      title={t.ubicacion === 'tapa' ? 'Puede ir a la tapa si el cuerpo supera 0.9 mL' : 'Siempre al cuerpo'}>
                      {t.ubicacion === 'tapa' ? 'apta tapa' : 'cuerpo'}
                    </span>
                    {t.convMgPorUnidad ? (
                      <span className="ml-1 badge bg-violet-50 text-violet-700"
                        title={`Conversión: 1 ${t.convUnidad} = ${t.convMgPorUnidad} mg de materia prima`}>
                        {t.convUnidad}→mg
                      </span>
                    ) : null}
                  </td>
                  <td className="pr-2 font-mono text-xs">{t.poe || '—'}</td>
                  <td className="pr-2 text-xs text-slate-500">
                    {(t.excipientes ?? []).map((e) => `${e.nombre} ${Number((e.fraccion * 100).toFixed(2))}%`).join(' · ') || '—'}
                  </td>
                  <td className="whitespace-nowrap">
                    <button className="mr-2 text-slate-400 hover:text-teal-700" onClick={() => setEditando(t)}>✎</button>
                    <button className="text-red-500" onClick={() => borrarTinta(t.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Catálogos simples ---------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <CatalogoSimple titulo="Excipientes del rótulo" tabla="excipientes"
          items={catalogos.excipientes} campos={[{ key: 'nombre', label: 'Nombre' }]} onCambio={onCambio} />
        <CatalogoSimple titulo="Médicos" tabla="medicos" items={catalogos.medicos}
          campos={[{ key: 'nombre', label: 'Apellido y nombre' }, { key: 'matricula', label: 'Matrícula' }]}
          onCambio={onCambio} />
        <CatalogoSimple titulo="Operadores y supervisores" tabla="operadores" items={catalogos.operadores}
          campos={[{ key: 'nombre', label: 'Nombre' }, { key: 'rol', label: 'produce | revisa' }]}
          onCambio={onCambio} />
      </div>

      {editando && (
        <TintaModal
          tinta={editando === 'nueva' ? null : editando}
          excipientesCatalogo={catalogos.excipientes.map((e) => e.nombre)}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); onCambio(); }}
        />
      )}
    </div>
  );
}

// =================== Modal de tinta (edición completa) ===================
const PARAMS_DEFAULT: ParametrosImpresion = {
  temp: 70, retraccion: 0.05, pausa: 0.5, velExt: 100, velRet: 100, descarte: 0.1, pausaBal: 1.5,
};

function TintaModal({
  tinta,
  excipientesCatalogo,
  onCerrar,
  onGuardado,
}: {
  tinta: Tinta | null;
  excipientesCatalogo: string[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [t, setT] = useState({
    nombre: tinta?.nombre ?? '',
    keywords: tinta?.keywords ?? '',
    concentracion: tinta ? tinta.concentracion * 100 : 50,
    ip: tinta?.ip ?? 1,
    aManopla: tinta?.aManopla ?? false,
    ubicacion: tinta?.ubicacion ?? 'cuerpo',
    convUnidad: tinta?.convUnidad ?? '',
    convMgPorUnidad: tinta?.convMgPorUnidad ?? null as number | null,
    excipientes: (tinta?.excipientes ?? []) as ExcipienteTinta[],
    parametros: (tinta?.parametros ?? PARAMS_DEFAULT) as ParametrosImpresion,
    alerta: tinta?.alerta ?? '',
    poe: tinta?.poe ?? '',
  });
  const [error, setError] = useState('');

  // SEMÁNTICA v2.0.4: los % de excipientes son sobre el TOTAL de la tinta.
  // Activo (concentración) + excipientes = 100%.
  // Ej: Pregnenolona 5,7% → excipientes deben sumar 94,3%.
  const objetivoExc = Math.max(0, 1 - (t.concentracion || 0) / 100);
  const sumaFracciones = t.excipientes.reduce((s, e) => s + (e.fraccion || 0), 0);
  const fraccionesOk = t.excipientes.length === 0 || Math.abs(sumaFracciones - objetivoExc) < 0.002;

  // Completa el último excipiente con lo que falta para llegar a 100%
  // (el clásico "c.s.p."): restante = objetivo − suma de los demás.
  const completarRestante = () =>
    setT((p) => {
      if (p.excipientes.length === 0) return p;
      const otros = p.excipientes.slice(0, -1).reduce((s, e) => s + (e.fraccion || 0), 0);
      const resto = Math.max(0, Number((objetivoExc - otros).toFixed(6)));
      return {
        ...p,
        excipientes: p.excipientes.map((e, j) => (j === p.excipientes.length - 1 ? { ...e, fraccion: resto } : e)),
      };
    });

  const setExc = (i: number, patch: Partial<ExcipienteTinta>) =>
    setT((p) => ({ ...p, excipientes: p.excipientes.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));

  async function guardar() {
    if (!t.nombre.trim()) { setError('Falta el nombre'); return; }
    if (!fraccionesOk) {
      setError(`Activo + excipientes deben sumar 100%: con ${Number(t.concentracion.toFixed(4))}% de activo, los excipientes tienen que sumar ${Number((objetivoExc * 100).toFixed(4))}%`);
      return;
    }
    const body = {
      tabla: 'tintas',
      ...(tinta ? { id: tinta.id } : {}),
      nombre: t.nombre.trim(),
      keywords: t.keywords,
      concentracion: t.concentracion / 100,
      ip: t.ip,
      aManopla: t.aManopla,
      ubicacion: t.ubicacion,
      convUnidad: t.convUnidad.trim(),
      convMgPorUnidad: t.convMgPorUnidad && t.convMgPorUnidad > 0 ? t.convMgPorUnidad : null,
      excipientes: t.excipientes,
      parametros: t.parametros,
      alerta: t.alerta,
      poe: t.poe,
    };
    const res = await fetch('/api/catalogos', {
      method: tinta ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'No se pudo guardar');
      return;
    }
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
      <div className="card max-h-[92vh] w-full max-w-2xl space-y-4 overflow-auto p-5"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{tinta ? `Editar: ${tinta.nombre}` : 'Nueva tinta'}</h3>
          <button onClick={onCerrar}>✕</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Nombre (con concentración, ej: Vit C 50%)</label>
            <input className="input" value={t.nombre} onChange={(e) => setT({ ...t, nombre: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Keywords para mapear recetas (separadas por coma)</label>
            <input className="input" placeholder="vit. c, vitamina c, acido ascorbico" value={t.keywords}
              onChange={(e) => setT({ ...t, keywords: e.target.value })} />
          </div>
          <div>
            <label className="label">Concentración (%)</label>
            <input className="input" type="number" step="any" value={t.concentracion}
              onChange={(e) => setT({ ...t, concentracion: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">IP (Índice Palmieri)</label>
            <input className="input" type="number" step="any" value={t.ip}
              onChange={(e) => setT({ ...t, ip: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Ubicación en la cápsula</label>
            <select className="input" value={t.ubicacion} onChange={(e) => setT({ ...t, ubicacion: e.target.value })}>
              <option value="cuerpo">Cuerpo siempre (ej. oleogel)</option>
              <option value="tapa">Apta para tapa (PEG/CoQ10/Ideb.)</option>
            </select>
            <p className="mt-1 text-[11px] text-slate-400">
              &quot;Apta para tapa&quot; NO significa que va siempre a la tapa: la tapa
              solo se usa cuando el cuerpo supera 0.9 mL.
            </p>
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={t.aManopla} onChange={(e) => setT({ ...t, aManopla: e.target.checked })} />
              🧤 A manopla (no se imprime)
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Nº POE (para el lote de PI, ej: FPI.01.PI003)</label>
            <input className="input" value={t.poe} onChange={(e) => setT({ ...t, poe: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Alerta química (aparece al usar la tinta)</label>
            <input className="input" placeholder="ej: MALAXAR previamente antes de cargar en jeringa"
              value={t.alerta} onChange={(e) => setT({ ...t, alerta: e.target.value })} />
          </div>
          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <label className="label mb-2">Conversión de dosis (opcional) — si la receta viene en otra unidad</label>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-32">
                <label className="label">Unidad de receta</label>
                <input className="input" list="dl-conv-unidades" placeholder="UI / µg"
                  value={t.convUnidad} onChange={(e) => setT({ ...t, convUnidad: e.target.value })} />
                <datalist id="dl-conv-unidades">
                  <option value="UI" /><option value="µg" /><option value="ml" />
                </datalist>
              </div>
              <div className="w-48">
                <label className="label">mg de materia prima por unidad</label>
                <input className="input" type="number" step="any" placeholder="ej: 0.5"
                  value={t.convMgPorUnidad ?? ''}
                  onChange={(e) => setT({ ...t, convMgPorUnidad: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <p className="min-w-48 flex-1 text-[11px] leading-snug text-slate-500">
                Ej: levadura de selenio al 0,2% de Se → unidad <b>µg</b>, factor <b>0,5</b>
                &nbsp;(100 µg de selenio = 50 mg de levadura). La dosis en mg se calcula sola
                al mapear la receta.
              </p>
            </div>
          </div>
        </div>

        {/* Excipientes: % sobre el TOTAL de la tinta (activo + excipientes = 100%) */}
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <label className="label mb-0">Excipientes (% del total de la tinta)</label>
            <span className={`badge ${fraccionesOk || t.excipientes.length === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              Activo {Number(t.concentracion.toFixed(4))}% + excip. {Number((sumaFracciones * 100).toFixed(4))}%
              {' = '}{Number(((t.concentracion / 100 + sumaFracciones) * 100).toFixed(4))}%
              {fraccionesOk || t.excipientes.length === 0 ? ' ✓' : ' ≠ 100%'}
            </span>
          </div>
          {t.excipientes.length > 0 && (
            <div className="mb-1 grid grid-cols-[minmax(0,1fr)_6.5rem_1.5rem] gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span>Cuál excipiente es</span>
              <span>% del total</span>
              <span />
            </div>
          )}
          {t.excipientes.map((e, i) => (
            <div key={i} className="mb-1.5 grid grid-cols-[minmax(0,1fr)_6.5rem_1.5rem] items-center gap-2">
              <input className="input" list="dl-excipientes-tinta" placeholder="Nombre (ej: PEG 4000)"
                autoFocus={!e.nombre} value={e.nombre}
                onChange={(ev) => setExc(i, { nombre: ev.target.value })} />
              <input className="input" type="number" step="any" placeholder="%"
                value={Number((e.fraccion * 100).toFixed(4))}
                onChange={(ev) => setExc(i, { fraccion: Number(ev.target.value) / 100 })} />
              <button className="text-red-500"
                onClick={() => setT((p) => ({ ...p, excipientes: p.excipientes.filter((_, j) => j !== i) }))}>✕</button>
            </div>
          ))}
          <datalist id="dl-excipientes-tinta">
            {excipientesCatalogo.map((n) => <option key={n} value={n} />)}
          </datalist>
          <div className="flex gap-2">
            <button className="btn-ghost text-xs"
              onClick={() => setT((p) => ({ ...p, excipientes: [...p.excipientes, { nombre: '', fraccion: 0 }] }))}>
              + Agregar excipiente
            </button>
            {t.excipientes.length > 0 && !fraccionesOk && (
              <button className="btn-ghost text-xs text-teal-700" title="Completa el último excipiente con lo que falta para llegar a 100% (c.s.p.)"
                onClick={completarRestante}>
                ⚖ Completar restante en el último ({Number((Math.max(0, objetivoExc - t.excipientes.slice(0, -1).reduce((s, e) => s + (e.fraccion || 0), 0)) * 100).toFixed(4))}%)
              </button>
            )}
          </div>
        </div>

        {/* Parámetros de impresora */}
        <div>
          <label className="label">Parámetros de impresora</label>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {([['temp', 'Temp ºC'], ['velExt', 'Vel.Ext'], ['velRet', 'Vel.Ret'], ['retraccion', 'Retrac.'],
               ['pausa', 'Pausa'], ['descarte', 'Descarte'], ['pausaBal', 'P.Bal']] as const).map(([k, label]) => (
              <div key={k}>
                <p className="mb-0.5 text-center text-[10px] text-slate-400">{label}</p>
                <input className="input px-1 text-center" type="number" step="any"
                  value={t.parametros[k]}
                  onChange={(e) => setT({ ...t, parametros: { ...t.parametros, [k]: Number(e.target.value) } })} />
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primary" onClick={guardar}>Guardar tinta</button>
        </div>
      </div>
    </div>
  );
}

// =================== Catálogos simples ===================
function CatalogoSimple({
  titulo, tabla, items, campos, onCambio,
}: {
  titulo: string;
  tabla: string;
  items: any[];
  campos: { key: string; label: string }[];
  onCambio: () => void;
}) {
  const [nuevo, setNuevo] = useState<Record<string, string>>({});

  async function agregar() {
    if (!nuevo.nombre?.trim()) return;
    const res = await fetch('/api/catalogos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabla, ...nuevo }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? 'No se pudo agregar');
      return;
    }
    setNuevo({});
    onCambio();
  }

  async function editar(item: any) {
    const datos: Record<string, string> = {};
    for (const c of campos) {
      const v = prompt(`${c.label}:`, item[c.key] ?? '');
      if (v === null) return;
      datos[c.key] = v.trim();
    }
    if (!datos.nombre) return;
    const res = await fetch('/api/catalogos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabla, id: item.id, ...datos }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? 'No se pudo editar');
      return;
    }
    onCambio();
  }

  async function borrar(id: number) {
    if (!confirm('¿Eliminar este ítem?')) return;
    await fetch('/api/catalogos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabla, id }),
    });
    onCambio();
  }

  return (
    <div className="card p-5">
      <h3 className="mb-3 font-bold">{titulo}</h3>
      <ul className="mb-3 max-h-56 space-y-1 overflow-auto text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1">
            <span>
              {item.nombre}
              {item.matricula && <span className="text-slate-400"> · MP {item.matricula}</span>}
              {item.rol && <span className="text-slate-400"> · {item.rol}</span>}
            </span>
            <span className="flex gap-2">
              <button className="text-slate-400 hover:text-teal-700" onClick={() => editar(item)}>✎</button>
              <button className="text-red-500" onClick={() => borrar(item.id)}>✕</button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {campos.map((c) => (
          <input key={c.key} className="input flex-1" placeholder={c.label}
            value={nuevo[c.key] ?? ''}
            onChange={(e) => setNuevo((n) => ({ ...n, [c.key]: e.target.value }))} />
        ))}
        <button className="btn-primary" onClick={agregar}>+</button>
      </div>
    </div>
  );
}
