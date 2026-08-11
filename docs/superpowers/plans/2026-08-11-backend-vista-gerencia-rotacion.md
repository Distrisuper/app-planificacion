# Backend de la vista de gerencia de rotación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que gerencia (`admin`/`supervisor`/`versus-ger`) pueda ver y editar la rotación de cualquier vendedor, y encolar rotaciones programadas para planificar con meses de anticipación.

**Architecture:** Se extiende `pl_rotacion` con `estado`/`orden`/`descripcion`, moviendo el invariante "una sola rotación vigente por vendedor" de `fecha_fin IS NULL` a `estado='abierta'` — eso libera `fecha_fin IS NULL` para las rotaciones `'programada'`, que forman una cola con orden explícito. Se agrega `pl_rotacion_semana` como set autoritativo de semanas (reemplaza el `SELECT DISTINCT` derivado), lo que además permite nombrar una semana vacía y cierra un agujero de validación. Los endpoints de gerencia son un prefijo hermano de los de self-service, que quedan intactos.

**Tech Stack:** TypeScript, Express, Sequelize (MySQL, conexión `sequelizeWritePlanificacion`), Jest.

## Global Constraints

- **Repo/rama:** `api-vendedores`, worktree `C:/Users/matia/orca/workspaces/api-vendedores/MatiasH11-plan-rotacion-editable`, rama `MatiasH11/plan-rotacion-editable`.
- **Tests:** Jest. Comando: `npm test`. Un test puntual: `npx jest src/ruta/Archivo.spec.ts -t "nombre del test"`. Los specs viven al lado del fuente (`X.spec.ts`), mockean modelos con `jest.mock('../models/...')`.
- **Los cambios de esquema van DENTRO del DDL pendiente, nunca como `ALTER TABLE` posterior.** `pl_rotacion` y sus hermanas no existen en `origin/master`: nacen en esta rama. Un ALTER encima sería complejidad gratuita y un backfill innecesario.
- **`pl_reacomodacion` NO se modifica.** Ya tiene `origen VARCHAR(20) NOT NULL` y `usuario VARCHAR(100) NOT NULL`. La autoría ya se persiste; este plan solo la expone.
- **Formato de `usuario`:** `user.email ?? String(user.id)`. Es el precedente ya establecido en `VisitasService.ts:209`; no inventar otro.
- **`authorize()` es variádico:** `authorize(...ROLES_GERENCIA)`. Pasarle un array NO funciona (compararía un array contra un string).
- **Los tres roles de gerencia tienen permiso completo por igual:** `admin`, `versus-ger`, `supervisor`. Sin la distinción fina que existe en el dominio Notas.
- **Valores exactos del enum de estado:** `'programada'`, `'abierta'`, `'cerrada'`, `'cancelada'`.
- **Códigos de error exactos** (se agregan a los ya existentes `FILA_NOT_FOUND`, `FILA_RESUELTA`, `FILA_AJENA`, `SEMANA_FUERA_DEL_SET`, `DIA_INVALIDO`, `ROTACION_SIN_CLIENTES`, `ROTACION_COMPLETA`): `ROTACION_NOT_FOUND`, `ROTACION_CERRADA`, `ROTACION_NO_PROGRAMADA`.
- **La ejecución de la migración de datos contra producción NO es parte de este plan.** Acá solo se deja el script correcto y verificado contra el fixture; planificar el rollout es un ejercicio aparte.
- Spec de referencia: `app-planificacion/docs/superpowers/specs/2026-08-11-vista-gerencia-rotacion-design.md`.

## File Structure

**Modificados:**
- `docs/db-notes/planificacion-ciclo-tables.sql` — esquema consolidado: `pl_rotacion` gana columnas, nace `pl_rotacion_semana`.
- `docs/db-notes/planificacion-migracion-rotacion.sql` — misma forma + poblar `estado` y el set de semanas de lo migrado.
- `src/models/planificacion/Rotacion.ts` — atributos nuevos, `fechaInicio` nullable.
- `src/types/planificacion.ts` — `EstadoRotacion`, `IRotacion` extendido, tipos de gerencia.
- `src/repositories/RotacionRepository.ts` — invariante por `estado` + primitivas de cola.
- `src/repositories/RotacionClienteRepository.ts` — `semanasDelSet` se va a su propio repo; se agrega `findUltimosMovimientos`.
- `src/services/planificacion/RotacionService.ts` — materializar puebla semanas y hereda descripciones; `asegurarRotacion` activa la cola.
- `src/services/planificacion/AgendaService.ts` — `enriquecer` deja de ser privada; `DIA_KEYS`/`EMPTY_WEEK` se exportan.
- `src/services/planificacion/VisitasService.ts` — valida el set contra el repo nuevo.
- `src/controllers/planificacionController.ts` — handlers de gerencia.
- `src/routes/planificacion.ts` — rutas de gerencia.

**Creados:**
- `src/models/planificacion/RotacionSemana.ts` — modelo del set de semanas.
- `src/repositories/RotacionSemanaRepository.ts` + `.spec.ts` — set autoritativo y descripciones.
- `src/services/planificacion/GerenciaRotacionService.ts` + `.spec.ts` — toda la lógica de gerencia, separada del self-service.

---

### Task 1: DDL — `estado`/`orden`/`descripcion` y `pl_rotacion_semana`

**Files:**
- Modify: `docs/db-notes/planificacion-ciclo-tables.sql:52-65`
- Modify: `docs/db-notes/planificacion-migracion-rotacion.sql:14-23`, `:57-60`, `:123-136`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: el esquema que todas las tareas siguientes asumen — `pl_rotacion.estado` (ENUM NOT NULL), `pl_rotacion.orden` (INT NULL), `pl_rotacion.descripcion` (VARCHAR(120) NULL), `pl_rotacion.fecha_inicio` (DATETIME **NULL**), tabla `pl_rotacion_semana (rotacion_id, semana, descripcion)`.

- [x] **Step 1: Reemplazar el `CREATE TABLE pl_rotacion` de `planificacion-ciclo-tables.sql`**

Reemplazá el bloque de las líneas 52-65 por:

```sql
CREATE TABLE IF NOT EXISTS pl_rotacion (
  id                         INT AUTO_INCREMENT PRIMARY KEY,
  codigo_particular_vendedor VARCHAR(50) NOT NULL,

  -- 'programada' = planificada por gerencia, todavía no vigente (la cola).
  -- 'abierta'    = la única vigente por vendedor.
  -- 'cerrada'    = ya vivida, no editable.
  -- 'cancelada'  = soft-delete de una programada. NO se borra la fila: pl_reacomodacion
  --                le apunta a través de pl_rotacion_cliente.
  estado ENUM('programada','abierta','cerrada','cancelada') NOT NULL,

  -- NULL mientras está 'programada': no se sabe cuándo va a arrancar, depende de cuándo
  -- cierre la anterior EN LA REALIDAD (no es una fecha calendario). Se sella al activar.
  fecha_inicio               DATETIME    NULL,
  fecha_fin                  DATETIME    NULL,      -- se completó

  -- Nombre que le pone gerencia, ej. "Ronda Agosto".
  descripcion VARCHAR(120) NULL,

  -- Posición en la cola de programadas de este vendedor (1 = la próxima en activarse).
  -- NULL en cualquier otro estado: al activarse o cancelarse se limpia, así una
  -- cancelada no deja un hueco reservado para siempre.
  --
  -- SIN unique sobre (vendedor, orden) a propósito: intercambiar dos posiciones violaría
  -- la constraint a mitad de transacción y MySQL no tiene constraints deferidas. La
  -- unicidad la garantiza el service renumerando la cola completa.
  orden INT NULL,

  -- Una sola rotación abierta por vendedor, con el mismo truco de columna generada que
  -- pl_ciclo_semana: MySQL no soporta índices parciales y los NULL no colisionan.
  --
  -- Depende de `estado` y NO de `fecha_fin IS NULL`: una 'programada' también tiene
  -- fecha_fin NULL, y con la condición vieja habría colisionado con la abierta del mismo
  -- vendedor (o peor, se habría devuelto como si fuera la vigente).
  vendedor_abierta VARCHAR(50)
    AS (IF(estado = 'abierta', codigo_particular_vendedor, NULL)) STORED,

  UNIQUE KEY uq_una_rotacion_abierta (vendedor_abierta),
  INDEX idx_vendedor (codigo_particular_vendedor),
  INDEX idx_cola (codigo_particular_vendedor, estado, orden)
);

-- ①bis EL SET DE SEMANAS de la rotación, explícito.
--
-- Antes se derivaba con `SELECT DISTINCT semana FROM pl_rotacion_cliente`. Eso tenía dos
-- agujeros: mover el último cliente fuera de una semana hacía DESAPARECER la semana de la
-- rotación, y no había dónde nombrar una semana que todavía no tiene clientes. Además es
-- la única barrera real contra reacomodar a una semana inexistente (el CHECK de
-- pl_rotacion_cliente solo pide semana >= 1).
CREATE TABLE IF NOT EXISTS pl_rotacion_semana (
  rotacion_id INT          NOT NULL,
  semana      TINYINT      NOT NULL,
  -- Suelen mapear a una zona, ej. "Buenos Aires". Se hereda de la rotación anterior del
  -- mismo vendedor al materializar (ver RotacionService.materializar).
  descripcion VARCHAR(120) NULL,
  PRIMARY KEY (rotacion_id, semana),
  FOREIGN KEY (rotacion_id) REFERENCES pl_rotacion (id),
  CONSTRAINT ck_rs_semana CHECK (semana >= 1)
);
```

- [x] **Step 2: Aplicar la misma forma al `CREATE TABLE pl_rotacion` de la migración**

En `planificacion-migracion-rotacion.sql`, reemplazá el bloque de las líneas 14-23 por la misma definición de `pl_rotacion` del Step 1 (sin el `IF NOT EXISTS`, para mantener el estilo del archivo de migración), y agregá el `CREATE TABLE pl_rotacion_semana` (también sin `IF NOT EXISTS`) justo después del `CREATE TABLE pl_reacomodacion` de la línea 53.

- [x] **Step 3: Poblar `estado` en el INSERT de rotaciones migradas**

Las rotaciones fabricadas para el historial quedan abiertas. Con `estado` NOT NULL el INSERT de la línea 57-60 ya no compila. Reemplazalo por:

```sql
-- ② Una rotación por vendedor con historial. Queda ABIERTA para que el vendedor siga
-- trabajando sobre ella sin rematerializar. `estado` va explícito: es NOT NULL y sin
-- default, justamente para que ningún INSERT se olvide de decidirlo.
INSERT INTO pl_rotacion (codigo_particular_vendedor, estado, fecha_inicio)
SELECT codigo_particular_vendedor, 'abierta', MIN(fecha_apertura)
  FROM pl_ciclo_semana
 GROUP BY codigo_particular_vendedor;
```

- [x] **Step 4: Poblar el set de semanas de lo migrado**

Agregá este bloque inmediatamente después del `INSERT INTO pl_rotacion_cliente` que termina en la línea 108 (paso ④):

```sql
-- ④bis El set de semanas de cada rotación migrada, tomado del plan recién volcado —
-- exactamente lo que antes devolvía el SELECT DISTINCT. La migración preserva el set
-- vigente y de acá en más la tabla es la fuente de verdad. Las descripciones nacen NULL:
-- el historial no tenía dónde guardar el nombre de la zona.
INSERT INTO pl_rotacion_semana (rotacion_id, semana)
SELECT DISTINCT rotacion_id, semana
  FROM pl_rotacion_cliente;
```

- [x] **Step 5: Agregar el chequeo del set a la verificación**

En el `SELECT` de verificación (paso ⑥, líneas 123-136), agregá una cuarta fila antes del `;` final. El `UNION ALL` que cierra la tercera consulta necesita quedar así:

```sql
UNION ALL
SELECT 'ciclos sin rotacion', COUNT(*) FROM pl_ciclo_semana WHERE rotacion_id IS NULL
UNION ALL
-- Toda semana que tenga clientes tiene que existir en el set. Si esto no da 0, el grid de
-- gerencia mostraría clientes en una semana sin nombre ni existencia declarada.
SELECT 'semanas del plan que no llegaron al set', COUNT(*) FROM (
    SELECT DISTINCT rotacion_id, semana FROM pl_rotacion_cliente
) p
LEFT JOIN pl_rotacion_semana rs
       ON rs.rotacion_id = p.rotacion_id AND rs.semana = p.semana
WHERE rs.rotacion_id IS NULL;
```

- [x] **Step 6: Verificar la migración contra el fixture**

El fixture reconstruye el esquema viejo en una base aparte. Levantá MySQL local (`docker compose -f docker-compose.local.yml up -d mysql`) y corré:

```bash
docker compose -f docker-compose.local.yml exec -T mysql \
  mysql -uroot -proot < docs/db-notes/fixtures/planificacion-esquema-viejo-fixture.sql

docker compose -f docker-compose.local.yml exec -T mysql \
  mysql -uroot -proot planificacion_migracion < docs/db-notes/planificacion-migracion-rotacion.sql
```

Expected: sin errores de SQL, y las **cuatro** filas de la verificación con `debe_ser_cero = 0`.

Si `mysql` pide otra credencial, sacala de `docker-compose.local.yml` (servicio mysql, `MYSQL_ROOT_PASSWORD`).

- [x] **Step 7: Commit**

