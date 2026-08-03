# Analítica de visitas — Fase 1: front sobre mock

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la vista `/analitica` completa (tres niveles de drill-down) en `app-planificacion`, alimentada por un fixture tipado, para poder iterar el diseño antes de escribir una sola query en el backend.

**Architecture:** Los tipos del contrato viven en `src/types/analitica.ts` y son la única fuente de verdad. `src/api/analitica.ts` es el seam: con `VITE_ANALITICA_MOCK=1` devuelve el fixture, si no pega contra `apiClient`. Ningún componente ni hook sabe que el mock existe. Encima van hooks de React Query, y sobre ellos las tres pantallas.

**Tech Stack:** Vite + React 19 + TypeScript, React Query v5, react-router-dom v6, Tailwind + shadcn/ui, Leaflet 1.9 (ya instalado), Vitest 4 + Testing Library.

## Global Constraints

- **Este plan toca SOLO el repo `app-planificacion`.** El backend es la Fase 2, con su propio plan en `api-vendedores`.
- **No se agregan dependencias.** Nada de MSW, nada de librerías de tablas o de gráficos. Todo con lo que ya está en `package.json`.
- **Spec de referencia:** `docs/superpowers/specs/2026-07-30-analitica-visitas-design.md`. Ante cualquier duda de criterio, manda el spec.
- **Nombres sin acento en código y URLs** (`analitica`, `AnaliticaService`), con acento en el texto visible ("Analítica").
- **Tolerancia GPS: 300 m**, inclusive (`<= 300` es válida).
- **Semáforo relativo:** rojo si el valor es `< 70%` del promedio del equipo. Reglas absolutas: `duracionPromedioMin < 20` y `visitasNoValidadas >= visitasTotales * 0.5`.
- **Nunca mostrar `0%` cuando el dato falta.** `null` se muestra como `s/d` en gris.
- **Indentación de 4 espacios, sin punto y coma** al final de línea, como el resto de `src/`.
- **Idioma:** identificadores y comentarios en español, igual que el código existente.
- Cada tarea termina con `npm test` en verde y un commit.

---

### Task 1: Tipos del contrato y fixture con casos borde

**Files:**
- Create: `src/types/analitica.ts`
- Create: `src/mocks/analiticaMock.ts`
- Test: `src/mocks/analiticaMock.test.ts`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: los tipos `IVendedorMetricas`, `IAnaliticaResumen`, `IVisitaFila`, `IVisitasPage`, `IVisitaDetalle`, `IObjecionesResumen`, `ICoord`, `IAnaliticaFiltro`; y las constantes del fixture `MOCK_RESUMEN`, `MOCK_VISITAS`, `MOCK_DETALLES`, `MOCK_OBJECIONES`.

- [ ] **Step 1: Crear los tipos del contrato**

Crear `src/types/analitica.ts`:

```typescript
import type { ResultadoMotivo, TipoResolucion } from './planificacion'

export interface ICoord {
    lat: number
    lng: number
}

export interface IAnaliticaFiltro {
    /** YYYY-MM-DD */
    desde: string
    /** YYYY-MM-DD */
    hasta: string
    /** Vacío = todos los que el scope del usuario permita. */
    vendedores?: string[]
}

/** Métricas de un vendedor en el rango. La fila PROMEDIOS usa esta misma forma,
 *  así la tabla renderiza ambas con el mismo componente. */
export interface IVendedorMetricas {
    codigoParticularVendedor: string
    nombreVendedor: string

    // Cobertura — denominador = plan congelado de los ciclos que solapan el rango
    planificados: number
    visitados: number
    noVisita: number
    reagendados: number
    pendientes: number
    /** 0..1. null si planificados === 0 (no se muestra 0%). */
    cobertura: number | null
    /** Cuántos de esos ciclos siguen abiertos. > 0 = la cobertura es parcial. */
    ciclosEnCurso: number

    // Actividad y calidad
    visitasTotales: number
    visitasValidas: number
    visitasNoValidadas: number
    /** Cliente sin coords en fct_clients: no se puede verificar, NO cuenta como inválida. */
    visitasSinCoord: number
    /** Duración < 20 min. Informativo: no se resta de visitasValidas. */
    visitasCortas: number
    /** Promedio solo sobre visitas válidas. null si no hay ninguna. */
    duracionPromedioMin: number | null
    minutosTotales: number
    visitasPorDia: number
    clientesDistintos: number

    // Objetivos (pl_objetivo). null = sin objetivo vigente → la UI muestra s/d.
    pctCumplimientoClientes: number | null
    pctCumplimientoMinutos: number | null
    efectividadOperativa: number | null

    // Efectividad comercial
    rubrosOfrecidos: number
    rubrosGanados: number
    rubrosDiferidos: number
    rubrosPerdidos: number
    /** 0..1 = ganados/ofrecidos. null si rubrosOfrecidos === 0. */
    efectividadComercial: number | null
    /** 0..1 = propuestos que se cerraron sin ofrecer. null si no hubo propuestos. */
    pctNoOfrecidos: number | null
    /** Rubros sin resolver en visitas ya cerradas. Mide calidad del dato. */
    rubrosSinResolver: number
}

export interface IAnaliticaResumen {
    desde: string
    hasta: string
    diasHabiles: number
    /** nombreVendedor = 'PROMEDIOS', codigoParticularVendedor = ''. */
    promedios: IVendedorMetricas
    vendedores: IVendedorMetricas[]
}

/** Una fila de la tabla de visitas (nivel 2). */
export interface IVisitaFila {
    visitaId: number
    /** YYYY-MM-DD */
    fecha: string
    /** HH:mm */
    horaInicio: string
    horaFin: string | null
    duracionMin: number | null
    /** null = cliente sin coords → se muestra 's/d', nunca un número absurdo. */
    distanciaMetros: number | null
    codigoParticularCliente: string
    nombreCliente: string
    tipo: TipoResolucion
    /** Descripciones de los motivos, ya resueltas contra el catálogo. */
    motivos: string[]
    /** Resultado dominante de los rubros de la visita. null si no hay rubros resueltos. */
    resultado: ResultadoMotivo | null
}

export interface IVisitasPage {
    total: number
    pagina: number
    cant: number
    visitas: IVisitaFila[]
}

export interface IVisitaRubroMotivoDetalle {
    descripcion: string
    resultado: ResultadoMotivo | null
    marca: string | null
    competidor: string | null
    pctDiferencia: number | null
}

export interface IVisitaRubroDetalle {
    rubroCode: string
    rubroDescripcion: string
    esPropuesto: boolean
    resuelto: boolean
    motivos: IVisitaRubroMotivoDetalle[]
}

/** Nivel 3: el detalle completo de una visita. */
export interface IVisitaDetalle {
    visitaId: number
    codigoParticularCliente: string
    nombreCliente: string
    direccion: string | null
    fechaInicio: string
    fechaFin: string | null
    duracionMin: number | null
    coordInicio: ICoord | null
    coordFinal: ICoord | null
    coordCliente: ICoord | null
    distanciaMetros: number | null
    rubros: IVisitaRubroDetalle[]
}

export interface IObjecionFila {
    motivoId: number
    descripcion: string
    resultado: ResultadoMotivo | null
    cantidad: number
    /** 0..1 sobre el total de motivos del rango. */
    pct: number
}

export interface IObjecionesResumen {
    total: number
    motivos: IObjecionFila[]
}
```

- [ ] **Step 2: Escribir el test del fixture (falla)**

El fixture no vale por ser lindo sino por cubrir los casos que rompen la tabla. El test es lo que garantiza que esos casos no se pierdan cuando alguien lo edite.

Crear `src/mocks/analiticaMock.test.ts`:

```typescript
import { MOCK_RESUMEN, MOCK_VISITAS, MOCK_DETALLES, MOCK_OBJECIONES } from './analiticaMock'

it('tiene al menos 8 vendedores para que la tabla se vea poblada', () => {
    expect(MOCK_RESUMEN.vendedores.length).toBeGreaterThanOrEqual(8)
})

it('la fila de promedios se identifica y no tiene código de vendedor', () => {
    expect(MOCK_RESUMEN.promedios.nombreVendedor).toBe('PROMEDIOS')
    expect(MOCK_RESUMEN.promedios.codigoParticularVendedor).toBe('')
})

it('incluye un vendedor con ciclo en curso y cobertura parcial', () => {
    const v = MOCK_RESUMEN.vendedores.find(v => v.ciclosEnCurso > 0)
    expect(v).toBeDefined()
    expect(v!.cobertura).toBeLessThan(0.6)
})

it('incluye un vendedor con más de la mitad de las visitas no validadas', () => {
    const v = MOCK_RESUMEN.vendedores.find(
        v => v.visitasTotales > 0 && v.visitasNoValidadas >= v.visitasTotales * 0.5,
    )
    expect(v).toBeDefined()
})

it('incluye un vendedor con duración promedio bajo el piso de 20 min', () => {
    const v = MOCK_RESUMEN.vendedores.find(
        v => v.duracionPromedioMin !== null && v.duracionPromedioMin < 20,
    )
    expect(v).toBeDefined()
})

it('incluye un vendedor sin rubros ofrecidos: efectividad null, nunca 0', () => {
    const v = MOCK_RESUMEN.vendedores.find(v => v.rubrosOfrecidos === 0)
    expect(v).toBeDefined()
    expect(v!.efectividadComercial).toBeNull()
})

it('incluye un vendedor sin objetivo vigente', () => {
    const v = MOCK_RESUMEN.vendedores.find(v => v.efectividadOperativa === null)
    expect(v).toBeDefined()
    expect(v!.pctCumplimientoClientes).toBeNull()
})

it('incluye visitas sin coord del cliente, con distancia null', () => {
    const todas = Object.values(MOCK_VISITAS).flat()
    expect(todas.some(v => v.distanciaMetros === null)).toBe(true)
})

it('incluye una visita fuera de la tolerancia de 300 m', () => {
    const todas = Object.values(MOCK_VISITAS).flat()
    expect(todas.some(v => v.distanciaMetros !== null && v.distanciaMetros > 300)).toBe(true)
})

it('todo vendedor del resumen tiene visitas cargadas', () => {
    for (const v of MOCK_RESUMEN.vendedores) {
        expect(MOCK_VISITAS[v.codigoParticularVendedor]).toBeDefined()
    }
})

it('toda visita listada tiene su detalle para el nivel 3', () => {
    const todas = Object.values(MOCK_VISITAS).flat()
    for (const v of todas) {
        expect(MOCK_DETALLES[v.visitaId]).toBeDefined()
    }
})

it('los porcentajes de objeciones suman aproximadamente 1', () => {
    const suma = MOCK_OBJECIONES.motivos.reduce((acc, m) => acc + m.pct, 0)
    expect(suma).toBeGreaterThan(0.98)
    expect(suma).toBeLessThan(1.02)
})
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npm test -- src/mocks/analiticaMock.test.ts`
Expected: FAIL — `Failed to resolve import "./analiticaMock"`.

- [ ] **Step 4: Escribir el fixture**

Crear `src/mocks/analiticaMock.ts`. Los nombres son ficticios; las cifras, verosímiles para una semana de ruta.

