import { DURACION_MIN_VALIDA, TOLERANCIA_METROS } from '@/lib/analiticaFormat'
import { Nota } from './ayudaEfectividadOperativa'

/**
 * Ayudas de las tarjetas del detalle de un vendedor (`AnaliticaVendedorPage`). Existen
 * porque los números no se explican solos y se contradicen a primera vista: "Visitas"
 * no coincide con las filas de la tabla, las horas no se dividen por las visitas para
 * dar la duración promedio, y "Visitas/día" no usa el total de visitas.
 *
 * El criterio de validez vive en `pl_criterio_visita` y no se expone por API: si cambia,
 * estos textos (vía TOLERANCIA_METROS / DURACION_MIN_VALIDA) se actualizan a mano.
 */

function Titulo({ children }: { children: React.ReactNode }) {
    return <p className="text-sm font-semibold text-slate-900">{children}</p>
}

export const AYUDA_VISITAS = (
    <div>
        <Titulo>Visitas</Titulo>
        <p className="mt-1">
            Visitas iniciadas en el rango. No incluye los "no visité", que sí aparecen en la
            tabla: por eso la tabla puede tener más filas.
        </p>
        <p className="mt-1">
            <span className="font-medium text-emerald-700">Válidas</span>: empezó y terminó a{' '}
            {TOLERANCIA_METROS} m o menos del cliente y duró al menos {DURACION_MIN_VALIDA} min.{' '}
            <span className="font-medium text-red-700">No validadas</span>: falló la distancia o
            la duración.
        </p>
        <Nota>
            Si el cliente no tiene coordenadas cargadas, la visita no se puede verificar y no
            cuenta en ninguna de las dos. Tocá Válidas o No validadas para filtrar la tabla.
        </Nota>
    </div>
)

export const AYUDA_HORAS = (
    <div>
        <Titulo>Horas</Titulo>
        <p className="mt-1">
            Suma la duración de todas las visitas cerradas del rango, válidas o no. La visita
            en curso todavía no suma.
        </p>
        <p className="mt-1">
            "Válidas" es la parte de esas horas que cumple el criterio; "Resto"
            son no validadas y visitas a clientes sin coordenadas.
        </p>
        <Nota>El objetivo de horas de Efectividad operativa se mide contra el total.</Nota>
    </div>
)

export const AYUDA_COBERTURA = (
    <div>
        <Titulo>Cobertura</Titulo>
        <p className="mt-1">
            Clientes del plan visitados sobre clientes planificados, en las rotaciones que
            tocan el rango. Un "no visité" no suma, y los clientes agregados fuera del plan
            tampoco.
        </p>
        <Nota>Si una rotación sigue abierta, la cobertura todavía puede subir.</Nota>
    </div>
)

export const AYUDA_EFECTIVIDAD_COMERCIAL = (
    <div>
        <Titulo>Efectividad comercial</Titulo>
        <p className="mt-1">
            Rubros ganados sobre rubros ofrecidos. Los diferidos y los perdidos cuentan como
            ofrecidos pero no como ganados, así que un vendedor con todo "Diferido" da 0%.
        </p>
        <Nota>Los "No lo ofrecí" y los rubros sin resolver no entran en la cuenta.</Nota>
    </div>
)

export const AYUDA_VISITAS_POR_DIA = (
    <div>
        <Titulo>Visitas por día</Titulo>
        <p className="mt-1">
            Clientes del plan visitados dividido los días hábiles del rango. No usa el total de
            la tarjeta Visitas: deja afuera las visitas fuera del plan y la que está en curso.
        </p>
    </div>
)

export const AYUDA_DURACION_PROMEDIO = (
    <div>
        <Titulo>Duración promedio</Titulo>
        <p className="mt-1">
            Promedio de las visitas válidas solamente. Por eso no da igual que dividir las
            horas por la cantidad de visitas: las horas suman también las no validadas.
        </p>
    </div>
)
