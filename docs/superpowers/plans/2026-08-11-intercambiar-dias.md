# Intercambiar dos días completos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que gerencia pueda permutar todos los clientes de un día por los de otro (incluso de otra semana) en una sola operación, en vez de arrastrarlos uno por uno.

**Architecture:** Una primitiva nueva de dominio, no un atajo de UI. Un endpoint que recibe las dos celdas y hace el swap en UNA transacción, escribiendo una fila de bitácora por cliente movido. En el front, el encabezado del día entra en modo "elegí el destino" y el segundo click confirma — así el intercambio entre semanas sale gratis, sin un menú de 25 opciones.

**Tech Stack:** Backend: TypeScript, Express, Sequelize (MySQL), Jest. Front: React 19, React Query, Vitest.

## Por qué existe esta feature

Hoy un intercambio no es tedioso, es **imposible de hacer bien**. Medido sobre la rotación real de `V 2`: los días tienen entre 5 y 11 clientes y **los 5 días están ocupados en las 5 semanas**, así que no hay celda libre como espacio temporal. Tampoco se puede usar una semana fantasma: desde que `pl_rotacion_semana` es el set autoritativo, reacomodar fuera del set rebota 422.

Y si se arrastra el martes (10) al jueves (8), el jueves queda con 18 **mezclados**: para devolver los 8 originales hay que recordar de memoria cuáles eran, porque la UI no los distingue. Mover un cliente y permutar un día son dos intenciones distintas; hoy solo existe la primera.

## Global Constraints

- **Dos repos, dos worktrees.** Cada tarea dice en cuál se trabaja:
  - Backend: `C:/Users/matia/orca/workspaces/api-vendedores/MatiasH11-plan-rotacion-editable` (rama `MatiasH11/plan-rotacion-editable`). Tests: **Jest** — `npm test`, `npx jest ruta.spec.ts`. Compilar: `npx tsc --noEmit`.
  - Front: `C:/Users/matia/orca/workspaces/app-planificacion/MatiasH11-plan-rotacion-editable-front` (rama `MatiasH11/plan-rotacion-editable-front`). Tests: **Vitest** — `npm test`, `npx vitest run ruta.test.tsx`. Compilar: `npx tsc -b` (corré este comando **sin pipe**: `npx tsc -b | head` devuelve exit 0 aunque falle).
  - Las tareas 1-2 son backend, 3-4 front. El front depende del contrato que fija la tarea 2.
- **Un día con clientes ya resueltos NO se intercambia: se rechaza el intercambio completo**, nombrando los bloqueantes. Decisión tomada: un swap parcial deja un estado que nadie pidió (ni el origen ni el destino quedan como estaban ni como se quería) y encima parece que funcionó. En una rotación `programada` no hay nada resuelto, y es donde gerencia planifica.
- **Una fila de `pl_reacomodacion` por cliente movido.** La operación es una sola intención, pero la auditoría es por fila: es lo que alimenta el reporte de excepciones repetidas. Con `origen='gerencia'` y `usuario = user.email ?? String(user.id)`, igual que el resto.
- **`pl_rotacion_cliente` no tiene unique sobre `(rotacion_id, semana, dia)`** — solo `uq_rotacion_cliente (rotacion_id, codigo_particular_cliente)` e `idx_semana`. Por eso los UPDATE del swap **no colisionan** y no hace falta valor temporal (a diferencia del `orden` de la cola).
- **El error nombra clientes usando la caché del front**, no el backend: la API devuelve los `codigoParticularCliente` bloqueados y el front los mapea a nombres con el grid que ya tiene. Evita una consulta al warehouse en el camino de error.
- **Códigos de error nuevos:** `DIA_CON_RESUELTOS` (409), `CELDAS_IGUALES` (400). Los existentes que se reusan: `ROTACION_NOT_FOUND`, `ROTACION_CERRADA`, `SEMANA_FUERA_DEL_SET`, `DIA_INVALIDO`.
- Plan previo del que esto cuelga: `2026-08-11-backend-vista-gerencia-rotacion.md` y `2026-08-11-frontend-vista-gerencia-rotacion.md`.

## File Structure

**Backend, modificados:**
- `src/repositories/RotacionClienteRepository.ts` (+`.spec.ts`) — la primitiva transaccional.
- `src/services/planificacion/GerenciaRotacionService.ts` (+`.spec.ts`) — validaciones.
- `src/controllers/planificacionController.ts` — handler.
- `src/routes/planificacion.ts` — ruta.
- `src/types/planificacion.ts` — DTO.

**Front, modificados:**
- `src/api/planificacionAdmin.ts` (+`.test.ts`)
- `src/hooks/useRotacionAdmin.ts` (+`.test.tsx`)
- `src/components/ruta/GridRotacion.tsx` (+`.test.tsx`) — encabezados accionables y modo de selección.
- `src/pages/RutaPage.tsx` — enchufa la mutation y el error.
- `src/types/planificacion.ts`

---

### Task 1 (BACKEND): la primitiva transaccional de intercambio

**Working dir:** `C:/Users/matia/orca/workspaces/api-vendedores/MatiasH11-plan-rotacion-editable`

**Files:**
- Modify: `src/repositories/RotacionClienteRepository.ts`
- Test: `src/repositories/RotacionClienteRepository.spec.ts`

