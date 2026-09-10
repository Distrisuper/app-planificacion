# Agregar cliente extra desde la vista de gerencia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerencia puede, desde el grid de la rotación **Actual** en `/analitica/ruta`, buscar un cliente de la cartera del vendedor y crear una fila `es_extra = 1` en una celda `(rotación, semana, día)` concreta — el mismo mecanismo que ya usa el buscador self-service del vendedor, con un segundo punto de entrada operado por gerencia.

**Architecture:** Backend: el buscador de cartera pasa a vivir en un servicio **sin rol**, `BuscadorCarteraService`, que recibe vendedor y `rotacionId` como parámetros y reusa sin tocar `ClientRepository.getByVendor`, `RotacionClienteRepository.crearExtra`/`restaurar` y `findPorRotacionYClienteTodasLasFilas`; sus funciones puras (`normalizar`/`filtrarPorTexto`/`sinPlan`/`mapEstado`) salen a un módulo aparte. `BuscadorService` conserva su API pública y queda como la capa fina de self-service que resuelve el vendedor del token y la rotación del ciclo abierto y delega. El permiso lo dan las rutas: tres nuevas bajo el prefijo gerencia ya existente, con `ROLES_GERENCIA`. Frontend: tres funciones de API, tres hooks en `useRotacionAdmin.ts`, un diálogo nuevo (`AgregarClienteExtraDialog`) y un botón "+" por celda del grid, visible solo cuando la rotación mostrada está `abierta`.

**Tech Stack:** Backend: Node/TypeScript, Express, Sequelize, MySQL, Jest. Frontend: React 19, TypeScript, @tanstack/react-query, axios, Radix, Vitest + Testing Library.

**Repos y rutas absolutas (dos repos, dos ramas):**

- Backend: `C:\Users\matia\OneDrive\Documentos\distri\business-platform\versus\api-vendedores` — rama `feat/agregar-cliente-extra-gerencia` desde `origin/master`.
  (⚠️ **No** es la ruta que dice el CLAUDE.md ni la de los planes viejos — `C:\Users\matia\Documents\distrisuper\business-workflow\versus\api-vendedores` no existe. El checkout de `distri\vendedores\api-vendedores` es OTRO clon, viejo, sin el dominio `planificacion`: no tocarlo.)
- Frontend: `C:\Users\matia\OneDrive\Documentos\distri\app-planificacion` — rama `feat/agregar-cliente-extra-gerencia` desde `master`.

**Spec de referencia:** `docs/superpowers/specs/2026-09-09-agregar-cliente-extra-gerencia-design.md`.

## Global Constraints

- **Rutas, textuales del spec** (mismo prefijo y roles `ROLES_GERENCIA` que el resto de gerencia):
  - `GET  /planificacion/vendedores/:codigo/rotaciones/:rotacionId/buscador?q=texto`
  - `GET  /planificacion/vendedores/:codigo/rotaciones/:rotacionId/buscador/cliente/:codigoCliente`
  - `POST /planificacion/vendedores/:codigo/rotaciones/:rotacionId/buscador/cliente/:codigoCliente/extra` — body `{ semana: number; dia: number }`
- Toda ruta de gerencia responde `200 { ok: 1, data }` en éxito, nunca `204`: es el patrón de **todo** `planificacionController.ts`.
- El parámetro de ruta del cliente es `:codigoCliente` (no `:codigo`, que ya lo usa el vendedor en el mismo path).
- Los códigos de vendedor tienen espacios (`"V 2"`): **todo** path del front se arma con `encodeURIComponent`, como ya hace `base()` en `planificacionAdmin.ts`.
- Códigos de error: se reusan los existentes `ROTACION_NOT_FOUND` (404), `ROTACION_CERRADA` (409), `SEMANA_FUERA_DEL_SET` (422), `DIA_INVALIDO` (400). El único nuevo es `CLIENTE_FUERA_DE_CARTERA` (404).
- Mínimo de 2 caracteres para buscar: se valida **también en el backend** devolviendo `[]` (el buscador itera una query por cliente — ver el comentario de `BuscadorService.buscarEnCartera`).
- Backend: todos los tests mockean repos/Sequelize, sin DB real — patrón de `GerenciaRotacionService.spec.ts`. Frontend: los tests mockean `@/api/planificacionAdmin` — patrón de `useRotacionAdmin.test.tsx`.
- Ningún cambio de esquema: `es_extra` y `crearExtra` ya existen. No hay SQL en este plan.
- **El vendedor no ve nada de esto.** Es una vista de gerencia: "semana N" sí es vocabulario válido acá (el grid ya lo usa).

### Cuatro desvíos deliberados del spec (leer antes de empezar)

0. **El servicio nuevo no se llama `GerenciaBuscadorService` y no es "de gerencia": es `BuscadorCarteraService`, sin rol.** El spec acierta en que hace falta un servicio nuevo (revisado: la única búsqueda de clientes por texto de toda la API es `BuscadorService` del propio dominio — `clientService` resuelve data de *un* cliente por código y `entityMatchesSearch` de sales filtra filas agregadas, no cartera). Lo que no hace falta es que sepa quién pregunta: la diferencia real entre los dos llamadores es **de dónde salen el vendedor y la rotación** —token + ciclo abierto en un caso, URL en el otro—, no el rol. Así que el núcleo los recibe como parámetros y `BuscadorService` queda como la capa fina de self-service que los resuelve y delega. Esto **no** es el "modo gerencia" que el spec descarta: ahí lo rechazado es ramificar por rol dentro de cada método (`if (esGerencia)`), y acá no hay ninguna rama — hay un núcleo sin rol y dos entradas. Beneficio extra: el camino del vendedor deja de ser código sin tests, y las 40 líneas de búsqueda existen una sola vez.

