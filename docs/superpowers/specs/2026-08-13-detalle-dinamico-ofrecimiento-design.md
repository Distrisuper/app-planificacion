# El detalle dinámico del ofrecimiento: tramos de Cupo y el registro por código de acción

**Fecha:** 2026-08-13
**Estado:** diseño aprobado, pendiente de plan de implementación
**Alcance:** api-vendedores (rama `MatiasH11/impl-ofrecimiento-backend`) + app-planificacion (rama
`spec/item-ofrecido-generico`)

Continúa a [`2026-08-12-item-ofrecido-generico-design.md`](2026-08-12-item-ofrecido-generico-design.md),
que dejó la columna `detalle` creada pero sin contrato de claves, a propósito: *"se define cuando
aparezca el primer caso real, con ese caso a la vista"*. Este documento es ese primer caso.

---

## El problema

Hoy un ofrecimiento `tipo: 'accion'` no tiene forma de cargar los parámetros propios de la oferta.
"Plan cupo" se agrega desde `AgregarOfrecimientoSheet` con nombre y alcance, pero el número que
importa —cuánto descuento si el cliente llega a determinado monto— no tiene dónde vivir. La columna
`pl_ofrecimiento.detalle JSON NULL` existe desde la migración anterior, pero:

- Ningún DTO la declara (`IAgregarOfrecimientoDTO`, `IOfrecimiento`, ninguno de los dos repos).
- Ningún endpoint la lee ni la escribe (`OfrecimientoRepository.crearFueraDePropuesta` arma el insert
  sin esa clave; el mapper de respuesta `adjuntarMotivos` no la selecciona).
- Ninguna validación la toca (`ofrecimientoValidation.ts` valida `tipo`/`alcance`/duplicados, nunca
  `detalle`).

**Evidencia real** (`scripts/scripts/out/seguimientos.json`, actualizado a 14 vendedores / 801 notas
de Cromo):

- Cupo es casi siempre un valor **compuesto**, no un número suelto: *"CUPO 2.5M 3% 3.2M 5%"*,
  *"cupo 1M 5%"*, *"CUPO 5.5M 3% 7M 5%"* — entre 1 y 2 tramos (umbral → % descuento), variable.
- Otros patrones aparecen, pero **desprolijos y sin forma clara todavía**: descuento fijo por
  marca/línea ("Dto x marca 15%"), plazo de pago ("30 60 90", "180 días", "echeq") y pronto pago
  **casi siempre combinado con plazo** ("plazo 30 60 90 con el 25% de pronto pago" — no es una
  condición aislada), más flete gratis/pago, que no habíamos anticipado.
- El catálogo real sembrado en `pl_accion` es `CUPO`, `DESCUENTO`, `PROMO`, `COBRANZA` — no
  "vencimiento" como se había supuesto en la conversación previa a revisar el catálogo.

Un input numérico único (lo que hay hoy en cualquier flujo de detalle de motivo, ej. `pctDiferencia`
en `ResolucionOfrecimiento.tsx`) no alcanza para tramos, y construir un formulario a mano por cada
tipo de acción, cableado directo en `AgregarOfrecimientoSheet`, no escala: el mismo `if` tendría que
repetirse en la tabla (para el resumen) y en cualquier validación.

## La decisión

Se define la forma de `detalle` para **Cupo únicamente** (`{ tramos: [{ umbral, descuentoPct }] }`),
y se construye un **mecanismo genérico** —un registro de módulos por código de acción— para que
sumar Descuento, Promo o Cobranza más adelante sea un archivo nuevo + una entrada en el registro,
sin volver a tocar `AgregarOfrecimientoSheet.tsx`, `OfrecimientoTable.tsx` ni la validación del
service.

**Descuento, Promo y Cobranza quedan explícitamente sin diseñar en esta vuelta.** La evidencia de
Cromo muestra que son más desprolijos de lo que parecía a primera vista (pronto pago casi nunca
aislado, plazo con formatos dispares, flete como categoría aparte no contemplada) — diseñar su
`detalle` a ciegas ahora tiene alta chance de rehacerse cuando aparezca el primer caso real armado
en el catálogo. Mismo criterio que ya usó el spec anterior para diferir el contrato completo.

