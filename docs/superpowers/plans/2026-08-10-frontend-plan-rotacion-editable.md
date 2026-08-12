# Frontend: consumir el plan de rotación editable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar `app-planificacion` para consumir el nuevo contrato de `api-vendedores` (dominio
`planificacion` reescrito sobre "rotación editable" en vez de "ciclo congelado"), y eliminar toda
la UI de abrir/cerrar semana manual a favor de apertura implícita + sincronización automática.

**Architecture:** El backend (branch `MatiasH11/plan-rotacion-editable` de `api-vendedores`,
commit `6c6baf6`, ya mergeado y probado — 562/562 tests) expone: `rotacionClienteId` en vez de
`cicloClienteId`; `GET /planificacion/ciclo/actual` con `{ciclo, semanas?, semanasPendientes?}`
donde `semanas`/`semanasPendientes` aparecen si el vendedor tiene una ROTACIÓN abierta
(independiente de si el ciclo/semana está abierto); `GET /planificacion/rotacion/semana/:semana`
de solo lectura para ver cualquier semana de la rotación sin abrirla; `PATCH
/planificacion/rotacion-cliente/:id/reacomodar` con `{semana?, dia}` (reemplaza `reagendar`);
`POST /planificacion/ciclo/sincronizar` (idempotente, se llama al montar/enfocar la app); y
apertura implícita: `iniciarVisita`/`noVisita` abren la rotación/ciclo solos, y devuelven 409
`CAMBIO_DE_SEMANA` con `{semanaAbierta, clientesPendientes}` si el vendedor está mirando otra
semana que la abierta — el front reintenta mandando `confirmarCambioDeSemana: true`.

Con esto, la distinción "operable vs. preview" deja de significar "se puede actuar vs. no se
puede": ahora CUALQUIER semana de la rotación es accionable (el backend abre la que haga falta),
así que las cards dejan de bloquear sus botones según el modo — ver la Decisión de diseño más
abajo.

**Tech Stack:** React 19 + TypeScript, @tanstack/react-query, Vitest + Testing Library, axios.

## Decisión de diseño de este plan (léela antes de tocar ClienteCard/AgendaBoard/AgendaSemanaPage)

El código actual bloquea "Iniciar visita"/"Reagendar"/etc. cuando `modo !== 'operable'`, porque en
el modelo viejo una card de una semana no abierta (`IPreviewClient`) no tenía un id real con el
que operar. Eso cambió: `GET /planificacion/rotacion/semana/:semana` ahora devuelve
`rotacionClienteId` real (lee el plan ya materializado), así que una card de "otra semana" tiene
exactamente lo que hace falta para mandarse a `iniciarVisita`/`noVisita`/`reacomodar` — el backend
abre la semana que corresponda solo (`asegurar`), y si eso pisa una semana YA abierta distinta,
devuelve 409 `CAMBIO_DE_SEMANA` en vez de aplicar el cambio a ciegas.

Por eso este plan **elimina el bloqueo de acciones por `modo`**: las cards siempre muestran sus
botones, se pueda o no la semana que se está mirando. `modo` sigue existiendo (para el texto del
header y, opcionalmente, matices visuales), pero deja de gatear qué se puede tocar. El caso
"estabas mirando otra semana" ya no se resuelve escondiendo botones — se resuelve con el cartel de
confirmación de `CAMBIO_DE_SEMANA` (Tasks 8 y 12).

## Global Constraints

- No existe más ningún límite fijo de semanas. Prohibido escribir `SEMANAS = 5`, `% 5` o
  `<= 5` en ningún archivo nuevo o modificado — el set de semanas sale SIEMPRE de
  `semanas`/`semanasPendientes` que devuelve `GET /planificacion/ciclo/actual`.
- `rotacionClienteId` reemplaza a `cicloClienteId` en TODO el código y los tests — no debe quedar
  ningún string `cicloClienteId` vivo al terminar (la única excepción legítima es el nombre viejo
  del error `CICLO_CLIENTE_YA_RESUELTO`, que el backend NO renombró — ver Task 12).
- `'reagendada'` desaparece de `TipoResolucion` y `EstadoCicloCliente` — no existe más ese estado,
  ni como valor de tipo ni como badge visual ni como fila de tabla.
- No hay ninguna acción manual de "abrir semana" ni "cerrar semana" en la UI. Toda apertura es
  implícita (la dispara el backend al primer `iniciarVisita`/`noVisita`/`reacomodar`).
- `sincronizar` se llama una vez al montar la página y de nuevo cada vez que la pestaña/PWA
  vuelve a primer plano (evento `visibilitychange` a `'visible'`) — nunca por acción del usuario.
- Cada task termina con `npm run test -- <archivo>` en verde para lo que tocó. La task final
  corre la suite completa y `npx tsc --noEmit`.
- Seguí el estilo ya usado en el repo: comentarios solo para el POR QUÉ no obvio (mirá los
  ejemplos en los archivos que se listan abajo), no para describir qué hace el código.

---

### Task 1: Tipos — migrar `src/types/planificacion.ts` al nuevo contrato

**Files:**
- Modify: `src/types/planificacion.ts`

**Interfaces:**
- Produce: todos los tipos que consumen las tasks siguientes. Este task no tiene test propio —
  se verifica con `npx tsc --noEmit`, que a partir de acá va a listar todos los archivos que
  quedan rotos (es intencional: la lista de errores ES el mapa de qué falta tocar en las tasks
  siguientes).

- [ ] **Step 1: Reemplazar los tipos afectados**

Editá `src/types/planificacion.ts`:

1. Línea 8, `TipoResolucion` — sacar `'reagendada'`:
```ts
export type TipoResolucion = 'visita' | 'no_visita'
```

2. Línea 13, `EstadoCicloCliente` — sacar `'reagendada'`:
```ts
/** DERIVADO en el backend de la resolución del cliente — no existe como columna. */
export type EstadoCicloCliente = 'pendiente' | 'en_curso' | 'visitada' | 'no_visita'
```

3. Líneas 63-73, `IAgendaClient` — renombrar el campo y actualizar el comentario:
```ts
/** Card de la vuelta abierta O de una semana previsualizada — ver decisión de diseño en el
 *  plan de este dominio: ambas fuentes ya traen un rotacionClienteId real. Los cinco campos
 *  son requeridos a propósito: con rotacionClienteId opcional, iniciarVisita({
 *  rotacionClienteId: undefined }) compilaría. */
export interface IAgendaClient extends IVisitClientCard {
    rotacionClienteId: number
    dia: number
    estado: EstadoCicloCliente
    /** Id de la resolución si es una visita (para retomar la carga de rubros). */
    visitaId: number | null
    /** Rubros de esa visita todavía sin motivos. 0 si no hay visita. */
    rubrosPendientes: number
}
```

4. Líneas 75-88, `IPreviewClient`/`IPreviewCiclo` — agregar `rotacionClienteId` (ya lo
   manda el backend) y actualizar el comentario, que ya no aplica:
```ts
/** Card de una semana que no es necesariamente la abierta. A diferencia del modelo viejo,
 *  SÍ trae un rotacionClienteId real (GET /rotacion/semana/:semana lee el plan ya
 *  materializado) — se puede actuar sobre ella igual que sobre una de la agenda. */
export interface IPreviewClient extends IVisitClientCard {
    rotacionClienteId: number
    dia: number
}

export interface IPreviewCiclo {
    /** La semana previsualizada. */
    semana: number
    clientes: number
    omitidos: string[]
    dias: Record<Dia, IPreviewClient[]>
}
```

5. Líneas 90-104 — reemplazar `ICicloSemana`, borrar `IAbrirCicloResult`,
   `IVisitaConRubrosPendientes` y `ICerrarCicloResult` (ya no existen esos endpoints), y agregar
   `ICicloActualResult`, `ISincronizarResult` y `IReacomodarDTO`:
```ts
export interface ICicloSemana {
    id: number
    rotacionId: number
    codigoParticularVendedor: string
    semana: number
    fechaLunes: string
    fechaApertura: string
    fechaCierre: string | null
    estado: EstadoCiclo
}

/** `semanas`/`semanasPendientes` viajan siempre que el vendedor tiene una ROTACIÓN abierta,
 *  con o sin ciclo/semana abierto encima — así el front nunca tiene que asumir un tamaño fijo
 *  de rotación (hay vendedores con 4 semanas, o con un set no contiguo). Ausentes solo si el
 *  vendedor no tiene ninguna rotación materializada todavía. */
export interface ICicloActualResult {
    ciclo: ICicloSemana | null
    semanas?: number[]
    semanasPendientes?: number[]
}

export interface ISincronizarResult {
    semanaCerrada: number | null
    sinVisitar: string[]
    rubrosAutocompletados: number
    altas: string[]
    bajas: string[]
    rotacionCerrada: boolean
}

/** `semana` ausente = mover de día dentro de la semana actual de la fila. */
export interface IReacomodarDTO {
    semana?: number
    dia: number
}
```

6. Líneas 118-128, `IResolucion` — renombrar el campo:
```ts
/** La visita activa: el backend devuelve la resolución cruda. */
export interface IResolucion {
    id: number
    rotacionClienteId: number
    tipo: TipoResolucion
    fechaInicio: string
    fechaFin: string | null
    coordInicio: string | null
    coordFinal: string | null
    coordCliente: string | null
}
```

7. Líneas 249-276, los DTOs de visitas — renombrar campos y agregar
   `confirmarCambioDeSemana` (lo manda el front cuando el vendedor confirma el cartel de
   `CAMBIO_DE_SEMANA`):
```ts
export interface IIniciarVisitaDTO {
    rotacionClienteId: number
    /** Obligatoria: el backend rechaza null con COORD_REQUERIDA. */
    coordInicio: string
    /** La propuesta tal como se le mostró al vendedor. Si no viene, el backend la recalcula. */
    propuesta?: IPropuestaRubroDTO[]
    /** true = "sí, cerrá la otra semana y abrí esta" — se manda solo al reintentar después
     *  de un 409 CAMBIO_DE_SEMANA. */
    confirmarCambioDeSemana?: boolean
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
    rotacionClienteId: number
    motivoIds: number[]
    confirmarCambioDeSemana?: boolean
}

export interface INoVisitaResult {
    rotacionClienteId: number
}
```

- [ ] **Step 2: Correr el compilador para levantar el mapa de lo que falta**

