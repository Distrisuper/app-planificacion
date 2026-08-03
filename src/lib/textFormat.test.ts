import { fixMojibake } from './textFormat'

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
