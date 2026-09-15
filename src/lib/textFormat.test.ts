import { fixMojibake, identidadCliente } from './textFormat'

describe('fixMojibake', () => {
    it('revierte texto double-encoded (UTF-8 leído como latin1)', () => {
        expect(fixMojibake('SaquÃ© pedido')).toBe('Saqué pedido')
        expect(fixMojibake('Pasa pedido maÃ±ana')).toBe('Pasa pedido mañana')
        expect(fixMojibake('No lo ofrecÃ­')).toBe('No lo ofrecí')
    })

    it('deja intacto texto ya correctamente codificado', () => {
        expect(fixMojibake('Saqué pedido')).toBe('Saqué pedido')
        expect(fixMojibake('Pasa pedido mañana')).toBe('Pasa pedido mañana')
    })

    it('deja intacto texto sin acentos', () => {
        expect(fixMojibake('Precio')).toBe('Precio')
        expect(fixMojibake('')).toBe('')
    })

    it('deja intacto texto con caracteres fuera de latin-1 (no es candidato a mojibake)', () => {
        expect(fixMojibake('日本語')).toBe('日本語')
    })
})

describe('identidadCliente', () => {
    const base = { codigoParticularCliente: '10034', nombreCliente: 'DERQUI AUTOPARTES SRL' }

    it('suma la razón social cuando el título de arriba muestra el cartel', () => {
        expect(identidadCliente({ ...base, nombreFantasia: 'AUTOPIEZAS DERQUI' })).toBe(
            '#10034 · DERQUI AUTOPARTES SRL',
        )
    })

    it('deja solo el código cuando no hay cartel: el título ya muestra la razón social', () => {
        expect(identidadCliente(base)).toBe('#10034')
        expect(identidadCliente({ ...base, nombreFantasia: '' })).toBe('#10034')
        expect(identidadCliente({ ...base, nombreFantasia: '   ' })).toBe('#10034')
    })

    it('no repite el nombre cuando el cartel ES la razón social', () => {
        expect(identidadCliente({ ...base, nombreFantasia: 'DERQUI AUTOPARTES SRL' })).toBe('#10034')
        // El warehouse no es consistente con espacios ni casing entre los dos campos.
        expect(identidadCliente({ ...base, nombreFantasia: '  Derqui Autopartes Srl ' })).toBe(
            '#10034',
        )
    })

    it('no toca el casing: los headers muestran los nombres como los manda el backend', () => {
        expect(identidadCliente({ ...base, nombreFantasia: 'AUTOPIEZAS DERQUI' })).toContain(
            'DERQUI AUTOPARTES SRL',
        )
    })
})
