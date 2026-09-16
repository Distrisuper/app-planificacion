# Descuentos por marca en la visita — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrarle al vendedor el % de descuento por marca del cliente, pegado a la marca dentro del rubro que está ofreciendo, y entero en un sheet de consulta.

**Architecture:** Cien por ciento front. El dato ya viaja en `IVisitClientCard.brandDiscounts` (viene de `fct_clients.brand_discounts` en el GET de la agenda) y hoy se descarta. Un módulo puro `src/lib/descuentosMarca.ts` concentra toda la derivación —incluida la regla del cliente suscriptor— y **enriquece `rubroStatus` antes** de que `filas.ts` construya las filas. Así `filas.ts` y los cuatro niveles de componentes de la tabla no se enteran: `SubFilasMarcas` lee un campo más en la marca que ya recibe.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind, Vitest + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-09-16-descuentos-por-marca-en-la-visita-design.md`](../specs/2026-09-16-descuentos-por-marca-en-la-visita-design.md)

**Base:** `master` @ `b71afb1`

## Global Constraints

- **Cero cambios en `api-vendedores`.** Ningún endpoint nuevo, ninguna request nueva. Si una tarea parece necesitar backend, está mal leída.
- **Cliente suscriptor = `bonusDiscount === 45 || bonusDiscount === 49`.** NO usar `generalDiscount` (vale 0 para todos: el ETL lee una clave JSON que nadie emite — spec §3.2).
- **La regla del suscriptor se aplica en UN solo lugar**, dentro de `descuentosPorCodigo`. Ningún componente hace `if (esSuscriptor)` para decidir si muestra descuentos.
- **Un cliente no puede tener dos descuentos para la misma marca.** La PK en MySQL es `(client_code, brand_code)`. El descuento es un número escalar, no una lista ni un rango (spec §2.2).
- **Color: `violet-*` de la paleta default de Tailwind** (`violet-50` / `violet-200` / `violet-700`). NO agregar un token a `tailwind.config.js` — el config usa `theme.extend`, así que la paleta default sigue disponible, y es el mismo violeta que ya usa `DiscountBadge` en app-vendedores. NO usar `dsgreen` ni `dsorange`: en la tabla de rubros ya significan "rubro completo" y "a medio cargar".
- **Ningún `M.Ant` ni columna numérica se toca.** El badge vive dentro del `flex-1` del nombre.
- Tests: `npx vitest run <ruta>`. Lint: `npm run lint`. Typecheck: `npx tsc -b --noEmit`.
- Comentarios y textos de UI en castellano rioplatense, como el resto del repo.

---

### Task 1: El módulo de derivación

Todo el conocimiento del dominio del descuento, sin React, testeable solo.

**Files:**
- Create: `src/lib/descuentosMarca.ts`
- Test: `src/lib/descuentosMarca.test.ts`

**Interfaces:**
- Consumes: `IVisitClientCard`, `IBrandDiscount` de `@/types/planificacion` (ya existen, `src/types/planificacion.ts:53-88`).
- Produces:
  - `esSuscriptor(cliente: Pick<IVisitClientCard, 'bonusDiscount'> | null | undefined): boolean`
  - `descuentosPorCodigo(cliente: IVisitClientCard | null | undefined): Map<string, number>`
  - `nombreDescuento(description: string): string`
  - `listaDescuentos(cliente): { code: string; nombre: string; valor: number }[]`
  - `type IDescuentoMarca = { code: string; nombre: string; valor: number }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/descuentosMarca.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
    esSuscriptor,
    descuentosPorCodigo,
    nombreDescuento,
    listaDescuentos,
} from './descuentosMarca'
import type { IVisitClientCard } from '@/types/planificacion'

function cliente(over: Partial<IVisitClientCard> = {}): IVisitClientCard {
    return {
        codigoCliente: '10034',
        codigoParticularCliente: '10034-1',
        nombreCliente: 'DERQUI AUTOPARTES SRL',
        bonusDiscount: 0,
        brandDiscounts: [
            { code: '141', value: 15, description: 'COBREQ # LIQUIDOS FRENO #' },
            { code: '039', value: 23, description: 'AG # RESORTES #' },
        ],
        ...over,
    }
}

describe('esSuscriptor', () => {
    it('45 y 49 son suscriptor', () => {
        expect(esSuscriptor(cliente({ bonusDiscount: 45 }))).toBe(true)
        expect(esSuscriptor(cliente({ bonusDiscount: 49 }))).toBe(true)
    })

    // 44 y 46 a propósito: descarta una implementación con >= o un rango.
    it('cualquier otro valor no lo es', () => {
        for (const v of [0, 8, 44, 46, 50]) {
            expect(esSuscriptor(cliente({ bonusDiscount: v }))).toBe(false)
        }
    })

    it('sin dato no es suscriptor', () => {
        expect(esSuscriptor(cliente({ bonusDiscount: null }))).toBe(false)
        expect(esSuscriptor(cliente({ bonusDiscount: undefined }))).toBe(false)
        expect(esSuscriptor(null)).toBe(false)
        expect(esSuscriptor(undefined)).toBe(false)
    })
})

