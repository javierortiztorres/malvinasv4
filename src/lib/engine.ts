// ================================================================
// MOTOR DE CÁLCULO MALVINAS 2.0
// Portado y extendido desde MALVINAS (lib/calculations.ts)
//
// Reglas de oro (validadas con I+D):
// - Extrusión (mL) = (dosis por cápsula en mg ÷ concentración) ÷ 1000 ÷ IP
// - El IP SIEMPRE se mantiene, aunque se cambie la concentración
// - División automática: cápsulas por toma = ceil(volumen total ÷ 0.95)
// - Mínimo de extrusión de la impresora: 0.03 mL por capa
// - Capacidad: cuerpo 0.9 mL + tapa 0.1 mL (límite de trabajo 0.95 por expansión)
// - LA TAPA NO SE LLENA salvo que el cuerpo supere 0.9 mL. Recién ahí se
//   pasa a la tapa una capa APTA para tapa (tintas en PEG, CoQ10, Idebenona;
//   las de oleogel nunca). tinta.ubicacion = 'tapa' significa "APTA para
//   tapa", no "va siempre a la tapa".
// - Conversión de dosis por tinta: si la receta viene en otra unidad
//   (UI, µg de elemento), cada tinta puede definir cuántos mg de materia
//   prima equivalen a 1 unidad de receta (ej: levadura de selenio 0,2% Se
//   → 1 µg de Se = 0,5 mg de levadura).
// - Dilución: apunta a llenar 0.8 mL; por debajo de 0.55 mL la cápsula
//   queda "demasiado vacía". NUNCA se sugiere concentrar.
// ================================================================

import type { CapaTinta, Tinta } from '@/db/schema';

export const CAPACIDAD_TRABAJO_ML = 0.95;
export const CAPACIDAD_CUERPO_ML = 0.9;
export const CAPACIDAD_TAPA_ML = 0.1;
export const EXTRUSION_MINIMA_ML = 0.03;
export const OBJETIVO_LLENADO_ML = 0.8;
export const MINIMO_ACEPTADO_ML = 0.55;

// Merma de producción de PI: al hacer un lote se pesa un 45% MÁS de cada
// principio activo que la necesidad calculada (pérdidas en vaso, jeringa,
// descarte de impresora). El excipiente acompaña solo, porque el total del
// lote se deriva del activo por porcentaje: total = activo ÷ concentración.
export const MERMA_PI = 0.45;

// Activo a producir con merma, redondeado HACIA ARRIBA a 2 decimales.
export function activoConMerma(gActivoNecesario: number): number {
  return Math.ceil(gActivoNecesario * (1 + MERMA_PI) * 100 - 1e-7) / 100;
}

// ---------- Conversión de unidades a mg ----------
export function normUnidad(unidad: string): string {
  const u = (unidad ?? '').trim().toLowerCase().replace('μ', 'µ');
  if (u === 'ug' || u === 'mcg' || u === 'µg') return 'µg';
  if (u === 'ui' || u === 'u.i.' || u === 'iu') return 'UI';
  return u; // mg, g, ml, %
}

export function aMg(dosis: number, unidad: string): number | null {
  const u = normUnidad(unidad);
  if (u === 'mg') return dosis;
  if (u === 'µg') return dosis / 1000;
  if (u === 'g') return dosis * 1000;
  return null; // UI, ml, % → requieren conversión según la tinta
}

// Dosis efectiva EN MG DE MATERIA PRIMA para una tinta dada.
// Si la tinta define conversión (convUnidad + convMgPorUnidad) y la unidad
// de la receta coincide, se usa ese factor (ej: selenio en µg → mg de
// levadura). Si no, se convierte por masa (mg/µg/g). UI sin factor → null.
export function dosisEnMgParaTinta(
  dosis: number | null | undefined,
  unidad: string,
  t: Tinta | null | undefined
): { mg: number | null; convertida: boolean } {
  if (dosis == null || !(dosis > 0)) return { mg: null, convertida: false };
  const u = normUnidad(unidad);
  if (t?.convMgPorUnidad && t.convMgPorUnidad > 0 && t.convUnidad && normUnidad(t.convUnidad) === u) {
    return { mg: dosis * t.convMgPorUnidad, convertida: true };
  }
  return { mg: aMg(dosis, unidad), convertida: false };
}

