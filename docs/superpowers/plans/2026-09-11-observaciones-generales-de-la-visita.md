# Observaciones generales de la visita — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el vendedor pueda dejar una observación de texto libre, una por visita, antes de cerrarla, y que ese texto se persista en `pl_resolucion` y viaje a Cromo dentro del seguimiento que ya se genera al cerrar.

**Architecture:** Una columna nueva en `pl_resolucion` (el hecho a nivel visita), escrita en el mismo `PUT /planificacion/visitas/:id/cerrar` que ya cierra la visita — único punto de escritura, porque `pl_resolucion` es inmutable. El texto se agrega como párrafo final de la narrativa de Cromo, **después** del guard `SIN_CONTENIDO`, que sigue mirando solo los rubros. En el front el campo es un `textarea` de 2 renglones en el pie fijo del sheet, que aparece solo al cumplir el mínimo de rubros y se respalda en localStorage con su propia clave.

**Tech Stack:** `api-vendedores` (Express + Sequelize + TypeScript, tests con **jest**) · `app-planificacion` (Vite + React 19 + TypeScript, tests con **vitest**)

**Spec:** [`docs/superpowers/specs/2026-09-11-observaciones-generales-de-la-visita-design.md`](../specs/2026-09-11-observaciones-generales-de-la-visita-design.md)

## Global Constraints

- **Tope de largo: 500 caracteres.** `VARCHAR(500)` en la base, `maxLength={500}` en el front, `400 OBSERVACIONES_MUY_LARGA` en el backend.
- **Vacío o solo espacios se guarda `null`, nunca `''`.** Un string vacío haría que "no dejó observación" y "dejó una vacía" se vean distinto en una query sin significar nada distinto.
- **El `PUT .../cerrar` es el ÚNICO punto de escritura.** No se agrega `PATCH`, ni ahora ni después: `pl_resolucion` es inmutable (`UNIQUE (rotacion_cliente_id)`).
- **Primero se persiste, después se notifica a Cromo.** Orden fijado en CLAUDE.md. Un Cromo caído es un mensaje demorado, no pérdida de datos.
- **El guard `SIN_CONTENIDO` no se modifica.** Sigue mirando solo la narrativa de rubros: una visita con cero rubros resueltos y solo observación **no** notifica (se persiste igual). Es una decisión tomada.
- **La observación no es un motivo.** Es narrativa para humanos. Si aparece la tentación de resolver un rubro escribiendo acá, falta un motivo en `pl_motivo`.
- **Dos repos, en orden.** Tareas 1-5 en `api-vendedores`; 6-9 en `app-planificacion`. Las 6-9 no se pueden probar de punta a punta hasta que las 1-5 estén deployadas.
- **Rutas de los repos:**
  - `api-vendedores`: `C:/Users/matia/Documents/distrisuper/business-workflow/versus/api-vendedores`
  - `app-planificacion`: `C:/Users/matia/Documents/distrisuper/app-planificacion`

## File Structure

### `api-vendedores`

| archivo | responsabilidad |
|---|---|
| `docs/db-notes/planificacion-ciclo-tables.sql` | DDL consolidado + el `ALTER` que ops corre a mano |
| `src/models/planificacion/Resolucion.ts` | mapeo `observaciones` ↔ `observaciones` |
| `src/types/planificacion.ts` | `IResolucion.observaciones`, `ICerrarVisitaDTO.observaciones`, `IAgendaClient.observaciones` |
| `src/repositories/ResolucionRepository.ts` | `cerrarVisita` escribe la columna |
| `src/controllers/planificacionController.ts` | `normalizarObservaciones` (validación) |
| `src/services/planificacion/VisitasService.ts` | pasa el valor fresco a Cromo (la instancia que tiene es vieja) |
| `src/services/crm/seguimientoTexto.ts` | `conObservacion(narrativa, observaciones)` |
| `src/services/crm/CrmEventoVisitaService.ts` | aplica `conObservacion` **después** del guard |
| `src/services/planificacion/AgendaService.ts` | devuelve `observaciones` en la card |

### `app-planificacion`

| archivo | responsabilidad |
|---|---|
| `src/types/planificacion.ts` | `ICerrarVisitaDTO.observaciones`, `IAgendaClient.observaciones` |
| `src/hooks/useVisitas.ts` | `useCerrarVisita` deja pasar `observaciones` |
| `src/lib/resolucionDraft.ts` | borrador de observaciones, clave propia |
| `src/components/VisitaSheet.tsx` | el `textarea` en el pie fijo + modo lectura |
| `src/components/VisitaFlow.tsx` | recibe el texto en `onCerrarVisita` y lo manda |
| `index.html` | `interactive-widget=resizes-content` |

---

# Parte A — `api-vendedores`

Todos los comandos de esta parte se corren desde
`C:/Users/matia/Documents/distrisuper/business-workflow/versus/api-vendedores`.

---

### Task 1: La columna existe y el modelo la lee

**Files:**
- Modify: `docs/db-notes/planificacion-ciclo-tables.sql`
- Modify: `src/models/planificacion/Resolucion.ts`
- Modify: `src/types/planificacion.ts` (`IResolucion`, ~línea 197)
- Test: `src/models/planificacion/Resolucion.spec.ts` (crear)

**Interfaces:**
- Consumes: nada (primera tarea)
- Produces: `IResolucion.observaciones: string | null` — lo leen las tareas 2, 4 y 5. El modelo `Resolucion` expone `observaciones?: string | null`.

- [ ] **Step 1: Write the failing test**

Crear `src/models/planificacion/Resolucion.spec.ts`:

```typescript
import Resolucion from './Resolucion'

// El mapeo camelCase -> snake_case es la clase de bug más silenciosa de Sequelize: con el
// `field` mal escrito el modelo compila, los tests de repositorio que mockean el modelo
// pasan, y recién en runtime MySQL responde "Unknown column". Por eso se afirma el mapeo.
describe('modelo Resolucion', () => {
    it('mapea observaciones a la columna observaciones', () => {
        const atributos = Resolucion.getAttributes()
        expect(atributos.observaciones).toBeDefined()
        expect(atributos.observaciones.field).toBe('observaciones')
    })

    it('observaciones es nullable y topea en 500', () => {
        const atributos = Resolucion.getAttributes()
        expect(atributos.observaciones.allowNull).toBe(true)
        // El tope de la columna tiene que coincidir con el del validador y con el
        // maxLength del front: si la base fuera más corta, un texto que la UI acepta
        // explotaría al insertarse.
        expect(String(atributos.observaciones.type)).toBe('VARCHAR(500)')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/models/planificacion/Resolucion.spec.ts`
Expected: FAIL — `expect(received).toBeDefined()` recibe `undefined`, porque el atributo todavía no existe.

- [ ] **Step 3: Agregar el campo al modelo**

En `src/models/planificacion/Resolucion.ts`, agregar a `IResolucionAttributes` (después de `coordClienteAjustada`):

```typescript
    observaciones?: string | null
```

A la clase `Resolucion` (después de `public coordClienteAjustada?: boolean`):

```typescript
    public observaciones?: string | null
```

Y a `Resolucion.init`, después del bloque `coordClienteAjustada`:

