# Marcas por rubro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el vendedor vea qué marcas compra el cliente dentro de cada rubro de la propuesta (desglose en la tabla, tocando los números), y que al resolver el rubro pueda declarar qué marca(s) ofreció, guardado como alcance estructurado.

**Architecture:** Un endpoint nuevo en el dominio `sale` de api-vendedores (`POST /sale/rubro/client-context`) devuelve rubros con marcas anidadas y reemplaza el parche que hoy usa `getRubroStatus`. El hecho "qué marca ofrecí" viaja en el `PUT` de resolver como `marcas[]` y se persiste en `pl_ofrecimiento_alcance` (`tipo='marca'`), reemplazando a `detalle.marca`; Cromo lee del alcance con fallback al JSON viejo. En el front, la fila del rubro se parte en dos zonas (nombre = cargar, números = desplegar marcas) y el picker de marca del wizard se reemplaza por chips multi-selección precargados con las marcas del cliente.

**Tech Stack:** Back: Node/Express/TypeScript, Postgres warehouse (`fct_sales`), MySQL via Sequelize (`pl_*`), Redis, Jest. Front: Vite + React 19 + TypeScript, React Query, Tailwind, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-16-marcas-por-rubro-design.md` (leer antes de empezar; las secciones se citan como §N).

## Global Constraints

- Dos repos. Back: `C:/Users/matia/Documents/distrisuper/business-workflow/versus/api-vendedores` (rama nueva desde `master`). Front: `C:/Users/matia/Documents/distrisuper/app-planificacion` (rama nueva desde `master`). Los paths de cada tarea dicen a qué repo pertenecen.
- Tests: back `npm test -- <ruta>` (Jest); front `npm test -- <ruta>` (Vitest, `vitest run`). Typecheck front: `npx tsc -b`. Build back: `npm run build`.
- **Vocabulario del vendedor:** nunca "semana N", "ciclo", "rotación" en textos de UI. Textos exactos de esta feature: banda `Tu propuesta · tocá el rubro para cargar el resultado · los números, para ver sus marcas`; wizard `¿Qué marca ofreciste?` + `opcional`; tag `dejó`; sub-fila `+N marcas más`; chip `+ Otra`; check `Aplicar a restantes`.
- **La marca ofrecida es opcional**: nunca bloquea el cierre ni cuenta para `minimoRequerido` (§2).
- **No se escribe más `detalle.marca`.** `detalle.accion` y `detalle.params` no cambian (§4.0).
- **`dropped`** = `last6Months.amount > 0 && thisMonth.amount === 0 && lastMonth.amount === 0` (§3.3). Se calcula en el server.
- Columnas numéricas del front a **48px** (`w-[48px]`), zona de despliegue = las tres celdas numéricas; máximo **3** sub-filas + `+N marcas más` (§5.1).
- Colores del proyecto: `dsnavy #213D82`, `dsred #B42318`, `dsmuted #697585`, tinte de zona abierta `#EEF3FB`, fondo sub-fila `#F7F8FB`.
- Commits chicos, en español, prefijo `feat|fix|test|docs(<área>)`. Terminar cada commit con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Sin código "preparado" para marcas de la zona ni para pesos/unidades más allá de devolver `units` (§7).

---

## File map

**api-vendedores**

| archivo | responsabilidad |
|---|---|
| `src/repositories/SalesRepository.ts` (modificar) | `queryClientRubroBrandMonthly`: una query a `fct_sales` cliente × rubro × marca × mes |
| `src/services/sales/clientContextLogic.ts` (crear) | puro: períodos, agregación rubro→marcas, `dropped`, orden |
| `src/services/sales/clientContextLogic.spec.ts` (crear) | tests de la lógica pura |
| `src/services/sales/ClientContextService.ts` (crear) | orquesta repo + cache + logic; tipos públicos de la response |
| `src/services/sales/ClientContextService.spec.ts` (crear) | tests con repo y Redis mockeados |
| `src/config/aiBusinessConfig.ts` (modificar) | namespace de cache `CLIENT_CONTEXT` |
| `src/controllers/saleController.ts` (modificar) | `getClientContext` |
| `src/routes/sale.ts` (modificar) | ruta + JSDoc con consumidores |
| `src/types/planificacion.ts` (modificar) | `IMarcaOfrecidaDTO`, `IResolverOfrecimientoDTO.marcas` |
| `src/services/planificacion/ofrecimientoValidation.ts` (+spec) | `validarMarcasOfrecidas` |
| `src/repositories/OfrecimientoRepository.ts` (+spec) | `resolver(..., marcas?)` escribe alcance `tipo='marca'` |
| `src/services/planificacion/OfrecimientosService.ts` (+spec) | valida y pasa `marcas` |
| `src/controllers/planificacionController.ts` (modificar) | parsea `marcas` del body |
| `src/services/crm/seguimientoTexto.ts` (+spec) | etiqueta desde alcance, fallback `detalle.marca` |
| `CLAUDE.md` (modificar) | criterio "sale es dato, planificacion es dominio" |

**app-planificacion**

| archivo | responsabilidad |
|---|---|
| `src/types/planificacion.ts` (modificar) | `IMarcaEstado`, `IRubroEstado.marcas`, `IClientContextResponse`, `IMarcaOfrecida`, `IResolverOfrecimientoDTO.marcas`; borrar `IRubroClients*` |
| `src/api/planificacion.ts` (+test) | `getRubroStatus` → `client-context` |
| `src/components/propuesta/filas.ts` (+test) | `marcas` en `IOfrecimientoFila` |
| `src/components/propuesta/OfrecimientoTable.tsx` (+test) | dos zonas, sub-filas, layout al borde |
| `src/lib/resolucionDraft.ts` (+test) | borrador de marcas ofrecidas |
| `src/hooks/useOfrecimientos.ts` | `marcas` en el item del batch |
| `src/components/propuesta/MarcasOfrecidasChips.tsx` (crear, +test) | chips multi + `+ Otra` + `Aplicar a restantes` |
| `src/components/propuesta/MarcaOfrecimientoPicker.tsx` (+test) | **borrar** |
| `src/components/propuesta/ResolucionOfrecimiento.tsx` (+test) | usa los chips |
| `src/components/propuesta/ResolucionWizard.tsx` (+test) | borrador de marcas, precarga, limpiar, aplicar |
| `src/components/VisitaSheet.tsx` (+test) | estado, persistencia, `esPersistible`, `PUT` con `marcas` |
| `docs/dominio/tablas.md`, `CLAUDE.md` | doc viva |

---

## Parte A — api-vendedores

### Task 1: Query cliente × rubro × marca × mes en `SalesRepository`

**Files:**
- Modify: `src/repositories/SalesRepository.ts` (agregar tipo después de `ClientRubroAmountRow` ~línea 217; método después de `queryClientRubroMonthlyAmounts` ~línea 1060)

**Interfaces:**
- Produces: `ClientRubroBrandMonthRow` y `SalesRepository.queryClientRubroBrandMonthly(particularCode: string, yearMonths: string[], sellerScope?: string[] | null, clientScope?: string[] | null): Promise<ClientRubroBrandMonthRow[]>`

No hay test unitario del SQL (ningún método de `SalesRepository` lo tiene; se prueba vía el service con el repo mockeado). La verificación es `npm run build` y, si hay warehouse local, una llamada manual al endpoint en la Task 4.

- [ ] **Step 1: Agregar el tipo de fila**

Debajo de `ClientRubroAmountRow`:

```ts
/** Serie mensual de pesos y unidades por rubro × marca de UN cliente. `brandCode` es
 *  null para las líneas sin marca: suman al rubro pero no se listan como marca. */
export interface ClientRubroBrandMonthRow {
    rubroCode: string
    rubroDescription: string
    brandCode: string | null
    brandName: string | null
    yearMonth: string
    amount: number
    units: number
    accountName: string
}
```

- [ ] **Step 2: Agregar el método**

Debajo de `queryClientRubroMonthlyAmounts`. El importe usa la misma fórmula que `acc_amount` de `getRubroBreakdown` (cuenta secundaria = 0, GM a precio proveedor, resto `sale_total`), y el CTE `rubro_catalog` es copia literal del que ya usa `queryClientRubroMonthlyAmounts`.

```ts
    /**
     * Pesos y unidades por rubro × marca × mes de UN cliente, para el contexto comercial
     * (app-planificacion: propuesta y visita). Baja a fct_sales porque el mart no tiene
     * marca. Una sola query: el total del rubro es la suma de sus marcas (incluida la
     * fila brand_code NULL, que suma pero no se lista).
     */
    static async queryClientRubroBrandMonthly(
        particularCode: string,
        yearMonths: string[],
        sellerScope?: string[] | null,
        clientScope?: string[] | null,
    ): Promise<ClientRubroBrandMonthRow[]> {
        if (yearMonths.length === 0) return []

        let values: any[] = [particularCode, yearMonths]
        let whereText =
            'WHERE s.account_particular_code = $1 AND s.year_month = ANY($2) AND s.rubro_code IN (SELECT rubro_code FROM rubro_catalog)'
        ;({ whereText, values } = this.applySellerScope(whereText, values, sellerScope))
        ;({ whereText, values } = this.applyClientScope(whereText, values, clientScope))

        const text = `
            WITH rubro_catalog AS (
                SELECT DISTINCT
                    codigo_super_rubro::text AS rubro_code
                FROM staging.stg_rubros
                WHERE descripcion_super_rubro != 'SIN SUPERRUBRO'
                  AND descripcion_super_rubro NOT ILIKE '%borrar%'
                  AND descripcion_super_rubro NOT ILIKE '%no usa%'
                  AND descripcion_super_rubro NOT LIKE 'ZZ%'
                  AND descripcion_super_rubro NOT IN (
                      'SUPER RUBRO GENERAL', 'OPESPECIAL', 'OPUNICA', 'FEEPORSUSCRIPCION'
                  )
            )
            SELECT
                s.rubro_code                 AS "rubroCode",
                MAX(s.rubro_description)     AS "rubroDescription",
                s.brand_code::text           AS "brandCode",
                MAX(s.brand_name)            AS "brandName",
                s.year_month                 AS "yearMonth",
                SUM(CASE
                    WHEN s.is_secondary_account THEN 0
                    WHEN s.is_gm_sale AND s.gm_provider_price > 0
                        THEN ${this.GM_PRICE_FORMULA}
                    ELSE s.sale_total
                END)                         AS "amount",
                SUM(CASE WHEN s.is_valid_for_units THEN s.article_quantity ELSE 0 END) AS "units",
                MAX(s.account_name)          AS "accountName"
            FROM ${this.TABLE} s
            ${whereText}
            GROUP BY s.rubro_code, s.brand_code, s.year_month
        `.trim()

        const rows = await warehouseQuery<any>(text, values)
        return rows.map(r => ({
            rubroCode: r.rubroCode,
            rubroDescription: r.rubroDescription,
            brandCode: r.brandCode ?? null,
            brandName: r.brandName ?? null,
            yearMonth: r.yearMonth,
            amount: Number(r.amount),
            units: Number(r.units),
            accountName: r.accountName ?? '',
        }))
    }
```

Nota: `GM_PRICE_FORMULA` referencia columnas sin alias (`gm_provider_price * ...`); como la query tiene un solo `FROM` con alias `s`, Postgres las resuelve igual. Si el build o una prueba manual se queja de ambigüedad, prefijar con `s.` dentro de un literal local en vez de tocar la constante compartida.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/repositories/SalesRepository.ts
git commit -m "feat(sale): query cliente × rubro × marca × mes para el contexto comercial"
```

---

### Task 2: Lógica pura del contexto (`clientContextLogic.ts`)

**Files:**
- Create: `src/services/sales/clientContextLogic.ts`
- Create: `src/services/sales/clientContextLogic.spec.ts`

**Interfaces:**
- Consumes: `ClientRubroBrandMonthRow` (Task 1), `shiftYM` de `./rubroDropsLogic`.
- Produces:
  ```ts
  export interface PeriodTotals { amount: number; units: number }
  export type ContextPeriodKey = 'thisMonth' | 'lastMonth' | 'last6Months'
  export type ContextTotalsByPeriod = Record<ContextPeriodKey, PeriodTotals>
  export interface ContextBrand { brandCode: string; brandName: string; totalsByPeriod: ContextTotalsByPeriod; dropped: boolean }
  export interface ContextRubro { rubroCode: string; rubroDescription: string; totalsByPeriod: ContextTotalsByPeriod; brands: ContextBrand[] }
  export interface ContextPeriods { thisMonth: string[]; lastMonth: string[]; last6Months: string[] }
  export function contextPeriods(currentYM: string): ContextPeriods
  export function allMonths(periods: ContextPeriods): string[]
  export function aggregateClientContext(rows: ClientRubroBrandMonthRow[], periods: ContextPeriods): ContextRubro[]
  export function isDropped(t: ContextTotalsByPeriod): boolean
  ```

- [ ] **Step 1: Escribir los tests**

```ts
// src/services/sales/clientContextLogic.spec.ts
import {
    aggregateClientContext,
    allMonths,
    contextPeriods,
    isDropped,
} from './clientContextLogic'
import { ClientRubroBrandMonthRow } from '../../repositories/SalesRepository'

const P = contextPeriods('2026-09')

function row(over: Partial<ClientRubroBrandMonthRow>): ClientRubroBrandMonthRow {
    return {
        rubroCode: 'R1',
        rubroDescription: 'DISCOS',
        brandCode: 'B1',
        brandName: 'FREMAX',
        yearMonth: '2026-08',
        amount: 100,
        units: 2,
        accountName: 'Cliente',
        ...over,
    }
}