```bash
git add docs/db-notes/planificacion-ciclo-tables.sql docs/db-notes/planificacion-migracion-rotacion.sql
git commit -m "feat(planificacion): estado/orden/descripcion en pl_rotacion y set de semanas explicito"
```

---

### Task 2: Modelo `Rotacion` y tipo `IRotacion`

**Files:**
- Modify: `src/models/planificacion/Rotacion.ts`
- Modify: `src/types/planificacion.ts:61-66`
- Test: `src/repositories/RotacionRepository.spec.ts`

**Interfaces:**
- Consumes: el esquema de la Task 1.
- Produces: `EstadoRotacion` (union type) e `IRotacion` con `estado`, `descripcion`, `orden` y `fechaInicio: string | null`. Todas las tareas siguientes usan estos nombres.

- [x] **Step 1: Escribir el test que falla**

`fecha_inicio` pasó a nullable, y `toIRotacion` hoy hace `r.fechaInicio.toISOString()` sin guard: una rotación programada lo revienta. Agregá al final de `src/repositories/RotacionRepository.spec.ts`:

```ts
describe('toIRotacion (vía findAbiertaByVendedor)', () => {
    it('mapea una rotación programada sin fechaInicio sin explotar', async () => {
        mockedFindOne.mockResolvedValue({
            id: 9,
            codigoParticularVendedor: 'V 2',
            estado: 'programada',
            fechaInicio: null,
            fechaFin: null,
            descripcion: 'Ronda Septiembre',
            orden: 1,
        } as any)

        const rot = await RotacionRepository.findAbiertaByVendedor('V 2')

        expect(rot).toEqual({
            id: 9,
            codigoParticularVendedor: 'V 2',
            estado: 'programada',
            fechaInicio: null,
            fechaFin: null,
            descripcion: 'Ronda Septiembre',
            orden: 1,
        })
    })
})
```

- [x] **Step 2: Correr el test y verificar que falla**

Run: `npx jest src/repositories/RotacionRepository.spec.ts -t "sin fechaInicio"`
Expected: FAIL — `Cannot read properties of null (reading 'toISOString')`.

- [x] **Step 3: Extender el tipo `IRotacion`**

En `src/types/planificacion.ts`, reemplazá el bloque de `IRotacion` (líneas 61-66) por:

```ts
export type EstadoRotacion = 'programada' | 'abierta' | 'cerrada' | 'cancelada'

/** La rotación concreta. Vigente mientras estado sea 'abierta' — NO mientras fechaFin
 *  sea null: una 'programada' también tiene fechaFin null y todavía no arrancó. */
export interface IRotacion {
    id: number
    codigoParticularVendedor: string
    estado: EstadoRotacion
    /** null mientras está 'programada': todavía no se sabe cuándo arranca. */
    fechaInicio: string | null
    fechaFin: string | null
    /** Nombre que le pone gerencia, ej. "Ronda Agosto". */
    descripcion: string | null
    /** Posición en la cola de programadas. null en cualquier otro estado. */
    orden: number | null
}
```

- [x] **Step 4: Extender el modelo Sequelize**

En `src/models/planificacion/Rotacion.ts`, reemplazá la interfaz, la clase y el `init` por:

```ts
import { Model, DataTypes } from 'sequelize'
import { sequelizeWritePlanificacion } from '../../database/connection'
import { EstadoRotacion } from '../../types/planificacion'

interface IRotacionAttributes {
    id?: number
    codigoParticularVendedor: string
    estado: EstadoRotacion
    fechaInicio?: Date | null
    fechaFin?: Date | null
    descripcion?: string | null
    orden?: number | null
}

class Rotacion extends Model<IRotacionAttributes> implements IRotacionAttributes {
    public id!: number
    public codigoParticularVendedor!: string
    public estado!: EstadoRotacion
    public fechaInicio?: Date | null
    public fechaFin?: Date | null
    public descripcion?: string | null
    public orden?: number | null
}

// NOTA: la columna generada `vendedor_abierta` NO se declara acá, por el mismo motivo
// que `vendedor_abierto` en CicloSemana: la calcula MySQL y si Sequelize la conociera
// intentaría escribirla en los INSERT.
Rotacion.init(
    {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: 'id' },
        codigoParticularVendedor: {
            type: DataTypes.STRING(50),
            allowNull: false,
            field: 'codigo_particular_vendedor',
        },
        estado: {
            type: DataTypes.ENUM('programada', 'abierta', 'cerrada', 'cancelada'),
            allowNull: false,
            field: 'estado',
        },
        // Nullable: una 'programada' todavía no arrancó.
        fechaInicio: { type: DataTypes.DATE, allowNull: true, field: 'fecha_inicio' },
        fechaFin: { type: DataTypes.DATE, allowNull: true, field: 'fecha_fin' },
        descripcion: { type: DataTypes.STRING(120), allowNull: true, field: 'descripcion' },
        orden: { type: DataTypes.INTEGER, allowNull: true, field: 'orden' },
    },
    {
        sequelize: sequelizeWritePlanificacion,
        modelName: 'Rotacion',
        tableName: 'pl_rotacion',
        timestamps: false,
    },
)

export default Rotacion
```

- [x] **Step 5: Agregar el guard en `toIRotacion`**

En `src/repositories/RotacionRepository.ts`, reemplazá `toIRotacion` (líneas 68-75) por:

```ts
function toIRotacion(r: Rotacion): IRotacion {
    return {
        id: r.id,
        codigoParticularVendedor: r.codigoParticularVendedor,
        estado: r.estado,
        // Guard obligatorio: fechaInicio es null en las programadas.
        fechaInicio: r.fechaInicio ? r.fechaInicio.toISOString() : null,
        fechaFin: r.fechaFin ? r.fechaFin.toISOString() : null,
        descripcion: r.descripcion ?? null,
        orden: r.orden ?? null,
    }
}
```

- [x] **Step 6: Correr el test y verificar que pasa**

Run: `npx jest src/repositories/RotacionRepository.spec.ts`
Expected: el test nuevo PASA. El test viejo `'busca por fechaFin null y mapea la fila'` **falla** — su fila mock no tiene los campos nuevos y su assert de `where` es el viejo. Se arregla en la Task 3, que es donde cambia ese comportamiento. Si querés dejar la suite verde entre tareas, corré solo el archivo con `-t "sin fechaInicio"`.

- [x] **Step 7: Commit**

```bash
git add src/models/planificacion/Rotacion.ts src/types/planificacion.ts src/repositories/RotacionRepository.ts src/repositories/RotacionRepository.spec.ts
git commit -m "feat(planificacion): IRotacion con estado/orden/descripcion y fechaInicio nullable"
```

---

### Task 3: El invariante de "vigente" pasa a depender de `estado`

**Files:**
- Modify: `src/repositories/RotacionRepository.ts:13-45`
- Test: `src/repositories/RotacionRepository.spec.ts:23-49`, `:66-75`

**Interfaces:**
- Consumes: `IRotacion`/`EstadoRotacion` (Task 2).
- Produces: `findAbiertaByVendedor` filtra `estado: 'abierta'`; `crear` escribe `estado: 'abierta'`; `cerrar` escribe `estado: 'cerrada'`. Sus 8 call sites existentes no cambian de firma.

**Por qué importa:** es la regresión más peligrosa de toda la entrega. Si `findAbiertaByVendedor` sigue filtrando por `fechaFin: null`, una rotación `'programada'` (que también tiene `fecha_fin` NULL) se devuelve como la rotación vigente del vendedor — y el vendedor terminaría trabajando sobre un plan que todavía no arrancó.

- [x] **Step 1: Escribir los tests que fallan**

Reemplazá el `describe('findAbiertaByVendedor')` (líneas 23-49) y el `describe('cerrar')` (líneas 66-75) por:

```ts
describe('findAbiertaByVendedor', () => {
    it('filtra por estado abierta, NO por fechaFin null', async () => {
        mockedFindOne.mockResolvedValue({
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta',
            fechaInicio: new Date('2026-08-03T12:12:00.000Z'),
            fechaFin: null,
            descripcion: null,
            orden: null,
        } as any)

        const rot = await RotacionRepository.findAbiertaByVendedor('V 2')

        // Con `fechaFin: null` una rotación 'programada' entraría acá y el vendedor
        // trabajaría sobre un plan que todavía no arrancó.
        expect(mockedFindOne).toHaveBeenCalledWith({
            where: { codigoParticularVendedor: 'V 2', estado: 'abierta' },
        })
        expect(rot).toEqual({
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta',
            fechaInicio: '2026-08-03T12:12:00.000Z',
            fechaFin: null,
            descripcion: null,
            orden: null,
        })
    })

    it('devuelve null si no hay rotación abierta', async () => {
        mockedFindOne.mockResolvedValue(null)
        await expect(RotacionRepository.findAbiertaByVendedor('V 2')).resolves.toBeNull()
    })
})

describe('crear', () => {
    it('nace abierta y con fechaInicio sellada', async () => {
        mockedCreate.mockResolvedValue({ id: 12 } as any)

        await expect(RotacionRepository.crear('V 2')).resolves.toBe(12)

        const [valores] = mockedCreate.mock.calls[0]
        expect(valores.codigoParticularVendedor).toBe('V 2')
        expect(valores.estado).toBe('abierta')
        expect(valores.fechaInicio).toBeInstanceOf(Date)
    })
})

describe('cerrar', () => {
    it('sella fechaFin y marca estado cerrada', async () => {
        mockedUpdate.mockResolvedValue([1])
        await RotacionRepository.cerrar(7)

        const [valores, opciones] = mockedUpdate.mock.calls[0]
        expect(valores.fechaFin).toBeInstanceOf(Date)
        expect(valores.estado).toBe('cerrada')
        expect(opciones.where).toEqual({ id: 7 })
    })
})
```

- [x] **Step 2: Correr los tests y verificar que fallan**

Run: `npx jest src/repositories/RotacionRepository.spec.ts`
Expected: FAIL en los tres — el `where` esperado no coincide, y `valores.estado` es `undefined`.

- [x] **Step 3: Implementar**

En `src/repositories/RotacionRepository.ts`, reemplazá los tres métodos (líneas 12-45) por:

```ts
    /** Vigente = estado 'abierta'. Lo garantiza el UNIQUE uq_una_rotacion_abierta, que
     *  cuelga de la columna generada `vendedor_abierta`.
     *
     *  NO se filtra por `fechaFin: null`: una rotación 'programada' de la cola también
     *  tiene fechaFin null y NO es la vigente. */
    static async findAbiertaByVendedor(vendedor: string): Promise<IRotacion | null> {
        try {
            const row = await Rotacion.findOne({
                where: { codigoParticularVendedor: vendedor, estado: 'abierta' },
            })
            return row ? toIRotacion(row) : null
        } catch (err) {
            throw new CustomError(500, `Error fetching rotación abierta: ${err}`)
        }
    }

    /** Crea una rotación YA VIGENTE (el camino reactivo de siempre: no hay cola y el
     *  vendedor necesita una ahora). Para encolar una futura, ver `crearProgramada`. */
    static async crear(vendedor: string, transaction?: Transaction): Promise<number> {
        try {
            const row = await Rotacion.create(
                {
                    codigoParticularVendedor: vendedor,
                    estado: 'abierta',
                    fechaInicio: new Date(),
                },
                transaction ? { transaction } : undefined,
            )
            return row.id
        } catch (err) {
            throw new CustomError(500, `Error creando rotación: ${err}`)
        }
    }

    static async cerrar(rotacionId: number, transaction?: Transaction): Promise<void> {
        try {
            await Rotacion.update(
                { estado: 'cerrada', fechaFin: new Date() },
                { where: { id: rotacionId }, ...(transaction ? { transaction } : {}) },
            )
        } catch (err) {
            throw new CustomError(500, `Error cerrando rotación: ${err}`)
        }
    }
```

- [x] **Step 4: Correr toda la suite**

Run: `npm test`
Expected: `RotacionRepository.spec.ts` PASA completo. Si algún otro spec falla, es porque mockeaba una fila de rotación sin `estado` — agregale `estado: 'abierta'` al mock; no cambies la lógica de producción para acomodar un mock.

- [x] **Step 5: Commit**

```bash
git add src/repositories/RotacionRepository.ts src/repositories/RotacionRepository.spec.ts
git commit -m "fix(planificacion): la rotacion vigente se resuelve por estado, no por fechaFin"
```

---

### Task 4: `pl_rotacion_semana` — modelo y repositorio

**Files:**
- Create: `src/models/planificacion/RotacionSemana.ts`
- Create: `src/repositories/RotacionSemanaRepository.ts`
- Test: `src/repositories/RotacionSemanaRepository.spec.ts`

**Interfaces:**
- Consumes: el esquema de la Task 1.
- Produces:
  - `RotacionSemanaRepository.semanasDelSet(rotacionId): Promise<number[]>`
  - `RotacionSemanaRepository.crearMuchas(rotacionId, semanas: ISemanaDescripcion[], transaction?): Promise<void>`
  - `RotacionSemanaRepository.findDescripciones(rotacionId): Promise<Map<number, string | null>>`
  - `RotacionSemanaRepository.editarDescripcion(rotacionId, semana, descripcion): Promise<boolean>` (false = la semana no existe)
  - Tipo `ISemanaDescripcion = { semana: number; descripcion: string | null }` en `src/types/planificacion.ts`

