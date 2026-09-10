# Mostrar cliente quitado deshabilitado + restaurar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Nota:** este plan modifica el comportamiento de la feature "quitar cliente de la rotación
> actual" (spec `2026-09-09-quitar-cliente-rotacion-actual-design.md`, plan
> `2026-09-09-quitar-cliente-rotacion-actual.md`), ya implementada y commiteada en la rama
> `feat/quitar-cliente-rotacion-actual` de ambos repos. No hay spec nuevo — el diseño se acordó
> en conversación y se resume acá. Cruza dos repos: Tasks 1-4 son de `api-vendedores`, Tasks 5-8
> de `app-planificacion` (donde vive este mismo archivo también, en `docs/superpowers/plans/`).

**Goal:** Un cliente quitado de la rotación actual deja de desaparecer de la grilla: se sigue
mostrando en su celda, deshabilitado (sin drag, sin volver a ofrecer "Quitar"), y gerencia puede
deshacer el quite con un botón "Restaurar" — sin límite de tiempo, mientras la rotación siga
editable.

**Architecture:** El soft-delete (`deleted_at`/`deleted_by`) ya existe; el cambio es dejar de
filtrarlo en la lectura del grid (`findByRotacion`) y exponerlo como un campo `eliminado: boolean`
en la card. "Restaurar" es la operación inversa de "quitar": un método de repositorio nuevo
(`RotacionClienteRepository.restaurar`) que pone `deleted_at`/`deleted_by` en `NULL`, sin
rechequear resoluciones (una fila eliminada nunca pudo resolverse mientras estuvo eliminada, ya
que `mover`/`findById` ya la excluyen). Mismo patrón de servicio/ruta que "quitar".

**Tech Stack:** Backend: Node/TypeScript, Express, Sequelize, MySQL, Jest. Frontend: React 19,
TypeScript, @tanstack/react-query, axios, Vitest + Testing Library.

## Global Constraints

- **Sin límite de tiempo para restaurar** — la única condición es que la rotación siga editable
  (`abierta` o `programada`), igual que cualquier otra operación de este grid. No se agrega ningún
  chequeo de antigüedad.
- **No se rechequean resoluciones al restaurar.** Sería redundante: mientras una fila tiene
  `deleted_at` seteado, `RotacionClienteRepository.findById`/`mover` ya la excluyen de cualquier
  camino que pudiera generarle una resolución — es imposible que se haya resuelto en el medio.
- **`restaurar()` no recibe ni guarda usuario.** A diferencia de `quitar()` (que sí guarda
  `deleted_by`), deshacer un soft-delete no necesita auditar quién lo deshizo — el registro de que
  se restauró queda implícito en que `deleted_at` vuelve a `NULL`. Agregar un campo para eso sería
  complejidad sin un caso de uso que lo pida.
- **`eliminado` se computa con `Boolean(r.deletedAt)`, no `r.deletedAt !== null`.** Los fixtures de
  los tests existentes (`mover`, `intercambiarDias`, etc.) no incluyen `deletedAt` en sus objetos
  mock, así que `r.deletedAt` ahí es `undefined`. `undefined !== null` es `true` — marcaría como
  "eliminado" a filas que no lo están. `Boolean(undefined)` es `false`, el default correcto. Es el
  mismo patrón que ya usa `esExtra: Boolean(r.esExtra)` en el mismo mapper.
- Todos los tests de backend mockean Sequelize completo (sin DB real). Todos los tests de frontend
  mockean `@/api/planificacionAdmin` o `@dnd-kit/core` según corresponda — mismo patrón que ya usan
  `RotacionClienteRepository.spec.ts`, `GerenciaRotacionService.spec.ts`, `useRotacionAdmin.test.tsx`
  y `ClienteCardRuta.test.tsx`.

---

## Task 1: Backend — dejar de ocultar las filas eliminadas y exponer `eliminado`

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\repositories\RotacionClienteRepository.ts:58-67` (`findByRotacion`), `:636-645` (`toIRotacionCliente`)
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\types\planificacion.ts:150-159` (`IRotacionCliente`)
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\repositories\RotacionClienteRepository.spec.ts`

**Interfaces:**
- Produce: `IRotacionCliente.eliminado: boolean`, poblado por `toIRotacionCliente()`. `findByRotacion(rotacionId)` deja de excluir filas con `deletedAt` seteado. Task 3 (`GerenciaRotacionService.getRotacion`) consume este campo para armar la card.

**Nota importante:** `findById` (el que usan `mover`/`reacomodar`/`quitarCliente` para validar que la
fila esté "viva") **NO se toca en este task** — sigue excluyendo soft-deleteadas a propósito: una
fila quitada no se puede reacomodar ni volver a quitar, solo restaurar.

- [ ] **Step 1: Escribir el tipo nuevo**

En `src/types/planificacion.ts`, reemplazar:

```ts
export interface IRotacionCliente {
    id: number
    rotacionId: number
    codigoParticularCliente: string
    semana: number
    dia: number
    esExtra: boolean
}
```

por:

```ts
export interface IRotacionCliente {
    id: number
    rotacionId: number
    codigoParticularCliente: string
    semana: number
    dia: number
    esExtra: boolean
    /** true = tiene `deleted_at` seteado: quitada de esta rotación, se muestra deshabilitada. */
    eliminado: boolean
}
```

- [ ] **Step 2: Escribir el test que falla, para `findByRotacion`**

En `RotacionClienteRepository.spec.ts`, reemplazar el `describe('findByRotacion', ...)` existente:

```ts
describe('findByRotacion', () => {
    it('no trae filas soft-deleteadas', async () => {
        mockedFindAll.mockResolvedValue([])

        await RotacionClienteRepository.findByRotacion(7)

        expect(mockedFindAll).toHaveBeenCalledWith({
            where: { rotacionId: 7, deletedAt: null },
        })
    })
})
```

por:

```ts
describe('findByRotacion', () => {
    it('trae TODAS las filas de la rotación, incluidas las quitadas', async () => {
        // Al revés de antes: una fila quitada se sigue mostrando (deshabilitada), no
        // desaparece del grid — solo deja de contar para cobertura, y eso lo filtran
        // las queries de AnaliticaRepository, no esta.
        mockedFindAll.mockResolvedValue([])

        await RotacionClienteRepository.findByRotacion(7)

        expect(mockedFindAll).toHaveBeenCalledWith({ where: { rotacionId: 7 } })
    })

    it('mapea eliminado desde deletedAt', async () => {
        mockedFindAll.mockResolvedValue([
            { id: 11, rotacionId: 7, codigoParticularCliente: 'C001', semana: 1, dia: 1, deletedAt: null },
            {
                id: 12,
                rotacionId: 7,
                codigoParticularCliente: 'C002',
                semana: 1,
                dia: 2,
                deletedAt: new Date('2026-09-09T12:00:00.000Z'),
            },
        ] as any)

        const filas = await RotacionClienteRepository.findByRotacion(7)

        expect(filas.find(f => f.id === 11)?.eliminado).toBe(false)
        expect(filas.find(f => f.id === 12)?.eliminado).toBe(true)
    })
})
```

- [ ] **Step 3: Ejecutar y verificar que fallan**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts -t "findByRotacion"`
Expected: FAIL — el primer test porque el `where` todavía incluye `deletedAt: null`; el segundo
porque `toIRotacionCliente` no mapea `eliminado`.

