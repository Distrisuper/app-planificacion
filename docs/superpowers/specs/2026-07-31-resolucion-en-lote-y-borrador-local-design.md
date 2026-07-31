# Resolución en lote + borrador local — Diseño

## Contexto

Hoy, en `VisitaSheet`, resolver los rubros de una visita es 100% secuencial: el
vendedor toca "Resolución" en un rubro, entra a un wizard que recorre TODOS los
rubros de a uno, y cada vez que avanza o toca "Finalizar" se guarda contra el
backend (`useResolverRubros`, en lote pero por cada acción del wizard).

Esto trae dos problemas de uso real:

1. **No hay forma rápida de aplicar la misma resolución a varios rubros a la
   vez.** Si el vendedor no ofreció 4 de 6 rubros por "Precio", tiene que
   entrar rubro por rubro y tildar "Precio" en cada uno.
2. **Se guarda contra el backend en cada paso del wizard**, en vez de una sola
   vez al cerrar la visita. Esto no tiene beneficio real (no hay nadie más
   editando la misma visita al mismo tiempo) y complica el manejo de errores
   parciales (rubros guardados vs. fallidos a mitad de recorrido).

Este documento cubre ambos cambios juntos porque están acoplados: la selección
múltiple solo tiene sentido si el guardado deja de ser por-acción y pasa a ser
un borrador local que se aplica todo junto al cerrar la visita.

## Alcance

**Adentro:**
- Selección múltiple de rubros desde la lista, para aplicar una misma
  resolución (motivos, con detalle compartido si incluye "Precio") a varios
  rubros de una sola vez.
- Borrador local persistido en `localStorage`, por visita: todo lo que el
  vendedor va tildando (wizard individual o lote) vive ahí hasta que cierra
  la visita.
- "Cerrar visita" pasa a ser el único punto que guarda contra el backend, y
  queda deshabilitado mientras falte resolver algún rubro.

**Afuera (no tocar en esta iteración):**
- Agregar/Eliminar rubro: siguen guardando contra el backend al toque, sin
  cambios. Son altas/bajas de "qué rubros existen en la visita", no progreso
  de resolución — necesitan un `rubroId` real del servidor para que el
  borrador tenga contra qué escribir.
- El caso de una visita **ya cerrada hoy en producción** con rubros sin
  cargar (dato histórico, previo a este cambio) — se decidió ignorarlo por no
  ser un caso real. `esEditable` deja de contemplarlo: una visita cerrada es
  siempre de solo lectura.
- Deshacer selección/lote una vez aplicado (el vendedor puede volver a entrar
  al wizard individual o a un nuevo lote para corregir un motivo).

## Persistencia del borrador — sin librería nueva

El proyecto ya tiene el patrón exacto para esto en `src/lib/visitaTimer.ts`:
funciones sueltas sobre `localStorage.getItem/setItem`, keyeadas por
`visitaId`, sin Context ni librería de estado. Se replica la misma forma en
un archivo nuevo, `src/lib/resolucionDraft.ts`:

```ts
import type { IRubroMotivo } from '@/types/planificacion'

type Borrador = Record<number, IRubroMotivo[]>

function key(visitaId: number): string {
    return `visita-borrador-${visitaId}`
}

export function leerBorrador(visitaId: number): Borrador | null {
    const raw = localStorage.getItem(key(visitaId))
    if (raw == null) return null
    try {
        return JSON.parse(raw) as Borrador
    } catch {
        return null
    }
}

export function guardarBorrador(visitaId: number, borrador: Borrador): void {
    localStorage.setItem(key(visitaId), JSON.stringify(borrador))
}

export function limpiarBorrador(visitaId: number): void {
    localStorage.removeItem(key(visitaId))
}
```

No se evaluó Zustand/Redux/idb-keyval ni similares: el payload es un puñado de
rubros con 3-4 campos cada uno (motivoId, marca, competidor, pctDiferencia),
muy por debajo de cualquier límite de tamaño de `localStorage`, y agregar una
librería de estado para dos funciones de lectura/escritura sería
sobre-ingeniería para este caso.

**Por qué esto es seguro:** los datos históricos ya persistidos en el backend
(`r.motivos`) siguen siendo la fuente de verdad al ABRIR la visita — el
borrador solo cubre lo que el vendedor todavía no mandó. Si nunca tocó nada,
`leerBorrador` devuelve `null` y se arranca desde `r.motivos` de cada rubro,
igual que hoy.

## `VisitaSheet`: borrador como estado real, no como estado del wizard

Hoy `borradores` se inicializa perezosamente dentro de `abrirWizard()`. Pasa a
inicializarse al abrir el sheet, para TODA la visita:

```ts
useEffect(() => {
    if (!open) return
    const persistido = leerBorrador(visitaId)
    setBorradores(prev => {
        const next = { ...(persistido ?? {}) }
        for (const r of rubros) if (!(r.id in next)) next[r.id] = r.motivos
        return next
    })
}, [open, visitaId, rubros])
```

Y cada cambio se persiste solo (sin debounce — el payload es chico y los
cambios no son de alta frecuencia, tildar un checkbox no es un keystroke):

```ts
useEffect(() => {
    if (!open) return
    guardarBorrador(visitaId, borradores)
}, [open, visitaId, borradores])
```

Esto reemplaza los estados `guardados` y `fallidos` que existen hoy en
`VisitaSheet` — ya no hacen falta: `guardados` se comparaba contra la última
versión confirmada del servidor para saber qué mandar en el próximo guardado
parcial, pero ahora solo hay UN guardado (al cerrar), y ahí se compara
directo contra `rubros` (la query en vivo, fuente de verdad del servidor).
`fallidos` por-rubro-durante-la-edición desaparece porque ya no hay
guardados parciales que puedan fallar a mitad de recorrido.

**La lista pinta el borrador, no el dato del servidor:**

```tsx
<RubroCard
    nombre={r.rubroDescripcion}
    motivosCargados={(borradores[r.id] ?? r.motivos).length}
    onResolucion={editable ? () => abrirWizard(r) : undefined}
/>
```

Así, aplicar una resolución en lote a 3 rubros los pinta como resueltos al
toque en la lista, aunque nada se mandó todavía al backend.

**`esEditable` se simplifica:**

```ts
function esEditable(_r: IVisitaRubro) {
    return !visitaCerrada
}
```

(Antes contemplaba "cerrada pero con `!r.resuelto`" para permitir completar
después del cierre; se descarta ese caso por decisión explícita — no es un
caso real hoy.)

## Wizard y lote dejan de guardar contra el backend

**`ResolucionWizard` / `ResolucionWizardAcciones`:** el checklist de motivos
sigue escribiendo en `borradores` en cada tilde, exactamente como hoy
(`onChange` ya actualiza el estado en memoria de inmediato — eso no cambia).
Lo que cambia es `finalizar()` en `VisitaSheet`: deja de llamar a
`resolverTodos.mutateAsync`. Pasa a ser solamente:

```ts
function finalizar() {
    setWizard(null)
}
```

Con esto, `ResolucionWizardAcciones` pierde toda la lógica de `guardando`,
`fallidos`, y el label "Reintentar (N)" — "Finalizar" vuelve a ser un botón
simple, sin loading state, que cierra el wizard. La única validación que se
mantiene es el bloqueo por motivo incompleto (`motivoIncompleto`), porque
sigue sin tener sentido dejar avanzar con "Precio" tildado sin marca/
competidor/%.

**Selección múltiple (nueva):**

1. En la lista, cada fila editable suma un checkbox a la izquierda de la
   card (mismo lugar donde ya vive el tacho de basura, pero del otro lado).
   Tocar el cuerpo de la fila tilda/destilda el checkbox. Tocar el botón
   "Resolución" sigue abriendo el wizard individual, sin cambios. Fila
   seleccionada: mismo resaltado que ya usan los motivos tildados (borde +
   fondo celeste claro).

2. Con 1+ seleccionados, el pie fijo dejar de mostrar "Cerrar visita" y en su
   lugar muestra: **"N seleccionados"** + **Cancelar** (limpia la selección)
   + **Resolver seleccionados**. El resto de la lista (Agregar rubro, Ver
   versus) sigue arriba, sin bloquearse.

3. "Resolver seleccionados" abre una vista nueva (`vista === 'resolverLote'`,
   header "Resolver N rubros" + volver) que reutiliza el mismo componente
   `ResolucionRubro` con un único borrador compartido — un solo checklist de
   motivos + panel de detalle de "Precio" si corresponde. Pie: **Cancelar**
   / **Aplicar a N rubros** (deshabilitado si "Precio" está tildado sin
   detalle completo, misma regla de `motivoIncompleto`).

4. Al tocar "Aplicar a N rubros": los motivos del borrador compartido se
   **fusionan** (por `motivoId`) con los que ya tuviera cada rubro
   seleccionado en `borradores` — si un rubro ya tenía "Saqué pedido" y el
   lote agrega "DS", queda con ambos; si "Precio" ya estaba con otro detalle,
   el del lote lo pisa. Esto actualiza `borradores` en memoria (y por lo
   tanto `localStorage`, vía el efecto de arriba) para todos los
   seleccionados, limpia la selección, y vuelve a la lista. **Sin llamada al
   backend** — igual que el wizard individual.

