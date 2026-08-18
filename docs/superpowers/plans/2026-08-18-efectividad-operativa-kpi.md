# Efectividad operativa — KPIs mensuales de actividad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a `/analitica` un bloque nuevo — con su propio selector de mes — que muestre tres KPIs de actividad por vendedor (Efectividad operativa, Visitas mensuales, Horas mensuales), calculados sobre el mock existente, sin tocar la tabla de cobertura/rango libre que ya existe.

**Architecture:** Todo el trabajo es frontend, Fase 1 (sobre el mock ya existente en `analiticaMock.ts`/`api/analitica.ts` — no se toca ningún tipo ni el contrato de mock). Se agrega un componente contenedor (`EfectividadOperativaSection`) que mantiene su propio estado de mes, lo traduce a un `IAnaliticaFiltro` de mes calendario completo, y llama a `useResumen` (el mismo hook que ya usa el resto de `/analitica`) con ese filtro independiente. Dos componentes de presentación (`KpisMensuales`, `TablaEfectividadOperativa`) renderizan el resultado.

**Tech Stack:** React 19 + TypeScript, Tailwind, lucide-react (íconos), Vitest 4 + Testing Library, React Query v5 (ya en uso).

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-08-18-efectividad-operativa-kpi-design.md`. Ante cualquier duda de criterio, manda el spec.
- **No se tocan** `src/types/analitica.ts`, `src/api/analitica.ts`, `src/hooks/useAnalitica.ts`, `src/mocks/analiticaMock.ts`: los campos que hacen falta (`efectividadOperativa`, `visitasValidas`, `minutosTotales`) ya existen.
- **No se muestra** "Cobertura del plan" ni "Efectividad comercial" en el bloque nuevo. Esos KPIs siguen existiendo tal cual en `TablaVendedores`/`KpisEquipo` — no se tocan.
- `efectividadOperativa` ya viene en escala **0..100** (no 0..1 como `cobertura` o `efectividadComercial`) — ver `TablaVendedores.tsx:44` (`Math.round(v.efectividadOperativa)`).
- **Nunca mostrar `0%`/`0` cuando el dato falta.** `null` se muestra como `s/d`, igual que el resto de `/analitica`.
- **Indentación de 4 espacios, sin punto y coma** al final de línea, como el resto de `src/`.
- **Idioma:** identificadores y comentarios en español, igual que el código existente.
- Cada tarea termina con `npm test` en verde y un commit.

---

### Task 1: Helpers de mes calendario en `fechas.ts`

**Files:**
- Modify: `src/lib/fechas.ts`
- Modify: `src/lib/fechas.test.ts`

**Interfaces:**
- Consumes: `isoLocal` (ya existe en el mismo archivo).
- Produces: `rangoMes(fecha: Date): { desde: string; hasta: string }`, `nombreMes(fecha: Date): string`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/lib/fechas.test.ts`:

```typescript
import { nombreMes, rangoMes } from './fechas'

describe('rangoMes', () => {
    it('devuelve el primer y último día del mes calendario de la fecha dada', () => {
        expect(rangoMes(new Date(2026, 7, 18))).toEqual({ desde: '2026-08-01', hasta: '2026-08-31' })
    })

    it('funciona en meses de 30 y 28/29 días', () => {
        expect(rangoMes(new Date(2026, 3, 5))).toEqual({ desde: '2026-04-01', hasta: '2026-04-30' })
        expect(rangoMes(new Date(2026, 1, 10))).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
    })
})

describe('nombreMes', () => {
    it('devuelve el nombre del mes capitalizado seguido del año', () => {
        expect(nombreMes(new Date(2026, 7, 18))).toBe('Agosto 2026')
        expect(nombreMes(new Date(2026, 0, 1))).toBe('Enero 2026')
    })
})
```