**Interfaces:**
- Consumes: `Reacomodacion` y `RotacionCliente` (modelos ya existentes), `OrigenMovimiento`.
- Produces:
  - `RotacionClienteRepository.findResueltasEntre(ids: number[]): Promise<number[]>` — los `rotacionClienteId` que ya tienen resolución.
  - `RotacionClienteRepository.intercambiarDias(args): Promise<number>` — devuelve cuántas filas movió. Firma:
    ```ts
    intercambiarDias(args: {
        rotacionId: number
        semanaA: number; diaA: number
        semanaB: number; diaB: number
        origen: OrigenMovimiento
        usuario: string
    }): Promise<number>
    ```

- [ ] **Step 1: Escribir los tests que fallan**

Agregá a `src/repositories/RotacionClienteRepository.spec.ts`:

```ts
describe('findResueltasEntre', () => {
    it('devuelve los ids que ya tienen resolución', async () => {
        mockedQuery.mockResolvedValue([
            { rotacion_cliente_id: 11 },
            { rotacion_cliente_id: 13 },
        ])

        await expect(
            RotacionClienteRepository.findResueltasEntre([11, 12, 13]),
        ).resolves.toEqual([11, 13])
    })

    it('con la lista vacía no consulta la base', async () => {
        await expect(RotacionClienteRepository.findResueltasEntre([])).resolves.toEqual([])
        expect(mockedQuery).not.toHaveBeenCalled()
    })
})

describe('intercambiarDias', () => {
    const filasA = [
        { id: 11, rotacionId: 7, codigoParticularCliente: 'C001', semana: 1, dia: 2 },
        { id: 12, rotacionId: 7, codigoParticularCliente: 'C002', semana: 1, dia: 2 },
    ]
    const filasB = [
        { id: 21, rotacionId: 7, codigoParticularCliente: 'C021', semana: 1, dia: 4 },
    ]

    beforeEach(() => {
        // findByCelda se resuelve con el mock del modelo: primero el día A, después el B.
        mockedFindAll.mockResolvedValueOnce(filasA).mockResolvedValueOnce(filasB)
    })

    it('manda cada fila a la celda contraria y devuelve cuántas movió', async () => {
        mockedUpdate.mockResolvedValue([1])
        mockedBulkCreate.mockResolvedValue([])

        const movidas = await RotacionClienteRepository.intercambiarDias({
            rotacionId: 7,
            semanaA: 1,
            diaA: 2,
            semanaB: 1,
            diaB: 4,
            origen: 'gerencia',
            usuario: 'jefa@distrisuper.com',
        })

        expect(movidas).toBe(3)

        // Un UPDATE por celda (no uno por fila): las tres filas de A van todas al mismo
        // destino, así que se mueven por lote con un WHERE sobre sus ids.
        const destinos = mockedUpdate.mock.calls.map(([valores, opciones]: any[]) => ({
            semana: valores.semana,
            dia: valores.dia,
            ids: opciones.where.id[Object.keys(opciones.where.id)[0]] ?? opciones.where.id,
        }))
        expect(destinos).toHaveLength(2)
        expect(destinos[0]).toMatchObject({ semana: 1, dia: 4 }) // A → B
        expect(destinos[1]).toMatchObject({ semana: 1, dia: 2 }) // B → A
    })

    it('escribe una fila de bitácora por cliente movido, con antes y después', async () => {
        mockedUpdate.mockResolvedValue([1])
        mockedBulkCreate.mockResolvedValue([])

        await RotacionClienteRepository.intercambiarDias({
            rotacionId: 7,
            semanaA: 1,
            diaA: 2,
            semanaB: 1,
            diaB: 4,
            origen: 'gerencia',
            usuario: 'jefa@distrisuper.com',
        })

        const [filas] = mockedBulkCreate.mock.calls[0] as any[]
        expect(filas).toHaveLength(3)
        expect(filas[0]).toMatchObject({
            rotacionClienteId: 11,
            semanaAntes: 1,
            diaAntes: 2,
            semanaDespues: 1,
            diaDespues: 4,
            origen: 'gerencia',
            usuario: 'jefa@distrisuper.com',
        })
        expect(filas[2]).toMatchObject({
            rotacionClienteId: 21,
            diaAntes: 4,
            diaDespues: 2,
        })
    })

    it('intercambiar con un día vacío mueve solo lo que hay', async () => {
        mockedFindAll.mockReset()
        mockedFindAll.mockResolvedValueOnce(filasA).mockResolvedValueOnce([])
        mockedUpdate.mockResolvedValue([1])
        mockedBulkCreate.mockResolvedValue([])

        const movidas = await RotacionClienteRepository.intercambiarDias({
            rotacionId: 7,
            semanaA: 1,
            diaA: 2,
            semanaB: 3,
            diaB: 5,
            origen: 'gerencia',
            usuario: 'jefa@distrisuper.com',
        })

        // Vaciar un día sobre otro vacío es un movimiento válido, no un caso de error.
        expect(movidas).toBe(2)
        expect(mockedUpdate).toHaveBeenCalledTimes(1)
    })

    it('dos días vacíos no tocan la base', async () => {
        mockedFindAll.mockReset()
        mockedFindAll.mockResolvedValueOnce([]).mockResolvedValueOnce([])

        await expect(
            RotacionClienteRepository.intercambiarDias({
                rotacionId: 7,
                semanaA: 1,
                diaA: 2,
                semanaB: 1,
                diaB: 4,
                origen: 'gerencia',
                usuario: 'x@y.com',
            }),
        ).resolves.toBe(0)
        expect(mockedUpdate).not.toHaveBeenCalled()
        expect(mockedBulkCreate).not.toHaveBeenCalled()
    })
})
```

