# Vendedor de prueba — Plan de implementación, parte 1: api-vendedores

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`../specs/2026-09-17-modo-prueba-gerencia-design.md`](../specs/2026-09-17-modo-prueba-gerencia-design.md).
Leerlo entero antes de empezar. Este plan es la parte **backend**; la parte front es
[`2026-09-18-vendedor-de-prueba-front.md`](2026-09-18-vendedor-de-prueba-front.md) y depende de que
esta esté deployada (necesita `GET /planificacion/me`).

**Repo:** `C:/Users/matia/Documents/distrisuper/business-workflow/versus/api-vendedores` (rama desde
`master`). Todos los paths de este plan son relativos a ese repo.

**Goal:** Que un usuario con rol de gerencia o `tester` pueda operar la app del vendedor como su
propio vendedor sintético `PRUEBA-<userId>`, aislado de la analítica, de Cromo y de client-service,
con reinicio a partir de la cartera de un vendedor real, sin tocar el warehouse ni el comportamiento
de app-vendedores.

**Architecture:** La identidad se resuelve en `sellerIdentity.ts` leyendo dos capacidades nuevas de
`config/roles.ts` (`operaComoVendedorDePrueba`, `superviseVendedores`). El aislamiento es por el
prefijo reservado `PRUEBA-` en `codigo_particular_vendedor`, preguntado en un único módulo
(`vendedorPrueba.ts`) desde las tres guardas: `fragmentoVendedores` (analítica),
`CrmEventoVisitaService.notificar` (Cromo) y `VisitasService.iniciar` +
`contarCoordClienteAjustada` (client-service y cupo). El reinicio borra las once tablas del vendedor
en una transacción y materializa desde la plantilla del vendedor origen. `GET /planificacion/me`
expone capacidades y scope para que el front no espeje roles.

**Tech Stack:** Node + Express + TypeScript, Sequelize (MySQL `planificacion` vía
`sequelizeWritePlanificacion`), PostgreSQL warehouse (solo lectura, `warehouseQuery`), Jest + ts-jest.

## Global Constraints

- **El warehouse no se modifica ni se extiende bajo ninguna forma.** Solo `SELECT` sobre lo que ya
  existe en `analytics.fct_clients`.
- **app-vendedores no cambia de comportamiento.** Fuera del dominio de planificación solo se toca
  `src/config/roles.ts`, de forma aditiva. `ClientRepository.getByVendor`, `middleware/authorize.ts`,
  `SalesDataScopeResolver` y `TVPortfolioResolver` **no se modifican**. Ninguna ruta fuera de
  `/planificacion/*` cambia. Prohibido agregar `tester` a `ALLOWED_ROLES` de app-vendedores.
- Prefijo reservado: `PRUEBA-` (constante `PREFIJO_VENDEDOR_PRUEBA`). Nunca un literal repetido en
  SQL: el replacement sale de la constante.
- Ninguna tabla ni columna nueva. Ninguna migración. `agendaMock.json` no cambia.
- Códigos de error nuevos, exactos: `SOLO_LECTURA_SUPERVISION`, `VENDEDOR_FUERA_DE_SCOPE`,
  `ORIGEN_INVALIDO`, `NO_ES_VENDEDOR_DE_PRUEBA`. Motivo de seguimiento nuevo: `MODO_PRUEBA`.
- Mensaje de seguimiento, textual: `En modo prueba el seguimiento no se manda a Cromo.`
- Descripción de la rotación de prueba, textual: `Cartera de <origen>` o `Sin cartera`.
- Tests: `npm test` (Jest). Antes del PR, la suite **completa** en verde, no solo planificación.
- Commits chicos, en español, prefijo `feat(prueba):` / `test(prueba):` / `docs(prueba):`.
  Terminar cada mensaje con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## Mapa de archivos

| archivo | responsabilidad |
|---|---|
| `src/config/roles.ts` (modificar) | Dos propiedades nuevas en `RolePolicy`; fila `tester`; listas derivadas `ROLES_CON_VENDEDOR_DE_PRUEBA`, `ROLES_SUPERVISAN`. |
| `src/services/planificacion/vendedorPrueba.ts` (crear) | Prefijo, derivación del código, `esVendedorDePrueba`, `puedeOperarComoVendedorDePrueba`. Único lugar que sabe qué es "de prueba". |
| `src/services/planificacion/sellerIdentity.ts` (modificar) | `resolveSellerCode(user, opciones?)` con default al sintético y parámetro de solo lectura acotado al scope. |
| `src/middleware/requireVendedorEnScope.ts` (crear) | Valida `req.params.codigo` contra `allowedSellerCodes` en las rutas de gerencia. |
| `src/routes/planificacion.ts`, `src/routes/analitica.ts` (modificar) | `authorizeVendedor`, `ROLES_SUPERVISAN`, middleware de scope, rutas `/prueba/reiniciar` y `/me`. |
| `src/repositories/AnaliticaRepository.ts` (modificar) | `fragmentoVendedores` excluye el prefijo; la rama `filtro.vendedor` también. |
| `src/services/crm/CrmEventoVisitaService.ts`, `seguimientoMensaje.ts` (modificar) | Guarda `MODO_PRUEBA`. |
| `src/services/planificacion/VisitasService.ts`, `src/repositories/ResolucionRepository.ts` (modificar) | Guarda del `PATCH` a client-service; cupo excluye prueba. |
| `src/repositories/ClientRepository.ts` (modificar, aditivo) | `buscarEnPadron(texto, limite)` y `existeEnPadron(codigo)`: dos métodos nuevos, lectura pura. |
| `src/services/planificacion/carteraDe.ts` (crear) | Seam: cartera real por `getByVendor`, cartera de prueba = todo el padrón. |
| `src/services/planificacion/BuscadorService.ts`, `BuscadorCarteraService.ts` (modificar) | Usan el seam. |
| `src/services/planificacion/RotacionService.ts` (modificar) | `materializar(vendedor, transaction?, plantillaDe?)`. |
| `src/repositories/VendedorPruebaRepository.ts` (crear) | `borrarTodo(codigo, transaction)`: once `DELETE` en orden hoja→raíz. |
| `src/services/planificacion/VendedorPruebaService.ts` (crear) | `reiniciar(user, origen?)`, `me(user)`. |
| `src/controllers/planificacionController.ts` (modificar) | Handlers `reiniciarPrueba`, `getMe`. |
| `CLAUDE.md` / `AGENTS.md` del repo (modificar) | Reglas nuevas. |

---

### Task 1: Capacidades en la política de roles y rol `tester`

**Files:**
- Modify: `src/config/roles.ts`
- Test: `src/config/roles.spec.ts`

**Interfaces:**
- Produces: `RolePolicy.operaComoVendedorDePrueba: boolean`, `RolePolicy.superviseVendedores: boolean`,
  `export const ROLES_CON_VENDEDOR_DE_PRUEBA: string[]`, `export const ROLES_SUPERVISAN: string[]`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/config/roles.spec.ts`:

```ts
import { ROLES_CON_VENDEDOR_DE_PRUEBA, ROLES_SUPERVISAN } from './roles'

