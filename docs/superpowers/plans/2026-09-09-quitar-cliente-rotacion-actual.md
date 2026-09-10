# Quitar cliente de la rotación actual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerencia puede quitar, desde `/analitica/ruta`, una fila pendiente de `pl_rotacion_cliente` de la rotación en curso de un vendedor. La fila se soft-deletea (no se borra), queda fuera de la grilla y del denominador de cobertura de esa rotación, y reaparece sola en la próxima rotación porque esa se materializa siempre del template.

**Architecture:** Dos columnas nuevas en `pl_rotacion_cliente` (`deleted_at`, `deleted_by`). Un método nuevo de repositorio (`RotacionClienteRepository.quitar`) que discrimina 409 `FILA_RESUELTA` de 409 `VISITA_EN_CURSO` consultando `pl_resolucion`, expuesto por un método de servicio (`GerenciaRotacionService.quitarCliente`) que reusa el mismo patrón de validación que `reacomodar` (rotación del vendedor, rotación editable, fila de esa rotación). Nueva ruta `DELETE .../rotacion-cliente/:id`. En el front, un botón por card que llama un hook de mutation nuevo, sin optimistic update (como `useCancelarRotacion`).

**Tech Stack:** Backend: Node/TypeScript, Express, Sequelize, MySQL, Jest. Frontend: React 19, TypeScript, @tanstack/react-query, axios, Vitest + Testing Library.

## Global Constraints

- El código de error `FILA_RESUELTA` ya existe (`RotacionClienteRepository.mover`) y se reusa tal cual para el mismo bloqueo conceptual — no se inventa un código nuevo para esa rama.
- Todas las rutas de gerencia devuelven `200 { ok: 1 }` en éxito, nunca `204` — es el único patrón de respuesta que usa TODO `planificacionController.ts`, incluidos los `DELETE` existentes (`cancelarRotacion`). El spec original mencionaba `204`; este plan lo alinea a `200 { ok: 1 }` por consistencia con el resto del dominio, sin cambiar el comportamiento (la fila igual se soft-deletea).
- Parámetro de ruta para la fila del plan: `:id` (no `:rotacionClienteId`), igual que la ruta de `reacomodar` ya existente (`/rotacion-cliente/:id/reacomodar`).
- `en_curso` (visita activa) SE representa como una fila en `pl_resolucion` con `tipo = 'visita' AND fecha_fin IS NULL` — no como ausencia de fila. Esto es distinto de lo que asumía el texto del spec original; este plan sigue el comportamiento real ya usado por `estadoCicloCliente.ts` y `RotacionClienteRepository.findCodigosSinResolver`.
- Todos los tests de backend mockean Sequelize completo (sin DB real) — mismo patrón que `RotacionClienteRepository.spec.ts` y `GerenciaRotacionService.spec.ts`. Todos los tests de frontend mockean `@/api/planificacionAdmin` — mismo patrón que `useRotacionAdmin.test.tsx`.

---

## Task 1: Columna `deleted_at`/`deleted_by` — SQL, modelo y tipo