- [x] **Step 1: Escribir los tests que fallan**

Creá `src/repositories/RotacionSemanaRepository.spec.ts`:

```ts
import { RotacionSemanaRepository } from './RotacionSemanaRepository'
import RotacionSemana from '../models/planificacion/RotacionSemana'

jest.mock('../models/planificacion/RotacionSemana')

const mockedFindAll = RotacionSemana.findAll as jest.MockedFunction<any>
const mockedBulkCreate = RotacionSemana.bulkCreate as jest.MockedFunction<any>
const mockedUpdate = RotacionSemana.update as jest.MockedFunction<any>

beforeEach(() => jest.clearAllMocks())

describe('semanasDelSet', () => {
    it('devuelve las semanas ordenadas como números', async () => {
        mockedFindAll.mockResolvedValue([
            { semana: 2, descripcion: null },
            { semana: 4, descripcion: 'Buenos Aires' },
        ])

        await expect(RotacionSemanaRepository.semanasDelSet(7)).resolves.toEqual([2, 4])
    })

    it('una rotación sin semanas devuelve vacío', async () => {
        mockedFindAll.mockResolvedValue([])
        await expect(RotacionSemanaRepository.semanasDelSet(7)).resolves.toEqual([])
    })
})

describe('findDescripciones', () => {
    it('mapea semana → descripción, con null cuando no tiene', async () => {
        mockedFindAll.mockResolvedValue([
            { semana: 1, descripcion: 'Zona Norte' },
            { semana: 2, descripcion: null },
        ])

        const mapa = await RotacionSemanaRepository.findDescripciones(7)

        expect(mapa.get(1)).toBe('Zona Norte')
        expect(mapa.get(2)).toBeNull()
        expect(mapa.size).toBe(2)
    })
})

describe('crearMuchas', () => {
    it('inserta una fila por semana con su descripción', async () => {
        mockedBulkCreate.mockResolvedValue([])

        await RotacionSemanaRepository.crearMuchas(7, [
            { semana: 1, descripcion: 'Zona Norte' },
            { semana: 2, descripcion: null },
        ])

        const [filas] = mockedBulkCreate.mock.calls[0]
        expect(filas).toEqual([
            { rotacionId: 7, semana: 1, descripcion: 'Zona Norte' },
            { rotacionId: 7, semana: 2, descripcion: null },
        ])
    })

    it('con la lista vacía no toca la base', async () => {
        await RotacionSemanaRepository.crearMuchas(7, [])
        expect(mockedBulkCreate).not.toHaveBeenCalled()
    })
})

describe('editarDescripcion', () => {
    it('devuelve true cuando actualizó la fila', async () => {
        mockedUpdate.mockResolvedValue([1])
        await expect(
            RotacionSemanaRepository.editarDescripcion(7, 2, 'Buenos Aires'),
        ).resolves.toBe(true)

        const [valores, opciones] = mockedUpdate.mock.calls[0]
        expect(valores).toEqual({ descripcion: 'Buenos Aires' })
        expect(opciones.where).toEqual({ rotacionId: 7, semana: 2 })
    })

    it('devuelve false si la semana no existe en el set', async () => {
        mockedUpdate.mockResolvedValue([0])
        await expect(
            RotacionSemanaRepository.editarDescripcion(7, 99, 'Nada'),
        ).resolves.toBe(false)
    })
})
```

- [x] **Step 2: Correr y verificar que falla**

Run: `npx jest src/repositories/RotacionSemanaRepository.spec.ts`
Expected: FAIL — `Cannot find module './RotacionSemanaRepository'`.

- [x] **Step 3: Crear el modelo**

Creá `src/models/planificacion/RotacionSemana.ts`:

```ts
import { Model, DataTypes } from 'sequelize'
import { sequelizeWritePlanificacion } from '../../database/connection'

interface IRotacionSemanaAttributes {
    rotacionId: number
    semana: number
    descripcion?: string | null
}

class RotacionSemana
    extends Model<IRotacionSemanaAttributes>
    implements IRotacionSemanaAttributes
{
    public rotacionId!: number
    public semana!: number
    public descripcion?: string | null
}

// PK compuesta (rotacion_id, semana): no hay id autoincremental. La fila ES la
// pertenencia de esa semana al set de esa rotación.
RotacionSemana.init(
    {
        rotacionId: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            field: 'rotacion_id',
        },
        semana: {
            type: DataTypes.TINYINT,
            primaryKey: true,
            allowNull: false,
            field: 'semana',
        },
        descripcion: {
            type: DataTypes.STRING(120),
            allowNull: true,
            field: 'descripcion',
        },
    },
    {
        sequelize: sequelizeWritePlanificacion,
        modelName: 'RotacionSemana',
        tableName: 'pl_rotacion_semana',
        timestamps: false,
    },
)

export default RotacionSemana
```

- [x] **Step 4: Agregar el tipo `ISemanaDescripcion`**

En `src/types/planificacion.ts`, después del bloque de `IRotacion`:

```ts
/** Una semana del set de una rotación, con su nombre de zona si lo tiene. */
export interface ISemanaDescripcion {
    semana: number
    descripcion: string | null
}
```

- [x] **Step 5: Crear el repositorio**

Creá `src/repositories/RotacionSemanaRepository.ts`:

```ts
import { Transaction } from 'sequelize'
import RotacionSemana from '../models/planificacion/RotacionSemana'
import { CustomError } from '../utils/errors'
import { ISemanaDescripcion } from '../types/planificacion'

/**
 * El SET DE SEMANAS de una rotación, explícito y con nombre.
 *
 * Reemplaza al `SELECT DISTINCT semana FROM pl_rotacion_cliente` que vivía en
 * RotacionClienteRepository. Motivos del cambio: con el set derivado, mover el último
 * cliente fuera de una semana la hacía desaparecer de la rotación, y no había dónde
 * nombrar una semana todavía sin clientes. Además es la única barrera real contra
 * reacomodar a una semana inexistente (el CHECK de la tabla solo pide semana >= 1).
 */
export class RotacionSemanaRepository {
    static async semanasDelSet(rotacionId: number): Promise<number[]> {
        try {
            const rows = await RotacionSemana.findAll({
                where: { rotacionId },
                order: [['semana', 'ASC']],
            })
            return rows.map(r => Number(r.semana))
        } catch (err) {
            throw new CustomError(500, `Error fetching set de semanas: ${err}`)
        }
    }

    static async findDescripciones(
        rotacionId: number,
    ): Promise<Map<number, string | null>> {
        try {
            const rows = await RotacionSemana.findAll({
                where: { rotacionId },
                order: [['semana', 'ASC']],
            })
            return new Map(rows.map(r => [Number(r.semana), r.descripcion ?? null]))
        } catch (err) {
            throw new CustomError(500, `Error fetching descripciones de semana: ${err}`)
        }
    }

    static async crearMuchas(
        rotacionId: number,
        semanas: ISemanaDescripcion[],
        transaction?: Transaction,
    ): Promise<void> {
        if (semanas.length === 0) return
        try {
            await RotacionSemana.bulkCreate(
                semanas.map(s => ({
                    rotacionId,
                    semana: s.semana,
                    descripcion: s.descripcion,
                })),
                transaction ? { transaction } : undefined,
            )
        } catch (err) {
            throw new CustomError(500, `Error creando set de semanas: ${err}`)
        }
    }

    /** false = esa semana no existe en el set de esa rotación (no se inventa la fila:
     *  el set se define al materializar, no editando un nombre). */
    static async editarDescripcion(
        rotacionId: number,
        semana: number,
        descripcion: string | null,
    ): Promise<boolean> {
        try {
            const [afectadas] = await RotacionSemana.update(
                { descripcion },
                { where: { rotacionId, semana } },
            )
            return afectadas > 0
        } catch (err) {
            throw new CustomError(500, `Error editando descripción de semana: ${err}`)
        }
    }
}
```

- [x] **Step 6: Correr y verificar que pasa**

Run: `npx jest src/repositories/RotacionSemanaRepository.spec.ts`
Expected: PASS (8 tests).

- [x] **Step 7: Commit**

```bash
git add src/models/planificacion/RotacionSemana.ts src/repositories/RotacionSemanaRepository.ts src/repositories/RotacionSemanaRepository.spec.ts src/types/planificacion.ts
git commit -m "feat(planificacion): pl_rotacion_semana como set autoritativo de semanas"
```

---

### Task 5: Rewire — el set de semanas sale del repo nuevo

**Files:**
- Modify: `src/repositories/RotacionClienteRepository.ts:99-118` (borrar `semanasDelSet`)
- Modify: `src/services/planificacion/RotacionService.ts:111-115`
- Modify: `src/services/planificacion/AgendaService.ts:97-118`
- Modify: `src/services/planificacion/VisitasService.ts:191-200`

**Interfaces:**
- Consumes: `RotacionSemanaRepository.semanasDelSet` (Task 4).
- Produces: ningún cambio de firma pública. `RotacionClienteRepository.semanasDelSet` deja de existir — cualquier import que quede rompe la compilación, que es justo lo que se quiere.

- [x] **Step 1: Borrar `semanasDelSet` de `RotacionClienteRepository`**

Eliminá el bloque completo de las líneas 99-118 (el comentario de doc y el método). Si `SemanaRow` queda sin usar en ese archivo, borralo también.

- [x] **Step 2: Compilar para encontrar todos los call sites**

Run: `npx tsc --noEmit`
Expected: errores en `RotacionService.ts`, `AgendaService.ts` y `VisitasService.ts` — exactamente los tres consumidores. Anotalos; son los que se arreglan en los pasos siguientes.

- [x] **Step 3: Rewire `RotacionService.semanasPendientes`**

En `src/services/planificacion/RotacionService.ts`, agregá el import:

```ts
import { RotacionSemanaRepository } from '../../repositories/RotacionSemanaRepository'
```

y reemplazá el cuerpo de `semanasPendientes` (líneas 111-115) por:

```ts
    /** Las semanas del set que todavía no tienen ciclo en esta rotación. */
    static async semanasPendientes(rotacionId: number): Promise<number[]> {
        const set = await RotacionSemanaRepository.semanasDelSet(rotacionId)
        const hechas = new Set(await RotacionRepository.semanasHechas(rotacionId))
        return set.filter(s => !hechas.has(s))
    }
```

- [x] **Step 4: Rewire `AgendaService`**

En `src/services/planificacion/AgendaService.ts`, agregá el mismo import y reemplazá, dentro de `previewSemana`, la línea que pide el set:

```ts
        const set = await RotacionSemanaRepository.semanasDelSet(rotacionId)
```

y en `getContextoRotacion`:

```ts
        const semanas = await RotacionSemanaRepository.semanasDelSet(rotacionId)
```

- [x] **Step 5: Rewire `VisitasService.reacomodar`**

En `src/services/planificacion/VisitasService.ts`, agregá el import y reemplazá el bloque de validación (líneas 191-200) por:

```ts
        if (dto.semana !== undefined) {
            const set = await RotacionSemanaRepository.semanasDelSet(rotacion.id)
            if (!set.includes(dto.semana)) {
                throw new CustomError(
                    422,
                    `La semana ${dto.semana} no existe en esta rotación.`,
                    { code: 'SEMANA_FUERA_DEL_SET', semanas: set },
                )
            }
        }
```

- [x] **Step 6: Compilar y correr toda la suite**

Run: `npx tsc --noEmit && npm test`
Expected: compila limpio. Los specs que mockeaban `RotacionClienteRepository.semanasDelSet` ahora tienen que mockear `RotacionSemanaRepository.semanasDelSet` — actualizá el mock (mismo valor de retorno, otro módulo). No cambies la lógica de producción para acomodarlos.

- [x] **Step 7: Commit**

```bash
git add src/repositories/RotacionClienteRepository.ts src/services/planificacion/
git commit -m "refactor(planificacion): el set de semanas sale de pl_rotacion_semana"
```

---

### Task 6: Materializar puebla el set y hereda las descripciones

**Files:**
- Modify: `src/services/planificacion/RotacionService.ts:82-97`
- Test: `src/services/planificacion/RotacionService.spec.ts` (crear si no existe)

**Interfaces:**
- Consumes: `RotacionSemanaRepository.crearMuchas`/`findDescripciones` (Task 4).
- Produces: `RotacionService.materializar` deja el set de semanas creado, con las descripciones heredadas de la última rotación del vendedor que tuviera esa misma semana. Nuevo método `RotacionRepository.findUltimaConSemanas(vendedor): Promise<number | null>`.

- [x] **Step 1: Escribir el test que falla**

Creá (o extendé) `src/services/planificacion/RotacionService.spec.ts`:

```ts
import { RotacionService } from './RotacionService'
import { RotacionRepository } from '../../repositories/RotacionRepository'
import { RotacionClienteRepository } from '../../repositories/RotacionClienteRepository'
import { RotacionSemanaRepository } from '../../repositories/RotacionSemanaRepository'

jest.mock('../../repositories/RotacionRepository')
jest.mock('../../repositories/RotacionClienteRepository')
jest.mock('../../repositories/RotacionSemanaRepository')

const mockedLeerTemplate = jest.spyOn(RotacionService, 'leerTemplate')

beforeEach(() => jest.clearAllMocks())
afterAll(() => mockedLeerTemplate.mockRestore())

describe('materializar', () => {
    it('crea el set de semanas del plan, heredando las descripciones anteriores', async () => {
        mockedLeerTemplate.mockResolvedValue({
            validas: [
                { codigoParticularCliente: 'C001', semana: 1, dia: 1 },
                { codigoParticularCliente: 'C002', semana: 1, dia: 2 },
                { codigoParticularCliente: 'C003', semana: 3, dia: 4 },
            ],
            omitidos: [],
        })
        ;(RotacionRepository.crear as jest.Mock).mockResolvedValue(42)
        ;(RotacionRepository.findUltimaConSemanas as jest.Mock).mockResolvedValue(7)
        ;(RotacionSemanaRepository.findDescripciones as jest.Mock).mockResolvedValue(
            new Map([
                [1, 'Zona Norte'],
                [2, 'Buenos Aires'],
            ]),
        )

        await RotacionService.materializar('V 2')

        // Semanas: las del plan (1 y 3), deduplicadas y ordenadas. La 2 NO entra aunque
        // tenga descripción heredada: el set lo define el plan, no el historial.
        expect(RotacionSemanaRepository.crearMuchas).toHaveBeenCalledWith(
            42,
            [
                { semana: 1, descripcion: 'Zona Norte' },
                { semana: 3, descripcion: null },
            ],
            undefined,
        )
    })

    it('sin rotación anterior el set nace sin descripciones', async () => {
        mockedLeerTemplate.mockResolvedValue({
            validas: [{ codigoParticularCliente: 'C001', semana: 2, dia: 1 }],
            omitidos: [],
        })
        ;(RotacionRepository.crear as jest.Mock).mockResolvedValue(43)
        ;(RotacionRepository.findUltimaConSemanas as jest.Mock).mockResolvedValue(null)

        await RotacionService.materializar('V 9')

        expect(RotacionSemanaRepository.findDescripciones).not.toHaveBeenCalled()
        expect(RotacionSemanaRepository.crearMuchas).toHaveBeenCalledWith(
            43,
            [{ semana: 2, descripcion: null }],
            undefined,
        )
    })
})
```

- [x] **Step 2: Correr y verificar que falla**

Run: `npx jest src/services/planificacion/RotacionService.spec.ts`
Expected: FAIL — `RotacionSemanaRepository.crearMuchas` no fue llamado.

- [x] **Step 3: Agregar `findUltimaConSemanas` al repositorio**

En `src/repositories/RotacionRepository.ts`, agregá dentro de la clase:

```ts
    /** La rotación más reciente del vendedor que no sea la que se está creando, para
     *  heredarle los nombres de zona de sus semanas. Incluye cerradas: el nombre de la
     *  zona sobrevive a la vuelta. Excluye canceladas: nunca se vivieron. */
    static async findUltimaConSemanas(vendedor: string): Promise<number | null> {
        try {
            const row = await Rotacion.findOne({
                where: {
                    codigoParticularVendedor: vendedor,
                    estado: ['abierta', 'cerrada'],
                },
                order: [['id', 'DESC']],
            })
            return row ? row.id : null
        } catch (err) {
            throw new CustomError(500, `Error fetching última rotación: ${err}`)
        }
    }
```

- [x] **Step 4: Poblar el set en `materializar`**

En `src/services/planificacion/RotacionService.ts`, agregá el import de `RotacionSemanaRepository` (si la Task 5 no lo dejó ya) y reemplazá el cuerpo de `materializar` (líneas 82-97) por:

```ts
    static async materializar(vendedor: string, transaction?: Transaction): Promise<number> {
        const { validas } = await RotacionService.leerTemplate(vendedor)

        if (validas.length === 0) {
            throw new CustomError(
                422,
                'No hay clientes asignados a este vendedor en la hoja de ruta.',
                { code: 'ROTACION_SIN_CLIENTES' },
            )
        }

        // Los nombres de zona se heredan de la rotación anterior del vendedor: las
        // semanas mapean a zonas y la zona es estable, así que sin herencia gerencia
        // tendría que reescribir "Buenos Aires" en cada vuelta.
        //
        // Se resuelve ANTES de crear la rotación nueva, a propósito:
        // `findUltimaConSemanas` ordena por id DESC, así que si corriera después, la
        // rotación recién creada sería "la más reciente" y heredaría de sí misma — un
        // set vacío, en silencio.
        const previa = await RotacionRepository.findUltimaConSemanas(vendedor)
        const heredadas = previa
            ? await RotacionSemanaRepository.findDescripciones(previa)
            : new Map<number, string | null>()

        const rotacionId = await RotacionRepository.crear(vendedor, transaction)
        await RotacionClienteRepository.crearMuchos(rotacionId, validas, transaction)

        // El SET DE SEMANAS se declara explícitamente en vez de quedar derivado del plan.
        // Sale de las semanas que el template trajo, deduplicadas y ordenadas. Una semana
        // que no existía en la rotación anterior nace sin nombre.
        const semanas = [...new Set(validas.map(v => v.semana))].sort((a, b) => a - b)
        await RotacionSemanaRepository.crearMuchas(
            rotacionId,
            semanas.map(semana => ({
                semana,
                descripcion: heredadas.get(semana) ?? null,
            })),
            transaction,
        )

        return rotacionId
    }
```

- [x] **Step 5: Correr y verificar que pasa**

Run: `npx jest src/services/planificacion/RotacionService.spec.ts`
Expected: PASS (2 tests).

- [x] **Step 6: Commit**

```bash
git add src/repositories/RotacionRepository.ts src/services/planificacion/RotacionService.ts src/services/planificacion/RotacionService.spec.ts
git commit -m "feat(planificacion): materializar declara el set de semanas y hereda los nombres de zona"
```

---

### Task 7: Primitivas de la cola de rotaciones programadas

**Files:**
- Modify: `src/repositories/RotacionRepository.ts`
- Test: `src/repositories/RotacionRepository.spec.ts`

**Interfaces:**
- Consumes: `IRotacion`/`EstadoRotacion` (Task 2).
- Produces:
  - `crearProgramada(vendedor, transaction?): Promise<number>` — al final de la cola.
  - `findById(rotacionId): Promise<IRotacion | null>`
  - `listarCola(vendedor): Promise<IRotacion[]>` — la abierta primero, después las programadas por `orden`.
  - `findProximaProgramada(vendedor, transaction?): Promise<IRotacion | null>` — menor `orden`.
  - `activar(rotacionId, transaction?): Promise<void>` — `estado='abierta'`, `fechaInicio=now`, `orden=null`.
  - `cancelar(rotacionId): Promise<void>` — `estado='cancelada'`, `orden=null`.
  - `renumerarCola(idsEnOrden: number[]): Promise<void>` — `orden = índice + 1`, en transacción.

- [x] **Step 1: Escribir los tests que fallan**

Agregá a `src/repositories/RotacionRepository.spec.ts`:

```ts
describe('crearProgramada', () => {
    it('encola al final: MAX(orden) + 1', async () => {
        mockedMax.mockResolvedValue(2)
        mockedCreate.mockResolvedValue({ id: 30 } as any)

        await expect(RotacionRepository.crearProgramada('V 2')).resolves.toBe(30)

        const [valores] = mockedCreate.mock.calls[0]
        expect(valores).toEqual({
            codigoParticularVendedor: 'V 2',
            estado: 'programada',
            fechaInicio: null,
            orden: 3,
        })
    })

    it('la primera de la cola arranca en 1', async () => {
        mockedMax.mockResolvedValue(null)
        mockedCreate.mockResolvedValue({ id: 31 } as any)

        await RotacionRepository.crearProgramada('V 2')

        expect(mockedCreate.mock.calls[0][0].orden).toBe(1)
    })
})

describe('listarCola', () => {
    it('trae la abierta y las programadas, excluyendo cerradas y canceladas', async () => {
        mockedFindAll.mockResolvedValue([
            {
                id: 7,
                codigoParticularVendedor: 'V 2',
                estado: 'abierta',
                fechaInicio: new Date('2026-08-03T12:00:00.000Z'),
                fechaFin: null,
                descripcion: 'Ronda Agosto',
                orden: null,
            },
            {
                id: 30,
                codigoParticularVendedor: 'V 2',
                estado: 'programada',
                fechaInicio: null,
                fechaFin: null,
                descripcion: null,
                orden: 1,
            },
        ])

        const cola = await RotacionRepository.listarCola('V 2')

        const [opciones] = mockedFindAll.mock.calls[0]
        // Las cerradas son historial y las canceladas nunca existieron: ninguna es
        // operable, así que no entran en la cola que ve gerencia.
        expect(opciones.where).toEqual({
            codigoParticularVendedor: 'V 2',
            estado: ['abierta', 'programada'],
        })
        expect(cola.map(r => r.id)).toEqual([7, 30])
        expect(cola[1].fechaInicio).toBeNull()
    })
})

describe('findProximaProgramada', () => {
    it('busca la de menor orden entre las programadas', async () => {
        mockedFindOne.mockResolvedValue({
            id: 30,
            codigoParticularVendedor: 'V 2',
            estado: 'programada',
            fechaInicio: null,
            fechaFin: null,
            descripcion: null,
            orden: 1,
        } as any)

        const rot = await RotacionRepository.findProximaProgramada('V 2')

        expect(mockedFindOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { codigoParticularVendedor: 'V 2', estado: 'programada' },
                order: [['orden', 'ASC']],
            }),
        )
        expect(rot?.id).toBe(30)
    })

    it('devuelve null con la cola vacía', async () => {
        mockedFindOne.mockResolvedValue(null)
        await expect(RotacionRepository.findProximaProgramada('V 2')).resolves.toBeNull()
    })
})

describe('activar', () => {
    it('pasa a abierta, sella fechaInicio y libera el orden', async () => {
        mockedUpdate.mockResolvedValue([1])
        await RotacionRepository.activar(30)

        const [valores, opciones] = mockedUpdate.mock.calls[0]
        expect(valores.estado).toBe('abierta')
        expect(valores.fechaInicio).toBeInstanceOf(Date)
        // orden a null: una rotación vigente no ocupa lugar en la cola.
        expect(valores.orden).toBeNull()
        expect(opciones.where).toEqual({ id: 30 })
    })
})

describe('cancelar', () => {
    it('marca cancelada y libera el orden para no bloquear el slot', async () => {
        mockedUpdate.mockResolvedValue([1])
        await RotacionRepository.cancelar(30)

        const [valores] = mockedUpdate.mock.calls[0]
        expect(valores).toEqual({ estado: 'cancelada', orden: null })
    })
})

describe('renumerarCola', () => {
    it('asigna orden 1..N según la posición en la lista', async () => {
        mockedUpdate.mockResolvedValue([1])

        await RotacionRepository.renumerarCola([33, 31, 32])

        expect(mockedUpdate).toHaveBeenCalledTimes(3)
        const ordenes = mockedUpdate.mock.calls.map(([valores, opciones]) => [
            opciones.where.id,
            valores.orden,
        ])
        expect(ordenes).toEqual([
            [33, 1],
            [31, 2],
            [32, 3],
        ])
    })
})
```

Y arriba, junto a los otros mocks, agregá:

```ts
const mockedMax = Rotacion.max as jest.MockedFunction<any>
const mockedFindAll = Rotacion.findAll as jest.MockedFunction<any>
```

Además, para que `renumerarCola` pueda correr su transacción en el test, extendé el mock de la conexión que ya está al tope del archivo para incluir `transaction`:

```ts
jest.mock('../database/connection', () => {
    const actual = jest.requireActual('../database/connection')
    return {
        ...actual,
        sequelizeWritePlanificacion: Object.assign(actual.sequelizeWritePlanificacion, {
            query: jest.fn(),
            // Ejecuta el callback derecho, con un objeto de transacción de juguete.
            transaction: jest.fn(async (cb: any) => cb({})),
        }),
    }
})
```

- [x] **Step 2: Correr y verificar que falla**

Run: `npx jest src/repositories/RotacionRepository.spec.ts`
Expected: FAIL — `RotacionRepository.crearProgramada is not a function`.

- [x] **Step 3: Implementar las primitivas**

En `src/repositories/RotacionRepository.ts`, agregá dentro de la clase:

