# Backend `planificacion` (api-vendedores) — Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**v2 changelog (vs. the original plan):** the v1 plan guessed several integration points instead of
verifying them. A follow-up analysis session read the real `api-vendedores` code and the
`sync-dagster` warehouse pipeline and corrected the following:
- MySQL access uses **Sequelize models** (`Visita`, `Motivo`), matching the existing `Nota` pattern —
  **not** a raw-SQL helper (`distriRaw.ts` is dropped).
- `codigo_particular_vendedor` is resolved via the **existing** `SalesDataScopeResolver.resolve(user)`
  — not a guessed `req.user.codigovendedor` field (which doesn't exist on `IUser`).
- **`id_equipo`/`Equipos` is dropped entirely.** It only exists in Mobiliza's own DB/constants file,
  not in `distriap_distri`. Decision: write `Visitas` without it; accept that `app-mobiliza`'s
  dashboard JOIN loses that field for visits created by this app (Mobiliza is being deprecated).
- **`coord_cliente` comes from the warehouse**, not MySQL: `analytics.fct_clients.latitude`/
  `.longitude` already exist end-to-end in the `sync-dagster` pipeline (sourced from client-service).
  No pipeline work needed.
- **Route mount prefix** is `/prod/vs/planificacion` and `/staging/vs/planificacion` (matching every
  sibling router), not a bare `/planificacion`.
- **Agenda (día/semana) has no real warehouse field yet** (`DIAVISITA` doesn't exist anywhere — not
  in client-service, not in the pipeline). For the MVP it's seeded from a CSV mock
  (`Mocks/Agenda Vendedores.csv`, one sheet per seller, being updated to include the seller's code).
  When `DIAVISITA` ships as a client-service "campo dinámico" (same mechanism already used for
  `es_suscriptor`/`vendedores_permitidos`), `AgendaRepository` swaps to a real warehouse query —
  the service layer above it doesn't change.
- **Cromo seguimiento retry**: the spec assumed a retry queue that doesn't exist in the codebase (no
  cron/job infra). Decision: no server-side persistence of pending motivos. On failure, the API
  returns the built `descripcion` text to the frontend, which can call a small dedicated retry
  endpoint (`POST /visitas/:id/seguimiento`) with the same `motivoIds` it already has in local state.
- **Ownership check added** on `cerrar`/`seguimiento` retry: v1 had no check that the visita being
  closed belongs to the calling seller.
- **Duplicate guard added** on `registrarNoVisita`: don't create a second "resuelta" row for a
  client already resolved that day.

**Goal:** Add a `planificacion` domain to the existing **api-vendedores** Express API that serves the
seller's weekly/daily visit agenda, reads the `Motivos` catalog and writes visit lifecycle rows
(`Visitas`) to the `distriap_distri` MySQL database (reusing the existing `sequelizeWrite` connection
— the same DB that already stores `Notas`, via Sequelize models), and posts the visit result as a
Cromo seguimiento on close.

**Tech Stack:** TypeScript, Express 4, `sequelizeWrite` (Sequelize models over `distriap_distri`),
`pg` (warehouse, existing `query()` helper), Jest + ts-jest, existing `CustomError`/`createLogger`/
`CrmService`/`SalesDataScopeResolver`.

**Source spec:** `docs/superpowers/specs/2026-07-22-app-planificacion-design.md`

**Repo to modify:** `C:/Users/matia/Documents/distrisuper/business-workflow/versus/api-vendedores`
(All paths below are relative to that repo unless noted. Run all commands from that repo root.)

---

## Conventions in this codebase

- **Responses:** success `res.status(2xx).json({ ok: 1, data })`; errors
  `res.status(err.statusCode || 500).json({ ok: 0, data: err.message })`.
- **Errors:** throw `new CustomError(status, message, { code?, hint? })` from `src/utils/errors.ts`.
- **Logging:** `const log = createLogger('ComponentName')` from `src/utils/logger.ts`.
- **Models** (`src/models/*.ts`) are Sequelize models over `sequelizeWrite`, matching `src/models/Nota.ts`
  — `Model.init()` with explicit `field:` mappings to the real (legacy, snake_case) column names,
  `timestamps: false` (the legacy tables have their own `fecha_inicio`/`fecha_fin`, not
  `createdAt`/`updatedAt`), no `paranoid` (no soft-delete column on `Visitas`/`Motivos`). **No
  `sync()` call anywhere** — the tables already exist, models only read/write them.
- **Repositories** wrap model calls, map DB errors to `CustomError` (see `NotaRepository.ts`).
- **Services** hold business logic; **controllers** are `static async` classes with no direct DB access.
- **No barrel exports.** **Prettier:** no semicolons, single quotes, `tabWidth: 4`,
  `trailingComma: all`, `arrowParens: avoid`.
- **Tests:** co-located `*.spec.ts`. Run with `npm test`. Unit-test services/repositories with mocked
  models; do NOT hit real DBs in tests.

---

## File Structure

**Created:**
- `src/models/Visita.ts` — Sequelize model over the existing `Visitas` table.
- `src/models/Motivo.ts` — Sequelize model over the existing `Motivos` table (read-only usage).
- `src/types/planificacion.ts` — shared interfaces (`IMotivo`, `IAgendaClient`, `IVisita`, DTOs).
- `src/repositories/MotivosRepository.ts` — reads `Motivo`.
- `src/repositories/VisitasRepository.ts` — creates/updates/reads `Visita`.
- `src/repositories/ClienteCoordRepository.ts` — warehouse query for the client's lat/lng.
- `src/repositories/AgendaRepository.ts` — reads the CSV-mock agenda seed.
- `src/data/agendaMock.ts` — parsed/typed version of `Mocks/Agenda Vendedores.csv`, keyed by seller code.
- `src/services/planificacion/MotivosService.ts` — catalog read + cache.
- `src/services/planificacion/AgendaService.ts` — agenda assembly + day status merge.
- `src/services/planificacion/VisitasService.ts` — visit lifecycle + Cromo seguimiento.
- `src/services/planificacion/sellerIdentity.ts` — thin wrapper around `SalesDataScopeResolver`.
- `src/services/planificacion/seguimientoText.ts` — build the Cromo descripcion from selected motivos.
- `src/controllers/planificacionController.ts` — static controller methods.
- `src/routes/planificacion.ts` — router.
- `*.spec.ts` next to each service/repository/helper.

**Modified:**
- `src/app.ts` — mount the new router at `/prod/vs/planificacion` and `/staging/vs/planificacion`
  (no new DB init needed; `sequelizeWrite` already authenticates at boot).

**Optional follow-up (not blocking this plan):**
- `src/services/crm/CromoHttpClient.ts` — a Cromo `403` response is not mapped to a `CustomError`
  today (falls through as a raw `AxiosError`, surfaced to the frontend as a generic `500`). Worth a
  small fix so `seguimientoPendiente` handling can distinguish it, but the try/catch in
  `VisitasService.postSeguimiento` catches it regardless (broad catch), so it doesn't block this plan.

---

## Phase 0 — Resolve remaining open questions

### Task 0: Confirm real schema + finalize the agenda CSV

**Files:** Create `docs/superpowers/plans/2026-07-22-backend-findings.md`

- [ ] **Step 1: Confirm `Visitas`/`Motivos` real columns**

  Using the existing `sequelizeWrite` connection (no new credentials needed), run:
  ```sql
  DESCRIBE Visitas;
  DESCRIBE Motivos;
  SELECT * FROM Motivos;
  ```
  Record exact column names/types. The spec's assumed shape (`visita_id`,
  `codigo_particular_vendedor`, `codigo_particular_cliente`, `nombre_cliente`, `fecha_inicio`,
  `fecha_fin`, `coord_inicio`, `coord_final`, `coord_cliente` / `motivo_id`, `descripcion`) is a
  best guess from the Mobiliza source — verify before writing `src/models/Visita.ts` and
  `src/models/Motivo.ts`, and adjust the `field:` mappings below if they differ. Also confirm the 9
  prototype motivo options against the real rows (spec §8) and add missing rows directly to
  `Motivos` if needed (no new table).

