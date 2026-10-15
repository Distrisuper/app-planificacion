import type { ITelevendedorOpcion } from '@/types/analitica'
import type { TipoPersona } from '@/types/metricasEquipo'

export const ETIQUETA_TIPO: Record<TipoPersona, string> = {
    vendedor: 'VENDEDOR',
    farmer: 'FARMER',
    hunter: 'HUNTER',
    sin_perfil: 'TV SIN PERFIL',
}

export const CLASE_TIPO: Record<TipoPersona, string> = {
    vendedor: 'bg-sky-100 text-sky-800',
    farmer: 'bg-emerald-100 text-emerald-800',
    hunter: 'bg-violet-100 text-violet-800',
    sin_perfil: 'bg-slate-100 text-slate-600',
}

/** El filtro de tipo de las tres vistas. 'todos' no filtra. Un TV sin perfil entra solo en
 *  'todos': no es FARMER ni HUNTER, y esconderlo del todo escondería sus llamados. */
export type FiltroTipo = 'todos' | 'vendedor' | 'farmer' | 'hunter'

export const OPCIONES_FILTRO_TIPO: { valor: FiltroTipo; etiqueta: string }[] = [
    { valor: 'todos', etiqueta: 'Todos' },
    { valor: 'vendedor', etiqueta: 'Vendedor' },
    { valor: 'farmer', etiqueta: 'Farmer' },
    { valor: 'hunter', etiqueta: 'Hunter' },
]

export const pasaFiltro = (tipos: TipoPersona[], filtro: FiltroTipo): boolean =>
    filtro === 'todos' || tipos.includes(filtro)

export const tipoDePerfil = (perfil: ITelevendedorOpcion['perfil']): TipoPersona =>
    perfil ?? 'sin_perfil'

/**
 * El tipo de una CARTERA (vendor_code) en Facturación: las ventas son de la cartera, no de
 * una persona. Si la atiende algún TV activo de Televentas, es el perfil de ese TV (una
 * cartera puede tener un farmer y un hunter a la vez: van los dos); si no, es de un
 * VENDEDOR de calle. Los TV inactivos no cuentan: ya no la atienden.
 *
 * Con un backend que todavía no manda `carteras`, no se puede saber: devuelve [] y la
 * pantalla muestra "Sin tipo" en vez de decir VENDEDOR sin saberlo.
 */
export function tiposDeCartera(codigo: string, tvs: ITelevendedorOpcion[] | undefined): TipoPersona[] {
    if (!tvs || tvs.some(tv => tv.carteras === undefined)) return []
    const clave = codigo.trim().toUpperCase()
    const tipos = new Set<TipoPersona>()
    for (const tv of tvs) {
        if (!tv.activo) continue
        if (tv.carteras!.some(c => c.trim().toUpperCase() === clave)) tipos.add(tipoDePerfil(tv.perfil))
    }
    if (tipos.size === 0) return ['vendedor']
    const orden: TipoPersona[] = ['farmer', 'hunter', 'sin_perfil']
    return orden.filter(t => tipos.has(t))
}
