import type { Registro, RotuloOverrides } from '@/db/schema';
import { SUCURSALES, LEYENDAS_ROTULO } from './config';
import { dosisPorCapsula, fechaAR, formatoLote } from './utils';

export type { RotuloOverrides };

// Rótulo para la rotuladora: bloque de texto de 4 apartados, copiable.
export function generarRotulo(r: Registro, sucursalId: string): string {
  const suc = SUCURSALES.find((s) => s.id === sucursalId) ?? SUCURSALES[0];

  const ap1 = [
    `${r.capsulasPorEnvase ?? '—'} cápsulas`,
    `Paciente: ${r.paciente}`,
    `Médico: ${r.medico}${r.matricula ? ` - MP ${r.matricula}` : ''}`,
  ].join('\n');

  const activos = (r.formula ?? []).map(
    (a) => `${a.activo}: ${dosisPorCapsula(a, r.capsulasPorToma)}`
  );
  const exc =
    (r.excipientes ?? []).length > 0
      ? `Excipientes: ${(r.excipientes ?? []).join(', ')} c.s.p.`
      : 'Excipientes c.s.p.';
  const ap2 = ['Composición por cápsula:', ...activos, exc].join('\n');

  const ap3 = `Indicación: ${r.indicacion}`;

  const ap4 = [
    ...suc.lineas,
    `Lote: ${formatoLote(r.lotePrefijo, r.loteNumero)}`,
    `Fecha Elab: ${fechaAR(r.fechaElab)}`,
    `Fecha Vto: ${fechaAR(r.fechaVto)}`,
    ...LEYENDAS_ROTULO,
  ].join('\n');

  return [ap1, ap2, ap3, ap4].join('\n\n');
}

// ─── Rótulo visual (etiqueta 32×64mm) ────────────────────────────────────────

export type DatosRotulo = {
  titulo: string;        // "30 CÁPSULAS HPMC\nPERSONALIZADAS"
  medicoPaciente: string;
  composicion: string[]; // items sin header; header lo pone la UI
  indicacion: string;    // "Indicacion: ..."
  farmacia: string;      // primera línea de la sucursal
  regulatoria: string;   // pre-joined con \n
};

export function armarDatosRotulo(r: Registro, sucursalId = 'badra-alberdi', overrides?: RotuloOverrides | null): DatosRotulo {
  const suc = SUCURSALES.find((s) => s.id === sucursalId) ?? SUCURSALES[0];

  const tituloBase = `${r.capsulasPorEnvase ?? '—'} CÁPSULAS HPMC\nPERSONALIZADAS`;
  const medicoPaciente = `Dr./Dra.: ${r.medico}\nMP: ${r.matricula}\nPaciente: ${r.paciente}`;

  const composicionBase: string[] = (r.formula ?? []).map(
    (a) => `- ${a.activo}: ${dosisPorCapsula(a, r.capsulasPorToma)}`
  );
  if ((r.excipientes ?? []).length > 0) {
    composicionBase.push(`Excipientes: ${r.excipientes.join(', ')} c.s.p.`);
  } else {
    composicionBase.push('Excipientes c.s.p.');
  }

  const indicacionBase = `Indicacion: ${r.indicacion}`;
  const farmacia = suc.lineas[0];
  const regulatoria = [
    ...suc.lineas.slice(1),
    `Lote: ${formatoLote(r.lotePrefijo, r.loteNumero)}`,
    `Elab: ${fechaAR(r.fechaElab)}`,
    `Vto: ${fechaAR(r.fechaVto)}`,
    'Lugar fresco y seco',
    'USO INTERNO',
  ].join('\n');

  return {
    titulo: overrides?.titulo ?? tituloBase,
    medicoPaciente,
    composicion: overrides?.composicion ?? composicionBase,
    indicacion: overrides?.indicacion ?? indicacionBase,
    farmacia,
    regulatoria,
  };
}

// Genera DDL directamente desde DatosRotulo — usable en el cliente
// para reflejar ediciones en vivo sin pasar por el servidor.
export function ddlDesdeDatos(datos: DatosRotulo, tipo: 'chico' | 'grande'): string {
  return tipo === 'grande' ? buildDdlGrande(datos) : buildDdlChico(datos);
}

// ─── Generación .ddl (Dlabel) ─────────────────────────────────────────────────

function escapeXmlAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#xa;');
}