- [ ] **Step 4: Aplicar los dos cambios**

En `RotacionClienteRepository.ts`, reemplazar:

```ts
    static async findByRotacion(rotacionId: number): Promise<IRotacionCliente[]> {
        try {
            const rows = await RotacionCliente.findAll({
                where: { rotacionId, deletedAt: null },
            })
            return rows.map(toIRotacionCliente)
        } catch (err) {
            throw new CustomError(500, `Error fetching plan de la rotación: ${err}`)
        }
    }
```

por:

```ts
    static async findByRotacion(rotacionId: number): Promise<IRotacionCliente[]> {
        try {
            const rows = await RotacionCliente.findAll({ where: { rotacionId } })
            return rows.map(toIRotacionCliente)
        } catch (err) {
            throw new CustomError(500, `Error fetching plan de la rotación: ${err}`)
        }
    }
```

Y reemplazar:

```ts
function toIRotacionCliente(r: RotacionCliente): IRotacionCliente {
    return {
        id: r.id,
        rotacionId: r.rotacionId,
        codigoParticularCliente: r.codigoParticularCliente,
        semana: r.semana,
        dia: r.dia,
        esExtra: Boolean(r.esExtra),
    }
}
```

por:

```ts
function toIRotacionCliente(r: RotacionCliente): IRotacionCliente {
    return {
        id: r.id,
        rotacionId: r.rotacionId,
        codigoParticularCliente: r.codigoParticularCliente,
        semana: r.semana,
        dia: r.dia,
        esExtra: Boolean(r.esExtra),
        eliminado: Boolean(r.deletedAt),
    }
}
```

- [ ] **Step 5: Ejecutar y verificar que pasan**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts -t "findByRotacion"`
Expected: PASS

- [ ] **Step 6: Ejecutar todo el archivo**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts`
Expected: PASS (el resto de los tests no se ve afectado: sus fixtures no traen `deletedAt`, y
`Boolean(undefined)` es `false`).

- [ ] **Step 7: Commit**

```bash
git add src/repositories/RotacionClienteRepository.ts src/repositories/RotacionClienteRepository.spec.ts src/types/planificacion.ts
git commit -m "$(cat <<'EOF'
feat(planificacion): findByRotacion deja de ocultar filas quitadas

Las filas con deleted_at siguen viniendo, marcadas con el nuevo
campo eliminado: boolean — el grid las va a mostrar deshabilitadas
en vez de hacerlas desaparecer.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Backend — `RotacionClienteRepository.restaurar()`

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\repositories\RotacionClienteRepository.ts`
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\repositories\RotacionClienteRepository.spec.ts`

**Interfaces:**
- Produce: `RotacionClienteRepository.findByIdIncluidoEliminado(id: number): Promise<IRotacionCliente | null>` — variante de `findById` que SÍ trae filas con `deletedAt` seteado (única consumidora: el chequeo de pertenencia a la rotación en `restaurarCliente`, Task 3).
- Produce: `RotacionClienteRepository.restaurar(id: number): Promise<void>` — 404 `FILA_NO_ELIMINADA` si la fila no existe o no está quitada; si no, pone `deletedAt`/`deletedBy` en `NULL`. Task 3 lo llama directo.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar en `RotacionClienteRepository.spec.ts`, después del `describe('quitar', ...)`:

```ts
describe('findByIdIncluidoEliminado', () => {
    it('trae una fila aunque tenga deletedAt seteado', async () => {
        mockedFindByPk.mockResolvedValue({
            id: 103, rotacionId: 7, codigoParticularCliente: '4412', semana: 2, dia: 3,
            deletedAt: new Date('2026-09-09T12:00:00.000Z'),
        } as any)

        const fila = await RotacionClienteRepository.findByIdIncluidoEliminado(103)

        expect(fila?.eliminado).toBe(true)
    })

    it('null si no existe', async () => {
        mockedFindByPk.mockResolvedValue(null)

        await expect(
            RotacionClienteRepository.findByIdIncluidoEliminado(999),
        ).resolves.toBeNull()
    })
})

describe('restaurar', () => {
    it('pone deletedAt y deletedBy en NULL', async () => {
        mockedFindOne.mockResolvedValue({
            id: 103, rotacionId: 7, codigoParticularCliente: '4412', semana: 2, dia: 3,
            deletedAt: new Date('2026-09-09T12:00:00.000Z'), deletedBy: 'jefe@distrisuper.com',
        } as any)
        mockedUpdate.mockResolvedValue([1])

        await RotacionClienteRepository.restaurar(103)

        expect(mockedFindOne).toHaveBeenCalledWith({
            where: { id: 103, deletedAt: { [Op.ne]: null } },
        })
        expect(mockedUpdate).toHaveBeenCalledWith(
            { deletedAt: null, deletedBy: null },
            { where: { id: 103 } },
        )
    })

    it('404 FILA_NO_ELIMINADA si la fila no está quitada (o no existe)', async () => {
        mockedFindOne.mockResolvedValue(null)

        await expect(
            RotacionClienteRepository.restaurar(999),
        ).rejects.toMatchObject({ statusCode: 404, details: { code: 'FILA_NO_ELIMINADA' } })
        expect(mockedUpdate).not.toHaveBeenCalled()
    })
})
```

Agregar `Op` al import de `'sequelize'` en la cabecera del archivo de test (`import { Op } from
'sequelize'`) — se usa para armar el `where` esperado del primer test de arriba, tal como lo
construye el código real de `restaurar()` (Step 3, más abajo).

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts -t "findByIdIncluidoEliminado|restaurar"`
Expected: FAIL — ninguno de los dos métodos existe todavía.

- [ ] **Step 3: Implementar ambos métodos**

Agregar en `RotacionClienteRepository.ts`, después del método `quitar()`:

```ts
    /**
     * Como `findById`, pero SIN excluir las filas soft-deleteadas. Única consumidora:
     * `GerenciaRotacionService.restaurarCliente`, que necesita validar "esta fila es de
     * esta rotación" sobre una fila que, por definición, ya tiene `deletedAt` seteado —
     * el `findById` normal la excluiría siempre, dando un 404 falso.
     */
    static async findByIdIncluidoEliminado(id: number): Promise<IRotacionCliente | null> {
        try {
            const row = await RotacionCliente.findByPk(id)
            return row ? toIRotacionCliente(row) : null
        } catch (err) {
            throw new CustomError(500, `Error fetching fila del plan: ${err}`)
        }
    }

    /**
     * Deshace `quitar()`. Sin límite de tiempo: mientras la rotación siga editable (lo
     * valida el servicio antes de llamar acá), gerencia puede arrepentirse.
     *
     * No rechequea resoluciones: una fila con `deletedAt` seteado es invisible para
     * `mover`/`findById`, así que es imposible que se haya resuelto mientras estuvo
     * eliminada. El chequeo que sí hace `quitar()` no tiene contraparte necesaria acá.
     */
    static async restaurar(id: number): Promise<void> {
        const fila = await RotacionCliente.findOne({
            where: { id, deletedAt: { [Op.ne]: null } },
        })
        if (!fila) {
            throw new CustomError(404, 'Este cliente no está quitado de esta rotación.', {
                code: 'FILA_NO_ELIMINADA',
            })
        }

        try {
            await RotacionCliente.update(
                { deletedAt: null, deletedBy: null },
                { where: { id } },
            )
        } catch (err) {
            throw new CustomError(500, `Error restaurando el cliente: ${err}`)
        }
    }
```

`Op` ya está importado en este archivo (`import { Op, QueryTypes, Transaction } from 'sequelize'`,
usado por `intercambiarDias`) — no hace falta agregar el import.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts -t "findByIdIncluidoEliminado|restaurar"`
Expected: PASS

- [ ] **Step 5: Ejecutar todo el archivo**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/repositories/RotacionClienteRepository.ts src/repositories/RotacionClienteRepository.spec.ts
git commit -m "$(cat <<'EOF'
feat(planificacion): RotacionClienteRepository.restaurar()

Deshace el soft-delete de quitar(): deleted_at/deleted_by vuelven a
NULL. Sin límite de tiempo, sin rechequeo de resoluciones (una fila
eliminada no puede haberse resuelto mientras estuvo eliminada).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Backend — `getRotacion` expone `eliminado` + `GerenciaRotacionService.restaurarCliente()`

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\services\planificacion\GerenciaRotacionService.ts`
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\services\planificacion\GerenciaRotacionService.spec.ts`
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\types\planificacion.ts` (`IAgendaClientAdmin`)

**Interfaces:**
- Consume: `RotacionClienteRepository.findByIdIncluidoEliminado`, `RotacionClienteRepository.restaurar` (Task 2).
- Produce: `IAgendaClientAdmin.eliminado: boolean`. `GerenciaRotacionService.restaurarCliente(vendedor: string, rotacionId: number, rotacionClienteId: number): Promise<void>` — Task 4 (controller) lo llama.

- [ ] **Step 1: Agregar el campo al tipo**

En `src/types/planificacion.ts`, reemplazar:

```ts
export interface IAgendaClientAdmin {
    rotacionClienteId: number
    codigoParticularCliente: string
    nombreCliente: string
    dia: number
    estado: EstadoCicloCliente
    ultimoMovimiento: IReacomodacionInfo | null
    esExtra: boolean
}
```

por:

```ts
export interface IAgendaClientAdmin {
    rotacionClienteId: number
    codigoParticularCliente: string
    nombreCliente: string
    dia: number
    estado: EstadoCicloCliente
    ultimoMovimiento: IReacomodacionInfo | null
    esExtra: boolean
    /** true = quitada de esta rotación (deleted_at seteado): se muestra deshabilitada. */
    eliminado: boolean
}
```

- [ ] **Step 2: Escribir el test que falla, para `getRotacion`**

En `GerenciaRotacionService.spec.ts`, actualizar el test `'recorta la card a lo que el grid dibuja, sin arrastrar la del vendedor'`
(dentro de `describe('getRotacion', ...)`) agregando `eliminado: true` al fixture de
`RotacionClienteRepository.findByRotacion` y `eliminado: false` al resultado esperado:

```ts
        ;(RotacionClienteRepository.findByRotacion as jest.Mock).mockResolvedValue([
            { id: 11, rotacionId: 7, codigoParticularCliente: 'C001', semana: 1, dia: 1, eliminado: false },
        ])
```

y el `toEqual` final del mismo test:

```ts
        expect(grid.semanas[0].dias.LUN[0]).toEqual({
            rotacionClienteId: 11,
            codigoParticularCliente: 'C001',
            nombreCliente: 'Kiosco Uno',
            dia: 1,
            estado: 'pendiente',
            ultimoMovimiento: null,
            eliminado: false,
        })
```

Agregar además, en el mismo `describe('getRotacion', ...)`, un test nuevo:

```ts
    it('marca eliminado=true en la card de una fila quitada', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue(rotacionAbierta)
        ;(RotacionSemanaRepository.semanasDelSet as jest.Mock).mockResolvedValue([1])
        ;(RotacionSemanaRepository.findDescripciones as jest.Mock).mockResolvedValue(
            new Map([[1, null]]),
        )
        ;(RotacionClienteRepository.findByRotacion as jest.Mock).mockResolvedValue([
            { id: 11, rotacionId: 7, codigoParticularCliente: 'C001', semana: 1, dia: 1, eliminado: true },
        ])
        ;(AgendaService.enriquecer as jest.Mock).mockResolvedValue([
            { rotacionClienteId: 11, codigoParticularCliente: 'C001', semana: 1, dia: 1, estado: 'pendiente' },
        ])
        ;(RotacionClienteRepository.findUltimosMovimientos as jest.Mock).mockResolvedValue(
            new Map(),
        )

        const grid = await GerenciaRotacionService.getRotacion('V 2', 7)

        expect(grid.semanas[0].dias.LUN[0].eliminado).toBe(true)
    })
```

- [ ] **Step 3: Ejecutar y verificar que fallan**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts -t "getRotacion"`
Expected: FAIL — la card no tiene `eliminado` todavía.

- [ ] **Step 4: Exponer `eliminado` en `getRotacion`**

En `GerenciaRotacionService.ts`, dentro de `getRotacion`, después de la línea:

```ts
        const semanaPorFila = new Map(filas.map(f => [f.id, f.semana]))
