import { esRolAnalitica, esRolVendedor, rutaInicialPara } from './roles'

it('reconoce los roles con scope unrestricted de api-vendedores', () => {
    expect(esRolAnalitica('admin')).toBe(true)
    expect(esRolAnalitica('versus-ger')).toBe(true)
    expect(esRolAnalitica('supervisor')).toBe(true)
})

it('no le da acceso analítico al vendedor', () => {
    expect(esRolAnalitica('vendedor')).toBe(false)
    expect(esRolVendedor('vendedor')).toBe(true)
})

it('ignora mayúsculas y espacios, como authorize() en el backend', () => {
    expect(esRolAnalitica(' VERSUS-GER ')).toBe(true)
    expect(esRolVendedor('Vendedor')).toBe(true)
})

it('un rol desconocido no accede a nada', () => {
    expect(esRolAnalitica('marketing')).toBe(false)
    expect(esRolVendedor('marketing')).toBe(false)
})

it('manda a cada rol a su pantalla', () => {
    expect(rutaInicialPara('vendedor')).toBe('/')
    expect(rutaInicialPara('versus-ger')).toBe('/analitica')
    expect(rutaInicialPara('marketing')).toBeNull()
})
