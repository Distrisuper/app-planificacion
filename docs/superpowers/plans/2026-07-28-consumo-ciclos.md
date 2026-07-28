# Consumo del dominio de ciclos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar app-planificacion al contrato de ciclos de api-vendedores: navegar semanas y abrir la vuelta, estado derivado por cliente, resolución comercial **por rubro** contra la propuesta congelada, y geolocalización bloqueante.

**Architecture:** Un solo board con modo `operable | preview`, manejado por las flechas de semana que el prototipo ya tiene dibujadas. Un estado `semanaVista` decide si el board se alimenta de `/agenda/semana` (la vuelta abierta, operable) o de `/ciclo/preview` (cualquier otra, solo lectura). El compilador garantiza la compuerta: las cards de preview son un tipo distinto sin `cicloClienteId`, así que no pueden llegar a una mutación.

**Tech Stack:** Vite + React 19 + TypeScript, React Query v5, axios, Tailwind + shadcn/ui, Vitest + Testing Library.

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-07-28-consumo-ciclos-design.md`. **Leerlo antes de empezar.**
- Contrato: `src/docs/planificacion.yaml` del worktree `planificacion-backend` de api-vendedores. **Es la fuente de verdad**, no este plan.
- **Este plan depende del plan del backend** (`api-vendedores/.worktrees/planificacion-backend/docs/superpowers/plans/2026-07-28-ciclo-preview-y-coords.md`). `GET /ciclo/preview` y `COORD_REQUERIDA` tienen que existir antes de la Task 9.
- **Regla de tipos:** lo que el OpenAPI marca `required`, es **requerido** en el tipo. La opcionalidad defensiva de hoy es la que deja pasar `iniciarVisita({ cicloClienteId: undefined })`.
- **Ningún nombre de motivo escrito en el código.** El catálogo es dato: agregar un motivo es un INSERT. Todo sale de `GET /motivos?nivel=` y se decide por `requiereDetalle`, nunca por `descripcion === 'Precio'`.
- **La geolocalización bloquea** inicio y cierre. Esto revierte §6/§10 de `docs/superpowers/specs/2026-07-22-app-planificacion-design.md`: **no lo "arregles" citando ese spec, está superseded.**
- Prettier del repo: 4 espacios, comillas simples, sin punto y coma final, `printWidth` largo (mirar los archivos vecinos).
- Textos de cara al vendedor en español.
- Tests: `npx vitest run <path>`. Suite completa: `npm test`. Typecheck: `npx tsc -b --noEmit`.
- El diseño visual lo define `Prototipo/` — no inventar tratamiento nuevo donde el prototipo ya decidió.

---

## Estructura de archivos

**Crear:**
- `src/lib/estadoCiclo.ts` (+ `.test.ts`) — la única derivación de "resuelto" del front
- `src/lib/apiError.ts` (+ `.test.ts`) — extracción del `code` de un error de axios
- `src/lib/geolocation.ts` (+ `.test.ts`) — captura en dos etapas, distingue denegado de sin señal
- `src/hooks/useCiclo.ts` (+ `.test.tsx`) — ciclo actual, preview, abrir, cerrar, reagendar
- `src/hooks/useRubros.ts` (+ `.test.tsx`) — rubros de la visita
- `src/components/VisitaSheet.tsx` (+ `.test.tsx`) — rubros congelados + resolución por rubro
- `src/components/VisitaFlow.tsx` (+ `.test.tsx`) — propuesta → iniciar → rubros → cerrar
- `src/components/CerrarSemanaSheet.tsx` (+ `.test.tsx`) — las dos listas de bloqueo del 409
- `src/components/CicloVacio.tsx` — estado sin vuelta abierta, con el CTA de abrir

**Modificar:**
- `src/types/planificacion.ts` — reescritura del dominio
- `src/api/planificacion.ts` (+ `.test.ts`) — 16 funciones
- `src/api/apiClient.ts` (+ `.test.ts`) — baja de la excepción `CRM_`
- `src/hooks/useAgenda.ts` (+ `.test.tsx`), `useMotivos.ts` (+ `.test.tsx`), `useVisitas.ts` (+ `.test.tsx`)
- `src/hooks/useGeolocation.ts` — se vacía a favor de `lib/geolocation.ts`
- `src/lib/mockAgendaData.ts` — genérico sobre la card base
- `src/components/ClienteCard.tsx` (+ `.test.tsx`) — 5 estados, 3 acciones, badge de pendientes
- `src/components/AgendaBoard.tsx` — modo preview
- `src/components/AppHeader.tsx` (+ `.test.tsx`) — modo, flechas reales, CTA
- `src/components/AccountMenu.tsx` — "Cerrar semana"
- `src/components/propuesta/ResolucionRubro.tsx` (+ `.test.tsx`) — catálogo real, persistencia
- `src/components/propuesta/RubroCard.tsx` — conteo desde los motivos persistidos
- `src/components/PropuestaSheet.tsx` (+ `.test.tsx`) — pierde la resolución efímera
- `src/pages/AgendaSemanaPage.tsx` (+ `.test.tsx`) — shell + máquina de modos

**Borrar:**
- `src/hooks/useGeolocation.test.ts` — reemplazado por `lib/geolocation.test.ts`

**Orden de dependencias:** 1 → 2 → 3 → 4 → (5, 6 en paralelo) → 7 → 8 → 9.

---

### Task 1: Tipos del dominio y helper de estado

La base de todo: sin los tipos nuevos nada compila. El helper de estado es la única derivación de "resuelto" del front.

**Files:**
- Modify: `src/types/planificacion.ts`
- Create: `src/lib/estadoCiclo.ts`
- Test: `src/lib/estadoCiclo.test.ts`

**Interfaces:**
- Produces: `Dia`, `NivelMotivo`, `ResultadoMotivo`, `TipoResolucion`, `EstadoCiclo`, `EstadoCicloCliente`, `IMotivo`, `IBrandDiscount`, `IVisitClientCard`, `IAgendaClient`, `IPreviewClient`, `IPreviewCiclo`, `ICicloSemana`, `IAbrirCicloResult`, `IVisitaConRubrosPendientes`, `ICerrarCicloResult`, `IResolucion`, `IRubroMotivo`, `IVisitaRubro`, `SemanaAgenda`, los DTOs, y `estaResuelto(e: EstadoCicloCliente): boolean`.

- [ ] **Step 1: Reescribir `src/types/planificacion.ts`**

Se conservan `IRubroPropuesta`, `IArticleToOffer`, `IRubroRecommendation`, `IClientRecommendation` e `IRubroRecommendationsResponse` **tal cual están hoy** (son de `/sale/rubro/recommendations`, que no cambia). Se reemplaza todo lo demás:

```ts
export type Dia = 'LUN' | 'MAR' | 'MIE' | 'JUE' | 'VIE'

export type NivelMotivo = 'visita' | 'rubro'

/** Qué significa comercialmente el motivo. Solo los de nivel 'rubro' lo tienen. */
export type ResultadoMotivo = 'ganado' | 'diferido' | 'perdido' | 'no_ofrecido'

export type TipoResolucion = 'visita' | 'no_visita' | 'reagendada'

export type EstadoCiclo = 'abierta' | 'cerrada'

/** DERIVADO en el backend de la resolución del cliente — no existe como columna. */
export type EstadoCicloCliente =
    | 'pendiente'
    | 'en_curso'
    | 'visitada'
    | 'no_visita'
    | 'reagendada'

export interface IMotivo {
    motivoId: number
    nivel: NivelMotivo
    descripcion: string
    resultado: ResultadoMotivo | null
    /** Si es true, resolver un rubro con este motivo exige marca/competidor/pctDiferencia. */
    requiereDetalle: boolean
}

export interface IBrandDiscount {
    code: string
    value: number
    description: string
}

/** Datos del cliente que vienen de fct_clients. Los comparten la agenda y el preview.
 *  Solo los tres primeros son `required` en el OpenAPI; el resto puede faltar. */
export interface IVisitClientCard {
    codigoCliente: string
    codigoParticularCliente: string
    nombreCliente: string
    nombreFantasia?: string
    barrio?: string
    localidad?: string
    direccion?: string
    telefono?: string
    latitud?: number | null
    longitud?: number | null
    codigoZona?: string
    comentario?: string
    isActive?: boolean
    bonusDiscount?: number | null
    generalDiscount?: number | null
    gmDiscount?: number | null
    brandDiscounts?: IBrandDiscount[]
    paymentCondition?: string | null
    paymentTermDays?: number | null
    paymentCreditLimit?: number | null
    paymentAmount?: number | null
    paymentPlan?: number | null

    /** Solo-front: el backend todavía no asigna horarios (ver lib/mockAgendaData.ts). */
    horaVisita?: string
}

/** Card de la VUELTA ABIERTA. Los cinco campos del ciclo son requeridos a propósito:
 *  con cicloClienteId opcional, iniciarVisita({ cicloClienteId: undefined }) compilaría. */
export interface IAgendaClient extends IVisitClientCard {
    cicloClienteId: number
    dia: number
    estado: EstadoCicloCliente
    /** Id de la resolución si es una visita (para retomar la carga de rubros). */
    visitaId: number | null
    /** Rubros de esa visita todavía sin motivos. 0 si no hay visita. */
    rubrosPendientes: number
}

/** Card de una semana NO abierta. Deliberadamente NO extiende IAgendaClient: sin ciclo
 *  no hay cicloClienteId ni estado, y que sea otro tipo es lo que impide que una card
 *  de preview llegue a una mutación. */
export interface IPreviewClient extends IVisitClientCard {
    dia: number
}

export interface IPreviewCiclo {
    /** La semana previsualizada. Si el request la omitió, es la que propuso el backend. */
    semana: number
    clientes: number
    omitidos: string[]
    dias: Record<Dia, IPreviewClient[]>
}

export interface ICicloSemana {
    id: number
    codigoParticularVendedor: string
    semana: number
    fechaApertura: string
    fechaCierre: string | null
    estado: EstadoCiclo
}

export interface IAbrirCicloResult {
    cicloId: number
    semana: number
    clientes: number
    omitidos: string[]
}

export interface IVisitaConRubrosPendientes {
    visitaId: number
    codigoParticularCliente: string
    rubros: number
}

export interface ICerrarCicloResult {
    cerrado: boolean
    clientesPendientes: string[]
    visitasConRubrosPendientes: IVisitaConRubrosPendientes[]
}

/** La visita activa: el backend devuelve la resolución cruda. */
export interface IResolucion {
    id: number
    cicloClienteId: number
    tipo: TipoResolucion
    fechaInicio: string
    fechaFin: string | null
    coordInicio: string | null
    coordFinal: string | null
    coordCliente: string | null
}

/** Un motivo aplicado a un rubro. marca/competidor/pctDiferencia solo se usan cuando el
 *  motivo tiene requiereDetalle; en el resto van null. */
export interface IRubroMotivo {
    motivoId: number
    marca: string | null
    competidor: string | null
    pctDiferencia: number | null
}

/** Un rubro de la propuesta congelada. `resuelto` lo deriva el backend de motivos.length. */
export interface IVisitaRubro {
    id: number
    resolucionId: number
    rubroCode: string
    rubroDescripcion: string
    gapUnits: number | null
    esPropuesto: boolean
    resuelto: boolean
    motivos: IRubroMotivo[]
}

export type SemanaAgenda = Record<Dia, IAgendaClient[]>

export interface IIniciarVisitaDTO {
    cicloClienteId: number
    /** Obligatoria: el backend rechaza null con COORD_REQUERIDA. */
    coordInicio: string
}

/** Sin motivoIds: al cerrar una visita el resultado comercial vive en los rubros. */
export interface ICerrarVisitaDTO {
    coordFinal: string
}

export interface ICerrarVisitaResult {
    visitaId: number
    /** Si es > 0, la visita cerró pero falta cargar resoluciones. */
    rubrosPendientes: number
}

/** Único lugar donde se piden motivos a nivel visita. */
export interface INoVisitaDTO {
    cicloClienteId: number
    motivoIds: number[]
}

export interface INoVisitaResult {
    cicloClienteId: number
}

export interface IResolverRubroDTO {
    motivos: IRubroMotivo[]
}

export interface IResolverRubroResult {
    rubrosPendientes: number
}

export interface IAgregarRubroDTO {
    rubroCode: string
    rubroDescripcion: string
}

export interface IAgregarRubroResult {
    visitaRubroId: number
}
```

Se **borran**: `visit`, `resuelto`, `enCurso` de la card; `IVisita`; `ISeguimientoResult`; `IReintentarSeguimientoDTO`.

- [ ] **Step 2: Escribir el test del helper**

Crear `src/lib/estadoCiclo.test.ts`:

```ts
import { estaResuelto } from './estadoCiclo'

it('pendiente no está resuelto', () => {
    expect(estaResuelto('pendiente')).toBe(false)
})

it('en_curso NO cuenta como resuelto: la visita sigue abierta', () => {
    // Si contara, el progreso mostraría trabajo terminado que todavía traba el
    // cierre de la semana.
    expect(estaResuelto('en_curso')).toBe(false)
})

it('visitada, no_visita y reagendada cuentan como resueltos', () => {
    expect(estaResuelto('visitada')).toBe(true)
    expect(estaResuelto('no_visita')).toBe(true)
    expect(estaResuelto('reagendada')).toBe(true)
})
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/estadoCiclo.test.ts`
Esperado: FAIL — no existe el módulo.

- [ ] **Step 4: Implementar el helper**

Crear `src/lib/estadoCiclo.ts`:

```ts
import type { EstadoCicloCliente } from '@/types/planificacion'

/**
 * Si el cliente ya está resuelto en la vuelta.
 *
 * 'en_curso' NO cuenta: la visita está abierta y la semana no puede cerrar con eso.
 *
 * El backend contesta esta misma pregunta en SQL (CicloClienteRepository
 * .findCodigosSinResolver) para no traer las ~40 filas al cerrar el ciclo. Acá vive
 * igual porque los contadores de DiaTabs y el progreso del header la necesitan sobre
 * datos que ya están en memoria.
 */
export function estaResuelto(estado: EstadoCicloCliente): boolean {
    return estado === 'visitada' || estado === 'no_visita' || estado === 'reagendada'
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/estadoCiclo.test.ts`
Esperado: PASS, 3 tests.

- [ ] **Step 6: Commit**

En este punto el resto del repo NO compila (usa `visit`, `resuelto`, etc.). Es esperado: se arregla en las tareas siguientes.

```bash
git add src/types/planificacion.ts src/lib/estadoCiclo.ts src/lib/estadoCiclo.test.ts
git commit -m "feat(tipos): dominio de ciclos y derivación de resuelto"
```

---

### Task 2: Geolocalización en dos etapas

La pieza que hace viable bloquear. Hoy `getCurrentCoord()` hace **una sola** tentativa con `enableHighAccuracy: true` (GPS puro, el que falla bajo techo) y colapsa "denegado" y "sin señal" en el mismo `null` — tira justo la información que distingue una mentira de mala suerte.

**Files:**
- Create: `src/lib/geolocation.ts`
- Test: `src/lib/geolocation.test.ts`
- Modify: `src/hooks/useGeolocation.ts`
- Delete: `src/hooks/useGeolocation.test.ts`

**Interfaces:**
- Produces: `type GeoResult`, `capturarUbicacion(): Promise<GeoResult>`.

- [ ] **Step 1: Escribir los tests**

Crear `src/lib/geolocation.test.ts`:

```ts
import { vi } from 'vitest'
import { capturarUbicacion } from './geolocation'

const PERMISSION_DENIED = 1
const POSITION_UNAVAILABLE = 2
const TIMEOUT = 3

function mockGeolocation(impl: any) {
    const getCurrentPosition = vi.fn(impl)
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    return getCurrentPosition
}

beforeEach(() => vi.unstubAllGlobals())

it('devuelve la coordenada cuando el GPS resuelve en la etapa 1', async () => {
    const spy = mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.38, accuracy: 12 } }),
    )

    const res = await capturarUbicacion()

    expect(res).toEqual({ ok: true, coord: '-34.6,-58.38', precisionM: 12 })
    expect(spy).toHaveBeenCalledTimes(1)
})

