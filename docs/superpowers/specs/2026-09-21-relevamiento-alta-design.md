# Relevamiento del cliente nuevo — datos para el alta en el ERP

**Fecha:** 2026-09-21
**Repos:** app-planificacion (front) + api-vendedores (dominio `planificacion`)
**Extiende:** `2026-09-17-visita-de-alta-cliente-nuevo-design.md`

## Problema

La visita de alta ("Cliente nuevo") guarda hoy tres datos del comercio — nombre, razón social,
dirección — y dos del cierre — con quién habló, cumpleaños. Cuando administración va a dar de
alta el cliente en el ERP, le falta casi todo: CUIT, condición de IVA, condición de pago,
localidad, teléfono, email, referencias para la cuenta corriente. Hoy eso se consigue a
posteriori por teléfono o queda sin cargar.

El objetivo es que el vendedor, **parado en el local**, recaude la mayor cantidad posible de
esa información, y que administración la tenga a mano al lado del ERP. Todo opcional: el local
puede no querer dar el CUIT, y bloquear al vendedor por un dato que no le dieron es peor que
un alta incompleta.

## Decisiones tomadas en el brainstorming

| Pregunta | Decisión | Por qué |
|---|---|---|
| ¿Dónde se carga? | Sheet propio `RelevamientoSheet`, no en crear la cita ni en el cierre | Nadie sabe el CUIT antes de ir; el pie del cierre no da para 16 campos |
| ¿Dónde se guarda? | `pl_rotacion_cliente.detalle` (JSON), no `pl_resolucion.detalle` | Son datos del **comercio**: no cambian entre intentos, y `pl_resolucion` es inmutable y se perdería al reintentar |
| IVA y condición de pago | Listas cerradas, tabla sembrada en la API | Texto libre se ensucia (`RI` / `R.I.` / `resp. inscripto`) y el ERP las consume directo |
| Segmentación | Texto libre | Decisión del usuario: la taxonomía (frenero, suspensionero, monomarca…) todavía no está cerrada |
| Valores de las listas | Placeholder inicial; administración los corrige | Por eso van en tabla y no hardcodeados: cambiarlos no despliega la app |
| "Contacto" y "Nombre del contacto" | Dos campos: la persona y cómo ubicarla | Aparecían duplicados en el pedido; el celular/WhatsApp del dueño es distinto del teléfono del local |
| ¿Algún campo obligatorio para cerrar? | Ninguno | El gate de cierre (`puedeCerrarAlta`) queda igual |
| Salida para administración | Pestaña `/analitica/altas` con detalle + export CSV | Sin salida el dato muere en un JSON que nadie abre |
| "Vendedor asignado" | Descartado como campo tipeable | Es la fila: la rotación es de un vendedor. Se muestra read-only en gerencia |

## Lo que ya existe y NO se toca

Estas cuatro piezas hacen que el costo sea bajo. Verificado en código, no asumido:

- **`pl_rotacion_cliente.detalle` es `JSON NULL`** (`planificacion-ciclo-tables.sql:173`). Cero DDL.
- **`AltasService.editar`** mergea con spread (`{ ...fila.detalle, ...dto.detalle }`) y su ventana de
  permiso ya es la correcta: se edita con la fila pendiente **o la visita abierta**, y rebota
  `FILA_RESUELTA` recién con `fechaFin` seteado. El vendedor releva adentro del local y al cerrar
  queda congelado.
- **`AltasService.reintentar`** copia `fila.detalle` entero a la fila nueva → el relevamiento
  sobrevive a un "No visité".
- **`AgendaService.ts:232`** devuelve `fila.detalle` tal cual en `detalleAlta` → el card del
  vendedor ya trae los campos nuevos sin cambios.
- El controller de `POST/PUT /altas` pasa el body entero al normalizador; no enumera campos.
- `pl_resolucion.detalle` sigue siendo `{ contacto, fechaNacimiento }`: "con quién hablaste
  **esta** vez". Convive con `contactoNombre` del comercio (ver precarga más abajo).

## 1 · Modelo de datos

