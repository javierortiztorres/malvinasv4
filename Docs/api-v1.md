# API REST v1 — MALVINAS (PILL.AR)

API de solo lectura para integración con sistemas externos. Todos los endpoints requieren autenticación.

---

## Autenticación

Header requerido en cada request:

```
Authorization: Bearer {API_KEY}
```

La `API_KEY` se configura como variable de entorno `API_KEY` en el servidor (Vercel).

```bash
curl -X GET \
  https://tu-dominio/api/v1/registros \
  -H 'Authorization: Bearer tu_api_key'
```

**Errores de autenticación:**

| Código | Causa |
|--------|-------|
| 401 | API Key ausente o inválida |
| 503 | `API_KEY` no configurada en el servidor |

---

## Base URL

```
https://{tu-dominio}/api/v1
```

---

## Endpoints

### GET /registros

Lista registros de Producto Terminado (PT).

**Query params opcionales:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `estado` | string | Exacto: `en_proceso` \| `terminado` |
| `paciente` | string | Búsqueda parcial, case-insensitive |
| `desde` | ISO 8601 | Registros creados desde esta fecha |
| `hasta` | ISO 8601 | Registros creados hasta esta fecha |

**Ejemplo:**
```bash
curl "https://tu-dominio/api/v1/registros?estado=en_proceso&paciente=Moreira" \
  -H 'Authorization: Bearer tu_api_key'
```

**Respuesta (200):**
```json
{
  "data": [
    {
      "id": 12,
      "estado": "en_proceso",
      "paciente": "MOREIRA, CAROLINA LUCIA",
      "dni": "28456789",
      "medico": "Dr. Gonzalo Azategui",
      "matricula": "8288",
      "fechaReceta": "15/07/26",
      "nroReceta": "CFC-00234",
      "diagnostico": "Trastorno del sueño",
      "indicacion": "1 cápsula por la noche",
      "formula": [
        { "activo": "MELATONINA", "dosis": 1, "unidad": "mg" }
      ],
      "capas": [
        {
          "tinta": "Melatonina 1%",
          "concentracion": 0.01,
          "extrusionMl": 0.1,
          "ubicacion": "cuerpo",
          "lote": "FPI.01.PI013/P006"
        }
      ],
      "capsulasTotales": 90,
      "dias": 90,
      "loteNumero": 165,
      "fechaElab": "31/07/26",
      "fechaVto": "31/10/26",
      "enProduccion": false,
      "deadline": "2026-08-05",
      "operador": "Farm. Azategui",
      "createdAt": "2026-07-31T10:00:00.000Z",
      "updatedAt": "2026-07-31T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### GET /registros/{id}

Devuelve un registro de PT por ID numérico.

**Ejemplo:**
```bash
curl "https://tu-dominio/api/v1/registros/12" \
  -H 'Authorization: Bearer tu_api_key'
```

**Respuesta (200):**
```json
{ "data": { ...objeto Registro... } }
```

**Errores:** `400` ID no numérico · `404` no existe.

---

### GET /registros-pi

Lista registros de Producto Intermedio (PI / lotes de tinta).

**Query params opcionales:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `estado` | string | Exacto: `en_proceso` \| `terminado` |
| `tinta` | string | Búsqueda parcial, case-insensitive sobre nombre de tinta |
| `desde` | ISO 8601 | Registros creados desde esta fecha |
| `hasta` | ISO 8601 | Registros creados hasta esta fecha |

**Ejemplo:**
```bash
curl "https://tu-dominio/api/v1/registros-pi?tinta=melatonina&desde=2026-07-01" \
  -H 'Authorization: Bearer tu_api_key'
```

**Respuesta (200):**
```json
{
  "data": [
    {
      "id": 8,
      "estado": "terminado",
      "tintaId": 14,
      "tintaNombre": "MELATONINA",
      "nombreProducto": "TINTA DE MELATONINA",
      "poe": "FPI.01.PI013",
      "loteNumero": 6,
      "cantidadProductoG": 56.56,
      "jeringas": 5,
      "concentracion": 0.5,
      "materiasPrimas": [
        {
          "nombre": "Melatonina",
          "pureza": "99%",
          "lote": "MP-2026-044",
          "esPI": false,
          "cantidadTeorica": 28.28,
          "pesadaReal": "28.31"
        },
        {
          "nombre": "PEG 4000",
          "pureza": "100%",
          "lote": "MP-2026-011",
          "esPI": false,
          "cantidadTeorica": 28.28,
          "pesadaReal": "28.25"
        }
      ],
      "fechaElab": "31/07/26",
      "fechaVto": "31/10/26",
      "operador": "Farm. Azategui",
      "createdAt": "2026-07-31T09:30:00.000Z",
      "updatedAt": "2026-07-31T09:45:00.000Z"
    }
  ],
  "total": 1
}
```

---

### GET /registros-pi/{id}

Devuelve un registro de PI por ID numérico.

**Ejemplo:**
```bash
curl "https://tu-dominio/api/v1/registros-pi/8" \
  -H 'Authorization: Bearer tu_api_key'