```typescript
import type {
    IAnaliticaResumen,
    ICoord,
    IObjecionesResumen,
    IVendedorMetricas,
    IVisitaDetalle,
    IVisitaFila,
} from '@/types/analitica'

/** Arma un vendedor completo a partir de unos pocos números, para que el fixture
 *  se lea y los casos borde queden explícitos en cada override. */
function vendedor(over: Partial<IVendedorMetricas> & {
    codigoParticularVendedor: string
    nombreVendedor: string
}): IVendedorMetricas {
    const base: IVendedorMetricas = {
        codigoParticularVendedor: '',
        nombreVendedor: '',
        planificados: 40,
        visitados: 34,
        noVisita: 4,
        reagendados: 1,
        pendientes: 1,
        cobertura: 0.85,
        ciclosEnCurso: 0,
        visitasTotales: 34,
        visitasValidas: 32,
        visitasNoValidadas: 1,
        visitasSinCoord: 1,
        visitasCortas: 3,
        duracionPromedioMin: 38,
        minutosTotales: 1216,
        visitasPorDia: 6.8,
        clientesDistintos: 32,
        pctCumplimientoClientes: 88,
        pctCumplimientoMinutos: 91,
        efectividadOperativa: 89,
        rubrosOfrecidos: 68,
        rubrosGanados: 27,
        rubrosDiferidos: 19,
        rubrosPerdidos: 22,
        efectividadComercial: 0.4,
        pctNoOfrecidos: 0.18,
        rubrosSinResolver: 2,
    }
    return { ...base, ...over }
}

const VENDEDORES: IVendedorMetricas[] = [
    // El mejor del equipo: sirve de techo para el semáforo relativo.
    vendedor({
        codigoParticularVendedor: 'V1',
        nombreVendedor: 'ACOSTA MARIANO',
        planificados: 42,
        visitados: 41,
        noVisita: 1,
        reagendados: 0,
        pendientes: 0,
        cobertura: 0.976,
        visitasTotales: 41,
        visitasValidas: 40,
        visitasNoValidadas: 1,
        visitasSinCoord: 0,
        visitasCortas: 1,
        duracionPromedioMin: 46,
        minutosTotales: 1886,
        visitasPorDia: 8.2,
        clientesDistintos: 40,
        pctCumplimientoClientes: 104,
        pctCumplimientoMinutos: 108,
        efectividadOperativa: 100,
        rubrosOfrecidos: 92,
        rubrosGanados: 51,
        rubrosDiferidos: 21,
        rubrosPerdidos: 20,
        efectividadComercial: 0.554,
        pctNoOfrecidos: 0.06,
        rubrosSinResolver: 0,
    }),
    vendedor({ codigoParticularVendedor: 'V2', nombreVendedor: 'BENITEZ LAURA' }),
    vendedor({
        codigoParticularVendedor: 'V3',
        nombreVendedor: 'CABRERA DIEGO',
        cobertura: 0.8,
        visitados: 32,
        efectividadComercial: 0.36,
    }),
    // CASO BORDE: ciclo abierto, la semana va por la mitad. Cobertura baja legítima.
    vendedor({
        codigoParticularVendedor: 'V4',
        nombreVendedor: 'DOMINGUEZ SILVINA',
        planificados: 38,
        visitados: 15,
        noVisita: 2,
        reagendados: 0,
        pendientes: 21,
        cobertura: 0.395,
        ciclosEnCurso: 1,
        visitasTotales: 15,
        visitasValidas: 15,
        visitasNoValidadas: 0,
        visitasSinCoord: 0,
        visitasCortas: 1,
        duracionPromedioMin: 41,
        minutosTotales: 615,
        visitasPorDia: 7.5,
        clientesDistintos: 15,
        pctCumplimientoClientes: 46,
        pctCumplimientoMinutos: 44,
        efectividadOperativa: 45,
        rubrosOfrecidos: 31,
        rubrosGanados: 14,
        rubrosDiferidos: 9,
        rubrosPerdidos: 8,
        efectividadComercial: 0.451,
        pctNoOfrecidos: 0.1,
        rubrosSinResolver: 4,
    }),
    // CASO BORDE: más de la mitad de las visitas fuera de los 300 m.
    vendedor({
        codigoParticularVendedor: 'V5',
        nombreVendedor: 'ESQUIVEL RAMON',
        planificados: 40,
        visitados: 30,
        noVisita: 6,
        reagendados: 2,
        pendientes: 2,
        cobertura: 0.75,
        visitasTotales: 30,
        visitasValidas: 12,
        visitasNoValidadas: 17,
        visitasSinCoord: 1,
        visitasCortas: 6,
        duracionPromedioMin: 33,
        minutosTotales: 990,
        visitasPorDia: 6,
        clientesDistintos: 28,
        pctCumplimientoClientes: 72,
        pctCumplimientoMinutos: 70,
        efectividadOperativa: 71,
        rubrosOfrecidos: 48,
        rubrosGanados: 12,
        rubrosDiferidos: 14,
        rubrosPerdidos: 22,
        efectividadComercial: 0.25,
        pctNoOfrecidos: 0.31,
        rubrosSinResolver: 6,
    }),
    // CASO BORDE: visitas demasiado cortas (piso absoluto de 20 min).
    vendedor({
        codigoParticularVendedor: 'V6',
        nombreVendedor: 'FERREYRA GUSTAVO',
        planificados: 44,
        visitados: 39,
        noVisita: 3,
        reagendados: 1,
        pendientes: 1,
        cobertura: 0.886,
        visitasTotales: 39,
        visitasValidas: 37,
        visitasNoValidadas: 2,
        visitasSinCoord: 0,
        visitasCortas: 28,
        duracionPromedioMin: 14,
        minutosTotales: 546,
        visitasPorDia: 7.8,
        clientesDistintos: 37,
        pctCumplimientoClientes: 96,
        pctCumplimientoMinutos: 38,
        efectividadOperativa: 67,
        rubrosOfrecidos: 40,
        rubrosGanados: 9,
        rubrosDiferidos: 11,
        rubrosPerdidos: 20,
        efectividadComercial: 0.225,
        pctNoOfrecidos: 0.44,
        rubrosSinResolver: 9,
    }),
    // CASO BORDE: cerró visitas sin ofrecer un solo rubro → efectividad null, no 0%.
    vendedor({
        codigoParticularVendedor: 'V7',
        nombreVendedor: 'GIMENEZ ROBERTO',
        planificados: 36,
        visitados: 28,
        noVisita: 5,
        reagendados: 1,
        pendientes: 2,
        cobertura: 0.778,
        visitasTotales: 28,
        visitasValidas: 27,
        visitasNoValidadas: 0,
        visitasSinCoord: 1,
        visitasCortas: 4,
        duracionPromedioMin: 35,
        minutosTotales: 980,
        visitasPorDia: 5.6,
        clientesDistintos: 27,
        pctCumplimientoClientes: 70,
        pctCumplimientoMinutos: 69,
        efectividadOperativa: 70,
        rubrosOfrecidos: 0,
        rubrosGanados: 0,
        rubrosDiferidos: 0,
        rubrosPerdidos: 0,
        efectividadComercial: null,
        pctNoOfrecidos: 1,
        rubrosSinResolver: 22,
    }),
    // CASO BORDE: sin objetivo vigente en pl_objetivo → cumplimiento en s/d.
    vendedor({
        codigoParticularVendedor: 'V8',
        nombreVendedor: 'HERRERA NATALIA',
        planificados: 30,
        visitados: 26,
        noVisita: 3,
        reagendados: 0,
        pendientes: 1,
        cobertura: 0.867,
        visitasTotales: 26,
        visitasValidas: 25,
        visitasNoValidadas: 1,
        visitasSinCoord: 0,
        visitasCortas: 2,
        duracionPromedioMin: 44,
        minutosTotales: 1100,
        visitasPorDia: 5.2,
        clientesDistintos: 25,
        pctCumplimientoClientes: null,
        pctCumplimientoMinutos: null,
        efectividadOperativa: null,
        rubrosOfrecidos: 55,
        rubrosGanados: 24,
        rubrosDiferidos: 16,
        rubrosPerdidos: 15,
        efectividadComercial: 0.436,
        pctNoOfrecidos: 0.12,
        rubrosSinResolver: 1,
    }),
    vendedor({
        codigoParticularVendedor: 'V9',
        nombreVendedor: 'IBARRA MARCELO',
        cobertura: 0.9,
        visitados: 36,
        efectividadComercial: 0.48,
    }),
    vendedor({
        codigoParticularVendedor: 'V10',
        nombreVendedor: 'JUAREZ CLAUDIA',
        cobertura: 0.825,
        visitados: 33,
        efectividadComercial: 0.31,
    }),
]

/** Promedio simple sobre los vendedores, ignorando los null (igual que hará el backend). */
function promediar(campo: keyof IVendedorMetricas): number | null {
    const valores = VENDEDORES.map(v => v[campo]).filter(
        (n): n is number => typeof n === 'number',
    )
    if (valores.length === 0) return null
    return valores.reduce((a, b) => a + b, 0) / valores.length
}

const PROMEDIOS: IVendedorMetricas = {
    codigoParticularVendedor: '',
    nombreVendedor: 'PROMEDIOS',
    planificados: promediar('planificados')!,
    visitados: promediar('visitados')!,
    noVisita: promediar('noVisita')!,
    reagendados: promediar('reagendados')!,
    pendientes: promediar('pendientes')!,
    cobertura: promediar('cobertura'),
    ciclosEnCurso: VENDEDORES.reduce((a, v) => a + v.ciclosEnCurso, 0),
    visitasTotales: promediar('visitasTotales')!,
    visitasValidas: promediar('visitasValidas')!,
    visitasNoValidadas: promediar('visitasNoValidadas')!,
    visitasSinCoord: promediar('visitasSinCoord')!,
    visitasCortas: promediar('visitasCortas')!,
    duracionPromedioMin: promediar('duracionPromedioMin'),
    minutosTotales: promediar('minutosTotales')!,
    visitasPorDia: promediar('visitasPorDia')!,
    clientesDistintos: promediar('clientesDistintos')!,
    pctCumplimientoClientes: promediar('pctCumplimientoClientes'),
    pctCumplimientoMinutos: promediar('pctCumplimientoMinutos'),
    efectividadOperativa: promediar('efectividadOperativa'),
    rubrosOfrecidos: promediar('rubrosOfrecidos')!,
    rubrosGanados: promediar('rubrosGanados')!,
    rubrosDiferidos: promediar('rubrosDiferidos')!,
    rubrosPerdidos: promediar('rubrosPerdidos')!,
    efectividadComercial: promediar('efectividadComercial'),
    pctNoOfrecidos: promediar('pctNoOfrecidos'),
    rubrosSinResolver: promediar('rubrosSinResolver')!,
}

export const MOCK_RESUMEN: IAnaliticaResumen = {
    desde: '2026-07-20',
    hasta: '2026-07-24',
    diasHabiles: 5,
    promedios: PROMEDIOS,
    vendedores: VENDEDORES,
}

const CLIENTES = [
    'CALDERON ALEJANDRO PABLO',
    'VITALE ALEJANDRO ALBERTO',
    'ROMERO GABRIELA DEL VALLE',
    'OSANO ALDO MARIO',
    'NOVO OSCAR ORESTE',
    'ASTEGIANO ORLANDO MIGUEL',
    'TABORA EMANUEL',
    'PERAZZO LUIS ARMANDO',
    'BRANCHESI SERGIO ARIEL',
    'GIAVENO ARIEL FRANCISCO',
]

const MOTIVOS_RUBRO = [
    { descripcion: 'Saqué pedido', resultado: 'ganado' as const },
    { descripcion: 'Pasa pedido mañana', resultado: 'diferido' as const },
    { descripcion: 'Precio', resultado: 'perdido' as const },
    { descripcion: 'Flete', resultado: 'perdido' as const },
    { descripcion: 'No lo ofreció', resultado: 'no_ofrecido' as const },
]

let seqVisita = 1000

/** Genera visitas deterministas para un vendedor. Los índices elegidos fuerzan los
 *  casos borde: la 3ra visita de cada vendedor va sin coord del cliente, y la 5ta
 *  cae fuera de la tolerancia de 300 m. */
function visitasDe(codigo: string, cantidad: number): IVisitaFila[] {
    const filas: IVisitaFila[] = []
    for (let i = 0; i < cantidad; i++) {
        const dia = 20 + (i % 5)
        const hora = 9 + (i % 8)
        const duracion = codigo === 'V6' ? 12 + (i % 6) : 25 + ((i * 7) % 45)
        let distancia: number | null = 15 + ((i * 23) % 120)
        if (i % 7 === 2) distancia = null
        else if (i % 5 === 4) distancia = 4200 + i * 130
        const motivo = MOTIVOS_RUBRO[i % MOTIVOS_RUBRO.length]
        filas.push({
            visitaId: seqVisita++,
            fecha: `2026-07-${String(dia).padStart(2, '0')}`,
            horaInicio: `${String(hora).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}`,
            horaFin: `${String(hora + 1).padStart(2, '0')}:00`,
            duracionMin: duracion,
            distanciaMetros: distancia,
            codigoParticularCliente: `C${1000 + i}`,
            nombreCliente: CLIENTES[i % CLIENTES.length],
            tipo: 'visita',
            motivos: [motivo.descripcion],
            resultado: codigo === 'V7' ? null : motivo.resultado,
        })
    }
    return filas
}

export const MOCK_VISITAS: Record<string, IVisitaFila[]> = Object.fromEntries(
    VENDEDORES.map(v => [v.codigoParticularVendedor, visitasDe(v.codigoParticularVendedor, 12)]),
)

/** Coord base (Rosario) para que el mapa del nivel 3 tenga algo verosímil. */
const BASE: ICoord = { lat: -32.9442, lng: -60.6505 }

function detalleDe(fila: IVisitaFila, indice: number): IVisitaDetalle {
    const sinCoordCliente = fila.distanciaMetros === null
    const desvio = fila.distanciaMetros === null ? 0 : fila.distanciaMetros / 111_000
    return {
        visitaId: fila.visitaId,
        codigoParticularCliente: fila.codigoParticularCliente,
        nombreCliente: fila.nombreCliente,
        direccion: sinCoordCliente ? null : `Av. Pellegrini ${1200 + indice * 37}`,
        fechaInicio: `${fila.fecha}T${fila.horaInicio}:00`,
        fechaFin: fila.horaFin ? `${fila.fecha}T${fila.horaFin}:00` : null,
        duracionMin: fila.duracionMin,
        coordInicio: {
            lat: BASE.lat + indice * 0.002 + desvio,
            lng: BASE.lng + indice * 0.002,
        },
        coordFinal: {
            lat: BASE.lat + indice * 0.002 + desvio + 0.0002,
            lng: BASE.lng + indice * 0.002 + 0.0002,
        },
        coordCliente: sinCoordCliente
            ? null
            : { lat: BASE.lat + indice * 0.002, lng: BASE.lng + indice * 0.002 },
        distanciaMetros: fila.distanciaMetros,
        rubros: [
            {
                rubroCode: 'R01',
                rubroDescripcion: 'Lubricantes',
                esPropuesto: true,
                resuelto: fila.resultado !== null,
                motivos:
                    fila.resultado === null
                        ? []
                        : [
                              {
                                  descripcion: fila.motivos[0],
                                  resultado: fila.resultado,
                                  marca: fila.resultado === 'perdido' ? 'YPF' : null,
                                  competidor: fila.resultado === 'perdido' ? 'Shell' : null,
                                  pctDiferencia: fila.resultado === 'perdido' ? 12 : null,
                              },
                          ],
            },
            {
                rubroCode: 'R02',
                rubroDescripcion: 'Filtros',
                esPropuesto: true,
                resuelto: false,
                motivos: [],
            },
        ],
    }
}

export const MOCK_DETALLES: Record<number, IVisitaDetalle> = Object.fromEntries(
    Object.values(MOCK_VISITAS)
        .flat()
        .map((fila, i) => [fila.visitaId, detalleDe(fila, i % 20)]),
)

export const MOCK_OBJECIONES: IObjecionesResumen = {
    total: 486,
    motivos: [
        { motivoId: 1, descripcion: 'Saqué pedido', resultado: 'ganado', cantidad: 174, pct: 0.358 },
        { motivoId: 2, descripcion: 'Precio', resultado: 'perdido', cantidad: 98, pct: 0.202 },
        { motivoId: 3, descripcion: 'Pasa pedido mañana', resultado: 'diferido', cantidad: 71, pct: 0.146 },
        { motivoId: 4, descripcion: 'Tiene stock', resultado: 'perdido', cantidad: 54, pct: 0.111 },
        { motivoId: 5, descripcion: 'Flete', resultado: 'perdido', cantidad: 38, pct: 0.078 },
        { motivoId: 6, descripcion: 'Compra a competidor', resultado: 'perdido', cantidad: 29, pct: 0.06 },
        { motivoId: 7, descripcion: 'DS', resultado: 'perdido', cantidad: 22, pct: 0.045 },
    ],
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test -- src/mocks/analiticaMock.test.ts`
Expected: PASS, 12 tests.

Si falla el de "los porcentajes suman aproximadamente 1", ajustar los `pct` de `MOCK_OBJECIONES` — no relajar el test.

- [ ] **Step 6: Commit**

```bash
git add src/types/analitica.ts src/mocks/analiticaMock.ts src/mocks/analiticaMock.test.ts
git commit -m "feat(analitica): contrato tipado y fixture con casos borde"
```

---

### Task 2: Capa API con el flag de mock

**Files:**
- Create: `src/api/analitica.ts`
- Test: `src/api/analitica.test.ts`
- Modify: `.env-example`, `.env`

**Interfaces:**
- Consumes: los tipos y constantes de la Task 1.
- Produces: `getResumen(filtro)`, `getVisitas(args)`, `getVisitaDetalle(visitaId)`, `getObjeciones(args)` — las cuatro funciones que consumen los hooks.

