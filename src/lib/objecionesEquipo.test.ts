import { motivoPrincipal, recortarObjeciones } from './objecionesEquipo'
import type { IObjecionesPorPersona } from '@/types/metricasEquipo'

const DATA: IObjecionesPorPersona = {
    total: 20,
    motivos: [
        { motivoId: 1, descripcion: 'No lo ofrecí', resultado: 'no_ofrecido', cantidad: 10, pct: 0.5 },
        { motivoId: 2, descripcion: 'Pasa pedido', resultado: 'diferido', cantidad: 7, pct: 0.35 },
        { motivoId: 3, descripcion: 'Cupo', resultado: 'perdido', cantidad: 3, pct: 0.15 },
    ],
    personas: [
        { codigo: 'V1', nombre: 'ACOSTA', tipo: 'vendedor', total: 12, motivos: [{ motivoId: 1, cantidad: 9 }, { motivoId: 2, cantidad: 3 }] },
        { codigo: '9001', nombre: 'ANA', tipo: 'farmer', total: 5, motivos: [{ motivoId: 2, cantidad: 4 }, { motivoId: 1, cantidad: 1 }] },
        { codigo: '9002', nombre: 'BETO', tipo: 'hunter', total: 3, motivos: [{ motivoId: 3, cantidad: 3 }] },
    ],
}

it('con "Todos" respeta los números del backend', () => {
    const r = recortarObjeciones(DATA, 'todos')
    expect(r.total).toBe(20)
    expect(r.motivos.map(m => [m.motivoId, m.cantidad])).toEqual([[1, 10], [2, 7], [3, 3]])
    expect(r.personas).toHaveLength(3)
})

it('con un tipo, la tarjeta cuenta solo las objeciones de esas personas', () => {
    const r = recortarObjeciones(DATA, 'farmer')
    expect(r.total).toBe(5)
    expect(r.motivos.map(m => [m.motivoId, m.cantidad])).toEqual([[2, 4], [1, 1]])
    expect(r.motivos[0].pct).toBeCloseTo(0.8)
    expect(r.personas.map(p => p.codigo)).toEqual(['9001'])
})

it('motivoPrincipal: el que más registró la persona', () => {
    const r = recortarObjeciones(DATA, 'todos')
    expect(motivoPrincipal(DATA.personas[1], r.motivos)?.descripcion).toBe('Pasa pedido')
    expect(motivoPrincipal({ ...DATA.personas[0], motivos: [] }, r.motivos)).toBeNull()
})