1. **El "+" va por CELDA, no en el header de la columna de día.** El spec dice "header de cada columna de día" y a la vez "semana y día quedan fijados por el botón que se tocó": son incompatibles — el grid tiene 5 columnas de día × N filas de semana, así que un botón en el header de columna no identifica ninguna semana. Se implementa por celda (25 botones, al lado del `⇄` que ya vive ahí), que es lo único que cumple el requisito de fijar `(semana, dia)` sin agregar el selector que el spec descarta.
2. **Es un `Dialog`, no un `BottomSheet`.** El spec pide un clon de `BuscadorDiaSheet`, que es un bottom sheet mobile. La regla del repo es explícita en el docstring de `ConfirmDialog`: *"un sheet que sube desde abajo es el patrón mobile del vendedor, y esto se usa en la grilla de gerencia (desktop)"*. Por eso el componente se llama `AgregarClienteExtraDialog` (no `...Sheet`) y va sobre `@radix-ui/react-dialog` — dependencia nueva declarada, ya presente en el lock como transitiva de `@radix-ui/react-alert-dialog` (mismo movimiento que hizo el PR #30 al declarar `react-alert-dialog`).
3. **La celda destino puede tener una fila QUITADA (soft-delete), y agregar ahí la restaura.** El spec se escribió el mismo día que "quitar cliente" y no cruza los dos features. Sin esto: `crearExtra` choca contra `uq_rotacion_cliente`, recupera la fila borrada y devuelve `200` con una fila que el grid dibuja **deshabilitada con botón "Restaurar"** — el usuario tocó "Agregar" y aparentemente no pasó nada. La restauración vive en `BuscadorCarteraService.agregarExtra` y **no** en `crearExtra`: el repositorio es el que usa la materialización del plan y `crearExtra` tiene otros llamadores posibles; la política de "agregar en una celda con fila quitada la revive" es del caso de uso, no de la escritura.

   **Consecuencia:** como el vendedor comparte ese camino (`confirmarExtra` delega en `agregarExtra`), su buscador también revive una fila que gerencia había quitado. Es lo correcto y no un efecto colateral: si el vendedor está parado en el local, el hecho ocurrió, y `pl_resolucion` necesita un `rotacion_cliente_id` donde colgarse — sin revivir la fila no hay dónde registrar la visita, y bloquearlo dejaría el hecho sin asentar. El plan vuelve a tener esa fila, esta vez con su resolución encima.

---

## Task 1: `BuscadorCarteraService` — el núcleo sin rol (buscar en la cartera)

Hoy toda la búsqueda de cartera vive en `BuscadorService`, que resuelve el vendedor del token
(`resolveSellerCode`) y la rotación del ciclo abierto. La vista de gerencia necesita lo mismo con
los dos explícitos. Se extrae el núcleo a un servicio **sin rol** —vendedor y `rotacionId` como
parámetros— y `BuscadorService` queda como la capa fina de self-service que resuelve del token y
delega.

Las tres funciones puras (`normalizar`, el filtrado por texto, el mapeo de estado) van a un módulo
aparte, que es lo que hace posible que el núcleo no dependa de nada del llamador.

**Files:**
- Create: `api-vendedores/src/services/planificacion/buscadorCartera.ts`
- Create: `api-vendedores/src/services/planificacion/buscadorCartera.spec.ts`
- Create: `api-vendedores/src/services/planificacion/BuscadorCarteraService.ts`
- Create: `api-vendedores/src/services/planificacion/BuscadorCarteraService.spec.ts`
- Modify: `api-vendedores/src/services/planificacion/BuscadorService.ts`

**Interfaces:**
- Consumes: `ClientBasicInfo` de `../../repositories/ClientRepository`; `IResultadoBuscadorGeneral`, `IRotacionCliente` de `../../types/planificacion`; `GerenciaRotacionService.requireRotacionDe` (ya existe, 404 `ROTACION_NOT_FOUND`).
- Produces (`buscadorCartera.ts`, funciones puras):
  - `type FilaConResolucion = IRotacionCliente & { resolucionId: number | null; tipoResolucion: string | null; fechaFin: Date | null }`
  - `normalizar(texto: string): string`
  - `filtrarPorTexto(clientes: ClientBasicInfo[], texto: string): ClientBasicInfo[]`
  - `sinPlan(cliente: ClientBasicInfo): IResultadoBuscadorGeneral`
  - `mapEstado(cliente: ClientBasicInfo, filas: FilaConResolucion[], descripciones: Map<number, string | null>): IResultadoBuscadorGeneral`
- Produces (`BuscadorCarteraService`):
  - `BuscadorCarteraService.buscarEnCartera(vendedor: string, rotacionId: number, texto: string): Promise<IResultadoBuscadorGeneral[]>`
  - Lo consumen Task 2, Task 3 y el propio `BuscadorService`.

**Cambios de comportamiento en el camino del VENDEDOR** (los dos a favor, anotarlos en el PR):
el mínimo de 2 caracteres ahora también lo aplica el server (el front ya lo hacía), y las filas
quitadas (soft-delete) dejan de contar como planificadas en el buscador general — que es lo que ya
prometía el commit `fix(planificacion): una fila quitada deja de existir para el vendedor`.

- [ ] **Step 1: Poner el checkout al día y crear la rama**

El `master` local del backend está detrás de `origin/master` (le falta el PR #115, que es el que
trae `eliminado`).

```bash
cd "C:/Users/matia/OneDrive/Documentos/distri/business-platform/versus/api-vendedores"
git checkout master
git pull
git checkout -b feat/agregar-cliente-extra-gerencia
git log --oneline -1   # tiene que decir: 90cad4e feat(planificacion): mostrar cliente quitado deshabilitado + restaurar (#115)
```

- [ ] **Step 2: Escribir el test de las funciones puras**

Archivo `src/services/planificacion/buscadorCartera.spec.ts`:

```ts
import {
    filtrarPorTexto,
    mapEstado,
    normalizar,
    sinPlan,
    FilaConResolucion,
} from './buscadorCartera'
import { ClientBasicInfo } from '../../repositories/ClientRepository'

const cliente = (codigo: string, razon: string): ClientBasicInfo =>
    ({ CODIGOPARTICULAR: codigo, RAZONSOCIAL: razon }) as ClientBasicInfo

const fila = (over: Partial<FilaConResolucion> = {}): FilaConResolucion => ({
    id: 11,
    rotacionId: 7,
    codigoParticularCliente: 'P001',
    semana: 2,
    dia: 3,
    esExtra: false,
    eliminado: false,
    resolucionId: null,
    tipoResolucion: null,
    fechaFin: null,
    ...over,
})

describe('normalizar', () => {
    it('ignora mayúsculas y tildes', () => {
        expect(normalizar('Almacén ÑOÑO')).toBe('almacen nono')
    })
})

describe('filtrarPorTexto', () => {
    const cartera = [cliente('P001', 'Almacén Zárate'), cliente('P002', 'Kiosco Uno')]

    it('matchea por razón social sin depender de tildes', () => {
        expect(filtrarPorTexto(cartera, 'zarate').map(c => c.CODIGOPARTICULAR)).toEqual(['P001'])
    })

    it('matchea por código particular', () => {
        expect(filtrarPorTexto(cartera, 'P002').map(c => c.CODIGOPARTICULAR)).toEqual(['P002'])
    })
})

describe('sinPlan', () => {
    it('describe un cliente que no está en la rotación', () => {
        expect(sinPlan(cliente('P003', 'Despensa Sur'))).toEqual({
            codigoParticularCliente: 'P003',
            nombreCliente: 'Despensa Sur',
            estado: 'sin_plan',
            semana: null,
            dia: null,
            descripcionZona: null,
            fecha: null,
            motivo: null,
        })
    })
})

describe('mapEstado', () => {
    const descripciones = new Map<number, string | null>([[2, 'Zárate']])

    it('la fila pendiente manda sobre una resuelta', () => {
        const r = mapEstado(
            cliente('P001', 'Almacén Zárate'),
            [
                fila({ id: 9, semana: 1, dia: 1, resolucionId: 5, tipoResolucion: 'visita' }),
                fila({ id: 11, semana: 2, dia: 3 }),
            ],
            descripciones,
        )
        expect(r.estado).toBe('pendiente')
        expect(r.semana).toBe(2)
        expect(r.descripcionZona).toBe('Zárate')
    })

    it('sin pendiente, informa la última resuelta con su fecha', () => {
        const r = mapEstado(
            cliente('P001', 'Almacén Zárate'),
            [
                fila({
                    semana: 2,
                    dia: 3,
                    resolucionId: 5,
                    tipoResolucion: 'visita',
                    fechaFin: new Date('2026-09-01T15:00:00.000Z'),
                }),
            ],
            descripciones,
        )
        expect(r.estado).toBe('visitado')
        expect(r.fecha).toBe('2026-09-01T15:00:00.000Z')
    })

    it('un no_visita se distingue de un visitado', () => {
        const r = mapEstado(
            cliente('P001', 'Almacén Zárate'),
            [fila({ resolucionId: 5, tipoResolucion: 'no_visita' })],
            descripciones,
        )
        expect(r.estado).toBe('no_visita')
        expect(r.fecha).toBeNull()
    })

    it('sin filas cae en sin_plan', () => {
        expect(mapEstado(cliente('P001', 'Almacén Zárate'), [], descripciones).estado).toBe(
            'sin_plan',
        )
    })
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

```bash
npx jest src/services/planificacion/buscadorCartera.spec.ts
```
Esperado: FAIL — `Cannot find module './buscadorCartera'`.

- [ ] **Step 4: Crear el módulo de funciones puras**

Archivo `src/services/planificacion/buscadorCartera.ts`:

```ts
import { ClientBasicInfo } from '../../repositories/ClientRepository'
import { IResultadoBuscadorGeneral, IRotacionCliente } from '../../types/planificacion'

/** Una fila del plan con su resolución (o la ausencia de ella), tal como la devuelve
 *  `RotacionClienteRepository.findPorRotacionYClienteTodasLasFilas`. */
export type FilaConResolucion = IRotacionCliente & {
    resolucionId: number | null
    tipoResolucion: string | null
    fechaFin: Date | null
}

/**
 * Las funciones puras del buscador de cartera: "cómo se lee el estado de un cliente en
 * la vuelta", sin tocar la base ni saber quién pregunta.
 *
 * Viven acá y no dentro de un servicio porque las usa el núcleo (`BuscadorCarteraService`)
 * y son lo único de todo el buscador que se puede probar sin mockear medio repositorio.
 */

/** `toLowerCase` + strip de diacríticos: mismo criterio mínimo que usa el front para no
 *  depender de mayúsculas ni tildes al buscar. */
export function normalizar(texto: string): string {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

/** Nombre normalizado (sin tildes/mayúsculas) o código particular literal. */
export function filtrarPorTexto(
    clientes: ClientBasicInfo[],
    texto: string,
): ClientBasicInfo[] {
    const buscado = normalizar(texto)
    return clientes.filter(
        c => normalizar(c.RAZONSOCIAL).includes(buscado) || c.CODIGOPARTICULAR.includes(texto),
    )
}

export function sinPlan(cliente: ClientBasicInfo): IResultadoBuscadorGeneral {
    return {
        codigoParticularCliente: cliente.CODIGOPARTICULAR,
        nombreCliente: cliente.RAZONSOCIAL,
        estado: 'sin_plan',
        semana: null,
        dia: null,
        descripcionZona: null,
        fecha: null,
        motivo: null,
    }
}

/**
 * El estado del cliente en la vuelta: la fila pendiente manda; si no hay ninguna
 * pendiente, se informa la más reciente resuelta. Sin fila alguna: 'sin_plan'.
 *
 * No filtra filas quitadas (soft-delete): quién llama decide qué le pasa. El núcleo le
 * pasa solo las vivas.
 */
export function mapEstado(
    cliente: ClientBasicInfo,
    filas: FilaConResolucion[],
    descripciones: Map<number, string | null>,
): IResultadoBuscadorGeneral {
    const pendiente = filas.find(f => f.resolucionId === null)
    const fila = pendiente ?? filas[filas.length - 1]

    if (!fila) return sinPlan(cliente)

    let estado: IResultadoBuscadorGeneral['estado']
    if (fila.resolucionId === null) {
        estado = 'pendiente'
    } else if (fila.tipoResolucion === 'no_visita') {
        estado = 'no_visita'
    } else {
        estado = 'visitado'
    }

    return {
        codigoParticularCliente: cliente.CODIGOPARTICULAR,
        nombreCliente: cliente.RAZONSOCIAL,
        estado,
        semana: fila.semana,
        dia: fila.dia,
        descripcionZona: descripciones.get(fila.semana) ?? null,
        fecha: estado === 'visitado' && fila.fechaFin ? fila.fechaFin.toISOString() : null,
        // Motivo de no_visita fuera de alcance de esta entrega: queda null.
        motivo: null,
    }
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

```bash
npx jest src/services/planificacion/buscadorCartera.spec.ts
```
Esperado: PASS (10 tests).

- [ ] **Step 6: Escribir el test del núcleo**

Archivo `src/services/planificacion/BuscadorCarteraService.spec.ts`:

```ts
import { BuscadorCarteraService } from './BuscadorCarteraService'
import { GerenciaRotacionService } from './GerenciaRotacionService'
import { ClientRepository } from '../../repositories/ClientRepository'
import { RotacionClienteRepository } from '../../repositories/RotacionClienteRepository'
import { RotacionSemanaRepository } from '../../repositories/RotacionSemanaRepository'
import { CustomError } from '../../utils/errors'

jest.mock('./GerenciaRotacionService')
jest.mock('../../repositories/ClientRepository')
jest.mock('../../repositories/RotacionClienteRepository')
jest.mock('../../repositories/RotacionSemanaRepository')

const rotacionAbierta = {
    id: 7,
    codigoParticularVendedor: 'V 2',
    estado: 'abierta',
    fechaInicio: '2026-09-01T12:00:00.000Z',
    fechaFin: null,
    descripcion: 'Ronda Septiembre',
    orden: null,
}

beforeEach(() => {
    jest.clearAllMocks()
    ;(GerenciaRotacionService.requireRotacionDe as jest.Mock).mockResolvedValue(rotacionAbierta)
    ;(RotacionSemanaRepository.findDescripciones as jest.Mock).mockResolvedValue(
        new Map([[2, 'Zárate']]),
    )
})

describe('buscarEnCartera', () => {
    it('busca solo en la cartera del vendedor que se le pasa', async () => {
        ;(ClientRepository.getByVendor as jest.Mock).mockResolvedValue([
            { CODIGOPARTICULAR: 'P001', RAZONSOCIAL: 'Almacén Zárate' },
        ])
        ;(
            RotacionClienteRepository.findPorRotacionYClienteTodasLasFilas as jest.Mock
        ).mockResolvedValue([])

        const r = await BuscadorCarteraService.buscarEnCartera('V 2', 7, 'alma')

        expect(ClientRepository.getByVendor).toHaveBeenCalledWith('V 2')
        expect(GerenciaRotacionService.requireRotacionDe).toHaveBeenCalledWith('V 2', 7)
        expect(r).toHaveLength(1)
        expect(r[0].estado).toBe('sin_plan')
    })

    it('resuelve el estado contra la rotación que se le pasa', async () => {
        ;(ClientRepository.getByVendor as jest.Mock).mockResolvedValue([
            { CODIGOPARTICULAR: 'P001', RAZONSOCIAL: 'Almacén Zárate' },
        ])
        ;(
            RotacionClienteRepository.findPorRotacionYClienteTodasLasFilas as jest.Mock
        ).mockResolvedValue([
            {
                id: 11,
                rotacionId: 7,
                codigoParticularCliente: 'P001',
                semana: 2,
                dia: 3,
                esExtra: false,
                eliminado: false,
                resolucionId: null,
                tipoResolucion: null,
                fechaFin: null,
            },
        ])

        const r = await BuscadorCarteraService.buscarEnCartera('V 2', 7, 'alma')

        expect(
            RotacionClienteRepository.findPorRotacionYClienteTodasLasFilas,
        ).toHaveBeenCalledWith(7, 'P001')
        expect(r[0]).toMatchObject({
            estado: 'pendiente',
            semana: 2,
            dia: 3,
            descripcionZona: 'Zárate',
        })
    })

    it('una fila quitada no cuenta como planificada', async () => {
        ;(ClientRepository.getByVendor as jest.Mock).mockResolvedValue([
            { CODIGOPARTICULAR: 'P001', RAZONSOCIAL: 'Almacén Zárate' },
        ])
        ;(
            RotacionClienteRepository.findPorRotacionYClienteTodasLasFilas as jest.Mock
        ).mockResolvedValue([
            {
                id: 11,
                rotacionId: 7,
                codigoParticularCliente: 'P001',
                semana: 2,
                dia: 3,
                esExtra: false,
                eliminado: true,
                resolucionId: null,
                tipoResolucion: null,
                fechaFin: null,
            },
        ])

        const r = await BuscadorCarteraService.buscarEnCartera('V 2', 7, 'alma')

        expect(r[0].estado).toBe('sin_plan')
    })

    it('con menos de 2 caracteres no consulta nada', async () => {
        const r = await BuscadorCarteraService.buscarEnCartera('V 2', 7, 'a')

        expect(r).toEqual([])
        expect(ClientRepository.getByVendor).not.toHaveBeenCalled()
    })

    it('propaga el 404 de una rotación que no es de ese vendedor', async () => {
        ;(GerenciaRotacionService.requireRotacionDe as jest.Mock).mockRejectedValue(
            new CustomError(404, 'Rotación no encontrada para este vendedor.', {
                code: 'ROTACION_NOT_FOUND',
            }),
        )

        await expect(BuscadorCarteraService.buscarEnCartera('V 2', 99, 'alma')).rejects.toThrow(
            CustomError,
        )
    })
})
```

- [ ] **Step 7: Correr el test y verificar que falla**

```bash
npx jest src/services/planificacion/BuscadorCarteraService.spec.ts
```
Esperado: FAIL — `Cannot find module './BuscadorCarteraService'`.

- [ ] **Step 8: Crear el núcleo**

Archivo `src/services/planificacion/BuscadorCarteraService.ts`:

```ts
import { ClientRepository } from '../../repositories/ClientRepository'
import { RotacionClienteRepository } from '../../repositories/RotacionClienteRepository'
import { RotacionSemanaRepository } from '../../repositories/RotacionSemanaRepository'
import { GerenciaRotacionService } from './GerenciaRotacionService'
import { filtrarPorTexto, mapEstado, normalizar, sinPlan } from './buscadorCartera'
import { IResultadoBuscadorGeneral } from '../../types/planificacion'

/** Mismo mínimo que el front: el buscador itera una query por cliente, así que una
 *  búsqueda de una letra sobre una cartera entera es cara de verdad. */
const MIN_CARACTERES = 2

/**
 * El buscador de cartera del dominio, **sin rol**: el vendedor y la rotación son
 * parámetros.
 *
 * Es el único lugar de la API que busca clientes por texto dentro de una vuelta, y lo
 * usan los dos llamadores que existen:
 *
 *  - `BuscadorService` (self-service): resuelve el vendedor del token y la rotación del
 *    ciclo abierto, y delega acá.
 *  - las rutas de gerencia (`/vendedores/:codigo/rotaciones/:rotacionId/buscador`): los
 *    recibe explícitos de la URL, con el permiso dado por el rol.
 *
 * La separación es por **de dónde salen vendedor y rotación**, no por quién pregunta: un
 * servicio que ramifique por rol adentro de cada método es lo que este diseño evita
 * (ver "Descartado" en el spec 2026-09-09).
 */
export class BuscadorCarteraService {
    /**
     * La cartera del vendedor filtrada por texto, con el estado de cada cliente en ESTA
     * rotación.
     *
     * Las filas quitadas (soft-delete) se descartan antes de leer el estado: una fila
     * quitada no está planificada, y contarla mostraría "pendiente el martes" para un
     * cliente que ya se sacó de la vuelta.
     *
     * Itera cliente por cliente (una query cada uno). Está bien para el tamaño de cartera
     * de un vendedor; si hiciera falta, la mejora es una sola query con `IN (:codigos)`.
     */
    static async buscarEnCartera(
        vendedor: string,
        rotacionId: number,
        texto: string,
    ): Promise<IResultadoBuscadorGeneral[]> {
        if (normalizar(texto).trim().length < MIN_CARACTERES) return []

        await GerenciaRotacionService.requireRotacionDe(vendedor, rotacionId)

        const clientes = await ClientRepository.getByVendor(vendedor)
        const filtrados = filtrarPorTexto(clientes, texto)

        // Una sola vez para toda la búsqueda, no una por cliente: misma fuente que usa el
        // grid y el header del vendedor, así la zona se llama igual en los tres lugares.
        const descripciones = await RotacionSemanaRepository.findDescripciones(rotacionId)

        const resultados: IResultadoBuscadorGeneral[] = []
        for (const cliente of filtrados) {
            const filas = await RotacionClienteRepository.findPorRotacionYClienteTodasLasFilas(
                rotacionId,
                cliente.CODIGOPARTICULAR,
            )
            const vivas = filas.filter(f => !f.eliminado)
            resultados.push(
                vivas.length === 0 ? sinPlan(cliente) : mapEstado(cliente, vivas, descripciones),
            )
        }
        return resultados
    }
}
```

`requireRotacionDe` vive en `GerenciaRotacionService` y su nombre dice "gerencia", pero lo que hace
no tiene rol: valida que la rotación exista y sea de ese vendedor. Se reusa tal cual en vez de
duplicar la validación; moverlo de casa es un refactor aparte, no de este plan.

- [ ] **Step 9: Correr el test y verificar que pasa**

```bash
npx jest src/services/planificacion/BuscadorCarteraService.spec.ts
```
Esperado: PASS (5 tests).

- [ ] **Step 10: Hacer que `BuscadorService` delegue**

En `src/services/planificacion/BuscadorService.ts`:

1. Borrar la función `normalizar` de módulo, el `type FilaConResolucion` local y los dos métodos
   privados `sinPlan` y `mapEstado` completos.
2. Ajustar imports: agregar

```ts
import { BuscadorCarteraService } from './BuscadorCarteraService'
import { filtrarPorTexto, sinPlan } from './buscadorCartera'
```

3. Reemplazar el método `buscarEnCartera` completo por la versión que delega:

```ts
    /**
     * Buscador general de solo lectura sobre toda la cartera del vendedor logueado.
     *
     * Capa fina: lo único propio del self-service es de dónde salen el vendedor (token) y
     * la rotación (la abierta). La búsqueda en sí es `BuscadorCarteraService`, la misma
     * que usa la vista de gerencia.
     */
    static async buscarEnCartera(user: IUser, texto: string): Promise<IResultadoBuscadorGeneral[]> {
        const vendedor = await resolveSellerCode(user)
        const rotacion = await RotacionRepository.findAbiertaByVendedor(vendedor)
        // Sin rotación abierta no hay nada contra qué resolver el estado: el vendedor
        // igual ve su cartera, toda como 'sin_plan'.
        if (!rotacion) {
            const clientes = await ClientRepository.getByVendor(vendedor)
            return filtrarPorTexto(clientes, texto).map(sinPlan)
        }
        return BuscadorCarteraService.buscarEnCartera(vendedor, rotacion.id, texto)
    }
```

4. `consultar` y `confirmarExtra` **no se tocan en este task**: `consultar` tiene su propia lógica
   de zona-actual/otra-zona que no comparte con gerencia, y `confirmarExtra` se migra en Task 3,
   cuando el núcleo ya tenga `agregarExtra`.

- [ ] **Step 11: Verificar que nada se rompió**

```bash
npx tsc --noEmit -p tsconfig.json
npx jest src/services/planificacion src/controllers
```
Esperado: `tsc` sin errores; toda la suite de `services/planificacion` y `controllers` en PASS.

- [ ] **Step 12: Commit**

```bash
git add src/services/planificacion/buscadorCartera.ts src/services/planificacion/buscadorCartera.spec.ts src/services/planificacion/BuscadorCarteraService.ts src/services/planificacion/BuscadorCarteraService.spec.ts src/services/planificacion/BuscadorService.ts
git commit -m "refactor(planificacion): buscador de cartera sin rol, con vendedor y rotación explícitos

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `celdasDelCliente` — ¿ya está planificado, y dónde?

La consulta que el front hace **antes** de confirmar, para decidir entre las ramas de la tabla del
spec (agregar directo / avisar que ya está en otra celda / no ofrecer nada porque ya está en esta
misma celda).

**Files:**
- Modify: `api-vendedores/src/types/planificacion.ts`
- Modify: `api-vendedores/src/services/planificacion/BuscadorCarteraService.ts`
- Modify: `api-vendedores/src/services/planificacion/BuscadorCarteraService.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ICeldaPlanificada {
      rotacionClienteId: number
      semana: number
      dia: number
      eliminado: boolean
  }
  export interface IClienteEnRotacion {
      yaPlanificado: boolean
      celdas: ICeldaPlanificada[]
  }
  ```
  `BuscadorCarteraService.celdasDelCliente(vendedor: string, rotacionId: number, codigoCliente: string): Promise<IClienteEnRotacion>` — la consumen Task 4 (controller) y Task 7 (el diálogo del front, vía el tipo espejo de `app-planificacion`).

**Por qué `celdas[]` y no el `{ yaPlanificado, semana?, dia? }` del spec:** un cliente quincenal
tiene **dos** filas en la vuelta por diseño (ver `docs/dominio/modelo.md`), así que con una sola
`(semana, dia)` el front no puede distinguir "está en otra celda" de "está justo en la celda que
abrí" cuando hay dos — y esa distinción es la que decide si se ofrece la acción o no.
`yaPlanificado` se mantiene (es `celdas.some(c => !c.eliminado)`) porque es lo que resuelve el caso
simple.

- [ ] **Step 1: Escribir el test**

Agregar al final de `BuscadorCarteraService.spec.ts`:

```ts
describe('celdasDelCliente', () => {
    const fila = (over: Record<string, unknown> = {}) => ({
        id: 11,
        rotacionId: 7,
        codigoParticularCliente: 'P001',
        semana: 2,
        dia: 3,
        esExtra: false,
        eliminado: false,
        resolucionId: null,
        tipoResolucion: null,
        fechaFin: null,
        ...over,
    })

    it('sin filas, el cliente no está planificado', async () => {
        ;(
            RotacionClienteRepository.findPorRotacionYClienteTodasLasFilas as jest.Mock
        ).mockResolvedValue([])

        const r = await BuscadorCarteraService.celdasDelCliente('V 2', 7, 'P001')

        expect(r).toEqual({ yaPlanificado: false, celdas: [] })
    })

    it('devuelve la celda donde ya está, con su fila', async () => {
        ;(
            RotacionClienteRepository.findPorRotacionYClienteTodasLasFilas as jest.Mock
        ).mockResolvedValue([fila()])

        const r = await BuscadorCarteraService.celdasDelCliente('V 2', 7, 'P001')

        expect(r.yaPlanificado).toBe(true)
        expect(r.celdas).toEqual([
            { rotacionClienteId: 11, semana: 2, dia: 3, eliminado: false },
        ])
    })

    it('un quincenal informa las DOS celdas', async () => {
        ;(
            RotacionClienteRepository.findPorRotacionYClienteTodasLasFilas as jest.Mock
        ).mockResolvedValue([
            fila({ id: 11, semana: 1, dia: 2 }),
            fila({ id: 12, semana: 3, dia: 2 }),
        ])

        const r = await BuscadorCarteraService.celdasDelCliente('V 2', 7, 'P001')

        expect(r.celdas.map(c => [c.semana, c.dia])).toEqual([
            [1, 2],
            [3, 2],
        ])
    })

    it('una fila quitada viaja marcada y NO cuenta como planificada', async () => {
        ;(
            RotacionClienteRepository.findPorRotacionYClienteTodasLasFilas as jest.Mock
        ).mockResolvedValue([fila({ eliminado: true })])

        const r = await BuscadorCarteraService.celdasDelCliente('V 2', 7, 'P001')

        // La celda igual viaja: el front necesita saber que ahí hay una fila borrada para
        // ofrecer "Agregar" (que la restaura) en vez de chocar contra el UNIQUE.
        expect(r).toEqual({
            yaPlanificado: false,
            celdas: [{ rotacionClienteId: 11, semana: 2, dia: 3, eliminado: true }],
        })
    })

    it('valida que la rotación sea de ese vendedor', async () => {
        ;(
            RotacionClienteRepository.findPorRotacionYClienteTodasLasFilas as jest.Mock
        ).mockResolvedValue([])

        await BuscadorCarteraService.celdasDelCliente('V 2', 7, 'P001')

        expect(GerenciaRotacionService.requireRotacionDe).toHaveBeenCalledWith('V 2', 7)
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx jest src/services/planificacion/BuscadorCarteraService.spec.ts -t celdasDelCliente
```
Esperado: FAIL — `BuscadorCarteraService.celdasDelCliente is not a function`.

- [ ] **Step 3: Agregar los tipos**

En `src/types/planificacion.ts`, después de `IResultadoBuscadorGeneral`:

```ts
/** Una celda de la rotación donde el cliente ya tiene fila. */
export interface ICeldaPlanificada {
    rotacionClienteId: number
    semana: number
    dia: number
    /** true = la fila está quitada (soft-delete): agregar ahí la restaura. */
    eliminado: boolean
}

/**
 * Dónde está un cliente dentro de una rotación.
 *
 * `celdas` y no una sola `(semana, dia)`: un quincenal tiene dos filas por diseño, y
 * quien pregunta necesita saber si alguna cae exactamente en la celda que se está por
 * crear (ahí no se ofrece la acción) o si están en otras (ahí se avisa y se puede
 * forzar).
 */
export interface IClienteEnRotacion {
    /** true si tiene al menos una fila NO quitada. */
    yaPlanificado: boolean
    celdas: ICeldaPlanificada[]
}
```

- [ ] **Step 4: Implementar el método**

En `BuscadorCarteraService.ts`, agregar `IClienteEnRotacion` al import de tipos y el método:

```ts
    /**
     * ¿Este cliente ya tiene fila en esta rotación, y dónde?
     *
     * Incluye las filas resueltas (una visita ya hecha sigue siendo "ya está planificado
     * ahí": duplicarla es casi siempre un error de tipeo) y también las quitadas,
     * marcadas — quien pregunta las trata distinto: en una celda con fila viva no se
     * ofrece agregar, en una con fila quitada agregar la restaura.
     */
    static async celdasDelCliente(
        vendedor: string,
        rotacionId: number,
        codigoCliente: string,
    ): Promise<IClienteEnRotacion> {
        await GerenciaRotacionService.requireRotacionDe(vendedor, rotacionId)

        const filas = await RotacionClienteRepository.findPorRotacionYClienteTodasLasFilas(
            rotacionId,
            codigoCliente,
        )
        const celdas = filas.map(f => ({
            rotacionClienteId: f.id,
            semana: f.semana,
            dia: f.dia,
            eliminado: f.eliminado,
        }))
        return { yaPlanificado: celdas.some(c => !c.eliminado), celdas }
    }
```

- [ ] **Step 5: Correr el test y verificar que pasa**

```bash
npx jest src/services/planificacion/BuscadorCarteraService.spec.ts
```
Esperado: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/planificacion.ts src/services/planificacion/BuscadorCarteraService.ts src/services/planificacion/BuscadorCarteraService.spec.ts
git commit -m "feat(planificacion): consultar en qué celdas de la rotación está un cliente

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `agregarExtra` — crear la fila, y que el vendedor use el mismo camino

**Files:**
- Modify: `api-vendedores/src/services/planificacion/BuscadorCarteraService.ts`
- Modify: `api-vendedores/src/services/planificacion/BuscadorCarteraService.spec.ts`
- Modify: `api-vendedores/src/services/planificacion/GerenciaRotacionService.ts`
- Modify: `api-vendedores/src/services/planificacion/BuscadorService.ts`

**Interfaces:**
- Consumes: `RotacionSemanaRepository.semanasDelSet(rotacionId)`; `RotacionClienteRepository.crearExtra(rotacionId, codigo, semana, dia)`; `RotacionClienteRepository.restaurar(id)`; `ClientRepository.getByVendor(vendedor, codigoCliente)`.
- Produces:
  - `GerenciaRotacionService.requireRotacionEditableDe(vendedor: string, rotacionId: number): Promise<IRotacion>`
  - `BuscadorCarteraService.agregarExtra(vendedor: string, rotacionId: number, codigoCliente: string, semana: number, dia: number): Promise<IRotacionCliente>` — devuelve la **fila cruda**: el vendedor la enriquece a `IAgendaClient` (28 campos) y gerencia la proyecta a `IAgendaClientAdmin` (7). Un solo tipo de retorno no serviría a los dos.
  - La consumen Task 4 (controller) y `BuscadorService.confirmarExtra`.

Reglas, en orden (todas antes de escribir):
1. la rotación es de ese vendedor (`requireRotacionDe` → 404) y es editable (`requireEditable` → 409 `ROTACION_CERRADA`).
   **Desvío chico del spec:** el spec dice que el backend "no restringe por estado de la rotación". Sí restringe `cerrada`/`cancelada`, igual que `reacomodar`, `quitarCliente` y `restaurarCliente` — escribir en una vuelta ya cerrada corrompe la línea de base y ninguna otra escritura del dominio lo permite. Lo que el spec pedía de verdad —que una rotación **programada** funcione aunque la UI no ofrezca el botón— se cumple: `requireEditable` acepta `abierta` y `programada`;
2. `dia` entre 1 y 5 → 400 `DIA_INVALIDO` (mismo chequeo que `reacomodar`);
3. `semana` en el set de la rotación → 422 `SEMANA_FUERA_DEL_SET` (mismo chequeo que `reacomodar`: el `CHECK` de la tabla solo pide `semana >= 1`);
4. el cliente es de la cartera de ESE vendedor → 404 `CLIENTE_FUERA_DE_CARTERA`. Sin esto la ruta de gerencia deja plantar cualquier cliente del padrón en la ruta de cualquiera, y el filtro del buscador sería solo cosmético;
5. `crearExtra` (idempotente contra `uq_rotacion_cliente`); si lo que devuelve está `eliminado`, se restaura.

`requireEditable` es privado en `GerenciaRotacionService`: se agrega un método público
`requireRotacionEditableDe(vendedor, rotacionId)` que hace las dos validaciones juntas y devuelve la
rotación. (Los métodos internos de `GerenciaRotacionService` que hoy hacen las dos en dos líneas se
dejan como están: no es su task.)

- [ ] **Step 1: Escribir el test**

Agregar al final de `BuscadorCarteraService.spec.ts`:

```ts
describe('agregarExtra', () => {
    beforeEach(() => {
        ;(GerenciaRotacionService.requireRotacionEditableDe as jest.Mock).mockResolvedValue(
            rotacionAbierta,
        )
        ;(RotacionSemanaRepository.semanasDelSet as jest.Mock).mockResolvedValue([1, 2, 3])
        ;(ClientRepository.getByVendor as jest.Mock).mockResolvedValue([
            { CODIGOPARTICULAR: 'P001', RAZONSOCIAL: 'Almacén Zárate' },
        ])
        ;(RotacionClienteRepository.crearExtra as jest.Mock).mockResolvedValue({
            id: 44,
            rotacionId: 7,
            codigoParticularCliente: 'P001',
            semana: 2,
            dia: 3,
            esExtra: true,
            eliminado: false,
        })
    })

    it('crea la fila en la celda pedida y la devuelve', async () => {
        const fila = await BuscadorCarteraService.agregarExtra('V 2', 7, 'P001', 2, 3)

        expect(RotacionClienteRepository.crearExtra).toHaveBeenCalledWith(7, 'P001', 2, 3)
        expect(fila).toMatchObject({ id: 44, semana: 2, dia: 3, esExtra: true, eliminado: false })
    })

    it('rechaza un día fuera de 1..5 sin escribir nada', async () => {
        await expect(
            BuscadorCarteraService.agregarExtra('V 2', 7, 'P001', 2, 9),
        ).rejects.toMatchObject({ statusCode: 400 })
        expect(RotacionClienteRepository.crearExtra).not.toHaveBeenCalled()
    })

    it('rechaza una semana que no está en el set de la rotación', async () => {
        await expect(
            BuscadorCarteraService.agregarExtra('V 2', 7, 'P001', 5, 3),
        ).rejects.toMatchObject({ statusCode: 422 })
        expect(RotacionClienteRepository.crearExtra).not.toHaveBeenCalled()
    })

    it('rechaza un cliente que no es de la cartera de ese vendedor', async () => {
        ;(ClientRepository.getByVendor as jest.Mock).mockResolvedValue([])

        await expect(
            BuscadorCarteraService.agregarExtra('V 2', 7, 'P999', 2, 3),
        ).rejects.toMatchObject({ statusCode: 404 })
        expect(ClientRepository.getByVendor).toHaveBeenCalledWith('V 2', 'P999')
        expect(RotacionClienteRepository.crearExtra).not.toHaveBeenCalled()
    })

    it('es idempotente: si la celda ya tenía la fila, devuelve esa', async () => {
        ;(RotacionClienteRepository.crearExtra as jest.Mock).mockResolvedValue({
            id: 11,
            rotacionId: 7,
            codigoParticularCliente: 'P001',
            semana: 2,
            dia: 3,
            esExtra: false,
            eliminado: false,
        })

        const fila = await BuscadorCarteraService.agregarExtra('V 2', 7, 'P001', 2, 3)

        expect(fila.id).toBe(11)
        expect(RotacionClienteRepository.restaurar).not.toHaveBeenCalled()
    })

    it('funciona sobre una rotación programada, aunque la UI no lo ofrezca', async () => {
        ;(GerenciaRotacionService.requireRotacionEditableDe as jest.Mock).mockResolvedValue({
            ...rotacionAbierta,
            estado: 'programada',
            fechaInicio: null,
            orden: 1,
        })

        await BuscadorCarteraService.agregarExtra('V 2', 7, 'P001', 2, 3)

        expect(RotacionClienteRepository.crearExtra).toHaveBeenCalledWith(7, 'P001', 2, 3)
    })

    it('propaga el 409 de una rotación cerrada', async () => {
        ;(GerenciaRotacionService.requireRotacionEditableDe as jest.Mock).mockRejectedValue(
            new CustomError(409, 'Esta rotación ya terminó, así que no se puede modificar.', {
                code: 'ROTACION_CERRADA',
            }),
        )

        await expect(
            BuscadorCarteraService.agregarExtra('V 2', 7, 'P001', 2, 3),
        ).rejects.toMatchObject({ statusCode: 409 })
        expect(RotacionClienteRepository.crearExtra).not.toHaveBeenCalled()
    })

    it('si la celda tenía una fila QUITADA, la restaura', async () => {
        ;(RotacionClienteRepository.crearExtra as jest.Mock).mockResolvedValue({
            id: 11,
            rotacionId: 7,
            codigoParticularCliente: 'P001',
            semana: 2,
            dia: 3,
            esExtra: false,
            eliminado: true,
        })

        const fila = await BuscadorCarteraService.agregarExtra('V 2', 7, 'P001', 2, 3)

        expect(RotacionClienteRepository.restaurar).toHaveBeenCalledWith(11)
        expect(fila.eliminado).toBe(false)
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx jest src/services/planificacion/BuscadorCarteraService.spec.ts -t agregarExtra
```
Esperado: FAIL — `BuscadorCarteraService.agregarExtra is not a function`.

- [ ] **Step 3: Exponer `requireRotacionEditableDe` en `GerenciaRotacionService`**

En `src/services/planificacion/GerenciaRotacionService.ts`, justo después de `requireRotacionDe`:

```ts
    /**
     * `requireRotacionDe` + `requireEditable` en un solo paso, para los servicios que
     * viven en OTRO archivo (`BuscadorCarteraService`) y no pueden llamar al
     * `requireEditable` privado. Los métodos de esta misma clase siguen usando los dos
     * por separado: varios necesitan la rotación antes de decidir si exigir editable.
     */
    static async requireRotacionEditableDe(
        vendedor: string,
        rotacionId: number,
    ): Promise<IRotacion> {
        const rotacion = await GerenciaRotacionService.requireRotacionDe(vendedor, rotacionId)
        GerenciaRotacionService.requireEditable(rotacion)
        return rotacion
    }
```

- [ ] **Step 4: Implementar `agregarExtra`**

En `BuscadorCarteraService.ts`, completar imports:

```ts
import { CustomError } from '../../utils/errors'
import {
    IClienteEnRotacion,
    IResultadoBuscadorGeneral,
    IRotacionCliente,
} from '../../types/planificacion'
```

y agregar el método:

```ts
    /**
     * Crea la fila `es_extra = 1` en la celda `(semana, dia)`.
     *
     * Devuelve la fila CRUDA a propósito: el vendedor la enriquece a la card completa
     * (`AgendaService.enriquecer`, 28 campos) y gerencia la proyecta a los 7 que dibuja
     * su grilla. Enriquecer acá le impondría a gerencia un payload que no usa.
     */
    static async agregarExtra(
        vendedor: string,
        rotacionId: number,
        codigoCliente: string,
        semana: number,
        dia: number,
    ): Promise<IRotacionCliente> {
        await GerenciaRotacionService.requireRotacionEditableDe(vendedor, rotacionId)

        if (!Number.isInteger(dia) || dia < 1 || dia > 5) {
            throw new CustomError(400, 'El día tiene que estar entre 1 y 5.', {
                code: 'DIA_INVALIDO',
            })
        }

        // La semana válida es la del SET, no "1..5": hay vendedores con cuatro semanas y
        // sets no contiguos, y el CHECK de la tabla solo pide semana >= 1.
        const set = await RotacionSemanaRepository.semanasDelSet(rotacionId)
        if (!set.includes(semana)) {
            throw new CustomError(422, `La semana ${semana} no existe en esta rotación.`, {
                code: 'SEMANA_FUERA_DEL_SET',
                semanas: set,
            })
        }

        // Sin esto, la ruta de gerencia deja plantar cualquier cliente del padrón en la
        // ruta de cualquier vendedor, y el filtro del buscador sería solo cosmético. Es
        // una sola query al warehouse: `getByVendor` ya acepta el código particular.
        const enCartera = await ClientRepository.getByVendor(vendedor, codigoCliente)
        if (enCartera.length === 0) {
            throw new CustomError(404, 'Este cliente no está en la cartera del vendedor.', {
                code: 'CLIENTE_FUERA_DE_CARTERA',
            })
        }

        const fila = await RotacionClienteRepository.crearExtra(
            rotacionId,
            codigoCliente,
            semana,
            dia,
        )

        // `crearExtra` es idempotente contra `uq_rotacion_cliente` y devuelve la fila que
        // ya existía — que puede estar QUITADA (soft-delete). Devolverla así daría un 200
        // con una fila que la grilla dibuja deshabilitada: se toca "Agregar" y
        // aparentemente no pasa nada.
        if (fila.eliminado) {
            await RotacionClienteRepository.restaurar(fila.id)
            return { ...fila, eliminado: false }
        }
        return fila
    }
```

- [ ] **Step 5: Correr el test y verificar que pasa**

```bash
npx jest src/services/planificacion/BuscadorCarteraService.spec.ts
```
Esperado: PASS (18 tests).

- [ ] **Step 6: Hacer que `BuscadorService.confirmarExtra` delegue**

En `src/services/planificacion/BuscadorService.ts`, reemplazar el cuerpo de `confirmarExtra`
manteniendo su firma (el front del vendedor no cambia):

```ts
    static async confirmarExtra(
        user: IUser,
        codigoParticularCliente: string,
        semanaVista: number,
        diaPedido?: number | null,
    ): Promise<IAgendaClient> {
        const vendedor = await resolveSellerCode(user)
        const rotacion = await RotacionRepository.findAbiertaByVendedor(vendedor)
        if (!rotacion) {
            throw new CustomError(404, 'No hay una rotación abierta para este vendedor.', {
                code: 'ROTACION_NO_ENCONTRADA',
            })
        }

        const ciclo = await CicloService.actual(user)
        const semana = ciclo?.semana ?? semanaVista
        const dia = diaPedido ?? diaLaboralDeHoy()

        // Mismo camino de escritura que usa gerencia: valida rotación editable, semana en
        // el set y cliente en cartera, y restaura la fila si esa celda tenía una quitada.
        const fila = await BuscadorCarteraService.agregarExtra(
            vendedor,
            rotacion.id,
            codigoParticularCliente,
            semana,
            dia,
        )

        const [enriquecida] = await AgendaService.enriquecer([fila])
        if (!enriquecida) {
            throw new CustomError(404, 'Cliente no encontrado en el padrón.', {
                code: 'CLIENTE_SIN_CARD',
            })
        }
        return enriquecida
    }
```

Y agregar al final del docstring que ya tiene ese método:

```ts
     * Desde que comparte camino con gerencia, además valida que la rotación sea editable,
     * que la semana esté en el set y que el cliente sea de la cartera del vendedor. Las
     * tres son ciertas por construcción en este flujo (la rotación es su abierta, la
     * semana sale del ciclo, y el cliente lo eligió de SU buscador de cartera): están
     * para que ningún llamador futuro las saltee.
```

- [ ] **Step 7: Verificar todo el backend**

```bash
npx tsc --noEmit -p tsconfig.json
npx jest
```
Esperado: `tsc` sin errores y la suite completa en PASS (mismo conteo que antes, más los 28 tests
nuevos de este dominio).

- [ ] **Step 8: Commit**

```bash
git add src/services/planificacion/BuscadorCarteraService.ts src/services/planificacion/BuscadorCarteraService.spec.ts src/services/planificacion/GerenciaRotacionService.ts src/services/planificacion/BuscadorService.ts
git commit -m "feat(planificacion): crear la visita extra en una celda explícita

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Controller y rutas de gerencia

**Files:**
- Modify: `api-vendedores/src/controllers/planificacionController.ts`
- Modify: `api-vendedores/src/routes/planificacion.ts`

**Interfaces:**
- Produces: los tres handlers `buscarEnCarteraComoGerencia`, `consultarClienteComoGerencia`,
  `agregarClienteExtraComoGerencia`, montados en las tres rutas del bloque de Global Constraints.
  Los consume el front (Task 5).

Acá SÍ tiene sentido el sufijo "ComoGerencia": nombra el handler de una **ruta** de gerencia, igual
que `reacomodarComoGerencia` y `quitarClienteComoGerencia` que ya existen. Lo que no lleva rol es el
servicio.

No lleva tests propios: `planificacionController.spec.ts` no cubre ningún handler de gerencia (el PR
#115 tampoco los agregó), y toda la lógica validable ya está testeada en el servicio. La
verificación es `tsc` + la suite completa.

- [ ] **Step 1: Agregar los tres handlers**

En `src/controllers/planificacionController.ts`, agregar el import:

```ts
import { BuscadorCarteraService } from '../services/planificacion/BuscadorCarteraService'
```

y los handlers, después de `restaurarClienteComoGerencia`:

```ts
    /** Buscador de cartera desde gerencia: el vendedor y la rotación vienen de la URL. */
    static async buscarEnCarteraComoGerencia(req: Request, res: Response): Promise<void> {
        try {
            const rotacionId = parseInt(req.params.rotacionId, 10)
            if (isNaN(rotacionId)) {
                res.status(400).json({ ok: 0, error: 'rotacionId inválido' })
                return
            }
            const texto = firstQueryValue(req.query.q) ?? ''
            const data = await BuscadorCarteraService.buscarEnCartera(
                req.params.codigo,
                rotacionId,
                texto,
            )
            res.status(200).json({ ok: 1, data })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }

    /** ¿Este cliente ya tiene fila en esta rotación, y en qué celdas? */
    static async consultarClienteComoGerencia(req: Request, res: Response): Promise<void> {
        try {
            const rotacionId = parseInt(req.params.rotacionId, 10)
            if (isNaN(rotacionId)) {
                res.status(400).json({ ok: 0, error: 'rotacionId inválido' })
                return
            }
            const data = await BuscadorCarteraService.celdasDelCliente(
                req.params.codigo,
                rotacionId,
                req.params.codigoCliente,
            )
            res.status(200).json({ ok: 1, data })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }

    /**
     * Crea la fila extra en la celda `(semana, dia)` del body y la devuelve proyectada a
     * la card de la grilla de gerencia.
     *
     * A diferencia de la extra del vendedor, acá semana y día son OBLIGATORIOS: no hay
     * "zona en curso" ni "hoy" a los que caer — el botón que se tocó es una celda
     * concreta del grid.
     */
    static async agregarClienteExtraComoGerencia(req: Request, res: Response): Promise<void> {
        try {
            const rotacionId = parseInt(req.params.rotacionId, 10)
            if (isNaN(rotacionId)) {
                res.status(400).json({ ok: 0, error: 'rotacionId inválido' })
                return
            }
            const semana = parseSemana(req.body?.semana)
            if (semana === null) {
                res.status(400).json({ ok: 0, error: 'semana debe ser un entero positivo' })
                return
            }
            const dia = parseDiaLaboral(req.body?.dia)
            if (dia === null || dia === undefined) {
                res.status(400).json({ ok: 0, error: 'dia debe ser un entero entre 1 y 5' })
                return
            }

            const fila = await BuscadorCarteraService.agregarExtra(
                req.params.codigo,
                rotacionId,
                req.params.codigoCliente,
                semana,
                dia,
            )
            const [enriquecida] = await AgendaService.enriquecer([fila])
            if (!enriquecida) {
                res.status(404).json({ ok: 0, error: 'Cliente no encontrado en el padrón.' })
                return
            }
            // Proyección explícita, NO spread: `enriquecer` devuelve los ~28 campos de la
            // card del vendedor (direcciones, descuentos, condiciones de pago) que esta
            // vista no dibuja — mismo criterio que `GerenciaRotacionService.getRotacion`.
            const data: IAgendaClientAdmin = {
                rotacionClienteId: enriquecida.rotacionClienteId,
                codigoParticularCliente: enriquecida.codigoParticularCliente,
                nombreCliente: enriquecida.nombreCliente,
                dia: enriquecida.dia,
                estado: enriquecida.estado,
                // Una fila recién creada no tiene movimientos; una restaurada tampoco
                // cambió de celda. El grid se relee igual al confirmar.
                ultimoMovimiento: null,
                esExtra: enriquecida.esExtra,
                eliminado: false,
            }
            res.status(200).json({ ok: 1, data })
        } catch (err) {
            PlanificacionController.responderError(res, err)
        }
    }
```

`AgendaService` ya está importado en este archivo; agregar `IAgendaClientAdmin` al import de
`../types/planificacion`.

- [ ] **Step 2: Montar las tres rutas**

En `src/routes/planificacion.ts`, antes del bloque de `intercambiar-dias`:

```ts
// Buscador de cartera desde gerencia: misma cartera que ve el vendedor, con el estado de
// cada cliente resuelto contra la rotación de la URL (no contra "la abierta").
router.get(
    '/vendedores/:codigo/rotaciones/:rotacionId/buscador',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.buscarEnCarteraComoGerencia(req, res)
    },
)

// ¿El cliente ya tiene fila en esta rotación, y en qué celdas? Lo consulta el front antes
// de confirmar, para no duplicar una visita por error.
router.get(
    '/vendedores/:codigo/rotaciones/:rotacionId/buscador/cliente/:codigoCliente',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.consultarClienteComoGerencia(req, res)
    },
)

// Crea la fila es_extra en la celda (semana, dia) del body. Idempotente sobre la misma
// celda; si esa celda tenía una fila quitada, la restaura.
router.post(
    '/vendedores/:codigo/rotaciones/:rotacionId/buscador/cliente/:codigoCliente/extra',
    authMiddleware,
    authorize(...ROLES_GERENCIA),
    async (req: Request, res: Response) => {
        PlanificacionController.agregarClienteExtraComoGerencia(req, res)
    },
)
```

- [ ] **Step 3: Verificar toda la suite del backend**

```bash
npx tsc --noEmit -p tsconfig.json
npx jest
```
Esperado: `tsc` sin errores y la suite completa en PASS.

- [ ] **Step 4: Commit**

```bash
git add src/controllers/planificacionController.ts src/routes/planificacion.ts
git commit -m "feat(planificacion): rutas del buscador de cartera para gerencia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
## Task 5: Front — tipos y funciones de API

**Files:**
- Modify: `app-planificacion/src/types/planificacion.ts`
- Modify: `app-planificacion/src/api/planificacionAdmin.ts`
- Modify: `app-planificacion/src/api/planificacionAdmin.test.ts`

**Interfaces:**
- Produces (en `src/types/planificacion.ts`): `ICeldaPlanificada`, `IClienteEnRotacion` — espejo exacto de los tipos del backend (Task 2).
- Produces (en `src/api/planificacionAdmin.ts`):
  - `buscarEnCarteraAdmin(codigo: string, rotacionId: number, texto: string): Promise<IResultadoBuscadorGeneral[]>`
  - `consultarClienteAdmin(codigo: string, rotacionId: number, codigoCliente: string): Promise<IClienteEnRotacion>`
  - `agregarClienteExtraAdmin(codigo: string, rotacionId: number, codigoCliente: string, semana: number, dia: number): Promise<IAgendaClientAdmin>`
  - Las consume Task 6.

- [ ] **Step 1: Crear la rama del front**

```bash
cd "C:/Users/matia/OneDrive/Documentos/distri/app-planificacion"
git checkout master
git checkout -b feat/agregar-cliente-extra-gerencia
```

- [ ] **Step 2: Escribir los tests**

Agregar al final de `src/api/planificacionAdmin.test.ts`, y a su bloque de imports `buscarEnCarteraAdmin, consultarClienteAdmin, agregarClienteExtraAdmin`:

```ts
describe('buscarEnCarteraAdmin', () => {
    it('busca en la cartera del vendedor dentro de una rotación', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({
            data: { ok: 1, data: [{ codigoParticularCliente: 'P001', estado: 'sin_plan' }] },
        } as never)

        const r = await buscarEnCarteraAdmin('V 2', 7, 'alma')

        expect(apiClient.get).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/buscador',
            { params: { q: 'alma' } },
        )
        expect(r[0].codigoParticularCliente).toBe('P001')
    })
})

describe('consultarClienteAdmin', () => {
    it('encodea el código del cliente y desenvuelve la consulta', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({
            data: { ok: 1, data: { yaPlanificado: false, celdas: [] } },
        } as never)

        const r = await consultarClienteAdmin('V 2', 7, 'P 001')

        expect(apiClient.get).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/buscador/cliente/P%20001',
        )
        expect(r).toEqual({ yaPlanificado: false, celdas: [] })
    })
})

describe('agregarClienteExtraAdmin', () => {
    it('manda la celda destino en el body y devuelve la fila creada', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({
            data: { ok: 1, data: { rotacionClienteId: 44, esExtra: true } },
        } as never)

        const card = await agregarClienteExtraAdmin('V 2', 7, 'P001', 2, 3)

        expect(apiClient.post).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/buscador/cliente/P001/extra',
            { semana: 2, dia: 3 },
        )
        expect(card.rotacionClienteId).toBe(44)
    })
})
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

```bash
npx vitest run src/api/planificacionAdmin.test.ts
```
Esperado: FAIL — no existen esas exportaciones.

- [ ] **Step 4: Agregar los tipos**

En `src/types/planificacion.ts`, después de `IResultadoBuscadorGeneral`:

```ts
/** Una celda de la rotación donde el cliente ya tiene fila (buscador de gerencia). */
export interface ICeldaPlanificada {
    rotacionClienteId: number
    semana: number
    dia: number
    /** true = la fila está quitada de la rotación: agregar ahí la restaura. */
    eliminado: boolean
}

/**
 * La consulta previa del buscador de gerencia. `celdas` y no una sola `(semana, dia)`
 * porque un cliente quincenal tiene dos filas por diseño: el front necesita distinguir
 * "ya está en OTRA celda" (avisa y deja forzar) de "ya está en ESTA celda" (no ofrece
 * la acción, sería un duplicado literal).
 */
export interface IClienteEnRotacion {
    /** true si tiene al menos una fila NO quitada en esta rotación. */
    yaPlanificado: boolean
    celdas: ICeldaPlanificada[]
}
```

- [ ] **Step 5: Agregar las tres funciones**

En `src/api/planificacionAdmin.ts`, extender el import de tipos con `IAgendaClientAdmin`, `IClienteEnRotacion`, `IResultadoBuscadorGeneral`, y agregar al final:

```ts
// ── Buscador de cartera de gerencia (spec 2026-09-09) ──────────────────────────
// Espejo de `/planificacion/buscador/*` del vendedor, con dos diferencias: el vendedor
// y la rotación viajan en la URL (no salen del token ni del ciclo abierto), y la celda
// destino es explícita.

/** Busca en toda la cartera del vendedor, con el estado de cada cliente en esta rotación. */
export const buscarEnCarteraAdmin = async (
    codigo: string,
    rotacionId: number,
    texto: string,
): Promise<IResultadoBuscadorGeneral[]> => {
    const res = await apiClient.get(`${base(codigo)}/${rotacionId}/buscador`, {
        params: { q: texto },
    })
    return res.data.data
}

/** ¿El cliente ya tiene fila en esta rotación, y en qué celdas? */
export const consultarClienteAdmin = async (
    codigo: string,
    rotacionId: number,
    codigoCliente: string,
): Promise<IClienteEnRotacion> => {
    const res = await apiClient.get(
        `${base(codigo)}/${rotacionId}/buscador/cliente/${encodeURIComponent(codigoCliente)}`,
    )
    return res.data.data
}

/** Crea la fila `es_extra` en la celda `(semana, dia)`. Idempotente sobre la misma celda. */
export const agregarClienteExtraAdmin = async (
    codigo: string,
    rotacionId: number,
    codigoCliente: string,
    semana: number,
    dia: number,
): Promise<IAgendaClientAdmin> => {
    const res = await apiClient.post(
        `${base(codigo)}/${rotacionId}/buscador/cliente/${encodeURIComponent(codigoCliente)}/extra`,
        { semana, dia },
    )
    return res.data.data
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

```bash
npx vitest run src/api/planificacionAdmin.test.ts
```
Esperado: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/planificacion.ts src/api/planificacionAdmin.ts src/api/planificacionAdmin.test.ts
git commit -m "feat(ruta): API del buscador de cartera de gerencia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Front — hooks

**Files:**
- Create: `app-planificacion/src/hooks/useTextoDebounced.ts`
- Create: `app-planificacion/src/hooks/useTextoDebounced.test.ts`
- Modify: `app-planificacion/src/hooks/useBuscador.ts`
- Modify: `app-planificacion/src/hooks/useRotacionAdmin.ts`
- Modify: `app-planificacion/src/hooks/useRotacionAdmin.test.tsx`

**Interfaces:**
- Produces: `useTextoDebounced(texto: string, ms?: number): string`
- Produces (en `useRotacionAdmin.ts`):
  - `useBuscarEnCarteraAdmin(codigo: string, rotacionId: number, texto: string)` → el objeto de `useQuery` más `buscando: boolean`
  - `useConsultarClienteAdmin(codigo: string)` → mutation `{ rotacionId: number; codigoCliente: string }` → `IClienteEnRotacion`
  - `useAgregarClienteExtraAdmin(codigo: string)` → mutation `{ rotacionId: number; codigoCliente: string; semana: number; dia: number }` → `IAgendaClientAdmin`, invalida `rotacionAdminKeys.grid(codigo, rotacionId)`
  - Los consume Task 7.

- [ ] **Step 1: Escribir el test del debounce**

Archivo `src/hooks/useTextoDebounced.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTextoDebounced } from './useTextoDebounced'

afterEach(() => vi.useRealTimers())

describe('useTextoDebounced', () => {
    it('devuelve el valor inicial sin esperar', () => {
        const { result } = renderHook(() => useTextoDebounced('alma'))
        expect(result.current).toBe('alma')
    })

    it('no propaga el valor nuevo hasta que pasa el delay', () => {
        vi.useFakeTimers()
        const { result, rerender } = renderHook(({ t }) => useTextoDebounced(t), {
            initialProps: { t: 'al' },
        })

        rerender({ t: 'alma' })
        expect(result.current).toBe('al')

        act(() => vi.advanceTimersByTime(300))
        expect(result.current).toBe('alma')
    })

    it('cada tecla reinicia la espera: solo llega el último valor', () => {
        vi.useFakeTimers()
        const { result, rerender } = renderHook(({ t }) => useTextoDebounced(t), {
            initialProps: { t: 'a' },
        })

        rerender({ t: 'al' })
        act(() => vi.advanceTimersByTime(200))
        rerender({ t: 'alm' })
        act(() => vi.advanceTimersByTime(200))
        expect(result.current).toBe('a')

        act(() => vi.advanceTimersByTime(100))
        expect(result.current).toBe('alm')
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/hooks/useTextoDebounced.test.ts
```
Esperado: FAIL — `Cannot find module './useTextoDebounced'`.

- [ ] **Step 3: Crear el hook y usarlo en `useBuscador`**

Archivo `src/hooks/useTextoDebounced.ts`:

```ts
import { useEffect, useState } from 'react'

/** 300ms: el mismo valor que venía inline en `useBuscador`. */
const DEBOUNCE_MS = 300

/**
 * El texto de un input, atrasado hasta que el usuario deja de tipear.
 *
 * Existe porque los dos buscadores de cartera (el del vendedor y el de gerencia) piden
 * lo mismo: el endpoint resuelve el estado cliente por cliente, una query cada uno, así
 * que una request por tecla sobre una cartera entera es cara de verdad.
 */
export function useTextoDebounced(texto: string, ms: number = DEBOUNCE_MS): string {
    const [debounced, setDebounced] = useState(texto)
    useEffect(() => {
        const id = setTimeout(() => setDebounced(texto), ms)
        return () => clearTimeout(id)
    }, [texto, ms])
    return debounced
}
```

En `src/hooks/useBuscador.ts`: borrar `const DEBOUNCE_MS = 300`, el `useState`/`useEffect` del debounce y los imports de `useEffect`/`useState` si quedan sin uso; importar `useTextoDebounced` y arrancar `useBuscarEnCartera` con:

```ts
export function useBuscarEnCartera(texto: string) {
    const debounced = useTextoDebounced(texto)

    const listo = debounced.trim().length >= 2
```

(el resto del cuerpo queda igual).

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
npx vitest run src/hooks/useTextoDebounced.test.ts
npx vitest run src/components/buscador
```
Esperado: PASS los dos (el segundo cubre que `BuscadorDiaSheet`/`BuscadorGeneralPanel` siguen funcionando con el hook extraído; si no existieran tests ahí, alcanza con `npx vitest run` al final del task).

- [ ] **Step 5: Escribir los tests de los tres hooks nuevos**

Agregar al final de `src/hooks/useRotacionAdmin.test.tsx`, y a sus imports `useAgregarClienteExtraAdmin, useBuscarEnCarteraAdmin, useConsultarClienteAdmin`:

```tsx
describe('useBuscarEnCarteraAdmin', () => {
    it('no consulta con menos de 2 caracteres', () => {
        renderHook(() => useBuscarEnCarteraAdmin('V 2', 7, 'a'), { wrapper })
        expect(api.buscarEnCarteraAdmin).not.toHaveBeenCalled()
    })

    it('busca con el vendedor y la rotación del grid', async () => {
        vi.mocked(api.buscarEnCarteraAdmin).mockResolvedValue([
            {
                codigoParticularCliente: 'P001',
                nombreCliente: 'Almacén Zárate',
                estado: 'sin_plan',
                semana: null,
                dia: null,
                descripcionZona: null,
                fecha: null,
                motivo: null,
            },
        ])

        const { result } = renderHook(() => useBuscarEnCarteraAdmin('V 2', 7, 'alma'), {
            wrapper,
        })

        await waitFor(() => expect(result.current.data).toBeDefined())
        expect(api.buscarEnCarteraAdmin).toHaveBeenCalledWith('V 2', 7, 'alma')
    })
})

describe('useAgregarClienteExtraAdmin', () => {
    it('crea la fila y releé el grid de esa rotación', async () => {
        vi.mocked(api.agregarClienteExtraAdmin).mockResolvedValue({
            rotacionClienteId: 44,
            codigoParticularCliente: 'P001',
            nombreCliente: 'Almacén Zárate',
            dia: 3,
            estado: 'pendiente',
            ultimoMovimiento: null,
            esExtra: true,
            eliminado: false,
        } as IAgendaClientAdmin)

        const { result } = renderHook(() => useAgregarClienteExtraAdmin('V 2'), { wrapper })
        result.current.mutate({ rotacionId: 7, codigoCliente: 'P001', semana: 2, dia: 3 })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(api.agregarClienteExtraAdmin).toHaveBeenCalledWith('V 2', 7, 'P001', 2, 3)
    })
})

describe('useConsultarClienteAdmin', () => {
    it('consulta un cliente puntual sin invalidar nada', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: true,
            celdas: [{ rotacionClienteId: 11, semana: 1, dia: 2, eliminado: false }],
        })

        const { result } = renderHook(() => useConsultarClienteAdmin('V 2'), { wrapper })
        const consulta = await result.current.mutateAsync({
            rotacionId: 7,
            codigoCliente: 'P001',
        })

        expect(api.consultarClienteAdmin).toHaveBeenCalledWith('V 2', 7, 'P001')
        expect(consulta.yaPlanificado).toBe(true)
    })
})
```

- [ ] **Step 6: Correr los tests y verificar que fallan**

```bash
npx vitest run src/hooks/useRotacionAdmin.test.tsx
```
Esperado: FAIL — no existen esos hooks.

- [ ] **Step 7: Implementar los tres hooks**

En `src/hooks/useRotacionAdmin.ts`, extender el import de `@/api/planificacionAdmin` con `agregarClienteExtraAdmin, buscarEnCarteraAdmin, consultarClienteAdmin`, importar `useTextoDebounced` y agregar al final:

```ts
// ── Buscador de cartera de gerencia (spec 2026-09-09) ──────────────────────────

/** Mismo mínimo que el backend, que devuelve `[]` por debajo de 2 caracteres. */
const MIN_CARACTERES = 2

/**
 * Busca en la cartera del vendedor, dentro de una rotación concreta.
 *
 * Mismo patrón que `useBuscarEnCartera` (el del vendedor): debounce y mínimo de 2
 * caracteres, porque el endpoint resuelve el estado cliente por cliente.
 */
export function useBuscarEnCarteraAdmin(
    codigo: string,
    rotacionId: number,
    texto: string,
) {
    const debounced = useTextoDebounced(texto)
    const listo = debounced.trim().length >= MIN_CARACTERES

    const query = useQuery({
        queryKey: [...rotacionAdminKeys.vendedor(codigo), 'buscador', rotacionId, debounced],
        queryFn: () => buscarEnCarteraAdmin(codigo, rotacionId, debounced),
        enabled: listo,
    })

    return {
        ...query,
        // Mientras el debounce no alcanzó al input, lo que hay en pantalla son los
        // resultados del texto ANTERIOR: sin esto, tipear una letra más deja ver 300ms
        // una lista que ya no corresponde, y el "Sin resultados" aparece antes de haber
        // buscado.
        buscando: query.isFetching || (listo && debounced !== texto),
    }
}

/** Solo lectura: no invalida nada. Es la consulta previa a confirmar. */
export function useConsultarClienteAdmin(codigo: string) {
    return useMutation({
        mutationFn: (args: { rotacionId: number; codigoCliente: string }) =>
            consultarClienteAdmin(codigo, args.rotacionId, args.codigoCliente),
    })
}

/**
 * Crea la fila extra. Sin update optimista, igual que `useQuitarClienteAdmin`: la fila
 * nueva la arma el backend (nombre del cliente, estado) y no se puede adivinar acá.
 */
export function useAgregarClienteExtraAdmin(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: {
            rotacionId: number
            codigoCliente: string
            semana: number
            dia: number
        }) =>
            agregarClienteExtraAdmin(
                codigo,
                args.rotacionId,
                args.codigoCliente,
                args.semana,
                args.dia,
            ),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
        },
    })
}
```

- [ ] **Step 8: Correr los tests y verificar que pasan**

```bash
npx vitest run src/hooks
```
Esperado: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useTextoDebounced.ts src/hooks/useTextoDebounced.test.ts src/hooks/useBuscador.ts src/hooks/useRotacionAdmin.ts src/hooks/useRotacionAdmin.test.tsx
git commit -m "feat(ruta): hooks del buscador de cartera de gerencia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Front — el diálogo `AgregarClienteExtraDialog`

**Files:**
- Modify: `app-planificacion/package.json` (dependencia `@radix-ui/react-dialog`)
- Create: `app-planificacion/src/components/ruta/AgregarClienteExtraDialog.tsx`
- Create: `app-planificacion/src/components/ruta/AgregarClienteExtraDialog.test.tsx`

**Interfaces:**
- Consumes: los tres hooks de Task 6; `IResultadoBuscadorGeneral`, `ICeldaPlanificada`.
- Produces:
  ```ts
  interface AgregarClienteExtraDialogProps {
      open: boolean
      onClose: () => void
      codigoVendedor: string
      rotacionId: number
      semana: number
      dia: number            // 1..5
      descripcionSemana: string | null
      onAgregado?: (nombreCliente: string) => void
  }
  export default function AgregarClienteExtraDialog(props): JSX.Element
  ```
  Lo consume Task 9 (`RutaPage`).

Las tres ramas de la tabla del spec, resueltas contra `celdas`:

| estado de la celda destino | qué se muestra |
|---|---|
| hay fila viva en la celda exacta que se abrió | "ya está planificado acá", sin botón de agregar |
| hay fila viva en OTRA celda | aviso con la celda existente + "Cancelar" / "Agregar de todos modos" |
| hay fila QUITADA en la celda exacta | "está quitado de este día" + "Agregar" (el backend la restaura) |
| no hay fila | "Agregar" directo |

- [ ] **Step 1: Declarar la dependencia**

```bash
npm install @radix-ui/react-dialog
```

`@radix-ui/react-dialog` ya está en `package-lock.json` como transitiva de `@radix-ui/react-alert-dialog`: esto solo la declara. Mismo movimiento que hizo el PR #30 con `react-alert-dialog`.

- [ ] **Step 2: Escribir el test**

Archivo `src/components/ruta/AgregarClienteExtraDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as api from '@/api/planificacionAdmin'
import AgregarClienteExtraDialog from './AgregarClienteExtraDialog'

