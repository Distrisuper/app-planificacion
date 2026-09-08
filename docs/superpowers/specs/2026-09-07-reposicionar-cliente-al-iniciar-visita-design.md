# Reposicionar cliente al iniciar visita

**Fecha:** 2026-09-07
**Estado:** diseño aprobado, pendiente de plan de implementación
**Alcance:** api-vendedores + app-planificacion + client-service (tres repos, un solo contrato)

**Revisión:** este spec reemplaza una primera versión que proponía un ajuste puramente efímero
(sin escritura a `client-service`). Se descartó esa versión al confirmar que el vendedor sí necesita
poder corregir la fuente de verdad, no solo destrabar el gate del momento — ver "La decisión" abajo.

---

## El problema

Iniciar visita exige estar a ≤100 m de `cliente.latitud/longitud` (`RADIO_INICIO_METROS`, ver
`docs/dominio/modelo.md`). ​Investigando el origen real de esa coordenada:

- **No hay un ERP externo detrás.** El maestro de clientes es el microservicio **`client-service`**
  (`C:/Users/matia/Documents/distrisuper/client-service`, NestJS + MySQL). Los nombres de columna de
  su tabla `clientesDistri` (`cdclie`, `excelgm`, `es_excel`, etc.) delatan una migración histórica
  desde planillas/sistema viejo, pero hoy no hay ningún sync activo — `client-service` es la fuente
  primaria vigente.
- **Las coordenadas se geocodifican automáticamente**, no se cargan a mano: un cronjob
  (`UpdateCoordinatesCronjobCase`) busca clientes sin fila en `client_coordinates` y le pega a
  **Nominatim** (OpenStreetMap) con localidad/domicilio/código postal. Por eso a veces están mal —
  es una adivinanza a partir de texto de dirección, no un dato verificado.
- **`app-lupa-web` ya tiene una corrección para esto** ("Redireccionar cliente",
  `src/components/TV/Visitas.jsx`): el vendedor toca el mapa, y hace un `PATCH` directo a
  `client-service` (`.../clients/{particularCode}`) que sobrescribe `client_coordinates`, con un
  límite de 3 correcciones por cliente (contador guardado como preferencia dinámica en un backend
  legacy de Lupa, cuyo repo no está identificado/accesible).
- **`app-planificacion` no lee `client-service` en vivo.** Lee `fct_clients` en el warehouse
  (Postgres, read-only), que **sync-dagster actualiza una vez por día** (`daily_dimensions_schedule`,
  cron `0 3 * * *`, incluye clientes). Un `PATCH` a `client-service` recién se refleja acá al otro día.

## La decisión: dos mecanismos, uno resuelve el "ahora" y el otro el "de acá en adelante"

1. **Ajuste efímero, en `pl_resolucion.coord_cliente`** (tabla propia, ya existe la columna) —
   destraba el gate de **esta visita puntual**, sin esperar ningún sync. Nunca toca `fct_clients` ni
   `client-service` por sí solo.
2. **Corrección permanente en `client-service`**, igual que Lupa — corrige la fuente real para que
   de ahí en más (otras visitas, otros vendedores, otras apps que lean `client-service` o el
   warehouse del día siguiente) ya no haga falta el ajuste.

Los dos se disparan con el mismo gesto del vendedor (un solo botón "Reposicionar cliente", un solo
tap en el mapa) — el vendedor no elige entre "temporal" o "permanente", son dos efectos de una sola
acción, resueltos en el momento correcto de cada uno:

- El efímero se aplica **al instante**, en el propio front, para destrabar el botón "Iniciar visita".
- El permanente se dispara **recién cuando la visita se crea con éxito**, del lado de
  `api-vendedores` — mismo criterio que ya usa el dominio para el aviso a Cromo: **primero se
  persiste el hecho, después se dispara el efecto secundario, best-effort**. Si el `PATCH` a
  `client-service` falla (caído, timeout), la visita ya quedó creada igual — no se pierde nada, el
  ajuste efímero ya cumplió su función para esta visita, y simplemente no se corrigió la fuente esta
  vez.

### El límite de 3, sin tabla nueva ni backend legacy

