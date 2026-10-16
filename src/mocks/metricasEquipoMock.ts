import type {
    IObjecionesPorPersona,
    IProductividadTvResponse,
    IRubroCatalogo,
    IVentasVendedor,
} from '@/types/metricasEquipo'

/** Fixtures de la pestaña Métricas para el modo demo (VITE_ANALITICA_MOCK=1). Usan los
 *  mismos vendedores (V1…V10) y TV (9001…9003) que analiticaMock. */

export const MOCK_PRODUCTIVIDAD_TV: IProductividadTvResponse = {
    desde: '2026-07-20',
    hasta: '2026-07-24',
    diasHabiles: 5,
    tvs: [
        {
            codigoParticularTv: '9001', nombreTv: 'GOMEZ LUCIA (TV)', perfil: 'farmer', activo: true,
            llamados: 81, atendidos: 46, conVenta: 19, metaDiaria: 15, objetivoMensual: 330, objetivo: 75, pctCumplimiento: 1.08,
        },
        {
            codigoParticularTv: '9002', nombreTv: 'ROMERO JULIAN (TV)', perfil: 'hunter', activo: true,
            llamados: 142, atendidos: 51, conVenta: 12, metaDiaria: 35, objetivoMensual: 770, objetivo: 175, pctCumplimiento: 0.811,
        },
        {
            codigoParticularTv: '9004', nombreTv: '', perfil: null, activo: false,
            llamados: 6, atendidos: 2, conVenta: 0, metaDiaria: 0, objetivoMensual: null, objetivo: null, pctCumplimiento: null,
        },
    ],
}

const MOTIVOS = [
    { motivoId: 1, descripcion: 'No lo ofrecí', resultado: 'no_ofrecido' as const },
    { motivoId: 2, descripcion: 'Pasa pedido', resultado: 'diferido' as const },
    { motivoId: 3, descripcion: 'Cupo', resultado: 'perdido' as const },
    { motivoId: 4, descripcion: 'No trabaja la marca o cambió', resultado: 'perdido' as const },
    { motivoId: 5, descripcion: 'Dto', resultado: 'perdido' as const },
    { motivoId: 6, descripcion: 'Tiene stock', resultado: 'perdido' as const },
    { motivoId: 7, descripcion: 'Precio', resultado: 'perdido' as const },
    { motivoId: 8, descripcion: 'Flete', resultado: 'perdido' as const },
]

const PERSONAS: IObjecionesPorPersona['personas'] = [
    { codigo: 'V1', nombre: 'ACOSTA MARIANO', tipo: 'vendedor', motivos: [[1, 52], [2, 31], [3, 12], [4, 9], [5, 4], [6, 3], [7, 2]] },
    { codigo: 'V2', nombre: 'BENITEZ LAURA', tipo: 'vendedor', motivos: [[1, 38], [2, 27], [3, 9], [6, 5], [8, 1]] },
    { codigo: '9002', nombre: 'ROMERO JULIAN (TV)', tipo: 'hunter', motivos: [[2, 22], [1, 18], [4, 11], [7, 6], [3, 4]] },
    { codigo: 'V3', nombre: 'CABRERA DIEGO', tipo: 'vendedor', motivos: [[1, 21], [2, 14], [5, 6], [6, 2]] },
    { codigo: '9001', nombre: 'GOMEZ LUCIA (TV)', tipo: 'farmer', motivos: [[2, 17], [3, 8], [1, 6], [5, 3]] },
    { codigo: 'V4', nombre: 'DOMINGUEZ SILVINA', tipo: 'vendedor', motivos: [[1, 11], [2, 7], [4, 2]] },
    { codigo: '9004', nombre: '', tipo: 'sin_perfil', motivos: [[2, 2]] },
].map(p => {
    const motivos = (p.motivos as number[][]).map(([motivoId, cantidad]) => ({ motivoId, cantidad }))
    return { ...p, tipo: p.tipo as IObjecionesPorPersona['personas'][number]['tipo'], motivos, total: motivos.reduce((s, m) => s + m.cantidad, 0) }
})

const TOTAL = PERSONAS.reduce((s, p) => s + p.total, 0)

export const MOCK_OBJECIONES_POR_PERSONA: IObjecionesPorPersona = {
    total: TOTAL,
    motivos: MOTIVOS.map(m => {
        const cantidad = PERSONAS.reduce((s, p) => s + (p.motivos.find(x => x.motivoId === m.motivoId)?.cantidad ?? 0), 0)
        return { ...m, cantidad, pct: cantidad / TOTAL }
    }).sort((a, b) => b.cantidad - a.cantidad),
    personas: [...PERSONAS].sort((a, b) => b.total - a.total),
}

const venta = (base: number, mes: number, ant: number, p3: number, p6: number, p12: number, uPorPeso = 1800) => {
    const p = (monto: number, meses: number, sr: number) => ({
        amount: monto * meses, units: Math.round((monto * meses) / uPorPeso), sr: sr * meses,
    })
    return {
        thisMonth: p(mes * base, 1, 3),
        lastMonth: p(ant * base, 1, 6),
        last3Months: p(p3 * base, 3, 5.5),
        last6Months: p(p6 * base, 6, 5),
        last12Months: p(p12 * base, 12, 4.8),
    }
}

export const MOCK_VENTAS_VENDEDORES: IVentasVendedor[] = [
    { code: 'V1', name: 'ACOSTA MARIANO', totalsByPeriod: venta(1000, 230.4, 505, 440.6, 394.8, 388.4) },
    { code: 'V2', name: 'BENITEZ LAURA', totalsByPeriod: venta(1000, 124.5, 400.1, 378.5, 339.7, 321.1) },
    { code: 'V3', name: 'CABRERA DIEGO', totalsByPeriod: venta(1000, 153.8, 346, 347.3, 336.7, 347.4) },
    { code: 'V4', name: 'DOMINGUEZ SILVINA', totalsByPeriod: venta(1000, 144.7, 332.5, 309, 298.7, 304.6) },
    { code: 'V9', name: 'IBARRA MARCELO', totalsByPeriod: venta(1000, 145.5, 251.2, 252.6, 215.5, 191.2) },
    { code: 'CARTERA TV1', name: 'CARTERA TV1', totalsByPeriod: venta(1000, 17.6, 124.4, 106.5, 69.7, 44.8) },
    { code: 'V8', name: 'HERRERA NATALIA', totalsByPeriod: venta(1000, 1.1, 125.9, 51.7, 48.7, 74.2) },
]

export const MOCK_RUBROS: IRubroCatalogo[] = [
    { code: '12', description: 'Filtros' },
    { code: '20', description: 'Pastillas de freno' },
    { code: '31', description: 'Amortiguadores' },
]