```ts
function aplicarLote(motivosCompartidos: IRubroMotivo[]) {
    setBorradores(prev => {
        const next = { ...prev }
        for (const rubroId of seleccionados) {
            const actual = next[rubroId] ?? []
            const porId = new Map(actual.map(m => [m.motivoId, m]))
            for (const m of motivosCompartidos) porId.set(m.motivoId, m)
            next[rubroId] = [...porId.values()]
        }
        return next
    })
    setSeleccionados(new Set())
    setVista('list')
}
```

## "Cerrar visita": único punto de guardado

`pendientes` deja de calcularse contra `r.resuelto` (dato del servidor, que
ya no se actualiza incrementalmente) y pasa a calcularse contra el borrador:

```ts
function rubroCompleto(r: IVisitaRubro): boolean {
    const motivos = borradores[r.id] ?? r.motivos
    return motivos.length > 0 && !tieneDetalleIncompleto(catalogoMotivos, motivos)
}

const pendientes = rubros.filter(r => !rubroCompleto(r)).length
```

El botón "Cerrar visita" queda **deshabilitado** mientras `pendientes > 0`
(reemplaza el cartel actual de "podés cerrar y completar después" por uno
que solo informa cuánto falta, sin invitar a cerrar incompleto):

```
Faltan completar {pendientes} {pendientes === 1 ? 'rubro' : 'rubros'} para
poder cerrar la visita.
```

Al tocarlo (con `pendientes === 0`), `VisitaSheet` primero manda TODO lo que
cambió contra `rubros` (la query en vivo) en un solo batch, y solo si eso
sale bien limpia el borrador y dispara `onCerrarVisita` (el prop que ya
maneja `VisitaFlow` — geolocalización + el endpoint real de cierre, sin
cambios ahí):

```ts
async function cerrarConBorrador() {
    const cambios = rubros
        .filter(r => !motivosIguales(borradores[r.id] ?? [], r.motivos))
        .map(r => ({ rubroId: r.id, motivos: borradores[r.id] ?? [] }))

    if (cambios.length > 0) {
        setGuardandoBorrador(true)
        try {
            const resultados = await resolverTodos.mutateAsync(cambios)
            if (resultados.some(r => r.error)) {
                setErrorGuardado(
                    'No se pudo guardar la resolución de algunos rubros. Volvé a intentar.',
                )
                return
            }
        } finally {
            setGuardandoBorrador(false)
        }
    }

    limpiarBorrador(visitaId)
    onCerrarVisita()
}
```

Si el batch falla, no se limpia el borrador ni se llama a `onCerrarVisita` —
el vendedor puede tocar "Cerrar visita" de nuevo para reintentar, y no perdió
nada (sigue en `localStorage`).

## Componentes afectados

- `src/lib/resolucionDraft.ts` — **nuevo**. Lectura/escritura/limpieza del
  borrador en `localStorage`.
- `src/components/VisitaSheet.tsx` — inicialización del borrador al abrir,
  persistencia en cada cambio, `esEditable` simplificado, `pendientes`
  calculado contra el borrador, `cerrarConBorrador`, checkboxes de selección
  en la lista, barra de acciones en lote, nueva `vista === 'resolverLote'`.
- `src/components/propuesta/ResolucionWizardAcciones.tsx` — pierde
  `guardando`/`fallidos`/loading state; "Finalizar" vuelve a ser un botón
  simple.
- `src/components/propuesta/RubroCard.tsx` — sin cambios de props; quien lo
  llama le pasa `motivosCargados` calculado desde el borrador en vez de
  `r.motivos.length`.
- **Nuevos:** un componente para la barra de selección en el pie (N
  seleccionados / Cancelar / Resolver seleccionados) y uno para el pie de la
  vista "resolver en lote" (Cancelar / Aplicar a N rubros) — mismo patrón que
  ya sigue `ResolucionWizardAcciones` (pie fijo, fuera del scroll).
- `src/hooks/useRubros.ts` — sin cambios (`useResolverRubros` se sigue
  usando, ahora desde un solo lugar).

## Testing

- `resolucionDraft.test.ts`: leer/guardar/limpiar, y que un JSON corrupto en
  `localStorage` no rompe (cae a `null`, arranca desde `r.motivos`).
- `VisitaSheet.test.tsx`: el borrador sobrevive a cerrar/reabrir el sheet
  dentro de la misma sesión (mock de `localStorage`); "Cerrar visita"
  deshabilitado con pendientes; el batch de guardado se dispara una sola vez
  al cerrar, no en cada tilde; selección múltiple aplica y fusiona motivos
  correctamente; un batch fallido no limpia el borrador ni cierra la visita.
- `ResolucionWizardAcciones.test.tsx`: se simplifica bastante — ya no hay
  casos de `guardando`/`fallidos` para cubrir.
- Nuevo componente de lote: filtra motivos con detalle compartido, aplica
  fusión por `motivoId` sobre varios rubros a la vez.
