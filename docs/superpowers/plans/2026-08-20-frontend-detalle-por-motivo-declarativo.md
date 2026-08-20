# Detalle por motivo declarativo — Plan de implementación (frontend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el formulario de detalle de cada motivo se dibuje desde la declaración que manda
el back (`campos`), en vez de tener un componente Editor hardcodeado por motivo. En código
queda solo la línea derivada (el `-13.3%` de Precio y el `2.0%` de Flete).

**Architecture:** Un renderizador genérico (`DetalleMotivo`) itera `motivo.campos` y dibuja un
input por `tipo`. Cada `tipo` es su propio componente porque `useCampoNumero` y el buscador de
marcas usan hooks, y llamarlos dentro de un `switch` en un `.map` violaría las reglas de hooks.
Un registro chico (`registroDerivado`, indexado por `codigo`) aporta la frase calculada cuando
el motivo tiene una. `esValido` deja de estar hardcodeado y se deriva de `requerido`.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, Vitest + Testing Library, TailwindCSS.

**Spec:** el diseño vive en el repo del backend:
`api-vendedores/docs/superpowers/specs/2026-08-20-detalle-por-motivo-declarativo-design.md`.
El plan del backend es `api-vendedores/docs/superpowers/plans/2026-08-20-backend-detalle-por-motivo-declarativo.md`.

## Global Constraints

- **Depende del backend.** Este plan asume que `GET /planificacion/motivos` ya devuelve `campos`
  por motivo. Si el back todavía no está, la Task 1 igual se puede hacer (normaliza el faltante
  a `[]`), pero las Tasks 3 y 4 no se pueden verificar contra datos reales.
- **Tests**: `npx vitest run <path>` desde la raíz del worktree. Corren en el host (no hace falta
  Docker). Una corrida tarda ~40s por el setup del entorno jsdom, así que usá timeouts holgados.
- **Typecheck**: `npx tsc -b`. **Lint**: `npx oxlint`.
- **Prettier**: sin punto y coma, comillas simples, `tabWidth: 4`, `trailingComma: all`,
  `arrowParens: avoid`.
- **Los `tipo` válidos son exactamente**: `numero`, `texto`, `textarea`, `catalogo_marca`.
- **Regla de degradación (del spec, aplica en todo el plan):** un `tipo` que el front no conoce
  **no se dibuja y tampoco se exige**. Si se exigiera sin dibujarse, el wizard quedaría
  bloqueado sin forma de completarlo.
- **`campos` viene ya ordenado** por el back (`orden`). El front no reordena.
- Los valores siguen viajando como `valores: Record<campo, string | number | null>`: **esa forma
  no cambia**, así que los borradores de localStorage siguen siendo válidos.

---

### Task 1: Tipos de la declaración y normalización en el borde

`IMotivo` suma `campos`, y `getMotivos` garantiza que nunca llegue `undefined`. Es la base de
todo lo demás y toca muchos fixtures, así que va sola.

**Files:**
- Modify: `src/types/planificacion.ts:21-29`
- Modify: `src/api/planificacion.ts:86-92`
- Test: `src/api/planificacion.test.ts`
- Modify (fixtures): los 8 archivos de test que construyen `IMotivo` — ver Step 4.

**Interfaces:**
- Produces:
  - `type TipoCampoMotivo = 'numero' | 'texto' | 'textarea' | 'catalogo_marca'`
  - `interface ICampoMotivo { campo: string; tipo: TipoCampoMotivo; label: string; placeholder: string | null; unidad: string | null; requerido: boolean; orden: number }`
  - `IMotivo.campos: ICampoMotivo[]` — **requerido**, array vacío = el motivo no pide detalle.

  Las Tasks 2, 3 y 4 consumen `ICampoMotivo` y `IMotivo.campos`.

- [ ] **Step 1: Escribir el test que falla**

En `src/api/planificacion.test.ts`, dentro del `describe('motivos', ...)` (línea 125), agregar:

```ts
    it('normaliza campos a [] cuando el back no lo manda', async () => {
        ;(apiClient.get as Mock).mockResolvedValue({
            data: {
                data: [
                    {
                        motivoId: 13,
                        nivel: 'ofrecimiento',
                        descripcion: 'Precio',
                        resultado: 'perdido',
                        codigo: 'PRECIO',
                    },
                ],
            },
        })

        const motivos = await getMotivos('ofrecimiento')

        expect(motivos[0].campos).toEqual([])
    })

    it('deja pasar los campos declarados tal cual', async () => {
        const campos = [
            {
                campo: 'plazo_dias',
                tipo: 'numero',
                label: 'Plazo solicitado',
                placeholder: 'Ej. 30',
                unidad: 'días',
                requerido: true,
                orden: 10,
            },
        ]
        ;(apiClient.get as Mock).mockResolvedValue({
            data: {
                data: [
                    {
                        motivoId: 14,
                        nivel: 'ofrecimiento',
                        descripcion: 'Plazo',
                        resultado: 'perdido',
                        codigo: 'PLAZO',
                        campos,
                    },
                ],
            },
        })

        const motivos = await getMotivos('ofrecimiento')

        expect(motivos[0].campos).toEqual(campos)
    })
```

Si el archivo no importa `Mock` de vitest ni `getMotivos`, agregarlos a los imports existentes
(el `describe('motivos')` ya usa `apiClient.get`, así que el mock del módulo ya está armado).

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/api/planificacion.test.ts`
Expected: FAIL — `expect(motivos[0].campos).toEqual([])` recibe `undefined`, porque hoy
`getMotivos` devuelve `res.data.data` sin tocar.

- [ ] **Step 3: Agregar los tipos y normalizar en el borde**

En `src/types/planificacion.ts`, reemplazar la interfaz `IMotivo` (líneas 21-29) por:

```ts
/** Qué clase de input pide un campo. Es un enum de CÓDIGO, no de datos: sumar un `tipo`
 *  implica un componente nuevo, y por lo tanto un deploy. Un `tipo` desconocido no se dibuja
 *  ni se exige — ver la regla de degradación del spec. */