- [ ] **Step 1: Escribir el test (falla)**

Crear `src/api/analitica.test.ts`:

```typescript
import { vi } from 'vitest'
import { getResumen, getVisitas, getVisitaDetalle, getObjeciones } from './analitica'
import { MOCK_RESUMEN, MOCK_VISITAS } from '@/mocks/analiticaMock'

// El fixture está activo por defecto en tests (VITE_ANALITICA_MOCK=1 en .env).
const FILTRO = { desde: '2026-07-20', hasta: '2026-07-24' }

it('getResumen devuelve el fixture completo cuando no se filtra por vendedor', async () => {
    const res = await getResumen(FILTRO)
    expect(res.vendedores).toHaveLength(MOCK_RESUMEN.vendedores.length)
})

it('getResumen filtra por los vendedores pedidos', async () => {
    const res = await getResumen({ ...FILTRO, vendedores: ['V1', 'V4'] })
    expect(res.vendedores.map(v => v.codigoParticularVendedor)).toEqual(['V1', 'V4'])
})

it('getResumen recalcula los promedios sobre los vendedores filtrados', async () => {
    const res = await getResumen({ ...FILTRO, vendedores: ['V1'] })
    expect(res.promedios.cobertura).toBeCloseTo(MOCK_RESUMEN.vendedores[0].cobertura!, 5)
})

it('getResumen devuelve la lista vacía si el rango no tiene datos', async () => {
    const res = await getResumen({ desde: '2020-01-01', hasta: '2020-01-05' })
    expect(res.vendedores).toHaveLength(0)
})

it('getVisitas devuelve las visitas del vendedor pedido', async () => {
    const res = await getVisitas({ ...FILTRO, vendedor: 'V1' })
    expect(res.visitas).toHaveLength(MOCK_VISITAS['V1'].length)
    expect(res.total).toBe(MOCK_VISITAS['V1'].length)
})

it('getVisitas filtra por nombre de cliente sin distinguir mayúsculas', async () => {
    const res = await getVisitas({ ...FILTRO, vendedor: 'V1', cliente: 'osano' })
    expect(res.visitas.length).toBeGreaterThan(0)
    expect(res.visitas.every(v => v.nombreCliente.toLowerCase().includes('osano'))).toBe(true)
})

it('getVisitaDetalle devuelve el detalle de una visita existente', async () => {
    const id = MOCK_VISITAS['V1'][0].visitaId
    const det = await getVisitaDetalle(id)
    expect(det.visitaId).toBe(id)
    expect(det.rubros.length).toBeGreaterThan(0)
})

it('getVisitaDetalle rechaza un id inexistente', async () => {
    await expect(getVisitaDetalle(999999)).rejects.toThrow('Visita no encontrada')
})

it('getObjeciones devuelve el ranking ordenado de mayor a menor', async () => {
    const res = await getObjeciones(FILTRO)
    const cantidades = res.motivos.map(m => m.cantidad)
    expect([...cantidades].sort((a, b) => b - a)).toEqual(cantidades)
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/api/analitica.test.ts`
Expected: FAIL — `Failed to resolve import "./analitica"`.

- [ ] **Step 3: Escribir la capa API**

Crear `src/api/analitica.ts`. Es el único archivo que sabe que el mock existe:

```typescript
import { apiClient } from './apiClient'
import {
    MOCK_DETALLES,
    MOCK_OBJECIONES,
    MOCK_RESUMEN,
    MOCK_VISITAS,
} from '@/mocks/analiticaMock'
import type {
    IAnaliticaFiltro,
    IAnaliticaResumen,
    IObjecionesResumen,
    IVendedorMetricas,
    IVisitaDetalle,
    IVisitasPage,
} from '@/types/analitica'

const USA_MOCK = import.meta.env.VITE_ANALITICA_MOCK === '1'

/** Delay solo en dev, para que los estados de carga se vean mientras se itera.
 *  En tests es 0: nadie quiere esperar 250 ms por caso. */
const DELAY_MS = import.meta.env.DEV ? 250 : 0

const esperar = () => new Promise(r => setTimeout(r, DELAY_MS))

/** El fixture cubre una sola semana. Fuera de ese rango se devuelve vacío, así el
 *  estado "no hay ciclos entre X e Y" se puede probar moviendo el datepicker. */
function dentroDelRango(filtro: IAnaliticaFiltro): boolean {
    return filtro.desde <= MOCK_RESUMEN.hasta && filtro.hasta >= MOCK_RESUMEN.desde
}

function promediarCampo(
    vendedores: IVendedorMetricas[],
    campo: keyof IVendedorMetricas,
): number | null {
    const valores = vendedores
        .map(v => v[campo])
        .filter((n): n is number => typeof n === 'number')
    if (valores.length === 0) return null
    return valores.reduce((a, b) => a + b, 0) / valores.length
}

/** Los promedios tienen que corresponder a los vendedores en pantalla: si gerencia
 *  filtra 3 vendedores, el semáforo debe compararlos entre ellos, no contra el equipo. */
function recalcularPromedios(vendedores: IVendedorMetricas[]): IVendedorMetricas {
    const salida = { ...MOCK_RESUMEN.promedios }
    for (const clave of Object.keys(salida) as (keyof IVendedorMetricas)[]) {
        if (clave === 'codigoParticularVendedor' || clave === 'nombreVendedor') continue
        const promedio = promediarCampo(vendedores, clave)
        // @ts-expect-error asignación dinámica sobre campos numéricos del mismo tipo
        salida[clave] = promedio
    }
    salida.ciclosEnCurso = vendedores.reduce((a, v) => a + v.ciclosEnCurso, 0)
    return salida
}

export const getResumen = async (filtro: IAnaliticaFiltro): Promise<IAnaliticaResumen> => {
    if (USA_MOCK) {
        await esperar()
        const vendedores = !dentroDelRango(filtro)
            ? []
            : MOCK_RESUMEN.vendedores.filter(
                  v =>
                      !filtro.vendedores?.length ||
                      filtro.vendedores.includes(v.codigoParticularVendedor),
              )
        return {
            desde: filtro.desde,
            hasta: filtro.hasta,
            diasHabiles: MOCK_RESUMEN.diasHabiles,
            promedios: recalcularPromedios(vendedores),
            vendedores,
        }
    }
    const res = await apiClient.get('/planificacion/analitica/resumen', { params: filtro })
    return res.data.data
}

export interface IVisitasArgs extends IAnaliticaFiltro {
    vendedor: string
    cliente?: string
    pagina?: number
    cant?: number
}

export const getVisitas = async (args: IVisitasArgs): Promise<IVisitasPage> => {
    if (USA_MOCK) {
        await esperar()
        const todas = dentroDelRango(args) ? (MOCK_VISITAS[args.vendedor] ?? []) : []
        const busqueda = args.cliente?.trim().toLowerCase()
        const visitas = busqueda
            ? todas.filter(v => v.nombreCliente.toLowerCase().includes(busqueda))
            : todas
        return { total: visitas.length, pagina: args.pagina ?? 1, cant: visitas.length, visitas }
    }
    const res = await apiClient.get('/planificacion/analitica/visitas', { params: args })
    return res.data.data
}

export const getVisitaDetalle = async (visitaId: number): Promise<IVisitaDetalle> => {
    if (USA_MOCK) {
        await esperar()
        const detalle = MOCK_DETALLES[visitaId]
        if (!detalle) throw new Error('Visita no encontrada')
        return detalle
    }
    const res = await apiClient.get(`/planificacion/analitica/visitas/${visitaId}`)
    return res.data.data
}

export interface IObjecionesArgs extends IAnaliticaFiltro {
    zona?: string
    rubro?: string
}

export const getObjeciones = async (args: IObjecionesArgs): Promise<IObjecionesResumen> => {
    if (USA_MOCK) {
        await esperar()
        if (!dentroDelRango(args)) return { total: 0, motivos: [] }
        return {
            ...MOCK_OBJECIONES,
            motivos: [...MOCK_OBJECIONES.motivos].sort((a, b) => b.cantidad - a.cantidad),
        }
    }
    const res = await apiClient.get('/planificacion/analitica/objeciones', { params: args })
    return res.data.data
}
```

- [ ] **Step 4: Activar el flag en el entorno**

Agregar al final de `.env-example`:

```
# Alimenta /analitica con el fixture de src/mocks/analiticaMock.ts en lugar del backend.
# Fase 1: en 1. Se apaga cuando api-vendedores exponga /planificacion/analitica/*.
VITE_ANALITICA_MOCK=1
```

Agregar la misma línea `VITE_ANALITICA_MOCK=1` a `.env` (no se commitea, pero hace falta para `npm run dev` y para que los tests corran contra el fixture).

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test -- src/api/analitica.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/api/analitica.ts src/api/analitica.test.ts .env-example
git commit -m "feat(analitica): capa api con seam de mock detrás de VITE_ANALITICA_MOCK"
```

---

### Task 3: Hooks de React Query

**Files:**
- Create: `src/hooks/useAnalitica.ts`
- Test: `src/hooks/useAnalitica.test.tsx`

**Interfaces:**
- Consumes: `getResumen`, `getVisitas`, `getVisitaDetalle`, `getObjeciones` de la Task 2.
- Produces: `analiticaKeys`, `useResumen(filtro)`, `useVisitas(args)`, `useVisitaDetalle(visitaId | null)`, `useObjeciones(args)`.

- [ ] **Step 1: Escribir el test (falla)**

Crear `src/hooks/useAnalitica.test.tsx`, siguiendo el patrón de `useCiclo.test.tsx`:

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useResumen, useVisitas, useVisitaDetalle, useObjeciones } from './useAnalitica'
import * as api from '@/api/analitica'

vi.mock('@/api/analitica')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const FILTRO = { desde: '2026-07-20', hasta: '2026-07-24' }

beforeEach(() => vi.clearAllMocks())

it('useResumen pide el resumen con el filtro recibido', async () => {
    ;(api.getResumen as any).mockResolvedValue({ vendedores: [], promedios: {} })
    const { result } = renderHook(() => useResumen(FILTRO), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getResumen).toHaveBeenCalledWith(FILTRO)
})

it('useVisitas no consulta si no hay vendedor elegido', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ visitas: [] })
    const { result } = renderHook(() => useVisitas({ ...FILTRO, vendedor: '' }), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getVisitas).not.toHaveBeenCalled()
})

it('useVisitaDetalle no consulta con id null', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue({ visitaId: 1 })
    const { result } = renderHook(() => useVisitaDetalle(null), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getVisitaDetalle).not.toHaveBeenCalled()
})

it('useVisitaDetalle pide el detalle del id indicado', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue({ visitaId: 1000 })
    const { result } = renderHook(() => useVisitaDetalle(1000), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getVisitaDetalle).toHaveBeenCalledWith(1000)
})

it('useObjeciones pide el ranking con zona y rubro', async () => {
    ;(api.getObjeciones as any).mockResolvedValue({ total: 0, motivos: [] })
    const args = { ...FILTRO, zona: 'NORTE', rubro: 'R01' }
    const { result } = renderHook(() => useObjeciones(args), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getObjeciones).toHaveBeenCalledWith(args)
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/hooks/useAnalitica.test.tsx`
Expected: FAIL — `Failed to resolve import "./useAnalitica"`.

- [ ] **Step 3: Escribir los hooks**

Crear `src/hooks/useAnalitica.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import {
    getObjeciones,
    getResumen,
    getVisitaDetalle,
    getVisitas,
    type IObjecionesArgs,
    type IVisitasArgs,
} from '@/api/analitica'
import type { IAnaliticaFiltro } from '@/types/analitica'

export const analiticaKeys = {
    resumen: (f: IAnaliticaFiltro) =>
        ['analitica', 'resumen', f.desde, f.hasta, (f.vendedores ?? []).join(',')] as const,
    visitas: (a: IVisitasArgs) =>
        ['analitica', 'visitas', a.vendedor, a.desde, a.hasta, a.cliente ?? ''] as const,
    detalle: (id: number) => ['analitica', 'visita', id] as const,
    objeciones: (a: IObjecionesArgs) =>
        ['analitica', 'objeciones', a.desde, a.hasta, a.zona ?? '', a.rubro ?? ''] as const,
}

export function useResumen(filtro: IAnaliticaFiltro) {
    return useQuery({
        queryKey: analiticaKeys.resumen(filtro),
        queryFn: () => getResumen(filtro),
    })
}

/** Sin vendedor no hay nada que pedir: el nivel 2 se monta recién al elegir uno. */
export function useVisitas(args: IVisitasArgs) {
    return useQuery({
        queryKey: analiticaKeys.visitas(args),
        queryFn: () => getVisitas(args),
        enabled: Boolean(args.vendedor),
    })
}

export function useVisitaDetalle(visitaId: number | null) {
    return useQuery({
        queryKey: analiticaKeys.detalle(visitaId ?? 0),
        queryFn: () => getVisitaDetalle(visitaId as number),
        enabled: visitaId !== null,
    })
}

export function useObjeciones(args: IObjecionesArgs) {
    return useQuery({
        queryKey: analiticaKeys.objeciones(args),
        queryFn: () => getObjeciones(args),
    })
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/hooks/useAnalitica.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAnalitica.ts src/hooks/useAnalitica.test.tsx
git commit -m "feat(analitica): hooks de react query para resumen, visitas y objeciones"
```

---

### Task 4: Acceso por rol — hoy gerencia no puede ni entrar

**Files:**
- Modify: `src/context/AuthContext.tsx:34-50`
- Create: `src/lib/roles.ts`
- Test: `src/lib/roles.test.ts`, `src/context/AuthContext.test.tsx`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `ROLES_ANALITICA`, `esRolAnalitica(rol)`, `esRolVendedor(rol)`, y el campo `rutaInicial` en el contexto de auth (`'/'` para vendedor, `'/analitica'` para los roles analíticos).

**Contexto:** `AuthContext.tsx:38` manda a `/sin-permisos` a **todo el que no sea `vendedor`**. Sin este cambio, un usuario `versus-ger` no puede abrir la app, y la pantalla nueva es inalcanzable. Los roles salen de `api-vendedores/src/config/roles.ts`: `admin`, `versus-ger` y `supervisor` son los de scope `unrestricted`.

- [ ] **Step 1: Escribir el test de los roles (falla)**

Crear `src/lib/roles.test.ts`:

```typescript
import { esRolAnalitica, esRolVendedor, rutaInicialPara } from './roles'

it('reconoce los roles con scope unrestricted de api-vendedores', () => {
    expect(esRolAnalitica('admin')).toBe(true)
    expect(esRolAnalitica('versus-ger')).toBe(true)
    expect(esRolAnalitica('supervisor')).toBe(true)
})

it('no le da acceso analítico al vendedor', () => {
    expect(esRolAnalitica('vendedor')).toBe(false)
    expect(esRolVendedor('vendedor')).toBe(true)
})

it('ignora mayúsculas y espacios, como authorize() en el backend', () => {
    expect(esRolAnalitica(' VERSUS-GER ')).toBe(true)
    expect(esRolVendedor('Vendedor')).toBe(true)
})

it('un rol desconocido no accede a nada', () => {
    expect(esRolAnalitica('marketing')).toBe(false)
    expect(esRolVendedor('marketing')).toBe(false)
})

it('manda a cada rol a su pantalla', () => {
    expect(rutaInicialPara('vendedor')).toBe('/')
    expect(rutaInicialPara('versus-ger')).toBe('/analitica')
    expect(rutaInicialPara('marketing')).toBeNull()
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/lib/roles.test.ts`
Expected: FAIL — `Failed to resolve import "./roles"`.

- [ ] **Step 3: Escribir el módulo de roles**

Crear `src/lib/roles.ts`:

```typescript
/** Los roles de scope 'unrestricted' en api-vendedores/src/config/roles.ts.
 *  Si allá se agrega uno nuevo con ese scope, hay que sumarlo acá. */
export const ROLES_ANALITICA = ['admin', 'versus-ger', 'supervisor'] as const

const normalizar = (rol: string | undefined | null) => (rol ?? '').trim().toLowerCase()

export const esRolAnalitica = (rol: string | undefined | null): boolean =>
    (ROLES_ANALITICA as readonly string[]).includes(normalizar(rol))

export const esRolVendedor = (rol: string | undefined | null): boolean =>
    normalizar(rol) === 'vendedor'

/** La pantalla donde arranca cada rol. null = sin acceso a la app. */
export const rutaInicialPara = (rol: string | undefined | null): string | null => {
    if (esRolVendedor(rol)) return '/'
    if (esRolAnalitica(rol)) return '/analitica'
    return null
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- src/lib/roles.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Escribir el test del AuthContext (falla)**

Crear `src/context/AuthContext.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import * as authApi from '@/api/authApi'

vi.mock('@/api/authApi')

function Sonda() {
    const { status, rutaInicial } = useAuth()
    return (
        <div>
            <span data-testid="status">{status}</span>
            <span data-testid="ruta">{rutaInicial ?? 'ninguna'}</span>
        </div>
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('access_token', 'token-de-prueba')
})

afterEach(() => localStorage.clear())

it('el vendedor entra y arranca en la agenda', async () => {
    ;(authApi.getMe as any).mockResolvedValue({ name: 'Vendedor', rol: 'vendedor' })
    render(
        <AuthProvider>
            <Sonda />
        </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('ruta')).toHaveTextContent('/')
})

it('un rol analítico entra y arranca en /analitica', async () => {
    ;(authApi.getMe as any).mockResolvedValue({ name: 'Gerencia', rol: 'versus-ger' })
    render(
        <AuthProvider>
            <Sonda />
        </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('ruta')).toHaveTextContent('/analitica')
})