**Files:**
- Create: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\docs\db-notes\planificacion-quitar-cliente-rotacion.sql`
- Create: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\docs\db-notes\planificacion-quitar-cliente-rotacion-rollback.sql`
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\models\planificacion\RotacionCliente.ts`

**Interfaces:**
- Produce: `RotacionCliente.deletedAt: Date | null`, `RotacionCliente.deletedBy: string | null` en el modelo Sequelize — Task 2 y Task 3 lo consumen vía `where: { deletedAt: null }` y `update({ deletedAt, deletedBy })`.

No hay test automatizado para este task: es DDL (SQL manual, aplicado a mano contra la base como el resto de `docs/db-notes/*.sql`, ver `docs/db-notes/RUNBOOK-deploy-plan-rotacion.md`) y una definición de modelo sin lógica propia. Se verifica indirectamente cuando los tests de Task 2 mockean el modelo con estos campos.

- [ ] **Step 1: Crear el SQL de la migración manual**

```sql
-- Marca cuándo y quién sacó una fila de la rotación en curso (soft-delete scoped a la
-- rotación: la próxima se materializa del template y no la hereda). Precedente:
-- planificacion-visita-extra.sql (es_extra).
-- Ver docs/superpowers/specs/2026-09-09-quitar-cliente-rotacion-actual-design.md (app-planificacion).
ALTER TABLE pl_rotacion_cliente
  ADD COLUMN deleted_at DATETIME NULL AFTER es_extra,
  ADD COLUMN deleted_by VARCHAR(64) NULL AFTER deleted_at;
```

Archivo: `docs/db-notes/planificacion-quitar-cliente-rotacion.sql`.

- [ ] **Step 2: Crear el rollback simétrico**

```sql
ALTER TABLE pl_rotacion_cliente
  DROP COLUMN deleted_by,
  DROP COLUMN deleted_at;
```

Archivo: `docs/db-notes/planificacion-quitar-cliente-rotacion-rollback.sql`.

- [ ] **Step 3: Agregar los campos al modelo**

En `src/models/planificacion/RotacionCliente.ts`, actualizar la interfaz y el `init`:

```ts
interface IRotacionClienteAttributes {
    id?: number
    rotacionId: number
    codigoParticularCliente: string
    semana: number
    dia: number
    esExtra?: boolean
    deletedAt?: Date | null
    deletedBy?: string | null
}
```

```ts
class RotacionCliente
    extends Model<IRotacionClienteAttributes>
    implements IRotacionClienteAttributes
{
    public id!: number
    public rotacionId!: number
    public codigoParticularCliente!: string
    public semana!: number
    public dia!: number
    public esExtra!: boolean
    public deletedAt!: Date | null
    public deletedBy!: string | null
}
```

```ts
RotacionCliente.init(
    {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: 'id' },
        rotacionId: { type: DataTypes.INTEGER, allowNull: false, field: 'rotacion_id' },
        codigoParticularCliente: {
            type: DataTypes.STRING(50),
            allowNull: false,
            field: 'codigo_particular_cliente',
        },
        semana: { type: DataTypes.TINYINT, allowNull: false, field: 'semana' },
        dia: { type: DataTypes.TINYINT, allowNull: false, field: 'dia' },
        esExtra: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'es_extra' },
        deletedAt: { type: DataTypes.DATE, allowNull: true, field: 'deleted_at' },
        deletedBy: { type: DataTypes.STRING(64), allowNull: true, field: 'deleted_by' },
    },
    {
        sequelize: sequelizeWritePlanificacion,
        modelName: 'RotacionCliente',
        tableName: 'pl_rotacion_cliente',
        timestamps: false,
    },
)
```

- [ ] **Step 4: Verificar que el proyecto compila**

Run: `npx tsc --noEmit` (desde `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores`)
Expected: sin errores nuevos relacionados a `RotacionCliente`.

- [ ] **Step 5: Commit**

```bash
git add docs/db-notes/planificacion-quitar-cliente-rotacion.sql docs/db-notes/planificacion-quitar-cliente-rotacion-rollback.sql src/models/planificacion/RotacionCliente.ts
git commit -m "$(cat <<'EOF'
feat(planificacion): agregar deleted_at/deleted_by a pl_rotacion_cliente

Soporta el soft-delete de una fila del plan scoped a su rotación.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Excluir filas soft-deleteadas de `findByRotacion` y `findById`

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\repositories\RotacionClienteRepository.ts:53-60,74-81`
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\repositories\RotacionClienteRepository.spec.ts`

**Interfaces:**
- Consume: `RotacionCliente` (modelo con `deletedAt`, Task 1).
- Produce: `findByRotacion(rotacionId)` y `findById(id)` (mismas firmas que hoy) ahora excluyen filas con `deletedAt` seteado. Esto es lo que hace que `GerenciaRotacionService.getRotacion` (que llama a `findByRotacion`) y `reacomodar`/`mover` (que llaman a `findById`) nunca vean ni operen sobre una fila quitada.

**Por qué tocar `findById` acá:** hoy usa `RotacionCliente.findByPk(id)`, que no acepta un `where` adicional — hay que pasarlo a `findOne({ where: { id, deletedAt: null } })`. Esto cambia qué método del modelo mockean los tests existentes de `mover` (que llaman a `findById` internamente), así que ese test también se actualiza en este task.

- [ ] **Step 1: Escribir el test que falla para `findByRotacion`**

Agregar en `RotacionClienteRepository.spec.ts`, después del `describe('crearMuchos', ...)`:

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

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts -t "no trae filas soft-deleteadas"`
Expected: FAIL — `findAll` fue llamado con `{ where: { rotacionId: 7 } }`, sin `deletedAt`.

- [ ] **Step 3: Aplicar el filtro**

En `RotacionClienteRepository.ts`, reemplazar:

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

por:

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

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts -t "no trae filas soft-deleteadas"`
Expected: PASS

- [ ] **Step 5: Escribir el test que falla para `findById`**

Primero, en la sección de mocks del spec (arriba del archivo), agregar:

```ts
const mockedFindOne = RotacionCliente.findOne as jest.MockedFunction<any>
```

Luego, en el `describe('mover', ...)` ya existente, reemplazar las dos apariciones de `mockedFindByPk.mockResolvedValue(fila103 as any)` por `mockedFindOne.mockResolvedValue(fila103 as any)` (son las líneas 57 y 70 y 92 del archivo actual — las tres que arman el fixture antes de llamar a `mover`).

Agregar además, como test nuevo dentro del mismo `describe('mover', ...)`:

```ts
    it('busca la fila excluyendo las soft-deleteadas', async () => {
        mockedFindOne.mockResolvedValue(fila103 as any)
        mockedQuery.mockResolvedValue([])
        mockedUpdate.mockResolvedValue([1])

        await RotacionClienteRepository.mover(103, 4, 1, 'vendedor', 'matias')

        expect(mockedFindOne).toHaveBeenCalledWith({
            where: { id: 103, deletedAt: null },
        })
    })
```

- [ ] **Step 6: Ejecutar y verificar que falla**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts -t "busca la fila excluyendo las soft-deleteadas"`
Expected: FAIL — `findOne` no fue llamado (el código todavía usa `findByPk`).

- [ ] **Step 7: Aplicar el cambio**

En `RotacionClienteRepository.ts`, reemplazar:

```ts
    static async findById(id: number): Promise<IRotacionCliente | null> {
        try {
            const row = await RotacionCliente.findByPk(id)
            return row ? toIRotacionCliente(row) : null
        } catch (err) {
            throw new CustomError(500, `Error fetching fila del plan: ${err}`)
        }
    }
```

por:

```ts
    static async findById(id: number): Promise<IRotacionCliente | null> {
        try {
            const row = await RotacionCliente.findOne({ where: { id, deletedAt: null } })
            return row ? toIRotacionCliente(row) : null
        } catch (err) {
            throw new CustomError(500, `Error fetching fila del plan: ${err}`)
        }
    }
```

- [ ] **Step 8: Ejecutar TODO el archivo de test y verificar que pasa**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts`
Expected: PASS (todos los tests, incluidos los de `mover` ya existentes que ahora mockean `findOne` en vez de `findByPk`).

- [ ] **Step 9: Commit**

```bash
git add src/repositories/RotacionClienteRepository.ts src/repositories/RotacionClienteRepository.spec.ts
git commit -m "$(cat <<'EOF'
fix(planificacion): excluir filas soft-deleteadas de findByRotacion/findById

Sin esto, una fila quitada de la rotación seguiría apareciendo en el
grid de gerencia y siendo reacomodable/resolvible.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `RotacionClienteRepository.quitar()`

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\repositories\RotacionClienteRepository.ts`
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\repositories\RotacionClienteRepository.spec.ts`

**Interfaces:**
- Consume: `RotacionCliente.findOne`/`.update` (Sequelize), `sequelizeWritePlanificacion.query` sobre `pl_resolucion` (mismo patrón que `mover`).
- Produce: `RotacionClienteRepository.quitar(id: number, usuario: string): Promise<void>` — 404 `FILA_NOT_FOUND` si no existe o ya está soft-deleteada; 409 `VISITA_EN_CURSO` si hay una visita abierta sobre la fila; 409 `FILA_RESUELTA` si hay cualquier otra resolución; si no, marca `deletedAt`/`deletedBy` y resuelve. Task 4 (`GerenciaRotacionService.quitarCliente`) lo llama directo.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar en `RotacionClienteRepository.spec.ts`, después del `describe('mover', ...)`:

```ts
describe('quitar', () => {
    const fila103 = {
        id: 103, rotacionId: 7, codigoParticularCliente: '4412', semana: 2, dia: 3,
    }

    it('soft-deletea una fila sin resolución', async () => {
        mockedFindOne.mockResolvedValue(fila103 as any)
        mockedQuery.mockResolvedValue([]) // sin resolución
        mockedUpdate.mockResolvedValue([1])

        await RotacionClienteRepository.quitar(103, 'jefe@distrisuper.com')

        expect(mockedUpdate).toHaveBeenCalledWith(
            { deletedAt: expect.any(Date), deletedBy: 'jefe@distrisuper.com' },
            { where: { id: 103 } },
        )
    })

    it('404 si la fila no existe (o ya está soft-deleteada, porque findOne ya la excluye)', async () => {
        mockedFindOne.mockResolvedValue(null)

        await expect(
            RotacionClienteRepository.quitar(999, 'jefe@distrisuper.com'),
        ).rejects.toMatchObject({ statusCode: 404, details: { code: 'FILA_NOT_FOUND' } })
        expect(mockedUpdate).not.toHaveBeenCalled()
    })

    it('409 VISITA_EN_CURSO si hay una visita abierta sobre la fila', async () => {
        mockedFindOne.mockResolvedValue(fila103 as any)
        mockedQuery.mockResolvedValue([{ tipo: 'visita', fecha_fin: null }])

        await expect(
            RotacionClienteRepository.quitar(103, 'jefe@distrisuper.com'),
        ).rejects.toMatchObject({ statusCode: 409, details: { code: 'VISITA_EN_CURSO' } })
        expect(mockedUpdate).not.toHaveBeenCalled()
    })

    it('409 FILA_RESUELTA si la visita ya se cerró', async () => {
        mockedFindOne.mockResolvedValue(fila103 as any)
        mockedQuery.mockResolvedValue([
            { tipo: 'visita', fecha_fin: new Date('2026-09-01T12:00:00.000Z') },
        ])

        await expect(
            RotacionClienteRepository.quitar(103, 'jefe@distrisuper.com'),
        ).rejects.toMatchObject({ statusCode: 409, details: { code: 'FILA_RESUELTA' } })
        expect(mockedUpdate).not.toHaveBeenCalled()
    })

    it('409 FILA_RESUELTA si es un no_visita', async () => {
        mockedFindOne.mockResolvedValue(fila103 as any)
        mockedQuery.mockResolvedValue([{ tipo: 'no_visita', fecha_fin: null }])

        await expect(
            RotacionClienteRepository.quitar(103, 'jefe@distrisuper.com'),
        ).rejects.toMatchObject({ statusCode: 409, details: { code: 'FILA_RESUELTA' } })
        expect(mockedUpdate).not.toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts -t "quitar"`
Expected: FAIL con `RotacionClienteRepository.quitar is not a function`.

- [ ] **Step 3: Implementar `quitar()`**

Agregar en `RotacionClienteRepository.ts`, después del método `mover` (antes de `findCodigosSinResolver`):

```ts
    interface ResolucionEstadoRow {
        tipo: string
        fecha_fin: Date | string | null
    }

    /**
     * Soft-delete de una fila del plan, scoped a esta rotación (no toca el template: la
     * próxima rotación la vuelve a traer sola).
     *
     * Discrimina VISITA_EN_CURSO de FILA_RESUELTA en vez de bloquear ambas igual, al
     * contrario de `mover()`: acá el mensaje que ve gerencia tiene que decir si el
     * vendedor está ahí ahora mismo o si el hecho ya terminó, porque en el primer caso
     * la fila va a poder quitarse apenas cierre. Es la misma distinción que
     * `estadoCicloCliente.ts` hace del lado del front (`derivarEstado`).
     */
    static async quitar(id: number, usuario: string): Promise<void> {
        const fila = await RotacionCliente.findOne({ where: { id, deletedAt: null } })
        if (!fila) {
            throw new CustomError(404, 'Cliente no encontrado en el plan.', {
                code: 'FILA_NOT_FOUND',
            })
        }

        const resoluciones = await sequelizeWritePlanificacion.query<ResolucionEstadoRow>(
            `SELECT tipo, fecha_fin FROM pl_resolucion WHERE rotacion_cliente_id = :id LIMIT 1`,
            { replacements: { id }, type: QueryTypes.SELECT },
        )

        if (resoluciones.length > 0) {
            const [{ tipo, fecha_fin }] = resoluciones
            if (tipo === 'visita' && fecha_fin === null) {
                throw new CustomError(
                    409,
                    'El vendedor está visitando a este cliente ahora mismo, así que no se puede quitar.',
                    { code: 'VISITA_EN_CURSO' },
                )
            }
            throw new CustomError(
                409,
                'Este cliente ya se resolvió en esta vuelta, así que no se puede quitar.',
                { code: 'FILA_RESUELTA' },
            )
        }

        try {
            await RotacionCliente.update(
                { deletedAt: new Date(), deletedBy: usuario },
                { where: { id } },
            )
        } catch (err) {
            throw new CustomError(500, `Error quitando el cliente de la rotación: ${err}`)
        }
    }