export type TipoCampoMotivo = 'numero' | 'texto' | 'textarea' | 'catalogo_marca'

/** La declaración de un campo del detalle, tal como la sirve el back desde pl_motivo_campo.
 *  Reemplaza al registro que estaba hardcodeado en detalleMotivo/validadores.ts: agregar un
 *  campo pasó a ser un INSERT. */
export interface ICampoMotivo {
    campo: string
    tipo: TipoCampoMotivo
    label: string
    placeholder: string | null
    /** Sufijo de presentación ("días", "$"). Se muestra junto al label. */
    unidad: string | null
    requerido: boolean
    orden: number
}

export interface IMotivo {
    motivoId: number
    nivel: NivelMotivo
    descripcion: string
    resultado: ResultadoMotivo | null
    /** Llave estable del módulo de DISPLAY (PRECIO, FLETE): identifica al motivo que deriva
     *  un valor con fórmula. `null` = se dibuja genérico. NO significa "no pide detalle":
     *  eso lo dice `campos`. NO se usa motivoId: los ids difieren entre ambientes. */
    codigo: string | null
    /** Qué campos pide este motivo, ya ordenados por el back. Vacío = no pide detalle. */
    campos: ICampoMotivo[]
}
```

En `src/api/planificacion.ts`, reemplazar `getMotivos` (líneas 86-92) por:

```ts
export const getMotivos = async (nivel?: NivelMotivo): Promise<IMotivo[]> => {
    const res = await apiClient.get('/planificacion/motivos', {
        params: nivel === undefined ? undefined : { nivel },
    })
    // `campos ?? []` en el borde y en un solo lugar: un back sin desplegar todavía, o una
    // respuesta que quedó cacheada de antes, no traen el campo — y `cat.campos.length` en
    // el render sería una pantalla en blanco en el teléfono del vendedor.
    return (res.data.data as IMotivo[]).map(m => ({ ...m, campos: m.campos ?? [] }))
}
```

- [ ] **Step 4: Arreglar los fixtures que quedaron sin `campos`**

`campos` es requerido, así que todos los literales de `IMotivo` en los tests dejan de compilar.
Encontrarlos:

```bash
grep -rn "nivel: 'ofrecimiento'\|nivel: 'visita'" src/
```

Son **19 literales en 8 archivos**: `src/api/planificacion.test.ts` (1),
`src/components/propuesta/ResolucionOfrecimiento.test.tsx` (6),
`src/components/propuesta/ResolucionWizard.test.tsx` (2),
`src/components/propuesta/ResolucionWizardAcciones.test.tsx` (2),
`src/components/ResolucionSheet.test.tsx` (2), `src/components/VisitaSheet.test.tsx` (3),
`src/hooks/useMotivos.test.tsx` (1), `src/lib/resolucionOfrecimiento.test.ts` (2).

Agregarles `campos: []` a todos. **Excepción**: en `ResolucionOfrecimiento.test.tsx` y
`resolucionOfrecimiento.test.ts`, los motivos que el test usa para ejercitar el panel de detalle
(los que hoy tienen `codigo: 'PRECIO'` o similar) necesitan su declaración real, o el detalle
deja de dibujarse y esos tests fallan por la razón equivocada.

En `ResolucionOfrecimiento.test.tsx` el array compartido está en las líneas 8-14: el motivo 20
(`codigo: 'PRECIO'`) lleva la declaración de abajo y los otros cuatro `campos: []`.

Para los que necesitan declaración real usar:

```ts
campos: [
    { campo: 'marca', tipo: 'catalogo_marca', label: 'Marca', placeholder: null, unidad: null, requerido: true, orden: 10 },
    { campo: 'competidor', tipo: 'texto', label: 'Competidor', placeholder: 'Ej. Corven', unidad: null, requerido: true, orden: 20 },
    { campo: 'precio_competidor', tipo: 'numero', label: 'Precio del competidor', placeholder: null, unidad: '$', requerido: true, orden: 30 },
    { campo: 'mi_precio', tipo: 'numero', label: 'Mi precio', placeholder: null, unidad: '$', requerido: true, orden: 40 },
]
```

- [ ] **Step 5: Verificar que compila y que la suite queda verde**

```bash
npx tsc -b
npx vitest run
```

Expected: `tsc` sin errores y toda la suite en verde. Los tests de los Editors viejos
(`modulos.test.tsx`, `precio.test.tsx`) siguen pasando: todavía no se tocaron.

- [ ] **Step 6: Commit**

```bash
git add src/types/planificacion.ts src/api/planificacion.ts src/api/planificacion.test.ts
git add -u src
git commit -m "feat(resolucion): IMotivo declara sus campos y getMotivos los normaliza"
```

---

### Task 2: `esValido` se deriva de la declaración

El gate del wizard deja de preguntarle a un registro hardcodeado y usa `requerido`. Con esto
`validadoresDetalleMotivo` queda sin consumidores de producción y se borra.

**Files:**
- Modify: `src/components/propuesta/detalleMotivo/validadores.ts`
- Modify: `src/lib/resolucionOfrecimiento.ts:1-22`
- Test: `src/components/propuesta/detalleMotivo/validadores.test.ts`
- Test: `src/lib/resolucionOfrecimiento.test.ts`

**Interfaces:**
- Consumes: `ICampoMotivo`, `IMotivo.campos` (Task 1).
- Produces:
  - `TIPOS_RENDERIZABLES: Set<TipoCampoMotivo>` — los tipos que el front sabe dibujar.
  - `esValidoSegunDeclaracion(campos: ICampoMotivo[], valores: ValoresMotivo): boolean`
  - Siguen exportados sin cambios: `ValoresMotivo`, `cargado`, `pctVsCompetidor`,
    `pctFleteSobreCompra`.
  - **Se borran**: `validadoresDetalleMotivo`, `IValidadorDetalleMotivo`.

  La Task 3 consume `pctVsCompetidor` y `pctFleteSobreCompra`; la Task 4 consume
  `TIPOS_RENDERIZABLES` indirectamente vía el renderizador.

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar el contenido de `src/components/propuesta/detalleMotivo/validadores.test.ts` por:

```ts
import { esValidoSegunDeclaracion, pctVsCompetidor, pctFleteSobreCompra } from './validadores'
import type { ICampoMotivo } from '@/types/planificacion'