// ---------- Cálculo por capa ----------
// dosisMg es POR TOMA; capsulasPorToma divide la dosis en N cápsulas iguales.
export function extrusionCapa(
  dosisMg: number | null,
  concentracion: number | null,
  ip: number | null,
  capsulasPorToma: number
): number | null {
  if (!dosisMg || !concentracion || !ip || dosisMg <= 0 || concentracion <= 0 || ip <= 0)
    return null;
  const dosisPorCapsula = dosisMg / (capsulasPorToma || 1);
  const masaTintaMg = dosisPorCapsula / concentracion;
  return masaTintaMg / 1000 / ip;
}

export type CapaCalculada = CapaTinta & {
  extrusion: number | null; // extrusión por cápsula (mL) con la división actual
  bajoMinimo: boolean; // extrusión < 0.03 mL
  concentracionMaxParaMinimo: number | null; // conc. máxima para llegar al mínimo de 0.03
};

export type ResultadoCapsula = {
  capas: CapaCalculada[];
  capsulasPorTomaAuto: number; // lo que calcula el sistema
  capsulasPorToma: number; // lo aplicado (auto u override)
  volumenTotal: number; // mL por cápsula con la división aplicada
  volumenCuerpo: number;
  volumenTapa: number;
  ocupacionPct: number; // % sobre 0.95
  seDivide: boolean; // capsulasPorToma > 1 → AVISO ROJO
  excedeCuerpo: boolean;
  excedeTapa: boolean;
  muyVacia: boolean; // volumenTotal < 0.55
  sugerenciaDilucion: SugerenciaDilucion | null;
};

export type SugerenciaDilucion = {
  capaRef: number;
  tinta: string;
  concentracionActual: number;
  concentracionSugerida: number; // para llegar a OBJETIVO_LLENADO_ML total
  volumenResultante: number;
};

function volumenTotalConDivision(capas: CapaTinta[], n: number): number {
  let total = 0;
  for (const c of capas) {
    const v = extrusionCapa(c.dosisMg, c.concentracion, c.ip, n);
    if (v) total += v;
  }
  return total;
}

