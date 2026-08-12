import { describe, it, expect } from 'vitest'
import { errorCode, errorData } from './apiError'

function conBody(data: unknown) {
    return { response: { data } }
}

describe('errorCode', () => {
    it('lee el code de la respuesta', () => {
        expect(errorCode(conBody({ code: 'CICLO_NO_ABIERTO' }))).toBe('CICLO_NO_ABIERTO')
    })

    it('null si no hay code', () => {
        expect(errorCode(new Error('red caída'))).toBeNull()
    })
})

describe('errorData', () => {
    it('devuelve el body completo de un error de negocio', () => {
        const data = { code: 'SEMANA_FUERA_DEL_SET', semanas: [1, 2, 3, 4] }
        expect(errorData(conBody(data))).toEqual(data)
    })

    it('null si el error no tiene response.data', () => {
        expect(errorData(new Error('red caída'))).toBeNull()
    })
})
