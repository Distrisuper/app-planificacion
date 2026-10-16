import type { ITelevendedorOpcion } from '@/types/analitica'
import type { TipoPersona } from '@/types/metricasEquipo'

/** El filtro de tipo de las tres vistas: siempre hay uno elegido (Vendedor por defecto).
 *  Vendedor y TV no se mezclan: miden cosas distintas (visitas contra llamados). Por eso
 *  no hay "Todos", y un TV sin perfil no entra en ninguno (no es FARMER ni HUNTER). */
export type FiltroTipo = 'vendedor' | 'farmer' | 'hunter'

export const OPCIONES_FILTRO_TIPO: { valor: FiltroTipo; etiqueta: string }[] = [
    { valor: 'vendedor', etiqueta: 'Vendedor' },
    { valor: 'farmer', etiqueta: 'Farmer' },
    { valor: 'hunter', etiqueta: 'Hunter' },
]

export const pasaFiltro = (tipos: TipoPersona[], filtro: FiltroTipo): boolean => tipos.includes(filtro)

export const tipoDePerfil = (perfil: ITelevendedorOpcion['perfil']): TipoPersona =>
    perfil ?? 'sin_perfil'

/**
 * Los tipos de una CARTERA (vendor_code) en Facturación: las ventas son de la cartera, no de
 * una persona, y la pueden trabajar varios. Lleva:
 * - VENDEDOR si es la de un vendedor de calle (está en el roster de planificación,
 *   `/analitica/vendedores`) o si no la atiende ningún TV;
 * - el perfil de cada TV activo que la atiende (un farmer y un hunter pueden compartirla).
 * Una cartera de vendedor atendida por un TV lleva los dos (VENDEDOR · FARMER) y aparece con
 * los dos filtros (decisión del usuario). Los TV inactivos no cuentan: ya no la atienden.
 *
 * Con un backend que todavía no manda `carteras`, no se puede saber: devuelve [] y la
 * cartera no entra en ningún filtro (la pantalla avisa) en vez de decir VENDEDOR sin saberlo.
 */
export function tiposDeCartera(
    codigo: string,
    tvs: ITelevendedorOpcion[] | undefined,
    vendedoresDeCalle: Set<string>,
): TipoPersona[] {
    if (!tvs || tvs.some(tv => tv.carteras === undefined)) return []
    const clave = codigo.trim().toUpperCase()
    const tipos = new Set<TipoPersona>()
    for (const tv of tvs) {
        if (!tv.activo) continue
        if (tv.carteras!.some(c => c.trim().toUpperCase() === clave)) tipos.add(tipoDePerfil(tv.perfil))
    }
    if (tipos.size === 0 || vendedoresDeCalle.has(clave)) tipos.add('vendedor')
    const orden: TipoPersona[] = ['vendedor', 'farmer', 'hunter', 'sin_perfil']
    return orden.filter(t => tipos.has(t))
}

/** Los códigos del roster de planificación, normalizados para cruzar con vendor_code. */
export const clavesDeVendedores = (codigos: string[]): Set<string> =>
    new Set(codigos.map(c => c.trim().toUpperCase()))