function campo(over: Partial<ICampoMotivo> = {}): ICampoMotivo {
    return {
        campo: 'plazo_dias',
        tipo: 'numero',
        label: 'Plazo solicitado',
        placeholder: null,
        unidad: null,
        requerido: true,
        orden: 10,
        ...over,
    }
}

describe('esValidoSegunDeclaracion', () => {
    it('sin campos declarados siempre es válido: no hay formulario a medias', () => {
        expect(esValidoSegunDeclaracion([], {})).toBe(true)
    })

    it('falta un requerido', () => {
        expect(esValidoSegunDeclaracion([campo()], {})).toBe(false)
    })

    it('con el requerido cargado es válido', () => {
        expect(esValidoSegunDeclaracion([campo()], { plazo_dias: 30 })).toBe(true)
    })

    it('un opcional vacío no invalida', () => {
        const opcional = campo({ campo: 'por_que', tipo: 'textarea', requerido: false })

        expect(esValidoSegunDeclaracion([opcional], {})).toBe(true)
    })

    // Un 0 en un precio o un plazo es "sin cargar", no un dato: mantiene el criterio que ya
    // tenía `cargado`.
    it('un número en 0 cuenta como no cargado', () => {
        expect(esValidoSegunDeclaracion([campo()], { plazo_dias: 0 })).toBe(false)
    })

    it('un texto en blanco cuenta como no cargado', () => {
        const texto = campo({ campo: 'competidor', tipo: 'texto' })

        expect(esValidoSegunDeclaracion([texto], { competidor: '   ' })).toBe(false)
    })

    // "Un campo que no se puede preguntar no se puede exigir": si un tipo nuevo bloqueara el
    // wizard, el vendedor no tendría forma de completarlo con este deploy.
    it('un tipo que el front no sabe dibujar no se exige', () => {
        const raro = campo({ campo: 'fecha_promesa', tipo: 'fecha' as never })

        expect(esValidoSegunDeclaracion([raro], {})).toBe(true)
    })
})

