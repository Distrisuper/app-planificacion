import BottomSheet from './ui/BottomSheet'
import { fechaCorta, semanasPorMes } from '@/lib/semanaCalendario'

interface ElegirSemanaSheetProps {
    open: boolean
    onClose: () => void
    /** Las semanas navegables (`semanasNavegables`): desde el 2/11 hasta la última del
     *  horizonte. Más allá no se ofrece nada. */
    semanas: string[]
    fechaLunesEnCurso: string
    /** La que está en pantalla, marcada. */
    fechaVista: string | null
    onElegir: (fechaLunes: string) => void
}

/**
 * Saltar a una semana sin apretar la flecha veinte veces: el historial crece una semana por
 * semana. Agrupada por mes (lo reciente arriba), cada semana es un chip con la fecha de su
 * lunes, igual que los chips de semana de "Reagendar". Sin `<input type="date">`: un día
 * suelto no es una semana, y el selector nativo no respeta el estilo de la app.
 */
export default function ElegirSemanaSheet({
    open,
    onClose,
    semanas,
    fechaLunesEnCurso,
    fechaVista,
    onElegir,
}: ElegirSemanaSheetProps) {
    return (
        <BottomSheet open={open} onClose={onClose} title="Elegir semana" altura="hasta-completa">
            <div className="flex flex-col gap-4">
                {semanasPorMes(semanas).map(grupo => (
                    <section key={grupo.mes}>
                        <h3 className="mb-2 text-[12px] font-semibold text-tinta-2">{grupo.mes}</h3>
                        <div className="flex flex-wrap gap-2">
                            {grupo.fechas.map(f => {
                                const enCurso = f === fechaLunesEnCurso
                                return (
                                    <button
                                        key={f}
                                        type="button"
                                        aria-label={`Semana del ${fechaCorta(f)}`}
                                        aria-pressed={f === fechaVista}
                                        onClick={() => {
                                            onElegir(f)
                                            onClose()
                                        }}
                                        className={`flex h-11 min-w-[64px] flex-col items-center justify-center rounded-lg border-[1.5px] px-3 leading-tight text-tinta ${
                                            f === fechaVista ? 'border-primario font-bold' : 'border-linea'
                                        }`}
                                    >
                                        <span className="text-[13px] font-semibold">{fechaCorta(f)}</span>
                                        {enCurso && <span className="text-[10px] text-tinta-2">Esta semana</span>}
                                    </button>
                                )
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </BottomSheet>
    )
}
