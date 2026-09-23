import { apiClient } from './apiClient'
import {
    MOCK_DETALLES,
    MOCK_OBJECIONES,
    MOCK_OTRAS_RESOLUCIONES,
    MOCK_RESUMEN,
    MOCK_FICHAS,
    MOCK_VENDEDORES,
    MOCK_VISITAS,
    MOCK_VISITAS_HOY,
} from '@/mocks/analiticaMock'
import { incluyeHoy } from '@/lib/fechas'
import type {
    IAltaRelevada,
    IAnaliticaFiltro,
    IAnaliticaResumen,
    IObjecionesResumen,
    IVendedorMetricas,
    IFichasArgs,
    IFichasRelevadasResponse,
    IVendedorOpcion,
    IVisitaDetalle,
    IVisitasArgs,
    IVisitasPage,
    IVincularAltaResult,
} from '@/types/analitica'

export type { IVisitasArgs }

const USA_MOCK = import.meta.env.VITE_ANALITICA_MOCK === '1'

/** Delay solo en dev, para que los estados de carga se vean mientras se itera.
 *  En tests es 0: nadie quiere esperar 250 ms por caso. */
const DELAY_MS = import.meta.env.DEV ? 250 : 0

const esperar = () => new Promise(r => setTimeout(r, DELAY_MS))

/** El fixture cubre una semana concreta MÁS el día de hoy. Fuera de eso devuelve
 *  vacío, así el estado "no hay ciclos entre X e Y" se puede probar moviendo el
 *  datepicker sin tocar código. */
function dentroDelRango(filtro: IAnaliticaFiltro): boolean {
    const solapaFixture =
        filtro.desde <= MOCK_RESUMEN.hasta && filtro.hasta >= MOCK_RESUMEN.desde
    return solapaFixture || incluyeHoy(filtro.desde, filtro.hasta)
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

export const getVisitas = async (args: IVisitasArgs): Promise<IVisitasPage> => {
    if (USA_MOCK) {
        await esperar()
        const universo = [
            ...Object.values(MOCK_VISITAS).flat(),
            ...MOCK_OTRAS_RESOLUCIONES,
            ...MOCK_VISITAS_HOY,
        ]
        const busqueda = args.cliente?.trim().toLowerCase()
        const visitas = universo
            .filter(v => v.fecha >= args.desde && v.fecha <= args.hasta)
            .filter(v => !args.vendedor || v.codigoParticularVendedor === args.vendedor)
            .filter(v => !args.vendedores?.length || args.vendedores.includes(v.codigoParticularVendedor))
            .filter(v => !args.tipo?.length || args.tipo.includes(v.tipo))
            .filter(v => !busqueda || v.nombreCliente.toLowerCase().includes(busqueda))
            // Feed de actividad: lo último arriba. Ordena por el instante, no por el
            // string: el ISO ya es comparable, pero el intento es el mismo que el del
            // backend (`ORDER BY r.fecha_inicio DESC`).
            .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))
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

export const getVendedores = async (): Promise<IVendedorOpcion[]> => {
    if (USA_MOCK) {
        await esperar()
        return MOCK_VENDEDORES
    }
    const res = await apiClient.get('/planificacion/analitica/vendedores')
    return res.data.data
}

/** Relevamiento de los clientes nuevos del rango, más nuevos primero. */
export const getAltas = async (filtro: IAnaliticaFiltro): Promise<IAltaRelevada[]> => {
    const res = await apiClient.get('/planificacion/analitica/altas', { params: filtro })
    return res.data.data
}

/** Vincula un alta visitada con el cliente que administración creó en Flexxus. Idempotente con
 *  el mismo código. Ver spec api-vendedores 2026-09-23-vincular-alta. */
export const vincularAlta = async (rotacionClienteId: number, codigoParticularCliente: string): Promise<IVincularAltaResult> => {
    const res = await apiClient.put(`/planificacion/analitica/altas/${rotacionClienteId}/vinculo`, { codigoParticularCliente })
    return res.data.data
}

/**
 * "Datos del comercio" cargados. **El período es opcional**: sin `desde`/`hasta` devuelve todo
 * lo acumulado, porque la ficha se llena una vez por cliente y nunca más — no es actividad.
 * Los `valores` vienen con los códigos del catálogo; el label lo pone la tabla.
 */
export const getFichas = async (args: IFichasArgs): Promise<IFichasRelevadasResponse> => {
    if (USA_MOCK) {
        await esperar()
        const fichas = MOCK_FICHAS.filter(
            f => !args.vendedores?.length || args.vendedores.includes(f.codigoParticularVendedor),
        ).filter(f => {
            if (!args.desde || !args.hasta) return true
            const dia = f.relevadoEn.slice(0, 10)
            return dia >= args.desde && dia <= args.hasta
        })
        return { total: fichas.length, totalPlan: 380, fichas }
    }
    const res = await apiClient.get('/planificacion/analitica/fichas', { params: args })
    return res.data.data
}
