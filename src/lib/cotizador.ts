import type { Cotizacion, CotizadorDroga, LineaCotizacion, Registro } from '@/db/schema';

// ---------------------------------------------------------------
// Cotizador (branch atencion-cliente).
//
// ETAPA ACTUAL: la estructura y el flujo completo (estados, historial,
// comprobantes, mensaje) están funcionando, y el PRECIO se carga a mano —
// igual que hoy lo hace Tomi con el Excel al lado. El motor que replica el
// Excel "NUEVO COTIZADOR" (costos por droga, cápsulas, envase, tiempo
// operador, markup, envíos) se enchufa acá cuando terminemos de portarlo:
// la única función a reemplazar es calcularLineas() y los parámetros
// pasan a leerse de la tabla de costos que administra el Admin.
// ---------------------------------------------------------------

// % de descuento por pago por transferencia (el que usa el mensaje actual
// de WhatsApp). Pasa a ser configurable desde la pantalla del cotizador
// cuando esté la tabla de parámetros.
export const DESCUENTO_TRANSFERENCIA = 0.15;

export function redondearPeso(v: number): number {
  return Math.round(v);
}

export function precioTransferenciaSugerido(precioTotal: number | null): number | null {
  if (precioTotal == null) return null;
  return redondearPeso(precioTotal * (1 - DESCUENTO_TRANSFERENCIA));
}

// Armar las líneas de una cotización a partir de los registros PT creados
// por el Lector: una línea por fórmula, con la composición copiada (la
// cotización es un snapshot: si después borran el registro, la línea queda).
// Los costos quedan en null hasta que el motor del Excel esté portado.
export function lineasDesdeRegistros(regs: Registro[]): LineaCotizacion[] {
  return regs.map((r) => ({
    registroId: r.id,
    titulo: r.tituloFormula || '',
    nCapsulas: r.capsulasTotales ?? null,
    // La dosis de la fórmula es POR TOMA (igual que en el registro):
    // capsulasPorToma viaja a la línea para que el motor reparta bien.
    capsulasPorToma: r.capsulasPorToma || 1,
    dias: r.dias ?? null,
    activos: (r.formula ?? []).map((a) => ({
      nombre: a.activo,
      dosis: a.dosis,
      unidad: a.unidad,
      costo: null,
    })),
    costoCapsulas: null,
    costoEnvase: null,
    costoTiempo: null,
    costoExtra: null,
    precioSugerido: null,
    precioComercial: null,
  }));
}

export function formatoPeso(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + Math.round(v).toLocaleString('es-AR');
}

