# "Sacar de mi agenda" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el vendedor pueda sacar de su agenda una fila que él mismo agregó a mano (un "Agregado" del buscador o un "Cliente nuevo") y todavía está pendiente.

**Architecture:** la operación ya existe entera en la base y en el repositorio de api-vendedores — `RotacionClienteRepository.quitar()` hace el soft-delete (`deleted_at`/`deleted_by`) con sus guardas `FILA_RESUELTA` y `VISITA_EN_CURSO`, y hoy solo la alcanzan las rutas de gerencia. Se agrega una ruta de vendedor que valida "esta fila es mía y es `es_extra`" antes de delegar en ese mismo repositorio, y en el front una tercera salida en `EstadoVisitaSheet` (el sheet de Reagendar) detrás de un `ConfirmDialog`.

**Tech Stack:** api-vendedores (Express + TypeScript + Sequelize, tests con Jest), app-planificacion (Vite + React 19 + TypeScript + React Query, tests con Vitest + Testing Library).

**Spec:** [`docs/superpowers/specs/2026-09-21-sacar-de-mi-agenda-design.md`](../specs/2026-09-21-sacar-de-mi-agenda-design.md)

## Global Constraints

- **Dos repos.** Tasks 1-3 en `C:/Users/matia/Documents/distrisuper/business-workflow/versus/api-vendedores`. Tasks 4-7 en `C:/Users/matia/Documents/distrisuper/app-planificacion`. Cada repo commitea por separado, y el orden importa: el front no anda hasta que la ruta exista.
- **Comandos de test.** api-vendedores: `npm test`. app-planificacion: `npm test` (vitest run). Un solo archivo: `npx jest <ruta>` / `npx vitest run <ruta>`.
- **Alcance duro:** solo filas con `es_extra = 1`. Nunca se borra una fila planificada desde la app del vendedor.
- **Solo soft-delete.** Nada de `DELETE` físico en `pl_rotacion_cliente`, y no se toca el warehouse bajo ninguna forma.
- **Códigos de error, textuales:** `FILA_NOT_FOUND` (404), `FILA_PLANIFICADA` (409), `FILA_RESUELTA` (409, lo tira el repo), `VISITA_EN_CURSO` (409, lo tira el repo), `ROTACION_NO_ENCONTRADA` (404, lo tira el helper).
- **Copy exacto, sin reescribir:**
  - Backend `FILA_PLANIFICADA`: `Este cliente es parte de tu recorrido: para sacarlo hablá con tu supervisor.`
  - Botón del sheet: `Sacar de mi agenda`
  - Título del diálogo: `¿Sacar a {Nombre} de tu agenda?`
  - Descripción del diálogo: `Solo se saca de esta vuelta.`
  - Botón de confirmación: `Sacar`
  - Aviso de éxito: `Lo sacamos de tu agenda`
- **Vocabulario del vendedor:** "sacar de mi agenda" / "esta vuelta". Nunca "rotación", "ciclo", "plan" ni "semana N" en texto visible.
- **Sin "deshacer" del lado del vendedor.** La restauración es de gerencia, por la ruta que ya existe.

---

### Task 1: Extraer `filaPropia` a un módulo compartido (api-vendedores)

`AltasService` tiene dos helpers privados —`rotacionAbierta` y `filaAltaPropia`— que responden "¿esta fila es de la rotación abierta de este vendedor?". La operación nueva necesita lo mismo pero sin el chequeo de `tipo === 'alta'`, así que el pedazo común sale a un módulo propio y `AltasService` pasa a construirse sobre él. Sin cambios de comportamiento: mismos códigos, mismos status.

**Files:**
- Create: `src/services/planificacion/filaPropia.ts`
- Create: `src/services/planificacion/filaPropia.spec.ts`
- Modify: `src/services/planificacion/AltasService.ts` (helpers privados `rotacionAbierta` y `filaAltaPropia`, y sus tres llamadores)

**Interfaces:**
- Consumes: `resolveSellerCode(user)` de `./sellerIdentity`, `RotacionRepository.findAbiertaByVendedor(vendedor)`, `RotacionClienteRepository.findById(id)`.
- Produces: `rotacionAbiertaDe(user: IUser): Promise<{ vendedor: string; rotacionId: number }>` y `filaPropia(user: IUser, rotacionClienteId: number): Promise<{ vendedor: string; rotacionId: number; fila: IRotacionCliente }>`. Task 2 consume `filaPropia`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/services/planificacion/filaPropia.spec.ts`:

```ts
import { rotacionAbiertaDe, filaPropia } from './filaPropia'
import { RotacionRepository } from '../../repositories/RotacionRepository'
import { RotacionClienteRepository } from '../../repositories/RotacionClienteRepository'

