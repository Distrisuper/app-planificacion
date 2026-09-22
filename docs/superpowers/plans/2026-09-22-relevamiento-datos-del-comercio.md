# Relevamiento "Datos del comercio" — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir la ficha del comercio (especialidad, personas, facturación) en tablas propias de
`planificacion`, hacer que el gate de "Datos del comercio" lea del backend qué le falta a cada cliente
y pida sólo eso antes de iniciar la visita, y permitir corregirla después desde la visita.

**Architecture:** Dos tablas nuevas en MySQL `planificacion` (`pl_ficha_campo` catálogo,
`pl_ficha_valor` una fila por dato, vigente = `reemplazado_en IS NULL`), un `PUT
/planificacion/clientes/:codigo/ficha` transaccional, y `ficha: { pendientes, valores }` en cada card
de la agenda calculado en `AgendaService.enriquecer`. El front reemplaza el mock `return true` por
`cliente.ficha.pendientes`, hace el `PUT` **antes** del POST de la visita y lo condiciona, y agrega
un chip "Datos del comercio" en el header de `VisitaSheet` para editar. **Nada sale hacia el ERP**:
eso lo hace un cron ajeno leyendo `codigo_erp` y `sincronizado_en`.

**Tech Stack:** api-vendedores: Node + TypeScript + Express + Sequelize (MySQL) + Jest.
app-planificacion: Vite + React 19 + TypeScript + React Query v5 + Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-22-relevamiento-datos-del-comercio-design.md`

## Global Constraints

- **Repos.** api-vendedores vive en
  `C:\Users\matia\OneDrive\Documentos\distri\business-platform\versus\api-vendedores` (NO la ruta de
  CLAUDE.md, que no existe; NO `distri\vendedores\api-vendedores`, que es un clon viejo). Confirmar con
  `git log --oneline -1` que se ve historia `feat(planificacion)`. Hacer `git pull` en `master` y
  ramificar `feat/ficha-cliente` antes de tocar nada.
- **Warehouse intocable.** Ninguna tabla, columna ni query nueva sobre `analytics.*` que no exista ya.
- **Vocabulario de vendedor.** En UI siempre "Datos del comercio". Nunca "ficha", "relevamiento",
  "perfil", "campos dinámicos", "sincronizar".
- **Valores como strings con el formato del ERP.** Especialidad: códigos del catálogo del front
  (`'frenos'`, `'monomarca'`…). Personas: entero como texto (`'3'`), rango 1–999. Facturación: código
  invertido del negocio como texto (`'5'` = menor a 10M … `'1'` = mayor a 100M). `monomarca_marca`:
  texto libre trimmeado, 1–60 chars.
- **Vendedor de prueba y altas guardan igual.** `PRUEBA-<userId>` y `ALTA-<id>` son códigos válidos en
  `pl_ficha_valor`. No hay push, así que no hay guarda que aplicar acá.
- **Orden en el front:** `PUT ficha` → OK → `onIniciar` (GPS + POST visita). Si el `PUT` falla, la
  visita NO arranca.
- **Tests:** api-vendedores `npx jest <ruta>`; app-planificacion `npx vitest run <ruta>` y
  `npx tsc --noEmit`. Suite completa del front antes de cada commit que toque `VisitaFlow`.
- **Commits** en español, prefijo `feat(ficha):` / `test(ficha):` / `docs(ficha):`, y terminan con
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## Mapa de archivos

### api-vendedores

| archivo | responsabilidad |
|---|---|
| `docs/db-notes/planificacion-ficha-cliente.sql` (crear) | DDL + seed de `pl_ficha_campo` y `pl_ficha_valor` |
| `docs/db-notes/planificacion-ciclo-tables.sql` (modificar, al final) | mismo DDL en el consolidado |
| `src/models/planificacion/FichaCampo.ts`, `FichaValor.ts` (crear) | modelos Sequelize |
| `src/types/planificacion.ts` (modificar) | `IFichaCampo`, `IFichaCliente`, `IActualizarFichaDTO`, `ficha` en `IAgendaClient` |
| `src/repositories/FichaRepository.ts` (+spec, crear) | catálogo, vigentes por clientes, reemplazar en transacción |
| `src/services/planificacion/fichaCliente.ts` (+spec, crear) | puro: catálogo + vigentes → `IFichaCliente` |
| `src/services/planificacion/fichaValidation.ts` (+spec, crear) | puro: valida el body del `PUT` contra catálogo y dominios |
| `src/services/planificacion/FichaService.ts` (+spec, crear) | cartera/alta propia, transacción, respuesta |
| `src/controllers/planificacionController.ts` (modificar) | `actualizarFicha` |
| `src/routes/planificacion.ts` (modificar) | `PUT /clientes/:codigo/ficha` |
| `src/services/planificacion/AgendaService.ts` (+spec, modificar) | `enriquecer` suma `ficha` |

### app-planificacion

| archivo | responsabilidad |
|---|---|
| `src/types/planificacion.ts` (modificar) | `IFichaCliente`, `ficha?` en `IAgendaClient` |
| `src/api/planificacion.ts` (+test, modificar) | `actualizarFicha` |
| `src/lib/relevamientos.ts` (+test nuevo, modificar) | `CAMPOS_FICHA`, `relevamientoPendiente(cliente)`, `faltantesPerfil(b, campos)`, `aValoresFicha`, `deValoresFicha` |
| `src/hooks/useFicha.ts` (+test, crear) | `useActualizarFicha` con `setQueryData` sobre la agenda |
| `src/components/relevamiento/PerfilComercioSheet.tsx` (+test, modificar) | props `campos`, `modo`, `valoresIniciales`, `guardando`, `error` |
| `src/components/VisitaFlow.tsx` (+test, modificar) | gate real, `PUT` antes del POST, edición |
| `src/components/VisitaSheet.tsx` (+test, modificar) | chip "Datos del comercio" |
| `src/pages/AgendaSemanaPage.test.tsx` (modificar) | sacar el mock de `relevamientoPendiente` |
| `CLAUDE.md`, `docs/dominio/tablas.md` (modificar) | decisión y esquema |

---

## PARTE A — api-vendedores

### Task 1: DDL, modelos y tipos

**Files:**
- Create: `docs/db-notes/planificacion-ficha-cliente.sql`
- Modify: `docs/db-notes/planificacion-ciclo-tables.sql` (append al final)
- Create: `src/models/planificacion/FichaCampo.ts`
- Create: `src/models/planificacion/FichaValor.ts`
- Modify: `src/types/planificacion.ts`

**Interfaces:**
- Produces: modelos `FichaCampo` (`campo, descripcion, obligatorio, multiple, codigoErp, orden`) y
  `FichaValor` (`id, codigoParticularCliente, campo, valor, relevadoPor, relevadoEn, reemplazadoEn,
  sincronizadoEn`); tipos `IFichaCampo`, `IFichaCliente`, `IActualizarFichaDTO`; `ficha: IFichaCliente`
  requerido en `IAgendaClient`.

- [ ] **Step 1: Escribir el DDL**

`docs/db-notes/planificacion-ficha-cliente.sql`:

```sql
-- Ficha del comercio ("Datos del comercio"): lo que el vendedor releva parado en el local antes
-- de abrir la visita. Spec: app-planificacion,
-- docs/superpowers/specs/2026-09-22-relevamiento-datos-del-comercio-design.md
--
-- Dos tablas: un catálogo de campos y una fila por dato declarado. NO una columna por dato:
-- es la misma forma que `camposDinamicos` del ERP (pares {codigo, valor}), que es donde estos
-- datos terminan. La sincronización hacia el ERP la hace un proceso AJENO leyendo
-- `codigo_erp` (catálogo) y `sincronizado_en` (valor). Este dominio sólo guarda.
--
-- Vigente = reemplazado_en IS NULL. Corregir cierra las filas vigentes del campo e inserta
-- nuevas: el valor nunca se pisa, la historia queda.

USE planificacion;

CREATE TABLE IF NOT EXISTS pl_ficha_campo (
  campo        VARCHAR(40)  PRIMARY KEY,   -- 'especialidad' | 'monomarca_marca' | 'personas' | 'facturacion'
  descripcion  VARCHAR(120) NOT NULL,
  obligatorio  TINYINT(1)   NOT NULL DEFAULT 1,
  multiple     TINYINT(1)   NOT NULL DEFAULT 0,  -- 1 = admite varias filas vigentes (especialidad)
  codigo_erp   INT          NULL,               -- código del campo dinámico en el ERP. NULL = todavía no existe allá
  orden        TINYINT      NOT NULL
);

INSERT IGNORE INTO pl_ficha_campo (campo, descripcion, obligatorio, multiple, codigo_erp, orden) VALUES
  ('especialidad',    'Especialidad del comercio',     1, 1, NULL, 1),
  ('monomarca_marca', 'Marca, si es monomarca',        0, 0, NULL, 2),
  ('personas',        'Personas que trabajan',         1, 0, NULL, 3),
  ('facturacion',     'Tramo de facturación mensual',  1, 0, NULL, 4);

CREATE TABLE IF NOT EXISTS pl_ficha_valor (
  id                        INT          AUTO_INCREMENT PRIMARY KEY,
  codigo_particular_cliente VARCHAR(50)  NOT NULL,   -- cliente real, ALTA-<id> o el del vendedor de prueba
  campo                     VARCHAR(40)  NOT NULL,
  valor                     VARCHAR(100) NOT NULL,   -- string con el formato del ERP (ver spec §4.2)
  relevado_por              VARCHAR(50)  NOT NULL,   -- código de vendedor (o PRUEBA-<userId>)
  relevado_en               DATETIME     NOT NULL,
  reemplazado_en            DATETIME     NULL,       -- NULL = vigente
  sincronizado_en           DATETIME     NULL,       -- NULL = no llegó al ERP. Lo marca el cron ajeno
  INDEX idx_vigente (codigo_particular_cliente, campo, reemplazado_en),
  INDEX idx_sin_sincronizar (sincronizado_en, reemplazado_en),
  CONSTRAINT fk_fv_campo FOREIGN KEY (campo) REFERENCES pl_ficha_campo (campo)
);
```

Copiar el mismo bloque (sin el `USE`) al final de `docs/db-notes/planificacion-ciclo-tables.sql`,
precedido por el comentario `-- ⑫ FICHA DEL COMERCIO (spec 2026-09-22)` (ajustar el número al
siguiente de la numeración circulada que ya usa ese archivo).

- [ ] **Step 2: Correr el DDL en la base local**

```bash
mysql -h 127.0.0.1 -u root -p planificacion < docs/db-notes/planificacion-ficha-cliente.sql
mysql -h 127.0.0.1 -u root -p planificacion -e "SELECT campo, obligatorio, multiple FROM pl_ficha_campo ORDER BY orden"
```

Esperado: 4 filas, `especialidad` con `multiple=1`, `monomarca_marca` con `obligatorio=0`.
(Credenciales y host: los de `docker-compose.local.yml` del repo.)

- [ ] **Step 3: Modelo `FichaCampo`**

`src/models/planificacion/FichaCampo.ts`:

```ts
import { Model, DataTypes } from 'sequelize'
import { sequelizeWritePlanificacion } from '../../database/connection'

interface IFichaCampoAttributes {
    campo: string
    descripcion: string
    obligatorio: boolean
    multiple: boolean
    codigoErp: number | null
    orden: number
}

class FichaCampo extends Model<IFichaCampoAttributes> implements IFichaCampoAttributes {
    public campo!: string
    public descripcion!: string
    public obligatorio!: boolean
    public multiple!: boolean
    public codigoErp!: number | null
    public orden!: number
}

FichaCampo.init(
    {
        campo: { type: DataTypes.STRING(40), primaryKey: true },
        descripcion: { type: DataTypes.STRING(120), allowNull: false },
        obligatorio: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        multiple: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        codigoErp: { type: DataTypes.INTEGER, allowNull: true, field: 'codigo_erp' },
        orden: { type: DataTypes.TINYINT, allowNull: false },
    },
    {
        sequelize: sequelizeWritePlanificacion,
        modelName: 'FichaCampo',
        tableName: 'pl_ficha_campo',
        timestamps: false,
    },
)

export default FichaCampo
```

- [ ] **Step 4: Modelo `FichaValor`**

`src/models/planificacion/FichaValor.ts`:

```ts
import { Model, DataTypes, Optional } from 'sequelize'
import { sequelizeWritePlanificacion } from '../../database/connection'

interface IFichaValorAttributes {
    id: number
    codigoParticularCliente: string
    campo: string
    valor: string
    relevadoPor: string
    relevadoEn: Date
    reemplazadoEn: Date | null
    sincronizadoEn: Date | null
}

type IFichaValorCreation = Optional<IFichaValorAttributes, 'id' | 'reemplazadoEn' | 'sincronizadoEn'>

class FichaValor
    extends Model<IFichaValorAttributes, IFichaValorCreation>
    implements IFichaValorAttributes
{
    public id!: number
    public codigoParticularCliente!: string
    public campo!: string
    public valor!: string
    public relevadoPor!: string
    public relevadoEn!: Date
    public reemplazadoEn!: Date | null
    public sincronizadoEn!: Date | null
}

FichaValor.init(
    {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        codigoParticularCliente: {
            type: DataTypes.STRING(50),
            allowNull: false,
            field: 'codigo_particular_cliente',
        },
        campo: { type: DataTypes.STRING(40), allowNull: false },
        valor: { type: DataTypes.STRING(100), allowNull: false },
        relevadoPor: { type: DataTypes.STRING(50), allowNull: false, field: 'relevado_por' },
        relevadoEn: { type: DataTypes.DATE, allowNull: false, field: 'relevado_en' },
        reemplazadoEn: { type: DataTypes.DATE, allowNull: true, field: 'reemplazado_en' },
        sincronizadoEn: { type: DataTypes.DATE, allowNull: true, field: 'sincronizado_en' },
    },
    {
        sequelize: sequelizeWritePlanificacion,
        modelName: 'FichaValor',
        tableName: 'pl_ficha_valor',
        timestamps: false,
    },
)

