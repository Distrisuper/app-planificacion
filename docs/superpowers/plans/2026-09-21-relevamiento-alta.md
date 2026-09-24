# Relevamiento del cliente nuevo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el vendedor, parado en el local, cargue los datos del comercio que administración necesita para el alta en el ERP (CUIT, IVA, condición de pago, localidad, contacto, referencias…), y que gerencia los vea y los exporte a CSV desde `/analitica/altas` — con un formulario cuyos campos se definen **en un solo lugar** y se pueden cambiar sin desplegar la app.

**Architecture:** El esquema del relevamiento (secciones, campos, tipos, máximos, catálogos) vive en `esquemaAlta.ts` de api-vendedores y la API lo sirve por `GET /planificacion/altas/esquema`. La validación del backend, el formulario del vendedor, el contador de progreso, el panel de gerencia y el CSV **recorren ese esquema**: nadie enumera claves por su nombre. Los valores se guardan en el `JSON` ya existente `pl_rotacion_cliente.detalle` (cero DDL sobre el plan). Los catálogos cerrados (IVA, pago) viven en la tabla nueva `pl_catalogo_alta`, sembrada con `INSERT IGNORE`. Los tipos de campo son un set cerrado — `texto | textoLargo | cuit | email | catalogo` — cada uno con un validador en la API y un widget en el front.

