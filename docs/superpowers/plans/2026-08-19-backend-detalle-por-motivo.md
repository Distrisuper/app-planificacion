# Detalle por motivo — Backend (api-vendedores) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un motivo pueda pedir un conjunto propio de campos, y que esos valores se guarden
tipados y agrupables en vez de en las tres columnas fijas `marca` / `competidor` / `pct_diferencia`.

**Architecture:** `pl_motivo.codigo` pasa a ser la llave estable de un registro de validadores por
motivo (espejo de `accionDetalleValidators`). Los valores dejan de ser columnas de
`pl_ofrecimiento_motivo` y pasan a filas de `pl_ofrecimiento_motivo_campo`, una por campo, con
`valor_texto` o `valor_num` según el tipo. `OfrecimientoAlcance` es el precedente exacto de tabla
hija de ofrecimiento y se copia su forma.

**Tech Stack:** TypeScript, Sequelize (`sequelizeWritePlanificacion`), Jest, MySQL.

**Repo:** `C:/Users/matia/Documents/distrisuper/business-workflow/versus/api-vendedores`

**Spec:** `app-planificacion/docs/superpowers/specs/2026-08-19-detalle-por-motivo-design.md`

## Global Constraints

- **Este plan va primero.** El plan de frontend consume el contrato que se define acá y no se puede
  integrar hasta que esto esté mergeado.
- **Un `campo` desconocido se descarta al persistir, nunca se rechaza.** Rechazar con 400 dejaría al
  vendedor sin poder cerrar la visita si su borrador tiene un campo viejo. Es el bug
  `MOTIVO_INEXISTENTE` que ya se pagó una vez.
- El código de error sigue siendo `MOTIVO_DETALLE_REQUERIDO`: no se cambia el contrato de errores.
- Los valores derivados (`-13.3%`, `2.0%`) **no se persisten**: se calculan al mostrarlos.
- La marca del catálogo se guarda como `valor_texto`; el backend **no** valida contra el catálogo de
  marcas (vive en el warehouse y sería un viaje por resolución).
- No hay resoluciones en producción: las tres columnas viejas se eliminan, no se migran datos.

---

### Task 1: `pl_motivo.codigo` reemplaza a `requiere_detalle`

**Files:**
- Create: `docs/db-notes/planificacion-detalle-por-motivo.sql`
- Modify: `src/models/Motivo.ts`
- Modify: `src/types/planificacion.ts`
- Modify: `src/repositories/MotivosRepository.ts`
- Test: `src/repositories/MotivosRepository.spec.ts` (crear si no existe)

**Interfaces:**
- Produces: `IMotivo` gana `codigo: string | null` y pierde `requiereDetalle`. Lo consumen la Task 3
  (validación) y todo el plan de frontend.

- [ ] **Step 1: Escribir la migración**

Crear `docs/db-notes/planificacion-detalle-por-motivo.sql`:

```sql
-- Detalle por motivo: cada motivo puede pedir su propio conjunto de campos.
-- Spec: app-planificacion/docs/superpowers/specs/2026-08-19-detalle-por-motivo-design.md

-- 1) `codigo` es la llave estable del registro de módulos. NO se indexa por motivo_id: los
--    ids difieren entre ambientes (dev usó 20-30 mientras prod tenía 17-21 tomados por
--    planificacion-motivos-faltantes.sql), así que un registro por número rompería en prod
--    y no en dev. Mismo criterio que pl_accion.codigo.
ALTER TABLE pl_motivo ADD COLUMN codigo VARCHAR(50) NULL;
ALTER TABLE pl_motivo ADD UNIQUE INDEX uq_motivo_codigo (codigo);

-- 2) Sembrar el código de los cuatro motivos con detalle. Se ubica por descripcion+resultado
--    y no por id, justamente porque el id no es estable entre ambientes.
UPDATE pl_motivo SET codigo = 'PRECIO'
 WHERE nivel = 'ofrecimiento' AND resultado = 'perdido' AND descripcion = 'Precio';
UPDATE pl_motivo SET codigo = 'PLAZO'
 WHERE nivel = 'ofrecimiento' AND resultado = 'perdido' AND descripcion = 'Plazo';
UPDATE pl_motivo SET codigo = 'FLETE'
 WHERE nivel = 'ofrecimiento' AND resultado = 'perdido' AND descripcion = 'Flete';
UPDATE pl_motivo SET codigo = 'NO_TRABAJA'
 WHERE nivel = 'ofrecimiento' AND resultado = 'perdido'
   AND descripcion = 'No trabaja la marca o cambio';

-- 3) Verificar: tienen que salir las cuatro filas con su código.
SELECT motivo_id, descripcion, resultado, codigo
  FROM pl_motivo
 WHERE nivel = 'ofrecimiento' AND codigo IS NOT NULL
 ORDER BY orden;

-- Los DROP de columnas NO van acá. Todo lo de arriba es aditivo y el backend viejo sigue
-- funcionando con estos cambios aplicados; las bajas van en el bloque final del archivo, que
-- se corre DESPUÉS de desplegar. Ver "Orden de despliegue" al final del plan.
```

