import { describe, expect, it } from 'vitest'
import { aCsv, escaparCeldaCsv } from './csv'

describe('escaparCeldaCsv', () => {
    it('null/undefined → vacío; texto simple tal cual', () => {
        expect(escaparCeldaCsv(null)).toBe('')
        expect(escaparCeldaCsv(undefined)).toBe('')
        expect(escaparCeldaCsv('Piche')).toBe('Piche')
    })
    it('envuelve en comillas si hay ; comillas o salto de línea, y duplica las comillas', () => {
        expect(escaparCeldaCsv('a;b')).toBe('"a;b"')
        expect(escaparCeldaCsv('dijo "hola"')).toBe('"dijo ""hola"""')
        expect(escaparCeldaCsv('línea 1\nlínea 2')).toBe('"línea 1\nlínea 2"')
    })
    it('lo que Excel tomaría como fórmula va con apóstrofo adelante', () => {
        expect(escaparCeldaCsv('+54 11 4444-5555')).toBe("'+54 11 4444-5555")
        expect(escaparCeldaCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
        expect(escaparCeldaCsv('-3')).toBe("'-3")
        expect(escaparCeldaCsv('@SUMA')).toBe("'@SUMA")
        expect(escaparCeldaCsv('11 4444-5555')).toBe('11 4444-5555')
    })
})

describe('aCsv', () => {
    it('BOM UTF-8, separador ; y CRLF', () => {
        const csv = aCsv([['Comercio', 'CUIT'], ['Piche', null]])
        expect(csv.charCodeAt(0)).toBe(0xfeff)
        expect(csv.slice(1)).toBe('Comercio;CUIT\r\nPiche;')
    })
})