**Tech Stack:** api-vendedores (Express + Sequelize + MySQL, Jest) · app-planificacion (Vite + React 19 + React Query, Vitest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-09-21-relevamiento-alta-design.md` — **leer también su "Adenda 2026-09-21"**, que reemplaza la parte de "dos registros" del cuerpo del spec.

## Global Constraints

- **Rutas de los repos.** Front (`$APP`): `C:/Users/matia/orca/workspaces/app-planificacion/relevamiento-alta` (worktree, rama `MatiasH11/relevamiento-alta`, ya creada). Backend (`$API`): `C:/Users/matia/Documents/distrisuper/business-workflow/versus/api-vendedores` (hoy en `master`; **la Task 1 crea la rama `MatiasH11/relevamiento-alta`** ahí). Todos los comandos se corren desde el repo que corresponde.
- **Un solo esquema.** La lista de campos se escribe **una vez**, en `$API/src/services/planificacion/esquemaAlta.ts`. Ningún archivo del front (código ni test) puede tener una lista de las 15 claves: los tests del front arman su propio esquema de fixture, chico, con 2-4 campos. Las únicas claves que el front conoce por nombre son `nombre` (título de la card, obligatorio) y `contactoNombre` (precarga del cierre).
- **Tipos de campo cerrados:** `'texto' | 'textoLargo' | 'cuit' | 'email' | 'catalogo'`. Agregar un tipo es una decisión de diseño, no algo que hace este plan.
- **`IDetalleAlta`** pasa a `{ nombre: string; [clave: string]: string | null }` en los dos repos. Vacío tras `trim()` → `null`, nunca `''`. `nombre` nunca es `null`.
- **Total de campos:** son **15** (el spec dice 16 en un lugar; la tabla enumera 15). Ningún texto lo hardcodea: sale de `campos.length`.
- **Códigos de error conservados:** `ALTA_DETALLE_INVALIDO`, `ALTA_SIN_NOMBRE`, `ALTA_NOMBRE_MUY_LARGO`, `ALTA_RAZON_SOCIAL_MUY_LARGA`, `ALTA_DIRECCION_MUY_LARGA`. Nuevos: `ALTA_<CLAVE_SNAKE>_MUY_LARGO` (ej. `ALTA_CONTACTO_NOMBRE_MUY_LARGO`), `ALTA_CUIT_INVALIDO`, `ALTA_EMAIL_INVALIDO`, `ALTA_CATALOGO_INVALIDO`.
- **Vocabulario del vendedor:** el sheet se titula **"Datos del comercio"**; los botones dicen **"Datos"**. Nunca "relevamiento", "alta", "prospecto", "esquema" ni "catálogo" en textos visibles para el vendedor. `RelevamientoSheet` es el nombre del archivo.
- **Vendedor de prueba:** `GET /analitica/altas` excluye `PRUEBA-*` vía `fragmentoVendedores` (ya lo hace solo).
- **Warehouse:** no se toca ni se lee nada nuevo del warehouse.
- **CSV:** separador `;`, BOM UTF-8, escapado RFC 4180 (comillas dobles, saltos de línea, `;`), `\r\n`, nombre `altas-YYYY-MM-DD.csv`. Los códigos de catálogo salen como **descripción**.
- **Commits:** mensaje en español, imperativo, prefijo `feat(relevamiento):` / `fix(relevamiento):` / `docs(relevamiento):`, terminado en `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Un commit por task, en el repo que corresponde.
- **Tests:** backend `npx jest <archivo>` desde `$API`; front `npx vitest run <archivo>` desde `$APP`. TDD: test primero, verlo fallar, implementar, verlo pasar. Al final de cada task del front también `npx tsc -b --noEmit` (o `npm run build`) para que el cambio de `IDetalleAlta` no deje errores de tipo escondidos.

---

## Mapa de archivos

### Backend (`$API`)

| archivo | responsabilidad |
|---|---|
| `src/services/planificacion/esquemaAlta.ts` (crear) | **EL esquema**: `SECCIONES_ALTA`, `CAMPOS_ALTA`, `detalleVacio()`, `contarCamposCargados()`, `esquemaPublico()` |
| `src/services/planificacion/esquemaAlta.spec.ts` (crear) | invariantes del esquema |
| `src/types/planificacion.ts` | `IDetalleAlta` genérico; `TipoCampoAlta`, `ICampoAlta`, `ISeccionAlta`, `ICatalogoAltaItem`, `IEsquemaAlta` |
| `src/services/planificacion/altaDetalle.ts` | `normalizarDetalleAlta` pasa a un loop sobre `CAMPOS_ALTA`, con validadores por tipo |
| `src/services/planificacion/altaDetalle.spec.ts` | casos por tipo + códigos viejos |
| `docs/db-notes/planificacion-catalogo-alta.sql` (crear) | `pl_catalogo_alta` + seed, seguro para prod |
| `docs/db-notes/planificacion-ciclo-tables.sql` | DDL consolidado: tabla nueva + comentario de `detalle` |
| `docs/db-notes/local-init.sh` | aplica el script nuevo |
| `src/models/planificacion/CatalogoAlta.ts` (crear) | modelo Sequelize |
| `src/repositories/CatalogoAltaRepository.ts` (crear) | `findTodos()`, `codigosActivos()` |
| `src/controllers/planificacionController.ts` | `getEsquemaAlta`; `crearAlta`/`editarAlta` cargan catálogos antes de normalizar |
| `src/routes/planificacion.ts` | `GET /altas/esquema` |
| `src/services/planificacion/AltasService.ts` | `editar` usa `detalleVacio()` |
| `src/services/planificacion/AltasService.spec.ts` | merge de claves nuevas sobre JSON viejo; `reintentar` copia todo |
| `src/types/analitica.ts` | `IAltaRelevada` |
| `src/repositories/AnaliticaRepository.ts` | `findAltas` |
| `src/services/planificacion/AnaliticaService.ts` | `getAltas` |
| `src/services/planificacion/AnaliticaService.spec.ts` | `getAltas` |
| `src/controllers/analiticaController.ts` + `src/routes/analitica.ts` | `GET /analitica/altas` |

### Front (`$APP`)

| archivo | responsabilidad |
|---|---|
| `src/types/planificacion.ts` | `IDetalleAlta` genérico, tipos del esquema, `IEditarAltaDTO` |
| `src/api/planificacion.ts` | `getEsquemaAlta()` |
| `src/hooks/useEsquemaAlta.ts` (crear) | query del esquema, `staleTime` largo |
| `src/lib/camposAlta.ts` (crear) + test | helpers puros sobre el esquema: estado inicial, diff, contador, descripción de catálogo, agrupación por sección |
| `src/components/RelevamientoSheet.tsx` (crear) + test | "Datos del comercio": formulario genérico + Guardar |
| `src/components/ClienteCard.tsx` + test | botón "Editar" → "Datos" |
| `src/components/ClienteNuevoSheet.tsx` + test | se elimina el modo `editar` |
| `src/pages/AgendaSemanaPage.tsx` | abre `RelevamientoSheet` desde la card y desde la visita |
| `src/components/VisitaSheet.tsx` + test | botón "Datos" en la línea de identidad; precarga de "Con quién hablaste" |
| `src/components/VisitaFlow.tsx` | cablea `onDatosComercio` y `contactoSugerido` |
| `src/lib/csv.ts` (crear) + test | `aCsv`, `descargarCsv` |
| `src/lib/altasCsv.ts` (crear) + test | filas del CSV de altas a partir del esquema |
| `src/types/analitica.ts` | `IAltaRelevada` |
| `src/api/analitica.ts` + `src/hooks/useAnalitica.ts` | `getAltas`, `useAltasRelevadas` |
| `src/components/analitica/TablaAltas.tsx` (crear) + test | tabla de gerencia |
| `src/components/analitica/DetalleAltaPanel.tsx` (crear) + test | panel lateral de solo lectura, recorre el esquema |
| `src/pages/AnaliticaAltasPage.tsx` (crear) + test | pestaña `/analitica/altas` |
| `src/components/analitica/AnaliticaTabs.tsx` + test, `src/App.tsx` | pestaña y ruta |
| `CLAUDE.md`, `docs/dominio/modelo.md`, `docs/dominio/tablas.md` | documentación viva |

---

## Backend

### Task 1: El esquema (`esquemaAlta.ts`) y el `IDetalleAlta` genérico

**Files:**
- Create: `$API/src/services/planificacion/esquemaAlta.ts`
- Create: `$API/src/services/planificacion/esquemaAlta.spec.ts`
- Modify: `$API/src/types/planificacion.ts:162-166`

**Interfaces:**
- Produces: `TipoCampoAlta`, `ICampoAlta`, `ISeccionAlta`, `IEsquemaAlta`, `ICatalogoAltaItem` (types); `SECCIONES_ALTA`, `CAMPOS_ALTA`, `detalleVacio(): IDetalleAlta`, `contarCamposCargados(detalle): number`, `campoPorClave(clave): ICampoAlta | undefined`, `esquemaPublico(): { secciones; campos }` (exports de `esquemaAlta.ts`). Los usan las Tasks 2, 4, 5.

- [ ] **Step 1: Crear la rama en el backend**

```bash
cd $API && git checkout master && git pull && git checkout -b MatiasH11/relevamiento-alta
```

- [ ] **Step 2: Escribir el test del esquema**

`$API/src/services/planificacion/esquemaAlta.spec.ts`:

```ts
import {
    CAMPOS_ALTA, SECCIONES_ALTA, campoPorClave, contarCamposCargados, detalleVacio, esquemaPublico,
} from './esquemaAlta'

describe('esquemaAlta', () => {
    it('las claves son únicas y toda sección referenciada existe', () => {
        const claves = CAMPOS_ALTA.map(c => c.clave)
        expect(new Set(claves).size).toBe(claves.length)
        const secciones = new Set(SECCIONES_ALTA.map(s => s.clave))
        for (const c of CAMPOS_ALTA) expect(secciones.has(c.seccion)).toBe(true)
    })
    it('nombre es el único requerido y conserva su forma histórica', () => {
        expect(CAMPOS_ALTA.filter(c => c.requerido).map(c => c.clave)).toEqual(['nombre'])
        expect(campoPorClave('razonSocial')).toMatchObject({ tipo: 'texto', max: 120 })
        expect(campoPorClave('direccion')).toMatchObject({ tipo: 'texto', max: 200 })
    })
    it('todo campo que no es catálogo tiene max; todo catálogo tiene su tipo', () => {
        for (const c of CAMPOS_ALTA) {
            if (c.tipo === 'catalogo') expect(typeof c.catalogo).toBe('string')
            else expect(c.max).toBeGreaterThan(0)
        }
    })
    it('detalleVacio trae todas las claves: nombre "" y el resto null', () => {
        const v = detalleVacio()
        expect(Object.keys(v).sort()).toEqual(CAMPOS_ALTA.map(c => c.clave).sort())
        expect(v.nombre).toBe('')
        expect(v.cuit).toBeNull()
    })
    it('contarCamposCargados ignora null, "" y claves que no están en el esquema', () => {
        expect(contarCamposCargados(null)).toBe(0)
        expect(contarCamposCargados({ nombre: 'Piche', razonSocial: null, direccion: '', loQueSea: 'x' })).toBe(1)
        expect(contarCamposCargados({ nombre: 'Piche', cuit: '30-1', condicionIva: 'RI' })).toBe(3)
    })
    it('esquemaPublico no expone codigoLargo', () => {
        const pub = esquemaPublico()
        expect(pub.secciones).toEqual(SECCIONES_ALTA)
        expect(pub.campos.length).toBe(CAMPOS_ALTA.length)
        for (const c of pub.campos) expect(c).not.toHaveProperty('codigoLargo')
    })
})
```

- [ ] **Step 3: Verlo fallar**

Run: `cd $API && npx jest src/services/planificacion/esquemaAlta.spec.ts`
Expected: FAIL — `Cannot find module './esquemaAlta'`.

- [ ] **Step 4: Cambiar `IDetalleAlta` y agregar los tipos del esquema**

En `$API/src/types/planificacion.ts`, reemplazar la interfaz de tres claves:

```ts
/** Datos del COMERCIO de una fila `tipo='alta'`, en `pl_rotacion_cliente.detalle`.
 *  Las claves NO se enumeran acá: las define `esquemaAlta.ts` (CAMPOS_ALTA), que es lo
 *  que la API sirve en GET /altas/esquema y lo que el front recorre para dibujar el
 *  formulario. `nombre` es la única fija: es obligatoria y es el título de la card.
 *  Una clave ausente en un JSON viejo se lee como null. */
export interface IDetalleAlta {
    nombre: string
    [clave: string]: string | null
}

export type TipoCampoAlta = 'texto' | 'textoLargo' | 'cuit' | 'email' | 'catalogo'

export interface ISeccionAlta {
    clave: string
    titulo: string
}

/** Un campo del relevamiento, tal como viaja en GET /altas/esquema. */
export interface ICampoAlta {
    clave: string
    etiqueta: string
    seccion: string
    tipo: TipoCampoAlta
    /** Largo máximo. Presente en todo tipo salvo 'catalogo'. */
    max?: number
    requerido?: boolean
    /** Solo tipo 'catalogo': el `tipo` de pl_catalogo_alta del que salen las opciones. */
    catalogo?: string
    placeholder?: string
}

export interface ICatalogoAltaItem {
    codigo: string
    descripcion: string
    orden: number
    activo: boolean
}

/** GET /planificacion/altas/esquema. `catalogos` es null si pl_catalogo_alta no se pudo
 *  leer: el front deshabilita solo los selects y el resto del formulario sigue. */
export interface IEsquemaAlta {
    secciones: ISeccionAlta[]
    campos: ICampoAlta[]
    catalogos: Record<string, ICatalogoAltaItem[]> | null
}
```

- [ ] **Step 5: Escribir `esquemaAlta.ts`**

```ts
import { ICampoAlta, IDetalleAlta, ISeccionAlta } from '../../types/planificacion'

/** Un campo del esquema más lo que el front NO necesita saber. */
export interface ICampoAltaInterno extends ICampoAlta {
    /** Código de error cuando el valor supera `max`. Default: ALTA_<CLAVE_SNAKE>_MUY_LARGO.
     *  Los tres campos originales conservan el suyo para no cambiar el contrato. */
    codigoLargo?: string
}

/**
 * EL esquema del relevamiento del cliente nuevo (spec 2026-09-21, adenda). Es el ÚNICO lugar
 * donde se enumeran los campos: la API valida con esto, lo sirve en GET /altas/esquema, y el
 * front dibuja el formulario, el contador, el panel de gerencia y el CSV recorriéndolo.
 *
 * Agregar un dato al relevamiento = agregar una fila acá (y, si es catálogo, sembrar sus
 * códigos en pl_catalogo_alta). Ningún deploy de la app.
 *
 * Los tipos son un set cerrado: texto | textoLargo | cuit | email | catalogo. Cada uno tiene
 * un validador en altaDetalle.ts y un widget en el front. Un tipo nuevo es una decisión de
 * diseño, no una fila más.
 */
export const SECCIONES_ALTA: readonly ISeccionAlta[] = [
    { clave: 'identidad', titulo: 'Identidad' },
    { clave: 'ubicacion', titulo: 'Ubicación' },
    { clave: 'contacto', titulo: 'Contacto' },
    { clave: 'comercial', titulo: 'Comercial' },
    { clave: 'cuenta_corriente', titulo: 'Cuenta corriente' },
    { clave: 'notas', titulo: 'Notas' },
]

export const CAMPOS_ALTA: readonly ICampoAltaInterno[] = [
    { clave: 'nombre', etiqueta: 'Nombre del comercio', seccion: 'identidad', tipo: 'texto', max: 120, requerido: true, placeholder: 'Cómo se llama el local', codigoLargo: 'ALTA_NOMBRE_MUY_LARGO' },
    { clave: 'razonSocial', etiqueta: 'Razón social', seccion: 'identidad', tipo: 'texto', max: 120, codigoLargo: 'ALTA_RAZON_SOCIAL_MUY_LARGA' },
    { clave: 'cuit', etiqueta: 'CUIT', seccion: 'identidad', tipo: 'cuit', max: 13, placeholder: '30-12345678-9' },
    { clave: 'direccion', etiqueta: 'Dirección', seccion: 'ubicacion', tipo: 'texto', max: 200, codigoLargo: 'ALTA_DIRECCION_MUY_LARGA' },
    { clave: 'localidad', etiqueta: 'Localidad', seccion: 'ubicacion', tipo: 'texto', max: 120 },
    { clave: 'telefono', etiqueta: 'Teléfono del local', seccion: 'contacto', tipo: 'texto', max: 40 },
    { clave: 'email', etiqueta: 'Email', seccion: 'contacto', tipo: 'email', max: 120 },
    { clave: 'contactoNombre', etiqueta: 'Nombre del contacto', seccion: 'contacto', tipo: 'texto', max: 80, placeholder: 'Dueño, encargado…' },
    { clave: 'contactoMedio', etiqueta: 'Celular / WhatsApp del contacto', seccion: 'contacto', tipo: 'texto', max: 60 },
    { clave: 'condicionIva', etiqueta: 'Condición de IVA', seccion: 'comercial', tipo: 'catalogo', catalogo: 'iva' },
    { clave: 'condicionPago', etiqueta: 'Condición de pago', seccion: 'comercial', tipo: 'catalogo', catalogo: 'pago' },
    { clave: 'segmentacion', etiqueta: 'Segmentación', seccion: 'comercial', tipo: 'texto', max: 200, placeholder: 'Frenero, suspensionero, monomarca…' },
    { clave: 'datosBancarios', etiqueta: 'Datos bancarios', seccion: 'cuenta_corriente', tipo: 'textoLargo', max: 300 },
    { clave: 'referencias', etiqueta: 'Referencias comerciales', seccion: 'cuenta_corriente', tipo: 'textoLargo', max: 300 },
    { clave: 'datoDeColor', etiqueta: 'Dato de color', seccion: 'notas', tipo: 'textoLargo', max: 300 },
]

const POR_CLAVE = new Map(CAMPOS_ALTA.map(c => [c.clave, c]))

export function campoPorClave(clave: string): ICampoAltaInterno | undefined {
    return POR_CLAVE.get(clave)
}

/** Todas las claves presentes: nombre '' y el resto null. Es la base sobre la que `editar`
 *  mergea cuando la fila todavía no tiene detalle. */
export function detalleVacio(): IDetalleAlta {
    const v: IDetalleAlta = { nombre: '' }
    for (const c of CAMPOS_ALTA) if (c.clave !== 'nombre') v[c.clave] = null
    return v
}

/** Cuántos campos DEL ESQUEMA tienen valor. Claves fuera del esquema (un campo que se sacó)
 *  no cuentan: el número tiene que coincidir con lo que el formulario muestra hoy. */
export function contarCamposCargados(detalle: IDetalleAlta | null | undefined): number {
    if (!detalle) return 0
    let n = 0
    for (const c of CAMPOS_ALTA) {
        const v = detalle[c.clave]
        if (typeof v === 'string' && v.trim() !== '') n++
    }
    return n
}

/** Lo que viaja al front: sin `codigoLargo`, que es un detalle de la validación. */
export function esquemaPublico(): { secciones: ISeccionAlta[]; campos: ICampoAlta[] } {
    return {
        secciones: [...SECCIONES_ALTA],
        campos: CAMPOS_ALTA.map(({ codigoLargo: _omitido, ...publico }) => publico),
    }
}
```

- [ ] **Step 6: Verlo pasar y compilar**

Run: `cd $API && npx jest src/services/planificacion/esquemaAlta.spec.ts && npx tsc --noEmit`
Expected: PASS; `tsc` sin errores (el `IDetalleAlta` genérico sigue aceptando `{ nombre, razonSocial, direccion }`).

- [ ] **Step 7: Commit**

```bash
cd $API && git add src/services/planificacion/esquemaAlta.ts src/services/planificacion/esquemaAlta.spec.ts src/types/planificacion.ts
git commit -m "feat(relevamiento): esquema declarativo del cliente nuevo (esquemaAlta.ts) e IDetalleAlta genérico

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `normalizarDetalleAlta` recorre el esquema

**Files:**
- Modify: `$API/src/services/planificacion/altaDetalle.ts`
- Modify: `$API/src/services/planificacion/altaDetalle.spec.ts`

**Interfaces:**
- Consumes: `CAMPOS_ALTA`, `ICampoAltaInterno` (Task 1).
- Produces: `normalizarDetalleAlta(body, opts: { nombreRequerido?: boolean; catalogos?: CodigosCatalogo })`, `type CodigosCatalogo = Record<string, ReadonlySet<string>>`. `normalizarDetalleContacto` no cambia.

- [ ] **Step 1: Reescribir el `describe('normalizarDetalleAlta')` del spec**

Reemplazar ese bloque (dejar `normalizarDetalleContacto` intacto):

```ts
import { normalizarDetalleAlta, normalizarDetalleContacto } from './altaDetalle'
import { CAMPOS_ALTA } from './esquemaAlta'

const CATALOGOS = { iva: new Set(['RI', 'MONO']), pago: new Set(['CONTADO']) }

describe('normalizarDetalleAlta', () => {
    it('trimea y convierte vacíos en null; en creación devuelve TODAS las claves del esquema', () => {
        const r = normalizarDetalleAlta({ nombre: '  Autopartes Piche ', razonSocial: '   ', direccion: undefined })
        expect(r.ok).toBe(true)
        const v = (r as any).valor
        expect(v.nombre).toBe('Autopartes Piche')
        expect(v.razonSocial).toBeNull()
        expect(v.direccion).toBeNull()
        expect(Object.keys(v).sort()).toEqual(CAMPOS_ALTA.map(c => c.clave).sort())
    })
    it('rechaza nombre vacío con ALTA_SIN_NOMBRE', () => {
        expect(normalizarDetalleAlta({ nombre: '  ' })).toMatchObject({ ok: false, code: 'ALTA_SIN_NOMBRE' })
    })
    it('conserva los códigos históricos de largo', () => {
        expect(normalizarDetalleAlta({ nombre: 'x'.repeat(121) })).toMatchObject({ ok: false, code: 'ALTA_NOMBRE_MUY_LARGO' })
        expect(normalizarDetalleAlta({ nombre: 'a', razonSocial: 'x'.repeat(121) })).toMatchObject({ ok: false, code: 'ALTA_RAZON_SOCIAL_MUY_LARGA' })
        expect(normalizarDetalleAlta({ nombre: 'a', direccion: 'x'.repeat(201) })).toMatchObject({ ok: false, code: 'ALTA_DIRECCION_MUY_LARGA' })
    })
    it('los campos nuevos usan ALTA_<CLAVE_SNAKE>_MUY_LARGO', () => {
        expect(normalizarDetalleAlta({ nombre: 'a', contactoNombre: 'x'.repeat(81) }))
            .toMatchObject({ ok: false, code: 'ALTA_CONTACTO_NOMBRE_MUY_LARGO' })
        expect(normalizarDetalleAlta({ nombre: 'a', datosBancarios: 'x'.repeat(301) }))
            .toMatchObject({ ok: false, code: 'ALTA_DATOS_BANCARIOS_MUY_LARGO' })
    })
    it('cuit: dígitos y guiones, laxo; otra cosa → ALTA_CUIT_INVALIDO', () => {
        expect(normalizarDetalleAlta({ nombre: 'a', cuit: ' 30-12345678-9 ' })).toMatchObject({ ok: true, valor: expect.objectContaining({ cuit: '30-12345678-9' }) })
        expect(normalizarDetalleAlta({ nombre: 'a', cuit: '30123456789' })).toMatchObject({ ok: true })
        expect(normalizarDetalleAlta({ nombre: 'a', cuit: '30.12345678.9' })).toMatchObject({ ok: false, code: 'ALTA_CUIT_INVALIDO' })
        expect(normalizarDetalleAlta({ nombre: 'a', cuit: '1'.repeat(14) })).toMatchObject({ ok: false, code: 'ALTA_CUIT_MUY_LARGO' })
    })
    it('email: formato laxo algo@algo.algo; otra cosa → ALTA_EMAIL_INVALIDO', () => {
        expect(normalizarDetalleAlta({ nombre: 'a', email: 'piche@gmail.com' })).toMatchObject({ ok: true })
        expect(normalizarDetalleAlta({ nombre: 'a', email: 'piche@gmail' })).toMatchObject({ ok: false, code: 'ALTA_EMAIL_INVALIDO' })
        expect(normalizarDetalleAlta({ nombre: 'a', email: 'sin arroba' })).toMatchObject({ ok: false, code: 'ALTA_EMAIL_INVALIDO' })
    })
    it('catalogo: acepta un código activo y rechaza uno que no está con ALTA_CATALOGO_INVALIDO', () => {
        expect(normalizarDetalleAlta({ nombre: 'a', condicionIva: 'RI' }, { catalogos: CATALOGOS })).toMatchObject({ ok: true })
        expect(normalizarDetalleAlta({ nombre: 'a', condicionIva: 'EXENTO' }, { catalogos: CATALOGOS })).toMatchObject({ ok: false, code: 'ALTA_CATALOGO_INVALIDO' })
        // Sin catálogos cargados nada se puede validar: cualquier código rebota.
        expect(normalizarDetalleAlta({ nombre: 'a', condicionPago: 'CONTADO' })).toMatchObject({ ok: false, code: 'ALTA_CATALOGO_INVALIDO' })
        // null (borrar) siempre es válido.
        expect(normalizarDetalleAlta({ condicionPago: null }, { nombreRequerido: false })).toEqual({ ok: true, valor: { condicionPago: null } })
    })
    it('en edición el nombre es opcional y solo viajan las claves presentes', () => {
        expect(normalizarDetalleAlta({ direccion: 'Ruta 5 km 2' }, { nombreRequerido: false }))
            .toEqual({ ok: true, valor: { direccion: 'Ruta 5 km 2' } })
        expect(normalizarDetalleAlta({ cuit: '30-1' }, { nombreRequerido: false }))
            .toEqual({ ok: true, valor: { cuit: '30-1' } })
    })
    it('en edición nombre vacío o null sigue siendo ALTA_SIN_NOMBRE', () => {
        expect(normalizarDetalleAlta({ nombre: '' }, { nombreRequerido: false })).toMatchObject({ ok: false, code: 'ALTA_SIN_NOMBRE' })
        expect(normalizarDetalleAlta({ nombre: null }, { nombreRequerido: false })).toMatchObject({ ok: false, code: 'ALTA_SIN_NOMBRE' })
    })
    it('ignora claves que no están en el esquema', () => {
        expect(normalizarDetalleAlta({ loQueSea: 'x', direccion: 'A' }, { nombreRequerido: false }))
            .toEqual({ ok: true, valor: { direccion: 'A' } })
    })
    it('rechaza un body que no es objeto', () => {
        expect(normalizarDetalleAlta('hola')).toMatchObject({ ok: false, code: 'ALTA_DETALLE_INVALIDO' })
    })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `cd $API && npx jest src/services/planificacion/altaDetalle.spec.ts`
Expected: FAIL en los casos nuevos (cuit/email/catálogo/claves nuevas: hoy se ignoran y devuelven `ok: true` con 3 claves).

- [ ] **Step 3: Reescribir `normalizarDetalleAlta`**

En `altaDetalle.ts`, borrar las constantes `ALTA_NOMBRE_MAX`, `ALTA_RAZON_SOCIAL_MAX`, `ALTA_DIRECCION_MAX` y la función vieja (dejar `ResultadoNormalizacion`, `ALTA_CONTACTO_MAX`, `texto`, `fechaValida`, `normalizarDetalleContacto`), y agregar:

```ts
import { CAMPOS_ALTA, ICampoAltaInterno } from './esquemaAlta'

/** Códigos ACTIVOS de pl_catalogo_alta, por `tipo` de catálogo ('iva' → {'RI', ...}). Lo carga
 *  el controller una vez por request (CatalogoAltaRepository.codigosActivos) para que esta
 *  función siga siendo pura y testeable sin base. */
export type CodigosCatalogo = Record<string, ReadonlySet<string>>

export interface OpcionesNormalizacion {
    /** default true: creación. false: edición, solo viajan las claves presentes. */
    nombreRequerido?: boolean
    catalogos?: CodigosCatalogo
}

const RE_CUIT = /^[\d-]+$/
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const snakeUpper = (clave: string) => clave.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()

type Falla = { ok: false; code: string; mensaje: string }

/** Valida UN valor no nulo contra su campo. null = válido. */
function validarCampo(campo: ICampoAltaInterno, valor: string, catalogos: CodigosCatalogo | undefined): Falla | null {
    if (campo.tipo === 'catalogo') {
        const activos = campo.catalogo ? catalogos?.[campo.catalogo] : undefined
        if (!activos || !activos.has(valor)) {
            return { ok: false, code: 'ALTA_CATALOGO_INVALIDO', mensaje: `El valor de ${campo.etiqueta.toLowerCase()} no está en la lista.` }
        }
        return null
    }
    if (campo.max !== undefined && valor.length > campo.max) {
        return {
            ok: false,
            code: campo.codigoLargo ?? `ALTA_${snakeUpper(campo.clave)}_MUY_LARGO`,
            mensaje: `${campo.etiqueta} no puede superar los ${campo.max} caracteres.`,
        }
    }
    if (campo.tipo === 'cuit' && !RE_CUIT.test(valor)) {
        return { ok: false, code: 'ALTA_CUIT_INVALIDO', mensaje: 'El CUIT solo puede tener números y guiones.' }
    }
    if (campo.tipo === 'email' && !RE_EMAIL.test(valor)) {
        return { ok: false, code: 'ALTA_EMAIL_INVALIDO', mensaje: 'El email no tiene un formato válido.' }
    }
    return null
}

/**
 * Normaliza los datos del COMERCIO recorriendo CAMPOS_ALTA (spec 2026-09-21): `''` → null, trim,
 * validación por tipo. Con `nombreRequerido` (default true) devuelve el IDetalleAlta completo
 * (toda clave del esquema presente, ausentes en null); con false (edición) devuelve solo las
 * claves que vinieron, para mergear sobre lo guardado. Claves fuera del esquema se ignoran.
 */
export function normalizarDetalleAlta(
    body: unknown,
    opts: OpcionesNormalizacion = {},
): ResultadoNormalizacion<IDetalleAlta | Partial<IDetalleAlta>> {
    const nombreRequerido = opts.nombreRequerido ?? true
    if (body === null || typeof body !== 'object') {
        return { ok: false, code: 'ALTA_DETALLE_INVALIDO', mensaje: 'Los datos del cliente nuevo son inválidos.' }
    }
    const b = body as Record<string, unknown>
    const salida: Record<string, string | null> = {}

    for (const campo of CAMPOS_ALTA) {
        const valor = texto(b[campo.clave])
        if (valor === undefined) {
            if (nombreRequerido) {
                if (campo.requerido) return { ok: false, code: 'ALTA_SIN_NOMBRE', mensaje: 'Poné el nombre del comercio.' }
                salida[campo.clave] = null
            }
            continue
        }
        if (valor === null) {
            if (campo.requerido) return { ok: false, code: 'ALTA_SIN_NOMBRE', mensaje: 'Poné el nombre del comercio.' }
            salida[campo.clave] = null
            continue
        }
        const falla = validarCampo(campo, valor, opts.catalogos)
        if (falla) return falla
        salida[campo.clave] = valor
    }
    return { ok: true, valor: salida as IDetalleAlta }
}
```

`ALTA_SIN_NOMBRE` sigue siendo el código del único requerido: el esquema tiene un solo `requerido`, y el test de Task 1 lo garantiza. Si algún día hay un segundo requerido, ese código pasa a ser `ALTA_SIN_<CLAVE>` — no es de este plan.

- [ ] **Step 4: Verlo pasar**

Run: `cd $API && npx jest src/services/planificacion/altaDetalle.spec.ts && npx tsc --noEmit`
Expected: PASS. Si `tsc` reclama por `ALTA_NOMBRE_MAX` u otras constantes borradas, buscar sus usos con `grep -rn "ALTA_NOMBRE_MAX\|ALTA_RAZON_SOCIAL_MAX\|ALTA_DIRECCION_MAX" src` y reemplazarlos por `campoPorClave('nombre')!.max` etc.

- [ ] **Step 5: Commit**

```bash
cd $API && git add src/services/planificacion/altaDetalle.ts src/services/planificacion/altaDetalle.spec.ts
git commit -m "feat(relevamiento): normalizarDetalleAlta recorre el esquema con validadores por tipo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `pl_catalogo_alta` — script, modelo y repositorio

**Files:**
- Create: `$API/docs/db-notes/planificacion-catalogo-alta.sql`
- Modify: `$API/docs/db-notes/planificacion-ciclo-tables.sql` (después del bloque de `pl_accion`, ~línea 352; y el comentario de `detalle` en línea 173)
- Modify: `$API/docs/db-notes/local-init.sh` (después de la línea de `planificacion-vendedor-cromo-table.sql`)
- Create: `$API/src/models/planificacion/CatalogoAlta.ts`
- Create: `$API/src/repositories/CatalogoAltaRepository.ts`

**Interfaces:**
- Produces: `CatalogoAltaRepository.findTodos(): Promise<Record<string, ICatalogoAltaItem[]>>` (activos e inactivos, ordenados por `orden, descripcion`), `CatalogoAltaRepository.codigosActivos(): Promise<CodigosCatalogo>`. Los usa la Task 4.

- [ ] **Step 1: Escribir el script SQL**

`$API/docs/db-notes/planificacion-catalogo-alta.sql`:

```sql
-- Catálogos cerrados del relevamiento del cliente nuevo: condición de IVA y condición de pago.
-- Spec: app-planificacion docs/superpowers/specs/2026-09-21-relevamiento-alta-design.md
--
-- Son datos y no código a propósito: texto libre se ensucia (`RI` / `R.I.` / `resp. inscripto`)
-- y el ERP los consume directo; y administración los va a corregir sin desplegar nada. Los
-- valores de abajo son un PLACEHOLDER inicial.
--
-- Qué campo usa qué catálogo lo dice `src/services/planificacion/esquemaAlta.ts` (campo
-- `tipo: 'catalogo', catalogo: 'iva' | 'pago'`). Agregar un catálogo nuevo (ej. 'segmento') es
-- sembrar sus filas acá con otro `tipo` y apuntar un campo del esquema a ese tipo.
--
-- ⚠ SELECCIONAR LA BASE ANTES DE CORRER ESTO. A propósito no hay `USE`: el nombre cambia por
-- entorno y equivocarse es silencioso. Confirmá con SELECT DATABASE(); antes de seguir.
--
-- ✔ SEGURO PARA PRODUCCIÓN e idempotente: CREATE TABLE IF NOT EXISTS + INSERT IGNORE sobre el
-- UNIQUE (tipo, codigo). Re-correrlo no duplica ni pisa descripciones ya corregidas.
--
-- ⚠ NUNCA DELETE: hay JSONs en pl_rotacion_cliente.detalle que referencian el código. Baja
-- lógica con `activo = 0`; el front sigue mostrando la descripción de un código inactivo.

CREATE TABLE IF NOT EXISTS pl_catalogo_alta (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo         VARCHAR(20)  NOT NULL,   -- 'iva' | 'pago' (extensible: el esquema decide qué campo usa cuál)
  codigo       VARCHAR(30)  NOT NULL,   -- lo que se guarda en el JSON del detalle
  descripcion  VARCHAR(80)  NOT NULL,   -- lo que ve el vendedor y lo que sale en el CSV
  orden        TINYINT      NOT NULL DEFAULT 0,
  activo       TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_catalogo_alta (tipo, codigo)
);

INSERT IGNORE INTO pl_catalogo_alta (tipo, codigo, descripcion, orden) VALUES
  ('iva',  'RI',            'Responsable Inscripto', 10),
  ('iva',  'MONO',          'Monotributo',           20),
  ('iva',  'EXENTO',        'Exento',                30),
  ('iva',  'CF',            'Consumidor Final',      40),
  ('iva',  'NR',            'No Responsable',        50),
  ('pago', 'CONTADO',       'Contado',               10),
  ('pago', 'CTA_CTE',       'Cuenta corriente',      20),
  ('pago', 'CHEQUE',        'Cheque',                30),
  ('pago', 'TRANSFERENCIA', 'Transferencia',         40);
```

- [ ] **Step 2: Sumar la tabla al DDL consolidado y al init local**

En `planificacion-ciclo-tables.sql`:
- Línea 173: cambiar el comentario de `detalle` a `-- solo tipo='alta': datos del comercio. Las CLAVES las define src/services/planificacion/esquemaAlta.ts (nombre, razonSocial, cuit, direccion, ... — 15 hoy). Nadie agrupa por esto, por eso JSON.`
- Después del `INSERT IGNORE INTO pl_accion` (~línea 352), pegar el `CREATE TABLE` y el `INSERT IGNORE` del Step 1, precedidos de `-- ⑨ Catálogos del relevamiento del cliente nuevo (IVA, pago). Ver planificacion-catalogo-alta.sql para el porqué.` (respetar la numeración circulada que usa el archivo: mirar cuál es el último número y seguirlo).

En `local-init.sh`, después de la línea de `planificacion-vendedor-cromo-table.sql`:

```bash
aplicar_contra planificacion-catalogo-alta.sql planificacion                # pl_catalogo_alta: IVA y condición de pago del cliente nuevo
```

- [ ] **Step 3: Modelo Sequelize**

`$API/src/models/planificacion/CatalogoAlta.ts` (mismo patrón que `Accion.ts`):

```ts
import { Model, DataTypes } from 'sequelize'
import { sequelizeWritePlanificacion } from '../../database/connection'

interface ICatalogoAltaAttributes {
    id?: number
    tipo: string
    codigo: string
    descripcion: string
    orden?: number
    activo?: boolean
}

class CatalogoAlta extends Model<ICatalogoAltaAttributes> implements ICatalogoAltaAttributes {
    public id!: number
    public tipo!: string
    public codigo!: string
    public descripcion!: string
    public orden!: number
    public activo!: boolean
}

CatalogoAlta.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true, field: 'id' },
        tipo: { type: DataTypes.STRING(20), allowNull: false, field: 'tipo' },
        codigo: { type: DataTypes.STRING(30), allowNull: false, field: 'codigo' },
        descripcion: { type: DataTypes.STRING(80), allowNull: false, field: 'descripcion' },
        orden: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0, field: 'orden' },
        activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'activo' },
    },
    {
        sequelize: sequelizeWritePlanificacion,
        modelName: 'CatalogoAlta',
        tableName: 'pl_catalogo_alta',
        timestamps: false,
    },
)

