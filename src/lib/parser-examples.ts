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

export const TODOS_LOS_EJEMPLOS: EjemploParser[] = [
  EJEMPLO_CFC_1,
  EJEMPLO_CFC_2,
  EJEMPLO_MRX_1,
  EJEMPLO_PAMI_1,
];
