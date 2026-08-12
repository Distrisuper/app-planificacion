# Ítem ofrecido genérico — Backend (api-vendedores)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalizar `pl_visita_rubro` a `pl_visita_item` — un ítem ofrecido con `tipo` (rubro/marca/línea/artículo/acción), catálogo propio de acciones comerciales y un alcance de 0..N destinos — para poder registrar lo que el vendedor realmente ofrece (plan cupo, descuento sobre una marca) en vez de solo rubros caídos.

**Architecture:** Rename real de tabla, columnas, modelos, repositorio, service y rutas. Se agregan dos tablas (`pl_accion` catálogo sembrado, `pl_visita_item_alcance` 0..N destinos) y una columna `detalle JSON` que se crea vacía. El estado del ítem sigue **derivado** de sus motivos — no se crea ninguna tabla de resolución por ítem. Las rutas viejas `/rubros` quedan como alias apuntando al mismo controller durante un release.

**Tech Stack:** Node + TypeScript, Express, Sequelize (conexión `sequelizeWritePlanificacion`), MySQL 8.0, Jest.

**Repo:** `C:/Users/matia/Documents/distrisuper/business-workflow/versus/api-vendedores`

**Spec:** `app-planificacion/docs/superpowers/specs/2026-08-12-item-ofrecido-generico-design.md`

## Global Constraints

- **Este plan es desplegable solo.** Los alias de ruta `/rubros` hacen que el frontend actual siga funcionando sin cambios. No mergear el plan de frontend antes que este.
- **`codigo` es `NOT NULL` en ítem y en alcance.** Un cupo global tiene código (`CUPO`, de `pl_accion`); lo que no tiene es alcance.
- **No se crea ninguna columna `estado` ni tabla de resolución por ítem.** Un ítem está resuelto si tiene motivos. Regla del dominio, no preferencia.
- **`detalle JSON` se crea y NINGÚN código la escribe.** Cualquier tarea que la escriba está fuera de plan.
- **No reusar `pct_diferencia` para el porcentaje de una acción.** Esa columna significa "% por debajo del competidor".
- **Los tests existentes deben pasar con cambios de NOMBRE únicamente.** Si una aserción necesita cambiar de valor esperado, el rename se llevó lógica puesta: parar y revisar.
- **Los `ALTER` en producción son intervención manual de ops.** El plan produce el script idempotente en `docs/db-notes/`, no lo ejecuta contra producción.
- Tests: `npm test` (jest). Build: `npm run build` (tsc).
- Enum de tipos, textual y exacto: `'rubro' | 'marca' | 'linea' | 'articulo' | 'accion'`.
- Precedencia de resultado, exacta: `ganado > diferido > perdido > no_ofrecido`.

---

## File Structure

**Crear:**

| archivo | responsabilidad |
|---|---|
| `docs/db-notes/planificacion-item-generico.sql` | migración idempotente completa |
| `src/models/planificacion/VisitaItem.ts` | modelo del ítem (reemplaza `VisitaRubro.ts`) |
| `src/models/planificacion/VisitaItemMotivo.ts` | modelo del motivo por ítem (reemplaza `VisitaRubroMotivo.ts`) |
| `src/models/planificacion/VisitaItemAlcance.ts` | modelo del alcance |
| `src/models/planificacion/Accion.ts` | modelo del catálogo de acciones |
| `src/repositories/VisitaItemRepository.ts` | persistencia del ítem + alcance (reemplaza `VisitaRubroRepository.ts`) |
| `src/repositories/AccionesRepository.ts` | lectura del catálogo `pl_accion` |
| `src/services/planificacion/AccionesService.ts` | catálogo con caché, espejo de `MotivosService` |
| `src/services/planificacion/itemValidation.ts` | validación de `tipo`/`codigo`/alcance/duplicado |
| `src/services/planificacion/resultadoItem.ts` | precedencia de resultado (helper puro) |
| `src/services/planificacion/ItemsService.ts` | orquestación (reemplaza `RubrosService.ts`) |

**Borrar** (al final de su tarea, en el mismo commit del reemplazo): `VisitaRubro.ts`, `VisitaRubroMotivo.ts`, `VisitaRubroRepository.ts`, `RubrosService.ts` y sus `.spec.ts`.

**Modificar:** `src/types/planificacion.ts`, `src/services/planificacion/motivoValidation.ts`, `src/services/planificacion/VisitasService.ts`, `src/services/planificacion/AgendaService.ts`, `src/services/planificacion/CicloService.ts`, `src/services/planificacion/AnaliticaService.ts`, `src/controllers/planificacionController.ts`, `src/routes/planificacion.ts`, `docs/db-notes/planificacion-ciclo-tables.sql`.

---

### Task 1: Migración SQL

**Files:**
- Create: `docs/db-notes/planificacion-item-generico.sql`
- Modify: `docs/db-notes/planificacion-ciclo-tables.sql` (DDL consolidado: es la fuente de verdad del esquema)

**Interfaces:**
- Consumes: nada.
- Produces: tablas `pl_visita_item`, `pl_visita_item_motivo`, `pl_visita_item_alcance`, `pl_accion`; columna `pl_visita_item.tipo`, `pl_visita_item.detalle`; `pl_motivo.nivel = 'item'`.

**Contexto que el implementador necesita:**

El esquema hoy (de `planificacion-ciclo-tables.sql`) tiene dos trampas para esta migración:

1. `uq_visita_rubro (resolucion_id, rubro_code)` es el índice que **sostiene la FK** `resolucion_id → pl_resolucion(id)` (es su columna izquierda). Un `DROP INDEX` pelado revienta con `ERROR 1553: Cannot drop index ... needed in a foreign key constraint`. Hay que **crear primero** el índice de reemplazo. Es exactamente el problema que documenta `planificacion-drop-uq-rotacion-semana.sql`; leelo antes de escribir este script.
2. `pl_visita_rubro_motivo.visita_rubro_id` tiene FK a `pl_visita_rubro(id)`. Se renombran las dos tablas y la columna.

`pl_motivo.nivel` es `VARCHAR(10)`, no ENUM: el cambio `'rubro'` → `'item'` es un `UPDATE`, sin `ALTER` de tipo.

- [ ] **Step 1: Leer el precedente**

Leer `docs/db-notes/planificacion-drop-uq-rotacion-semana.sql` completo. Copiar de ahí el bloque de encabezado que advierte sobre seleccionar la base (`planificacion-prod` con guion en producción, `planificacion` en local) — este script tiene que llevar la misma advertencia.

- [ ] **Step 2: Escribir el script de migración**

Crear `docs/db-notes/planificacion-item-generico.sql`:

```sql
-- Generaliza el rubro ofrecido a "ítem ofrecido": rubro | marca | linea | articulo | accion.
-- Spec: app-planificacion/docs/superpowers/specs/2026-08-12-item-ofrecido-generico-design.md
--
-- El vendedor no ofrece solo rubros caídos: ofrece marcas, artículos y acciones
-- comerciales (plan cupo, descuento). Hoy todo eso termina como texto libre en una nota
-- de Cromo, y sobre texto libre no se puede hacer un GROUP BY.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECCIONAR LA BASE ANTES DE CORRER ESTO. A propósito NO hay un `USE` acá: el
-- nombre cambia por entorno y equivocarse es silencioso, no ruidoso.
--
--   producción → `planificacion-prod`   (CON guion; hay que escribirlo entre backticks)
--   local/docker → `planificacion`      (ver docker-compose.local.yml)
--
-- Confirmá dónde estás parado antes de seguir:
--   SELECT DATABASE();
--   SELECT VERSION();   -- tiene que ser 5.7+ por la columna JSON
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Renombre de tablas. En MySQL 8 RENAME TABLE reapunta solo las FKs que las
--    referencian, así que no hace falta bajarlas y volver a crearlas.
RENAME TABLE pl_visita_rubro        TO pl_visita_item;
RENAME TABLE pl_visita_rubro_motivo TO pl_visita_item_motivo;

-- 2. Renombre de columnas.
ALTER TABLE pl_visita_item
  RENAME COLUMN rubro_code        TO codigo,
  RENAME COLUMN rubro_descripcion TO descripcion;

ALTER TABLE pl_visita_item_motivo
  RENAME COLUMN visita_rubro_id TO visita_item_id;

-- 3. Columnas nuevas. El DEFAULT 'rubro' ES el backfill: todo lo que existe hoy es
--    un rubro caído.
ALTER TABLE pl_visita_item
  ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'rubro' AFTER resolucion_id,
  ADD COLUMN detalle JSON NULL AFTER es_propuesto;

-- 4. Índice de reemplazo ANTES de tirar el unique.
--    uq_visita_rubro (resolucion_id, rubro_code) es el índice que sostiene la FK
--    resolucion_id -> pl_resolucion(id): es su columna izquierda, y no hay otro
--    candidato. Un DROP INDEX pelado revienta con
--      ERROR 1553: Cannot drop index 'uq_visita_rubro': needed in a foreign key constraint
--    Mismo problema y misma solución que planificacion-drop-uq-rotacion-semana.sql.
--
--    Y el unique NO se reemplaza por otro unique: con alcance, dos descuentos en la
--    misma visita sobre marcas distintas son legítimos. Evitar el duplicado exacto
--    pasa a ser responsabilidad del service (ver itemValidation.ts).
CREATE INDEX idx_item_resolucion ON pl_visita_item (resolucion_id, tipo, codigo);
ALTER TABLE pl_visita_item DROP INDEX uq_visita_rubro;

-- idx_rubro (rubro_code) quedó apuntando a la columna renombrada; se renombra por
-- claridad. Funcionalmente ya seguía a la columna.
ALTER TABLE pl_visita_item RENAME INDEX idx_rubro TO idx_codigo;

-- 5. Catálogo de acciones comerciales. Existe porque rubros, marcas y artículos salen
--    del warehouse, pero las acciones no tienen ninguna fuente: sin esto el cupo vuelve
--    a ser texto tipeado por cada vendedor.
CREATE TABLE IF NOT EXISTS pl_accion (
  codigo      VARCHAR(50)  NOT NULL PRIMARY KEY,
  descripcion VARCHAR(200) NOT NULL,
  orden       SMALLINT     NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,

  INDEX idx_activo (activo, orden)
);

-- Los códigos van explícitos porque los tests y el sandbox los referencian.
INSERT IGNORE INTO pl_accion (codigo, descripcion, orden) VALUES
  ('CUPO',      'Plan cupo',          10),
  ('DESCUENTO', 'Descuento',          20),
  ('PROMO',     'Promoción',          30),
  ('COBRANZA',  'Cobranza',           40);

-- 6. Alcance: sobre qué aplica la oferta. CERO filas = oferta global, no "falta cargar".
CREATE TABLE IF NOT EXISTS pl_visita_item_alcance (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  visita_item_id INT          NOT NULL,
  tipo           VARCHAR(20)  NOT NULL,  -- rubro | marca | linea | articulo
  codigo         VARCHAR(50)  NOT NULL,
  descripcion    VARCHAR(200) NOT NULL,  -- snapshot, igual que en el ítem

  UNIQUE KEY uq_alcance (visita_item_id, tipo, codigo),
  CONSTRAINT fk_alcance_item FOREIGN KEY (visita_item_id) REFERENCES pl_visita_item (id)
);

-- 7. Motivos: un solo catálogo para todos los tipos de ítem. nivel es VARCHAR(10),
--    así que no hay ALTER de tipo: 'item' entra donde entraba 'rubro'.
UPDATE pl_motivo SET nivel = 'item' WHERE nivel = 'rubro';
```