vi.mock('@/api/planificacionAdmin')

const CLIENTE = {
    codigoParticularCliente: 'P001',
    nombreCliente: 'ALMACEN ZARATE',
    estado: 'sin_plan' as const,
    semana: null,
    dia: null,
    descripcionZona: null,
    fecha: null,
    motivo: null,
}

function renderDialog(props: Partial<React.ComponentProps<typeof AgregarClienteExtraDialog>> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <AgregarClienteExtraDialog
                open
                onClose={vi.fn()}
                codigoVendedor="V 2"
                rotacionId={7}
                semana={2}
                dia={3}
                descripcionSemana="Zárate"
                {...props}
            />
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.buscarEnCarteraAdmin).mockResolvedValue([CLIENTE])
})

describe('AgregarClienteExtraDialog', () => {
    it('dice a qué celda va lo que se agregue', () => {
        renderDialog()
        expect(screen.getByText(/Zárate/)).toBeInTheDocument()
        expect(screen.getByText(/MIE/)).toBeInTheDocument()
    })

    it('sin fila previa, agrega directo', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: false,
            celdas: [],
        })
        vi.mocked(api.agregarClienteExtraAdmin).mockResolvedValue({
            rotacionClienteId: 44,
        } as never)
        const onAgregado = vi.fn()

        renderDialog({ onAgregado })
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))
        await userEvent.click(await screen.findByRole('button', { name: 'Agregar' }))

        await waitFor(() =>
            expect(api.agregarClienteExtraAdmin).toHaveBeenCalledWith('V 2', 7, 'P001', 2, 3),
        )
        expect(onAgregado).toHaveBeenCalled()
    })

    it('si ya está en otra celda, avisa y pide confirmar', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: true,
            celdas: [{ rotacionClienteId: 11, semana: 1, dia: 2, eliminado: false }],
        })
        vi.mocked(api.agregarClienteExtraAdmin).mockResolvedValue({
            rotacionClienteId: 44,
        } as never)

        renderDialog()
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))

        expect(await screen.findByText(/ya está planificado/)).toBeInTheDocument()
        expect(screen.getByText(/Semana 1/)).toBeInTheDocument()
        expect(api.agregarClienteExtraAdmin).not.toHaveBeenCalled()

        await userEvent.click(screen.getByRole('button', { name: 'Agregar de todos modos' }))
        await waitFor(() =>
            expect(api.agregarClienteExtraAdmin).toHaveBeenCalledWith('V 2', 7, 'P001', 2, 3),
        )
    })

    it('si ya está en ESTA celda, no ofrece agregar', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: true,
            celdas: [{ rotacionClienteId: 11, semana: 2, dia: 3, eliminado: false }],
        })

        renderDialog()
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))

        expect(await screen.findByText(/ya está planificado acá/)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Agregar de todos modos' }),
        ).not.toBeInTheDocument()
    })

    it('si la fila de esta celda está quitada, agregar la restaura', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: false,
            celdas: [{ rotacionClienteId: 11, semana: 2, dia: 3, eliminado: true }],
        })
        vi.mocked(api.agregarClienteExtraAdmin).mockResolvedValue({
            rotacionClienteId: 11,
        } as never)

        renderDialog()
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))

        expect(await screen.findByText(/está quitado de este día/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
        await waitFor(() => expect(api.agregarClienteExtraAdmin).toHaveBeenCalled())
    })

    it('avisa si la creación falla, sin cerrarse', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: false,
            celdas: [],
        })
        vi.mocked(api.agregarClienteExtraAdmin).mockRejectedValue(new Error('boom'))
        const onClose = vi.fn()

        renderDialog({ onClose })
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))
        await userEvent.click(await screen.findByRole('button', { name: 'Agregar' }))

        expect(await screen.findByText(/No se pudo agregar/)).toBeInTheDocument()
        expect(onClose).not.toHaveBeenCalled()
    })
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