it('permiso denegado corta sin etapa 2', async () => {
    // El caso deliberado: reintentar no cambiaría nada y solo demoraría el bloqueo.
    const spy = mockGeolocation((_ok: any, fail: any) => fail({ code: PERMISSION_DENIED }))

    const res = await capturarUbicacion()

    expect(res).toEqual({ ok: false, motivo: 'denegado' })
    expect(spy).toHaveBeenCalledTimes(1)
})

it('timeout en la etapa 1 reintenta con baja precisión', async () => {
    const spy = mockGeolocation((ok: any, fail: any, opts: any) => {
        if (opts.enableHighAccuracy) return fail({ code: TIMEOUT })
        ok({ coords: { latitude: -34.7, longitude: -58.4, accuracy: 480 } })
    })

    const res = await capturarUbicacion()

    expect(res).toEqual({ ok: true, coord: '-34.7,-58.4', precisionM: 480 })
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[1][2].enableHighAccuracy).toBe(false)
})

it('posición no disponible en la etapa 1 también reintenta', async () => {
    const spy = mockGeolocation((ok: any, fail: any, opts: any) => {
        if (opts.enableHighAccuracy) return fail({ code: POSITION_UNAVAILABLE })
        ok({ coords: { latitude: -34.7, longitude: -58.4, accuracy: 900 } })
    })

    const res = await capturarUbicacion()

    expect(res).toMatchObject({ ok: true })
    expect(spy).toHaveBeenCalledTimes(2)
})

it('si fallan las dos etapas devuelve sin_senal', async () => {
    const spy = mockGeolocation((_ok: any, fail: any) => fail({ code: TIMEOUT }))

    const res = await capturarUbicacion()

    expect(res).toEqual({ ok: false, motivo: 'sin_senal' })
    expect(spy).toHaveBeenCalledTimes(2)
})

it('sin API de geolocalización devuelve no_soportado', async () => {
    vi.stubGlobal('navigator', {})

    const res = await capturarUbicacion()

    expect(res).toEqual({ ok: false, motivo: 'no_soportado' })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/lib/geolocation.test.ts`
Esperado: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

Crear `src/lib/geolocation.ts`:

```ts
export type GeoResult =
    | { ok: true; coord: string; precisionM: number }
    | { ok: false; motivo: 'denegado' | 'sin_senal' | 'no_soportado' }

const PERMISSION_DENIED = 1

function intentar(enableHighAccuracy: boolean, timeout: number): Promise<GeoResult> {
    return new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
            pos =>
                resolve({
                    ok: true,
                    coord: `${pos.coords.latitude},${pos.coords.longitude}`,
                    precisionM: pos.coords.accuracy,
                }),
            err =>
                resolve({
                    ok: false,
                    motivo: err.code === PERMISSION_DENIED ? 'denegado' : 'sin_senal',
                }),
            { enableHighAccuracy, timeout, maximumAge: 0 },
        )
    })
}

/**
 * Captura UNA posición, en dos etapas.
 *
 * La geolocalización es OBLIGATORIA para iniciar y cerrar una visita (el backend rechaza
 * con COORD_REQUERIDA). Esto revierte a propósito §6/§10 del spec del 22/07, que la hacía
 * best-effort: el dato existe para verificar que el vendedor estuvo en el cliente, y si su
 * captura es voluntaria para el verificado, la métrica es opt-out.
 *
 * Las dos etapas son lo que hace que bloquear no vare a un vendedor honesto:
 *   1. GPS fino — falla bajo techo.
 *   2. Solo si la 1 falló por señal (NO por permiso): wifi/antena. Gruesa —cientos de
 *      metros— pero devuelve fix casi siempre que el permiso esté dado, y para confirmar
 *      presencia contra coord_cliente alcanza.
 *
 * `denegado` no reintenta: es el caso deliberado, y reintentar solo demoraría el bloqueo.
 */
export async function capturarUbicacion(): Promise<GeoResult> {
    if (!navigator.geolocation) return { ok: false, motivo: 'no_soportado' }

    const fino = await intentar(true, 8000)
    if (fino.ok || fino.motivo === 'denegado') return fino

    return intentar(false, 15000)
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/lib/geolocation.test.ts`
Esperado: PASS, 6 tests.

- [ ] **Step 5: Vaciar el hook viejo**

Reemplazar todo `src/hooks/useGeolocation.ts`:

```ts
import { useState } from 'react'
import { capturarUbicacion, type GeoResult } from '@/lib/geolocation'

/** Hook wrapper: expone `capture()` + el último resultado + estado de carga. */
export function useGeolocation() {
    const [resultado, setResultado] = useState<GeoResult | null>(null)
    const [capturing, setCapturing] = useState(false)

    async function capture(): Promise<GeoResult> {
        setCapturing(true)
        const r = await capturarUbicacion()
        setResultado(r)
        setCapturing(false)
        return r
    }

    return { resultado, capturing, capture }
}
```

Borrar `src/hooks/useGeolocation.test.ts`: probaba el contrato viejo (`getCurrentCoord` devolviendo `null`), y su reemplazo es `lib/geolocation.test.ts`.

```bash
rm src/hooks/useGeolocation.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/geolocation.ts src/lib/geolocation.test.ts src/hooks/useGeolocation.ts
git rm --cached src/hooks/useGeolocation.test.ts 2>/dev/null; git add -A src/hooks/
git commit -m "feat(geo): captura en dos etapas que distingue denegado de sin señal"
```

---

### Task 3: Capa de API y extracción de códigos de error

**Files:**
- Modify: `src/api/planificacion.ts`
- Modify: `src/api/planificacion.test.ts`
- Modify: `src/api/apiClient.ts`
- Create: `src/lib/apiError.ts`
- Test: `src/lib/apiError.test.ts`

**Interfaces:**
- Consumes: tipos de Task 1.
- Produces: las 16 funciones de la tabla del spec §3.2, `getPropuesta` sin cambios, y `errorCode(err: unknown): string | null`.

- [ ] **Step 1: Escribir el test de `apiError`**

Crear `src/lib/apiError.test.ts`:

```ts
import { errorCode } from './apiError'

it('extrae el code de un error de axios', () => {
    expect(errorCode({ response: { data: { ok: 0, code: 'CICLO_NO_ABIERTO' } } })).toBe(
        'CICLO_NO_ABIERTO',
    )
})

it('devuelve null cuando la respuesta no trae code', () => {
    expect(errorCode({ response: { data: { ok: 0, error: 'boom' } } })).toBeNull()
})

it('devuelve null ante un error de red sin response', () => {
    expect(errorCode(new Error('Network Error'))).toBeNull()
})

it('no explota con null ni con formas inesperadas', () => {
    expect(errorCode(null)).toBeNull()
    expect(errorCode('boom')).toBeNull()
    expect(errorCode({ response: {} })).toBeNull()
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/apiError.test.ts`
Esperado: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar `apiError`**

Crear `src/lib/apiError.ts`:

```ts
/**
 * El código de negocio de un error de la API, o null.
 *
 * El front ramifica por `code`, no por status: un 409 significa cinco cosas distintas
 * (CICLO_NO_ABIERTO, CICLO_ABIERTO_EXISTENTE, VISITA_YA_CERRADA, RUBRO_DE_PROPUESTA…).
 * Vive en un solo lugar para no destripar err.response.data.code en cada componente.
 */
export function errorCode(err: unknown): string | null {
    const code = (err as { response?: { data?: { code?: unknown } } })?.response?.data?.code
    return typeof code === 'string' ? code : null
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/apiError.test.ts`
Esperado: PASS, 4 tests.

- [ ] **Step 5: Escribir los tests de la capa de API**

Reemplazar todo `src/api/planificacion.test.ts`:

```ts
import { vi } from 'vitest'
import { apiClient } from './apiClient'
import {
    getCicloActual,
    getCicloPreview,
    abrirCiclo,
    cerrarCiclo,
    reagendarCicloCliente,
    getAgendaSemana,
    getAgendaDia,
    getMotivos,
    getVisitaActiva,
    iniciarVisita,
    cerrarVisita,
    registrarNoVisita,
    getRubros,
    agregarRubro,
    resolverRubro,
    eliminarRubro,
    getPropuesta,
} from './planificacion'

vi.mock('./apiClient', () => ({
    apiClient: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}))

const ok = (data: unknown) => ({ data: { ok: 1, data } })

beforeEach(() => vi.clearAllMocks())

describe('ciclo', () => {
    it('getCicloActual devuelve null cuando no hay vuelta abierta', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok(null))
        await expect(getCicloActual()).resolves.toBeNull()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/ciclo/actual')
    })

    it('getCicloPreview sin semana no manda params', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok({ semana: 3 }))
        await getCicloPreview()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/ciclo/preview', {
            params: undefined,
        })
    })

    it('getCicloPreview con semana la manda como param', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok({ semana: 4 }))
        await getCicloPreview(4)
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/ciclo/preview', {
            params: { semana: 4 },
        })
    })

    it('abrirCiclo sin semana manda un body vacío', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ cicloId: 1 }))
        await abrirCiclo()
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/ciclo/abrir', {})
    })

    it('cerrarCiclo postea sin body', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ cerrado: true }))
        await cerrarCiclo()
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/ciclo/cerrar')
    })

    it('reagendarCicloCliente usa PATCH sobre el cicloClienteId', async () => {
        ;(apiClient.patch as any).mockResolvedValue({ data: { ok: 1 } })
        await reagendarCicloCliente(42, 3)
        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/ciclo-cliente/42/reagendar',
            { dia: 3 },
        )
    })
})

describe('agenda', () => {
    it('getAgendaSemana NO manda semana: la vuelta es la abierta', async () => {
        // Regresión del contrato viejo, que pedía ?semana=s1.
        ;(apiClient.get as any).mockResolvedValue(ok({ LUN: [] }))
        await getAgendaSemana()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/agenda/semana')
    })

    it('getAgendaDia manda solo dia, sin fecha', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok([]))
        await getAgendaDia('MIE')
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/agenda/dia', {
            params: { dia: 'MIE' },
        })
    })
})

describe('motivos', () => {
    it('getMotivos sin nivel no manda params', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok([]))
        await getMotivos()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/motivos', {
            params: undefined,
        })
    })

    it('getMotivos filtra por nivel', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok([]))
        await getMotivos('rubro')
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/motivos', {
            params: { nivel: 'rubro' },
        })
    })
})

describe('visitas', () => {
    it('getVisitaActiva devuelve la resolución cruda o null', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok({ id: 5, cicloClienteId: 11 }))
        const res = await getVisitaActiva()
        expect(res?.id).toBe(5)
    })

    it('iniciarVisita manda cicloClienteId, NO codigoParticularCliente', async () => {
        // Regresión del contrato viejo, que mandaba código + nombre del cliente.
        ;(apiClient.post as any).mockResolvedValue(ok({ visitaId: 42, rubros: 3 }))
        const res = await iniciarVisita({ cicloClienteId: 11, coordInicio: '-34.6,-58.4' })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas', {
            cicloClienteId: 11,
            coordInicio: '-34.6,-58.4',
        })
        expect(res).toEqual({ visitaId: 42, rubros: 3 })
    })

    it('cerrarVisita manda SOLO coordFinal, nunca motivoIds', async () => {
        // Regresión del contrato viejo: el resultado comercial ahora vive en los rubros.
        ;(apiClient.put as any).mockResolvedValue(ok({ visitaId: 42, rubrosPendientes: 2 }))
        const res = await cerrarVisita(42, { coordFinal: '-34.7,-58.4' })
        expect(apiClient.put).toHaveBeenCalledWith('/planificacion/visitas/42/cerrar', {
            coordFinal: '-34.7,-58.4',
        })
        expect(res.rubrosPendientes).toBe(2)
    })

    it('registrarNoVisita manda cicloClienteId y motivoIds', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ cicloClienteId: 11 }))
        await registrarNoVisita({ cicloClienteId: 11, motivoIds: [1, 3] })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas/no-visita', {
            cicloClienteId: 11,
            motivoIds: [1, 3],
        })
    })
})

describe('rubros', () => {
    it('getRubros lee los de la visita', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok([{ id: 1 }]))
        await getRubros(42)
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/visitas/42/rubros')
    })

    it('agregarRubro postea code y descripción', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ visitaRubroId: 7 }))
        await agregarRubro(42, { rubroCode: 'FILTROS', rubroDescripcion: 'Filtros' })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas/42/rubros', {
            rubroCode: 'FILTROS',
            rubroDescripcion: 'Filtros',
        })
    })

    it('resolverRubro manda los motivos y devuelve los pendientes', async () => {
        ;(apiClient.put as any).mockResolvedValue(ok({ rubrosPendientes: 1 }))
        const motivos = [
            { motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 12 },
        ]
        const res = await resolverRubro(42, 7, { motivos })
        expect(apiClient.put).toHaveBeenCalledWith(
            '/planificacion/visitas/42/rubros/7',
            { motivos },
        )
        expect(res.rubrosPendientes).toBe(1)
    })

    it('eliminarRubro borra por id', async () => {
        ;(apiClient.delete as any).mockResolvedValue({ data: { ok: 1 } })
        await eliminarRubro(42, 7)
        expect(apiClient.delete).toHaveBeenCalledWith('/planificacion/visitas/42/rubros/7')
    })
})

describe('propuesta', () => {
    it('getPropuesta sigue apuntando a /sale/rubro/recommendations', async () => {
        ;(apiClient.post as any).mockResolvedValue({ data: { data: { clients: [] } } })
        await getPropuesta('10034')
        expect(apiClient.post).toHaveBeenCalledWith('/sale/rubro/recommendations', {
            particularCode: '10034',
        })
    })
})
```

- [ ] **Step 6: Correr los tests para verificar que fallan**

Run: `npx vitest run src/api/planificacion.test.ts`
Esperado: FAIL — no existen las funciones nuevas y las viejas tienen otra firma.

- [ ] **Step 7: Reescribir la capa de API**

Reemplazar todo `src/api/planificacion.ts`:

```ts
import { apiClient } from './apiClient'
import type {
    Dia,
    IAbrirCicloResult,
    IAgendaClient,
    IAgregarRubroDTO,
    IAgregarRubroResult,
    ICerrarCicloResult,
    ICerrarVisitaDTO,
    ICerrarVisitaResult,
    ICicloSemana,
    IIniciarVisitaDTO,
    IMotivo,
    INoVisitaDTO,
    INoVisitaResult,
    IPreviewCiclo,
    IResolucion,
    IResolverRubroDTO,
    IResolverRubroResult,
    IRubroRecommendationsResponse,
    IVisitaRubro,
    NivelMotivo,
    SemanaAgenda,
} from '@/types/planificacion'