(Nota: el import de `nombreMes`/`rangoMes` va junto a los demás imports de `fechas` que ya están en la línea 2 del archivo — no dupliques el `import` statement, agregalos ahí.)

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/lib/fechas.test.ts`
Expected: FAIL — `rangoMes`/`nombreMes` no están exportados por `./fechas`.

- [ ] **Step 3: Implementar los helpers**

Agregar al final de `src/lib/fechas.ts`:

```typescript
/** Primer y último día del mes calendario que contiene `fecha`, en formato YYYY-MM-DD.
 *  Es el filtro que usa el bloque de Efectividad operativa: siempre mes completo,
 *  nunca un rango libre. */
export function rangoMes(fecha: Date): { desde: string; hasta: string } {
    const anio = fecha.getFullYear()
    const mes = fecha.getMonth()
    return {
        desde: isoLocal(new Date(anio, mes, 1)),
        // Día 0 del mes siguiente = último día de este mes.
        hasta: isoLocal(new Date(anio, mes + 1, 0)),
    }
}

const NOMBRES_MES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "Agosto 2026". Se arma a mano (no con Intl) para no depender de que el locale
 *  del runtime devuelva "agosto de 2026" o algo distinto según la plataforma. */
export function nombreMes(fecha: Date): string {
    const nombre = NOMBRES_MES[fecha.getMonth()]
    return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${fecha.getFullYear()}`
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/lib/fechas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fechas.ts src/lib/fechas.test.ts
git commit -m "feat(analitica): helpers de mes calendario (rangoMes, nombreMes)"
```

---

### Task 2: Extraer `KpiTile` como componente compartido

**Files:**
- Create: `src/components/analitica/KpiTile.tsx`
- Modify: `src/components/analitica/KpisEquipo.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `KpiTile` (default export), props `{ titulo: string; valor: string; nota?: string }` — lo va a usar también la Task 5 (`KpisMensuales`).

`KpisEquipo.tsx` hoy define un `Kpi` local (líneas 9-17) que hace exactamente lo que necesita el bloque nuevo. Se extrae para no duplicarlo.

- [ ] **Step 1: Crear el componente compartido**

Crear `src/components/analitica/KpiTile.tsx`:

```typescript
interface KpiTileProps {
    titulo: string
    valor: string
    nota?: string
}

export default function KpiTile({ titulo, valor, nota }: KpiTileProps) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
            {nota && <p className="mt-0.5 text-xs text-amber-600">{nota}</p>}
        </div>
    )
}
```

- [ ] **Step 2: Usarlo desde `KpisEquipo.tsx`**

En `src/components/analitica/KpisEquipo.tsx`, reemplazar el contenido completo por:

```typescript
import KpiTile from './KpiTile'
import { formatNumero, formatPct } from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

interface KpisEquipoProps {
    promedios: IVendedorMetricas
    cantidadVendedores: number
}

export default function KpisEquipo({ promedios, cantidadVendedores }: KpisEquipoProps) {
    const enCurso =
        promedios.ciclosEnCurso > 0 ? `⊙ ${promedios.ciclosEnCurso} ciclos en curso` : undefined
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile titulo="Cobertura del plan" valor={formatPct(promedios.cobertura)} nota={enCurso} />
            <KpiTile titulo="Efectividad comercial" valor={formatPct(promedios.efectividadComercial)} />
            <KpiTile titulo="Visitas válidas (prom.)" valor={formatNumero(promedios.visitasValidas)} />
            <KpiTile titulo="Vendedores" valor={String(cantidadVendedores)} />
        </div>
    )
}
```

- [ ] **Step 3: Correr toda la suite y verificar que sigue en verde**

Run: `npm test`
Expected: PASS (no hay test dedicado a `KpisEquipo`, pero `AnaliticaPage.test.tsx` lo renderiza indirectamente).

- [ ] **Step 4: Commit**

```bash
git add src/components/analitica/KpiTile.tsx src/components/analitica/KpisEquipo.tsx
git commit -m "refactor(analitica): extraer KpiTile compartido desde KpisEquipo"
```

---

### Task 3: Formatters `formatPctEscalado` y `formatHoras`

**Files:**
- Modify: `src/lib/analiticaFormat.ts`
- Modify: `src/lib/analiticaFormat.test.ts`
- Modify: `src/components/analitica/TablaVendedores.tsx`

**Interfaces:**
- Consumes: `formatNumero` (ya existe en el mismo archivo).
- Produces: `formatPctEscalado(valor: number | null): string`, `formatHoras(minutos: number | null): string` — los va a usar la Task 6 (`TablaEfectividadOperativa`) y la Task 5 (`KpisMensuales`).

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/lib/analiticaFormat.test.ts` (y sumar `formatHoras`, `formatPctEscalado` al import de la línea 1-10):