```

**Nota:** la interfaz `ResolucionEstadoRow` va a nivel de archivo (junto a `IdRow`/`MovimientoRow`, no anidada dentro de la clase) — TypeScript no permite declarar una interfaz dentro del cuerpo de una clase. Ubicarla junto a las otras interfaces de fila al principio del archivo.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts -t "quitar"`
Expected: PASS (los cinco tests del describe `quitar`)

- [ ] **Step 5: Ejecutar todo el archivo**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/repositories/RotacionClienteRepository.ts src/repositories/RotacionClienteRepository.spec.ts
git commit -m "$(cat <<'EOF'
feat(planificacion): RotacionClienteRepository.quitar()

Soft-delete de una fila pendiente, con 409 VISITA_EN_CURSO o
FILA_RESUELTA según corresponda.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `GerenciaRotacionService.quitarCliente()`

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\services\planificacion\GerenciaRotacionService.ts`
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\services\planificacion\GerenciaRotacionService.spec.ts`

**Interfaces:**
- Consume: `GerenciaRotacionService.requireRotacionDe`, `.requireEditable` (ya existen), `RotacionClienteRepository.findById`, `RotacionClienteRepository.quitar(id, usuario)` (Task 3).
- Produce: `GerenciaRotacionService.quitarCliente(user: IUser, vendedor: string, rotacionId: number, rotacionClienteId: number): Promise<void>` — Task 5 (controller) lo llama.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar en `GerenciaRotacionService.spec.ts`, después del `describe('reacomodar', ...)`:

