import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import { getWeekDates, formatDayDate } from '@/lib/weekDates'
import type { Dia } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']
const DIA_NOMBRE: Record<Dia, string> = { LUN: 'Lunes', MAR: 'Martes', MIE: 'Miércoles', JUE: 'Jueves', VIE: 'Viernes' }

interface ReagendarSheetProps {
    open: boolean
    nombreCliente: string
    diaActual: Dia | null
    onPick: (dia: Dia) => void
    onClose: () => void
}

export default function ReagendarSheet({ open, nombreCliente, diaActual, onPick, onClose }: ReagendarSheetProps) {
    const weekDates = getWeekDates()

    return (
        <BottomSheet open={open} onClose={onClose} title={nombreCliente} eyebrow="Reagendar visita">
            <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                Elegí el nuevo día de la visita:
            </p>
            <div className="flex flex-col gap-2">
                {DIAS.map(d => {
                    const isActual = d === diaActual
                    return (
                        <Button
                            key={d}
                            variant="outline"
                            onClick={() => onPick(d)}
                            className={
                                isActual
                                    ? 'h-11 w-full justify-start border-transparent bg-dsnavy/10 text-[14px] font-bold text-dsnavy'
                                    : 'h-11 w-full justify-start border-[#E1E6F0] text-[14px] font-semibold text-[#182645]'
                            }
                        >
                            {DIA_NOMBRE[d]} · {formatDayDate(weekDates[d])}
                            {isActual && <span className="text-dsmuted"> (actual)</span>}
                        </Button>
                    )
                })}
            </div>
        </BottomSheet>
    )
}