export default CatalogoAlta
```

- [ ] **Step 4: Repositorio**

`$API/src/repositories/CatalogoAltaRepository.ts`:

```ts
import CatalogoAlta from '../models/planificacion/CatalogoAlta'
import { CustomError } from '../utils/errors'
import { ICatalogoAltaItem } from '../types/planificacion'
import { CodigosCatalogo } from '../services/planificacion/altaDetalle'

export class CatalogoAltaRepository {
    /** TODOS los códigos, activos e inactivos, agrupados por tipo. El front filtra activos para
     *  el select y usa el resto para mostrar la descripción de un valor ya guardado que después
     *  se dio de baja. */
    static async findTodos(): Promise<Record<string, ICatalogoAltaItem[]>> {
        try {
            const rows = await CatalogoAlta.findAll({ order: [['orden', 'ASC'], ['descripcion', 'ASC']] })
            const salida: Record<string, ICatalogoAltaItem[]> = {}
            for (const r of rows) {
                ;(salida[r.tipo] ??= []).push({
                    codigo: r.codigo, descripcion: r.descripcion, orden: r.orden, activo: Boolean(r.activo),
                })
            }
            return salida
        } catch (err) {
            throw new CustomError(500, `Error fetching catálogo de alta: ${err}`)
        }
    }

    /** Solo los activos, como Set por tipo: es lo que `normalizarDetalleAlta` necesita para
     *  aceptar o rebotar un código. */
    static async codigosActivos(): Promise<CodigosCatalogo> {
        const todos = await CatalogoAltaRepository.findTodos()
        const salida: Record<string, Set<string>> = {}
        for (const [tipo, items] of Object.entries(todos)) {
            salida[tipo] = new Set(items.filter(i => i.activo).map(i => i.codigo))
        }
        return salida
    }
}
```

- [ ] **Step 5: Compilar**

Run: `cd $API && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Aplicar el script en la base local (si está levantada) y verificar**

Run (con `docker-compose.local.yml` arriba; si no está, saltear y anotarlo en el mensaje final de la task):
```bash
docker compose -f docker-compose.local.yml exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" planificacion < docs/db-notes/planificacion-catalogo-alta.sql
docker compose -f docker-compose.local.yml exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" planificacion -e "SELECT tipo, COUNT(*) FROM pl_catalogo_alta GROUP BY tipo"
```
Expected: `iva 5`, `pago 4`. Correrlo dos veces no cambia los números.

- [ ] **Step 7: Commit**

```bash
cd $API && git add docs/db-notes/planificacion-catalogo-alta.sql docs/db-notes/planificacion-ciclo-tables.sql docs/db-notes/local-init.sh src/models/planificacion/CatalogoAlta.ts src/repositories/CatalogoAltaRepository.ts
git commit -m "feat(relevamiento): pl_catalogo_alta (IVA, condición de pago) con modelo y repositorio

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `GET /altas/esquema` y validación de catálogo en `POST/PUT /altas`

**Files:**
- Modify: `$API/src/controllers/planificacionController.ts:1058-1101`
- Modify: `$API/src/routes/planificacion.ts:93-101`
- Modify: `$API/src/services/planificacion/AltasService.ts:43`
- Modify: `$API/src/services/planificacion/AltasService.spec.ts`

**Interfaces:**
- Consumes: `esquemaPublico`, `detalleVacio` (Task 1); `normalizarDetalleAlta(body, { catalogos })` (Task 2); `CatalogoAltaRepository` (Task 3).
- Produces: `GET /planificacion/altas/esquema` → `{ ok: 1, data: IEsquemaAlta }`, cualquier rol autenticado. Contratos de `POST /altas`, `PUT /altas/:id` sin cambio (aceptan las claves nuevas).

- [ ] **Step 1: Tests nuevos en `AltasService.spec.ts`**

Dentro del `describe('editar')` existente agregar:

```ts
    it('mergea claves NUEVAS sobre un JSON viejo de tres claves sin perder las viejas', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock)
            .mockResolvedValueOnce(filaAlta({ detalle: { nombre: 'Piche', razonSocial: 'Piche SRL', direccion: null } }))
            .mockResolvedValueOnce(filaAlta())
        ;(ResolucionRepository.findByCicloCliente as jest.Mock).mockResolvedValue(null)
        await AltasService.editar(USER, 9, { detalle: { cuit: '30-1', condicionIva: 'RI' } })
        expect(RotacionClienteRepository.actualizarDetalleAlta).toHaveBeenCalledWith(9, {
            nombre: 'Piche', razonSocial: 'Piche SRL', direccion: null, cuit: '30-1', condicionIva: 'RI',
        })
    })
    it('sin detalle previo arranca de detalleVacio(): todas las claves del esquema presentes', async () => {
        ;(RotacionClienteRepository.findById as jest.Mock)
            .mockResolvedValueOnce(filaAlta({ detalle: null }))
            .mockResolvedValueOnce(filaAlta())
        ;(ResolucionRepository.findByCicloCliente as jest.Mock).mockResolvedValue(null)
        await AltasService.editar(USER, 9, { detalle: { nombre: 'Piche' } })
        const guardado = (RotacionClienteRepository.actualizarDetalleAlta as jest.Mock).mock.calls[0][1]
        expect(guardado).toEqual({ ...detalleVacio(), nombre: 'Piche' })
    })
```

y en `describe('reintentar')` (buscar el caso feliz existente y agregar al lado):

```ts
    it('copia el detalle ENTERO, incluidas las claves del relevamiento', async () => {
        const completo = { ...DETALLE, cuit: '30-1', localidad: 'Zárate', condicionPago: 'CTA_CTE' }
        ;(RotacionClienteRepository.findById as jest.Mock).mockResolvedValue(filaAlta({ detalle: completo }))
        ;(ResolucionRepository.findByCicloCliente as jest.Mock).mockResolvedValue({ tipo: 'no_visita', fechaFin: '2026-09-21T15:00:00Z' })
        ;(RotacionClienteRepository.crearAlta as jest.Mock).mockResolvedValue(filaAlta({ id: 10, detalle: completo }))
        await AltasService.reintentar(USER, 9, { dia: 4 })
        expect(RotacionClienteRepository.crearAlta).toHaveBeenCalledWith(7, 2, 4, completo)
    })
```

Importar arriba: `import { detalleVacio } from './esquemaAlta'`.

- [ ] **Step 2: Verlo fallar**

Run: `cd $API && npx jest src/services/planificacion/AltasService.spec.ts`
Expected: el test de `detalleVacio` FALLA (hoy el literal es `{ nombre: '', razonSocial: null, direccion: null }`, sin las claves nuevas). Los otros dos pasan ya (el spread mergea cualquier clave) — está bien, quedan como red de seguridad.

- [ ] **Step 3: `AltasService.editar` usa `detalleVacio()`**

```ts
import { detalleVacio } from './esquemaAlta'
// ...
        const detalle = { ...(fila.detalle ?? detalleVacio()), ...dto.detalle }
```

- [ ] **Step 4: Controller — esquema y catálogos**

En `planificacionController.ts`, imports:

```ts
import { CatalogoAltaRepository } from '../repositories/CatalogoAltaRepository'
import { esquemaPublico } from '../services/planificacion/esquemaAlta'
import { IEsquemaAlta } from '../types/planificacion'
```

Handler nuevo, antes de `crearAlta`:

```ts
    /** GET /altas/esquema — secciones, campos y catálogos del relevamiento. Es lo que el
     *  front recorre para dibujar el formulario: la lista de campos NO vive en la app.
     *  Si pl_catalogo_alta falla, responde igual con `catalogos: null` — el front deshabilita
     *  los selects y el resto del formulario sigue operativo. */
    static async getEsquemaAlta(_req: Request, res: Response): Promise<void> {
        let catalogos: IEsquemaAlta['catalogos'] = null
        try {
            catalogos = await CatalogoAltaRepository.findTodos()
        } catch (err) {
            console.error('[altas/esquema] no se pudo leer pl_catalogo_alta:', err)
        }
        const data: IEsquemaAlta = { ...esquemaPublico(), catalogos }
        res.status(200).json({ ok: 1, data })
    }
```

En `crearAlta`, reemplazar `const detalle = normalizarDetalleAlta(req.body)` por:

```ts
            const catalogos = await CatalogoAltaRepository.codigosActivos()
            const detalle = normalizarDetalleAlta(req.body, { catalogos })
```

En `editarAlta`, reemplazar `normalizarDetalleAlta(req.body, { nombreRequerido: false })` por:

```ts
            const catalogos = await CatalogoAltaRepository.codigosActivos()
            const detalle = normalizarDetalleAlta(req.body, { nombreRequerido: false, catalogos })
```

(Si la lectura del catálogo falla acá, el `catch` del handler responde 500: es la misma base MySQL que `pl_rotacion_cliente`, así que si una está caída la otra también.)

- [ ] **Step 5: Ruta**

En `routes/planificacion.ts`, ANTES de `router.post('/altas', ...)`:

```ts
/**
 * @openapi
 * /planificacion/altas/esquema:
 *   get:
 *     summary: Esquema del relevamiento del cliente nuevo
 *     description: >
 *       Secciones, campos (clave, etiqueta, tipo, max, requerido, catalogo) y catálogos
 *       (pl_catalogo_alta, activos e inactivos) que el front recorre para dibujar "Datos del
 *       comercio". Cualquier rol autenticado: gerencia lo usa para el panel de /analitica/altas.
 *       Spec: app-planificacion docs/superpowers/specs/2026-09-21-relevamiento-alta-design.md
 *     responses:
 *       200: { description: "{ secciones, campos, catalogos | null }" }
 */
router.get('/altas/esquema', authMiddleware, async (req: Request, res: Response) => {
    PlanificacionController.getEsquemaAlta(req, res)
})
```

Actualizar el comentario `400:` del `@openapi` de `POST /altas` a `400: { description: ALTA_SIN_NOMBRE, DIA_INVALIDO, ALTA_*_MUY_LARGO, ALTA_CUIT_INVALIDO, ALTA_EMAIL_INVALIDO, ALTA_CATALOGO_INVALIDO }`.

- [ ] **Step 6: Verlo pasar y compilar**

Run: `cd $API && npx jest src/services/planificacion/AltasService.spec.ts src/services/planificacion/altaDetalle.spec.ts && npx tsc --noEmit`
Expected: PASS, sin errores de tipo.

- [ ] **Step 7: Prueba manual contra la API local (si está levantada)**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/staging/vs/planificacion/altas/esquema | head -c 600
```
Expected: `{"ok":1,"data":{"secciones":[...6],"campos":[...15],"catalogos":{"iva":[...],"pago":[...]}}}`. Si no hay API local, anotarlo y seguir.

- [ ] **Step 8: Commit**

```bash
cd $API && git add src/controllers/planificacionController.ts src/routes/planificacion.ts src/services/planificacion/AltasService.ts src/services/planificacion/AltasService.spec.ts
git commit -m "feat(relevamiento): GET /altas/esquema y validación de catálogo en POST/PUT /altas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `GET /analitica/altas`

**Files:**
- Modify: `$API/src/types/analitica.ts` (al final)
- Modify: `$API/src/repositories/AnaliticaRepository.ts` (interfaz de fila junto a `IVisitaRow`; método al final de la clase)
- Modify: `$API/src/services/planificacion/AnaliticaService.ts` (método nuevo al final de la clase)
- Modify: `$API/src/services/planificacion/AnaliticaService.spec.ts`
- Modify: `$API/src/controllers/analiticaController.ts`
- Modify: `$API/src/routes/analitica.ts`

**Interfaces:**
- Consumes: `fragmentoVendedores`, `bordesUtc`, `IFiltroVendedores` (ya en el repo); `resolverVendedoresPermitidos`, `rosterSeguro`, `buildNombrePorVendedor` (ya en el service); `derivarEstado` (`estadoCicloCliente.ts`); `fechaNegocio` (`utils/timezoneNegocio`); `parseJson`; `contarCamposCargados`, `CAMPOS_ALTA` (Task 1).
- Produces: `GET /planificacion/analitica/altas?desde&hasta&vendedores` → `{ ok: 1, data: IAltaRelevada[] }`.

- [ ] **Step 1: Tipo de respuesta**

Al final de `$API/src/types/analitica.ts`:

```ts
import { EstadoCicloCliente, IDetalleAlta, IDetalleContactoAlta } from './planificacion'

/** Una fila del plan tipo='alta' con su relevamiento, para /analitica/altas (spec 2026-09-21).
 *  Un comercio con "No visité" + reintento aparece DOS veces: son dos filas del plan, y la
 *  segunda es la que administración quiere. No se deduplica por nombre. */