function textBlock(params: {
  fontsize: string; fontbold: string; fontfamily: string;
  t: string; h: string; texto: string; zvalue: number;
  l?: string; w?: string; alignment?: string;
}): string {
  const { fontsize, fontbold, fontfamily, t, h, texto, zvalue } = params;
  const l = params.l ?? '2';
  const w = params.w ?? '28';
  const alignment = params.alignment ?? '0';
  const len = texto.length;
  const esc = escapeXmlAttr(texto);
  return (
    `<drawobj hormirror="false" repeat="1" fontsize="${fontsize}" month="0" ellipse="false" w="${w}"` +
    ` stretch="100" zvalue="${zvalue}" centertopy="0.0" id="" rotate="0" arrange="0" year="0"` +
    ` second="0" fontbold="${fontbold}" itemmirror="0" currentdata="1" showcustomdate="false" hour="0"` +
    ` fontletterspacing="0" timeSystem="1" startposition="0" itemtype="5" centertopx="0.0"` +
    ` isVIP="false" h="${h}" fontstrikeout="false" lock="false" showcustomtime="false" timeformat="0"` +
    ` addorsub="0" t="${t}" textlength="${len}" fontfamily="${fontfamily}" memory="0" customtime=""` +
    ` interval="1" linespacing="0" arcpercent="0.5" dateformat="0" colorflag="0" day="0"` +
    ` fontitalic="false" customdate="" dateSystem="1" alignment="${alignment}" minute="0" l="${l}"` +
    ` blackground="false" datasource="0" fontunderline="false">\n` +
    `<textlist>\n` +
    `<text repeat="1" keyinput="0" month="0" dbname="" minvalueflag="0" year="0" second="0"` +
    ` dbtextsymbol="0" dbfieldname="" currentdata="1" hour="0" showcustomdate="false"` +
    ` showExcelHead="false" timeSystem="1" characterlength="${len}" field="" dbtablename=""` +
    ` datasourcechangeflag="0" sourcetext="${esc}" dbtextseparator="" dbtexttype="0" dbid=""` +
    ` sharefieldname="" showcustomtime="false" timeformat="0" addorsub="0" dateortimeresetvalue=""` +
    ` serialtype="0" lengthflag="0" customvalue="" customtime="" memory="0" resetvalue=""` +
    ` interval="1" maxvalue="" promptname="" datasourcevalue="" dateformat="0"` +
    ` minormaxvalueresetflag="0" fillcharacter="" day="0" fillflag="0" dbtextdecimals="" minvalue=""` +
    ` promptindex="0" dbtype="0" customdate="" dateSystem="1" maxvalueflag="0"` +
    ` dateortimeresettype="2" minute="0" value="${esc}" dbtextformat="0" dateortimeresetflag="0"` +
    ` datasource="0"/>\n` +
    `</textlist>\n` +
    `</drawobj>\n`
  );
}

function lineBlock(t: number, zvalue: number, l = 2, length = 28): string {
  return (
    `<drawobj colorflag="0" h="1" itemmirror="0" itemtype="1" l="${l}" linedegree="0.000000"` +
    ` linelength="${length}" linestartx="${l}" linestarty="${t}" linetype="0" linewidth="0.3" lock="false"` +
    ` rotate="0" t="${t}" w="${length}" zvalue="${zvalue}"/>\n`
  );
}

// Línea vertical para el rótulo grande (copias exactas de atributos del template)
function verticalLineBlock(x: number, yEnd: number, length: number, zvalue: number): string {
  const l = (x - 0.7).toFixed(6);
  return (
    `<drawobj colorflag="0" h="${length.toFixed(6)}" itemmirror="0" itemtype="1"` +
    ` l="${l}" linedegree="270.000000"` +
    ` linelength="${length.toFixed(6)}" linestartx="${x.toFixed(6)}"` +
    ` linestarty="${yEnd.toFixed(6)}" linetype="0" linewidth="0.2" lock="false"` +
    ` rotate="0" t="${yEnd.toFixed(6)}" w="1.400050" zvalue="${zvalue}"/>\n`
  );
}

// ─── Tipo de rótulo según cápsulas por envase ────────────────────────────────
// < 60 caps → chico vertical 32×64mm
// ≥ 60 caps → grande apaisado 100×60mm
export function tipoRotuloPorCaps(capsulasPorEnvase: number | null | undefined): 'chico' | 'grande' {
  if (capsulasPorEnvase != null && capsulasPorEnvase >= 60) return 'grande';
  return 'chico';
}

// ─── DDL vertical chico (32×64mm) ────────────────────────────────────────────
function buildDdlChico(datos: DatosRotulo): string {
  const compTexto = 'Composicion:\n' + datos.composicion.join('\n');
  const bloques = [
    { fontsize: '7',   fontbold: 'true',  fontfamily: 'Arial Black', t: '2',  h: '10', texto: datos.titulo },
    { fontsize: '5',   fontbold: 'true',  fontfamily: 'Arial Black', t: '12', h: '10', texto: datos.medicoPaciente },
    { fontsize: '5',   fontbold: 'false', fontfamily: 'Arial',       t: '22', h: '20', texto: compTexto },
    { fontsize: '5',   fontbold: 'false', fontfamily: 'Arial',       t: '42', h: '7',  texto: datos.indicacion },
    { fontsize: '5',   fontbold: 'true',  fontfamily: 'Arial Black', t: '49', h: '7',  texto: datos.farmacia },
    { fontsize: '4.2', fontbold: 'false', fontfamily: 'Arial',       t: '56', h: '8',  texto: datos.regulatoria },
  ];
  const partes: string[] = [];
  let zvalue = 1;
  for (const b of bloques) partes.push(textBlock({ ...b, zvalue: zvalue++ }));
  for (const t of [12, 22, 42, 49, 56]) partes.push(lineBlock(t, zvalue++));
  return ddlWrapper('32', '64', '600', partes.join(''));
}

