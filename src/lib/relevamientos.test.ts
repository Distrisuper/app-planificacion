import {
    BORRADOR_VACIO, aValoresFicha, borradorDesdeValores, camposADibujar, camposPendientes,
    faltantesFicha, opcionAbierta, pideMarca, relevamientoPendiente,
} from './relevamientos'
import type { IFichaCampoDef } from '@/types/planificacion'

const base = { minimo: null, maximo: null, obligatorio: true, multiple: false, opciones: null }

/** El catálogo real, tal cual lo devuelve GET /planificacion/ficha/campos. */
const CATALOGO: IFichaCampoDef[] = [
    {
        ...base, campo: 'especialidad', descripcion: 'Especialidad', tipo: 'opcion',
        multiple: true, orden: 1,
        opciones: [
            { codigo: 'frenos', label: 'Frenos' },
            { codigo: 'agro', label: 'Agro' },
            { codigo: 'monomarca', label: 'Monomarca' },
        ],
    },
    {
        ...base, campo: 'monomarca_marca', descripcion: '¿De qué marca?', tipo: 'opcion',
        obligatorio: false, orden: 2, minimo: 1, maximo: 60,
        opciones: [
            { codigo: 'ford', label: 'Ford' },
            { codigo: 'fiat', label: 'Fiat' },
            { codigo: 'otros', label: 'Otros', abierta: true },
        ],
    },
    {
        ...base, campo: 'personas', descripcion: 'Personas que trabajan', tipo: 'entero',
        orden: 3, minimo: 1, maximo: 999,
    },
    {
        ...base, campo: 'facturacion', descripcion: 'Facturación mensual', tipo: 'opcion',
        orden: 4,
        opciones: [
            { codigo: '5', label: 'Menor a 10M', labelCorto: '<10M' },
            { codigo: '3', label: 'Mayor a 30M', labelCorto: '+30M' },
        ],
    },
]
const TODOS = camposADibujar(CATALOGO)
const defMarca = CATALOGO.find(c => c.campo === 'monomarca_marca')

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

describe('camposADibujar', () => {
    it('ordena por `orden` y saca monomarca_marca: no se pide por su nombre', () => {
        expect(TODOS.map(c => c.campo)).toEqual(['especialidad', 'personas', 'facturacion'])
    })
    it('con `pedidos` filtra a esos (el gate manda los pendientes)', () => {
        expect(camposADibujar(CATALOGO, ['facturacion']).map(c => c.campo)).toEqual(['facturacion'])
        // Aunque lo pidan explícitamente, la marca sigue colgando de la especialidad.
        expect(camposADibujar(CATALOGO, ['monomarca_marca'])).toEqual([])
    })
})

describe('faltantesFicha', () => {
    it('nombra lo que falta con el título del CATÁLOGO, no con una constante del front', () => {
        expect(faltantesFicha(TODOS, BORRADOR_VACIO, defMarca)).toEqual([
            'Especialidad', 'Personas que trabajan', 'Facturación mensual',
        ])
        expect(faltantesFicha(camposADibujar(CATALOGO, ['facturacion']), BORRADOR_VACIO)).toEqual([
            'Facturación mensual',
        ])
    })
    it('monomarca exige la marca sólo si especialidad está en juego y la incluye', () => {
        const b = {
            valores: { especialidad: ['monomarca'], personas: ['2'], facturacion: ['3'] },
            abiertas: {},
        }
        expect(faltantesFicha(TODOS, b, defMarca)).toEqual(['¿De qué marca?'])
        expect(faltantesFicha(camposADibujar(CATALOGO, ['personas', 'facturacion']), b, defMarca)).toEqual([])
    })
    it('el entero se valida contra el rango del catálogo', () => {
        const conPersonas = (v: string) => ({ valores: { personas: [v] }, abiertas: {} })
        const soloPersonas = camposADibujar(CATALOGO, ['personas'])
        expect(faltantesFicha(soloPersonas, conPersonas('0'))).toHaveLength(1)
        expect(faltantesFicha(soloPersonas, conPersonas('1000'))).toHaveLength(1)
        expect(faltantesFicha(soloPersonas, conPersonas('4.5'))).toHaveLength(1)
        expect(faltantesFicha(soloPersonas, conPersonas('999'))).toEqual([])
    })
    it('con "Otros" elegido, el texto libre se valida por largo y vacío no alcanza', () => {
        const soloMarca = [defMarca!]
        expect(faltantesFicha(soloMarca, { valores: { monomarca_marca: [''] }, abiertas: { monomarca_marca: true } })).toHaveLength(1)
        expect(faltantesFicha(soloMarca, { valores: { monomarca_marca: ['x'.repeat(61)] }, abiertas: { monomarca_marca: true } })).toHaveLength(1)
        expect(faltantesFicha(soloMarca, { valores: { monomarca_marca: ['Chery'] }, abiertas: { monomarca_marca: true } })).toEqual([])
    })
})

