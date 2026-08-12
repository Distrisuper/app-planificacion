# Tablas del dominio planificación

**Documento vivo.** Describe el esquema como está hoy, no como se decidió alguna vez. Si el código y
este archivo se contradicen, gana el código y hay que corregir este archivo.

**Fuente de verdad:** el DDL consolidado en api-vendedores,
`docs/db-notes/planificacion-ciclo-tables.sql`. Ese archivo tiene los comentarios que explican cada
constraint; acá está el mapa para saber a qué tabla ir y por qué existe cada una.

Todas viven en MySQL, base `planificacion`, sobre la conexión `sequelizeWritePlanificacion`. Los
`ALTER` en producción son intervención manual de ops: cualquier cambio de esquema se documenta en
`docs/db-notes/` con su script idempotente.

## El mapa

```
pl_rotacion ──┬─ pl_rotacion_semana        el set de semanas + nombre de zona
              │
              ├─ pl_ciclo_semana           CUÁNDO recorrió cada semana
              │
              └─ pl_rotacion_cliente ──┬─ pl_reacomodacion    bitácora de movimientos
                 EL PLAN               │
                                       └─ pl_resolucion ──┬─ pl_resolucion_motivo
                                          EL HECHO        │   motivo a nivel visita
                                                          │
                                                          └─ pl_visita_rubro ──┬─ pl_visita_rubro_motivo
                                                             propuesta          │   resultado por rubro
                                                             congelada          │
pl_motivo ─────────────────────────────────────────────────────────────────────┘
   catálogo (niveles: visita | rubro)
```

## `pl_rotacion` — la vuelta completa

Una vuelta concreta del vendedor por todas sus semanas. Existe porque "la rotación" se repite igual
que la etiqueta `s2`, y sin la instancia concreta no se puede responder qué semanas faltan ni sobre
qué conjunto se mide la cobertura.

`estado`: `programada` (planificada por gerencia, en la cola) · `abierta` (la única vigente por
vendedor) · `cerrada` (ya vivida, no editable) · `cancelada` (soft-delete de una programada — no se
borra la fila porque `pl_reacomodacion` le apunta a través de `pl_rotacion_cliente`).

- `fecha_inicio` es NULL mientras está `programada`: no se sabe cuándo va a arrancar, depende de
  cuándo cierre la anterior **en la realidad**. Se sella al activar.
- `orden` es la posición en la cola de programadas, NULL en cualquier otro estado. **Sin unique sobre
  `(vendedor, orden)` a propósito:** intercambiar dos posiciones violaría la constraint a mitad de
  transacción y MySQL no tiene constraints deferidas. La unicidad la garantiza el service renumerando
  la cola completa.
- Una sola rotación abierta por vendedor, con el truco de la columna generada (ver `pl_ciclo_semana`).

## `pl_rotacion_semana` — el set de semanas

`(rotacion_id, semana, descripcion)`. Declara explícitamente qué semanas tiene la rotación, en vez de
derivarlo de las filas del plan.

**Por qué no se deriva:** mover el último cliente fuera de una semana hacía *desaparecer* la semana de
la rotación, y no había dónde nombrar una semana que todavía no tiene clientes. Además es la única
barrera real contra reacomodar a una semana inexistente — el `CHECK` de `pl_rotacion_cliente` solo
pide `semana >= 1`.

`descripcion` suele mapear a una zona ("Buenos Aires") y **se hereda de la rotación anterior** del
mismo vendedor al materializar: las semanas mapean a zonas y la zona es estable, así que sin herencia
gerencia tendría que reescribir el nombre en cada vuelta.

**No son siempre cinco.** Hay vendedores con cuatro, y no se asume contigüidad: un set `1, 2, 3, 5`
funciona igual.

## `pl_ciclo_semana` — cuándo recorrió cada semana

**Ya no tiene plan.** Registra solo *cuándo* el vendedor recorrió la semana N de la rotación R. El
qué está en `pl_rotacion_cliente`.

- `fecha_lunes` es la semana laboral a la que pertenece el ciclo, en TZ de negocio. Es lo que decide
  cuándo vence, y **no se infiere de `fecha_apertura`**: un ciclo abierto un viernes viviría hasta el
  viernes siguiente.