export default FichaValor
```

- [ ] **Step 5: Tipos**

En `src/types/planificacion.ts`, cerca de `IVisitClientCard`:

```ts
/** Un campo del catálogo de la ficha del comercio (pl_ficha_campo). `codigoErp` null =
 *  el ERP todavía no tiene ese campo dinámico; el cron que sincroniza lo saltea. */
export interface IFichaCampo {
    campo: string
    descripcion: string
    obligatorio: boolean
    multiple: boolean
    codigoErp: number | null
    orden: number
}

/** Lo que el front necesita saber de la ficha de un cliente: qué falta (para el gate) y qué
 *  hay (para precargar la edición). Se calcula en AgendaService.enriquecer. */
export interface IFichaCliente {
    /** Campos obligatorios del catálogo sin valor vigente. Vacío = nada que pedir. */
    pendientes: string[]
    /** Valores vigentes por campo. Un campo `multiple` tiene varios. */
    valores: Record<string, string[]>
}

/** Body de PUT /planificacion/clientes/:codigo/ficha. Sólo los campos que se cargaron. */
export interface IActualizarFichaDTO {
    valores: Record<string, string[]>
}
```

Y en `IAgendaClient` (línea ~260), agregar después de `detalleAlta`:

```ts
    /** Ficha del comercio ("Datos del comercio"). Ver IFichaCliente. */
    ficha: IFichaCliente
```

- [ ] **Step 6: Compilar**

```bash
npx tsc --noEmit
```

Esperado: errores SOLO en `AgendaService.ts` (falta `ficha` al armar `IAgendaClient`) y en los
specs que construyen `IAgendaClient` a mano, si los hay. Anotarlos: se resuelven en Task 7. Si
hay otros errores, arreglarlos antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add docs/db-notes/planificacion-ficha-cliente.sql docs/db-notes/planificacion-ciclo-tables.sql src/models/planificacion/FichaCampo.ts src/models/planificacion/FichaValor.ts src/types/planificacion.ts
git commit -m "feat(ficha): tablas pl_ficha_campo y pl_ficha_valor, modelos y tipos

Una fila por dato declarado con la forma de camposDinamicos del ERP. Vigente =
reemplazado_en IS NULL; codigo_erp y sincronizado_en son el contrato con el cron
ajeno que sincroniza. Este dominio sólo guarda.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `FichaRepository`

**Files:**
- Create: `src/repositories/FichaRepository.ts`
- Create: `src/repositories/FichaRepository.spec.ts`

**Interfaces:**
- Consumes: modelos `FichaCampo`, `FichaValor` (Task 1).
- Produces:
  - `FichaRepository.findCatalogo(): Promise<IFichaCampo[]>` ordenado por `orden`.
  - `FichaRepository.findVigentesPorClientes(codigos: string[]): Promise<Map<string, Record<string, string[]>>>`
    — clave: código particular; valor: `{ campo: [valores] }`. Sólo clientes con alguna fila.
  - `FichaRepository.reemplazar(codigo: string, campo: string, valores: string[], vendedor: string, transaction: Transaction): Promise<void>`
    — cierra vigentes de `(codigo, campo)` e inserta `valores`.

- [ ] **Step 1: Test que falla**

`src/repositories/FichaRepository.spec.ts`:

```ts
import { FichaRepository } from './FichaRepository'
import FichaCampo from '../models/planificacion/FichaCampo'
import FichaValor from '../models/planificacion/FichaValor'

jest.mock('../models/planificacion/FichaCampo')
jest.mock('../models/planificacion/FichaValor')

const campo = (over: Record<string, unknown> = {}) => ({
    campo: 'especialidad', descripcion: 'Especialidad', obligatorio: true, multiple: true,
    codigoErp: null, orden: 1, ...over,
})
const valor = (over: Record<string, unknown> = {}) => ({
    id: 1, codigoParticularCliente: '10034', campo: 'especialidad', valor: 'frenos',
    relevadoPor: 'V 2', relevadoEn: new Date('2026-09-22T12:00:00Z'), reemplazadoEn: null,
    sincronizadoEn: null, ...over,
})

beforeEach(() => jest.clearAllMocks())

describe('findCatalogo', () => {
    it('mapea el catálogo ordenado por orden', async () => {
        ;(FichaCampo.findAll as jest.Mock).mockResolvedValue([campo(), campo({ campo: 'personas', multiple: false, orden: 3 })])
        const r = await FichaRepository.findCatalogo()
        expect(FichaCampo.findAll).toHaveBeenCalledWith({ order: [['orden', 'ASC']] })
        expect(r).toEqual([
            { campo: 'especialidad', descripcion: 'Especialidad', obligatorio: true, multiple: true, codigoErp: null, orden: 1 },
            { campo: 'personas', descripcion: 'Especialidad', obligatorio: true, multiple: false, codigoErp: null, orden: 3 },
        ])
    })
})

describe('findVigentesPorClientes', () => {
    it('sin códigos no consulta y devuelve un Map vacío', async () => {
        const r = await FichaRepository.findVigentesPorClientes([])
        expect(FichaValor.findAll).not.toHaveBeenCalled()
        expect(r.size).toBe(0)
    })

    it('agrupa por cliente y campo, sólo filas vigentes', async () => {
        ;(FichaValor.findAll as jest.Mock).mockResolvedValue([
            valor(), valor({ id: 2, valor: 'agro' }),
            valor({ id: 3, campo: 'personas', valor: '4' }),
            valor({ id: 4, codigoParticularCliente: '20001', campo: 'facturacion', valor: '3' }),
        ])
        const r = await FichaRepository.findVigentesPorClientes(['10034', '20001', '30000'])
        const where = (FichaValor.findAll as jest.Mock).mock.calls[0][0].where
        expect(where.reemplazadoEn).toBeNull()
        expect(r.get('10034')).toEqual({ especialidad: ['frenos', 'agro'], personas: ['4'] })
        expect(r.get('20001')).toEqual({ facturacion: ['3'] })
        expect(r.has('30000')).toBe(false)
    })
})