- [ ] **Step 3: Correrlo contra MySQL local y verificar**

```bash
docker compose -f docker-compose.local.yml up -d mysql
```

Correr el script contra la base `planificacion` local, con datos de prueba ya cargados (los fixtures de `docs/db-notes/fixtures`). Después verificar:

```sql
SELECT VERSION();
SHOW CREATE TABLE pl_visita_item;
SELECT tipo, COUNT(*) FROM pl_visita_item GROUP BY tipo;   -- todo 'rubro'
SELECT nivel, COUNT(*) FROM pl_motivo GROUP BY nivel;      -- 'visita' e 'item', ningún 'rubro'
SELECT * FROM pl_accion;                                   -- 4 filas
```

Esperado: `pl_visita_item` sin `uq_visita_rubro`, con `idx_item_resolucion`, `tipo` con default `'rubro'` y `detalle` JSON nullable. Cero filas perdidas.

- [ ] **Step 4: Verificar idempotencia**

Correr el script **una segunda vez**. Los `RENAME TABLE`, `RENAME COLUMN` y `DROP INDEX` van a fallar porque ya se aplicaron — eso es esperado y correcto para un script de una sola pasada. Documentarlo con un comentario al final del archivo:

```sql
-- Este script es de UNA SOLA PASADA: los RENAME y el DROP INDEX fallan si se
-- vuelve a correr. Lo idempotente son los CREATE TABLE IF NOT EXISTS, el
-- INSERT IGNORE y el UPDATE de pl_motivo. Si hay que reintentar después de un
-- fallo parcial, revisar con SHOW CREATE TABLE qué pasos ya se aplicaron.
```

- [ ] **Step 5: Actualizar el DDL consolidado**

En `docs/db-notes/planificacion-ciclo-tables.sql`, reemplazar los bloques `pl_visita_rubro` y `pl_visita_rubro_motivo` por el estado final, y agregar `pl_accion` y `pl_visita_item_alcance`. Mantener el estilo de comentarios explicativos por columna del resto del archivo. En `pl_visita_item` el comentario del índice tiene que decir por qué **no** hay unique.

- [ ] **Step 6: Commit**

```bash
git add docs/db-notes/planificacion-item-generico.sql docs/db-notes/planificacion-ciclo-tables.sql
git commit -m "db: migracion del item ofrecido generico (tipo, alcance, pl_accion)"
```

---

### Task 2: Tipos del dominio

**Files:**
- Modify: `src/types/planificacion.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `TipoItem`, `IAlcance`, `IVisitaItem`, `IItemMotivo`, `IAgregarItemDTO`, `IResolverItemDTO`, `IResolverItemResult`, `IAccion`, `NivelMotivo`.

- [ ] **Step 1: Escribir los tipos nuevos**

En `src/types/planificacion.ts`, reemplazar `IVisitaRubro`, `IRubroMotivo`, `IAgregarRubroDTO`, `IResolverRubroDTO`, `IResolverRubroResult` por:

```ts
export type TipoItem = 'rubro' | 'marca' | 'linea' | 'articulo' | 'accion'

/** Los tipos que pueden ser DESTINO de una oferta. 'accion' no: una acción no se
 *  aplica sobre otra acción. */
export type TipoAlcance = Exclude<TipoItem, 'accion'>

export interface IAlcance {
    tipo: TipoAlcance
    codigo: string
    descripcion: string
}

/** Un motivo aplicado a un ítem. marca/competidor/pctDiferencia solo se usan cuando el
 *  motivo tiene requiereDetalle; en el resto van null. */
export interface IItemMotivo {
    motivoId: number
    marca: string | null
    competidor: string | null
    pctDiferencia: number | null
}

/** Un ítem de la propuesta congelada. `resuelto` se DERIVA de motivos.length. */
export interface IVisitaItem {
    id: number
    resolucionId: number
    tipo: TipoItem
    codigo: string
    descripcion: string
    gapUnits: number | null
    esPropuesto: boolean
    resuelto: boolean
    motivos: IItemMotivo[]
    /** Cero elementos = oferta global, no "falta cargar". */
    alcance: IAlcance[]
}

export interface IAgregarItemDTO {
    tipo: TipoItem
    codigo: string
    descripcion: string
    alcance?: IAlcance[]
}

export interface IResolverItemDTO {
    motivos: IItemMotivo[]
}

export interface IResolverItemResult {
    itemsPendientes: number
}

/** Catálogo de acciones comerciales (pl_accion). Agregar una es un INSERT. */
export interface IAccion {
    codigo: string
    descripcion: string
}
```

Cambiar `NivelMotivo` de `'visita' | 'rubro'` a `'visita' | 'item'`.

- [ ] **Step 2: Verificar que el build rompe donde tiene que romper**

Run: `npm run build`
Expected: FAIL con errores de tipo en `VisitaRubroRepository.ts`, `RubrosService.ts`, `motivoValidation.ts`, `VisitasService.ts` y el controller. Esa lista **es el mapa de las tareas 4 a 9** — anotarla.

- [ ] **Step 3: Commit**

```bash
git add src/types/planificacion.ts
git commit -m "types: item ofrecido generico (TipoItem, IAlcance, IVisitaItem)"
```

El build queda roto entre esta tarea y la 9. Es esperado y es la razón por la que estas tareas no se mergean sueltas.

---

### Task 3: Modelos Sequelize

**Files:**
- Create: `src/models/planificacion/VisitaItem.ts`, `src/models/planificacion/VisitaItemMotivo.ts`, `src/models/planificacion/VisitaItemAlcance.ts`, `src/models/planificacion/Accion.ts`
- Delete: `src/models/planificacion/VisitaRubro.ts`, `src/models/planificacion/VisitaRubroMotivo.ts`

**Interfaces:**
- Consumes: `TipoItem`, `TipoAlcance` (Task 2).
- Produces: los cuatro modelos, todos sobre `sequelizeWritePlanificacion`, `timestamps: false`.

- [ ] **Step 1: Crear `VisitaItem.ts`**

Partir de `VisitaRubro.ts` (leerlo primero: tiene el comentario sobre DECIMAL que vuelve como string desde mysql2, y hay que conservarlo). Cambios: `rubroCode`/`rubro_code` → `codigo`/`codigo`, `rubroDescripcion`/`rubro_descripcion` → `descripcion`/`descripcion`, y dos campos nuevos:

```ts
        tipo: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'rubro',
            field: 'tipo',
        },
        // Se crea vacía a propósito: ningún código la escribe todavía. Mismo criterio
        // que las columnas seguimiento_* de pl_resolucion — acá un ALTER en producción
        // es intervención manual de ops, así que la columna se adelanta y reponer el
        // dato después es solo código de servicio.
        detalle: {
            type: DataTypes.JSON,
            allowNull: true,
            field: 'detalle',
        },
