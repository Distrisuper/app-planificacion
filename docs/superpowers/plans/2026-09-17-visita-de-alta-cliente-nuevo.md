# Visita de alta ("Cliente nuevo") — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el vendedor pueda agendar, posponer, iniciar y cerrar una visita a un comercio que todavía no es cliente, reusando la fila del plan como cita y la resolución como hecho, con el aviso a Cromo al cliente genérico 09895.

**Architecture:** La alta es una fila de `pl_rotacion_cliente` con `tipo = 'alta'`, `es_extra = 1`, código sintético `ALTA-<id>` y los datos del comercio en `detalle JSON`. La visita es una `pl_resolucion` común (`visita`/`no_visita`) cuyo `detalle JSON` guarda el contacto de esa visita. No hay tablas nuevas. La agenda arma la card desde el JSON en vez de omitir la fila; Cromo saltea el warehouse y manda a `09895` con etiqueta `ALTA`; la cobertura queda intacta por el filtro `es_extra = 0` que ya existe.

**Tech Stack:** api-vendedores (Express + Sequelize + MySQL, Jest) · app-planificacion (Vite + React 19 + React Query, Vitest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-09-17-visita-de-alta-cliente-nuevo-design.md`.

## Global Constraints

- **Rutas de los repos.** Backend: `C:/Users/matia/OneDrive/Documentos/distri/business-platform/versus/api-vendedores` (rama `feature/visita-de-alta`, ya creada). Front: `C:/Users/matia/OneDrive/Documentos/distri/app-planificacion` (rama `feature/visita-de-alta`, ya creada). En este plan `$API` = la ruta del backend y `$APP` = la del front. **No** usar `C:/Users/matia/OneDrive/Documentos/distri/vendedores/api-vendedores`: es un clon viejo sin el dominio `planificacion`.
- **Vocabulario del vendedor:** la UI dice **"Cliente nuevo"**. Nunca "alta", "prospecto", "extra" ni "semana N" en textos visibles para el vendedor.
- **Código sintético:** `ALTA-` + `id` de la fila con 6 dígitos (`ALTA-000123`). Provisorio durante el insert: `ALTA-<uuid>`.
- **Cliente genérico de Cromo:** `'09895'`. Etiqueta: `'ALTA'`.
- **Límites de texto:** `nombre` 1..120, `razonSocial` ≤120, `direccion` ≤200, `contacto` ≤80, `fechaNacimiento` `YYYY-MM-DD`. Vacío tras `trim()` → `null`, nunca `''`.
- **`TipoResolucion` no cambia** (`visita | no_visita`). La naturaleza de alta la da `pl_rotacion_cliente.tipo`.
- **Gate de cierre del alta (front):** al menos un ofrecimiento completo **o** una observación no vacía.
- **Contacto sólo al cerrar la visita.** `no_visita` no lleva contacto (simplificación respecto del spec, ver Task 20).
- **Commits:** mensaje en español, imperativo, prefijo `feat(alta):`/`fix(alta):`/`docs(alta):`, terminado en `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Un commit por task.
- **Tests:** backend `npx jest <archivo>` desde `$API`; front `npx vitest run <archivo>` desde `$APP`. TDD: test primero, verlo fallar, implementar, verlo pasar.

---

## Mapa de archivos

### Backend (`$API`)

| archivo | responsabilidad |
|---|---|
| `docs/db-notes/planificacion-visita-alta.sql` (crear) | los dos `ALTER` idempotentes |
| `docs/db-notes/planificacion-ciclo-tables.sql` (modificar) | DDL consolidado: columnas nuevas comentadas |
| `src/models/planificacion/RotacionCliente.ts` | `tipo`, `detalle` |
| `src/models/planificacion/Resolucion.ts` | `detalle` |
| `src/types/planificacion.ts` | `TipoFilaPlan`, `IDetalleAlta`, `IDetalleContactoAlta`, campos nuevos en `IRotacionCliente`, `IResolucion`, `IAgendaClient`, `IAgendaClientAdmin`, `ICerrarVisitaDTO`, DTOs de altas |
| `src/repositories/RotacionClienteRepository.ts` | `crearAlta`, `actualizarDetalleAlta`, mapping |
| `src/repositories/ResolucionRepository.ts` | `cerrarVisita(..., detalle)`, mapping |
| `src/services/planificacion/altaDetalle.ts` (crear) | normalización/validación pura de los JSON |
| `src/services/planificacion/AltasService.ts` (crear) | crear / editar / reintentar |
| `src/controllers/planificacionController.ts` | handlers de altas + `detalle` en cerrar |
| `src/routes/planificacion.ts` | `/altas`, `/altas/:id`, `/altas/:id/reintentar` |
| `src/services/planificacion/AgendaService.ts` | card desde `detalle` para `tipo='alta'` |
| `src/services/planificacion/VisitasService.ts` | alta: sin coord warehouse, sin propuesta; `detalle` al cerrar |
| `src/services/planificacion/GerenciaRotacionService.ts` | `tipo` en la card admin |
| `src/config/cromoTags.ts` | `CLIENTE_GENERICO_ALTA`, `TAG_ALTA` |
| `src/services/crm/seguimientoTexto.ts` | `prefijoAlta`, `conContacto` |
| `src/services/crm/CrmEventoVisitaService.ts` | rama alta |
| `src/repositories/AnaliticaRepository.ts` | `tipo='cliente'` en fuera de plan; `cc.tipo, cc.detalle` en visitas |
| `src/services/planificacion/AnaliticaService.ts` | nombre desde `detalle` cuando no hay ficha |

### Front (`$APP`)

| archivo | responsabilidad |
|---|---|
| `src/types/planificacion.ts` | tipos espejo |
| `src/lib/alta.ts` (crear) | `esAlta()`, `puedeCerrarAlta()` |
| `src/api/planificacion.ts` | `crearAlta`, `editarAlta`, `reintentarAlta` |
| `src/hooks/useAltas.ts` (crear) | mutaciones |
| `src/hooks/useVisitas.ts` | `detalle` en cerrar |
| `src/components/ClienteNuevoSheet.tsx` (crear) | formulario crear / editar / volver a agendar |
| `src/components/buscador/BuscadorDiaSheet.tsx` | botón "Cliente nuevo" |
| `src/pages/AgendaSemanaPage.tsx` | wiring |
| `src/components/ClienteCard.tsx` | variante alta |
| `src/components/VisitaFlow.tsx` | inicio directo sin propuesta ni mapa |
| `src/components/VisitaSheet.tsx` | gate, contacto, sin rubroStatus |
| `src/components/ruta/ClienteCardRuta.tsx` | chip en el grid de gerencia |
| `docs/dominio/tablas.md`, `docs/dominio/modelo.md`, `CLAUDE.md` | documentación viva |

---

## Backend

### Task 1: Esquema y modelos

**Files:**
- Create: `$API/docs/db-notes/planificacion-visita-alta.sql`
- Modify: `$API/docs/db-notes/planificacion-ciclo-tables.sql` (bloque `pl_rotacion_cliente`, después de `es_extra`; bloque `pl_resolucion`, después de `observaciones`)
- Modify: `$API/src/models/planificacion/RotacionCliente.ts`
- Modify: `$API/src/models/planificacion/Resolucion.ts`
- Modify: `$API/src/types/planificacion.ts`
- Modify: `$API/src/repositories/RotacionClienteRepository.ts` (`toIRotacionCliente`, línea ~679)
- Modify: `$API/src/repositories/ResolucionRepository.ts` (`toIResolucion` ~291, `rawToIResolucion` ~308, `cerrarVisita` ~159)
- Test: `$API/src/repositories/RotacionClienteRepository.spec.ts`, `$API/src/repositories/ResolucionRepository.spec.ts`

**Interfaces (Produces):**
```ts
// src/types/planificacion.ts
export type TipoFilaPlan = 'cliente' | 'alta'
export interface IDetalleAlta { nombre: string; razonSocial: string | null; direccion: string | null }
export interface IDetalleContactoAlta { contacto: string | null; fechaNacimiento: string | null }
// IRotacionCliente += tipo: TipoFilaPlan; detalle: IDetalleAlta | null
// IResolucion += detalle: IDetalleContactoAlta | null
// ResolucionRepository.cerrarVisita(id, coordFinal, observaciones, detalle: IDetalleContactoAlta | null)
```

- [ ] **Step 1: Script SQL**

```sql
-- $API/docs/db-notes/planificacion-visita-alta.sql
-- Visita de alta ("Cliente nuevo"): la fila del plan puede representar un comercio que
-- todavía no es cliente. Ver app-planificacion,
-- docs/superpowers/specs/2026-09-17-visita-de-alta-cliente-nuevo-design.md.
-- Idempotente: MySQL 8 soporta IF NOT EXISTS en ADD COLUMN.
ALTER TABLE pl_rotacion_cliente
  ADD COLUMN IF NOT EXISTS tipo    VARCHAR(20) NOT NULL DEFAULT 'cliente' AFTER es_extra, -- 'cliente' | 'alta'
  ADD COLUMN IF NOT EXISTS detalle JSON        NULL                       AFTER tipo;     -- solo tipo='alta': { nombre, razonSocial, direccion }

ALTER TABLE pl_resolucion
  ADD COLUMN IF NOT EXISTS detalle JSON NULL AFTER observaciones; -- solo visitas de una fila tipo='alta': { contacto, fechaNacimiento }
```

- [ ] **Step 2: DDL consolidado** — en `planificacion-ciclo-tables.sql`, agregar debajo de `es_extra`:

```sql
  tipo                      VARCHAR(20) NOT NULL DEFAULT 'cliente', -- 'cliente' | 'alta' (Cliente nuevo: comercio que todavía no es cliente)
  detalle                   JSON        NULL,                        -- solo tipo='alta': { nombre, razonSocial, direccion }. Nadie agrupa por esto, por eso JSON.
```
y en `pl_resolucion` debajo de `observaciones`:
```sql
  detalle          JSON         NULL,     -- solo visitas de una fila tipo='alta': { contacto, fechaNacimiento }. Por visita porque la persona puede cambiar entre intentos.
```

- [ ] **Step 3: Test del mapping de la fila** — agregar a `RotacionClienteRepository.spec.ts`:

```ts
describe('findById — tipo y detalle', () => {
    it('mapea tipo y detalle de una fila de alta', async () => {
        mockedFindByPk.mockResolvedValue({
            id: 9, rotacionId: 7, codigoParticularCliente: 'ALTA-000009', semana: 2, dia: 3,
            esExtra: true, deletedAt: null, tipo: 'alta',
            detalle: { nombre: 'Autopartes Piche', razonSocial: null, direccion: 'San Martín 811' },
        })
        const fila = await RotacionClienteRepository.findById(9)
        expect(fila).toMatchObject({
            tipo: 'alta',
            detalle: { nombre: 'Autopartes Piche', razonSocial: null, direccion: 'San Martín 811' },
        })
    })

    it('una fila común sale tipo cliente y detalle null aunque el modelo no traiga las columnas', async () => {
        mockedFindByPk.mockResolvedValue({
            id: 1, rotacionId: 7, codigoParticularCliente: '6836', semana: 2, dia: 3, esExtra: false, deletedAt: null,
        })
        const fila = await RotacionClienteRepository.findById(1)
        expect(fila).toMatchObject({ tipo: 'cliente', detalle: null })
    })
})
```

- [ ] **Step 4: Correr y ver fallar** — `npx jest src/repositories/RotacionClienteRepository.spec.ts -t "tipo y detalle"`. Esperado: FAIL (`tipo` undefined).

- [ ] **Step 5: Tipos** — en `src/types/planificacion.ts`, arriba de `IRotacionCliente`:

```ts
/** Qué representa la fila del plan. 'alta' = "Cliente nuevo": un comercio que todavía
 *  no es cliente (spec 2026-09-17). Va en columna propia y NO reciclando es_extra: la
 *  alta es extra (fuera del plan materializado), pero "fuera del plan" y "no es un
 *  cliente" son dos propiedades distintas. */
export type TipoFilaPlan = 'cliente' | 'alta'

/** Datos del COMERCIO de una fila tipo='alta' (pl_rotacion_cliente.detalle). Estables
 *  entre intentos. JSON y no columnas: nadie agrupa por razón social. */
export interface IDetalleAlta {
    nombre: string
    razonSocial: string | null
    direccion: string | null
}

/** La PERSONA contactada en una visita de alta (pl_resolucion.detalle). Por visita,
 *  porque puede cambiar entre intentos. */
export interface IDetalleContactoAlta {
    contacto: string | null
    fechaNacimiento: string | null
}
```
En `IRotacionCliente` agregar `tipo: TipoFilaPlan` y `detalle: IDetalleAlta | null`. En `IResolucion` agregar `detalle: IDetalleContactoAlta | null` después de `observaciones`.

- [ ] **Step 6: Modelo RotacionCliente** — en la interfaz de atributos agregar `tipo?: TipoFilaPlan` y `detalle?: IDetalleAlta | null`; en la clase `public tipo!: TipoFilaPlan` y `public detalle!: IDetalleAlta | null`; en `init`, después de `esExtra`:

```ts
        tipo: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'cliente', field: 'tipo' },
        detalle: { type: DataTypes.JSON, allowNull: true, field: 'detalle' },
```
Importar `import { IDetalleAlta, TipoFilaPlan } from '../../types/planificacion'`.

- [ ] **Step 7: Modelo Resolucion** — atributo `detalle?: IDetalleContactoAlta | null`, propiedad pública, y en `init` después de `observaciones`:

```ts
        // Contacto de una visita de ALTA ({ contacto, fechaNacimiento }). NULL para toda
        // visita a un cliente real. Se escribe al cerrar, como observaciones.
        detalle: { type: DataTypes.JSON, allowNull: true, field: 'detalle' },
```

- [ ] **Step 8: Mappings** — `toIRotacionCliente`:

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
        tipo: r.tipo === 'alta' ? 'alta' : 'cliente',
        detalle: parseJson<IDetalleAlta>(r.detalle),
    }
}

/** mysql2 devuelve JSON ya parseado, pero un raw query con CAST o un fixture viejo puede
 *  traerlo como string: se aceptan los dos. */
