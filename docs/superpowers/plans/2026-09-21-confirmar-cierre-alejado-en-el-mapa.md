# Confirmar el cierre alejado en el mapa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el vendedor no pueda cerrar una visita estando lejos del cliente sin haberlo visto en un mapa, con un botón para recalcular su posición — y sin agregarle un solo toque al que cierra parado en el local.

**Architecture:** `VisitaFlow.onCerrarVisita` mide con la coordenada definitiva que ya capturaba antes de cerrar (`capturarUbicacion`). Si `estaFueraDeRango`, en vez de cerrar abre `MapaVisita` en un modo nuevo `'cerrar'` (full-screen, no salteable) y sincroniza el hook con esa medición. Desde el mapa, "Recalcular posición" corre en alta precisión y puede apagar el aviso; el CTA cambia de `Cerrar igual · estás a N m` (con `ConfirmDialog`) a `Cerrar visita` (directo). Si la medición da cerca, el flujo es el de hoy, sin mapa.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + @testing-library/react, Leaflet, Radix `AlertDialog` (vía `ConfirmDialog`), Tailwind.

**Spec:** [`docs/superpowers/specs/2026-09-21-confirmar-cierre-alejado-en-el-mapa-design.md`](../specs/2026-09-21-confirmar-cierre-alejado-en-el-mapa-design.md)

## Global Constraints

- **No se toca el backend.** Ni `api-vendedores`, ni `pl_*`, ni el warehouse. Sólo `src/` de esta app.
- **No se toca `useAlejadoDelCliente.ts`.** Se lo consume por sus salidas existentes (`alejado`, `distanciaM`, `evaluarFix`). Su test tampoco cambia.
- **No se toca `VisitaSheet.tsx`.** El banner "Te alejaste del cliente · Ver mi posición" del pie queda como está, y `cerrarConBorrador` tampoco cambia.
- **El desvío NO es un gate.** El CTA del modo `'cerrar'` nunca se deshabilita por distancia, ni por `calculando`, ni por `sinUbicacion`. Sólo el `loading` del cierre en vuelo lo ocupa.
- **La medición usa `visitaEnCurso.cliente.latitud/longitud`**, nunca `cliente` ni el card de la agenda: `visitaEnCurso` lleva la corrección del pin si el vendedor reposicionó al iniciar.
- **El criterio es `estaFueraDeRango(d, precisionM)`** de `src/lib/distancia.ts` (`d − precisión > RADIO_INICIO_METROS`). No comparar la distancia cruda.
- **Copy exacto**, sin variantes: eyebrow del mapa `Cerrar visita`; CTA lejos `Cerrar igual · estás a 340 m`; CTA cerca `Cerrar visita`; CTA en vuelo `Cerrando…`; diálogo título `¿Cerrar la visita lejos del cliente?`, confirmar `Cerrar igual`, cancelar `Cancelar`.
- **Vocabulario de vendedor:** nada de "ciclo", "rotación", "semana N", ni metros de precisión del fix en pantalla.
- **Comandos:** tests `npm test`, un archivo `npx vitest run src/components/MapaVisita.test.tsx`, typecheck `npx tsc -b`, lint `npm run lint`.

---

## File Structure

| Archivo | Responsabilidad | Cambio |
|---|---|---|
| `src/components/MapaVisita.tsx` | Mapa full-screen del vendedor, ya multi-modo | **Modificar**: cuarto modo `'cerrar'` + 3 props (`alejado`, `cerrando`, `onCerrar`) |
| `src/components/MapaVisita.test.tsx` | Tests del mapa | **Modificar**: casos del modo nuevo |
| `src/components/VisitaFlow.tsx` | Orquesta el ciclo iniciar → rubros → cerrar | **Modificar**: `ejecutarCierre` extraído, desvío por coordenada definitiva, mapa `'cerrar'`, `ConfirmDialog` |
| `src/components/VisitaFlow.test.tsx` | Tests del flujo | **Modificar**: casos del desvío |
| `CLAUDE.md` | Decisiones no obvias del repo | **Modificar**: un bullet en la viñeta del gate de distancia |

No se crean archivos nuevos: el mapa ya es un componente multi-modo y el desvío es del orquestador, que es donde ya vive `propuestaPendiente`.

---

### Task 1: Modo `'cerrar'` en `MapaVisita`

Deja el componente listo y probado de forma aislada. Todavía nadie lo usa con ese modo.

**Files:**
- Modify: `src/components/MapaVisita.tsx`
- Test: `src/components/MapaVisita.test.tsx`

**Interfaces:**
- Consumes: `formatDistancia` de `@/lib/analiticaFormat` (ya importado), `RADIO_INICIO_METROS` y `estaFueraDeRango` de `@/lib/distancia` (ya importados).
- Produces: `MapaVisitaProps` con `modo?: 'iniciar' | 'consulta' | 'ubicar' | 'cerrar'`, `alejado?: boolean`, `cerrando?: boolean`, `onCerrar?: () => void`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/components/MapaVisita.test.tsx`:

```tsx
it('modo cerrar: con alejado muestra "Cerrar igual" con la distancia y dispara onCerrar', async () => {
    // -34.6,-58.4 contra -34.61,-58.4 son ~1112 m: bien fuera de rango con accuracy 10.
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.61, longitude: -58.4, accuracy: 10 } }),
    )
    const onCerrar = vi.fn()
    render(
        <MapaVisita
            open
            modo="cerrar"
            alejado
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onCerrar={onCerrar}
            onCancel={() => {}}
        />,
    )
    const boton = await screen.findByRole('button', { name: /cerrar igual · estás a \d+ m/i })
    expect(boton).toBeEnabled()
    await userEvent.click(boton)
    expect(onCerrar).toHaveBeenCalledTimes(1)
})

