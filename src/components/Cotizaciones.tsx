'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Cotizacion, CotizadorDroga, Registro } from '@/db/schema';
import { colorDeGrupo } from '@/lib/colors';
import { coincideFiltro } from '@/lib/utils';
import { estadoPT, LABEL_ESTADO } from '@/lib/estadoPT';
import { formatoPeso, mensajeWhatsApp, precioTransferenciaSugerido, LABEL_ENVIO, type Envio } from '@/lib/cotizador';
import { useCerrarModal } from '@/hooks/useCerrarModal';

// ---------------------------------------------------------------
// Gestión de cotizaciones (branch atencion-cliente).
//
// El flujo completo de Atención: la receta entra por el Lector, se revisa
// en Pendientes y desde ahí llega acá retenida en "Pendiente de pago" con
// su cotización creada; el motor del Excel le pone precio (editable:
// cápsulas, drogas, descuento extra), se copia el mensaje de WhatsApp y el
// pago se confirma con el botón ✅ PAGADO, que libera las fórmulas a
// Pendientes (producción). "A Pendientes sin pago" cubre a los pacientes
// que pagan después. El 🧪 Simulador cotiza consultas sueltas sin guardar.
// ---------------------------------------------------------------

type ComprobanteMeta = {
  id: number;
  nombreArchivo: string;
  mime: string;
  tamanoBytes: number;
  subidoPor: string;
  createdAt: string;
};

type Detalle = {
  cotizacion: Cotizacion;
  comprobantes: ComprobanteMeta[];
  registros: Registro[];
  anteriores: Cotizacion[];
};

function fechaHora(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const f = new Date(v);
  return f.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Cordoba',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function soloFecha(v: string | Date | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Cordoba',
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

// Comprime imágenes en el navegador antes de subir (máx. 1600 px, JPEG):
// una foto de celular de 4-8 MB queda en 200-400 KB. Los PDF van tal cual.
async function archivoABase64(file: File): Promise<{ base64: string; mime: string; nombre: string }> {
  const esImagen = file.type === 'image/jpeg' || file.type === 'image/png';
  if (esImagen) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((ok, no) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = no;
        i.src = url;
      });
      const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      return { base64: dataUrl.split(',')[1] ?? '', mime: 'image/jpeg', nombre: file.name.replace(/\.(png|jpeg|jpg)$/i, '') + '.jpg' };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const dataUrl = await new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = no;
    r.readAsDataURL(file);
  });
  return { base64: dataUrl.split(',')[1] ?? '', mime: file.type, nombre: file.name };
}

