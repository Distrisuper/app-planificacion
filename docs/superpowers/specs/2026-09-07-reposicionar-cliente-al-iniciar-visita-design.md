# Reposicionar cliente al iniciar visita

**Fecha:** 2026-09-07
**Estado:** diseño aprobado, pendiente de plan de implementación
**Alcance:** api-vendedores + app-planificacion (dos planes, un solo contrato)

---

## El problema

Iniciar visita exige estar a ≤100 m de `cliente.latitud/longitud` (`RADIO_INICIO_METROS`, ver
`docs/dominio/modelo.md`). Esa coordenada sale de `fct_clients` en el warehouse — un dato que a veces
está mal cargado en el ERP. Cuando eso pasa, el vendedor está parado en el local y el gate lo bloquea
igual, sin ninguna salida.

`app-lupa-web` tiene un feature parecido ("Redireccionar cliente" en `Visitas.jsx`), pero corrige la
coordenada **de forma permanente**: hace un `PATCH` a un microservicio de clientes y persiste el
cambio para siempre, limitado a 3 usos. Esa no es la solución acá: si la posición del cliente está mal
**de verdad**, se corrige en el ERP — esta app no tiene por qué (ni debe) escribirle a la fuente de
datos. Lo que hace falta es algo más chico: una salida para *esa visita puntual*, sin tocar el maestro
de clientes.

## La decisión

El ajuste es efímero del lado del cliente (nunca toca `fct_clients` ni el warehouse) pero **sí se
persiste como parte del hecho de esa visita**, porque `pl_resolucion` ya tiene una columna
`coord_cliente` (`VARCHAR(100) NULL`, ver `docs/dominio/tablas.md`) que hoy el backend llena con un
snapshot del warehouse al iniciar. Si el vendedor ajusta la posición, ese snapshot pasa a ser el punto
que él confirmó — y la analítica de esa visita (`MapaVisita`, `DetalleVisitaPanel`, que ya comparan
`coord_inicio` vs `coord_cliente`) automáticamente refleja la realidad, sin cambios de su lado.

Ninguna visita futura (otra semana, otro vendedor) se ve afectada: el ajuste vive en la fila de
`pl_resolucion` de esa visita, no en el cliente.

### Por qué no hace falta límite de usos ni confirmación nativa

En Lupa el límite de 3 y el `window.confirm` existen porque el cambio es permanente y cuesta revertir.
Acá el ajuste es descartable con un botón "Restablecer" antes de iniciar, y una vez iniciada la visita
ya no se puede tocar (no hay pantalla para editarlo después — coherente con que `pl_resolucion` es
inmutable). No hay nada que limitar ni confirmar con un diálogo aparte.

### Qué pasa si se pierde el estado (refresh, corte de internet)

No hay nada que perder. El ajuste vive en memoria (estado de React) hasta el instante en que se llama
a `POST /planificacion/visitas`. Si la página se recarga, se corta la conexión, o el vendedor cierra el
mapa antes de tocar "Iniciar visita", el ajuste se descarta sin dejar rastro y todo vuelve a la
coordenada del warehouse — exactamente como si nunca se hubiera tocado. En el peor caso el vendedor
repite el tap.

## Frontend (`app-planificacion`)

### `IniciarVisitaMapa.tsx`

Tercer botón, mismo estilo `outline` que "Recalcular posición" / "¿Cómo llegar?": **"Reposicionar
cliente"**.

- Al tocarlo arma `modoReposicionar` (no mueve nada todavía). Se muestra un aviso tipo dashed-box
  ("Tocá el mapa para mover al cliente" + "Cancelar") y se deshabilita "Iniciar visita" mientras dura.
  Esto evita mover el pin sin querer al hacer zoom/pan sobre el mapa.
- El mapa es Leaflet puro (no react-leaflet), así que el click se captura con `map.on('click', ...)`
  agregado en el mismo `useEffect` que crea el mapa, leyendo un ref (`modoReposicionarRef`) para no
  quedar atado al closure del primer render — mismo patrón que ya usan `posicionRef`/`marcarFixFallido`
  en este componente.
- Al tocar el mapa en modo armado: se mueve el marker naranja y el círculo de `RADIO_INICIO_METROS` al
  nuevo punto, se recalcula distancia contra el último fix conocido del vendedor (nuevo ref
  `vendedorFixRef` con `{lat, lng, accuracy}` crudos — hoy solo se guarda el resultado derivado en
  `posicionRef`, y hace falta el fix crudo para recalcular sin esperar el próximo tick de
  `watchPosition`), se llama `onReposicionar({lat, lng})`, y se desarma el modo.