```ts
    /**
     * Encola una rotación PROGRAMADA al final de la cola del vendedor.
     *
     * `fechaInicio` va null a propósito: recién se sabe cuándo arranca cuando la anterior
     * cierra de verdad. `orden` es MAX + 1 sobre las programadas de ese vendedor.
     */
    static async crearProgramada(
        vendedor: string,
        transaction?: Transaction,
    ): Promise<number> {
        try {
            const max = (await Rotacion.max('orden', {
                where: { codigoParticularVendedor: vendedor, estado: 'programada' },
                ...(transaction ? { transaction } : {}),
            })) as number | null

            const row = await Rotacion.create(
                {
                    codigoParticularVendedor: vendedor,
                    estado: 'programada',
                    fechaInicio: null,
                    orden: (max ?? 0) + 1,
                },
                transaction ? { transaction } : undefined,
            )
            return row.id
        } catch (err) {
            throw new CustomError(500, `Error encolando rotación: ${err}`)
        }
    }

    static async findById(rotacionId: number): Promise<IRotacion | null> {
        try {
            const row = await Rotacion.findByPk(rotacionId)
            return row ? toIRotacion(row) : null
        } catch (err) {
            throw new CustomError(500, `Error fetching rotación: ${err}`)
        }
    }

    /** La cola operable del vendedor: la vigente y las programadas en orden. Excluye
     *  cerradas (historial) y canceladas (soft-deleted). */
    static async listarCola(vendedor: string): Promise<IRotacion[]> {
        try {
            const rows = await Rotacion.findAll({
                where: {
                    codigoParticularVendedor: vendedor,
                    estado: ['abierta', 'programada'],
                },
                // La abierta primero: 'abierta' < 'programada' alfabéticamente, y dentro
                // de las programadas manda `orden`.
                order: [
                    ['estado', 'ASC'],
                    ['orden', 'ASC'],
                ],
            })
            return rows.map(toIRotacion)
        } catch (err) {
            throw new CustomError(500, `Error fetching cola de rotaciones: ${err}`)
        }
    }

    static async findProximaProgramada(
        vendedor: string,
        transaction?: Transaction,
    ): Promise<IRotacion | null> {
        try {
            const row = await Rotacion.findOne({
                where: { codigoParticularVendedor: vendedor, estado: 'programada' },
                order: [['orden', 'ASC']],
                ...(transaction ? { transaction } : {}),
            })
            return row ? toIRotacion(row) : null
        } catch (err) {
            throw new CustomError(500, `Error fetching próxima programada: ${err}`)
        }
    }

    /** Una programada pasa a vigente: se sella su inicio y deja la cola. */
    static async activar(rotacionId: number, transaction?: Transaction): Promise<void> {
        try {
            await Rotacion.update(
                { estado: 'abierta', fechaInicio: new Date(), orden: null },
                { where: { id: rotacionId }, ...(transaction ? { transaction } : {}) },
            )
        } catch (err) {
            throw new CustomError(500, `Error activando rotación: ${err}`)
        }
    }

    /** Soft-delete de una programada. `orden` a null para que su lugar en la cola quede
     *  libre — si lo conservara, ese slot quedaría reservado por una rotación muerta. */
    static async cancelar(rotacionId: number): Promise<void> {
        try {
            await Rotacion.update(
                { estado: 'cancelada', orden: null },
                { where: { id: rotacionId } },
            )
        } catch (err) {
            throw new CustomError(500, `Error cancelando rotación: ${err}`)
        }
    }

    /**
     * Reescribe el orden de toda la cola: la posición de cada id es su índice + 1.
     *
     * Se renumera COMPLETO en vez de intercambiar dos filas porque no hay UNIQUE sobre
     * (vendedor, orden) — y no lo hay justamente porque un swap violaría la constraint a
     * mitad de transacción y MySQL no tiene constraints deferidas. La unicidad la
     * garantiza este método, que es el único que escribe `orden` de una programada.
     */
    static async renumerarCola(idsEnOrden: number[]): Promise<void> {
        try {
            await sequelizeWritePlanificacion.transaction(async transaction => {
                for (let i = 0; i < idsEnOrden.length; i++) {
                    await Rotacion.update(
                        { orden: i + 1 },
                        { where: { id: idsEnOrden[i] }, transaction },
                    )
                }
            })
        } catch (err) {
            throw new CustomError(500, `Error reordenando la cola: ${err}`)
        }
    }
```

- [x] **Step 4: Correr y verificar que pasa**

Run: `npx jest src/repositories/RotacionRepository.spec.ts`
Expected: PASS, incluidos los tests de las Tasks 2 y 3.

- [x] **Step 5: Commit**

```bash
git add src/repositories/RotacionRepository.ts src/repositories/RotacionRepository.spec.ts
git commit -m "feat(planificacion): primitivas de la cola de rotaciones programadas"
```

---

### Task 8: `asegurarRotacion` activa la cola antes de materializar

**Files:**
- Modify: `src/services/planificacion/RotacionService.ts:99-108`
- Test: `src/services/planificacion/RotacionService.spec.ts`

**Interfaces:**
- Consumes: `RotacionRepository.findProximaProgramada`/`activar` (Task 7).
- Produces: `asegurarRotacion` sin cambio de firma — sigue devolviendo `{ rotacionId, materializada }`. `materializada: false` cuando activó una programada: no se leyó ningún template.

- [x] **Step 1: Escribir los tests que fallan**

Agregá a `src/services/planificacion/RotacionService.spec.ts`:

```ts
describe('asegurarRotacion', () => {
    it('con una rotación abierta no toca la cola', async () => {
        ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue({
            id: 7,
        })

        await expect(RotacionService.asegurarRotacion('V 2')).resolves.toEqual({
            rotacionId: 7,
            materializada: false,
        })
        expect(RotacionRepository.findProximaProgramada).not.toHaveBeenCalled()
    })

    it('sin abierta, activa la programada de menor orden en vez de materializar', async () => {
        ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue(null)
        ;(RotacionRepository.findProximaProgramada as jest.Mock).mockResolvedValue({
            id: 30,
            orden: 1,
        })

        const res = await RotacionService.asegurarRotacion('V 2')

        expect(RotacionRepository.activar).toHaveBeenCalledWith(30, undefined)
        // materializada: false — gerencia ya la había planificado, no se leyó el template.
        expect(res).toEqual({ rotacionId: 30, materializada: false })
        expect(mockedLeerTemplate).not.toHaveBeenCalled()
    })

    it('sin abierta y sin cola, materializa como siempre', async () => {
        ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue(null)
        ;(RotacionRepository.findProximaProgramada as jest.Mock).mockResolvedValue(null)
        mockedLeerTemplate.mockResolvedValue({
            validas: [{ codigoParticularCliente: 'C001', semana: 1, dia: 1 }],
            omitidos: [],
        })
        ;(RotacionRepository.crear as jest.Mock).mockResolvedValue(50)
        ;(RotacionRepository.findUltimaConSemanas as jest.Mock).mockResolvedValue(null)

        await expect(RotacionService.asegurarRotacion('V 2')).resolves.toEqual({
            rotacionId: 50,
            materializada: true,
        })
    })
})
```

- [x] **Step 2: Correr y verificar que falla**

Run: `npx jest src/services/planificacion/RotacionService.spec.ts -t "activa la programada"`
Expected: FAIL — `RotacionRepository.activar` no fue llamado (hoy materializa de una).

- [x] **Step 3: Implementar la activación en cadena**

En `src/services/planificacion/RotacionService.ts`, reemplazá `asegurarRotacion` (líneas 99-108) por:

```ts
    /**
     * Deja al vendedor con una rotación vigente, sin abrir ningún ciclo.
     *
     * Orden de preferencia:
     *   1. La que ya está abierta.
     *   2. La próxima PROGRAMADA de la cola (gerencia la planificó por adelantado): se
     *      activa tal como quedó, sin releer el template. El template ya se leyó cuando
     *      gerencia la creó, y desde entonces pudo haberla editado a mano — releerlo acá
     *      pisaría esa planificación.
     *   3. Nada en la cola: se materializa una nueva leyendo el template ahora.
     */
    static async asegurarRotacion(
        vendedor: string,
        transaction?: Transaction,
    ): Promise<{ rotacionId: number; materializada: boolean }> {
        const abierta = await RotacionRepository.findAbiertaByVendedor(vendedor)
        if (abierta) return { rotacionId: abierta.id, materializada: false }

        const programada = await RotacionRepository.findProximaProgramada(
            vendedor,
            transaction,
        )
        if (programada) {
            await RotacionRepository.activar(programada.id, transaction)
            // materializada: false — no se leyó ningún template ni se crearon filas.
            return { rotacionId: programada.id, materializada: false }
        }

        const rotacionId = await RotacionService.materializar(vendedor, transaction)
        return { rotacionId, materializada: true }
    }
```

- [x] **Step 4: Correr y verificar que pasa**

Run: `npx jest src/services/planificacion/RotacionService.spec.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: verde. Los specs de `CicloService`/`VisitasService` que mockean `RotacionRepository` pueden necesitar `findProximaProgramada` devolviendo `null` — agregalo al mock.

- [x] **Step 6: Commit**

```bash
git add src/services/planificacion/RotacionService.ts src/services/planificacion/RotacionService.spec.ts
git commit -m "feat(planificacion): asegurarRotacion activa la cola de programadas antes de materializar"
```

---

### Task 9: Último movimiento por fila (autoría en el grid)

**Files:**
- Modify: `src/repositories/RotacionClienteRepository.ts`
- Modify: `src/types/planificacion.ts`
- Test: `src/repositories/RotacionClienteRepository.spec.ts` (crear si no existe)

**Interfaces:**
- Consumes: nada nuevo.
- Produces:
  - Tipo `IReacomodacionInfo = { origen: 'vendedor' | 'gerencia'; usuario: string; fecha: string }`
  - `RotacionClienteRepository.findUltimosMovimientos(rotacionId): Promise<Map<number, IReacomodacionInfo>>` — clave = `rotacionClienteId`.

- [x] **Step 1: Escribir el test que falla**

Creá `src/repositories/RotacionClienteRepository.spec.ts` (o agregá el describe si ya existe):

```ts
import { RotacionClienteRepository } from './RotacionClienteRepository'
import { sequelizeWritePlanificacion } from '../database/connection'

jest.mock('../models/planificacion/RotacionCliente')
jest.mock('../models/planificacion/Reacomodacion')
jest.mock('../database/connection', () => {
    const actual = jest.requireActual('../database/connection')
    return {
        ...actual,
        sequelizeWritePlanificacion: Object.assign(actual.sequelizeWritePlanificacion, {
            query: jest.fn(),
            transaction: jest.fn(async (cb: any) => cb({})),
        }),
    }
})

const mockedQuery = sequelizeWritePlanificacion.query as jest.MockedFunction<any>

beforeEach(() => jest.clearAllMocks())

describe('findUltimosMovimientos', () => {
    it('indexa por rotacionClienteId y normaliza la fecha a ISO', async () => {
        mockedQuery.mockResolvedValue([
            {
                rotacion_cliente_id: 11,
                origen: 'gerencia',
                usuario: 'jefe@distrisuper.com',
                fecha: new Date('2026-08-11T14:05:00.000Z'),
            },
            {
                rotacion_cliente_id: 12,
                origen: 'vendedor',
                usuario: 'v2@distrisuper.com',
                fecha: new Date('2026-08-10T09:00:00.000Z'),
            },
        ])

        const mapa = await RotacionClienteRepository.findUltimosMovimientos(7)

        expect(mapa.get(11)).toEqual({
            origen: 'gerencia',
            usuario: 'jefe@distrisuper.com',
            fecha: '2026-08-11T14:05:00.000Z',
        })
        expect(mapa.get(12)?.origen).toBe('vendedor')
        expect(mapa.size).toBe(2)
    })

    it('una rotación sin movimientos devuelve un mapa vacío', async () => {
        mockedQuery.mockResolvedValue([])
        const mapa = await RotacionClienteRepository.findUltimosMovimientos(7)
        expect(mapa.size).toBe(0)
    })
})
```

- [x] **Step 2: Correr y verificar que falla**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts -t "findUltimosMovimientos"`
Expected: FAIL — `findUltimosMovimientos is not a function`.

- [x] **Step 3: Agregar el tipo**

En `src/types/planificacion.ts`, después de `ISemanaDescripcion`:

```ts
/** Quién movió una fila del plan por última vez. Sale de pl_reacomodacion, que ya
 *  persistía `origen` y `usuario` desde la primera entrega del plan editable. */
export interface IReacomodacionInfo {
    origen: 'vendedor' | 'gerencia'
    usuario: string
    fecha: string
}
```

- [x] **Step 4: Implementar la query**

En `src/repositories/RotacionClienteRepository.ts`, agregá el import del tipo y este método dentro de la clase:

```ts
    /**
     * El último movimiento de cada fila de la rotación, indexado por rotacionClienteId.
     *
     * UNA query con ROW_NUMBER() y no N: el grid de gerencia trae la rotación completa
     * (5 semanas × ~40 clientes), y una consulta por card serían cientos. Mismo patrón
     * de "elegir la fila ganadora explícitamente" que usa la migración del dominio.
     */
    static async findUltimosMovimientos(
        rotacionId: number,
    ): Promise<Map<number, IReacomodacionInfo>> {
        try {
            const rows = await sequelizeWritePlanificacion.query<MovimientoRow>(
                `SELECT rotacion_cliente_id, origen, usuario, fecha
                   FROM (
                     SELECT re.rotacion_cliente_id,
                            re.origen,
                            re.usuario,
                            re.fecha,
                            ROW_NUMBER() OVER (
                                PARTITION BY re.rotacion_cliente_id
                                ORDER BY re.fecha DESC, re.id DESC
                            ) AS rn
                       FROM pl_reacomodacion re
                       JOIN pl_rotacion_cliente rc ON rc.id = re.rotacion_cliente_id
                      WHERE rc.rotacion_id = :rotacionId
                   ) ranked
                  WHERE rn = 1`,
                { replacements: { rotacionId }, type: QueryTypes.SELECT },
            )

            return new Map(
                rows.map(r => [
                    Number(r.rotacion_cliente_id),
                    {
                        origen: r.origen as IReacomodacionInfo['origen'],
                        usuario: r.usuario,
                        // El driver devuelve Date; se normaliza a ISO como en el resto
                        // del dominio (la hora visible la formatea el front en TZ de
                        // negocio, nunca con el ISO crudo).
                        fecha: new Date(r.fecha).toISOString(),
                    },
                ]),
            )
        } catch (err) {
            throw new CustomError(500, `Error fetching últimos movimientos: ${err}`)
        }
    }
```

