import {
    COLORES_MOTIVO,
    COLOR_MOTIVO_OTRO,
    RAMPA_CALOR,
    calorCelda,
    coloresDeMotivos,
    motivoPrincipal,
    recortarObjeciones,
} from './objecionesEquipo'
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

it('con Vendedor quedan solo los vendedores: los TV no se mezclan', () => {
    const r = recortarObjeciones(DATA, 'vendedor')
    expect(r.total).toBe(12)
    expect(r.motivos.map(m => [m.motivoId, m.cantidad])).toEqual([[1, 9], [2, 3]])
    expect(r.personas.map(p => p.codigo)).toEqual(['V1'])
})

it('con un tipo, la tarjeta cuenta solo las objeciones de esas personas', () => {
    const r = recortarObjeciones(DATA, 'farmer')
    expect(r.total).toBe(5)
    expect(r.motivos.map(m => [m.motivoId, m.cantidad])).toEqual([[2, 4], [1, 1]])
    expect(r.motivos[0].pct).toBeCloseTo(0.8)
    expect(r.personas.map(p => p.codigo)).toEqual(['9001'])
})

it('motivoPrincipal: el que más registró la persona', () => {
    const r = recortarObjeciones(DATA, 'farmer')
    expect(motivoPrincipal(DATA.personas[1], r.motivos)?.descripcion).toBe('Pasa pedido')
    expect(motivoPrincipal({ ...DATA.personas[0], motivos: [] }, r.motivos)).toBeNull()
})

describe('colores de la vista', () => {
    it('cada motivo tiene su color por su lugar en el ranking del backend, y no cambia con el filtro de tipo', () => {
        const colores = coloresDeMotivos(DATA.motivos)
        expect(colores.get(1)).toBe(COLORES_MOTIVO[0])
        expect(colores.get(3)).toBe(COLORES_MOTIVO[2])
        // Con Farmer el ranking cambia de orden (Pasa pedido primero), pero los colores salen de DATA.
        expect(recortarObjeciones(DATA, 'farmer').motivos[0].motivoId).toBe(2)
        expect(colores.get(2)).toBe(COLORES_MOTIVO[1])
    })

    it('después del octavo motivo no se inventan colores: van en gris', () => {
        const muchos = Array.from({ length: 10 }, (_, i) => ({ motivoId: i + 1 }))
        const colores = coloresDeMotivos(muchos)
        expect(new Set(Array.from(colores.values()).slice(0, 8)).size).toBe(8)
        expect(colores.get(9)).toBe(COLOR_MOTIVO_OTRO)
        expect(colores.get(10)).toBe(COLOR_MOTIVO_OTRO)
    })

    it('el calor de una celda va de claro a oscuro según su peso, con texto blanco en los dos más oscuros', () => {
        expect(calorCelda(0.01).fondo).toBe(RAMPA_CALOR[0])
        expect(calorCelda(0.5).fondo).toBe(RAMPA_CALOR[3])
        expect(calorCelda(1).fondo).toBe(RAMPA_CALOR[5])
        expect(calorCelda(0.3).textoClaro).toBe(false)
        expect(calorCelda(0.7).textoClaro).toBe(true)
    })
})
