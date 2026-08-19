/** Contenido de ayuda de los 3 KPIs/columnas de Efectividad operativa, compartido
 *  entre KpisMensuales y TablaEfectividadOperativa para no duplicar el texto.
 *  Metas según docs/superpowers/specs/2026-08-18-efectividad-operativa-kpi-design.md
 *  (`pl_objetivo`, sembrada con 160 clientes / 6000 min por defecto). */

export const META_CLIENTES_DISTINTOS = 160
export const META_MINUTOS_TOTALES = 6000
export const META_HORAS = META_MINUTOS_TOTALES / 60

export const META_VISITAS_TEXTO = `Meta: ${META_CLIENTES_DISTINTOS} clientes/mes`
export const META_HORAS_TEXTO = `Meta: ${META_HORAS} hs/mes`

function Nota({ children }: { children: React.ReactNode }) {
    return <p className="mt-2 border-t border-slate-100 pt-2 text-slate-400 italic">{children}</p>
}

export const AYUDA_EFECTIVIDAD_OPERATIVA = (
    <div>
        <p className="text-sm font-semibold text-slate-900">Efectividad operativa</p>
        <p className="mt-1">
            Promedio 50/50 entre el % cumplido de la meta de clientes distintos visitados y el % cumplido
            de la meta de horas trabajadas. Cada uno se topea a 100% antes de promediar, por eso nunca
            supera el 100%.
        </p>
        <Nota>
            Metas mensuales por defecto: {META_CLIENTES_DISTINTOS} clientes distintos · {META_HORAS} horas
            ({META_MINUTOS_TOTALES} min). Pueden ser otras si el vendedor tiene un objetivo propio vigente.
        </Nota>
    </div>
)

export const AYUDA_VISITAS_MENSUAL = (
    <div>
        <p className="text-sm font-semibold text-slate-900">Visitas (mensual)</p>
        <p className="mt-1">
            Cantidad de visitas del mes con GPS confirmado (dentro de 300 m del cliente). Las que no pasan
            esa validación no cuentan acá.
        </p>
        <Nota>
            La meta de actividad se mide en clientes distintos visitados ({META_CLIENTES_DISTINTOS}/mes),
            no en cantidad de visitas: un cliente quincenal puede sumar más de una visita sin sumar más a
            la meta.
        </Nota>
    </div>
)

export const AYUDA_HORAS_MENSUAL = (
    <div>
        <p className="text-sm font-semibold text-slate-900">Horas (mensual)</p>
        <p className="mt-1">Horas totales dedicadas a esas mismas visitas válidas.</p>
        <Nota>Meta mensual por defecto: {META_HORAS} horas ({META_MINUTOS_TOTALES} min).</Nota>
    </div>
)