```typescript
it('formatPctEscalado redondea un valor ya expresado en escala 0..100, nunca 0% por null', () => {
    expect(formatPctEscalado(null)).toBe('s/d')
    expect(formatPctEscalado(89.4)).toBe('89%')
    expect(formatPctEscalado(100)).toBe('100%')
    expect(formatPctEscalado(104)).toBe('104%')
})

it('formatHoras convierte minutos a horas con un decimal', () => {
    expect(formatHoras(null)).toBe('s/d')
    expect(formatHoras(1216)).toBe('20,3 hs')
    expect(formatHoras(60)).toBe('1 hs')
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/lib/analiticaFormat.test.ts`
Expected: FAIL — `formatPctEscalado`/`formatHoras` no están exportados.

- [ ] **Step 3: Implementar los formatters**

Agregar al final de `src/lib/analiticaFormat.ts`:

```typescript
/** efectividadOperativa ya viene en escala 0..100 (no 0..1 como el resto de los %
 *  de esta pantalla) — puede superar 100 cuando el vendedor supera la meta. */
export const formatPctEscalado = (valor: number | null): string =>
    valor === null ? 's/d' : `${Math.round(valor)}%`

export const formatHoras = (minutos: number | null): string =>
    minutos === null ? 's/d' : `${formatNumero(minutos / 60)} hs`
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/lib/analiticaFormat.test.ts`
Expected: PASS.

- [ ] **Step 5: Usar `formatPctEscalado` en `TablaVendedores.tsx`**

En `src/components/analitica/TablaVendedores.tsx`, agregar `formatPctEscalado` al import de `@/lib/analiticaFormat` (línea 4-9), y reemplazar la columna `efectividadOperativa` (líneas 41-46):

```typescript
    {
        clave: 'efectividadOperativa',
        titulo: 'Cumplimiento',
        render: v => formatPctEscalado(v.efectividadOperativa),
        comparar: true,
    },
```

- [ ] **Step 6: Correr toda la suite**

Run: `npm test`
Expected: PASS — `TablaVendedores.test.tsx` no depende del texto exacto de esta celda (no hay test que la busque por valor formateado), pero confirma que no rompió nada.

- [ ] **Step 7: Commit**

```bash
git add src/lib/analiticaFormat.ts src/lib/analiticaFormat.test.ts src/components/analitica/TablaVendedores.tsx
git commit -m "feat(analitica): formatters formatPctEscalado y formatHoras"
```

---

### Task 4: Componente `SelectorMes`

**Files:**
- Create: `src/components/analitica/SelectorMes.tsx`
- Test: `src/components/analitica/SelectorMes.test.tsx`

**Interfaces:**
- Consumes: `nombreMes` de `@/lib/fechas` (Task 1).
- Produces: `SelectorMes` (default export), props `{ mes: Date; onCambiarMes: (mes: Date) => void }` — lo consume la Task 7 (`EfectividadOperativaSection`).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/analitica/SelectorMes.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import SelectorMes from './SelectorMes'

it('muestra el nombre del mes recibido', () => {
    render(<SelectorMes mes={new Date(2026, 7, 18)} onCambiarMes={vi.fn()} />)
    expect(screen.getByText('Agosto 2026')).toBeInTheDocument()
})