- [ ] **Step 2: Escribir el test del repositorio (falla)**

Crear `src/repositories/MotivosRepository.spec.ts`:

```ts
import { MotivosRepository } from './MotivosRepository'
import Motivo from '../models/Motivo'

jest.mock('../models/Motivo')

const fila = (over: Record<string, unknown> = {}) => ({
    motivoId: 30,
    nivel: 'ofrecimiento',
    descripcion: 'Precio',
    resultado: 'perdido',
    codigo: 'PRECIO',
    ...over,
})

describe('MotivosRepository.findAll', () => {
    beforeEach(() => jest.clearAllMocks())

    it('mapea el codigo del motivo', async () => {
        ;(Motivo.findAll as jest.Mock).mockResolvedValue([fila()])

        const motivos = await MotivosRepository.findAll('ofrecimiento')

        expect(motivos[0].codigo).toBe('PRECIO')
    })

    // Un motivo sin módulo no pide detalle. `null` y no `undefined`: el front lo compara
    // contra el registro y `undefined` se serializa fuera del JSON.
    it('un motivo sin codigo lo devuelve como null, no undefined', async () => {
        ;(Motivo.findAll as jest.Mock).mockResolvedValue([fila({ codigo: null })])

        const motivos = await MotivosRepository.findAll('ofrecimiento')

        expect(motivos[0].codigo).toBeNull()
        expect('codigo' in motivos[0]).toBe(true)
    })

    it('ya no expone requiereDetalle', async () => {
        ;(Motivo.findAll as jest.Mock).mockResolvedValue([fila()])

        const motivos = await MotivosRepository.findAll('ofrecimiento')

        expect('requiereDetalle' in motivos[0]).toBe(false)
    })
})
```

- [ ] **Step 3: Correr el test y confirmar que falla**

Run: `npx jest src/repositories/MotivosRepository.spec.ts`
Expected: FAIL — `codigo` es `undefined` y `requiereDetalle` sigue presente.

- [ ] **Step 4: Actualizar el tipo**

En `src/types/planificacion.ts`, en `IMotivo`: quitar `requiereDetalle` y agregar `codigo`.

```ts
export interface IMotivo {
    motivoId: number
    nivel: NivelMotivo
    descripcion: string
    resultado: ResultadoMotivo | null
    /** Llave estable del módulo de detalle (PRECIO, PLAZO, FLETE, NO_TRABAJA). `null` = este
     *  motivo no pide nada. NO se usa motivoId para esto: los ids difieren entre ambientes. */
    codigo: string | null
}
```

- [ ] **Step 5: Actualizar el modelo**

En `src/models/Motivo.ts`: reemplazar `requiereDetalle` por `codigo` en la interfaz, en la clase y en
el `init`.

```ts
interface IMotivoAttributes {
    motivoId?: number
    nivel: NivelMotivo
    descripcion: string
    resultado?: ResultadoMotivo | null
    codigo?: string | null
    orden?: number
    activo?: boolean
}
```

En la clase, reemplazar `public requiereDetalle!: boolean` por `public codigo?: string | null`.

En `Motivo.init`, reemplazar el bloque `requiereDetalle` por:

```ts
        codigo: { type: DataTypes.STRING(50), allowNull: true, field: 'codigo' },
```

- [ ] **Step 6: Actualizar el mapeo del repositorio**

En `src/repositories/MotivosRepository.ts`, dentro de `rows.map`, reemplazar la línea de
`requiereDetalle` por:

```ts
                codigo: r.codigo ?? null,
```

- [ ] **Step 7: Correr el test y confirmar que pasa**