it('un rol sin acceso queda en unauthorized', async () => {
    ;(authApi.getMe as any).mockResolvedValue({ name: 'Marketing', rol: 'marketing' })
    render(
        <AuthProvider>
            <Sonda />
        </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthorized'))
})
```

- [ ] **Step 6: Correr el test para verificar que falla**

Run: `npm test -- src/context/AuthContext.test.tsx`
Expected: FAIL — el rol `versus-ger` termina en `unauthorized`, y `rutaInicial` no existe en el contexto.

- [ ] **Step 7: Ampliar el AuthContext**

En `src/context/AuthContext.tsx`, agregar el import:

```typescript
import { rutaInicialPara } from '@/lib/roles'
```

Agregar `rutaInicial` a la interfaz del contexto:

```typescript
interface AuthContextValue {
    status: AuthStatus
    user: AuthUser | null
    /** Pantalla donde arranca el rol logueado. null si no tiene acceso. */
    rutaInicial: string | null
    loginError: string | null
    loginLoading: boolean
    login: (email: string, password: string) => Promise<void>
    logout: () => void
}
```

Reemplazar el bloque de `validateAndSetUser` (líneas 34-50) por:

```typescript
    async function validateAndSetUser(token: string) {
        try {
            const me = await getMe(token)
            const authUser = { name: me.name, rol: me.rol }
            setUser(authUser)
            // El rol define a qué pantalla entra: el vendedor a su agenda, los roles
            // analíticos a /analitica. Cualquier otro no tiene nada que hacer acá.
            setStatus(rutaInicialPara(me.rol) === null ? 'unauthorized' : 'authenticated')
        } catch {
            localStorage.removeItem('access_token')
            setUser(null)
            setStatus('unauthenticated')
        }
    }
```

Y exponer `rutaInicial` en el provider:

```typescript
    return (
        <AuthContext.Provider
            value={{
                status,
                user,
                rutaInicial: rutaInicialPara(user?.rol),
                loginError,
                loginLoading,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
```

- [ ] **Step 8: Correr toda la suite**

Run: `npm test`
Expected: PASS. Si algún test existente de `LoginPage` o `ProtectedRoute` rompe por el cambio de contrato del contexto, actualizarlo — el comportamiento nuevo es el correcto.

- [ ] **Step 9: Commit**

```bash
git add src/lib/roles.ts src/lib/roles.test.ts src/context/AuthContext.tsx src/context/AuthContext.test.tsx
git commit -m "feat(analitica): habilitar el acceso de los roles analiticos a la app"
```

---

### Task 5: Helpers de formato y semáforo

**Files:**
- Create: `src/lib/analiticaFormat.ts`
- Test: `src/lib/analiticaFormat.test.ts`

**Interfaces:**
- Consumes: los tipos de la Task 1.
- Produces: `TOLERANCIA_METROS`, `formatPct`, `formatNumero`, `formatDistancia`, `formatDuracion`, `esBajoPromedio`, `claseDistancia`, `alertasAbsolutas`.

**Contexto:** acá vive la regla del 70% y las dos absolutas. Está aislado del render para poder testear el criterio sin montar una tabla.

- [ ] **Step 1: Escribir el test (falla)**

Crear `src/lib/analiticaFormat.test.ts`:

```typescript
import {
    TOLERANCIA_METROS,
    alertasAbsolutas,
    claseDistancia,
    esBajoPromedio,
    formatDistancia,
    formatDuracion,
    formatNumero,
    formatPct,
} from './analiticaFormat'

it('la tolerancia es de 300 m', () => {
    expect(TOLERANCIA_METROS).toBe(300)
})

it('formatPct muestra s/d cuando el dato falta, nunca 0%', () => {
    expect(formatPct(null)).toBe('s/d')
    expect(formatPct(0.554)).toBe('55%')
    expect(formatPct(1)).toBe('100%')
})

it('formatNumero redondea a un decimal y respeta el null', () => {
    expect(formatNumero(6.83)).toBe('6,8')
    expect(formatNumero(34)).toBe('34')
    expect(formatNumero(null)).toBe('s/d')
})

it('formatDistancia muestra s/d cuando el cliente no tiene coords', () => {
    expect(formatDistancia(null)).toBe('s/d')
    expect(formatDistancia(45)).toBe('45 m')
    expect(formatDistancia(7307510)).toBe('7307510 m')
})

it('formatDuracion redondea a minutos enteros', () => {
    expect(formatDuracion(38)).toBe('38 min')
    expect(formatDuracion(null)).toBe('s/d')
})

it('claseDistancia pinta verde dentro de la tolerancia, inclusive en el límite', () => {
    expect(claseDistancia(299)).toBe('ok')
    expect(claseDistancia(300)).toBe('ok')
    expect(claseDistancia(301)).toBe('alerta')
})

it('claseDistancia devuelve neutro cuando no hay dato: no es culpa del vendedor', () => {
    expect(claseDistancia(null)).toBe('neutro')
})

it('esBajoPromedio marca por debajo del 70% del promedio del equipo', () => {
    expect(esBajoPromedio(6, 10)).toBe(true)
    expect(esBajoPromedio(7, 10)).toBe(false)
    expect(esBajoPromedio(12, 10)).toBe(false)
})

it('esBajoPromedio no marca nada si falta algún dato', () => {
    expect(esBajoPromedio(null, 10)).toBe(false)
    expect(esBajoPromedio(6, null)).toBe(false)
    expect(esBajoPromedio(6, 0)).toBe(false)
})

it('alertasAbsolutas detecta duración bajo 20 min', () => {
    const alertas = alertasAbsolutas({ duracionPromedioMin: 14, visitasTotales: 39, visitasNoValidadas: 2 })
    expect(alertas).toContain('duracion')
})

it('alertasAbsolutas detecta la mitad o más de visitas no validadas', () => {
    const alertas = alertasAbsolutas({ duracionPromedioMin: 33, visitasTotales: 30, visitasNoValidadas: 17 })
    expect(alertas).toContain('geo')
})

it('alertasAbsolutas no marca nada en un vendedor sano', () => {
    const alertas = alertasAbsolutas({ duracionPromedioMin: 46, visitasTotales: 41, visitasNoValidadas: 1 })
    expect(alertas).toEqual([])
})

it('alertasAbsolutas no marca geo sin visitas: 0 de 0 no es una alerta', () => {
    const alertas = alertasAbsolutas({ duracionPromedioMin: null, visitasTotales: 0, visitasNoValidadas: 0 })
    expect(alertas).toEqual([])
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/lib/analiticaFormat.test.ts`
Expected: FAIL — `Failed to resolve import "./analiticaFormat"`.

- [ ] **Step 3: Escribir los helpers**

Crear `src/lib/analiticaFormat.ts`:

```typescript
/** Tolerancia heredada de api-mobiliza (TOLERANCIA_GEOLOCALIZACION). Inclusive. */
export const TOLERANCIA_METROS = 300

/** Un valor está en rojo si cae por debajo del 70% del promedio del equipo. */
const PISO_RELATIVO = 0.7

/** Piso absoluto de duración, heredado de mobiliza. */
const PISO_DURACION_MIN = 20

/** s/d en vez de 0%: un dato ausente no es un cero. */
export const formatPct = (valor: number | null): string =>
    valor === null ? 's/d' : `${Math.round(valor * 100)}%`

export const formatNumero = (valor: number | null): string => {
    if (valor === null) return 's/d'
    const redondeado = Math.round(valor * 10) / 10
    return Number.isInteger(redondeado)
        ? String(redondeado)
        : String(redondeado).replace('.', ',')
}

export const formatDistancia = (metros: number | null): string =>
    metros === null ? 's/d' : `${Math.round(metros)} m`

export const formatDuracion = (minutos: number | null): string =>
    minutos === null ? 's/d' : `${Math.round(minutos)} min`

export type ClaseDistancia = 'ok' | 'alerta' | 'neutro'

/** Sin coord del cliente la visita no es verificable: se muestra neutra, no en rojo.
 *  Castigarla haría que el indicador mida la calidad de fct_clients, no el trabajo. */
export const claseDistancia = (metros: number | null): ClaseDistancia => {
    if (metros === null) return 'neutro'
    return metros <= TOLERANCIA_METROS ? 'ok' : 'alerta'
}

export const esBajoPromedio = (valor: number | null, promedio: number | null): boolean => {
    if (valor === null || promedio === null || promedio <= 0) return false
    return valor < promedio * PISO_RELATIVO
}

export type AlertaAbsoluta = 'duracion' | 'geo'

/** Las dos reglas que no dependen del equipo: si todo el equipo hace visitas de
 *  10 minutos, el semáforo relativo no marcaría a nadie. */
export const alertasAbsolutas = (v: {
    duracionPromedioMin: number | null
    visitasTotales: number
    visitasNoValidadas: number
}): AlertaAbsoluta[] => {
    const alertas: AlertaAbsoluta[] = []
    if (v.duracionPromedioMin !== null && v.duracionPromedioMin < PISO_DURACION_MIN) {
        alertas.push('duracion')
    }
    if (v.visitasTotales > 0 && v.visitasNoValidadas >= v.visitasTotales * 0.5) {
        alertas.push('geo')
    }
    return alertas
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/lib/analiticaFormat.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analiticaFormat.ts src/lib/analiticaFormat.test.ts
git commit -m "feat(analitica): helpers de formato y criterios de semaforo"
```

---

### Task 6: Filtros con estado en la URL

**Files:**
- Create: `src/components/analitica/FiltrosAnalitica.tsx`
- Create: `src/hooks/useFiltroAnalitica.ts`
- Test: `src/hooks/useFiltroAnalitica.test.tsx`, `src/components/analitica/FiltrosAnalitica.test.tsx`

**Interfaces:**
- Consumes: `IAnaliticaFiltro` (Task 1).
- Produces: `useFiltroAnalitica()` → `{ filtro, setRango, toggleVendedor, limpiarVendedores }`; y el componente `FiltrosAnalitica` con props `{ filtro, vendedoresDisponibles, onRango, onToggleVendedor, onLimpiar }`.

**Contexto:** el estado vive en la query string (`?desde=&hasta=&vendedores=`) para que gerencia pueda mandar el link de un estado puntual, como pide el spec.

- [ ] **Step 1: Escribir el test del hook (falla)**

Crear `src/hooks/useFiltroAnalitica.test.tsx`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useFiltroAnalitica } from './useFiltroAnalitica'

function wrapperCon(ruta: string) {
    return ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter initialEntries={[ruta]}>{children}</MemoryRouter>
    )
}

it('sin parámetros arranca con la semana en curso', () => {
    const { result } = renderHook(() => useFiltroAnalitica(), { wrapper: wrapperCon('/analitica') })
    expect(result.current.filtro.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.current.filtro.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.current.filtro.desde <= result.current.filtro.hasta).toBe(true)
})

it('lee el rango y los vendedores de la query string', () => {
    const { result } = renderHook(() => useFiltroAnalitica(), {
        wrapper: wrapperCon('/analitica?desde=2026-07-20&hasta=2026-07-24&vendedores=V1,V4'),
    })
    expect(result.current.filtro.desde).toBe('2026-07-20')
    expect(result.current.filtro.hasta).toBe('2026-07-24')
    expect(result.current.filtro.vendedores).toEqual(['V1', 'V4'])
})

it('cambiar el rango se refleja en el filtro', () => {
    const { result } = renderHook(() => useFiltroAnalitica(), {
        wrapper: wrapperCon('/analitica?desde=2026-07-20&hasta=2026-07-24'),
    })
    act(() => result.current.setRango('2026-07-01', '2026-07-15'))
    expect(result.current.filtro.desde).toBe('2026-07-01')
    expect(result.current.filtro.hasta).toBe('2026-07-15')
})

it('toggleVendedor agrega y saca del filtro', () => {
    const { result } = renderHook(() => useFiltroAnalitica(), {
        wrapper: wrapperCon('/analitica?desde=2026-07-20&hasta=2026-07-24&vendedores=V1'),
    })
    act(() => result.current.toggleVendedor('V4'))
    expect(result.current.filtro.vendedores).toEqual(['V1', 'V4'])
    act(() => result.current.toggleVendedor('V1'))
    expect(result.current.filtro.vendedores).toEqual(['V4'])
})

it('limpiarVendedores deja el filtro en todos', () => {
    const { result } = renderHook(() => useFiltroAnalitica(), {
        wrapper: wrapperCon('/analitica?desde=2026-07-20&hasta=2026-07-24&vendedores=V1,V4'),
    })
    act(() => result.current.limpiarVendedores())
    expect(result.current.filtro.vendedores).toEqual([])
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/hooks/useFiltroAnalitica.test.tsx`
Expected: FAIL — `Failed to resolve import "./useFiltroAnalitica"`.

- [ ] **Step 3: Escribir el hook**

Crear `src/hooks/useFiltroAnalitica.ts`:

```typescript
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { IAnaliticaFiltro } from '@/types/analitica'

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Lunes a viernes de la semana en curso: el default con el que gerencia abre la app. */
function semanaEnCurso(): { desde: string; hasta: string } {
    const hoy = new Date()
    const diaSemana = hoy.getDay() === 0 ? 7 : hoy.getDay()
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() - (diaSemana - 1))
    const viernes = new Date(lunes)
    viernes.setDate(lunes.getDate() + 4)
    return { desde: iso(lunes), hasta: iso(viernes) }
}

export function useFiltroAnalitica() {
    const [params, setParams] = useSearchParams()
    const porDefecto = useMemo(semanaEnCurso, [])

    const filtro: IAnaliticaFiltro = useMemo(() => {
        const vendedores = (params.get('vendedores') ?? '')
            .split(',')
            .map(v => v.trim())
            .filter(Boolean)
        return {
            desde: params.get('desde') ?? porDefecto.desde,
            hasta: params.get('hasta') ?? porDefecto.hasta,
            vendedores,
        }
    }, [params, porDefecto])

    /** Toda escritura pasa por acá para que la URL siga siendo la única fuente de verdad. */
    const escribir = useCallback(
        (cambios: Partial<{ desde: string; hasta: string; vendedores: string[] }>) => {
            const siguiente = new URLSearchParams(params)
            siguiente.set('desde', cambios.desde ?? filtro.desde)
            siguiente.set('hasta', cambios.hasta ?? filtro.hasta)
            const vendedores = cambios.vendedores ?? filtro.vendedores ?? []
            if (vendedores.length > 0) siguiente.set('vendedores', vendedores.join(','))
            else siguiente.delete('vendedores')
            setParams(siguiente, { replace: true })
        },
        [params, setParams, filtro],
    )

    const setRango = useCallback(
        (desde: string, hasta: string) => escribir({ desde, hasta }),
        [escribir],
    )

    const toggleVendedor = useCallback(
        (codigo: string) => {
            const actuales = filtro.vendedores ?? []
            const vendedores = actuales.includes(codigo)
                ? actuales.filter(c => c !== codigo)
                : [...actuales, codigo]
            escribir({ vendedores })
        },
        [filtro, escribir],
    )

    const limpiarVendedores = useCallback(() => escribir({ vendedores: [] }), [escribir])

    return { filtro, setRango, toggleVendedor, limpiarVendedores }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- src/hooks/useFiltroAnalitica.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Escribir el test del componente (falla)**

Crear `src/components/analitica/FiltrosAnalitica.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import FiltrosAnalitica from './FiltrosAnalitica'

const FILTRO = { desde: '2026-07-20', hasta: '2026-07-24', vendedores: [] }
const DISPONIBLES = [
    { codigo: 'V1', nombre: 'ACOSTA MARIANO' },
    { codigo: 'V4', nombre: 'DOMINGUEZ SILVINA' },
]

it('muestra el rango activo en los inputs de fecha', () => {
    render(
        <FiltrosAnalitica
            filtro={FILTRO}
            vendedoresDisponibles={DISPONIBLES}
            onRango={vi.fn()}
            onToggleVendedor={vi.fn()}
            onLimpiar={vi.fn()}
        />,
    )
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-07-20')
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-07-24')
})

it('el atajo "Este mes" propone el mes en curso completo', async () => {
    const onRango = vi.fn()
    render(
        <FiltrosAnalitica
            filtro={FILTRO}
            vendedoresDisponibles={DISPONIBLES}
            onRango={onRango}
            onToggleVendedor={vi.fn()}
            onLimpiar={vi.fn()}
        />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Este mes' }))
    expect(onRango).toHaveBeenCalledTimes(1)
    const [desde, hasta] = onRango.mock.calls[0]
    expect(desde.slice(8)).toBe('01')
    expect(desde <= hasta).toBe(true)
})

it('elegir un vendedor avisa al padre', async () => {
    const onToggleVendedor = vi.fn()
    render(
        <FiltrosAnalitica
            filtro={FILTRO}
            vendedoresDisponibles={DISPONIBLES}
            onRango={vi.fn()}
            onToggleVendedor={onToggleVendedor}
            onLimpiar={vi.fn()}
        />,
    )
    await userEvent.click(screen.getByRole('button', { name: /vendedores/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'ACOSTA MARIANO' }))
    expect(onToggleVendedor).toHaveBeenCalledWith('V1')
})

it('sin vendedores elegidos el botón dice "Todos"', () => {
    render(
        <FiltrosAnalitica
            filtro={FILTRO}
            vendedoresDisponibles={DISPONIBLES}
            onRango={vi.fn()}
            onToggleVendedor={vi.fn()}
            onLimpiar={vi.fn()}
        />,
    )
    expect(screen.getByRole('button', { name: /todos/i })).toBeInTheDocument()
})
```

- [ ] **Step 6: Correr el test para verificar que falla**

Run: `npm test -- src/components/analitica/FiltrosAnalitica.test.tsx`
Expected: FAIL — `Failed to resolve import "./FiltrosAnalitica"`.

- [ ] **Step 7: Escribir el componente**

Crear `src/components/analitica/FiltrosAnalitica.tsx`:

```typescript
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { IAnaliticaFiltro } from '@/types/analitica'

export interface VendedorOpcion {
    codigo: string
    nombre: string
}

interface FiltrosAnaliticaProps {
    filtro: IAnaliticaFiltro
    vendedoresDisponibles: VendedorOpcion[]
    onRango: (desde: string, hasta: string) => void
    onToggleVendedor: (codigo: string) => void
    onLimpiar: () => void
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

function estaSemana() {
    const hoy = new Date()
    const diaSemana = hoy.getDay() === 0 ? 7 : hoy.getDay()
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() - (diaSemana - 1))
    const viernes = new Date(lunes)
    viernes.setDate(lunes.getDate() + 4)
    return [iso(lunes), iso(viernes)] as const
}

function esteMes() {
    const hoy = new Date()
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
    return [iso(primero), iso(ultimo)] as const
}

function mesPasado() {
    const hoy = new Date()
    const primero = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
    return [iso(primero), iso(ultimo)] as const
}

export default function FiltrosAnalitica({
    filtro,
    vendedoresDisponibles,
    onRango,
    onToggleVendedor,
    onLimpiar,
}: FiltrosAnaliticaProps) {
    const [abierto, setAbierto] = useState(false)
    const elegidos = filtro.vendedores ?? []
    const etiqueta = elegidos.length === 0 ? 'Todos' : `${elegidos.length} vendedores`

    return (
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white px-6 py-4">
            <label className="flex flex-col text-xs font-medium text-slate-500">
                Desde
                <input
                    type="date"
                    aria-label="Desde"
                    value={filtro.desde}
                    onChange={e => onRango(e.target.value, filtro.hasta)}
                    className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-500">
                Hasta
                <input
                    type="date"
                    aria-label="Hasta"
                    value={filtro.hasta}
                    onChange={e => onRango(filtro.desde, e.target.value)}
                    className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                />
            </label>

            <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => onRango(...estaSemana())}>
                    Esta semana
                </Button>
                <Button variant="outline" size="sm" onClick={() => onRango(...esteMes())}>
                    Este mes
                </Button>
                <Button variant="outline" size="sm" onClick={() => onRango(...mesPasado())}>
                    Mes pasado
                </Button>
            </div>

            <div className="relative">
                <Button variant="outline" size="sm" onClick={() => setAbierto(a => !a)}>
                    Vendedores: {etiqueta}
                    <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
                {abierto && (
                    <div className="absolute z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                        <button
                            type="button"
                            onClick={onLimpiar}
                            className="mb-1 w-full rounded px-2 py-1 text-left text-xs text-slate-500 hover:bg-slate-50"
                        >
                            Ver todos
                        </button>
                        {vendedoresDisponibles.map(v => (
                            <label
                                key={v.codigo}
                                className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
                            >
                                <input
                                    type="checkbox"
                                    aria-label={v.nombre}
                                    checked={elegidos.includes(v.codigo)}
                                    onChange={() => onToggleVendedor(v.codigo)}
                                />
                                {v.nombre}
                            </label>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
```

- [ ] **Step 8: Correr los tests y verificar que pasan**

Run: `npm test -- src/components/analitica/FiltrosAnalitica.test.tsx`
Expected: PASS, 4 tests.

Si el test del checkbox falla porque `Button` no reenvía el `name` accesible esperado, revisar `src/components/ui/button.tsx` antes de tocar el test.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useFiltroAnalitica.ts src/hooks/useFiltroAnalitica.test.tsx src/components/analitica/FiltrosAnalitica.tsx src/components/analitica/FiltrosAnalitica.test.tsx
git commit -m "feat(analitica): filtros de rango y vendedores con estado en la url"
```

---

### Task 7: Nivel 1 — KPIs y tabla de vendedores

**Files:**
- Create: `src/components/analitica/KpisEquipo.tsx`
- Create: `src/components/analitica/TablaVendedores.tsx`
- Create: `src/pages/AnaliticaPage.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/analitica/TablaVendedores.test.tsx`, `src/pages/AnaliticaPage.test.tsx`

**Interfaces:**
- Consumes: `useResumen` (Task 3), helpers (Task 5), `useFiltroAnalitica` y `FiltrosAnalitica` (Task 6).
- Produces: la ruta `/analitica`; `TablaVendedores` con props `{ vendedores, promedios, onElegirVendedor }`; `KpisEquipo` con props `{ promedios, cantidadVendedores }`.

- [ ] **Step 1: Escribir el test de la tabla (falla)**

Crear `src/components/analitica/TablaVendedores.test.tsx`:

```typescript
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TablaVendedores from './TablaVendedores'
import { MOCK_RESUMEN } from '@/mocks/analiticaMock'

const props = {
    vendedores: MOCK_RESUMEN.vendedores,
    promedios: MOCK_RESUMEN.promedios,
    onElegirVendedor: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

it('muestra una fila por vendedor más la de promedios', () => {
    render(<TablaVendedores {...props} />)
    const filas = screen.getAllByRole('row')
    // encabezado + promedios + vendedores
    expect(filas).toHaveLength(MOCK_RESUMEN.vendedores.length + 2)
})

it('la fila de promedios se muestra primero', () => {
    render(<TablaVendedores {...props} />)
    const filas = screen.getAllByRole('row')
    expect(within(filas[1]).getByText('PROMEDIOS')).toBeInTheDocument()
})

it('marca el ciclo en curso para no leer mal una cobertura parcial', () => {
    render(<TablaVendedores {...props} />)
    const fila = screen.getByRole('row', { name: /DOMINGUEZ SILVINA/ })
    expect(within(fila).getByTitle(/ciclo en curso/i)).toBeInTheDocument()
})

it('muestra s/d y no 0% cuando no hubo rubros ofrecidos', () => {
    render(<TablaVendedores {...props} />)
    const fila = screen.getByRole('row', { name: /GIMENEZ ROBERTO/ })
    expect(within(fila).getAllByText('s/d').length).toBeGreaterThan(0)
})

it('pinta en rojo la duración bajo el piso de 20 minutos', () => {
    render(<TablaVendedores {...props} />)
    const fila = screen.getByRole('row', { name: /FERREYRA GUSTAVO/ })
    expect(within(fila).getByText('14 min')).toHaveClass('text-red-600')
})

it('pinta en rojo al vendedor con la mitad de las visitas sin validar', () => {
    render(<TablaVendedores {...props} />)
    const fila = screen.getByRole('row', { name: /ESQUIVEL RAMON/ })
    expect(within(fila).getByTestId('celda-no-validadas')).toHaveClass('text-red-600')
})

it('ordena por cobertura al hacer click en el encabezado', async () => {
    render(<TablaVendedores {...props} />)
    await userEvent.click(screen.getByRole('button', { name: /cobertura/i }))
    const filas = screen.getAllByRole('row')
    // filas[0] encabezado, filas[1] promedios: el primer vendedor es el de menor cobertura
    expect(within(filas[2]).getByText('DOMINGUEZ SILVINA')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /cobertura/i }))
    const filasDesc = screen.getAllByRole('row')
    expect(within(filasDesc[2]).getByText('ACOSTA MARIANO')).toBeInTheDocument()
})

it('avisa al padre el vendedor elegido', async () => {
    render(<TablaVendedores {...props} />)
    await userEvent.click(screen.getByText('ACOSTA MARIANO'))
    expect(props.onElegirVendedor).toHaveBeenCalledWith('V1')
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/components/analitica/TablaVendedores.test.tsx`
Expected: FAIL — `Failed to resolve import "./TablaVendedores"`.

- [ ] **Step 3: Escribir la tabla**

Crear `src/components/analitica/TablaVendedores.tsx`:

```typescript
import { useMemo, useState } from 'react'
import { ArrowUpDown, Clock } from 'lucide-react'
import {
    alertasAbsolutas,
    esBajoPromedio,
    formatDuracion,
    formatNumero,
    formatPct,
} from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

interface TablaVendedoresProps {
    vendedores: IVendedorMetricas[]
    promedios: IVendedorMetricas
    onElegirVendedor: (codigo: string) => void
}

type Columna = {
    clave: keyof IVendedorMetricas
    titulo: string
    /** Cómo se pinta el valor. 'relativo' compara contra el promedio del equipo. */
    render: (v: IVendedorMetricas) => string
    comparar: boolean
}

const COLUMNAS: Columna[] = [
    { clave: 'cobertura', titulo: 'Cobertura', render: v => formatPct(v.cobertura), comparar: true },
    { clave: 'planificados', titulo: 'Plan', render: v => formatNumero(v.planificados), comparar: false },
    { clave: 'visitados', titulo: 'Visitados', render: v => formatNumero(v.visitados), comparar: true },
    { clave: 'pendientes', titulo: 'Pend.', render: v => formatNumero(v.pendientes), comparar: false },
    { clave: 'visitasPorDia', titulo: 'Visitas/día', render: v => formatNumero(v.visitasPorDia), comparar: true },
    { clave: 'clientesDistintos', titulo: 'Clientes', render: v => formatNumero(v.clientesDistintos), comparar: true },
    {
        clave: 'efectividadComercial',
        titulo: 'Efect. comercial',
        render: v => formatPct(v.efectividadComercial),
        comparar: true,
    },
    { clave: 'pctNoOfrecidos', titulo: 'No ofrecidos', render: v => formatPct(v.pctNoOfrecidos), comparar: false },
    {
        clave: 'efectividadOperativa',
        titulo: 'Cumplimiento',
        render: v => (v.efectividadOperativa === null ? 's/d' : `${Math.round(v.efectividadOperativa)}%`),
        comparar: true,
    },
]

export default function TablaVendedores({
    vendedores,
    promedios,
    onElegirVendedor,
}: TablaVendedoresProps) {
    const [orden, setOrden] = useState<{ clave: keyof IVendedorMetricas; asc: boolean } | null>(null)

    const ordenados = useMemo(() => {
        if (!orden) return vendedores
        const copia = [...vendedores]
        copia.sort((a, b) => {
            const va = a[orden.clave]
            const vb = b[orden.clave]
            // Los null van al final en ambos sentidos: son ausencia de dato, no un mínimo.
            if (va === null) return 1
            if (vb === null) return -1
            if (typeof va === 'number' && typeof vb === 'number') return orden.asc ? va - vb : vb - va
            return String(va).localeCompare(String(vb)) * (orden.asc ? 1 : -1)
        })
        return copia
    }, [vendedores, orden])

    const alternarOrden = (clave: keyof IVendedorMetricas) =>
        setOrden(actual =>
            actual?.clave === clave ? { clave, asc: !actual.asc } : { clave, asc: true },
        )

    const filaClase = (v: IVendedorMetricas, col: Columna): string => {
        if (!col.comparar) return 'text-slate-700'
        const valor = v[col.clave]
        const prom = promedios[col.clave]
        const bajo =
            typeof valor === 'number' || valor === null
                ? esBajoPromedio(valor as number | null, prom as number | null)
                : false
        return bajo ? 'text-red-600 font-semibold' : 'text-slate-700'
    }

    const renderFila = (v: IVendedorMetricas, esPromedio: boolean) => {
        const alertas = alertasAbsolutas(v)
        return (
            <tr
                key={esPromedio ? 'promedios' : v.codigoParticularVendedor}
                className={
                    esPromedio
                        ? 'bg-slate-100 font-semibold text-slate-900'
                        : 'cursor-pointer border-b border-slate-100 hover:bg-blue-50'
                }
                onClick={
                    esPromedio ? undefined : () => onElegirVendedor(v.codigoParticularVendedor)
                }
            >
                <td className="px-3 py-2 text-left">
                    <span className="flex items-center gap-1.5">
                        {v.nombreVendedor}
                        {v.ciclosEnCurso > 0 && !esPromedio && (
                            <span title="ciclo en curso: la cobertura es parcial">
                                <Clock className="h-3.5 w-3.5 text-amber-500" />
                            </span>
                        )}
                    </span>
                </td>
                {COLUMNAS.map(col => (
                    <td key={col.clave} className={`px-3 py-2 text-right ${filaClase(v, col)}`}>
                        {col.render(v)}
                    </td>
                ))}
                <td
                    data-testid={esPromedio ? undefined : 'celda-no-validadas'}
                    className={`px-3 py-2 text-right ${
                        alertas.includes('geo') ? 'text-red-600 font-semibold' : 'text-slate-700'
                    }`}
                >
                    {formatNumero(v.visitasNoValidadas)}
                </td>
                <td
                    className={`px-3 py-2 text-right ${
                        alertas.includes('duracion') ? 'text-red-600 font-semibold' : 'text-slate-700'
                    }`}
                >
                    {formatDuracion(v.duracionPromedioMin)}
                </td>
            </tr>
        )
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-3 py-2 text-left">Vendedor</th>
                        {COLUMNAS.map(col => (
                            <th key={col.clave} className="px-3 py-2 text-right">
                                <button
                                    type="button"
                                    onClick={() => alternarOrden(col.clave)}
                                    className="inline-flex items-center gap-1 hover:text-slate-900"
                                >
                                    {col.titulo}
                                    <ArrowUpDown className="h-3 w-3" />
                                </button>
                            </th>
                        ))}
                        <th className="px-3 py-2 text-right">
                            <button
                                type="button"
                                onClick={() => alternarOrden('visitasNoValidadas')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                            >
                                No val.
                                <ArrowUpDown className="h-3 w-3" />
                            </button>
                        </th>
                        <th className="px-3 py-2 text-right">
                            <button
                                type="button"
                                onClick={() => alternarOrden('duracionPromedioMin')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                            >
                                Duración
                                <ArrowUpDown className="h-3 w-3" />
                            </button>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {renderFila(promedios, true)}
                    {ordenados.map(v => renderFila(v, false))}
                </tbody>
            </table>
        </div>
    )
}
```

- [ ] **Step 4: Correr los tests de la tabla**

Run: `npm test -- src/components/analitica/TablaVendedores.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Escribir los KPIs del equipo**

Crear `src/components/analitica/KpisEquipo.tsx`:

```typescript
import { formatNumero, formatPct } from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

interface KpisEquipoProps {
    promedios: IVendedorMetricas
    cantidadVendedores: number
}

function Kpi({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
            {nota && <p className="mt-0.5 text-xs text-amber-600">{nota}</p>}
        </div>
    )
}

export default function KpisEquipo({ promedios, cantidadVendedores }: KpisEquipoProps) {
    const enCurso =
        promedios.ciclosEnCurso > 0 ? `⊙ ${promedios.ciclosEnCurso} ciclos en curso` : undefined
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi titulo="Cobertura del plan" valor={formatPct(promedios.cobertura)} nota={enCurso} />
            <Kpi titulo="Efectividad comercial" valor={formatPct(promedios.efectividadComercial)} />
            <Kpi titulo="Visitas válidas (prom.)" valor={formatNumero(promedios.visitasValidas)} />
            <Kpi titulo="Vendedores" valor={String(cantidadVendedores)} />
        </div>
    )
}
```

- [ ] **Step 6: Escribir el test de la página (falla)**

Crear `src/pages/AnaliticaPage.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AnaliticaPage from './AnaliticaPage'
import { MOCK_RESUMEN } from '@/mocks/analiticaMock'
import * as api from '@/api/analitica'

vi.mock('@/api/analitica')

function montar(ruta = '/analitica?desde=2026-07-20&hasta=2026-07-24') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[ruta]}>
                <AnaliticaPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getObjeciones as any).mockResolvedValue({ total: 0, motivos: [] })
})

it('muestra la tabla con los vendedores del resumen', async () => {
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    expect(screen.getByText('PROMEDIOS')).toBeInTheDocument()
})

it('sin ciclos en el rango muestra un vacío explícito, no un 0%', async () => {
    ;(api.getResumen as any).mockResolvedValue({
        desde: '2020-01-01',
        hasta: '2020-01-05',
        diasHabiles: 5,
        promedios: { ...MOCK_RESUMEN.promedios, cobertura: null },
        vendedores: [],
    })
    montar('/analitica?desde=2020-01-01&hasta=2020-01-05')
    await waitFor(() =>
        expect(screen.getByText(/no hay ciclos entre/i)).toBeInTheDocument(),
    )
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
})

it('muestra el error si el resumen falla', async () => {
    ;(api.getResumen as any).mockRejectedValue(new Error('boom'))
    montar()
    await waitFor(() => expect(screen.getByText(/no se pudo cargar/i)).toBeInTheDocument())
})
```

- [ ] **Step 7: Correr el test para verificar que falla**

Run: `npm test -- src/pages/AnaliticaPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./AnaliticaPage"`.

- [ ] **Step 8: Escribir la página**

Crear `src/pages/AnaliticaPage.tsx`. `ObjecionesMercado` se agrega en la Task 8; por ahora la página no lo importa.

```typescript
import { useNavigate } from 'react-router-dom'
import FiltrosAnalitica from '@/components/analitica/FiltrosAnalitica'
import KpisEquipo from '@/components/analitica/KpisEquipo'
import TablaVendedores from '@/components/analitica/TablaVendedores'
import { useFiltroAnalitica } from '@/hooks/useFiltroAnalitica'
import { useResumen } from '@/hooks/useAnalitica'

export default function AnaliticaPage() {
    const navigate = useNavigate()
    const { filtro, setRango, toggleVendedor, limpiarVendedores } = useFiltroAnalitica()
    const { data, isLoading, isError } = useResumen(filtro)

    const opciones = (data?.vendedores ?? []).map(v => ({
        codigo: v.codigoParticularVendedor,
        nombre: v.nombreVendedor,
    }))

    const irAVendedor = (codigo: string) => {
        const params = new URLSearchParams({ desde: filtro.desde, hasta: filtro.hasta })
        navigate(`/analitica/vendedor/${codigo}?${params}`)
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b border-slate-200 bg-white px-6 py-4">
                <h1 className="text-lg font-semibold text-slate-900">Analítica de visitas</h1>
            </header>

            <FiltrosAnalitica
                filtro={filtro}
                vendedoresDisponibles={opciones}
                onRango={setRango}
                onToggleVendedor={toggleVendedor}
                onLimpiar={limpiarVendedores}
            />

            <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
                {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

                {isError && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        No se pudo cargar la analítica. Probá de nuevo en un momento.
                    </p>
                )}

                {data && data.vendedores.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
                        <p className="text-sm text-slate-600">
                            No hay ciclos entre {filtro.desde} y {filtro.hasta}.
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                            Probá con otro rango de fechas.
                        </p>
                    </div>
                )}

                {data && data.vendedores.length > 0 && (
                    <>
                        <KpisEquipo
                            promedios={data.promedios}
                            cantidadVendedores={data.vendedores.length}
                        />
                        <TablaVendedores
                            vendedores={data.vendedores}
                            promedios={data.promedios}
                            onElegirVendedor={irAVendedor}
                        />
                    </>
                )}
            </main>
        </div>
    )
}
```

- [ ] **Step 9: Montar la ruta**

En `src/App.tsx`, agregar el import y la ruta dentro de `ProtectedRoute`:

```typescript
import AnaliticaPage from '@/pages/AnaliticaPage'
```

```typescript
                        <Route element={<ProtectedRoute />}>
                            <Route path="/" element={<AgendaSemanaPage />} />
                            <Route path="/analitica" element={<AnaliticaPage />} />
                        </Route>
```

- [ ] **Step 10: Correr toda la suite y verificar en el navegador**

Run: `npm test`
Expected: PASS, toda la suite.

Run: `npm run dev` y abrir `http://localhost:5173/analitica`. Se debe ver la tabla con los 10 vendedores, la fila PROMEDIOS arriba, DOMINGUEZ SILVINA con el reloj de ciclo en curso, FERREYRA con la duración en rojo y GIMENEZ con `s/d` en efectividad.

- [ ] **Step 11: Commit**

```bash
git add src/components/analitica/KpisEquipo.tsx src/components/analitica/TablaVendedores.tsx src/components/analitica/TablaVendedores.test.tsx src/pages/AnaliticaPage.tsx src/pages/AnaliticaPage.test.tsx src/App.tsx
git commit -m "feat(analitica): nivel 1 con kpis del equipo y tabla de vendedores"
```

---

### Task 8: Objeciones del mercado

**Files:**
- Create: `src/components/analitica/ObjecionesMercado.tsx`
- Modify: `src/pages/AnaliticaPage.tsx`
- Test: `src/components/analitica/ObjecionesMercado.test.tsx`

**Interfaces:**
- Consumes: `useObjeciones` (Task 3), `formatPct` (Task 5), `IObjecionesResumen` (Task 1).
- Produces: `ObjecionesMercado` con props `{ desde, hasta }` (resuelve su propia consulta).

- [ ] **Step 1: Escribir el test (falla)**

Crear `src/components/analitica/ObjecionesMercado.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import ObjecionesMercado from './ObjecionesMercado'
import { MOCK_OBJECIONES } from '@/mocks/analiticaMock'
import * as api from '@/api/analitica'

vi.mock('@/api/analitica')

function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <ObjecionesMercado desde="2026-07-20" hasta="2026-07-24" />
        </QueryClientProvider>,
    )
}

beforeEach(() => vi.clearAllMocks())

it('lista los motivos con su cantidad y porcentaje', async () => {
    ;(api.getObjeciones as any).mockResolvedValue(MOCK_OBJECIONES)
    montar()
    await waitFor(() => expect(screen.getByText('Precio')).toBeInTheDocument())
    expect(screen.getByText('98')).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()
})

it('sin objeciones en el rango muestra un vacío explícito', async () => {
    ;(api.getObjeciones as any).mockResolvedValue({ total: 0, motivos: [] })
    montar()
    await waitFor(() =>
        expect(screen.getByText(/sin motivos cargados/i)).toBeInTheDocument(),
    )
})

it('distingue visualmente los motivos que son pérdida', async () => {
    ;(api.getObjeciones as any).mockResolvedValue(MOCK_OBJECIONES)
    montar()
    await waitFor(() => expect(screen.getByText('Precio')).toBeInTheDocument())
    expect(screen.getByTestId('objecion-2')).toHaveClass('border-l-red-400')
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/components/analitica/ObjecionesMercado.test.tsx`
Expected: FAIL — `Failed to resolve import "./ObjecionesMercado"`.

- [ ] **Step 3: Escribir el componente**

Crear `src/components/analitica/ObjecionesMercado.tsx`:

```typescript
import { useObjeciones } from '@/hooks/useAnalitica'
import { formatPct } from '@/lib/analiticaFormat'
import type { ResultadoMotivo } from '@/types/planificacion'

interface ObjecionesMercadoProps {
    desde: string
    hasta: string
}

/** El color habla del resultado comercial, no del volumen: una objeción frecuente
 *  que termina en pedido no es un problema. */
const BORDE_POR_RESULTADO: Record<string, string> = {
    ganado: 'border-l-emerald-400',
    diferido: 'border-l-amber-400',
    perdido: 'border-l-red-400',
    no_ofrecido: 'border-l-slate-300',
}

const borde = (resultado: ResultadoMotivo | null) =>
    BORDE_POR_RESULTADO[resultado ?? ''] ?? 'border-l-slate-300'

export default function ObjecionesMercado({ desde, hasta }: ObjecionesMercadoProps) {
    const { data, isLoading } = useObjeciones({ desde, hasta })

    return (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Objeciones del mercado</h2>
            <p className="mt-0.5 text-xs text-slate-500">
                Motivos cargados por rubro en el rango elegido.
            </p>

            {isLoading && <p className="mt-4 text-sm text-slate-500">Cargando…</p>}

            {data && data.motivos.length === 0 && (
                <p className="mt-4 text-sm text-slate-500">
                    Sin motivos cargados en este rango.
                </p>
            )}

            {data && data.motivos.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                    {data.motivos.map(m => (
                        <li
                            key={m.motivoId}
                            data-testid={`objecion-${m.motivoId}`}
                            className={`flex items-center justify-between border-l-4 bg-slate-50 px-3 py-2 ${borde(m.resultado)}`}
                        >
                            <span className="text-sm text-slate-800">{m.descripcion}</span>
                            <span className="flex items-center gap-4 text-sm tabular-nums">
                                <span className="text-slate-500">{m.cantidad}</span>
                                <span className="w-12 text-right font-medium text-slate-900">
                                    {formatPct(m.pct)}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
```

- [ ] **Step 4: Sumarlo a la página**

En `src/pages/AnaliticaPage.tsx`, agregar el import:

```typescript
import ObjecionesMercado from '@/components/analitica/ObjecionesMercado'
```

Y dentro del bloque `data && data.vendedores.length > 0`, después de `<TablaVendedores ... />`:

```typescript
                        <ObjecionesMercado desde={filtro.desde} hasta={filtro.hasta} />
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test -- src/components/analitica/ObjecionesMercado.test.tsx src/pages/AnaliticaPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/analitica/ObjecionesMercado.tsx src/components/analitica/ObjecionesMercado.test.tsx src/pages/AnaliticaPage.tsx
git commit -m "feat(analitica): ranking de objeciones del mercado"
```

---

### Task 9: Nivel 2 — página del vendedor con su tabla de visitas

**Files:**
- Create: `src/components/analitica/TablaVisitas.tsx`
- Create: `src/pages/AnaliticaVendedorPage.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/analitica/TablaVisitas.test.tsx`, `src/pages/AnaliticaVendedorPage.test.tsx`

**Interfaces:**
- Consumes: `useVisitas`, `useResumen` (Task 3), `formatDistancia`, `claseDistancia`, `formatDuracion` (Task 5).
- Produces: la ruta `/analitica/vendedor/:codigo`; `TablaVisitas` con props `{ visitas, onElegirVisita }`.

- [ ] **Step 1: Escribir el test de la tabla de visitas (falla)**

Crear `src/components/analitica/TablaVisitas.test.tsx`:

```typescript
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TablaVisitas from './TablaVisitas'
import type { IVisitaFila } from '@/types/analitica'

const VISITAS: IVisitaFila[] = [
    {
        visitaId: 1,
        fecha: '2026-07-20',
        horaInicio: '09:13',
        horaFin: '09:58',
        duracionMin: 45,
        distanciaMetros: 29,
        codigoParticularCliente: 'C1',
        nombreCliente: 'OSANO ALDO MARIO',
        tipo: 'visita',
        motivos: ['Saqué pedido'],
        resultado: 'ganado',
    },
    {
        visitaId: 2,
        fecha: '2026-07-20',
        horaInicio: '11:44',
        horaFin: '12:27',
        duracionMin: 43,
        distanciaMetros: null,
        codigoParticularCliente: 'C2',
        nombreCliente: 'REPUESTOS DEL SUR',
        tipo: 'visita',
        motivos: ['Precio'],
        resultado: 'perdido',
    },
    {
        visitaId: 3,
        fecha: '2026-07-21',
        horaInicio: '10:02',
        horaFin: '10:20',
        duracionMin: 18,
        distanciaMetros: 4300,
        codigoParticularCliente: 'C3',
        nombreCliente: 'TABORA EMANUEL',
        tipo: 'visita',
        motivos: [],
        resultado: null,
    },
]

it('muestra una fila por visita', () => {
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={vi.fn()} />)
    expect(screen.getAllByRole('row')).toHaveLength(VISITAS.length + 1)
})

it('pinta en verde la distancia dentro de los 300 m', () => {
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={vi.fn()} />)
    expect(screen.getByText('29 m')).toHaveClass('text-emerald-600')
})

it('pinta en rojo la distancia fuera de tolerancia', () => {
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={vi.fn()} />)
    expect(screen.getByText('4300 m')).toHaveClass('text-red-600')
})

it('muestra s/d en gris cuando el cliente no tiene coords', () => {
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={vi.fn()} />)
    const celda = screen.getByText('s/d')
    expect(celda).toHaveClass('text-slate-400')
    expect(celda).not.toHaveClass('text-red-600')
})

it('muestra el motivo y el resultado cargados', () => {
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={vi.fn()} />)
    const fila = screen.getByRole('row', { name: /OSANO/ })
    expect(within(fila).getByText('Saqué pedido')).toBeInTheDocument()
    expect(within(fila).getByText('Ganado')).toBeInTheDocument()
})

it('deja vacías las columnas de una visita sin rubros resueltos', () => {
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={vi.fn()} />)
    const fila = screen.getByRole('row', { name: /TABORA/ })
    expect(within(fila).getByTestId('resultado-3')).toHaveTextContent('—')
})

it('avisa al padre la visita elegida', async () => {
    const onElegirVisita = vi.fn()
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={onElegirVisita} />)
    await userEvent.click(screen.getByText('OSANO ALDO MARIO'))
    expect(onElegirVisita).toHaveBeenCalledWith(1)
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/components/analitica/TablaVisitas.test.tsx`
Expected: FAIL — `Failed to resolve import "./TablaVisitas"`.

- [ ] **Step 3: Escribir la tabla de visitas**

Crear `src/components/analitica/TablaVisitas.tsx`:

```typescript
import { claseDistancia, formatDistancia, formatDuracion } from '@/lib/analiticaFormat'
import type { IVisitaFila } from '@/types/analitica'
import type { ResultadoMotivo } from '@/types/planificacion'

interface TablaVisitasProps {
    visitas: IVisitaFila[]
    onElegirVisita: (visitaId: number) => void
}

const ETIQUETA_RESULTADO: Record<string, string> = {
    ganado: 'Ganado',
    diferido: 'Diferido',
    perdido: 'Perdido',
    no_ofrecido: 'No ofrecido',
}

const COLOR_RESULTADO: Record<string, string> = {
    ganado: 'text-emerald-700',
    diferido: 'text-amber-700',
    perdido: 'text-red-700',
    no_ofrecido: 'text-slate-500',
}

const CLASE_DISTANCIA: Record<string, string> = {
    ok: 'text-emerald-600 font-medium',
    alerta: 'text-red-600 font-medium',
    // Sin dato: gris, nunca rojo. La visita no es verificable, no es incorrecta.
    neutro: 'text-slate-400',
}

const etiquetaResultado = (r: ResultadoMotivo | null) => (r ? ETIQUETA_RESULTADO[r] : '—')

export default function TablaVisitas({ visitas, onElegirVisita }: TablaVisitasProps) {
    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Inicio</th>
                        <th className="px-3 py-2 text-right">Duración</th>
                        <th className="px-3 py-2 text-right">Dist.</th>
                        <th className="px-3 py-2 text-left">Cliente</th>
                        <th className="px-3 py-2 text-left">Motivo</th>
                        <th className="px-3 py-2 text-left">Resultado</th>
                    </tr>
                </thead>
                <tbody>
                    {visitas.map(v => (
                        <tr
                            key={v.visitaId}
                            onClick={() => onElegirVisita(v.visitaId)}
                            className="cursor-pointer border-b border-slate-100 hover:bg-blue-50"
                        >
                            <td className="px-3 py-2 text-slate-600">{v.fecha}</td>
                            <td className="px-3 py-2 text-slate-600">{v.horaInicio}</td>
                            <td className="px-3 py-2 text-right text-slate-700">
                                {formatDuracion(v.duracionMin)}
                            </td>
                            <td className="px-3 py-2 text-right">
                                <span className={CLASE_DISTANCIA[claseDistancia(v.distanciaMetros)]}>
                                    {formatDistancia(v.distanciaMetros)}
                                </span>
                            </td>
                            <td className="px-3 py-2 text-slate-900">{v.nombreCliente}</td>
                            <td className="px-3 py-2 text-slate-600">
                                {v.motivos.length > 0 ? v.motivos.join(', ') : '—'}
                            </td>
                            <td
                                data-testid={`resultado-${v.visitaId}`}
                                className={`px-3 py-2 ${v.resultado ? COLOR_RESULTADO[v.resultado] : 'text-slate-400'}`}
                            >
                                {etiquetaResultado(v.resultado)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
```

- [ ] **Step 4: Correr los tests de la tabla**

Run: `npm test -- src/components/analitica/TablaVisitas.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Escribir el test de la página del vendedor (falla)**

Crear `src/pages/AnaliticaVendedorPage.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import AnaliticaVendedorPage from './AnaliticaVendedorPage'
import { MOCK_RESUMEN, MOCK_VISITAS } from '@/mocks/analiticaMock'
import * as api from '@/api/analitica'

vi.mock('@/api/analitica')

function montar(codigo = 'V1') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter
                initialEntries={[`/analitica/vendedor/${codigo}?desde=2026-07-20&hasta=2026-07-24`]}
            >
                <Routes>
                    <Route
                        path="/analitica/vendedor/:codigo"
                        element={<AnaliticaVendedorPage />}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
})

it('muestra el nombre del vendedor y sus visitas', async () => {
    ;(api.getVisitas as any).mockResolvedValue({
        total: MOCK_VISITAS['V1'].length,
        pagina: 1,
        cant: MOCK_VISITAS['V1'].length,
        visitas: MOCK_VISITAS['V1'],
    })
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
})

it('pide las visitas del vendedor de la URL con el rango de la query', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    montar('V4')
    await waitFor(() => expect(api.getVisitas).toHaveBeenCalled())
    expect(api.getVisitas).toHaveBeenCalledWith(
        expect.objectContaining({ vendedor: 'V4', desde: '2026-07-20', hasta: '2026-07-24' }),
    )
})

it('sin visitas en el rango muestra un vacío explícito', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    montar()
    await waitFor(() => expect(screen.getByText(/sin visitas en este rango/i)).toBeInTheDocument())
})

it('ofrece volver al nivel 1 conservando el rango', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    montar()
    await waitFor(() => expect(screen.getByRole('link', { name: /volver/i })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /volver/i })).toHaveAttribute(
        'href',
        '/analitica?desde=2026-07-20&hasta=2026-07-24',
    )
})
```

- [ ] **Step 6: Correr el test para verificar que falla**

Run: `npm test -- src/pages/AnaliticaVendedorPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./AnaliticaVendedorPage"`.

- [ ] **Step 7: Escribir la página del vendedor**

Crear `src/pages/AnaliticaVendedorPage.tsx`. El panel de detalle llega en la Task 10; por ahora el click guarda el id sin renderizar nada.

```typescript
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import TablaVisitas from '@/components/analitica/TablaVisitas'
import { useResumen, useVisitas } from '@/hooks/useAnalitica'
import { formatDuracion, formatNumero, formatPct } from '@/lib/analiticaFormat'

export default function AnaliticaVendedorPage() {
    const { codigo = '' } = useParams()
    const [params] = useSearchParams()
    const desde = params.get('desde') ?? ''
    const hasta = params.get('hasta') ?? ''
    const [visitaElegida, setVisitaElegida] = useState<number | null>(null)

    const { data: resumen } = useResumen({ desde, hasta })
    const { data: pagina, isLoading } = useVisitas({ desde, hasta, vendedor: codigo })

    const vendedor = resumen?.vendedores.find(v => v.codigoParticularVendedor === codigo)
    const promedios = resumen?.promedios

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b border-slate-200 bg-white px-6 py-4">
                <Link
                    to={`/analitica?desde=${desde}&hasta=${hasta}`}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Volver a la analítica
                </Link>
                <h1 className="mt-1 text-lg font-semibold text-slate-900">
                    {vendedor?.nombreVendedor ?? codigo}
                </h1>
                <p className="text-xs text-slate-500">
                    {desde} a {hasta}
                </p>
            </header>

            <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
                {vendedor && promedios && (
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                        {[
                            {
                                titulo: 'Cobertura',
                                valor: formatPct(vendedor.cobertura),
                                prom: formatPct(promedios.cobertura),
                            },
                            {
                                titulo: 'Efect. comercial',
                                valor: formatPct(vendedor.efectividadComercial),
                                prom: formatPct(promedios.efectividadComercial),
                            },
                            {
                                titulo: 'Visitas/día',
                                valor: formatNumero(vendedor.visitasPorDia),
                                prom: formatNumero(promedios.visitasPorDia),
                            },
                            {
                                titulo: 'Duración prom.',
                                valor: formatDuracion(vendedor.duracionPromedioMin),
                                prom: formatDuracion(promedios.duracionPromedioMin),
                            },
                            {
                                titulo: 'No validadas',
                                valor: formatNumero(vendedor.visitasNoValidadas),
                                prom: formatNumero(promedios.visitasNoValidadas),
                            },
                        ].map(k => (
                            <div
                                key={k.titulo}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                            >
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    {k.titulo}
                                </p>
                                <p className="mt-1 text-xl font-semibold text-slate-900">{k.valor}</p>
                                <p className="text-xs text-slate-400">equipo: {k.prom}</p>
                            </div>
                        ))}
                    </div>
                )}

                {vendedor && vendedor.visitasSinCoord > 0 && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                        {vendedor.visitasSinCoord} visitas no verificables: el cliente no tiene
                        coordenadas cargadas.
                    </p>
                )}

                {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

                {pagina && pagina.visitas.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Sin visitas en este rango.
                    </div>
                )}

                {pagina && pagina.visitas.length > 0 && (
                    <TablaVisitas visitas={pagina.visitas} onElegirVisita={setVisitaElegida} />
                )}

                {/* El panel de detalle se agrega en la Task 10. */}
                {visitaElegida !== null && null}
            </main>
        </div>
    )
}
```

- [ ] **Step 8: Montar la ruta**

En `src/App.tsx`, agregar el import y la ruta:

```typescript
import AnaliticaVendedorPage from '@/pages/AnaliticaVendedorPage'
```

```typescript
                            <Route
                                path="/analitica/vendedor/:codigo"
                                element={<AnaliticaVendedorPage />}
                            />
```

- [ ] **Step 9: Correr toda la suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/components/analitica/TablaVisitas.tsx src/components/analitica/TablaVisitas.test.tsx src/pages/AnaliticaVendedorPage.tsx src/pages/AnaliticaVendedorPage.test.tsx src/App.tsx
git commit -m "feat(analitica): nivel 2 con la tabla de visitas del vendedor"
```

---

### Task 10: Nivel 3 — panel de detalle con mapa

**Files:**
- Create: `src/components/analitica/DetalleVisitaPanel.tsx`
- Create: `src/components/analitica/MapaVisita.tsx`
- Modify: `src/pages/AnaliticaVendedorPage.tsx`
- Test: `src/components/analitica/DetalleVisitaPanel.test.tsx`

**Interfaces:**
- Consumes: `useVisitaDetalle` (Task 3), helpers (Task 5), `IVisitaDetalle` (Task 1).
- Produces: `DetalleVisitaPanel` con props `{ visitaId, onCerrar }`; `MapaVisita` con props `{ coordInicio, coordFinal, coordCliente }`.

**Contexto:** el mapa sigue el patrón de `src/components/IniciarVisitaMapa.tsx` (Leaflet con `divIcon`), que ya está en el repo. En jsdom Leaflet no renderiza tiles, así que el test del panel mockea `MapaVisita`.

- [ ] **Step 1: Escribir el test del panel (falla)**

Crear `src/components/analitica/DetalleVisitaPanel.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import DetalleVisitaPanel from './DetalleVisitaPanel'
import * as api from '@/api/analitica'
import type { IVisitaDetalle } from '@/types/analitica'

vi.mock('@/api/analitica')
// Leaflet no dibuja en jsdom: el mapa se prueba a mano en el navegador.
vi.mock('./MapaVisita', () => ({ default: () => <div data-testid="mapa" /> }))

const DETALLE: IVisitaDetalle = {
    visitaId: 1000,
    codigoParticularCliente: 'C1',
    nombreCliente: 'OSANO ALDO MARIO',
    direccion: 'Av. Pellegrini 1200',
    fechaInicio: '2026-07-20T09:13:00',
    fechaFin: '2026-07-20T09:58:00',
    duracionMin: 45,
    coordInicio: { lat: -32.9442, lng: -60.6505 },
    coordFinal: { lat: -32.9443, lng: -60.6506 },
    coordCliente: { lat: -32.9441, lng: -60.6504 },
    distanciaMetros: 29,
    rubros: [
        {
            rubroCode: 'R01',
            rubroDescripcion: 'Lubricantes',
            esPropuesto: true,
            resuelto: true,
            motivos: [
                {
                    descripcion: 'Precio',
                    resultado: 'perdido',
                    marca: 'YPF',
                    competidor: 'Shell',
                    pctDiferencia: 12,
                },
            ],
        },
        {
            rubroCode: 'R02',
            rubroDescripcion: 'Filtros',
            esPropuesto: true,
            resuelto: false,
            motivos: [],
        },
    ],
}

function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <DetalleVisitaPanel visitaId={1000} onCerrar={cerrar} />
        </QueryClientProvider>,
    )
}

const cerrar = vi.fn()

beforeEach(() => vi.clearAllMocks())

it('muestra el cliente, el horario y la duración', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue(DETALLE)
    montar()
    await waitFor(() => expect(screen.getByText('OSANO ALDO MARIO')).toBeInTheDocument())
    expect(screen.getByText('45 min')).toBeInTheDocument()
})