Y arriba, junto a los otros mocks del archivo, agregá los que falten:

```ts
const mockedFindAll = RotacionCliente.findAll as jest.MockedFunction<any>
const mockedUpdate = RotacionCliente.update as jest.MockedFunction<any>
const mockedBulkCreate = Reacomodacion.bulkCreate as jest.MockedFunction<any>
```

(importá `RotacionCliente` y `Reacomodacion` de `../models/planificacion/...` si el archivo todavía no los importa; ya están mockeados con `jest.mock` al tope)

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts -t intercambiarDias`
Expected: FAIL — `intercambiarDias is not a function`.

- [ ] **Step 3: Implementar**

En `src/repositories/RotacionClienteRepository.ts`, agregá dentro de la clase. Si no existe un helper para leer una celda, agregá también `findByCelda`:

```ts
    /** Las filas de una celda (semana, día) de la rotación. */
    static async findByCelda(
        rotacionId: number,
        semana: number,
        dia: number,
    ): Promise<IRotacionCliente[]> {
        try {
            const rows = await RotacionCliente.findAll({
                where: { rotacionId, semana, dia },
                order: [['id', 'ASC']],
            })
            return rows.map(toIRotacionCliente)
        } catch (err) {
            throw new CustomError(500, `Error fetching celda del plan: ${err}`)
        }
    }

    /**
     * De un set de filas, cuáles ya tienen resolución (visita o no-visita).
     *
     * Una query para todo el set y no una por fila: el intercambio de días evalúa hasta
     * ~20 filas de una, y la versión por fila era el mismo patrón N+1 que ya se evitó en
     * `findUltimosMovimientos`.
     */
    static async findResueltasEntre(ids: number[]): Promise<number[]> {
        if (ids.length === 0) return []
        try {
            const rows = await sequelizeWritePlanificacion.query<{
                rotacion_cliente_id: number | string
            }>(
                `SELECT DISTINCT rotacion_cliente_id
                   FROM pl_resolucion
                  WHERE rotacion_cliente_id IN (:ids)`,
                { replacements: { ids }, type: QueryTypes.SELECT },
            )
            return rows.map(r => Number(r.rotacion_cliente_id))
        } catch (err) {
            throw new CustomError(500, `Error fetching filas resueltas: ${err}`)
        }
    }

    /**
     * Permuta todos los clientes de una celda (semana, día) por los de otra.
     *
     * Es una primitiva propia y no N llamadas a `mover()` por dos razones. Primero, no hay
     * celda libre que sirva de espacio temporal —los 5 días suelen estar ocupados— así que
     * hecho de a uno el intercambio pasa por estados intermedios donde las dos tandas están
     * mezcladas en la misma celda y ya no se distinguen. Segundo, es UNA intención: si
     * falla a mitad, tiene que quedar todo como estaba.
     *
     * No hace falta valor temporal en el UPDATE: `pl_rotacion_cliente` no tiene unique
     * sobre (rotacion_id, semana, dia) — solo sobre (rotacion_id, cliente) — así que las
     * dos tandas pueden cruzarse sin colisionar.
     *
     * La regla de "no se mueve una fila con resolución" la valida el SERVICIO acá, no este
     * método: el rechazo es de todo el intercambio y necesita nombrar los bloqueantes.
     */
    static async intercambiarDias(args: {
        rotacionId: number
        semanaA: number
        diaA: number
        semanaB: number
        diaB: number
        origen: OrigenMovimiento
        usuario: string
    }): Promise<number> {
        const { rotacionId, semanaA, diaA, semanaB, diaB, origen, usuario } = args

        const filasA = await RotacionClienteRepository.findByCelda(rotacionId, semanaA, diaA)
        const filasB = await RotacionClienteRepository.findByCelda(rotacionId, semanaB, diaB)

        if (filasA.length === 0 && filasB.length === 0) return 0

        const fecha = new Date()
        const bitacora = [
            ...filasA.map(f => ({
                rotacionClienteId: f.id,
                semanaAntes: f.semana,
                diaAntes: f.dia,
                semanaDespues: semanaB,
                diaDespues: diaB,
                origen,
                usuario,
                fecha,
            })),
            ...filasB.map(f => ({
                rotacionClienteId: f.id,
                semanaAntes: f.semana,
                diaAntes: f.dia,
                semanaDespues: semanaA,
                diaDespues: diaA,
                origen,
                usuario,
                fecha,
            })),
        ]

        try {
            await sequelizeWritePlanificacion.transaction(async transaction => {
                // Un UPDATE por tanda, no uno por fila: todas las de A van al mismo destino.
                if (filasA.length > 0) {
                    await RotacionCliente.update(
                        { semana: semanaB, dia: diaB },
                        { where: { id: { [Op.in]: filasA.map(f => f.id) } }, transaction },
                    )
                }
                if (filasB.length > 0) {
                    await RotacionCliente.update(
                        { semana: semanaA, dia: diaA },
                        { where: { id: { [Op.in]: filasB.map(f => f.id) } }, transaction },
                    )
                }
                await Reacomodacion.bulkCreate(bitacora, { transaction })
            })
        } catch (err) {
            throw new CustomError(500, `Error intercambiando días: ${err}`)
        }

        return bitacora.length
    }
```

Agregá `Op` al import de sequelize del archivo (`import { Op, QueryTypes, Transaction } from 'sequelize'`) si no está.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts`
Expected: PASS, incluidos los tests preexistentes de ese archivo.