- [ ] **Step 2: Get the final agenda CSV**

  `Mocks/Agenda Vendedores.csv` (in `app-planificacion`) is being updated to add the seller's code
  per sheet/section. Once updated, confirm: one seller per sheet vs. per section, the exact
  column layout (`Cod Cliente`, `Cliente`, `Barrio/loc` per day, `SEMANA N` blocks), and how
  multi-week rotation should map to a single "day of week" bucket for `getSemana`/`getDia` (e.g.
  does `getDia` need a `semana` param too, or does the MVP only care about "day of week" regardless
  of week number?). Record the decision — it drives `src/data/agendaMock.ts`'s shape.

- [ ] **Step 3: Confirm `IUser.id` is the right `userId` for `CrmService.createEvent`**

  Already confirmed by reading `src/controllers/crmController.ts:9` (`req.user!.id`) — no further
  investigation needed, just cite it in the findings file for traceability.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/superpowers/plans/2026-07-22-backend-findings.md
  git commit -m "docs: findings for planificacion backend (schema + agenda CSV shape)"
  ```

---

## Phase 1 — Models (Visita, Motivo)

### Task 1: `Motivo` model + repository + service

**Files:**
- Create: `src/models/Motivo.ts`, `src/types/planificacion.ts`, `src/repositories/MotivosRepository.ts`,
  `src/services/planificacion/MotivosService.ts`
- Test: `src/services/planificacion/MotivosService.spec.ts`

- [ ] **Step 1: `src/types/planificacion.ts`**
  ```typescript
  export interface IMotivo {
      motivoId: number
      descripcion: string
  }

  export interface IAgendaClient {
      codigoParticularCliente: string
      nombreCliente: string
      barrio?: string
      resuelto?: boolean // undefined in weekly view
  }

  export interface IVisita {
      visitaId: number
      codigoParticularVendedor: string
      codigoParticularCliente: string
      nombreCliente: string
      fechaInicio: string
      fechaFin: string | null
      coordInicio: string | null
      coordFinal: string | null
      coordCliente: string | null
  }

  export interface IIniciarVisitaDTO {
      codigoParticularCliente: string
      nombreCliente: string
      coordInicio: string | null
  }

  export interface ICerrarVisitaDTO {
      visitaId: number
      coordFinal: string | null
      motivoIds: number[]
  }

  export interface INoVisitaDTO {
      codigoParticularCliente: string
      nombreCliente: string
      motivoIds: number[]
  }

  export interface ISeguimientoResult {
      seguimientoPendiente: boolean
      motivoPendiente?: string // CRM_NOT_LINKED | CRM_TOKEN_EXPIRED | CRM_CLIENT_NOT_FOUND | CRM_UNAVAILABLE | CRM_UNKNOWN
      descripcionParaReintentar?: string
  }
  ```

- [ ] **Step 2: `src/models/Motivo.ts`** (adjust `field:` names to Task 0 Step 1 findings)
  ```typescript
  import { Model, DataTypes } from 'sequelize'
  import { sequelizeWrite } from '../database/connection'

  interface IMotivoAttributes {
      motivoId: number
      descripcion: string
  }

  class Motivo extends Model<IMotivoAttributes> implements IMotivoAttributes {
      public motivoId!: number
      public descripcion!: string
  }

  Motivo.init(
      {
          motivoId: { type: DataTypes.INTEGER, primaryKey: true, field: 'motivo_id' },
          descripcion: { type: DataTypes.STRING(200), allowNull: false, field: 'descripcion' },
      },
      { sequelize: sequelizeWrite, modelName: 'Motivo', tableName: 'Motivos', timestamps: false },
  )

  export default Motivo
  ```

- [ ] **Step 3: `src/repositories/MotivosRepository.ts`**
  ```typescript
  import Motivo from '../models/Motivo'
  import { CustomError } from '../utils/errors'
  import { IMotivo } from '../types/planificacion'

  export class MotivosRepository {
      static async findAll(): Promise<IMotivo[]> {
          try {
              const rows = await Motivo.findAll({ order: [['descripcion', 'ASC']] })
              return rows.map(r => ({ motivoId: r.motivoId, descripcion: r.descripcion }))
          } catch (err) {
              throw new CustomError(500, `Error fetching motivos: ${err}`)
          }
      }
  }
  ```

- [ ] **Step 4: Failing test, then implement `MotivosService`** (cached, 5 min TTL — same shape as v1
  plan's Task 2, just repointed at the model-backed repository). Mock `MotivosRepository`, not the model.

- [ ] **Step 5: Run `npm test -- src/services/planificacion/MotivosService.spec.ts`, then commit.**

---

## Phase 2 — Seller identity + Cromo text helper

### Task 2: Seller identity resolver (real mechanism)

**Files:** Create `src/services/planificacion/sellerIdentity.ts`, test alongside.

- [ ] **Step 1: Failing test**
  ```typescript
  import { resolveSellerCode } from './sellerIdentity'
  import { SalesDataScopeResolver } from '../../business/SalesDataScope'
  import { CustomError } from '../../utils/errors'

  jest.mock('../../business/SalesDataScope')

  describe('resolveSellerCode', () => {
      it('returns the seller code from allowedSellerCodes[0]', async () => {
          ;(SalesDataScopeResolver.resolve as jest.Mock).mockResolvedValue({
              allowedSellerCodes: ['V 23'],
          })
          const code = await resolveSellerCode({ rol: 'vendedor' } as any)
          expect(code).toBe('V 23')
      })

      it('throws 400 when the resolver returns no seller code', async () => {
          ;(SalesDataScopeResolver.resolve as jest.Mock).mockResolvedValue({
              allowedSellerCodes: [],
          })
          await expect(resolveSellerCode({ rol: 'vendedor' } as any)).rejects.toBeInstanceOf(
              CustomError,
          )
      })
  })
  ```

- [ ] **Step 2: Implement**
  ```typescript
  import { IUser } from '../../types/user'
  import { SalesDataScopeResolver } from '../../business/SalesDataScope'
  import { CustomError } from '../../utils/errors'

  /** Reuses the existing scope resolver — 'vendedor' role is vendor-scoped, so
   *  allowedSellerCodes resolves to the logged-in seller's own cartera code. */
  export async function resolveSellerCode(user: IUser): Promise<string> {
      const scope = await SalesDataScopeResolver.resolve(user)
      const code = scope.allowedSellerCodes?.[0]
      if (!code) {
          throw new CustomError(400, 'No se pudo resolver el código de vendedor del usuario', {
              code: 'SELLER_CODE_UNRESOLVED',
          })
      }
      return code
  }
  ```

- [ ] **Step 3: Run test, commit.** No `id_equipo`/`Equipos` anywhere in this module — dropped.

### Task 3: Seguimiento text builder

Same as v1 plan's Task 4 (`buildSeguimientoDescripcion`) — unchanged, no dependencies on the
corrected pieces. Implement + test + commit.

---

## Phase 3 — Visitas lifecycle

### Task 4: `Visita` model + `VisitasRepository`

**Files:** Create `src/models/Visita.ts`, `src/repositories/VisitasRepository.ts`, tests.

- [ ] **Step 1: `src/models/Visita.ts`** (adjust `field:` per Task 0 Step 1 findings)
  ```typescript
  import { Model, DataTypes } from 'sequelize'
  import { sequelizeWrite } from '../database/connection'

  interface IVisitaAttributes {
      visitaId?: number
      codigoParticularVendedor: string
      codigoParticularCliente: string
      nombreCliente: string
      fechaInicio: Date
      fechaFin?: Date | null
      coordInicio?: string | null
      coordFinal?: string | null
      coordCliente?: string | null
  }

  class Visita extends Model<IVisitaAttributes> implements IVisitaAttributes {
      public visitaId!: number
      public codigoParticularVendedor!: string
      public codigoParticularCliente!: string
      public nombreCliente!: string
      public fechaInicio!: Date
      public fechaFin?: Date | null
      public coordInicio?: string | null
      public coordFinal?: string | null
      public coordCliente?: string | null
  }

  Visita.init(
      {
          visitaId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: 'visita_id' },
          codigoParticularVendedor: { type: DataTypes.STRING(50), allowNull: false, field: 'codigo_particular_vendedor' },
          codigoParticularCliente: { type: DataTypes.STRING(50), allowNull: false, field: 'codigo_particular_cliente' },
          nombreCliente: { type: DataTypes.STRING(200), allowNull: false, field: 'nombre_cliente' },
          fechaInicio: { type: DataTypes.DATE, allowNull: false, field: 'fecha_inicio' },
          fechaFin: { type: DataTypes.DATE, allowNull: true, field: 'fecha_fin' },
          coordInicio: { type: DataTypes.STRING(100), allowNull: true, field: 'coord_inicio' },
          coordFinal: { type: DataTypes.STRING(100), allowNull: true, field: 'coord_final' },
          coordCliente: { type: DataTypes.STRING(100), allowNull: true, field: 'coord_cliente' },
      },
      { sequelize: sequelizeWrite, modelName: 'Visita', tableName: 'Visitas', timestamps: false },
  )

  export default Visita
  ```
  No `id_equipo` field — intentionally dropped (see changelog).

- [ ] **Step 2: `src/repositories/VisitasRepository.ts`**
  ```typescript
  import { Op } from 'sequelize'
  import Visita from '../models/Visita'
  import { CustomError } from '../utils/errors'
  import { IVisita } from '../types/planificacion'

  export interface CreateIniciadaInput {
      codigoParticularVendedor: string
      codigoParticularCliente: string
      nombreCliente: string
      coordInicio: string | null
      coordCliente: string | null
  }

  export interface CreateNoVisitaInput {
      codigoParticularVendedor: string
      codigoParticularCliente: string
      nombreCliente: string
  }

  export class VisitasRepository {
      static async createIniciada(input: CreateIniciadaInput): Promise<number> {
          try {
              const row = await Visita.create({ ...input, fechaInicio: new Date() })
              return row.visitaId
          } catch (err) {
              throw new CustomError(500, `Error creating visita: ${err}`)
          }
      }

      static async createNoVisita(input: CreateNoVisitaInput): Promise<number> {
          try {
              const now = new Date()
              const row = await Visita.create({ ...input, fechaInicio: now, fechaFin: now })
              return row.visitaId
          } catch (err) {
              throw new CustomError(500, `Error creating no-visita: ${err}`)
          }
      }

      static async findActivaByVendedor(codigoVendedor: string): Promise<IVisita | null> {
          const row = await Visita.findOne({
              where: { codigoParticularVendedor: codigoVendedor, fechaFin: null },
              order: [['fechaInicio', 'DESC']],
          })
          return row ? toIVisita(row) : null
      }

      static async findById(visitaId: number): Promise<IVisita | null> {
          const row = await Visita.findByPk(visitaId)
          return row ? toIVisita(row) : null
      }

      static async cerrar(visitaId: number, coordFinal: string | null): Promise<void> {
          await Visita.update(
              { coordFinal, fechaFin: new Date() },
              { where: { visitaId } },
          )
      }

      /** Client codes already resolved (closed OR no-visita) for a seller on a given date. */
      static async findResueltasByFecha(codigoVendedor: string, fecha: string): Promise<string[]> {
          const start = new Date(`${fecha}T00:00:00`)
          const end = new Date(`${fecha}T23:59:59.999`)
          const rows = await Visita.findAll({
              attributes: ['codigoParticularCliente'],
              where: {
                  codigoParticularVendedor: codigoVendedor,
                  fechaInicio: { [Op.between]: [start, end] },
                  fechaFin: { [Op.ne]: null },
              },
              group: ['codigoParticularCliente'],
          })
          return rows.map(r => r.codigoParticularCliente)
      }
  }

  function toIVisita(r: Visita): IVisita {
      return {
          visitaId: r.visitaId,
          codigoParticularVendedor: r.codigoParticularVendedor,
          codigoParticularCliente: r.codigoParticularCliente,
          nombreCliente: r.nombreCliente,
          fechaInicio: r.fechaInicio.toISOString(),
          fechaFin: r.fechaFin ? r.fechaFin.toISOString() : null,
          coordInicio: r.coordInicio ?? null,
          coordFinal: r.coordFinal ?? null,
          coordCliente: r.coordCliente ?? null,
      }
  }
  ```

- [ ] **Step 3: Tests** — mock `../models/Visita` (`jest.mock('../models/Visita')`), assert
  `Visita.create`/`.findOne`/`.update` are called with the right `where`/data, not SQL strings
  (the model IS the contract now, unlike v1's raw-SQL string assertions).

- [ ] **Step 4: Run tests, commit.**

### Task 5: `ClienteCoordRepository` (warehouse, not MySQL)

**Files:** Create `src/repositories/ClienteCoordRepository.ts` + test.

- [ ] **Step 1: Implement** (mirrors `SalesDataScopeResolver`'s use of `warehouseQuery`)
  ```typescript
  import { query } from '../database/warehouse'

  interface CoordRow {
      latitude: number | null
      longitude: number | null
  }

  export async function getCoordCliente(codigoParticularCliente: string): Promise<string | null> {
      const rows = await query<CoordRow>(
          `SELECT latitude, longitude FROM analytics.fct_clients WHERE particular_code = $1 LIMIT 1`,
          [codigoParticularCliente],
      )
      const c = rows[0]
      if (!c || c.latitude == null || c.longitude == null) return null
      return `${c.latitude},${c.longitude}`
  }
  ```
  Confirm the exact join column (`particular_code` vs. another code) against `fct_clients.sql`
  when implementing — same column used by `SalesDataScopeResolver.resolveVendedorCodes`.

- [ ] **Step 2: Test with a mocked `query`, commit.**

### Task 6: `VisitasService` — iniciar + activa

**Files:** Create `src/services/planificacion/VisitasService.ts` + test.

- [ ] **Step 1: Failing test** (mock `VisitasRepository`, `resolveSellerCode`, `getCoordCliente`) —
  same two cases as v1 plan's Task 6 (blocks when a visit is active; creates + returns `visitaId`
  otherwise), updated to call `resolveSellerCode(user)` directly instead of an
  `resolveSellerVisitIdentity` object with `idEquipo`.

- [ ] **Step 2: Implement**
  ```typescript
  import { IUser } from '../../types/user'
  import { CustomError } from '../../utils/errors'
  import { VisitasRepository } from '../../repositories/VisitasRepository'
  import { resolveSellerCode } from './sellerIdentity'
  import { getCoordCliente } from '../../repositories/ClienteCoordRepository'
  import { IIniciarVisitaDTO, IVisita } from '../../types/planificacion'

  export class VisitasService {
      static async getActiva(user: IUser): Promise<IVisita | null> {
          const codigo = await resolveSellerCode(user)
          return VisitasRepository.findActivaByVendedor(codigo)
      }

      static async iniciar(user: IUser, dto: IIniciarVisitaDTO): Promise<{ visitaId: number }> {
          const codigo = await resolveSellerCode(user)

          const activa = await VisitasRepository.findActivaByVendedor(codigo)
          if (activa) {
              throw new CustomError(409, 'Ya tenés una visita activa. Cerrala antes de iniciar otra.', {
                  code: 'VISITA_ACTIVA_EXISTENTE',
              })
          }

          const coordCliente = await getCoordCliente(dto.codigoParticularCliente)

          const visitaId = await VisitasRepository.createIniciada({
              codigoParticularVendedor: codigo,
              codigoParticularCliente: dto.codigoParticularCliente,
              nombreCliente: dto.nombreCliente,
              coordInicio: dto.coordInicio,
              coordCliente,
          })

          return { visitaId }
      }
  }
  ```

- [ ] **Step 3: Run test, commit.**

### Task 7: `VisitasService` — cerrar + Cromo seguimiento + retry endpoint contract

**Files:** Modify `src/services/planificacion/VisitasService.ts` + spec.

- [ ] **Step 1: Failing tests** (append to the spec) — cover:
  1. Closing an owned, open visita updates it and posts a Cromo seguimiento →
     `{ seguimientoPendiente: false }`.
  2. Closing a visita that belongs to **another** seller → `403`.
  3. Closing an already-closed visita → `409`.
  4. Cromo `createEvent` throwing any error (mock a `CustomError(401, ..., { code: 'CRM_NOT_LINKED' })`)
     → visita still updates, `{ seguimientoPendiente: true, motivoPendiente: 'CRM_NOT_LINKED',
     descripcionParaReintentar: <text> }`.
  5. `reintentarSeguimiento(user, visitaId, motivoIds)` — same ownership check, calls
     `postSeguimiento` again without touching `Visita.cerrar`.

- [ ] **Step 2: Implement** (add to `VisitasService`)
  ```typescript
  import { ICerrarVisitaDTO, ISeguimientoResult } from '../../types/planificacion'
  import { MotivosService } from './MotivosService'
  import { CrmService } from '../crm/CrmService'
  import { buildSeguimientoDescripcion } from './seguimientoText'
  import { createLogger } from '../../utils/logger'

  const log = createLogger('VisitasService')

  // ...inside the class:

  static async cerrar(user: IUser, dto: ICerrarVisitaDTO): Promise<ISeguimientoResult> {
      const codigo = await resolveSellerCode(user)
      const visita = await VisitasRepository.findById(dto.visitaId)
      if (!visita) throw new CustomError(404, 'Visita no encontrada', { code: 'VISITA_NOT_FOUND' })
      if (visita.codigoParticularVendedor !== codigo) {
          throw new CustomError(403, 'Esta visita no te pertenece', { code: 'VISITA_AJENA' })
      }
      if (visita.fechaFin) {
          throw new CustomError(409, 'La visita ya fue cerrada', { code: 'VISITA_YA_CERRADA' })
      }

      await VisitasRepository.cerrar(dto.visitaId, dto.coordFinal)

      return this.postSeguimiento(user, visita.codigoParticularCliente, dto.motivoIds)
  }

  static async reintentarSeguimiento(
      user: IUser,
      visitaId: number,
      motivoIds: number[],
  ): Promise<ISeguimientoResult> {
      const codigo = await resolveSellerCode(user)
      const visita = await VisitasRepository.findById(visitaId)
      if (!visita) throw new CustomError(404, 'Visita no encontrada', { code: 'VISITA_NOT_FOUND' })
      if (visita.codigoParticularVendedor !== codigo) {
          throw new CustomError(403, 'Esta visita no te pertenece', { code: 'VISITA_AJENA' })
      }
      return this.postSeguimiento(user, visita.codigoParticularCliente, motivoIds)
  }

  private static async postSeguimiento(
      user: IUser,
      clientCode: string,
      motivoIds: number[],
  ): Promise<ISeguimientoResult> {
      const all = await MotivosService.list()
      const selected = all.filter(m => motivoIds.includes(m.motivoId))
      const descripcion = buildSeguimientoDescripcion(selected)

      try {
          await CrmService.createEvent({ userId: user.id, clientCode, descripcion })
          return { seguimientoPendiente: false }
      } catch (err: any) {
          log.error('Cromo seguimiento failed; flagged as pending', {
              clientCode,
              code: err?.code,
              message: err?.message,
          })
          return {
              seguimientoPendiente: true,
              motivoPendiente: err?.code ?? 'CRM_UNKNOWN',
              descripcionParaReintentar: descripcion,
          }
      }
  }
  ```

- [ ] **Step 3: Run test, commit.**

### Task 8: `VisitasService` — no-visita / reagendar (with duplicate guard)

- [ ] **Step 1: Failing test** — includes a case where `findResueltasByFecha` already contains the
  client code for today → `registrarNoVisita` throws `409 VISITA_YA_RESUELTA_HOY` **without**
  calling `createNoVisita` or `postSeguimiento`.

- [ ] **Step 2: Implement**
  ```typescript
  static async registrarNoVisita(
      user: IUser,
      dto: INoVisitaDTO,
  ): Promise<{ visitaId: number } & ISeguimientoResult> {
      const codigo = await resolveSellerCode(user)

      const today = new Date().toISOString().slice(0, 10)
      const resueltas = await VisitasRepository.findResueltasByFecha(codigo, today)
      if (resueltas.includes(dto.codigoParticularCliente)) {
          throw new CustomError(409, 'Este cliente ya fue resuelto hoy', {
              code: 'VISITA_YA_RESUELTA_HOY',
          })
      }

      const visitaId = await VisitasRepository.createNoVisita({
          codigoParticularVendedor: codigo,
          codigoParticularCliente: dto.codigoParticularCliente,
          nombreCliente: dto.nombreCliente,
      })

      const seguimiento = await this.postSeguimiento(user, dto.codigoParticularCliente, dto.motivoIds)
      return { visitaId, ...seguimiento }
  }
  ```

- [ ] **Step 3: Run test, commit.**

---

## Phase 4 — Agenda (CSV mock)

### Task 9: `AgendaRepository` (CSV-backed) + `AgendaService`

**Files:** Create `src/data/agendaMock.ts`, `src/repositories/AgendaRepository.ts`,
`src/services/planificacion/AgendaService.ts`, tests.

> Blocked on Task 0 Step 2 (final CSV shape with seller codes). Once available:

- [ ] **Step 1: `src/data/agendaMock.ts`** — parse the CSV at build time (or commit a small
  generated JSON alongside it) into `Record<sellerCode, Record<'LUN'|'MAR'|'MIE'|'JUE'|'VIE',
  IAgendaClient[]>>`. Keep the parser separate from the data so swapping to a real warehouse query
  later only touches `AgendaRepository`, not `AgendaService`.

- [ ] **Step 2: `AgendaRepository.findBySellerWeek(codigoVendedor)`** reads from `agendaMock`
  (no DB call) and returns `IAgendaClient[]` with a `diaVisita` field, same output shape the
  service already expects — this keeps `AgendaService` identical to what a warehouse-backed
  version would look like.

- [ ] **Step 3: `AgendaService.getSemana`/`getDia`** — same logic as v1 plan's Task 9
  (group by day; `getDia` merges `findResueltasByFecha` to compute `resuelto`). No changes needed
  here since `AgendaRepository`'s output contract didn't change.

- [ ] **Step 4: Tests + commit.**

---

## Phase 5 — HTTP layer

### Task 10: Controller

Same shape as v1 plan's Task 10, plus a new action:

```typescript
static async reintentarSeguimiento(req: Request, res: Response): Promise<void> {
    try {
        const visitaId = parseInt(req.params.id)
        const { motivoIds } = req.body
        if (isNaN(visitaId) || !Array.isArray(motivoIds)) {
            res.status(400).json({ ok: 0, data: 'id de visita y motivoIds son requeridos' })
            return
        }
        const data = await VisitasService.reintentarSeguimiento(req.user!, visitaId, motivoIds)
        res.status(200).json({ ok: 1, data })
    } catch (err: any) {
        res.status(err.statusCode || 500).json({ ok: 0, data: err.message })
    }
}
```

- [ ] Write failing test, implement all controller methods, run tests, commit.

### Task 11: Routes + app wiring + RBAC

**Files:** Create `src/routes/planificacion.ts`, modify `src/app.ts`.

- [ ] **Step 1: `src/routes/planificacion.ts`**
  ```typescript
  import { Router } from 'express'
  import PlanificacionController from '../controllers/planificacionController'
  import { authMiddleware } from '../middleware/auth'
  import { authorize } from '../middleware/authorize'

  const router = Router()

  router.use(authMiddleware)
  router.use(authorize('vendedor'))

  router.get('/agenda/semana', PlanificacionController.getSemana)
  router.get('/agenda/dia', PlanificacionController.getDia)
  router.get('/motivos', PlanificacionController.getMotivos)
  router.get('/visitas/activa', PlanificacionController.getVisitaActiva)
  router.post('/visitas', PlanificacionController.iniciarVisita)
  router.put('/visitas/:id/cerrar', PlanificacionController.cerrarVisita)
  router.post('/visitas/no-visita', PlanificacionController.noVisita)
  router.post('/visitas/:id/seguimiento', PlanificacionController.reintentarSeguimiento)

  export default router
  ```
  Restricted to `vendedor` only (unlike v1's guess of `'vendedor', 'tv', 'supervisor', 'admin'`) —
  this is a seller-execution flow, not a supervisor view; widen later only if a real supervisor use
  case shows up.

- [ ] **Step 2: Mount in `src/app.ts`**, matching every sibling router's double-prefix pattern:
  ```typescript
  import planificacionRoutes from './routes/planificacion'
  // ...
  app.use('/prod/vs/planificacion', planificacionRoutes)
  // ...
  app.use('/staging/vs/planificacion', planificacionRoutes)
  ```
  (Insert alongside the other `app.use('/prod/vs/...')`/`app.use('/staging/vs/...')` lines,
  `src/app.ts:142-155`.)

- [ ] **Step 3: `npm run build` — no TypeScript errors.**
- [ ] **Step 4: `npm test` — all planificacion specs pass, nothing else breaks.**
- [ ] **Step 5: Commit.**

### Task 12: OpenAPI docs + manual smoke test

Same as v1 plan's Task 12, updated for the real base path
(`http://localhost:<port>/prod/vs/planificacion` or `/staging/vs/planificacion`) and the new
`POST /visitas/:id/seguimiento` endpoint.

