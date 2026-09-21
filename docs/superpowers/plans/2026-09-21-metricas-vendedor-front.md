# Métricas del vendedor — Front (tab "Mi cartera" + pestaña "Métricas") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Darle al vendedor una barra inferior con dos tabs, `Agenda` (lo que existe) y `Mi cartera` (sus métricas del mes), y a gerencia una pestaña `Métricas` en `/analitica` con la misma pantalla y chips de vendedor / equipo.

**Architecture:** La pantalla de métricas es un render genérico de un **catálogo declarativo** (`src/lib/metricas/catalogo.ts`: secciones → tiles con `forma`, `leer(m)`, `formato`) sobre un objeto `IMetricas` que devuelve un solo endpoint (`GET /planificacion/metricas`). Tres componentes de tile (`objetivo`, `comparacion`, `lista`) y un `PanelMetricas` que recorre el catálogo. Vendedor y gerencia comparten `PanelMetricas`; cambia el sujeto y el shell.

**Tech Stack:** Vite + React 19 + TypeScript, Tailwind (colores `ds*`, breakpoint `xs`), React Query, react-router-dom, Vitest + Testing Library. Mock detrás de `VITE_METRICAS_MOCK=1`.

**Spec:** `docs/superpowers/specs/2026-09-21-metricas-vendedor-y-gerencia-design.md`. **Contraparte API:** api-vendedores `docs/superpowers/plans/2026-09-21-metricas-vendedor-api.md` (mismos tipos `IMetricas` / `IMetricaCliente`).

## Global Constraints

- **Vocabulario del vendedor:** nunca "ciclo", "rotación", "semana N", "planificaciones". Se dice "clientes de tu ruta", "zona", "mes".
- **Sin `if (rol === ...)`:** el tab se decide con la capacidad `veSusMetricas` de `GET /planificacion/me` (`src/lib/roles.ts` solo traduce capacidades).
- **Porcentajes de la API en 0..1** (`cobertura`, `efectividadComercial`, `efectividadOperativa`, `variacion`, `clientesEnCaida.valor`). `formatPct` de `analiticaFormat.ts` ya espera 0..1.
- **Estados por tile, no por pantalla:** cargando → esqueleto; `leer()` devuelve `null` → "Sin datos"; error del endpoint → un aviso arriba con "Volver a intentar" (patrón `fallóPropuestaDirecta`).
- **Nada se persiste** (tab ni período). El período arranca en "Este mes".
- Colores: `dsnavy #213D82`, `dsgreen #009E4F`, `dsred #B42318`, `dsorange #B45309`, `dsmuted #697585`, `dsline #E7E9F0`. Fondo de página `#EEF1F6`.
- Z-index en uso: `VisitaEnCursoBar` 40, `BottomSheet` 50, `BannerPrueba` 55, `ConfirmDialog` 60, `Notification` 70. La barra de tabs va en **30** (debajo de todo lo flotante).
- Tests: `npx vitest run <archivo>`. Typecheck: `npx tsc -b`. Lint: `npm run lint`.
- Vitest ya fija `VITE_ANALITICA_MOCK: '1'` en `vitest.config.ts` → `env`; agregar `VITE_METRICAS_MOCK: '1'` al lado (Task 1).

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/types/metricas.ts` (create) | `IMetricas`, `IMetricaCliente`, `EstadoCliente`, `ISujetoMetricas` — espejo de la API |
| `src/mocks/metricasMock.ts` (create) | fixtures `MOCK_METRICAS`, `MOCK_METRICAS_ANTERIOR`, `MOCK_METRICAS_EQUIPO`, `MOCK_CLIENTES` |
| `src/api/metricas.ts` (create) | `getMetricas`, `getMetricasClientes` con mock |
| `src/hooks/useMetricas.ts` (create) | `useMetricas`, `useMetricasClientes`, `metricasKeys` |
| `src/lib/roles.ts` (modify) | `veMetricas(c)` |
| `src/types/planificacion.ts` (modify) | `ICapacidades.veSusMetricas` |
| `src/lib/metricas/mes.ts` (create) | `mesActual`, `mesAnterior`, `nombreDeMes` |
| `src/lib/metricas/formato.ts` (create) | `formatearValor`, `semaforo`, `variacion` |
| `src/lib/metricas/catalogo.ts` (create) | el catálogo (secciones y tiles) y sus tipos |
| `src/components/metricas/TileObjetivo.tsx`, `TileComparacion.tsx`, `TileLista.tsx` (create) | las tres formas |
| `src/components/metricas/TileSinDatos.tsx`, `TileEsqueleto.tsx` (create) | estados por tile |
| `src/components/metricas/SelectorMes.tsx` (create) | chips `Este mes` / `Mes anterior` |
| `src/components/metricas/PanelMetricas.tsx` (create) | recorre el catálogo; estados; pie "Datos actualizados" |
| `src/components/metricas/DetalleClientesSheet.tsx` (create) | sheet con el listado de una fila de lista |
| `src/components/BarraTabs.tsx` (create) | barra inferior `Agenda` / `Mi cartera` |
| `src/components/VisitaEnCursoBar.tsx` (modify) | prop `sobreBarraTabs` |
| `src/pages/CarteraPage.tsx` (create) | shell del vendedor |
| `src/pages/AgendaSemanaPage.tsx` (modify) | `BarraTabs`, `?visita=abrir` |
| `src/pages/AnaliticaMetricasPage.tsx` (create) | shell de gerencia con chips |
| `src/components/analitica/AnaliticaTabs.tsx` (modify) | `NavLink` `Métricas` |
| `src/App.tsx` (modify) | rutas `/cartera` y `/analitica/metricas` |
| `CLAUDE.md` (modify) | "Fuera de alcance": cumplimiento de objetivo propio entra |

---

### Task 1: Tipos, mock, API y hook

**Files:**
- Create: `src/types/metricas.ts`, `src/mocks/metricasMock.ts`, `src/api/metricas.ts`, `src/hooks/useMetricas.ts`
- Modify: `vitest.config.ts` (env)
- Test: `src/api/metricas.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/api/metricas.ts
  export interface IMetricasArgs { mes: string; vendedor?: string }           // vendedor: código | 'equipo' | undefined (yo)
  export const getMetricas: (args: IMetricasArgs) => Promise<IMetricas>
  export const getMetricasClientes: (args: IMetricasArgs & { estado: EstadoCliente | 'caida' }) => Promise<IMetricaCliente[]>
  // src/hooks/useMetricas.ts
  export const metricasKeys = { metricas: (a) => ['metricas', a.mes, a.vendedor ?? 'yo'] as const, clientes: (a) => ['metricas', 'clientes', a.mes, a.vendedor ?? 'yo', a.estado] as const }
  export function useMetricas(args: IMetricasArgs)
  export function useMetricasClientes(args: IMetricasArgs & { estado: EstadoCliente | 'caida' }, opts?: { enabled?: boolean })
  ```

- [ ] **Step 1: Tipos** — `src/types/metricas.ts` (idéntico al backend):

```ts
/** Espejo de api-vendedores src/types/metricas.ts. Porcentajes en 0..1. */
export interface IMetricaObjetivo { actual: number; objetivo: number | null; anterior: number | null }
export interface IMetricaComparacion { actual: number | null; anterior: number | null }
export interface IFilaLista { etiqueta: string; valor: number }
export type EstadoCliente = 'Activo' | 'Pasivo' | 'Inactivo' | 'Crítico'

export interface ISujetoMetricas { tipo: 'vendedor' | 'equipo'; codigo: string | null; nombre: string }

export interface IMetricasVentas {
    facturacion: IMetricaObjetivo
    unidades: IMetricaObjetivo
    superRubros: IMetricaObjetivo
    clientesPorEstado: { etiqueta: EstadoCliente; valor: number }[]
    clientesEnCaida: IFilaLista[]
}

export interface IMetricas {
    mes: string
    sujeto: ISujetoMetricas
    actualizadoEn: string
    fuentes: { ventas: 'ok' | 'no_disponible' | 'no_aplica' }
    visitas: IMetricaObjetivo
    clientesVisitados: IMetricaObjetivo
    minutos: IMetricaObjetivo
    efectividadOperativa: IMetricaComparacion
    cobertura: IMetricaComparacion
    efectividadComercial: IMetricaComparacion & { ofrecidos: number; ganados: number; diferidos: number; perdidos: number }
    objeciones: { total: number; top: IFilaLista[] }
    ventas: IMetricasVentas | null
}

export interface IMetricaCliente {
    codigoParticularCliente: string
    nombre: string
    actual: number
    promedio6m: number
    variacion: number | null
}
```

- [ ] **Step 2: Mock** — `src/mocks/metricasMock.ts`:

```ts
import type { IMetricas, IMetricaCliente } from '@/types/metricas'
import { mesActual, mesAnterior } from '@/lib/metricas/mes'   // Task 2 lo crea; hasta entonces, ver nota abajo

const MES = mesActual()

export const MOCK_METRICAS: IMetricas = {
    mes: MES,
    sujeto: { tipo: 'vendedor', codigo: 'V 2', nombre: 'ACOSTA MARIANO' },
    actualizadoEn: new Date().toISOString(),
    fuentes: { ventas: 'ok' },
    visitas: { actual: 82, objetivo: 160, anterior: 140 },
    clientesVisitados: { actual: 71, objetivo: 140, anterior: 118 },
    minutos: { actual: 2460, objetivo: 6000, anterior: 4930 },
    efectividadOperativa: { actual: 0.47, anterior: 0.84 },
    cobertura: { actual: 0.55, anterior: 0.91 },
    efectividadComercial: { actual: 0.42, anterior: 0.38, ofrecidos: 210, ganados: 88, diferidos: 60, perdidos: 62 },
    objeciones: { total: 58, top: [
        { etiqueta: 'Precio', valor: 21 }, { etiqueta: 'Marca', valor: 14 }, { etiqueta: 'Ya tiene stock', valor: 9 },
        { etiqueta: 'Plazo', valor: 8 }, { etiqueta: 'No trabaja el rubro', valor: 6 } ] },
    ventas: {
        facturacion: { actual: 132_400_000, objetivo: 150_000_000, anterior: 121_000_000 },
        unidades: { actual: 430, objetivo: 500, anterior: 398 },
        superRubros: { actual: 10, objetivo: null, anterior: 9 },
        clientesPorEstado: [
            { etiqueta: 'Activo', valor: 52 }, { etiqueta: 'Pasivo', valor: 23 },
            { etiqueta: 'Inactivo', valor: 70 }, { etiqueta: 'Crítico', valor: 6 } ],
        clientesEnCaida: [
            { etiqueta: 'MUNDO AUTOPARTES SRL', valor: 0.42 }, { etiqueta: 'VENEZIA FRANCISCO', valor: 0.64 },
            { etiqueta: 'PIERMATTEI JUAN CARLOS', valor: 0.62 } ],
    },
}

export const MOCK_METRICAS_ANTERIOR: IMetricas = {
    ...MOCK_METRICAS,
    mes: mesAnterior(MES),
    visitas: { actual: 140, objetivo: 160, anterior: 151 },
    clientesVisitados: { actual: 118, objetivo: 140, anterior: 125 },
    minutos: { actual: 4930, objetivo: 6000, anterior: 5100 },
    efectividadOperativa: { actual: 0.84, anterior: 0.9 },
    cobertura: { actual: 0.91, anterior: 0.88 },
}

export const MOCK_METRICAS_EQUIPO: IMetricas = {
    ...MOCK_METRICAS,
    sujeto: { tipo: 'equipo', codigo: null, nombre: 'Equipo' },
    visitas: { actual: 310, objetivo: 640, anterior: 560 },
    clientesVisitados: { actual: 280, objetivo: 560, anterior: 470 },
    minutos: { actual: 9800, objetivo: 24000, anterior: 19700 },
}