```ts
describe('quitarCliente', () => {
    beforeEach(() => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue(rotacionAbierta)
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue({
            id: 11,
            rotacionId: 7,
            semana: 1,
            dia: 1,
        })
        ;(RotacionClienteRepository.quitar as jest.Mock).mockResolvedValue(undefined)
    })

    it('quita la fila con el usuario del token', async () => {
        await GerenciaRotacionService.quitarCliente(USER, 'V 2', 7, 11)

        expect(RotacionClienteRepository.quitar).toHaveBeenCalledWith(
            11,
            'jefe@distrisuper.com',
        )
    })

    it('404 si la fila es de otra rotación', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue({
            id: 11,
            rotacionId: 99,
            semana: 1,
            dia: 1,
        })

        await expect(
            GerenciaRotacionService.quitarCliente(USER, 'V 2', 7, 11),
        ).rejects.toMatchObject({ statusCode: 404, code: 'FILA_NOT_FOUND' })
        expect(RotacionClienteRepository.quitar).not.toHaveBeenCalled()
    })

    it('404 si la fila no existe', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(null)

        await expect(
            GerenciaRotacionService.quitarCliente(USER, 'V 2', 7, 11),
        ).rejects.toMatchObject({ statusCode: 404, code: 'FILA_NOT_FOUND' })
    })

    it('409 si la rotación ya está cerrada', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue({
            ...rotacionAbierta,
            estado: 'cerrada',
        })

        await expect(
            GerenciaRotacionService.quitarCliente(USER, 'V 2', 7, 11),
        ).rejects.toMatchObject({ statusCode: 409, code: 'ROTACION_CERRADA' })
        expect(RotacionClienteRepository.quitar).not.toHaveBeenCalled()
    })

    it('propaga el 409 VISITA_EN_CURSO del repositorio', async () => {
        ;(RotacionClienteRepository.quitar as jest.Mock).mockRejectedValue(
            new CustomError(409, 'x', { code: 'VISITA_EN_CURSO' }),
        )

        await expect(
            GerenciaRotacionService.quitarCliente(USER, 'V 2', 7, 11),
        ).rejects.toMatchObject({ statusCode: 409, code: 'VISITA_EN_CURSO' })
    })
})
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts -t "quitarCliente"`
Expected: FAIL con `GerenciaRotacionService.quitarCliente is not a function`.

- [ ] **Step 3: Implementar `quitarCliente()`**

Agregar en `GerenciaRotacionService.ts`, después del método `reacomodar` (antes de `crearProgramada`):

```ts
    /**
     * Quitar de gerencia. Mismas dos validaciones que `reacomodar` (rotación del
     * vendedor, rotación editable) — la regla de qué filas se pueden quitar (pendiente,
     * sin visita en curso) vive en el repositorio, igual que "fila resuelta" vive ahí
     * para reacomodar.
     */
    static async quitarCliente(
        user: IUser,
        vendedor: string,
        rotacionId: number,
        rotacionClienteId: number,
    ): Promise<void> {
        const rotacion = await GerenciaRotacionService.requireRotacionDe(
            vendedor,
            rotacionId,
        )
        GerenciaRotacionService.requireEditable(rotacion)

        const fila = await RotacionClienteRepository.findById(rotacionClienteId)
        if (!fila || fila.rotacionId !== rotacionId) {
            throw new CustomError(404, 'Cliente no encontrado en esta rotación.', {
                code: 'FILA_NOT_FOUND',
            })
        }

        await RotacionClienteRepository.quitar(
            rotacionClienteId,
            user.email ?? String(user.id),
        )
    }
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts -t "quitarCliente"`
Expected: PASS