describe('reemplazar', () => {
    it('cierra las vigentes del campo y crea una fila por valor, en la transacción', async () => {
        const tx = {} as any
        ;(FichaValor.update as jest.Mock).mockResolvedValue([1])
        ;(FichaValor.bulkCreate as jest.Mock).mockResolvedValue([])
        await FichaRepository.reemplazar('10034', 'especialidad', ['frenos', 'agro'], 'V 2', tx)

        expect(FichaValor.update).toHaveBeenCalledWith(
            { reemplazadoEn: expect.any(Date) },
            { where: { codigoParticularCliente: '10034', campo: 'especialidad', reemplazadoEn: null }, transaction: tx },
        )
        const filas = (FichaValor.bulkCreate as jest.Mock).mock.calls[0][0]
        expect(filas).toHaveLength(2)
        expect(filas[0]).toMatchObject({ codigoParticularCliente: '10034', campo: 'especialidad', valor: 'frenos', relevadoPor: 'V 2' })
        expect(filas[1].valor).toBe('agro')
        expect((FichaValor.bulkCreate as jest.Mock).mock.calls[0][1]).toEqual({ transaction: tx })
    })
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
npx jest src/repositories/FichaRepository.spec.ts
```

Esperado: FAIL, `Cannot find module './FichaRepository'`.

- [ ] **Step 3: Implementar**

`src/repositories/FichaRepository.ts`:

```ts
import { Op, Transaction } from 'sequelize'
import FichaCampo from '../models/planificacion/FichaCampo'
import FichaValor from '../models/planificacion/FichaValor'
import { IFichaCampo } from '../types/planificacion'

/**
 * La ficha del comercio ("Datos del comercio"): catálogo de campos y una fila por dato
 * declarado. Vigente = reemplazadoEn null. Ver spec 2026-09-22 en app-planificacion.
 */
export class FichaRepository {
    static async findCatalogo(): Promise<IFichaCampo[]> {
        const rows = await FichaCampo.findAll({ order: [['orden', 'ASC']] })
        return rows.map(r => ({
            campo: r.campo,
            descripcion: r.descripcion,
            obligatorio: Boolean(r.obligatorio),
            multiple: Boolean(r.multiple),
            codigoErp: r.codigoErp ?? null,
            orden: r.orden,
        }))
    }

    /** Una sola query para toda la agenda. Sólo aparecen los clientes con alguna fila. */
    static async findVigentesPorClientes(
        codigos: string[],
    ): Promise<Map<string, Record<string, string[]>>> {
        const porCliente = new Map<string, Record<string, string[]>>()
        if (codigos.length === 0) return porCliente
        const rows = await FichaValor.findAll({
            where: { codigoParticularCliente: { [Op.in]: codigos }, reemplazadoEn: null },
            order: [['id', 'ASC']],
        })
        for (const r of rows) {
            const campos = porCliente.get(r.codigoParticularCliente) ?? {}
            ;(campos[r.campo] ??= []).push(r.valor)
            porCliente.set(r.codigoParticularCliente, campos)
        }
        return porCliente
    }

    /**
     * Corregir NO pisa: cierra las filas vigentes del campo e inserta las nuevas. Así la
     * historia (quién dijo qué y cuándo) sale gratis, como pl_reacomodacion para el plan.
     */
    static async reemplazar(
        codigoParticularCliente: string,
        campo: string,
        valores: string[],
        relevadoPor: string,
        transaction: Transaction,
    ): Promise<void> {
        const ahora = new Date()
        await FichaValor.update(
            { reemplazadoEn: ahora },
            { where: { codigoParticularCliente, campo, reemplazadoEn: null }, transaction },
        )
        await FichaValor.bulkCreate(
            valores.map(valor => ({
                codigoParticularCliente,
                campo,
                valor,
                relevadoPor,
                relevadoEn: ahora,
            })),
            { transaction },
        )
    }
}
```

- [ ] **Step 4: Correr y ver que pasa**

```bash
npx jest src/repositories/FichaRepository.spec.ts
```

Esperado: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/repositories/FichaRepository.ts src/repositories/FichaRepository.spec.ts
git commit -m "feat(ficha): FichaRepository — catálogo, vigentes por cliente, reemplazar en transacción

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `fichaValidation` — validar el body del `PUT`

**Files:**
- Create: `src/services/planificacion/fichaValidation.ts`
- Create: `src/services/planificacion/fichaValidation.spec.ts`

**Interfaces:**
- Consumes: `IFichaCampo` (Task 1).
- Produces:
  - `ESPECIALIDADES_FICHA: readonly string[]`, `TRAMOS_FACTURACION_FICHA: readonly string[]`, `PERSONAS_MAX_FICHA = 999`.
  - `validarValoresFicha(body: unknown, catalogo: IFichaCampo[]): { ok: true; valor: Record<string, string[]> } | { ok: false; code: string; mensaje: string }`
    — códigos: `FICHA_BODY_INVALIDO`, `FICHA_CAMPO_DESCONOCIDO`, `FICHA_VALOR_MULTIPLE`, `FICHA_VALOR_INVALIDO`, `FICHA_SIN_CAMPOS`.

- [ ] **Step 1: Test que falla**

`src/services/planificacion/fichaValidation.spec.ts`:

```ts
import { validarValoresFicha } from './fichaValidation'
import { IFichaCampo } from '../../types/planificacion'

const CATALOGO: IFichaCampo[] = [
    { campo: 'especialidad', descripcion: '', obligatorio: true, multiple: true, codigoErp: null, orden: 1 },
    { campo: 'monomarca_marca', descripcion: '', obligatorio: false, multiple: false, codigoErp: null, orden: 2 },
    { campo: 'personas', descripcion: '', obligatorio: true, multiple: false, codigoErp: null, orden: 3 },
    { campo: 'facturacion', descripcion: '', obligatorio: true, multiple: false, codigoErp: null, orden: 4 },
]
const ok = (valores: unknown) => validarValoresFicha({ valores }, CATALOGO)

it('acepta un body completo y lo devuelve normalizado (trim)', () => {
    const r = ok({ especialidad: ['frenos', 'monomarca'], monomarca_marca: [' Ford '], personas: ['4'], facturacion: ['3'] })
    expect(r).toEqual({ ok: true, valor: { especialidad: ['frenos', 'monomarca'], monomarca_marca: ['Ford'], personas: ['4'], facturacion: ['3'] } })
})
it('acepta un body parcial (sólo los campos pendientes)', () => {
    expect(ok({ facturacion: ['5'] })).toMatchObject({ ok: true, valor: { facturacion: ['5'] } })
})
it('body sin valores o vacío → FICHA_BODY_INVALIDO / FICHA_SIN_CAMPOS', () => {
    expect(validarValoresFicha({}, CATALOGO)).toMatchObject({ ok: false, code: 'FICHA_BODY_INVALIDO' })
    expect(validarValoresFicha(null, CATALOGO)).toMatchObject({ ok: false, code: 'FICHA_BODY_INVALIDO' })
    expect(ok({})).toMatchObject({ ok: false, code: 'FICHA_SIN_CAMPOS' })
})
it('campo fuera del catálogo → FICHA_CAMPO_DESCONOCIDO', () => {
    expect(ok({ color: ['rojo'] })).toMatchObject({ ok: false, code: 'FICHA_CAMPO_DESCONOCIDO' })
})
it('varios valores en un campo no múltiple → FICHA_VALOR_MULTIPLE', () => {
    expect(ok({ personas: ['4', '5'] })).toMatchObject({ ok: false, code: 'FICHA_VALOR_MULTIPLE' })
})
it('valor vacío o lista vacía → FICHA_VALOR_INVALIDO', () => {
    expect(ok({ especialidad: [] })).toMatchObject({ ok: false, code: 'FICHA_VALOR_INVALIDO' })
    expect(ok({ monomarca_marca: ['   '] })).toMatchObject({ ok: false, code: 'FICHA_VALOR_INVALIDO' })
})
it('especialidad fuera del catálogo del front → FICHA_VALOR_INVALIDO', () => {
    expect(ok({ especialidad: ['frenos', 'panaderia'] })).toMatchObject({ ok: false, code: 'FICHA_VALOR_INVALIDO' })
})
it('personas fuera de 1..999 o no entero → FICHA_VALOR_INVALIDO', () => {
    expect(ok({ personas: ['0'] })).toMatchObject({ ok: false, code: 'FICHA_VALOR_INVALIDO' })
    expect(ok({ personas: ['1000'] })).toMatchObject({ ok: false, code: 'FICHA_VALOR_INVALIDO' })
    expect(ok({ personas: ['4.5'] })).toMatchObject({ ok: false, code: 'FICHA_VALOR_INVALIDO' })
    expect(ok({ personas: ['999'] })).toMatchObject({ ok: true })
})
it('facturación fuera de 1..5 → FICHA_VALOR_INVALIDO', () => {
    expect(ok({ facturacion: ['6'] })).toMatchObject({ ok: false, code: 'FICHA_VALOR_INVALIDO' })
    expect(ok({ facturacion: ['05'] })).toMatchObject({ ok: false, code: 'FICHA_VALOR_INVALIDO' })
})
it('monomarca_marca de más de 60 chars → FICHA_VALOR_INVALIDO', () => {
    expect(ok({ monomarca_marca: ['x'.repeat(61)] })).toMatchObject({ ok: false, code: 'FICHA_VALOR_INVALIDO' })
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
npx jest src/services/planificacion/fichaValidation.spec.ts
```

Esperado: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar**

`src/services/planificacion/fichaValidation.ts`:

```ts
import { IFichaCampo } from '../../types/planificacion'

/**
 * Dominios de valor de la ficha. Se DUPLICAN a propósito con src/lib/relevamientos.ts del
 * front (mismo criterio que motivoValidation / ofrecimientoValidation): un bundle viejo o
 * un request a mano no pueden meter basura en pl_ficha_valor. Si cambia el catálogo, se
 * cambia en los dos lados.
 */
export const ESPECIALIDADES_FICHA = [
    'suspension', 'embragues', 'frenos', 'motor', 'rulemanero', 'generalista', 'electricidad',
    'agro', 'monomarca', 'gomeria', 'alineadora', 'concesionario', 'lubricentro', 'taller',
    'estacion-servicio',
] as const

/** Código invertido del negocio: '5' = menor a 10M … '1' = mayor a 100M. */
export const TRAMOS_FACTURACION_FICHA = ['1', '2', '3', '4', '5'] as const
export const PERSONAS_MAX_FICHA = 999
export const MONOMARCA_MARCA_MAX = 60

type Resultado =
    | { ok: true; valor: Record<string, string[]> }
    | { ok: false; code: string; mensaje: string }

const fallo = (code: string, mensaje: string): Resultado => ({ ok: false, code, mensaje })

/** Reglas por campo sobre UN valor ya trimmeado. true = válido. */
function valorValido(campo: string, valor: string): boolean {
    switch (campo) {
        case 'especialidad':
            return (ESPECIALIDADES_FICHA as readonly string[]).includes(valor)
        case 'personas':
            return /^\d+$/.test(valor) && Number(valor) >= 1 && Number(valor) <= PERSONAS_MAX_FICHA
        case 'facturacion':
            return (TRAMOS_FACTURACION_FICHA as readonly string[]).includes(valor)
        case 'monomarca_marca':
            return valor.length >= 1 && valor.length <= MONOMARCA_MARCA_MAX
        default:
            // Un campo nuevo del catálogo sin regla acá: se acepta cualquier texto no vacío.
            // Agregarle regla cuando se defina su dominio.
            return valor.length >= 1 && valor.length <= 100
    }
}

export function validarValoresFicha(body: unknown, catalogo: IFichaCampo[]): Resultado {
    if (!body || typeof body !== 'object' || !('valores' in body)) {
        return fallo('FICHA_BODY_INVALIDO', 'Falta `valores`.')
    }
    const valores = (body as { valores: unknown }).valores
    if (!valores || typeof valores !== 'object' || Array.isArray(valores)) {
        return fallo('FICHA_BODY_INVALIDO', '`valores` tiene que ser un objeto campo → lista.')
    }
    const entradas = Object.entries(valores as Record<string, unknown>)
    if (entradas.length === 0) return fallo('FICHA_SIN_CAMPOS', 'No se mandó ningún campo.')

    const porCampo = new Map(catalogo.map(c => [c.campo, c]))
    const limpio: Record<string, string[]> = {}
    for (const [campo, lista] of entradas) {
        const def = porCampo.get(campo)
        if (!def) return fallo('FICHA_CAMPO_DESCONOCIDO', `El campo "${campo}" no existe.`)
        if (!Array.isArray(lista) || lista.length === 0) {
            return fallo('FICHA_VALOR_INVALIDO', `"${campo}" necesita al menos un valor.`)
        }
        if (!def.multiple && lista.length > 1) {
            return fallo('FICHA_VALOR_MULTIPLE', `"${campo}" admite un solo valor.`)
        }
        const trimmeados: string[] = []
        for (const v of lista) {
            if (typeof v !== 'string') return fallo('FICHA_VALOR_INVALIDO', `"${campo}" tiene un valor que no es texto.`)
            const t = v.trim()
            if (!valorValido(campo, t)) return fallo('FICHA_VALOR_INVALIDO', `"${campo}": valor "${t}" inválido.`)
            trimmeados.push(t)
        }
        limpio[campo] = trimmeados
    }
    return { ok: true, valor: limpio }
}
```

- [ ] **Step 4: Correr y ver que pasa**

```bash
npx jest src/services/planificacion/fichaValidation.spec.ts
```

Esperado: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/fichaValidation.ts src/services/planificacion/fichaValidation.spec.ts
git commit -m "feat(ficha): validación del body del PUT contra catálogo y dominios de valor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `fichaCliente` — calcular `pendientes` y `valores`

**Files:**
- Create: `src/services/planificacion/fichaCliente.ts`
- Create: `src/services/planificacion/fichaCliente.spec.ts`

**Interfaces:**
- Consumes: `IFichaCampo`, `IFichaCliente` (Task 1).
- Produces: `fichaDeCliente(catalogo: IFichaCampo[], vigentes: Record<string, string[]> | undefined): IFichaCliente`.

- [ ] **Step 1: Test que falla**

`src/services/planificacion/fichaCliente.spec.ts`:

```ts
import { fichaDeCliente } from './fichaCliente'
import { IFichaCampo } from '../../types/planificacion'

const c = (campo: string, obligatorio: boolean, orden: number): IFichaCampo =>
    ({ campo, descripcion: '', obligatorio, multiple: campo === 'especialidad', codigoErp: null, orden })
const CATALOGO = [c('especialidad', true, 1), c('monomarca_marca', false, 2), c('personas', true, 3), c('facturacion', true, 4)]

it('sin ninguna fila: todos los obligatorios pendientes, en orden de catálogo, valores vacíos', () => {
    expect(fichaDeCliente(CATALOGO, undefined)).toEqual({
        pendientes: ['especialidad', 'personas', 'facturacion'],
        valores: {},
    })
})
it('con todo cargado: sin pendientes, valores tal cual', () => {
    const v = { especialidad: ['frenos'], personas: ['4'], facturacion: ['3'] }
    expect(fichaDeCliente(CATALOGO, v)).toEqual({ pendientes: [], valores: v })
})
it('un opcional ausente no es pendiente; un obligatorio ausente sí', () => {
    const v = { especialidad: ['monomarca'], facturacion: ['3'] }
    expect(fichaDeCliente(CATALOGO, v).pendientes).toEqual(['personas'])
})
it('un campo nuevo en el catálogo reaparece como pendiente en un cliente ya completo', () => {
    const v = { especialidad: ['frenos'], personas: ['4'], facturacion: ['3'] }
    expect(fichaDeCliente([...CATALOGO, c('antiguedad', true, 5)], v).pendientes).toEqual(['antiguedad'])
})
it('una fila vigente de un campo que ya no está en el catálogo se conserva en valores', () => {
    const v = { especialidad: ['frenos'], personas: ['4'], facturacion: ['3'], viejo: ['x'] }
    expect(fichaDeCliente(CATALOGO, v).valores.viejo).toEqual(['x'])
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
npx jest src/services/planificacion/fichaCliente.spec.ts
```

- [ ] **Step 3: Implementar**

`src/services/planificacion/fichaCliente.ts`:

```ts
import { IFichaCampo, IFichaCliente } from '../../types/planificacion'

/**
 * "¿Qué le falta a este cliente?" — la única pregunta que el gate del front hace.
 * Pendiente = campo obligatorio del catálogo sin valor vigente. Por eso sumar un campo al
 * catálogo hace que la ficha reaparezca en todos los clientes pidiendo SÓLO ese campo.
 */
export function fichaDeCliente(
    catalogo: IFichaCampo[],
    vigentes: Record<string, string[]> | undefined,
): IFichaCliente {
    const valores = vigentes ?? {}
    const pendientes = catalogo
        .filter(c => c.obligatorio && !(valores[c.campo]?.length))
        .map(c => c.campo)
    return { pendientes, valores }
}
```

- [ ] **Step 4: Correr y ver que pasa**

```bash
npx jest src/services/planificacion/fichaCliente.spec.ts
```

Esperado: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/fichaCliente.ts src/services/planificacion/fichaCliente.spec.ts
git commit -m "feat(ficha): fichaDeCliente — pendientes contra el catálogo, valores vigentes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `FichaService.actualizar`

**Files:**
- Create: `src/services/planificacion/FichaService.ts`
- Create: `src/services/planificacion/FichaService.spec.ts`

**Interfaces:**
- Consumes: `FichaRepository` (Task 2), `validarValoresFicha` (Task 3), `fichaDeCliente` (Task 4),
  `resolveSellerCode` (`./sellerIdentity`), `estaEnCartera` (`./carteraDe`), `rotacionAbiertaDe`
  (`./filaPropia`), `RotacionClienteRepository.findById`, `sequelizeWritePlanificacion`.
- Produces: `FichaService.actualizar(user: IUser, codigoParticularCliente: string, body: unknown): Promise<IFichaCliente>`.
  Errores: `400` con el code de validación; `404 CLIENTE_FUERA_DE_CARTERA` si el cliente no es del
  vendedor (404 y no 403, como `filaPropia`: no confirmar que existe).

- [ ] **Step 1: Test que falla**

`src/services/planificacion/FichaService.spec.ts`:

```ts
import { FichaService } from './FichaService'
import { FichaRepository } from '../../repositories/FichaRepository'
import { RotacionClienteRepository } from '../../repositories/RotacionClienteRepository'
import { RotacionRepository } from '../../repositories/RotacionRepository'
import { estaEnCartera } from './carteraDe'
import { sequelizeWritePlanificacion } from '../../database/connection'

jest.mock('../../repositories/FichaRepository')
jest.mock('../../repositories/RotacionClienteRepository')
jest.mock('../../repositories/RotacionRepository')
jest.mock('./carteraDe')
jest.mock('./sellerIdentity', () => ({ resolveSellerCode: jest.fn(async () => 'V 2') }))
jest.mock('../../database/connection', () => ({
    sequelizeWritePlanificacion: { transaction: jest.fn() },
}))

const USER = { id: '5' } as any
const TX = { id: 'tx' } as any
const CATALOGO = [
    { campo: 'especialidad', descripcion: '', obligatorio: true, multiple: true, codigoErp: null, orden: 1 },
    { campo: 'monomarca_marca', descripcion: '', obligatorio: false, multiple: false, codigoErp: null, orden: 2 },
    { campo: 'personas', descripcion: '', obligatorio: true, multiple: false, codigoErp: null, orden: 3 },
    { campo: 'facturacion', descripcion: '', obligatorio: true, multiple: false, codigoErp: null, orden: 4 },
]

beforeEach(() => {
    jest.clearAllMocks()
    ;(FichaRepository.findCatalogo as jest.Mock).mockResolvedValue(CATALOGO)
    ;(estaEnCartera as jest.Mock).mockResolvedValue(true)
    ;(sequelizeWritePlanificacion.transaction as jest.Mock).mockImplementation(async (fn: any) => fn(TX))
    ;(FichaRepository.reemplazar as jest.Mock).mockResolvedValue(undefined)
})

it('valida, reemplaza cada campo en la misma transacción y devuelve la ficha resultante', async () => {
    ;(FichaRepository.findVigentesPorClientes as jest.Mock).mockResolvedValue(
        new Map([['10034', { especialidad: ['frenos'], personas: ['4'], facturacion: ['3'] }]]),
    )
    const r = await FichaService.actualizar(USER, '10034', { valores: { especialidad: ['frenos'], personas: ['4'], facturacion: ['3'] } })

    expect(estaEnCartera).toHaveBeenCalledWith('V 2', '10034')
    expect(FichaRepository.reemplazar).toHaveBeenCalledTimes(3)
    expect(FichaRepository.reemplazar).toHaveBeenCalledWith('10034', 'especialidad', ['frenos'], 'V 2', TX)
    expect(FichaRepository.reemplazar).toHaveBeenCalledWith('10034', 'facturacion', ['3'], 'V 2', TX)
    expect(r).toEqual({ pendientes: [], valores: { especialidad: ['frenos'], personas: ['4'], facturacion: ['3'] } })
})

it('un body parcial sólo toca los campos que trae; los pendientes se recalculan', async () => {
    ;(FichaRepository.findVigentesPorClientes as jest.Mock).mockResolvedValue(new Map([['10034', { facturacion: ['5'] }]]))
    const r = await FichaService.actualizar(USER, '10034', { valores: { facturacion: ['5'] } })
    expect(FichaRepository.reemplazar).toHaveBeenCalledTimes(1)
    expect(r.pendientes).toEqual(['especialidad', 'personas'])
})

it('body inválido → 400 con el code de validación, sin tocar la base', async () => {
    await expect(FichaService.actualizar(USER, '10034', { valores: { personas: ['0'] } }))
        .rejects.toMatchObject({ statusCode: 400, code: 'FICHA_VALOR_INVALIDO' })
    expect(sequelizeWritePlanificacion.transaction).not.toHaveBeenCalled()
})

it('cliente fuera de la cartera → 404 CLIENTE_FUERA_DE_CARTERA', async () => {
    ;(estaEnCartera as jest.Mock).mockResolvedValue(false)
    await expect(FichaService.actualizar(USER, '99999', { valores: { facturacion: ['5'] } }))
        .rejects.toMatchObject({ statusCode: 404, code: 'CLIENTE_FUERA_DE_CARTERA' })
})

describe('altas', () => {
    beforeEach(() => {
        ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue({ id: 7 })
        ;(FichaRepository.findVigentesPorClientes as jest.Mock).mockResolvedValue(new Map())
    })
    it('ALTA-<id> propia (fila de alta en la rotación abierta del vendedor) guarda igual, sin mirar cartera', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue({ id: 9, rotacionId: 7, tipo: 'alta' })
        await FichaService.actualizar(USER, 'ALTA-000009', { valores: { facturacion: ['5'] } })
        expect(RotacionClienteRepository.findById).toHaveBeenCalledWith(9)
        expect(estaEnCartera).not.toHaveBeenCalled()
        expect(FichaRepository.reemplazar).toHaveBeenCalledWith('ALTA-000009', 'facturacion', ['5'], 'V 2', TX)
    })
    it('ALTA-<id> de otra rotación, o que no es alta → 404', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue({ id: 9, rotacionId: 8, tipo: 'alta' })
        await expect(FichaService.actualizar(USER, 'ALTA-000009', { valores: { facturacion: ['5'] } }))
            .rejects.toMatchObject({ statusCode: 404, code: 'CLIENTE_FUERA_DE_CARTERA' })
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue({ id: 9, rotacionId: 7, tipo: 'cliente' })
        await expect(FichaService.actualizar(USER, 'ALTA-000009', { valores: { facturacion: ['5'] } }))
            .rejects.toMatchObject({ statusCode: 404, code: 'CLIENTE_FUERA_DE_CARTERA' })
    })
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
npx jest src/services/planificacion/FichaService.spec.ts
```

- [ ] **Step 3: Implementar**

`src/services/planificacion/FichaService.ts`:

```ts
import { IUser } from '../../types/user'
import { CustomError } from '../../utils/errors'
import { sequelizeWritePlanificacion } from '../../database/connection'
import { FichaRepository } from '../../repositories/FichaRepository'
import { RotacionClienteRepository } from '../../repositories/RotacionClienteRepository'
import { resolveSellerCode } from './sellerIdentity'
import { estaEnCartera } from './carteraDe'
import { rotacionAbiertaDe } from './filaPropia'
import { validarValoresFicha } from './fichaValidation'
import { fichaDeCliente } from './fichaCliente'
import { IFichaCliente } from '../../types/planificacion'

const PREFIJO_ALTA = 'ALTA-'

/**
 * "Datos del comercio": el vendedor releva la ficha del cliente parado en el local, antes de
 * abrir la visita, y puede corregirla después desde VisitaSheet. Spec 2026-09-22 en
 * app-planificacion.
 *
 * Sólo guarda. NO empuja nada al ERP: eso lo hace un proceso ajeno leyendo pl_ficha_campo.codigo_erp
 * y marcando pl_ficha_valor.sincronizado_en. Por eso acá no hay guardas de vendedor de prueba ni de
 * alta: sus filas quedan en pl_* como cualquier otra, y es el cron el que decide no empujarlas.
 */
export class FichaService {
    static async actualizar(
        user: IUser,
        codigoParticularCliente: string,
        body: unknown,
    ): Promise<IFichaCliente> {
        const catalogo = await FichaRepository.findCatalogo()
        const validacion = validarValoresFicha(body, catalogo)
        if (!validacion.ok) {
            throw new CustomError(400, validacion.mensaje, { code: validacion.code })
        }

        const vendedor = await FichaService.requireClientePropio(user, codigoParticularCliente)

        await sequelizeWritePlanificacion.transaction(async transaction => {
            for (const [campo, valores] of Object.entries(validacion.valor)) {
                await FichaRepository.reemplazar(codigoParticularCliente, campo, valores, vendedor, transaction)
            }
        })

        const vigentes = await FichaRepository.findVigentesPorClientes([codigoParticularCliente])
        return fichaDeCliente(catalogo, vigentes.get(codigoParticularCliente))
    }

    /**
     * Cliente real: tiene que estar en la cartera del vendedor del token (para prueba,
     * `estaEnCartera` ya devuelve "toda la base"). Alta: la fila `ALTA-<id>` tiene que ser de
     * su rotación abierta. 404 y no 403, como filaPropia: no confirmar que el código existe.
     */
    private static async requireClientePropio(user: IUser, codigo: string): Promise<string> {
        const fuera = () =>
            new CustomError(404, 'Cliente no encontrado en tu cartera.', { code: 'CLIENTE_FUERA_DE_CARTERA' })

        if (codigo.startsWith(PREFIJO_ALTA)) {
            const { vendedor, rotacionId } = await rotacionAbiertaDe(user)
            const id = Number(codigo.slice(PREFIJO_ALTA.length))
            const fila = Number.isInteger(id) ? await RotacionClienteRepository.findById(id) : null
            if (!fila || fila.rotacionId !== rotacionId || fila.tipo !== 'alta') throw fuera()
            return vendedor
        }

        const vendedor = await resolveSellerCode(user)
        if (!(await estaEnCartera(vendedor, codigo))) throw fuera()
        return vendedor
    }
}
```

- [ ] **Step 4: Correr y ver que pasa**

```bash
npx jest src/services/planificacion/FichaService.spec.ts
```

Esperado: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/FichaService.ts src/services/planificacion/FichaService.spec.ts
git commit -m "feat(ficha): FichaService.actualizar — cartera o alta propia, transacción, ficha resultante

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Controller y ruta `PUT /planificacion/clientes/:codigo/ficha`

**Files:**
- Modify: `src/controllers/planificacionController.ts` (junto a `editarAlta`, ~línea 1084)
- Modify: `src/routes/planificacion.ts` (después del bloque de `/altas`, ~línea 108)

**Interfaces:**
- Consumes: `FichaService.actualizar` (Task 5).
- Produces: `PUT /planificacion/clientes/:codigo/ficha` → `200 { ok: 1, data: IFichaCliente }`.

- [ ] **Step 1: Controller**

En `planificacionController.ts`, importar `FichaService` y agregar después de `editarAlta`:

```ts
    /** PUT /clientes/:codigo/ficha — "Datos del comercio". Body: { valores: { campo: string[] } }.
     *  El código va por URL y no por body porque es la identidad del recurso; la validación
     *  del body entera vive en FichaService (400 con code). */
    static async actualizarFicha(req: Request, res: Response): Promise<void> {
        try {
            const codigo = String(req.params.codigo ?? '').trim()
            if (codigo === '') {
                res.status(400).json({ ok: 0, error: 'código de cliente inválido' })
                return
            }
            const result = await FichaService.actualizar(req.user!, codigo, req.body)
            res.status(200).json({ ok: 1, data: result })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }
```

- [ ] **Step 2: Ruta**

En `routes/planificacion.ts`, después de las rutas de `/altas`:

```ts
// "Datos del comercio": la ficha del cliente que el vendedor releva antes de abrir la visita
// y puede corregir después. Sólo vendedor (o prueba): el código tiene que ser de su cartera.
router.put('/clientes/:codigo/ficha', authMiddleware, authorizeVendedor, async (req: Request, res: Response) => {
    PlanificacionController.actualizarFicha(req, res)
})
```

- [ ] **Step 3: Compilar y probar a mano**

```bash
npx tsc --noEmit
npm run dev
```

En otra terminal, con un token de vendedor válido (el que usa la app en local) y un código de
su cartera:

```bash
curl -s -X PUT http://localhost:3000/planificacion/clientes/10034/ficha \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"valores":{"especialidad":["frenos","agro"],"personas":["4"],"facturacion":["3"]}}'
```

Esperado: `{"ok":1,"data":{"pendientes":[],"valores":{"especialidad":["frenos","agro"],"personas":["4"],"facturacion":["3"]}}}`.
Repetir con `{"valores":{"personas":["5"]}}` y verificar en MySQL:

```sql
SELECT campo, valor, reemplazado_en FROM pl_ficha_valor WHERE codigo_particular_cliente='10034' ORDER BY id;
```

Esperado: la fila `personas='4'` con `reemplazado_en` seteado y una nueva `personas='5'` vigente.
Probar también `{"valores":{"personas":["0"]}}` → 400 `FICHA_VALOR_INVALIDO`, y un código que no
sea del vendedor → 404 `CLIENTE_FUERA_DE_CARTERA`.

- [ ] **Step 4: Commit**

```bash
git add src/controllers/planificacionController.ts src/routes/planificacion.ts
git commit -m "feat(ficha): PUT /planificacion/clientes/:codigo/ficha

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `ficha` en la card de la agenda

**Files:**
- Modify: `src/services/planificacion/AgendaService.ts:183-246` (`enriquecer`)
- Modify: `src/services/planificacion/AgendaService.spec.ts`
- Modify: cualquier spec que construya `IAgendaClient` a mano y falle por `ficha` faltante (los anotados en Task 1 Step 6).

**Interfaces:**
- Consumes: `FichaRepository.findCatalogo`, `findVigentesPorClientes` (Task 2), `fichaDeCliente` (Task 4).
- Produces: cada `IAgendaClient` sale con `ficha: IFichaCliente`. También las cards de gerencia
  (`GerenciaRotacionService` usa `enriquecer`).

- [ ] **Step 1: Test que falla**

En `AgendaService.spec.ts`, agregar el mock y un `describe`:

```ts
import { FichaRepository } from '../../repositories/FichaRepository'
jest.mock('../../repositories/FichaRepository')

// en el beforeEach global existente:
;(FichaRepository.findCatalogo as jest.Mock).mockResolvedValue([
    { campo: 'especialidad', descripcion: '', obligatorio: true, multiple: true, codigoErp: null, orden: 1 },
    { campo: 'personas', descripcion: '', obligatorio: true, multiple: false, codigoErp: null, orden: 3 },
    { campo: 'facturacion', descripcion: '', obligatorio: true, multiple: false, codigoErp: null, orden: 4 },
])
;(FichaRepository.findVigentesPorClientes as jest.Mock).mockResolvedValue(new Map())

describe('enriquecer — ficha del comercio', () => {
    it('un cliente sin filas sale con los tres obligatorios pendientes', async () => {
        // usar el helper de filas/cards que ya usa el archivo (p.ej. `fila()` y el mock de
        // ClientRepository.getVisitCardsByParticularCodes) para un cliente '10034'
        const [c] = await AgendaService.enriquecer([fila({ id: 1, codigoParticularCliente: '10034' })])
        expect(c.ficha).toEqual({ pendientes: ['especialidad', 'personas', 'facturacion'], valores: {} })
    })
    it('un cliente completo sale sin pendientes y con sus valores; la query se hace UNA vez con todos los códigos', async () => {
        ;(FichaRepository.findVigentesPorClientes as jest.Mock).mockResolvedValue(
            new Map([['10034', { especialidad: ['frenos'], personas: ['4'], facturacion: ['3'] }]]),
        )
        const r = await AgendaService.enriquecer([
            fila({ id: 1, codigoParticularCliente: '10034' }),
            fila({ id: 2, codigoParticularCliente: '20001' }),
        ])
        expect(FichaRepository.findVigentesPorClientes).toHaveBeenCalledTimes(1)
        expect(FichaRepository.findVigentesPorClientes).toHaveBeenCalledWith(['10034', '20001'])
        expect(r[0].ficha.pendientes).toEqual([])
        expect(r[1].ficha.pendientes).toEqual(['especialidad', 'personas', 'facturacion'])
    })
    it('una alta también lleva ficha, con su código sintético como clave', async () => {
        ;(FichaRepository.findVigentesPorClientes as jest.Mock).mockResolvedValue(
            new Map([['ALTA-000009', { facturacion: ['5'] }]]),
        )
        const [c] = await AgendaService.enriquecer([
            fila({ id: 9, codigoParticularCliente: 'ALTA-000009', tipo: 'alta', detalle: { nombre: 'Piche', razonSocial: null, direccion: null } }),
        ])
        expect(FichaRepository.findVigentesPorClientes).toHaveBeenCalledWith(['ALTA-000009'])
        expect(c.ficha).toEqual({ pendientes: ['especialidad', 'personas'], valores: { facturacion: ['5'] } })
    })
})
```

Adaptar `fila()` y el mock de cards a los helpers que ya existan en ese spec (leerlo primero: el
archivo ya arma filas y cards para los tests de `getSemana`).

- [ ] **Step 2: Correr y ver que falla**

```bash
npx jest src/services/planificacion/AgendaService.spec.ts
```

Esperado: los tres nuevos fallan con `ficha` undefined.

- [ ] **Step 3: Implementar**

En `AgendaService.ts`: importar `FichaRepository` y `fichaDeCliente`. En `enriquecer`, después de
`pendientesPorVisita`:

```ts
        // Ficha del comercio ("Datos del comercio"): dos queries fijas más (catálogo y
        // vigentes de TODOS los códigos de la vista, incluidas las altas por su código
        // sintético). Es lo que le dice al front qué pedir antes de iniciar la visita.
        const [catalogoFicha, fichasVigentes] = await Promise.all([
            FichaRepository.findCatalogo(),
            FichaRepository.findVigentesPorClientes(filas.map(f => f.codigoParticularCliente)),
        ])
```

Y en el `result.push({ ... })`, después de `detalleAlta`:

```ts
                ficha: fichaDeCliente(catalogoFicha, fichasVigentes.get(fila.codigoParticularCliente)),
```

Actualizar el comentario de arriba de `enriquecer` ("Tres queries fijas…") a "Cinco queries fijas".

- [ ] **Step 4: Compilar y correr toda la suite**

```bash
npx tsc --noEmit
npx jest
```

Esperado: `tsc` limpio. Si algún spec construye `IAgendaClient` literal y falla por `ficha`
faltante, agregarle `ficha: { pendientes: [], valores: {} }`. Suite completa en verde.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat(ficha): la card de la agenda trae ficha { pendientes, valores }

Dos queries fijas más en enriquecer, sin importar cuántos clientes. Las altas
también, por su código sintético. Es lo que reemplaza el 'return true' del gate.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: PR del backend**

```bash
git push -u origin feat/ficha-cliente
gh pr create --title "Ficha del comercio (\"Datos del comercio\"): tablas, PUT y ficha en la card" --body "$(cat <<'EOF'
## Qué

Persistencia de la ficha del comercio que el vendedor releva antes de abrir la visita
(app-planificacion, spec `docs/superpowers/specs/2026-09-22-relevamiento-datos-del-comercio-design.md`).

- `pl_ficha_campo` (catálogo, `codigo_erp` nullable) y `pl_ficha_valor` (una fila por dato,
  vigente = `reemplazado_en IS NULL`, `sincronizado_en` para el cron ajeno).
- `PUT /planificacion/clientes/:codigo/ficha` transaccional, valida contra catálogo y dominios.
- `ficha: { pendientes, valores }` en cada `IAgendaClient` (dos queries fijas más en `enriquecer`).

## Qué NO

Nada sale hacia client-service / ERP. Lo hace un proceso ajeno leyendo `codigo_erp` y marcando
`sincronizado_en`.

## DDL

`docs/db-notes/planificacion-ficha-cliente.sql` — correr en prod antes del deploy.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## PARTE B — app-planificacion

### Task 8: Tipos y API client

**Files:**
- Modify: `src/types/planificacion.ts` (junto a `IAgendaClient`, ~línea 135)
- Modify: `src/api/planificacion.ts` (después de `reintentarAlta`, ~línea 296)
- Modify: `src/api/planificacion.test.ts`

**Interfaces:**
- Produces: `IFichaCliente { pendientes: string[]; valores: Record<string, string[]> }`;
  `ficha?: IFichaCliente` en `IAgendaClient` (opcional: los ~20 fixtures existentes no lo declaran);
  `actualizarFicha(codigoParticularCliente: string, valores: Record<string, string[]>): Promise<IFichaCliente>`.

- [ ] **Step 1: Test que falla**

En `src/api/planificacion.test.ts`, importar `actualizarFicha` y agregar:

```ts
    it('actualizarFicha hace PUT /planificacion/clientes/:codigo/ficha con { valores } y devuelve la ficha', async () => {
        const ficha = { pendientes: [], valores: { facturacion: ['3'] } }
        ;(apiClient.put as any).mockResolvedValue(ok(ficha))
        const r = await actualizarFicha('10034', { facturacion: ['3'] })
        expect(apiClient.put).toHaveBeenCalledWith('/planificacion/clientes/10034/ficha', {
            valores: { facturacion: ['3'] },
        })
        expect(r).toEqual(ficha)
    })

    it('actualizarFicha escapa el código en la URL', async () => {
        ;(apiClient.put as any).mockResolvedValue(ok({ pendientes: [], valores: {} }))
        await actualizarFicha('A B/1', { facturacion: ['3'] })
        expect(apiClient.put).toHaveBeenCalledWith('/planificacion/clientes/A%20B%2F1/ficha', expect.anything())
    })
```

- [ ] **Step 2: Correr y ver que falla**

```bash
npx vitest run src/api/planificacion.test.ts
```

- [ ] **Step 3: Tipos**

En `src/types/planificacion.ts`, antes de `IAgendaClient`:

```ts
/** "Datos del comercio" del cliente, calculado por el backend (api-vendedores,
 *  AgendaService.enriquecer). `pendientes` alimenta el gate de iniciar visita: si tiene algo,
 *  se pide eso antes del POST. `valores` precarga la edición desde VisitaSheet. */
export interface IFichaCliente {
    pendientes: string[]
    valores: Record<string, string[]>
}
```

En `IAgendaClient`, después de `detalleAlta`:

```ts
    /** Opcional a propósito por los fixtures de test existentes. En producción SIEMPRE viene.
     *  Ausente se trata como "nada pendiente": un bundle nuevo contra un backend viejo no
     *  tiene que bloquear el inicio de la visita. */
    ficha?: IFichaCliente
```

- [ ] **Step 4: API**

En `src/api/planificacion.ts`, importar `IFichaCliente` y agregar después de `reintentarAlta`:

```ts
// ── Datos del comercio ──────────────────────────────────────────────────────────

/** Guarda los campos que trae `valores` (sólo esos). Devuelve la ficha resultante, con los
 *  pendientes recalculados. Se llama ANTES del POST de iniciar visita, y lo condiciona. */
export const actualizarFicha = async (
    codigoParticularCliente: string,
    valores: Record<string, string[]>,
): Promise<IFichaCliente> => {
    const res = await apiClient.put(
        `/planificacion/clientes/${encodeURIComponent(codigoParticularCliente)}/ficha`,
        { valores },
    )
    return res.data.data
}
```

- [ ] **Step 5: Correr y ver que pasa**

```bash
npx vitest run src/api/planificacion.test.ts
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/types/planificacion.ts src/api/planificacion.ts src/api/planificacion.test.ts
git commit -m "feat(ficha): tipo IFichaCliente en la card y actualizarFicha en el API client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `relevamientos.ts` — el seam real y la traducción borrador ↔ valores

**Files:**
- Modify: `src/lib/relevamientos.ts`
- Create: `src/lib/relevamientos.test.ts`

**Interfaces:**
- Consumes: `IAgendaClient`, `IFichaCliente` (Task 8).
- Produces:
  - `CAMPOS_FICHA = ['especialidad', 'monomarca_marca', 'personas', 'facturacion'] as const`; `type CampoFicha`.
  - `relevamientoPendiente(cliente: Pick<IAgendaClient, 'ficha'>): boolean` (reemplaza la firma vieja por `rotacionClienteId`).
  - `camposPendientes(cliente): string[]` — `cliente.ficha?.pendientes ?? []`.
  - `faltantesPerfil(b: BorradorPerfil, campos: readonly string[]): string[]` — sólo evalúa los campos listados (y `monomarca_marca` implícito si `especialidad` está en `campos`).
  - `aValoresFicha(b: BorradorPerfil, campos: readonly string[]): Record<string, string[]> | null` — null si falta algo; reemplaza a `aPerfil`.
  - `deValoresFicha(valores: Record<string, string[]> | undefined): BorradorPerfil` — precarga.
  - Se borran `IPerfilComercio` y `aPerfil` (ya nadie los usa después de Task 10).

- [ ] **Step 1: Test que falla**

`src/lib/relevamientos.test.ts`:

```ts
import {
    BORRADOR_VACIO, CAMPOS_FICHA, aValoresFicha, camposPendientes, deValoresFicha,
    faltantesPerfil, relevamientoPendiente,
} from './relevamientos'

describe('relevamientoPendiente / camposPendientes', () => {
    it('true sólo si la ficha trae pendientes', () => {
        expect(relevamientoPendiente({ ficha: { pendientes: ['personas'], valores: {} } })).toBe(true)
        expect(relevamientoPendiente({ ficha: { pendientes: [], valores: {} } })).toBe(false)
    })
    it('sin ficha (backend viejo) no bloquea', () => {
        expect(relevamientoPendiente({})).toBe(false)
        expect(camposPendientes({})).toEqual([])
    })
})

describe('faltantesPerfil restringido a campos', () => {
    it('sólo cuenta los campos que se muestran', () => {
        expect(faltantesPerfil(BORRADOR_VACIO, ['facturacion'])).toEqual(['la facturación'])
        expect(faltantesPerfil(BORRADOR_VACIO, CAMPOS_FICHA)).toEqual([
            'la especialidad', 'cuántas personas trabajan', 'la facturación',
        ])
    })
    it('monomarca exige la marca sólo si especialidad está en juego y la incluye', () => {
        const b = { ...BORRADOR_VACIO, especialidades: ['monomarca'], personas: '2', facturacion: 3 }
        expect(faltantesPerfil(b, CAMPOS_FICHA)).toEqual(['qué marca'])
        expect(faltantesPerfil(b, ['personas', 'facturacion'])).toEqual([])
    })
})

describe('aValoresFicha', () => {
    it('arma sólo los campos pedidos, como strings con el formato del ERP', () => {
        const b = { especialidades: ['frenos', 'agro'], monomarcaDetalle: '', personas: '4', facturacion: 3 }
        expect(aValoresFicha(b, CAMPOS_FICHA)).toEqual({
            especialidad: ['frenos', 'agro'], personas: ['4'], facturacion: ['3'],
        })
        expect(aValoresFicha(b, ['facturacion'])).toEqual({ facturacion: ['3'] })
    })
    it('incluye monomarca_marca trimmeada cuando corresponde', () => {
        const b = { especialidades: ['monomarca'], monomarcaDetalle: ' Ford ', personas: '4', facturacion: 3 }
        expect(aValoresFicha(b, CAMPOS_FICHA)).toEqual({
            especialidad: ['monomarca'], monomarca_marca: ['Ford'], personas: ['4'], facturacion: ['3'],
        })
    })
    it('null si falta algo de lo pedido', () => {
        expect(aValoresFicha(BORRADOR_VACIO, ['personas'])).toBeNull()
    })
})

describe('deValoresFicha', () => {
    it('precarga el borrador desde los valores vigentes', () => {
        expect(deValoresFicha({
            especialidad: ['frenos', 'monomarca'], monomarca_marca: ['Ford'], personas: ['4'], facturacion: ['3'],
        })).toEqual({ especialidades: ['frenos', 'monomarca'], monomarcaDetalle: 'Ford', personas: '4', facturacion: 3 })
    })
    it('sin valores → borrador vacío; facturación inválida → null', () => {
        expect(deValoresFicha(undefined)).toEqual(BORRADOR_VACIO)
        expect(deValoresFicha({ facturacion: ['x'] }).facturacion).toBeNull()
    })
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
npx vitest run src/lib/relevamientos.test.ts
```

- [ ] **Step 3: Implementar**

En `src/lib/relevamientos.ts`: reemplazar el header, `relevamientoPendiente`, `IPerfilComercio`,
`faltantesPerfil` y `aPerfil` por:

```ts
/**
 * "Datos del comercio": catálogos, el seam del gate y la traducción entre el borrador del
 * formulario y los `valores` que viajan al backend (spec 2026-09-22).
 *
 * El backend ya calculó qué le falta a cada cliente (`cliente.ficha.pendientes`, contra
 * pl_ficha_campo). Acá no hay lógica de "está cargado": sólo se lee eso, y se dibujan y
 * validan los campos que ahí aparezcan.
 */
import type { IAgendaClient } from '@/types/planificacion'

/** Orden de pantalla. Coincide con `orden` de pl_ficha_campo. */
export const CAMPOS_FICHA = ['especialidad', 'monomarca_marca', 'personas', 'facturacion'] as const
export type CampoFicha = (typeof CAMPOS_FICHA)[number]

/** Qué campos obligatorios le faltan al cliente. `[]` sin ficha: un backend viejo que no
 *  la mande no tiene que bloquear el inicio de la visita. */
export function camposPendientes(cliente: Pick<IAgendaClient, 'ficha'>): string[] {
    return cliente.ficha?.pendientes ?? []
}

/** El seam del gate: lo único que VisitaFlow le pregunta antes de dejar iniciar. */
export function relevamientoPendiente(cliente: Pick<IAgendaClient, 'ficha'>): boolean {
    return camposPendientes(cliente).length > 0
}
```

(mantener `ESPECIALIDADES`, `ESPECIALIDAD_CON_DETALLE`, `TRAMOS_FACTURACION`, `BorradorPerfil`,
`BORRADOR_VACIO`, `PERSONAS_MAX`, `personasValidas` tal cual), y al final:

```ts
/** Qué le falta al borrador entre los campos que se están mostrando, en orden de pantalla.
 *  Lista y no booleano para poder nombrarlo en el botón. `monomarca_marca` no se pide por
 *  su nombre: cuelga de que `especialidad` esté en juego e incluya Monomarca. */
export function faltantesPerfil(b: BorradorPerfil, campos: readonly string[]): string[] {
    const faltan: string[] = []
    if (campos.includes('especialidad')) {
        if (b.especialidades.length === 0) faltan.push('la especialidad')
        else if (b.especialidades.includes(ESPECIALIDAD_CON_DETALLE) && b.monomarcaDetalle.trim() === '')
            faltan.push('qué marca')
    }
    if (campos.includes('personas') && !personasValidas(b.personas)) faltan.push('cuántas personas trabajan')
    if (campos.includes('facturacion') && b.facturacion === null) faltan.push('la facturación')
    return faltan
}

/** El body del PUT: sólo los campos pedidos, como strings con el formato del ERP. null si
 *  falta algo. `monomarca_marca` va junto con `especialidad` cuando incluye Monomarca. */
export function aValoresFicha(
    b: BorradorPerfil,
    campos: readonly string[],
): Record<string, string[]> | null {
    if (faltantesPerfil(b, campos).length > 0) return null
    const valores: Record<string, string[]> = {}
    if (campos.includes('especialidad')) {
        valores.especialidad = b.especialidades
        if (b.especialidades.includes(ESPECIALIDAD_CON_DETALLE)) {
            valores.monomarca_marca = [b.monomarcaDetalle.trim()]
        }
    }
    if (campos.includes('personas')) valores.personas = [String(Number(b.personas))]
    if (campos.includes('facturacion')) valores.facturacion = [String(b.facturacion)]
    return valores
}

/** Precarga del borrador para la edición posterior, desde `cliente.ficha.valores`. */
export function deValoresFicha(valores: Record<string, string[]> | undefined): BorradorPerfil {
    if (!valores) return BORRADOR_VACIO
    const fact = Number(valores.facturacion?.[0])
    return {
        especialidades: valores.especialidad ?? [],
        monomarcaDetalle: valores.monomarca_marca?.[0] ?? '',
        personas: valores.personas?.[0] ?? '',
        facturacion: TRAMOS_FACTURACION.some(t => t.codigo === fact) ? fact : null,
    }
}
```

- [ ] **Step 4: Correr**

```bash
npx vitest run src/lib/relevamientos.test.ts
npx tsc --noEmit
```

Esperado: tests PASS. `tsc` va a fallar en `PerfilComercioSheet.tsx` (usa `aPerfil`,
`IPerfilComercio` y `faltantesPerfil(b)` con un argumento) y en `VisitaFlow.tsx`
(`relevamientoPendiente(cliente!.rotacionClienteId)`). Se arreglan en Task 10 y 12. **No
commitear todavía**: seguir a Task 10 y commitear los dos juntos.

---

### Task 10: `PerfilComercioSheet` — campos pedidos, modo edición, error del `PUT`

**Files:**
- Modify: `src/components/relevamiento/PerfilComercioSheet.tsx`
- Modify: `src/components/relevamiento/PerfilComercioSheet.test.tsx`

**Interfaces:**
- Consumes: Task 9.
- Produces props:
  ```ts
  interface PerfilComercioSheetProps {
      open: boolean
      nombreCliente: string
      identidad?: string
      /** Qué campos dibujar: en el gate, `cliente.ficha.pendientes`; en edición, CAMPOS_FICHA. */
      campos: readonly string[]
      /** 'gate' = botón "Iniciar visita" y texto de apoyo; 'edicion' = botón "Guardar", precarga. */
      modo: 'gate' | 'edicion'
      valoresIniciales?: Record<string, string[]>
      /** true mientras corre el PUT (y, en el gate, el POST que le sigue). */
      guardando?: boolean
      /** Mensaje del último PUT fallido. El botón queda habilitado para reintentar. */
      error?: string | null
      onConfirmar: (valores: Record<string, string[]>) => void
      onClose: () => void
  }
  ```

- [ ] **Step 1: Actualizar los tests**

Reescribir el helper `abrir` y ajustar los tests existentes en `PerfilComercioSheet.test.tsx`:

```ts
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import PerfilComercioSheet from './PerfilComercioSheet'
import { CAMPOS_FICHA } from '@/lib/relevamientos'

const abrir = (props: Partial<React.ComponentProps<typeof PerfilComercioSheet>> = {}) =>
    render(
        <PerfilComercioSheet
            open
            nombreCliente="DERQUI AUTOPARTES"
            campos={CAMPOS_FICHA}
            modo="gate"
            onConfirmar={() => {}}
            onClose={() => {}}
            {...props}
        />,
    )
```

Cambiar la aserción del test "confirma con el perfil cargado" a:

```ts
    expect(onConfirmar).toHaveBeenCalledWith({
        especialidad: ['frenos', 'agro'],
        personas: ['4'],
        // El código del negocio viene invertido: '3' es "Mayor a 30M". Strings: es lo que
        // guarda pl_ficha_valor y lo que espera el ERP.
        facturacion: ['3'],
    })
```

Buscar en el resto del archivo cualquier `toHaveBeenCalledWith({ especialidades: …` y llevarlo a
la forma `{ especialidad: [...], monomarca_marca: ['Ford'], … }`.

Agregar:

```ts
it('con un solo campo pendiente dibuja sólo ese, y el botón nombra sólo ese faltante', () => {
    abrir({ campos: ['facturacion'] })
    expect(screen.queryByText(/especialidad/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/personas que trabajan/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /falta la facturación/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /menor a 10m/i }))
    expect(screen.getByRole('button', { name: /iniciar visita/i })).toBeEnabled()
})

it('en modo edición precarga los valores, el botón dice Guardar y no muestra el texto de "una sola vez"', () => {
    const onConfirmar = vi.fn()
    abrir({
        modo: 'edicion',
        onConfirmar,
        valoresIniciales: { especialidad: ['frenos', 'monomarca'], monomarca_marca: ['Ford'], personas: ['4'], facturacion: ['3'] },
    })
    expect(screen.queryByText(/se carga una sola vez/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^frenos$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/de qué marca/i)).toHaveValue('Ford')
    expect(screen.getByLabelText(/personas que trabajan/i)).toHaveValue('4')
    expect(screen.getByRole('radio', { name: /mayor a 30m/i })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    expect(onConfirmar).toHaveBeenCalledWith({
        especialidad: ['frenos', 'monomarca'], monomarca_marca: ['Ford'], personas: ['4'], facturacion: ['3'],
    })
})

it('muestra el error del PUT y deja reintentar con el botón habilitado', () => {
    const onConfirmar = vi.fn()
    abrir({ onConfirmar, error: 'No pudimos guardar los datos. Revisá la conexión.' })
    completarMinimo()
    expect(screen.getByText(/no pudimos guardar/i)).toBeInTheDocument()
    const boton = screen.getByRole('button', { name: /iniciar visita/i })
    expect(boton).toBeEnabled()
    fireEvent.click(boton)
    expect(onConfirmar).toHaveBeenCalledTimes(1)
})

it('mientras guarda, el botón queda deshabilitado', () => {
    abrir({ guardando: true })
    completarMinimo()
    expect(screen.getByRole('button', { name: /iniciar visita/i })).toBeDisabled()
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
npx vitest run src/components/relevamiento/PerfilComercioSheet.test.tsx
```

- [ ] **Step 3: Implementar**

En `PerfilComercioSheet.tsx`:

1. Imports: cambiar `aPerfil` → `aValoresFicha`, `IPerfilComercio` → nada, agregar `deValoresFicha`.
2. Props: la interfaz de arriba (reemplazar `iniciando` por `guardando`; agregar `campos`, `modo`,
   `valoresIniciales`, `error`).
3. Estado inicial y reset:
   ```ts
   const [borrador, setBorrador] = useState<BorradorPerfil>(() => deValoresFicha(valoresIniciales))
   // Cada apertura arranca desde lo que hay: vacío en el gate (el cliente no tiene esos
   // campos), precargado en la edición.
   useEffect(() => {
       if (open) setBorrador(deValoresFicha(valoresIniciales))
   }, [open, valoresIniciales])
   ```
4. `const faltan = faltantesPerfil(borrador, campos)`; `const muestra = (c: string) => campos.includes(c)`.
5. `confirmar`:
   ```ts
   function confirmar() {
       const valores = aValoresFicha(borrador, campos)
       if (!valores) return
       onConfirmar(valores)
   }
   ```
6. Label del botón:
   ```ts
   const labelBoton = completo
       ? modo === 'gate' ? 'Iniciar visita' : 'Guardar'
       : faltan.length === 1 ? `Falta ${faltan[0]}` : `Faltan ${faltan.length} datos`
   ```
7. `disabled={!completo || guardando}` y `loading={guardando}`.
8. En el cuerpo: envolver el `<p>` de "Se carga una sola vez…" en `{modo === 'gate' && (...)}`;
   envolver cada `<section>` en `{muestra('especialidad') && (...)}`, `{muestra('personas') && (...)}`,
   `{muestra('facturacion') && (...)}`.
9. Antes del cierre del `div` principal, el error:
   ```tsx
   {error && (
       <p role="alert" className="rounded-[11px] bg-dsred/8 px-3 py-2.5 text-[12.5px] font-semibold leading-snug text-dsred">
           {error}
       </p>
   )}
   ```
10. Reescribir el JSDoc del componente: sacar el párrafo `MOCK:` y decir que `campos` viene de
    `cliente.ficha.pendientes` (gate) o `CAMPOS_FICHA` (edición), y que el `PUT` lo hace el padre.

- [ ] **Step 4: Correr**

```bash
npx vitest run src/components/relevamiento/PerfilComercioSheet.test.tsx src/lib/relevamientos.test.ts
npx tsc --noEmit
```

Esperado: tests PASS. `tsc` falla SOLO en `VisitaFlow.tsx` (firma vieja de `relevamientoPendiente`,
props viejas del sheet). Se arregla en Task 12.

- [ ] **Step 5: Commit**

```bash
git add src/lib/relevamientos.ts src/lib/relevamientos.test.ts src/components/relevamiento/PerfilComercioSheet.tsx src/components/relevamiento/PerfilComercioSheet.test.tsx
git commit -m "feat(ficha): el sheet dibuja sólo los campos pedidos, precarga en edición y muestra el error del PUT

relevamientoPendiente lee cliente.ficha.pendientes. El borrador se traduce a
{ campo: string[] } con el formato del ERP (aValoresFicha) y vuelve (deValoresFicha).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Es un commit con `tsc` rojo en `VisitaFlow.tsx`; el siguiente lo cierra. Aceptable porque los
dos van al mismo PR y separarlos hace legible el diff.)

---

### Task 11: `useActualizarFicha` — mutación + caché de la agenda

**Files:**
- Create: `src/hooks/useFicha.ts`
- Create: `src/hooks/useFicha.test.tsx`

**Interfaces:**
- Consumes: `actualizarFicha` (Task 8), `agendaKeys` (`./useAgenda`).
- Produces: `useActualizarFicha()` → `useMutation` con variables
  `{ codigoParticularCliente: string; valores: Record<string, string[]> }`, data `IFichaCliente`.
  En `onSuccess`: `setQueryData(agendaKeys.semana, …)` reemplazando `ficha` de toda card con ese
  código en todos los días, y `invalidateQueries(agendaKeys.semana)` para reconciliar después.

- [ ] **Step 1: Test que falla**

`src/hooks/useFicha.test.tsx`:

```tsx
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import * as api from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { useActualizarFicha } from './useFicha'
import type { SemanaAgenda } from '@/types/planificacion'

vi.mock('@/api/planificacion')

const card = (codigo: string, over: any = {}) => ({
    codigoCliente: codigo, codigoParticularCliente: codigo, nombreCliente: codigo,
    rotacionClienteId: 1, dia: 1, estado: 'pendiente', visitaId: null, ofrecimientosPendientes: 0,
    seguimiento: { estado: 'no_corresponde', motivo: null, mensaje: null }, esExtra: false,
    observaciones: null, ficha: { pendientes: ['facturacion'], valores: {} }, ...over,
})

function setup() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const semana: SemanaAgenda = {
        lunes: [card('10034'), card('20001')],
        martes: [card('10034', { rotacionClienteId: 2, dia: 2 })],
        miercoles: [], jueves: [], viernes: [],
    } as any
    qc.setQueryData(agendaKeys.semana, semana)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    return { qc, ...renderHook(() => useActualizarFicha(), { wrapper }) }
}

it('llama al API y escribe la ficha nueva en TODAS las cards de ese cliente en la caché de la semana', async () => {
    const ficha = { pendientes: [], valores: { facturacion: ['3'] } }
    ;(api.actualizarFicha as any).mockResolvedValue(ficha)
    const { qc, result } = setup()

    await act(() => result.current.mutateAsync({ codigoParticularCliente: '10034', valores: { facturacion: ['3'] } }))

    expect(api.actualizarFicha).toHaveBeenCalledWith('10034', { facturacion: ['3'] })
    const semana = qc.getQueryData<any>(agendaKeys.semana)
    expect(semana.lunes[0].ficha).toEqual(ficha)
    expect(semana.martes[0].ficha).toEqual(ficha)
    // El otro cliente no se toca.
    expect(semana.lunes[1].ficha).toEqual({ pendientes: ['facturacion'], valores: {} })
    await waitFor(() => expect(qc.getQueryState(agendaKeys.semana)?.isInvalidated).toBe(true))
})

it('si el API falla, la caché queda como estaba', async () => {
    ;(api.actualizarFicha as any).mockRejectedValue(new Error('500'))
    const { qc, result } = setup()
    await act(async () => {
        await result.current.mutateAsync({ codigoParticularCliente: '10034', valores: { facturacion: ['3'] } }).catch(() => {})
    })
    expect(qc.getQueryData<any>(agendaKeys.semana).lunes[0].ficha.pendientes).toEqual(['facturacion'])
})
```

(Si `SemanaAgenda` no está exportado desde `@/types/planificacion`, mirar el tipo de retorno de
`getAgendaSemana` en `src/api/planificacion.ts` y usar ese.)

- [ ] **Step 2: Correr y ver que falla**

```bash
npx vitest run src/hooks/useFicha.test.tsx
```

- [ ] **Step 3: Implementar**

`src/hooks/useFicha.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { actualizarFicha } from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import type { IAgendaClient, IFichaCliente, SemanaAgenda } from '@/types/planificacion'

interface Vars {
    codigoParticularCliente: string
    valores: Record<string, string[]>
}

/**
 * "Datos del comercio". Al confirmar, la ficha nueva se escribe DIRECTO en la caché de la
 * agenda (setQueryData) y no sólo se invalida: el gate de VisitaFlow lee
 * `cliente.ficha.pendientes` de la card, y con un refetch en vuelo la card seguiría diciendo
 * "pendiente" hasta el próximo staleTime. Un mismo cliente puede estar en varias celdas
 * (quincenal), así que se recorren todos los días.
 */
export function useActualizarFicha() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (vars: Vars) => actualizarFicha(vars.codigoParticularCliente, vars.valores),
        onSuccess: (ficha: IFichaCliente, vars) => {
            qc.setQueryData<SemanaAgenda>(agendaKeys.semana, semana => {
                if (!semana) return semana
                const conFicha = (c: IAgendaClient) =>
                    c.codigoParticularCliente === vars.codigoParticularCliente ? { ...c, ficha } : c
                const out = { ...semana } as SemanaAgenda
                for (const dia of Object.keys(semana) as (keyof SemanaAgenda)[]) {
                    out[dia] = semana[dia].map(conFicha)
                }
                return out
            })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
        },
    })
}
```

- [ ] **Step 4: Correr**

```bash
npx vitest run src/hooks/useFicha.test.tsx
```

Esperado: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFicha.ts src/hooks/useFicha.test.tsx
git commit -m "feat(ficha): useActualizarFicha — PUT y ficha nueva directo en la caché de la agenda

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: El gate real en `VisitaFlow`

**Files:**
- Modify: `src/components/VisitaFlow.tsx` (estado ~línea 152, `onIniciar` ~línea 261, render del sheet ~línea 620)
- Modify: `src/components/VisitaFlow.test.tsx` (mock de `relevamientos` ~línea 18; tests nuevos)
- Modify: `src/pages/AgendaSemanaPage.test.tsx` (mock ~línea 14)

**Interfaces:**
- Consumes: `relevamientoPendiente(cliente)`, `camposPendientes(cliente)` (Task 9),
  `PerfilComercioSheet` con props nuevas (Task 10), `useActualizarFicha` (Task 11).
- Produces: `onIniciar(propuesta, opts?: { fichaConfirmada?: boolean })`. Estado
  `perfilPendiente: IPropuestaRubroDTO[] | null` (sheet abierto en modo gate) y
  `errorFicha: string | null`. Se elimina `perfilListo` (useRef) y el `console.info`.

- [ ] **Step 1: Sacar el mock global y escribir los tests del gate**

En `VisitaFlow.test.tsx`, **borrar** el `vi.mock('@/lib/relevamientos', …)` de las líneas 15-21 y su
comentario. Como el fixture `cliente` no trae `ficha`, `relevamientoPendiente` da `false` y los 27
tests existentes siguen sin gate. Agregar al mock de `@/api/planificacion` (ya existe como
`vi.mock('@/api/planificacion')` automock) nada: `actualizarFicha` queda automockeado. En el
`beforeEach` global agregar:

```ts
    ;(api.actualizarFicha as any).mockResolvedValue({ pendientes: [], valores: {} })
```

Agregar al final del archivo:

```ts
describe('gate de "Datos del comercio"', () => {
    const conPendientes: IAgendaClient = {
        ...cliente,
        ficha: { pendientes: ['especialidad', 'personas', 'facturacion'], valores: {} },
    }
    function completarFicha() {
        fireEvent.click(screen.getByRole('button', { name: /^frenos$/i }))
        fireEvent.change(screen.getByLabelText(/personas que trabajan/i), { target: { value: '4' } })
        fireEvent.click(screen.getByRole('radio', { name: /mayor a 30m/i }))
    }

    it('sin pendientes no aparece y la visita arranca directo', async () => {
        renderFlow({ cliente: { ...cliente, ficha: { pendientes: [], valores: {} } } })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        await waitFor(() => expect(api.iniciarVisita).toHaveBeenCalledTimes(1))
        expect(screen.queryByText(/datos del comercio/i)).not.toBeInTheDocument()
        expect(api.actualizarFicha).not.toHaveBeenCalled()
    })

    it('con pendientes intercepta ANTES del POST (camino sin coordenadas)', async () => {
        renderFlow({ cliente: conPendientes })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        expect(await screen.findByText(/datos del comercio/i)).toBeInTheDocument()
        expect(api.iniciarVisita).not.toHaveBeenCalled()
        expect(geo.capturarUbicacion).not.toHaveBeenCalled()
    })

    it('confirmar hace el PUT y DESPUÉS el POST, en ese orden, sin volver a pedir la ficha', async () => {
        const orden: string[] = []
        ;(api.actualizarFicha as any).mockImplementation(async () => { orden.push('ficha'); return { pendientes: [], valores: {} } })
        ;(api.iniciarVisita as any).mockImplementation(async () => { orden.push('visita'); return { visitaId: 99, ofrecimientos: 3 } })
        renderFlow({ cliente: conPendientes })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        await screen.findByText(/datos del comercio/i)
        completarFicha()
        // Dentro del sheet el botón también dice "Iniciar visita": tomar el habilitado.
        const botones = screen.getAllByRole('button', { name: /iniciar visita/i })
        fireEvent.click(botones[botones.length - 1])
        await waitFor(() => expect(api.iniciarVisita).toHaveBeenCalledTimes(1))
        expect(api.actualizarFicha).toHaveBeenCalledWith('10034', {
            especialidad: ['frenos'], personas: ['4'], facturacion: ['3'],
        })
        expect(orden).toEqual(['ficha', 'visita'])
        expect(api.actualizarFicha).toHaveBeenCalledTimes(1)
    })

    it('si el PUT falla, muestra el error en el sheet y la visita NO arranca', async () => {
        ;(api.actualizarFicha as any).mockRejectedValue(new Error('500'))
        renderFlow({ cliente: conPendientes })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        await screen.findByText(/datos del comercio/i)
        completarFicha()
        const botones = screen.getAllByRole('button', { name: /iniciar visita/i })
        fireEvent.click(botones[botones.length - 1])
        expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos guardar/i)
        expect(api.iniciarVisita).not.toHaveBeenCalled()
        expect(screen.getByText(/datos del comercio/i)).toBeInTheDocument()
    })

    it('cerrar sin cargar no hace PUT ni POST y vuelve a la pantalla de atrás', async () => {
        renderFlow({ cliente: conPendientes })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        await screen.findByText(/datos del comercio/i)
        // BottomSheet expone el cierre como botón "Cerrar" (ver otros tests del archivo que
        // cierran sheets; usar el mismo selector).
        fireEvent.click(screen.getAllByRole('button', { name: /cerrar/i })[0])
        await waitFor(() => expect(screen.queryByText(/datos del comercio/i)).not.toBeInTheDocument())
        expect(api.actualizarFicha).not.toHaveBeenCalled()
        expect(api.iniciarVisita).not.toHaveBeenCalled()
        // La propuesta (pantalla de atrás) sigue abierta.
        expect(screen.getByRole('button', { name: /iniciar visita/i })).toBeInTheDocument()
    })

    it('con coordenadas del cliente, el gate corta después del mapa: primero mapa, al tocar iniciar aparece la ficha', async () => {
        mockGeolocacionEnVivo({ latitude: -34.6, longitude: -58.4, accuracy: 10 })
        renderFlow({ cliente: { ...conPendientes, latitud: -34.6, longitud: -58.4 } })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        expect(await screen.findByTestId('mapa-iniciar-visita')).toBeInTheDocument()
        expect(screen.queryByText(/datos del comercio/i)).not.toBeInTheDocument()
        const iniciarEnMapa = await screen.findByRole('button', { name: /iniciar visita/i })
        await waitFor(() => expect(iniciarEnMapa).toBeEnabled())
        fireEvent.click(iniciarEnMapa)
        expect(await screen.findByText(/datos del comercio/i)).toBeInTheDocument()
        expect(api.iniciarVisita).not.toHaveBeenCalled()
    })

    it('pide sólo el campo pendiente', async () => {
        renderFlow({ cliente: { ...cliente, ficha: { pendientes: ['facturacion'], valores: { especialidad: ['frenos'], personas: ['2'] } } } })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        await screen.findByText(/datos del comercio/i)
        expect(screen.queryByLabelText(/personas que trabajan/i)).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /falta la facturación/i })).toBeDisabled()
    })
})
```

En `AgendaSemanaPage.test.tsx`, **borrar** el `vi.mock('@/lib/relevamientos', …)` (líneas 11-17
con su comentario). Los fixtures de esa página no traen `ficha`, así que no hay gate.

- [ ] **Step 2: Correr y ver que falla**

```bash
npx vitest run src/components/VisitaFlow.test.tsx
```

Esperado: compila mal o los tests nuevos fallan (firma vieja).

- [ ] **Step 3: Implementar el gate**

En `VisitaFlow.tsx`:

1. Imports: `import { camposPendientes, relevamientoPendiente } from '@/lib/relevamientos'` y
   `import { useActualizarFicha } from '@/hooks/useFicha'`.
2. Hooks: junto a `const iniciar = useIniciarVisita()`: `const actualizarFicha = useActualizarFicha()`.
3. Estado (reemplaza el bloque de `perfilPendiente` + `perfilListo`):
   ```ts
   // Gate de "Datos del comercio". Guarda la propuesta ya confirmada mientras el vendedor
   // carga la ficha; no null = sheet abierto. El corte va ANTES del POST a propósito: el
   // cronómetro no corre mientras se carga, y abandonar no deja una visita abierta sin ficha.
   const [perfilPendiente, setPerfilPendiente] = useState<IPropuestaRubroDTO[] | null>(null)
   const [errorFicha, setErrorFicha] = useState<string | null>(null)
   ```
   En el `useEffect` de reset por cliente: `setPerfilPendiente(null); setErrorFicha(null)` (sacar
   `perfilListo.current = false`).
4. `onIniciar`:
   ```ts
   async function onIniciar(propuesta: IPropuestaRubroDTO[], opts: { fichaConfirmada?: boolean } = {}) {
       if (iniciandoFlujo || bloqueadoPorOtraVisita) return
       // Único punto de corte del gate: los tres caminos de inicio (mapa, sin coordenadas
       // y alta) terminan acá. `fichaConfirmada` lo pasa el sheet después de un PUT OK:
       // la card en caché ya se actualizó, pero el `cliente` de este closure es el de antes.
       if (!opts.fichaConfirmada && relevamientoPendiente(cliente!)) {
           setErrorIniciar(null)
           setPerfilPendiente(propuesta)
           return
       }
       // … resto igual
   ```
5. Render del sheet (reemplaza el bloque MOCK):
   ```tsx
   {/* Último del árbol a propósito: se monta POR ENCIMA del mapa (o de la propuesta) que
       quedó atrás, que es justo la pantalla a la que vuelve si cierra sin cargar. */}
   <PerfilComercioSheet
       open={perfilPendiente !== null}
       modo="gate"
       campos={camposPendientes(cliente)}
       valoresIniciales={cliente.ficha?.valores}
       nombreCliente={nombre}
       identidad={clienteEsAlta ? undefined : identidad}
       guardando={actualizarFicha.isPending || iniciandoFlujo}
       error={errorFicha}
       onConfirmar={async valores => {
           setErrorFicha(null)
           try {
               // PRIMERO la ficha, DESPUÉS la visita, y sólo si la ficha se guardó: al
               // revés, el gate se destrabaría sin que el dato exista.
               await actualizarFicha.mutateAsync({
                   codigoParticularCliente: cliente.codigoParticularCliente,
                   valores,
               })
           } catch {
               setErrorFicha('No pudimos guardar los datos. Revisá la conexión y volvé a intentar.')
               return
           }
           const propuesta = perfilPendiente ?? []
           setPerfilPendiente(null)
           void onIniciar(propuesta, { fichaConfirmada: true })
       }}
       onClose={() => {
           setPerfilPendiente(null)
           setErrorFicha(null)
       }}
   />
   ```
   Ojo: el sheet se renderiza dentro del bloque donde `cliente` ya está narrowed (no null); si el
   bloque actual usa `cliente!`, mantener esa forma.

- [ ] **Step 4: Correr todo**

```bash
npx tsc --noEmit
npx vitest run
```

Esperado: `tsc` limpio, suite completa en verde (los 27 tests viejos de `VisitaFlow` más los 7 del
gate, y `AgendaSemanaPage.test` sin su mock).

- [ ] **Step 5: Commit**

```bash
git add src/components/VisitaFlow.tsx src/components/VisitaFlow.test.tsx src/pages/AgendaSemanaPage.test.tsx
git commit -m "feat(ficha): el gate lee cliente.ficha.pendientes y hace el PUT antes del POST de la visita

Se va el mock 'return true' y el useRef perfilListo. Si el PUT falla, la visita no
arranca. Los tests que faltaban del gate (§11.2 del spec): intercepta antes del POST
en los tres caminos, orden PUT→POST, PUT fallido sin POST, cerrar sin cargar, sólo
los campos pendientes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Edición posterior — chip "Datos del comercio" en `VisitaSheet`

**Files:**
- Modify: `src/components/VisitaSheet.tsx` (props ~línea 95-115; `acciones` ~línea 455-482)
- Modify: `src/components/VisitaSheet.test.tsx`
- Modify: `src/components/VisitaFlow.tsx` (render de `VisitaSheet` ~línea 466; sheet de ficha)
- Modify: `src/components/VisitaFlow.test.tsx`

**Interfaces:**
- Consumes: Task 10, 11, 12.
- Produces: prop `onEditarDatosComercio?: () => void` en `VisitaSheet`. En `VisitaFlow`, estado
  `editandoFicha: boolean`; el mismo `PerfilComercioSheet` se abre con `modo="edicion"` y
  `campos={CAMPOS_FICHA}`.

- [ ] **Step 1: Test del chip en `VisitaSheet`**

En `VisitaSheet.test.tsx` (leer primero cómo renderiza el archivo el sheet: hay un helper de
render con `QueryClientProvider` y mocks de hooks; reusarlo):

```ts
describe('chip "Datos del comercio"', () => {
    it('aparece si se pasa onEditarDatosComercio, con la visita abierta o cerrada, y lo llama al tocar', () => {
        const onEditar = vi.fn()
        renderSheet({ onEditarDatosComercio: onEditar, visitaCerrada: true })
        fireEvent.click(screen.getByRole('button', { name: /datos del comercio/i }))
        expect(onEditar).toHaveBeenCalledTimes(1)
    })
    it('no aparece sin la prop', () => {
        renderSheet({})
        expect(screen.queryByRole('button', { name: /datos del comercio/i })).not.toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Implementar el chip**

En `VisitaSheet.tsx`:

1. Props: agregar después de `onNoVisita`:
   ```ts
   /** Si se pasa, el header muestra el chip "Datos del comercio" que abre la edición de la
    *  ficha. Se muestra con la visita abierta Y cerrada (es corrección, no carga de rubros).
    *  El llamador decide cuándo pasarlo (VisitaFlow: sólo si no hay pendientes, para no
    *  duplicar la puerta del gate). */
   onEditarDatosComercio?: () => void
   ```
2. Destructurar `onEditarDatosComercio`.
3. Antes de `const acciones = …`:
   ```tsx
   const chipDatosComercio = onEditarDatosComercio ? (
       <button
           type="button"
           onClick={onEditarDatosComercio}
           className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-[#C9D2E3] bg-[#F1F4F9] px-2 text-[11px] font-bold text-dsnavy"
       >
           Datos del comercio
       </button>
   ) : null
   ```
4. `acciones`:
   ```tsx
   // Descuentos primero (consulta), después la ficha (corrección), y la salida negativa al
   // borde, como hoy.
   const acciones =
       chipDescuentos || chipDatosComercio || botonNoVisita ? (
           <div className="flex items-center gap-1.5">
               {chipDescuentos}
               {chipDatosComercio}
               {botonNoVisita}
           </div>
       ) : undefined
   ```

- [ ] **Step 3: Correr**

```bash
npx vitest run src/components/VisitaSheet.test.tsx
```

- [ ] **Step 4: Test de la edición en `VisitaFlow`**

Agregar al `describe('gate de "Datos del comercio"')` de `VisitaFlow.test.tsx`:

```ts
    it('con la ficha completa, VisitaSheet ofrece "Datos del comercio" y editar hace el PUT con todos los campos, sin tocar la visita', async () => {
        const completo: IAgendaClient = {
            ...cliente, estado: 'en_curso', visitaId: 77,
            ficha: { pendientes: [], valores: { especialidad: ['frenos'], personas: ['2'], facturacion: ['5'] } },
        }
        renderFlow({ cliente: completo })
        fireEvent.click(await screen.findByRole('button', { name: /datos del comercio/i }))
        // Precargado y en modo edición.
        expect(await screen.findByRole('button', { name: /^guardar$/i })).toBeEnabled()
        expect(screen.getByLabelText(/personas que trabajan/i)).toHaveValue('2')
        fireEvent.change(screen.getByLabelText(/personas que trabajan/i), { target: { value: '3' } })
        fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
        await waitFor(() => expect(api.actualizarFicha).toHaveBeenCalledWith('10034', {
            especialidad: ['frenos'], personas: ['3'], facturacion: ['5'],
        }))
        await waitFor(() => expect(screen.queryByRole('button', { name: /^guardar$/i })).not.toBeInTheDocument())
        expect(api.iniciarVisita).not.toHaveBeenCalled()
        expect(api.cerrarVisita).not.toHaveBeenCalled()
    })

    it('con pendientes, VisitaSheet NO ofrece el chip (la puerta es el gate)', async () => {
        renderFlow({ cliente: { ...conPendientes, estado: 'en_curso', visitaId: 77 } })
        await screen.findByText(/cerrar visita|cargá/i)
        expect(screen.queryByRole('button', { name: /datos del comercio/i })).not.toBeInTheDocument()
    })
```

(Adaptar el `findByText` del segundo test al texto que `VisitaSheet` muestra siempre con la visita
en curso; mirar los tests existentes del archivo que abren el sheet de una visita `en_curso`.)

- [ ] **Step 5: Implementar la edición en `VisitaFlow`**

1. Import: agregar `CAMPOS_FICHA` desde `@/lib/relevamientos`.
2. Estado: `const [editandoFicha, setEditandoFicha] = useState(false)`; resetear en el `useEffect`
   por cliente.
3. En el render de `<VisitaSheet …>` agregar:
   ```tsx
   // Sólo con la ficha completa: si falta algo, el gate ya la pide al iniciar, y dos
   // puertas para lo mismo confunden. Sin `ficha` (backend viejo) tampoco.
   onEditarDatosComercio={
       cliente.ficha && cliente.ficha.pendientes.length === 0
           ? () => setEditandoFicha(true)
           : undefined
   }
   ```
4. El `PerfilComercioSheet` pasa a servir los dos modos:
   ```tsx
   <PerfilComercioSheet
       open={perfilPendiente !== null || editandoFicha}
       modo={editandoFicha ? 'edicion' : 'gate'}
       campos={editandoFicha ? CAMPOS_FICHA : camposPendientes(cliente)}
       valoresIniciales={cliente.ficha?.valores}
       nombreCliente={nombre}
       identidad={clienteEsAlta ? undefined : identidad}
       guardando={actualizarFicha.isPending || iniciandoFlujo}
       error={errorFicha}
       onConfirmar={async valores => {
           setErrorFicha(null)
           try {
               await actualizarFicha.mutateAsync({
                   codigoParticularCliente: cliente.codigoParticularCliente,
                   valores,
               })
           } catch {
               setErrorFicha('No pudimos guardar los datos. Revisá la conexión y volvé a intentar.')
               return
           }
           if (editandoFicha) {
               // Edición: guardar y cerrar. No arranca ni toca la visita.
               setEditandoFicha(false)
               return
           }
           const propuesta = perfilPendiente ?? []
           setPerfilPendiente(null)
           void onIniciar(propuesta, { fichaConfirmada: true })
       }}
       onClose={() => {
           setPerfilPendiente(null)
           setEditandoFicha(false)
           setErrorFicha(null)
       }}
   />
   ```

- [ ] **Step 6: Correr todo**

```bash
npx tsc --noEmit
npx vitest run
```

Esperado: todo verde.

- [ ] **Step 7: Commit**

```bash
git add src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx src/components/VisitaFlow.tsx src/components/VisitaFlow.test.tsx
git commit -m "feat(ficha): chip \"Datos del comercio\" en VisitaSheet para corregir la ficha después

Mismo sheet en modo edición, precargado, botón Guardar. Sólo con la ficha completa:
si falta algo, la puerta es el gate.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Documentación y verificación de punta a punta

**Files:**
- Modify: `CLAUDE.md` (sección "Decisiones no obvias")
- Modify: `docs/dominio/tablas.md`
- Modify: `docs/superpowers/specs/2026-09-22-relevamiento-datos-del-comercio-design.md` (§6, §11)
- Modify: `src/lib/relevamientos.ts`, `src/components/relevamiento/PerfilComercioSheet.tsx` (comentarios MOCK residuales)

- [ ] **Step 1: Corregir el spec**

En §6 del spec, donde dice que `ficha` se suma a `IVisitClientCard`, cambiar a `IAgendaClient`
(la card enriquecida): `IVisitClientCard` es lo que sale de `fct_clients` y `cardDeAlta`, y la
ficha se calcula en `enriquecer`. En §11.1 y §11.2 idem. Actualizar el "Estado" del encabezado a
"implementado".

- [ ] **Step 2: `CLAUDE.md`**

Agregar a "Decisiones no obvias", después del bullet de "Cliente nuevo":

```markdown
- **"Datos del comercio" es una ficha del CLIENTE, no de la visita, y este dominio sólo la
  guarda.** `pl_ficha_campo` (catálogo, con `codigo_erp` nullable) + `pl_ficha_valor` (una fila
  por dato, vigente = `reemplazado_en IS NULL`): la forma de `camposDinamicos` del ERP, que es
  donde termina. **Nada sale hacia client-service desde acá**: lo hace un cron ajeno leyendo
  `codigo_erp` y marcando `sincronizado_en`. El gate de `VisitaFlow.onIniciar` lee
  `cliente.ficha.pendientes` (calculado en `AgendaService.enriquecer` contra el catálogo) y pide
  **sólo** eso; sumar un dato es una fila en el catálogo + un control en `PerfilComercioSheet`,
  sin tocar el gate. El `PUT /planificacion/clientes/:codigo/ficha` va **antes** del POST de la
  visita y lo condiciona. Se pide hasta que la ficha esté completa y nunca vence. Corrección
  posterior: chip "Datos del comercio" en `VisitaSheet`, sólo sin pendientes. GPS roto: no se
  releva ese día, el cliente sigue pendiente. Spec
  `docs/superpowers/specs/2026-09-22-relevamiento-datos-del-comercio-design.md`.
```

- [ ] **Step 3: `docs/dominio/tablas.md`**

Agregar una sección para `pl_ficha_campo` y `pl_ficha_valor` con el mismo formato de las otras
(para qué existe, por qué cada constraint): keyed por código particular y no por
`rotacion_cliente_id` (es del comercio), una fila por dato y no una columna (forma del ERP,
extensible sin ALTER), `reemplazado_en` en vez de UPDATE (historia), `sincronizado_en` y
`codigo_erp` como contrato con el cron ajeno, `monomarca_marca` como campo propio no obligatorio
(el gate no conoce reglas condicionales).

- [ ] **Step 4: Limpiar comentarios MOCK**

`grep -rn "MOCK" src/lib/relevamientos.ts src/components/relevamiento/ src/components/VisitaFlow.tsx`
tiene que devolver vacío. Reescribir lo que quede.

- [ ] **Step 5: Verificación de punta a punta**

Con el backend de Task 7 corriendo en local y su DDL aplicado:

```bash
npm run dev
```

En el navegador (modo mobile), como vendedor con clientes en la agenda:
1. Abrir un cliente sin ficha → "Iniciar visita" → aparece "Datos del comercio" con las tres
   preguntas → completar → la visita arranca. En MySQL: 3+ filas vigentes para ese código.
2. Cerrar la visita, reabrir el cliente → el chip "Datos del comercio" está en el header, el gate
   no aparece. Editar personas → Guardar → en MySQL la fila vieja tiene `reemplazado_en`.
3. Otro cliente sin ficha: abrir el sheet y cerrarlo sin cargar → no hay visita abierta
   (`pl_resolucion` sin fila para ese `rotacion_cliente_id`), no hay filas en `pl_ficha_valor`.
4. Apagar el backend, intentar confirmar la ficha → error en el sheet, la visita no arranca.
5. `UPDATE pl_ficha_campo SET obligatorio = 1 WHERE campo = 'monomarca_marca'` (simular un campo
   nuevo) → recargar → el cliente del paso 1 vuelve a pedir sólo "¿De qué marca?"… y revertir el
   UPDATE.

- [ ] **Step 6: Suite completa y commit**

```bash
npx tsc --noEmit && npx vitest run && npx oxlint
git add -A
git commit -m "docs(ficha): CLAUDE.md, tablas.md y spec al estado implementado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 7: PR del front**

```bash
git push -u origin feat/relevamiento-datos-comercio
gh pr create --title "\"Datos del comercio\": gate real contra la ficha del backend, PUT antes de la visita, edición" --body "$(cat <<'EOF'
## Qué

Cierra el spec `docs/superpowers/specs/2026-09-22-relevamiento-datos-del-comercio-design.md`.

- El gate de iniciar visita lee `cliente.ficha.pendientes` (nuevo en la card, api-vendedores PR #…)
  y pide sólo los campos que faltan. Se va el mock `return true`.
- `PUT /planificacion/clientes/:codigo/ficha` **antes** del POST de la visita; si falla, la visita
  no arranca. La ficha nueva se escribe directo en la caché de la agenda.
- Chip "Datos del comercio" en `VisitaSheet` para corregir después (sólo sin pendientes).
- Tests del gate que faltaban: intercepta antes del POST, orden PUT→POST, PUT fallido, cerrar sin
  cargar, sólo pendientes, mapa → ficha.

## Depende de

api-vendedores PR "Ficha del comercio" (tablas + PUT + `ficha` en la card). Contra un backend
viejo la card no trae `ficha` y el gate no bloquea.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review (hecho al escribir)

- **Cobertura del spec.** §4 → Task 1-2. §5.1 → Task 3, 5, 6. §5.2 (contrato con el cron) → sólo
  columnas y comentario del DDL, Task 1, no hay código: correcto por diseño. §6 → Task 7, 8, 9, 11.
  §7-§8 → Task 12. §9 → Task 10. §10 → Task 13. §11.2 tests → Task 12. §12 fuera de alcance → nada.
- **Nombres cruzados.** `FichaRepository.findCatalogo / findVigentesPorClientes / reemplazar`
  (Task 2) usados en Task 5 y 7 con esas firmas. `fichaDeCliente` (Task 4) en Task 5 y 7.
  `validarValoresFicha` (Task 3) en Task 5. `actualizarFicha(codigo, valores)` (Task 8) en Task 11.
  `relevamientoPendiente(cliente)`, `camposPendientes`, `CAMPOS_FICHA`, `aValoresFicha`,
  `deValoresFicha`, `faltantesPerfil(b, campos)` (Task 9) en Task 10, 12, 13.
  `useActualizarFicha` (Task 11) en Task 12, 13. Props del sheet (Task 10) en Task 12, 13.
- **Placeholders.** Ninguno: cada paso tiene el código o el comando.
- **Aviso conocido.** Task 9 deja `tsc` rojo hasta Task 10, y Task 10 hasta Task 12. Los commits
  intermedios son deliberados y van al mismo PR.