// ---------- Cálculo completo de la cápsula ----------
export function calcularCapsula(
  capas: CapaTinta[],
  override: { manual: boolean; capsulasPorToma: number }
): ResultadoCapsula {
  // 1. División automática: con N=1, ¿cuánto ocupa? → ceil(vol / 0.95)
  const volumenBase = volumenTotalConDivision(capas, 1);
  const capsulasPorTomaAuto = Math.max(1, Math.ceil(volumenBase / CAPACIDAD_TRABAJO_ML) || 1);
  const capsulasPorToma = override.manual ? override.capsulasPorToma : capsulasPorTomaAuto;

  // 2. Calcular cada capa con la división aplicada
  const capasCalc: CapaCalculada[] = capas.map((c) => {
    const extrusion = extrusionCapa(c.dosisMg, c.concentracion, c.ip, capsulasPorToma);
    const bajoMinimo = extrusion !== null && extrusion < EXTRUSION_MINIMA_ML;
    // Concentración máxima que llevaría esta capa al mínimo imprimible:
    // 0.03 = (dosis/N ÷ C) ÷ 1000 ÷ IP  →  C = dosis/N ÷ (0.03 × 1000 × IP)
    let concentracionMaxParaMinimo: number | null = null;
    if (bajoMinimo && c.dosisMg && c.ip) {
      concentracionMaxParaMinimo =
        c.dosisMg / capsulasPorToma / (EXTRUSION_MINIMA_ML * 1000 * c.ip);
    }
    return { ...c, extrusion, bajoMinimo, concentracionMaxParaMinimo };
  });

  // 3. Volúmenes por ubicación
  const volumenTotal = capasCalc.reduce((s, c) => s + (c.extrusion ?? 0), 0);
  const volumenTapa = capasCalc
    .filter((c) => c.ubicacion === 'tapa')
    .reduce((s, c) => s + (c.extrusion ?? 0), 0);
  const volumenCuerpo = volumenTotal - volumenTapa;

  // 4. Sugerencia de dilución para llenar la cápsula (solo diluir, nunca concentrar)
  //    Se aplica sobre la capa de MAYOR volumen (la "principal").
  let sugerenciaDilucion: SugerenciaDilucion | null = null;
  const muyVacia = volumenTotal > 0 && volumenTotal < MINIMO_ACEPTADO_ML;
  if (volumenTotal > 0 && volumenTotal < OBJETIVO_LLENADO_ML) {
    const candidatas = capasCalc.filter(
      (c) => c.extrusion && c.dosisMg && c.ip && c.concentracion
    );
    if (candidatas.length > 0) {
      const mayor = candidatas.reduce((a, b) => (a.extrusion! >= b.extrusion! ? a : b));
      const volumenObjetivoCapa = mayor.extrusion! + (OBJETIVO_LLENADO_ML - volumenTotal);
      // C' = dosisPorCápsula ÷ (V_objetivo × 1000 × IP)
      const nueva =
        mayor.dosisMg! / capsulasPorToma / (volumenObjetivoCapa * 1000 * mayor.ip!);
      if (nueva < mayor.concentracion!) {
        sugerenciaDilucion = {
          capaRef: mayor.ref,
          tinta: mayor.tinta,
          concentracionActual: mayor.concentracion!,
          concentracionSugerida: nueva,
          volumenResultante: volumenObjetivoCapa,
        };
      }
    }
  }

  return {
    capas: capasCalc,
    capsulasPorTomaAuto,
    capsulasPorToma,
    volumenTotal,
    volumenCuerpo,
    volumenTapa,
    ocupacionPct: Math.min((volumenTotal / CAPACIDAD_TRABAJO_ML) * 100, 100),
    seDivide: capsulasPorToma > 1,
    excedeCuerpo: volumenCuerpo > CAPACIDAD_CUERPO_ML + 1e-9,
    excedeTapa: volumenTapa > CAPACIDAD_TAPA_ML + 1e-9,
    muyVacia,
    sugerenciaDilucion,
  };
}

// ---------- Mapeo receta → tinta ----------
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type OpcionTinta = {
  tinta: Tinta;
  dosisMg: number | null; // dosis convertida a mg de materia prima PARA ESTA TINTA
  convertida: boolean; // true si se usó el factor de conversión de la tinta
  extrusion: number | null; // con la dosis dada, cápsulas por toma = 1
  imprimible: boolean; // extrusión >= 0.03
};

// Devuelve las tintas que matchean un activo de la receta, ordenadas:
// primero las imprimibles de menor volumen (criterio: la que menos ocupa),
// después las que quedan bajo el mínimo. La dosis se convierte por tinta
// (factor de conversión propio si lo tiene; si no, por masa).
export function tintasParaActivo(
  activoReceta: string,
  dosis: number | null,
  unidad: string,
  catalogo: Tinta[]
): OpcionTinta[] {
  const objetivo = normalizar(activoReceta);
  if (!objetivo) return [];

  const matches = catalogo.filter((t) => {
    if (!t.activo) return false;
    const kws = (t.keywords ?? '')
      .split(',')
      .map((k) => normalizar(k))
      .filter(Boolean);
    const nombreNorm = normalizar(t.nombre);
    return (
      kws.some((k) => objetivo.includes(k) || k.includes(objetivo)) ||
      objetivo.includes(nombreNorm) ||
      nombreNorm.includes(objetivo)
    );
  });

  const opciones: OpcionTinta[] = matches.map((t) => {
    const { mg, convertida } = dosisEnMgParaTinta(dosis, unidad, t);
    const extrusion = extrusionCapa(mg, t.concentracion, t.ip, 1);
    return {
      tinta: t,
      dosisMg: mg,
      convertida,
      extrusion,
      imprimible: extrusion !== null && extrusion >= EXTRUSION_MINIMA_ML,
    };
  });

  return opciones.sort((a, b) => {
    if (a.imprimible !== b.imprimible) return a.imprimible ? -1 : 1;
    return (a.extrusion ?? Infinity) - (b.extrusion ?? Infinity);
  });
}