```

`tableName: 'pl_visita_item'`, `modelName: 'VisitaItem'`. Conservar el comentario de cabecera `// Sin 'estado' ni 'resuelto_en': un ítem está resuelto si tiene motivos.`

- [ ] **Step 2: Crear `VisitaItemMotivo.ts`**

Copia exacta de `VisitaRubroMotivo.ts` con `visitaRubroId`/`visita_rubro_id` → `visitaItemId`/`visita_item_id`, `tableName: 'pl_visita_item_motivo'`, `modelName: 'VisitaItemMotivo'`. Las columnas `marca`, `competidor`, `pctDiferencia` **no se tocan**.

- [ ] **Step 3: Crear `VisitaItemAlcance.ts`**

```ts
import { Model, DataTypes } from 'sequelize'
import { sequelizeWritePlanificacion } from '../../database/connection'
import { TipoAlcance } from '../../types/planificacion'

interface IVisitaItemAlcanceAttributes {
    id?: number
    visitaItemId: number
    tipo: TipoAlcance
    codigo: string
    descripcion: string
}

class VisitaItemAlcance
    extends Model<IVisitaItemAlcanceAttributes>
    implements IVisitaItemAlcanceAttributes
{
    public id!: number
    public visitaItemId!: number
    public tipo!: TipoAlcance
    public codigo!: string
    public descripcion!: string
}

// Cero filas para un ítem = oferta global (un cupo que no es de ninguna marca).
// No es "falta cargar el alcance".
VisitaItemAlcance.init(
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            field: 'id',
        },
        visitaItemId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'visita_item_id',
        },
        tipo: { type: DataTypes.STRING(20), allowNull: false, field: 'tipo' },
        codigo: { type: DataTypes.STRING(50), allowNull: false, field: 'codigo' },
        descripcion: {
            type: DataTypes.STRING(200),
            allowNull: false,
            field: 'descripcion',
        },
    },
    {
        sequelize: sequelizeWritePlanificacion,
        modelName: 'VisitaItemAlcance',
        tableName: 'pl_visita_item_alcance',
        timestamps: false,
    },
)

export default VisitaItemAlcance
```

- [ ] **Step 4: Crear `Accion.ts`**

Mismo molde, tabla `pl_accion`, PK `codigo` (`type: DataTypes.STRING(50), primaryKey: true, field: 'codigo'`), más `descripcion` STRING(200) NOT NULL, `orden` SMALLINT default 0, `activo` BOOLEAN default true.

- [ ] **Step 5: Borrar los modelos viejos**

```bash
git rm src/models/planificacion/VisitaRubro.ts src/models/planificacion/VisitaRubroMotivo.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/models/planificacion/
git commit -m "models: VisitaItem, VisitaItemAlcance y Accion"
```

---

### Task 4: Catálogo de acciones

**Files:**
- Create: `src/repositories/AccionesRepository.ts`, `src/services/planificacion/AccionesService.ts`, `src/services/planificacion/AccionesService.spec.ts`
- Test: `src/services/planificacion/AccionesService.spec.ts`

**Interfaces:**
- Consumes: `Accion` (Task 3), `IAccion` (Task 2).
- Produces: `AccionesRepository.findActivas(): Promise<IAccion[]>`, `AccionesService.list(): Promise<IAccion[]>`, `AccionesService.codigosValidos(): Promise<Set<string>>`, `AccionesService.clearCache(): void`.

`codigosValidos()` la consume `itemValidation` en la Task 6.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/services/planificacion/AccionesService.spec.ts`. Espejo de `MotivosService.spec.ts` (leerlo para copiar el molde de mock del repositorio):

```ts
import { AccionesService } from './AccionesService'
import { AccionesRepository } from '../../repositories/AccionesRepository'

jest.mock('../../repositories/AccionesRepository')

const mockedFindActivas = AccionesRepository.findActivas as jest.MockedFunction<
    typeof AccionesRepository.findActivas
>

beforeEach(() => {
    AccionesService.clearCache()
    jest.clearAllMocks()
})

