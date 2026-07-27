import { parseReceta } from '../src/lib/parser';

const recetaDefagot = `
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
`;

const recetaPagnan = `
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
`;

function check(nombre: string, texto: string) {
  const r = parseReceta(texto);
  console.log('====', nombre, '====');
  console.log(JSON.stringify(r, null, 2));
}

check('DEFAGOT', recetaDefagot);
check('PAGNAN', recetaPagnan);