// ── Ciclo ──────────────────────────────────────────────────────────────────────

/** La vuelta abierta del vendedor, o null. Devuelve 200 con data:null cuando no hay
 *  ninguna, así que el front sabe ANTES de pedir la agenda (que tiraría 409). */
export const getCicloActual = async (): Promise<ICicloSemana | null> => {
    const res = await apiClient.get('/planificacion/ciclo/actual')
    return res.data.data
}

/** El plan de una semana SIN abrirla. Sin `semana`, el backend previsualiza la que
 *  propone y devuelve cuál eligió. */
export const getCicloPreview = async (semana?: number): Promise<IPreviewCiclo> => {
    const res = await apiClient.get('/planificacion/ciclo/preview', {
        params: semana === undefined ? undefined : { semana },
    })
    return res.data.data
}

export const abrirCiclo = async (semana?: number): Promise<IAbrirCicloResult> => {
    const res = await apiClient.post(
        '/planificacion/ciclo/abrir',
        semana === undefined ? {} : { semana },
    )
    return res.data.data
}

/** Ojo: con 409 el backend devuelve ok:0 pero CON data (las dos listas de bloqueo).
 *  El llamador lo lee de err.response.data.data — ver CerrarSemanaSheet. */
export const cerrarCiclo = async (): Promise<ICerrarCicloResult> => {
    const res = await apiClient.post('/planificacion/ciclo/cerrar')
    return res.data.data
}

/** Mueve el día del cliente dentro de la vuelta. NO lo resuelve: queda pendiente. */
export const reagendarCicloCliente = async (
    cicloClienteId: number,
    dia: number,
): Promise<void> => {
    await apiClient.patch(`/planificacion/ciclo-cliente/${cicloClienteId}/reagendar`, {
        dia,
    })
}

// ── Agenda ─────────────────────────────────────────────────────────────────────

/** Sin parámetro `semana`: la vuelta es la que el vendedor tiene abierta. */
export const getAgendaSemana = async (): Promise<SemanaAgenda> => {
    const res = await apiClient.get('/planificacion/agenda/semana')
    return res.data.data
}

export const getAgendaDia = async (dia: Dia): Promise<IAgendaClient[]> => {
    const res = await apiClient.get('/planificacion/agenda/dia', { params: { dia } })
    return res.data.data
}

// ── Motivos ────────────────────────────────────────────────────────────────────

export const getMotivos = async (nivel?: NivelMotivo): Promise<IMotivo[]> => {
    const res = await apiClient.get('/planificacion/motivos', {
        params: nivel === undefined ? undefined : { nivel },
    })
    return res.data.data
}

// ── Visitas ────────────────────────────────────────────────────────────────────

export const getVisitaActiva = async (): Promise<IResolucion | null> => {
    const res = await apiClient.get('/planificacion/visitas/activa')
    return res.data.data
}

export const iniciarVisita = async (
    dto: IIniciarVisitaDTO,
): Promise<{ visitaId: number; rubros: number }> => {
    const res = await apiClient.post('/planificacion/visitas', dto)
    return res.data.data
}

/** Sin motivoIds: el resultado comercial vive en los rubros y se puede cargar después. */
export const cerrarVisita = async (
    visitaId: number,
    body: ICerrarVisitaDTO,
): Promise<ICerrarVisitaResult> => {
    const res = await apiClient.put(`/planificacion/visitas/${visitaId}/cerrar`, body)
    return res.data.data
}

export const registrarNoVisita = async (dto: INoVisitaDTO): Promise<INoVisitaResult> => {
    const res = await apiClient.post('/planificacion/visitas/no-visita', dto)
    return res.data.data
}

// ── Rubros de la visita ────────────────────────────────────────────────────────

/** La propuesta CONGELADA al iniciar la visita (más los agregados a mano). */
export const getRubros = async (visitaId: number): Promise<IVisitaRubro[]> => {
    const res = await apiClient.get(`/planificacion/visitas/${visitaId}/rubros`)
    return res.data.data
}

export const agregarRubro = async (
    visitaId: number,
    dto: IAgregarRubroDTO,
): Promise<IAgregarRubroResult> => {
    const res = await apiClient.post(`/planificacion/visitas/${visitaId}/rubros`, dto)
    return res.data.data
}

/** Reemplaza los motivos del rubro, no acumula. No exige la visita abierta. */
export const resolverRubro = async (
    visitaId: number,
    rubroId: number,
    dto: IResolverRubroDTO,
): Promise<IResolverRubroResult> => {
    const res = await apiClient.put(
        `/planificacion/visitas/${visitaId}/rubros/${rubroId}`,
        dto,
    )
    return res.data.data
}

/** Solo rubros agregados a mano: los de la propuesta fallan con RUBRO_DE_PROPUESTA. */
export const eliminarRubro = async (visitaId: number, rubroId: number): Promise<void> => {
    await apiClient.delete(`/planificacion/visitas/${visitaId}/rubros/${rubroId}`)
}

// ── Propuesta comercial (endpoint reusado, fuera del dominio de planificación) ──

export const getPropuesta = async (
    codigoParticularCliente: string,
): Promise<IRubroRecommendationsResponse> => {
    const res = await apiClient.post('/sale/rubro/recommendations', {
        particularCode: codigoParticularCliente,
    })
    return res.data.data ?? res.data
}
```

- [ ] **Step 8: Correr los tests para verificar que pasan**

Run: `npx vitest run src/api/planificacion.test.ts`
Esperado: PASS, 19 tests.

- [ ] **Step 9: Sacar la excepción CRM del interceptor**

En `src/api/apiClient.ts`, el manejador de 401 queda:

```ts
apiClient.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401) {
            localStorage.removeItem('access_token')
            // An expired/missing token routes to /login (see ProtectedRoute.tsx).
            // Avoid reloading there to prevent a reload loop if that screen ever
            // makes an authenticated request.
            if (window.location.pathname !== '/login') {
                window.location.reload()
            }
        }
        return Promise.reject(error)
    },
)
```

Su único consumidor era `reintentarSeguimiento`, cuyo endpoint desapareció con el aviso a Cromo. Si `src/api/apiClient.test.ts` tiene un test de esa excepción, borrarlo.

Run: `npx vitest run src/api/apiClient.test.ts`
Esperado: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/api/planificacion.ts src/api/planificacion.test.ts src/api/apiClient.ts src/api/apiClient.test.ts src/lib/apiError.ts src/lib/apiError.test.ts
git commit -m "feat(api): contrato de ciclos y extracción de códigos de error"
```

---

### Task 4: Hooks

**Files:**
- Create: `src/hooks/useCiclo.ts`, `src/hooks/useCiclo.test.tsx`
- Create: `src/hooks/useRubros.ts`, `src/hooks/useRubros.test.tsx`
- Modify: `src/hooks/useAgenda.ts` (+ `.test.tsx`), `useMotivos.ts` (+ `.test.tsx`), `useVisitas.ts` (+ `.test.tsx`)
- Modify: `src/lib/mockAgendaData.ts`

**Interfaces:**
- Consumes: la capa de API (Task 3).
- Produces: `agendaKeys`, `cicloKeys`, `rubroKeys`; `useCicloActual`, `useCicloPreview`, `useAbrirCiclo`, `useCerrarCiclo`, `useReagendar`; `useRubros`, `useResolverRubro`, `useAgregarRubro`, `useEliminarRubro`; `useAgendaSemana(enabled)`, `useAgendaDia(dia, enabled)`; `useMotivos(nivel?)`; `useVisitaActiva`, `useIniciarVisita`, `useCerrarVisita`, `useNoVisita`.

- [ ] **Step 1: Hacer genérico el mock visual**

Reemplazar `src/lib/mockAgendaData.ts` (ahora lo usan cards de agenda **y** de preview):

```ts
import type { IVisitClientCard } from '@/types/planificacion'

const HORAS = ['08:30', '09:15', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00']

function hashCode(s: string): number {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return Math.abs(h)
}

/**
 * dirección/teléfono son reales desde fct_clients — ya NO se mockean. Lo único que el
 * backend todavía no asigna es la HORA de visita, así que se completa determinísticamente
 * (estable por código de cliente, no aleatoria en cada render) para sostener el diseño
 * del card. Borrar cuando la agenda asigne horarios reales.
 *
 * Genérico sobre la card base: lo aplican tanto la agenda como el preview.
 */
export function withMockVisualData<T extends IVisitClientCard>(cliente: T): T {
    const h = hashCode(cliente.codigoParticularCliente)
    return { ...cliente, horaVisita: cliente.horaVisita ?? HORAS[h % HORAS.length] }
}
```

- [ ] **Step 2: Escribir los tests de `useCiclo`**

Crear `src/hooks/useCiclo.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useCicloActual, useCicloPreview, useAbrirCiclo, useReagendar } from './useCiclo'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

it('useCicloActual expone null cuando no hay vuelta abierta', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(null)
    const { result } = renderHook(() => useCicloActual(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
})

it('useCicloPreview no consulta hasta tener una semana o habilitación explícita', async () => {
    ;(api.getCicloPreview as any).mockResolvedValue({ semana: 3, dias: {} })
    const { result } = renderHook(() => useCicloPreview(undefined, false), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getCicloPreview).not.toHaveBeenCalled()
})

it('useCicloPreview pide la semana indicada', async () => {
    ;(api.getCicloPreview as any).mockResolvedValue({ semana: 4, dias: {} })
    const { result } = renderHook(() => useCicloPreview(4, true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getCicloPreview).toHaveBeenCalledWith(4)
})

it('useAbrirCiclo pasa la semana elegida', async () => {
    ;(api.abrirCiclo as any).mockResolvedValue({ cicloId: 1, semana: 3, clientes: 39, omitidos: [] })
    const { result } = renderHook(() => useAbrirCiclo(), { wrapper })
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync(3)
    })
    expect(api.abrirCiclo).toHaveBeenCalledWith(3)
    expect(out.clientes).toBe(39)
})

it('useReagendar manda cicloClienteId y día', async () => {
    ;(api.reagendarCicloCliente as any).mockResolvedValue(undefined)
    const { result } = renderHook(() => useReagendar(), { wrapper })
    await waitFor(async () => {
        await result.current.mutateAsync({ cicloClienteId: 42, dia: 3 })
    })
    expect(api.reagendarCicloCliente).toHaveBeenCalledWith(42, 3)
})
```

- [ ] **Step 3: Correr los tests para verificar que fallan**

Run: `npx vitest run src/hooks/useCiclo.test.tsx`
Esperado: FAIL — no existe el módulo.

- [ ] **Step 4: Implementar `useCiclo`**

Crear `src/hooks/useCiclo.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    abrirCiclo,
    cerrarCiclo,
    getCicloActual,
    getCicloPreview,
    reagendarCicloCliente,
} from '@/api/planificacion'
import { withMockVisualData } from '@/lib/mockAgendaData'
import { agendaKeys } from './useAgenda'
import type { Dia, IPreviewCiclo } from '@/types/planificacion'

export const cicloKeys = {
    actual: ['ciclo', 'actual'] as const,
    preview: (semana: number | undefined) => ['ciclo', 'preview', semana ?? 'propuesta'] as const,
}

export function useCicloActual() {
    // getCicloActual no toma argumentos, así que pasarla directo como queryFn es seguro:
    // React Query le inyecta un QueryFunctionContext que la función ignora.
    return useQuery({ queryKey: cicloKeys.actual, queryFn: getCicloActual })
}

/** El plan de una semana sin abrirla. `enabled` en false mientras no se sepa qué mostrar. */
export function useCicloPreview(semana: number | undefined, enabled: boolean) {
    return useQuery({
        queryKey: cicloKeys.preview(semana),
        queryFn: async (): Promise<IPreviewCiclo> => {
            const data = await getCicloPreview(semana)
            const dias = {} as IPreviewCiclo['dias']
            for (const dia of Object.keys(data.dias) as Dia[]) {
                dias[dia] = data.dias[dia].map(withMockVisualData)
            }
            return { ...data, dias }
        },
        enabled,
    })
}

/** Abrir CONGELA el plan y no hay endpoint para descartarlo: invalidar todo lo que
 *  dependa de la vuelta para que nada quede mostrando el estado previo. */
export function useAbrirCiclo() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (semana?: number) => abrirCiclo(semana),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
        },
    })
}

export function useCerrarCiclo() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => cerrarCiclo(),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
        },
    })
}

export function useReagendar() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { cicloClienteId: number; dia: number }) =>
            reagendarCicloCliente(args.cicloClienteId, args.dia),
        onSuccess: () => qc.invalidateQueries({ queryKey: agendaKeys.semana }),
    })
}
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `npx vitest run src/hooks/useCiclo.test.tsx`
Esperado: PASS, 5 tests.

- [ ] **Step 6: Escribir los tests de `useRubros`**

Crear `src/hooks/useRubros.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useRubros, useResolverRubro } from './useRubros'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

it('useRubros no consulta sin visitaId', async () => {
    const { result } = renderHook(() => useRubros(null), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getRubros).not.toHaveBeenCalled()
})

it('useRubros trae los rubros congelados de la visita', async () => {
    ;(api.getRubros as any).mockResolvedValue([{ id: 1, rubroCode: 'AMORT' }])
    const { result } = renderHook(() => useRubros(42), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getRubros).toHaveBeenCalledWith(42)
    expect(result.current.data).toHaveLength(1)
})

it('useResolverRubro manda los motivos del rubro', async () => {
    ;(api.resolverRubro as any).mockResolvedValue({ rubrosPendientes: 2 })
    const { result } = renderHook(() => useResolverRubro(42), { wrapper })
    const motivos = [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }]
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync({ rubroId: 7, motivos })
    })
    expect(api.resolverRubro).toHaveBeenCalledWith(42, 7, { motivos })
    expect(out.rubrosPendientes).toBe(2)
})
```

- [ ] **Step 7: Correr los tests para verificar que fallan**

Run: `npx vitest run src/hooks/useRubros.test.tsx`
Esperado: FAIL — no existe el módulo.

- [ ] **Step 8: Implementar `useRubros`**

Crear `src/hooks/useRubros.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    agregarRubro,
    eliminarRubro,
    getRubros,
    resolverRubro,
} from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import type { IAgregarRubroDTO, IRubroMotivo } from '@/types/planificacion'

export const rubroKeys = {
    deVisita: (visitaId: number) => ['rubros', visitaId] as const,
}

export function useRubros(visitaId: number | null) {
    return useQuery({
        queryKey: rubroKeys.deVisita(visitaId ?? 0),
        queryFn: () => getRubros(visitaId as number),
        enabled: visitaId !== null,
    })
}

