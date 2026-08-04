import { afterEach, vi } from 'vitest'
import { horaNegocio, incluyeHoy, isoLocal, rangoHoy } from './fechas'

afterEach(() => vi.useRealTimers())

describe('horaNegocio', () => {
    it('formatea el instante en hora argentina, no en UTC', () => {
        // La visita que el vendedor arrancó 12:07: el dashboard mostraba 15:07.
        expect(horaNegocio('2026-08-04T15:07:23Z')).toBe('12:07')
    })

    it('no depende de la TZ del proceso: el formateo está anclado a la de negocio', () => {
        const tzOriginal = process.env.TZ
        process.env.TZ = 'Europe/Madrid'
        try {
            expect(horaNegocio('2026-08-04T15:07:23Z')).toBe('12:07')
        } finally {
            process.env.TZ = tzOriginal
        }
    })

    it('una visita de la noche no se corre al día siguiente', () => {
        expect(horaNegocio('2026-08-05T01:30:00Z')).toBe('22:30')
    })

    it('medianoche argentina es 00:00, nunca 24:00', () => {
        expect(horaNegocio('2026-08-05T03:00:00Z')).toBe('00:00')
    })

    it('sin instante devuelve el guion, no "Invalid Date"', () => {
        expect(horaNegocio(null)).toBe('—')
        expect(horaNegocio('')).toBe('—')
        expect(horaNegocio('no es una fecha')).toBe('—')
    })
})

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