```bash
npx vitest run src/components/ruta/AgregarClienteExtraDialog.test.tsx
```
Esperado: FAIL — `Cannot find module './AgregarClienteExtraDialog'`.

- [ ] **Step 4: Escribir el componente**

Archivo `src/components/ruta/AgregarClienteExtraDialog.tsx`:

```tsx
import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Search } from 'lucide-react'
import {
    useAgregarClienteExtraAdmin,
    useBuscarEnCarteraAdmin,
    useConsultarClienteAdmin,
} from '@/hooks/useRotacionAdmin'
import { titleCaseNombre } from '@/lib/textFormat'
import type { ICeldaPlanificada, IResultadoBuscadorGeneral } from '@/types/planificacion'

const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

interface AgregarClienteExtraDialogProps {
    open: boolean
    onClose: () => void
    codigoVendedor: string
    rotacionId: number
    /** La celda destino: la fija el botón "+" que se tocó, no un selector. */
    semana: number
    dia: number
    /** El nombre de la zona de esa semana, para rotular la celda destino. */
    descripcionSemana: string | null
    /** Se creó (o restauró) la fila. La usa la página para avisar. */
    onAgregado?: (nombreCliente: string) => void
}

/** Lo que se está por confirmar: el cliente elegido y qué se sabe de él en la rotación. */
interface Eleccion {
    codigo: string
    nombre: string
    celdas: ICeldaPlanificada[]
}

/**
 * El buscador que ESCRIBE, colgado del "+" de cada celda del grid de gerencia.
 *
 * Es el equivalente de `BuscadorDiaSheet` (el del vendedor) pero con dos diferencias que
 * NO son cosméticas:
 *
 *  - Va sobre `Dialog` y no sobre `BottomSheet`: el sheet que sube desde abajo es el
 *    patrón mobile del vendedor, y esto vive en la grilla de gerencia (desktop) — misma
 *    razón que documenta `ConfirmDialog`.
 *  - Ofrece SOLO "Agregar". "Traer" (mover una fila pendiente de otra zona) ya lo cubre
 *    el drag & drop del grid, que es exactamente `reacomodar`: un segundo camino para lo
 *    mismo agregaría superficie sin agregar capacidad.
 */
export default function AgregarClienteExtraDialog({
    open,
    onClose,
    codigoVendedor,
    rotacionId,
    semana,
    dia,
    descripcionSemana,
    onAgregado,
}: AgregarClienteExtraDialogProps) {
    const [texto, setTexto] = useState('')
    const [eleccion, setEleccion] = useState<Eleccion | null>(null)
    const [error, setError] = useState<string | null>(null)

    const { data: resultados = [], buscando } = useBuscarEnCarteraAdmin(
        codigoVendedor,
        rotacionId,
        texto,
    )
    const consultar = useConsultarClienteAdmin(codigoVendedor)
    const agregar = useAgregarClienteExtraAdmin(codigoVendedor)

    const nombreDia = DIAS[dia - 1] ?? String(dia)
    const celdaDestino = descripcionSemana
        ? `${nombreDia} · ${descripcionSemana} (Semana ${semana})`
        : `${nombreDia} · Semana ${semana}`

    // Deja el diálogo limpio si algún día se lo deja montado al cerrarlo: sin esto, el
    // texto de la búsqueda anterior reaparecería en la próxima apertura.
    useEffect(() => {
        if (!open) {
            setTexto('')
            setEleccion(null)
            setError(null)
        }
    }, [open])

    function cerrar() {
        setTexto('')
        setEleccion(null)
        setError(null)
        onClose()
    }

    async function elegir(r: IResultadoBuscadorGeneral) {
        setError(null)
        try {
            const consulta = await consultar.mutateAsync({
                rotacionId,
                codigoCliente: r.codigoParticularCliente,
            })
            setEleccion({
                codigo: r.codigoParticularCliente,
                nombre: titleCaseNombre(r.nombreCliente),
                celdas: consulta.celdas,
            })
        } catch {
            setError('No pudimos consultar este cliente. Volvé a intentar.')
        }
    }

    async function confirmar() {
        if (!eleccion) return
        setError(null)
        try {
            await agregar.mutateAsync({
                rotacionId,
                codigoCliente: eleccion.codigo,
                semana,
                dia,
            })
            const nombre = eleccion.nombre
            cerrar()
            onAgregado?.(nombre)
        } catch {
            setError('No se pudo agregar el cliente. Volvé a intentar.')
        }
    }

    const enEstaCelda = eleccion?.celdas.find(c => c.semana === semana && c.dia === dia)
    // Solo las filas VIVAS de otras celdas cuentan como "ya planificado": una quitada no
    // está en la vuelta, así que no hay nada de qué avisar.
    const enOtraCelda = eleccion?.celdas.filter(
        c => !c.eliminado && !(c.semana === semana && c.dia === dia),
    )

    const yaEstaAcaViva = enEstaCelda !== undefined && !enEstaCelda.eliminado
    const estaQuitadaAca = enEstaCelda !== undefined && enEstaCelda.eliminado
    const hayEnOtraCelda = (enOtraCelda?.length ?? 0) > 0
    const trabajando = agregar.isPending

    return (
        <Dialog.Root open={open} onOpenChange={abierto => !abierto && cerrar()}>
            <Dialog.Portal>
                <Dialog.Overlay className="animate-fade-in fixed inset-0 z-[60] bg-black/45" />
                <Dialog.Content className="animate-dialogo-in fixed left-1/2 top-1/2 z-[60] flex max-h-[85vh] w-[92vw] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white p-5 shadow-[0_18px_44px_rgba(10,15,30,.28)]">
                    <Dialog.Title className="text-[16px] font-extrabold leading-tight text-slate-900">
                        Agregar cliente
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-[13px] text-slate-500">
                        Va al {celdaDestino}, marcado como agregado.
                    </Dialog.Description>

                    {!eleccion && (
                        <div className="mt-4 flex min-h-0 flex-col gap-2">
                            <div className="relative">
                                <Search
                                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                                    strokeWidth={2.4}
                                />
                                <input
                                    className="w-full rounded-lg border-[1.5px] border-slate-200 py-2 pl-9 pr-3 text-sm font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
                                    placeholder="Nombre o código del cliente"
                                    value={texto}
                                    onChange={e => setTexto(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            {buscando && <p className="px-1 text-xs text-slate-500">Buscando…</p>}
                            <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
                                {resultados.map(r => (
                                    <button
                                        key={r.codigoParticularCliente}
                                        type="button"
                                        disabled={consultar.isPending}
                                        className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-slate-400 disabled:opacity-60"
                                        onClick={() => elegir(r)}
                                    >
                                        <span className="w-full truncate text-sm font-semibold text-slate-800">
                                            {titleCaseNombre(r.nombreCliente)}
                                        </span>
                                        <span className="text-[11px] text-slate-500">
                                            {r.codigoParticularCliente}
                                        </span>
                                    </button>
                                ))}
                                {texto.trim().length >= 2 && !buscando && resultados.length === 0 && (
                                    <p className="py-6 text-center text-sm text-slate-500">
                                        Sin resultados
                                    </p>
                                )}
                                {texto.trim().length < 2 && (
                                    <p className="py-6 text-center text-sm leading-relaxed text-slate-500">
                                        Buscá en toda la cartera del vendedor,
                                        <br />
                                        esté o no en esta vuelta.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {eleccion && (
                        <div className="mt-4 flex flex-col gap-3">
                            {yaEstaAcaViva && (
                                <p className="text-sm leading-snug text-slate-800">
                                    <b>{eleccion.nombre}</b> ya está planificado acá, en el{' '}
                                    {celdaDestino}.
                                </p>
                            )}

                            {!yaEstaAcaViva && estaQuitadaAca && (
                                <p className="text-sm leading-snug text-slate-800">
                                    <b>{eleccion.nombre}</b> está quitado de este día. Agregarlo lo
                                    vuelve a poner en el {celdaDestino}.
                                </p>
                            )}

                            {!yaEstaAcaViva && !estaQuitadaAca && hayEnOtraCelda && (
                                <p className="text-sm leading-snug text-slate-800">
                                    <b>{eleccion.nombre}</b> ya está planificado el{' '}
                                    {enOtraCelda!
                                        .map(c => `${DIAS[c.dia - 1] ?? c.dia} · Semana ${c.semana}`)
                                        .join(', ')}{' '}
                                    de esta vuelta. ¿Agregar igual otra visita el {celdaDestino}?
                                </p>
                            )}

                            {!yaEstaAcaViva && !estaQuitadaAca && !hayEnOtraCelda && (
                                <p className="text-sm leading-snug text-slate-800">
                                    <b>{eleccion.nombre}</b> no está en esta vuelta. Se agrega al{' '}
                                    {celdaDestino} como visita extra.
                                </p>
                            )}

                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    className="h-9 rounded-lg border-[1.5px] border-slate-200 px-3.5 text-[13px] font-semibold text-slate-700"
                                    onClick={() => (yaEstaAcaViva ? cerrar() : setEleccion(null))}
                                >
                                    {yaEstaAcaViva ? 'Cerrar' : 'Cancelar'}
                                </button>
                                {!yaEstaAcaViva && (
                                    <button
                                        type="button"
                                        disabled={trabajando}
                                        className="h-9 rounded-lg bg-slate-900 px-3.5 text-[13px] font-semibold text-white disabled:opacity-60"
                                        onClick={confirmar}
                                    >
                                        {hayEnOtraCelda ? 'Agregar de todos modos' : 'Agregar'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {error && (
                        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                            {error}
                        </p>
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

```bash
npx vitest run src/components/ruta/AgregarClienteExtraDialog.test.tsx
```
Esperado: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/ruta/AgregarClienteExtraDialog.tsx src/components/ruta/AgregarClienteExtraDialog.test.tsx
git commit -m "feat(ruta): diálogo para agregar un cliente extra a una celda

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Front — el botón "+" en cada celda del grid

**Files:**
- Modify: `app-planificacion/src/components/ruta/GridRotacion.tsx`
- Modify: `app-planificacion/src/components/ruta/GridRotacion.test.tsx`

**Interfaces:**
- Produces: prop nueva de `GridRotacion` y de `Celda`: `onAgregar?: (semana: number, dia: number) => void`. Ausente = no se ofrece agregar (rotación programada o cerrada). La pasa Task 9.

- [ ] **Step 1: Escribir el test**

Agregar a `src/components/ruta/GridRotacion.test.tsx`, dentro del `describe('GridRotacion')`:

```tsx
    it('sin onAgregar no dibuja ningún "+"', () => {
        render(
            <GridRotacion
                semanas={SEMANAS}
                onMover={vi.fn()}
                onRenombrarSemana={vi.fn()}
                onIntercambiar={vi.fn()}
            />,
        )
        expect(screen.queryByLabelText(/^Agregar cliente:/)).not.toBeInTheDocument()
    })

    it('con onAgregar hay un "+" por celda, y avisa qué celda se tocó', async () => {
        const onAgregar = vi.fn()
        render(
            <GridRotacion
                semanas={SEMANAS}
                onMover={vi.fn()}
                onRenombrarSemana={vi.fn()}
                onIntercambiar={vi.fn()}
                onAgregar={onAgregar}
            />,
        )

        // 2 semanas × 5 días.
        expect(screen.getAllByLabelText(/^Agregar cliente:/)).toHaveLength(10)

        await userEvent.click(
            screen.getByLabelText('Agregar cliente: semana 3, JUE'),
        )
        expect(onAgregar).toHaveBeenCalledWith(3, 4)
    })
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/components/ruta/GridRotacion.test.tsx
```
Esperado: FAIL — el segundo test no encuentra ningún `Agregar cliente:` (y TS avisa que `onAgregar` no existe).

- [ ] **Step 3: Implementar el botón**

En `src/components/ruta/GridRotacion.tsx`:

1. En `CeldaProps`, agregar:

```ts
    /** Ausente = no se ofrece agregar un cliente en esta celda. */
    onAgregar?: (celda: { semana: number; dia: number }) => void
