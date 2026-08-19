import { afterEach, vi } from 'vitest'
import {
    fechaHoraNegocio,
    horaNegocio,
    incluyeHoy,
    isoLocal,
    nombreMes,
    nombreSemana,
    rangoHoy,
    rangoMes,
    rangoSemana,
} from './fechas'

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

describe('fechaHoraNegocio', () => {
    it('formatea en hora argentina, no en la del dispositivo', () => {
        // 14:05 UTC son 11:05 en Buenos Aires (-03:00).
        expect(fechaHoraNegocio('2026-08-11T14:05:00.000Z')).toBe('11/08 11:05')
    })

    it('null o basura devuelven guión', () => {
        expect(fechaHoraNegocio(null)).toBe('—')
        expect(fechaHoraNegocio('no-es-una-fecha')).toBe('—')
    })
})

describe('rangoMes', () => {
    it('devuelve el primer y último día del mes calendario de la fecha dada', () => {
        expect(rangoMes(new Date(2026, 7, 18))).toEqual({ desde: '2026-08-01', hasta: '2026-08-31' })
    })

    it('funciona en meses de 30 y 28/29 días', () => {
        expect(rangoMes(new Date(2026, 3, 5))).toEqual({ desde: '2026-04-01', hasta: '2026-04-30' })
        expect(rangoMes(new Date(2026, 1, 10))).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
    })
})

describe('nombreMes', () => {
    it('devuelve el nombre del mes capitalizado seguido del año', () => {
        expect(nombreMes(new Date(2026, 7, 18))).toBe('Agosto 2026')
        expect(nombreMes(new Date(2026, 0, 1))).toBe('Enero 2026')
    })
})

describe('rangoSemana', () => {
    it('devuelve el lunes y el viernes de la semana que contiene la fecha', () => {
        expect(rangoSemana(new Date(2026, 7, 18))).toEqual({ desde: '2026-08-17', hasta: '2026-08-21' })
    })

    it('un domingo pertenece a la semana que termina ese día, no a la siguiente', () => {
        // 23/08/2026 es domingo: cae en la semana del 17 al 21 de agosto.
        expect(rangoSemana(new Date(2026, 7, 23))).toEqual({ desde: '2026-08-17', hasta: '2026-08-21' })
    })

    it('cruza el fin de año correctamente', () => {
        expect(rangoSemana(new Date(2026, 0, 1))).toEqual({ desde: '2025-12-29', hasta: '2026-01-02' })
    })
})

describe('nombreSemana', () => {
    it('devuelve "DD/MM al DD/MM" de la semana que contiene la fecha', () => {
        expect(nombreSemana(new Date(2026, 7, 18))).toBe('17/08 al 21/08')
    })
})
