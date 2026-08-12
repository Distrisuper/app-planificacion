import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import { getWeekDates, formatDayDate } from '@/lib/weekDates'
import type { Dia, EstadoCicloCliente, IZonaCiclo } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']
const DIA_NOMBRE: Record<Dia, string> = { LUN: 'Lunes', MAR: 'Martes', MIE: 'Miércoles', JUE: 'Jueves', VIE: 'Viernes' }

type Seleccion = Dia | 'no_visita'

interface EstadoVisitaSheetProps {
    open: boolean
    nombreCliente: string
    diaActual: Dia | null
    estadoActual: EstadoCicloCliente | null
    semanaActual: number
    /** El vendedor no ve "semana" como vocabulario propio (spec 2026-08-12): cada
     *  chip muestra la descripción de la zona, con "Semana N" como fallback chico y
     *  gris SOLO cuando la zona sí tiene nombre — si no lo tiene, "Semana N" pasa a
     *  ser el texto principal y no se duplica abajo. */
    semanasDisponibles: IZonaCiclo[]
    onReagendar: (semana: number, dia: Dia) => void
    onElegirNoVisita: () => void
    onClose: () => void
}

export default function EstadoVisitaSheet({
    open,
    nombreCliente,
    diaActual,
    estadoActual,
    semanaActual,
    semanasDisponibles,
    onReagendar,
    onElegirNoVisita,
    onClose,
}: EstadoVisitaSheetProps) {
    const weekDates = getWeekDates()
    const [semanaElegida, setSemanaElegida] = useState(semanaActual)
    const [seleccion, setSeleccion] = useState<Seleccion | null>(null)
    const yaNoVisita = estadoActual === 'no_visita'

    // El sheet queda montado entre aperturas (el caller solo togglea `open`): sin esto
    // la selección de la visita anterior quedaría pegada en la próxima apertura.
    useEffect(() => {
        if (!open) {
            setSeleccion(null)
            setSemanaElegida(semanaActual)
        }
    }, [open, semanaActual])

    function confirmar() {
        if (seleccion === 'no_visita') onElegirNoVisita()
        else if (seleccion) onReagendar(semanaElegida, seleccion)
    }

    const esPosicionActual = (d: Dia) => semanaElegida === semanaActual && d === diaActual

    // Nombre de la zona elegida, con el mismo fallback que el header: si nunca se
    // nombró, el número es lo único que hay para mostrar.
    const nombreZonaElegida =
        semanasDisponibles.find(z => z.semana === semanaElegida)?.descripcion ??
        `Semana ${semanaElegida}`

    let labelBoton = 'Elegí un día'
    if (seleccion === 'no_visita') labelBoton = 'Registrar No visité'
    else if (seleccion && esPosicionActual(seleccion)) labelBoton = `Ya está el ${DIA_NOMBRE[seleccion]}`
    else if (seleccion && semanaElegida !== semanaActual)
        labelBoton = `Mover a ${nombreZonaElegida} · ${DIA_NOMBRE[seleccion]}`
    else if (seleccion) labelBoton = `Mover al ${DIA_NOMBRE[seleccion]}`

    const deshabilitarBoton = !seleccion || (seleccion !== 'no_visita' && esPosicionActual(seleccion))

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={nombreCliente}
            eyebrow="Estado de la visita"
            // Hasta el alto completo, no fijo: con las cinco zonas en dos filas, los
            // cinco días y "No visité", el contenido no entra en el 85vh del sheet auto
            // y "No visité" quedaba abajo del corte — invisible, porque nada indica que
            // la lista sigue; los ~50px que agrega el 90dvh alcanzan para que entre
            // entero. Pero un vendedor de una sola zona no ve los chips
            // (`semanasDisponibles.length > 1`) y su contenido baja a ~390px: con altura
            // fija ahí quedaba un hueco blanco de ~200px sobre el pie.
            altura="hasta-completa"
            // En el pie FIJO, no al final del contenido: con cinco zonas, cinco días y
            // "No visité", la lista pasa el alto del sheet y el botón quedaba abajo de
            // todo, fuera de la pantalla — el vendedor elegía un día y no veía con qué
            // confirmarlo.
            footer={
                <Button
                    disabled={deshabilitarBoton}
                    onClick={confirmar}
                    className="h-12 w-full bg-dsgreen text-[14.5px] hover:bg-dsgreen/90"
                >
                    {labelBoton}
                </Button>
            }
        >
            {semanasDisponibles.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-2">
                    {semanasDisponibles.map(z => (
                        <button
                            key={z.semana}
                            onClick={() => setSemanaElegida(z.semana)}
                            className={`flex h-11 flex-col items-center justify-center rounded-lg border-[1.5px] px-3 leading-tight ${
                                z.semana === semanaElegida
                                    ? 'border-dsnavy bg-dsnavy/10 text-dsnavy'
                                    : 'border-[#E1E6F0] text-[#182645]'
                            }`}
                        >
                            <span className="text-[13px] font-semibold">
                                {z.descripcion ?? `Semana ${z.semana}`}
                            </span>
                            {/* Solo si tiene nombre: si no, "Semana N" ya es el texto de
                                arriba y repetirlo achicado abajo sería ruido. */}
                            {z.descripcion && (
                                <span className="text-[10px] text-dsmuted">Semana {z.semana}</span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                {diaActual && <>Actualmente el <b>{DIA_NOMBRE[diaActual]}</b>. </>}
                Elegí el nuevo día de la visita:
            </p>
            <div className="flex flex-col gap-2">
                {DIAS.map(d => {
                    const isActual = semanaElegida === semanaActual && d === diaActual
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
                            {DIA_NOMBRE[d]}
                            {semanaElegida === semanaActual && <> · {formatDayDate(weekDates[d])}</>}
                            {isActual && <span className="text-dsmuted"> (actual)</span>}
                        </button>
                    )
                })}
            </div>

            <div className="my-3 flex items-center gap-2">
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
        </BottomSheet>
    )
}
