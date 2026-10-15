import { pasaFiltro, tiposDeCartera } from './tipoPersona'
import type { ITelevendedorOpcion } from '@/types/analitica'

const TVS: ITelevendedorOpcion[] = [
    { codigoParticularTv: '9001', nombreTv: 'ANA', activo: true, perfil: 'farmer', carteras: ['CARTERA TV1', 'V 15'] },
    { codigoParticularTv: '9002', nombreTv: 'BETO', activo: true, perfil: 'hunter', carteras: ['cartera tv1'] },
    { codigoParticularTv: '9003', nombreTv: 'CARO', activo: false, perfil: 'hunter', carteras: ['V 7'] },
    { codigoParticularTv: '9004', nombreTv: 'DANI', activo: true, perfil: null, carteras: ['ROJOSTV'] },
]

describe('tiposDeCartera', () => {
    it('una cartera sin TV es de un VENDEDOR', () => {
        expect(tiposDeCartera('V 1', TVS)).toEqual(['vendedor'])
    })

    it('una cartera con un TV toma su perfil', () => {
        expect(tiposDeCartera('V 15', TVS)).toEqual(['farmer'])
    })

    it('farmer y hunter en la misma cartera: los dos (sin distinguir mayúsculas)', () => {
        expect(tiposDeCartera('CARTERA TV1', TVS)).toEqual(['farmer', 'hunter'])
    })

    it('un TV inactivo ya no la atiende', () => {
        expect(tiposDeCartera('V 7', TVS)).toEqual(['vendedor'])
    })

    it('un TV sin perfil', () => {
        expect(tiposDeCartera('ROJOSTV', TVS)).toEqual(['sin_perfil'])
    })

    it('sin el dato de carteras (backend anterior) no inventa: []', () => {
        const viejos = TVS.map(({ carteras: _c, perfil: _p, ...resto }) => resto)
        expect(tiposDeCartera('V 1', viejos)).toEqual([])
        expect(tiposDeCartera('V 1', undefined)).toEqual([])
    })
})

it('pasaFiltro: todos pasa siempre; un tipo pasa si está', () => {
    expect(pasaFiltro([], 'todos')).toBe(true)
    expect(pasaFiltro(['farmer', 'hunter'], 'hunter')).toBe(true)
    expect(pasaFiltro(['vendedor'], 'farmer')).toBe(false)
    expect(pasaFiltro(['sin_perfil'], 'farmer')).toBe(false)
})