// Crear una capa a partir de una tinta del catálogo.
// dosis y unidad son LOS DE LA RECETA (originales); la dosis en mg de
// materia prima se calcula acá según la tinta (con su conversión si aplica).
// La ubicación arranca SIEMPRE en cuerpo: la tapa solo se usa cuando el
// cuerpo supera 0.9 mL (ver autoUbicarCapas).
export function capaDesdeTinta(
  ref: number,
  activoReceta: string,
  dosis: number | null,
  unidad: string,
  t: Tinta | null
): CapaTinta {
  const { mg } = dosisEnMgParaTinta(dosis, unidad, t);
  return {
    ref,
    activoReceta,
    dosisMg: mg,
    dosisOriginal: dosis,
    unidadOriginal: unidad,
    tintaId: t?.id ?? null,
    tinta: t?.nombre ?? '',
    concentracion: t?.concentracion ?? null,
    ip: t?.ip ?? null,
    ubicacion: 'cuerpo',
    ubicacionManual: false,
    aptaTapa: t?.ubicacion === 'tapa',
    lote: '',
    poe: t?.poe ?? '',
    alerta: t?.alerta ?? '',
    aManopla: t?.aManopla ?? false,
    extrusionMl: null,
  };
}

// ---------- Ubicación automática cuerpo/tapa ----------
// Regla: TODO va al cuerpo. Solo si el cuerpo supera 0.9 mL se pasan a la
// tapa capas APTAS (tintas en PEG/CoQ10/Idebenona) que entren en 0.1 mL,
// empezando por la de mayor volumen que quepa. Las capas con ubicación
// fijada a mano (ubicacionManual) se respetan siempre.
export function autoUbicarCapas(
  capas: CapaTinta[],
  capsulasPorToma: number,
  catalogo: Tinta[]
): CapaTinta[] {
  const EPS = 1e-9;
  const info = capas.map((c) => {
    const ext = extrusionCapa(c.dosisMg, c.concentracion, c.ip, capsulasPorToma) ?? 0;
    // Compatibilidad con capas viejas sin aptaTapa: se deriva del catálogo.
    const apta =
      c.aptaTapa ?? (c.tintaId != null && catalogo.find((t) => t.id === c.tintaId)?.ubicacion === 'tapa');
    return { ext, apta: !!apta };
  });

  // Las manuales quedan como están; el resto arranca en el cuerpo.
  const out: CapaTinta[] = capas.map((c, i) =>
    c.ubicacionManual ? { ...c, aptaTapa: info[i].apta } : { ...c, ubicacion: 'cuerpo', aptaTapa: info[i].apta }
  );

  let cuerpo = 0;
  let tapa = 0;
  out.forEach((c, i) => {
    if (c.ubicacion === 'tapa') tapa += info[i].ext;
    else cuerpo += info[i].ext;
  });

  while (cuerpo > CAPACIDAD_CUERPO_ML + EPS) {
    let mejor = -1;
    for (let i = 0; i < out.length; i++) {
      if (out[i].ubicacionManual || out[i].ubicacion === 'tapa') continue;
      if (!info[i].apta || info[i].ext <= 0) continue;
      if (info[i].ext > CAPACIDAD_TAPA_ML - tapa + EPS) continue; // no entra en la tapa
      if (mejor === -1 || info[i].ext > info[mejor].ext) mejor = i;
    }
    if (mejor === -1) break; // no hay nada apto que quepa: queda el aviso de cuerpo excedido
    out[mejor] = { ...out[mejor], ubicacion: 'tapa' };
    cuerpo -= info[mejor].ext;
    tapa += info[mejor].ext;
  }
  return out;
}

