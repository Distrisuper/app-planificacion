import { esValidoSegunDeclaracion, pctVsCompetidor, pctFleteSobreCompra } from './validadores'
import type { ICampoMotivo } from '@/types/planificacion'

function campo(over: Partial<ICampoMotivo> = {}): ICampoMotivo {
    return {
        campo: 'plazo_dias',
        tipo: 'numero',
        label: 'Plazo solicitado',
        placeholder: null,
        unidad: null,
        requerido: true,
        orden: 10,
        ...over,
    }
}

describe('esValidoSegunDeclaracion', () => {
    it('sin campos declarados siempre es válido: no hay formulario a medias', () => {
        expect(esValidoSegunDeclaracion([], {})).toBe(true)
    })

    it('falta un requerido', () => {
        expect(esValidoSegunDeclaracion([campo()], {})).toBe(false)
    })

    it('con el requerido cargado es válido', () => {
        expect(esValidoSegunDeclaracion([campo()], { plazo_dias: 30 })).toBe(true)
    })

    it('un opcional vacío no invalida', () => {
        const opcional = campo({ campo: 'por_que', tipo: 'textarea', requerido: false })

        expect(esValidoSegunDeclaracion([opcional], {})).toBe(true)
    })

    // Un 0 en un precio o un plazo es "sin cargar", no un dato: mantiene el criterio que ya
    // tenía `cargado`.
    it('un número en 0 cuenta como no cargado', () => {
        expect(esValidoSegunDeclaracion([campo()], { plazo_dias: 0 })).toBe(false)
    })

    it('un texto en blanco cuenta como no cargado', () => {
        const texto = campo({ campo: 'competidor', tipo: 'texto' })

        expect(esValidoSegunDeclaracion([texto], { competidor: '   ' })).toBe(false)
    })

    // "Un campo que no se puede preguntar no se puede exigir": si un tipo nuevo bloqueara el
    // wizard, el vendedor no tendría forma de completarlo con este deploy.
    it('un tipo que el front no sabe dibujar no se exige', () => {
        const raro = campo({ campo: 'fecha_promesa', tipo: 'fecha' as never })

        expect(esValidoSegunDeclaracion([raro], {})).toBe(true)
    })
})

describe('derivados', () => {
    it('pctVsCompetidor: negativo cuando soy más barato', () => {
        expect(pctVsCompetidor({ precio_competidor: 150, mi_precio: 130 })).toBeCloseTo(-13.3, 1)
    })

    it('pctVsCompetidor: null si falta un precio', () => {
        expect(pctVsCompetidor({ precio_competidor: 150 })).toBeNull()
    })

    it('pctFleteSobreCompra: el flete sobre la compra', () => {
        expect(pctFleteSobreCompra({ valor_flete: 60000, compra_futuro: 3000000 })).toBeCloseTo(2, 1)
    })

    it('pctFleteSobreCompra: null si la compra es 0', () => {
        expect(pctFleteSobreCompra({ valor_flete: 60000, compra_futuro: 0 })).toBeNull()
    })
})