export function parseJson<T>(v: unknown): T | null {
    if (v == null) return null
    if (typeof v === 'string') {
        try { return JSON.parse(v) as T } catch { return null }
    }
    return v as T
}
```
En `ResolucionRepository`: `toIResolucion` y `rawToIResolucion` agregan `detalle: parseJson<IDetalleContactoAlta>(r.detalle)` (importar `parseJson` desde `RotacionClienteRepository`, o moverlo a `src/utils/json.ts` si el import cruzado molesta — elegí `src/utils/json.ts` y exportalo de ahí). En `rawToIResolucion` el `ResolucionRow` necesita `detalle?: unknown`, y toda query cruda que arme una `IResolucion` (buscar `SELECT r.id` en el archivo) tiene que seleccionar `r.detalle`.

- [ ] **Step 9: `cerrarVisita` con detalle**

```ts
    static async cerrarVisita(
        id: number,
        coordFinal: string | null,
        observaciones: string | null,
        detalle: IDetalleContactoAlta | null = null,
    ): Promise<void> {
        try {
            await Resolucion.update(
                { coordFinal, fechaFin: new Date(), observaciones, detalle },
                { where: { id } },
            )
        } catch (err) {
            throw new CustomError(500, `Error cerrando visita: ${err}`)
        }
    }
```
Test en `ResolucionRepository.spec.ts` (seguir el estilo de mocks del archivo):
```ts
it('cerrarVisita persiste el detalle del contacto cuando viene', async () => {
    await ResolucionRepository.cerrarVisita(5, '-34.6,-58.4', null, { contacto: 'Gustavo', fechaNacimiento: '1978-03-14' })
    expect(Resolucion.update).toHaveBeenCalledWith(
        expect.objectContaining({ detalle: { contacto: 'Gustavo', fechaNacimiento: '1978-03-14' } }),
        { where: { id: 5 } },
    )
})
```

- [ ] **Step 10: Correr** — `npx jest src/repositories/RotacionClienteRepository.spec.ts src/repositories/ResolucionRepository.spec.ts` y `npx tsc --noEmit`. Esperado: PASS, sin errores de tipo (los fixtures de `IRotacionCliente`/`IResolucion` en otros specs van a exigir `tipo`/`detalle`: agregarlos en las factories, `tipo: 'cliente', detalle: null`).

- [ ] **Step 11: Commit**

```bash
git add docs/db-notes src/models src/types src/repositories src/utils
git commit -m "feat(alta): columnas tipo/detalle en pl_rotacion_cliente y detalle en pl_resolucion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Normalización de los JSON del alta

**Files:**
- Create: `$API/src/services/planificacion/altaDetalle.ts`
- Test: `$API/src/services/planificacion/altaDetalle.spec.ts`

**Interfaces (Produces):**
```ts
export const ALTA_NOMBRE_MAX = 120, ALTA_RAZON_SOCIAL_MAX = 120, ALTA_DIRECCION_MAX = 200, ALTA_CONTACTO_MAX = 80
export type ResultadoNormalizacion<T> = { ok: true; valor: T } | { ok: false; code: string; mensaje: string }
export function normalizarDetalleAlta(body: unknown, opts?: { nombreRequerido?: boolean }): ResultadoNormalizacion<IDetalleAlta | Partial<IDetalleAlta>>
export function normalizarDetalleContacto(body: unknown): ResultadoNormalizacion<IDetalleContactoAlta | null>
```

- [ ] **Step 1: Tests**

```ts
import { normalizarDetalleAlta, normalizarDetalleContacto } from './altaDetalle'

describe('normalizarDetalleAlta', () => {
    it('trimea y convierte vacíos en null', () => {
        expect(normalizarDetalleAlta({ nombre: '  Autopartes Piche ', razonSocial: '   ', direccion: undefined }))
            .toEqual({ ok: true, valor: { nombre: 'Autopartes Piche', razonSocial: null, direccion: null } })
    })
    it('rechaza nombre vacío con ALTA_SIN_NOMBRE', () => {
        expect(normalizarDetalleAlta({ nombre: '  ' })).toMatchObject({ ok: false, code: 'ALTA_SIN_NOMBRE' })
    })
    it('rechaza nombre de más de 120 con ALTA_NOMBRE_MUY_LARGO', () => {
        expect(normalizarDetalleAlta({ nombre: 'x'.repeat(121) })).toMatchObject({ ok: false, code: 'ALTA_NOMBRE_MUY_LARGO' })
    })
    it('en edición el nombre es opcional y solo viajan las claves presentes', () => {
        expect(normalizarDetalleAlta({ direccion: 'Ruta 5 km 2' }, { nombreRequerido: false }))
            .toEqual({ ok: true, valor: { direccion: 'Ruta 5 km 2' } })
    })
    it('rechaza un body que no es objeto', () => {
        expect(normalizarDetalleAlta('hola')).toMatchObject({ ok: false, code: 'ALTA_DETALLE_INVALIDO' })
    })
})

describe('normalizarDetalleContacto', () => {
    it('ausente → null', () => {
        expect(normalizarDetalleContacto(undefined)).toEqual({ ok: true, valor: null })
    })
    it('todo vacío → null (no se guarda un objeto de nulls)', () => {
        expect(normalizarDetalleContacto({ contacto: ' ', fechaNacimiento: '' })).toEqual({ ok: true, valor: null })
    })
    it('acepta contacto y fecha YYYY-MM-DD', () => {
        expect(normalizarDetalleContacto({ contacto: ' Gustavo ', fechaNacimiento: '1978-03-14' }))
            .toEqual({ ok: true, valor: { contacto: 'Gustavo', fechaNacimiento: '1978-03-14' } })
    })
    it('rechaza fecha inválida con CONTACTO_FECHA_INVALIDA', () => {
        expect(normalizarDetalleContacto({ fechaNacimiento: '14/03/1978' })).toMatchObject({ ok: false, code: 'CONTACTO_FECHA_INVALIDA' })
        expect(normalizarDetalleContacto({ fechaNacimiento: '2026-02-30' })).toMatchObject({ ok: false, code: 'CONTACTO_FECHA_INVALIDA' })
    })
    it('rechaza contacto de más de 80', () => {
        expect(normalizarDetalleContacto({ contacto: 'x'.repeat(81) })).toMatchObject({ ok: false, code: 'CONTACTO_MUY_LARGO' })
    })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npx jest src/services/planificacion/altaDetalle.spec.ts`. Esperado: FAIL (módulo inexistente).

- [ ] **Step 3: Implementación**

```ts
import { IDetalleAlta, IDetalleContactoAlta } from '../../types/planificacion'

export const ALTA_NOMBRE_MAX = 120
export const ALTA_RAZON_SOCIAL_MAX = 120
export const ALTA_DIRECCION_MAX = 200
export const ALTA_CONTACTO_MAX = 80

export type ResultadoNormalizacion<T> =
    | { ok: true; valor: T }
    | { ok: false; code: string; mensaje: string }

/** `''`/espacios → null. No-string → undefined (clave ausente). */
function texto(raw: unknown): string | null | undefined {
    if (raw === undefined) return undefined
    if (raw === null) return null
    if (typeof raw !== 'string') return undefined
    const t = raw.trim()
    return t === '' ? null : t
}

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
function fechaValida(s: string): boolean {
    const m = RE_FECHA.exec(s)
    if (!m) return false
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const f = new Date(Date.UTC(y, mo - 1, d))
    return f.getUTCFullYear() === y && f.getUTCMonth() === mo - 1 && f.getUTCDate() === d
}

/**
 * Normaliza los datos del COMERCIO. Con `nombreRequerido` (default true) devuelve el
 * IDetalleAlta completo con las tres claves; con false (edición) devuelve solo las
 * claves que vinieron, para mergear sobre lo guardado.
 */
export function normalizarDetalleAlta(
    body: unknown,
    opts: { nombreRequerido?: boolean } = {},
): ResultadoNormalizacion<IDetalleAlta | Partial<IDetalleAlta>> {
    const nombreRequerido = opts.nombreRequerido ?? true
    if (body === null || typeof body !== 'object') {
        return { ok: false, code: 'ALTA_DETALLE_INVALIDO', mensaje: 'Los datos del cliente nuevo son inválidos.' }
    }
    const b = body as Record<string, unknown>
    const nombre = texto(b.nombre)
    const razonSocial = texto(b.razonSocial)
    const direccion = texto(b.direccion)

    if (nombreRequerido && !nombre) {
        return { ok: false, code: 'ALTA_SIN_NOMBRE', mensaje: 'Poné el nombre del comercio.' }
    }
    if (nombre && nombre.length > ALTA_NOMBRE_MAX) {
        return { ok: false, code: 'ALTA_NOMBRE_MUY_LARGO', mensaje: `El nombre no puede superar los ${ALTA_NOMBRE_MAX} caracteres.` }
    }
    if (razonSocial && razonSocial.length > ALTA_RAZON_SOCIAL_MAX) {
        return { ok: false, code: 'ALTA_RAZON_SOCIAL_MUY_LARGA', mensaje: `La razón social no puede superar los ${ALTA_RAZON_SOCIAL_MAX} caracteres.` }
    }
    if (direccion && direccion.length > ALTA_DIRECCION_MAX) {
        return { ok: false, code: 'ALTA_DIRECCION_MUY_LARGA', mensaje: `La dirección no puede superar los ${ALTA_DIRECCION_MAX} caracteres.` }
    }

    if (nombreRequerido) {
        return { ok: true, valor: { nombre: nombre!, razonSocial: razonSocial ?? null, direccion: direccion ?? null } }
    }
    const parcial: Partial<IDetalleAlta> = {}
    if (nombre !== undefined) {
        if (nombre === null) return { ok: false, code: 'ALTA_SIN_NOMBRE', mensaje: 'Poné el nombre del comercio.' }
        parcial.nombre = nombre
    }
    if (razonSocial !== undefined) parcial.razonSocial = razonSocial
    if (direccion !== undefined) parcial.direccion = direccion
    return { ok: true, valor: parcial }
}

/** Normaliza el contacto de la visita. Ausente o todo vacío → null. */
export function normalizarDetalleContacto(body: unknown): ResultadoNormalizacion<IDetalleContactoAlta | null> {
    if (body === undefined || body === null) return { ok: true, valor: null }
    if (typeof body !== 'object') {
        return { ok: false, code: 'CONTACTO_INVALIDO', mensaje: 'Los datos del contacto son inválidos.' }
    }
    const b = body as Record<string, unknown>
    const contacto = texto(b.contacto) ?? null
    const fechaNacimiento = texto(b.fechaNacimiento) ?? null
    if (contacto && contacto.length > ALTA_CONTACTO_MAX) {
        return { ok: false, code: 'CONTACTO_MUY_LARGO', mensaje: `El nombre del contacto no puede superar los ${ALTA_CONTACTO_MAX} caracteres.` }
    }
    if (fechaNacimiento && !fechaValida(fechaNacimiento)) {
        return { ok: false, code: 'CONTACTO_FECHA_INVALIDA', mensaje: 'La fecha de nacimiento tiene que ser AAAA-MM-DD.' }
    }
    if (!contacto && !fechaNacimiento) return { ok: true, valor: null }
    return { ok: true, valor: { contacto, fechaNacimiento } }
}
```

- [ ] **Step 4: Correr** — `npx jest src/services/planificacion/altaDetalle.spec.ts`. Esperado: PASS.

- [ ] **Step 5: Commit** — `git add src/services/planificacion/altaDetalle.ts src/services/planificacion/altaDetalle.spec.ts && git commit -m "feat(alta): normalización de los datos del comercio y del contacto" + trailer`.

---

### Task 3: `RotacionClienteRepository.crearAlta` y `actualizarDetalleAlta`

**Files:**
- Modify: `$API/src/repositories/RotacionClienteRepository.ts` (debajo de `crearExtra`, ~línea 577)
- Test: `$API/src/repositories/RotacionClienteRepository.spec.ts`

**Interfaces (Produces):**
```ts
static async crearAlta(rotacionId: number, semana: number, dia: number, detalle: IDetalleAlta): Promise<IRotacionCliente>
static async actualizarDetalleAlta(id: number, detalle: IDetalleAlta): Promise<void>
export function codigoAlta(id: number): string  // 'ALTA-000123'
```

- [ ] **Step 1: Tests**

```ts
import { randomUUID } from 'crypto'
jest.mock('crypto', () => ({ ...jest.requireActual('crypto'), randomUUID: jest.fn(() => 'uuid-fijo') }))
const mockedCreate = RotacionCliente.create as jest.MockedFunction<any>

describe('crearAlta', () => {
    it('inserta con código provisorio y lo reemplaza por ALTA-<id> en la misma transacción', async () => {
        const fila = { id: 123, rotacionId: 7, codigoParticularCliente: 'ALTA-uuid-fijo', semana: 2, dia: 3, esExtra: true, tipo: 'alta',
            detalle: { nombre: 'Piche', razonSocial: null, direccion: null }, deletedAt: null, update: jest.fn() }
        mockedCreate.mockResolvedValue(fila)
        const r = await RotacionClienteRepository.crearAlta(7, 2, 3, { nombre: 'Piche', razonSocial: null, direccion: null })
        expect(mockedCreate).toHaveBeenCalledWith(
            expect.objectContaining({ rotacionId: 7, semana: 2, dia: 3, esExtra: true, tipo: 'alta', codigoParticularCliente: 'ALTA-uuid-fijo' }),
            expect.objectContaining({ transaction: expect.anything() }),
        )
        expect(fila.update).toHaveBeenCalledWith({ codigoParticularCliente: 'ALTA-000123' }, expect.objectContaining({ transaction: expect.anything() }))
        expect(r.codigoParticularCliente).toBe('ALTA-000123')
        expect(r.tipo).toBe('alta')
    })
})

describe('actualizarDetalleAlta', () => {
    it('hace UPDATE del detalle por id', async () => {
        mockedUpdate.mockResolvedValue([1])
        await RotacionClienteRepository.actualizarDetalleAlta(9, { nombre: 'Piche', razonSocial: 'Piche SRL', direccion: null })
        expect(mockedUpdate).toHaveBeenCalledWith({ detalle: { nombre: 'Piche', razonSocial: 'Piche SRL', direccion: null } }, { where: { id: 9, tipo: 'alta' } })
    })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npx jest src/repositories/RotacionClienteRepository.spec.ts -t "crearAlta|actualizarDetalleAlta"`.

- [ ] **Step 3: Implementación**

