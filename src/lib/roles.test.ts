import { readFileSync } from 'fs'
import { resolve } from 'path'
import { estaProbando, puedeOperarComoVendedor, rutaInicialPara, supervisa, veMetricas } from './roles'

const cap = (o: Partial<{ v: boolean; p: boolean; s: boolean; m: boolean }>) => ({
    operaComoVendedor: o.v ?? false,
    operaComoVendedorDePrueba: o.p ?? false,
    superviseVendedores: o.s ?? false,
    veSusMetricas: o.m ?? false,
})

describe('roles.ts — predicados sobre capacidades', () => {
    it('vendedor: opera, no supervisa, no está probando, arranca en /', () => {
        const c = cap({ v: true })
        expect(puedeOperarComoVendedor(c)).toBe(true)
        expect(supervisa(c)).toBe(false)
        expect(estaProbando(c)).toBe(false)
        expect(rutaInicialPara(c)).toBe('/')
    })

    it('gerencia: opera (como prueba), supervisa, está probando, arranca en /analitica', () => {
        const c = cap({ p: true, s: true })
        expect(puedeOperarComoVendedor(c)).toBe(true)
        expect(supervisa(c)).toBe(true)
        expect(estaProbando(c)).toBe(true)
        expect(rutaInicialPara(c)).toBe('/analitica')
    })

    it('tester: opera como prueba, no supervisa, arranca en /', () => {
        const c = cap({ p: true })
        expect(puedeOperarComoVendedor(c)).toBe(true)
        expect(supervisa(c)).toBe(false)
        expect(estaProbando(c)).toBe(true)
        expect(rutaInicialPara(c)).toBe('/')
    })

    it('un TV futuro (supervisa, no prueba): arranca en /analitica y no opera como vendedor', () => {
        const c = cap({ s: true })
        expect(puedeOperarComoVendedor(c)).toBe(false)
        expect(rutaInicialPara(c)).toBe('/analitica')
    })

    it('sin capacidades (marketing) → sin acceso', () => {
        expect(rutaInicialPara(cap({}))).toBeNull()
        expect(rutaInicialPara(null)).toBeNull()
        expect(rutaInicialPara(undefined)).toBeNull()
    })

    it('veMetricas sigue la capacidad, no el rol', () => {
        const base = { operaComoVendedor: true, operaComoVendedorDePrueba: false, superviseVendedores: false }
        expect(veMetricas({ ...base, veSusMetricas: true })).toBe(true)
        expect(veMetricas({ ...base, veSusMetricas: false })).toBe(false)
        expect(veMetricas(null)).toBe(false)
    })

    it('el módulo no contiene ningún rol como literal (la tabla de roles vive en el backend)', () => {
        const fuente = readFileSync(resolve(__dirname, 'roles.ts'), 'utf8')
        for (const rol of ["'admin'", "'versus-ger'", "'supervisor'", "'tester'", "'tv'", "'vendedor'", "'marketing'"]) {
            expect(fuente).not.toContain(rol)
        }
    })
})
