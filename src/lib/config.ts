// ---------------------------------------------------------------
// Configuración de la farmacia. Editar acá los textos fijos.
// ---------------------------------------------------------------

export const APP = {
  nombre: 'M.A.L.V.I.N.A.S 2.0',
  subtitulo: 'Manufactura Aditiva · Nueva Farmacia Badra · PILL.AR',
};

export const FARMACIA = {
  nombre: 'NUEVA FARMACIA BADRA',
  tituloDocumentoPT: 'REGISTRO DE LOTE DE PRODUCCIÓN DE PRODUCTO TERMINADO',
  tituloDocumentoPI: 'REGISTRO DE LOTE DE PRODUCCIÓN DE PRODUCTO INTERMEDIO',
};

export const SUCURSALES = [
  {
    id: 'badra-alberdi',
    nombre: 'Nueva Farmacia Badra — Félix Paz 585',
    lineas: [
      'Félix Paz 585 - B°A. Alberdi, Cba, Arg. // Tel:4871515 - Cel: 351-7613715',
      'DT: Farm. Gonzalo A. Azategui MP 8288',
      'DT: Farm. Badra, Ma. Silvia MP 2791',
    ],
  },
];

export const LEYENDAS_ROTULO = [
  'Conservar en lugar fresco y seco',
  'Uso exclusivo bajo supervisión médica',
  'USO INTERNO',
];

export const MESES_VENCIMIENTO = 3;

// Prefijo del lote de producto intermedio: POE/NFB/FF/{POE de la tinta}/P###
export const PREFIJO_LOTE_PI = 'POE/NFB/FF';