```

agregar:

```ts
        const eliminadoPorFila = new Map(filas.map(f => [f.id, f.eliminado]))
```

Y en la construcción de `card`, reemplazar:

```ts
            const card: IAgendaClientAdmin = {
                rotacionClienteId: cliente.rotacionClienteId,
                codigoParticularCliente: cliente.codigoParticularCliente,
                nombreCliente: cliente.nombreCliente,
                dia: cliente.dia,
                estado: cliente.estado,
                ultimoMovimiento: movimientos.get(cliente.rotacionClienteId) ?? null,
                esExtra: cliente.esExtra,
            }
```

por:

```ts
            const card: IAgendaClientAdmin = {
                rotacionClienteId: cliente.rotacionClienteId,
                codigoParticularCliente: cliente.codigoParticularCliente,
                nombreCliente: cliente.nombreCliente,
                dia: cliente.dia,
                estado: cliente.estado,
                ultimoMovimiento: movimientos.get(cliente.rotacionClienteId) ?? null,
                esExtra: cliente.esExtra,
                eliminado: eliminadoPorFila.get(cliente.rotacionClienteId) ?? false,
            }
```

(Se indexa desde `filas` —las filas crudas de `findByRotacion`, que sí traen `eliminado`— y no desde
`clientes` —lo que devuelve `AgendaService.enriquecer`, pensado para el self-service y que no
conoce este campo—, mismo patrón que ya usa `semanaPorFila`.)

- [ ] **Step 5: Ejecutar y verificar que pasan**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts -t "getRotacion"`
Expected: PASS

- [ ] **Step 6: Escribir los tests que fallan para `restaurarCliente`**

Agregar en `GerenciaRotacionService.spec.ts`, después del `describe('quitarCliente', ...)`:

```ts
describe('restaurarCliente', () => {
    beforeEach(() => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue(rotacionAbierta)
        ;(RotacionClienteRepository.findByIdIncluidoEliminado as jest.Mock).mockResolvedValue({
            id: 11,
            rotacionId: 7,
            semana: 1,
            dia: 1,
            eliminado: true,
        })
        ;(RotacionClienteRepository.restaurar as jest.Mock).mockResolvedValue(undefined)
    })

    it('restaura la fila', async () => {
        await GerenciaRotacionService.restaurarCliente('V 2', 7, 11)

        expect(RotacionClienteRepository.restaurar).toHaveBeenCalledWith(11)
    })

    it('404 si la fila es de otra rotación', async () => {
        ;(RotacionClienteRepository.findByIdIncluidoEliminado as jest.Mock).mockResolvedValue({
            id: 11,
            rotacionId: 99,
            semana: 1,
            dia: 1,
            eliminado: true,
        })

        await expect(
            GerenciaRotacionService.restaurarCliente('V 2', 7, 11),
        ).rejects.toMatchObject({ statusCode: 404, code: 'FILA_NOT_FOUND' })
        expect(RotacionClienteRepository.restaurar).not.toHaveBeenCalled()
    })

    it('404 si la fila no existe', async () => {
        ;(RotacionClienteRepository.findByIdIncluidoEliminado as jest.Mock).mockResolvedValue(null)

        await expect(
            GerenciaRotacionService.restaurarCliente('V 2', 7, 11),
        ).rejects.toMatchObject({ statusCode: 404, code: 'FILA_NOT_FOUND' })
    })

    it('409 si la rotación ya está cerrada', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue({
            ...rotacionAbierta,
            estado: 'cerrada',
        })

        await expect(
            GerenciaRotacionService.restaurarCliente('V 2', 7, 11),
        ).rejects.toMatchObject({ statusCode: 409, code: 'ROTACION_CERRADA' })
        expect(RotacionClienteRepository.restaurar).not.toHaveBeenCalled()
    })

    it('propaga el 404 FILA_NO_ELIMINADA del repositorio', async () => {
        ;(RotacionClienteRepository.restaurar as jest.Mock).mockRejectedValue(
            new CustomError(404, 'x', { code: 'FILA_NO_ELIMINADA' }),
        )

        await expect(
            GerenciaRotacionService.restaurarCliente('V 2', 7, 11),
        ).rejects.toMatchObject({ statusCode: 404, code: 'FILA_NO_ELIMINADA' })
    })
})
```

- [ ] **Step 7: Ejecutar y verificar que fallan**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts -t "restaurarCliente"`
Expected: FAIL con `GerenciaRotacionService.restaurarCliente is not a function`.

- [ ] **Step 8: Implementar `restaurarCliente()`**

Agregar en `GerenciaRotacionService.ts`, después del método `quitarCliente`:

```ts
    /**
     * Deshace `quitarCliente`. Mismas dos validaciones (rotación del vendedor, rotación
     * editable) — sin límite de tiempo, gerencia puede arrepentirse mientras la rotación
     * siga viva. `findByIdIncluidoEliminado` y no `findById`: la fila, por definición, ya
     * tiene `deletedAt` seteado, y `findById` la excluiría siempre.
     */
    static async restaurarCliente(
        vendedor: string,
        rotacionId: number,
        rotacionClienteId: number,
    ): Promise<void> {
        const rotacion = await GerenciaRotacionService.requireRotacionDe(
            vendedor,
            rotacionId,
        )
        GerenciaRotacionService.requireEditable(rotacion)

        const fila = await RotacionClienteRepository.findByIdIncluidoEliminado(
            rotacionClienteId,
        )
        if (!fila || fila.rotacionId !== rotacionId) {
            throw new CustomError(404, 'Cliente no encontrado en esta rotación.', {
                code: 'FILA_NOT_FOUND',
            })
        }

        await RotacionClienteRepository.restaurar(rotacionClienteId)
    }
```

- [ ] **Step 9: Ejecutar y verificar que pasan**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts -t "restaurarCliente"`
Expected: PASS

- [ ] **Step 10: Ejecutar todo el archivo**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/services/planificacion/GerenciaRotacionService.ts src/services/planificacion/GerenciaRotacionService.spec.ts src/types/planificacion.ts
git commit -m "$(cat <<'EOF'
feat(planificacion): getRotacion expone eliminado + GerenciaRotacionService.restaurarCliente()

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Backend — controller y ruta `PATCH .../rotacion-cliente/:id/restaurar`

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\controllers\planificacionController.ts`
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\routes\planificacion.ts`

**Interfaces:**
- Consume: `GerenciaRotacionService.restaurarCliente` (Task 3).
- Produce: `PlanificacionController.restaurarClienteComoGerencia(req, res)`, ruta
  `PATCH /planificacion/vendedores/:codigo/rotaciones/:rotacionId/rotacion-cliente/:id/restaurar`.
  Mismo criterio que `quitarClienteComoGerencia`/`reacomodarComoGerencia`: sin test dedicado de
  controller/ruta — el service ya está cubierto (Task 3), esto es solo parseo + delegación.

