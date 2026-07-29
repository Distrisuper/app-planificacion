import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import { getWeekDates, formatDayDate } from '@/lib/weekDates'
import type { Dia, EstadoCicloCliente } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']
const DIA_NOMBRE: Record<Dia, string> = { LUN: 'Lunes', MAR: 'Martes', MIE: 'Miércoles', JUE: 'Jueves', VIE: 'Viernes' }

type Seleccion = Dia | 'no_visita'

interface EstadoVisitaSheetProps {
    open: boolean
    nombreCliente: string
    diaActual: Dia | null
    estadoActual: EstadoCicloCliente | null
    onElegirDia: (dia: Dia) => void
    onElegirNoVisita: () => void
    onClose: () => void
}

export default function EstadoVisitaSheet({
    open,
    nombreCliente,
    diaActual,
    estadoActual,
    onElegirDia,
    onElegirNoVisita,
    onClose,
}: EstadoVisitaSheetProps) {
    const weekDates = getWeekDates()
    const [seleccion, setSeleccion] = useState<Seleccion | null>(null)
    const yaNoVisita = estadoActual === 'no_visita'

    // El sheet queda montado entre aperturas (el caller solo togglea `open`): sin esto
    // la selección de la visita anterior quedaría pegada en la próxima apertura.
    useEffect(() => {
        if (!open) setSeleccion(null)
    }, [open])

    function confirmar() {
        if (seleccion === 'no_visita') onElegirNoVisita()
        else if (seleccion) onElegirDia(seleccion)
    }

    return (
        <BottomSheet open={open} onClose={onClose} title={nombreCliente} eyebrow="Estado de la visita">
            <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                {diaActual && <>Actualmente el <b>{DIA_NOMBRE[diaActual]}</b>. </>}
                Elegí el nuevo día de la visita:
            </p>
            <div className="flex flex-col gap-2">
                {DIAS.map(d => {
                    const isActual = d === diaActual
                    const isSel = seleccion === d
                    return (
                        <button
                            key={d}
                            onClick={() => setSeleccion(d)}
                            className={`h-11 w-full rounded-lg border-[1.5px] px-4 text-left text-[14px] font-semibold ${
                                isSel
                                    ? 'border-dsnavy bg-dsnavy/10 text-dsnavy'
                                    : isActual
                                      ? 'border-transparent bg-dsnavy/5 font-bold text-dsnavy'
                                      : 'border-[#E1E6F0] text-[#182645]'
                            }`}
                        >
                            {DIA_NOMBRE[d]} · {formatDayDate(weekDates[d])}
                            {isActual && <span className="text-dsmuted"> (actual)</span>}
                        </button>
                    )
                })}
            </div>

            <div className="my-4 flex items-center gap-2">
                <div className="h-px flex-1 bg-[#E7E9F0]" />
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-dsmuted">O registrar</span>
                <div className="h-px flex-1 bg-[#E7E9F0]" />
            </div>

            <button
                onClick={() => setSeleccion('no_visita')}
                disabled={yaNoVisita}
                className={`flex h-11 w-full items-center gap-2 rounded-lg border-[1.5px] px-4 text-left text-[14px] font-semibold disabled:opacity-60 ${
                    seleccion === 'no_visita' ? 'border-dsred bg-dsred/10 text-dsred' : 'border-[#E1E6F0] text-[#182645]'
                }`}
            >
                <X className="h-[14px] w-[14px]" strokeWidth={2.4} />
                No visité
                {yaNoVisita && <span className="text-dsmuted"> (ya registrado)</span>}
            </button>

            <Button
                disabled={!seleccion}
                onClick={confirmar}
                className="mt-4 h-12 w-full bg-dsgreen text-[14.5px] hover:bg-dsgreen/90"
            >
                Elegí una opción
            </Button>
        </BottomSheet>
    )
}
