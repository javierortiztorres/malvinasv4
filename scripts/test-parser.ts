import { parseReceta } from '../src/lib/parser';
import { TODOS_LOS_EJEMPLOS, type EjemploParser } from '../src/lib/parser-examples';

type Resultado = { campo: string; esperado: string; obtenido: string; ok: boolean };

function checkEjemplo(ej: EjemploParser): Resultado[] {
  const r = parseReceta(ej.texto);
  const resultados: Resultado[] = [];

  const chk = (campo: string, esperado: unknown, obtenido: unknown) => {
    const e = String(esperado ?? '').trim();
    const o = String(obtenido ?? '').trim();
    resultados.push({ campo, esperado: e, obtenido: o, ok: e === o });
  };

  if (ej.esperado.paciente !== undefined) chk('paciente', ej.esperado.paciente, r.paciente);
  if (ej.esperado.dni !== undefined) chk('dni', ej.esperado.dni, r.dni);
  if (ej.esperado.medico !== undefined) chk('medico', ej.esperado.medico, r.medico);
  if (ej.esperado.matricula !== undefined) chk('matricula', ej.esperado.matricula, r.matricula);
  if (ej.esperado.nroReceta !== undefined) chk('nroReceta', ej.esperado.nroReceta, r.nroReceta);
  if (ej.esperado.diagnostico !== undefined) chk('diagnostico', ej.esperado.diagnostico, r.diagnostico);

  if (ej.esperado.formulas !== undefined) {
    const expF = ej.esperado.formulas;
    chk('formulas.length', expF.length, r.formulas.length);
    expF.forEach((ef, i) => {
      const rf = r.formulas[i];
      if (!rf) {
        resultados.push({ campo: `formula[${i}]`, esperado: 'existe', obtenido: 'FALTA', ok: false });
        return;
      }
      if (ef.titulo !== undefined) chk(`formula[${i}].titulo`, ef.titulo, rf.titulo);
      if (ef.indicacion !== undefined) chk(`formula[${i}].indicacion`, ef.indicacion, rf.indicacion);
      if (ef.dias !== undefined) chk(`formula[${i}].dias`, ef.dias, rf.dias);
      if (ef.totalCapsulas !== undefined) chk(`formula[${i}].totalCapsulas`, ef.totalCapsulas, rf.totalCapsulas);
      if (ef.activos !== undefined) {
        chk(`formula[${i}].activos.length`, ef.activos.length, rf.activos.length);
        ef.activos.forEach((ea, j) => {
          const ra = rf.activos[j];
          if (!ra) {
            resultados.push({ campo: `formula[${i}].activos[${j}]`, esperado: ea.activo, obtenido: 'FALTA', ok: false });
            return;
          }
          chk(`formula[${i}].activos[${j}].activo`, ea.activo, ra.activo);
          chk(`formula[${i}].activos[${j}].dosis`, ea.dosis, ra.dosis);
          chk(`formula[${i}].activos[${j}].unidad`, ea.unidad, ra.unidad);
        });
      }
    });
  }

  return resultados;
}

let totalOk = 0;
let totalFail = 0;

for (const ej of TODOS_LOS_EJEMPLOS) {
  const resultados = checkEjemplo(ej);
  const fails = resultados.filter((r) => !r.ok);
  const ok = resultados.filter((r) => r.ok).length;
  totalOk += ok;
  totalFail += fails.length;

  const estado = fails.length === 0 ? '✓ PASS' : `✗ FAIL (${fails.length} error/es)`;
  console.log(`\n[${ej.formato}] ${ej.nombre} — ${estado}`);
  if (fails.length > 0) {
    for (const f of fails) {
      console.log(`  ✗ ${f.campo}`);
      console.log(`      esperado : ${f.esperado}`);
      console.log(`      obtenido : ${f.obtenido}`);
    }
  }
}

console.log(`\n━━━ Resultado: ${totalOk} OK · ${totalFail} FAIL ━━━`);
if (totalFail > 0) process.exit(1);