jest.mock('../../repositories/RotacionRepository')
jest.mock('../../repositories/RotacionClienteRepository')
jest.mock('./sellerIdentity', () => ({ resolveSellerCode: jest.fn(async () => 'V 2') }))

const USER = { id: '5' } as any
const fila = (over: any = {}) => ({
    id: 9, rotacionId: 7, codigoParticularCliente: '10034', semana: 2, dia: 3,
    esExtra: true, eliminado: false, tipo: 'visita', detalle: null, ...over,
})

beforeEach(() => {
    jest.clearAllMocks()
    ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue({ id: 7 })
})

describe('rotacionAbiertaDe', () => {
    it('devuelve el vendedor del token y su rotación abierta', async () => {
        await expect(rotacionAbiertaDe(USER)).resolves.toEqual({ vendedor: 'V 2', rotacionId: 7 })
    })

    it('sin rotación abierta → 404 ROTACION_NO_ENCONTRADA', async () => {
        ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue(null)
        await expect(rotacionAbiertaDe(USER))
            .rejects.toMatchObject({ statusCode: 404, code: 'ROTACION_NO_ENCONTRADA' })
    })
})

describe('filaPropia', () => {
    it('devuelve la fila cuando es de la rotación abierta del vendedor', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(fila())
        const r = await filaPropia(USER, 9)
        expect(r.vendedor).toBe('V 2')
        expect(r.rotacionId).toBe(7)
        expect(r.fila.id).toBe(9)
    })

    it('fila inexistente → 404 FILA_NOT_FOUND', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(null)
        await expect(filaPropia(USER, 9))
            .rejects.toMatchObject({ statusCode: 404, code: 'FILA_NOT_FOUND' })
    })

    it('fila de OTRA rotación → 404 FILA_NOT_FOUND, sin filtrar que existe', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(fila({ rotacionId: 99 }))
        await expect(filaPropia(USER, 9))
            .rejects.toMatchObject({ statusCode: 404, code: 'FILA_NOT_FOUND' })
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx jest src/services/planificacion/filaPropia.spec.ts`
Expected: FAIL — `Cannot find module './filaPropia'`.

- [ ] **Step 3: Escribir el módulo**

Crear `src/services/planificacion/filaPropia.ts`:

```ts
import { IUser } from '../../types/user'
import { CustomError } from '../../utils/errors'
import { resolveSellerCode } from './sellerIdentity'
import { RotacionRepository } from '../../repositories/RotacionRepository'
import { RotacionClienteRepository } from '../../repositories/RotacionClienteRepository'
import { IRotacionCliente } from '../../types/planificacion'

/**
 * "¿Esta fila es del vendedor que está pidiendo?" — la pregunta que toda operación del
 * vendedor sobre su propio plan tiene que hacerse antes de escribir.
 *
 * El código del vendedor sale del token (`resolveSellerCode`), NUNCA de la URL ni del
 * body: es lo que hace imposible tocar la fila de otro. Y una fila ajena responde 404,
 * no 403: un 403 confirmaría que el id existe.
 */

export async function rotacionAbiertaDe(
    user: IUser,
): Promise<{ vendedor: string; rotacionId: number }> {
    const vendedor = await resolveSellerCode(user)
    const rotacion = await RotacionRepository.findAbiertaByVendedor(vendedor)
    if (!rotacion) {
        throw new CustomError(404, 'No hay una rotación abierta para este vendedor.', {
            code: 'ROTACION_NO_ENCONTRADA',
        })
    }
    return { vendedor, rotacionId: rotacion.id }
}

export async function filaPropia(
    user: IUser,
    rotacionClienteId: number,
): Promise<{ vendedor: string; rotacionId: number; fila: IRotacionCliente }> {
    const { vendedor, rotacionId } = await rotacionAbiertaDe(user)
    const fila = await RotacionClienteRepository.findById(rotacionClienteId)
    if (!fila || fila.rotacionId !== rotacionId) {
        throw new CustomError(404, 'Cliente no encontrado en el plan.', { code: 'FILA_NOT_FOUND' })
    }
    return { vendedor, rotacionId, fila }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx jest src/services/planificacion/filaPropia.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Reescribir `AltasService` sobre el helper**

En `src/services/planificacion/AltasService.ts`:

1. Agregar el import, debajo de los otros de `./`:

```ts
import { filaPropia, rotacionAbiertaDe } from './filaPropia'
```

2. Borrar los dos helpers privados `rotacionAbierta` y `filaAltaPropia` completos, y dejar en su lugar solo este:

```ts
    private static async filaAltaPropia(
        user: IUser,
        rotacionClienteId: number,
    ): Promise<{ vendedor: string; fila: IRotacionCliente }> {
        const { vendedor, fila } = await filaPropia(user, rotacionClienteId)
        if (fila.tipo !== 'alta') {
            throw new CustomError(404, 'Esta fila no es un cliente nuevo.', { code: 'FILA_NO_ES_ALTA' })
        }
        return { vendedor, fila }
    }
```

3. En `crear`, cambiar la primera línea:

```ts
        const { vendedor, rotacionId } = await rotacionAbiertaDe(user)
```

(las otras dos llamadas, en `editar` y `reintentar`, usan `filaAltaPropia` y no cambian).

4. Si `RotacionRepository` o `resolveSellerCode` quedaron sin uso en el archivo, borrar esos imports.

- [ ] **Step 6: Correr los tests de altas y verificar que siguen pasando**

Run: `npx jest src/services/planificacion/AltasService.spec.ts`
Expected: PASS, sin cambios en el archivo de test. Si algún caso falla, es una regresión del refactor — arreglar el servicio, no el test.

- [ ] **Step 7: Commit**

```bash
git add src/services/planificacion/filaPropia.ts src/services/planificacion/filaPropia.spec.ts src/services/planificacion/AltasService.ts
git commit -m "refactor(planificacion): 'esta fila es mía' sale de AltasService a un módulo propio"
```

---

### Task 2: `VisitasService.quitarFilaPropia` (api-vendedores)

La operación en sí. Vive en `VisitasService` porque ahí ya está `reacomodar`, que es la otra operación donde el vendedor edita su propio plan.

**Files:**
- Modify: `src/services/planificacion/VisitasService.ts` (imports + método nuevo, al lado de `reacomodar`)
- Modify: `src/services/planificacion/VisitasService.spec.ts` (un `jest.mock` más + un `describe` nuevo)

**Interfaces:**
- Consumes: `filaPropia(user, id)` de Task 1; `GerenciaRotacionService.requireRotacionEditableDe(vendedor, rotacionId)`; `RotacionClienteRepository.quitar(id, usuario)`.
- Produces: `VisitasService.quitarFilaPropia(user: IUser, rotacionClienteId: number): Promise<void>`. Task 3 la llama.

- [ ] **Step 1: Escribir el test que falla**

En `src/services/planificacion/VisitasService.spec.ts`, agregar `jest.mock('./GerenciaRotacionService')` junto a los otros `jest.mock` de arriba, agregar el import `import { GerenciaRotacionService } from './GerenciaRotacionService'` junto a los otros, y agregar este `describe` al final del archivo:

```ts
describe('quitarFilaPropia', () => {
    const USER = { id: '5', email: 'vendedor@distrisuper.com' } as any
    const fila = (over: any = {}) => ({
        id: 9, rotacionId: 7, codigoParticularCliente: '10034', semana: 2, dia: 3,
        esExtra: true, eliminado: false, tipo: 'visita', detalle: null, ...over,
    })

    beforeEach(() => {
        ;(resolveSellerCode as jest.Mock).mockResolvedValue('V 2')
        ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue({ id: 7 })
    })

    it('una extra pendiente se saca, atribuida al vendedor que la pidió', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(fila())
        await VisitasService.quitarFilaPropia(USER, 9)
        expect(GerenciaRotacionService.requireRotacionEditableDe).toHaveBeenCalledWith('V 2', 7)
        expect(RotacionClienteRepository.quitar).toHaveBeenCalledWith(9, 'vendedor@distrisuper.com')
    })

    it('un "Cliente nuevo" se saca igual que una extra', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(
            fila({ tipo: 'alta', codigoParticularCliente: 'ALTA-000009' }),
        )
        await VisitasService.quitarFilaPropia(USER, 9)
        expect(RotacionClienteRepository.quitar).toHaveBeenCalledWith(9, 'vendedor@distrisuper.com')
    })

    it('una fila PLANIFICADA rebota 409 FILA_PLANIFICADA y no se toca', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(fila({ esExtra: false }))
        await expect(VisitasService.quitarFilaPropia(USER, 9))
            .rejects.toMatchObject({ statusCode: 409, code: 'FILA_PLANIFICADA' })
        expect(RotacionClienteRepository.quitar).not.toHaveBeenCalled()
    })

    it('una fila de otro vendedor rebota 404 FILA_NOT_FOUND', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(fila({ rotacionId: 99 }))
        await expect(VisitasService.quitarFilaPropia(USER, 9))
            .rejects.toMatchObject({ statusCode: 404, code: 'FILA_NOT_FOUND' })
        expect(RotacionClienteRepository.quitar).not.toHaveBeenCalled()
    })

    it('con la rotación no editable, no llega a quitar nada', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(fila())
        ;(GerenciaRotacionService.requireRotacionEditableDe as jest.Mock).mockRejectedValue(
            new CustomError(409, 'La rotación ya está cerrada.', { code: 'ROTACION_NO_EDITABLE' }),
        )
        await expect(VisitasService.quitarFilaPropia(USER, 9))
            .rejects.toMatchObject({ statusCode: 409, code: 'ROTACION_NO_EDITABLE' })
        expect(RotacionClienteRepository.quitar).not.toHaveBeenCalled()
    })

    // FILA_RESUELTA y VISITA_EN_CURSO los decide `RotacionClienteRepository.quitar`, que
    // tiene sus propios tests en RotacionClienteRepository.spec.ts: acá solo se verifica
    // que el error del repo sube tal cual, sin que el servicio lo trague.
    it('el 409 del repositorio (fila ya resuelta) sube sin tocar', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(fila())
        ;(RotacionClienteRepository.quitar as jest.Mock).mockRejectedValue(
            new CustomError(409, 'Este cliente ya se resolvió en esta vuelta, así que no se puede quitar.', {
                code: 'FILA_RESUELTA',
            }),
        )
        await expect(VisitasService.quitarFilaPropia(USER, 9))
            .rejects.toMatchObject({ statusCode: 409, code: 'FILA_RESUELTA' })
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx jest src/services/planificacion/VisitasService.spec.ts -t quitarFilaPropia`
Expected: FAIL — `VisitasService.quitarFilaPropia is not a function`.

- [ ] **Step 3: Implementar el método**

En `src/services/planificacion/VisitasService.ts`, agregar los imports:

```ts
import { filaPropia } from './filaPropia'
import { GerenciaRotacionService } from './GerenciaRotacionService'
```

y el método justo después de `reacomodar`:

```ts
    /**
     * "Sacar de mi agenda": soft-delete de una fila que el PROPIO vendedor agregó a mano
     * — un "Agregado" del buscador o un "Cliente nuevo" (spec 2026-09-21).
     *
     * No es un hecho: no crea `pl_resolucion`, no es un `no_visita`, no entra en ningún
     * agrupamiento de motivos. Es "esta fila nunca debió existir".
     *
     * Por eso el límite es `es_extra`, y no es cosmético: las extras están fuera del
     * denominador de cobertura (`indicadores/cobertura.ts` filtra `es_extra = 0`) y solo
     * cuentan cuando se resuelven, así que sacar una extra pendiente no mueve ningún
     * número. Sacar una fila PLANIFICADA sí achicaría el denominador: eso es editar la
     * línea de base, es de gerencia, y tiene su propia puerta en `/analitica/ruta`.
     *
     * `FILA_RESUELTA` y `VISITA_EN_CURSO` los aporta el repositorio: resolver sigue
     * siendo la única puerta sin retorno del dominio, y lo resuelto no se borra.
     */
    static async quitarFilaPropia(user: IUser, rotacionClienteId: number): Promise<void> {
        const { vendedor, fila } = await filaPropia(user, rotacionClienteId)

        if (!fila.esExtra) {
            throw new CustomError(
                409,
                'Este cliente es parte de tu recorrido: para sacarlo hablá con tu supervisor.',
                { code: 'FILA_PLANIFICADA' },
            )
        }

        await GerenciaRotacionService.requireRotacionEditableDe(vendedor, fila.rotacionId)
        await RotacionClienteRepository.quitar(rotacionClienteId, user.email ?? String(user.id))
    }
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx jest src/services/planificacion/VisitasService.spec.ts`
Expected: PASS — los 6 casos nuevos y todos los que ya había en el archivo.

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/VisitasService.ts src/services/planificacion/VisitasService.spec.ts
git commit -m "feat(planificacion): el vendedor puede sacar de su agenda una fila que agregó a mano"
```

---

### Task 3: Endpoint `DELETE /planificacion/rotacion-cliente/:id` (api-vendedores)

**Files:**
- Modify: `src/controllers/planificacionController.ts` (método nuevo, después de `reintentarAlta`)
- Modify: `src/routes/planificacion.ts` (ruta nueva, después del bloque de `/altas`)

**Interfaces:**
- Consumes: `VisitasService.quitarFilaPropia(user, id)` de Task 2; `PlanificacionController.responderError(res, err)`.
- Produces: `DELETE /planificacion/rotacion-cliente/:id` → `200 { ok: 1 }`. Task 4 le pega desde el front.

- [ ] **Step 1: Escribir el método del controller**

En `src/controllers/planificacionController.ts`, después de `reintentarAlta`:

```ts
    /** DELETE /rotacion-cliente/:id — "Sacar de mi agenda" (spec 2026-09-21). */
    static async quitarFilaPropia(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id, 10)
            if (isNaN(id)) {
                res.status(400).json({ ok: 0, error: 'id inválido' })
                return
            }
            await VisitasService.quitarFilaPropia(req.user!, id)
            res.status(200).json({ ok: 1 })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }
```

`VisitasService` ya está importado en el archivo; verificarlo antes de agregar un import duplicado.

- [ ] **Step 2: Escribir la ruta**

En `src/routes/planificacion.ts`, después del `router.post('/altas/:id/reintentar', ...)`:

```ts
// "Sacar de mi agenda": soft-delete de una fila que el PROPIO vendedor agregó (es_extra).
// El id del vendedor sale del token, nunca de la URL: por eso no hay `:codigo` acá, al
// revés de la ruta gemela de gerencia (/vendedores/:codigo/rotaciones/...).
router.delete('/rotacion-cliente/:id', authMiddleware, authorizeVendedor, async (req: Request, res: Response) => {
    PlanificacionController.quitarFilaPropia(req, res)
})
```

- [ ] **Step 3: Compilar y correr la suite entera**

Run: `npm run build && npm test`
Expected: compila sin errores de tipos, y la suite pasa completa.

- [ ] **Step 4: Probar la ruta a mano contra la app corriendo**

Levantar la API (`npm run dev`) y, con un token de vendedor:

```bash
curl -i -X DELETE http://localhost:3000/planificacion/rotacion-cliente/<id-de-una-extra-pendiente> \
  -H "Authorization: Bearer <token>"
```

Expected: `200 {"ok":1}` con una extra pendiente; `409` con `"code":"FILA_PLANIFICADA"` con el id de una fila planificada del mismo vendedor; `404` con `"code":"FILA_NOT_FOUND"` con el id de una fila de otro vendedor.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/planificacionController.ts src/routes/planificacion.ts
git commit -m "feat(planificacion): DELETE /planificacion/rotacion-cliente/:id para el vendedor"
```

---

### Task 4: Cliente HTTP en el front (app-planificacion)

A partir de acá se trabaja en `C:/Users/matia/Documents/distrisuper/app-planificacion`.

**Files:**
- Modify: `src/api/planificacion.ts` (función nueva, después de `reintentarAlta`)
- Modify: `src/api/planificacion.test.ts` (import + un test)

**Interfaces:**
- Produces: `eliminarFilaPropia(rotacionClienteId: number): Promise<void>`. La consume Task 6.

- [ ] **Step 1: Escribir el test que falla**

En `src/api/planificacion.test.ts`, agregar `eliminarFilaPropia` a la lista de imports desde `./planificacion` y agregar este test (junto a los de altas):

```ts
it('eliminarFilaPropia pega al DELETE de la fila del vendedor', async () => {
    ;(apiClient.delete as Mock).mockResolvedValue({ data: { ok: 1 } })
    await eliminarFilaPropia(42)
    expect(apiClient.delete).toHaveBeenCalledWith('/planificacion/rotacion-cliente/42')
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/api/planificacion.test.ts`
Expected: FAIL — `eliminarFilaPropia is not a function` (o error de import).

- [ ] **Step 3: Escribir la función**

En `src/api/planificacion.ts`, después de `reintentarAlta`:

```ts
/** "Sacar de mi agenda": soft-delete de una fila que el vendedor agregó a mano (`es_extra`).
 *  La API valida que sea suya y que no esté resuelta; el id del vendedor sale del token. */
export const eliminarFilaPropia = async (rotacionClienteId: number): Promise<void> => {
    await apiClient.delete(`/planificacion/rotacion-cliente/${rotacionClienteId}`)
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/api/planificacion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/planificacion.ts src/api/planificacion.test.ts
git commit -m "feat(api): eliminarFilaPropia"
```

---

### Task 5: La salida "Sacar de mi agenda" en `EstadoVisitaSheet`

El sheet no sabe qué es una extra: recibe `onEliminar` o no lo recibe, y pinta la opción solo si llega. Quién decide es la página (Task 6).

**Files:**
- Modify: `src/components/EstadoVisitaSheet.tsx`
- Modify: `src/components/EstadoVisitaSheet.test.tsx`

**Interfaces:**
- Produces: prop opcional `onEliminar?: () => void` en `EstadoVisitaSheetProps`. La pasa Task 6.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/components/EstadoVisitaSheet.test.tsx`, dentro del `describe('EstadoVisitaSheet')`:

```ts
it('sin onEliminar no ofrece sacar de la agenda: una fila planificada no se saca', () => {
    render(<EstadoVisitaSheet {...PROPS_BASE} />)
    expect(screen.queryByRole('button', { name: /sacar de mi agenda/i })).not.toBeInTheDocument()
})

it('con onEliminar ofrece la salida y la llama al tocarla', () => {
    const onEliminar = vi.fn()
    render(<EstadoVisitaSheet {...PROPS_BASE} onEliminar={onEliminar} />)
    fireEvent.click(screen.getByRole('button', { name: /sacar de mi agenda/i }))
    expect(onEliminar).toHaveBeenCalledTimes(1)
})

it('sacar de la agenda no toca la selección de día: no es un reagendado', () => {
    const onReagendar = vi.fn()
    render(<EstadoVisitaSheet {...PROPS_BASE} onReagendar={onReagendar} onEliminar={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /sacar de mi agenda/i }))
    expect(onReagendar).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /elegí un día/i })).toBeDisabled()
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/EstadoVisitaSheet.test.tsx`
Expected: FAIL — los dos últimos no encuentran el botón `sacar de mi agenda`.

- [ ] **Step 3: Implementar la prop y el botón**

En `src/components/EstadoVisitaSheet.tsx`:

1. Import del ícono: `import { X, Trash2 } from 'lucide-react'`
2. En `EstadoVisitaSheetProps`, después de `onElegirNoVisita`:

```ts
    /**
     * Ausente = no se ofrece sacar de la agenda. La página la pasa SOLO para las filas
     * que el vendedor agregó a mano y siguen pendientes (`esExtra && estado === 'pendiente'`):
     * lo planificado no se saca desde acá, y lo resuelto no se saca en ningún lado.
     */
    onEliminar?: () => void
