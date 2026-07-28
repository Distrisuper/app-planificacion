import { errorCode } from './apiError'

it('extrae el code de un error de axios', () => {
    expect(errorCode({ response: { data: { ok: 0, code: 'CICLO_NO_ABIERTO' } } })).toBe(
        'CICLO_NO_ABIERTO',
    )
})

it('devuelve null cuando la respuesta no trae code', () => {
    expect(errorCode({ response: { data: { ok: 0, error: 'boom' } } })).toBeNull()
})

it('devuelve null ante un error de red sin response', () => {
    expect(errorCode(new Error('Network Error'))).toBeNull()
})

it('no explota con null ni con formas inesperadas', () => {
    expect(errorCode(null)).toBeNull()
    expect(errorCode('boom')).toBeNull()
    expect(errorCode({ response: {} })).toBeNull()
})