Run: `npx jest src/repositories/MotivosRepository.spec.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add docs/db-notes/planificacion-detalle-por-motivo.sql src/models/Motivo.ts src/types/planificacion.ts src/repositories/MotivosRepository.ts src/repositories/MotivosRepository.spec.ts
git commit -m "feat(planificacion): pl_motivo.codigo reemplaza a requiere_detalle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: La tabla de valores y su modelo

**Files:**
- Modify: `docs/db-notes/planificacion-detalle-por-motivo.sql`
- Create: `src/models/planificacion/OfrecimientoMotivoCampo.ts`
- Modify: `src/types/planificacion.ts`

**Interfaces:**
- Consumes: nada de la Task 1.
- Produces: el modelo `OfrecimientoMotivoCampo` y el tipo `IOfrecimientoMotivo` con `valores`.
  Los consumen las Tasks 3, 4 y 5, y todo el plan de frontend.

- [ ] **Step 1: Agregar la tabla a la migración**

Al final de `docs/db-notes/planificacion-detalle-por-motivo.sql`:

```sql
-- 5) Los valores del detalle, una fila por campo. Reemplaza a las tres columnas fijas de
--    pl_ofrecimiento_motivo, que no daban para cuatro formularios distintos (Precio necesita
--    4 valores, Flete 2, No trabaja 2).
--
--    Una sola de valor_texto/valor_num se llena, según el tipo declarado por el módulo del
--    motivo. Eso es lo que mantiene el dato agrupable: SELECT AVG(valor_num) WHERE campo =
--    'plazo_dias' funciona, indexado.
CREATE TABLE IF NOT EXISTS pl_ofrecimiento_motivo_campo (
  ofrecimiento_id INT          NOT NULL,
  motivo_id       INT          NOT NULL,
  campo           VARCHAR(50)  NOT NULL,

  valor_texto     VARCHAR(200)  NULL,
  valor_num       DECIMAL(12,2) NULL,

  PRIMARY KEY (ofrecimiento_id, motivo_id, campo),
  INDEX idx_campo_texto (campo, valor_texto),
  INDEX idx_campo_num   (campo, valor_num),
  FOREIGN KEY (ofrecimiento_id, motivo_id)
    REFERENCES pl_ofrecimiento_motivo (ofrecimiento_id, motivo_id)
);
```

- [ ] **Step 2: Crear el modelo**

Crear `src/models/planificacion/OfrecimientoMotivoCampo.ts`. Copia la forma de
`OfrecimientoAlcance` (misma conexión, `timestamps: false`, `field:` explícito):

```ts
import { Model, DataTypes } from 'sequelize'
import { sequelizeWritePlanificacion } from '../../database/connection'

interface IOfrecimientoMotivoCampoAttributes {
    ofrecimientoId: number
    motivoId: number
    campo: string
    valorTexto?: string | null
    valorNum?: number | null
}

/** Un valor del detalle de un motivo dentro de un ofrecimiento. Cuál de las dos columnas se
 *  llena lo decide el tipo que declara el módulo del motivo — nunca las dos a la vez. */
class OfrecimientoMotivoCampo
    extends Model<IOfrecimientoMotivoCampoAttributes>
    implements IOfrecimientoMotivoCampoAttributes
{
    public ofrecimientoId!: number
    public motivoId!: number
    public campo!: string
    public valorTexto?: string | null
    public valorNum?: number | null
}

OfrecimientoMotivoCampo.init(
    {
        ofrecimientoId: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            field: 'ofrecimiento_id',
        },
        motivoId: { type: DataTypes.INTEGER, primaryKey: true, field: 'motivo_id' },
        campo: { type: DataTypes.STRING(50), primaryKey: true, field: 'campo' },
        valorTexto: { type: DataTypes.STRING(200), allowNull: true, field: 'valor_texto' },
        valorNum: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            field: 'valor_num',
        },
    },
    {
        sequelize: sequelizeWritePlanificacion,
        modelName: 'OfrecimientoMotivoCampo',
        tableName: 'pl_ofrecimiento_motivo_campo',
        timestamps: false,
    },
)

export default OfrecimientoMotivoCampo
```

- [ ] **Step 3: Cambiar la forma de `IOfrecimientoMotivo`**

En `src/types/planificacion.ts`:

```ts
/** Un motivo aplicado a un ofrecimiento, con los valores que pidió su módulo de detalle.
 *  `valores` vacío = el motivo no pide nada, o todavía no se cargó. */
export interface IOfrecimientoMotivo {
    motivoId: number
    valores: Record<string, string | number | null>
}
```

- [ ] **Step 4: Verificar que el typecheck marca todos los usos rotos**

Run: `npx tsc --noEmit`
Expected: FAIL, con errores en `OfrecimientoRepository.ts`, `motivoValidation.ts` y
`AnaliticaService.ts`. **Es el resultado esperado**: son exactamente los tres lugares que las Tasks
3, 4 y 5 arreglan. Anotar la lista antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add docs/db-notes/planificacion-detalle-por-motivo.sql src/models/planificacion/OfrecimientoMotivoCampo.ts src/types/planificacion.ts
git commit -m "feat(planificacion): tabla pl_ofrecimiento_motivo_campo y valores por campo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Registro de validadores por motivo y validación genérica

**Files:**
- Create: `src/services/planificacion/detalleMotivoValidators.ts`
- Create: `src/services/planificacion/detalleMotivoValidators.spec.ts`
- Modify: `src/services/planificacion/motivoValidation.ts`
- Modify: `src/services/planificacion/motivoValidation.spec.ts`

**Interfaces:**
- Consumes: `IMotivo.codigo` (Task 1), `IOfrecimientoMotivo.valores` (Task 2).
- Produces: `validarMotivosDeOfrecimiento(motivos, catalogo)` con la misma firma de hoy, pero que
  además **devuelve** los valores limpios por motivo:
  `Map<number, Record<string, string | number>>`. La Task 4 persiste exactamente eso.

- [ ] **Step 1: Escribir el registro**

Crear `src/services/planificacion/detalleMotivoValidators.ts`:

```ts
/**
 * Qué campos pide cada motivo, por su `codigo`. Espejo de `accionDetalleValidators`, que hace
 * lo mismo para el detalle de las acciones comerciales.
 *
 * El tipo define en qué columna aterriza el valor (`texto` -> valor_texto, `numero` ->
 * valor_num) y cómo se valida. Del lado del front, `marca` se elige de un catálogo; acá es
 * `texto` a secas: validar contra el catálogo de marcas costaría un viaje al warehouse por
 * cada resolución, y la restricción real la impone el picker.
 *
 * Sumar un motivo con detalle es una entrada acá + un módulo en el front. NO es un cambio de
 * base: la tabla de valores no se toca.
 */
