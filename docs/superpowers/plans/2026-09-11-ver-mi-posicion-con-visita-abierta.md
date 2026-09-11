# "Ver mi posición" con la visita abierta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Darle al vendedor una salida manual del aviso de "te alejaste del cliente" —abrir el mapa y ver dónde lo está ubicando el GPS— y arreglar la asimetría que hoy deja ese aviso pegado para siempre.

**Architecture:** Dos cambios que se componen. (1) `useAlejadoDelCliente` descarta los fixes con precisión mayor al radio, lo que elimina la banda muerta entre su criterio de entrada y el de salida. (2) `IniciarVisitaMapa` —que ya corre un `watchPosition` de alta precisión— se renombra a `MapaVisita` y gana un `modo='consulta'` sin CTA de iniciar, más un `onFix` que alimenta al hook con esos fixes finos. El botón que lo abre vive en el pie de `VisitaSheet`, sólo cuando el aviso está activo.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + @testing-library/react, Leaflet, Tailwind.

**Spec:** [`docs/superpowers/specs/2026-09-11-ver-mi-posicion-con-visita-abierta-design.md`](../specs/2026-09-11-ver-mi-posicion-con-visita-abierta-design.md)

## Global Constraints

- El watch pasivo de `useAlejadoDelCliente` **sigue en `enableHighAccuracy: false`**. No cambiarlo.
- La histéresis del hook no se toca: entrar con `distancia − precisión > RADIO_INICIO_METROS`, salir con `distancia ≤ RADIO_INICIO_METROS` (cruda).
- **Cerrar visita no gana ningún gate de distancia.** Ninguna tarea toca `faltanParaMinimo`, `ofrecimientosCargados` ni el `disabled` del botón "Cerrar visita".
- No se persiste nada nuevo ni se llama a ningún endpoint nuevo. Todo esto es front.
- Vocabulario de vendedor: nada de "ciclo", "rotación" ni "semana N" en textos visibles.
- Tests con `npm test` (vitest run). Lint con `npm run lint` (oxlint). Type-check con `npm run build`.
- Indentación de 4 espacios, sin punto y coma al final, comillas simples — como el resto de `src/`.

---

### Task 1: Puerta de precisión en `useAlejadoDelCliente`

> **Corrección posterior (11/09, tras QA manual):** la implementación de esta tarea tal como
> queda descripta abajo (una puerta que descarta cualquier fix con `precisionM > RADIO_INICIO_METROS`)
> tenía un bug: bloqueaba también la ENTRADA a `alejado` con fixes genuinamente lejanos pero
> imprecisos — el caso exacto del override de ubicación de Chrome DevTools (panel Sensors), que
> no permite configurar la precisión y reporta un valor fijo por encima del radio. Se corrigió
> reemplazando la puerta por una salida simétrica a la entrada (`distancia + precisión ≤ radio`
> en vez de descartar el fix entero). El diseño vigente y su razón están en la sección 1 de
> [`docs/superpowers/specs/2026-09-11-ver-mi-posicion-con-visita-abierta-design.md`](../specs/2026-09-11-ver-mi-posicion-con-visita-abierta-design.md);
> los pasos de abajo quedan como registro histórico de lo que se implementó primero, no como
> referencia para tocar este código de nuevo.

Arregla el bug de la salida y expone `evaluarFix` para que la Task 4 pueda alimentar el hook desde el mapa.

**Files:**
- Modify: `src/hooks/useAlejadoDelCliente.ts`
- Test: `src/hooks/useAlejadoDelCliente.test.ts`

**Interfaces:**
- Consumes: `RADIO_INICIO_METROS`, `distanciaMetros`, `estaFueraDeRango` de `@/lib/distancia` (ya existen, ya importados en el hook).
- Produces: `useAlejadoDelCliente(...)` devuelve ahora `{ alejado: boolean; distanciaM: number | null; evaluarFix: (lat: number, lon: number, precisionM: number) => void }`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/hooks/useAlejadoDelCliente.test.ts`. Los helpers `mockNavigator`, `fix` y la constante `CLIENTE` ya están definidos arriba en ese archivo — no los redefinas.

```ts
it('descarta un fix más impreciso que el radio: no entra a alejado', () => {
    let entregar: any
    mockNavigator({ watchImpl: ok => (entregar = ok) })
    const { result } = renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))

    // ~1.1 km con 150 m de precisión: cumple `d - p > 100`, pero el fix es más impreciso
    // que el propio radio y no puede concluir nada.
    act(() => entregar(fix(0.01, 0, 150)))

    expect(result.current.alejado).toBe(false)
})