describe('descuentosPorCodigo', () => {
    it('indexa por código de marca', () => {
        const m = descuentosPorCodigo(cliente())
        expect(m.get('141')).toBe(15)
        expect(m.get('039')).toBe(23)
        expect(m.size).toBe(2)
    })

    // La razón de toda la feature: el 45% ya es global y el descuento por marca NO se
    // acumula (priceUtils.js de Lupa lo neutraliza). Mostrarlo sería prometer algo que
    // la factura no aplica.
    it('el suscriptor no tiene descuentos por marca aunque el JSONB los traiga', () => {
        expect(descuentosPorCodigo(cliente({ bonusDiscount: 45 })).size).toBe(0)
        expect(descuentosPorCodigo(cliente({ bonusDiscount: 49 })).size).toBe(0)
    })

    // `(elem->>'value')::numeric` vuelve como string si pg no tiene parser para numeric.
    it('acepta el value como string', () => {
        const m = descuentosPorCodigo(
            cliente({ brandDiscounts: [{ code: '141', value: '15' as unknown as number, description: 'COBREQ' }] }),
        )
        expect(m.get('141')).toBe(15)
    })

    it('descarta valores no numéricos, cero y negativos', () => {
        const m = descuentosPorCodigo(
            cliente({
                brandDiscounts: [
                    { code: 'A', value: 'abc' as unknown as number, description: 'A' },
                    { code: 'B', value: 0, description: 'B' },
                    { code: 'C', value: -5, description: 'C' },
                    { code: 'D', value: 12, description: 'D' },
                ],
            }),
        )
        expect(m.has('A')).toBe(false)
        expect(m.has('B')).toBe(false)
        expect(m.has('C')).toBe(false)
        expect(m.get('D')).toBe(12)
    })

    // El enricher de api-vendedores trimea el brand_code; el JSONB puede traer espacios.
    it('trimea el código', () => {
        const m = descuentosPorCodigo(
            cliente({ brandDiscounts: [{ code: ' 141 ', value: 15, description: 'COBREQ' }] }),
        )
        expect(m.get('141')).toBe(15)
    })

    it('sin cliente o sin brandDiscounts devuelve un Map vacío', () => {
        expect(descuentosPorCodigo(null).size).toBe(0)
        expect(descuentosPorCodigo(cliente({ brandDiscounts: undefined })).size).toBe(0)
        expect(descuentosPorCodigo(cliente({ brandDiscounts: [] })).size).toBe(0)
    })
})

describe('nombreDescuento', () => {
    it('limpia los # y une con ·', () => {
        expect(nombreDescuento('COBREQ # LIQUIDOS FRENO #')).toBe('COBREQ · LIQUIDOS FRENO')
    })

    it('sin # lo devuelve tal cual', () => {
        expect(nombreDescuento('COBREQ')).toBe('COBREQ')
    })

    it('con # desbalanceado no rompe ni deja separadores colgando', () => {
        expect(nombreDescuento('COBREQ # LIQUIDOS FRENO')).toBe('COBREQ · LIQUIDOS FRENO')
        expect(nombreDescuento('COBREQ ##')).toBe('COBREQ')
    })

    it('string vacío devuelve string vacío', () => {
        expect(nombreDescuento('')).toBe('')
    })
})