it('muestra el detalle del motivo con marca, competidor y diferencia', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue(DETALLE)
    montar()
    await waitFor(() => expect(screen.getByText('Lubricantes')).toBeInTheDocument())
    expect(screen.getByText(/YPF/)).toBeInTheDocument()
    expect(screen.getByText(/Shell/)).toBeInTheDocument()
    expect(screen.getByText(/12%/)).toBeInTheDocument()
})

it('marca los rubros que quedaron sin resolver', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue(DETALLE)
    montar()
    await waitFor(() => expect(screen.getByText('Filtros')).toBeInTheDocument())
    expect(screen.getByTestId('rubro-R02')).toHaveTextContent(/sin resolver/i)
})

it('no dibuja el mapa si el cliente no tiene coords', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue({
        ...DETALLE,
        coordCliente: null,
        distanciaMetros: null,
    })
    montar()
    await waitFor(() => expect(screen.getByText(/sin coordenadas del cliente/i)).toBeInTheDocument())
    expect(screen.queryByTestId('mapa')).not.toBeInTheDocument()
})

it('se cierra con el botón', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue(DETALLE)
    montar()
    await waitFor(() => expect(screen.getByText('OSANO ALDO MARIO')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(cerrar).toHaveBeenCalled()
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/components/analitica/DetalleVisitaPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./DetalleVisitaPanel"`.

- [ ] **Step 3: Escribir el mapa**

Crear `src/components/analitica/MapaVisita.tsx`, siguiendo el patrón de `IniciarVisitaMapa.tsx`:

```typescript
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { TOLERANCIA_METROS } from '@/lib/analiticaFormat'
import type { ICoord } from '@/types/analitica'

interface MapaVisitaProps {
    coordInicio: ICoord | null
    coordFinal: ICoord | null
    coordCliente: ICoord
}

const punto = (color: string, tamano: number) =>
    L.divIcon({
        className: '',
        html: `<div style="width:${tamano}px;height:${tamano}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [tamano, tamano],
        iconAnchor: [tamano / 2, tamano / 2],
    })

const ICONO_CLIENTE = punto('#F97316', 22)
const ICONO_INICIO = punto('#213D82', 16)
const ICONO_FIN = punto('#10B981', 16)

export default function MapaVisita({ coordInicio, coordFinal, coordCliente }: MapaVisitaProps) {
    const contenedor = useRef<HTMLDivElement>(null)
    const mapa = useRef<L.Map | null>(null)

    useEffect(() => {
        if (!contenedor.current || mapa.current) return

        mapa.current = L.map(contenedor.current, { attributionControl: false }).setView(
            [coordCliente.lat, coordCliente.lng],
            16,
        )
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa.current)

        L.marker([coordCliente.lat, coordCliente.lng], { icon: ICONO_CLIENTE }).addTo(mapa.current)
        // El círculo hace visible por qué una visita quedó validada o no.
        L.circle([coordCliente.lat, coordCliente.lng], {
            radius: TOLERANCIA_METROS,
            color: '#F97316',
            weight: 1,
            fillOpacity: 0.08,
        }).addTo(mapa.current)

        const puntos: L.LatLngExpression[] = [[coordCliente.lat, coordCliente.lng]]
        if (coordInicio) {
            L.marker([coordInicio.lat, coordInicio.lng], { icon: ICONO_INICIO }).addTo(mapa.current)
            puntos.push([coordInicio.lat, coordInicio.lng])
        }
        if (coordFinal) {
            L.marker([coordFinal.lat, coordFinal.lng], { icon: ICONO_FIN }).addTo(mapa.current)
            puntos.push([coordFinal.lat, coordFinal.lng])
        }
        mapa.current.fitBounds(L.latLngBounds(puntos).pad(0.4))

        return () => {
            mapa.current?.remove()
            mapa.current = null
        }
    }, [coordInicio, coordFinal, coordCliente])

    return <div ref={contenedor} className="h-56 w-full rounded-md" />
}
```

- [ ] **Step 4: Escribir el panel**

Crear `src/components/analitica/DetalleVisitaPanel.tsx`:

```typescript
import { X } from 'lucide-react'
import MapaVisita from './MapaVisita'
import { useVisitaDetalle } from '@/hooks/useAnalitica'
import { claseDistancia, formatDistancia, formatDuracion } from '@/lib/analiticaFormat'
import type { ResultadoMotivo } from '@/types/planificacion'