describe('contextPeriods', () => {
    it('thisMonth es el mes en curso, lastMonth el anterior, last6Months los 6 cerrados', () => {
        expect(P.thisMonth).toEqual(['2026-09'])
        expect(P.lastMonth).toEqual(['2026-08'])
        expect(P.last6Months).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'])
    })
    it('allMonths trae los 7 meses sin repetir', () => {
        expect(allMonths(P)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
    })
})

describe('isDropped', () => {
    const t = (six: number, last: number, cur: number) => ({
        last6Months: { amount: six, units: 0 },
        lastMonth: { amount: last, units: 0 },
        thisMonth: { amount: cur, units: 0 },
    })
    it('true con historia y dos meses en cero', () => expect(isDropped(t(300, 0, 0))).toBe(true))
    it('false si compró el mes pasado', () => expect(isDropped(t(300, 50, 0))).toBe(false))
    it('false si compró este mes', () => expect(isDropped(t(300, 0, 50))).toBe(false))
    it('false sin historia', () => expect(isDropped(t(0, 0, 0))).toBe(false))
})

describe('aggregateClientContext', () => {
    it('suma por período y anida las marcas en su rubro', () => {
        const out = aggregateClientContext(
            [
                row({ yearMonth: '2026-09', amount: 10, units: 1 }),
                row({ yearMonth: '2026-08', amount: 20, units: 2 }),
                row({ yearMonth: '2026-03', amount: 30, units: 3 }),
            ],
            P,
        )
        expect(out).toHaveLength(1)
        const r = out[0]
        expect(r.rubroCode).toBe('R1')
        expect(r.totalsByPeriod).toEqual({
            thisMonth: { amount: 10, units: 1 },
            lastMonth: { amount: 20, units: 2 },
            last6Months: { amount: 50, units: 5 },
        })
        expect(r.brands).toHaveLength(1)
        expect(r.brands[0]).toMatchObject({ brandCode: 'B1', brandName: 'FREMAX' })
        expect(r.brands[0].totalsByPeriod).toEqual(r.totalsByPeriod)
    })

    it('la fila sin marca suma al rubro pero no se lista como marca', () => {
        const out = aggregateClientContext(
            [
                row({ brandCode: 'B1', yearMonth: '2026-08', amount: 20 }),
                row({ brandCode: null, brandName: null, yearMonth: '2026-08', amount: 5 }),
            ],
            P,
        )
        expect(out[0].totalsByPeriod.lastMonth.amount).toBe(25)
        expect(out[0].brands.map(b => b.brandCode)).toEqual(['B1'])
    })

    it('ordena rubros y marcas por last6Months.amount desc', () => {
        const out = aggregateClientContext(
            [
                row({ rubroCode: 'R1', brandCode: 'B1', yearMonth: '2026-05', amount: 10 }),
                row({ rubroCode: 'R1', brandCode: 'B2', brandName: 'CORVEN', yearMonth: '2026-05', amount: 40 }),
                row({ rubroCode: 'R2', rubroDescription: 'BUJES', brandCode: 'B3', brandName: 'SKF', yearMonth: '2026-05', amount: 500 }),
            ],
            P,
        )
        expect(out.map(r => r.rubroCode)).toEqual(['R2', 'R1'])
        expect(out[1].brands.map(b => b.brandCode)).toEqual(['B2', 'B1'])
    })

    it('marca dropped: historia y dos meses en cero', () => {
        const out = aggregateClientContext(
            [
                row({ brandCode: 'B1', yearMonth: '2026-04', amount: 100 }),
                row({ brandCode: 'B2', brandName: 'CORVEN', yearMonth: '2026-08', amount: 100 }),
            ],
            P,
        )
        const porCode = new Map(out[0].brands.map(b => [b.brandCode, b]))
        expect(porCode.get('B1')!.dropped).toBe(true)
        expect(porCode.get('B2')!.dropped).toBe(false)
    })

    it('ignora meses fuera de los períodos', () => {
        const out = aggregateClientContext([row({ yearMonth: '2025-12', amount: 999 })], P)
        expect(out).toHaveLength(0)
    })
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm test -- src/services/sales/clientContextLogic.spec.ts`
Expected: FAIL, módulo no existe.

- [ ] **Step 3: Implementar**

```ts
// src/services/sales/clientContextLogic.ts
import { ClientRubroBrandMonthRow } from '../../repositories/SalesRepository'
import { shiftYM } from './rubroDropsLogic'

export interface PeriodTotals {
    amount: number
    units: number
}

export type ContextPeriodKey = 'thisMonth' | 'lastMonth' | 'last6Months'
export type ContextTotalsByPeriod = Record<ContextPeriodKey, PeriodTotals>

export interface ContextBrand {
    brandCode: string
    brandName: string
    totalsByPeriod: ContextTotalsByPeriod
    /** Tenía historia y no compra hace dos meses (spec §3.3). */
    dropped: boolean
}

export interface ContextRubro {
    rubroCode: string
    rubroDescription: string
    totalsByPeriod: ContextTotalsByPeriod
    brands: ContextBrand[]
}

export interface ContextPeriods {
    thisMonth: string[]
    lastMonth: string[]
    /** Los 6 meses CERRADOS previos al actual. Incluye a lastMonth a propósito: es
     *  "promedio de los últimos 6 cerrados", igual que P.6M en la tabla. */
    last6Months: string[]
}

export function contextPeriods(currentYM: string): ContextPeriods {
    const last6: string[] = []
    for (let i = 6; i >= 1; i--) last6.push(shiftYM(currentYM, -i))
    return { thisMonth: [currentYM], lastMonth: [shiftYM(currentYM, -1)], last6Months: last6 }
}

export function allMonths(periods: ContextPeriods): string[] {
    return [...new Set([...periods.last6Months, ...periods.lastMonth, ...periods.thisMonth])].sort()
}

export function isDropped(t: ContextTotalsByPeriod): boolean {
    return t.last6Months.amount > 0 && t.thisMonth.amount === 0 && t.lastMonth.amount === 0
}

function vacio(): ContextTotalsByPeriod {
    return {
        thisMonth: { amount: 0, units: 0 },
        lastMonth: { amount: 0, units: 0 },
        last6Months: { amount: 0, units: 0 },
    }
}

function sumar(t: ContextTotalsByPeriod, key: ContextPeriodKey, row: ClientRubroBrandMonthRow): void {
    t[key].amount += row.amount
    t[key].units += row.units
}

/** A qué períodos aporta un mes. Un mes puede caer en más de uno (lastMonth ⊂ last6Months). */
function periodosDe(yearMonth: string, p: ContextPeriods): ContextPeriodKey[] {
    const out: ContextPeriodKey[] = []
    if (p.thisMonth.includes(yearMonth)) out.push('thisMonth')
    if (p.lastMonth.includes(yearMonth)) out.push('lastMonth')
    if (p.last6Months.includes(yearMonth)) out.push('last6Months')
    return out
}

const porSeis = (a: { totalsByPeriod: ContextTotalsByPeriod }, b: { totalsByPeriod: ContextTotalsByPeriod }) =>
    b.totalsByPeriod.last6Months.amount - a.totalsByPeriod.last6Months.amount

/** Agrupa filas (rubro × marca × mes) en rubros con marcas anidadas. Puro. */
export function aggregateClientContext(
    rows: ClientRubroBrandMonthRow[],
    periods: ContextPeriods,
): ContextRubro[] {
    const rubros = new Map<string, { rubro: ContextRubro; brands: Map<string, ContextBrand> }>()

    for (const row of rows) {
        const keys = periodosDe(row.yearMonth, periods)
        if (keys.length === 0) continue

        let entry = rubros.get(row.rubroCode)
        if (!entry) {
            entry = {
                rubro: {
                    rubroCode: row.rubroCode,
                    rubroDescription: row.rubroDescription,
                    totalsByPeriod: vacio(),
                    brands: [],
                },
                brands: new Map(),
            }
            rubros.set(row.rubroCode, entry)
        }
        for (const k of keys) sumar(entry.rubro.totalsByPeriod, k, row)

        // SIN MARCA suma al rubro pero no se lista.
        if (row.brandCode == null) continue

        let brand = entry.brands.get(row.brandCode)
        if (!brand) {
            brand = {
                brandCode: row.brandCode,
                brandName: row.brandName ?? row.brandCode,
                totalsByPeriod: vacio(),
                dropped: false,
            }
            entry.brands.set(row.brandCode, brand)
        }
        for (const k of keys) sumar(brand.totalsByPeriod, k, row)
    }

    return [...rubros.values()]
        .map(({ rubro, brands }) => ({
            ...rubro,
            brands: [...brands.values()]
                .map(b => ({ ...b, dropped: isDropped(b.totalsByPeriod) }))
                .sort(porSeis),
        }))
        .sort(porSeis)
}
```

- [ ] **Step 4: Correr los tests**

Run: `npm test -- src/services/sales/clientContextLogic.spec.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/services/sales/clientContextLogic.ts src/services/sales/clientContextLogic.spec.ts
git commit -m "feat(sale): lógica pura del contexto comercial por rubro con marcas"
```

---

### Task 3: `ClientContextService` con cache

**Files:**
- Create: `src/services/sales/ClientContextService.ts`
- Create: `src/services/sales/ClientContextService.spec.ts`
- Modify: `src/config/aiBusinessConfig.ts` (objeto `AI_CACHE_NAMESPACES`, ~línea 252)

**Interfaces:**
- Consumes: Task 1 y Task 2; `RedisService.get/set`, `CACHE_TTLS.ANALYTICS`, `CustomError`, `createLogger` (mismos imports que `RubroDropsService`).
- Produces:
  ```ts
  export interface ClientContextRequest { particularCode: string; sellerScope?: string[] | null; clientScope?: string[] | null; forceRefresh?: boolean }
  export interface ClientContextResponse { particularCode: string; clientName: string; currentYM: string; rubros: ContextRubro[] }
  export class ClientContextService { static async query(req: ClientContextRequest): Promise<ClientContextResponse> }
  ```

- [ ] **Step 1: Namespace de cache**

En `AI_CACHE_NAMESPACES`, debajo de `RUBRO_DROP_TOP_SELLERS`:

```ts
    CLIENT_CONTEXT: 'client_context_v1',
```

- [ ] **Step 2: Tests del service**

```ts
// src/services/sales/ClientContextService.spec.ts
import { ClientContextService } from './ClientContextService'
import { RedisService } from '../cache/RedisService'
import { SalesRepository, ClientRubroBrandMonthRow } from '../../repositories/SalesRepository'
import { CustomError } from '../../utils/errors'
import { AI_CACHE_NAMESPACES } from '../../config/aiBusinessConfig'

jest.mock('../cache/RedisService')
jest.mock('../../repositories/SalesRepository')

const FIXED_DATE = new Date(2026, 8, 16, 12, 0, 0) // 2026-09

const mockedQuery = SalesRepository.queryClientRubroBrandMonthly as jest.MockedFunction<
    typeof SalesRepository.queryClientRubroBrandMonthly
>
const mockedGet = RedisService.get as jest.MockedFunction<typeof RedisService.get>
const mockedSet = RedisService.set as jest.MockedFunction<typeof RedisService.set>

function row(over: Partial<ClientRubroBrandMonthRow>): ClientRubroBrandMonthRow {
    return {
        rubroCode: 'R1', rubroDescription: 'DISCOS', brandCode: 'B1', brandName: 'FREMAX',
        yearMonth: '2026-08', amount: 100, units: 1, accountName: 'REPUESTOS MENDOZA', ...over,
    }
}

describe('ClientContextService', () => {
    beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(FIXED_DATE) })
    afterAll(() => jest.useRealTimers())
    beforeEach(() => { jest.clearAllMocks(); mockedGet.mockResolvedValue(null); mockedSet.mockResolvedValue(undefined as any) })

    it('rechaza sin particularCode', async () => {
        await expect(ClientContextService.query({ particularCode: '' })).rejects.toBeInstanceOf(CustomError)
        expect(mockedQuery).not.toHaveBeenCalled()
    })

    it('pide los 7 meses (6 cerrados + actual) con el scope recibido', async () => {
        mockedQuery.mockResolvedValue([])
        await ClientContextService.query({ particularCode: '07463', sellerScope: ['V1'], clientScope: null })
        expect(mockedQuery).toHaveBeenCalledWith(
            '07463',
            ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
            ['V1'],
            null,
        )
    })

    it('arma la response y la cachea con el namespace propio', async () => {
        mockedQuery.mockResolvedValue([row({})])
        const out = await ClientContextService.query({ particularCode: '07463' })
        expect(out.particularCode).toBe('07463')
        expect(out.clientName).toBe('REPUESTOS MENDOZA')
        expect(out.currentYM).toBe('2026-09')
        expect(out.rubros[0].brands[0].brandName).toBe('FREMAX')
        expect(mockedSet).toHaveBeenCalledWith(
            AI_CACHE_NAMESPACES.CLIENT_CONTEXT,
            expect.stringContaining('07463'),
            expect.objectContaining({ particularCode: '07463' }),
            expect.anything(),
        )
    })

    it('con cache hit no va al warehouse', async () => {
        mockedGet.mockResolvedValue({ particularCode: '07463', clientName: 'X', currentYM: '2026-09', rubros: [] })
        const out = await ClientContextService.query({ particularCode: '07463' })
        expect(out.clientName).toBe('X')
        expect(mockedQuery).not.toHaveBeenCalled()
    })

    it('forceRefresh saltea el cache', async () => {
        mockedGet.mockResolvedValue({ particularCode: '07463', clientName: 'X', currentYM: '2026-09', rubros: [] })
        mockedQuery.mockResolvedValue([])
        await ClientContextService.query({ particularCode: '07463', forceRefresh: true })
        expect(mockedQuery).toHaveBeenCalled()
    })

    it('si Redis falla al guardar, devuelve igual', async () => {
        mockedQuery.mockResolvedValue([row({})])
        mockedSet.mockRejectedValue(new Error('redis down'))
        const out = await ClientContextService.query({ particularCode: '07463' })
        expect(out.rubros).toHaveLength(1)
    })
})
```

- [ ] **Step 3: Correr para verificar que falla**

Run: `npm test -- src/services/sales/ClientContextService.spec.ts`
Expected: FAIL (módulo no existe / `queryClientRubroBrandMonthly` no es función mockeada hasta que exista en el repo — Task 1 ya lo agregó).

- [ ] **Step 4: Implementar**

```ts
// src/services/sales/ClientContextService.ts
import { createLogger } from '../../utils/logger'
import { CustomError } from '../../utils/errors'
import { RedisService } from '../cache/RedisService'
import { CACHE_TTLS } from '../../config/cache'
import { AI_CACHE_NAMESPACES } from '../../config/aiBusinessConfig'
import { SalesRepository } from '../../repositories/SalesRepository'
import {
    aggregateClientContext,
    allMonths,
    contextPeriods,
    ContextRubro,
} from './clientContextLogic'

const logger = createLogger('ClientContextService')
const CACHE_NAMESPACE = AI_CACHE_NAMESPACES.CLIENT_CONTEXT

export interface ClientContextRequest {
    particularCode: string
    sellerScope?: string[] | null
    clientScope?: string[] | null
    forceRefresh?: boolean
}

/** "Cómo viene comprando este cliente, por rubro, con sus marcas". Períodos crudos:
 *  el consumidor decide si divide last6Months por 6 o cómo lo rotula. */
export interface ClientContextResponse {
    particularCode: string
    clientName: string
    currentYM: string
    rubros: ContextRubro[]
}

/**
 * Contexto comercial de un cliente para la propuesta y la visita. Dominio `sale`:
 * responde una pregunta del warehouse que tiene sentido sin importar quién pregunta.
 * Consumidores: app-planificacion (PropuestaSheet, VisitaSheet).
 */
export class ClientContextService {
    static async query(request: ClientContextRequest): Promise<ClientContextResponse> {
        const { particularCode, sellerScope, clientScope, forceRefresh = false } = request

        if (!particularCode) {
            throw new CustomError(400, 'particularCode es requerido', {
                code: 'CLIENT_CONTEXT_CLIENT_REQUIRED',
            })
        }

        const currentYM = this.currentYM()
        const cacheKey = this.buildCacheKey(request, currentYM)

        if (!forceRefresh) {
            const cached = await RedisService.get<ClientContextResponse>(CACHE_NAMESPACE, cacheKey)
            if (cached) return cached
        }

        const periods = contextPeriods(currentYM)
        const rows = await SalesRepository.queryClientRubroBrandMonthly(
            particularCode,
            allMonths(periods),
            sellerScope,
            clientScope,
        )

        const response: ClientContextResponse = {
            particularCode,
            clientName: rows[0]?.accountName ?? '',
            currentYM,
            rubros: aggregateClientContext(rows, periods),
        }

        try {
            await RedisService.set(CACHE_NAMESPACE, cacheKey, response, { ttl: CACHE_TTLS.ANALYTICS })
        } catch (cacheErr) {
            logger.warn('[ClientContext] no se pudo cachear; se devuelve sin cachear', {
                error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
            })
        }

        return response
    }

    private static currentYM(): string {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }

    /** El scope va en la clave: dos usuarios con scope distinto no comparten resultado. */
    private static buildCacheKey(req: ClientContextRequest, currentYM: string): string {
        const seller = (req.sellerScope ?? []).slice().sort().join(',') || '*'
        const client = (req.clientScope ?? []).slice().sort().join(',') || '*'
        return `${req.particularCode}:${currentYM}:${seller}:${client}`
    }
}
```

- [ ] **Step 5: Correr los tests**

Run: `npm test -- src/services/sales/ClientContextService.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/sales/ClientContextService.ts src/services/sales/ClientContextService.spec.ts src/config/aiBusinessConfig.ts
git commit -m "feat(sale): ClientContextService — rubros con marcas de un cliente, cacheado"
```

---

### Task 4: Ruta `POST /sale/rubro/client-context` + criterio en CLAUDE.md

**Files:**
- Modify: `src/controllers/saleController.ts` (import ~línea 13; método debajo de `getRubroDrops`)
- Modify: `src/routes/sale.ts` (debajo del bloque de `drops`, antes de `/rubro/catalog`)
- Modify: `CLAUDE.md` (sección nueva después de "Architecture Overview")

**Interfaces:**
- Consumes: `ClientContextService.query` (Task 3).
- Produces: `POST /sale/rubro/client-context` body `{ particularCode, forceRefresh? }` → `{ ok: 1, data: ClientContextResponse }`.

- [ ] **Step 1: Controller**

Import: `import { ClientContextService } from '../services/sales/ClientContextService'`. Método:

```ts
    /** Contexto comercial de un cliente (rubros con marcas). Consumidores: app-planificacion. */
    static async getClientContext(req: Request, res: Response): Promise<void> {
        const startTime = Date.now()
        try {
            const data = await ClientContextService.query({
                particularCode: req.body.particularCode,
                sellerScope: req.salesScope?.allowedSellerCodes ?? null,
                clientScope: req.salesScope?.allowedClientCodes ?? null,
                forceRefresh: req.body.forceRefresh === true,
            })
            logger.info(`[ClientContext] in ${Date.now() - startTime}ms`)
            res.status(200).json({ ok: 1, data })
        } catch (err) {
            if (err instanceof CustomError) {
                res.status(err.statusCode).json(err.toJSON())
            } else {
                logger.error('Error in getClientContext', {
                    error: err instanceof Error ? err.message : String(err),
                })
                res.status(500).json({
                    ok: 0,
                    error: err instanceof Error ? err.message : 'Unexpected error',
                })
            }
        }
    }
```

- [ ] **Step 2: Ruta con JSDoc y consumidores**

```ts
/**
 * @openapi
 * /sale/rubro/client-context:
 *   post:
 *     tags: [Sale]
 *     summary: Cómo viene comprando un cliente, por rubro, con sus marcas
 *     description: >
 *       Por cada rubro del cliente, pesos y unidades en thisMonth / lastMonth /
 *       last6Months (suma de los 6 meses cerrados), y adentro las marcas con la misma
 *       forma más `dropped` (tenía historia y no compra hace dos meses). Períodos crudos,
 *       sin dividir: el consumidor decide cómo los muestra.
 *       Consumidores: app-planificacion (PropuestaSheet, VisitaSheet). Reemplaza al uso
 *       de /sale/rubro/clients con search por código que hacía esa app.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [particularCode]
 *             properties:
 *               particularCode: { type: string }
 *               forceRefresh: { type: boolean, default: false }
 *     responses:
 *       200: { description: Rubros del cliente con marcas }
 *       400: { description: particularCode faltante }
 *       503: { description: Warehouse inaccesible }
 */
router.post(
    '/rubro/client-context',
    authMiddleware,
    authorize(...rolesWhere(policy => policy.monetaryDataVisible)),
    salesScopeMiddleware,
    async (req: Request, res: Response) => {
        SaleController.getClientContext(req, res)
    },
)
```

- [ ] **Step 3: Criterio de arquitectura en CLAUDE.md**

Agregar después de la sección "Architecture Overview" (antes de "Request Lifecycle" o al final de esa sección, donde quede legible):

```markdown
### Dos apps, un API: dónde va cada endpoint

api-vendedores sirve a **app-vendedores** (Versus) y a **app-planificacion**. Para que un
endpoint no quede huérfano ni mezclado:

- **Los dominios se cortan por el dato, no por la app.** `sale/*` responde preguntas del
  warehouse que tienen sentido sin importar quién pregunta ("qué marcas compra este cliente
  en este rubro"). `planificacion/*` maneja el dominio propio (tablas `pl_`, visita,
  resolución, propuesta congelada).
- **La composición va en el servicio de dominio**, no en un endpoint por pantalla
  (`VisitasService` importa `RubroDropsService` para congelar la propuesta).
- **Cada ruta declara sus consumidores** en el JSDoc (`Consumidores: app-planificacion`).
  Sin consumidor listado, es candidata a borrarse.
- **Sin código preparado sin uso.** Lo que no se pide, se anota en el spec; no se codea.
- **No hay BFF por app**: con dos apps, el mismo auth y el mismo warehouse, duplicaría
  endpoints y es justamente lo que produce huérfanos.
```

También corregir la línea "No test suite is configured — `npm test` returns an error." → `npm test` corre Jest (`*.spec.ts`). Está desactualizada.

- [ ] **Step 4: Build y, si hay warehouse local, prueba manual**

Run: `npm run build`
Expected: sin errores.

Opcional (si `npm run dev` levanta con warehouse): `curl -X POST localhost:PORT/sale/rubro/client-context -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"particularCode":"07463"}'` y verificar `rubros[].brands[]`.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/saleController.ts src/routes/sale.ts CLAUDE.md
git commit -m "feat(sale): POST /sale/rubro/client-context y criterio de dominios en CLAUDE.md"
```

---

### Task 5: `marcas` en resolver — validación, repo, service, controller

**Files:**
- Modify: `src/types/planificacion.ts` (`IResolverOfrecimientoDTO`, ~línea 321)
- Modify: `src/services/planificacion/ofrecimientoValidation.ts` (+ `ofrecimientoValidation.spec.ts`)
- Modify: `src/repositories/OfrecimientoRepository.ts` (`resolver`, ~línea 144) (+ `.spec.ts`)
- Modify: `src/services/planificacion/OfrecimientosService.ts` (`resolver`, ~línea 37) (+ `.spec.ts`)
- Modify: `src/controllers/planificacionController.ts` (`resolverOfrecimiento`, ~línea 217)

**Interfaces:**
- Produces:
  ```ts
  export interface IMarcaOfrecidaDTO { codigo: string; descripcion: string }
  // IResolverOfrecimientoDTO.marcas?: IMarcaOfrecidaDTO[]
  export function validarMarcasOfrecidas(marcas: unknown): IMarcaOfrecidaDTO[] | undefined
  // OfrecimientoRepository.resolver(ofrecimientoId, motivos, valoresPorMotivo, detalle?, marcas?)
  ```

- [ ] **Step 1: Tipo**

```ts
/** Marca que el vendedor declaró haber ofrecido en este ofrecimiento. Se persiste como
 *  fila de pl_ofrecimiento_alcance con tipo='marca' (spec 2026-09-16 §4). */
