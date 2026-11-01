import { describe, it, expect } from 'vitest'
import {
    MENSAJE_AGREGAR_FUERA_DE_CALENDARIO,
    MENSAJE_FUERA_DE_CALENDARIO,
    etiquetaSemana,
    lunesLocal,
    mensajeErrorCalendario,
    semanasNavegables,
    semanasPorMes,
    tipoDeSemana,
} from './semanaCalendario'

const fueraDeCalendario = {
    response: { status: 409, data: { code: 'SEMANA_FUERA_DE_CALENDARIO', semanaEnCurso: 2 } },
}

const horizonte = (fechas: string[], primera: number) =>
    fechas.map((fechaLunes, i) => ({ fechaLunes, semana: ((primera - 1 + i) % 5) + 1, descripcion: null, armada: false }))

describe('mensajeErrorCalendario', () => {
    it('traduce el 409 del back al mensaje del vendedor', () => {
        expect(mensajeErrorCalendario(fueraDeCalendario)).toBe(MENSAJE_FUERA_DE_CALENDARIO)
    })

    it('usa el mensaje que pide quien llama', () => {
        expect(mensajeErrorCalendario(fueraDeCalendario, MENSAJE_AGREGAR_FUERA_DE_CALENDARIO)).toBe(
            MENSAJE_AGREGAR_FUERA_DE_CALENDARIO,
        )
    })

    it('null para cualquier otro error', () => {
        expect(mensajeErrorCalendario({ response: { data: { code: 'FILA_RESUELTA' } } })).toBeNull()
        expect(mensajeErrorCalendario(new Error('red caída'))).toBeNull()
    })

    it('traduce también los demás errores del calendario', () => {
        const con = (code: string) => ({ response: { data: { code } } })
        expect(mensajeErrorCalendario(con('SEMANA_SIN_AGENDA'))).toMatch(/no tiene agenda/i)
        expect(mensajeErrorCalendario(con('FECHA_LUNES_INVALIDA'))).toMatch(/recargá/i)
        expect(mensajeErrorCalendario(con('VISITA_EN_CURSO'))).toMatch(/visita abierta de la semana pasada/i)
    })
})

describe('lunesLocal', () => {
    it('lee la fecha en la TZ local, no en UTC', () => {
        const lunes = lunesLocal('2026-11-09')
        expect([lunes.getFullYear(), lunes.getMonth(), lunes.getDate()]).toEqual([2026, 10, 9])
    })
})

describe('semanasNavegables', () => {
    it('el 2/11 no tiene pasadas: solo el horizonte', () => {
        const h = horizonte(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'], 1)
        expect(semanasNavegables('2026-11-02', h)).toEqual(h.map(s => s.fechaLunes))
    })

    it('en la semana 3 suma las dos que ya pasaron, en orden', () => {
        const h = horizonte(['2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14'], 3)
        expect(semanasNavegables('2026-11-16', h)).toEqual([
            '2026-11-02',
            '2026-11-09',
            '2026-11-16',
            '2026-11-23',
            '2026-11-30',
            '2026-12-07',
            '2026-12-14',
        ])
    })

    it('en la semana 1 del bloque siguiente sigue mirando todo el historial desde el 2/11', () => {
        const h = horizonte(['2026-12-07', '2026-12-14', '2026-12-21', '2026-12-28', '2027-01-04'], 1)
        const navegables = semanasNavegables('2026-12-07', h)
        expect(navegables[0]).toBe('2026-11-02')
        expect(navegables).toContain('2026-11-30')
        expect(navegables).toHaveLength(10)
    })
})

describe('semanasPorMes', () => {
    it('agrupa cada semana en el mes de su lunes, del mes más nuevo al más viejo', () => {
        expect(semanasPorMes(['2026-11-23', '2026-11-30', '2026-12-07', '2027-01-04'])).toEqual([
            { mes: 'Enero 2027', fechas: ['2027-01-04'] },
            { mes: 'Diciembre 2026', fechas: ['2026-12-07'] },
            { mes: 'Noviembre 2026', fechas: ['2026-11-23', '2026-11-30'] },
        ])
    })
})

describe('tipoDeSemana', () => {
    it('distingue pasada, actual y futura', () => {
        expect(tipoDeSemana('2026-11-09', '2026-11-16')).toBe('pasada')
        expect(tipoDeSemana('2026-11-16', '2026-11-16')).toBe('actual')
        expect(tipoDeSemana('2026-11-23', '2026-11-16')).toBe('futura')
    })
})

describe('etiquetaSemana', () => {
    it('usa el nombre de la zona y la fecha del lunes', () => {
        expect(etiquetaSemana({ fechaLunes: '2026-11-09', semana: 2, descripcion: 'Zárate' })).toBe('Zárate · 9/11')
    })

    it('sin nombre cae a "Semana N"', () => {
        expect(etiquetaSemana({ fechaLunes: '2026-11-09', semana: 2, descripcion: null })).toBe('Semana 2 · 9/11')
    })
})