No hace falta replicar el contador de Lupa (que vive en un backend que no pudimos ubicar). Como el
`PATCH` permanente solo se dispara junto con una visita creada, y esa visita ya guarda
`coord_cliente_ajustada = 1` en `pl_resolucion`, **el contador es un `COUNT(*)` sobre
`pl_resolucion` (join a `pl_rotacion_cliente` por código de cliente) filtrando
`coord_cliente_ajustada = 1`.** Al llegar a 3, `api-vendedores` deja de mandar el `PATCH` a
`client-service` en las próximas veces — pero **nunca bloquea la visita ni el gate**: el ajuste
efímero sigue funcionando siempre, tenga o no cupo de corrección permanente. Es más permisivo que
Lupa (ahí, al llegar a 3/3, se bloquea toda la función de reubicar).

Cuando el cupo ya se agotó, el front muestra un aviso discreto (no bloqueante) al vendedor:
*"Esta corrección ya no se guarda de forma permanente (límite alcanzado)."* — para que sepa que,
aunque pudo iniciar la visita, alguien tiene que corregir la ficha del cliente por otro medio.

### Por qué no hace falta `window.confirm`

A diferencia de Lupa, acá el vendedor puede repetir el gesto o usar "Restablecer" antes de iniciar
sin ningún costo — el `PATCH` permanente recién se dispara si la visita efectivamente se crea, así
que no hay una escritura irreversible disparada por un toque accidental en el mapa.

### Qué pasa si se pierde el estado (refresh, corte de internet)

Si se pierde el estado ANTES de tocar "Iniciar visita" (refresh, cierre del mapa, corte de internet):
no pasó nada, ni el ajuste efímero ni el permanente llegaron a dispararse — se vuelve a la coordenada
del warehouse tal cual estaba. Si el corte de internet pasa DESPUÉS de tocar "Iniciar visita" pero
la visita se creó igual (ya viajó al backend), el ajuste permanente puede haberse aplicado o no según
si `client-service` respondió — es exactamente el mismo caso de "best-effort" que ya maneja Cromo, no
hace falta un manejo especial nuevo.

## Frontend (`app-planificacion`)

Sin cambios respecto al diseño anterior en la interacción visible:

### `IniciarVisitaMapa.tsx`

Tercer botón, mismo estilo `outline` que "Recalcular posición" / "¿Cómo llegar?": **"Reposicionar
cliente"**.

- Al tocarlo arma `modoReposicionar`. Aviso tipo dashed-box ("Tocá el mapa para mover al cliente" +
  "Cancelar"), deshabilita "Iniciar visita" mientras dura.
- Click captura con `map.on('click', ...)` (Leaflet puro, no react-leaflet) leyendo un ref
  (`modoReposicionarRef`), mismo patrón que `posicionRef`/`marcarFixFallido` ya usan en este
  componente.
- Al tocar: mueve marker y círculo de `RADIO_INICIO_METROS`, recalcula distancia contra el último fix
  del vendedor (nuevo ref `vendedorFixRef` con `{lat, lng, accuracy}` crudos), llama
  `onReposicionar({lat, lng})`, desarma el modo.
- Con ajuste activo: aviso "Posición ajustada para esta visita" + "Restablecer"
  (`onReposicionar(null)`).
- Nuevo prop: `onReposicionar?: (coords: {lat: number; lng: number} | null) => void`.

### `VisitaFlow.tsx`

- Estado `clienteOverride: {lat: number; lng: number} | null`, reseteado al cancelar el mapa o al
  volver a abrirlo.
- Coordenadas efectivas: `clienteOverride?.lat ?? cliente.latitud` (ídem lng), usadas en el mapa y en
  la segunda verificación de `onIniciar`.
- Si hay `clienteOverride`, el payload de `iniciar.mutateAsync` agrega
  `coordCliente: "${lat},${lng}"`. `coordInicio` no cambia — sigue siendo la posición real del
  vendedor.
- Nuevo manejo de la respuesta: si `iniciar.mutateAsync` devuelve
  `correccionPermanenteAplicada: false` (ver DTO abajo) habiendo mandado `coordCliente`, se muestra
  el aviso discreto de límite alcanzado (`onAviso?.('info', 'Esta corrección ya no se guarda de
  forma permanente (límite alcanzado).')`).

### Contratos (`src/types/planificacion.ts`, `src/api/planificacion.ts`)

```ts
export interface IIniciarVisitaDTO {
    rotacionClienteId: number
    coordInicio: string
    coordCliente?: string  // "lat,lng" — solo si el vendedor reposicionó al cliente
    propuesta?: IPropuestaRubroDTO[]
}
```

