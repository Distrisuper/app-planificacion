# "No visité" con la visita ya abierta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el vendedor que ya inició la visita y adentro se entera de que el cliente está cerrado / de vacaciones pueda registrar "No visité" con motivo, sin cerrar una visita falsa ni quedar trabado.

**Architecture:** La resolución abierta (`tipo='visita'`, `fecha_fin NULL`) se **convierte** a `no_visita` con un endpoint nuevo, en vez de crear una nueva (el `UNIQUE (rotacion_cliente_id)` ya está ocupado) o borrarla (se perdería `coord_inicio`). El front lo alcanza por dos caminos que llaman al mismo endpoint: el "Reagendar → No visité" que ya existe (hoy falla con un 409 traducido a error genérico) y un ítem nuevo en el menú `⋯` del header de `VisitaSheet`.

**Tech Stack:** Backend `api-vendedores` (TypeScript, Express, Sequelize, Jest). Front `app-planificacion` (Vite + React 19 + TS, React Query, Vitest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-09-15-no-visite-con-visita-abierta-design.md` (en app-planificacion).

## Global Constraints

- **Dos repos.** Tareas 1-3: `C:\Users\matia\OneDrive\Documentos\distri\business-platform\versus\api-vendedores` (**ojo**: NO es la ruta que dice CLAUDE.md, y `distri/vendedores/api-vendedores` es un clon viejo sin el dominio `planificacion`). Tareas 4-10: `C:\Users\matia\OneDrive\Documentos\distri\app-planificacion`.
- `git pull` antes de ramificar en api-vendedores: el `master` local suele estar detrás de `origin/master`.
- Rama backend: `feat/no-visita-sobre-visita-abierta`. Rama front: `feat/no-visite-con-visita-abierta`. Ninguna de las dos se abre desde `feat/identidad-cliente-en-header` — las dos salen de `master`.
- **El backend va primero y entero** (tareas 1-3). El front sin el endpoint no tiene contra qué correr.
- **Vocabulario de pantalla: "No visité"**, idéntico al de `EstadoVisitaSheet`. Nunca "anular", "cancelar" ni "abortar" en texto visible — son palabras del esquema, no del vendedor, y sugieren que la visita se deshace cuando lo que pasa es que se declara otro hecho.
- **Nada de captura de GPS en este camino.** Es la salida de emergencia: `capturarUbicacion()` puede tardar ~23 s y fallar.
- **No se borran los `pl_visita_rubro`** que hayan quedado cargados.
- Tests backend: `npm test` (Jest). Tests front: `npm test` (`vitest run`). Lint front: `npm run lint` (oxlint).
- Commits en español, formato `feat(...)`/`test(...)`/`docs(...)`, terminados con:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Backend (`api-vendedores`)**
- `src/repositories/ResolucionRepository.ts` — método nuevo `marcarNoVisita`. Única escritura del cambio de tipo.
- `src/repositories/ResolucionRepository.spec.ts` — tests del método nuevo.
- `src/services/planificacion/VisitasService.ts` — `registrarNoVisitaSobreVisitaAbierta`: guards, transacción, aviso a Cromo.
- `src/services/planificacion/VisitasService.spec.ts` — tests de negocio.
- `src/controllers/planificacionController.ts` — `noVisitaDeVisitaAbierta`: parseo y validación del body.
- `src/controllers/planificacionController.spec.ts` — tests del controller.
- `src/routes/planificacion.ts` — ruta + comentario Swagger.

**Front (`app-planificacion`)**
- `src/api/planificacion.ts` — `noVisitaSobreVisitaAbierta`.
- `src/hooks/useVisitas.ts` — `useNoVisitaSobreVisitaAbierta`.
- `src/components/ui/BottomSheet.tsx` (+ `.test.tsx`) — prop `acciones` y el menú `⋯`. Genérico: no sabe nada de visitas.
- `src/components/ResolucionSheet.tsx` (+ `.test.tsx`) — prop `aviso`.
- `src/components/VisitaSheet.tsx` (+ `.test.tsx`) — arma la acción y reporta `completos`.
- `src/components/VisitaFlow.tsx` (+ `.test.tsx`) — dueño del flujo: monta el `ResolucionSheet`, llama a la mutación, suelta la visita.
- `src/pages/AgendaSemanaPage.tsx` (+ `.test.tsx`) — ruteo de los dos caminos.
- `docs/dominio/modelo.md`, `CLAUDE.md` — documentación viva.

---

# PARTE A — Backend (`api-vendedores`)

Antes de la Tarea 1, una sola vez:

```bash
cd "C:/Users/matia/OneDrive/Documentos/distri/business-platform/versus/api-vendedores"
git checkout master && git pull
git checkout -b feat/no-visita-sobre-visita-abierta
```

---

### Task 1: `ResolucionRepository.marcarNoVisita`

La única escritura que convierte la fila. El `WHERE` lleva las tres condiciones (id + `tipo='visita'` + `fecha_fin IS NULL`), no sólo el id: es lo que hace que un `cerrar` concurrente no pueda quedar pisado. Devuelve cuántas filas afectó para que el service decida el error.

**Files:**
- Modify: `src/repositories/ResolucionRepository.ts` (agregar después de `cerrarVisita`, ~línea 172)
- Test: `src/repositories/ResolucionRepository.spec.ts`

**Interfaces:**
- Consumes: `Resolucion` (modelo Sequelize), `CustomError`.
- Produces: `ResolucionRepository.marcarNoVisita(id: number, transaction?: Transaction): Promise<number>` — devuelve la cantidad de filas afectadas (0 = la fila ya no estaba abierta).

- [ ] **Step 1: Write the failing tests**

Agregar al final de `src/repositories/ResolucionRepository.spec.ts`:

```ts
describe('marcarNoVisita', () => {
    beforeEach(() => {
        mockedUpdate.mockReset()
        mockedUpdate.mockResolvedValue([1] as never)
    })

    it('convierte la visita abierta a no_visita sellando fecha_fin', async () => {
        const afectadas = await ResolucionRepository.marcarNoVisita(5)

        expect(afectadas).toBe(1)
        const [values] = mockedUpdate.mock.calls[0] as any
        expect(values.tipo).toBe('no_visita')
        expect(values.fechaFin).toBeInstanceOf(Date)
    })

    // El WHERE completo es la protección contra la carrera con `cerrar`: si entre el
    // guard del service y este UPDATE alguien cerró la visita, esto tiene que afectar
    // 0 filas en vez de pisar el cierre.
    it('sólo toca la fila si sigue siendo una visita abierta', async () => {
        await ResolucionRepository.marcarNoVisita(5)

        const [, options] = mockedUpdate.mock.calls[0] as any
        expect(options.where).toEqual({ id: 5, tipo: 'visita', fechaFin: null })
    })

    it('devuelve 0 cuando no afectó ninguna fila', async () => {
        mockedUpdate.mockResolvedValue([0] as never)

        expect(await ResolucionRepository.marcarNoVisita(5)).toBe(0)
    })

    it('propaga la transacción cuando se la pasan', async () => {
        const tx = { id: 'tx' } as any

        await ResolucionRepository.marcarNoVisita(5, tx)

        const [, options] = mockedUpdate.mock.calls[0] as any
        expect(options.transaction).toBe(tx)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- ResolucionRepository`
Expected: FAIL — `ResolucionRepository.marcarNoVisita is not a function`.

- [ ] **Step 3: Write the implementation**

En `src/repositories/ResolucionRepository.ts`, después de `cerrarVisita`:

```ts
    /**
     * Convierte una visita TODAVÍA ABIERTA en un `no_visita` (el vendedor inició la
     * visita en la vereda y adentro se encontró con el local cerrado). No rompe la
     * inmutabilidad de pl_resolucion: una fila con fecha_fin NULL todavía no resolvió
     * nada, así que esto es la primera declaración del hecho, no la corrección de una
     * anterior.
     *
     * El WHERE lleva las tres condiciones y no sólo el id: si entre el guard del service
     * y esta escritura alguien cerró la visita, esto afecta 0 filas y el service lo
     * traduce a 409 en vez de pisar el cierre. Devuelve las filas afectadas por eso.
     */
    static async marcarNoVisita(id: number, transaction?: Transaction): Promise<number> {
        try {
            const [afectadas] = await Resolucion.update(
                { tipo: 'no_visita' as TipoResolucion, fechaFin: new Date() },
                {
                    where: { id, tipo: 'visita', fechaFin: null },
                    ...(transaction ? { transaction } : {}),
                },
            )
            return afectadas
        } catch (err) {
            throw new CustomError(500, `Error registrando no visita sobre la visita abierta: ${err}`)
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ResolucionRepository`
Expected: PASS (los 4 tests nuevos y todos los que ya había).

- [ ] **Step 5: Commit**

```bash
git add src/repositories/ResolucionRepository.ts src/repositories/ResolucionRepository.spec.ts
git commit -m "feat(planificacion): ResolucionRepository.marcarNoVisita

Convierte una visita todavía abierta en no_visita. El WHERE lleva tipo y
fecha_fin además del id, para que una carrera con cerrar afecte 0 filas en
vez de pisar el cierre.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `VisitasService.registrarNoVisitaSobreVisitaAbierta`

Los guards, la transacción y el aviso a Cromo. El orden importa y es el del dominio: **primero se persiste el hecho, después se notifica** — un Cromo caído es un mensaje demorado, no una pérdida de datos.

**Files:**
- Modify: `src/services/planificacion/VisitasService.ts` (agregar después de `registrarNoVisita`, ~línea 250)
- Test: `src/services/planificacion/VisitasService.spec.ts`

**Interfaces:**
- Consumes: `ResolucionRepository.marcarNoVisita` (Task 1), `VisitasService.resolveVisitaPropia` (privado, ya existe: devuelve `{ resolucion, vendedor, fila }`), `MotivosService.mapById`, `validarMotivosDeVisita`, `ResolucionRepository.guardarMotivos`, `CrmEventoVisitaService.notificar`.
- Produces: `VisitasService.registrarNoVisitaSobreVisitaAbierta(user: IUser, visitaId: number, motivoIds: number[]): Promise<INoVisitaResult>` — `INoVisitaResult` es `{ rotacionClienteId: number }`, ya existe en `src/types/planificacion.ts`.

- [ ] **Step 1: Write the failing tests**

Agregar en `src/services/planificacion/VisitasService.spec.ts`, después del `describe('registrarNoVisita — aviso a Cromo')`:

```ts
describe('registrarNoVisitaSobreVisitaAbierta', () => {
    beforeEach(() => {
        mockedResolucionById.mockResolvedValue({
            id: 5,
            rotacionClienteId: 11,
            tipo: 'visita',
            fechaFin: null,
        } as any)
        const mockedMarcar = ResolucionRepository.marcarNoVisita as jest.MockedFunction<
            typeof ResolucionRepository.marcarNoVisita
        >
        mockedMarcar.mockResolvedValue(1)
    })

    it('convierte la visita y guarda los motivos en la misma transacción', async () => {
        const result = await VisitasService.registrarNoVisitaSobreVisitaAbierta(user, 5, [1])

        expect(ResolucionRepository.marcarNoVisita).toHaveBeenCalledWith(5, { id: 'tx' })
        expect(mockedGuardarMotivos).toHaveBeenCalledWith(5, [1], { id: 'tx' })
        expect(result).toEqual({ rotacionClienteId: 11 })
    })

    // La inmutabilidad de pl_resolucion vive acá: una resolución YA CERRADA no se toca.
    it('rechaza una visita ya cerrada sin escribir nada', async () => {
        mockedResolucionById.mockResolvedValue({
            id: 5,
            rotacionClienteId: 11,
            tipo: 'visita',
            fechaFin: '2026-09-15T13:00:00.000Z',
        } as any)

        await expect(
            VisitasService.registrarNoVisitaSobreVisitaAbierta(user, 5, [1]),
        ).rejects.toMatchObject({ statusCode: 409, code: 'VISITA_YA_CERRADA' })
        expect(mockedTransaction).not.toHaveBeenCalled()
    })

    it('rechaza una fila que ya es no_visita', async () => {
        mockedResolucionById.mockResolvedValue({
            id: 5,
            rotacionClienteId: 11,
            tipo: 'no_visita',
            fechaFin: '2026-09-15T13:00:00.000Z',
        } as any)

        await expect(
            VisitasService.registrarNoVisitaSobreVisitaAbierta(user, 5, [1]),
        ).rejects.toMatchObject({ statusCode: 409, code: 'CICLO_CLIENTE_YA_RESUELTO' })
    })

    it('rechaza un motivo de nivel ofrecimiento sin escribir nada', async () => {
        await expect(
            VisitasService.registrarNoVisitaSobreVisitaAbierta(user, 5, [10]),
        ).rejects.toMatchObject({ statusCode: 400, code: 'MOTIVO_NIVEL_INVALIDO' })
        expect(mockedTransaction).not.toHaveBeenCalled()
    })

    // La carrera con `cerrar`: el guard pasó, pero para cuando llegó el UPDATE la visita
    // ya estaba cerrada. El repo devuelve 0 filas y eso tiene que ser un 409, no un OK.
    it('traduce a 409 el UPDATE que no afectó ninguna fila', async () => {
        const mockedMarcar = ResolucionRepository.marcarNoVisita as jest.MockedFunction<
            typeof ResolucionRepository.marcarNoVisita
        >
        mockedMarcar.mockResolvedValue(0)

        await expect(
            VisitasService.registrarNoVisitaSobreVisitaAbierta(user, 5, [1]),
        ).rejects.toMatchObject({ statusCode: 409, code: 'VISITA_YA_CERRADA' })
        expect(mockedGuardarMotivos).not.toHaveBeenCalled()
    })

    it('avisa a Cromo con el tipo ya convertido, después de persistir', async () => {
        await VisitasService.registrarNoVisitaSobreVisitaAbierta(user, 5, [1])

        expect(mockedNotificar).toHaveBeenCalledWith({
            vendedorCode: 'V 2',
            resolucion: expect.objectContaining({ id: 5, tipo: 'no_visita' }),
            fila: expect.objectContaining({ id: 11 }),
        })
    })

    it('un Cromo caído no rompe la operación', async () => {
        mockedNotificar.mockRejectedValue(new Error('cromo caído'))

        await expect(
            VisitasService.registrarNoVisitaSobreVisitaAbierta(user, 5, [1]),
        ).resolves.toEqual({ rotacionClienteId: 11 })
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- VisitasService`
Expected: FAIL — `VisitasService.registrarNoVisitaSobreVisitaAbierta is not a function`.

- [ ] **Step 3: Write the implementation**

En `src/services/planificacion/VisitasService.ts`, después de `registrarNoVisita`:

```ts
    /**
     * "No visité" sobre una visita YA INICIADA: el vendedor toca Iniciar en la vereda (el
     * gate de los 100 m lo empuja a eso) y adentro se entera de que el local está cerrado
     * o que el encargado se fue de vacaciones.
     *
     * Convierte la resolución abierta en vez de crear una nueva: el UNIQUE
     * (rotacion_cliente_id) ya está ocupado, y `registrarNoVisita` rebota con
     * VISITA_ACTIVA_EXISTENTE. Tampoco se borra la fila: se perdería el coord_inicio, que
     * es la evidencia de que estuvo parado en la puerta.
     *
     * Los pl_visita_rubro que hayan quedado cargados NO se borran: no contaminan ningún
     * indicador (AnaliticaService sólo lee ofrecimientos de filas tipo='visita') y son
     * rastro de lo que pasó.
     *
     * Sin captura de ubicación a propósito: es la salida de emergencia, y condicionarla a
     * un fix de GPS (que puede tardar ~23s y fallar) reintroduce el bloqueo que esto viene
     * a resolver.
     */
    static async registrarNoVisitaSobreVisitaAbierta(
        user: IUser,
        visitaId: number,
        motivoIds: number[],
    ): Promise<INoVisitaResult> {
        const { resolucion, vendedor, fila } = await VisitasService.resolveVisitaPropia(
            user,
            visitaId,
        )

        if (resolucion.tipo !== 'visita') {
            throw new CustomError(409, 'Este cliente ya fue resuelto en esta semana', {
                code: 'CICLO_CLIENTE_YA_RESUELTO',
            })
        }
        // Acá vive la inmutabilidad de pl_resolucion: cerrada no se toca nunca más.
        if (resolucion.fechaFin) {
            throw new CustomError(409, 'La visita ya fue cerrada', {
                code: 'VISITA_YA_CERRADA',
            })
        }

        const catalogo = await MotivosService.mapById()
        validarMotivosDeVisita(motivoIds, catalogo)

        await sequelizeWritePlanificacion.transaction(async transaction => {
            const afectadas = await ResolucionRepository.marcarNoVisita(visitaId, transaction)
            // 0 filas = alguien cerró la visita entre el guard y esta escritura. Cortar
            // acá deja la transacción sin efecto, en vez de guardar motivos sueltos
            // colgando de una visita que sí se cerró.
            if (afectadas === 0) {
                throw new CustomError(409, 'La visita ya fue cerrada', {
                    code: 'VISITA_YA_CERRADA',
                })
            }
            await ResolucionRepository.guardarMotivos(visitaId, motivoIds, transaction)
        })

        // Igual que en registrarNoVisita: el hecho ya está persistido, el aviso sale
        // best-effort y nunca bloquea al vendedor.
        void CrmEventoVisitaService.notificar({
            vendedorCode: vendedor,
            resolucion: { ...resolucion, tipo: 'no_visita', fechaFin: new Date().toISOString() },
            fila,
        }).catch(err =>
            log.error('Error inesperado notificando a Cromo', {
                error: err instanceof Error ? err.message : err,
            }),
        )

        return { rotacionClienteId: fila.id }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- VisitasService`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/VisitasService.ts src/services/planificacion/VisitasService.spec.ts
git commit -m "feat(planificacion): registrar No visité sobre una visita ya abierta

Convierte la resolución abierta a no_visita en vez de crear una nueva (el
UNIQUE ya está ocupado) o borrarla (se perdería coord_inicio). Rechaza la
visita ya cerrada: ahí sí vale la inmutabilidad de pl_resolucion.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Controller + ruta

**Files:**
- Modify: `src/controllers/planificacionController.ts` (agregar después de `noVisita`, ~línea 623)
- Modify: `src/routes/planificacion.ts` (agregar después de la ruta `/visitas/no-visita`, ~línea 199)
- Test: `src/controllers/planificacionController.spec.ts`

**Interfaces:**
- Consumes: `VisitasService.registrarNoVisitaSobreVisitaAbierta` (Task 2).
- Produces: `POST /planificacion/visitas/:id/no-visita`, body `{ motivoIds: number[] }`, respuesta `{ ok: 1, data: { rotacionClienteId } }`.

- [ ] **Step 1: Write the failing tests**

Agregar en `src/controllers/planificacionController.spec.ts`, después del `describe('noVisita')`:

```ts
    describe('noVisitaDeVisitaAbierta', () => {
        it('returns 200 with result on happy path', async () => {
            mockedVisitasService.registrarNoVisitaSobreVisitaAbierta.mockResolvedValue({
                rotacionClienteId: 11,
            })

            const req = buildReq({ params: { id: '5' }, body: { motivoIds: [3] } })
            const res = buildRes()

            await PlanificacionController.noVisitaDeVisitaAbierta(req, res)

            expect(
                mockedVisitasService.registrarNoVisitaSobreVisitaAbierta,
            ).toHaveBeenCalledWith(fakeUser, 5, [3])
            expect(res.status).toHaveBeenCalledWith(200)
            expect(res.json).toHaveBeenCalledWith({
                ok: 1,
                data: { rotacionClienteId: 11 },
            })
        })

        it('returns 400 when el id no es numérico', async () => {
            const req = buildReq({ params: { id: 'abc' }, body: { motivoIds: [3] } })
            const res = buildRes()

            await PlanificacionController.noVisitaDeVisitaAbierta(req, res)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(
                mockedVisitasService.registrarNoVisitaSobreVisitaAbierta,
            ).not.toHaveBeenCalled()
        })

        it('returns 400 when motivoIds is not an array', async () => {
            const req = buildReq({ params: { id: '5' }, body: { motivoIds: 'nope' } })
            const res = buildRes()

            await PlanificacionController.noVisitaDeVisitaAbierta(req, res)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(
                mockedVisitasService.registrarNoVisitaSobreVisitaAbierta,
            ).not.toHaveBeenCalled()
        })

        it('propaga el código del CustomError del service', async () => {
            mockedVisitasService.registrarNoVisitaSobreVisitaAbierta.mockRejectedValue(
                new CustomError(409, 'La visita ya fue cerrada', { code: 'VISITA_YA_CERRADA' }),
            )

            const req = buildReq({ params: { id: '5' }, body: { motivoIds: [3] } })
            const res = buildRes()

            await PlanificacionController.noVisitaDeVisitaAbierta(req, res)

            expect(res.status).toHaveBeenCalledWith(409)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ code: 'VISITA_YA_CERRADA' }),
            )
        })
    })
```

Si `CustomError` no está importado todavía en ese archivo de tests, agregar `import { CustomError } from '../utils/errors'` arriba.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- planificacionController`
Expected: FAIL — `PlanificacionController.noVisitaDeVisitaAbierta is not a function`.

- [ ] **Step 3: Write the controller**

En `src/controllers/planificacionController.ts`, después de `noVisita`:

```ts
    /**
     * "No visité" sobre una visita ya iniciada. El id viaja en la URL (es la resolución
     * abierta), no en el body: el cliente ya está identificado por esa fila.
     */
    static async noVisitaDeVisitaAbierta(req: Request, res: Response): Promise<void> {
        try {
            const visitaId = parseInt(req.params.id, 10)
            if (isNaN(visitaId)) {
                res.status(400).json({ ok: 0, error: 'id de visita inválido' })
                return
            }

            const motivoIds = (req.body as { motivoIds?: unknown })?.motivoIds
            if (!Array.isArray(motivoIds)) {
                res.status(400).json({ ok: 0, error: 'motivoIds (array) es requerido' })
                return
            }

            const result = await VisitasService.registrarNoVisitaSobreVisitaAbierta(
                req.user!,
                visitaId,
                motivoIds.map(Number),
            )
            res.status(200).json({ ok: 1, data: result })
        } catch (err) {
            if (err instanceof CustomError) {
                res.status(err.statusCode).json(err.toJSON())
            } else {
                res.status(500).json({ ok: 0, error: 'Error inesperado' })
            }
        }
    }
```

- [ ] **Step 4: Add the route**

En `src/routes/planificacion.ts`, después de la ruta `/visitas/no-visita`:

```ts
/**
 * @openapi
 * /planificacion/visitas/{id}/no-visita:
 *   post:
 *     summary: Registrar "No visité" sobre una visita YA INICIADA
 *     description: >
 *       El vendedor inició la visita (típicamente en la vereda, por el gate de cercanía)
 *       y adentro se encontró con el local cerrado. Convierte la resolución abierta en
 *       no_visita con sus motivos, conservando coord_inicio. No aplica sobre una visita
 *       ya cerrada: pl_resolucion es inmutable una vez resuelta.
 *     responses:
 *       200:
 *         description: Registrado. Devuelve { rotacionClienteId }.
 *       400:
 *         description: id inválido o motivoIds ausente/no-array
 *       409:
 *         description: VISITA_YA_CERRADA o CICLO_CLIENTE_YA_RESUELTO
 */
router.post(
    '/visitas/:id/no-visita',
    authMiddleware,
    authorize('vendedor'),
    async (req: Request, res: Response) => {
        PlanificacionController.noVisitaDeVisitaAbierta(req, res)
    },
)
```

- [ ] **Step 5: Run the full backend suite**

Run: `npm test`
Expected: PASS, sin regresiones.

- [ ] **Step 6: Verify it compiles**

Run: `npm run build`
Expected: sin errores de TypeScript.

- [ ] **Step 7: Commit**

```bash
git add src/controllers/planificacionController.ts src/controllers/planificacionController.spec.ts src/routes/planificacion.ts
git commit -m "feat(planificacion): POST /visitas/:id/no-visita

Expone el registro de No visité sobre una visita abierta.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# PARTE B — Front (`app-planificacion`)

Antes de la Tarea 4, una sola vez:

```bash
cd "C:/Users/matia/OneDrive/Documentos/distri/app-planificacion"
git checkout master && git pull
git checkout -b feat/no-visite-con-visita-abierta
```

---

### Task 4: Cliente de API + hook

**Files:**
- Modify: `src/api/planificacion.ts` (después de `registrarNoVisita`, ~línea 116)
- Modify: `src/hooks/useVisitas.ts` (después de `useNoVisita`)
- Test: `src/hooks/useVisitas.test.tsx` (crear si no existe; si existe, agregar el `describe`)

**Interfaces:**
- Consumes: `apiClient`, `INoVisitaResult` (ya existe en `src/types/planificacion.ts`), `useMutacionDeVisita` (privado de `useVisitas.ts`).
- Produces:
  - `noVisitaSobreVisitaAbierta(visitaId: number, motivoIds: number[]): Promise<INoVisitaResult>`
  - `useNoVisitaSobreVisitaAbierta()` — mutación con `mutateAsync({ visitaId, motivoIds })`.

- [ ] **Step 1: Write the failing test**

Crear (o extender) `src/hooks/useVisitas.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useNoVisitaSobreVisitaAbierta } from './useVisitas'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

it('manda visitaId y motivoIds al endpoint de la visita abierta', async () => {
    ;(api.noVisitaSobreVisitaAbierta as any).mockResolvedValue({ rotacionClienteId: 42 })

    const { result } = renderHook(() => useNoVisitaSobreVisitaAbierta(), { wrapper })
    await result.current.mutateAsync({ visitaId: 5, motivoIds: [1, 2] })

    await waitFor(() =>
        expect(api.noVisitaSobreVisitaAbierta).toHaveBeenCalledWith(5, [1, 2]),
    )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useVisitas`
Expected: FAIL — `useNoVisitaSobreVisitaAbierta is not a function`.

- [ ] **Step 3: Write the implementation**

En `src/api/planificacion.ts`, después de `registrarNoVisita`:

```ts
/** "No visité" sobre una visita YA INICIADA: convierte la resolución abierta en vez de
 *  crear una nueva. El endpoint de arriba (`/visitas/no-visita`) no sirve para este caso —
 *  rebota con VISITA_ACTIVA_EXISTENTE porque la fila ya tiene resolución. */
export const noVisitaSobreVisitaAbierta = async (
    visitaId: number,
    motivoIds: number[],
): Promise<INoVisitaResult> => {
    const res = await apiClient.post(`/planificacion/visitas/${visitaId}/no-visita`, {
        motivoIds,
    })
    return res.data.data
}
```

En `src/hooks/useVisitas.ts`, después de `useNoVisita`:

```ts
/** Ver noVisitaSobreVisitaAbierta: mismo hecho que useNoVisita, otra puerta — acá la fila
 *  ya tiene una resolución abierta y lo que se hace es convertirla. */
export function useNoVisitaSobreVisitaAbierta() {
    return useMutacionDeVisita((args: { visitaId: number; motivoIds: number[] }) =>
        noVisitaSobreVisitaAbierta(args.visitaId, args.motivoIds),
    )
}
```

Agregar `noVisitaSobreVisitaAbierta` al import de `@/api/planificacion` al tope de `useVisitas.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useVisitas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/planificacion.ts src/hooks/useVisitas.ts src/hooks/useVisitas.test.tsx
git commit -m "feat(visita): cliente y hook de No visité sobre visita abierta

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `BottomSheet` — menú `⋯` en el header

Genérico: el sheet no sabe nada de visitas. El detalle que importa es el catcher del popover: el overlay del sheet cierra **el sheet** al click, así que sin `stopPropagation` abrir el menú y tocar afuera cerraría la visita entera.

**Files:**
- Modify: `src/components/ui/BottomSheet.tsx`
- Test: `src/components/ui/BottomSheet.test.tsx`

**Interfaces:**
- Produces: prop `acciones?: ReactNode` en `BottomSheetProps`. Cuando viene, el header muestra un botón `aria-label="Más acciones"` que togglea un popover con ese contenido.

- [ ] **Step 1: Write the failing tests**

Agregar en `src/components/ui/BottomSheet.test.tsx`:

```tsx
it('sin `acciones` no dibuja el botón de menú', () => {
    render(<BottomSheet open onClose={() => {}} title="X"><div>contenido</div></BottomSheet>)
    expect(screen.queryByLabelText('Más acciones')).not.toBeInTheDocument()
})

it('con `acciones` abre el popover al tocar el menú', async () => {
    render(
        <BottomSheet open onClose={() => {}} title="X" acciones={<button>No visité</button>}>
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(screen.queryByText('No visité')).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Más acciones'))
    expect(screen.getByText('No visité')).toBeInTheDocument()
})

// El overlay del sheet cierra EL SHEET al click. Sin stopPropagation en el catcher del
// popover, tocar afuera del menú cerraría la visita entera.
it('tocar fuera del popover lo cierra sin cerrar el sheet', async () => {
    const onClose = vi.fn()
    render(
        <BottomSheet open onClose={onClose} title="X" acciones={<button>No visité</button>}>
            <div>contenido</div>
        </BottomSheet>,
    )
    await userEvent.click(screen.getByLabelText('Más acciones'))
    await userEvent.click(screen.getByTestId('cerrar-menu-acciones'))

    expect(screen.queryByText('No visité')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- BottomSheet`
Expected: FAIL — no existe `Más acciones`.

- [ ] **Step 3: Write the implementation**

En `src/components/ui/BottomSheet.tsx`:

1. Import: `import { ChevronDown, MoreVertical, X } from 'lucide-react'` y `import { useState } from 'react'`.
2. En `BottomSheetProps`, después de `onMinimize`:

```ts
    /** Si se pasa, aparece un botón `⋯` en el header que abre un popover con este
     *  contenido. Pensado para acciones secundarias que no pueden gastar alto del pie
     *  (ej. "No visité" durante la visita). El sheet no sabe qué son: sólo las muestra. */
    acciones?: ReactNode
```

3. En la firma del componente agregar `acciones,` y, antes del `if (!open)`:

```ts
    const [menuAbierto, setMenuAbierto] = useState(false)
```

4. En el header, **antes** del bloque de `onMinimize`, dentro del `div` de los botones:

```tsx
                            {acciones && (
                                <div className="relative">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Más acciones"
                                        onClick={() => setMenuAbierto(a => !a)}
                                        className="h-[30px] w-[30px] bg-[#F0F2F7] text-dsmuted hover:bg-[#e3e6ee]"
                                    >
                                        <MoreVertical className="h-[15px] w-[15px]" strokeWidth={2.4} />
                                    </Button>
                                    {menuAbierto && (
                                        <>
                                            {/* Catcher propio: el overlay del sheet cierra EL SHEET
                                                al click, así que sin stopPropagation tocar afuera
                                                del menú cerraría la visita entera. */}
                                            <div
                                                data-testid="cerrar-menu-acciones"
                                                className="fixed inset-0 z-[60]"
                                                onClick={e => {
                                                    e.stopPropagation()
                                                    setMenuAbierto(false)
                                                }}
                                            />
                                            <div
                                                className="absolute right-0 top-[34px] z-[61] min-w-[210px] rounded-xl border border-[#E4E8F0] bg-white py-1 shadow-[0_8px_24px_rgba(10,15,30,.16)]"
                                                onClick={() => setMenuAbierto(false)}
                                            >
                                                {acciones}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
```

5. Cerrar el menú cuando el sheet se cierra, junto al `if (!open)`:

```ts
    if (!open) {
        if (menuAbierto) setMenuAbierto(false)
        return null
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- BottomSheet`
Expected: PASS (los 3 nuevos y los que ya había).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/BottomSheet.tsx src/components/ui/BottomSheet.test.tsx
git commit -m "feat(ui): menú de acciones opcional en el header del BottomSheet

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `ResolucionSheet` — prop `aviso`

**Files:**
- Modify: `src/components/ResolucionSheet.tsx`
- Test: `src/components/ResolucionSheet.test.tsx`

**Interfaces:**
- Produces: prop `aviso?: ReactNode` en `ResolucionSheetProps`, renderizada arriba de la lista de motivos.

- [ ] **Step 1: Write the failing test**

Agregar en `src/components/ResolucionSheet.test.tsx`:

```tsx
it('muestra el aviso arriba de los motivos cuando se lo pasan', () => {
    render(
        <ResolucionSheet
            open
            motivos={[]}
            confirmLabel="Registrar"
            aviso="Cargaste 3 rubros."
            onConfirm={() => {}}
            onClose={() => {}}
        />,
    )
    expect(screen.getByText('Cargaste 3 rubros.')).toBeInTheDocument()
})

it('sin aviso no deja ningún hueco', () => {
    render(
        <ResolucionSheet
            open
            motivos={[]}
            confirmLabel="Registrar"
            onConfirm={() => {}}
            onClose={() => {}}
        />,
    )
    expect(screen.queryByTestId('resolucion-aviso')).not.toBeInTheDocument()
})
```

Si el archivo de test no existe, crearlo con los imports del patrón del repo:
`import { render, screen } from '@testing-library/react'`, `import ResolucionSheet from './ResolucionSheet'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- ResolucionSheet`
Expected: FAIL — el texto no aparece.

- [ ] **Step 3: Write the implementation**

En `src/components/ResolucionSheet.tsx`: agregar `import type { ReactNode } from 'react'`, la prop en la interfaz y el destructuring, y renderizarla antes del `<div className="flex flex-col gap-2">`:

```tsx
interface ResolucionSheetProps {
    // …lo que ya hay…
    /** Aviso opcional arriba de la lista de motivos. Se usa para decirle al vendedor que
     *  los rubros que ya cargó no van a contar como visita. */
    aviso?: ReactNode
}
```

```tsx
            {aviso && (
                <div
                    data-testid="resolucion-aviso"
                    className="mb-3 rounded-md border border-[#FCD9A5] bg-[#FFF7EC] px-3 py-2 text-[12.5px] font-semibold leading-snug text-[#8A5A12]"
                >
                    {aviso}
                </div>
            )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ResolucionSheet`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ResolucionSheet.tsx src/components/ResolucionSheet.test.tsx
git commit -m "feat(visita): aviso opcional en el sheet de motivos

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `VisitaSheet` — el ítem "No visité" en el menú

Va en el menú del header y **no en el pie**: el pie es el recurso más escaso del sheet (entran 5 filas de rubros) y una segunda salida del tamaño de un CTA al lado de "Cerrar visita" se lee como el atajo fácil para no cargar rubros.

**Files:**
- Modify: `src/components/VisitaSheet.tsx`
- Test: `src/components/VisitaSheet.test.tsx`

**Interfaces:**
- Consumes: `BottomSheet.acciones` (Task 5), `completos` (ya calculado en el componente, línea ~371).
- Produces: prop `onNoVisita?: (rubrosCargados: number) => void` en `VisitaSheetProps`.

- [ ] **Step 1: Write the failing tests**

Agregar en `src/components/VisitaSheet.test.tsx` (reusar el helper de render que ya tenga el archivo; si monta con `visitaCerrada={false}` por defecto, alcanza con pasar `onNoVisita`):

```tsx
it('con la visita abierta ofrece "No visité" en el menú del header', async () => {
    const onNoVisita = vi.fn()
    renderSheet({ visitaCerrada: false, onNoVisita })

    await userEvent.click(await screen.findByLabelText('Más acciones'))
    await userEvent.click(screen.getByText('No visité'))

    expect(onNoVisita).toHaveBeenCalled()
})

// El sheet de una visita cerrada es de CONSULTA: pl_resolucion es inmutable.
it('con la visita cerrada no ofrece el menú', async () => {
    renderSheet({ visitaCerrada: true, onNoVisita: vi.fn() })

    expect(screen.queryByLabelText('Más acciones')).not.toBeInTheDocument()
})

it('informa cuántos rubros llevaba cargados', async () => {
    const onNoVisita = vi.fn()
    // El helper del archivo ya mockea GET /ofrecimientos; este caso necesita al menos
    // un ofrecimiento COMPLETO (con motivos) para que `completos` sea 1.
    renderSheet({ visitaCerrada: false, onNoVisita, ofrecimientosCompletos: 1 })

    await userEvent.click(await screen.findByLabelText('Más acciones'))
    await userEvent.click(screen.getByText('No visité'))

    expect(onNoVisita).toHaveBeenCalledWith(1)
})
```

Si el archivo no tiene un helper `renderSheet`, escribir los tests con el mismo `render(...)` que usan los tests que ya están ahí, agregando `onNoVisita` a las props.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- VisitaSheet`
Expected: FAIL — no existe `Más acciones`.

- [ ] **Step 3: Write the implementation**

En `src/components/VisitaSheet.tsx`:

1. En `VisitaSheetProps`, después de `onVerPosicion`:

```ts
    /** Si se pasa y la visita está abierta, el menú `⋯` del header ofrece "No visité".
     *  Recibe cuántos rubros llevaba completos, para que el llamador pueda avisarle al
     *  vendedor que esos no van a contar. */
    onNoVisita?: (rubrosCargados: number) => void
```

2. Agregar `onNoVisita,` al destructuring.

3. Después del cálculo de `completos` / `faltanParaMinimo` (~línea 373):

```tsx
    // En el menú del header y NO en el pie: el pie es el recurso más escaso del sheet
    // (entran 5 filas de rubros), y una segunda salida del tamaño de un CTA al lado de
    // "Cerrar visita" se lee como el atajo para no cargar rubros. El sheet de una visita
    // cerrada es de consulta, así que ahí no va nada.
    const acciones =
        !visitaCerrada && onNoVisita ? (
            <button
                type="button"
                onClick={() => onNoVisita(completos)}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13.5px] font-semibold text-[#182645]"
            >
                <X className="h-[14px] w-[14px] text-dsred" strokeWidth={2.4} />
                No visité
            </button>
        ) : undefined
```

Verificar que `X` esté importado de `lucide-react` en este archivo; si no, agregarlo al import existente.

4. Pasarlo al `BottomSheet` principal (el de `open={open}`), junto a `onMinimize`:

```tsx
                acciones={acciones}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- VisitaSheet`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx
git commit -m "feat(visita): \"No visité\" en el menú del sheet de la visita abierta

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `VisitaFlow` — el flujo completo

**Files:**
- Modify: `src/components/VisitaFlow.tsx`
- Test: `src/components/VisitaFlow.test.tsx`

**Interfaces:**
- Consumes: `useNoVisitaSobreVisitaAbierta` (Task 4), `ResolucionSheet.aviso` (Task 6), `VisitaSheet.onNoVisita` (Task 7), `useMotivos('visita')`, `limpiarInicioVisita`, `limpiarVisitaEnCurso`, `errorCode`.
- Produces: nada nuevo hacia afuera — reusa `onVisitaCerrada` y `onAviso` que ya recibe.

- [ ] **Step 1: Write the failing tests**

Agregar en `src/components/VisitaFlow.test.tsx`:

```tsx
it('registrar "No visité" con la visita abierta llama al endpoint y suelta la visita', async () => {
    ;(api.noVisitaSobreVisitaAbierta as any).mockResolvedValue({ rotacionClienteId: 42 })
    ;(api.getMotivos as any).mockResolvedValue([
        { motivoId: 1, nivel: 'visita', descripcion: 'Cerrado', resultado: null, codigo: null, campos: [] },
    ])
    const onVisitaCerrada = vi.fn()
    // Harness con la visita YA iniciada (mismo patrón que los tests de cerrar visita
    // que ya están en este archivo).
    renderFlow({ clienteInicial: { ...cliente, estado: 'en_curso', visitaId: 7 }, onVisitaCerrada })

    fireEvent.click(await screen.findByLabelText('Más acciones'))
    fireEvent.click(screen.getByText('No visité'))
    fireEvent.click(await screen.findByText('Cerrado'))
    fireEvent.click(screen.getByText('Registrar'))

    await waitFor(() =>
        expect(api.noVisitaSobreVisitaAbierta).toHaveBeenCalledWith(7, [1]),
    )
    await waitFor(() => expect(onVisitaCerrada).toHaveBeenCalled())
    expect(leerVisitaEnCurso()).toBeNull()
})

it('avisa que los rubros cargados no van a contar', async () => {
    ;(api.getMotivos as any).mockResolvedValue([
        { motivoId: 1, nivel: 'visita', descripcion: 'Cerrado', resultado: null, codigo: null, campos: [] },
    ])
    // 2 ofrecimientos completos mockeados en GET /ofrecimientos (ver el helper del archivo).
    renderFlow({ clienteInicial: { ...cliente, estado: 'en_curso', visitaId: 7 }, ofrecimientosCompletos: 2 })

    fireEvent.click(await screen.findByLabelText('Más acciones'))
    fireEvent.click(screen.getByText('No visité'))

    expect(await screen.findByText(/Cargaste 2 rubros/)).toBeInTheDocument()
})

it('un cliente ya resuelto en el servidor cierra el flujo con aviso informativo', async () => {
    ;(api.noVisitaSobreVisitaAbierta as any).mockRejectedValue({
        response: { data: { code: 'VISITA_YA_CERRADA' } },
    })
    ;(api.getMotivos as any).mockResolvedValue([
        { motivoId: 1, nivel: 'visita', descripcion: 'Cerrado', resultado: null, codigo: null, campos: [] },
    ])
    const onAviso = vi.fn()
    renderFlow({ clienteInicial: { ...cliente, estado: 'en_curso', visitaId: 7 }, onAviso })

    fireEvent.click(await screen.findByLabelText('Más acciones'))
    fireEvent.click(screen.getByText('No visité'))
    fireEvent.click(await screen.findByText('Cerrado'))
    fireEvent.click(screen.getByText('Registrar'))

    await waitFor(() =>
        expect(onAviso).toHaveBeenCalledWith('info', expect.stringMatching(/ya estaba resuelto/i)),
    )
})
```

Adaptar `renderFlow` al harness que ya tiene el archivo (`Harness`): agregar las props que hagan falta siguiendo el patrón existente, sin reescribirlo.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- VisitaFlow`
Expected: FAIL — no existe el menú ni el flujo.

- [ ] **Step 3: Write the implementation**

En `src/components/VisitaFlow.tsx`:

1. Imports nuevos:

```ts
import ResolucionSheet from './ResolucionSheet'
import { useMotivos } from '@/hooks/useMotivos'
import { useCerrarVisita, useIniciarVisita, useNoVisitaSobreVisitaAbierta } from '@/hooks/useVisitas'
```

2. Estado y hooks, junto a los otros:

```ts
    const noVisitaAbierta = useNoVisitaSobreVisitaAbierta()
    const { data: motivosVisita = [] } = useMotivos('visita')
    // Cuántos rubros llevaba cargados cuando pidió "No visité". null = sheet cerrado.
    const [noVisitaRubros, setNoVisitaRubros] = useState<number | null>(null)
```

3. Limpiar el sheet al cambiar de cliente, dentro del `useEffect` que ya resetea `propuestaPendiente`:

```ts
        setNoVisitaRubros(null)
```

4. El handler, después de `onCerrarVisita`:

```ts
    /**
     * "No visité" con la visita YA ABIERTA: el vendedor inició en la vereda y adentro se
     * encontró con el local cerrado. NO captura ubicación a propósito — es la salida de
     * emergencia, y un fix de GPS que tarda ~23s y puede fallar reintroduciría el bloqueo
     * que esto viene a resolver.
     */
    async function onConfirmarNoVisita(motivoIds: number[]) {
        if (visitaId === null) return
        try {
            await noVisitaAbierta.mutateAsync({ visitaId, motivoIds })
            // Mismas anclas que un cierre: la visita dejó de estar en curso, así que la
            // barra flotante tiene que irse y el cliente quedar vetado de re-adopción.
            limpiarInicioVisita(visitaId)
            limpiarVisitaEnCurso()
            setNoVisitaRubros(null)
            onAviso?.('exito', 'Registrado')
            onVisitaCerrada()
            cerrarFlujo()
        } catch (err) {
            const code = errorCode(err)
            if (code === 'VISITA_YA_CERRADA' || code === 'CICLO_CLIENTE_YA_RESUELTO') {
                setNoVisitaRubros(null)
                onAviso?.('info', 'Este cliente ya estaba resuelto. Actualizamos tu agenda.')
                onVisitaCerrada()
                cerrarFlujo()
                return
            }
            onAviso?.('error', 'No se pudo registrar. Volvé a intentar.')
        }
    }
```

5. Pasar la acción al `VisitaSheet`, junto a `onVerPosicion`:

```tsx
                    onNoVisita={rubros => setNoVisitaRubros(rubros)}
```

6. Montar el sheet de motivos **después** de `VisitaSheet` en el árbol (para que pinte encima), antes del bloque de `MapaVisita`:

```tsx
            <ResolucionSheet
                open={noVisitaRubros !== null}
                motivos={motivosVisita}
                confirmLabel="Registrar"
                eyebrow="No visité"
                title={nombre}
                submitting={noVisitaAbierta.isPending}
                aviso={
                    noVisitaRubros && noVisitaRubros > 0
                        ? `Cargaste ${noVisitaRubros} ${noVisitaRubros === 1 ? 'rubro' : 'rubros'}. Al registrar «No visité» esta visita no cuenta como hecha.`
                        : undefined
                }
                onConfirm={onConfirmarNoVisita}
                onClose={() => setNoVisitaRubros(null)}
            />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- VisitaFlow`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/VisitaFlow.tsx src/components/VisitaFlow.test.tsx
git commit -m "feat(visita): registrar No visité desde la visita abierta

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `AgendaSemanaPage` — rutear los dos caminos a un solo hecho

Esta es la mitad indispensable: hoy el botón **Reagendar** se ve con el cliente `en_curso` (`ClienteCard` lo muestra con `!resuelto`), el vendedor entra por ahí a "No visité" y recibe un error genérico de red.

**Files:**
- Modify: `src/pages/AgendaSemanaPage.tsx` (`onConfirmNoVisita`, ~línea 403)
- Test: `src/pages/AgendaSemanaPage.test.tsx`

**Interfaces:**
- Consumes: `useNoVisitaSobreVisitaAbierta` (Task 4), `visitaEnCurso` (estado que ya vive en la página).

- [ ] **Step 1: Write the failing tests**

Agregar en `src/pages/AgendaSemanaPage.test.tsx`:

```tsx
it('con el cliente en curso, "No visité" va al endpoint de la visita abierta', async () => {
    fijarLunes()
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    ;(api.getAgendaSemana as any).mockResolvedValue({
        ...semanaVacia,
        LUN: [{ ...clienteLunes, estado: 'en_curso', visitaId: 7 }],
    })
    ;(api.getMotivos as any).mockResolvedValue([
        { motivoId: 1, nivel: 'visita', descripcion: 'Cerrado', resultado: null, codigo: null, campos: [] },
    ])
    ;(api.noVisitaSobreVisitaAbierta as any).mockResolvedValue({ rotacionClienteId: 42 })
    renderPage()

    fireEvent.click(await screen.findByText('Reagendar'))
    fireEvent.click(await screen.findByText('No visité'))
    fireEvent.click(screen.getByText('Registrar No visité'))
    fireEvent.click(await screen.findByText('Cerrado'))
    fireEvent.click(screen.getByText('Registrar'))

    await waitFor(() =>
        expect(api.noVisitaSobreVisitaAbierta).toHaveBeenCalledWith(7, [1]),
    )
    expect(api.registrarNoVisita).not.toHaveBeenCalled()
})

it('con el cliente pendiente sigue usando el endpoint de siempre', async () => {
    fijarLunes()
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    ;(api.getAgendaSemana as any).mockResolvedValue({ ...semanaVacia, LUN: [clienteLunes] })
    ;(api.getMotivos as any).mockResolvedValue([
        { motivoId: 1, nivel: 'visita', descripcion: 'Cerrado', resultado: null, codigo: null, campos: [] },
    ])
    ;(api.registrarNoVisita as any).mockResolvedValue({ rotacionClienteId: 42 })
    renderPage()

    fireEvent.click(await screen.findByText('Reagendar'))
    fireEvent.click(await screen.findByText('No visité'))
    fireEvent.click(screen.getByText('Registrar No visité'))
    fireEvent.click(await screen.findByText('Cerrado'))
    fireEvent.click(screen.getByText('Registrar'))

    await waitFor(() =>
        expect(api.registrarNoVisita).toHaveBeenCalledWith({
            rotacionClienteId: 42,
            motivoIds: [1],
        }),
    )
    expect(api.noVisitaSobreVisitaAbierta).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- AgendaSemanaPage`
Expected: FAIL — el primer test llama a `registrarNoVisita`.

- [ ] **Step 3: Write the implementation**

En `src/pages/AgendaSemanaPage.tsx`:

1. Import y hook:

```ts
import { useNoVisita, useNoVisitaSobreVisitaAbierta, useReintentarSeguimiento } from '@/hooks/useVisitas'
```

```ts
    const noVisitaAbierta = useNoVisitaSobreVisitaAbierta()
```

2. Reemplazar el cuerpo de `onConfirmNoVisita`:

```ts
    async function onConfirmNoVisita(motivoIds: number[]) {
        const cliente = noVisitaCliente
        setNoVisitaCliente(null)
        if (!cliente) return
        // La visita abierta NO se puede registrar con el endpoint de siempre: la fila ya
        // tiene resolución y el backend rebota con VISITA_ACTIVA_EXISTENTE — que es lo que
        // hasta ahora le mostraba al vendedor un "No se pudo registrar" genérico. El
        // visitaId no puede salir sólo del snapshot de la agenda: si la visita se inició en
        // esta sesión, la card todavía puede decir `pendiente`. `visitaEnCurso` es la
        // fuente de verdad para ese caso (mismo criterio que VisitaFlow).
        const enCurso =
            visitaEnCurso?.cliente.rotacionClienteId === cliente.rotacionClienteId
                ? visitaEnCurso.visitaId
                : cliente.estado === 'en_curso'
                  ? cliente.visitaId
                  : null
        try {
            if (enCurso !== null) {
                await noVisitaAbierta.mutateAsync({ visitaId: enCurso, motivoIds })
                limpiarInicioVisita(enCurso)
                limpiarVisitaEnCurso()
                if (visitaEnCurso) {
                    rotacionesClienteSueltas.current.add(visitaEnCurso.cliente.rotacionClienteId)
                    setVisitaEnCurso(null)
                }
            } else {
                await noVisita.mutateAsync({
                    rotacionClienteId: cliente.rotacionClienteId,
                    motivoIds,
                })
            }
            mostrar('exito', 'Registrado')
        } catch (err) {
            const code = errorCode(err)
            const yaResuelto = code === 'CICLO_CLIENTE_YA_RESUELTO' || code === 'VISITA_YA_CERRADA'
            mostrar(
                yaResuelto ? 'info' : 'error',
                yaResuelto
                    ? 'Este cliente ya estaba resuelto. Actualizamos tu agenda.'
                    : 'No se pudo registrar. Volvé a intentar.',
            )
        }
    }
```

3. Agregar el import de `limpiarInicioVisita` (de `@/lib/visitaTimer`) si no está; `limpiarVisitaEnCurso` ya se usa en el archivo.

4. En el `ResolucionSheet` que ya está montado en la página, cambiar `submitting` para cubrir las dos mutaciones:

```tsx
                submitting={noVisita.isPending || noVisitaAbierta.isPending}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- AgendaSemanaPage`
Expected: PASS.

- [ ] **Step 5: Run the full front suite + lint + build**

Run: `npm test && npm run lint && npm run build`
Expected: todo en verde, sin regresiones.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AgendaSemanaPage.tsx src/pages/AgendaSemanaPage.test.tsx
git commit -m "fix(agenda): \"No visité\" desde Reagendar con la visita ya abierta

El botón Reagendar se ve con el cliente en curso, y por ahí el no_visita
rebotaba con un 409 que el vendedor leía como falla de red. Ahora rutea al
endpoint de la visita abierta.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Documentación viva

`docs/dominio/` describe **cómo funciona el sistema hoy**; es lo que hay que corregir cuando el código la contradice. Dos afirmaciones vigentes quedan incompletas con esta feature.

**Files:**
- Modify: `docs/dominio/modelo.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Leer lo que hay que corregir**

Run: `grep -n "no_visita\|FILA_RESUELTA\|inmutable" docs/dominio/modelo.md`

Buscar la afirmación sobre `pl_resolucion` inmutable / "resolver es la única puerta sin retorno" y la sección de `no_visita`.

- [ ] **Step 2: Precisar la inmutabilidad en `modelo.md`**

Donde se dice que `pl_resolucion` es inmutable, aclarar el alcance exacto (respetando el estilo del archivo):

> La inmutabilidad es de la resolución **cerrada**. Una visita todavía abierta (`fecha_fin
> NULL`) se puede convertir en `no_visita` con sus motivos: es el vendedor que inició en la
> vereda y adentro se encontró con el local cerrado
> (`POST /planificacion/visitas/:id/no-visita`). No es una corrección de un hecho anterior —
> es la primera y única declaración del hecho. La visita **cerrada** no se toca nunca.

Y en la sección de `no_visita`, agregar que un `no_visita` **convertido** conserva el
`coord_inicio` de la visita que llegó a arrancar, a diferencia del que nace de cero.

- [ ] **Step 3: Actualizar `CLAUDE.md`**

En "Decisiones no obvias", agregar un bullet:

> - **"No visité" también se puede registrar con la visita YA ABIERTA**, y es el mismo hecho
>   por dos puertas: el menú `⋯` de `VisitaSheet` y el "Reagendar → No visité" de la card
>   (que se ve con el cliente `en_curso`). Las dos llaman a
>   `POST /planificacion/visitas/:id/no-visita`, que **convierte** la resolución abierta en
>   vez de crear una nueva — el `UNIQUE (rotacion_cliente_id)` ya está ocupado y
>   `/visitas/no-visita` rebota con `VISITA_ACTIVA_EXISTENTE`. Existe porque el gate de los
>   100 m empuja a iniciar en la vereda, y adentro aparece el local cerrado: sin esta salida
>   la única era cerrar una visita falsa que infla la cobertura. **No captura ubicación** a
>   propósito (es la salida de emergencia; un fix de GPS que tarda ~23s reintroduce el
>   bloqueo), y **no borra los rubros ya cargados**: la analítica sólo lee ofrecimientos de
>   filas `tipo='visita'`, así que no ensucian nada.

- [ ] **Step 4: Commit**

```bash
git add docs/dominio/modelo.md CLAUDE.md
git commit -m "docs(dominio): No visité sobre una visita abierta

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Verificación end-to-end a mano

El spec deja una afirmación **deducida, no observada**: que el vendedor con la visita abierta que entra por "Reagendar → No visité" hoy ve *"No se pudo registrar. Volvé a intentar."* Confirmarlo antes de abrir el PR — es lo que justifica el texto del PR.

- [ ] **Step 1: Levantar backend y front**

Backend: `npm run dev` en api-vendedores (rama `feat/no-visita-sobre-visita-abierta`).
Front: `npm run dev` en app-planificacion (rama `feat/no-visite-con-visita-abierta`).

- [ ] **Step 2: Reproducir el caso viejo**

Con `git stash` del cambio de `AgendaSemanaPage` (o contra el backend en `master`), iniciar una visita y probar "Reagendar → No visité". Anotar el mensaje exacto que aparece.

- [ ] **Step 3: Probar los dos caminos nuevos**

1. Iniciar visita en un cliente. Abrir el menú `⋯` del sheet → "No visité" → elegir motivo → Registrar. Verificar: toast "Registrado", la barra flotante de visita en curso desaparece, y la card queda tachada como resuelta.
2. Iniciar visita en otro cliente, cargar 2 rubros, y repetir desde "Reagendar → No visité". Verificar que aparece el aviso de los rubros cargados.
3. En `/analitica`, verificar que esos clientes cuentan en **No visité** y **no** en visitados.

- [ ] **Step 4: Ajustar el §1 del spec si hiciera falta**

Si el mensaje observado no es el que dice el spec, corregir esa nota (y borrar el bloque de "pendiente de confirmar").

- [ ] **Step 5: Abrir los PRs**

Backend primero (tiene que estar mergeado o al menos desplegado antes que el front).

Backend:

```bash
gh pr create --title "feat(planificacion): registrar No visité sobre una visita ya abierta" --body "$(cat <<'BODY'
El vendedor inicia la visita en la vereda (lo empuja el gate de cercanía del front) y
adentro se entera de que el local está cerrado. Hasta ahora no tenía salida: `no_visita`
exige fila sin resolver, y cerrar graba una visita hecha que infla la cobertura.

`POST /planificacion/visitas/:id/no-visita` convierte la resolución abierta en `no_visita`
con sus motivos, conservando `coord_inicio`. Rechaza la visita ya cerrada: ahí sí vale la
inmutabilidad de `pl_resolucion`.

Sin captura de ubicación (es la salida de emergencia) y sin borrar los `pl_visita_rubro`
cargados (la analítica sólo lee ofrecimientos de filas `tipo='visita'`).

Spec: app-planificacion `docs/superpowers/specs/2026-09-15-no-visite-con-visita-abierta-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

Front (recién con el backend desplegado):

```bash
gh pr create --title "feat(visita): registrar \"No visité\" con la visita ya abierta" --body "$(cat <<'BODY'
Dos puertas al mismo hecho: el menú `⋯` del sheet de la visita, y el "Reagendar → No
visité" que ya existía y que hasta ahora fallaba con un 409 que el vendedor leía como
falla de red (el botón Reagendar se ve con el cliente `en_curso`).

Si ya había rubros cargados, el sheet de motivos avisa que esta visita no va a contar
como hecha. Al registrar se sueltan las anclas de la visita en curso, igual que en un
cierre.

Spec: `docs/superpowers/specs/2026-09-15-no-visite-con-visita-abierta-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Notas para quien ejecute

- **No aflojar el gate de los 100 m ni el mínimo de 2 rubros.** Son los dos candidatos obvios a tocar y ninguno es la causa del bloqueo. Si aparece la tentación, releer la sección 6 del spec.
- **No auto-resolver nada.** Esta feature registra un hecho **declarado por el vendedor**, con su motivo. Nada se resuelve solo.
- Si un test existente se rompe por el `acciones` nuevo del `BottomSheet`, revisar que no se haya cambiado el orden de los botones del header: minimizar y cerrar tienen que seguir donde estaban.