// ---------- Producto intermedio: pesadas teóricas ----------
export type PesadaTeorica = {
  nombre: string;
  esPI: boolean;
  gramos: number;
};

// Dada una tinta, su concentración (editable) y la cantidad total a producir,
// desglosa el activo y los excipientes.
// SEMÁNTICA v2.0.4: la fracción de cada excipiente es SOBRE EL TOTAL de la
// tinta (activo + excipientes = 100%). Ej: Pregnenolona 5,7% + PEG 94,3%.
// CORRECCIÓN v2.0.7: la concentración del LOTE puede ser distinta a la del
// catálogo (dilución). El activo pesa cantidad × concentración del lote y
// los excipientes se reparten TODO EL RESTO (cantidad × (1 − concentración))
// manteniendo sus proporciones relativas del catálogo, de modo que
// activo + excipientes = cantidad total SIEMPRE.
// Ej: 100 g al 1,37% con tinta madre Melatonina 20% + PEG 80% →
// Melatonina 1,37 g + PEG 98,63 g (no 80 g).
export function pesadasPI(
  activoNombre: string,
  concentracion: number,
  cantidadTotalG: number,
  excipientes: { nombre: string; fraccion: number }[],
  catalogoTintas: Tinta[]
): PesadaTeorica[] {
  const activoG = cantidadTotalG * concentracion;
  const nombresTintas = catalogoTintas.map((t) => normalizar(t.nombre));
  const rows: PesadaTeorica[] = [
    { nombre: activoNombre, esPI: false, gramos: activoG },
  ];
  const restoG = Math.max(0, cantidadTotalG - activoG); // g de excipiente del lote
  const sumaFracciones = excipientes.reduce((s, e) => s + (e.fraccion || 0), 0);
  for (const e of excipientes) {
    const esPI = nombresTintas.some(
      (n) => n.includes(normalizar(e.nombre)) || normalizar(e.nombre).includes(n)
    );
    const proporcion = sumaFracciones > 0 ? e.fraccion / sumaFracciones : 0;
    rows.push({ nombre: e.nombre, esPI, gramos: restoG * proporcion });
  }
  return rows;
}

// Nombre "limpio" del activo a partir del nombre interno de una tinta,
// para documentos con validez: saca la concentración final ("3%", "0.43%"),
// los apodos entre paréntesis (salvavidas, concentrada, diluida, impura) y
// los sufijos de dosificación ("para 1 mg"). Ej:
// "Melatonina para 1 mg 3%" → "Melatonina"; "B12 (concentrada) 5.45%" → "B12".
export function limpiarNombreTinta(nombre: string): string {
  let n = (nombre ?? '').trim();
  n = n.replace(/\s*\(\s*(salvavidas|concentrada|diluida|impura)\s*\)/gi, '');
  n = n.replace(/\s+para\s+\d+([.,]\d+)?\s*(mg|µg|ug|mcg|g|ui)\b/gi, '');
  n = n.replace(/\s*\d+([.,]\d+)?\s*%.*$/, '');
  return n.trim() || nombre;
}

// Nº de POE derivado del lote de PI usado: es la parte inicial del lote.
// Ej: "FPI.01.PI013/P006" → "FPI.01.PI013". Sin "/" no hay POE derivable.
export function poeDesdeLote(lote: string | null | undefined): string {
  if (!lote) return '';
  const i = lote.indexOf('/');
  return i > 0 ? lote.slice(0, i).trim() : '';
}

// ---------- Formato ----------
export function fmtMl(v: number | null | undefined, dec = 3): string {
  if (v == null || isNaN(v)) return '—';
  return `${v.toFixed(dec)} mL`;
}
export function fmtPct(c: number | null | undefined, dec = 2): string {
  if (c == null || isNaN(c)) return '—';
  const p = c * 100;
  return `${Number(p.toFixed(dec))}%`;
}
export function fmtG(v: number | null | undefined, dec = 2): string {
  if (v == null || isNaN(v)) return '—';
  return `${v.toFixed(dec)} g`;
}