`IDetalleAlta` pasa de 3 a 16 claves. Todas `string | null` salvo `nombre` (`string`, único
obligatorio — ya lo era).

| Sección | Clave | Tipo | Máx | Notas |
|---|---|---|---|---|
| Identidad | `nombre` | texto | 120 | existente, obligatorio |
| | `razonSocial` | texto | 120 | existente |
| | `cuit` | cuit | 13 | dígitos y guiones; **sin** dígito verificador |
| Ubicación | `direccion` | texto | 200 | existente |
| | `localidad` | texto | 120 | |
| Contacto | `telefono` | texto | 40 | del local |
| | `email` | email | 120 | formato laxo: `algo@algo.algo` |
| | `contactoNombre` | texto | 80 | la persona (dueño, encargado) |
| | `contactoMedio` | texto | 60 | celular / WhatsApp de esa persona |
| Comercial | `condicionIva` | catálogo `iva` | — | código de `pl_catalogo_alta` |
| | `condicionPago` | catálogo `pago` | — | código de `pl_catalogo_alta` |
| | `segmentacion` | texto | 200 | libre (decisión del usuario) |
| Cta. corriente | `datosBancarios` | texto largo | 300 | "datos del banco BCRA" |
| | `referencias` | texto largo | 300 | referencias comerciales |
| Notas | `datoDeColor` | texto largo | 300 | |

Reglas:

- `cuit` se valida **laxo** a propósito: un CUIT mal tipeado que el ERP rechaza es mejor que un
  vendedor trabado en la vereda inventando uno que pase el verificador.
- Un código de catálogo que no existe o está inactivo → 400 `ALTA_CATALOGO_INVALIDO`. Un valor
  guardado que después se da de baja **se sigue mostrando** (el front lo resuelve por código
  contra el catálogo completo, activos e inactivos).
- **Precarga del cierre:** en `VisitaSheet`, si `detalleAlta.contactoNombre` está cargado y el
  campo "Con quién hablaste" está vacío, se precarga con él. Editable. Evita tipear dos veces sin
  fusionar dos conceptos distintos.
- Las claves ausentes en un JSON viejo se leen como `null`. Ningún fixture ni payload viejo se
  rompe: los tres campos existentes conservan nombre y forma.

### `pl_catalogo_alta`

```sql
CREATE TABLE IF NOT EXISTS pl_catalogo_alta (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo         VARCHAR(20)  NOT NULL,   -- 'iva' | 'pago'
  codigo       VARCHAR(30)  NOT NULL,
  descripcion  VARCHAR(80)  NOT NULL,
  orden        TINYINT      NOT NULL DEFAULT 0,
  activo       TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_catalogo_alta (tipo, codigo)
);
```

Sembrada con `INSERT IGNORE`, idempotente, **segura para prod** (a diferencia de
`planificacion-catalogo-ofrecimiento.sql`, que es solo dev). Baja lógica con `activo = 0`, nunca
`DELETE`: hay JSONs que referencian el código. Valores iniciales (placeholder, administración
corrige):

- `iva`: `RI` Responsable Inscripto · `MONO` Monotributo · `EXENTO` Exento · `CF` Consumidor
  Final · `NR` No Responsable
- `pago`: `CONTADO` Contado · `CTA_CTE` Cuenta corriente · `CHEQUE` Cheque · `TRANSFERENCIA`
  Transferencia

Vive en `docs/db-notes/planificacion-catalogo-alta.sql` de api-vendedores, con el mismo encabezado
de advertencias que los demás scripts (`SELECT DATABASE()` antes, sin `USE`).

## 2 · Backend (api-vendedores)

### `altaDetalle.ts` → registro declarativo

Hoy: un bloque de `if` por campo (3 campos, ~40 líneas, 6 códigos de error). Con 16 campos eso
no escala. Pasa a:

```ts
export const CAMPOS_ALTA = [
    { clave: 'nombre',        tipo: 'texto',    max: 120, requerido: true },
    { clave: 'razonSocial',   tipo: 'texto',    max: 120 },
    { clave: 'cuit',          tipo: 'cuit',     max: 13 },
    // ...
    { clave: 'condicionIva',  tipo: 'catalogo', catalogo: 'iva' },
    { clave: 'condicionPago', tipo: 'catalogo', catalogo: 'pago' },
] as const satisfies readonly CampoAlta[]
```