- `vendedor_abierto` es una columna **generada** que vale el código del vendedor mientras el ciclo
  está abierto y NULL cuando se cierra, con `UNIQUE (vendedor_abierto)`. Es el truco para "un solo
  ciclo abierto por vendedor": MySQL no soporta índices parciales (`WHERE estado='abierta'`) y los
  NULL no colisionan entre sí en un UNIQUE.
- **Sin `UNIQUE (rotacion_id, semana)` a propósito** (se sacó en el spec del 2026-08-12, ver
  `docs/superpowers/specs/2026-08-12-semana-hecha-cierre-invisible-design.md`): una zona se puede
  recorrer más de una vez por vuelta —volver a Zárate un lunes después de haberla cerrado—, y la
  segunda pasada es una fila nueva con su propio `fecha_lunes`, no una anomalía. "Semana hecha" ya
  no depende de esta unicidad: `RotacionRepository.semanasHechas` filtra por `estado = 'cerrada'`,
  así que un `COUNT DISTINCT` sigue siendo confiable sin necesitar que la combinación sea única.

## `pl_rotacion_cliente` — EL PLAN

Una fila por **celda** `(cliente, semana, día)` de la rotación. Materializado del template una sola
vez, al arrancar la rotación, y **editable**: reacomodar es un `UPDATE (semana, dia)`.

```sql
UNIQUE KEY uq_rotacion_cliente (rotacion_id, codigo_particular_cliente, semana, dia)
```

**Ojo con esto, es la trampa más fácil de este esquema.** *No* es "un cliente, una fila por rotación".
La hoja de ruta tiene clientes de mayor frecuencia que se visitan más de una vez por vuelta:
quincenales (el mismo cliente en `s3` y `s5`) y algunos dos veces en la misma semana (`s1d3` y
`s1d5`). Con el unique sobre `(rotacion_id, cliente)` esos clientes eran irrepresentables y
`materializar` fallaba con `ER_DUP_ENTRY` para **9 de los 13 vendedores** del template.

El unique llega hasta `dia` y no se corta en `semana` porque visitar al mismo cliente dos veces el
*mismo* día no existe: serían dos cards idénticos en la misma celda del grid, que el vendedor no
podría resolver por separado. Ese duplicado sí se colapsa.

**Consecuencia para la medición:** el denominador de cobertura es estable, pero cuenta **visitas
planificadas y no clientes** — un quincenal aporta 2, que es la cantidad de visitas que se le deben.

Los `CHECK` de rango (`semana >= 1`, `dia BETWEEN 1 AND 5`) viven en la base y no solo en el service
porque esta tabla se **edita** con `UPDATE`, al contrario de los snapshots inmutables del diseño
anterior: un `UPDATE` mal armado desde cualquier camino futuro rebota acá.

## `pl_reacomodacion` — bitácora de movimientos

`(rotacion_cliente_id, semana_antes, dia_antes, semana_despues, dia_despues, origen, usuario, fecha)`.

Es la diferencia entre lo que dijo el template y lo que realmente pasó: el template se materializa una
vez y de ahí en más las filas se mueven, así que sin esto los movimientos son irrastreables.

- `origen` es `'vendedor'` o `'gerencia'`. **Se escribe para TODO movimiento, incluidos los del
  vendedor** — si solo se auditaran los de gerencia, el historial de una fila quedaría con saltos
  inexplicables.
- Reemplaza a un `updated_at` en `pl_rotacion_cliente`: el log ya trae el cuándo, y además el antes,
  el después y el quién.
- **Es lo que hace recuperable el plan original**, y por eso el plan puede ser mutable sin perder la
  línea de base: la posición planificada de una fila sale del `semana_antes/dia_antes` de su primer
  movimiento.
- El índice `(rotacion_cliente_id, fecha DESC, id DESC)` cubre entero el `ROW_NUMBER()` de
  `findUltimosMovimientos`, que recorre la bitácora completa cada vez que gerencia abre el grid.

## `pl_resolucion` — EL HECHO

Una fila por fila del plan resuelta. **Si no existe la fila, el cliente está pendiente.**

Fusiona la vieja `pl_visita` con el `estado` del snapshot anterior: una visita cerrada **es** la
resolución de tipo `visita`. Por eso cerrar una visita es un solo `UPDATE` y no puede quedar el dato a
medio camino.