### Enfoques evaluados para el mecanismo

- **A. `if` inline por código, cableado en cada componente que lo necesita.** Simple hoy (un solo
  caso), pero el mismo condicional se repetiría en `AgregarOfrecimientoSheet` (para el editor) y en
  `OfrecimientoTable` (para el resumen) — dos lugares que memorizar, no uno.
- **B. Librería de formularios dinámicos por JSON Schema** (react-jsonschema-form, uniforms,
  JSONForms). Están hechas para esquemas arbitrarios y anidados; reproducir el diseño mobile actual
  (fila de una línea, Tailwind/shadcn) exige reemplazar sus templates de array/objeto/error uno por
  uno — más trabajo de theming que de construir el editor de tramos directo, para un catálogo de
  ~4 acciones conocidas, no un esquema abierto.
- **C. Registro de módulos por código de acción, cada uno con su propio componente pequeño.**
  Elegido. Mismo patrón que ya usa el proyecto para despachar por `tipo` (`TIPO_LABEL`, los
  pickers). Cero dependencia nueva, control total del diseño visual, y el costo de sumar un tipo
  nuevo es proporcional a lo que ese tipo necesita, no a aprender una librería ajena.

**Los tramos quedan fijos una vez cargados en el alta.** No hay edición retroactiva desde la tabla
ni desde el wizard de Resolución — si el vendedor se equivocó, quita el ofrecimiento (ya existe ese
botón) y lo vuelve a agregar. Coherente con el resto del dominio: nada en el wizard de Resolución es
editable retroactivamente tampoco.

---

## Forma de datos

### Backend (`api-vendedores`)

```ts
// src/types/planificacion.ts
interface IAgregarOfrecimientoDTO {
    tipo: 'rubro' | 'marca' | 'linea' | 'articulo' | 'accion'
    codigo: string
    descripcion: string
    alcance?: IAlcanceDTO[]
    detalle?: unknown          // NUEVO — opaco a este nivel, cada validador de accion sabe su forma
}

interface IOfrecimiento {
    // ...campos existentes
    detalle?: unknown          // NUEVO
}
```

`detalle` se mantiene `unknown` en los tipos genéricos a propósito: el tipo concreto
(`IDetalleCupo`) solo lo conoce el validador de Cupo, igual que en el frontend solo lo conoce su
módulo del registro. Generalizar el tipo del DTO cada vez que se suma una acción sería el mismo
problema que este documento evita en el mecanismo.

### Frontend (`app-planificacion`)

```ts
// src/types/planificacion.ts — mismo agregado espejado
interface IAgregarOfrecimientoDTO {
    tipo: TipoOfrecimiento
    codigo: string
    descripcion: string
    alcance?: IAlcance[]
    detalle?: unknown          // NUEVO
}

interface IOfrecimiento {
    // ...campos existentes
    detalle?: unknown          // NUEVO
}
```

```ts
// src/components/propuesta/filas.ts
export interface IOfrecimientoFila {
    // ...campos existentes
    detalle?: unknown          // NUEVO — copiado de IOfrecimiento en construirFilasVisita
}
```

### Forma concreta de Cupo

```ts
// src/components/propuesta/accionDetalle/cupo.tsx
interface ICupoDetalle {
    tramos: { umbral: number; descuentoPct: number }[]
}
```

Un tramo es válido con `umbral > 0` y `descuentoPct > 0`. `ICupoDetalle` completo es válido con al
menos un tramo, todos válidos. Sin cota superior de tramos (en la práctica son 1 o 2, según la
evidencia de Cromo, pero no hay motivo para bloquear un tercero).

---

## El registro (mecanismo genérico)

### Frontend — `src/components/propuesta/accionDetalle/`