it('un fix impreciso no apaga un aviso ya prendido ni mueve la distancia', () => {
    let entregar: any
    mockNavigator({ watchImpl: ok => (entregar = ok) })
    const { result } = renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))

    act(() => entregar(fix(0.01, 0, 5)))
    expect(result.current.alejado).toBe(true)
    const distanciaAntes = result.current.distanciaM

    act(() => entregar(fix(0.0005, 0, 400)))

    expect(result.current.alejado).toBe(true)
    expect(result.current.distanciaM).toBe(distanciaAntes)
})

it('evaluarFix apaga el aviso con un fix fino y cercano', () => {
    let entregar: any
    mockNavigator({ watchImpl: ok => (entregar = ok) })
    const { result } = renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))

    act(() => entregar(fix(0.01, 0, 5)))
    expect(result.current.alejado).toBe(true)

    // ~44 m del cliente con 15 m de precisión: distancia cruda dentro del radio.
    act(() => result.current.evaluarFix(0.0004, 0, 15))

    expect(result.current.alejado).toBe(false)
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -- src/hooks/useAlejadoDelCliente.test.ts`

Expected: FAIL. Los dos primeros con `expected true to be false` / `expected false to be true`; el tercero con `result.current.evaluarFix is not a function`.

- [ ] **Step 3: Implementar la puerta de precisión**

En `src/hooks/useAlejadoDelCliente.ts`, agregar el guard como primera línea del cuerpo de `evaluarFix`, justo después del `if (!tieneCoords) return` que ya está:

```ts
    function evaluarFix(lat: number, lon: number, precisionM: number) {
        if (!tieneCoords) return
        // Puerta de precisión: un fix más impreciso que el propio radio no puede concluir
        // nada, ni para entrar ni para salir. Sin esto, entrada y salida usan escalas
        // distintas —entrar descuenta la precisión, salir mide la distancia cruda— y entre
        // las dos queda una banda muerta (100 < d <= 100 + precisión) donde el fix ni entra
        // ni sale. Como el watch de acá corre en baja precisión a propósito, casi todos sus
        // fixes caen en esa banda: se entraba a `alejado` con un fix bueno y después ningún
        // fix grueso alcanzaba para salir, con el vendedor parado en el local. Ver
        // docs/superpowers/specs/2026-09-11-ver-mi-posicion-con-visita-abierta-design.md.
        if (precisionM > RADIO_INICIO_METROS) return
        const d = distanciaMetros(lat, lon, latitud as number, longitud as number)
        setDistanciaM(d)
        // ... el resto del cuerpo queda exactamente igual
    }
```

Agregar el campo a la interfaz de retorno:

```ts
interface UseAlejadoDelClienteResult {
    alejado: boolean
    distanciaM: number | null
    /** Entrada externa al mismo criterio que usa el watch interno. La usa MapaVisita en
     *  modo consulta, cuyo watch SÍ es de alta precisión: es lo que le permite al vendedor
     *  desmentir el aviso abriendo el mapa. */
    evaluarFix: (lat: number, lon: number, precisionM: number) => void
}
```

Y devolverlo:

```ts
    return {
        alejado: habilitado && alejado,
        distanciaM: habilitado ? distanciaM : null,
        evaluarFix,
    }
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/hooks/useAlejadoDelCliente.test.ts`

Expected: PASS, incluidos los que ya existían — "no dispara con un fix grueso a distancia moderada" y el de oscilación en el borde siguen valiendo.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAlejadoDelCliente.ts src/hooks/useAlejadoDelCliente.test.ts
git commit -m "fix(alejado): descartar fixes mas imprecisos que el radio"
```

---

### Task 2: Renombrar `IniciarVisitaMapa` a `MapaVisita`

Rename puro, sin cambio de comportamiento. Va en su propio commit para que el diff de la Task 3 se lea.

**Files:**
- Rename: `src/components/IniciarVisitaMapa.tsx` → `src/components/MapaVisita.tsx`
- Rename: `src/components/IniciarVisitaMapa.test.tsx` → `src/components/MapaVisita.test.tsx`
- Modify: `src/components/VisitaFlow.tsx` (import + JSX), `src/components/VisitaFlow.test.tsx`
- Modify (sólo comentarios): `src/hooks/useAlejadoDelCliente.ts`, `src/lib/geolocation.ts`, `src/types/planificacion.ts`