```ts
/** `ALTA-000123`. El prefijo no colisiona con ningún código real (son numéricos), y el
 *  id lo hace único por construcción. */
export function codigoAlta(id: number): string {
    return `ALTA-${String(id).padStart(6, '0')}`
}

    /**
     * Fila de alta ("Cliente nuevo"): tipo='alta', es_extra=1 (está fuera del plan
     * materializado y la cobertura ya filtra es_extra=0), con los datos del comercio en
     * `detalle`. El código forma parte del UNIQUE y no puede ir vacío, pero el definitivo
     * lleva el id AUTO_INCREMENT — de ahí los dos pasos en una transacción: insert con
     * un provisorio único y UPDATE al definitivo.
     */
    static async crearAlta(
        rotacionId: number,
        semana: number,
        dia: number,
        detalle: IDetalleAlta,
    ): Promise<IRotacionCliente> {
        try {
            return await sequelizeWritePlanificacion.transaction(async transaction => {
                const creada = await RotacionCliente.create(
                    {
                        rotacionId,
                        codigoParticularCliente: `ALTA-${randomUUID()}`,
                        semana,
                        dia,
                        esExtra: true,
                        tipo: 'alta',
                        detalle,
                    },
                    { transaction },
                )
                const codigo = codigoAlta(creada.id)
                await creada.update({ codigoParticularCliente: codigo }, { transaction })
                return { ...toIRotacionCliente(creada), codigoParticularCliente: codigo }
            })
        } catch (err) {
            throw new CustomError(500, `Error creando el cliente nuevo: ${err}`)
        }
    }

    /** Solo filas tipo='alta': el WHERE lo garantiza aunque el service ya lo valide. */
    static async actualizarDetalleAlta(id: number, detalle: IDetalleAlta): Promise<void> {
        try {
            await RotacionCliente.update({ detalle }, { where: { id, tipo: 'alta' } })
        } catch (err) {
            throw new CustomError(500, `Error actualizando el cliente nuevo: ${err}`)
        }
    }
```
Importar `import { randomUUID } from 'crypto'`.

- [ ] **Step 4: Correr** — mismo comando. Esperado: PASS.
- [ ] **Step 5: Commit** — `feat(alta): crearAlta y actualizarDetalleAlta en RotacionClienteRepository`.

---

### Task 4: `AltasService`

**Files:**
- Create: `$API/src/services/planificacion/AltasService.ts`
- Modify: `$API/src/types/planificacion.ts` (DTOs)
- Test: `$API/src/services/planificacion/AltasService.spec.ts`

**Interfaces:**
- Consumes: `resolveSellerCode(user)`, `RotacionRepository.findAbiertaByVendedor(vendedor)`, `GerenciaRotacionService.requireRotacionEditableDe(vendedor, rotacionId)`, `RotacionSemanaRepository.semanasDelSet(rotacionId)`, `RotacionClienteRepository.{findById, crearAlta, actualizarDetalleAlta}`, `ResolucionRepository.findByCicloCliente(filaId)`, `AgendaService.enriquecer(filas)` (Task 6 le enseña las altas).
- Produces:
```ts
export interface ICrearAltaDTO { semana: number; dia: number; detalle: IDetalleAlta }
export interface IEditarAltaDTO { detalle: Partial<IDetalleAlta> }
export interface IReintentarAltaDTO { dia: number }
AltasService.crear(user, dto): Promise<IAgendaClient>
AltasService.editar(user, rotacionClienteId, dto): Promise<IAgendaClient>
AltasService.reintentar(user, rotacionClienteId, dto): Promise<IAgendaClient>
```
Códigos: `ROTACION_NO_ENCONTRADA` 404, `SEMANA_FUERA_DEL_SET` 422, `DIA_INVALIDO` 400, `FILA_NOT_FOUND` 404, `FILA_NO_ES_ALTA` 404, `FILA_RESUELTA` 409 (editar sobre resuelta), `ALTA_NO_RESUELTA` 409 (reintentar sobre pendiente/en curso), `ALTA_CONCRETADA` 409 (reintentar sobre visita).

- [ ] **Step 1: Tests** (mismo estilo de mocks que `BuscadorService.spec.ts`)

```ts
import { AltasService } from './AltasService'
import { RotacionRepository } from '../../repositories/RotacionRepository'
import { RotacionClienteRepository } from '../../repositories/RotacionClienteRepository'
import { RotacionSemanaRepository } from '../../repositories/RotacionSemanaRepository'
import { ResolucionRepository } from '../../repositories/ResolucionRepository'
import { GerenciaRotacionService } from './GerenciaRotacionService'
import { AgendaService } from './AgendaService'
import { CustomError } from '../../utils/errors'

jest.mock('../../repositories/RotacionRepository')
jest.mock('../../repositories/RotacionClienteRepository')
jest.mock('../../repositories/RotacionSemanaRepository')
jest.mock('../../repositories/ResolucionRepository')
jest.mock('./GerenciaRotacionService')
jest.mock('./AgendaService')
jest.mock('./sellerIdentity', () => ({ resolveSellerCode: jest.fn(async () => 'V 2') }))

const USER = { id: '5' } as any
const DETALLE = { nombre: 'Piche', razonSocial: null, direccion: null }
const filaAlta = (over: any = {}) => ({
    id: 9, rotacionId: 7, codigoParticularCliente: 'ALTA-000009', semana: 2, dia: 3,
    esExtra: true, eliminado: false, tipo: 'alta', detalle: DETALLE, ...over,
})

beforeEach(() => {
    jest.clearAllMocks()
    ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue({ id: 7 })
    ;(RotacionSemanaRepository.semanasDelSet as jest.Mock).mockResolvedValue([1, 2, 3, 5])
    ;(AgendaService.enriquecer as jest.Mock).mockImplementation(async (filas: any[]) => filas.map(f => ({ rotacionClienteId: f.id, tipo: f.tipo })))
})

describe('crear', () => {
    it('valida rotación editable, semana en el set y día, y crea la fila', async () => {
        ;(RotacionClienteRepository.crearAlta as jest.Mock).mockResolvedValue(filaAlta())
        const r = await AltasService.crear(USER, { semana: 2, dia: 3, detalle: DETALLE })
        expect(GerenciaRotacionService.requireRotacionEditableDe).toHaveBeenCalledWith('V 2', 7)
        expect(RotacionClienteRepository.crearAlta).toHaveBeenCalledWith(7, 2, 3, DETALLE)
        expect(r).toEqual({ rotacionClienteId: 9, tipo: 'alta' })
    })
    it('semana fuera del set → 422 SEMANA_FUERA_DEL_SET', async () => {
        await expect(AltasService.crear(USER, { semana: 4, dia: 3, detalle: DETALLE }))
            .rejects.toMatchObject({ statusCode: 422, code: 'SEMANA_FUERA_DEL_SET' })
    })
    it('día fuera de 1..5 → 400 DIA_INVALIDO', async () => {
        await expect(AltasService.crear(USER, { semana: 2, dia: 6, detalle: DETALLE }))
            .rejects.toMatchObject({ statusCode: 400, code: 'DIA_INVALIDO' })
    })
    it('sin rotación abierta → 404 ROTACION_NO_ENCONTRADA', async () => {
        ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue(null)
        await expect(AltasService.crear(USER, { semana: 2, dia: 3, detalle: DETALLE }))
            .rejects.toMatchObject({ statusCode: 404, code: 'ROTACION_NO_ENCONTRADA' })
    })
})

describe('editar', () => {
    it('mergea el detalle parcial sobre el guardado y devuelve la card', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock)
            .mockResolvedValueOnce(filaAlta())
            .mockResolvedValueOnce(filaAlta({ detalle: { ...DETALLE, direccion: 'Ruta 5' } }))
        ;(ResolucionRepository.findByCicloCliente as jest.Mock).mockResolvedValue(null)
        await AltasService.editar(USER, 9, { detalle: { direccion: 'Ruta 5' } })
        expect(RotacionClienteRepository.actualizarDetalleAlta).toHaveBeenCalledWith(9, { ...DETALLE, direccion: 'Ruta 5' })
    })
    it('con visita abierta también se puede editar', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(filaAlta())
        ;(ResolucionRepository.findByCicloCliente as jest.Mock).mockResolvedValue({ tipo: 'visita', fechaFin: null })
        await expect(AltasService.editar(USER, 9, { detalle: { direccion: 'x' } })).resolves.toBeDefined()
    })
    it('resuelta → 409 FILA_RESUELTA', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(filaAlta())
        ;(ResolucionRepository.findByCicloCliente as jest.Mock).mockResolvedValue({ tipo: 'visita', fechaFin: '2026-09-17T15:00:00Z' })
        await expect(AltasService.editar(USER, 9, { detalle: { direccion: 'x' } }))
            .rejects.toMatchObject({ statusCode: 409, code: 'FILA_RESUELTA' })
    })
    it('fila que no es alta → 404 FILA_NO_ES_ALTA', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(filaAlta({ tipo: 'cliente', detalle: null }))
        await expect(AltasService.editar(USER, 9, { detalle: {} })).rejects.toMatchObject({ statusCode: 404, code: 'FILA_NO_ES_ALTA' })
    })
    it('fila de otra rotación → 404 FILA_NOT_FOUND', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(filaAlta({ rotacionId: 99 }))
        await expect(AltasService.editar(USER, 9, { detalle: {} })).rejects.toMatchObject({ statusCode: 404, code: 'FILA_NOT_FOUND' })
    })
})

describe('reintentar', () => {
    it('sobre un no_visita crea otra fila de alta con el detalle copiado, en el día pedido', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(filaAlta())
        ;(ResolucionRepository.findByCicloCliente as jest.Mock).mockResolvedValue({ tipo: 'no_visita', fechaFin: 'x' })
        ;(RotacionClienteRepository.crearAlta as jest.Mock).mockResolvedValue(filaAlta({ id: 10, dia: 5, codigoParticularCliente: 'ALTA-000010' }))
        const r = await AltasService.reintentar(USER, 9, { dia: 5 })
        expect(RotacionClienteRepository.crearAlta).toHaveBeenCalledWith(7, 2, 5, DETALLE)
        expect(r).toEqual({ rotacionClienteId: 10, tipo: 'alta' })
    })
    it('sobre una visita → 409 ALTA_CONCRETADA', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(filaAlta())
        ;(ResolucionRepository.findByCicloCliente as jest.Mock).mockResolvedValue({ tipo: 'visita', fechaFin: 'x' })
        await expect(AltasService.reintentar(USER, 9, { dia: 5 })).rejects.toMatchObject({ statusCode: 409, code: 'ALTA_CONCRETADA' })
    })
    it('sobre una pendiente → 409 ALTA_NO_RESUELTA (para eso está Reagendar)', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(filaAlta())
        ;(ResolucionRepository.findByCicloCliente as jest.Mock).mockResolvedValue(null)
        await expect(AltasService.reintentar(USER, 9, { dia: 5 })).rejects.toMatchObject({ statusCode: 409, code: 'ALTA_NO_RESUELTA' })
    })
})
```

- [ ] **Step 2: Correr y ver fallar.**

- [ ] **Step 3: DTOs** en `types/planificacion.ts`:

```ts
/** POST /planificacion/altas. `semana` es la zona que el vendedor está MIRANDO (igual
 *  que confirmarExtra), validada contra el set de la rotación abierta. */
export interface ICrearAltaDTO { semana: number; dia: number; detalle: IDetalleAlta }
/** PUT /planificacion/altas/:id. Solo las claves presentes se pisan. */
export interface IEditarAltaDTO { detalle: Partial<IDetalleAlta> }
/** POST /planificacion/altas/:id/reintentar: nueva fila en (misma semana, dia). */
export interface IReintentarAltaDTO { dia: number }
```

- [ ] **Step 4: Service**

```ts
import { IUser } from '../../types/user'
import { CustomError } from '../../utils/errors'
import { resolveSellerCode } from './sellerIdentity'
import { RotacionRepository } from '../../repositories/RotacionRepository'
import { RotacionSemanaRepository } from '../../repositories/RotacionSemanaRepository'
import { RotacionClienteRepository } from '../../repositories/RotacionClienteRepository'
import { ResolucionRepository } from '../../repositories/ResolucionRepository'
import { GerenciaRotacionService } from './GerenciaRotacionService'
import { AgendaService } from './AgendaService'
import {
    IAgendaClient, ICrearAltaDTO, IEditarAltaDTO, IReintentarAltaDTO, IRotacionCliente,
} from '../../types/planificacion'

/**
 * "Cliente nuevo": la visita de alta a un comercio que todavía no es cliente
 * (spec 2026-09-17). La fila del plan es la CITA (aparece en la agenda de un día, se
 * pospone con `reacomodar`, se resuelve una vez); acá viven solo las tres operaciones
 * que no existen para un cliente real: crearla, editar los datos del comercio, y volver
 * a agendar después de un "No visité" (una fila resuelta no se mueve — FILA_RESUELTA —,
 * así que el segundo intento es una fila nueva con el detalle copiado).
 */
export class AltasService {
    static async crear(user: IUser, dto: ICrearAltaDTO): Promise<IAgendaClient> {
        const { vendedor, rotacionId } = await AltasService.rotacionAbierta(user)
        await GerenciaRotacionService.requireRotacionEditableDe(vendedor, rotacionId)
        AltasService.validarDia(dto.dia)
        await AltasService.validarSemana(rotacionId, dto.semana)

        const fila = await RotacionClienteRepository.crearAlta(rotacionId, dto.semana, dto.dia, dto.detalle)
        return AltasService.card(fila)
    }

    static async editar(user: IUser, rotacionClienteId: number, dto: IEditarAltaDTO): Promise<IAgendaClient> {
        const { fila } = await AltasService.filaAltaPropia(user, rotacionClienteId)
        const resolucion = await ResolucionRepository.findByCicloCliente(fila.id)
        // Abierta (fecha_fin null) todavía se edita: el vendedor está adentro completando
        // la razón social. Cerrada, sea visita o no_visita, ya es historia.
        if (resolucion && resolucion.fechaFin) {
            throw new CustomError(409, 'Esta visita ya está cerrada, no se pueden editar sus datos.', {
                code: 'FILA_RESUELTA',
            })
        }
        const detalle = { ...(fila.detalle ?? { nombre: '', razonSocial: null, direccion: null }), ...dto.detalle }
        await RotacionClienteRepository.actualizarDetalleAlta(fila.id, detalle)
        const actualizada = (await RotacionClienteRepository.findById(fila.id)) ?? { ...fila, detalle }
        return AltasService.card(actualizada)
    }

    static async reintentar(user: IUser, rotacionClienteId: number, dto: IReintentarAltaDTO): Promise<IAgendaClient> {
        const { vendedor, fila } = await AltasService.filaAltaPropia(user, rotacionClienteId)
        await GerenciaRotacionService.requireRotacionEditableDe(vendedor, fila.rotacionId)
        AltasService.validarDia(dto.dia)

        const resolucion = await ResolucionRepository.findByCicloCliente(fila.id)
        if (!resolucion || (resolucion.tipo === 'visita' && !resolucion.fechaFin)) {
            throw new CustomError(409, 'Esta visita todavía está pendiente: para cambiarla de día usá Reagendar.', {
                code: 'ALTA_NO_RESUELTA',
            })
        }
        if (resolucion.tipo === 'visita') {
            throw new CustomError(409, 'Este cliente nuevo ya fue visitado.', { code: 'ALTA_CONCRETADA' })
        }

        const nueva = await RotacionClienteRepository.crearAlta(
            fila.rotacionId, fila.semana, dto.dia, fila.detalle!,
        )
        return AltasService.card(nueva)
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static async rotacionAbierta(user: IUser): Promise<{ vendedor: string; rotacionId: number }> {
        const vendedor = await resolveSellerCode(user)
        const rotacion = await RotacionRepository.findAbiertaByVendedor(vendedor)
        if (!rotacion) {
            throw new CustomError(404, 'No hay una rotación abierta para este vendedor.', {
                code: 'ROTACION_NO_ENCONTRADA',
            })
        }
        return { vendedor, rotacionId: rotacion.id }
    }

    private static async filaAltaPropia(
        user: IUser,
        rotacionClienteId: number,
    ): Promise<{ vendedor: string; fila: IRotacionCliente }> {
        const { vendedor, rotacionId } = await AltasService.rotacionAbierta(user)
        const fila = await RotacionClienteRepository.findById(rotacionClienteId)
        if (!fila || fila.rotacionId !== rotacionId) {
            throw new CustomError(404, 'Cliente no encontrado en el plan.', { code: 'FILA_NOT_FOUND' })
        }
        if (fila.tipo !== 'alta') {
            throw new CustomError(404, 'Esta fila no es un cliente nuevo.', { code: 'FILA_NO_ES_ALTA' })
        }
        return { vendedor, fila }
    }

    private static validarDia(dia: number): void {
        if (!Number.isInteger(dia) || dia < 1 || dia > 5) {
            throw new CustomError(400, 'El día tiene que estar entre 1 y 5.', { code: 'DIA_INVALIDO' })
        }
    }

    private static async validarSemana(rotacionId: number, semana: number): Promise<void> {
        const set = await RotacionSemanaRepository.semanasDelSet(rotacionId)
        if (!set.includes(semana)) {
            throw new CustomError(422, `La semana ${semana} no existe en esta rotación.`, {
                code: 'SEMANA_FUERA_DEL_SET',
                semanas: set,
            })
        }
    }

    private static async card(fila: IRotacionCliente): Promise<IAgendaClient> {
        const [card] = await AgendaService.enriquecer([fila])
        if (!card) {
            throw new CustomError(500, 'No se pudo armar la card del cliente nuevo.', { code: 'ALTA_SIN_CARD' })
        }
        return card
    }
}
```