y un único loop que normaliza (`''` → `null`, trim), valida por tipo y arma el resultado. Se
**conservan** los códigos existentes (`ALTA_SIN_NOMBRE`, `ALTA_NOMBRE_MUY_LARGO`,
`ALTA_RAZON_SOCIAL_MUY_LARGA`, `ALTA_DIRECCION_MUY_LARGA`, `ALTA_DETALLE_INVALIDO`) — no hay
evidencia de que el front los lea, pero tampoco cuesta nada. Los campos nuevos usan
`ALTA_<CLAVE>_MUY_LARGO`, `ALTA_CUIT_INVALIDO`, `ALTA_EMAIL_INVALIDO`, `ALTA_CATALOGO_INVALIDO`.

La validación de catálogo necesita leer `pl_catalogo_alta`: `normalizarDetalleAlta` pasa a recibir
el set de códigos activos por tipo (lo carga `AltasService` una vez por request), para que la
función siga siendo pura y testeable sin base.

`DETALLE_ALTA_VACIO` (todas las claves en `null` salvo `nombre: ''`) reemplaza el literal de
`AltasService.editar:43`. Único cambio en el servicio.

### Endpoints

| Método | Ruta | Auth | Cambio |
|---|---|---|---|
| `GET` | `/planificacion/altas/catalogos` | `authMiddleware` (cualquier rol) | **nuevo**: `{ iva: ICatalogoAltaItem[], pago: [...] }`, activos e inactivos con flag — el front filtra activos para el select y usa todos para mostrar |
| `PUT` | `/planificacion/altas/:id` | vendedor | sin cambio de contrato; acepta las claves nuevas |
| `POST` | `/planificacion/altas` | vendedor | sin cambio de contrato; sigue aceptando solo lo básico (el front manda nombre/razón social/dirección) |
| `GET` | `/planificacion/analitica/altas?desde&hasta&vendedores` | `...authorizeSupervisor` | **nuevo** (sección 4) |

`ICatalogoAltaItem = { codigo, descripcion, orden, activo }`.

### Cromo

`prefijoAlta` **no cambia**: sigue con nombre + razón social + dirección. Meter 16 campos en la
narrativa la vuelve ilegible, y la salida real para administración es el CSV, no Cromo.

### Vendedor de prueba

`GET /analitica/altas` usa `fragmentoVendedores` de `AnaliticaRepository` como el resto de las
consultas de analítica: las altas del `PRUEBA-*` no salen en el reporte de gerencia ni en el CSV.

## 3 · Front del vendedor (app-planificacion)

### `RelevamientoSheet` (nuevo)

`src/components/RelevamientoSheet.tsx`. `BottomSheet altura="completa"` con scroll interno.
Seis secciones con el encabezado en el mismo `LABEL` que usa `ClienteNuevoSheet` (uppercase 9.5px
muted), en este orden: Identidad · Ubicación · Contacto · Comercial · Cuenta corriente · Notas.

- Los `select` de IVA y pago se alimentan de `useCatalogosAlta()` (`GET /altas/catalogos`,
  `staleTime` largo — cambia una vez al año). Con el catálogo en vuelo o fallado, los dos selects
  se muestran deshabilitados con "Cargando…" y **el resto del formulario sigue operativo**: un
  catálogo caído no bloquea cargar el CUIT.
- Los tres campos "largos" (`datosBancarios`, `referencias`, `datoDeColor`) son `textarea rows={2}`
  con contador `n/300`, mismo patrón que observaciones en `VisitaSheet`.
- Un solo guardado explícito al confirmar (botón "Guardar", `bg-dsgreen`, igual que
  `ClienteNuevoSheet`). Sin autosave: es el patrón del repo. El diff `estado vs. detalleAlta`
  sale del mismo registro `CAMPOS_ALTA` del front (`src/lib/camposAlta.ts`), no de un `if` por
  campo — es el bug latente que ya tiene comentado `ClienteNuevoSheet.confirmar`.
