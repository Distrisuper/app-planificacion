# Plan de rotación editable — backend (api-vendedores)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el plan congelado por ciclo (`pl_ciclo_cliente`) por un plan de rotación editable (`pl_rotacion_cliente`), y volver invisible la transición de ciclo: nadie abre ni cierra semanas a mano.

**Architecture:** Tres capas — template read-only (warehouse/mock) → `pl_rotacion_cliente` (nuestro, editable, una fila por cliente por rotación) → `pl_resolucion` (inmutable). El ciclo pasa a registrar solo *cuándo* se recorrió una semana. Reacomodar es un `UPDATE (semana, dia)` y unifica todos los movimientos.

**Tech Stack:** Node + TypeScript, Express, Sequelize (MySQL `planificacion`), Jest. Warehouse PostgreSQL solo lectura.

**Spec:** `app-planificacion/docs/superpowers/specs/2026-08-10-plan-rotacion-editable-design.md`

**Worktree:** `C:/Users/matia/orca/workspaces/api-vendedores/plan-rotacion-editable` (branch `MatiasH11/plan-rotacion-editable`). Todos los paths de este plan son relativos a esa raíz.

## Global Constraints

- **TZ de negocio:** `America/Argentina/Buenos_Aires`. Nunca la del dispositivo ni la del server.
- **Un ciclo abierto por vendedor:** el `UNIQUE (vendedor_abierto)` de `pl_ciclo_semana` queda.
- **El template no se escribe nunca.** `AgendaRepository.findVisitAssignments` es solo lectura.
- **Una fila con resolución no se mueve.** Regla dura en el repositorio, no solo en la UI.
- **No existe "quitar de la ruta":** todo movimiento tiene destino.
- **Todo movimiento deja bitácora** en `pl_reacomodacion`, incluidos los del vendedor. El `UPDATE` y su fila de log van en la misma transacción.
- **La cantidad de semanas NO es 5.** Sale del set de la rotación. Prohibido `% 5` y prohibido `<= 5`.
- **Cerrar un ciclo NO crea resoluciones.** Los pendientes quedan pendientes.
- **Convención del repo:** repositorios son clases con métodos `static`, cada uno con `try/catch` que lanza `CustomError(500, ...)`, y un mapper `toIXxx` al final del archivo. Modelos Sequelize con `field` explícito y `timestamps: false`. Tests en `*.spec.ts` con `jest.mock` de los repositorios.
- **Correr un test:** `npm test -- <ruta del spec>`. Toda la suite: `npm test`.
- **Resetear la base local** (obligatorio después de tocar el `.sql`, si no el init script no vuelve a correr):
  ```bash
  docker compose -f docker-compose.local.yml down -v
  docker compose -f docker-compose.local.yml up -d
  ```

---

## Estructura de archivos

**Nuevos:**

| archivo | responsabilidad |
|---|---|
| `src/services/planificacion/semanaLaboral.ts` | `lunesDeLaSemana()` — la única implementación de "a qué semana laboral pertenece este instante" |
| `src/models/planificacion/Rotacion.ts` | modelo de `pl_rotacion` |
| `src/models/planificacion/RotacionCliente.ts` | modelo de `pl_rotacion_cliente` |
| `src/models/planificacion/Reacomodacion.ts` | modelo de `pl_reacomodacion` — la bitácora de movimientos |
| `src/repositories/RotacionRepository.ts` | CRUD de rotaciones + qué semanas ya se hicieron |
| `src/repositories/RotacionClienteRepository.ts` | el plan: materializar, leer por semana, mover, pendientes |
| `src/services/planificacion/RotacionService.ts` | materializar desde el template, set de semanas, proponer semana, sincronizar padrón |
| `docs/db-notes/planificacion-migracion-rotacion.sql` | migración de producción (Task 12, se escribe al final) |

**Modificados:**

| archivo | qué cambia |
|---|---|
| `docs/db-notes/planificacion-ciclo-tables.sql` | esquema consolidado nuevo |
| `src/types/planificacion.ts` | tipos nuevos; `cicloClienteId` → `rotacionClienteId`; se van `'reagendada'` y `enPlan` |
| `src/models/planificacion/CicloSemana.ts` | `rotacionId`, `fechaLunes` |
| `src/models/planificacion/Resolucion.ts` | `rotacionClienteId` |
| `src/services/planificacion/CicloService.ts` | `asegurar()`, `cerrar()`, `sincronizar()`; se va `abrir()`/`preview()` como acciones del vendedor |
| `src/services/planificacion/estadoCicloCliente.ts` | se va el caso `'reagendada'` |
| `src/services/planificacion/AgendaService.ts` | lee el plan de la rotación |
| `src/services/planificacion/VisitasService.ts` | `reacomodar()` reemplaza `reagendar()` |
| `src/services/planificacion/RubrosService.ts` | el guard pasa a "la resolución es tuya" |
| `src/repositories/AnaliticaRepository.ts` | queries contra `pl_rotacion_cliente`, sin `en_plan` |
| `src/services/planificacion/indicadores/cobertura.ts` | se va `reagendados` |
| `src/controllers/planificacionController.ts` | validación de semana por pertenencia al set |
| `src/routes/planificacion.ts` | rutas nuevas |

**Se eliminan:** `src/models/planificacion/CicloCliente.ts`, `src/repositories/CicloClienteRepository.ts` (y sus specs).

---

### Task 1: `lunesDeLaSemana` — la semana laboral en TZ de negocio

Primero esto porque no depende de nada y todo lo demás lo usa. Es una función pura: TDD limpio.

**Files:**
- Create: `src/services/planificacion/semanaLaboral.ts`
- Test: `src/services/planificacion/semanaLaboral.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `lunesDeLaSemana(d: Date): string` → `'YYYY-MM-DD'`, el lunes de la semana laboral a la que pertenece `d`, resuelto en `America/Argentina/Buenos_Aires`. Sábado y domingo **redondean hacia adelante** al lunes siguiente.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/planificacion/semanaLaboral.spec.ts
import { lunesDeLaSemana } from './semanaLaboral'

describe('lunesDeLaSemana', () => {
    it('un miércoles devuelve el lunes de esa semana', () => {
        // 2026-08-05 es miércoles. 15:00 UTC = 12:00 en Buenos Aires.
        expect(lunesDeLaSemana(new Date('2026-08-05T15:00:00.000Z'))).toBe('2026-08-03')
    })

    it('el lunes se devuelve a sí mismo', () => {
        expect(lunesDeLaSemana(new Date('2026-08-03T12:00:00.000Z'))).toBe('2026-08-03')
    })

    it('el viernes sigue perteneciendo a su semana', () => {
        expect(lunesDeLaSemana(new Date('2026-08-07T20:00:00.000Z'))).toBe('2026-08-03')
    })

    // El caso que motiva la función: la semana laboral es lunes a viernes, así que el
    // fin de semana redondea HACIA ADELANTE. Un ciclo abierto el domingo pertenece a la
    // semana que arranca al día siguiente, no a la que ya terminó.
    it('el sábado redondea al lunes siguiente', () => {
        expect(lunesDeLaSemana(new Date('2026-08-08T14:00:00.000Z'))).toBe('2026-08-10')
    })

    it('el domingo 23:30 de Buenos Aires pertenece a la semana que arranca al día siguiente', () => {
        // 2026-08-10T02:30Z = domingo 2026-08-09 23:30 en Buenos Aires (UTC-3).
        // Con la TZ del server (UTC) daría lunes 10 por accidente; con la de negocio
        // da lunes 10 por la regla del fin de semana. El test que discrimina es el de abajo.
        expect(lunesDeLaSemana(new Date('2026-08-10T02:30:00.000Z'))).toBe('2026-08-10')
    })

    it('el lunes 00:30 de Buenos Aires ya es de la semana nueva, no del domingo', () => {
        // 2026-08-10T03:30Z = lunes 2026-08-10 00:30 en Buenos Aires.
        expect(lunesDeLaSemana(new Date('2026-08-10T03:30:00.000Z'))).toBe('2026-08-10')
    })

    it('el martes 00:30 UTC sigue siendo lunes en Buenos Aires y NO adelanta la semana', () => {
        // 2026-08-11T02:00Z = lunes 2026-08-10 23:00 en Buenos Aires. Si se calculara en
        // UTC daría martes: mismo lunes igual, pero deja el caso documentado.
        expect(lunesDeLaSemana(new Date('2026-08-11T02:00:00.000Z'))).toBe('2026-08-10')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/planificacion/semanaLaboral.spec.ts`
Expected: FAIL — `Cannot find module './semanaLaboral'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/planificacion/semanaLaboral.ts

/** Zona de negocio. Todas las fechas de calendario del dominio se resuelven acá. */
export const TZ_NEGOCIO = 'America/Argentina/Buenos_Aires'

/**
 * El lunes de la semana laboral a la que pertenece `d`, como 'YYYY-MM-DD'.
 *
 * La semana laboral es lunes a viernes, así que el fin de semana redondea HACIA
 * ADELANTE: un ciclo abierto un domingo pertenece a la semana que arranca al día
 * siguiente, no a la que ya terminó.
 *
 * Se resuelve en TZ de negocio y no con `getDay()`/`getDate()` del server: un
 * domingo 23:30 de Buenos Aires es lunes 02:30 en UTC, y el server corre en UTC.
 */
export function lunesDeLaSemana(d: Date): string {
    const { y, m, dd, dow } = partesEnTz(d)

    // dow: 0 domingo … 6 sábado
    const offset =
        dow === 0 ? 1 // domingo → mañana
        : dow === 6 ? 2 // sábado → pasado mañana
        : 1 - dow // lunes..viernes → atrás hasta el lunes

    // UTC puro para la aritmética: ya trabajamos sobre la fecha civil de negocio,
    // así que no hay DST que corregir (y Argentina no tiene DST).
    const base = Date.UTC(y, m - 1, dd)
    const lunes = new Date(base + offset * 86400000)

    return lunes.toISOString().slice(0, 10)
}

interface PartesFecha {
    y: number
    m: number
    dd: number
    /** 0 domingo … 6 sábado */
    dow: number
}

function partesEnTz(d: Date): PartesFecha {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ_NEGOCIO,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
    })

    const partes: Record<string, string> = {}
    for (const p of fmt.formatToParts(d)) partes[p.type] = p.value

    const DOW: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    }

    return {
        y: Number(partes.year),
        m: Number(partes.month),
        dd: Number(partes.day),
        dow: DOW[partes.weekday],
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/planificacion/semanaLaboral.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/semanaLaboral.ts src/services/planificacion/semanaLaboral.spec.ts
git commit -m "feat(planificacion): lunesDeLaSemana en TZ de negocio"
```

---

### Task 2: Esquema consolidado nuevo

Sin test unitario: el entregable es la base local levantando con el esquema nuevo, y se verifica por introspección. Los ALTER de producción son Task 12.

**Files:**
- Modify: `docs/db-notes/planificacion-ciclo-tables.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tablas `pl_rotacion`, `pl_rotacion_cliente`; `pl_ciclo_semana` con `rotacion_id` + `fecha_lunes`; `pl_resolucion` con `rotacion_cliente_id`. Sin `pl_ciclo_cliente`.

- [ ] **Step 1: Reemplazar los bloques ① y ② del archivo**

Borrar el `CREATE TABLE pl_ciclo_cliente` completo y el `CREATE TABLE pl_ciclo_semana`, y poner en su lugar:

```sql
-- ⓪ La rotación concreta: todas sus semanas, en cualquier orden.
-- El SET de semanas NO se declara: son los valores distintos de `semana` en
-- pl_rotacion_cliente. Así un vendedor de 4 semanas funciona sin configurar nada,
-- y el set queda congelado por construcción al materializar.
CREATE TABLE IF NOT EXISTS pl_rotacion (
  id                         INT AUTO_INCREMENT PRIMARY KEY,
  codigo_particular_vendedor VARCHAR(50) NOT NULL,
  fecha_inicio               DATETIME    NOT NULL,
  fecha_fin                  DATETIME    NULL,      -- se completó

  -- Una sola rotación abierta por vendedor, con el mismo truco de columna generada
  -- que pl_ciclo_semana: MySQL no soporta índices parciales y los NULL no colisionan.
  vendedor_abierta VARCHAR(50)
    AS (IF(fecha_fin IS NULL, codigo_particular_vendedor, NULL)) STORED,

  UNIQUE KEY uq_una_rotacion_abierta (vendedor_abierta),
  INDEX idx_vendedor (codigo_particular_vendedor)
);

-- ① La vuelta concreta por una semana. YA NO TIENE PLAN: registra solo CUÁNDO el
-- vendedor recorrió la semana N de la rotación R. El qué está en pl_rotacion_cliente.
CREATE TABLE IF NOT EXISTS pl_ciclo_semana (
  id                         INT AUTO_INCREMENT PRIMARY KEY,
  rotacion_id                INT         NOT NULL,
  codigo_particular_vendedor VARCHAR(50) NOT NULL,
  semana                     TINYINT     NOT NULL,
  -- La semana laboral (lunes a viernes) a la que pertenece el ciclo, en TZ de negocio.
  -- Es lo que decide cuándo vence, y por eso NO se infiere de fecha_apertura: un ciclo
  -- abierto un viernes viviría hasta el viernes siguiente.
  fecha_lunes                DATE        NOT NULL,
  fecha_apertura             DATETIME    NOT NULL,
  fecha_cierre               DATETIME    NULL,
  estado                     VARCHAR(20) NOT NULL DEFAULT 'abierta',

  vendedor_abierto VARCHAR(50)
    AS (IF(estado = 'abierta', codigo_particular_vendedor, NULL)) STORED,

  UNIQUE KEY uq_un_ciclo_abierto (vendedor_abierto),
  -- Una sola vuelta por semana dentro de una rotación: es lo que hace que
  -- "semanas hechas" sea un COUNT DISTINCT confiable.
  UNIQUE KEY uq_rotacion_semana (rotacion_id, semana),
  INDEX idx_vendedor (codigo_particular_vendedor),
  FOREIGN KEY (rotacion_id) REFERENCES pl_rotacion (id)
);

-- ② EL PLAN. Materializado del template al arrancar la rotación, y EDITABLE:
-- reacomodar es un UPDATE de (semana, dia). Sin `en_plan`: no hay dentro y fuera del
-- plan, hay una fila que está en alguna semana.
CREATE TABLE IF NOT EXISTS pl_rotacion_cliente (
  id                        INT         AUTO_INCREMENT PRIMARY KEY,
  rotacion_id               INT         NOT NULL,
  codigo_particular_cliente VARCHAR(50) NOT NULL,
  semana                    TINYINT     NOT NULL,
  dia                       TINYINT     NOT NULL,

  -- Un cliente, una fila, por rotación. Es lo que hace imposible contarlo dos veces
  -- o perderlo al reacomodar, y lo que vuelve estable el denominador de cobertura.
  UNIQUE KEY uq_rotacion_cliente (rotacion_id, codigo_particular_cliente),
  INDEX idx_semana (rotacion_id, semana),
  FOREIGN KEY (rotacion_id) REFERENCES pl_rotacion (id),

  -- Esta tabla se EDITA con UPDATE, al contrario de los snapshots inmutables del
  -- diseño anterior. Por eso el rango va en la base y no solo en el servicio: un
  -- UPDATE mal armado desde cualquier camino futuro rebota acá.
  CONSTRAINT ck_rc_semana CHECK (semana >= 1),
  CONSTRAINT ck_rc_dia    CHECK (dia BETWEEN 1 AND 5)
);

-- ③ BITÁCORA DE MOVIMIENTOS. Es la diferencia entre lo que dijo el template y lo que
-- realmente pasó: el template se materializa una vez y de ahí en más las filas se
-- mueven, así que sin esto los movimientos son irrastreables.
--
-- Se escribe para TODO movimiento, incluidos los del vendedor. Si solo se auditaran los
-- de gerencia, el historial de una fila quedaría con saltos inexplicables.
--
-- Reemplaza a un `updated_at` en pl_rotacion_cliente: el log ya trae el cuándo, y
-- además el antes, el después y el quién.
CREATE TABLE IF NOT EXISTS pl_reacomodacion (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  rotacion_cliente_id INT          NOT NULL,
  semana_antes        TINYINT      NOT NULL,
  dia_antes           TINYINT      NOT NULL,
  semana_despues      TINYINT      NOT NULL,
  dia_despues         TINYINT      NOT NULL,
  origen              VARCHAR(20)  NOT NULL,  -- 'vendedor' | 'gerencia'
  usuario             VARCHAR(100) NOT NULL,
  fecha               DATETIME     NOT NULL,

  INDEX idx_rotacion_cliente (rotacion_cliente_id),
  INDEX idx_fecha (fecha),
  FOREIGN KEY (rotacion_cliente_id) REFERENCES pl_rotacion_cliente (id)
);
```

**Por qué `pl_reacomodacion` entra en esta entrega y no en el spec 2:** sin ella queda una ventana —desde este deploy hasta la vista de gerencia— en la que el plan es editable y ningún movimiento deja rastro. La tabla y su `INSERT` son baratos; lo que queda para el spec 2 es la pantalla, los permisos y el reporte de excepciones repetidas que se calcula sobre estas filas.

- [ ] **Step 2: Repuntar `pl_resolucion` en el mismo archivo**

En el `CREATE TABLE pl_resolucion`, cambiar la columna y sus constraints:

```sql
  -- antes: ciclo_cliente_id INT NOT NULL  → FK a pl_ciclo_cliente
  rotacion_cliente_id INT NOT NULL,
```

y al pie de esa tabla:

```sql
  -- Una resolución por cliente por rotación. Hace imposible registrar "no visito"
  -- sobre un cliente con visita abierta, sin ningún check-then-act en el servicio.
  UNIQUE KEY uq_resolucion (rotacion_cliente_id),
  FOREIGN KEY (rotacion_cliente_id) REFERENCES pl_rotacion_cliente (id)