```ts
// registro.ts
interface IModuloDetalleAccion<T = unknown> {
    Editor: ComponentType<{ value: T | undefined; onChange: (v: T) => void }>
    resumen: (detalle: T) => string
    esValido: (detalle: T | undefined) => boolean
}

const registroDetalleAccion: Record<string, IModuloDetalleAccion> = {
    CUPO: moduloCupo,
}
```

- `cupo.tsx` exporta `ICupoDetalle`, `EditorCupo` (lista de tramos con "+ Agregar tramo" / ✕ por
  fila), `resumenCupo` (ej. `"$2.500.000→3% · $3.200.000→5%"`), `esValidoCupo`.
- Dos consumidores, ninguno conoce a Cupo por nombre:
  - `AgregarOfrecimientoSheet.tsx`: si `tipo === 'accion'` y hay entrada en el registro para
    `elegido.code`, renderiza su `Editor` después de `AlcancePicker`; el botón "Agregar" exige
    `esValido(detalle)` además de `!!elegido`; `cambiarTipo` resetea `detalle` igual que ya resetea
    `elegido`/`alcance`; el DTO incluye `detalle` solo si el registro tiene módulo para ese código.
  - `OfrecimientoTable.tsx` (`ContenidoFila`): si `fila.detalle != null` y hay módulo para
    `fila.codigo`, agrega una línea con `resumen(fila.detalle)` junto a la línea de alcance
    existente.

### Backend — `src/services/planificacion/accionDetalleValidators.ts`

```ts
const accionDetalleValidators: Record<string, (detalle: unknown) => boolean> = {
    CUPO: validarDetalleCupo,
}
```

Mismas claves que el frontend, pero la responsabilidad es distinta: acá `detalle` puede venir de
cualquier cliente, no solo de esta UI, así que `validarDetalleCupo` valida **forma completa** (es
objeto, `tramos` es array no vacío, cada ítem tiene `umbral`/`descuentoPct` numéricos y positivos),
no solo la regla de negocio que ya validó el frontend. `ofrecimientoValidation.ts`
(`validarOfrecimientoNuevo`) corre el validador correspondiente cuando `tipo === 'accion'` y hay uno
registrado para el código; si falla, rechaza el alta con `DETALLE_INVALIDO`.

**`detalle` con `tipo !== 'accion'`: se ignora, no se rechaza.** `detalle` conceptualmente solo
aplica a `accion` — rubro/marca/línea/artículo son ítems de catálogo ofrecidos tal cual, su
resultado vive en `pl_ofrecimiento_motivo`, no en parámetros propios de la oferta. Se evaluó y
verificó contra `seguimientos.json`: los casos de marca/rubro con un % pegado directo sin la
palabra "cupo"/"acción" (ej. *"Ofrezco Nakata 3% JH Mazas"*) resultan ser el mismo caso de
acción-con-alcance sin etiquetar por el vendedor (hay ejemplos casi idénticos que sí dicen
"accion" explícito), no un tercer concepto — y las menciones de "X% más barato que la competencia"
son comparación de precio, ya cubierta por `pctDiferencia`/`competidor` del motivo "Precio". No hay
evidencia de que rubro/marca necesiten su propio `detalle`.

Dicho eso, **no se rechaza la request si de todos modos llega `detalle` con otro `tipo`** (ej. un
cliente futuro, o un bug en otra pantalla): `crearFueraDePropuesta` solo persiste `detalle` cuando
`tipo === 'accion'`, y lo descarta en silencio en cualquier otro caso — la fila queda con
`detalle: null`, sin fallar el alta completa por un campo que no le correspondía.

---

## Puntos de integración

### Frontend

| Archivo | Cambio |
|---|---|
| `src/types/planificacion.ts` | `detalle?: unknown` en `IAgregarOfrecimientoDTO` e `IOfrecimiento` |
| `src/components/propuesta/filas.ts` | `IOfrecimientoFila.detalle`; copiado en `construirFilasVisita` |
| `src/components/propuesta/accionDetalle/registro.ts` **(nuevo)** | `IModuloDetalleAccion` + registro |
| `src/components/propuesta/accionDetalle/cupo.tsx` **(nuevo)** | `ICupoDetalle`, `EditorCupo`, `resumenCupo`, `esValidoCupo` |
| `AgregarOfrecimientoSheet.tsx` | estado `detalle`; render condicional del `Editor`; validación en "Agregar"; DTO |
| `OfrecimientoTable.tsx` (`ContenidoFila`) | línea de resumen cuando hay `detalle` + módulo |