export default function Cotizaciones({
  registros,
  rol,
  onCambio,
}: {
  registros: Registro[]; // todos los PT (para grupos sin cotizar y estados)
  rol: string | undefined;
  onCambio: () => void; // recarga las listas globales de page.tsx
}) {
  const [lista, setLista] = useState<Cotizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [vista, setVista] = useState<'todas' | 'pendientes' | 'pagadas' | 'sin_pago'>('pendientes');
  const [abiertaId, setAbiertaId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState('');
  // Drogas del cotizador: las usa el detalle (asignar/corregir drogas) y el
  // Simulador — una sola carga acá para las dos pantallas.
  const [drogas, setDrogas] = useState<CotizadorDroga[]>([]);
  const [simulador, setSimulador] = useState(false);

  useEffect(() => {
    fetch('/api/cotizador/drogas')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setDrogas(d))
      .catch(() => {});
  }, []);

  const recargarLista = useCallback(async () => {
    try {
      const res = await fetch('/api/cotizaciones');
      const data = await res.json();
      if (Array.isArray(data)) setLista(data);
    } catch {
      /* la pantalla muestra lo último que tuvo */
    } finally {
      setCargando(false);
    }
  }, []);

  const recargarDetalle = useCallback(async (id: number) => {
    const res = await fetch(`/api/cotizaciones/${id}`);
    if (res.ok) setDetalle(await res.json());
  }, []);

  useEffect(() => {
    recargarLista();
  }, [recargarLista]);

  useEffect(() => {
    setDetalle(null);
    if (abiertaId != null) recargarDetalle(abiertaId);
  }, [abiertaId, recargarDetalle]);

  function refrescarTodo() {
    recargarLista();
    if (abiertaId != null) recargarDetalle(abiertaId);
    onCambio();
  }

  // Grupos de registros retenidos en Pendiente de pago SIN cotización (p.ej.
  // devueltos a mano por el Admin desde Pendientes): se cotizan desde acá.
  const sinCotizar = useMemo(() => {
    const retenidos = registros.filter((r) => estadoPT(r) === 'pendiente_pago' && r.cotizacionId == null);
    const grupos = new Map<string, Registro[]>();
    for (const r of retenidos) {
      const clave = r.grupoPaciente || `${r.paciente}|${r.dni}|${r.id}`;
      grupos.set(clave, [...(grupos.get(clave) ?? []), r]);
    }
    return Array.from(grupos.values());
  }, [registros]);

  async function cotizarGrupo(regs: Registro[]) {
    setError('');
    const res = await fetch('/api/cotizaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registroIds: regs.map((r) => r.id) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'No se pudo crear la cotización');
      return;
    }
    refrescarTodo();
    setAbiertaId(data.id);
  }

  const visibles = lista
    .filter((c) => {
      if (vista === 'pendientes') return c.estadoPago !== 'pagada';
      if (vista === 'pagadas') return c.estadoPago === 'pagada';
      if (vista === 'sin_pago') return c.enviadaSinPago && c.estadoPago !== 'pagada';
      return true;
    })
    .filter((c) => coincideFiltro(filtro, c.paciente, c.dni, String(c.id)));

  const nPendientes = lista.filter((c) => c.estadoPago !== 'pagada').length;
  const nSinPago = lista.filter((c) => c.enviadaSinPago && c.estadoPago !== 'pagada').length;

  if (abiertaId != null) {
    return (
      <DetalleCotizacion
        id={abiertaId}
        detalle={detalle}
        rol={rol}
        drogas={drogas}
        onVolver={() => setAbiertaId(null)}
        onRefrescar={refrescarTodo}
        onCerrada={() => {
          setAbiertaId(null);
          refrescarTodo();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      {/* Grupos leídos por el Lector que quedaron sin cotización */}
      {sinCotizar.length > 0 && (
        <div className="card border-l-4 border-l-amber-500 p-4">
          <p className="mb-2 text-sm font-bold text-amber-800">Para cotizar</p>
          <div className="flex flex-wrap gap-2">
            {sinCotizar.map((grupo) => {
              const c = colorDeGrupo(grupo[0].grupoPaciente || grupo[0].paciente);
              return (
                <button
                  key={grupo[0].id}
                  onClick={() => cotizarGrupo(grupo)}
                  className="rounded-xl border-2 px-3 py-2 text-sm font-bold uppercase"
                  style={{ background: c.bg, borderColor: c.border }}
                >
                  {grupo[0].paciente || 'SIN NOMBRE'} · {grupo.length} fórmula{grupo.length !== 1 && 's'} → Cotizar
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-md"
          placeholder="🔍 Buscar por paciente o DNI…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <div className="flex gap-1">
          {(
            [
              ['pendientes', `💰 Pendientes de pago (${nPendientes})`],
              ['sin_pago', `🚚 En Pendientes sin pago (${nSinPago})`],
              ['pagadas', '✅ Pagadas'],
              ['todas', 'Todas'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setVista(id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                vista === id ? 'bg-profundo text-hueso' : 'border border-slate-200 bg-white text-turba hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSimulador((s) => !s)}
          className={`ml-auto rounded-xl px-3 py-1.5 text-xs font-semibold ${
            simulador ? 'bg-violet-600 text-white' : 'border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100'
          }`}
          title="Cotización de prueba: calcula con el motor pero no guarda nada"
        >
          🧪 Simulador
        </button>
      </div>

      {/* Simulador (pedido 11-ago): "¿cuánto me saldría hacer esto?" de un
          médico — calcula con drogas y parámetros vigentes SIN dejar rastro. */}
      {simulador && <Simulador drogas={drogas} />}

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : visibles.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          {lista.length === 0 ? (
            <>
              Todavía no hay cotizaciones. El circuito: la receta entra por el <b>Lector</b>, se revisa y
              corrige en <b>Pendientes</b>, y desde ahí se manda acá con el botón <b>💰 Pendiente de pago</b> —
              aparece arriba en &quot;Para cotizar&quot; y el motor le pone precio solo.
            </>
          ) : (
            'Nada por acá con este filtro.'
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map((c) => {
            const color = colorDeGrupo(c.grupoPaciente || c.paciente);
            const nCaps = c.lineas.reduce((acc, l) => acc + (l.nCapsulas ?? 0), 0);
            return (
              <button
                key={c.id}
                onClick={() => setAbiertaId(c.id)}
                className="card overflow-hidden text-left transition-shadow hover:shadow-md"
              >
                <div className="px-4 py-2.5" style={{ background: color.bg, borderBottom: `3px solid ${color.border}` }}>
                  <p className="truncate text-lg font-black uppercase leading-tight">{c.paciente || 'SIN NOMBRE'}</p>
                  <p className="text-xs">
                    {soloFecha(c.createdAt)} · {c.lineas.length} fórmula{c.lineas.length !== 1 && 's'}
                    {nCaps ? ` · ${nCaps} cáps` : ''}
                  </p>
                </div>
                <div className="space-y-1.5 p-4">
                  <p className="text-2xl font-black">{formatoPeso(c.precioTotal)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {c.estadoPago === 'pagada' ? (
                      <span className="badge bg-green-100 text-green-800">✅ Pagada</span>
                    ) : (
                      <span className="badge bg-amber-100 text-amber-800">💰 Pendiente de pago</span>
                    )}
                    {c.enviadaSinPago && c.estadoPago !== 'pagada' && (
                      <span className="badge bg-sky-100 text-sky-800">🚚 En Pendientes sin pago</span>
                    )}
                    {c.precioTotal == null && <span className="badge bg-red-100 text-red-700">Sin precio</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- Detalle / edición de UNA cotización ----------------

function DetalleCotizacion({
  id,
  detalle,
  rol,
  drogas,
  onVolver,
  onRefrescar,
  onCerrada,
}: {
  id: number;
  detalle: Detalle | null;
  rol: string | undefined;
  drogas: CotizadorDroga[];
  onVolver: () => void;
  onRefrescar: () => void;
  onCerrada: () => void;
}) {
  const [precio, setPrecio] = useState('');
  const [transf, setTransf] = useState('');
  const [link, setLink] = useState('');
  const [notas, setNotas] = useState('');
  const [inicializado, setInicializado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [modal, setModal] = useState<'warning-precio' | 'sin-pago' | 'cancelar' | 'pagado' | null>(null);
  const [motivo, setMotivo] = useState('');
  // Motor: envío elegido, descuento extra y lo que faltó en el último cálculo.
  const [envio, setEnvio] = useState<Envio>('sin');
  const [descuento, setDescuento] = useState('');
  const [faltantes, setFaltantes] = useState<string[]>([]);
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    if (detalle && !inicializado) {
      setPrecio(detalle.cotizacion.precioTotal != null ? String(detalle.cotizacion.precioTotal) : '');
      setTransf(detalle.cotizacion.precioTransferencia != null ? String(detalle.cotizacion.precioTransferencia) : '');
      setLink(detalle.cotizacion.linkPago ?? '');
      setNotas(detalle.cotizacion.notas ?? '');
      setDescuento(detalle.cotizacion.descuentoExtraPct ? String(detalle.cotizacion.descuentoExtraPct) : '');
      const envioGuardado = (detalle.cotizacion.parametros as Record<string, unknown> | null)?.envio;
      if (envioGuardado === 'corto' || envioGuardado === 'largo') setEnvio(envioGuardado);
      const f = (detalle.cotizacion.parametros as Record<string, unknown> | null)?.faltantes;
      if (Array.isArray(f)) setFaltantes(f as string[]);
      setInicializado(true);
    }
  }, [detalle, inicializado]);

  if (!detalle) {
    return (
      <div className="space-y-3">
        <button className="btn-ghost" onClick={onVolver}>← Todas las cotizaciones</button>
        <p className="text-slate-500">Cargando…</p>
      </div>
    );
  }

  const { cotizacion: cot, comprobantes, registros: regs, anteriores } = detalle;
  const color = colorDeGrupo(cot.grupoPaciente || cot.paciente);
  const pagada = cot.estadoPago === 'pagada';
  const bloqueada = pagada && rol !== 'admin';
  const retenidos = regs.filter((r) => estadoPT(r) === 'pendiente_pago');
  const liberados = regs.filter((r) => estadoPT(r) !== 'pendiente_pago');

  const precioNum = precio.trim() === '' ? null : Number(precio.replace(',', '.'));
  const transfNum = transf.trim() === '' ? null : Number(transf.replace(',', '.'));
  const descNum = (() => {
    const d = Number(descuento.replace(',', '.'));
    return Number.isFinite(d) && d > 0 ? Math.min(d, 100) : 0;
  })();
  const precioCambia = precioNum !== cot.precioTotal;
  const hayCambios =
    precioCambia ||
    transfNum !== cot.precioTransferencia ||
    link.trim() !== (cot.linkPago ?? '') ||
    notas !== (cot.notas ?? '') ||
    descNum !== (cot.descuentoExtraPct ?? 0);

  // DRIFT (caso BRUSCHI 11-ago): si el Admin editó la receta en Pendientes
  // (cápsulas o composición) DESPUÉS de cotizar, el snapshot quedó viejo y
  // el precio también — acá se detecta y la pantalla lo grita.
  const desactualizadas = cot.lineas.filter((l) => {
    const reg = regs.find((r) => r.id === l.registroId);
    if (!reg) return false;
    if ((reg.capsulasTotales ?? null) !== (l.nCapsulas ?? null)) return true;
    const enReceta = (reg.formula ?? []).map((a) => `${a.activo}|${a.dosis}|${a.unidad}`).join('~');
    const enSnapshot = l.activos.map((a) => `${a.nombre}|${a.dosis}|${a.unidad}`).join('~');
    return enReceta !== enSnapshot;
  });

  // Comparación con paciente recurrente: últimas cotizaciones con precio.
  const conPrecio = anteriores.filter((a) => a.precioTotal != null);
  const ultima = conPrecio[0] ?? null;
  const diff = ultima && precioNum != null ? precioNum - (ultima.precioTotal as number) : null;

  async function guardar(confirmado = false) {
    if (precioNum !== null && !Number.isFinite(precioNum)) {
      setError('El precio no es un número válido');
      return;
    }
    if (precioCambia && cot.precioTotal != null && !confirmado) {
      // Warning pedido por Tomi: cambiar una cotización ya hecha avisa y
      // queda en el historial con motivo.
      setModal('warning-precio');
      return;
    }
    setGuardando(true);
    setError('');
    const res = await fetch(`/api/cotizaciones/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        precioTotal: precioNum,
        precioTransferencia: transf.trim() === '' ? undefined : transfNum,
        linkPago: link,
        notas,
        motivo,
        descuentoExtraPct: descNum,
      }),
    });
    setGuardando(false);
    setModal(null);
    setMotivo('');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'No se pudo guardar');
      return;
    }
    const row: Cotizacion = await res.json();
    setTransf(row.precioTransferencia != null ? String(row.precioTransferencia) : '');
    onRefrescar();
  }

  async function subirComprobante(file: File | undefined | null) {
    if (!file) return;
    setSubiendo(true);
    setError('');
    try {
      const { base64, mime, nombre } = await archivoABase64(file);
      const res = await fetch(`/api/cotizaciones/${id}/comprobante`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreArchivo: nombre, mime, datosBase64: base64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo subir el comprobante');
      onRefrescar();
    } catch (e: any) {
      setError(e.message ?? 'No se pudo subir el comprobante');
    } finally {
      setSubiendo(false);
    }
  }

  async function aProduccionSinPago() {
    setModal(null);
    const res = await fetch(`/api/cotizaciones/${id}/a-produccion`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'No se pudo enviar a producción');
      return;
    }
    onRefrescar();
  }

  // Botón ✅ PAGADO (11-ago): la acción explícita — marca pagada y manda
  // las fórmulas retenidas a Pendientes. El comprobante es aparte.
  async function marcarPagada() {
    setModal(null);
    const res = await fetch(`/api/cotizaciones/${id}/pagada`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'No se pudo marcar como pagada');
      return;
    }
    onRefrescar();
  }

  async function devolverAPendientePago() {
    setError('');
    for (const r of liberados) {
      if (estadoPT(r) !== 'pendiente') continue; // solo se devuelve lo que sigue en Pendientes
      const res = await fetch(`/api/registros/${r.id}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destino: 'pendiente_pago' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'No se pudo devolver algún registro');
        break;
      }
    }
    // Vuelve retenida: el badge "en producción sin pago" ya no corresponde.
    await fetch(`/api/cotizaciones/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enviadaSinPago: false }),
    }).catch(() => {});
    onRefrescar();
  }

  // Motor de precios: recalcula composición + costos + totales con las
  // drogas y parámetros vigentes y el envío elegido.
  async function calcularConMotor(envioElegido: Envio) {
    setCalculando(true);
    setError('');
    try {
      const res = await fetch(`/api/cotizaciones/${id}/recotizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envio: envioElegido, descuentoExtraPct: descNum }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo calcular');
      setFaltantes(data.faltantes ?? []);
      if (data.cotizacion) {
        setPrecio(data.cotizacion.precioTotal != null ? String(data.cotizacion.precioTotal) : '');
        setTransf(data.cotizacion.precioTransferencia != null ? String(data.cotizacion.precioTransferencia) : '');
      }
      onRefrescar();
    } catch (e: any) {
      setError(e.message ?? 'No se pudo calcular');
    } finally {
      setCalculando(false);
    }
  }

  // Asigna a mano la droga de un activo que no matcheó y recalcula.
  async function asignarDroga(lineaIdx: number, activoIdx: number, drogaId: number | null) {
    const lineas = cot.lineas.map((l, i) =>
      i !== lineaIdx
        ? l
        : { ...l, activos: l.activos.map((a, j) => (j !== activoIdx ? a : { ...a, drogaId })) }
    );
    const res = await fetch(`/api/cotizaciones/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineas }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'No se pudo asignar la droga');
      return;
    }
    await calcularConMotor(envio);
  }

  // Cápsulas editables (caso BRUSCHI): el cambio se escribe en el REGISTRO
  // (la receta manda) y se recalcula al toque — así nunca más "edité a 180
  // y me siguió cotizando 270". Si el registro ya no existe, se edita el
  // snapshot de la línea.
  async function guardarCapsulas(lineaIdx: number, valor: string) {
    const n = Math.floor(Number(valor.replace(',', '.')));
    const nuevas = Number.isFinite(n) && n > 0 ? n : null;
    const linea = cot.lineas[lineaIdx];
    if (!linea) return;
    const reg = regs.find((r) => r.id === linea.registroId);
    const actuales = reg ? reg.capsulasTotales ?? null : linea.nCapsulas ?? null;
    if (nuevas === actuales) return;
    setError('');
    if (reg) {
      const res = await fetch(`/api/registros/${reg.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capsulasTotales: nuevas }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'No se pudo cambiar la cantidad de cápsulas');
        return;
      }
    } else {
      const lineas = cot.lineas.map((l, i) => (i !== lineaIdx ? l : { ...l, nCapsulas: nuevas }));
      const res = await fetch(`/api/cotizaciones/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineas }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'No se pudo cambiar la cantidad de cápsulas');
        return;
      }
    }
    await calcularConMotor(envio);
  }

  async function cancelar() {
    setModal(null);
    const res = await fetch(`/api/cotizaciones/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'No se pudo cancelar');
      return;
    }
    onCerrada();
  }

  async function copiarMensaje() {
    const cotParaMensaje: Cotizacion = {
      ...cot,
      precioTotal: precioNum ?? cot.precioTotal,
      precioTransferencia: transfNum ?? cot.precioTransferencia,
      linkPago: link || cot.linkPago,
      descuentoExtraPct: descNum,
    };
    try {
      await navigator.clipboard.writeText(mensajeWhatsApp(cotParaMensaje, regs));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setError('El navegador bloqueó el copiado — seleccioná el texto del mensaje y copialo a mano.');
    }
  }

  const mensajePreview = mensajeWhatsApp(
    {
      ...cot,
      precioTotal: precioNum,
      precioTransferencia: transfNum ?? precioTransferenciaSugerido(precioNum),
      descuentoExtraPct: descNum,
    },
    regs
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="btn-ghost" onClick={onVolver}>← Todas las cotizaciones</button>
        <div className="flex flex-wrap gap-2">
          {!pagada && (
            <button className="btn-primary" onClick={() => setModal('pagado')}>
              ✅ PAGADO{retenidos.length > 0 ? ' → a Pendientes' : ''}
            </button>
          )}
          {!pagada && retenidos.length > 0 && (
            <button className="btn-ghost" onClick={() => setModal('sin-pago')}>
              📋 A Pendientes sin pago
            </button>
          )}
          {liberados.some((r) => estadoPT(r) === 'pendiente') && (
            <button className="btn-ghost" onClick={devolverAPendientePago}>
              ↩️ Devolver a Pendiente de pago
            </button>
          )}
          {!bloqueada && (
            <button className="btn-ghost text-red-600" onClick={() => setModal('cancelar')}>
              🗑️ Cancelar cotización
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border-4 bg-white shadow-sm" style={{ borderColor: color.border }}>
        <div className="px-5 py-3" style={{ background: color.bg, borderBottom: `4px solid ${color.border}` }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-3xl font-black uppercase leading-none tracking-tight">{cot.paciente || 'SIN NOMBRE'}</p>
              <p className="mt-1 text-sm font-semibold">
                DNI {cot.dni || '—'} · Cotización #{cot.id} · {fechaHora(cot.createdAt)} · por {cot.cotizadoPor || '—'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pagada ? (
                <span className="badge bg-green-100 text-green-800">✅ Pagada {cot.pagadaEn ? `· ${fechaHora(cot.pagadaEn)}` : ''}</span>
              ) : (
                <span className="badge bg-amber-100 text-amber-800">💰 Pendiente de pago</span>
              )}
              {cot.enviadaSinPago && !pagada && (
                <span className="badge bg-sky-100 text-sky-800">🚚 En Pendientes sin pago</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-2">
          {/* -------- Columna izquierda: composición + precio -------- */}
          <div className="space-y-4">
            {/* Aviso de paciente recurrente */}
            {ultima && (
              <div
                className={`rounded-xl border-l-4 p-3 text-sm ${
                  diff == null || diff === 0
                    ? 'border-l-slate-300 bg-slate-50'
                    : diff > 0
                      ? 'border-l-red-500 bg-red-50'
                      : 'border-l-green-500 bg-green-50'
                }`}
              >
                <p className="font-bold">
                  Paciente recurrente ·{' '}
                  {diff == null
                    ? `la última vez pagó ${formatoPeso(ultima.precioTotal)} (${soloFecha(ultima.createdAt)})`
                    : diff === 0
                      ? `mismo precio que la última vez (${soloFecha(ultima.createdAt)})`
                      : diff > 0
                        ? `⬆ ${formatoPeso(diff)} MÁS caro que la última vez (${soloFecha(ultima.createdAt)}: ${formatoPeso(ultima.precioTotal)})`
                        : `⬇ ${formatoPeso(-diff)} MÁS barato que la última vez (${soloFecha(ultima.createdAt)}: ${formatoPeso(ultima.precioTotal)})`}
                </p>
                {conPrecio.length > 1 && (
                  <p className="mt-1 text-xs text-slate-600">
                    Anteriores:{' '}
                    {conPrecio.slice(0, 5).map((a, i) => (
                      <span key={a.id}>
                        {i > 0 && ' · '}
                        {formatoPeso(a.precioTotal)} ({soloFecha(a.createdAt)})
                      </span>
                    ))}
                  </p>
                )}
              </div>
            )}

            {/* Aviso de receta cambiada después de cotizar (caso BRUSCHI) */}
            {desactualizadas.length > 0 && (
              <div className="rounded-xl border-l-4 border-l-red-500 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-bold">
                  ⚠️ La receta cambió después de cotizar
                  {desactualizadas.length === 1
                    ? ` (fórmula ${desactualizadas[0].titulo || '—'})`
                    : ` (${desactualizadas.length} fórmulas)`}
                  .
                </p>
                <p className="mt-0.5 text-xs">
                  El precio de abajo está calculado con la composición VIEJA — tocá{' '}
                  <b>🧮 Calcular con el motor</b> para actualizar precio y composición.
                </p>
              </div>
            )}

            {/* Composición (snapshot) + estado de producción + desglose */}
            <div className="space-y-2">
              {cot.lineas.map((l, i) => {
                const reg = regs.find((r) => r.id === l.registroId);
                const desactualizada = desactualizadas.includes(l);
                const capsActuales = reg ? reg.capsulasTotales ?? null : l.nCapsulas ?? null;
                return (
                  <div
                    key={i}
                    className={`rounded-xl border p-3 text-sm ${desactualizada ? 'border-red-300 bg-red-50/40' : 'border-slate-200'}`}
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <b>Fórmula {l.titulo || '—'}</b>
                        {!bloqueada ? (
                          <>
                            <input
                              key={`caps-${i}-${capsActuales ?? 'x'}`}
                              className="input !w-20 !py-0.5 text-center text-sm font-bold"
                              inputMode="numeric"
                              defaultValue={capsActuales ?? ''}
                              placeholder="cáps"
                              title="Cantidad TOTAL de cápsulas — al salir del campo se guarda en la receta y se recalcula el precio"
                              onBlur={(e) => guardarCapsulas(i, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                            />
                            <span className="text-xs text-slate-500">cáps</span>
                          </>
                        ) : (
                          l.nCapsulas != null && <span>· {l.nCapsulas} cápsulas</span>
                        )}
                        {desactualizada && (
                          <span className="badge bg-red-100 text-red-700">receta cambiada</span>
                        )}
                      </span>
                      <span className="badge bg-slate-100 text-slate-700">
                        {reg ? (reg.entregadoEn ? '🔵 Entregado' : LABEL_ESTADO[estadoPT(reg)]) : 'registro borrado'}
                      </span>
                    </div>
                    <ul className="space-y-1 text-slate-700">
                      {l.activos.map((a, j) => {
                        const droga = a.drogaId != null ? drogas.find((d) => d.id === a.drogaId) : null;
                        return (
                          <li key={j} className="flex flex-wrap items-center gap-1.5">
                            <span>• {a.nombre}: {a.dosis} {a.unidad}</span>
                            {drogas.length > 0 && !bloqueada ? (
                              // Siempre editable (11-ago): si el sistema eligió
                              // mal la droga, se corrige acá y recalcula solo.
                              <>
                                <select
                                  className={`input !w-auto !py-0.5 text-xs ${droga ? '!border-slate-200 text-slate-600' : '!border-amber-400 font-medium text-amber-800'}`}
                                  value={droga ? String(droga.id) : ''}
                                  title="Droga del cotizador usada para esta línea — cambiala si el sistema eligió mal"
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    if (Number.isInteger(v) && v > 0) asignarDroga(i, j, v);
                                  }}
                                >
                                  <option value="" disabled>⚠ elegir droga…</option>
                                  {drogas.filter((d) => d.activo || d.id === a.drogaId).map((d) => (
                                    <option key={d.id} value={d.id}>{d.nombre} (${d.costoUnitario ?? '—'}/{d.unidad})</option>
                                  ))}
                                </select>
                                {droga && a.costo != null && (
                                  <span className="text-xs text-slate-500">{formatoPeso(a.costo)}</span>
                                )}
                              </>
                            ) : droga ? (
                              <span className="text-xs text-slate-500">
                                → {droga.nombre}{a.costo != null && <> · {formatoPeso(a.costo)}</>}
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-amber-700">⚠ sin droga en el cotizador</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {l.precioSugerido != null && (
                      <p className="mt-2 border-t border-slate-100 pt-1.5 text-xs text-slate-500">
                        Excipientes {formatoPeso(l.costoExtra)} · Cápsulas {formatoPeso(l.costoCapsulas)} · Envase{' '}
                        {formatoPeso(l.costoEnvase)} · Tiempo {formatoPeso(l.costoTiempo)} →{' '}
                        <b className="text-slate-700">Sugerido {formatoPeso(l.precioSugerido)}</b>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Precio */}
            <div className="rounded-xl border border-slate-200 p-3">
              {/* Motor: envío + calcular */}
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <div className="grow">
                  <label className="label">Envío</label>
                  <select
                    className="input"
                    value={envio}
                    disabled={bloqueada}
                    onChange={(e) => setEnvio(e.target.value as Envio)}
                  >
                    {(Object.keys(LABEL_ENVIO) as Envio[]).map((ev) => (
                      <option key={ev} value={ev}>{LABEL_ENVIO[ev]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" title="Descuento adicional sobre el precio base, antes del recargo de lista — se aplica al calcular con el motor y sale en el mensaje">
                    🎁 Desc. extra %
                  </label>
                  <input
                    className="input !w-24 text-center"
                    inputMode="decimal"
                    placeholder="0"
                    value={descuento}
                    disabled={bloqueada}
                    onChange={(e) => setDescuento(e.target.value)}
                  />
                </div>
                <button
                  className="btn-primary"
                  disabled={bloqueada || calculando}
                  onClick={() => calcularConMotor(envio)}
                  title="Recalcula composición, costos y totales con las drogas y parámetros vigentes"
                >
                  {calculando ? 'Calculando…' : '🧮 Calcular con el motor'}
                </button>
              </div>
              {faltantes.length > 0 && (
                <div className="mb-3 rounded-lg border-l-4 border-l-amber-500 bg-amber-50 p-2.5 text-xs text-amber-800">
                  <b>El motor no pudo poner precio:</b>
                  <ul className="mt-0.5 list-inside list-disc">
                    {faltantes.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                  <p className="mt-1">Asigná la droga en la fórmula (arriba) o cargala en ⚙️ Cotizador, y volvé a calcular. Mientras tanto podés poner el precio a mano.</p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Precio total (3 cuotas / lista)</label>
                  <input
                    className="input text-lg font-bold"
                    inputMode="decimal"
                    placeholder="Se carga a mano por ahora"
                    value={precio}
                    disabled={bloqueada}
                    onChange={(e) => setPrecio(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Transferencia (15% desc.)</label>
                  <input
                    className="input text-lg font-bold"
                    inputMode="decimal"
                    placeholder={
                      precioNum != null ? `Sugerido: ${formatoPeso(precioTransferenciaSugerido(precioNum))}` : '—'
                    }
                    value={transf}
                    disabled={bloqueada}
                    onChange={(e) => setTransf(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="label">Link del checkout (sim.pill.ar) o de pago</label>
                <input
                  className="input"
                  placeholder="https://sim.pill.ar/cotizacion/?p=…"
                  value={link}
                  disabled={bloqueada}
                  onChange={(e) => setLink(e.target.value)}
                />
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {transfNum != null
                    ? <>Para generar el checkout en la web PILL.AR cargá <b>contado = {formatoPeso(transfNum)}</b> (la web muestra lista = contado ÷ 0,85). Con link cargado, el mensaje pasa al formato corto.</>
                    : 'Con link cargado, el mensaje de WhatsApp pasa al formato corto (los precios los muestra el checkout).'}
                </p>
              </div>
              <div className="mt-3">
                <label className="label">Notas internas</label>
                <textarea
                  className="input min-h-[60px]"
                  value={notas}
                  disabled={bloqueada}
                  onChange={(e) => setNotas(e.target.value)}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  {bloqueada
                    ? 'La cotización ya está paga: la edita solo el Admin.'
                    : 'Editable hasta el momento del pago. Todo cambio de precio queda en el historial.'}
                </p>
                <button className="btn-primary" onClick={() => guardar()} disabled={bloqueada || guardando || !hayCambios}>
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>

            {/* Historial de precios de ESTA cotización */}
            {(cot.historial ?? []).length > 0 && (
              <div className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="mb-1 font-bold">Historial de precios</p>
                <ul className="space-y-0.5 text-slate-700">
                  {[...cot.historial].reverse().map((h, i) => (
                    <li key={i}>
                      • {fechaHora(h.fecha)} — <b>{formatoPeso(h.precioTotal)}</b> ({h.usuario})
                      {h.motivo && <span className="text-slate-500"> · {h.motivo}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* -------- Columna derecha: mensaje + comprobantes -------- */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-bold">Mensaje de WhatsApp</p>
                <button className="btn-primary" onClick={copiarMensaje} disabled={precioNum == null}>
                  {copiado ? '✅ Copiado' : '📋 Copiar'}
                </button>
              </div>
              {precioNum == null && (
                <p className="mb-2 text-xs font-medium text-amber-700">Cargá el precio para armar el mensaje.</p>
              )}
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                {mensajePreview}
              </pre>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-bold">Comprobante de pago</p>
                <label className={`btn-primary cursor-pointer ${subiendo ? 'pointer-events-none opacity-60' : ''}`}>
                  {subiendo ? 'Subiendo…' : '📎 Subir comprobante'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      subirComprobante(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <p className="mb-2 text-xs text-slate-500">
                .jpg / .png / .pdf — acá solo se <b>guarda el archivo</b>. Confirmar el pago y mandar a
                producción es el botón <b>✅ PAGADO</b> (arriba). Podés subir el comprobante antes o después.
              </p>
              {comprobantes.length > 0 && !pagada && (
                <p className="mb-2 rounded-lg border-l-4 border-l-amber-500 bg-amber-50 p-2 text-xs font-medium text-amber-800">
                  📌 Hay comprobante guardado y la cotización sigue <b>pendiente de pago</b> — confirmala con ✅ PAGADO.
                </p>
              )}
              {comprobantes.length === 0 ? (
                <p className="text-sm text-slate-500">Sin comprobantes todavía.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {comprobantes.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {a.mime === 'application/pdf' ? '📄' : '🖼️'} {a.nombreArchivo || `comprobante-${a.id}`}
                        <span className="ml-1 text-xs text-slate-500">
                          {fechaHora(a.createdAt)} · {a.subidoPor}
                        </span>
                      </span>
                      <a className="btn-ghost shrink-0" href={`/api/comprobantes/${a.id}`} target="_blank">
                        Ver
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          </div>
        </div>
      </div>

      {/* -------- Modales (cierre solo explícito, B-22) -------- */}
      {modal === 'warning-precio' && (
        <ModalConfirmacion
          titulo="⚠️ Estás cambiando una cotización ya hecha"
          onCerrar={() => setModal(null)}
          onConfirmar={() => guardar(true)}
          textoConfirmar="Cambiar precio"
        >
          <p className="text-sm">
            El precio pasa de <b>{formatoPeso(cot.precioTotal)}</b> a <b>{formatoPeso(precioNum)}</b>
            {cot.precioTotal != null && precioNum != null && (
              <>
                {' '}
                (<b className={precioNum > cot.precioTotal ? 'text-red-600' : 'text-green-700'}>
                  {precioNum > cot.precioTotal ? '+' : '−'}
                  {formatoPeso(Math.abs(precioNum - cot.precioTotal))}
                </b>)
              </>
            )}
            . El cambio queda registrado en el historial con tu nombre.
          </p>
          {ultima && diff != null && diff !== 0 && (
            <p className="text-sm text-slate-600">
              Ojo: a este paciente la última vez se le cobró {formatoPeso(ultima.precioTotal)}.
            </p>
          )}
          <div>
            <label className="label">Motivo (opcional, queda en el historial)</label>
            <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: subió el costo del Minoxidil" />
          </div>
        </ModalConfirmacion>
      )}

      {modal === 'pagado' && (
        <ModalConfirmacion
          titulo="✅ Marcar como PAGADA"
          onCerrar={() => setModal(null)}
          onConfirmar={marcarPagada}
          textoConfirmar="Confirmar pago"
        >
          <p className="text-sm">
            La cotización de <b>{cot.paciente}</b> ({formatoPeso(cot.precioTotal)}) queda marcada como{' '}
            <b>PAGADA</b> — con tu nombre y la fecha en el historial.
            {retenidos.length > 0 ? (
              <>
                {' '}
                {retenidos.length === 1 ? 'La fórmula retenida pasa' : `Las ${retenidos.length} fórmulas retenidas pasan`} a{' '}
                <b>📋 Pendientes</b> (producción).
              </>
            ) : (
              <> Las fórmulas ya están en producción — solo se registra el pago.</>
            )}
            {comprobantes.length === 0 && (
              <span className="mt-1 block text-xs text-slate-500">
                Todavía no hay comprobante guardado — lo podés subir después, cuando llegue.
              </span>
            )}
          </p>
        </ModalConfirmacion>
      )}

      {modal === 'sin-pago' && (
        <ModalConfirmacion
          titulo="📋 Mandar a Pendientes (sin pago)"
          onCerrar={() => setModal(null)}
          onConfirmar={aProduccionSinPago}
          textoConfirmar="Mandar a Pendientes"
        >
          <p className="text-sm">
            {retenidos.length} fórmula{retenidos.length !== 1 && 's'} de <b>{cot.paciente}</b> pasa
            {retenidos.length === 1 ? '' : 'n'} a <b>Pendientes</b> aunque el pago no llegó (paciente que paga después). La cotización queda esperando la confirmación con ✅ PAGADO.
          </p>
        </ModalConfirmacion>
      )}

      {modal === 'cancelar' && (
        <ModalConfirmacion
          titulo="🗑️ Cancelar cotización"
          onCerrar={() => setModal(null)}
          onConfirmar={cancelar}
          textoConfirmar="Cancelar cotización"
          destructivo
        >
          <p className="text-sm">
            Se borra la cotización #{cot.id} de <b>{cot.paciente}</b>
            {retenidos.length > 0 && (
              <>
                {' '}
                y {retenidos.length === 1 ? 'la fórmula retenida' : `las ${retenidos.length} fórmulas retenidas`} en
                Pendiente de pago (nunca llegaron a producción)
              </>
            )}
            .{liberados.length > 0 && ' Las fórmulas que ya están en producción NO se tocan (solo se desvinculan).'}
          </p>
        </ModalConfirmacion>
      )}
    </div>
  );
}

// ---------------- Simulador (cotización de prueba, SIN validez) ----------------
//
// Pedido de Tomi 11-ago: "a veces un médico me escribe y me dice che
// ¿cuánto me saldría hacer esto? y eso no quiero que quede registrado en
// el mismo lugar que los pacientes". Calcula con el motor real (drogas y
// parámetros vigentes) vía /api/cotizador/simular y NO guarda nada.

type ActivoSim = { drogaId: string; dosis: string; unidad: string };
type LineaSim = { nCapsulas: string; activos: ActivoSim[] };
type ResultadoSim = {
  lineas: {
    titulo: string;
    nCapsulas: number | null;
    activos: { nombre: string; dosis: number; unidad: string; costo: number | null }[];
    costoExtra: number | null;
    costoCapsulas: number | null;
    costoEnvase: number | null;
    costoTiempo: number | null;
    precioSugerido: number | null;
  }[];
  faltantes: string[];
  totales: { sugerido: number; precioTotal: number; precioTransferencia: number } | null;
};

const UNIDADES_SIM = ['mg', 'µg', 'g', 'UI'] as const;

function Simulador({ drogas }: { drogas: CotizadorDroga[] }) {
  const nuevoActivo = (): ActivoSim => ({ drogaId: '', dosis: '', unidad: 'mg' });
  const nuevaLinea = (): LineaSim => ({ nCapsulas: '', activos: [nuevoActivo()] });
  const [lineas, setLineas] = useState<LineaSim[]>([nuevaLinea()]);
  const [envio, setEnvio] = useState<Envio>('sin');
  const [descuento, setDescuento] = useState('');
  const [resultado, setResultado] = useState<ResultadoSim | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);

  // Cualquier cambio invalida el resultado anterior (nada de totales viejos).
  function editar(fn: (ls: LineaSim[]) => LineaSim[]) {
    setLineas(fn);
    setResultado(null);
  }

  const hayActivos = lineas.some((l) => l.activos.some((a) => a.drogaId !== ''));

  async function calcular() {
    setCalculando(true);
    setError('');
    try {
      const payload = {
        envio,
        descuentoExtraPct: Number(descuento.replace(',', '.')) || 0,
        lineas: lineas
          .map((l) => ({
            nCapsulas: Number(l.nCapsulas.replace(',', '.')) || null,
            activos: l.activos
              .filter((a) => a.drogaId !== '')
              .map((a) => {
                const d = drogas.find((x) => x.id === Number(a.drogaId));
                return {
                  nombre: d?.nombre ?? '',
                  dosis: Number(a.dosis.replace(',', '.')) || 0,
                  unidad: a.unidad,
                  drogaId: Number(a.drogaId),
                };
              }),
          }))
          .filter((l) => l.activos.length > 0),
      };
      const res = await fetch('/api/cotizador/simular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo simular');
      setResultado(data);
    } catch (e: any) {
      setError(e.message ?? 'No se pudo simular');
    } finally {
      setCalculando(false);
    }
  }

  async function copiarResumen() {
    if (!resultado?.totales) return;
    const partes: string[] = ['🧪 Cotización de PRUEBA — sin validez'];
    resultado.lineas.forEach((l, i) => {
      const comp = l.activos.map((a) => `${a.nombre} ${a.dosis} ${a.unidad}`).join(' + ');
      partes.push(`Fórmula ${i + 1}: ${l.nCapsulas ?? '—'} cáps — ${comp}`);
    });
    if (envio !== 'sin') partes.push(`Envío: ${LABEL_ENVIO[envio]}`);
    partes.push(`💰 Precio de lista (3 cuotas): ${formatoPeso(resultado.totales.precioTotal)}`);
    partes.push(`💸 Transferencia: ${formatoPeso(resultado.totales.precioTransferencia)}`);
    try {
      await navigator.clipboard.writeText(partes.join('\n'));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setError('El navegador bloqueó el copiado — copiá los números a mano.');
    }
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/50 p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-violet-900">🧪 Simulador — cotización de prueba</p>
        <span className="badge bg-violet-100 text-violet-800">NO se guarda nada · sin validez</span>
      </div>
      <p className="mb-3 text-xs text-violet-800/80">
        Para responder el &quot;¿cuánto me saldría?&quot; de un médico: calcula con las drogas y parámetros
        vigentes del cotizador y no deja ningún registro en el sistema.
      </p>

      <div className="space-y-2">
        {lineas.map((l, i) => (
          <div key={i} className="rounded-xl border border-violet-200 bg-white p-3 text-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <b>Fórmula {i + 1}</b>
              <input
                className="input !w-24 !py-1 text-center"
                inputMode="numeric"
                placeholder="cáps"
                value={l.nCapsulas}
                onChange={(e) => editar((ls) => ls.map((x, k) => (k !== i ? x : { ...x, nCapsulas: e.target.value })))}
              />
              <span className="text-xs text-slate-500">cápsulas totales</span>
              {lineas.length > 1 && (
                <button
                  className="ml-auto text-xs text-red-500 hover:underline"
                  onClick={() => editar((ls) => ls.filter((_, k) => k !== i))}
                >
                  ✕ quitar fórmula
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {l.activos.map((a, j) => (
                <div key={j} className="flex flex-wrap items-center gap-1.5">
                  <select
                    className="input !w-auto grow !py-1 text-xs"
                    value={a.drogaId}
                    onChange={(e) =>
                      editar((ls) =>
                        ls.map((x, k) =>
                          k !== i ? x : { ...x, activos: x.activos.map((y, m) => (m !== j ? y : { ...y, drogaId: e.target.value })) }
                        )
                      )
                    }
                  >
                    <option value="">elegir droga…</option>
                    {drogas.filter((d) => d.activo).map((d) => (
                      <option key={d.id} value={d.id}>{d.nombre} (${d.costoUnitario ?? '—'}/{d.unidad})</option>
                    ))}
                  </select>
                  <input
                    className="input !w-20 !py-1 text-center text-xs"
                    inputMode="decimal"
                    placeholder="dosis"
                    value={a.dosis}
                    onChange={(e) =>
                      editar((ls) =>
                        ls.map((x, k) =>
                          k !== i ? x : { ...x, activos: x.activos.map((y, m) => (m !== j ? y : { ...y, dosis: e.target.value })) }
                        )
                      )
                    }
                  />
                  <select
                    className="input !w-auto !py-1 text-xs"
                    value={a.unidad}
                    onChange={(e) =>
                      editar((ls) =>
                        ls.map((x, k) =>
                          k !== i ? x : { ...x, activos: x.activos.map((y, m) => (m !== j ? y : { ...y, unidad: e.target.value })) }
                        )
                      )
                    }
                  >
                    {UNIDADES_SIM.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <span className="text-xs text-slate-400">por cápsula</span>
                  {l.activos.length > 1 && (
                    <button
                      className="text-xs text-red-400 hover:underline"
                      onClick={() =>
                        editar((ls) => ls.map((x, k) => (k !== i ? x : { ...x, activos: x.activos.filter((_, m) => m !== j) })))
                      }
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            {l.activos.length < 15 && (
              <button
                className="mt-2 text-xs font-semibold text-violet-700 hover:underline"
                onClick={() => editar((ls) => ls.map((x, k) => (k !== i ? x : { ...x, activos: [...x.activos, nuevoActivo()] })))}
              >
                + agregar activo
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {lineas.length < 5 && (
          <button className="btn-ghost" onClick={() => editar((ls) => [...ls, nuevaLinea()])}>
            + otra fórmula
          </button>
        )}
        <div>
          <label className="label">Envío</label>
          <select className="input" value={envio} onChange={(e) => { setEnvio(e.target.value as Envio); setResultado(null); }}>
            {(Object.keys(LABEL_ENVIO) as Envio[]).map((ev) => (
              <option key={ev} value={ev}>{LABEL_ENVIO[ev]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">🎁 Desc. extra %</label>
          <input
            className="input !w-24 text-center"
            inputMode="decimal"
            placeholder="0"
            value={descuento}
            onChange={(e) => { setDescuento(e.target.value); setResultado(null); }}
          />
        </div>
        <button className="btn-primary" disabled={!hayActivos || calculando} onClick={calcular}>
          {calculando ? 'Calculando…' : '🧮 Calcular (sin guardar)'}
        </button>
      </div>

      {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}

      {resultado && (
        <div className="mt-3 rounded-xl border border-violet-200 bg-white p-3">
          {resultado.faltantes.length > 0 && (
            <div className="mb-2 rounded-lg border-l-4 border-l-amber-500 bg-amber-50 p-2.5 text-xs text-amber-800">
              <b>No se pudo poner precio:</b>
              <ul className="mt-0.5 list-inside list-disc">
                {resultado.faltantes.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
          {resultado.lineas.map((l, i) => (
            l.precioSugerido != null && (
              <p key={i} className="text-xs text-slate-500">
                Fórmula {i + 1} · Activos{' '}
                {formatoPeso(l.activos.reduce((acc, a) => acc + (a.costo ?? 0), 0))} · Excipientes {formatoPeso(l.costoExtra)} · Cápsulas{' '}
                {formatoPeso(l.costoCapsulas)} · Envase {formatoPeso(l.costoEnvase)} · Tiempo {formatoPeso(l.costoTiempo)} →{' '}
                <b className="text-slate-700">Sugerido {formatoPeso(l.precioSugerido)}</b>
              </p>
            )
          ))}
          {resultado.totales && (
            <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-2">
              <p className="text-lg font-black">
                💰 Lista: {formatoPeso(resultado.totales.precioTotal)}
                <span className="ml-3 text-base font-bold text-green-700">
                  💸 Transferencia: {formatoPeso(resultado.totales.precioTransferencia)}
                </span>
              </p>
              <button className="btn-ghost ml-auto" onClick={copiarResumen}>
                {copiado ? '✅ Copiado' : '📋 Copiar resumen'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Modal chico de confirmación — mismo contrato que los modales post-B-22:
// el fondo NUNCA cierra, solo ✕ / Cancelar / Escape.
function ModalConfirmacion({
  titulo,
  children,
  onCerrar,
  onConfirmar,
  textoConfirmar,
  destructivo = false,
}: {
  titulo: string;
  children: React.ReactNode;
  onCerrar: () => void;
  onConfirmar: () => void;
  textoConfirmar: string;
  destructivo?: boolean;
}) {
  useCerrarModal(onCerrar);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{titulo}</h3>
          <button onClick={onCerrar}>✕</button>
        </div>
        {children}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button
            className={`btn-primary ${destructivo ? '!bg-red-600 hover:!bg-red-700' : ''}`}
            onClick={onConfirmar}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