```

**Respuesta (200):**
```json
{ "data": { ...objeto RegistroPi... } }
```

**Errores:** `400` ID no numérico · `404` no existe.

---

### GET /catalogos

Devuelve datos del catálogo maestro.

**Query param opcional:**

| Param | Valor | Comportamiento |
|-------|-------|---------------|
| `recurso` | `tintas` \| `medicos` \| `pacientes` \| `operadores` | Devuelve solo ese recurso con `{ data: [...], total: N }` |
| *(omitido)* | — | Devuelve los cuatro recursos en un objeto |

**Ejemplo — un recurso:**
```bash
curl "https://tu-dominio/api/v1/catalogos?recurso=tintas" \
  -H 'Authorization: Bearer tu_api_key'
```

**Respuesta (200):**
```json
{
  "data": [
    {
      "id": 14,
      "nombre": "MELATONINA",
      "keywords": "melatonina,sueño",
      "concentracion": 0.5,
      "ip": 1.2,
      "ubicacion": "cuerpo",
      "excipientes": [{ "nombre": "PEG 4000", "fraccion": 0.5 }],
      "alerta": "",
      "poe": "FPI.01.PI013",
      "activo": true
    }
  ],
  "total": 65
}
```

**Ejemplo — todos los recursos:**
```bash
curl "https://tu-dominio/api/v1/catalogos" \
  -H 'Authorization: Bearer tu_api_key'
```

**Respuesta (200):**
```json
{
  "data": {
    "tintas": [ ...array... ],
    "medicos": [ ...array... ],
    "pacientes": [ ...array... ],
    "operadores": [ ...array... ]
  }
}
```

---

## Referencia de campos

### Registro (PT)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | number | ID único del registro |
| `estado` | string | `en_proceso` \| `terminado` |
| `paciente` | string | Nombre completo del paciente |
| `dni` | string | DNI del paciente |
| `medico` | string | Nombre del médico |
| `matricula` | string | Matrícula profesional del médico |
| `fechaReceta` | string | Fecha de la receta (formato `DD/MM/YY`) |
| `nroReceta` | string | Número de receta CFC |
| `diagnostico` | string | Diagnóstico |
| `indicacion` | string | Indicación de uso |
| `formula` | array | Activos con `{ activo, dosis, unidad }` tal como vienen en la receta |
| `capas` | array | Capas de la cápsula con extrusión calculada (ver tipo `CapaTinta`) |
| `capsulasTotales` | number | Total de cápsulas del lote |
| `dias` | number | Días de tratamiento |
| `loteNumero` | number | Número correlativo del lote PT |
| `enProduccion` | boolean | `true` si está en la solapa "En producción" del taller |
| `deadline` | string | Fecha límite interna (no se imprime) |
| `fechaElab` | string | Fecha de elaboración (`DD/MM/YY`) |
| `fechaVto` | string | Fecha de vencimiento (`DD/MM/YY`) |
| `operador` | string | Nombre del operador responsable |
| `createdAt` | ISO 8601 | Timestamp de creación |
| `updatedAt` | ISO 8601 | Timestamp de última modificación |

### RegistroPi (PI)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | number | ID único del registro |
| `estado` | string | `en_proceso` \| `terminado` |
| `tintaId` | number | ID de la tinta en el catálogo |
| `tintaNombre` | string | Nombre del activo (ej: `MELATONINA`) |
| `nombreProducto` | string | Nombre legal del producto (ej: `TINTA DE MELATONINA`) |
| `poe` | string | Código POE (ej: `FPI.01.PI013`) |
| `loteNumero` | number | Número correlativo del lote por tinta |
| `cantidadProductoG` | number | Gramos totales producidos |
| `jeringas` | number | Jeringas de 10 mL llenadas |
| `concentracion` | number | Concentración del lote (decimal, ej: `0.5` = 50%) |
| `materiasPrimas` | array | Materias primas con `{ nombre, pureza, lote, esPI, cantidadTeorica, pesadaReal }` |
| `fechaElab` | string | Fecha de elaboración (`DD/MM/YY`) |
| `fechaVto` | string | Fecha de vencimiento (`DD/MM/YY`) |
| `operador` | string | Nombre del operador responsable |
| `createdAt` | ISO 8601 | Timestamp de creación |
| `updatedAt` | ISO 8601 | Timestamp de última modificación |

### Tinta (catálogo)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | number | ID único |
| `nombre` | string | Nombre de la tinta (ej: `MELATONINA`) |
| `keywords` | string | Palabras clave de mapeo desde la receta, separadas por coma |
| `concentracion` | number | Concentración del catálogo (decimal) |
| `ip` | number | Índice Palmieri (factor de corrección de extrusión) |
| `ubicacion` | string | `cuerpo` \| `tapa` |
| `excipientes` | array | `{ nombre, fraccion }` — fracción sobre el total de la tinta |
| `alerta` | string | Alerta química (vacío si no hay) |
| `poe` | string | Código POE de referencia |
| `activo` | boolean | `false` si la tinta está archivada |

---

## Errores comunes

| Código | Significado |
|--------|-------------|
| 400 | Parámetro inválido (ej: ID no numérico) |
| 401 | API Key inválida o ausente |
| 404 | Recurso no encontrado |
| 503 | `API_KEY` no configurada en el servidor |

---

## Notas

- **Solo lectura** — no hay endpoints de escritura en v1.
- **Sin paginación** — los endpoints devuelven todos los registros que cumplan los filtros. Usá `desde`/`hasta` para acotar volumen.
- **Campos JSON embebidos** — `capas` y `materiasPrimas` están anidados dentro del objeto principal, no hay endpoints separados para acceder a ellos.
- El campo `ip` en el catálogo de tintas es el **Índice Palmieri** (número decimal), no una dirección IP de red.