---

## Endpoint summary (contract the frontend plan will consume)

| Method | Path | Purpose | Body / Query | Response `data` |
|---|---|---|---|---|
| GET | `/planificacion/agenda/semana` | Weekly clients grouped by day (CSV mock for now) | — | `{ LUN: [...], MAR: [...], ... }` |
| GET | `/planificacion/agenda/dia` | Day's clients + resolved flag | `?dia=LUN&fecha=YYYY-MM-DD` | `IAgendaClient[]` (with `resuelto`) |
| GET | `/planificacion/motivos` | Motivos catalog (picklist) | — | `IMotivo[]` |
| GET | `/planificacion/visitas/activa` | Current open visit (or null) | — | `IVisita \| null` |
| POST | `/planificacion/visitas` | Iniciar visita | `IIniciarVisitaDTO` | `{ visitaId }` |
| PUT | `/planificacion/visitas/:id/cerrar` | Cerrar visita + Cromo | `{ coordFinal, motivoIds }` | `ISeguimientoResult` |
| POST | `/planificacion/visitas/no-visita` | No-visita/reagendar + Cromo | `INoVisitaDTO` | `{ visitaId } & ISeguimientoResult` |
| POST | `/planificacion/visitas/:id/seguimiento` | Retry a pending Cromo seguimiento | `{ motivoIds }` | `ISeguimientoResult` |

