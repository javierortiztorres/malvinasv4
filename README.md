# M.A.L.V.I.N.A.S 2.0 — Nueva Farmacia Badra (PILL.AR)
## v2.0.34 (04-ago-2026) — 3 correcciones en Estadística tras verificación (B-19.6.2)

1. **Se sacaron los párrafos explicativos de metodología de TODA la solapa
   Estadística** (no solo del bloque de Extrusión): el de "Con receta
   repetida" en Pacientes, el de Extrusión/capas y el de "Tiempo de
   producción" (proxy). Los bloques quedan con título corto + números/
   gráfico. Se mantienen los avisos cortos y condicionales de datos reales
   del período (ej. "+2 recetas sin dato, excluidas del promedio") porque
   informan un hecho del período, no explican metodología general.
2. **"Recetas con dato" investigado y renombrado**: se consultaron con
   `GET /api/registros?estado=terminado` las 27 recetas terminadas reales
   en producción — las 27 tienen el dato de extrusión guardado (0
   excluidas), confirmando lo que anticipó Tomi. Se renombró la tarjeta a
   "Recetas incluidas en el promedio" (sin párrafo aparte).
3. **Bug de cálculo corregido: "extrusión promedio por cápsula" sumaba las
   capas dentro de cada cápsula antes de promediar** (mezclaba cápsulas de
   1 y de 9 capas en la misma unidad de conteo, resultado no comparable
   entre recetas con distinta cantidad de capas). Ahora `engine.ts`
   (`calcularExtrusionPeriodo`) promedia sobre el total de **capas
   individuales** del período (cada capa de cada cápsula de cada receta
   cuenta como un dato propio) — campo renombrado `promedioPorCapa`,
   tarjeta renombrada "Extrusión promedio por capa". Tests actualizados en
   `scripts/test-engine.ts`.
4. Verificado visualmente con Playwright en 1280/768/375 px con datos de
   magnitud realista, sin overflow ni corte de texto en toda la solapa.

## v2.0.32 (03-ago-2026) — Extrusión y activo por cápsula en Estadística (B-19.6)

1. **Investigación previa (obligatoria antes de tocar nada)**: se pidió un
   promedio de "cantidad de extrusiones" por receta/cápsula. El esquema NO
   tiene ningún campo de CONTEO de extrusiones — `extrusionMl` (capa de
   `registros`) es el VOLUMEN (mL) por cápsula, ya calculado y guardado
   para el documento. Se consultó con Tomi antes de asumir nada: se
   entregan los promedios de volumen (mL) con el dato existente, y además
   —a pedido explícito, reemplazando el conteo— un promedio de **activo
   (g) por cápsula** con la receta de máximo y de mínimo. El conteo de
   eventos de extrusión (que sí requeriría un campo nuevo) queda pendiente
   de backlog.
2. **Nueva sección "💉 Extrusión y activo por cápsula"** en 📈 Estadística:
   "Extrusión prom. por receta" y "por cápsula" (mL), "Activo prom. por
   cápsula" (g, activo = extrusión × IP × concentración — regla de oro del
   dominio) y las tarjetas de receta con máximo y mínimo activo por
   cápsula del período. Mismo selector Mes/Rango libre que el resto de la
   solapa, mismo estilo Tabla/Gráfico.
3. **Recetas sin el dato guardado se EXCLUYEN del promedio, nunca se
   cuentan como 0** (mismo criterio que "Tiempo de producción" de B-19.5),
   con aviso de cuántas se excluyeron. Lógica nueva en `engine.ts`
   (`calcularExtrusionPeriodo`, `activoPorCapsulaG`, `calcularActivoPeriodo`)
   con tests de contraste en `scripts/test-engine.ts`.
4. Verificado visualmente con Playwright en 1280/768/375 px, con datos de
   magnitud realista (cientos de cápsulas, docenas de recetas), sin
   overflow ni corte de texto. No se tocó ningún bloque existente de la
   solapa.