- [ ] **Step 5: Correr** — `npx jest src/services/planificacion/AltasService.spec.ts`. PASS.
- [ ] **Step 6: Commit** — `feat(alta): AltasService (crear, editar, reintentar)`.

---

### Task 5: Controller y rutas de altas

**Files:**
- Modify: `$API/src/controllers/planificacionController.ts` (agregar tres handlers antes de `responderError`)
- Modify: `$API/src/routes/planificacion.ts` (después del bloque `/buscador/rotacion`, ~línea 70)

**Interfaces (Produces):**
```
POST /planificacion/altas                    body { semana, dia, nombre, razonSocial?, direccion? } → IAgendaClient
PUT  /planificacion/altas/:id                body { nombre?, razonSocial?, direccion? }             → IAgendaClient
POST /planificacion/altas/:id/reintentar     body { dia }                                            → IAgendaClient
```

- [ ] **Step 1: Handlers**

```ts
    /** POST /altas — crea la fila de alta ("Cliente nuevo") en (semana vista, dia). */
    static async crearAlta(req: Request, res: Response): Promise<void> {
        try {
            const semana = parseSemana(req.body?.semana)
            if (semana === null) {
                res.status(400).json({ ok: 0, error: 'semana debe ser un entero positivo' })
                return
            }
            const dia = parseDiaLaboral(req.body?.dia)
            if (dia === undefined || dia === null) {
                res.status(400).json({ ok: 0, error: 'dia debe ser un entero entre 1 y 5', code: 'DIA_INVALIDO' })
                return
            }
            const detalle = normalizarDetalleAlta(req.body)
            if (!detalle.ok) {
                res.status(400).json({ ok: 0, error: detalle.mensaje, code: detalle.code })
                return
            }
            const result = await AltasService.crear(req.user!, { semana, dia, detalle: detalle.valor as IDetalleAlta })
            res.status(201).json({ ok: 1, data: result })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }

    /** PUT /altas/:id — edita los datos del comercio. Solo pisa las claves que vienen. */
    static async editarAlta(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id, 10)
            if (isNaN(id)) {
                res.status(400).json({ ok: 0, error: 'id inválido' })
                return
            }
            const detalle = normalizarDetalleAlta(req.body, { nombreRequerido: false })
            if (!detalle.ok) {
                res.status(400).json({ ok: 0, error: detalle.mensaje, code: detalle.code })
                return
            }
            const result = await AltasService.editar(req.user!, id, { detalle: detalle.valor })
            res.status(200).json({ ok: 1, data: result })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }

    /** POST /altas/:id/reintentar — otra fila de alta, mismo comercio, en `dia`. */
    static async reintentarAlta(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id, 10)
            if (isNaN(id)) {
                res.status(400).json({ ok: 0, error: 'id inválido' })
                return
            }
            const dia = parseDiaLaboral(req.body?.dia)
            if (dia === undefined || dia === null) {
                res.status(400).json({ ok: 0, error: 'dia debe ser un entero entre 1 y 5', code: 'DIA_INVALIDO' })
                return
            }
            const result = await AltasService.reintentar(req.user!, id, { dia })
            res.status(201).json({ ok: 1, data: result })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }
```
Imports: `AltasService`, `normalizarDetalleAlta`, `IDetalleAlta`.

- [ ] **Step 2: Rutas**

```ts
/**
 * @openapi
 * /planificacion/altas:
 *   post:
 *     summary: Agendar un "Cliente nuevo" (visita de alta)
 *     description: >
 *       Crea una fila del plan tipo='alta' (es_extra=1, código sintético ALTA-<id>) en la
 *       celda (semana, dia) con los datos del comercio en `detalle`. El comercio todavía no
 *       es cliente: no hay ficha en el warehouse, no hay propuesta ni gate de distancia.
 *       Spec: app-planificacion docs/superpowers/specs/2026-09-17-visita-de-alta-cliente-nuevo-design.md
 *     responses:
 *       201: { description: La fila creada, ya enriquecida como card de agenda }
 *       400: { description: ALTA_SIN_NOMBRE, DIA_INVALIDO, o textos demasiado largos }
 *       422: { description: SEMANA_FUERA_DEL_SET }
 */
router.post('/altas', authMiddleware, authorize('vendedor'), async (req: Request, res: Response) => {
    PlanificacionController.crearAlta(req, res)
})

// Edita los datos del comercio de una fila de alta pendiente o con visita abierta.
router.put('/altas/:id', authMiddleware, authorize('vendedor'), async (req: Request, res: Response) => {
    PlanificacionController.editarAlta(req, res)
})

// Después de un "No visité": otra fila de alta para el mismo comercio, en `dia`.
router.post('/altas/:id/reintentar', authMiddleware, authorize('vendedor'), async (req: Request, res: Response) => {
    PlanificacionController.reintentarAlta(req, res)
})
```

- [ ] **Step 3: Compilar** — `npx tsc --noEmit`. Sin errores.
- [ ] **Step 4: Commit** — `feat(alta): endpoints POST/PUT /altas y /altas/:id/reintentar`.

---

### Task 6: La agenda arma la card de una alta desde `detalle`

**Files:**
- Modify: `$API/src/services/planificacion/AgendaService.ts` (`enriquecer`, ~152-200)
- Modify: `$API/src/types/planificacion.ts` (`IAgendaClient`)
- Test: `$API/src/services/planificacion/AgendaService.spec.ts`

**Interfaces (Produces):** `IAgendaClient += tipo: TipoFilaPlan; detalleAlta: IDetalleAlta | null`. `export function cardDeAlta(fila: IRotacionCliente): IVisitClientCard`.

- [ ] **Step 1: Test**

```ts
describe('enriquecer — filas de alta', () => {
    it('arma la card desde detalle en vez de omitir la fila, y no consulta el warehouse por su código', async () => {
        mockedGetCards.mockResolvedValue(new Map())
        mockedResolucionesPorFila.mockResolvedValue(new Map())
        mockedOfrecimientosPendientesPorVisita.mockResolvedValue(new Map())
        const fila: IRotacionCliente = {
            id: 9, rotacionId: 7, codigoParticularCliente: 'ALTA-000009', semana: 2, dia: 3, esExtra: true, eliminado: false,
            tipo: 'alta', detalle: { nombre: 'Autopartes Piche', razonSocial: 'Piche SRL', direccion: 'San Martín 811' },
        }
        const [card] = await AgendaService.enriquecer([fila])
        expect(mockedGetCards).toHaveBeenCalledWith([])
        expect(card).toMatchObject({
            codigoParticularCliente: 'ALTA-000009',
            nombreCliente: 'Autopartes Piche',
            direccion: 'San Martín 811',
            latitud: null, longitud: null,
            brandDiscounts: [],
            estado: 'pendiente',
            esExtra: true,
            tipo: 'alta',
            detalleAlta: { nombre: 'Autopartes Piche', razonSocial: 'Piche SRL', direccion: 'San Martín 811' },
        })
    })
    it('una fila común sigue saliendo tipo cliente con detalleAlta null', async () => {
        mockedGetCards.mockResolvedValue(new Map([['6836', card('6836')]]))
        mockedResolucionesPorFila.mockResolvedValue(new Map())
        mockedOfrecimientosPendientesPorVisita.mockResolvedValue(new Map())
        const [c] = await AgendaService.enriquecer([{ id: 1, rotacionId: 7, codigoParticularCliente: '6836', semana: 2, dia: 1, esExtra: false, eliminado: false, tipo: 'cliente', detalle: null }])
        expect(c).toMatchObject({ tipo: 'cliente', detalleAlta: null })
    })
})
```

- [ ] **Step 2: Ver fallar.**

- [ ] **Step 3: Tipo** — en `IAgendaClient` (backend):

```ts
    /** 'alta' = "Cliente nuevo": la card se armó desde `detalleAlta`, no desde el
     *  warehouse. Sin coordenadas, sin descuentos, sin propuesta. */
    tipo: TipoFilaPlan
    detalleAlta: IDetalleAlta | null
```

- [ ] **Step 4: `enriquecer`**

```ts
/** La card de un "Cliente nuevo": lo que se sabe del comercio, y nulls honestos en todo
 *  lo que sale del warehouse. `latitud/longitud` null es lo que hace que el front no
 *  muestre mapa ni aplique el gate de distancia. */
export function cardDeAlta(fila: IRotacionCliente): IVisitClientCard {
    const d = fila.detalle
    return {
        codigoCliente: fila.codigoParticularCliente,
        codigoParticularCliente: fila.codigoParticularCliente,
        nombreCliente: d?.nombre ?? 'Cliente nuevo',
        nombreFantasia: '',
        barrio: '',
        localidad: '',
        direccion: d?.direccion ?? '',
        telefono: '',
        latitud: null,
        longitud: null,
        codigoZona: '',
        comentario: '',
        isActive: true,
        bonusDiscount: null,
        generalDiscount: null,
        gmDiscount: null,
        brandDiscounts: [],
        paymentCondition: null,
        paymentTermDays: null,
        paymentCreditLimit: null,
        paymentAmount: null,
        paymentPlan: null,
    }
}
```
Dentro de `enriquecer`: pedir al warehouse solo `filas.filter(f => f.tipo !== 'alta').map(f => f.codigoParticularCliente)`; en el loop reemplazar `const card = cards.get(...)` por:
```ts
            const card = fila.tipo === 'alta' ? cardDeAlta(fila) : cards.get(fila.codigoParticularCliente)
```
y en el `result.push` agregar `tipo: fila.tipo, detalleAlta: fila.tipo === 'alta' ? fila.detalle : null`.

- [ ] **Step 5: Correr** `npx jest src/services/planificacion/AgendaService.spec.ts` y `npx tsc --noEmit` (los fixtures de `IAgendaClient` en otros specs necesitan `tipo: 'cliente', detalleAlta: null`). PASS.
- [ ] **Step 6: Commit** — `feat(alta): la agenda arma la card del cliente nuevo desde detalle`.

---

### Task 7: `VisitasService`: iniciar sin warehouse ni propuesta, cerrar con contacto

**Files:**
- Modify: `$API/src/services/planificacion/VisitasService.ts` (`iniciar` ~59, `cerrar` ~143)
- Modify: `$API/src/types/planificacion.ts` (`ICerrarVisitaDTO.detalle?: IDetalleContactoAlta | null`)
- Modify: `$API/src/controllers/planificacionController.ts` (`cerrarVisita`)
- Test: `$API/src/services/planificacion/VisitasService.spec.ts`

- [ ] **Step 1: Tests** (usar las factories/mocks ya declarados en el spec; la fila de alta con `tipo: 'alta'`)

```ts
describe('iniciar — fila de alta', () => {
    it('no consulta coordenadas del warehouse ni calcula propuesta: arranca con cero ofrecimientos', async () => {
        mockedFilaById.mockResolvedValue({ id: 9, rotacionId: 7, codigoParticularCliente: 'ALTA-000009', semana: 2, dia: 3, esExtra: true, eliminado: false, tipo: 'alta', detalle: { nombre: 'Piche', razonSocial: null, direccion: null } })
        mockedResolucionPorFila.mockResolvedValue(null)
        mockedCrearResolucion.mockResolvedValue(77)
        const r = await VisitasService.iniciar(user, { rotacionClienteId: 9, coordInicio: '-34.6,-58.4' })
        expect(getCoordCliente).not.toHaveBeenCalled()
        expect(RubroDropsService.query).not.toHaveBeenCalled()
        expect(mockedCrearResolucion).toHaveBeenCalledWith(expect.objectContaining({ rotacionClienteId: 9, tipo: 'visita', coordCliente: null }), expect.anything())
        expect(OfrecimientoRepository.crearMuchos).not.toHaveBeenCalled()
        expect(r).toEqual({ visitaId: 77, ofrecimientos: 0, correccionPermanenteAplicada: undefined })
    })
})

describe('cerrar — detalle del contacto', () => {
    it('persiste el contacto cuando la fila es de alta', async () => {
        // resolución abierta + fila alta (mockear resolveVisitaPropia vía sus repos como en los tests de cerrar existentes)
        await VisitasService.cerrar(user, { visitaId: 77, coordFinal: '-34.6,-58.4', observaciones: null, detalle: { contacto: 'Gustavo', fechaNacimiento: null } })
        expect(mockedCerrarVisita).toHaveBeenCalledWith(77, '-34.6,-58.4', null, { contacto: 'Gustavo', fechaNacimiento: null })
    })
    it('ignora el detalle si la fila es de un cliente real', async () => {
        await VisitasService.cerrar(user, { visitaId: 78, coordFinal: '-34.6,-58.4', observaciones: null, detalle: { contacto: 'Gustavo', fechaNacimiento: null } })
        expect(mockedCerrarVisita).toHaveBeenCalledWith(78, '-34.6,-58.4', null, null)
    })
})
```

