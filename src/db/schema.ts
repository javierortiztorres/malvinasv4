import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------- Tipos JSON embebidos ----------

export type ActivoFormula = {
  activo: string;
  dosis: number; // dosis según receta (por toma)
  unidad: string; // mg | µg | UI | g | ml
};

export type ExcipienteTinta = {
  nombre: string;
  fraccion: number; // 0-1, sobre el TOTAL de la tinta: concentración + Σ fracciones = 1
};

export type ParametrosImpresion = {
  temp: number;
  retraccion: number;
  pausa: number;
  velExt: number;
  velRet: number;
  descarte: number;
  pausaBal: number;
};

// Capa de la cápsula (producto terminado)
export type CapaTinta = {
  ref: number;
  activoReceta: string; // nombre del activo tal como vino en la receta
  dosisMg: number | null; // dosis POR TOMA en mg DE MATERIA PRIMA (editable)
  dosisOriginal?: number | null; // dosis tal como vino en la receta (para conversiones por tinta)
  unidadOriginal: string; // unidad de la receta (mg, µg, UI...)
  tintaId: number | null; // referencia al catálogo (null = manual)
  tinta: string; // nombre de la tinta usada
  concentracion: number | null; // concentración usada (editable, dilución en vivo)
  ip: number | null; // IP de la tinta (siempre se mantiene)
  ubicacion: string; // cuerpo | tapa (la tapa SOLO se usa si el cuerpo supera 0.9 mL)
  ubicacionManual?: boolean; // true = el operador fijó la ubicación a mano
  aptaTapa?: boolean; // la tinta puede ir a la tapa (PEG/CoQ10/Idebenona)
  lote: string; // lote del producto intermedio usado (manual)
  poe: string;
  alerta: string; // alerta química de la tinta
  aManopla: boolean;
  extrusionMl: number | null; // calculado — se guarda para el documento
};

export type DatosProceso = {
  temperatura: string;
  tiempoMezclado: string;
  tiempoReposo: string;
  otros: string;
};

// Proceso de un lote de PI: además de DatosProceso, el malaxado (qué se
// malaxa y cuánto tiempo) es específico de PI — no existe en PT.
export type DatosProcesoPi = DatosProceso & {
  malaxadoTipo?: 'tinta' | 'polvo' | 'ambos';
  malaxadoTiempoMin?: number;
};

export type Controles = {
  peso: boolean;
  visual: boolean;
  otroControl: string;
  vestimenta: boolean;
  higiene: boolean;
};

// Materia prima de un lote de producto intermedio
export type MateriaPrima = {
  ref: number;
  nombre: string;
  pureza: string;
  lote: string; // lote del proveedor, o lote FPI si es otro PI
  esPI: boolean; // true si la materia prima es a su vez un producto intermedio
  cantidadTeorica: number | null; // g, calculada
  pesadaReal: string; // completada por el operador
};

export type ControlesPI = {
  peso: boolean;
  organoleptico: boolean; // "Ausencia de material organoléptico"
  vestimenta: boolean;
  higiene: boolean;
};

// ---------- Tablas ----------

// Catálogo maestro de tintas — TODO editable desde Gestión (principio I+D)
export const tintas = pgTable('tintas', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(), // ej: "Vit C 50%"
  keywords: text('keywords').notNull().default(''), // para mapear activos de receta, separadas por coma
  concentracion: real('concentracion').notNull().default(0.5), // decimal (0.5 = 50%)
  ip: real('ip').notNull().default(1), // Índice Palmieri
  aManopla: boolean('a_manopla').notNull().default(false),
  // 'tapa' = APTA para tapa (PEG/CoQ10/Idebenona): va a la tapa SOLO cuando
  // el cuerpo supera 0.9 mL. 'cuerpo' = siempre al cuerpo (ej. oleogeles).
  ubicacion: text('ubicacion').notNull().default('cuerpo'),
  // Conversión de dosis: si la receta viene en convUnidad (ej. 'UI' o 'µg'),
  // dosisMg = dosis × convMgPorUnidad (mg de materia prima por unidad).
  // Ej: levadura de selenio 0,2% Se → convUnidad 'µg', factor 0,5.
  convUnidad: text('conv_unidad').notNull().default(''),
  convMgPorUnidad: real('conv_mg_por_unidad'),
  excipientes: jsonb('excipientes').$type<ExcipienteTinta[]>().notNull().default([]),
  parametros: jsonb('parametros').$type<ParametrosImpresion | null>().default(null),
  alerta: text('alerta').notNull().default(''),
  poe: text('poe').notNull().default(''), // ej: FPI.01.PI003
  activo: boolean('activo').notNull().default(true),
});