```

3. Agregarla al destructuring del componente, después de `onElegirNoVisita`.
4. Al final del cuerpo del sheet, después del botón de "No visité":

```tsx
            {/* Tercera salida, separada de las otras dos: reagendar y "No visité" son
                decisiones sobre la visita; esto es borrar una fila que nunca debió
                existir. Por eso no entra en `seleccion` ni pasa por el botón del pie —
                dispara su propia confirmación en la página. */}
            {onEliminar && (
                <>
                    <div className="my-3 h-px bg-[#E7E9F0]" />
                    <button
                        onClick={onEliminar}
                        className="flex h-11 w-full items-center gap-2 rounded-lg border-[1.5px] border-[#E1E6F0] px-4 text-left text-[14px] font-semibold text-dsred"
                    >
                        <Trash2 className="h-[14px] w-[14px]" strokeWidth={2.4} />
                        Sacar de mi agenda
                    </button>
                </>
            )}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/EstadoVisitaSheet.test.tsx`
Expected: PASS, incluidos los tests que ya existían.

- [ ] **Step 5: Commit**

```bash
git add src/components/EstadoVisitaSheet.tsx src/components/EstadoVisitaSheet.test.tsx
git commit -m "feat(agenda): 'Sacar de mi agenda' como tercera salida del sheet de estado"
```

---

### Task 6: El hook y el cableado en `AgendaSemanaPage`

**Files:**
- Create: `src/hooks/useEliminarFila.ts`
- Modify: `src/pages/AgendaSemanaPage.tsx`
- Modify: `src/pages/AgendaSemanaPage.test.tsx`

**Desvío del spec, a propósito:** el spec decía "el 409 se muestra como aviso dentro del sheet". Acá el error sale por la `Notification` global de la página, que es lo que ya hace `onReagendar` con su propio error — y para cuando el 409 llega, el sheet de estado ya está cerrado (la confirmación lo reemplazó), así que un aviso adentro no se vería. La otra mitad del requisito —refrescar la agenda cuando el 409 revela que la card está vieja— se cumple con el `onSettled` del hook.

**Interfaces:**
- Consumes: `eliminarFilaPropia(id)` de Task 4; la prop `onEliminar` de Task 5; `ConfirmDialog` de `@/components/ui/ConfirmDialog` (props: `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `destructivo`, `onConfirm`); `titleCaseNombre` de `@/lib/textFormat`; `errorCode` de `@/lib/apiError` (ya importado en la página).
- Produces: `useEliminarFila()` → mutación de React Query cuyo `mutateAsync` toma un `rotacionClienteId: number`.