- [ ] **Step 1: Agregar el método al controller**

En `planificacionController.ts`, agregar después de `quitarClienteComoGerencia`:

```ts
    static async restaurarClienteComoGerencia(req: Request, res: Response): Promise<void> {
        try {
            const rotacionId = parseInt(req.params.rotacionId, 10)
            const rotacionClienteId = parseInt(req.params.id, 10)
            if (isNaN(rotacionId) || isNaN(rotacionClienteId)) {
                res.status(400).json({ ok: 0, error: 'id inválido' })
                return
            }

            await GerenciaRotacionService.restaurarCliente(
                req.params.codigo,
                rotacionId,
                rotacionClienteId,
            )
            res.status(200).json({ ok: 1 })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }
```

- [ ] **Step 2: Agregar la ruta**

En `routes/planificacion.ts`, agregar después de la ruta `DELETE .../rotacion-cliente/:id`:

```ts
// Deshace un "quitar": vuelve deleted_at/deleted_by a NULL. Sin límite de tiempo,
// mientras la rotación siga editable.
router.patch(
    '/vendedores/:codigo/rotaciones/:rotacionId/rotacion-cliente/:id/restaurar',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.restaurarClienteComoGerencia(req, res)
    },
)
```

- [ ] **Step 3: Verificar que el proyecto compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Probar manualmente con curl**

Con el servidor corriendo (`npm run dev`) y un `id` de una fila ya quitada (usar el flujo de
"Quitar" desde la UI primero, o el endpoint DELETE):

```bash
curl -X PATCH \
  "http://localhost:<puerto>/planificacion/vendedores/<codigo>/rotaciones/<rotacionId>/rotacion-cliente/<id>/restaurar" \
  -H "Authorization: Bearer <token>"
```

Expected: `{"ok":1}`. Una segunda llamada al mismo `id` devuelve 404 `FILA_NO_ELIMINADA` (ya no está
quitada).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/planificacionController.ts src/routes/planificacion.ts
git commit -m "$(cat <<'EOF'
feat(planificacion): PATCH rotacion-cliente/:id/restaurar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend — tipo + `restaurarClienteAdmin()` en la API

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\types\planificacion.ts` (`IAgendaClientAdmin`)
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\api\planificacionAdmin.ts`

**Interfaces:**
- Produce: `IAgendaClientAdmin.eliminado: boolean`. `restaurarClienteAdmin(codigo: string, rotacionId: number, rotacionClienteId: number): Promise<void>` — Task 6 lo consume.

- [ ] **Step 1: Agregar el campo al tipo**

En `src/types/planificacion.ts` (frontend), reemplazar:

```ts
export interface IAgendaClientAdmin {
    rotacionClienteId: number
    codigoParticularCliente: string
    nombreCliente: string
    dia: number
    estado: EstadoCicloCliente
    ultimoMovimiento: IReacomodacionInfo | null
    esExtra: boolean
}
```

por:

```ts
export interface IAgendaClientAdmin {
    rotacionClienteId: number
    codigoParticularCliente: string
    nombreCliente: string
    dia: number
    estado: EstadoCicloCliente
    ultimoMovimiento: IReacomodacionInfo | null
    esExtra: boolean
    /** true = quitada de esta rotación: se muestra deshabilitada, con botón "Restaurar". */
    eliminado: boolean
}
```

- [ ] **Step 2: Agregar la función a la API**

En `src/api/planificacionAdmin.ts`, agregar después de `quitarClienteAdmin`:

```ts
/** Deshace un "quitar" (soft-delete). Sin límite de tiempo mientras la rotación siga
 *  editable. */
export const restaurarClienteAdmin = async (
    codigo: string,
    rotacionId: number,
    rotacionClienteId: number,
): Promise<void> => {
    await apiClient.patch(
        `${base(codigo)}/${rotacionId}/rotacion-cliente/${rotacionClienteId}/restaurar`,
    )
}
```

- [ ] **Step 3: Verificar que el proyecto compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/types/planificacion.ts src/api/planificacionAdmin.ts
git commit -m "$(cat <<'EOF'
feat(planificacion): tipo eliminado + restaurarClienteAdmin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Frontend — `useRestaurarClienteAdmin()`

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\hooks\useRotacionAdmin.ts`
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\hooks\useRotacionAdmin.test.tsx`

**Interfaces:**
- Consume: `restaurarClienteAdmin` (Task 5).
- Produce: `useRestaurarClienteAdmin(codigo: string)` → mismo shape que `useQuitarClienteAdmin`:
  `mutate`/`mutateAsync` recibe `{ rotacionId: number; rotacionClienteId: number }`, invalida
  `rotacionAdminKeys.grid(codigo, rotacionId)` al terminar. Task 8 lo consume desde `RutaPage`.

- [ ] **Step 1: Escribir el test que falla**

Agregar en `useRotacionAdmin.test.tsx`, después del `describe('useQuitarClienteAdmin', ...)`:

```ts
describe('useRestaurarClienteAdmin', () => {
    it('restaura por rotación y fila, e invalida el grid', async () => {
        vi.mocked(api.restaurarClienteAdmin).mockResolvedValue(undefined)
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
        const w = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        )

        const { result } = renderHook(() => useRestaurarClienteAdmin('V 2'), { wrapper: w })
        await result.current.mutateAsync({ rotacionId: 7, rotacionClienteId: 11 })

        expect(api.restaurarClienteAdmin).toHaveBeenCalledWith('V 2', 7, 11)
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ['rotacionAdmin', 'V 2', 'grid', 7],
        })
    })
})
```

Y agregar `useRestaurarClienteAdmin` al import desde `./useRotacionAdmin` arriba del archivo.

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/hooks/useRotacionAdmin.test.tsx -t "useRestaurarClienteAdmin"`
Expected: FAIL — `useRestaurarClienteAdmin` no existe.

- [ ] **Step 3: Implementar el hook**

En `src/hooks/useRotacionAdmin.ts`:

1. Agregar `restaurarClienteAdmin` al import desde `@/api/planificacionAdmin`.
2. Agregar, después de `useQuitarClienteAdmin`:

```ts
/** Deshace un "quitar". Mismo patrón que useQuitarClienteAdmin: sin optimistic update,
 *  el bloqueo (404 FILA_NO_ELIMINADA si alguien más ya la restauró) es un caso esperado. */
