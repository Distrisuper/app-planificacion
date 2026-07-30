import { apiClient } from './apiClient'
import {
    MOCK_DETALLES,
    MOCK_OBJECIONES,
    MOCK_RESUMEN,
    MOCK_VISITAS,
} from '@/mocks/analiticaMock'
import type {
    IAnaliticaFiltro,
    IAnaliticaResumen,
    IObjecionesResumen,
    IVendedorMetricas,
    IVisitaDetalle,
    IVisitasPage,
} from '@/types/analitica'

const USA_MOCK = import.meta.env.VITE_ANALITICA_MOCK === '1'

/** Delay solo en dev, para que los estados de carga se vean mientras se itera.
 *  En tests es 0: nadie quiere esperar 250 ms por caso. */
const DELAY_MS = import.meta.env.DEV ? 250 : 0

const esperar = () => new Promise(r => setTimeout(r, DELAY_MS))

/** El fixture cubre una sola semana. Fuera de ese rango se devuelve vacío, así el
 *  estado "no hay ciclos entre X e Y" se puede probar moviendo el datepicker. */
function dentroDelRango(filtro: IAnaliticaFiltro): boolean {
    return filtro.desde <= MOCK_RESUMEN.hasta && filtro.hasta >= MOCK_RESUMEN.desde
}

function promediarCampo(
    vendedores: IVendedorMetricas[],
    campo: keyof IVendedorMetricas,
): number | null {
    const valores = vendedores
        .map(v => v[campo])
        .filter((n): n is number => typeof n === 'number')
    if (valores.length === 0) return null
    return valores.reduce((a, b) => a + b, 0) / valores.length
}

/** Los promedios tienen que corresponder a los vendedores en pantalla: si gerencia
 *  filtra 3 vendedores, el semáforo debe compararlos entre ellos, no contra el equipo. */
function recalcularPromedios(vendedores: IVendedorMetricas[]): IVendedorMetricas {
    const salida = { ...MOCK_RESUMEN.promedios }
    for (const clave of Object.keys(salida) as (keyof IVendedorMetricas)[]) {
        if (clave === 'codigoParticularVendedor' || clave === 'nombreVendedor') continue
        const promedio = promediarCampo(vendedores, clave)
        // @ts-expect-error asignación dinámica sobre campos numéricos del mismo tipo
        salida[clave] = promedio
    }
    salida.ciclosEnCurso = vendedores.reduce((a, v) => a + v.ciclosEnCurso, 0)
    return salida
}

export const getResumen = async (filtro: IAnaliticaFiltro): Promise<IAnaliticaResumen> => {
    if (USA_MOCK) {
        await esperar()
        const vendedores = !dentroDelRango(filtro)
            ? []
            : MOCK_RESUMEN.vendedores.filter(
                  v =>
                      !filtro.vendedores?.length ||
                      filtro.vendedores.includes(v.codigoParticularVendedor),
              )
        return {
            desde: filtro.desde,
            hasta: filtro.hasta,
            diasHabiles: MOCK_RESUMEN.diasHabiles,
            promedios: recalcularPromedios(vendedores),
            vendedores,
        }
    }
    const res = await apiClient.get('/planificacion/analitica/resumen', { params: filtro })
    return res.data.data
}

export interface IVisitasArgs extends IAnaliticaFiltro {
    vendedor: string
    cliente?: string
    pagina?: number
    cant?: number
}

export const getVisitas = async (args: IVisitasArgs): Promise<IVisitasPage> => {
    if (USA_MOCK) {
        await esperar()
        const todas = dentroDelRango(args) ? (MOCK_VISITAS[args.vendedor] ?? []) : []
        const busqueda = args.cliente?.trim().toLowerCase()
        const visitas = busqueda
            ? todas.filter(v => v.nombreCliente.toLowerCase().includes(busqueda))
            : todas
        return { total: visitas.length, pagina: args.pagina ?? 1, cant: visitas.length, visitas }
    }
    const res = await apiClient.get('/planificacion/analitica/visitas', { params: args })
    return res.data.data
}

export const getVisitaDetalle = async (visitaId: number): Promise<IVisitaDetalle> => {
    if (USA_MOCK) {
        await esperar()
        const detalle = MOCK_DETALLES[visitaId]
        if (!detalle) throw new Error('Visita no encontrada')
        return detalle
    }
    const res = await apiClient.get(`/planificacion/analitica/visitas/${visitaId}`)
    return res.data.data
}

export interface IObjecionesArgs extends IAnaliticaFiltro {
    zona?: string
    rubro?: string
}

export const getObjeciones = async (args: IObjecionesArgs): Promise<IObjecionesResumen> => {
    if (USA_MOCK) {
        await esperar()
        if (!dentroDelRango(args)) return { total: 0, motivos: [] }
        return {
            ...MOCK_OBJECIONES,
            motivos: [...MOCK_OBJECIONES.motivos].sort((a, b) => b.cantidad - a.cantidad),
        }
    }
    const res = await apiClient.get('/planificacion/analitica/objeciones', { params: args })
    return res.data.data
}
