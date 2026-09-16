# Descuentos por marca en la visita

**Fecha:** 2026-09-16
**Estado:** diseño aprobado, sin implementar

Traer a la visita el descuento por marca del cliente —el dato que hoy vive en el popup
"Descuentos por marca" de app-vendedores— pegado a la marca que el vendedor está ofreciendo,
y consultable entero desde el header del sheet.

---

## 1. El problema

El vendedor está parado en el local ofreciendo un rubro. Ve las marcas que el cliente compra
(sub-filas de `SubFilasMarcas`, spec `2026-09-16-marcas-por-rubro-design.md`) con
ACTUAL/M.ANT/P.6M. Lo que no ve es **con qué descuento puede cerrar cada una**. Para eso hoy
tiene que salir a app-vendedores, buscar el cliente y abrir el popup.

## 2. La fuente: ya la tenemos

`IVisitClientCard.brandDiscounts` (`src/types/planificacion.ts:78`) **ya viaja en cada cliente
de la agenda** y hoy no se usa en ningún lado de `src/`. Sale de
`analytics.fct_clients.brand_discounts` (JSONB) vía `ClientRepository.toVisitCard`
(api-vendedores, `ClientRepository.ts:469`), y el front lo pasa tal cual (`getAgendaDia` hace
`res.data.data`, sin mapeo).

```ts
interface IBrandDiscount { code: string; value: number; description: string }
```

**Consecuencia: esta feature es 100% front.** Cero endpoints nuevos, cero cambios en
api-vendedores, cero requests. Funciona con lo que ya está en cache de React Query, que en la
vereda con 3G es la diferencia entre tener el dato y no tenerlo.

### 2.1 Por qué NO enriquecemos `client-context`

El camino alternativo era enriquecer `POST /sale/rubro/client-context` con
`BrandDiscountEnricher` (el mismo que alimenta la columna DTO de `/v2/rubro`), que cruza el
JSONB contra `dim_brand_lines` y por lo tanto puede devolver **marcas con descuento que el
cliente todavía no compra** — oportunidad comercial pura.

Se descartó por ahora. Esa marca no tiene sub-fila en la tabla, así que habría que inyectar
filas con ACTUAL/M.ANT/P.6M en `–` a un rubro desplegado donde ya entran ~5 filas en pantalla.
El costo en pantalla es alto y el beneficio no está medido. **El camino queda documentado acá
para no rediscutirlo**: si algún día se pide, es `BrandDiscountEnricher` +
`mergeMissingBrandDiscounts`, ya escritos en api-vendedores.

### 2.2 El `description` NO es una segunda dimensión

El texto viene sucio, con la línea embebida:

```
{ code: '141', value: 15, description: 'COBREQ # LIQUIDOS FRENO #' }
{ code: '039', value: 23, description: 'AG # RESORTES #' }
```

Es tentador leer eso como "una marca puede tener varios descuentos, uno por línea" y diseñar
un rango (`15-23%`). **Es falso.** El origen en MySQL es `client_brand_discount`
(`client-service/.../client-brand-discount.entity.ts`) con
**PK `(client_code, brand_code)`**: un cliente no puede tener dos descuentos para la misma
marca. El `# LIQUIDOS FRENO #` es cómo administración *nombra* esa entrada, nada más.

Por eso el mapa es `Map<code, number>` escalar y el badge es siempre **un** número.

> Nota sobre el enricher de app-vendedores: `BrandDiscountEnricher.ts:76` hace
> `map.set(brand_code, …)` sobre un `JOIN` a `dim_brand_lines` que sí abre una fila por línea
> de producto del rubro. Todas traen el mismo `discount_pct`, así que el valor no se corrompe;
> solo el `lineName` que sobrevive es arbitrario. No nos afecta y no lo tocamos.

## 3. La regla del suscriptor (el "45")

app-vendedores filtra las marcas con `AND general_discount <> 45`
(`api-vendedores/src/services/clientService.ts:90`), sin ningún comentario que lo explique.
Se investigó antes de replicarlo.

### 3.1 Qué significa

**45 = cliente suscriptor.** Tiene 45% de bonificación fija a cambio de un fee mensual que se
le factura bajo la marca `120`. Documentado en
`quantix/api-quantix/docs/diccionario_negocio.md:93-113` y usado por los marts
`fct_subscriber_fees.sql:26-33` (`header_bonification_pct = 45`).