Run: `npx tsc --noEmit`
Expected: una lista larga de errores en `src/api/planificacion.ts`, `src/api/planificacion.test.ts`,
`src/lib/estadoCiclo.ts`, `src/lib/estadoCiclo.test.ts`, `src/hooks/useCiclo.ts`,
`src/hooks/useCiclo.test.tsx`, `src/hooks/useVisitas.ts`, `src/hooks/useVisitas.test.tsx`,
`src/components/CerrarSemanaSheet.tsx`, `src/components/CerrarSemanaSheet.test.tsx`,
`src/components/ClienteCard.tsx`, `src/components/ClienteCard.test.tsx`,
`src/components/AgendaBoard.test.tsx`, `src/components/VisitaFlow.tsx`,
`src/components/VisitaFlow.test.tsx`, `src/pages/AgendaSemanaPage.tsx`,
`src/pages/AgendaSemanaPage.test.tsx`, `src/components/analitica/TablaActividad.tsx`,
`src/components/analitica/TablaActividad.test.tsx`, `src/api/analitica.ts`,
`src/api/analitica.test.ts`. Es el resultado esperado — las tasks siguientes los arreglan uno
por uno. NO intentes arreglarlos en este task.

- [ ] **Step 3: Commit**

```bash
git add src/types/planificacion.ts
git commit -m "feat(types): migra al contrato de rotacion editable (rotacionClienteId, sin reagendada)"
```

---

### Task 2: Cliente HTTP — reescribir `src/api/planificacion.ts`

**Files:**
- Modify: `src/api/planificacion.ts`
- Modify: `src/api/planificacion.test.ts`

**Interfaces:**
- Consumes: `ICicloActualResult`, `IPreviewCiclo`, `ISincronizarResult`, `IReacomodarDTO`,
  `IIniciarVisitaDTO`, `INoVisitaDTO`, `INoVisitaResult`, `IResolucion`, `SemanaAgenda` (Task 1).
- Produces: `getCicloActual(): Promise<ICicloActualResult>`,
  `previewSemana(semana: number): Promise<IPreviewCiclo>`,
  `sincronizar(): Promise<ISincronizarResult>`,
  `reacomodar(rotacionClienteId: number, dto: IReacomodarDTO): Promise<void>` — usados por
  Task 5 (`useCiclo.ts`).

- [ ] **Step 1: Escribir los tests que fallan para las funciones nuevas/renombradas**

Reemplazá el bloque `// ── Ciclo ──` de `src/api/planificacion.test.ts` (buscá los tests
`getCicloActual`, `getCicloPreview`, `abrirCiclo`, `cerrarCiclo`, `reagendarCicloCliente` y
reemplazalos por estos):

```ts
describe('getCicloActual', () => {
    it('devuelve el ciclo y el set de semanas', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({
            data: { data: { ciclo: null, semanas: [1, 2, 3, 4], semanasPendientes: [2, 4] } },
        })
        const res = await getCicloActual()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/ciclo/actual')
        expect(res).toEqual({ ciclo: null, semanas: [1, 2, 3, 4], semanasPendientes: [2, 4] })
    })
})

describe('previewSemana', () => {
    it('pide la semana indicada de solo lectura', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: { data: PREVIEW_MOCK } })
        const res = await previewSemana(3)
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/rotacion/semana/3')
        expect(res).toEqual(PREVIEW_MOCK)
    })
})

describe('sincronizar', () => {
    it('postea sin body', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({ data: { data: SINCRONIZAR_MOCK } })
        const res = await sincronizar()
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/ciclo/sincronizar')
        expect(res).toEqual(SINCRONIZAR_MOCK)
    })
})

describe('reacomodar', () => {
    it('usa PATCH sobre el rotacionClienteId con semana y dia', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } })
        await reacomodar(42, { semana: 3, dia: 2 })
        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/rotacion-cliente/42/reacomodar',
            { semana: 3, dia: 2 },
        )
    })

    it('sin semana solo manda dia', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } })
        await reacomodar(42, { dia: 2 })
        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/rotacion-cliente/42/reacomodar',
            { dia: 2 },
        )
    })
})
```

Agregá los fixtures `PREVIEW_MOCK`/`SINCRONIZAR_MOCK` cerca de los otros fixtures del archivo:
```ts
const PREVIEW_MOCK = {
    semana: 3,
    clientes: 2,
    omitidos: [],
    dias: { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] },
}
const SINCRONIZAR_MOCK = {
    semanaCerrada: null,
    sinVisitar: [],
    rubrosAutocompletados: 0,
    altas: [],
    bajas: [],
    rotacionCerrada: false,
}
```

Además, en los tests existentes `getVisitaActiva devuelve la resolución cruda o null`,
`iniciarVisita manda cicloClienteId, NO codigoParticularCliente` y
`registrarNoVisita manda cicloClienteId y motivoIds`, renombrá toda ocurrencia de
`cicloClienteId` a `rotacionClienteId` (nombre del test incluido: `iniciarVisita manda
rotacionClienteId, NO codigoParticularCliente`, etc.).

- [ ] **Step 2: Correr los tests nuevos y confirmar que fallan**

Run: `npx vitest run src/api/planificacion.test.ts`
Expected: FAIL — `getCicloActual`/`previewSemana`/`sincronizar`/`reacomodar` no existen todavía
en `src/api/planificacion.ts` con esas firmas.

- [ ] **Step 3: Reescribir `src/api/planificacion.ts`**

Reemplazá el bloque `// ── Ciclo ──` completo (hoy `getCicloActual`, `getCicloPreview`,
`abrirCiclo`, `cerrarCiclo`, `reagendarCicloCliente`) por:

```ts
// ── Ciclo ──────────────────────────────────────────────────────────────────────

/** La rotación/ciclo del vendedor. `semanas`/`semanasPendientes` viajan siempre que haya una
 *  rotación abierta, tenga o no ciclo/semana abierto encima ahora mismo. */
export const getCicloActual = async (): Promise<ICicloActualResult> => {
    const res = await apiClient.get('/planificacion/ciclo/actual')
    return res.data.data
}

/** El plan de UNA semana de la rotación, de solo lectura — no abre nada. */
export const previewSemana = async (semana: number): Promise<IPreviewCiclo> => {
    const res = await apiClient.get(`/planificacion/rotacion/semana/${semana}`)
    return res.data.data
}

/** Idempotente: cierra la semana vencida si la hay y sincroniza altas/bajas del padrón.
 *  Nunca abre nada — el standby se resuelve solo con la primera acción real. */
export const sincronizar = async (): Promise<ISincronizarResult> => {
    const res = await apiClient.post('/planificacion/ciclo/sincronizar')
    return res.data.data
}

/** Mueve la fila del plan a otro día (y opcionalmente otra semana de la rotación). NO la
 *  resuelve: el cliente queda pendiente en su nueva posición. Abre implícitamente la rotación
 *  si hace falta — por eso puede tirar 409 CAMBIO_DE_SEMANA igual que iniciarVisita/noVisita. */
export const reacomodar = async (
    rotacionClienteId: number,
    dto: IReacomodarDTO,
): Promise<void> => {
    await apiClient.patch(`/planificacion/rotacion-cliente/${rotacionClienteId}/reacomodar`, dto)
}
```

Actualizá el import de tipos al tope del archivo: sacá `IAbrirCicloResult`, `ICerrarCicloResult`,
`ICicloSemana` (ya no se usa directo acá) y agregá `ICicloActualResult`, `ISincronizarResult`,
`IReacomodarDTO`:
```ts
import { apiClient } from './apiClient'
import type {
    Dia,
    IAgendaClient,
    IAgregarRubroDTO,
    IAgregarRubroResult,
    ICatalogoItem,
    ICerrarVisitaDTO,
    ICerrarVisitaResult,
    ICicloActualResult,
    IIniciarVisitaDTO,
    IMotivo,
    INoVisitaDTO,
    INoVisitaResult,
    IPreviewCiclo,
    IReacomodarDTO,
    IResolucion,
    IResolverRubroDTO,
    IResolverRubroResult,
    IRubroClientsPageResponse,
    IRubroDropsResponse,
    IRubroEstado,
    ISincronizarResult,
    IVisitaRubro,
    NivelMotivo,
    SemanaAgenda,
} from '@/types/planificacion'
```

El resto del archivo (`getAgendaSemana`, `getAgendaDia`, `getMotivos`, `getVisitaActiva`,
`iniciarVisita`, `cerrarVisita`, `registrarNoVisita`, `getRubros`, `agregarRubro`,
`resolverRubro`, `eliminarRubro`, `getPropuesta`, `getRubroStatus`, `getBrandCatalog`) queda
igual — ya tipan contra los DTOs de `types/planificacion.ts`, que Task 1 ya migró.

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `npx vitest run src/api/planificacion.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/planificacion.ts src/api/planificacion.test.ts
git commit -m "feat(api): reemplaza preview/abrir/cerrar/reagendar por preview-lectura/sincronizar/reacomodar"
```

---

### Task 3: `src/lib/apiError.ts` — leer los campos extra de un error de negocio

**Files:**
- Modify: `src/lib/apiError.ts`
- Create: `src/lib/apiError.test.ts` (no existe todavía — el archivo actual no tiene test propio)

**Interfaces:**
- Produces: `errorData<T>(err: unknown): (T & { code?: string }) | null` — usado por Task 12
  (`VisitaFlow.tsx`) y Task 13 (`AgendaSemanaPage.tsx`) para leer `semanaAbierta`/
  `clientesPendientes`/`semanas` del body de un 409/422.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { errorCode, errorData } from './apiError'

function conBody(data: unknown) {
    return { response: { data } }
}

describe('errorCode', () => {
    it('lee el code de la respuesta', () => {
        expect(errorCode(conBody({ code: 'CICLO_NO_ABIERTO' }))).toBe('CICLO_NO_ABIERTO')
    })

    it('null si no hay code', () => {
        expect(errorCode(new Error('red caída'))).toBeNull()
    })
})

