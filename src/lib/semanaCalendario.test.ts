import { describe, it, expect } from 'vitest'
import {
    MENSAJE_AGREGAR_FUERA_DE_CALENDARIO,
    MENSAJE_FUERA_DE_CALENDARIO,
    mensajeFueraDeCalendario,
    sePuedeTraer,
} from './semanaCalendario'

const fueraDeCalendario = {
    response: { status: 409, data: { code: 'SEMANA_FUERA_DE_CALENDARIO', semanaEnCurso: 2 } },
}

describe('mensajeFueraDeCalendario', () => {
    it('traduce el 409 del back al mensaje del vendedor', () => {
        expect(mensajeFueraDeCalendario(fueraDeCalendario)).toBe(MENSAJE_FUERA_DE_CALENDARIO)
    })

    it('usa el mensaje que pide quien llama', () => {
        expect(mensajeFueraDeCalendario(fueraDeCalendario, MENSAJE_AGREGAR_FUERA_DE_CALENDARIO)).toBe(
            MENSAJE_AGREGAR_FUERA_DE_CALENDARIO,
        )
    })

    it('null para cualquier otro error', () => {
        expect(mensajeFueraDeCalendario({ response: { data: { code: 'FILA_RESUELTA' } } })).toBeNull()
        expect(mensajeFueraDeCalendario(new Error('red caída'))).toBeNull()
    })
})

describe('sePuedeTraer', () => {
    it('una zona que viene se puede traer', () => {
        expect(sePuedeTraer(4, 3)).toBe(true)
    })

    it('una zona que ya pasó no: sus pendientes los rescata gerencia', () => {
        expect(sePuedeTraer(2, 3)).toBe(false)
    })

    it('sin calendario se puede siempre, como antes', () => {
        expect(sePuedeTraer(2, null)).toBe(true)
    })
})
