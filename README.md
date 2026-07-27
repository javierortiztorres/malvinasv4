# M.A.L.V.I.N.A.S 2.0 — Nueva Farmacia Badra (PILL.AR)
## v2.0.8 (16-jul-2026) — necesidades en activo, merma 45% y «Hacer» reversible

1. **El dashboard ahora habla en gramos de PRINCIPIO ACTIVO** (el número
   grande), con la equivalencia en tinta, mL y jeringas al lado. Antes el
   número era gramos de TINTA (activo + excipiente), por eso el lote creado
   "traía la mitad de activo" a concentración 50%.
2. **«Hacer» arma el lote desde el activo con 45% de merma**:
   activo del lote = necesidad × 1,45 (redondeado hacia arriba a 2
   decimales), total de producto = activo ÷ concentración, excipientes por
   porcentaje. Ej.: necesidad 19,5 g de levadura de selenio → lote con
   28,28 g de activo → 56,56 g de producto al 50% (28,28 + 28,28). Todo
   editable como siempre.
3. **Nuevo campo «Cant. de PRINCIPIO ACTIVO (g)»** en el editor de PI, la
   forma primaria de cargar un lote: escribís el activo y la cantidad de
   producto se calcula sola (activo ÷ concentración). Editar la cantidad de
   producto a mano sigue funcionando (el activo se muestra en equivalencia).
4. **«Hacer» es reversible**: al crear el lote, la tarjeta muestra
   «✔ Lote … creado · Ver en Producto Intermedio → · ↩ Deshacer». Deshacer
   elimina el lote recién creado. (Ya existían: «Eliminar» dentro de cada
   PI y «↩ Reabrir» en Terminados.) Ya no salta de solapa al crear, así se
   pueden disparar varios «Hacer» seguidos.
5. **Estadística mensual con columna «Activo (g)»** además de la tinta.

Sin migración de base: esta versión es solo código.

## v2.0.7 (16-jul-2026) — dashboard de Necesidades y pesadas de diluciones

1. **Nueva solapa 📊 Necesidades**: suma en vivo, tinta por tinta, cuánta tinta hace
   falta para cubrir TODOS los registros en **Pendientes + En producción** (gramos,
   mL y jeringas estimadas, con detalle por paciente expandible). Cuando un paciente
   pasa a Terminados, sus gramos dejan de contar automáticamente. Las diluciones se
   agrupan aparte de la tinta madre (badge ⚗). El botón **«🧪 Hacer X g»** crea el
   registro de Producto Intermedio ya precargado: cantidad (redondeada a gramos
   enteros), jeringas, concentración, lote siguiente y pesadas teóricas — todo
   editable como siempre. Abajo, **estadística mensual**: gramos, jeringas y lotes
   de cada PI producido por mes (selector de meses).
2. **Pesadas de PI corregidas para diluciones (error grave)**: cuando la
   concentración del lote difiere de la del catálogo (ej. lote de melatonina al
   1,37% con tinta madre al 20% + PEG 80%), los excipientes ahora llenan **todo el
   resto** manteniendo sus proporciones: 100 g al 1,37% → Melatonina 1,37 g +
   PEG 98,63 g = 100 g (antes calculaba PEG 80 g y la suma no daba). Sin dilución
   el cálculo queda exactamente igual que antes.
3. **Nombre limpio del activo en los registros de PI, en todos lados**: las
   tarjetas de Producto Intermedio y de Terminados muestran solo el activo
   («MELATONINA», nunca «PARA 1 MG» ni el %), con la concentración del lote al
   lado del número de lote. `migration-v2.0.7.sql` limpia además los registros
   viejos guardados en la base (nombre del producto y fila del activo).
4. **Cápsulas junto al nombre del paciente**: «MOREIRA, CAROLINA LUCIA
   (90 cápsulas)» en las tarjetas, en la cabecera de pantalla completa y en los
   chips de arriba.

**Antes de deployar: correr `migration-v2.0.7.sql` en Neon** (idempotente, tabla
`_migraciones`; solo limpia texto de registros de PI viejos — no cambia el esquema).

## v2.0.6 (15-jul-2026) — flujo de taller