La regla de fondo es correcta y hay que aplicarla: **el 45% ya es global, así que los
descuentos por marca no se acumulan.** Confirmado en el motor de precios de Lupa,
`api-node-lupa/utils/priceUtils.js:52`:

```js
const brandEffectiveDiscount = (brandDiscount === 0 || clientDiscount === 45) ? 1 : (1 - (brandDiscount / 100))
```

Mostrarle a un suscriptor un descuento por marca es mostrarle algo que el sistema **no le va a
aplicar al facturar**. Es peor que no mostrar nada.

### 3.2 Por qué NO copiamos el literal

`general_discount` **vale 0 para todos los clientes**. La cadena:

- `int_clients_enriched.sql:173-176` lo lee de `discounts->>'byGeneral'` con `coalesce(…, 0)`.
- `client-service/src/shared/application/client-response.dto.ts:50-63` es el **único** lugar de
  todo client-service que construye `discounts`, y emite `byBonus`, `byCondition`, `byBrand`.
  **`byGeneral` no existe** (verificado con `grep -rn "byGeneral" client-service/src` → 0 hits).

Es una regresión de la migración MySQL→warehouse (`c8a105c Feature/change data source #65`),
donde `clients.general_discount` sí era una columna real. **Hoy `AND general_discount <> 45` no
filtra nada**: los suscriptores ya están viendo sus descuentos por marca en app-vendedores.

Copiar ese literal sería copiar un no-op que empezaría a hacer algo solo el día que alguien
arregle el ETL, sin que nadie relacione una cosa con la otra.

### 3.3 Qué aplicamos

El campo que **sí** trae el 45 es `bonusDiscount` (`byBonus` ← `clientesDistri.bonificacion`),
y es el que usa Lupa para clasificar suscriptores — con **dos** valores,
`api-node-lupa/service/MapaCalorService.js:362`:

```js
} else if (attrs.discounts?.byBonus === 45 || attrs.discounts?.byBonus === 49) {
    // Priority 2: Suscriptor (subscriber with bonus 45 or 49)
```

```
esSuscriptor(cliente) === (bonusDiscount === 45 || bonusDiscount === 49)
```

`bonusDiscount` ya viaja en `IVisitClientCard`, así que sigue siendo cero backend.

**Discrepancia conocida y aceptada:** app-planificacion va a ocultar descuentos por marca a
suscriptores y app-vendedores los va a seguir mostrando. No es falta de paridad por descuido:
es que el filtro de app-vendedores está roto. Esta app queda alineada con el motor de precios,
que es la única autoridad que importa acá.

### 3.4 El suscriptor NO se entera por el silencio

No alcanza con vaciar la lista. Un vendedor que abre "Descuentos por marca" y ve cero filas
lee **"este cliente no tiene ningún descuento"**, cuando la verdad es exactamente la opuesta:
tiene el mejor de todos. Y en mobile un silencio es indistinguible de un dato que no cargó.

Por eso el suscriptor ve un chip explícito. Ver §6.

## 4. `src/lib/descuentosMarca.ts`

Todo lo derivado en un módulo sin React, testeable solo:

| función | qué hace |
|---|---|
| `esSuscriptor(cliente)` | `bonusDiscount === 45 \|\| bonusDiscount === 49` |
| `descuentosPorCodigo(cliente)` | `Map<code, number>` — **vacío si `esSuscriptor`** |
| `nombreDescuento(description)` | `'COBREQ # LIQUIDOS FRENO #'` → `'COBREQ · LIQUIDOS FRENO'` |
| `listaDescuentos(cliente)` | `{ code, nombre, valor }[]` ordenado por `valor` desc, para el sheet |

Reglas:

- **La regla del suscriptor vive en un solo lugar**: el `Map` vacío y la lista vacía. No un
  `if (esSuscriptor)` repetido en cada componente, que es como se desincroniza.
- Match por `code.trim()` contra `IMarcaEstado.code`. Es el mismo `brand_code`: el join del
  enricher es `bl.brand_code = elem->>'code'`.
- `value` a veces llega como string desde `pg` (`(elem->>'value')::numeric` sin parser). Se
  normaliza con `Number()`; se descartan `NaN` y `<= 0`.
- `nombreDescuento` con un `description` sin `#` lo devuelve tal cual (no todos los tienen).

## 5. El badge en la sub-fila

