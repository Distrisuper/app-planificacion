import { describe, expect, it } from 'vitest'
import {
    camposPorSeccion, contarCargados, descripcionCatalogo, diffDetalle, estadoInicial, opcionesDeCatalogo, valorDe,
} from './camposAlta'
import type { ICampoAlta, IEsquemaAlta } from '@/types/planificacion'

// Esquema de fixture, chico a propósito: el real vive en la API.
const CAMPOS: ICampoAlta[] = [
    { clave: 'nombre', etiqueta: 'Nombre', seccion: 'identidad', tipo: 'texto', max: 120, requerido: true },
    { clave: 'cuit', etiqueta: 'CUIT', seccion: 'identidad', tipo: 'cuit', max: 13 },
    { clave: 'condicionIva', etiqueta: 'IVA', seccion: 'comercial', tipo: 'catalogo', catalogo: 'iva' },
    { clave: 'referencias', etiqueta: 'Referencias', seccion: 'cuenta', tipo: 'textoLargo', max: 300 },
]
const CATALOGOS = {
    iva: [
        { codigo: 'RI', descripcion: 'Responsable Inscripto', orden: 10, activo: true },
        { codigo: 'NR', descripcion: 'No Responsable', orden: 50, activo: false },
    ],
}

describe('valorDe', () => {
    it('detalle null o clave ausente → null', () => {
        expect(valorDe(null, 'cuit')).toBeNull()
        expect(valorDe({ nombre: 'Piche' }, 'cuit')).toBeNull()
        expect(valorDe({ nombre: 'Piche', cuit: '30-1' }, 'cuit')).toBe('30-1')
    })
})

describe('estadoInicial', () => {
    it('una entrada por campo, "" donde no hay valor, y nombre con fallback', () => {
        expect(estadoInicial(CAMPOS, { nombre: 'Piche', cuit: '30-1' }, 'x')).toEqual({
            nombre: 'Piche', cuit: '30-1', condicionIva: '', referencias: '',
        })
        expect(estadoInicial(CAMPOS, null, 'Autopartes Piche').nombre).toBe('Autopartes Piche')
    })
})

describe('diffDetalle', () => {
    const detalle = { nombre: 'Piche', cuit: null, condicionIva: 'RI', referencias: 'Casa Pérez' }
    it('devuelve solo las claves que cambiaron, ya normalizadas', () => {
        const estado = { nombre: 'Piche', cuit: ' 30-1 ', condicionIva: 'RI', referencias: 'Casa Pérez' }
        expect(diffDetalle(CAMPOS, detalle, estado, 'Piche')).toEqual({ cuit: '30-1' })
    })
    it('"" contra null NO es un cambio; borrar un valor manda null', () => {
        const estado = { nombre: 'Piche', cuit: '', condicionIva: '', referencias: 'Casa Pérez' }
        expect(diffDetalle(CAMPOS, detalle, estado, 'Piche')).toEqual({ condicionIva: null })
    })
    it('sin detalle previo, el nombre se compara contra el fallback (no contra "")', () => {
        const estado = { nombre: 'Autopartes Piche', cuit: '', condicionIva: '', referencias: '' }
        expect(diffDetalle(CAMPOS, null, estado, 'Autopartes Piche')).toEqual({})
    })
    it('nombre nunca viaja en null: vacío se ignora en el diff (lo bloquea el botón)', () => {
        const estado = { nombre: '   ', cuit: '', condicionIva: 'RI', referencias: 'Casa Pérez' }
        expect(diffDetalle(CAMPOS, detalle, estado, 'Piche')).toEqual({})
    })
})

describe('contarCargados', () => {
    it('cuenta los campos del esquema con valor no vacío', () => {
        expect(contarCargados(CAMPOS, { nombre: 'Piche', cuit: '  ', condicionIva: 'RI', referencias: '' })).toBe(2)
    })
})

describe('descripcionCatalogo', () => {
    it('resuelve activos e inactivos; sin match o sin catálogos devuelve el código', () => {
        expect(descripcionCatalogo(CATALOGOS, 'iva', 'RI')).toBe('Responsable Inscripto')
        expect(descripcionCatalogo(CATALOGOS, 'iva', 'NR')).toBe('No Responsable')
        expect(descripcionCatalogo(CATALOGOS, 'iva', 'ZZ')).toBe('ZZ')
        expect(descripcionCatalogo(null, 'iva', 'RI')).toBe('RI')
    })
})

describe('opcionesDeCatalogo', () => {
    it('solo activos, más el valor actual si está inactivo (para no perderlo del select)', () => {
        expect(opcionesDeCatalogo(CATALOGOS, 'iva', null).map(o => o.codigo)).toEqual(['RI'])
        expect(opcionesDeCatalogo(CATALOGOS, 'iva', 'NR').map(o => o.codigo)).toEqual(['RI', 'NR'])
        expect(opcionesDeCatalogo(null, 'iva', 'RI')).toEqual([])
    })
})

describe('camposPorSeccion', () => {
    it('respeta el orden de las secciones y omite las que no tienen campos', () => {
        const esquema: IEsquemaAlta = {
            secciones: [
                { clave: 'comercial', titulo: 'Comercial' },
                { clave: 'vacia', titulo: 'Vacía' },
                { clave: 'identidad', titulo: 'Identidad' },
                { clave: 'cuenta', titulo: 'Cuenta corriente' },
            ],
            campos: CAMPOS,
            catalogos: CATALOGOS,
        }
        const grupos = camposPorSeccion(esquema)
        expect(grupos.map(g => g.seccion.clave)).toEqual(['comercial', 'identidad', 'cuenta'])
        expect(grupos[1].campos.map(c => c.clave)).toEqual(['nombre', 'cuit'])
    })
})