**Interfaces:**
- Produces: `MapaVisita` como default export de `src/components/MapaVisita.tsx`, con las mismas props que tenía `IniciarVisitaMapa`, y su interfaz renombrada a `MapaVisitaProps`.

- [ ] **Step 1: Mover los archivos con git**

```bash
git mv src/components/IniciarVisitaMapa.tsx src/components/MapaVisita.tsx
git mv src/components/IniciarVisitaMapa.test.tsx src/components/MapaVisita.test.tsx
```

- [ ] **Step 2: Renombrar el identificador y sus menciones**

```bash
grep -rn "IniciarVisitaMapa" src/
```

Cambiar `IniciarVisitaMapa` por `MapaVisita` en cada hit: el nombre de la función y `IniciarVisitaMapaProps` → `MapaVisitaProps` en `MapaVisita.tsx`, el import en `MapaVisita.test.tsx`, el import y el JSX en `VisitaFlow.tsx`, las referencias en `VisitaFlow.test.tsx`, y las menciones en comentarios de `useAlejadoDelCliente.ts`, `geolocation.ts` y `types/planificacion.ts`.

**No tocar** el `data-testid="mapa-iniciar-visita"` del div del mapa: hay tests que lo usan y renombrarlo no aporta nada.

- [ ] **Step 3: Verificar que no quedó ninguna referencia y que todo compila**

```bash
grep -rn "IniciarVisitaMapa" src/
npm run build
npm test
```

Expected: `grep` sin salida, `build` sin errores de TS, toda la suite en PASS.

- [ ] **Step 4: Commit**

```bash
git add -A src/
git commit -m "refactor: renombrar IniciarVisitaMapa a MapaVisita"
```

---

### Task 3: `modo='consulta'` y `onFix` en `MapaVisita`

**Files:**
- Modify: `src/components/MapaVisita.tsx`
- Test: `src/components/MapaVisita.test.tsx`

**Interfaces:**
- Consumes: `MapaVisita` de la Task 2.
- Produces: `MapaVisitaProps` gana `modo?: 'iniciar' | 'consulta'` (default `'iniciar'`) y `onFix?: (lat: number, lon: number, precisionM: number) => void`; `onIniciar` pasa a ser opcional (`onIniciar?: () => void`).

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/components/MapaVisita.test.tsx`. El helper `mockGeolocation` y el `vi.mock('leaflet')` ya están arriba en el archivo — no los redefinas.

```tsx
it('en modo consulta no ofrece iniciar ni reposicionar', () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <MapaVisita
            open
            modo="consulta"
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onCancel={() => {}}
        />,
    )

    expect(screen.queryByRole('button', { name: /iniciar visita/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reposicionar/i })).not.toBeInTheDocument()
    // Lo que sí tiene que seguir estando: la medición.
    expect(screen.getByRole('button', { name: /recalcular posición/i })).toBeInTheDocument()
})

it('en modo consulta el encabezado dice "Tu posición"', () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <MapaVisita
            open
            modo="consulta"
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onCancel={() => {}}
        />,
    )

    expect(screen.getByText('Tu posición')).toBeInTheDocument()
    expect(screen.queryByText('Iniciar visita')).not.toBeInTheDocument()
})

it('avisa cada fix del watch por onFix, con la precisión', () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.601, longitude: -58.401, accuracy: 12 } }),
    )
    const onFix = vi.fn()
    render(
        <MapaVisita
            open
            modo="consulta"
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onFix={onFix}
            onCancel={() => {}}
        />,
    )

    expect(onFix).toHaveBeenCalledWith(-34.601, -58.401, 12)
})