export const MOCK_CLIENTES: IMetricaCliente[] = [
    { codigoParticularCliente: '00311', nombre: 'MUNDO AUTOPARTES SRL', actual: 88_100_000, promedio6m: 152_600_000, variacion: -0.42 },
    { codigoParticularCliente: '01820', nombre: 'SUSPENSION CARLITOS SRL', actual: 23_500_000, promedio6m: 19_300_000, variacion: 0.22 },
    { codigoParticularCliente: '02231', nombre: 'GIUSTI LUCAS LEANDRO', actual: 0, promedio6m: 8_600_000, variacion: -1 },
    { codigoParticularCliente: '00987', nombre: 'TALLER LA ESQUINA', actual: 0, promedio6m: 0, variacion: null },
]
```

**Nota de orden:** este mock importa `mesActual`/`mesAnterior` de `src/lib/metricas/mes.ts`, que se crea en Task 2. Para no bloquear, crear en esta task el archivo `src/lib/metricas/mes.ts` con **solo** estas dos funciones (Task 2 le agrega `nombreDeMes` y sus tests):

```ts
const pad = (n: number) => String(n).padStart(2, '0')
/** YYYY-MM de hoy, en TZ de negocio (misma TZ que `src/lib/fechas.ts`). */
export function mesActual(hoy: Date = new Date()): string {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' }).formatToParts(hoy)
    return `${p.find(x => x.type === 'year')!.value}-${p.find(x => x.type === 'month')!.value}`
}
export function mesAnterior(mes: string): string {
    const [a, m] = mes.split('-').map(Number)
    return m === 1 ? `${a - 1}-12` : `${a}-${pad(m - 1)}`
}
```

- [ ] **Step 3: Test de la capa API (mock)** — `src/api/metricas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getMetricas, getMetricasClientes } from './metricas'
import { MOCK_METRICAS, MOCK_METRICAS_ANTERIOR, MOCK_METRICAS_EQUIPO, MOCK_CLIENTES } from '@/mocks/metricasMock'
import { mesActual, mesAnterior } from '@/lib/metricas/mes'

describe('api/metricas (fixture)', () => {
    it('este mes → MOCK_METRICAS; mes anterior → MOCK_METRICAS_ANTERIOR', async () => {
        expect(await getMetricas({ mes: mesActual() })).toEqual(MOCK_METRICAS)
        expect(await getMetricas({ mes: mesAnterior(mesActual()) })).toEqual(MOCK_METRICAS_ANTERIOR)
    })
    it('equipo → MOCK_METRICAS_EQUIPO', async () => {
        expect(await getMetricas({ mes: mesActual(), vendedor: 'equipo' })).toEqual(MOCK_METRICAS_EQUIPO)
    })
    it('clientes → MOCK_CLIENTES', async () => {
        expect(await getMetricasClientes({ mes: mesActual(), estado: 'Inactivo' })).toEqual(MOCK_CLIENTES)
    })
})
```

- [ ] **Step 4: Correr y ver fallar**

Run: `npx vitest run src/api/metricas.test.ts` → FAIL (módulos inexistentes).

- [ ] **Step 5: API + hook + env**

`src/api/metricas.ts`:

```ts
import { apiClient } from './apiClient'
import { MOCK_CLIENTES, MOCK_METRICAS, MOCK_METRICAS_ANTERIOR, MOCK_METRICAS_EQUIPO } from '@/mocks/metricasMock'
import { mesActual } from '@/lib/metricas/mes'
import type { EstadoCliente, IMetricaCliente, IMetricas } from '@/types/metricas'

const USA_MOCK = import.meta.env.VITE_METRICAS_MOCK === '1'
const DELAY_MS = import.meta.env.DEV ? 250 : 0
const esperar = () => new Promise(r => setTimeout(r, DELAY_MS))

export interface IMetricasArgs {
    /** YYYY-MM */
    mes: string
    /** Ausente = yo (o mi vendedor de prueba). Código = ese vendedor (gerencia). 'equipo' = todo el scope. */
    vendedor?: string
}

export const getMetricas = async (args: IMetricasArgs): Promise<IMetricas> => {
    if (USA_MOCK) {
        await esperar()
        if (args.vendedor === 'equipo') return MOCK_METRICAS_EQUIPO
        return args.mes === mesActual() ? MOCK_METRICAS : MOCK_METRICAS_ANTERIOR
    }
    const res = await apiClient.get('/planificacion/metricas', { params: args })
    return res.data.data
}

export const getMetricasClientes = async (
    args: IMetricasArgs & { estado: EstadoCliente | 'caida' },
): Promise<IMetricaCliente[]> => {
    if (USA_MOCK) {
        await esperar()
        return MOCK_CLIENTES
    }
    const res = await apiClient.get('/planificacion/metricas/clientes', { params: args })
    return res.data.data
}
```

`src/hooks/useMetricas.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { getMetricas, getMetricasClientes, type IMetricasArgs } from '@/api/metricas'
import type { EstadoCliente } from '@/types/metricas'

type ClientesArgs = IMetricasArgs & { estado: EstadoCliente | 'caida' }

/** Keys sin usuario a propósito, como agenda y ciclo: `cerrarSesionLocal` vacía toda la
 *  caché, así que el siguiente usuario del teléfono no ve las métricas del anterior. */
export const metricasKeys = {
    metricas: (a: IMetricasArgs) => ['metricas', a.mes, a.vendedor ?? 'yo'] as const,
    clientes: (a: ClientesArgs) => ['metricas', 'clientes', a.mes, a.vendedor ?? 'yo', a.estado] as const,
}

export function useMetricas(args: IMetricasArgs) {
    return useQuery({ queryKey: metricasKeys.metricas(args), queryFn: () => getMetricas(args), staleTime: 5 * 60 * 1000 })
}

export function useMetricasClientes(args: ClientesArgs, opts?: { enabled?: boolean }) {
    return useQuery({
        queryKey: metricasKeys.clientes(args),
        queryFn: () => getMetricasClientes(args),
        enabled: opts?.enabled ?? true,
    })
}
```

En `vitest.config.ts`, dentro de `env`, agregar `VITE_METRICAS_MOCK: '1',` después de `VITE_ANALITICA_MOCK`.

- [ ] **Step 6: Correr y ver pasar** → PASS. `npx tsc -b` limpio.

- [ ] **Step 7: Commit**

```bash
git add src/types/metricas.ts src/mocks/metricasMock.ts src/api/metricas.ts src/api/metricas.test.ts src/hooks/useMetricas.ts src/lib/metricas/mes.ts vitest.config.ts
git commit -m "feat(metricas): tipos, fixture, api y hook de /planificacion/metricas"
```

---

### Task 2: Helpers de mes y formato

**Files:**
- Modify: `src/lib/metricas/mes.ts` (agregar `nombreDeMes`)
- Create: `src/lib/metricas/formato.ts`
- Test: `src/lib/metricas/mes.test.ts`, `src/lib/metricas/formato.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // mes.ts
  export function nombreDeMes(mes: string): string          // '2026-08' → 'agosto'
  // formato.ts
  export type Formato = 'numero' | 'porcentaje' | 'horas' | 'pesosMillones' | 'unidades'
  export function formatearValor(formato: Formato, valor: number | null): string
  export type Semaforo = 'rojo' | 'ambar' | 'verde'
  export function semaforo(actual: number, objetivo: number): Semaforo   // <50% rojo, <75% ámbar, resto verde (umbrales del ejemplo de gerencia)
  export function variacion(actual: number | null, anterior: number | null): number | null   // (a-b)/b, null si b null/0 o a null
  export function formatearVariacion(v: number | null): string   // '▲ 12%' / '▼ 8%' / '= 0%' / ''
  ```

- [ ] **Step 1: Tests**

`src/lib/metricas/mes.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mesActual, mesAnterior, nombreDeMes } from './mes'
describe('mes', () => {
    it('mesActual respeta la TZ de negocio', () => {
        expect(mesActual(new Date('2026-10-01T01:00:00Z'))).toBe('2026-09')   // 30/09 22:00 en BA
    })
    it('mesAnterior cruza el año', () => {
        expect(mesAnterior('2026-01')).toBe('2025-12')
        expect(mesAnterior('2026-09')).toBe('2026-08')
    })
    it('nombreDeMes en minúscula', () => {
        expect(nombreDeMes('2026-08')).toBe('agosto')
        expect(nombreDeMes('2026-01')).toBe('enero')
    })
})
```

`src/lib/metricas/formato.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { formatearValor, formatearVariacion, semaforo, variacion } from './formato'
describe('formato', () => {
    it('formatearValor por formato', () => {
        expect(formatearValor('numero', 1234)).toBe('1.234')
        expect(formatearValor('porcentaje', 0.4267)).toBe('43%')
        expect(formatearValor('horas', 2460)).toBe('41 hs')
        expect(formatearValor('horas', 90)).toBe('1,5 hs')
        expect(formatearValor('pesosMillones', 132_400_000)).toBe('$132,4M')
        expect(formatearValor('pesosMillones', 850_000)).toBe('$0,9M')
        expect(formatearValor('unidades', 430)).toBe('430 u.')
        expect(formatearValor('numero', null)).toBe('s/d')
    })
    it('semaforo por tramos', () => {
        expect(semaforo(40, 100)).toBe('rojo')
        expect(semaforo(50, 100)).toBe('ambar')
        expect(semaforo(75, 100)).toBe('verde')
        expect(semaforo(120, 100)).toBe('verde')
    })
    it('variacion y su formato', () => {
        expect(variacion(112, 100)).toBeCloseTo(0.12)
        expect(variacion(100, 0)).toBeNull()
        expect(variacion(null, 100)).toBeNull()
        expect(formatearVariacion(0.12)).toBe('▲ 12%')
        expect(formatearVariacion(-0.084)).toBe('▼ 8%')
        expect(formatearVariacion(0)).toBe('= 0%')
        expect(formatearVariacion(null)).toBe('')
    })
})
```

- [ ] **Step 2: Correr y ver fallar** → FAIL.

- [ ] **Step 3: Implementar**

Agregar a `mes.ts`:
```ts
const NOMBRES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
export function nombreDeMes(mes: string): string {
    return NOMBRES[Number(mes.split('-')[1]) - 1]
}
```

`formato.ts`:
```ts
export type Formato = 'numero' | 'porcentaje' | 'horas' | 'pesosMillones' | 'unidades'
export type Semaforo = 'rojo' | 'ambar' | 'verde'