export interface IAltaRelevada {
    rotacionClienteId: number
    vendedor: { codigo: string; nombre: string }
    estado: EstadoCicloCliente
    /** Día de negocio (YYYY-MM-DD) de la resolución, si la hay. */
    fechaVisita: string | null
    detalle: IDetalleAlta | null
    /** pl_resolucion.detalle: con quién habló ESA vez. */
    contacto: IDetalleContactoAlta | null
    /** Cuántos campos del esquema tienen valor, sobre `camposTotal`. */
    camposCargados: number
    camposTotal: number
}
```

(Si el archivo ya importa de `./planificacion`, sumar los nombres a ese import en vez de duplicarlo.)

- [ ] **Step 2: Test del service**

En `AnaliticaService.spec.ts`, al final:

```ts
describe('getAltas', () => {
    const fila = (over: Partial<any> = {}) => ({
        rotacion_cliente_id: 9,
        codigo_particular_vendedor: 'V 2',
        detalle: { nombre: 'Piche', razonSocial: null, direccion: 'San Martín 811', cuit: '30-1' },
        resolucion_tipo: null,
        fecha_inicio: null,
        fecha_fin: null,
        resolucion_detalle: null,
        ...over,
    })

    beforeEach(() => {
        mockedSellerService.getSellersWithZones.mockResolvedValue([
            { codigovendedor: 'V 2', razonsocialvend: 'Gómez' },
        ] as any)
    })

    it('mapea la fila: estado derivado, fecha de negocio, contacto y campos cargados', async () => {
        mockedRepo.findAltas.mockResolvedValue([
            fila(),
            fila({
                rotacion_cliente_id: 10, resolucion_tipo: 'visita',
                fecha_inicio: new Date('2026-09-21T15:07:00Z'), fecha_fin: new Date('2026-09-21T15:40:00Z'),
                resolucion_detalle: { contacto: 'Gustavo', fechaNacimiento: null },
            }),
            fila({ rotacion_cliente_id: 11, resolucion_tipo: 'visita', fecha_inicio: new Date('2026-09-21T15:07:00Z') }),
            fila({ rotacion_cliente_id: 12, resolucion_tipo: 'no_visita', fecha_inicio: new Date('2026-09-21T15:07:00Z'), fecha_fin: new Date('2026-09-21T15:07:00Z') }),
        ] as any)

        const r = await AnaliticaService.getAltas(null, '2026-09-21', '2026-09-25', undefined)

        expect(r.map(a => a.estado)).toEqual(['pendiente', 'visitada', 'en_curso', 'no_visita'])
        expect(r[0]).toMatchObject({
            rotacionClienteId: 9, vendedor: { codigo: 'V 2', nombre: 'Gómez' },
            fechaVisita: null, contacto: null, camposCargados: 3, camposTotal: CAMPOS_ALTA.length,
        })
        expect(r[1].fechaVisita).toBe('2026-09-21')
        expect(r[1].contacto).toEqual({ contacto: 'Gustavo', fechaNacimiento: null })
    })

    it('pasa el rango y los vendedores permitidos por scope al repositorio', async () => {
        mockedRepo.findAltas.mockResolvedValue([])
        await AnaliticaService.getAltas(['V 2', 'V 3'], '2026-09-21', '2026-09-25', ['V 3', 'V 9'])
        expect(mockedRepo.findAltas).toHaveBeenCalledWith({ desde: '2026-09-21', hasta: '2026-09-25', vendedores: ['V 3'] })
    })

    it('un JSON de detalle que viene como string se parsea igual', async () => {
        mockedRepo.findAltas.mockResolvedValue([fila({ detalle: JSON.stringify({ nombre: 'Piche' }) })] as any)
        const [a] = await AnaliticaService.getAltas(null, '2026-09-21', '2026-09-25', undefined)
        expect(a.detalle).toEqual({ nombre: 'Piche' })
        expect(a.camposCargados).toBe(1)
    })
})
```

Importar arriba: `import { CAMPOS_ALTA } from './esquemaAlta'`.

- [ ] **Step 3: Verlo fallar**

Run: `cd $API && npx jest src/services/planificacion/AnaliticaService.spec.ts -t getAltas`
Expected: FAIL — `AnaliticaService.getAltas is not a function` / `findAltas` no existe.

- [ ] **Step 4: Repositorio**

En `AnaliticaRepository.ts`, junto a `IVisitaRow`:

```ts
/** Una fila tipo='alta' del plan con su resolución (si la hay), para /analitica/altas. */
export interface IAltaRow {
    rotacion_cliente_id: number
    codigo_particular_vendedor: string
    detalle: unknown
    resolucion_tipo: string | null
    fecha_inicio: Date | null
    fecha_fin: Date | null
    resolucion_detalle: unknown
}
```

y el método, al final de la clase:

```ts
    /**
     * Filas del plan tipo='alta' cuya ROTACIÓN tuvo alguna semana solapando el rango (mismo
     * criterio de solape que findCobertura), con su resolución si la hay. El vendedor sale de
     * pl_rotacion (la fila de alta puede estar en una semana que todavía no se abrió, así que no
     * se puede exigir un pl_ciclo_semana de esa semana). Una fila por fila del plan: el
     * reintento de un "No visité" aparece aparte, a propósito. Más nuevas primero: no hay
     * columna de creación (la reemplazó pl_reacomodacion), y el id AUTO_INCREMENT es el orden.
     */
    static async findAltas(filtro: IFiltroVendedores): Promise<IAltaRow[]> {
        try {
            const { clausula, vendedores, prefijoPrueba } = fragmentoVendedores(filtro.vendedores, 'ro')
            return await sequelizeWritePlanificacion.query<IAltaRow>(
                `SELECT cc.id AS rotacion_cliente_id,
                        ro.codigo_particular_vendedor,
                        cc.detalle,
                        r.tipo        AS resolucion_tipo,
                        r.fecha_inicio,
                        r.fecha_fin,
                        r.detalle     AS resolucion_detalle
                   FROM pl_rotacion_cliente cc
                   JOIN pl_rotacion ro ON ro.id = cc.rotacion_id
                   LEFT JOIN pl_resolucion r ON r.rotacion_cliente_id = cc.id
                  WHERE cc.tipo = 'alta'
                    AND cc.deleted_at IS NULL
                    AND EXISTS (
                        SELECT 1 FROM pl_ciclo_semana cs
                         WHERE cs.rotacion_id = cc.rotacion_id
                           AND cs.fecha_apertura < :hastaExclusiva
                           AND (cs.fecha_cierre >= :desde OR cs.fecha_cierre IS NULL)
                    )
                    ${clausula}
                  ORDER BY cc.id DESC`,
                {
                    replacements: { ...bordesUtc(filtro.desde, filtro.hasta), vendedores, prefijoPrueba },
                    type: QueryTypes.SELECT,
                },
            )
        } catch (err) {
            throw new CustomError(500, `Error fetching altas: ${err}`)
        }
    }
```

- [ ] **Step 5: Service**

En `AnaliticaService.ts`, imports:

```ts
import { IAltaRelevada } from '../../types/analitica'   // sumar al import existente de ese módulo
import { IDetalleContactoAlta, IResolucion } from '../../types/planificacion'  // sumar al existente
import { derivarEstado } from './estadoCicloCliente'
import { CAMPOS_ALTA, contarCamposCargados } from './esquemaAlta'
```

Método al final de la clase:

```ts
    /** Relevamiento de los clientes nuevos para administración (spec 2026-09-21). Excluye
     *  PRUEBA-* vía fragmentoVendedores, como todo lo de analítica. */
    static async getAltas(
        scope: string[] | null,
        desde: string,
        hasta: string,
        vendedoresPedidos: string[] | undefined,
    ): Promise<IAltaRelevada[]> {
        const vendedores = resolverVendedoresPermitidos(scope, vendedoresPedidos)
        const [rows, roster] = await Promise.all([
            AnaliticaRepository.findAltas({ desde, hasta, vendedores }),
            rosterSeguro(),
        ])
        const nombreDe = buildNombrePorVendedor(roster)

        return rows.map(r => {
            const detalle = parseJson<IDetalleAlta>(r.detalle)
            // derivarEstado lee `tipo` y `fechaFin`: es la única regla del dominio para esto.
            const resolucion = r.resolucion_tipo
                ? ({ tipo: r.resolucion_tipo, fechaFin: r.fecha_fin ? new Date(r.fecha_fin).toISOString() : null } as unknown as IResolucion)
                : null
            return {
                rotacionClienteId: r.rotacion_cliente_id,
                vendedor: { codigo: r.codigo_particular_vendedor, nombre: nombreDe(r.codigo_particular_vendedor) },
                estado: derivarEstado(resolucion),
                fechaVisita: r.fecha_inicio ? fechaNegocio(new Date(r.fecha_inicio)) : null,
                detalle,
                contacto: parseJson<IDetalleContactoAlta>(r.resolucion_detalle),
                camposCargados: contarCamposCargados(detalle),
                camposTotal: CAMPOS_ALTA.length,
            }
        })
    }
```

Verificar cómo está tipado `IResolucion.fechaFin` (`string | null` o `Date | null`) y ajustar el cast para que `derivarEstado` reciba lo que espera; el `as unknown as IResolucion` está para no armar la resolución completa.

- [ ] **Step 6: Controller y ruta**

En `analiticaController.ts`, después de `getResumen`:

```ts
    static async getAltas(req: Request, res: Response): Promise<void> {
        try {
            const rango = parseRangoFechas(req, res)
            if (!rango) return
            const vendedoresPedidos = toArray(req.query['vendedores[]'] ?? req.query.vendedores)
            const scope = req.salesScope?.allowedSellerCodes ?? null
            const data = await AnaliticaService.getAltas(scope, rango.desde, rango.hasta, vendedoresPedidos)
            res.status(200).json({ ok: 1, data })
        } catch (err) {
            respondError(res, err)
        }
    }
```

Mirar cómo `getResumen` recibe `vendedores` cuando llega como `V1,V2` en un solo string (el front manda `params: filtro` con un array; axios lo serializa como `vendedores[]=V1&vendedores[]=V2`). Si `getResumen` hace algún split por coma, copiarlo; si no, no.

En `routes/analitica.ts`, después de `/resumen`:

```ts
router.get(
    '/altas',
    authMiddleware,
    authorize(...ROLES_ANALITICA),
    salesScopeMiddleware,
    async (req: Request, res: Response) => {
        AnaliticaController.getAltas(req, res)
    },
)
```

- [ ] **Step 7: Verlo pasar**

Run: `cd $API && npx jest src/services/planificacion/AnaliticaService.spec.ts src/controllers/analiticaController.spec.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Correr toda la suite del backend**

Run: `cd $API && npm test`
Expected: todo verde.

- [ ] **Step 9: Commit**

```bash
cd $API && git add src/types/analitica.ts src/repositories/AnaliticaRepository.ts src/services/planificacion/AnaliticaService.ts src/services/planificacion/AnaliticaService.spec.ts src/controllers/analiticaController.ts src/routes/analitica.ts
git commit -m "feat(relevamiento): GET /analitica/altas — relevamiento de clientes nuevos para administración

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Front — vendedor

### Task 6: Tipos, `getEsquemaAlta`, `useEsquemaAlta` y `camposAlta.ts`

**Files:**
- Modify: `$APP/src/types/planificacion.ts:9-17, 433-438`
- Modify: `$APP/src/api/planificacion.ts` (sección "Cliente nuevo / altas")
- Create: `$APP/src/hooks/useEsquemaAlta.ts`
- Create: `$APP/src/lib/camposAlta.ts`
- Create: `$APP/src/lib/camposAlta.test.ts`

**Interfaces:**
- Produces (types): `IDetalleAlta`, `TipoCampoAlta`, `ICampoAlta`, `ISeccionAlta`, `ICatalogoAltaItem`, `IEsquemaAlta`, `IEditarAltaDTO = Partial<IDetalleAlta>`.
- Produces (api/hook): `getEsquemaAlta(): Promise<IEsquemaAlta>`, `useEsquemaAlta()` (React Query, key `esquemaAltaKey = ['alta', 'esquema']`).
- Produces (lib): `valorDe(detalle, clave): string | null`, `estadoInicial(campos, detalle, nombreFallback): Record<string, string>`, `diffDetalle(campos, detalle, estado, nombreFallback): IEditarAltaDTO`, `contarCargados(campos, estado): number`, `descripcionCatalogo(catalogos, tipo, codigo): string`, `camposPorSeccion(esquema): { seccion: ISeccionAlta; campos: ICampoAlta[] }[]`, `opcionesDeCatalogo(catalogos, tipo, valorActual): ICatalogoAltaItem[]`.

- [ ] **Step 1: Tipos**

En `$APP/src/types/planificacion.ts`, reemplazar `IDetalleAlta` (líneas 9-15):

```ts
/** Datos del COMERCIO de una fila `tipo: 'alta'`, en `pl_rotacion_cliente.detalle`. Las
 *  claves NO se enumeran acá: las define el backend (`esquemaAlta.ts`) y las sirve
 *  `GET /altas/esquema`; el front las recorre. `nombre` es la única fija (obligatoria, título
 *  de la card). Una clave ausente en un JSON viejo se lee como null. */
export interface IDetalleAlta {
    nombre: string
    [clave: string]: string | null
}

export type TipoCampoAlta = 'texto' | 'textoLargo' | 'cuit' | 'email' | 'catalogo'

export interface ISeccionAlta {
    clave: string
    titulo: string
}

export interface ICampoAlta {
    clave: string
    etiqueta: string
    seccion: string
    tipo: TipoCampoAlta
    max?: number
    requerido?: boolean
    /** Solo tipo 'catalogo': la clave dentro de `IEsquemaAlta.catalogos`. */
    catalogo?: string
    placeholder?: string
}

export interface ICatalogoAltaItem {
    codigo: string
    descripcion: string
    orden: number
    activo: boolean
}

/** GET /planificacion/altas/esquema. `catalogos: null` = la tabla no se pudo leer: los selects
 *  se deshabilitan y el resto del formulario sigue operativo. */
export interface IEsquemaAlta {
    secciones: ISeccionAlta[]
    campos: ICampoAlta[]
    catalogos: Record<string, ICatalogoAltaItem[]> | null
}
```

Reemplazar `IEditarAltaDTO` (líneas 433-438):

```ts
/** `null` = borrar el valor cargado; `undefined` = no tocarlo. `nombre` nunca va en null. */
export type IEditarAltaDTO = Partial<IDetalleAlta>
```

- [ ] **Step 2: API y hook**

En `src/api/planificacion.ts`, en la sección de altas:

```ts
/** Secciones, campos y catálogos de "Datos del comercio". La lista de campos NO vive en la
 *  app: se recorre esto. */
export const getEsquemaAlta = async (): Promise<IEsquemaAlta> => {
    const res = await apiClient.get('/planificacion/altas/esquema')
    return res.data.data
}
```

(sumar `IEsquemaAlta` al import de tipos).

`src/hooks/useEsquemaAlta.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { getEsquemaAlta } from '@/api/planificacion'

export const esquemaAltaKey = ['alta', 'esquema'] as const

/** Cambia con un deploy de la API (los campos) o una corrección de administración (los
 *  catálogos): ni una cosa ni la otra pasa en la misma jornada. */
const ESQUEMA_STALE_MS = 30 * 60 * 1000

export function useEsquemaAlta(enabled = true) {
    return useQuery({
        queryKey: esquemaAltaKey,
        queryFn: getEsquemaAlta,
        staleTime: ESQUEMA_STALE_MS,
        enabled,
    })
}
```

- [ ] **Step 3: Test de `camposAlta.ts`**

`src/lib/camposAlta.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
    camposPorSeccion, contarCargados, descripcionCatalogo, diffDetalle, estadoInicial, opcionesDeCatalogo, valorDe,
} from './camposAlta'
import type { ICampoAlta, IEsquemaAlta } from '@/types/planificacion'

// Esquema de fixture, chico a propósito: el real vive en la API.
const CAMPOS: ICampoAlta[] = [
    { clave: 'nombre', etiqueta: 'Nombre', seccion: 'identidad', tipo: 'texto', max: 120, requerido: true },
    { clave: 'cuit', etiqueta: 'CUIT', seccion: 'identidad', tipo: 'cuit', max: 13 },
    { clave: 'condicionIva', etiqueta: 'IVA', seccion: 'comercial', tipo: 'catalogo', catalogo: 'iva' },
    { clave: 'referencias', etiqueta: 'Referencias', seccion: 'cuenta', tipo: 'textoLargo', max: 300 },
]
const CATALOGOS = {
    iva: [
        { codigo: 'RI', descripcion: 'Responsable Inscripto', orden: 10, activo: true },
        { codigo: 'NR', descripcion: 'No Responsable', orden: 50, activo: false },
    ],
}

describe('valorDe', () => {
    it('detalle null o clave ausente → null', () => {
        expect(valorDe(null, 'cuit')).toBeNull()
        expect(valorDe({ nombre: 'Piche' }, 'cuit')).toBeNull()
        expect(valorDe({ nombre: 'Piche', cuit: '30-1' }, 'cuit')).toBe('30-1')
    })
})

describe('estadoInicial', () => {
    it('una entrada por campo, "" donde no hay valor, y nombre con fallback', () => {
        expect(estadoInicial(CAMPOS, { nombre: 'Piche', cuit: '30-1' }, 'x')).toEqual({
            nombre: 'Piche', cuit: '30-1', condicionIva: '', referencias: '',
        })
        expect(estadoInicial(CAMPOS, null, 'Autopartes Piche').nombre).toBe('Autopartes Piche')
    })
})

describe('diffDetalle', () => {
    const detalle = { nombre: 'Piche', cuit: null, condicionIva: 'RI', referencias: 'Casa Pérez' }
    it('devuelve solo las claves que cambiaron, ya normalizadas', () => {
        const estado = { nombre: 'Piche', cuit: ' 30-1 ', condicionIva: 'RI', referencias: 'Casa Pérez' }
        expect(diffDetalle(CAMPOS, detalle, estado, 'Piche')).toEqual({ cuit: '30-1' })
    })
    it('"" contra null NO es un cambio; borrar un valor manda null', () => {
        const estado = { nombre: 'Piche', cuit: '', condicionIva: '', referencias: 'Casa Pérez' }
        expect(diffDetalle(CAMPOS, detalle, estado, 'Piche')).toEqual({ condicionIva: null })
    })
    it('sin detalle previo, el nombre se compara contra el fallback (no contra "")', () => {
        const estado = { nombre: 'Autopartes Piche', cuit: '', condicionIva: '', referencias: '' }
        expect(diffDetalle(CAMPOS, null, estado, 'Autopartes Piche')).toEqual({})
    })
    it('nombre nunca viaja en null: vacío se ignora en el diff (lo bloquea el botón)', () => {
        const estado = { nombre: '   ', cuit: '', condicionIva: 'RI', referencias: 'Casa Pérez' }
        expect(diffDetalle(CAMPOS, detalle, estado, 'Piche')).toEqual({})
    })
})

