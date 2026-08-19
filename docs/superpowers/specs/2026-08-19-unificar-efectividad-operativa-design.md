# Unificar /analitica en un solo bloque de Efectividad operativa

Fecha: 2026-08-19

## Contexto

`EfectividadOperativaSection` se agregó a `/analitica` (commits recientes) pensada como bloque
independiente, con su propio selector de mes. Pero quedó montada **junto al** cuadro viejo
(`KpisEquipo` + `TablaVendedores` + `ObjecionesMercado`, alimentados por el filtro global
`FiltrosAnalitica`/`useFiltroAnalitica`), así que la pantalla terminó mostrando dos cuadros de
métricas distintos y dos filtros de fecha independientes y sin relación visible entre sí.

El pedido es que `/analitica` (tab "Analítica de visitas") muestre un único bloque: el más simple,
Efectividad operativa, con filtro de semana o mes.

## Qué cambia

### 1. Selector de período: `SelectorMes` → `SelectorPeriodo`

Nuevo componente `src/components/analitica/SelectorPeriodo.tsx`, reemplaza a `SelectorMes.tsx`.

- Props: `{ modo: 'semana' | 'mes', fecha: Date, onCambiarModo: (m) => void, onCambiarFecha: (f) => void }`.
- Toggle **Semana / Mes** (dos botones) + flechas prev/next (`ChevronLeft`/`ChevronRight`, igual que
  hoy) + label central.
- Label: en modo mes usa `nombreMes(fecha)` (sin cambios). En modo semana muestra
  `"DD/MM al DD/MM"` del lunes/viernes de esa semana.
- Flechas: en modo mes avanzan ±1 mes (comportamiento actual de `SelectorMes`); en modo semana
  avanzan ±7 días.
- Cambiar de modo (mes→semana o semana→mes) resetea `fecha` a `new Date()` (hoy) — evita arrastrar,
  por ejemplo, un 31 de un mes largo a una semana que no existe en el mes corto, o quedar reviendo
  una semana vieja al volver a modo mes.

Nueva función en `src/lib/fechas.ts`:

```ts
/** Lunes y viernes de la semana calendario que contiene `fecha`, en formato YYYY-MM-DD. */
export function rangoSemana(fecha: Date): { desde: string; hasta: string }
```

Misma lógica que hoy vive inline en `useFiltroAnalitica.semanaEnCurso()` (lunes = `getDay()===0?7:getDay()`
para tratar domingo como día 7), pero parametrizada por fecha y expuesta como utilidad, análoga a
`rangoMes`. `semanaEnCurso()` en `useFiltroAnalitica.ts` no se toca — sigue usándose para el default de
`/analitica/actividad` y `/analitica/ruta`, que están fuera de alcance.

### 2. `EfectividadOperativaSection`

- Estado local pasa de `useState<Date>` a `{ modo: 'semana' | 'mes', fecha: Date }` (dos `useState`
  o un solo objeto, a criterio de implementación).
- `filtro = modo === 'mes' ? rangoMes(fecha) : rangoSemana(fecha)`.
- Se agrega `<ObjecionesMercado desde={filtro.desde} hasta={filtro.hasta} />` debajo de
  `TablaEfectividadOperativa`, dentro del mismo `<section>`, visible en el mismo estado que hoy
  muestra la tabla (`data && data.vendedores.length > 0`).
- Navegación a detalle: se agrega `useNavigate` y una función `irAVendedor(codigo)` que arma
  `?desde=${filtro.desde}&hasta=${filtro.hasta}` y navega a `/analitica/vendedor/${codigo}` — mismo
  patrón que hoy tiene `AnaliticaPage.irAVendedor`, movido acá.

### 3. `TablaEfectividadOperativa`

- Gana prop `onElegirVendedor: (codigo: string) => void`.
- Cada fila de vendedor (no la de promedios) se vuelve clickeable: `cursor-pointer hover:bg-blue-50`
  en la fila y `onClick={() => onElegirVendedor(v.codigoParticularVendedor)}` — mismo patrón visual
  que ya usa `TablaVendedores`.

### 4. `AnaliticaPage`

Queda reducida a: header (tabs + `AccountMenu`) + `<EfectividadOperativaSection />`. Se eliminan:

- El uso de `FiltrosAnalitica`, `useFiltroAnalitica`, `useResumen`, `useVendedores`, `KpisEquipo`,
  `TablaVendedores`, `ObjecionesMercado` y la función `irAVendedor` — todo se movió o dejó de hacer
  falta.
- Los estados de carga/error/"sin ciclos" que hoy dependían del `useResumen` de la página: pasan a
  vivir solo dentro de `EfectividadOperativaSection` (ya los tiene).

### 5. Archivos que se borran

`KpisEquipo.tsx`, `TablaVendedores.tsx` y sus tests (`TablaVendedores.test.tsx`) — confirmado que no
los usa nadie más que `AnaliticaPage` (`AnaliticaActividadPage` y `RutaPage` no los importan).
`SelectorMes.tsx` se borra también, reemplazado por `SelectorPeriodo.tsx`.

`FiltrosAnalitica.tsx` y `useFiltroAnalitica.ts` **no se tocan**: los siguen usando
`AnaliticaActividadPage` (tab "Actividad") y `RutaPage` (tab "Ruta"), que quedan fuera de alcance.

## Fuera de alcance

- `/analitica/actividad` y `/analitica/ruta`: sin cambios, siguen con el filtro global
  desde/hasta + multi-vendedor tal cual.
- Selector de vendedor puntual en la nueva sección: se resuelve con click-through a
  `/analitica/vendedor/:codigo` (esa página ya funciona solo con query params `desde`/`hasta`,
  sin depender de si el rango vino de una semana o un mes).
- Orden de columnas / semáforo en `TablaEfectividadOperativa`: sigue sin ellos, por diseño (ver
  comentario existente en el componente).

## Testing

- `SelectorPeriodo`: toggle cambia modo y resetea fecha a hoy; flechas avanzan/retroceden según modo.
- `rangoSemana`: casos de borde de fin de semana/año (igual cobertura que ya tiene `rangoMes`).
- `EfectividadOperativaSection`: filtro cambia correctamente con cada modo; `ObjecionesMercado` recibe
  el rango vigente; click en fila navega con los query params correctos.
- `AnaliticaPage`: test existente que verificaba el cuadro viejo se elimina o se reemplaza por uno que
  confirma que solo se monta `EfectividadOperativaSection`.