```

2. En la firma de `Celda`, agregar `onAgregar` a los parámetros desestructurados.

3. Reemplazar el bloque `{intercambiable && (<button ... />)}` por una barra con los dos controles:

```tsx
            {/* La barra de acciones de la celda. El "+" va ACÁ y no en el header de la
                columna de día (como decía el spec): el grid tiene 5 columnas × N semanas,
                así que un botón en el header no identifica ninguna semana — y el requisito
                es justamente que la celda destino quede fijada por el botón que se tocó,
                sin selector de semana/día en el modal. */}
            {(intercambiable || onAgregar) && (
                <div className="mb-1 flex gap-1">
                    {intercambiable && (
                        <button
                            type="button"
                            aria-label={`${etiqueta}: semana ${semana}, ${dia}`}
                            // `dia` acá es la clave ('LUN'), pero el estado del intercambio
                            // guarda el número (1..5) que viaja al backend — misma
                            // conversión que ya usa `parsearCelda`. Sin esto, la celda de
                            // origen nunca se reconoce a sí misma y todas las celdas se
                            // muestran como destino posible.
                            onClick={() =>
                                onTocarIntercambio({ semana, dia: DIAS.indexOf(dia) + 1 })
                            }
                            className={`flex-1 rounded border border-dashed px-1 py-0.5 text-[10px] font-medium ${
                                esOrigen
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : esDestinoPosible
                                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                                      : 'border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-600'
                            }`}
                        >
                            {esOrigen ? 'Cancelar' : esDestinoPosible ? 'Intercambiar acá' : '⇄'}
                        </button>
                    )}
                    {onAgregar && (
                        <button
                            type="button"
                            // El label lleva semana y día porque hay 25 celdas: sin eso,
                            // 25 botones con el mismo nombre accesible son
                            // indistinguibles para un lector de pantalla y para los tests.
                            aria-label={`Agregar cliente: semana ${semana}, ${dia}`}
                            onClick={() => onAgregar({ semana, dia: DIAS.indexOf(dia) + 1 })}
                            className="rounded border border-dashed border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 hover:border-slate-400 hover:text-slate-600"
                        >
                            +
                        </button>
                    )}
                </div>
            )}