describe('AccionesService', () => {
    it('devuelve el catálogo activo', async () => {
        mockedFindActivas.mockResolvedValue([
            { codigo: 'CUPO', descripcion: 'Plan cupo' },
        ])

        expect(await AccionesService.list()).toEqual([
            { codigo: 'CUPO', descripcion: 'Plan cupo' },
        ])
    })

    it('cachea: dos llamadas pegan una sola vez a la base', async () => {
        mockedFindActivas.mockResolvedValue([
            { codigo: 'CUPO', descripcion: 'Plan cupo' },
        ])

        await AccionesService.list()
        await AccionesService.list()

        expect(mockedFindActivas).toHaveBeenCalledTimes(1)
    })

    it('codigosValidos devuelve un Set para validar sin recorrer la lista', async () => {
        mockedFindActivas.mockResolvedValue([
            { codigo: 'CUPO', descripcion: 'Plan cupo' },
            { codigo: 'DESCUENTO', descripcion: 'Descuento' },
        ])

        const codigos = await AccionesService.codigosValidos()

        expect(codigos.has('CUPO')).toBe(true)
        expect(codigos.has('INVENTADO')).toBe(false)
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx jest src/services/planificacion/AccionesService.spec.ts`
Expected: FAIL — `Cannot find module './AccionesService'`.

- [ ] **Step 3: Implementar el repositorio**

Crear `src/repositories/AccionesRepository.ts`:

```ts
import Accion from '../models/planificacion/Accion'
import { CustomError } from '../utils/errors'
import { IAccion } from '../types/planificacion'

export class AccionesRepository {
    static async findActivas(): Promise<IAccion[]> {
        try {
            const rows = await Accion.findAll({
                where: { activo: true },
                order: [
                    ['orden', 'ASC'],
                    ['descripcion', 'ASC'],
                ],
            })
            return rows.map(r => ({ codigo: r.codigo, descripcion: r.descripcion }))
        } catch (err) {
            throw new CustomError(500, `Error fetching acciones: ${err}`)
        }
    }
}
```

- [ ] **Step 4: Implementar el service**

Crear `src/services/planificacion/AccionesService.ts`, con la misma estructura de caché que `MotivosService` (leerlo: TTL de 5 minutos en una constante de módulo):

```ts
import { AccionesRepository } from '../../repositories/AccionesRepository'
import { IAccion } from '../../types/planificacion'

const CACHE_TTL_MS = 5 * 60 * 1000

let cachedAcciones: IAccion[] | null = null
let cacheExpiresAt = 0

export class AccionesService {
    static async list(): Promise<IAccion[]> {
        const now = Date.now()
        if (cachedAcciones && now < cacheExpiresAt) return cachedAcciones

        const acciones = await AccionesRepository.findActivas()
        cachedAcciones = acciones
        cacheExpiresAt = now + CACHE_TTL_MS
        return acciones
    }

    /** Índice para validar el `codigo` de un ítem de tipo 'accion' sin recorrer. */
    static async codigosValidos(): Promise<Set<string>> {
        const todas = await AccionesService.list()
        return new Set(todas.map(a => a.codigo))
    }

    static clearCache(): void {
        cachedAcciones = null
        cacheExpiresAt = 0
    }
}
```

- [ ] **Step 5: Correr el test**

Run: `npx jest src/services/planificacion/AccionesService.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/repositories/AccionesRepository.ts src/services/planificacion/AccionesService.ts src/services/planificacion/AccionesService.spec.ts
git commit -m "feat: catalogo de acciones comerciales (pl_accion)"
```

---

### Task 5: Precedencia de resultado

**Files:**
- Create: `src/services/planificacion/resultadoItem.ts`, `src/services/planificacion/resultadoItem.spec.ts`

**Interfaces:**
- Consumes: `IItemMotivo` (Task 2), `IMotivo` (existente en `types/planificacion.ts`).
- Produces: `resultadoDeItem(motivos: IItemMotivo[], catalogo: Map<number, IMotivo>): ResultadoMotivo | null`.

**Contexto:** un ítem puede tener dos motivos con resultado distinto ("Saqué pedido" + "Precio"), y con cupos negociados eso va a ser **más frecuente** que con rubros. El resultado del ítem es **derivado, nunca guardado**: no hay columna `estado` en `pl_visita_item` y no se va a agregar.

**⚠ Ya existe una función parecida, y NO es la misma regla.** `AnaliticaService.ts:33` tiene `resultadoDominante(resultados)`, que resuelve el resultado **de una visita entera** por **mayoría**, usando la prioridad solo como desempate. La función de esta tarea usa **precedencia estricta**. Difieren de verdad:

| motivos del ítem | `resultadoDominante` (mayoría) | `resultadoDeItem` (precedencia) |
|---|---|---|
| ganado ×1, perdido ×1 | ganado (desempate) | ganado |
| ganado ×1, perdido ×2 | **perdido** | **ganado** |

Para un ítem la correcta es la precedencia: si sacaste el pedido, que además te hayan objetado precio y flete no lo convierte en una pérdida. Para la visita entera, la mayoría sigue siendo defendible.

**Las dos coexisten a propósito, y cada una tiene que decirlo en su comentario.** No unificar en esta tarea: cambiar `resultadoDominante` altera números de analítica ya en uso y está fuera del alcance del spec.

`ResultadoMotivo` **ya está definido** en `src/types/planificacion.ts` — no hay que crearlo.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/services/planificacion/resultadoItem.spec.ts`:

```ts
import { resultadoDeItem } from './resultadoItem'
import { IMotivo } from '../../types/planificacion'

const catalogo = new Map<number, IMotivo>([
    [1, { motivoId: 1, nivel: 'item', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false, orden: 10, activo: true }],
    [2, { motivoId: 2, nivel: 'item', descripcion: 'Pasa pedido mañana', resultado: 'diferido', requiereDetalle: false, orden: 20, activo: true }],
    [3, { motivoId: 3, nivel: 'item', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true, orden: 30, activo: true }],
    [4, { motivoId: 4, nivel: 'item', descripcion: 'No lo ofrecí', resultado: 'no_ofrecido', requiereDetalle: false, orden: 40, activo: true }],
])

const motivo = (motivoId: number) => ({
    motivoId,
    marca: null,
    competidor: null,
    pctDiferencia: null,
})

describe('resultadoDeItem', () => {
    it('sin motivos no hay resultado: el ítem está pendiente', () => {
        expect(resultadoDeItem([], catalogo)).toBeNull()
    })

    it('con un solo motivo devuelve su resultado', () => {
        expect(resultadoDeItem([motivo(3)], catalogo)).toBe('perdido')
    })

    // El caso que motiva este helper: cupo negociado donde se saca el pedido pero
    // igual se deja constancia de la objeción de precio.
    it('ganado le gana a perdido, sin importar el orden de la lista', () => {
        expect(resultadoDeItem([motivo(3), motivo(1)], catalogo)).toBe('ganado')
        expect(resultadoDeItem([motivo(1), motivo(3)], catalogo)).toBe('ganado')
    })

    it('diferido le gana a perdido y a no_ofrecido', () => {
        expect(resultadoDeItem([motivo(4), motivo(2), motivo(3)], catalogo)).toBe('diferido')
    })

    it('perdido le gana a no_ofrecido', () => {
        expect(resultadoDeItem([motivo(4), motivo(3)], catalogo)).toBe('perdido')
    })

    // Un motivo de nivel visita no tiene `resultado`: se ignora en vez de romper.
    it('ignora motivos sin resultado en el catálogo', () => {
        const conNivelVisita = new Map(catalogo)
        conNivelVisita.set(9, {
            motivoId: 9, nivel: 'visita', descripcion: 'Cerrado',
            resultado: null, requiereDetalle: false, orden: 10, activo: true,
        })
        expect(resultadoDeItem([motivo(9), motivo(3)], conNivelVisita)).toBe('perdido')
        expect(resultadoDeItem([motivo(9)], conNivelVisita)).toBeNull()
    })

    it('ignora motivos que no están en el catálogo', () => {
        expect(resultadoDeItem([motivo(999)], catalogo)).toBeNull()
    })
})
```

Si `IMotivo` tiene campos distintos a los usados arriba, ajustar los literales al tipo real (leer `src/types/planificacion.ts`) — **sin cambiar las aserciones**.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx jest src/services/planificacion/resultadoItem.spec.ts`
Expected: FAIL — `Cannot find module './resultadoItem'`.

- [ ] **Step 3: Implementar**

Crear `src/services/planificacion/resultadoItem.ts`:

```ts
import { IItemMotivo, IMotivo, ResultadoMotivo } from '../../types/planificacion'

/**
 * Precedencia del resultado comercial de UN ítem, a partir de sus motivos.
 *
 * Un ítem puede tener motivos con resultados distintos ("Saqué pedido" + "Precio"), y
 * con acciones negociadas —un plan cupo donde se cierra el pedido pero queda anotada la
 * objeción— eso es más frecuente que con rubros. La regla es: si se sacó el pedido, lo
 * demás es color.
 *
 * DERIVADO, nunca guardado. No hay columna `estado` en pl_visita_item, igual que no hay
 * "pendiente" en pl_resolucion: un estado guardado puede contradecir a los motivos, uno
 * derivado no puede.
 *
 * NO confundir con `resultadoDominante` de AnaliticaService, que resuelve el resultado
 * de una VISITA ENTERA por MAYORÍA (la prioridad ahí es solo el desempate). Son reglas
 * distintas a propósito: un ítem con "Saqué pedido" + "Precio" + "Flete" es ganado acá
 * (precedencia) y perdido allá (mayoría). A nivel ítem gana la precedencia porque el
 * pedido se sacó; a nivel visita la mayoría describe mejor cómo fue la visita en total.
 */
const PRECEDENCIA: ResultadoMotivo[] = ['ganado', 'diferido', 'perdido', 'no_ofrecido']

export function resultadoDeItem(
    motivos: IItemMotivo[],
    catalogo: Map<number, IMotivo>,
): ResultadoMotivo | null {
    const resultados = new Set(
        motivos
            .map(m => catalogo.get(m.motivoId)?.resultado)
            .filter((r): r is ResultadoMotivo => !!r),
    )

    return PRECEDENCIA.find(r => resultados.has(r)) ?? null
}
```

- [ ] **Step 4: Correr el test**

Run: `npx jest src/services/planificacion/resultadoItem.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Anotar la convivencia en la función existente**

En `src/services/planificacion/AnaliticaService.ts:32`, ampliar el comentario de `resultadoDominante` para que un lector futuro no crea que una de las dos sobra:

```ts
/**
 * Resultado de una VISITA ENTERA: el más frecuente entre sus motivos, con la prioridad
 * ganado > diferido > perdido > no_ofrecido como desempate.
 *
 * Distinto de `resultadoDeItem` (resultadoItem.ts), que resuelve UN ítem por precedencia
 * estricta. Un ítem con "Saqué pedido" + "Precio" + "Flete" es ganado allá y perdido acá.
 * Es intencional: a nivel ítem importa si se cerró, a nivel visita importa cómo fue en
 * conjunto. Si algún día se unifican, es un cambio de números de analítica y necesita
 * su propia decisión — no lo hagas de paso.
 */
```

**No cambiar el cuerpo de la función.**

- [ ] **Step 6: Correr los tests de analítica**

Run: `npx jest src/services/planificacion/AnaliticaService.spec.ts`
Expected: PASS, sin cambios (solo se tocó un comentario).

- [ ] **Step 7: Commit**

```bash
git add src/services/planificacion/resultadoItem.ts src/services/planificacion/resultadoItem.spec.ts src/services/planificacion/AnaliticaService.ts
git commit -m "feat: precedencia de resultado por item (ganado > diferido > perdido > no_ofrecido)"
```

---

### Task 6: Validación del ítem

**Files:**
- Create: `src/services/planificacion/itemValidation.ts`, `src/services/planificacion/itemValidation.spec.ts`
- Modify: `src/services/planificacion/motivoValidation.ts`, `src/services/planificacion/motivoValidation.spec.ts`

**Interfaces:**
- Consumes: `TipoItem`, `IAgregarItemDTO`, `IVisitaItem` (Task 2); `AccionesService.codigosValidos()` (Task 4).
- Produces: `validarItemNuevo(dto, opts): Promise<void>`, con
  `opts: { codigosDeAccion: Set<string>; itemsExistentes: IVisitaItem[] }`.

**Contexto:** sin validar `codigo` contra el catálogo de su `tipo`, la columna `tipo` es decorativa y el `GROUP BY` se rompe igual que con texto libre — que es el problema que todo esto viene a resolver.

Se valida el catálogo **solo de las acciones**, porque `pl_accion` es tabla propia. Rubros, marcas, líneas y artículos salen del warehouse y su validación exigiría un viaje extra por ítem; para esos se valida forma (no vacío, largo máximo). Anotarlo como comentario en el archivo para que no parezca un olvido.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/services/planificacion/itemValidation.spec.ts`:

```ts
import { validarItemNuevo } from './itemValidation'
import { IVisitaItem } from '../../types/planificacion'

const codigosDeAccion = new Set(['CUPO', 'DESCUENTO'])

const item = (over: Partial<IVisitaItem>): IVisitaItem => ({
    id: 1,
    resolucionId: 10,
    tipo: 'rubro',
    codigo: 'RODAM',
    descripcion: 'Rodamientos',
    gapUnits: null,
    esPropuesto: false,
    resuelto: false,
    motivos: [],
    alcance: [],
    ...over,
})

const opts = (itemsExistentes: IVisitaItem[] = []) => ({
    codigosDeAccion,
    itemsExistentes,
})

describe('validarItemNuevo', () => {
    it('acepta un rubro simple', async () => {
        await expect(
            validarItemNuevo(
                { tipo: 'rubro', codigo: 'RODAM', descripcion: 'Rodamientos' },
                opts(),
            ),
        ).resolves.toBeUndefined()
    })

    it('acepta una acción del catálogo', async () => {
        await expect(
            validarItemNuevo(
                { tipo: 'accion', codigo: 'CUPO', descripcion: 'Plan cupo' },
                opts(),
            ),
        ).resolves.toBeUndefined()
    })

    it('rechaza una acción que no está en el catálogo', async () => {
        await expect(
            validarItemNuevo(
                { tipo: 'accion', codigo: 'INVENTADO', descripcion: 'Lo que sea' },
                opts(),
            ),
        ).rejects.toMatchObject({ statusCode: 400, code: 'ACCION_DESCONOCIDA' })
    })

    it('rechaza un tipo fuera del enum', async () => {
        await expect(
            validarItemNuevo(
                { tipo: 'cualquiera' as never, codigo: 'X', descripcion: 'X' },
                opts(),
            ),
        ).rejects.toMatchObject({ statusCode: 400, code: 'TIPO_ITEM_INVALIDO' })
    })

    it('rechaza codigo vacío', async () => {
        await expect(
            validarItemNuevo({ tipo: 'marca', codigo: '  ', descripcion: 'SKF' }, opts()),
        ).rejects.toMatchObject({ statusCode: 400, code: 'CODIGO_REQUERIDO' })
    })

    it('acepta alcance sobre marca y rubros', async () => {
        await expect(
            validarItemNuevo(
                {
                    tipo: 'accion',
                    codigo: 'DESCUENTO',
                    descripcion: 'Descuento',
                    alcance: [
                        { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
                        { tipo: 'rubro', codigo: 'RODAM', descripcion: 'Rodamientos' },
                    ],
                },
                opts(),
            ),
        ).resolves.toBeUndefined()
    })

    it('rechaza alcance de tipo accion: una acción no se aplica sobre otra acción', async () => {
        await expect(
            validarItemNuevo(
                {
                    tipo: 'accion',
                    codigo: 'CUPO',
                    descripcion: 'Plan cupo',
                    alcance: [{ tipo: 'accion' as never, codigo: 'DESCUENTO', descripcion: 'x' }],
                },
                opts(),
            ),
        ).rejects.toMatchObject({ statusCode: 400, code: 'ALCANCE_INVALIDO' })
    })

    it('rechaza alcance con destinos repetidos', async () => {
        await expect(
            validarItemNuevo(
                {
                    tipo: 'accion',
                    codigo: 'CUPO',
                    descripcion: 'Plan cupo',
                    alcance: [
                        { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
                        { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
                    ],
                },
                opts(),
            ),
        ).rejects.toMatchObject({ statusCode: 400, code: 'ALCANCE_DUPLICADO' })
    })

    // La garantía que dejó de dar el unique de la base: con alcance, dos descuentos
    // sobre marcas distintas son legítimos, así que el duplicado exacto lo ataja el
    // service comparando el CONJUNTO de alcance.
    it('rechaza el duplicado exacto: mismo tipo, código y alcance', async () => {
        const existente = item({
            tipo: 'accion',
            codigo: 'DESCUENTO',
            descripcion: 'Descuento',
            alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
        })

        await expect(
            validarItemNuevo(
                {
                    tipo: 'accion',
                    codigo: 'DESCUENTO',
                    descripcion: 'Descuento',
                    alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
                },
                opts([existente]),
            ),
        ).rejects.toMatchObject({ statusCode: 409, code: 'ITEM_DUPLICADO' })
    })

    it('acepta el mismo descuento sobre OTRA marca', async () => {
        const existente = item({
            tipo: 'accion',
            codigo: 'DESCUENTO',
            descripcion: 'Descuento',
            alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
        })

        await expect(
            validarItemNuevo(
                {
                    tipo: 'accion',
                    codigo: 'DESCUENTO',
                    descripcion: 'Descuento',
                    alcance: [{ tipo: 'marca', codigo: 'CORVEN', descripcion: 'Corven' }],
                },
                opts([existente]),
            ),
        ).resolves.toBeUndefined()
    })

    it('el orden del alcance no cambia la identidad del ítem', async () => {
        const existente = item({
            tipo: 'accion',
            codigo: 'DESCUENTO',
            descripcion: 'Descuento',
            alcance: [
                { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
                { tipo: 'rubro', codigo: 'RODAM', descripcion: 'Rodamientos' },
            ],
        })

        await expect(
            validarItemNuevo(
                {
                    tipo: 'accion',
                    codigo: 'DESCUENTO',
                    descripcion: 'Descuento',
                    alcance: [
                        { tipo: 'rubro', codigo: 'RODAM', descripcion: 'Rodamientos' },
                        { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
                    ],
                },
                opts([existente]),
            ),
        ).rejects.toMatchObject({ statusCode: 409, code: 'ITEM_DUPLICADO' })
    })
})
```

Verificar cómo expone `CustomError` el código y el status (leer `src/utils/errors.ts`) y ajustar `toMatchObject` a la forma real — **sin cambiar qué caso espera fallar**.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx jest src/services/planificacion/itemValidation.spec.ts`
Expected: FAIL — `Cannot find module './itemValidation'`.

- [ ] **Step 3: Implementar**

Crear `src/services/planificacion/itemValidation.ts`:

```ts
import { CustomError } from '../../utils/errors'
import {
    IAgregarItemDTO,
    IAlcance,
    IVisitaItem,
    TipoItem,
} from '../../types/planificacion'

const TIPOS: TipoItem[] = ['rubro', 'marca', 'linea', 'articulo', 'accion']

/** Una acción no se aplica sobre otra acción: el alcance es el destino de la oferta. */
const TIPOS_DE_ALCANCE = TIPOS.filter(t => t !== 'accion')

const CODIGO_MAX = 50
const DESCRIPCION_MAX = 200

export interface OpcionesValidacionItem {
    /** De AccionesService.codigosValidos(). */
    codigosDeAccion: Set<string>
    /** Los ítems que ya tiene la visita, para atajar el duplicado exacto. */
    itemsExistentes: IVisitaItem[]
}

/**
 * Valida un ítem antes de persistirlo.
 *
 * El catálogo se valida SOLO para las acciones: `pl_accion` es tabla propia y está
 * cacheada. Rubros, marcas, líneas y artículos salen del warehouse, y validar cada uno
 * contra su fuente costaría un viaje por ítem en el peor momento (el vendedor parado en
 * el mostrador). Para esos se valida forma. No es un olvido: es dónde se puso el corte.
 */
export async function validarItemNuevo(
    dto: IAgregarItemDTO,
    { codigosDeAccion, itemsExistentes }: OpcionesValidacionItem,
): Promise<void> {
    if (!TIPOS.includes(dto.tipo)) {
        throw new CustomError(400, `Tipo de ítem inválido: ${dto.tipo}`, {
            code: 'TIPO_ITEM_INVALIDO',
        })
    }

    assertCodigo(dto.codigo, dto.descripcion)

    if (dto.tipo === 'accion' && !codigosDeAccion.has(dto.codigo)) {
        throw new CustomError(
            400,
            `La acción "${dto.codigo}" no está en el catálogo`,
            { code: 'ACCION_DESCONOCIDA' },
        )
    }

    const alcance = dto.alcance ?? []
    for (const destino of alcance) {
        if (!TIPOS_DE_ALCANCE.includes(destino.tipo)) {
            throw new CustomError(
                400,
                `El alcance no puede ser de tipo ${destino.tipo}`,
                { code: 'ALCANCE_INVALIDO' },
            )
        }
        assertCodigo(destino.codigo, destino.descripcion)
    }

    const claves = alcance.map(claveDeAlcance)
    if (new Set(claves).size !== claves.length) {
        throw new CustomError(400, 'El alcance tiene destinos repetidos', {
            code: 'ALCANCE_DUPLICADO',
        })
    }

    // La base ya no lo impide: el unique (resolucion_id, rubro_code) se sacó porque con
    // alcance dos descuentos sobre marcas distintas son legítimos. La identidad del ítem
    // pasa a ser (tipo, codigo, CONJUNTO de alcance), y eso no entra en un unique.
    const huella = huellaDeItem(dto.tipo, dto.codigo, alcance)
    const yaEsta = itemsExistentes.some(
        i => huellaDeItem(i.tipo, i.codigo, i.alcance) === huella,
    )
    if (yaEsta) {
        throw new CustomError(409, 'Ese ítem ya está cargado en esta visita', {
            code: 'ITEM_DUPLICADO',
        })
    }
}

function assertCodigo(codigo: string, descripcion: string): void {
    if (!codigo?.trim()) {
        throw new CustomError(400, 'El código del ítem es obligatorio', {
            code: 'CODIGO_REQUERIDO',
        })
    }
    if (codigo.length > CODIGO_MAX) {
        throw new CustomError(400, `El código no puede superar ${CODIGO_MAX} caracteres`, {
            code: 'CODIGO_INVALIDO',
        })
    }
    if (!descripcion?.trim()) {
        throw new CustomError(400, 'La descripción del ítem es obligatoria', {
            code: 'DESCRIPCION_REQUERIDA',
        })
    }
    if (descripcion.length > DESCRIPCION_MAX) {
        throw new CustomError(
            400,
            `La descripción no puede superar ${DESCRIPCION_MAX} caracteres`,
            { code: 'DESCRIPCION_INVALIDA' },
        )
    }
}

const claveDeAlcance = (a: IAlcance): string => `${a.tipo}:${a.codigo}`

/** El alcance es un CONJUNTO: se ordena para que el orden de carga no cambie la
 *  identidad del ítem. */
function huellaDeItem(tipo: string, codigo: string, alcance: IAlcance[]): string {
    const destinos = alcance.map(claveDeAlcance).sort().join('|')
    return `${tipo}:${codigo}#${destinos}`
}
```

- [ ] **Step 4: Correr el test**

Run: `npx jest src/services/planificacion/itemValidation.spec.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Renombrar la validación de motivos**

En `src/services/planificacion/motivoValidation.ts`: `validarMotivosDeRubro` → `validarMotivosDeItem`, y el nivel esperado `'rubro'` → `'item'` en la llamada a `assertNivel`. `IRubroMotivo` → `IItemMotivo`. Actualizar el comentario de la función (dice "NIVEL RUBRO"). En `motivoValidation.spec.ts`, mismo rename — **sin cambiar ninguna aserción**.

- [ ] **Step 6: Correr los tests de motivos**

Run: `npx jest src/services/planificacion/motivoValidation.spec.ts`
Expected: PASS, la misma cantidad de tests que antes del rename.

- [ ] **Step 7: Commit**

```bash
git add src/services/planificacion/itemValidation.ts src/services/planificacion/itemValidation.spec.ts src/services/planificacion/motivoValidation.ts src/services/planificacion/motivoValidation.spec.ts
git commit -m "feat: validacion del item generico (tipo, catalogo de accion, alcance, duplicado exacto)"
```

---

### Task 7: VisitaItemRepository

**Files:**
- Create: `src/repositories/VisitaItemRepository.ts`, `src/repositories/VisitaItemRepository.spec.ts`
- Delete: `src/repositories/VisitaRubroRepository.ts`, `src/repositories/VisitaRubroRepository.spec.ts`

**Interfaces:**
- Consumes: modelos de la Task 3, tipos de la Task 2.
- Produces:
  - `VisitaItemRepository.crearMuchos(resolucionId, items: PropuestaItem[], transaction?)`
  - `VisitaItemRepository.crearFueraDePropuesta(resolucionId, dto: IAgregarItemDTO): Promise<number>`
  - `VisitaItemRepository.findByResolucion(resolucionId): Promise<IVisitaItem[]>`
  - `VisitaItemRepository.findById(id): Promise<IVisitaItem | null>`
  - `VisitaItemRepository.eliminar(id): Promise<void>`
  - `VisitaItemRepository.resolver(visitaItemId, motivos: IItemMotivo[]): Promise<void>`
  - `VisitaItemRepository.contarPendientes(resolucionId): Promise<number>`
  - `VisitaItemRepository.contarPendientesPorResolucion(ids): Promise<Map<number, number>>`
  - `VisitaItemRepository.autocompletarSinMotivos(rotacionId, fechaAperturaIso, motivoId, transaction?): Promise<number>`
  - `PropuestaItem` (interface exportada, ahora con `tipo`)

**Contexto crítico:** este archivo tiene **SQL crudo con nombres de tabla escritos a mano** en `contarPendientes`, `contarPendientesPorResolucion` y `autocompletarSinMotivos`. TypeScript no va a avisar si quedan apuntando a `pl_visita_rubro`: la query va a fallar en runtime contra una tabla que ya no existe. Revisarlas una por una.

`autocompletarSinMotivos` tiene un comentario largo explicando por qué `rc.rotacion_id = :rotacionId` es obligatorio y por qué el dialecto mysql2 devuelve la metadata como número pelado. **Ese comentario se conserva entero** — documenta dos bugs ya pagados.

- [ ] **Step 1: Copiar el archivo y su spec**

```bash
git mv src/repositories/VisitaRubroRepository.ts src/repositories/VisitaItemRepository.ts
git mv src/repositories/VisitaRubroRepository.spec.ts src/repositories/VisitaItemRepository.spec.ts
```

- [ ] **Step 2: Renombrar en el spec primero, y verlo fallar**

En `VisitaItemRepository.spec.ts`: `VisitaRubroRepository` → `VisitaItemRepository`, `VisitaRubro` → `VisitaItem`, `VisitaRubroMotivo` → `VisitaItemMotivo`, `visitaRubroId` → `visitaItemId`, `rubroCode` → `codigo`, `rubroDescripcion` → `descripcion`, y los paths de `jest.mock`. **Ninguna aserción cambia de valor esperado.**

Run: `npx jest src/repositories/VisitaItemRepository.spec.ts`
Expected: FAIL — el repositorio todavía exporta el nombre viejo.

- [ ] **Step 3: Renombrar el repositorio**

En `VisitaItemRepository.ts`, además del rename de clase, modelos y campos:

`PropuestaItem` gana `tipo`:

```ts
export interface PropuestaItem {
    tipo: TipoItem
    codigo: string
    descripcion: string
    gapUnits: number | null
    pesosPerdidos: number | null
    caidaPct: number | null
    origen: 'caida' | 'minimo' | 'manual'
}
```

En `crearMuchos`, mapear `tipo: i.tipo`. El motor de propuesta sigue siendo por rubro, así que quien lo llame va a pasar `tipo: 'rubro'` — pero el repositorio no lo asume.

Las tres queries crudas: `pl_visita_rubro` → `pl_visita_item`, `pl_visita_rubro_motivo` → `pl_visita_item_motivo`, `visita_rubro_id` → `visita_item_id`, alias `vr` → `vi`, `vrm` → `vim`.

En `adjuntarMotivos`, el mapeo final devuelve además `tipo` y `alcance` (el alcance se agrega en el paso siguiente).

- [ ] **Step 4: Correr el spec renombrado**

Run: `npx jest src/repositories/VisitaItemRepository.spec.ts`
Expected: PASS, la misma cantidad de tests que antes. Si alguno falla por un valor esperado distinto (no por un nombre), **parar**: el rename se llevó lógica.

- [ ] **Step 5: Escribir el test del alcance**

Agregar a `VisitaItemRepository.spec.ts`:

```ts
describe('alcance', () => {
    it('crearFueraDePropuesta persiste los destinos del alcance', async () => {
        mockedCreate.mockResolvedValue({ id: 77 } as never)
        mockedAlcanceBulkCreate.mockResolvedValue([] as never)

        const id = await VisitaItemRepository.crearFueraDePropuesta(10, {
            tipo: 'accion',
            codigo: 'DESCUENTO',
            descripcion: 'Descuento',
            alcance: [
                { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
                { tipo: 'rubro', codigo: 'RODAM', descripcion: 'Rodamientos' },
            ],
        })

        expect(id).toBe(77)
        expect(mockedAlcanceBulkCreate).toHaveBeenCalledWith([
            { visitaItemId: 77, tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
            { visitaItemId: 77, tipo: 'rubro', codigo: 'RODAM', descripcion: 'Rodamientos' },
        ])
    })

    it('sin alcance no toca la tabla de alcance: la oferta es global', async () => {
        mockedCreate.mockResolvedValue({ id: 78 } as never)

        await VisitaItemRepository.crearFueraDePropuesta(10, {
            tipo: 'accion',
            codigo: 'CUPO',
            descripcion: 'Plan cupo',
        })

        expect(mockedAlcanceBulkCreate).not.toHaveBeenCalled()
    })

    it('eliminar borra alcance y motivos antes que el ítem (FK)', async () => {
        await VisitaItemRepository.eliminar(77)

        expect(mockedAlcanceDestroy).toHaveBeenCalledWith({ where: { visitaItemId: 77 } })
        expect(mockedMotivoDestroy).toHaveBeenCalledWith({ where: { visitaItemId: 77 } })
        expect(mockedDestroy).toHaveBeenCalledWith({ where: { id: 77 } })
    })

    it('findByResolucion adjunta el alcance de cada ítem', async () => {
        mockedFindAll.mockResolvedValue([
            { id: 1, resolucionId: 10, tipo: 'accion', codigo: 'CUPO', descripcion: 'Plan cupo', gapUnits: null, esPropuesto: false },
        ] as never)
        mockedMotivoFindAll.mockResolvedValue([] as never)
        mockedAlcanceFindAll.mockResolvedValue([
            { visitaItemId: 1, tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
        ] as never)

        const [item] = await VisitaItemRepository.findByResolucion(10)

        expect(item.alcance).toEqual([{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }])
        expect(item.resuelto).toBe(false)
    })
})
```

Agregar arriba del archivo los mocks de `VisitaItemAlcance` siguiendo el molde ya presente:

```ts
jest.mock('../models/planificacion/VisitaItemAlcance')

const mockedAlcanceBulkCreate = VisitaItemAlcance.bulkCreate as jest.MockedFunction<
    typeof VisitaItemAlcance.bulkCreate
>
const mockedAlcanceFindAll = VisitaItemAlcance.findAll as jest.MockedFunction<
    typeof VisitaItemAlcance.findAll
>
const mockedAlcanceDestroy = VisitaItemAlcance.destroy as jest.MockedFunction<
    typeof VisitaItemAlcance.destroy
>
```

- [ ] **Step 6: Correr y verificar que falla**

Run: `npx jest src/repositories/VisitaItemRepository.spec.ts -t alcance`
Expected: FAIL — `crearFueraDePropuesta` todavía recibe `(resolucionId, codigo, descripcion)` y no persiste alcance.

- [ ] **Step 7: Implementar el alcance**

```ts
    /** Ítem que el vendedor agrega desde Versus. No cuenta en la tasa de conversión. */
    static async crearFueraDePropuesta(
        resolucionId: number,
        dto: IAgregarItemDTO,
    ): Promise<number> {
        try {
            const row = await VisitaItem.create({
                resolucionId,
                tipo: dto.tipo,
                codigo: dto.codigo,
                descripcion: dto.descripcion,
                gapUnits: null,
                pesosPerdidos: null,
                caidaPct: null,
                origen: 'manual',
                esPropuesto: false,
            })

            const alcance = dto.alcance ?? []
            if (alcance.length > 0) {
                await VisitaItemAlcance.bulkCreate(
                    alcance.map(a => ({
                        visitaItemId: row.id,
                        tipo: a.tipo,
                        codigo: a.codigo,
                        descripcion: a.descripcion,
                    })),
                )
            }

            return row.id
        } catch (err) {
            throw new CustomError(500, `Error agregando ítem: ${err}`)
        }
    }
```

En `eliminar`, borrar alcance **antes** que el ítem (la FK `fk_alcance_item` lo exige):

```ts
    static async eliminar(id: number): Promise<void> {
        try {
            await VisitaItemAlcance.destroy({ where: { visitaItemId: id } })
            await VisitaItemMotivo.destroy({ where: { visitaItemId: id } })
            await VisitaItem.destroy({ where: { id } })
        } catch (err) {
            throw new CustomError(500, `Error eliminando ítem: ${err}`)
        }
    }
```

En `adjuntarMotivos`, sumar una segunda query agrupada en memoria (mismo criterio que la de motivos: una sola query para todos los ítems, no N):

```ts
        const alcanceRows = await VisitaItemAlcance.findAll({
            where: { visitaItemId: { [Op.in]: rows.map(r => r.id) } },
        })

        const porItem = new Map<number, IAlcance[]>()
        for (const a of alcanceRows) {
            const lista = porItem.get(a.visitaItemId) ?? []
            lista.push({ tipo: a.tipo, codigo: a.codigo, descripcion: a.descripcion })
            porItem.set(a.visitaItemId, lista)
        }
```

y en el `rows.map` final agregar `tipo: r.tipo` y `alcance: porItem.get(r.id) ?? []`.

- [ ] **Step 8: Correr todo el spec**

Run: `npx jest src/repositories/VisitaItemRepository.spec.ts`
Expected: PASS, los tests viejos más los 4 nuevos.

- [ ] **Step 9: Commit**

```bash
git add src/repositories/
git commit -m "feat: VisitaItemRepository con tipo y alcance"
```

---

### Task 8: ItemsService

**Files:**
- Create: `src/services/planificacion/ItemsService.ts`, `src/services/planificacion/ItemsService.spec.ts`
- Delete: `src/services/planificacion/RubrosService.ts`, `src/services/planificacion/RubrosService.spec.ts`

**Interfaces:**
- Consumes: `VisitaItemRepository` (Task 7), `validarItemNuevo` (Task 6), `AccionesService` (Task 4), `MotivosService`, `validarMotivosDeItem`.
- Produces:
  - `ItemsService.listar(user, visitaId): Promise<IVisitaItem[]>`
  - `ItemsService.resolver(user, visitaId, visitaItemId, dto): Promise<IResolverItemResult>`
  - `ItemsService.agregar(user, visitaId, dto): Promise<{ visitaItemId: number }>`
  - `ItemsService.eliminar(user, visitaId, visitaItemId): Promise<void>`

- [ ] **Step 1: Mover el archivo y su spec**

```bash
git mv src/services/planificacion/RubrosService.ts src/services/planificacion/ItemsService.ts
git mv src/services/planificacion/RubrosService.spec.ts src/services/planificacion/ItemsService.spec.ts
```

- [ ] **Step 2: Renombrar en el spec y verlo fallar**

`RubrosService` → `ItemsService`, `VisitaRubroRepository` → `VisitaItemRepository`, `rubrosPendientes` → `itemsPendientes`, `visitaRubroId` → `visitaItemId`. Los códigos de error `RUBRO_DE_PROPUESTA` → `ITEM_DE_PROPUESTA`, `RUBRO_NOT_FOUND` → `ITEM_NOT_FOUND`, `RUBRO_AJENO` → `ITEM_AJENO`, `RESOLUCION_SIN_RUBROS` → `RESOLUCION_SIN_ITEMS`.

Run: `npx jest src/services/planificacion/ItemsService.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Renombrar el service**

Aplicar los mismos renames en `ItemsService.ts`. **Conservar íntegros** los comentarios de `resolver` (por qué NO exige la visita abierta) y de `resolveVisitaPropia` (por qué la pertenencia es la rotación y no el ciclo) — documentan decisiones ya discutidas.

Los mensajes al usuario cambian de "rubro" a "ítem":

```ts
            throw new CustomError(
                409,
                'Este ítem es parte de la propuesta y no se puede borrar. Si no lo ofreciste, resolvelo como "No lo ofrecí".',
                { code: 'ITEM_DE_PROPUESTA' },
            )
```

- [ ] **Step 4: Correr el spec**

Run: `npx jest src/services/planificacion/ItemsService.spec.ts`
Expected: PASS, misma cantidad que antes.

- [ ] **Step 5: Escribir el test de `agregar` con validación**

```ts
describe('agregar', () => {
    it('valida contra el catálogo de acciones antes de persistir', async () => {
        mockedCodigosValidos.mockResolvedValue(new Set(['CUPO']))
        mockedFindByResolucion.mockResolvedValue([])

        await expect(
            ItemsService.agregar(user, 5, {
                tipo: 'accion',
                codigo: 'INVENTADO',
                descripcion: 'Lo que sea',
            }),
        ).rejects.toMatchObject({ code: 'ACCION_DESCONOCIDA' })

        expect(mockedCrearFueraDePropuesta).not.toHaveBeenCalled()
    })

    it('persiste el ítem con su alcance', async () => {
        mockedCodigosValidos.mockResolvedValue(new Set(['CUPO']))
        mockedFindByResolucion.mockResolvedValue([])
        mockedCrearFueraDePropuesta.mockResolvedValue(99)

        const res = await ItemsService.agregar(user, 5, {
            tipo: 'accion',
            codigo: 'CUPO',
            descripcion: 'Plan cupo',
            alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
        })

        expect(res).toEqual({ visitaItemId: 99 })
    })
})
```

Reusar el `user` y los mocks de visita propia que ya tiene el spec (leer cómo están armados arriba del archivo). Agregar los mocks de `AccionesService.codigosValidos` y `VisitaItemRepository.findByResolucion`.

- [ ] **Step 6: Correr y verificar que falla**

Run: `npx jest src/services/planificacion/ItemsService.spec.ts -t agregar`
Expected: FAIL — `agregar` todavía no valida.

- [ ] **Step 7: Implementar `agregar`**

```ts
    /** Ítem que el vendedor agrega desde Versus: es_propuesto = false. */
    static async agregar(
        user: IUser,
        visitaId: number,
        dto: IAgregarItemDTO,
    ): Promise<{ visitaItemId: number }> {
        const resolucion = await ItemsService.resolveVisitaPropia(user, visitaId)

        const [codigosDeAccion, itemsExistentes] = await Promise.all([
            AccionesService.codigosValidos(),
            VisitaItemRepository.findByResolucion(resolucion.id),
        ])
        await validarItemNuevo(dto, { codigosDeAccion, itemsExistentes })

        const visitaItemId = await VisitaItemRepository.crearFueraDePropuesta(
            resolucion.id,
            dto,
        )
        return { visitaItemId }
    }
```

- [ ] **Step 8: Correr el spec completo**

Run: `npx jest src/services/planificacion/ItemsService.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/services/planificacion/
git commit -m "feat: ItemsService con validacion de catalogo y alcance"
```

---

### Task 9: Rutas, controller y campos arrastrados

**Files:**
- Modify: `src/routes/planificacion.ts`, `src/controllers/planificacionController.ts`, `src/services/planificacion/VisitasService.ts`, `src/services/planificacion/AgendaService.ts`, `src/services/planificacion/CicloService.ts`, `src/services/planificacion/AnaliticaService.ts`

**Interfaces:**
- Consumes: `ItemsService` (Task 8), `AccionesService` (Task 4).
- Produces: las rutas `/planificacion/visitas/:id/items[/:itemId]`, `GET /planificacion/acciones`, los alias `/rubros`, y los campos renombrados `itemsPendientes` / `items` / `itemsAutocompletados`.

**Contexto:** los tres campos arrastrados viajan en respuestas de **otras** pantallas y son los más fáciles de olvidar. Buscarlos con `grep -rn "rubrosPendientes\|rubrosAutocompletados" src/` antes de dar la tarea por terminada.

- [ ] **Step 1: Renombrar los handlers del controller**

En `src/controllers/planificacionController.ts`: `listarRubros` → `listarItems`, `agregarRubro` → `agregarItem`, `resolverRubro` → `resolverItem`, `eliminarRubro` → `eliminarItem`. El param `req.params.rubroId` → `req.params.itemId`. Agregar el handler del catálogo:

```ts
export const listarAcciones = async (_req: Request, res: Response) => {
    const acciones = await AccionesService.list()
    res.json({ data: acciones })
}
```

Copiar la forma exacta de respuesta y el manejo de errores del handler `listarMotivos` que ya existe al lado.

- [ ] **Step 2: Renombrar los campos arrastrados**

- `VisitasService.ts`: el retorno de `iniciar` pasa de `{ visitaId, rubros }` a `{ visitaId, items }`. Los ítems congelados de la propuesta se crean con `tipo: 'rubro'` (el motor sigue siendo por rubro).
- `AgendaService.ts`: `rubrosPendientes` → `itemsPendientes` en la card del cliente.
- `CicloService.ts`: `rubrosAutocompletados` → `itemsAutocompletados`.
- `AnaliticaService.ts`: los campos de rubro que exponga pasan a ítem, sumando `tipo` y `alcance` en el DTO de cada ítem para que el front pueda pintar el chip y el resumen.

- [ ] **Step 2b: Conectar `resultadoDeItem` a la analítica**

Sin esto, la Task 5 deja un helper con tests y **cero consumidores** — código muerto.

En el DTO de detalle de visita, cada ítem gana `resultado: ResultadoMotivo | null`, calculado con `resultadoDeItem(item.motivos, catalogo)`. Es lo que hace visible en gerencia que un cupo con "Saqué pedido" + "Precio" cerró ganado.

Test en `AnaliticaService.spec.ts`:

```ts
it('el resultado del ítem sale por precedencia, no por mayoría', async () => {
    // ítem con motivos: Saqué pedido (ganado), Precio (perdido), Flete (perdido)
    const detalle = await AnaliticaService.detalleVisita(user, 5)

    expect(detalle.items[0].resultado).toBe('ganado')
})
```

Montar los mocks con el molde que ya usa el spec para `detalleVisita`. **`resultadoDominante` (nivel visita) no se toca**: esa sigue siendo mayoría, y el mismo caso da `perdido` ahí. Es la convivencia documentada en la Task 5.

Run: `npx jest src/services/planificacion/AnaliticaService.spec.ts`
Expected: PASS.

Run: `grep -rn "rubro\|Rubro" src/ --include=*.ts | grep -v "sale/rubro\|RubroDrops\|RubroClients\|RubroRecommendation"`
Expected: cero resultados en el dominio `planificacion`. Los que quedan son del motor de propuesta y de los catálogos del warehouse, que **no se tocan**.

- [ ] **Step 3: Definir las rutas nuevas y los alias**

En `src/routes/planificacion.ts`, renombrar los cuatro paths a `/visitas/:id/items[/:itemId]`, agregar `GET /acciones` (copiando el molde de `GET /motivos`, incluido su bloque de documentación OpenAPI), y al final del archivo:

```ts
// ── Alias temporales: se borran un release después de que el front migre ───────
//
// Esta app es una PWA con service worker: hay clientes instalados en los teléfonos de
// los vendedores con la versión vieja cacheada. Si las rutas se renombran antes de que
// el teléfono actualice, ese vendedor recibe 404 parado frente al cliente.
//
// Apuntan a los MISMOS handlers, no duplican lógica.
router.get('/visitas/:id/rubros', authenticate, listarItems)
router.post('/visitas/:id/rubros', authenticate, agregarItem)
router.put('/visitas/:id/rubros/:itemId', authenticate, resolverItem)
router.delete('/visitas/:id/rubros/:itemId', authenticate, eliminarItem)
```

Copiar el middleware exacto (`authenticate` y lo que lleven las rutas nuevas) de las definiciones originales — arriba está el nombre real.

- [ ] **Step 4: Escribir el test de las rutas**

En `src/controllers/planificacionController.spec.ts`, agregar:

```ts
describe('alias de rutas /rubros', () => {
    // Existe para que un teléfono con la PWA vieja cacheada no reciba 404 durante el
    // release de transición. Si este test se cae porque alguien borró el alias, revisar
    // que el frontend ya esté desplegado antes de borrarlo.
    it('GET /visitas/:id/rubros responde igual que /items', async () => {
        const viejo = await request(app).get('/planificacion/visitas/5/rubros').set(authHeader)
        const nuevo = await request(app).get('/planificacion/visitas/5/items').set(authHeader)

        expect(viejo.status).toBe(nuevo.status)
        expect(viejo.body).toEqual(nuevo.body)
    })
})

describe('GET /planificacion/acciones', () => {
    it('devuelve el catálogo de acciones', async () => {
        const res = await request(app).get('/planificacion/acciones').set(authHeader)

        expect(res.status).toBe(200)
        expect(res.body.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ codigo: 'CUPO' }),
            ]),
        )
    })
})
```

Reusar el `app`, el `authHeader` y los mocks que ya tiene el spec (leer su cabecera).

- [ ] **Step 5: Correr los tests del controller**

Run: `npx jest src/controllers/planificacionController.spec.ts`
Expected: PASS.

- [ ] **Step 6: Build y suite completa**

Run: `npm run build`
Expected: cero errores. Es la primera vez desde la Task 2 que el build tiene que estar limpio.

Run: `npm test`
Expected: PASS, toda la suite. Cualquier test que falle por un **valor** esperado (no por un nombre) es señal de que el rename se llevó lógica: parar y revisar.

- [ ] **Step 7: Regenerar el OpenAPI**

Run: `npm run generate:openapi`

- [ ] **Step 8: Commit**

```bash
git add src/routes/planificacion.ts src/controllers/ src/services/planificacion/ docs/
git commit -m "feat: rutas /items, catalogo de acciones y alias temporal de /rubros"
```

---

### Task 10: Verificación de punta a punta

**Files:** ninguno (verificación).

- [ ] **Step 1: Levantar el entorno local**

```bash
docker compose -f docker-compose.local.yml up -d
npm run dev
```

- [ ] **Step 2: Probar el camino nuevo**

Con un token válido, contra una visita abierta:

```bash
curl -s localhost:3000/planificacion/acciones -H "Authorization: Bearer $TOKEN"

curl -s -X POST localhost:3000/planificacion/visitas/5/items \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"tipo":"accion","codigo":"DESCUENTO","descripcion":"Descuento",
       "alcance":[{"tipo":"marca","codigo":"SKF","descripcion":"SKF"},
                  {"tipo":"rubro","codigo":"RODAM","descripcion":"Rodamientos"}]}'

curl -s localhost:3000/planificacion/visitas/5/items -H "Authorization: Bearer $TOKEN"
```

Esperado: el `GET` devuelve el ítem con `tipo: "accion"` y sus dos destinos de alcance.

- [ ] **Step 3: Probar el duplicado exacto y el alias**

Repetir el `POST` idéntico → 409 `ITEM_DUPLICADO`. Cambiar la marca a `CORVEN` → 200.

```bash
curl -s localhost:3000/planificacion/visitas/5/rubros -H "Authorization: Bearer $TOKEN"
```

Esperado: mismo cuerpo que `/items`. Es el camino que va a usar un teléfono con la PWA vieja.

- [ ] **Step 4: Verificar en la base**

```sql
SELECT i.id, i.tipo, i.codigo, i.detalle, a.tipo AS alcance_tipo, a.codigo AS alcance_codigo
  FROM pl_visita_item i
  LEFT JOIN pl_visita_item_alcance a ON a.visita_item_id = i.id
 WHERE i.resolucion_id = 5;
```

Esperado: `detalle` en NULL en todas las filas — **ningún código la escribe todavía**. Si tiene contenido, hay una tarea que se salió del plan.

- [ ] **Step 5: Actualizar la documentación viva**

En `app-planificacion/docs/dominio/tablas.md`: renombrar las secciones a `pl_visita_item` / `pl_visita_item_motivo`, documentar `pl_visita_item_alcance` y `pl_accion`, actualizar el mapa ASCII de arriba, el `nivel` de `pl_motivo` a `visita | item`, y **sumar `pl_visita_rubro` y `pl_visita_rubro_motivo` a la tabla de "Tablas que ya no existen"**.

Explicar ahí por qué el unique se fue y no volvió — es justo el tipo de decisión que ese archivo existe para preservar.

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "docs: tablas del item ofrecido generico en el modelo vivo"
```

---

## Notas de despliegue

1. Ops corre `planificacion-item-generico.sql` contra producción (una sola pasada).
2. Se despliega api-vendedores. **El frontend actual sigue funcionando por los alias.**
3. Recién después va el plan de frontend.
4. Los alias `/rubros` se borran un release **después** de confirmar que no queda ningún teléfono con la PWA vieja pegándoles. Antes de borrarlos, mirar los logs de acceso a esas rutas.