**Si el assert de `destinos[].ids` falla** por la forma del objeto `Op.in`: el símbolo no se serializa como una clave normal. Simplificá esa aserción a verificar solo `semana`/`dia` de cada UPDATE (que es lo que importa del comportamiento) y dejá la verificación de qué filas se movieron a los asserts de bitácora, que sí las nombran por id.

- [ ] **Step 5: Commit**

```bash
git add src/repositories/RotacionClienteRepository.ts src/repositories/RotacionClienteRepository.spec.ts
git commit -m "feat(planificacion): primitiva para intercambiar dos dias completos del plan"
```

---

### Task 2 (BACKEND): validaciones, endpoint y rechazo por resueltos

**Working dir:** `C:/Users/matia/orca/workspaces/api-vendedores/MatiasH11-plan-rotacion-editable`

**Files:**
- Modify: `src/types/planificacion.ts`
- Modify: `src/services/planificacion/GerenciaRotacionService.ts`
- Test: `src/services/planificacion/GerenciaRotacionService.spec.ts`
- Modify: `src/controllers/planificacionController.ts`
- Modify: `src/routes/planificacion.ts`

**Interfaces:**
- Consumes: `intercambiarDias`/`findResueltasEntre`/`findByCelda` (Task 1), `requireRotacionDe`/`requireEditable` (ya existen), `RotacionSemanaRepository.semanasDelSet`.
- Produces:
  - Tipo `IIntercambiarDiasDTO = { semanaA: number; diaA: number; semanaB: number; diaB: number }`
  - `GerenciaRotacionService.intercambiarDias(user, vendedor, rotacionId, dto): Promise<{ movidas: number }>`
  - `POST /planificacion/vendedores/:codigo/rotaciones/:rotacionId/intercambiar-dias`

- [ ] **Step 1: Escribir los tests que fallan**

Agregá a `src/services/planificacion/GerenciaRotacionService.spec.ts`:

```ts
describe('intercambiarDias', () => {
    const dto = { semanaA: 1, diaA: 2, semanaB: 1, diaB: 4 }

    beforeEach(() => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue(rotacionAbierta)
        ;(RotacionSemanaRepository.semanasDelSet as jest.Mock).mockResolvedValue([1, 2, 3])
        ;(RotacionClienteRepository.findByCelda as jest.Mock)
            .mockResolvedValueOnce([{ id: 11 }, { id: 12 }])
            .mockResolvedValueOnce([{ id: 21 }])
        ;(RotacionClienteRepository.findResueltasEntre as jest.Mock).mockResolvedValue([])
        ;(RotacionClienteRepository.intercambiarDias as jest.Mock).mockResolvedValue(3)
    })

    it('intercambia con origen gerencia y devuelve cuántas movió', async () => {
        const res = await GerenciaRotacionService.intercambiarDias(USER, 'V 2', 7, dto)

        expect(RotacionClienteRepository.intercambiarDias).toHaveBeenCalledWith({
            rotacionId: 7,
            semanaA: 1,
            diaA: 2,
            semanaB: 1,
            diaB: 4,
            origen: 'gerencia',
            usuario: 'jefe@distrisuper.com',
        })
        expect(res).toEqual({ movidas: 3 })
    })

    it('409 con los códigos bloqueantes si algún cliente ya se resolvió', async () => {
        ;(RotacionClienteRepository.findResueltasEntre as jest.Mock).mockResolvedValue([12])
        ;(RotacionClienteRepository.findByCelda as jest.Mock).mockReset()
        ;(RotacionClienteRepository.findByCelda as jest.Mock)
            .mockResolvedValueOnce([
                { id: 11, codigoParticularCliente: 'C001' },
                { id: 12, codigoParticularCliente: 'C002' },
            ])
            .mockResolvedValueOnce([{ id: 21, codigoParticularCliente: 'C021' }])

        await expect(
            GerenciaRotacionService.intercambiarDias(USER, 'V 2', 7, dto),
        ).rejects.toMatchObject({
            statusCode: 409,
            code: 'DIA_CON_RESUELTOS',
            // El front mapea estos códigos a nombres con el grid que ya tiene en caché.
            clientes: ['C002'],
        })

        // Rechazo TOTAL: no se mueve ni una fila. Un swap parcial deja un estado que nadie
        // pidió y encima parece que funcionó.
        expect(RotacionClienteRepository.intercambiarDias).not.toHaveBeenCalled()
    })

    it('400 si las dos celdas son la misma', async () => {
        await expect(
            GerenciaRotacionService.intercambiarDias(USER, 'V 2', 7, {
                semanaA: 1,
                diaA: 2,
                semanaB: 1,
                diaB: 2,
            }),
        ).rejects.toMatchObject({ statusCode: 400, code: 'CELDAS_IGUALES' })
    })

    it('400 si un día está fuera de 1..5', async () => {
        await expect(
            GerenciaRotacionService.intercambiarDias(USER, 'V 2', 7, { ...dto, diaB: 9 }),
        ).rejects.toMatchObject({ statusCode: 400, code: 'DIA_INVALIDO' })
    })

    it('422 si una semana no está en el set', async () => {
        await expect(
            GerenciaRotacionService.intercambiarDias(USER, 'V 2', 7, {
                ...dto,
                semanaB: 99,
            }),
        ).rejects.toMatchObject({ statusCode: 422, code: 'SEMANA_FUERA_DEL_SET' })
    })

    it('409 si la rotación ya está cerrada', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue({
            ...rotacionAbierta,
            estado: 'cerrada',
        })

        await expect(
            GerenciaRotacionService.intercambiarDias(USER, 'V 2', 7, dto),
        ).rejects.toMatchObject({ statusCode: 409, code: 'ROTACION_CERRADA' })
    })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts -t intercambiarDias`