describe('derivados', () => {
    it('pctVsCompetidor: negativo cuando soy más barato', () => {
        expect(pctVsCompetidor({ precio_competidor: 150, mi_precio: 130 })).toBeCloseTo(-13.3, 1)
    })

    it('pctVsCompetidor: null si falta un precio', () => {
        expect(pctVsCompetidor({ precio_competidor: 150 })).toBeNull()
    })

    it('pctFleteSobreCompra: el flete sobre la compra', () => {
        expect(pctFleteSobreCompra({ valor_flete: 60000, compra_futuro: 3000000 })).toBeCloseTo(2, 1)
    })

    it('pctFleteSobreCompra: null si la compra es 0', () => {
        expect(pctFleteSobreCompra({ valor_flete: 60000, compra_futuro: 0 })).toBeNull()
    })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/components/propuesta/detalleMotivo/validadores.test.ts`
Expected: FAIL — `esValidoSegunDeclaracion` no existe ("does not provide an export named").

- [ ] **Step 3: Reescribir `validadores.ts`**

Reemplazar el contenido completo de `src/components/propuesta/detalleMotivo/validadores.ts` por:

```ts
import type { ICampoMotivo, TipoCampoMotivo } from '@/types/planificacion'

/** Los valores de un motivo, por `campo`. Espeja la tabla pl_ofrecimiento_motivo_campo. */
export type ValoresMotivo = Record<string, string | number | null>

/** Los `tipo` que el front sabe dibujar. Uno fuera de esta lista viene de una declaración más
 *  nueva que este deploy: no se dibuja y, por lo mismo, no se exige. */
export const TIPOS_RENDERIZABLES = new Set<TipoCampoMotivo>([
    'numero',
    'texto',
    'textarea',
    'catalogo_marca',
])

/** Sin React a propósito: `lib/resolucionOfrecimiento.ts` importa de acá, y arrastrar
 *  componentes a un módulo de lib obligaría a su test a montar React sin necesidad. */
export function cargado(valor: string | number | null | undefined): boolean {
    if (valor === null || valor === undefined) return false
    if (typeof valor === 'number') return Number.isFinite(valor) && valor !== 0
    return valor.trim() !== ''
}

/** Si el detalle está completo según lo que declara el back. Reemplaza al `esValido` que cada
 *  módulo traía hardcodeado: ahora "qué es obligatorio" es dato. */
export function esValidoSegunDeclaracion(
    campos: ICampoMotivo[],
    valores: ValoresMotivo,
): boolean {
    return campos
        .filter(c => c.requerido && TIPOS_RENDERIZABLES.has(c.tipo))
        .every(c => cargado(valores[c.campo]))
}

/** Cuánto más barato (negativo) o caro (positivo) soy respecto del competidor. */
export function pctVsCompetidor(valores: ValoresMotivo): number | null {
    const suyo = Number(valores.precio_competidor)
    const mio = Number(valores.mi_precio)
    if (!Number.isFinite(suyo) || !Number.isFinite(mio) || suyo === 0) return null
    return ((mio - suyo) / suyo) * 100
}

/** Qué porcentaje de la compra futura se lleva el flete. */
export function pctFleteSobreCompra(valores: ValoresMotivo): number | null {
    const flete = Number(valores.valor_flete)
    const compra = Number(valores.compra_futuro)
    if (!Number.isFinite(flete) || !Number.isFinite(compra) || compra === 0) return null
    return (flete / compra) * 100
}
```

Las dos fórmulas se quedan acá y no se mudan a `derivados.ts`: este archivo existe justamente
por ser libre de React, y son libres de React. `derivados.ts` las importa.

`IPropsEditorMotivo` se va con los Editors en la Task 4; hasta entonces los cuatro Editors
siguen importándolo, así que **por ahora hay que dejarlo**. Agregarlo al final del archivo:

```ts
/** TRANSITORIO: lo usan los Editors viejos, que se borran en la Task 4 de este plan. */
export interface IPropsEditorMotivo {
    valores: ValoresMotivo
    onChange: (parcial: ValoresMotivo) => void
    marcas: import('@/types/planificacion').ICatalogoItem[]
    marcasLoading?: boolean
}
```

- [ ] **Step 4: Derivar el gate del wizard**

En `src/lib/resolucionOfrecimiento.ts`, reemplazar el import de la línea 1 y la función
`motivoIncompleto` (líneas 4-22) por:

```ts
import { esValidoSegunDeclaracion } from '@/components/propuesta/detalleMotivo/validadores'
import type { IMotivo, IOfrecimientoMotivo } from '@/types/planificacion'

/** El motivo tildado al que le falta algún campo requerido, o null. Se usa para señalar CUÁL
 *  falta completar, no solo que falta algo.
 *
 *  Un motivo sin campos declarados NUNCA bloquea: si no hay formulario, no hay nada a medias.
 *  Tampoco bloquea un campo cuyo `tipo` este deploy no sabe dibujar — ver
 *  `esValidoSegunDeclaracion`. */
export function motivoIncompleto(
    motivos: IMotivo[],
    value: IOfrecimientoMotivo[],
): IMotivo | null {
    const porId = new Map(value.map(m => [m.motivoId, m]))
    return (
        motivos.find(cat => {
            const seleccionado = porId.get(cat.motivoId)
            if (!seleccionado) return false
            return !esValidoSegunDeclaracion(cat.campos, seleccionado.valores)
        }) ?? null
    )
}
```

- [ ] **Step 5: Correr los tests**

```bash
npx vitest run src/components/propuesta/detalleMotivo/validadores.test.ts src/lib/resolucionOfrecimiento.test.ts
npx tsc -b
```

Expected: PASS y `tsc` limpio. Si `resolucionOfrecimiento.test.ts` falla, es porque sus motivos
con `codigo` no tienen `campos` declarados: agregarles la declaración de Precio del Step 4 de la
Task 1.

- [ ] **Step 6: Commit**

```bash
git add src/components/propuesta/detalleMotivo/validadores.ts \
        src/components/propuesta/detalleMotivo/validadores.test.ts \
        src/lib/resolucionOfrecimiento.ts
git add -u src
git commit -m "feat(resolucion): la validacion del detalle se deriva de la declaracion"
```

---

### Task 3: Renderizador genérico y registro de derivados

Los componentes nuevos, testeados en aislamiento. Todavía no se enchufan: eso es la Task 4, así
que esta tarea no puede romper nada de lo que ya funciona.

**Files:**
- Create: `src/components/propuesta/detalleMotivo/campos.tsx`
- Create: `src/components/propuesta/detalleMotivo/derivados.ts`
- Create: `src/components/propuesta/detalleMotivo/DetalleMotivo.tsx`
- Test: `src/components/propuesta/detalleMotivo/DetalleMotivo.test.tsx`

**Interfaces:**
- Consumes: `ICampoMotivo`, `IMotivo` (Task 1); `ValoresMotivo`, `pctVsCompetidor`,
  `pctFleteSobreCompra` (Task 2); `useCampoNumero` de `./numero` (ya existe, no se toca).
- Produces:
  - `CampoMotivo` (named export de `campos.tsx`) — un input según `declaracion.tipo`;
    devuelve `null` si el tipo es desconocido.
  - `registroDerivado: Record<string, (v: ValoresMotivo) => IDerivado | null>` e
    `interface IDerivado { texto: string; tono: 'bueno' | 'advertencia' }` (`derivados.ts`).
  - `DetalleMotivo` (default export) con props
    `{ motivo: IMotivo; valores: ValoresMotivo; onChange: (parcial: ValoresMotivo) => void; marcas: ICatalogoItem[]; marcasLoading?: boolean }`.

  La Task 4 consume `DetalleMotivo`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/propuesta/detalleMotivo/DetalleMotivo.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import DetalleMotivo from './DetalleMotivo'
import type { ICampoMotivo, IMotivo } from '@/types/planificacion'

function campo(over: Partial<ICampoMotivo> = {}): ICampoMotivo {
    return {
        campo: 'plazo_dias',
        tipo: 'numero',
        label: 'Plazo solicitado',
        placeholder: null,
        unidad: null,
        requerido: true,
        orden: 10,
        ...over,
    }
}

function motivo(campos: ICampoMotivo[], codigo: string | null = null): IMotivo {
    return {
        motivoId: 99,
        nivel: 'ofrecimiento',
        descripcion: 'Plazo',
        resultado: 'perdido',
        codigo,
        campos,
    }
}

const base = { marcas: [], onChange: vi.fn(), valores: {} }

describe('DetalleMotivo — renderizado genérico', () => {
    it('dibuja un campo numero y commitea un número, no un string', () => {
        const onChange = vi.fn()
        render(<DetalleMotivo {...base} motivo={motivo([campo()])} onChange={onChange} />)

        fireEvent.change(screen.getByLabelText(/plazo solicitado/i), {
            target: { value: '30' },
        })

        expect(onChange).toHaveBeenCalledWith({ plazo_dias: 30 })
    })

    it('muestra la unidad junto al label', () => {
        render(
            <DetalleMotivo {...base} motivo={motivo([campo({ unidad: 'días' })])} />,
        )

        expect(screen.getByLabelText(/plazo solicitado \(días\)/i)).toBeInTheDocument()
    })

    it('dibuja un textarea para tipo textarea', () => {
        const declarado = campo({ campo: 'por_que', tipo: 'textarea', label: 'Por qué' })

        render(<DetalleMotivo {...base} motivo={motivo([declarado])} />)

        expect(screen.getByLabelText(/por qué/i).tagName).toBe('TEXTAREA')
    })

    it('un campo texto commitea el string tal cual', () => {
        const onChange = vi.fn()
        const declarado = campo({ campo: 'competidor', tipo: 'texto', label: 'Competidor' })

        render(<DetalleMotivo {...base} motivo={motivo([declarado])} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText(/competidor/i), { target: { value: 'Corven' } })

        expect(onChange).toHaveBeenCalledWith({ competidor: 'Corven' })
    })

    it('respeta el orden en que vienen los campos', () => {
        const campos = [
            campo({ campo: 'competidor', tipo: 'texto', label: 'Competidor', orden: 10 }),
            campo({ campo: 'mi_precio', label: 'Mi precio', orden: 20 }),
        ]

        render(<DetalleMotivo {...base} motivo={motivo(campos)} />)

        const labels = screen.getAllByText(/competidor|mi precio/i).map(e => e.textContent)
        expect(labels).toEqual(['Competidor', 'Mi precio'])
    })

    // La regla de degradación: no se dibuja, y no rompe la pantalla.
    it('saltea un tipo que no sabe dibujar sin romper', () => {
        const raro = campo({ campo: 'fecha_promesa', tipo: 'fecha' as never, label: 'Fecha' })

        render(<DetalleMotivo {...base} motivo={motivo([raro, campo()])} />)

        expect(screen.queryByLabelText(/fecha/i)).not.toBeInTheDocument()
        expect(screen.getByLabelText(/plazo solicitado/i)).toBeInTheDocument()
    })

    // El punto decimal a medio tipear es la razón de existir de useCampoNumero: el
    // renderizador genérico tiene que seguir usándolo.
    it('el punto decimal no se trunca al tipear', () => {
        const declarado = campo({ campo: 'mi_precio', label: 'Mi precio' })

        render(<DetalleMotivo {...base} motivo={motivo([declarado])} />)
        const input = screen.getByLabelText(/mi precio/i) as HTMLInputElement
        fireEvent.change(input, { target: { value: '150.' } })

        expect(input.value).toBe('150.')
    })
})

describe('DetalleMotivo — línea derivada', () => {
    const camposPrecio = [
        campo({ campo: 'precio_competidor', label: 'Precio del competidor', orden: 30 }),
        campo({ campo: 'mi_precio', label: 'Mi precio', orden: 40 }),
    ]

    it('Precio muestra el % contra el competidor', () => {
        render(
            <DetalleMotivo
                {...base}
                motivo={motivo(camposPrecio, 'PRECIO')}
                valores={{ precio_competidor: 150, mi_precio: 130 }}
            />,
        )

        expect(
            screen.getByText(/-13\.3% más barato que el competidor/i),
        ).toBeInTheDocument()
    })

    it('sin los dos precios no muestra nada derivado', () => {
        render(
            <DetalleMotivo
                {...base}
                motivo={motivo(camposPrecio, 'PRECIO')}
                valores={{ mi_precio: 130 }}
            />,
        )

        expect(screen.queryByText(/que el competidor/i)).not.toBeInTheDocument()
    })

    it('Flete muestra cuánto pesa sobre la compra', () => {
        const campos = [
            campo({ campo: 'valor_flete', label: 'Valor del flete' }),
            campo({ campo: 'compra_futuro', label: 'Compra a futuro', orden: 20 }),
        ]

        render(
            <DetalleMotivo
                {...base}
                motivo={motivo(campos, 'FLETE')}
                valores={{ valor_flete: 60000, compra_futuro: 3000000 }}
            />,
        )

        expect(screen.getByText(/el flete representa el 2\.0% de la compra/i)).toBeInTheDocument()
    })

    // El catálogo puede ir por delante del deploy: un codigo sin derivado registrado dibuja
    // los campos igual, sin línea calculada.
    it('un codigo sin derivado registrado no rompe', () => {
        render(<DetalleMotivo {...base} motivo={motivo([campo()], 'CODIGO_NUEVO')} />)

        expect(screen.getByLabelText(/plazo solicitado/i)).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/components/propuesta/detalleMotivo/DetalleMotivo.test.tsx`
Expected: FAIL — no resuelve `./DetalleMotivo` ("Failed to resolve import").

- [ ] **Step 3: Crear los inputs por tipo**

Crear `src/components/propuesta/detalleMotivo/campos.tsx`:

```tsx
import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import CatalogoPicker from '../CatalogoPicker'
import { useCampoNumero } from './numero'
import type { ValoresMotivo } from './validadores'
import type { ICampoMotivo, ICatalogoItem } from '@/types/planificacion'

const INPUT =
    'w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none'
const LABEL = 'text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]'

export interface IPropsCampo {
    declaracion: ICampoMotivo
    valor: ValoresMotivo[string]
    onChange: (valor: string | number | null) => void
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
}

/** El label, con la unidad entre paréntesis cuando la declaración la trae: "Mi precio ($)".
 *  Es lo único que consume `unidad` hoy. */
function textoLabel(declaracion: ICampoMotivo): string {
    return declaracion.unidad
        ? `${declaracion.label} (${declaracion.unidad})`
        : declaracion.label
}

// Cada tipo es su propio componente a propósito: `useCampoNumero` y el `useState` del
// buscador son hooks, y llamarlos desde un switch dentro de un .map violaría las reglas de
// hooks (el orden de llamada cambiaría según los campos declarados).
function CampoNumero({ declaracion, valor, onChange }: IPropsCampo) {
    const [texto, onChangeTexto] = useCampoNumero(valor as number | null, onChange)

    return (
        <label className="flex min-w-0 flex-col gap-1">
            <span className={LABEL}>{textoLabel(declaracion)}</span>
            <input
                value={texto}
                onChange={e => onChangeTexto(e.target.value)}
                inputMode="decimal"
                placeholder={declaracion.placeholder ?? undefined}
                className={INPUT}
            />
        </label>
    )
}

function CampoTexto({ declaracion, valor, onChange }: IPropsCampo) {
    return (
        <label className="flex flex-col gap-1">
            <span className={LABEL}>{textoLabel(declaracion)}</span>
            <input
                value={(valor as string) ?? ''}
                onChange={e => onChange(e.target.value)}
                placeholder={declaracion.placeholder ?? undefined}
                className={INPUT}
            />
        </label>
    )
}

function CampoTextarea({ declaracion, valor, onChange }: IPropsCampo) {
    return (
        <label className="flex flex-col gap-1">
            <span className={LABEL}>{textoLabel(declaracion)}</span>
            <textarea
                value={(valor as string) ?? ''}
                onChange={e => onChange(e.target.value)}
                placeholder={declaracion.placeholder ?? undefined}
                rows={2}
                className={INPUT}
            />
        </label>
    )
}

/** La marca sale del catálogo y no de un input libre: restringirla es lo único que hace
 *  agregable esa columna (con texto libre conviven "Fric Rot", "fricrot" y "FRIC-ROT"). */
function CampoCatalogoMarca({
    declaracion,
    valor,
    onChange,
    marcas,
    marcasLoading,
}: IPropsCampo) {
    const [buscadorAbierto, setBuscadorAbierto] = useState(false)

    return (
        <div className="flex flex-col gap-1">
            <span className={LABEL}>{textoLabel(declaracion)}</span>
            {buscadorAbierto ? (
                <CatalogoPicker
                    items={marcas}
                    loading={marcasLoading}
                    value={(valor as string) ?? null}
                    onSelect={item => {
                        onChange(item.description)
                        setBuscadorAbierto(false)
                    }}
                    placeholder="Buscar marca…"
                    autoFocus
                    ocultarContadorRestantes
                />
            ) : (
                <button
                    type="button"
                    aria-label={textoLabel(declaracion)}
                    onClick={() => setBuscadorAbierto(true)}
                    className="flex w-full items-center gap-2 rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-left"
                >
                    <span
                        className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                            valor ? 'text-[#182645]' : 'text-[#8A93A6]'
                        }`}
                    >
                        {(valor as string) ?? 'Elegí una marca'}
                    </span>
                    {valor && (
                        <Check className="h-4 w-4 shrink-0 text-[#213D82]" strokeWidth={3} />
                    )}
                    <ChevronDown className="h-4 w-4 shrink-0 text-dsmuted" strokeWidth={2.4} />
                </button>
            )}
        </div>
    )
}