```

- [ ] **Step 3: Resetear la base local y verificar**

```bash
docker compose -f docker-compose.local.yml down -v
docker compose -f docker-compose.local.yml up -d
```

Esperar el healthcheck y verificar:

```bash
docker exec api-vendedores-mysql-local mysql -uroot -pdevaokitech planificacion -N -B -e "
SHOW TABLES;
SELECT COUNT(*) AS motivos FROM pl_motivo;
SHOW COLUMNS FROM pl_ciclo_semana LIKE 'fecha_lunes';
SHOW COLUMNS FROM pl_resolucion LIKE 'rotacion_cliente_id';"
```

Expected: aparecen `pl_rotacion` y `pl_rotacion_cliente`, **no** aparece `pl_ciclo_cliente`, `motivos = 10`, y las dos columnas existen.

- [ ] **Step 4: Commit**

```bash
git add docs/db-notes/planificacion-ciclo-tables.sql
git commit -m "feat(planificacion): esquema con plan de rotacion editable"
```

---

### Task 3: Tipos del dominio

**Files:**
- Modify: `src/types/planificacion.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `TipoResolucion = 'visita' | 'no_visita'` (se va `'reagendada'`)
  - `EstadoCicloCliente = 'pendiente' | 'en_curso' | 'visitada' | 'no_visita'`
  - `IRotacion { id, codigoParticularVendedor, fechaInicio, fechaFin }`
  - `IRotacionCliente { id, rotacionId, codigoParticularCliente, semana, dia }`
  - `ICicloSemana` + `rotacionId: number`, `fechaLunes: string`
  - `IResolucion.rotacionClienteId` (era `cicloClienteId`)
  - `IAgendaClient.rotacionClienteId` (era `cicloClienteId`)
  - `IAsegurarCicloResult`, `ISincronizarResult`, `IReacomodarDTO`
  - Se va `ICicloCliente`, se va `IAbrirCicloResult`, se va `ICerrarCicloResult`

- [ ] **Step 1: Aplicar los cambios de tipos**

```typescript
// Reemplazos puntuales dentro de src/types/planificacion.ts

// 'reagendada' se va: reacomodar NO es una resolución, es un UPDATE de la fila del plan.
export type TipoResolucion = 'visita' | 'no_visita'

export type EstadoCicloCliente = 'pendiente' | 'en_curso' | 'visitada' | 'no_visita'

/** La rotación concreta. Abierta mientras fechaFin sea null. */
export interface IRotacion {
    id: number
    codigoParticularVendedor: string
    fechaInicio: string
    fechaFin: string | null
}

/** Una fila del plan de la rotación. Editable: reacomodar mueve (semana, dia). */
export interface IRotacionCliente {
    id: number
    rotacionId: number
    codigoParticularCliente: string
    semana: number
    dia: number // 1..5
}

export interface ICicloSemana {
    id: number
    rotacionId: number
    codigoParticularVendedor: string
    semana: number
    /** 'YYYY-MM-DD', el lunes de su semana laboral. Decide cuándo vence. */
    fechaLunes: string
    fechaApertura: string
    fechaCierre: string | null
    estado: EstadoCiclo
}

export interface IResolucion {
    id: number
    rotacionClienteId: number
    tipo: TipoResolucion
    fechaInicio: string
    fechaFin: string | null
    coordInicio: string | null
    coordFinal: string | null
    coordCliente: string | null
}

export interface IAgendaClient extends IVisitClientCard {
    rotacionClienteId: number
    dia: number
    estado: EstadoCicloCliente
    visitaId: number | null
    rubrosPendientes: number
}

/** Resultado de asegurarCiclo: el ciclo listo para operar, y qué hizo falta hacer. */
export interface IAsegurarCicloResult {
    ciclo: ICicloSemana
    /** true si esta llamada materializó la rotación. */
    rotacionMaterializada: boolean
    /** true si esta llamada cerró un ciclo de otra semana. */
    cicloAnteriorCerrado: boolean
}

/** Lo que hizo `sincronizar`. Todo en cero = no-op. */
export interface ISincronizarResult {
    /** Semana del ciclo que se cerró por vencimiento, o null. */
    semanaCerrada: number | null
    /** Códigos que quedaron sin visitar en el ciclo cerrado. */
    sinVisitar: string[]
    /** Rubros autocompletados con el motivo 16 al cerrar. */
    rubrosAutocompletados: number
    /** Códigos dados de alta en la rotación por el sincronizador de padrón. */
    altas: string[]
    /** Códigos sacados de la rotación por baja del padrón. */
    bajas: string[]
    /** true si al cerrar el ciclo la rotación quedó completa. */
    rotacionCerrada: boolean
}

/** `semana` ausente = mover de día dentro de la misma semana. */
export interface IReacomodarDTO {
    semana?: number
    dia: number
}
```

Borrar `ICicloCliente`, `IAbrirCicloResult` y `ICerrarCicloResult`.

- [ ] **Step 2: Verificar que el compilador marca todo lo que hay que tocar**

Run: `npx tsc --noEmit`
Expected: FAIL con errores en `CicloRepository`, `CicloClienteRepository`, `ResolucionRepository`, `CicloService`, `AgendaService`, `VisitasService`, `estadoCicloCliente`, `AnaliticaRepository` y sus specs. **Esa lista de errores es la lista de trabajo de las tareas siguientes** — copiarla al comentario del commit.

- [ ] **Step 3: Commit**

```bash
git add src/types/planificacion.ts
git commit -m "refactor(planificacion): tipos del plan de rotacion

El build queda roto a proposito: los errores de tsc son la lista de call sites
que las tareas siguientes migran."
```

---

### Task 4: Modelos Sequelize

**Files:**
- Create: `src/models/planificacion/Rotacion.ts`
- Create: `src/models/planificacion/RotacionCliente.ts`
- Modify: `src/models/planificacion/CicloSemana.ts`
- Modify: `src/models/planificacion/Resolucion.ts`
- Delete: `src/models/planificacion/CicloCliente.ts`

**Interfaces:**
- Consumes: `IRotacion`, `IRotacionCliente` (Task 3).
- Produces: los modelos `Rotacion`, `RotacionCliente` con los campos en camelCase mapeados a snake_case.

- [ ] **Step 1: Crear `Rotacion.ts`**

```typescript
// src/models/planificacion/Rotacion.ts
import { Model, DataTypes } from 'sequelize'
import { sequelizeWritePlanificacion } from '../../database/connection'

interface IRotacionAttributes {
    id?: number
    codigoParticularVendedor: string
    fechaInicio: Date
    fechaFin?: Date | null
}

class Rotacion extends Model<IRotacionAttributes> implements IRotacionAttributes {
    public id!: number
    public codigoParticularVendedor!: string
    public fechaInicio!: Date
    public fechaFin?: Date | null
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
        fechaInicio: { type: DataTypes.DATE, allowNull: false, field: 'fecha_inicio' },
        fechaFin: { type: DataTypes.DATE, allowNull: true, field: 'fecha_fin' },
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

- [ ] **Step 2: Crear `RotacionCliente.ts`**

```typescript
// src/models/planificacion/RotacionCliente.ts
import { Model, DataTypes } from 'sequelize'
import { sequelizeWritePlanificacion } from '../../database/connection'

interface IRotacionClienteAttributes {
    id?: number
    rotacionId: number
    codigoParticularCliente: string
    semana: number
    dia: number
}

class RotacionCliente
    extends Model<IRotacionClienteAttributes>
    implements IRotacionClienteAttributes
{
    public id!: number
    public rotacionId!: number
    public codigoParticularCliente!: string
    public semana!: number
    public dia!: number
}

// Sin `en_plan` y sin `estado`: el estado se deriva de pl_resolucion, y no hay
// "fuera del plan" — hay una fila que está en alguna semana.
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
    },
    {
        sequelize: sequelizeWritePlanificacion,
        modelName: 'RotacionCliente',
        tableName: 'pl_rotacion_cliente',
        timestamps: false,
    },
)

export default RotacionCliente
```

- [ ] **Step 3: Agregar `rotacionId` y `fechaLunes` a `CicloSemana.ts`**

En `ICicloSemanaAttributes` y en la clase, agregar `rotacionId: number` y `fechaLunes: string`. En el `init`:

```typescript
        rotacionId: { type: DataTypes.INTEGER, allowNull: false, field: 'rotacion_id' },
        // DATEONLY y no DATE: es una fecha civil de negocio, no un instante. Sequelize
        // la devuelve como 'YYYY-MM-DD' sin convertir zonas, que es exactamente lo que
        // queremos — convertirla la correría un día.
        fechaLunes: { type: DataTypes.DATEONLY, allowNull: false, field: 'fecha_lunes' },
```

- [ ] **Step 4: Renombrar la FK en `Resolucion.ts`**

Cambiar `cicloClienteId` por `rotacionClienteId` en la interfaz, la clase y el `init`, con `field: 'rotacion_cliente_id'`.

- [ ] **Step 5: Borrar el modelo viejo**

```bash
git rm src/models/planificacion/CicloCliente.ts
```

- [ ] **Step 6: Commit**

```bash
git add -A src/models/planificacion
git commit -m "feat(planificacion): modelos Rotacion y RotacionCliente"
```

---

### Task 5: `RotacionRepository`

**Files:**
- Create: `src/repositories/RotacionRepository.ts`
- Test: `src/repositories/RotacionRepository.spec.ts`

**Interfaces:**
- Consumes: modelo `Rotacion` (Task 4), `IRotacion` (Task 3).
- Produces:
  - `RotacionRepository.findAbiertaByVendedor(vendedor: string): Promise<IRotacion | null>`
  - `RotacionRepository.crear(vendedor: string, transaction?: Transaction): Promise<number>`
  - `RotacionRepository.cerrar(rotacionId: number, transaction?: Transaction): Promise<void>`
  - `RotacionRepository.semanasHechas(rotacionId: number): Promise<number[]>` — semanas con ciclo en esa rotación, ordenadas

- [ ] **Step 1: Write the failing test**

```typescript
// src/repositories/RotacionRepository.spec.ts
import { RotacionRepository } from './RotacionRepository'
import Rotacion from '../models/planificacion/Rotacion'
import { sequelizeWritePlanificacion } from '../database/connection'

jest.mock('../models/planificacion/Rotacion')
jest.mock('../database/connection', () => {
    const actual = jest.requireActual('../database/connection')
    return {
        ...actual,
        sequelizeWritePlanificacion: Object.assign(actual.sequelizeWritePlanificacion, {
            query: jest.fn(),
        }),
    }
})

const mockedFindOne = Rotacion.findOne as jest.MockedFunction<typeof Rotacion.findOne>
const mockedCreate = Rotacion.create as jest.MockedFunction<any>
const mockedUpdate = Rotacion.update as jest.MockedFunction<any>
const mockedQuery = sequelizeWritePlanificacion.query as jest.MockedFunction<any>

beforeEach(() => jest.clearAllMocks())

describe('findAbiertaByVendedor', () => {
    it('busca por fechaFin null y mapea la fila', async () => {
        mockedFindOne.mockResolvedValue({
            id: 7,
            codigoParticularVendedor: 'V 2',
            fechaInicio: new Date('2026-08-03T12:12:00.000Z'),
            fechaFin: null,
        } as any)

        const rot = await RotacionRepository.findAbiertaByVendedor('V 2')

        expect(mockedFindOne).toHaveBeenCalledWith({
            where: { codigoParticularVendedor: 'V 2', fechaFin: null },
        })
        expect(rot).toEqual({
            id: 7,
            codigoParticularVendedor: 'V 2',
            fechaInicio: '2026-08-03T12:12:00.000Z',
            fechaFin: null,
        })
    })

    it('devuelve null si no hay rotación abierta', async () => {
        mockedFindOne.mockResolvedValue(null)
        await expect(RotacionRepository.findAbiertaByVendedor('V 2')).resolves.toBeNull()
    })
})

describe('semanasHechas', () => {
    it('devuelve las semanas con ciclo, como números', async () => {
        // mysql2 devuelve los TINYINT como number, pero el COUNT/DISTINCT de un driver
        // puede llegar como string: se castea igual.
        mockedQuery.mockResolvedValue([{ semana: 2 }, { semana: '4' }])

        await expect(RotacionRepository.semanasHechas(7)).resolves.toEqual([2, 4])
    })

    it('una rotación sin ciclos todavía devuelve vacío', async () => {
        mockedQuery.mockResolvedValue([])
        await expect(RotacionRepository.semanasHechas(7)).resolves.toEqual([])
    })
})

