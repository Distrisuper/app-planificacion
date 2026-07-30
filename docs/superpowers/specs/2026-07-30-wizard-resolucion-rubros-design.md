# Wizard de resolución de rubros (guardado diferido)

## Contexto

`docs/superpowers/specs/2026-07-27-planificacion-visitas-design.md` (repo `api-vendedores`) define
el modelo de resolución por rubro (`pl_visita_rubro_motivo`). El análisis
[[Resoluciones de visita — cómo las escribe el vendedor (análisis de 50 casos)]] (Obsidian,
`03 Resources/`) mide la fricción del front actual sobre ese modelo: **15 taps y 5 round-trips**
para resolver una visita típica de 5 rubros, porque `VisitaSheet.tsx` abre `ResolucionRubro.tsx`
como sub-vista por rubro, con un `PUT` inmediato en cada "Guardar" (`VisitaSheet.tsx:79-91`).

Este spec **no** adopta la propuesta de agrupar rubros en un lote con un desenlace común (opción
"A" del análisis, §11-12) — queda abierta esa decisión sobre si el vendedor piensa en rubros o en
líneas (rubro × marca). En su lugar resuelve la parte del pedido del usuario que es independiente
de esa decisión: **navegación fluida entre rubros (atrás/siguiente) y un solo guardado al final**
en vez de un `PUT` por rubro.

## Qué cambia

- `src/components/VisitaSheet.tsx`
- `src/components/propuesta/ResolucionRubro.tsx`

No cambia: `src/components/ResolucionSheet.tsx` (flujo de "No visité", motivo a nivel visita, sin
relación con esto), el catálogo de motivos, `IRubroMotivo`, el backend (sigue siendo un
`PUT /planificacion/visitas/:id/rubros/:rubroId` por rubro — cambia cuándo se dispara, no el
contrato), ni la lista de rubros en sí (tarjetas, trash de no-propuestos, "Ver versus").

## Modelo de estado

`VisitaSheet` reemplaza el estado actual de un solo borrador:

```ts
const [activo, setActivo] = useState<IVisitaRubro | null>(null)
const [borrador, setBorrador] = useState<IRubroMotivo[]>([])
```

por:

```ts
const [wizard, setWizard] = useState<{ rubros: IVisitaRubro[]; index: number } | null>(null)
const [borradores, setBorradores] = useState<Record<number, IRubroMotivo[]>>({})
const [fallidos, setFallidos] = useState<Record<number, string>>({}) // rubroId -> mensaje
```

- `wizard.rubros` es la sublista sobre la que se navega: en visita **no cerrada**, todos los
  rubros; en visita **cerrada**, solo los `!resuelto` (mismo criterio que hoy define `editable` en
  la lista). Se calcula una vez al entrar al wizard, no se recalcula mientras está abierto (evita
  que guardar el rubro 2 reordene la lista debajo del vendedor mientras sigue en el 3).
- `borradores` vive en `VisitaSheet`, no en `ResolucionRubro` — así sobrevive a moverse entre
  rubros y a salir/reentrar al wizard dentro de la misma sesión del sheet. Se inicializa por rubro
  con `rubro.motivos` la primera vez que se visita ese rubro (igual que hoy hace `abrirRubro`).
- Ambos se resetean junto con `activo`/`borrador` en el `useEffect` de `!open` que ya existe
  (`VisitaSheet.tsx:64-71`) — abrir la visita de otro cliente no debe arrastrar nada.

## Layout

Se mantiene el contenido tal cual está hoy (mismo estilo de card de motivos, mismo bloque de
detalle para Precio) — solo se reordena el chrome de navegación:

```
┌──────────────────────────────────────────┐
│ ‹ Volver          Pastillas        3 de 5│  ← header: contexto/salida
├──────────────────────────────────────────┤     (el contador reemplaza el label
│  ☑ Saqué pedido                          │      estático "Resolución")
│  ☐ Precio  ☐ DS  ☐ Flete                 │
│  ☐ No lo ofrecí                          │
│                                          │
│  [detalle Precio si aplica]              │
├──────────────────────────────────────────┤
│   [ ‹ Atrás ]        [ Siguiente › ]     │  ← rubros 1..N-1: navegación pura,
└──────────────────────────────────────────┘     sin acción de guardado visible

┌──────────────────────────────────────────┐
│ ‹ Volver          Pastillas        5 de 5│
├──────────────────────────────────────────┤
│  ...                                     │
├──────────────────────────────────────────┤
│   [ ‹ Atrás ]        [ Finalizar ]       │  ← último rubro: "Siguiente" se
└──────────────────────────────────────────┘     reemplaza por la acción de guardado
```

Convención mobile: las acciones primarias van abajo (zona de alcance del pulgar), el header es
para contexto/salida, no para avanzar pasos — así se evita que "Volver" (sale del wizard) y
"Atrás" (retrocede un rubro) compitan por el mismo affordance visual si ambos fueran una flecha
`‹` desnuda en la misma posición. Ya es el patrón que sigue el resto de la app: `Guardar`,
`Cerrar visita`, `Registrar` están anclados abajo en todos los sheets existentes
(`ResolucionSheet.tsx`, `VisitaSheet.tsx`); este diseño no introduce una convención nueva.

**No hay un botón "Guardar todo" separado y persistente.** La primera versión de este spec
proponía uno, visible en todos los pasos, para cubrir el caso de un vendedor interrumpido a
mitad de recorrido. En la práctica, un botón de guardado al lado de "Siguiente" en cada paso
resultó redundante: el vendedor ya está recorriendo los rubros en orden, así que la acción
natural de "terminar" es la misma que "guardar". Se resolvió fusionándolas: el botón derecho de
la fila de navegación es "Siguiente" en todos los rubros salvo el último, donde pasa a ser
"Finalizar" — un solo tap, sin decidir entre dos botones. El costo aceptado es que si el
vendedor sale con "Volver" antes de llegar al último rubro, lo tildado en esa sesión **no se
guarda** (ver "Guardado" más abajo).

Cuando hay `fallidos`, "Finalizar" pasa a "Reintentar (N)" con estado de alerta (mismo
`text-dsred` que ya usa `VisitaSheet.tsx` para errores) y la lista corta de rubros fallidos
aparece **arriba** del botón, no reemplazándolo — así no hace falta scrollear para verla.

## Navegación

- Tocar un rubro en la lista llama `abrirWizard(rubros, index)`, donde `index` es la posición del
  rubro tocado dentro de `wizard.rubros`. El vendedor entra viendo justo el rubro que tocó, no
  siempre el primero — sorprendería lo contrario.
- Header del wizard: `‹ Volver` (sale a la lista, no descarta `borradores`) + contador de posición
  "2 de 5" (cuenta sobre `wizard.rubros.length`, no sobre el total de rubros de la visita, porque
  en visita cerrada el total incluye resueltos que no se están recorriendo).
- Footer de una sola fila, dos botones: `‹ Atrás` (disabled en `index === 0`) y un botón derecho
  cuyo rol cambia con la posición — no el texto de un botón fijo, sino qué botón ES:
  - En cualquier rubro salvo el último: `Siguiente ›`, navega sin guardar nada.
  - En el último rubro: el mismo lugar pasa a ser `Finalizar`, que dispara el guardado en lote
    (ver "Guardado") y, si no queda ningún rubro fallido, cierra el wizard y vuelve a la lista.
  - Se descartó un botón `Guardar todo` separado y persistente en todos los pasos (ver rationale
    en "Layout"): resultaba redundante con recorrer los rubros en orden hasta el final.
  - `Finalizar` se deshabilita solo si hay un motivo con `requiereDetalle` incompleto en algún
    rubro con cambios pendientes (ver "Validación de detalle"); si no hay nada pendiente para
    guardar, igual queda habilitado — tocarlo simplemente cierra el wizard sin llamar a la API.
  - Swipe horizontal entre rubros queda **fuera de este spec** (no lo pidió el usuario y agrega
    superficie de gestos a testear); los botones son la única forma de navegar.

## Guardado