describe('errorData', () => {
    it('devuelve el body completo de un error de negocio', () => {
        const data = { code: 'CAMBIO_DE_SEMANA', semanaAbierta: 3, clientesPendientes: ['1', '2'] }
        expect(errorData(conBody(data))).toEqual(data)
    })

    it('null si el error no tiene response.data', () => {
        expect(errorData(new Error('red caída'))).toBeNull()
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/apiError.test.ts`
Expected: FAIL con `errorData is not a function` (no está exportada todavía).

- [ ] **Step 3: Agregar `errorData` a `src/lib/apiError.ts`**

```ts
/**
 * El código de negocio de un error de la API, o null.
 *
 * El front ramifica por `code`, no por status: un 409 significa cinco cosas distintas
 * (CICLO_NO_ABIERTO, VISITA_YA_CERRADA, RUBRO_DE_PROPUESTA, CAMBIO_DE_SEMANA…).
 * Vive en un solo lugar para no destripar err.response.data.code en cada componente.
 */
export function errorCode(err: unknown): string | null {
    const code = (err as { response?: { data?: { code?: unknown } } })?.response?.data?.code
    return typeof code === 'string' ? code : null
}

/**
 * El body completo de un error de negocio (además de `code`, trae los campos extra que
 * CustomError.details serializa: `semanaAbierta`/`clientesPendientes` en CAMBIO_DE_SEMANA,
 * `semanas` en SEMANA_FUERA_DEL_SET). null si no es un error de negocio con body.
 */
export function errorData<T extends Record<string, unknown> = Record<string, unknown>>(
    err: unknown,
): (T & { code?: string }) | null {
    const data = (err as { response?: { data?: T & { code?: string } } })?.response?.data
    return data ?? null
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/apiError.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/apiError.ts src/lib/apiError.test.ts
git commit -m "feat(lib): expone errorData para leer los campos extra de un 409/422 de negocio"
```

---

### Task 4: `src/lib/estadoCiclo.ts` — sacar `'reagendada'`

**Files:**
- Modify: `src/lib/estadoCiclo.ts`
- Modify: `src/lib/estadoCiclo.test.ts`

**Interfaces:**
- Produces: `estaResuelto(estado: EstadoCicloCliente): boolean` sin `'reagendada'` — consumida
  por `ClienteCard.tsx` (Task 10) y `AgendaBoard.tsx` (Task 11), sin cambios de firma.

- [ ] **Step 1: Actualizar el test que ya no aplica**

En `src/lib/estadoCiclo.test.ts`, el test `visitada, no_visita y reagendada cuentan como
resueltos` pasa a:
```ts
it('visitada y no_visita cuentan como resueltos', () => {
    expect(estaResuelto('visitada')).toBe(true)
    expect(estaResuelto('no_visita')).toBe(true)
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/estadoCiclo.test.ts`
Expected: FAIL — `estaResuelto('reagendada')` ya no compila / TS se queja de un valor
inexistente en `EstadoCicloCliente` si quedó alguna referencia residual, o el test de arriba
sigue pasando (`'reagendada'` en la implementación es simplemente ignorado). Si compila y pasa
sin tocar la implementación, igual seguí al Step 3: la implementación tiene que dejar de
mencionar un valor que el tipo ya no admite.

- [ ] **Step 3: Actualizar la implementación**

```ts
export function estaResuelto(estado: EstadoCicloCliente): boolean {
    return estado === 'visitada' || estado === 'no_visita'
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/estadoCiclo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/estadoCiclo.ts src/lib/estadoCiclo.test.ts
git commit -m "fix(lib): estaResuelto ya no contempla 'reagendada'"
```

---

### Task 5: `src/hooks/useCiclo.ts` — hooks de rotación (sincronizar, preview, reacomodar)

**Files:**
- Modify: `src/hooks/useCiclo.ts`
- Modify: `src/hooks/useCiclo.test.tsx`

**Interfaces:**
- Consumes: `getCicloActual`, `previewSemana`, `sincronizar`, `reacomodar` (Task 2).
- Produces: `cicloKeys.actual`, `cicloKeys.preview(semana)`, `useCicloActual()`,
  `usePreviewSemana(semana: number | undefined, enabled: boolean)`, `useSincronizar()`,
  `useReacomodar()` — consumidos por Task 13 (`AgendaSemanaPage.tsx`).

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazá `src/hooks/useCiclo.test.tsx` completo:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as api from '@/api/planificacion'
import {
    useCicloActual,
    usePreviewSemana,
    useSincronizar,
    useReacomodar,
} from './useCiclo'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useCicloActual', () => {
    it('expone ciclo y semanas', async () => {
        vi.mocked(api.getCicloActual).mockResolvedValue({
            ciclo: null,
            semanas: [1, 2, 3],
            semanasPendientes: [2],
        })
        const { result } = renderHook(() => useCicloActual(), { wrapper })
        await waitFor(() => expect(result.current.data).toBeDefined())
        expect(result.current.data).toEqual({
            ciclo: null,
            semanas: [1, 2, 3],
            semanasPendientes: [2],
        })
    })
})

describe('usePreviewSemana', () => {
    it('no consulta hasta estar habilitado', () => {
        renderHook(() => usePreviewSemana(3, false), { wrapper })
        expect(api.previewSemana).not.toHaveBeenCalled()
    })

    it('pide la semana indicada cuando está habilitado', async () => {
        vi.mocked(api.previewSemana).mockResolvedValue({
            semana: 3,
            clientes: 0,
            omitidos: [],
            dias: { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] },
        })
        renderHook(() => usePreviewSemana(3, true), { wrapper })
        await waitFor(() => expect(api.previewSemana).toHaveBeenCalledWith(3))
    })
})

describe('useSincronizar', () => {
    it('llama a sincronizar', async () => {
        vi.mocked(api.sincronizar).mockResolvedValue({
            semanaCerrada: null,
            sinVisitar: [],
            rubrosAutocompletados: 0,
            altas: [],
            bajas: [],
            rotacionCerrada: false,
        })
        const { result } = renderHook(() => useSincronizar(), { wrapper })
        await result.current.mutateAsync()
        expect(api.sincronizar).toHaveBeenCalled()
    })
})

describe('useReacomodar', () => {
    it('manda rotacionClienteId, semana y dia', async () => {
        vi.mocked(api.reacomodar).mockResolvedValue(undefined)
        const { result } = renderHook(() => useReacomodar(), { wrapper })
        await result.current.mutateAsync({ rotacionClienteId: 42, semana: 3, dia: 2 })
        expect(api.reacomodar).toHaveBeenCalledWith(42, { semana: 3, dia: 2 })
    })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/hooks/useCiclo.test.tsx`
Expected: FAIL — `usePreviewSemana`/`useSincronizar`/`useReacomodar` no existen todavía.

- [ ] **Step 3: Reescribir `src/hooks/useCiclo.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getCicloActual, previewSemana, reacomodar, sincronizar } from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import type { IReacomodarDTO } from '@/types/planificacion'

export const cicloKeys = {
    actual: ['ciclo', 'actual'] as const,
    preview: (semana: number | undefined) => ['ciclo', 'preview', semana] as const,
}

export function useCicloActual() {
    return useQuery({ queryKey: cicloKeys.actual, queryFn: getCicloActual })
}

export function usePreviewSemana(semana: number | undefined, enabled: boolean) {
    return useQuery({
        queryKey: cicloKeys.preview(semana),
        queryFn: () => previewSemana(semana as number),
        enabled: enabled && semana !== undefined,
    })
}

/** Idempotente: se llama al montar la página y al volver de background, nunca por acción del
 *  usuario. Invalida ciclo/agenda/preview porque puede haber cerrado una semana y cambiado el
 *  padrón. */
export function useSincronizar() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: sincronizar,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['ciclo', 'preview'] })
        },
    })
}

export function useReacomodar() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionClienteId: number } & IReacomodarDTO) =>
            reacomodar(args.rotacionClienteId, { semana: args.semana, dia: args.dia }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['ciclo', 'preview'] })
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
        },
    })
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/hooks/useCiclo.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCiclo.ts src/hooks/useCiclo.test.tsx
git commit -m "feat(hooks): reemplaza useAbrirCiclo/useCerrarCiclo/useCicloPreview/useReagendar por sincronizar/preview/reacomodar"
```

---

### Task 6: `src/hooks/useVisitas.ts` — renombrar y confirmar cambio de semana

**Files:**
- Modify: `src/hooks/useVisitas.ts` (no tiene cambios de lógica, solo de import — confirmá que
  compila tras Task 1)
- Modify: `src/hooks/useVisitas.test.tsx`

**Interfaces:**
- Consumes: `IIniciarVisitaDTO`, `INoVisitaDTO` con `rotacionClienteId`/`confirmarCambioDeSemana`
  (Task 1).
- Produces: sin cambios de firma — `useIniciarVisita()`, `useNoVisita()`, `useCerrarVisita()`
  siguen igual, ahora tipando contra los DTOs nuevos.

- [ ] **Step 1: Actualizar los tests**

En `src/hooks/useVisitas.test.tsx`, renombrá `cicloClienteId` a `rotacionClienteId` en los tres
lugares: el test `useIniciarVisita calls the API with rotacionClienteId/coordInicio...`
(`mutateAsync({ rotacionClienteId: 10034, coordInicio: '-34.6,-58.6' })` y su
`toHaveBeenCalledWith`), y el test `useNoVisita calls registrarNoVisita with rotacionClienteId
and motivoIds` (`mutateAsync({ rotacionClienteId: 42, motivoIds: [1, 4] })`,
`toHaveBeenCalledWith({ rotacionClienteId: 42, motivoIds: [1, 4] })`, y
`expect(out.rotacionClienteId).toBe(42)`). El test de `useCerrarVisita` no cambia.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/hooks/useVisitas.test.tsx`
Expected: FAIL — TypeScript rechaza `cicloClienteId` como propiedad de `IIniciarVisitaDTO`/
`INoVisitaDTO` en las líneas que todavía no se editaron, o el mock de la API no ve el campo
nuevo.

- [ ] **Step 3: Confirmar que `useVisitas.ts` no necesita cambios de código**

Abrí `src/hooks/useVisitas.ts` y confirmá que ningún literal menciona `cicloClienteId` a mano
(hoy no lo hace: `useIniciarVisita`/`useNoVisita` reciben el DTO completo y lo pasan tal cual).
Si `npx tsc --noEmit` no marca nada en este archivo después de Task 1, no hay Step de
implementación — el archivo ya es correcto por construcción.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/hooks/useVisitas.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useVisitas.test.tsx
git commit -m "test(hooks): useVisitas usa rotacionClienteId"
```

---

### Task 7: Eliminar el cierre manual de semana (`CerrarSemanaSheet`, `AccountMenu`, `AppHeader`)

**Files:**
- Delete: `src/components/CerrarSemanaSheet.tsx`
- Delete: `src/components/CerrarSemanaSheet.test.tsx`
- Modify: `src/components/AccountMenu.tsx`
- Modify: `src/components/AppHeader.tsx`

**Interfaces:**
- Produces: `AccountMenuProps` sin `onCerrarSemana`; `AppHeaderProps` sin `onCerrarSemana` —
  consumido por Task 13 (`AgendaSemanaPage.tsx`, que deja de pasar esa prop y de manejar el
  estado `cerrandoSemana`).

- [ ] **Step 1: Borrar los archivos del cierre manual**

```bash
git rm src/components/CerrarSemanaSheet.tsx src/components/CerrarSemanaSheet.test.tsx
```

- [ ] **Step 2: Sacar `onCerrarSemana` de `AccountMenu.tsx`**

En `src/components/AccountMenu.tsx`, sacá el campo `onCerrarSemana?: () => void` de
`AccountMenuProps`, sacalo de la desestructuración de props, y borrá el bloque completo:
```tsx
{onCerrarSemana && (
    <>
        <button role="menuitem" onClick={() => { setOpen(false); onCerrarSemana() }} ...>
            <Calendar className="h-4 w-4" />
            Cerrar semana
        </button>
        <div className="border-b border-dsline" />
    </>
)}
```
Si el import de `Calendar` de `lucide-react` queda sin otro uso en el archivo, sacalo también.

- [ ] **Step 3: Sacar `onCerrarSemana` de `AppHeader.tsx`**

En `src/components/AppHeader.tsx`, sacá `onCerrarSemana?: () => void` de `AppHeaderProps`, de la
desestructuración de props, y del `<AccountMenu ... onCerrarSemana={onCerrarSemana} />` (queda
`<AccountMenu nombre={vendedorNombre} onLogout={onLogout} />`).

- [ ] **Step 4: Correr `npx tsc --noEmit` acotado a estos dos archivos**

Run: `npx tsc --noEmit`
Expected: sin nuevos errores en `AccountMenu.tsx`/`AppHeader.tsx`/`AppHeader.test.tsx` (ya
confirmaste en la exploración previa que `AppHeader.test.tsx` no referencia `onCerrarSemana`).
Van a seguir apareciendo errores en `AgendaSemanaPage.tsx` — esos los resuelve Task 13.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/AccountMenu.tsx src/components/AppHeader.tsx
git commit -m "fix(ui): elimina el cierre manual de semana (CerrarSemanaSheet y su entrada en el menu)"
```

---

### Task 8: `CambioDeSemanaDialog` — cartel de confirmación del 409

**Files:**
- Create: `src/components/CambioDeSemanaDialog.tsx`
- Create: `src/components/CambioDeSemanaDialog.test.tsx`

**Interfaces:**
- Consumes: nada de tasks previas (componente de presentación puro).
- Produces: `CambioDeSemanaDialog` con props `{ open: boolean; semanaAbierta: number;
  clientesPendientes: string[]; confirmando?: boolean; onConfirmar: () => void; onCancelar: ()
  => void }` — usado por Task 13 (`AgendaSemanaPage.tsx`).

- [ ] **Step 1: Escribir el test que falla**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CambioDeSemanaDialog from './CambioDeSemanaDialog'

describe('CambioDeSemanaDialog', () => {
    it('muestra la semana abierta y cuántos clientes le quedan pendientes', () => {
        render(
            <CambioDeSemanaDialog
                open
                semanaAbierta={3}
                clientesPendientes={['101', '102']}
                onConfirmar={vi.fn()}
                onCancelar={vi.fn()}
            />,
        )
        expect(screen.getByText(/semana 3/i)).toBeInTheDocument()
        expect(screen.getByText(/2 clientes/i)).toBeInTheDocument()
    })

    it('confirmar dispara onConfirmar', () => {
        const onConfirmar = vi.fn()
        render(
            <CambioDeSemanaDialog
                open
                semanaAbierta={3}
                clientesPendientes={[]}
                onConfirmar={onConfirmar}
                onCancelar={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByRole('button', { name: /cambiar de semana/i }))
        expect(onConfirmar).toHaveBeenCalled()
    })

    it('cerrado no renderiza nada', () => {
        render(
            <CambioDeSemanaDialog
                open={false}
                semanaAbierta={3}
                clientesPendientes={[]}
                onConfirmar={vi.fn()}
                onCancelar={vi.fn()}
            />,
        )
        expect(screen.queryByText(/semana 3/i)).not.toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/CambioDeSemanaDialog.test.tsx`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar el componente**

Reusá `BottomSheet` (el mismo wrapper que usa `EstadoVisitaSheet`) para mantener el mismo
lenguaje visual:

```tsx
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'

interface CambioDeSemanaDialogProps {
    open: boolean
    semanaAbierta: number
    clientesPendientes: string[]
    confirmando?: boolean
    onConfirmar: () => void
    onCancelar: () => void
}

/**
 * El cartel del 409 CAMBIO_DE_SEMANA: el vendedor tocó una acción en una semana distinta a la
 * que tiene abierta. Confirmar cierra la abierta (sin resolver a sus pendientes — quedan
 * pendientes de esa vuelta, no se pierden) y abre la que estaba mirando.
 */
export default function CambioDeSemanaDialog({
    open,
    semanaAbierta,
    clientesPendientes,
    confirmando,
    onConfirmar,
    onCancelar,
}: CambioDeSemanaDialogProps) {
    return (
        <BottomSheet open={open} onClose={onCancelar} title="Cambiar de semana" eyebrow="Atención">
            <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                Tenés la <b>semana {semanaAbierta}</b> abierta
                {clientesPendientes.length > 0 && (
                    <>
                        {' '}
                        con <b>{clientesPendientes.length} clientes</b> pendientes
                    </>
                )}
                . Si seguís, esa semana queda como está (los pendientes no se pierden) y pasás a
                trabajar la que estabas mirando.
            </p>
            <div className="flex flex-col gap-2">
                <Button
                    onClick={onConfirmar}
                    loading={confirmando}
                    className="h-12 w-full bg-dsgreen text-[14.5px] hover:bg-dsgreen/90"
                >
                    Cambiar de semana
                </Button>
                <button
                    type="button"
                    onClick={onCancelar}
                    className="h-11 w-full text-[13px] font-semibold text-dsmuted underline"
                >
                    Seguir en la semana {semanaAbierta}
                </button>
            </div>
        </BottomSheet>
    )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/CambioDeSemanaDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/CambioDeSemanaDialog.tsx src/components/CambioDeSemanaDialog.test.tsx
git commit -m "feat(ui): agrega el cartel de confirmacion para CAMBIO_DE_SEMANA"
```

---

### Task 9: `EstadoVisitaSheet` — reagendar también a otra semana de la rotación

**Files:**
- Modify: `src/components/EstadoVisitaSheet.tsx`
- Create: `src/components/EstadoVisitaSheet.test.tsx` (no existe todavía)

**Interfaces:**
- Produces: `EstadoVisitaSheetProps` gana `semanaActual: number`, `semanasDisponibles:
  number[]` y `onElegirSemana: (semana: number) => void` — consumido por Task 13
  (`AgendaSemanaPage.tsx`, que pasa `semanaEfectiva` y `semanas` y llama a `useReacomodar` con
  `{ rotacionClienteId, semana }`, sin `dia` — mueve de semana sin tocar el día).

- [ ] **Step 1: Escribir los tests (el archivo no existía)**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EstadoVisitaSheet from './EstadoVisitaSheet'

const PROPS_BASE = {
    open: true,
    nombreCliente: 'Cliente Test',
    diaActual: 'LUN' as const,
    estadoActual: 'pendiente' as const,
    semanaActual: 2,
    semanasDisponibles: [1, 2, 3, 4],
    onElegirDia: vi.fn(),
    onElegirSemana: vi.fn(),
    onElegirNoVisita: vi.fn(),
    onClose: vi.fn(),
}

describe('EstadoVisitaSheet', () => {
    it('elegir un día habilita confirmar y llama a onElegirDia', () => {
        const onElegirDia = vi.fn()
        render(<EstadoVisitaSheet {...PROPS_BASE} onElegirDia={onElegirDia} />)
        fireEvent.click(screen.getByRole('button', { name: /martes/i }))
        fireEvent.click(screen.getByRole('button', { name: /elegí una opción|confirmar/i }))
        expect(onElegirDia).toHaveBeenCalledWith('MAR')
    })

    it('muestra las otras semanas de la rotación, sin la actual', () => {
        render(<EstadoVisitaSheet {...PROPS_BASE} />)
        expect(screen.getByRole('button', { name: /semana 1/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /semana 3/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /semana 4/i })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /semana 2/i })).not.toBeInTheDocument()
    })

    it('elegir otra semana llama a onElegirSemana', () => {
        const onElegirSemana = vi.fn()
        render(<EstadoVisitaSheet {...PROPS_BASE} onElegirSemana={onElegirSemana} />)
        fireEvent.click(screen.getByRole('button', { name: /semana 4/i }))
        expect(onElegirSemana).toHaveBeenCalledWith(4)
    })

    it('no visité deshabilitado si ya está registrado', () => {
        render(<EstadoVisitaSheet {...PROPS_BASE} estadoActual="no_visita" />)
        expect(screen.getByRole('button', { name: /ya registrado/i })).toBeDisabled()
    })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/EstadoVisitaSheet.test.tsx`
Expected: FAIL — `semanaActual`/`semanasDisponibles`/`onElegirSemana` no existen todavía en el
componente, y no hay botones "Semana N".

- [ ] **Step 3: Agregar la sección de semanas**

Agregá las props nuevas a `EstadoVisitaSheetProps` y una sección "O mover a otra semana" entre
los días y el separador de "No visité":

```tsx
interface EstadoVisitaSheetProps {
    open: boolean
    nombreCliente: string
    diaActual: Dia | null
    estadoActual: EstadoCicloCliente | null
    semanaActual: number
    semanasDisponibles: number[]
    onElegirDia: (dia: Dia) => void
    onElegirSemana: (semana: number) => void
    onElegirNoVisita: () => void
    onClose: () => void
}
```

```tsx
export default function EstadoVisitaSheet({
    open,
    nombreCliente,
    diaActual,
    estadoActual,
    semanaActual,
    semanasDisponibles,
    onElegirDia,
    onElegirSemana,
    onElegirNoVisita,
    onClose,
}: EstadoVisitaSheetProps) {
    // ... (estado `seleccion`, `useEffect` de reset y `confirmar()` para el día quedan igual)

    const otrasSemanas = semanasDisponibles.filter(s => s !== semanaActual)

    return (
        <BottomSheet open={open} onClose={onClose} title={nombreCliente} eyebrow="Estado de la visita">
            {/* ... bloque de días existente, sin cambios ... */}

            {otrasSemanas.length > 0 && (
                <>
                    <div className="my-4 flex items-center gap-2">
                        <div className="h-px flex-1 bg-[#E7E9F0]" />
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-dsmuted">
                            O mover a otra semana
                        </span>
                        <div className="h-px flex-1 bg-[#E7E9F0]" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {otrasSemanas.map(s => (
                            <button
                                key={s}
                                onClick={() => onElegirSemana(s)}
                                className="h-10 rounded-lg border-[1.5px] border-[#E1E6F0] px-3.5 text-[13px] font-semibold text-[#182645]"
                            >
                                Semana {s}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* ... separador "O registrar" + botón "No visité" + botón confirmar, sin cambios ... */}
        </BottomSheet>
    )
}
```

No toques el bloque de días ni el de "No visité": siguen funcionando igual, solo se agrega la
sección nueva entre medio.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/EstadoVisitaSheet.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/EstadoVisitaSheet.tsx src/components/EstadoVisitaSheet.test.tsx
git commit -m "feat(ui): EstadoVisitaSheet permite mover el cliente a otra semana de la rotacion"
```

---

### Task 10: `ClienteCard` — sacar el badge de `reagendada` y el bloqueo de acciones por modo

**Files:**
- Modify: `src/components/ClienteCard.tsx`
- Modify: `src/components/ClienteCard.test.tsx`

**Interfaces:**
- Produces: `ClienteCard` sigue recibiendo `cliente: IAgendaClient` y `modo?: 'operable' |
  'preview'`, pero `modo` deja de gatear qué botones se muestran (ver la Decisión de diseño al
  principio del plan) — consumido sin cambios de firma por `AgendaBoard.tsx` (Task 11).

- [ ] **Step 1: Actualizar los tests**

En `src/components/ClienteCard.test.tsx`:

1. Cambiá el fixture base: `cicloClienteId: 42` → `rotacionClienteId: 42`.

2. Reemplazá los dos tests de `reagendada`:
```ts
it('no_visita (sin visita real) no muestra fila de acciones', () => {
    render(<ClienteCard cliente={cliente({ estado: 'no_visita' })} {...PROPS_BASE} />)
    expect(botones()).toEqual(['Pagos', 'Versus', 'CRM'])
})
```
(sacá el test `no_visita y reagendada se distinguen visualmente` — ya no hay dos estados que
distinguir entre sí, solo queda el badge de `no_visita`, que ya tiene su propio test si existe
uno para el estado base; si no existe, agregalo: `expect(screen.getByText(/no visitado/i)).toBeInTheDocument()`).

3. En las 4 aserciones `expect.objectContaining({ cicloClienteId: 42 })`, renombrá a
   `rotacionClienteId: 42`.

4. Agregá un test nuevo que confirma la Decisión de diseño de este plan — que ahora se pueden
   iniciar visitas también en modo preview:
```ts
it('en modo preview también se puede iniciar visita: el backend abre la semana solo', () => {
    render(<ClienteCard cliente={cliente({ estado: 'pendiente' })} {...PROPS_BASE} modo="preview" />)
    expect(screen.getByRole('button', { name: /iniciar visita/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/ClienteCard.test.tsx`
Expected: FAIL — el badge de `reagendada` sigue en el JSX (rompe el test de botones porque
`estado: 'reagendada'` ya no es un valor válido de `EstadoCicloCliente` desde Task 1, así que
directamente no compila), y el test de "modo preview" falla porque hoy el botón no se renderiza
fuera de `operable`.

- [ ] **Step 3: Editar `ClienteCard.tsx`**

1. Sacá el import de `CalendarClock` (línea 1) — ya no se usa.

2. Borrá el bloque del badge `reagendada` (líneas 101-106):
```tsx
{cliente.estado === 'reagendada' && (
    <span ...>
        <CalendarClock ... />
        Reagendada
    </span>
)}
```

3. Sacá el gate `operable &&` de la fila de utilidades del header (línea 121) — el teléfono y
   "Reagendar" ya no dependen del modo:
```tsx
{!resuelto && (
    <div className="-mr-0.5 -mt-0.5 flex shrink-0 gap-1">
        {/* ... teléfono + botón Reagendar, sin cambios ... */}
    </div>
)}
```

4. Sacá el gate `operable &&` de `AccionesExternas` (línea 178):
```tsx
<AccionesExternas cliente={cliente} variante="contexto" onAbrir={onAbrirAppExterna} />
```

5. Sacá `operable` del árbol de decisión de las acciones (líneas 189-236) — queda solo la
   distinción resuelto/no resuelto, sin importar el modo:
```tsx
{resuelto && cliente.visitaId === null ? null : resuelto ? (
    <div className="mt-2.5 border-t border-[#EDEFF4] pt-2.5">
        <Button
            variant="outline"
            size="sm"
            onClick={() => onAbrir(cliente)}
            className="h-11 w-full border-[#D8DEEA] text-[13px] text-dsnavy"
        >
            Ver resumen
        </Button>
    </div>
) : (
    <div className="mt-2.5 flex flex-col gap-1.5 border-t border-[#EDEFF4] pt-2.5">
        <div className="flex gap-1.5">
            <Button
                variant="outline"
                size="sm"
                onClick={() => onAbrir(cliente)}
                className="h-11 flex-1 border-[#D8DEEA] text-[13px] text-dsnavy"
            >
                <Zap className="h-[14px] w-[14px]" strokeWidth={2} />
                Propuesta
            </Button>
            {puedeIniciar && (
                <Button
                    variant="default"
                    size="sm"
                    onClick={() => onIniciarVisita(cliente)}
                    className="h-11 flex-1 bg-dsgreen text-[13px] hover:bg-dsgreen/90"
                >
                    <Play className="h-[14px] w-[14px] fill-current" strokeWidth={0} />
                    Iniciar visita
                </Button>
            )}
        </div>
        {cliente.estado === 'pendiente' && otraVisitaEnCurso && (
            <div className="flex items-center justify-center gap-1.5 pt-0.5 text-[11.5px] font-semibold leading-tight text-[#8A93A6]">
                <Lock className="h-3 w-3 shrink-0" strokeWidth={2.2} />
                Cerrá la visita en curso para iniciar otra
            </div>
        )}
    </div>
)}
```

Con esto, la variable local `operable = modo === 'operable'` (línea 56) queda sin uso — borrala.
`modo` sigue siendo prop (por si el header quiere matizar el estilo visual más adelante) aunque
ya no se lea en el cuerpo del componente; dejala en la interfaz para no romper a los llamadores
de Task 11/13, con un comentario:
```tsx
interface ClienteCardProps {
    cliente: IAgendaClient
    /** Ya no gatea qué se puede tocar (ver docs/superpowers/plans/2026-08-10-frontend-plan-rotacion-editable.md):
     *  toda semana de la rotación es accionable. Se mantiene por si a futuro hace falta un
     *  matiz visual entre "semana abierta" y "otra semana de la rotación". */
    modo?: 'operable' | 'preview'
    ...
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/ClienteCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ClienteCard.tsx src/components/ClienteCard.test.tsx
git commit -m "feat(ui): ClienteCard saca el badge de reagendada y deja de bloquear acciones por modo"
```

---

### Task 11: `AgendaBoard` — renombrar fixture de test

**Files:**
- Modify: `src/components/AgendaBoard.test.tsx`

**Interfaces:**
- Consumes: `IAgendaClient` con `rotacionClienteId` (Task 1). `AgendaBoard.tsx` en sí no cambia
  de código — solo pasa `cliente`/`modo` a `ClienteCard` sin lógica propia de gateo.

- [ ] **Step 1: Renombrar el fixture**

En `src/components/AgendaBoard.test.tsx`, en la función `cliente(over)`, cambiá
`cicloClienteId: 1` por `rotacionClienteId: 1`.

- [ ] **Step 2: Correr el test y verificar que compila y pasa**

Run: `npx vitest run src/components/AgendaBoard.test.tsx`
Expected: PASS (el componente `AgendaBoard.tsx` no tenía ninguna referencia a
`cicloClienteId`/`modo === 'operable'` en su propio código — el fixture es el único ajuste).

- [ ] **Step 3: Commit**

```bash
git add src/components/AgendaBoard.test.tsx
git commit -m "test(ui): AgendaBoard usa rotacionClienteId"
```

---

### Task 12: `VisitaFlow` — renombrar y manejar `CAMBIO_DE_SEMANA`

**Files:**
- Modify: `src/components/VisitaFlow.tsx`
- Modify: `src/components/VisitaFlow.test.tsx`

**Interfaces:**
- Consumes: `errorData` (Task 3), `IIniciarVisitaDTO` con `confirmarCambioDeSemana` (Task 1).
- Produces: `VisitaFlowProps` gana `onCambioDeSemana?: (info: { semanaAbierta: number;
  clientesPendientes: string[]; reintentar: () => void }) => void` — consumido por Task 13, que
  usa esta señal para abrir `CambioDeSemanaDialog`.

- [ ] **Step 1: Escribir el test que falla**

Agregá a `src/components/VisitaFlow.test.tsx` (junto al test existente de
`CICLO_CLIENTE_YA_RESUELTO`, que sigue igual — ver el punto 3 más abajo):

```ts
it('si iniciar falla por CAMBIO_DE_SEMANA, avisa al padre con los datos y una función de reintento', async () => {
    const onCambioDeSemana = vi.fn()
    vi.mocked(api.iniciarVisita).mockRejectedValueOnce({
        response: {
            status: 409,
            data: { code: 'CAMBIO_DE_SEMANA', semanaAbierta: 3, clientesPendientes: ['1'] },
        },
    })
    render(
        <VisitaFlow
            cliente={CLIENTE}
            visitaEnCurso={null}
            onVisitaIniciada={vi.fn()}
            onVisitaCerrada={vi.fn()}
            onClose={vi.fn()}
            onGeoBloqueada={vi.fn()}
            onCambioDeSemana={onCambioDeSemana}
        />,
    )
    // ... disparar iniciar visita igual que en el resto del archivo (confirmar propuesta o
    // tocar "Iniciar visita" directo, según cómo esté armado el resto del setup del archivo) ...
    await waitFor(() => expect(onCambioDeSemana).toHaveBeenCalledWith(
        expect.objectContaining({ semanaAbierta: 3, clientesPendientes: ['1'] }),
    ))

    // Reintentar manda confirmarCambioDeSemana: true con el mismo payload
    vi.mocked(api.iniciarVisita).mockResolvedValueOnce({ visitaId: 99, rubros: 0 })
    const { reintentar } = onCambioDeSemana.mock.calls[0][0]
    await reintentar()
    expect(api.iniciarVisita).toHaveBeenLastCalledWith(
        expect.objectContaining({ confirmarCambioDeSemana: true }),
    )
})
```

Adaptá el disparo de "iniciar visita" a como ya lo hacen los tests vecinos de este archivo (el
mismo patrón que usa el test de `CICLO_CLIENTE_YA_RESUELTO` un poco más abajo en el archivo,
del que este es hermano).

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/VisitaFlow.test.tsx`
Expected: FAIL — `onCambioDeSemana` no existe como prop todavía.

- [ ] **Step 3: Editar `VisitaFlow.tsx`**

1. Renombrá las 4 ocurrencias de `cicloClienteId` a `rotacionClienteId`: el dependency array del
   `useEffect` (línea 87), la comparación `esClienteEnCurso` (línea 94), y el payload de
   `iniciar.mutateAsync` (línea 161).

2. En el test existente de `CICLO_CLIENTE_YA_RESUELTO`, ese código NO cambia de nombre — el
   backend no lo renombró (confirmado: sigue siendo `CICLO_CLIENTE_YA_RESUELTO`, no
   `ROTACION_CLIENTE_YA_RESUELTO`). Dejalo tal cual está.

3. Agregá la prop nueva y la rama de manejo:
```tsx
interface VisitaFlowProps {
    // ... props existentes ...
    /** El backend rechazó la acción porque el vendedor está mirando una semana distinta a la
     *  que tiene abierta. `reintentar` repite la MISMA acción con confirmarCambioDeSemana. */
    onCambioDeSemana?: (info: {
        semanaAbierta: number
        clientesPendientes: string[]
        reintentar: () => Promise<void>
    }) => void
}
```

4. En `onIniciar`, agregá la rama de `CAMBIO_DE_SEMANA` antes del catch genérico, aceptando un
   parámetro `confirmar` que se pasa al DTO:
```tsx
async function onIniciar(propuesta: IPropuestaRubroDTO[], confirmar = false) {
    if (iniciandoFlujo || bloqueadoPorOtraVisita) return
    setErrorIniciar(null)
    setIniciandoFlujo(true)
    try {
        await conUbicacion(async coord => {
            try {
                const { visitaId: id } = await iniciar.mutateAsync({
                    rotacionClienteId: cliente!.rotacionClienteId,
                    coordInicio: coord,
                    propuesta,
                    confirmarCambioDeSemana: confirmar || undefined,
                })
                setPropuestaPendiente(null)
                onVisitaIniciada(cliente!, id)
                marcarInicioVisita(id)
                onAviso?.('exito', 'Visita iniciada')
            } catch (err) {
                const code = errorCode(err)
                if (code === 'VISITA_ACTIVA_EXISTENTE' || code === 'CICLO_CLIENTE_YA_RESUELTO') {
                    onAviso?.('info', 'Este cliente ya fue resuelto. Actualizamos tu agenda.')
                    cerrarFlujo()
                    return
                }
                if (code === 'CAMBIO_DE_SEMANA' && onCambioDeSemana) {
                    const data = errorData<{ semanaAbierta: number; clientesPendientes: string[] }>(err)
                    if (data) {
                        onCambioDeSemana({
                            semanaAbierta: data.semanaAbierta,
                            clientesPendientes: data.clientesPendientes,
                            reintentar: () => onIniciar(propuesta, true),
                        })
                        return
                    }
                }
                setErrorIniciar('No se pudo iniciar la visita. Volvé a intentar.')
            }
        })
    } finally {
        setIniciandoFlujo(false)
    }
}
```

5. Agregá el import: `import { errorCode, errorData } from '@/lib/apiError'`.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/VisitaFlow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/VisitaFlow.tsx src/components/VisitaFlow.test.tsx
git commit -m "feat(ui): VisitaFlow usa rotacionClienteId y maneja el 409 CAMBIO_DE_SEMANA"
```

---

### Task 13: `AgendaSemanaPage` — sincronizar, navegar por `semanas`, previsualizar y reacomodar

**Files:**
- Modify: `src/pages/AgendaSemanaPage.tsx`
- Modify: `src/pages/AgendaSemanaPage.test.tsx`

**Interfaces:**
- Consumes: `useCicloActual`, `usePreviewSemana`, `useSincronizar`, `useReacomodar` (Task 5),
  `useNoVisita`/`useIniciarVisita` (Task 6), `CambioDeSemanaDialog` (Task 8),
  `EstadoVisitaSheet` con `semanaActual`/`semanasDisponibles`/`onElegirSemana` (Task 9),
  `ClienteCard`/`AgendaBoard` sin gateo por modo (Tasks 10-11), `VisitaFlow` con
  `onCambioDeSemana` (Task 12).
- Produces: la página completa, consumida solo por el router (`src/App.tsx` o equivalente — no
  se toca, la ruta ya apunta acá).

Este es el task más grande del plan porque concentra la orquestación. Andá por partes.

- [ ] **Step 1: Escribir/actualizar los tests que fallan**

Reescribí en `src/pages/AgendaSemanaPage.test.tsx`:

1. El fixture del ciclo pasa a la forma nueva:
```ts
const CICLO_ACTUAL_ABIERTO = {
    ciclo: { id: 1, rotacionId: 10, codigoParticularVendedor: 'V 2', semana: 3, fechaLunes: '2026-08-10', fechaApertura: '2026-08-10T10:00:00Z', fechaCierre: null, estado: 'abierta' as const },
    semanas: [1, 2, 3, 4],
    semanasPendientes: [3, 4],
}
const CICLO_ACTUAL_STANDBY = {
    ciclo: null,
    semanas: [1, 2, 3, 4],
    semanasPendientes: [3, 4],
}
```
y todos los fixtures de cliente cambian `cicloClienteId` por `rotacionClienteId`.

2. Reemplazá `abrir la semana usa la que se está viendo` (que testeaba `onAbrirSemana`/
   `api.abrirCiclo`, ya no existe) por un test de la sincronización al montar:
```ts
it('sincroniza al montar y avisa si cerró una semana con pendientes', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_STANDBY)
    ;(api.sincronizar as any).mockResolvedValue({
        semanaCerrada: 2, sinVisitar: ['101', '102'], rubrosAutocompletados: 0,
        altas: [], bajas: [], rotacionCerrada: false,
    })
    ;(api.previewSemana as any).mockResolvedValue({ semana: 3, clientes: 0, omitidos: [], dias: semanaVacia })
    renderPage()
    await waitFor(() => expect(api.sincronizar).toHaveBeenCalled())
    expect(await screen.findByText(/semana 2/i)).toBeInTheDocument()
})
```

3. Reemplazá `las flechas hacen wrap de 5 a 1` por un test que confirma que el wrap usa el
   `semanas` real de la rotación (no 5 fijo) — clave para el caso de un vendedor de 4 semanas:
```ts
it('las flechas hacen wrap sobre el set real de semanas, no sobre 5 fijo', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_STANDBY) // semanas: [1,2,3,4]
    ;(api.previewSemana as any).mockImplementation((s: number) =>
        Promise.resolve({ semana: s, clientes: 0, omitidos: [], dias: semanaVacia }),
    )
    renderPage()
    await screen.findByText(/semana 1/i) // arranca en la primera semana pendiente/conocida
    fireEvent.click(screen.getByRole('button', { name: /semana anterior/i }))
    await waitFor(() => expect(api.previewSemana).toHaveBeenCalledWith(4)) // wrap 1 -> 4, no -> 0
})
```

4. Sacá el test `sin vuelta abierta muestra la semana propuesta por el backend` en su forma
   vieja (dependía de `getCicloPreview` sin argumentos) y reemplazalo por uno que confirme que
   sin ciclo abierto se usa `semanasPendientes[0]` como punto de partida:
```ts
it('sin ciclo abierto arranca en la primera semana pendiente', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_STANDBY)
    ;(api.previewSemana as any).mockResolvedValue({ semana: 3, clientes: 0, omitidos: [], dias: semanaVacia })
    renderPage()
    await waitFor(() => expect(api.previewSemana).toHaveBeenCalledWith(3))
})
```

5. En `una ?semana fuera de la rotación se ignora y vale la vuelta abierta`, cambiá la
   verificación de rango de `semanaParam <= 5` a comprobar contra `semanas` (agregá un caso con
   `semanas: [1, 2, 3, 4]` y `?semana=7`, que debe caer al valor por defecto).

6. Dejá sin cambios los tests de apps externas y de navegación de día (no dependen de
   `abrirCiclo`/`cerrarCiclo`/`SEMANAS`).

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/pages/AgendaSemanaPage.test.tsx`
Expected: FAIL — la página todavía usa `SEMANAS = 5`, `useAbrirCiclo`, `useCicloPreview`,
`CerrarSemanaSheet`, `CicloVacio`, y no llama a `sincronizar` ni a `previewSemana`.

- [ ] **Step 3: Reescribir `AgendaSemanaPage.tsx`**

Los imports pasan a:
```ts
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import AppHeader from '@/components/AppHeader'
import DiaTabs from '@/components/DiaTabs'
import AgendaBoard from '@/components/AgendaBoard'
import VisitaFlow, { type IVisitaEnCurso } from '@/components/VisitaFlow'
import VisitaEnCursoBar from '@/components/VisitaEnCursoBar'
import ResolucionSheet from '@/components/ResolucionSheet'
import EstadoVisitaSheet from '@/components/EstadoVisitaSheet'
import CambioDeSemanaDialog from '@/components/CambioDeSemanaDialog'
import AppExternaSheet from '@/components/AppExternaSheet'
import { useAgendaSemana } from '@/hooks/useAgenda'
import { useCicloActual, usePreviewSemana, useSincronizar, useReacomodar } from '@/hooks/useCiclo'
import { useMotivos } from '@/hooks/useMotivos'
import { useNoVisita } from '@/hooks/useVisitas'
import { useNotificacion } from '@/hooks/useNotificacion'
import { useAppExterna } from '@/hooks/useAppExterna'
import { Notification } from '@/components/ui/Notification'
import { estaResuelto } from '@/lib/estadoCiclo'
import { errorCode, errorData } from '@/lib/apiError'
import { getWeekRangeLabel, getDiaDeHoy } from '@/lib/weekDates'
import type { Dia, IAgendaClient, SemanaAgenda } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']
```
(`SEMANAS = 5` desaparece del todo).

`mensajeDeCuenta` no cambia.

Reescribí el cuerpo del componente:

```tsx
export default function AgendaSemanaPage() {
    const { user, logout } = useAuth()
    const { data: cicloActual } = useCicloActual()
    const ciclo = cicloActual?.ciclo ?? null
    const semanas = cicloActual?.semanas
    const semanasPendientes = cicloActual?.semanasPendientes
    const sincronizar = useSincronizar()
    const reacomodar = useReacomodar()
    const noVisita = useNoVisita()
    const { data: motivosVisita = [] } = useMotivos('visita')
    const { notificacion, mostrar, ocultar } = useNotificacion()
    const { desmontar: desmontarAppExterna, ...appExterna } = useAppExterna()

    const [searchParams, setSearchParams] = useSearchParams()

    function actualizarPosicion(cambios: { dia?: Dia; semana?: number | null }) {
        setSearchParams(
            prev => {
                const next = new URLSearchParams(prev)
                if (cambios.dia !== undefined) next.set('dia', cambios.dia)
                if (cambios.semana !== undefined) {
                    if (cambios.semana === null) next.delete('semana')
                    else next.set('semana', String(cambios.semana))
                }
                return next
            },
            { replace: true },
        )
    }

    // Se llama UNA vez al montar y cada vez que la PWA vuelve a primer plano — nunca por
    // acción del usuario. Cierra la semana vencida (si la hay) y sincroniza el padrón; nunca
    // abre nada, así que no hace falta esperarla para pintar la página.
    useEffect(() => {
        function correr() {
            sincronizar.mutateAsync().then(res => {
                if (res.semanaCerrada !== null) {
                    mostrar(
                        'info',
                        `Cerramos tu semana ${res.semanaCerrada}` +
                            (res.sinVisitar.length > 0
                                ? ` — ${res.sinVisitar.length} clientes quedaron sin visitar.`
                                : '.'),
                    )
                }
                if (res.altas.length > 0 || res.bajas.length > 0) {
                    mostrar(
                        'info',
                        `Tu ruta cambió: ${res.altas.length} clientes nuevos, ${res.bajas.length} de baja.`,
                    )
                }
            }).catch(() => {})
        }
        correr()
        function onVisible() {
            if (document.visibilityState === 'visible') correr()
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => document.removeEventListener('visibilitychange', onVisible)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const semanaParam = Number(searchParams.get('semana'))
    const semanaVista =
        Number.isInteger(semanaParam) && (semanas ?? []).includes(semanaParam) ? semanaParam : null
    const setSemanaVista = (semana: number | null) => actualizarPosicion({ semana })

    // Con ciclo abierto, esa es la semana. Sin ciclo (standby, de pie casi todos los lunes),
    // arranca en la primera semana PENDIENTE si se conoce — es la que `asegurar` abriría de
    // todas formas ante la primera acción real — y si no, en la primera semana conocida.
    const semanaEfectiva =
        semanaVista ?? ciclo?.semana ?? semanasPendientes?.[0] ?? semanas?.[0] ?? null
    const operable = ciclo == null || semanaEfectiva === ciclo.semana

    const { data: agenda } = useAgendaSemana(operable && ciclo != null)
    const { data: preview } = usePreviewSemana(
        semanaEfectiva ?? undefined,
        semanaEfectiva !== null && !(operable && ciclo != null),
    )

    const diaParam = searchParams.get('dia')
    const diaActivo: Dia = DIAS.includes(diaParam as Dia)
        ? (diaParam as Dia)
        : (getDiaDeHoy() ?? 'LUN')
    const setDiaActivo = (dia: Dia) => actualizarPosicion({ dia })
    const [visitaCliente, setVisitaCliente] = useState<IAgendaClient | null>(null)
    const [directoAMapa, setDirectoAMapa] = useState(false)
    const [noVisitaCliente, setNoVisitaCliente] = useState<IAgendaClient | null>(null)
    const [estadoVisitaCliente, setEstadoVisitaCliente] = useState<IAgendaClient | null>(null)
    const [visitaEnCurso, setVisitaEnCurso] = useState<IVisitaEnCurso | null>(null)
    const [cambioDeSemana, setCambioDeSemana] = useState<{
        semanaAbierta: number
        clientesPendientes: string[]
        reintentar: () => Promise<void>
    } | null>(null)

    useEffect(() => {
        desmontarAppExterna()
    }, [diaActivo, semanaEfectiva, desmontarAppExterna])

    useEffect(() => {
        if (!agenda) return
        if (visitaEnCurso) {
            const actual = DIAS.flatMap(d => agenda[d] ?? []).find(
                c => c.rotacionClienteId === visitaEnCurso.cliente.rotacionClienteId,
            )
            if (actual && actual.estado !== 'en_curso' && actual.estado !== 'pendiente') {
                setVisitaEnCurso(null)
            }
            return
        }
        const enCurso = DIAS.flatMap(d => agenda[d] ?? []).find(c => c.estado === 'en_curso')
        if (enCurso && enCurso.visitaId !== null) {
            setVisitaEnCurso({ cliente: enCurso, visitaId: enCurso.visitaId })
        }
    }, [agenda, visitaEnCurso])

    const viendoVisitaEnCurso =
        visitaEnCurso !== null &&
        visitaCliente !== null &&
        visitaCliente.rotacionClienteId === visitaEnCurso.cliente.rotacionClienteId

    // Con ciclo abierto y coincidente, la fuente es la agenda real (con estado/visitaId/
    // rubrosPendientes reales). Cualquier otra semana —incluido el standby, que también usa
    // esta rama— sale del preview de solo lectura, con estado 'pendiente' de relleno: el
    // rotacionClienteId SÍ es real, así que las acciones de ClienteCard funcionan igual.
    const semana: SemanaAgenda | undefined = useMemo(() => {
        if (operable && ciclo != null) return agenda
        if (!preview) return undefined
        const out = {} as SemanaAgenda
        for (const d of DIAS) {
            out[d] = (preview.dias[d] ?? []).map(c => ({
                ...c,
                estado: 'pendiente' as const,
                visitaId: null,
                rubrosPendientes: 0,
            }))
        }
        return out
    }, [operable, ciclo, agenda, preview])

    const counts = useMemo(() => {
        const c = {} as Record<Dia, { done: number; total: number }>
        for (const d of DIAS) {
            const clientes = semana?.[d] ?? []
            c[d] = { done: clientes.filter(x => estaResuelto(x.estado)).length, total: clientes.length }
        }
        return c
    }, [semana])

    const totalClientes = DIAS.reduce((n, d) => n + (semana?.[d]?.length ?? 0), 0)
    const totalDone = DIAS.reduce((n, d) => n + counts[d].done, 0)

    function moverSemana(delta: number) {
        if (!semanas || semanas.length === 0) return
        const base = semanaEfectiva ?? semanas[0]
        const idx = semanas.indexOf(base)
        const nextIdx = ((idx === -1 ? 0 : idx) + delta + semanas.length) % semanas.length
        setSemanaVista(semanas[nextIdx])
    }

    function manejarCambioDeSemana(
        data: unknown,
        reintentar: () => Promise<void>,
    ): boolean {
        const info = errorData<{ semanaAbierta: number; clientesPendientes: string[] }>(data)
        if (errorCode(data) !== 'CAMBIO_DE_SEMANA' || !info) return false
        setCambioDeSemana({
            semanaAbierta: info.semanaAbierta,
            clientesPendientes: info.clientesPendientes,
            reintentar,
        })
        return true
    }

    async function onElegirDia(dia: Dia) {
        const cliente = estadoVisitaCliente
        setEstadoVisitaCliente(null)
        if (!cliente) return
        const ejecutar = () =>
            reacomodar.mutateAsync({ rotacionClienteId: cliente.rotacionClienteId, dia: DIAS.indexOf(dia) + 1 })
        try {
            await ejecutar()
            mostrar('exito', 'Cliente reagendado')
        } catch (err) {
            if (manejarCambioDeSemana(err, async () => {
                await reacomodar.mutateAsync({
                    rotacionClienteId: cliente.rotacionClienteId,
                    dia: DIAS.indexOf(dia) + 1,
                })
                mostrar('exito', 'Cliente reagendado')
            })) return
            mostrar('error', 'No se pudo reagendar. Volvé a intentar.')
        }
    }

    async function onElegirSemanaReagendar(semanaDestino: number) {
        const cliente = estadoVisitaCliente
        setEstadoVisitaCliente(null)
        if (!cliente) return
        try {
            await reacomodar.mutateAsync({ rotacionClienteId: cliente.rotacionClienteId, semana: semanaDestino, dia: cliente.dia })
            mostrar('exito', `Cliente movido a la semana ${semanaDestino}`)
        } catch (err) {
            if (manejarCambioDeSemana(err, async () => {
                await reacomodar.mutateAsync({
                    rotacionClienteId: cliente.rotacionClienteId,
                    semana: semanaDestino,
                    dia: cliente.dia,
                })
                mostrar('exito', `Cliente movido a la semana ${semanaDestino}`)
            })) return
            mostrar('error', 'No se pudo mover de semana. Volvé a intentar.')
        }
    }

    function abrirPropuesta(cliente: IAgendaClient) {
        setDirectoAMapa(false)
        setVisitaCliente(cliente)
    }

    function iniciarDirecto(cliente: IAgendaClient) {
        setDirectoAMapa(true)
        setVisitaCliente(cliente)
    }

    function onElegirNoVisita() {
        const cliente = estadoVisitaCliente
        setEstadoVisitaCliente(null)
        setNoVisitaCliente(cliente)
    }

    async function onConfirmNoVisita(motivoIds: number[], confirmar = false) {
        const cliente = noVisitaCliente
        setNoVisitaCliente(null)
        if (!cliente) return
        try {
            await noVisita.mutateAsync({
                rotacionClienteId: cliente.rotacionClienteId,
                motivoIds,
                confirmarCambioDeSemana: confirmar || undefined,
            })
            mostrar('exito', 'Registrado')
        } catch (err) {
            if (manejarCambioDeSemana(err, () => onConfirmNoVisita(motivoIds, true))) return
            const yaResuelto = errorCode(err) === 'CICLO_CLIENTE_YA_RESUELTO'
            mostrar(
                yaResuelto ? 'info' : 'error',
                yaResuelto
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
                        ? `Semana ${semanaEfectiva}${operable && ciclo != null ? ` · ${getWeekRangeLabel()}` : ''}`
                        : 'Cargando…'
                }
                modo={operable && ciclo != null ? 'operable' : 'preview'}
                onLogout={logout}
                onPrevWeek={() => moverSemana(-1)}
                onNextWeek={() => moverSemana(1)}
            />
            <DiaTabs activo={diaActivo} counts={counts} onSelect={setDiaActivo} />
            <AgendaBoard
                semana={semana}
                activo={diaActivo}
                modo={operable && ciclo != null ? 'operable' : 'preview'}
                hayVisitaEnCurso={visitaEnCurso !== null}
                onActivoChange={setDiaActivo}
                onAbrir={abrirPropuesta}
                onEstadoVisita={setEstadoVisitaCliente}
                onIniciarVisita={iniciarDirecto}
                onAbrirAppExterna={appExterna.abrir}
            />

            <VisitaFlow
                cliente={visitaCliente}
                visitaEnCurso={visitaEnCurso}
                directoAMapa={directoAMapa}
                onVisitaIniciada={(cliente, visitaId) => setVisitaEnCurso({ cliente, visitaId })}
                onVisitaCerrada={() => setVisitaEnCurso(null)}
                onClose={() => {
                    setVisitaCliente(null)
                    setDirectoAMapa(false)
                }}
                onGeoBloqueada={motivo => mostrar('error', MENSAJE_GEO[motivo])}
                onAviso={mostrar}
                onAbrirAppExterna={appExterna.abrir}
                onCambioDeSemana={info => setCambioDeSemana(info)}
            />
            {visitaEnCurso && !viendoVisitaEnCurso && (
                <VisitaEnCursoBar
                    visitaId={visitaEnCurso.visitaId}
                    nombreCliente={visitaEnCurso.cliente.nombreFantasia || visitaEnCurso.cliente.nombreCliente}
                    onExpandir={() => abrirPropuesta(visitaEnCurso.cliente)}
                />
            )}
            <ResolucionSheet
                open={!!noVisitaCliente}
                motivos={motivosVisita}
                confirmLabel="Registrar"
                eyebrow="No visité"
                submitting={noVisita.isPending}
                onConfirm={motivoIds => onConfirmNoVisita(motivoIds)}
                onClose={() => setNoVisitaCliente(null)}
            />
            <EstadoVisitaSheet
                open={!!estadoVisitaCliente}
                nombreCliente={estadoVisitaCliente?.nombreCliente ?? ''}
                diaActual={estadoVisitaCliente ? DIAS[estadoVisitaCliente.dia - 1] : null}
                estadoActual={estadoVisitaCliente?.estado ?? null}
                semanaActual={semanaEfectiva ?? 1}
                semanasDisponibles={semanas ?? []}
                onElegirDia={onElegirDia}
                onElegirSemana={onElegirSemanaReagendar}
                onElegirNoVisita={onElegirNoVisita}
                onClose={() => setEstadoVisitaCliente(null)}
            />
            <CambioDeSemanaDialog
                open={cambioDeSemana !== null}
                semanaAbierta={cambioDeSemana?.semanaAbierta ?? 0}
                clientesPendientes={cambioDeSemana?.clientesPendientes ?? []}
                onConfirmar={async () => {
                    const info = cambioDeSemana
                    setCambioDeSemana(null)
                    await info?.reintentar()
                }}
                onCancelar={() => setCambioDeSemana(null)}
            />
            {appExterna.clienteActivo && Object.keys(appExterna.montadas).length > 0 && (
                <AppExternaSheet
                    key={appExterna.clienteActivo.codigoParticularCliente}
                    cliente={appExterna.clienteActivo}
                    montadas={appExterna.montadas}
                    appActivaId={appExterna.appActivaId}
                    visible={appExterna.visible}
                    onSeleccionarApp={app => {
                        if (appExterna.clienteActivo) appExterna.abrir(app, appExterna.clienteActivo)
                    }}
                    onClose={appExterna.ocultar}
                />
            )}
            <Notification notificacion={notificacion} onDismiss={ocultar} />
        </div>
    )
}
```

`MENSAJE_GEO` y `mensajeDeCuenta` quedan exactamente como estaban (no se tocan).

Nota sobre `mensajeDeCuenta`: quedó sin usarse en el cuerpo del componente porque ya no hay un
`onAbrirSemana` que lo consulte. Si `npx tsc --noEmit`/el linter lo marca como no usado,
borralo junto con `SELLER_CODE_UNRESOLVED`/`SELLER_CODE_AMBIGUOUS` — pero antes confirmá:
¿algún otro flujo de esta página (iniciar visita, no visita, sincronizar) puede devolver esos
códigos? Si sí, hace falta enchufar `mensajeDeCuenta` en el catch correspondiente en vez de
borrarlo; si no, bórralo.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/pages/AgendaSemanaPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/AgendaSemanaPage.tsx src/pages/AgendaSemanaPage.test.tsx
git commit -m "feat(agenda): reemplaza abrir/cerrar semana manual por sincronizar + apertura implicita, navega por el set real de semanas"
```

---

### Task 14: Analítica — sacar `'reagendada'` de `TablaActividad`

**Files:**
- Modify: `src/components/analitica/TablaActividad.tsx`
- Modify: `src/components/analitica/TablaActividad.test.tsx`
- Modify: `src/api/analitica.test.ts`

**Interfaces:**
- Consumes: `TipoResolucion` sin `'reagendada'` (Task 1).

- [ ] **Step 1: Actualizar los tests**

En `src/components/analitica/TablaActividad.test.tsx`, borrá el test `una reagendada NO se
muestra como en curso aunque no tenga fechaFin`.

En `src/api/analitica.test.ts`, en el test que arma el `Set` de tipos, sacá `'reagendada'`:
```ts
expect(tipos).toEqual(new Set(['visita', 'no_visita']))
```
Borrá el test `una reagendada no trae motivos`.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/analitica/TablaActividad.test.tsx src/api/analitica.test.ts`
Expected: FAIL — `TipoResolucion` ya no acepta `'reagendada'` como literal (Task 1), así que el
archivo no compila hasta que se saque la rama del `if` en `TablaActividad.tsx`.

- [ ] **Step 3: Editar `TablaActividad.tsx`**

```ts
/** El estado sale del `tipo` y recién después del `fechaFin`. */
function estadoDe(fila: IVisitaFila): Estado {
    if (fila.tipo === 'no_visita') return { texto: 'No visitó', clase: 'bg-slate-100 text-slate-600' }
    if (fila.fechaFin === null) return { texto: 'En curso', clase: 'bg-amber-100 text-amber-800' }
    return { texto: 'Cerrada', clase: 'bg-emerald-100 text-emerald-700' }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/analitica/TablaActividad.test.tsx src/api/analitica.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/analitica/TablaActividad.tsx src/components/analitica/TablaActividad.test.tsx src/api/analitica.test.ts
git commit -m "fix(analitica): saca 'reagendada' de TablaActividad, ya no existe ese tipo"
```

---

### Task 15: Verificación final

**Files:** ninguno nuevo — este task solo corre la suite completa y corrige lo que haya quedado
suelto.

- [ ] **Step 1: Compilar todo el proyecto**

Run: `npx tsc --noEmit`
Expected: 0 errores. Si aparece alguno, es una referencia a `cicloClienteId`/`reagendada`/
`SEMANAS`/`abrirCiclo`/`cerrarCiclo`/`getCicloPreview`/`CerrarSemanaSheet`/`CicloVacio` que
ninguna task anterior cubrió — arreglalo ahí mismo siguiendo el mismo patrón de rename/remove
que el resto del plan, no lo postergues.

- [ ] **Step 2: Correr toda la suite**

Run: `npx vitest run`
Expected: todos los tests en verde. Si algo falla por un fixture con `cicloClienteId` que se
escapó, renombralo.

- [ ] **Step 3: Grep de residuos**

Run (bash/PowerShell, lo que corresponda al entorno):
```
grep -rn "cicloClienteId\|reagendada\|SEMANAS = 5\|CerrarSemanaSheet\|CicloVacio\|getCicloPreview\|abrirCiclo\|cerrarCiclo" src/
```
Expected: sin resultados (o solo dentro de comentarios que documenten el modelo VIEJO a
propósito, ninguno de los cuales debería existir tras las tasks anteriores — si aparece alguno,
es candidato a borrar).

- [ ] **Step 4: Levantar el dev server y probar el golden path a mano**

Run: `npm run dev`

Con el backend del worktree `plan-rotacion-editable` corriendo local (`docker compose -f
docker-compose.local.yml up -d` en `api-vendedores`, apuntado por `.env`/`.env.local` de este
front), probar en el navegador:
1. Login como el vendedor de prueba.
2. La página sincroniza sola al entrar (sin ningún botón de abrir/cerrar semana visible en
   ningún lado — chequeá especialmente el menú de la cuenta, ya no debe tener "Cerrar semana").
3. Las flechas de semana navegan el set real (probar con un vendedor de rotación no-5, si hay
   uno cargado en el fixture del worktree de backend).
4. Iniciar una visita en la semana que se está mirando funciona sin importar si es la "abierta"
   o no.
5. Reagendar un cliente a otro día Y a otra semana desde `EstadoVisitaSheet`.
6. Forzar un `CAMBIO_DE_SEMANA` (abrir una semana desde un cliente, después intentar accionar
   otro cliente de una semana distinta) y confirmar que aparece el cartel y que "Cambiar de
   semana" reintenta la acción correctamente.

Si algo de esto no se puede probar por falta de datos de prueba en el worktree de backend,
decilo explícitamente en el reporte final en vez de asumir que funciona.

- [ ] **Step 5: Commit final si hubo ajustes**

Si el Step 1 o 3 encontraron algo para corregir:
```bash
git add -A
git commit -m "fix: cierra residuos del contrato viejo detectados en la verificacion final"
```

Si no hubo nada que corregir, no hace falta commit — el plan ya quedó aplicado en los 14 commits
anteriores.
