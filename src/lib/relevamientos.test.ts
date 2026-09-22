import {
    BORRADOR_VACIO, CAMPOS_FICHA, aValoresFicha, camposPendientes, deValoresFicha,
    faltantesPerfil, relevamientoPendiente,
} from './relevamientos'

describe('relevamientoPendiente / camposPendientes', () => {
    it('true sólo si la ficha trae pendientes', () => {
        expect(relevamientoPendiente({ ficha: { pendientes: ['personas'], valores: {} } })).toBe(true)
        expect(relevamientoPendiente({ ficha: { pendientes: [], valores: {} } })).toBe(false)
    })
    it('sin ficha (backend viejo) no bloquea', () => {
        expect(relevamientoPendiente({})).toBe(false)
        expect(camposPendientes({})).toEqual([])
    })
})

describe('faltantesPerfil restringido a campos', () => {
    it('sólo cuenta los campos que se muestran', () => {
        expect(faltantesPerfil(BORRADOR_VACIO, ['facturacion'])).toEqual(['la facturación'])
        expect(faltantesPerfil(BORRADOR_VACIO, CAMPOS_FICHA)).toEqual([
            'la especialidad', 'cuántas personas trabajan', 'la facturación',
        ])
    })
    it('monomarca exige la marca sólo si especialidad está en juego y la incluye', () => {
        const b = { ...BORRADOR_VACIO, especialidades: ['monomarca'], personas: '2', facturacion: 3 }
        expect(faltantesPerfil(b, CAMPOS_FICHA)).toEqual(['qué marca'])
        expect(faltantesPerfil(b, ['personas', 'facturacion'])).toEqual([])
    })
})

describe('aValoresFicha', () => {
    it('arma sólo los campos pedidos, como strings con el formato del ERP', () => {
        const b = { especialidades: ['frenos', 'agro'], monomarcaDetalle: '', personas: '4', facturacion: 3 }
        expect(aValoresFicha(b, CAMPOS_FICHA)).toEqual({
            especialidad: ['frenos', 'agro'], personas: ['4'], facturacion: ['3'],
        })
        expect(aValoresFicha(b, ['facturacion'])).toEqual({ facturacion: ['3'] })
    })
    it('incluye monomarca_marca trimmeada cuando corresponde', () => {
        const b = { especialidades: ['monomarca'], monomarcaDetalle: ' Ford ', personas: '4', facturacion: 3 }
        expect(aValoresFicha(b, CAMPOS_FICHA)).toEqual({
            especialidad: ['monomarca'], monomarca_marca: ['Ford'], personas: ['4'], facturacion: ['3'],
        })
    })
    it('null si falta algo de lo pedido', () => {
        expect(aValoresFicha(BORRADOR_VACIO, ['personas'])).toBeNull()
    })
})

describe('deValoresFicha', () => {
    it('precarga el borrador desde los valores vigentes', () => {
        expect(deValoresFicha({
            especialidad: ['frenos', 'monomarca'], monomarca_marca: ['Ford'], personas: ['4'], facturacion: ['3'],
        })).toEqual({ especialidades: ['frenos', 'monomarca'], monomarcaDetalle: 'Ford', personas: '4', facturacion: 3 })
    })
    it('sin valores → borrador vacío; facturación inválida → null', () => {
        expect(deValoresFicha(undefined)).toEqual(BORRADOR_VACIO)
        expect(deValoresFicha({ facturacion: ['x'] }).facturacion).toBeNull()
    })
})