- `Finalizar` (el botón derecho del footer en el último rubro, ver "Navegación") dispara un `PUT`
  por cada rubro con cambios pendientes, en paralelo vía `Promise.allSettled` (no `Promise.all`):
  un fallo no debe cancelar ni revertir el resto, porque el vendedor ya invirtió el tap pensando
  en los 5, no quiere que 1 error tire los otros 4 al bidón.
- Si no hay ningún cambio pendiente, `Finalizar` no llama a la API — solo cierra el wizard.
- Éxito por rubro: se saca de "cambios pendientes" (se sincroniza `borradores[id]` contra lo que
  el server confirmó, vía la misma invalidación de query que ya hace `useResolverRubro` —
  `rubroKeys.deVisita` + `agendaKeys.semana`), y sale de `fallidos` si estaba ahí de un intento
  previo. Si **todos** los rubros con cambios guardaron bien, el wizard se cierra solo y vuelve a
  la lista — "Finalizar" cumple su nombre.
- Fallo por rubro: entra a `fallidos[rubroId] = mensaje`. El borrador **no se descarta** — mismo
  principio que ya está documentado en el código actual (`VisitaSheet.tsx:86-89`: perder lo
  tipeado por un bache de señal entrena al vendedor a no volver a cargarlo). El wizard queda
  abierto (no cierra con fallos pendientes) mostrando cuáles fallaron.
- Mientras haya entradas en `fallidos`, el botón pasa a `Reintentar (N)` — reintenta **solo** los
  rubros en `fallidos`, no vuelve a mandar los que ya guardaron. Arriba del botón, un texto corto
  lista cuáles fallaron por nombre de rubro (no un toast genérico "algo salió mal": el vendedor
  necesita saber *cuál* de los 5 quedó sin guardar si decide cerrar la visita igual y volver
  después).
- Mientras el guardado está en curso, el botón muestra estado `loading` (patrón ya usado en
  `Button` con la prop `loading`) y queda deshabilitado — evita doble-submit si el vendedor lo
  toca dos veces por ansiedad de conexión lenta.
- **Salir con "Volver" antes de llegar al último rubro no guarda nada.** Es la contracara
  deliberada de no tener un botón de guardado persistente (ver "Layout"/"Navegación"): mantiene
  el modelo simple — una sola acción de guardado, al final del recorrido — a costa de que
  interrumpir el wizard a mitad de camino pierde lo tildado en esa sesión (vuelve a aparecer en
  blanco la próxima vez que se entre a esos rubros). Se evaluó autoguardar al tocar "Volver", pero
  se descartó: agrega una llamada a la red en una acción que hoy es puramente local, y contradice
  el pedido original de "guardar todo de una, no cada resolución".

## Validación de detalle (Precio)

- Igual que hoy: un motivo con `requiereDetalle` exige marca + competidor + `%`
  (`detalleCompleto` en `ResolucionRubro.tsx:20-22`). Este chequeo **no bloquea la navegación**
  (`Atrás`/`Siguiente` siguen libres) — bloquear ahí obligaría a completar el detalle antes de
  poder ver el rubro siguiente, que es la misma fricción de "de a uno" que se está sacando.
- Sí bloquea `Guardar todo`: si algún rubro con cambios pendientes tiene un motivo
  `requiereDetalle` incompleto, el botón queda disabled y aparece un aviso señalando **en qué
  rubro** falta completar el detalle (con su posición, ej. "Completá el detalle de Precio en
  Pastillas (rubro 3 de 5)") — no alcanza con decir "faltan datos", porque el vendedor ya no está
  parado en ese rubro cuando lee el aviso.

## Testing

- `VisitaSheet.test.tsx` ya cubre el flujo actual de abrir/resolver/guardar un rubro; se
  actualiza para el modelo de wizard: navegar Atrás/Siguiente conserva el borrador del rubro que
  se abandona, `Guardar todo` dispara un `PUT` por rubro con cambios (y ninguno por los que no
  cambiaron), un fallo parcial dispara reintento selectivo, y el detalle incompleto bloquea
  `Guardar todo` sin bloquear la navegación.
