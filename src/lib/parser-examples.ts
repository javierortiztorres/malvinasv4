// Corpus de recetas para test del parser.
// Agregar un ejemplo nuevo por cada formato o caso que falle en producción.
// Los textos son anonimizados (datos ficticios).

import type { RecetaParseada } from './parser';

export type EjemploParser = {
  nombre: string;
  formato: string;
  texto: string;
  esperado: Partial<RecetaParseada>;
};

// --- Formato CFC (Colegio de Farmacéuticos de Córdoba) ---

export const EJEMPLO_CFC_1: EjemploParser = {
  nombre: 'CFC — múltiples fórmulas',
  formato: 'CFC',
  texto: `
OOSS: MAGISTRALES FECHA RECETA: 02-07-2026 NRO: 1213267
Plan Medico: DISPENSA PROPIA
APELLIDO Y NOMBRE DNI MAGISTRAL
DEFAGOT, JUAN SEGUNDO 44762968 RECETA
DETALLE DE FORMULA MAGISTRAL
Tratamiento personalizado con cápsulas multicapa de manufactura aditiva.
1:
- Vit. E: 200 mg
- Sulfato de Zinc: 50 mg
- Selenio: 100 µg
- Vit. B12: 250 µg
Indicaciones: En ayunas
Cápsulas multicapa de impresión 3D = cantidad suficiente para 90 días. HSA.
2:
- Nicotinamida: 250 mg
- Citrato de Magnesio: 200 mg
Indicaciones: En ayunas
Cápsulas multicapa de impresión 3D = cantidad suficiente para 90 días. HSA.
3:
- N- Acetilcisteina: 200 mg
- Glicinato de Magnesio: 200 mg
- Vit. D3: 1000 UI
- Vit. K2: 50 µg
- Aceite de pescado: 157.05 mg
Indicaciones: A la noche
Cápsulas multicapa de impresión 3D = cantidad suficiente para 90 días. HSA.
DIAGNOSTICO :
Anemia apl
FIRMA Y SELLOS MEDICO
MATRICULA PROVINCIAL 38602 | APELLIDO Y NOMBRE: Bianchi, Sofia Laura
ESPECIALIDAD: Médico Clínico
`,
  esperado: {
    paciente: 'DEFAGOT, JUAN SEGUNDO',
    dni: '44762968',
    medico: 'Bianchi, Sofia Laura',
    matricula: '38602',
    nroReceta: '1213267',
    formulas: [
      { titulo: '1', activos: [
        { activo: 'Vit. E', dosis: 200, unidad: 'mg' },
        { activo: 'Sulfato de Zinc', dosis: 50, unidad: 'mg' },
        { activo: 'Selenio', dosis: 100, unidad: 'µg' },
        { activo: 'Vit. B12', dosis: 250, unidad: 'µg' },
      ], indicacion: 'En ayunas', dias: 90, totalCapsulas: null },
      { titulo: '2', activos: [
        { activo: 'Nicotinamida', dosis: 250, unidad: 'mg' },
        { activo: 'Citrato de Magnesio', dosis: 200, unidad: 'mg' },
      ], indicacion: 'En ayunas', dias: 90, totalCapsulas: null },
      { titulo: '3', activos: [
        { activo: 'N- Acetilcisteina', dosis: 200, unidad: 'mg' },
        { activo: 'Glicinato de Magnesio', dosis: 200, unidad: 'mg' },
        { activo: 'Vit. D3', dosis: 1000, unidad: 'UI' },
        { activo: 'Vit. K2', dosis: 50, unidad: 'µg' },
        { activo: 'Aceite de pescado', dosis: 157.05, unidad: 'mg' },
      ], indicacion: 'A la noche', dias: 90, totalCapsulas: null },
    ],
  },
};