Expected: FAIL — `GerenciaRotacionService.intercambiarDias is not a function`.

- [ ] **Step 3: Agregar el DTO**

En `src/types/planificacion.ts`, junto a `IReacomodarDTO`:

```ts
/** Permutar todos los clientes de una celda (semana, día) por los de otra. */
export interface IIntercambiarDiasDTO {
    semanaA: number
    diaA: number
    semanaB: number
    diaB: number
}
```

- [ ] **Step 4: Implementar el service**

En `src/services/planificacion/GerenciaRotacionService.ts`, agregá el import del DTO y este método:

```ts
    /**
     * Permuta dos días completos. Una intención, una transacción.
     *
     * Rechaza TODO el intercambio si alguna de las dos celdas tiene un cliente ya resuelto,
     * nombrando los bloqueantes. La alternativa —mover solo los movibles— deja un resultado
     * que nadie pidió: ni el origen ni el destino quedan como estaban ni como se quería, y
     * la operación parece haber funcionado. En una rotación 'programada' no hay nada
     * resuelto, que es donde gerencia planifica.
     */
    static async intercambiarDias(
        user: IUser,
        vendedor: string,
        rotacionId: number,
        dto: IIntercambiarDiasDTO,
    ): Promise<{ movidas: number }> {
        for (const dia of [dto.diaA, dto.diaB]) {
            if (!Number.isInteger(dia) || dia < 1 || dia > 5) {
                throw new CustomError(400, 'El día tiene que estar entre 1 y 5.', {
                    code: 'DIA_INVALIDO',
                })
            }
        }

        if (dto.semanaA === dto.semanaB && dto.diaA === dto.diaB) {
            throw new CustomError(400, 'Elegí dos días distintos para intercambiar.', {
                code: 'CELDAS_IGUALES',
            })
        }

        const rotacion = await GerenciaRotacionService.requireRotacionDe(
            vendedor,
            rotacionId,
        )
        GerenciaRotacionService.requireEditable(rotacion)

        const set = await RotacionSemanaRepository.semanasDelSet(rotacionId)
        for (const semana of [dto.semanaA, dto.semanaB]) {
            if (!set.includes(semana)) {
                throw new CustomError(
                    422,
                    `La semana ${semana} no existe en esta rotación.`,
                    { code: 'SEMANA_FUERA_DEL_SET', semanas: set },
                )
            }
        }

        const filasA = await RotacionClienteRepository.findByCelda(
            rotacionId,
            dto.semanaA,
            dto.diaA,
        )
        const filasB = await RotacionClienteRepository.findByCelda(
            rotacionId,
            dto.semanaB,
            dto.diaB,
        )
        const todas = [...filasA, ...filasB]

        const resueltas = await RotacionClienteRepository.findResueltasEntre(
            todas.map(f => f.id),
        )
        if (resueltas.length > 0) {
            const bloqueados = new Set(resueltas)
            throw new CustomError(
                409,
                'No se puede intercambiar: hay clientes ya resueltos en esta vuelta.',
                {
                    code: 'DIA_CON_RESUELTOS',
                    // Códigos y no nombres: el front los resuelve con el grid que ya tiene
                    // en caché, así este camino no consulta el warehouse.
                    clientes: todas
                        .filter(f => bloqueados.has(f.id))
                        .map(f => f.codigoParticularCliente),
                },
            )
        }

        const movidas = await RotacionClienteRepository.intercambiarDias({
            rotacionId,
            semanaA: dto.semanaA,
            diaA: dto.diaA,
            semanaB: dto.semanaB,
            diaB: dto.diaB,
            origen: 'gerencia',
            usuario: user.email ?? String(user.id),
        })

        return { movidas }
    }
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts`
Expected: PASS, incluidos los tests preexistentes.

- [ ] **Step 6: Handler y ruta**

En `src/controllers/planificacionController.ts`, dentro de la clase:

```ts
    static async intercambiarDias(req: Request, res: Response): Promise<void> {
        try {
            const rotacionId = parseInt(req.params.rotacionId, 10)
            if (isNaN(rotacionId)) {
                res.status(400).json({ ok: 0, error: 'rotacionId inválido' })
                return
            }

            const body = req.body as Record<string, unknown>
            const dto = {
                semanaA: Number(body.semanaA),
                diaA: Number(body.diaA),
                semanaB: Number(body.semanaB),
                diaB: Number(body.diaB),
            }
            // parseSemana no sirve acá: son dos semanas y ambas obligatorias.
            if (
                !Number.isInteger(dto.semanaA) ||
                dto.semanaA < 1 ||
                !Number.isInteger(dto.semanaB) ||
                dto.semanaB < 1
            ) {
                res.status(400).json({
                    ok: 0,
                    error: 'semanaA y semanaB tienen que ser enteros positivos',
                })
                return
            }

            const data = await GerenciaRotacionService.intercambiarDias(
                req.user!,
                req.params.codigo,
                rotacionId,
                dto,
            )
            res.status(200).json({ ok: 1, data })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }
```

En `src/routes/planificacion.ts`, en el bloque de gerencia:

```ts
// Permutar dos dias completos: una intencion, una transaccion, una fila de bitacora por
// cliente movido.
router.post(
    '/vendedores/:codigo/rotaciones/:rotacionId/intercambiar-dias',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.intercambiarDias(req, res)
    },
)
```