// Registros de PRODUCTO TERMINADO (por paciente)
export const registros = pgTable('registros', {
  id: serial('id').primaryKey(),
  estado: text('estado').notNull().default('en_proceso'),
  grupoPaciente: text('grupo_paciente').notNull().default(''),
  tituloFormula: text('titulo_formula').notNull().default(''),

  paciente: text('paciente').notNull().default(''),
  dni: text('dni').notNull().default(''),
  medico: text('medico').notNull().default(''),
  matricula: text('matricula').notNull().default(''),
  fechaReceta: text('fecha_receta').notNull().default(''),
  nroReceta: text('nro_receta').notNull().default(''),
  diagnostico: text('diagnostico').notNull().default(''),
  indicacion: text('indicacion').notNull().default(''),

  formula: jsonb('formula').$type<ActivoFormula[]>().notNull().default([]),
  capsulasPorToma: integer('capsulas_por_toma').notNull().default(1), // automático con override
  capsulasPorTomaManual: boolean('capsulas_por_toma_manual').notNull().default(false),
  excipientes: jsonb('excipientes').$type<string[]>().notNull().default([]),

  dias: integer('dias'),
  capsulasTotales: integer('capsulas_totales'),
  capsulasPorEnvase: integer('capsulas_por_envase'),
  envases: integer('envases'),
  tipoEnvase: text('tipo_envase').notNull().default('Envase plástico color caramelo'),
  producto: text('producto').notNull().default('CÁPSULAS MULTICAPA DE MANUFACTURA ADITIVA'),
  // Flujo del taller: los registros nacen en "Pendientes" y el equipo pasa
  // a "En producción" los que hay que hacer en el día (ida y vuelta).
  enProduccion: boolean('en_produccion').notNull().default(false),
  // Fecha límite de salida del producto (semáforo en tarjetas; NO se imprime)
  deadline: text('deadline').notNull().default(''),
  masaVolumen: text('masa_volumen').notNull().default('CÁPSULAS 00 (1 ML)'),

  lotePrefijo: text('lote_prefijo').notNull().default('PT001'),
  loteNumero: integer('lote_numero'),

  capas: jsonb('capas').$type<CapaTinta[]>().notNull().default([]),

  proceso: jsonb('proceso')
    .$type<DatosProceso>()
    .notNull()
    .default({ temperatura: '70', tiempoMezclado: '-', tiempoReposo: '5', otros: '-' }),
  controles: jsonb('controles')
    .$type<Controles>()
    .notNull()
    .default({ peso: true, visual: true, otroControl: '', vestimenta: true, higiene: true }),
  aprobadas: integer('aprobadas'),
  rechazadas: integer('rechazadas').notNull().default(0),

  fechaHoraInicio: text('fecha_hora_inicio').notNull().default(''),
  fechaHoraFin: text('fecha_hora_fin').notNull().default(''),
  operador: text('operador').notNull().default(''),
  supervisor: text('supervisor').notNull().default('DT: Farm. Gonzalo A. Azategui MP 8288'),

  fechaElab: text('fecha_elab').notNull().default(''),
  fechaVto: text('fecha_vto').notNull().default(''),

  // Quién devolvió el registro a un estado anterior a mano y cuándo (B-31):
  // se completa en cada retroceso manual y se limpia en el próximo avance,
  // para que quede a la vista sin quedar pegado para siempre.
  devueltoPor: text('devuelto_por'),
  devueltoEn: timestamp('devuelto_en', { withTimezone: true }),

  // Cotización a la que pertenece este registro (branch atencion-cliente).
  // Nullable: los registros creados sin pasar por Atención no tienen una.
  cotizacionId: integer('cotizacion_id'),

  // Receta de la que nació este registro (v2.2.0) — apunta a `recetas`.
  // La setea el Lector al guardar el PDF; null para lo anterior o para
  // recetas por foto/texto sin archivo.
  recetaId: integer('receta_id'),

  // Entrega al paciente (Agenda de Atención al cliente, color azul): la
  // marca Atención cuando el pedido salió/se retiró. Aparte del flujo de
  // producción — un registro terminado puede tardar días en entregarse.
  entregadoEn: timestamp('entregado_en', { withTimezone: true }),
  entregadoPor: text('entregado_por'),
  // "No se puede producir" (gris en la Agenda AC). Null = producible.
  // Cómo lo marcan Formulación/Impresión se define más adelante.
  noProducibleMotivo: text('no_producible_motivo'),

  fotos: jsonb('fotos').$type<string[]>().notNull().default([]), // registro fotográfico OPCIONAL

  // Archivado (v2.1.3, reemplaza al borrado físico): un registro archivado
  // no aparece en listas, estadísticas, necesidades ni agendas, pero
  // conserva TODOS sus datos y su número de lote (la numeración nunca se
  // reutiliza — los MAX de lote miran también los archivados a propósito).
  // Motivo: los borrados físicos dejaban huecos que rompían la coincidencia
  // de datos al migrar desde el Malvinas viejo. Se restaura desde la solapa
  // 🗃️ Archivados (desarchivar = solo Admin).
  archivado: boolean('archivado').notNull().default(false),
  archivadoEn: timestamp('archivado_en', { withTimezone: true }),
  archivadoPor: text('archivado_por'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  // Ya aplicado a mano en Neon (migración fuera de este repo). Declarativo:
  // documenta el índice para que el esquema de Drizzle refleje la realidad
  // de la base. Es quien garantiza la unicidad del lote ante carreras.
  uxLote: uniqueIndex('ux_registros_lote')
    .on(table.lotePrefijo, table.loteNumero)
    .where(sql`${table.loteNumero} IS NOT NULL`),
}));

