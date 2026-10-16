import type { IVendedorMetricas } from '@/types/analitica'
import type { IProductividadTv, TipoPersona } from '@/types/metricasEquipo'

/**
 * Una fila de Productividad. Visitas y llamados son actividades distintas y NO se suman: cada
 * fila trae la de su tipo (el vendedor visita, el TV llama), con su propio objetivo.
 */
export interface IFilaProductividad {
    clave: string
    codigo: string
    nombre: string
    tipo: TipoPersona
    /** Visitas válidas (vendedor) o llamados (TV). */
    actividad: number
    /** Visitas válidas (vendedor) o llamados (TV) que pide el período. null = s/d. */
    objetivo: number | null
    /** 0..n contra el objetivo del período. null = sin objetivo vigente (s/d). */
    cumplimiento: number | null
    /** Clientes distintos visitados (vendedor) o llamados atendidos (TV). */
    contactos: number
    /** Ofrecimientos ganados / ofrecidos (vendedor) o atendidos con venta / atendidos (TV). */
    efectividad: number | null
    /** Solo el vendedor tiene detalle en /analitica/vendedor/:codigo. */
    esVendedor: boolean
}

export function filaDeVendedor(v: IVendedorMetricas): IFilaProductividad {
    return {
        clave: `v:${v.codigoParticularVendedor}`,
        codigo: v.codigoParticularVendedor,
        nombre: v.nombreVendedor,
        tipo: 'vendedor',
        actividad: v.visitasValidas,
        // /analitica/resumen no manda el objetivo, solo pct = visitas × 100 / objetivo
        // (prorrateado al período): se invierte. Con 0 visitas el pct es 0 y no se puede.
        objetivo:
            v.pctCumplimientoVisitas && v.visitasValidas > 0
                ? (v.visitasValidas * 100) / v.pctCumplimientoVisitas
                : null,
        // /analitica/resumen manda los cumplimientos en escala 0..100.
        cumplimiento: v.pctCumplimientoVisitas === null ? null : v.pctCumplimientoVisitas / 100,
        contactos: v.clientesDistintos,
        efectividad: v.efectividadComercial,
        esVendedor: true,
    }
}

export function filaDeTv(tv: IProductividadTv): IFilaProductividad {
    return {
        clave: `tv:${tv.codigoParticularTv}`,
        codigo: tv.codigoParticularTv,
        // Un autor que no está en pl_tv llega sin nombre: se muestra su código.
        nombre: tv.nombreTv || tv.codigoParticularTv,
        tipo: tv.perfil ?? 'sin_perfil',
        actividad: tv.llamados,
        objetivo: tv.objetivo,
        cumplimiento: tv.pctCumplimiento,
        contactos: tv.atendidos,
        efectividad: tv.atendidos > 0 ? tv.conVenta / tv.atendidos : null,
        esVendedor: false,
    }
}

/** Los totales de los TV: el cumplimiento del equipo es la suma de llamados contra la suma
 *  de objetivos (no el promedio de porcentajes), solo de los TV que tienen objetivo. */
export function resumenTvs(tvs: IProductividadTv[]) {
    const conObjetivo = tvs.filter(t => t.objetivo !== null && t.objetivo > 0)
    const objetivo = conObjetivo.reduce((s, t) => s + (t.objetivo ?? 0), 0)
    const llamadosConObjetivo = conObjetivo.reduce((s, t) => s + t.llamados, 0)
    const llamados = tvs.reduce((s, t) => s + t.llamados, 0)
    const atendidos = tvs.reduce((s, t) => s + t.atendidos, 0)
    const conVenta = tvs.reduce((s, t) => s + t.conVenta, 0)
    return {
        llamados,
        objetivo,
        cumplimiento: objetivo > 0 ? llamadosConObjetivo / objetivo : null,
        tasaContacto: llamados > 0 ? atendidos / llamados : null,
        conVenta,
    }
}