**Reused as-is (no new backend work):** `POST /rubro/recommendations` (propuesta comercial —
already exists and is mounted, `src/routes/sale.ts:77`) and the existing Versus/ventas endpoints.
The frontend calls those directly.

---

## Self-review notes (traceability to spec)

- Spec §5 flujo → Tasks 6–8 (iniciar/cerrar/no-visita) + Task 9 (agenda semana/dia).
- Spec §6 geolocalización (2 puntos) → `coordInicio` (Task 6), `coordFinal` (Task 7); permiso
  denegado → `null` aceptado por los DTOs.
- Spec §7 duplicados → `findResueltasByFecha` (Task 4) usado por `getDia` (Task 9) y por el guard
  nuevo en `registrarNoVisita` (Task 8); re-cierre bloqueado por el check de `fechaFin` (Task 7).
- Spec §8 motivos (solo lectura) → Task 1; sin tabla de escritura.
- Spec §9 Cromo única fuente de verdad → `postSeguimiento` (Task 7), reusado por no-visita (Task 8)
  y por el endpoint de reintento (Task 7/10/11).
- Spec §10 error handling → `ISeguimientoResult`/`motivoPendiente` (Task 7); geoloc denegada
  aceptada (Tasks 6–7); reintento manual sin cola (ver changelog).
- Spec §12 preguntas abiertas → todas resueltas en este v2 excepto el esquema exacto de
  `Visitas`/`Motivos` y la forma final del CSV, que quedan en el Task 0 de esta versión.