describe('cerrar', () => {
    it('sella fechaFin', async () => {
        mockedUpdate.mockResolvedValue([1])
        await RotacionRepository.cerrar(7)

        const [valores, opciones] = mockedUpdate.mock.calls[0]
        expect(valores.fechaFin).toBeInstanceOf(Date)
        expect(opciones.where).toEqual({ id: 7 })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/repositories/RotacionRepository.spec.ts`
Expected: FAIL — `Cannot find module './RotacionRepository'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/repositories/RotacionRepository.ts
import { QueryTypes, Transaction } from 'sequelize'
import Rotacion from '../models/planificacion/Rotacion'
import { sequelizeWritePlanificacion } from '../database/connection'
import { CustomError } from '../utils/errors'
import { IRotacion } from '../types/planificacion'

interface SemanaRow {
    semana: number | string
}

export class RotacionRepository {
    /** Abierta = fechaFin null. Lo garantiza el UNIQUE uq_una_rotacion_abierta. */
    static async findAbiertaByVendedor(vendedor: string): Promise<IRotacion | null> {
        try {
            const row = await Rotacion.findOne({
                where: { codigoParticularVendedor: vendedor, fechaFin: null },
            })
            return row ? toIRotacion(row) : null
        } catch (err) {
            throw new CustomError(500, `Error fetching rotación abierta: ${err}`)
        }
    }

    static async crear(vendedor: string, transaction?: Transaction): Promise<number> {
        try {
            const row = await Rotacion.create(
                { codigoParticularVendedor: vendedor, fechaInicio: new Date() },
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
                { fechaFin: new Date() },
                { where: { id: rotacionId }, ...(transaction ? { transaction } : {}) },
            )
        } catch (err) {
            throw new CustomError(500, `Error cerrando rotación: ${err}`)
        }
    }

    /**
     * Las semanas de la rotación que YA tienen ciclo (abierto o cerrado). Es la
     * contracara de "qué falta": el set esperado sale de pl_rotacion_cliente, y lo que
     * falta es la diferencia. Va en SQL para no traer las filas de ciclo.
     */
    static async semanasHechas(rotacionId: number): Promise<number[]> {
        try {
            const rows = await sequelizeWritePlanificacion.query<SemanaRow>(
                `SELECT DISTINCT semana
                   FROM pl_ciclo_semana
                  WHERE rotacion_id = :rotacionId
                  ORDER BY semana`,
                { replacements: { rotacionId }, type: QueryTypes.SELECT },
            )
            return rows.map(r => Number(r.semana))
        } catch (err) {
            throw new CustomError(500, `Error fetching semanas hechas: ${err}`)
        }
    }
}

function toIRotacion(r: Rotacion): IRotacion {
    return {
        id: r.id,
        codigoParticularVendedor: r.codigoParticularVendedor,
        fechaInicio: r.fechaInicio.toISOString(),
        fechaFin: r.fechaFin ? r.fechaFin.toISOString() : null,
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/repositories/RotacionRepository.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/repositories/RotacionRepository.ts src/repositories/RotacionRepository.spec.ts
git commit -m "feat(planificacion): RotacionRepository"
```

---

### Task 6: `RotacionClienteRepository` — el plan editable

El corazón del cambio. `mover` es la única operación de movimiento del dominio, y la regla de "no se mueve una fila con resolución" **vive acá**, no en el servicio: así ningún camino futuro la puede saltear.

**Files:**
- Create: `src/repositories/RotacionClienteRepository.ts`
- Test: `src/repositories/RotacionClienteRepository.spec.ts`
- Delete: `src/repositories/CicloClienteRepository.ts` y su `.spec.ts`

**Interfaces:**
- Consumes: modelo `RotacionCliente` (Task 4), `IRotacionCliente` (Task 3).
- Produces:
  - `crearMuchos(rotacionId, items: PlanItem[], transaction?): Promise<void>` con `PlanItem { codigoParticularCliente: string; semana: number; dia: number }`
  - `findByRotacionYSemana(rotacionId, semana): Promise<IRotacionCliente[]>`
  - `findById(id): Promise<IRotacionCliente | null>`
  - `findByRotacion(rotacionId): Promise<IRotacionCliente[]>`
  - `semanasDelSet(rotacionId): Promise<number[]>`
  - `type OrigenMovimiento = 'vendedor' | 'gerencia'`
  - `mover(id, semana, dia, origen: OrigenMovimiento, usuario: string): Promise<void>` — lanza `CustomError(409, …, { code: 'FILA_RESUELTA' })` si la fila tiene resolución; escribe `pl_reacomodacion` en la misma transacción
  - `findCodigosSinResolver(rotacionId, semana): Promise<string[]>`
  - `eliminarSinResolver(rotacionId, codigos: string[], semanas: number[]): Promise<string[]>` — los códigos **efectivamente** borrados

**Nota:** este task también crea `src/models/planificacion/Reacomodacion.ts`, con el mismo patrón que los modelos de la Task 4 (`fecha` como `DataTypes.DATE`, el resto `TINYINT`/`STRING`, `tableName: 'pl_reacomodacion'`, `timestamps: false`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/repositories/RotacionClienteRepository.spec.ts
import { RotacionClienteRepository } from './RotacionClienteRepository'
import RotacionCliente from '../models/planificacion/RotacionCliente'
import { sequelizeWritePlanificacion } from '../database/connection'

jest.mock('../models/planificacion/RotacionCliente')
jest.mock('../models/planificacion/Reacomodacion')
jest.mock('../database/connection', () => {
    const actual = jest.requireActual('../database/connection')
    return {
        ...actual,
        sequelizeWritePlanificacion: Object.assign(actual.sequelizeWritePlanificacion, {
            query: jest.fn(),
            // La transacción se ejecuta de una: el callback corre y se devuelve su
            // resultado. Mismo patrón que CicloService.spec.ts.
            transaction: jest.fn(async (cb: any) => cb({ id: 'tx' })),
        }),
    }
})

const mockedBulkCreate = RotacionCliente.bulkCreate as jest.MockedFunction<any>
const mockedFindAll = RotacionCliente.findAll as jest.MockedFunction<any>
const mockedFindByPk = RotacionCliente.findByPk as jest.MockedFunction<any>
const mockedUpdate = RotacionCliente.update as jest.MockedFunction<any>
const mockedDestroy = RotacionCliente.destroy as jest.MockedFunction<any>
const mockedCrearReacomodacion = Reacomodacion.create as jest.MockedFunction<any>
const mockedQuery = sequelizeWritePlanificacion.query as jest.MockedFunction<any>

beforeEach(() => jest.clearAllMocks())

describe('crearMuchos', () => {
    it('materializa el plan con semana y dia por fila', async () => {
        mockedBulkCreate.mockResolvedValue([])

        await RotacionClienteRepository.crearMuchos(7, [
            { codigoParticularCliente: '6836', semana: 2, dia: 1 },
            { codigoParticularCliente: '7750', semana: 4, dia: 2 },
        ])

        expect(mockedBulkCreate).toHaveBeenCalledWith(
            [
                { rotacionId: 7, codigoParticularCliente: '6836', semana: 2, dia: 1 },
                { rotacionId: 7, codigoParticularCliente: '7750', semana: 4, dia: 2 },
            ],
            undefined,
        )
    })
})

describe('semanasDelSet', () => {
    it('el set de la rotación sale de sus propias filas', async () => {
        // Un vendedor de 4 semanas: nunca aparece la 5, y no hace falta declararlo.
        mockedQuery.mockResolvedValue([
            { semana: 1 }, { semana: 2 }, { semana: 3 }, { semana: 4 },
        ])

        await expect(RotacionClienteRepository.semanasDelSet(7)).resolves.toEqual([1, 2, 3, 4])
    })

    it('soporta un set no contiguo', async () => {
        mockedQuery.mockResolvedValue([{ semana: 1 }, { semana: 2 }, { semana: 3 }, { semana: 5 }])
        await expect(RotacionClienteRepository.semanasDelSet(7)).resolves.toEqual([1, 2, 3, 5])
    })
})

describe('mover', () => {
    const fila103 = {
        id: 103, rotacionId: 7, codigoParticularCliente: '4412', semana: 2, dia: 3,
    }

    it('actualiza semana y dia cuando la fila no tiene resolución', async () => {
        mockedFindByPk.mockResolvedValue(fila103 as any)
        mockedQuery.mockResolvedValue([]) // sin resolución
        mockedUpdate.mockResolvedValue([1])

        await RotacionClienteRepository.mover(103, 4, 1, 'vendedor', 'matias')

        expect(mockedUpdate).toHaveBeenCalledWith(
            { semana: 4, dia: 1 },
            { where: { id: 103 }, transaction: expect.anything() },
        )
    })

    it('deja bitácora con el antes y el después, en la misma transacción', async () => {
        mockedFindByPk.mockResolvedValue(fila103 as any)
        mockedQuery.mockResolvedValue([])
        mockedUpdate.mockResolvedValue([1])
        mockedCrearReacomodacion.mockResolvedValue({ id: 301 } as any)

        await RotacionClienteRepository.mover(103, 4, 1, 'gerencia', 'jperez')

        const [valores] = mockedCrearReacomodacion.mock.calls[0]
        expect(valores).toMatchObject({
            rotacionClienteId: 103,
            semanaAntes: 2,
            diaAntes: 3,
            semanaDespues: 4,
            diaDespues: 1,
            origen: 'gerencia',
            usuario: 'jperez',
        })
    })

    it('RECHAZA mover una fila que ya tiene resolución', async () => {
        // El hecho ya ocurrió y no se reescribe. La regla vive en el repositorio para
        // que ningún camino futuro pueda saltearla.
        mockedFindByPk.mockResolvedValue(fila103 as any)
        mockedQuery.mockResolvedValue([{ id: 51 }])

        await expect(
            RotacionClienteRepository.mover(103, 4, 1, 'vendedor', 'matias'),
        ).rejects.toMatchObject({
            statusCode: 409,
            details: { code: 'FILA_RESUELTA' },
        })
        expect(mockedUpdate).not.toHaveBeenCalled()
        expect(mockedCrearReacomodacion).not.toHaveBeenCalled()
    })
})

describe('eliminarSinResolver', () => {
    it('devuelve los códigos EFECTIVAMENTE borrados, no los candidatos', async () => {
        // 2088 es elegible; 6836 tiene resolución y no aparece en el SELECT. Reportar
        // los dos haría que el aviso al vendedor mienta.
        mockedQuery.mockResolvedValueOnce([
            { id: 107, codigo_particular_cliente: '2088' },
        ])
        mockedQuery.mockResolvedValueOnce([]) // DELETE de bitácora
        mockedDestroy.mockResolvedValue(1)

        const borrados = await RotacionClienteRepository.eliminarSinResolver(
            7, ['2088', '6836'], [1, 3, 4],
        )

        expect(borrados).toEqual(['2088'])
        expect(mockedDestroy).toHaveBeenCalledWith({ where: { id: [107] } })
    })

    it('sin candidatos elegibles no borra nada y devuelve vacío', async () => {
        mockedQuery.mockResolvedValueOnce([])

        await expect(
            RotacionClienteRepository.eliminarSinResolver(7, ['6836'], [1]),
        ).resolves.toEqual([])
        expect(mockedDestroy).not.toHaveBeenCalled()
    })

    it('con listas vacías no toca la base', async () => {
        await expect(
            RotacionClienteRepository.eliminarSinResolver(7, [], [1, 2]),
        ).resolves.toEqual([])
        expect(mockedQuery).not.toHaveBeenCalled()
    })
})

describe('findCodigosSinResolver', () => {
    it('pide los pendientes de una semana concreta de la rotación', async () => {
        mockedQuery.mockResolvedValue([{ codigo_particular_cliente: '6612' }])

        const res = await RotacionClienteRepository.findCodigosSinResolver(7, 2)

        expect(res).toEqual(['6612'])
        const [sql, opts] = mockedQuery.mock.calls[0]
        expect(sql).toContain('rc.rotacion_id = :rotacionId')
        expect(sql).toContain('rc.semana = :semana')
        // Una visita en curso NO cuenta como resuelta: si contara, se podría cerrar la
        // semana con visitas a medio hacer.
        expect(sql).toContain('r.fecha_fin IS NULL')
        expect(opts.replacements).toEqual({ rotacionId: 7, semana: 2 })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/repositories/RotacionClienteRepository.spec.ts`
Expected: FAIL — `Cannot find module './RotacionClienteRepository'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/repositories/RotacionClienteRepository.ts
import { QueryTypes, Transaction } from 'sequelize'
import RotacionCliente from '../models/planificacion/RotacionCliente'
import { sequelizeWritePlanificacion } from '../database/connection'
import { CustomError } from '../utils/errors'
import { IRotacionCliente } from '../types/planificacion'

export interface PlanItem {
    codigoParticularCliente: string
    semana: number
    dia: number
}

interface CodigoRow {
    codigo_particular_cliente: string
}

interface SemanaRow {
    semana: number | string
}

interface IdRow {
    id: number
}

export class RotacionClienteRepository {
    /** Materializa el plan de la rotación desde el template. Una fila por cliente. */
    static async crearMuchos(
        rotacionId: number,
        items: PlanItem[],
        transaction?: Transaction,
    ): Promise<void> {
        try {
            await RotacionCliente.bulkCreate(
                items.map(i => ({
                    rotacionId,
                    codigoParticularCliente: i.codigoParticularCliente,
                    semana: i.semana,
                    dia: i.dia,
                })),
                transaction ? { transaction } : undefined,
            )
        } catch (err) {
            throw new CustomError(500, `Error materializando el plan: ${err}`)
        }
    }

    static async findByRotacion(rotacionId: number): Promise<IRotacionCliente[]> {
        try {
            const rows = await RotacionCliente.findAll({ where: { rotacionId } })
            return rows.map(toIRotacionCliente)
        } catch (err) {
            throw new CustomError(500, `Error fetching plan de la rotación: ${err}`)
        }
    }

    static async findByRotacionYSemana(
        rotacionId: number,
        semana: number,
    ): Promise<IRotacionCliente[]> {
        try {
            const rows = await RotacionCliente.findAll({ where: { rotacionId, semana } })
            return rows.map(toIRotacionCliente)
        } catch (err) {
            throw new CustomError(500, `Error fetching plan de la semana: ${err}`)
        }
    }

    static async findById(id: number): Promise<IRotacionCliente | null> {
        try {
            const row = await RotacionCliente.findByPk(id)
            return row ? toIRotacionCliente(row) : null
        } catch (err) {
            throw new CustomError(500, `Error fetching fila del plan: ${err}`)
        }
    }

    /**
     * El SET de semanas de la rotación: los valores distintos de `semana` en sus
     * propias filas. NO son siempre 5 — un vendedor cuyo template no tiene `s5*` tiene
     * cuatro — y no son necesariamente contiguas. Congelado por construcción: se
     * materializó una vez y el template no vuelve a leerse.
     */
    static async semanasDelSet(rotacionId: number): Promise<number[]> {
        try {
            const rows = await sequelizeWritePlanificacion.query<SemanaRow>(
                `SELECT DISTINCT semana
                   FROM pl_rotacion_cliente
                  WHERE rotacion_id = :rotacionId
                  ORDER BY semana`,
                { replacements: { rotacionId }, type: QueryTypes.SELECT },
            )
            return rows.map(r => Number(r.semana))
        } catch (err) {
            throw new CustomError(500, `Error fetching set de semanas: ${err}`)
        }
    }

    /**
     * Reacomodar: LA operación de movimiento del dominio. Mover de día, pasar de
     * semana, traer un día de otra zona e intercambiar días son todos esto.
     *
     * Rechaza mover una fila con resolución: el hecho ya ocurrió y no se reescribe.
     * La regla vive acá y no en el servicio para que ningún camino futuro la saltee.
     *
     * El UPDATE y su fila de bitácora van en UNA transacción: un movimiento sin rastro
     * es indistinguible de un dato mal materializado, y es lo que después alimenta el
     * reporte de excepciones repetidas.
     */
    static async mover(
        id: number,
        semana: number,
        dia: number,
        origen: OrigenMovimiento,
        usuario: string,
    ): Promise<void> {
        const fila = await RotacionClienteRepository.findById(id)
        if (!fila) {
            throw new CustomError(404, 'Cliente no encontrado en el plan.', {
                code: 'FILA_NOT_FOUND',
            })
        }

        const resueltas = await sequelizeWritePlanificacion.query<IdRow>(
            `SELECT id FROM pl_resolucion WHERE rotacion_cliente_id = :id LIMIT 1`,
            { replacements: { id }, type: QueryTypes.SELECT },
        )

        if (resueltas.length > 0) {
            throw new CustomError(
                409,
                'Este cliente ya se resolvió en esta vuelta, así que no se puede mover.',
                { code: 'FILA_RESUELTA' },
            )
        }

        try {
            await sequelizeWritePlanificacion.transaction(async transaction => {
                await RotacionCliente.update(
                    { semana, dia },
                    { where: { id }, transaction },
                )
                await Reacomodacion.create(
                    {
                        rotacionClienteId: id,
                        semanaAntes: fila.semana,
                        diaAntes: fila.dia,
                        semanaDespues: semana,
                        diaDespues: dia,
                        origen,
                        usuario,
                        fecha: new Date(),
                    },
                    { transaction },
                )
            })
        } catch (err) {
            throw new CustomError(500, `Error reacomodando: ${err}`)
        }
    }

    /**
     * Códigos de una semana de la rotación sin resolver: sin resolución, o con una
     * visita todavía abierta (`fecha_fin IS NULL`).
     *
     * Es la contracara en SQL de `derivarEstado()` (estadoCicloCliente.ts): acá cuenta
     * como resuelto todo lo que allá NO cae en `pendiente` ni `en_curso`. Va en SQL
     * para no traer las ~40 filas.
     */
    static async findCodigosSinResolver(
        rotacionId: number,
        semana: number,
    ): Promise<string[]> {
        try {
            const rows = await sequelizeWritePlanificacion.query<CodigoRow>(
                `SELECT rc.codigo_particular_cliente
                   FROM pl_rotacion_cliente rc
                   LEFT JOIN pl_resolucion r ON r.rotacion_cliente_id = rc.id
                  WHERE rc.rotacion_id = :rotacionId
                    AND rc.semana = :semana
                    AND (r.id IS NULL OR r.fecha_fin IS NULL)
                  ORDER BY rc.dia, rc.id`,
                { replacements: { rotacionId, semana }, type: QueryTypes.SELECT },
            )
            return rows.map(r => r.codigo_particular_cliente)
        } catch (err) {
            throw new CustomError(500, `Error fetching pendientes: ${err}`)
        }
    }

    /**
     * Saca de la rotación los clientes dados de baja en el padrón, y SOLO si no tienen
     * resolución y su semana está entre las habilitadas (las que no cerraron). Las dos
     * condiciones son lo que hace idempotente al sincronizador de padrón: no puede
     * pisar trabajo hecho ni cambiarle la cobertura a una semana ya reportada.
     *
     * Devuelve los códigos EFECTIVAMENTE borrados, no los candidatos. De 5 candidatos
     * puede borrar 1 —los otros tienen resolución o están en semanas cerradas— y el
     * aviso al vendedor tiene que decir la verdad. Por eso se seleccionan primero los
     * ids elegibles y después se borra por id, en vez de confiar en `affectedRows`, que
     * además cambia de forma según el driver.
     */
    static async eliminarSinResolver(
        rotacionId: number,
        codigos: string[],
        semanas: number[],
    ): Promise<string[]> {
        if (codigos.length === 0 || semanas.length === 0) return []

        try {
            const elegibles = await sequelizeWritePlanificacion.query<{
                id: number
                codigo_particular_cliente: string
            }>(
                `SELECT rc.id, rc.codigo_particular_cliente
                   FROM pl_rotacion_cliente rc
                   LEFT JOIN pl_resolucion r ON r.rotacion_cliente_id = rc.id
                  WHERE rc.rotacion_id = :rotacionId
                    AND rc.codigo_particular_cliente IN (:codigos)
                    AND rc.semana IN (:semanas)
                    AND r.id IS NULL`,
                { replacements: { rotacionId, codigos, semanas }, type: QueryTypes.SELECT },
            )

            if (elegibles.length === 0) return []

            // La bitácora referencia pl_rotacion_cliente, así que sus filas se van con la
            // baja: un movimiento de un cliente que ya no está en la rotación no tiene a
            // qué apuntar. Va antes del DELETE para no chocar con la FK.
            const ids = elegibles.map(e => e.id)
            await sequelizeWritePlanificacion.query(
                `DELETE FROM pl_reacomodacion WHERE rotacion_cliente_id IN (:ids)`,
                { replacements: { ids } },
            )
            await RotacionCliente.destroy({ where: { id: ids } })

            return elegibles.map(e => e.codigo_particular_cliente)
        } catch (err) {
            throw new CustomError(500, `Error dando de baja del plan: ${err}`)
        }
    }
}

function toIRotacionCliente(r: RotacionCliente): IRotacionCliente {
    return {
        id: r.id,
        rotacionId: r.rotacionId,
        codigoParticularCliente: r.codigoParticularCliente,
        semana: r.semana,
        dia: r.dia,
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/repositories/RotacionClienteRepository.spec.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Borrar el repositorio viejo**

```bash
git rm src/repositories/CicloClienteRepository.ts src/repositories/CicloClienteRepository.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add -A src/repositories
git commit -m "feat(planificacion): RotacionClienteRepository con mover() como unica operacion

Reemplaza CicloClienteRepository. La regla de no mover una fila con resolucion
vive en el repositorio, no en el servicio."
```

---

### Task 7: `RotacionService.materializar` y `proponerSemana`

**Files:**
- Create: `src/services/planificacion/RotacionService.ts`
- Test: `src/services/planificacion/RotacionService.spec.ts`

**Interfaces:**
- Consumes: `RotacionRepository` (Task 5), `RotacionClienteRepository` (Task 6), `AgendaRepository.findVisitAssignments`, `ClientRepository.getVisitCardsByParticularCodes`.
- Produces:
  - `RotacionService.leerTemplate(vendedor): Promise<{ validas: PlanItem[]; omitidos: string[] }>`
  - `RotacionService.materializar(vendedor, transaction?): Promise<number>` — id de la rotación nueva
  - `RotacionService.asegurarRotacion(vendedor, transaction?): Promise<{ rotacionId: number; materializada: boolean }>`
  - `RotacionService.semanasPendientes(rotacionId): Promise<number[]>`
  - `RotacionService.proponerSemana(rotacionId): Promise<number>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/planificacion/RotacionService.spec.ts
import { RotacionService } from './RotacionService'
import { RotacionRepository } from '../../repositories/RotacionRepository'
import { RotacionClienteRepository } from '../../repositories/RotacionClienteRepository'
import { AgendaRepository } from '../../repositories/AgendaRepository'
import { ClientRepository } from '../../repositories/ClientRepository'

jest.mock('../../repositories/RotacionRepository')
jest.mock('../../repositories/RotacionClienteRepository')
jest.mock('../../repositories/AgendaRepository')
jest.mock('../../repositories/ClientRepository')

const mockedAssignments = AgendaRepository.findVisitAssignments as jest.MockedFunction<
    typeof AgendaRepository.findVisitAssignments
>
const mockedCards = ClientRepository.getVisitCardsByParticularCodes as jest.MockedFunction<
    typeof ClientRepository.getVisitCardsByParticularCodes
>
const mockedCrearRotacion = RotacionRepository.crear as jest.MockedFunction<
    typeof RotacionRepository.crear
>
const mockedFindAbierta = RotacionRepository.findAbiertaByVendedor as jest.MockedFunction<
    typeof RotacionRepository.findAbiertaByVendedor
>
const mockedSemanasHechas = RotacionRepository.semanasHechas as jest.MockedFunction<
    typeof RotacionRepository.semanasHechas
>
const mockedCrearMuchos = RotacionClienteRepository.crearMuchos as jest.MockedFunction<
    typeof RotacionClienteRepository.crearMuchos
>
const mockedSemanasDelSet = RotacionClienteRepository.semanasDelSet as jest.MockedFunction<
    typeof RotacionClienteRepository.semanasDelSet
>

/** Card mínima: materializar solo usa la EXISTENCIA en el padrón, no los campos. */
const card = (codigo: string) => [codigo, { codigoParticularCliente: codigo } as any] as const

beforeEach(() => jest.clearAllMocks())

describe('leerTemplate', () => {
    it('parsea sNdM a (semana, dia) y separa los que no están en el padrón', async () => {
        mockedAssignments.mockReturnValue([
            { codigoParticularCliente: '6836', visit: 's2d1' },
            { codigoParticularCliente: '7750', visit: 's4d2' },
            { codigoParticularCliente: '9999', visit: 's1d1' }, // no está en fct_clients
        ])
        mockedCards.mockResolvedValue(new Map([card('6836'), card('7750')]) as any)

        const { validas, omitidos } = await RotacionService.leerTemplate('V 2')

        expect(validas).toEqual([
            { codigoParticularCliente: '6836', semana: 2, dia: 1 },
            { codigoParticularCliente: '7750', semana: 4, dia: 2 },
        ])
        expect(omitidos).toEqual(['9999'])
    })

    it('descarta asignaciones con forma inválida en vez de romper', async () => {
        // Dato malo del insumo externo: se descarta y se reporta como omitido, porque
        // una fila con dia NaN reventaría el INSERT de toda la materialización.
        mockedAssignments.mockReturnValue([
            { codigoParticularCliente: '6836', visit: 'basura' },
            { codigoParticularCliente: '7750', visit: 's4d2' },
        ])
        mockedCards.mockResolvedValue(new Map([card('6836'), card('7750')]) as any)

        const { validas, omitidos } = await RotacionService.leerTemplate('V 2')

        expect(validas).toEqual([{ codigoParticularCliente: '7750', semana: 4, dia: 2 }])
        expect(omitidos).toEqual(['6836'])
    })
})

describe('materializar', () => {
    it('crea la rotación y le vuelca el plan entero, con todas las semanas', async () => {
        mockedAssignments.mockReturnValue([
            { codigoParticularCliente: '6836', visit: 's2d1' },
            { codigoParticularCliente: '7750', visit: 's4d2' },
        ])
        mockedCards.mockResolvedValue(new Map([card('6836'), card('7750')]) as any)
        mockedCrearRotacion.mockResolvedValue(7)

        const id = await RotacionService.materializar('V 2')

        expect(id).toBe(7)
        expect(mockedCrearMuchos).toHaveBeenCalledWith(
            7,
            [
                { codigoParticularCliente: '6836', semana: 2, dia: 1 },
                { codigoParticularCliente: '7750', semana: 4, dia: 2 },
            ],
            undefined,
        )
    })

    it('rechaza materializar sin ningún cliente válido', async () => {
        mockedAssignments.mockReturnValue([])
        mockedCards.mockResolvedValue(new Map() as any)

        await expect(RotacionService.materializar('V 2')).rejects.toMatchObject({
            statusCode: 422,
            details: { code: 'ROTACION_SIN_CLIENTES' },
        })
        expect(mockedCrearRotacion).not.toHaveBeenCalled()
    })
})

describe('semanasPendientes y proponerSemana', () => {
    it('pendientes = set de la rotación menos las que ya tienen ciclo', async () => {
        mockedSemanasDelSet.mockResolvedValue([1, 2, 3, 4])
        mockedSemanasHechas.mockResolvedValue([2])

        await expect(RotacionService.semanasPendientes(7)).resolves.toEqual([1, 3, 4])
    })

    it('un vendedor de 4 semanas nunca tiene la 5 pendiente', async () => {
        mockedSemanasDelSet.mockResolvedValue([1, 2, 3, 4])
        mockedSemanasHechas.mockResolvedValue([1, 2, 3])

        await expect(RotacionService.semanasPendientes(7)).resolves.toEqual([4])
        await expect(RotacionService.proponerSemana(7)).resolves.toBe(4)
    })

    it('un set no contiguo propone la que falta y no la siguiente por número', async () => {
        mockedSemanasDelSet.mockResolvedValue([1, 2, 3, 5])
        mockedSemanasHechas.mockResolvedValue([1, 2, 3])

        // Con la vieja aritmética (última % 5) + 1 hubiera propuesto la 4, que este
        // vendedor no tiene.
        await expect(RotacionService.proponerSemana(7)).resolves.toBe(5)
    })

    it('propone la más chica de las pendientes cuando faltan varias', async () => {
        mockedSemanasDelSet.mockResolvedValue([1, 2, 3, 4, 5])
        mockedSemanasHechas.mockResolvedValue([3])

        await expect(RotacionService.proponerSemana(7)).resolves.toBe(1)
    })
})

describe('asegurarRotacion', () => {
    it('devuelve la abierta sin materializar nada', async () => {
        mockedFindAbierta.mockResolvedValue({
            id: 7, codigoParticularVendedor: 'V 2',
            fechaInicio: '2026-08-03T12:00:00.000Z', fechaFin: null,
        })

        await expect(RotacionService.asegurarRotacion('V 2')).resolves.toEqual({
            rotacionId: 7,
            materializada: false,
        })
        expect(mockedCrearRotacion).not.toHaveBeenCalled()
    })

    it('materializa si no hay rotación abierta', async () => {
        mockedFindAbierta.mockResolvedValue(null)
        mockedAssignments.mockReturnValue([
            { codigoParticularCliente: '6836', visit: 's2d1' },
        ])
        mockedCards.mockResolvedValue(new Map([card('6836')]) as any)
        mockedCrearRotacion.mockResolvedValue(9)

        await expect(RotacionService.asegurarRotacion('V 2')).resolves.toEqual({
            rotacionId: 9,
            materializada: true,
        })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/planificacion/RotacionService.spec.ts`
Expected: FAIL — `Cannot find module './RotacionService'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/planificacion/RotacionService.ts
import { Transaction } from 'sequelize'
import { CustomError } from '../../utils/errors'
import { RotacionRepository } from '../../repositories/RotacionRepository'
import {
    RotacionClienteRepository,
    PlanItem,
} from '../../repositories/RotacionClienteRepository'
import { AgendaRepository } from '../../repositories/AgendaRepository'
import { ClientRepository } from '../../repositories/ClientRepository'

/** 's2d1' → semana 2, día 1. Es la forma del campo `visit` del template. */
const RE_VISIT = /^s(\d+)d(\d+)$/

export class RotacionService {
    /**
     * Lee el template (read-only) y lo valida contra el padrón.
     *
     * Devuelve `omitidos` en vez de descartar en silencio, tanto para los códigos que
     * no están en fct_clients como para los que traen una asignación con forma
     * inválida: una fila con `dia` NaN reventaría el INSERT de toda la materialización.
     */
    static async leerTemplate(
        vendedor: string,
    ): Promise<{ validas: PlanItem[]; omitidos: string[] }> {
        const asignaciones = AgendaRepository.findVisitAssignments(vendedor)
        const codigos = asignaciones.map(a => a.codigoParticularCliente)
        const cards = await ClientRepository.getVisitCardsByParticularCodes(codigos)

        const validas: PlanItem[] = []
        const omitidos: string[] = []

        for (const a of asignaciones) {
            const m = RE_VISIT.exec(a.visit)
            if (!m || !cards.has(a.codigoParticularCliente)) {
                omitidos.push(a.codigoParticularCliente)
                continue
            }
            validas.push({
                codigoParticularCliente: a.codigoParticularCliente,
                semana: Number(m[1]),
                dia: Number(m[2]),
            })
        }

        return { validas, omitidos }
    }

    /**
     * Abre una rotación y materializa su plan desde el template.
     *
     * Es el ÚNICO momento en que se lee el template. De ahí en más el plan es nuestro y
     * editable, y un cambio de slot en el origen aplica en la próxima materialización.
     * Por eso el set de semanas de la rotación queda congelado sin declararlo.
     */
    static async materializar(vendedor: string, transaction?: Transaction): Promise<number> {
        const { validas } = await RotacionService.leerTemplate(vendedor)

        if (validas.length === 0) {
            throw new CustomError(
                422,
                'No hay clientes asignados a este vendedor en la hoja de ruta.',
                { code: 'ROTACION_SIN_CLIENTES' },
            )
        }

        const rotacionId = await RotacionRepository.crear(vendedor, transaction)
        await RotacionClienteRepository.crearMuchos(rotacionId, validas, transaction)

        return rotacionId
    }

    static async asegurarRotacion(
        vendedor: string,
        transaction?: Transaction,
    ): Promise<{ rotacionId: number; materializada: boolean }> {
        const abierta = await RotacionRepository.findAbiertaByVendedor(vendedor)
        if (abierta) return { rotacionId: abierta.id, materializada: false }

        const rotacionId = await RotacionService.materializar(vendedor, transaction)
        return { rotacionId, materializada: true }
    }

    /** Las semanas del set que todavía no tienen ciclo en esta rotación. */
    static async semanasPendientes(rotacionId: number): Promise<number[]> {
        const set = await RotacionClienteRepository.semanasDelSet(rotacionId)
        const hechas = new Set(await RotacionRepository.semanasHechas(rotacionId))
        return set.filter(s => !hechas.has(s))
    }

    /**
     * La más chica de las pendientes. NO es `(última % 5) + 1`: esa aritmética asume
     * cinco semanas contiguas, así que saltear una la dejaba una vuelta entera sin
     * visitar, y a un vendedor de cuatro semanas le proponía una quinta inexistente.
     */
    static async proponerSemana(rotacionId: number): Promise<number> {
        const pendientes = await RotacionService.semanasPendientes(rotacionId)
        if (pendientes.length === 0) {
            throw new CustomError(
                409,
                'Esta rotación ya tiene todas sus semanas hechas.',
                { code: 'ROTACION_COMPLETA' },
            )
        }
        return pendientes[0]
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/planificacion/RotacionService.spec.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/RotacionService.ts src/services/planificacion/RotacionService.spec.ts
git commit -m "feat(planificacion): RotacionService materializa el plan y propone semana

proponerSemana pasa a ser 'una de las que faltan en la rotacion': la aritmetica
(ultima % 5) + 1 asumia cinco semanas contiguas."
```

---

### Task 8: `CicloService.asegurar` — apertura implícita y el 409 de cambio de zona

**Files:**
- Modify: `src/services/planificacion/CicloService.ts`
- Modify: `src/repositories/CicloRepository.ts` (crear con `rotacionId` + `fechaLunes`; `findAbiertoByVendedor` mapea los campos nuevos)
- Test: `src/services/planificacion/CicloService.spec.ts` (reescribir los `describe` de `abrir`/`preview`)

**Interfaces:**
- Consumes: `RotacionService.asegurarRotacion` / `proponerSemana` (Task 7), `lunesDeLaSemana` (Task 1), `RotacionClienteRepository.findCodigosSinResolver` (Task 6).
- Produces:
  - `CicloService.asegurar(user: IUser, semana: number, confirmarCambioDeSemana?: boolean): Promise<IAsegurarCicloResult>`
  - `CicloService.actual(user): Promise<ICicloSemana | null>` (se mantiene)
  - `CicloRepository.crear({ rotacionId, codigoParticularVendedor, semana, fechaLunes }, transaction?): Promise<number>`

- [ ] **Step 1: Write the failing test**

```typescript
// añadir a src/services/planificacion/CicloService.spec.ts
// (mockear también RotacionService, RotacionRepository y RotacionClienteRepository,
//  con el mismo patrón jest.mock de los repositorios que ya usa el archivo)

describe('asegurar', () => {
    it('con ciclo abierto de esa semana lo devuelve sin tocar nada', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedFindAbierto.mockResolvedValue(cicloAbierto({ semana: 2 }))

        const res = await CicloService.asegurar(user, 2)

        expect(res.ciclo.semana).toBe(2)
        expect(res.cicloAnteriorCerrado).toBe(false)
        expect(mockedCrearCiclo).not.toHaveBeenCalled()
    })

    it('sin ciclo abierto abre el de la semana pedida, NO la propuesta', async () => {
        // En standby la semana operable es la que el vendedor estaba mirando: es de
        // donde sale la flexibilidad de zona, sin botón ni caso especial.
        mockedResolve.mockResolvedValue('V 2')
        mockedFindAbierto.mockResolvedValue(null)
        mockedAsegurarRotacion.mockResolvedValue({ rotacionId: 7, materializada: false })
        mockedCrearCiclo.mockResolvedValue(31)
        mockedFindById.mockResolvedValue(cicloAbierto({ id: 31, semana: 4 }))

        const res = await CicloService.asegurar(user, 4)

        expect(mockedCrearCiclo).toHaveBeenCalledWith(
            expect.objectContaining({ rotacionId: 7, semana: 4 }),
            expect.anything(),
        )
        expect(res.ciclo.semana).toBe(4)
    })

    it('graba fechaLunes con el lunes de la semana laboral', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedFindAbierto.mockResolvedValue(null)
        mockedAsegurarRotacion.mockResolvedValue({ rotacionId: 7, materializada: false })
        mockedCrearCiclo.mockResolvedValue(31)
        mockedFindById.mockResolvedValue(cicloAbierto({ id: 31, semana: 2 }))

        await CicloService.asegurar(user, 2)

        const [input] = mockedCrearCiclo.mock.calls[0]
        expect(input.fechaLunes).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('con ciclo abierto de OTRA semana devuelve 409 con los pendientes', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedFindAbierto.mockResolvedValue(cicloAbierto({ id: 31, semana: 2, rotacionId: 7 }))
        mockedSinResolverRotacion.mockResolvedValue(['6612', '9301'])

        await expect(CicloService.asegurar(user, 4)).rejects.toMatchObject({
            statusCode: 409,
            details: {
                code: 'CAMBIO_DE_SEMANA',
                semanaAbierta: 2,
                clientesPendientes: ['6612', '9301'],
            },
        })
        expect(mockedCerrarCiclo).not.toHaveBeenCalled()
    })

    it('con confirmarCambioDeSemana cierra la vieja y abre la nueva', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedFindAbierto.mockResolvedValue(cicloAbierto({ id: 31, semana: 2, rotacionId: 7 }))
        mockedSinResolverRotacion.mockResolvedValue(['6612'])
        mockedAsegurarRotacion.mockResolvedValue({ rotacionId: 7, materializada: false })
        mockedCrearCiclo.mockResolvedValue(32)
        mockedFindById.mockResolvedValue(cicloAbierto({ id: 32, semana: 4 }))

        const res = await CicloService.asegurar(user, 4, true)

        expect(mockedCerrarCiclo).toHaveBeenCalledWith(31, expect.anything())
        expect(res.cicloAnteriorCerrado).toBe(true)
        expect(res.ciclo.semana).toBe(4)
    })

    it('cerrar la vieja NO crea resoluciones para sus pendientes', async () => {
        // Pendiente y "no visité" no son lo mismo: uno es la ausencia de un hecho, el
        // otro un hecho declarado con motivo. Auto-resolverlos mataría la cobertura.
        mockedResolve.mockResolvedValue('V 2')
        mockedFindAbierto.mockResolvedValue(cicloAbierto({ id: 31, semana: 2, rotacionId: 7 }))
        mockedSinResolverRotacion.mockResolvedValue(['6612'])
        mockedAsegurarRotacion.mockResolvedValue({ rotacionId: 7, materializada: false })
        mockedCrearCiclo.mockResolvedValue(32)
        mockedFindById.mockResolvedValue(cicloAbierto({ id: 32, semana: 4 }))

        await CicloService.asegurar(user, 4, true)

        expect(mockedCrearResolucion).not.toHaveBeenCalled()
    })

    it('rechaza una semana que no está en el set de la rotación', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedFindAbierto.mockResolvedValue(null)
        mockedAsegurarRotacion.mockResolvedValue({ rotacionId: 7, materializada: false })
        mockedSemanasDelSet.mockResolvedValue([1, 2, 3, 4])

        await expect(CicloService.asegurar(user, 5)).rejects.toMatchObject({
            statusCode: 422,
            details: { code: 'SEMANA_FUERA_DEL_SET' },
        })
    })
})
```

Helper para el archivo (agregarlo arriba, junto a los mocks):

```typescript
const user = { id: 1, name: 'Vendedor', email: 'v@x.com' } as any

const cicloAbierto = (over: Partial<ICicloSemana> = {}): ICicloSemana => ({
    id: 31,
    rotacionId: 7,
    codigoParticularVendedor: 'V 2',
    semana: 2,
    fechaLunes: '2026-08-03',
    fechaApertura: '2026-08-03T12:12:00.000Z',
    fechaCierre: null,
    estado: 'abierta',
    ...over,
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/planificacion/CicloService.spec.ts`
Expected: FAIL — `CicloService.asegurar is not a function`

- [ ] **Step 3: Write minimal implementation**

Reemplazar `abrir()` por `asegurar()` en `CicloService`:

```typescript
    /**
     * Deja listo el ciclo de `semana` para operar. Lo dispara la primera acción real
     * sobre un cliente (iniciar visita, no visité, reacomodar), no un botón: por eso
     * congelar la rotación pasa a ser el efecto secundario de una decisión que el
     * vendedor ya tomó, en vez de un compromiso que tiene que entender de antemano.
     *
     * Tres ramas:
     *  - ciclo abierto de esa semana → se devuelve;
     *  - ciclo abierto de OTRA semana → 409 CAMBIO_DE_SEMANA con los pendientes, que es
     *    el cartel; con `confirmar` cierra la vieja y sigue;
     *  - sin ciclo abierto (standby) → abre el de la semana PEDIDA (la que el vendedor
     *    estaba mirando), no la propuesta.
     */
    static async asegurar(
        user: IUser,
        semana: number,
        confirmarCambioDeSemana = false,
    ): Promise<IAsegurarCicloResult> {
        const vendedor = await resolveSellerCode(user)
        const abierto = await CicloRepository.findAbiertoByVendedor(vendedor)

        if (abierto && abierto.semana === semana) {
            return {
                ciclo: abierto,
                rotacionMaterializada: false,
                cicloAnteriorCerrado: false,
            }
        }

        if (abierto && !confirmarCambioDeSemana) {
            const clientesPendientes =
                await RotacionClienteRepository.findCodigosSinResolver(
                    abierto.rotacionId,
                    abierto.semana,
                )
            throw new CustomError(
                409,
                `Tenés la semana ${abierto.semana} abierta.`,
                {
                    code: 'CAMBIO_DE_SEMANA',
                    semanaAbierta: abierto.semana,
                    clientesPendientes,
                },
            )
        }

        const { rotacionId, materializada } = await RotacionService.asegurarRotacion(
            vendedor,
        )

        const set = await RotacionClienteRepository.semanasDelSet(rotacionId)
        if (!set.includes(semana)) {
            throw new CustomError(
                422,
                `La semana ${semana} no existe en la hoja de ruta de este vendedor.`,
                { code: 'SEMANA_FUERA_DEL_SET', semanas: set },
            )
        }

        let cicloId: number
        try {
            cicloId = await sequelizeWritePlanificacion.transaction(async transaction => {
                if (abierto) {
                    // Cerrar NO crea resoluciones: los pendientes quedan pendientes y la
                    // cobertura los cuenta como no cubiertos.
                    await CicloRepository.cerrar(abierto.id, transaction)
                }
                return CicloRepository.crear(
                    {
                        rotacionId,
                        codigoParticularVendedor: vendedor,
                        semana,
                        fechaLunes: lunesDeLaSemana(new Date()),
                    },
                    transaction,
                )
            })
        } catch (err) {
            // Check-then-act: entre el `findAbiertoByVendedor` de arriba y este INSERT,
            // otro dispositivo pudo abrir el ciclo. El UNIQUE vendedor_abierto lo
            // atrapa, y sin esto el vendedor vería un 500 en vez de su agenda.
            const ganado = await CicloRepository.findAbiertoByVendedor(vendedor)
            if (ganado && ganado.semana === semana) {
                return {
                    ciclo: ganado,
                    rotacionMaterializada: materializada,
                    cicloAnteriorCerrado: false,
                }
            }
            if (ganado) {
                throw new CustomError(409, `Tenés la semana ${ganado.semana} abierta.`, {
                    code: 'CAMBIO_DE_SEMANA',
                    semanaAbierta: ganado.semana,
                    clientesPendientes: await RotacionClienteRepository.findCodigosSinResolver(
                        ganado.rotacionId,
                        ganado.semana,
                    ),
                })
            }
            throw err
        }

        const ciclo = await CicloRepository.findById(cicloId)
        if (!ciclo) throw new CustomError(500, 'El ciclo recién creado no se pudo leer')

        return {
            ciclo,
            rotacionMaterializada: materializada,
            cicloAnteriorCerrado: Boolean(abierto),
        }
    }
```

Y en `CicloRepository`:

```typescript
export interface CrearCicloInput {
    rotacionId: number
    codigoParticularVendedor: string
    semana: number
    /** 'YYYY-MM-DD'. La calcula el servicio con lunesDeLaSemana(), no el repositorio. */
    fechaLunes: string
}

    static async findById(id: number): Promise<ICicloSemana | null> {
        try {
            const row = await CicloSemana.findByPk(id)
            return row ? toICicloSemana(row) : null
        } catch (err) {
            throw new CustomError(500, `Error fetching ciclo: ${err}`)
        }
    }

    static async cerrar(cicloId: number, transaction?: Transaction): Promise<void> {
        try {
            await CicloSemana.update(
                { estado: 'cerrada', fechaCierre: new Date() },
                { where: { id: cicloId }, ...(transaction ? { transaction } : {}) },
            )
        } catch (err) {
            throw new CustomError(500, `Error cerrando ciclo: ${err}`)
        }
    }
```

En `crear`, pasar `{ ...input, fechaApertura: new Date(), estado: 'abierta' }` sin cambios (los campos nuevos viajan en `input`). En `toICicloSemana` agregar:

```typescript
        rotacionId: r.rotacionId,
        // DATEONLY: Sequelize ya la entrega como 'YYYY-MM-DD'. NO llamar toISOString():
        // convertiría a UTC y correría la fecha un día.
        fechaLunes: String(r.fechaLunes),
```

Borrar `findUltimaCerrada` — la reemplaza `RotacionRepository.semanasHechas`, que sabe de completitud y no asume orden.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/planificacion/CicloService.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/CicloService.ts src/services/planificacion/CicloService.spec.ts src/repositories/CicloRepository.ts
git commit -m "feat(planificacion): asegurarCiclo con apertura implicita y 409 de cambio de zona"
```

---

### Task 9: `CicloService.cerrar` — autocompletado de rubros y cierre de rotación

**Files:**
- Modify: `src/services/planificacion/CicloService.ts`
- Modify: `src/repositories/VisitaRubroRepository.ts` (autocompletar)
- Test: `src/services/planificacion/CicloService.spec.ts`

**Interfaces:**
- Consumes: `RotacionRepository.cerrar` / `semanasHechas` (Task 5), `RotacionClienteRepository.semanasDelSet` (Task 6).
- Produces:
  - `CicloService.cerrarCiclo(ciclo: ICicloSemana): Promise<{ sinVisitar: string[]; rubrosAutocompletados: number; rotacionCerrada: boolean }>`
  - `VisitaRubroRepository.autocompletarSinMotivos(cicloId: number, motivoId: number, transaction?): Promise<number>`

- [ ] **Step 1: Write the failing test**

```typescript
// añadir a src/services/planificacion/CicloService.spec.ts

const MOTIVO_NO_LO_OFRECI = 16

describe('cerrarCiclo', () => {
    it('autocompleta los rubros sin motivos con el motivo 16 y cierra', async () => {
        mockedSinResolverRotacion.mockResolvedValue(['6612'])
        mockedAutocompletar.mockResolvedValue(1)
        mockedSemanasDelSet.mockResolvedValue([1, 2, 3, 4])
        mockedSemanasHechas.mockResolvedValue([2])

        const res = await CicloService.cerrarCiclo(cicloAbierto({ id: 31, semana: 2 }))

        expect(mockedAutocompletar).toHaveBeenCalledWith(31, MOTIVO_NO_LO_OFRECI, expect.anything())
        expect(mockedCerrarCiclo).toHaveBeenCalledWith(31, expect.anything())
        expect(res).toEqual({
            sinVisitar: ['6612'],
            rubrosAutocompletados: 1,
            rotacionCerrada: false,
        })
    })

    it('NO crea resoluciones para los clientes sin visitar', async () => {
        mockedSinResolverRotacion.mockResolvedValue(['6612', '9301'])
        mockedAutocompletar.mockResolvedValue(0)
        mockedSemanasDelSet.mockResolvedValue([1, 2, 3, 4])
        mockedSemanasHechas.mockResolvedValue([2])

        await CicloService.cerrarCiclo(cicloAbierto({ id: 31, semana: 2 }))

        expect(mockedCrearResolucion).not.toHaveBeenCalled()
    })

    it('cierra la rotación cuando el ciclo completa el set', async () => {
        mockedSinResolverRotacion.mockResolvedValue([])
        mockedAutocompletar.mockResolvedValue(0)
        mockedSemanasDelSet.mockResolvedValue([1, 2, 3, 4])
        mockedSemanasHechas.mockResolvedValue([1, 2, 3, 4])

        const res = await CicloService.cerrarCiclo(cicloAbierto({ id: 34, semana: 4 }))

        expect(mockedCerrarRotacion).toHaveBeenCalledWith(7, expect.anything())
        expect(res.rotacionCerrada).toBe(true)
    })

    it('un vendedor de 4 semanas completa la rotación con cuatro', async () => {
        // El set manda: nunca se espera una quinta semana que este vendedor no tiene.
        mockedSinResolverRotacion.mockResolvedValue([])
        mockedAutocompletar.mockResolvedValue(0)
        mockedSemanasDelSet.mockResolvedValue([1, 2, 3, 4])
        mockedSemanasHechas.mockResolvedValue([3, 1, 4, 2]) // orden salteado

        const res = await CicloService.cerrarCiclo(cicloAbierto({ id: 34, semana: 2 }))

        expect(res.rotacionCerrada).toBe(true)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/planificacion/CicloService.spec.ts`
Expected: FAIL — `CicloService.cerrarCiclo is not a function`

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Motivo 'No lo ofrecí' (resultado 'no_ofrecido'). Con el que se autocompletan los
 * rubros sin cargar al cerrar el ciclo: cerrar la semana cierra la carga.
 *
 * Consecuencia asumida y documentada en el spec: queda indistinguible de un
 * 'No lo ofrecí' que el vendedor declaró a mano.
 */
const MOTIVO_NO_LO_OFRECI = 16

    static async cerrarCiclo(ciclo: ICicloSemana): Promise<{
        sinVisitar: string[]
        rubrosAutocompletados: number
        rotacionCerrada: boolean
    }> {
        // Se lee ANTES de cerrar: es lo que se le informa al vendedor.
        const sinVisitar = await RotacionClienteRepository.findCodigosSinResolver(
            ciclo.rotacionId,
            ciclo.semana,
        )

        const set = await RotacionClienteRepository.semanasDelSet(ciclo.rotacionId)
        const hechas = new Set(await RotacionRepository.semanasHechas(ciclo.rotacionId))
        const completa = set.every(s => hechas.has(s))

        const rubrosAutocompletados = await sequelizeWritePlanificacion.transaction(
            async transaction => {
                const n = await VisitaRubroRepository.autocompletarSinMotivos(
                    ciclo.id,
                    MOTIVO_NO_LO_OFRECI,
                    transaction,
                )
                await CicloRepository.cerrar(ciclo.id, transaction)
                if (completa) {
                    await RotacionRepository.cerrar(ciclo.rotacionId, transaction)
                }
                return n
            },
        )

        return { sinVisitar, rubrosAutocompletados, rotacionCerrada: completa }
    }
```

Y en `VisitaRubroRepository`:

```typescript
    /**
     * Cierra con `motivoId` los rubros de las visitas del ciclo que no tienen ninguno.
     *
     * Existe porque `RubrosService.resolveVisitaPropia` exige que la visita cuelgue del
     * ciclo abierto: si el ciclo cerrara con rubros sin cargar, esas cargas empezarían a
     * fallar con 403 y el vendedor perdería el trabajo en silencio.
     *
     * Idempotente: el NOT EXISTS hace que correrlo dos veces no agregue nada.
     */
    static async autocompletarSinMotivos(
        cicloId: number,
        motivoId: number,
        transaction?: Transaction,
    ): Promise<number> {
        try {
            const [, meta] = await sequelizeWritePlanificacion.query(
                `INSERT INTO pl_visita_rubro_motivo (visita_rubro_id, motivo_id)
                 SELECT vr.id, :motivoId
                   FROM pl_visita_rubro vr
                   JOIN pl_resolucion r  ON r.id  = vr.resolucion_id
                   JOIN pl_rotacion_cliente rc ON rc.id = r.rotacion_cliente_id
                   JOIN pl_ciclo_semana cs ON cs.rotacion_id = rc.rotacion_id
                                          AND cs.semana      = rc.semana
                  WHERE cs.id = :cicloId
                    AND r.tipo = 'visita'
                    AND NOT EXISTS (
                        SELECT 1 FROM pl_visita_rubro_motivo m
                         WHERE m.visita_rubro_id = vr.id
                    )`,
                { replacements: { cicloId, motivoId }, ...(transaction ? { transaction } : {}) },
            )
            return Number((meta as unknown as { affectedRows?: number })?.affectedRows ?? 0)
        } catch (err) {
            throw new CustomError(500, `Error autocompletando rubros: ${err}`)
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/planificacion/CicloService.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/CicloService.ts src/services/planificacion/CicloService.spec.ts src/repositories/VisitaRubroRepository.ts
git commit -m "feat(planificacion): cerrar ciclo autocompleta rubros y cierra la rotacion completa"
```

---

### Task 10: `CicloService.sincronizar` — el lunes y el padrón

**Files:**
- Modify: `src/services/planificacion/CicloService.ts`
- Modify: `src/services/planificacion/RotacionService.ts` (`sincronizarPadron`)
- Test: ambos specs

**Interfaces:**
- Consumes: `cerrarCiclo` (Task 9), `lunesDeLaSemana` (Task 1), `RotacionService.leerTemplate` (Task 7), `RotacionClienteRepository.eliminarSinResolver` / `crearMuchos` / `findByRotacion` / `semanasDelSet` (Task 6), `RotacionRepository.semanasHechas` (Task 5).
- Produces:
  - `CicloService.sincronizar(user): Promise<ISincronizarResult>`
  - `RotacionService.sincronizarPadron(vendedor, rotacionId): Promise<{ altas: string[]; bajas: string[] }>`

- [ ] **Step 1: Write the failing test**

```typescript
// añadir a src/services/planificacion/RotacionService.spec.ts

describe('sincronizarPadron', () => {
    const filaPlan = (id: number, codigo: string, semana: number, dia = 1) => ({
        id, rotacionId: 7, codigoParticularCliente: codigo, semana, dia,
    })

    beforeEach(() => {
        mockedSemanasDelSet.mockResolvedValue([1, 2, 3, 4])
        mockedSemanasHechas.mockResolvedValue([2]) // la semana 2 ya cerró
    })

    it('da de alta en una semana PENDIENTE al cliente nuevo del template', async () => {
        mockedAssignments.mockReturnValue([
            { codigoParticularCliente: '6836', visit: 's2d1' },
            { codigoParticularCliente: '8890', visit: 's3d2' }, // nuevo
        ])
        mockedCards.mockResolvedValue(new Map([card('6836'), card('8890')]) as any)
        mockedFindByRotacion.mockResolvedValue([filaPlan(101, '6836', 2)])
        mockedEliminarSinResolver.mockResolvedValue([])

        const res = await RotacionService.sincronizarPadron('V 2', 7)

        expect(mockedCrearMuchos).toHaveBeenCalledWith(7, [
            { codigoParticularCliente: '8890', semana: 3, dia: 2 },
        ])
        expect(res.altas).toEqual(['8890'])
    })

    it('NO da de alta en una semana ya cerrada', async () => {
        // No se le cambia la cobertura a una semana ya reportada.
        mockedAssignments.mockReturnValue([
            { codigoParticularCliente: '8890', visit: 's2d3' }, // semana 2, cerrada
        ])
        mockedCards.mockResolvedValue(new Map([card('8890')]) as any)
        mockedFindByRotacion.mockResolvedValue([])
        mockedEliminarSinResolver.mockResolvedValue([])

        const res = await RotacionService.sincronizarPadron('V 2', 7)

        expect(mockedCrearMuchos).not.toHaveBeenCalled()
        expect(res.altas).toEqual([])
    })

    it('reporta como baja SOLO lo que el repositorio borró de verdad', async () => {
        mockedAssignments.mockReturnValue([]) // 2088 desapareció del template
        mockedCards.mockResolvedValue(new Map() as any)
        mockedFindByRotacion.mockResolvedValue([filaPlan(107, '2088', 1)])
        mockedEliminarSinResolver.mockResolvedValue(['2088'])

        const res = await RotacionService.sincronizarPadron('V 2', 7)

        // Las semanas habilitadas son las pendientes: [1, 3, 4]. La 2 no entra.
        expect(mockedEliminarSinResolver).toHaveBeenCalledWith(7, ['2088'], [1, 3, 4])
        expect(res.bajas).toEqual(['2088'])
    })

    it('correrlo sin cambios en el padrón no produce nada', async () => {
        mockedAssignments.mockReturnValue([
            { codigoParticularCliente: '6836', visit: 's2d1' },
        ])
        mockedCards.mockResolvedValue(new Map([card('6836')]) as any)
        mockedFindByRotacion.mockResolvedValue([filaPlan(101, '6836', 2)])
        mockedEliminarSinResolver.mockResolvedValue([])

        const res = await RotacionService.sincronizarPadron('V 2', 7)

        expect(mockedCrearMuchos).not.toHaveBeenCalled()
        expect(res).toEqual({ altas: [], bajas: [] })
    })

    it('un cambio de SLOT en el template no mueve nada', async () => {
        // Los cambios de ruta no se persiguen: gerencia reacomoda, y el template aplica
        // en la próxima materialización.
        mockedAssignments.mockReturnValue([
            { codigoParticularCliente: '6836', visit: 's4d5' }, // era s2d1
        ])
        mockedCards.mockResolvedValue(new Map([card('6836')]) as any)
        mockedFindByRotacion.mockResolvedValue([filaPlan(101, '6836', 2)])
        mockedEliminarSinResolver.mockResolvedValue([])

        const res = await RotacionService.sincronizarPadron('V 2', 7)

        expect(res).toEqual({ altas: [], bajas: [] })
        expect(mockedMover).not.toHaveBeenCalled()
    })
})
```

```typescript
// añadir a src/services/planificacion/CicloService.spec.ts

describe('sincronizar', () => {
    it('sin ciclo abierto es un no-op con resumen vacío', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedFindAbierto.mockResolvedValue(null)
        mockedRotacionAbierta.mockResolvedValue(null)

        await expect(CicloService.sincronizar(user)).resolves.toEqual({
            semanaCerrada: null,
            sinVisitar: [],
            rubrosAutocompletados: 0,
            altas: [],
            bajas: [],
            rotacionCerrada: false,
        })
    })

    it('con un ciclo de ESTA semana laboral no lo cierra', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedFindAbierto.mockResolvedValue(
            cicloAbierto({ fechaLunes: lunesDeLaSemana(new Date()) }),
        )
        mockedRotacionAbierta.mockResolvedValue({
            id: 7, codigoParticularVendedor: 'V 2',
            fechaInicio: '2026-08-03T12:00:00.000Z', fechaFin: null,
        })
        mockedSincronizarPadron.mockResolvedValue({ altas: [], bajas: [] })

        const res = await CicloService.sincronizar(user)

        expect(res.semanaCerrada).toBeNull()
        expect(mockedCerrarCiclo).not.toHaveBeenCalled()
    })

    it('cierra el ciclo cuya fechaLunes es de una semana laboral anterior', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedFindAbierto.mockResolvedValue(
            cicloAbierto({ id: 31, semana: 2, fechaLunes: '2020-01-06' }),
        )
        jest.spyOn(CicloService, 'cerrarCiclo').mockResolvedValue({
            sinVisitar: ['6612'],
            rubrosAutocompletados: 1,
            rotacionCerrada: false,
        })
        mockedRotacionAbierta.mockResolvedValue({
            id: 7, codigoParticularVendedor: 'V 2',
            fechaInicio: '2026-08-03T12:00:00.000Z', fechaFin: null,
        })
        mockedSincronizarPadron.mockResolvedValue({ altas: [], bajas: [] })

        const res = await CicloService.sincronizar(user)

        expect(res.semanaCerrada).toBe(2)
        expect(res.sinVisitar).toEqual(['6612'])
        expect(res.rubrosAutocompletados).toBe(1)
    })

    it('cerrar NO abre nada: queda en standby', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedFindAbierto.mockResolvedValue(
            cicloAbierto({ id: 31, semana: 2, fechaLunes: '2020-01-06' }),
        )
        jest.spyOn(CicloService, 'cerrarCiclo').mockResolvedValue({
            sinVisitar: [], rubrosAutocompletados: 0, rotacionCerrada: false,
        })
        mockedRotacionAbierta.mockResolvedValue({
            id: 7, codigoParticularVendedor: 'V 2',
            fechaInicio: '2026-08-03T12:00:00.000Z', fechaFin: null,
        })
        mockedSincronizarPadron.mockResolvedValue({ altas: [], bajas: [] })

        await CicloService.sincronizar(user)

        expect(mockedCrearCiclo).not.toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/planificacion/RotacionService.spec.ts src/services/planificacion/CicloService.spec.ts`
Expected: FAIL — `sincronizarPadron is not a function`, `sincronizar is not a function`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/planificacion/RotacionService.ts

    /**
     * Sincroniza el PADRÓN, no el plan: solo altas y bajas de clientes.
     *
     * Los cambios de slot del template NO se persiguen — gerencia reacomoda, y el
     * template aplica en la próxima materialización. Eso es lo que hace que este
     * sincronizador sea chico e idempotente en vez de tener que resolver quién gana
     * entre el vendedor y la hoja.
     *
     * Dos invariantes: no toca filas con resolución (lo garantiza
     * `eliminarSinResolver`) y no toca semanas ya cerradas (solo opera sobre las
     * pendientes). Por eso se puede correr en cada apertura de la app.
     */
    static async sincronizarPadron(
        vendedor: string,
        rotacionId: number,
    ): Promise<{ altas: string[]; bajas: string[] }> {
        const { validas } = await RotacionService.leerTemplate(vendedor)
        const pendientes = await RotacionService.semanasPendientes(rotacionId)
        const habilitadas = new Set(pendientes)

        const plan = await RotacionClienteRepository.findByRotacion(rotacionId)
        const enPlan = new Set(plan.map(f => f.codigoParticularCliente))
        const enTemplate = new Set(validas.map(v => v.codigoParticularCliente))

        // Altas: están en el template, no en el plan, y su semana sigue pendiente.
        const aAltar = validas.filter(
            v => !enPlan.has(v.codigoParticularCliente) && habilitadas.has(v.semana),
        )
        if (aAltar.length > 0) {
            await RotacionClienteRepository.crearMuchos(rotacionId, aAltar)
        }

        // Bajas: están en el plan y ya no en el template. El repositorio filtra por
        // semana habilitada y por ausencia de resolución.
        const candidatasBaja = plan
            .filter(f => !enTemplate.has(f.codigoParticularCliente))
            .map(f => f.codigoParticularCliente)

        // `bajas` son los códigos que el repositorio borró de verdad, no los candidatos:
        // de 5 candidatos puede borrar 1 (los otros tienen resolución o están en semanas
        // cerradas), y el aviso al vendedor tiene que decir la verdad.
        const bajas = await RotacionClienteRepository.eliminarSinResolver(
            rotacionId,
            candidatasBaja,
            pendientes,
        )

        return { altas: aAltar.map(a => a.codigoParticularCliente), bajas }
    }
```

```typescript
// src/services/planificacion/CicloService.ts

    /**
     * Pone al día el estado del vendedor. Idempotente: el front la llama al montar y al
     * volver al foco.
     *
     *  1. Si hay un ciclo abierto de una semana laboral anterior, lo cierra. **No abre
     *     nada**: queda en standby, y la primera acción del vendedor abre la semana que
     *     él esté mirando.
     *  2. Sincroniza el padrón de la rotación abierta.
     *
     * Endpoint propio y no un efecto lateral de `GET /ciclo/actual`, para que un GET no
     * mute. Sin ciclo ni rotación abierta es un no-op, nunca un error.
     */
    static async sincronizar(user: IUser): Promise<ISincronizarResult> {
        const vendedor = await resolveSellerCode(user)
        const vacio: ISincronizarResult = {
            semanaCerrada: null,
            sinVisitar: [],
            rubrosAutocompletados: 0,
            altas: [],
            bajas: [],
            rotacionCerrada: false,
        }

        const abierto = await CicloRepository.findAbiertoByVendedor(vendedor)
        const lunesDeHoy = lunesDeLaSemana(new Date())

        let cerrado = vacio
        if (abierto && abierto.fechaLunes < lunesDeHoy) {
            const res = await CicloService.cerrarCiclo(abierto)
            cerrado = {
                ...vacio,
                semanaCerrada: abierto.semana,
                sinVisitar: res.sinVisitar,
                rubrosAutocompletados: res.rubrosAutocompletados,
                rotacionCerrada: res.rotacionCerrada,
            }
        }

        // La rotación se lee DESPUÉS de cerrar: cerrar la última semana la completa.
        const rotacion = await RotacionRepository.findAbiertaByVendedor(vendedor)
        if (!rotacion) return cerrado

        const { altas, bajas } = await RotacionService.sincronizarPadron(
            vendedor,
            rotacion.id,
        )

        return { ...cerrado, altas, bajas }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/planificacion/RotacionService.spec.ts src/services/planificacion/CicloService.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/CicloService.ts src/services/planificacion/RotacionService.ts src/services/planificacion/*.spec.ts
git commit -m "feat(planificacion): sincronizar cierra el ciclo vencido y el padron de la rotacion

El sincronizador es de PADRON, no de plan: los cambios de slot del template no se
persiguen porque reacomodar es una operacion de primera clase."
```

---

### Task 11: `reacomodar` reemplaza a `reagendar`

**Files:**
- Modify: `src/services/planificacion/VisitasService.ts`
- Modify: `src/services/planificacion/estadoCicloCliente.ts`
- Modify: `src/controllers/planificacionController.ts`
- Modify: `src/routes/planificacion.ts`
- Test: `src/services/planificacion/VisitasService.spec.ts`, `src/services/planificacion/estadoCicloCliente.spec.ts`

**Interfaces:**
- Consumes: `RotacionClienteRepository.mover` / `findById` / `semanasDelSet` (Task 6), `CicloService.asegurar` (Task 8).
- Produces:
  - `VisitasService.reacomodar(user, rotacionClienteId, dto: IReacomodarDTO): Promise<void>`
  - Ruta `PATCH /planificacion/rotacion-cliente/:id/reacomodar`

- [ ] **Step 1: Write the failing test**

```typescript
// reemplazar el describe('reagendar') de src/services/planificacion/VisitasService.spec.ts

describe('reacomodar', () => {
    it('sin semana mueve solo el día, dentro de la misma semana', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedFindByIdRC.mockResolvedValue({
            id: 103, rotacionId: 7, codigoParticularCliente: '4412', semana: 2, dia: 3,
        })
        mockedRotacionAbierta.mockResolvedValue({
            id: 7, codigoParticularVendedor: 'V 2',
            fechaInicio: '2026-08-03T12:00:00.000Z', fechaFin: null,
        })

        await VisitasService.reacomodar(user, 103, { dia: 4 })

        expect(mockedMover).toHaveBeenCalledWith(103, 2, 4, 'vendedor', expect.any(String))
    })

    it('con semana mueve a otra semana de la rotación', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedFindByIdRC.mockResolvedValue({
            id: 103, rotacionId: 7, codigoParticularCliente: '4412', semana: 2, dia: 3,
        })
        mockedRotacionAbierta.mockResolvedValue({
            id: 7, codigoParticularVendedor: 'V 2',
            fechaInicio: '2026-08-03T12:00:00.000Z', fechaFin: null,
        })
        mockedSemanasDelSet.mockResolvedValue([1, 2, 3, 4])

        await VisitasService.reacomodar(user, 103, { semana: 4, dia: 1 })

        expect(mockedMover).toHaveBeenCalledWith(103, 4, 1, 'vendedor', expect.any(String))
    })

    it('rechaza un día fuera de 1..5', async () => {
        mockedResolve.mockResolvedValue('V 2')

        await expect(
            VisitasService.reacomodar(user, 103, { dia: 9 }),
        ).rejects.toMatchObject({ statusCode: 400, details: { code: 'DIA_INVALIDO' } })
        expect(mockedMover).not.toHaveBeenCalled()
    })

    it('rechaza una semana fuera del set de la rotación', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedFindByIdRC.mockResolvedValue({
            id: 103, rotacionId: 7, codigoParticularCliente: '4412', semana: 2, dia: 3,
        })
        mockedRotacionAbierta.mockResolvedValue({
            id: 7, codigoParticularVendedor: 'V 2',
            fechaInicio: '2026-08-03T12:00:00.000Z', fechaFin: null,
        })
        mockedSemanasDelSet.mockResolvedValue([1, 2, 3, 4])

        await expect(
            VisitasService.reacomodar(user, 103, { semana: 5, dia: 1 }),
        ).rejects.toMatchObject({
            statusCode: 422,
            details: { code: 'SEMANA_FUERA_DEL_SET' },
        })
    })

    it('rechaza reacomodar una fila de OTRO vendedor', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedFindByIdRC.mockResolvedValue({
            id: 103, rotacionId: 99, codigoParticularCliente: '4412', semana: 2, dia: 3,
        })
        mockedRotacionAbierta.mockResolvedValue({
            id: 7, codigoParticularVendedor: 'V 2',
            fechaInicio: '2026-08-03T12:00:00.000Z', fechaFin: null,
        })

        await expect(
            VisitasService.reacomodar(user, 103, { dia: 4 }),
        ).rejects.toMatchObject({ statusCode: 403, details: { code: 'FILA_AJENA' } })
    })
})
```

```typescript
// src/services/planificacion/estadoCicloCliente.spec.ts
// borrar el it('reagendada resuelve como reagendada') y agregar:

it('ya no existe el tipo reagendada: reacomodar no es una resolución', () => {
    // Mover un cliente es un UPDATE del plan, no un hecho. Si esto volviera a
    // compilar con 'reagendada', alguien reintrodujo el estado.
    const tipos: TipoResolucion[] = ['visita', 'no_visita']
    expect(tipos).toHaveLength(2)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/planificacion/VisitasService.spec.ts`
Expected: FAIL — `VisitasService.reacomodar is not a function`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/planificacion/VisitasService.ts — reemplaza a reagendar()

    /**
     * Reacomodar: LA operación de movimiento. Mover de día, pasar a otra semana, traer
     * un día de otra zona e intercambiar días son todos esto.
     *
     * `semana` ausente = mismo lugar en la rotación, otro día. La regla de "no se mueve
     * una fila con resolución" la aplica el repositorio.
     */
    static async reacomodar(
        user: IUser,
        rotacionClienteId: number,
        dto: IReacomodarDTO,
    ): Promise<void> {
        if (!Number.isInteger(dto.dia) || dto.dia < 1 || dto.dia > 5) {
            throw new CustomError(400, 'El día tiene que estar entre 1 y 5.', {
                code: 'DIA_INVALIDO',
            })
        }

        const vendedor = await resolveSellerCode(user)
        const fila = await RotacionClienteRepository.findById(rotacionClienteId)
        if (!fila) {
            throw new CustomError(404, 'Cliente no encontrado en el plan.', {
                code: 'FILA_NOT_FOUND',
            })
        }

        const rotacion = await RotacionRepository.findAbiertaByVendedor(vendedor)
        if (!rotacion || rotacion.id !== fila.rotacionId) {
            throw new CustomError(403, 'Este cliente no es de tu rotación abierta.', {
                code: 'FILA_AJENA',
            })
        }

        const semana = dto.semana ?? fila.semana

        if (dto.semana !== undefined) {
            const set = await RotacionClienteRepository.semanasDelSet(rotacion.id)
            if (!set.includes(dto.semana)) {
                throw new CustomError(
                    422,
                    `La semana ${dto.semana} no existe en esta rotación.`,
                    { code: 'SEMANA_FUERA_DEL_SET', semanas: set },
                )
            }
        }

        // Origen 'vendedor': la bitácora distingue esto de un movimiento de gerencia, y
        // sin el origen el reporte de excepciones repetidas del spec 2 no se puede armar.
        await RotacionClienteRepository.mover(
            rotacionClienteId,
            semana,
            dto.dia,
            'vendedor',
            user.email ?? String(user.id),
        )
    }
```

En `estadoCicloCliente.ts`, borrar el `case 'reagendada'` y su fila de la tabla del docblock.

En el controller, agregar `reacomodar` con el patrón de los demás métodos, y en `routes/planificacion.ts`:

```typescript
// Reacomodar: LA operación de movimiento del plan de la rotación
router.patch(
    '/rotacion-cliente/:id/reacomodar',
    authMiddleware,
    authorize('vendedor'),
    async (req: Request, res: Response) => {
        PlanificacionController.reacomodar(req, res)
    },
)

// Poner al día el estado del vendedor (cierre por semana vencida + padrón)
router.post(
    '/ciclo/sincronizar',
    authMiddleware,
    authorize('vendedor'),
    async (req: Request, res: Response) => {
        PlanificacionController.sincronizar(req, res)
    },
)
```

Borrar la ruta `/ciclo-cliente/:id/reagendar` y las de `/ciclo/abrir` y `/ciclo/cerrar`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/planificacion/VisitasService.spec.ts src/services/planificacion/estadoCicloCliente.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion src/controllers/planificacionController.ts src/routes/planificacion.ts
git commit -m "feat(planificacion): reacomodar reemplaza reagendar y se va el estado reagendada"
```

---

### Task 12: Las acciones disparan `asegurar`, y el guard de rubros pasa a ser de pertenencia

Sin esto la apertura implícita no existe en la práctica: `asegurar` está escrito pero nadie lo llama. Y el guard de rubros, que hoy exige el **ciclo abierto**, empezaría a rechazar cargas legítimas en cuanto el ciclo rote.

**Files:**
- Modify: `src/services/planificacion/VisitasService.ts` (`iniciarVisita`, `noVisita`)
- Modify: `src/services/planificacion/RubrosService.ts:91-118` (`resolveVisitaPropia`)
- Modify: `src/controllers/planificacionController.ts`
- Test: `src/services/planificacion/VisitasService.spec.ts`, `src/services/planificacion/RubrosService.spec.ts`

**Interfaces:**
- Consumes: `CicloService.asegurar` (Task 8), `RotacionRepository.findAbiertaByVendedor` (Task 5), `RotacionClienteRepository.findById` (Task 6).
- Produces:
  - `IIniciarVisitaDTO` y `INoVisitaDTO` ganan `semana: number` y `codigoParticularCliente: string` como alternativa al id, más `confirmarCambioDeSemana?: boolean`
  - `VisitasService.resolverFilaDelPlan(user, dto): Promise<IRotacionCliente>` — resuelve la fila desde el id, o desde `(semana, codigo)` asegurando el ciclo

- [ ] **Step 1: Write the failing test**

```typescript
// añadir a src/services/planificacion/VisitasService.spec.ts

describe('iniciarVisita desde standby', () => {
    it('con (semana, codigo) asegura el ciclo y resuelve la fila del plan', async () => {
        // Es la apertura implícita: el vendedor toca "Iniciar visita" sobre una card de
        // preview, que no tiene rotacionClienteId, y eso abre la semana que está mirando.
        mockedResolve.mockResolvedValue('V 2')
        mockedAsegurar.mockResolvedValue({
            ciclo: { id: 32, rotacionId: 7, semana: 4 } as any,
            rotacionMaterializada: false,
            cicloAnteriorCerrado: false,
        })
        mockedFindPorRotacionYCodigo.mockResolvedValue({
            id: 105, rotacionId: 7, codigoParticularCliente: '7750', semana: 4, dia: 2,
        })

        const fila = await VisitasService.resolverFilaDelPlan(user, {
            semana: 4,
            codigoParticularCliente: '7750',
        } as any)

        expect(mockedAsegurar).toHaveBeenCalledWith(
            expect.anything(), 4, undefined,
        )
        expect(fila.id).toBe(105)
    })

    it('propaga el 409 de cambio de semana sin abrir nada', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedAsegurar.mockRejectedValue(
            new CustomError(409, 'Tenés la semana 2 abierta.', {
                code: 'CAMBIO_DE_SEMANA',
                semanaAbierta: 2,
                clientesPendientes: ['6612'],
            }),
        )

        await expect(
            VisitasService.resolverFilaDelPlan(user, {
                semana: 4,
                codigoParticularCliente: '7750',
            } as any),
        ).rejects.toMatchObject({
            statusCode: 409,
            details: { code: 'CAMBIO_DE_SEMANA' },
        })
    })

    it('con rotacionClienteId no asegura nada: el ciclo ya está abierto', async () => {
        mockedResolve.mockResolvedValue('V 2')
        mockedRotacionAbierta.mockResolvedValue({
            id: 7, codigoParticularVendedor: 'V 2',
            fechaInicio: '2026-08-03T12:00:00.000Z', fechaFin: null,
        })
        mockedFindByIdRC.mockResolvedValue({
            id: 105, rotacionId: 7, codigoParticularCliente: '7750', semana: 4, dia: 2,
        })

        const fila = await VisitasService.resolverFilaDelPlan(user, {
            rotacionClienteId: 105,
        } as any)

        expect(fila.id).toBe(105)
        expect(mockedAsegurar).not.toHaveBeenCalled()
    })
})
```

```typescript
// añadir a src/services/planificacion/RubrosService.spec.ts

it('acepta cargar rubros de una visita de un ciclo YA CERRADO de la misma rotación', async () => {
    // El guard viejo exigía el ciclo abierto y devolvía 403 VISITA_AJENA. Con el plan en
    // la rotación, la pertenencia correcta es "la resolución es tuya".
    mockedResolve.mockResolvedValue('V 2')
    mockedFindResolucion.mockResolvedValue({
        id: 51, rotacionClienteId: 101, tipo: 'visita',
        fechaInicio: '2026-08-03T13:05:00.000Z', fechaFin: '2026-08-03T13:41:00.000Z',
        coordInicio: null, coordFinal: null, coordCliente: null,
    })
    mockedFindByIdRC.mockResolvedValue({
        id: 101, rotacionId: 7, codigoParticularCliente: '6836', semana: 2, dia: 1,
    })
    mockedRotacionAbierta.mockResolvedValue({
        id: 7, codigoParticularVendedor: 'V 2',
        fechaInicio: '2026-08-03T12:00:00.000Z', fechaFin: null,
    })

    await expect(
        (RubrosService as any).resolveVisitaPropia({ id: 1 }, 51),
    ).resolves.toMatchObject({ id: 51 })
})

it('rechaza una visita de OTRA rotación', async () => {
    mockedResolve.mockResolvedValue('V 2')
    mockedFindResolucion.mockResolvedValue({
        id: 51, rotacionClienteId: 101, tipo: 'visita',
        fechaInicio: '2026-08-03T13:05:00.000Z', fechaFin: null,
        coordInicio: null, coordFinal: null, coordCliente: null,
    })
    mockedFindByIdRC.mockResolvedValue({
        id: 101, rotacionId: 99, codigoParticularCliente: '6836', semana: 2, dia: 1,
    })
    mockedRotacionAbierta.mockResolvedValue({
        id: 7, codigoParticularVendedor: 'V 2',
        fechaInicio: '2026-08-03T12:00:00.000Z', fechaFin: null,
    })

    await expect(
        (RubrosService as any).resolveVisitaPropia({ id: 1 }, 51),
    ).rejects.toMatchObject({ statusCode: 403, details: { code: 'VISITA_AJENA' } })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/planificacion/VisitasService.spec.ts src/services/planificacion/RubrosService.spec.ts`
Expected: FAIL — `VisitasService.resolverFilaDelPlan is not a function`

- [ ] **Step 3: Write minimal implementation**

En `src/types/planificacion.ts`, ampliar los DTOs:

```typescript
/**
 * La fila del plan se identifica por id O por (semana, codigo).
 *
 * La segunda forma es la que habilita la apertura implícita: las cards de preview no
 * tienen `rotacionClienteId` porque en standby todavía no hay ciclo, y antes el front
 * las rellenaba con -1. Ahora manda (semana, codigo) y el backend abre y resuelve.
 */
export interface IObjetivoDelPlan {
    rotacionClienteId?: number
    semana?: number
    codigoParticularCliente?: string
    confirmarCambioDeSemana?: boolean
}

export interface IIniciarVisitaDTO extends IObjetivoDelPlan {
    coordInicio: string | null
    propuesta?: unknown
}

export interface INoVisitaDTO extends IObjetivoDelPlan {
    motivoIds: number[]
}
```

En `VisitasService`:

```typescript
    /**
     * Resuelve la fila del plan sobre la que va a operar una acción, abriendo el ciclo
     * si hace falta.
     *
     * Con `rotacionClienteId` el ciclo ya está abierto y solo se valida pertenencia. Con
     * `(semana, codigo)` se llama a `asegurar`, que es donde vive la apertura implícita y
     * de donde sale el 409 CAMBIO_DE_SEMANA — que se propaga tal cual: el cartel lo
     * arma el front.
     */
    static async resolverFilaDelPlan(
        user: IUser,
        dto: IObjetivoDelPlan,
    ): Promise<IRotacionCliente> {
        // Recibe SOLO el user: pasarle además el `vendedor` ya resuelto obligaba a un
        // tercer parámetro opcional que en una de las ramas era obligatorio, y `asegurar`
        // lo re-resuelve igual por dentro.
        const vendedor = await resolveSellerCode(user)

        if (dto.rotacionClienteId !== undefined) {
            const fila = await RotacionClienteRepository.findById(dto.rotacionClienteId)
            if (!fila) {
                throw new CustomError(404, 'Cliente no encontrado en el plan.', {
                    code: 'FILA_NOT_FOUND',
                })
            }
            const rotacion = await RotacionRepository.findAbiertaByVendedor(vendedor)
            if (!rotacion || rotacion.id !== fila.rotacionId) {
                throw new CustomError(403, 'Este cliente no es de tu rotación abierta.', {
                    code: 'FILA_AJENA',
                })
            }
            return fila
        }

        if (dto.semana === undefined || !dto.codigoParticularCliente) {
            throw new CustomError(
                400,
                'Falta identificar al cliente: rotacionClienteId, o semana + código.',
                { code: 'OBJETIVO_INVALIDO' },
            )
        }

        const { ciclo } = await CicloService.asegurar(
            user,
            dto.semana,
            dto.confirmarCambioDeSemana,
        )

        const fila = await RotacionClienteRepository.findPorRotacionYCodigo(
            ciclo.rotacionId,
            dto.codigoParticularCliente,
        )
        if (!fila) {
            throw new CustomError(404, 'Cliente no encontrado en el plan.', {
                code: 'FILA_NOT_FOUND',
            })
        }
        return fila
    }
```

Y en `RotacionClienteRepository`:

```typescript
    static async findPorRotacionYCodigo(
        rotacionId: number,
        codigoParticularCliente: string,
    ): Promise<IRotacionCliente | null> {
        try {
            const row = await RotacionCliente.findOne({
                where: { rotacionId, codigoParticularCliente },
            })
            return row ? toIRotacionCliente(row) : null
        } catch (err) {
            throw new CustomError(500, `Error fetching fila del plan: ${err}`)
        }
    }
```

`iniciarVisita` y `noVisita` reemplazan su lectura de `cicloClienteId` por
`const fila = await VisitasService.resolverFilaDelPlan(user, dto)` y usan `fila.id`
como `rotacionClienteId` de la resolución.

En `RubrosService.resolveVisitaPropia`, reemplazar el guard:

```typescript
    /**
     * La visita existe, es una visita, y cuelga de la ROTACIÓN abierta del vendedor.
     *
     * Antes exigía el ciclo abierto, y eso rompía las cargas en cuanto el ciclo rotaba:
     * el vendedor cerraba la semana y sus propias visitas empezaban a dar 403. Con el
     * plan en la rotación, la pertenencia correcta es la rotación — la carga de rubros
     * es trabajo postergable, no abandonable.
     */
    private static async resolveVisitaPropia(
        user: IUser,
        visitaId: number,
    ): Promise<IResolucion> {
        const vendedor = await resolveSellerCode(user)

        const resolucion = await ResolucionRepository.findById(visitaId)
        if (!resolucion) {
            throw new CustomError(404, 'Visita no encontrada', { code: 'VISITA_NOT_FOUND' })
        }
        if (resolucion.tipo !== 'visita') {
            throw new CustomError(
                409,
                'Este cliente se resolvió sin visita, así que no tiene rubros',
                { code: 'RESOLUCION_SIN_RUBROS' },
            )
        }

        const fila = await RotacionClienteRepository.findById(resolucion.rotacionClienteId)
        const rotacion = await RotacionRepository.findAbiertaByVendedor(vendedor)
        if (!fila || !rotacion || fila.rotacionId !== rotacion.id) {
            throw new CustomError(403, 'Esta visita no es tuya', { code: 'VISITA_AJENA' })
        }

        return resolucion
    }
```

En el controller, `iniciarVisita` y `noVisita` pasan el body completo al servicio en vez de
extraer solo `cicloClienteId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/planificacion/VisitasService.spec.ts src/services/planificacion/RubrosService.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion src/repositories/RotacionClienteRepository.ts src/types/planificacion.ts src/controllers/planificacionController.ts
git commit -m "feat(planificacion): apertura implicita en las acciones y guard de rubros por rotacion

Las cards de preview no tienen id, asi que las acciones aceptan (semana, codigo) y
el backend abre la semana que el vendedor estaba mirando. El guard de rubros pasa de
exigir el ciclo abierto a exigir la rotacion: si no, cerrar la semana rompia las
cargas propias con 403."
```

---

### Task 13: Agenda y set de semanas en la API

**Files:**
- Modify: `src/services/planificacion/AgendaService.ts`
- Modify: `src/controllers/planificacionController.ts:63-66` (la validación de semana)
- Test: `src/services/planificacion/AgendaService.spec.ts`

**Interfaces:**
- Consumes: `RotacionClienteRepository.findByRotacionYSemana` / `semanasDelSet` (Task 6), `RotacionService.semanasPendientes` (Task 7), `derivarEstado` (Task 11).
- Produces:
  - `AgendaService.getSemana(user)` devuelve `IAgendaClient[]` por día con `rotacionClienteId`
  - `GET /ciclo/actual` y `/ciclo/preview` devuelven `{ semanas: number[]; semanasPendientes: number[] }`

- [ ] **Step 1: Write the failing test**

```typescript
// añadir a src/services/planificacion/AgendaService.spec.ts

it('la agenda de la semana sale del plan de la rotación, no de un snapshot del ciclo', async () => {
    mockedRequireCiclo.mockResolvedValue({
        id: 32, rotacionId: 7, codigoParticularVendedor: 'V 2', semana: 4,
        fechaLunes: '2026-08-10', fechaApertura: '2026-08-10T11:31:00.000Z',
        fechaCierre: null, estado: 'abierta',
    })
    // 4412 fue reacomodado de la semana 2 a la 4: aparece acá SIN ningún paso de
    // consumo, porque es la misma fila.
    mockedFindByRotacionYSemana.mockResolvedValue([
        { id: 103, rotacionId: 7, codigoParticularCliente: '4412', semana: 4, dia: 1 },
        { id: 105, rotacionId: 7, codigoParticularCliente: '7750', semana: 4, dia: 2 },
    ])
    mockedCards.mockResolvedValue(
        new Map([
            ['4412', { codigoParticularCliente: '4412', nombreCliente: 'A' } as any],
            ['7750', { codigoParticularCliente: '7750', nombreCliente: 'B' } as any],
        ]),
    )
    mockedResolucionesPorFila.mockResolvedValue(new Map())
    mockedRubrosPendientesPorVisita.mockResolvedValue(new Map())

    const semana = await AgendaService.getSemana(user)

    expect(semana.LUN.map(c => c.rotacionClienteId)).toEqual([103])
    expect(semana.MAR.map(c => c.rotacionClienteId)).toEqual([105])
    expect(semana.LUN[0].estado).toBe('pendiente')
})

it('el set de semanas viaja en la respuesta para que el front no clave el 5', async () => {
    mockedSemanasDelSet.mockResolvedValue([1, 2, 3, 4])
    mockedSemanasHechas.mockResolvedValue([2])

    const res = await AgendaService.getContextoRotacion(7)

    expect(res).toEqual({ semanas: [1, 2, 3, 4], semanasPendientes: [1, 3, 4] })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/planificacion/AgendaService.spec.ts`
Expected: FAIL — `findByRotacionYSemana is not a function` / `getContextoRotacion is not a function`

- [ ] **Step 3: Write minimal implementation**

En `AgendaService`, reemplazar las lecturas de `CicloClienteRepository` por
`RotacionClienteRepository.findByRotacionYSemana(ciclo.rotacionId, ciclo.semana)`, y mapear
`cicloClienteId` → `rotacionClienteId`. Agregar:

```typescript
    /**
     * El set de semanas del vendedor y cuáles faltan. Viaja en `/ciclo/actual` y
     * `/ciclo/preview` para que el front pueda borrar su `SEMANAS = 5`: no son siempre
     * cinco ni necesariamente contiguas.
     */
    static async getContextoRotacion(
        rotacionId: number,
    ): Promise<{ semanas: number[]; semanasPendientes: number[] }> {
        const semanas = await RotacionClienteRepository.semanasDelSet(rotacionId)
        const semanasPendientes = await RotacionService.semanasPendientes(rotacionId)
        return { semanas, semanasPendientes }
    }
```

Y en `planificacionController.ts`, reemplazar la validación de rango:

```typescript
/**
 * La semana válida es la que está en el SET de la rotación del vendedor, no un número
 * entre 1 y 5: hay vendedores con cuatro semanas y sets no contiguos.
 */
function parseSemana(raw: unknown): number | null {
    const semana = Number(raw)
    return Number.isInteger(semana) && semana >= 1 ? semana : null
}
```

La pertenencia al set la valida el servicio (`asegurar`, `reacomodar`), que es el único que
conoce la rotación. El controller solo descarta lo que no es un entero positivo.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/planificacion/AgendaService.spec.ts`
Expected: PASS

- [ ] **Step 5: Run the whole suite and fix the fallout**

Run: `npm test`
Expected: PASS. Los specs que todavía referencien `cicloClienteId`, `'reagendada'` o `enPlan` fallan: migrarlos.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(planificacion): la agenda lee el plan de la rotacion y expone el set de semanas"
```

---

### Task 14: Analítica sin `en_plan` ni `reagendados`

**Files:**
- Modify: `src/repositories/AnaliticaRepository.ts:100-130`
- Modify: `src/services/planificacion/indicadores/cobertura.ts`
- Test: `src/services/planificacion/indicadores/cobertura.spec.ts`, `src/services/planificacion/AnaliticaService.spec.ts`

**Interfaces:**
- Consumes: `pl_rotacion_cliente`.
- Produces: `ICoberturaRow` / `IIndicadorCobertura` sin `reagendados`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/planificacion/indicadores/cobertura.spec.ts

it('ya no hay bucket reagendados: mover un cliente no es una resolución', () => {
    const [indicador] = [
        ...reducirCobertura([
            {
                vendedor: 'V 2',
                planificados: '8',
                visitados: '1',
                en_curso: '0',
                no_visita: '1',
                pendientes: '6',
                ciclos_en_curso: '1',
            },
        ]).values(),
    ]

    expect(indicador).not.toHaveProperty('reagendados')
    expect(indicador.planificados).toBe(8)
    expect(indicador.cobertura).toBeCloseTo(1 / 8)
})

it('la suma de los buckets cubre el total planificado', () => {
    const [i] = [
        ...reducirCobertura([
            {
                vendedor: 'V 2', planificados: '8', visitados: '1', en_curso: '0',
                no_visita: '1', pendientes: '6', ciclos_en_curso: '1',
            },
        ]).values(),
    ]
    expect(i.visitados + i.enCurso + i.noVisita + i.pendientes).toBe(i.planificados)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/planificacion/indicadores/cobertura.spec.ts`
Expected: FAIL — el objeto todavía tiene `reagendados` y el tipo exige la propiedad

- [ ] **Step 3: Write minimal implementation**

Borrar `reagendados` de `ICoberturaRow`, de `IIndicadorCobertura` y del objeto que arma
`reducirCobertura`. En `AnaliticaRepository`, reescribir el `JOIN` de cobertura:

```sql
-- antes: JOIN pl_ciclo_cliente cc ON cc.ciclo_semana_id = cs.id AND cc.en_plan = 1
-- El plan vive en la rotación: se cruza por (rotacion_id, semana). Sin filtro de
-- en_plan porque esa columna ya no existe: no hay filas fuera del plan.
   JOIN pl_rotacion_cliente rc ON rc.rotacion_id = cs.rotacion_id
                              AND rc.semana      = cs.semana
   LEFT JOIN pl_resolucion r   ON r.rotacion_cliente_id = rc.id
```

y borrar la columna `SUM(r.tipo = 'reagendada') AS reagendados` del `SELECT`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/planificacion/indicadores src/services/planificacion/AnaliticaService.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/repositories/AnaliticaRepository.ts src/services/planificacion/indicadores src/services/planificacion/AnaliticaService.spec.ts
git commit -m "refactor(planificacion): analitica contra pl_rotacion_cliente, sin en_plan ni reagendados"
```

---

### Task 15: Verificación end-to-end contra la base local

Antes de escribir la migración hay que ver el ciclo completo funcionando contra MySQL real. Los tests unitarios mockean todo: esto es lo que valida el SQL crudo, las FK y los `UNIQUE`.

**Files:**
- Create: `scripts/smoke-rotacion.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: un script que reproduce el "Ejemplo completo" del spec e imprime los conteos.

- [ ] **Step 1: Escribir el script**

```typescript
// scripts/smoke-rotacion.ts
// Reproduce el "Ejemplo completo" del spec contra la base local. NO es un test de
// jest: verifica lo que los mocks no pueden — SQL crudo, FKs y UNIQUEs reales.
//
// Correr: npx ts-node scripts/smoke-rotacion.ts
import { sequelizeWritePlanificacion } from '../src/database/connection'
import { RotacionService } from '../src/services/planificacion/RotacionService'
import { RotacionClienteRepository } from '../src/repositories/RotacionClienteRepository'
import { RotacionRepository } from '../src/repositories/RotacionRepository'

const VENDEDOR = 'V 2'

/** Assert propio: el script tiene que FALLAR, no imprimir un número distinto. */
function chequear(descripcion: string, condicion: boolean, detalle: string): void {
    if (!condicion) {
        throw new Error(`✗ ${descripcion} — ${detalle}`)
    }
    console.log(`✓ ${descripcion} · ${detalle}`)
}

async function main() {
    const rotacionId = await RotacionService.materializar(VENDEDOR)
    const set = await RotacionClienteRepository.semanasDelSet(rotacionId)
    const plan = await RotacionClienteRepository.findByRotacion(rotacionId)

    chequear('el plan se materializó', plan.length > 0, `${plan.length} clientes`)
    chequear('el set de semanas no está vacío', set.length > 0, `semanas ${set.join(',')}`)
    chequear(
        'el set no se asume de 5 ni contiguo',
        set.every(s => s >= 1),
        `set = [${set.join(',')}]`,
    )

    const [primera] = plan
    const destino = set.find(s => s !== primera.semana) ?? primera.semana
    await RotacionClienteRepository.mover(primera.id, destino, 1, 'gerencia', 'smoke')

    const movida = await RotacionClienteRepository.findById(primera.id)
    chequear(
        'reacomodar movió la fila',
        movida!.semana === destino && movida!.dia === 1,
        `s${primera.semana}d${primera.dia} → s${movida!.semana}d${movida!.dia}`,
    )

    const bitacora = await sequelizeWritePlanificacion.query<{ n: number }>(
        'SELECT COUNT(*) AS n FROM pl_reacomodacion WHERE rotacion_cliente_id = :id',
        { replacements: { id: primera.id }, type: QueryTypes.SELECT },
    )
    chequear('el movimiento dejó bitácora', Number(bitacora[0].n) === 1, `${bitacora[0].n} fila`)

    const total = await RotacionClienteRepository.findByRotacion(rotacionId)
    chequear(
        'reacomodar NO cambió el denominador de la rotación',
        total.length === plan.length,
        `${plan.length} → ${total.length}`,
    )

    const pendientes = await RotacionService.semanasPendientes(rotacionId)
    chequear(
        'sin ciclos todavía, todas las semanas están pendientes',
        pendientes.length === set.length,
        `pendientes = [${pendientes.join(',')}]`,
    )

    // Limpieza: el script es re-ejecutable. La bitácora va primero por la FK.
    await sequelizeWritePlanificacion.query(
        `DELETE m FROM pl_reacomodacion m
           JOIN pl_rotacion_cliente rc ON rc.id = m.rotacion_cliente_id
          WHERE rc.rotacion_id = :rotacionId`,
        { replacements: { rotacionId } },
    )
    await sequelizeWritePlanificacion.query(
        'DELETE FROM pl_rotacion_cliente WHERE rotacion_id = :rotacionId',
        { replacements: { rotacionId } },
    )
    await RotacionRepository.cerrar(rotacionId)
    await sequelizeWritePlanificacion.query('DELETE FROM pl_rotacion WHERE id = :rotacionId', {
        replacements: { rotacionId },
    })

    await sequelizeWritePlanificacion.close()
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
```

- [ ] **Step 2: Correrlo contra la base local**

```bash
docker compose -f docker-compose.local.yml exec app-vendedores-staging npx ts-node scripts/smoke-rotacion.ts
```

Expected: imprime el conteo de clientes, el set de semanas del vendedor `V 2`, el
reacomodado con su origen y destino, y **el denominador igual antes y después**.

- [ ] **Step 3: Verificar los `UNIQUE` a mano**

```bash
docker exec api-vendedores-mysql-local mysql -uroot -pdevaokitech planificacion -e "
INSERT INTO pl_rotacion (codigo_particular_vendedor, fecha_inicio) VALUES ('SMOKE', NOW());
INSERT INTO pl_rotacion (codigo_particular_vendedor, fecha_inicio) VALUES ('SMOKE', NOW());"
```

Expected: el segundo INSERT falla con `Duplicate entry 'SMOKE' for key 'uq_una_rotacion_abierta'`.
Limpiar después: `DELETE FROM pl_rotacion WHERE codigo_particular_vendedor = 'SMOKE';`

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-rotacion.ts
git commit -m "test(planificacion): smoke end-to-end del plan de rotacion contra MySQL local"
```

---

### Task 16: Migración de producción

Última, cuando el esquema ya no se mueve. **No se escribe antes:** cada iteración previa la habría invalidado.

**Files:**
- Create: `docs/db-notes/planificacion-migracion-rotacion.sql`

**Interfaces:**
- Consumes: el esquema final (Task 2).
- Produces: el script que ops aplica en producción, con conteos de verificación.

- [ ] **Step 1: Restaurar el fixture del esquema viejo en una base aparte**

El fixture está en el scratchpad de la sesión (`planificacion-esquema-viejo-fixture.sql`, 2 ciclos / 85 clientes / 7 resoluciones). Copiarlo al repo primero para que no se pierda:

```bash
mkdir -p docs/db-notes/fixtures
cp "<scratchpad>/planificacion-esquema-viejo-fixture.sql" docs/db-notes/fixtures/
sed -i 's/`planificacion`/`planificacion_migracion`/g; s/DATABASE planificacion/DATABASE planificacion_migracion/g' docs/db-notes/fixtures/planificacion-esquema-viejo-fixture.sql
docker exec -i api-vendedores-mysql-local mysql -uroot -pdevaokitech < docs/db-notes/fixtures/planificacion-esquema-viejo-fixture.sql
```

- [ ] **Step 2: Tomar los conteos de referencia**

```bash
docker exec api-vendedores-mysql-local mysql -uroot -pdevaokitech planificacion_migracion -N -B -e "
SELECT 'ciclos', COUNT(*) FROM pl_ciclo_semana
UNION ALL SELECT 'plan', COUNT(*) FROM pl_ciclo_cliente
UNION ALL SELECT 'resoluciones', COUNT(*) FROM pl_resolucion;"
```

Anotar los tres números: la migración tiene que preservarlos exactamente.

- [ ] **Step 3: Escribir la migración**

```sql
-- docs/db-notes/planificacion-migracion-rotacion.sql
--
-- Migración del plan congelado por ciclo (pl_ciclo_cliente) al plan de rotación
-- editable (pl_rotacion_cliente). Spec:
-- app-planificacion/docs/superpowers/specs/2026-08-10-plan-rotacion-editable-design.md
--
-- NO ES REVERSIBLE: cambia de qué cuelgan las resoluciones. Backup antes.
--
-- Sobre las rotaciones del historial: se fabrica UNA por vendedor y se le cuelga todo
-- lo ya cerrado. No se intenta reconstruir dónde empezaba y terminaba cada rotación
-- porque el dato no existe — antes de esta entrega nadie lo guardaba.

START TRANSACTION;

-- ① Tablas nuevas
CREATE TABLE pl_rotacion (
  id                         INT AUTO_INCREMENT PRIMARY KEY,
  codigo_particular_vendedor VARCHAR(50) NOT NULL,
  fecha_inicio               DATETIME    NOT NULL,
  fecha_fin                  DATETIME    NULL,
  vendedor_abierta VARCHAR(50)
    AS (IF(fecha_fin IS NULL, codigo_particular_vendedor, NULL)) STORED,
  UNIQUE KEY uq_una_rotacion_abierta (vendedor_abierta),
  INDEX idx_vendedor (codigo_particular_vendedor)
);

CREATE TABLE pl_rotacion_cliente (
  id                        INT         AUTO_INCREMENT PRIMARY KEY,
  rotacion_id               INT         NOT NULL,
  codigo_particular_cliente VARCHAR(50) NOT NULL,
  semana                    TINYINT     NOT NULL,
  dia                       TINYINT     NOT NULL,
  UNIQUE KEY uq_rotacion_cliente (rotacion_id, codigo_particular_cliente),
  INDEX idx_semana (rotacion_id, semana),
  FOREIGN KEY (rotacion_id) REFERENCES pl_rotacion (id),
  CONSTRAINT ck_rc_semana CHECK (semana >= 1),
  CONSTRAINT ck_rc_dia    CHECK (dia BETWEEN 1 AND 5)
);

-- Bitácora de movimientos. Nace vacía: el historial migrado no tiene movimientos que
-- registrar, porque antes de esta entrega el plan no se podía editar.
CREATE TABLE pl_reacomodacion (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  rotacion_cliente_id INT          NOT NULL,
  semana_antes        TINYINT      NOT NULL,
  dia_antes           TINYINT      NOT NULL,
  semana_despues      TINYINT      NOT NULL,
  dia_despues         TINYINT      NOT NULL,
  origen              VARCHAR(20)  NOT NULL,
  usuario             VARCHAR(100) NOT NULL,
  fecha               DATETIME     NOT NULL,
  INDEX idx_rotacion_cliente (rotacion_cliente_id),
  INDEX idx_fecha (fecha),
  FOREIGN KEY (rotacion_cliente_id) REFERENCES pl_rotacion_cliente (id)
);

-- ② Una rotación por vendedor con historial. Queda ABIERTA (fecha_fin NULL) para que el
-- vendedor siga trabajando sobre ella sin rematerializar.
INSERT INTO pl_rotacion (codigo_particular_vendedor, fecha_inicio)
SELECT codigo_particular_vendedor, MIN(fecha_apertura)
  FROM pl_ciclo_semana
 GROUP BY codigo_particular_vendedor;

-- ③ pl_ciclo_semana gana rotacion_id y fecha_lunes.
ALTER TABLE pl_ciclo_semana
  ADD COLUMN rotacion_id INT  NULL,
  ADD COLUMN fecha_lunes DATE NULL;

UPDATE pl_ciclo_semana cs
  JOIN pl_rotacion ro
    ON ro.codigo_particular_vendedor = cs.codigo_particular_vendedor
   SET cs.rotacion_id = ro.id,
       -- El lunes de la semana laboral de la apertura, en TZ de negocio. Lunes a
       -- viernes caen en su propia semana; sábado y domingo redondean hacia adelante,
       -- igual que lunesDeLaSemana() en el código.
       cs.fecha_lunes = CASE DAYOFWEEK(CONVERT_TZ(cs.fecha_apertura, '+00:00', '-03:00'))
         WHEN 1 THEN DATE(CONVERT_TZ(cs.fecha_apertura, '+00:00', '-03:00')) + INTERVAL 1 DAY
         WHEN 7 THEN DATE(CONVERT_TZ(cs.fecha_apertura, '+00:00', '-03:00')) + INTERVAL 2 DAY
         ELSE DATE(CONVERT_TZ(cs.fecha_apertura, '+00:00', '-03:00'))
              - INTERVAL (DAYOFWEEK(CONVERT_TZ(cs.fecha_apertura, '+00:00', '-03:00')) - 2) DAY
       END;

ALTER TABLE pl_ciclo_semana
  MODIFY COLUMN rotacion_id INT  NOT NULL,
  MODIFY COLUMN fecha_lunes DATE NOT NULL,
  ADD UNIQUE KEY uq_rotacion_semana (rotacion_id, semana),
  ADD FOREIGN KEY (rotacion_id) REFERENCES pl_rotacion (id);

-- ④ Volcar el plan. Un cliente puede aparecer en varios ciclos del historial y el
-- UNIQUE admite una sola fila por rotación: gana la posición del ciclo más reciente.
--
-- La fila ganadora se elige EXPLÍCITAMENTE con ROW_NUMBER() y no con
-- `ORDER BY ... ON DUPLICATE KEY UPDATE`. Esa segunda forma funciona en la práctica
-- porque el INSERT..SELECT inserta en orden, pero es un comportamiento del motor y no
-- un contrato — y esta migración no es reversible.
INSERT INTO pl_rotacion_cliente (rotacion_id, codigo_particular_cliente, semana, dia)
SELECT rotacion_id, codigo_particular_cliente, semana, dia
  FROM (
    SELECT cs.rotacion_id,
           cc.codigo_particular_cliente,
           cs.semana,
           cc.dia,
           ROW_NUMBER() OVER (
               PARTITION BY cs.rotacion_id, cc.codigo_particular_cliente
               ORDER BY cs.fecha_apertura DESC, cs.id DESC
           ) AS rn
      FROM pl_ciclo_cliente cc
      JOIN pl_ciclo_semana cs ON cs.id = cc.ciclo_semana_id
  ) ranked
 WHERE rn = 1;

-- ⑤ Repuntar las resoluciones.
ALTER TABLE pl_resolucion ADD COLUMN rotacion_cliente_id INT NULL;

UPDATE pl_resolucion r
  JOIN pl_ciclo_cliente cc ON cc.id = r.ciclo_cliente_id
  JOIN pl_ciclo_semana  cs ON cs.id = cc.ciclo_semana_id
  JOIN pl_rotacion_cliente rc
    ON rc.rotacion_id = cs.rotacion_id
   AND rc.codigo_particular_cliente = cc.codigo_particular_cliente
   SET r.rotacion_cliente_id = rc.id;

COMMIT;

-- ⑥ VERIFICACIÓN — correr ANTES de ⑦. Las tres filas tienen que dar 0.
SELECT 'resoluciones sin repuntar' AS chequeo, COUNT(*) AS debe_ser_cero
  FROM pl_resolucion WHERE rotacion_cliente_id IS NULL
UNION ALL
SELECT 'clientes del plan viejo que no llegaron', COUNT(*) FROM (
    SELECT DISTINCT cs.rotacion_id, cc.codigo_particular_cliente
      FROM pl_ciclo_cliente cc JOIN pl_ciclo_semana cs ON cs.id = cc.ciclo_semana_id
) v
LEFT JOIN pl_rotacion_cliente rc
       ON rc.rotacion_id = v.rotacion_id
      AND rc.codigo_particular_cliente = v.codigo_particular_cliente
WHERE rc.id IS NULL
UNION ALL
SELECT 'ciclos sin rotacion', COUNT(*) FROM pl_ciclo_semana WHERE rotacion_id IS NULL;

-- ⑦ Recién con los tres ceros: sellar y dropear.
-- ALTER TABLE pl_resolucion
--   MODIFY COLUMN rotacion_cliente_id INT NOT NULL,
--   DROP FOREIGN KEY <nombre_de_la_fk_a_pl_ciclo_cliente>,
--   DROP COLUMN ciclo_cliente_id,
--   ADD UNIQUE KEY uq_resolucion (rotacion_cliente_id),
--   ADD FOREIGN KEY (rotacion_cliente_id) REFERENCES pl_rotacion_cliente (id);
-- DROP TABLE pl_ciclo_cliente;
--
-- El nombre real de la FK sale de:
--   SELECT constraint_name FROM information_schema.key_column_usage
--    WHERE table_name = 'pl_resolucion' AND column_name = 'ciclo_cliente_id';
```

- [ ] **Step 4: Correr la migración contra el fixture y verificar**

```bash
docker exec -i api-vendedores-mysql-local mysql -uroot -pdevaokitech planificacion_migracion \
  < docs/db-notes/planificacion-migracion-rotacion.sql
```

Expected: la query de verificación ⑥ devuelve **0 en las tres filas**. Y:

```bash
docker exec api-vendedores-mysql-local mysql -uroot -pdevaokitech planificacion_migracion -N -B -e "
SELECT 'resoluciones', COUNT(*) FROM pl_resolucion
UNION ALL SELECT 'rotaciones', COUNT(*) FROM pl_rotacion
UNION ALL SELECT 'plan nuevo', COUNT(*) FROM pl_rotacion_cliente;"
```

Expected: `resoluciones` = el número anotado en el Step 2 (7). `rotaciones` = cantidad de
vendedores distintos (2). `plan nuevo` = la cantidad de pares `(vendedor, cliente)`
distintos del plan viejo — el `ROW_NUMBER() = 1` colapsa un cliente que aparecía en
varios ciclos. Ese número se puede calcular de antemano contra el fixture:

```sql
SELECT COUNT(*) FROM (
  SELECT DISTINCT cs.codigo_particular_vendedor, cc.codigo_particular_cliente
    FROM pl_ciclo_cliente cc JOIN pl_ciclo_semana cs ON cs.id = cc.ciclo_semana_id
) v;
```

- [ ] **Step 5: Limpiar la base de prueba**

```bash
docker exec api-vendedores-mysql-local mysql -uroot -pdevaokitech -e "DROP DATABASE planificacion_migracion;"
```

- [ ] **Step 6: Commit**

```bash
git add docs/db-notes/planificacion-migracion-rotacion.sql docs/db-notes/fixtures/
git commit -m "feat(planificacion): migracion de produccion al plan de rotacion, probada contra fixture"
```

---

## Lo que queda para el plan del front

No entra en este plan y no se puede empezar antes: el contrato de las acciones cambia acá.

- `operable` pasa de `ciclo != null && semanaEfectiva === ciclo.semana` a "con ciclo abierto solo esa semana; en standby, la que se está mirando".
- Se borran `CerrarSemanaSheet.tsx`, `useCerrarCiclo` y el CTA de abrir semana.
- Se va `SEMANAS = 5` (`AgendaSemanaPage.tsx:27, 94, 212`): el set viene de la API y `moverSemana` lo recorre.
- `EstadoVisitaSheet` gana la sección "Otra semana" con los días de las semanas pendientes.
- Cartel del 409 `CAMBIO_DE_SEMANA`, con la opción de reacomodar antes de cerrar.
- Avisos de `sincronizar` (cierre y altas/bajas de padrón) con `useNotificacion`.
- Se borra el cableado muerto de `reagendada`: tipos, `estadoCicloCliente`, badge de `ClienteCard.tsx:101`, rama de `estaResuelto`.
- `cicloClienteId` → `rotacionClienteId` en todo el cliente de API.