function generarDdlChico(r: Registro, sucursalId?: string): string {
  return buildDdlChico(armarDatosRotulo(r, sucursalId));
}

// ─── DDL apaisado grande (100×60mm) ──────────────────────────────────────────
// Layout basado en el template Docs/PLANTILLA ROTULO GRANDE.ddl:
//   Título centrado arriba (abarca todo el ancho)
//   Columna izquierda (0-50mm): médico/paciente · farmacia + lote/fechas
//   Columna derecha  (50-100mm): composición · indicación
//   Línea vertical divisora a x=50mm (y=12.66 a y=49.93)
function buildDdlGrande(datos: DatosRotulo): string {
  const compTexto = 'Composicion:\n' + datos.composicion.join('\n');
  // Columna izquierda: farmacia (primera línea de suc) + regulatoria juntos
  const regulatoriaCompleta = datos.farmacia + '\n' + datos.regulatoria;

  const partes: string[] = [];
  let zvalue = 1;

  // Título centrado (alignment=1) en la parte superior
  partes.push(textBlock({
    fontsize: '10', fontbold: 'false', fontfamily: 'Arial Black',
    t: '1.835640', h: '9.525010', texto: datos.titulo,
    l: '31.779700', w: '36.440750', alignment: '1', zvalue: zvalue++,
  }));

  // Médico/Paciente — columna izquierda superior
  partes.push(textBlock({
    fontsize: '7', fontbold: 'false', fontfamily: 'Arial Black',
    t: '13.233530', h: '10.318760', texto: datos.medicoPaciente,
    l: '2.356070', w: '46.000000', zvalue: zvalue++,
  }));

  // Farmacia + lote/fechas/leyendas — columna izquierda inferior
  partes.push(textBlock({
    fontsize: '4.5', fontbold: 'false', fontfamily: 'Arial',
    t: '25.000000', h: '24.000000', texto: regulatoriaCompleta,
    l: '2.356070', w: '46.000000', zvalue: zvalue++,
  }));

  // Composición — columna derecha superior
  partes.push(textBlock({
    fontsize: '6', fontbold: 'false', fontfamily: 'Arial',
    t: '11.500000', h: '36.000000', texto: compTexto,
    l: '51.331830', w: '46.529500', zvalue: zvalue++,
  }));

  // Indicación — columna derecha inferior
  partes.push(textBlock({
    fontsize: '6.5', fontbold: 'true', fontfamily: 'Arial',
    t: '49.074430', h: '10.000000', texto: datos.indicacion,
    l: '51.331830', w: '46.529500', zvalue: zvalue++,
  }));

  // Línea vertical divisora a x=50mm (de y≈12.66 a y≈49.93)
  partes.push(verticalLineBlock(50.0, 49.928540, 37.265680, zvalue++));

  return ddlWrapper('100', '60', '8', partes.join(''));
}

function generarDdlGrande(r: Registro, sucursalId?: string): string {
  return buildDdlGrande(armarDatosRotulo(r, sucursalId));
}

function ddlWrapper(w: string, h: string, printerdpi: string, labelobjects: string): string {
  return (
    "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\n" +
    '<DLabel version="3.2.8" source="pc">\n' +
    `<paper w="${w}" h="${h}" rotate="0" printerdpi="${printerdpi}" printmethod="1" colcount="1"` +
    ' colspacing="1" zoomfactor="2.2351741790771484" printcount="1" papertype="0"' +
    ' paperdescription="" paddingtop="0" paddingleft="0" paddingright="0" paddingbottom="0"' +
    ' hspacing="0" vspacing="0" rowcount="1">\n' +
    '<labelobjects>\n' +
    labelobjects +
    '</labelobjects>\n' +
    '<sharedfields><fieldlist/></sharedfields>\n' +
    '<databaselist/>\n' +
    '</paper>\n' +
    '</DLabel>'
  );
}

export function generarDdl(r: Registro, sucursalId?: string, tipo?: 'chico' | 'grande'): string {
  const formato = tipo ?? tipoRotuloPorCaps(r.capsulasPorEnvase);
  return formato === 'grande'
    ? generarDdlGrande(r, sucursalId)
    : generarDdlChico(r, sucursalId);
}
