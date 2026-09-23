# El catálogo de la ficha lo dibuja la base, no el front

Fecha: 2026-09-22
Estado: diseñado.
Continúa [`2026-09-22-relevamiento-datos-del-comercio-design.md`](2026-09-22-relevamiento-datos-del-comercio-design.md)
y el tipado del catálogo que lo acompañó en api-vendedores.

## 1. El problema: la costura está hecha a medias

El backend **ya es dirigido por el catálogo**: `pl_ficha_campo` declara `tipo`, `opciones`,
`minimo`/`maximo`, y la validación del `PUT` lee eso. Una opción nueva en la base se acepta sin
tocar código.

El front **no**. No existe ningún endpoint que exponga el catálogo —el único de ficha es el
`PUT`— y la card de la agenda trae `ficha: { pendientes, valores }`: qué falta y qué hay
cargado, nunca qué opciones existen. Los controles se dibujan desde una copia a mano en
`src/lib/relevamientos.ts`.

La prueba es el trabajo del propio 2026-09-22: las siete especialidades de la taxonomía del ERP
se agregaron **dos veces**, una en el `UPDATE` del catálogo y otra a mano en `relevamientos.ts`.
Dos lugares, el mismo dato, y nada que avise cuando divergen.

Y hay una pista de que esto estaba pensado para cerrarse: cada opción del catálogo guarda
**`label`** —"lo que ve el vendedor"— y hoy **nadie lo lee**. Ese campo existe para que el front
dibuje desde ahí.

El disparador concreto: Monomarca deja de ser texto libre y pasa a ser una lista (Fiat, Toyota,
Ford, Peugeot, Renault, Volkswagen) más un "Otros" con texto. Hacerlo con una lista más en el
front consagraría la duplicación justo en el momento en que se vuelve visible.

## 2. El endpoint

`GET /planificacion/ficha/campos` — el catálogo entero, **global** (no por cliente). Se cachea
con `staleTime` largo: cambia una vez cada muchos meses.

```json
[{ "campo": "especialidad", "descripcion": "Especialidad del comercio",
   "tipo": "opcion", "obligatorio": true, "multiple": true, "orden": 1,
   "minimo": null, "maximo": null,
   "opciones": [{ "codigo": "frenos", "label": "Frenos" }, … ] }]
```

**`etiquetaErp` y `codigo_erp` no salen al front.** Son el contrato con el cron que sincroniza al
ERP; el vendedor no tiene nada que hacer con ellos, y exponerlos invita a que alguna pantalla los
empiece a usar desde el lado equivocado.

## 3. "Otros" es una opción más, con una marca

En el JSON de `opciones`: `{ "codigo": "otros", "label": "Otros", "abierta": true }`.
**Cero cambios de esquema** — `opciones` ya es `JSON`.

- **El front**, al ver `abierta`, dibuja el chip y, si lo eligen, el input de texto libre.
- **La validación** acepta un valor fuera de la lista **sólo** en campos que tengan una opción
  abierta, y lo valida como texto contra `minimo`/`maximo` (o `VALOR_MAX_LARGO` si no están). Un
  campo sin opción abierta sigue siendo estricto.
- **Se guarda el texto real, no el código `otros`.** Si el vendedor escribe `Chery`, en
  `pl_ficha_valor` queda `Chery`. El `GROUP BY` de gerencia muestra la marca, no un cajón de
  sastre con todo adentro.
- **Al reabrir para editar**, un valor vigente que no matchea ningún `codigo` se lee como
  "Otros" + ese texto. Sin ambigüedad mientras ningún `label` coincida con lo tipeado, que es la
  única colisión posible y es benigna (elegiría el chip, que es lo mismo que quiso decir).

## 4. El sheet dibuja desde el catálogo

Cuatro casos, con los controles que **ya existen**. No es un motor de schemas: es un `switch`
sobre `tipo`.