export function useRestaurarClienteAdmin(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number; rotacionClienteId: number }) =>
            restaurarClienteAdmin(codigo, args.rotacionId, args.rotacionClienteId),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
        },
    })
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run src/hooks/useRotacionAdmin.test.tsx -t "useRestaurarClienteAdmin"`
Expected: PASS

- [ ] **Step 5: Ejecutar todo el archivo**

Run: `npx vitest run src/hooks/useRotacionAdmin.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useRotacionAdmin.ts src/hooks/useRotacionAdmin.test.tsx
git commit -m "$(cat <<'EOF'
feat(planificacion): useRestaurarClienteAdmin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend — `ClienteCardRuta` muestra eliminado deshabilitado + botón "Restaurar"

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\components\ruta\ClienteCardRuta.tsx`
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\components\ruta\ClienteCardRuta.test.tsx`

**Interfaces:**
- Produce: prop nueva `onRestaurar?: (rotacionClienteId: number) => void`. Task 8 la conecta.
- `cliente.eliminado === true` implica: sin drag, sin botón "Quitar de esta vuelta", con botón
  "Restaurar" (si `onRestaurar` está presente), chip visual "Quitado", y `data-eliminado="true"`.

- [ ] **Step 1: Escribir los tests que fallan**

Primero, actualizar el fixture `CLIENTE` (agregar el campo, aunque el cast `as unknown as
IAgendaClientAdmin` ya tolera su ausencia — se agrega por claridad):

```ts
const CLIENTE = {
    rotacionClienteId: 11,
    codigoCliente: 'C001',
    codigoParticularCliente: 'P001',
    nombreCliente: 'KIOSCO DON JUAN',
    dia: 1,
    estado: 'pendiente',
    visitaId: null,
    ofrecimientosPendientes: 0,
    ultimoMovimiento: null,
    eliminado: false,
} as unknown as IAgendaClientAdmin
```

Agregar, al final del `describe('ClienteCardRuta', ...)`:

```ts
    it('una card eliminada se muestra deshabilitada, sin drag y sin "Quitar"', () => {
        render(
            <ClienteCardRuta
                cliente={{ ...CLIENTE, eliminado: true }}
                onQuitar={() => {}}
                onRestaurar={() => {}}
            />,
        )

        expect(screen.getByTestId('card-cliente-11')).toHaveAttribute(
            'data-eliminado',
            'true',
        )
        expect(
            screen.queryByRole('button', { name: /quitar de esta vuelta/i }),
        ).not.toBeInTheDocument()
    })

    it('una card eliminada no es arrastrable (useDraggable recibe disabled: true)', () => {
        render(
            <ClienteCardRuta
                cliente={{ ...CLIENTE, eliminado: true }}
                onRestaurar={() => {}}
            />,
        )

        const llamada = vi.mocked(useDraggable).mock.calls.at(-1)?.[0]
        expect(llamada).toMatchObject({ disabled: true })
    })

    it('muestra "Restaurar" solo si está eliminada y hay callback', () => {
        const { rerender } = render(
            <ClienteCardRuta cliente={{ ...CLIENTE, eliminado: true }} onRestaurar={() => {}} />,
        )
        expect(
            screen.getByRole('button', { name: /restaurar/i }),
        ).toBeInTheDocument()

        rerender(<ClienteCardRuta cliente={{ ...CLIENTE, eliminado: true }} />)
        expect(screen.queryByRole('button', { name: /restaurar/i })).not.toBeInTheDocument()

        rerender(<ClienteCardRuta cliente={CLIENTE} onRestaurar={() => {}} />)
        expect(screen.queryByRole('button', { name: /restaurar/i })).not.toBeInTheDocument()
    })

    it('restaurar llama a onRestaurar sin pedir confirmación', () => {
        const onRestaurar = vi.fn()
        const confirmSpy = vi.spyOn(window, 'confirm')
        render(
            <ClienteCardRuta cliente={{ ...CLIENTE, eliminado: true }} onRestaurar={onRestaurar} />,
        )

        screen.getByRole('button', { name: /restaurar/i }).click()

        expect(onRestaurar).toHaveBeenCalledWith(11)
        expect(confirmSpy).not.toHaveBeenCalled()
    })

    it('corta la propagación del pointerdown en el botón de restaurar', () => {
        const onPointerDownDelDrag = vi.fn()
        vi.mocked(useDraggable).mockReturnValueOnce({
            attributes: {},
            listeners: { onPointerDown: onPointerDownDelDrag },
            setNodeRef: () => {},
            transform: null,
            isDragging: false,
        } as unknown as ReturnType<typeof useDraggable>)

        render(
            <ClienteCardRuta cliente={{ ...CLIENTE, eliminado: true }} onRestaurar={() => {}} />,
        )
        fireEvent.pointerDown(screen.getByRole('button', { name: /restaurar/i }))

        expect(onPointerDownDelDrag).not.toHaveBeenCalled()
    })
```

(El test de "no es arrastrable" verifica el ARGUMENTO con el que se llamó `useDraggable` —no su
valor de retorno—, por eso usa `mock.calls` y no `mockReturnValueOnce` como el de `stopPropagation`
más abajo.)

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/components/ruta/ClienteCardRuta.test.tsx`
Expected: FAIL en los tests nuevos — ni el prop `onRestaurar`, ni `data-eliminado`, ni la lógica de
deshabilitado existen todavía.

- [ ] **Step 3: Implementar el cambio completo**

En `ClienteCardRuta.tsx`, reemplazar el archivo completo por:

```tsx
import { useDraggable } from '@dnd-kit/core'
import { titleCaseNombre } from '@/lib/textFormat'
import { estaResuelto } from '@/lib/estadoCiclo'
import { fechaHoraNegocio } from '@/lib/fechas'
import type { IAgendaClientAdmin } from '@/types/planificacion'

interface ClienteCardRutaProps {
    cliente: IAgendaClientAdmin
    /** false = solo lectura (rotación cerrada, o fila ya resuelta/eliminada). */
    arrastrable?: boolean
    /** Ausente = no se ofrece quitar (ej. dentro de ColaRotaciones, o rotación no editable). */
    onQuitar?: (rotacionClienteId: number) => void
    /** Ausente = no se ofrece restaurar. Solo tiene efecto si `cliente.eliminado` es true. */
    onRestaurar?: (rotacionClienteId: number) => void
}

/**
 * La card del grid de gerencia.
 *
 * NO reusa `ClienteCard` (la de la agenda del vendedor) a propósito: esa exige cuatro
 * callbacks del ciclo de la visita —`onAbrir`, `onEstadoVisita`, `onIniciarVisita`,
 * `onAbrirAppExterna`— que acá no significan nada. Gerencia no inicia visitas ni abre
 * Versus: mueve clientes de casillero. Pasarle handlers vacíos para reusarla habría dejado
 * botones muertos en pantalla.
 */