- Error de guardado → `onAviso('error', 'No se pudieron guardar los datos. Volvé a intentar.')`, el
  sheet queda abierto con lo tipeado.
- Vocabulario del vendedor: título **"Datos del comercio"**, nunca "relevamiento", "alta" ni
  "prospecto". `RelevamientoSheet` es el nombre del archivo, no un texto visible.
- El eyebrow muestra cuántos campos tiene cargados: `7 de 16 datos` — es el único feedback de
  progreso, y es el mismo número que gerencia ve como "% completo".

### Puntos de entrada

1. **Card del cliente nuevo, `pendiente`** (`ClienteCard.tsx:169`): el botón "Editar" existente
   pasa a abrir `RelevamientoSheet`. Mismo lugar, mismo estilo `HEADER_WITH_LABEL`; el texto pasa
   a **"Datos"**.
2. **`VisitaSheet` con la visita abierta y `esAlta`**: botón "Datos" en la **línea de identidad
   del header**, al lado de "No visité" — con el estilo de `ChipDescuentos` (es de
   consulta/edición, no la salida negativa). **No va detrás de un menú `⋯`**: el repo ya probó y
   descartó menús ahí (ver comentario en `VisitaSheet.tsx:439`), y de hecho `VisitaSheet` no
   tiene ningún menú — la nota de CLAUDE.md que dice "menú `⋯`" está desactualizada. Con la visita
   **cerrada** el botón no se muestra: el backend rebota `FILA_RESUELTA` y no hay nada que editar.

### `ClienteNuevoSheet`

- Modo `crear`: **intacto**. Agendar sigue siendo nombre + día, tres toques.
- Modo `editar`: **se elimina** — `AgendaSemanaPage.tsx:590` pasa a abrir `RelevamientoSheet`.
  No quedan dos formularios para los mismos datos. `ModoClienteNuevo` pierde la variante
  `'editar'`; `useEditarAlta` se conserva y lo consume el sheet nuevo.
- Modo `reintentar`: intacto.

### Cierre de la visita

`VisitaSheet`: precarga de "Con quién hablaste" con `detalleAlta.contactoNombre` (ver sección 1).
El gate `puedeCerrarAlta` **no cambia**.

## 4 · Gerencia: `/analitica/altas`

Pestaña nueva **"Altas"** en `AnaliticaTabs`, después de "Ruta". Protegida por `supervisa`
(capacidad `superviseVendedores` **existente**: es el mismo grupo que ya ve `/analitica`, así que
no hace falta una capacidad nueva).

### Endpoint

`GET /planificacion/analitica/altas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&vendedores=V1,V2`

Devuelve una fila por fila del plan `tipo='alta'` cuya rotación tenga alguna semana en el rango
(mismo criterio de rango que el resto de analítica), con:

```ts
interface IAltaRelevada {
    rotacionClienteId: number
    vendedor: { codigo: string; nombre: string }
    creadaEl: string            // ISO, de pl_rotacion_cliente
    estado: EstadoCicloCliente  // pendiente | en_curso | visitada | no_visita
    fechaVisita: string | null  // fecha de negocio de la resolución, si la hay
    detalle: IDetalleAlta
    contacto: IDetalleContactoAlta | null   // de pl_resolucion.detalle
    camposCargados: number      // de 16, calculado en el back con CAMPOS_ALTA
}
```

Un comercio con dos filas (un "No visité" y su reintento) aparece **dos veces**: son dos filas
del plan, y el segundo intento es el que administración quiere. No se deduplica por nombre.

### Pantalla

- Filtros: los mismos de `/analitica` (rango + vendedores), reusando su componente.
- Tabla: Comercio · Localidad · Vendedor · Estado · Fecha · Completo (`7/16`). Ordenada por
  `creadaEl` desc.
- Tocar una fila abre un panel de detalle (drawer lateral en desktop, `BottomSheet` en mobile —
  la pantalla de gerencia es desktop-first pero `/analitica` ya se adapta) con **todos** los
  campos en las mismas seis secciones del sheet del vendedor, vacíos incluidos ("—"), más el
  contacto del cierre. Solo lectura: `pl_rotacion_cliente.detalle` se congela al cerrar y
  gerencia no edita datos del vendedor.