1. **Tarjetas con médico**: el nombre del médico aparece junto a fórmula y lote.
2. **Solapa "En producción"** (a la izquierda de Pendientes): los registros nacen en **Pendientes** (ex "Producto Terminado") y con el botón "🖨️ A producción" pasan a la solapa del día; "↩ A pendientes" los devuelve. Orden final: Lector · En producción · Pendientes · Producto Intermedio · Terminados · Gestión.
3. **Deadline por registro** (sección 4, campo "no se imprime"): semáforo en las tarjetas — ⏰ gris normal, **amarillo a ≤5 días**, **rojo a ≤3 días o vencida** ("¡sale HOY!" el mismo día). No aparece en el documento impreso.
4. **Esquema de impresión**: panel oscuro arriba de todo el registro con el resumen operativo por capa (tinta, ubicación, dosis, extrusión/cáps, mL totales, lote de PI) + cápsulas totales y Σ de tinta a usar.

**Antes de deployar: correr `migration-v2.0.6.sql` en Neon** (agrega `en_produccion` y `deadline` a registros; inofensiva de repetir).

## v2.0.5 (15-jul-2026) — documento y usabilidad

1. **Sin URL del navegador en los documentos**: CSS de impresión con `@page` sin margen vertical — Chrome ya no dibuja su encabezado/pie (URL vercel.app, fecha, Nº de página).
2. **Registros de PI con nombre limpio**: el activo y el nombre del producto se derivan sin concentración/apodos ("Melatonina", no "Melatonina para 1 mg"); los registros de PI ya creados conservan su texto pero el campo "Nombre del producto" es editable.
3. **"Nombre del producto" editable** en la sección 4 · Producción (default "CÁPSULAS MULTICAPA DE MANUFACTURA ADITIVA", agregable p.ej. "… para migraña").
4. **Fechas en formato argentino corto** (15/07/26) en documentos, rótulos y listados.
5. **Celdas vacías del proceso muestran "-"** (Otros, unidades) en ambos documentos.
6. **Buscadores** en Producto Terminado, Producto Intermedio y Terminados: por paciente, médico, lote, tinta, activo, fecha — sin distinción de mayúsculas ni tildes.

Sin migración de base: esta versión es solo código.

## v2.0.4 (15-jul-2026) — documento final y excipientes

1. **Nº POE en el documento del lote**: se deriva solo del lote de PI usado (parte antes de la barra: `FPI.01.PI013/P006` → POE `FPI.01.PI013`). No hay que cargar nada.
2. **Nombre con validez documental**: en el documento, los productos intermedios figuran como "Tinta de {Activo}" (ej: *Tinta de Melatonina*); el nombre interno con concentración queda solo dentro de la app.
3. **mL totales por capa**: al lado de "Extrusión/cáps" se muestra el volumen de tinta para todo el lote (extrusión × cápsulas totales).
4. **Excipientes como % del total de la tinta**: activo + excipientes = 100% (ej: Pregnenolona 5,7% + PEG 4000 94,3%). El modal valida contra ese objetivo y tiene botón "Completar restante" (c.s.p.). Las pesadas teóricas de los lotes de PI se calculan con la nueva semántica.

**Antes de deployar: correr `migration-v2.0.4.sql` en Neon** — convierte las fracciones guardadas a la nueva semántica. Es a prueba de Runs repetidos (tabla `_migraciones`).

## v2.0.3 (13-jul-2026) — correcciones de producción

1. **Los cambios ya no desaparecen al cambiar de paciente o de solapa**: cada edición actualiza también la lista en memoria de la app (antes solo iba a la base y la pantalla volvía a mostrar datos viejos hasta recargar).
2. **La tapa solo se llena si el cuerpo supera 0.9 mL**: las tintas marcadas "apta para tapa" (PEG, CoQ10, Idebenona) arrancan en el cuerpo y pasan a la tapa automáticamente solo cuando el cuerpo se excede. La ubicación se puede fijar a mano por capa (botón "↺ auto" para volver al automático).
3. **Gestión de tintas → excipientes**: el campo del nombre del excipiente volvió a ser usable (bug de CSS que lo colapsaba a un cuadradito), con encabezados "Cuál excipiente es / % del total" y sugerencias.
4. **Arrastrar el PDF de la receta al lector ya funciona** (además del click).
5. **Conversión de dosis por tinta**: cada tinta puede definir "unidad de receta" + "mg de materia prima por unidad" (Gestión → editar tinta). Levadura de selenio ya viene configurada (100 µg Se → 50 mg de levadura). Para Vitamina D en UI, cargar el factor cuando tengan la potencia de la materia prima.

