import type { ResultadoMotivo } from './planificacion'

/** Quién registró el dato: el vendedor de calle (visita con GPS) o un TV de Televentas,
 *  que es FARMER o HUNTER según `pl_tv.perfil`. `sin_perfil` = TV todavía sin perfil. */
export type TipoPersona = 'vendedor' | 'farmer' | 'hunter' | 'sin_perfil'

export type PerfilTv = 'farmer' | 'hunter'

/** GET /analitica/televentas/productividad: los llamados de cada TV contra la meta de su perfil. */
export interface IProductividadTv {
    codigoParticularTv: string
    /** '' si el autor de los llamados no está en pl_tv: se muestra el código. */
    nombreTv: string
    perfil: PerfilTv | null
    activo: boolean
    /** Sin reagendas: una reagenda no es un llamado. */
    llamados: number
    atendidos: number
    conVenta: number
    metaDiaria: number
    /** Clientes de sus carteras que le tocan en el mes (sin VNA; una cartera compartida se
     *  reparte según la meta diaria de sus TV). Opcional: un back anterior no lo manda. */
    objetivoMensual?: number | null
    /** Mes calendario: objetivoMensual (entero aunque esté en curso). Día o semana:
     *  metaDiaria × días hábiles (un día = 15 farmer, 35 hunter). null sin perfil. */
    objetivo: number | null
    /** llamados / objetivo (0..n, sin tope). null si no hay objetivo. */
    pctCumplimiento: number | null
}

export interface IProductividadTvResponse {
    desde: string
    hasta: string
    diasHabiles: number
    tvs: IProductividadTv[]
}

/** GET /analitica/objeciones/por-persona: los motivos de visitas y de llamados juntos. */
export interface IObjecionesPorPersona {
    total: number
    /** Desc por cantidad. pct 0..1 sobre total. */
    motivos: {
        motivoId: number
        descripcion: string
        resultado: ResultadoMotivo | null
        cantidad: number
        pct: number
    }[]
    /** Desc por total. Solo los motivos que la persona registró. */
    personas: {
        codigo: string
        nombre: string
        tipo: TipoPersona
        total: number
        motivos: { motivoId: number; cantidad: number }[]
    }[]
}

/** Lo que usa Facturación de un período de POST /sale/analytics (formato modern). */
export interface IVentasPeriodo {
    units: number
    amount: number
    /** Super rubros con el mínimo cumplido. Puede faltar. */
    sr?: number
}

/** Claves de período que devuelve /sale/analytics sin filtro de fechas. */
export type PeriodoVentas = 'thisMonth' | 'lastMonth' | 'last3Months' | 'last6Months' | 'last12Months'

export interface IVentasVendedor {
    /** vendor_code de la cartera (el mismo de pl_tv_cartera). */
    code: string
    name: string
    particularCode?: string
    totalsByPeriod: Partial<Record<PeriodoVentas, IVentasPeriodo>>
}

export interface IRubroCatalogo {
    code: string
    description: string
}