- [ ] **Step 1: Escribir el hook**

Crear `src/hooks/useEliminarFila.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { eliminarFilaPropia } from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { cicloKeys } from './useCiclo'

/**
 * "Sacar de mi agenda" (spec 2026-09-21): saca una fila que el vendedor agregó a mano.
 *
 * `onSettled` y no `onSuccess`: los 409 que puede devolver esta ruta —la fila ya se
 * resolvió, o hay una visita abierta— significan que la card que el vendedor está
 * mirando quedó vieja, así que refrescar la agenda es parte de la respuesta al error,
 * no solo al éxito.
 */
export function useEliminarFila() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (rotacionClienteId: number) => eliminarFilaPropia(rotacionClienteId),
        onSettled: () => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['ciclo', 'preview'] })
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
        },
    })
}
```

- [ ] **Step 2: Escribir el test de la página que falla**

En `src/pages/AgendaSemanaPage.test.tsx`, agregar este `describe` al final. Sigue exactamente el camino de los tests de "No visité" que ya están en el archivo (`fijarLunes()` → mocks → `renderPage()` → `fireEvent.click(await screen.findByText('Reagendar'))`):

```ts
describe('sacar de la agenda', () => {
    it('una fila agregada a mano se saca, y confirma antes de llamar a la API', async () => {
        fijarLunes()
        ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
        ;(api.getAgendaSemana as any).mockResolvedValue({
            ...semanaVacia,
            LUN: [{ ...clienteLunes, esExtra: true }],
        })
        ;(api.eliminarFilaPropia as any).mockResolvedValue(undefined)
        renderPage()

        fireEvent.click(await screen.findByText('Reagendar'))
        fireEvent.click(await screen.findByText('Sacar de mi agenda'))

        // Confirma antes: el diálogo está, y la API todavía no se llamó.
        expect(await screen.findByText(/de tu agenda\?/i)).toBeInTheDocument()
        expect(api.eliminarFilaPropia).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'Sacar' }))
        await waitFor(() => expect(api.eliminarFilaPropia).toHaveBeenCalledWith(42))
        expect(await screen.findByText('Lo sacamos de tu agenda')).toBeInTheDocument()
    })

    it('cancelar el diálogo no llama a la API', async () => {
        fijarLunes()
        ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
        ;(api.getAgendaSemana as any).mockResolvedValue({
            ...semanaVacia,
            LUN: [{ ...clienteLunes, esExtra: true }],
        })
        renderPage()

        fireEvent.click(await screen.findByText('Reagendar'))
        fireEvent.click(await screen.findByText('Sacar de mi agenda'))
        fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))

        expect(api.eliminarFilaPropia).not.toHaveBeenCalled()
    })

    it('una fila planificada no ofrece la salida', async () => {
        fijarLunes()
        ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
        ;(api.getAgendaSemana as any).mockResolvedValue({
            ...semanaVacia,
            LUN: [{ ...clienteLunes, esExtra: false }],
        })
        renderPage()

        fireEvent.click(await screen.findByText('Reagendar'))
        await screen.findByText('No visité')
        expect(screen.queryByText('Sacar de mi agenda')).not.toBeInTheDocument()
    })

    it('si la fila ya se resolvió, el 409 se lee con palabras del vendedor', async () => {
        fijarLunes()
        ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
        ;(api.getAgendaSemana as any).mockResolvedValue({
            ...semanaVacia,
            LUN: [{ ...clienteLunes, esExtra: true }],
        })
        ;(api.eliminarFilaPropia as any).mockRejectedValue({
            response: { data: { code: 'FILA_RESUELTA' } },
        })
        renderPage()

        fireEvent.click(await screen.findByText('Reagendar'))
        fireEvent.click(await screen.findByText('Sacar de mi agenda'))
        fireEvent.click(screen.getByRole('button', { name: 'Sacar' }))

        expect(await screen.findByText(/ya se resolvió/i)).toBeInTheDocument()
    })
})
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `npx vitest run src/pages/AgendaSemanaPage.test.tsx`
Expected: FAIL — no aparece el botón `sacar de mi agenda`.

- [ ] **Step 4: Cablear la página**

En `src/pages/AgendaSemanaPage.tsx`:

1. Imports nuevos:

```ts
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useEliminarFila } from '@/hooks/useEliminarFila'
import { titleCaseNombre } from '@/lib/textFormat'
```

2. Después de las otras constantes del módulo (cerca de `NOMBRE_DIA`):

```ts
/** El 409 de la API traducido a algo que el vendedor pueda leer parado en la calle. */
function mensajeDeEliminar(err: unknown): string {
    switch (errorCode(err)) {
        case 'FILA_RESUELTA':
            return 'Este cliente ya se resolvió, así que no se puede sacar.'
        case 'VISITA_EN_CURSO':
            return 'Tenés la visita abierta: cerrala antes de sacarlo.'
        case 'FILA_PLANIFICADA':
            return 'Este cliente es parte de tu recorrido: para sacarlo hablá con tu supervisor.'
        default:
            return 'No se pudo sacar de tu agenda. Volvé a intentar.'
    }
}
```

3. Dentro del componente, junto a las otras mutaciones y estados:

```ts
    const eliminarFila = useEliminarFila()
    const [eliminarCliente, setEliminarCliente] = useState<IAgendaClient | null>(null)