- [ ] **Step 2: Ver fallar.**

- [ ] **Step 3: `iniciar`** — reemplazar las dos lecturas externas:

```ts
        // Un "Cliente nuevo" no está en el warehouse: no hay coordenada que traer ni
        // historial sobre el que calcular una propuesta. Se arranca con cero ofrecimientos
        // y el vendedor carga lo que ofreció desde el catálogo (spec 2026-09-17).
        const esAlta = fila.tipo === 'alta'
        const coordClienteWarehouse = esAlta ? null : await getCoordCliente(fila.codigoParticularCliente)
        const coordClienteAjustada = !esAlta && dto.coordCliente != null
        const coordCliente = esAlta ? null : (dto.coordCliente ?? coordClienteWarehouse)
        const propuesta = esAlta
            ? []
            : await VisitasService.resolverPropuesta(fila.codigoParticularCliente, dto.propuesta)
```

- [ ] **Step 4: `cerrar`** — `ICerrarVisitaDTO` suma `detalle?: IDetalleContactoAlta | null` y la llamada pasa a:

```ts
        await ResolucionRepository.cerrarVisita(
            dto.visitaId,
            dto.coordFinal,
            dto.observaciones ?? null,
            fila.tipo === 'alta' ? (dto.detalle ?? null) : null,
        )
```

- [ ] **Step 5: Controller `cerrarVisita`** — después de normalizar `observaciones`:

```ts
            const detalle = normalizarDetalleContacto((req.body as { detalle?: unknown })?.detalle)
            if (!detalle.ok) {
                res.status(400).json({ ok: 0, error: detalle.mensaje, code: detalle.code })
                return
            }
```
y pasar `detalle: detalle.valor` a `VisitasService.cerrar`.

- [ ] **Step 6: Correr** `npx jest src/services/planificacion/VisitasService.spec.ts`. PASS. `npx tsc --noEmit`.
- [ ] **Step 7: Commit** — `feat(alta): iniciar sin warehouse ni propuesta y cerrar con contacto`.

---

### Task 8: Cromo: al genérico 09895 con etiqueta ALTA

**Files:**
- Modify: `$API/src/config/cromoTags.ts`
- Modify: `$API/src/services/crm/seguimientoTexto.ts`
- Modify: `$API/src/services/crm/CrmEventoVisitaService.ts`
- Test: `$API/src/services/crm/seguimientoTexto.spec.ts`, `$API/src/services/crm/CrmEventoVisitaService.spec.ts`

**Interfaces (Produces):**
```ts
export const CLIENTE_GENERICO_ALTA = '09895'
export const TAG_ALTA = 'ALTA'
export function prefijoAlta(detalle: IDetalleAlta | null): string      // "Nueva alta AUTOPARTES PICHE (Piche SRL, San Martín 811)."
export function conContacto(narrativa: string, detalle: IDetalleContactoAlta | null): string
```

- [ ] **Step 1: Tests de texto**

```ts
describe('prefijoAlta', () => {
    it('nombre solo', () => expect(prefijoAlta({ nombre: 'Autopartes Piche', razonSocial: null, direccion: null })).toBe('Nueva alta Autopartes Piche.'))
    it('con razón social y dirección', () => expect(prefijoAlta({ nombre: 'Autopartes Piche', razonSocial: 'Piche SRL', direccion: 'San Martín 811' })).toBe('Nueva alta Autopartes Piche (Piche SRL, San Martín 811).'))
    it('sin detalle', () => expect(prefijoAlta(null)).toBe('Nueva alta.'))
})
describe('conContacto', () => {
    it('sin contacto devuelve la narrativa tal cual', () => expect(conContacto('x', null)).toBe('x'))
    it('agrega párrafo con nombre y cumpleaños', () =>
        expect(conContacto('x', { contacto: 'Gustavo', fechaNacimiento: '1978-03-14' })).toBe('x\n\nAtendió: Gustavo (nac. 14/03/1978)'))
    it('solo nombre', () => expect(conContacto('', { contacto: 'Gustavo', fechaNacimiento: null })).toBe('Atendió: Gustavo'))
})
```

- [ ] **Step 2: Test del servicio** (en `CrmEventoVisitaService.spec.ts`, con las factories del archivo):

```ts
describe('fila de alta', () => {
    it('manda al genérico 09895 con etiqueta ALTA, sin ir al warehouse, con el comercio adelante', async () => {
        mockedYaEnviado.mockResolvedValue(false)
        mockedMapById.mockResolvedValue(catalogo)
        mockedOfrecimientos.mockResolvedValue([{ id: 1, resolucionId: 5, tipo: 'rubro', codigo: 'R1', descripcion: 'Amortiguadores', esPropuesto: false, origen: 'manual', alcance: [], detalle: null, motivos: [{ motivoId: 10, valores: {} }] } as any])
        mockedMapeo.mockResolvedValue({ cromoUserId: 3, cromoUserName: 'Lucas' } as any)
        mockedHttp.requestAsService.mockResolvedValue({} as any)

        const r = await CrmEventoVisitaService.notificar({
            vendedorCode: 'V 2',
            resolucion: resolucionVisita({ observaciones: 'quiere comprar bujería', detalle: { contacto: 'Gustavo', fechaNacimiento: null } }),
            fila: { id: 11, rotacionId: 7, codigoParticularCliente: 'ALTA-000011', semana: 2, dia: 3, esExtra: true, eliminado: false, tipo: 'alta', detalle: { nombre: 'Autopartes Piche', razonSocial: null, direccion: 'Salliqueló' } },
        })

        expect(r).toEqual({ enviado: true })
        expect(mockedCards).not.toHaveBeenCalled()
        const data = mockedHttp.requestAsService.mock.calls[0][0].data as any
        expect(data.codigo_cliente).toBe('09895')
        expect(data.client_name).toBe('Autopartes Piche')
        expect(data.tags).toEqual(expect.arrayContaining(['ALTA', 'CIERRE VTA VENDEDOR']))
        expect(data.descripcion).toBe('Nueva alta Autopartes Piche (Salliqueló). Amortiguadores: Saqué pedido\n\nAtendió: Gustavo\n\nObservación del vendedor: quiere comprar bujería')
    })
    it('una alta sin rubros resueltos pero con observación SÍ se manda (el prefijo nunca está vacío)', async () => {
        // mismo setup, ofrecimientos [] y observaciones 'lo piensa' → enviado: true, descripcion 'Nueva alta Autopartes Piche (Salliqueló).\n\nObservación del vendedor: lo piensa'
    })
})
```

- [ ] **Step 3: Ver fallar.**

- [ ] **Step 4: Config**

```ts
/** El cliente genérico de Cromo sobre el que los vendedores escribían a mano los CRM de
 *  altas ("NUEVA ALTA CRM"). La visita de alta se manda ahí, automatizada, con la misma
 *  etiqueta que ya usaban. Fijo en código por el mismo criterio que TAG_POR_TIPO. */
export const CLIENTE_GENERICO_ALTA = '09895'
export const TAG_ALTA = 'ALTA'
```

- [ ] **Step 5: Texto**

```ts
export function prefijoAlta(detalle: IDetalleAlta | null): string {
    if (!detalle) return 'Nueva alta.'
    const extras = [detalle.razonSocial, detalle.direccion].filter((s): s is string => Boolean(s))
    return extras.length > 0 ? `Nueva alta ${detalle.nombre} (${extras.join(', ')}).` : `Nueva alta ${detalle.nombre}.`
}

/** Mismo criterio de párrafo propio que `conObservacion`: es lo que dijo el vendedor
 *  sobre la persona, no algo que armó el sistema. La fecha va DD/MM/AAAA, como la leen. */
export function conContacto(narrativa: string, detalle: IDetalleContactoAlta | null): string {
    if (!detalle || (!detalle.contacto && !detalle.fechaNacimiento)) return narrativa
    const partes: string[] = []
    if (detalle.contacto) partes.push(detalle.contacto)
    if (detalle.fechaNacimiento) {
        const [y, m, d] = detalle.fechaNacimiento.split('-')
        partes.push(`(nac. ${d}/${m}/${y})`)
    }
    const linea = `Atendió: ${partes.join(' ')}`
    return narrativa === '' ? linea : `${narrativa}\n\n${linea}`
}
```

- [ ] **Step 6: Servicio** — en `notificar`, después de `tagsDelTipo`:

```ts
            const esAlta = fila.tipo === 'alta'
            if (esAlta) tagsDelTipo.push(TAG_ALTA)
```
En la rama `visita`, después de `narrativa = buildSeguimientoDesdeRubros(...)` y ANTES del guard `SIN_CONTENIDO`:
```ts
                if (esAlta) {
                    // El comercio va adelante: el genérico 09895 no tiene nombre propio, así que
                    // la descripción es lo único que dice de quién se trata. Como el prefijo
                    // nunca está vacío, una alta nunca cae en SIN_CONTENIDO: el gate de
                    // "algo ofrecido o una observación" vive en el front.
                    const rubros = narrativa
                    narrativa = rubros === '' ? prefijoAlta(fila.detalle) : `${prefijoAlta(fila.detalle)} ${rubros}`
                }
```
Después de `narrativa = conObservacion(...)` — antes, para que la observación quede última:
```ts
                narrativa = conContacto(narrativa, resolucion.detalle)
                narrativa = conObservacion(narrativa, resolucion.observaciones ?? null)
```
(mover la línea de `conObservacion` existente debajo de `conContacto`). En la rama `no_visita`, si `esAlta`: `narrativa = `${prefijoAlta(fila.detalle)} ${narrativa}``.

Reemplazar el bloque de la ficha:
```ts
            let codigoCliente: string
            let telefono: string
            let nombre: string
            if (esAlta) {
                codigoCliente = CLIENTE_GENERICO_ALTA
                telefono = ''
                nombre = fila.detalle?.nombre ?? 'Cliente nuevo'
            } else {
                const cards = await ClientRepository.getVisitCardsByParticularCodes([fila.codigoParticularCliente])
                const card = cards.get(fila.codigoParticularCliente)
                if (!card) { /* bloque CLIENTE_SIN_FICHA existente */ }
                codigoCliente = fila.codigoParticularCliente
                telefono = card.telefono
                nombre = card.nombreCliente
            }
```
y en `data`: `codigo_cliente: codigoCliente, telefono_1: telefono, client_name: nombre`.

- [ ] **Step 7: Correr** `npx jest src/services/crm`. PASS.
- [ ] **Step 8: Commit** — `feat(alta): aviso a Cromo al genérico 09895 con etiqueta ALTA`.

---

### Task 9: Analítica: fuera de plan y nombres

**Files:**
- Modify: `$API/src/repositories/AnaliticaRepository.ts` (`findVisitasFueraDePlan` ~168; `findVisitas` ~282-300)
- Modify: `$API/src/services/planificacion/AnaliticaService.ts` (~305-340, ~375-385)
- Test: `$API/src/repositories/AnaliticaRepository.spec.ts`, `$API/src/services/planificacion/AnaliticaService.spec.ts`

- [ ] **Step 1: Tests**

```ts
// AnaliticaRepository.spec.ts
it('findVisitasFueraDePlan excluye las filas de alta', async () => {
    mockedQuery.mockResolvedValue([])
    await AnaliticaRepository.findVisitasFueraDePlan({ vendedores: null, desde: '2026-09-01', hasta: '2026-09-30' } as any)
    const sql = mockedQuery.mock.calls[0][0] as string
    expect(sql).toMatch(/rc\.es_extra = 1/)
    expect(sql).toMatch(/rc\.tipo = 'cliente'/)
})
it('findVisitas selecciona tipo y detalle de la fila del plan', async () => {
    mockedQuery.mockResolvedValue([])
    await AnaliticaRepository.findVisitas(/* filtro mínimo como en los tests existentes */)
    const sql = mockedQuery.mock.calls.map(c => c[0]).join('\n')
    expect(sql).toMatch(/cc\.tipo\s+AS tipo_fila/)
    expect(sql).toMatch(/cc\.detalle\s+AS detalle_fila/)
})

// AnaliticaService.spec.ts
it('una visita de alta toma el nombre del detalle cuando no hay ficha', async () => {
    // rows con tipo_fila 'alta', detalle_fila { nombre: 'Autopartes Piche' }, codigo 'ALTA-000009'; cards vacío
    const r = await AnaliticaService.getVisitas(/* filtro */)
    expect(r.visitas[0].nombreCliente).toBe('Autopartes Piche')
})
```

- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Repositorio** — en `findVisitasFueraDePlan` agregar `AND rc.tipo = 'cliente'` debajo de `AND rc.es_extra = 1`, con comentario: `-- las altas también son extra, pero son OTRA cosa: se reportan aparte`. En `findVisitas` sumar `cc.tipo AS tipo_fila, cc.detalle AS detalle_fila` al SELECT, y a la interfaz de fila `tipo_fila: string; detalle_fila: unknown`.
- [ ] **Step 4: Servicio** — en el `rows.map` de `getVisitas`:

```ts
                nombreCliente:
                    cardsPorCliente.get(r.codigo_particular_cliente)?.nombreCliente
                    ?? (r.tipo_fila === 'alta' ? parseJson<IDetalleAlta>(r.detalle_fila)?.nombre ?? 'Cliente nuevo' : ''),
```
Y en `getVisitaDetalle`, si la fila (buscar cómo llega el código) es de alta, `nombreCliente = detalle.nombre`, `direccion = detalle.direccion` — leyendo la fila con `RotacionClienteRepository.findById(resolucion.rotacionClienteId)` si el servicio todavía no la tiene a mano. Excluir los códigos `ALTA-` del array que va al warehouse.