export type TipoCampoMotivo = 'texto' | 'numero'

export interface IValidadorDetalleMotivo {
    campos: Record<string, TipoCampoMotivo>
    /** Los que no pueden faltar. El resto es opcional. */
    requeridos: string[]
}

export const detalleMotivoValidators: Record<string, IValidadorDetalleMotivo> = {
    PRECIO: {
        campos: {
            marca: 'texto',
            competidor: 'texto',
            precio_competidor: 'numero',
            mi_precio: 'numero',
        },
        requeridos: ['marca', 'competidor', 'precio_competidor', 'mi_precio'],
    },
    PLAZO: {
        campos: { plazo_dias: 'numero' },
        requeridos: ['plazo_dias'],
    },
    FLETE: {
        campos: { valor_flete: 'numero', compra_futuro: 'numero' },
        requeridos: ['valor_flete', 'compra_futuro'],
    },
    NO_TRABAJA: {
        // `por_que` es contexto para leer, no para agrupar: no se exige.
        campos: { marca_trabaja: 'texto', por_que: 'texto' },
        requeridos: ['marca_trabaja'],
    },
}
```

- [ ] **Step 2: Escribir el test de la validación genérica (falla)**

Crear `src/services/planificacion/detalleMotivoValidators.spec.ts`:

```ts
import { validarValoresDeMotivo } from './motivoValidation'
import { IMotivo } from '../../types/planificacion'

const precio: IMotivo = {
    motivoId: 30,
    nivel: 'ofrecimiento',
    descripcion: 'Precio',
    resultado: 'perdido',
    codigo: 'PRECIO',
}

const sinDetalle: IMotivo = {
    motivoId: 35,
    nivel: 'ofrecimiento',
    descripcion: 'Dto',
    resultado: 'ganado',
    codigo: null,
}

const completos = {
    marca: 'Fric-Rot',
    competidor: 'Corven',
    precio_competidor: 150,
    mi_precio: 130,
}

describe('validarValoresDeMotivo', () => {
    it('devuelve los valores tal cual cuando están completos', () => {
        expect(validarValoresDeMotivo(precio, completos)).toEqual(completos)
    })

    it('un motivo sin codigo no guarda ningún valor', () => {
        expect(validarValoresDeMotivo(sinDetalle, { lo_que_sea: 'x' })).toEqual({})
    })

    // Regla del spec: un campo que ya no existe se DESCARTA, nunca rompe. Rechazarlo dejaría
    // al vendedor sin poder cerrar la visita si su borrador tiene un campo viejo.
    it('descarta un campo que el motivo no declara, sin tirar error', () => {
        const valores = { ...completos, pctDiferencia: 12 }
        expect(validarValoresDeMotivo(precio, valores)).toEqual(completos)
    })

    it('exige los campos requeridos', () => {
        expect(() => validarValoresDeMotivo(precio, { marca: 'Fric-Rot' })).toThrow(
            expect.objectContaining({ code: 'MOTIVO_DETALLE_REQUERIDO' }),
        )
    })

    it('no exige los opcionales', () => {
        const valores = { marca_trabaja: 'Corven' }
        const noTrabaja: IMotivo = { ...precio, codigo: 'NO_TRABAJA' }
        expect(validarValoresDeMotivo(noTrabaja, valores)).toEqual(valores)
    })

    it('un requerido vacío cuenta como faltante', () => {
        expect(() =>
            validarValoresDeMotivo(precio, { ...completos, competidor: '   ' }),
        ).toThrow(expect.objectContaining({ code: 'MOTIVO_DETALLE_REQUERIDO' }))
    })

    it('rechaza un valor no numérico en un campo numero', () => {
        expect(() =>
            validarValoresDeMotivo(precio, { ...completos, mi_precio: 'barato' }),
        ).toThrow(expect.objectContaining({ code: 'MOTIVO_DETALLE_INVALIDO' }))
    })

    // DECIMAL(12,2): más que eso lo truncaría MySQL en silencio.
    it('rechaza un número fuera del rango de la columna', () => {
        expect(() =>
            validarValoresDeMotivo(precio, { ...completos, mi_precio: 10_000_000_000 }),
        ).toThrow(expect.objectContaining({ code: 'MOTIVO_DETALLE_INVALIDO' }))
    })

    // VARCHAR(200).
    it('rechaza un texto más largo que la columna', () => {
        expect(() =>
            validarValoresDeMotivo(precio, { ...completos, competidor: 'x'.repeat(201) }),
        ).toThrow(expect.objectContaining({ code: 'MOTIVO_DETALLE_INVALIDO' }))
    })
})
```

- [ ] **Step 3: Correr el test y confirmar que falla**

Run: `npx jest src/services/planificacion/detalleMotivoValidators.spec.ts`
Expected: FAIL — `validarValoresDeMotivo` no existe.

- [ ] **Step 4: Implementar la validación**

En `src/services/planificacion/motivoValidation.ts`, agregar el import y las constantes arriba:

```ts
import { detalleMotivoValidators } from './detalleMotivoValidators'

