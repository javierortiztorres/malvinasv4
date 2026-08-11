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
      { titulo: '1', indicacion: 'A la noche', activos: [
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
      { titulo: '1', indicacion: '', activos: [
        { activo: 'Calcio Citrato', dosis: 500, unidad: 'mg' },
        { activo: 'Vitamina D3', dosis: 1000, unidad: 'UI' },
        { activo: 'Vitamina K2', dosis: 90, unidad: 'µg' },
      ], dias: 60, totalCapsulas: 60 },
    ],
  },
};

// --- Recetas reales (anonimizadas) — base del corpus de producción ---

export const EJEMPLO_CFC_FIGUEROA: EjemploParser = {
  nombre: 'CFC — fórmula única con título "antioxidante"',
  formato: 'CFC',
  texto: `
OOSS: MAGISTRALES FECHA RECETA: 11-06-2026 NRO: 1208931
Plan Medico: DISPENSA PROPIA
APELLIDO Y NOMBRE DNI MAGISTRAL
FIGUEROA, VIVIANA 14486955 RECETA
DETALLE DE FORMULA MAGISTRAL
Tratamiento personalizado con cápsulas multicapa de manufactura aditiva.
antioxidante:
- Vit. C: 250 mg
- Vit. D3: 2000 UI
- Vit. K2: 60 µg
- Selenio: 250 µg
- Glicinato de Magnesio: 100 mg
- Coenzima Q10: 50 mg
- Aceite de pescado: 1.57 mg
Indicaciones: A la mañana
Cápsulas multicapa de impresión 3D = cantidad suficiente para 90 días. HSA.
DIAGNOSTICO :
Malestar y fatiga
FIRMA Y SELLOS MEDICO
MATRICULA PROVINCIAL 41453 | APELLIDO Y NOMBRE: Zuin, Lucía
ESPECIALIDAD:
ORIGEN APTO MEDICO: CONSULTORIO , CORDOBA
`,
  esperado: {
    paciente: 'FIGUEROA, VIVIANA',
    dni: '14486955',
    medico: 'Zuin, Lucía',
    matricula: '41453',
    fechaReceta: '11-06-2026',
    nroReceta: '1208931',
    diagnostico: 'Malestar y fatiga',
    formulas: [
      { titulo: 'antioxidante', activos: [
        { activo: 'Vit. C', dosis: 250, unidad: 'mg' },
        { activo: 'Vit. D3', dosis: 2000, unidad: 'UI' },
        { activo: 'Vit. K2', dosis: 60, unidad: 'µg' },
        { activo: 'Selenio', dosis: 250, unidad: 'µg' },
        { activo: 'Glicinato de Magnesio', dosis: 100, unidad: 'mg' },
        { activo: 'Coenzima Q10', dosis: 50, unidad: 'mg' },
        { activo: 'Aceite de pescado', dosis: 1.57, unidad: 'mg' },
      ], indicacion: 'A la mañana', dias: 90, totalCapsulas: null },
    ],
  },
};