it('modo cerrar: sin alejado el CTA es "Cerrar visita"', async () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <MapaVisita
            open
            modo="cerrar"
            alejado={false}
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onCerrar={() => {}}
            onCancel={() => {}}
        />,
    )
    expect(await screen.findByRole('button', { name: /^cerrar visita$/i })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /cerrar igual/i })).not.toBeInTheDocument()
})

it('modo cerrar: el CTA NO se deshabilita mientras el GPS todavía no respondió', () => {
    // El watch no llama a nadie: queda en `calculando`. En 'iniciar' eso deshabilita;
    // acá no hay gate y un GPS mudo no puede trabar un cierre.
    mockGeolocation(() => 1)
    render(
        <MapaVisita
            open
            modo="cerrar"
            alejado
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onCerrar={() => {}}
            onCancel={() => {}}
        />,
    )
    expect(screen.getByRole('button', { name: /cerrar igual/i })).toBeEnabled()
    expect(screen.getByText('Calculando tu posición…')).toBeInTheDocument()
})

it('modo cerrar: el CTA sigue habilitado si el GPS falla del todo', async () => {
    mockGeolocation((_ok: any, err: any) => {
        err({ code: 1 })
        return 1
    })
    render(
        <MapaVisita
            open
            modo="cerrar"
            alejado
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onCerrar={() => {}}
            onCancel={() => {}}
        />,
    )
    expect(await screen.findByRole('button', { name: /cerrar igual/i })).toBeEnabled()
})

it('modo cerrar: ofrece recalcular la posición pero no reposicionar al cliente', async () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.61, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <MapaVisita
            open
            modo="cerrar"
            alejado
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onCerrar={() => {}}
            onCancel={() => {}}
        />,
    )
    // "Recalcular posición" es la salida concreta del vendedor mal ubicado por señal.
    expect(await screen.findByRole('button', { name: /recalcular posición/i })).toBeInTheDocument()
    // Mover el pin del cliente es una decisión del INICIO de la visita, no del cierre.
    expect(screen.queryByRole('button', { name: /reposicionar cliente/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /iniciar visita/i })).not.toBeInTheDocument()
})

