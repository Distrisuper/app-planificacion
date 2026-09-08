# Reposicionar cliente al iniciar visita (frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En `IniciarVisitaMapa`, el vendedor puede reposicionar el pin del cliente (armar modo → tap en el mapa) para destrabar el gate de ≤100 m de esa visita puntual; el ajuste viaja como `coordCliente` en `POST /planificacion/visitas` y, si el backend avisa que ya se agotó el cupo de corrección permanente, se lo notifica con un aviso discreto.

**Architecture:** El ajuste vive enteramente en `IniciarVisitaMapa` (mueve su propio pin/círculo Leaflet y recalcula la distancia contra el último fix del vendedor, sin esperar el próximo tick de `watchPosition`) y se informa hacia arriba con un callback (`onReposicionar`). `VisitaFlow` solo guarda ese valor para mandarlo en el payload de `iniciar` y para la segunda verificación de distancia — no vuelve a inyectarlo como prop en el mapa (evita recrear el mapa completo, que es lo que pasaría si `latitud`/`longitud` cambiaran, porque esas dos son dependencias del `useEffect` que lo construye).

**Tech Stack:** React 19, TypeScript, Leaflet (sin react-leaflet), Vitest + Testing Library.

## Global Constraints

- El spec vive en este mismo repo: `docs/superpowers/specs/2026-09-07-reposicionar-cliente-al-iniciar-visita-design.md`. El backend (repo `api-vendedores`, rama `feature/reposicionar-cliente-coord-cliente-ajustada`, plan en `docs/superpowers/plans/2026-09-07-reposicionar-cliente-coord-cliente-ajustada.md` de ese repo) ya acepta `coordCliente` opcional en `POST /planificacion/visitas` y devuelve `correccionPermanenteAplicada` (boolean, solo si se mandó `coordCliente`).
- El ajuste NUNCA persiste nada del lado del cliente salvo mandarlo en el momento de iniciar — no hay `localStorage`, no hay estado que sobreviva un refresh.
- `coordInicio` (la posición real del vendedor) NUNCA se pisa por el override — solo `coordCliente` se ve afectado.
- Sin `window.confirm` ni límite de usos del lado del front — eso lo resuelve el backend (best-effort, silencioso salvo el aviso de límite agotado).
- No tocar el contrato de `latitud`/`longitud` que ya recibe `IniciarVisitaMapa` — siguen siendo la coordenada ORIGINAL (warehouse), no la efectiva. El componente maneja el override internamente.

---

## Mapa de archivos

- Modificar: `src/components/IniciarVisitaMapa.tsx` — armar/desarmar modo, mover pin/círculo, recalcular, Restablecer.
- Modificar: `src/components/IniciarVisitaMapa.test.tsx` — mock de Leaflet (`on`, `setLatLng` en circle) + tests nuevos.
- Modificar: `src/components/VisitaFlow.tsx` — estado `clienteOverride`, wiring en `onIniciar`.
- Modificar: `src/components/VisitaFlow.test.tsx` — mock de Leaflet (`on`) + tests nuevos.
- Modificar: `src/types/planificacion.ts` — `IIniciarVisitaDTO.coordCliente`.
- Modificar: `src/api/planificacion.ts` — tipo de retorno de `iniciarVisita`.

---

### Task 1: `IniciarVisitaMapa` — armar modo, reposicionar, recalcular, restablecer

**Files:**
- Modify: `src/components/IniciarVisitaMapa.tsx`
- Test: `src/components/IniciarVisitaMapa.test.tsx`

**Interfaces:**
- Consumes: `distanciaMetros`, `estaFueraDeRango`, `RADIO_INICIO_METROS` (ya importados de `@/lib/distancia`, sin cambios de firma).
- Produces: nuevo prop `onReposicionar?: (coords: { lat: number; lng: number } | null) => void` — lo consume `VisitaFlow` en la Task 2.

- [ ] **Step 1: Actualizar el mock de Leaflet en el test (para que no rompa con `map.on`)**

En `src/components/IniciarVisitaMapa.test.tsx`, reemplazar el `vi.mock('leaflet', ...)` del encabezado:

```ts
vi.mock('leaflet', () => {
    const map = {
        setView: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        fitBounds: vi.fn(),
        on: vi.fn(),
    }
    const marker = { addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn() }
    const tileLayer = { addTo: vi.fn() }
    const circle = { addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn() }
    return {
        default: {
            map: vi.fn(() => map),
            tileLayer: vi.fn(() => tileLayer),
            marker: vi.fn(() => marker),
            circle: vi.fn(() => circle),
            divIcon: vi.fn(() => ({})),
        },
    }
})
```

- [ ] **Step 2: Correr la suite existente y confirmar que sigue en verde (antes de tocar el componente)**

Run: `npx vitest run src/components/IniciarVisitaMapa.test.tsx`
Expected: PASS (el mock nuevo es un superset del anterior, no cambia comportamiento todavía).

- [ ] **Step 3: Escribir los tests nuevos que fallan**

Agregar al final de `src/components/IniciarVisitaMapa.test.tsx`:

```ts
/** Devuelve el handler registrado con map.on('click', ...) en el render más reciente. */
async function getClickHandler() {
    const L = await import('leaflet')
    const map = (L.default.map as any).mock.results[0].value
    const call = map.on.mock.calls.find((c: any) => c[0] === 'click')
    return call[1] as (e: { latlng: { lat: number; lng: number } }) => void
}

it('arma el modo reposicionar, deshabilita Iniciar visita, y Cancelar lo desarma sin mover nada', async () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <IniciarVisitaMapa
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
        />,
    )
    expect(await screen.findByRole('button', { name: /iniciar visita/i })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: /reposicionar cliente/i }))
    expect(screen.getByText(/tocá el mapa para mover al cliente/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^iniciar visita$/i })).toBeDisabled()

    // "Cancelar reposición" (texto), no "Cancelar" (el aria-label del botón X del
    // header, que cierra TODO el mapa) — ver nota de accesibilidad en el Step 9.
    await userEvent.click(screen.getByRole('button', { name: /cancelar reposición/i }))
    expect(screen.queryByText(/tocá el mapa para mover al cliente/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^iniciar visita$/i })).toBeEnabled()
    expect(screen.queryByText(/posición ajustada/i)).not.toBeInTheDocument()
})

it('reposicionar mueve el pin, recalcula sin esperar un nuevo fix, y avisa el ajuste', async () => {
    const onReposicionar = vi.fn()
    // Fix del vendedor lejos del cliente original (mismo par usado en el test de
    // "acercate a menos de 100 m" ya existente): bloquea al abrir.
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.603, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <IniciarVisitaMapa
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
            onReposicionar={onReposicionar}
        />,
    )
    expect(await screen.findByText(/acercate a menos de 100 m/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^iniciar visita$/i })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /reposicionar cliente/i }))
    const handleClick = await getClickHandler()
    // Reposiciona EXACTO donde está el vendedor: distancia pasa a 0.
    handleClick({ latlng: { lat: -34.603, lng: -58.4 } })

    expect(onReposicionar).toHaveBeenCalledWith({ lat: -34.603, lng: -58.4 })
    expect(await screen.findByText(/posición ajustada para esta visita/i)).toBeInTheDocument()
    expect(screen.queryByText(/acercate a menos de 100 m/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^iniciar visita$/i })).toBeEnabled()
})

it('un click en el mapa SIN haber armado el modo no mueve nada', async () => {
    const onReposicionar = vi.fn()
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <IniciarVisitaMapa
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
            onReposicionar={onReposicionar}
        />,
    )
    await screen.findByRole('button', { name: /^iniciar visita$/i })
    const handleClick = await getClickHandler()
    handleClick({ latlng: { lat: -34.7, lng: -58.5 } })

    expect(onReposicionar).not.toHaveBeenCalled()
    expect(screen.queryByText(/posición ajustada/i)).not.toBeInTheDocument()
})

it('Restablecer vuelve a la coordenada original y avisa onReposicionar(null)', async () => {
    const onReposicionar = vi.fn()
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.603, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <IniciarVisitaMapa
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
            onReposicionar={onReposicionar}
        />,
    )
    await screen.findByText(/acercate a menos de 100 m/i)
    await userEvent.click(screen.getByRole('button', { name: /reposicionar cliente/i }))
    const handleClick = await getClickHandler()
    handleClick({ latlng: { lat: -34.603, lng: -58.4 } })
    await screen.findByText(/posición ajustada para esta visita/i)

    await userEvent.click(screen.getByRole('button', { name: /restablecer/i }))

    expect(onReposicionar).toHaveBeenLastCalledWith(null)
    expect(screen.queryByText(/posición ajustada/i)).not.toBeInTheDocument()
    // Vuelve a estar bloqueado: la coordenada original seguía lejos del vendedor.
    expect(await screen.findByText(/acercate a menos de 100 m/i)).toBeInTheDocument()
})
```