```

4. En `GridRotacionProps`, agregar:

```ts
    /** Ausente = no se ofrece agregar clientes (solo la rotación Actual lo permite). */
    onAgregar?: (semana: number, dia: number) => void
```

5. En la firma de `GridRotacion`, agregar `onAgregar`, y pasarlo a cada `<Celda>`:

```tsx
                                        onAgregar={
                                            onAgregar
                                                ? celda => onAgregar(celda.semana, celda.dia)
                                                : undefined
                                        }
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run src/components/ruta/GridRotacion.test.tsx
```
Esperado: PASS (los nuevos y los que ya estaban).

- [ ] **Step 5: Commit**

```bash
git add src/components/ruta/GridRotacion.tsx src/components/ruta/GridRotacion.test.tsx
git commit -m "feat(ruta): botón + por celda para agregar un cliente

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Front — cablear `RutaPage` (solo la rotación Actual)

**Files:**
- Modify: `app-planificacion/src/pages/RutaPage.tsx`
- Modify: `app-planificacion/src/pages/RutaPage.test.tsx`

**Interfaces:**
- Consumes: `GridRotacion.onAgregar` (Task 8) y `AgregarClienteExtraDialog` (Task 7).

Regla: el "+" se ofrece **solo** cuando `grid.estado === 'abierta'` — más restrictivo que `editable` (que incluye `'programada'`), porque el spec limita la feature a la rotación Actual: agregar a una programada no tiene urgencia operativa y el `rotacionId` de la cola es ambiguo.