export const EJEMPLO_CFC_MORICONI: EjemploParser = {
  nombre: 'CFC — 3 fórmulas con título libre ("alopecia", "mañana", "ert")',
  formato: 'CFC',
  texto: `
OOSS: MAGISTRALES FECHA RECETA: 14-07-2026 NRO: 1214674
Plan Medico: DISPENSA PROPIA
APELLIDO Y NOMBRE DNI MAGISTRAL
MORICONI, ENZO 34692913 RECETA
DETALLE DE FORMULA MAGISTRAL
Tratamiento personalizado con cápsulas multicapa de manufactura aditiva.
alopecia:
- Vit. B1 (tiamina): 34 mg
- Vit. A palmitato: 34 UI
- Vit. K2: 355 µg
- Aceite de pescado: 500.89 mg
Indicaciones: A la noche
Cápsulas multicapa de impresión 3D = cantidad suficiente para 90 días. HSA.
mañana:
- Vit. B6 (piridoxina): 34 mg
- Vit. B1 (tiamina): 34 mg
- Vit. A palmitato: 3222 UI
- Aceite de pescado: 500.83 mg
Indicaciones: A la noche
Cápsulas multicapa de impresión 3D = cantidad suficiente para 90 días. HSA.
ert:
- Vit. D3: 45 UI
- Vit. K2: 45 µg
- Aceite de pescado: 724.71 mg
Cápsulas multicapa de impresión 3D = cantidad suficiente para 90 días. HSA.
DIAGNOSTICO :
Alopecia androgena
FIRMA Y SELLOS MEDICO
MATRICULA PROVINCIAL 11111 | APELLIDO Y NOMBRE: juarez, ezequiel
ESPECIALIDAD: medico
`,
  esperado: {
    paciente: 'MORICONI, ENZO',
    dni: '34692913',
    medico: 'juarez, ezequiel',
    matricula: '11111',
    fechaReceta: '14-07-2026',
    nroReceta: '1214674',
    diagnostico: 'Alopecia androgena',
    formulas: [
      { titulo: 'alopecia', activos: [
        { activo: 'Vit. B1 (tiamina)', dosis: 34, unidad: 'mg' },
        { activo: 'Vit. A palmitato', dosis: 34, unidad: 'UI' },
        { activo: 'Vit. K2', dosis: 355, unidad: 'µg' },
        { activo: 'Aceite de pescado', dosis: 500.89, unidad: 'mg' },
      ], indicacion: 'A la noche', dias: 90, totalCapsulas: null },
      { titulo: 'mañana', activos: [
        { activo: 'Vit. B6 (piridoxina)', dosis: 34, unidad: 'mg' },
        { activo: 'Vit. B1 (tiamina)', dosis: 34, unidad: 'mg' },
        { activo: 'Vit. A palmitato', dosis: 3222, unidad: 'UI' },
        { activo: 'Aceite de pescado', dosis: 500.83, unidad: 'mg' },
      ], indicacion: 'A la noche', dias: 90, totalCapsulas: null },
      { titulo: 'ert', activos: [
        { activo: 'Vit. D3', dosis: 45, unidad: 'UI' },
        { activo: 'Vit. K2', dosis: 45, unidad: 'µg' },
        { activo: 'Aceite de pescado', dosis: 724.71, unidad: 'mg' },
      ], indicacion: '', dias: 90, totalCapsulas: null },
    ],
  },
};

export const EJEMPLO_MRX_LUISINA: EjemploParser = {
  nombre: 'MRx Nacional (RECA) — Cápsula 1, activo sin colon, mcg',
  formato: 'MRx',
  texto: `
0156019341653 19523628
Luisina Papa Cascé
MÉDICA - DERMATOLOGIA
Matrícula Prov.:40509
Creada: 06/05/2026
Válida desde: 06/05/2026
Paciente: Mariela Fernanda Crema Sexo: Femenino
DNI: 23631903 | CUIL: 27236319038 F. Nacimiento: 02/01/1974
AVALIAN (ACASALUD) | PLAN: AS 204 | N° Credencial: 19523628
Este documento ha sido firmado electrónicamente por Dr Luisina Papa Cascé
Dra. Luisina Papa Cascé
Médica dermatóloga
MP 40509 ME 21002
FIRMA Y SELLO
06/05/2026
Ver Link
MÉDICA - DERMATOLOGIA
Luisina Papa Cascé
luisinapapacasce@gmail.com
Esta receta fue creada por un emisor inscripto y validado en el Registro de Recetarios Electrónicos del Ministerio de Salud de la Nación
RL-2024-100292307
Rp./
- Tratamiento personalizado con cápsulas multicapa de manufactura aditiva.
Cápsula 1:
- Vitamina A: 1000 UI
- Vitamina B12: 500 µg
- Vitamina D: 4000 UI
- Vitamina K2: 100 mg
- Coenzima Q10: 100 mg
- Zinc: 30 mg
- Selenio: 100 mcg
- Resveratrol 200 mg
Indicaciones: A la mañana
Duración: 30 días
Diagnóstico: N951 - ESTADOS MENOPAUSICOS Y CLIMATERICOS FEMENINOS
`,
  esperado: {
    paciente: 'Mariela Fernanda Crema',
    dni: '23631903',
    medico: 'Luisina Papa Cascé',
    matricula: '40509',
    fechaReceta: '06/05/2026',
    diagnostico: 'ESTADOS MENOPAUSICOS Y CLIMATERICOS FEMENINOS',
    formulas: [
      { titulo: 'Cápsula 1', activos: [
        { activo: 'Vitamina A', dosis: 1000, unidad: 'UI' },
        { activo: 'Vitamina B12', dosis: 500, unidad: 'µg' },
        { activo: 'Vitamina D', dosis: 4000, unidad: 'UI' },
        { activo: 'Vitamina K2', dosis: 100, unidad: 'mg' },
        { activo: 'Coenzima Q10', dosis: 100, unidad: 'mg' },
        { activo: 'Zinc', dosis: 30, unidad: 'mg' },
        { activo: 'Selenio', dosis: 100, unidad: 'µg' },
        { activo: 'Resveratrol', dosis: 200, unidad: 'mg' },
      ], indicacion: 'A la mañana', dias: 30, totalCapsulas: null },
    ],
  },
};