// Límites de las columnas de pl_ofrecimiento_motivo_campo. Se validan acá para que MySQL no
// trunque en silencio, mismo criterio que PCT_MAX en la versión anterior.
const TEXTO_MAX = 200
const NUM_MAX = 9_999_999_999.99
```

Y reemplazar el cuerpo de `validarMotivosDeOfrecimiento` completo por:

```ts
/**
 * Valida y limpia los valores del detalle de UN motivo contra su módulo.
 *
 * Devuelve solo los campos que el módulo declara: un campo desconocido se descarta en
 * silencio, nunca rompe. Rechazarlo dejaría al vendedor sin poder cerrar la visita si su
 * borrador guardado tiene un campo que ya se sacó — el mismo bug que MOTIVO_INEXISTENTE.
 */
export function validarValoresDeMotivo(
    motivo: IMotivo,
    valores: Record<string, unknown>,
): Record<string, string | number> {
    const modulo = motivo.codigo ? detalleMotivoValidators[motivo.codigo] : undefined
    if (!modulo) return {}

    const limpio: Record<string, string | number> = {}

    for (const [campo, valor] of Object.entries(valores ?? {})) {
        const tipo = modulo.campos[campo]
        if (!tipo) continue
        if (valor === null || valor === undefined) continue

        if (tipo === 'numero') {
            const n = typeof valor === 'number' ? valor : Number(valor)
            if (!Number.isFinite(n) || Math.abs(n) > NUM_MAX) {
                throw new CustomError(
                    400,
                    `El campo "${campo}" de "${motivo.descripcion}" no es un número válido`,
                    { code: 'MOTIVO_DETALLE_INVALIDO' },
                )
            }
            limpio[campo] = n
            continue
        }

        const texto = String(valor).trim()
        if (texto === '') continue
        if (texto.length > TEXTO_MAX) {
            throw new CustomError(
                400,
                `El campo "${campo}" de "${motivo.descripcion}" supera los ${TEXTO_MAX} caracteres`,
                { code: 'MOTIVO_DETALLE_INVALIDO' },
            )
        }
        limpio[campo] = texto
    }

    for (const requerido of modulo.requeridos) {
        if (!(requerido in limpio)) {
            throw new CustomError(
                400,
                `El motivo "${motivo.descripcion}" necesita ${modulo.requeridos.join(', ')}`,
                { code: 'MOTIVO_DETALLE_REQUERIDO' },
            )
        }
    }

    return limpio
}

/**
 * Motivos a NIVEL OFRECIMIENTO — el resultado comercial. La lista vacía SÍ es válida: el
 * vendedor desmarcó todo y el ofrecimiento vuelve a estar sin resolver.
 *
 * Devuelve los valores ya limpios por motivoId: el repositorio persiste exactamente esto, sin
 * volver a interpretar nada.
 */