/**
 * Toda mutación de rubros invalida TAMBIÉN la agenda: `rubrosPendientes` viaja en la
 * card del cliente, así que resolver un rubro cambia lo que la vista semanal muestra.
 */
function useMutacionDeRubros<TVars, TData>(
    visitaId: number,
    fn: (vars: TVars) => Promise<TData>,
) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: fn,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rubroKeys.deVisita(visitaId) })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
        },
    })
}

/** El PUT REEMPLAZA los motivos del rubro, no acumula. */
export function useResolverRubro(visitaId: number) {
    return useMutacionDeRubros(
        visitaId,
        (args: { rubroId: number; motivos: IRubroMotivo[] }) =>
            resolverRubro(visitaId, args.rubroId, { motivos: args.motivos }),
    )
}

export function useAgregarRubro(visitaId: number) {
    return useMutacionDeRubros(visitaId, (dto: IAgregarRubroDTO) =>
        agregarRubro(visitaId, dto),
    )
}

export function useEliminarRubro(visitaId: number) {
    return useMutacionDeRubros(visitaId, (rubroId: number) =>
        eliminarRubro(visitaId, rubroId),
    )
}
```

- [ ] **Step 9: Correr los tests para verificar que pasan**

Run: `npx vitest run src/hooks/useRubros.test.tsx`
Esperado: PASS, 3 tests.

- [ ] **Step 10: Actualizar `useAgenda`**

Reemplazar `src/hooks/useAgenda.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { getAgendaSemana, getAgendaDia } from '@/api/planificacion'
import { withMockVisualData } from '@/lib/mockAgendaData'
import type { Dia, SemanaAgenda } from '@/types/planificacion'

export const agendaKeys = {
    semana: ['agenda', 'semana'] as const,
    dia: (dia: string) => ['agenda', 'dia', dia] as const,
}

/**
 * `enabled` sale de tener una vuelta abierta. Sin ella el endpoint responde
 * 409 CICLO_NO_ABIERTO, y ramificar la pantalla sobre un error HTTP sería frágil:
 * GET /ciclo/actual ya devuelve null, así que se sabe ANTES de preguntar.
 */
export function useAgendaSemana(enabled: boolean) {
    return useQuery({
        queryKey: agendaKeys.semana,
        queryFn: async () => {
            const semana = await getAgendaSemana()
            const out = {} as SemanaAgenda
            for (const dia of Object.keys(semana) as Dia[]) {
                out[dia] = semana[dia].map(withMockVisualData)
            }
            return out
        },
        enabled,
    })
}

export function useAgendaDia(dia: Dia, enabled = true) {
    return useQuery({
        queryKey: agendaKeys.dia(dia),
        queryFn: async () => (await getAgendaDia(dia)).map(withMockVisualData),
        enabled,
    })
}
```

Actualizar `src/hooks/useAgenda.test.tsx`: `useAgendaSemana` ahora toma `enabled`, `useAgendaDia` ya no recibe `fecha`, y la key del día perdió la fecha. Agregar:

```tsx
it('useAgendaSemana no consulta sin vuelta abierta', async () => {
    const { result } = renderHook(() => useAgendaSemana(false), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getAgendaSemana).not.toHaveBeenCalled()
})
```

- [ ] **Step 11: Actualizar `useMotivos`**

Reemplazar `src/hooks/useMotivos.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { getMotivos } from '@/api/planificacion'
import type { NivelMotivo } from '@/types/planificacion'

/** El catálogo es DATO (agregar un motivo es un INSERT), así que nunca se hardcodea
 *  del lado del front. `nivel` separa el picklist de "no visité" del de rubros. */
export function useMotivos(nivel?: NivelMotivo) {
    return useQuery({
        queryKey: ['motivos', nivel ?? 'todos'],
        queryFn: () => getMotivos(nivel),
        staleTime: 30 * 60 * 1000,
    })
}
```

Actualizar `src/hooks/useMotivos.test.tsx` para afirmar que el nivel llega a la API y que la key lo incluye.

- [ ] **Step 12: Actualizar `useVisitas`**

Reemplazar `src/hooks/useVisitas.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    cerrarVisita,
    getVisitaActiva,
    iniciarVisita,
    registrarNoVisita,
} from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { cicloKeys } from './useCiclo'
import type { ICerrarVisitaDTO, IIniciarVisitaDTO, INoVisitaDTO } from '@/types/planificacion'

export const visitaKeys = { activa: ['visita-activa'] as const }

export function useVisitaActiva() {
    return useQuery({ queryKey: visitaKeys.activa, queryFn: getVisitaActiva })
}

function useMutacionDeVisita<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
    const qc = useQueryClient()
    return useMutation({
        // Envuelta (no pasada directo) para que solo las `variables` reales lleguen a la
        // función: React Query v5 llama a mutationFn con un segundo argumento de contexto,
        // que si no se filtraría en los toHaveBeenCalledWith de los tests.
        mutationFn: fn,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: visitaKeys.activa })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
        },
    })
}

export function useIniciarVisita() {
    return useMutacionDeVisita((dto: IIniciarVisitaDTO) => iniciarVisita(dto))
}

/** Sin motivoIds: el resultado comercial vive en los rubros. */
export function useCerrarVisita() {
    return useMutacionDeVisita((args: { visitaId: number } & ICerrarVisitaDTO) =>
        cerrarVisita(args.visitaId, { coordFinal: args.coordFinal }),
    )
}

export function useNoVisita() {
    return useMutacionDeVisita((dto: INoVisitaDTO) => registrarNoVisita(dto))
}
```

Actualizar `src/hooks/useVisitas.test.tsx` a las firmas nuevas: `iniciarVisita` con `{cicloClienteId, coordInicio}`, `cerrarVisita` con `{visitaId, coordFinal}` y **sin** `motivoIds`, `registrarNoVisita` con `{cicloClienteId, motivoIds}`.

- [ ] **Step 13: Correr los tests de hooks**

Run: `npx vitest run src/hooks/`
Esperado: PASS.

- [ ] **Step 14: Commit**

```bash
git add src/hooks/ src/lib/mockAgendaData.ts
git commit -m "feat(hooks): ciclo, rubros y visitas sobre el contrato nuevo"
```

---

### Task 5: `ClienteCard` con cinco estados y tres acciones

**Files:**
- Modify: `src/components/ClienteCard.tsx`
- Modify: `src/components/ClienteCard.test.tsx`

**Interfaces:**
- Consumes: `IAgendaClient`, `estaResuelto` (Task 1).
- Produces: `<ClienteCard cliente onAbrir onReagendar onNoVisita onCargarRubros modo />`, donde los cuatro handlers reciben el `IAgendaClient` completo (no el código): quien lo recibe necesita `cicloClienteId` y `visitaId`, y buscarlos de nuevo por código en la página era una vuelta innecesaria.

- [ ] **Step 1: Escribir los tests**

Reemplazar `src/components/ClienteCard.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ClienteCard from './ClienteCard'
import type { IAgendaClient } from '@/types/planificacion'

function cliente(over: Partial<IAgendaClient> = {}): IAgendaClient {
    return {
        codigoCliente: 'C1',
        codigoParticularCliente: '10034',
        nombreCliente: 'ALMACEN DON JOSE',
        direccion: 'Av. San Martín 100',
        cicloClienteId: 42,
        dia: 1,
        estado: 'pendiente',
        visitaId: null,
        rubrosPendientes: 0,
        ...over,
    }
}

const noop = () => {}
const handlers = {
    onAbrir: noop,
    onReagendar: noop,
    onNoVisita: noop,
    onCargarRubros: noop,
}

it('un cliente pendiente muestra las tres acciones', () => {
    render(<ClienteCard cliente={cliente()} {...handlers} />)
    expect(screen.getByRole('button', { name: /propuesta/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reagendar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /no visité/i })).toBeInTheDocument()
})

it('en_curso muestra el badge y sigue permitiendo abrir la visita', () => {
    render(<ClienteCard cliente={cliente({ estado: 'en_curso', visitaId: 7 })} {...handlers} />)
    expect(screen.getByText(/en curso/i)).toBeInTheDocument()
})

it('un cliente resuelto no ofrece acciones de resolución', () => {
    render(<ClienteCard cliente={cliente({ estado: 'visitada', visitaId: 7 })} {...handlers} />)
    expect(screen.queryByRole('button', { name: /no visité/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reagendar/i })).not.toBeInTheDocument()
})

it('no_visita y reagendada se distinguen visualmente', () => {
    const { rerender } = render(<ClienteCard cliente={cliente({ estado: 'no_visita' })} {...handlers} />)
    expect(screen.getByText(/no visitado/i)).toBeInTheDocument()
    rerender(<ClienteCard cliente={cliente({ estado: 'reagendada' })} {...handlers} />)
    expect(screen.getByText(/reagendada/i)).toBeInTheDocument()
})

it('una visita con rubros sin cargar lo avisa y ofrece completarla', () => {
    const onCargarRubros = vi.fn()
    render(
        <ClienteCard
            cliente={cliente({ estado: 'visitada', visitaId: 7, rubrosPendientes: 2 })}
            {...handlers}
            onCargarRubros={onCargarRubros}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /2 rubros sin cargar/i }))
    expect(onCargarRubros).toHaveBeenCalledWith(expect.objectContaining({ visitaId: 7 }))
})

it('en modo preview no hay ninguna acción', () => {
    // La compuerta real la da el tipo (IPreviewClient no llega acá), pero la card
    // igual tiene que renderizarse sin botones cuando se hojea otra semana.
    render(<ClienteCard cliente={cliente()} {...handlers} modo="preview" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('los handlers reciben el cliente completo, no el código', () => {
    const onAbrir = vi.fn()
    render(<ClienteCard cliente={cliente()} {...handlers} onAbrir={onAbrir} />)
    fireEvent.click(screen.getByRole('button', { name: /propuesta/i }))
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ cicloClienteId: 42 }))
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/components/ClienteCard.test.tsx`
Esperado: FAIL — la card usa `cliente.resuelto` y pasa códigos a los handlers.

- [ ] **Step 3: Implementar**

En `src/components/ClienteCard.tsx`, cambiar la interfaz y la lógica de estado. El resto del cuerpo (avatar, dirección, teléfono) queda igual:

```tsx
import { AlertCircle, Ban, Calendar, CalendarClock, Check, Clock, MapPin, Phone, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { titleCaseNombre, initialsOfCliente } from '@/lib/textFormat'
import { estaResuelto } from '@/lib/estadoCiclo'
import type { IAgendaClient } from '@/types/planificacion'

interface ClienteCardProps {
    cliente: IAgendaClient
    isToday?: boolean
    /** 'preview' = hojeando otra semana: se ve, no se opera. */
    modo?: 'operable' | 'preview'
    onAbrir: (cliente: IAgendaClient) => void
    onReagendar: (cliente: IAgendaClient) => void
    onNoVisita: (cliente: IAgendaClient) => void
    onCargarRubros: (cliente: IAgendaClient) => void
}

const ACCENT = '#213D82'
const TELEFONO_LIMPIO = /^[\d\s()+-]+$/

function hasTimePassed(hora: string): boolean {
    const now = new Date()
    const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    return hora < current
}

export default function ClienteCard({
    cliente,
    isToday,
    modo = 'operable',
    onAbrir,
    onReagendar,
    onNoVisita,
    onCargarRubros,
}: ClienteCardProps) {
    const resuelto = estaResuelto(cliente.estado)
    const enCurso = cliente.estado === 'en_curso'
    const operable = modo === 'operable'
    // `||` (no `??`): nombreFantasia real puede venir como '' (sin cartel) — en ese
    // caso hay que caer a la razón social, no mostrar un nombre vacío.
    const nombre = titleCaseNombre(cliente.nombreFantasia || cliente.nombreCliente)
    const atrasado =
        !resuelto && !enCurso && !!isToday && !!cliente.horaVisita && hasTimePassed(cliente.horaVisita)
    const telefonoLimpio =
        cliente.telefono && TELEFONO_LIMPIO.test(cliente.telefono) ? cliente.telefono : null
    const pendientes = cliente.rubrosPendientes

    return (
        <div
            className="relative rounded-[14px] border p-3 pl-4 shadow-sm"
            style={{
                borderColor: resuelto ? '#BFE6CE' : '#E7E9F0',
                background: resuelto ? '#F3FAF5' : '#FFFFFF',
            }}
        >
            <div className="absolute inset-y-3 left-0 w-[3px] rounded-r-sm" style={{ background: ACCENT }} />

            <div className="mb-1.5 flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    {cliente.horaVisita && (
                        <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[#54607A]">
                            <Clock className="h-3 w-3" strokeWidth={2.2} />
                            {cliente.horaVisita}
                        </span>
                    )}
                    {enCurso && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF0E1] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-[#B45309]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316]" />
                            En curso
                        </span>
                    )}
                    {cliente.estado === 'no_visita' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F3F7] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-[#54607A]">
                            <Ban className="h-2.5 w-2.5" strokeWidth={2.6} />
                            No visitado
                        </span>
                    )}
                    {cliente.estado === 'reagendada' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF3FB] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-dsnavy">
                            <CalendarClock className="h-2.5 w-2.5" strokeWidth={2.6} />
                            Reagendada
                        </span>
                    )}
                    {atrasado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FEECEC] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-dsred">
                            Atrasado
                        </span>
                    )}
                </div>
                {cliente.estado === 'visitada' && (
                    <span
                        aria-label="Visitado"
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-dsgreen text-white"
                    >
                        <Check className="h-3 w-3" strokeWidth={3.5} />
                    </span>
                )}
            </div>

            <div className="flex items-start gap-2.5">
                <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-extrabold"
                    style={{ background: `${ACCENT}1A`, color: ACCENT }}
                >
                    {initialsOfCliente(nombre)}
                </span>
                <div className="min-w-0 flex-1">
                    <div
                        className="text-[14.5px] font-extrabold leading-tight"
                        style={{ color: resuelto ? '#8A93A6' : '#182645' }}
                    >
                        {nombre}
                    </div>
                </div>
            </div>

            {(cliente.direccion || cliente.barrio) && (
                <div className="mt-2 flex items-start gap-1.5 pl-[38px] text-xs leading-tight text-dsmuted">
                    <MapPin className="mt-0.5 h-[13px] w-[13px] shrink-0" strokeWidth={2} />
                    <span>{cliente.direccion || cliente.barrio}</span>
                </div>
            )}

            {cliente.telefono && telefonoLimpio && (
                <a
                    href={`tel:+54${telefonoLimpio.replace(/\D/g, '')}`}
                    onClick={e => e.stopPropagation()}
                    className="mt-1 inline-flex items-center gap-1.5 pl-[38px] text-xs font-semibold text-dsnavy"
                >
                    <Phone className="h-[13px] w-[13px]" strokeWidth={2} />
                    {cliente.telefono}
                </a>
            )}

            {cliente.telefono && !telefonoLimpio && (
                <span className="mt-1 inline-flex items-center gap-1.5 pl-[38px] text-xs font-semibold text-dsnavy">
                    <Phone className="h-[13px] w-[13px]" strokeWidth={2} />
                    {cliente.telefono}
                </span>
            )}

            {/* Rubros sin cargar: traban el cierre de la semana, así que el aviso va
                donde el vendedor ya está mirando y no recién al final. */}
            {operable && pendientes > 0 && cliente.visitaId !== null && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCargarRubros(cliente)}
                    className="mt-2.5 h-10 w-full border-[#F0D8A8] bg-[#FEF8EC] text-[12.5px] font-bold text-[#B45309]"
                >
                    <AlertCircle className="h-[14px] w-[14px]" strokeWidth={2.2} />
                    {pendientes} {pendientes === 1 ? 'rubro' : 'rubros'} sin cargar
                </Button>
            )}

            {operable && !resuelto && (
                <div className="mt-2.5 flex flex-col gap-1.5 border-t border-[#EDEFF4] pt-2.5">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAbrir(cliente)}
                        className="h-11 w-full border-[#D8DEEA] text-[13px] text-dsnavy"
                    >
                        <Zap className="h-[14px] w-[14px]" strokeWidth={2} />
                        Propuesta
                    </Button>
                    <div className="flex gap-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onReagendar(cliente)}
                            className="h-11 flex-1 border-[#D8DEEA] text-[12.5px] text-dsnavy"
                        >
                            <Calendar className="h-[14px] w-[14px]" strokeWidth={2} />
                            Reagendar
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onNoVisita(cliente)}
                            className="h-11 flex-1 border-[#D8DEEA] text-[12.5px] text-dsnavy"
                        >
                            <Ban className="h-[14px] w-[14px]" strokeWidth={2} />
                            No visité
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
```

> Las tres acciones no entran en una fila: la columna del board mide 273px y "Reagendar" con ícono no cabe en ~77px. "Propuesta" full-width arriba respeta además el peso visual que le da el prototipo.

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/components/ClienteCard.test.tsx`
Esperado: PASS, 7 tests.

