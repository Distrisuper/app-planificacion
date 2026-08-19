import { validadoresDetalleMotivo } from './validadores'

describe('PRECIO', () => {
    const v = validadoresDetalleMotivo.PRECIO
    const completo = { marca: 'Fric-Rot', competidor: 'Corven', precio_competidor: 150, mi_precio: 130 }

    it('declara sus cuatro campos', () => {
        expect(v.campos).toEqual(['marca', 'competidor', 'precio_competidor', 'mi_precio'])
    })

    it('es válido con los cuatro cargados', () => {
        expect(v.esValido(completo)).toBe(true)
    })

    it('no es válido si falta uno', () => {
        expect(v.esValido({ ...completo, mi_precio: null })).toBe(false)
    })

    it('un texto en blanco no cuenta como cargado', () => {
        expect(v.esValido({ ...completo, competidor: '   ' })).toBe(false)
    })

    // El resumen es lo que ve gerencia en la tabla de ofrecimientos.
    it('resume contra quién y por cuánto', () => {
        expect(v.resumen(completo)).toBe('Fric-Rot vs. Corven · -13.3%')
    })
})

describe('PLAZO', () => {
    const v = validadoresDetalleMotivo.PLAZO

    it('pide los días', () => {
        expect(v.esValido({ plazo_dias: 30 })).toBe(true)
        expect(v.esValido({ plazo_dias: null })).toBe(false)
    })

    // Un plazo de 0 días no es un plazo: es no haber cargado nada.
    it('cero no es un plazo válido', () => {
        expect(v.esValido({ plazo_dias: 0 })).toBe(false)
    })

    it('resume con la unidad', () => {
        expect(v.resumen({ plazo_dias: 30 })).toBe('30 días')
    })
})

describe('FLETE', () => {
    const v = validadoresDetalleMotivo.FLETE

    it('pide los dos montos', () => {
        expect(v.esValido({ valor_flete: 60000, compra_futuro: 3000000 })).toBe(true)
        expect(v.esValido({ valor_flete: 60000 })).toBe(false)
    })

    it('resume con el peso del flete sobre la compra', () => {
        expect(v.resumen({ valor_flete: 60000, compra_futuro: 3000000 })).toBe('Flete 2.0% de la compra')
    })
})

describe('NO_TRABAJA', () => {
    const v = validadoresDetalleMotivo.NO_TRABAJA

    it('pide la marca que trabaja', () => {
        expect(v.esValido({ marca_trabaja: 'Corven' })).toBe(true)
        expect(v.esValido({})).toBe(false)
    })

    // `por_que` es contexto para leer, no para agrupar: no se exige.
    it('el porqué es opcional', () => {
        expect(v.esValido({ marca_trabaja: 'Corven', por_que: null })).toBe(true)
    })
})