- [ ] **Step 5: Ejecutar todo el archivo**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/planificacion/GerenciaRotacionService.ts src/services/planificacion/GerenciaRotacionService.spec.ts
git commit -m "$(cat <<'EOF'
feat(planificacion): GerenciaRotacionService.quitarCliente()

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Controller y ruta `DELETE .../rotacion-cliente/:id`

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\controllers\planificacionController.ts`
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\routes\planificacion.ts`

**Interfaces:**
- Consume: `GerenciaRotacionService.quitarCliente` (Task 4).
- Produce: `PlanificacionController.quitarClienteComoGerencia(req, res)`, ruta `DELETE /planificacion/vendedores/:codigo/rotaciones/:rotacionId/rotacion-cliente/:id`. No hay test dedicado a nivel de ruta/controller en este dominio (`reacomodarComoGerencia` tampoco tiene uno) — el service ya está cubierto por Task 4, y el controller es solo parseo + delegación.

- [ ] **Step 1: Agregar el método al controller**

En `planificacionController.ts`, agregar después de `reacomodarComoGerencia` (antes de `reordenarRotacion`):

```ts
    static async quitarClienteComoGerencia(req: Request, res: Response): Promise<void> {
        try {
            const rotacionId = parseInt(req.params.rotacionId, 10)
            const rotacionClienteId = parseInt(req.params.id, 10)
            if (isNaN(rotacionId) || isNaN(rotacionClienteId)) {
                res.status(400).json({ ok: 0, error: 'id inválido' })
                return
            }

            await GerenciaRotacionService.quitarCliente(
                req.user!,
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

En `routes/planificacion.ts`, agregar después de la ruta de `reacomodar` (antes de `intercambiar-dias`):

```ts
// Quita una fila pendiente de la rotación en curso (soft-delete). La próxima rotación
// la trae de vuelta: se materializa del template, no de esta.
router.delete(
    '/vendedores/:codigo/rotaciones/:rotacionId/rotacion-cliente/:id',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.quitarClienteComoGerencia(req, res)
    },
)
```

- [ ] **Step 3: Verificar que el proyecto compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Levantar el servidor y probar manualmente con curl**

Run: `npm run dev` (en una terminal aparte, dejar corriendo)

Luego, con un token válido de un rol de `ROLES_GERENCIA` y una fila pendiente real de prueba:

```bash
curl -X DELETE \
  "http://localhost:<puerto>/planificacion/vendedores/<codigo>/rotaciones/<rotacionId>/rotacion-cliente/<id>" \
  -H "Authorization: Bearer <token>"
```

Expected: `{"ok":1}` con status 200, y una segunda llamada con el mismo `id` devuelve 404 `FILA_NOT_FOUND` (porque `findById` ya no la ve).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/planificacionController.ts src/routes/planificacion.ts
git commit -m "$(cat <<'EOF'
feat(planificacion): DELETE rotacion-cliente para quitar de gerencia

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Excluir soft-deleteadas del denominador de cobertura

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\repositories\AnaliticaRepository.ts:118-178`
- Modify: `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores\src\repositories\AnaliticaRepository.spec.ts`

**Interfaces:**
- Ninguna firma cambia — solo se agrega una condición al `WHERE` de dos queries ya existentes (`findCobertura`, `findVisitasFueraDePlan`).

- [ ] **Step 1: Escribir los tests que fallan**

Agregar en `AnaliticaRepository.spec.ts`, dentro del `describe('findCobertura', ...)` ya existente:

```ts
    it('excluye filas soft-deleteadas del denominador', async () => {
        mockedQuery.mockResolvedValue([])
        await AnaliticaRepository.findCobertura({ desde: '2026-08-01', hasta: '2026-08-31' })
        const sql = mockedQuery.mock.calls[0][0] as string
        expect(sql).toContain('rc.deleted_at IS NULL')
    })
```

Y dentro de `describe('findVisitasFueraDePlan', ...)` (si no existe ese describe, crearlo junto a los otros con el mismo estilo de test del bloque de arriba):

```ts
    it('excluye filas soft-deleteadas', async () => {
        mockedQuery.mockResolvedValue([])
        await AnaliticaRepository.findVisitasFueraDePlan({ desde: '2026-08-01', hasta: '2026-08-31' })
        const sql = mockedQuery.mock.calls[0][0] as string
        expect(sql).toContain('rc.deleted_at IS NULL')
    })
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx jest src/repositories/AnaliticaRepository.spec.ts -t "soft-deleteadas"`
Expected: FAIL — el SQL actual no contiene `rc.deleted_at IS NULL`.

- [ ] **Step 3: Aplicar el filtro en `findCobertura`**

En `AnaliticaRepository.ts`, dentro de `findCobertura`, reemplazar:

```sql
                  WHERE cs.fecha_apertura < :hastaExclusiva
                    AND (cs.fecha_cierre >= :desde OR cs.fecha_cierre IS NULL)
                    AND rc.es_extra = 0
                    ${clausula}
                  GROUP BY cs.codigo_particular_vendedor`,
```

(la del método `findCobertura`) por:

```sql
                  WHERE cs.fecha_apertura < :hastaExclusiva
                    AND (cs.fecha_cierre >= :desde OR cs.fecha_cierre IS NULL)
                    AND rc.es_extra = 0
                    AND rc.deleted_at IS NULL
                    ${clausula}
                  GROUP BY cs.codigo_particular_vendedor`,
```

- [ ] **Step 4: Aplicar el filtro en `findVisitasFueraDePlan`**

En el mismo archivo, dentro de `findVisitasFueraDePlan`, reemplazar:

```sql
                  WHERE cs.fecha_apertura < :hastaExclusiva
                    AND (cs.fecha_cierre >= :desde OR cs.fecha_cierre IS NULL)
                    AND rc.es_extra = 1
                    ${clausula}
                  GROUP BY cs.codigo_particular_vendedor`,
```

por:

```sql
                  WHERE cs.fecha_apertura < :hastaExclusiva
                    AND (cs.fecha_cierre >= :desde OR cs.fecha_cierre IS NULL)
                    AND rc.es_extra = 1
                    AND rc.deleted_at IS NULL
                    ${clausula}
                  GROUP BY cs.codigo_particular_vendedor`,
```

- [ ] **Step 5: Ejecutar y verificar que pasan**

Run: `npx jest src/repositories/AnaliticaRepository.spec.ts -t "soft-deleteadas"`
Expected: PASS

- [ ] **Step 6: Ejecutar todo el archivo**

Run: `npx jest src/repositories/AnaliticaRepository.spec.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/repositories/AnaliticaRepository.ts src/repositories/AnaliticaRepository.spec.ts
git commit -m "$(cat <<'EOF'
fix(analitica): excluir filas soft-deleteadas del denominador de cobertura

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend — `quitarClienteAdmin()` en la API de gerencia

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\api\planificacionAdmin.ts`

**Interfaces:**
- Produce: `quitarClienteAdmin(codigo: string, rotacionId: number, rotacionClienteId: number): Promise<void>` — Task 8 lo consume.

No hay test dedicado a esta función sola (ninguna otra función de este archivo lo tiene — `reacomodarAdmin`, `cancelarRotacion`, etc. se prueban indirectamente a través del hook que las llama). Se cubre en Task 8.

- [ ] **Step 1: Agregar la función**

En `src/api/planificacionAdmin.ts`, agregar después de `reacomodarAdmin`:

```ts
/** Quita una fila pendiente de la rotación (soft-delete). 409 si ya está resuelta o el
 *  vendedor la está visitando ahora mismo. */
export const quitarClienteAdmin = async (
    codigo: string,
    rotacionId: number,
    rotacionClienteId: number,
): Promise<void> => {
    await apiClient.delete(
        `${base(codigo)}/${rotacionId}/rotacion-cliente/${rotacionClienteId}`,
    )
}
```

- [ ] **Step 2: Verificar que el proyecto compila**

Run: `npx tsc --noEmit` (desde `C:\Users\matia\Documents\distrisuper\app-planificacion`)
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/api/planificacionAdmin.ts
git commit -m "$(cat <<'EOF'
feat(planificacion): quitarClienteAdmin en la API de gerencia

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Frontend — `useQuitarClienteAdmin()`

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\hooks\useRotacionAdmin.ts`
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\hooks\useRotacionAdmin.test.tsx`

**Interfaces:**
- Consume: `quitarClienteAdmin` (Task 7).
- Produce: `useQuitarClienteAdmin(codigo: string)` → `useMutation` cuyo `mutate`/`mutateAsync` recibe `{ rotacionId: number; rotacionClienteId: number }`. Invalida `rotacionAdminKeys.grid(codigo, rotacionId)` al terminar. Task 9 lo consume desde `RutaPage`.

- [ ] **Step 1: Escribir el test que falla**

Agregar en `useRotacionAdmin.test.tsx`, después del `describe('useReacomodarAdmin — update optimista', ...)`:

```ts
describe('useQuitarClienteAdmin', () => {
    it('quita por rotación y fila, e invalida el grid', async () => {
        vi.mocked(api.quitarClienteAdmin).mockResolvedValue(undefined)
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
        const w = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        )

        const { result } = renderHook(() => useQuitarClienteAdmin('V 2'), { wrapper: w })
        await result.current.mutateAsync({ rotacionId: 7, rotacionClienteId: 11 })

        expect(api.quitarClienteAdmin).toHaveBeenCalledWith('V 2', 7, 11)
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ['rotacionAdmin', 'V 2', 'grid', 7],
        })
    })
})
```

Y agregar `useQuitarClienteAdmin` al import desde `./useRotacionAdmin` en la parte de arriba del archivo.

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/hooks/useRotacionAdmin.test.tsx -t "useQuitarClienteAdmin"`
Expected: FAIL — `useQuitarClienteAdmin` no existe.

- [ ] **Step 3: Implementar el hook**

En `src/hooks/useRotacionAdmin.ts`:

1. Agregar `quitarClienteAdmin` al import desde `@/api/planificacionAdmin`.
2. Agregar, después de `useReacomodarAdmin` (antes de `useReordenarRotacion`):

```ts
/**
 * Quitar una card de la rotación. Sin update optimista, a propósito: es una acción
 * destructiva (aunque reversible solo por la próxima rotación) y el caso de bloqueo
 * (409 FILA_RESUELTA / VISITA_EN_CURSO) es esperado, no un borde — mismo criterio que
 * `useIntercambiarDias`.
 */
export function useQuitarClienteAdmin(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number; rotacionClienteId: number }) =>
            quitarClienteAdmin(codigo, args.rotacionId, args.rotacionClienteId),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
        },
    })
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run src/hooks/useRotacionAdmin.test.tsx -t "useQuitarClienteAdmin"`
Expected: PASS

- [ ] **Step 5: Ejecutar todo el archivo**

Run: `npx vitest run src/hooks/useRotacionAdmin.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useRotacionAdmin.ts src/hooks/useRotacionAdmin.test.tsx
git commit -m "$(cat <<'EOF'
feat(planificacion): useQuitarClienteAdmin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Frontend — botón "Quitar de esta vuelta" en `ClienteCardRuta`

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\components\ruta\ClienteCardRuta.tsx`
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\components\ruta\ClienteCardRuta.test.tsx`

