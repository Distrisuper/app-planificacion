import { describe, it, expect } from 'vitest'
import { diasDeLoPegado, parsearCodigosPegados } from './pegarCodigos'

describe('parsearCodigosPegados', () => {
    it('una grilla de Excel reparte cada columna en su día, de LUN a VIE', () => {
        const texto = 'P001\tP002\tP003\tP004\tP005\nP006\t\tP007\t\tP008\n'

        expect(parsearCodigosPegados(texto)).toEqual({
            modo: 'grilla',
            dias: {
                1: ['P001', 'P006'],
                2: ['P002'],
                3: ['P003', 'P007'],
                4: ['P004'],
                5: ['P005', 'P008'],
            },
        })
    })

    it('en la grilla, una columna sin códigos dentro de lo copiado es un día vacío', () => {
        // Excel copia las celdas vacías del rango como tabs: el VIE estaba en la selección.
        const texto = 'P001\tP002\tP003\tP004\t\r\nP006\t\t\t\t\r\n'

        expect(parsearCodigosPegados(texto)).toEqual({
            modo: 'grilla',
            dias: { 1: ['P001', 'P006'], 2: ['P002'], 3: ['P003'], 4: ['P004'], 5: [] },
        })
    })

    it('en la grilla, los días que no se copiaron no vienen', () => {
        expect(parsearCodigosPegados('P001\tP002\nP003\tP004')).toEqual({
            modo: 'grilla',
            dias: { 1: ['P001', 'P003'], 2: ['P002', 'P004'] },
        })
    })

    it('ignora el renglón de encabezado con los nombres de los días', () => {
        expect(parsearCodigosPegados('LUN\tMAR\nP001\tP002')).toEqual({
            modo: 'grilla',
            dias: { 1: ['P001'], 2: ['P002'] },
        })
    })

    it('una sola columna es un código por renglón, sin espacios ni renglones en blanco', () => {
        expect(parsearCodigosPegados('  P001 \n\nP002\r\n   \nP003\n')).toEqual({
            modo: 'columna',
            codigos: ['P001', 'P002', 'P003'],
        })
    })

    it('las columnas de más allá del VIE no se cargan', () => {
        expect(parsearCodigosPegados('A\tB\tC\tD\tE\tF')).toEqual({
            modo: 'grilla',
            dias: { 1: ['A'], 2: ['B'], 3: ['C'], 4: ['D'], 5: ['E'] },
        })
    })

    it('sin códigos no hay nada para revisar', () => {
        expect(parsearCodigosPegados(' \n\t\n')).toEqual({ modo: 'vacio' })
    })
})

describe('diasDeLoPegado', () => {
    it('en una columna, los códigos van al día elegido', () => {
        expect(diasDeLoPegado({ modo: 'columna', codigos: ['P1', 'P2'] }, 3)).toEqual({
            '3': ['P1', 'P2'],
        })
    })

    it('en la grilla, cada día con sus códigos con la clave que espera el back', () => {
        expect(diasDeLoPegado({ modo: 'grilla', dias: { 1: ['P1'], 5: [] } }, 3)).toEqual({
            '1': ['P1'],
            '5': [],
        })
    })
})
