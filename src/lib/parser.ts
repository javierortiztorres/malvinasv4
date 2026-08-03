// ---------------------------------------------------------------
// Parser de recetas electrónicas argentinas — múltiples formatos:
// CFC Córdoba, MRx Nacional (RECA), Consejo de Médicos Córdoba.
// Recibe el TEXTO de la receta (extraído del PDF o pegado a mano)
// y devuelve los datos estructurados. Todo es editable después.
// ---------------------------------------------------------------

export type FormulaParseada = {
  titulo: string; // "1", "2", "antioxidante", "Cápsula 1", etc.
  activos: { activo: string; dosis: number; unidad: string }[];
  indicacion: string; // "En ayunas", "A la noche", "Con la cena"...
  dias: number | null; // "cantidad suficiente para N días" / "Duración: N días"
  totalCapsulas: number | null; // "Total de cápsulas: N" (formato nacional)
};

export type RecetaParseada = {
  paciente: string;
  dni: string;
  medico: string;
  matricula: string;
  fechaReceta: string;
  nroReceta: string;
  diagnostico: string;
  formulas: FormulaParseada[];
  advertencias: string[];
  // true cuando el fallback de IA completó o corrigió campos
  _fuenteIA?: boolean;
};

const UNIDADES = 'µg|μg|ug|mcg|u\\.i\\.|ui|mg|g|ml|cc|%';
// Activo con colon: "- Vit. C: 250 mg"
const RE_ACTIVO = new RegExp(`^[-•*]\\s*(.+?):\\s*([\\d.,]+)\\s*(${UNIDADES})(?:[/\\s][^\\s]*)?\\b`, 'i');
// Activo sin colon: "- Resveratrol 200 mg" (nombre sin dígitos ni colon)
const RE_ACTIVO_SIN_COLON = new RegExp(
  '^[-•*]\\s*([A-Za-záéíóúñÁÉÍÓÚÑ][^:\\d\\n]{2,40}?)\\s+([\\d.,]+)\\s*(' + UNIDADES + ')\\b',
  'i'
);
// Formato nacional: "Componente: Melatonina 12 mg"
const RE_COMPONENTE = new RegExp(`^Componentes?\\s*:\\s*(.+?)\\s+([\\d.,]+)\\s*(${UNIDADES.replace(/\\\./g, '.')})\\b`, 'i');
// Formato tabla CMC: "30 unidades RIBOFLAVINA (400mg) Cápsulas ..."
const RE_TABLA_ACTIVO = /^\d+\s+unidades?\s+([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)\s*\((\d+[.,]?\d*)([a-zA-Zµ%]+)\)/i;

const RE_DURACION = /^Duraci[oó]n\s*:\s*(\d+)\s*d[ií]as?/i;
const RE_TOTAL_CAPS = /^Total\s+de\s+c[aá]psulas\s*:\s*(\d+)/i;
const RE_INDICACIONES = /^Indicaciones?\s*:\s*(.+)$/i;
const RE_DIAS = /cantidad\s+suficiente\s+para\s+(\d+)\s*d[ií]as/i;
const RE_LABEL = /^([^\-•*].{0,50}?)\s*:\s*$/; // línea corta que termina en ":"
const RE_RP = /^RP\/\s*\d*/i; // marcador de inicio de fórmula en formato MRx

// Palabras clave ante las que siempre cortamos línea.
const KEYWORDS_CORTE = [
  'Plan Medico:',
  // --- formato nacional (MRx / recetario electrónico) ---
  'Fecha Órden', 'Fecha Orden', 'Órden Nro', 'Orden Nro', 'NroAfiliado', 'Nro Afiliado',
  'Obra Social:', 'OS:', 'Afiliado:', 'D.N.I.', 'DNI:', 'CUIL', 'Sexo:', 'Fecha Nacimiento',
  'RP/', 'Rp./', 'Rp/', 'Tratamiento:', 'Componente', 'Duracion:', 'Duración:',
  'Total de capsulas', 'Total de cápsulas', 'TOTAL GENERAL',
  'Medico:', 'Médico:', 'REFEPS', 'Matricula:', 'Matrícula:', 'Profesion', 'Profesión',
  'Fecha y hora de emision', 'Fecha y hora de emisión', 'Firmado electr', 'Dr/a', 'Emitida:',
  'Firma Electrónica', 'Cápsula ', 'Capsula ', 'Direccion:', 'Dirección:',
  'Diagnostico:', 'Diagnóstico:',
  'Paciente:',
  // --- formato CFC ---
  'APELLIDO Y NOMBRE DNI',
  'DETALLE DE FORMULA MAGISTRAL',
  'Indicaciones:',
  'Cápsulas multicapa',
  'Capsulas multicapa',
  'CÁPSULAS MULTICAPA',
  'DIAGNOSTICO',
  'DIAGNÓSTICO',
  'FIRMA Y SELLOS',
  'MATRICULA PROVINCIAL',
  'ESPECIALIDAD:',
  'ORIGEN APTO',
  'Firma Especialista',
  'FECHA VENCIMIENTO:',
  'Este documento ha sido firmado',
  'Ley 27553',
  // --- PAMI ---
  'Nro Orden:', 'Nro Trámite:', 'Nro Tramite:', 'Beneficiario:', 'Prestadora:',
  'Código Prestación:', 'Codigo Prestacion:',
  // --- IOMA y otros colegios provinciales ---
  'Credencial:', 'Diagnóstico CIE:', 'Diagnostico CIE:', 'Nro Credencial:',
  'Provincia:', 'Partido:',
  // --- Consejo de Médicos Córdoba (CMC) ---
  'Fórmulas Magistrales',
  'Formulas Magistrales',
  'Diagnóstico ',  // CMC usa "Diagnóstico • texto" sin colon
];

// Convierte el texto "plano" del PDF en líneas lógicas que el parser entiende.
export function segmentarTexto(texto: string): string {
  let t = texto.replace(/\r/g, '');
  // 1) Cortar antes de cada palabra clave
  for (const kw of KEYWORDS_CORTE) {
    t = t.split(kw).join('\n' + kw);
  }
  // 2) Cortar antes de cada ítem de fórmula " - Activo: ..."
  t = t.replace(/\s-\s(?=[^\s])/g, '\n- ');
  // 3) En líneas que no son ítems, cortar después de punto y aparte
  t = t
    .split('\n')
    .map((l) => (l.trim().startsWith('-') ? l : l.replace(/\.\s+/g, '.\n')))
    .join('\n');
  // 4) Split filas de tabla CMC: "30 unidades RIBOFLAVINA (400mg) ..."
  t = t.replace(/\s+(\d+\s+unidades?\s+[A-Za-záéíóúñÁÉÍÓÚÑ])/g, '\n$1');
  return t;
}

function normalizarUnidad(u: string): string {
  const x = u.toLowerCase().replace('μ', 'µ').replace(/^u\.i\.$/, 'ui');
  if (x === 'ug' || x === 'mcg' || x === 'µg') return 'µg';
  if (x === 'ui') return 'UI';
  if (x === 'cc') return 'ml';
  return x; // mg, g, ml, %
}

function limpiarNombre(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function parseReceta(textoCrudo: string): RecetaParseada {
  const advertencias: string[] = [];
  const texto = segmentarTexto(textoCrudo);
  const lineas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const res: RecetaParseada = {
    paciente: '',
    dni: '',
    medico: '',
    matricula: '',
    fechaReceta: '',
    nroReceta: '',
    diagnostico: '',
    formulas: [],
    advertencias,
  };

  // ---- Encabezado ----
  const mFecha =
    texto.match(/FECHA\s+RECETA:\s*([\d/-]+)/i) ||
    texto.match(/Fecha\s+[ÓO]rden\s*:\s*([\d/-]+)/i) ||
    texto.match(/Fecha y hora de emisi[oó]n\s*:\s*([\d/-]+)/i) ||
    texto.match(/\bCreada\s*:\s*([\d/.-]+)/) ||   // MRx: "Creada: 06/05/2026"
    texto.match(/\bFecha\s*:\s*([\d/.-]+)/);       // CMC: "Fecha: 29-04-2026"
  if (mFecha) res.fechaReceta = mFecha[1];

  const mNro =
    texto.match(/\bNRO:\s*(\d+)/i) ||
    texto.match(/[ÓO]rden\s+Nro\s*:?\s*(\d+)/i) ||
    texto.match(/\bNro\s*:\s*(\d+)/i);            // CMC: "Nro: 00000000001028"
  if (mNro) res.nroReceta = mNro[1];

  // ---- Paciente ----

  // Formato CFC: "FIGUEROA, VIVIANA 14486955 RECETA"
  for (const l of lineas) {
    const sinEncabezado = l.replace(/^APELLIDO\s+Y\s+NOMBRE\s+DNI\s+MAGISTRAL\s*/i, '');
    const m = sinEncabezado.match(/^(.+?)\s+(\d{6,9})\s+RECETA\b/i);
    if (m && !/APELLIDO\s+Y\s+NOMBRE/i.test(m[1])) {
      res.paciente = limpiarNombre(m[1]);
      res.dni = m[2];
      break;
    }
  }
  // Fallback: línea siguiente al encabezado de tabla CFC
  if (!res.paciente) {
    const idx = lineas.findIndex((l) => /APELLIDO\s+Y\s+NOMBRE\s+DNI/i.test(l));
    if (idx >= 0 && lineas[idx + 1]) {
      const m = lineas[idx + 1].match(/^(.+?)\s+(\d{6,9})\b/);
      if (m) {
        res.paciente = limpiarNombre(m[1]);
        res.dni = m[2];
      }
    }
  }
  // Fallback formato nacional: "Afiliado: APELLIDO, NOMBRE" o "Beneficiario: ..."
  if (!res.paciente) {
    const todos = Array.from(texto.matchAll(/^(?:Nro\s*)?(?:Afiliado|Beneficiario)\s*:\s*(.+)$/gim));
    const esNombre = (v: string) => /,/.test(v) || v.trim().split(/\s+/).filter((w) => /[a-záéíóúñ]{2,}/i.test(w)).length >= 2;
    const candidato = todos.map((m) => m[1]).find(esNombre);
    if (candidato) res.paciente = limpiarNombre(candidato.replace(/\s+,/g, ','));
  }
  // Fallback MRx: "Paciente: Mariela Fernanda Crema Sexo: Femenino"
  if (!res.paciente) {
    const mPac = texto.match(/^Paciente\s*:\s*(.+?)(?:\s+Sexo:|$)/im);
    if (mPac) res.paciente = limpiarNombre(mPac[1]);
  }
  // Fallback CMC: sección "Paciente" (sin colon) seguida del nombre en la línea siguiente
  if (!res.paciente) {
    const idxPac = lineas.findIndex((l) => /^Paciente\s*$/i.test(l));
    if (idxPac >= 0 && lineas[idxPac + 1]) {
      const nextLine = lineas[idxPac + 1];
      // DNI/CUIL pueden estar en la misma línea o ya separados por segmentación
      const m = nextLine.match(/^(.+?)(?:\s+DNI:|\s+CUIL:|$)/);
      if (m && m[1].trim().length > 2) res.paciente = limpiarNombre(m[1]);
    }
  }
  // Fallback CMC inline: "Paciente mengo sandra gabriela DNI: 18512112"
  if (!res.paciente) {
    const mPacInline = texto.match(/\bPaciente\s+([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]{2,50}?)(?=\s+(?:DNI:|CUIL:|D\.N\.I\.))/im);
    if (mPacInline) res.paciente = limpiarNombre(mPacInline[1]);
  }

  if (!res.dni) {
    // DNI puede venir con puntos: 28.456.789 → normalizar
    const mDni = texto.match(/D\.?\s?N\.?\s?I\.?\s*:?\s*([\d.]{7,11})/i);
    if (mDni) res.dni = mDni[1].replace(/\./g, '');
  }
  if (!res.paciente) advertencias.push('No pude detectar el nombre del paciente.');

  // ---- Médico y matrícula ----
  const mMed = texto.match(
    /MATRICULA\s+PROVINCIAL\s*:?\s*(\d+)\s*\|\s*APELLIDO\s+Y\s+NOMBRE\s*:\s*(.+)/i
  );
  if (mMed) {
    res.matricula = mMed[1];
    res.medico = limpiarNombre(mMed[2]);
  } else {
    // "Medico: NOMBRE" o "Dr/a.: NOMBRE"
    const mMed2 =
      texto.match(/^M[eé]dico\s*:\s*(.+?)(?:\s+LIC\s|\s+CUIPS\s|$)/im) ||
      texto.match(/^Dr\/?a?\.?\s*:\s*(.+)$/im);
    if (mMed2) res.medico = limpiarNombre(mMed2[1]);
    // "Dra. NOMBRE" (sin colon) — MRx Nacional
    if (!res.medico) {
      const mDr = texto.match(/^Dra?\.\s+(.+)$/im);
      if (mDr) res.medico = limpiarNombre(mDr[1]);
    }
    // "Matrícula: MP37648" — formato nacional genérico
    const mMat2 = texto.match(/^Matr[ií]cula\s*:\s*([A-Z]{0,4}\s?\d+)/im);
    if (mMat2) res.matricula = limpiarNombre(mMat2[1]);
    // "Matrícula Prov.:40509" — MRx Nacional
    if (!res.matricula) {
      const mMatProv = texto.match(/Matr[ií]cula\s+Prov\.\s*:\s*(\d+)/i);
      if (mMatProv) res.matricula = mMatProv[1];
    }
    // "MP 40509" o "MP. 362881" — presente en varios formatos
    if (!res.matricula) {
      const mMP = texto.match(/\bMP\.?\s+(\d+)\b/);
      if (mMP) res.matricula = mMP[1];
    }
    if (!res.medico && !res.matricula) advertencias.push('No pude detectar médico/matrícula.');
  }

  // ---- Diagnóstico ----
  const iDx = lineas.findIndex((l) => /^DIAGN[ÓO]STICO/i.test(l));
  if (iDx >= 0) {
    const partes: string[] = [];
    // ¿"DIAGNOSTICO : texto" en la misma línea?
    const inline = lineas[iDx].replace(/^DIAGN[ÓO]STICO\s*:?\s*/i, '').trim();
    if (inline) partes.push(inline);
    const CORTE_DX = /^(FIRMA\s+Y\s+SELLOS|Tratamiento\s*:|RP\/|C[aá]psula\s|Componente|Duraci[oó]n\s*:|Total\s+de|TOTAL\s+GENERAL|M[eé]dico\s*:|REFEPS|Matr[ií]cula|Profesi[oó]n|Firmado|Fecha y hora|Indicaciones\s*:)/i;
    for (let i = iDx + 1; i < lineas.length; i++) {
      if (CORTE_DX.test(lineas[i])) break;
      partes.push(lineas[i]);
    }
    res.diagnostico = limpiarNombre(partes.join(' '));
    // Quitar código CIE-10 del inicio: "N951 - ESTADOS..." → "ESTADOS..."
    res.diagnostico = res.diagnostico.replace(/^[A-Z]\d[\d.]*\s*[-–]\s*/i, '').trim();
    // Quitar bullet "•" si el diagnóstico viene de sección CMC
    res.diagnostico = res.diagnostico.replace(/^•\s*/, '').trim();
  }

  // ---- Fórmulas ----
  const iDet = lineas.findIndex((l) => /DETALLE\s+DE\s+FORMULA\s+MAGISTRAL/i.test(l));
  // CFC: las fórmulas terminan en DIAGNOSTICO. Otros formatos: escanear todo.
  const iFin = iDet >= 0 && iDx > iDet ? iDx : lineas.length;
  const cuerpo = lineas.slice(iDet >= 0 ? iDet + 1 : 0, iFin);

  let actual: FormulaParseada | null = null;
  const cerrar = () => {
    if (actual && actual.activos.length > 0) res.formulas.push(actual);
    actual = null;
  };

  for (const l of cuerpo) {
    // Sección "Fórmulas Magistrales" (CMC) — abre una fórmula contenedora
    if (/^F[oó]rmulas\s+Magistrales/i.test(l)) {
      cerrar();
      actual = { titulo: '', activos: [], indicacion: '', dias: null, totalCapsulas: null };
      continue;
    }

    // Activo con colon: "- Vit. C: 250 mg"
    const mAct = l.match(RE_ACTIVO) ?? l.match(RE_COMPONENTE);
    if (mAct) {
      if (!actual) actual = { titulo: '', activos: [], indicacion: '', dias: null, totalCapsulas: null };
      actual.activos.push({
        activo: limpiarNombre(mAct[1]),
        dosis: parseFloat(mAct[2].replace(',', '.')),
        unidad: normalizarUnidad(mAct[3]),
      });
      continue;
    }

    // Activo sin colon: "- Resveratrol 200 mg"
    const mActSC = l.match(RE_ACTIVO_SIN_COLON);
    if (mActSC) {
      if (!actual) actual = { titulo: '', activos: [], indicacion: '', dias: null, totalCapsulas: null };
      actual.activos.push({
        activo: limpiarNombre(mActSC[1]),
        dosis: parseFloat(mActSC[2].replace(',', '.')),
        unidad: normalizarUnidad(mActSC[3]),
      });
      continue;
    }

    // Activo en tabla CMC: "30 unidades RIBOFLAVINA (400mg) Cápsulas Tomar..."
    const mTabla = l.match(RE_TABLA_ACTIVO);
    if (mTabla) {
      if (!actual) actual = { titulo: '', activos: [], indicacion: '', dias: null, totalCapsulas: null };
      actual.activos.push({
        activo: limpiarNombre(mTabla[1]),
        dosis: parseFloat(mTabla[2].replace(',', '.')),
        unidad: normalizarUnidad(mTabla[3]),
      });
      // Extraer indicación de la parte "Cápsulas Tomar después del desayuno"
      if (/Tomar|Indicac/i.test(l) && !actual.indicacion) {
        const resto = l.replace(RE_TABLA_ACTIVO, '').trim().replace(/^C[aá]psulas?\s*/i, '');
        if (resto) actual.indicacion = limpiarNombre(resto);
      }
      continue;
    }

    const mInd = l.match(RE_INDICACIONES);
    if (mInd && actual) {
      actual.indicacion = limpiarNombre(mInd[1]);
      continue;
    }
    const mDias = l.match(RE_DIAS);
    if (mDias) {
      if (actual) actual.dias = parseInt(mDias[1], 10);
      cerrar(); // la línea "cantidad suficiente para N días" cierra la fórmula
      continue;
    }
    // "Duración: 30 días" (MRx Nacional) — no cierra: puede venir el total después
    const mDur = l.match(RE_DURACION);
    if (mDur && actual) {
      actual.dias = parseInt(mDur[1], 10);
      continue;
    }
    // "Total de cápsulas: 30" cierra la fórmula
    const mTot = l.match(RE_TOTAL_CAPS);
    if (mTot) {
      if (actual) actual.totalCapsulas = parseInt(mTot[1], 10);
      cerrar();
      continue;
    }
    if (/^TOTAL\s+GENERAL/i.test(l)) {
      cerrar();
      continue;
    }
    // "RP/" o "Rp./" en formato MRx → abre nueva fórmula sin título
    if (RE_RP.test(l)) {
      cerrar();
      actual = { titulo: '', activos: [], indicacion: '', dias: null, totalCapsulas: null };
      continue;
    }
    const mLabel = l.match(RE_LABEL);
    if (mLabel && !RE_INDICACIONES.test(l)) {
      cerrar();
      actual = { titulo: limpiarNombre(mLabel[1]), activos: [], indicacion: '', dias: null, totalCapsulas: null };
      continue;
    }
  }
  cerrar();

  // Numerar títulos vacíos
  res.formulas.forEach((f, i) => {
    if (!f.titulo) f.titulo = `Fórmula ${i + 1}`;
  });

  if (res.formulas.length === 0)
    advertencias.push('No detecté fórmulas con activos. Revisá el texto pegado.');

  return res;
}