**Antes de deployar esta versión: correr `migration-v2.0.3.sql` en el SQL Editor de Neon (una sola vez).**


Fusión de MALVINAS (motor de cálculo de extrusiones por IP) con el sistema de
registro de lotes: lectura de recetas, cálculo automático de extrusiones por
capa, división de cápsulas, dilución sugerida, y registros legales de
Producto Terminado y Producto Intermedio.

## Qué hace

### 📄 Lector de recetas
Subís el PDF de la receta electrónica (CFC) y extrae paciente, médico,
matrícula, diagnóstico y todas las fórmulas. **Cada activo se mapea
automáticamente a su tinta** (por keywords editables) y la extrusión de cada
capa queda precalculada. Modo "Pegar texto" para recetas por foto. Las
recetas no se guardan nunca.

### 💊 Producto Terminado
Tarjetas por paciente (color propio, nombre en grande). Editor con:
- **Motor en vivo**: extrusión = (dosis ÷ concentración) ÷ 1000 ÷ IP
- **División automática** de cápsulas por toma (volumen > 0.95 mL), con
  **aviso en ROJO** y override manual
- **Selector de tintas sugeridas** por activo (criterio: imprimible ≥ 0.03 mL
  y menor volumen), con todas las opciones visibles
- **Concentración editable en vivo** (el IP se mantiene) y **sugerencia de
  dilución** con un click para llenar 0.8 mL
- Panel **Resultados** estilo MALVINAS: cápsula visual por capas, ocupación,
  cuerpo (0.9) / tapa (0.1), alertas químicas, parámetros de impresora
- Validación estricta antes de TERMINAR + documento legal + rótulo copiable

### 🧪 Producto Intermedio
Elegís la tinta → lote automático `POE/NFB/FF/FPI.01.PIxxx/P###` (contador
propio por tinta) → cargás gramos a producir → **pesadas teóricas calculadas**
(activo + excipientes por fracciones exactas) → pesadas reales → registro
legal idéntico al documento oficial. Detecta cuando una materia prima es a su
vez un PI (ej. oleogel) y pide su lote FPI.

### 🗂️ Gestión (principio I+D: TODO editable)
Las 65 tintas migradas de MALVINAS con: concentración, IP, keywords de mapeo,
ubicación cuerpo/tapa, **excipientes con fracciones exactas** (se acabó el
reparto en partes iguales), parámetros de impresora, alertas químicas y POE.
Más médicos, operadores y excipientes del rótulo. Sin duplicados.

## Instalación (igual que el sistema anterior)

1. **GitHub**: repo nuevo → subir todo el contenido de esta carpeta
2. **Vercel**: Add New → Project → importar el repo → agregar variable
   `APP_PASSWORD` → en Storage → Create Database → **Neon** (crear base NUEVA)
3. **Tablas**: en la base Neon → SQL Editor → pegar TODO el contenido de
   `neon-setup-malvinas2.sql` → **antes de Run, cambiar el 165 del final por
   el último lote PT real** → Run
4. **Redeploy** en Vercel (Deployments → ⋯ → Redeploy)

### Local (opcional)
```bash
npm install
cp .env.example .env   # DATABASE_URL + APP_PASSWORD
npm run db:push && npm run db:seed
npm run dev
```

## Constantes del motor (src/lib/engine.ts)
- Capacidad de trabajo: 0.95 mL (cuerpo 0.9 + tapa 0.1, margen por expansión)
- Extrusión mínima de impresora: 0.03 mL
- Objetivo de llenado al diluir: 0.8 mL · Mínimo aceptado: 0.55 mL
- Vencimiento PT y PI: elaboración + 3 meses

## Estructura
```
src/lib/engine.ts       ← MOTOR: IP, división, dilución, capacidades, mapeo
src/lib/parser.ts       ← parser de recetas CFC (probado con recetas reales)
src/db/schema.ts        ← tintas completas, registros PT y PI
src/components/         ← 5 solapas + ResultadosPanel + editor de tintas
scripts/tintas-seed.json← las 65 tintas extraídas de MALVINAS
neon-setup-malvinas2.sql← setup completo sin terminal (en el zip de entrega)
```