export interface IMarcaOfrecidaDTO {
    codigo: string
    descripcion: string
}

export interface IResolverOfrecimientoDTO {
    motivos: IOfrecimientoMotivo[]
    detalle?: unknown
    /** `undefined` = no se toca el alcance. `[]` = se borran las marcas ofrecidas.
     *  Reemplaza SOLO las filas de alcance tipo='marca'; el resto del alcance no se toca. */
    marcas?: IMarcaOfrecidaDTO[]
}
```

- [ ] **Step 2: Tests de validación**

Agregar al final de `ofrecimientoValidation.spec.ts` (respetando sus imports; sumar `validarMarcasOfrecidas`):

```ts
describe('validarMarcasOfrecidas', () => {
    it('undefined pasa como undefined', () => {
        expect(validarMarcasOfrecidas(undefined)).toBeUndefined()
    })
    it('lista válida se devuelve limpia', () => {
        expect(validarMarcasOfrecidas([{ codigo: ' B1 ', descripcion: 'FREMAX' }])).toEqual([
            { codigo: 'B1', descripcion: 'FREMAX' },
        ])
    })
    it('lista vacía pasa (borra las marcas)', () => {
        expect(validarMarcasOfrecidas([])).toEqual([])
    })
    it('rechaza lo que no es lista', () => {
        expect(() => validarMarcasOfrecidas('B1')).toThrow(CustomError)
    })
    it('rechaza item sin código o sin descripción', () => {
        expect(() => validarMarcasOfrecidas([{ codigo: '', descripcion: 'X' }])).toThrow(CustomError)
        expect(() => validarMarcasOfrecidas([{ codigo: 'B1', descripcion: '' }])).toThrow(CustomError)
    })
    it('rechaza códigos repetidos con MARCAS_DUPLICADAS', () => {
        try {
            validarMarcasOfrecidas([{ codigo: 'B1', descripcion: 'A' }, { codigo: 'B1', descripcion: 'B' }])
            fail('debía tirar')
        } catch (e) {
            expect((e as CustomError).details).toMatchObject({ code: 'MARCAS_DUPLICADAS' })
        }
    })
})
```

(Si `CustomError` guarda el `code` con otro nombre de propiedad, mirá cómo lo aserta el resto de ese spec y usá la misma forma.)

- [ ] **Step 3: Correr para verificar que falla**

Run: `npm test -- src/services/planificacion/ofrecimientoValidation.spec.ts`
Expected: FAIL, `validarMarcasOfrecidas` no exportada.

- [ ] **Step 4: Implementar la validación**

En `ofrecimientoValidation.ts`, importar `IMarcaOfrecidaDTO` y agregar:

```ts
/** Marcas ofrecidas (spec 2026-09-16 §4.2). Forma, no catálogo: el catálogo de marcas es
 *  "con venta en 12 meses" y puede excluir legítimamente una marca vieja que sí se ofreció. */
export function validarMarcasOfrecidas(marcas: unknown): IMarcaOfrecidaDTO[] | undefined {
    if (marcas === undefined) return undefined
    if (!Array.isArray(marcas)) {
        throw new CustomError(400, 'marcas debe ser una lista', { code: 'MARCAS_INVALIDAS' })
    }
    const limpias: IMarcaOfrecidaDTO[] = marcas.map(m => {
        if (!m || typeof m !== 'object') {
            throw new CustomError(400, 'Cada marca debe ser un objeto', { code: 'MARCAS_INVALIDAS' })
        }
        const { codigo, descripcion } = m as { codigo?: unknown; descripcion?: unknown }
        assertCodigo(codigo, descripcion)
        return { codigo: codigo.trim(), descripcion: (descripcion as string).trim() }
    })
    const codigos = new Set(limpias.map(m => m.codigo))
    if (codigos.size !== limpias.length) {
        throw new CustomError(400, 'Hay marcas repetidas', { code: 'MARCAS_DUPLICADAS' })
    }
    return limpias
}
```

`assertCodigo` ya valida código y descripción no vacíos y sus largos máximos; reusarlo.

- [ ] **Step 5: Correr los tests de validación**

Run: `npm test -- src/services/planificacion/ofrecimientoValidation.spec.ts`
Expected: PASS.

- [ ] **Step 6: Tests del repo**

En `OfrecimientoRepository.spec.ts`, dentro de `describe('resolver')`, agregar (ya existe `OfrecimientoAlcance` mockeado; declarar `const mockedAlcanceDestroy = OfrecimientoAlcance.destroy as jest.MockedFunction<typeof OfrecimientoAlcance.destroy>` y `mockedAlcanceBulkCreate` igual, junto a los demás mocks del archivo):

```ts
    it('sin `marcas` no toca el alcance', async () => {
        mockedMotivoDestroy.mockResolvedValue(0 as any)
        mockedMotivoBulkCreate.mockResolvedValue([] as any)
        mockedCampoDestroy.mockResolvedValue(0 as any)
        await OfrecimientoRepository.resolver(20, [], new Map())
        expect(mockedAlcanceDestroy).not.toHaveBeenCalled()
        expect(mockedAlcanceBulkCreate).not.toHaveBeenCalled()
    })

    it('con `marcas: []` borra SOLO el alcance tipo marca', async () => {
        mockedMotivoDestroy.mockResolvedValue(0 as any)
        mockedCampoDestroy.mockResolvedValue(0 as any)
        mockedAlcanceDestroy.mockResolvedValue(0 as any)
        await OfrecimientoRepository.resolver(20, [], new Map(), undefined, [])
        expect(mockedAlcanceDestroy).toHaveBeenCalledWith({ where: { ofrecimientoId: 20, tipo: 'marca' } })
        expect(mockedAlcanceBulkCreate).not.toHaveBeenCalled()
    })

    it('con marcas reemplaza las filas tipo marca', async () => {
        mockedMotivoDestroy.mockResolvedValue(0 as any)
        mockedCampoDestroy.mockResolvedValue(0 as any)
        mockedAlcanceDestroy.mockResolvedValue(0 as any)
        mockedAlcanceBulkCreate.mockResolvedValue([] as any)
        await OfrecimientoRepository.resolver(20, [], new Map(), undefined, [
            { codigo: 'B1', descripcion: 'FREMAX' },
            { codigo: 'B2', descripcion: 'CORVEN' },
        ])
        expect(mockedAlcanceDestroy).toHaveBeenCalledWith({ where: { ofrecimientoId: 20, tipo: 'marca' } })
        expect(mockedAlcanceBulkCreate).toHaveBeenCalledWith([
            { ofrecimientoId: 20, tipo: 'marca', codigo: 'B1', descripcion: 'FREMAX' },
            { ofrecimientoId: 20, tipo: 'marca', codigo: 'B2', descripcion: 'CORVEN' },
        ])
    })