## v2.0.31 (03-ago-2026) — Tiempo de producción en Estadística, proxy de eficacia (B-19.5)

1. **Investigación previa (obligatoria antes de tocar nada)**: se pidió una
   métrica de "eficacia real" (receta → entrega al paciente). El esquema NO
   tiene ningún timestamp de entrega: `estado` de `registros` solo vale
   `'en_proceso'` o `'terminado'`, y no hay campo `entregadoAt` ni concepto
   de entrega en ningún lado del código (grep de "entreg/retir/despach/
   dispensa" sin resultados). Se consultó con Tomi antes de seguir — se
   optó por el proxy sin tocar el esquema, dejando el campo real de
   entrega como pendiente de backlog.
2. **Nueva sección "⏱️ Tiempo de producción"** en 📈 Estadística: mide
   entrada de la receta al sistema (`createdAt`) → fin de producción
   (`fechaHoraFin`, tipeado a mano por el operador, obligatorio para
   poder terminar un registro). Etiquetado explícito en la UI de que
   **no** es la entrega real — es un proxy, y de qué campos sale.
3. Muestra promedio/mínimo/máximo del período (mismo selector Mes/Rango
   libre que el resto de la solapa) y una distribución en 5 franjas
   (< 1 día, 1–3, 3–7, 7–14, 14+), en tabla y en gráfico (dona, mismo
   patrón que 🧪 Activos usados de B-19.4). Registros sin `fechaHoraFin`
   válido se excluyen del cálculo y se avisa la cantidad excluida.
4. No se tocó ningún bloque existente de la solapa (KPIs, Producción,
   Pacientes, Ranking, Evolución quedan idénticos).

## v2.0.30 (03-ago-2026) — Overflow real de las donas de Estadística, verificado con captura visual (B-19.4.2)

1. **B-19.4.1 verificó solo por API y no alcanzó**: los números eran
   correctos pero el texto central de la dona ("72450 mg" en 🧪 Activos
   usados) se veía tapado por el anillo de color en producción. Esta vez
   se verificó con capturas de pantalla reales (Playwright, devDependency
   nueva) en 1280/768/375 px, contra los datos reales de producción
   (mismo total de 72450 mg), no valores simulados.
2. **Centro de la dona con fuente fija**: `text-base` no se achicaba
   nunca, así que un total de 5+ dígitos + unidad no entraba en el hueco
   (que es un tamaño fijo en px, no responde al viewport). Ahora el
   número va en su propia línea con tamaño según cantidad de dígitos, y
   la unidad (si la hay, ej. "mg") en una línea aparte más chica —
   confirmado visualmente que entra en las 3 anchos, incluso probando con
   un total 100 veces mayor al real.
3. **Bug nuevo encontrado al revisar el patrón completo (no solo el
   síntoma reportado)**: la leyenda de las donas no truncaba nombres
   largos (le faltaba `min-w-0` al ítem flex) — un diagnóstico largo se
   salía de la tarjeta en vez de cortarse con "…". Corregido en el mismo
   lugar.
4. **Sin tocar lo que ya andaba bien**: 📈 Evolución mes a mes y el
   medidor propio de 🧑‍🤝‍🧑 Pacientes (B-19.4.1) no se modificaron.

## v2.0.29 (03-ago-2026) — Fix de 2 bugs de Estadística encontrados en producción (B-19.4.1)

1. **Números que se desbordaban con datos reales grandes**: en 📦
   Producción y en los KPIs destacados, valores de 4+ dígitos (ej. 1299
   cápsulas, 3800 mL — confirmado contra datos reales de producción, no
   solo simulados) se salían del ancho de su tarjeta. El tamaño de fuente
   de `Tile` y `KpiDestacado` ahora usa `clamp()` en vez de un tamaño
   fijo, con `break-words` como resguardo si aun así no entra.
2. **🧑‍🤝‍🧑 Pacientes sin visualización propia**: al tener una sola
   serie (pacientes atendidos, sin varias categorías como los demás
   bloques), su pestaña "Gráfico" quedaba con muy poca diferencia visual
   respecto de "Tabla". Ahora tiene un medidor destacado propio (número
   grande + barra de progreso vs. período anterior) — mismos datos que la
   tabla, cero cálculos nuevos.
3. **Sin tocar lo que ya andaba bien**: 📈 Evolución mes a mes (líneas) no
   se modificó.

## v2.0.28 (03-ago-2026) — Variedad de tipos de gráfico en Estadística (B-19.4)

1. **No es una fuente de datos nueva**: mismo `aPT`/`pPT`/`aPI`/`pPI` de
   B-19.3 — cero cálculos nuevos, solo cambió el TIPO de visualización.
2. **Torta/dona para proporciones de un total**: 🧪 Jeringas por volumen
   (10 mL vs. 60 mL) en 📦 Producción, y 🧪 Activos usados / 📋
   Diagnósticos más frecuentes en 🏆 Ranking — con leyenda (nombre, valor
   y %) y total al centro, sin librería nueva (SVG a mano, mismo patrón
   sin dependencias de B-19.3).
3. **Línea para evolución en el tiempo**: 📈 Evolución mes a mes (cápsulas
   y jeringas de PI) pasa de barras verticales a una línea con área
   suave, con el mes activo marcado en Tussok — mismos datos y mismo
   rango de meses que antes.
4. **Rankings siguen en barras horizontales**: ⭐ Cápsula estrella y 🩺
   Médicos derivadores no cambiaron — son comparaciones entre ítems, no
   partes de un total.
5. **Paleta MALVINAS sin salirse de los 5 tonos**: los segmentos de
   torta/dona usan Profundo/Niebla/Turba, con Tussok reservado como
   acento del segmento destacado (ítem #1). Con más de 3-4 categorías se
   generan variantes tonales (mezcladas hacia Hueso/Turba) en vez de
   agregar colores fuera de la paleta.
6. **Sin truncar categorías**: a diferencia del top-8 de los rankings en
   barra, la torta/dona muestra todas las categorías con valor > 0 — así
   el total del centro siempre coincide con el total de la tabla.

## v2.0.27 (03-ago-2026) — Gráficos en la solapa Estadística (B-19.3)

1. **No es una fuente de datos nueva**: cada gráfico grafica exactamente los
   mismos valores que ya calculaba/mostraba la tabla o tarjeta de al lado
   (`aPT`/`pPT`/`aPI`/`pPI` de B-19/B-19.2) — cero cálculos nuevos.
2. **Toggle "Tabla / Gráfico"** en 📦 Producción, 🧑‍🤝‍🧑 Pacientes y
   🏆 Ranking (mismo estilo que el selector Mes/Rango), default en Tabla:
   la vista original sigue disponible tal cual, el gráfico complementa, no
   reemplaza. 📈 Evolución ya tenía sus barras desde B-19.
3. **Producción y Pacientes**: barras "este período vs. anterior" — la
   misma comparativa que ya mostraba la flechita de `<Delta>`, ahora
   también en forma visual.
4. **Ranking**: barras horizontales por cápsula estrella, activo, médico y
   diagnóstico, mismo orden y mismo valor que ordena cada tabla (top 8 por
   gráfico para que no se haga interminable en mobile — la tabla sigue
   mostrando todo).
5. **Sin librería nueva**: mismo patrón de barras con Tailwind que ya usaba
   Evolución (Profundo/Tussok/Niebla), se revisó `package.json` y no hacía
   falta agregar nada.
6. **Los períodos aplican igual**: al venir de los mismos `useMemo` que la
   tabla, cambiar de mes o de rango libre actualiza tabla y gráfico juntos.

## v2.0.26 (03-ago-2026) — Rediseño visual de la solapa Estadística (B-19.2)

1. **Solo diseño**: no se tocó ningún cálculo, query ni dato de la solapa
   "📈 Estadística" (B-19) — se reorganizó cómo se muestra lo que ya existía
   en `Estadistica.tsx`.
2. **KPIs destacados arriba de todo**: cápsulas producidas, pacientes
   atendidos y mL de PI producidos ahora tienen su propia sección con
   tarjetas grandes (número en `font-archivo` 4xl + etiqueta chica), en vez
   de pesar igual que el resto de los números.
3. **Bloques temáticos con encabezado**: 📦 Producción (cápsulas, jeringas
   de 10/60, mL), 🧑‍🤝‍🧑 Pacientes, 🏆 Ranking (cápsula estrella + activos +
   médicos derivadores + diagnósticos, ahora en 3 columnas en desktop) y
   📈 Evolución mes a mes, separados por un borde sutil (`border-linea`).
4. **Paleta consistente**: los textos de apoyo/caption que usaban grises
   genéricos de Tailwind (`slate-400`/`slate-500`) ahora usan **Niebla**
   (`text-niebla`), el color de la identidad MALVINAS pensado justo para
   eso.
5. **Responsive verificado**: sin overflow horizontal en mobile (375px);
   las tarjetas grandes se apilan en una columna angosta.

## v2.0.25 (03-ago-2026) — Solapa "📈 Estadística": números completos del admin (B-19)

1. **Nueva solapa "📈 Estadística"** (entre Terminados y Gestión), con
   selector de período: **Mes** (default el mes actual, navegable con
   ← Anterior / Mes actual / Siguiente →) o **Rango libre** desde/hasta.
   Todo se recalcula al cambiar el período, en el cliente, con los
   registros PT y PI que `page.tsx` ya carga (sin API nueva). El "día de
   producción" de un registro usa el mismo criterio que ya ordenaba
   Terminados (`fechaHoraFin → fechaElab → createdAt`, nueva
   `fechaProduccion()` en `utils.ts`): `updatedAt` no es confiable porque
   el esquema no tiene `$onUpdate`.
2. **Todo con la etiqueta "producido/producidas"** — la palabra "vendido"
   no aparece acá; eso se suma recién con el cotizador (Fase 3).
3. **Métricas de producto terminado**: cápsulas producidas, pacientes
   atendidos (únicos), ranking de **activos usados** (mg totales
   dispensados + cápsulas que llevan cada uno, calculado desde las capas),
   **top 5 "cápsulas estrella"** por fórmula (destacada la primera), y
   ranking de **médicos derivadores** y de **diagnósticos tal cual están
   guardados** (texto libre, con bucket "Sin diagnóstico" — este dato,
   cargado por el Lector de recetas, nunca se había mostrado en la app).
4. **Métricas de producto intermedio**: jeringas de 10 mL, de 60 mL y mL
   totales producidos en el período (con aviso aparte si hay jeringas de
   otro volumen, para no ocultar datos).
5. **Evolución mes a mes** (últimos 12 meses en modo Mes, o los meses del
   rango elegido) de cápsulas y jeringas: barras simples con Tailwind, un
   solo color de marca por gráfico y el mes activo resaltado en Tussok —
   no se agregó ninguna librería de gráficos.
6. **Comparativa** contra el período anterior equivalente (mes previo, o
   un rango de igual longitud inmediatamente anterior): +/-% por métrica;
   si el período anterior no tiene datos, se muestra "—" sin romper nada.
7. **Mudanza**: el bloque "Estadística mensual de PI" que vivía dentro de
   Necesidades se eliminó de ahí (ahora cubierto por esta solapa nueva);
   el resto de Necesidades (Hacer/Deshacer, cálculos de necesidad de
   tinta) queda exactamente igual.

## v2.0.24 (03-ago-2026) — Agenda: pantalla principal con calendario de deadlines (B-25)

1. **Nueva solapa "🗓️ Agenda", primera y pantalla inicial**: reemplaza el
   Google Calendar en el que se llevaba a mano "qué receta sale qué día".
   Dos vistas conmutables — **Semana** (columnas Lunes a Domingo, estilo
   agenda) y **Mes** (grilla de 6 semanas) — con navegación anterior/
   siguiente, botón "Hoy" y el día de hoy resaltado. Todo con las
   utilidades de fecha existentes (`hoyISO`, `diasHasta`, `fechaAR`,
   `sumarMeses`), sin librerías nuevas.
2. **Eventos**: cada registro PT `en_proceso` con `deadline` cargado
   aparece una vez en su fecha, con el paciente y el primer activo de la
   fórmula. Color según el mismo semáforo de urgencia de Pendientes/En
   producción (rojo ≤3 días o vencida, ámbar ≤5, gris el resto). Varios
   eventos el mismo día se apilan en la celda con scroll propio.
3. **Avisos**: "N recetas vencidas" (lleva a la más urgente, enfocada en
   En producción o Pendientes según corresponda) y "N sin fecha" (lleva a
   la solapa correspondiente); ninguno aparece si el conteo es 0. Los
   registros sin `deadline` no se inventan una fecha: quedan solo en este
   contador.
4. **Click en un evento**: cambia a la solapa En producción o Pendientes
   (según `enProduccion`) y abre esa tarjeta en modo foco — se reusó el
   mecanismo existente de `EnProceso` (antes 100% estado interno) sumando
   dos props opcionales (`focoInicialId`/`onFocoConsumido`) para que el
   padre pueda pedir el foco desde afuera sin duplicar esa UI.
5. Las demás solapas y su comportamiento no cambiaron (orden por
   deadline, semáforo, modo foco, buscador); solo se agregó la Agenda y
   pasó a ser la solapa inicial.

## v2.0.23 (03-ago-2026) — orden y buscador de PI terminados + sin resultados (B-16)

1. **Buscador de PI corregido**: en Terminados, la lista de Producto
   intermedio ahora tiene su propio buscador (antes compartía el de arriba
   con Producto terminado, que nunca matchea contra `tintaNombre`). El nuevo
   buscador filtra por tinta, producto o lote (case-insensitive, coincidencia
   parcial) contra los datos crudos, no contra el % decorativo agregado en
   B-14. El buscador de Producto terminado sigue exactamente igual.
2. **Caso "sin resultados" en PI**: si la búsqueda no matchea ningún PI,
   aparece "Ningún lote de PI coincide con la búsqueda." en vez de una lista
   vacía muda, replicando el patrón que ya tenía Producto terminado.
3. **Orden de PI terminados**: se mantiene el criterio ya vigente desde B-24
   (fecha de terminación descendente — `fechaHoraFin` → `fechaElab` →
   `createdAt` como fallback en cascada, todos son `text`/`Date` parseables)
   y ahora se conserva también mientras se busca.

## v2.0.22 (03-ago-2026) — orden automático por deadline en En Proceso (B-15)

1. **Tarjetas ordenadas solas por urgencia**: en Pendientes y En producción
   las tarjetas ya no siguen el orden de carga; ahora se ordenan por
   deadline — vencidas arriba de todo, después las más próximas, y las que
   no tienen deadline cargado al final. Empates (o falta de deadline en
   ambas): primero el lote más viejo (`loteNumero`), y si no hay o también
   empata, la más antigua por fecha de creación (`createdAt`). El orden se
   recalcula en cada render, así se reacomoda solo al editar un deadline o
   mover una tarjeta entre solapas. Semáforo, modo foco y el botón
   Pendientes↔En producción no cambiaron.
2. **Asserts de `diasHasta` deterministas**: en `scripts/test-engine.ts` el
   helper de fechas de esos tests armaba la fecha esperada con
   `toISOString()` (UTC), mientras `diasHasta` compara contra `hoyISO()`
   (huso Argentina, UTC-3) — entre las 00:00 y 03:00 UTC ambas fechas
   quedaban desincronizadas y los asserts fallaban según la hora del día en
   que se corrían. Se corrigió solo el helper del test para usar el mismo
   huso horario; `diasHasta` no cambió su comportamiento.
3. Nuevo script `npm run test:engine` (`package.json`), espejando
   `test:parser`, para poder correr `scripts/test-engine.ts` siempre.

## v2.0.21 (03-ago-2026) — el % de concentración va en NOMBRE DEL PRODUCTO del doc de PI (B-14.1)

1. **Corrección de B-14**: en el documento de PI (`/registro-pi/[id]/print`)
   el % de concentración ya no aparece en una línea "CONCENTRACIÓN: X%" bajo
   la fórmula cuali-cuantitativa; ahora se concatena al final de la línea
   "NOMBRE DEL PRODUCTO" (ej. "TINTA DE B6 PIRIDOXINA 35%"), usando el mismo
   helper `fmtPctOpcional`. Un PI sin concentración cargada queda igual que
   antes. La pantalla (tarjetas de PI, Terminados, planilla de pesadas) no
   se tocó; `nombre_producto` en la base sigue sin modificarse.

## v2.0.20 (03-ago-2026) — % de concentración junto al nombre del PI (B-14)

1. **% automático en pantalla**: en la solapa Producto Intermedio (tarjetas
   en proceso) y en la lista de PI de Terminados, el nombre del PI ahora
   muestra su concentración al lado (ej. "Minoxidil · 5%"). También se
   prolijó la planilla de pesadas (`/pesadas/print`) para usar el mismo
   formato. Un PI sin concentración cargada se ve igual que antes (nunca
   "0%" ni "—"). Es solo presentación: `nombre_producto` no cambia en
   ningún flujo, y el % sigue sin volver al nombre (decisión de v2.0.7).
2. **% en el documento de PI**: la fórmula cuali-cuantitativa
   (`/registro-pi/[id]/print`) suma una línea "CONCENTRACIÓN: X%"; el
   campo "NOMBRE DEL PRODUCTO" del documento sigue sin %.
3. Nuevo helper único `fmtPctOpcional` (`src/lib/utils.ts`, envuelve el
   `fmtPct` de `engine.ts`) para no repetir el guard null/0 en cada
   componente.

## v2.0.19 (03-ago-2026) — modales de tintas y rótulo: cierre solo explícito

1. **Click/arrastre en el fondo ya no cierra los modales** (B-22): en
   Gestión de tintas (`Admin.tsx`) y en el rótulo de Terminados
   (`Terminados.tsx`), el fondo oscuro dejó de tener manejadores de
   mousedown/mouseup — ahora esos modales se cierran únicamente con la
   cruz ✕, el botón "Cancelar" o la tecla Escape (el hook
   `useCerrarModal` sigue aportando solo el cierre por Escape). Ningún
   otro modal del sistema se tocó.
2. **Botón "Cancelar" agregado al rótulo**: el modal de rótulo en
   Terminados no tenía forma explícita de cancelar además de la ✕; ahora
   suma un botón "Cancelar" junto a "📋 Copiar para la rotuladora".

## v2.0.18 (03-ago-2026) — planilla de pesadas: espacio real para fecha y hora en Inicio/Fin

1. **Líneas de escritura demasiado cortas** (B-12.4): en `/pesadas/print`,
   "Inicio: _____ · Fin: _____" (B-12) no dejaba lugar para que el operador
   anotara a mano fecha y hora completas. Ahora cada sección muestra
   "Inicio (fecha y hora): ____________" y "Fin (fecha y hora): ____________"
   en dos filas separadas, cada una con una línea de ~48 mm impresos donde
   entra cómodo algo como "03/08/2026 14:30". Malaxado (B-13.1) y
   Jeringas/Volumen (B-12.1) quedan sin cambios.

## v2.0.17 (02-ago-2026) — planilla de pesadas: campo manual de malaxado

1. **Paso previo al B-13 en la planilla** (B-13.1): cada sección de PI en
   `/pesadas/print` suma una línea "Malaxado: ☐ Tinta ☐ Polvo ☐ Ambos ·
   Tiempo: ____ min", ubicada junto a Inicio/Fin (antes de los campos de
   envasado de B-12.1), para que el operador anote a mano durante la
   elaboración lo que después se tipea en el editor de PI. Siempre en
   blanco: la planilla no lee `malaxadoTipo`/`malaxadoTiempoMin`, ese dato
   ya vive en el documento legal de PI.

## v2.0.16 (02-ago-2026) — malaxado (tipo y tiempo) en registro y documento de PI

1. **Nuevo dato en el proceso de PI** (B-13): tipo de malaxado (Tinta / Polvo
   / Ambos) y tiempo en minutos, cargados dentro del jsonb `proceso` de
   `registros_pi` (`DatosProcesoPi` en `src/db/schema.ts`, sin migración —
   ambos campos son opcionales). Se guardan por el mismo autosave del resto
   del proceso.
2. **Documento de PI**: fila "MALAXADO" nueva en DATOS DEL PROCESO, con
   formato "Tinta — 15 min" (o "Polvo"/"Tinta y polvo" según corresponda).
   "0" minutos se muestra como "0 min" (no desaparece). En los PI históricos,
   sin el campo cargado, la fila queda en blanco para completar a mano.

## v2.0.15 (02-ago-2026) — planilla de pesadas: PI nuevos no aparecían (fetch cacheado)

1. **Causa raíz encontrada y verificada en prod** (B-12.3): `/pesadas/print`
   es dinámica (`force-dynamic`) y su HTML se regeneraba en cada pedido
   (sin caché de CDN ni de navegador, confirmado con headers reales de
   Vercel), pero la consulta a la base que hace el driver `neon-http`
   usa `fetch()` por dentro — y Next.js cachea `fetch()` en Server
   Components por defecto. `force-dynamic` no alcanzaba a desactivar esa
   caché para el fetch interno del driver, así que la planilla podía
   servir una foto vieja de la tabla `registros_pi` aunque la página en
   sí fuera fresca. Reproducido creando un PI de prueba: aparecía al
   instante en `/api/registros-pi` pero no en `/pesadas/print` durante
   varios minutos.
2. **Fix**: `neon(DATABASE_URL, { fetchOptions: { cache: 'no-store' } })`
   en `src/db/index.ts` — desactiva la caché de `fetch()` para todas las
   consultas del driver (no solo la planilla), es la forma documentada
   de evitar este problema con Neon + Next.js App Router.

## v2.0.14 (02-ago-2026) — planilla de pesadas: mismo filtro que la solapa + jeringas obtenidas

1. **Filtro de `/pesadas/print` corregido** (B-12.1): la planilla ahora usa
   exactamente el mismo criterio de "PI pendiente" que la solapa Producto
   Intermedio (`esPiPendiente` en `src/lib/utils.ts`, compartido entre
   `page.tsx` y la planilla) en vez de repetir el filtro en la consulta
   SQL — así nunca puede listar menos lotes que los que se ven en la
   solapa.
2. **Un PI pendiente sin materias primas cargadas ya no desaparece de la
   planilla**: aparece con su cabecera igual que los demás, la nota
   "(pesadas sin cargar en el sistema)" y la tabla con 4 filas en blanco
   para completar a mano.
3. **Campos de envasado al pie de cada sección**: "Jeringas obtenidas:
   ____" y casilleros "☐ 10 mL · ☐ 60 mL", siempre en blanco para anotar a
   mano el resultado real del envasado.

## v2.0.13 (02-ago-2026) — planilla única de pesadas de PI en proceso

1. **Nueva planilla imprimible `/pesadas/print`** (B-12): lista TODOS los
   productos intermedios en proceso, ordenados por lote, en una sola hoja
   para llevar a la balanza — una sección por PI con nombre de producto,
   tinta, concentración, POE, lote, cantidad a producir y la tabla de
   materias primas (componente, lote a usar, masa teórica, y masa real en
   blanco para completar a mano), más la línea de inicio/fin de proceso.
   Los valores salen tal cual del registro (sin recalcular); si no hay
   ningún PI pendiente, muestra un mensaje claro en vez de una hoja vacía.
2. **Botón «⚖️ Planilla de pesadas»** en la cabecera de la solapa Producto
   Intermedio, junto al alta de nueva producción, que abre la planilla en
   una pestaña nueva. Sin botón por tarjeta: las tarjetas de PI en proceso
   quedan como en B-11.2.

## v2.0.12 (02-ago-2026) — sacar el botón Documento de las tarjetas en proceso

1. **Se sacó el botón «📄 Documento» de las tarjetas en proceso de PT y
   PI** (B-11/B-11.1): el documento de un registro sin terminar sale a
   medio llenar y no sirve. El documento sigue abriéndose solo al
   terminar (con su aviso si el navegador bloquea el popup) y sigue
   disponible en la solapa Terminados.

## v2.0.11 (02-ago-2026) — abrir el documento al terminar un PT

1. **Al marcar un PT como TERMINADO, su documento se abre solo en una
   pestaña nueva** (`/registro/[id]/print`), sin tener que ir a buscarlo a
   Terminados. Si Chrome bloquea el popup, no rompe nada: aparece un aviso
   arriba de la lista con un botón «📄 Abrir documento» para abrirlo a
   mano. El resto del flujo de terminar (validación, lote, recarga de la
   lista) sigue igual — mismo comportamiento que B-11 aplicó para PI.
2. **Botón «📄 Documento» en cada tarjeta de PT en proceso** (solapas En
   producción y Pendientes), junto al botón de mover de solapa, para abrir
   el documento sin tener que entrar en pantalla completa.

## v2.0.10 (02-ago-2026) — abrir el documento al terminar un PI

1. **Al marcar un PI como TERMINADO, su documento se abre solo en una
   pestaña nueva** (`/registro-pi/[id]/print`), sin tener que ir a buscarlo
   a Terminados. Si Chrome bloquea el popup, no rompe nada: aparece un
   aviso arriba de la lista con un botón «📄 Abrir documento» para abrirlo
   a mano. El resto del flujo de terminar (operador obligatorio, recarga de
   la lista) sigue igual.
2. **Botón «📄 Documento» en cada tarjeta de PI en proceso**, junto al
   nombre del lote, para abrir el documento sin tener que terminarlo ni
   esperar a que pase a Terminados.

## v2.0.9 (02-ago-2026) — firma del operador y DT en el documento de PI

1. **Roles de operador con fallback**: los selects de operador/supervisor
   (PT y PI) ahora comparan el rol normalizado (sin mayúsculas ni espacios).
   Si un typo en la base deja el filtro vacío, se muestran todos los
   operadores en vez de un select en blanco.
2. **Supervisor / DT opcional en el editor de PI**, junto al operador. Se
   guarda en `registros_pi.supervisor` (columna aplicada a mano en Neon,
   ver `migration-v4-B10.sql` — no incluida en este repo, se corrió antes
   del deploy).
3. **Operador obligatorio para terminar un PI**, con aviso claro («Elegí el
   operador que elaboró el lote»). El supervisor sigue siendo opcional.
4. **En Gestión, el rol del operador se elige de una lista cerrada**
   (`produce` / `revisa`) en vez de tipearse por `prompt()`.
5. **El documento de PI ahora firma «Elaboró» y «Controló (DT)»** (antes
   solo tenía una línea de operador, que además podía salir vacía). Los PI
   históricos sin operador quedan con la línea en blanco para firmar a
   mano.
6. **Impresión sin URL ni fecha del navegador**: `@page { margin: 0 }` en
   los documentos de PT y PI (el fix que el changelog prometía desde
   v2.0.5), con el margen visual repuesto por padding propio del
   documento. El bloque de firmas nunca se corta entre páginas
   (`break-inside-avoid`).

Sin migración de base en este repo: `registros_pi.supervisor` ya se agregó
a mano en Neon antes de este deploy, siguiendo el protocolo del proyecto.

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