En `SubFilasMarcas` (`OfrecimientoTable.tsx:298-341`): pill chico a la derecha del nombre,
**dentro del `flex-1` que ya existe**.

```
375px — rubro desplegado
┌────────────────────────────────────┐
│ ○ PARRILLAS        120k   98k  140k│
│ │ COBREQ  15%       80k   70k   95k│
│ │ FERODO            40k   28k   45k│
│ │ JURID   12%         –     –    8k│
└────────────────────────────────────┘
```

- **Las tres columnas de 54px no se tocan**, y `M.Ant` conserva su `hidden xs:flex` /
  `hidden xs:block` (spec de marcas, §"M.Ant se esconde abajo de 360px"). Se descartó una
  cuarta columna "DTO" como la de `BrandDetailSection` de app-vendedores: dejaba el nombre en
  ~55px (`PARRI…`) y es una columna vacía en la mayoría de las filas.
- **Solo se dibuja donde hay descuento.** No cuesta ancho en las marcas sin él, que son la
  mayoría.
- `shrink-0` en el pill + `truncate` en el nombre: con `COBREQ # LIQUIDOS FRENO #` se corta el
  nombre, **nunca el número**. El número es el dato nuevo y es lo que el vendedor está buscando.
- **Violeta**, no verde ni ámbar. En esta tabla el ámbar ya es "rubro a medio cargar" y el
  verde es "✓ completo", los dos a 26px de distancia en la misma fila. Un tercer significado
  sobre esos colores rompe el semáforo del chip de estado. El violeta es además el que ya usa
  `DiscountBadge` en app-vendedores.
- **Sin tramos de color por valor.** `V2ClientDiscountsPanel.getDiscountStyle` pinta ≥18 verde,
  ≥15 azul, ≥12 ámbar, >0 slate, 0 rojo. Esos cortes no están documentados en ningún lado y en
  mobile el color ya está saturado de significado.
- El badge es **solo lectura**: no es tocable y no abre nada. La fila ya tiene dos zonas
  (nombre = cargar resultado, números = desplegar marcas) y una tercera la vuelve un campo
  minado.

## 6. El sheet "Descuentos por marca"

Lista completa del cliente, no solo las marcas del rubro abierto. Mismo contenido que
`ClientDiscountsPopup` de app-vendedores.

```
┌───────────────────────────────────┐
│ Descuentos por marca           ✕  │
│ GM 35%   Bonif. 8%   Gral. 12%    │
│ ┌───────────────────────────────┐ │
│ │ Buscar marca…                 │ │
│ └───────────────────────────────┘ │
│ COBREQ · LIQUIDOS FRENO      15%  │
│ AG · RESORTES                23%  │
│ …                                 │
└───────────────────────────────────┘
```

- Chips de los tres escalares arriba (`gmDiscount`, `bonusDiscount`, `generalDiscount`), cada
  uno **solo si es `> 0`** — igual que el `headerExtra` del popup. En la práctica
  `generalDiscount` **nunca se va a dibujar**, porque vale 0 para todos (§3.2); se incluye de
  todas formas para que el día que arreglen el ETL aparezca solo, sin tocar esta pantalla.
- **Ordenado por % descendente**, no alfabético: es el orden con el que se busca con qué
  empujar. El buscador cubre el caso "quiero ésta".
- Buscador **sin debounce**. `useTextoDebounced` existe para los buscadores de cartera, que
  disparan una request por tecla; acá el filtro corre sobre un array en memoria y el debounce
  sólo agregaría 300ms de lag a algo gratis.
- Sin descuentos y **no** suscriptor: "Este cliente no tiene descuentos por marca".

### 6.1 Suscriptor

Cero filas, sin buscador, y en su lugar:

```
┌───────────────────────────────────┐
│ Descuentos por marca           ✕  │
│ ┌─────────────────────────────┐   │
│ │ SUSCRIPTOR · 45%            │   │
│ └─────────────────────────────┘   │
│ El 45% ya aplica a todo. Los      │
│ descuentos por marca no se suman. │
└───────────────────────────────────┘
```

El `45%` del chip sale de `bonusDiscount`, no está hardcodeado — un suscriptor `49` muestra
`SUSCRIPTOR · 49%`.

El chip `SUSCRIPTOR` **reemplaza al de `Bonif.`**, no se suma: son el mismo número
(`bonusDiscount`) y mostrarlo dos veces sugiere dos beneficios distintos. El de `GM` sí
convive, porque es otro eje (`gm_discount` sale del texto del barrio y es un camino de precio
excluyente, ver `calculatePriceConditions.js:53-57`).