```

4. Los dos handlers, junto a `onElegirNoVisita`:

```ts
    function onElegirEliminar() {
        const cliente = estadoVisitaCliente
        setEstadoVisitaCliente(null)
        setEliminarCliente(cliente)
    }

    async function onConfirmEliminar() {
        const cliente = eliminarCliente
        if (!cliente) return
        try {
            await eliminarFila.mutateAsync(cliente.rotacionClienteId)
            mostrar('exito', 'Lo sacamos de tu agenda')
        } catch (err) {
            mostrar('error', mensajeDeEliminar(err))
        } finally {
            setEliminarCliente(null)
        }
    }
```

5. En el `<EstadoVisitaSheet>`, agregar la prop después de `onElegirNoVisita`:

```tsx
                // Solo lo que el vendedor agregó a mano y sigue pendiente: lo planificado
                // es la línea de base (lo saca gerencia desde /analitica/ruta), y una fila
                // resuelta o en curso la rebota la API igual.
                onEliminar={
                    estadoVisitaCliente?.esExtra && estadoVisitaCliente.estado === 'pendiente'
                        ? onElegirEliminar
                        : undefined
                }
```

6. Justo después del `</EstadoVisitaSheet>`:

```tsx
            {eliminarCliente && (
                <ConfirmDialog
                    open
                    onOpenChange={abierto => {
                        if (!abierto) setEliminarCliente(null)
                    }}
                    title={`¿Sacar a ${titleCaseNombre(eliminarCliente.nombreFantasia || eliminarCliente.nombreCliente)} de tu agenda?`}
                    description="Solo se saca de esta vuelta."
                    confirmLabel="Sacar"
                    destructivo
                    onConfirm={onConfirmEliminar}
                />
            )}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run src/pages/AgendaSemanaPage.test.tsx`
Expected: PASS — los tres nuevos y todos los que ya había.

- [ ] **Step 6: Correr la suite entera y el lint**

Run: `npm test && npm run lint && npm run build`
Expected: todo pasa, sin errores de tipos.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useEliminarFila.ts src/pages/AgendaSemanaPage.tsx src/pages/AgendaSemanaPage.test.tsx
git commit -m "feat(agenda): sacar de la agenda una fila agregada a mano, con confirmación"
```