export function validarMotivosDeOfrecimiento(
    motivos: IOfrecimientoMotivo[],
    catalogo: Map<number, IMotivo>,
): Map<number, Record<string, string | number>> {
    assertSinDuplicados(motivos.map(m => m.motivoId))

    const limpios = new Map<number, Record<string, string | number>>()
    for (const motivo of motivos) {
        const definicion = assertNivel(motivo.motivoId, 'ofrecimiento', catalogo)
        limpios.set(motivo.motivoId, validarValoresDeMotivo(definicion, motivo.valores ?? {}))
    }
    return limpios
}
```

- [ ] **Step 5: Actualizar el spec existente de motivoValidation**

En `src/services/planificacion/motivoValidation.spec.ts`: el catálogo de fixtures usa
`requiereDetalle`. Reemplazar ese campo por `codigo` en cada entrada — `codigo: null` en los que no
pedían detalle, y `codigo: 'PRECIO'` en el que tenía `requiereDetalle: true`. Los tests de
duplicados y de nivel no cambian. Los que verificaban los tres campos fijos se borran: ese
comportamiento vive ahora en `detalleMotivoValidators.spec.ts`.

- [ ] **Step 6: Correr los dos specs y confirmar que pasan**

Run: `npx jest src/services/planificacion/motivoValidation.spec.ts src/services/planificacion/detalleMotivoValidators.spec.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/planificacion/detalleMotivoValidators.ts src/services/planificacion/detalleMotivoValidators.spec.ts src/services/planificacion/motivoValidation.ts src/services/planificacion/motivoValidation.spec.ts
git commit -m "feat(planificacion): registro de validadores por motivo y validación genérica

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Persistir y leer los valores

**Files:**
- Modify: `src/repositories/OfrecimientoRepository.ts`
- Modify: `src/services/planificacion/OfrecimientosService.ts`
- Test: `src/services/planificacion/OfrecimientosService.spec.ts`

**Interfaces:**
- Consumes: `OfrecimientoMotivoCampo` (Task 2), `validarMotivosDeOfrecimiento` devolviendo el Map
  (Task 3).
- Produces: `OfrecimientoRepository.resolver(ofrecimientoId, motivos, valoresPorMotivo, detalle?)`.

- [ ] **Step 1: Escribir el test del servicio (falla)**

En `src/services/planificacion/OfrecimientosService.spec.ts`, dentro del `describe('resolver')` que
ya existe (~línea 188). Reusa `mockedResolver` y los ids `5`/`20` del test vecino
`'persiste los motivos del ofrecimiento'`, cuyo `beforeEach` ya deja armados los mocks de
`resolveSellerCode`, `ResolucionRepository`, `RotacionClienteRepository` y `MotivosService`.

Primero, **actualizar el test existente** para la forma nueva — su aserción actual espera los tres
campos fijos:

```ts
        expect(mockedResolver).toHaveBeenCalledWith(
            20,
            [{ motivoId: 10, valores: {} }],
            new Map([[10, {}]]),
            undefined,
        )
```

Y agregar al lado:

```ts
    // El servicio le pasa al repositorio los valores YA validados, no los crudos del body:
    // así un campo que el módulo no declara nunca llega a la tabla. Y no rompe — es la regla
    // del spec: descartar, nunca rechazar.
    it('persiste solo los valores que el módulo del motivo declara', async () => {
        await OfrecimientosService.resolver(user, 5, 20, {
            motivos: [
                {
                    motivoId: 30,
                    valores: {
                        marca: 'Fric-Rot',
                        competidor: 'Corven',
                        precio_competidor: 150,
                        mi_precio: 130,
                        campo_viejo: 'x',
                    },
                },
            ],
        })

        expect(mockedResolver).toHaveBeenCalledWith(
            20,
            expect.anything(),
            new Map([
                [
                    30,
                    {
                        marca: 'Fric-Rot',
                        competidor: 'Corven',
                        precio_competidor: 150,
                        mi_precio: 130,
                    },
                ],
            ]),
            undefined,
        )
    })
```

El catálogo que devuelve el mock de `MotivosService.mapById` tiene que incluir el motivo 30 con
`codigo: 'PRECIO'`; si el `beforeEach` solo siembra el 10, agregarlo ahí.

- [ ] **Step 2: Correr y confirmar que falla**

Run: `npx jest src/services/planificacion/OfrecimientosService.spec.ts`
Expected: FAIL — `resolver` todavía recibe tres argumentos y los motivos crudos.

- [ ] **Step 3: Pasar los valores limpios desde el servicio**

En `src/services/planificacion/OfrecimientosService.ts`, en `resolver`, reemplazar las dos líneas de
validación y la llamada al repositorio por:

```ts
        const catalogo = await MotivosService.mapById()
        const valoresPorMotivo = validarMotivosDeOfrecimiento(dto.motivos, catalogo)
        validarDetalleAccion(dto.detalle)

        await OfrecimientoRepository.resolver(
            ofrecimientoId,
            dto.motivos,
            valoresPorMotivo,
            dto.detalle,
        )
```

- [ ] **Step 4: Escribir los valores en el repositorio**

En `src/repositories/OfrecimientoRepository.ts`, importar el modelo nuevo:

```ts
import OfrecimientoMotivoCampo from '../models/planificacion/OfrecimientoMotivoCampo'
```

Y reemplazar el cuerpo de `resolver` por:

```ts
    static async resolver(
        ofrecimientoId: number,
        motivos: IOfrecimientoMotivo[],
        /** Ya validados y limpios por `validarMotivosDeOfrecimiento`: acá no se interpreta
         *  nada, se persiste tal cual. */
        valoresPorMotivo: Map<number, Record<string, string | number>>,
        /** `undefined` = no vino en el body, no se toca la columna. `null` = se
         *  sacó la acción comercial, se limpia. */
        detalle?: unknown,
    ): Promise<void> {
        try {
            if (detalle !== undefined) {
                await Ofrecimiento.update({ detalle }, { where: { id: ofrecimientoId } })
            }

            // Los campos primero: la FK compuesta apunta a pl_ofrecimiento_motivo, así que
            // borrar el padre antes dejaría filas huérfanas o violaría la constraint.
            await OfrecimientoMotivoCampo.destroy({ where: { ofrecimientoId } })
            await OfrecimientoMotivo.destroy({ where: { ofrecimientoId } })

            if (motivos.length === 0) return

            await OfrecimientoMotivo.bulkCreate(
                motivos.map(m => ({ ofrecimientoId, motivoId: m.motivoId })),
            )

            const filas = motivos.flatMap(m =>
                Object.entries(valoresPorMotivo.get(m.motivoId) ?? {}).map(([campo, valor]) => ({
                    ofrecimientoId,
                    motivoId: m.motivoId,
                    campo,
                    valorTexto: typeof valor === 'string' ? valor : null,
                    valorNum: typeof valor === 'number' ? valor : null,
                })),
            )
            if (filas.length > 0) {
                await OfrecimientoMotivoCampo.bulkCreate(filas)
            }
        } catch (err) {
            throw new CustomError(500, `Error resolviendo ofrecimiento: ${err}`)
        }
    }
```

- [ ] **Step 5: Leer los valores en `adjuntarMotivos`**

En el mismo archivo, dentro de `adjuntarMotivos`, después del `findAll` de `OfrecimientoMotivo`,
agregar la lectura de los campos y usarla al armar cada motivo:

```ts
        const campoRows = await OfrecimientoMotivoCampo.findAll({
            where: { ofrecimientoId: { [Op.in]: rows.map(r => r.id) } },
        })

        // Se agrupa por (ofrecimiento, motivo) porque esa es la PK del padre.
        const porMotivo = new Map<string, Record<string, string | number | null>>()
        for (const c of campoRows) {
            const clave = `${c.ofrecimientoId}:${c.motivoId}`
            const valores = porMotivo.get(clave) ?? {}
            valores[c.campo] = c.valorTexto ?? toNumber(c.valorNum)
            porMotivo.set(clave, valores)
        }
```

Y reemplazar el `lista.push({...})` de motivos por:

```ts
            lista.push({
                motivoId: m.motivoId,
                valores: porMotivo.get(`${m.ofrecimientoId}:${m.motivoId}`) ?? {},
            })
```

- [ ] **Step 6: Eliminar las tres columnas del modelo padre**

En `src/models/planificacion/OfrecimientoMotivo.ts`: sacar `marca`, `competidor` y `pctDiferencia` de
la interfaz, de la clase y del `init`. Quedan solo `ofrecimientoId` y `motivoId`.

- [ ] **Step 7: Correr los tests del dominio**

Run: `npx jest src/services/planificacion src/repositories`
Expected: PASS. Si algún spec de `OfrecimientosService` construye motivos con la forma vieja
(`marca`/`competidor`/`pctDiferencia`), actualizarlo a `valores`.

- [ ] **Step 8: Commit**

```bash
git add src/repositories/OfrecimientoRepository.ts src/services/planificacion/OfrecimientosService.ts src/services/planificacion/OfrecimientosService.spec.ts src/models/planificacion/OfrecimientoMotivo.ts
git commit -m "feat(planificacion): persistir y leer los valores del detalle por campo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Analítica y baja de las columnas viejas

**Files:**
- Modify: `src/services/planificacion/AnaliticaService.ts`
- Modify: `src/types/analitica.ts`
- Modify: `src/docs/planificacion.yaml`
- Modify: `docs/db-notes/planificacion-detalle-por-motivo.sql`
- Test: `src/services/planificacion/AnaliticaService.spec.ts`

**Interfaces:**
- Consumes: `IOfrecimientoMotivo.valores` (Task 2), la lectura de `adjuntarMotivos` (Task 4).
- Produces: `IVisitaOfrecimientoDetalleMotivo` con `valores` en vez de los tres campos.

- [ ] **Step 1: Escribir el test (falla)**

En `src/services/planificacion/AnaliticaService.spec.ts`, agregar al bloque que arma el detalle de
visita:

```ts
// Regla del spec: lo histórico se dibuja desde las filas guardadas, NO desde el módulo
// vigente. Un valor de un campo que ya se sacó del módulo tiene que seguir viéndose — si se
// iterara el módulo actual, un dato que sí se recolectó se volvería invisible.
it('devuelve los valores guardados aunque el módulo ya no declare ese campo', async () => {
    mockearOfrecimientos([
        {
            id: 7,
            tipo: 'rubro',
            codigo: 'AMORT',
            descripcion: 'Amortiguadores',
            esPropuesto: true,
            resuelto: true,
            alcance: [],
            motivos: [{ motivoId: 30, valores: { competidor: 'Corven', campo_viejo: 12 } }],
        },
    ])

    const detalle = await AnaliticaService.detalleDeVisita(user, 42)

    expect(detalle.ofrecimientos[0].motivos[0].valores).toEqual({
        competidor: 'Corven',
        campo_viejo: 12,
    })
})
```

Ajustar `mockearOfrecimientos` y `detalleDeVisita` a los nombres reales que ya usa ese spec.

- [ ] **Step 2: Correr y confirmar que falla**

Run: `npx jest src/services/planificacion/AnaliticaService.spec.ts`
Expected: FAIL — el mapeo todavía arma `marca`/`competidor`/`pctDiferencia`.

- [ ] **Step 3: Actualizar el tipo de analítica**

En `src/types/analitica.ts`, en el tipo del motivo del detalle de visita, reemplazar las tres líneas
`marca` / `competidor` / `pctDiferencia` por:

```ts
    /** Los valores tal como se guardaron. Se pasan enteros y no se filtran contra el módulo
     *  vigente: un campo que se sacó después igual tiene que poder verse. */
    valores: Record<string, string | number | null>