| catálogo | control |
|---|---|
| `opcion` + `multiple` | chips (hoy: especialidad) |
| `opcion` sin `multiple` | segmented (hoy: facturación) |
| `entero` | stepper, con `minimo`/`maximo` del catálogo |
| `texto` | input, `maxLength` = `maximo` |

El orden de pantalla es el `orden` del catálogo.

**Falta un dato para que el segmented no se rompa.** Facturación usa hoy un `labelCorto`
(`+30M`) porque cinco tramos tienen que entrar en el ancho de un teléfono, con el `label`
completo como `aria-label`. Va como campo **opcional** de cada opción; sin él se usa el `label`.

## 5. Lo que sigue hardcodeado, a propósito

**Que elegir Monomarca dispare la pregunta de la marca sigue siendo un `if` en el front.** Es la
única dependencia entre campos del catálogo. Modelarla (`depende_de`) obligaría al gate del
backend a entender la semántica de un campo puntual, que es exactamente lo que el spec original
descartó cuando dejó `monomarca_marca` con `obligatorio = 0` y su faltante calculado en el front
(`faltantesPerfil`), fuera del gate. No se toca.

`relevamientos.ts` no desaparece: se queda con los tipos y la traducción borrador ↔ `valores`.
Lo que se va son las **listas** (`ESPECIALIDADES`, `TRAMOS_FACTURACION`), que pasan a venir de la
API.

## 6. La reversión, dicha en voz alta

El spec original decidió: *"El formulario, concreto y escrito a mano. Nada de motor data-driven
con schema hasta que exista un segundo relevamiento y se vea el patrón real."*

Esto lo revierte **en parte**, y con el motivo que ese mismo texto pedía: el patrón ya apareció.
El catálogo creció siete opciones en un día y ahora un campo de texto quiere ser lista. Pero se
acota a propósito — **los controles siguen siendo código escrito a mano**; lo que se vuelve dato
es *qué campos hay y qué opciones tienen*. Un control nuevo sigue siendo trabajo de front.

## 7. Qué se toca

**api-vendedores** (rama nueva sobre `MatiasH11/feat-ficha-cliente`):

| archivo | qué |
|---|---|
| `docs/db-notes/planificacion-ficha-cliente-2-tipos.sql` | monomarca a `opcion` con las 6 marcas + `otros` abierta; `labelCorto` en facturación |
| `docs/db-notes/planificacion-ciclo-tables.sql` | el mismo contenido, baked-in para el bootstrap local |
| `src/services/planificacion/fichaValidation.ts` | la opción `abierta` habilita valor libre |
| `src/services/planificacion/FichaService.ts` | `getCampos()` — el catálogo sin `etiquetaErp`/`codigo_erp` |
| `src/routes/planificacion.ts` | `GET /planificacion/ficha/campos` |

**app-planificacion** (rama `feat/ficha-catalogo`):

| archivo | qué |
|---|---|
| `src/types/planificacion.ts` | `IFichaCampoDef`, `IFichaOpcion` |
| `src/api/planificacion.ts` | `getCamposFicha()` |
| `src/hooks/useCamposFicha.ts` | query con `staleTime` largo |
| `src/lib/relevamientos.ts` | se van las listas; el borrador y los faltantes pasan a leer el catálogo |
| `src/components/relevamiento/PerfilComercioSheet.tsx` | dibuja por `tipo`; "Otros" con su input |

## 8. Tests

- **Validación:** un valor fuera de lista rebota; el mismo valor pasa si el campo tiene opción
  abierta; el largo del valor libre se valida; `otros` como código literal no es un caso especial.
- **Endpoint:** devuelve los campos ordenados y **no** incluye `etiquetaErp` ni `codigo_erp`.
- **Front:** los chips salen del catálogo, no de una constante; elegir "Otros" muestra el input y
  lo exige; un valor vigente fuera de lista precarga "Otros" con su texto; el segmented usa
  `labelCorto` y deja el `label` como `aria-label`.