```ts
export const iniciarVisita = async (
    dto: IIniciarVisitaDTO,
): Promise<{ visitaId: number; ofrecimientos: number; correccionPermanenteAplicada?: boolean }> => {
    const res = await apiClient.post('/planificacion/visitas', dto)
    return res.data.data
}
```

`correccionPermanenteAplicada` solo tiene sentido cuando se mandó `coordCliente`; si no se mandó,
el backend no la incluye (o la manda `undefined`) y el front no muestra nada.

## Backend (`api-vendedores` — dependencia a coordinar, no se toca desde este repo)

`POST /planificacion/visitas`:

1. Si viene `coordCliente`: persiste ese valor en `pl_resolucion.coord_cliente` (en vez del snapshot
   del warehouse) y `coord_cliente_ajustada = 1`.
2. Después de confirmar la escritura de `pl_resolucion` (la visita ya existe, igual que el aviso a
   Cromo se dispara después del hecho):
   - cuenta cuántas resoluciones de ese cliente (join `pl_rotacion_cliente` por
     `codigo_particular_cliente`) tienen `coord_cliente_ajustada = 1`.
   - si el conteo (incluyendo esta) es `<= 3`: dispara `PATCH` a `client-service`
     (`{API_CLIENTS_MICROSERVICE}/{particularCode}`, mismo body JSON:API que usa Lupo:
     `{data:{type:'clients', id, attributes:{coordinates:{latitude, longitude}}}}`), best-effort — si
     falla, se loguea y no revierte nada. Devuelve `correccionPermanenteAplicada: true`.
   - si el conteo ya superaba 3 antes de esta visita: no dispara el `PATCH`. Devuelve
     `correccionPermanenteAplicada: false`.
3. Nuevo cliente HTTP hacia `client-service` — no existe ninguna integración hoy en
   `api-vendedores` (se buscó exhaustivamente: cero referencias a `client-service` en su código).
   Seguir el patrón ya usado por `CrmService`/`CromoHttpClient`
   (`api-vendedores/src/services/crm/`) para el wrapping de la llamada HTTP y el manejo de errores
   best-effort.

DDL (tabla propia, mismo patrón que otras columnas de flag en el mismo archivo —
`requiere_detalle`, `activo`, `es_extra`, `es_propuesto`, todas `TINYINT(1) NOT NULL DEFAULT 0`):

```sql
ALTER TABLE pl_resolucion
  ADD COLUMN coord_cliente_ajustada TINYINT(1) NOT NULL DEFAULT 0;
```

No se toca `fct_clients` ni ninguna tabla del warehouse. `client-service` solo recibe el mismo tipo
de `PATCH` que ya recibe hoy desde Lupa — no necesita cambios de su lado.

## Analítica de gerencia

`MapaVisita.tsx` / `DetalleVisitaPanel.tsx` ya leen `coord_cliente` de la resolución — reflejan la
posición real de esa visita sin cambios de su lado. Un badge "ajustada por el vendedor" usando
`coord_cliente_ajustada`, o un reporte de "clientes con coordenada del ERP corregida repetidamente",
quedan **fuera de este alcance** — posibles follow-ups.

## Testing

- `IniciarVisitaMapa.test.tsx`: armar modo → tap mueve el pin y recalcula distancia sin esperar un
  nuevo `watchPosition`; "Restablecer" vuelve a la coordenada original; "Iniciar visita" deshabilitado
  mientras el modo está armado.
- `VisitaFlow.test.tsx`: reposicionar destraba `onIniciar` cuando el vendedor está lejos de la
  coordenada original pero cerca de la reposicionada; `coordCliente` viaja solo cuando hay override;
  `coordInicio` enviado sigue siendo la posición real del vendedor; se muestra el aviso discreto
  cuando la respuesta trae `correccionPermanenteAplicada: false`.
- (api-vendedores, a coordinar en su propio repo): el conteo de `coord_cliente_ajustada` respeta el
  corte de 3; el `PATCH` a `client-service` es best-effort y no revierte la creación de la visita si
  falla.

## Fuera de alcance

- Cualquier escritura directa a `fct_clients`/warehouse.
- Compartir el contador de 3 con el backend legacy de Lupa — se usa un conteo propio sobre
  `pl_resolucion`, no unificado con Lupa (quedan como corrección permanentes independientes por app).
- Badge/reporte de "coordenada ajustada" en las vistas de analítica — follow-up posible.
- Editar el ajuste después de iniciada la visita — `pl_resolucion` es inmutable.