```typescript
        // Texto libre del vendedor, uno por visita. Se escribe SOLO en el cierre
        // (PUT /visitas/:id/cerrar) porque pl_resolucion es inmutable — ver
        // docs/superpowers/specs/2026-09-11-observaciones-generales-de-la-visita-design.md.
        // No reemplaza al motivo estructurado: sobre texto libre no se puede hacer GROUP BY.
        observaciones: {
            type: DataTypes.STRING(500),
            allowNull: true,
            field: 'observaciones',
        },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/models/planificacion/Resolucion.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Agregar el campo a `IResolucion`**

En `src/types/planificacion.ts`, dentro de `interface IResolucion`, después de `coordClienteAjustada: boolean`:

```typescript
    /** Texto libre del vendedor sobre la visita. null = no dejó ninguna. */
    observaciones: string | null
```

- [ ] **Step 6: Agregar el DDL**

En `docs/db-notes/planificacion-ciclo-tables.sql`, dentro del `CREATE TABLE pl_resolucion`, después de `coord_cliente`:

```sql
  observaciones    VARCHAR(500) NULL,     -- texto libre del vendedor, escrito solo al cerrar
```

Y al final del archivo, en la sección de ALTERs para ops (si no existe, crearla):

```sql
-- ---------------------------------------------------------------------------
-- ALTERs pendientes de aplicar a mano en producción (en este repo un ALTER es
-- una intervención manual de ops, no una migración automática).
-- ---------------------------------------------------------------------------

-- 2026-09-11 · observaciones generales de la visita
ALTER TABLE pl_resolucion ADD COLUMN observaciones VARCHAR(500) NULL;
```

- [ ] **Step 7: Verificar que compila y que no rompió nada**

Run: `npm run build && npx jest`
Expected: build sin errores, y toda la suite en verde.

- [ ] **Step 8: Commit**

```bash
git add docs/db-notes/planificacion-ciclo-tables.sql src/models/planificacion/Resolucion.ts src/types/planificacion.ts src/models/planificacion/Resolucion.spec.ts
git commit -m "feat(planificacion): columna observaciones en pl_resolucion

Texto libre del vendedor, uno por visita. Solo el modelo y el tipo: todavia
nadie la escribe ni la lee.