- Mientras hay un ajuste activo: aviso "Posición ajustada para esta visita" + botón/link
  "Restablecer" que llama `onReposicionar(null)` y vuelve todo a la coordenada original.
- Nuevo prop: `onReposicionar?: (coords: {lat: number; lng: number} | null) => void`.

### `VisitaFlow.tsx`

- Nuevo estado `clienteOverride: {lat: number; lng: number} | null`, reseteado:
  - cuando se cancela el mapa (`onCancel`),
  - cuando el mapa se vuelve a abrir (`open` pasa a `true`).
- Las coordenadas efectivas que se pasan a `IniciarVisitaMapa` (hoy `cliente.latitud`/`longitud` fijas)
  pasan a ser `clienteOverride?.lat ?? cliente.latitud` / `clienteOverride?.lng ?? cliente.longitud`.
- La segunda verificación en `onIniciar` (la que compara la coordenada definitiva del vendedor contra
  la del cliente antes de llamar a `iniciar.mutateAsync`) usa esas mismas coordenadas efectivas, no
  `cliente!.latitud/longitud` a secas.
- Si hay `clienteOverride`, el payload de `iniciar.mutateAsync` agrega
  `coordCliente: "${lat},${lng}"`. Si no hay override, el campo se omite y el backend sigue con su
  comportamiento actual (snapshot del warehouse). `coordInicio` no cambia: sigue siendo la posición
  real del vendedor, nunca la del cliente.

### `IIniciarVisitaDTO` (`src/types/planificacion.ts`)

Nuevo campo opcional:

```ts
export interface IIniciarVisitaDTO {
    rotacionClienteId: number
    coordInicio: string
    coordCliente?: string  // "lat,lng" — solo si el vendedor ajustó la posición del cliente
    propuesta?: IPropuestaRubroDTO[]
}
```

## Backend (`api-vendedores` — otro repo, dependencia a coordinar)

`POST /planificacion/visitas` acepta `coordCliente` opcional:

- Si viene: se persiste tal cual en `pl_resolucion.coord_cliente` (en vez del snapshot que arma hoy
  desde el warehouse) y se marca `coord_cliente_ajustada = 1`.
- Si no viene: comportamiento actual sin cambios, `coord_cliente_ajustada` queda en su default (`0`).

DDL (tabla propia, mismo patrón que las columnas de flag existentes en el mismo archivo —
`requiere_detalle`, `activo`, `es_extra`, `es_propuesto` — todas `TINYINT(1) NOT NULL DEFAULT 0`):

```sql
ALTER TABLE pl_resolucion
  ADD COLUMN coord_cliente_ajustada TINYINT(1) NOT NULL DEFAULT 0;
```

No se toca `fct_clients` ni ninguna tabla del warehouse.

## Analítica de gerencia

`MapaVisita.tsx` / `DetalleVisitaPanel.tsx` ya leen `coord_cliente` de la resolución — no necesitan
cambios para mostrar la posición real de esa visita. Mostrar un badge "ajustada por el vendedor"
usando `coord_cliente_ajustada` queda **fuera de este alcance**: es un follow-up posible (permitiría
un reporte de "clientes con coordenada del ERP probablemente mal cargada"), no parte de esta
iteración.

## Testing

- `IniciarVisitaMapa.test.tsx`: armar modo → tap en el mapa mueve el pin y recalcula distancia sin
  esperar un nuevo `watchPosition`; "Restablecer" vuelve a la coordenada original; "Iniciar visita"
  deshabilitado mientras el modo está armado.
- `VisitaFlow.test.tsx`: reposicionar el cliente destraba `onIniciar` cuando el vendedor está lejos de
  la coordenada original pero cerca de la reposicionada; `coordCliente` viaja en el payload solo
  cuando hay override; `coordInicio` enviado sigue siendo la posición real del vendedor en todos los
  casos.

## Fuera de alcance

- Cualquier escritura a `fct_clients` o al ERP.
- Límite de usos o confirmación nativa (`window.confirm`) — no aplica, ver arriba.
- Badge/reporte de "coordenada ajustada" en las vistas de analítica — follow-up posible, no esta
  iteración.
- Editar el ajuste después de iniciada la visita — `pl_resolucion` es inmutable.
