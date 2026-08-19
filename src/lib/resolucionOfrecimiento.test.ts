import { motivoIncompleto, tieneDetalleIncompleto, motivosIguales } from './resolucionOfrecimiento'
import type { IMotivo, IOfrecimientoMotivo } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 30, nivel: 'ofrecimiento', descripcion: 'Precio', resultado: 'perdido', codigo: 'PRECIO' },
    { motivoId: 35, nivel: 'ofrecimiento', descripcion: 'Dto', resultado: 'ganado', codigo: null },
]

const completo: IOfrecimientoMotivo = {
    motivoId: 30,
    valores: { marca: 'Fric-Rot', competidor: 'Corven', precio_competidor: 150, mi_precio: 130 },
}

it('un motivo sin codigo nunca está incompleto: no pide nada', () => {
    expect(motivoIncompleto(motivos, [{ motivoId: 35, valores: {} }])).toBeNull()
})

it('señala CUÁL motivo tiene el detalle a medias', () => {
    const incompleto = { motivoId: 30, valores: { marca: 'Fric-Rot' } }
    expect(motivoIncompleto(motivos, [incompleto])?.descripcion).toBe('Precio')
})

it('con el detalle completo no señala nada', () => {
    expect(motivoIncompleto(motivos, [completo])).toBeNull()
})

// Un motivo cuyo codigo no tiene módulo registrado (catálogo por delante del deploy) no
// puede bloquear al vendedor: si no hay formulario que completar, no hay nada a medias.
it('un codigo sin módulo registrado no bloquea', () => {
    const raro: IMotivo[] = [{ ...motivos[0], codigo: 'TODAVIA_NO_EXISTE' }]
    expect(motivoIncompleto(raro, [{ motivoId: 30, valores: {} }])).toBeNull()
})

it('tieneDetalleIncompleto es el booleano de lo mismo', () => {
    expect(tieneDetalleIncompleto(motivos, [{ motivoId: 30, valores: {} }])).toBe(true)
    expect(tieneDetalleIncompleto(motivos, [completo])).toBe(false)
})

describe('motivosIguales', () => {
    it('compara los valores, no solo los ids', () => {
        const otro = { motivoId: 30, valores: { ...completo.valores, mi_precio: 999 } }
        expect(motivosIguales([completo], [otro])).toBe(false)
    })

    it('no depende del orden', () => {
        const a = [completo, { motivoId: 35, valores: {} }]
        const b = [{ motivoId: 35, valores: {} }, completo]
        expect(motivosIguales(a, b)).toBe(true)
    })
})