interface DetalleVisitaPanelProps {
    visitaId: number
    onCerrar: () => void
}

const ETIQUETA_RESULTADO: Record<string, string> = {
    ganado: 'Ganado',
    diferido: 'Diferido',
    perdido: 'Perdido',
    no_ofrecido: 'No ofrecido',
}

const CLASE_DISTANCIA: Record<string, string> = {
    ok: 'text-emerald-600',
    alerta: 'text-red-600',
    neutro: 'text-slate-400',
}

const hora = (iso: string | null) => (iso ? iso.slice(11, 16) : '—')

const etiqueta = (r: ResultadoMotivo | null) => (r ? ETIQUETA_RESULTADO[r] : '—')

export default function DetalleVisitaPanel({ visitaId, onCerrar }: DetalleVisitaPanelProps) {
    const { data, isLoading, isError } = useVisitaDetalle(visitaId)

    return (
        <aside className="fixed inset-y-0 right-0 z-30 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                        {data?.nombreCliente ?? 'Detalle de la visita'}
                    </h2>
                    {data?.direccion && <p className="text-xs text-slate-500">{data.direccion}</p>}
                </div>
                <button
                    type="button"
                    onClick={onCerrar}
                    aria-label="Cerrar"
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {isLoading && <p className="px-5 py-6 text-sm text-slate-500">Cargando…</p>}
            {isError && (
                <p className="px-5 py-6 text-sm text-red-700">No se pudo cargar el detalle.</p>
            )}

            {data && (
                <div className="space-y-5 px-5 py-4">
                    <dl className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                            <dt className="text-xs text-slate-500">Inicio</dt>
                            <dd className="text-slate-900">{hora(data.fechaInicio)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-slate-500">Fin</dt>
                            <dd className="text-slate-900">{hora(data.fechaFin)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-slate-500">Duración</dt>
                            <dd className="text-slate-900">{formatDuracion(data.duracionMin)}</dd>
                        </div>
                    </dl>

                    <div>
                        <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                            Ubicación —{' '}
                            <span className={CLASE_DISTANCIA[claseDistancia(data.distanciaMetros)]}>
                                {formatDistancia(data.distanciaMetros)}
                            </span>
                        </p>
                        {data.coordCliente ? (
                            <MapaVisita
                                coordInicio={data.coordInicio}
                                coordFinal={data.coordFinal}
                                coordCliente={data.coordCliente}
                            />
                        ) : (
                            <p className="rounded-md bg-slate-50 px-3 py-4 text-xs text-slate-500">
                                Sin coordenadas del cliente: la visita no se puede verificar.
                            </p>
                        )}
                    </div>

                    <div>
                        <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                            Rubros de la visita
                        </p>
                        <ul className="space-y-2">
                            {data.rubros.map(r => (
                                <li
                                    key={r.rubroCode}
                                    data-testid={`rubro-${r.rubroCode}`}
                                    className="rounded-md border border-slate-200 px-3 py-2"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-slate-900">
                                            {r.rubroDescripcion}
                                        </span>
                                        {!r.resuelto && (
                                            <span className="text-xs text-amber-600">
                                                Sin resolver
                                            </span>
                                        )}
                                    </div>
                                    {r.motivos.map((m, i) => (
                                        <p key={i} className="mt-1 text-xs text-slate-600">
                                            {m.descripcion} · {etiqueta(m.resultado)}
                                            {m.marca && ` · ${m.marca}`}
                                            {m.competidor && ` vs. ${m.competidor}`}
                                            {m.pctDiferencia !== null && ` (${m.pctDiferencia}%)`}
                                        </p>
                                    ))}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </aside>
    )
}
```

- [ ] **Step 5: Conectarlo a la página del vendedor**

En `src/pages/AnaliticaVendedorPage.tsx`, agregar el import:

```typescript
import DetalleVisitaPanel from '@/components/analitica/DetalleVisitaPanel'
```

Y reemplazar el placeholder `{visitaElegida !== null && null}` por:

```typescript
                {visitaElegida !== null && (
                    <DetalleVisitaPanel
                        visitaId={visitaElegida}
                        onCerrar={() => setVisitaElegida(null)}
                    />
                )}
```

- [ ] **Step 6: Correr toda la suite**

Run: `npm test`
Expected: PASS, toda la suite.

- [ ] **Step 7: Verificar el build y el recorrido completo en el navegador**

Run: `npm run build`
Expected: sin errores de `tsc -b`.

Run: `npm run dev`. Recorrer: `/analitica` → click en ESQUIVEL RAMON → ver sus visitas con distancias en rojo → click en una visita → el panel abre con el mapa, los dos puntos y el círculo de 300 m. Verificar que una visita con `s/d` muestra el aviso en vez del mapa.

- [ ] **Step 8: Commit**

```bash
git add src/components/analitica/DetalleVisitaPanel.tsx src/components/analitica/DetalleVisitaPanel.test.tsx src/components/analitica/MapaVisita.tsx src/pages/AnaliticaVendedorPage.tsx
git commit -m "feat(analitica): nivel 3 con panel de detalle y mapa de los dos puntos"
```

---

## Qué queda para la Fase 2 (otro plan, otro repo)

Cuando el dashboard convenza, en `api-vendedores`:

1. Tabla `pl_objetivo` + seed con 160 clientes / 6000 minutos.
2. `AnaliticaRepository` con las agregaciones sobre `pl_ciclo_semana`, `pl_ciclo_cliente`, `pl_visita`, `pl_visita_rubro`, `pl_visita_rubro_motivo` y `pl_no_visita_motivo`.
3. `AnaliticaService` con el cálculo de indicadores y sus tests: cobertura con ciclo a medias, distancia exactamente en 300 m, prorrateo por días hábiles, `rubrosOfrecidos = 0` → `null`, resolución de objetivo (vendedor > global > ninguno).
4. `src/routes/analitica.ts` con `authorize('admin', 'versus-ger', 'supervisor')` y su test de 403 para el rol `vendedor`.
5. Documentar los cuatro endpoints en `src/docs/`.

Después, en este repo: sacar `VITE_ANALITICA_MOCK` de `.env`, verificar el recorrido contra datos reales y borrar el fixture si ya no aporta a los tests.