- [ ] **Step 7: Compilar y correr toda la suite**

Run: `npx tsc --noEmit && npm test`
Expected: compila limpio, suite verde.

- [ ] **Step 8: Commit**

```bash
git add src/types/planificacion.ts src/services/planificacion/GerenciaRotacionService.ts src/services/planificacion/GerenciaRotacionService.spec.ts src/controllers/planificacionController.ts src/routes/planificacion.ts
git commit -m "feat(planificacion): endpoint para intercambiar dos dias, con rechazo total si hay resueltos"
```

---

### Task 3 (FRONT): API y hook

**Working dir:** `C:/Users/matia/orca/workspaces/app-planificacion/MatiasH11-plan-rotacion-editable-front`

**Files:**
- Modify: `src/types/planificacion.ts`
- Modify: `src/api/planificacionAdmin.ts`
- Test: `src/api/planificacionAdmin.test.ts`
- Modify: `src/hooks/useRotacionAdmin.ts`
- Test: `src/hooks/useRotacionAdmin.test.tsx`

**Interfaces:**
- Consumes: el endpoint de la Task 2.
- Produces:
  - `IIntercambiarDiasDTO` (misma forma que el backend)
  - `intercambiarDias(codigo, rotacionId, dto): Promise<number>` — devuelve `movidas`
  - `useIntercambiarDias(codigo)` — mutation que invalida el grid de esa rotación

- [ ] **Step 1: Escribir los tests que fallan**

En `src/api/planificacionAdmin.test.ts`:

```ts
describe('intercambiarDias', () => {
    it('manda las dos celdas y devuelve cuántas filas movió', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({
            data: { ok: 1, data: { movidas: 18 } },
        } as never)

        const movidas = await intercambiarDias('V 2', 7, {
            semanaA: 1,
            diaA: 2,
            semanaB: 1,
            diaB: 4,
        })

        expect(apiClient.post).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/intercambiar-dias',
            { semanaA: 1, diaA: 2, semanaB: 1, diaB: 4 },
        )
        expect(movidas).toBe(18)
    })
})
```

(agregá `intercambiarDias` al import del archivo)

En `src/hooks/useRotacionAdmin.test.tsx`:

```ts
describe('useIntercambiarDias', () => {
    it('manda vendedor, rotación y las dos celdas', async () => {
        vi.mocked(api.intercambiarDias).mockResolvedValue(18)

        const { result } = renderHook(() => useIntercambiarDias('V 2'), { wrapper })
        await result.current.mutateAsync({
            rotacionId: 7,
            semanaA: 1,
            diaA: 2,
            semanaB: 3,
            diaB: 5,
        })

        expect(api.intercambiarDias).toHaveBeenCalledWith('V 2', 7, {
            semanaA: 1,
            diaA: 2,
            semanaB: 3,
            diaB: 5,
        })
    })
})
```

(agregá `useIntercambiarDias` al import)

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/api/planificacionAdmin.test.ts src/hooks/useRotacionAdmin.test.tsx`
Expected: FAIL — no existen `intercambiarDias` ni `useIntercambiarDias`.

- [ ] **Step 3: Implementar**

En `src/types/planificacion.ts`:

```ts
/** Permutar todos los clientes de una celda (semana, día) por los de otra. */
export interface IIntercambiarDiasDTO {
    semanaA: number
    diaA: number
    semanaB: number
    diaB: number
}
```

En `src/api/planificacionAdmin.ts`:

```ts
/** Permuta dos días completos. Devuelve cuántas filas se movieron. */
export const intercambiarDias = async (
    codigo: string,
    rotacionId: number,
    dto: IIntercambiarDiasDTO,
): Promise<number> => {
    const res = await apiClient.post(
        `${base(codigo)}/${rotacionId}/intercambiar-dias`,
        dto,
    )
    return res.data.data.movidas
}
```

En `src/hooks/useRotacionAdmin.ts`:

```ts
/**
 * Sin update optimista, a diferencia del arrastre de una card: acá se mueven hasta ~20
 * filas de golpe y el rechazo por clientes resueltos es un caso esperado, no un borde. Con
 * el grid recortado a ~31 KB, esperar la confirmación y releer es más simple y no se nota.
 */