**Interfaces:**
- Produce: prop nueva `onQuitar?: (rotacionClienteId: number) => void` en `ClienteCardRutaProps`. Task 10 la conecta.
- El botón se muestra solo si `onQuitar` está definido **y** `cliente.estado === 'pendiente'` — no reutiliza `!resuelto` (que incluye `en_curso`) porque `en_curso` tiene que bloquear con `VISITA_EN_CURSO`, no ofrecerse como si fuera a funcionar.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar en `ClienteCardRuta.test.tsx`, al final del `describe('ClienteCardRuta', ...)`:

```ts
    it('muestra "Quitar de esta vuelta" solo si está pendiente y hay callback', () => {
        const onQuitar = () => {}
        const { rerender } = render(
            <ClienteCardRuta cliente={CLIENTE} onQuitar={onQuitar} />,
        )
        expect(
            screen.getByRole('button', { name: /quitar de esta vuelta/i }),
        ).toBeInTheDocument()

        rerender(<ClienteCardRuta cliente={CLIENTE} />)
        expect(
            screen.queryByRole('button', { name: /quitar de esta vuelta/i }),
        ).not.toBeInTheDocument()
    })

    it('no ofrece quitar una card en_curso: bloquearía con VISITA_EN_CURSO', () => {
        render(
            <ClienteCardRuta
                cliente={{ ...CLIENTE, estado: 'en_curso' }}
                onQuitar={() => {}}
            />,
        )
        expect(
            screen.queryByRole('button', { name: /quitar de esta vuelta/i }),
        ).not.toBeInTheDocument()
    })

    it('confirma antes de quitar, y llama a onQuitar solo si se confirma', () => {
        const onQuitar = vi.fn()
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        render(<ClienteCardRuta cliente={CLIENTE} onQuitar={onQuitar} />)

        screen.getByRole('button', { name: /quitar de esta vuelta/i }).click()

        expect(onQuitar).toHaveBeenCalledWith(11)
    })

    it('no quita si se cancela la confirmación', () => {
        const onQuitar = vi.fn()
        vi.spyOn(window, 'confirm').mockReturnValue(false)
        render(<ClienteCardRuta cliente={CLIENTE} onQuitar={onQuitar} />)

        screen.getByRole('button', { name: /quitar de esta vuelta/i }).click()

        expect(onQuitar).not.toHaveBeenCalled()
    })
```