- [ ] **Step 4: Correr y confirmar que fallan**

Run: `npx vitest run src/components/IniciarVisitaMapa.test.tsx`
Expected: FAIL — no existe el botón "Reposicionar cliente" ni el prop `onReposicionar`.

- [ ] **Step 5: Implementar — props, refs, resets**

En `src/components/IniciarVisitaMapa.tsx`, actualizar el import de íconos (línea 4):

```ts
import { MapPin, Navigation, RotateCw, X } from 'lucide-react'
```

Agregar el prop a la interfaz (después de `onCancel`, dentro de `IniciarVisitaMapaProps`):

```ts
    onCancel: () => void
    /** El vendedor tocó el mapa con el modo de reposicionar armado. `null` = volvió a
     *  la coordenada original ("Restablecer"). Efímero: quien lo reciba lo manda como
     *  coordCliente al iniciar, y no necesita guardarlo en ningún otro lado — ver
     *  docs/superpowers/specs/2026-09-07-reposicionar-cliente-al-iniciar-visita-design.md. */
    onReposicionar?: (coords: { lat: number; lng: number } | null) => void
```

Agregar refs y estado nuevo (después de `const vendedorMarker = useRef<L.Marker | null>(null)`, línea 54):

```ts
    const clienteMarker = useRef<L.Marker | null>(null)
    const circuloRango = useRef<L.Circle | null>(null)
    // Espejo de `overrideCliente` en un ref, mismo motivo que `posicionRef`: los
    // callbacks de watchPosition/recalcular se crean una sola vez por apertura del
    // mapa y necesitan leer el override VIGENTE al momento del fix, no el de cuando
    // se armaron.
    const overrideRef = useRef<{ lat: number; lng: number } | null>(null)
    // Último fix crudo del vendedor (no el derivado que guarda posicionRef): hace
    // falta para recalcular distancia al instante cuando se reposiciona al cliente,
    // sin esperar el próximo tick de watchPosition.
    const vendedorFixRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null)
    const modoReposicionarRef = useRef(false)
    const [modoReposicionar, setModoReposicionar] = useState(false)
    const [overrideCliente, setOverrideCliente] = useState<{ lat: number; lng: number } | null>(
        null,
    )
```

En el `useEffect` de creación del mapa, en el bloque de resets al abrir (líneas 103-107), agregar:

```ts
        setSinUbicacion(false)
        setErrorActualizando(false)
        setPosicion(null)
        posicionRef.current = null
        setCalculando(true)
        setModoReposicionar(false)
        modoReposicionarRef.current = false
        setOverrideCliente(null)
        overrideRef.current = null
        vendedorFixRef.current = null
```

- [ ] **Step 6: Implementar — marker/círculo con ref, y el click del mapa**

Reemplazar (línea 113-119):

```ts
        L.marker([latitud, longitud], { icon: ICONO_CLIENTE }).addTo(map)
        L.circle([latitud, longitud], {
            radius: RADIO_INICIO_METROS,
            color: '#F97316',
            weight: 1,
            fillOpacity: 0.08,
        }).addTo(map)
```

por:

```ts
        clienteMarker.current = L.marker([latitud, longitud], { icon: ICONO_CLIENTE }).addTo(map)
        circuloRango.current = L.circle([latitud, longitud], {
            radius: RADIO_INICIO_METROS,
            color: '#F97316',
            weight: 1,
            fillOpacity: 0.08,
        }).addTo(map)

        // Solo dispara si el modo está armado (botón "Reposicionar cliente"): un tap
        // suelto para hacer zoom/pan no debe mover al cliente por accidente.
        function handleClickMapa(e: L.LeafletMouseEvent) {
            if (!modoReposicionarRef.current) return
            const { lat, lng } = e.latlng
            modoReposicionarRef.current = false
            setModoReposicionar(false)
            overrideRef.current = { lat, lng }
            setOverrideCliente({ lat, lng })
            clienteMarker.current?.setLatLng([lat, lng])
            circuloRango.current?.setLatLng([lat, lng])
            if (vendedorFixRef.current) {
                const { lat: vLat, lng: vLng, accuracy } = vendedorFixRef.current
                const distanciaM = distanciaMetros(lat, lng, vLat, vLng)
                marcarFixExitoso(distanciaM, estaFueraDeRango(distanciaM, accuracy))
            }
            onReposicionar?.({ lat, lng })
        }
        map.on('click', handleClickMapa)
```

