// Test del motor v2.0.3: ubicación automática cuerpo/tapa y conversión
// de dosis por tinta. Correr con: npx tsx scripts/test-engine.ts
import type { Tinta } from '../src/db/schema';
import {
  autoUbicarCapas, capaDesdeTinta, dosisEnMgParaTinta, tintasParaActivo,
  calcularCapsula, pesadasPI, poeDesdeLote, limpiarNombreTinta,
  activoConMerma, MERMA_PI,
} from '../src/lib/engine';
import { fechaAR, fechaHoraAR, coincideFiltro, diasHasta } from '../src/lib/utils';

let fallas = 0;
function check(nombre: string, cond: boolean, detalle = '') {
  console.log(`${cond ? '✔' : '✘'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (!cond) fallas++;
}
const BASE: Tinta = {
  id: 1, nombre: 'X', keywords: '', concentracion: 0.5, ip: 1, aManopla: false,
  ubicacion: 'cuerpo', convUnidad: '', convMgPorUnidad: null,
  excipientes: [], parametros: null, alerta: '', poe: '', activo: true,
} as Tinta;
const T = (p: Partial<Tinta>): Tinta => ({ ...BASE, ...p });

// ---------- Conversión ----------
const levSelenio = T({ id: 10, nombre: 'Lev. Selenio 50%', keywords: 'selenio, levadura de selenio',
  concentracion: 0.5, ip: 1.028, convUnidad: 'µg', convMgPorUnidad: 0.5, ubicacion: 'cuerpo' });

const c1 = dosisEnMgParaTinta(100, 'µg', levSelenio);
check('Selenio: 100 µg → 50 mg de levadura', c1.convertida && Math.abs((c1.mg ?? 0) - 50) < 1e-9, `mg=${c1.mg}`);

const c2 = dosisEnMgParaTinta(100, 'mcg', levSelenio); // unidad escrita distinto
check('Selenio: "mcg" normaliza igual que µg', c2.convertida && c2.mg === 50);

const sinConv = T({ id: 11, nombre: 'Vit D (impura) 13%', concentracion: 0.13, ip: 0.9 });
const c3 = dosisEnMgParaTinta(2000, 'UI', sinConv);
check('UI sin factor → null (aviso ámbar)', !c3.convertida && c3.mg === null);

const c4 = dosisEnMgParaTinta(0.25, 'g', sinConv);
check('Masa normal sigue igual: 0.25 g → 250 mg', c4.mg === 250 && !c4.convertida);

// tintasParaActivo con conversión: extrusión = (50/0.5)/1000/1.028
const ops = tintasParaActivo('Selenio', 100, 'µg', [levSelenio]);
const extEsp = 50 / 0.5 / 1000 / 1.028;
check('Sugerencia usa dosis convertida', ops.length === 1 && Math.abs((ops[0].extrusion ?? 0) - extEsp) < 1e-9,
  `ext=${ops[0]?.extrusion?.toFixed(4)} esp=${extEsp.toFixed(4)}`);
check('Sugerencia imprimible (≥0.03)', ops[0].imprimible);

// ---------- capaDesdeTinta: siempre arranca en cuerpo ----------
const melatonina = T({ id: 20, nombre: 'Melatonina (salvavidas) 20%', concentracion: 0.2, ip: 0.909, ubicacion: 'tapa' });
const capaMel = capaDesdeTinta(1, 'Melatonina', 12, 'mg', melatonina);
check('Capa nueva de tinta PEG arranca en CUERPO', capaMel.ubicacion === 'cuerpo' && capaMel.aptaTapa === true);
check('Capa guarda dosis original', capaMel.dosisOriginal === 12 && capaMel.dosisMg === 12);

// ---------- autoUbicarCapas ----------
const ogap = T({ id: 30, nombre: 'OGAP 97%', concentracion: 0.97, ip: 0.9, ubicacion: 'cuerpo' });
const catalogo = [levSelenio, sinConv, melatonina, ogap];

// Caso melatonina sola 12 mg al 20%: 0.066 mL — cuerpo no se pasa → todo al cuerpo
const soloMel = autoUbicarCapas([capaMel], 1, catalogo);
check('Cuerpo ≤ 0.9: NADA va a la tapa', soloMel[0].ubicacion === 'cuerpo');

// Caso cuerpo excedido: OGAP grande (0.88 mL) + melatonina PEG chica (0.066 mL) = 0.946
const capaOgap = capaDesdeTinta(1, 'OGAP', 768, 'mg', ogap); // 768/0.97/1000/0.9 = 0.8797 mL
const capaMel2 = capaDesdeTinta(2, 'Melatonina', 12, 'mg', melatonina); // 0.066 mL
const ubicadas = autoUbicarCapas([capaOgap, capaMel2], 1, catalogo);
check('Cuerpo > 0.9: la capa PEG pasa a la tapa', ubicadas[0].ubicacion === 'cuerpo' && ubicadas[1].ubicacion === 'tapa');
const res = calcularCapsula(ubicadas, { manual: false, capsulasPorToma: 1 });
check('Con la capa en la tapa el cuerpo ya no excede', !res.excedeCuerpo && !res.excedeTapa,
  `cuerpo=${res.volumenCuerpo.toFixed(3)} tapa=${res.volumenTapa.toFixed(3)}`);

// La capa PEG NO entra en la tapa (>0.1 mL) → queda en el cuerpo con aviso
const capaMelGrande = capaDesdeTinta(2, 'Melatonina', 30, 'mg', melatonina); // 0.165 mL
const ub2 = autoUbicarCapas([capaOgap, capaMelGrande], 1, catalogo);
check('Capa PEG que no entra en la tapa (>0.1) queda en cuerpo', ub2[1].ubicacion === 'cuerpo');

// Ubicación fijada a mano se respeta
const fijada = { ...capaMel2, ubicacion: 'tapa', ubicacionManual: true };
const ub3 = autoUbicarCapas([fijada], 1, catalogo);
check('Ubicación manual se respeta aunque el cuerpo no exceda', ub3[0].ubicacion === 'tapa');

// Capa vieja sin aptaTapa: se deriva del catálogo por tintaId
const vieja: any = { ...capaMel2 };
delete vieja.aptaTapa;
delete vieja.ubicacionManual;
vieja.ubicacion = 'tapa'; // como quedó guardada por el bug
const ub4 = autoUbicarCapas([vieja], 1, catalogo);
check('Capa vieja (guardada en tapa por el bug) vuelve al cuerpo', ub4[0].ubicacion === 'cuerpo' && ub4[0].aptaTapa === true);

// Regresión: caso OGAP+VitC de MALVINAS (0.949 mL, 99.9%)
const vitc = T({ id: 40, nombre: 'Vit C 50%', concentracion: 0.5, ip: 1.06, ubicacion: 'cuerpo' });
const cOgap = capaDesdeTinta(1, 'OGAP', 610, 'mg', ogap);
const cVitc = capaDesdeTinta(2, 'Vit C', 130, 'mg', vitc);
const r2 = calcularCapsula(autoUbicarCapas([cOgap, cVitc], 1, [ogap, vitc]), { manual: false, capsulasPorToma: 1 });
check('Regresión motor: OGAP 610 + VitC 130 ≈ 0.944 mL, 1 cápsula', Math.abs(r2.volumenTotal - 0.9438) < 0.001 && r2.capsulasPorToma === 1,
  `vol=${r2.volumenTotal.toFixed(4)}`);


// ---------- v2.0.4: pesadasPI con fracciones sobre el total ----------

// Pregnenolona 5,7% + PEG 4000 94,3% → en 100 g: 5,7 g activo + 94,3 g PEG
const pes = pesadasPI('Pregnenolona', 0.057, 100, [{ nombre: 'PEG 4000', fraccion: 0.943 }], []);
check('pesadasPI: activo 5,7 g en 100 g', Math.abs(pes[0].gramos - 5.7) < 1e-9, `act=${pes[0].gramos}`);
check('pesadasPI: PEG 94,3 g en 100 g (fracción sobre el TOTAL)', Math.abs(pes[1].gramos - 94.3) < 1e-9, `peg=${pes[1].gramos}`);
check('pesadasPI: activo + excipientes = total', Math.abs(pes.reduce((s, p) => s + p.gramos, 0) - 100) < 1e-9);

// OGAP 97% + Aerosil 3%
const pes2 = pesadasPI('Aceite de pescado', 0.97, 200, [{ nombre: 'Aerosil', fraccion: 0.03 }], []);
check('pesadasPI: OGAP 200 g → Aerosil 6 g', Math.abs(pes2[1].gramos - 6) < 1e-9, `aerosil=${pes2[1].gramos}`);

// ---------- v2.0.7: pesadasPI con DILUCIÓN (bug del ejemplo real) ----------
// Lote de 100 g al 1,37% con tinta madre Melatonina 20% + PEG 80%:
// antes daba Melatonina 1,37 g + PEG 80 g = 81,37 g (¡mal!);
// ahora los excipientes llenan el resto: PEG 98,63 g y todo suma 100 g.
const pesDil = pesadasPI('Melatonina', 0.0137, 100, [{ nombre: 'PEG 4000', fraccion: 0.8 }], []);
check('pesadasPI dilución: Melatonina 1,37 g', Math.abs(pesDil[0].gramos - 1.37) < 1e-9, `act=${pesDil[0].gramos}`);
check('pesadasPI dilución: PEG 98,63 g (no 80)', Math.abs(pesDil[1].gramos - 98.63) < 1e-9, `peg=${pesDil[1].gramos}`);
check('pesadasPI dilución: suma = 100 g', Math.abs(pesDil.reduce((s, p) => s + p.gramos, 0) - 100) < 1e-9);

// Con dos excipientes se mantienen las proporciones relativas del catálogo:
// tinta madre 20% con PEG 60% + Cera 20% (3:1) → lote 100 g al 5%:
// resto 95 g repartidos 3:1 = 71,25 + 23,75.
const pesDil2 = pesadasPI('X', 0.05, 100,
  [{ nombre: 'PEG 4000', fraccion: 0.6 }, { nombre: 'Cera carnauba', fraccion: 0.2 }], []);
check('pesadasPI dilución 2 excipientes: PEG 71,25 g', Math.abs(pesDil2[1].gramos - 71.25) < 1e-9, `peg=${pesDil2[1].gramos}`);
check('pesadasPI dilución 2 excipientes: Cera 23,75 g', Math.abs(pesDil2[2].gramos - 23.75) < 1e-9, `cera=${pesDil2[2].gramos}`);
check('pesadasPI dilución 2 excipientes: suma = 100 g',
  Math.abs(pesDil2.reduce((s, p) => s + p.gramos, 0) - 100) < 1e-9);

// Sin dilución (concentración = catálogo) todo sigue exactamente igual:
const pesIgual = pesadasPI('Melatonina', 0.2, 100, [{ nombre: 'PEG 4000', fraccion: 0.8 }], []);
check('pesadasPI sin dilución: idéntico a antes (20 g + 80 g)',
  Math.abs(pesIgual[0].gramos - 20) < 1e-9 && Math.abs(pesIgual[1].gramos - 80) < 1e-9);

// ---------- v2.0.7: matemática del dashboard de Necesidades ----------
// masa de tinta (g) = extrusión (mL) × cápsulas × IP.
// 90 cápsulas a 0.139 mL/cáps con IP 0.9 → 12.51 mL... por registro:
{
  const ext = 0.139, caps = 90, ip = 0.9;
  const ml = ext * caps;
  const g = ml * ip;
  check('necesidades: mL totales = ext × cáps', Math.abs(ml - 12.51) < 1e-9, `ml=${ml}`);
  check('necesidades: gramos = mL × IP', Math.abs(g - 11.259) < 1e-9, `g=${g}`);
  // y la vuelta para las jeringas del PI: mL = g ÷ IP; jeringas de 10 mL
  check('necesidades: jeringas = ceil(g ÷ IP ÷ 10)', Math.ceil(g / ip / 10) === 2);
}

// ---------- v2.0.4: POE derivado del lote de PI ----------
check('poeDesdeLote: FPI.01.PI013/P006 → FPI.01.PI013', poeDesdeLote('FPI.01.PI013/P006') === 'FPI.01.PI013');
check('poeDesdeLote: sin barra → vacío', poeDesdeLote('FPI01PI013') === '');
check('poeDesdeLote: vacío/null → vacío', poeDesdeLote('') === '' && poeDesdeLote(null) === '');
check('poeDesdeLote: recorta espacios', poeDesdeLote('FPI.01.PI047 /P001') === 'FPI.01.PI047');


// ---------- v2.0.5: nombre documental, fechas cortas, filtro ----------
check('limpiar: "Melatonina para 1 mg 3%" → Melatonina', limpiarNombreTinta('Melatonina para 1 mg 3%') === 'Melatonina');
check('limpiar: "Melatonina (salvavidas) 20%" → Melatonina', limpiarNombreTinta('Melatonina (salvavidas) 20%') === 'Melatonina');
check('limpiar: "B12 (concentrada) 5.45%" → B12', limpiarNombreTinta('B12 (concentrada) 5.45%') === 'B12');
check('limpiar: "Vitamina D (impura) 13%" → Vitamina D', limpiarNombreTinta('Vitamina D (impura) 13%') === 'Vitamina D');
check('limpiar: OGAP conserva su sigla', limpiarNombreTinta('Aceite de pescado y aerosil (OGAP)') === 'Aceite de pescado y aerosil (OGAP)');
check('limpiar: "B9 acido folico 0.43%" → B9 acido folico', limpiarNombreTinta('B9 acido folico 0.43%') === 'B9 acido folico');
check('fechaAR: 2026-07-15 → 15/07/26', fechaAR('2026-07-15') === '15/07/26');
check('fechaHoraAR: con hora', fechaHoraAR('2026-07-15T09:20') === '15/07/26 - 09:20');
check('filtro: sin tildes ni mayúsculas', coincideFiltro('perez', 'María PÉREZ', null) === true);
check('filtro: no coincide', coincideFiltro('gomez', 'María Pérez', 'PT001 / P166') === false);
check('filtro vacío: muestra todo', coincideFiltro('', 'x') === true);


// ---------- v2.0.6: deadline ----------
const iso = (dias: number) => {
  const d = new Date(Date.now() + dias * 86400000);
  return d.toISOString().slice(0, 10);
};
check('diasHasta: hoy → 0', diasHasta(iso(0)) === 0);
check('diasHasta: +5 días → 5 (amarillo)', diasHasta(iso(5)) === 5);
check('diasHasta: +3 días → 3 (rojo)', diasHasta(iso(3)) === 3);
check('diasHasta: vencida → negativo', (diasHasta(iso(-2)) ?? 0) < 0);
check('diasHasta: sin fecha → null', diasHasta('') === null);

// ---------- v2.0.8: merma 45% sobre el activo (dashboard → PI) ----------
check('merma: constante 45%', MERMA_PI === 0.45);
// Ejemplo real (selenio): necesidad 19,5 g de activo → 28,28 g con merma
check('merma: 19,5 g → 28,28 g (ceil a 2 dec)', activoConMerma(19.5) === 28.28, `=${activoConMerma(19.5)}`);
// Producto total al 50%: 28,28 ÷ 0,5 = 56,56 g → pesadas 28,28 activo + 28,28 excipiente
{
  const activo = activoConMerma(19.5);
  const producto = Math.round((activo / 0.5) * 100) / 100;
  check('merma: producto = activo ÷ conc = 56,56 g', producto === 56.56, `=${producto}`);
  const pes = pesadasPI('Lev. Selenio', 0.5, producto, [{ nombre: 'Oleogel 2,5%', fraccion: 0.5 }], []);
  check('merma: pesada de activo = 28,28 g', Math.abs(pes[0].gramos - 28.28) < 1e-9, `=${pes[0].gramos}`);
  check('merma: excipiente completa el total', Math.abs(pes[0].gramos + pes[1].gramos - producto) < 1e-9);
}
// Redondeo exacto no agrega de más: 15 × 1,45 = 21,75 justo
check('merma: 15 g → 21,75 g (sin +0,01 fantasma)', activoConMerma(15) === 21.75, `=${activoConMerma(15)}`);
// La necesidad de activo sale de la tinta: 39 g de tinta al 50% = 19,5 g de activo
check('necesidades: activo = tinta × concentración', Math.abs(39 * 0.5 - 19.5) < 1e-9);

console.log(fallas === 0 ? '\n✅ TODOS LOS TESTS PASAN' : `\n❌ ${fallas} tests fallaron`);
process.exit(fallas === 0 ? 0 : 1);
