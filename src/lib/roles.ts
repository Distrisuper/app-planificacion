import type { ICapacidades } from '@/types/planificacion'

/**
 * El front NO tiene tabla de roles. Qué puede hacer el usuario lo dice el backend en
 * `GET /planificacion/me` (`capacidades`), derivado de `config/roles.ts` de api-vendedores.
 * Acá solo se traducen esas capacidades a decisiones de navegación. Si una pantalla nueva
 * necesita saber "quién puede", la respuesta es una capacidad nueva en el backend, no un
 * `if (rol === ...)` acá. Spec 2026-09-17-modo-prueba-gerencia-design.md.
 */

type Cap = ICapacidades | null | undefined

/** Puede entrar al grupo de rutas del vendedor: el vendedor real, o quien tiene vendedor de prueba. */
export const puedeOperarComoVendedor = (c: Cap): boolean =>
    !!c && (c.operaComoVendedor || c.operaComoVendedorDePrueba)

/** Puede entrar al grupo /analitica (reportes, actividad, ruta). */
export const supervisa = (c: Cap): boolean => !!c && c.superviseVendedores

/** Está operando la app del vendedor como su vendedor de prueba (no es vendedor real). */
export const estaProbando = (c: Cap): boolean =>
    !!c && !c.operaComoVendedor && c.operaComoVendedorDePrueba

/** Ve el tab "Mi cartera" (sus métricas). Capacidad del backend, no rol. */
export const veMetricas = (c: Cap): boolean => !!c && c.veSusMetricas

/** La pantalla donde arranca. null = sin acceso a la app. */
export const rutaInicialPara = (c: Cap): string | null => {
    if (supervisa(c)) return '/analitica'
    if (puedeOperarComoVendedor(c)) return '/'
    return null
}