- [ ] **Step 5: Propagar los handlers en `AgendaBoard`**

En `src/components/AgendaBoard.tsx`, cambiar la interfaz y el render de la card:

```tsx
interface AgendaBoardProps {
    semana: SemanaAgenda | undefined
    activo: Dia
    modo?: 'operable' | 'preview'
    onActivoChange: (dia: Dia) => void
    onAbrir: (cliente: IAgendaClient) => void
    onReagendar: (cliente: IAgendaClient) => void
    onNoVisita: (cliente: IAgendaClient) => void
    onCargarRubros: (cliente: IAgendaClient) => void
}
```

Agregar `import type { IAgendaClient } from '@/types/planificacion'` y pasar `modo` + los cuatro handlers a cada `<ClienteCard>`, con `cliente` completo en lugar del código.

- [ ] **Step 6: Commit**

```bash
git add src/components/ClienteCard.tsx src/components/ClienteCard.test.tsx src/components/AgendaBoard.tsx
git commit -m "feat(card): cinco estados del ciclo, no visité y rubros pendientes"
```

---

### Task 6: Resolución por rubro contra el catálogo real

La UI ya existe y calza con el prototipo. Lo que no hace es persistir: `TAGS` está hardcodeado y marca/competidor/diff viven en `useState` local que se descarta. Esto la recablea.

**Files:**
- Modify: `src/components/propuesta/ResolucionRubro.tsx`
- Create: `src/components/propuesta/ResolucionRubro.test.tsx`
- Modify: `src/components/propuesta/RubroCard.tsx`

**Interfaces:**
- Consumes: `IMotivo`, `IRubroMotivo`, `IVisitaRubro` (Task 1).
- Produces: `<ResolucionRubro rubro motivos value onChange onGuardar onBack guardando />` donde `value: IRubroMotivo[]` y `onChange(motivos: IRubroMotivo[])`. El estado lo controla el padre (`VisitaSheet`, Task 7) para poder mantenerlo si el PUT falla.

- [ ] **Step 1: Escribir los tests**

Crear `src/components/propuesta/ResolucionRubro.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionRubro from './ResolucionRubro'
import type { IMotivo, IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'rubro', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
    { motivoId: 16, nivel: 'rubro', descripcion: 'No lo ofrecí', resultado: 'no_ofrecido', requiereDetalle: false },
]

const rubro: IVisitaRubro = {
    id: 7,
    resolucionId: 42,
    rubroCode: 'AMORT',
    rubroDescripcion: 'Amortiguadores',
    gapUnits: 12,
    esPropuesto: true,
    resuelto: false,
    motivos: [],
}

function setup(value: IRubroMotivo[] = [], over: Record<string, unknown> = {}) {
    const onChange = vi.fn()
    const onGuardar = vi.fn()
    render(
        <ResolucionRubro
            rubro={rubro}
            motivos={motivos}
            value={value}
            onChange={onChange}
            onGuardar={onGuardar}
            onBack={() => {}}
            {...over}
        />,
    )
    return { onChange, onGuardar }
}

it('renderiza el catálogo recibido, sin nombres hardcodeados', () => {
    setup()
    expect(screen.getByText('Saqué pedido')).toBeInTheDocument()
    expect(screen.getByText('No lo ofrecí')).toBeInTheDocument()
    // "Poco trabajo" / "Estoy completo" eran del prototipo y NO están en el catálogo.
    expect(screen.queryByText('Poco trabajo')).not.toBeInTheDocument()
})

it('muestra el rubro que se está resolviendo', () => {
    setup()
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
})

it('tildar un motivo lo agrega con los detalles en null', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
    ])
})

it('destildar un motivo lo saca', () => {
    const { onChange } = setup([{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onChange).toHaveBeenCalledWith([])
})

it('el detalle aparece por requiereDetalle, no por el nombre del motivo', () => {
    setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
    expect(screen.getByLabelText(/marca/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/competidor/i)).toBeInTheDocument()
})

it('sin el detalle completo no se puede guardar', () => {
    setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled()
})

it('con el detalle completo se habilita guardar', () => {
    setup([{ motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 12 }])
    expect(screen.getByRole('button', { name: /guardar/i })).toBeEnabled()
})

it('un motivo sin requiereDetalle habilita guardar solo', () => {
    setup([{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }])
    expect(screen.getByRole('button', { name: /guardar/i })).toBeEnabled()
})

it('guardar con cero motivos está permitido: limpia el rubro', () => {
    const { onGuardar } = setup([])
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(onGuardar).toHaveBeenCalled()
})

it('el detalle se edita por motivo', () => {
    const { onChange } = setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.change(screen.getByLabelText(/marca/i), { target: { value: 'Fric-Rot' } })
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 13, marca: 'Fric-Rot', competidor: null, pctDiferencia: null },
    ])
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/components/propuesta/ResolucionRubro.test.tsx`
Esperado: FAIL — el componente tiene otra interfaz y `TAGS` hardcodeado.

- [ ] **Step 3: Implementar**

Reemplazar todo `src/components/propuesta/ResolucionRubro.tsx`:

```tsx
import { ChevronLeft, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { IMotivo, IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

interface ResolucionRubroProps {
    rubro: IVisitaRubro
    /** Catálogo de nivel `rubro`. Nunca se hardcodea: agregar un motivo es un INSERT. */
    motivos: IMotivo[]
    value: IRubroMotivo[]
    onChange: (motivos: IRubroMotivo[]) => void
    onGuardar: () => void
    onBack: () => void
    guardando?: boolean
}

const VACIO = { marca: null, competidor: null, pctDiferencia: null }

/** Un motivo con requiereDetalle exige los tres campos; el backend valida lo mismo
 *  (MOTIVO_DETALLE_REQUERIDO) — acá se previene para no gastar un viaje. */
function detalleCompleto(m: IRubroMotivo): boolean {
    return !!m.marca?.trim() && !!m.competidor?.trim() && m.pctDiferencia !== null
}

export default function ResolucionRubro({
    rubro,
    motivos,
    value,
    onChange,
    onGuardar,
    onBack,
    guardando,
}: ResolucionRubroProps) {
    const porId = new Map(value.map(m => [m.motivoId, m]))

    const incompleto = motivos.some(
        cat =>
            cat.requiereDetalle &&
            porId.has(cat.motivoId) &&
            !detalleCompleto(porId.get(cat.motivoId)!),
    )

    function toggle(motivoId: number) {
        onChange(
            porId.has(motivoId)
                ? value.filter(m => m.motivoId !== motivoId)
                : [...value, { motivoId, ...VACIO }],
        )
    }

    // El detalle vive en la fila (visita_rubro_id, motivo_id), así que se edita POR
    // MOTIVO. Hoy solo "Precio" lo pide, pero modelarlo así hace que un segundo motivo
    // con requiereDetalle funcione sin tocar este código.
    function setDetalle(motivoId: number, campo: keyof typeof VACIO, valor: string) {
        onChange(
            value.map(m =>
                m.motivoId !== motivoId
                    ? m
                    : {
                          ...m,
                          [campo]:
                              campo === 'pctDiferencia'
                                  ? valor === ''
                                      ? null
                                      : Number(valor)
                                  : valor === ''
                                    ? null
                                    : valor,
                      },
            ),
        )
    }

    return (
        <div>
            <div className="mb-1 flex items-center gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={onBack}
                    aria-label="Volver"
                    className="h-[29px] w-[29px] border-[#E1E6F0] text-dsmuted"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
                <span className="text-[13.5px] font-extrabold text-[#182645]">Resolución</span>
            </div>
            <div className="mb-3 ml-[38px] text-[12.5px] font-semibold text-dsmuted">
                {rubro.rubroDescripcion}
            </div>

            <div className="flex flex-col gap-2">
                {motivos.map(cat => {
                    const seleccionado = porId.get(cat.motivoId)
                    const on = !!seleccionado
                    return (
                        <div key={cat.motivoId} className="flex flex-col gap-0">
                            <button
                                onClick={() => toggle(cat.motivoId)}
                                className={`flex w-full items-center gap-2.5 rounded-[11px] border-[1.5px] px-3 py-2.5 text-left font-sans ${
                                    on ? 'border-[#B9CCEC] bg-[#EEF3FB]' : 'border-[#E4E8F0] bg-white'
                                }`}
                            >
                                <span
                                    className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-md border-[1.5px]"
                                    style={{
                                        borderColor: on ? '#213D82' : '#CBD2E0',
                                        background: on ? '#213D82' : '#fff',
                                        color: on ? '#fff' : 'transparent',
                                    }}
                                >
                                    <Check className="h-[13px] w-[13px]" strokeWidth={3.2} />
                                </span>
                                <span
                                    className={`text-sm font-bold ${on ? 'text-[#182645]' : 'text-[#3B4560]'}`}
                                >
                                    {cat.descripcion}
                                </span>
                            </button>

                            {cat.requiereDetalle && on && (
                                <div className="ml-8 mt-2 mb-0.5 flex flex-col gap-2.5 rounded-[10px] border-[1.5px] border-[#B9CCEC] bg-white p-2.5">
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                            Marca
                                        </span>
                                        <input
                                            value={seleccionado.marca ?? ''}
                                            onChange={e => setDetalle(cat.motivoId, 'marca', e.target.value)}
                                            placeholder="Ej. Fric-Rot"
                                            className="w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none"
                                        />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                            Competidor
                                        </span>
                                        <input
                                            value={seleccionado.competidor ?? ''}
                                            onChange={e => setDetalle(cat.motivoId, 'competidor', e.target.value)}
                                            placeholder="Ej. Corven"
                                            className="w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none"
                                        />
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <label
                                            htmlFor={`pct-${cat.motivoId}`}
                                            className="text-[12.5px] font-bold text-[#3B4560]"
                                        >
                                            % de diferencia
                                        </label>
                                        <div className="flex flex-1 items-center justify-end gap-1">
                                            <input
                                                id={`pct-${cat.motivoId}`}
                                                value={seleccionado.pctDiferencia ?? ''}
                                                onChange={e =>
                                                    setDetalle(
                                                        cat.motivoId,
                                                        'pctDiferencia',
                                                        e.target.value.replace(/[^0-9.]/g, ''),
                                                    )
                                                }
                                                inputMode="decimal"
                                                placeholder="0"
                                                className="w-16 rounded-lg border border-[#E1E6F0] px-2 py-1.5 text-right text-sm font-extrabold text-dsnavy outline-none"
                                            />
                                            <span className="text-[15px] font-extrabold text-dsnavy">%</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <Button
                onClick={onGuardar}
                disabled={incompleto || guardando}
                className="mt-4 h-[47px] w-full text-[14.5px]"
            >
                {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
        </div>
    )
}
```

> Guardar con **cero** motivos está permitido a propósito: el PUT reemplaza, así que es la forma de limpiar un rubro cargado por error.

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/components/propuesta/ResolucionRubro.test.tsx`
Esperado: PASS, 10 tests.

- [ ] **Step 5: Actualizar `RubroCard`**

Hoy recibe `rubro: IRubroPropuesta` + `resCount: number` (el conteo de tags efímeros). Pasa a servir los dos usos —pre-visita sin resolución, in-visita con motivos persistidos— sin conocer ninguno de los dos tipos. Reemplazar la interfaz y el bloque de resolución de `src/components/propuesta/RubroCard.tsx`, dejando intacto el resto del layout (nombre, gap, comparación):

```tsx
interface RubroCardProps {
    /** Nombre visible del rubro. */
    nombre: string
    gapPct?: number
    /** Motivos ya cargados. undefined = vista pre-visita: el rubro no se resuelve acá. */
    motivosCargados?: number
    /** Si falta, la card es solo lectura. */
    onResolucion?: () => void
}

export default function RubroCard({
    nombre,
    gapPct,
    motivosCargados,
    onResolucion,
}: RubroCardProps) {
    const resuelto = (motivosCargados ?? 0) > 0
    // ...layout existente, usando `nombre` y `gapPct` donde antes usaba rubro.nombre /
    // rubro.gapPct...
}
```

Y el pie de la card:

```tsx
{onResolucion && (
    <Button
        variant="outline"
        size="sm"
        onClick={onResolucion}
        className={`mt-2 h-10 w-full text-[12.5px] font-bold ${
            resuelto
                ? 'border-[#BFE6CE] bg-[#F3FAF5] text-dsgreen'
                : 'border-[#D8DEEA] text-dsnavy'
        }`}
    >
        {resuelto
            ? `${motivosCargados} ${motivosCargados === 1 ? 'motivo' : 'motivos'} cargados`
            : 'Resolución'}
    </Button>
)}
```

Actualizar los dos llamadores: `PropuestaSheet` (Task 7, sin `onResolucion`) y `VisitaSheet` (Task 7, con él).

- [ ] **Step 6: Correr los tests del directorio**

Run: `npx vitest run src/components/propuesta/`
Esperado: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/propuesta/
git commit -m "feat(rubros): resolución contra el catálogo real, con detalle por motivo"
```

---

### Task 7: `VisitaSheet` y `VisitaFlow`

