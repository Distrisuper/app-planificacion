import PasoPeriodo from '@/components/ui/PasoPeriodo'
import Segmentado from '@/components/ui/Segmentado'
import { MODOS_PERIODO, avanzarPeriodo, fechaAlCambiarModo, nombrePeriodo, type ModoPeriodo } from '@/lib/periodo'

interface FiltroPeriodoProps {
    modo: ModoPeriodo
    fecha: Date
    onCambiarModo: (modo: ModoPeriodo) => void
    onCambiarFecha: (fecha: Date) => void
}

/** Día / Semana / Mes y `‹ Octubre 2026 ›` con las piezas del estándar: el mismo comportamiento
 *  que `SelectorPeriodo` (cambiar de modo vuelve a hoy, el día salta el fin de semana). */
export default function FiltroPeriodo({ modo, fecha, onCambiarModo, onCambiarFecha }: FiltroPeriodoProps) {
    const cambiarModo = (siguiente: ModoPeriodo) => {
        if (siguiente === modo) return
        onCambiarModo(siguiente)
        onCambiarFecha(fechaAlCambiarModo(siguiente))
    }
    return (
        <>
            <Segmentado etiqueta="Período" opciones={MODOS_PERIODO} valor={modo} onCambiar={cambiarModo} />
            <PasoPeriodo
                unidad={MODOS_PERIODO.find(m => m.valor === modo)!.etiqueta}
                texto={nombrePeriodo(modo, fecha)}
                onAnterior={() => onCambiarFecha(avanzarPeriodo(modo, fecha, -1))}
                onSiguiente={() => onCambiarFecha(avanzarPeriodo(modo, fecha, 1))}
            />
        </>
    )
}
