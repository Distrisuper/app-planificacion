import { buscarFichas } from './buscarFichas'
import type { IFichaRelevadaFila } from '@/types/analitica'

const fila = (codigo: string, nombre: string): IFichaRelevadaFila => ({
    codigoParticularCliente: codigo,
    nombreCliente: nombre,
    valores: {},
    codigoParticularVendedor: 'V 2',
    nombreVendedor: 'PEREZ JUAN',
    relevadoEn: '2026-09-22T17:30:00.000Z',
})

const FICHAS = [
    fila('07179', 'PALMA MARCOS NICOLAS'),
    fila('07036', 'AUTOPARTES MARTÍNEZ'),
    fila('ALTA-000009', 'PICHE REPUESTOS'),
]

it('sin texto devuelve todo', () => {
    expect(buscarFichas(FICHAS, '   ')).toHaveLength(3)
})

it('busca por código de cliente', () => {
    expect(buscarFichas(FICHAS, '0703').map(f => f.codigoParticularCliente)).toEqual(['07036'])
})

it('busca por nombre sin importar mayúsculas ni acentos', () => {
    expect(buscarFichas(FICHAS, 'martinez').map(f => f.codigoParticularCliente)).toEqual(['07036'])
})

it('acepta el # del código como se ve en la tabla', () => {
    expect(buscarFichas(FICHAS, '#07179').map(f => f.codigoParticularCliente)).toEqual(['07179'])
})

it('no busca por vendedor: el buscador es de clientes', () => {
    expect(buscarFichas(FICHAS, 'perez')).toHaveLength(0)
})