- [ ] **Step 7: Recalcular contra el override en `watchPosition` y `handleRecalcular`, guardar el fix crudo**

En el callback de éxito de `watchPosition` (líneas 126-147), reemplazar:

```ts
                pos => {
                    setCalculando(false)
                    const { latitude, longitude, accuracy } = pos.coords
                    const distanciaM = distanciaMetros(latitud, longitud, latitude, longitude)
                    marcarFixExitoso(distanciaM, estaFueraDeRango(distanciaM, accuracy))
```

por:

```ts
                pos => {
                    setCalculando(false)
                    const { latitude, longitude, accuracy } = pos.coords
                    vendedorFixRef.current = { lat: latitude, lng: longitude, accuracy }
                    const punto = overrideRef.current ?? { lat: latitud, lng: longitud }
                    const distanciaM = distanciaMetros(punto.lat, punto.lng, latitude, longitude)
                    marcarFixExitoso(distanciaM, estaFueraDeRango(distanciaM, accuracy))
```

Y en `handleRecalcular` (líneas 174-180), reemplazar:

```ts
            pos => {
                setRecalculando(false)
                setCalculando(false)
                const { latitude, longitude, accuracy } = pos.coords
                const distanciaM = distanciaMetros(latitud, longitud, latitude, longitude)
                marcarFixExitoso(distanciaM, estaFueraDeRango(distanciaM, accuracy))
```

por:

```ts
            pos => {
                setRecalculando(false)
                setCalculando(false)
                const { latitude, longitude, accuracy } = pos.coords
                vendedorFixRef.current = { lat: latitude, lng: longitude, accuracy }
                const punto = overrideRef.current ?? { lat: latitud, lng: longitud }
                const distanciaM = distanciaMetros(punto.lat, punto.lng, latitude, longitude)
                marcarFixExitoso(distanciaM, estaFueraDeRango(distanciaM, accuracy))
```

- [ ] **Step 8: `handleComoLlegar` usa el punto vigente, y agregar `handleRestablecer`**

Reemplazar `handleComoLlegar` (líneas 205-210):

```ts
    function handleComoLlegar() {
        // Mismo punto que ve el vendedor en el mapa: si reposicionó al cliente, "Cómo
        // llegar" tiene que apuntar ahí, no a la coordenada original que ya se sabe mal.
        const punto = overrideRef.current ?? { lat: latitud, lng: longitud }
        window.open(
            `https://www.google.com/maps/dir/?api=1&destination=${punto.lat},${punto.lng}&travelmode=driving`,
            '_blank',
        )
    }

    function handleRestablecer() {
        overrideRef.current = null
        setOverrideCliente(null)
        clienteMarker.current?.setLatLng([latitud, longitud])
        circuloRango.current?.setLatLng([latitud, longitud])
        if (vendedorFixRef.current) {
            const { lat, lng, accuracy } = vendedorFixRef.current
            const distanciaM = distanciaMetros(latitud, longitud, lat, lng)
            marcarFixExitoso(distanciaM, estaFueraDeRango(distanciaM, accuracy))
        }
        onReposicionar?.(null)
    }

    function handleArmarReposicionar() {
        modoReposicionarRef.current = true
        setModoReposicionar(true)
    }

    function handleCancelarReposicionar() {
        modoReposicionarRef.current = false
        setModoReposicionar(false)
    }
