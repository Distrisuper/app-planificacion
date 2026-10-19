import { describe, it, expect } from 'vitest'
import { etiquetaEstadoSemana } from './estadoSemana'

describe('etiquetaEstadoSemana', () => {
    it('la semana en curso dice desde qué lunes', () => {
        expect(etiquetaEstadoSemana('en_curso', '2026-10-13')).toEqual({
            texto: 'En curso · semana del 13/10',
            tono: 'ok',
        })
    })

    it('la semana hecha dice el lunes de la última pasada', () => {
        expect(etiquetaEstadoSemana('hecha', '2026-10-06')).toEqual({
            texto: 'Hecha · semana del 06/10',
            tono: 'neutro',
        })
    })

    it('la pendiente no lleva etiqueta', () => {
        expect(etiquetaEstadoSemana('pendiente', null)).toBeNull()
    })

    it('sin estado (back anterior) no lleva etiqueta', () => {
        expect(etiquetaEstadoSemana(undefined, undefined)).toBeNull()
    })
})