- [ ] **Step 1: Escribir el test**

El archivo ya tiene `renderPage()` y mockea `@/api/planificacionAdmin`, `@/api/analitica` y
`@/context/AuthContext`. Agregar al final, dentro del `describe('RutaPage')`:

```tsx
    /** Cola + grid de un vendedor, con el estado de la rotación como parámetro. */
    function montarRotacion(estado: 'abierta' | 'programada') {
        const rotacion = {
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado,
            fechaInicio: estado === 'abierta' ? '2026-09-01T12:00:00.000Z' : null,
            fechaFin: null,
            descripcion: 'Ronda Septiembre',
            orden: estado === 'programada' ? 1 : null,
        }
        vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([rotacion])
        vi.mocked(apiAdmin.getRotacion).mockResolvedValue({
            ...rotacion,
            semanas: [
                {
                    semana: 1,
                    descripcion: 'Zárate',
                    dias: { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] },
                },
            ],
        })
    }

    async function elegirVendedor() {
        renderPage()
        await screen.findByRole('option', { name: 'Juan Pérez' })
        await userEvent.selectOptions(screen.getByLabelText('Vendedor'), 'V 2')
    }

    it('ofrece agregar clientes en la rotación abierta', async () => {
        montarRotacion('abierta')
        await elegirVendedor()

        expect(
            await screen.findByLabelText('Agregar cliente: semana 1, MAR'),
        ).toBeInTheDocument()
    })

    it('no ofrece agregar clientes en una rotación programada', async () => {
        montarRotacion('programada')
        await elegirVendedor()

        await screen.findByText(/Semana 1/)
        expect(screen.queryByLabelText(/^Agregar cliente:/)).not.toBeInTheDocument()
    })

    it('agregar un cliente desde una celda lo manda a esa celda', async () => {
        montarRotacion('abierta')
        vi.mocked(apiAdmin.buscarEnCarteraAdmin).mockResolvedValue([
            {
                codigoParticularCliente: 'P001',
                nombreCliente: 'ALMACEN ZARATE',
                estado: 'sin_plan',
                semana: null,
                dia: null,
                descripcionZona: null,
                fecha: null,
                motivo: null,
            },
        ])
        vi.mocked(apiAdmin.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: false,
            celdas: [],
        })
        vi.mocked(apiAdmin.agregarClienteExtraAdmin).mockResolvedValue({
            rotacionClienteId: 44,
        } as never)

        await elegirVendedor()
        await userEvent.click(await screen.findByLabelText('Agregar cliente: semana 1, MAR'))
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))
        await userEvent.click(await screen.findByRole('button', { name: 'Agregar' }))

        await waitFor(() =>
            expect(apiAdmin.agregarClienteExtraAdmin).toHaveBeenCalledWith(
                'V 2',
                7,
                'P001',
                1,
                2,
            ),
        )
    })
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/pages/RutaPage.test.tsx
```
Esperado: FAIL — no hay ningún botón "Agregar cliente:".

