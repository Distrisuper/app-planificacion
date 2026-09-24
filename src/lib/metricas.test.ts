import {
    objetivosVenta, cumplimiento, razon, variacion, proyectar, factorProyeccion,
    formatMillones, claseCumplimiento,
} from './metricas'
import type { IMetricasFila } from '@/types/metricas'

const fila = (over: Partial<IMetricasFila> = {}): IMetricasFila => ({
    codigoVendedor: 'V1', nombreVendedor: 'X', cartera: 100, clientesVisitados: 60, visitasValidas: 80,
    minutosTotales: 3000, clientesConCompra: 40, visitadosConCompra: 30, planificados: 90,
    planificadosConCompra: 50, facturacion: 60_000_000, facturacionMmaa: 50_000_000, unidades: 200,
    unidadesMmaa: 210, superRubro: 30, superRubroMmaa: 25, rentabilidad: 0.26,
    objetivoVisitas: 160, objetivoClientes: 140, objetivoMinutos: 6000, ...over,
})

it('objetivos de venta: por vendedor × cantidad, en pesos, prorrateados fuera de mes', () => {
    expect(objetivosVenta(2, 22, true)).toEqual({ facturacion: 300_000_000, unidades: 1000, superRubro: 24 })
    expect(objetivosVenta(1, 11, false)).toEqual({ facturacion: 75_000_000, unidades: 250, superRubro: 6 })
})

it('cumplimiento y razón devuelven null sin denominador', () => {
    expect(cumplimiento(50, 100)).toBe(0.5)
    expect(cumplimiento(50, null)).toBeNull()
    expect(cumplimiento(50, 0)).toBeNull()
    expect(razon(3, 0)).toBeNull()
})

it('variación vs año anterior', () => {
    expect(variacion(110, 100)).toBeCloseTo(0.1)
    expect(variacion(10, 0)).toBeNull()
})

it('factor de proyección: días hábiles del período sobre transcurridos', () => {
    expect(factorProyeccion(22, 11)).toBe(2)
    expect(factorProyeccion(22, 0)).toBe(1)
})

it('proyectar escala acumulados y topea conteos de clientes en la cartera', () => {
    const p = proyectar(fila(), 2)
    expect(p.facturacion).toBe(120_000_000)
    expect(p.minutosTotales).toBe(6000)
    expect(p.clientesVisitados).toBe(100) // 120 topeado a cartera 100
    expect(p.cartera).toBe(100)
    expect(p.rentabilidad).toBe(0.26) // un ratio no se proyecta
    expect(p.objetivoVisitas).toBe(160)
})

it('formatMillones', () => {
    expect(formatMillones(311_400_000)).toBe('311,4')
    expect(formatMillones(0)).toBe('0')
})

it('claseCumplimiento: rojo < 50%, ámbar < 100%, verde ≥ 100%, gris sin dato', () => {
    expect(claseCumplimiento(0.3)).toContain('red')
    expect(claseCumplimiento(0.8)).toContain('amber')
    expect(claseCumplimiento(1)).toContain('emerald')
    expect(claseCumplimiento(null)).toContain('slate')
})

it('proyectar topea las filas del plan con compra en las filas del plan', () => {
    const p = proyectar(fila({ planificados: 60, planificadosConCompra: 40 }), 4.4)
    expect(p.planificadosConCompra).toBe(60) // 176 topeado: Ventas vs Planner no pasa del 100%
})
