'use client';
import { useState } from 'react';
import type { RecetaParseada } from '@/lib/parser';
import type { Catalogos } from '@/app/page';
import { colorDeGrupo } from '@/lib/colors';
import { hoyISO, sumarMeses, capsulasSugeridas } from '@/lib/utils';
import { MESES_VENCIMIENTO } from '@/lib/config';
import { tintasParaActivo, capaDesdeTinta, calcularCapsula, extrusionCapa, autoUbicarCapas } from '@/lib/engine';

export default function LectorRecetas({
  catalogos,
  onCreados,
}: {
  catalogos: Catalogos;
  onCreados: () => void;
}) {
  const [modo, setModo] = useState<'pdf' | 'texto'>('pdf');
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [receta, setReceta] = useState<RecetaParseada | null>(null);
  const [seleccion, setSeleccion] = useState<boolean[]>([]);
  const [error, setError] = useState('');
  const [arrastrando, setArrastrando] = useState(false);

  function procesarArchivo(file: File | undefined | null) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('El archivo tiene que ser un PDF. Para recetas por foto usá "Pegar texto".');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    procesar(form);
  }

  async function procesar(body: FormData | string) {
    setCargando(true);
    setError('');
    try {
      const res = await fetch('/api/parse-receta', {
        method: 'POST',
        ...(typeof body === 'string'
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: body }) }
          : { body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReceta(data);
      setSeleccion(data.formulas.map(() => true));
    } catch (e: any) {
      setError(e.message ?? 'Error al procesar la receta');
    } finally {
      setCargando(false);
    }
  }

  async function crearRegistros() {
    if (!receta) return;
    setCargando(true);
    const grupo = `${receta.paciente}|${receta.dni}`;
    const fechaElab = hoyISO();
    const nl = await fetch('/api/next-lote?prefijo=PT001').then((r) => r.json());
    let numero = nl.proximo as number;

    const items = receta.formulas
      .filter((_, i) => seleccion[i])
      .map((f) => {
        // Capas: una por activo, con la tinta sugerida automáticamente
        // (criterio: imprimible ≥0.03 mL y de menor volumen). La dosis se
        // convierte por tinta (UI, µg de elemento → mg de materia prima).
        const capas = f.activos.map((a, i) => {
          const opciones = tintasParaActivo(a.activo, a.dosis, a.unidad, catalogos.tintas);
          const mejor = opciones[0]?.tinta ?? null;
          return capaDesdeTinta(i + 1, a.activo, a.dosis, a.unidad, mejor);
        });
        // División automática de cápsulas por toma
        const res = calcularCapsula(capas, { manual: false, capsulasPorToma: 1 });
        // Ubicación cuerpo/tapa: la tapa solo se usa si el cuerpo supera 0.9 mL
        const capasUbicadas = autoUbicarCapas(capas, res.capsulasPorToma, catalogos.tintas);
        const capasConExtrusion = capasUbicadas.map((c) => ({
          ...c,
          extrusionMl: extrusionCapa(c.dosisMg, c.concentracion, c.ip, res.capsulasPorToma),
        }));
        return {
          estado: 'en_proceso',
          grupoPaciente: grupo,
          tituloFormula: f.titulo,
          paciente: receta.paciente,
          dni: receta.dni,
          medico: receta.medico,
          matricula: receta.matricula,
          fechaReceta: receta.fechaReceta,
          nroReceta: receta.nroReceta,
          diagnostico: receta.diagnostico,
          indicacion: f.indicacion,
          formula: f.activos,
          capsulasPorToma: res.capsulasPorToma,
          capsulasPorTomaManual: false,
          capas: capasConExtrusion,
          dias: f.dias,
          capsulasTotales: f.totalCapsulas
            ? f.totalCapsulas * res.capsulasPorToma
            : capsulasSugeridas(f.dias, res.capsulasPorToma),
          lotePrefijo: 'PT001',
          loteNumero: numero++,
          fechaElab,
          fechaVto: sumarMeses(fechaElab, MESES_VENCIMIENTO),
          fechaHoraInicio: '',
          fechaHoraFin: '',
        };
      });

    const res = await fetch('/api/registros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
    setCargando(false);
    if (res.ok) {
      setReceta(null);
      setTexto('');
      onCreados();
    } else {
      setError('No se pudieron crear los registros');
    }
  }

  const color = receta ? colorDeGrupo(`${receta.paciente}|${receta.dni}`) : null;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="mb-4 flex gap-2">
          <button className={modo === 'pdf' ? 'btn-primary' : 'btn-ghost'} onClick={() => setModo('pdf')}>
            Subir PDF de receta
          </button>
          <button className={modo === 'texto' ? 'btn-primary' : 'btn-ghost'} onClick={() => setModo('texto')}>
            Pegar texto (recetas por foto)
          </button>
        </div>

        {modo === 'pdf' ? (
          <label
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              arrastrando
                ? 'border-teal-600 bg-teal-50'
                : 'border-slate-300 bg-slate-50 hover:border-teal-600'
            }`}
            onDragOver={(e) => {
              // Sin preventDefault el navegador no permite soltar (abre el PDF)
              e.preventDefault();
              e.stopPropagation();
              setArrastrando(true);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setArrastrando(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setArrastrando(false);
              procesarArchivo(e.dataTransfer.files?.[0]);
            }}>
            <span className="text-3xl">📄</span>
            <span className="mt-2 font-semibold">
              {arrastrando ? 'Soltá el PDF acá' : 'Elegí o arrastrá el PDF de la receta'}
            </span>
            <span className="text-sm text-slate-500">
              Se procesa en memoria: no se guarda ninguna imagen ni archivo.
            </span>
            <input type="file" accept="application/pdf" className="hidden"
              onChange={(e) => {
                procesarArchivo(e.target.files?.[0]);
                e.target.value = ''; // permite volver a subir el mismo archivo
              }} />
          </label>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Si la receta vino por foto: pasala por una IA, copiá el texto y pegalo acá.
            </p>
            <textarea className="input min-h-[220px] font-mono text-xs" value={texto}
              placeholder={'PAGNAN, MONICA 13725924 RECETA\n- Vit. C: 250 mg\nIndicaciones: mañana ...'}
              onChange={(e) => setTexto(e.target.value)} />
            <button className="btn-primary" onClick={() => procesar(texto)} disabled={!texto.trim() || cargando}>
              Interpretar texto
            </button>
          </div>
        )}
        {cargando && <p className="mt-3 text-sm text-slate-500">Procesando…</p>}
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      </div>

      {receta && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3"
            style={{ background: color!.bg, borderBottom: `3px solid ${color!.border}` }}>
            <div>
              <p className="text-xl font-black uppercase leading-tight">{receta.paciente || '—'}</p>
              <p className="text-sm">
                DNI {receta.dni || '—'} · Dr/a. {receta.medico || '—'} (MP {receta.matricula || '—'}) ·
                Receta {receta.nroReceta || '—'} del {receta.fechaReceta || '—'}
              </p>
            </div>
            <span className="badge bg-white/70">{receta.formulas.length} fórmula{receta.formulas.length !== 1 && 's'}</span>
          </div>

          <div className="space-y-3 p-5">
            {receta.advertencias.length > 0 && (
              <div className="alerta-quimica">
                {receta.advertencias.map((a, i) => (
                  <p key={i}>⚠ {a} Podés completarlo a mano en la tarjeta.</p>
                ))}
              </div>
            )}
            {receta.diagnostico && (
              <p className="text-sm"><b>Diagnóstico:</b> {receta.diagnostico}</p>
            )}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {receta.formulas.map((f, i) => {
                // Vista previa de mapeo de tintas
                const preview = f.activos.map((a) => {
                  const op = tintasParaActivo(a.activo, a.dosis, a.unidad, catalogos.tintas)[0];
                  return { a, tinta: op?.tinta.nombre ?? null };
                });
                return (
                  <label key={i}
                    className={`cursor-pointer rounded-xl border-2 p-3 text-sm ${
                      seleccion[i] ? 'border-teal-600 bg-teal-50/50' : 'border-slate-200 opacity-60'
                    }`}>
                    <div className="mb-1 flex items-center justify-between">
                      <b>Fórmula {f.titulo}</b>
                      <input type="checkbox" checked={seleccion[i] ?? false}
                        onChange={(e) => setSeleccion((s) => s.map((v, j) => (j === i ? e.target.checked : v)))} />
                    </div>
                    <ul className="space-y-0.5 text-slate-700">
                      {preview.map(({ a, tinta }, j) => (
                        <li key={j}>
                          • {a.activo}: {a.dosis} {a.unidad}
                          {tinta ? (
                            <span className="ml-1 text-xs text-teal-700">→ {tinta}</span>
                          ) : (
                            <span className="ml-1 text-xs text-amber-600">→ elegir tinta</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-slate-500">
                      {f.indicacion && <>Indicación: {f.indicacion} · </>}
                      {f.dias ? `${f.dias} días` : 'días: —'}
                    </p>
                  </label>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-500">
                Se crea una tarjeta y un lote por fórmula, con la tinta sugerida en cada capa. Todo editable.
              </p>
              <button className="btn-primary" onClick={crearRegistros}
                disabled={cargando || seleccion.every((s) => !s)}>
                Crear {seleccion.filter(Boolean).length} registro{seleccion.filter(Boolean).length !== 1 && 's'} →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