- [ ] **Step 5: Correr** los dos specs. PASS.
- [ ] **Step 6: Commit** — `feat(alta): analítica excluye altas de fuera de plan y toma el nombre del detalle`.

---

### Task 10: Grid de gerencia: `tipo` en la card admin

**Files:**
- Modify: `$API/src/types/planificacion.ts` (`IAgendaClientAdmin += tipo: TipoFilaPlan`)
- Modify: `$API/src/services/planificacion/GerenciaRotacionService.ts` (~118)
- Test: `$API/src/services/planificacion/GerenciaRotacionService.spec.ts`

- [ ] **Step 1: Test** — en el test existente de `getRotacion` que verifica la proyección de la card, agregar `tipo: 'cliente'` al `toMatchObject`, y un caso con una fila `tipo: 'alta'` cuya card sale `tipo: 'alta'` y `nombreCliente` del detalle (el mock de `AgendaService.enriquecer` devuelve lo que se le pide; alcanza con que `tipo` se proyecte).
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** — en la proyección explícita: `tipo: cliente.tipo,`.
- [ ] **Step 4: Correr.** PASS. `npx tsc --noEmit`. `npx jest` completo del repo: PASS.
- [ ] **Step 5: Commit** — `feat(alta): tipo de fila en la card del grid de gerencia`.

---

## Front

### Task 11: Tipos, API y hooks

**Files:**
- Modify: `$APP/src/types/planificacion.ts`
- Create: `$APP/src/lib/alta.ts`
- Modify: `$APP/src/api/planificacion.ts`
- Create: `$APP/src/hooks/useAltas.ts`
- Modify: `$APP/src/hooks/useVisitas.ts` (`useCerrarVisita`)
- Test: `$APP/src/lib/alta.test.ts`, `$APP/src/api/planificacion.test.ts`

**Interfaces (Produces):**
```ts
export type TipoFilaPlan = 'cliente' | 'alta'
export interface IDetalleAlta { nombre: string; razonSocial: string | null; direccion: string | null }
export interface IDetalleContactoAlta { contacto: string | null; fechaNacimiento: string | null }
// IAgendaClient += tipo?: TipoFilaPlan; detalleAlta?: IDetalleAlta | null   (opcionales: los fixtures viejos siguen válidos)
// IAgendaClientAdmin += tipo?: TipoFilaPlan
// ICerrarVisitaDTO += detalle?: IDetalleContactoAlta
export interface ICrearAltaDTO { semana: number; dia: number; nombre: string; razonSocial?: string; direccion?: string }
export interface IEditarAltaDTO { nombre?: string; razonSocial?: string | null; direccion?: string | null }
// lib/alta.ts
export function esAlta(c: { tipo?: TipoFilaPlan } | null | undefined): boolean
export function puedeCerrarAlta(completos: number, observaciones: string): boolean
// api
crearAlta(dto): Promise<IAgendaClient>; editarAlta(id, dto): Promise<IAgendaClient>; reintentarAlta(id, dia): Promise<IAgendaClient>
// hooks
useCrearAlta(); useEditarAlta(); useReintentarAlta()   // invalidan agendaKeys.semana, ['ciclo','preview'], cicloKeys.actual
// useCerrarVisita acepta { visitaId, coordFinal, observaciones?, detalle? }
```

- [ ] **Step 1: Tests**

```ts
// src/lib/alta.test.ts
import { esAlta, puedeCerrarAlta } from './alta'
it('esAlta solo con tipo alta', () => {
    expect(esAlta({ tipo: 'alta' })).toBe(true)
    expect(esAlta({ tipo: 'cliente' })).toBe(false)
    expect(esAlta({})).toBe(false)
    expect(esAlta(null)).toBe(false)
})
it('puedeCerrarAlta: un ofrecimiento completo o una observación no vacía', () => {
    expect(puedeCerrarAlta(0, '')).toBe(false)
    expect(puedeCerrarAlta(0, '   ')).toBe(false)
    expect(puedeCerrarAlta(1, '')).toBe(true)
    expect(puedeCerrarAlta(0, 'lo piensa')).toBe(true)
})

// src/api/planificacion.test.ts (seguir el estilo del archivo: apiClient mockeado)
it('crearAlta hace POST /planificacion/altas con el body plano', async () => {
    mockedPost.mockResolvedValue({ data: { data: { rotacionClienteId: 9 } } })
    await crearAlta({ semana: 2, dia: 3, nombre: 'Piche' })
    expect(mockedPost).toHaveBeenCalledWith('/planificacion/altas', { semana: 2, dia: 3, nombre: 'Piche' })
})
it('editarAlta hace PUT /planificacion/altas/:id', async () => { /* … */ })
it('reintentarAlta hace POST /planificacion/altas/:id/reintentar con { dia }', async () => { /* … */ })
it('cerrarVisita manda detalle solo cuando viene', async () => {
    await cerrarVisita(7, { coordFinal: 'c', detalle: { contacto: 'G', fechaNacimiento: null } })
    expect(mockedPut).toHaveBeenCalledWith('/planificacion/visitas/7/cerrar', { coordFinal: 'c', detalle: { contacto: 'G', fechaNacimiento: null } })
})
```

- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Tipos** (espejo del backend, con `tipo?`/`detalleAlta?` opcionales en `IAgendaClient` e `IAgendaClientAdmin`; comentar por qué opcionales: ausente = `'cliente'`, y así los ~20 fixtures de tests no cambian).
- [ ] **Step 4: `lib/alta.ts`**

```ts
import type { TipoFilaPlan } from '@/types/planificacion'

/** "Cliente nuevo" (spec 2026-09-17). Ausente = cliente real: los payloads viejos y los
 *  fixtures de test no traen `tipo`. */
export function esAlta(c: { tipo?: TipoFilaPlan } | null | undefined): boolean {
    return c?.tipo === 'alta'
}

/** Gate de cierre de una visita de alta. No hay propuesta congelada, así que el
 *  `min(2, ofrecidos)` de los clientes reales se auto-satisface en 0; acá se pide que
 *  haya quedado ALGO: un ofrecimiento completo o una observación. */
export function puedeCerrarAlta(completos: number, observaciones: string): boolean {
    return completos >= 1 || observaciones.trim() !== ''
}
```
- [ ] **Step 5: API**

```ts
/** "Cliente nuevo": crea la fila de alta en (zona vista, dia). Body plano, como lo normaliza el backend. */
export const crearAlta = async (dto: ICrearAltaDTO): Promise<IAgendaClient> => {
    const res = await apiClient.post('/planificacion/altas', dto)
    return res.data.data
}
export const editarAlta = async (rotacionClienteId: number, dto: IEditarAltaDTO): Promise<IAgendaClient> => {
    const res = await apiClient.put(`/planificacion/altas/${rotacionClienteId}`, dto)
    return res.data.data
}
/** Después de un "No visité": otra fila para el mismo comercio, en `dia`. */
export const reintentarAlta = async (rotacionClienteId: number, dia: number): Promise<IAgendaClient> => {
    const res = await apiClient.post(`/planificacion/altas/${rotacionClienteId}/reintentar`, { dia })
    return res.data.data
}
```
- [ ] **Step 6: Hooks** — `useAltas.ts` con las tres mutaciones y el mismo `onSuccess` que `useConfirmarExtra`. En `useCerrarVisita` agregar `...(args.detalle ? { detalle: args.detalle } : {})`.
- [ ] **Step 7: Correr** `npx vitest run src/lib/alta.test.ts src/api/planificacion.test.ts` y `npx tsc --noEmit`. PASS.
- [ ] **Step 8: Commit** — `feat(alta): tipos, API y hooks del cliente nuevo`.

---

### Task 12: `ClienteNuevoSheet` (crear / editar / volver a agendar)

**Files:**
- Create: `$APP/src/components/ClienteNuevoSheet.tsx`
- Test: `$APP/src/components/ClienteNuevoSheet.test.tsx`

**Interfaces (Produces):**
```ts
export type ModoClienteNuevo =
    | { modo: 'crear'; semana: number; dia: number }
    | { modo: 'editar'; cliente: IAgendaClient }
    | { modo: 'reintentar'; cliente: IAgendaClient; diaSugerido: number }
interface Props { open: boolean; contexto: ModoClienteNuevo | null; onClose: () => void; onListo: (cliente: IAgendaClient, contexto: ModoClienteNuevo) => void; onAviso: (tipo: NotificacionTipo, mensaje: string) => void }
```

- [ ] **Step 1: Tests**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import ClienteNuevoSheet from './ClienteNuevoSheet'
import * as api from '@/api/planificacion'
vi.mock('@/api/planificacion')

const qc = new QueryClient()
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
const creado = { rotacionClienteId: 9, tipo: 'alta', nombreCliente: 'Piche' } as any

it('crear: el nombre es obligatorio y el resto opcional', async () => {
    const onListo = vi.fn()
    vi.mocked(api.crearAlta).mockResolvedValue(creado)
    wrap(<ClienteNuevoSheet open contexto={{ modo: 'crear', semana: 2, dia: 3 }} onClose={() => {}} onListo={onListo} onAviso={() => {}} />)
    const boton = screen.getByRole('button', { name: /agregar al miércoles/i })
    expect(boton).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/nombre del comercio/i), { target: { value: '  Autopartes Piche ' } })
    fireEvent.click(boton)
    await waitFor(() => expect(api.crearAlta).toHaveBeenCalledWith({ semana: 2, dia: 3, nombre: 'Autopartes Piche', razonSocial: undefined, direccion: undefined }))
    expect(onListo).toHaveBeenCalledWith(creado, { modo: 'crear', semana: 2, dia: 3 })
})

it('crear: se puede cambiar el día con los chips', async () => {
    vi.mocked(api.crearAlta).mockResolvedValue(creado)
    wrap(<ClienteNuevoSheet open contexto={{ modo: 'crear', semana: 2, dia: 3 }} onClose={() => {}} onListo={() => {}} onAviso={() => {}} />)
    fireEvent.change(screen.getByLabelText(/nombre del comercio/i), { target: { value: 'Piche' } })
    fireEvent.click(screen.getByRole('button', { name: /^viernes$/i }))
    fireEvent.click(screen.getByRole('button', { name: /agregar al viernes/i }))
    await waitFor(() => expect(api.crearAlta).toHaveBeenCalledWith(expect.objectContaining({ dia: 5 })))
})