/** Un input según el `tipo` declarado. Un tipo desconocido devuelve `null`: la declaración va
 *  por delante de este deploy, y no dibujarlo es mejor que dibujarlo mal — un `numero`
 *  renderizado como texto aterrizaría en la columna equivocada. */
export function CampoMotivo(props: IPropsCampo) {
    switch (props.declaracion.tipo) {
        case 'numero':
            return <CampoNumero {...props} />
        case 'texto':
            return <CampoTexto {...props} />
        case 'textarea':
            return <CampoTextarea {...props} />
        case 'catalogo_marca':
            return <CampoCatalogoMarca {...props} />
        default:
            return null
    }
}
```

- [ ] **Step 4: Crear el registro de derivados**

Crear `src/components/propuesta/detalleMotivo/derivados.ts`:

```ts
import { pctFleteSobreCompra, pctVsCompetidor, type ValoresMotivo } from './validadores'

export interface IDerivado {
    texto: string
    /** `bueno` = verde, `advertencia` = ámbar. Un tono y no una clase de Tailwind para que el
     *  color lo elija el que dibuja, no cada fórmula. */
    tono: 'bueno' | 'advertencia'
}

/**
 * La línea calculada que va debajo del formulario, por `codigo` del motivo.
 *
 * Es LO ÚNICO que queda en código por motivo, y es deliberado: una fórmula, una frase y un
 * color condicional no se pueden expresar como dato sin inventar un mini-lenguaje de
 * expresiones — ver "Por qué el formulario NO se define en la base" en el spec.
 *
 * Un motivo cuyo `codigo` no está acá (o que no tiene `codigo`) dibuja sus campos igual, sin
 * línea derivada. Sumar un motivo con cálculo es una entrada acá; sumarle un campo a uno
 * existente NO toca este archivo.
 */