export const EJEMPLO_CFC_2: EjemploParser = {
  nombre: 'CFC — fórmula con nombre de título',
  formato: 'CFC',
  texto: `
OOSS: MAGISTRALES FECHA RECETA: 01-07-2026 NRO: 1212977
Plan Medico: DISPENSA PROPIA
APELLIDO Y NOMBRE DNI MAGISTRAL
PAGNAN, MONICA 13725924 RECETA
DETALLE DE FORMULA MAGISTRAL
Tratamiento personalizado con cápsulas multicapa de manufactura aditiva.
antioxidante:
- Vit. C: 250 mg
- Vit. B2 (Riboflavina): 50 mg
- Vit. B9 (ácido fólico): 1 mg
- Vit. B12: 250 µg
- Sulfato de Zinc: 8 mg
- Selenio: 250 µg
- Glicinato de Magnesio: 50 mg
- Manganeso Quelado: 0.5 mg
- Coenzima Q10: 50 mg
- Aceite de pescado: 640.36 mg
Indicaciones: mañana
Cápsulas multicapa de impresión 3D = cantidad suficiente para 60 días. HSA.
DIAGNOSTICO :
Malestar y fatiga
FIRMA Y SELLOS MEDICO
MATRICULA PROVINCIAL 41453 | APELLIDO Y NOMBRE: Zuin, Lucía
ESPECIALIDAD:
`,
  esperado: {
    paciente: 'PAGNAN, MONICA',
    dni: '13725924',
    medico: 'Zuin, Lucía',
    matricula: '41453',
    nroReceta: '1212977',
    formulas: [
      { titulo: 'antioxidante', activos: [
        { activo: 'Vit. C', dosis: 250, unidad: 'mg' },
        { activo: 'Vit. B2 (Riboflavina)', dosis: 50, unidad: 'mg' },
        { activo: 'Vit. B9 (ácido fólico)', dosis: 1, unidad: 'mg' },
        { activo: 'Vit. B12', dosis: 250, unidad: 'µg' },
        { activo: 'Sulfato de Zinc', dosis: 8, unidad: 'mg' },
        { activo: 'Selenio', dosis: 250, unidad: 'µg' },
        { activo: 'Glicinato de Magnesio', dosis: 50, unidad: 'mg' },
        { activo: 'Manganeso Quelado', dosis: 0.5, unidad: 'mg' },
        { activo: 'Coenzima Q10', dosis: 50, unidad: 'mg' },
        { activo: 'Aceite de pescado', dosis: 640.36, unidad: 'mg' },
      ], indicacion: 'mañana', dias: 60, totalCapsulas: null },
    ],
  },
};

// --- Formato MRx (recetario electrónico nacional) ---

export const EJEMPLO_MRX_1: EjemploParser = {
  nombre: 'MRx nacional — una fórmula con total de cápsulas',
  formato: 'MRx',
  texto: `
Fecha Orden: 28/07/2026 Orden Nro: 4521089
Obra Social: OSDE
Afiliado: TORRES, MARTIN ALEJANDRO
D.N.I.: 31456789
Médico: Ramírez, Carlos Alberto
Matrícula: MP 55234 (Córdoba)
Diagnóstico: Déficit de micronutrientes
Tratamiento:
RP/
Componente: Melatonina 3 mg
Componente: Magnesio Bisglicinato 200 mg
Componente: Vitamina D3 2000 UI
Duración: 90 días
Total de cápsulas: 90
Médico: Ramírez, Carlos Alberto
REFEPS: REF-2026-00234
Firmado electrónicamente.
`,
  esperado: {
    paciente: 'TORRES, MARTIN ALEJANDRO',
    dni: '31456789',
    medico: 'Ramírez, Carlos Alberto',
    formulas: [
      { titulo: 'Fórmula 1', indicacion: '', activos: [
        { activo: 'Melatonina', dosis: 3, unidad: 'mg' },
        { activo: 'Magnesio Bisglicinato', dosis: 200, unidad: 'mg' },
        { activo: 'Vitamina D3', dosis: 2000, unidad: 'UI' },
      ], dias: 90, totalCapsulas: 90 },
    ],
  },
};

// --- Formato PAMI ---

export const EJEMPLO_PAMI_1: EjemploParser = {
  nombre: 'PAMI — receta electrónica',
  formato: 'PAMI',
  texto: `
PAMI - Instituto Nacional de Servicios Sociales para Jubilados y Pensionados
Nro Orden: 2026-08-00123456
Fecha Órden: 30/07/2026
Beneficiario: GUTIERREZ, ROSA NILDA
NroAfiliado: 55-12345678-7
D.N.I. 12345678
Prestadora: Farmacia Nueva Badra
Médico: Fernández, Jorge Luis
Matrícula: MP 21345
Diagnóstico CIE: M81 - Osteoporosis
Tratamiento:
RP/
Componente: Calcio Citrato 500 mg
Componente: Vitamina D3 1000 UI
Componente: Vitamina K2 90 µg
Duración: 60 días
Total de cápsulas: 60
Firmado electrónicamente. Ley 27553
`,
  esperado: {
    paciente: 'GUTIERREZ, ROSA NILDA',
    dni: '12345678',
    medico: 'Fernández, Jorge Luis',
    formulas: [
      { titulo: 'Fórmula 1', indicacion: '', activos: [
        { activo: 'Calcio Citrato', dosis: 500, unidad: 'mg' },
        { activo: 'Vitamina D3', dosis: 1000, unidad: 'UI' },
        { activo: 'Vitamina K2', dosis: 90, unidad: 'µg' },
      ], dias: 60, totalCapsulas: 60 },
    ],
  },
};