export default function ClienteCardRuta({
    cliente,
    arrastrable,
    onQuitar,
    onRestaurar,
}: ClienteCardRutaProps) {
    const resuelto = estaResuelto(cliente.estado)

    const autoria = cliente.ultimoMovimiento
        ? `Movió ${cliente.ultimoMovimiento.origen} (${cliente.ultimoMovimiento.usuario}) el ${fechaHoraNegocio(cliente.ultimoMovimiento.fecha)}`
        : null

    // Una fila resuelta o ya eliminada nunca es arrastrable: el backend rechaza mover
    // cualquiera de las dos (FILA_RESUELTA, y una eliminada ni siquiera aparece para
    // `mover`/`findById`), y dejarla arrastrable ofrecería una acción que va a fallar.
    const puedeMoverse = (arrastrable ?? true) && !resuelto && !cliente.eliminado

    // Estricto por 'pendiente' y no por !resuelto: 'en_curso' NO cuenta como resuelto,
    // pero el backend igual rechaza quitarla con 409 VISITA_EN_CURSO. Mostrar el botón
    // ahí ofrecería una acción que siempre falla. `!cliente.eliminado` porque una fila ya
    // quitada no se puede volver a quitar — ahí se ofrece "Restaurar" en su lugar.
    const puedeQuitarse =
        onQuitar !== undefined && cliente.estado === 'pendiente' && !cliente.eliminado
    const puedeRestaurarse = onRestaurar !== undefined && cliente.eliminado

    const confirmarQuitar = () => {
        const ok = window.confirm(
            `¿Quitar a ${titleCaseNombre(cliente.nombreCliente)} de esta vuelta? Vuelve a aparecer en la próxima rotación.`,
        )
        if (ok) onQuitar!(cliente.rotacionClienteId)
    }

    // Restaurar no pide confirmación: es la acción de "deshacer", no una destructiva —
    // pedirle al usuario que confirme un undo es fricción sin beneficio.
    const restaurar = () => onRestaurar!(cliente.rotacionClienteId)

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `card-${cliente.rotacionClienteId}`,
        disabled: !puedeMoverse,
    })

    return (
        <div
            ref={setNodeRef}
            {...(puedeMoverse ? { ...listeners, ...attributes } : {})}
            style={
                transform
                    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
                    : undefined
            }
            data-testid={`card-cliente-${cliente.rotacionClienteId}`}
            // Una fila ya resuelta no se puede mover: el backend la rechaza con
            // FILA_RESUELTA. Se marca en el DOM para que el grid la excluya del drag.
            data-resuelto={resuelto ? 'true' : 'false'}
            // Igual criterio para una fila quitada de esta rotación.
            data-eliminado={cliente.eliminado ? 'true' : 'false'}
            className={`relative rounded-md border px-2 py-1.5 text-xs ${
                resuelto || cliente.eliminado
                    ? 'border-slate-200 bg-slate-100 text-slate-500'
                    : 'border-slate-300 bg-white text-slate-800'
            } ${isDragging ? 'opacity-50' : ''} ${puedeMoverse ? 'cursor-grab' : ''}`}
        >
            {puedeQuitarse && (
                <button
                    type="button"
                    aria-label={`Quitar de esta vuelta: ${titleCaseNombre(cliente.nombreCliente)}`}
                    onClick={confirmarQuitar}
                    // El botón vive DENTRO del div arrastrable: sin cortar la propagación,
                    // el pointerdown burbujea hasta los listeners de dnd-kit (enganchados en
                    // el div) y lo que arranca es un drag, no el click — el puntero queda
                    // capturado por el sensor y confirmarQuitar() nunca se ejecuta.
                    onPointerDown={e => e.stopPropagation()}
                    className="absolute right-1 top-1 rounded px-1 text-[11px] text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                    ✕
                </button>
            )}
            {puedeRestaurarse && (
                <button
                    type="button"
                    aria-label={`Restaurar: ${titleCaseNombre(cliente.nombreCliente)}`}
                    onClick={restaurar}
                    onPointerDown={e => e.stopPropagation()}
                    className="absolute right-1 top-1 rounded px-1 text-[11px] font-medium text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                >
                    Restaurar
                </button>
            )}
            <p className="font-medium leading-tight pr-4">
                {titleCaseNombre(cliente.nombreCliente)}
            </p>
            <div className="mt-0.5 flex items-center justify-between gap-1">
                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    {cliente.codigoParticularCliente}
                    {cliente.esExtra && (
                        <span className="inline-flex items-center rounded-full bg-[#E0E7FF] px-1 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#3730A3]">
                            Agregado
                        </span>
                    )}
                    {cliente.eliminado && (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-1 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-red-700">
                            Quitado
                        </span>
                    )}
                </span>
                {autoria && (
                    <span
                        title={autoria}
                        aria-label={autoria}
                        className="cursor-help text-[11px] text-slate-400"
                    >
                        ✎
                    </span>
                )}
            </div>
        </div>
    )
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx vitest run src/components/ruta/ClienteCardRuta.test.tsx`
Expected: PASS (todos los tests, nuevos y viejos).

- [ ] **Step 5: Commit**

```bash
git add src/components/ruta/ClienteCardRuta.tsx src/components/ruta/ClienteCardRuta.test.tsx
git commit -m "$(cat <<'EOF'
feat(ruta): mostrar cliente eliminado deshabilitado + botón Restaurar

En vez de desaparecer, la card de un cliente quitado se sigue
mostrando en su celda: sin drag, sin "Quitar" (ya no aplica), con
chip "Quitado" y un botón "Restaurar" que deshace el soft-delete sin
pedir confirmación (es un undo, no una acción destructiva).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Frontend — wiring `GridRotacion` → `RutaPage` + verificación manual

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\components\ruta\GridRotacion.tsx`
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\pages\RutaPage.tsx`

**Interfaces:**
- Consume: `onRestaurar` de `ClienteCardRuta` (Task 7), `useRestaurarClienteAdmin` (Task 6).
- Produce: `GridRotacionProps.onRestaurar?: (rotacionClienteId: number) => void`, propagada hasta
  cada `ClienteCardRuta`, con el mismo gating por `arrastrable` que ya usa `onQuitar` (si la
  rotación no es editable, tampoco se ofrece restaurar).

Sin tests de componente nuevos (mismo criterio que el wiring de `onQuitar`, Task 10 del plan
anterior): es propagación de props sin lógica, cubierta por los tests de `ClienteCardRuta` (Task 7)
y la verificación manual de este task.