it('retrocede un mes al hacer click en "Mes anterior"', async () => {
    const onCambiarMes = vi.fn()
    render(<SelectorMes mes={new Date(2026, 7, 18)} onCambiarMes={onCambiarMes} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(onCambiarMes).toHaveBeenCalledWith(new Date(2026, 6, 1))
})

it('avanza un mes al hacer click en "Mes siguiente"', async () => {
    const onCambiarMes = vi.fn()
    render(<SelectorMes mes={new Date(2026, 7, 18)} onCambiarMes={onCambiarMes} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(onCambiarMes).toHaveBeenCalledWith(new Date(2026, 8, 1))
})

it('cruza el fin de año correctamente', async () => {
    const onCambiarMes = vi.fn()
    render(<SelectorMes mes={new Date(2026, 11, 5)} onCambiarMes={onCambiarMes} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(onCambiarMes).toHaveBeenCalledWith(new Date(2027, 0, 1))
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/components/analitica/SelectorMes.test.tsx`
Expected: FAIL — `Failed to resolve import "./SelectorMes"`.

- [ ] **Step 3: Implementar el componente**

Crear `src/components/analitica/SelectorMes.tsx`:

```typescript
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { nombreMes } from '@/lib/fechas'

interface SelectorMesProps {
    mes: Date
    onCambiarMes: (mes: Date) => void
}

export default function SelectorMes({ mes, onCambiarMes }: SelectorMesProps) {
    const cambiar = (delta: number) => onCambiarMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1))
    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => cambiar(-1)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
            >
                <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[9rem] text-center text-sm font-medium text-slate-700">
                {nombreMes(mes)}
            </span>
            <button
                type="button"
                aria-label="Mes siguiente"
                onClick={() => cambiar(1)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
            >
                <ChevronRight className="h-4 w-4" />
            </button>
        </div>
    )
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/components/analitica/SelectorMes.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/analitica/SelectorMes.tsx src/components/analitica/SelectorMes.test.tsx
git commit -m "feat(analitica): componente SelectorMes"
```

---

### Task 5: Componente `KpisMensuales`

**Files:**
- Create: `src/components/analitica/KpisMensuales.tsx`
- Test: `src/components/analitica/KpisMensuales.test.tsx`

**Interfaces:**
- Consumes: `KpiTile` (Task 2), `formatPctEscalado`/`formatNumero`/`formatHoras` (Task 3, `formatNumero` ya existía).
- Produces: `KpisMensuales` (default export), prop `{ promedios: IVendedorMetricas }` — lo consume la Task 7.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/analitica/KpisMensuales.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import KpisMensuales from './KpisMensuales'
import { MOCK_RESUMEN } from '@/mocks/analiticaMock'

it('muestra los tres KPIs del equipo con sus valores', () => {
    render(<KpisMensuales promedios={MOCK_RESUMEN.promedios} />)
    expect(screen.getByText('Efectividad operativa')).toBeInTheDocument()
    expect(screen.getByText('Visitas (mensual)')).toBeInTheDocument()
    expect(screen.getByText('Horas (mensual)')).toBeInTheDocument()
})

it('muestra s/d cuando ningún vendedor tiene objetivo vigente, nunca 0%', () => {
    render(
        <KpisMensuales
            promedios={{ ...MOCK_RESUMEN.promedios, efectividadOperativa: null }}
        />,
    )
    expect(screen.getByText('s/d')).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/components/analitica/KpisMensuales.test.tsx`
Expected: FAIL — `Failed to resolve import "./KpisMensuales"`.

- [ ] **Step 3: Implementar el componente**

Crear `src/components/analitica/KpisMensuales.tsx`:

```typescript
import KpiTile from './KpiTile'
import { formatHoras, formatNumero, formatPctEscalado } from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

interface KpisMensualesProps {
    promedios: IVendedorMetricas
}

/** Los tres criterios acordados con gerencia para reemplazar al viejo dashboard de
 *  app-mobiliza: Efectividad operativa, Visitas y Horas, siempre en mes calendario
 *  completo. "Cobertura del plan" y "Efectividad comercial" quedan afuera por ahora
 *  — ver docs/superpowers/specs/2026-08-18-efectividad-operativa-kpi-design.md. */
export default function KpisMensuales({ promedios }: KpisMensualesProps) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiTile titulo="Efectividad operativa" valor={formatPctEscalado(promedios.efectividadOperativa)} />
            <KpiTile titulo="Visitas (mensual)" valor={formatNumero(promedios.visitasValidas)} />
            <KpiTile titulo="Horas (mensual)" valor={formatHoras(promedios.minutosTotales)} />
        </div>
    )
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/components/analitica/KpisMensuales.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/analitica/KpisMensuales.tsx src/components/analitica/KpisMensuales.test.tsx
git commit -m "feat(analitica): componente KpisMensuales (equipo)"
```

---

### Task 6: Componente `TablaEfectividadOperativa`

**Files:**
- Create: `src/components/analitica/TablaEfectividadOperativa.tsx`
- Test: `src/components/analitica/TablaEfectividadOperativa.test.tsx`

**Interfaces:**
- Consumes: `formatPctEscalado`/`formatNumero`/`formatHoras` (Task 3).
- Produces: `TablaEfectividadOperativa` (default export), props `{ vendedores: IVendedorMetricas[]; promedios: IVendedorMetricas }` — lo consume la Task 7.

Sin semáforo relativo ni orden por columna: el spec no lo pide para este bloque (eso es propio de `TablaVendedores`, que sigue existiendo tal cual).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/analitica/TablaEfectividadOperativa.test.tsx`:

```typescript
import { render, screen, within } from '@testing-library/react'
import TablaEfectividadOperativa from './TablaEfectividadOperativa'
import { MOCK_RESUMEN } from '@/mocks/analiticaMock'

const props = {
    vendedores: MOCK_RESUMEN.vendedores,
    promedios: MOCK_RESUMEN.promedios,
}

it('muestra una fila por vendedor más la de promedios', () => {
    render(<TablaEfectividadOperativa {...props} />)
    const filas = screen.getAllByRole('row')
    // encabezado + promedios + vendedores
    expect(filas).toHaveLength(MOCK_RESUMEN.vendedores.length + 2)
})

it('muestra las tres columnas acordadas, nada de cobertura ni efectividad comercial', () => {
    render(<TablaEfectividadOperativa {...props} />)
    expect(screen.getByRole('columnheader', { name: 'Efectividad operativa' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Visitas (mensual)' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Horas (mensual)' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /cobertura/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /efectividad comercial/i })).not.toBeInTheDocument()
})

it('muestra s/d, nunca 0%, cuando el vendedor no tiene objetivo vigente', () => {
    render(<TablaEfectividadOperativa {...props} />)
    const fila = screen.getByRole('row', { name: /HERRERA NATALIA/ })
    expect(within(fila).getByText('s/d')).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/components/analitica/TablaEfectividadOperativa.test.tsx`
Expected: FAIL — `Failed to resolve import "./TablaEfectividadOperativa"`.

- [ ] **Step 3: Implementar el componente**

Crear `src/components/analitica/TablaEfectividadOperativa.tsx`:

```typescript
import { formatHoras, formatNumero, formatPctEscalado } from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

interface TablaEfectividadOperativaProps {
    vendedores: IVendedorMetricas[]
    promedios: IVendedorMetricas
}

/** Las tres columnas acordadas con gerencia — ver
 *  docs/superpowers/specs/2026-08-18-efectividad-operativa-kpi-design.md. Sin
 *  semáforo ni orden por columna: eso es propio de TablaVendedores. */
export default function TablaEfectividadOperativa({
    vendedores,
    promedios,
}: TablaEfectividadOperativaProps) {
    const renderFila = (v: IVendedorMetricas, esPromedio: boolean) => (
        <tr
            key={esPromedio ? 'promedios' : v.codigoParticularVendedor}
            className={esPromedio ? 'bg-slate-100 font-semibold text-slate-900' : 'border-b border-slate-100'}
        >
            <td className="px-3 py-2 text-left">{v.nombreVendedor}</td>
            <td className="px-3 py-2 text-right">{formatPctEscalado(v.efectividadOperativa)}</td>
            <td className="px-3 py-2 text-right">{formatNumero(v.visitasValidas)}</td>
            <td className="px-3 py-2 text-right">{formatHoras(v.minutosTotales)}</td>
        </tr>
    )

    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-3 py-2 text-left">Vendedor</th>
                        <th className="px-3 py-2 text-right">Efectividad operativa</th>
                        <th className="px-3 py-2 text-right">Visitas (mensual)</th>
                        <th className="px-3 py-2 text-right">Horas (mensual)</th>
                    </tr>
                </thead>
                <tbody>
                    {renderFila(promedios, true)}
                    {vendedores.map(v => renderFila(v, false))}
                </tbody>
            </table>
        </div>
    )
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/components/analitica/TablaEfectividadOperativa.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/analitica/TablaEfectividadOperativa.tsx src/components/analitica/TablaEfectividadOperativa.test.tsx
git commit -m "feat(analitica): componente TablaEfectividadOperativa"
```

---

### Task 7: Contenedor `EfectividadOperativaSection`

**Files:**
- Create: `src/components/analitica/EfectividadOperativaSection.tsx`
- Test: `src/components/analitica/EfectividadOperativaSection.test.tsx`

**Interfaces:**
- Consumes: `SelectorMes` (Task 4), `KpisMensuales` (Task 5), `TablaEfectividadOperativa` (Task 6), `rangoMes` (Task 1), `useResumen` (ya existe en `@/hooks/useAnalitica`).
- Produces: `EfectividadOperativaSection` (default export, sin props) — lo consume la Task 8 (`AnaliticaPage`).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/analitica/EfectividadOperativaSection.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import EfectividadOperativaSection from './EfectividadOperativaSection'
import { MOCK_RESUMEN } from '@/mocks/analiticaMock'
import * as api from '@/api/analitica'

vi.mock('@/api/analitica')

function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <EfectividadOperativaSection />
        </QueryClientProvider>,
    )
}

beforeEach(() => vi.clearAllMocks())

it('pide el resumen del mes en curso y muestra la tabla', async () => {
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    const hoy = new Date()
    const filtroEsperado = expect.objectContaining({
        desde: expect.stringMatching(/^\d{4}-\d{2}-01$/),
    })
    expect(api.getResumen).toHaveBeenCalledWith(filtroEsperado)
    // el filtro pedido tiene que ser del mes en curso, no del mes calendario anterior o siguiente.
    const filtroReal = (api.getResumen as any).mock.calls[0][0]
    expect(filtroReal.desde.slice(0, 7)).toBe(
        `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`,
    )
})

it('sin datos en el mes muestra un vacío explícito', async () => {
    ;(api.getResumen as any).mockResolvedValue({
        desde: '2020-01-01',
        hasta: '2020-01-31',
        diasHabiles: 0,
        promedios: { ...MOCK_RESUMEN.promedios, efectividadOperativa: null },
        vendedores: [],
    })
    montar()
    await waitFor(() => expect(screen.getByText(/sin datos para este mes/i)).toBeInTheDocument())
})

it('cambiar de mes pide un nuevo resumen con el rango del mes elegido', async () => {
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    const llamadasAntes = (api.getResumen as any).mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    await waitFor(() =>
        expect((api.getResumen as any).mock.calls.length).toBeGreaterThan(llamadasAntes),
    )
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/components/analitica/EfectividadOperativaSection.test.tsx`
Expected: FAIL — `Failed to resolve import "./EfectividadOperativaSection"`.

- [ ] **Step 3: Implementar el componente**

Crear `src/components/analitica/EfectividadOperativaSection.tsx`:

```typescript
import { useState } from 'react'
import KpisMensuales from './KpisMensuales'
import SelectorMes from './SelectorMes'
import TablaEfectividadOperativa from './TablaEfectividadOperativa'
import { useResumen } from '@/hooks/useAnalitica'
import { rangoMes } from '@/lib/fechas'

/** Bloque de KPIs de actividad mensual (Efectividad operativa, Visitas, Horas).
 *  Tiene su propio selector de mes, independiente del filtro desde/hasta del resto
 *  de /analitica — ver docs/superpowers/specs/2026-08-18-efectividad-operativa-kpi-design.md. */
export default function EfectividadOperativaSection() {
    const [mes, setMes] = useState(() => new Date())
    const filtro = rangoMes(mes)
    const { data, isLoading, isError } = useResumen(filtro)

    return (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Efectividad operativa</h2>
                <SelectorMes mes={mes} onCambiarMes={setMes} />
            </div>

            {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

            {isError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    No se pudo cargar la efectividad operativa. Probá de nuevo en un momento.
                </p>
            )}

            {data && data.vendedores.length === 0 && (
                <p className="text-sm text-slate-500">Sin datos para este mes.</p>
            )}

            {data && data.vendedores.length > 0 && (
                <>
                    <KpisMensuales promedios={data.promedios} />
                    <TablaEfectividadOperativa vendedores={data.vendedores} promedios={data.promedios} />
                </>
            )}
        </section>
    )
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/components/analitica/EfectividadOperativaSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/analitica/EfectividadOperativaSection.tsx src/components/analitica/EfectividadOperativaSection.test.tsx
git commit -m "feat(analitica): contenedor EfectividadOperativaSection con selector de mes propio"
```

---

### Task 8: Montar el bloque en `/analitica`

**Files:**
- Modify: `src/pages/AnaliticaPage.tsx`
- Modify: `src/pages/AnaliticaPage.test.tsx`

**Interfaces:**
- Consumes: `EfectividadOperativaSection` (Task 7).
- Produces: nada nuevo — es el punto de montaje final.

`AnaliticaPage.test.tsx` hoy mockea `api.getResumen` con un único `mockResolvedValue` que aplica a **todas** las llamadas. Como esta página va a llamar a `getResumen` dos veces con filtros distintos (el de la página y el del mes en curso), hay que hacer el mock sensible al filtro recibido — si no, "ACOSTA MARIANO" aparece dos veces en pantalla y `getByText` revienta por ambigüedad.

- [ ] **Step 1: Actualizar `AnaliticaPage.test.tsx` para que el mock dependa del filtro**

Reemplazar el `beforeEach` (líneas 26-30) y agregar un helper, en `src/pages/AnaliticaPage.test.tsx`:

```typescript
import type { IAnaliticaFiltro, IAnaliticaResumen } from '@/types/analitica'

// ...

/** El resumen "completo" (con MOCK_RESUMEN.vendedores) solo se devuelve para el
 *  filtro de la página bajo prueba. Cualquier otro filtro —el que arma
 *  EfectividadOperativaSection con el mes en curso, que no se puede predecir en un
 *  test— recibe un resumen vacío. Así ningún nombre de vendedor queda duplicado en
 *  pantalla y los `getByText` existentes no se rompen. */
function mockResumenSoloParaFiltroPrincipal(
    resultado: IAnaliticaResumen,
    desde = '2026-07-20',
    hasta = '2026-07-24',
) {
    ;(api.getResumen as any).mockImplementation((filtro: IAnaliticaFiltro) =>
        Promise.resolve(
            filtro.desde === desde && filtro.hasta === hasta
                ? resultado
                : { desde: filtro.desde, hasta: filtro.hasta, diasHabiles: 0, promedios: MOCK_RESUMEN.promedios, vendedores: [] },
        ),
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getObjeciones as any).mockResolvedValue({ total: 0, motivos: [] })
    ;(api.getVendedores as any).mockResolvedValue(MOCK_VENDEDORES)
})
```

- [ ] **Step 2: Actualizar cada test que dependía del mock global**

En el mismo archivo, reemplazar:

```typescript
it('muestra la tabla con los vendedores del resumen', async () => {
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
    montar()
```

por:

```typescript
it('muestra la tabla con los vendedores del resumen', async () => {
    mockResumenSoloParaFiltroPrincipal(MOCK_RESUMEN)
    montar()
```

Y reemplazar:

```typescript
it('el dropdown muestra el roster completo, incluido un vendedor sin actividad', async () => {
    ;(api.getResumen as any).mockResolvedValue({
        ...MOCK_RESUMEN,
        vendedores: MOCK_RESUMEN.vendedores.filter(v => v.codigoParticularVendedor === 'V1'),
    })
    montar('/analitica?desde=2026-07-20&hasta=2026-07-24&vendedores=V1')
```

por:

```typescript
it('el dropdown muestra el roster completo, incluido un vendedor sin actividad', async () => {
    mockResumenSoloParaFiltroPrincipal({
        ...MOCK_RESUMEN,
        vendedores: MOCK_RESUMEN.vendedores.filter(v => v.codigoParticularVendedor === 'V1'),
    })
    montar('/analitica?desde=2026-07-20&hasta=2026-07-24&vendedores=V1')
```

Los otros dos tests existentes (`'sin ciclos en el rango...'` y `'muestra el error si el resumen falla'`) usan `mockResolvedValue`/`mockRejectedValue` con un único resultado para todas las llamadas — eso sigue funcionando igual (vacío o error en ambos bloques a la vez) y **no hace falta tocarlos**.

- [ ] **Step 3: Agregar el test de la sección nueva**

Agregar al final de `src/pages/AnaliticaPage.test.tsx`:

```typescript
it('muestra la sección de efectividad operativa con su propio selector de mes', async () => {
    mockResumenSoloParaFiltroPrincipal(MOCK_RESUMEN)
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Efectividad operativa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeInTheDocument()
})
```

- [ ] **Step 4: Correr el test para verificar que falla**

Run: `npm test -- src/pages/AnaliticaPage.test.tsx`
Expected: FAIL — no existe el heading "Efectividad operativa" todavía en la página.

- [ ] **Step 5: Montar el componente en la página**

En `src/pages/AnaliticaPage.tsx`, agregar el import junto a los demás componentes de `@/components/analitica` (línea 2-6):

```typescript
import EfectividadOperativaSection from '@/components/analitica/EfectividadOperativaSection'
```

Y agregarlo como primer hijo de `<main>` (antes de los estados de carga/error de la tabla de rango libre, línea 46-47):

```typescript
            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                <EfectividadOperativaSection />

                {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
```

- [ ] **Step 6: Correr toda la suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/AnaliticaPage.tsx src/pages/AnaliticaPage.test.tsx
git commit -m "feat(analitica): montar EfectividadOperativaSection en /analitica"
```

---

## Nota sobre el backend (corregida)

Este plan **no toca `api-vendedores`**. A diferencia de lo que se pensaba al escribir la primera
versión de este plan, **el cálculo real ya existe y está mergeado en `master`** de ese repo
(`GET /planificacion/analitica/resumen`, con metas configurables vía `pl_objetivo`) — no hace falta
construirlo. El único gap real es que ese endpoint no expone `minutosTotales` en la respuesta (lo
calcula pero lo descarta antes de responder). Ese trabajo, chico y aditivo, está anotado en el
worktree `efectividad-operativa-kpi` de `api-vendedores`. Recién cuando esté resuelto tiene sentido
apagar `VITE_ANALITICA_MOCK` en esta app. Ver
`docs/superpowers/specs/2026-08-18-efectividad-operativa-kpi-design.md`.