// "miércoles 12 de agosto" a partir de un deadline YYYY-MM-DD.
export function fechaLargaES(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const f = new Date(Date.UTC(y, m - 1, d));
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${dias[f.getUTCDay()]} ${d} de ${meses[m - 1]}`;
}

function primerNombre(paciente: string): string {
  const limpio = (paciente || '').trim();
  if (!limpio) return '';
  // "APELLIDO, NOMBRE" → NOMBRE; si no hay coma, la primera palabra.
  const partes = limpio.includes(',') ? limpio.split(',')[1] : limpio.split(/\s+/)[0];
  const nombre = (partes || '').trim().split(/\s+/)[0] || '';
  return nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
}

// ---------------------------------------------------------------
// MOTOR DE PRECIOS — portado del Excel "NUEVO COTIZADOR" (10-ago-2026).
// Réplica exacta de las fórmulas del bloque CAPSULA 1 (los bloques 2 y 3
// del Excel tenían errores de copia que acá NO se replican: cada fórmula
// usa SUS PROPIAS cápsulas y activos).
//
//   activo:   min(costoUnitario × markup, precioComercialUnitario)
//             × dosis(convertida a la unidad de la droga) × nCaps
//   excip.:   nCaps × excipientePorCapsula                  (sin markup)
//   cápsulas: nCaps × (costoCapsula×markup + costoJeringa×markup/capsPorJeringa)
//   envase:   ceil(nCaps/capsPorEnvase) × costoPackaging×markupPackaging + costoCaja
//   tiempo:   (minutosBase + nActivos × ceil(nCaps/capsPorTandaTiempo)
//             × minutosPorActivoCada30Caps) × costoMinuto × markup × factorTiempo
//   sugerido de la fórmula = suma de los 5 bloques
//   base     = Σ sugeridos × (1+cargaExtra) + envío(sin/corto/largo)
//   LISTA (3 cuotas) = base / (1 − descuentoTransferencia)   ← lo del mensaje
//   TRANSFERENCIA    = base
// ---------------------------------------------------------------

export type CotizadorConfig = {
  markupGeneral: number;
  cargaExtra: number; // fracción (0.1 = +10%) sobre la suma de sugeridos
  costoMinutoFarmaceutico: number;
  factorTiempo: number; // el ×0.6 del Excel sobre el minuto con markup
  minutosBase: number;
  minutosPorActivoCada30Caps: number;
  capsPorTandaTiempo: number;
  costoCapsula: number;
  costoJeringa: number;
  capsPorJeringa: number; // 1 jeringa cada N cápsulas (C65/10 del Excel)
  excipientePorCapsula: number; // sin markup
  costoPackaging: number;
  markupPackaging: number; // el envase lleva ×2, no ×7
  capsPorEnvase: number; // 1 envase cada N cápsulas (ROUNDUP(n/90))
  costoCaja: number; // caja secundaria, una por pedido de fórmula
  descuentoTransferencia: number; // 0.15 → lista = base/0.85
  envioCorto: number;
  envioLargo: number;
};

// Valores vigentes del Excel al portarlo (10-ago-2026). La config real
// vive en la tabla cotizador_config y la edita el Admin; esto es el
// fallback y el "reset de fábrica".
export const CONFIG_DEFAULT: CotizadorConfig = {
  markupGeneral: 7,
  cargaExtra: 0,
  costoMinutoFarmaceutico: 209.67,
  factorTiempo: 0.6,
  minutosBase: 10,
  minutosPorActivoCada30Caps: 2,
  capsPorTandaTiempo: 30,
  costoCapsula: 36.08,
  costoJeringa: 98.08,
  capsPorJeringa: 10,
  // OJO: en el Excel la celda del costo de excipientes (C67) está VACÍA —
  // los $6,5 de la celda E67 nunca entran al precio. Se replica ese
  // comportamiento (0) para que los precios den IGUALES a los actuales;
  // si Tomi decide cobrarlo, lo sube desde la pantalla ⚙️ Cotizador.
  excipientePorCapsula: 0,
  costoPackaging: 850,
  markupPackaging: 2,
  capsPorEnvase: 90,
  costoCaja: 4150,
  descuentoTransferencia: 0.15,
  envioCorto: 5000,
  envioLargo: 10000,
};

export function configCompleta(datos: Record<string, number> | null | undefined): CotizadorConfig {
  return { ...CONFIG_DEFAULT, ...(datos ?? {}) };
}

export type Envio = 'sin' | 'corto' | 'largo';
// Semántica aclarada por Tomi (12-ago): el retiro por el Colegio de
// Farmacéuticos es GRATUITO (convenio: se avisa en qué farmacia de la
// localidad retirar); "corto" es envío a domicilio DENTRO de Córdoba
// capital y "largo" a domicilio FUERA de Córdoba capital.
export const LABEL_ENVIO: Record<Envio, string> = {
  sin: 'Sin envío — retiro (farmacia / Colegio, gratis)',
  corto: 'Envío en Córdoba capital',
  largo: 'Envío fuera de Córdoba capital',
};

export function montoEnvio(envio: Envio, cfg: CotizadorConfig): number {
  return envio === 'largo' ? cfg.envioLargo : envio === 'corto' ? cfg.envioCorto : 0;
}

export function normalizarNombre(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Matcheo receta → droga del cotizador, en 3 niveles de confianza:
// 1. nombre exacto normalizado (score 1000);
// 2. FRASE COMPLETA con límites de palabra, nombre o keyword ("Vit. B12"
//    nunca cae en la keyword "B1") — score 500 + largo de la frase;
// 3. tokens COMPARTIDOS sin importar el orden ("Manganeso Quelado" ↔
//    "Quelato de Manganeso", "Vit. B2 (Riboflavina)" ↔ "Riboflavina
//    (Vitamina B2)") — score = suma de largos de los tokens compartidos,
//    pidiendo al menos un token distintivo (no vale matchear solo por
//    "vitamina") y un mínimo de evidencia.
const TOKENS_GENERICOS = new Set(['vitamina', 'vit', 'acido', 'extracto', 'seco', 'quelado', 'quelato', 'sulfato', 'citrato', 'glicinato', 'gluconato']);
const TOKENS_IGNORAR = new Set(['de', 'del', 'la', 'el', 'en', 'l']);

function tokensDe(s: string): string[] {
  return normalizarNombre(s)
    .split(' ')
    .filter((t) => !TOKENS_IGNORAR.has(t) && (t.length >= 3 || /\d/.test(t)));
}

const esFraseGenerica = (f: string): boolean =>
  f.split(' ').every((w) => TOKENS_GENERICOS.has(w) || TOKENS_IGNORAR.has(w));

export function matchDroga(activoReceta: string, drogas: CotizadorDroga[]): CotizadorDroga | null {
  const n = normalizarNombre(activoReceta);
  if (!n) return null;
  const nBordes = ` ${n} `;
  const nTokens = new Set(tokensDe(activoReceta));
  // Una receta hecha SOLO de palabras genéricas ("Vitamina", "Extracto
  // seco") no puede reclamar una droga por contención: matchearía a
  // cualquiera de su familia. Lo mismo una keyword genérica de la droga.
  const recetaGenerica = esFraseGenerica(n);
  let mejor: { d: CotizadorDroga; score: number } | null = null;
  for (const d of drogas) {
    if (!d.activo) continue;
    const dn = normalizarNombre(d.nombre);
    let score = 0;
    if (dn === n) {
      score = 1000;
    } else {
      const frases = [dn, ...(d.keywords || '').split(',').map(normalizarNombre)].filter((f) => f.length >= 2);
      for (const f of frases) {
        const fBordes = ` ${f} `;
        if (
          (nBordes.includes(fBordes) && !esFraseGenerica(f)) ||
          (fBordes.includes(nBordes) && !recetaGenerica)
        ) {
          score = Math.max(score, 500 + f.length);
        }
      }
      if (score === 0) {
        // Nivel 3: tokens compartidos (nombre + keywords de la droga).
        const dTokens = new Set([...tokensDe(d.nombre), ...(d.keywords || '').split(',').flatMap(tokensDe)]);
        let suma = 0;
        let distintivo = false;
        nTokens.forEach((t) => {
          if (dTokens.has(t)) {
            suma += t.length;
            if (!TOKENS_GENERICOS.has(t)) distintivo = true;
          }
        });
        if (distintivo && suma >= 5) score = Math.min(suma, 400);
      }
    }
    if (score > 0 && (!mejor || score > mejor.score)) mejor = { d, score };
  }
  return mejor?.d ?? null;
}

// Precio por unidad CON markup, topeado por el precio comercial de mercado
// (la regla clave del Excel: nunca cobrar un activo más caro que su
// equivalente comercial).
export function precioUnitarioConMarkup(d: CotizadorDroga, cfg: CotizadorConfig): number | null {
  if (d.costoUnitario == null) return d.precioComercialUnitario ?? null;
  const conMarkup = d.costoUnitario * cfg.markupGeneral;
  if (d.precioComercialUnitario != null && conMarkup > d.precioComercialUnitario) {
    return d.precioComercialUnitario;
  }
  return conMarkup;
}

// Convierte la dosis de la receta a la unidad en la que está el precio de
// la droga. null = unidades incompatibles (se resuelve a mano).
export function convertirDosis(dosis: number, unidadReceta: string, unidadDroga: string): number | null {
  // ⚠️ El µ se reemplaza ANTES de normalizar: normalizarNombre() borra los
  // símbolos no a-z, y "µg" quedaría como "g" (bug real del 11-ago: una
  // dosis de B12 en µg se tomó como gramos → precio ×1.000.000).
  const u = (x: string) => normalizarNombre(String(x || 'mg').replace(/µ/g, 'u').replace(/mcg/gi, 'ug'));
  const ur = u(unidadReceta);
  const ud = u(unidadDroga);
  if (ur === ud) return dosis;
  const factor: Record<string, number> = { g: 1000, mg: 1, ug: 0.001 };
  if (ur in factor && ud in factor) return (dosis * factor[ur]) / factor[ud];
  return null; // UI ↔ masa no se convierte automáticamente
}

export type ResultadoLineas = {
  lineas: LineaCotizacion[];
  // Qué faltó para poder poner precio (por línea): activos sin droga
  // asignada, sin conversión de unidad posible, o sin Nº de cápsulas.
  faltantes: string[];
};

export function calcularLineas(
  lineasBase: LineaCotizacion[],
  drogas: CotizadorDroga[],
  cfg: CotizadorConfig
): ResultadoLineas {
  const faltantes: string[] = [];
  const lineas = lineasBase.map((l) => {
    const titulo = l.titulo ? `Fórmula ${l.titulo}` : 'Fórmula';
    const nCaps = l.nCapsulas;
    // División de la dosis (caso BRUSCHI): la dosis es POR TOMA y se
    // reparte en capsulasPorToma cápsulas — el costo del activo se cobra
    // por dosis/división × cápsulas totales, así el total de materia prima
    // no cambia al dividir en más cápsulas (solo suben cápsulas/envase/
    // tiempo). Líneas viejas sin el campo: divisor 1 (igual que antes).
    const division = l.capsulasPorToma && l.capsulasPorToma > 0 ? l.capsulasPorToma : 1;
    if (!nCaps || nCaps <= 0) {
      faltantes.push(`${titulo}: falta el Nº de cápsulas`);
      return { ...l };
    }
    let costoActivos = 0;
    let ok = true;
    const activos = l.activos.map((a) => {
      const droga = a.drogaId != null ? drogas.find((d) => d.id === a.drogaId) ?? null : matchDroga(a.nombre, drogas);
      if (!droga) {
        faltantes.push(`${titulo}: "${a.nombre}" sin droga asignada en el cotizador`);
        ok = false;
        return { ...a, drogaId: null, costo: null };
      }
      const unitario = precioUnitarioConMarkup(droga, cfg);
      if (unitario == null) {
        faltantes.push(`${titulo}: "${droga.nombre}" no tiene costo cargado`);
        ok = false;
        return { ...a, drogaId: droga.id, costo: null };
      }
      const dosisConv = convertirDosis(a.dosis, a.unidad, droga.unidad);
      if (dosisConv == null) {
        faltantes.push(`${titulo}: "${a.nombre}" en ${a.unidad} vs precio en ${droga.unidad} — revisar unidad`);
        ok = false;
        return { ...a, drogaId: droga.id, costo: null };
      }
      const costo = unitario * (dosisConv / division) * nCaps;
      costoActivos += costo;
      return { ...a, drogaId: droga.id, costo: Math.round(costo * 100) / 100 };
    });

    if (!ok) {
      return { ...l, activos, costoCapsulas: null, costoEnvase: null, costoTiempo: null, precioSugerido: null };
    }

    const costoActivosConExc = costoActivos + nCaps * cfg.excipientePorCapsula;
    const costoCapsulas = nCaps * (cfg.costoCapsula * cfg.markupGeneral + (cfg.costoJeringa * cfg.markupGeneral) / cfg.capsPorJeringa);
    const costoEnvase = Math.ceil(nCaps / cfg.capsPorEnvase) * cfg.costoPackaging * cfg.markupPackaging + cfg.costoCaja;
    const costoTiempo =
      (cfg.minutosBase + activos.length * Math.ceil(nCaps / cfg.capsPorTandaTiempo) * cfg.minutosPorActivoCada30Caps) *
      cfg.costoMinutoFarmaceutico *
      cfg.markupGeneral *
      cfg.factorTiempo;
    const precioSugerido = costoActivosConExc + costoCapsulas + costoEnvase + costoTiempo;

    return {
      ...l,
      activos,
      costoExtra: Math.round(nCaps * cfg.excipientePorCapsula * 100) / 100, // excipientes, para el desglose
      costoCapsulas: Math.round(costoCapsulas * 100) / 100,
      costoEnvase: Math.round(costoEnvase * 100) / 100,
      costoTiempo: Math.round(costoTiempo * 100) / 100,
      precioSugerido: Math.round(precioSugerido * 100) / 100,
    };
  });
  return { lineas, faltantes };
}

// Totales del pedido. null si alguna fórmula quedó sin precio.
// descuentoExtraPct (0-100): rebaja adicional a criterio del que cotiza
// (pedido de Tomi 11-ago) — se aplica sobre la base ANTES del recargo de
// cuotas, así lista y transferencia bajan proporcionalmente.
export function totalesDesdeLineas(
  lineas: LineaCotizacion[],
  cfg: CotizadorConfig,
  envio: Envio,
  descuentoExtraPct = 0
): { sugerido: number; precioTotal: number; precioTransferencia: number } | null {
  if (lineas.length === 0 || lineas.some((l) => l.precioSugerido == null)) return null;
  const sugerido = lineas.reduce((acc, l) => acc + (l.precioSugerido ?? 0), 0) * (1 + cfg.cargaExtra);
  const desc = Math.min(Math.max(descuentoExtraPct, 0), 100) / 100;
  const base = (sugerido + montoEnvio(envio, cfg)) * (1 - desc);
  const precioTotal = redondearPeso(base / (1 - cfg.descuentoTransferencia));
  const precioTransferencia = redondearPeso(base);
  return { sugerido: Math.round(sugerido), precioTotal, precioTransferencia };
}

// ---------------------------------------------------------------
// Agenda de Atención al cliente: estado de ENTREGA de un pedido (el grupo
// de fórmulas de una receta), pedido por Tomi 10-ago:
//   rojo = pendientes · amarillo = pre-producción/producción ·
//   verde = terminado (para entregar) · azul = ENTREGADO (lo marca
//   Atención) · gris = no se puede producir (cómo se marca queda para
//   definir con Formulación/Impresión — el estado ya se muestra).
// ---------------------------------------------------------------

export type EstadoEntregaAC = 'rojo' | 'amarillo' | 'verde' | 'azul' | 'gris';

export function estadoGrupoAC(regs: Pick<Registro, 'estado' | 'enProduccion' | 'entregadoEn' | 'noProducibleMotivo'>[]): EstadoEntregaAC {
  if (regs.length === 0) return 'gris';
  if (regs.some((r) => r.noProducibleMotivo)) return 'gris';
  if (regs.every((r) => r.entregadoEn != null)) return 'azul';
  const estados = regs.map((r) => estadoDeRegistro(r));
  if (estados.every((e) => e === 'terminado')) return 'verde';
  if (estados.some((e) => e === 'pendiente' || e === 'pendiente_pago')) return 'rojo';
  return 'amarillo';
}

// Copia mínima de estadoPT() para no importar estadoPT.ts acá (evita
// dependencia circular con schema): reconoce los mismos valores.
function estadoDeRegistro(r: Pick<Registro, 'estado' | 'enProduccion'>): string {
  if (r.estado === 'terminado') return 'terminado';
  if (r.estado === 'pendiente_pago') return 'pendiente_pago';
  if (r.estado === 'pre_produccion') return 'pre_produccion';
  if (r.estado === 'pendiente') return 'pendiente';
  if (r.estado === 'en_produccion') return 'en_produccion';
  return r.enProduccion ? 'en_produccion' : 'pendiente';
}

export const CLASE_AC: Record<EstadoEntregaAC, string> = {
  rojo: 'bg-red-100 text-red-700 border-red-300',
  amarillo: 'bg-amber-100 text-amber-800 border-amber-300',
  verde: 'bg-green-100 text-green-800 border-green-300',
  azul: 'bg-sky-100 text-sky-800 border-sky-300',
  gris: 'bg-slate-200 text-slate-600 border-slate-400',
};

export const LABEL_AC: Record<EstadoEntregaAC, string> = {
  rojo: '🔴 Pendiente',
  amarillo: '🟡 En producción',
  verde: '🟢 Terminado — para entregar',
  azul: '🔵 Entregado',
  gris: '⚪ No se puede producir',
};

// Mensajes de seguimiento por estado (⚠️ PROVISORIOS — se ajustan con
// Tomi; el de producción sale de su ejemplo del 10-ago).
export function mensajeSeguimiento(estado: EstadoEntregaAC, paciente: string): string | null {
  const n = primerNombre(paciente);
  if (estado === 'amarillo') {
    return `${n}, ¡me alegra contarte que tu pedido ya está en producción! 🚀 Te aviso apenas esté listo. 🩵`;
  }
  if (estado === 'verde') {
    return `${n}, ¡tu pedido ya está listo! 🎉 Decime cuándo te queda cómodo coordinar la entrega. 🩵`;
  }
  if (estado === 'azul') {
    return `${n}, ¡gracias por confiar en PILL.AR! 🩵 Cualquier cosa que necesites sobre tu tratamiento, escribime por acá.`;
  }
  return null;
}

// Mensaje de WhatsApp listo para copiar y pegar.
// ⚠️ PLANTILLA PROVISORIA v2 (10-ago), rediseñada contra los dos problemas
// que contó Tomi: (1) los pacientes transfieren el precio total sin ver el
// descuento → la opción transferencia va PRIMERA, en negrita de WhatsApp y
// con el ahorro en pesos, y el precio "total" queda pegado a las cuotas;
// (2) preguntan "¿cuándo está listo?" → la fecha va en su propia línea, en
// negrita y con emoji. Cuando esté la web del CEO (envíos a domicilio /
// colegio de farmacéuticos, gratis >$200.000), el link entra acá.
export function mensajeWhatsApp(cot: Cotizacion, regsDeLaCotizacion: Registro[]): string {
  const nombre = primerNombre(cot.paciente) || cot.paciente || '';

  // FORMATO CORTO (11-ago): si hay link del checkout (la web de PILL.AR,
  // sim.pill.ar), el mensaje solo abre la puerta — precios, envíos y cuotas
  // los muestra el checkout. Es el formato que Tomi ya usa con esa web.
  if (cot.linkPago) {
    const deadlineCorto = regsDeLaCotizacion.map((r) => r.deadline).filter(Boolean).sort().pop();
    const lineasCortas = [
      `¡Hola ${nombre}! 👋 Te paso la cotización y el checkout de tu tratamiento personalizado con tecnología PILL.AR 💊`,
      '',
      '👇 Ingresá acá:',
      cot.linkPago,
      '',
      'En el link elegís cómo recibirlo (retiro sin cargo en una farmacia o envío a domicilio) y cómo pagarlo 💳',
    ];
    if (deadlineCorto) {
      lineasCortas.push('', `📦 *Estimamos tenerlo listo el ${fechaLargaES(deadlineCorto)}*`);
    }
    return lineasCortas.join('\n');
  }

  const totalCapsulas = cot.lineas.reduce((acc, l) => acc + (l.nCapsulas ?? 0), 0);
  const nActivos = new Set(cot.lineas.flatMap((l) => l.activos.map((a) => a.nombre.toLowerCase()))).size;
  const deadline = regsDeLaCotizacion
    .map((r) => r.deadline)
    .filter(Boolean)
    .sort()
    .pop();

  const total = cot.precioTotal;
  const transf = cot.precioTransferencia ?? precioTransferenciaSugerido(total);
  const ahorro = total != null && transf != null ? total - transf : null;
  const cuota = total != null ? redondearPeso(total / 3) : null;
  // % real según los dos precios cargados (si la transferencia se tocó a
  // mano, el mensaje no miente) — fallback al 15% estándar.
  const pct =
    total != null && transf != null && total > 0
      ? Math.round((1 - transf / total) * 100)
      : Math.round(DESCUENTO_TRANSFERENCIA * 100);
  const desc = [
    nActivos ? `${nActivos} activo${nActivos !== 1 ? 's' : ''}` : '',
    totalCapsulas ? `${totalCapsulas} cápsulas` : '',
  ].filter(Boolean).join(', ');

  const lineas: string[] = [];
  lineas.push(`${nombre}, ¡acá va tu cotización! 🩵`);
  lineas.push(`Tu tratamiento personalizado${desc ? ` (${desc})` : ''} tiene dos formas de pago 👇`);
  lineas.push('');
  lineas.push(`✅ *Transferencia: ${formatoPeso(transf)}* (te ahorrás ${formatoPeso(ahorro)} — ${pct}% OFF)`);
  lineas.push('→ alias *pill.ar* (PILL.AR S.A. · CUIT 30-71816734-1)');
  lineas.push('');
  lineas.push(`💳 3 cuotas sin interés de ${formatoPeso(cuota)} (total ${formatoPeso(total)})`);
  if (cot.linkPago) lineas.push(cot.linkPago);
  if ((cot.descuentoExtraPct ?? 0) > 0) {
    lineas.push('');
    lineas.push(`🎁 Incluye un ${cot.descuentoExtraPct}% de descuento adicional`);
  }
  lineas.push('');
  if (deadline) lineas.push(`📦 *Fecha estimada de entrega: ${fechaLargaES(deadline)}*`);
  lineas.push('Cuando lo abones, mandame el comprobante y arrancamos con la producción 🚀');
  lineas.push(`¡Gracias${nombre ? `, ${nombre}` : ''}! 🩵`);
  return lineas.join('\n');
}