describe('aValoresFicha', () => {
    it('arma sólo los campos dibujados', () => {
        const b = { valores: { especialidad: ['frenos', 'agro'], personas: ['4'], facturacion: ['3'] }, abiertas: {} }
        expect(aValoresFicha(TODOS, b, defMarca)).toEqual({
            especialidad: ['frenos', 'agro'], personas: ['4'], facturacion: ['3'],
        })
        expect(aValoresFicha(camposADibujar(CATALOGO, ['facturacion']), b)).toEqual({ facturacion: ['3'] })
    })
    it('incluye monomarca_marca trimmeada cuando corresponde', () => {
        const b = {
            valores: { especialidad: ['monomarca'], monomarca_marca: [' Chery '], personas: ['4'], facturacion: ['3'] },
            abiertas: { monomarca_marca: true },
        }
        expect(aValoresFicha(TODOS, b, defMarca)).toEqual({
            especialidad: ['monomarca'], monomarca_marca: ['Chery'], personas: ['4'], facturacion: ['3'],
        })
    })
    it('null si falta algo de lo dibujado', () => {
        expect(aValoresFicha(camposADibujar(CATALOGO, ['personas']), BORRADOR_VACIO)).toBeNull()
    })
})

describe('borradorDesdeValores', () => {
    it('precarga los valores vigentes', () => {
        expect(borradorDesdeValores(CATALOGO, {
            especialidad: ['frenos', 'monomarca'], monomarca_marca: ['ford'], personas: ['4'], facturacion: ['3'],
        })).toEqual({
            valores: { especialidad: ['frenos', 'monomarca'], monomarca_marca: ['ford'], personas: ['4'], facturacion: ['3'] },
            abiertas: {},
        })
    })
    it('un valor fuera de la lista sólo pudo venir de la opción abierta: se precarga como "Otros"', () => {
        const b = borradorDesdeValores(CATALOGO, { monomarca_marca: ['Chery'] })
        expect(b.valores.monomarca_marca).toEqual(['Chery'])
        expect(b.abiertas.monomarca_marca).toBe(true)
    })
    it('sin valores, borrador vacío', () => {
        expect(borradorDesdeValores(CATALOGO, undefined)).toEqual(BORRADOR_VACIO)
    })
})

describe('opcionAbierta / pideMarca', () => {
    it('encuentra la opción de escape sólo donde está declarada', () => {
        expect(opcionAbierta(defMarca!)?.codigo).toBe('otros')
        expect(opcionAbierta(CATALOGO[3])).toBeUndefined()
    })
    it('pideMarca mira la especialidad elegida', () => {
        expect(pideMarca({ valores: { especialidad: ['monomarca'] }, abiertas: {} })).toBe(true)
        expect(pideMarca({ valores: { especialidad: ['frenos'] }, abiertas: {} })).toBe(false)
    })
})
