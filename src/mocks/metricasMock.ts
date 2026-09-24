import type {
    ICategoriasMetricas, IClientesDeTramo, IMetricasFila, IMetricasResumen,
    IObjecionDetalle, IObjecionesMetricas, IOpcionesMetricas,
} from '@/types/metricas'

function fila(over: Partial<IMetricasFila> & { codigoVendedor: string; nombreVendedor: string }): IMetricasFila {
    return {
        cartera: 145, clientesVisitados: 119, visitasValidas: 142, minutosTotales: 4932,
        clientesConCompra: 72, visitadosConCompra: 61, planificados: 92, planificadosConCompra: 55,
        facturacion: 132_000_000, facturacionMmaa: 120_000_000, unidades: 430, unidadesMmaa: 450,
        superRubro: 310, superRubroMmaa: 290, rentabilidad: 0.26,
        objetivoVisitas: 160, objetivoClientes: 140, objetivoMinutos: 6000, ...over,
    }
}

const VENDEDORES = [
    fila({ codigoVendedor: 'V 2', nombreVendedor: 'FERNANDEZ MARCELO' }),
    fila({
        codigoVendedor: 'V 5', nombreVendedor: 'GOMEZ SERGIO', cartera: 155, clientesVisitados: 65,
        visitasValidas: 79, minutosTotales: 2454, clientesConCompra: 31, visitadosConCompra: 20,
        planificados: 51, planificadosConCompra: 25, facturacion: 71_000_000, rentabilidad: 0.19,
    }),
    fila({
        codigoVendedor: 'V 9', nombreVendedor: 'MARTINEZ GUSTAVO', cartera: 120, clientesVisitados: 0,
        visitasValidas: 0, minutosTotales: 0, clientesConCompra: 0, visitadosConCompra: 0,
        planificados: 0, planificadosConCompra: 0, facturacion: 0, facturacionMmaa: 0, unidades: 0,
        superRubro: 0, rentabilidad: null,
    }),
]

const sumar = (k: keyof IMetricasFila) => VENDEDORES.reduce((a, v) => a + (v[k] as number), 0)

export const MOCK_RESUMEN_METRICAS: IMetricasResumen = {
    desde: '2026-09-01', hasta: '2026-09-30', diasHabiles: 22, diasHabilesTranscurridos: 13, mesCompleto: true,
    vendedores: VENDEDORES,
    equipo: {
        ...fila({ codigoVendedor: '', nombreVendedor: 'Total equipo' }),
        ...Object.fromEntries(
            (['cartera', 'clientesVisitados', 'visitasValidas', 'minutosTotales', 'clientesConCompra',
              'visitadosConCompra', 'planificados', 'planificadosConCompra', 'facturacion', 'facturacionMmaa',
              'unidades', 'unidadesMmaa', 'superRubro', 'superRubroMmaa', 'objetivoVisitas', 'objetivoClientes',
              'objetivoMinutos'] as (keyof IMetricasFila)[]).map(k => [k, sumar(k)]),
        ),
        rentabilidad: 0.24,
    },
}

export const MOCK_OBJECIONES_METRICAS: IObjecionesMetricas = {
    total: 20, planificados: 143,
    motivos: [
        { motivoId: 1, descripcion: 'Precio', cantidad: 9, pct: 0.45 },
        { motivoId: 2, descripcion: 'Marca', cantidad: 6, pct: 0.3 },
        { motivoId: 3, descripcion: 'Plazo', cantidad: 3, pct: 0.15 },
        { motivoId: 4, descripcion: 'Flete', cantidad: 2, pct: 0.1 },
    ],
}

export const MOCK_OBJECION_DETALLE: IObjecionDetalle = {
    motivoId: 1, descripcion: 'Precio',
    marcas: [{ descripcion: 'Bosch', cantidad: 4, pct: 0.5 }, { descripcion: 'NGK', cantidad: 4, pct: 0.5 }],
    rubros: [{ descripcion: 'BUJES', cantidad: 5, pct: 0.625 }, { descripcion: 'FILTRO', cantidad: 3, pct: 0.375 }],
    clientes: {
        total: 2, pagina: 1, cant: 8,
        filas: [
            { codigo: '06856', nombre: 'Nonno Suspension', direccion: 'Mitre 1200', telefono: '223 555-0101', localidad: 'Mar del Plata', vendedor: 'FERNANDEZ MARCELO' },
            { codigo: '07120', nombre: 'Repuestos del Sur', direccion: 'Colón 450', telefono: null, localidad: 'Mar del Plata', vendedor: 'FERNANDEZ MARCELO' },
        ],
    },
}

export const MOCK_CATEGORIAS: ICategoriasMetricas = {
    mes: '2026-09',
    tramos: [
        { tramo: 'sinCompras', cantidad: 210 }, { tramo: 'menos1M', cantidad: 120 },
        { tramo: 'entre1y3M', cantidad: 60 }, { tramo: 'entre3y5M', cantidad: 20 }, { tramo: 'mas5M', cantidad: 10 },
    ],
    subieron: 32, bajaron: 41,
}

export const MOCK_CLIENTES_TRAMO: IClientesDeTramo = {
    total: 2, pagina: 1, cant: 8,
    filas: [
        { codigo: '06856', nombre: 'Nonno Suspension', actual: 8_600_000, promedio6m: 13_500_000, variacion: -0.363 },
        { codigo: '07120', nombre: 'Repuestos del Sur', actual: 5_100_000, promedio6m: 4_000_000, variacion: 0.275 },
    ],
}

export const MOCK_OPCIONES: IOpcionesMetricas = {
    sucursales: [
        { codigo: 'BA', descripcion: 'Buenos Aires' }, { codigo: 'MDP', descripcion: 'Mar del Plata' },
        { codigo: 'PICO', descripcion: 'Pico' }, { codigo: 'ROSARIO', descripcion: 'Rosario' },
    ],
    zonas: [{ codigo: '01', descripcion: 'Costa Atlántica' }, { codigo: '02', descripcion: 'Rosario y Gran Rosario' }],
    localidades: [
        { localidad: 'Mar del Plata', zona: '01' }, { localidad: 'Miramar', zona: '01' },
        { localidad: 'Rosario', zona: '02' },
    ],
}