// Registros de PRODUCTO INTERMEDIO (lotes de tinta)
export const registrosPi = pgTable('registros_pi', {
  id: serial('id').primaryKey(),
  estado: text('estado').notNull().default('en_proceso'),

  tintaId: integer('tinta_id'),
  tintaNombre: text('tinta_nombre').notNull().default(''),
  nombreProducto: text('nombre_producto').notNull().default(''), // ej: TINTA GLICINATO DE MAGNESIO EN OLEOGEL
  poe: text('poe').notNull().default(''), // FPI.01.PIxxx
  loteNumero: integer('lote_numero'), // P### propio por tinta

  cantidadProductoG: real('cantidad_producto_g'), // g totales a producir
  jeringas: integer('jeringas'),
  volumenJeringaMl: real('volumen_jeringa_ml').notNull().default(10),

  concentracion: real('concentracion'), // concentración del lote (editable, puede ser dilución)
  materiasPrimas: jsonb('materias_primas').$type<MateriaPrima[]>().notNull().default([]),

  proceso: jsonb('proceso')
    .$type<DatosProcesoPi>()
    .notNull()
    .default({ temperatura: '70', tiempoMezclado: '5', tiempoReposo: '', otros: '' }),
  controles: jsonb('controles')
    .$type<ControlesPI>()
    .notNull()
    .default({ peso: true, organoleptico: true, vestimenta: true, higiene: true }),
  aprobadas: integer('aprobadas'),
  rechazadas: integer('rechazadas').notNull().default(0),

  fechaHoraInicio: text('fecha_hora_inicio').notNull().default(''),
  fechaHoraFin: text('fecha_hora_fin').notNull().default(''),
  operador: text('operador').notNull().default(''),
  supervisor: text('supervisor'),

  fechaElab: text('fecha_elab').notNull().default(''),
  fechaVto: text('fecha_vto').notNull().default(''),

  // Archivado (v2.1.3): mismo mecanismo que en `registros` — ver el
  // comentario de ahí. El "Deshacer" de Necesidades también archiva (ya no
  // borra) el lote recién creado.
  archivado: boolean('archivado').notNull().default(false),
  archivadoEn: timestamp('archivado_en', { withTimezone: true }),
  archivadoPor: text('archivado_por'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  // Ya aplicado a mano en Neon (migración v4-B06, fuera de este repo).
  // Declarativo: documenta el índice que garantiza la unicidad del lote de
  // PI por tinta ante creaciones simultáneas.
  uxLote: uniqueIndex('ux_registros_pi_lote')
    .on(table.tintaId, table.loteNumero)
    .where(sql`${table.loteNumero} IS NOT NULL`),
}));

export const excipientesRotulo = pgTable('excipientes', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  activo: boolean('activo').notNull().default(true),
});

export const medicos = pgTable('medicos', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  matricula: text('matricula').notNull().default(''),
});

export const pacientes = pgTable('pacientes', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  dni: text('dni').notNull().default(''),
});

export const operadores = pgTable('operadores', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  rol: text('rol').notNull().default('produce'),
});

// Configuración editable del sistema (clave/valor)
export const configuracion = pgTable('configuracion', {
  clave: text('clave').primaryKey(),
  valor: text('valor').notNull(),
});