it('editar: precarga los datos y manda solo lo que cambió', async () => {
    vi.mocked(api.editarAlta).mockResolvedValue(creado)
    const cliente = { ...creado, detalleAlta: { nombre: 'Piche', razonSocial: null, direccion: 'Ruta 5' } }
    wrap(<ClienteNuevoSheet open contexto={{ modo: 'editar', cliente }} onClose={() => {}} onListo={() => {}} onAviso={() => {}} />)
    expect(screen.getByLabelText(/nombre del comercio/i)).toHaveValue('Piche')
    fireEvent.change(screen.getByLabelText(/razón social/i), { target: { value: 'Piche SRL' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(api.editarAlta).toHaveBeenCalledWith(9, { razonSocial: 'Piche SRL' }))
})

it('reintentar: no edita datos, solo elige el día', async () => {
    vi.mocked(api.reintentarAlta).mockResolvedValue(creado)
    wrap(<ClienteNuevoSheet open contexto={{ modo: 'reintentar', cliente: creado, diaSugerido: 4 }} onClose={() => {}} onListo={() => {}} onAviso={() => {}} />)
    expect(screen.queryByLabelText(/nombre del comercio/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /volver a agendar el jueves/i }))
    await waitFor(() => expect(api.reintentarAlta).toHaveBeenCalledWith(9, 4))
})

it('error de red → onAviso error y el sheet sigue abierto', async () => {
    const onAviso = vi.fn(); const onClose = vi.fn()
    vi.mocked(api.crearAlta).mockRejectedValue(new Error('x'))
    wrap(<ClienteNuevoSheet open contexto={{ modo: 'crear', semana: 2, dia: 3 }} onClose={onClose} onListo={() => {}} onAviso={onAviso} />)
    fireEvent.change(screen.getByLabelText(/nombre del comercio/i), { target: { value: 'Piche' } })
    fireEvent.click(screen.getByRole('button', { name: /agregar al miércoles/i }))
    await waitFor(() => expect(onAviso).toHaveBeenCalledWith('error', expect.stringMatching(/no se pudo/i)))
    expect(onClose).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Componente**

```tsx
import { useEffect, useState } from 'react'
import BottomSheet from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/button'
import { useCrearAlta, useEditarAlta, useReintentarAlta } from '@/hooks/useAltas'
import { diaLabel } from './buscador/etiquetas'
import type { NotificacionTipo } from '@/components/ui/Notification'
import type { IAgendaClient, IEditarAltaDTO } from '@/types/planificacion'

export type ModoClienteNuevo =
    | { modo: 'crear'; semana: number; dia: number }
    | { modo: 'editar'; cliente: IAgendaClient }
    | { modo: 'reintentar'; cliente: IAgendaClient; diaSugerido: number }

interface ClienteNuevoSheetProps {
    open: boolean
    contexto: ModoClienteNuevo | null
    onClose: () => void
    onListo: (cliente: IAgendaClient, contexto: ModoClienteNuevo) => void
    onAviso: (tipo: NotificacionTipo, mensaje: string) => void
}

const DIAS = [1, 2, 3, 4, 5]
const INPUT = 'w-full rounded-[11px] border-[1.5px] border-[#E4E8F0] px-3 py-2.5 text-sm font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6] focus:border-dsnavy'
const LABEL = 'mb-1 block text-[9.5px] font-bold uppercase tracking-wide text-dsmuted'

/**
 * "Cliente nuevo" (spec 2026-09-17): el comercio que todavía no es cliente. Tres modos
 * sobre el mismo formulario: crear la cita (nombre obligatorio, día elegible), editar los
 * datos del comercio mientras la fila está pendiente o la visita abierta, y volver a
 * agendar después de un "No visité" (solo el día: los datos viajan copiados del backend).
 * Vocabulario del vendedor: nunca "alta" ni "prospecto".
 */
export default function ClienteNuevoSheet({ open, contexto, onClose, onListo, onAviso }: ClienteNuevoSheetProps) {
    const crear = useCrearAlta()
    const editar = useEditarAlta()
    const reintentar = useReintentarAlta()
    const [nombre, setNombre] = useState('')
    const [razonSocial, setRazonSocial] = useState('')
    const [direccion, setDireccion] = useState('')
    const [dia, setDia] = useState(1)

    useEffect(() => {
        if (!open || !contexto) return
        if (contexto.modo === 'crear') {
            setNombre(''); setRazonSocial(''); setDireccion(''); setDia(contexto.dia)
        } else if (contexto.modo === 'editar') {
            const d = contexto.cliente.detalleAlta
            setNombre(d?.nombre ?? contexto.cliente.nombreCliente)
            setRazonSocial(d?.razonSocial ?? '')
            setDireccion(d?.direccion ?? '')
        } else {
            setDia(contexto.diaSugerido)
        }
    }, [open, contexto])

    if (!contexto) return null
    const trabajando = crear.isPending || editar.isPending || reintentar.isPending
    const nombreLimpio = nombre.trim()

    async function confirmar() {
        if (!contexto) return
        try {
            let cliente: IAgendaClient
            if (contexto.modo === 'crear') {
                cliente = await crear.mutateAsync({
                    semana: contexto.semana,
                    dia,
                    nombre: nombreLimpio,
                    razonSocial: razonSocial.trim() || undefined,
                    direccion: direccion.trim() || undefined,
                })
            } else if (contexto.modo === 'editar') {
                const d = contexto.cliente.detalleAlta
                const cambios: IEditarAltaDTO = {}
                if (nombreLimpio !== (d?.nombre ?? '')) cambios.nombre = nombreLimpio
                if ((razonSocial.trim() || null) !== (d?.razonSocial ?? null)) cambios.razonSocial = razonSocial.trim() || null
                if ((direccion.trim() || null) !== (d?.direccion ?? null)) cambios.direccion = direccion.trim() || null
                cliente = await editar.mutateAsync({ rotacionClienteId: contexto.cliente.rotacionClienteId, dto: cambios })
            } else {
                cliente = await reintentar.mutateAsync({ rotacionClienteId: contexto.cliente.rotacionClienteId, dia })
            }
            onListo(cliente, contexto)
            onClose()
        } catch {
            onAviso('error', 'No se pudo guardar el cliente nuevo. Volvé a intentar.')
        }
    }

    const titulo = contexto.modo === 'crear' ? 'Cliente nuevo' : contexto.cliente.nombreCliente
    const eyebrow = contexto.modo === 'crear' ? `Agregar al ${diaLabel(contexto.dia)}` : contexto.modo === 'editar' ? 'Cliente nuevo · editar datos' : 'Cliente nuevo · volver a agendar'
    const labelBoton =
        contexto.modo === 'crear' ? `Agregar al ${diaLabel(dia)}`
        : contexto.modo === 'editar' ? 'Guardar'
        : `Volver a agendar el ${diaLabel(dia)}`
    const deshabilitado = trabajando || (contexto.modo !== 'reintentar' && nombreLimpio === '')

    return (
        <BottomSheet open={open} onClose={onClose} eyebrow={eyebrow} title={titulo} altura="auto"
            footer={
                <Button onClick={confirmar} disabled={deshabilitado} loading={trabajando} className="h-12 w-full bg-dsgreen text-[14.5px] hover:bg-dsgreen/90">
                    {labelBoton}
                </Button>
            }
        >
            <div className="flex flex-col gap-3">
                {contexto.modo !== 'reintentar' && (
                    <>
                        <div>
                            <label htmlFor="cn-nombre" className={LABEL}>Nombre del comercio</label>
                            <input id="cn-nombre" className={INPUT} maxLength={120} value={nombre} onChange={e => setNombre(e.target.value)} autoFocus placeholder="Cómo se llama el local" />
                        </div>
                        <div>
                            <label htmlFor="cn-razon" className={LABEL}>Razón social (opcional)</label>
                            <input id="cn-razon" className={INPUT} maxLength={120} value={razonSocial} onChange={e => setRazonSocial(e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor="cn-direccion" className={LABEL}>Dirección (opcional)</label>
                            <input id="cn-direccion" className={INPUT} maxLength={200} value={direccion} onChange={e => setDireccion(e.target.value)} />
                        </div>
                    </>
                )}
                {contexto.modo !== 'editar' && (
                    <div>
                        <span className={LABEL}>Día</span>
                        <div className="flex gap-1.5">
                            {DIAS.map(d => (
                                <button key={d} type="button" onClick={() => setDia(d)}
                                    className={`h-9 flex-1 rounded-lg text-[12.5px] font-semibold ${d === dia ? 'bg-dsnavy text-white' : 'border-[1.5px] border-[#E1E6F0] text-[#182645]'}`}>
                                    {diaLabel(d)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </BottomSheet>
    )
}
```
(Verificar en `buscador/etiquetas.ts` que `diaLabel(3)` devuelve `'Miércoles'`; si devuelve otro formato, ajustar los `name:` de los tests a ese formato, no el helper.)

- [ ] **Step 4: Correr** `npx vitest run src/components/ClienteNuevoSheet.test.tsx`. PASS.
- [ ] **Step 5: Commit** — `feat(alta): ClienteNuevoSheet para crear, editar y volver a agendar`.

---

### Task 13: Entrada desde el "+" del día y wiring en la agenda

**Files:**
- Modify: `$APP/src/components/buscador/BuscadorDiaSheet.tsx` (prop `onClienteNuevo?`, botón bajo la lista de resultados)
- Modify: `$APP/src/pages/AgendaSemanaPage.tsx`
- Test: `$APP/src/pages/AgendaSemanaPage.test.tsx` (o un test nuevo `BuscadorDiaSheet.test.tsx` para el botón)

- [ ] **Step 1: Test del botón** (crear `src/components/buscador/BuscadorDiaSheet.test.tsx` con `vi.mock('@/hooks/useBuscador')` y `vi.mock('@/hooks/useCiclo')` devolviendo mutaciones inertes y `useBuscarEnCartera → { data: [], buscando: false }`):

```tsx
it('ofrece "Cliente nuevo" debajo de la búsqueda cuando el llamador lo pasa', () => {
    const onClienteNuevo = vi.fn()
    render(<BuscadorDiaSheet open onClose={() => {}} semana={2} dia={3} onExtraCreada={() => {}} onNavegarAExistente={() => {}} onTraido={() => {}} onAviso={() => {}} onClienteNuevo={onClienteNuevo} />)
    fireEvent.click(screen.getByRole('button', { name: /cliente nuevo/i }))
    expect(onClienteNuevo).toHaveBeenCalled()
})
it('sin onClienteNuevo no muestra el botón', () => { /* queryByRole null */ })
```

- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: BuscadorDiaSheet** — prop `onClienteNuevo?: () => void`; al final del bloque `{!consulta && (...)}`, después del `div` de resultados:

```tsx
                    {/* Comercio que NO está en la cartera: la búsqueda no lo va a encontrar
                        nunca. Va abajo de la lista, discreto, para que el camino normal
                        (buscar al cliente real) siga siendo el primero. */}
                    {onClienteNuevo && (
                        <button type="button" onClick={() => { cerrar(); onClienteNuevo() }}
                            className="mt-1 h-11 w-full rounded-lg border-[1.5px] border-dashed border-[#C9D2E3] text-sm font-semibold text-dsnavy">
                            ¿No es cliente todavía? · Cliente nuevo
                        </button>
                    )}
```

- [ ] **Step 4: AgendaSemanaPage** — estado y handlers:

```tsx
    const [clienteNuevo, setClienteNuevo] = useState<ModoClienteNuevo | null>(null)
```
En el `<BuscadorDiaSheet>` agregar `onClienteNuevo={() => setClienteNuevo({ modo: 'crear', semana: semanaEfectiva, dia: DIAS.indexOf(diaAAgregar) + 1 })}` (dentro del bloque que ya garantiza `semanaEfectiva != null && diaAAgregar != null`). Render al lado de `EstadoVisitaSheet`:
```tsx
            <ClienteNuevoSheet
                open={clienteNuevo !== null}
                contexto={clienteNuevo}
                onClose={() => setClienteNuevo(null)}
                onAviso={mostrar}
                onListo={(cliente, ctx) => {
                    setDiaActivo(DIAS[cliente.dia - 1])
                    mostrar('exito', ctx.modo === 'editar' ? 'Datos guardados' : `Cliente nuevo agendado el ${NOMBRE_DIA[DIAS[cliente.dia - 1]]}`)
                }}
            />
```
Y dos handlers para la card (Task 14 los consume): `onEditarAlta={c => setClienteNuevo({ modo: 'editar', cliente: c })}` y `onReintentarAlta={c => setClienteNuevo({ modo: 'reintentar', cliente: c, diaSugerido: c.dia })}` pasados por `AgendaBoard` (agregar las dos props opcionales a `AgendaBoardProps` y pasarlas a `ClienteCard`).

- [ ] **Step 5: Correr** `npx vitest run src/components/buscador src/pages/AgendaSemanaPage.test.tsx` y `npx tsc --noEmit`. PASS.
- [ ] **Step 6: Commit** — `feat(alta): "Cliente nuevo" desde el + del día y wiring en la agenda`.

---

### Task 14: `ClienteCard` en variante Cliente nuevo

**Files:**
- Modify: `$APP/src/components/ClienteCard.tsx`
- Modify: `$APP/src/components/AgendaBoard.tsx` (props passthrough)
- Test: `$APP/src/components/ClienteCard.test.tsx`

- [ ] **Step 1: Tests**

```tsx
const alta = (over: Partial<IAgendaClient> = {}) => cliente({
    codigoParticularCliente: 'ALTA-000009', nombreCliente: 'Autopartes Piche', direccion: 'San Martín 811',
    telefono: '1140506070', esExtra: true, tipo: 'alta',
    detalleAlta: { nombre: 'Autopartes Piche', razonSocial: null, direccion: 'San Martín 811' }, ...over,
})

it('un cliente nuevo pendiente muestra el chip, la dirección, Editar e Iniciar; sin Propuesta, sin llamar, sin código', () => {
    const onEditarAlta = vi.fn(); const onIniciarVisita = vi.fn()
    render(<ClienteCard cliente={alta()} {...handlers} onEditarAlta={onEditarAlta} onIniciarVisita={onIniciarVisita} />)
    expect(screen.getByText(/cliente nuevo/i)).toBeInTheDocument()
    expect(screen.queryByText(/agregado/i)).not.toBeInTheDocument()
    expect(screen.queryByText('#ALTA-000009')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /llamar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^propuesta$/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect(onEditarAlta).toHaveBeenCalledWith(expect.objectContaining({ rotacionClienteId: 42 }))
    fireEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
    expect(onIniciarVisita).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /reagendar/i })).toBeInTheDocument()
})

it('un cliente nuevo no visitado ofrece "Volver a agendar"', () => {
    const onReintentarAlta = vi.fn()
    render(<ClienteCard cliente={alta({ estado: 'no_visita' })} {...handlers} onReintentarAlta={onReintentarAlta} />)
    fireEvent.click(screen.getByRole('button', { name: /volver a agendar/i }))
    expect(onReintentarAlta).toHaveBeenCalled()
})

it('un cliente nuevo visitado muestra Ver resumen como cualquier otro', () => {
    render(<ClienteCard cliente={alta({ estado: 'visitada', visitaId: 7 })} {...handlers} />)
    expect(screen.getByRole('button', { name: /ver resumen/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** — props nuevas `onEditarAlta?: (c: IAgendaClient) => void`, `onReintentarAlta?: (c: IAgendaClient) => void`; `const alta = esAlta(cliente)`:
  - Chip: si `alta`, en lugar del `#código` renderizar chip `Cliente nuevo` (`bg-[#DCFCE7] text-[#166534]`, ícono `UserPlus` de lucide); y el chip `Agregado` sólo cuando `cliente.esExtra && !alta`.
  - Header actions (`!resuelto`): teléfono sólo si `!alta` (no hay). Agregar antes de Reagendar, si `alta && onEditarAlta && cliente.estado === 'pendiente'`: botón `HEADER_WITH_LABEL` con `Pencil` + "Editar".
  - `AccionesExternas`: renderizar sólo si `!alta` (no hay cuenta en Lupa/Versus).
  - Tier 1: si `alta`, no renderizar el botón "Propuesta"; "Iniciar visita" ocupa todo el ancho.
  - Bloque `resuelto && cliente.visitaId === null` (no_visita): si `alta && onReintentarAlta`, renderizar en vez de `null` un `<div className="mt-2.5 border-t pt-2.5">` con `Button variant="outline"` "Volver a agendar" (`RotateCcw`).
  - `AgendaBoard`: agregar las dos props opcionales y pasarlas a cada `ClienteCard`.
- [ ] **Step 4: Correr** `npx vitest run src/components/ClienteCard.test.tsx src/components/AgendaBoard.test.tsx`. PASS.
- [ ] **Step 5: Commit** — `feat(alta): ClienteCard en variante Cliente nuevo`.

---

### Task 15: `VisitaFlow`: inicio directo sin propuesta ni mapa

**Files:**
- Modify: `$APP/src/components/VisitaFlow.tsx`
- Test: `$APP/src/components/VisitaFlow.test.tsx`

- [ ] **Step 1: Test** (con el harness del archivo; `clienteAlta = { ...cliente, tipo: 'alta', codigoParticularCliente: 'ALTA-000009', latitud: undefined, longitud: undefined }`)

```tsx
it('un cliente nuevo arranca directo: sin propuesta, sin mapa, propuesta vacía en el POST', async () => {
    vi.mocked(geo.capturarUbicacion).mockResolvedValue({ ok: true, coord: '-34.6,-58.4', precisionM: 10 } as any)
    vi.mocked(api.iniciarVisita).mockResolvedValue({ visitaId: 77, ofrecimientos: 0 })
    vi.mocked(api.getOfrecimientos).mockResolvedValue([])
    const onVisitaIniciada = vi.fn()
    renderHarness({ clienteInicial: clienteAlta, directoAMapa: true, onVisitaIniciada })
    await waitFor(() => expect(api.iniciarVisita).toHaveBeenCalledWith({ rotacionClienteId: 42, coordInicio: '-34.6,-58.4', coordCliente: undefined, propuesta: [] }))
    expect(api.getPropuesta).not.toHaveBeenCalled()
    expect(screen.queryByText(/propuesta comercial/i)).not.toBeInTheDocument()
    await waitFor(() => expect(onVisitaIniciada).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'alta' }), 77))
})
```

- [ ] **Step 2: Ver fallar** (hoy abre `PropuestaSheet` y pide `getPropuesta` con `ALTA-…`).
- [ ] **Step 3: Implementar** — después de `tieneCoords`:

```tsx
    // "Cliente nuevo": no hay historial (propuesta) ni coordenada (mapa/gate). Se
    // arranca directo con la ubicación del vendedor, que pasa a ser la del comercio.
    const clienteEsAlta = esAlta(cliente)
```
- `usePropuesta(cargandoDirecto && !clienteEsAlta ? … : null)`.
- Efecto de arranque directo:
```tsx
    useEffect(() => {
        if (!clienteEsAlta || !directoAMapa || mostrarRubros || iniciandoFlujo || bloqueadoPorOtraVisita) return
        void onIniciar([])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clienteEsAlta, directoAMapa, mostrarRubros, cliente?.rotacionClienteId])
```
- `PropuestaSheet open={!clienteEsAlta && !mostrarRubros && propuestaPendiente === null && !cargandoDirecto}`.
- Mientras `clienteEsAlta && !mostrarRubros`: reusar el loader full-screen de `cargandoDirecto` con texto "Iniciando visita…" y, si `errorIniciar`, el mismo bloque de error con "Volver a intentar" → `onIniciar([])` y "Cancelar" → `cerrarFlujo`.
- A `VisitaSheet` pasar `esAlta={clienteEsAlta}` y `codigoParticularCliente={clienteEsAlta ? undefined : cliente.codigoParticularCliente}` (Task 16 declara la prop).
- `onCerrarVisita(observaciones, detalle)` → `cerrar.mutateAsync({ visitaId, coordFinal: geo.coord, ...(observaciones ? { observaciones } : {}), ...(detalle ? { detalle } : {}) })`.
- [ ] **Step 4: Correr** `npx vitest run src/components/VisitaFlow.test.tsx`. PASS.
- [ ] **Step 5: Commit** — `feat(alta): VisitaFlow arranca el cliente nuevo directo, sin propuesta ni mapa`.

---

### Task 16: `VisitaSheet` en variante Cliente nuevo

**Files:**
- Modify: `$APP/src/components/VisitaSheet.tsx`
- Test: `$APP/src/components/VisitaSheet.test.tsx`

**Interfaces:** prop nueva `esAlta?: boolean`; `onCerrarVisita: (observaciones: string | null, detalle: IDetalleContactoAlta | null) => void`.

- [ ] **Step 1: Tests** (usar los mocks de hooks/API que ya usa el archivo)

```tsx
it('cliente nuevo: sin rubros ofrecidos el cierre queda gris hasta que haya un ofrecimiento o una observación', async () => {
    vi.mocked(api.getOfrecimientos).mockResolvedValue([])
    const onCerrarVisita = vi.fn()
    render(<VisitaSheet open visitaId={77} nombreCliente="Autopartes Piche" visitaCerrada={false} enCurso esAlta onCerrarVisita={onCerrarVisita} onClose={() => {}} />)
    const boton = await screen.findByRole('button', { name: /cargá lo que ofreciste o dejá una observación/i })
    expect(boton).toBeDisabled()
    expect(api.getRubroStatus).not.toHaveBeenCalled()
    // la tabla muestra el catálogo 80/20 para agregar
    expect(screen.getByText(/otros rubros/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/observaciones/i), { target: { value: 'lo piensa' } })
    fireEvent.change(screen.getByLabelText(/con quién hablaste/i), { target: { value: 'Gustavo' } })
    fireEvent.change(screen.getByLabelText(/cumpleaños/i), { target: { value: '1978-03-14' } })
    const cerrar = screen.getByRole('button', { name: /cerrar visita/i })
    expect(cerrar).toBeEnabled()
    fireEvent.click(cerrar)
    await waitFor(() => expect(onCerrarVisita).toHaveBeenCalledWith('lo piensa', { contacto: 'Gustavo', fechaNacimiento: '1978-03-14' }))
})

it('cliente nuevo: el eyebrow sin visita en curso dice Cliente nuevo, no Propuesta comercial', async () => {
    vi.mocked(api.getOfrecimientos).mockResolvedValue([])
    render(<VisitaSheet open visitaId={77} nombreCliente="Piche" visitaCerrada esAlta onCerrarVisita={() => {}} onClose={() => {}} />)
    expect(await screen.findByText(/cliente nuevo/i)).toBeInTheDocument()
    expect(screen.queryByText(/propuesta comercial/i)).not.toBeInTheDocument()
})

it('cliente real: onCerrarVisita recibe detalle null', async () => { /* flujo existente de cierre; expect(onCerrarVisita).toHaveBeenCalledWith(null, null) */ })
```

- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar**
  - Prop `esAlta = false`. Estado `const [contacto, setContacto] = useState('')`, `const [fechaNacimiento, setFechaNacimiento] = useState('')`; resetear en el efecto de `!open`.
  - Gate: 
  ```tsx
    const cierreHabilitado = esAlta ? puedeCerrarAlta(completos, observaciones) : faltanParaMinimo === 0
  ```
  y usar `cierreHabilitado` en `disabled`, en la clase gris/naranja y en el label: si `!cierreHabilitado`, `esAlta ? 'Cargá lo que ofreciste o dejá una observación' : `Cargá ${faltanParaMinimo} …``.
  - Observaciones: el bloque se muestra con `!visitaCerrada && ofrecimientosCargados && (esAlta || faltanParaMinimo === 0)`. Debajo, sólo con `esAlta`, dos inputs en una fila: `Con quién hablaste (opcional)` (`id="visita-contacto"`, `maxLength={80}`) y `Cumpleaños (opcional)` (`id="visita-cumple"`, `type="date"`).
  - `cerrarConBorrador` termina en:
  ```tsx
        const detalle: IDetalleContactoAlta | null =
            esAlta && (contacto.trim() || fechaNacimiento)
                ? { contacto: contacto.trim() || null, fechaNacimiento: fechaNacimiento || null }
                : null
        onCerrarVisita(texto === '' ? null : texto, detalle)
  ```
  - Eyebrow: `enCurso ? … : esAlta ? 'Cliente nuevo' : 'Propuesta comercial'`.
  - `useRubroStatus(open && codigoParticularCliente ? codigoParticularCliente : null)` ya no llama cuando `VisitaFlow` pasa `undefined` (Task 15). `filas` con `rubroStatus = []` trae el 80/20 como filas agregables: no hace falta tocar `construirFilasVisita`.
  - Texto "Esta visita no tiene rubros propuestos." queda inalcanzable para el alta (hay catálogo), no se toca.
- [ ] **Step 4: Correr** `npx vitest run src/components/VisitaSheet.test.tsx src/components/VisitaFlow.test.tsx`. PASS.
- [ ] **Step 5: Commit** — `feat(alta): VisitaSheet con gate propio, contacto y sin historial para el cliente nuevo`.

---

### Task 17: Grid de gerencia

**Files:**
- Modify: `$APP/src/components/ruta/ClienteCardRuta.tsx` (~99)
- Test: `$APP/src/components/ruta/ClienteCardRuta.test.tsx`

- [ ] **Step 1: Test**

```tsx
it('una fila de alta muestra el chip Cliente nuevo y no Agregado', () => {
    render(<ClienteCardRuta cliente={{ ...base, tipo: 'alta', esExtra: true, codigoParticularCliente: 'ALTA-000009', nombreCliente: 'Autopartes Piche' }} />)
    expect(screen.getByText(/cliente nuevo/i)).toBeInTheDocument()
    expect(screen.queryByText(/agregado/i)).not.toBeInTheDocument()
})
```
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** — antes del chip `esExtra`: `{cliente.tipo === 'alta' ? <span className="… bg-[#DCFCE7] text-[#166534]">Cliente nuevo</span> : cliente.esExtra && (…chip existente…)}`. Si el código se pinta con `#`, para `tipo === 'alta'` omitir el código.
- [ ] **Step 4: Correr.** PASS.
- [ ] **Step 5: Commit** — `feat(alta): chip Cliente nuevo en el grid de gerencia`.

---

### Task 18: Verificación integral

- [ ] **Step 1: Backend** — en `$API`: `npx tsc --noEmit && npx jest`. Todo PASS.
- [ ] **Step 2: Front** — en `$APP`: `npx tsc --noEmit && npx vitest run && npm run lint` (si existe). Todo PASS.
- [ ] **Step 3: Prueba manual** (con el backend corriendo contra la base local, después de aplicar `planificacion-visita-alta.sql`):
  1. `+` del día → "¿No es cliente todavía? · Cliente nuevo" → nombre → Agregar. La card aparece con chip verde, sin código, sin teléfono.
  2. "Editar" → cambiar dirección → Guardar. La card la muestra.
  3. "Iniciar visita" → arranca sin mapa. En el sheet: tabla con el 80/20, botón gris; agregar un rubro y resolverlo → naranja; contacto y cumpleaños; Cerrar.
  4. Verificar en MySQL: `pl_rotacion_cliente` con `tipo='alta'`, `codigo 'ALTA-…'`, `detalle`; `pl_resolucion.detalle` con el contacto.
  5. Verificar en Cromo (o en el log) el evento a `09895` con etiqueta `ALTA` y descripción `Nueva alta …`.
  6. Otra alta → "Reagendar → No visité" → la card muestra "Volver a agendar" → elegir día → nueva card pendiente.
  7. `/analitica`: cobertura sin cambios; "fuera de plan" no cuenta las altas; listado de visitas muestra el nombre del comercio.
- [ ] **Step 4:** Si algo falla, arreglar con su test y commit `fix(alta): …`.

---

### Task 19: Documentación viva

**Files:**
- Modify: `$APP/docs/dominio/tablas.md` (`pl_rotacion_cliente`, `pl_resolucion`)
- Modify: `$APP/docs/dominio/modelo.md` (nueva sección corta)
- Modify: `$APP/CLAUDE.md` (una viñeta en "Decisiones no obvias")
- Modify: `$API/docs/db-notes/RUNBOOK-deploy-plan-rotacion.md` (paso: correr `planificacion-visita-alta.sql`)

- [ ] **Step 1: `tablas.md`** — en `pl_rotacion_cliente` agregar párrafo:

> **`tipo` y `detalle` (spec 2026-09-17).** `tipo = 'alta'` es un **"Cliente nuevo"**: un comercio que todavía no es cliente. La fila lleva `es_extra = 1` (está fuera del plan materializado, y así la cobertura la excluye sin tocar la query), un código sintético `ALTA-<id>` (la columna es `NOT NULL` y parte del `UNIQUE`; el 09895 de Cromo no sirve porque dos altas el mismo día chocarían) y los datos del comercio en `detalle JSON` (`nombre`, `razonSocial`, `direccion`). JSON y no columnas porque nadie agrupa por razón social. `tipo` es columna propia y no recicla `es_extra`: "fuera del plan" y "no es un cliente" son dos propiedades distintas.

En `pl_resolucion`: `detalle JSON NULL` — el contacto de una visita de alta (`contacto`, `fechaNacimiento`), por visita porque la persona puede cambiar entre intentos. `NULL` para toda visita a un cliente real.

- [ ] **Step 2: `modelo.md`** — sección nueva antes de "Lo que NO hay que hacer":

> ## La visita de alta ("Cliente nuevo")
> El comercio que todavía no es cliente **se representa con una fila del plan** (`tipo='alta'`), no con una tabla propia: la fila ya es una cita —vive en la agenda de un día, se mueve auditada con `reacomodar`, se resuelve una vez—, y eso era exactamente lo que hacía falta. El hecho es una `pl_resolucion` común. Sin ficha en el warehouse no hay coordenada (no hay gate de distancia: la `coord_inicio` **es** la ubicación del comercio) ni propuesta (el vendedor carga desde el catálogo). Cromo recibe el evento sobre el genérico **09895** con etiqueta `ALTA`, que es donde los vendedores escribían esto a mano. Un segundo intento tras un `no_visita` es **otra fila** con el detalle copiado (`FILA_RESUELTA` impide mover la primera). Costo aceptado: el alta queda atada a la rotación; si la vuelta cierra con un alta pendiente, no se arrastra. Spec: `2026-09-17-visita-de-alta-cliente-nuevo-design.md`.

- [ ] **Step 3: `CLAUDE.md`** — viñeta:

> - **"Cliente nuevo" (visita de alta) es una fila del plan con `tipo='alta'`, no una tabla ni un cliente genérico.** Código sintético `ALTA-<id>`, datos del comercio en `pl_rotacion_cliente.detalle`, contacto en `pl_resolucion.detalle`. Sin propuesta, sin mapa, sin gate de distancia; gate de cierre propio (un ofrecimiento o una observación, `puedeCerrarAlta`). Cromo va al genérico 09895 con etiqueta `ALTA`. Ver `docs/dominio/modelo.md`, "La visita de alta".

- [ ] **Step 4: Runbook** — agregar el script al orden de ejecución.
- [ ] **Step 5: Commit** en cada repo — `docs(alta): tablas, modelo y CLAUDE.md` / `docs(alta): runbook`.

---

### Task 20: Ajuste del spec

**Files:**
- Modify: `$APP/docs/superpowers/specs/2026-09-17-visita-de-alta-cliente-nuevo-design.md`

- [ ] **Step 1:** En "Datos › `pl_resolucion`" cambiar "Se escriben al cerrar (`PUT /visitas/:id/cerrar`) o al registrar `no_visita`" por "Se escriben **solo al cerrar la visita** (`PUT /visitas/:id/cerrar`). Un `no_visita` no lleva contacto: si no atendió nadie, no hay a quién anotar." Y en "API" quitar `POST /visitas/no-visita` de los endpoints que aceptan `detalle`.
- [ ] **Step 2:** En "API" agregar que `POST /altas` devuelve **201**, y que `semana` viaja en el body (zona vista), como `confirmarExtra`.
- [ ] **Step 3: Commit** — `docs(spec): contacto solo al cerrar; 201 y semana en body`.

---

## Self-review

- **Cobertura del spec:** datos (T1), ciclo de vida crear/editar/reintentar (T3-T5, T12-T13), agenda (T6), iniciar/cerrar (T7, T15, T16), Cromo (T8), analítica (T9), grid (T10, T17), card (T14), docs (T19). El "Quitar" de una alta pendiente usa el soft-delete existente sin cambios. El arrastre al materializar queda fuera, como dice el spec.
- **Consistencia de nombres:** `tipo`/`detalle`/`detalleAlta`, `IDetalleAlta`/`IDetalleContactoAlta`, `crearAlta`/`editarAlta`/`reintentarAlta`, `esAlta`/`puedeCerrarAlta`, `CLIENTE_GENERICO_ALTA`/`TAG_ALTA`, `prefijoAlta`/`conContacto` se usan igual en todas las tasks.
- **Desvío documentado:** contacto sólo al cerrar (T20).