- Botón **"Exportar CSV"**: genera en el front desde el mismo payload filtrado. `src/lib/csv.ts`
  nuevo (no hay ningún CSV en el repo hoy): escapado RFC 4180, separador `;` y BOM UTF-8 para que
  Excel en español lo abra bien de un doble click. Una fila por alta, columnas: las 16 de
  `IDetalleAlta` con sus etiquetas humanas + vendedor, estado, fecha, contacto del cierre. Los
  códigos de catálogo salen como **descripción** (`Responsable Inscripto`, no `RI`).
  Nombre: `altas-YYYY-MM-DD.csv`.

## Testing

**Backend**
- `altaDetalle.spec.ts`: por cada tipo del registro un caso de largo, uno de formato inválido, uno
  de `''` → `null`; catálogo inexistente → `ALTA_CATALOGO_INVALIDO`; los 5 códigos viejos siguen
  saliendo iguales; un body con solo `{ cuit }` en modo edición devuelve solo `{ cuit }`.
- `AltasService.spec.ts`: `editar` mergea claves nuevas sobre un JSON viejo de 3 claves;
  `reintentar` copia las 16.
- `AnaliticaService.spec.ts`: `getAltas` excluye `PRUEBA-*`, calcula `camposCargados`, incluye
  las dos filas de un reintento.

**Front**
- `camposAlta.test.ts`: el diff devuelve solo las claves que cambiaron; `''` vs `null` no cuenta
  como cambio.
- `RelevamientoSheet.test.tsx`: precarga desde `detalleAlta`; guarda solo el diff; catálogo fallado
  deja el resto operativo; contador `n de 16`.
- `VisitaSheet.test.tsx`: botón "Datos" solo con `esAlta` y visita abierta; precarga de "Con quién
  hablaste" no pisa lo ya tipeado.
- `csv.test.ts`: escapado de `;`, comillas y saltos de línea; BOM presente; catálogo resuelto a
  descripción.
- `AnaliticaTabs.test.tsx`: la pestaña Altas apunta a `/analitica/altas`.

## Fuera de alcance

- Validar el dígito verificador del CUIT.
- Autosave / borrador local del relevamiento (el vendedor guarda explícito; si se pide, es el mismo
  patrón `visita-*` de `sesionLocal.ts`).
- Editar el relevamiento desde gerencia.
- Mandar el relevamiento completo a Cromo.
- Convertir la fila de alta en cliente real cuando el ERP lo da de alta (hoy la asignación cliente
  → semana la carga otra área; no es de este proyecto).
- Taxonomía cerrada de segmentación: cuando exista, `segmentacion` pasa a `tipo: 'catalogo'` en el
  registro y se agrega el tipo `'segmento'` a `pl_catalogo_alta`. Los textos libres ya cargados se
  conservan como están.

## Estimación

| Parte | Tiempo |
|---|---|
| Backend: registro declarativo + catálogo + `GET /altas/catalogos` + `GET /analitica/altas` + tests | ~6 h |
| Front vendedor: `RelevamientoSheet` + `camposAlta.ts` + entradas + precarga + tests | ~6 h |
| Front gerencia: pestaña + tabla + panel + CSV + tests | ~5 h |
| **Total** | **~2,5 días** |

## Actualizaciones de documentación viva

- `CLAUDE.md` (app-planificacion): la nota de "Cliente nuevo" pasa a mencionar el relevamiento y
  `RelevamientoSheet`; corregir la referencia al "menú `⋯` de `VisitaSheet`" en la nota de
  "No visité" — ese menú no existe, es un botón en la línea de identidad del header.
- `docs/dominio/modelo.md`, sección "La visita de alta": `detalle` ya no son tres claves.
- `docs/dominio/tablas.md`: alta de `pl_catalogo_alta`.
- `docs/db-notes/planificacion-ciclo-tables.sql` (api-vendedores): comentario de la columna
  `detalle` de `pl_rotacion_cliente`, y la tabla nueva.