describe('contarCargados', () => {
    it('cuenta los campos del esquema con valor no vacío', () => {
        expect(contarCargados(CAMPOS, { nombre: 'Piche', cuit: '  ', condicionIva: 'RI', referencias: '' })).toBe(2)
    })
})

describe('descripcionCatalogo', () => {
    it('resuelve activos e inactivos; sin match o sin catálogos devuelve el código', () => {
        expect(descripcionCatalogo(CATALOGOS, 'iva', 'RI')).toBe('Responsable Inscripto')
        expect(descripcionCatalogo(CATALOGOS, 'iva', 'NR')).toBe('No Responsable')
        expect(descripcionCatalogo(CATALOGOS, 'iva', 'ZZ')).toBe('ZZ')
        expect(descripcionCatalogo(null, 'iva', 'RI')).toBe('RI')
    })
})

describe('opcionesDeCatalogo', () => {
    it('solo activos, más el valor actual si está inactivo (para no perderlo del select)', () => {
        expect(opcionesDeCatalogo(CATALOGOS, 'iva', null).map(o => o.codigo)).toEqual(['RI'])
        expect(opcionesDeCatalogo(CATALOGOS, 'iva', 'NR').map(o => o.codigo)).toEqual(['RI', 'NR'])
        expect(opcionesDeCatalogo(null, 'iva', 'RI')).toEqual([])
    })
})

describe('camposPorSeccion', () => {
    it('respeta el orden de las secciones y omite las que no tienen campos', () => {
        const esquema: IEsquemaAlta = {
            secciones: [
                { clave: 'comercial', titulo: 'Comercial' },
                { clave: 'vacia', titulo: 'Vacía' },
                { clave: 'identidad', titulo: 'Identidad' },
                { clave: 'cuenta', titulo: 'Cuenta corriente' },
            ],
            campos: CAMPOS,
            catalogos: CATALOGOS,
        }
        const grupos = camposPorSeccion(esquema)
        expect(grupos.map(g => g.seccion.clave)).toEqual(['comercial', 'identidad', 'cuenta'])
        expect(grupos[1].campos.map(c => c.clave)).toEqual(['nombre', 'cuit'])
    })
})
```

- [ ] **Step 4: Verlo fallar**

Run: `cd $APP && npx vitest run src/lib/camposAlta.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 5: Implementar `camposAlta.ts`**

```ts
import type { ICampoAlta, ICatalogoAltaItem, IDetalleAlta, IEditarAltaDTO, IEsquemaAlta, ISeccionAlta } from '@/types/planificacion'

/**
 * Helpers puros sobre el esquema del relevamiento (spec 2026-09-21, adenda). Nada acá conoce
 * una clave por su nombre salvo `nombre`, que es la única obligatoria: el resto se recorre.
 */

type Catalogos = IEsquemaAlta['catalogos']

/** `''`/espacios → null. */
export function normalizarValor(v: string | null | undefined): string | null {
    const t = (v ?? '').trim()
    return t === '' ? null : t
}

export function valorDe(detalle: IDetalleAlta | null | undefined, clave: string): string | null {
    const v = detalle?.[clave]
    return typeof v === 'string' ? v : null
}

/** El valor "guardado" de un campo, con el que se compara el diff. `nombre` cae al nombre de
 *  la card cuando el detalle no lo trae: si se comparara contra '' un no-op mandaría
 *  `{ nombre }` (es el bug que ya anotaba `ClienteNuevoSheet.confirmar`). */
function guardado(campo: ICampoAlta, detalle: IDetalleAlta | null | undefined, nombreFallback: string): string | null {
    const v = valorDe(detalle, campo.clave)
    if (campo.clave === 'nombre') return v ?? nombreFallback
    return v
}

/** State del formulario: una string por campo ('' = sin valor). */
export function estadoInicial(
    campos: ICampoAlta[],
    detalle: IDetalleAlta | null | undefined,
    nombreFallback: string,
): Record<string, string> {
    const estado: Record<string, string> = {}
    for (const c of campos) estado[c.clave] = guardado(c, detalle, nombreFallback) ?? ''
    return estado
}

/** Solo las claves cuyo valor normalizado cambió. `nombre` vacío no viaja (el botón Guardar
 *  ya lo bloquea; acá se defiende igual para no mandar nunca `nombre: null`). */
export function diffDetalle(
    campos: ICampoAlta[],
    detalle: IDetalleAlta | null | undefined,
    estado: Record<string, string>,
    nombreFallback: string,
): IEditarAltaDTO {
    const cambios: Record<string, string | null> = {}
    for (const c of campos) {
        const nuevo = normalizarValor(estado[c.clave])
        if (c.requerido && nuevo === null) continue
        if (nuevo !== guardado(c, detalle, nombreFallback)) cambios[c.clave] = nuevo
    }
    return cambios as IEditarAltaDTO
}

export function contarCargados(campos: ICampoAlta[], estado: Record<string, string>): number {
    return campos.filter(c => normalizarValor(estado[c.clave]) !== null).length
}

/** Descripción de un código, buscando también entre los inactivos: un valor guardado que
 *  después se dio de baja se sigue mostrando. Sin match (o sin catálogos) devuelve el código. */
export function descripcionCatalogo(catalogos: Catalogos, tipo: string | undefined, codigo: string | null): string {
    if (codigo === null) return ''
    const item = tipo ? catalogos?.[tipo]?.find(i => i.codigo === codigo) : undefined
    return item?.descripcion ?? codigo
}

/** Opciones del select: los activos, más el valor actual si está inactivo (para que el select
 *  no lo "pierda" mostrando la primera opción). Sin catálogos → vacío. */
export function opcionesDeCatalogo(catalogos: Catalogos, tipo: string | undefined, valorActual: string | null): ICatalogoAltaItem[] {
    const todos = tipo ? catalogos?.[tipo] ?? [] : []
    return todos.filter(i => i.activo || (valorActual !== null && i.codigo === valorActual))
}

export function camposPorSeccion(esquema: IEsquemaAlta): { seccion: ISeccionAlta; campos: ICampoAlta[] }[] {
    return esquema.secciones
        .map(seccion => ({ seccion, campos: esquema.campos.filter(c => c.seccion === seccion.clave) }))
        .filter(g => g.campos.length > 0)
}
```

- [ ] **Step 6: Verlo pasar y compilar**

Run: `cd $APP && npx vitest run src/lib/camposAlta.test.ts && npx tsc -b --noEmit`
Expected: PASS. `tsc` va a marcar en `ClienteNuevoSheet.tsx` los `cambios.razonSocial = ...` si el tipo cambió — no importa: la Task 8 borra ese modo. Si hay otros errores por `IDetalleAlta` (fixtures con las tres claves siguen siendo válidos), arreglarlos acá.

- [ ] **Step 7: Commit**

```bash
cd $APP && git add src/types/planificacion.ts src/api/planificacion.ts src/hooks/useEsquemaAlta.ts src/lib/camposAlta.ts src/lib/camposAlta.test.ts
git commit -m "feat(relevamiento): tipos del esquema, getEsquemaAlta, useEsquemaAlta y helpers camposAlta

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `RelevamientoSheet` — "Datos del comercio"

**Files:**
- Create: `$APP/src/components/RelevamientoSheet.tsx`
- Create: `$APP/src/components/RelevamientoSheet.test.tsx`

**Interfaces:**
- Consumes: `useEsquemaAlta`, `camposAlta.ts` (Task 6), `useEditarAlta` (`src/hooks/useAltas.ts`, existente), `BottomSheet`, `Button`.
- Produces: `export default function RelevamientoSheet(props: { open: boolean; cliente: IAgendaClient | null; onClose: () => void; onGuardado: (cliente: IAgendaClient) => void; onAviso: (tipo: NotificacionTipo, mensaje: string) => void })`. La usan las Tasks 8 y 9.

- [ ] **Step 1: Test**

`src/components/RelevamientoSheet.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import RelevamientoSheet from './RelevamientoSheet'
import * as api from '@/api/planificacion'
import type { IAgendaClient, IEsquemaAlta } from '@/types/planificacion'

vi.mock('@/api/planificacion')

const ESQUEMA: IEsquemaAlta = {
    secciones: [
        { clave: 'identidad', titulo: 'Identidad' },
        { clave: 'comercial', titulo: 'Comercial' },
        { clave: 'notas', titulo: 'Notas' },
    ],
    campos: [
        { clave: 'nombre', etiqueta: 'Nombre del comercio', seccion: 'identidad', tipo: 'texto', max: 120, requerido: true },
        { clave: 'cuit', etiqueta: 'CUIT', seccion: 'identidad', tipo: 'cuit', max: 13 },
        { clave: 'condicionIva', etiqueta: 'Condición de IVA', seccion: 'comercial', tipo: 'catalogo', catalogo: 'iva' },
        { clave: 'datoDeColor', etiqueta: 'Dato de color', seccion: 'notas', tipo: 'textoLargo', max: 300 },
    ],
    catalogos: { iva: [{ codigo: 'RI', descripcion: 'Responsable Inscripto', orden: 10, activo: true }] },
}

const cliente = (over: Partial<IAgendaClient> = {}): IAgendaClient => ({
    codigoCliente: 'ALTA-000009', codigoParticularCliente: 'ALTA-000009', nombreCliente: 'Autopartes Piche',
    rotacionClienteId: 9, dia: 3, estado: 'pendiente', visitaId: null, ofrecimientosPendientes: 0,
    observaciones: null, seguimiento: { estado: 'no_corresponde', motivo: null, mensaje: null },
    esExtra: true, tipo: 'alta',
    detalleAlta: { nombre: 'Autopartes Piche', razonSocial: null, direccion: null, cuit: '30-1' },
    ...over,
} as IAgendaClient)

function wrap(ui: ReactElement) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getEsquemaAlta).mockResolvedValue(ESQUEMA)
    vi.mocked(api.editarAlta).mockResolvedValue(cliente())
})

it('dibuja las secciones y campos del esquema, precargados desde detalleAlta, y cuenta los cargados', async () => {
    wrap(<RelevamientoSheet open cliente={cliente()} onClose={() => {}} onGuardado={() => {}} onAviso={() => {}} />)
    expect(await screen.findByText('Identidad')).toBeInTheDocument()
    expect(screen.getByText('Comercial')).toBeInTheDocument()
    expect(screen.getByText('Notas')).toBeInTheDocument()
    expect(screen.getByLabelText(/nombre del comercio/i)).toHaveValue('Autopartes Piche')
    expect(screen.getByLabelText(/cuit/i)).toHaveValue('30-1')
    expect(screen.getByLabelText(/condición de iva/i)).toHaveValue('')
    expect(screen.getByText(/2 de 4 datos/)).toBeInTheDocument()
    expect(screen.getByText('Datos del comercio')).toBeInTheDocument()
})