export function useIntercambiarDias(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number } & IIntercambiarDiasDTO) =>
            intercambiarDias(codigo, args.rotacionId, {
                semanaA: args.semanaA,
                diaA: args.diaA,
                semanaB: args.semanaB,
                diaB: args.diaB,
            }),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
        },
    })
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/api/planificacionAdmin.test.ts src/hooks/useRotacionAdmin.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/planificacion.ts src/api/planificacionAdmin.ts src/api/planificacionAdmin.test.ts src/hooks/useRotacionAdmin.ts src/hooks/useRotacionAdmin.test.tsx
git commit -m "feat(ruta): api y hook para intercambiar dos dias"
```

---

### Task 4 (FRONT): encabezados accionables y modo de selección

**Working dir:** `C:/Users/matia/orca/workspaces/app-planificacion/MatiasH11-plan-rotacion-editable-front`

**Files:**
- Modify: `src/components/ruta/GridRotacion.tsx`
- Test: `src/components/ruta/GridRotacion.test.tsx`
- Modify: `src/pages/RutaPage.tsx`

**Interfaces:**
- Consumes: `useIntercambiarDias` (Task 3).
- Produces: `GridRotacion` gana `onIntercambiar: (a: {semana: number, dia: number}, b: {semana: number, dia: number}) => void`.

**La interacción:** cada celda tiene un botón "Intercambiar este día". Al tocarlo, el grid entra en modo selección: ese botón queda marcado como origen y los demás pasan a decir "Intercambiar con este día". El segundo click confirma y sale del modo. `Escape` o volver a tocar el origen cancela. Así el intercambio entre semanas sale gratis, sin un menú de 25 opciones.

- [ ] **Step 1: Escribir los tests que fallan**

Agregá a `src/components/ruta/GridRotacion.test.tsx`:

```tsx
describe('intercambiar días', () => {
    const props = () => ({
        semanas: SEMANAS,
        onMover: vi.fn(),
        onRenombrarSemana: vi.fn(),
        onIntercambiar: vi.fn(),
    })

    it('cada celda ofrece iniciar un intercambio', () => {
        render(<GridRotacion {...props()} />)
        // 2 semanas × 5 días
        expect(
            screen.getAllByRole('button', { name: /intercambiar este día/i }),
        ).toHaveLength(10)
    })

    it('al elegir el origen, las demás celdas pasan a ser destino', async () => {
        render(<GridRotacion {...props()} />)

        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )

        expect(
            screen.getByRole('button', { name: 'Cancelar intercambio: semana 1, LUN' }),
        ).toBeInTheDocument()
        expect(
            screen.getAllByRole('button', { name: /intercambiar con este día/i }),
        ).toHaveLength(9)
    })

    it('el segundo click avisa las dos celdas y sale del modo', async () => {
        const p = props()
        render(<GridRotacion {...p} />)

        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )
        await userEvent.click(
            screen.getByRole('button', {
                name: 'Intercambiar con este día: semana 3, JUE',
            }),
        )

        // Entre semanas distintas: es el caso que un menú por columna no cubriría.
        expect(p.onIntercambiar).toHaveBeenCalledWith(
            { semana: 1, dia: 1 },
            { semana: 3, dia: 4 },
        )
        expect(
            screen.getAllByRole('button', { name: /intercambiar este día/i }),
        ).toHaveLength(10)
    })

    it('volver a tocar el origen cancela', async () => {
        const p = props()
        render(<GridRotacion {...p} />)

        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )
        await userEvent.click(
            screen.getByRole('button', { name: 'Cancelar intercambio: semana 1, LUN' }),
        )

        expect(p.onIntercambiar).not.toHaveBeenCalled()
        expect(
            screen.getAllByRole('button', { name: /intercambiar este día/i }),
        ).toHaveLength(10)
    })

    it('Escape cancela el modo', async () => {
        const p = props()
        render(<GridRotacion {...p} />)

        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )
        await userEvent.keyboard('{Escape}')

        expect(p.onIntercambiar).not.toHaveBeenCalled()
        expect(
            screen.getAllByRole('button', { name: /intercambiar este día/i }),
        ).toHaveLength(10)
    })

    it('sin editable no se ofrece intercambiar', () => {
        render(<GridRotacion {...props()} editable={false} />)
        expect(
            screen.queryByRole('button', { name: /intercambiar este día/i }),
        ).not.toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/components/ruta/GridRotacion.test.tsx`
Expected: FAIL — no existen los botones de intercambio.

- [ ] **Step 3: Implementar en `GridRotacion`**

Agregá la prop y el estado del modo. `GridRotacion` ya tiene `editable`; el intercambio se ofrece solo cuando es `true`.

```tsx
interface Celda { semana: number; dia: number }
```

En la interfaz de props:

```tsx
    onIntercambiar: (a: Celda, b: Celda) => void
```

En el componente, antes del `return`:

```tsx
    // Celda origen del intercambio en curso. null = no hay intercambio empezado.
    const [origen, setOrigen] = useState<Celda | null>(null)

    // Escape cancela: es la salida que el usuario espera de un modo, y sin ella la única
    // forma de salir era acertarle de nuevo al botón de origen.
    useEffect(() => {
        if (!origen) return
        const alTecla = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOrigen(null)
        }
        window.addEventListener('keydown', alTecla)
        return () => window.removeEventListener('keydown', alTecla)
    }, [origen])

    const tocarCelda = (celda: Celda) => {
        if (!origen) {
            setOrigen(celda)
            return
        }
        if (origen.semana === celda.semana && origen.dia === celda.dia) {
            setOrigen(null) // volver a tocar el origen cancela
            return
        }
        onIntercambiar(origen, celda)
        setOrigen(null)
    }
```

`Celda` gana cuatro props. Reemplazá su interfaz y su cuerpo (hoy son `semana`, `dia`, `clientes`, `arrastrable`) por:

```tsx
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
}