- [ ] **Step 1: Propagar `onRestaurar` por `GridRotacion`**

En `GridRotacion.tsx`, agregar a `GridRotacionProps`:

```ts
interface GridRotacionProps {
    semanas: ISemanaRotacionAdmin[]
    onMover: (rotacionClienteId: number, semana: number, dia: number) => void
    onRenombrarSemana: (semana: number, descripcion: string | null) => void
    onIntercambiar: (a: Celda, b: Celda) => void
    /** Ausente = no se ofrece quitar (rotación no editable). */
    onQuitar?: (rotacionClienteId: number) => void
    /** Ausente = no se ofrece restaurar (rotación no editable). */
    onRestaurar?: (rotacionClienteId: number) => void
    /** false = rotación cerrada: se ve pero no se toca. */
    editable?: boolean
}
```

Agregar `onRestaurar` a `CeldaProps`:

```ts
interface CeldaProps {
    semana: number
    dia: Dia
    clientes: IAgendaClientAdmin[]
    arrastrable: boolean
    /** false = rotación cerrada: no se ofrece intercambiar. */
    intercambiable: boolean
    /** Esta celda es el origen del intercambio en curso. */
    esOrigen: boolean
    /** Hay un intercambio empezado en OTRA celda: esta es un destino posible. */
    esDestinoPosible: boolean
    onTocarIntercambio: (celda: { semana: number; dia: number }) => void
    /** Ausente = no se ofrece quitar en esta celda. */
    onQuitar?: (rotacionClienteId: number) => void
    /** Ausente = no se ofrece restaurar en esta celda. */
    onRestaurar?: (rotacionClienteId: number) => void
}
```

En `Celda`, agregar `onRestaurar` a los parámetros y pasarlo a cada card (mismo gating por
`arrastrable` que ya usa `onQuitar`):

```tsx
function Celda({
    semana,
    dia,
    clientes,
    arrastrable,
    intercambiable,
    esOrigen,
    esDestinoPosible,
    onTocarIntercambio,
    onQuitar,
    onRestaurar,
}: CeldaProps) {
```

```tsx
            {clientes.map(cliente => (
                <ClienteCardRuta
                    key={cliente.rotacionClienteId}
                    cliente={cliente}
                    arrastrable={arrastrable}
                    onQuitar={arrastrable ? onQuitar : undefined}
                    onRestaurar={arrastrable ? onRestaurar : undefined}
                />
            ))}
```

En `GridRotacion`, agregar `onRestaurar` a los parámetros y pasarlo a cada `<Celda>`:

```tsx
export default function GridRotacion({
    semanas,
    onMover,
    onRenombrarSemana,
    onIntercambiar,
    onQuitar,
    onRestaurar,
    editable,
}: GridRotacionProps) {
```

```tsx
                                <Celda
                                    key={dia}
                                    semana={semana.semana}
                                    dia={dia}
                                    clientes={semana.dias[dia]}
                                    arrastrable={editable ?? true}
                                    intercambiable={editable ?? true}
                                    esOrigen={
                                        origen?.semana === semana.semana &&
                                        origen?.dia === DIAS.indexOf(dia) + 1
                                    }
                                    esDestinoPosible={
                                        origen !== null &&
                                        !(
                                            origen.semana === semana.semana &&
                                            origen.dia === DIAS.indexOf(dia) + 1
                                        )
                                    }
                                    onTocarIntercambio={tocarCelda}
                                    onQuitar={onQuitar}
                                    onRestaurar={onRestaurar}
                                />
```

- [ ] **Step 2: Conectar el hook en `RutaPage`**

En `RutaPage.tsx`, agregar el import y la instancia del hook:

```ts
import {
    useCancelarRotacion,
    useCrearRotacion,
    useEditarDescripcionRotacion,
    useEditarDescripcionSemana,
    useIntercambiarDias,
    useQuitarClienteAdmin,
    useReacomodarAdmin,
    useReordenarRotacion,
    useRestaurarClienteAdmin,
    useRotacion,
    useRotaciones,
} from '@/hooks/useRotacionAdmin'
```

```ts
    const quitar = useQuitarClienteAdmin(vendedor ?? '')
    const restaurar = useRestaurarClienteAdmin(vendedor ?? '')
```

Pasar la prop al `<GridRotacion>`, después de `onQuitar`:

```tsx
                        onQuitar={rotacionClienteId =>
                            quitar.mutate({ rotacionId: grid.id, rotacionClienteId })
                        }
                        onRestaurar={rotacionClienteId =>
                            restaurar.mutate({ rotacionId: grid.id, rotacionClienteId })
                        }
                    />
```

- [ ] **Step 3: Mostrar el error de bloqueo**

Agregar, después del bloque `{quitar.isError && (...)}`:

```tsx
                {restaurar.isError && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        No se pudo restaurar ese cliente. Probá de nuevo en un momento.
                    </p>
                )}
```

- [ ] **Step 4: Verificar manualmente en el navegador**

Run: `npm run dev` (desde `C:\Users\matia\Documents\distrisuper\app-planificacion`)

1. Ir a `/analitica/ruta`, elegir un vendedor con una rotación abierta.
2. Quitar un cliente pendiente (botón "✕", confirmar).
3. Verificar que la card **sigue en su celda**, grayed, con chip "Quitado" y sin poder arrastrarla.
4. Verificar que aparece el botón "Restaurar" y que "Quitar de esta vuelta" ya no está.
5. Click en "Restaurar" — no debería pedir confirmación.
6. Verificar que la card vuelve a verse normal (sin chip, arrastrable, con "Quitar de esta vuelta"
   de nuevo) sin recargar la página.
7. Recargar la página (F5) y confirmar que el estado restaurado persistió.

- [ ] **Step 5: Ejecutar toda la suite de frontend**

Run: `npx vitest run`
Expected: PASS (todos los tests del proyecto, sin regresiones).

- [ ] **Step 6: Commit**

```bash
git add src/components/ruta/GridRotacion.tsx src/pages/RutaPage.tsx
git commit -m "$(cat <<'EOF'
feat(ruta): conectar "Restaurar" en la grilla de gerencia

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verificación final

- [ ] Backend: `npx jest` completo desde `api-vendedores` → PASS.
- [ ] Frontend: `npx vitest run` completo desde `app-planificacion` → PASS.
- [ ] `npx tsc --noEmit` en ambos repos → sin errores.
- [ ] Flujo manual completo: quitar → se ve deshabilitado en su celda → restaurar → vuelve a la
  normalidad, todo sin recargar la página y persistiendo tras un F5.