it('guarda SOLO el diff y avisa', async () => {
    const onGuardado = vi.fn(); const onClose = vi.fn()
    wrap(<RelevamientoSheet open cliente={cliente()} onClose={onClose} onGuardado={onGuardado} onAviso={() => {}} />)
    fireEvent.change(await screen.findByLabelText(/condición de iva/i), { target: { value: 'RI' } })
    fireEvent.change(screen.getByLabelText(/dato de color/i), { target: { value: ' le gusta el fútbol ' } })
    expect(screen.getByText(/4 de 4 datos/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    await waitFor(() => expect(api.editarAlta).toHaveBeenCalledWith(9, { condicionIva: 'RI', datoDeColor: 'le gusta el fútbol' }))
    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
})

it('sin cambios manda {} (no-op), nunca el nombre', async () => {
    wrap(<RelevamientoSheet open cliente={cliente({ detalleAlta: null })} onClose={() => {}} onGuardado={() => {}} onAviso={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /^guardar$/i }))
    await waitFor(() => expect(api.editarAlta).toHaveBeenCalledWith(9, {}))
})

it('nombre vacío deshabilita Guardar', async () => {
    wrap(<RelevamientoSheet open cliente={cliente()} onClose={() => {}} onGuardado={() => {}} onAviso={() => {}} />)
    fireEvent.change(await screen.findByLabelText(/nombre del comercio/i), { target: { value: '  ' } })
    expect(screen.getByRole('button', { name: /^guardar$/i })).toBeDisabled()
})

it('catálogos null: el select queda deshabilitado y el resto sigue operativo', async () => {
    vi.mocked(api.getEsquemaAlta).mockResolvedValue({ ...ESQUEMA, catalogos: null })
    wrap(<RelevamientoSheet open cliente={cliente()} onClose={() => {}} onGuardado={() => {}} onAviso={() => {}} />)
    const select = await screen.findByLabelText(/condición de iva/i)
    expect(select).toBeDisabled()
    expect(screen.getByText(/lista no disponible/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/cuit/i), { target: { value: '30-2' } })
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    await waitFor(() => expect(api.editarAlta).toHaveBeenCalledWith(9, { cuit: '30-2' }))
})

it('un valor guardado que no está activo se sigue mostrando en el select', async () => {
    wrap(<RelevamientoSheet open cliente={cliente({ detalleAlta: { nombre: 'Piche', condicionIva: 'NR' } })} onClose={() => {}} onGuardado={() => {}} onAviso={() => {}} />)
    const select = await screen.findByLabelText(/condición de iva/i)
    expect(select).toHaveValue('NR')
    expect(screen.getByRole('option', { name: 'NR' })).toBeInTheDocument()
})

it('esquema fallado: muestra el error con "Volver a intentar" y sin botón Guardar', async () => {
    vi.mocked(api.getEsquemaAlta).mockRejectedValue(new Error('500'))
    wrap(<RelevamientoSheet open cliente={cliente()} onClose={() => {}} onGuardado={() => {}} onAviso={() => {}} />)
    expect(await screen.findByRole('button', { name: /volver a intentar/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^guardar$/i })).not.toBeInTheDocument()
})

it('error al guardar → onAviso error y el sheet sigue abierto con lo tipeado', async () => {
    vi.mocked(api.editarAlta).mockRejectedValue(new Error('500'))
    const onAviso = vi.fn(); const onClose = vi.fn()
    wrap(<RelevamientoSheet open cliente={cliente()} onClose={onClose} onGuardado={() => {}} onAviso={onAviso} />)
    fireEvent.change(await screen.findByLabelText(/cuit/i), { target: { value: '30-9' } })
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    await waitFor(() => expect(onAviso).toHaveBeenCalledWith('error', 'No se pudieron guardar los datos. Volvé a intentar.'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/cuit/i)).toHaveValue('30-9')
})
```

Si `IAgendaClient` exige campos que el fixture no trae, el `as IAgendaClient` los cubre; mirar `ClienteCard.test.tsx` para el helper `cliente()` que ya existe y, si es exportable, reusarlo.

- [ ] **Step 2: Verlo fallar**

Run: `cd $APP && npx vitest run src/components/RelevamientoSheet.test.tsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`src/components/RelevamientoSheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Loader2, WifiOff } from 'lucide-react'
import BottomSheet from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/button'
import { useEsquemaAlta } from '@/hooks/useEsquemaAlta'
import { useEditarAlta } from '@/hooks/useAltas'
import {
    camposPorSeccion, contarCargados, diffDetalle, estadoInicial, normalizarValor, opcionesDeCatalogo,
} from '@/lib/camposAlta'
import type { NotificacionTipo } from '@/components/ui/Notification'
import type { IAgendaClient, ICampoAlta, IEsquemaAlta } from '@/types/planificacion'

interface RelevamientoSheetProps {
    open: boolean
    cliente: IAgendaClient | null
    onClose: () => void
    onGuardado: (cliente: IAgendaClient) => void
    onAviso: (tipo: NotificacionTipo, mensaje: string) => void
}

const INPUT = 'w-full rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white px-3 py-2.5 text-sm font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6] focus:border-dsnavy disabled:bg-[#F1F4F9] disabled:text-[#8A93A6]'
const LABEL = 'mb-1 block text-[9.5px] font-bold uppercase tracking-wide text-dsmuted'
const SECCION = 'text-[9.5px] font-bold uppercase tracking-wide text-dsmuted'

/**
 * "Datos del comercio" (spec 2026-09-21): lo que administración necesita para dar de alta al
 * cliente nuevo en el ERP, cargado por el vendedor parado en el local. Todo opcional salvo el
 * nombre. Se guarda en `pl_rotacion_cliente.detalle` con un PUT explícito, solo el diff.
 *
 * El formulario es GENÉRICO: dibuja lo que trae GET /altas/esquema (secciones, campos,
 * catálogos). Acá no hay ninguna clave escrita por su nombre — agregar un dato al relevamiento
 * es un cambio en la API, no en este archivo. Lo único que este componente sabe es cómo se
 * dibuja cada TIPO de campo (`CampoInput`).
 *
 * Vocabulario del vendedor: "Datos del comercio", nunca "relevamiento" ni "alta".
 */
export default function RelevamientoSheet({ open, cliente, onClose, onGuardado, onAviso }: RelevamientoSheetProps) {
    const esquema = useEsquemaAlta(open)
    const editar = useEditarAlta()
    const [valores, setValores] = useState<Record<string, string>>({})

    // Se precarga al abrir y cuando llega el esquema; no en cada render — lo tipeado no se pisa.
    useEffect(() => {
        if (!open || !cliente || !esquema.data) return
        setValores(estadoInicial(esquema.data.campos, cliente.detalleAlta, cliente.nombreCliente))
    }, [open, cliente, esquema.data])

    if (!cliente) return null

    const campos = esquema.data?.campos ?? []
    const cargados = contarCargados(campos, valores)
    const nombreCampo = campos.find(c => c.requerido)
    const nombreVacio = nombreCampo ? normalizarValor(valores[nombreCampo.clave]) === null : false
    const trabajando = editar.isPending

    async function guardar() {
        if (!cliente || !esquema.data) return
        const dto = diffDetalle(esquema.data.campos, cliente.detalleAlta, valores, cliente.nombreCliente)
        try {
            const actualizado = await editar.mutateAsync({ rotacionClienteId: cliente.rotacionClienteId, dto })
            onGuardado(actualizado)
            onClose()
        } catch {
            onAviso('error', 'No se pudieron guardar los datos. Volvé a intentar.')
        }
    }

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            eyebrow={esquema.data ? `Cliente nuevo · ${cargados} de ${campos.length} datos` : 'Cliente nuevo'}
            title="Datos del comercio"
            subtitle={cliente.nombreCliente}
            altura="completa"
            footer={
                esquema.data ? (
                    <Button onClick={guardar} disabled={trabajando || nombreVacio} loading={trabajando}
                        className="h-12 w-full bg-dsgreen text-[14.5px] hover:bg-dsgreen/90">
                        Guardar
                    </Button>
                ) : undefined
            }
        >
            {esquema.isPending && (
                <div className="flex justify-center py-10">
                    <Loader2 className="h-7 w-7 animate-spin text-dsnavy" strokeWidth={2.4} />
                </div>
            )}
            {esquema.isError && (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <WifiOff className="h-7 w-7 text-dsmuted" strokeWidth={2} />
                    <p className="text-sm font-semibold text-[#182645]">No se pudo cargar el formulario.</p>
                    <Button variant="outline" onClick={() => esquema.refetch()}>Volver a intentar</Button>
                </div>
            )}
            {esquema.data && (
                <div className="flex flex-col gap-5 pb-2">
                    {camposPorSeccion(esquema.data).map(({ seccion, campos: delGrupo }) => (
                        <section key={seccion.clave} className="flex flex-col gap-3">
                            <h3 className={SECCION}>{seccion.titulo}</h3>
                            {delGrupo.map(campo => (
                                <CampoInput
                                    key={campo.clave}
                                    campo={campo}
                                    catalogos={esquema.data!.catalogos}
                                    valor={valores[campo.clave] ?? ''}
                                    onChange={v => setValores(prev => ({ ...prev, [campo.clave]: v }))}
                                />
                            ))}
                        </section>
                    ))}
                </div>
            )}
        </BottomSheet>
    )
}

interface CampoInputProps {
    campo: ICampoAlta
    catalogos: IEsquemaAlta['catalogos']
    valor: string
    onChange: (v: string) => void
}

/** Un widget por TIPO de campo. Es la única tabla "tipo → cómo se dibuja" del front; un tipo
 *  nuevo en el esquema se agrega acá y en el validador de la API, en ningún otro lado. */
function CampoInput({ campo, catalogos, valor, onChange }: CampoInputProps) {
    const id = `rel-${campo.clave}`
    const etiqueta = campo.requerido ? campo.etiqueta : `${campo.etiqueta} (opcional)`

    if (campo.tipo === 'catalogo') {
        const sinLista = catalogos === null
        const opciones = opcionesDeCatalogo(catalogos, campo.catalogo, normalizarValor(valor))
        // Un valor guardado que ya no figura en el catálogo entero (ni activo ni inactivo):
        // se agrega como opción con su código pelado para que el select no lo pierda.
        const huerfano = valor !== '' && !opciones.some(o => o.codigo === valor)
        return (
            <div>
                <label htmlFor={id} className={LABEL}>{etiqueta}</label>
                <select id={id} className={INPUT} value={valor} disabled={sinLista} onChange={e => onChange(e.target.value)}>
                    <option value="">{sinLista ? 'Lista no disponible' : 'Elegí una opción…'}</option>
                    {opciones.map(o => <option key={o.codigo} value={o.codigo}>{o.descripcion}</option>)}
                    {huerfano && <option value={valor}>{valor}</option>}
                </select>
            </div>
        )
    }

    if (campo.tipo === 'textoLargo') {
        return (
            <div>
                <div className="mb-1 flex items-baseline justify-between">
                    <label htmlFor={id} className={`${LABEL} mb-0`}>{etiqueta}</label>
                    {campo.max !== undefined && (
                        <span className="text-[10px] font-semibold text-dsmuted">{valor.length}/{campo.max}</span>
                    )}
                </div>
                <textarea id={id} rows={2} maxLength={campo.max} className={`${INPUT} resize-none`}
                    value={valor} placeholder={campo.placeholder} onChange={e => onChange(e.target.value)} />
            </div>
        )
    }

    const inputMode = campo.tipo === 'cuit' ? 'numeric' : campo.tipo === 'email' ? 'email' : undefined
    const type = campo.tipo === 'email' ? 'email' : 'text'
    return (
        <div>
            <label htmlFor={id} className={LABEL}>{etiqueta}</label>
            <input id={id} type={type} inputMode={inputMode} maxLength={campo.max} className={INPUT}
                value={valor} placeholder={campo.placeholder} onChange={e => onChange(e.target.value)} />
        </div>
    )
}
```

Notas para el implementador:
- Si `Button` no tiene `variant="outline"`, mirar `src/components/ui/button.tsx` y usar el variant que sí exista para botones secundarios (el de "Volver a intentar" en `VisitaSheet.tsx:837` es el patrón a copiar).
- `useEsquemaAlta(open)`: con `enabled: false` React Query deja `isPending: true` y `data: undefined`; como el sheet cerrado no renderiza nada visible, no importa.
- El test "sin cambios manda {}" pasa `detalleAlta: null`; `estadoInicial` toma `nombreCliente` como fallback de `nombre`, y `diffDetalle` compara contra ese mismo fallback → `{}`.

- [ ] **Step 4: Verlo pasar**

Run: `cd $APP && npx vitest run src/components/RelevamientoSheet.test.tsx && npx tsc -b --noEmit`
Expected: PASS (los errores de `ClienteNuevoSheet` por el tipo, si quedan, se resuelven en la Task 8).

- [ ] **Step 5: Commit**

```bash
cd $APP && git add src/components/RelevamientoSheet.tsx src/components/RelevamientoSheet.test.tsx
git commit -m "feat(relevamiento): RelevamientoSheet — \"Datos del comercio\" dibujado desde el esquema de la API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Puntos de entrada del vendedor: card, agenda y baja del modo `editar`

**Files:**
- Modify: `$APP/src/components/ClienteCard.tsx:169-178`
- Modify: `$APP/src/components/ClienteCard.test.tsx:332-341`
- Modify: `$APP/src/components/ClienteNuevoSheet.tsx`
- Modify: `$APP/src/components/ClienteNuevoSheet.test.tsx:47-64`
- Modify: `$APP/src/pages/AgendaSemanaPage.tsx:255-257, 590, 710-722`

**Interfaces:**
- Consumes: `RelevamientoSheet` (Task 7).
- Produces: `ModoClienteNuevo` sin la variante `'editar'`; `AgendaSemanaPage` tiene `const [relevamiento, setRelevamiento] = useState<IAgendaClient | null>(null)` — la Task 9 lo cablea también desde `VisitaFlow`.

- [ ] **Step 1: Ajustar los tests**

`ClienteCard.test.tsx:332-341`: renombrar el `it` a `'... muestra el chip, la dirección, Datos e Iniciar; ...'` y cambiar `fireEvent.click(screen.getByRole('button', { name: /editar/i }))` por `fireEvent.click(screen.getByRole('button', { name: /^datos$/i }))`.

`ClienteNuevoSheet.test.tsx`: **borrar** los dos `it('editar: ...')` (líneas 47-64). Si el fixture `cliente` solo se usaba ahí, borrarlo también.

- [ ] **Step 2: Verlos fallar**

Run: `cd $APP && npx vitest run src/components/ClienteCard.test.tsx src/components/ClienteNuevoSheet.test.tsx`
Expected: ClienteCard FALLA (el botón dice "Editar"); ClienteNuevoSheet pasa (solo se borraron tests).

- [ ] **Step 3: `ClienteCard`: "Editar" → "Datos"**

En `ClienteCard.tsx:176`, reemplazar el texto `Editar` por `Datos`. Dejar el ícono `Pencil` y la condición `alta && onEditarAlta && cliente.estado === 'pendiente'` como están. Actualizar el comentario de la prop `onEditarAlta` (línea ~35) a: `/** Abre "Datos del comercio" (RelevamientoSheet) de una fila de alta pendiente. */`.

- [ ] **Step 4: `ClienteNuevoSheet`: sacar el modo `editar`**

- `ModoClienteNuevo` queda con `crear` y `reintentar`.
- En el `useEffect`, borrar la rama `else if (contexto.modo === 'editar') {...}`.
- En `confirmar`, borrar la rama `else if (contexto.modo === 'editar') {...}` y el `import`/uso de `useEditarAlta` e `IEditarAltaDTO`.
- `titulo`: `contexto.modo === 'crear' ? 'Cliente nuevo' : contexto.cliente.nombreCliente`. `eyebrow`: `contexto.modo === 'crear' ? \`Agregar al ${diaLabel(dia)}\` : 'Cliente nuevo · volver a agendar'`. `labelBoton`: `contexto.modo === 'crear' ? \`Agregar al ${diaLabel(dia)}\` : \`Volver a agendar el ${diaLabel(dia)}\``.
- `{contexto.modo !== 'editar' && (` → sin condición (el bloque de Día se muestra siempre).
- Actualizar el docblock: "Dos modos sobre el mismo formulario: crear la cita (nombre obligatorio, día elegible) y volver a agendar después de un 'No visité'. Editar los datos del comercio vive en `RelevamientoSheet` (spec 2026-09-21)."

- [ ] **Step 5: `AgendaSemanaPage`: abrir `RelevamientoSheet`**

- Import: `import RelevamientoSheet from '@/components/RelevamientoSheet'`.
- Junto al state `clienteNuevo` (línea ~257), agregar:
  ```ts
  // "Datos del comercio" de una fila de alta: null = cerrado. Se abre desde la card
  // (pendiente) y desde la visita abierta (VisitaFlow.onDatosComercio).
  const [relevamiento, setRelevamiento] = useState<IAgendaClient | null>(null)
  ```
  y ajustar el comentario del state `clienteNuevo` (ya no comparte "editar").
- Línea 590: `onEditarAlta={setRelevamiento}`.
- En el `onListo` de `ClienteNuevoSheet` (línea ~719): el mensaje pasa a `\`Cliente nuevo agendado el ${NOMBRE_DIA[DIAS[cliente.dia - 1]]}\`` sin el ternario de `editar`.
- Después de `<ClienteNuevoSheet ... />`, renderizar:
  ```tsx
  <RelevamientoSheet
      open={relevamiento !== null}
      cliente={relevamiento}
      onClose={() => setRelevamiento(null)}
      onAviso={mostrar}
      onGuardado={() => mostrar('exito', 'Datos guardados')}
  />
  ```

- [ ] **Step 6: Verlo pasar y compilar**

Run: `cd $APP && npx vitest run src/components/ClienteCard.test.tsx src/components/ClienteNuevoSheet.test.tsx src/pages/AgendaSemanaPage.test.tsx && npx tsc -b --noEmit`
Expected: PASS y sin errores de tipo.

- [ ] **Step 7: Commit**

```bash
cd $APP && git add src/components/ClienteCard.tsx src/components/ClienteCard.test.tsx src/components/ClienteNuevoSheet.tsx src/components/ClienteNuevoSheet.test.tsx src/pages/AgendaSemanaPage.tsx
git commit -m "feat(relevamiento): la card abre \"Datos del comercio\"; ClienteNuevoSheet pierde el modo editar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `VisitaSheet`: botón "Datos" y precarga de "Con quién hablaste"

**Files:**
- Modify: `$APP/src/components/VisitaSheet.tsx` (props ~63-114; state `contacto` ~171; bloque `acciones` ~453-482)
- Modify: `$APP/src/components/VisitaSheet.test.tsx` (describe `cliente nuevo (esAlta)`, ~1100)
- Modify: `$APP/src/components/VisitaFlow.tsx` (props ~13-40; `<VisitaSheet>` ~443-469)
- Modify: `$APP/src/pages/AgendaSemanaPage.tsx` (`<VisitaFlow ...>` ~598)

**Interfaces:**
- Consumes: `setRelevamiento` (Task 8).
- Produces: `VisitaSheetProps.onDatosComercio?: () => void`, `VisitaSheetProps.contactoSugerido?: string | null`; `VisitaFlowProps.onDatosComercio?: (cliente: IAgendaClient) => void`.

- [ ] **Step 1: Tests**

Dentro de `describe('cliente nuevo (esAlta)')` en `VisitaSheet.test.tsx`, agregar:

```tsx
    it('muestra "Datos" en la línea de identidad solo con esAlta, visita abierta y handler', async () => {
        ;(api.getOfrecimientos as any).mockResolvedValue([])
        const onDatosComercio = vi.fn()
        renderSheet({ esAlta: true, enCurso: true, onDatosComercio })
        fireEvent.click(await screen.findByRole('button', { name: /^datos$/i }))
        expect(onDatosComercio).toHaveBeenCalled()
    })

    it('con la visita cerrada no hay botón Datos aunque haya handler', async () => {
        ;(api.getOfrecimientos as any).mockResolvedValue([])
        renderSheet({ esAlta: true, visitaCerrada: true, onDatosComercio: vi.fn() })
        await screen.findByText(/cliente nuevo/i)
        expect(screen.queryByRole('button', { name: /^datos$/i })).not.toBeInTheDocument()
    })

    it('un cliente real no muestra Datos aunque se pase el handler', async () => {
        renderSheet({ enCurso: true, onDatosComercio: vi.fn() })
        await screen.findByText('Amortiguadores')
        expect(screen.queryByRole('button', { name: /^datos$/i })).not.toBeInTheDocument()
    })

    it('precarga "Con quién hablaste" con contactoSugerido, y NO pisa lo ya tipeado', async () => {
        ;(api.getOfrecimientos as any).mockResolvedValue([])
        const { rerender } = renderSheetConRerender({ esAlta: true, enCurso: true, contactoSugerido: 'Gustavo' })
        const input = await screen.findByLabelText(/con quién hablaste/i)
        expect(input).toHaveValue('Gustavo')
        fireEvent.change(input, { target: { value: 'Marta' } })
        rerender({ esAlta: true, enCurso: true, contactoSugerido: 'Gustavo Pérez' })
        expect(screen.getByLabelText(/con quién hablaste/i)).toHaveValue('Marta')
    })
```

Agregar junto a `renderSheet` un helper que devuelva `rerender` con las mismas props base:

```tsx
function renderSheetConRerender(over: Record<string, unknown> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const base = { open: true, visitaId: 42, nombreCliente: 'Almacén Don José', visitaCerrada: false, onCerrarVisita: vi.fn(), onClose: () => {} }
    const ui = (p: Record<string, unknown>) => (
        <QueryClientProvider client={qc}><VisitaSheet {...(base as any)} {...p} /></QueryClientProvider>
    )
    const r = render(ui(over))
    return { rerender: (p: Record<string, unknown>) => r.rerender(ui(p)) }
}
```

- [ ] **Step 2: Verlos fallar**

Run: `cd $APP && npx vitest run src/components/VisitaSheet.test.tsx -t "Datos|Con quién hablaste"`
Expected: FAIL (no existe el botón; el input arranca vacío).

- [ ] **Step 3: `VisitaSheet`**

Props (después de `onNoVisita`):

```ts
    /** Sólo `esAlta` con la visita abierta: abre "Datos del comercio" (RelevamientoSheet) desde
     *  la línea de identidad del header, al lado de "No visité". Con la visita cerrada no se
     *  muestra: el backend rebota FILA_RESUELTA y no hay nada que editar. */
    onDatosComercio?: () => void
    /** Sólo `esAlta`: `detalleAlta.contactoNombre`. Precarga "Con quién hablaste" si está vacío;
     *  editable, y nunca pisa lo que el vendedor ya tipeó. Dos conceptos distintos que
     *  conviven: el contacto del COMERCIO (plan) y con quién habló ESTA vez (hecho). */
    contactoSugerido?: string | null
```

Destructurar `onDatosComercio` y `contactoSugerido = null` junto a las otras props. Corregir de paso el comentario de `onNoVisita` (dice "el menú `⋯` del header": no hay menú; es un botón en la línea de identidad).

Precarga, debajo de los `useState` de `contacto`/`fechaNacimiento`:

```ts
    // Al abrir (y si el sugerido cambia), sólo si el campo está vacío. `contacto` no está en
    // las deps a propósito: si estuviera, borrar el campo lo volvería a llenar.
    useEffect(() => {
        if (!open || !esAlta || !contactoSugerido) return
        setContacto(prev => (prev.trim() === '' ? contactoSugerido : prev))
    }, [open, esAlta, contactoSugerido])
```

Botón, en el bloque de `acciones` (~453), antes de `botonNoVisita`:

```tsx
    // Mismo estilo que ChipDescuentos (consulta/edición, no la salida negativa), y ANTES de
    // "No visité": lo negativo queda al borde. Sin menú intermedio (ver comentario de arriba).
    const botonDatos =
        esAlta && !visitaCerrada && onDatosComercio ? (
            <button
                type="button"
                onClick={onDatosComercio}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 text-[11px] font-bold text-violet-700"
            >
                <Pencil className="h-[12px] w-[12px]" strokeWidth={2.4} />
                Datos
            </button>
        ) : null

    const acciones =
        chipDescuentos || botonDatos || botonNoVisita ? (
            <div className="flex items-center gap-1.5">
                {chipDescuentos}
                {botonDatos}
                {botonNoVisita}
            </div>
        ) : undefined
```

Sumar `Pencil` al import de `lucide-react`.

- [ ] **Step 4: `VisitaFlow` y `AgendaSemanaPage`**

`VisitaFlow.tsx`, props:

```ts
    /** Abre "Datos del comercio" del cliente de esta visita (sólo si es alta). Lo dueño es la
     *  página: el RelevamientoSheet es uno solo, compartido con la card. */
    onDatosComercio?: (cliente: IAgendaClient) => void
```

En el `<VisitaSheet>` (~443), agregar:

```tsx
                    onDatosComercio={clienteEsAlta && onDatosComercio ? () => onDatosComercio(cliente) : undefined}
                    contactoSugerido={clienteEsAlta ? cliente.detalleAlta?.contactoNombre ?? null : null}
```

`AgendaSemanaPage.tsx`, en `<VisitaFlow ...>`: `onDatosComercio={setRelevamiento}`.

- [ ] **Step 5: Verlo pasar y compilar**

Run: `cd $APP && npx vitest run src/components/VisitaSheet.test.tsx src/components/VisitaFlow.test.tsx src/pages/AgendaSemanaPage.test.tsx && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 6: Probar en el navegador (si hay API local con datos)**

`npm run dev`, entrar como vendedor con una fila de alta: la card pendiente muestra "Datos" y abre el sheet; iniciar la visita → en el header aparece "Datos" al lado de "No visité"; cargar `Nombre del contacto`, guardar, y en el pie de la visita "Con quién hablaste" ya viene con ese nombre. Si no hay entorno, anotarlo.

- [ ] **Step 7: Commit**

```bash
cd $APP && git add src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx src/components/VisitaFlow.tsx src/pages/AgendaSemanaPage.tsx
git commit -m "feat(relevamiento): botón Datos en la visita abierta y precarga de \"Con quién hablaste\"

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Front — gerencia

### Task 10: `csv.ts`

**Files:**
- Create: `$APP/src/lib/csv.ts`
- Create: `$APP/src/lib/csv.test.ts`

**Interfaces:**
- Produces: `SEPARADOR_CSV = ';'`, `escaparCeldaCsv(v: string | null | undefined): string`, `aCsv(filas: (string | null | undefined)[][]): string` (con BOM y `\r\n`), `descargarCsv(nombreArchivo: string, contenido: string): void`.

- [ ] **Step 1: Test**

```ts
import { describe, expect, it } from 'vitest'
import { aCsv, escaparCeldaCsv } from './csv'

describe('escaparCeldaCsv', () => {
    it('null/undefined → vacío; texto simple tal cual', () => {
        expect(escaparCeldaCsv(null)).toBe('')
        expect(escaparCeldaCsv(undefined)).toBe('')
        expect(escaparCeldaCsv('Piche')).toBe('Piche')
    })
    it('envuelve en comillas si hay ; comillas o salto de línea, y duplica las comillas', () => {
        expect(escaparCeldaCsv('a;b')).toBe('"a;b"')
        expect(escaparCeldaCsv('dijo "hola"')).toBe('"dijo ""hola"""')
        expect(escaparCeldaCsv('línea 1\nlínea 2')).toBe('"línea 1\nlínea 2"')
    })
})

describe('aCsv', () => {
    it('BOM UTF-8, separador ; y CRLF', () => {
        const csv = aCsv([['Comercio', 'CUIT'], ['Piche', null]])
        expect(csv.charCodeAt(0)).toBe(0xfeff)
        expect(csv.slice(1)).toBe('Comercio;CUIT\r\nPiche;')
    })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `cd $APP && npx vitest run src/lib/csv.test.ts` → FAIL, módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
/**
 * CSV para Excel en español (spec 2026-09-21): separador `;` (el Excel regional usa la coma
 * como decimal y rompe con `,`), BOM UTF-8 (sin él las tildes salen mal al doble click) y
 * escapado RFC 4180. No hay otro CSV en el repo: si aparece otro, sale de acá.
 */
export const SEPARADOR_CSV = ';'
const BOM = '\ufeff'

export function escaparCeldaCsv(v: string | null | undefined): string {
    if (v === null || v === undefined) return ''
    const necesita = v.includes(SEPARADOR_CSV) || v.includes('"') || v.includes('\n') || v.includes('\r')
    return necesita ? `"${v.replace(/"/g, '""')}"` : v
}

export function aCsv(filas: (string | null | undefined)[][]): string {
    return BOM + filas.map(f => f.map(escaparCeldaCsv).join(SEPARADOR_CSV)).join('\r\n')
}

/** Dispara la descarga en el navegador. No se testea: es DOM puro. */
export function descargarCsv(nombreArchivo: string, contenido: string): void {
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreArchivo
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}
```

- [ ] **Step 4: Verlo pasar** — `npx vitest run src/lib/csv.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
cd $APP && git add src/lib/csv.ts src/lib/csv.test.ts
git commit -m "feat(relevamiento): csv.ts — RFC 4180 con ; y BOM para Excel en español

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Tipos, API, hook y filas del CSV de altas

**Files:**
- Modify: `$APP/src/types/analitica.ts` (al final)
- Modify: `$APP/src/api/analitica.ts` (al final)
- Modify: `$APP/src/hooks/useAnalitica.ts` (`analiticaKeys` + hook)
- Create: `$APP/src/lib/altasCsv.ts`
- Create: `$APP/src/lib/altasCsv.test.ts`

**Interfaces:**
- Consumes: `aCsv` (Task 10), `descripcionCatalogo`, `valorDe` (Task 6).
- Produces: `IAltaRelevada` (front); `getAltas(filtro: IAnaliticaFiltro): Promise<IAltaRelevada[]>`; `analiticaKeys.altas(f)`, `useAltasRelevadas(filtro)`; `ETIQUETA_ESTADO_ALTA: Record<EstadoCicloCliente, string>`; `filasCsvAltas(esquema, altas): (string | null)[][]`; `nombreArchivoAltas(hoy: Date): string`.

- [ ] **Step 1: Tipos y API**

`src/types/analitica.ts`, al final (sumar `EstadoCicloCliente, IDetalleAlta, IDetalleContactoAlta` al import de `./planificacion`):

```ts
/** GET /planificacion/analitica/altas. Una por fila del plan tipo='alta' (un reintento
 *  aparece aparte, a propósito). Espejo del backend. */
export interface IAltaRelevada {
    rotacionClienteId: number
    vendedor: { codigo: string; nombre: string }
    estado: EstadoCicloCliente
    fechaVisita: string | null
    detalle: IDetalleAlta | null
    contacto: IDetalleContactoAlta | null
    camposCargados: number
    camposTotal: number
}
```

`src/api/analitica.ts`, al final (sin rama mock: no hay fixture de altas y el flag `USA_MOCK` no la necesita):

```ts
/** Relevamiento de los clientes nuevos del rango, más nuevos primero. */
export const getAltas = async (filtro: IAnaliticaFiltro): Promise<IAltaRelevada[]> => {
    const res = await apiClient.get('/planificacion/analitica/altas', { params: filtro })
    return res.data.data
}
```

`src/hooks/useAnalitica.ts`: en `analiticaKeys` agregar

```ts
    altas: (f: IAnaliticaFiltro) =>
        ['analitica', 'altas', f.desde, f.hasta, (f.vendedores ?? []).join(',')] as const,
```

y el hook:

```ts
export function useAltasRelevadas(filtro: IAnaliticaFiltro) {
    return useQuery({
        queryKey: analiticaKeys.altas(filtro),
        queryFn: () => getAltas(filtro),
    })
}
```

- [ ] **Step 2: Test de `altasCsv.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { filasCsvAltas, nombreArchivoAltas } from './altasCsv'
import type { IAltaRelevada } from '@/types/analitica'
import type { IEsquemaAlta } from '@/types/planificacion'

const ESQUEMA: IEsquemaAlta = {
    secciones: [{ clave: 'identidad', titulo: 'Identidad' }, { clave: 'comercial', titulo: 'Comercial' }],
    campos: [
        { clave: 'nombre', etiqueta: 'Nombre del comercio', seccion: 'identidad', tipo: 'texto', max: 120, requerido: true },
        { clave: 'condicionIva', etiqueta: 'Condición de IVA', seccion: 'comercial', tipo: 'catalogo', catalogo: 'iva' },
    ],
    catalogos: { iva: [{ codigo: 'RI', descripcion: 'Responsable Inscripto', orden: 10, activo: true }] },
}

const alta = (over: Partial<IAltaRelevada> = {}): IAltaRelevada => ({
    rotacionClienteId: 9, vendedor: { codigo: 'V 2', nombre: 'Gómez' }, estado: 'visitada', fechaVisita: '2026-09-21',
    detalle: { nombre: 'Piche', condicionIva: 'RI' }, contacto: { contacto: 'Gustavo', fechaNacimiento: '1978-03-14' },
    camposCargados: 2, camposTotal: 2, ...over,
})

describe('filasCsvAltas', () => {
    it('encabezado = etiquetas del esquema + columnas fijas; catálogo como descripción', () => {
        const filas = filasCsvAltas(ESQUEMA, [alta()])
        expect(filas[0]).toEqual(['Nombre del comercio', 'Condición de IVA', 'Vendedor', 'Estado', 'Fecha', 'Contacto de la visita', 'Cumpleaños del contacto', 'Datos cargados'])
        expect(filas[1]).toEqual(['Piche', 'Responsable Inscripto', 'Gómez', 'Visitada', '2026-09-21', 'Gustavo', '1978-03-14', '2/2'])
    })
    it('detalle null y contacto null salen vacíos, y el vendedor sin nombre cae al código', () => {
        const [, fila] = filasCsvAltas(ESQUEMA, [alta({ detalle: null, contacto: null, vendedor: { codigo: 'V 9', nombre: '' }, estado: 'pendiente', fechaVisita: null, camposCargados: 0 })])
        expect(fila).toEqual([null, null, 'V 9', 'Pendiente', null, null, null, '0/2'])
    })
})

describe('nombreArchivoAltas', () => {
    it('altas-YYYY-MM-DD.csv', () => {
        expect(nombreArchivoAltas(new Date(2026, 8, 21))).toBe('altas-2026-09-21.csv')
    })
})
```

- [ ] **Step 3: Verlo fallar** — `npx vitest run src/lib/altasCsv.test.ts` → FAIL.

- [ ] **Step 4: Implementar `altasCsv.ts`**

```ts
import { isoLocal } from '@/lib/fechas'
import { descripcionCatalogo, valorDe } from '@/lib/camposAlta'
import type { IAltaRelevada } from '@/types/analitica'
import type { EstadoCicloCliente, IEsquemaAlta } from '@/types/planificacion'

export const ETIQUETA_ESTADO_ALTA: Record<EstadoCicloCliente, string> = {
    pendiente: 'Pendiente',
    en_curso: 'En curso',
    visitada: 'Visitada',
    no_visita: 'No visitó',
}

/** Valor de un campo tal como se muestra a gerencia: el catálogo resuelto a descripción. */
export function valorVisible(esquema: IEsquemaAlta, alta: IAltaRelevada, clave: string): string | null {
    const campo = esquema.campos.find(c => c.clave === clave)
    const v = valorDe(alta.detalle, clave)
    if (v === null) return null
    return campo?.tipo === 'catalogo' ? descripcionCatalogo(esquema.catalogos, campo.catalogo, v) : v
}

/** Una fila por alta, columnas = las del esquema (en su orden) + las fijas de la visita.
 *  Recorre el esquema: un campo nuevo en la API aparece solo en el CSV. */
export function filasCsvAltas(esquema: IEsquemaAlta, altas: IAltaRelevada[]): (string | null)[][] {
    const encabezado = [
        ...esquema.campos.map(c => c.etiqueta),
        'Vendedor', 'Estado', 'Fecha', 'Contacto de la visita', 'Cumpleaños del contacto', 'Datos cargados',
    ]
    const filas = altas.map(a => [
        ...esquema.campos.map(c => valorVisible(esquema, a, c.clave)),
        a.vendedor.nombre || a.vendedor.codigo,
        ETIQUETA_ESTADO_ALTA[a.estado],
        a.fechaVisita,
        a.contacto?.contacto ?? null,
        a.contacto?.fechaNacimiento ?? null,
        `${a.camposCargados}/${a.camposTotal}`,
    ])
    return [encabezado, ...filas]
}

export function nombreArchivoAltas(hoy: Date): string {
    return `altas-${isoLocal(hoy)}.csv`
}
```

- [ ] **Step 5: Verlo pasar y compilar** — `npx vitest run src/lib/altasCsv.test.ts && npx tsc -b --noEmit` → PASS.

- [ ] **Step 6: Commit**

```bash
cd $APP && git add src/types/analitica.ts src/api/analitica.ts src/hooks/useAnalitica.ts src/lib/altasCsv.ts src/lib/altasCsv.test.ts
git commit -m "feat(relevamiento): getAltas, useAltasRelevadas y filas del CSV a partir del esquema

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: `TablaAltas`, `DetalleAltaPanel`, `AnaliticaAltasPage`, pestaña y ruta

**Files:**
- Create: `$APP/src/components/analitica/TablaAltas.tsx` + `TablaAltas.test.tsx`
- Create: `$APP/src/components/analitica/DetalleAltaPanel.tsx` + `DetalleAltaPanel.test.tsx`
- Create: `$APP/src/pages/AnaliticaAltasPage.tsx` + `AnaliticaAltasPage.test.tsx`
- Modify: `$APP/src/components/analitica/AnaliticaTabs.tsx` + `AnaliticaTabs.test.tsx`
- Modify: `$APP/src/App.tsx:41`

**Interfaces:**
- Consumes: `useAltasRelevadas`, `filasCsvAltas`, `nombreArchivoAltas`, `ETIQUETA_ESTADO_ALTA`, `valorVisible` (Task 11); `aCsv`, `descargarCsv` (Task 10); `useEsquemaAlta`, `camposPorSeccion`, `valorDe` (Task 6); `FiltrosAnalitica`, `useFiltroAnalitica`, `useVendedores`, `AnaliticaTabs`, `AccountMenu`, `useAccionesDeCuenta`, `useAuth` (existentes, ver `AnaliticaActividadPage.tsx`).
- Produces: `TablaAltas({ filas: IAltaRelevada[]; esquema: IEsquemaAlta; onElegir: (alta: IAltaRelevada) => void })`, `DetalleAltaPanel({ alta: IAltaRelevada; esquema: IEsquemaAlta; onCerrar: () => void })`, ruta `/analitica/altas`.

- [ ] **Step 1: Tests**

`AnaliticaTabs.test.tsx`, agregar:

```tsx
it('apunta la pestaña Altas a /analitica/altas, después de Ruta', () => {
    render(<MemoryRouter initialEntries={['/analitica']}><AnaliticaTabs /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Altas' })).toHaveAttribute('href', '/analitica/altas')
    const nombres = screen.getAllByRole('link').map(l => l.textContent)
    expect(nombres.indexOf('Altas')).toBe(nombres.indexOf('Ruta') + 1)
})
```

`TablaAltas.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import TablaAltas from './TablaAltas'
import type { IAltaRelevada } from '@/types/analitica'
import type { IEsquemaAlta } from '@/types/planificacion'

const ESQUEMA: IEsquemaAlta = {
    secciones: [{ clave: 'identidad', titulo: 'Identidad' }, { clave: 'ubicacion', titulo: 'Ubicación' }],
    campos: [
        { clave: 'nombre', etiqueta: 'Nombre del comercio', seccion: 'identidad', tipo: 'texto', max: 120, requerido: true },
        { clave: 'localidad', etiqueta: 'Localidad', seccion: 'ubicacion', tipo: 'texto', max: 120 },
    ],
    catalogos: null,
}
const alta: IAltaRelevada = {
    rotacionClienteId: 9, vendedor: { codigo: 'V 2', nombre: 'Gómez' }, estado: 'no_visita', fechaVisita: '2026-09-21',
    detalle: { nombre: 'Piche', localidad: 'Zárate' }, contacto: null, camposCargados: 2, camposTotal: 15,
}

it('una fila por alta con comercio, localidad, vendedor, estado, fecha y completo; tocar elige', () => {
    const onElegir = vi.fn()
    render(<TablaAltas filas={[alta]} esquema={ESQUEMA} onElegir={onElegir} />)
    expect(screen.getByText('Piche')).toBeInTheDocument()
    expect(screen.getByText('Zárate')).toBeInTheDocument()
    expect(screen.getByText('Gómez')).toBeInTheDocument()
    expect(screen.getByText('No visitó')).toBeInTheDocument()
    expect(screen.getByText('2026-09-21')).toBeInTheDocument()
    expect(screen.getByText('2/15')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Piche'))
    expect(onElegir).toHaveBeenCalledWith(alta)
})

it('sin detalle muestra "Cliente nuevo" y —', () => {
    render(<TablaAltas filas={[{ ...alta, detalle: null, fechaVisita: null, camposCargados: 0 }]} esquema={ESQUEMA} onElegir={() => {}} />)
    expect(screen.getByText('Cliente nuevo')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
})
```

`DetalleAltaPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import DetalleAltaPanel from './DetalleAltaPanel'
import type { IAltaRelevada } from '@/types/analitica'
import type { IEsquemaAlta } from '@/types/planificacion'

const ESQUEMA: IEsquemaAlta = {
    secciones: [{ clave: 'identidad', titulo: 'Identidad' }, { clave: 'comercial', titulo: 'Comercial' }],
    campos: [
        { clave: 'nombre', etiqueta: 'Nombre del comercio', seccion: 'identidad', tipo: 'texto', max: 120, requerido: true },
        { clave: 'cuit', etiqueta: 'CUIT', seccion: 'identidad', tipo: 'cuit', max: 13 },
        { clave: 'condicionIva', etiqueta: 'Condición de IVA', seccion: 'comercial', tipo: 'catalogo', catalogo: 'iva' },
    ],
    catalogos: { iva: [{ codigo: 'RI', descripcion: 'Responsable Inscripto', orden: 10, activo: true }] },
}
const alta: IAltaRelevada = {
    rotacionClienteId: 9, vendedor: { codigo: 'V 2', nombre: 'Gómez' }, estado: 'visitada', fechaVisita: '2026-09-21',
    detalle: { nombre: 'Piche', condicionIva: 'RI' }, contacto: { contacto: 'Gustavo', fechaNacimiento: null },
    camposCargados: 2, camposTotal: 3,
}

it('muestra TODAS las secciones y campos del esquema, vacíos con —, catálogo como descripción, y el contacto del cierre', () => {
    render(<DetalleAltaPanel alta={alta} esquema={ESQUEMA} onCerrar={() => {}} />)
    expect(screen.getByText('Identidad')).toBeInTheDocument()
    expect(screen.getByText('Comercial')).toBeInTheDocument()
    expect(screen.getByText('CUIT')).toBeInTheDocument()
    expect(screen.getByText('Responsable Inscripto')).toBeInTheDocument()
    expect(screen.getByText('Gustavo')).toBeInTheDocument()
    // El subtítulo es un solo <p> con varios nodos de texto: regex, no exact match.
    expect(screen.getByText(/Gómez/)).toBeInTheDocument()
    expect(screen.getByText(/2 de 3 datos/)).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

it('cerrar', () => {
    const onCerrar = vi.fn()
    render(<DetalleAltaPanel alta={alta} esquema={ESQUEMA} onCerrar={onCerrar} />)
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onCerrar).toHaveBeenCalled()
})
```

`AnaliticaAltasPage.test.tsx` (copiar el arnés de `AnaliticaActividadPage.test.tsx`: cómo mockea `@/api/analitica`, `@/context/AuthContext`, y el `MemoryRouter` + `QueryClientProvider`; agregar `vi.mock('@/api/planificacion')` con `getEsquemaAlta` resuelto al mismo `ESQUEMA` de los tests de arriba):

```tsx
it('lista las altas del rango y abre el detalle al tocar una fila', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([alta])
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25')
    fireEvent.click(await screen.findByText('Piche'))
    expect(await screen.findByText('Identidad')).toBeInTheDocument()
})

it('Exportar CSV arma el archivo con las filas filtradas', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([alta])
    const descargar = vi.spyOn(csv, 'descargarCsv').mockImplementation(() => {})
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25')
    await screen.findByText('Piche')
    fireEvent.click(screen.getByRole('button', { name: /exportar csv/i }))
    expect(descargar).toHaveBeenCalledWith(expect.stringMatching(/^altas-\d{4}-\d{2}-\d{2}\.csv$/), expect.stringContaining('Piche'))
})

it('sin altas en el rango lo dice', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([])
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25')
    expect(await screen.findByText(/sin clientes nuevos entre/i)).toBeInTheDocument()
})
```

con `import * as csv from '@/lib/csv'`. Si `vi.spyOn` sobre un ESM no funciona en este repo, usar `vi.mock('@/lib/csv', async importOriginal => ({ ...(await importOriginal()), descargarCsv: vi.fn() }))`.

- [ ] **Step 2: Verlos fallar**

Run: `cd $APP && npx vitest run src/components/analitica/AnaliticaTabs.test.tsx src/components/analitica/TablaAltas.test.tsx src/components/analitica/DetalleAltaPanel.test.tsx src/pages/AnaliticaAltasPage.test.tsx`
Expected: FAIL (módulos inexistentes; pestaña ausente).

- [ ] **Step 3: `AnaliticaTabs`** — después del `NavLink` de Ruta:

```tsx
            <NavLink to="/analitica/altas" className={({ isActive }) => tabClase(isActive)}>
                Altas
            </NavLink>
```

- [ ] **Step 4: `TablaAltas.tsx`**

```tsx
import { ETIQUETA_ESTADO_ALTA, valorVisible } from '@/lib/altasCsv'
import type { IAltaRelevada } from '@/types/analitica'
import type { EstadoCicloCliente, IEsquemaAlta } from '@/types/planificacion'

interface TablaAltasProps {
    filas: IAltaRelevada[]
    esquema: IEsquemaAlta
    onElegir: (alta: IAltaRelevada) => void
}

const CLASE_ESTADO: Record<EstadoCicloCliente, string> = {
    pendiente: 'bg-slate-100 text-slate-600',
    en_curso: 'bg-amber-100 text-amber-800',
    visitada: 'bg-emerald-100 text-emerald-700',
    no_visita: 'bg-slate-100 text-slate-600',
}

const o = (v: string | null | undefined) => (v && v !== '' ? v : '—')

/** Las columnas "Comercio" y "Localidad" son las claves `nombre` y `localidad` si el esquema
 *  las trae; si un esquema futuro no tuviera `localidad`, la columna sale con —. */
export default function TablaAltas({ filas, esquema, onElegir }: TablaAltasProps) {
    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-3 py-2 text-left">Comercio</th>
                        <th className="px-3 py-2 text-left">Localidad</th>
                        <th className="px-3 py-2 text-left">Vendedor</th>
                        <th className="px-3 py-2 text-left">Estado</th>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-right">Completo</th>
                    </tr>
                </thead>
                <tbody>
                    {filas.map(a => (
                        <tr key={a.rotacionClienteId} onClick={() => onElegir(a)}
                            className="cursor-pointer border-b border-slate-100 hover:bg-blue-50">
                            <td className="px-3 py-2 font-medium text-slate-900">{valorVisible(esquema, a, 'nombre') ?? 'Cliente nuevo'}</td>
                            <td className="px-3 py-2 text-slate-600">{o(valorVisible(esquema, a, 'localidad'))}</td>
                            <td className="px-3 py-2 text-slate-600">{a.vendedor.nombre || a.vendedor.codigo}</td>
                            <td className="px-3 py-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO[a.estado]}`}>
                                    {ETIQUETA_ESTADO_ALTA[a.estado]}
                                </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600">{o(a.fechaVisita)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{a.camposCargados}/{a.camposTotal}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
```

- [ ] **Step 5: `DetalleAltaPanel.tsx`** (mismo `aside` que `DetalleVisitaPanel`)

```tsx
import { X } from 'lucide-react'
import { camposPorSeccion } from '@/lib/camposAlta'
import { ETIQUETA_ESTADO_ALTA, valorVisible } from '@/lib/altasCsv'
import type { IAltaRelevada } from '@/types/analitica'
import type { IEsquemaAlta } from '@/types/planificacion'

interface DetalleAltaPanelProps {
    alta: IAltaRelevada
    esquema: IEsquemaAlta
    onCerrar: () => void
}

const o = (v: string | null | undefined) => (v && v !== '' ? v : '—')

/**
 * Solo lectura: `pl_rotacion_cliente.detalle` se congela al cerrar la visita y gerencia no
 * edita datos del vendedor. Muestra TODOS los campos del esquema, vacíos incluidos, en las
 * mismas secciones que ve el vendedor — es la misma ficha desde el otro lado.
 */
export default function DetalleAltaPanel({ alta, esquema, onCerrar }: DetalleAltaPanelProps) {
    const titulo = valorVisible(esquema, alta, 'nombre') ?? 'Cliente nuevo'
    return (
        <aside className="fixed inset-y-0 right-0 z-30 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                <div>
                    <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
                    <p className="text-xs text-slate-500">
                        {alta.vendedor.nombre || alta.vendedor.codigo} · {ETIQUETA_ESTADO_ALTA[alta.estado]}
                        {alta.fechaVisita ? ` · ${alta.fechaVisita}` : ''} · {alta.camposCargados} de {alta.camposTotal} datos
                    </p>
                </div>
                <button type="button" onClick={onCerrar} aria-label="Cerrar"
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="space-y-5 px-5 py-4">
                {camposPorSeccion(esquema).map(({ seccion, campos }) => (
                    <section key={seccion.clave}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{seccion.titulo}</h3>
                        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                            {campos.map(c => (
                                <div key={c.clave} className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 px-3 py-2 text-sm">
                                    <dt className="text-slate-500">{c.etiqueta}</dt>
                                    <dd className="whitespace-pre-wrap break-words text-slate-900">{o(valorVisible(esquema, alta, c.clave))}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))}

                <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contacto de la visita</h3>
                    <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                        <div className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 px-3 py-2 text-sm">
                            <dt className="text-slate-500">Con quién habló</dt>
                            <dd className="text-slate-900">{o(alta.contacto?.contacto)}</dd>
                        </div>
                        <div className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 px-3 py-2 text-sm">
                            <dt className="text-slate-500">Cumpleaños</dt>
                            <dd className="text-slate-900">{o(alta.contacto?.fechaNacimiento)}</dd>
                        </div>
                    </dl>
                </section>
            </div>
        </aside>
    )
}
```

- [ ] **Step 6: `AnaliticaAltasPage.tsx`** (mismo esqueleto que `AnaliticaActividadPage`)

```tsx
import { useState } from 'react'
import FiltrosAnalitica from '@/components/analitica/FiltrosAnalitica'
import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import TablaAltas from '@/components/analitica/TablaAltas'
import DetalleAltaPanel from '@/components/analitica/DetalleAltaPanel'
import AccountMenu from '@/components/AccountMenu'
import { Button } from '@/components/ui/button'
import { useAccionesDeCuenta } from '@/hooks/useAccionesDeCuenta'
import { useAuth } from '@/context/AuthContext'
import { useFiltroAnalitica } from '@/hooks/useFiltroAnalitica'
import { useAltasRelevadas, useVendedores } from '@/hooks/useAnalitica'
import { useEsquemaAlta } from '@/hooks/useEsquemaAlta'
import { aCsv, descargarCsv } from '@/lib/csv'
import { filasCsvAltas, nombreArchivoAltas } from '@/lib/altasCsv'
import type { IAltaRelevada } from '@/types/analitica'

/**
 * Relevamiento de los clientes nuevos para administración (spec 2026-09-21): qué cargó cada
 * vendedor en "Datos del comercio", y el CSV para tenerlo al lado del ERP. Los filtros son
 * los mismos de /analitica (rango + vendedores). El CSV se arma en el front desde el mismo
 * payload filtrado, recorriendo el esquema: un campo nuevo en la API aparece solo.
 */
export default function AnaliticaAltasPage() {
    const { user, logout } = useAuth()
    const accionesDeCuenta = useAccionesDeCuenta()
    const { filtro, setRango, toggleVendedor, limpiarVendedores } = useFiltroAnalitica()
    const [elegida, setElegida] = useState<IAltaRelevada | null>(null)

    const { data: roster } = useVendedores()
    const esquema = useEsquemaAlta()
    const { data: altas, isLoading, isError } = useAltasRelevadas(filtro)

    const opciones = (roster ?? []).map(v => ({ codigo: v.codigoParticularVendedor, nombre: v.nombreVendedor }))
    const listo = esquema.data && altas

    function exportar() {
        if (!esquema.data || !altas) return
        descargarCsv(nombreArchivoAltas(new Date()), aCsv(filasCsvAltas(esquema.data, altas)))
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="flex items-center justify-between gap-4 bg-white px-6 pt-4">
                <div className="flex-1"><AnaliticaTabs /></div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} acciones={accionesDeCuenta} />
            </header>

            <FiltrosAnalitica filtro={filtro} vendedoresDisponibles={opciones}
                onRango={setRango} onToggleVendedor={toggleVendedor} onLimpiar={limpiarVendedores} />

            <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600">
                        {altas ? `${altas.length} cliente${altas.length === 1 ? '' : 's'} nuevo${altas.length === 1 ? '' : 's'}` : ''}
                    </p>
                    <Button variant="outline" onClick={exportar} disabled={!listo || altas.length === 0}>
                        Exportar CSV
                    </Button>
                </div>

                {(isLoading || esquema.isPending) && <p className="text-sm text-slate-500">Cargando…</p>}
                {(isError || esquema.isError) && <p className="text-sm text-red-600">No se pudieron cargar los clientes nuevos.</p>}

                {listo && altas.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Sin clientes nuevos entre {filtro.desde} y {filtro.hasta}.
                    </div>
                )}

                {listo && altas.length > 0 && <TablaAltas filas={altas} esquema={esquema.data} onElegir={setElegida} />}

                {elegida && esquema.data && (
                    <DetalleAltaPanel alta={elegida} esquema={esquema.data} onCerrar={() => setElegida(null)} />
                )}
            </main>
        </div>
    )
}
```

(Mismo aviso de `variant="outline"` que en la Task 7.)

- [ ] **Step 7: Ruta** — en `App.tsx`, después de `<Route path="/analitica/ruta" ... />`:

```tsx
                            <Route path="/analitica/altas" element={<AnaliticaAltasPage />} />
```

con `import AnaliticaAltasPage from '@/pages/AnaliticaAltasPage'`.

- [ ] **Step 8: Verlo pasar, compilar, y correr toda la suite**

Run: `cd $APP && npx vitest run && npx tsc -b --noEmit && npm run lint`
Expected: todo verde.

- [ ] **Step 9: Probar en el navegador (si hay API local)** — entrar como gerencia a `/analitica/altas`, ver la tabla, abrir un detalle, exportar el CSV y abrirlo con doble click en Excel: tildes bien, columnas separadas.

- [ ] **Step 10: Commit**

```bash
cd $APP && git add src/components/analitica/TablaAltas.tsx src/components/analitica/TablaAltas.test.tsx src/components/analitica/DetalleAltaPanel.tsx src/components/analitica/DetalleAltaPanel.test.tsx src/pages/AnaliticaAltasPage.tsx src/pages/AnaliticaAltasPage.test.tsx src/components/analitica/AnaliticaTabs.tsx src/components/analitica/AnaliticaTabs.test.tsx src/App.tsx
git commit -m "feat(relevamiento): pestaña /analitica/altas con tabla, detalle y export CSV

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Documentación viva

### Task 13: `CLAUDE.md`, `docs/dominio/`

**Files:**
- Modify: `$APP/CLAUDE.md:195, 312`
- Modify: `$APP/docs/dominio/modelo.md:219-221`
- Modify: `$APP/docs/dominio/tablas.md` (nueva sección después de `pl_motivo`, ~línea 171; y una línea en "El mapa")

- [ ] **Step 1: `CLAUDE.md`**

Línea 195: reemplazar `el menú \`⋯\` de \`VisitaSheet\`` por `el botón "No visité" de la línea de identidad del header de \`VisitaSheet\` (no hay menú \`⋯\`: se probó y se descartó, ver el comentario en ese archivo)`.

Línea 312 (la nota de "Cliente nuevo"): agregar al final del párrafo:

```
  **El relevamiento del comercio ("Datos del comercio", `RelevamientoSheet`) se dibuja desde
  `GET /planificacion/altas/esquema`**: la lista de campos vive en `esquemaAlta.ts` de
  api-vendedores y en ningún lugar del front — agregar un dato es una fila ahí (y, si es
  catálogo, un `INSERT` en `pl_catalogo_alta`), sin desplegar la app. `IDetalleAlta` es
  `{ nombre; [clave]: string | null }` a propósito. Los tipos de campo son un set cerrado
  (`texto | textoLargo | cuit | email | catalogo`); un tipo nuevo se agrega en el validador de
  la API y en `CampoInput` del sheet, nada más. Se abre desde la card pendiente ("Datos") y
  desde la visita abierta (botón "Datos" al lado de "No visité"); `contactoNombre` precarga
  "Con quién hablaste" sin pisar lo tipeado. Gerencia lo ve y lo exporta en `/analitica/altas`.
  Spec: `2026-09-21-relevamiento-alta-design.md` (leer su adenda).
```

- [ ] **Step 2: `docs/dominio/modelo.md`**, sección "La visita de alta": agregar un párrafo después del existente:

```
**El relevamiento** (spec `2026-09-21-relevamiento-alta-design.md`): `detalle` ya no son tres
claves sino las que define el **esquema** (`esquemaAlta.ts` en api-vendedores, servido por
`GET /altas/esquema`): identidad, ubicación, contacto, comercial, cuenta corriente y notas — lo
que administración necesita para el alta en el ERP. Todo opcional salvo el nombre; el gate de
cierre no cambia. Son datos del **comercio** (viven en el plan y sobreviven al reintento), a
diferencia del contacto del cierre, que es del **hecho** (`pl_resolucion.detalle`). IVA y
condición de pago son catálogos cerrados en `pl_catalogo_alta`. El front no enumera campos:
recorre el esquema, así que el relevamiento se puede cambiar por empresa sin tocar la app.
```

- [ ] **Step 3: `docs/dominio/tablas.md`**: sumar `pl_catalogo_alta` a la lista de "El mapa" y una sección nueva después de `pl_motivo`:

```
## `pl_catalogo_alta` — listas cerradas del cliente nuevo

Condición de IVA (`tipo='iva'`) y condición de pago (`tipo='pago'`) del relevamiento del
comercio. Son **datos y no código** por la misma razón que `pl_motivo`: texto libre se ensucia
(`RI` / `R.I.` / `resp. inscripto`), el ERP los consume directo, y administración los corrige
con un `UPDATE`, sin deploy. Qué campo usa qué `tipo` lo dice el esquema (`esquemaAlta.ts`,
campo `tipo: 'catalogo'`); agregar un catálogo nuevo es sembrar otro `tipo` y apuntar un campo.

- `UNIQUE (tipo, codigo)`: el `codigo` es lo que queda en el JSON de `pl_rotacion_cliente.detalle`.
- **Baja lógica** (`activo = 0`), nunca `DELETE`: hay JSONs que referencian el código, y el front
  lo sigue mostrando por descripción aunque esté inactivo.
- Seed idempotente y seguro para prod: `docs/db-notes/planificacion-catalogo-alta.sql`.
```

- [ ] **Step 4: Commit**

```bash
cd $APP && git add CLAUDE.md docs/dominio/modelo.md docs/dominio/tablas.md docs/superpowers/specs/2026-09-21-relevamiento-alta-design.md docs/superpowers/plans/2026-09-21-relevamiento-alta.md
git commit -m "docs(relevamiento): esquema único servido por la API, pl_catalogo_alta y RelevamientoSheet en la doc viva

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Cierre

- Backend: `cd $API && npm test && npx tsc --noEmit`. Front: `cd $APP && npx vitest run && npm run build && npm run lint`.
- Orden de deploy: **API primero** (el front nuevo pide `/altas/esquema`; un front viejo contra la API nueva sigue andando: `POST/PUT /altas` acepta lo básico igual). Antes de desplegar la API, correr `planificacion-catalogo-alta.sql` en la base de prod (es idempotente y seguro).
- Un PR por repo, con `🤖 Generated with [Claude Code](https://claude.com/claude-code)` al final de la descripción. En el PR de app-planificacion, linkear el spec y la adenda.
