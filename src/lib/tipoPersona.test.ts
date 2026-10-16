import { clavesDeVendedores, pasaFiltro, tiposDeCartera } from './tipoPersona'
import type { ITelevendedorOpcion } from '@/types/analitica'

const TVS: ITelevendedorOpcion[] = [
    { codigoParticularTv: '9001', nombreTv: 'ANA', activo: true, perfil: 'farmer', carteras: ['CARTERA TV1', 'V 15'] },
    { codigoParticularTv: '9002', nombreTv: 'BETO', activo: true, perfil: 'hunter', carteras: ['cartera tv1'] },
    { codigoParticularTv: '9003', nombreTv: 'CARO', activo: false, perfil: 'hunter', carteras: ['V 7'] },
    { codigoParticularTv: '9004', nombreTv: 'DANI', activo: true, perfil: null, carteras: ['ROJOSTV'] },
]
// V 15 es de un vendedor de calle que además atiende un TV; CARTERA TV1 es solo de Televentas.
const ROSTER = clavesDeVendedores(['V 1', 'v 15', 'V 7'])

describe('tiposDeCartera', () => {
    it('una cartera sin TV es de un VENDEDOR', () => {
        expect(tiposDeCartera('V 1', TVS, ROSTER)).toEqual(['vendedor'])
        // Aunque no esté en el roster: nadie más la trabaja.
        expect(tiposDeCartera('V 99', TVS, ROSTER)).toEqual(['vendedor'])
    })

    it('la cartera de un vendedor de calle que atiende un TV lleva los dos', () => {
        expect(tiposDeCartera('V 15', TVS, ROSTER)).toEqual(['vendedor', 'farmer'])
    })

    it('una cartera solo de Televentas: farmer y hunter juntos (sin distinguir mayúsculas)', () => {
        expect(tiposDeCartera('CARTERA TV1', TVS, ROSTER)).toEqual(['farmer', 'hunter'])
    })

    it('un TV inactivo ya no la atiende', () => {
        expect(tiposDeCartera('V 7', TVS, ROSTER)).toEqual(['vendedor'])
    })

    it('un TV sin perfil', () => {
        expect(tiposDeCartera('ROJOSTV', TVS, ROSTER)).toEqual(['sin_perfil'])
    })

    it('sin el dato de carteras (backend anterior) no inventa: []', () => {
        const viejos = TVS.map(({ carteras: _c, perfil: _p, ...resto }) => resto)
        expect(tiposDeCartera('V 1', viejos, ROSTER)).toEqual([])
        expect(tiposDeCartera('V 1', undefined, ROSTER)).toEqual([])
    })
})

it('pasaFiltro: un tipo pasa si está', () => {
    expect(pasaFiltro([], 'vendedor')).toBe(false)
    expect(pasaFiltro(['vendedor', 'farmer'], 'vendedor')).toBe(true)
    expect(pasaFiltro(['vendedor', 'farmer'], 'farmer')).toBe(true)
    expect(pasaFiltro(['vendedor'], 'farmer')).toBe(false)
    expect(pasaFiltro(['sin_perfil'], 'farmer')).toBe(false)
})