```

- [ ] **Step 9: JSX — avisos y botón nuevo**

Después del bloque de `error` (línea 268, `{error && <p ...>}`) y antes del `<div className="mb-3 flex gap-2">` de los botones, agregar:

```tsx
                {modoReposicionar && (
                    <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-dashed border-[#F59E0B] bg-[#FFFBEB] px-3 py-2">
                        <span className="text-[12.5px] font-semibold text-[#92400E]">
                            Tocá el mapa para mover al cliente
                        </span>
                        <button
                            type="button"
                            onClick={handleCancelarReposicionar}
                            className="shrink-0 text-[12.5px] font-semibold text-dsmuted underline"
                        >
                            Cancelar reposición
                        </button>
                    </div>
                )}
```

Nota de accesibilidad: el botón "X" del header (línea ~223-231) tiene `aria-label="Cancelar"` sin texto visible; el botón de acá arriba tiene el texto visible "Cancelar reposición". Nombres accesibles distintos, sin ambigüedad — por eso el texto NO es simplemente "Cancelar" (colisionaría con `getByRole('button', { name: /cancelar/i })` apuntando a dos botones con funciones completamente distintas: uno cierra todo el mapa, el otro solo desarma el modo de reposicionar).
                {overrideCliente && !modoReposicionar && (
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-semibold text-dsmuted">
                            Posición ajustada para esta visita
                        </span>
                        <button
                            type="button"
                            onClick={handleRestablecer}
                            className="shrink-0 text-[12.5px] font-semibold underline text-[#213D82]"
                        >
                            Restablecer
                        </button>
                    </div>
                )}
```

Nota: el botón "Cancelar" de este bloque usa el mismo texto visible que el botón `aria-label="Cancelar"` del header (línea ~226) — en los tests, usar `getByRole('button', { name: /^cancelar$/i })` los distingue por texto exacto vs el `X` del header, que no tiene el texto "Cancelar" como nombre accesible (su `aria-label` es "Cancelar" también — **cuidado**: esto SÍ podría colisionar). Ver Step 10 para la resolución.

Reemplazar el bloque de botones (líneas 269-287) por una fila de tres:

```tsx
                <div className="mb-3 flex gap-2">
                    <Button
                        variant="outline"
                        onClick={handleRecalcular}
                        loading={recalculando}
                        className="h-11 min-w-0 flex-1 text-[13px]"
                    >
                        <RotateCw className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                        <span className="truncate">Recalcular posición</span>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleComoLlegar}
                        className="h-11 min-w-0 flex-1 text-[13px]"
                    >
                        <Navigation className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                        <span className="truncate">¿Cómo llegar?</span>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleArmarReposicionar}
                        disabled={modoReposicionar}
                        className="h-11 min-w-0 flex-1 text-[13px]"
                    >
                        <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                        <span className="truncate">Reposicionar cliente</span>
                    </Button>
                </div>
```

Y en el botón final "Iniciar visita" (línea ~288-295), agregar `modoReposicionar` al `disabled`:

```tsx
                <Button
                    onClick={onIniciar}
                    loading={iniciando}
                    disabled={calculando || fueraDeRango || modoReposicionar}
                    className="h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
                >
                    {iniciando ? 'Iniciando…' : calculando ? 'Calculando…' : 'Iniciar visita'}
                </Button>
```

- [ ] **Step 10: Correr los tests y confirmar que pasan**

Run: `npx vitest run src/components/IniciarVisitaMapa.test.tsx`
Expected: PASS (los 9 tests preexistentes + los 4 nuevos).

- [ ] **Step 11: Commit**

```bash
git add src/components/IniciarVisitaMapa.tsx src/components/IniciarVisitaMapa.test.tsx
git commit -m "feat(visita): reposicionar cliente en el mapa de iniciar visita"
```

---

### Task 2: `VisitaFlow` — enviar `coordCliente`, usarlo en el gate final, avisar el límite

**Files:**
- Modify: `src/components/VisitaFlow.tsx:1-16` (imports), `:52-137` (estado y `conUbicacion`), `:154-202` (`onIniciar`), `:291-316` (JSX del mapa)
- Modify: `src/types/planificacion.ts:349-355` (`IIniciarVisitaDTO`)
- Modify: `src/api/planificacion.ts:103-108` (`iniciarVisita`)
- Test: `src/components/VisitaFlow.test.tsx`

**Interfaces:**
- Consumes: `IniciarVisitaMapa` con el nuevo prop `onReposicionar` (Task 1).
- Produces: nada que otra tarea consuma — es la última pieza de este plan.

- [ ] **Step 1: Actualizar el mock de Leaflet en el test (para que no rompa con `map.on`)**

En `src/components/VisitaFlow.test.tsx`, el `vi.mock('leaflet', ...)` (líneas 13-27) necesita el mismo agregado que en la Task 1 — `on: vi.fn()` en `map`, y `setLatLng: vi.fn()` en `circle`:

```ts
vi.mock('leaflet', () => {
    const map = { setView: vi.fn().mockReturnThis(), remove: vi.fn(), fitBounds: vi.fn(), on: vi.fn() }
    const marker = { addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn() }
    const tileLayer = { addTo: vi.fn() }
    const circle = { addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn() }
    return {
        default: {
            map: vi.fn(() => map),
            tileLayer: vi.fn(() => tileLayer),
            marker: vi.fn(() => marker),
            circle: vi.fn(() => circle),
            divIcon: vi.fn(() => ({})),
        },
    }
})
```

- [ ] **Step 2: Correr la suite existente y confirmar que sigue en verde**

Run: `npx vitest run src/components/VisitaFlow.test.tsx`
Expected: PASS.

- [ ] **Step 3: Tipos — `coordCliente` en el DTO, tipo de retorno de `iniciarVisita`**

En `src/types/planificacion.ts:349-355`:

```ts
export interface IIniciarVisitaDTO {
    rotacionClienteId: number
    /** Obligatoria: el backend rechaza null con COORD_REQUERIDA. */
    coordInicio: string
    /** Solo si el vendedor reposicionó al cliente en el mapa (IniciarVisitaMapa) — la
     *  posición que ÉL confirmó, no la del warehouse. Formato "lat,lng", igual que
     *  coordInicio. */
    coordCliente?: string
    /** La propuesta tal como se le mostró al vendedor. Si no viene, el backend la recalcula. */
    propuesta?: IPropuestaRubroDTO[]
}
```

En `src/api/planificacion.ts:103-108`:

```ts
export const iniciarVisita = async (
    dto: IIniciarVisitaDTO,
): Promise<{ visitaId: number; ofrecimientos: number; correccionPermanenteAplicada?: boolean }> => {
    const res = await apiClient.post('/planificacion/visitas', dto)
    return res.data.data
}
```

- [ ] **Step 4: Escribir los tests que fallan**

Agregar a `src/components/VisitaFlow.test.tsx`:

```ts
/** Mismo helper que en IniciarVisitaMapa.test.tsx — necesario acá porque el mapa
 *  real (no mockeado) es parte del árbol que VisitaFlow renderiza. */
async function getClickHandler() {
    const L = await import('leaflet')
    const map = (L.default.map as any).mock.results[0].value
    const call = map.on.mock.calls.find((c: any) => c[0] === 'click')
    return call[1] as (e: { latlng: { lat: number; lng: number } }) => void
}

it('reposicionar destraba el gate y manda coordCliente al iniciar', async () => {
    // El vendedor está lejos de la coordenada ORIGINAL del cliente.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.603,-58.4',
        precisionM: 10,
    })
    renderFlow({ cliente: { ...cliente, latitud: -34.6, longitud: -58.4 } })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    expect(await screen.findByText(/acercate a menos de 100 m/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /reposicionar cliente/i }))
    const handleClick = await getClickHandler()
    // Reposiciona exacto donde está el vendedor.
    handleClick({ latlng: { lat: -34.603, lng: -58.4 } })

    const boton = await screen.findByRole('button', { name: /^iniciar visita$/i })
    expect(boton).toBeEnabled()
    fireEvent.click(boton)

    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith({
            rotacionClienteId: 42,
            coordInicio: '-34.603,-58.4',
            coordCliente: '-34.603,-58.4',
            propuesta: [],
        }),
    )
})

it('sin reposicionar, coordCliente no viaja en el payload', async () => {
    renderFlow({ cliente: { ...cliente, latitud: -34.6, longitud: -58.4 } })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    fireEvent.click(screen.getByRole('button', { name: /^iniciar visita$/i }))

    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith({
            rotacionClienteId: 42,
            coordInicio: '-34.6,-58.4',
            propuesta: [],
        }),
    )
})

it('cancelar el mapa descarta el reposicionamiento', async () => {
    renderFlow({ cliente: { ...cliente, latitud: -34.6, longitud: -58.4 } })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')

    fireEvent.click(screen.getByRole('button', { name: /reposicionar cliente/i }))
    const handleClick = await getClickHandler()
    handleClick({ latlng: { lat: -34.61, lng: -58.41 } })
    await screen.findByText(/posición ajustada/i)

    fireEvent.click(screen.getByLabelText('Cancelar'))
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()

    // Reabre el flujo desde cero: si el override sobreviviera, se mandaría igual.
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    fireEvent.click(screen.getByRole('button', { name: /^iniciar visita$/i }))
    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith({
            rotacionClienteId: 42,
            coordInicio: '-34.6,-58.4',
            propuesta: [],
        }),
    )
})

it('si el backend avisa que ya se agotó el cupo de corrección permanente, muestra el aviso discreto', async () => {
    ;(api.iniciarVisita as any).mockResolvedValue({
        visitaId: 99,
        ofrecimientos: 0,
        correccionPermanenteAplicada: false,
    })
    const { onAviso } = renderFlow({ cliente: { ...cliente, latitud: -34.6, longitud: -58.4 } })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')

    fireEvent.click(screen.getByRole('button', { name: /reposicionar cliente/i }))
    const handleClick = await getClickHandler()
    handleClick({ latlng: { lat: -34.61, lng: -58.41 } })

    fireEvent.click(screen.getByRole('button', { name: /^iniciar visita$/i }))

    await waitFor(() =>
        expect(onAviso).toHaveBeenCalledWith(
            'info',
            'Esta corrección ya no se guarda de forma permanente (límite alcanzado).',
        ),
    )
})

it('sin reposicionar, aunque el backend no mande correccionPermanenteAplicada, no avisa nada raro', async () => {
    const { onAviso } = renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() => expect(onAviso).toHaveBeenCalledWith('exito', 'Visita iniciada'))
    expect(onAviso).not.toHaveBeenCalledWith('info', expect.stringContaining('límite'))
})
```

- [ ] **Step 5: Correr y confirmar que fallan**

Run: `npx vitest run src/components/VisitaFlow.test.tsx`
Expected: FAIL — no existe el botón "Reposicionar cliente" dentro del árbol de `VisitaFlow` con estado propio, `coordCliente` nunca viaja, y no hay aviso de límite.

- [ ] **Step 6: Implementar — estado `clienteOverride` y reset al cancelar**

En `src/components/VisitaFlow.tsx`, agregar el estado (después de `const [cerrandoFlujo, setCerrandoFlujo] = useState(false)`, línea 81):

```ts
    // Ajuste efímero del pin del cliente (IniciarVisitaMapa.onReposicionar). Solo
    // importa para ESTE intento de iniciar: viaja como coordCliente y se usa en la
    // segunda verificación de distancia de acá abajo. Nunca se guarda en ningún otro
    // lado — ver docs/superpowers/specs/2026-09-07-reposicionar-cliente-al-iniciar-visita-design.md.
    const [clienteOverride, setClienteOverride] = useState<{ lat: number; lng: number } | null>(
        null,
    )
```

En el `useEffect` que resetea al cambiar de cliente (líneas 85-88):

```ts
    useEffect(() => {
        setPropuestaPendiente(null)
        setErrorIniciar(null)
        setClienteOverride(null)
    }, [cliente?.rotacionClienteId])
```

- [ ] **Step 7: Usar el override en la segunda verificación y en el payload de `iniciar`**

Reemplazar el cuerpo de `onIniciar` (líneas 154-202):

```ts
    async function onIniciar(propuesta: IPropuestaRubroDTO[]) {
        if (iniciandoFlujo || bloqueadoPorOtraVisita) return
        setErrorIniciar(null)
        setIniciandoFlujo(true)
        try {
            await conUbicacion(async geo => {
                // Segunda verificación, con la coordenada DEFINITIVA (la que se persiste). El
                // mapa ya deshabilita el botón con el fix en vivo, pero eso solo evita el caso
                // honesto — sin este chequeo alcanzaría con tocar "Iniciar visita" en el
                // instante en que el watch marcó cerca para saltear el gate.
                if (tieneCoords) {
                    const [lat, lon] = geo.coord.split(',').map(Number)
                    const clienteLat = clienteOverride?.lat ?? (cliente!.latitud as number)
                    const clienteLng = clienteOverride?.lng ?? (cliente!.longitud as number)
                    const distanciaM = distanciaMetros(lat, lon, clienteLat, clienteLng)
                    if (estaFueraDeRango(distanciaM, geo.precisionM)) {
                        setErrorIniciar('Estás lejos del cliente. Acercate para iniciar la visita.')
                        return
                    }
                }
                try {
                    const { visitaId: id, correccionPermanenteAplicada } = await iniciar.mutateAsync({
                        rotacionClienteId: cliente!.rotacionClienteId,
                        coordInicio: geo.coord,
                        coordCliente: clienteOverride
                            ? `${clienteOverride.lat},${clienteOverride.lng}`
                            : undefined,
                        propuesta,
                    })
                    setPropuestaPendiente(null)
                    onVisitaIniciada(cliente!, id)
                    marcarInicioVisita(id)
                    onAviso?.('exito', 'Visita iniciada')
                    // El gate ya se destrabó (efímero, arriba); esto es aparte: si
                    // client-service ya tenía 3 correcciones permanentes de este
                    // cliente, el backend no volvió a tocarlo — el vendedor sigue
                    // pudiendo operar, pero alguien tiene que corregirlo por otro
                    // medio.
                    if (clienteOverride && correccionPermanenteAplicada === false) {
                        onAviso?.(
                            'info',
                            'Esta corrección ya no se guarda de forma permanente (límite alcanzado).',
                        )
                    }
                    setClienteOverride(null)
                } catch (err) {
                    const code = errorCode(err)
                    if (code === 'VISITA_ACTIVA_EXISTENTE' || code === 'CICLO_CLIENTE_YA_RESUELTO') {
                        // La agenda estaba vieja. La invalidación del hook ya disparó el
                        // refetch; cerrar el flujo evita que siga operando sobre datos rancios.
                        onAviso?.('info', 'Este cliente ya fue resuelto. Actualizamos tu agenda.')
                        cerrarFlujo()
                        return
                    }
                    setErrorIniciar('No se pudo iniciar la visita. Volvé a intentar.')
                }
            })
        } finally {
            setIniciandoFlujo(false)
        }
    }
```

- [ ] **Step 8: Pasar `onReposicionar` al mapa, y resetear el override al cancelar**

En el JSX de `IniciarVisitaMapa` (líneas 291-316), agregar el prop y el reset en `onCancel`:

```tsx
            {tieneCoords && (
                <IniciarVisitaMapa
                    open={propuestaPendiente !== null}
                    nombreCliente={nombre}
                    direccion={direccionTexto}
                    latitud={cliente.latitud as number}
                    longitud={cliente.longitud as number}
                    iniciando={iniciandoFlujo}
                    error={errorIniciar}
                    onIniciar={onConfirmarEnMapa}
                    onReposicionar={setClienteOverride}
                    onCancel={() => {
                        setErrorIniciar(null)
                        setClienteOverride(null)
                        // En modo directo se salteó la propuesta a propósito, así que atrás
                        // del mapa no hay nada: cancelar es volver a la agenda. Además es lo
                        // único que corta el ciclo — limpiar solo `propuestaPendiente` vuelve
                        // a habilitar `cargandoDirecto`, y el efecto de más arriba reabre el
                        // mapa al instante con la propuesta que quedó en cache (así el mapa
                        // se volvía imposible de cerrar).
                        if (directoAMapa) {
                            cerrarFlujo()
                            return
                        }
                        setPropuestaPendiente(null)
                    }}
                />
            )}
```

- [ ] **Step 9: Correr y confirmar que pasan**

Run: `npx vitest run src/components/VisitaFlow.test.tsx`
Expected: PASS (todos los tests preexistentes — que no mandan `coordCliente` — siguen viendo `toHaveBeenCalledWith(...)` sin esa clave, porque `coordCliente: undefined` no afecta la igualdad estructural que usa Vitest/Jest — más los 5 tests nuevos).

- [ ] **Step 10: Correr TODA la suite del repo**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/components/VisitaFlow.tsx src/components/VisitaFlow.test.tsx src/types/planificacion.ts src/api/planificacion.ts
git commit -m "feat(visita): enviar coordCliente reposicionado y avisar límite de corrección permanente"
```

---

## Después de este plan

- El backend (rama `feature/reposicionar-cliente-coord-cliente-ajustada` en `api-vendedores`) necesita mergearse y desplegarse con `CLIENT_SERVICE_API_URL` configurada — sin eso, `correccionPermanenteAplicada` siempre da `false` (el ajuste efímero para destrabar el gate sigue funcionando igual, es solo la corrección permanente la que no se aplica).
- No hay cambios pendientes de este lado — `MapaVisita.tsx`/`DetalleVisitaPanel.tsx` (analítica de gerencia) ya leen `coordCliente` de la resolución sin cambios, según el spec.