export const registroDerivado: Record<string, (v: ValoresMotivo) => IDerivado | null> = {
    // Verde cuando somos más baratos, ámbar cuando no: el vendedor tiene que ver de qué lado
    // está parado ANTES de ofrecer, no después.
    PRECIO: valores => {
        const pct = pctVsCompetidor(valores)
        if (pct === null) return null
        return {
            texto: `${pct.toFixed(1)}% más ${pct <= 0 ? 'barato' : 'caro'} que el competidor`,
            tono: pct <= 0 ? 'bueno' : 'advertencia',
        }
    },
    // "$60.000 de flete" no dice nada solo; "el 2% de la compra" sí.
    FLETE: valores => {
        const pct = pctFleteSobreCompra(valores)
        if (pct === null) return null
        return {
            texto: `El flete representa el ${pct.toFixed(1)}% de la compra`,
            tono: 'advertencia',
        }
    },
}
```

- [ ] **Step 5: Crear el renderizador**

Crear `src/components/propuesta/detalleMotivo/DetalleMotivo.tsx`:

```tsx
import { CampoMotivo } from './campos'
import { registroDerivado } from './derivados'
import type { ValoresMotivo } from './validadores'
import type { ICatalogoItem, IMotivo } from '@/types/planificacion'

const TONO: Record<string, string> = {
    bueno: 'bg-[#EAFBF1] text-[#047857]',
    advertencia: 'bg-[#FEF9E8] text-[#B45309]',
}