describe('operaComoVendedorDePrueba / superviseVendedores', () => {
    it('tester existe, prueba y no supervisa, con scope vendor-scoped', () => {
        const p = ROLE_POLICIES['tester']
        expect(p).toBeDefined()
        expect(p.sellerScope).toBe('vendor-scoped')
        expect(p.operaComoVendedorDePrueba).toBe(true)
        expect(p.superviseVendedores).toBe(false)
        expect(p.canCreateNotas).toBe(false)
        expect(p.isNotaAdmin).toBe(false)
        expect(p.canManageNotasEntidad).toBe(false)
    })

    it('ROLES_CON_VENDEDOR_DE_PRUEBA es exactamente gerencia + tester', () => {
        expect([...ROLES_CON_VENDEDOR_DE_PRUEBA].sort()).toEqual(
            ['admin', 'supervisor', 'tester', 'versus-ger'].sort(),
        )
    })

    it('ROLES_SUPERVISAN es exactamente gerencia (TV se suma en su feature)', () => {
        expect([...ROLES_SUPERVISAN].sort()).toEqual(['admin', 'supervisor', 'versus-ger'].sort())
    })

    it('marketing, sistema, client, tv y vendedor no prueban ni supervisan', () => {
        for (const rol of ['marketing', 'sistema', 'client', 'tv', 'vendedor']) {
            expect(ROLE_POLICIES[rol].operaComoVendedorDePrueba).toBe(false)
            expect(ROLE_POLICIES[rol].superviseVendedores).toBe(false)
        }
    })

    it('no altera ninguna propiedad existente de los roles que ya estaban (compat app-vendedores)', () => {
        const esperado: Record<string, [string, boolean, boolean, boolean, boolean]> = {
            'admin':      ['unrestricted',  true,  false, true,  true ],
            'versus-ger': ['unrestricted',  true,  false, true,  true ],
            'supervisor': ['unrestricted',  true,  false, true,  false],
            'tv':         ['tv-group',      true,  true,  true,  false],
            'vendedor':   ['vendor-scoped', true,  true,  false, false],
            'marketing':  ['unrestricted',  false, false, false, false],
            'client':     ['client-scoped', true,  false, false, false],
            'sistema':    ['unrestricted',  true,  true,  false, false],
        }
        for (const [rol, [scope, money, notas, notaAdmin, entidad]] of Object.entries(esperado)) {
            const p = ROLE_POLICIES[rol]
            expect(p.sellerScope).toBe(scope)
            expect(p.monetaryDataVisible).toBe(money)
            expect(p.canCreateNotas).toBe(notas)
            expect(p.isNotaAdmin).toBe(notaAdmin)
            expect(p.canManageNotasEntidad).toBe(entidad)
        }
    })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx jest src/config/roles.spec.ts`
Expected: FAIL — `tester` undefined, `ROLES_CON_VENDEDOR_DE_PRUEBA` no exportado.

- [ ] **Step 3: Implementar**

En `src/config/roles.ts`, agregar a `RolePolicy` (después de `canManageNotasEntidad`):

```ts
    /** Puede entrar a la app del vendedor (app-planificacion) y operar como su vendedor
     *  sintético `PRUEBA-<id>`. Independiente de sellerScope: probar no implica ver datos
     *  reales de otros. Ver spec 2026-09-17-modo-prueba-gerencia-design.md. */
    operaComoVendedorDePrueba: boolean
    /** Puede supervisar vendedores en planificación: /analitica, edición de ruta, agenda de
     *  otro en solo lectura. A CUÁLES los supervisa lo dice sellerScope (null = todos;
     *  tv-group = los de su grupo). */
    superviseVendedores: boolean
```

Reescribir `ROLE_POLICIES` agregando las dos columnas a cada fila **sin cambiar ninguna existente**,
y la fila nueva:

```ts
export const ROLE_POLICIES: Record<string, RolePolicy> = {
    'admin':      { sellerScope: 'unrestricted',  monetaryDataVisible: true,  canCreateNotas: false, isNotaAdmin: true,  canManageNotasEntidad: true,  operaComoVendedorDePrueba: true,  superviseVendedores: true  },
    'versus-ger': { sellerScope: 'unrestricted',  monetaryDataVisible: true,  canCreateNotas: false, isNotaAdmin: true,  canManageNotasEntidad: true,  operaComoVendedorDePrueba: true,  superviseVendedores: true  },
    'supervisor': { sellerScope: 'unrestricted',  monetaryDataVisible: true,  canCreateNotas: false, isNotaAdmin: true,  canManageNotasEntidad: false, operaComoVendedorDePrueba: true,  superviseVendedores: true  },
    'tv':         { sellerScope: 'tv-group',      monetaryDataVisible: true,  canCreateNotas: true,  isNotaAdmin: true,  canManageNotasEntidad: false, operaComoVendedorDePrueba: false, superviseVendedores: false },
    'vendedor':   { sellerScope: 'vendor-scoped', monetaryDataVisible: true,  canCreateNotas: true,  isNotaAdmin: false, canManageNotasEntidad: false, operaComoVendedorDePrueba: false, superviseVendedores: false },
    'marketing':  { sellerScope: 'unrestricted',  monetaryDataVisible: false, canCreateNotas: false, isNotaAdmin: false, canManageNotasEntidad: false, operaComoVendedorDePrueba: false, superviseVendedores: false },
    'client':     { sellerScope: 'client-scoped', monetaryDataVisible: true,  canCreateNotas: false, isNotaAdmin: false, canManageNotasEntidad: false, operaComoVendedorDePrueba: false, superviseVendedores: false },
    'sistema':    { sellerScope: 'unrestricted',  monetaryDataVisible: true,  canCreateNotas: true,  isNotaAdmin: false, canManageNotasEntidad: false, operaComoVendedorDePrueba: false, superviseVendedores: false },
    // Rol nuevo (lo crea el servicio de auth): quien no es gerencia pero necesita probar la
    // app del vendedor. vendor-scoped sin codigoparticular resuelve a cartera vacía, así
    // que en ventas y analítica no ve nada.
    'tester':     { sellerScope: 'vendor-scoped', monetaryDataVisible: true,  canCreateNotas: false, isNotaAdmin: false, canManageNotasEntidad: false, operaComoVendedorDePrueba: true,  superviseVendedores: false },
}
```

Al final del archivo, después de `rolesWhere`:

```ts
/** Roles que pueden operar la app del vendedor como su vendedor de prueba. */
export const ROLES_CON_VENDEDOR_DE_PRUEBA = rolesWhere(p => p.operaComoVendedorDePrueba)

/** Roles que supervisan vendedores en planificación (analítica, ruta, agenda ajena en lectura). */
export const ROLES_SUPERVISAN = rolesWhere(p => p.superviseVendedores)
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx jest src/config/roles.spec.ts`
Expected: PASS (todos, incluidos los preexistentes).

- [ ] **Step 5: Commit**

```bash
git add src/config/roles.ts src/config/roles.spec.ts
git commit -m "feat(prueba): capacidades operaComoVendedorDePrueba y superviseVendedores; rol tester

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `vendedorPrueba.ts`, el único lugar que sabe qué es "de prueba"

**Files:**
- Create: `src/services/planificacion/vendedorPrueba.ts`
- Test: `src/services/planificacion/vendedorPrueba.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export const PREFIJO_VENDEDOR_PRUEBA = 'PRUEBA-'
  export function codigoVendedorPrueba(userId: string): string
  export function esVendedorDePrueba(codigo: string): boolean
  export function puedeOperarComoVendedorDePrueba(rol: string): boolean
  export function superviseVendedores(rol: string): boolean
  ```

- [ ] **Step 1: Test que falla**

```ts
// src/services/planificacion/vendedorPrueba.spec.ts
import {
    PREFIJO_VENDEDOR_PRUEBA,
    codigoVendedorPrueba,
    esVendedorDePrueba,
    puedeOperarComoVendedorDePrueba,
    superviseVendedores,
} from './vendedorPrueba'

describe('vendedorPrueba', () => {
    it('deriva el código del userId con el prefijo reservado', () => {
        expect(PREFIJO_VENDEDOR_PRUEBA).toBe('PRUEBA-')
        expect(codigoVendedorPrueba('123')).toBe('PRUEBA-123')
    })

    it('esVendedorDePrueba distingue el prefijo de los códigos reales', () => {
        expect(esVendedorDePrueba('PRUEBA-7')).toBe(true)
        expect(esVendedorDePrueba('V 2')).toBe(false)
        expect(esVendedorDePrueba('NACHO')).toBe(false)
        expect(esVendedorDePrueba('prueba-7')).toBe(false) // el prefijo es exacto, no case-insensitive
    })

    it('puedeOperarComoVendedorDePrueba sale de la política, no de una lista', () => {
        expect(puedeOperarComoVendedorDePrueba('admin')).toBe(true)
        expect(puedeOperarComoVendedorDePrueba('VERSUS-GER')).toBe(true)
        expect(puedeOperarComoVendedorDePrueba('tester')).toBe(true)
        expect(puedeOperarComoVendedorDePrueba('vendedor')).toBe(false)
        expect(puedeOperarComoVendedorDePrueba('marketing')).toBe(false)
        expect(puedeOperarComoVendedorDePrueba('desconocido')).toBe(false)
    })

    it('superviseVendedores: gerencia sí, tester no', () => {
        expect(superviseVendedores('admin')).toBe(true)
        expect(superviseVendedores('tester')).toBe(false)
        expect(superviseVendedores('vendedor')).toBe(false)
    })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx jest src/services/planificacion/vendedorPrueba.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// src/services/planificacion/vendedorPrueba.ts
import { getRolePolicy } from '../../config/roles'

/**
 * El vendedor de prueba (spec 2026-09-17-modo-prueba-gerencia-design.md).
 *
 * El espacio de códigos de vendedor tiene un prefijo RESERVADO con dos invariantes:
 *   1. Un código con este prefijo nunca existe en el warehouse.
 *   2. Un código con este prefijo nunca entra en una agregación que cruce vendedores, ni
 *      dispara un efecto fuera de pl_* (Cromo, client-service).
 *
 * Toda guarda del dominio pregunta ACÁ. Si aparece un efecto externo nuevo o una query que
 * cruce vendedores, la pregunta obligatoria es `esVendedorDePrueba`.
 */
export const PREFIJO_VENDEDOR_PRUEBA = 'PRUEBA-'

/** Un vendedor sintético por USUARIO, no por rol: dos gerentes tienen dos pruebas distintas. */
export function codigoVendedorPrueba(userId: string): string {
    return `${PREFIJO_VENDEDOR_PRUEBA}${userId}`
}

export function esVendedorDePrueba(codigo: string): boolean {
    return codigo.startsWith(PREFIJO_VENDEDOR_PRUEBA)
}

/** Quién puede entrar a la app del vendedor sin ser vendedor: capacidad de la política. */
export function puedeOperarComoVendedorDePrueba(rol: string): boolean {
    return getRolePolicy(rol)?.operaComoVendedorDePrueba === true
}

/** Quién supervisa vendedores (analítica, ruta, agenda ajena en lectura). */
export function superviseVendedores(rol: string): boolean {
    return getRolePolicy(rol)?.superviseVendedores === true
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx jest src/services/planificacion/vendedorPrueba.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/vendedorPrueba.ts src/services/planificacion/vendedorPrueba.spec.ts
git commit -m "feat(prueba): módulo vendedorPrueba — prefijo reservado y capacidades

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `resolveSellerCode(user, opciones?)` — default al sintético, parámetro de solo lectura por scope

**Files:**
- Modify: `src/services/planificacion/sellerIdentity.ts`
- Test: `src/services/planificacion/sellerIdentity.spec.ts`

**Interfaces:**
- Consumes: `codigoVendedorPrueba`, `puedeOperarComoVendedorDePrueba`, `superviseVendedores` (Task 2);
  `SalesDataScopeResolver.resolve(user)` → `{ allowedSellerCodes: string[] | null }`.
- Produces:
  ```ts
  export interface OpcionesIdentidad {
      /** Código pedido por el front (query param `vendedor`). Solo se honra en lectura. */
      solicitado?: string | null
      /** true = el endpoint lee; false/omitido = escribe. */
      lectura?: boolean
  }
  export async function resolveSellerCode(user: IUser, opciones?: OpcionesIdentidad): Promise<string>
  ```
  Los 22 callers existentes (`resolveSellerCode(user)`) no cambian.

- [ ] **Step 1: Tests que fallan**

Reemplazar `src/services/planificacion/sellerIdentity.spec.ts` por:

```ts
import { resolveSellerCode } from './sellerIdentity'
import { SalesDataScopeResolver } from '../../business/SalesDataScope'
import { CustomError } from '../../utils/errors'

jest.mock('../../business/SalesDataScope')

const scope = (codes: string[] | null) =>
    (SalesDataScopeResolver.resolve as jest.Mock).mockResolvedValue({ allowedSellerCodes: codes })

const user = (rol: string, id = '7') => ({ id, rol } as any)

async function codigoDeError(p: Promise<unknown>): Promise<string | undefined> {
    try {
        await p
    } catch (e) {
        return (e as CustomError).code
    }
    return undefined
}

beforeEach(() => jest.clearAllMocks())

describe('resolveSellerCode — rol vendedor (sin cambios)', () => {
    it('devuelve allowedSellerCodes[0]', async () => {
        scope(['V 23'])
        expect(await resolveSellerCode(user('vendedor'))).toBe('V 23')
    })

    it('ignora el parámetro solicitado: un vendedor nunca pide otro código', async () => {
        scope(['V 23'])
        expect(await resolveSellerCode(user('vendedor'), { solicitado: 'V 2', lectura: true })).toBe('V 23')
    })

    it('con warehouse vacío sigue fallando SELLER_CODE_UNRESOLVED, nunca cae en el sintético', async () => {
        scope([])
        expect(await codigoDeError(resolveSellerCode(user('vendedor')))).toBe('SELLER_CODE_UNRESOLVED')
    })

    it('con más de un código falla SELLER_CODE_AMBIGUOUS', async () => {
        scope(['V 23', 'V 45'])
        expect(await codigoDeError(resolveSellerCode(user('vendedor')))).toBe('SELLER_CODE_AMBIGUOUS')
    })
})

describe('resolveSellerCode — roles con vendedor de prueba', () => {
    it('gerencia sin parámetro → su sintético PRUEBA-<id>', async () => {
        scope(null)
        expect(await resolveSellerCode(user('admin', '42'))).toBe('PRUEBA-42')
    })

    it('tester sin parámetro → su sintético', async () => {
        scope([])
        expect(await resolveSellerCode(user('tester', '9'))).toBe('PRUEBA-9')
    })

    it('gerencia con parámetro en lectura → ese código (scope null = todos)', async () => {
        scope(null)
        expect(await resolveSellerCode(user('versus-ger'), { solicitado: 'V 2', lectura: true })).toBe('V 2')
    })

    it('gerencia con parámetro en ESCRITURA → 403 SOLO_LECTURA_SUPERVISION', async () => {
        scope(null)
        expect(
            await codigoDeError(resolveSellerCode(user('admin'), { solicitado: 'V 2', lectura: false })),
        ).toBe('SOLO_LECTURA_SUPERVISION')
    })

    it('gerencia pidiendo su PROPIO sintético en escritura → pasa (es el suyo)', async () => {
        scope(null)
        expect(await resolveSellerCode(user('admin', '42'), { solicitado: 'PRUEBA-42' })).toBe('PRUEBA-42')
    })

    it('un rol acotado que supervisa (tv simulado) → código de su grupo sí, de otro grupo no', async () => {
        // tv hoy NO supervisa en la política; se simula el caso con un rol de gerencia y
        // scope acotado, que es exactamente lo que va a pasar cuando tv prenda la capacidad.
        scope(['V 22', 'V 23'])
        expect(await resolveSellerCode(user('supervisor'), { solicitado: 'V 23', lectura: true })).toBe('V 23')
        expect(
            await codigoDeError(resolveSellerCode(user('supervisor'), { solicitado: 'V 2', lectura: true })),
        ).toBe('VENDEDOR_FUERA_DE_SCOPE')
    })

    it('la comparación con el scope es case-insensitive (fct_clients trae mayúsculas)', async () => {
        scope(['v 23'])
        expect(await resolveSellerCode(user('supervisor'), { solicitado: 'V 23', lectura: true })).toBe('V 23')
    })

    it('tester con parámetro → lo ignora y cae en su sintético (no supervisa)', async () => {
        scope([])
        expect(await resolveSellerCode(user('tester', '9'), { solicitado: 'V 2', lectura: true })).toBe('PRUEBA-9')
    })

    it('nadie puede pedir el sintético de OTRO usuario', async () => {
        scope(null)
        expect(
            await codigoDeError(resolveSellerCode(user('admin', '42'), { solicitado: 'PRUEBA-7', lectura: true })),
        ).toBe('VENDEDOR_FUERA_DE_SCOPE')
    })
})

describe('resolveSellerCode — otros roles', () => {
    it('marketing → SELLER_CODE_UNRESOLVED aunque su scope sea unrestricted', async () => {
        scope(null)
        expect(await codigoDeError(resolveSellerCode(user('marketing')))).toBe('SELLER_CODE_UNRESOLVED')
    })

    it('client → SELLER_CODE_UNRESOLVED', async () => {
        scope(['V 2'])
        expect(await codigoDeError(resolveSellerCode(user('client')))).toBe('SELLER_CODE_UNRESOLVED')
    })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx jest src/services/planificacion/sellerIdentity.spec.ts`
Expected: FAIL en los tests de prueba (hoy `admin` lanza `SELLER_CODE_UNRESOLVED`).

- [ ] **Step 3: Implementar**

Reemplazar `src/services/planificacion/sellerIdentity.ts` por:

```ts
import { IUser } from '../../types/user'
import { SalesDataScopeResolver } from '../../business/SalesDataScope'
import { CustomError } from '../../utils/errors'
import {
    codigoVendedorPrueba,
    esVendedorDePrueba,
    puedeOperarComoVendedorDePrueba,
    superviseVendedores,
} from './vendedorPrueba'

export interface OpcionesIdentidad {
    /** Código pedido por el front (query param `vendedor`). Solo se honra en LECTURA y solo
     *  para roles que supervisan, dentro de su scope. Un vendedor lo ignora siempre. */
    solicitado?: string | null
    /** true = el endpoint lee. En escritura, pedir un código que no es el propio es 403. */
    lectura?: boolean
}

const noResuelto = () =>
    new CustomError(400, 'No se pudo resolver el código de vendedor del usuario', {
        code: 'SELLER_CODE_UNRESOLVED',
    })

/**
 * De qué vendedor son los datos que este request lee o escribe.
 *
 * Reglas, en orden (spec 2026-09-17-modo-prueba-gerencia-design.md, "Identidad"):
 *  - rol `vendedor`: por warehouse, como siempre. El parámetro se IGNORA. Con warehouse
 *    vacío falla SELLER_CODE_UNRESOLVED — nunca cae en el sintético.
 *  - rol con `operaComoVendedorDePrueba` y sin parámetro: su sintético PRUEBA-<userId>.
 *  - rol con `superviseVendedores` y con parámetro: ese código si está dentro de su
 *    allowedSellerCodes (null = todos), y SOLO en lectura. Fuera del scope → 403
 *    VENDEDOR_FUERA_DE_SCOPE; en escritura → 403 SOLO_LECTURA_SUPERVISION. Escrito sobre
 *    el SCOPE y no sobre "rol unrestricted": funciona igual para TV (tv-group).
 *  - cualquier otro rol: SELLER_CODE_UNRESOLVED.
 */
export async function resolveSellerCode(
    user: IUser,
    opciones: OpcionesIdentidad = {},
): Promise<string> {
    const rol = user.rol.toLowerCase()
    const scope = await SalesDataScopeResolver.resolve(user)

    if (rol === 'vendedor') {
        const codes = scope.allowedSellerCodes ?? []
        if (codes.length === 0) throw noResuelto()
        if (codes.length > 1) {
            throw new CustomError(
                400,
                'El usuario tiene múltiples códigos de vendedor asociados; no se puede determinar cuál usar para registrar la visita',
                { code: 'SELLER_CODE_AMBIGUOUS' },
            )
        }
        return codes[0]
    }

    const puedeProbar = puedeOperarComoVendedorDePrueba(rol)
    const supervisa = superviseVendedores(rol)
    if (!puedeProbar && !supervisa) throw noResuelto()

    const propio = puedeProbar ? codigoVendedorPrueba(user.id) : null
    const solicitado = opciones.solicitado?.trim() || null

    // Sin parámetro, o pidiendo el propio: el sintético. Un rol que supervisa pero no
    // prueba (hoy ninguno) sin parámetro no tiene a quién resolver.
    if (!solicitado || solicitado === propio) {
        if (!propio) throw noResuelto()
        return propio
    }

    // Con parámetro: solo quien supervisa lo honra; el resto (tester) lo ignora.
    if (!supervisa) {
        if (!propio) throw noResuelto()
        return propio
    }

    // Nadie mira el sintético de otro usuario, ni gerencia.
    if (esVendedorDePrueba(solicitado)) {
        throw new CustomError(403, 'No podés operar el vendedor de prueba de otro usuario.', {
            code: 'VENDEDOR_FUERA_DE_SCOPE',
        })
    }

    const permitidos = scope.allowedSellerCodes
    const enScope =
        permitidos === null ||
        permitidos.some(c => c.toUpperCase() === solicitado.toUpperCase())
    if (!enScope) {
        throw new CustomError(403, 'Este vendedor no está dentro de tu alcance.', {
            code: 'VENDEDOR_FUERA_DE_SCOPE',
        })
    }

    if (!opciones.lectura) {
        throw new CustomError(
            403,
            'Sobre otro vendedor solo podés consultar. Para editar su plan usá la ruta de gerencia.',
            { code: 'SOLO_LECTURA_SUPERVISION' },
        )
    }

    return solicitado
}
```

- [ ] **Step 4: Verificar que pasan, y que nada más se rompió**

Run: `npx jest src/services/planificacion`
Expected: PASS en todos los specs de la carpeta (los callers mockean `resolveSellerCode`, así que no
cambian).

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/sellerIdentity.ts src/services/planificacion/sellerIdentity.spec.ts
git commit -m "feat(prueba): resolveSellerCode resuelve al sintético y acepta código de solo lectura dentro del scope

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `requireVendedorEnScope` — el `:codigo` de la URL se valida contra el scope

**Files:**
- Create: `src/middleware/requireVendedorEnScope.ts`
- Test: `src/middleware/requireVendedorEnScope.spec.ts`

**Interfaces:**
- Consumes: `SalesDataScopeResolver.resolve`, `codigoVendedorPrueba`, `esVendedorDePrueba` (Task 2).
- Produces: `export const requireVendedorEnScope: (req, res, next) => Promise<void>`.

- [ ] **Step 1: Test que falla**

```ts
// src/middleware/requireVendedorEnScope.spec.ts
import { requireVendedorEnScope } from './requireVendedorEnScope'
import { SalesDataScopeResolver } from '../business/SalesDataScope'

jest.mock('../business/SalesDataScope')

function correr(codigo: string, user: any, allowed: string[] | null) {
    ;(SalesDataScopeResolver.resolve as jest.Mock).mockResolvedValue({ allowedSellerCodes: allowed })
    const req: any = { params: { codigo }, user }
    const json = jest.fn()
    const res: any = { status: jest.fn(() => ({ json })) }
    const next = jest.fn()
    return requireVendedorEnScope(req, res, next).then(() => ({ res, json, next }))
}

beforeEach(() => jest.clearAllMocks())

describe('requireVendedorEnScope', () => {
    it('unrestricted (null) pasa con cualquier código real', async () => {
        const { next } = await correr('V 2', { id: '1', rol: 'admin' }, null)
        expect(next).toHaveBeenCalledTimes(1)
    })

    it('scope acotado pasa con un código del grupo, case-insensitive', async () => {
        const { next } = await correr('v 23', { id: '1', rol: 'supervisor' }, ['V 22', 'V 23'])
        expect(next).toHaveBeenCalledTimes(1)
    })

    it('scope acotado rebota 403 VENDEDOR_FUERA_DE_SCOPE con uno de otro grupo', async () => {
        const { res, json, next } = await correr('V 2', { id: '1', rol: 'supervisor' }, ['V 22', 'V 23'])
        expect(next).not.toHaveBeenCalled()
        expect(res.status).toHaveBeenCalledWith(403)
        expect(json.mock.calls[0][0].code).toBe('VENDEDOR_FUERA_DE_SCOPE')
    })

    it('el PROPIO vendedor de prueba pasa aunque no esté en el scope (es el caso del roster de ruta)', async () => {
        const { next } = await correr('PRUEBA-42', { id: '42', rol: 'admin' }, null)
        expect(next).toHaveBeenCalledTimes(1)
    })

    it('el vendedor de prueba de OTRO usuario rebota, incluso para unrestricted', async () => {
        const { res, json } = await correr('PRUEBA-7', { id: '42', rol: 'admin' }, null)
        expect(res.status).toHaveBeenCalledWith(403)
        expect(json.mock.calls[0][0].code).toBe('VENDEDOR_FUERA_DE_SCOPE')
    })

    it('sin usuario → 401', async () => {
        const { res } = await correr('V 2', undefined, null)
        expect(res.status).toHaveBeenCalledWith(401)
    })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx jest src/middleware/requireVendedorEnScope.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// src/middleware/requireVendedorEnScope.ts
import { Request, Response, NextFunction } from 'express'
import { SalesDataScopeResolver } from '../business/SalesDataScope'
import {
    codigoVendedorPrueba,
    esVendedorDePrueba,
} from '../services/planificacion/vendedorPrueba'

/**
 * Para las rutas de gerencia `/planificacion/vendedores/:codigo/...`: el código viaja en la
 * URL y hasta ahora solo se chequeaba el ROL. Con roles de scope acotado (TV: los vendedores
 * de su grupo) eso deja editar la rotación de un vendedor ajeno cambiando la URL.
 *
 * Reglas:
 *  - `allowedSellerCodes === null` (unrestricted) pasa con cualquier código REAL.
 *  - lista: el código tiene que estar (case-insensitive, fct_clients trae mayúsculas).
 *  - el PROPIO `PRUEBA-<id>` del usuario pasa siempre (roster de ruta con "mi vendedor de
 *    prueba"); el sintético de cualquier OTRO usuario nunca, ni para unrestricted.
 *
 * Va después de authMiddleware y authorize. No reemplaza a `salesScopeMiddleware` (que valida
 * el body de ventas): son rutas distintas con contratos distintos.
 */
export const requireVendedorEnScope = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    const user = req.user
    if (!user) {
        res.status(401).json({ ok: 0, error: 'Usuario no autenticado' })
        return
    }
    const codigo = String(req.params.codigo ?? '').trim()

    if (esVendedorDePrueba(codigo)) {
        if (codigo === codigoVendedorPrueba(user.id)) {
            next()
            return
        }
        res.status(403).json({
            ok: 0,
            error: 'No podés operar el vendedor de prueba de otro usuario.',
            code: 'VENDEDOR_FUERA_DE_SCOPE',
        })
        return
    }

    try {
        const scope = await SalesDataScopeResolver.resolve(user)
        const permitidos = scope.allowedSellerCodes
        const enScope =
            permitidos === null ||
            permitidos.some(c => c.toUpperCase() === codigo.toUpperCase())
        if (!enScope) {
            res.status(403).json({
                ok: 0,
                error: 'Este vendedor no está dentro de tu alcance.',
                code: 'VENDEDOR_FUERA_DE_SCOPE',
            })
            return
        }
        next()
    } catch (err) {
        console.error('Error resolviendo scope del vendedor:', err)
        res.status(500).json({ ok: 0, error: 'Error interno al resolver permisos de datos' })
    }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx jest src/middleware/requireVendedorEnScope.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/middleware/requireVendedorEnScope.ts src/middleware/requireVendedorEnScope.spec.ts
git commit -m "feat(prueba): middleware requireVendedorEnScope para las rutas /vendedores/:codigo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Rutas — `authorizeVendedor`, `ROLES_SUPERVISAN`, scope en las 14 rutas de gerencia

**Files:**
- Modify: `src/routes/planificacion.ts` (28 rutas `authorize('vendedor')`, 14 `authorize(...ROLES_GERENCIA)`)
- Modify: `src/routes/analitica.ts` (5 rutas `authorize(...ROLES_ANALITICA)`)

**Interfaces:**
- Consumes: `ROLES_CON_VENDEDOR_DE_PRUEBA`, `ROLES_SUPERVISAN` (Task 1); `requireVendedorEnScope` (Task 4).

Este task no tiene test unitario propio (las rutas no se testean en este repo); su verificación es
`tsc` + grep + la suite completa. La autorización efectiva la cubren Tasks 1 y 4.

- [ ] **Step 1: `planificacion.ts` — imports y helpers**

Reemplazar las líneas 1-6 de `src/routes/planificacion.ts` por:

```ts
import { Request, Response, Router } from 'express'
import PlanificacionController from '../controllers/planificacionController'
import { authMiddleware } from '../middleware/auth'
import { authorize } from '../middleware/authorize'
import { requireVendedorEnScope } from '../middleware/requireVendedorEnScope'
import { ROLES_CON_VENDEDOR_DE_PRUEBA, ROLES_SUPERVISAN } from '../config/roles'

const router = Router()

// Quién puede operar como vendedor: el vendedor real, y los roles que tienen vendedor de
// prueba (gerencia, tester). Ver config/roles.ts y el spec 2026-09-17 de app-planificacion.
// `authorize` es VARIÁDICO: spread obligatorio.
const authorizeVendedor = authorize('vendedor', ...ROLES_CON_VENDEDOR_DE_PRUEBA)
```

- [ ] **Step 2: Reemplazo mecánico de las 28 rutas de vendedor**

Run (PowerShell, desde la raíz del repo):

```powershell
(Get-Content src/routes/planificacion.ts -Raw) -replace "authorize\('vendedor'\)", 'authorizeVendedor' | Set-Content src/routes/planificacion.ts -Encoding utf8 -NoNewline
```

Verificar: `grep -c "authorizeVendedor" src/routes/planificacion.ts` → 29 (28 usos + la definición).
`grep -c "authorize('vendedor')" src/routes/planificacion.ts` → 0.

- [ ] **Step 3: Las 14 rutas de gerencia**

Reemplazar el bloque (líneas ~378-382):

```ts
// ───────────────────────── Gerencia ─────────────────────────
// Los tres roles de scope unrestricted, igual que analítica. `authorize` es VARIÁDICO:
// spread obligatorio — pasarle el array compararía un array contra el string del rol y
// nunca autorizaría a nadie.
const ROLES_GERENCIA = ['admin', 'versus-ger', 'supervisor']
```

por:

```ts
// ───────────────────────── Gerencia ─────────────────────────
// Quién supervisa lo dice la política (`superviseVendedores`), no una lista acá. A CUÁLES
// vendedores, lo dice el scope: `requireVendedorEnScope` valida el `:codigo` de la URL contra
// `allowedSellerCodes` — hoy siempre pasa (todos los que supervisan son unrestricted), y el
// día que TV prenda la capacidad ya está. `authorize` es VARIÁDICO: spread obligatorio.
const authorizeSupervisor = [authorize(...ROLES_SUPERVISAN), requireVendedorEnScope]
```

Y en cada una de las 14 rutas, reemplazar `authorize(...ROLES_GERENCIA),` por `...authorizeSupervisor,`:

```powershell
(Get-Content src/routes/planificacion.ts -Raw) -replace "authorize\(\.\.\.ROLES_GERENCIA\),", '...authorizeSupervisor,' | Set-Content src/routes/planificacion.ts -Encoding utf8 -NoNewline
```

Verificar: `grep -c "\.\.\.authorizeSupervisor" src/routes/planificacion.ts` → 14.
`grep -c "ROLES_GERENCIA" src/routes/planificacion.ts` → 0.

- [ ] **Step 4: `analitica.ts`**

Reemplazar la línea `const ROLES_ANALITICA = ['admin', 'versus-ger', 'supervisor']` por:

```ts
import { ROLES_SUPERVISAN } from '../config/roles'
// Quién ve analítica lo dice la política (superviseVendedores); qué vendedores ve, el
// salesScopeMiddleware que ya va en cada ruta.
const ROLES_ANALITICA = ROLES_SUPERVISAN
```

(mover el `import` arriba, junto a los otros imports).

- [ ] **Step 5: Compilar y correr todo**

Run: `npx tsc --noEmit && npm test`
Expected: compila; suite completa PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/planificacion.ts src/routes/analitica.ts
git commit -m "feat(prueba): rutas — authorizeVendedor, ROLES_SUPERVISAN derivado y scope en /vendedores/:codigo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Guarda 1 — la analítica excluye el prefijo en un solo punto (y en la rama singular)

**Files:**
- Modify: `src/repositories/AnaliticaRepository.ts` (`fragmentoVendedores` línea ~97; rama `filtro.vendedor` línea ~266)
- Test: `src/repositories/AnaliticaRepository.spec.ts`

**Interfaces:**
- Consumes: `PREFIJO_VENDEDOR_PRUEBA` (Task 2).
- Produces: `fragmentoVendedores` devuelve `{ clausula, vendedores, prefijoPrueba }` — el replacement
  `prefijoPrueba` hay que pasarlo en TODAS las queries que usan el fragmento.

- [ ] **Step 1: Tests que fallan**

Agregar al final de `src/repositories/AnaliticaRepository.spec.ts`:

```ts
import * as fs from 'fs'
import * as path from 'path'

describe('exclusión del vendedor de prueba', () => {
    const EXCLUSION = "cs.codigo_particular_vendedor NOT LIKE :prefijoPrueba"

    it('findCobertura excluye el prefijo sin filtro de vendedores', async () => {
        mockedQuery.mockResolvedValue([])
        await AnaliticaRepository.findCobertura({ desde: '2026-08-01', hasta: '2026-08-31' })
        const [sql, options] = mockedQuery.mock.calls[0]
        expect(sql).toContain(EXCLUSION)
        expect(options.replacements.prefijoPrueba).toBe('PRUEBA-%')
    })

    it('findCobertura excluye el prefijo TAMBIÉN con lista (una lista con PRUEBA-x no lo cuela)', async () => {
        mockedQuery.mockResolvedValue([])
        await AnaliticaRepository.findCobertura({
            desde: '2026-08-01', hasta: '2026-08-31', vendedores: ['V 2', 'PRUEBA-7'],
        })
        const [sql, options] = mockedQuery.mock.calls[0]
        expect(sql).toContain('cs.codigo_particular_vendedor IN (:vendedores)')
        expect(sql).toContain(EXCLUSION)
        expect(options.replacements.prefijoPrueba).toBe('PRUEBA-%')
    })

    it('findCobertura con lista vacía sigue siendo AND 1 = 0 (no matchea nada) y excluye igual', async () => {
        mockedQuery.mockResolvedValue([])
        await AnaliticaRepository.findCobertura({ desde: '2026-08-01', hasta: '2026-08-31', vendedores: [] })
        const [sql] = mockedQuery.mock.calls[0]
        expect(sql).toContain('AND 1 = 0')
        expect(sql).toContain(EXCLUSION)
    })

    it('findVisitas con `vendedor` singular (nivel 2) TAMBIÉN excluye el prefijo', async () => {
        mockedQuery.mockResolvedValue([])
        await AnaliticaRepository.findVisitas({
            desde: '2026-08-01', hasta: '2026-08-31', vendedor: 'PRUEBA-7', pagina: 1, cant: 20,
        } as any)
        const [sql, options] = mockedQuery.mock.calls[0]
        expect(sql).toContain('cs.codigo_particular_vendedor = :vendedor')
        expect(sql).toContain(EXCLUSION)
        expect(options.replacements.prefijoPrueba).toBe('PRUEBA-%')
    })

    it('contrato: toda query por RANGO de AnaliticaRepository pasa por fragmentoVendedores', () => {
        // Las queries por id (findVisitaContext, findMotivosDeVisitas, findMotivosDeNoVisitas)
        // no cruzan vendedores y están en la lista blanca. Cualquier método nuevo que reciba
        // desde/hasta y no use el fragmento rompe este test, no la analítica.
        const fuente = fs.readFileSync(path.join(__dirname, 'AnaliticaRepository.ts'), 'utf8')
        const metodos = [...fuente.matchAll(/static async (\w+)\(([^)]*)\)[^{]*\{([\s\S]*?)\n    \}/g)]
        const listaBlanca = new Set(['findVisitaContext', 'findMotivosDeVisitas', 'findMotivosDeNoVisitas'])
        const porRango = metodos.filter(m => /desde|hasta|IFiltro/.test(m[2]) && !listaBlanca.has(m[1]))
        expect(porRango.length).toBeGreaterThanOrEqual(6)
        for (const m of porRango) {
            expect({ metodo: m[1], usaFragmento: /fragmentoVendedores\(/.test(m[3]) }).toEqual({
                metodo: m[1],
                usaFragmento: true,
            })
        }
    })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx jest src/repositories/AnaliticaRepository.spec.ts`
Expected: FAIL — el SQL no contiene `NOT LIKE :prefijoPrueba`; `findVisitas` rama singular no usa el fragmento.

- [ ] **Step 3: Implementar**

En `src/repositories/AnaliticaRepository.ts`, importar arriba:

```ts
import { PREFIJO_VENDEDOR_PRUEBA } from '../services/planificacion/vendedorPrueba'
```

Reemplazar `fragmentoVendedores` (línea ~97) por:

```ts
/**
 * El filtro por vendedor de TODA la analítica, en un solo lugar.
 *
 * Tres casos para `vendedores`: undefined = sin filtro; [] = "no matchea nada" (AND 1 = 0, nunca
 * un IN () vacío); lista = IN (:vendedores).
 *
 * Y SIEMPRE, con o sin lista, se excluye el vendedor de prueba (`PRUEBA-%`): sus filas viven en
 * pl_* como las de cualquiera pero no cuentan en ningún número de gerencia (spec 2026-09-17).
 * Con lista también, para que una lista que llegue por query param con un código de prueba
 * tampoco lo cuele. El replacement `prefijoPrueba` hay que pasarlo en cada query que use esto.
 */
function fragmentoVendedores(vendedores: string[] | undefined, alias: string) {
    const exclusion = `AND ${alias}.codigo_particular_vendedor NOT LIKE :prefijoPrueba`
    const prefijoPrueba = `${PREFIJO_VENDEDOR_PRUEBA}%`
    if (vendedores === undefined) return { clausula: exclusion, vendedores: undefined, prefijoPrueba }
    if (vendedores.length === 0) return { clausula: `AND 1 = 0 ${exclusion}`, vendedores: undefined, prefijoPrueba }
    return {
        clausula: `AND ${alias}.codigo_particular_vendedor IN (:vendedores) ${exclusion}`,
        vendedores,
        prefijoPrueba,
    }
}
```

Luego, en **cada** uso del fragmento (líneas ~124, 162, 195, 231, 272, 402), destructurar también
`prefijoPrueba` y agregarlo a los replacements. Patrón, por ejemplo en `findCobertura`:

```ts
const { clausula, vendedores, prefijoPrueba } = fragmentoVendedores(filtro.vendedores, 'cs')
// ...
replacements: { ...bordesUtc(filtro.desde, filtro.hasta), vendedores, prefijoPrueba },
```

En `findVisitas` (línea ~266), la rama singular pasa a:

```ts
if (filtro.vendedor) {
    clausulas.push('AND cs.codigo_particular_vendedor = :vendedor')
    replacements.vendedor = filtro.vendedor
    // La rama singular también excluye: sin esto, /analitica/vendedor/PRUEBA-7 mostraría
    // los datos de prueba. "No cuenta" tiene que ser literal.
    clausulas.push('AND cs.codigo_particular_vendedor NOT LIKE :prefijoPrueba')
    replacements.prefijoPrueba = `${PREFIJO_VENDEDOR_PRUEBA}%`
} else {
    const { clausula, vendedores, prefijoPrueba } = fragmentoVendedores(filtro.vendedores, 'cs')
    if (clausula) clausulas.push(clausula)
    if (vendedores) replacements.vendedores = vendedores
    replacements.prefijoPrueba = prefijoPrueba
}
```

En la query del `scope` (línea ~402): `if (scope.vendedores) replacements.vendedores = scope.vendedores`
más `replacements.prefijoPrueba = scope.prefijoPrueba`.

- [ ] **Step 4: Verificar**

Run: `npx jest src/repositories/AnaliticaRepository.spec.ts`
Expected: PASS. **Ojo:** los tests preexistentes que hacen `expect(options.replacements).toEqual({ desde, hastaExclusiva, vendedores: undefined })` ahora fallan por la clave nueva: actualizarlos agregando `prefijoPrueba: 'PRUEBA-%'` al objeto esperado (es el único cambio permitido en tests viejos).

- [ ] **Step 5: Commit**

```bash
git add src/repositories/AnaliticaRepository.ts src/repositories/AnaliticaRepository.spec.ts
git commit -m "feat(prueba): la analítica excluye PRUEBA-% en fragmentoVendedores y en la rama singular

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Guarda 2a — Cromo no recibe nada del vendedor de prueba

**Files:**
- Modify: `src/services/crm/CrmEventoVisitaService.ts` (dentro de `notificar`, después del guard `yaSeEnvioSeguimiento`)
- Modify: `src/services/crm/seguimientoMensaje.ts`
- Test: `src/services/crm/CrmEventoVisitaService.spec.ts`, `src/services/crm/seguimientoMensaje.spec.ts` (crear si no existe)

**Interfaces:**
- Consumes: `esVendedorDePrueba` (Task 2).

- [ ] **Step 1: Tests que fallan**

Abrir `src/services/crm/CrmEventoVisitaService.spec.ts`, copiar el patrón de mocks que ya usa el
archivo (mockea `VendedorCromoRepository`, `ResolucionRepository`, `CromoHttpClient`, etc.) y agregar
un `describe`:

```ts
describe('vendedor de prueba', () => {
    it('marca MODO_PRUEBA, no consulta el mapeo y no llama a Cromo', async () => {
        ;(ResolucionRepository.yaSeEnvioSeguimiento as jest.Mock).mockResolvedValue(false)
        const res = await CrmEventoVisitaService.notificar({
            vendedorCode: 'PRUEBA-7',
            resolucion: { id: 99, tipo: 'visita', rotacionClienteId: 1 } as any,
            fila: { id: 1, tipo: 'cliente', codigoParticularCliente: '06836' } as any,
        })
        expect(res).toEqual({ enviado: false, motivo: 'MODO_PRUEBA' })
        expect(ResolucionRepository.marcarSeguimientoPendiente).toHaveBeenCalledWith(99, 'MODO_PRUEBA', '')
        expect(VendedorCromoRepository.findByVendedor).not.toHaveBeenCalled()
        expect(CromoHttpClient.requestAsService).not.toHaveBeenCalled()
    })

    it('si ya se envió (backstop), gana YA_ENVIADO aunque sea de prueba', async () => {
        ;(ResolucionRepository.yaSeEnvioSeguimiento as jest.Mock).mockResolvedValue(true)
        const res = await CrmEventoVisitaService.notificar({
            vendedorCode: 'PRUEBA-7',
            resolucion: { id: 99, tipo: 'visita', rotacionClienteId: 1 } as any,
            fila: { id: 1, tipo: 'cliente', codigoParticularCliente: '06836' } as any,
        })
        expect(res.motivo).toBe('YA_ENVIADO')
    })
})
```

Y para el mensaje, `src/services/crm/seguimientoMensaje.spec.ts` (crear si no existe; si existe,
agregar el `it`):

```ts
import { mensajeDeSeguimiento } from './seguimientoMensaje'

it('MODO_PRUEBA tiene su propio mensaje, que dice que reintentar no sirve', () => {
    expect(mensajeDeSeguimiento('MODO_PRUEBA')).toBe('En modo prueba el seguimiento no se manda a Cromo.')
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx jest src/services/crm`
Expected: FAIL — `notificar` sigue hasta el mapeo y devuelve `VENDEDOR_SIN_MAPEO`; el mensaje es el genérico.

- [ ] **Step 3: Implementar**

En `CrmEventoVisitaService.ts`, importar `import { esVendedorDePrueba } from '../planificacion/vendedorPrueba'`
y, dentro de `notificar`, inmediatamente después del bloque `if (await ResolucionRepository.yaSeEnvioSeguimiento(...))`:

```ts
            // Vendedor de prueba: el hecho existe en pl_* pero nunca sale a Cromo. Hoy
            // igual no saldría (PRUEBA-* no tiene fila en pl_vendedor_cromo), pero se hace
            // explícito para que el estado diga la verdad y no parezca un error de
            // configuración. El reintento manual pasa por acá y devuelve lo mismo.
            if (esVendedorDePrueba(vendedorCode)) {
                await ResolucionRepository.marcarSeguimientoPendiente(resolucion.id, 'MODO_PRUEBA', '')
                return { enviado: false, motivo: 'MODO_PRUEBA' }
            }
```

En `seguimientoMensaje.ts`, agregar a `MENSAJE_POR_MOTIVO`:

```ts
    // Reintentar NO sirve, y no es un problema: es la salida esperada del vendedor de prueba.
    MODO_PRUEBA: 'En modo prueba el seguimiento no se manda a Cromo.',
```

- [ ] **Step 4: Verificar**

Run: `npx jest src/services/crm`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crm
git commit -m "feat(prueba): Cromo — guarda MODO_PRUEBA en notificar y mensaje propio

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Guarda 2b y 3 — client-service no se toca, y el cupo ignora la prueba

**Files:**
- Modify: `src/services/planificacion/VisitasService.ts` (`iniciar`, línea ~124)
- Modify: `src/repositories/ResolucionRepository.ts` (`contarCoordClienteAjustada`, línea ~136)
- Test: `src/services/planificacion/VisitasService.spec.ts`, `src/repositories/ResolucionRepository.spec.ts`

**Interfaces:**
- Consumes: `esVendedorDePrueba`; `RotacionRepository.findById(rotacionId)` → `IRotacion` (para saber
  de qué vendedor es la fila sin resolver identidad de nuevo).

- [ ] **Step 1: Tests que fallan**

En `VisitasService.spec.ts`, ubicar el `describe` de `iniciar` con `coordCliente` (busca
`ClientServiceCoordPatchService.aplicar`) y agregar:

```ts
    it('vendedor de prueba con coordCliente: guarda la efímera, NO llama a client-service, correccionPermanenteAplicada=false', async () => {
        mockedFilaById.mockResolvedValue({ id: 10, rotacionId: 5, codigoParticularCliente: '06836', tipo: 'cliente' } as any)
        ;(RotacionRepository.findById as jest.Mock).mockResolvedValue({ id: 5, codigoParticularVendedor: 'PRUEBA-7' })
        ;(ResolucionRepository.findByCicloClienteId as jest.Mock).mockResolvedValue(null)
        ;(getCoordCliente as jest.Mock).mockResolvedValue('-34.6,-58.4')
        mockedCrearResolucion.mockResolvedValue(77)
        ;(OfrecimientoRepository.crearMuchos as jest.Mock).mockResolvedValue(undefined)
        ;(RubroDropsService.query as jest.Mock).mockResolvedValue({ rubros: [] })

        const res = await VisitasService.iniciar({ id: '7', rol: 'admin' } as any, {
            rotacionClienteId: 10,
            coordInicio: '-34.61,-58.41',
            coordCliente: '-34.62,-58.42',
        } as any)

        expect(mockedCrearResolucion).toHaveBeenCalledWith(
            expect.objectContaining({ coordCliente: '-34.62,-58.42', coordClienteAjustada: true }),
            expect.anything(),
        )
        expect(ResolucionRepository.contarCoordClienteAjustada).not.toHaveBeenCalled()
        expect(ClientServiceCoordPatchService.aplicar).not.toHaveBeenCalled()
        expect(res.correccionPermanenteAplicada).toBe(false)
    })
```

(Ajustar los nombres de mocks a los que ya existen en el archivo: `mockedFilaById`,
`mockedCrearResolucion`, etc. Si `resolverFilaDelPlan` requiere `CicloService.requireCicloAbierto`,
mockear como hacen los tests vecinos de `iniciar`.)

En `ResolucionRepository.spec.ts`, agregar:

```ts
describe('contarCoordClienteAjustada', () => {
    it('cuenta solo filas de rotaciones que NO son de prueba', async () => {
        const spy = jest.spyOn(sequelizeWritePlanificacion, 'query').mockResolvedValue([{ total: 2 }] as any)
        const n = await ResolucionRepository.contarCoordClienteAjustada('06836')
        expect(n).toBe(2)
        const [sql, options] = spy.mock.calls[0] as any
        expect(sql).toContain('JOIN pl_rotacion ro ON ro.id = rc.rotacion_id')
        expect(sql).toContain('ro.codigo_particular_vendedor NOT LIKE :prefijoPrueba')
        expect(options.replacements).toEqual({ codigo: '06836', prefijoPrueba: 'PRUEBA-%' })
        spy.mockRestore()
    })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx jest src/services/planificacion/VisitasService.spec.ts src/repositories/ResolucionRepository.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `VisitasService.ts`, importar `import { esVendedorDePrueba } from './vendedorPrueba'` y reemplazar
el bloque de corrección permanente (línea ~123) por:

```ts
        // Corrección PERMANENTE en client-service, best-effort — DESPUÉS de que la
        // visita ya quedó creada. [comentario existente, se conserva]
        // `&& !esVendedorDePrueba(...)`: la prueba corrige la coordenada EFÍMERA (queda en
        // pl_resolucion, el gate se destraba) pero jamás la ficha real del cliente.
        // Tampoco consulta el cupo: no lo consume ni lo lee.
        let correccionPermanenteAplicada: boolean | undefined
        if (coordClienteAjustada && !esAlta) {
            const rotacion = await RotacionRepository.findById(fila.rotacionId)
            const dePrueba = rotacion ? esVendedorDePrueba(rotacion.codigoParticularVendedor) : false
            if (dePrueba) {
                correccionPermanenteAplicada = false
            } else {
                const correccionesPrevias = await ResolucionRepository.contarCoordClienteAjustada(
                    fila.codigoParticularCliente,
                )
                if (correccionesPrevias < LIMITE_CORRECCIONES_COORD_CLIENTE) {
                    const [lat, lng] = dto.coordCliente!.split(',').map(Number)
                    correccionPermanenteAplicada = await ClientServiceCoordPatchService.aplicar(
                        fila.codigoParticularCliente,
                        lat,
                        lng,
                    )
                } else {
                    correccionPermanenteAplicada = false
                }
            }
        }
```

En `ResolucionRepository.ts`, importar `PREFIJO_VENDEDOR_PRUEBA` desde
`'../services/planificacion/vendedorPrueba'` y reemplazar la query de `contarCoordClienteAjustada`:

```ts
            const rows = await sequelizeWritePlanificacion.query<{ total: number }>(
                `SELECT COUNT(*) AS total
                   FROM pl_resolucion r
                   JOIN pl_rotacion_cliente rc ON rc.id = r.rotacion_cliente_id
                   JOIN pl_rotacion ro ON ro.id = rc.rotacion_id
                  WHERE rc.codigo_particular_cliente = :codigo
                    AND r.coord_cliente_ajustada = 1
                    AND ro.codigo_particular_vendedor NOT LIKE :prefijoPrueba`,
                {
                    replacements: { codigo: codigoParticularCliente, prefijoPrueba: `${PREFIJO_VENDEDOR_PRUEBA}%` },
                    type: QueryTypes.SELECT,
                },
            )
```

Actualizar el docblock: "Tres reposicionamientos en modo prueba no le agotan el cupo a un vendedor
real: los datos de prueba no influyen en decisiones sobre datos reales."

- [ ] **Step 4: Verificar**

Run: `npx jest src/services/planificacion/VisitasService.spec.ts src/repositories/ResolucionRepository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/VisitasService.ts src/services/planificacion/VisitasService.spec.ts src/repositories/ResolucionRepository.ts src/repositories/ResolucionRepository.spec.ts
git commit -m "feat(prueba): sin PATCH a client-service para el vendedor de prueba; el cupo lo ignora

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Cartera del vendedor de prueba = todo el padrón (`carteraDe` + búsqueda server-side)

**Files:**
- Modify (aditivo): `src/repositories/ClientRepository.ts` — dos métodos nuevos al final de la clase
- Create: `src/services/planificacion/carteraDe.ts`
- Modify: `src/services/planificacion/BuscadorService.ts` (línea ~148), `BuscadorCarteraService.ts` (líneas ~54 y ~139)
- Test: `src/services/planificacion/carteraDe.spec.ts`, `src/repositories/ClientRepository.spec.ts`, specs de buscador existentes

**Interfaces:**
- Produces:
  ```ts
  // ClientRepository
  static async buscarEnPadron(texto: string, limite: number): Promise<ClientBasicInfo[]>
  static async existeEnPadron(particularCode: string): Promise<boolean>
  // carteraDe.ts
  export const LIMITE_BUSQUEDA_PRUEBA = 50
  export async function buscarEnCartera(vendedor: string, texto: string): Promise<ClientBasicInfo[]>
  export async function estaEnCartera(vendedor: string, codigoCliente: string): Promise<boolean>
  ```

- [ ] **Step 1: Tests que fallan**

`src/services/planificacion/carteraDe.spec.ts`:

```ts
import { buscarEnCartera, estaEnCartera, LIMITE_BUSQUEDA_PRUEBA } from './carteraDe'
import { ClientRepository } from '../../repositories/ClientRepository'

jest.mock('../../repositories/ClientRepository')

const cliente = (cod: string, nombre: string) =>
    ({ CODIGOPARTICULAR: cod, RAZONSOCIAL: nombre } as any)

beforeEach(() => jest.clearAllMocks())

describe('buscarEnCartera', () => {
    it('vendedor real: cartera por getByVendor y filtro en memoria (como antes)', async () => {
        ;(ClientRepository.getByVendor as jest.Mock).mockResolvedValue([
            cliente('06836', 'FIORENZA'), cliente('07000', 'ALMACÉN DON JOSÉ'),
        ])
        const r = await buscarEnCartera('V 2', 'fior')
        expect(ClientRepository.getByVendor).toHaveBeenCalledWith('V 2')
        expect(ClientRepository.buscarEnPadron).not.toHaveBeenCalled()
        expect(r.map(c => c.CODIGOPARTICULAR)).toEqual(['06836'])
    })

    it('vendedor de prueba: búsqueda server-side sobre TODO el padrón, con límite', async () => {
        ;(ClientRepository.buscarEnPadron as jest.Mock).mockResolvedValue([cliente('11132', 'X')])
        const r = await buscarEnCartera('PRUEBA-7', 'x')
        expect(ClientRepository.getByVendor).not.toHaveBeenCalled()
        expect(ClientRepository.buscarEnPadron).toHaveBeenCalledWith('x', LIMITE_BUSQUEDA_PRUEBA)
        expect(r).toHaveLength(1)
    })
})

describe('estaEnCartera', () => {
    it('vendedor real: getByVendor(vendedor, codigo) no vacío', async () => {
        ;(ClientRepository.getByVendor as jest.Mock).mockResolvedValue([cliente('06836', 'F')])
        expect(await estaEnCartera('V 2', '06836')).toBe(true)
        expect(ClientRepository.getByVendor).toHaveBeenCalledWith('V 2', '06836')
    })

    it('vendedor de prueba: basta con que exista en el padrón', async () => {
        ;(ClientRepository.existeEnPadron as jest.Mock).mockResolvedValue(true)
        expect(await estaEnCartera('PRUEBA-7', '11132')).toBe(true)
        expect(ClientRepository.getByVendor).not.toHaveBeenCalled()
    })
})
```

En `src/repositories/ClientRepository.spec.ts` (copiar el patrón de mock de `warehouseQuery` que ya
usa el archivo) agregar:

```ts
describe('buscarEnPadron / existeEnPadron (solo lectura)', () => {
    it('buscarEnPadron arma ILIKE sobre nombre y código con LIMIT', async () => {
        mockedWarehouseQuery.mockResolvedValue([])
        await ClientRepository.buscarEnPadron('fior', 50)
        const [sql, params] = mockedWarehouseQuery.mock.calls[0]
        expect(sql).toMatch(/business_name ILIKE \$1 OR particular_code ILIKE \$1/)
        expect(sql).toMatch(/LIMIT \$2/)
        expect(sql).not.toMatch(/INSERT|UPDATE|DELETE/i)
        expect(params).toEqual(['%fior%', 50])
    })

    it('existeEnPadron devuelve true si hay fila', async () => {
        mockedWarehouseQuery.mockResolvedValue([{ particular_code: '06836' }])
        expect(await ClientRepository.existeEnPadron('06836')).toBe(true)
    })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx jest src/services/planificacion/carteraDe.spec.ts src/repositories/ClientRepository.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar — `ClientRepository` (aditivo, al final de la clase, antes de `// Type definitions`)**

```ts
    /**
     * Búsqueda por texto sobre TODO el padrón, con límite. La usa SOLO la cartera del
     * vendedor de prueba (services/planificacion/carteraDe.ts): su cartera es toda la
     * base, y cargarla entera para filtrar en memoria (lo que hace el buscador real con
     * getByVendor) no sirve. Lectura pura; el warehouse no se toca.
     */
    static async buscarEnPadron(texto: string, limite: number): Promise<ClientBasicInfo[]> {
        const rows = await warehouseQuery<FctClientRow>(
            `SELECT ${ClientRepository.BASE_COLUMNS}
             FROM ${CLIENTS_TABLE}
             WHERE particular_code IS NOT NULL
               AND (business_name ILIKE $1 OR particular_code ILIKE $1)
             ORDER BY business_name
             LIMIT $2`,
            [`%${texto}%`, limite],
        )
        return rows
            .filter(r => !ClientRepository.EXCLUDED_CLIENTS.includes(r.client_code))
            .map(ClientRepository.toBasicInfo)
    }

    /** ¿El código particular existe en fct_clients? Para validar "agregar al plan" en prueba. */
    static async existeEnPadron(particularCode: string): Promise<boolean> {
        const rows = await warehouseQuery<{ particular_code: string }>(
            `SELECT particular_code FROM ${CLIENTS_TABLE} WHERE particular_code = $1 LIMIT 1`,
            [particularCode],
        )
        return rows.length > 0
    }
```

- [ ] **Step 4: Implementar — `carteraDe.ts`**

```ts
// src/services/planificacion/carteraDe.ts
import { ClientRepository, ClientBasicInfo } from '../../repositories/ClientRepository'
import { filtrarPorTexto } from './buscadorCartera'
import { esVendedorDePrueba } from './vendedorPrueba'

/** Un autocompletar no necesita más; toda la base son miles de filas. */
export const LIMITE_BUSQUEDA_PRUEBA = 50

/**
 * De qué clientes es "la cartera" de un vendedor, para el buscador y para "agregar al plan".
 *
 * Vendedor real: su cartera del warehouse (`vendor_code = :codigo`), filtrada en memoria
 * como siempre. Vendedor de prueba: TODA la base — su código no existe en el warehouse, y
 * la restricción de cartera existe para que un vendedor no se meta clientes ajenos, cosa
 * que en prueba no tiene sentido. Es el `unrestricted` que su rol ya tiene, llevado a
 * planificación. Spec 2026-09-17, sección "Cartera".
 */
export async function buscarEnCartera(vendedor: string, texto: string): Promise<ClientBasicInfo[]> {
    if (esVendedorDePrueba(vendedor)) {
        return ClientRepository.buscarEnPadron(texto, LIMITE_BUSQUEDA_PRUEBA)
    }
    const clientes = await ClientRepository.getByVendor(vendedor)
    return filtrarPorTexto(clientes, texto)
}

export async function estaEnCartera(vendedor: string, codigoCliente: string): Promise<boolean> {
    if (esVendedorDePrueba(vendedor)) {
        return ClientRepository.existeEnPadron(codigoCliente)
    }
    const enCartera = await ClientRepository.getByVendor(vendedor, codigoCliente)
    return enCartera.length > 0
}
```

- [ ] **Step 5: Usar el seam en los dos buscadores**

`BuscadorService.buscarEnCartera` (línea ~148): reemplazar

```ts
            const clientes = await ClientRepository.getByVendor(vendedor)
            return filtrarPorTexto(clientes, texto).map(sinPlan)
```
por
```ts
            const clientes = await buscarEnCartera(vendedor, texto)
            return clientes.map(sinPlan)
```
(importar `buscarEnCartera` desde `'./carteraDe'`; quitar el import de `ClientRepository` si queda sin uso).

`BuscadorCarteraService.buscarEnCartera` (línea ~54): reemplazar

```ts
        const clientes = await ClientRepository.getByVendor(vendedor)
        const filtrados = filtrarPorTexto(clientes, texto)
```
por
```ts
        const filtrados = await buscarEnCartera(vendedor, texto)
```

`BuscadorCarteraService.agregarExtra` (línea ~139): reemplazar

```ts
        const enCartera = await ClientRepository.getByVendor(vendedor, codigoCliente)
        if (enCartera.length === 0) {
```
por
```ts
        if (!(await estaEnCartera(vendedor, codigoCliente))) {
```

Actualizar los specs de esos dos servicios: donde mockeaban `ClientRepository.getByVendor` para la
búsqueda, ahora mockear `'./carteraDe'` (`jest.mock('./carteraDe')`) y setear `buscarEnCartera` /
`estaEnCartera`. Mantener el resto de aserciones.

- [ ] **Step 6: Verificar**

Run: `npx jest src/services/planificacion src/repositories/ClientRepository.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/repositories/ClientRepository.ts src/repositories/ClientRepository.spec.ts src/services/planificacion/carteraDe.ts src/services/planificacion/carteraDe.spec.ts src/services/planificacion/BuscadorService.ts src/services/planificacion/BuscadorService.spec.ts src/services/planificacion/BuscadorCarteraService.ts src/services/planificacion/BuscadorCarteraService.spec.ts
git commit -m "feat(prueba): la cartera del vendedor de prueba es todo el padrón (seam carteraDe)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `materializar(vendedor, transaction?, plantillaDe?)`

**Files:**
- Modify: `src/services/planificacion/RotacionService.ts` (`leerTemplate` línea ~62, `materializar` línea ~112)
- Test: `src/services/planificacion/RotacionService.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  static async leerTemplate(vendedor: string, plantillaDe?: string): Promise<{ validas; omitidos; repetidos }>
  static async materializar(vendedor: string, transaction?: Transaction, plantillaDe?: string): Promise<number>
  ```
  Sin `plantillaDe`, comportamiento idéntico al actual (los callers existentes no cambian).

- [ ] **Step 1: Tests que fallan**

Agregar a `RotacionService.spec.ts`, dentro de un `describe('materializar con plantillaDe', ...)`:

```ts
    it('lee el template del ORIGEN y crea la rotación a nombre del vendedor', async () => {
        mockedAssignments.mockReturnValue([{ codigoParticularCliente: '06836', visit: 's1d1' }])
        mockedCards.mockResolvedValue(new Map([card('06836')]))
        ;(RotacionRepository.findUltimaConSemanas as jest.Mock).mockResolvedValue(null)
        mockedCrearRotacion.mockResolvedValue(500)

        const id = await RotacionService.materializar('PRUEBA-7', undefined, 'V 2')

        expect(id).toBe(500)
        expect(mockedAssignments).toHaveBeenCalledWith('V 2')
        expect(mockedCrearRotacion).toHaveBeenCalledWith('PRUEBA-7', undefined)
        expect(mockedCrearMuchos).toHaveBeenCalledWith(500, [{ codigoParticularCliente: '06836', semana: 1, dia: 1 }], undefined)
    })

    it('hereda los nombres de zona de la última rotación del ORIGEN, no del vendedor', async () => {
        mockedAssignments.mockReturnValue([{ codigoParticularCliente: '06836', visit: 's3d2' }])
        mockedCards.mockResolvedValue(new Map([card('06836')]))
        ;(RotacionRepository.findUltimaConSemanas as jest.Mock).mockResolvedValue(88)
        ;(RotacionSemanaRepository.findDescripciones as jest.Mock).mockResolvedValue(new Map([[3, 'Zárate']]))
        mockedCrearRotacion.mockResolvedValue(501)

        await RotacionService.materializar('PRUEBA-7', undefined, 'V 2')

        expect(RotacionRepository.findUltimaConSemanas).toHaveBeenCalledWith('V 2')
        expect(RotacionSemanaRepository.crearMuchas).toHaveBeenCalledWith(
            501, [{ semana: 3, descripcion: 'Zárate' }], undefined,
        )
    })

    it('sin plantillaDe se comporta como siempre (template y herencia del propio vendedor)', async () => {
        mockedAssignments.mockReturnValue([{ codigoParticularCliente: '06836', visit: 's1d1' }])
        mockedCards.mockResolvedValue(new Map([card('06836')]))
        ;(RotacionRepository.findUltimaConSemanas as jest.Mock).mockResolvedValue(null)
        mockedCrearRotacion.mockResolvedValue(502)

        await RotacionService.materializar('V 2')

        expect(mockedAssignments).toHaveBeenCalledWith('V 2')
        expect(RotacionRepository.findUltimaConSemanas).toHaveBeenCalledWith('V 2')
    })
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx jest src/services/planificacion/RotacionService.spec.ts`
Expected: FAIL (`materializar` ignora el tercer argumento; `findVisitAssignments` se llama con `PRUEBA-7`).

- [ ] **Step 3: Implementar**

`leerTemplate`:

```ts
    static async leerTemplate(
        vendedor: string,
        /** Vendedor cuyo template se copia. Default: el propio. Lo usa el vendedor de prueba
         *  para arrancar como FOTO del plan de un vendedor real (spec 2026-09-17). */
        plantillaDe: string = vendedor,
    ): Promise<{ validas: PlanItem[]; omitidos: string[]; repetidos: string[] }> {
        const asignaciones = AgendaRepository.findVisitAssignments(plantillaDe)
        // ... resto idéntico; en el logger.warn agregar `plantillaDe` al payload
```

`materializar`:

```ts
    static async materializar(
        vendedor: string,
        transaction?: Transaction,
        plantillaDe: string = vendedor,
    ): Promise<number> {
        const { validas } = await RotacionService.leerTemplate(vendedor, plantillaDe)
        // ... el 422 ROTACION_SIN_CLIENTES igual ...
        // Los nombres de zona se heredan de la última rotación de QUIEN aporta el template:
        // para un vendedor real es él mismo (como siempre); para el vendedor de prueba es el
        // origen, así la prueba dice "Zárate" y no "Zona 3".
        const previa = await RotacionRepository.findUltimaConSemanas(plantillaDe)
        // ... resto idéntico (crear, crearMuchos, crearMuchas) ...
```

- [ ] **Step 4: Verificar**

Run: `npx jest src/services/planificacion/RotacionService.spec.ts`
Expected: PASS (nuevos y preexistentes).

- [ ] **Step 5: Commit**

```bash
git add src/services/planificacion/RotacionService.ts src/services/planificacion/RotacionService.spec.ts
git commit -m "feat(prueba): materializar acepta plantillaDe para copiar el plan de otro vendedor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: `VendedorPruebaRepository.borrarTodo` — once DELETE, hoja a raíz, en transacción

**Files:**
- Create: `src/repositories/VendedorPruebaRepository.ts`
- Test: `src/repositories/VendedorPruebaRepository.spec.ts`

**Interfaces:**
- Produces: `static async borrarTodo(codigo: string, transaction: Transaction): Promise<void>`.
  Lanza `CustomError(500, ..., { code: 'NO_ES_VENDEDOR_DE_PRUEBA' })` si el código no lleva el prefijo.

- [ ] **Step 1: Test que falla**

```ts
// src/repositories/VendedorPruebaRepository.spec.ts
import { VendedorPruebaRepository, TABLAS_BORRADAS_EN_ORDEN } from './VendedorPruebaRepository'
import { sequelizeWritePlanificacion } from '../database/connection'
import { CustomError } from '../utils/errors'

let mockedQuery: jest.MockedFunction<any>
beforeAll(() => {
    mockedQuery = jest.spyOn(sequelizeWritePlanificacion, 'query') as jest.MockedFunction<any>
})
beforeEach(() => jest.clearAllMocks())

const tx = { id: 'tx' } as any

describe('borrarTodo', () => {
    it('rechaza un código que no es de prueba, SIN tocar la base (doble candado)', async () => {
        await expect(VendedorPruebaRepository.borrarTodo('V 2', tx)).rejects.toMatchObject({
            code: 'NO_ES_VENDEDOR_DE_PRUEBA',
        } as Partial<CustomError>)
        expect(mockedQuery).not.toHaveBeenCalled()
    })

    it('borra las once tablas en orden hoja→raíz, todas filtradas por el código, en la transacción', async () => {
        mockedQuery.mockResolvedValue(undefined)
        await VendedorPruebaRepository.borrarTodo('PRUEBA-7', tx)

        expect(mockedQuery).toHaveBeenCalledTimes(TABLAS_BORRADAS_EN_ORDEN.length)
        expect(TABLAS_BORRADAS_EN_ORDEN).toEqual([
            'pl_ofrecimiento_alcance',
            'pl_ofrecimiento_motivo_campo',
            'pl_ofrecimiento_motivo',
            'pl_ofrecimiento',
            'pl_resolucion_motivo',
            'pl_resolucion',
            'pl_reacomodacion',
            'pl_rotacion_cliente',
            'pl_rotacion_semana',
            'pl_ciclo_semana',
            'pl_rotacion',
        ])
        mockedQuery.mock.calls.forEach(([sql, options], i) => {
            expect(sql).toMatch(new RegExp(`^\\s*DELETE .*${TABLAS_BORRADAS_EN_ORDEN[i]}`, 's'))
            expect(sql).toContain('codigo_particular_vendedor = :codigo')
            expect(options.replacements).toEqual({ codigo: 'PRUEBA-7' })
            expect(options.transaction).toBe(tx)
        })
    })

    it('ningún catálogo aparece en el borrado', () => {
        for (const t of ['pl_motivo', 'pl_motivo_campo', 'pl_accion', 'pl_objetivo', 'pl_vendedor_cromo']) {
            expect(TABLAS_BORRADAS_EN_ORDEN).not.toContain(t)
        }
    })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx jest src/repositories/VendedorPruebaRepository.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// src/repositories/VendedorPruebaRepository.ts
import { QueryTypes, Transaction } from 'sequelize'
import { sequelizeWritePlanificacion } from '../database/connection'
import { CustomError } from '../utils/errors'
import { esVendedorDePrueba } from '../services/planificacion/vendedorPrueba'

/**
 * El ÚNICO borrado masivo del dominio: todo lo de UN vendedor de prueba.
 *
 * El DDL no tiene ON DELETE CASCADE, así que el orden es explícito, de hoja a raíz. Cada
 * DELETE termina en `codigo_particular_vendedor = :codigo` (directo en pl_ciclo_semana y
 * pl_rotacion, vía JOIN a pl_rotacion en el resto). Los catálogos (pl_motivo, pl_motivo_campo,
 * pl_accion, pl_objetivo, pl_vendedor_cromo) no cuelgan del vendedor y no se tocan.
 *
 * Doble candado: aunque el código venga de la identidad (req.user), se vuelve a verificar
 * el prefijo acá. Un bug arriba no puede convertir esto en el borrado de un vendedor real.
 */
export const TABLAS_BORRADAS_EN_ORDEN = [
    'pl_ofrecimiento_alcance',
    'pl_ofrecimiento_motivo_campo',
    'pl_ofrecimiento_motivo',
    'pl_ofrecimiento',
    'pl_resolucion_motivo',
    'pl_resolucion',
    'pl_reacomodacion',
    'pl_rotacion_cliente',
    'pl_rotacion_semana',
    'pl_ciclo_semana',
    'pl_rotacion',
] as const

const DESDE_ROTACION = `JOIN pl_rotacion ro ON ro.id = rc.rotacion_id WHERE ro.codigo_particular_vendedor = :codigo`
const DESDE_RESOLUCION = `JOIN pl_rotacion_cliente rc ON rc.id = r.rotacion_cliente_id ${DESDE_ROTACION}`
const DESDE_OFRECIMIENTO = `JOIN pl_resolucion r ON r.id = o.resolucion_id ${DESDE_RESOLUCION}`

const SQL: Record<(typeof TABLAS_BORRADAS_EN_ORDEN)[number], string> = {
    pl_ofrecimiento_alcance: `DELETE x FROM pl_ofrecimiento_alcance x JOIN pl_ofrecimiento o ON o.id = x.ofrecimiento_id ${DESDE_OFRECIMIENTO}`,
    pl_ofrecimiento_motivo_campo: `DELETE x FROM pl_ofrecimiento_motivo_campo x JOIN pl_ofrecimiento o ON o.id = x.ofrecimiento_id ${DESDE_OFRECIMIENTO}`,
    pl_ofrecimiento_motivo: `DELETE x FROM pl_ofrecimiento_motivo x JOIN pl_ofrecimiento o ON o.id = x.ofrecimiento_id ${DESDE_OFRECIMIENTO}`,
    pl_ofrecimiento: `DELETE o FROM pl_ofrecimiento o ${DESDE_OFRECIMIENTO}`,
    pl_resolucion_motivo: `DELETE x FROM pl_resolucion_motivo x JOIN pl_resolucion r ON r.id = x.resolucion_id ${DESDE_RESOLUCION}`,
    pl_resolucion: `DELETE r FROM pl_resolucion r ${DESDE_RESOLUCION}`,
    pl_reacomodacion: `DELETE x FROM pl_reacomodacion x JOIN pl_rotacion_cliente rc ON rc.id = x.rotacion_cliente_id ${DESDE_ROTACION}`,
    pl_rotacion_cliente: `DELETE rc FROM pl_rotacion_cliente rc ${DESDE_ROTACION}`,
    pl_rotacion_semana: `DELETE x FROM pl_rotacion_semana x JOIN pl_rotacion ro ON ro.id = x.rotacion_id WHERE ro.codigo_particular_vendedor = :codigo`,
    pl_ciclo_semana: `DELETE FROM pl_ciclo_semana WHERE codigo_particular_vendedor = :codigo`,
    pl_rotacion: `DELETE FROM pl_rotacion WHERE codigo_particular_vendedor = :codigo`,
}

export class VendedorPruebaRepository {
    static async borrarTodo(codigo: string, transaction: Transaction): Promise<void> {
        if (!esVendedorDePrueba(codigo)) {
            throw new CustomError(500, 'Invariante violada: se intentó borrar un vendedor que no es de prueba.', {
                code: 'NO_ES_VENDEDOR_DE_PRUEBA',
            })
        }
        try {
            for (const tabla of TABLAS_BORRADAS_EN_ORDEN) {
                await sequelizeWritePlanificacion.query(SQL[tabla], {
                    replacements: { codigo },
                    type: QueryTypes.DELETE,
                    transaction,
                })
            }
        } catch (err) {
            throw new CustomError(500, `Error borrando el vendedor de prueba: ${err}`)
        }
    }
}
```

- [ ] **Step 4: Verificar**

Run: `npx jest src/repositories/VendedorPruebaRepository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repositories/VendedorPruebaRepository.ts src/repositories/VendedorPruebaRepository.spec.ts
git commit -m "feat(prueba): VendedorPruebaRepository.borrarTodo — once tablas hoja→raíz con doble candado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: `VendedorPruebaService` — `reiniciar(user, origen?)` y `me(user)`

**Files:**
- Create: `src/services/planificacion/VendedorPruebaService.ts`
- Test: `src/services/planificacion/VendedorPruebaService.spec.ts`
- Modify: `src/types/planificacion.ts` (tipos de respuesta)

**Interfaces:**
- Consumes: `VendedorPruebaRepository.borrarTodo` (Task 11); `RotacionService.materializar(v, tx, plantillaDe)`
  (Task 10); `RotacionRepository.crear`/`editarDescripcion`/`findAbiertaByVendedor`;
  `RotacionSemanaRepository.crearMuchas`; `AgendaRepository.findVisitAssignments`;
  `SalesDataScopeResolver.resolve`; `codigoVendedorPrueba`, `puedeOperarComoVendedorDePrueba`,
  `superviseVendedores`.
- Produces (en `src/types/planificacion.ts`):
  ```ts
  export interface IVendedorDePrueba {
      codigo: string
      /** Descripción de la rotación abierta ('Cartera de V 2' | 'Sin cartera') o null si nunca se reinició. */
      descripcion: string | null
      /** Códigos con plantilla en el mock: los orígenes elegibles. */
      origenesDisponibles: string[]
  }
  export interface IMePlanificacion {
      rol: string
      capacidades: {
          operaComoVendedor: boolean
          operaComoVendedorDePrueba: boolean
          superviseVendedores: boolean
      }
      /** allowedSellerCodes del scope: null = todos. */
      vendedoresVisibles: string[] | null
      vendedorDePrueba: IVendedorDePrueba | null
  }
  ```
  y `VendedorPruebaService.reiniciar(user, origen?: string | null): Promise<IVendedorDePrueba>`,
  `VendedorPruebaService.me(user): Promise<IMePlanificacion>`,
  `AgendaRepository.codigosConPlantilla(): string[]` (método nuevo, una línea: `Object.keys(mockData)`).

- [ ] **Step 1: Tests que fallan**

```ts
// src/services/planificacion/VendedorPruebaService.spec.ts
import { VendedorPruebaService } from './VendedorPruebaService'
import { VendedorPruebaRepository } from '../../repositories/VendedorPruebaRepository'
import { RotacionService } from './RotacionService'
import { RotacionRepository } from '../../repositories/RotacionRepository'
import { RotacionSemanaRepository } from '../../repositories/RotacionSemanaRepository'
import { AgendaRepository } from '../../repositories/AgendaRepository'
import { SalesDataScopeResolver } from '../../business/SalesDataScope'
import { sequelizeWritePlanificacion } from '../../database/connection'

jest.mock('../../repositories/VendedorPruebaRepository')
jest.mock('./RotacionService')
jest.mock('../../repositories/RotacionRepository')
jest.mock('../../repositories/RotacionSemanaRepository')
jest.mock('../../repositories/AgendaRepository')
jest.mock('../../business/SalesDataScope')
jest.mock('../../database/connection', () => {
    const actual = jest.requireActual('../../database/connection')
    return {
        ...actual,
        sequelizeWritePlanificacion: Object.assign(actual.sequelizeWritePlanificacion, {
            transaction: jest.fn(async (cb: any) => cb({ id: 'tx' })),
        }),
    }
})

const admin = { id: '42', rol: 'admin' } as any
const tester = { id: '9', rol: 'tester' } as any
const vendedor = { id: '3', rol: 'vendedor' } as any

beforeEach(() => {
    jest.clearAllMocks()
    ;(AgendaRepository.codigosConPlantilla as jest.Mock).mockReturnValue(['V 2', 'NACHO'])
    ;(SalesDataScopeResolver.resolve as jest.Mock).mockResolvedValue({ allowedSellerCodes: null })
})

describe('reiniciar', () => {
    it('borra, materializa desde el origen y nombra la rotación "Cartera de <origen>"', async () => {
        ;(RotacionService.materializar as jest.Mock).mockResolvedValue(500)
        ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue({ id: 500, descripcion: 'Cartera de V 2' })

        const r = await VendedorPruebaService.reiniciar(admin, 'V 2')

        expect(VendedorPruebaRepository.borrarTodo).toHaveBeenCalledWith('PRUEBA-42', { id: 'tx' })
        expect(RotacionService.materializar).toHaveBeenCalledWith('PRUEBA-42', { id: 'tx' }, 'V 2')
        expect(RotacionRepository.editarDescripcion).toHaveBeenCalledWith(500, 'Cartera de V 2')
        expect(r).toEqual({ codigo: 'PRUEBA-42', descripcion: 'Cartera de V 2', origenesDisponibles: ['V 2', 'NACHO'] })
    })

    it('sin origen: borra y crea una rotación vacía con set de semanas 1..5, "Sin cartera"', async () => {
        ;(RotacionRepository.crear as jest.Mock).mockResolvedValue(501)
        ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue({ id: 501, descripcion: 'Sin cartera' })

        await VendedorPruebaService.reiniciar(admin, null)

        expect(RotacionService.materializar).not.toHaveBeenCalled()
        expect(RotacionRepository.crear).toHaveBeenCalledWith('PRUEBA-42', { id: 'tx' })
        expect(RotacionSemanaRepository.crearMuchas).toHaveBeenCalledWith(
            501,
            [1, 2, 3, 4, 5].map(semana => ({ semana, descripcion: null })),
            { id: 'tx' },
        )
        expect(RotacionRepository.editarDescripcion).toHaveBeenCalledWith(501, 'Sin cartera')
    })

    it('rechaza un origen que no tiene plantilla (422 ORIGEN_INVALIDO) sin borrar nada', async () => {
        await expect(VendedorPruebaService.reiniciar(admin, 'ZZZ')).rejects.toMatchObject({ code: 'ORIGEN_INVALIDO' })
        expect(VendedorPruebaRepository.borrarTodo).not.toHaveBeenCalled()
    })

    it('el código sale del usuario, nunca de un parámetro; un vendedor real no puede reiniciar', async () => {
        await expect(VendedorPruebaService.reiniciar(vendedor, 'V 2')).rejects.toMatchObject({ code: 'SELLER_CODE_UNRESOLVED' })
        expect(VendedorPruebaRepository.borrarTodo).not.toHaveBeenCalled()
    })

    it('tester también reinicia, con su propio código', async () => {
        ;(RotacionService.materializar as jest.Mock).mockResolvedValue(600)
        ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue({ id: 600, descripcion: 'Cartera de NACHO' })
        const r = await VendedorPruebaService.reiniciar(tester, 'NACHO')
        expect(VendedorPruebaRepository.borrarTodo).toHaveBeenCalledWith('PRUEBA-9', { id: 'tx' })
        expect(r.codigo).toBe('PRUEBA-9')
    })
})

describe('me', () => {
    it('gerencia: las dos capacidades, vendedoresVisibles null, vendedorDePrueba con código', async () => {
        ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue(null)
        const me = await VendedorPruebaService.me(admin)
        expect(me).toEqual({
            rol: 'admin',
            capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true },
            vendedoresVisibles: null,
            vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: null, origenesDisponibles: ['V 2', 'NACHO'] },
        })
    })

    it('tester: solo prueba, vendedoresVisibles []', async () => {
        ;(SalesDataScopeResolver.resolve as jest.Mock).mockResolvedValue({ allowedSellerCodes: [] })
        ;(RotacionRepository.findAbiertaByVendedor as jest.Mock).mockResolvedValue({ id: 1, descripcion: 'Cartera de V 2' })
        const me = await VendedorPruebaService.me(tester)
        expect(me.capacidades).toEqual({ operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: false })
        expect(me.vendedoresVisibles).toEqual([])
        expect(me.vendedorDePrueba?.descripcion).toBe('Cartera de V 2')
    })

    it('vendedor: operaComoVendedor, sin vendedorDePrueba', async () => {
        ;(SalesDataScopeResolver.resolve as jest.Mock).mockResolvedValue({ allowedSellerCodes: ['V 2'] })
        const me = await VendedorPruebaService.me(vendedor)
        expect(me.capacidades).toEqual({ operaComoVendedor: true, operaComoVendedorDePrueba: false, superviseVendedores: false })
        expect(me.vendedoresVisibles).toEqual(['V 2'])
        expect(me.vendedorDePrueba).toBeNull()
        expect(RotacionRepository.findAbiertaByVendedor).not.toHaveBeenCalled()
    })

    it('marketing: todo en false, vendedorDePrueba null', async () => {
        const me = await VendedorPruebaService.me({ id: '1', rol: 'marketing' } as any)
        expect(me.capacidades).toEqual({ operaComoVendedor: false, operaComoVendedorDePrueba: false, superviseVendedores: false })
        expect(me.vendedorDePrueba).toBeNull()
    })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx jest src/services/planificacion/VendedorPruebaService.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar tipos y `codigosConPlantilla`**

En `src/types/planificacion.ts`, al final, pegar las dos interfaces del bloque **Interfaces** de arriba.

En `src/repositories/AgendaRepository.ts`, dentro de la clase:

```ts
    /** Los vendedores que tienen plantilla en el mock: los orígenes elegibles para el
     *  vendedor de prueba. */
    static codigosConPlantilla(): string[] {
        return Object.keys(mockData)
    }
```

- [ ] **Step 4: Implementar el servicio**

```ts
// src/services/planificacion/VendedorPruebaService.ts
import { IUser } from '../../types/user'
import { CustomError } from '../../utils/errors'
import { sequelizeWritePlanificacion } from '../../database/connection'
import { SalesDataScopeResolver } from '../../business/SalesDataScope'
import { RotacionService } from './RotacionService'
import { RotacionRepository } from '../../repositories/RotacionRepository'
import { RotacionSemanaRepository } from '../../repositories/RotacionSemanaRepository'
import { AgendaRepository } from '../../repositories/AgendaRepository'
import { VendedorPruebaRepository } from '../../repositories/VendedorPruebaRepository'
import {
    codigoVendedorPrueba,
    puedeOperarComoVendedorDePrueba,
    superviseVendedores,
} from './vendedorPrueba'
import { IMePlanificacion, IVendedorDePrueba } from '../../types/planificacion'

/** Sin origen, la rotación nace con las cinco semanas vacías: el buscador después las llena. */
const SEMANAS_VACIAS = [1, 2, 3, 4, 5]

/**
 * El vendedor de prueba de un usuario (spec 2026-09-17-modo-prueba-gerencia-design.md).
 * El código SIEMPRE se deriva de req.user: ningún método acepta un código por parámetro.
 */
export class VendedorPruebaService {
    private static codigoPropio(user: IUser): string {
        if (!puedeOperarComoVendedorDePrueba(user.rol)) {
            throw new CustomError(400, 'Este rol no tiene vendedor de prueba.', {
                code: 'SELLER_CODE_UNRESOLVED',
            })
        }
        return codigoVendedorPrueba(user.id)
    }

    private static async estado(codigo: string): Promise<IVendedorDePrueba> {
        const abierta = await RotacionRepository.findAbiertaByVendedor(codigo)
        return {
            codigo,
            descripcion: abierta?.descripcion ?? null,
            origenesDisponibles: AgendaRepository.codigosConPlantilla(),
        }
    }

    /**
     * Borra TODO lo del vendedor de prueba del usuario y lo vuelve a crear: como copia (foto)
     * del plan de `origen`, o vacío. Una transacción: si la materialización falla, el borrado
     * se revierte y la prueba queda como estaba.
     */
    static async reiniciar(user: IUser, origen?: string | null): Promise<IVendedorDePrueba> {
        const codigo = VendedorPruebaService.codigoPropio(user)
        const plantilla = origen?.trim() || null

        if (plantilla && !AgendaRepository.codigosConPlantilla().includes(plantilla)) {
            throw new CustomError(422, 'Ese vendedor no tiene plantilla para copiar.', {
                code: 'ORIGEN_INVALIDO',
                validValues: AgendaRepository.codigosConPlantilla(),
            })
        }

        await sequelizeWritePlanificacion.transaction(async transaction => {
            await VendedorPruebaRepository.borrarTodo(codigo, transaction)

            let rotacionId: number
            if (plantilla) {
                rotacionId = await RotacionService.materializar(codigo, transaction, plantilla)
            } else {
                rotacionId = await RotacionRepository.crear(codigo, transaction)
                await RotacionSemanaRepository.crearMuchas(
                    rotacionId,
                    SEMANAS_VACIAS.map(semana => ({ semana, descripcion: null })),
                    transaction,
                )
            }
            // El nombre de la rotación es lo que el banner del front muestra, sin parsear.
            await RotacionRepository.editarDescripcion(
                rotacionId,
                plantilla ? `Cartera de ${plantilla}` : 'Sin cartera',
            )
        })

        return VendedorPruebaService.estado(codigo)
    }

    /** Lo que el front necesita para decidir, derivado de la política y del scope. */
    static async me(user: IUser): Promise<IMePlanificacion> {
        const rol = user.rol.toLowerCase()
        const scope = await SalesDataScopeResolver.resolve(user)
        const prueba = puedeOperarComoVendedorDePrueba(rol)
        return {
            rol,
            capacidades: {
                operaComoVendedor: rol === 'vendedor',
                operaComoVendedorDePrueba: prueba,
                superviseVendedores: superviseVendedores(rol),
            },
            vendedoresVisibles: scope.allowedSellerCodes,
            vendedorDePrueba: prueba
                ? await VendedorPruebaService.estado(codigoVendedorPrueba(user.id))
                : null,
        }
    }
}
```

> Nota: `RotacionRepository.editarDescripcion` no recibe `transaction` hoy. Como el `UPDATE` corre
> dentro del callback pero fuera de la tx, si la tx fallara después quedaría una descripción
> huérfana… pero es la última operación del callback, así que no hay "después". Se acepta; si
> molesta, agregar `transaction?: Transaction` a `editarDescripcion` es un cambio aditivo permitido.

- [ ] **Step 5: Verificar**

Run: `npx jest src/services/planificacion/VendedorPruebaService.spec.ts src/repositories/AgendaRepository.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/planificacion/VendedorPruebaService.ts src/services/planificacion/VendedorPruebaService.spec.ts src/repositories/AgendaRepository.ts src/types/planificacion.ts
git commit -m "feat(prueba): VendedorPruebaService — reiniciar desde la cartera de un vendedor y me()

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Controller y rutas — `POST /planificacion/prueba/reiniciar`, `GET /planificacion/me`

**Files:**
- Modify: `src/controllers/planificacionController.ts`
- Modify: `src/routes/planificacion.ts`

**Interfaces:**
- Consumes: `VendedorPruebaService.reiniciar`, `VendedorPruebaService.me` (Task 12);
  `ROLES_CON_VENDEDOR_DE_PRUEBA` (Task 1).

- [ ] **Step 1: Handlers**

En `planificacionController.ts`, importar `VendedorPruebaService` y agregar antes de `responderError`:

```ts
    // ───────────────── Vendedor de prueba ─────────────────
    // El código NUNCA viaja en la URL ni en el body: sale del token. Es la garantía de que
    // estos endpoints no pueden tocar datos de nadie más (spec 2026-09-17).

    /** POST /planificacion/prueba/reiniciar  body: { origen?: string } */
    static async reiniciarPrueba(req: Request, res: Response): Promise<void> {
        try {
            const origen = (req.body as { origen?: unknown })?.origen
            if (origen !== undefined && origen !== null && typeof origen !== 'string') {
                res.status(400).json({ ok: 0, error: 'origen tiene que ser un string' })
                return
            }
            const data = await VendedorPruebaService.reiniciar(req.user!, origen ?? null)
            res.status(201).json({ ok: 1, data })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }

    /** GET /planificacion/me — capacidades y scope para el front. Cualquier rol autenticado. */
    static async getMe(req: Request, res: Response): Promise<void> {
        try {
            const data = await VendedorPruebaService.me(req.user!)
            res.status(200).json({ ok: 1, data })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }
```

- [ ] **Step 2: Rutas**

En `routes/planificacion.ts`, antes de la sección Gerencia:

```ts
// ───────────────────────── Vendedor de prueba ─────────────────────────
// authorize(...ROLES_CON_VENDEDOR_DE_PRUEBA) y NO authorizeVendedor: un vendedor real no
// tiene nada que reiniciar.
router.post(
    '/prueba/reiniciar',
    authMiddleware,
    authorize(...ROLES_CON_VENDEDOR_DE_PRUEBA),
    async (req: Request, res: Response) => {
        PlanificacionController.reiniciarPrueba(req, res)
    },
)

// Cualquier rol autenticado: el front decide con esto (no espeja la tabla de roles).
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
    PlanificacionController.getMe(req, res)
})
```

Agregar los bloques `@openapi` siguiendo el estilo de las rutas vecinas (tag `Planificacion`,
summary "Reinicia el vendedor de prueba del usuario" / "Capacidades del usuario en planificación").

- [ ] **Step 3: Compilar y correr todo**

Run: `npx tsc --noEmit && npm test`
Expected: compila; suite completa PASS.

- [ ] **Step 4: Smoke manual contra la base local**

Con el server levantado (`npm run dev`) y un token de `admin`:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:PUERTO/prod/vs/planificacion/me
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"origen":"V 2"}' http://localhost:PUERTO/prod/vs/planificacion/prueba/reiniciar
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:PUERTO/prod/vs/planificacion/ciclo/actual
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:PUERTO/prod/vs/planificacion/analitica/resumen?desde=2026-09-01&hasta=2026-09-30"
```

Esperado: `me` con `vendedorDePrueba.codigo = PRUEBA-<id>`; el reinicio devuelve 201 con
`descripcion: 'Cartera de V 2'`; `ciclo/actual` devuelve la rotación con las semanas de V 2; el
resumen de analítica **no** lista `PRUEBA-<id>` entre los vendedores.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/planificacionController.ts src/routes/planificacion.ts
git commit -m "feat(prueba): endpoints POST /prueba/reiniciar y GET /me

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Documentación, verificación de compatibilidad y PR

**Files:**
- Modify: `CLAUDE.md` o `AGENTS.md` del repo api-vendedores (el que exista)

- [ ] **Step 1: Reglas nuevas en la guía del repo**

Agregar una sección "Vendedor de prueba" con estos cuatro puntos, textuales:

```markdown
## Vendedor de prueba (`PRUEBA-<userId>`)

- `PRUEBA-` es un prefijo RESERVADO del código de vendedor. Nunca existe en el warehouse y nunca
  entra en una agregación que cruce vendedores ni dispara un efecto fuera de `pl_*`. Ante cualquier
  efecto externo nuevo (Cromo, client-service, mail, lo que sea) o cualquier query que agrupe o
  filtre ENTRE vendedores, la pregunta obligatoria es `esVendedorDePrueba` /
  `fragmentoVendedores` (`src/services/planificacion/vendedorPrueba.ts`).
- Quién puede probar y quién supervisa se lee de `config/roles.ts`
  (`operaComoVendedorDePrueba`, `superviseVendedores`), nunca de una lista de roles.
- Toda ruta con un `:codigo` de vendedor en la URL lleva `requireVendedorEnScope`.
- El warehouse (`analytics.fct_clients`) es de solo lectura absoluto: ni columnas, ni filas, ni
  códigos sintéticos. Todo se resuelve en api-vendedores y en `pl_*`.
- api-vendedores es compartida con app-vendedores: fuera del dominio de planificación solo se toca
  `config/roles.ts`, de forma aditiva. Ver el spec
  `app-planificacion/docs/superpowers/specs/2026-09-17-modo-prueba-gerencia-design.md`,
  sección "Compatibilidad con app-vendedores".
```

- [ ] **Step 2: Verificación de compatibilidad (la tabla del spec)**

Run: `git diff --stat master...HEAD`
Expected: fuera de `src/services/planificacion/`, `src/repositories/{Analitica,Resolucion,Client,Agenda,VendedorPrueba}Repository*`, `src/routes/{planificacion,analitica}.ts`, `src/controllers/planificacionController.ts`, `src/services/crm/*`, `src/middleware/requireVendedorEnScope*`, `src/types/planificacion.ts` y la guía, el ÚNICO archivo tocado es `src/config/roles.ts` (+ su spec). Si aparece otro, justificarlo en la tabla del spec o revertirlo.

Run: `git diff master...HEAD -- src/config/roles.ts`
Expected: solo líneas agregadas o filas extendidas; ningún valor existente cambia (lo garantiza el test de Task 1).

Run: `npm test`
Expected: suite completa en verde.

- [ ] **Step 3: Commit y PR**

```bash
git add CLAUDE.md AGENTS.md 2>/dev/null
git commit -m "docs(prueba): reglas del vendedor de prueba en la guía del repo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

PR contra `master` con el título "Vendedor de prueba: gerencia y tester operan la app del vendedor sin ensuciar datos". En la descripción: link al spec, la tabla de compatibilidad, y el checklist de smoke de app-vendedores (login con `vendedor`, `versus-ger` y `tv` contra el preview; una vista de rubros, el planning de notas y el selector de vendedores; sin cambios visibles). Cerrar con `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 4: Pedido externo**

Abrir el ticket al equipo de auth: alta del rol `tester` (string exacto, minúsculas) y asignación a
las personas que lo necesiten. Hasta que exista, todo funciona igual para gerencia.

---

## Self-review contra el spec

| sección del spec | task |
|---|---|
| Quién puede: capacidades + `tester` | 1, 2 |
| Identidad: `resolveSellerCode(user, solicitado?)` por scope | 3 |
| Rutas: `authorizeVendedor`, `ROLES_SUPERVISAN`, `requireVendedorEnScope` | 4, 5 |
| Agenda: `materializar(…, plantillaDe)`, descripción, nombres de zona | 10, 12 |
| Cartera = todo el padrón, búsqueda server-side + LIMIT | 9 |
| Guarda 1: `fragmentoVendedores` + rama singular + test de contrato | 6 |
| Guarda 2: Cromo `MODO_PRUEBA`; client-service | 7, 8 |
| Guarda 3: cupo excluye prueba | 8 |
| `GET /me`, `POST /prueba/reiniciar`, borrado once tablas | 11, 12, 13 |
| Compatibilidad con app-vendedores (aditivo, verificación) | 1 (test), 14 |
| Documentación api-vendedores; alta del rol en auth | 14 |
| Fase 2 (query param `vendedor` en handlers de lectura) | fuera de este plan, la firma ya lo soporta (3) |
