import { formatPctEscalado } from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

/** Contenido de ayuda de los 3 KPIs/columnas de Efectividad, compartido entre
 *  KpisMensuales y TablaEfectividadOperativa para no duplicar el texto.
 *  Metas según docs/superpowers/specs/2026-08-18-efectividad-operativa-kpi-design.md
 *  (`pl_objetivo`, sembrada con 160 visitas / 140 clientes distintos / 6000 min por defecto). */

export const META_VISITAS_TOTALES = 160
export const META_CLIENTES_DISTINTOS = 140
export const META_MINUTOS_TOTALES = 6000
export const META_HORAS = META_MINUTOS_TOTALES / 60

export const META_VISITAS_TEXTO = `Meta: ${META_VISITAS_TOTALES} visitas/mes`
export const META_HORAS_TEXTO = `Meta: ${META_HORAS} hs/mes`

function Nota({ children }: { children: React.ReactNode }) {
    return <p className="mt-2 border-t border-slate-100 pt-2 text-slate-400 italic">{children}</p>
}

/** Explicación genérica de la fórmula, sin números — para el encabezado de columna,
 *  que es una sola ayuda compartida por todas las filas. Para el desglose con datos
 *  reales de una fila puntual, usar `ayudaEfectividad`. */
export const AYUDA_EFECTIVIDAD_FORMULA = (
    <div>
        <p className="text-sm font-semibold text-slate-900">Efectividad</p>
        <p className="mt-1">
            Promedio de 3 metas cumplidas (visitas, clientes distintos y horas), cada una topeada a
            100%. Pasá el mouse por el % de una fila para ver el desglose de ese vendedor.
        </p>
        <Nota>
            Metas mensuales: {META_VISITAS_TOTALES} visitas · {META_CLIENTES_DISTINTOS} clientes
            distintos · {META_HORAS} hs. Puede ser otra si hay un objetivo propio vigente.
        </Nota>
    </div>
)

/** Justifica el % de Efectividad de UNA fila puntual (un vendedor o el promedio del
 *  equipo) con sus tres cumplimientos reales. */
export const ayudaEfectividad = (m: IVendedorMetricas): React.ReactNode => (
    <div>
        <p className="text-sm font-semibold text-slate-900">
            Efectividad — {formatPctEscalado(m.efectividadOperativa)}
        </p>
        <ul className="mt-2 space-y-0.5">
            <li>Visitas: {formatPctEscalado(m.pctCumplimientoVisitas)}</li>
            <li>Clientes distintos: {formatPctEscalado(m.pctCumplimientoClientes)}</li>
            <li>Horas: {formatPctEscalado(m.pctCumplimientoMinutos)}</li>
        </ul>
        <Nota>Promedio de las tres, cada una topeada a 100% antes de promediar.</Nota>
    </div>
)

export const AYUDA_VISITAS_MENSUAL = (
    <div>
        <p className="text-sm font-semibold text-slate-900">Visitas (mensual)</p>
        <p className="mt-1">
            Visitas con GPS confirmado (≤100 m del cliente, al inicio y al fin) y duración de 10 a
            90 min. El resto no cuenta.
        </p>
        <Nota>Meta aparte por clientes distintos: {META_CLIENTES_DISTINTOS}/mes.</Nota>
    </div>
)

export const AYUDA_HORAS_MENSUAL = (
    <div>
        <p className="text-sm font-semibold text-slate-900">Horas (mensual)</p>
        <p className="mt-1">Horas de esas mismas visitas válidas.</p>
    </div>
)
