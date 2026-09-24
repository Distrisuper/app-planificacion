# Pestaña "Métricas" en gerencia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar la pestaña `/analitica/metricas` para gerencia, con métricas de ventas (warehouse) y de visitas (`pl_*`), objeciones con detalle por cliente, clientes por tramo de facturación y ranking por vendedor, filtrable por vendedor, sucursal, zona y localidad.

**Architecture:** En api-vendedores, `ConjuntoClientesResolver` convierte scope + filtros geográficos en el conjunto de clientes, cacheado en Redis 5 min. `MetricasService` arma tres bloques independientes (resumen, objeciones, categorías) sobre ese conjunto, cruzando en memoria las filas de MySQL (`pl_*`) con las del warehouse (`fct_sales`, `fct_clients`). En el front, cada bloque tiene su propio hook de React Query. Los objetivos de venta y la proyección son constantes y aritmética del front.

**Tech Stack:** api-vendedores: Node + TS, Express, Sequelize (MySQL, `:named` replacements), `pg` (warehouse, `$n` positional), Redis (`RedisService`), Jest + ts-jest. app-planificacion: Vite + React 19 + TS, Tailwind, React Query v5, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-24-pestana-metricas-gerencia-design.md`.

## Global Constraints

- **Rutas de los repos:** el backend vive en `C:\Users\matia\OneDrive\Documentos\distri\business-platform\versus\api-vendedores`. **No** en la ruta que dice `CLAUDE.md` (no existe), ni en `distri\vendedores\api-vendedores` (es un clon viejo). Antes de ramificar: `git pull` en `master`.
- **Ramas:** backend `feat/metricas-gerencia` (nueva, desde `master` actualizado). Front `feat/pestana-metricas` (ya existe, con el spec commiteado).
- **Datos:** ningún script que **escriba** filas corre sin preguntarle antes al usuario. Leer del warehouse para verificar sí se puede.
- **Procesos pesados de a uno:** installs, builds y suites de tests nunca en paralelo. Avisar antes de cada uno.
- **Vendedor de prueba:** `PRUEBA-*` nunca entra a ningún número. Se excluye en SQL con `NOT LIKE 'PRUEBA-%'` / `NOT ILIKE`.
- **Estilos:** los del sistema (`slate`, `emerald`, `amber`, `red`), con tarjetas `rounded-lg border border-slate-200 bg-white p-4` y `KpiTile`. Nada de la paleta del mockup.
- **Porcentaje sin denominador = `s/d`**, nunca `0%`.
- **Objetivos de venta** por vendedor y por mes: facturación **150** ($M), unidades **500**, super rubro **12**, tasa de cierre **60**%.
- **Tramos de facturación** (pesos, mes): `sinCompras` ≤ 0; `menos1M` < 1.000.000; `entre1y3M` [1M, 3M); `entre3y5M` [3M, 5M); `mas5M` ≥ 5.000.000.
- **Códigos:** todo cruce de códigos de vendedor o cliente entre MySQL y el warehouse se hace en MAYÚSCULAS. Cliente = `fct_clients.particular_code` = `fct_sales.account_particular_code` = `pl_rotacion_cliente.codigo_particular_cliente`. Vendedor = `fct_clients.vendor_code` = `pl_ciclo_semana.codigo_particular_vendedor`.
- **Atribución de ventas:** la venta de un cliente se le atribuye a su vendedor **actual** (`fct_clients.vendor_code`), no al `vendor_code` de la fila de venta. Así la cartera y sus ventas son el mismo universo.
- **Respuesta HTTP:** `{ ok: 1, data }`. Los errores salen por `respondError`.

## File Structure

**api-vendedores (`<API>` = raíz del repo backend):**

| Archivo | Responsabilidad |
|---|---|
| `<API>/src/types/metricas.ts` (nuevo) | Contrato de respuesta de los 6 endpoints |
| `<API>/src/services/planificacion/indicadores/metricas.ts` (nuevo) | Funciones puras: tramo, sucursal dominante, meses, filtros de conjunto, paginado/orden |
| `<API>/src/repositories/MetricasWarehouseRepository.ts` (nuevo) | SQL al warehouse: clientes, sucursal, ventas, SR, facturación mensual |
| `<API>/src/repositories/MetricasRepository.ts` (nuevo) | SQL a MySQL: planificados por cliente, objeciones detalladas |
| `<API>/src/repositories/AnaliticaRepository.ts` (mod) | Fix `vi.tipo = 'rubro'` en `findObjeciones` |
| `<API>/src/services/planificacion/ConjuntoClientesResolver.ts` (nuevo) | Filtros + scope → conjunto de clientes, cacheado |
| `<API>/src/services/planificacion/MetricasService.ts` (nuevo) | Arma resumen, objeciones, detalle, categorías, clientes de tramo y opciones |
| `<API>/src/services/planificacion/AnaliticaService.ts` (mod) | `export` de `rosterSeguro` y `buildNombrePorVendedor` |
| `<API>/src/controllers/metricasController.ts` (nuevo) | Parseo de query, validación, respuesta |
| `<API>/src/routes/analitica.ts` (mod) | 6 rutas `/metricas/...` |

**app-planificacion:**

| Archivo | Responsabilidad |
|---|---|
| `src/types/metricas.ts` (nuevo) | Espejo del contrato del backend |
| `src/lib/metricas.ts` (nuevo) | Objetivos de venta, cumplimiento, proyección, tasas, formato $M, clase de semáforo |
| `src/api/metricas.ts` (nuevo) + `src/mocks/metricasMock.ts` (nuevo) | Llamadas HTTP y modo mock |
| `src/hooks/useMetricas.ts` (nuevo) | Un hook por endpoint |
| `src/components/analitica/SelectorPeriodo.tsx` (mod) | Modo opcional "Rango de fechas" |
| `src/components/analitica/AnaliticaTabs.tsx` (mod) + `src/App.tsx` (mod) | Pestaña y ruta |
| `src/pages/AnaliticaMetricasPage.tsx` (nuevo) | Estado de filtros y período; compone los bloques |
| `src/components/metricas/FiltrosMetricas.tsx` | Selects de vendedor, sucursal, zona y localidad |
| `src/components/metricas/BloqueVentas.tsx` | Tiles de venta, visita y rentabilidad |
| `src/components/metricas/BloqueObjeciones.tsx` + `DetalleObjecion.tsx` | Motivos, tasa y detalle |
| `src/components/metricas/BloqueCategorias.tsx` + `ClientesDeTramo.tsx` | Tramos y listado |
| `src/components/metricas/RankingVendedores.tsx` | Tabla ordenable |
| `src/components/metricas/Paginador.tsx` | Anterior / Página N de M / Siguiente (compartido) |

---

# Parte A — api-vendedores

Todos los comandos corren en `<API>`.

### Task A0: Rama y verificación del warehouse

**Files:** ninguno.

- [ ] **Step 1: Actualizar master y ramificar**

```bash
cd /c/Users/matia/OneDrive/Documentos/distri/business-platform/versus/api-vendedores
git checkout master && git pull
git log --oneline -1   # debe verse historia feat(planificacion)/feat(ficha)
git checkout -b feat/metricas-gerencia
```

- [ ] **Step 2: Verificar el formato de los datos que el plan asume (solo lectura)**

Crear `./.tmp-check.ts` (se borra al final del paso):

```ts
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { initWarehouse, query, closeWarehouse } from './src/database/warehouse'
;(async () => {
  await initWarehouse()
  console.log(await query(`SELECT year_month, branch, account_particular_code FROM analytics.fct_sales ORDER BY invoice_datetime DESC LIMIT 3`))
  console.log(await query(`SELECT DISTINCT branch FROM analytics.fct_sales WHERE invoice_datetime > now() - interval '60 days'`))
  await closeWarehouse(); process.exit(0)
})().catch(e => { console.error(e.message); process.exit(1) })
```

Run: `npx ts-node --transpile-only ./.tmp-check.ts; rm ./.tmp-check.ts`

Expected: `year_month` con forma `'YYYY-MM'`, `branch` dentro de `BA | MDP | PICO | ROSARIO` (puede aparecer `null`) y `account_particular_code` con valor. **Si algo difiere, frenar y avisar al usuario antes de seguir.**

---

### Task A1: Tipos del contrato y funciones puras

**Files:**
- Create: `<API>/src/types/metricas.ts`
- Create: `<API>/src/services/planificacion/indicadores/metricas.ts`
- Test: `<API>/src/services/planificacion/indicadores/metricas.spec.ts`

**Interfaces:**
- Produces:
  - `IFiltroMetricas`, `IClienteConjunto`, `IMetricasFila`, `IMetricasResumen`, `IObjecionesMetricas`, `IObjecionDetalle`, `ICategoriasMetricas`, `IClientesDeTramo`, `IOpcionesMetricas`, `Tramo`, `TRAMOS`, `IPagina<T>`.
  - `tramoDeFacturacion(monto: number): Tramo`
  - `sucursalDominante(filas: { cliente: string; sucursal: string | null; monto: number }[]): Map<string, string>`
  - `mesDe(fechaIso: string): string` (`'YYYY-MM'`)
  - `sumarMeses(ym: string, delta: number): string`
  - `restarUnAnio(fechaIso: string): string`
  - `rangoMesesCerrados(hasta: string, cantidad: number): { desde: string; hasta: string }`
  - `aplicarFiltrosGeo(clientes: IClienteConjunto[], f: Pick<IFiltroMetricas,'sucursal'|'zona'|'localidad'>): IClienteConjunto[]`
  - `paginar<T>(filas: T[], pagina: number, cant: number): IPagina<T>`
  - `ordenarPor<T>(filas: T[], clave: keyof T, dir: 'asc' | 'desc'): T[]`

- [ ] **Step 1: Crear los tipos**

`<API>/src/types/metricas.ts`:

```ts
export const TRAMOS = ['sinCompras', 'menos1M', 'entre1y3M', 'entre3y5M', 'mas5M'] as const
export type Tramo = (typeof TRAMOS)[number]

export interface IFiltroMetricas {
    desde: string
    hasta: string
    /** Vendedor elegido. Ausente = equipo completo del scope. */
    vendedor?: string
    /** BA | MDP | PICO | ROSARIO — la sucursal de la FACTURA. */
    sucursal?: string
    zona?: string
    localidad?: string
}

/** Un cliente de la cartera, ya con su sucursal dominante resuelta. Códigos en MAYÚSCULAS. */
export interface IClienteConjunto {
    codigo: string
    vendedor: string
    nombre: string
    direccion: string | null
    telefono: string | null
    localidad: string | null
    zona: string | null
    /** La que más le facturó en los 12 meses cerrados. null = sin compras en ese lapso. */
    sucursal: string | null
}

/** Una fila del ranking (y la de equipo). Todos crudos: los % los calcula el front. */
export interface IMetricasFila {
    codigoVendedor: string
    nombreVendedor: string
    cartera: number
    clientesVisitados: number
    visitasValidas: number
    minutosTotales: number
    clientesConCompra: number
    /** Clientes visitados en el período que además compraron: numerador de la tasa de cierre. */
    visitadosConCompra: number
    planificados: number
    /** Filas del plan cuyo cliente compró en el período: numerador de Ventas vs Planner. */
    planificadosConCompra: number
    facturacion: number
    facturacionMmaa: number
    unidades: number
    unidadesMmaa: number
    superRubro: number
    superRubroMmaa: number
    /** 0..1. null fuera de mes calendario completo o sin venta rentable. */
    rentabilidad: number | null
    /** Objetivos de pl_objetivo ya prorrateados al período. null = sin objetivo vigente. */
    objetivoVisitas: number | null
    objetivoClientes: number | null
    objetivoMinutos: number | null
}

export interface IMetricasResumen {
    desde: string
    hasta: string
    diasHabiles: number
    /** Días hábiles entre `desde` y hoy (o `hasta` si ya pasó). Alimenta la proyección. */
    diasHabilesTranscurridos: number
    mesCompleto: boolean
    equipo: IMetricasFila
    vendedores: IMetricasFila[]
}

export interface IObjecionesMetricas {
    total: number
    planificados: number
    motivos: { motivoId: number; descripcion: string; cantidad: number; pct: number }[]
}

export interface IConteo {
    descripcion: string
    cantidad: number
    pct: number
}

export interface IPagina<T> {
    total: number
    pagina: number
    cant: number
    filas: T[]
}

export interface IClienteObjecion {
    codigo: string
    nombre: string
    direccion: string | null
    telefono: string | null
    localidad: string | null
    vendedor: string
}

export interface IObjecionDetalle {
    motivoId: number
    descripcion: string
    marcas: IConteo[]
    rubros: IConteo[]
    clientes: IPagina<IClienteObjecion>
}

export interface ICategoriasMetricas {
    /** 'YYYY-MM' del mes clasificado (el de `hasta`). */
    mes: string
    tramos: { tramo: Tramo; cantidad: number }[]
    subieron: number
    bajaron: number
}

export interface IClienteTramo {
    codigo: string
    nombre: string
    actual: number
    promedio6m: number
    /** (actual − promedio6m) / promedio6m. null si promedio6m ≤ 0. */
    variacion: number | null
}

export type IClientesDeTramo = IPagina<IClienteTramo>

export interface IOpcionesMetricas {
    sucursales: { codigo: string; descripcion: string }[]
    zonas: { codigo: string; descripcion: string }[]
    localidades: { localidad: string; zona: string | null }[]
}
```

- [ ] **Step 2: Escribir los tests que fallan**

`<API>/src/services/planificacion/indicadores/metricas.spec.ts`:

```ts
import {
    tramoDeFacturacion,
    sucursalDominante,
    mesDe,
    sumarMeses,
    restarUnAnio,
    rangoMesesCerrados,
    aplicarFiltrosGeo,
    paginar,
    ordenarPor,
} from './metricas'
import { IClienteConjunto } from '../../../types/metricas'

describe('tramoDeFacturacion', () => {
    it.each([
        [-500, 'sinCompras'],
        [0, 'sinCompras'],
        [1, 'menos1M'],
        [999_999.99, 'menos1M'],
        [1_000_000, 'entre1y3M'],
        [2_999_999, 'entre1y3M'],
        [3_000_000, 'entre3y5M'],
        [4_999_999, 'entre3y5M'],
        [5_000_000, 'mas5M'],
    ])('%p → %p', (monto, tramo) => {
        expect(tramoDeFacturacion(monto)).toBe(tramo)
    })
})

describe('sucursalDominante', () => {
    it('elige la sucursal con más monto por cliente', () => {
        const r = sucursalDominante([
            { cliente: 'C1', sucursal: 'BA', monto: 100 },
            { cliente: 'C1', sucursal: 'MDP', monto: 300 },
            { cliente: 'C2', sucursal: 'PICO', monto: 50 },
        ])
        expect(r.get('C1')).toBe('MDP')
        expect(r.get('C2')).toBe('PICO')
    })

    it('en empate gana la primera alfabéticamente (determinístico)', () => {
        const r = sucursalDominante([
            { cliente: 'C1', sucursal: 'MDP', monto: 100 },
            { cliente: 'C1', sucursal: 'BA', monto: 100 },
        ])
        expect(r.get('C1')).toBe('BA')
    })

    it('ignora sucursal null y montos ≤ 0', () => {
        const r = sucursalDominante([
            { cliente: 'C1', sucursal: null, monto: 900 },
            { cliente: 'C1', sucursal: 'BA', monto: -10 },
        ])
        expect(r.has('C1')).toBe(false)
    })
})

describe('fechas', () => {
    it('mesDe', () => expect(mesDe('2026-09-18')).toBe('2026-09'))
    it('sumarMeses cruza años', () => {
        expect(sumarMeses('2026-01', -1)).toBe('2025-12')
        expect(sumarMeses('2026-11', 3)).toBe('2027-02')
    })
    it('restarUnAnio respeta el 29/02', () => {
        expect(restarUnAnio('2026-09-18')).toBe('2025-09-18')
        expect(restarUnAnio('2028-02-29')).toBe('2027-02-28')
    })
    it('rangoMesesCerrados: los N meses completos antes del mes de hasta', () => {
        expect(rangoMesesCerrados('2026-09-18', 12)).toEqual({ desde: '2025-09-01', hasta: '2026-08-31' })
    })
})

const cli = (over: Partial<IClienteConjunto>): IClienteConjunto => ({
    codigo: 'C', vendedor: 'V1', nombre: 'X', direccion: null, telefono: null,
    localidad: null, zona: null, sucursal: null, ...over,
})

describe('aplicarFiltrosGeo', () => {
    const clientes = [
        cli({ codigo: 'A', sucursal: 'BA', zona: 'Z1', localidad: 'CABA' }),
        cli({ codigo: 'B', sucursal: 'MDP', zona: 'Z2', localidad: 'Mar del Plata' }),
        cli({ codigo: 'C', sucursal: null, zona: 'Z1', localidad: 'CABA' }),
    ]
    it('sin filtros devuelve todo', () => {
        expect(aplicarFiltrosGeo(clientes, {}).map(c => c.codigo)).toEqual(['A', 'B', 'C'])
    })
    it('sucursal excluye a los sin sucursal', () => {
        expect(aplicarFiltrosGeo(clientes, { sucursal: 'BA' }).map(c => c.codigo)).toEqual(['A'])
    })
    it('zona y localidad combinan (AND), sin distinguir mayúsculas', () => {
        expect(aplicarFiltrosGeo(clientes, { zona: 'z1', localidad: 'caba' }).map(c => c.codigo)).toEqual(['A', 'C'])
    })
})

describe('paginar / ordenarPor', () => {
    it('paginar es 1-based y clampa', () => {
        const p = paginar([1, 2, 3, 4, 5], 2, 2)
        expect(p).toEqual({ total: 5, pagina: 2, cant: 2, filas: [3, 4] })
        expect(paginar([1, 2], 9, 2).pagina).toBe(1)
    })
    it('ordenarPor números y strings, con null al final', () => {
        const filas = [{ n: 2, s: 'b' }, { n: null as number | null, s: 'a' }, { n: 5, s: 'c' }]
        expect(ordenarPor(filas, 'n', 'desc').map(f => f.n)).toEqual([5, 2, null])
        expect(ordenarPor(filas, 's', 'asc').map(f => f.s)).toEqual(['a', 'b', 'c'])
    })
})
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npx jest src/services/planificacion/indicadores/metricas.spec.ts`
Expected: FAIL con "Cannot find module './metricas'".

- [ ] **Step 4: Implementar**

`<API>/src/services/planificacion/indicadores/metricas.ts`:

```ts
import { IClienteConjunto, IFiltroMetricas, IPagina, Tramo } from '../../../types/metricas'

/** Tramos de la cartera por facturación del mes, en pesos. Borde inferior inclusive. */
export function tramoDeFacturacion(monto: number): Tramo {
    if (monto <= 0) return 'sinCompras'
    if (monto < 1_000_000) return 'menos1M'
    if (monto < 3_000_000) return 'entre1y3M'
    if (monto < 5_000_000) return 'entre3y5M'
    return 'mas5M'
}

/** La sucursal es de la FACTURA, no del cliente: se le asigna la que más le facturó.
 *  Empate → la primera alfabéticamente, para que el filtro no cambie entre requests. */
export function sucursalDominante(
    filas: { cliente: string; sucursal: string | null; monto: number }[],
): Map<string, string> {
    const mejor = new Map<string, { sucursal: string; monto: number }>()
    for (const f of filas) {
        if (!f.sucursal || f.monto <= 0) continue
        const actual = mejor.get(f.cliente)
        const gana =
            !actual ||
            f.monto > actual.monto ||
            (f.monto === actual.monto && f.sucursal < actual.sucursal)
        if (gana) mejor.set(f.cliente, { sucursal: f.sucursal, monto: f.monto })
    }
    return new Map([...mejor].map(([c, v]) => [c, v.sucursal]))
}

export const mesDe = (fechaIso: string): string => fechaIso.slice(0, 7)