El ALTER queda anotado en db-notes para que ops lo corra a mano -- en este
repo un ALTER en produccion no es una migracion automatica."
```

---

### Task 2: El cierre persiste la observación

**Files:**
- Modify: `src/types/planificacion.ts` (`ICerrarVisitaDTO`, ~línea 370)
- Modify: `src/repositories/ResolucionRepository.ts:154-160`
- Modify: `src/services/planificacion/VisitasService.ts:158`
- Test: `src/repositories/ResolucionRepository.spec.ts`

**Interfaces:**
- Consumes: `Resolucion.observaciones` (Task 1)
- Produces: `ResolucionRepository.cerrarVisita(id: number, coordFinal: string | null, observaciones: string | null): Promise<void>` y `ICerrarVisitaDTO.observaciones?: string | null` — los usan las tareas 3 y 4.

- [ ] **Step 1: Write the failing test**

En `src/repositories/ResolucionRepository.spec.ts`, dentro del `describe` de `cerrarVisita` (o al final del archivo si no hay uno):

```typescript
describe('cerrarVisita — observaciones', () => {
    beforeEach(() => {
        mockedUpdate.mockReset()
        mockedUpdate.mockResolvedValue([1] as never)
    })

    it('escribe la observación junto con coordFinal y fechaFin', async () => {
        await ResolucionRepository.cerrarVisita(42, '-34.7,-58.4', 'El dueño pidió lista')

        expect(mockedUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                coordFinal: '-34.7,-58.4',
                observaciones: 'El dueño pidió lista',
            }),
            { where: { id: 42 } },
        )
    })

    it('sin observación escribe null, no undefined', async () => {
        // undefined haría que Sequelize omita la columna del UPDATE. Acá da lo mismo
        // (la fila arranca en null), pero deja la intención explícita: "no dejó
        // observación" es un null escrito, no una columna que nadie tocó.
        await ResolucionRepository.cerrarVisita(42, '-34.7,-58.4', null)

        const [valores] = mockedUpdate.mock.calls[0]
        expect((valores as { observaciones?: unknown }).observaciones).toBeNull()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/repositories/ResolucionRepository.spec.ts -t observaciones`
Expected: FAIL — `cerrarVisita` recibe 3 argumentos pero su firma tiene 2, y `observaciones` no aparece en el objeto del update.

- [ ] **Step 3: Cambiar la firma del repositorio**

En `src/repositories/ResolucionRepository.ts`, reemplazar `cerrarVisita`:

```typescript
    /**
     * Cierra la visita. `observaciones` es el texto libre del vendedor y este es su
     * ÚNICO punto de escritura: pl_resolucion es inmutable, así que no hay forma de
     * agregarla ni editarla después del cierre (ver el spec de 2026-09-11).
     */
    static async cerrarVisita(
        id: number,
        coordFinal: string | null,
        observaciones: string | null,
    ): Promise<void> {
        try {
            await Resolucion.update(
                { coordFinal, fechaFin: new Date(), observaciones },
                { where: { id } },
            )
        } catch (err) {
            throw new CustomError(500, `Error cerrando visita: ${err}`)
        }
    }
```

- [ ] **Step 4: Agregar el campo al DTO**

En `src/types/planificacion.ts`, en `ICerrarVisitaDTO`:

```typescript
export interface ICerrarVisitaDTO {
    visitaId: number
    coordFinal: string | null
    /** Texto libre del vendedor, ya normalizado por el controller (trim, `''` → null). */
    observaciones?: string | null
}
```

- [ ] **Step 5: Pasarlo desde el service**

En `src/services/planificacion/VisitasService.ts`, línea 158, reemplazar:

```typescript
        await ResolucionRepository.cerrarVisita(dto.visitaId, dto.coordFinal)
```

por:

```typescript
        await ResolucionRepository.cerrarVisita(
            dto.visitaId,
            dto.coordFinal,
            dto.observaciones ?? null,
        )
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/repositories/ResolucionRepository.spec.ts src/services/planificacion/VisitasService.spec.ts`
Expected: PASS. Si algún test viejo de `VisitasService` afirmaba `cerrarVisita` con 2 argumentos exactos, actualizarlo a 3 (el tercero `null`).

- [ ] **Step 7: Commit**

```bash
git add src/types/planificacion.ts src/repositories/ResolucionRepository.ts src/repositories/ResolucionRepository.spec.ts src/services/planificacion/VisitasService.ts src/services/planificacion/VisitasService.spec.ts
git commit -m "feat(planificacion): el cierre de visita persiste observaciones

cerrarVisita pasa a recibir el texto y lo escribe en el UPDATE. Sin
observacion escribe null explicito y no undefined: 'no dejo observacion' es
un null escrito, no una columna que nadie toco."
```

---

### Task 3: Validación en el controller

**Files:**
- Modify: `src/controllers/planificacionController.ts` (`cerrarVisita`, ~línea 484)
- Test: `src/controllers/planificacionController.spec.ts`

**Interfaces:**
- Consumes: `ICerrarVisitaDTO.observaciones` (Task 2)
- Produces: `normalizarObservaciones(raw: unknown): { ok: true; valor: string | null } | { ok: false }` — exportada del controller, solo la usa esta tarea. Error `400` con `code: 'OBSERVACIONES_MUY_LARGA'`.

- [ ] **Step 1: Write the failing test**

En `src/controllers/planificacionController.spec.ts`, al final:

```typescript
import { normalizarObservaciones } from './planificacionController'

describe('normalizarObservaciones', () => {
    it('recorta los espacios de los extremos', () => {
        expect(normalizarObservaciones('  pidió lista  ')).toEqual({
            ok: true,
            valor: 'pidió lista',
        })
    })

    it('ausente, vacío o solo espacios es null', () => {
        // Los cuatro tienen que dar el MISMO resultado: en una query, "no dejó
        // observación" y "dejó una vacía" no significan nada distinto.
        for (const raw of [undefined, null, '', '   \n\t  ']) {
            expect(normalizarObservaciones(raw)).toEqual({ ok: true, valor: null })
        }
    })

    it('acepta exactamente 500 caracteres', () => {
        const justo = 'a'.repeat(500)
        expect(normalizarObservaciones(justo)).toEqual({ ok: true, valor: justo })
    })

    it('rechaza 501 caracteres', () => {
        expect(normalizarObservaciones('a'.repeat(501))).toEqual({ ok: false })
    })

    it('mide DESPUÉS del trim: 500 con espacios alrededor pasa', () => {
        // Si midiera antes, un textarea que corta en 500 podría mandar 502 con el
        // salto de línea final y comerse un 400 sin que el vendedor entienda por qué.
        const conEspacios = `  ${'a'.repeat(500)}  `
        expect(normalizarObservaciones(conEspacios)).toEqual({
            ok: true,
            valor: 'a'.repeat(500),
        })
    })

    it('lo que no es string ni nulo se rechaza', () => {
        // Un cliente que manda un número o un objeto no debe terminar con
        // String(objeto) guardado en la base.
        for (const raw of [42, {}, [], true]) {
            expect(normalizarObservaciones(raw)).toEqual({ ok: false })
        }
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/controllers/planificacionController.spec.ts -t normalizarObservaciones`
Expected: FAIL — `normalizarObservaciones is not a function` / error de import.

- [ ] **Step 3: Escribir el validador**

En `src/controllers/planificacionController.ts`, junto a `coordValida` (arriba de la clase del controller):

```typescript
/** Tope de la observación de visita. Tiene que coincidir con el VARCHAR(500) de
 *  pl_resolucion.observaciones y con el maxLength del textarea en app-planificacion. */
export const OBSERVACIONES_MAX = 500

/**
 * Normaliza la observación libre del cierre de visita.
 *
 * `{ ok: true, valor }` con el texto recortado, o `null` si no hay nada que guardar —
 * ausente, nulo, vacío y "solo espacios" colapsan todos al mismo `null` a propósito.
 *
 * `{ ok: false }` si no es un string, o si pasa el tope DESPUÉS del trim. Se mide
 * después y no antes para que un textarea que corta en 500 no se coma un 400 por un
 * salto de línea final.
 */
export function normalizarObservaciones(
    raw: unknown,
): { ok: true; valor: string | null } | { ok: false } {
    if (raw === undefined || raw === null) return { ok: true, valor: null }
    if (typeof raw !== 'string') return { ok: false }

    const limpio = raw.trim()
    if (limpio === '') return { ok: true, valor: null }
    if (limpio.length > OBSERVACIONES_MAX) return { ok: false }

    return { ok: true, valor: limpio }
}
```

- [ ] **Step 4: Usarlo en el handler**

En `static async cerrarVisita`, después del bloque que valida `coordFinal` y antes de `VisitasService.cerrar`:

```typescript
            const observaciones = normalizarObservaciones(
                (req.body as { observaciones?: unknown })?.observaciones,
            )
            if (!observaciones.ok) {
                res.status(400).json({
                    ok: 0,
                    error: `La observación no puede superar los ${OBSERVACIONES_MAX} caracteres.`,
                    code: 'OBSERVACIONES_MUY_LARGA',
                })
                return
            }
```

Y cambiar la llamada al service:

```typescript
            const result = await VisitasService.cerrar(req.user!, {
                visitaId,
                coordFinal,
                observaciones: observaciones.valor,
            })
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/controllers/planificacionController.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/controllers/planificacionController.ts src/controllers/planificacionController.spec.ts
git commit -m "feat(planificacion): validar la observacion del cierre de visita

trim, y ausente/vacio/solo-espacios colapsan al mismo null. Mas de 500
caracteres es 400 OBSERVACIONES_MUY_LARGA.

El largo se mide DESPUES del trim para que un textarea que corta en 500 no
se coma un 400 por un salto de linea final."
```

---

### Task 4: La observación viaja a Cromo

Esta es la tarea con el bug silencioso. Leer los dos comentarios de los tests antes de implementar.

**Files:**
- Modify: `src/services/crm/seguimientoTexto.ts`
- Modify: `src/services/crm/CrmEventoVisitaService.ts` (~línea 70-90)
- Modify: `src/services/planificacion/VisitasService.ts:171`
- Test: `src/services/crm/seguimientoTexto.spec.ts`, `src/services/crm/CrmEventoVisitaService.spec.ts`, `src/services/planificacion/VisitasService.spec.ts`

**Interfaces:**
- Consumes: `IResolucion.observaciones` (Task 1), `ICerrarVisitaDTO.observaciones` (Task 2)
- Produces: `conObservacion(narrativa: string, observaciones: string | null): string` en `seguimientoTexto.ts`

- [ ] **Step 1: Write the failing test — el texto**

En `src/services/crm/seguimientoTexto.spec.ts`, al final:

```typescript
import { conObservacion } from './seguimientoTexto'

describe('conObservacion', () => {
    it('agrega la observación como párrafo final', () => {
        expect(conObservacion('Amortiguadores: Precio', 'El dueño pidió lista')).toBe(
            'Amortiguadores: Precio\n\nObservación del vendedor: El dueño pidió lista',
        )
    })

    it('sin observación devuelve la narrativa intacta', () => {
        expect(conObservacion('Amortiguadores: Precio', null)).toBe('Amortiguadores: Precio')
    })

    it('con narrativa vacía devuelve solo la observación, sin separador colgando', () => {
        // No debería pasar en la práctica (el guard SIN_CONTENIDO corta antes), pero
        // devolver "\n\nObservación..." con dos saltos al principio sería basura si
        // algún día el guard cambia.
        expect(conObservacion('', 'Estaba cerrado')).toBe(
            'Observación del vendedor: Estaba cerrado',
        )
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/crm/seguimientoTexto.spec.ts -t conObservacion`
Expected: FAIL — `conObservacion is not a function`.

- [ ] **Step 3: Implementar `conObservacion`**

En `src/services/crm/seguimientoTexto.ts`, al final:

```typescript
/**
 * Le pega la observación libre del vendedor al final de una narrativa.
 *
 * Va prefijada y en su propio párrafo para que, del otro lado, quien lee el seguimiento
 * en Cromo distinga qué escribió una persona de qué armó el sistema a partir de los
 * motivos — son dos cosas con confiabilidad distinta.
 *
 * NO se usa para decidir si hay contenido: el guard de "nunca mandar una visita vacía"
 * vive en CrmEventoVisitaService y mira SOLO la narrativa de rubros. Ver el spec.
 */
export function conObservacion(narrativa: string, observaciones: string | null): string {
    if (!observaciones) return narrativa
    const prefijada = `Observación del vendedor: ${observaciones}`
    return narrativa === '' ? prefijada : `${narrativa}\n\n${prefijada}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/crm/seguimientoTexto.spec.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test — el orden respecto del guard**

En `src/services/crm/CrmEventoVisitaService.spec.ts`, al final del
`describe('CrmEventoVisitaService.notificar — visita', ...)`. Los helpers
`resolucionVisita()` / `fila()` y los mocks `mockedOfrecimientos` / `mockedHttp` ya existen
en ese archivo; el `beforeEach` ya deja un ofrecimiento resuelto con el motivo
"Saqué pedido", así que la narrativa base es `"Amortiguadores: Saqué pedido"`:

```typescript
    it('manda la observación pegada a la narrativa de rubros', async () => {
        const result = await CrmEventoVisitaService.notificar({
            vendedorCode: 'V 2',
            resolucion: resolucionVisita({ observaciones: 'El dueño pidió lista' }),
            fila: fila(),
        })

        expect(result.enviado).toBe(true)
        // requestAsService recibe (metodo, url, body) o (config) según CromoHttpClient:
        // tomar la descripción del mismo lugar de donde la toman los tests que ya están
        // en este archivo, en vez de asumir la forma del payload.
        const descripcion = JSON.stringify(mockedHttp.requestAsService.mock.calls[0])
        expect(descripcion).toContain('Amortiguadores: Saqué pedido')
        expect(descripcion).toContain('Observación del vendedor: El dueño pidió lista')
    })

    it('una visita SIN rubros resueltos pero CON observación no se manda', async () => {
        // El guard SIN_CONTENIDO mira solo la narrativa de rubros, a propósito: la
        // observación se agrega DESPUÉS del guard. Si se agregara antes, este caso
        // notificaría — que es la variante que se descartó en el diseño.
        mockedOfrecimientos.mockResolvedValue([])

        const result = await CrmEventoVisitaService.notificar({
            vendedorCode: 'V 2',
            resolucion: resolucionVisita({ observaciones: 'Estaba cerrado' }),
            fila: fila(),
        })

        expect(result.enviado).toBe(false)
        expect(result.motivo).toBe('SIN_CONTENIDO')
        expect(mockedHttp.requestAsService).not.toHaveBeenCalled()
        expect(mockedMarcarPendiente).toHaveBeenCalledWith(5, 'SIN_CONTENIDO', '')
    })
```

**Ojo:** `resolucionVisita()` va a fallar de tipos hasta que la Task 1 haya agregado
`observaciones` a `IResolucion` — si esa tarea no está hecha, hacerla primero. Y hay que
agregar `observaciones: null` al objeto base del helper, junto a
`seguimientoMotivoPendiente: null`.

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest src/services/crm/CrmEventoVisitaService.spec.ts`
Expected: el primer test FALLA (la descripción no contiene la observación); el segundo ya pasa (el guard existe) — y tiene que seguir pasando al final.

- [ ] **Step 7: Aplicar la observación después del guard**

En `src/services/crm/CrmEventoVisitaService.ts`, en la rama `if (resolucion.tipo === 'visita')`, **después** del bloque del guard `SIN_CONTENIDO` y antes de cerrar el `if`, agregar:

```typescript
                // DESPUÉS del guard, nunca antes: el guard decide si hay trabajo que
                // contar, y eso lo dicen los rubros. Una observación sola no convierte
                // una visita sin rubros resueltos en algo que valga la pena mandar
                // (decisión del spec de 2026-09-11).
                narrativa = conObservacion(narrativa, resolucion.observaciones ?? null)
```

Y agregar `conObservacion` al import de `./seguimientoTexto`:

```typescript
import {
    buildSeguimientoDesdeRubros,
    buildSeguimientoNoVisita,
    buildTagsDesdeRubros,
    conObservacion,
} from './seguimientoTexto'
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest src/services/crm/CrmEventoVisitaService.spec.ts`
Expected: PASS — los dos tests nuevos y todos los que ya estaban.

- [ ] **Step 9: Write the failing test — la instancia vieja**

Este es el bug que el spec marcó. `VisitasService.cerrar` lee `resolucion` **antes** de
`cerrarVisita(...)`, así que esa instancia tiene `observaciones` sin actualizar y Cromo
recibiría `undefined`.

En `src/services/planificacion/VisitasService.spec.ts`, en el `describe` de `cerrar`:

```typescript
    it('le pasa a Cromo la observación del DTO, no la de la instancia vieja', async () => {
        // resolveVisitaPropia lee la resolución ANTES del UPDATE, así que su
        // `observaciones` es el valor previo (null en una visita que recién se cierra).
        // Si notificar() leyera de esa instancia, la observación no saldría NUNCA a
        // Cromo, con todo lo demás funcionando y sin ningún error visible.
        await VisitasService.cerrar(user, {
            visitaId: 42,
            coordFinal: '-34.7,-58.4',
            observaciones: 'El dueño pidió lista',
        })

        expect(mockedNotificar).toHaveBeenCalledWith(
            expect.objectContaining({
                resolucion: expect.objectContaining({
                    observaciones: 'El dueño pidió lista',
                }),
            }),
        )
    })
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx jest src/services/planificacion/VisitasService.spec.ts -t "instancia vieja"`
Expected: FAIL — `observaciones` llega `null`/`undefined` en el objeto que recibe `notificar`.

- [ ] **Step 11: Pasar el valor fresco**

En `src/services/planificacion/VisitasService.ts`, línea ~171, reemplazar:

```typescript
        void CrmEventoVisitaService.notificar({ vendedorCode: vendedor, resolucion, fila }).catch(err =>
```

por:

```typescript
        // `resolucion` se leyó ANTES del UPDATE de cerrarVisita, así que su
        // `observaciones` es el valor previo: hay que sobrescribirlo con el del DTO o la
        // observación no llega nunca a Cromo. Se resuelve acá y no cambiando la firma de
        // `notificar` porque los otros TRES call sites (no_visita, último ofrecimiento
        // resuelto, reintento manual) leen la resolución fresca de la base y ahí el campo
        // ya está bien — sumarles un parámetro los obligaría a cargar algo que ya tienen.
        void CrmEventoVisitaService.notificar({
            vendedorCode: vendedor,
            resolucion: { ...resolucion, observaciones: dto.observaciones ?? null },
            fila,
        }).catch(err =>
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `npx jest`
Expected: toda la suite en verde.

- [ ] **Step 13: Commit**

```bash
git add src/services/crm/seguimientoTexto.ts src/services/crm/seguimientoTexto.spec.ts src/services/crm/CrmEventoVisitaService.ts src/services/crm/CrmEventoVisitaService.spec.ts src/services/planificacion/VisitasService.ts src/services/planificacion/VisitasService.spec.ts
git commit -m "feat(crm): la observacion del vendedor viaja en el seguimiento

Se pega al final de la narrativa de rubros, prefijada y en su propio parrafo
para que del otro lado se distinga lo que escribio una persona de lo que
armo el sistema con los motivos.

Se aplica DESPUES del guard SIN_CONTENIDO, nunca antes: el guard decide si
hay trabajo que contar y eso lo dicen los rubros. Una observacion sola no
convierte una visita sin rubros resueltos en algo que valga mandar.

Y se le pasa a notificar() el valor del DTO, no el de la instancia:
resolveVisitaPropia lee la resolucion ANTES del UPDATE, asi que leyendo de
ahi la observacion no llegaba nunca a Cromo -- con todo lo demas
funcionando y sin ningun error visible. Se arregla en el call site y no en
la firma de notificar porque los otros tres leen la resolucion fresca."
```

---

### Task 5: La agenda devuelve la observación

Necesaria para que el front pueda mostrarla en modo lectura sobre una visita ya cerrada.

**Files:**
- Modify: `src/types/planificacion.ts` (`IAgendaClient`, ~línea 212)
- Modify: `src/services/planificacion/AgendaService.ts:184-195`
- Test: `src/services/planificacion/AgendaService.spec.ts`

**Interfaces:**
- Consumes: `IResolucion.observaciones` (Task 1)
- Produces: `IAgendaClient.observaciones: string | null` — lo consume la Task 9 del front.

- [ ] **Step 1: Write the failing test**

En `src/services/planificacion/AgendaService.spec.ts`, junto al test "trae el contador de
ofrecimientos pendientes de cada visita". Los helpers `fila()`, `card()` y `resolucion()` y
los mocks `mockedFindByRotacionYSemana` / `mockedGetCards` / `mockedResolucionesPorFila` ya
existen en ese archivo, y el método es `AgendaService.getSemana(user)`:

```typescript
    it('devuelve la observación de la visita en la card', async () => {
        // Sale del mismo LEFT JOIN con la resolución que ya alimenta estado/visitaId:
        // no hay request ni query extra.
        mockedFindByRotacionYSemana.mockResolvedValue([fila({ id: 1, dia: 1 })])
        mockedGetCards.mockResolvedValue(new Map([['6836', card('6836')]]))
        mockedResolucionesPorFila.mockResolvedValue(
            new Map([
                [1, resolucion({ id: 5, rotacionClienteId: 1, observaciones: 'Pidió lista' })],
            ]),
        )

        const result = await AgendaService.getSemana(user)

        expect(result.LUN[0].observaciones).toBe('Pidió lista')
    })

    it('sin resolución la observación es null, no undefined', async () => {
        // El front la lee como `cliente.observaciones` para decidir si dibuja el bloque de
        // lectura: hoy null y undefined se comportarían igual, pero null explícito hace que
        // el contrato diga "no hay" en vez de "puede que no haya venido".
        mockedFindByRotacionYSemana.mockResolvedValue([fila({ id: 1, dia: 1 })])
        mockedGetCards.mockResolvedValue(new Map([['6836', card('6836')]]))
        mockedResolucionesPorFila.mockResolvedValue(new Map())

        const result = await AgendaService.getSemana(user)

        expect(result.LUN[0].observaciones).toBeNull()
    })
```

Además hay que agregar `observaciones: null` al objeto base del helper `resolucion()` de
ese archivo, o TypeScript va a rechazar el `IResolucion` incompleto.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/planificacion/AgendaService.spec.ts -t observaci`
Expected: FAIL — `observaciones` es `undefined` en la card.

- [ ] **Step 3: Agregar el campo al tipo**

En `src/types/planificacion.ts`, en `IAgendaClient`, después de `ofrecimientosPendientes`:

```typescript
    /** Texto libre que el vendedor dejó al cerrar. null si no dejó ninguna, o si la
     *  fila todavía no tiene resolución. Solo de lectura: pl_resolucion es inmutable. */
    observaciones: string | null
```

- [ ] **Step 4: Devolverlo desde el service**

En `src/services/planificacion/AgendaService.ts`, en el `result.push({...})`, después de `ofrecimientosPendientes: pendientes,`:

```typescript
                observaciones: resolucion?.observaciones ?? null,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/services/planificacion/AgendaService.spec.ts && npm run build`
Expected: PASS y build limpio. Si el build se queja de `IAgendaClient` incompleto en otros armados de cards, agregar `observaciones: null` ahí.

- [ ] **Step 6: Commit**

```bash
git add src/types/planificacion.ts src/services/planificacion/AgendaService.ts src/services/planificacion/AgendaService.spec.ts
git commit -m "feat(planificacion): la agenda devuelve la observacion de la visita

Sale del mismo LEFT JOIN con la resolucion que ya alimenta estado y
visitaId, asi que no hay query ni endpoint nuevo. El front la necesita para
mostrarla en modo lectura sobre una visita ya cerrada."
```

---

### Checkpoint: deployar la Parte A

- [ ] **Ops corre el ALTER** en la base de producción:
  `ALTER TABLE pl_resolucion ADD COLUMN observaciones VARCHAR(500) NULL;`
- [ ] Deploy de `api-vendedores`.

Sin esto la Parte B manda un campo que el backend descarta, y el vendedor escribiría
sin que se guarde nada. El orden no es opcional.

---

# Parte B — `app-planificacion`

Todos los comandos de esta parte se corren desde
`C:/Users/matia/Documents/distrisuper/app-planificacion`.

---

### Task 6: El DTO lleva la observación hasta la API

**Files:**
- Modify: `src/types/planificacion.ts` (`ICerrarVisitaDTO` ~línea 350, `IAgendaClient` ~línea 105)
- Modify: `src/hooks/useVisitas.ts` (`useCerrarVisita`)
- Test: `src/api/planificacion.test.ts`

**Interfaces:**
- Consumes: el contrato de la Task 3 (`observaciones` en el body del `PUT .../cerrar`)
- Produces: `useCerrarVisita().mutateAsync({ visitaId, coordFinal, observaciones })` — lo usa la Task 8. `IAgendaClient.observaciones` — lo usa la Task 9.

- [ ] **Step 1: Write the failing test**

En `src/api/planificacion.test.ts`, junto al test `cerrarVisita manda SOLO coordFinal`:

```typescript
    it('cerrarVisita manda observaciones cuando hay texto', async () => {
        ;(apiClient.put as any).mockResolvedValue(ok({ visitaId: 42, ofrecimientosPendientes: 0 }))
        await cerrarVisita(42, { coordFinal: '-34.7,-58.4', observaciones: 'Pidió lista' })
        expect(apiClient.put).toHaveBeenCalledWith('/planificacion/visitas/42/cerrar', {
            coordFinal: '-34.7,-58.4',
            observaciones: 'Pidió lista',
        })
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/planificacion.test.ts`
Expected: FAIL de tipos — `observaciones` no existe en `ICerrarVisitaDTO`.

- [ ] **Step 3: Agregar el campo a los tipos**

En `src/types/planificacion.ts`, en `ICerrarVisitaDTO`:

```typescript
/** Sin motivoIds: al cerrar una visita el resultado comercial vive en los ofrecimientos. */
export interface ICerrarVisitaDTO {
    coordFinal: string
    /** Texto libre del vendedor. Se omite cuando no escribió nada — ver useCerrarVisita.
     *  Este es el ÚNICO momento en que se puede mandar: `pl_resolucion` es inmutable. */
    observaciones?: string
}
```

Y en `IAgendaClient`, después de `ofrecimientosPendientes`:

```typescript
    /** Observación que el vendedor dejó al cerrar. null si no dejó ninguna o si la fila
     *  todavía no tiene resolución. Solo lectura: no se puede editar después del cierre. */
    observaciones: string | null
```

- [ ] **Step 4: Dejarla pasar en el hook**

En `src/hooks/useVisitas.ts`, reemplazar `useCerrarVisita`:

```typescript
/** Sin motivoIds: el resultado comercial vive en los ofrecimientos. */
export function useCerrarVisita() {
    return useMutacionDeVisita((args: { visitaId: number } & ICerrarVisitaDTO) =>
        cerrarVisita(args.visitaId, {
            coordFinal: args.coordFinal,
            // Se OMITE la clave cuando no hay texto, en vez de mandar `null`: el body
            // queda idéntico al de antes de esta feature para el caso más común, así que
            // un backend viejo sin la columna sigue recibiendo exactamente lo que espera.
            ...(args.observaciones ? { observaciones: args.observaciones } : {}),
        }),
    )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/api/planificacion.test.ts src/hooks && npx tsc --noEmit`
Expected: PASS. `tsc` va a marcar los fixtures de test que arman un `IAgendaClient` sin `observaciones` — agregarles `observaciones: null`.

- [ ] **Step 6: Commit**

```bash
git add src/types/planificacion.ts src/hooks/useVisitas.ts src/api/planificacion.test.ts
git commit -m "feat(visita): el DTO de cierre acepta observaciones

La clave se OMITE cuando no hay texto en vez de mandar null: para el caso
mas comun el body queda identico al de antes, asi que un backend sin la
columna recibe exactamente lo que espera."
```

---

### Task 7: Borrador local de la observación

**Files:**
- Modify: `src/lib/resolucionDraft.ts`
- Test: `src/lib/resolucionDraft.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `leerObservaciones(visitaId: number): string | null`, `guardarObservaciones(visitaId: number, texto: string): void`, `limpiarObservaciones(visitaId: number): void` — los usa la Task 8.

- [ ] **Step 1: Write the failing test**

En `src/lib/resolucionDraft.test.ts`:

```typescript
import {
    leerObservaciones,
    guardarObservaciones,
    limpiarObservaciones,
} from './resolucionDraft'

describe('borrador de observaciones', () => {
    beforeEach(() => localStorage.clear())

    it('guarda y lee el texto de una visita', () => {
        guardarObservaciones(42, 'Pidió lista de precios')
        expect(leerObservaciones(42)).toBe('Pidió lista de precios')
    })

    it('null si no hay nada guardado', () => {
        expect(leerObservaciones(42)).toBeNull()
    })

    it('cada visita tiene su propio borrador', () => {
        guardarObservaciones(42, 'de la 42')
        guardarObservaciones(43, 'de la 43')
        expect(leerObservaciones(42)).toBe('de la 42')
        expect(leerObservaciones(43)).toBe('de la 43')
    })

    it('limpiar borra solo el de esa visita', () => {
        guardarObservaciones(42, 'de la 42')
        guardarObservaciones(43, 'de la 43')
        limpiarObservaciones(42)
        expect(leerObservaciones(42)).toBeNull()
        expect(leerObservaciones(43)).toBe('de la 43')
    })

    it('no comparte clave con el borrador de motivos ni con el de detalles', () => {
        // Clave propia a propósito: cambiar la forma del borrador de motivos dejaría
        // ilegibles los borradores ya guardados de las visitas en curso (leerBorrador
        // descarta lo que no matchea su forma). Misma razón que `detalles`.
        guardarObservaciones(42, 'texto')
        expect(localStorage.getItem('visita-observaciones-42')).toBe('texto')
        expect(localStorage.getItem('visita-borrador-42')).toBeNull()
        expect(localStorage.getItem('visita-detalles-42')).toBeNull()
    })

    it('el texto se guarda tal cual, sin JSON.stringify', () => {
        // Es un string, no una estructura: guardarlo crudo hace que no haya forma de
        // que un JSON corrupto lo vuelva ilegible, que es el caso que leerBorrador
        // tiene que manejar con try/catch.
        guardarObservaciones(42, 'con "comillas" y \\ barras')
        expect(leerObservaciones(42)).toBe('con "comillas" y \\ barras')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/resolucionDraft.test.ts`
Expected: FAIL — las tres funciones no existen.

- [ ] **Step 3: Implementar**

En `src/lib/resolucionDraft.ts`, al final:

```typescript
/** Observación libre de la visita, en su propia clave.
 *
 *  Clave propia y no un campo dentro de `Borrador`, por la misma razón documentada arriba
 *  para `detalles`: cambiar la forma del borrador de motivos obliga a tocar VisitaSheet,
 *  el wizard y su pie a la vez, y dejaría ilegibles los borradores ya guardados de las
 *  visitas en curso (`leerBorrador` descarta lo que no matchea la forma esperada).
 *
 *  Se guarda como string crudo, sin JSON: es un texto, no una estructura, así que no hay
 *  forma de que quede ilegible y no necesita el try/catch que sí necesitan los otros dos. */
function keyObservaciones(visitaId: number): string {
    return `visita-observaciones-${visitaId}`
}

export function leerObservaciones(visitaId: number): string | null {
    return localStorage.getItem(keyObservaciones(visitaId))
}

export function guardarObservaciones(visitaId: number, texto: string): void {
    localStorage.setItem(keyObservaciones(visitaId), texto)
}

export function limpiarObservaciones(visitaId: number): void {
    localStorage.removeItem(keyObservaciones(visitaId))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/resolucionDraft.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolucionDraft.ts src/lib/resolucionDraft.test.ts
git commit -m "feat(visita): borrador local de la observacion, en clave propia

Misma razon que detalles: cambiar la forma del borrador de motivos dejaria
ilegibles los borradores ya guardados de las visitas en curso.

String crudo y no JSON: es un texto, no una estructura, asi que no puede
quedar corrupto y no necesita el try/catch de los otros dos."
```

---

### Task 8: El textarea en el pie fijo

**Files:**
- Modify: `index.html` (meta viewport)
- Modify: `src/components/VisitaSheet.tsx`
- Modify: `src/components/VisitaFlow.tsx` (`onCerrarVisita`, ~línea 267 y 283)
- Test: `src/components/VisitaSheet.test.tsx`

**Interfaces:**
- Consumes: `leerObservaciones`/`guardarObservaciones`/`limpiarObservaciones` (Task 7), `useCerrarVisita` (Task 6)
- Produces: `VisitaSheetProps.onCerrarVisita: (observaciones: string | null) => void` — **cambio de firma**, antes era `() => void`.

- [ ] **Step 1: Write the failing test**

En `src/components/VisitaSheet.test.tsx`, al final:

```typescript
const OBS_LABEL = /observaciones/i

it('no muestra el campo de observaciones mientras falten rubros', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')

    expect(screen.getByRole('button', { name: /cargá 1 rubro más/i })).toBeDisabled()
    expect(screen.queryByRole('textbox', { name: OBS_LABEL })).not.toBeInTheDocument()
})

it('muestra el campo al cumplir el mínimo de rubros', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')

    fireEvent.click(screen.getByRole('button', { name: 'Resolución de Amortiguadores' }))
    await tildarSaquePedido()
    fireEvent.click(await screen.findByRole('button', { name: /minimizar y ver lista/i }))

    await screen.findByRole('button', { name: /^cerrar visita$/i })
    expect(screen.getByRole('textbox', { name: OBS_LABEL })).toBeInTheDocument()
})

it('no muestra el campo si los ofrecimientos no cargaron', async () => {
    // Con el GET fallado, `ofrecimientos` es [] y min(2, 0) es 0: sin este gate el
    // campo aparecería sobre una visita cuyos rubros ni cargaron. Es la misma trampa
    // que ya gobierna el botón de cerrar.
    ;(api.getOfrecimientos as any).mockRejectedValue(new Error('Network'))
    renderSheet()

    await screen.findByText(/no pudimos traer los rubros/i)
    expect(screen.queryByRole('textbox', { name: OBS_LABEL })).not.toBeInTheDocument()
})

it('el texto sobrevive a cerrar y reabrir el sheet', async () => {
    localStorage.setItem('visita-observaciones-42', 'lo que escribí antes')
    renderSheet()
    await screen.findByText('Amortiguadores')

    fireEvent.click(screen.getByRole('button', { name: 'Resolución de Amortiguadores' }))
    await tildarSaquePedido()
    fireEvent.click(await screen.findByRole('button', { name: /minimizar y ver lista/i }))

    await screen.findByRole('button', { name: /^cerrar visita$/i })
    expect(screen.getByRole('textbox', { name: OBS_LABEL })).toHaveValue('lo que escribí antes')
})

it('manda la observación al cerrar y limpia el borrador', async () => {
    const { onCerrarVisita } = renderSheet()
    await screen.findByText('Amortiguadores')

    fireEvent.click(screen.getByRole('button', { name: 'Resolución de Amortiguadores' }))
    await tildarSaquePedido()
    fireEvent.click(await screen.findByRole('button', { name: /minimizar y ver lista/i }))

    const campo = await screen.findByRole('textbox', { name: OBS_LABEL })
    fireEvent.change(campo, { target: { value: '  Pidió lista de precios  ' } })

    fireEvent.click(screen.getByRole('button', { name: /^cerrar visita$/i }))

    // Trimmeado también del lado del front: el backend lo normaliza igual, pero mandar
    // el texto ya limpio evita que "   " cuente como observación en el contador.
    await waitFor(() => expect(onCerrarVisita).toHaveBeenCalledWith('Pidió lista de precios'))
    expect(localStorage.getItem('visita-observaciones-42')).toBeNull()
})

it('sin texto, cerrar manda null', async () => {
    const { onCerrarVisita } = renderSheet()
    await screen.findByText('Amortiguadores')

    fireEvent.click(screen.getByRole('button', { name: 'Resolución de Amortiguadores' }))
    await tildarSaquePedido()
    fireEvent.click(await screen.findByRole('button', { name: /minimizar y ver lista/i }))

    fireEvent.click(await screen.findByRole('button', { name: /^cerrar visita$/i }))

    await waitFor(() => expect(onCerrarVisita).toHaveBeenCalledWith(null))
})

it('si el guardado de los rubros falla, NO limpia el borrador ni cierra', async () => {
    // `cerrarConBorrador` corta antes de limpiar cuando el batch devuelve error. Sin
    // esto, un fallo de red le borraria al vendedor el texto que escribio Y no cerraria
    // la visita: perderia el trabajo sin haber avanzado nada.
    ;(api.resolverOfrecimiento as any).mockRejectedValue(new Error('Network'))
    const { onCerrarVisita } = renderSheet()
    await screen.findByText('Amortiguadores')

    fireEvent.click(screen.getByRole('button', { name: 'Resolución de Amortiguadores' }))
    await tildarSaquePedido()
    fireEvent.click(await screen.findByRole('button', { name: /minimizar y ver lista/i }))

    const campo = await screen.findByRole('textbox', { name: OBS_LABEL })
    fireEvent.change(campo, { target: { value: 'no se tiene que perder' } })

    fireEvent.click(screen.getByRole('button', { name: /^cerrar visita$/i }))

    await screen.findByText(/no se pudo guardar la resolución/i)
    expect(onCerrarVisita).not.toHaveBeenCalled()
    expect(localStorage.getItem('visita-observaciones-42')).toBe('no se tiene que perder')
})

it('el contador cuenta el texto escrito y topea en 500', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')

    fireEvent.click(screen.getByRole('button', { name: 'Resolución de Amortiguadores' }))
    await tildarSaquePedido()
    fireEvent.click(await screen.findByRole('button', { name: /minimizar y ver lista/i }))

    const campo = await screen.findByRole('textbox', { name: OBS_LABEL })
    expect(campo).toHaveAttribute('maxLength', '500')
    expect(screen.getByText('0/500')).toBeInTheDocument()

    fireEvent.change(campo, { target: { value: 'hola' } })
    expect(screen.getByText('4/500')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: FAIL — no hay `textbox` con ese nombre accesible.

- [ ] **Step 3: Agregar el estado y el borrador en `VisitaSheet`**

Importar las funciones nuevas (agregar al import existente de `@/lib/resolucionDraft`):

```typescript
    leerObservaciones,
    guardarObservaciones,
    limpiarObservaciones,
```

Declarar la constante arriba del componente, después de los imports:

```typescript
/** Tiene que coincidir con el VARCHAR(500) de pl_resolucion.observaciones y con
 *  OBSERVACIONES_MAX del controller de api-vendedores. */
const OBSERVACIONES_MAX = 500
```

Agregar el estado junto a `detalles`:

```typescript
    const [observaciones, setObservaciones] = useState('')
```

En el `useEffect` de reset (`if (!open)`), agregar:

```typescript
            setObservaciones('')
```

En el `useEffect` que inicializa desde localStorage — el que ya hace
`setDetalles(prev => ...)` — agregar en la misma línea de inicialización:

```typescript
        setObservaciones(prev => (prev !== '' ? prev : (leerObservaciones(visitaId) ?? '')))
```

En el `useEffect` que persiste el borrador, agregar:

```typescript
        guardarObservaciones(visitaId, observaciones)
```

y agregar `observaciones` a su array de dependencias.

- [ ] **Step 4: Mandar el texto al cerrar y limpiar**

En `cerrarConBorrador`, reemplazar el final:

```typescript
        limpiarBorrador(visitaId)
        limpiarDetalles(visitaId)
        onCerrarVisita()
```

por:

```typescript
        limpiarBorrador(visitaId)
        limpiarDetalles(visitaId)
        limpiarObservaciones(visitaId)
        // Trimmeado del lado del front además del backend: así "   " no viaja como si
        // fuera una observación. null y no '' — es el mismo valor que la columna.
        const texto = observaciones.trim()
        onCerrarVisita(texto === '' ? null : texto)
```

- [ ] **Step 5: Cambiar la firma del prop**

En `VisitaSheetProps`:

```typescript
    /** Recibe la observación libre ya normalizada (trim, `''` → null). Se manda en el
     *  PUT de cierre, que es su único punto de escritura. */
    onCerrarVisita: (observaciones: string | null) => void
```

- [ ] **Step 6: Dibujar el campo en el pie fijo**

En el `footer`, en la rama de lista (la que no es `wizard`), **antes** del bloque de
`cliente && onAbrirAppExterna`:

```tsx
            {/* En el pie FIJO y no al final del cuerpo scrolleable: así el vendedor ve
             *  siempre si dejó observación o no, sin scrollear debajo de un catálogo que
             *  puede tener docenas de filas. Es una decisión tomada sabiendo su costo —
             *  ~56px del pie, que es el recurso más escaso del sheet, y el riesgo del
             *  teclado en iOS (ver el spec y el meta viewport de index.html).
             *
             *  `ofrecimientosCargados` es parte del gate por la misma razón que en el
             *  botón de cerrar: con el GET en vuelo o fallado, `ofrecimientos` es [] y
             *  min(2, 0) es 0, así que el mínimo se auto-satisface. */}
            {!visitaCerrada && ofrecimientosCargados && faltanParaMinimo === 0 && (
                <div className="mb-2.5">
                    <div className="mb-1 flex items-baseline justify-between">
                        <label
                            htmlFor="visita-observaciones"
                            className="text-[9.5px] font-bold uppercase tracking-wide text-dsmuted"
                        >
                            Observaciones (opcional)
                        </label>
                        <span className="text-[10px] font-semibold tabular-nums text-dsmuted">
                            {observaciones.length}/{OBSERVACIONES_MAX}
                        </span>
                    </div>
                    {/* `rows={2}` fijo, sin auto-grow: un textarea que crece dentro de un
                     *  pie fijo mueve el botón de cerrar mientras el vendedor tipea. */}
                    <textarea
                        id="visita-observaciones"
                        rows={2}
                        maxLength={OBSERVACIONES_MAX}
                        value={observaciones}
                        onChange={e => setObservaciones(e.target.value)}
                        placeholder="Algo para agregar de esta visita…"
                        className="w-full resize-none rounded-md border border-[#E4E8F0] bg-white px-2.5 py-1.5 text-[12.5px] font-semibold leading-snug text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6] focus:border-dsnavy"
                    />
                </div>
            )}
```

- [ ] **Step 7: Actualizar el llamador**

En `src/components/VisitaFlow.tsx`, cambiar la firma de `onCerrarVisita`:

```typescript
    async function onCerrarVisita(observaciones: string | null) {
```

y la llamada a la mutación (~línea 283):

```typescript
                    const res = await cerrar.mutateAsync({
                        visitaId,
                        coordFinal: geo.coord,
                        ...(observaciones ? { observaciones } : {}),
                    })
```

- [ ] **Step 8: Agregar el meta viewport**

En `index.html`, línea 6, reemplazar:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

por:

```html
    <!-- interactive-widget=resizes-content: al abrirse el teclado virtual, el layout
         viewport se encoge, así que el pie fijo del BottomSheet sube con el teclado en
         vez de quedar debajo. Necesario desde que hay un textarea en ese pie (spec
         2026-09-11). Anda en Chrome/Android; iOS Safari NO lo soporta — ver el spec. -->
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content"
    />
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS. `tsc` va a marcar los tests que pasan `onCerrarVisita={() => {}}` — siguen
siendo válidos (una función que ignora su argumento tipa bien), pero los que afirman
`toHaveBeenCalledWith()` sin argumentos hay que actualizarlos a `toHaveBeenCalledWith(null)`.

- [ ] **Step 10: Commit**

```bash
git add index.html src/components/VisitaSheet.tsx src/components/VisitaFlow.tsx src/components/VisitaSheet.test.tsx
git commit -m "feat(visita): campo de observaciones en el pie fijo del sheet

Textarea de 2 renglones que aparece SOLO al cumplir el minimo de rubros, con
contador y tope de 500. Se respalda en localStorage con clave propia, asi que
sobrevive a minimizar y reabrir, y se limpia al cerrar con exito.

Va en el pie fijo y no al final del cuerpo scrolleable para que el vendedor
vea siempre si dejo observacion o no, sin scrollear debajo de un catalogo de
docenas de filas. Costo asumido: ~56px del pie, y el riesgo del teclado en
iOS -- mitigado con interactive-widget=resizes-content, que resuelve Android
pero no iOS. HAY QUE PROBARLO EN UN IPHONE REAL antes de mergear.

ofrecimientosCargados es parte del gate: con el GET fallado ofrecimientos es
[] y min(2,0) es 0, asi que el minimo se auto-satisface y el campo
apareceria sobre una visita cuyos rubros ni cargaron."
```

---

### Task 9: Modo lectura en una visita cerrada

**Files:**
- Modify: `src/components/VisitaSheet.tsx`
- Test: `src/components/VisitaSheet.test.tsx`

**Interfaces:**
- Consumes: `IAgendaClient.observaciones` (Tasks 5 y 6), que llega por el prop `cliente`
- Produces: nada

- [ ] **Step 1: Write the failing test**

En `src/components/VisitaSheet.test.tsx`:

```typescript
it('visita cerrada con observación: se ve como texto, sin textarea', async () => {
    renderSheet({
        visitaCerrada: true,
        cliente: { ...CLIENTE, observaciones: 'Pidió lista de precios' },
    })
    await screen.findByText('Amortiguadores')

    expect(screen.getByText('Pidió lista de precios')).toBeInTheDocument()
    // Sin textarea ni contador: una vez cerrada no se puede agregar ni editar, porque
    // pl_resolucion es inmutable. Un campo deshabilitado se leería como "todavía lo
    // podés llenar", que es lo contrario de lo que pasa.
    expect(screen.queryByRole('textbox', { name: /observaciones/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/\/500/)).not.toBeInTheDocument()
})

it('visita cerrada sin observación: no muestra el bloque', async () => {
    renderSheet({ visitaCerrada: true, cliente: { ...CLIENTE, observaciones: null } })
    await screen.findByText('Amortiguadores')

    expect(screen.queryByText(/observaciones/i)).not.toBeInTheDocument()
})
```

`CLIENTE` es el fixture que ya existe en ese archivo; agregarle `observaciones: null`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/VisitaSheet.test.tsx -t "visita cerrada con observaci"`
Expected: FAIL — el texto no está en pantalla.

- [ ] **Step 3: Dibujar el bloque de lectura**

En el `footer` de `VisitaSheet`, inmediatamente después del bloque del textarea de la
Task 8:

```tsx
            {/* Visita cerrada: solo lectura, y solo si hay algo que leer. `pl_resolucion`
             *  es inmutable, así que no hay forma de agregarla ni editarla después del
             *  cierre — de ahí que sea texto plano, sin textarea, sin contador y sin
             *  ningún afórdance de edición. Y si no dejó ninguna no se muestra nada: un
             *  campo vacío deshabilitado se lee como "todavía lo podés llenar". */}
            {visitaCerrada && cliente?.observaciones && (
                <div className="mb-2.5 rounded-md border border-dsline bg-[#FAFBFD] px-2.5 py-2">
                    <p className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wide text-dsmuted">
                        Observaciones
                    </p>
                    <p className="whitespace-pre-wrap text-[12.5px] font-semibold leading-snug text-[#182645]">
                        {cliente.observaciones}
                    </p>
                </div>
            )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: PASS

- [ ] **Step 5: Verificación completa**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: toda la suite en verde, `tsc` limpio, 0 errores de lint, build OK.

- [ ] **Step 6: Commit**

```bash
git add src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx
git commit -m "feat(visita): mostrar la observacion en una visita cerrada, solo lectura

Texto plano: sin textarea, sin contador, sin ningun afordance de edicion.
pl_resolucion es inmutable, asi que despues del cierre no hay forma de
agregarla ni editarla.

Y si no dejo ninguna no se muestra nada: un campo vacio deshabilitado se lee
como 'todavia lo podes llenar', justo lo contrario de lo que pasa."
```

---

### Task 10: Probar en un iPhone real

**No es opcional y no se puede automatizar.** Es la única parte del diseño que ningún
test cubre: jsdom no tiene teclado virtual ni visual viewport.

- [ ] **Step 1: Servir la app en la red local**

Run: `npm run dev -- --host`
Anotar la URL de red que imprime Vite.

- [ ] **Step 2: Abrir en un iPhone (Safari) y llegar al campo**

Loguearse, abrir una visita en curso, completar 2 rubros hasta que aparezca el textarea.

- [ ] **Step 3: Enfocar el textarea con el teclado abierto y verificar**

Confirmar los tres:
- El textarea queda visible (no tapado por el teclado).
- El botón "Cerrar visita" sigue alcanzable.
- El pie no salta ni se despega mientras se tipea.

- [ ] **Step 4: Repetir en Chrome/Android**

Ahí `interactive-widget=resizes-content` sí aplica; debería andar sin más.

- [ ] **Step 5: Decidir**

- **Anda en los dos** → listo, se puede mergear.
- **Se rompe en iOS** → el camino de vuelta ya está diseñado y **no toca el backend**:
  reemplazar el textarea del pie por una **fila fija colapsada** (una línea, ~32px, arriba
  de PAGOS/VERSUS/CRM) que abre un `BottomSheet` chico con el textarea y un botón de
  confirmar. El estado, el borrador, el trim y el envío de la Task 8 se reusan tal cual:
  solo cambia dónde se tipea. Escribir eso como una tarea nueva y avisar antes de mergear.

---

## Notas de verificación

**`api-vendedores`:** `npx jest` (suite completa) y `npm run build`.

**`app-planificacion`:** `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Ojo: `tsc --noEmit` es **menos estricto** que el `tsc` del build (el build cazó un
`TS6133` de variable sin usar que `--noEmit` dejó pasar), así que correr los dos.

**Qué NO verifica ningún test:** el comportamiento del teclado en iOS (Task 10), y que el
`ALTER` esté aplicado en producción. Las dos son manuales y las dos bloquean el merge.