export const EJEMPLO_CMC_MARCOS: EjemploParser = {
  nombre: 'CMC (Consejo Médicos Córdoba) — tabla, paciente minúscula, MP.',
  formato: 'CMC',
  // Texto real extraído por unpdf: UNA SOLA LÍNEA, sin newlines
  texto: `Receta Magistral Electrónica ORIGINAL Nro: 00000000001028 Fecha: 29-04-2026 VTO: 29-05-2026 Paciente mengo sandra gabriela DNI: 18512112 CUIL/T: 27185121122, Sexo: F, Nac: 31-12-1978 Fórmulas Magistrales Cantidad Principio Activo Forma Farmacéutica Instrucciones de Uso Observaciones 30 unidades RIBOFLAVINA (400mg) Cápsulas Tomar después del desayuno 30 unidades MAGNESIO (400mg) Cápsulas Tomar después del desayuno Combinar ambos componentes en la misma cápsula Diagnóstico • cefalea en estudio (probable migraña) Médico: Marco Esteban Lisicki Martinez LIC 36050301 CUIPS 541094159416 MP. 362881 Córdoba Capital Este documento ha sido firmado electrónicamente y validado por Consejo de Médicos Prov.Cba. Esta receta debe validarse on-line ingresando el número de receta Número de Receta 00000000001028 Número de Afiliado 24873801 `,
  esperado: {
    paciente: 'mengo sandra gabriela',
    dni: '18512112',
    medico: 'Marco Esteban Lisicki Martinez',
    matricula: '362881',
    fechaReceta: '29-04-2026',
    nroReceta: '00000000001028',
    diagnostico: 'cefalea en estudio (probable migraña)',
    formulas: [
      { titulo: 'Fórmula 1', activos: [
        { activo: 'RIBOFLAVINA', dosis: 400, unidad: 'mg' },
        { activo: 'MAGNESIO', dosis: 400, unidad: 'mg' },
      ], indicacion: 'Tomar después del desayuno', dias: null, totalCapsulas: null },
    ],
  },
};

export const TODOS_LOS_EJEMPLOS: EjemploParser[] = [
  EJEMPLO_CFC_1,
  EJEMPLO_CFC_2,
  EJEMPLO_MRX_1,
  EJEMPLO_PAMI_1,
  EJEMPLO_CFC_FIGUEROA,
  EJEMPLO_CFC_MORICONI,
  EJEMPLO_MRX_LUISINA,
  EJEMPLO_CMC_MARCOS,
];