describe('listaDescuentos', () => {
    it('ordena por valor descendente y limpia el nombre', () => {
        expect(listaDescuentos(cliente())).toEqual([
            { code: '039', nombre: 'AG · RESORTES', valor: 23 },
            { code: '141', nombre: 'COBREQ · LIQUIDOS FRENO', valor: 15 },
        ])
    })

    it('el suscriptor devuelve lista vacía', () => {
        expect(listaDescuentos(cliente({ bonusDiscount: 45 }))).toEqual([])
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/descuentosMarca.test.ts`
Expected: FAIL — `Failed to resolve import "./descuentosMarca"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/descuentosMarca.ts`:

```ts
import type { IVisitClientCard } from '@/types/planificacion'

/** Los dos valores de `bonificacion` que marcan a un cliente suscriptor. Salen de
 *  `MapaCalorService.js:362` de api-node-lupa, el único lugar del ecosistema que se
 *  acordó del 49 — el resto del código habla solo del 45. */
const BONIFICACIONES_SUSCRIPTOR = [45, 49]

export interface IDescuentoMarca {
    code: string
    nombre: string
    valor: number
}

/**
 * Cliente con acuerdo de suscripción: 45% (o 49%) de bonificación global a cambio de un
 * fee mensual que se le factura bajo la marca `120`.
 *
 * Importa porque **el descuento por marca NO se acumula con esa bonificación**: el motor
 * de precios de Lupa lo neutraliza (`priceUtils.js:52`, factor 1). Mostrarle un descuento
 * por marca a un suscriptor es prometerle algo que la factura no le va a aplicar.
 *
 * Se mira `bonusDiscount` y NO `generalDiscount`, aunque api-vendedores filtre por ese
 * otro: `general_discount` vale 0 para TODOS los clientes, porque el modelo dbt lee
 * `discounts->>'byGeneral'` y client-service nunca emite esa clave. Ver §3.2 del spec.
 */
export function esSuscriptor(
    cliente: Pick<IVisitClientCard, 'bonusDiscount'> | null | undefined,
): boolean {
    const bonificacion = cliente?.bonusDiscount
    if (bonificacion == null) return false
    return BONIFICACIONES_SUSCRIPTOR.includes(Number(bonificacion))
}

/** `(elem->>'value')::numeric` puede volver como string si pg no tiene parser para
 *  numeric. Un descuento de 0 o negativo no es un descuento: se descarta acá y no en
 *  cada pantalla. */
function valorValido(value: unknown): number | null {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * `brand_code` → % de descuento. **Vacío si el cliente es suscriptor**: esa es la única
 * puerta por la que se aplica la regla, así que ninguna pantalla necesita conocerla.
 *
 * El valor es un escalar y no una lista: la PK de `client_brand_discount` en MySQL es
 * `(client_code, brand_code)`, así que un cliente no puede tener dos descuentos para la
 * misma marca. El `# LIQUIDOS FRENO #` del `description` es parte del NOMBRE de la
 * entrada, no una segunda dimensión.
 */
export function descuentosPorCodigo(
    cliente: IVisitClientCard | null | undefined,
): Map<string, number> {
    const mapa = new Map<string, number>()
    if (!cliente || esSuscriptor(cliente)) return mapa

    for (const d of cliente.brandDiscounts ?? []) {
        const valor = valorValido(d.value)
        const code = d.code?.trim()
        if (valor === null || !code) continue
        mapa.set(code, valor)
    }
    return mapa
}

/** `'COBREQ # LIQUIDOS FRENO #'` → `'COBREQ · LIQUIDOS FRENO'`. Administración envuelve
 *  la línea entre `#`; el texto llega crudo desde el JSONB. app-vendedores lo muestra sin
 *  limpiar y se lee mal. */
export function nombreDescuento(description: string): string {
    return (description ?? '')
        .split('#')
        .map(parte => parte.trim())
        .filter(Boolean)
        .join(' · ')
}

/** La ficha completa, para el sheet de consulta. Ordenada por % descendente: es el orden
 *  con el que el vendedor busca con qué empujar. */
export function listaDescuentos(
    cliente: IVisitClientCard | null | undefined,
): IDescuentoMarca[] {
    if (!cliente || esSuscriptor(cliente)) return []

    return (cliente.brandDiscounts ?? [])
        .map(d => {
            const valor = valorValido(d.value)
            const code = d.code?.trim()
            if (valor === null || !code) return null
            return { code, nombre: nombreDescuento(d.description), valor }
        })
        .filter((d): d is IDescuentoMarca => d !== null)
        .sort((a, b) => b.valor - a.valor)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/descuentosMarca.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/descuentosMarca.ts src/lib/descuentosMarca.test.ts
git commit -m "feat(descuentos): derivación de descuentos por marca y regla del suscriptor

El dato ya viaja en IVisitClientCard.brandDiscounts y hoy se descarta. Un
módulo puro concentra la derivación; la regla del suscriptor (bonusDiscount
∈ {45,49} ⇒ sin descuentos por marca, porque el 45% global no se acumula)
vive en un solo lugar: el Map vacío.

Spec: docs/superpowers/specs/2026-09-16-descuentos-por-marca-en-la-visita-design.md

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Enriquecer `rubroStatus` con el descuento

El descuento viaja pegado a la marca, dentro de la estructura que `filas.ts` ya propaga. **`filas.ts` no se modifica**: sus builders hacen `marcas: s?.marcas ?? []`, o sea pass-through.

**Files:**
- Modify: `src/types/planificacion.ts` (agregar `descuento?: number` a `IMarcaEstado`, que hoy termina en la línea 325)
- Modify: `src/lib/descuentosMarca.ts` (agregar `conDescuentos`)
- Test: `src/lib/descuentosMarca.test.ts` (agregar un `describe`)

**Interfaces:**
- Consumes: `descuentosPorCodigo` (Task 1); `IRubroEstado` / `IMarcaEstado` de `@/types/planificacion`.
- Produces: `conDescuentos(rubroStatus: IRubroEstado[], cliente: IVisitClientCard | null | undefined): IRubroEstado[]`, y el campo `IMarcaEstado.descuento?: number`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/descuentosMarca.test.ts`:

```ts
import { conDescuentos } from './descuentosMarca'
import type { IRubroEstado } from '@/types/planificacion'

function rubro(over: Partial<IRubroEstado> = {}): IRubroEstado {
    return {
        rubroCode: 'SR-14',
        nombre: 'PARRILLAS',
        actual: 120_000,
        mesAnterior: 98_000,
        promedio6m: 140_000,
        marcas: [
            { code: '141', nombre: 'COBREQ', actual: 80_000, mesAnterior: 70_000, promedio6m: 95_000, dejo: false },
            { code: '999', nombre: 'FERODO', actual: 40_000, mesAnterior: 28_000, promedio6m: 45_000, dejo: false },
        ],
        ...over,
    }
}

describe('conDescuentos', () => {
    it('pega el descuento a la marca que lo tiene y deja la otra sin campo', () => {
        const [r] = conDescuentos([rubro()], cliente())
        expect(r.marcas[0].descuento).toBe(15)
        expect(r.marcas[1].descuento).toBeUndefined()
    })

    it('no toca el resto de la marca ni del rubro', () => {
        const [r] = conDescuentos([rubro()], cliente())
        expect(r.rubroCode).toBe('SR-14')
        expect(r.marcas[0].nombre).toBe('COBREQ')
        expect(r.marcas[0].actual).toBe(80_000)
        expect(r.marcas).toHaveLength(2)
    })

    it('el suscriptor no recibe ningún descuento', () => {
        const [r] = conDescuentos([rubro()], cliente({ bonusDiscount: 45 }))
        expect(r.marcas.every(m => m.descuento === undefined)).toBe(true)
    })

    it('sin cliente devuelve el mismo array, sin recorrerlo', () => {
        const entrada = [rubro()]
        expect(conDescuentos(entrada, null)).toBe(entrada)
    })

    // Las filas del catálogo (spec de "otros rubros 80/20") llegan con marcas: [].
    it('un rubro sin marcas no rompe', () => {
        const [r] = conDescuentos([rubro({ marcas: [] })], cliente())
        expect(r.marcas).toEqual([])
    })

    it('no muta la entrada', () => {
        const entrada = [rubro()]
        conDescuentos(entrada, cliente())
        expect(entrada[0].marcas[0].descuento).toBeUndefined()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/descuentosMarca.test.ts`
Expected: FAIL — `conDescuentos is not a function` (y errores de tipo sobre `descuento`).

- [ ] **Step 3: Write minimal implementation**

En `src/types/planificacion.ts`, dentro de `IMarcaEstado`, justo antes del `dejo: boolean` de cierre:

```ts
    /** % de descuento que este cliente tiene para esta marca. `undefined` = no tiene, o
     *  es suscriptor (el 45% global no se acumula). NO viene del endpoint: lo pega
     *  `conDescuentos` desde `cliente.brandDiscounts` antes de construir las filas. */
    descuento?: number
    dejo: boolean
```

En `src/lib/descuentosMarca.ts`, sumar `IRubroEstado` al import de tipos **que ya está en
la primera línea** (no agregar un segundo `import type` al final del archivo):

```ts
import type { IRubroEstado, IVisitClientCard } from '@/types/planificacion'
```

y agregar la función al final:

```ts
/**
 * Pega el descuento del cliente a cada marca de `rubroStatus`, **antes** de que
 * `filas.ts` construya las filas.
 *
 * Es acá y no en un prop de `OfrecimientoTable` porque el descuento tendría que bajar
 * cuatro niveles (`OfrecimientoTable` → `SegmentoOfrecimientos`/tabla → `FilaOfrecimiento`
 * → `SubFilasMarcas`) atravesando tres componentes a los que no les importa. Viajando
 * dentro de la marca aprovecha el pass-through que los builders ya hacen
 * (`marcas: s?.marcas ?? []`), y `filas.ts` no se toca.
 */
export function conDescuentos(
    rubroStatus: IRubroEstado[],
    cliente: IVisitClientCard | null | undefined,
): IRubroEstado[] {
    const descuentos = descuentosPorCodigo(cliente)
    // Identidad referencial cuando no hay nada que pegar: `useMemo` en el llamador no
    // recalcula, y las filas no se reconstruyen por gusto.
    if (descuentos.size === 0) return rubroStatus

    return rubroStatus.map(r => ({
        ...r,
        marcas: r.marcas.map(m => {
            const descuento = descuentos.get(m.code?.trim())
            return descuento === undefined ? m : { ...m, descuento }
        }),
    }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/descuentosMarca.test.ts`
Expected: PASS — 21 tests.

Run: `npx tsc -b --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/types/planificacion.ts src/lib/descuentosMarca.ts src/lib/descuentosMarca.test.ts
git commit -m "feat(descuentos): conDescuentos enriquece rubroStatus antes de construir filas

El descuento viaja dentro de la marca en lugar de bajar cuatro niveles de
props por componentes a los que no les importa. filas.ts no se modifica:
sus builders ya hacen pass-through de \`marcas\`.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: El badge en la sub-fila de marca

**Files:**
- Modify: `src/components/propuesta/OfrecimientoTable.tsx` (dentro de `SubFilasMarcas`, el `<div className="flex min-w-0 flex-1 items-center gap-1.5">` de la línea ~330)
- Modify: `src/components/PropuestaSheet.tsx:75` y `src/components/VisitaSheet.tsx:450` (envolver `rubroStatus`)
- Test: `src/components/propuesta/OfrecimientoTable.test.tsx`

**Interfaces:**
- Consumes: `conDescuentos` (Task 2), `IMarcaEstado.descuento` (Task 2).
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Write the failing test**

Append to `src/components/propuesta/OfrecimientoTable.test.tsx`:

```ts
import type { IMarcaEstado } from '@/types/planificacion'

function marca(over: Partial<IMarcaEstado> = {}): IMarcaEstado {
    return {
        code: '141',
        nombre: 'COBREQ',
        actual: 80_000,
        mesAnterior: 70_000,
        promedio6m: 95_000,
        actualUnidades: 80,
        mesAnteriorUnidades: 70,
        promedio6mUnidades: 95,
        dejo: false,
        ...over,
    }
}

/** Despliega las marcas de la primera fila: el gesto es tocar la zona de números. */
function desplegarMarcas() {
    fireEvent.click(screen.getByText('600'))
}

it('la marca con descuento muestra su %', () => {
    render(<OfrecimientoTable filas={[fila({ marcas: [marca({ descuento: 15 })] })]} />)
    desplegarMarcas()
    expect(screen.getByText('15%')).toBeInTheDocument()
})

it('la marca sin descuento no dibuja badge', () => {
    render(<OfrecimientoTable filas={[fila({ marcas: [marca()] })]} />)
    desplegarMarcas()
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
})

it('convive con otra marca sin descuento en el mismo rubro', () => {
    render(
        <OfrecimientoTable
            filas={[fila({ marcas: [marca({ descuento: 15 }), marca({ code: '999', nombre: 'FERODO' })] })]}
        />,
    )
    desplegarMarcas()
    expect(screen.getByText('15%')).toBeInTheDocument()
    expect(screen.getByText('FERODO')).toBeInTheDocument()
})

// El badge no puede empujar ni esconder ninguna de las tres columnas: vive dentro del
// flex-1 del nombre.
it('el badge no altera las tres celdas numéricas de la marca', () => {
    render(<OfrecimientoTable filas={[fila({ marcas: [marca({ descuento: 15 })] })]} />)
    desplegarMarcas()
    const subfila = screen.getByText('COBREQ').closest('[data-marca]') as HTMLElement
    expect(subfila).toBeTruthy()
    expect(within(subfila).getByText('80')).toBeInTheDocument()
    expect(within(subfila).getByText('70')).toBeInTheDocument()
    expect(within(subfila).getByText('95')).toBeInTheDocument()
})

it('el badge no es un control: no hay botón dentro de la sub-fila', () => {
    render(<OfrecimientoTable filas={[fila({ marcas: [marca({ descuento: 15 })] })]} />)
    desplegarMarcas()
    const subfila = screen.getByText('COBREQ').closest('[data-marca]') as HTMLElement
    expect(within(subfila).queryByRole('button')).not.toBeInTheDocument()
})
```

Agregar `within` al import de `@testing-library/react` en la primera línea del archivo:

```ts
import { render, screen, fireEvent, within } from '@testing-library/react'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/propuesta/OfrecimientoTable.test.tsx`
Expected: FAIL — `Unable to find an element with the text: 15%`.

- [ ] **Step 3: Write minimal implementation**

En `src/components/propuesta/OfrecimientoTable.tsx`, dentro de `SubFilasMarcas`, reemplazar:

```tsx
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="min-w-0 truncate">{m.nombre}</span>
                        </div>
```

por:

```tsx
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="min-w-0 truncate">{m.nombre}</span>
                            {/* Dentro del flex-1 del nombre, NO como cuarta columna: se probó
                                una columna "DTO" (la que tiene app-vendedores en el rubro
                                expandido) y dejaba el nombre en ~55px — `PARRI…` — en un
                                iPhone SE. Acá sólo cuesta ancho en las marcas que sí tienen
                                descuento, que son minoría.

                                `shrink-0` + el `truncate` del nombre: cuando no entra todo,
                                se corta `COBREQ # LIQUIDOS FRENO #` y nunca el número, que
                                es el dato que el vendedor está buscando.

                                Violeta y no verde/ámbar: en esta misma tabla, a 26px de
                                distancia, el chip de estado ya usa ámbar para "a medio
                                cargar" y verde para "✓ completo". Un tercer significado
                                sobre esos colores rompe ese semáforo. Es además el violeta
                                que ya usa `DiscountBadge` en app-vendedores. Sin tramos de
                                color por valor (≥18 verde, ≥15 azul…, como
                                `V2ClientDiscountsPanel`): esos cortes no están documentados
                                en ningún lado. */}
                            {m.descuento !== undefined && (
                                <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-px text-[10px] font-bold tabular-nums text-violet-700">
                                    {Math.round(m.descuento)}%
                                </span>
                            )}
                        </div>
```

En `src/components/PropuestaSheet.tsx`, agregar el import:

```ts
import { conDescuentos } from '@/lib/descuentosMarca'
```

y reemplazar la línea 75:

```ts
    const filas = construirFilasPropuesta(rubros, rubroStatus, true)
```

por:

```ts
    const filas = construirFilasPropuesta(rubros, conDescuentos(rubroStatus, cliente), true)
```

En `src/components/VisitaSheet.tsx`, agregar el mismo import y reemplazar el primer argumento
`rubroStatus` de la llamada a `construirFilasVisita` (línea ~450) por
`conDescuentos(rubroStatus, cliente)`. La llamada queda:

```ts
    const filas = construirFilasVisita(
        ofrecimientos,
        conDescuentos(rubroStatus, cliente),
        estadosResolucion,
        true,
        esEditable,
    )
```

> Verificar los nombres exactos de los argumentos 3-5 en el archivo antes de editar: sólo
> cambia el segundo. Si la firma no coincide, es que `filas.ts` cambió — releer
> `construirFilasVisita` y ajustar sólo ese argumento.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/propuesta/OfrecimientoTable.test.tsx`
Expected: PASS — los 5 tests nuevos y todos los existentes.

Run: `npx vitest run src/components/PropuestaSheet.test.tsx src/components/VisitaSheet.test.tsx`
Expected: PASS — sin regresiones.

- [ ] **Step 5: Commit**

```bash
git add src/components/propuesta/OfrecimientoTable.tsx src/components/propuesta/OfrecimientoTable.test.tsx src/components/PropuestaSheet.tsx src/components/VisitaSheet.tsx
git commit -m "feat(visita): % de descuento pegado a la marca en el rubro desplegado

Badge violeta dentro del flex-1 del nombre, no como cuarta columna: una
columna DTO dejaba el nombre en ~55px en un iPhone SE. Sólo se dibuja
donde hay descuento.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: El sheet "Descuentos por marca"

La ficha completa del cliente, no sólo las marcas del rubro abierto.

**Files:**
- Create: `src/components/DescuentosMarcaSheet.tsx`
- Test: `src/components/DescuentosMarcaSheet.test.tsx`

**Interfaces:**
- Consumes: `listaDescuentos`, `esSuscriptor` (Task 1); `IVisitClientCard`.
- Produces: `export default function DescuentosMarcaSheet({ open, onClose, cliente }: { open: boolean; onClose: () => void; cliente: IVisitClientCard })`

> **Nota de implementación:** el buscador filtra un array **en memoria**, así que NO usa
> `useTextoDebounced`. Ese hook existe para los buscadores de cartera, que disparan una
> request por tecla. Acá el debounce sólo agregaría 300ms de lag a un filtro gratis.

- [ ] **Step 1: Write the failing test**

Create `src/components/DescuentosMarcaSheet.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import DescuentosMarcaSheet from './DescuentosMarcaSheet'
import type { IVisitClientCard } from '@/types/planificacion'

function cliente(over: Partial<IVisitClientCard> = {}): IVisitClientCard {
    return {
        codigoCliente: '10034',
        codigoParticularCliente: '10034-1',
        nombreCliente: 'DERQUI AUTOPARTES SRL',
        bonusDiscount: 8,
        gmDiscount: 35,
        generalDiscount: 0,
        brandDiscounts: [
            { code: '141', value: 15, description: 'COBREQ # LIQUIDOS FRENO #' },
            { code: '039', value: 23, description: 'AG # RESORTES #' },
        ],
        ...over,
    }
}

function abrir(over: Partial<IVisitClientCard> = {}) {
    render(<DescuentosMarcaSheet open onClose={() => {}} cliente={cliente(over)} />)
}

it('lista las marcas ordenadas por % descendente', () => {
    abrir()
    const filas = screen.getAllByRole('listitem').map(li => li.textContent)
    expect(filas[0]).toContain('AG · RESORTES')
    expect(filas[0]).toContain('23%')
    expect(filas[1]).toContain('COBREQ · LIQUIDOS FRENO')
    expect(filas[1]).toContain('15%')
})

it('el buscador filtra por nombre, sin acentos ni mayúsculas', () => {
    abrir()
    fireEvent.change(screen.getByPlaceholderText(/buscar marca/i), { target: { value: 'cobreq' } })
    expect(screen.getByText(/COBREQ/)).toBeInTheDocument()
    expect(screen.queryByText(/RESORTES/)).not.toBeInTheDocument()
})

it('el buscador sin resultados lo dice', () => {
    abrir()
    fireEvent.change(screen.getByPlaceholderText(/buscar marca/i), { target: { value: 'zzz' } })
    expect(screen.getByText(/ninguna marca/i)).toBeInTheDocument()
})

it('muestra sólo los chips de escalares mayores a cero', () => {
    abrir()
    expect(screen.getByText(/GM 35%/)).toBeInTheDocument()
    expect(screen.getByText(/Bonif\. 8%/)).toBeInTheDocument()
    // generalDiscount es 0 para todos los clientes (ETL roto, spec §3.2).
    expect(screen.queryByText(/Gral\./)).not.toBeInTheDocument()
})

describe('cliente suscriptor', () => {
    it('explica por qué no hay descuentos, con su propio %', () => {
        abrir({ bonusDiscount: 45 })
        expect(screen.getByText(/SUSCRIPTOR · 45%/)).toBeInTheDocument()
        expect(screen.getByText(/no se suman/i)).toBeInTheDocument()
    })

    it('el 49 no está hardcodeado en 45', () => {
        abrir({ bonusDiscount: 49 })
        expect(screen.getByText(/SUSCRIPTOR · 49%/)).toBeInTheDocument()
    })

    it('no lista marcas ni ofrece buscador', () => {
        abrir({ bonusDiscount: 45 })
        expect(screen.queryAllByRole('listitem')).toHaveLength(0)
        expect(screen.queryByPlaceholderText(/buscar marca/i)).not.toBeInTheDocument()
    })

    // El chip SUSCRIPTOR y el de Bonif. son el mismo número: mostrar los dos sugiere dos
    // beneficios distintos.
    it('el chip SUSCRIPTOR reemplaza al de Bonif., pero el de GM convive', () => {
        abrir({ bonusDiscount: 45 })
        expect(screen.queryByText(/Bonif\./)).not.toBeInTheDocument()
        expect(screen.getByText(/GM 35%/)).toBeInTheDocument()
    })
})

it('sin descuentos y sin ser suscriptor, lo dice sin insinuar que falta cargar algo', () => {
    abrir({ brandDiscounts: [] })
    expect(screen.getByText(/no tiene descuentos por marca/i)).toBeInTheDocument()
    expect(screen.queryByText(/SUSCRIPTOR/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/DescuentosMarcaSheet.test.tsx`
Expected: FAIL — `Failed to resolve import "./DescuentosMarcaSheet"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/DescuentosMarcaSheet.tsx`:

```tsx
import { useMemo, useState } from 'react'
import BottomSheet from './ui/BottomSheet'
import { esSuscriptor, listaDescuentos } from '@/lib/descuentosMarca'
import type { IVisitClientCard } from '@/types/planificacion'

/** Sin acentos ni mayúsculas: nadie tipea la tilde parado en un mostrador (mismo criterio
 *  que `CatalogoPicker` y el buscador de `OfrecimientoTable`). */
function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
}

const CHIP = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold'

function ChipEscalar({ label, valor }: { label: string; valor?: number | null }) {
    if (valor == null || valor <= 0) return null
    return (
        <span className={`${CHIP} bg-[#F1F4F9] text-dsnavytext`}>
            {label} {Math.round(valor)}%
        </span>
    )
}

/**
 * La ficha de descuentos del cliente, completa — no sólo las marcas del rubro abierto.
 * Es de consulta: no hay nada tocable adentro.
 *
 * El buscador filtra un array en memoria, así que NO usa `useTextoDebounced`: ese hook
 * existe para los buscadores de cartera, que disparan una request por tecla. Acá sólo
 * agregaría 300ms de lag a un filtro gratis.
 */
export default function DescuentosMarcaSheet({
    open,
    onClose,
    cliente,
}: {
    open: boolean
    onClose: () => void
    cliente: IVisitClientCard
}) {
    const [busqueda, setBusqueda] = useState('')
    const suscriptor = esSuscriptor(cliente)
    const todos = useMemo(() => listaDescuentos(cliente), [cliente])

    const visibles = useMemo(() => {
        const q = normalizar(busqueda.trim())
        if (!q) return todos
        return todos.filter(d => normalizar(d.nombre).includes(q))
    }, [todos, busqueda])

    return (
        <BottomSheet open={open} onClose={onClose} title="Descuentos por marca">
            <div className="mb-3 flex flex-wrap gap-1.5">
                {/* El chip SUSCRIPTOR REEMPLAZA al de Bonif.: son el mismo número
                    (`bonusDiscount`), y mostrarlo dos veces sugiere dos beneficios
                    distintos. El de GM sí convive, porque es otro eje — `gm_discount`
                    sale del texto del barrio y es un camino de precio excluyente. */}
                {suscriptor ? (
                    <span className={`${CHIP} bg-violet-50 text-violet-700 ring-1 ring-violet-200`}>
                        SUSCRIPTOR · {Math.round(Number(cliente.bonusDiscount))}%
                    </span>
                ) : (
                    <ChipEscalar label="Bonif." valor={cliente.bonusDiscount} />
                )}
                <ChipEscalar label="GM" valor={cliente.gmDiscount} />
                {/* En la práctica nunca se dibuja: `general_discount` vale 0 para todos
                    porque dbt lee `discounts->>'byGeneral'` y client-service nunca emite
                    esa clave (spec §3.2). Se deja para que el día que arreglen el ETL
                    aparezca solo, sin tocar esta pantalla. */}
                <ChipEscalar label="Gral." valor={cliente.generalDiscount} />
            </div>

            {suscriptor ? (
                <p className="text-[12.5px] font-semibold leading-snug text-dsmuted">
                    El {Math.round(Number(cliente.bonusDiscount))}% ya aplica a todo. Los
                    descuentos por marca no se suman.
                </p>
            ) : todos.length === 0 ? (
                <p className="text-[12.5px] font-semibold leading-snug text-dsmuted">
                    Este cliente no tiene descuentos por marca.
                </p>
            ) : (
                <>
                    <input
                        type="search"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar marca…"
                        className="mb-2 w-full rounded-md border border-[#E4E8F0] bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-dsnavytext outline-none placeholder:font-medium placeholder:text-[#8A93A6] focus:border-dsnavy"
                    />
                    {visibles.length === 0 ? (
                        <p className="text-[12.5px] font-semibold text-dsmuted">
                            Ninguna marca coincide con la búsqueda.
                        </p>
                    ) : (
                        <ul className="divide-y divide-dsline">
                            {visibles.map(d => (
                                <li
                                    key={d.code}
                                    className="flex items-center gap-2 py-2 text-[12.5px] font-semibold text-dsnavytext"
                                >
                                    <span className="min-w-0 flex-1 truncate">{d.nombre}</span>
                                    <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-px text-[11px] font-bold tabular-nums text-violet-700">
                                        {Math.round(d.valor)}%
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </BottomSheet>
    )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/DescuentosMarcaSheet.test.tsx`
Expected: PASS — 9 tests.

> Si `BottomSheet` no renderiza sus hijos cuando `open` es true en jsdom (por portal o
> animación), mirar `src/components/ui/BottomSheet.test.tsx` y copiar el patrón de render
> que usa ahí. No cambiar `BottomSheet`.

- [ ] **Step 5: Commit**

```bash
git add src/components/DescuentosMarcaSheet.tsx src/components/DescuentosMarcaSheet.test.tsx
git commit -m "feat(descuentos): sheet de consulta con la ficha completa del cliente

Lista buscable ordenada por % desc, más los escalares como chips. El
suscriptor ve el chip que explica por qué no hay descuentos por marca:
sin ese texto, cero filas se lee como 'no tiene ninguno' cuando la verdad
es que tiene el mejor de todos.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: El punto de entrada en `VisitaSheet`

**Files:**
- Modify: `src/components/VisitaSheet.tsx` (el `const acciones` de la línea ~421, y el árbol de sheets del final)
- Test: `src/components/VisitaSheet.test.tsx`

**Interfaces:**
- Consumes: `DescuentosMarcaSheet` (Task 4), `esSuscriptor`, `listaDescuentos` (Task 1).
- Produces: nada.

- [ ] **Step 1: Write the failing test**

Append to `src/components/VisitaSheet.test.tsx`. Ese archivo ya tiene `renderSheet(over)`
(línea 35) y el fixture `CLIENTE` (línea 16): usar esos, no crear helpers nuevos.

```tsx
// El chip vive en el header junto a "No visité", no en la fila de AccionesExternas: esos
// chips llevan AFUERA de la app y lo dicen con el ↗. Éste es contenido propio.
const CON_DESCUENTO = [{ code: '141', value: 15, description: 'COBREQ # LIQUIDOS FRENO #' }]

it('ofrece el chip de descuentos cuando el cliente tiene descuentos por marca', () => {
    renderSheet({ cliente: { ...CLIENTE, brandDiscounts: CON_DESCUENTO } })
    expect(screen.getByRole('button', { name: /descuentos/i })).toBeInTheDocument()
})

it('el chip abre el sheet con la lista', () => {
    renderSheet({ cliente: { ...CLIENTE, brandDiscounts: CON_DESCUENTO } })
    fireEvent.click(screen.getByRole('button', { name: /descuentos/i }))
    expect(screen.getByText('Descuentos por marca')).toBeInTheDocument()
    expect(screen.getByText(/COBREQ · LIQUIDOS FRENO/)).toBeInTheDocument()
})

// Un botón que abre una pantalla vacía es peor que no tenerlo.
it('no ofrece el chip si no hay descuentos y no es suscriptor', () => {
    renderSheet({ cliente: { ...CLIENTE, brandDiscounts: [], bonusDiscount: 0 } })
    expect(screen.queryByRole('button', { name: /descuentos/i })).not.toBeInTheDocument()
})

// El suscriptor SÍ lo ve, aunque su lista esté vacía: el sheet es donde se entera de por
// qué, y de que tiene el mejor descuento de todos.
it('ofrece el chip al suscriptor aunque no tenga descuentos por marca', () => {
    renderSheet({ cliente: { ...CLIENTE, brandDiscounts: [], bonusDiscount: 45 } })
    expect(screen.getByRole('button', { name: /descuentos/i })).toBeInTheDocument()
})

// A diferencia de "No visité": el sheet es consulta, no edición.
it('el chip sigue estando con la visita cerrada', () => {
    renderSheet({ visitaCerrada: true, cliente: { ...CLIENTE, brandDiscounts: CON_DESCUENTO } })
    expect(screen.getByRole('button', { name: /descuentos/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /no visité/i })).not.toBeInTheDocument()
})
```

> `renderSheet` pasa `visitaCerrada={false}` por defecto y hace merge de `over` sobre las
> props (ver líneas 35-56). Si `CLIENTE` no trae `bonusDiscount`, dejarlo así: `undefined`
> no es suscriptor, que es justo lo que asumen los primeros tres tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name /descuentos/i`.

- [ ] **Step 3: Write minimal implementation**

En `src/components/VisitaSheet.tsx`, agregar imports:

```ts
import { Percent } from 'lucide-react'
import DescuentosMarcaSheet from './DescuentosMarcaSheet'
import { esSuscriptor, listaDescuentos } from '@/lib/descuentosMarca'
```

Agregar el estado, junto a los otros `useState` del componente:

```ts
const [descuentosAbierto, setDescuentosAbierto] = useState(false)
```

Reemplazar el bloque `const acciones = …` (línea ~421) por:

```tsx
    // El chip de descuentos NO va en la fila de `AccionesExternas`: esos chips llevan
    // afuera de la app y lo dicen con el ↗. Éste abre contenido propio, y mezclarlos le
    // saca al ↗ su significado. Va acá, en la línea de identidad del header, por la misma
    // razón que "No visité": es donde el vendedor lo encuentra rápido, parado en el local.
    //
    // A diferencia de "No visité", se muestra TAMBIÉN con la visita cerrada: es consulta,
    // no edición, y el sheet de una visita cerrada es justamente de consulta.
    //
    // El suscriptor lo ve aunque su lista esté vacía — el sheet es donde se entera de que
    // tiene el 45% global, que es lo contrario de "este cliente no tiene descuentos". Sin
    // descuentos y sin ser suscriptor no se renderiza: un botón que abre una pantalla
    // vacía es peor que no tenerlo.
    const hayDescuentos = !!cliente && (esSuscriptor(cliente) || listaDescuentos(cliente).length > 0)

    const chipDescuentos = hayDescuentos ? (
        <button
            type="button"
            onClick={() => setDescuentosAbierto(true)}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 text-[11px] font-bold text-violet-700"
        >
            <Percent className="h-[12px] w-[12px]" strokeWidth={2.6} />
            Descuentos
        </button>
    ) : null

    const botonNoVisita =
        !visitaCerrada && onNoVisita ? (
            <button
                type="button"
                onClick={() => onNoVisita(completos)}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-dsred/25 bg-dsred/8 px-2 text-[11px] font-bold text-dsred"
            >
                <X className="h-[12px] w-[12px]" strokeWidth={2.6} />
                No visité
            </button>
        ) : null

    // El de descuentos primero: es el de consulta, y la salida negativa queda al borde.
    const acciones =
        chipDescuentos || botonNoVisita ? (
            <div className="flex items-center gap-1.5">
                {chipDescuentos}
                {botonNoVisita}
            </div>
        ) : undefined
```

Agregar el sheet al final del árbol, al lado del `<BottomSheet open={altaAbierta} …>` que ya
está ahí (dentro del mismo fragmento contenedor):

```tsx
            {cliente && (
                <DescuentosMarcaSheet
                    open={descuentosAbierto}
                    onClose={() => setDescuentosAbierto(false)}
                    cliente={cliente}
                />
            )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: PASS — los 5 tests nuevos y todos los existentes (incluidos los de "No visité",
que ahora vive dentro de un `<div>`).

- [ ] **Step 5: Commit**

```bash
git add src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx
git commit -m "feat(visita): chip de descuentos en el header del sheet

En la línea de identidad junto a \"No visité\", no en AccionesExternas:
esos chips llevan afuera de la app y lo dicen con el ↗. Visible también
con la visita cerrada — es consulta, no edición.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Verificación completa

**Files:** ninguno (salvo que aparezca una regresión).

- [ ] **Step 1: Suite completa**

Run: `npx vitest run`
Expected: PASS, sin tests saltados nuevos.

- [ ] **Step 2: Typecheck y lint**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 3: Verificación visual en mobile**

Run: `npm run dev`

Con el devtools en **375px** (iPhone SE) y en **320px**:

1. Abrir la visita de un cliente con descuentos, desplegar un rubro con marcas.
   - El `15%` violeta aparece pegado al nombre de la marca.
   - Las tres columnas numéricas no se corrieron; en 320px `M.Ant` sigue escondida.
   - Con un nombre largo (`COBREQ # LIQUIDOS FRENO #`) se corta el **nombre**, no el número.
2. Tocar el chip `Descuentos` del header → abre el sheet, lista ordenada por % desc,
   el buscador filtra.
3. Un cliente suscriptor (`bonusDiscount: 45`) → ninguna marca con badge en la tabla, y el
   sheet muestra `SUSCRIPTOR · 45%` con la explicación.

Si no hay un cliente suscriptor a mano en el entorno, forzarlo temporalmente en el
devtools de React o con un breakpoint; **no** commitear ningún mock para eso.

- [ ] **Step 4: Actualizar `CLAUDE.md`**

Agregar a la sección "Decisiones no obvias" de `CLAUDE.md`, después de la viñeta de
`getRubroStatus`:

```markdown
- **El descuento por marca sale de `cliente.brandDiscounts`, no de un endpoint.** Ya viaja en
  el card de la agenda (`fct_clients.brand_discounts`) y toda la derivación vive en
  `src/lib/descuentosMarca.ts`, que lo pega a cada marca de `rubroStatus` (`conDescuentos`)
  **antes** de que `filas.ts` arme las filas — así no baja cuatro niveles de props. **Un
  cliente suscriptor no ve descuentos por marca**: `bonusDiscount ∈ {45, 49}` significa 45%
  de bonificación global a cambio de un fee, y el descuento por marca NO se acumula con eso
  (el motor de precios de Lupa lo neutraliza). **No copiar el `general_discount <> 45` de
  `clientService.getBrandDiscounts`**: esa columna vale 0 para todos, porque dbt lee
  `discounts->>'byGeneral'` y client-service nunca emite esa clave — el filtro de
  app-vendedores es un no-op. El suscriptor ve un chip que lo explica, porque una lista
  vacía se lee como "no tiene ningún descuento" cuando tiene el mejor de todos. Detalle en
  [`docs/superpowers/specs/2026-09-16-descuentos-por-marca-en-la-visita-design.md`](docs/superpowers/specs/2026-09-16-descuentos-por-marca-en-la-visita-design.md).
```

- [ ] **Step 5: Commit y PR**

```bash
git add CLAUDE.md
git commit -m "docs: el descuento por marca y la regla del cliente suscriptor

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
gh pr create --base master --title "Descuentos por marca en la visita" --body "$(cat <<'EOF'
## Qué hace

Le muestra al vendedor el % de descuento por marca del cliente: pegado a la marca dentro del rubro que está ofreciendo, y entero en un sheet de consulta desde el header de la visita.

**Cien por ciento front.** El dato ya viajaba en `IVisitClientCard.brandDiscounts` (viene de `fct_clients.brand_discounts` en el GET de la agenda) y se descartaba. Cero endpoints nuevos, cero cambios en api-vendedores, cero requests.

## Lo no obvio: la regla del suscriptor

app-vendedores filtra los descuentos por marca con `AND general_discount <> 45`, sin comentario. Investigado antes de copiarlo:

- **45 = cliente suscriptor**: 45% de bonificación global a cambio de un fee mensual facturado bajo la marca `120`. La regla de fondo es correcta — el descuento por marca **no se acumula** con esa bonificación (`api-node-lupa/utils/priceUtils.js:52` lo neutraliza). Mostrárselo es prometer algo que la factura no aplica.
- **Pero la columna está muerta.** `general_discount` vale 0 para todos: `int_clients_enriched.sql:173` lo lee de `discounts->>'byGeneral'` y `client-response.dto.ts:50-63` de client-service nunca emite esa clave. El filtro de app-vendedores es un no-op.
- Acá se aplica sobre **`bonusDiscount ∈ {45, 49}`**, que es el campo que sí trae el dato (los dos valores salen de `MapaCalorService.js:362`).

Esto rompe la paridad visual a propósito: un suscriptor va a ver menos descuentos acá que en app-vendedores. Está justificado en §3 del spec.

## Detalles de mobile

- El badge va **dentro del `flex-1` del nombre**, no como cuarta columna: una columna "DTO" dejaba el nombre en ~55px (`PARRI…`) en un iPhone SE. `M.Ant` conserva su `hidden xs:*`.
- Violeta y no verde/ámbar: esos dos ya significan "✓ completo" y "a medio cargar" en la misma tabla, a 26px de distancia.
- El suscriptor ve un chip `SUSCRIPTOR · 45%` con la explicación: una lista vacía se lee como "no tiene ningún descuento" cuando tiene el mejor de todos.

## Spec

`docs/superpowers/specs/2026-09-16-descuentos-por-marca-en-la-visita-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Fuera de alcance (del spec §9)

No implementar nada de esto salvo pedido explícito:

- **Marcas con descuento que el cliente NO compra** (oportunidad). Exige enriquecer `client-context` con `BrandDiscountEnricher` + `dim_brand_lines` y meter sub-filas con los tres números en `–`, en una pantalla donde entran ~5 filas.
- **Filtrar los descuentos del sheet por el rubro abierto.** Es la ficha completa a propósito; el badge ya queda filtrado de hecho.
- **Arreglar el ETL de `general_discount`.** Afecta a app-vendedores y app-lupa-web; acá no se usa para nada.
- **Tocar `BrandDiscountEnricher` o `clientService.getBrandDiscounts`.** Esta feature no escribe una línea en api-vendedores.
- **Un toggle pesos/unidades para el descuento.** Un % no tiene unidades.