---

### Task 7: Documentación viva

El spec es histórico; lo que se lee para entender el sistema hoy es `docs/dominio/` y `CLAUDE.md`. La regla "solo `es_extra`, y sacar no es un hecho" es exactamente del tipo que se vuelve a discutir si no queda escrita ahí.

**Files:**
- Modify: `docs/dominio/modelo.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Agregar la sección al modelo**

En `docs/dominio/modelo.md`, después de la sección que describe la visita de alta, agregar:

```markdown
### Sacar de la agenda lo que se agregó a mano

El vendedor puede **sacar de su agenda** una fila que él mismo creó —un "Agregado" del buscador
o un "Cliente nuevo"— mientras siga pendiente: `DELETE /planificacion/rotacion-cliente/:id`,
soft-delete de `pl_rotacion_cliente` (`deleted_at`/`deleted_by`), la misma operación que gerencia
hace desde `/analitica/ruta`.

- **No es un hecho.** No crea `pl_resolucion`, no es un `no_visita`, no entra en el `GROUP BY` de
  motivos. Es "esta fila nunca debió existir". La alternativa que había —declarar "No visité"—
  inventaba un hecho comercial que nadie declaró, y dejaba la fila irreversible.
- **Solo `es_extra = 1`.** Las extras están fuera del denominador de cobertura y solo cuentan
  cuando se resuelven, así que sacar una extra pendiente no mueve ningún número. Una fila
  planificada sí achicaría el denominador: eso es editar la línea de base, y es de gerencia
  (`409 FILA_PLANIFICADA`).