**Files:**
- Create: `src/components/VisitaSheet.tsx`, `src/components/VisitaSheet.test.tsx`
- Create: `src/components/VisitaFlow.tsx`, `src/components/VisitaFlow.test.tsx`
- Modify: `src/components/PropuestaSheet.tsx`, `src/components/PropuestaSheet.test.tsx`

**Interfaces:**
- Consumes: `useRubros`, `useResolverRubro` (Task 4); `ResolucionRubro` (Task 6); `useMotivos('rubro')`; `capturarUbicacion` (Task 2); `useIniciarVisita`, `useCerrarVisita`.
- Produces:
  - `<VisitaSheet open visitaId nombreCliente visitaCerrada onCerrarVisita onClose cerrando />`
  - `<VisitaFlow cliente onClose onGeoBloqueada />` — `cliente: IAgendaClient | null`; `onGeoBloqueada(motivo)` deja el mensaje en manos de la página.

- [ ] **Step 1: Sacar la resolución efímera de `PropuestaSheet`**

`PropuestaSheet` queda como vista **pre-visita**: lista de rubros recomendados (solo lectura), "Ver versus" e "Iniciar visita". Se borran `resolviendoRubro`, `tagsPorRubro` y `toggleTag`, y el render de `ResolucionRubro`. `RubroCard` se llama sin `onResolucion`:

```tsx
<RubroCard key={r.nombre} nombre={r.nombre} gapPct={r.gapPct} />
```

Actualizar `PropuestaSheet.test.tsx`: ya no hay resolución acá.

Run: `npx vitest run src/components/PropuestaSheet.test.tsx`
Esperado: PASS.

- [ ] **Step 2: Escribir los tests de `VisitaSheet`**

Crear `src/components/VisitaSheet.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import VisitaSheet from './VisitaSheet'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

const motivos = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 16, nivel: 'rubro', descripcion: 'No lo ofrecí', resultado: 'no_ofrecido', requiereDetalle: false },
]

const rubros = [
    {
        id: 7, resolucionId: 42, rubroCode: 'AMORT', rubroDescripcion: 'Amortiguadores',
        gapUnits: 12, esPropuesto: true, resuelto: false, motivos: [],
    },
    {
        id: 8, resolucionId: 42, rubroCode: 'FILT', rubroDescripcion: 'Filtros',
        gapUnits: null, esPropuesto: false, resuelto: true,
        motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
    },
]

function renderSheet(over: Record<string, unknown> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onCerrarVisita = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <VisitaSheet
                open
                visitaId={42}
                nombreCliente="Almacén Don José"
                visitaCerrada={false}
                onCerrarVisita={onCerrarVisita}
                onClose={() => {}}
                {...over}
            />
        </QueryClientProvider>,
    )
    return { onCerrarVisita }
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getRubros as any).mockResolvedValue(rubros)
    ;(api.getMotivos as any).mockResolvedValue(motivos)
    ;(api.resolverRubro as any).mockResolvedValue({ rubrosPendientes: 0 })
})

it('lista los rubros de la propuesta congelada', async () => {
    renderSheet()
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.getByText('Filtros')).toBeInTheDocument()
})

it('pide el catálogo de nivel rubro, no el completo', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(api.getMotivos).toHaveBeenCalledWith('rubro')
})

it('entrar a un rubro abre su resolución', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    expect(await screen.findByText('Resolución')).toBeInTheDocument()
})

it('guardar persiste los motivos del rubro', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() =>
        expect(api.resolverRubro).toHaveBeenCalledWith(42, 7, {
            motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
        }),
    )
})

it('si el guardado falla, NO vuelve a la lista y conserva lo tildado', async () => {
    // El vendedor tipeó marca/competidor: perder eso por un bache de señal lo entrena
    // a no cargarlo más.
    ;(api.resolverRubro as any).mockRejectedValue(new Error('Network Error'))
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/sin conexión/i)).toBeInTheDocument()
    expect(screen.getByText('Resolución')).toBeInTheDocument()
})

it('un rubro de la propuesta no se puede borrar', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    // Solo el agregado a mano (esPropuesto: false) ofrece borrar.
    expect(screen.getAllByRole('button', { name: /quitar/i })).toHaveLength(1)
})

it('con la visita cerrada no ofrece cerrarla de nuevo', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /cerrar visita/i })).not.toBeInTheDocument()
})

it('con la visita abierta ofrece cerrarla', async () => {
    const { onCerrarVisita } = renderSheet()
    await screen.findByText('Amortiguadores')
    fireEvent.click(screen.getByRole('button', { name: /cerrar visita/i }))
    expect(onCerrarVisita).toHaveBeenCalled()
})
```

- [ ] **Step 3: Correr los tests para verificar que fallan**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Esperado: FAIL — no existe el componente.

- [ ] **Step 4: Implementar `VisitaSheet`**

Crear `src/components/VisitaSheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import RubroCard from './propuesta/RubroCard'
import ResolucionRubro from './propuesta/ResolucionRubro'
import { useMotivos } from '@/hooks/useMotivos'
import { useRubros, useResolverRubro, useEliminarRubro } from '@/hooks/useRubros'
import type { IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

interface VisitaSheetProps {
    open: boolean
    visitaId: number
    nombreCliente: string
    /** true = se entró solo a completar rubros de una visita ya cerrada. */
    visitaCerrada: boolean
    onCerrarVisita: () => void
    onClose: () => void
    cerrando?: boolean
}

export default function VisitaSheet({
    open,
    visitaId,
    nombreCliente,
    visitaCerrada,
    onCerrarVisita,
    onClose,
    cerrando,
}: VisitaSheetProps) {
    const { data: rubros = [] } = useRubros(open ? visitaId : null)
    const { data: motivos = [] } = useMotivos('rubro')
    const resolver = useResolverRubro(visitaId)
    const eliminar = useEliminarRubro(visitaId)

    const [activo, setActivo] = useState<IVisitaRubro | null>(null)
    const [borrador, setBorrador] = useState<IRubroMotivo[]>([])
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) {
            setActivo(null)
            setBorrador([])
            setError(null)
        }
    }, [open])

    function abrirRubro(rubro: IVisitaRubro) {
        setActivo(rubro)
        setBorrador(rubro.motivos)
        setError(null)
    }

    async function guardar() {
        if (!activo) return
        setError(null)
        try {
            await resolver.mutateAsync({ rubroId: activo.id, motivos: borrador })
            setActivo(null)
        } catch {
            // Deliberadamente NO se cierra la vista ni se limpia el borrador: el vendedor
            // pudo haber tipeado marca/competidor/% y perder eso por un bache de señal lo
            // entrena a no volver a cargarlo.
            setError('Sin conexión. Volvé a intentar; no se perdió lo que cargaste.')
        }
    }

    const pendientes = rubros.filter(r => !r.resuelto).length

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={nombreCliente}
            eyebrow="Propuesta comercial"
        >
            {activo ? (
                <div>
                    <ResolucionRubro
                        rubro={activo}
                        motivos={motivos}
                        value={borrador}
                        onChange={setBorrador}
                        onGuardar={guardar}
                        onBack={() => setActivo(null)}
                        guardando={resolver.isPending}
                    />
                    {error && (
                        <p className="mt-2 text-[12.5px] font-semibold text-dsred">{error}</p>
                    )}
                </div>
            ) : (
                <div>
                    <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                        Cargá el resultado de cada rubro que ofreciste. Los que no ofreciste se
                        resuelven con <b className="font-bold text-[#182645]">“No lo ofrecí”</b>.
                    </p>

                    <div className="flex flex-col gap-2.5">
                        {rubros.map(r => (
                            <div key={r.id} className="flex items-start gap-1.5">
                                <div className="min-w-0 flex-1">
                                    <RubroCard
                                        nombre={r.rubroDescripcion}
                                        motivosCargados={r.motivos.length}
                                        onResolucion={() => abrirRubro(r)}
                                    />
                                </div>
                                {/* Los de la propuesta NO se borran (RUBRO_DE_PROPUESTA):
                                    si no se ofreció, se resuelve con "No lo ofrecí". */}
                                {!r.esPropuesto && (
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        aria-label={`Quitar ${r.rubroDescripcion}`}
                                        onClick={() => eliminar.mutate(r.id)}
                                        className="mt-1 h-9 w-9 shrink-0 border-[#E1E6F0] text-dsmuted"
                                    >
                                        <Trash2 className="h-[15px] w-[15px]" strokeWidth={2} />
                                    </Button>
                                )}
                            </div>
                        ))}
                        {rubros.length === 0 && (
                            <div className="text-sm text-dsmuted">
                                Esta visita no tiene rubros propuestos.
                            </div>
                        )}
                    </div>

                    {!visitaCerrada && (
                        <Button
                            onClick={onCerrarVisita}
                            disabled={cerrando}
                            className="mt-3.5 h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
                        >
                            {cerrando ? 'Cerrando…' : 'Cerrar visita'}
                        </Button>
                    )}

                    {pendientes > 0 && (
                        <p className="mt-2 text-center text-[12px] font-semibold text-[#B45309]">
                            {pendientes} {pendientes === 1 ? 'rubro' : 'rubros'} sin cargar. Podés
                            cerrar la visita y completarlos después, pero la semana no cierra
                            hasta que estén.
                        </p>
                    )}
                </div>
            )}
        </BottomSheet>
    )
}
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Esperado: PASS, 8 tests.

- [ ] **Step 6: Escribir los tests de `VisitaFlow`**

Crear `src/components/VisitaFlow.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import VisitaFlow from './VisitaFlow'
import * as api from '@/api/planificacion'
import * as geo from '@/lib/geolocation'
import type { IAgendaClient } from '@/types/planificacion'

vi.mock('@/api/planificacion')
vi.mock('@/lib/geolocation')

const cliente: IAgendaClient = {
    codigoCliente: 'C1',
    codigoParticularCliente: '10034',
    nombreCliente: 'ALMACEN DON JOSE',
    cicloClienteId: 42,
    dia: 1,
    estado: 'pendiente',
    visitaId: null,
    rubrosPendientes: 0,
}

function renderFlow(over: Record<string, unknown> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onGeoBloqueada = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <VisitaFlow cliente={cliente} onClose={() => {}} onGeoBloqueada={onGeoBloqueada} {...over} />
        </QueryClientProvider>,
    )
    return { onGeoBloqueada }
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getPropuesta as any).mockResolvedValue({ clients: [{ rubros: [] }] })
    ;(api.getRubros as any).mockResolvedValue([])
    ;(api.getMotivos as any).mockResolvedValue([])
    ;(api.iniciarVisita as any).mockResolvedValue({ visitaId: 99, rubros: 3 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true, coord: '-34.6,-58.4', precisionM: 10,
    })
})

it('iniciar visita captura la ubicación y manda el cicloClienteId', async () => {
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith({
            cicloClienteId: 42,
            coordInicio: '-34.6,-58.4',
        }),
    )
})

it('con el permiso denegado NO inicia la visita', async () => {
    // La geolocalización bloquea: el dato existe para verificar la presencia, así que
    // su captura no puede quedar a criterio del verificado.
    ;(geo.capturarUbicacion as any).mockResolvedValue({ ok: false, motivo: 'denegado' })
    const { onGeoBloqueada } = renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() => expect(onGeoBloqueada).toHaveBeenCalledWith('denegado'))
    expect(api.iniciarVisita).not.toHaveBeenCalled()
})

it('sin señal tampoco inicia', async () => {
    ;(geo.capturarUbicacion as any).mockResolvedValue({ ok: false, motivo: 'sin_senal' })
    const { onGeoBloqueada } = renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() => expect(onGeoBloqueada).toHaveBeenCalledWith('sin_senal'))
    expect(api.iniciarVisita).not.toHaveBeenCalled()
})

it('tras iniciar pasa a los rubros congelados', async () => {
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() => expect(api.getRubros).toHaveBeenCalledWith(99))
})

it('un cliente con visita en curso entra directo a los rubros', async () => {
    renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    await waitFor(() => expect(api.getRubros).toHaveBeenCalledWith(55))
    expect(api.getPropuesta).not.toHaveBeenCalled()
})

it('cerrar visita también exige ubicación', async () => {
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, rubrosPendientes: 0 })
    renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() =>
        expect(api.cerrarVisita).toHaveBeenCalledWith(55, { coordFinal: '-34.6,-58.4' }),
    )
})

it('cerrar visita con la ubicación bloqueada no cierra', async () => {
    ;(geo.capturarUbicacion as any).mockResolvedValue({ ok: false, motivo: 'sin_senal' })
    const { onGeoBloqueada } = renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() => expect(onGeoBloqueada).toHaveBeenCalledWith('sin_senal'))
    expect(api.cerrarVisita).not.toHaveBeenCalled()
})
```

- [ ] **Step 7: Correr los tests para verificar que fallan**

Run: `npx vitest run src/components/VisitaFlow.test.tsx`
Esperado: FAIL — no existe el componente.

- [ ] **Step 8: Implementar `VisitaFlow`**

Crear `src/components/VisitaFlow.tsx`:

```tsx
import { useState } from 'react'
import PropuestaSheet from './PropuestaSheet'
import VisitaSheet from './VisitaSheet'
import { useCerrarVisita, useIniciarVisita } from '@/hooks/useVisitas'
import { capturarUbicacion, type GeoResult } from '@/lib/geolocation'
import { errorCode } from '@/lib/apiError'
import type { IAgendaClient } from '@/types/planificacion'

interface VisitaFlowProps {
    /** null = no hay flujo abierto. */
    cliente: IAgendaClient | null
    onClose: () => void
    onGeoBloqueada: (motivo: Exclude<GeoResult, { ok: true }>['motivo']) => void
    onAviso?: (mensaje: string) => void
}

/**
 * El flujo completo de una visita: propuesta → iniciar → rubros → cerrar.
 *
 * Vive fuera de AgendaSemanaPage para que la página quede como shell: acá se concentra
 * todo el estado de la visita en curso.
 */