```

- [ ] **Step 4: Actualizar el mapeo**

En `src/services/planificacion/AnaliticaService.ts` (~línea 384), reemplazar el `return` del
`motivos.map` por:

```ts
                return {
                    descripcion: catalogo?.descripcion ?? '',
                    resultado: catalogo?.resultado ?? null,
                    valores: m.valores,
                }
```

- [ ] **Step 5: Actualizar el OpenAPI**

En `src/docs/planificacion.yaml`, en el schema del motivo de ofrecimiento: reemplazar las
propiedades `marca`, `competidor` y `pctDiferencia` por `valores`, con
`additionalProperties: true` y una descripción que diga que las claves son los `campo` del módulo
del motivo.

- [ ] **Step 6: Agregar el DROP a la migración**

Al final de `docs/db-notes/planificacion-detalle-por-motivo.sql`:

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- BLOQUE FINAL — correr SOLO DESPUÉS de desplegar el backend nuevo.
-- Mientras el código viejo siga vivo, declara y escribe estas columnas.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- Las tres columnas viejas se van. No hay migración de datos: no hay resoluciones cargadas
-- en producción. El INDEX idx_competidor se cae junto con su columna.
ALTER TABLE pl_ofrecimiento_motivo
  DROP COLUMN marca,
  DROP COLUMN competidor,
  DROP COLUMN pct_diferencia;

-- `requiere_detalle` también: con el registro, "pide detalle" es "tiene módulo registrado", y
-- un flag en la base que puede contradecir al código es peor que no tenerlo. Va acá y no
-- arriba porque el modelo Sequelize viejo la declara.
ALTER TABLE pl_motivo DROP COLUMN requiere_detalle;
```

- [ ] **Step 7: Correr toda la suite**

Run: `npx jest`
Expected: PASS. Si queda algún spec con la forma vieja, actualizarlo a `valores`.

- [ ] **Step 8: Typecheck limpio**

Run: `npx tsc --noEmit`
Expected: sin salida. Confirma que los tres archivos que la Task 2 dejó rotos quedaron cerrados.

- [ ] **Step 9: Commit**

```bash
git add src/services/planificacion/AnaliticaService.ts src/types/analitica.ts src/docs/planificacion.yaml src/services/planificacion/AnaliticaService.spec.ts docs/db-notes/planificacion-detalle-por-motivo.sql
git commit -m "feat(planificacion): analítica lee los valores por campo y se dan de baja las columnas viejas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Orden de despliegue

`planificacion-detalle-por-motivo.sql` tiene **dos mitades que no van juntas**, separadas en el
archivo por el banner `BLOQUE FINAL`:

1. **Antes de desplegar** — todo lo anterior al banner: agregar `codigo`, sembrarlo y crear
   `pl_ofrecimiento_motivo_campo`. Es todo aditivo: el backend viejo sigue funcionando con estos
   cambios ya aplicados.
2. **Desplegar el backend nuevo.**
3. **Recién ahí, el bloque final** — los `DROP` de `marca`/`competidor`/`pct_diferencia` y de
   `requiere_detalle`. Antes del deploy el modelo Sequelize viejo declara esas columnas y las
   escribe, así que bajarlas antes rompe la app en producción.

El frontend puede desplegarse en cualquier momento después del paso 2: hasta que llegue, la app vieja
manda `valores` vacíos y el backend nuevo los acepta (lista vacía es válida).