it('modo cerrar: el eyebrow dice "Cerrar visita", no "Iniciar visita"', async () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <MapaVisita
            open
            modo="cerrar"
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onCerrar={() => {}}
            onCancel={() => {}}
        />,
    )
    expect(await screen.findByText('Cerrar visita')).toBeInTheDocument()
    expect(screen.queryByText('Iniciar visita')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/components/MapaVisita.test.tsx`
Expected: FAIL — los 6 tests nuevos. El modo `'cerrar'` cae hoy en la rama de `'iniciar'` (ningún `esConsulta`/`esUbicar` matchea), así que se renderiza el botón "Iniciar visita" y no existe ningún "Cerrar igual".

- [ ] **Step 3: Extender el tipo `modo` y los props**

En `src/components/MapaVisita.tsx`, en `MapaVisitaProps`, reemplazar la línea del tipo `modo` y su docstring por:

```tsx
    /** 'iniciar' = mapa previo a arrancar la visita, con su CTA y el gate de cercanía.
     *  'consulta' = el vendedor sólo quiere ver dónde lo está ubicando el GPS con la
     *  visita ya abierta: sin CTA, sin reposicionar, sin gate. Ver
     *  docs/superpowers/specs/2026-09-11-ver-mi-posicion-con-visita-abierta-design.md.
     *  'ubicar' = "Cliente nuevo": el comercio todavía no tiene coordenada, así que NO
     *  llegan `latitud`/`longitud` y el pin arranca donde el GPS ubica al vendedor. Sin
     *  gate (no hay contra qué medir: la coordenada se está definiendo recién ahora) y
     *  sin círculo de rango.
     *  'cerrar' = el vendedor tocó "Cerrar visita" y la coordenada definitiva lo ubica
     *  lejos del cliente. Es 'consulta' con CTA: se le impone para que no cierre lejos
     *  sin darse cuenta, y "Recalcular posición" es su salida si el GPS se equivocó.
     *  NO es un gate — el CTA nunca se deshabilita por distancia. Ver
     *  docs/superpowers/specs/2026-09-21-confirmar-cierre-alejado-en-el-mapa-design.md. */
    modo?: 'iniciar' | 'consulta' | 'ubicar' | 'cerrar'
```

Y agregar, justo debajo del prop `onIniciar`:

```tsx
    /** Sólo en modo 'cerrar'. Si `alejado`, el llamador es quien pide la confirmación —
     *  este componente no la muestra. */
    onCerrar?: () => void
    /** Sólo en modo 'cerrar': decide la cara del CTA. Viene de `useAlejadoDelCliente`, y
     *  NO del `fueraDeRango` que este componente calcula para el texto de la distancia:
     *  la histéresis simétrica del hook (entra con `d − p > radio`, sale con
     *  `d + p <= radio`) tiene que ser la única fuente de verdad, o las dos pantallas
     *  terminan discrepando. */
    alejado?: boolean
    /** Sólo en modo 'cerrar': el cierre está en vuelo. Paralelo a `iniciando` y no un
     *  renombre — los dos modos nunca están montados a la vez, pero un prop compartido
     *  obligaría a leer `modo` para saber qué significa. */
    cerrando?: boolean
```

Agregarlos también a la desestructuración de la firma del componente (junto a `onIniciar`):

```tsx
    onIniciar,
    onCerrar,
    alejado,
    cerrando,
```

- [ ] **Step 4: Derivar los flags de modo**

Debajo de `const esUbicar = modo === 'ubicar'`, agregar:

```tsx
    // 'cerrar' es 'consulta' con CTA: comparte todo lo que NO es el pie.
    const esCerrar = modo === 'cerrar'
    // Mover el pin del cliente es una decisión del inicio de la visita. Ni consultando la
    // posición ni cerrando se ajusta la ubicación del comercio.
    const sinReposicionar = esConsulta || esCerrar
    // Los dos modos que miran la posición con la visita ya abierta: ni uno ni otro puede
    // decir "acercate para iniciar", que ya pasó.
    const visitaYaAbierta = esConsulta || esCerrar
```

- [ ] **Step 5: Adaptar el pie a los flags nuevos**

En el JSX del pie de `MapaVisita.tsx`, cuatro reemplazos puntuales:

1. En el aviso de distancia fuera de rango, cambiar el ternario `esConsulta` por `visitaYaAbierta`:

```tsx
                {!esUbicar && posicion && posicion.fueraDeRango && (
                    <p className="mb-3 text-[12.5px] font-semibold text-[#B45309]">
                        Estás a {formatDistancia(posicion.distanciaM)} del cliente
                        {visitaYaAbierta
                            ? '.'
                            : ` — acercate a menos de ${RADIO_INICIO_METROS} m para iniciar.`}
                    </p>
                )}
```

2. En el aviso de `sinUbicacion`, misma sustitución en la primera rama:

```tsx
                {sinUbicacion && (
                    <p className="mb-3 text-[12.5px] font-semibold text-[#B45309]">
                        {visitaYaAbierta
                            ? 'No pudimos ubicarte. Probá al aire libre y tocá "Recalcular posición".'
                            : esUbicar
                              ? 'No pudimos ubicarte: la visita va a quedar sin la ubicación del comercio. Podés iniciar igual.'
                              : 'No pudimos ubicarte, pero podés iniciar igual.'}
                    </p>
                )}
```

3. En los tres bloques de reposicionar (la banda `modoReposicionar`, la línea "Posición ajustada para esta visita" y el botón "Reposicionar cliente"), cambiar el guard `!esConsulta` por `!sinReposicionar`. Son exactamente estas tres aperturas:

```tsx
                {!sinReposicionar && modoReposicionar && (
```
```tsx
                {!sinReposicionar && !esUbicar && overrideCliente && !modoReposicionar && (
```
```tsx
                {!sinReposicionar && !modoReposicionar && (
```

4. Reemplazar el bloque final del CTA (hoy `{!esConsulta && (<Button onClick={onIniciar} …>)}`) por los dos CTAs, el de iniciar acotado y el de cerrar nuevo:

```tsx
                {!visitaYaAbierta && (
                    <Button
                        onClick={onIniciar}
                        loading={iniciando}
                        // `fueraDeRango` no bloquea en 'ubicar': no hay coordenada previa
                        // contra la cual estar lejos — se está definiendo ahora mismo.
                        disabled={calculando || (!esUbicar && fueraDeRango) || modoReposicionar}
                        className="h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
                    >
                        {iniciando ? 'Iniciando…' : calculando ? 'Calculando…' : 'Iniciar visita'}
                    </Button>
                )}
                {/* A diferencia del CTA de arriba, este NUNCA se deshabilita por distancia,
                 *  ni por `calculando`, ni por `sinUbicacion`. Cerrar no tiene gate (el
                 *  vendedor pudo irse del local por motivos legítimos, y bloquearlo dejaría
                 *  visitas abiertas para siempre), y un GPS que no responde no puede trabar
                 *  un cierre. El desvío hasta acá ya cumplió su función: que lo vea. */}
                {esCerrar && (
                    <Button
                        onClick={onCerrar}
                        loading={cerrando}
                        className={
                            alejado
                                ? 'h-12 w-full bg-[#B45309] text-[15px] hover:bg-[#92400E]'
                                : 'h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90'
                        }
                    >
                        {cerrando
                            ? 'Cerrando…'
                            : alejado
                              ? // Sin fix todavía no hay metros que mostrar, pero el botón
                                // igual va en su cara de "lejos": es el estado con el que
                                // se entró al mapa.
                                posicion
                                  ? `Cerrar igual · estás a ${formatDistancia(posicion.distanciaM)}`
                                  : 'Cerrar igual'
                              : 'Cerrar visita'}
                    </Button>
                )}
```

- [ ] **Step 6: Poner el eyebrow del header**

En el header, reemplazar el ternario del eyebrow por:

```tsx
                        {esConsulta
                            ? 'Tu posición'
                            : esUbicar
                              ? 'Ubicar el comercio'
                              : esCerrar
                                ? 'Cerrar visita'
                                : 'Iniciar visita'}
```

- [ ] **Step 7: Correr los tests del mapa**

Run: `npx vitest run src/components/MapaVisita.test.tsx`
Expected: PASS — los 6 nuevos y todos los que ya existían (los modos `'iniciar'`, `'consulta'` y `'ubicar'` no cambiaron de comportamiento: `visitaYaAbierta` y `sinReposicionar` valen lo mismo que `esConsulta` para ellos).

- [ ] **Step 8: Typecheck y lint**

Run: `npx tsc -b && npm run lint`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add src/components/MapaVisita.tsx src/components/MapaVisita.test.tsx
git commit -m "feat(mapa): modo 'cerrar' — mapa con CTA y sin gate para el cierre alejado

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: El desvío por la coordenada definitiva

Conecta el modo nuevo. Al terminar la tarea, cerrar estando lejos abre el mapa y el CTA cierra directo (sin diálogo todavía — lo agrega la Task 3).

**Files:**
- Modify: `src/components/VisitaFlow.tsx`
- Test: `src/components/VisitaFlow.test.tsx`

**Interfaces:**
- Consumes: `MapaVisita` con `modo="cerrar"`, `alejado`, `cerrando`, `onCerrar`, `onFix`, `onCancel` (Task 1). `distanciaMetros` y `estaFueraDeRango` de `@/lib/distancia` (ya importados en el archivo). `alejado` y `evaluarFix` de `useAlejadoDelCliente`, ya desestructurados — **no agregar `distanciaM` todavía**: recién lo usa la Task 3, y oxlint rechaza la variable sin usar.
- Produces: `ejecutarCierre(geo: Extract<GeoResult, { ok: true }>, observaciones: string | null, detalle: IDetalleContactoAlta | null): Promise<void>` y el estado `cierrePendiente: { observaciones: string | null; detalle: IDetalleContactoAlta | null } | null`, que la Task 3 consume.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `src/components/VisitaFlow.test.tsx`. El fixture `cliente` de arriba **no tiene coordenadas**, así que los clientes de estos tests las traen explícitas:

```tsx
/** Cliente con coordenada: es lo que habilita medir al cerrar. El fixture base no la
 *  tiene, y por eso los tests de cierre que ya existían no pasan nunca por el desvío. */
const clienteConCoords: IAgendaClient = {
    ...cliente,
    estado: 'en_curso',
    visitaId: 55,
    latitud: -34.6,
    longitud: -58.4,
}

it('cerrar lejos del cliente no cierra: desvía al mapa', async () => {
    // El vendedor está a ~1112 m con un fix preciso: evidencia positiva de lejanía.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    expect(api.cerrarVisita).not.toHaveBeenCalled()
})

it('cerrar cerca del cliente cierra directo, sin mapa', async () => {
    // Mismo punto que el cliente: no hay nada que mostrar.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.6,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() =>
        expect(api.cerrarVisita).toHaveBeenCalledWith(55, { coordFinal: '-34.6,-58.4' }),
    )
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
})

it('desvía aunque el aviso de alejado esté apagado por un fix viejo', async () => {
    // EL CASO QUE MOTIVA LA FEATURE. El watch del hook nunca corrió (jsdom no expone
    // geolocation acá), así que `alejado` es false: el estado congelado del background.
    // La coordenada definitiva igual tiene que mandar al mapa.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    expect(api.cerrarVisita).not.toHaveBeenCalled()
})

it('un fix demasiado impreciso no desvía: ante la duda no interrumpe', async () => {
    // 1112 m de distancia pero 2000 m de precisión: no prueba lejanía. Es el agujero
    // conocido y aceptado del spec — no convertirlo en desvío sin cambiar el spec.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 2000,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() => expect(api.cerrarVisita).toHaveBeenCalled())
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
})

it('un cliente sin coordenadas cierra directo: no hay contra qué medir', async () => {
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() => expect(api.cerrarVisita).toHaveBeenCalled())
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
})

it('cancelar el mapa de cierre no cierra la visita, y volver a tocar vuelve a medir', async () => {
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument())
    expect(api.cerrarVisita).not.toHaveBeenCalled()

    // Segundo intento: mide de nuevo, y como se acercó, cierra derecho.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.6,-58.4',
        precisionM: 10,
    })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() =>
        expect(api.cerrarVisita).toHaveBeenCalledWith(55, { coordFinal: '-34.6,-58.4' }),
    )
})

it('con el permiso denegado no cierra ni abre el mapa', async () => {
    ;(geo.capturarUbicacion as any).mockResolvedValue({ ok: false, motivo: 'denegado' })
    const { onGeoBloqueada } = renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() => expect(onGeoBloqueada).toHaveBeenCalledWith('denegado'))
    expect(api.cerrarVisita).not.toHaveBeenCalled()
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/components/VisitaFlow.test.tsx`
Expected: FAIL en los tres tests que esperan el desvío (`cerrar lejos…`, `desvía aunque el aviso…`, `cancelar el mapa…`): hoy `onCerrarVisita` cierra siempre, así que `api.cerrarVisita` se llama y el mapa nunca aparece. Los otros cuatro pasan ya (documentan el comportamiento que no debe cambiar).

- [ ] **Step 3: Declarar el estado del desvío**

En `src/components/VisitaFlow.tsx`, declarar el estado junto a los demás del flujo (cerca de `propuestaPendiente`, que es su gemelo del camino de inicio):

```tsx
    // Gemelo de `propuestaPendiente` en el camino de cierre: el cierre ya está decidido y
    // pagado (el batch de rubros se guardó en el sheet), pero la coordenada definitiva
    // ubicó al vendedor lejos del cliente y antes de escribirlo tiene que verlo en el
    // mapa. Guarda lo que venía del sheet para poder reanudarlo al confirmar. Ver
    // docs/superpowers/specs/2026-09-21-confirmar-cierre-alejado-en-el-mapa-design.md.
    const [cierrePendiente, setCierrePendiente] = useState<{
        observaciones: string | null
        detalle: IDetalleContactoAlta | null
    } | null>(null)
```

- [ ] **Step 4: Partir `onCerrarVisita` en medición + `ejecutarCierre`**

Reemplazar la función `onCerrarVisita` completa (desde `async function onCerrarVisita(` hasta su `}` de cierre) por:

```tsx
    /**
     * Escribe el cierre. Recibe el `geo` ya capturado en vez de capturarlo: el llamador lo
     * necesitó antes para decidir si desviaba al mapa, y recapturar acá mandaría al backend
     * una coordenada distinta de la que se midió.
     */
    async function ejecutarCierre(
        geo: Extract<GeoResult, { ok: true }>,
        observaciones: string | null,
        detalle: IDetalleContactoAlta | null,
    ) {
        // Común a "cerró bien" y a "ya estaba cerrada" (tratado como éxito, ver abajo): las
        // dos anclas locales de la visita se limpian igual, sea cual sea el motivo por el
        // que se da por cerrada. Un solo lugar para esto evita que una tercera clave que se
        // sume el día de mañana quede escrita en un call site y olvidada en el otro — que es
        // justo la familia de bugs que este mismo archivo tuvo que corregir después de
        // escrito (ver los fix posteriores al spec de "te alejaste del cliente").
        function limpiarAnclasDeLaVisita() {
            limpiarInicioVisita(visitaId!)
            limpiarVisitaEnCurso()
        }
        try {
            const res = await cerrar.mutateAsync({
                visitaId: visitaId!,
                coordFinal: geo.coord,
                ...(observaciones ? { observaciones } : {}),
                ...(detalle ? { detalle } : {}),
            })
            if (res.ofrecimientosPendientes > 0) {
                // Resultado normal, no un error: el gate pide un mínimo de 2 rubros,
                // así que cerrar con pendientes es esperable. Pero el aviso NO invita
                // a cargarlos después — el sheet de una visita cerrada es read-only
                // (`visitaCerrada` en VisitaSheet), así que esos rubros ya no se
                // pueden completar. Decir "te quedan por cargar" mandaba al vendedor
                // a buscar una pantalla que no existe.
                onAviso?.(
                    'info',
                    `Visita cerrada. Quedaron ${res.ofrecimientosPendientes} rubros sin cargar.`,
                )
            } else {
                onAviso?.('exito', 'Visita cerrada')
            }
            limpiarAnclasDeLaVisita()
            onVisitaCerrada()
            cerrarFlujo()
        } catch (err) {
            if (errorCode(err) === 'VISITA_YA_CERRADA') {
                // Tratar como éxito: la visita está cerrada, que es lo que se quería.
                limpiarAnclasDeLaVisita()
                onVisitaCerrada()
                cerrarFlujo()
                return
            }
            onAviso?.('error', 'No se pudo cerrar la visita. Volvé a intentar.')
        }
    }

    /**
     * Mide con la coordenada DEFINITIVA —la que se persiste— y recién entonces decide. Es el
     * espejo del chequeo que `onIniciar` ya hace, y por un motivo distinto del de allá: acá
     * no hay gate que falsear, hay un estado que puede estar viejo. `useAlejadoDelCliente`
     * congela su watch con la app en background, así que `alejado` puede decir "cerca" de
     * hace diez minutos; si el desvío colgara de él, el vendedor que se fue con el celu
     * guardado cerraría lejos sin que hubiera existido ningún cartel que ignorar.
     *
     * No agrega ninguna espera: `capturarUbicacion` ya corría igual antes de cerrar.
     */
    async function onCerrarVisita(
        observaciones: string | null,
        detalle: IDetalleContactoAlta | null,
    ) {
        if (visitaId === null || cerrandoFlujo) return
        setCerrandoFlujo(true)
        try {
            await conUbicacion(async geo => {
                // `visitaEnCurso.cliente` y NO `cliente`: si el vendedor reposicionó el pin
                // al iniciar, el ancla de toda la visita es la corregida. Medir contra la
                // del warehouse mandaría al mapa a alguien parado justo donde reposicionó.
                const clienteLat = visitaEnCurso?.cliente.latitud
                const clienteLng = visitaEnCurso?.cliente.longitud
                if (clienteLat != null && clienteLng != null) {
                    const [lat, lon] = geo.coord.split(',').map(Number)
                    const d = distanciaMetros(lat, lon, clienteLat, clienteLng)
                    if (estaFueraDeRango(d, geo.precisionM)) {
                        // Poner el hook al día con la medición que acaba de disparar el
                        // desvío: sin esto podría seguir en `alejado: false` por su fix
                        // viejo, y el mapa abriría en verde "Cerrar visita", contradiciendo
                        // el motivo por el que se abrió. El criterio de entrada de
                        // `evaluarFix` es el mismo `estaFueraDeRango` que acaba de dar true.
                        evaluarFix(lat, lon, geo.precisionM)
                        setCierrePendiente({ observaciones, detalle })
                        return
                    }
                }
                await ejecutarCierre(geo, observaciones, detalle)
            })
        } finally {
            setCerrandoFlujo(false)
        }
    }

    /**
     * El vendedor resolvió el desvío y cierra. Vuelve a capturar en vez de reusar el `geo`
     * de la medición: entre un momento y otro pudo pasar minutos recalculando y mirando el
     * mapa, y `coord_final` tiene que ser dónde estaba al cerrar, no dónde estaba al empezar
     * a dudar. La segunda captura es rápida (el GPS quedó caliente) y reusa `conUbicacion`,
     * incluido su manejo de permiso denegado.
     */
    async function onConfirmarCierreEnMapa() {
        if (cierrePendiente === null || cerrandoFlujo) return
        const { observaciones, detalle } = cierrePendiente
        setCerrandoFlujo(true)
        try {
            await conUbicacion(geo => ejecutarCierre(geo, observaciones, detalle))
        } finally {
            setCerrandoFlujo(false)
            // Tanto si cerró como si falló: el mapa se va y el vendedor vuelve al sheet,
            // que es donde está el botón para reintentar y donde el toast queda legible.
            setCierrePendiente(null)
        }
    }
```

Verificar que `GeoResult` esté importado como tipo desde `@/lib/geolocation` (ya se usa en la firma de `conUbicacion`, así que debería estarlo).

- [ ] **Step 5: Renderizar el mapa de cierre**

En el JSX, justo después del bloque de `{verPosicion && …}` (el `MapaVisita` en modo `'consulta'`), agregar:

```tsx
            {cierrePendiente !== null &&
                visitaEnCurso?.cliente.latitud != null &&
                visitaEnCurso.cliente.longitud != null && (
                    <MapaVisita
                        open
                        modo="cerrar"
                        nombreCliente={
                            visitaEnCurso.cliente.nombreFantasia ||
                            visitaEnCurso.cliente.nombreCliente
                        }
                        identidad={identidadCliente(visitaEnCurso.cliente)}
                        direccion={visitaEnCurso.cliente.direccion || visitaEnCurso.cliente.barrio}
                        latitud={visitaEnCurso.cliente.latitud}
                        longitud={visitaEnCurso.cliente.longitud}
                        alejado={alejado}
                        cerrando={cerrandoFlujo}
                        // El watch de este mapa es de ALTA precisión, a diferencia del del
                        // hook: es lo que le permite al vendedor mal ubicado por señal
                        // desmentir la medición y ver el CTA pasar a verde.
                        onFix={evaluarFix}
                        onCerrar={onConfirmarCierreEnMapa}
                        onCancel={() => setCierrePendiente(null)}
                    />
                )}
```

- [ ] **Step 6: Correr los tests del flujo**

Run: `npx vitest run src/components/VisitaFlow.test.tsx`
Expected: PASS — los 7 nuevos y todos los anteriores. Los tests de cierre que ya existían usan el fixture `cliente` sin coordenadas, así que no pasan por el desvío y siguen cerrando directo.

- [ ] **Step 7: Suite completa, typecheck y lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: todo verde.

- [ ] **Step 8: Commit**

```bash
git add src/components/VisitaFlow.tsx src/components/VisitaFlow.test.tsx
git commit -m "feat(cierre): desviar al mapa cuando la coordenada definitiva ubica al vendedor lejos

El estado de useAlejadoDelCliente se congela con la app en background, así que
el desvío no puede colgar de él: se mide con el fix fresco que ya se capturaba
para persistir coord_final.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: La confirmación de cerrar lejos

Última pieza: con `alejado` vigente, el CTA del mapa pide confirmación en vez de cerrar.

**Files:**
- Modify: `src/components/VisitaFlow.tsx`
- Test: `src/components/VisitaFlow.test.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog` (default export de `@/components/ui/ConfirmDialog`), con props `open`, `onOpenChange(open: boolean)`, `title`, `description`, `confirmLabel`, `cancelLabel`, `onConfirm(): void | Promise<unknown>`. `onConfirmarCierreEnMapa` y `cierrePendiente` de la Task 2. `formatDistancia` de `@/lib/analiticaFormat`, y `distanciaM` de `useAlejadoDelCliente`, **que esta tarea agrega** a la desestructuración.
- Produces: nada que consuman tareas posteriores.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `src/components/VisitaFlow.test.tsx`:

```tsx
it('cerrar igual desde el mapa exige confirmar, y confirmar cierra una sola vez', async () => {
    // El watch en vivo confirma la lejanía, así que el hook enciende `alejado` y el CTA
    // sale en su cara de "Cerrar igual".
    mockGeolocacionEnVivo({ latitude: -34.61, longitude: -58.4, accuracy: 10 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    fireEvent.click(await screen.findByRole('button', { name: /cerrar igual/i }))

    // El diálogo se interpone: todavía no se escribió nada.
    await screen.findByText('¿Cerrar la visita lejos del cliente?')
    expect(api.cerrarVisita).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^cerrar igual$/i }))
    await waitFor(() => expect(api.cerrarVisita).toHaveBeenCalledTimes(1))
    expect(api.cerrarVisita).toHaveBeenCalledWith(55, { coordFinal: '-34.61,-58.4' })
})

// Este test usa `within`: agregarlo al import de '@testing-library/react' de la cabecera.
it('cancelar la confirmación deja la visita abierta y el mapa a la vista', async () => {
    mockGeolocacionEnVivo({ latitude: -34.61, longitude: -58.4, accuracy: 10 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    fireEvent.click(await screen.findByRole('button', { name: /cerrar igual/i }))
    // `within` el diálogo y no `screen`: la X del mapa también tiene aria-label "Cancelar",
    // así que con el diálogo abierto hay DOS botones con ese nombre accesible y una query
    // global tira "found multiple elements".
    const dialogo = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() =>
        expect(screen.queryByText('¿Cerrar la visita lejos del cliente?')).not.toBeInTheDocument(),
    )
    expect(api.cerrarVisita).not.toHaveBeenCalled()
    // El mapa sigue ahí: cancelar la confirmación no es cancelar el desvío.
    expect(screen.getByTestId('mapa-iniciar-visita')).toBeInTheDocument()
})

it('si el GPS del mapa lo ubica en el cliente, el CTA cierra sin confirmación', async () => {
    // Llegó al mapa por una medición lejana, pero el watch de alta precisión del mapa
    // lo ubica en el local: el hook apaga `alejado` y el desacuerdo se resolvió a su favor.
    mockGeolocacionEnVivo({ latitude: -34.6, longitude: -58.4, accuracy: 5 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')

    // El CTA del mapa, ya en verde. Es el segundo "Cerrar visita" del árbol (el primero es
    // el del sheet, detrás), así que se toma el último.
    const ctas = await screen.findAllByRole('button', { name: /^cerrar visita$/i })
    fireEvent.click(ctas[ctas.length - 1])

    await waitFor(() => expect(api.cerrarVisita).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('¿Cerrar la visita lejos del cliente?')).not.toBeInTheDocument()
})

it('si el cierre falla desde el mapa, avisa y no marca la visita como cerrada', async () => {
    mockGeolocacionEnVivo({ latitude: -34.61, longitude: -58.4, accuracy: 10 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockRejectedValue(new Error('red caída'))
    const { onAviso, onVisitaCerrada } = renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    fireEvent.click(await screen.findByRole('button', { name: /cerrar igual/i }))
    await screen.findByText('¿Cerrar la visita lejos del cliente?')
    fireEvent.click(screen.getByRole('button', { name: /^cerrar igual$/i }))

    await waitFor(() =>
        expect(onAviso).toHaveBeenCalledWith('error', 'No se pudo cerrar la visita. Volvé a intentar.'),
    )
    expect(onVisitaCerrada).not.toHaveBeenCalled()
    // El mapa y el diálogo se van: el vendedor vuelve al sheet, donde está el botón para
    // reintentar y donde el toast queda legible.
    await waitFor(() => expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument())
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/components/VisitaFlow.test.tsx`
Expected: FAIL en los tres tests que esperan el diálogo — hoy el CTA del mapa llama a `onConfirmarCierreEnMapa` derecho, así que `api.cerrarVisita` se llama sin que aparezca `¿Cerrar la visita lejos del cliente?`. El cuarto (`si el GPS del mapa lo ubica en el cliente…`) ya pasa: documenta el camino que no debe cambiar.

- [ ] **Step 3: Importar `ConfirmDialog`/`formatDistancia` y tomar `distanciaM` del hook**

En la cabecera de `src/components/VisitaFlow.tsx`:

```tsx
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { formatDistancia } from '@/lib/analiticaFormat'
```

Y agregar `distanciaM` a la desestructuración del hook (la Task 2 lo dejó afuera a propósito
para no dejar una variable sin usar):

```tsx
    const { alejado, distanciaM, evaluarFix } = useAlejadoDelCliente({
```

- [ ] **Step 4: Declarar el estado del diálogo**

Junto a `cierrePendiente`:

```tsx
    // El vendedor tocó "Cerrar igual" con el aviso vigente. Es estado propio y no derivado
    // de `alejado`: si mientras el diálogo está abierto llega un fix que apaga el aviso, la
    // pregunta que el vendedor está leyendo no puede desaparecerle de abajo del dedo.
    const [confirmarCierreLejos, setConfirmarCierreLejos] = useState(false)
```

- [ ] **Step 5: Interponer el diálogo en el CTA del mapa**

En el `MapaVisita` de modo `'cerrar'` que agregó la Task 2, cambiar el `onCerrar` y el `onCancel`:

```tsx
                        onCerrar={() => {
                            // Con el aviso vigente la pregunta se hace explícita. Sin él, el
                            // vendedor ya desmintió la medición con un fix de alta precisión
                            // y esto es un cierre normal.
                            if (alejado) setConfirmarCierreLejos(true)
                            else void onConfirmarCierreEnMapa()
                        }}
                        onCancel={() => {
                            setConfirmarCierreLejos(false)
                            setCierrePendiente(null)
                        }}
```

Y renderizar el diálogo inmediatamente después de ese bloque `{cierrePendiente !== null && …}`:

```tsx
            <ConfirmDialog
                open={confirmarCierreLejos}
                onOpenChange={setConfirmarCierreLejos}
                title="¿Cerrar la visita lejos del cliente?"
                description={
                    distanciaM === null
                        ? `La visita de ${
                              visitaEnCurso?.cliente.nombreFantasia ??
                              visitaEnCurso?.cliente.nombreCliente ??
                              'este cliente'
                          } va a quedar registrada con tu ubicación actual.`
                        : `Estás a ${formatDistancia(distanciaM)} de ${
                              visitaEnCurso?.cliente.nombreFantasia ??
                              visitaEnCurso?.cliente.nombreCliente ??
                              'este cliente'
                          }. La visita va a quedar registrada igual, con esta ubicación.`
                }
                confirmLabel="Cerrar igual"
                cancelLabel="Cancelar"
                // No `destructivo`: el rojo está reservado para lo que descarta trabajo, y
                // esto registra un hecho legítimo. Que sea irreversible lo dice el texto.
                onConfirm={onConfirmarCierreEnMapa}
            />
```

Por último, limpiar el flag al confirmar: en `onConfirmarCierreEnMapa`, agregar `setConfirmarCierreLejos(false)` en el `finally`, junto a `setCierrePendiente(null)`.

- [ ] **Step 6: Correr los tests del flujo**

Run: `npx vitest run src/components/VisitaFlow.test.tsx`
Expected: PASS, los 4 nuevos y todo lo anterior.

- [ ] **Step 7: Suite completa, typecheck y lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: todo verde.

- [ ] **Step 8: Commit**

```bash
git add src/components/VisitaFlow.tsx src/components/VisitaFlow.test.tsx
git commit -m "feat(cierre): confirmar explícitamente el cierre lejos del cliente

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Documentar la decisión en `CLAUDE.md`

La viñeta actual dice que cerrar no tiene gate, y sin esta nota la próxima lectura concluye que tocar "Cerrar visita" escribe el cierre y nada más.

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Agregar el bullet**

En `CLAUDE.md`, en la sección "Decisiones no obvias", insertar esta viñeta **inmediatamente después** de la que empieza con `**Iniciar visita exige estar a ≤100 m del cliente; cerrar NO tiene ese gate.**` (la que termina en `…un `posicionRef` (el `watchPosition` vive todo el ciclo del mapa…callbacks no se redefinen en cada fix…)`), antes de la que empieza con `**`VisitaFlow.onIniciar` repite el chequeo…`:

```markdown
- **Cerrar sigue sin gate, pero pasa por el mapa si la coordenada definitiva ubica al
  vendedor lejos.** `VisitaFlow.onCerrarVisita` mide con el `geo` de `capturarUbicacion()`
  —el mismo que se persiste como `coord_final`, así que no agrega espera— y con
  `estaFueraDeRango` decide: cerca cierra derecho, lejos abre `MapaVisita` en `modo='cerrar'`
  (el cuarto modo: `'consulta'` con CTA, sin reposicionar) y llama a `evaluarFix` con esa
  coordenada para poner al hook al día. **El disparador NO es `alejado`** a propósito:
  `useAlejadoDelCliente` congela su watch con la app en background, así que su estado puede
  decir "cerca" de hace diez minutos — y ése es justo el vendedor que hoy cierra a 400 m sin
  que hubiera existido ningún cartel que ignorar. Desde el mapa, "Recalcular posición" corre
  en alta precisión y puede apagar el aviso: ahí el CTA pasa de `Cerrar igual · estás a N m`
  (con `ConfirmDialog`) a `Cerrar visita` (directo). **El CTA del modo `'cerrar'` nunca se
  deshabilita** —ni por `calculando`, ni por `sinUbicacion`, ni por distancia—: es la
  diferencia con `'iniciar'`, y reintroducirlo sería el bloqueo que el dominio saca a
  propósito. Un fix demasiado impreciso (`d − p` nunca supera el radio) **no desvía**: ante
  la duda no se interrumpe, y es un agujero conocido y aceptado. El banner del pie de
  `VisitaSheet` no cambia. Detalle en
  [`docs/superpowers/specs/2026-09-21-confirmar-cierre-alejado-en-el-mapa-design.md`](docs/superpowers/specs/2026-09-21-confirmar-cierre-alejado-en-el-mapa-design.md).
```

- [ ] **Step 2: Verificar que el link resuelve**

Run: `ls docs/superpowers/specs/2026-09-21-confirmar-cierre-alejado-en-el-mapa-design.md`
Expected: el archivo existe.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: el cierre alejado pasa por el mapa, y por qué el disparador no es \`alejado\`

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Verificación final

- [ ] `npm test` — toda la suite verde.
- [ ] `npx tsc -b` — sin errores de tipos.
- [ ] `npm run lint` — limpio.
- [ ] Prueba manual con el override de ubicación de Chrome DevTools (panel Sensors): **ojo**, ese panel reporta una precisión fija por encima de los 100 m y no se puede configurar, así que un fix simulado desde ahí **no dispara el desvío** (`d − p` no supera el radio). Es el mismo escondite que ya complicó el spec del 11/09. Para probar el camino lejano hay que mockear `capturarUbicacion` o usar un dispositivo real.