// Cuentas de login reales (B-30a) — un usuario y contraseña por persona,
// con uno de 3 roles fijos. Totalmente aparte de `operadores` (quién firma
// un documento PT/PI): esa tabla no participa del login.
export const usuarios = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  usuario: text('usuario').notNull(),
  passwordHash: text('password_hash').notNull(),
  rol: text('rol').notNull(), // admin | impresion | formulacion
  activo: boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uxUsuario: uniqueIndex('ux_usuarios_usuario').on(table.usuario),
}));

// Feedback pasivo del lector de recetas: captura correcciones del usuario
export const parserFeedback = pgTable('parser_feedback', {
  id: serial('id').primaryKey(),
  textoOriginal: text('texto_original').notNull().default(''),
  resultadoParser: jsonb('resultado_parser').notNull(),
  resultadoFinal: jsonb('resultado_final').notNull(),
  huboCorrecciones: boolean('hubo_correcciones').notNull().default(false),
  fuenteIA: boolean('fuente_ia').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- Cotizaciones (branch atencion-cliente) ----------

// Una línea de cotización = una fórmula/cápsula de la receta (hasta 3 en el
// cotizador de Tomi). La composición sale de los registros PT asociados; los
// costos los completa el motor de cotización (o a mano hasta que esté).
export type LineaCotizacion = {
  registroId: number | null; // registro PT asociado (null si se borró)
  titulo: string; // "A", "B"… (tituloFormula)
  nCapsulas: number | null;
  // División de la dosis (mismo modelo que el registro): la dosis de los
  // activos es POR TOMA y capsulasPorToma la reparte en N cápsulas iguales
  // (nCapsulas = días × capsulasPorToma). El motor cobra los activos por
  // dosis/capsulasPorToma × nCapsulas — así forzar 2 cápsulas no duplica
  // el costo de activos (caso BRUSCHI 11-ago). Opcional: líneas viejas sin
  // el campo se calculan con divisor 1 (compatibles).
  capsulasPorToma?: number | null;
  dias?: number | null; // días de tratamiento del registro (informativo)
  // drogaId: con qué droga del cotizador se matcheó este activo (null =
  // sin matchear; se elige a mano en la pantalla). costo = subtotal del
  // activo (precio unitario con markup topeado × dosis/toma ÷ división × cápsulas).
  activos: { nombre: string; dosis: number; unidad: string; costo: number | null; drogaId?: number | null }[];
  costoCapsulas: number | null;
  costoEnvase: number | null;
  costoTiempo: number | null;
  costoExtra: number | null;
  precioSugerido: number | null; // lo calcula el motor
  precioComercial: number | null; // el que se cobra (editable)
};

// Registro inmutable de cada precio que tuvo la cotización: el primero al
// cotizar y uno por cada cambio posterior (con quién y cuándo). Es la
// trazabilidad que pidió Tomi: "que se guarde un registro del precio al
// momento de cotizar, y si se cambia que aparezca un warning".
export type VersionCotizacion = {
  fecha: string; // ISO con hora
  usuario: string;
  precioTotal: number | null;
  precioTransferencia: number | null;
  motivo: string; // '' en la primera; después, el motivo del cambio
};

export const cotizaciones = pgTable('cotizaciones', {
  id: serial('id').primaryKey(),
  // pendiente | pagada — el estado de PRODUCCIÓN vive en registros.estado
  // (pendiente_pago → pendiente…): son dos dimensiones independientes,
  // porque una cotización puede irse a producción sin estar paga.
  estadoPago: text('estado_pago').notNull().default('pendiente'),
  paciente: text('paciente').notNull().default(''),
  dni: text('dni').notNull().default(''),
  grupoPaciente: text('grupo_paciente').notNull().default(''),

  lineas: jsonb('lineas').$type<LineaCotizacion[]>().notNull().default([]),
  // Snapshot de los parámetros/costos del cotizador usados al calcular
  // (markup, precios vigentes, etc.) — congela el contexto del precio.
  parametros: jsonb('parametros').$type<Record<string, unknown>>().notNull().default({}),

  precioTotal: real('precio_total'), // comercial vigente (suma de líneas o manual)
  precioTransferencia: real('precio_transferencia'), // con descuento por transferencia
  // Descuento adicional a criterio del que cotiza (11-ago), en % (0-100):
  // el motor lo aplica sobre la base antes del recargo de cuotas.
  descuentoExtraPct: real('descuento_extra_pct').notNull().default(0),
  linkPago: text('link_pago').notNull().default(''), // link de MP pegado a mano (por ahora)
  notas: text('notas').notNull().default(''),

  historial: jsonb('historial').$type<VersionCotizacion[]>().notNull().default([]),

  // Marca del botón "mandar a producción sin pago" (pacientes que pagan después)
  enviadaSinPago: boolean('enviada_sin_pago').notNull().default(false),
  cotizadoPor: text('cotizado_por').notNull().default(''),
  pagadaEn: timestamp('pagada_en', { withTimezone: true }),

  // Seguimiento (v2.2.0): datos de cobro y envío del pedido. Los completa
  // el checkout al pagar (pagada-externa), Atención en el detalle
  // (celular/dirección) o el Admin editando en la solapa 📒 Seguimiento.
  // El PUT general de cotizaciones NO los toca (whitelist): solo el PATCH
  // /seguimiento y pagada-externa escriben acá.
  celular: text('celular').notNull().default(''),
  direccionEnvio: text('direccion_envio').notNull().default(''),
  // Texto libre: "Transferencia (alias)", "Mercado Pago · 3 cuotas",
  // "Dinero en cuenta", "Efectivo"… Si hay comprobante subido, la solapa
  // muestra el archivo; si no, muestra esto.
  medioPago: text('medio_pago').notNull().default(''),
  montoCobrado: real('monto_cobrado'), // lo realmente cobrado (null = sin dato)
  // Monto del envío INCLUIDO en el cobro — el "ticket farmacia" (lo que se
  // le factura a la farmacia) es montoCobrado − envioMonto. Si es null se
  // deriva de parametros.envio + config del snapshot.
  envioMonto: real('envio_monto'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Comprobantes de pago (.jpg/.pdf) — guardados DENTRO de Neon (decisión de
// Tomi 10-ago: todo en un solo lugar). Tabla aparte para que las listas de
// cotizaciones nunca carguen los archivos: el base64 solo viaja cuando se
// abre/descarga un comprobante puntual.
export const comprobantes = pgTable('comprobantes', {
  id: serial('id').primaryKey(),
  cotizacionId: integer('cotizacion_id').notNull(),
  nombreArchivo: text('nombre_archivo').notNull().default(''),
  mime: text('mime').notNull().default(''),
  tamanoBytes: integer('tamano_bytes').notNull().default(0),
  datosBase64: text('datos_base64').notNull().default(''),
  subidoPor: text('subido_por').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Recetas (v2.2.0) — el ARCHIVO de la receta (PDF del Lector, o PDF/foto
// subida a mano desde 📒 Seguimiento), guardado dentro de Neon igual que
// los comprobantes (decisión de Tomi 14-ago: antes no se guardaba nada;
// ahora la receta queda como respaldo legal del pedido). Tabla aparte para
// que las listas nunca carguen el base64 — el archivo solo viaja por
// GET /api/recetas/[id]. Se vincula por los dos lados: registros.receta_id
// (todas las fórmulas nacidas de esa receta) y recetas.cotizacion_id
// (cuando el pedido ya tiene cotización).
export const recetas = pgTable('recetas', {
  id: serial('id').primaryKey(),
  cotizacionId: integer('cotizacion_id'),
  nombreArchivo: text('nombre_archivo').notNull().default(''),
  mime: text('mime').notNull().default(''),
  tamanoBytes: integer('tamano_bytes').notNull().default(0),
  datosBase64: text('datos_base64').notNull().default(''),
  subidoPor: text('subido_por').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Motor del cotizador (branch atencion-cliente, migración 2): lista de
// costos de drogas + parámetros generales, portados del Excel de Tomi.
export const cotizadorDrogas = pgTable('cotizador_drogas', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  keywords: text('keywords').notNull().default(''), // sinónimos para matchear la receta
  unidad: text('unidad').notNull().default('mg'), // mg | ug | UI (unidad del precio)
  costoUnitario: real('costo_unitario'), // costo real por unidad (col E del Excel)
  precioComercialUnitario: real('precio_comercial_unitario'), // tope comercial (col D)
  activo: boolean('activo').notNull().default(true),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uxNombre: uniqueIndex('ux_cotizador_drogas_nombre').on(sql`lower(${table.nombre})`),
}));

export const cotizadorConfig = pgTable('cotizador_config', {
  id: integer('id').primaryKey(), // única fila: id = 1
  datos: jsonb('datos').$type<Record<string, number>>().notNull().default({}),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Tinta = typeof tintas.$inferSelect;
export type Registro = typeof registros.$inferSelect;
export type RegistroPi = typeof registrosPi.$inferSelect;
export type Usuario = typeof usuarios.$inferSelect;
export type Cotizacion = typeof cotizaciones.$inferSelect;
export type Comprobante = typeof comprobantes.$inferSelect;
export type Receta = typeof recetas.$inferSelect;
export type CotizadorDroga = typeof cotizadorDrogas.$inferSelect;