- **Lo resuelto no se saca** (`FILA_RESUELTA`), ni lo que tiene una visita abierta
  (`VISITA_EN_CURSO`). Resolver sigue siendo la única puerta sin retorno del dominio.
- **El vendedor no tiene "deshacer"**: confirma antes, y la restauración la hace gerencia
  (`PATCH .../rotacion-cliente/:id/restaurar`), sin límite de tiempo mientras la rotación sea
  editable.
```

- [ ] **Step 2: Agregar el bullet a CLAUDE.md**

En `CLAUDE.md`, en "Decisiones no obvias", después del bullet de "Cliente nuevo":

```markdown
- **"Sacar de mi agenda" solo alcanza a lo que el vendedor agregó a mano** (`es_extra = 1`:
  extras del buscador y altas) y solo mientras esté pendiente. Es un soft-delete de la fila
  (`DELETE /planificacion/rotacion-cliente/:id`), **no un hecho**: no crea `pl_resolucion` ni
  contamina el `GROUP BY` de motivos. Una fila planificada rebota `409 FILA_PLANIFICADA` — sacarla
  achicaría el denominador de cobertura, y eso es de gerencia. El vendedor no tiene deshacer:
  confirma antes, y restaura gerencia. Vive en `EstadoVisitaSheet` (`onEliminar`, que la página
  pasa solo si corresponde) y en `VisitasService.quitarFilaPropia`. Ver
  `docs/dominio/modelo.md`, "Sacar de la agenda lo que se agregó a mano".
```

- [ ] **Step 3: Commit**

```bash
git add docs/dominio/modelo.md CLAUDE.md
git commit -m "docs: sacar de la agenda lo que se agregó a mano"
```
