import { describe, expect, it } from 'vitest'
import { lineaDeMarca } from './marcaOfrecida'
import type { ICatalogoItem, IMarcaEstado } from '@/types/planificacion'

const chip = (code: string, nombre: string): IMarcaEstado => ({
    code, nombre, actual: 0, mesAnterior: 0, promedio6m: 0, dejo: false,
})

const catalogo: ICatalogoItem[] = [
    { code: '096', description: 'SKF', lineaPorRubro: { '367': '096', '373': '097' } },
    { code: '144', description: 'DEXCO', lineaPorRubro: { '363': '144' } },
]

describe('lineaDeMarca', () => {
    it('prefiere la línea del chip: es la que el cliente compra en ese rubro', () => {
        expect(lineaDeMarca({ descripcion: 'SKF' }, '367', [chip('132', 'SKF')], catalogo)).toEqual({
            codigo: '132',
            descripcion: 'SKF',
        })
    })

    it('sin chip, usa la línea de la marca en el rubro según el catálogo', () => {
        expect(lineaDeMarca({ codigo: '096', descripcion: 'SKF' }, '373', [], catalogo)).toEqual({
            codigo: '097',
            descripcion: 'SKF',
        })
    })

    it('si la marca no tiene línea en el rubro, conserva el código que traía', () => {
        expect(lineaDeMarca({ codigo: '144', descripcion: 'DEXCO' }, '373', [], catalogo)).toEqual({
            codigo: '144',
            descripcion: 'DEXCO',
        })
    })

    it('sin rubro ni código propio, cae al código general del catálogo', () => {
        expect(lineaDeMarca({ descripcion: 'SKF' }, null, [], catalogo)).toEqual({
            codigo: '096',
            descripcion: 'SKF',
        })
    })
})
