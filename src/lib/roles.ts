/** Los roles de scope 'unrestricted' en api-vendedores/src/config/roles.ts.
 *  Si allá se agrega uno nuevo con ese scope, hay que sumarlo acá. */
export const ROLES_ANALITICA = ['admin', 'versus-ger', 'supervisor'] as const

const normalizar = (rol: string | undefined | null) => (rol ?? '').trim().toLowerCase()

export const esRolAnalitica = (rol: string | undefined | null): boolean =>
    (ROLES_ANALITICA as readonly string[]).includes(normalizar(rol))

export const esRolVendedor = (rol: string | undefined | null): boolean =>
    normalizar(rol) === 'vendedor'

/** La pantalla donde arranca cada rol. null = sin acceso a la app. */
export const rutaInicialPara = (rol: string | undefined | null): string | null => {
    if (esRolVendedor(rol)) return '/'
    if (esRolAnalitica(rol)) return '/analitica'
    return null
}
