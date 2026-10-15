import { filaDeTv, filaDeVendedor, resumenTvs } from './productividadEquipo'
import { MOCK_RESUMEN } from '@/mocks/analiticaMock'
import type { IProductividadTv } from '@/types/metricasEquipo'

const TV: IProductividadTv = {
    codigoParticularTv: '9001', nombreTv: 'ANA', perfil: 'farmer', activo: true,
    llamados: 30, atendidos: 20, conVenta: 5, metaDiaria: 15, objetivo: 15, pctCumplimiento: 2,
}

it('el vendedor mide visitas válidas, con el cumplimiento de /resumen pasado a 0..1', () => {
    const v = { ...MOCK_RESUMEN.vendedores[0], pctCumplimientoVisitas: 88 }
    const f = filaDeVendedor(v)
    expect(f.tipo).toBe('vendedor')
    expect(f.actividad).toBe(v.visitasValidas)
    expect(f.cumplimiento).toBeCloseTo(0.88)
    expect(f.esVendedor).toBe(true)
    expect(filaDeVendedor({ ...v, pctCumplimientoVisitas: null }).cumplimiento).toBeNull()
})

it('el TV mide llamados y toma su perfil como tipo', () => {
    const f = filaDeTv(TV)
    expect(f).toMatchObject({ tipo: 'farmer', actividad: 30, cumplimiento: 2, contactos: 20, esVendedor: false })
    expect(f.efectividad).toBeCloseTo(0.25)
})

it('un TV sin perfil ni nombre: tipo sin_perfil y se muestra el código', () => {
    const f = filaDeTv({ ...TV, nombreTv: '', perfil: null, atendidos: 0, pctCumplimiento: null })
    expect(f).toMatchObject({ tipo: 'sin_perfil', nombre: '9001', efectividad: null, cumplimiento: null })
})

it('resumenTvs: llamados contra la suma de objetivos, sin contar a los TV sin objetivo', () => {
    const r = resumenTvs([
        TV,
        { ...TV, codigoParticularTv: '9002', llamados: 20, objetivo: 35, atendidos: 10, conVenta: 1 },
        { ...TV, codigoParticularTv: '9003', perfil: null, llamados: 50, objetivo: null, atendidos: 0, conVenta: 0 },
    ])
    expect(r.llamados).toBe(100)
    expect(r.objetivo).toBe(50)
    expect(r.cumplimiento).toBeCloseTo(1)
    expect(r.tasaContacto).toBeCloseTo(0.3)
    expect(r.conVenta).toBe(6)
})