- [ ] **Step 3: Cablear la página**

En `src/pages/RutaPage.tsx`:

1. Imports:

```tsx
import AgregarClienteExtraDialog from '@/components/ruta/AgregarClienteExtraDialog'
```

2. Estado, junto a los otros `useState`:

```tsx
    // La celda cuyo "+" se tocó. null = el diálogo está cerrado. Guarda la celda y no un
    // booleano porque la celda ES el destino de lo que se agregue.
    const [celdaAgregar, setCeldaAgregar] = useState<{ semana: number; dia: number } | null>(
        null,
    )
```

3. En el `<GridRotacion>`, agregar la prop:

```tsx
                        // Solo la rotación Actual, no las de la cola: agregar a una
                        // programada no tiene urgencia operativa y el spec lo deja
                        // afuera a propósito. Es más restrictivo que `editable`, que
                        // también habilita 'programada'.
                        onAgregar={
                            grid.estado === 'abierta'
                                ? (semana, dia) => setCeldaAgregar({ semana, dia })
                                : undefined
                        }
```

4. Después del `<GridRotacion>` (dentro del mismo `{grid && (...)}`, o como bloque hermano con su propia guarda):

```tsx
                {grid && celdaAgregar && vendedor && (
                    <AgregarClienteExtraDialog
                        open
                        onClose={() => setCeldaAgregar(null)}
                        codigoVendedor={vendedor}
                        rotacionId={grid.id}
                        semana={celdaAgregar.semana}
                        dia={celdaAgregar.dia}
                        descripcionSemana={
                            grid.semanas.find(s => s.semana === celdaAgregar.semana)
                                ?.descripcion ?? null
                        }
                    />
                )}
```

(Si `{grid && (<GridRotacion .../>)}` es una expresión con un solo hijo, envolver los dos en un fragmento `<>…</>`.)

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
npx vitest run src/pages/RutaPage.test.tsx
```
Esperado: PASS.

- [ ] **Step 5: Verificación completa del front**

```bash
npx vitest run
npm run lint
npm run build
```
Esperado: toda la suite en PASS, lint sin findings nuevos, build sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add src/pages/RutaPage.tsx src/pages/RutaPage.test.tsx
git commit -m "feat(ruta): abrir el buscador desde el + de cada celda de la rotación actual

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Verificación final (antes de abrir los PRs)

- [ ] Backend: `npx tsc --noEmit -p tsconfig.json && npx jest` — todo verde.
- [ ] Frontend: `npx vitest run && npm run lint && npm run build` — todo verde.
- [ ] Prueba manual, con el backend de la rama corriendo:
  1. `/analitica/ruta`, elegir un vendedor con rotación abierta;
  2. "+" en una celda → buscar un cliente de la cartera que no esté en la vuelta → "Agregar" → la card aparece en esa celda con el chip **Agregado**, sin recargar;
  3. "+" en otra celda → buscar el mismo cliente → sale el aviso con la celda anterior → "Agregar de todos modos" → segunda card;
  4. "+" en la celda donde ya está → no se ofrece agregar;
  5. quitar una card (✕) y después "+" en esa misma celda con ese mismo cliente → el texto dice "está quitado de este día" y "Agregar" la deja **viva** (sin chip "Quitado", sin botón "Restaurar");
  6. elegir una rotación **programada** en la cola → no hay ningún "+".
  7. **Regresión del vendedor** (comparte el núcleo): entrar como vendedor, abrir el buscador del "+" de un día y el del header, buscar un cliente y agregar una extra → sigue funcionando igual que antes.
- [ ] Los dos PRs se abren en paralelo y el del backend se mergea primero: el front sin las rutas nuevas rompe el diálogo (404).

## Fuera de alcance (confirmado con el spec, no implementar)

- ~~"Traer" un cliente pendiente de otra zona desde este buscador (ya lo cubre el drag & drop = `reacomodar`).~~
  **Revertido durante la ejecución (2026-09-10):** el drag lo cubre en teoría, pero con cinco semanas cruza una grilla que scrollea, y el caso real que lo pidió tenía el cliente en dos celdas (LUN·S2 y LUN·S4) — con el drag hay que encontrar *cuál* arrastrar. El diálogo ahora lista una fila por celda con su propio botón "Traer acá" (elige y mueve en un click, como el drag), llamando al mismo `reacomodar` con su misma bitácora. "Agregar otra visita" queda secundaria. Una celda con resolución no ofrece el botón (`reacomodar` la rechaza con 409 `FILA_RESUELTA`), lo que obligó a agregar `resuelto` a `ICeldaPlanificada` en los dos repos.
- ~~Agregar sobre rotaciones que no sean la Actual (el endpoint lo permite; el botón no existe — mismo patrón de "el gate es solo del front" del resto del dominio).~~
  **Revertido durante la ejecución (2026-09-10):** apareció el caso de uso que el spec daba por inexistente — armar la próxima vuelta es justo cuando hace falta sumar un cliente nuevo. El "+" pasó a usar el mismo gate `editable` que mover, quitar e intercambiar: se ofrece en `abierta` y en `programada`, y no en `cerrada`/`cancelada`. El backend no cambió (ya aceptaba programada, con su test que lo fija).
- Editar o quitar una fila extra desde este diálogo (se reacomoda o se resuelve como cualquier otra fila).
- Cualquier cambio de esquema o de `crearExtra`.
- Rehacer `BuscadorService.consultar` sobre el núcleo. Su veredicto zona-actual / otra-zona es lógica propia del vendedor, no compartida, y sigue leyendo el repositorio directo — con el hueco preexistente de que una fila quitada le cuenta como pendiente. Se deja anotado, no se arregla acá (`buscarEnCartera` sí queda arreglado, de arrastre, por compartir el núcleo).