export default function VisitaFlow({
    cliente,
    onClose,
    onGeoBloqueada,
    onAviso,
}: VisitaFlowProps) {
    const iniciar = useIniciarVisita()
    const cerrar = useCerrarVisita()

    // Se captura del response de iniciarVisita en vez de releerlo de useVisitaActiva:
    // esa query solo refresca porque la mutación la invalida, y si ESE refetch fallara
    // (bache de red, 401 transitorio) el id quedaría null sobre una visita que el
    // servidor sí creó.
    const [visitaIniciadaId, setVisitaIniciadaId] = useState<number | null>(null)

    if (!cliente) return null

    // Un cliente con visita ya abierta (o cerrada con rubros pendientes) entra derecho
    // a los rubros: la propuesta pre-visita ya no aplica, manda el snapshot.
    const visitaId = visitaIniciadaId ?? cliente.visitaId
    const enRubros = visitaId !== null && cliente.estado !== 'pendiente'
    const mostrarRubros = visitaIniciadaId !== null || enRubros

    async function conUbicacion(accion: (coord: string) => Promise<void>) {
        const geo = await capturarUbicacion()
        if (!geo.ok) {
            onGeoBloqueada(geo.motivo)
            return
        }
        await accion(geo.coord)
    }

    async function onIniciar() {
        await conUbicacion(async coord => {
            try {
                const { visitaId: id } = await iniciar.mutateAsync({
                    cicloClienteId: cliente!.cicloClienteId,
                    coordInicio: coord,
                })
                setVisitaIniciadaId(id)
            } catch (err) {
                const code = errorCode(err)
                if (code === 'VISITA_ACTIVA_EXISTENTE' || code === 'CICLO_CLIENTE_YA_RESUELTO') {
                    // La agenda estaba vieja. La invalidación del hook ya disparó el
                    // refetch; cerrar el flujo evita que siga operando sobre datos rancios.
                    onAviso?.('Este cliente ya fue resuelto. Actualizamos tu agenda.')
                    cerrarFlujo()
                    return
                }
                onAviso?.('No se pudo iniciar la visita. Volvé a intentar.')
            }
        })
    }

    async function onCerrarVisita() {
        if (visitaId === null) return
        await conUbicacion(async coord => {
            try {
                const res = await cerrar.mutateAsync({ visitaId, coordFinal: coord })
                if (res.rubrosPendientes > 0) {
                    onAviso?.(
                        `Visita cerrada. Te quedan ${res.rubrosPendientes} rubros por cargar.`,
                    )
                }
                cerrarFlujo()
            } catch (err) {
                if (errorCode(err) === 'VISITA_YA_CERRADA') {
                    // Tratar como éxito: la visita está cerrada, que es lo que se quería.
                    cerrarFlujo()
                    return
                }
                onAviso?.('No se pudo cerrar la visita. Volvé a intentar.')
            }
        })
    }

    function cerrarFlujo() {
        setVisitaIniciadaId(null)
        onClose()
    }

    const nombre = cliente.nombreFantasia || cliente.nombreCliente

    return (
        <>
            <PropuestaSheet
                open={!mostrarRubros}
                codigoCliente={cliente.codigoParticularCliente}
                nombreCliente={nombre}
                iniciando={iniciar.isPending}
                onIniciarVisita={onIniciar}
                onClose={cerrarFlujo}
            />
            {visitaId !== null && (
                <VisitaSheet
                    open={mostrarRubros}
                    visitaId={visitaId}
                    nombreCliente={nombre}
                    visitaCerrada={cliente.estado === 'visitada'}
                    cerrando={cerrar.isPending}
                    onCerrarVisita={onCerrarVisita}
                    onClose={cerrarFlujo}
                />
            )}
        </>
    )
}
```

Agregar la prop `iniciando?: boolean` a `PropuestaSheet` y usarla para deshabilitar el botón "Iniciar visita" mientras corre.

- [ ] **Step 9: Correr los tests para verificar que pasan**

Run: `npx vitest run src/components/VisitaFlow.test.tsx`
Esperado: PASS, 7 tests.

- [ ] **Step 10: Commit**

```bash
git add src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx src/components/VisitaFlow.tsx src/components/VisitaFlow.test.tsx src/components/PropuestaSheet.tsx src/components/PropuestaSheet.test.tsx
git commit -m "feat(visita): flujo de visita sobre la propuesta congelada"
```

---

### Task 8: Cerrar la semana

**Files:**
- Create: `src/components/CerrarSemanaSheet.tsx`, `src/components/CerrarSemanaSheet.test.tsx`
- Modify: `src/components/AccountMenu.tsx`

**Interfaces:**
- Consumes: `useCerrarCiclo` (Task 4), `ICerrarCicloResult`.
- Produces: `<CerrarSemanaSheet open onClose onCerrado />`; `AccountMenu` gana `onCerrarSemana?: () => void`.

- [ ] **Step 1: Escribir los tests**

Crear `src/components/CerrarSemanaSheet.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import CerrarSemanaSheet from './CerrarSemanaSheet'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function renderSheet(onCerrado = vi.fn()) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <QueryClientProvider client={qc}>
            <CerrarSemanaSheet open onClose={() => {}} onCerrado={onCerrado} />
        </QueryClientProvider>,
    )
    return { onCerrado }
}

beforeEach(() => vi.clearAllMocks())

it('cierra la semana cuando no queda nada pendiente', async () => {
    ;(api.cerrarCiclo as any).mockResolvedValue({
        cerrado: true, clientesPendientes: [], visitasConRubrosPendientes: [],
    })
    const { onCerrado } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /cerrar semana/i }))
    await waitFor(() => expect(onCerrado).toHaveBeenCalled())
})

it('lee las dos listas del 409, que vienen en data pese al ok:0', async () => {
    // Es el ÚNICO endpoint con esta forma irregular: ok:0 con payload en `data`,
    // no un error con `code`.
    ;(api.cerrarCiclo as any).mockRejectedValue({
        response: {
            status: 409,
            data: {
                ok: 0,
                data: {
                    cerrado: false,
                    clientesPendientes: ['10034', '10099'],
                    visitasConRubrosPendientes: [
                        { visitaId: 7, codigoParticularCliente: '10100', rubros: 2 },
                    ],
                },
            },
        },
    })
    const { onCerrado } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /cerrar semana/i }))

    expect(await screen.findByText(/2 clientes sin resolver/i)).toBeInTheDocument()
    expect(screen.getByText(/1 visita con rubros sin cargar/i)).toBeInTheDocument()
    expect(onCerrado).not.toHaveBeenCalled()
})

it('un error de red no se confunde con pendientes', async () => {
    ;(api.cerrarCiclo as any).mockRejectedValue(new Error('Network Error'))
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /cerrar semana/i }))
    expect(await screen.findByText(/no se pudo/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/components/CerrarSemanaSheet.test.tsx`
Esperado: FAIL — no existe el componente.

- [ ] **Step 3: Implementar**

Crear `src/components/CerrarSemanaSheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import { useCerrarCiclo } from '@/hooks/useCiclo'
import type { ICerrarCicloResult } from '@/types/planificacion'

interface CerrarSemanaSheetProps {
    open: boolean
    onClose: () => void
    onCerrado: () => void
}

/** El 409 de /ciclo/cerrar es el ÚNICO con forma irregular: ok:0 pero con `data`
 *  (las dos listas de bloqueo), no con `code`. */
function bloqueosDe(err: unknown): ICerrarCicloResult | null {
    const e = err as { response?: { status?: number; data?: { data?: ICerrarCicloResult } } }
    if (e?.response?.status !== 409) return null
    return e.response.data?.data ?? null
}

export default function CerrarSemanaSheet({ open, onClose, onCerrado }: CerrarSemanaSheetProps) {
    const cerrar = useCerrarCiclo()
    const [bloqueos, setBloqueos] = useState<ICerrarCicloResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) {
            setBloqueos(null)
            setError(null)
        }
    }, [open])

    async function onConfirmar() {
        setBloqueos(null)
        setError(null)
        try {
            await cerrar.mutateAsync()
            onCerrado()
        } catch (err) {
            const pendientes = bloqueosDe(err)
            if (pendientes) {
                setBloqueos(pendientes)
                return
            }
            setError('No se pudo cerrar la semana. Volvé a intentar.')
        }
    }

    const clientes = bloqueos?.clientesPendientes ?? []
    const visitas = bloqueos?.visitasConRubrosPendientes ?? []

    return (
        <BottomSheet open={open} onClose={onClose} title="Cerrar semana" eyebrow="Vuelta actual">
            <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                Al cerrar la semana se registra la vuelta completa. No se puede reabrir.
            </p>

            {clientes.length > 0 && (
                <div className="mb-2.5 rounded-[11px] border-[1.5px] border-[#F3C9C9] bg-[#FEF6F6] p-3">
                    <p className="text-[13px] font-extrabold text-dsred">
                        {clientes.length}{' '}
                        {clientes.length === 1 ? 'cliente sin resolver' : 'clientes sin resolver'}
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-[#54607A]">
                        Visitalos o marcalos como “No visité” antes de cerrar.
                    </p>
                </div>
            )}

            {visitas.length > 0 && (
                <div className="mb-2.5 rounded-[11px] border-[1.5px] border-[#F0D8A8] bg-[#FEF8EC] p-3">
                    <p className="text-[13px] font-extrabold text-[#B45309]">
                        {visitas.length}{' '}
                        {visitas.length === 1
                            ? 'visita con rubros sin cargar'
                            : 'visitas con rubros sin cargar'}
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-[#54607A]">
                        Entrá a cada una desde su tarjeta y completá la resolución.
                    </p>
                </div>
            )}

            {error && <p className="mb-2.5 text-[12.5px] font-semibold text-dsred">{error}</p>}

            <Button
                onClick={onConfirmar}
                disabled={cerrar.isPending}
                className="mt-1 h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
            >
                {cerrar.isPending ? 'Cerrando…' : 'Cerrar semana'}
            </Button>
        </BottomSheet>
    )
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/components/CerrarSemanaSheet.test.tsx`
Esperado: PASS, 3 tests.

- [ ] **Step 5: Agregar la entrada en `AccountMenu`**

Agregar `onCerrarSemana?: () => void` a `AccountMenuProps` y, dentro del menú desplegable, un ítem "Cerrar semana" **arriba** de "Cerrar sesión" (solo si viene el handler), con el mismo estilo de ítem que ya usa el logout y un separador entre ambos. Es una acción de una vez por semana: por eso vive acá y no ocupa alto permanente en la pantalla de trabajo.

- [ ] **Step 6: Commit**

```bash
git add src/components/CerrarSemanaSheet.tsx src/components/CerrarSemanaSheet.test.tsx src/components/AccountMenu.tsx
git commit -m "feat(ciclo): cierre de semana con las dos listas de bloqueo"
```

---

### Task 9: El shell y la máquina de modos

La última: ata todo. **Requiere `GET /ciclo/preview` desplegado** (Task 2 del plan del backend).

**Files:**
- Create: `src/components/CicloVacio.tsx`
- Modify: `src/components/AppHeader.tsx` (+ `.test.tsx`)
- Modify: `src/pages/AgendaSemanaPage.tsx`
- Modify: `src/pages/AgendaSemanaPage.test.tsx`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la pantalla completa.

- [ ] **Step 1: Escribir los tests de la página**

Reemplazar `src/pages/AgendaSemanaPage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import AgendaSemanaPage from './AgendaSemanaPage'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Martín Rossi' }, logout: vi.fn() }),
}))

const cicloAbierto = {
    id: 1, codigoParticularVendedor: 'V 2', semana: 3,
    fechaApertura: '2026-07-27T10:00:00Z', fechaCierre: null, estado: 'abierta' as const,
}

const semanaVacia = { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] }

function renderPage() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <QueryClientProvider client={qc}>
            <AgendaSemanaPage />
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getMotivos as any).mockResolvedValue([])
    ;(api.getVisitaActiva as any).mockResolvedValue(null)
    ;(api.getAgendaSemana as any).mockResolvedValue(semanaVacia)
    ;(api.getCicloPreview as any).mockResolvedValue({
        semana: 3, clientes: 39, omitidos: [], dias: semanaVacia,
    })
})

it('sin vuelta abierta NO pide la agenda y ofrece abrir', async () => {
    // Ramificar sobre cicloActual === null (un dato) en vez de sobre el 409 de la agenda.
    ;(api.getCicloActual as any).mockResolvedValue(null)
    renderPage()

    expect(await screen.findByRole('button', { name: /abrir semana/i })).toBeInTheDocument()
    expect(api.getAgendaSemana).not.toHaveBeenCalled()
})

it('sin vuelta abierta muestra la semana propuesta por el backend', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(null)
    renderPage()
    expect(await screen.findByText(/semana 3/i)).toBeInTheDocument()
    expect(api.getCicloPreview).toHaveBeenCalledWith(undefined)
})

it('las flechas navegan las semanas de la rotación', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(null)
    renderPage()
    await screen.findByText(/semana 3/i)
    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))
    await waitFor(() => expect(api.getCicloPreview).toHaveBeenCalledWith(4))
})

it('las flechas hacen wrap de 5 a 1', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(null)
    ;(api.getCicloPreview as any).mockResolvedValue({
        semana: 5, clientes: 47, omitidos: [], dias: semanaVacia,
    })
    renderPage()
    await screen.findByText(/semana 5/i)
    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))
    await waitFor(() => expect(api.getCicloPreview).toHaveBeenCalledWith(1))
})

it('abrir la semana usa la que se está viendo', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(null)
    ;(api.abrirCiclo as any).mockResolvedValue({
        cicloId: 1, semana: 3, clientes: 39, omitidos: [],
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /abrir semana/i }))
    await waitFor(() => expect(api.abrirCiclo).toHaveBeenCalledWith(3))
})

it('con vuelta abierta muestra la agenda operable, sin preview', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    renderPage()
    await waitFor(() => expect(api.getAgendaSemana).toHaveBeenCalled())
    expect(api.getCicloPreview).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /abrir semana/i })).not.toBeInTheDocument()
})

it('con vuelta abierta se puede espiar otra semana en solo lectura', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    renderPage()
    await waitFor(() => expect(api.getAgendaSemana).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))

    await waitFor(() => expect(api.getCicloPreview).toHaveBeenCalledWith(4))
    expect(await screen.findByText(/vista previa/i)).toBeInTheDocument()
})

it('un usuario sin código de vendedor recibe un mensaje de cuenta, no "reintentá"', async () => {
    // No es reintentable: es configuración del usuario. Un "volvé a intentar" lo dejaría
    // tocando el botón contra algo que nunca va a andar.
    ;(api.getCicloActual as any).mockResolvedValue(null)
    ;(api.abrirCiclo as any).mockRejectedValue({
        response: { status: 400, data: { ok: 0, code: 'SELLER_CODE_UNRESOLVED' } },
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /abrir semana/i }))
    expect(await screen.findByText(/avisá a sistemas/i)).toBeInTheDocument()
})