- `tipo`: `visita` | `no_visita`.
- `fecha_inicio` / `fecha_fin` (NULL solo si es una visita en curso), `coord_inicio`, `coord_final`,
  `coord_cliente`.
- `UNIQUE (rotacion_cliente_id)` — una resolución por fila del plan. Hace imposible registrar "no
  visité" sobre un cliente con visita abierta, sin ningún check-then-act en el servicio.
- `INDEX (fecha_inicio)` porque **todas** las queries de analítica filtran por rango de `fecha_inicio`
  y recién después saltan a `pl_rotacion_cliente`. Sin ese índice cada reporte es un full scan.
- Las tres columnas `seguimiento_*` están creadas pero **ningún código las escribe todavía**: el aviso
  a Cromo quedó fuera de alcance. Se crearon igual porque acá un `ALTER` en producción es intervención
  manual de ops, y así reponer el aviso es solo código de servicio.

**No tiene ninguna columna que apunte al ciclo.** Es la decisión central del modelo, y su consecuencia
está explicada en [`modelo.md`](modelo.md): un hecho pertenece a un cliente y a un momento, nunca a un
ciclo.

## `pl_motivo` — el catálogo

**Dos niveles, y no hay que mezclarlos.** El nivel y el resultado comercial son **datos**: agregar un
motivo es un `INSERT`, no un deploy.

| nivel | para qué | ejemplos sembrados |
|---|---|---|
| `visita` | por qué NO se visitó (el picklist de "No visité") | Cerrado · Vacaciones · No atiende |
| `rubro` | qué pasó con cada rubro de la propuesta | Saqué pedido · Pasa pedido mañana · Pedido en la semana · Precio · DS · Flete · No lo ofrecí |

- `resultado` (`ganado` / `diferido` / `perdido` / `no_ofrecido`) existe **solo en el nivel rubro**.
- `requiere_detalle = 1` pide marca/competidor/pct — hoy solo "Precio".
- Los `motivo_id` van explícitos en el seed porque los tests y el sandbox los referencian. El 16
  ("No lo ofrecí") es el que usa el autocompletado al cerrar la semana.

## `pl_resolucion_motivo` y `pl_visita_rubro` / `pl_visita_rubro_motivo`

- **`pl_resolucion_motivo`** `(resolucion_id, motivo_id)`: los motivos a **nivel visita**. Es la tabla
  que permite responder "cuál es la objeción más frecuente en la zona norte" con un `GROUP BY`, cosa
  que no se puede hacer sobre la frase que va a Cromo.
- **`pl_visita_rubro`**: la propuesta comercial **congelada al iniciar la visita** — la que el vendedor
  efectivamente vio, no la que se recalcularía ahora. Guarda `rubro_descripcion` como snapshot porque
  la descripción puede cambiar. **Sin columna `estado`**: un rubro está resuelto si tiene motivos.
  `origen` distingue `caida` / `minimo` / `manual`, y `es_propuesto = 0` marca lo que agregó el
  vendedor.
- **`pl_visita_rubro_motivo`**: el resultado por rubro, con `marca` / `competidor` / `pct_diferencia`
  cuando el motivo `requiere_detalle`. Columnas nullables y **no texto libre**, con el mismo objetivo:
  responder "contra quién perdemos y por cuánto" con un `GROUP BY`.

## Tablas que ya no existen

Si las ves mencionadas en un spec viejo, un comentario o una conversación, están eliminadas:

| tabla | qué pasó |
|---|---|
| `pl_ciclo_cliente` | El plan se movió a `pl_rotacion_cliente`. Con ella se fue `en_plan`: no hay "dentro y fuera del plan", hay una fila que está en alguna celda |
| `pl_visita` | Fusionada en `pl_resolucion` (`tipo = 'visita'`) |
| `Motivos` (la compartida) | Reemplazada por `pl_motivo`, tabla propia del dominio |
| `Visitas` | De api-mobiliza. Ya no se escribe; se deprecia junto con ese servicio |

También se descartaron sin llegar a escribirse: el estado `'arrastrada'` y las columnas de bandeja
`dia_deseado`, `reagendado_de`, `excluido_en`.