const AR = 'es-AR'
const entero = (n: number) => Math.round(n).toLocaleString(AR)
const unDecimal = (n: number) => n.toLocaleString(AR, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Un solo lugar para el formato de cada tile. `null` → 's/d', como en analítica. */
export function formatearValor(formato: Formato, valor: number | null): string {
    if (valor === null) return 's/d'
    switch (formato) {
        case 'numero': return entero(valor)
        case 'porcentaje': return `${Math.round(valor * 100)}%`
        case 'horas': {
            const hs = valor / 60
            return `${Number.isInteger(hs) ? entero(hs) : unDecimal(hs)} hs`
        }
        case 'pesosMillones': return `$${unDecimal(valor / 1_000_000)}M`
        case 'unidades': return `${entero(valor)} u.`
    }
}

/** Umbrales del panel de gerencia que sirvió de referencia: <50% rojo, <75% ámbar. */
export function semaforo(actual: number, objetivo: number): Semaforo {
    const pct = objetivo > 0 ? (actual / objetivo) * 100 : 0
    return pct < 50 ? 'rojo' : pct < 75 ? 'ambar' : 'verde'
}

export function variacion(actual: number | null, anterior: number | null): number | null {
    if (actual === null || anterior === null || anterior === 0) return null
    return (actual - anterior) / anterior
}

export function formatearVariacion(v: number | null): string {
    if (v === null) return ''
    const pct = Math.round(Math.abs(v) * 100)
    if (pct === 0) return '= 0%'
    return `${v > 0 ? '▲' : '▼'} ${pct}%`
}
```

- [ ] **Step 4: Correr y ver pasar** → PASS. Si `toLocaleString('es-AR')` en jsdom/Node no trae separador de miles, usar `Intl.NumberFormat('es-AR')` explícito; el test manda.

- [ ] **Step 5: Commit**

```bash
git add src/lib/metricas
git commit -m "feat(metricas): helpers de mes y formato de tiles"
```

---

### Task 3: El catálogo

**Files:**
- Create: `src/lib/metricas/catalogo.ts`
- Test: `src/lib/metricas/catalogo.test.ts`

**Interfaces:**
- Consumes: `IMetricas`, `Formato`.
- Produces:
  ```ts
  export interface ContextoTitulo { propio: boolean; nombre: string }
  export type ValorObjetivo = { actual: number; objetivo: number | null }
  export type ValorComparacion = { actual: number; anterior: number | null }
  export type FilaLista = { etiqueta: string; valor: number }
  interface TileBase { id: string; titulo: string; ayuda: string; formato: Formato }
  export type Tile = TileBase & (
      | { forma: 'objetivo'; leer: (m: IMetricas) => ValorObjetivo | null }
      | { forma: 'comparacion'; leer: (m: IMetricas) => ValorComparacion | null }
      | { forma: 'lista'; leer: (m: IMetricas) => FilaLista[] | null; detalle?: (fila: FilaLista) => EstadoCliente | 'caida' }
  )
  export interface Seccion { id: string; titulo: (ctx: ContextoTitulo) => string; tiles: Tile[] }
  export const CATALOGO: Seccion[]
  ```

Reglas de `leer`: para el bloque de cartera, `m.ventas === null` → `null` (tile "Sin datos"). Para `comparacion` con `actual === null` → `null`.

- [ ] **Step 1: Test**

```ts
import { describe, expect, it } from 'vitest'
import { CATALOGO } from './catalogo'
import { MOCK_METRICAS } from '@/mocks/metricasMock'

describe('catalogo', () => {
    it('ids únicos y orden de secciones del spec', () => {
        const ids = CATALOGO.flatMap(s => s.tiles.map(t => t.id))
        expect(new Set(ids).size).toBe(ids.length)
        expect(CATALOGO.map(s => s.id)).toEqual(['mes', 'visitas', 'cartera'])
    })
    it('títulos según sujeto', () => {
        const [mes] = CATALOGO
        expect(mes.titulo({ propio: true, nombre: 'X' })).toBe('Mi mes')
        expect(mes.titulo({ propio: false, nombre: 'ACOSTA' })).toBe('ACOSTA · mes')
    })
    it('con el fixture completo ningún tile devuelve null', () => {
        for (const t of CATALOGO.flatMap(s => s.tiles)) expect(t.leer(MOCK_METRICAS), t.id).not.toBeNull()
    })
    it('sin ventas, solo los tiles de cartera devuelven null', () => {
        const sinVentas = { ...MOCK_METRICAS, ventas: null }
        for (const s of CATALOGO) for (const t of s.tiles) {
            if (s.id === 'cartera') expect(t.leer(sinVentas), t.id).toBeNull()
            else expect(t.leer(sinVentas), t.id).not.toBeNull()
        }
    })
    it('las listas con detalle mapean la fila a un estado', () => {
        const estado = CATALOGO[2].tiles.find(t => t.id === 'clientesPorEstado')!
        expect(estado.forma).toBe('lista')
        if (estado.forma === 'lista') expect(estado.detalle!({ etiqueta: 'Inactivo', valor: 1 })).toBe('Inactivo')
        const caida = CATALOGO[2].tiles.find(t => t.id === 'clientesEnCaida')!
        if (caida.forma === 'lista') expect(caida.detalle!({ etiqueta: 'X', valor: 1 })).toBe('caida')
    })
})
```

- [ ] **Step 2: Correr y ver fallar** → FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { EstadoCliente, IMetricas } from '@/types/metricas'
import type { Formato } from './formato'

export interface ContextoTitulo { propio: boolean; nombre: string }
export type ValorObjetivo = { actual: number; objetivo: number | null }
export type ValorComparacion = { actual: number; anterior: number | null }
export type FilaLista = { etiqueta: string; valor: number }

interface TileBase { id: string; titulo: string; ayuda: string; formato: Formato }
export type Tile = TileBase &
    (
        | { forma: 'objetivo'; leer: (m: IMetricas) => ValorObjetivo | null }
        | { forma: 'comparacion'; leer: (m: IMetricas) => ValorComparacion | null }
        | { forma: 'lista'; leer: (m: IMetricas) => FilaLista[] | null; detalle?: (fila: FilaLista) => EstadoCliente | 'caida' }
    )
export interface Seccion { id: string; titulo: (ctx: ContextoTitulo) => string; tiles: Tile[] }

const comp = (v: { actual: number | null; anterior: number | null }): ValorComparacion | null =>
    v.actual === null ? null : { actual: v.actual, anterior: v.anterior }

const titulo = (propio: string, sufijo: string) => (ctx: ContextoTitulo) =>
    ctx.propio ? propio : `${ctx.nombre} · ${sufijo}`

/**
 * EL catálogo. La pantalla lo recorre y renderiza; no hay JSX por KPI. Gerencia va a
 * cambiar métricas sobre la marcha: cambiar, sacar o reordenar un KPI es tocar una
 * entrada acá. Agregar uno con dato nuevo es un campo más en IMetricas (API) y una
 * entrada acá. Vocabulario del vendedor: "clientes de tu ruta", nunca "planificaciones".
 */
export const CATALOGO: Seccion[] = [
    {
        id: 'mes',
        titulo: titulo('Mi mes', 'mes'),
        tiles: [
            { id: 'visitas', forma: 'objetivo', titulo: 'Visitas', formato: 'numero',
              ayuda: 'Visitas válidas del mes (con ubicación en el local y al menos 15 minutos) contra el objetivo mensual.',
              leer: m => m.visitas },
            { id: 'clientesVisitados', forma: 'objetivo', titulo: 'Clientes visitados', formato: 'numero',
              ayuda: 'Clientes distintos que visitaste en el mes contra el objetivo mensual.',
              leer: m => m.clientesVisitados },
            { id: 'horas', forma: 'objetivo', titulo: 'Horas', formato: 'horas',
              ayuda: 'Tiempo total dentro de visitas válidas en el mes contra el objetivo mensual.',
              leer: m => m.minutos },
            { id: 'efectividad', forma: 'comparacion', titulo: 'Efectividad', formato: 'porcentaje',
              ayuda: 'Promedio de los tres cumplimientos de arriba (visitas, clientes y horas), cada uno topeado en 100%.',
              leer: m => comp(m.efectividadOperativa) },
        ],
    },
    {
        id: 'visitas',
        titulo: titulo('Mis visitas', 'visitas'),
        tiles: [
            { id: 'cobertura', forma: 'comparacion', titulo: 'Cobertura de la ruta', formato: 'porcentaje',
              ayuda: 'Clientes de tu ruta visitados sobre el total de clientes de tu ruta en el mes.',
              leer: m => comp(m.cobertura) },
            { id: 'pedidos', forma: 'comparacion', titulo: 'Pedidos sobre ofrecidos', formato: 'porcentaje',
              ayuda: 'Rubros cerrados con "Saqué pedido" sobre los rubros que ofreciste. Mide la visita, no la facturación posterior.',
              leer: m => comp(m.efectividadComercial) },
            { id: 'objeciones', forma: 'lista', titulo: 'Objeciones más frecuentes', formato: 'numero',
              ayuda: 'Motivos que declaraste al cerrar rubros sin pedido, los cinco más repetidos del mes.',
              leer: m => m.objeciones.top },
        ],
    },
    {
        id: 'cartera',
        titulo: titulo('Mi cartera', 'cartera'),
        tiles: [
            { id: 'facturacion', forma: 'objetivo', titulo: 'Facturación', formato: 'pesosMillones',
              ayuda: 'Ventas facturadas del mes a tus clientes contra el objetivo mensual.',
              leer: m => m.ventas?.facturacion ?? null },
            { id: 'unidades', forma: 'objetivo', titulo: 'Unidades', formato: 'unidades',
              ayuda: 'Unidades vendidas en el mes a tus clientes contra el objetivo mensual.',
              leer: m => m.ventas?.unidades ?? null },
            { id: 'superRubros', forma: 'objetivo', titulo: 'Super rubros', formato: 'numero',
              ayuda: 'Super rubros en los que al menos un cliente tuyo alcanzó el mínimo en el mes.',
              leer: m => m.ventas?.superRubros ?? null },
            { id: 'clientesPorEstado', forma: 'lista', titulo: 'Clientes por estado', formato: 'numero',
              ayuda: 'Activo: compra en el mes. Pasivo: compró en los últimos meses pero no en este. Inactivo: sin compras. Crítico: activo con caída fuerte. Es el mismo estado que ves en Versus. Tocá una fila para ver los clientes.',
              leer: m => m.ventas?.clientesPorEstado ?? null,
              detalle: f => f.etiqueta as EstadoCliente },
            { id: 'clientesEnCaida', forma: 'lista', titulo: 'Clientes en caída', formato: 'porcentaje',
              ayuda: 'Clientes con mayor caída de facturación reciente contra su promedio anterior. Tocá para ver el listado completo.',
              leer: m => m.ventas?.clientesEnCaida ?? null,
              detalle: () => 'caida' },
        ],
    },
]
```

- [ ] **Step 4: Correr y ver pasar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/metricas/catalogo.ts src/lib/metricas/catalogo.test.ts
git commit -m "feat(metricas): catálogo declarativo de KPIs"
```

---

### Task 4: Los tres tiles y sus estados

**Files:**
- Create: `src/components/metricas/TileMarco.tsx`, `TileObjetivo.tsx`, `TileComparacion.tsx`, `TileLista.tsx`, `TileSinDatos.tsx`, `TileEsqueleto.tsx`
- Test: `src/components/metricas/Tiles.test.tsx`

**Interfaces:**
- Consumes: `HelpPopover` (`src/components/analitica/HelpPopover.tsx`, props `{ label, children, align? }`), `formatearValor`, `semaforo`, `variacion`, `formatearVariacion`, `nombreDeMes`, `mesAnterior`.
- Produces:
  ```ts
  TileMarco: { titulo: string; ayuda: string; ancho?: 'simple' | 'doble'; children }     // caja + título + HelpPopover
  TileObjetivo: { titulo; ayuda; formato: Formato; valor: ValorObjetivo }
  TileComparacion: { titulo; ayuda; formato: Formato; valor: ValorComparacion; mes: string }   // mes = YYYY-MM que se está mirando
  TileLista: { titulo; ayuda; formato: Formato; filas: FilaLista[]; onFila?: (fila: FilaLista) => void }
  TileSinDatos: { titulo; ayuda; mensaje?: string; ancho?: 'simple' | 'doble' }
  TileEsqueleto: { ancho?: 'simple' | 'doble' }
  ```

Diseño (mobile, grilla de 2):
- **Marco:** `rounded-2xl bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(24,38,69,.06)]`; `ancho 'doble'` → `col-span-2`. Título `text-[11px] font-bold uppercase tracking-wide text-dsmuted` con el `HelpPopover` al lado (`label={`Qué significa ${titulo}`}`).
- **Objetivo:** número grande `text-[26px] font-black text-dsnavytext leading-none`; barra `h-1.5 rounded-full bg-[#E7E9F0]` con relleno `min(actual/objetivo,1)` y color por semáforo: rojo `bg-dsred`, ámbar `bg-dsorange`, verde `bg-dsgreen`; pie `text-[12px] text-dsmuted`: `"82 de 160"` (ambos con `formatearValor`; para `horas` el pie es `"41 de 100 hs"`: formatear objetivo con el formato y el actual sin sufijo — implementar `formatearValor(formato, actual).replace(/ hs$| u\.$/, '')` para el primero). Sin objetivo (`null`): número grande, sin barra, pie `"Sin objetivo cargado"`.
- **Comparación:** número grande; debajo `text-[12px]` con `formatearVariacion(variacion(actual, anterior))` + `vs. ${nombreDeMes(mesAnterior(mes))}`; color `text-dsgreen` si sube, `text-dsred` si baja, `text-dsmuted` si `= 0%`. Sin `anterior` → sin línea.
- **Lista:** ancho doble. Hasta 5 filas: `flex items-center gap-2 py-1.5` con etiqueta `text-[13px] font-semibold text-dsnavytext truncate`, barra proporcional al máximo (`h-1 bg-dsnavy/15` con relleno `bg-dsnavy`) y valor `text-[13px] font-bold tabular-nums` formateado. Con `onFila`, cada fila es `<button type="button" className="w-full text-left active:bg-black/5 rounded-lg">` y muestra un chevron `›` gris al final; sin `onFila`, `<div>`. Lista vacía → `"Nada para mostrar este mes"` en `text-dsmuted`.
- **SinDatos:** marco + `mensaje ?? 'Sin datos'` en `text-[13px] text-dsmuted`.
- **Esqueleto:** marco con dos barras `animate-pulse bg-[#E7E9F0]` (título y número), `aria-busy="true"`.

- [ ] **Step 1: Test**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TileObjetivo from './TileObjetivo'
import TileComparacion from './TileComparacion'
import TileLista from './TileLista'
import TileSinDatos from './TileSinDatos'

describe('tiles', () => {
    it('objetivo: número, pie "actual de objetivo" y semáforo rojo', () => {
        render(<TileObjetivo titulo="Visitas" ayuda="a" formato="numero" valor={{ actual: 64, objetivo: 160 }} />)
        expect(screen.getByText('64')).toBeInTheDocument()
        expect(screen.getByText('64 de 160')).toBeInTheDocument()
        expect(screen.getByTestId('barra-objetivo')).toHaveClass('bg-dsred')
        expect(screen.getByTestId('barra-objetivo')).toHaveStyle({ width: '40%' })
    })
    it('objetivo horas: "41 de 100 hs"', () => {
        render(<TileObjetivo titulo="Horas" ayuda="a" formato="horas" valor={{ actual: 2460, objetivo: 6000 }} />)
        expect(screen.getByText('41 de 100 hs')).toBeInTheDocument()
    })
    it('objetivo sin objetivo: sin barra y aviso', () => {
        render(<TileObjetivo titulo="Super rubros" ayuda="a" formato="numero" valor={{ actual: 10, objetivo: null }} />)
        expect(screen.queryByTestId('barra-objetivo')).toBeNull()
        expect(screen.getByText('Sin objetivo cargado')).toBeInTheDocument()
    })
    it('comparacion: variación contra el mes anterior', () => {
        render(<TileComparacion titulo="Cobertura" ayuda="a" formato="porcentaje" valor={{ actual: 0.55, anterior: 0.5 }} mes="2026-09" />)
        expect(screen.getByText('55%')).toBeInTheDocument()
        expect(screen.getByText('▲ 10% vs. agosto')).toHaveClass('text-dsgreen')
    })
    it('comparacion sin anterior: sin línea', () => {
        render(<TileComparacion titulo="Cobertura" ayuda="a" formato="porcentaje" valor={{ actual: 0.55, anterior: null }} mes="2026-09" />)
        expect(screen.queryByText(/vs\./)).toBeNull()
    })
    it('lista: filas tocables cuando hay onFila', () => {
        const onFila = vi.fn()
        render(<TileLista titulo="Clientes por estado" ayuda="a" formato="numero"
            filas={[{ etiqueta: 'Activo', valor: 52 }, { etiqueta: 'Inactivo', valor: 70 }]} onFila={onFila} />)
        fireEvent.click(screen.getByRole('button', { name: /Inactivo/ }))
        expect(onFila).toHaveBeenCalledWith({ etiqueta: 'Inactivo', valor: 70 })
        expect(screen.getByText('70')).toBeInTheDocument()
    })
    it('lista sin onFila: no hay botones; vacía: mensaje', () => {
        render(<TileLista titulo="Objeciones" ayuda="a" formato="numero" filas={[{ etiqueta: 'Precio', valor: 3 }]} />)
        expect(screen.queryByRole('button', { name: /Precio/ })).toBeNull()
        render(<TileLista titulo="Objeciones 2" ayuda="a" formato="numero" filas={[]} />)
        expect(screen.getByText('Nada para mostrar este mes')).toBeInTheDocument()
    })
    it('sin datos: título visible y mensaje', () => {
        render(<TileSinDatos titulo="Facturación" ayuda="a" mensaje="Sin datos por ahora" />)
        expect(screen.getByText('Facturación')).toBeInTheDocument()
        expect(screen.getByText('Sin datos por ahora')).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Correr y ver fallar** → FAIL.

- [ ] **Step 3: Implementar**

`TileMarco.tsx`:
```tsx
import type { ReactNode } from 'react'
import HelpPopover from '@/components/analitica/HelpPopover'

interface TileMarcoProps { titulo: string; ayuda: string; ancho?: 'simple' | 'doble'; children: ReactNode }

export default function TileMarco({ titulo, ayuda, ancho = 'simple', children }: TileMarcoProps) {
    return (
        <div className={`rounded-2xl bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(24,38,69,.06)] ${ancho === 'doble' ? 'col-span-2' : ''}`}>
            <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-dsmuted">
                <span className="truncate">{titulo}</span>
                <HelpPopover label={`Qué significa ${titulo}`} align="left">{ayuda}</HelpPopover>
            </p>
            <div className="mt-1.5">{children}</div>
        </div>
    )
}
```

`TileObjetivo.tsx`:
```tsx
import TileMarco from './TileMarco'
import { formatearValor, semaforo, type Formato } from '@/lib/metricas/formato'
import type { ValorObjetivo } from '@/lib/metricas/catalogo'

const COLOR = { rojo: 'bg-dsred', ambar: 'bg-dsorange', verde: 'bg-dsgreen' } as const
const sinSufijo = (s: string) => s.replace(/ hs$| u\.$/, '')

interface Props { titulo: string; ayuda: string; formato: Formato; valor: ValorObjetivo }

export default function TileObjetivo({ titulo, ayuda, formato, valor }: Props) {
    const { actual, objetivo } = valor
    const pct = objetivo ? Math.min(actual / objetivo, 1) * 100 : 0
    return (
        <TileMarco titulo={titulo} ayuda={ayuda}>
            <p className="text-[26px] font-black leading-none text-dsnavytext">{formatearValor(formato, actual)}</p>
            {objetivo ? (
                <>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E7E9F0]">
                        <div data-testid="barra-objetivo" className={`h-full rounded-full ${COLOR[semaforo(actual, objetivo)]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[12px] text-dsmuted">
                        {sinSufijo(formatearValor(formato, actual))} de {formatearValor(formato, objetivo)}
                    </p>
                </>
            ) : (
                <p className="mt-2 text-[12px] text-dsmuted">Sin objetivo cargado</p>
            )}
        </TileMarco>
    )
}
```
Ojo: con `formato 'pesosMillones'` el pie queda `"$132,4M de $150,0M"`, correcto. Con `horas`, `"41 de 100 hs"`.

`TileComparacion.tsx`:
```tsx
import TileMarco from './TileMarco'
import { formatearValor, formatearVariacion, variacion, type Formato } from '@/lib/metricas/formato'
import { mesAnterior, nombreDeMes } from '@/lib/metricas/mes'
import type { ValorComparacion } from '@/lib/metricas/catalogo'

interface Props { titulo: string; ayuda: string; formato: Formato; valor: ValorComparacion; mes: string }

export default function TileComparacion({ titulo, ayuda, formato, valor, mes }: Props) {
    const v = variacion(valor.actual, valor.anterior)
    const color = v === null || Math.round(v * 100) === 0 ? 'text-dsmuted' : v > 0 ? 'text-dsgreen' : 'text-dsred'
    return (
        <TileMarco titulo={titulo} ayuda={ayuda}>
            <p className="text-[26px] font-black leading-none text-dsnavytext">{formatearValor(formato, valor.actual)}</p>
            {v !== null && (
                <p className={`mt-2 text-[12px] font-semibold ${color}`}>
                    {formatearVariacion(v)} vs. {nombreDeMes(mesAnterior(mes))}
                </p>
            )}
        </TileMarco>
    )
}
```

`TileLista.tsx`:
```tsx
import TileMarco from './TileMarco'
import { formatearValor, type Formato } from '@/lib/metricas/formato'
import type { FilaLista } from '@/lib/metricas/catalogo'

interface Props { titulo: string; ayuda: string; formato: Formato; filas: FilaLista[]; onFila?: (fila: FilaLista) => void }

export default function TileLista({ titulo, ayuda, formato, filas, onFila }: Props) {
    const max = Math.max(...filas.map(f => f.valor), 1)
    return (
        <TileMarco titulo={titulo} ayuda={ayuda} ancho="doble">
            {filas.length === 0 ? (
                <p className="text-[13px] text-dsmuted">Nada para mostrar este mes</p>
            ) : (
                <ul className="-mx-1">
                    {filas.slice(0, 5).map(f => {
                        const contenido = (
                            <>
                                <span className="w-[38%] truncate text-[13px] font-semibold text-dsnavytext">{f.etiqueta}</span>
                                <span className="h-1 flex-1 overflow-hidden rounded-full bg-dsnavy/15">
                                    <span className="block h-full rounded-full bg-dsnavy" style={{ width: `${(f.valor / max) * 100}%` }} />
                                </span>
                                <span className="min-w-[44px] text-right text-[13px] font-bold tabular-nums text-dsnavytext">
                                    {formatearValor(formato, f.valor)}
                                </span>
                                {onFila && <span aria-hidden className="text-dsmuted">›</span>}
                            </>
                        )
                        const clase = 'flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left'
                        return (
                            <li key={f.etiqueta}>
                                {onFila ? (
                                    <button type="button" className={`${clase} active:bg-black/5`} onClick={() => onFila(f)}>{contenido}</button>
                                ) : (
                                    <div className={clase}>{contenido}</div>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}
        </TileMarco>
    )
}
```

`TileSinDatos.tsx`:
```tsx
import TileMarco from './TileMarco'
interface Props { titulo: string; ayuda: string; mensaje?: string; ancho?: 'simple' | 'doble' }
export default function TileSinDatos({ titulo, ayuda, mensaje = 'Sin datos', ancho }: Props) {
    return (
        <TileMarco titulo={titulo} ayuda={ayuda} ancho={ancho}>
            <p className="text-[13px] text-dsmuted">{mensaje}</p>
        </TileMarco>
    )
}
```

`TileEsqueleto.tsx`:
```tsx
interface Props { ancho?: 'simple' | 'doble' }
export default function TileEsqueleto({ ancho = 'simple' }: Props) {
    return (
        <div aria-busy="true" className={`animate-pulse rounded-2xl bg-white px-3.5 py-3 ${ancho === 'doble' ? 'col-span-2' : ''}`}>
            <div className="h-3 w-1/2 rounded bg-[#E7E9F0]" />
            <div className="mt-3 h-7 w-1/3 rounded bg-[#E7E9F0]" />
            <div className="mt-3 h-1.5 w-full rounded bg-[#E7E9F0]" />
        </div>
    )
}
```

- [ ] **Step 4: Correr y ver pasar** → PASS. `npx tsc -b` limpio.

- [ ] **Step 5: Commit**

```bash
git add src/components/metricas
git commit -m "feat(metricas): tiles objetivo, comparación y lista con estados"
```

---

### Task 5: `PanelMetricas` y `SelectorMes`

**Files:**
- Create: `src/components/metricas/SelectorMes.tsx`, `src/components/metricas/PanelMetricas.tsx`
- Test: `src/components/metricas/PanelMetricas.test.tsx`

**Interfaces:**
- Consumes: `CATALOGO`, tiles de Task 4, `useMetricas` de Task 1, `fechaHoraNegocio` de `src/lib/fechas.ts`, `Button` (`variant="outline" size="sm"`), `nombreDeMes`, `mesActual`, `mesAnterior`.
- Produces:
  ```ts
  SelectorMes: { mes: string; onCambiar: (mes: string) => void }          // chips 'Este mes' / 'Mes anterior' (aria-pressed)
  PanelMetricas: {
      mes: string
      vendedor?: string                     // undefined = yo; código; 'equipo'
      propio: boolean                       // títulos "Mi mes" vs "<Nombre> · mes"
      columnas?: 2 | 4                      // 2 default (mobile); 4 = grid-cols-2 lg:grid-cols-4
      onDetalle?: (args: { estado: EstadoCliente | 'caida'; titulo: string }) => void
  }
  ```

Comportamiento de `PanelMetricas`:
- `const { data, isLoading, isError, refetch } = useMetricas({ mes, vendedor })`.
- `isError` → arriba `<div role="alert">` con "No pudimos cargar tus métricas." y `<Button variant="outline" size="sm" onClick={() => refetch()}>Volver a intentar</Button>`; los tiles en esqueleto. Con `!propio` el texto es "No pudimos cargar las métricas."
- `isLoading` → cada sección con su título y esqueletos (uno por tile, doble para listas).
- Con `data`: por cada sección, título `text-[11px] font-bold uppercase tracking-[.08em] text-dsmuted px-1` y `<div className="grid grid-cols-2 gap-2.5">` (o `grid-cols-2 lg:grid-cols-4` con `columnas 4`). Por cada tile: `const v = tile.leer(data)`; `v === null` → `TileSinDatos` con `mensaje` = `data.fuentes.ventas === 'no_disponible' ? 'Sin datos por ahora' : 'Sin datos'`, `ancho` doble si `forma 'lista'`; si no, el tile correspondiente. `TileLista` recibe `onFila` solo si `tile.detalle && onDetalle`: `onFila={f => onDetalle({ estado: tile.detalle!(f), titulo: f.etiqueta })}`.
- Pie: `Datos actualizados: {fechaHoraNegocio(data.actualizadoEn)}` en `text-[11px] text-dsmuted text-center py-3`.

- [ ] **Step 1: Test**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PanelMetricas from './PanelMetricas'
import SelectorMes from './SelectorMes'
import * as api from '@/api/metricas'
import { MOCK_METRICAS } from '@/mocks/metricasMock'
vi.mock('@/api/metricas')

function montar(ui: React.ReactElement) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('PanelMetricas', () => {
    it('renderiza las secciones en el orden del catálogo con títulos propios', async () => {
        ;(api.getMetricas as any).mockResolvedValue(MOCK_METRICAS)
        montar(<PanelMetricas mes="2026-09" propio />)
        await waitFor(() => expect(screen.getByText('Visitas')).toBeInTheDocument())
        const titulos = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
        expect(titulos).toEqual(['Mi mes', 'Mis visitas', 'Mi cartera'])
        expect(screen.getByText(/Datos actualizados:/)).toBeInTheDocument()
    })
    it('con !propio usa el nombre del sujeto', async () => {
        ;(api.getMetricas as any).mockResolvedValue({ ...MOCK_METRICAS, sujeto: { tipo: 'vendedor', codigo: 'V 2', nombre: 'ACOSTA' } })
        montar(<PanelMetricas mes="2026-09" vendedor="V 2" propio={false} />)
        await waitFor(() => expect(screen.getByRole('heading', { name: 'ACOSTA · mes' })).toBeInTheDocument())
    })
    it('sin ventas: los tiles de cartera dicen "Sin datos por ahora"', async () => {
        ;(api.getMetricas as any).mockResolvedValue({ ...MOCK_METRICAS, ventas: null, fuentes: { ventas: 'no_disponible' } })
        montar(<PanelMetricas mes="2026-09" propio />)
        await waitFor(() => expect(screen.getAllByText('Sin datos por ahora')).toHaveLength(5))
        expect(screen.getByText('Facturación')).toBeInTheDocument()
    })
    it('error: aviso con reintento y esqueletos', async () => {
        ;(api.getMetricas as any).mockRejectedValueOnce(new Error('x')).mockResolvedValue(MOCK_METRICAS)
        montar(<PanelMetricas mes="2026-09" propio />)
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar tus métricas.'))
        expect(document.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0)
        fireEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }))
        await waitFor(() => expect(screen.getByText('Visitas')).toBeInTheDocument())
    })
    it('tocar una fila con detalle avisa estado y título', async () => {
        ;(api.getMetricas as any).mockResolvedValue(MOCK_METRICAS)
        const onDetalle = vi.fn()
        montar(<PanelMetricas mes="2026-09" propio onDetalle={onDetalle} />)
        await waitFor(() => screen.getByRole('button', { name: /Inactivo/ }))
        fireEvent.click(screen.getByRole('button', { name: /Inactivo/ }))
        expect(onDetalle).toHaveBeenCalledWith({ estado: 'Inactivo', titulo: 'Inactivo' })
        fireEvent.click(screen.getByRole('button', { name: /MUNDO AUTOPARTES/ }))
        expect(onDetalle).toHaveBeenCalledWith({ estado: 'caida', titulo: 'MUNDO AUTOPARTES SRL' })
        // Las objeciones no tienen detalle: no son botones
        expect(screen.queryByRole('button', { name: /Precio/ })).toBeNull()
    })
})

describe('SelectorMes', () => {
    it('dos chips, el activo con aria-pressed', () => {
        const onCambiar = vi.fn()
        const { rerender } = render(<SelectorMes mes="2026-09" onCambiar={onCambiar} />)
        // Este test corre con TZ de negocio; "este mes" es el de hoy real, así que lo calculamos
        const hoy = new Date()
        const esteMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
        rerender(<SelectorMes mes={esteMes} onCambiar={onCambiar} />)
        expect(screen.getByRole('button', { name: 'Este mes' })).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
        expect(onCambiar).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/))
    })
})
```

- [ ] **Step 2: Correr y ver fallar** → FAIL.

- [ ] **Step 3: Implementar**

`SelectorMes.tsx`:
```tsx
import { mesActual, mesAnterior } from '@/lib/metricas/mes'

interface Props { mes: string; onCambiar: (mes: string) => void }

/** Dos opciones a propósito (spec): mes calendario, los objetivos son mensuales. */
export default function SelectorMes({ mes, onCambiar }: Props) {
    const actual = mesActual()
    const opciones = [
        { label: 'Este mes', valor: actual },
        { label: 'Mes anterior', valor: mesAnterior(actual) },
    ]
    return (
        <div className="flex gap-2 px-4 pt-3" role="group" aria-label="Período">
            {opciones.map(o => {
                const activo = o.valor === mes
                return (
                    <button key={o.valor} type="button" aria-pressed={activo} onClick={() => onCambiar(o.valor)}
                        className={`h-8 rounded-full px-3.5 text-[12px] font-bold ${activo ? 'bg-dsnavy text-white' : 'bg-white text-dsnavy shadow-[0_1px_2px_rgba(24,38,69,.06)]'}`}>
                        {o.label}
                    </button>
                )
            })}
        </div>
    )
}
```

`PanelMetricas.tsx`:
```tsx
import { Button } from '@/components/ui/button'
import { CATALOGO, type FilaLista, type Tile } from '@/lib/metricas/catalogo'
import { useMetricas } from '@/hooks/useMetricas'
import { fechaHoraNegocio } from '@/lib/fechas'
import type { EstadoCliente, IMetricas } from '@/types/metricas'
import TileObjetivo from './TileObjetivo'
import TileComparacion from './TileComparacion'
import TileLista from './TileLista'
import TileSinDatos from './TileSinDatos'
import TileEsqueleto from './TileEsqueleto'

export interface DetalleArgs { estado: EstadoCliente | 'caida'; titulo: string }

interface Props {
    mes: string
    vendedor?: string
    propio: boolean
    columnas?: 2 | 4
    onDetalle?: (args: DetalleArgs) => void
}

/** Recorre el catálogo y renderiza. Estados POR TILE: un `leer()` en null es "Sin datos"
 *  con el título visible; solo el fallo del endpoint entero muestra el aviso de arriba. */
export default function PanelMetricas({ mes, vendedor, propio, columnas = 2, onDetalle }: Props) {
    const { data, isLoading, isError, refetch } = useMetricas({ mes, vendedor })
    const grilla = `grid gap-2.5 ${columnas === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`
    const ctx = { propio, nombre: data?.sujeto.nombre ?? '' }

    return (
        <div className="space-y-5 px-4 pb-4 pt-4">
            {isError && (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-[13px] text-dsnavytext">
                    <span>{propio ? 'No pudimos cargar tus métricas.' : 'No pudimos cargar las métricas.'}</span>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>Volver a intentar</Button>
                </div>
            )}
            {CATALOGO.map(seccion => (
                <section key={seccion.id} className="space-y-2">
                    <h2 className="px-1 text-[11px] font-bold uppercase tracking-[.08em] text-dsmuted">
                        {seccion.titulo(ctx)}
                    </h2>
                    <div className={grilla}>
                        {seccion.tiles.map(tile =>
                            data && !isLoading ? renderTile(tile, data, mes, onDetalle) : (
                                <TileEsqueleto key={tile.id} ancho={tile.forma === 'lista' ? 'doble' : 'simple'} />
                            ),
                        )}
                    </div>
                </section>
            ))}
            {data && (
                <p className="py-1 text-center text-[11px] text-dsmuted">Datos actualizados: {fechaHoraNegocio(data.actualizadoEn)}</p>
            )}
        </div>
    )
}

function renderTile(tile: Tile, data: IMetricas, mes: string, onDetalle?: (a: DetalleArgs) => void) {
    const comunes = { key: tile.id, titulo: tile.titulo, ayuda: tile.ayuda }
    const sinDatos = (
        <TileSinDatos {...comunes} ancho={tile.forma === 'lista' ? 'doble' : 'simple'}
            mensaje={data.fuentes.ventas === 'no_disponible' ? 'Sin datos por ahora' : 'Sin datos'} />
    )
    switch (tile.forma) {
        case 'objetivo': {
            const v = tile.leer(data)
            return v ? <TileObjetivo {...comunes} formato={tile.formato} valor={v} /> : sinDatos
        }
        case 'comparacion': {
            const v = tile.leer(data)
            return v ? <TileComparacion {...comunes} formato={tile.formato} valor={v} mes={mes} /> : sinDatos
        }
        case 'lista': {
            const filas = tile.leer(data)
            if (!filas) return sinDatos
            const onFila = tile.detalle && onDetalle
                ? (f: FilaLista) => onDetalle({ estado: tile.detalle!(f), titulo: f.etiqueta })
                : undefined
            return <TileLista {...comunes} formato={tile.formato} filas={filas} onFila={onFila} />
        }
    }
}
```

- [ ] **Step 4: Correr y ver pasar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/metricas/PanelMetricas.tsx src/components/metricas/PanelMetricas.test.tsx src/components/metricas/SelectorMes.tsx
git commit -m "feat(metricas): PanelMetricas recorre el catálogo; SelectorMes"
```

---

### Task 6: Capacidad, barra de tabs y página `Mi cartera`

**Files:**
- Modify: `src/types/planificacion.ts:628-632` (`ICapacidades`), `src/lib/roles.ts`
- Create: `src/components/BarraTabs.tsx`, `src/pages/CarteraPage.tsx`
- Modify: `src/components/VisitaEnCursoBar.tsx`, `src/pages/AgendaSemanaPage.tsx`, `src/App.tsx`
- Test: `src/lib/roles.test.ts` (existe: agregar), `src/components/BarraTabs.test.tsx`, `src/pages/CarteraPage.test.tsx`, `src/pages/AgendaSemanaPage.test.tsx` (agregar 2 casos)

**Interfaces:**
- Produces:
  ```ts
  // roles.ts
  export const veMetricas = (c: Cap): boolean => !!c && c.veSusMetricas
  // BarraTabs.tsx
  export const ALTO_BARRA_TABS = 56
  export default function BarraTabs(): JSX.Element     // NavLinks a '/' (Agenda) y '/cartera' (Mi cartera); solo se pinta si veMetricas(capacidades)
  // VisitaEnCursoBar.tsx
  sobreBarraTabs?: boolean      // true → bottom = 12 + ALTO_BARRA_TABS
  ```
- `ICapacidades.veSusMetricas: boolean`. **Todos los fixtures de tests** que construyen `capacidades` tienen que sumar `veSusMetricas` (buscar `superviseVendedores:` en `src/**/*.test.tsx`).

Comportamiento:
- `BarraTabs`: `<nav aria-label="Secciones" className="shrink-0 border-t border-dsline bg-white" style={{ height: ALTO_BARRA_TABS, paddingBottom: 'env(safe-area-inset-bottom)' }}>` con dos `NavLink` (`end` en `/`), ícono lucide (`CalendarDays`, `BarChart3`) arriba y texto `text-[11px] font-bold` abajo; activo `text-dsnavy`, inactivo `text-dsmuted`. `z-30` no hace falta porque no es `fixed`: es el último hijo del `flex-col h-dvh`. Si `!veMetricas(capacidades)` devuelve `null` (vendedor sin la capacidad: la app sigue igual que hoy).
- `VisitaEnCursoBar`: reemplazar `bottom-3` por `style={{ bottom: sobreBarraTabs ? 12 + ALTO_BARRA_TABS : 12 }}`.
- `AgendaSemanaPage`:
  1. Agregar `<BarraTabs />` como último hijo del `div.flex.h-dvh.flex-col` (después del bloque `textoBusqueda !== null ? ... : ...`). Como el contenedor es flex column con `overflow-hidden`, la agenda se achica sola.
  2. `VisitaEnCursoBar` recibe `sobreBarraTabs={veMetricas(capacidades)}`.
  3. `?visita=abrir`: después de los `useState`, un `useEffect` que, si `searchParams.get('visita') === 'abrir'`, hace `if (visitaEnCurso) abrirPropuesta(visitaEnCurso.cliente)` y borra el param con `setSearchParams(p => { p.delete('visita'); return p }, { replace: true })`. Depende de `[searchParams]` (y `visitaEnCurso` se lee del estado inicial, que ya viene de `leerVisitaEnCurso()`).
- `CarteraPage`:
  ```tsx
  const { user, logout, capacidades } = useAuth()
  const probando = estaProbando(capacidades)
  const [mes, setMes] = useState(() => mesActual())
  const [detalle, setDetalle] = useState<DetalleArgs | null>(null)      // Task 7 lo usa; en esta task el sheet todavía no existe: dejar el estado y NO pasar onDetalle
  const visitaEnCurso = leerVisitaEnCurso()
  const navigate = useNavigate()
  ```
  Shell: `div.flex.h-dvh.flex-col.overflow-hidden.bg-[#EEF1F6]` con `paddingTop: ALTO_BANNER_PRUEBA` si `probando`; `<BannerPrueba />`; header `bg-dsnavy text-white px-4 pt-3 pb-3.5 flex items-center justify-between` con la marca `D<span class=text-dsgreen>S</span> DistriSuper` (copiar el bloque de marca de `AppHeader`) y `<AccountMenu nombre={user?.name ?? ''} onLogout={logout} />`; debajo `<h1 className="px-4 pt-3 text-[18px] font-extrabold text-dsnavytext">Mi cartera</h1>`; `<SelectorMes mes={mes} onCambiar={setMes} />`; `<main className="flex-1 overflow-y-auto">` con `<PanelMetricas mes={mes} propio />`; `<BarraTabs />`; y si `visitaEnCurso`, `<VisitaEnCursoBar visitaId={...} nombreCliente={...} sobreBarraTabs onExpandir={() => navigate('/?visita=abrir')} />`.
- `App.tsx`: dentro del grupo `puedeOperarComoVendedor`, `<Route path="/cartera" element={<CarteraPage />} />`. **No** se protege por `veMetricas` a nivel ruta: `BarraTabs` ya no lo pinta, y entrar a mano sin capacidad muestra la pantalla igual (el backend responde 403/400 si no corresponde). Simplicidad > una guarda más.

- [ ] **Step 1: Tests**

`src/lib/roles.test.ts` (agregar):
```ts
it('veMetricas sigue la capacidad, no el rol', () => {
    const base = { operaComoVendedor: true, operaComoVendedorDePrueba: false, superviseVendedores: false }
    expect(veMetricas({ ...base, veSusMetricas: true })).toBe(true)
    expect(veMetricas({ ...base, veSusMetricas: false })).toBe(false)
    expect(veMetricas(null)).toBe(false)
})
```

`src/components/BarraTabs.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BarraTabs from './BarraTabs'
const authMock = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => authMock() }))
const caps = (veSusMetricas: boolean) => ({ capacidades: { operaComoVendedor: true, operaComoVendedorDePrueba: false, superviseVendedores: false, veSusMetricas } })

describe('BarraTabs', () => {
    it('marca el tab activo según la ruta', () => {
        authMock.mockReturnValue(caps(true))
        render(<MemoryRouter initialEntries={['/cartera']}><BarraTabs /></MemoryRouter>)
        expect(screen.getByRole('link', { name: /Mi cartera/ })).toHaveAttribute('aria-current', 'page')
        expect(screen.getByRole('link', { name: /Agenda/ })).not.toHaveAttribute('aria-current')
    })
    it('sin la capacidad no se pinta', () => {
        authMock.mockReturnValue(caps(false))
        render(<MemoryRouter><BarraTabs /></MemoryRouter>)
        expect(screen.queryByRole('navigation', { name: 'Secciones' })).toBeNull()
    })
})
```

`src/pages/CarteraPage.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import CarteraPage from './CarteraPage'
import * as api from '@/api/metricas'
import { MOCK_METRICAS } from '@/mocks/metricasMock'
vi.mock('@/api/metricas')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Mariano Acosta' }, logout: vi.fn(),
        capacidades: { operaComoVendedor: true, operaComoVendedorDePrueba: false, superviseVendedores: false, veSusMetricas: true } }),
}))
function EspiaURL() { const l = useLocation(); return <div data-testid="url">{l.pathname + l.search}</div> }
function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={['/cartera']}>
                <Routes>
                    <Route path="/cartera" element={<CarteraPage />} />
                    <Route path="/" element={<EspiaURL />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}
beforeEach(() => { localStorage.clear(); ;(api.getMetricas as any).mockResolvedValue(MOCK_METRICAS) })

describe('CarteraPage', () => {
    it('muestra título, selector, panel y barra de tabs', async () => {
        montar()
        expect(screen.getByRole('heading', { name: 'Mi cartera', level: 1 })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Este mes' })).toHaveAttribute('aria-pressed', 'true')
        await waitFor(() => expect(screen.getByText('Visitas')).toBeInTheDocument())
        expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeInTheDocument()
    })
    it('cambiar a "Mes anterior" pide ese mes', async () => {
        montar()
        fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
        await waitFor(() => expect((api.getMetricas as any).mock.calls.some(([a]: any) => a.mes !== MOCK_METRICAS.mes)).toBe(true))
    })
    it('con visita en curso muestra la barra y al tocarla vuelve a la agenda con ?visita=abrir', async () => {
        localStorage.setItem('visita-en-curso', JSON.stringify({ visitaId: 9, cliente: { rotacionClienteId: 1, nombreCliente: 'REPUESTOS SUR', codigoParticularCliente: '1', codigoCliente: '1', dia: 1, estado: 'en_curso' } }))
        montar()
        fireEvent.click(screen.getByTestId('visita-en-curso-bar'))
        await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/?visita=abrir'))
    })
})
```
(Revisar el formato exacto que guarda `src/lib/visitaEnCurso.ts` y ajustar la clave/forma del `setItem`.)

En `src/pages/AgendaSemanaPage.test.tsx` agregar (usando el `renderPage(url)` y los mocks existentes del archivo, con `veSusMetricas: true` en las capacidades del `authMock` por defecto):
```tsx
it('pinta la barra de tabs debajo de la agenda', async () => {
    renderPage('/')
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /Agenda/ })).toHaveAttribute('aria-current', 'page')
})
it('?visita=abrir abre el sheet de la visita en curso y limpia el param', async () => {
    // usar el mismo setup de localStorage que el test existente de "barra flotante de visita en curso"
    renderPage('/?visita=abrir')
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())   // el BottomSheet de VisitaSheet
    expect(screen.getByTestId('url')).toHaveTextContent('/')
    expect(screen.getByTestId('url')).not.toHaveTextContent('visita=abrir')
})
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run src/lib/roles.test.ts src/components/BarraTabs.test.tsx src/pages/CarteraPage.test.tsx src/pages/AgendaSemanaPage.test.tsx` → FAIL.

- [ ] **Step 3: Implementar**

`src/types/planificacion.ts` — en `ICapacidades`:
```ts
    /** Puede ver el tab "Mi cartera" (sus propias métricas). Spec 2026-09-21 métricas. */
    veSusMetricas: boolean
```
`src/lib/roles.ts`:
```ts
/** Ve el tab "Mi cartera" (sus métricas). Capacidad del backend, no rol. */
export const veMetricas = (c: Cap): boolean => !!c && c.veSusMetricas
```

`src/components/BarraTabs.tsx`:
```tsx
import { NavLink } from 'react-router-dom'
import { BarChart3, CalendarDays } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { veMetricas } from '@/lib/roles'

export const ALTO_BARRA_TABS = 56

const TABS = [
    { to: '/', label: 'Agenda', Icono: CalendarDays, end: true },
    { to: '/cartera', label: 'Mi cartera', Icono: BarChart3, end: false },
]

/** Barra inferior del vendedor. No es `fixed`: va como último hijo del `flex-col h-dvh`
 *  de cada página, así la agenda se achica sola y nada queda tapado. Lo único flotante
 *  que convive con ella es VisitaEnCursoBar, que se corre con `sobreBarraTabs`. */
export default function BarraTabs() {
    const { capacidades } = useAuth()
    if (!veMetricas(capacidades)) return null
    return (
        <nav aria-label="Secciones" className="flex shrink-0 border-t border-dsline bg-white"
            style={{ height: ALTO_BARRA_TABS, paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {TABS.map(({ to, label, Icono, end }) => (
                <NavLink key={to} to={to} end={end}
                    className={({ isActive }) => `flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${isActive ? 'text-dsnavy' : 'text-dsmuted'}`}>
                    <Icono className="h-5 w-5" strokeWidth={2.2} />
                    {label}
                </NavLink>
            ))}
        </nav>
    )
}
```

`src/components/VisitaEnCursoBar.tsx`: agregar `sobreBarraTabs?: boolean` a las props, importar `ALTO_BARRA_TABS`, quitar `bottom-3` de la clase y agregar `style={{ bottom: sobreBarraTabs ? 12 + ALTO_BARRA_TABS : 12 }}` al `<button>`.

`src/pages/CarteraPage.tsx`:
```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AccountMenu from '@/components/AccountMenu'
import BarraTabs from '@/components/BarraTabs'
import VisitaEnCursoBar from '@/components/VisitaEnCursoBar'
import BannerPrueba, { ALTO_BANNER_PRUEBA } from '@/components/prueba/BannerPrueba'
import PanelMetricas, { type DetalleArgs } from '@/components/metricas/PanelMetricas'
import SelectorMes from '@/components/metricas/SelectorMes'
import { useAuth } from '@/context/AuthContext'
import { estaProbando } from '@/lib/roles'
import { mesActual } from '@/lib/metricas/mes'
import { leerVisitaEnCurso } from '@/lib/visitaEnCurso'

/** Tab "Mi cartera" del vendedor. Shell propio (sin navegador de zonas ni progreso: son
 *  de la agenda). Spec docs/superpowers/specs/2026-09-21-metricas-vendedor-y-gerencia-design.md */
export default function CarteraPage() {
    const { user, logout, capacidades } = useAuth()
    const probando = estaProbando(capacidades)
    const navigate = useNavigate()
    const [mes, setMes] = useState(() => mesActual())
    const [, setDetalle] = useState<DetalleArgs | null>(null)   // Task 7 conecta el sheet
    const visitaEnCurso = leerVisitaEnCurso()

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-[#EEF1F6]" style={probando ? { paddingTop: ALTO_BANNER_PRUEBA } : undefined}>
            <BannerPrueba />
            <header className="flex items-center justify-between gap-2 bg-dsnavy px-4 pb-3.5 pt-3 text-white">
                <div className="flex min-w-0 items-center gap-2">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-white shadow-[0_2px_8px_rgba(0,0,0,.15)]">
                        <span className="text-[15px] font-black leading-none tracking-tight text-dsnavy">D<span className="text-dsgreen">S</span></span>
                    </div>
                    <span className="truncate text-[15px] font-extrabold tracking-tight">DistriSuper</span>
                </div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} />
            </header>
            <h1 className="px-4 pt-3 text-[18px] font-extrabold text-dsnavytext">Mi cartera</h1>
            <SelectorMes mes={mes} onCambiar={setMes} />
            <main className="flex-1 overflow-y-auto">
                <PanelMetricas mes={mes} propio />
            </main>
            <BarraTabs />
            {visitaEnCurso && (
                <VisitaEnCursoBar
                    visitaId={visitaEnCurso.visitaId}
                    nombreCliente={visitaEnCurso.cliente.nombreFantasia || visitaEnCurso.cliente.nombreCliente}
                    sobreBarraTabs
                    onExpandir={() => navigate('/?visita=abrir')}
                />
            )}
        </div>
    )
}
```
(Quitar `setDetalle` del import si el lint se queja por no usarse; Task 7 lo repone.)

`src/pages/AgendaSemanaPage.tsx`:
- Imports: `BarraTabs`, `veMetricas`.
- Después de los `useState` de `visitaEnCurso`/`visitaCliente`:
```tsx
    // Vuelta desde "Mi cartera" tocando la barra de visita en curso: abre el sheet y
    // limpia el param para que un refresh no lo reabra.
    useEffect(() => {
        if (searchParams.get('visita') !== 'abrir') return
        if (visitaEnCurso) abrirPropuesta(visitaEnCurso.cliente)
        setSearchParams(p => { p.delete('visita'); return p }, { replace: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams])
```
- `VisitaEnCursoBar`: agregar `sobreBarraTabs={veMetricas(capacidades)}`.
- `<BarraTabs />` como último hijo del contenedor raíz (después del `{textoBusqueda !== null ? ... : ...}`), **antes** de los sheets/flows que se renderizan como hermanos fuera del `div`? Verificar: si `VisitaFlow`, `ResolucionSheet`, etc. están dentro del mismo `div` raíz, `BarraTabs` va después del bloque de agenda y antes de ellos (son `fixed`, no ocupan lugar).

`src/App.tsx`: import `CarteraPage` y `<Route path="/cartera" element={<CarteraPage />} />` en el grupo del vendedor.

Fixtures: agregar `veSusMetricas: true` (o `false` donde el test sea del supervisor puro) a cada `capacidades: {...}` en `src/**/*.test.tsx`.

- [ ] **Step 4: Correr y ver pasar**

Run: `npx tsc -b && npx vitest run` → PASS completo.

- [ ] **Step 5: Verificación visual (mock)**

`VITE_METRICAS_MOCK=1 npm run dev`, abrir en viewport 360×740: la barra abajo, el tab activo en navy, la agenda no queda tapada, con una visita en curso la barra flotante se apoya sobre la de tabs. En `/cartera`: 3 secciones, grilla de 2, listas a ancho completo, pie con la fecha.

- [ ] **Step 6: Commit**

```bash
git add src/types/planificacion.ts src/lib/roles.ts src/lib/roles.test.ts src/components/BarraTabs.tsx src/components/BarraTabs.test.tsx src/components/VisitaEnCursoBar.tsx src/pages/CarteraPage.tsx src/pages/CarteraPage.test.tsx src/pages/AgendaSemanaPage.tsx src/pages/AgendaSemanaPage.test.tsx src/App.tsx src
git commit -m "feat(cartera): tab 'Mi cartera' con barra inferior; capacidad veSusMetricas"
```

---

### Task 7: Sheet de detalle de clientes

**Files:**
- Create: `src/components/metricas/DetalleClientesSheet.tsx`
- Modify: `src/pages/CarteraPage.tsx` (conectar `onDetalle`)
- Test: `src/components/metricas/DetalleClientesSheet.test.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (`{ open, onClose, title, subtitle?, altura?, children }`), `useMetricasClientes`, `formatearValor`, `formatearVariacion`.
- Produces: `DetalleClientesSheet: { detalle: DetalleArgs | null; mes: string; vendedor?: string; onClose: () => void }`.

Comportamiento: `open={detalle !== null}`; `title` = `detalle.estado === 'caida' ? 'Clientes en caída' : `Clientes ${detalle.titulo.toLowerCase()}s`` (Activos / Pasivos / Inactivos / Críticos; para 'Crítico' → 'Clientes críticos'); `subtitle` = `"Facturación del mes vs. promedio de los 6 meses anteriores"`; `altura="hasta-completa"`. Cuerpo: `useMetricasClientes({ mes, vendedor, estado }, { enabled: detalle !== null })`. Cargando → tres filas esqueleto; error → texto + "Volver a intentar"; vacío → "No hay clientes en este grupo"; lista: por cliente una fila `flex justify-between` con nombre (`font-semibold truncate`) y código (`text-[11px] text-dsmuted`) a la izquierda, y a la derecha `formatearValor('pesosMillones', actual)` en negrita, debajo `prom. {formatearValor('pesosMillones', promedio6m)}` y `formatearVariacion(variacion)` coloreado (verde/rojo/gris; `null` → nada). Pie: `"{n} clientes"`.

- [ ] **Step 1: Test**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DetalleClientesSheet from './DetalleClientesSheet'
import * as api from '@/api/metricas'
import { MOCK_CLIENTES } from '@/mocks/metricasMock'
vi.mock('@/api/metricas')
const montar = (ui: React.ReactElement) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}
describe('DetalleClientesSheet', () => {
    it('cerrado no pide nada', () => {
        montar(<DetalleClientesSheet detalle={null} mes="2026-09" onClose={() => {}} />)
        expect(api.getMetricasClientes).not.toHaveBeenCalled()
    })
    it('abierto lista clientes con actual, promedio y variación', async () => {
        ;(api.getMetricasClientes as any).mockResolvedValue(MOCK_CLIENTES)
        montar(<DetalleClientesSheet detalle={{ estado: 'Inactivo', titulo: 'Inactivo' }} mes="2026-09" onClose={() => {}} />)
        expect(screen.getByText('Clientes inactivos')).toBeInTheDocument()
        await waitFor(() => expect(screen.getByText('MUNDO AUTOPARTES SRL')).toBeInTheDocument())
        expect(api.getMetricasClientes).toHaveBeenCalledWith({ mes: '2026-09', vendedor: undefined, estado: 'Inactivo' })
        expect(screen.getByText('$88,1M')).toBeInTheDocument()
        expect(screen.getByText('▼ 42%')).toBeInTheDocument()
        expect(screen.getByText('4 clientes')).toBeInTheDocument()
    })
    it('caida: título propio', () => {
        ;(api.getMetricasClientes as any).mockResolvedValue([])
        montar(<DetalleClientesSheet detalle={{ estado: 'caida', titulo: 'X' }} mes="2026-09" onClose={() => {}} />)
        expect(screen.getByText('Clientes en caída')).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Correr y ver fallar** → FAIL.

- [ ] **Step 3: Implementar**

```tsx
import BottomSheet from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/button'
import { useMetricasClientes } from '@/hooks/useMetricas'
import { formatearValor, formatearVariacion } from '@/lib/metricas/formato'
import type { DetalleArgs } from './PanelMetricas'

interface Props { detalle: DetalleArgs | null; mes: string; vendedor?: string; onClose: () => void }

const TITULO: Record<DetalleArgs['estado'], string> = {
    Activo: 'Clientes activos', Pasivo: 'Clientes pasivos', Inactivo: 'Clientes inactivos', 'Crítico': 'Clientes críticos', caida: 'Clientes en caída',
}

/** El listado que el panel de referencia desplegaba al tocar una categoría; acá en sheet
 *  porque en mobile no hay ancho para una tabla inline. Solo lectura. */
export default function DetalleClientesSheet({ detalle, mes, vendedor, onClose }: Props) {
    const estado = detalle?.estado ?? 'Activo'
    const { data, isLoading, isError, refetch } = useMetricasClientes({ mes, vendedor, estado }, { enabled: detalle !== null })

    return (
        <BottomSheet open={detalle !== null} onClose={onClose} title={TITULO[estado]}
            subtitle="Facturación del mes vs. promedio de los 6 meses anteriores" altura="hasta-completa">
            {isLoading && <div className="space-y-2 p-4">{[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-[#E7E9F0]" />)}</div>}
            {isError && (
                <div className="flex items-center justify-between gap-3 p-4 text-[13px]">
                    <span>No pudimos cargar el listado.</span>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>Volver a intentar</Button>
                </div>
            )}
            {data && data.length === 0 && <p className="p-4 text-[13px] text-dsmuted">No hay clientes en este grupo</p>}
            {data && data.length > 0 && (
                <>
                    <ul className="divide-y divide-dsline px-4">
                        {data.map(c => {
                            const v = c.variacion
                            const color = v === null ? '' : Math.round(v * 100) === 0 ? 'text-dsmuted' : v > 0 ? 'text-dsgreen' : 'text-dsred'
                            return (
                                <li key={c.codigoParticularCliente} className="flex items-center justify-between gap-3 py-2.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-[13px] font-semibold text-dsnavytext">{c.nombre}</p>
                                        <p className="text-[11px] text-dsmuted">{c.codigoParticularCliente}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-[13px] font-bold tabular-nums text-dsnavytext">{formatearValor('pesosMillones', c.actual)}</p>
                                        <p className="text-[11px] text-dsmuted">
                                            prom. {formatearValor('pesosMillones', c.promedio6m)}
                                            {v !== null && <span className={`ml-1.5 font-semibold ${color}`}>{formatearVariacion(v)}</span>}
                                        </p>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                    <p className="px-4 py-3 text-center text-[11px] text-dsmuted">{data.length} clientes</p>
                </>
            )}
        </BottomSheet>
    )
}
```

En `CarteraPage.tsx`: `const [detalle, setDetalle] = useState<DetalleArgs | null>(null)`, `<PanelMetricas mes={mes} propio onDetalle={setDetalle} />`, y `<DetalleClientesSheet detalle={detalle} mes={mes} onClose={() => setDetalle(null)} />` después de `BarraTabs`.

Agregar a `CarteraPage.test.tsx`:
```tsx
it('tocar "Inactivo" abre el sheet de clientes', async () => {
    ;(api.getMetricasClientes as any).mockResolvedValue(MOCK_CLIENTES)
    montar()
    await waitFor(() => screen.getByRole('button', { name: /Inactivo/ }))
    fireEvent.click(screen.getByRole('button', { name: /Inactivo/ }))
    await waitFor(() => expect(screen.getByText('Clientes inactivos')).toBeInTheDocument())
})
```

- [ ] **Step 4: Correr y ver pasar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/metricas/DetalleClientesSheet.tsx src/components/metricas/DetalleClientesSheet.test.tsx src/pages/CarteraPage.tsx src/pages/CarteraPage.test.tsx
git commit -m "feat(cartera): sheet con el listado de clientes por estado / en caída"
```

---

### Task 8: Gerencia — pestaña `Métricas`

**Files:**
- Create: `src/pages/AnaliticaMetricasPage.tsx`
- Modify: `src/components/analitica/AnaliticaTabs.tsx`, `src/App.tsx`
- Test: `src/pages/AnaliticaMetricasPage.test.tsx`, `src/components/analitica/AnaliticaTabs.test.tsx` (si existe: agregar; si no, cubrirlo desde la página)

**Interfaces:**
- Consumes: `AnaliticaTabs`, `AccountMenu`, `useAccionesDeCuenta`, `useVendedores` (`src/hooks/useAnalitica.ts`), `useSearchParams`, `SelectorMes`, `PanelMetricas` (`columnas={4}`), `DetalleClientesSheet`.

Comportamiento:
- Ruta `/analitica/metricas` en el grupo `supervisa`. `NavLink` `Métricas` en `AnaliticaTabs` después de `Actividad` y antes de `Ruta`, con la misma `tabClase`.
- Estado en URL: `vendedor` (`'equipo'` por defecto) y `mes` (`mesActual()` por defecto), con `setParams(..., { replace: true })` como `useFiltroAnalitica`.
- Chips: `Equipo` + uno por `roster` (`useVendedores()`), horizontal con scroll (`flex gap-2 overflow-x-auto no-scrollbar`), `aria-pressed`. El nombre corto del chip: `nombreVendedor.split(' ')[0]` no — mostrar el nombre completo; el scroll horizontal resuelve el ancho.
- Shell: igual que `AnaliticaPage` (header blanco con `AnaliticaTabs` + `AccountMenu` con `acciones`), `main` `mx-auto max-w-7xl px-6 py-6` con: chips, `SelectorMes`, `PanelMetricas mes vendedor propio={false} columnas={4} onDetalle`, `DetalleClientesSheet` con `vendedor`.
- `PanelMetricas` con `vendedor='equipo'` → títulos "Equipo · mes" (el `sujeto.nombre` viene del backend como `'Equipo'`).

- [ ] **Step 1: Test**

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import AnaliticaMetricasPage from './AnaliticaMetricasPage'
import * as metricas from '@/api/metricas'
import * as analitica from '@/api/analitica'
import { MOCK_METRICAS, MOCK_METRICAS_EQUIPO } from '@/mocks/metricasMock'
import { MOCK_VENDEDORES } from '@/mocks/analiticaMock'
vi.mock('@/api/metricas')
vi.mock('@/api/analitica')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Gerente' }, logout: vi.fn(),
        capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true, veSusMetricas: true } }),
}))
function EspiaURL() { const l = useLocation(); return <div data-testid="url">{l.search}</div> }
function montar(url = '/analitica/metricas') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[url]}>
                <Routes><Route path="/analitica/metricas" element={<><AnaliticaMetricasPage /><EspiaURL /></>} /></Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}
beforeEach(() => {
    ;(analitica.getVendedores as any).mockResolvedValue(MOCK_VENDEDORES)
    ;(metricas.getMetricas as any).mockImplementation(async (a: any) => a.vendedor === 'equipo' ? MOCK_METRICAS_EQUIPO : { ...MOCK_METRICAS, sujeto: { tipo: 'vendedor', codigo: a.vendedor, nombre: 'ACOSTA MARIANO' } })
})

describe('AnaliticaMetricasPage', () => {
    it('arranca en Equipo y pinta la pestaña activa', async () => {
        montar()
        expect(screen.getByRole('link', { name: 'Métricas' })).toHaveAttribute('aria-current', 'page')
        expect(screen.getByRole('button', { name: 'Equipo' })).toHaveAttribute('aria-pressed', 'true')
        await waitFor(() => expect(screen.getByRole('heading', { name: 'Equipo · mes' })).toBeInTheDocument())
        expect(metricas.getMetricas).toHaveBeenCalledWith(expect.objectContaining({ vendedor: 'equipo' }))
    })
    it('elegir un vendedor cambia el sujeto y la URL', async () => {
        montar()
        await waitFor(() => screen.getByRole('button', { name: MOCK_VENDEDORES[0].nombreVendedor }))
        fireEvent.click(screen.getByRole('button', { name: MOCK_VENDEDORES[0].nombreVendedor }))
        await waitFor(() => expect(screen.getByRole('heading', { name: 'ACOSTA MARIANO · mes' })).toBeInTheDocument())
        expect(screen.getByTestId('url')).toHaveTextContent(`vendedor=${encodeURIComponent(MOCK_VENDEDORES[0].codigoParticularVendedor)}`)
    })
    it('respeta ?vendedor= y ?mes= de la URL', async () => {
        montar(`/analitica/metricas?vendedor=${encodeURIComponent(MOCK_VENDEDORES[1].codigoParticularVendedor)}&mes=2026-08`)
        await waitFor(() => expect(metricas.getMetricas).toHaveBeenCalledWith({ mes: '2026-08', vendedor: MOCK_VENDEDORES[1].codigoParticularVendedor }))
    })
})
```

- [ ] **Step 2: Correr y ver fallar** → FAIL.

- [ ] **Step 3: Implementar**

`AnaliticaTabs.tsx`: agregar entre `Actividad` y `Ruta`:
```tsx
            <NavLink to="/analitica/metricas" className={({ isActive }) => tabClase(isActive)}>
                Métricas
            </NavLink>
```

`src/pages/AnaliticaMetricasPage.tsx`:
```tsx
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import AccountMenu from '@/components/AccountMenu'
import PanelMetricas, { type DetalleArgs } from '@/components/metricas/PanelMetricas'
import SelectorMes from '@/components/metricas/SelectorMes'
import DetalleClientesSheet from '@/components/metricas/DetalleClientesSheet'
import { useAccionesDeCuenta } from '@/hooks/useAccionesDeCuenta'
import { useAuth } from '@/context/AuthContext'
import { useVendedores } from '@/hooks/useAnalitica'
import { mesActual } from '@/lib/metricas/mes'

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Pestaña "Métricas" de gerencia: el mismo PanelMetricas del vendedor, con el sujeto
 *  elegido por chips (Equipo o un vendedor del scope). Ranking NO entra (fuera de alcance). */
export default function AnaliticaMetricasPage() {
    const { user, logout } = useAuth()
    const accionesDeCuenta = useAccionesDeCuenta()
    const [params, setParams] = useSearchParams()
    const { data: roster } = useVendedores()
    const [detalle, setDetalle] = useState<DetalleArgs | null>(null)

    const vendedor = params.get('vendedor') || 'equipo'
    const mesParam = params.get('mes')
    const mes = mesParam && MES_RE.test(mesParam) ? mesParam : mesActual()

    const set = (k: 'vendedor' | 'mes', v: string) =>
        setParams(p => { p.set(k, v); return p }, { replace: true })

    const chips = [{ codigo: 'equipo', nombre: 'Equipo' }, ...(roster ?? []).map(v => ({ codigo: v.codigoParticularVendedor, nombre: v.nombreVendedor }))]

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="flex items-center justify-between gap-4 bg-white px-6 pt-4">
                <div className="flex-1"><AnaliticaTabs /></div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} acciones={accionesDeCuenta} />
            </header>
            <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
                <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Vendedor">
                    {chips.map(c => {
                        const activo = c.codigo === vendedor
                        return (
                            <button key={c.codigo} type="button" aria-pressed={activo} onClick={() => set('vendedor', c.codigo)}
                                className={`h-8 shrink-0 rounded-full border px-3.5 text-[12px] font-bold ${activo ? 'border-dsnavy bg-dsnavy text-white' : 'border-slate-200 bg-white text-dsnavy hover:bg-dsnavy/5'}`}>
                                {c.nombre}
                            </button>
                        )
                    })}
                </div>
                <div className="-mx-4"><SelectorMes mes={mes} onCambiar={m => set('mes', m)} /></div>
                <div className="-mx-4 rounded-lg">
                    <PanelMetricas mes={mes} vendedor={vendedor} propio={false} columnas={4} onDetalle={setDetalle} />
                </div>
            </main>
            <DetalleClientesSheet detalle={detalle} mes={mes} vendedor={vendedor} onClose={() => setDetalle(null)} />
        </div>
    )
}
```
(Los `-mx-4` compensan el `px-4` interno de `SelectorMes`/`PanelMetricas`, pensados para mobile. Si queda feo en desktop, agregar a ambos una prop `className` opcional en vez de hackear márgenes; la decisión es del implementador, el test no lo mira.)

`App.tsx`: `<Route path="/analitica/metricas" element={<AnaliticaMetricasPage />} />` en el grupo `supervisa`.

- [ ] **Step 4: Correr y ver pasar**

Run: `npx tsc -b && npx vitest run` → PASS completo.

- [ ] **Step 5: Verificación visual**

`npm run dev` con mocks, entrar como supervisor a `/analitica/metricas` en desktop (4 columnas, listas a `col-span-2`) y en 360px (2 columnas). Cambiar chips y período; abrir el sheet de un estado.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AnaliticaMetricasPage.tsx src/pages/AnaliticaMetricasPage.test.tsx src/components/analitica/AnaliticaTabs.tsx src/App.tsx
git commit -m "feat(analitica): pestaña Métricas con chips de vendedor / equipo"
```

---

### Task 9: Documentación

**Files:**
- Modify: `CLAUDE.md` (sección "Fuera de alcance" y una decisión nueva), `docs/dominio/modelo.md` (una nota corta)

- [ ] **Step 1: CLAUDE.md**

En "Fuera de alcance", reemplazar `Cumplimiento de objetivo/ranking de vendedores` por `Ranking de vendedores`, y agregar al final del párrafo:

> El **cumplimiento de objetivo del propio vendedor** SÍ entra desde el spec
> `2026-09-21-metricas-vendedor-y-gerencia-design.md`: es el tab "Mi cartera" (`/cartera`), y la
> pestaña "Métricas" de gerencia (`/analitica/metricas`). El ranking sigue afuera.

En "Decisiones no obvias", agregar:

> - **Las métricas son un catálogo declarativo, no JSX por KPI.** `src/lib/metricas/catalogo.ts`
>   lista secciones y tiles (`objetivo` / `comparacion` / `lista`) sobre el objeto ancho de
>   `GET /planificacion/metricas`. Gerencia cambia KPIs sobre la marcha: sacar, reordenar o
>   renombrar es tocar una entrada ahí; agregar uno con dato nuevo es un campo más en la API y
>   una entrada. No agregar un `<KpiTile>` suelto en `PanelMetricas`. El tab se muestra con la
>   capacidad `veSusMetricas` de `/planificacion/me`, no por rol. Los objetivos de venta están
>   hardcodeados en la fila global de `pl_objetivo` (0 = "s/d") hasta que gerencia pase los
>   reales.

- [ ] **Step 2: `docs/dominio/modelo.md`**

Agregar al final una sección corta "Métricas del vendedor" con dos frases: que el vendedor ve sus métricas por mes calendario (no por rotación), y que "clientes con compra" no existe como dato (no hay vínculo `pl_resolucion` ↔ `fct_sales`): lo que se muestra es efectividad comercial declarada en la visita.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/dominio/modelo.md
git commit -m "docs: métricas del vendedor entran en alcance; catálogo declarativo"
```

---

## Self-review

- **Cobertura del spec:** barra de tabs y rutas (T6), header propio sin zonas (T6), `VisitaEnCursoBar` sobre la barra y vuelta con sheet abierto (T6), selector de período dos chips (T5), secciones + grilla 2 + listas dobles (T5), pie "Datos actualizados" (T5), vendedor de prueba con ventas en "Sin datos" (T5 vía `fuentes`), gerencia con chips y 4 columnas (T8), equipo = títulos "Equipo · mes" (T8), catálogo con las tres formas y tipos (T3, T4), estados por tile y aviso con reintento (T5), sheet de detalle (T7), capacidad `veSusMetricas` (T6), CLAUDE.md (T9), mock `VITE_METRICAS_MOCK` (T1).
- **Consistencia de nombres:** `IMetricas`, `IMetricaCliente`, `EstadoCliente`, `DetalleArgs`, `ValorObjetivo`, `ValorComparacion`, `FilaLista`, `Formato`, `mesActual`, `mesAnterior`, `nombreDeMes`, `formatearValor`, `semaforo`, `variacion`, `formatearVariacion`, `veMetricas`, `ALTO_BARRA_TABS`, `sobreBarraTabs`, `metricasKeys` — usados con el mismo nombre en todas las tasks.
- **Dependencia con el backend:** hasta que api-vendedores despliegue, la app funciona con `VITE_METRICAS_MOCK=1`. Sin mock y sin endpoint, el panel muestra el aviso de error con reintento; la agenda no se ve afectada. El backend agrega `veSusMetricas` a `/me`; hasta entonces `capacidades.veSusMetricas` es `undefined` y `veMetricas` devuelve `false`: la barra no aparece y la app queda como hoy. Es el comportamiento deseado para desplegar el front primero.