**Vocabulario:** "suscriptor" es una palabra del negocio que el vendedor ya usa (Lupa clasifica
clientes así). No viola la restricción de "el vendedor no ve ciclos ni rotaciones" de CLAUDE.md,
que es sobre el modelo de planificación, no sobre las condiciones comerciales del cliente.

## 7. Punto de entrada

**No** en la fila de `AccionesExternas`. Esos chips llevan **afuera** de la app y lo dicen con
el `↗` (`AccionesExternas.tsx:8-9`: "las tres son consultas del contexto del cliente que llevan
afuera"). Éste es contenido propio; mezclarlo rompe esa convención y le saca al `↗` su
significado.

Va en la **línea de identidad del header de `VisitaSheet`** (`VisitaSheet.tsx:407-430`), el
mismo slot donde ya vive "No visité" — que es exactamente donde ese comentario argumenta que
van las acciones que el vendedor necesita encontrar rápido, parado en la puerta. Chip `%`
violeta, a la izquierda del rojo, mismas proporciones (`h-7`, `rounded-lg`, ícono + texto).

Se muestra **también con la visita cerrada**, a diferencia de "No visité": es consulta, no
edición, y el sheet de una visita cerrada es justamente de consulta.

Si el cliente no tiene ningún descuento por marca **y** no es suscriptor, el chip no se
renderiza: un botón que abre una pantalla vacía es peor que no tenerlo.

## 8. Tests

`descuentosMarca.test.ts` (el grueso, sin React):

- `esSuscriptor`: 45 → true, 49 → true, 0 / `null` / `undefined` / 44 → false.
- `descuentosPorCodigo`: suscriptor ⇒ `Map` vacío aunque `brandDiscounts` tenga filas.
- `descuentosPorCodigo`: `value` como string `'15'` ⇒ `15`; `'abc'` y `0` ⇒ descartados.
- `descuentosPorCodigo`: match por `code` con espacios (`' 141 '`).
- `nombreDescuento`: con `#`, sin `#`, con `#` desbalanceado.
- `listaDescuentos`: orden por valor descendente.

`OfrecimientoTable.test.tsx`:

- Marca con descuento ⇒ badge con el %; marca sin descuento ⇒ sin badge.
- Cliente suscriptor ⇒ ninguna sub-fila tiene badge.
- El badge no altera el render de las tres celdas numéricas.

`DescuentosMarcaSheet.test.tsx`:

- Lista ordenada por % desc.
- Buscador filtra por nombre.
- Suscriptor ⇒ chip `SUSCRIPTOR · 45%` + explicación, sin lista ni buscador.
- Sin descuentos y no suscriptor ⇒ mensaje vacío.
- Chips de escalares: solo los `> 0`.

`VisitaSheet.test.tsx`:

- Chip `%` presente con visita abierta y con visita cerrada.
- Chip ausente si no hay descuentos y no es suscriptor.

## 9. Fuera de alcance

- **Marcas con descuento que el cliente no compra** (oportunidad). Ver §2.1.
- **Filtrar los descuentos por el rubro abierto.** El badge ya queda filtrado de hecho (solo
  aparece en marcas que el cliente compra en ese rubro); el sheet es la ficha completa a
  propósito.
- **Arreglar el ETL de `general_discount`.** Afecta a app-vendedores y app-lupa-web, no a esta
  app: acá no lo usamos para nada. Queda documentado en §3.2 para quien lo levante.
- **Tocar `BrandDiscountEnricher` o `clientService.getBrandDiscounts`.** Esta feature no
  escribe ni una línea en api-vendedores.
- **El toggle pesos/unidades** no aplica: un % no tiene unidades.

## 10. Referencias

- `docs/superpowers/specs/2026-09-16-marcas-por-rubro-design.md` — las sub-filas de marca donde
  se enchufa el badge.
- `api-vendedores/src/services/clientService.ts:66-107` — el popup original y el filtro del 45.
- `api-vendedores/src/services/sales/BrandDiscountEnricher.ts` — el camino de §2.1.
- `sync-dagster/dbt/models/intermediate/int_clients_enriched.sql:167-198` — cómo se pueblan los
  cuatro campos de descuento.
- `quantix/api-quantix/docs/diccionario_negocio.md:93-113` — qué es un cliente suscriptor.