Y agregá la interfaz de fila arriba, junto a las otras (`SemanaRow`, `IdRow`, `CodigoRow`):

```ts
interface MovimientoRow {
    rotacion_cliente_id: number | string
    origen: string
    usuario: string
    fecha: Date | string
}
```

- [x] **Step 5: Correr y verificar que pasa**

Run: `npx jest src/repositories/RotacionClienteRepository.spec.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/repositories/RotacionClienteRepository.ts src/repositories/RotacionClienteRepository.spec.ts src/types/planificacion.ts
git commit -m "feat(planificacion): ultimo movimiento por fila del plan, en una sola query"
```

---

### Task 10: `GerenciaRotacionService` — lectura del grid completo

**Files:**
- Create: `src/services/planificacion/GerenciaRotacionService.ts`
- Create: `src/services/planificacion/GerenciaRotacionService.spec.ts`
- Modify: `src/services/planificacion/AgendaService.ts:137` (`enriquecer` deja de ser privada) y el bloque de constantes de días.

**Interfaces:**
- Consumes: `RotacionRepository.findById`/`listarCola`, `RotacionSemanaRepository.semanasDelSet`/`findDescripciones`, `RotacionClienteRepository.findByRotacion`/`findUltimosMovimientos`, `AgendaService.enriquecer`.
- Produces:
  - Tipos `ISemanaRotacionAdmin`, `IRotacionAdmin` en `src/types/planificacion.ts`
  - `GerenciaRotacionService.listarRotaciones(vendedor): Promise<IRotacion[]>`
  - `GerenciaRotacionService.getRotacion(vendedor, rotacionId): Promise<IRotacionAdmin>`

- [x] **Step 1: Escribir el test que falla**

Creá `src/services/planificacion/GerenciaRotacionService.spec.ts`:

```ts
import { GerenciaRotacionService } from './GerenciaRotacionService'
import { RotacionRepository } from '../../repositories/RotacionRepository'
import { RotacionClienteRepository } from '../../repositories/RotacionClienteRepository'
import { RotacionSemanaRepository } from '../../repositories/RotacionSemanaRepository'
import { AgendaService } from './AgendaService'
import { CustomError } from '../../utils/errors'

jest.mock('../../repositories/RotacionRepository')
jest.mock('../../repositories/RotacionClienteRepository')
jest.mock('../../repositories/RotacionSemanaRepository')
jest.mock('./AgendaService')

beforeEach(() => jest.clearAllMocks())

describe('getRotacion', () => {
    it('arma el grid con semanas vacías incluidas y la autoría de cada card', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue({
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta',
            fechaInicio: '2026-08-03T12:00:00.000Z',
            fechaFin: null,
            descripcion: 'Ronda Agosto',
            orden: null,
        })
        // La semana 3 existe en el set pero no tiene clientes: tiene que aparecer igual,
        // con su nombre. Con el set derivado del plan, desaparecía.
        ;(RotacionSemanaRepository.semanasDelSet as jest.Mock).mockResolvedValue([1, 3])
        ;(RotacionSemanaRepository.findDescripciones as jest.Mock).mockResolvedValue(
            new Map([
                [1, 'Zona Norte'],
                [3, null],
            ]),
        )
        ;(RotacionClienteRepository.findByRotacion as jest.Mock).mockResolvedValue([
            { id: 11, rotacionId: 7, codigoParticularCliente: 'C001', semana: 1, dia: 1 },
        ])
        ;(AgendaService.enriquecer as jest.Mock).mockResolvedValue([
            {
                rotacionClienteId: 11,
                codigoParticularCliente: 'C001',
                nombreCliente: 'Kiosco Uno',
                semana: 1,
                dia: 1,
                estado: 'pendiente',
                visitaId: null,
                rubrosPendientes: 0,
            },
        ])
        ;(RotacionClienteRepository.findUltimosMovimientos as jest.Mock).mockResolvedValue(
            new Map([
                [
                    11,
                    {
                        origen: 'gerencia',
                        usuario: 'jefe@distrisuper.com',
                        fecha: '2026-08-11T14:05:00.000Z',
                    },
                ],
            ]),
        )

        const grid = await GerenciaRotacionService.getRotacion('V 2', 7)

        expect(grid.descripcion).toBe('Ronda Agosto')
        expect(grid.semanas.map(s => s.semana)).toEqual([1, 3])
        expect(grid.semanas[0].descripcion).toBe('Zona Norte')
        expect(grid.semanas[0].dias.LUN[0].ultimoMovimiento?.origen).toBe('gerencia')
        // La semana sin clientes viaja con los cinco días vacíos, no ausente.
        expect(grid.semanas[1].dias).toEqual({
            LUN: [],
            MAR: [],
            MIE: [],
            JUE: [],
            VIE: [],
        })
    })

    it('una card sin movimientos trae ultimoMovimiento null', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue({
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta',
            fechaInicio: null,
            fechaFin: null,
            descripcion: null,
            orden: null,
        })
        ;(RotacionSemanaRepository.semanasDelSet as jest.Mock).mockResolvedValue([1])
        ;(RotacionSemanaRepository.findDescripciones as jest.Mock).mockResolvedValue(
            new Map([[1, null]]),
        )
        ;(RotacionClienteRepository.findByRotacion as jest.Mock).mockResolvedValue([
            { id: 11, rotacionId: 7, codigoParticularCliente: 'C001', semana: 1, dia: 2 },
        ])
        ;(AgendaService.enriquecer as jest.Mock).mockResolvedValue([
            { rotacionClienteId: 11, codigoParticularCliente: 'C001', semana: 1, dia: 2 },
        ])
        ;(RotacionClienteRepository.findUltimosMovimientos as jest.Mock).mockResolvedValue(
            new Map(),
        )

        const grid = await GerenciaRotacionService.getRotacion('V 2', 7)

        expect(grid.semanas[0].dias.MAR[0].ultimoMovimiento).toBeNull()
    })

    it('404 si la rotación no existe', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue(null)

        await expect(GerenciaRotacionService.getRotacion('V 2', 999)).rejects.toThrow(
            CustomError,
        )
    })

    it('404 si la rotación es de otro vendedor', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue({
            id: 7,
            codigoParticularVendedor: 'V 9',
            estado: 'abierta',
            fechaInicio: null,
            fechaFin: null,
            descripcion: null,
            orden: null,
        })

        // 404 y no 403: para gerencia, una rotación de otro vendedor bajo esta ruta es
        // una URL mal armada, no un permiso que le falte.
        await expect(GerenciaRotacionService.getRotacion('V 2', 7)).rejects.toMatchObject({
            statusCode: 404,
        })
    })
})
```

- [x] **Step 2: Correr y verificar que falla**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts`
Expected: FAIL — `Cannot find module './GerenciaRotacionService'`.

- [x] **Step 3: Exponer `enriquecer` y mover `EMPTY_WEEK` a `dias.ts`**

`DiaSemana` y `DIA_KEYS` ya viven en `src/services/planificacion/dias.ts` (un módulo sin imports, creado justamente para que `CicloService` no importe `AgendaService`) y AgendaService los re-exporta. `EMPTY_WEEK`, en cambio, es una const local de `AgendaService.ts:21` y no está exportada.

1. Mové `EMPTY_WEEK` a `src/services/planificacion/dias.ts`, genérica para que sirva tanto a las cards del vendedor como a las de gerencia. Agregá al final de ese archivo:

```ts
/** Una semana laboral vacía. Genérica porque la usan dos formas de card: las del
 *  vendedor (IAgendaClient) y las del grid de gerencia (IAgendaClientAdmin). */
