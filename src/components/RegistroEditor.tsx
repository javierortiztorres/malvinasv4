'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Registro, CapaTinta, ActivoFormula } from '@/db/schema';
import type { Catalogos } from '@/app/page';
import { dosisPorCapsula, capsulasSugeridas, sumarMeses, hoyISO } from '@/lib/utils';
import { MESES_VENCIMIENTO } from '@/lib/config';
import { faltantes } from '@/lib/validation';
import {
  calcularCapsula, tintasParaActivo, capaDesdeTinta, extrusionCapa,
  autoUbicarCapas, dosisEnMgParaTinta, normUnidad, fmtMl, fmtPct,
} from '@/lib/engine';
import ResultadosPanel from './ResultadosPanel';

type Color = { bg: string; border: string; name: string };
const DRAFT_KEY = (id: number) => `draft-registro-${id}`;

export default function RegistroEditor({
  registro,
  catalogos,
  colorPaciente,
  onCambio,
  onActualizado,
}: {
  registro: Registro;
  catalogos: Catalogos;
  colorPaciente: Color;
  onCambio: () => void;
  onActualizado: (r: Registro) => void;
}) {
  // ---------------- Estado + persistencia híbrida (local + nube) ----------------
  const [r, setR] = useState<Registro>(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(DRAFT_KEY(registro.id));
      if (raw) {
        try {
          const draft = JSON.parse(raw);
          if (new Date(draft.updatedAt) > new Date(registro.updatedAt)) return draft;
        } catch {}
      }
    }
    return registro;
  });
  const [sync, setSync] = useState<'ok' | 'guardando' | 'pendiente'>('ok');
  const [errores, setErrores] = useState<string[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const rRef = useRef(r);
  rRef.current = r;

  const sincronizar = useCallback(async (data: Registro) => {
    setSync('guardando');
    try {
      const res = await fetch(`/api/registros/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      localStorage.removeItem(DRAFT_KEY(data.id));
      setSync('ok');
    } catch {
      setSync('pendiente');
    }
  }, []);

  const set = useCallback(
    (patch: Partial<Registro>) => {
      const next = { ...rRef.current, ...patch, updatedAt: new Date() } as Registro;
      rRef.current = next;
      setR(next);
      try {
        localStorage.setItem(DRAFT_KEY(next.id), JSON.stringify(next));
      } catch {}
      clearTimeout(timer.current);
      timer.current = setTimeout(() => sincronizar(next), 700);
      // Actualiza la lista en memoria del padre: al cambiar de paciente o
      // de solapa y volver, la tarjeta se re-monta con estos datos y no
      // con los de la carga inicial de la página.
      onActualizado(next);
    },
    [sincronizar, onActualizado]
  );

  useEffect(() => {
    const reintentar = () => {
      const raw = localStorage.getItem(DRAFT_KEY(registro.id));
      if (raw) sincronizar(JSON.parse(raw));
    };
    window.addEventListener('online', reintentar);
    return () => window.removeEventListener('online', reintentar);
  }, [registro.id, sincronizar]);

  // ---------------- MOTOR: resultado en vivo ----------------
  const resultado = useMemo(
    () => calcularCapsula(r.capas, { manual: r.capsulasPorTomaManual, capsulasPorToma: r.capsulasPorToma }),
    [r.capas, r.capsulasPorTomaManual, r.capsulasPorToma]
  );

  // Aplica cambios en capas recalculando división, ubicación cuerpo/tapa,
  // extrusiones y cápsulas totales
  const actualizarCapas = useCallback(
    (capas: CapaTinta[], extras: Partial<Registro> = {}) => {
      const manual = (extras.capsulasPorTomaManual ?? r.capsulasPorTomaManual) as boolean;
      const forzado = (extras.capsulasPorToma ?? r.capsulasPorToma) as number;
      const res = calcularCapsula(capas, { manual, capsulasPorToma: forzado });
      // La tapa solo se usa si el cuerpo supera 0.9 mL (tintas aptas, PEG).
      const capasUbicadas = autoUbicarCapas(capas, res.capsulasPorToma, catalogos.tintas);
      const capasFinal = capasUbicadas.map((c) => ({
        ...c,
        extrusionMl: extrusionCapa(c.dosisMg, c.concentracion, c.ip, res.capsulasPorToma),
      }));
      const sug = capsulasSugeridas(r.dias, res.capsulasPorToma);
      set({
        ...extras,
        capas: capasFinal,
        capsulasPorToma: res.capsulasPorToma,
        capsulasTotales: sug ?? r.capsulasTotales,
        aprobadas: sug ?? r.aprobadas,
      });
    },
    [r, set, catalogos.tintas]
  );

  const setCapa = (i: number, patch: Partial<CapaTinta>) =>
    actualizarCapas(r.capas.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const moverCapa = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= r.capas.length) return;
    const capas = [...r.capas];
    [capas[i], capas[j]] = [capas[j], capas[i]];
    actualizarCapas(capas.map((c, k) => ({ ...c, ref: k + 1 })));
  };

  const elegirTinta = (i: number, valor: string) => {
    if (valor === 'manual') {
      setCapa(i, { tintaId: null });
      return;
    }
    const t = catalogos.tintas.find((x) => x.id === Number(valor));
    if (!t) return;
    const dup = r.capas.some((c, j) => j !== i && c.tintaId === t.id);
    if (dup) {
      alert(`"${t.nombre}" ya está en otra capa. No se permiten productos intermedios duplicados.`);
      return;
    }
    // Si la tinta tiene factor de conversión para la unidad de la receta
    // (ej. selenio en µg, vit D en UI), la dosis en mg se recalcula.
    const capa = r.capas[i];
    const conv = dosisEnMgParaTinta(capa.dosisOriginal, capa.unidadOriginal, t);
    setCapa(i, {
      tintaId: t.id, tinta: t.nombre, concentracion: t.concentracion, ip: t.ip,
      poe: t.poe, alerta: t.alerta, aManopla: t.aManopla,
      // La ubicación vuelve a decidirse sola (cuerpo salvo cuerpo > 0.9 mL)
      ubicacion: 'cuerpo', ubicacionManual: false, aptaTapa: t.ubicacion === 'tapa',
      ...(conv.convertida ? { dosisMg: conv.mg } : {}),
    });
  };

  const aplicarDilucion = () => {
    const s = resultado.sugerenciaDilucion;
    if (!s) return;
    actualizarCapas(
      r.capas.map((c) => (c.ref === s.capaRef ? { ...c, concentracion: s.concentracionSugerida } : c))
    );
  };

  const cambiarDivision = (v: 'auto' | number) => {
    if (v === 'auto') actualizarCapas(r.capas, { capsulasPorTomaManual: false });
    else actualizarCapas(r.capas, { capsulasPorTomaManual: true, capsulasPorToma: v });
  };

  // ---------------- Acciones ----------------
  async function marcarTerminado() {
    const faltan = faltantes(r);
    if (faltan) { setErrores(faltan); return; }
    setErrores(null);
    const res = await fetch(`/api/registros/${r.id}?terminar=1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
    });
    if (res.ok) {
      localStorage.removeItem(DRAFT_KEY(r.id));
      onCambio();
    } else {
      const data = await res.json();
      setErrores(data.faltantes ?? ['Error del servidor']);
    }
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar el registro de ${r.paciente}?`)) return;
    await fetch(`/api/registros/${r.id}`, { method: 'DELETE' });
    localStorage.removeItem(DRAFT_KEY(r.id));
    onCambio();
  }

  const setActivo = (i: number, patch: Partial<ActivoFormula>) =>
    set({ formula: r.formula.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const toggleExcipiente = (nombre: string) => {
    const tiene = (r.excipientes ?? []).includes(nombre);
    set({ excipientes: tiene ? r.excipientes.filter((e) => e !== nombre) : [...r.excipientes, nombre] });
  };

  const estadoSync =
    sync === 'ok' ? '✔ guardado' : sync === 'guardando' ? '… guardando' : '⚠ pendiente de sincronizar (guardado local)';

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{estadoSync}</span>
          <button className="text-red-600 hover:underline" onClick={eliminar}>Eliminar registro</button>
        </div>

        {/* ---------- 0 · Esquema de impresión (resumen para el operador) ---------- */}
        <EsquemaImpresion r={r} resultado={resultado} />

        {/* ---------- 1 · Receta ---------- */}
        <section>
          <h3 className="section-title text-sm">📄 1 · Datos de la receta</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label">Paciente</label>
              <input className="input" list="dl-pacientes" value={r.paciente}
                onChange={(e) => set({ paciente: e.target.value })} />
              <datalist id="dl-pacientes">
                {catalogos.pacientes.map((p) => <option key={p.id} value={p.nombre} />)}
              </datalist>
            </div>
            <div>
              <label className="label">DNI</label>
              <input className="input" value={r.dni} onChange={(e) => set({ dni: e.target.value })} />
            </div>
            <div>
              <label className="label">Fecha receta</label>
              <input className="input" value={r.fechaReceta} onChange={(e) => set({ fechaReceta: e.target.value })} />
            </div>
            <div>
              <label className="label">Médico</label>
              <input className="input" list="dl-medicos" value={r.medico}
                onChange={(e) => {
                  const m = catalogos.medicos.find((x) => x.nombre === e.target.value);
                  set({ medico: e.target.value, ...(m ? { matricula: m.matricula } : {}) });
                }} />
              <datalist id="dl-medicos">
                {catalogos.medicos.map((m) => <option key={m.id} value={m.nombre} />)}
              </datalist>
            </div>
            <div>
              <label className="label">Matrícula (MP)</label>
              <input className="input" value={r.matricula} onChange={(e) => set({ matricula: e.target.value })} />
            </div>
            <div>
              <label className="label">Indicación médica</label>
              <input className="input" value={r.indicacion} onChange={(e) => set({ indicacion: e.target.value })} />
            </div>
          </div>
        </section>

        {/* ---------- 2 · Fórmula (rótulo) ---------- */}
        <section>
          <h3 className="section-title text-sm">🧾 2 · Fórmula según receta (dosis por toma)</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="py-1">Activo</th><th>Dosis</th><th>Unidad</th>
                <th className="text-teal-700">Por cápsula</th><th></th>
              </tr>
            </thead>
            <tbody>
              {r.formula.map((a, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1 pr-2">
                    <input className="input" value={a.activo} onChange={(e) => setActivo(i, { activo: e.target.value })} />
                  </td>
                  <td className="pr-2">
                    <input className="input w-24" type="number" step="any" value={a.dosis}
                      onChange={(e) => setActivo(i, { dosis: Number(e.target.value) })} />
                  </td>
                  <td className="pr-2">
                    <input className="input w-16" value={a.unidad} onChange={(e) => setActivo(i, { unidad: e.target.value })} />
                  </td>
                  <td className="pr-2 font-semibold text-teal-700">{dosisPorCapsula(a, r.capsulasPorToma)}</td>
                  <td>
                    <button className="text-red-500" onClick={() => set({ formula: r.formula.filter((_, j) => j !== i) })}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-ghost mt-2 text-xs"
            onClick={() => set({ formula: [...r.formula, { activo: '', dosis: 0, unidad: 'mg' }] })}>
            + Agregar activo
          </button>

          <div className="mt-3">
            <label className="label">Excipientes (click para agregar al rótulo) — c.s.p.</label>
            <div className="flex flex-wrap gap-2">
              {catalogos.excipientes.map((e) => {
                const on = (r.excipientes ?? []).includes(e.nombre);
                return (
                  <button key={e.id}
                    className={`rounded-full border px-3 py-1 text-sm ${
                      on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white'
                    }`}
                    onClick={() => toggleExcipiente(e.nombre)}>
                    {on && '✓ '}{e.nombre}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------- 3 · Capas y extrusiones (EL MOTOR) ---------- */}
        <section>
          <h3 className="section-title text-sm">⚙️ 3 · Capas, tintas y extrusiones</h3>
          <div className="space-y-2">
            {r.capas.map((c, i) => {
              const calc = resultado.capas[i];
              // Para sugerir tintas se usa la dosis ORIGINAL de la receta
              // (cada tinta convierte con su propio factor). Si la capa no
              // tiene dosis original (cargada a mano), se usa dosisMg como mg.
              const opciones = c.dosisOriginal != null
                ? tintasParaActivo(c.activoReceta, c.dosisOriginal, c.unidadOriginal, catalogos.tintas)
                : tintasParaActivo(c.activoReceta, c.dosisMg, 'mg', catalogos.tintas);
              const tintaSel = c.tintaId ? catalogos.tintas.find((t) => t.id === c.tintaId) : null;
              const convAplicada =
                c.dosisOriginal != null && tintaSel != null &&
                dosisEnMgParaTinta(c.dosisOriginal, c.unidadOriginal, tintaSel).convertida;
              const sugeridasIds = new Set(opciones.map((o) => o.tinta.id));
              return (
                <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                  {/* Fila 1: capa, activo, dosis y tinta */}
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex items-center gap-1 pb-1.5">
                      <span className="w-5 text-base font-black">{i + 1}</span>
                      <span className="flex flex-col leading-none">
                        <button className="text-slate-400 hover:text-teal-700 disabled:opacity-20" disabled={i === 0}
                          onClick={() => moverCapa(i, -1)}>▲</button>
                        <button className="text-slate-400 hover:text-teal-700 disabled:opacity-20"
                          disabled={i === r.capas.length - 1} onClick={() => moverCapa(i, 1)}>▼</button>
                      </span>
                    </div>
                    <div className="w-44 grow">
                      <label className="label">Activo (receta)</label>
                      <input className="input" value={c.activoReceta}
                        onChange={(e) => setCapa(i, { activoReceta: e.target.value })} />
                    </div>
                    <div className="w-28">
                      <label className="label">Dosis/toma (mg)</label>
                      <input className="input" type="number" step="any" value={c.dosisMg ?? ''}
                        onChange={(e) => setCapa(i, { dosisMg: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                    <div className="min-w-64 grow-[2]">
                      <label className="label">Tinta (producto intermedio)</label>
                      <select className="input" value={c.tintaId ? String(c.tintaId) : 'manual'}
                        onChange={(e) => elegirTinta(i, e.target.value)}>
                        <option value="manual">✎ manual / sin catálogo</option>
                        {opciones.length > 0 && (
                          <optgroup label="Sugeridas para este activo">
                            {opciones.map((o) => (
                              <option key={o.tinta.id} value={o.tinta.id}>
                                {o.imprimible ? '' : '⚠ '}{o.tinta.nombre} · {fmtMl(o.extrusion, 3)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Todas las tintas">
                          {catalogos.tintas.filter((t) => !sugeridasIds.has(t.id)).map((t) => (
                            <option key={t.id} value={t.id}>{t.nombre}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    <button className="pb-2 text-lg text-red-500"
                      onClick={() => actualizarCapas(r.capas.filter((_, j) => j !== i).map((c2, j) => ({ ...c2, ref: j + 1 })))}>
                      ✕
                    </button>
                  </div>
                  {c.tintaId === null && (
                    <input className="input mt-2" placeholder="Nombre de la tinta (manual)" value={c.tinta}
                      onChange={(e) => setCapa(i, { tinta: e.target.value })} />
                  )}
                  {convAplicada && (
                    <p className="mt-1 text-[11px] font-medium text-teal-700">
                      ✓ Convertido por la tinta: {c.dosisOriginal} {c.unidadOriginal} ×{' '}
                      {tintaSel?.convMgPorUnidad} mg/{tintaSel?.convUnidad} ={' '}
                      <b>{c.dosisMg != null ? Number(c.dosisMg.toFixed(4)) : '—'} mg de materia prima</b>
                    </p>
                  )}
                  {!convAplicada && c.unidadOriginal &&
                    !['mg', 'µg', 'g'].includes(normUnidad(c.unidadOriginal)) && (
                    <p className="mt-1 text-[11px] font-medium text-amber-600">
                      ⚠ receta en {c.unidadOriginal}: la tinta elegida no tiene factor de
                      conversión — cargalo en Gestión (editar tinta → Conversión de dosis)
                      o convertí a mg a mano
                    </p>
                  )}

                  {/* Fila 2: concentración, IP, extrusión, ubicación y lote */}
                  <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-200/70 pt-2">
                    <div className="w-28">
                      <label className="label">Conc. (%)</label>
                      <input className="input" type="number" step="any"
                        value={c.concentracion != null ? Number((c.concentracion * 100).toFixed(4)) : ''}
                        onChange={(e) =>
                          setCapa(i, { concentracion: e.target.value ? Number(e.target.value) / 100 : null })} />
                    </div>
                    <div className="w-24">
                      <label className="label">IP</label>
                      <input className="input" type="number" step="any" value={c.ip ?? ''}
                        onChange={(e) => setCapa(i, { ip: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                    <div className="w-32">
                      <label className="label">Extrusión/cáps</label>
                      <p className={`rounded-lg border px-2 py-1.5 text-center text-sm font-black ${
                        calc?.bajoMinimo ? 'border-red-300 bg-red-50 text-red-600' : 'border-teal-200 bg-teal-50 text-teal-700'
                      }`}>
                        {fmtMl(calc?.extrusion)}
                      </p>
                    </div>
                    <div className="w-32">
                      <label className="label" title="Extrusión por cápsula × cápsulas totales: tinta necesaria para todo el lote">
                        mL totales
                      </label>
                      <p className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-sm font-black text-slate-700">
                        {calc?.extrusion != null && (r.capsulasTotales ?? 0) > 0
                          ? `${Number((calc.extrusion * (r.capsulasTotales ?? 0)).toFixed(2))} mL`
                          : '—'}
                      </p>
                    </div>
                    <div className="w-36">
                      <label className="label">
                        Ubicación{' '}
                        {c.ubicacionManual ? (
                          <button className="font-bold text-teal-700 hover:underline" title="Volver a ubicación automática (tapa solo si el cuerpo supera 0.9 mL)"
                            onClick={() => setCapa(i, { ubicacionManual: false })}>
                            (fijada · ↺ auto)
                          </button>
                        ) : (
                          <span className="normal-case text-slate-400">(auto)</span>
                        )}
                      </label>
                      <select className="input" value={c.ubicacion}
                        onChange={(e) => setCapa(i, { ubicacion: e.target.value, ubicacionManual: true })}>
                        <option value="cuerpo">Cuerpo</option>
                        <option value="tapa">Tapa</option>
                      </select>
                    </div>
                    <div className="min-w-52 grow">
                      <label className="label">Lote PI usado</label>
                      <input className="input" placeholder="FPI.01.PIxxx / P###" value={c.lote}
                        onChange={(e) => setCapa(i, { lote: e.target.value })} />
                    </div>
                  </div>
                  {calc?.bajoMinimo && (
                    <p className="mt-1 text-xs font-semibold text-red-600">
                      ⛔ Por debajo del mínimo de la impresora (0.03 mL). Diluir a ≤{' '}
                      {fmtPct(calc.concentracionMaxParaMinimo, 3)} o elegir otra concentración.
                    </p>
                  )}
                  {c.alerta && <p className="mt-1 text-xs font-medium text-amber-700">⚠ {c.alerta}</p>}
                </div>
              );
            })}
          </div>
          <button className="btn-ghost mt-2 text-xs"
            onClick={() =>
              actualizarCapas([...r.capas, capaDesdeTinta(r.capas.length + 1, '', null, 'mg', null)])}>
            + Agregar capa
          </button>
        </section>

        {/* ---------- 4 · Producción ---------- */}
        <section>
          <h3 className="section-title text-sm">🏭 4 · Producción</h3>
          <div className="mb-3">
            <label className="label">Nombre del producto (aparece en el documento — editable, ej: “… para migraña”)</label>
            <input className="input" value={r.producto}
              onChange={(e) => set({ producto: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <label className="label">Días de tratamiento</label>
              <input className="input" type="number" value={r.dias ?? ''}
                onChange={(e) => {
                  const dias = e.target.value ? Number(e.target.value) : null;
                  const sug = capsulasSugeridas(dias, r.capsulasPorToma);
                  set({ dias, capsulasTotales: sug ?? r.capsulasTotales, aprobadas: sug ?? r.aprobadas });
                }} />
            </div>
            <div>
              <label className="label">Cápsulas totales</label>
              <input className="input" type="number" value={r.capsulasTotales ?? ''}
                onChange={(e) => set({ capsulasTotales: Number(e.target.value) || null, aprobadas: Number(e.target.value) || null })} />
            </div>
            <div>
              <label className="label">Envases</label>
              <input className="input" type="number" value={r.envases ?? ''}
                onChange={(e) => {
                  const envases = Number(e.target.value) || null;
                  const porEnvase = envases && r.capsulasTotales ? Math.round(r.capsulasTotales / envases) : r.capsulasPorEnvase;
                  set({ envases, capsulasPorEnvase: porEnvase });
                }} />
            </div>
            <div>
              <label className="label">Cápsulas por envase</label>
              <input className="input" type="number" value={r.capsulasPorEnvase ?? ''}
                onChange={(e) => set({ capsulasPorEnvase: Number(e.target.value) || null })} />
            </div>
            <div>
              <label className="label">Prefijo de lote</label>
              <input className="input" value={r.lotePrefijo} onChange={(e) => set({ lotePrefijo: e.target.value })} />
            </div>
            <div>
              <label className="label">Nº de lote (P…)</label>
              <input className="input" type="number" value={r.loteNumero ?? ''}
                onChange={(e) => set({ loteNumero: Number(e.target.value) || null })} />
            </div>
            <div>
              <label className="label">Inicio producción</label>
              <input className="input" type="datetime-local" value={r.fechaHoraInicio}
                onChange={(e) => set({ fechaHoraInicio: e.target.value })} />
            </div>
            <div>
              <label className="label">Fin producción</label>
              <input className="input" type="datetime-local" value={r.fechaHoraFin}
                onChange={(e) => set({ fechaHoraFin: e.target.value })} />
            </div>
            <div>
              <label className="label">Deadline (fecha límite de entrega — no se imprime)</label>
              <div className="flex items-center gap-2">
                <input className="input" type="date" value={r.deadline}
                  onChange={(e) => set({ deadline: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Fecha elaboración</label>
              <input className="input" type="date" value={r.fechaElab}
                onChange={(e) => set({ fechaElab: e.target.value, fechaVto: sumarMeses(e.target.value || hoyISO(), MESES_VENCIMIENTO) })} />
            </div>
            <div>
              <label className="label">Fecha vencimiento (+{MESES_VENCIMIENTO} meses)</label>
              <input className="input" type="date" value={r.fechaVto} onChange={(e) => set({ fechaVto: e.target.value })} />
            </div>
            <div>
              <label className="label">Operador (produjo)</label>
              <select className="input" value={r.operador} onChange={(e) => set({ operador: e.target.value })}>
                <option value="">—</option>
                {catalogos.operadores.filter((o) => o.rol === 'produce')
                  .map((o) => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Supervisor (revisó)</label>
              <select className="input" value={r.supervisor} onChange={(e) => set({ supervisor: e.target.value })}>
                {catalogos.operadores.filter((o) => o.rol === 'revisa')
                  .map((o) => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
                <option value={r.supervisor}>{r.supervisor}</option>
              </select>
            </div>
          </div>
        </section>

        {/* ---------- 5 · Proceso y controles ---------- */}
        <section>
          <h3 className="section-title text-sm">🌡️ 5 · Proceso y controles</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="label">Temperatura (ºC)</label>
              <input className="input" value={r.proceso.temperatura}
                onChange={(e) => set({ proceso: { ...r.proceso, temperatura: e.target.value } })} />
            </div>
            <div>
              <label className="label">T. mezclado (min)</label>
              <input className="input" value={r.proceso.tiempoMezclado}
                onChange={(e) => set({ proceso: { ...r.proceso, tiempoMezclado: e.target.value } })} />
            </div>
            <div>
              <label className="label">T. reposo (min)</label>
              <input className="input" value={r.proceso.tiempoReposo}
                onChange={(e) => set({ proceso: { ...r.proceso, tiempoReposo: e.target.value } })} />
            </div>
            <div>
              <label className="label">Otros</label>
              <input className="input" value={r.proceso.otros}
                onChange={(e) => set({ proceso: { ...r.proceso, otros: e.target.value } })} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            {([['peso', 'Peso'], ['visual', 'Visual'], ['vestimenta', 'Vestimenta'], ['higiene', 'Higiene']] as const)
              .map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" checked={r.controles[k]}
                  onChange={(e) => set({ controles: { ...r.controles, [k]: e.target.checked } })} />
                {label} cumple
              </label>
            ))}
            <label className="flex items-center gap-1.5">
              Aprobadas
              <input className="input w-20" type="number" value={r.aprobadas ?? ''}
                onChange={(e) => set({ aprobadas: Number(e.target.value) || 0 })} />
            </label>
            <label className="flex items-center gap-1.5">
              Rechazadas
              <input className="input w-20" type="number" value={r.rechazadas}
                onChange={(e) => set({ rechazadas: Number(e.target.value) || 0 })} />
            </label>
          </div>
        </section>

        {errores && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p className="mb-1 font-bold">⛔ No se puede terminar: faltan datos obligatorios</p>
            <ul className="list-inside list-disc">
              {errores.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
        <div className="flex justify-end border-t border-slate-100 pt-3">
          <button className="btn-primary text-base" onClick={marcarTerminado}>
            ✅ Marcar como TERMINADO — {r.paciente}
          </button>
        </div>
      </div>

      {/* ---------- Panel Resultados (estilo MALVINAS) ---------- */}
      <div>
        <ResultadosPanel
          resultado={resultado}
          tintas={catalogos.tintas}
          manual={r.capsulasPorTomaManual}
          onCambiarDivision={cambiarDivision}
          onAplicarDilucion={aplicarDilucion}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Esquema de impresión: resumen visual arriba de todo para que el
// operador vea de un vistazo qué imprimir, sin bucear en el registro.
// Tinta · dosis · extrusión/cáps · mL totales, + cápsulas y volumen.
// ---------------------------------------------------------------
const COLORES_CAPAS = ['#10b981', '#0ea5e9', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16'];

function EsquemaImpresion({ r, resultado }: { r: Registro; resultado: ReturnType<typeof calcularCapsula> }) {
  const capas = r.capas ?? [];
  if (capas.length === 0) return null;
  const totales = r.capsulasTotales ?? 0;
  const mlFinales = capas.reduce((s2, c, i) => s2 + (resultado.capas[i]?.extrusion ?? 0), 0) * totales;

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-slate-800 bg-slate-900 text-white shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <h3 className="text-sm font-black uppercase tracking-wider">🖨️ Esquema de impresión</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/10 px-2.5 py-1">
            💊 <b>{totales || '—'}</b> cápsulas{resultado.capsulasPorToma > 1 && <> · <b className="text-red-300">{resultado.capsulasPorToma}/toma</b></>}
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">🧪 <b>{fmtMl(resultado.volumenTotal)}</b>/cáps</span>
          <span className="rounded-full bg-teal-500/25 px-2.5 py-1">Σ tinta a usar: <b>{totales > 0 ? `${Number(mlFinales.toFixed(1))} mL` : '—'}</b></span>
        </div>
      </div>
      <div className="divide-y divide-white/10 bg-slate-800/60">
        {capas.map((c, i) => {
          const calc = resultado.capas[i];
          const mlTot = calc?.extrusion != null && totales > 0 ? calc.extrusion * totales : null;
          return (
            <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
              <span className="flex min-w-52 flex-1 items-center gap-2 font-bold">
                <span className="inline-block h-3.5 w-3.5 shrink-0 rounded"
                  style={{ background: COLORES_CAPAS[i % COLORES_CAPAS.length] }} />
                {c.tinta || c.activoReceta || `Capa ${i + 1}`}
                <span className={`badge ${c.ubicacion === 'tapa' ? 'bg-sky-500/25 text-sky-200' : 'bg-white/10 text-slate-300'}`}>
                  {c.ubicacion}
                </span>
              </span>
              <span className="text-slate-300">dosis <b className="text-white">{c.dosisMg != null ? `${Number(c.dosisMg.toFixed(3))} mg` : '—'}</b></span>
              <span className="text-slate-300">extrusión <b className={calc?.bajoMinimo ? 'text-red-300' : 'text-teal-300'}>{fmtMl(calc?.extrusion)}</b>/cáps</span>
              <span className="text-slate-300">total <b className="text-white">{mlTot != null ? `${Number(mlTot.toFixed(2))} mL` : '—'}</b></span>
              {c.lote && <span className="text-xs text-slate-400">lote {c.lote}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
