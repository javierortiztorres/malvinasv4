import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';

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

  fotos: jsonb('fotos').$type<string[]>().notNull().default([]), // registro fotográfico OPCIONAL

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

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
    .$type<DatosProceso>()
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

  fechaElab: text('fecha_elab').notNull().default(''),
  fechaVto: text('fecha_vto').notNull().default(''),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

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

export type Tinta = typeof tintas.$inferSelect;
export type Registro = typeof registros.$inferSelect;
export type RegistroPi = typeof registrosPi.$inferSelect;