it('avisa por onFix también al recalcular', async () => {
    mockGeolocation(
        () => {},
        (ok: any) => ok({ coords: { latitude: -34.602, longitude: -58.402, accuracy: 8 } }),
    )
    const onFix = vi.fn()
    render(
        <MapaVisita
            open
            modo="consulta"
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onFix={onFix}
            onCancel={() => {}}
        />,
    )

    await userEvent.click(screen.getByRole('button', { name: /recalcular posición/i }))

    expect(onFix).toHaveBeenCalledWith(-34.602, -58.402, 8)
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -- src/components/MapaVisita.test.tsx`

Expected: FAIL los cuatro nuevos. Los de `modo`, porque el botón "Iniciar visita" se sigue renderizando y el encabezado sigue diciendo "Iniciar visita"; los de `onFix`, con `expected "spy" to be called with arguments` (nunca se llamó).

- [ ] **Step 3: Implementar `modo` y `onFix`**

En `src/components/MapaVisita.tsx`:

**a) Props.** Reemplazar `MapaVisitaProps` por:

```tsx
interface MapaVisitaProps {
    open: boolean
    /** 'iniciar' = mapa previo a arrancar la visita, con su CTA y el gate de cercanía.
     *  'consulta' = el vendedor sólo quiere ver dónde lo está ubicando el GPS con la
     *  visita ya abierta: sin CTA, sin reposicionar, sin gate. Ver
     *  docs/superpowers/specs/2026-09-11-ver-mi-posicion-con-visita-abierta-design.md. */
    modo?: 'iniciar' | 'consulta'
    nombreCliente: string
    direccion?: string
    latitud: number
    longitud: number
    iniciando?: boolean
    /** Mensaje del último intento fallido. Queda visible hasta el próximo intento. */
    error?: string | null
    /** Sólo se usa en modo 'iniciar'. */
    onIniciar?: () => void
    onCancel: () => void
    /** Cada fix propio del vendedor (watch en vivo y "Recalcular posición"). El watch de
     *  este componente es de ALTA precisión, a diferencia del de useAlejadoDelCliente: por
     *  eso abrir el mapa alcanza para que el hook pueda apagar el aviso de "te alejaste". */
    onFix?: (lat: number, lon: number, precisionM: number) => void
    onReposicionar?: (coords: { lat: number; lng: number } | null) => void
}
```

**b) Firma.** Desestructurar `modo = 'iniciar'` y `onFix`, y derivar junto a los otros valores del cuerpo:

```tsx
    const esConsulta = modo === 'consulta'
```

**c) Llamar a `onFix`** en los dos lugares donde ya se resuelve un fix propio. En el callback de éxito del `watchPosition`, justo después de `vendedorFixRef.current = { lat: latitude, lng: longitude, accuracy }`:

```tsx
                    onFix?.(latitude, longitude, accuracy)
```

Y lo mismo, en la misma posición relativa (después de asignar `vendedorFixRef.current`), dentro del callback de éxito de `handleRecalcular`.

**d) Encabezado.** Reemplazar el texto fijo `Iniciar visita` del `<span>` del header por:

```tsx
                        {esConsulta ? 'Tu posición' : 'Iniciar visita'}
```

**e) Esconder en consulta lo que no aplica.** Anteponer `!esConsulta &&` a la condición de cada uno de estos cuatro bloques del pie (no anidar: extender la condición que ya tienen):

- `{modoReposicionar && (...)}` → `{!esConsulta && modoReposicionar && (...)}` (barra "Tocá el mapa para mover al cliente")
- `{overrideCliente && !modoReposicionar && (...)}` → `{!esConsulta && overrideCliente && !modoReposicionar && (...)}` ("Posición ajustada para esta visita")
- `{!modoReposicionar && (<Button ...>Reposicionar cliente</Button>)}` → `{!esConsulta && !modoReposicionar && (...)}`
- el `<Button ...>Iniciar visita</Button>` final, que hoy está suelto → envolverlo en `{!esConsulta && (...)}`

**f) El aviso de distancia** menciona el gate de inicio, que en consulta no existe:

```tsx
                {posicion && posicion.fueraDeRango && (
                    <p className="mb-3 text-[12.5px] font-semibold text-[#B45309]">
                        Estás a {formatDistancia(posicion.distanciaM)} del cliente
                        {esConsulta
                            ? '.'
                            : ` — acercate a menos de ${RADIO_INICIO_METROS} m para iniciar.`}
                    </p>
                )}
```

**g) `sinUbicacion`** dice "podés iniciar igual", que en consulta es falso:

```tsx
                {sinUbicacion && (
                    <p className="mb-3 text-[12.5px] font-semibold text-[#B45309]">
                        {esConsulta
                            ? 'No pudimos ubicarte. Probá al aire libre y tocá "Recalcular posición".'
                            : 'No pudimos ubicarte, pero podés iniciar igual.'}
                    </p>
                )}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/components/MapaVisita.test.tsx`

Expected: PASS, incluidos los tests viejos del modo iniciar — no pasan `modo`, así que caen en el default `'iniciar'` y su comportamiento no cambia.

- [ ] **Step 5: Commit**

```bash
git add src/components/MapaVisita.tsx src/components/MapaVisita.test.tsx
git commit -m "feat(mapa): modo consulta y onFix en MapaVisita"
```

---

### Task 4: El botón "Ver mi posición" en el pie del sheet

Cablea todo: el sheet ofrece el botón cuando el aviso está activo, y `VisitaFlow` abre el mapa en consulta sobre las coordenadas de la visita en curso pasándole `evaluarFix` como `onFix`.

**Files:**
- Modify: `src/components/VisitaSheet.tsx`
- Modify: `src/components/VisitaFlow.tsx`
- Test: `src/components/VisitaSheet.test.tsx`

**Interfaces:**
- Consumes: `evaluarFix` del hook (Task 1); `MapaVisita` con `modo` y `onFix` (Tasks 2 y 3).
- Produces: `VisitaSheetProps` gana `alejado?: boolean` y `onVerPosicion?: () => void`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/components/VisitaSheet.test.tsx`. El archivo ya tiene el helper `renderSheet(over)` (monta el `QueryClientProvider` y las props obligatorias del sheet, y hace merge de `over`) y el `beforeEach` con los mocks de `@/api/planificacion` — usalos, no los redefinas. Los tests de este archivo usan `fireEvent`, no `userEvent`.

```tsx
it('ofrece ver la posición cuando el vendedor se alejó', async () => {
    const onVerPosicion = vi.fn()
    renderSheet({ alejado: true, onVerPosicion })

    fireEvent.click(await screen.findByRole('button', { name: 'Ver mi posición' }))

    expect(onVerPosicion).toHaveBeenCalled()
})

it('no ofrece ver la posición si el vendedor no se alejó', async () => {
    renderSheet({ alejado: false, onVerPosicion: vi.fn() })

    // Esperar a que el pie termine de armarse (los ofrecimientos cargan async y el botón
    // de cerrar recién aparece con ellos): si no, el queryBy pasa por pantalla vacía.
    await screen.findByRole('button', { name: /cerrar visita|completá/i })

    expect(screen.queryByRole('button', { name: 'Ver mi posición' })).not.toBeInTheDocument()
})

it('no ofrece ver la posición con la visita ya cerrada', async () => {
    renderSheet({ alejado: true, visitaCerrada: true, onVerPosicion: vi.fn() })

    await screen.findByText('Amortiguadores')

    expect(screen.queryByRole('button', { name: 'Ver mi posición' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -- src/components/VisitaSheet.test.tsx`

Expected: el primero FAIL con `Unable to find an accessible element with the role "button" and name /ver mi posición/i`. Los otros dos pasan de entrada (el botón todavía no existe en ningún caso) — es esperable: son las guardas de la regla, y valen recién cuando el primero pasa.

- [ ] **Step 3: Implementar el botón en `VisitaSheet`**

**a)** En `VisitaSheetProps`:

```tsx
    /** true = el vendedor está lejos del cliente de ESTA visita, con la visita abierta.
     *  Lo calcula useAlejadoDelCliente, en VisitaFlow. */
    alejado?: boolean
    /** Abre MapaVisita en modo consulta. Sólo tiene sentido junto con `alejado`. */
    onVerPosicion?: () => void
```

**b)** Desestructurarlas en la firma del componente.

