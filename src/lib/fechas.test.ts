import { afterEach, vi } from 'vitest'
import { incluyeHoy, isoLocal, rangoHoy } from './fechas'

afterEach(() => vi.useRealTimers())

it('isoLocal a las 22:30 devuelve el día local, no el siguiente en UTC', () => {
    // 22:30 hora local de Buenos Aires = 01:30 UTC del día siguiente.
    expect(isoLocal(new Date(2026, 7, 3, 22, 30))).toBe('2026-08-03')
})

it('isoLocal completa mes y día con cero a la izquierda', () => {
    expect(isoLocal(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05')
})

it('rangoHoy devuelve el mismo día en desde y hasta', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 3, 22, 30))
    expect(rangoHoy()).toEqual({ desde: '2026-08-03', hasta: '2026-08-03' })
})

it('incluyeHoy reconoce el rango que contiene el día de hoy', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 3, 10, 0))
    expect(incluyeHoy('2026-08-03', '2026-08-03')).toBe(true)
    expect(incluyeHoy('2026-08-01', '2026-08-07')).toBe(true)
})

it('incluyeHoy es falso para un rango enteramente pasado', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 3, 10, 0))
    expect(incluyeHoy('2026-07-20', '2026-07-24')).toBe(false)
})