export function sumarMeses(ym: string, delta: number): string {
    const [y, m] = ym.split('-').map(Number)
    const total = y * 12 + (m - 1) + delta
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

const ultimoDia = (y: number, m: number) => new Date(y, m, 0).getDate()

export function restarUnAnio(fechaIso: string): string {
    const [y, m, d] = fechaIso.split('-').map(Number)
    const dia = Math.min(d, ultimoDia(y - 1, m))
    return `${y - 1}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** Los `cantidad` meses calendario completos anteriores al mes de `hasta`. */
export function rangoMesesCerrados(hasta: string, cantidad: number): { desde: string; hasta: string } {
    const mesActual = mesDe(hasta)
    const primero = sumarMeses(mesActual, -cantidad)
    const ultimo = sumarMeses(mesActual, -1)
    const [uy, um] = ultimo.split('-').map(Number)
    return { desde: `${primero}-01`, hasta: `${ultimo}-${String(ultimoDia(uy, um)).padStart(2, '0')}` }
}

const igual = (a: string | null, b: string) => (a ?? '').toUpperCase() === b.toUpperCase()

export function aplicarFiltrosGeo(
    clientes: IClienteConjunto[],
    f: Pick<IFiltroMetricas, 'sucursal' | 'zona' | 'localidad'>,
): IClienteConjunto[] {
    return clientes.filter(
        c =>
            (!f.sucursal || igual(c.sucursal, f.sucursal)) &&
            (!f.zona || igual(c.zona, f.zona)) &&
            (!f.localidad || igual(c.localidad, f.localidad)),
    )
}

export function paginar<T>(filas: T[], pagina: number, cant: number): IPagina<T> {
    const paginas = Math.max(1, Math.ceil(filas.length / cant))
    const p = pagina >= 1 && pagina <= paginas ? pagina : 1
    return { total: filas.length, pagina: p, cant, filas: filas.slice((p - 1) * cant, p * cant) }
}

export function ordenarPor<T>(filas: T[], clave: keyof T, dir: 'asc' | 'desc'): T[] {
    const signo = dir === 'asc' ? 1 : -1
    return [...filas].sort((a, b) => {
        const va = a[clave] as unknown
        const vb = b[clave] as unknown
        if (va === null || va === undefined) return 1
        if (vb === null || vb === undefined) return -1
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * signo
        return String(va).localeCompare(String(vb), 'es') * signo
    })
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx jest src/services/planificacion/indicadores/metricas.spec.ts`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add src/types/metricas.ts src/services/planificacion/indicadores/metricas.ts src/services/planificacion/indicadores/metricas.spec.ts
git commit -m "feat(metricas): tipos del contrato y funciones puras (tramo, sucursal dominante, fechas)"
```

---

### Task A2: Repositorio del warehouse

**Files:**
- Create: `<API>/src/repositories/MetricasWarehouseRepository.ts`
- Test: `<API>/src/repositories/MetricasWarehouseRepository.spec.ts`

**Interfaces:**
- Consumes: `query` de `../database/warehouse`, `AMOUNT_EXPR` / `UNITS_EXPR` / `FCT_SALES_TABLE` de `../services/sales/warehouseExpressions`.
- Produces (todos static, códigos devueltos en MAYÚSCULAS):
  - `findClientesDeVendedores(vendedores: string[] | null): Promise<IClienteWarehouseRow[]>`
  - `findMontoPorClienteYSucursal(codigos: string[], desde: string, hasta: string): Promise<{ cliente: string; sucursal: string | null; monto: number }[]>`
  - `findVentasPorCliente(codigos: string[], desde: string, hasta: string, sucursal?: string): Promise<IVentaClienteRow[]>`
  - `findSrPorCliente(codigos: string[], desde: string, hasta: string, sucursal?: string): Promise<{ cliente: string; sr: number }[]>`
  - `findFacturacionMensual(codigos: string[], desdeMes: string, hastaMes: string, sucursal?: string): Promise<{ cliente: string; mes: string; monto: number }[]>`
  - `findZonas(): Promise<{ codigo: string; descripcion: string }[]>`
  - Tipos exportados `IClienteWarehouseRow { codigo, vendedor, nombre, direccion, telefono, localidad, zona }` e `IVentaClienteRow { cliente, facturacion, unidades, ppVenta, ppCosto }`.

- [ ] **Step 1: Escribir los tests que fallan** (mockean `query` y verifican SQL y parámetros)

`<API>/src/repositories/MetricasWarehouseRepository.spec.ts`:

```ts
import { MetricasWarehouseRepository as Repo } from './MetricasWarehouseRepository'
import { query } from '../database/warehouse'

jest.mock('../database/warehouse')
const mockedQuery = query as jest.MockedFunction<typeof query>

beforeEach(() => jest.clearAllMocks())

describe('findClientesDeVendedores', () => {
    it('sin scope no filtra por vendedor pero excluye secundarias y PRUEBA-', async () => {
        mockedQuery.mockResolvedValue([])
        await Repo.findClientesDeVendedores(null)
        const [sql, params] = mockedQuery.mock.calls[0]
        expect(sql).toContain('is_secondary_account = false')
        expect(sql).toContain("NOT ILIKE 'PRUEBA-%'")
        expect(sql).not.toContain('ANY($1')
        expect(params).toEqual([])
    })

    it('con scope filtra por UPPER(vendor_code) = ANY y normaliza a mayúsculas', async () => {
        mockedQuery.mockResolvedValue([
            { codigo: 'c1', vendedor: 'v 2', nombre: 'Taller', direccion: null, telefono: null, localidad: 'CABA', zona: '01' },
        ])
        const r = await Repo.findClientesDeVendedores(['v 2'])
        const [sql, params] = mockedQuery.mock.calls[0]
        expect(sql).toContain('UPPER(vendor_code) = ANY($1::text[])')
        expect(params).toEqual([['V 2']])
        expect(r[0]).toMatchObject({ codigo: 'C1', vendedor: 'V 2' })
    })

    it('scope vacío no consulta', async () => {
        expect(await Repo.findClientesDeVendedores([])).toEqual([])
        expect(mockedQuery).not.toHaveBeenCalled()
    })
})

describe('findVentasPorCliente', () => {
    it('filtra por rango de fecha, códigos y sucursal opcional', async () => {
        mockedQuery.mockResolvedValue([{ cliente: 'c1', facturacion: '10', unidades: '2', ppVenta: '8', ppCosto: '6' }])
        const r = await Repo.findVentasPorCliente(['C1'], '2026-09-01', '2026-09-30', 'MDP')
        const [sql, params] = mockedQuery.mock.calls[0]
        expect(sql).toContain('invoice_datetime::date >= $2::date')
        expect(sql).toContain('branch = $4')
        expect(params).toEqual([['C1'], '2026-09-01', '2026-09-30', 'MDP'])
        expect(r).toEqual([{ cliente: 'C1', facturacion: 10, unidades: 2, ppVenta: 8, ppCosto: 6 }])
    })

    it('sin códigos no consulta', async () => {
        expect(await Repo.findVentasPorCliente([], '2026-09-01', '2026-09-30')).toEqual([])
        expect(mockedQuery).not.toHaveBeenCalled()
    })
})

describe('findSrPorCliente', () => {
    it('cuenta pares cliente×rubro×mes que llegan al mínimo', async () => {
        mockedQuery.mockResolvedValue([{ cliente: 'c1', sr: '3' }])
        const r = await Repo.findSrPorCliente(['C1'], '2026-09-01', '2026-09-30')
        const [sql] = mockedQuery.mock.calls[0]
        expect(sql).toContain('SUM(article_quantity) >= MIN(rubro_min_units)')
        expect(sql).toContain('is_valid_for_units = true')
        expect(r).toEqual([{ cliente: 'C1', sr: 3 }])
    })
})

describe('findFacturacionMensual', () => {
    it('agrupa por year_month entre dos meses', async () => {
        mockedQuery.mockResolvedValue([{ cliente: 'c1', mes: '2026-09', monto: '1500000' }])
        const r = await Repo.findFacturacionMensual(['C1'], '2026-03', '2026-09')
        const [sql, params] = mockedQuery.mock.calls[0]
        expect(sql).toContain('year_month BETWEEN $2 AND $3')
        expect(params).toEqual([['C1'], '2026-03', '2026-09'])
        expect(r).toEqual([{ cliente: 'C1', mes: '2026-09', monto: 1500000 }])
    })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx jest src/repositories/MetricasWarehouseRepository.spec.ts`
Expected: FAIL con "Cannot find module".

- [ ] **Step 3: Implementar**

`<API>/src/repositories/MetricasWarehouseRepository.ts`:

```ts
import { query } from '../database/warehouse'
import { AMOUNT_EXPR, FCT_SALES_TABLE, UNITS_EXPR } from '../services/sales/warehouseExpressions'

const CLIENTS = 'analytics.fct_clients'
const ZONES = 'analytics.fct_zones'

export interface IClienteWarehouseRow {
    codigo: string
    vendedor: string
    nombre: string
    direccion: string | null
    telefono: string | null
    localidad: string | null
    zona: string | null
}

export interface IVentaClienteRow {
    cliente: string
    facturacion: number
    unidades: number
    ppVenta: number
    ppCosto: number
}

const up = (s: string) => s.toUpperCase()

/** WHERE común a toda consulta de ventas del conjunto. $1 = códigos, $2/$3 = fechas,
 *  $4 = sucursal (opcional). */
function whereVentas(sucursal?: string): string {
    return `WHERE UPPER(s.account_particular_code) = ANY($1::text[])
              AND s.invoice_datetime::date >= $2::date
              AND s.invoice_datetime::date <= $3::date
              ${sucursal ? 'AND s.branch = $4' : ''}`
}

const paramsVentas = (codigos: string[], desde: string, hasta: string, sucursal?: string) =>
    sucursal ? [codigos, desde, hasta, sucursal] : [codigos, desde, hasta]

/**
 * Lecturas del warehouse para la pestaña Métricas. Todo parte de un conjunto de códigos de
 * cliente ya resuelto (ver ConjuntoClientesResolver): acá no se decide quién entra, solo se
 * mide. Los códigos vuelven en MAYÚSCULAS porque el cruce con pl_* se hace así.
 */
export class MetricasWarehouseRepository {
    static async findClientesDeVendedores(vendedores: string[] | null): Promise<IClienteWarehouseRow[]> {
        if (vendedores !== null && vendedores.length === 0) return []
        const filtroVendedor = vendedores === null ? '' : 'AND UPPER(vendor_code) = ANY($1::text[])'
        const rows = await query<IClienteWarehouseRow>(
            `SELECT particular_code                          AS codigo,
                    vendor_code                              AS vendedor,
                    COALESCE(NULLIF(trade_name, ''), business_name, '') AS nombre,
                    address                                  AS direccion,
                    phone                                    AS telefono,
                    city                                     AS localidad,
                    zone_code                                AS zona
               FROM ${CLIENTS}
              WHERE is_secondary_account = false
                AND particular_code IS NOT NULL
                AND vendor_code IS NOT NULL
                AND vendor_code NOT ILIKE 'PRUEBA-%'
                ${filtroVendedor}`,
            vendedores === null ? [] : [vendedores.map(up)],
        )
        return rows.map(r => ({ ...r, codigo: up(r.codigo), vendedor: up(r.vendedor) }))
    }

    static async findMontoPorClienteYSucursal(
        codigos: string[],
        desde: string,
        hasta: string,
    ): Promise<{ cliente: string; sucursal: string | null; monto: number }[]> {
        if (codigos.length === 0) return []
        const rows = await query<{ cliente: string; sucursal: string | null; monto: number | string }>(
            `SELECT s.account_particular_code AS cliente, s.branch AS sucursal,
                    SUM(${AMOUNT_EXPR}) AS monto
               FROM ${FCT_SALES_TABLE} s
               ${whereVentas()}
              GROUP BY s.account_particular_code, s.branch`,
            paramsVentas(codigos, desde, hasta),
        )
        return rows.map(r => ({ cliente: up(r.cliente), sucursal: r.sucursal, monto: Number(r.monto) }))
    }

    static async findVentasPorCliente(
        codigos: string[],
        desde: string,
        hasta: string,
        sucursal?: string,
    ): Promise<IVentaClienteRow[]> {
        if (codigos.length === 0) return []
        const rows = await query<Record<keyof IVentaClienteRow, string | number>>(
            `SELECT s.account_particular_code AS cliente,
                    SUM(${AMOUNT_EXPR}) AS facturacion,
                    SUM(${UNITS_EXPR})  AS unidades,
                    SUM(CASE WHEN is_valid_for_profitability THEN pp_sale_total ELSE 0 END) AS "ppVenta",
                    SUM(CASE WHEN is_valid_for_profitability THEN pp_cost_total ELSE 0 END) AS "ppCosto"
               FROM ${FCT_SALES_TABLE} s
               ${whereVentas(sucursal)}
              GROUP BY s.account_particular_code`,
            paramsVentas(codigos, desde, hasta, sucursal),
        )
        return rows.map(r => ({
            cliente: up(String(r.cliente)),
            facturacion: Number(r.facturacion),
            unidades: Number(r.unidades),
            ppVenta: Number(r.ppVenta),
            ppCosto: Number(r.ppCosto),
        }))
    }

    /** SR de la empresa (mismo criterio que getRubroMonthlyAchievements): un par
     *  cliente×rubro×mes cuenta cuando las unidades llegan a rubro_min_units. */
    static async findSrPorCliente(
        codigos: string[],
        desde: string,
        hasta: string,
        sucursal?: string,
    ): Promise<{ cliente: string; sr: number }[]> {
        if (codigos.length === 0) return []
        const rows = await query<{ cliente: string; sr: number | string }>(
            `WITH pares AS (
                SELECT s.account_particular_code AS cliente, s.rubro_code, s.year_month,
                       CASE WHEN MIN(rubro_min_units) > 0
                                 AND SUM(article_quantity) >= MIN(rubro_min_units)
                            THEN 1 ELSE 0 END AS logrado
                  FROM ${FCT_SALES_TABLE} s
                  ${whereVentas(sucursal)}
                   AND is_valid_for_units = true
                 GROUP BY s.account_particular_code, s.rubro_code, s.year_month
             )
             SELECT cliente, SUM(logrado) AS sr FROM pares GROUP BY cliente`,
            paramsVentas(codigos, desde, hasta, sucursal),
        )
        return rows.map(r => ({ cliente: up(r.cliente), sr: Number(r.sr) }))
    }

    static async findFacturacionMensual(
        codigos: string[],
        desdeMes: string,
        hastaMes: string,
        sucursal?: string,
    ): Promise<{ cliente: string; mes: string; monto: number }[]> {
        if (codigos.length === 0) return []
        const rows = await query<{ cliente: string; mes: string; monto: number | string }>(
            `SELECT s.account_particular_code AS cliente, s.year_month AS mes,
                    SUM(${AMOUNT_EXPR}) AS monto
               FROM ${FCT_SALES_TABLE} s
              WHERE UPPER(s.account_particular_code) = ANY($1::text[])
                AND s.year_month BETWEEN $2 AND $3
                ${sucursal ? 'AND s.branch = $4' : ''}
              GROUP BY s.account_particular_code, s.year_month`,
            sucursal ? [codigos, desdeMes, hastaMes, sucursal] : [codigos, desdeMes, hastaMes],
        )
        return rows.map(r => ({ cliente: up(r.cliente), mes: r.mes, monto: Number(r.monto) }))
    }

    static async findZonas(): Promise<{ codigo: string; descripcion: string }[]> {
        return query<{ codigo: string; descripcion: string }>(
            `SELECT zone_code AS codigo, COALESCE(description, zone_code) AS descripcion
               FROM ${ZONES} ORDER BY description`,
            [],
        )
    }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx jest src/repositories/MetricasWarehouseRepository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repositories/MetricasWarehouseRepository.ts src/repositories/MetricasWarehouseRepository.spec.ts
git commit -m "feat(metricas): repositorio de warehouse (cartera, ventas, SR, facturación mensual)"
```

---

### Task A3: Repositorio MySQL + fix del filtro por rubro

**Files:**
- Create: `<API>/src/repositories/MetricasRepository.ts`
- Modify: `<API>/src/repositories/AnaliticaRepository.ts` (líneas ~441-444 de `findObjeciones`, y `export` de `fragmentoVendedores` y `bordesUtc`)
- Test: `<API>/src/repositories/MetricasRepository.spec.ts`; agregar un caso en `<API>/src/repositories/AnaliticaRepository.spec.ts`

**Interfaces:**
- Consumes: `sequelizeWritePlanificacion`; `fragmentoVendedores(vendedores, alias)` y `bordesUtc(desde, hasta)`, que pasan a ser `export` en `AnaliticaRepository.ts`.
- Produces:
  - `MetricasRepository.findPlanificadosPorCliente(filtro: IFiltroVendedores): Promise<{ vendedor: string; cliente: string }[]>`: una fila por fila del plan.
  - `MetricasRepository.findObjecionesDetalladas(p: { desde: string; hasta: string; vendedores?: string[]; rubro?: string }): Promise<IObjecionDetalladaRow[]>`
  - `IObjecionDetalladaRow { motivo_id: number; descripcion: string; ofrecimiento_id: number; tipo: string; ofrecimiento_desc: string; marca_motivo: string | null; marcas_alcance: string | null; cliente: string; vendedor: string }`

- [ ] **Step 1: Exportar los helpers en `AnaliticaRepository.ts`**

Cambiar `function fragmentoVendedores(` por `export function fragmentoVendedores(` (línea ~113) y `function bordesUtc(` por `export function bordesUtc(` (línea ~90). No cambia ningún comportamiento.

- [ ] **Step 2: Test que falla para el fix de rubro**

Agregar al final de `<API>/src/repositories/AnaliticaRepository.spec.ts`. Antes de escribirlo, leer el archivo para reusar su forma de mockear `sequelizeWritePlanificacion.query`. Si ya existe un `jest.mock('../database/connection', ...)`, usar ese mismo mock en vez de declararlo de nuevo.

```ts
describe('findObjeciones — filtro por rubro', () => {
    it('exige vi.tipo = rubro además del código', async () => {
        ;(sequelizeWritePlanificacion.query as jest.Mock).mockResolvedValue([])
        await AnaliticaRepository.findObjeciones({ desde: '2026-09-01', hasta: '2026-09-30', rubro: '12' })
        const sql = (sequelizeWritePlanificacion.query as jest.Mock).mock.calls.at(-1)[0] as string
        expect(sql).toContain("AND vi.tipo = 'rubro' AND vi.codigo = :rubro")
    })
})
```

Run: `npx jest src/repositories/AnaliticaRepository.spec.ts -t "filtro por rubro"`
Expected: FAIL (el SQL contiene `AND vi.codigo = :rubro` sin el tipo).

- [ ] **Step 3: Aplicar el fix**

En `findObjeciones`, reemplazar:

```ts
            if (params.rubro) {
                clausulas.push('AND vi.codigo = :rubro')
```

por:

```ts
            // Sin el tipo, una marca (o línea) con el mismo código que el rubro contaba como
            // si fuera ese rubro: pl_ofrecimiento guarda rubro|marca|linea|articulo|accion.
            if (params.rubro) {
                clausulas.push("AND vi.tipo = 'rubro' AND vi.codigo = :rubro")
```

Run: `npx jest src/repositories/AnaliticaRepository.spec.ts`
Expected: PASS (todo el archivo).

- [ ] **Step 4: Tests que fallan para `MetricasRepository`**

`<API>/src/repositories/MetricasRepository.spec.ts`:

```ts
import { MetricasRepository } from './MetricasRepository'
import { sequelizeWritePlanificacion } from '../database/connection'

jest.mock('../database/connection', () => ({ sequelizeWritePlanificacion: { query: jest.fn() } }))
const q = sequelizeWritePlanificacion.query as jest.Mock

beforeEach(() => jest.clearAllMocks())

it('findPlanificadosPorCliente: mismas condiciones que findCobertura, sin agrupar', async () => {
    q.mockResolvedValue([{ vendedor: 'v 2', cliente: 'c1' }])
    const r = await MetricasRepository.findPlanificadosPorCliente({ desde: '2026-09-01', hasta: '2026-09-30' })
    const sql = q.mock.calls[0][0] as string
    expect(sql).toContain('rc.es_extra = 0')
    expect(sql).toContain('rc.deleted_at IS NULL')
    expect(sql).toContain('NOT LIKE :prefijoPrueba')
    expect(sql).not.toContain('GROUP BY')
    expect(r).toEqual([{ vendedor: 'V 2', cliente: 'C1' }])
})

it('findObjecionesDetalladas: filtro de rubro con tipo y marcas del alcance', async () => {
    q.mockResolvedValue([])
    await MetricasRepository.findObjecionesDetalladas({ desde: '2026-09-01', hasta: '2026-09-30', rubro: '12' })
    const [sql, opts] = q.mock.calls[0]
    expect(sql).toContain("m.nivel = 'ofrecimiento'")
    expect(sql).toContain("a.tipo = 'marca'")
    expect(sql).toContain("AND vi.tipo = 'rubro' AND vi.codigo = :rubro")
    expect(opts.replacements.rubro).toBe('12')
})
```

Run: `npx jest src/repositories/MetricasRepository.spec.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 5: Implementar**

`<API>/src/repositories/MetricasRepository.ts`:

```ts
import { QueryTypes } from 'sequelize'
import { sequelizeWritePlanificacion } from '../database/connection'
import { CustomError } from '../utils/errors'
import { IFiltroVendedores, bordesUtc, fragmentoVendedores } from './AnaliticaRepository'

export interface IObjecionDetalladaRow {
    motivo_id: number
    descripcion: string
    ofrecimiento_id: number
    tipo: string
    ofrecimiento_desc: string
    marca_motivo: string | null
    /** Descripciones de pl_ofrecimiento_alcance tipo='marca', unidas con '||'. */
    marcas_alcance: string | null
    cliente: string
    vendedor: string
}

/** Lecturas de pl_* para Métricas a nivel CLIENTE: la analítica existente agrega por
 *  vendedor, y acá hace falta cruzar cada fila contra el conjunto de clientes del filtro. */
export class MetricasRepository {
    static async findPlanificadosPorCliente(
        filtro: IFiltroVendedores,
    ): Promise<{ vendedor: string; cliente: string }[]> {
        try {
            const { clausula, vendedores, prefijoPrueba } = fragmentoVendedores(filtro.vendedores, 'cs')
            const rows = await sequelizeWritePlanificacion.query<{ vendedor: string; cliente: string }>(
                `SELECT cs.codigo_particular_vendedor AS vendedor,
                        rc.codigo_particular_cliente  AS cliente
                   FROM pl_ciclo_semana cs
                   JOIN pl_rotacion_cliente rc ON rc.rotacion_id = cs.rotacion_id
                                              AND rc.semana      = cs.semana
                  WHERE cs.fecha_apertura < :hastaExclusiva
                    AND (cs.fecha_cierre >= :desde OR cs.fecha_cierre IS NULL)
                    AND rc.es_extra = 0
                    AND rc.deleted_at IS NULL
                    ${clausula}`,
                {
                    replacements: { ...bordesUtc(filtro.desde, filtro.hasta), vendedores, prefijoPrueba },
                    type: QueryTypes.SELECT,
                },
            )
            return rows.map(r => ({ vendedor: r.vendedor.toUpperCase(), cliente: r.cliente.toUpperCase() }))
        } catch (err) {
            throw new CustomError(500, `Error fetching planificados por cliente: ${err}`)
        }
    }

    static async findObjecionesDetalladas(params: {
        desde: string
        hasta: string
        vendedores?: string[]
        rubro?: string
    }): Promise<IObjecionDetalladaRow[]> {
        try {
            const scope = fragmentoVendedores(params.vendedores, 'cs')
            const replacements: Record<string, unknown> = {
                ...bordesUtc(params.desde, params.hasta),
                vendedores: scope.vendedores,
                prefijoPrueba: scope.prefijoPrueba,
            }
            let filtroRubro = ''
            if (params.rubro) {
                filtroRubro = "AND vi.tipo = 'rubro' AND vi.codigo = :rubro"
                replacements.rubro = params.rubro
            }
            const rows = await sequelizeWritePlanificacion.query<IObjecionDetalladaRow>(
                `SELECT m.motivo_id, m.descripcion,
                        vi.id AS ofrecimiento_id, vi.tipo, vi.descripcion AS ofrecimiento_desc,
                        vim.marca AS marca_motivo,
                        (SELECT GROUP_CONCAT(a.descripcion SEPARATOR '||')
                           FROM pl_ofrecimiento_alcance a
                          WHERE a.ofrecimiento_id = vi.id AND a.tipo = 'marca') AS marcas_alcance,
                        cc.codigo_particular_cliente  AS cliente,
                        cs.codigo_particular_vendedor AS vendedor
                   FROM pl_ofrecimiento_motivo vim
                   JOIN pl_motivo m         ON m.motivo_id = vim.motivo_id AND m.nivel = 'ofrecimiento'
                   JOIN pl_ofrecimiento vi  ON vi.id = vim.ofrecimiento_id
                   JOIN pl_resolucion r     ON r.id = vi.resolucion_id
                   JOIN pl_rotacion_cliente cc ON cc.id = r.rotacion_cliente_id
                   JOIN pl_ciclo_semana cs ON cs.rotacion_id = cc.rotacion_id
                                          AND cs.semana      = cc.semana
                  WHERE r.fecha_inicio >= :desde AND r.fecha_inicio < :hastaExclusiva
                    ${scope.clausula}
                    ${filtroRubro}`,
                { replacements, type: QueryTypes.SELECT },
            )
            return rows.map(r => ({ ...r, cliente: r.cliente.toUpperCase(), vendedor: r.vendedor.toUpperCase() }))
        } catch (err) {
            throw new CustomError(500, `Error fetching objeciones detalladas: ${err}`)
        }
    }
}
```

- [ ] **Step 6: Correr y verificar**

Run: `npx jest src/repositories/MetricasRepository.spec.ts src/repositories/AnaliticaRepository.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/repositories/MetricasRepository.ts src/repositories/MetricasRepository.spec.ts src/repositories/AnaliticaRepository.ts src/repositories/AnaliticaRepository.spec.ts
git commit -m "feat(metricas): lecturas de pl_* por cliente; fix: el filtro por rubro de objeciones exige tipo='rubro'"
```

---

### Task A4: ConjuntoClientesResolver

**Files:**
- Create: `<API>/src/services/planificacion/ConjuntoClientesResolver.ts`
- Test: `<API>/src/services/planificacion/ConjuntoClientesResolver.spec.ts`

**Interfaces:**
- Consumes: `MetricasWarehouseRepository.findClientesDeVendedores`, `.findMontoPorClienteYSucursal`; `sucursalDominante`, `rangoMesesCerrados`, `aplicarFiltrosGeo`; `RedisService.get/set`; `resolverVendedoresPermitidos` de `AnaliticaService`.
- Produces:
  - `ConjuntoClientesResolver.cartera(scope: string[] | null, hasta: string): Promise<IClienteConjunto[]>`: cartera completa del scope con sucursal, **sin** filtros geo ni de vendedor. Es lo que se cachea.
  - `ConjuntoClientesResolver.resolver(scope: string[] | null, f: IFiltroMetricas, opts?: { ignorarVendedor?: boolean }): Promise<IClienteConjunto[]>`: cartera + filtros geo + (salvo `ignorarVendedor`) el vendedor.

- [ ] **Step 1: Tests que fallan**

`<API>/src/services/planificacion/ConjuntoClientesResolver.spec.ts`:

```ts
import { ConjuntoClientesResolver } from './ConjuntoClientesResolver'
import { MetricasWarehouseRepository } from '../../repositories/MetricasWarehouseRepository'
import { RedisService } from '../cache/RedisService'

jest.mock('../../repositories/MetricasWarehouseRepository')
jest.mock('../cache/RedisService')
const wh = MetricasWarehouseRepository as jest.Mocked<typeof MetricasWarehouseRepository>
const redis = RedisService as jest.Mocked<typeof RedisService>

const fila = (codigo: string, vendedor: string, zona: string, localidad: string) => ({
    codigo, vendedor, nombre: codigo, direccion: null, telefono: null, localidad, zona,
})

beforeEach(() => {
    jest.clearAllMocks()
    redis.get.mockResolvedValue(null)
    redis.set.mockResolvedValue()
    wh.findClientesDeVendedores.mockResolvedValue([
        fila('C1', 'V1', 'Z1', 'CABA'),
        fila('C2', 'V2', 'Z2', 'Rosario'),
    ])
    wh.findMontoPorClienteYSucursal.mockResolvedValue([
        { cliente: 'C1', sucursal: 'BA', monto: 10 },
        { cliente: 'C2', sucursal: 'ROSARIO', monto: 10 },
    ])
})

it('arma la cartera con sucursal dominante sobre los 12 meses cerrados', async () => {
    const r = await ConjuntoClientesResolver.cartera(null, '2026-09-18')
    expect(wh.findMontoPorClienteYSucursal).toHaveBeenCalledWith(['C1', 'C2'], '2025-09-01', '2026-08-31')
    expect(r.map(c => [c.codigo, c.sucursal])).toEqual([['C1', 'BA'], ['C2', 'ROSARIO']])
})

it('usa la caché si hay y no consulta el warehouse', async () => {
    redis.get.mockResolvedValue([{ codigo: 'CX', vendedor: 'V9' }] as any)
    const r = await ConjuntoClientesResolver.cartera(['V9'], '2026-09-18')
    expect(r).toEqual([{ codigo: 'CX', vendedor: 'V9' }])
    expect(wh.findClientesDeVendedores).not.toHaveBeenCalled()
})

it('un fallo al escribir la caché no rompe la respuesta', async () => {
    redis.set.mockRejectedValue(new Error('redis caído'))
    await expect(ConjuntoClientesResolver.cartera(null, '2026-09-18')).resolves.toHaveLength(2)
})

it('resolver aplica vendedor y filtros geo', async () => {
    const r = await ConjuntoClientesResolver.resolver(null, {
        desde: '2026-09-01', hasta: '2026-09-18', vendedor: 'v2', localidad: 'rosario',
    })
    expect(r.map(c => c.codigo)).toEqual(['C2'])
})

it('resolver con ignorarVendedor deja a todos los vendedores (lo usa el ranking)', async () => {
    const r = await ConjuntoClientesResolver.resolver(
        null,
        { desde: '2026-09-01', hasta: '2026-09-18', vendedor: 'V2' },
        { ignorarVendedor: true },
    )
    expect(r).toHaveLength(2)
})

it('un vendedor fuera del scope devuelve vacío', async () => {
    const r = await ConjuntoClientesResolver.resolver(['V1'], { desde: '2026-09-01', hasta: '2026-09-18', vendedor: 'V2' })
    expect(r).toEqual([])
})
```

Run: `npx jest src/services/planificacion/ConjuntoClientesResolver.spec.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 2: Implementar**

`<API>/src/services/planificacion/ConjuntoClientesResolver.ts`:

```ts
import { MetricasWarehouseRepository } from '../../repositories/MetricasWarehouseRepository'
import { RedisService } from '../cache/RedisService'
import { IClienteConjunto, IFiltroMetricas } from '../../types/metricas'
import { aplicarFiltrosGeo, mesDe, rangoMesesCerrados, sucursalDominante } from './indicadores/metricas'

const NAMESPACE = 'metricas-cartera'
const TTL_SEGUNDOS = 300

/**
 * Quién entra en cada número de Métricas. La cartera del scope (con su sucursal dominante)
 * se cachea 5 min por (scope, mes de `hasta`): los tres bloques se piden en paralelo y sin
 * esto cada uno resolvería lo mismo contra el warehouse. Los filtros geo y de vendedor se
 * aplican en memoria sobre la cartera cacheada.
 */
export class ConjuntoClientesResolver {
    static async cartera(scope: string[] | null, hasta: string): Promise<IClienteConjunto[]> {
        const clave = `${scope === null ? '*' : [...scope].map(s => s.toUpperCase()).sort().join(',')}|${mesDe(hasta)}`
        const cacheada = await RedisService.get<IClienteConjunto[]>(NAMESPACE, clave)
        if (cacheada) return cacheada

        const clientes = await MetricasWarehouseRepository.findClientesDeVendedores(scope)
        const rango = rangoMesesCerrados(hasta, 12)
        const montos = await MetricasWarehouseRepository.findMontoPorClienteYSucursal(
            clientes.map(c => c.codigo),
            rango.desde,
            rango.hasta,
        )
        const sucursales = sucursalDominante(montos)
        const cartera = clientes.map(c => ({ ...c, sucursal: sucursales.get(c.codigo) ?? null }))

        try {
            await RedisService.set(NAMESPACE, clave, cartera, { ttl: TTL_SEGUNDOS, compress: true })
        } catch {
            // Sin caché la respuesta sale igual, solo más lenta: no es motivo para un 500.
        }
        return cartera
    }

    static async resolver(
        scope: string[] | null,
        f: IFiltroMetricas,
        opts: { ignorarVendedor?: boolean } = {},
    ): Promise<IClienteConjunto[]> {
        if (f.vendedor && !opts.ignorarVendedor && scope !== null) {
            const enScope = scope.some(s => s.toUpperCase() === f.vendedor!.toUpperCase())
            if (!enScope) return []
        }
        const cartera = await ConjuntoClientesResolver.cartera(scope, f.hasta)
        const geo = aplicarFiltrosGeo(cartera, f)
        if (!f.vendedor || opts.ignorarVendedor) return geo
        const v = f.vendedor.toUpperCase()
        return geo.filter(c => c.vendedor === v)
    }
}
```

- [ ] **Step 3: Correr y verificar**

Run: `npx jest src/services/planificacion/ConjuntoClientesResolver.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/planificacion/ConjuntoClientesResolver.ts src/services/planificacion/ConjuntoClientesResolver.spec.ts
git commit -m "feat(metricas): ConjuntoClientesResolver — cartera del scope con sucursal dominante, cacheada"
```

---

### Task A5: MetricasService.getResumen

**Files:**
- Create: `<API>/src/services/planificacion/MetricasService.ts`
- Modify: `<API>/src/services/planificacion/AnaliticaService.ts` (anteponer `export` a `async function rosterSeguro` y a `function buildNombrePorVendedor`, líneas ~163 y ~174)
- Test: `<API>/src/services/planificacion/MetricasService.spec.ts`

**Interfaces:**
- Consumes:
  - `ConjuntoClientesResolver.resolver(scope, f, { ignorarVendedor: true })`;
  - `MetricasWarehouseRepository.findVentasPorCliente`, `.findSrPorCliente`;
  - `MetricasRepository.findPlanificadosPorCliente`;
  - `AnaliticaRepository.findResolucionesActividad` (filas `{ vendedor, fecha_inicio, fecha_fin, coord_*, codigo_particular_cliente }`);
  - `reducirActividad(rows, criterio)` de `./indicadores/actividad` (Map vendedor → `{ visitasValidas, minutosTotales, ... }`);
  - `CriterioVisitaRepository.findVigente()`, `ObjetivoRepository.findVigentes(hasta)`, `resolverObjetivoVigente`, `prorratearObjetivo`;
  - `contarDiasHabiles`, `esMesCalendarioCompleto`;
  - `rosterSeguro`, `buildNombrePorVendedor`;
  - `fechaNegocio(new Date())` de `../../utils/timezoneNegocio`.
- Produces: `MetricasService.getResumen(scope: string[] | null, f: IFiltroMetricas): Promise<IMetricasResumen>`.

**Reglas (las del spec §3):**
- **Ranking:** usa el conjunto **sin** el filtro de vendedor (el front elige la fila a mostrar). Hay una fila por vendedor presente en la cartera del conjunto.
- **Clientes visitados:** clientes distintos del conjunto con al menos una visita **cerrada** (`fecha_fin` no nulo) en el período. Cada visita se le atribuye al vendedor que la hizo (`row.vendedor`).
- **Visitas válidas y minutos:** salen de `reducirActividad` sobre las filas del conjunto, igual que `/resumen`.
- **Clientes con compra:** clientes de la cartera del vendedor con `facturacion > 0`.
- **Visitados con compra:** clientes visitados por ese vendedor que están en el set con compra.
- **Planificados:** filas del plan de clientes del conjunto. Los planificados con compra son las filas cuyo cliente compró.
- **MMAA:** las mismas consultas con `restarUnAnio(desde)` y `restarUnAnio(hasta)`.
- **Rentabilidad:** `1 − ppCosto/ppVenta`, solo con `esMesCalendarioCompleto` y `ppVenta > 0`. En la fila de equipo sale de las sumas.
- **Objetivos:** `pl_objetivo` prorrateado por vendedor. En la fila de equipo es la suma, y `null` si ningún vendedor tiene objetivo.
- **Días hábiles transcurridos:** `contarDiasHabiles(desde, min(hasta, hoy))`, y 0 si `hoy < desde`.

- [ ] **Step 1: Exportar los helpers de roster en `AnaliticaService.ts`**

`async function rosterSeguro()` → `export async function rosterSeguro()`; `function buildNombrePorVendedor(` → `export function buildNombrePorVendedor(`.

- [ ] **Step 2: Tests que fallan**

`<API>/src/services/planificacion/MetricasService.spec.ts`:

```ts
import { MetricasService } from './MetricasService'
import { ConjuntoClientesResolver } from './ConjuntoClientesResolver'
import { MetricasWarehouseRepository } from '../../repositories/MetricasWarehouseRepository'
import { MetricasRepository } from '../../repositories/MetricasRepository'
import { AnaliticaRepository } from '../../repositories/AnaliticaRepository'
import { ObjetivoRepository } from '../../repositories/ObjetivoRepository'
import { CriterioVisitaRepository } from '../../repositories/CriterioVisitaRepository'
import sellerService from '../sellerService'

jest.mock('./ConjuntoClientesResolver')
jest.mock('../../repositories/MetricasWarehouseRepository')
jest.mock('../../repositories/MetricasRepository')
jest.mock('../../repositories/AnaliticaRepository')
jest.mock('../../repositories/ObjetivoRepository')
jest.mock('../../repositories/CriterioVisitaRepository')
jest.mock('../sellerService')

const conj = ConjuntoClientesResolver as jest.Mocked<typeof ConjuntoClientesResolver>
const wh = MetricasWarehouseRepository as jest.Mocked<typeof MetricasWarehouseRepository>
const mr = MetricasRepository as jest.Mocked<typeof MetricasRepository>
const ar = AnaliticaRepository as jest.Mocked<typeof AnaliticaRepository>
const obj = ObjetivoRepository as jest.Mocked<typeof ObjetivoRepository>
const crit = CriterioVisitaRepository as jest.Mocked<typeof CriterioVisitaRepository>
const sellers = sellerService as jest.Mocked<typeof sellerService>

const c = (codigo: string, vendedor: string) => ({
    codigo, vendedor, nombre: codigo, direccion: null, telefono: null, localidad: null, zona: null, sucursal: 'BA',
})

// Visita cerrada de 30 min, sin coords → no cuenta como válida, pero sí suma minutos y visitados.
const visita = (vendedor: string, cliente: string) => ({
    vendedor,
    fecha_inicio: new Date('2026-09-10T13:00:00Z'),
    fecha_fin: new Date('2026-09-10T13:30:00Z'),
    coord_inicio: null, coord_final: null, coord_cliente: null,
    codigo_particular_cliente: cliente,
})

beforeEach(() => {
    jest.clearAllMocks()
    conj.resolver.mockResolvedValue([c('C1', 'V1'), c('C2', 'V1'), c('C3', 'V2')])
    wh.findVentasPorCliente.mockImplementation(async (_cod, desde) =>
        desde.startsWith('2026')
            ? [
                  { cliente: 'C1', facturacion: 1000, unidades: 5, ppVenta: 1000, ppCosto: 750 },
                  { cliente: 'C3', facturacion: 0, unidades: 0, ppVenta: 0, ppCosto: 0 },
              ]
            : [{ cliente: 'C1', facturacion: 800, unidades: 4, ppVenta: 0, ppCosto: 0 }],
    )
    wh.findSrPorCliente.mockResolvedValue([{ cliente: 'C1', sr: 2 }])
    mr.findPlanificadosPorCliente.mockResolvedValue([
        { vendedor: 'V1', cliente: 'C1' },
        { vendedor: 'V1', cliente: 'C2' },
        { vendedor: 'V1', cliente: 'CX' }, // fuera del conjunto: no cuenta
    ])
    ar.findResolucionesActividad.mockResolvedValue([visita('V1', 'c1'), visita('V1', 'c2'), visita('V1', 'CX')] as any)
    crit.findVigente.mockResolvedValue({ toleranciaMetros: 100, duracionMinMin: 15, duracionMaxMin: null } as any)
    obj.findVigentes.mockResolvedValue([
        { codigo_particular_vendedor: null, visitas_mes: 160, clientes_mes: 140, minutos_mes: 6000 },
    ])
    sellers.getSellersWithZones.mockResolvedValue([
        { codigovendedor: 'V1', razonsocialvend: 'FERNANDEZ' },
        { codigovendedor: 'V2', razonsocialvend: 'GOMEZ' },
    ] as any)
})

it('arma una fila por vendedor de la cartera y la fila de equipo', async () => {
    const r = await MetricasService.getResumen(null, { desde: '2026-09-01', hasta: '2026-09-30' })
    expect(r.vendedores.map(v => v.codigoVendedor)).toEqual(['V1', 'V2'])
    const v1 = r.vendedores[0]
    expect(v1).toMatchObject({
        nombreVendedor: 'FERNANDEZ',
        cartera: 2,
        clientesVisitados: 2,
        minutosTotales: 60,
        clientesConCompra: 1,
        visitadosConCompra: 1,
        planificados: 2,
        planificadosConCompra: 1,
        facturacion: 1000,
        facturacionMmaa: 800,
        unidades: 5,
        unidadesMmaa: 4,
        superRubro: 2,
        rentabilidad: 0.25,
        objetivoVisitas: 160,
    })
    expect(r.equipo).toMatchObject({ codigoVendedor: '', cartera: 3, facturacion: 1000, objetivoVisitas: 320 })
    expect(r.mesCompleto).toBe(true)
})

it('pide el conjunto ignorando el vendedor (el ranking es de todo el equipo filtrado)', async () => {
    await MetricasService.getResumen(null, { desde: '2026-09-01', hasta: '2026-09-30', vendedor: 'V1' })
    expect(conj.resolver).toHaveBeenCalledWith(null, expect.objectContaining({ vendedor: 'V1' }), { ignorarVendedor: true })
})

it('fuera de mes completo la rentabilidad es null', async () => {
    const r = await MetricasService.getResumen(null, { desde: '2026-09-07', hasta: '2026-09-11' })
    expect(r.vendedores[0].rentabilidad).toBeNull()
    expect(r.equipo.rentabilidad).toBeNull()
})

it('MMAA consulta el mismo rango un año antes', async () => {
    await MetricasService.getResumen(null, { desde: '2026-09-01', hasta: '2026-09-30', sucursal: 'MDP' })
    expect(wh.findVentasPorCliente).toHaveBeenCalledWith(expect.any(Array), '2025-09-01', '2025-09-30', 'MDP')
})

it('conjunto vacío devuelve equipo en cero y sin vendedores, sin consultar ventas', async () => {
    conj.resolver.mockResolvedValue([])
    const r = await MetricasService.getResumen(null, { desde: '2026-09-01', hasta: '2026-09-30' })
    expect(r.vendedores).toEqual([])
    expect(r.equipo.cartera).toBe(0)
    expect(wh.findVentasPorCliente).not.toHaveBeenCalled()
})
```

Run: `npx jest src/services/planificacion/MetricasService.spec.ts`
Expected: FAIL ("Cannot find module './MetricasService'").

- [ ] **Step 3: Implementar**

`<API>/src/services/planificacion/MetricasService.ts`:

```ts
import { AnaliticaRepository } from '../../repositories/AnaliticaRepository'
import { CriterioVisitaRepository } from '../../repositories/CriterioVisitaRepository'
import { MetricasRepository } from '../../repositories/MetricasRepository'
import { MetricasWarehouseRepository, IVentaClienteRow } from '../../repositories/MetricasWarehouseRepository'
import { ObjetivoRepository } from '../../repositories/ObjetivoRepository'
import { IFiltroMetricas, IMetricasFila, IMetricasResumen } from '../../types/metricas'
import { fechaNegocio } from '../../utils/timezoneNegocio'
import { buildNombrePorVendedor, rosterSeguro } from './AnaliticaService'
import { ConjuntoClientesResolver } from './ConjuntoClientesResolver'
import { reducirActividad } from './indicadores/actividad'
import { contarDiasHabiles, esMesCalendarioCompleto } from './indicadores/diasHabiles'
import { restarUnAnio } from './indicadores/metricas'
import { prorratearObjetivo, resolverObjetivoVigente } from './indicadores/objetivo'

const filaVacia = (codigoVendedor: string, nombreVendedor: string): IMetricasFila => ({
    codigoVendedor, nombreVendedor,
    cartera: 0, clientesVisitados: 0, visitasValidas: 0, minutosTotales: 0,
    clientesConCompra: 0, visitadosConCompra: 0, planificados: 0, planificadosConCompra: 0,
    facturacion: 0, facturacionMmaa: 0, unidades: 0, unidadesMmaa: 0, superRubro: 0, superRubroMmaa: 0,
    rentabilidad: null, objetivoVisitas: null, objetivoClientes: null, objetivoMinutos: null,
})

const sumarNullable = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : a + b)

const margen = (venta: number, costo: number, mesCompleto: boolean) =>
    mesCompleto && venta > 0 ? 1 - costo / venta : null

function diasTranscurridos(desde: string, hasta: string): number {
    const hoy = fechaNegocio(new Date())
    if (hoy < desde) return 0
    return contarDiasHabiles(desde, hoy < hasta ? hoy : hasta)
}

export class MetricasService {
    static async getResumen(scope: string[] | null, f: IFiltroMetricas): Promise<IMetricasResumen> {
        const mesCompleto = esMesCalendarioCompleto(f.desde, f.hasta)
        const diasHabiles = contarDiasHabiles(f.desde, f.hasta)
        const base = {
            desde: f.desde, hasta: f.hasta, diasHabiles,
            diasHabilesTranscurridos: diasTranscurridos(f.desde, f.hasta), mesCompleto,
        }

        const conjunto = await ConjuntoClientesResolver.resolver(scope, f, { ignorarVendedor: true })
        if (conjunto.length === 0) return { ...base, equipo: filaVacia('', 'Total equipo'), vendedores: [] }

        const codigos = conjunto.map(c => c.codigo)
        const vendedorDe = new Map(conjunto.map(c => [c.codigo, c.vendedor]))
        const vendedores = [...new Set(conjunto.map(c => c.vendedor))].sort()
        const filtroPl = { desde: f.desde, hasta: f.hasta, vendedores: scope ?? undefined }
        const desdeAA = restarUnAnio(f.desde)
        const hastaAA = restarUnAnio(f.hasta)

        const [ventas, ventasAA, sr, srAA, planificados, actividad, criterio, objetivos, roster] =
            await Promise.all([
                MetricasWarehouseRepository.findVentasPorCliente(codigos, f.desde, f.hasta, f.sucursal),
                MetricasWarehouseRepository.findVentasPorCliente(codigos, desdeAA, hastaAA, f.sucursal),
                MetricasWarehouseRepository.findSrPorCliente(codigos, f.desde, f.hasta, f.sucursal),
                MetricasWarehouseRepository.findSrPorCliente(codigos, desdeAA, hastaAA, f.sucursal),
                MetricasRepository.findPlanificadosPorCliente(filtroPl),
                AnaliticaRepository.findResolucionesActividad(filtroPl),
                CriterioVisitaRepository.findVigente(),
                ObjetivoRepository.findVigentes(f.hasta),
                rosterSeguro(),
            ])

        const nombreDe = buildNombrePorVendedor(roster)
        const filas = new Map(vendedores.map(v => [v, filaVacia(v, nombreDe(v))]))
        const filaDe = (v: string) => filas.get(v)
        const pp = new Map(vendedores.map(v => [v, { venta: 0, costo: 0 }]))

        for (const c of conjunto) filaDe(c.vendedor)!.cartera++

        const conCompra = new Set<string>()
        const acumularVenta = (rows: IVentaClienteRow[], esAA: boolean) => {
            for (const r of rows) {
                const v = vendedorDe.get(r.cliente)
                const fila = v ? filaDe(v) : undefined
                if (!fila) continue
                if (esAA) {
                    fila.facturacionMmaa += r.facturacion
                    fila.unidadesMmaa += r.unidades
                    continue
                }
                fila.facturacion += r.facturacion
                fila.unidades += r.unidades
                pp.get(v!)!.venta += r.ppVenta
                pp.get(v!)!.costo += r.ppCosto
                if (r.facturacion > 0) {
                    conCompra.add(r.cliente)
                    fila.clientesConCompra++
                }
            }
        }
        acumularVenta(ventas, false)
        acumularVenta(ventasAA, true)

        for (const r of sr) { const v = vendedorDe.get(r.cliente); if (v) filaDe(v)!.superRubro += r.sr }
        for (const r of srAA) { const v = vendedorDe.get(r.cliente); if (v) filaDe(v)!.superRubroMmaa += r.sr }

        for (const p of planificados) {
            const fila = vendedorDe.has(p.cliente) ? filaDe(p.vendedor) : undefined
            if (!fila) continue
            fila.planificados++
            if (conCompra.has(p.cliente)) fila.planificadosConCompra++
        }

        // Visitas: se atribuyen a quien visitó, pero solo sobre clientes del conjunto.
        const filasActividad = actividad.filter(r => vendedorDe.has(r.codigo_particular_cliente.toUpperCase()))
        const reducido = reducirActividad(
            filasActividad.map(r => ({ ...r, vendedor: r.vendedor.toUpperCase() })),
            criterio,
        )
        const visitados = new Map<string, Set<string>>()
        for (const r of filasActividad) {
            if (!r.fecha_fin) continue
            const v = r.vendedor.toUpperCase()
            if (!visitados.has(v)) visitados.set(v, new Set())
            visitados.get(v)!.add(r.codigo_particular_cliente.toUpperCase())
        }
        for (const [v, clientes] of visitados) {
            const fila = filaDe(v)
            if (!fila) continue
            fila.clientesVisitados = clientes.size
            fila.visitadosConCompra = [...clientes].filter(c => conCompra.has(c)).length
        }
        for (const [v, act] of reducido) {
            const fila = filaDe(v)
            if (!fila) continue
            fila.visitasValidas = act.visitasValidas
            fila.minutosTotales = act.minutosTotales
        }

        for (const fila of filas.values()) {
            const o = resolverObjetivoVigente(objetivos, fila.codigoVendedor)
            if (o) {
                const pr = prorratearObjetivo(o, diasHabiles, mesCompleto)
                fila.objetivoVisitas = pr.visitasMes
                fila.objetivoClientes = pr.clientesMes
                fila.objetivoMinutos = pr.minutosMes
            }
            const m = pp.get(fila.codigoVendedor)!
            fila.rentabilidad = margen(m.venta, m.costo, mesCompleto)
        }

        const lista = [...filas.values()]
        const equipo = filaVacia('', 'Total equipo')
        const numericas: (keyof IMetricasFila)[] = [
            'cartera', 'clientesVisitados', 'visitasValidas', 'minutosTotales', 'clientesConCompra',
            'visitadosConCompra', 'planificados', 'planificadosConCompra', 'facturacion', 'facturacionMmaa',
            'unidades', 'unidadesMmaa', 'superRubro', 'superRubroMmaa',
        ]
        for (const fila of lista) {
            for (const k of numericas) (equipo[k] as number) += fila[k] as number
            equipo.objetivoVisitas = sumarNullable(equipo.objetivoVisitas, fila.objetivoVisitas)
            equipo.objetivoClientes = sumarNullable(equipo.objetivoClientes, fila.objetivoClientes)
            equipo.objetivoMinutos = sumarNullable(equipo.objetivoMinutos, fila.objetivoMinutos)
        }
        const ppEquipo = [...pp.values()].reduce((a, b) => ({ venta: a.venta + b.venta, costo: a.costo + b.costo }), { venta: 0, costo: 0 })
        equipo.rentabilidad = margen(ppEquipo.venta, ppEquipo.costo, mesCompleto)

        return { ...base, equipo, vendedores: lista }
    }
}
```

> Nota para el implementador: si `reducirActividad` tipa sus filas con `IActividadRawRow` y el `.map` de arriba no compila, importar `IActividadRawRow` desde `./indicadores/actividad` y tipar `filasActividad` con eso. La lógica no cambia.

- [ ] **Step 4: Correr y verificar**

Run: `npx jest src/services/planificacion/MetricasService.spec.ts src/services/planificacion/AnaliticaService.spec.ts`
Expected: PASS. La suite de AnaliticaService no se rompe por el `export`.

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/MetricasService.ts src/services/planificacion/MetricasService.spec.ts src/services/planificacion/AnaliticaService.ts
git commit -m "feat(metricas): resumen — ventas, visitas, MMAA, rentabilidad y ranking por vendedor"
```

---

### Task A6: Objeciones y su detalle

**Files:**
- Modify: `<API>/src/services/planificacion/MetricasService.ts`
- Test: `<API>/src/services/planificacion/MetricasService.spec.ts` (nuevo `describe`)

**Interfaces:**
- Consumes: `MetricasRepository.findObjecionesDetalladas`, `.findPlanificadosPorCliente`; `ConjuntoClientesResolver.resolver(scope, f)` (**con** filtro de vendedor); `paginar`, `ordenarPor`; `rosterSeguro`, `buildNombrePorVendedor`.
- Produces:
  - `MetricasService.getObjeciones(scope, f: IFiltroMetricas, rubro?: string): Promise<IObjecionesMetricas>`
  - `MetricasService.getObjecionDetalle(scope, f, motivoId: number, opts: { rubro?: string; pagina: number; cant: number; orden: keyof IClienteObjecion; dir: 'asc' | 'desc' }): Promise<IObjecionDetalle | null>`: devuelve `null` si el motivo no tiene filas.

**Reglas:**
- Cada fila de `pl_ofrecimiento_motivo` cuenta como una objeción, siempre que su cliente esté en el conjunto.
- Una **marca** de la objeción sale de: `tipo = 'marca'` → `ofrecimiento_desc`, cada `marcas_alcance` (split `'||'`) y `marca_motivo`. Se deduplica por ofrecimiento.
- Un **rubro** de la objeción es `ofrecimiento_desc` cuando `tipo = 'rubro'`.
- En el mix de marcas y de rubros, `pct` se calcula sobre la suma del mix y se muestran los 5 primeros.
- La lista de clientes es la de clientes distintos, con los datos del conjunto y el nombre del vendedor tomado del roster.

- [ ] **Step 1: Tests que fallan** (agregar al final de `MetricasService.spec.ts`)

```ts
describe('objeciones', () => {
    const obj = (motivo_id: number, cliente: string, tipo: string, desc: string, extra: Partial<any> = {}) => ({
        motivo_id, descripcion: motivo_id === 1 ? 'Precio' : 'Marca', ofrecimiento_id: Math.random(),
        tipo, ofrecimiento_desc: desc, marca_motivo: null, marcas_alcance: null, cliente, vendedor: 'V1', ...extra,
    })

    beforeEach(() => {
        conj.resolver.mockResolvedValue([c('C1', 'V1'), c('C2', 'V1')])
        mr.findPlanificadosPorCliente.mockResolvedValue([
            { vendedor: 'V1', cliente: 'C1' }, { vendedor: 'V1', cliente: 'C2' },
            { vendedor: 'V1', cliente: 'C1' }, { vendedor: 'V1', cliente: 'C2' },
        ])
        mr.findObjecionesDetalladas.mockResolvedValue([
            obj(1, 'C1', 'rubro', 'BUJES', { marcas_alcance: 'Bosch||NGK' }),
            obj(1, 'C2', 'rubro', 'FILTRO', { marca_motivo: 'Bosch' }),
            obj(1, 'C1', 'marca', 'SKF'),
            obj(2, 'C2', 'rubro', 'BUJES'),
            obj(2, 'CX', 'rubro', 'BUJES'), // fuera del conjunto
        ] as any)
    })

    it('cuenta por motivo sobre el conjunto y trae planificados para la tasa', async () => {
        const r = await MetricasService.getObjeciones(null, { desde: '2026-09-01', hasta: '2026-09-30' })
        expect(r.total).toBe(4)
        expect(r.planificados).toBe(4)
        expect(r.motivos[0]).toEqual({ motivoId: 1, descripcion: 'Precio', cantidad: 3, pct: 0.75 })
    })

    it('pasa el rubro al repositorio', async () => {
        await MetricasService.getObjeciones(null, { desde: '2026-09-01', hasta: '2026-09-30' }, '12')
        expect(mr.findObjecionesDetalladas).toHaveBeenCalledWith(expect.objectContaining({ rubro: '12' }))
    })

    it('detalle: mix de marcas y rubros, clientes distintos paginados', async () => {
        const d = await MetricasService.getObjecionDetalle(null, { desde: '2026-09-01', hasta: '2026-09-30' }, 1, {
            pagina: 1, cant: 8, orden: 'nombre', dir: 'asc',
        })
        expect(d!.marcas[0]).toEqual({ descripcion: 'Bosch', cantidad: 2, pct: 0.5 })
        expect(d!.rubros.map(r => r.descripcion).sort()).toEqual(['BUJES', 'FILTRO'])
        expect(d!.clientes.total).toBe(2)
        expect(d!.clientes.filas[0]).toMatchObject({ codigo: 'C1', vendedor: 'FERNANDEZ' })
    })

    it('detalle de un motivo sin filas → null', async () => {
        const d = await MetricasService.getObjecionDetalle(null, { desde: '2026-09-01', hasta: '2026-09-30' }, 99, {
            pagina: 1, cant: 8, orden: 'nombre', dir: 'asc',
        })
        expect(d).toBeNull()
    })
})
```

Run: `npx jest src/services/planificacion/MetricasService.spec.ts -t objeciones`
Expected: FAIL ("getObjeciones is not a function").

- [ ] **Step 2: Implementar** (agregar a `MetricasService`, y sumar imports de `IObjecionesMetricas`, `IObjecionDetalle`, `IClienteObjecion`, `IConteo` desde `../../types/metricas` y de `paginar`, `ordenarPor` desde `./indicadores/metricas`)

```ts
function top5(conteo: Map<string, number>): IConteo[] {
    const total = [...conteo.values()].reduce((a, b) => a + b, 0)
    return [...conteo]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
        .slice(0, 5)
        .map(([descripcion, cantidad]) => ({ descripcion, cantidad, pct: total > 0 ? cantidad / total : 0 }))
}

const sumar = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
```

Métodos dentro de `export class MetricasService`:

```ts
    private static async objecionesDelConjunto(scope: string[] | null, f: IFiltroMetricas, rubro?: string) {
        const conjunto = await ConjuntoClientesResolver.resolver(scope, f)
        const porCodigo = new Map(conjunto.map(c => [c.codigo, c]))
        if (conjunto.length === 0) return { porCodigo, filas: [] as Awaited<ReturnType<typeof MetricasRepository.findObjecionesDetalladas>> }
        const filas = await MetricasRepository.findObjecionesDetalladas({
            desde: f.desde, hasta: f.hasta, vendedores: scope ?? undefined, rubro,
        })
        return { porCodigo, filas: filas.filter(r => porCodigo.has(r.cliente)) }
    }

    static async getObjeciones(scope: string[] | null, f: IFiltroMetricas, rubro?: string): Promise<IObjecionesMetricas> {
        const [{ porCodigo, filas }, planificados] = await Promise.all([
            MetricasService.objecionesDelConjunto(scope, f, rubro),
            MetricasRepository.findPlanificadosPorCliente({ desde: f.desde, hasta: f.hasta, vendedores: scope ?? undefined }),
        ])
        const porMotivo = new Map<number, { descripcion: string; cantidad: number }>()
        for (const r of filas) {
            const m = porMotivo.get(r.motivo_id) ?? { descripcion: r.descripcion, cantidad: 0 }
            m.cantidad++
            porMotivo.set(r.motivo_id, m)
        }
        const total = filas.length
        return {
            total,
            planificados: planificados.filter(p => porCodigo.has(p.cliente)).length,
            motivos: [...porMotivo]
                .map(([motivoId, m]) => ({ motivoId, ...m, pct: total > 0 ? m.cantidad / total : 0 }))
                .sort((a, b) => b.cantidad - a.cantidad),
        }
    }

    static async getObjecionDetalle(
        scope: string[] | null,
        f: IFiltroMetricas,
        motivoId: number,
        opts: { rubro?: string; pagina: number; cant: number; orden: keyof IClienteObjecion; dir: 'asc' | 'desc' },
    ): Promise<IObjecionDetalle | null> {
        const [{ porCodigo, filas }, roster] = await Promise.all([
            MetricasService.objecionesDelConjunto(scope, f, opts.rubro),
            rosterSeguro(),
        ])
        const delMotivo = filas.filter(r => r.motivo_id === motivoId)
        if (delMotivo.length === 0) return null

        const marcas = new Map<string, number>()
        const rubros = new Map<string, number>()
        const clientes = new Set<string>()
        for (const r of delMotivo) {
            clientes.add(r.cliente)
            if (r.tipo === 'rubro') sumar(rubros, r.ofrecimiento_desc)
            const deEsta = new Set<string>()
            if (r.tipo === 'marca') deEsta.add(r.ofrecimiento_desc)
            for (const m of (r.marcas_alcance ?? '').split('||')) if (m) deEsta.add(m)
            if (r.marca_motivo) deEsta.add(r.marca_motivo)
            for (const m of deEsta) sumar(marcas, m)
        }

        const nombreDe = buildNombrePorVendedor(roster)
        const filasClientes: IClienteObjecion[] = [...clientes].map(codigo => {
            const c = porCodigo.get(codigo)!
            return {
                codigo, nombre: c.nombre, direccion: c.direccion, telefono: c.telefono,
                localidad: c.localidad, vendedor: nombreDe(c.vendedor) || c.vendedor,
            }
        })

        return {
            motivoId,
            descripcion: delMotivo[0].descripcion,
            marcas: top5(marcas),
            rubros: top5(rubros),
            clientes: paginar(ordenarPor(filasClientes, opts.orden, opts.dir), opts.pagina, opts.cant),
        }
    }
```

- [ ] **Step 3: Correr y verificar**

Run: `npx jest src/services/planificacion/MetricasService.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/planificacion/MetricasService.ts src/services/planificacion/MetricasService.spec.ts
git commit -m "feat(metricas): objeciones por motivo con tasa, y detalle con mix de marcas/rubros y clientes"
```

---

### Task A7: Categorías, clientes de tramo y opciones

**Files:**
- Modify: `<API>/src/services/planificacion/MetricasService.ts`
- Test: `<API>/src/services/planificacion/MetricasService.spec.ts` (nuevo `describe`)

**Interfaces:**
- Consumes: `MetricasWarehouseRepository.findFacturacionMensual`, `.findZonas`; `ConjuntoClientesResolver.resolver`, `.cartera`; `tramoDeFacturacion`, `mesDe`, `sumarMeses`, `paginar`, `ordenarPor`; `BRANCH_DISPLAY_NAMES` de `../../config/constants`.
- Produces:
  - `MetricasService.getCategorias(scope, f): Promise<ICategoriasMetricas>`
  - `MetricasService.getClientesDeTramo(scope, f, tramo: Tramo, opts: { pagina; cant; orden: keyof IClienteTramo; dir }): Promise<IClientesDeTramo>`
  - `MetricasService.getOpciones(scope, hasta: string): Promise<IOpcionesMetricas>`

**Reglas:**
- **Mes clasificado:** `M = mesDe(f.hasta)`. Se lee la facturación mensual de `M−6 .. M` en **una** consulta.
- **Tramos:** tramo actual = `tramoDeFacturacion(monto(M))`; tramo anterior = `tramoDeFacturacion(monto(M−1))`.
- **Subieron / bajaron:** comparan el índice de cada cliente en `TRAMOS`: si el actual es mayor, subió; si es menor, bajó.
- **Promedio 6M:** el promedio de `M−6 .. M−1`, contando como 0 los meses sin fila.
- **Variación:** `(actual − p6) / p6`, y `null` si `p6 ≤ 0`.
- **Clientes sin compras:** los clientes del conjunto que no tienen ninguna fila caen en `sinCompras`.
- **Opciones:**
  - las sucursales salen de las claves de `BRANCH_DISPLAY_NAMES`, salvo `UNKNOWN`;
  - las zonas son las presentes en la cartera del scope, con la descripción de `findZonas`;
  - las localidades son las distintas de la cartera, con su zona.

- [ ] **Step 1: Verificar el export de sucursales**

Run: `grep -n "BRANCH_DISPLAY_NAMES" src/config/constants.ts`
Expected: `export const BRANCH_DISPLAY_NAMES: Record<BranchCode, string>`. Si no está exportado, agregarle `export`.

- [ ] **Step 2: Tests que fallan**

```ts
describe('categorías', () => {
    beforeEach(() => {
        conj.resolver.mockResolvedValue([c('C1', 'V1'), c('C2', 'V1'), c('C3', 'V1')])
        wh.findFacturacionMensual.mockResolvedValue([
            { cliente: 'C1', mes: '2026-09', monto: 1_500_000 }, // 1-3M, antes <1M → subió
            { cliente: 'C1', mes: '2026-08', monto: 600_000 },
            { cliente: 'C2', mes: '2026-08', monto: 3_200_000 }, // ahora sin compras → bajó
            { cliente: 'C2', mes: '2026-03', monto: 600_000 },
        ])
    })

    it('clasifica el mes de hasta y compara contra el anterior', async () => {
        const r = await MetricasService.getCategorias(null, { desde: '2026-09-01', hasta: '2026-09-30' })
        expect(wh.findFacturacionMensual).toHaveBeenCalledWith(['C1', 'C2', 'C3'], '2026-03', '2026-09', undefined)
        expect(r.mes).toBe('2026-09')
        expect(r.tramos).toEqual([
            { tramo: 'sinCompras', cantidad: 2 },
            { tramo: 'menos1M', cantidad: 0 },
            { tramo: 'entre1y3M', cantidad: 1 },
            { tramo: 'entre3y5M', cantidad: 0 },
            { tramo: 'mas5M', cantidad: 0 },
        ])
        expect(r.subieron).toBe(1)
        expect(r.bajaron).toBe(1)
    })

    it('clientes de un tramo con promedio de los 6 meses cerrados y variación', async () => {
        const r = await MetricasService.getClientesDeTramo(null, { desde: '2026-09-01', hasta: '2026-09-30' }, 'sinCompras', {
            pagina: 1, cant: 8, orden: 'promedio6m', dir: 'desc',
        })
        expect(r.total).toBe(2)
        expect(r.filas[0]).toEqual({ codigo: 'C2', nombre: 'C2', actual: 0, promedio6m: 3_800_000 / 6, variacion: -1 })
        expect(r.filas[1]).toMatchObject({ codigo: 'C3', promedio6m: 0, variacion: null })
    })
})

describe('opciones', () => {
    it('sucursales fijas, zonas y localidades de la cartera del scope', async () => {
        conj.cartera.mockResolvedValue([
            { ...c('C1', 'V1'), zona: '01', localidad: 'CABA' },
            { ...c('C2', 'V1'), zona: '01', localidad: 'CABA' },
        ])
        wh.findZonas.mockResolvedValue([{ codigo: '01', descripcion: 'Capital' }, { codigo: '02', descripcion: 'Norte' }])
        const r = await MetricasService.getOpciones(null, '2026-09-30')
        expect(r.sucursales.map(s => s.codigo)).toEqual(expect.arrayContaining(['BA', 'MDP', 'PICO', 'ROSARIO']))
        expect(r.sucursales.map(s => s.codigo)).not.toContain('UNKNOWN')
        expect(r.zonas).toEqual([{ codigo: '01', descripcion: 'Capital' }])
        expect(r.localidades).toEqual([{ localidad: 'CABA', zona: '01' }])
    })
})
```

Run: `npx jest src/services/planificacion/MetricasService.spec.ts -t "categorías|opciones"`
Expected: FAIL.

- [ ] **Step 3: Implementar** (imports adicionales: `ICategoriasMetricas`, `IClienteTramo`, `IClientesDeTramo`, `IOpcionesMetricas`, `Tramo`, `TRAMOS` desde `../../types/metricas`; `tramoDeFacturacion`, `mesDe`, `sumarMeses` desde `./indicadores/metricas`; `BRANCH_DISPLAY_NAMES` desde `../../config/constants`)

```ts
    private static async facturacionPorCliente(scope: string[] | null, f: IFiltroMetricas) {
        const conjunto = await ConjuntoClientesResolver.resolver(scope, f)
        const mes = mesDe(f.hasta)
        const meses = new Map<string, Map<string, number>>()
        if (conjunto.length > 0) {
            const filas = await MetricasWarehouseRepository.findFacturacionMensual(
                conjunto.map(c => c.codigo), sumarMeses(mes, -6), mes, f.sucursal,
            )
            for (const r of filas) {
                if (!meses.has(r.cliente)) meses.set(r.cliente, new Map())
                meses.get(r.cliente)!.set(r.mes, r.monto)
            }
        }
        const montoDe = (cliente: string, ym: string) => meses.get(cliente)?.get(ym) ?? 0
        return { conjunto, mes, montoDe }
    }

    static async getCategorias(scope: string[] | null, f: IFiltroMetricas): Promise<ICategoriasMetricas> {
        const { conjunto, mes, montoDe } = await MetricasService.facturacionPorCliente(scope, f)
        const cantidades = new Map<Tramo, number>(TRAMOS.map(t => [t, 0]))
        let subieron = 0
        let bajaron = 0
        for (const c of conjunto) {
            const actual = tramoDeFacturacion(montoDe(c.codigo, mes))
            const antes = tramoDeFacturacion(montoDe(c.codigo, sumarMeses(mes, -1)))
            cantidades.set(actual, cantidades.get(actual)! + 1)
            const delta = TRAMOS.indexOf(actual) - TRAMOS.indexOf(antes)
            if (delta > 0) subieron++
            if (delta < 0) bajaron++
        }
        return { mes, tramos: TRAMOS.map(tramo => ({ tramo, cantidad: cantidades.get(tramo)! })), subieron, bajaron }
    }

    static async getClientesDeTramo(
        scope: string[] | null,
        f: IFiltroMetricas,
        tramo: Tramo,
        opts: { pagina: number; cant: number; orden: keyof IClienteTramo; dir: 'asc' | 'desc' },
    ): Promise<IClientesDeTramo> {
        const { conjunto, mes, montoDe } = await MetricasService.facturacionPorCliente(scope, f)
        const filas: IClienteTramo[] = conjunto
            .filter(c => tramoDeFacturacion(montoDe(c.codigo, mes)) === tramo)
            .map(c => {
                const actual = montoDe(c.codigo, mes)
                let suma = 0
                for (let i = 1; i <= 6; i++) suma += montoDe(c.codigo, sumarMeses(mes, -i))
                const promedio6m = suma / 6
                return {
                    codigo: c.codigo, nombre: c.nombre, actual, promedio6m,
                    variacion: promedio6m > 0 ? (actual - promedio6m) / promedio6m : null,
                }
            })
        return paginar(ordenarPor(filas, opts.orden, opts.dir), opts.pagina, opts.cant)
    }

    static async getOpciones(scope: string[] | null, hasta: string): Promise<IOpcionesMetricas> {
        const [cartera, zonas] = await Promise.all([
            ConjuntoClientesResolver.cartera(scope, hasta),
            MetricasWarehouseRepository.findZonas(),
        ])
        const zonasPresentes = new Set(cartera.map(c => c.zona).filter((z): z is string => Boolean(z)))
        const localidades = new Map<string, string | null>()
        for (const c of cartera) if (c.localidad && !localidades.has(c.localidad)) localidades.set(c.localidad, c.zona)
        return {
            sucursales: Object.entries(BRANCH_DISPLAY_NAMES)
                .filter(([codigo]) => codigo !== 'UNKNOWN')
                .map(([codigo, descripcion]) => ({ codigo, descripcion })),
            zonas: zonas.filter(z => zonasPresentes.has(z.codigo)),
            localidades: [...localidades]
                .map(([localidad, zona]) => ({ localidad, zona }))
                .sort((a, b) => a.localidad.localeCompare(b.localidad, 'es')),
        }
    }
```

- [ ] **Step 4: Correr y verificar**

Run: `npx jest src/services/planificacion/MetricasService.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/MetricasService.ts src/services/planificacion/MetricasService.spec.ts src/config/constants.ts
git commit -m "feat(metricas): clientes por tramo de facturación, listado por tramo y opciones de filtros"
```

---

### Task A8: Controller y rutas

**Files:**
- Create: `<API>/src/controllers/metricasController.ts`
- Modify: `<API>/src/routes/analitica.ts`
- Test: `<API>/src/controllers/metricasController.spec.ts`

**Interfaces:**
- Consumes: los 6 métodos de `MetricasService`; `CustomError`.
- Produces las rutas bajo `/planificacion/analitica`:

| Método y ruta | Parámetros |
|---|---|
| `GET /metricas/resumen` | `desde`, `hasta`, `vendedor?`, `sucursal?`, `zona?`, `localidad?` |
| `GET /metricas/objeciones` | los mismos + `rubro?` |
| `GET /metricas/objeciones/:motivoId` | + `rubro?`, `pagina?`, `cant?`, `orden?`, `dir?` |
| `GET /metricas/categorias` | los mismos que resumen |
| `GET /metricas/categorias/:tramo/clientes` | + `pagina?`, `cant?`, `orden?`, `dir?` |
| `GET /metricas/opciones` | `hasta` |

**Validación:**
- `desde` y `hasta` con el mismo formato y chequeos que `parseRangoFechas` (formato, obligatorios y no invertidos).
- `tramo` tiene que estar en `TRAMOS`, y si no, responde 400.
- `motivoId` tiene que ser un entero positivo, y si no, responde 400.
- `orden` tiene que estar en la lista blanca de su endpoint; si no, se usa el default (`nombre` para objeciones, `actual` para tramo).
- `dir` es `'asc'` o `'desc'`; el default es `'asc'` para objeciones y `'desc'` para tramo.
- `cant` va entre 1 y 50, con default 8. `pagina` es ≥ 1, con default 1.
- Si el detalle de objeción da `null`, responde 404.

- [ ] **Step 1: Tests que fallan**

`<API>/src/controllers/metricasController.spec.ts`:

```ts
import { Request, Response } from 'express'
import MetricasController from './metricasController'
import { MetricasService } from '../services/planificacion/MetricasService'

jest.mock('../services/planificacion/MetricasService')
const svc = MetricasService as jest.Mocked<typeof MetricasService>

const res = () => {
    const r: Partial<Response> = {}
    r.status = jest.fn().mockReturnValue(r)
    r.json = jest.fn().mockReturnValue(r)
    return r as Response
}
const req = (query: any, params: any = {}) =>
    ({ query, params, salesScope: { allowedSellerCodes: ['V1'] } }) as unknown as Request

beforeEach(() => jest.clearAllMocks())

it('resumen: 400 sin fechas', async () => {
    const r = res()
    await MetricasController.getResumen(req({}), r)
    expect(r.status).toHaveBeenCalledWith(400)
    expect(svc.getResumen).not.toHaveBeenCalled()
})

it('resumen: pasa scope y filtros al service', async () => {
    svc.getResumen.mockResolvedValue({ ok: true } as any)
    const r = res()
    await MetricasController.getResumen(req({ desde: '2026-09-01', hasta: '2026-09-30', sucursal: 'MDP', zona: '01' }), r)
    expect(svc.getResumen).toHaveBeenCalledWith(['V1'], {
        desde: '2026-09-01', hasta: '2026-09-30', vendedor: undefined, sucursal: 'MDP', zona: '01', localidad: undefined,
    })
    expect(r.json).toHaveBeenCalledWith({ ok: 1, data: { ok: true } })
})

it('clientes de tramo: 400 con un tramo inválido', async () => {
    const r = res()
    await MetricasController.getClientesDeTramo(req({ desde: '2026-09-01', hasta: '2026-09-30' }, { tramo: 'nada' }), r)
    expect(r.status).toHaveBeenCalledWith(400)
})

it('clientes de tramo: orden fuera de lista blanca cae al default y cant se clampa', async () => {
    svc.getClientesDeTramo.mockResolvedValue({ total: 0, pagina: 1, cant: 50, filas: [] })
    await MetricasController.getClientesDeTramo(
        req({ desde: '2026-09-01', hasta: '2026-09-30', orden: 'DROP', cant: '999' }, { tramo: 'mas5M' }),
        res(),
    )
    expect(svc.getClientesDeTramo).toHaveBeenCalledWith(['V1'], expect.any(Object), 'mas5M', {
        pagina: 1, cant: 50, orden: 'actual', dir: 'desc',
    })
})

it('detalle de objeción: 404 si no hay filas', async () => {
    svc.getObjecionDetalle.mockResolvedValue(null)
    const r = res()
    await MetricasController.getObjecionDetalle(req({ desde: '2026-09-01', hasta: '2026-09-30' }, { motivoId: '3' }), r)
    expect(r.status).toHaveBeenCalledWith(404)
})
```

Run: `npx jest src/controllers/metricasController.spec.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 2: Implementar el controller**

`<API>/src/controllers/metricasController.ts`:

```ts
import { Request, Response } from 'express'
import { MetricasService } from '../services/planificacion/MetricasService'
import { CustomError } from '../utils/errors'
import { IClienteObjecion, IClienteTramo, IFiltroMetricas, TRAMOS, Tramo } from '../types/metricas'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ORDEN_OBJECION: (keyof IClienteObjecion)[] = ['nombre', 'direccion', 'telefono', 'localidad', 'vendedor']
const ORDEN_TRAMO: (keyof IClienteTramo)[] = ['nombre', 'actual', 'promedio6m', 'variacion']

const q = (v: unknown): string | undefined => {
    const x = Array.isArray(v) ? v[0] : v
    return typeof x === 'string' && x.trim() !== '' ? x.trim() : undefined
}

function entero(raw: string | undefined, min: number, max: number, def: number): number {
    const n = raw === undefined ? NaN : parseInt(raw, 10)
    return Number.isNaN(n) ? def : Math.min(Math.max(n, min), max)
}

function parseFiltro(req: Request, res: Response): IFiltroMetricas | null {
    const desde = q(req.query.desde)
    const hasta = q(req.query.hasta)
    if (!desde || !hasta || !DATE_RE.test(desde) || !DATE_RE.test(hasta)) {
        res.status(400).json({ ok: 0, error: 'desde y hasta son obligatorios, con formato YYYY-MM-DD' })
        return null
    }
    if (desde > hasta) {
        res.status(400).json({ ok: 0, error: 'desde no puede ser posterior a hasta' })
        return null
    }
    return {
        desde, hasta,
        vendedor: q(req.query.vendedor),
        sucursal: q(req.query.sucursal),
        zona: q(req.query.zona),
        localidad: q(req.query.localidad),
    }
}

function orden<T extends string>(raw: string | undefined, permitidos: T[], def: T): T {
    return raw && (permitidos as string[]).includes(raw) ? (raw as T) : def
}

const dir = (raw: string | undefined, def: 'asc' | 'desc') => (raw === 'asc' || raw === 'desc' ? raw : def)

const scopeDe = (req: Request) => req.salesScope?.allowedSellerCodes ?? null

function respondError(res: Response, err: unknown): void {
    if (err instanceof CustomError) res.status(err.statusCode).json(err.toJSON())
    else if ((err as any)?.statusCode === 503) res.status(503).json({ ok: 0, error: 'El warehouse no está disponible' })
    else res.status(500).json({ ok: 0, error: 'Error inesperado' })
}

export default class MetricasController {
    static async getResumen(req: Request, res: Response): Promise<void> {
        try {
            const f = parseFiltro(req, res)
            if (!f) return
            res.status(200).json({ ok: 1, data: await MetricasService.getResumen(scopeDe(req), f) })
        } catch (err) { respondError(res, err) }
    }

    static async getObjeciones(req: Request, res: Response): Promise<void> {
        try {
            const f = parseFiltro(req, res)
            if (!f) return
            res.status(200).json({ ok: 1, data: await MetricasService.getObjeciones(scopeDe(req), f, q(req.query.rubro)) })
        } catch (err) { respondError(res, err) }
    }

    static async getObjecionDetalle(req: Request, res: Response): Promise<void> {
        try {
            const f = parseFiltro(req, res)
            if (!f) return
            const motivoId = parseInt(String(req.params.motivoId), 10)
            if (!Number.isInteger(motivoId) || motivoId <= 0) {
                res.status(400).json({ ok: 0, error: 'motivoId inválido' })
                return
            }
            const data = await MetricasService.getObjecionDetalle(scopeDe(req), f, motivoId, {
                rubro: q(req.query.rubro),
                pagina: entero(q(req.query.pagina), 1, 1_000_000, 1),
                cant: entero(q(req.query.cant), 1, 50, 8),
                orden: orden(q(req.query.orden), ORDEN_OBJECION, 'nombre'),
                dir: dir(q(req.query.dir), 'asc'),
            })
            if (!data) {
                res.status(404).json({ ok: 0, error: 'Sin objeciones para ese motivo' })
                return
            }
            res.status(200).json({ ok: 1, data })
        } catch (err) { respondError(res, err) }
    }

    static async getCategorias(req: Request, res: Response): Promise<void> {
        try {
            const f = parseFiltro(req, res)
            if (!f) return
            res.status(200).json({ ok: 1, data: await MetricasService.getCategorias(scopeDe(req), f) })
        } catch (err) { respondError(res, err) }
    }

    static async getClientesDeTramo(req: Request, res: Response): Promise<void> {
        try {
            const f = parseFiltro(req, res)
            if (!f) return
            const tramo = String(req.params.tramo) as Tramo
            if (!TRAMOS.includes(tramo)) {
                res.status(400).json({ ok: 0, error: 'tramo inválido' })
                return
            }
            const data = await MetricasService.getClientesDeTramo(scopeDe(req), f, tramo, {
                pagina: entero(q(req.query.pagina), 1, 1_000_000, 1),
                cant: entero(q(req.query.cant), 1, 50, 8),
                orden: orden(q(req.query.orden), ORDEN_TRAMO, 'actual'),
                dir: dir(q(req.query.dir), 'desc'),
            })
            res.status(200).json({ ok: 1, data })
        } catch (err) { respondError(res, err) }
    }

    static async getOpciones(req: Request, res: Response): Promise<void> {
        try {
            const hasta = q(req.query.hasta)
            if (!hasta || !DATE_RE.test(hasta)) {
                res.status(400).json({ ok: 0, error: 'hasta es obligatorio, con formato YYYY-MM-DD' })
                return
            }
            res.status(200).json({ ok: 1, data: await MetricasService.getOpciones(scopeDe(req), hasta) })
        } catch (err) { respondError(res, err) }
    }
}
```

- [ ] **Step 3: Registrar las rutas**

En `<API>/src/routes/analitica.ts`, agregar `import MetricasController from '../controllers/metricasController'` junto a los otros imports, y antes de `export default router`:

```ts
// Pestaña "Métricas" (spec 2026-09-24): un endpoint por bloque, mismo contrato de filtros.
const rutasMetricas: [string, (req: Request, res: Response) => Promise<void>][] = [
    ['/metricas/resumen', MetricasController.getResumen],
    ['/metricas/objeciones', MetricasController.getObjeciones],
    ['/metricas/objeciones/:motivoId', MetricasController.getObjecionDetalle],
    ['/metricas/categorias', MetricasController.getCategorias],
    ['/metricas/categorias/:tramo/clientes', MetricasController.getClientesDeTramo],
    ['/metricas/opciones', MetricasController.getOpciones],
]
for (const [path, handler] of rutasMetricas) {
    router.get(path, authMiddleware, authorize(...ROLES_ANALITICA), salesScopeMiddleware, async (req: Request, res: Response) => {
        handler(req, res)
    })
}
```

- [ ] **Step 4: Correr controller + suite completa + build**

Avisar al usuario antes: "corro la suite completa de api-vendedores".
Run: `npx jest src/controllers/metricasController.spec.ts && npm test && npx tsc --noEmit`
Expected: todo PASS y `tsc` sin errores. Si algún test que ya existía falla, investigarlo antes de seguir: no se "arregla" cambiando el test.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/metricasController.ts src/controllers/metricasController.spec.ts src/routes/analitica.ts
git commit -m "feat(metricas): controller y rutas /planificacion/analitica/metricas/*"
```

- [ ] **Step 6: Prueba manual contra el backend local (solo lectura)**

Levantar `npm run dev` y, con un token de gerencia, pedir:

```
GET /staging/vs/planificacion/analitica/metricas/resumen?desde=2026-09-01&hasta=2026-09-30
```

Verificar:
- que responde `ok: 1`;
- que `equipo.cartera` está en el orden de los miles;
- que `equipo.facturacion` está en pesos, no en millones;
- el tiempo de respuesta, que se anota para el PR.

Si pasa de 10 s, avisar al usuario antes de seguir.

---

# Parte B — app-planificacion

Todos los comandos corren en `C:\Users\matia\OneDrive\Documentos\distri\app-planificacion`, en la rama `feat/pestana-metricas`.

### Task B1: Tipos y aritmética del front

**Files:**
- Create: `src/types/metricas.ts`
- Create: `src/lib/metricas.ts`
- Test: `src/lib/metricas.test.ts`

**Interfaces:**
- Produces:
  - Tipos idénticos a los de `<API>/src/types/metricas.ts` (copiar el archivo entero de la Task A1, Step 1, sin cambios), más `IFiltroMetricas`.
  - `OBJETIVOS_VENTA_POR_VENDEDOR = { facturacionM: 150, unidades: 500, superRubro: 12 }`, `OBJETIVO_TASA_CIERRE = 0.6`.
  - `objetivosVenta(cantidadVendedores: number, diasHabiles: number, mesCompleto: boolean): { facturacion: number; unidades: number; superRubro: number }` (la facturación en pesos).
  - `cumplimiento(real: number, objetivo: number | null): number | null` (en escala 0..1).
  - `razon(num: number, den: number): number | null`
  - `variacion(actual: number, anterior: number): number | null`
  - `proyectar(fila: IMetricasFila, factor: number): IMetricasFila`
  - `factorProyeccion(diasHabiles: number, transcurridos: number): number`
  - `formatMillones(pesos: number): string` → `"311,4"`
  - `claseCumplimiento(pct: number | null): string` (clase Tailwind de texto)
  - `claseBarra(pct: number | null): string` (clase Tailwind de fondo)

- [ ] **Step 1: Crear `src/types/metricas.ts`** copiando el contenido completo de la Task A1, Step 1. Los dos archivos tienen que ser idénticos.

- [ ] **Step 2: Tests que fallan**

`src/lib/metricas.test.ts`:

```ts
import {
    objetivosVenta, cumplimiento, razon, variacion, proyectar, factorProyeccion,
    formatMillones, claseCumplimiento,
} from './metricas'
import type { IMetricasFila } from '@/types/metricas'

const fila = (over: Partial<IMetricasFila> = {}): IMetricasFila => ({
    codigoVendedor: 'V1', nombreVendedor: 'X', cartera: 100, clientesVisitados: 60, visitasValidas: 80,
    minutosTotales: 3000, clientesConCompra: 40, visitadosConCompra: 30, planificados: 90,
    planificadosConCompra: 50, facturacion: 60_000_000, facturacionMmaa: 50_000_000, unidades: 200,
    unidadesMmaa: 210, superRubro: 30, superRubroMmaa: 25, rentabilidad: 0.26,
    objetivoVisitas: 160, objetivoClientes: 140, objetivoMinutos: 6000, ...over,
})

it('objetivos de venta: por vendedor × cantidad, en pesos, prorrateados fuera de mes', () => {
    expect(objetivosVenta(2, 22, true)).toEqual({ facturacion: 300_000_000, unidades: 1000, superRubro: 24 })
    expect(objetivosVenta(1, 11, false)).toEqual({ facturacion: 75_000_000, unidades: 250, superRubro: 6 })
})

it('cumplimiento y razón devuelven null sin denominador', () => {
    expect(cumplimiento(50, 100)).toBe(0.5)
    expect(cumplimiento(50, null)).toBeNull()
    expect(cumplimiento(50, 0)).toBeNull()
    expect(razon(3, 0)).toBeNull()
})

it('variación vs año anterior', () => {
    expect(variacion(110, 100)).toBeCloseTo(0.1)
    expect(variacion(10, 0)).toBeNull()
})

it('factor de proyección: días hábiles del período sobre transcurridos', () => {
    expect(factorProyeccion(22, 11)).toBe(2)
    expect(factorProyeccion(22, 0)).toBe(1)
})

it('proyectar escala acumulados y topea conteos de clientes en la cartera', () => {
    const p = proyectar(fila(), 2)
    expect(p.facturacion).toBe(120_000_000)
    expect(p.minutosTotales).toBe(6000)
    expect(p.clientesVisitados).toBe(100) // 120 topeado a cartera 100
    expect(p.cartera).toBe(100)
    expect(p.rentabilidad).toBe(0.26) // un ratio no se proyecta
    expect(p.objetivoVisitas).toBe(160)
})

it('formatMillones', () => {
    expect(formatMillones(311_400_000)).toBe('311,4')
    expect(formatMillones(0)).toBe('0')
})

it('claseCumplimiento: rojo < 50%, ámbar < 100%, verde ≥ 100%, gris sin dato', () => {
    expect(claseCumplimiento(0.3)).toContain('red')
    expect(claseCumplimiento(0.8)).toContain('amber')
    expect(claseCumplimiento(1)).toContain('emerald')
    expect(claseCumplimiento(null)).toContain('slate')
})
```

Run: `npx vitest run src/lib/metricas.test.ts`
Expected: FAIL ("Failed to resolve import './metricas'").

- [ ] **Step 3: Implementar**

`src/lib/metricas.ts`:

```ts
import { formatNumero } from '@/lib/analiticaFormat'
import type { IMetricasFila } from '@/types/metricas'

/** Objetivos de venta MENSUALES por vendedor. No existen en ninguna tabla: son constantes
 *  a propósito hasta que gerencia defina metas reales (spec 2026-09-24, §3). El 12 de
 *  super rubro viene del mockup y es chico para el SR de la empresa: ajustarlo al ver datos. */
export const OBJETIVOS_VENTA_POR_VENDEDOR = { facturacionM: 150, unidades: 500, superRubro: 12 } as const
export const OBJETIVO_TASA_CIERRE = 0.6

/** Mismo criterio que pl_objetivo en el backend: mes completo usa el objetivo tal cual; si
 *  no, se prorratea sobre un mes típico de 22 días hábiles. */
const DIAS_HABILES_MES_TIPICO = 22

export function objetivosVenta(cantidadVendedores: number, diasHabiles: number, mesCompleto: boolean) {
    const factor = (mesCompleto ? 1 : diasHabiles / DIAS_HABILES_MES_TIPICO) * cantidadVendedores
    return {
        facturacion: OBJETIVOS_VENTA_POR_VENDEDOR.facturacionM * 1_000_000 * factor,
        unidades: OBJETIVOS_VENTA_POR_VENDEDOR.unidades * factor,
        superRubro: OBJETIVOS_VENTA_POR_VENDEDOR.superRubro * factor,
    }
}

export const razon = (num: number, den: number): number | null => (den > 0 ? num / den : null)

export const cumplimiento = (real: number, objetivo: number | null): number | null =>
    objetivo === null ? null : razon(real, objetivo)

export const variacion = (actual: number, anterior: number): number | null =>
    anterior > 0 ? (actual - anterior) / anterior : null

export const factorProyeccion = (diasHabiles: number, transcurridos: number): number =>
    transcurridos > 0 ? diasHabiles / transcurridos : 1

const ACUMULADOS: (keyof IMetricasFila)[] = [
    'visitasValidas', 'minutosTotales', 'facturacion', 'unidades', 'superRubro', 'planificadosConCompra',
]
const CONTEOS_CLIENTES: (keyof IMetricasFila)[] = ['clientesVisitados', 'clientesConCompra', 'visitadosConCompra']

/** "Ver proyectado": escala lo acumulado al ritmo de los días hábiles transcurridos. Los
 *  conteos de clientes no pueden superar la cartera; los ratios, objetivos y el año
 *  anterior no se tocan. */
export function proyectar(fila: IMetricasFila, factor: number): IMetricasFila {
    const p = { ...fila }
    for (const k of ACUMULADOS) (p[k] as number) = (fila[k] as number) * factor
    for (const k of CONTEOS_CLIENTES) (p[k] as number) = Math.min(Math.round((fila[k] as number) * factor), fila.cartera)
    return p
}

export const formatMillones = (pesos: number): string => formatNumero(pesos / 1_000_000)

export function claseCumplimiento(pct: number | null): string {
    if (pct === null) return 'text-slate-400'
    if (pct < 0.5) return 'text-red-600'
    if (pct < 1) return 'text-amber-600'
    return 'text-emerald-600'
}

export function claseBarra(pct: number | null): string {
    if (pct === null) return 'bg-slate-200'
    if (pct < 0.5) return 'bg-red-500'
    if (pct < 1) return 'bg-amber-500'
    return 'bg-emerald-500'
}
```

- [ ] **Step 4: Correr y verificar**

Run: `npx vitest run src/lib/metricas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/metricas.ts src/lib/metricas.ts src/lib/metricas.test.ts
git commit -m "feat(metricas): tipos y aritmética del front (objetivos de venta, cumplimiento, proyección)"
```

---

### Task B2: API, mock y hooks

**Files:**
- Create: `src/mocks/metricasMock.ts`
- Create: `src/api/metricas.ts`
- Create: `src/hooks/useMetricas.ts`
- Test: `src/hooks/useMetricas.test.tsx`

**Interfaces:**
- Consumes: `apiClient` de `./apiClient`; tipos de `@/types/metricas`.
- Produces:
  - `getResumenMetricas(f: IFiltroMetricas): Promise<IMetricasResumen>`
  - `getObjecionesMetricas(f: IFiltroMetricas, rubro?: string): Promise<IObjecionesMetricas>`
  - `getObjecionDetalle(f: IFiltroMetricas, motivoId: number, args: IArgsListado & { rubro?: string }): Promise<IObjecionDetalle>`
  - `getCategoriasMetricas(f: IFiltroMetricas): Promise<ICategoriasMetricas>`
  - `getClientesDeTramo(f: IFiltroMetricas, tramo: Tramo, args: IArgsListado): Promise<IClientesDeTramo>`
  - `getOpcionesMetricas(hasta: string): Promise<IOpcionesMetricas>`
  - `IArgsListado { pagina: number; orden: string; dir: 'asc' | 'desc' }`
  - Hooks: `useResumenMetricas(f)`, `useObjecionesMetricas(f, rubro?)`, `useObjecionDetalle(f, motivoId: number | null, args)`, `useCategoriasMetricas(f)`, `useClientesDeTramo(f, tramo: Tramo | null, args)`, `useOpcionesMetricas(hasta)`.
  - `metricasKeys`.

- [ ] **Step 1: Mock**

`src/mocks/metricasMock.ts`:

```ts
import type {
    ICategoriasMetricas, IClientesDeTramo, IMetricasFila, IMetricasResumen,
    IObjecionDetalle, IObjecionesMetricas, IOpcionesMetricas,
} from '@/types/metricas'

function fila(over: Partial<IMetricasFila> & { codigoVendedor: string; nombreVendedor: string }): IMetricasFila {
    return {
        cartera: 145, clientesVisitados: 119, visitasValidas: 142, minutosTotales: 4932,
        clientesConCompra: 72, visitadosConCompra: 61, planificados: 92, planificadosConCompra: 55,
        facturacion: 132_000_000, facturacionMmaa: 120_000_000, unidades: 430, unidadesMmaa: 450,
        superRubro: 310, superRubroMmaa: 290, rentabilidad: 0.26,
        objetivoVisitas: 160, objetivoClientes: 140, objetivoMinutos: 6000, ...over,
    }
}

const VENDEDORES = [
    fila({ codigoVendedor: 'V 2', nombreVendedor: 'FERNANDEZ MARCELO' }),
    fila({
        codigoVendedor: 'V 5', nombreVendedor: 'GOMEZ SERGIO', cartera: 155, clientesVisitados: 65,
        visitasValidas: 79, minutosTotales: 2454, clientesConCompra: 31, visitadosConCompra: 20,
        planificados: 51, planificadosConCompra: 25, facturacion: 71_000_000, rentabilidad: 0.19,
    }),
    fila({
        codigoVendedor: 'V 9', nombreVendedor: 'MARTINEZ GUSTAVO', cartera: 120, clientesVisitados: 0,
        visitasValidas: 0, minutosTotales: 0, clientesConCompra: 0, visitadosConCompra: 0,
        planificados: 0, planificadosConCompra: 0, facturacion: 0, facturacionMmaa: 0, unidades: 0,
        superRubro: 0, rentabilidad: null,
    }),
]

const sumar = (k: keyof IMetricasFila) => VENDEDORES.reduce((a, v) => a + (v[k] as number), 0)

export const MOCK_RESUMEN_METRICAS: IMetricasResumen = {
    desde: '2026-09-01', hasta: '2026-09-30', diasHabiles: 22, diasHabilesTranscurridos: 13, mesCompleto: true,
    vendedores: VENDEDORES,
    equipo: {
        ...fila({ codigoVendedor: '', nombreVendedor: 'Total equipo' }),
        ...Object.fromEntries(
            (['cartera', 'clientesVisitados', 'visitasValidas', 'minutosTotales', 'clientesConCompra',
              'visitadosConCompra', 'planificados', 'planificadosConCompra', 'facturacion', 'facturacionMmaa',
              'unidades', 'unidadesMmaa', 'superRubro', 'superRubroMmaa', 'objetivoVisitas', 'objetivoClientes',
              'objetivoMinutos'] as (keyof IMetricasFila)[]).map(k => [k, sumar(k)]),
        ),
        rentabilidad: 0.24,
    },
}

export const MOCK_OBJECIONES_METRICAS: IObjecionesMetricas = {
    total: 20, planificados: 143,
    motivos: [
        { motivoId: 1, descripcion: 'Precio', cantidad: 9, pct: 0.45 },
        { motivoId: 2, descripcion: 'Marca', cantidad: 6, pct: 0.3 },
        { motivoId: 3, descripcion: 'Plazo', cantidad: 3, pct: 0.15 },
        { motivoId: 4, descripcion: 'Flete', cantidad: 2, pct: 0.1 },
    ],
}

export const MOCK_OBJECION_DETALLE: IObjecionDetalle = {
    motivoId: 1, descripcion: 'Precio',
    marcas: [{ descripcion: 'Bosch', cantidad: 4, pct: 0.5 }, { descripcion: 'NGK', cantidad: 4, pct: 0.5 }],
    rubros: [{ descripcion: 'BUJES', cantidad: 5, pct: 0.625 }, { descripcion: 'FILTRO', cantidad: 3, pct: 0.375 }],
    clientes: {
        total: 2, pagina: 1, cant: 8,
        filas: [
            { codigo: '06856', nombre: 'Nonno Suspension', direccion: 'Mitre 1200', telefono: '223 555-0101', localidad: 'Mar del Plata', vendedor: 'FERNANDEZ MARCELO' },
            { codigo: '07120', nombre: 'Repuestos del Sur', direccion: 'Colón 450', telefono: null, localidad: 'Mar del Plata', vendedor: 'FERNANDEZ MARCELO' },
        ],
    },
}

export const MOCK_CATEGORIAS: ICategoriasMetricas = {
    mes: '2026-09',
    tramos: [
        { tramo: 'sinCompras', cantidad: 210 }, { tramo: 'menos1M', cantidad: 120 },
        { tramo: 'entre1y3M', cantidad: 60 }, { tramo: 'entre3y5M', cantidad: 20 }, { tramo: 'mas5M', cantidad: 10 },
    ],
    subieron: 32, bajaron: 41,
}

export const MOCK_CLIENTES_TRAMO: IClientesDeTramo = {
    total: 2, pagina: 1, cant: 8,
    filas: [
        { codigo: '06856', nombre: 'Nonno Suspension', actual: 8_600_000, promedio6m: 13_500_000, variacion: -0.363 },
        { codigo: '07120', nombre: 'Repuestos del Sur', actual: 5_100_000, promedio6m: 4_000_000, variacion: 0.275 },
    ],
}

export const MOCK_OPCIONES: IOpcionesMetricas = {
    sucursales: [
        { codigo: 'BA', descripcion: 'Buenos Aires' }, { codigo: 'MDP', descripcion: 'Mar del Plata' },
        { codigo: 'PICO', descripcion: 'Pico' }, { codigo: 'ROSARIO', descripcion: 'Rosario' },
    ],
    zonas: [{ codigo: '01', descripcion: 'Costa Atlántica' }, { codigo: '02', descripcion: 'Rosario y Gran Rosario' }],
    localidades: [
        { localidad: 'Mar del Plata', zona: '01' }, { localidad: 'Miramar', zona: '01' },
        { localidad: 'Rosario', zona: '02' },
    ],
}
```

- [ ] **Step 2: API**

`src/api/metricas.ts`:

```ts
import { apiClient } from './apiClient'
import {
    MOCK_CATEGORIAS, MOCK_CLIENTES_TRAMO, MOCK_OBJECION_DETALLE, MOCK_OBJECIONES_METRICAS,
    MOCK_OPCIONES, MOCK_RESUMEN_METRICAS,
} from '@/mocks/metricasMock'
import type {
    ICategoriasMetricas, IClientesDeTramo, IFiltroMetricas, IMetricasResumen,
    IObjecionDetalle, IObjecionesMetricas, IOpcionesMetricas, Tramo,
} from '@/types/metricas'

const USA_MOCK = import.meta.env.VITE_ANALITICA_MOCK === '1'
const DELAY_MS = import.meta.env.DEV ? 250 : 0
const esperar = () => new Promise(r => setTimeout(r, DELAY_MS))

const BASE = '/planificacion/analitica/metricas'

export interface IArgsListado {
    pagina: number
    orden: string
    dir: 'asc' | 'desc'
}

export const getResumenMetricas = async (f: IFiltroMetricas): Promise<IMetricasResumen> => {
    if (USA_MOCK) { await esperar(); return { ...MOCK_RESUMEN_METRICAS, desde: f.desde, hasta: f.hasta } }
    return (await apiClient.get(`${BASE}/resumen`, { params: f })).data.data
}

export const getObjecionesMetricas = async (f: IFiltroMetricas, rubro?: string): Promise<IObjecionesMetricas> => {
    if (USA_MOCK) { await esperar(); return MOCK_OBJECIONES_METRICAS }
    return (await apiClient.get(`${BASE}/objeciones`, { params: { ...f, rubro } })).data.data
}

export const getObjecionDetalle = async (
    f: IFiltroMetricas, motivoId: number, args: IArgsListado & { rubro?: string },
): Promise<IObjecionDetalle> => {
    if (USA_MOCK) { await esperar(); return { ...MOCK_OBJECION_DETALLE, motivoId } }
    return (await apiClient.get(`${BASE}/objeciones/${motivoId}`, { params: { ...f, ...args, cant: 8 } })).data.data
}

export const getCategoriasMetricas = async (f: IFiltroMetricas): Promise<ICategoriasMetricas> => {
    if (USA_MOCK) { await esperar(); return MOCK_CATEGORIAS }
    return (await apiClient.get(`${BASE}/categorias`, { params: f })).data.data
}

export const getClientesDeTramo = async (f: IFiltroMetricas, tramo: Tramo, args: IArgsListado): Promise<IClientesDeTramo> => {
    if (USA_MOCK) { await esperar(); return MOCK_CLIENTES_TRAMO }
    return (await apiClient.get(`${BASE}/categorias/${tramo}/clientes`, { params: { ...f, ...args, cant: 8 } })).data.data
}

export const getOpcionesMetricas = async (hasta: string): Promise<IOpcionesMetricas> => {
    if (USA_MOCK) { await esperar(); return MOCK_OPCIONES }
    return (await apiClient.get(`${BASE}/opciones`, { params: { hasta } })).data.data
}
```

- [ ] **Step 3: Test que falla para los hooks**

`src/hooks/useMetricas.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useResumenMetricas, useObjecionDetalle, useClientesDeTramo, metricasKeys } from './useMetricas'
import * as api from '@/api/metricas'

vi.mock('@/api/metricas')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const F = { desde: '2026-09-01', hasta: '2026-09-30', sucursal: 'MDP' }
const ARGS = { pagina: 1, orden: 'nombre', dir: 'asc' as const }

beforeEach(() => vi.clearAllMocks())

it('useResumenMetricas pide con el filtro', async () => {
    ;(api.getResumenMetricas as any).mockResolvedValue({})
    const { result } = renderHook(() => useResumenMetricas(F), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getResumenMetricas).toHaveBeenCalledWith(F)
})

it('el detalle de objeción y los clientes de tramo no piden sin selección', async () => {
    const d = renderHook(() => useObjecionDetalle(F, null, ARGS), { wrapper })
    const t = renderHook(() => useClientesDeTramo(F, null, ARGS), { wrapper })
    await waitFor(() => expect(d.result.current.fetchStatus).toBe('idle'))
    await waitFor(() => expect(t.result.current.fetchStatus).toBe('idle'))
    expect(api.getObjecionDetalle).not.toHaveBeenCalled()
    expect(api.getClientesDeTramo).not.toHaveBeenCalled()
})

it('las claves incluyen todos los filtros geo', () => {
    const a = metricasKeys.resumen({ ...F, zona: '01' })
    const b = metricasKeys.resumen({ ...F, zona: '02' })
    expect(a).not.toEqual(b)
})
```

Run: `npx vitest run src/hooks/useMetricas.test.tsx`
Expected: FAIL ("Failed to resolve import './useMetricas'").

- [ ] **Step 4: Implementar los hooks**

`src/hooks/useMetricas.ts`:

```ts
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
    getCategoriasMetricas, getClientesDeTramo, getObjecionDetalle, getObjecionesMetricas,
    getOpcionesMetricas, getResumenMetricas, type IArgsListado,
} from '@/api/metricas'
import type { IFiltroMetricas, Tramo } from '@/types/metricas'

const clave = (f: IFiltroMetricas) =>
    [f.desde, f.hasta, f.vendedor ?? '', f.sucursal ?? '', f.zona ?? '', f.localidad ?? ''] as const

export const metricasKeys = {
    resumen: (f: IFiltroMetricas) => ['metricas', 'resumen', ...clave(f)] as const,
    objeciones: (f: IFiltroMetricas, rubro?: string) => ['metricas', 'objeciones', ...clave(f), rubro ?? ''] as const,
    detalle: (f: IFiltroMetricas, motivoId: number, a: IArgsListado & { rubro?: string }) =>
        ['metricas', 'objecion', ...clave(f), motivoId, a.rubro ?? '', a.pagina, a.orden, a.dir] as const,
    categorias: (f: IFiltroMetricas) => ['metricas', 'categorias', ...clave(f)] as const,
    tramo: (f: IFiltroMetricas, tramo: Tramo, a: IArgsListado) =>
        ['metricas', 'tramo', ...clave(f), tramo, a.pagina, a.orden, a.dir] as const,
    opciones: (hasta: string) => ['metricas', 'opciones', hasta.slice(0, 7)] as const,
}

export function useResumenMetricas(f: IFiltroMetricas) {
    return useQuery({ queryKey: metricasKeys.resumen(f), queryFn: () => getResumenMetricas(f) })
}

export function useObjecionesMetricas(f: IFiltroMetricas, rubro?: string) {
    return useQuery({ queryKey: metricasKeys.objeciones(f, rubro), queryFn: () => getObjecionesMetricas(f, rubro) })
}

/** Solo se pide al tocar una tarjeta: `motivoId` null = nada abierto. */
export function useObjecionDetalle(f: IFiltroMetricas, motivoId: number | null, a: IArgsListado & { rubro?: string }) {
    return useQuery({
        queryKey: metricasKeys.detalle(f, motivoId ?? 0, a),
        queryFn: () => getObjecionDetalle(f, motivoId as number, a),
        enabled: motivoId !== null,
        // Cambiar de página no debe vaciar la tabla mientras llega la siguiente.
        placeholderData: keepPreviousData,
    })
}

export function useCategoriasMetricas(f: IFiltroMetricas) {
    return useQuery({ queryKey: metricasKeys.categorias(f), queryFn: () => getCategoriasMetricas(f) })
}

export function useClientesDeTramo(f: IFiltroMetricas, tramo: Tramo | null, a: IArgsListado) {
    return useQuery({
        queryKey: metricasKeys.tramo(f, tramo ?? 'sinCompras', a),
        queryFn: () => getClientesDeTramo(f, tramo as Tramo, a),
        enabled: tramo !== null,
        placeholderData: keepPreviousData,
    })
}

/** Las opciones de zona/localidad cambian con la cartera, no con el día: una por mes. */
export function useOpcionesMetricas(hasta: string) {
    return useQuery({
        queryKey: metricasKeys.opciones(hasta),
        queryFn: () => getOpcionesMetricas(hasta),
        staleTime: 30 * 60 * 1000,
    })
}
```

- [ ] **Step 5: Correr y verificar**

Run: `npx vitest run src/hooks/useMetricas.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/mocks/metricasMock.ts src/api/metricas.ts src/hooks/useMetricas.ts src/hooks/useMetricas.test.tsx
git commit -m "feat(metricas): api, fixtures de mock y hooks por bloque"
```

---

### Task B3: Rango de fechas en SelectorPeriodo, pestaña, ruta, página y filtros

**Files:**
- Modify: `src/components/analitica/SelectorPeriodo.tsx`, `src/components/analitica/SelectorPeriodo.test.tsx`
- Modify: `src/components/analitica/AnaliticaTabs.tsx`, `src/components/analitica/AnaliticaTabs.test.tsx`
- Modify: `src/App.tsx`
- Create: `src/components/metricas/FiltrosMetricas.tsx`, `src/components/metricas/FiltrosMetricas.test.tsx`
- Create: `src/pages/AnaliticaMetricasPage.tsx` (en este task solo encabezado y filtros; los bloques se agregan en B4-B7)

**Interfaces:**
- `SelectorPeriodo` gana props opcionales, y sin ellas se comporta exactamente como antes:
  - `ModoPeriodo = 'semana' | 'mes' | 'rango'`;
  - `conRango?: boolean`, `rango?: { desde: string; hasta: string }`, `onCambiarRango?: (r: { desde: string; hasta: string }) => void`.
- `FiltrosMetricas` recibe `props: { valor: IValorFiltros; onCambiar: (v: IValorFiltros) => void; vendedores: { codigo: string; nombre: string }[]; opciones?: IOpcionesMetricas }`, con `IValorFiltros = { vendedor?: string; sucursal?: string; zona?: string; localidad?: string }` exportado.
- Para B4-B7, la página expone el `filtro: IFiltroMetricas` completo (lo usan objeciones y categorías) y `filtroSinVendedor` (lo usa el resumen).

- [ ] **Step 1: Tests que fallan de SelectorPeriodo** (agregar al final de `SelectorPeriodo.test.tsx`, y sumar `fireEvent` al import de `@testing-library/react`)

```tsx
it('sin conRango no muestra el botón de rango', () => {
    render(<SelectorPeriodo modo="mes" fecha={new Date(2026, 7, 18)} onCambiarModo={vi.fn()} onCambiarFecha={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Rango de fechas' })).not.toBeInTheDocument()
})

it('en modo rango muestra dos fechas y notifica el cambio', async () => {
    const onCambiarRango = vi.fn()
    render(
        <SelectorPeriodo
            modo="rango" fecha={new Date(2026, 8, 18)} conRango
            rango={{ desde: '2026-09-01', hasta: '2026-09-18' }}
            onCambiarModo={vi.fn()} onCambiarFecha={vi.fn()} onCambiarRango={onCambiarRango}
        />,
    )
    // fireEvent y no userEvent.type: en jsdom tipear un input[type=date] carácter por
    // carácter es poco confiable; lo que importa es qué se notifica con un valor completo.
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-05' } })
    expect(onCambiarRango).toHaveBeenLastCalledWith({ desde: '2026-09-05', hasta: '2026-09-18' })
})
```

Run: `npx vitest run src/components/analitica/SelectorPeriodo.test.tsx`
Expected: FAIL en los dos casos nuevos.

- [ ] **Step 2: Implementar el modo rango en SelectorPeriodo**

Aplicar estos cambios en `SelectorPeriodo.tsx`:
- `export type ModoPeriodo = 'semana' | 'mes' | 'rango'`.
- Sumar a `SelectorPeriodoProps`: `conRango?: boolean`, `rango?: { desde: string; hasta: string }` y `onCambiarRango?: (r: { desde: string; hasta: string }) => void`.
- `DIAS_POR_PASO` pasa a ser `Record<Exclude<ModoPeriodo, 'rango'>, number>`.
- Cambiar la desestructuración a `{ modo, fecha, onCambiarModo, onCambiarFecha, conRango, rango, onCambiarRango }`.
- Reemplazar el botón "Mes" para que solo lleve `rounded-r-md` cuando no hay rango, y agregar el tercer botón:

```tsx
                <button
                    type="button"
                    onClick={() => cambiarModo('mes')}
                    className={`${conRango ? '' : 'rounded-r-md'} px-2 py-1 ${
                        modo === 'mes' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                    Mes
                </button>
                {conRango && (
                    <button
                        type="button"
                        onClick={() => cambiarModo('rango')}
                        className={`rounded-r-md px-2 py-1 ${
                            modo === 'rango' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                        Rango de fechas
                    </button>
                )}
```

- Reemplazar el bloque de flechas (`<div className="flex items-center gap-2">…</div>`) por:

```tsx
            {modo === 'rango' && rango ? (
                <div className="flex items-center gap-2 text-sm">
                    <label className="flex items-center gap-1 text-slate-600">
                        Desde
                        <input
                            type="date" aria-label="Desde" value={rango.desde} max={rango.hasta}
                            onChange={e => e.target.value && onCambiarRango?.({ ...rango, desde: e.target.value })}
                            className="rounded-md border border-slate-300 px-2 py-1 text-slate-900"
                        />
                    </label>
                    <label className="flex items-center gap-1 text-slate-600">
                        Hasta
                        <input
                            type="date" aria-label="Hasta" value={rango.hasta} min={rango.desde}
                            onChange={e => e.target.value && onCambiarRango?.({ ...rango, hasta: e.target.value })}
                            className="rounded-md border border-slate-300 px-2 py-1 text-slate-900"
                        />
                    </label>
                </div>
            ) : (
                /* el <div className="flex items-center gap-2"> original con las flechas, sin cambios */
            )}
```

(Pegar dentro del `: (...)` el bloque original de flechas y etiqueta, sin tocarlo.)

- En `avanzar`, arriba de todo: `if (modo === 'rango') return`.

Run: `npx vitest run src/components/analitica/SelectorPeriodo.test.tsx`
Expected: PASS (los tests viejos y los nuevos).

- [ ] **Step 3: Pestaña — test que falla** (agregar a `AnaliticaTabs.test.tsx`)

```tsx
it('apunta la pestaña Métricas a /analitica/metricas y la marca activa', () => {
    render(
        <MemoryRouter initialEntries={['/analitica/metricas']}>
            <AnaliticaTabs />
        </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Métricas' })
    expect(link).toHaveAttribute('href', '/analitica/metricas')
    expect(link).toHaveClass('border-slate-900')
})
```

Run: `npx vitest run src/components/analitica/AnaliticaTabs.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Agregar la pestaña y la ruta**

En `AnaliticaTabs.tsx`, después del `NavLink` de "Datos del comercio":

```tsx
            <NavLink
                to="/analitica/metricas"
                className={({ isActive }) => tabClase(isActive)}
            >
                Métricas
            </NavLink>
```

En `App.tsx`: `import AnaliticaMetricasPage from '@/pages/AnaliticaMetricasPage'`, y dentro del bloque `ProtectedRoute permitir={supervisa}` agregar debajo de `/analitica/fichas`:

```tsx
                            <Route path="/analitica/metricas" element={<AnaliticaMetricasPage />} />
```

- [ ] **Step 5: FiltrosMetricas — test que falla**

`src/components/metricas/FiltrosMetricas.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import FiltrosMetricas from './FiltrosMetricas'
import { MOCK_OPCIONES } from '@/mocks/metricasMock'

const VENDEDORES = [{ codigo: 'V 2', nombre: 'FERNANDEZ' }]

it('cambiar un filtro geográfico resetea el vendedor', async () => {
    const onCambiar = vi.fn()
    render(<FiltrosMetricas valor={{ vendedor: 'V 2' }} onCambiar={onCambiar} vendedores={VENDEDORES} opciones={MOCK_OPCIONES} />)
    await userEvent.selectOptions(screen.getByLabelText('Sucursal'), 'MDP')
    expect(onCambiar).toHaveBeenCalledWith({ sucursal: 'MDP', vendedor: undefined })
})

it('cambiar la zona limpia la localidad y la lista de localidades se acota a la zona', async () => {
    const onCambiar = vi.fn()
    const { rerender } = render(
        <FiltrosMetricas valor={{ localidad: 'Rosario' }} onCambiar={onCambiar} vendedores={VENDEDORES} opciones={MOCK_OPCIONES} />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Zona'), '01')
    expect(onCambiar).toHaveBeenCalledWith({ zona: '01', localidad: undefined, vendedor: undefined })

    rerender(<FiltrosMetricas valor={{ zona: '01' }} onCambiar={onCambiar} vendedores={VENDEDORES} opciones={MOCK_OPCIONES} />)
    const localidades = screen.getByLabelText('Localidad')
    expect(localidades).toHaveTextContent('Miramar')
    expect(localidades).not.toHaveTextContent('Rosario')
})

it('elegir vendedor no toca los filtros geográficos', async () => {
    const onCambiar = vi.fn()
    render(<FiltrosMetricas valor={{ zona: '01' }} onCambiar={onCambiar} vendedores={VENDEDORES} opciones={MOCK_OPCIONES} />)
    await userEvent.selectOptions(screen.getByLabelText('Vendedor'), 'V 2')
    expect(onCambiar).toHaveBeenCalledWith({ zona: '01', vendedor: 'V 2' })
})
```

Run: `npx vitest run src/components/metricas/FiltrosMetricas.test.tsx`
Expected: FAIL ("Failed to resolve import").

- [ ] **Step 6: Implementar FiltrosMetricas**

`src/components/metricas/FiltrosMetricas.tsx`:

```tsx
import type { IOpcionesMetricas } from '@/types/metricas'

export interface IValorFiltros {
    vendedor?: string
    sucursal?: string
    zona?: string
    localidad?: string
}

interface FiltrosMetricasProps {
    valor: IValorFiltros
    onCambiar: (v: IValorFiltros) => void
    vendedores: { codigo: string; nombre: string }[]
    opciones?: IOpcionesMetricas
}

const CLASE_SELECT =
    'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 sm:w-48'

function Select({ label, value, onChange, opciones, todas }: {
    label: string
    value?: string
    onChange: (v: string | undefined) => void
    opciones: { value: string; label: string }[]
    todas: string
}) {
    return (
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-500">
            {label}
            <select
                aria-label={label}
                value={value ?? ''}
                onChange={e => onChange(e.target.value || undefined)}
                className={CLASE_SELECT}
            >
                <option value="">{todas}</option>
                {opciones.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
        </label>
    )
}

/** Vendedor · Sucursal · Zona · Localidad. Un filtro geográfico cambia QUÉ clientes entran,
 *  así que resetea al vendedor elegido (igual que el mockup): si no, se podría quedar
 *  mirando un vendedor que ya no tiene clientes en el recorte. */
export default function FiltrosMetricas({ valor, onCambiar, vendedores, opciones }: FiltrosMetricasProps) {
    const localidades = (opciones?.localidades ?? []).filter(l => !valor.zona || l.zona === valor.zona)

    return (
        <div className="flex flex-wrap gap-3">
            <Select
                label="Vendedor" todas="Equipo completo" value={valor.vendedor}
                opciones={vendedores.map(v => ({ value: v.codigo, label: v.nombre }))}
                onChange={vendedor => onCambiar({ ...valor, vendedor })}
            />
            <Select
                label="Sucursal" todas="Todas" value={valor.sucursal}
                opciones={(opciones?.sucursales ?? []).map(s => ({ value: s.codigo, label: s.descripcion }))}
                onChange={sucursal => onCambiar({ ...valor, sucursal, vendedor: undefined })}
            />
            <Select
                label="Zona" todas="Todas" value={valor.zona}
                opciones={(opciones?.zonas ?? []).map(z => ({ value: z.codigo, label: z.descripcion }))}
                onChange={zona => onCambiar({ ...valor, zona, localidad: undefined, vendedor: undefined })}
            />
            <Select
                label="Localidad" todas="Todas" value={valor.localidad}
                opciones={localidades.map(l => ({ value: l.localidad, label: l.localidad }))}
                onChange={localidad => onCambiar({ ...valor, localidad, vendedor: undefined })}
            />
        </div>
    )
}
```

Run: `npx vitest run src/components/metricas/FiltrosMetricas.test.tsx`
Expected: PASS.

- [ ] **Step 7: Página (encabezado + filtros; los bloques se agregan en B4-B7)**

`src/pages/AnaliticaMetricasPage.tsx`:

```tsx
import { useState } from 'react'
import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import SelectorPeriodo, { type ModoPeriodo } from '@/components/analitica/SelectorPeriodo'
import FiltrosMetricas, { type IValorFiltros } from '@/components/metricas/FiltrosMetricas'
import { useOpcionesMetricas, useResumenMetricas } from '@/hooks/useMetricas'
import { incluyeHoy, isoLocal, rangoMes, rangoSemana } from '@/lib/fechas'
import type { IFiltroMetricas } from '@/types/metricas'

/** "Métricas": ventas + visitas + objeciones + cartera, sobre el mismo recorte de clientes.
 *  Spec docs/superpowers/specs/2026-09-24-pestana-metricas-gerencia-design.md. */
export default function AnaliticaMetricasPage() {
    const [modo, setModo] = useState<ModoPeriodo>('mes')
    const [fecha, setFecha] = useState(() => new Date())
    const [rango, setRango] = useState(() => ({ desde: rangoMes(new Date()).desde, hasta: isoLocal(new Date()) }))
    const [geo, setGeo] = useState<IValorFiltros>({})
    const [proyectado, setProyectado] = useState(false)

    const periodo = modo === 'mes' ? rangoMes(fecha) : modo === 'semana' ? rangoSemana(fecha) : rango
    const filtro: IFiltroMetricas = { ...periodo, ...geo }
    const puedeProyectar = modo === 'mes' && incluyeHoy(periodo.desde, periodo.hasta)

    const { data: opciones } = useOpcionesMetricas(periodo.hasta)
    // El resumen va SIN vendedor: el backend lo ignora igual (el ranking es de todo el recorte
    // y la fila elegida la resuelve el front), así que incluirlo solo duplicaría la caché y
    // volvería a pedir lo mismo al elegir un vendedor. Además es el roster del filtro de
    // vendedor: los vendedores con cartera dentro del recorte geográfico.
    const filtroSinVendedor: IFiltroMetricas = {
        ...periodo, sucursal: geo.sucursal, zona: geo.zona, localidad: geo.localidad,
    }
    const resumen = useResumenMetricas(filtroSinVendedor)
    const vendedores = (resumen.data?.vendedores ?? []).map(v => ({ codigo: v.codigoVendedor, nombre: v.nombreVendedor }))

    return (
        <div className="min-h-screen bg-slate-50">
            <EncabezadoAnalitica>
                <div className="flex flex-wrap items-end justify-between gap-4 px-6 py-3">
                    <FiltrosMetricas valor={geo} onCambiar={setGeo} vendedores={vendedores} opciones={opciones} />
                    <div className="flex items-center gap-3">
                        <SelectorPeriodo
                            modo={modo} fecha={fecha} conRango rango={rango}
                            onCambiarModo={m => { setModo(m); setProyectado(false) }}
                            onCambiarFecha={setFecha} onCambiarRango={setRango}
                        />
                        {puedeProyectar && (
                            <button
                                type="button"
                                aria-pressed={proyectado}
                                onClick={() => setProyectado(p => !p)}
                                className={`rounded-md border px-2 py-1 text-xs ${
                                    proyectado ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                            >
                                Ver proyectado
                            </button>
                        )}
                    </div>
                </div>
            </EncabezadoAnalitica>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                {/* B4-B7 agregan acá: BloqueVentas, BloqueObjeciones, BloqueCategorias, RankingVendedores */}
            </main>
        </div>
    )
}
```

> El comentario del `<main>` es un marcador temporal que B4 reemplaza. No queda en el código final.

- [ ] **Step 8: Correr todo lo tocado y commitear**

Run: `npx vitest run src/components/analitica src/components/metricas src/router`
Expected: PASS.

```bash
git add src/components/analitica/SelectorPeriodo.tsx src/components/analitica/SelectorPeriodo.test.tsx src/components/analitica/AnaliticaTabs.tsx src/components/analitica/AnaliticaTabs.test.tsx src/App.tsx src/components/metricas/FiltrosMetricas.tsx src/components/metricas/FiltrosMetricas.test.tsx src/pages/AnaliticaMetricasPage.tsx
git commit -m "feat(metricas): pestaña y ruta, filtros geográficos y modo rango de fechas"
```

---

### Task B4: Bloque de ventas

**Files:**
- Create: `src/components/metricas/BloqueVentas.tsx`, `src/components/metricas/BloqueVentas.test.tsx`
- Modify: `src/pages/AnaliticaMetricasPage.tsx`

**Interfaces:**
- Consumes: `useResumenMetricas` (el resultado se pasa por prop, porque la página ya lo tiene), `objetivosVenta`, `cumplimiento`, `razon`, `variacion`, `proyectar`, `factorProyeccion`, `formatMillones`, `claseCumplimiento`, `claseBarra`, `OBJETIVO_TASA_CIERRE`; `formatNumero`, `formatHoras`, `formatPct` de `@/lib/analiticaFormat`; `KpiTile`, `HelpPopover`.
- Props: `{ query: UseQueryResult<IMetricasResumen>; vendedor?: string; proyectado: boolean }`.

**Qué muestra:**
- **Fila elegida:** con `vendedor` es la de ese vendedor en `data.vendedores`; si no, `data.equipo`. `cantidadVendedores` vale 1 con vendedor y `data.vendedores.length` con el equipo.
- **Proyectado:** con `proyectado`, la fila pasa por `proyectar(fila, factorProyeccion(diasHabiles, diasHabilesTranscurridos))` y aparece una nota "Proyectado a fin de mes con el ritmo de N de M días hábiles".
- **Tres tiles de venta** (Facturación $M, Unidades, Super Rubro) con `TileMeta`:
  - el título;
  - `real / objetivo`;
  - una barra con `claseBarra`;
  - el % de cumplimiento con `claseCumplimiento`;
  - "±N% vs año anterior", o "s/d vs año anterior" si no hay dato.
- **Cuatro `KpiTile` de visita:**
  - Cantidad de visitas: `visitasValidas`, con meta `objetivoVisitas`.
  - Clientes visitados: `clientesVisitados`, con meta `objetivoClientes`.
  - Tasa de cierre: `visitadosConCompra / clientesVisitados`, con meta 60%.
  - Horas totales: `minutosTotales`, con meta `objetivoMinutos`.
- **KpiTile de rentabilidad:** `formatPct(rentabilidad)`. Si es `null` y `!mesCompleto`, lleva `ayuda` "La rentabilidad se calcula sobre meses completos."
- **Estados:** "Cargando…"; error con botón "Volver a intentar" que llama a `query.refetch()`; y con `cartera === 0`, "Sin clientes para estos filtros."

- [ ] **Step 1: Test que falla**

`src/components/metricas/BloqueVentas.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import BloqueVentas from './BloqueVentas'
import { MOCK_RESUMEN_METRICAS } from '@/mocks/metricasMock'

const q = (over: any = {}) => ({ data: MOCK_RESUMEN_METRICAS, isLoading: false, isError: false, refetch: vi.fn(), ...over }) as any

it('muestra el equipo con objetivos × cantidad de vendedores', () => {
    render(<BloqueVentas query={q()} proyectado={false} />)
    // 3 vendedores × 150 $M = 450
    expect(screen.getByTestId('tile-facturacion')).toHaveTextContent('/ 450')
})

it('con vendedor muestra su fila y objetivo individual', () => {
    render(<BloqueVentas query={q()} vendedor="V 2" proyectado={false} />)
    expect(screen.getByTestId('tile-facturacion')).toHaveTextContent('132 / 150')
    expect(screen.getByTestId('tile-facturacion')).toHaveTextContent('+10% vs año anterior')
})

it('tasa de cierre = visitados con compra / visitados', () => {
    render(<BloqueVentas query={q()} vendedor="V 2" proyectado={false} />)
    // 61 / 119 = 51%
    expect(screen.getByText('51%')).toBeInTheDocument()
})

it('rentabilidad null fuera de mes se muestra s/d', () => {
    const data = { ...MOCK_RESUMEN_METRICAS, mesCompleto: false, equipo: { ...MOCK_RESUMEN_METRICAS.equipo, rentabilidad: null } }
    render(<BloqueVentas query={q({ data })} proyectado={false} />)
    expect(screen.getByTestId('tile-rentabilidad')).toHaveTextContent('s/d')
})

it('proyectado escala la facturación y lo aclara', () => {
    render(<BloqueVentas query={q()} vendedor="V 2" proyectado />)
    // 132 × 22/13 = 223,4
    expect(screen.getByTestId('tile-facturacion')).toHaveTextContent('223,4')
    expect(screen.getByText(/proyectado a fin de mes/i)).toBeInTheDocument()
})

it('error ofrece reintentar', async () => {
    const refetch = vi.fn()
    render(<BloqueVentas query={q({ data: undefined, isError: true, refetch })} proyectado={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }))
    expect(refetch).toHaveBeenCalled()
})

it('cartera vacía: mensaje explícito', () => {
    const data = { ...MOCK_RESUMEN_METRICAS, vendedores: [], equipo: { ...MOCK_RESUMEN_METRICAS.equipo, cartera: 0 } }
    render(<BloqueVentas query={q({ data })} proyectado={false} />)
    expect(screen.getByText('Sin clientes para estos filtros.')).toBeInTheDocument()
})
```

Run: `npx vitest run src/components/metricas/BloqueVentas.test.tsx`
Expected: FAIL ("Failed to resolve import").

- [ ] **Step 2: Implementar**

`src/components/metricas/BloqueVentas.tsx`:

```tsx
import type { UseQueryResult } from '@tanstack/react-query'
import KpiTile from '@/components/analitica/KpiTile'
import { formatHoras, formatNumero, formatPct } from '@/lib/analiticaFormat'
import {
    OBJETIVO_TASA_CIERRE, claseBarra, claseCumplimiento, cumplimiento, factorProyeccion,
    formatMillones, objetivosVenta, proyectar, razon, variacion,
} from '@/lib/metricas'
import type { IMetricasResumen } from '@/types/metricas'

interface BloqueVentasProps {
    query: UseQueryResult<IMetricasResumen>
    vendedor?: string
    proyectado: boolean
}

interface TileMetaProps {
    testId: string
    titulo: string
    real: string
    objetivo: string
    unidad: string
    pct: number | null
    varAA: number | null
}

const signo = (v: number) => (v >= 0 ? '+' : '')

function TileMeta({ testId, titulo, real, objetivo, unidad, pct, varAA }: TileMetaProps) {
    return (
        <div data-testid={testId} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
                {real} <span className="text-base font-normal text-slate-400">/ {objetivo} {unidad}</span>
            </p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                <div
                    className={`h-1.5 rounded-full ${claseBarra(pct)}`}
                    style={{ width: `${Math.min((pct ?? 0) * 100, 100)}%` }}
                />
            </div>
            <div className="mt-1 flex justify-between text-xs">
                <span className={`font-medium ${claseCumplimiento(pct)}`}>{formatPct(pct)}</span>
                <span className={varAA === null ? 'text-slate-400' : varAA >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {varAA === null ? 's/d' : `${signo(varAA)}${Math.round(varAA * 100)}%`} vs año anterior
                </span>
            </div>
        </div>
    )
}

export default function BloqueVentas({ query, vendedor, proyectado }: BloqueVentasProps) {
    const { data, isLoading, isError, refetch } = query

    return (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Métricas de ventas</h2>

            {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

            {isError && (
                <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    No se pudieron cargar las métricas.
                    <button type="button" onClick={() => refetch()} className="font-medium underline">
                        Volver a intentar
                    </button>
                </div>
            )}

            {data && (() => {
                const base = vendedor
                    ? data.vendedores.find(v => v.codigoVendedor === vendedor)
                    : data.equipo
                if (!base || base.cartera === 0) {
                    return <p className="text-sm text-slate-500">Sin clientes para estos filtros.</p>
                }
                const factor = factorProyeccion(data.diasHabiles, data.diasHabilesTranscurridos)
                const f = proyectado ? proyectar(base, factor) : base
                const obj = objetivosVenta(vendedor ? 1 : data.vendedores.length, data.diasHabiles, data.mesCompleto)
                const tasaCierre = razon(f.visitadosConCompra, f.clientesVisitados)

                return (
                    <>
                        {proyectado && (
                            <p className="text-xs text-amber-600">
                                Proyectado a fin de mes con el ritmo de {data.diasHabilesTranscurridos} de {data.diasHabiles} días hábiles.
                            </p>
                        )}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <TileMeta
                                testId="tile-facturacion" titulo="Facturación" unidad="$M"
                                real={formatMillones(f.facturacion)} objetivo={formatMillones(obj.facturacion)}
                                pct={cumplimiento(f.facturacion, obj.facturacion)}
                                varAA={variacion(f.facturacion, f.facturacionMmaa)}
                            />
                            <TileMeta
                                testId="tile-unidades" titulo="Unidades" unidad="u."
                                real={formatNumero(f.unidades)} objetivo={formatNumero(obj.unidades)}
                                pct={cumplimiento(f.unidades, obj.unidades)}
                                varAA={variacion(f.unidades, f.unidadesMmaa)}
                            />
                            <TileMeta
                                testId="tile-super-rubro" titulo="Super Rubro" unidad="SR"
                                real={formatNumero(f.superRubro)} objetivo={formatNumero(obj.superRubro)}
                                pct={cumplimiento(f.superRubro, obj.superRubro)}
                                varAA={variacion(f.superRubro, f.superRubroMmaa)}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                            <KpiTile
                                titulo="Cantidad de visitas" valor={formatNumero(f.visitasValidas)}
                                meta={`Objetivo: ${formatNumero(f.objetivoVisitas)} · ${formatPct(cumplimiento(f.visitasValidas, f.objetivoVisitas))}`}
                            />
                            <KpiTile
                                titulo="Clientes visitados" valor={formatNumero(f.clientesVisitados)}
                                meta={`Objetivo: ${formatNumero(f.objetivoClientes)} · ${formatPct(cumplimiento(f.clientesVisitados, f.objetivoClientes))}`}
                            />
                            <KpiTile
                                titulo="Tasa de cierre" valor={formatPct(tasaCierre)}
                                meta={`Objetivo: ${formatPct(OBJETIVO_TASA_CIERRE)}`}
                                ayuda="Clientes visitados que además compraron en el período, sobre clientes visitados."
                            />
                            <KpiTile
                                titulo="Horas totales" valor={formatHoras(f.minutosTotales)}
                                meta={`Objetivo: ${formatHoras(f.objetivoMinutos)} · ${formatPct(cumplimiento(f.minutosTotales, f.objetivoMinutos))}`}
                            />
                            <div data-testid="tile-rentabilidad">
                                <KpiTile
                                    titulo="Rentabilidad de cartera" valor={formatPct(f.rentabilidad)}
                                    ayuda={!data.mesCompleto ? 'La rentabilidad se calcula sobre meses completos.' : undefined}
                                />
                            </div>
                        </div>
                    </>
                )
            })()}
        </section>
    )
}
```

- [ ] **Step 3: Montarlo en la página**

En `AnaliticaMetricasPage.tsx`: `import BloqueVentas from '@/components/metricas/BloqueVentas'`, y reemplazar el comentario del `<main>` por:

```tsx
                <BloqueVentas query={resumen} vendedor={geo.vendedor} proyectado={proyectado && puedeProyectar} />
```

- [ ] **Step 4: Correr y verificar**

Run: `npx vitest run src/components/metricas/BloqueVentas.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/metricas/BloqueVentas.tsx src/components/metricas/BloqueVentas.test.tsx src/pages/AnaliticaMetricasPage.tsx
git commit -m "feat(metricas): bloque de ventas — facturación, unidades, SR, visitas, tasa de cierre y rentabilidad"
```

---

### Task B5: Objeciones y su detalle

**Files:**
- Create: `src/components/metricas/Paginador.tsx`
- Create: `src/components/metricas/BloqueObjeciones.tsx`, `src/components/metricas/DetalleObjecion.tsx`, `src/components/metricas/BloqueObjeciones.test.tsx`
- Modify: `src/pages/AnaliticaMetricasPage.tsx`

**Interfaces:**
- `Paginador` recibe `{ pagina: number; total: number; cant: number; onCambiar: (p: number) => void }` y dibuja "← Anterior · Página N de M · Siguiente →". Los botones se deshabilitan en los bordes, y no se renderiza con 1 página.
- `BloqueObjeciones` recibe `{ filtro: IFiltroMetricas }` y maneja su propio estado de `rubro`, `abierto`, `pagina`, `orden` y `dir`.
- El selector de rubro sale del catálogo que ya existe en api-vendedores, `GET /sale/rubro/catalog`: no se crea un endpoint nuevo. Se pide con un `useQuery` inline con `staleTime: Infinity`. Los nombres de campo (`code`/`description`) se confirman en el Step 1.

- [ ] **Step 1: Verificar la forma de `/sale/rubro/catalog`**

Run (en `<API>`): `grep -n "rubro/catalog" -A30 src/routes/sale.ts | head -50`
Anotar la forma de la respuesta, es decir, los nombres de los campos de código y descripción, y usarlos en el `map` del Step 3.

- [ ] **Step 2: Test que falla**

`src/components/metricas/BloqueObjeciones.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import BloqueObjeciones from './BloqueObjeciones'
import * as api from '@/api/metricas'
import { apiClient } from '@/api/apiClient'
import { MOCK_OBJECION_DETALLE, MOCK_OBJECIONES_METRICAS } from '@/mocks/metricasMock'

vi.mock('@/api/metricas')
vi.mock('@/api/apiClient', () => ({ apiClient: { get: vi.fn() } }))

const F = { desde: '2026-09-01', hasta: '2026-09-30' }

function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={qc}><BloqueObjeciones filtro={F} /></QueryClientProvider>)
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getObjecionesMetricas as any).mockResolvedValue(MOCK_OBJECIONES_METRICAS)
    ;(api.getObjecionDetalle as any).mockResolvedValue(MOCK_OBJECION_DETALLE)
    ;(apiClient.get as any).mockResolvedValue({ data: { data: [] } })
})

it('muestra una tarjeta por motivo y la tasa de objeciones', async () => {
    montar()
    expect(await screen.findByRole('button', { name: /Precio/ })).toHaveTextContent('9')
    // 20 / 143 = 14%
    expect(screen.getByTestId('tasa-objeciones')).toHaveTextContent('14%')
})

it('tocar una tarjeta abre el detalle con marcas, rubros y clientes; tocarla de nuevo lo cierra', async () => {
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /Precio/ }))
    const detalle = await screen.findByTestId('detalle-objecion')
    expect(within(detalle).getByText('Nonno Suspension')).toBeInTheDocument()
    expect(within(detalle).getByText('Bosch')).toBeInTheDocument()
    expect(within(detalle).getByText('BUJES')).toBeInTheDocument()
    expect(api.getObjecionDetalle).toHaveBeenCalledWith(F, 1, expect.objectContaining({ pagina: 1, orden: 'nombre' }))

    await userEvent.click(screen.getByRole('button', { name: /Precio/ }))
    expect(screen.queryByTestId('detalle-objecion')).not.toBeInTheDocument()
})

it('ordenar por columna vuelve a pedir con esa orden', async () => {
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /Precio/ }))
    await screen.findByTestId('detalle-objecion')
    await userEvent.click(screen.getByRole('button', { name: /Localidad/ }))
    expect(api.getObjecionDetalle).toHaveBeenLastCalledWith(F, 1, expect.objectContaining({ orden: 'localidad' }))
})

it('sin objeciones muestra un vacío', async () => {
    ;(api.getObjecionesMetricas as any).mockResolvedValue({ total: 0, planificados: 10, motivos: [] })
    montar()
    expect(await screen.findByText('Sin objeciones en este período.')).toBeInTheDocument()
})
```

Run: `npx vitest run src/components/metricas/BloqueObjeciones.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/components/metricas/Paginador.tsx`:

```tsx
interface PaginadorProps {
    pagina: number
    total: number
    cant: number
    onCambiar: (p: number) => void
}

export default function Paginador({ pagina, total, cant, onCambiar }: PaginadorProps) {
    const paginas = Math.max(1, Math.ceil(total / cant))
    if (paginas <= 1) return null
    const boton = 'text-sm text-slate-700 hover:text-slate-900 disabled:text-slate-300'
    return (
        <div className="flex items-center justify-between pt-2">
            <button type="button" className={boton} disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)}>
                ← Anterior
            </button>
            <span className="text-xs text-slate-500">Página {pagina} de {paginas}</span>
            <button type="button" className={boton} disabled={pagina >= paginas} onClick={() => onCambiar(pagina + 1)}>
                Siguiente →
            </button>
        </div>
    )
}
```

`src/components/metricas/DetalleObjecion.tsx`:

```tsx
import Paginador from './Paginador'
import { formatPct } from '@/lib/analiticaFormat'
import type { IClienteObjecion, IConteo, IObjecionDetalle } from '@/types/metricas'

const COLUMNAS: { clave: keyof IClienteObjecion; titulo: string }[] = [
    { clave: 'nombre', titulo: 'Cliente' },
    { clave: 'direccion', titulo: 'Dirección' },
    { clave: 'telefono', titulo: 'Teléfono' },
    { clave: 'localidad', titulo: 'Localidad' },
    { clave: 'vendedor', titulo: 'Vendedor' },
]

function Mix({ titulo, items }: { titulo: string; items: IConteo[] }) {
    return (
        <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
            {items.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">s/d</p>
            ) : (
                <ul className="mt-2 space-y-1">
                    {items.map(i => (
                        <li key={i.descripcion} className="flex justify-between text-sm">
                            <span className="text-slate-800">{i.descripcion}</span>
                            <span className="tabular-nums text-slate-500">{i.cantidad} · {formatPct(i.pct)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

interface DetalleObjecionProps {
    detalle: IObjecionDetalle
    orden: keyof IClienteObjecion
    dir: 'asc' | 'desc'
    onOrdenar: (clave: keyof IClienteObjecion) => void
    onPagina: (p: number) => void
}

export default function DetalleObjecion({ detalle, orden, dir, onOrdenar, onPagina }: DetalleObjecionProps) {
    return (
        <div data-testid="detalle-objecion" className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-900">
                Objeción “{detalle.descripcion}” · {detalle.clientes.total} clientes
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Mix titulo="Marcas que más se repiten" items={detalle.marcas} />
                <Mix titulo="Rubros que más se repiten" items={detalle.rubros} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            {COLUMNAS.map(c => (
                                <th key={c.clave} className="px-3 py-2 text-left">
                                    <button type="button" onClick={() => onOrdenar(c.clave)} className="uppercase hover:text-slate-900">
                                        {c.titulo}{orden === c.clave ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {detalle.clientes.filas.map(cl => (
                            <tr key={cl.codigo} className="border-b border-slate-100">
                                <td className="px-3 py-2 text-slate-900">{cl.nombre}</td>
                                <td className="px-3 py-2 text-slate-600">{cl.direccion ?? 's/d'}</td>
                                <td className="px-3 py-2 text-slate-600">{cl.telefono ?? 's/d'}</td>
                                <td className="px-3 py-2 text-slate-600">{cl.localidad ?? 's/d'}</td>
                                <td className="px-3 py-2 text-slate-600">{cl.vendedor}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Paginador pagina={detalle.clientes.pagina} total={detalle.clientes.total} cant={detalle.clientes.cant} onCambiar={onPagina} />
        </div>
    )
}
```

`src/components/metricas/BloqueObjeciones.tsx` (sustituir `code`/`description` por los campos que se anotaron en el Step 1):

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import DetalleObjecion from './DetalleObjecion'
import { apiClient } from '@/api/apiClient'
import { useObjecionDetalle, useObjecionesMetricas } from '@/hooks/useMetricas'
import { formatPct } from '@/lib/analiticaFormat'
import { razon } from '@/lib/metricas'
import type { IClienteObjecion, IFiltroMetricas } from '@/types/metricas'

interface BloqueObjecionesProps {
    filtro: IFiltroMetricas
}

export default function BloqueObjeciones({ filtro }: BloqueObjecionesProps) {
    const [rubro, setRubro] = useState<string | undefined>()
    const [abierto, setAbierto] = useState<number | null>(null)
    const [pagina, setPagina] = useState(1)
    const [orden, setOrden] = useState<keyof IClienteObjecion>('nombre')
    const [dir, setDir] = useState<'asc' | 'desc'>('asc')

    const { data, isLoading, isError, refetch } = useObjecionesMetricas(filtro, rubro)
    const detalle = useObjecionDetalle(filtro, abierto, { rubro, pagina, orden, dir })
    const { data: rubros } = useQuery({
        queryKey: ['metricas', 'rubros'],
        queryFn: () => apiClient.get('/sale/rubro/catalog').then(r => r.data.data as { code: string; description: string }[]),
        staleTime: Infinity,
    })

    const abrir = (motivoId: number) => {
        setAbierto(a => (a === motivoId ? null : motivoId))
        setPagina(1)
    }
    const ordenar = (clave: keyof IClienteObjecion) => {
        setDir(orden === clave && dir === 'asc' ? 'desc' : 'asc')
        setOrden(clave)
        setPagina(1)
    }

    return (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">Métricas de objeciones</h2>
                <select
                    aria-label="Rubro"
                    value={rubro ?? ''}
                    onChange={e => { setRubro(e.target.value || undefined); setAbierto(null) }}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
                >
                    <option value="">Todos los rubros</option>
                    {(rubros ?? []).map(r => <option key={r.code} value={r.code}>{r.description}</option>)}
                </select>
            </div>

            {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
            {isError && (
                <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    No se pudieron cargar las objeciones.
                    <button type="button" onClick={() => refetch()} className="font-medium underline">Volver a intentar</button>
                </div>
            )}

            {data && data.motivos.length === 0 && <p className="text-sm text-slate-500">Sin objeciones en este período.</p>}

            {data && data.motivos.length > 0 && (
                <>
                    <div className="flex items-baseline gap-2 text-sm text-slate-600" data-testid="tasa-objeciones">
                        Tasa de objeciones:
                        <span className="font-semibold text-slate-900">{formatPct(razon(data.total, data.planificados))}</span>
                        <span className="text-xs text-slate-400">({data.total} objeciones · tocá una tarjeta para ver los clientes)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {data.motivos.map(m => (
                            <button
                                key={m.motivoId}
                                type="button"
                                aria-pressed={abierto === m.motivoId}
                                onClick={() => abrir(m.motivoId)}
                                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                                    abierto === m.motivoId ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                                }`}
                            >
                                <p className="text-2xl font-semibold text-slate-900">{m.cantidad}</p>
                                <p className="text-sm text-slate-700">{m.descripcion}</p>
                                <p className="text-xs text-slate-500">{formatPct(m.pct)}</p>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {abierto !== null && detalle.isLoading && <p className="text-sm text-slate-500">Cargando clientes…</p>}
            {abierto !== null && detalle.data && (
                <DetalleObjecion detalle={detalle.data} orden={orden} dir={dir} onOrdenar={ordenar} onPagina={setPagina} />
            )}
        </section>
    )
}
```

- [ ] **Step 4: Montar en la página**

En `AnaliticaMetricasPage.tsx`: `import BloqueObjeciones from '@/components/metricas/BloqueObjeciones'`, y debajo de `<BloqueVentas … />`:

```tsx
                <BloqueObjeciones filtro={filtro} />
```

- [ ] **Step 5: Correr y verificar**

Run: `npx vitest run src/components/metricas/BloqueObjeciones.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/metricas/Paginador.tsx src/components/metricas/DetalleObjecion.tsx src/components/metricas/BloqueObjeciones.tsx src/components/metricas/BloqueObjeciones.test.tsx src/pages/AnaliticaMetricasPage.tsx
git commit -m "feat(metricas): bloque de objeciones con tasa, filtro por rubro y detalle por cliente"
```

---

### Task B6: Clientes por categoría

**Files:**
- Create: `src/components/metricas/BloqueCategorias.tsx`, `src/components/metricas/ClientesDeTramo.tsx`, `src/components/metricas/BloqueCategorias.test.tsx`
- Modify: `src/pages/AnaliticaMetricasPage.tsx`

**Interfaces:**
- `BloqueCategorias` recibe `{ filtro: IFiltroMetricas }` y maneja el estado de `tramo`, `pagina`, `orden` (`keyof IClienteTramo`, default `'actual'`) y `dir` (default `'desc'`).
- Etiquetas: `ETIQUETA_TRAMO: Record<Tramo, string> = { sinCompras: 'Sin compras', menos1M: '< $1M', entre1y3M: '$1-3M', entre3y5M: '$3-5M', mas5M: '> $5M' }`.
- El subtítulo lleva el nombre del mes (`nombreMes(new Date(año, mes-1, 1))` de `@/lib/fechas`), y agrega "(el mes de la fecha hasta)" cuando `filtro` no es un mes completo, es decir, cuando `rangoMes` de la fecha no coincide con `filtro`.

- [ ] **Step 1: Test que falla**

`src/components/metricas/BloqueCategorias.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import BloqueCategorias from './BloqueCategorias'
import * as api from '@/api/metricas'
import { MOCK_CATEGORIAS, MOCK_CLIENTES_TRAMO } from '@/mocks/metricasMock'

vi.mock('@/api/metricas')

function montar(filtro = { desde: '2026-09-01', hasta: '2026-09-30' }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={qc}><BloqueCategorias filtro={filtro} /></QueryClientProvider>)
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getCategoriasMetricas as any).mockResolvedValue(MOCK_CATEGORIAS)
    ;(api.getClientesDeTramo as any).mockResolvedValue(MOCK_CLIENTES_TRAMO)
})

it('muestra los cinco tramos, subieron/bajaron y el mes', async () => {
    montar()
    expect(await screen.findByRole('button', { name: /Sin compras/ })).toHaveTextContent('210')
    expect(screen.getByText(/32 subieron/)).toBeInTheDocument()
    expect(screen.getByText(/41 bajaron/)).toBeInTheDocument()
    expect(screen.getByText(/Septiembre 2026/)).toBeInTheDocument()
})

it('con un rango que no es el mes completo lo aclara', async () => {
    montar({ desde: '2026-09-07', hasta: '2026-09-11' })
    expect(await screen.findByText(/el mes de la fecha hasta/)).toBeInTheDocument()
})

it('tocar un tramo lista sus clientes con variación', async () => {
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /> \$5M/ }))
    const tabla = await screen.findByTestId('clientes-tramo')
    expect(within(tabla).getByText('Nonno Suspension')).toBeInTheDocument()
    expect(within(tabla).getByText('-36%')).toBeInTheDocument()
    expect(api.getClientesDeTramo).toHaveBeenCalledWith(expect.any(Object), 'mas5M', { pagina: 1, orden: 'actual', dir: 'desc' })
})
```

Run: `npx vitest run src/components/metricas/BloqueCategorias.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Implementar**

`src/components/metricas/ClientesDeTramo.tsx`:

```tsx
import Paginador from './Paginador'
import { formatMillones } from '@/lib/metricas'
import type { IClienteTramo, IClientesDeTramo } from '@/types/metricas'

const COLUMNAS: { clave: keyof IClienteTramo; titulo: string; derecha?: boolean }[] = [
    { clave: 'nombre', titulo: 'Cliente' },
    { clave: 'actual', titulo: 'Facturación actual ($M)', derecha: true },
    { clave: 'promedio6m', titulo: 'Prom. últimos 6 meses ($M)', derecha: true },
    { clave: 'variacion', titulo: 'Vs. promedio', derecha: true },
]

interface ClientesDeTramoProps {
    datos: IClientesDeTramo
    orden: keyof IClienteTramo
    dir: 'asc' | 'desc'
    onOrdenar: (clave: keyof IClienteTramo) => void
    onPagina: (p: number) => void
}

export default function ClientesDeTramo({ datos, orden, dir, onOrdenar, onPagina }: ClientesDeTramoProps) {
    return (
        <div data-testid="clientes-tramo" className="space-y-2 border-t border-slate-200 pt-4">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            {COLUMNAS.map(c => (
                                <th key={c.clave} className={`px-3 py-2 ${c.derecha ? 'text-right' : 'text-left'}`}>
                                    <button type="button" onClick={() => onOrdenar(c.clave)} className="uppercase hover:text-slate-900">
                                        {c.titulo}{orden === c.clave ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {datos.filas.map(cl => (
                            <tr key={cl.codigo} className="border-b border-slate-100">
                                <td className="px-3 py-2 text-slate-900">{cl.nombre}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatMillones(cl.actual)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatMillones(cl.promedio6m)}</td>
                                <td className={`px-3 py-2 text-right tabular-nums ${
                                    cl.variacion === null ? 'text-slate-400' : cl.variacion >= 0 ? 'text-emerald-600' : 'text-red-600'
                                }`}>
                                    {cl.variacion === null ? 's/d' : `${cl.variacion >= 0 ? '+' : ''}${Math.round(cl.variacion * 100)}%`}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-slate-500">{datos.total} clientes en esta categoría</p>
            <Paginador pagina={datos.pagina} total={datos.total} cant={datos.cant} onCambiar={onPagina} />
        </div>
    )
}
```

`src/components/metricas/BloqueCategorias.tsx`:

```tsx
import { useState } from 'react'
import ClientesDeTramo from './ClientesDeTramo'
import { useCategoriasMetricas, useClientesDeTramo } from '@/hooks/useMetricas'
import { nombreMes, rangoMes } from '@/lib/fechas'
import type { IClienteTramo, IFiltroMetricas, Tramo } from '@/types/metricas'

export const ETIQUETA_TRAMO: Record<Tramo, string> = {
    sinCompras: 'Sin compras', menos1M: '< $1M', entre1y3M: '$1-3M', entre3y5M: '$3-5M', mas5M: '> $5M',
}

interface BloqueCategoriasProps {
    filtro: IFiltroMetricas
}

export default function BloqueCategorias({ filtro }: BloqueCategoriasProps) {
    const [tramo, setTramo] = useState<Tramo | null>(null)
    const [pagina, setPagina] = useState(1)
    const [orden, setOrden] = useState<keyof IClienteTramo>('actual')
    const [dir, setDir] = useState<'asc' | 'desc'>('desc')

    const { data, isLoading, isError, refetch } = useCategoriasMetricas(filtro)
    const clientes = useClientesDeTramo(filtro, tramo, { pagina, orden, dir })

    const [anio, mes] = filtro.hasta.split('-').map(Number)
    const mesDelHasta = new Date(anio, mes - 1, 1)
    const esMesCompleto = rangoMes(mesDelHasta).desde === filtro.desde && rangoMes(mesDelHasta).hasta === filtro.hasta

    const ordenar = (clave: keyof IClienteTramo) => {
        setDir(orden === clave && dir === 'desc' ? 'asc' : 'desc')
        setOrden(clave)
        setPagina(1)
    }

    return (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
            <div>
                <h2 className="text-sm font-semibold text-slate-900">Clientes por categoría</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                    Según lo que facturó cada cliente en {nombreMes(mesDelHasta)}
                    {!esMesCompleto && ' (el mes de la fecha hasta)'}.
                </p>
            </div>

            {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
            {isError && (
                <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    No se pudieron cargar las categorías.
                    <button type="button" onClick={() => refetch()} className="font-medium underline">Volver a intentar</button>
                </div>
            )}

            {data && (
                <>
                    <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">▲ {data.subieron} subieron</span>
                        <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">▼ {data.bajaron} bajaron</span>
                        <span className="text-slate-400">vs. mes anterior</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {data.tramos.map(t => (
                            <button
                                key={t.tramo}
                                type="button"
                                aria-pressed={tramo === t.tramo}
                                onClick={() => { setTramo(x => (x === t.tramo ? null : t.tramo)); setPagina(1) }}
                                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                                    tramo === t.tramo ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                                }`}
                            >
                                <p className="text-2xl font-semibold text-slate-900">{t.cantidad}</p>
                                <p className="text-sm text-slate-700">{ETIQUETA_TRAMO[t.tramo]}</p>
                            </button>
                        ))}
                    </div>
                    {tramo === null && <p className="text-xs text-slate-400">Tocá una categoría para ver el listado de clientes.</p>}
                </>
            )}

            {tramo !== null && clientes.isLoading && <p className="text-sm text-slate-500">Cargando clientes…</p>}
            {tramo !== null && clientes.data && (
                <ClientesDeTramo datos={clientes.data} orden={orden} dir={dir} onOrdenar={ordenar} onPagina={setPagina} />
            )}
        </section>
    )
}
```

- [ ] **Step 3: Montar en la página** (`import BloqueCategorias from '@/components/metricas/BloqueCategorias'`, debajo de `BloqueObjeciones`)

```tsx
                <BloqueCategorias filtro={filtro} />
```

- [ ] **Step 4: Correr y verificar**

Run: `npx vitest run src/components/metricas/BloqueCategorias.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/metricas/BloqueCategorias.tsx src/components/metricas/ClientesDeTramo.tsx src/components/metricas/BloqueCategorias.test.tsx src/pages/AnaliticaMetricasPage.tsx
git commit -m "feat(metricas): clientes por tramo de facturación con subieron/bajaron y listado"
```

---

### Task B7: Ranking por vendedor

**Files:**
- Create: `src/components/metricas/RankingVendedores.tsx`, `src/components/metricas/RankingVendedores.test.tsx`
- Modify: `src/pages/AnaliticaMetricasPage.tsx`

**Interfaces:**
- Props: `{ resumen: IMetricasResumen; proyectado: boolean; vendedorElegido?: string; onElegir: (codigo: string) => void }`.
- Columnas (clave de orden → valor usado para ordenar):

| Columna | Clave | Valor mostrado |
|---|---|---|
| Vendedor | `nombre` | el nombre |
| Clientes totales | `cartera` | `cartera` |
| Clientes visitados | `visitados` | `clientesVisitados`, con % sobre la cartera |
| Clientes con compra | `conCompra` | `clientesConCompra`, con % sobre la cartera |
| Tasa de cierre | `tasaCierre` | `visitadosConCompra / clientesVisitados` |
| Horas vs objetivo | `horas` | `minutosTotales` / `objetivoMinutos` y % |
| Ventas vs Planner | `planner` | `planificadosConCompra / planificados` |

- Orden: el primer toque ordena `desc`, el segundo `asc`. Los valores `null` van siempre al final. La fila "Total equipo" queda fija arriba y no se ordena.
- Con `proyectado`, cada fila pasa por `proyectar` con el mismo factor que el bloque de ventas.
- La fila del vendedor elegido lleva `bg-blue-50`, y tocar una fila llama a `onElegir(codigo)`.

- [ ] **Step 1: Test que falla**

`src/components/metricas/RankingVendedores.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import RankingVendedores from './RankingVendedores'
import { MOCK_RESUMEN_METRICAS } from '@/mocks/metricasMock'

const filas = () => screen.getAllByRole('row').slice(2) // 0 = header, 1 = total equipo

it('arranca con Total equipo arriba y un renglón por vendedor', () => {
    render(<RankingVendedores resumen={MOCK_RESUMEN_METRICAS} proyectado={false} onElegir={vi.fn()} />)
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Total equipo')
    expect(filas()).toHaveLength(3)
})

it('ordena por tasa de cierre de mejor a peor, con s/d al final, y el segundo toque invierte', async () => {
    render(<RankingVendedores resumen={MOCK_RESUMEN_METRICAS} proyectado={false} onElegir={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Tasa de cierre/ }))
    expect(filas().map(r => within(r).getAllByRole('cell')[0].textContent)).toEqual([
        'FERNANDEZ MARCELO', 'GOMEZ SERGIO', 'MARTINEZ GUSTAVO',
    ])
    await userEvent.click(screen.getByRole('button', { name: /Tasa de cierre/ }))
    expect(within(filas()[0]).getAllByRole('cell')[0]).toHaveTextContent('GOMEZ SERGIO')
    expect(within(filas()[2]).getAllByRole('cell')[0]).toHaveTextContent('MARTINEZ GUSTAVO')
})

it('tocar una fila elige al vendedor', async () => {
    const onElegir = vi.fn()
    render(<RankingVendedores resumen={MOCK_RESUMEN_METRICAS} proyectado={false} onElegir={onElegir} />)
    await userEvent.click(screen.getByText('GOMEZ SERGIO'))
    expect(onElegir).toHaveBeenCalledWith('V 5')
})

it('un vendedor sin visitas muestra s/d en tasa de cierre, no 0%', () => {
    render(<RankingVendedores resumen={MOCK_RESUMEN_METRICAS} proyectado={false} onElegir={vi.fn()} />)
    const martinez = screen.getByText('MARTINEZ GUSTAVO').closest('tr')!
    expect(martinez).toHaveTextContent('s/d')
})
```

Run: `npx vitest run src/components/metricas/RankingVendedores.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Implementar**

`src/components/metricas/RankingVendedores.tsx`:

```tsx
import { useState } from 'react'
import { formatHoras, formatNumero, formatPct } from '@/lib/analiticaFormat'
import { claseCumplimiento, cumplimiento, factorProyeccion, proyectar, razon } from '@/lib/metricas'
import type { IMetricasFila, IMetricasResumen } from '@/types/metricas'

type Clave = 'nombre' | 'cartera' | 'visitados' | 'conCompra' | 'tasaCierre' | 'horas' | 'planner'

const valor = (f: IMetricasFila, k: Clave): number | string | null => {
    switch (k) {
        case 'nombre': return f.nombreVendedor
        case 'cartera': return f.cartera
        case 'visitados': return f.clientesVisitados
        case 'conCompra': return f.clientesConCompra
        case 'tasaCierre': return razon(f.visitadosConCompra, f.clientesVisitados)
        case 'horas': return f.minutosTotales
        case 'planner': return razon(f.planificadosConCompra, f.planificados)
    }
}

const COLUMNAS: { clave: Clave; titulo: string }[] = [
    { clave: 'nombre', titulo: 'Vendedor' },
    { clave: 'cartera', titulo: 'Clientes totales' },
    { clave: 'visitados', titulo: 'Clientes visitados' },
    { clave: 'conCompra', titulo: 'Clientes con compra' },
    { clave: 'tasaCierre', titulo: 'Tasa de cierre' },
    { clave: 'horas', titulo: 'Horas vs objetivo' },
    { clave: 'planner', titulo: 'Ventas vs Planner' },
]

function Celda({ principal, secundario, pct }: { principal: string; secundario?: string; pct?: number | null }) {
    return (
        <td className="px-3 py-2 text-right tabular-nums">
            <span className="text-slate-900">{principal}</span>
            {secundario && <span className="text-slate-400"> / {secundario}</span>}
            {pct !== undefined && <span className={`block text-xs ${claseCumplimiento(pct)}`}>{formatPct(pct)}</span>}
        </td>
    )
}

interface RankingVendedoresProps {
    resumen: IMetricasResumen
    proyectado: boolean
    vendedorElegido?: string
    onElegir: (codigo: string) => void
}

export default function RankingVendedores({ resumen, proyectado, vendedorElegido, onElegir }: RankingVendedoresProps) {
    const [clave, setClave] = useState<Clave | null>(null)
    const [dir, setDir] = useState<'asc' | 'desc'>('desc')

    const factor = factorProyeccion(resumen.diasHabiles, resumen.diasHabilesTranscurridos)
    const ajustar = (f: IMetricasFila) => (proyectado ? proyectar(f, factor) : f)
    const equipo = ajustar(resumen.equipo)
    const filas = resumen.vendedores.map(ajustar)

    if (clave) {
        const s = dir === 'desc' ? -1 : 1
        filas.sort((a, b) => {
            const va = valor(a, clave)
            const vb = valor(b, clave)
            if (va === null) return 1
            if (vb === null) return -1
            return typeof va === 'string' ? va.localeCompare(String(vb), 'es') * s : ((va as number) - (vb as number)) * s
        })
    }

    const tocar = (k: Clave) => {
        setDir(clave === k && dir === 'desc' ? 'asc' : 'desc')
        setClave(k)
    }

    const renderFila = (f: IMetricasFila, esEquipo: boolean) => (
        <tr
            key={esEquipo ? 'equipo' : f.codigoVendedor}
            onClick={esEquipo ? undefined : () => onElegir(f.codigoVendedor)}
            className={
                esEquipo
                    ? 'bg-slate-100 font-semibold'
                    : `cursor-pointer border-b border-slate-100 hover:bg-blue-50 ${f.codigoVendedor === vendedorElegido ? 'bg-blue-50' : ''}`
            }
        >
            <td className="px-3 py-2 text-left text-slate-900">{f.nombreVendedor}</td>
            <Celda principal={formatNumero(f.cartera)} />
            <Celda principal={formatNumero(f.clientesVisitados)} pct={razon(f.clientesVisitados, f.cartera)} />
            <Celda principal={formatNumero(f.clientesConCompra)} pct={razon(f.clientesConCompra, f.cartera)} />
            <Celda principal={formatPct(razon(f.visitadosConCompra, f.clientesVisitados))} />
            <Celda
                principal={formatHoras(f.minutosTotales)}
                secundario={formatHoras(f.objetivoMinutos)}
                pct={cumplimiento(f.minutosTotales, f.objetivoMinutos)}
            />
            <Celda
                principal={formatNumero(f.planificadosConCompra)}
                secundario={formatNumero(f.planificados)}
                pct={razon(f.planificadosConCompra, f.planificados)}
            />
        </tr>
    )

    return (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <div>
                <h2 className="text-sm font-semibold text-slate-900">Ranking por vendedor</h2>
                <p className="mt-0.5 text-xs text-slate-500">Tocá una columna para ordenar; tocá una fila para ver ese vendedor arriba.</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            {COLUMNAS.map(c => (
                                <th key={c.clave} className={`px-3 py-2 ${c.clave === 'nombre' ? 'text-left' : 'text-right'}`}>
                                    <button type="button" onClick={() => tocar(c.clave)} className="uppercase hover:text-slate-900">
                                        {c.titulo}{clave === c.clave ? (dir === 'desc' ? ' ▼' : ' ▲') : ''}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {renderFila(equipo, true)}
                        {filas.map(f => renderFila(f, false))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}
```

- [ ] **Step 3: Montar en la página** (`import RankingVendedores from '@/components/metricas/RankingVendedores'`, al final del `<main>`)

```tsx
                {resumen.data && resumen.data.vendedores.length > 0 && (
                    <RankingVendedores
                        resumen={resumen.data}
                        proyectado={proyectado && puedeProyectar}
                        vendedorElegido={geo.vendedor}
                        onElegir={codigo => setGeo(g => ({ ...g, vendedor: codigo }))}
                    />
                )}
```

- [ ] **Step 4: Correr y verificar**

Run: `npx vitest run src/components/metricas/RankingVendedores.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/metricas/RankingVendedores.tsx src/components/metricas/RankingVendedores.test.tsx src/pages/AnaliticaMetricasPage.tsx
git commit -m "feat(metricas): ranking por vendedor ordenable con fila de equipo"
```

---

### Task B8: Prueba de la página, verificación completa y documentación

**Files:**
- Create: `src/pages/AnaliticaMetricasPage.test.tsx`
- Modify: `src/router/ProtectedRoute.test.tsx`
- Modify: `CLAUDE.md` (una viñeta en "Decisiones no obvias")

- [ ] **Step 1: Test de integración de la página**

`src/pages/AnaliticaMetricasPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AnaliticaMetricasPage from './AnaliticaMetricasPage'
import * as api from '@/api/metricas'
import {
    MOCK_CATEGORIAS, MOCK_OBJECIONES_METRICAS, MOCK_OPCIONES, MOCK_RESUMEN_METRICAS,
} from '@/mocks/metricasMock'

vi.mock('@/api/metricas')
vi.mock('@/api/apiClient', () => ({ apiClient: { get: vi.fn().mockResolvedValue({ data: { data: [] } }) } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Gerencia' }, logout: vi.fn() }) }))
vi.mock('@/hooks/useAccionesDeCuenta', () => ({ useAccionesDeCuenta: () => [] }))

function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={['/analitica/metricas']}>
                <AnaliticaMetricasPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getResumenMetricas as any).mockResolvedValue(MOCK_RESUMEN_METRICAS)
    ;(api.getObjecionesMetricas as any).mockResolvedValue(MOCK_OBJECIONES_METRICAS)
    ;(api.getCategoriasMetricas as any).mockResolvedValue(MOCK_CATEGORIAS)
    ;(api.getOpcionesMetricas as any).mockResolvedValue(MOCK_OPCIONES)
})

it('carga los cuatro bloques con el mes en curso', async () => {
    montar()
    expect(await screen.findByText('Métricas de ventas')).toBeInTheDocument()
    expect(await screen.findByText('Ranking por vendedor')).toBeInTheDocument()
    expect(screen.getByText('Métricas de objeciones')).toBeInTheDocument()
    expect(screen.getByText('Clientes por categoría')).toBeInTheDocument()
    const f = (api.getResumenMetricas as any).mock.calls[0][0]
    expect(f.desde).toMatch(/^\d{4}-\d{2}-01$/)
})

it('elegir una sucursal vuelve a pedir los bloques con ese filtro', async () => {
    montar()
    await screen.findByText('Ranking por vendedor')
    await userEvent.selectOptions(await screen.findByLabelText('Sucursal'), 'MDP')
    await waitFor(() =>
        expect(api.getResumenMetricas).toHaveBeenLastCalledWith(expect.objectContaining({ sucursal: 'MDP' })),
    )
    expect(api.getCategoriasMetricas).toHaveBeenLastCalledWith(expect.objectContaining({ sucursal: 'MDP' }))
})

it('tocar una fila del ranking elige al vendedor en el filtro', async () => {
    montar()
    await userEvent.click(await screen.findByText('GOMEZ SERGIO'))
    expect(screen.getByLabelText('Vendedor')).toHaveValue('V 5')
    await waitFor(() =>
        expect(api.getObjecionesMetricas).toHaveBeenLastCalledWith(expect.objectContaining({ vendedor: 'V 5' }), undefined),
    )
})
```

Run: `npx vitest run src/pages/AnaliticaMetricasPage.test.tsx`
Expected: PASS. Si falla por algún mock de `EncabezadoAnalitica` (por ejemplo, otro hook dentro de `AccountMenu`), mockear ese hook igual que los de arriba.

- [ ] **Step 2: Test de ruta protegida** (agregar a `ProtectedRoute.test.tsx`: primero la ruta dentro del bloque `supervisa` de `montar`, y después los casos)

Dentro de `<Route element={<ProtectedRoute permitir={supervisa} />}>` de `montar`, agregar:

```tsx
                    <Route path="/analitica/metricas" element={<div>METRICAS</div>} />
```

Y los casos:

```tsx
    it('gerencia entra a /analitica/metricas', () => {
        montar('/analitica/metricas', cap(false, true, true))
        expect(screen.getByText('METRICAS')).toBeInTheDocument()
    })
    it('vendedor en /analitica/metricas vuelve a la agenda', () => {
        montar('/analitica/metricas', cap(true, false, false))
        expect(screen.getByText('AGENDA')).toBeInTheDocument()
    })
```

Run: `npx vitest run src/router/ProtectedRoute.test.tsx`
Expected: PASS.

- [ ] **Step 3: Viñeta en CLAUDE.md**

Agregar al final de la lista "Decisiones no obvias" de `CLAUDE.md`:

```markdown
- **La pestaña "Métricas" (`/analitica/metricas`) mide sobre un CONJUNTO DE CLIENTES, no sobre
  vendedores.** `ConjuntoClientesResolver` (api-vendedores) arma la cartera del scope
  (`fct_clients`, principales) con la **sucursal de cada cliente = la que más le facturó en 12
  meses** — la sucursal es de la factura (`fct_sales.branch`), no existe en el cliente — y los
  filtros de sucursal/zona/localidad recortan clientes. Las ventas se atribuyen al vendedor
  ACTUAL del cliente. Los **objetivos de venta son constantes del front** (`src/lib/metricas.ts`:
  150 $M, 500 u., 12 SR, 60% cierre) a propósito, hasta que gerencia defina metas; el 12 de SR es
  chico para el SR real y hay que ajustarlo. "Super Rubro" es el SR de la empresa (pares
  cliente×rubro×mes que llegan al mínimo), no rubros distintos. Tasa de cierre = visitados que
  ADEMÁS compraron / visitados. Spec `docs/superpowers/specs/2026-09-24-pestana-metricas-gerencia-design.md`.
```

- [ ] **Step 4: Verificación completa (de a un proceso, avisando antes de cada uno)**

Run, uno por vez:
1. `npm test`. Expected: todo PASS.
2. `npm run lint`. Expected: sin errores nuevos.
3. `npm run build`. Expected: `tsc -b` y `vite build` OK.

Si algo falla, arreglar la causa y no el test.

- [ ] **Step 5: Prueba visual con mock**

Run: `VITE_ANALITICA_MOCK=1 npm run dev`. Entrar a `/analitica/metricas` con un usuario de gerencia (o con el modo mock de auth que use el proyecto) y verificar en desktop y a 375 px de ancho:
- que los cuatro bloques se dibujan sin scroll horizontal de página (las tablas scrollean dentro de su tarjeta);
- que los filtros se encadenan;
- que "Ver proyectado" aparece solo en el mes en curso;
- que abrir y cerrar un motivo y un tramo funciona.

Sacar una captura para el PR.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AnaliticaMetricasPage.test.tsx src/router/ProtectedRoute.test.tsx CLAUDE.md
git commit -m "test(metricas): integración de la página y ruta protegida; docs: decisión en CLAUDE.md"
```

- [ ] **Step 7: Cierre**

Usar `superpowers:finishing-a-development-branch` en los dos repos: primero el PR de api-vendedores (el front depende de sus endpoints) y después el de app-planificacion. Cada PR lleva:
- el link al spec;
- el tiempo de respuesta de `/metricas/resumen` medido en A8 Step 6;
- la nota de que el objetivo de SR es provisorio.