it('volver a la semana abierta devuelve el modo operable', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    renderPage()
    await waitFor(() => expect(api.getAgendaSemana).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))
    await screen.findByText(/vista previa/i)
    fireEvent.click(screen.getByRole('button', { name: /semana anterior/i }))

    await waitFor(() => expect(screen.queryByText(/vista previa/i)).not.toBeInTheDocument())
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/pages/AgendaSemanaPage.test.tsx`
Esperado: FAIL.

- [ ] **Step 3: Crear `CicloVacio`**

Crear `src/components/CicloVacio.tsx`:

```tsx
import { CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CicloVacioProps {
    semana: number
    clientes: number
    omitidos: string[]
    abriendo?: boolean
    onAbrir: () => void
}

/**
 * Estado sin vuelta abierta. Los clientes ya se ven en el board de atrás (en preview):
 * este bloque es la decisión, no la lista.
 *
 * `omitidos` se muestra ACÁ y no después de abrir a propósito: abrir congela el plan y
 * no hay forma de descartarlo desde la app, así que enterarse de los faltantes tiene que
 * pasar antes de la única acción irreversible del flujo.
 */
export default function CicloVacio({
    semana,
    clientes,
    omitidos,
    abriendo,
    onAbrir,
}: CicloVacioProps) {
    return (
        <div className="shrink-0 border-t border-dsline bg-white px-4 py-3">
            <p className="text-[13px] font-semibold text-[#182645]">
                No tenés una semana abierta. Al abrirla se congela el plan de visitas.
            </p>
            {omitidos.length > 0 && (
                <p className="mt-1 text-[12px] font-semibold text-[#B45309]">
                    {omitidos.length}{' '}
                    {omitidos.length === 1
                        ? 'cliente asignado no existe en el padrón y no va a entrar'
                        : 'clientes asignados no existen en el padrón y no van a entrar'}
                    .
                </p>
            )}
            <Button
                onClick={onAbrir}
                disabled={abriendo || clientes === 0}
                className="mt-2.5 h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
            >
                <CalendarPlus className="h-[15px] w-[15px]" strokeWidth={2.2} />
                {abriendo ? 'Abriendo…' : `Abrir semana ${semana} · ${clientes} clientes`}
            </Button>
        </div>
    )
}
```

- [ ] **Step 4: Adaptar `AppHeader`**

Cambiar la interfaz y el bloque de la semana:

```tsx
interface AppHeaderProps {
    vendedorNombre: string
    completadas: number
    total: number
    /** Texto central: "Semana 3 · 13 – 17 Jul" o similar. */
    tituloSemana: string
    /** 'preview' = hojeando una semana que no es la abierta. */
    modo?: 'operable' | 'preview'
    onLogout?: () => void
    onCerrarSemana?: () => void
    onPrevWeek?: () => void
    onNextWeek?: () => void
}
```

En el render, tres cambios sobre el bloque de la semana (el header de marca y el avatar no cambian):

```tsx
const preview = modo === 'preview'

// Las flechas ya no son decorativas: son el navegador de ciclos. aria-label porque los
// tests (y el lector de pantalla) las identifican por nombre accesible, no por el ícono.
<div className="mt-2.5 flex items-center justify-between gap-2">
    <Button
        variant="ghost"
        size="icon"
        aria-label="Semana anterior"
        onClick={onPrevWeek}
        className="h-7 w-7 shrink-0 text-white/70 hover:bg-white/10 hover:text-white"
    >
        <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.4} />
    </Button>
    <div className="min-w-0 text-center">
        <div className="truncate text-[13.5px] font-extrabold">{tituloSemana}</div>
        {preview ? (
            <span className="mt-0.5 inline-block rounded-full bg-white/15 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-white/80">
                Vista previa
            </span>
        ) : (
            <div className="text-[10.5px] font-semibold text-white/60">Clientes a visitar</div>
        )}
    </div>
    <Button
        variant="ghost"
        size="icon"
        aria-label="Semana siguiente"
        onClick={onNextWeek}
        className="h-7 w-7 shrink-0 text-white/70 hover:bg-white/10 hover:text-white"
    >
        <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.4} />
    </Button>
</div>

{/* Sin barra de progreso en preview: no hay progreso de una semana que no se trabaja,
    y mostrar 0/39 se leería como "no hiciste nada" en vez de "no es tu semana". */}
{!preview && (
    /* ...bloque existente de "Visitas completadas" + barra, con `pct`... */
)}
```

Y `onCerrarSemana` se reenvía a `AccountMenu`:

```tsx
<AccountMenu nombre={vendedorNombre} onLogout={onLogout ?? (() => {})} onCerrarSemana={onCerrarSemana} />
```

Actualizar `AppHeader.test.tsx`: `rangoSemana` → `tituloSemana`, más dos tests:

```tsx
it('en preview muestra el chip y esconde el progreso', () => {
    render(<AppHeader vendedorNombre="Martín" completadas={0} total={39} tituloSemana="Semana 4" modo="preview" />)
    expect(screen.getByText(/vista previa/i)).toBeInTheDocument()
    expect(screen.queryByText(/completadas/i)).not.toBeInTheDocument()
})

it('en modo operable muestra el progreso y no el chip', () => {
    render(<AppHeader vendedorNombre="Martín" completadas={3} total={40} tituloSemana="Semana 3" />)
    expect(screen.queryByText(/vista previa/i)).not.toBeInTheDocument()
    expect(screen.getByText('3 / 40')).toBeInTheDocument()
})
```

- [ ] **Step 5: Reescribir la página**

Reemplazar `src/pages/AgendaSemanaPage.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import AppHeader from '@/components/AppHeader'
import DiaTabs from '@/components/DiaTabs'
import AgendaBoard from '@/components/AgendaBoard'
import CicloVacio from '@/components/CicloVacio'
import VisitaFlow from '@/components/VisitaFlow'
import ResolucionSheet from '@/components/ResolucionSheet'
import ReagendarSheet from '@/components/ReagendarSheet'
import CerrarSemanaSheet from '@/components/CerrarSemanaSheet'
import { useAgendaSemana } from '@/hooks/useAgenda'
import { useCicloActual, useCicloPreview, useAbrirCiclo, useReagendar } from '@/hooks/useCiclo'
import { useMotivos } from '@/hooks/useMotivos'
import { useNoVisita } from '@/hooks/useVisitas'
import { useToast } from '@/hooks/useToast'
import { Toast } from '@/components/ui/toast'
import { estaResuelto } from '@/lib/estadoCiclo'
import { errorCode } from '@/lib/apiError'
import { getWeekRangeLabel } from '@/lib/weekDates'
import type { Dia, IAgendaClient, SemanaAgenda } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']
const SEMANAS = 5

const MENSAJE_GEO = {
    denegado:
        'Necesitamos tu ubicación para registrar la visita. Activá el permiso de ubicación y volvé a intentar.',
    sin_senal:
        'No pudimos tomar tu ubicación. Salí a un lugar con señal y volvé a intentar.',
    no_soportado:
        'Este dispositivo no puede tomar la ubicación. Avisá a sistemas.',
} as const

/**
 * Problema de configuración de la cuenta, no algo que el vendedor pueda resolver
 * reintentando: su usuario no tiene un código de vendedor resoluble. Merece un mensaje
 * distinto para que no siga tocando el botón.
 */
function mensajeDeCuenta(code: string | null): string | null {
    if (code === 'SELLER_CODE_UNRESOLVED')
        return 'Tu usuario no tiene un código de vendedor asignado. Avisá a sistemas.'
    if (code === 'SELLER_CODE_AMBIGUOUS')
        return 'Tu usuario tiene más de un código de vendedor. Avisá a sistemas.'
    return null
}

export default function AgendaSemanaPage() {
    const { user, logout } = useAuth()
    const { data: ciclo } = useCicloActual()
    const abrir = useAbrirCiclo()
    const reagendar = useReagendar()
    const noVisita = useNoVisita()
    const { data: motivosVisita = [] } = useMotivos('visita')
    const { message: toastMessage, showToast } = useToast()

    // La semana que se está MIRANDO. null hasta que se sepa cuál: con vuelta abierta es
    // la suya; sin vuelta, la que proponga el preview.
    const [semanaVista, setSemanaVista] = useState<number | null>(null)
    const semanaEfectiva = semanaVista ?? ciclo?.semana ?? null
    const operable = ciclo != null && semanaEfectiva === ciclo.semana

    const { data: agenda } = useAgendaSemana(operable)
    const { data: preview } = useCicloPreview(
        semanaEfectiva ?? undefined,
        ciclo !== undefined && !operable,
    )

    const [diaActivo, setDiaActivo] = useState<Dia>('LUN')
    const [visitaCliente, setVisitaCliente] = useState<IAgendaClient | null>(null)
    const [noVisitaCliente, setNoVisitaCliente] = useState<IAgendaClient | null>(null)
    const [reagendarCliente, setReagendarCliente] = useState<IAgendaClient | null>(null)
    const [cerrandoSemana, setCerrandoSemana] = useState(false)

    // Las cards del preview no tienen cicloClienteId ni estado, así que se adaptan a la
    // forma de la agenda SOLO para render. El board queda en modo preview, sin acciones,
    // de modo que estos valores de relleno nunca llegan a una mutación.
    const semana: SemanaAgenda | undefined = useMemo(() => {
        if (operable) return agenda
        if (!preview) return undefined
        const out = {} as SemanaAgenda
        for (const d of DIAS) {
            out[d] = (preview.dias[d] ?? []).map(c => ({
                ...c,
                cicloClienteId: -1,
                estado: 'pendiente' as const,
                visitaId: null,
                rubrosPendientes: 0,
            }))
        }
        return out
    }, [operable, agenda, preview])

    const counts = useMemo(() => {
        const c = {} as Record<Dia, { done: number; total: number }>
        for (const d of DIAS) {
            const clientes = semana?.[d] ?? []
            c[d] = {
                done: operable ? clientes.filter(x => estaResuelto(x.estado)).length : 0,
                total: clientes.length,
            }
        }
        return c
    }, [semana, operable])

    const totalClientes = DIAS.reduce((n, d) => n + (semana?.[d]?.length ?? 0), 0)
    const totalDone = DIAS.reduce((n, d) => n + counts[d].done, 0)

    function moverSemana(delta: number) {
        const base = semanaEfectiva ?? 1
        // Wrap 1..5: la rotación es circular, así que las flechas nunca quedan sin salida.
        setSemanaVista(((base - 1 + delta + SEMANAS) % SEMANAS) + 1)
    }

    async function onAbrirSemana() {
        try {
            const res = await abrir.mutateAsync(semanaEfectiva ?? undefined)
            setSemanaVista(res.semana)
            showToast(`Semana ${res.semana} abierta con ${res.clientes} clientes`)
        } catch (err) {
            const code = errorCode(err)
            if (code === 'CICLO_ABIERTO_EXISTENTE') {
                // Otra pestaña o un doble tap ganaron: el hook ya invalidó cicloActual.
                setSemanaVista(null)
                return
            }
            const deCuenta = mensajeDeCuenta(code)
            showToast(
                deCuenta ??
                    (code === 'CICLO_SIN_CLIENTES'
                        ? 'Esa semana ya no tiene clientes asignados.'
                        : 'No se pudo abrir la semana. Volvé a intentar.'),
            )
        }
    }

    async function onPickReagendar(dia: Dia) {
        const cliente = reagendarCliente
        setReagendarCliente(null)
        if (!cliente) return
        try {
            await reagendar.mutateAsync({
                cicloClienteId: cliente.cicloClienteId,
                dia: DIAS.indexOf(dia) + 1,
            })
            // Reagendar mueve el día y deja al cliente PENDIENTE: no lo resuelve.
            showToast('Cliente reagendado')
        } catch {
            showToast('No se pudo reagendar. Volvé a intentar.')
        }
    }

    async function onConfirmNoVisita(motivoIds: number[]) {
        const cliente = noVisitaCliente
        setNoVisitaCliente(null)
        if (!cliente) return
        try {
            await noVisita.mutateAsync({ cicloClienteId: cliente.cicloClienteId, motivoIds })
            showToast('Registrado')
        } catch (err) {
            showToast(
                errorCode(err) === 'CICLO_CLIENTE_YA_RESUELTO'
                    ? 'Este cliente ya estaba resuelto. Actualizamos tu agenda.'
                    : 'No se pudo registrar. Volvé a intentar.',
            )
        }
    }

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-[#EEF1F6]">
            <AppHeader
                vendedorNombre={user?.name ?? ''}
                completadas={totalDone}
                total={totalClientes}
                tituloSemana={
                    semanaEfectiva
                        ? `Semana ${semanaEfectiva}${operable ? ` · ${getWeekRangeLabel()}` : ''}`
                        : 'Cargando…'
                }
                modo={operable ? 'operable' : 'preview'}
                onLogout={logout}
                onCerrarSemana={operable ? () => setCerrandoSemana(true) : undefined}
                onPrevWeek={() => moverSemana(-1)}
                onNextWeek={() => moverSemana(1)}
            />
            <DiaTabs activo={diaActivo} counts={counts} onSelect={setDiaActivo} />
            <AgendaBoard
                semana={semana}
                activo={diaActivo}
                modo={operable ? 'operable' : 'preview'}
                onActivoChange={setDiaActivo}
                onAbrir={setVisitaCliente}
                onReagendar={setReagendarCliente}
                onNoVisita={setNoVisitaCliente}
                onCargarRubros={setVisitaCliente}
            />

            {ciclo === null && preview && (
                <CicloVacio
                    semana={preview.semana}
                    clientes={preview.clientes}
                    omitidos={preview.omitidos}
                    abriendo={abrir.isPending}
                    onAbrir={onAbrirSemana}
                />
            )}

            <VisitaFlow
                cliente={visitaCliente}
                onClose={() => setVisitaCliente(null)}
                onGeoBloqueada={motivo => showToast(MENSAJE_GEO[motivo])}
                onAviso={showToast}
            />
            <ResolucionSheet
                open={!!noVisitaCliente}
                motivos={motivosVisita}
                confirmLabel="Registrar"
                eyebrow="No visité"
                submitting={noVisita.isPending}
                onConfirm={onConfirmNoVisita}
                onClose={() => setNoVisitaCliente(null)}
            />
            <ReagendarSheet
                open={!!reagendarCliente}
                nombreCliente={reagendarCliente?.nombreCliente ?? ''}
                diaActual={reagendarCliente ? DIAS[reagendarCliente.dia - 1] : null}
                onPick={onPickReagendar}
                onClose={() => setReagendarCliente(null)}
            />
            <CerrarSemanaSheet
                open={cerrandoSemana}
                onClose={() => setCerrandoSemana(false)}
                onCerrado={() => {
                    setCerrandoSemana(false)
                    setSemanaVista(null)
                    showToast('Semana cerrada')
                }}
            />
            <Toast message={toastMessage} />
        </div>
    )
}
```

- [ ] **Step 6: Correr los tests para verificar que pasan**

Run: `npx vitest run src/pages/AgendaSemanaPage.test.tsx`
Esperado: PASS, 9 tests.

- [ ] **Step 7: Suite completa y typecheck**

Run: `npm test`
Esperado: PASS.

Run: `npx tsc -b --noEmit`
Esperado: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/pages/AgendaSemanaPage.tsx src/pages/AgendaSemanaPage.test.tsx src/components/CicloVacio.tsx src/components/AppHeader.tsx src/components/AppHeader.test.tsx
git commit -m "feat(agenda): navegación de ciclos y máquina de modos operable/preview"
```

---

## Verificación final

- [ ] `npm test` — PASS
- [ ] `npx tsc -b --noEmit` — sin errores
- [ ] `npx oxlint` — sin errores nuevos
- [ ] `grep -rn "Saqué pedido\|Poco trabajo\|Estoy completo\|seguimiento" src/ --include=*.tsx --include=*.ts | grep -v test` — **sin resultados**: ni motivos hardcodeados ni restos de Cromo
- [ ] `grep -rn "\.visit\b\|resuelto\?" src/ --include=*.tsx --include=*.ts | grep -v test` — sin restos del contrato viejo
- [ ] Con el backend levantado: sin vuelta abierta se navegan las 5 semanas y se ve la lista de clientes de cada una
- [ ] Abrir una semana pasa a modo operable; las flechas dejan espiar las otras con el chip "Vista previa"
- [ ] Negar el permiso de ubicación **impide** iniciar y cerrar una visita
- [ ] Cerrar una visita con rubros pendientes deja el badge en la card, y desde ahí se completan
- [ ] Cerrar la semana con pendientes muestra las dos listas