// --- Formato recetario electrónico MdS (Ministerio de Salud Nación) ---
// Características: "Paciente:" para el nombre, "Matrícula Prov.:" para el médico,
// "Creada:" para la fecha, "Rp./" (con punto), fórmula como "- NOMBRE DOSIS UNIT".

export const EJEMPLO_MDS_1: EjemploParser = {
  nombre: 'MdS — recetario electrónico — activo simple sin colon',
  formato: 'MdS',
  texto: `
0156099999 24000000001 Lucas Martin Barbosa TRAUMATOLOGÍA Y ORTOPEDIA Matrícula Prov.:2723
Creada: 05/08/2026 Válida desde: 05/08/2026
Paciente: Garcia Maria Fernanda Sexo: Femenino DNI: 25000001 | CUIL: 27250000014
F. Nacimiento: 10/03/1975 Cobertura pública exclusiva / Particulares
Este documento ha sido firmado electrónicamente por Dr Dr Lucas Martin Barbosa Dr. Lucas M. BARBOSA TRAUMATOLOGIA Y ORTOPEDIA MP 2723 FIRMA Y SELLO 05/08/2026
Rp./ - Biciglinato de Magnesio 850mg X 60 cápsulas
Diagnóstico: Z76.9 - PERSONA EN CONTACTO CON LOS SERVICIOS DE SALUD EN CIRCUNSTANCIAS NO ESPECIFICADAS
`,
  esperado: {
    paciente: 'Garcia Maria Fernanda',
    dni: '25000001',
    medico: 'Lucas Martin Barbosa',
    matricula: '2723',
    fechaReceta: '05/08/2026',
    diagnostico: 'Z76.9 - PERSONA EN CONTACTO CON LOS SERVICIOS DE SALUD EN CIRCUNSTANCIAS NO ESPECIFICADAS',
    formulas: [
      { titulo: 'Fórmula 1', indicacion: '', activos: [
        { activo: 'Biciglinato de Magnesio', dosis: 850, unidad: 'mg' },
      ], dias: null, totalCapsulas: null },
    ],
  },
};

export const EJEMPLO_MDS_2: EjemploParser = {
  nombre: 'MdS — recetario electrónico — fórmula CFC dentro de Rp./ con Cápsula N:',
  formato: 'MdS',
  texto: `
0156099998 27000000001 Luisina Papa Cascé MÉDICA - DERMATOLOGIA Matrícula Prov.:40509
Creada: 06/05/2026 Válida desde: 06/05/2026
Paciente: Rodriguez Laura Sexo: Femenino DNI: 30000001 | CUIL: 27300000014
F. Nacimiento: 02/01/1975
Este documento ha sido firmado electrónicamente por Dr Luisina Papa Cascé Dra. Luisina Papa Cascé Médica dermatóloga MP 40509 ME 21002 FIRMA Y SELLO 06/05/2026
Rp./ - Tratamiento personalizado con cápsulas multicapa de manufactura aditiva.
Cápsula 1:
- Vitamina A: 1000 UI
- Vitamina B12: 500 µg
- Vitamina D: 4000 UI
- Vitamina K2: 100 mg
- Coenzima Q10: 100 mg
- Zinc: 30 mg
- Selenio: 100 µg
- Resveratrol 200 mg
Indicaciones: A la mañana
Duración: 30 días
Diagnóstico: N951 - ESTADOS MENOPAUSICOS Y CLIMATERICOS FEMENINOS
`,
  esperado: {
    paciente: 'Rodriguez Laura',
    dni: '30000001',
    medico: 'Luisina Papa Cascé',
    matricula: '40509',
    fechaReceta: '06/05/2026',
    diagnostico: 'N951 - ESTADOS MENOPAUSICOS Y CLIMATERICOS FEMENINOS',
    formulas: [
      { titulo: 'Cápsula 1', indicacion: 'A la mañana', activos: [
        { activo: 'Vitamina A', dosis: 1000, unidad: 'UI' },
        { activo: 'Vitamina B12', dosis: 500, unidad: 'µg' },
        { activo: 'Vitamina D', dosis: 4000, unidad: 'UI' },
        { activo: 'Vitamina K2', dosis: 100, unidad: 'mg' },
        { activo: 'Coenzima Q10', dosis: 100, unidad: 'mg' },
        { activo: 'Zinc', dosis: 30, unidad: 'mg' },
        { activo: 'Selenio', dosis: 100, unidad: 'µg' },
        { activo: 'Resveratrol', dosis: 200, unidad: 'mg' },
      ], dias: 30, totalCapsulas: null },
    ],
  },
};

// --- Formato Receta Magistral Electrónica ---
// Características: "Paciente NOMBRE DNI:", "N unidades NOMBRE (DOSISunidad)",
// "Diagnóstico •" (bullet), médico en línea "Médico: ... LIC ... MP. NNNN".