### Backend

| Archivo | Cambio |
|---|---|
| `src/types/planificacion.ts` | mismo agregado espejado |
| `src/services/planificacion/accionDetalleValidators.ts` **(nuevo)** | registro de validadores + `validarDetalleCupo` |
| `src/services/planificacion/ofrecimientoValidation.ts` (`validarOfrecimientoNuevo`) | corre el validador si `tipo==='accion'` y hay uno registrado; rechaza con `DETALLE_INVALIDO` |
| `src/repositories/OfrecimientoRepository.ts` (`crearFueraDePropuesta`) | el insert suma `detalle: tipo === 'accion' ? (dto.detalle ?? null) : null` — se ignora en silencio si el tipo no es `accion` |
| `src/repositories/OfrecimientoRepository.ts` (`adjuntarMotivos`) | el mapper de respuesta selecciona y devuelve `detalle` |

No toca `pl_ofrecimiento_alcance` ni su mecanismo — son ortogonales (alcance = a qué aplica;
detalle = con qué términos).

---

## Testing

**Frontend**
- `cupo.test.tsx` (nuevo): `resumenCupo` formatea 1 y 2 tramos; `esValidoCupo` rechaza array vacío,
  tramo sin umbral, `descuentoPct` cero o negativo; `EditorCupo` agrega/quita tramos y dispara
  `onChange` con la forma correcta.
- `AgregarOfrecimientoSheet.test.tsx` (ampliar): elegir "Plan cupo" muestra el editor; "Agregar"
  deshabilitado con tramos incompletos, habilitado al completarlos; confirmar manda `detalle` en el
  DTO; cambiar de tipo descarta los tramos cargados.
- `OfrecimientoTable.test.tsx` (ampliar): fila con `detalle` de Cupo muestra el resumen; fila con
  `detalle` pero código sin módulo registrado no rompe y no muestra nada.

**Backend**
- `accionDetalleValidators.spec.ts` (nuevo): `validarDetalleCupo` acepta forma válida, rechaza
  objeto sin `tramos`, `tramos` vacío, tramo con campos no numéricos o negativos.
- `ofrecimientoValidation.spec.ts` (ampliar): alta de `CUPO` con `detalle` inválido devuelve
  `DETALLE_INVALIDO`; con `detalle` válido pasa.
- Service/repo spec (ampliar): crear un ofrecimiento con `detalle` y volver a leerlo (round-trip
  create→GET) devuelve el mismo JSON; crear un ofrecimiento `tipo: 'rubro'` con `detalle` presente
  en el body persiste con `detalle: null` (se ignora, no falla el alta).

---

## Fuera de alcance

- Diseñar la forma de `detalle` para `DESCUENTO`, `PROMO` o `COBRANZA` — quedan anotados con la
  evidencia de esta vuelta (jerga, formatos dispares, pronto pago casi siempre compuesto con plazo,
  flete como categoría no contemplada) para cuando se aborden con un caso real del catálogo.
- Editar los tramos de Cupo después del alta.
- Envío a Cromo / narrativa automática de seguimiento: **no existe ningún `buildSeguimientoDescripcion`
  ni equivalente en `api-vendedores` hoy** (a diferencia de lo que sugiere `CLAUDE.md` de
  app-planificacion) — ese enganche queda totalmente fuera de esta vuelta y de este documento.
- Mostrar o editar `detalle` desde el wizard de Resolución (solo lectura del resumen en la tabla).
- Un campo de esquema declarado por fila del catálogo `pl_accion` (ej. `formaDetalle`) que
  generalice "qué campos pide esta acción" — mencionado como intención en el spec anterior, sigue
  sin construirse; el registro de esta vuelta es código, no dato de catálogo.
