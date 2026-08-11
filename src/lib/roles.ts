/** Los roles de scope 'unrestricted' en api-vendedores/src/config/roles.ts.
 *  Si allá se agrega uno nuevo con ese scope, hay que sumarlo acá.
 *
 *  Se llaman "de gerencia" y no "de analítica" porque habilitan todo el grupo de rutas
 *  bajo /analitica, que además de los reportes incluye la edición de la ruta del vendedor
 *  (/analitica/ruta). */
export const ROLES_GERENCIA = ['admin', 'versus-ger', 'supervisor'] as const

const normalizar = (rol: string | undefined | null) => (rol ?? '').trim().toLowerCase()

export const esRolGerencia = (rol: string | undefined | null): boolean =>
    (ROLES_GERENCIA as readonly string[]).includes(normalizar(rol))

export const esRolVendedor = (rol: string | undefined | null): boolean =>
    normalizar(rol) === 'vendedor'

/** La pantalla donde arranca cada rol. null = sin acceso a la app. */
export const rutaInicialPara = (rol: string | undefined | null): string | null => {
    if (esRolVendedor(rol)) return '/'
    if (esRolGerencia(rol)) return '/analitica'
    return null
}