export const EJEMPLO_MAGISTRAL_1: EjemploParser = {
  nombre: 'Receta Magistral Electrónica — activos "N unidades NOMBRE (dosis)" con bullet en diagnóstico',
  formato: 'Magistral',
  texto: `
Receta Magistral Electrónica ORIGINAL Nro: 00000000001028 Fecha: 29-04-2026 VTO: 29-05-2026
Paciente Fernandez Gonzalez Mario DNI: 22000001 CUIL/T: 20220000013, Sexo: M, Nac: 10-05-1970
Fórmulas Magistrales Cantidad Principio Activo Forma Farmacéutica Instrucciones de Uso Observaciones
30 unidades RIBOFLAVINA (400mg) Cápsulas Tomar después del desayuno
30 unidades MAGNESIO (400mg) Cápsulas Tomar después del desayuno Combinar ambos componentes en la misma cápsula
Diagnóstico • cefalea en estudio (probable migraña)
Médico: Marco Esteban Lisicki Martinez LIC 36050301 CUIPS 541094159416 MP. 36288 Córdoba Capital
Este documento ha sido firmado electrónicamente y validado por Consejo de Médicos Prov.Cba.
Número de Receta 00000000001028
`,
  esperado: {
    paciente: 'Fernandez Gonzalez Mario',
    dni: '22000001',
    medico: 'Marco Esteban Lisicki Martinez',
    matricula: '36288',
    nroReceta: '00000000001028',
    fechaReceta: '29-04-2026',
    diagnostico: 'cefalea en estudio (probable migraña)',
    formulas: [
      { titulo: 'Fórmula 1', indicacion: '', activos: [
        { activo: 'RIBOFLAVINA', dosis: 400, unidad: 'mg' },
        { activo: 'MAGNESIO', dosis: 400, unidad: 'mg' },
      ], dias: null, totalCapsulas: 30 },
    ],
  },
};

// --- CFC con múltiples fórmulas etiquetadas ---

export const EJEMPLO_CFC_3: EjemploParser = {
  nombre: 'CFC — múltiples fórmulas con etiquetas personalizadas (alopecia/mañana)',
  formato: 'CFC',
  texto: `
OOSS: MAGISTRALES FECHA RECETA: 14-07-2026 NRO: 1200001
Plan Medico: DISPENSA PROPIA
APELLIDO Y NOMBRE DNI MAGISTRAL
PEREZ, LUCAS 34000001 RECETA
DETALLE DE FORMULA MAGISTRAL
Tratamiento personalizado con cápsulas multicapa de manufactura aditiva.
alopecia:
- Vit. B1 (tiamina): 34 mg
- Vit. K2: 355 µg
- Aceite de pescado: 500.89 mg
Indicaciones: A la noche
Cápsulas multicapa de impresión 3D = cantidad suficiente para 90 días. HSA.
mañana:
- Vit. B6 (piridoxina): 34 mg
- Aceite de pescado: 500.83 mg
Indicaciones: A la mañana
Cápsulas multicapa de impresión 3D = cantidad suficiente para 90 días. HSA.
DIAGNOSTICO :
Alopecia androgena
FIRMA Y SELLOS MEDICO
MATRICULA PROVINCIAL 11111 | APELLIDO Y NOMBRE: Lopez, Carlos
ESPECIALIDAD: medico
`,
  esperado: {
    paciente: 'PEREZ, LUCAS',
    dni: '34000001',
    medico: 'Lopez, Carlos',
    matricula: '11111',
    nroReceta: '1200001',
    diagnostico: 'Alopecia androgena',
    formulas: [
      { titulo: 'alopecia', activos: [
        { activo: 'Vit. B1 (tiamina)', dosis: 34, unidad: 'mg' },
        { activo: 'Vit. K2', dosis: 355, unidad: 'µg' },
        { activo: 'Aceite de pescado', dosis: 500.89, unidad: 'mg' },
      ], indicacion: 'A la noche', dias: 90, totalCapsulas: null },
      { titulo: 'mañana', activos: [
        { activo: 'Vit. B6 (piridoxina)', dosis: 34, unidad: 'mg' },
        { activo: 'Aceite de pescado', dosis: 500.83, unidad: 'mg' },
      ], indicacion: 'A la mañana', dias: 90, totalCapsulas: null },
    ],
  },
};

export const TODOS_LOS_EJEMPLOS: EjemploParser[] = [
  EJEMPLO_CFC_1,
  EJEMPLO_CFC_2,
  EJEMPLO_CFC_3,
  EJEMPLO_MRX_1,
  EJEMPLO_PAMI_1,
  EJEMPLO_MDS_1,
  EJEMPLO_MDS_2,
  EJEMPLO_MAGISTRAL_1,
];
