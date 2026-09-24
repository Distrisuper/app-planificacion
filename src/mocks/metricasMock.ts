import type { IMetricas, IMetricaCliente } from '@/types/metricas'
import { mesActual, mesAnterior } from '@/lib/metricas/mes'

const MES = mesActual()

export const MOCK_METRICAS: IMetricas = {
    mes: MES,
    sujeto: { tipo: 'vendedor', codigo: 'V 2', nombre: 'ACOSTA MARIANO' },
    actualizadoEn: new Date().toISOString(),
    fuentes: { ventas: 'ok' },
    visitas: { actual: 82, objetivo: 160, anterior: 140 },
    clientesVisitados: { actual: 71, objetivo: 140, anterior: 118 },
    minutos: { actual: 2460, objetivo: 6000, anterior: 4930 },
    efectividadOperativa: { actual: 0.47, anterior: 0.84 },
    cobertura: { actual: 0.55, anterior: 0.91 },
    efectividadComercial: { actual: 0.42, anterior: 0.38, ofrecidos: 210, ganados: 88, diferidos: 60, perdidos: 62 },
    objeciones: { total: 58, top: [
        { etiqueta: 'Precio', valor: 21 }, { etiqueta: 'Marca', valor: 14 }, { etiqueta: 'Ya tiene stock', valor: 9 },
        { etiqueta: 'Plazo', valor: 8 }, { etiqueta: 'No trabaja el rubro', valor: 6 } ] },
    ventas: {
        facturacion: { actual: 132_400_000, objetivo: 150_000_000, anterior: 121_000_000 },
        unidades: { actual: 430, objetivo: 500, anterior: 398 },
        superRubros: { actual: 10, objetivo: null, anterior: 9 },
        clientesPorEstado: [
            { etiqueta: 'Activo', valor: 52 }, { etiqueta: 'Pasivo', valor: 23 },
            { etiqueta: 'Inactivo', valor: 70 }, { etiqueta: 'Crítico', valor: 6 } ],
        clientesEnCaida: [
            { etiqueta: 'MUNDO AUTOPARTES SRL', valor: 0.42 }, { etiqueta: 'VENEZIA FRANCISCO', valor: 0.64 },
            { etiqueta: 'PIERMATTEI JUAN CARLOS', valor: 0.62 } ],
    },
}

export const MOCK_METRICAS_ANTERIOR: IMetricas = {
    ...MOCK_METRICAS,
    mes: mesAnterior(MES),
    visitas: { actual: 140, objetivo: 160, anterior: 151 },
    clientesVisitados: { actual: 118, objetivo: 140, anterior: 125 },
    minutos: { actual: 4930, objetivo: 6000, anterior: 5100 },
    efectividadOperativa: { actual: 0.84, anterior: 0.9 },
    cobertura: { actual: 0.91, anterior: 0.88 },
}

export const MOCK_METRICAS_EQUIPO: IMetricas = {
    ...MOCK_METRICAS,
    sujeto: { tipo: 'equipo', codigo: null, nombre: 'Equipo' },
    visitas: { actual: 310, objetivo: 640, anterior: 560 },
    clientesVisitados: { actual: 280, objetivo: 560, anterior: 470 },
    minutos: { actual: 9800, objetivo: 24000, anterior: 19700 },
}

export const MOCK_CLIENTES: IMetricaCliente[] = [
    { codigoParticularCliente: '00311', nombre: 'MUNDO AUTOPARTES SRL', actual: 88_100_000, promedio6m: 152_600_000, variacion: -0.42 },
    { codigoParticularCliente: '01820', nombre: 'SUSPENSION CARLITOS SRL', actual: 23_500_000, promedio6m: 19_300_000, variacion: 0.22 },
    { codigoParticularCliente: '02231', nombre: 'GIUSTI LUCAS LEANDRO', actual: 0, promedio6m: 8_600_000, variacion: -1 },
    { codigoParticularCliente: '00987', nombre: 'TALLER LA ESQUINA', actual: 0, promedio6m: 0, variacion: null },
]