function Celda({
    semana,
    dia,
    clientes,
    arrastrable,
    intercambiable,
    esOrigen,
    esDestinoPosible,
    onTocarIntercambio,
}: CeldaProps) {
    const { setNodeRef, isOver } = useDroppable({ id: `celda-${semana}-${dia}` })

    // El label lleva semana y día porque hay 25 celdas: sin eso, 25 botones con el mismo
    // nombre accesible son indistinguibles para un lector de pantalla y para los tests.
    const etiqueta = esOrigen
        ? 'Cancelar intercambio'
        : esDestinoPosible
          ? 'Intercambiar con este día'
          : 'Intercambiar este día'

    return (
        <td
            ref={setNodeRef}
            data-testid={`celda-${semana}-${dia}`}
            className={`min-w-40 space-y-1 rounded-md p-1.5 align-top ${
                isOver ? 'bg-slate-200 ring-2 ring-slate-400' : 'bg-white'
            } ${esOrigen ? 'ring-2 ring-slate-900' : ''}`}
        >
            {intercambiable && (
                <button
                    type="button"
                    aria-label={`${etiqueta}: semana ${semana}, ${dia}`}
                    onClick={() => onTocarIntercambio({ semana, dia })}
                    className={`mb-1 w-full rounded border border-dashed px-1 py-0.5 text-[10px] font-medium ${
                        esOrigen
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : esDestinoPosible
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-600'
                    }`}
                >
                    {esOrigen ? 'Cancelar' : esDestinoPosible ? 'Intercambiar acá' : '⇄'}
                </button>
            )}
            {clientes.map(cliente => (
                <ClienteCardRuta
                    key={cliente.rotacionClienteId}
                    cliente={cliente}
                    arrastrable={arrastrable}
                />
            ))}
        </td>
    )
}
```

Y en el `.map` de días de `GridRotacion`, donde hoy se renderiza `<Celda ... arrastrable={editable ?? true} />`, agregá:

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
                                />
```

**Ojo con el `dia`:** `Celda` recibe la clave (`'LUN'`) pero el estado `origen` guarda el número (1..5), que es lo que viaja al backend. La conversión es `DIAS.indexOf(dia) + 1`, igual que ya hace `parsearCelda`.

Importá `useEffect` y `useState` de React.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/components/ruta/GridRotacion.test.tsx`
Expected: PASS, incluidos los tests preexistentes de drag and drop.

- [ ] **Step 5: Enchufar en la página, con el error nombrando clientes**

En `src/pages/RutaPage.tsx`, agregá `useIntercambiarDias` al import de hooks y:

```tsx
    const intercambiar = useIntercambiarDias(vendedor ?? '')
```

Pasale al grid:

```tsx
                        onIntercambiar={(a, b) =>
                            intercambiar.mutate({
                                rotacionId: grid.id,
                                semanaA: a.semana,
                                diaA: a.dia,
                                semanaB: b.semana,
                                diaB: b.dia,
                            })
                        }
```

Y el error, que resuelve los códigos bloqueados a nombres con el grid que ya está en memoria:

```tsx
                {intercambiar.isError && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {(() => {
                            const data = (
                                intercambiar.error as {
                                    response?: { data?: { clientes?: string[] } }
                                }
                            )?.response?.data
                            const codigos = data?.clientes ?? []
                            if (codigos.length === 0) {
                                return 'No se pudo intercambiar los días. Probá de nuevo en un momento.'
                            }
                            // El backend manda códigos; los nombres salen del grid que ya
                            // tenemos, así ese camino no vuelve a consultar el warehouse.
                            const porCodigo = new Map(
                                (grid?.semanas ?? [])
                                    .flatMap(s => Object.values(s.dias).flat())
                                    .map(c => [c.codigoParticularCliente, c.nombreCliente]),
                            )
                            const nombres = codigos.map(c => porCodigo.get(c) ?? c)
                            return `No se puede intercambiar: ${nombres.join(', ')} ya ${
                                nombres.length === 1 ? 'fue' : 'fueron'
                            } resuelto${nombres.length === 1 ? '' : 's'} en esta vuelta.`
                        })()}
                    </p>
                )}
```

- [ ] **Step 6: Compilar y correr toda la suite**

Run: `npx tsc -b` (sin pipe, para no perder el exit code), y después `npm test`
Expected: compila limpio, suite verde.

- [ ] **Step 7: Verificación manual contra el backend local**

El backend local ya está corriendo (`localhost:4002`, MySQL en docker) y el front en `npm run dev`. Con un usuario `admin`:

1. En una rotación `programada`, intercambiar martes con jueves de la semana 1: los clientes se permutan y ningún cliente queda duplicado ni perdido.
2. Verificar en la base que quedó una fila de bitácora por cliente, con `origen='gerencia'`:
   ```sql
   SELECT COUNT(*), origen FROM pl_reacomodacion
    WHERE fecha > NOW() - INTERVAL 5 MINUTE GROUP BY origen;
   ```
3. Intercambiar entre semanas distintas (semana 1 LUN con semana 3 JUE).
4. Intercambiar contra un día vacío: los clientes se mudan y el día de origen queda vacío.
5. `Escape` y el click sobre el origen cancelan sin mover nada.

El caso de rechazo por resueltos **no se puede probar sin una visita cerrada en la base**; si no hay ninguna, dejalo registrado como pendiente en vez de forzarlo.

- [ ] **Step 8: Commit**

```bash
git add src/components/ruta/GridRotacion.tsx src/components/ruta/GridRotacion.test.tsx src/pages/RutaPage.tsx
git commit -m "feat(ruta): intercambiar dos dias completos desde el grid"
```

---

## Notas de cierre

- **El rechazo por clientes resueltos es total y a propósito.** Está en las Global Constraints y en el comentario del service para que nadie lo "mejore" a un swap parcial más adelante sin releer el motivo.
- **Sin update optimista acá**, a diferencia del arrastre de una card: se mueven ~20 filas de golpe y el rechazo es un caso esperado. Con el grid en ~31 KB, esperar la confirmación no se nota.
- **Deuda conocida:** el intercambio no tiene undo. Como cada movimiento queda en `pl_reacomodacion` con su `antes`/`después`, un "deshacer el último intercambio" es implementable después leyendo esas filas — pero no entra acá.