```

- [ ] **Step 7: Implementar en el repo**

Firma y cuerpo de `resolver`:

```ts
    static async resolver(
        ofrecimientoId: number,
        motivos: IOfrecimientoMotivo[],
        valoresPorMotivo: Map<number, Record<string, string | number>>,
        detalle?: unknown,
        /** `undefined` = no tocar. Reemplaza SOLO las filas de alcance tipo='marca'
         *  (spec 2026-09-16 §4.2): el resto del alcance (rubro/línea/artículo) es del alta
         *  del ofrecimiento y no se edita desde acá. */
        marcas?: IMarcaOfrecidaDTO[],
    ): Promise<void> {
        try {
            if (detalle !== undefined) {
                await Ofrecimiento.update({ detalle }, { where: { id: ofrecimientoId } })
            }

            if (marcas !== undefined) {
                await OfrecimientoAlcance.destroy({ where: { ofrecimientoId, tipo: 'marca' } })
                if (marcas.length > 0) {
                    await OfrecimientoAlcance.bulkCreate(
                        marcas.map(m => ({
                            ofrecimientoId,
                            tipo: 'marca' as const,
                            codigo: m.codigo,
                            descripcion: m.descripcion,
                        })),
                    )
                }
            }

            // ... (motivos y campos, sin cambios)
```

Importar `IMarcaOfrecidaDTO` desde `../types/planificacion`.

- [ ] **Step 8: Correr tests del repo**

Run: `npm test -- src/repositories/OfrecimientoRepository.spec.ts`
Expected: PASS.

- [ ] **Step 9: Service y controller**

`OfrecimientosService.resolver`: después de `validarDetalleAccion(dto.detalle)`:

```ts
        const marcas = validarMarcasOfrecidas(dto.marcas)

        await OfrecimientoRepository.resolver(
            ofrecimientoId,
            dto.motivos,
            valoresPorMotivo,
            dto.detalle,
            marcas,
        )
```

Importar `validarMarcasOfrecidas` desde `./ofrecimientoValidation`.

En `OfrecimientosService.spec.ts`, en el test existente que verifica la llamada a `mockedResolver`, agregar un caso:

```ts
    it('pasa las marcas validadas al repositorio', async () => {
        // reusar el setup del test de resolver que ya existe en este archivo
        await OfrecimientosService.resolver(user, 1, 20, {
            motivos: [],
            marcas: [{ codigo: 'B1', descripcion: 'FREMAX' }],
        })
        expect(mockedResolver).toHaveBeenCalledWith(20, [], expect.any(Map), undefined, [
            { codigo: 'B1', descripcion: 'FREMAX' },
        ])
    })
```

(Adaptar `user`/`1`/`20` a los fixtures del archivo.)

`planificacionController.resolverOfrecimiento`: leer `marcas` del body y pasarlo tal cual (la forma la valida el service):

```ts
            const { motivos, detalle, marcas } = req.body as {
                motivos?: IOfrecimientoMotivo[]
                detalle?: unknown
                marcas?: unknown
            }
            // ...
            const result = await OfrecimientosService.resolver(req.user!, visitaId, ofrecimientoId, {
                motivos: normalizados,
                detalle,
                marcas: marcas as IMarcaOfrecidaDTO[] | undefined,
            })
```

- [ ] **Step 10: Correr todo lo de planificación y build**

Run: `npm test -- src/services/planificacion src/repositories/OfrecimientoRepository.spec.ts && npm run build`
Expected: PASS y build limpio.

- [ ] **Step 11: Commit**

```bash
git add src/types/planificacion.ts src/services/planificacion/ofrecimientoValidation.ts src/services/planificacion/ofrecimientoValidation.spec.ts src/repositories/OfrecimientoRepository.ts src/repositories/OfrecimientoRepository.spec.ts src/services/planificacion/OfrecimientosService.ts src/services/planificacion/OfrecimientosService.spec.ts src/controllers/planificacionController.ts
git commit -m "feat(planificacion): marcas ofrecidas en resolver, persistidas como alcance tipo marca"
```

---

### Task 6: Cromo etiqueta desde el alcance, con fallback a `detalle.marca`

**Files:**
- Modify: `src/services/crm/seguimientoTexto.ts` (`buildTagsDesdeRubros` ~línea 46, `marcaDelDetalle` ~línea 76)
- Modify: `src/services/crm/seguimientoTexto.spec.ts` (~línea 146 en adelante)

- [ ] **Step 1: Tests**

Junto a los tests existentes de marca (líneas ~146-170), agregar:

```ts
    it('etiqueta todas las marcas del alcance tipo marca', () => {
        const tags = buildTagsDesdeRubros(
            [
                ofrecimiento({
                    motivos: [{ motivoId: 10, valores: {} }],
                    alcance: [
                        { tipo: 'marca', codigo: 'B1', descripcion: 'FREMAX' },
                        { tipo: 'marca', codigo: 'B2', descripcion: 'CORVEN' },
                        { tipo: 'rubro', codigo: 'R1', descripcion: 'DISCOS' },
                    ],
                    detalle: { accion: null, marca: 'VIEJA' },
                }),
            ],
            catalogo,
        )
        expect(tags).toEqual(expect.arrayContaining(['FREMAX', 'CORVEN']))
        expect(tags).not.toContain('VIEJA')
        expect(tags).not.toContain('DISCOS')
    })

    it('sin marcas en el alcance cae a detalle.marca (filas anteriores al cambio)', () => {
        const tags = buildTagsDesdeRubros(
            [ofrecimiento({ motivos: [{ motivoId: 10, valores: {} }], alcance: [], detalle: { accion: null, marca: 'FRIC-ROT' } })],
            catalogo,
        )
        expect(tags).toContain('FRIC-ROT')
    })
```

(`ofrecimiento(...)` y `catalogo` son los helpers que ya usa ese spec; si se llaman distinto, usar los del archivo.)

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm test -- src/services/crm/seguimientoTexto.spec.ts`
Expected: el primer test nuevo FALLA (hoy etiqueta `VIEJA` y no `FREMAX`).

- [ ] **Step 3: Implementar**

Reemplazar el bloque `if (ETIQUETAR_MARCAS) {...}` por:

```ts
        if (ETIQUETAR_MARCAS) {
            for (const marca of marcasDelOfrecimiento(ofrecimiento)) tags.add(marca)
        }
```

Y debajo de `marcaDelDetalle`:

```ts
/** Las marcas que el vendedor declaró haber ofrecido: alcance tipo='marca' (spec
 *  2026-09-16 §4). Si no hay ninguna, cae a `detalle.marca`, donde las escribía el picker
 *  viejo — filas resueltas antes del cambio. El fallback se puede borrar cuando no quede
 *  ninguna visita abierta anterior al deploy. */
function marcasDelOfrecimiento(ofrecimiento: IOfrecimiento): string[] {
    const delAlcance = (ofrecimiento.alcance ?? [])
        .filter(a => a.tipo === 'marca')
        .map(a => a.descripcion.trim())
        .filter(d => d.length > 0)
    if (delAlcance.length > 0) return delAlcance
    const vieja = marcaDelDetalle(ofrecimiento.detalle)
    return vieja ? [vieja] : []
}
```

Actualizar el comentario de `marcaDelDetalle` para decir que es el fallback.

- [ ] **Step 4: Correr los tests**

Run: `npm test -- src/services/crm/seguimientoTexto.spec.ts`
Expected: PASS (los viejos de `detalle.marca` siguen pasando por el fallback).

- [ ] **Step 5: Commit**

```bash
git add src/services/crm/seguimientoTexto.ts src/services/crm/seguimientoTexto.spec.ts
git commit -m "feat(crm): etiquetar las marcas ofrecidas desde el alcance, con fallback a detalle.marca"
```

---

## Parte B — app-planificacion

### Task 7: Tipos y `getRubroStatus` sobre `client-context`

**Files:**
- Modify: `src/types/planificacion.ts` (`IRubroEstado` ~línea 312; borrar `IRubroClientsPeriodMetrics`, `IRubroClientsBreakdownItem`, `IRubroClientsEntity`, `IRubroClientsPageResponse` ~líneas 321-342; agregar `IMarcaOfrecida` junto a `IResolverOfrecimientoDTO` ~línea 394)
- Modify: `src/api/planificacion.ts` (`getRubroStatus` ~línea 193; import de tipos ~línea 23)
- Modify: `src/api/planificacion.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface IMarcaEstado { code: string; nombre: string; actual: number; mesAnterior: number; promedio6m: number; dejo: boolean }
  export interface IRubroEstado { rubroCode: string; nombre: string; actual: number; mesAnterior: number; promedio6m: number; marcas: IMarcaEstado[] }
  export interface IClientContextPeriod { amount: number; units: number }
  export interface IClientContextBrand { brandCode: string; brandName: string; totalsByPeriod: Record<'thisMonth'|'lastMonth'|'last6Months', IClientContextPeriod>; dropped: boolean }
  export interface IClientContextRubro { rubroCode: string; rubroDescription: string; totalsByPeriod: ...; brands: IClientContextBrand[] }
  export interface IClientContextResponse { particularCode: string; clientName: string; currentYM: string; rubros: IClientContextRubro[] }
  export interface IMarcaOfrecida { codigo: string; descripcion: string }
  // IResolverOfrecimientoDTO.marcas?: IMarcaOfrecida[]
  ```

- [ ] **Step 1: Tipos**

Reemplazar `IRubroEstado` y el bloque `IRubroClients*` por:

```ts
/** Una marca dentro de un rubro, con la misma forma que el rubro. `dejo`: tenía promedio
 *  y no compra hace dos meses (lo calcula el server, spec 2026-09-16 §3.3). */
export interface IMarcaEstado {
    code: string
    nombre: string
    actual: number
    mesAnterior: number
    promedio6m: number
    dejo: boolean
}

/** Fila de "cómo viene comprando el cliente": TODOS sus rubros con Actual/M.Ant/Prom.6M
 *  y las marcas anidadas. Sale de POST /sale/rubro/client-context. */
export interface IRubroEstado {
    rubroCode: string
    nombre: string
    actual: number
    mesAnterior: number
    /** Promedio mensual de los últimos 6 meses cerrados. */
    promedio6m: number
    /** [] cuando el rubro no tiene historial de marca. */
    marcas: IMarcaEstado[]
}

// ── Raw shape of POST /sale/rubro/client-context (ClientContextService, api-vendedores).
// Períodos crudos: last6Months es la SUMA de 6 meses cerrados, acá se divide. ──
export type ClientContextPeriodKey = 'thisMonth' | 'lastMonth' | 'last6Months'
export interface IClientContextPeriod {
    amount: number
    units: number
}
export interface IClientContextBrand {
    brandCode: string
    brandName: string
    totalsByPeriod: Record<ClientContextPeriodKey, IClientContextPeriod>
    dropped: boolean
}
export interface IClientContextRubro {
    rubroCode: string
    rubroDescription: string
    totalsByPeriod: Record<ClientContextPeriodKey, IClientContextPeriod>
    brands: IClientContextBrand[]
}
export interface IClientContextResponse {
    particularCode: string
    clientName: string
    currentYM: string
    rubros: IClientContextRubro[]
}
```

Y junto a `IResolverOfrecimientoDTO`:

```ts
/** Marca que el vendedor declaró haber ofrecido. Va al alcance del ofrecimiento
 *  (tipo='marca'). `codigo` = code del catálogo/warehouse, `descripcion` = nombre. */
export interface IMarcaOfrecida {
    codigo: string
    descripcion: string
}

export interface IResolverOfrecimientoDTO {
    motivos: IOfrecimientoMotivo[]
    /** `undefined` = no se toca lo guardado. `null` = se sacó la acción. */
    detalle?: IAccionComercial | null
    /** `undefined` = no se toca el alcance. `[]` = se borran las marcas ofrecidas. */
    marcas?: IMarcaOfrecida[]
}
```

- [ ] **Step 2: Test de `getRubroStatus`**

En `planificacion.test.ts`, importar `getRubroStatus` y agregar:

```ts
describe('getRubroStatus', () => {
    it('pega a client-context y mapea rubros con marcas, dividiendo last6Months por 6', async () => {
        ;(apiClient.post as Mock).mockResolvedValue({
            data: {
                ok: 1,
                data: {
                    particularCode: '07463',
                    clientName: 'X',
                    currentYM: '2026-09',
                    rubros: [
                        {
                            rubroCode: 'R1',
                            rubroDescription: 'DISCOS, CAMP',
                            totalsByPeriod: {
                                thisMonth: { amount: 0, units: 0 },
                                lastMonth: { amount: 54, units: 1 },
                                last6Months: { amount: 498, units: 9 },
                            },
                            brands: [
                                {
                                    brandCode: 'B1',
                                    brandName: 'FREMAX',
                                    totalsByPeriod: {
                                        thisMonth: { amount: 0, units: 0 },
                                        lastMonth: { amount: 54, units: 1 },
                                        last6Months: { amount: 366, units: 6 },
                                    },
                                    dropped: false,
                                },
                                {
                                    brandCode: 'B2',
                                    brandName: 'CORVEN',
                                    totalsByPeriod: {
                                        thisMonth: { amount: 0, units: 0 },
                                        lastMonth: { amount: 0, units: 0 },
                                        last6Months: { amount: 132, units: 3 },
                                    },
                                    dropped: true,
                                },
                            ],
                        },
                    ],
                },
            },
        })

        const out = await getRubroStatus('07463')

        expect(apiClient.post).toHaveBeenCalledWith('/sale/rubro/client-context', { particularCode: '07463' })
        expect(out).toEqual([
            {
                rubroCode: 'R1',
                nombre: 'DISCOS, CAMP',
                actual: 0,
                mesAnterior: 54,
                promedio6m: 83,
                marcas: [
                    { code: 'B1', nombre: 'FREMAX', actual: 0, mesAnterior: 54, promedio6m: 61, dejo: false },
                    { code: 'B2', nombre: 'CORVEN', actual: 0, mesAnterior: 0, promedio6m: 22, dejo: true },
                ],
            },
        ])
    })

    it('rubro sin marcas → marcas: []', async () => {
        ;(apiClient.post as Mock).mockResolvedValue({
            data: { ok: 1, data: { particularCode: '1', clientName: '', currentYM: '2026-09', rubros: [
                { rubroCode: 'R9', rubroDescription: 'X', totalsByPeriod: { thisMonth: { amount: 1, units: 0 }, lastMonth: { amount: 0, units: 0 }, last6Months: { amount: 0, units: 0 } }, brands: [] },
            ] } },
        })
        const out = await getRubroStatus('1')
        expect(out[0].marcas).toEqual([])
    })
})
```

- [ ] **Step 3: Correr para verificar que falla**

Run: `npm test -- src/api/planificacion.test.ts`
Expected: FAIL (hoy pega a `/sale/rubro/clients`).

- [ ] **Step 4: Implementar**

```ts
/** "Cómo viene comprando" para la propuesta y la visita: TODOS los rubros del cliente con
 *  Actual/M.Ant/Prom.6M y sus marcas anidadas. Pega a client-context (dominio sale), que
 *  reemplaza al uso del listado paginado de Versus con `search` por código. Los períodos
 *  vienen crudos: last6Months es suma, acá se divide por 6. */
export const getRubroStatus = async (
    codigoParticularCliente: string,
): Promise<IRubroEstado[]> => {
    const res = await apiClient.post('/sale/rubro/client-context', {
        particularCode: codigoParticularCliente,
    })
    const data: IClientContextResponse = res.data.data ?? res.data

    const tresNumeros = (t: IClientContextRubro['totalsByPeriod']) => ({
        actual: t.thisMonth?.amount ?? 0,
        mesAnterior: t.lastMonth?.amount ?? 0,
        promedio6m: (t.last6Months?.amount ?? 0) / 6,
    })

    return (data.rubros ?? []).map(r => ({
        rubroCode: r.rubroCode,
        nombre: r.rubroDescription,
        ...tresNumeros(r.totalsByPeriod),
        marcas: (r.brands ?? []).map(b => ({
            code: b.brandCode,
            nombre: b.brandName,
            ...tresNumeros(b.totalsByPeriod),
            dejo: b.dropped === true,
        })),
    }))
}
```

Actualizar el import de tipos (quitar `IRubroClientsPageResponse`, sumar `IClientContextResponse`, `IClientContextRubro`).

- [ ] **Step 5: Tests y typecheck**

Run: `npm test -- src/api/planificacion.test.ts && npx tsc -b`
Expected: PASS. El `tsc` va a fallar en `filas.ts`/tests que construyen `IRubroEstado` sin `marcas` — es esperado y se arregla en la Task 8. Si falla en otro lado, arreglar ahí.

- [ ] **Step 6: Commit**

```bash
git add src/types/planificacion.ts src/api/planificacion.ts src/api/planificacion.test.ts
git commit -m "feat(api): getRubroStatus sobre /sale/rubro/client-context con marcas por rubro"
```

---

### Task 8: `marcas` en `IOfrecimientoFila` (`filas.ts`)

**Files:**
- Modify: `src/components/propuesta/filas.ts`
- Modify: `src/components/propuesta/filas.test.ts` (helper `estado`, ~línea 16)
- Modify: `src/components/propuesta/OfrecimientoTable.test.tsx` (helper `fila`, ~línea 6) y cualquier otro test que construya `IRubroEstado`/`IOfrecimientoFila` (`PropuestaSheet.test.tsx`, `VisitaSheet.test.tsx`: buscar `promedio6m:` y sumar `marcas: []`)

**Interfaces:**
- Produces: `IOfrecimientoFila.marcas: IMarcaEstado[]`.

- [ ] **Step 1: Tests**

En `filas.test.ts`, el helper `estado` suma `marcas: []`. Agregar:

```ts
const marcaFremax = { code: 'B1', nombre: 'FREMAX', actual: 0, mesAnterior: 54, promedio6m: 61, dejo: false }

describe('marcas en la fila', () => {
    it('construirFilasPropuesta pasa las marcas del rubroStatus a la fila destacada y a las del catálogo', () => {
        const filas = construirFilasPropuesta(
            [propuesta({ rubroCode: 'R1' })],
            [estado({ rubroCode: 'R1', marcas: [marcaFremax] }), estado({ rubroCode: 'R2', nombre: 'Filtros', marcas: [] })],
            true,
        )
        expect(filas[0].marcas).toEqual([marcaFremax])
        expect(filas[1].marcas).toEqual([])
    })

    it('un rubro de la propuesta sin rubroStatus lleva marcas: []', () => {
        const filas = construirFilasPropuesta([propuesta({ rubroCode: 'R1' })], [], false)
        expect(filas[0].marcas).toEqual([])
    })

    it('construirFilasVisita pasa las marcas al ofrecimiento tipo rubro y [] a los demás tipos', () => {
        const filas = construirFilasVisita(
            [
                { id: 1, resolucionId: 1, tipo: 'rubro', codigo: 'R1', descripcion: 'A', gapUnits: null, esPropuesto: true, resuelto: false, motivos: [], alcance: [] },
                { id: 2, resolucionId: 1, tipo: 'accion', codigo: 'CUPO', descripcion: 'Plan cupo', gapUnits: null, esPropuesto: false, resuelto: false, motivos: [], alcance: [] },
            ],
            [estado({ rubroCode: 'R1', marcas: [marcaFremax] })],
            {},
            false,
            true,
        )
        expect(filas[0].marcas).toEqual([marcaFremax])
        expect(filas[1].marcas).toEqual([])
    })
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm test -- src/components/propuesta/filas.test.ts`
Expected: FAIL (`marcas` undefined).

- [ ] **Step 3: Implementar**

En `IOfrecimientoFila` agregar `marcas: IMarcaEstado[]` (importar `IMarcaEstado`), con comentario: `/** Marcas que el cliente compra en este rubro (contexto vivo, no se congela). [] para tipos que no son rubro. */`. En los cuatro `map` de `construirFilasPropuesta` / `construirFilasVisita`:

- bloque arriba propuesta: `marcas: s?.marcas ?? []`
- bloque abajo propuesta: `marcas: s.marcas`
- bloque arriba visita: `marcas: r.tipo === 'rubro' ? (s?.marcas ?? []) : []`
- bloque abajo visita: `marcas: s.marcas`

- [ ] **Step 4: Arreglar los fixtures de tests que construyen `IRubroEstado` / `IOfrecimientoFila`**

`OfrecimientoTable.test.tsx` helper `fila`: sumar `marcas: []`. Buscar en `src` con `grep -rn "promedio6m:" src --include=*.test.tsx --include=*.test.ts` y sumar `marcas: []` donde falte.

- [ ] **Step 5: Tests y typecheck**

Run: `npm test -- src/components/propuesta && npx tsc -b`
Expected: PASS, sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add src/components/propuesta/filas.ts src/components/propuesta/filas.test.ts src/components/propuesta/OfrecimientoTable.test.tsx
git commit -m "feat(propuesta): las filas llevan las marcas del rubro"
```

(Sumar al `git add` los otros tests tocados.)

---

### Task 9: Dos zonas en la fila y sub-filas de marca (`OfrecimientoTable`)

**Files:**
- Modify: `src/components/propuesta/OfrecimientoTable.tsx`
- Modify: `src/components/propuesta/OfrecimientoTable.test.tsx`

**Interfaces:**
- Consumes: `IOfrecimientoFila.marcas` (Task 8).
- Produces (comportamiento): en filas con `resolucion`, `button[aria-label="Resolución de X"]` = chip + nombre; `button[aria-label="Marcas de X"]` = las tres celdas, `aria-expanded`. En filas destacadas sin `resolucion` ni `agregable` (modo propuesta) con marcas, toda la fila es `button[aria-label="Marcas de X"]`. Sub-filas `role="row"` con `data-marca`. Estado `abiertaCodigo: string | null` en `OfrecimientoTable` (una sola abierta).

- [ ] **Step 1: Tests**

Agregar a `OfrecimientoTable.test.tsx`:

```ts
const fremax = { code: 'B1', nombre: 'FREMAX', actual: 0, mesAnterior: 54_000, promedio6m: 61_000, dejo: false }
const corven = { code: 'B2', nombre: 'CORVEN', actual: 0, mesAnterior: 0, promedio6m: 22_000, dejo: true }
const marcas5 = [fremax, corven, { ...fremax, code: 'B3', nombre: 'M3' }, { ...fremax, code: 'B4', nombre: 'M4' }, { ...fremax, code: 'B5', nombre: 'M5' }]
const resol = { ofrecimientoId: 7, motivosCargados: 0, completo: false, esPropuesto: true }

describe('dos zonas en la fila de la visita', () => {
    it('tocar el nombre abre la resolución y NO despliega', () => {
        const onResolucion = vi.fn()
        render(<OfrecimientoTable filas={[fila({ resolucion: resol, marcas: [fremax] })]} onResolucion={onResolucion} />)
        fireEvent.click(screen.getByRole('button', { name: 'Resolución de Amortiguadores' }))
        expect(onResolucion).toHaveBeenCalledWith(7)
        expect(screen.queryByText('FREMAX')).not.toBeInTheDocument()
    })

    it('tocar los números despliega las marcas con sus tres números y NO abre la resolución', () => {
        const onResolucion = vi.fn()
        render(<OfrecimientoTable filas={[fila({ resolucion: resol, marcas: [fremax, corven] })]} onResolucion={onResolucion} />)
        const zona = screen.getByRole('button', { name: 'Marcas de Amortiguadores' })
        expect(zona).toHaveAttribute('aria-expanded', 'false')
        fireEvent.click(zona)
        expect(onResolucion).not.toHaveBeenCalled()
        expect(zona).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByText('FREMAX')).toBeInTheDocument()
        expect(screen.getByText('CORVEN')).toBeInTheDocument()
        expect(screen.getByText('61')).toBeInTheDocument()
        expect(screen.getByText(/dejó/i)).toBeInTheDocument()
    })

    it('tocar de nuevo cierra', () => {
        render(<OfrecimientoTable filas={[fila({ resolucion: resol, marcas: [fremax] })]} />)
        const zona = screen.getByRole('button', { name: 'Marcas de Amortiguadores' })
        fireEvent.click(zona)
        fireEvent.click(zona)
        expect(screen.queryByText('FREMAX')).not.toBeInTheDocument()
    })

    it('una sola abierta a la vez', () => {
        render(
            <OfrecimientoTable
                filas={[
                    fila({ codigo: 'R1', resolucion: resol, marcas: [fremax] }),
                    fila({ codigo: 'R2', nombre: 'Filtros', resolucion: { ...resol, ofrecimientoId: 8 }, marcas: [corven] }),
                ]}
            />,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Marcas de Amortiguadores' }))
        fireEvent.click(screen.getByRole('button', { name: 'Marcas de Filtros' }))
        expect(screen.queryByText('FREMAX')).not.toBeInTheDocument()
        expect(screen.getByText('CORVEN')).toBeInTheDocument()
    })

    it('sin marcas, la zona de números no es un botón', () => {
        render(<OfrecimientoTable filas={[fila({ resolucion: resol, marcas: [] })]} />)
        expect(screen.queryByRole('button', { name: 'Marcas de Amortiguadores' })).not.toBeInTheDocument()
    })

    it('muestra hasta 3 marcas y colapsa el resto en "+N marcas más"', () => {
        render(<OfrecimientoTable filas={[fila({ resolucion: resol, marcas: marcas5 })]} />)
        fireEvent.click(screen.getByRole('button', { name: 'Marcas de Amortiguadores' }))
        expect(screen.getByText('FREMAX')).toBeInTheDocument()
        expect(screen.getByText('M3')).toBeInTheDocument()
        expect(screen.queryByText('M4')).not.toBeInTheDocument()
        expect(screen.getByText('+2 marcas más')).toBeInTheDocument()
    })

    it('las filas del catálogo (agregable) no se parten: toda la fila agrega', () => {
        const onAgregar = vi.fn()
        render(<OfrecimientoTable filas={[fila({ resolucion: resol, marcas: [] }), fila({ codigo: 'R2', nombre: 'Filtros', destacada: false, agregable: true, marcas: [fremax] })]} onAgregar={onAgregar} />)
        expect(screen.queryByRole('button', { name: 'Marcas de Filtros' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Agregar Filtros' }))
        expect(onAgregar).toHaveBeenCalledWith('R2')
    })

    it('en la propuesta (sin resolucion) toda la fila despliega', () => {
        render(<OfrecimientoTable filas={[fila({ marcas: [fremax] })]} />)
        fireEvent.click(screen.getByRole('button', { name: 'Marcas de Amortiguadores' }))
        expect(screen.getByText('FREMAX')).toBeInTheDocument()
    })

    it('la banda explica las dos acciones', () => {
        render(<OfrecimientoTable filas={[fila({ resolucion: resol, marcas: [] })]} />)
        expect(screen.getByText(/tocá el rubro para cargar el resultado/i)).toBeInTheDocument()
        expect(screen.getByText(/los números, para ver sus marcas/i)).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm test -- src/components/propuesta/OfrecimientoTable.test.tsx`
Expected: FAIL en los nuevos.

- [ ] **Step 3: Implementar**

Cambios en `OfrecimientoTable.tsx`:

1. **Estado de despliegue** en `OfrecimientoTable`: `const [abiertaCodigo, setAbiertaCodigo] = useState<string | null>(null)`; `function toggleMarcas(codigo: string) { setAbiertaCodigo(prev => (prev === codigo ? null : codigo)) }`. Pasar `abierta={abiertaCodigo === fila.codigo}` y `onToggleMarcas={toggleMarcas}` a cada `FilaOfrecimiento` del bloque de arriba y del de abajo (en el de abajo sólo se usa cuando la fila no es agregable, ver 3).

2. **`FilaOfrecimiento`** recibe `abierta: boolean` y `onToggleMarcas: (codigo: string) => void`. Define:

```ts
    const tieneMarcas = fila.tipo === 'rubro' && fila.marcas.length > 0
    // Dos zonas SOLO en la fila resoluble: la izquierda carga, la derecha despliega. Una fila
    // agregable no se parte (toda la fila agrega). Una fila de la propuesta previa (ni
    // resoluble ni agregable) despliega con toda la fila: ahí no hay otra acción que compita.
    const dosZonas = !!resolucion && tieneMarcas
    const filaEnteraDespliega = !resolucion && !fila.agregable && tieneMarcas
```

3. **Separar `ContenidoFila` en dos**: `NombreFila` (el `div.min-w-0.flex-1` con nombre, chip de tipo, alcance y detalle) y `CeldasFila` (las tres `Celda`, o nada si `tipo !== 'rubro'`). Render de la fila:

```tsx
    const zonaNumeros = (
        <>
            <CeldasFila fila={fila} abierta={abierta} />
        </>
    )

    return (
        <div className={conBorde ? 'border-b border-dsline' : ''}>
            <div className="flex items-stretch">
                {dosZonas ? (
                    <>
                        <button type="button" aria-label={`Resolución de ${fila.nombre}`} disabled={agregando}
                            onClick={() => onResolucion?.(resolucion!.ofrecimientoId)}
                            className="flex min-w-0 flex-1 items-center gap-1 py-2 pl-2.5 text-left active:bg-[#F7F8FB]">
                            {chip}
                            <NombreFila fila={fila} />
                        </button>
                        <button type="button" aria-label={`Marcas de ${fila.nombre}`} aria-expanded={abierta}
                            onClick={() => onToggleMarcas(fila.codigo)}
                            className={`flex shrink-0 items-center gap-1 py-2 pr-1.5 ${abierta ? 'bg-[#EEF3FB]' : 'active:bg-[#F7F8FB]'}`}>
                            {zonaNumeros}
                        </button>
                    </>
                ) : filaEnteraDespliega ? (
                    <button type="button" aria-label={`Marcas de ${fila.nombre}`} aria-expanded={abierta}
                        onClick={() => onToggleMarcas(fila.codigo)}
                        className={`${clasesFila} ${abierta ? 'bg-[#EEF3FB]' : 'active:bg-[#F7F8FB]'}`}>
                        {chip}<NombreFila fila={fila} />{zonaNumeros}
                    </button>
                ) : resolucion || fila.agregable ? (
                    /* botón único, como hoy */
                ) : (
                    <div className={clasesFila}>{chip}<NombreFila fila={fila} />{zonaNumeros}</div>
                )}
                {/* columna quitar: sin cambios */}
            </div>
            {abierta && tieneMarcas && <SubFilasMarcas marcas={fila.marcas} conChip={conChip} conColumnaQuitar={conColumnaQuitar} />}
        </div>
    )
```

Donde `chip` es el bloque `conChip && (...)` que hoy vive dentro de `interior`. `Celda` recibe un prop opcional `abierta` que cambia el fondo de la pastilla a `bg-white` cuando la zona está abierta (spec §5.1).

4. **`SubFilasMarcas`**:

```tsx
const MAX_SUBFILAS = 3

function SubFilasMarcas({ marcas, conChip, conColumnaQuitar }: { marcas: IMarcaEstado[]; conChip: boolean; conColumnaQuitar: boolean }) {
    const visibles = marcas.slice(0, MAX_SUBFILAS)
    const ocultas = marcas.length - visibles.length
    return (
        <div className="bg-[#F7F8FB]">
            {visibles.map((m, i) => (
                <div key={m.code} role="row" data-marca={m.code} className="flex min-h-[30px] items-center gap-1 pl-2.5 pr-1.5 text-[11.5px] font-semibold text-[#3B4761]">
                    {conChip && (
                        <div className={`${ANCHO_CHIP} flex justify-center`}>
                            <span aria-hidden className={`h-[13px] w-[3px] rounded-sm ${i === 0 ? 'bg-dsnavy' : 'bg-[#C9D2E3]'}`} />
                        </div>
                    )}
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="min-w-0 truncate">{m.nombre}</span>
                        {m.dejo && (
                            <span className="shrink-0 rounded px-1 text-[8.5px] font-extrabold uppercase leading-[14px] text-dsred bg-[#FDECEA]">dejó</span>
                        )}
                    </div>
                    <Celda valor={m.actual} promedio6m={m.promedio6m} compacta />
                    <Celda valor={m.mesAnterior} promedio6m={m.promedio6m} ocultaEnAngosto compacta />
                    <Celda valor={m.promedio6m} promedio6m={m.promedio6m} referencia compacta />
                    {conColumnaQuitar && <div className={ANCHO_QUITAR} />}
                </div>
            ))}
            {ocultas > 0 && (
                <div className="py-1.5 pl-[42px] text-[11px] font-semibold text-[#8A93A6]">+{ocultas} marcas más</div>
            )}
        </div>
    )
}
```

`Celda` gana `compacta?: boolean` → pastilla `text-[10.5px] px-1 py-0`. Sin chip, el `pl-[42px]` del "+N" pasa a `pl-2.5`: usar `conChip ? 'pl-[42px]' : 'pl-2.5'`.

5. **Banda**: reemplazar el texto por:

```tsx
            <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-wide text-dsmuted leading-[1.35]">
                Tu propuesta · tocá el rubro para cargar el resultado{' '}
                <span className="text-[#8A93A6]">· los números, para ver sus marcas</span>
            </p>
```

Actualizar el comentario de la banda (la gramática "dos bandas, verbos opuestos" sigue valiendo; ahora la de arriba nombra dos gestos).

6. Cuando `abiertaCodigo` apunta a una fila que ya no está en `filas` (se filtró o se quitó), no pasa nada: el estado se ignora. No hace falta efecto.

- [ ] **Step 4: Correr los tests**

Run: `npm test -- src/components/propuesta/OfrecimientoTable.test.tsx`
Expected: PASS (nuevos y viejos). Si un test viejo buscaba `Resolución de X` y tocaba toda la fila, sigue funcionando: el nombre sigue siendo ese botón.

- [ ] **Step 5: Commit**

```bash
git add src/components/propuesta/OfrecimientoTable.tsx src/components/propuesta/OfrecimientoTable.test.tsx
git commit -m "feat(propuesta): la fila se parte en dos zonas — el nombre carga, los números despliegan las marcas"
```

---

### Task 10: Layout al borde, sin caja, columnas de 48px

**Files:**
- Modify: `src/components/propuesta/OfrecimientoTable.tsx`

Sólo visual; los tests de la Task 9 tienen que seguir pasando. Verificación manual en el navegador a 360 y 320px (Chrome DevTools, device toolbar).

- [ ] **Step 1: Columnas**

`const ANCHO_NUMERICA = 'w-[48px] shrink-0'`. En `Celda`, la pastilla pasa de `px-1.5 py-0.5 text-[12.5px]` a `px-1 py-0.5 text-[12px] tracking-[-0.01em]`. Actualizar el comentario de `OCULTA_ANGOSTO_*` ("esos 54px" → "esos 48px").

- [ ] **Step 2: Al borde y sin caja**

El `BottomSheet` da `px-[18px]`; la tabla lo compensa con margen negativo para quedar a 12px del borde, sin tocar el sheet (lo usan otras pantallas). Envolver la tabla principal (el `div.w-full.rounded-xl.border` y la banda de arriba) en:

```tsx
        <div className="-mx-1.5">
```

Y la tabla: `<div className="w-full">` (sin `rounded-xl border border-dsline`). El header sticky pierde `rounded-t-[11px]` y gana `border-t border-dsline`. Las filas mantienen `border-b border-dsline`. La banda de "Otros rubros" (sticky) mantiene `border-y`. Los `SegmentoOfrecimientos` (Acciones/Marcas) no cambian.

El padding izquierdo de fila (`pl-2.5`) se mantiene: con el `-mx-1.5` el contenido arranca a 18−6+10 = 22px del borde del sheet, y el texto de la banda a 12px. Si en el navegador la banda y las filas no quedan alineadas a gusto, ajustar `pl` de la fila y de la banda juntos.

- [ ] **Step 3: Verificar**

Run: `npm test -- src/components/propuesta && npx tsc -b`
Expected: PASS.

Manual: `npm run dev`, abrir una visita con propuesta, a 360 y a 320: `KIT DISTRIBUCION` y `CRAPODINAS, ACOPLES` enteros a 360; `$ 1.664` entra en su celda en el catálogo; a 320 desaparece M.Ant en header, celdas y sub-filas a la vez.

- [ ] **Step 4: Commit**

```bash
git add src/components/propuesta/OfrecimientoTable.tsx
git commit -m "feat(propuesta): tabla al borde, sin caja, columnas de 48px"
```

---

### Task 11: Borrador de marcas ofrecidas y `PUT` con `marcas`

**Files:**
- Modify: `src/lib/resolucionDraft.ts` (+ `resolucionDraft.test.ts`)
- Modify: `src/hooks/useOfrecimientos.ts` (`IResolverOfrecimientosItem` ~línea 42; `useResolverOfrecimientos` ~línea 72)

**Interfaces:**
- Produces:
  ```ts
  export type BorradorMarcas = Record<number, IMarcaOfrecida[]>
  export function leerMarcasOfrecidas(visitaId: number): BorradorMarcas | null
  export function guardarMarcasOfrecidas(visitaId: number, marcas: BorradorMarcas): void
  export function limpiarMarcasOfrecidas(visitaId: number): void
  // IResolverOfrecimientosItem.marcas?: IMarcaOfrecida[]
  ```

- [ ] **Step 1: Tests del draft**

En `resolucionDraft.test.ts`, siguiendo el patrón de los tests de `detalles`:

```ts
describe('marcas ofrecidas', () => {
    beforeEach(() => localStorage.clear())
    it('null sin nada guardado', () => {
        expect(leerMarcasOfrecidas(5)).toBeNull()
    })
    it('guarda y lee por visita', () => {
        guardarMarcasOfrecidas(5, { 7: [{ codigo: 'B1', descripcion: 'FREMAX' }] })
        expect(leerMarcasOfrecidas(5)).toEqual({ 7: [{ codigo: 'B1', descripcion: 'FREMAX' }] })
        expect(leerMarcasOfrecidas(6)).toBeNull()
    })
    it('limpiar borra la clave', () => {
        guardarMarcasOfrecidas(5, { 7: [] })
        limpiarMarcasOfrecidas(5)
        expect(leerMarcasOfrecidas(5)).toBeNull()
    })
    it('JSON roto → null', () => {
        localStorage.setItem('visita-marcas-5', '{nope')
        expect(leerMarcasOfrecidas(5)).toBeNull()
    })
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm test -- src/lib/resolucionDraft.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `resolucionDraft.ts`, importar `IMarcaOfrecida` y agregar debajo de `limpiarDetalles`:

```ts
/** Marcas ofrecidas por ofrecimientoId (spec 2026-09-16 §5.2). Clave propia por la misma
 *  razón que `detalles`: no romper la forma del borrador de motivos ya guardado. */
export type BorradorMarcas = Record<number, IMarcaOfrecida[]>

function keyMarcas(visitaId: number): string {
    return `visita-marcas-${visitaId}`
}

export function leerMarcasOfrecidas(visitaId: number): BorradorMarcas | null {
    const raw = localStorage.getItem(keyMarcas(visitaId))
    if (raw == null) return null
    try {
        return JSON.parse(raw) as BorradorMarcas
    } catch {
        return null
    }
}

export function guardarMarcasOfrecidas(visitaId: number, marcas: BorradorMarcas): void {
    localStorage.setItem(keyMarcas(visitaId), JSON.stringify(marcas))
}

export function limpiarMarcasOfrecidas(visitaId: number): void {
    localStorage.removeItem(keyMarcas(visitaId))
}
```

En `useOfrecimientos.ts`: `IResolverOfrecimientosItem` suma `marcas?: IMarcaOfrecida[]`, y en `useResolverOfrecimientos` el DTO suma `...(item.marcas !== undefined ? { marcas: item.marcas } : {})`.

- [ ] **Step 4: Tests y typecheck**

Run: `npm test -- src/lib/resolucionDraft.test.ts src/hooks && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolucionDraft.ts src/lib/resolucionDraft.test.ts src/hooks/useOfrecimientos.ts
git commit -m "feat(visita): borrador local de marcas ofrecidas y marcas en el PUT de resolver"
```

---

### Task 12: `MarcasOfrecidasChips` reemplaza a `MarcaOfrecimientoPicker`

**Files:**
- Create: `src/components/propuesta/MarcasOfrecidasChips.tsx`
- Create: `src/components/propuesta/MarcasOfrecidasChips.test.tsx`
- Delete: `src/components/propuesta/MarcaOfrecimientoPicker.tsx`, `src/components/propuesta/MarcaOfrecimientoPicker.test.tsx`
- Modify: `src/components/propuesta/ResolucionOfrecimiento.tsx` (props `accion`/`onChangeAccion` siguen para `detalle.accion`; se suman las de marcas)
- Modify: `src/components/propuesta/ResolucionOfrecimiento.test.tsx`

**Interfaces:**
- Produces:
  ```tsx
  interface MarcasOfrecidasChipsProps {
      marcasDelRubro: IMarcaEstado[]          // desglose del cliente en este rubro
      catalogo: ICatalogoItem[]               // GET /sale/brand/catalog
      catalogoLoading?: boolean
      value: IMarcaOfrecida[]
      onChange: (marcas: IMarcaOfrecida[]) => void
      rubrosRestantes?: number
      onAplicarATodos?: () => void
  }
  export default function MarcasOfrecidasChips(props): JSX.Element
  ```
  `ResolucionOfrecimiento` gana `marcasDelRubro: IMarcaEstado[]`, `marcasOfrecidas: IMarcaOfrecida[]`, `onChangeMarcasOfrecidas: (m: IMarcaOfrecida[]) => void`; **pierde** `onAplicarMarca` (pasa a `onAplicarMarcas`). `accion`/`onChangeAccion` quedan (acción comercial), pero el componente ya no escribe `marca` en el detalle.

- [ ] **Step 1: Tests del componente nuevo**

```tsx
// src/components/propuesta/MarcasOfrecidasChips.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import MarcasOfrecidasChips from './MarcasOfrecidasChips'

const fremax = { code: 'B1', nombre: 'FREMAX', actual: 0, mesAnterior: 54, promedio6m: 61, dejo: false }
const corven = { code: 'B2', nombre: 'CORVEN', actual: 0, mesAnterior: 0, promedio6m: 22, dejo: true }
const catalogo = [{ code: 'B1', description: 'FREMAX' }, { code: 'B9', description: 'SKF' }]

function setup(over: Partial<React.ComponentProps<typeof MarcasOfrecidasChips>> = {}) {
    const onChange = vi.fn()
    render(
        <MarcasOfrecidasChips marcasDelRubro={[fremax, corven]} catalogo={catalogo} value={[]} onChange={onChange} {...over} />,
    )
    return { onChange }
}

it('muestra un chip por marca del rubro con su sufijo, y "+ Otra"', () => {
    setup()
    expect(screen.getByRole('button', { name: /FREMAX/ })).toHaveTextContent(/compra/i)
    expect(screen.getByRole('button', { name: /CORVEN/ })).toHaveTextContent(/dejó/i)
    expect(screen.getByRole('button', { name: /otra/i })).toBeInTheDocument()
    expect(screen.getByText(/qué marca ofreciste/i)).toBeInTheDocument()
    expect(screen.getByText(/opcional/i)).toBeInTheDocument()
})

it('tocar un chip lo agrega; tocarlo de nuevo lo saca', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: /FREMAX/ }))
    expect(onChange).toHaveBeenCalledWith([{ codigo: 'B1', descripcion: 'FREMAX' }])
})

it('con la marca ya elegida, tocarla la quita', () => {
    const { onChange } = setup({ value: [{ codigo: 'B1', descripcion: 'FREMAX' }] })
    expect(screen.getByRole('button', { name: /FREMAX/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /FREMAX/ }))
    expect(onChange).toHaveBeenCalledWith([])
})

it('multi-selección: suma sin pisar', () => {
    const { onChange } = setup({ value: [{ codigo: 'B1', descripcion: 'FREMAX' }] })
    fireEvent.click(screen.getByRole('button', { name: /CORVEN/ }))
    expect(onChange).toHaveBeenCalledWith([
        { codigo: 'B1', descripcion: 'FREMAX' },
        { codigo: 'B2', descripcion: 'CORVEN' },
    ])
})

it('"+ Otra" abre el catálogo y la elegida se suma como chip; no duplica', () => {
    const { onChange } = setup({ value: [{ codigo: 'B1', descripcion: 'FREMAX' }] })
    fireEvent.click(screen.getByRole('button', { name: /otra/i }))
    fireEvent.click(screen.getByText('SKF'))
    expect(onChange).toHaveBeenCalledWith([
        { codigo: 'B1', descripcion: 'FREMAX' },
        { codigo: 'B9', descripcion: 'SKF' },
    ])
})

it('una marca elegida que no está en el desglose se muestra igual como chip', () => {
    setup({ value: [{ codigo: 'B9', descripcion: 'SKF' }] })
    expect(screen.getByRole('button', { name: /SKF/ })).toHaveAttribute('aria-pressed', 'true')
})

it('sin marcas del rubro, sólo "+ Otra"', () => {
    setup({ marcasDelRubro: [] })
    expect(screen.queryByRole('button', { name: /FREMAX/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /otra/i })).toBeInTheDocument()
})

it('"Aplicar a restantes" sólo con algo tildado y restantes > 0, y dispara una vez', () => {
    const onAplicarATodos = vi.fn()
    setup({ value: [], rubrosRestantes: 2, onAplicarATodos })
    expect(screen.queryByText(/aplicar a restantes/i)).not.toBeInTheDocument()
})

it('"Aplicar a restantes" con marca tildada', () => {
    const onAplicarATodos = vi.fn()
    setup({ value: [{ codigo: 'B1', descripcion: 'FREMAX' }], rubrosRestantes: 2, onAplicarATodos })
    fireEvent.click(screen.getByLabelText(/aplicar a restantes/i))
    expect(onAplicarATodos).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm test -- src/components/propuesta/MarcasOfrecidasChips.test.tsx`
Expected: FAIL, módulo no existe.

- [ ] **Step 3: Implementar el componente**

```tsx
// src/components/propuesta/MarcasOfrecidasChips.tsx
import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import CatalogoPicker from './CatalogoPicker'
import type { ICatalogoItem, IMarcaEstado, IMarcaOfrecida } from '@/types/planificacion'

interface MarcasOfrecidasChipsProps {
    /** Las marcas que el cliente compra en este rubro (el mismo desglose de la tabla). */
    marcasDelRubro: IMarcaEstado[]
    /** Catálogo completo, para "+ Otra". */
    catalogo: ICatalogoItem[]
    catalogoLoading?: boolean
    value: IMarcaOfrecida[]
    onChange: (marcas: IMarcaOfrecida[]) => void
    /** Cuántos rubros quedan además de este. 0 = no se ofrece "Aplicar a restantes". */
    rubrosRestantes?: number
    /** Copia las marcas tildadas a los rubros restantes sin marcas — una sola vez. */
    onAplicarATodos?: () => void
}

/** "¿Qué marca ofreciste?" — chips multi-selección precargados con el desglose del rubro
 *  (spec 2026-09-16 §5.2). Reemplaza al select de una sola marca que escribía
 *  `detalle.marca`: lo que se elige acá va al alcance del ofrecimiento (tipo='marca').
 *  Opcional: nunca bloquea nada. */
export default function MarcasOfrecidasChips({
    marcasDelRubro,
    catalogo,
    catalogoLoading,
    value,
    onChange,
    rubrosRestantes = 0,
    onAplicarATodos,
}: MarcasOfrecidasChipsProps) {
    const [buscadorAbierto, setBuscadorAbierto] = useState(false)
    const [aplicado, setAplicado] = useState(false)

    const elegidas = new Map(value.map(m => [m.codigo, m]))
    // Chips = desglose del rubro + las elegidas que no están en el desglose (vinieron de
    // "+ Otra" o de un alcance guardado), para que lo elegido siempre se vea.
    const extras = value.filter(m => !marcasDelRubro.some(d => d.code === m.codigo))

    function toggle(codigo: string, descripcion: string) {
        if (elegidas.has(codigo)) onChange(value.filter(m => m.codigo !== codigo))
        else onChange([...value, { codigo, descripcion }])
    }

    function sufijo(m: IMarcaEstado): string {
        return m.dejo ? 'dejó' : 'compra'
    }

    return (
        <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[9.5px] font-bold uppercase tracking-wide text-dsmuted">
                    ¿Qué marca ofreciste? <span className="normal-case tracking-normal font-semibold">· opcional</span>
                </span>
                {value.length > 0 && rubrosRestantes > 0 && (
                    <label className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-dsnavy">
                        <input
                            type="checkbox"
                            aria-label="Aplicar a restantes"
                            checked={aplicado}
                            onChange={e => {
                                setAplicado(e.target.checked)
                                if (e.target.checked) onAplicarATodos?.()
                            }}
                            className="h-3.5 w-3.5 shrink-0 rounded border-[#C9D2E3] accent-dsnavy"
                        />
                        Aplicar a restantes
                    </label>
                )}
            </div>

            <div className="flex flex-wrap gap-1.5">
                {marcasDelRubro.map(m => {
                    const on = elegidas.has(m.code)
                    return (
                        <button
                            key={m.code}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggle(m.code, m.nombre)}
                            className={`flex min-h-[32px] items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[12px] font-bold ${
                                on ? 'border-dsnavy bg-[#EEF3FB] text-dsnavy' : 'border-[#C9D2E3] bg-white text-[#182645]'
                            }`}
                        >
                            {on && <Check className="h-3 w-3" strokeWidth={3} />}
                            {m.nombre}
                            <span className={`text-[10.5px] font-semibold ${m.dejo ? 'text-dsred' : 'text-dsmuted'}`}>{sufijo(m)}</span>
                        </button>
                    )
                })}
                {extras.map(m => (
                    <button
                        key={m.codigo}
                        type="button"
                        aria-pressed
                        onClick={() => toggle(m.codigo, m.descripcion)}
                        className="flex min-h-[32px] items-center gap-1.5 rounded-full border-[1.5px] border-dsnavy bg-[#EEF3FB] px-3 text-[12px] font-bold text-dsnavy"
                    >
                        <Check className="h-3 w-3" strokeWidth={3} />
                        {m.descripcion}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => setBuscadorAbierto(v => !v)}
                    aria-expanded={buscadorAbierto}
                    className="flex min-h-[32px] items-center gap-1 rounded-full border-[1.5px] border-dashed border-[#C9D2E3] px-3 text-[12px] font-bold text-dsmuted"
                >
                    <Plus className="h-3 w-3" strokeWidth={2.5} />
                    Otra
                </button>
            </div>

            {buscadorAbierto && (
                <div className="animate-panel-in mt-2">
                    <CatalogoPicker
                        items={catalogo}
                        loading={catalogoLoading}
                        excluir={value.map(m => m.codigo)}
                        onSelect={item => {
                            if (!elegidas.has(item.code)) onChange([...value, { codigo: item.code, descripcion: item.description }])
                            setBuscadorAbierto(false)
                        }}
                        placeholder="Buscar marca…"
                        autoFocus
                        ocultarContadorRestantes
                    />
                </div>
            )}
        </div>
    )
}
```

Verificar en `CatalogoPicker.tsx` qué hace exactamente `excluir` (por `code`); si excluye por otra clave, ajustar.

- [ ] **Step 4: Correr los tests del componente**

Run: `npm test -- src/components/propuesta/MarcasOfrecidasChips.test.tsx`
Expected: PASS.

- [ ] **Step 5: Cablear en `ResolucionOfrecimiento`**

Props nuevas: `marcasDelRubro: IMarcaEstado[]`, `marcasOfrecidas: IMarcaOfrecida[]`, `onChangeMarcasOfrecidas: (m: IMarcaOfrecida[]) => void`, `onAplicarMarcas?: () => void`. Quitar `onAplicarMarca` y `onChangeMarcaChip`. Reemplazar el `<MarcaOfrecimientoPicker .../>` por:

```tsx
            <MarcasOfrecidasChips
                marcasDelRubro={marcasDelRubro}
                catalogo={marcas}
                catalogoLoading={marcasLoading}
                value={marcasOfrecidas}
                onChange={onChangeMarcasOfrecidas}
                rubrosRestantes={rubrosRestantes}
                onAplicarATodos={onAplicarMarcas}
            />
```

Actualizar el comentario de la prop `accion`: ya no lleva marca; queda para `detalle.accion`/`params`. **No borrar `marca` de `IAccionComercial`** (lo leen filas guardadas viejas y `esPersistible`); sólo dejar de escribirlo.

- [ ] **Step 6: Actualizar tests de `ResolucionOfrecimiento`**

- Los tests que usaban `getByLabelText('Marca del ofrecimiento')` (~líneas 66, 86) pasan a tocar el chip `+ Otra` y esperar `onChangeMarcasOfrecidas` con `[{ codigo, descripcion }]`, no `onChangeAccion`.
- Los tests de "Aplicar a restantes" (~líneas 330-350): el check aparece con `marcasOfrecidas: [{...}]` y `rubrosRestantes: 2`, y dispara `onAplicarMarcas`.
- El helper `setup` del archivo suma `marcasDelRubro: []`, `marcasOfrecidas: []`, `onChangeMarcasOfrecidas: vi.fn()`.

- [ ] **Step 7: Borrar el picker viejo**

```bash
git rm src/components/propuesta/MarcaOfrecimientoPicker.tsx src/components/propuesta/MarcaOfrecimientoPicker.test.tsx
```

- [ ] **Step 8: Tests y typecheck**

Run: `npm test -- src/components/propuesta && npx tsc -b`
Expected: PASS en `propuesta`. `tsc` va a fallar en `ResolucionWizard.tsx` (props nuevas): se arregla en la Task 13. Si hay otro error, arreglarlo acá.

- [ ] **Step 9: Commit**

```bash
git add src/components/propuesta/MarcasOfrecidasChips.tsx src/components/propuesta/MarcasOfrecidasChips.test.tsx src/components/propuesta/ResolucionOfrecimiento.tsx src/components/propuesta/ResolucionOfrecimiento.test.tsx
git commit -m "feat(visita): chips de marcas ofrecidas reemplazan al select de una marca"
```

---

### Task 13: `ResolucionWizard` — borrador de marcas, precarga, limpiar, aplicar

**Files:**
- Modify: `src/components/propuesta/ResolucionWizard.tsx`
- Modify: `src/components/propuesta/ResolucionWizard.test.tsx`

**Interfaces:**
- Produces (props nuevas de `ResolucionWizard`):
  ```ts
  marcasPorRubro: Record<string, IMarcaEstado[]>          // por codigo de rubro, desde rubroStatus
  marcasOfrecidas: Record<number, IMarcaOfrecida[]>       // borrador por ofrecimientoId
  onCambiarMarcasOfrecidas: (ofrecimientoId: number, marcas: IMarcaOfrecida[]) => void
  ```
  `useBrandCatalog` se pide siempre que el wizard esté abierto (los chips lo necesitan para `+ Otra`).

- [ ] **Step 1: Tests**

En `ResolucionWizard.test.tsx`, el helper `setup` suma `marcasPorRubro: {}`, `marcasOfrecidas: {}`, `onCambiarMarcasOfrecidas: vi.fn()` y devuelve este último. Reemplazar los tests de "Aplicar a restantes" basados en `detalles.marca` (~líneas 195-227) por:

```tsx
const fremax = { code: 'B1', nombre: 'FREMAX', actual: 0, mesAnterior: 54, promedio6m: 61, dejo: false }

it('muestra los chips del rubro actual y tildar uno escribe el borrador de marcas', async () => {
    const { onCambiarMarcasOfrecidas } = setup({ marcasPorRubro: { AMORT: [fremax] } })
    fireEvent.click(await screen.findByRole('button', { name: /FREMAX/ }))
    expect(onCambiarMarcasOfrecidas).toHaveBeenCalledWith(7, [{ codigo: 'B1', descripcion: 'FREMAX' }])
})

it('sin nada tildado no ofrece Aplicar a restantes', () => {
    setup({ marcasPorRubro: { AMORT: [fremax] } })
    expect(screen.queryByText(/aplicar a restantes/i)).not.toBeInTheDocument()
})

it('aplicar copia las marcas a los rubros restantes SIN marcas, sin tocar los que ya tienen', () => {
    const { onCambiarMarcasOfrecidas } = setup({
        ofrecimientos: [...ofrecimientos, { ...ofrecimientos[1], id: 9, codigo: 'ROD', descripcion: 'Rod rueda' }],
        marcasOfrecidas: { 7: [{ codigo: 'B1', descripcion: 'FREMAX' }], 8: [], 9: [{ codigo: 'B9', descripcion: 'SKF' }] },
    })
    fireEvent.click(screen.getByLabelText(/aplicar a restantes/i))
    expect(onCambiarMarcasOfrecidas).toHaveBeenCalledTimes(1)
    expect(onCambiarMarcasOfrecidas).toHaveBeenCalledWith(8, [{ codigo: 'B1', descripcion: 'FREMAX' }])
})

it('Limpiar vacía también las marcas', () => {
    const { onCambiarMarcasOfrecidas } = setup({ marcasOfrecidas: { 7: [{ codigo: 'B1', descripcion: 'FREMAX' }] } })
    fireEvent.click(screen.getByLabelText(/limpiar lo cargado/i))
    expect(onCambiarMarcasOfrecidas).toHaveBeenCalledWith(7, [])
})
```

El test que usaba `detalles: { 7: { accion: 'CUPO', marca: null } }` para "no ofrece Aplicar" (~línea 201) se borra: la marca ya no vive ahí. Los tests de `accion` (CUPO/DESCUENTO) que no tocan marca se mantienen.

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm test -- src/components/propuesta/ResolucionWizard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `ResolucionWizard`:

- Props nuevas (ver Interfaces). Importar `IMarcaEstado`, `IMarcaOfrecida`.
- `const { data: marcas = [], isLoading: marcasLoading } = useBrandCatalog(true)` (siempre: los chips lo necesitan; borrar `necesitaMarcas`).
- `const marcasDelRubro = marcasPorRubro[ofrecimiento.codigo] ?? []`
- `const marcasActuales = marcasOfrecidas[ofrecimiento.id] ?? []`
- Reemplazar `aplicarMarca` por:

```ts
    // Copia las marcas tildadas SOLO a los restantes que todavía no tienen ninguna: es una
    // copia de una sola vez, no un vínculo, y no pisa lo que el vendedor ya eligió en otro rubro.
    function aplicarMarcas() {
        for (const r of restantes) {
            if ((marcasOfrecidas[r.id] ?? []).length === 0) onCambiarMarcasOfrecidas(r.id, marcasActuales)
        }
    }
```

- `hayAlgoQueLimpiar` suma `|| marcasActuales.length > 0`; `limpiarBorrador` suma `onCambiarMarcasOfrecidas(ofrecimiento.id, [])`.
- Render de `ResolucionOfrecimiento`: pasar `marcasDelRubro`, `marcasOfrecidas={marcasActuales}`, `onChangeMarcasOfrecidas={m => onCambiarMarcasOfrecidas(ofrecimiento.id, m)}`, `onAplicarMarcas={aplicarMarcas}`; quitar `onAplicarMarca`. La acción comercial (`accion`/`onChangeAccion`) queda igual.

- [ ] **Step 4: Tests**

Run: `npm test -- src/components/propuesta/ResolucionWizard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/propuesta/ResolucionWizard.tsx src/components/propuesta/ResolucionWizard.test.tsx
git commit -m "feat(visita): el wizard lleva el borrador de marcas ofrecidas por rubro"
```

---

### Task 14: `VisitaSheet` — estado, persistencia, precarga desde alcance y `PUT`

**Files:**
- Modify: `src/components/VisitaSheet.tsx`
- Modify: `src/components/VisitaSheet.test.tsx` (~líneas 660-710, tests que tocaban `Marca del ofrecimiento`)

**Interfaces:**
- Consumes: Tasks 11, 13; `rubroStatus` (ya en el sheet) para `marcasPorRubro`.

- [ ] **Step 1: Tests**

Reemplazar los dos tests de `VisitaSheet.test.tsx` que tocan `Marca del ofrecimiento` y esperan `detalle: { accion: null, marca: 'Fric-Rot' }` por:

```tsx
    it('al cerrar, manda las marcas ofrecidas del rubro en el PUT', async () => {
        // setup: abrir el wizard del rubro, tocar "+ Otra", elegir una marca del catálogo mockeado,
        // volver y tocar Cerrar visita (reusar el flujo del test que se reemplaza)
        // ...
        expect(api.resolverOfrecimiento).toHaveBeenCalledWith(
            VISITA_ID,
            OFRECIMIENTO_ID,
            expect.objectContaining({ marcas: [{ codigo: 'FR', descripcion: 'Fric-Rot' }] }),
        )
    })

    it('no manda `marcas` si no cambiaron respecto del alcance guardado', async () => {
        // ofrecimiento con alcance [{tipo:'marca', codigo:'FR', descripcion:'Fric-Rot'}] y sin tocar marcas
        // cerrar → el PUT (si lo hay por motivos) NO tiene la clave `marcas`
        const llamada = (api.resolverOfrecimiento as Mock).mock.calls.find(c => c[1] === OFRECIMIENTO_ID)
        expect(llamada?.[2]).not.toHaveProperty('marcas')
    })

    it('precarga los chips desde el alcance tipo marca del ofrecimiento', async () => {
        // ofrecimiento con alcance [{tipo:'marca', codigo:'FR', descripcion:'Fric-Rot'}]
        // abrir el wizard → el chip Fric-Rot está aria-pressed=true
        expect(await screen.findByRole('button', { name: /Fric-Rot/ })).toHaveAttribute('aria-pressed', 'true')
    })
```

Rellenar los `// ...` con los helpers y fixtures del archivo (`VISITA_ID`, `OFRECIMIENTO_ID`, cómo se abre el wizard y se cierra la visita en los tests vecinos). El catálogo de marcas mockeado (`getBrandCatalog`) tiene que incluir `{ code: 'FR', description: 'Fric-Rot' }`.

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm test -- src/components/VisitaSheet.test.tsx`
Expected: FAIL en los nuevos.

- [ ] **Step 3: Implementar**

En `VisitaSheet.tsx`:

1. Estado: `const [marcasOfrecidas, setMarcasOfrecidas] = useState<Record<number, IMarcaOfrecida[]>>({})`. Reset en el `useEffect(!open)`.
2. Inicialización (el `useEffect` que arma `borradores` desde `ofrecimientos`): igual que `borradores`, primera vez desde `leerMarcasOfrecidas(visitaId)`, después completar ids nuevos desde el alcance:

```ts
        setMarcasOfrecidas(prev => {
            const base = Object.keys(prev).length > 0 ? prev : (leerMarcasOfrecidas(visitaId) ?? {})
            const next = { ...base }
            for (const r of ofrecimientos) if (!(r.id in next)) next[r.id] = marcasDelAlcance(r)
            return next
        })
```

con `function marcasDelAlcance(r: IOfrecimiento): IMarcaOfrecida[] { return r.alcance.filter(a => a.tipo === 'marca').map(a => ({ codigo: a.codigo, descripcion: a.descripcion })) }` (helper del módulo).

3. Persistencia: en el `useEffect` que llama `guardarBorrador/guardarDetalles/guardarObservaciones`, sumar `guardarMarcasOfrecidas(visitaId, marcasOfrecidas)` y a las deps. En el cierre exitoso, junto a `limpiarDetalles(visitaId)`, `limpiarMarcasOfrecidas(visitaId)`.
4. `esPersistible`: `detalles[id]?.marca` deja de contar (ya no se escribe); sumar marcas:

```ts
    function marcasCambiaron(r: IOfrecimiento): boolean {
        const a = (marcasOfrecidas[r.id] ?? []).map(m => m.codigo).sort()
        const b = marcasDelAlcance(r).map(m => m.codigo).sort()
        return a.length !== b.length || a.some((c, i) => c !== b[i])
    }
    function esPersistible(ofrecimientoId: number): boolean {
        return !!detalles[ofrecimientoId]?.accion
    }
```

5. `cerrarConBorrador`:

```ts
        const cambios = ofrecimientos
            .filter(r => !motivosIguales(borradores[r.id] ?? [], r.motivos) || esPersistible(r.id) || marcasCambiaron(r))
            .map(r => ({
                ofrecimientoId: r.id,
                motivos: borradores[r.id] ?? [],
                ...(esPersistible(r.id) ? { detalle: detalles[r.id] } : {}),
                ...(marcasCambiaron(r) ? { marcas: marcasOfrecidas[r.id] ?? [] } : {}),
            }))
```

6. `marcasPorRubro` para el wizard: `const marcasPorRubro = useMemo(() => Object.fromEntries(rubroStatus.map(s => [s.rubroCode, s.marcas])), [rubroStatus])`. Pasar al `ResolucionWizard`: `marcasPorRubro`, `marcasOfrecidas`, `onCambiarMarcasOfrecidas={(id, m) => setMarcasOfrecidas(prev => ({ ...prev, [id]: m }))}`.

7. Revisar el comentario de `esPersistible` (habla de "sin marca ni acción"): actualizarlo a "sin acción", y anotar que las marcas tienen su propia comparación contra el alcance.

- [ ] **Step 4: Tests, typecheck, lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: todo PASS. Prestar atención a `PropuestaSheet.test.tsx` y `VisitaSheet.test.tsx`: los fixtures de `getRubroStatus` mockeado tienen que devolver `marcas: []`.

- [ ] **Step 5: Verificación manual**

`npm run dev` contra el back con la rama de la Parte A. Flujo completo: abrir visita → tocar números de un rubro → ver marcas → tocar nombre → chips con esas marcas → tildar una → volver → Cerrar visita → en MySQL, `SELECT * FROM pl_ofrecimiento_alcance WHERE tipo='marca' ORDER BY id DESC LIMIT 5` muestra la fila. Reabrir el sheet de la visita cerrada: el chip aparece tildado.

- [ ] **Step 6: Commit**

```bash
git add src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx
git commit -m "feat(visita): marcas ofrecidas — borrador, precarga desde el alcance y PUT al cerrar"
```

---

### Task 15: Documentación viva

**Files:**
- Modify: `docs/dominio/tablas.md` (sección `pl_resolucion_motivo` y `pl_visita_rubro` / alcance, ~línea 169)
- Modify: `CLAUDE.md` del front (sección "Decisiones no obvias")
- Modify: `docs/superpowers/specs/2026-09-16-marcas-por-rubro-design.md` (Estado → "implementado")

- [ ] **Step 1: `tablas.md`**

En la parte de `pl_ofrecimiento_alcance` (o donde se describa el alcance), agregar:

```markdown
- **La marca ofrecida vive en `pl_ofrecimiento_alcance` con `tipo='marca'`** (spec 2026-09-16).
  Un rubro ofrecido en dos marcas son dos filas. Reemplaza a `detalle.marca` (JSON, una sola
  marca, por descripción), que **ya no se escribe**; Cromo la lee como fallback para filas
  anteriores. `PUT /visitas/:id/ofrecimientos/:id` con `marcas` reemplaza SOLO las filas
  `tipo='marca'`; el resto del alcance es del alta y no se edita desde ahí.
```

- [ ] **Step 2: `CLAUDE.md` del front**

Agregar en "Decisiones no obvias", después del bullet del chip de estado:

```markdown
- **La fila del rubro tiene DOS zonas, sin ícono.** Chip + nombre carga el resultado (es donde
  vive el estado); los tres números despliegan las marcas del cliente en ese rubro (sub-filas,
  máximo 3 + `+N marcas más`, una sola abierta). Se probaron y descartaron: chevron al lado del
  nombre (target chico pegado al grande), botón "Cargar resultado" dentro del despliegue (le
  cuesta un toque a la acción más repetida), columna "Marcas" con contador (una columna más en
  una fila que ya no tiene ancho), y siempre desplegado (15 filas donde entran 5). Las filas del
  catálogo no se parten: toda la fila agrega. En la propuesta previa (sin resolución) toda la
  fila despliega. Ver spec `2026-09-16-marcas-por-rubro-design.md`.
- **Las marcas del cliente son contexto vivo, no se congelan**; lo que se congela es la marca
  que el vendedor declaró haber ofrecido, en `pl_ofrecimiento_alcance` `tipo='marca'` (chips
  del wizard, opcionales, multi). `detalle.marca` ya no se escribe.
- **`getRubroStatus` pega a `POST /sale/rubro/client-context`**, no al listado paginado de
  Versus. Devuelve rubros con marcas anidadas y `amount`+`units` por período (el toggle
  pesos/unidades futuro es sólo front).
```

- [ ] **Step 3: Estado del spec**

`Estado: implementado (PR #__ front, PR #__ back)`.

- [ ] **Step 4: Commit**

```bash
git add docs/dominio/tablas.md CLAUDE.md docs/superpowers/specs/2026-09-16-marcas-por-rubro-design.md
git commit -m "docs: marcas por rubro — dos zonas, marca ofrecida en el alcance, client-context"
```

---

## Orden de deploy

1. **Back primero** (Parte A). Es aditivo: `client-context` nuevo, `marcas` opcional en resolver, Cromo con fallback. El front viejo sigue funcionando.
2. **Front después** (Parte B). Un bundle viejo cacheado por el service worker sigue pegando a `/sale/rubro/clients` (que no se borra) y escribiendo `detalle.marca` (que Cromo sigue leyendo por el fallback). Nada se rompe en la transición.
3. Ninguna migración SQL: no hay columnas nuevas.

## Self-review

- **Cobertura del spec:** §3.2 (Tasks 1-4), §3.3 `dropped` (Task 2), §3.4-3.5 (Task 7-8), §3.6 (Task 4), §4.0-4.2 (Task 5), §4.3 (Task 6), §4.4 aplicar a restantes (Task 12-13), §5.1 dos zonas / 3 marcas / banda / catálogo no se parte / propuesta fila entera / al borde 48px (Tasks 9-10), §5.2 chips / borrador / precarga / esPersistible (Tasks 11-14), §5.3 degradación (Task 9: sin marcas no hay botón; `getRubroStatus` en error → `rubroStatus=[]` → filas con `marcas: []`, comportamiento de hoy), §6 tests distribuidos, §7 nada codeado.
- **Nombres consistentes entre tareas:** `queryClientRubroBrandMonthly`, `ClientRubroBrandMonthRow`, `aggregateClientContext`, `contextPeriods`, `allMonths`, `isDropped`, `ClientContextService.query`, `validarMarcasOfrecidas`, `IMarcaOfrecidaDTO` (back) / `IMarcaOfrecida` (front), `IMarcaEstado`, `IRubroEstado.marcas`, `IOfrecimientoFila.marcas`, `MarcasOfrecidasChips`, props `marcasDelRubro` / `marcasOfrecidas` / `onChangeMarcasOfrecidas` / `onAplicarMarcas` (componente) y `marcasPorRubro` / `marcasOfrecidas` / `onCambiarMarcasOfrecidas` (wizard), `leerMarcasOfrecidas` / `guardarMarcasOfrecidas` / `limpiarMarcasOfrecidas`.