export const EMPTY_WEEK = <T>(): Record<DiaSemana, T[]> => ({
    LUN: [],
    MAR: [],
    MIE: [],
    JUE: [],
    VIE: [],
})
```

2. En `src/services/planificacion/AgendaService.ts`, borrá la const local `EMPTY_WEEK` (líneas 21-27), importala de `./dias` y agregala al re-export que ya existe en la línea 16:

```ts
export { DIA_KEYS, diaToIndex, EMPTY_WEEK }
```

Los usos existentes dentro de AgendaService quedan igual: `EMPTY_WEEK()` infiere `T` del contexto. Si TypeScript se queja de inferencia en algún uso, anotalo explícito: `EMPTY_WEEK<IAgendaClient>()`.

3. Cambiá la firma de la línea 137 de `private static async enriquecer(` a:

```ts
    /** Público para que el grid de gerencia (GerenciaRotacionService) arme sus cards con
     *  exactamente el mismo enriquecido que la agenda del vendedor, en vez de duplicar
     *  las tres queries de cards/resoluciones/rubros. */
    static async enriquecer(
```

- [x] **Step 4: Agregar los tipos del grid**

En `src/types/planificacion.ts`, después de `IReacomodacionInfo`:

```ts
/** Una card del grid de gerencia: lo mismo que ve el vendedor, más la autoría. */
export interface IAgendaClientAdmin extends IAgendaClient {
    ultimoMovimiento: IReacomodacionInfo | null
}

export interface ISemanaRotacionAdmin {
    semana: number
    descripcion: string | null
    dias: Record<DiaSemana, IAgendaClientAdmin[]>
}

/** El grid completo de una rotación, en un solo payload. */
export interface IRotacionAdmin extends IRotacion {
    semanas: ISemanaRotacionAdmin[]
}
```

`DiaSemana` se importa de su módulo canónico, no del re-export de AgendaService. Agregá arriba de `types/planificacion.ts`:

```ts
import { DiaSemana } from '../services/planificacion/dias'
```

`dias.ts` no importa nada, así que no hay ciclo posible.

- [x] **Step 5: Crear el service**

Creá `src/services/planificacion/GerenciaRotacionService.ts`:

```ts
import { CustomError } from '../../utils/errors'
import { RotacionRepository } from '../../repositories/RotacionRepository'
import { RotacionClienteRepository } from '../../repositories/RotacionClienteRepository'
import { RotacionSemanaRepository } from '../../repositories/RotacionSemanaRepository'
import { AgendaService, DIA_KEYS, EMPTY_WEEK } from './AgendaService'
import {
    IRotacion,
    IRotacionAdmin,
    ISemanaRotacionAdmin,
    IAgendaClientAdmin,
} from '../../types/planificacion'

/**
 * Todo lo que gerencia puede hacer sobre la rotación de OTRO vendedor.
 *
 * Vive separado del self-service (VisitasService/AgendaService) porque el eje de
 * autorización es opuesto: allá el vendedor sale del token y una fila ajena es 403; acá
 * el vendedor viaja en la URL y el permiso es del rol, no del dueño del dato.
 */
export class GerenciaRotacionService {
    /** La cola operable del vendedor: la vigente y las programadas en orden. */
    static async listarRotaciones(vendedor: string): Promise<IRotacion[]> {
        return RotacionRepository.listarCola(vendedor)
    }

    /**
     * Carga una rotación y verifica que sea de ese vendedor.
     *
     * 404 y no 403 cuando es de otro: bajo esta ruta gerencia tiene permiso sobre
     * cualquier vendedor, así que un id que no le corresponde a `:codigo` es una URL mal
     * armada, no un permiso faltante.
     */
    static async requireRotacionDe(
        vendedor: string,
        rotacionId: number,
    ): Promise<IRotacion> {
        const rotacion = await RotacionRepository.findById(rotacionId)
        if (!rotacion || rotacion.codigoParticularVendedor !== vendedor) {
            throw new CustomError(404, 'Rotación no encontrada para este vendedor.', {
                code: 'ROTACION_NOT_FOUND',
            })
        }
        return rotacion
    }

    /**
     * El grid completo: todas las semanas del set × 5 días × clientes, en un payload.
     *
     * Las semanas salen del SET (pl_rotacion_semana) y no de los clientes: una semana sin
     * clientes tiene que aparecer igual —vacía y con su nombre— para poder arrastrarle
     * una card encima. Con el set derivado del plan, esa semana no existía.
     */
    static async getRotacion(
        vendedor: string,
        rotacionId: number,
    ): Promise<IRotacionAdmin> {
        const rotacion = await GerenciaRotacionService.requireRotacionDe(
            vendedor,
            rotacionId,
        )

        const set = await RotacionSemanaRepository.semanasDelSet(rotacionId)
        const descripciones = await RotacionSemanaRepository.findDescripciones(rotacionId)

        const filas = await RotacionClienteRepository.findByRotacion(rotacionId)
        const clientes = await AgendaService.enriquecer(filas)
        const movimientos = await RotacionClienteRepository.findUltimosMovimientos(
            rotacionId,
        )

        // Índice semana → días, precargado con TODAS las semanas del set (incluidas las
        // vacías) para no depender de que algún cliente las mencione.
        const porSemana = new Map<number, ISemanaRotacionAdmin>(
            set.map(semana => [
                semana,
                {
                    semana,
                    descripcion: descripciones.get(semana) ?? null,
                    dias: EMPTY_WEEK(),
                },
            ]),
        )

        for (const cliente of clientes) {
            const semana = porSemana.get(cliente.semana)
            if (!semana) continue // fila en una semana fuera del set: no se muestra
            const key = DIA_KEYS[cliente.dia - 1]
            if (!key) continue // dato malo: se descarta, no rompe la vista
            const card: IAgendaClientAdmin = {
                ...cliente,
                ultimoMovimiento: movimientos.get(cliente.rotacionClienteId) ?? null,
            }
            semana.dias[key].push(card)
        }

        return { ...rotacion, semanas: [...porSemana.values()] }
    }
}
```

**Nota sobre `cliente.semana`:** `AgendaService.enriquecer` devuelve `IAgendaClient`, que hoy expone `dia` pero puede no exponer `semana`. Si `cliente.semana` no compila, indexá por `rotacionClienteId` contra las `filas` crudas (que sí traen `semana`) en vez de leerlo de la card:

```ts
        const semanaPorFila = new Map(filas.map(f => [f.id, f.semana]))
        // ...
        const semana = porSemana.get(semanaPorFila.get(cliente.rotacionClienteId)!)
```

- [x] **Step 6: Correr y verificar que pasa**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts`
Expected: PASS (4 tests).

- [x] **Step 7: Commit**

```bash
git add src/services/planificacion/GerenciaRotacionService.ts src/services/planificacion/GerenciaRotacionService.spec.ts src/services/planificacion/AgendaService.ts src/types/planificacion.ts
git commit -m "feat(planificacion): grid completo de la rotacion de un vendedor para gerencia"
```

---

### Task 11: Escrituras de gerencia — reacomodar, cola y descripciones

**Files:**
- Modify: `src/services/planificacion/GerenciaRotacionService.ts`
- Test: `src/services/planificacion/GerenciaRotacionService.spec.ts`

**Interfaces:**
- Consumes: `requireRotacionDe` (Task 10), `RotacionClienteRepository.mover`, primitivas de cola (Task 7), `RotacionSemanaRepository.editarDescripcion` (Task 4).
- Produces:
  - `reacomodar(user, vendedor, rotacionId, rotacionClienteId, dto: IReacomodarDTO)`
  - `crearProgramada(vendedor): Promise<number>`
  - `reordenar(vendedor, rotacionId, nuevoOrden): Promise<void>`
  - `cancelar(vendedor, rotacionId): Promise<void>`
  - `editarDescripcionRotacion(vendedor, rotacionId, descripcion): Promise<void>`
  - `editarDescripcionSemana(vendedor, rotacionId, semana, descripcion): Promise<void>`
  - `RotacionRepository.editarDescripcion(rotacionId, descripcion): Promise<void>`

- [x] **Step 1: Escribir los tests que fallan**

Agregá a `src/services/planificacion/GerenciaRotacionService.spec.ts`:

```ts
const USER = { id: '5', email: 'jefe@distrisuper.com' } as any

const rotacionAbierta = {
    id: 7,
    codigoParticularVendedor: 'V 2',
    estado: 'abierta',
    fechaInicio: '2026-08-03T12:00:00.000Z',
    fechaFin: null,
    descripcion: null,
    orden: null,
}

describe('reacomodar', () => {
    beforeEach(() => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue(rotacionAbierta)
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue({
            id: 11,
            rotacionId: 7,
            semana: 1,
            dia: 1,
        })
        ;(RotacionSemanaRepository.semanasDelSet as jest.Mock).mockResolvedValue([1, 2, 3])
    })

    it('mueve con origen gerencia y el usuario del token', async () => {
        await GerenciaRotacionService.reacomodar(USER, 'V 2', 7, 11, { semana: 3, dia: 4 })

        expect(RotacionClienteRepository.mover).toHaveBeenCalledWith(
            11,
            3,
            4,
            'gerencia',
            'jefe@distrisuper.com',
        )
    })

    it('sin semana, mueve de día dentro de la semana actual de la fila', async () => {
        await GerenciaRotacionService.reacomodar(USER, 'V 2', 7, 11, { dia: 5 })

        expect(RotacionClienteRepository.mover).toHaveBeenCalledWith(
            11,
            1,
            5,
            'gerencia',
            'jefe@distrisuper.com',
        )
    })

    it('422 si la semana destino no está en el set', async () => {
        // El drag and drop solo suelta en celdas que existen, pero la API no puede
        // confiar en el cliente: el CHECK de la tabla solo pide semana >= 1.
        await expect(
            GerenciaRotacionService.reacomodar(USER, 'V 2', 7, 11, { semana: 99, dia: 1 }),
        ).rejects.toMatchObject({ statusCode: 422 })
        expect(RotacionClienteRepository.mover).not.toHaveBeenCalled()
    })

    it('400 si el día no está entre 1 y 5', async () => {
        await expect(
            GerenciaRotacionService.reacomodar(USER, 'V 2', 7, 11, { dia: 9 }),
        ).rejects.toMatchObject({ statusCode: 400 })
    })

    it('409 si la rotación ya está cerrada', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue({
            ...rotacionAbierta,
            estado: 'cerrada',
            fechaFin: '2026-09-01T12:00:00.000Z',
        })

        await expect(
            GerenciaRotacionService.reacomodar(USER, 'V 2', 7, 11, { dia: 2 }),
        ).rejects.toMatchObject({ statusCode: 409 })
    })

    it('404 si la fila es de otra rotación', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue({
            id: 11,
            rotacionId: 99,
            semana: 1,
            dia: 1,
        })

        await expect(
            GerenciaRotacionService.reacomodar(USER, 'V 2', 7, 11, { dia: 2 }),
        ).rejects.toMatchObject({ statusCode: 404 })
    })
})

describe('reordenar', () => {
    it('renumera la cola con la programada en su nueva posición', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue({
            ...rotacionAbierta,
            id: 32,
            estado: 'programada',
            orden: 3,
        })
        ;(RotacionRepository.listarCola as jest.Mock).mockResolvedValue([
            { ...rotacionAbierta, id: 7, estado: 'abierta', orden: null },
            { ...rotacionAbierta, id: 30, estado: 'programada', orden: 1 },
            { ...rotacionAbierta, id: 31, estado: 'programada', orden: 2 },
            { ...rotacionAbierta, id: 32, estado: 'programada', orden: 3 },
        ])

        await GerenciaRotacionService.reordenar('V 2', 32, 1)

        // 32 pasa al frente; la abierta no participa de la cola.
        expect(RotacionRepository.renumerarCola).toHaveBeenCalledWith([32, 30, 31])
    })

    it('409 si la rotación no es programada', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue(rotacionAbierta)

        await expect(GerenciaRotacionService.reordenar('V 2', 7, 1)).rejects.toMatchObject(
            { statusCode: 409 },
        )
    })
})

describe('cancelar', () => {
    it('cancela una programada', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue({
            ...rotacionAbierta,
            id: 30,
            estado: 'programada',
            orden: 1,
        })

        await GerenciaRotacionService.cancelar('V 2', 30)

        expect(RotacionRepository.cancelar).toHaveBeenCalledWith(30)
    })

    it('409 si se intenta cancelar la rotación vigente', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue(rotacionAbierta)

        await expect(GerenciaRotacionService.cancelar('V 2', 7)).rejects.toMatchObject({
            statusCode: 409,
        })
    })
})

describe('editarDescripcionSemana', () => {
    it('422 si la semana no existe en el set', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue(rotacionAbierta)
        ;(RotacionSemanaRepository.editarDescripcion as jest.Mock).mockResolvedValue(false)

        await expect(
            GerenciaRotacionService.editarDescripcionSemana('V 2', 7, 99, 'Nada'),
        ).rejects.toMatchObject({ statusCode: 422 })
    })

    it('guarda el nombre de la zona', async () => {
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue(rotacionAbierta)
        ;(RotacionSemanaRepository.editarDescripcion as jest.Mock).mockResolvedValue(true)

        await GerenciaRotacionService.editarDescripcionSemana(
            'V 2',
            7,
            2,
            'Buenos Aires',
        )

        expect(RotacionSemanaRepository.editarDescripcion).toHaveBeenCalledWith(
            7,
            2,
            'Buenos Aires',
        )
    })
})
```

- [x] **Step 2: Correr y verificar que falla**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts`
Expected: FAIL — `GerenciaRotacionService.reacomodar is not a function`.

- [x] **Step 3: Agregar `editarDescripcion` a `RotacionRepository`**

En `src/repositories/RotacionRepository.ts`, dentro de la clase:

```ts
    static async editarDescripcion(
        rotacionId: number,
        descripcion: string | null,
    ): Promise<void> {
        try {
            await Rotacion.update({ descripcion }, { where: { id: rotacionId } })
        } catch (err) {
            throw new CustomError(500, `Error editando descripción de rotación: ${err}`)
        }
    }
```

- [x] **Step 4: Implementar las escrituras**

En `src/services/planificacion/GerenciaRotacionService.ts`, agregá los imports que falten (`IUser`, `IReacomodarDTO`, `RotacionSemanaRepository` ya está) y estos métodos dentro de la clase:

```ts
    /** Editable = 'abierta' o 'programada'. Una cerrada es historia y no se reescribe;
     *  una cancelada no llegó a existir. */
    private static requireEditable(rotacion: IRotacion): void {
        if (rotacion.estado === 'cerrada' || rotacion.estado === 'cancelada') {
            throw new CustomError(
                409,
                'Esta rotación ya terminó, así que no se puede modificar.',
                { code: 'ROTACION_CERRADA' },
            )
        }
    }

    private static requireProgramada(rotacion: IRotacion): void {
        if (rotacion.estado !== 'programada') {
            throw new CustomError(
                409,
                'Solo se pueden reordenar o cancelar rotaciones programadas.',
                { code: 'ROTACION_NO_PROGRAMADA' },
            )
        }
    }

    /**
     * Reacomodar de gerencia. Mismo UPDATE que el self-service, con dos diferencias:
     * no hay chequeo de "fila ajena" (el permiso es del rol, no del dueño) y la bitácora
     * queda con origen 'gerencia'.
     *
     * NO llama a `mover()` sin validar la semana: `mover()` no revalida y el CHECK de la
     * tabla solo pide semana >= 1, así que sería la puerta por donde entra `semana: 99`.
     */
    static async reacomodar(
        user: IUser,
        vendedor: string,
        rotacionId: number,
        rotacionClienteId: number,
        dto: IReacomodarDTO,
    ): Promise<void> {
        if (!Number.isInteger(dto.dia) || dto.dia < 1 || dto.dia > 5) {
            throw new CustomError(400, 'El día tiene que estar entre 1 y 5.', {
                code: 'DIA_INVALIDO',
            })
        }

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

        const semana = dto.semana ?? fila.semana

        if (dto.semana !== undefined) {
            const set = await RotacionSemanaRepository.semanasDelSet(rotacionId)
            if (!set.includes(dto.semana)) {
                throw new CustomError(
                    422,
                    `La semana ${dto.semana} no existe en esta rotación.`,
                    { code: 'SEMANA_FUERA_DEL_SET', semanas: set },
                )
            }
        }

        // 'gerencia' es lo que después distingue un movimiento de gestión de uno del
        // vendedor en el reporte de excepciones. El formato de `usuario` sigue el
        // precedente del self-service.
        await RotacionClienteRepository.mover(
            rotacionClienteId,
            semana,
            dto.dia,
            'gerencia',
            user.email ?? String(user.id),
        )
    }

    /** Encola una rotación nueva, materializada contra el template de AHORA. */
    static async crearProgramada(vendedor: string): Promise<number> {
        return RotacionService.materializarProgramada(vendedor)
    }

    /**
     * Mueve una programada a `nuevoOrden` (1 = la próxima) y renumera la cola completa.
     * Se renumera todo en vez de intercambiar dos filas: ver `renumerarCola`.
     */
    static async reordenar(
        vendedor: string,
        rotacionId: number,
        nuevoOrden: number,
    ): Promise<void> {
        const rotacion = await GerenciaRotacionService.requireRotacionDe(
            vendedor,
            rotacionId,
        )
        GerenciaRotacionService.requireProgramada(rotacion)

        const cola = await RotacionRepository.listarCola(vendedor)
        const programadas = cola
            .filter(r => r.estado === 'programada')
            .map(r => r.id)
            .filter(id => id !== rotacionId)

        // Clampea en vez de rechazar: la posición pedida puede haber quedado fuera de
        // rango porque otra programada se activó entre el GET y el PATCH.
        const destino = Math.min(Math.max(nuevoOrden, 1), programadas.length + 1)
        programadas.splice(destino - 1, 0, rotacionId)

        await RotacionRepository.renumerarCola(programadas)
    }

    static async cancelar(vendedor: string, rotacionId: number): Promise<void> {
        const rotacion = await GerenciaRotacionService.requireRotacionDe(
            vendedor,
            rotacionId,
        )
        GerenciaRotacionService.requireProgramada(rotacion)
        await RotacionRepository.cancelar(rotacionId)
    }

    static async editarDescripcionRotacion(
        vendedor: string,
        rotacionId: number,
        descripcion: string | null,
    ): Promise<void> {
        const rotacion = await GerenciaRotacionService.requireRotacionDe(
            vendedor,
            rotacionId,
        )
        GerenciaRotacionService.requireEditable(rotacion)
        await RotacionRepository.editarDescripcion(rotacionId, descripcion)
    }

    static async editarDescripcionSemana(
        vendedor: string,
        rotacionId: number,
        semana: number,
        descripcion: string | null,
    ): Promise<void> {
        const rotacion = await GerenciaRotacionService.requireRotacionDe(
            vendedor,
            rotacionId,
        )
        GerenciaRotacionService.requireEditable(rotacion)

        const ok = await RotacionSemanaRepository.editarDescripcion(
            rotacionId,
            semana,
            descripcion,
        )
        if (!ok) {
            throw new CustomError(
                422,
                `La semana ${semana} no existe en esta rotación.`,
                { code: 'SEMANA_FUERA_DEL_SET' },
            )
        }
    }
```

- [x] **Step 5: Agregar `materializarProgramada` a `RotacionService`**

`crearProgramada` necesita materializar contra una rotación que nace `'programada'`, no `'abierta'`. En `src/services/planificacion/RotacionService.ts`, agregá:

```ts
    /**
     * Materializa una rotación PROGRAMADA al final de la cola del vendedor.
     *
     * Comparte todo con `materializar` salvo el estado de la fila de rotación: el
     * template se lee ACÁ y no cuando la rotación se active, porque el sentido de
     * planificar por adelantado es poder editar ese plan durante la espera. Si el
     * template se releyera al activarse, pisaría lo que gerencia acomodó.
     */
    static async materializarProgramada(vendedor: string): Promise<number> {
        const { validas } = await RotacionService.leerTemplate(vendedor)

        if (validas.length === 0) {
            throw new CustomError(
                422,
                'No hay clientes asignados a este vendedor en la hoja de ruta.',
                { code: 'ROTACION_SIN_CLIENTES' },
            )
        }

        const previa = await RotacionRepository.findUltimaConSemanas(vendedor)
        const heredadas = previa
            ? await RotacionSemanaRepository.findDescripciones(previa)
            : new Map<number, string | null>()

        const rotacionId = await RotacionRepository.crearProgramada(vendedor)
        await RotacionClienteRepository.crearMuchos(rotacionId, validas)

        const semanas = [...new Set(validas.map(v => v.semana))].sort((a, b) => a - b)
        await RotacionSemanaRepository.crearMuchas(
            rotacionId,
            semanas.map(semana => ({ semana, descripcion: heredadas.get(semana) ?? null })),
        )

        return rotacionId
    }
```

Importá `RotacionService` en `GerenciaRotacionService.ts`.

**Nota de DRY:** `materializar` y `materializarProgramada` comparten todo menos la llamada de creación. Si preferís una sola función, extraé un privado `materializarEn(rotacionId, validas, heredadas)` y dejá las dos públicas como wrappers de tres líneas. Cualquiera de las dos formas es aceptable; lo que no es aceptable es duplicar la herencia de descripciones en un tercer lugar más adelante.

- [x] **Step 6: Correr y verificar que pasa**

Run: `npx jest src/services/planificacion/GerenciaRotacionService.spec.ts`
Expected: PASS (todos, incluidos los 4 de la Task 10).

- [x] **Step 7: Commit**

```bash
git add src/services/planificacion/ src/repositories/RotacionRepository.ts
git commit -m "feat(planificacion): escrituras de gerencia sobre la rotacion y su cola"
```

---

### Task 12: Controller y rutas de gerencia

**Files:**
- Modify: `src/controllers/planificacionController.ts`
- Modify: `src/routes/planificacion.ts`

**Interfaces:**
- Consumes: todos los métodos de `GerenciaRotacionService` (Tasks 10-11).
- Produces: los 8 endpoints del contrato, montados bajo `/planificacion/vendedores/:codigo/...`.

- [x] **Step 1: Agregar los handlers al controller**

En `src/controllers/planificacionController.ts`, importá el service:

```ts
import { GerenciaRotacionService } from '../services/planificacion/GerenciaRotacionService'
```

y agregá dentro de la clase. El manejo de error repite el patrón `CustomError` ya usado en todos los handlers del archivo:

```ts
    // ───────────────── Gerencia: rotación de OTRO vendedor ─────────────────
    // El vendedor viaja en la URL (`:codigo`), no sale del token: el permiso lo da el rol
    // (authorize en la ruta), no la propiedad del dato. Los handlers de self-service de
    // este mismo archivo siguen resolviéndolo con resolveSellerCode y no se tocan.

    static async listarRotacionesDeVendedor(req: Request, res: Response): Promise<void> {
        try {
            const data = await GerenciaRotacionService.listarRotaciones(req.params.codigo)
            res.status(200).json({ ok: 1, data })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }

    static async getRotacionDeVendedor(req: Request, res: Response): Promise<void> {
        try {
            const rotacionId = parseInt(req.params.rotacionId, 10)
            if (isNaN(rotacionId)) {
                res.status(400).json({ ok: 0, error: 'rotacionId inválido' })
                return
            }
            const data = await GerenciaRotacionService.getRotacion(
                req.params.codigo,
                rotacionId,
            )
            res.status(200).json({ ok: 1, data })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }

    static async crearRotacionProgramada(req: Request, res: Response): Promise<void> {
        try {
            const rotacionId = await GerenciaRotacionService.crearProgramada(
                req.params.codigo,
            )
            res.status(201).json({ ok: 1, data: { rotacionId } })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }

    static async reacomodarComoGerencia(req: Request, res: Response): Promise<void> {
        try {
            const rotacionId = parseInt(req.params.rotacionId, 10)
            const rotacionClienteId = parseInt(req.params.id, 10)
            if (isNaN(rotacionId) || isNaN(rotacionClienteId)) {
                res.status(400).json({ ok: 0, error: 'id inválido' })
                return
            }

            const { semana, dia } = req.body as { semana?: unknown; dia?: unknown }
            const semanaParsed = semana === undefined ? undefined : parseSemana(semana)
            if (semana !== undefined && semanaParsed === null) {
                res.status(400).json({ ok: 0, error: 'semana debe ser un entero positivo' })
                return
            }

            await GerenciaRotacionService.reacomodar(
                req.user!,
                req.params.codigo,
                rotacionId,
                rotacionClienteId,
                { semana: semanaParsed ?? undefined, dia: Number(dia) },
            )
            res.status(200).json({ ok: 1 })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }

    static async reordenarRotacion(req: Request, res: Response): Promise<void> {
        try {
            const rotacionId = parseInt(req.params.rotacionId, 10)
            const orden = Number((req.body as { orden?: unknown }).orden)
            if (isNaN(rotacionId) || !Number.isInteger(orden) || orden < 1) {
                res.status(400).json({ ok: 0, error: 'orden debe ser un entero positivo' })
                return
            }
            await GerenciaRotacionService.reordenar(req.params.codigo, rotacionId, orden)
            res.status(200).json({ ok: 1 })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }

    static async cancelarRotacion(req: Request, res: Response): Promise<void> {
        try {
            const rotacionId = parseInt(req.params.rotacionId, 10)
            if (isNaN(rotacionId)) {
                res.status(400).json({ ok: 0, error: 'rotacionId inválido' })
                return
            }
            await GerenciaRotacionService.cancelar(req.params.codigo, rotacionId)
            res.status(200).json({ ok: 1 })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }

    static async editarDescripcionRotacion(req: Request, res: Response): Promise<void> {
        try {
            const rotacionId = parseInt(req.params.rotacionId, 10)
            if (isNaN(rotacionId)) {
                res.status(400).json({ ok: 0, error: 'rotacionId inválido' })
                return
            }
            await GerenciaRotacionService.editarDescripcionRotacion(
                req.params.codigo,
                rotacionId,
                PlanificacionController.parseDescripcion(req.body),
            )
            res.status(200).json({ ok: 1 })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }

    static async editarDescripcionSemana(req: Request, res: Response): Promise<void> {
        try {
            const rotacionId = parseInt(req.params.rotacionId, 10)
            const semana = parseSemana(req.params.semana)
            if (isNaN(rotacionId) || semana === null) {
                res.status(400).json({ ok: 0, error: 'rotacionId o semana inválidos' })
                return
            }
            await GerenciaRotacionService.editarDescripcionSemana(
                req.params.codigo,
                rotacionId,
                semana,
                PlanificacionController.parseDescripcion(req.body),
            )
            res.status(200).json({ ok: 1 })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }
```

Y dos helpers privados al final de la clase:

```ts
    /** Normaliza la descripción: string vacío o whitespace = borrar el nombre (null), y
     *  se recorta a los 120 de la columna en vez de dejar que MySQL truncue en silencio. */
    private static parseDescripcion(body: unknown): string | null {
        const raw = (body as { descripcion?: unknown } | null)?.descripcion
        if (typeof raw !== 'string') return null
        const limpio = raw.trim()
        return limpio === '' ? null : limpio.slice(0, 120)
    }

    private static responderError(res: Response, err: unknown): void {
        if (err instanceof CustomError) {
            res.status(err.statusCode).json(err.toJSON())
        } else {
            res.status(500).json({ ok: 0, error: 'Error inesperado' })
        }
    }
```

- [x] **Step 2: Montar las rutas**

En `src/routes/planificacion.ts`, agregá antes del `export default router`:

```ts
// ───────────────────────── Gerencia ─────────────────────────
// Los tres roles de scope unrestricted, igual que analítica. `authorize` es VARIÁDICO:
// spread obligatorio — pasarle el array compararía un array contra el string del rol y
// nunca autorizaría a nadie.
const ROLES_GERENCIA = ['admin', 'versus-ger', 'supervisor']

// La cola del vendedor: la rotación vigente y las programadas, en orden.
router.get(
    '/vendedores/:codigo/rotaciones',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.listarRotacionesDeVendedor(req, res)
    },
)

// Encola una rotación programada nueva, materializada contra el template de ahora.
router.post(
    '/vendedores/:codigo/rotaciones',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.crearRotacionProgramada(req, res)
    },
)

// El grid completo de una rotación: semanas × días × clientes en un solo payload.
router.get(
    '/vendedores/:codigo/rotaciones/:rotacionId',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.getRotacionDeVendedor(req, res)
    },
)

// Nombre de la rotación completa (ej. "Ronda Agosto").
router.patch(
    '/vendedores/:codigo/rotaciones/:rotacionId',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.editarDescripcionRotacion(req, res)
    },
)

// Cancela una programada (soft-delete). La vigente y las cerradas rebotan 409.
router.delete(
    '/vendedores/:codigo/rotaciones/:rotacionId',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.cancelarRotacion(req, res)
    },
)

// Posición de una programada en la cola.
router.patch(
    '/vendedores/:codigo/rotaciones/:rotacionId/orden',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.reordenarRotacion(req, res)
    },
)

// Nombre de una semana (ej. "Buenos Aires"). No requiere que tenga ciclo ni clientes.
router.patch(
    '/vendedores/:codigo/rotaciones/:rotacionId/semanas/:semana',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.editarDescripcionSemana(req, res)
    },
)

// Reacomodar como gerencia: mismo UPDATE que el self-service, sin el chequeo de fila
// ajena y con origen 'gerencia' en la bitácora.
router.patch(
    '/vendedores/:codigo/rotaciones/:rotacionId/rotacion-cliente/:id/reacomodar',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.reacomodarComoGerencia(req, res)
    },
)
```

**Ojo con el orden de las rutas:** estas van DESPUÉS de las de self-service. `/vendedores/...` no colisiona con ninguna existente (`/agenda/*`, `/rotacion/*`, `/rotacion-cliente/*`, `/visitas/*`, `/ciclo/*`, `/motivos`), así que no hay ambigüedad de matching.

- [x] **Step 3: Compilar y correr toda la suite**

Run: `npx tsc --noEmit && npm test`
Expected: compila limpio, suite verde.

- [ ] **Step 4: Probar a mano contra el server local**

Levantá el server (`npm run dev`) y, con un token de un usuario `admin`, verificá el camino completo:

```bash
BASE=http://localhost:3000/prod/vs/planificacion
TOKEN=<token de un usuario admin>

# 1. Cola del vendedor
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/vendedores/V%202/rotaciones" | jq

# 2. Grid de la rotación vigente (usá el id que devolvió el paso 1)
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/vendedores/V%202/rotaciones/1" | jq '.data.semanas[0]'

# 3. Nombrar una semana
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"descripcion":"Buenos Aires"}' "$BASE/vendedores/V%202/rotaciones/1/semanas/2" | jq

# 4. Semana inexistente → 422 SEMANA_FUERA_DEL_SET
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"semana":99,"dia":1}' \
  "$BASE/vendedores/V%202/rotaciones/1/rotacion-cliente/1/reacomodar" | jq

# 5. Con un token de rol 'vendedor' → 403 en cualquiera de las de arriba
```

Expected: 1 y 2 devuelven `ok: 1`; 3 persiste el nombre y se ve en el grid del paso 2; 4 devuelve 422 con `code: "SEMANA_FUERA_DEL_SET"`; 5 devuelve 403.

- [x] **Step 5: Commit**

```bash
git add src/controllers/planificacionController.ts src/routes/planificacion.ts
git commit -m "feat(planificacion): endpoints de gerencia para la rotacion de un vendedor"
```

---

## Notas de cierre

- **La migración de datos a producción no está ejecutada.** El script quedó correcto y verificado contra el fixture (Task 1, Step 6), pero el rollout —backup, ventana, orden respecto del deploy de esta rama— es un ejercicio aparte.
- **El front todavía no consume nada de esto.** Su plan es `2026-08-11-frontend-vista-gerencia-rotacion.md`, y depende de los tipos y rutas que fija este.
- **Deuda conocida:** `pl_reacomodacion.usuario` guarda un email (o el id como string), no una FK — los usuarios viven en el servicio de auth externo, así que no hay tabla a la que apuntar dentro de la base `planificacion`. Si algún día se necesita agrupar movimientos por persona de forma robusta, ese es el punto a revisar.