**c)** En la rama de **lista** del `footer` (la del `:` en `wizard ? ... : (...)`), justo **antes** del bloque `{cliente && onAbrirAppExterna && (...)}`:

```tsx
            {/* Salida manual del aviso de "te alejaste": el vendedor dice que está parado
             *  en el cliente y el sistema le dice que no. El mapa corre un watch de alta
             *  precisión y le reporta cada fix al hook, así que si tiene razón el aviso se
             *  apaga solo a los pocos segundos de abrirlo. Va acá, pegado a "Cerrar visita",
             *  porque ese es el momento en que aparece el desacuerdo. No es parte del flujo
             *  normal: sólo se renderiza con el aviso activo. */}
            {alejado && !visitaCerrada && onVerPosicion && (
                <div className="mb-2.5 flex items-center justify-between gap-2 rounded-md border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2">
                    <span className="min-w-0 text-[12.5px] font-semibold text-dsred">
                        Te alejaste del cliente
                    </span>
                    <button
                        type="button"
                        onClick={onVerPosicion}
                        className="shrink-0 text-[12.5px] font-semibold text-[#213D82] underline"
                    >
                        Ver mi posición
                    </button>
                </div>
            )}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/components/VisitaSheet.test.tsx`

Expected: PASS los tres.

- [ ] **Step 5: Cablear `VisitaFlow`**

**a)** Traer `evaluarFix` del hook, que hoy sólo desestructura `alejado`:

```tsx
    const { alejado, evaluarFix } = useAlejadoDelCliente({
        activo: visitaEnCurso !== null,
        latitud: visitaEnCurso?.cliente.latitud,
        longitud: visitaEnCurso?.cliente.longitud,
    })
```

**b)** Estado local para el mapa de consulta, junto a los otros `useState` del componente:

```tsx
    // Mapa de consulta abierto (botón "Ver mi posición" del sheet). Nada que ver con
    // `propuestaPendiente`, que es el mapa del flujo de iniciar.
    const [verPosicion, setVerPosicion] = useState(false)
```

**c)** Props nuevas al `<VisitaSheet>` que ya se renderiza:

```tsx
                    alejado={alejado && esClienteEnCurso}
                    onVerPosicion={() => setVerPosicion(true)}
```

`esClienteEnCurso` no es opcional acá: el aviso es sobre el cliente de la visita en curso, y el vendedor puede tener abierto el sheet de otro cliente mientras tanto.

**d)** Renderizar el segundo mapa, después del `<MapaVisita open={propuestaPendiente !== null} ... />` que ya está. Usa las coordenadas de `visitaEnCurso.cliente` —que ya traen aplicado el reposicionamiento del inicio, si lo hubo—, **no** las de `cliente`:

```tsx
            {verPosicion &&
                visitaEnCurso?.cliente.latitud != null &&
                visitaEnCurso.cliente.longitud != null && (
                    <MapaVisita
                        open
                        modo="consulta"
                        nombreCliente={
                            visitaEnCurso.cliente.nombreFantasia ||
                            visitaEnCurso.cliente.nombreCliente
                        }
                        direccion={visitaEnCurso.cliente.direccion || visitaEnCurso.cliente.barrio}
                        latitud={visitaEnCurso.cliente.latitud}
                        longitud={visitaEnCurso.cliente.longitud}
                        onFix={evaluarFix}
                        onCancel={() => setVerPosicion(false)}
                    />
                )}
```

**e)** En `cerrarFlujo()`, agregar `setVerPosicion(false)` junto a los otros resets, para que el mapa no quede colgado sobre la agenda al cerrar o minimizar el sheet.

- [ ] **Step 6: Verificar todo junto**

```bash
npm test
npm run lint
npm run build
```

Expected: toda la suite en PASS, oxlint sin findings nuevos, `tsc -b` sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx src/components/VisitaFlow.tsx
git commit -m "feat(visita): boton Ver mi posicion cuando el vendedor se alejo"
```

---

### Task 5: Actualizar la documentación viva

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Extender el bullet de geolocalización**

En `CLAUDE.md`, sección "Decisiones no obvias", el bullet largo que arranca con **"Iniciar visita exige estar a ≤100 m del cliente; cerrar NO tiene ese gate."** ya documenta `errorActualizando` / `sinUbicacion` / `calculando`. Agregarle al final:

```markdown
  Con la visita **ya abierta**, el aviso de "te alejaste" tiene una salida manual: el botón
  **"Ver mi posición"** en el pie de `VisitaSheet` (sólo con `alejado` y la visita abierta)
  abre `MapaVisita` en `modo='consulta'` — sin CTA, sin reposicionar, sin gate. Ese mapa
  corre un watch de **alta** precisión y le pasa cada fix a `useAlejadoDelCliente.evaluarFix`,
  así que si el vendedor está donde dice, el aviso se apaga solo. El watch del hook sigue en
  baja precisión a propósito (batería) y desde el spec del 11/09 **descarta todo fix con
  precisión mayor a `RADIO_INICIO_METROS`**: sin esa puerta, entrada (`d − p > 100`) y salida
  (`d ≤ 100` cruda) usan escalas distintas y dejan una banda muerta donde el aviso queda
  pegado para siempre. No "arreglarlo" volviendo simétrica la salida (`d − p ≤ 60`): eso
  convierte un fix basura en evidencia de cercanía. Y ojo con el nombre: `IniciarVisitaMapa`
  pasó a llamarse **`MapaVisita`**.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: ver mi posicion y la puerta de precision del aviso de alejado"
```

---

## Verificación final

```bash
npm test && npm run lint && npm run build
```

Y una pasada manual con `npm run dev`, que es lo único que prueba el lazo completo: iniciar una visita, alejarse (o apuntar el cliente a coordenadas lejanas), ver la barra flotante en rojo, abrir el sheet, tocar "Ver mi posición", confirmar que el mapa muestra el punto propio y el círculo de 100 m, y que al volver el aviso refleja lo que el mapa midió.