interface DetalleMotivoProps {
    motivo: IMotivo
    valores: ValoresMotivo
    /** Recibe SOLO el campo que cambió; el llamador hace el merge. */
    onChange: (parcial: ValoresMotivo) => void
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
}

/** El detalle de un motivo, dibujado desde su declaración. Reemplaza a los cuatro Editors
 *  hardcodeados: agregar o quitar un campo dejó de ser un cambio de código. */
export default function DetalleMotivo({
    motivo,
    valores,
    onChange,
    marcas,
    marcasLoading,
}: DetalleMotivoProps) {
    // `campos` viene ordenado por el back; acá no se reordena.
    const derivar = motivo.codigo ? registroDerivado[motivo.codigo] : undefined
    const derivado = derivar ? derivar(valores) : null

    return (
        <div className="flex flex-col gap-2.5">
            {motivo.campos.map(declaracion => (
                <CampoMotivo
                    key={declaracion.campo}
                    declaracion={declaracion}
                    valor={valores[declaracion.campo] ?? null}
                    onChange={valor => onChange({ [declaracion.campo]: valor })}
                    marcas={marcas}
                    marcasLoading={marcasLoading}
                />
            ))}

            {derivado && (
                <p
                    className={`rounded-[10px] px-3 py-2 text-center text-[12.5px] font-bold ${
                        TONO[derivado.tono]
                    }`}
                >
                    {derivado.texto}
                </p>
            )}
        </div>
    )
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

```bash
npx vitest run src/components/propuesta/detalleMotivo/DetalleMotivo.test.tsx
npx tsc -b
```

Expected: PASS (12 tests) y `tsc` limpio.

- [ ] **Step 7: Commit**

```bash
git add src/components/propuesta/detalleMotivo/campos.tsx \
        src/components/propuesta/detalleMotivo/derivados.ts \
        src/components/propuesta/detalleMotivo/DetalleMotivo.tsx \
        src/components/propuesta/detalleMotivo/DetalleMotivo.test.tsx
git commit -m "feat(resolucion): renderizador generico del detalle y registro de derivados"
```

---

### Task 4: Enchufar el renderizador y borrar los Editors

El wizard deja de preguntar por un módulo y pregunta por `campos`. Con eso los cuatro Editors y
el registro quedan sin consumidores y se borran.

**Files:**
- Modify: `src/components/propuesta/ResolucionOfrecimiento.tsx:4,141,145,172-184`
- Modify: `src/components/propuesta/detalleMotivo/validadores.ts` (sacar `IPropsEditorMotivo`)
- Delete: `src/components/propuesta/detalleMotivo/registro.ts`
- Delete: `src/components/propuesta/detalleMotivo/precio.tsx`, `plazo.tsx`, `flete.tsx`, `noTrabaja.tsx`
- Delete: `src/components/propuesta/detalleMotivo/precio.test.tsx`, `modulos.test.tsx`
- Test: `src/components/propuesta/ResolucionOfrecimiento.test.tsx`

**Interfaces:**
- Consumes: `DetalleMotivo` (Task 3), `IMotivo.campos` (Task 1).
- Produces: nada nuevo. Al terminar, `grep -rn "registroDetalleMotivo\|IPropsEditorMotivo" src/`
  tiene que salir vacío.

- [ ] **Step 1: Escribir el test que falla**

En `src/components/propuesta/ResolucionOfrecimiento.test.tsx`, agregar al final:

El archivo ya tiene un `motivos: IMotivo[]` compartido (líneas 8-14) y un helper `setup(value)`,
así que los tests nuevos los reusan. El motivo 20 es el que tiene `codigo: 'PRECIO'` y por lo
tanto la declaración que le puso la Task 1; el 21 tiene `codigo: null` y `campos: []`.

```tsx
it('un motivo con campos declarados dibuja su detalle al tildarlo', () => {
    setup([{ motivoId: 20, valores: {} }])

    // "Mi precio ($)" con la unidad entre paréntesis solo lo produce el renderizador
    // genérico: el Editor viejo rotulaba "Mi precio" a secas. Es lo que hace que este test
    // distinga una implementación de la otra y no pase por accidente.
    expect(screen.getByLabelText('Mi precio ($)')).toBeInTheDocument()
    expect(screen.getByLabelText('Precio del competidor ($)')).toBeInTheDocument()
})

it('un motivo sin campos declarados no dibuja detalle', () => {
    setup([{ motivoId: 21, valores: {} }])

    expect(screen.queryByLabelText(/mi precio/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/components/propuesta/ResolucionOfrecimiento.test.tsx`
Expected: FAIL en el primer test nuevo, con "Unable to find a label with the text of: Mi precio ($)".
El Editor viejo rotula "Mi precio" sin la unidad, así que la aserción exacta con el paréntesis
solo la puede satisfacer el renderizador nuevo.

- [ ] **Step 3: Enchufar el renderizador**

En `src/components/propuesta/ResolucionOfrecimiento.tsx`:

1. Reemplazar el import de la línea 4:

```tsx
import DetalleMotivo from './detalleMotivo/DetalleMotivo'
```

2. En `renderMotivo`, reemplazar la línea 141 (el lookup del Editor) por:

```tsx
        // "Pide detalle" es "tiene campos declarados", no "tiene codigo": un motivo nuevo con
        // campos y sin codigo pide detalle igual y se dibuja genérico.
        const pideDetalle = cat.campos.length > 0
```

3. En el `className` del `<div>` contenedor (línea 145), cambiar `Editor && on` por
   `pideDetalle && on`:

```tsx
                className={`flex flex-col gap-0 ${pideDetalle && on ? 'col-span-2' : ''}`}
```

4. Reemplazar el bloque del panel (líneas 172-184) por:

```tsx
                {on && pideDetalle && (
                    <div
                        className="animate-panel-in ml-8 mt-2 mb-0.5 rounded-[10px] border-[1.5px] bg-white p-2.5"
                        style={{ borderColor: color.border }}
                    >
                        <DetalleMotivo
                            motivo={cat}
                            valores={seleccionado!.valores}
                            onChange={parcial => setValores(cat.motivoId, parcial)}
                            marcas={marcas}
                            marcasLoading={marcasLoading}
                        />
                    </div>
                )}
```

- [ ] **Step 4: Borrar los Editors, el registro y sus tests**

```bash
rm src/components/propuesta/detalleMotivo/registro.ts \
   src/components/propuesta/detalleMotivo/precio.tsx \
   src/components/propuesta/detalleMotivo/plazo.tsx \
   src/components/propuesta/detalleMotivo/flete.tsx \
   src/components/propuesta/detalleMotivo/noTrabaja.tsx \
   src/components/propuesta/detalleMotivo/precio.test.tsx \
   src/components/propuesta/detalleMotivo/modulos.test.tsx
```

Y sacar de `src/components/propuesta/detalleMotivo/validadores.ts` la interfaz
`IPropsEditorMotivo` que la Task 2 dejó marcada como TRANSITORIO: ya no tiene consumidores.

- [ ] **Step 5: Verificar que no quedó ninguna referencia**

```bash
grep -rn "registroDetalleMotivo\|IPropsEditorMotivo\|EditorPrecio\|EditorPlazo\|EditorFlete\|EditorNoTrabaja" src/
```

Expected: sin resultados.

- [ ] **Step 6: Correr toda la suite, typecheck y lint**

```bash
npx vitest run
npx tsc -b
npx oxlint
```

Expected: todo verde. Los tests que fallen van a ser de fixtures a los que les falta la
declaración de campos (el detalle ya no se dibuja por `codigo`): agregarles `campos` con la
forma del Step 4 de la Task 1.

- [ ] **Step 7: Commit**

```bash
git add src/components/propuesta/ResolucionOfrecimiento.tsx \
        src/components/propuesta/ResolucionOfrecimiento.test.tsx \
        src/components/propuesta/detalleMotivo/validadores.ts
git add -u src
git commit -m "feat(resolucion): el detalle lo dibuja la declaracion, no un Editor por motivo"
```

---

## Qué NO hay que tocar (verificado)

- **`DetalleVisitaPanel.tsx`**: su `resumenValores` ya dibuja el histórico desde las filas
  guardadas sin consultar ningún módulo. Es exactamente la regla #1 del spec ("lo histórico se
  dibuja desde las filas guardadas, no desde el módulo vigente") y ya está cumplida.
- **`OfrecimientoTable.tsx:152`**: su `moduloDetalle.resumen(...)` viene de
  `registroDetalleAccion` — el registro de **acciones comerciales**, no de motivos. No tiene
  nada que ver con este cambio.
- **`resolucionDraft.ts`**: los borradores guardan `valores` por `campo` y esa forma no cambia.
  Un campo que desaparece de la declaración simplemente no se dibuja; el back lo descarta al
  persistir.
- **`numero.ts`** (`useCampoNumero`): se reusa tal cual en `CampoNumero`.

## Decisión tomada durante el relevamiento

El `resumen` de `validadoresDetalleMotivo` **era código muerto**: el único consumidor era su
propio test (`OfrecimientoTable` usa el registro de acciones, no éste). Por eso este plan **no
construye un resumen genérico ni un override de resumen por motivo** — YAGNI. Si más adelante
hace falta mostrar el detalle resumido en una tabla, la declaración ya tiene `unidad` para
armarlo.

Consecuencia: hoy `unidad` se consume en un solo lugar, el label del campo ("Mi precio ($)",
"Plazo solicitado (días)").

## Fuera de alcance

- **El backend**: es el plan de `api-vendedores`.
- **Vistas pivote para reportes** sobre los campos.
- **Un admin para editar la declaración**: hoy se toca por SQL.