Y agregar `vi` al import de `vitest` en la primera línea del archivo (`import { describe, it, expect, vi } from 'vitest'`).

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/components/ruta/ClienteCardRuta.test.tsx`
Expected: FAIL en los cuatro tests nuevos — el botón no existe.

- [ ] **Step 3: Implementar el botón**

En `ClienteCardRuta.tsx`, agregar la prop:

```ts
interface ClienteCardRutaProps {
    cliente: IAgendaClientAdmin
    /** false = solo lectura (rotación cerrada, o fila ya resuelta). */
    arrastrable?: boolean
    /** Ausente = no se ofrece quitar (ej. dentro de ColaRotaciones, o rotación no editable). */
    onQuitar?: (rotacionClienteId: number) => void
}
```

Actualizar la firma de la función y agregar la lógica de confirmación y el botón:

```tsx
export default function ClienteCardRuta({ cliente, arrastrable, onQuitar }: ClienteCardRutaProps) {
    const resuelto = estaResuelto(cliente.estado)

    const autoria = cliente.ultimoMovimiento
        ? `Movió ${cliente.ultimoMovimiento.origen} (${cliente.ultimoMovimiento.usuario}) el ${fechaHoraNegocio(cliente.ultimoMovimiento.fecha)}`
        : null

    // Una fila resuelta nunca es arrastrable: el backend la rechaza con FILA_RESUELTA, y
    // dejar arrastrarla sería ofrecer una acción que va a fallar.
    const puedeMoverse = (arrastrable ?? true) && !resuelto

    // Estricto por 'pendiente' y no por !resuelto: 'en_curso' NO cuenta como resuelto,
    // pero el backend igual rechaza quitarla con 409 VISITA_EN_CURSO. Mostrar el botón
    // ahí ofrecería una acción que siempre falla.
    const puedeQuitarse = onQuitar !== undefined && cliente.estado === 'pendiente'

    const confirmarQuitar = () => {
        const ok = window.confirm(
            `¿Quitar a ${titleCaseNombre(cliente.nombreCliente)} de esta vuelta? Vuelve a aparecer en la próxima rotación.`,
        )
        if (ok) onQuitar!(cliente.rotacionClienteId)
    }

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
            className={`relative rounded-md border px-2 py-1.5 text-xs ${
                resuelto
                    ? 'border-slate-200 bg-slate-100 text-slate-500'
                    : 'border-slate-300 bg-white text-slate-800'
            } ${isDragging ? 'opacity-50' : ''} ${puedeMoverse ? 'cursor-grab' : ''}`}
        >
            {puedeQuitarse && (
                <button
                    type="button"
                    aria-label={`Quitar de esta vuelta: ${titleCaseNombre(cliente.nombreCliente)}`}
                    onClick={confirmarQuitar}
                    className="absolute right-1 top-1 rounded px-1 text-[11px] text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                    ✕
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

Nota: el `aria-label` del botón incluye el nombre del cliente para que sea distinguible entre las ~40 cards de la rotación (mismo motivo por el que `Celda` etiqueta sus botones con semana/día) — pero el test usa `/quitar de esta vuelta/i` como substring, que matchea igual.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx vitest run src/components/ruta/ClienteCardRuta.test.tsx`
Expected: PASS (los cuatro tests nuevos y los ya existentes).

- [ ] **Step 5: Commit**

```bash
git add src/components/ruta/ClienteCardRuta.tsx src/components/ruta/ClienteCardRuta.test.tsx
git commit -m "$(cat <<'EOF'
feat(ruta): botón "Quitar de esta vuelta" en ClienteCardRuta

Visible solo sobre filas pendientes: en_curso bloquearía con
VISITA_EN_CURSO, así que no se ofrece.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wiring — `GridRotacion` → `RutaPage`, y mensaje de error

**Files:**
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\components\ruta\GridRotacion.tsx`
- Modify: `C:\Users\matia\Documents\distrisuper\app-planificacion\src\pages\RutaPage.tsx`

**Interfaces:**
- Consume: `onQuitar` de `ClienteCardRuta` (Task 9), `useQuitarClienteAdmin` (Task 8), `errorCode`/`errorData` (`src/lib/apiError.ts`, ya existe).
- Produce: `GridRotacionProps.onQuitar?: (rotacionClienteId: number) => void`, propagada hasta cada `ClienteCardRuta`.

No hay test de `GridRotacion.tsx` en el repo hoy (solo se prueban `parsearCelda`/`parsearCard`/`movimientoDeDrop`, funciones puras exportadas) — este task es wiring puro de props sin lógica nueva, así que no agrega tests de componente; queda cubierto por Task 9 (el botón en sí) y por una verificación manual en Step 4.

- [ ] **Step 1: Propagar `onQuitar` por `GridRotacion`**

En `GridRotacion.tsx`, agregar a `GridRotacionProps`:

```ts
interface GridRotacionProps {
    semanas: ISemanaRotacionAdmin[]
    onMover: (rotacionClienteId: number, semana: number, dia: number) => void
    onRenombrarSemana: (semana: number, descripcion: string | null) => void
    onIntercambiar: (a: Celda, b: Celda) => void
    /** Ausente = no se ofrece quitar (rotación no editable). */
    onQuitar?: (rotacionClienteId: number) => void
    /** false = rotación cerrada: se ve pero no se toca. */
    editable?: boolean
}
```

Agregar `onQuitar` a la firma de `GridRotacion` y a `CeldaProps`:

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
}
```

En la función `Celda`, agregar `onQuitar` a los parámetros desestructurados y pasarlo a cada card:

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
}: CeldaProps) {
```

```tsx
            {clientes.map(cliente => (
                <ClienteCardRuta
                    key={cliente.rotacionClienteId}
                    cliente={cliente}
                    arrastrable={arrastrable}
                    onQuitar={arrastrable ? onQuitar : undefined}
                />
            ))}
```

(`arrastrable ? onQuitar : undefined`: si la rotación no es editable, ni se arrastra ni se quita — mismo criterio que ya usa `arrastrable` para el drag.)

En `GridRotacion`, agregar `onQuitar` a los parámetros de la función y pasarlo a cada `<Celda>`:

```tsx
export default function GridRotacion({
    semanas,
    onMover,
    onRenombrarSemana,
    onIntercambiar,
    onQuitar,
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
    useRotacion,
    useRotaciones,
} from '@/hooks/useRotacionAdmin'
```

```ts
    const intercambiar = useIntercambiarDias(vendedor ?? '')
    const quitar = useQuitarClienteAdmin(vendedor ?? '')
```

Pasar la prop al `<GridRotacion>`:

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
                        onQuitar={rotacionClienteId =>
                            quitar.mutate({ rotacionId: grid.id, rotacionClienteId })
                        }
                    />
```

- [ ] **Step 3: Mostrar el error de bloqueo**

Agregar, después del bloque `{intercambiar.isError && (...)}`, antes del comentario final sobre `omitidos`:

```tsx
                {quitar.isError && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {errorCode(quitar.error) === 'VISITA_EN_CURSO'
                            ? 'No se pudo quitar: el vendedor está visitando a ese cliente ahora mismo. Probá de nuevo cuando cierre la visita.'
                            : 'No se pudo quitar ese cliente. Puede que ya lo hayan visitado en esta vuelta.'}
                    </p>
                )}
```

(`errorCode` ya está importado en el archivo — se usa en el bloque de `intercambiar.isError`.)

- [ ] **Step 4: Verificar manualmente en el navegador**

Run: `npm run dev` (desde `C:\Users\matia\Documents\distrisuper\app-planificacion`)

1. Ir a `/analitica/ruta`, elegir un vendedor con una rotación abierta con al menos un cliente pendiente.
2. Verificar que aparece el botón "✕" solo sobre cards pendientes (no sobre resueltas, ni sobre `en_curso` si hay alguna de prueba).
3. Click en el botón, cancelar el `confirm` → la card sigue ahí.
4. Click de nuevo, aceptar → la card desaparece de la grilla sin recargar la página.
5. Recargar la página (F5) → la card sigue sin aparecer (persistió en el backend).

- [ ] **Step 5: Ejecutar toda la suite de frontend**

Run: `npx vitest run`
Expected: PASS (todos los tests del proyecto, sin regresiones).

- [ ] **Step 6: Commit**

```bash
git add src/components/ruta/GridRotacion.tsx src/pages/RutaPage.tsx
git commit -m "$(cat <<'EOF'
feat(ruta): conectar "Quitar de esta vuelta" en la grilla de gerencia

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verificación final

- [ ] Backend: `npx jest` completo desde `api-vendedores` → PASS.
- [ ] Frontend: `npx vitest run` completo desde `app-planificacion` → PASS.
- [ ] `npx tsc --noEmit` en ambos repos → sin errores.
- [ ] Aplicar manualmente `docs/db-notes/planificacion-quitar-cliente-rotacion.sql` contra el ambiente de desarrollo antes de probar el flujo end-to-end (no lo aplica ningún test — es DDL manual, ver Task 1).
