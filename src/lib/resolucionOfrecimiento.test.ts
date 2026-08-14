import { detalleCompleto, motivoIncompleto, tieneDetalleIncompleto, motivosIguales } from './resolucionOfrecimiento'
import type { IMotivo, IOfrecimientoMotivo } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'ofrecimiento', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'ofrecimiento', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
]

it('detalleCompleto es falso si falta cualquier campo', () => {
    expect(detalleCompleto({ motivoId: 13, marca: null, competidor: null, pctDiferencia: null })).toBe(false)
    expect(detalleCompleto({ motivoId: 13, marca: 'Fric-Rot', competidor: null, pctDiferencia: null })).toBe(false)
})

it('detalleCompleto es true con los tres campos cargados', () => {
    expect(detalleCompleto({ motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 12 })).toBe(true)
})

it('motivoIncompleto devuelve null si no hay ningún motivo con requiereDetalle tildado', () => {
    const value: IOfrecimientoMotivo[] = [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }]
    expect(motivoIncompleto(motivos, value)).toBeNull()
})

it('motivoIncompleto devuelve el motivo si Precio está tildado sin el detalle completo', () => {
    const value: IOfrecimientoMotivo[] = [{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }]
    expect(motivoIncompleto(motivos, value)?.descripcion).toBe('Precio')
})

it('motivoIncompleto devuelve null si Precio está tildado con el detalle completo', () => {
    const value: IOfrecimientoMotivo[] = [{ motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 12 }]
    expect(motivoIncompleto(motivos, value)).toBeNull()
})

it('tieneDetalleIncompleto refleja motivoIncompleto como booleano', () => {
    expect(tieneDetalleIncompleto(motivos, [{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])).toBe(true)
    expect(tieneDetalleIncompleto(motivos, [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }])).toBe(false)
})

it('motivosIguales es true para dos listas vacías', () => {
    expect(motivosIguales([], [])).toBe(true)
})

it('motivosIguales es false si difiere la cantidad', () => {
    const a: IOfrecimientoMotivo[] = [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }]
    expect(motivosIguales(a, [])).toBe(false)
})

it('motivosIguales es true sin importar el orden', () => {
    const a: IOfrecimientoMotivo[] = [
        { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
        { motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 12 },
    ]
    const b: IOfrecimientoMotivo[] = [
        { motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 12 },
        { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
    ]
    expect(motivosIguales(a, b)).toBe(true)
})

it('motivosIguales es false si cambió un campo de detalle', () => {
    const a: IOfrecimientoMotivo[] = [{ motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 12 }]
    const b: IOfrecimientoMotivo[] = [{ motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 15 }]
    expect(motivosIguales(a, b)).toBe(false)
})
