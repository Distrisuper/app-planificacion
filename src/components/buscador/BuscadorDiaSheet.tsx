import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import BottomSheet from '@/components/ui/BottomSheet'
import { useConfirmarExtra, useConsultarBuscador } from '@/hooks/useBuscador'
import type { IAgendaClient, IConsultaBuscador, IVisitClientCard } from '@/types/planificacion'

const DIA_NOMBRE = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes']

function diaLabel(dia: number): string {
    return DIA_NOMBRE[dia - 1] ?? `día ${dia}`
}

/** Sin acentos ni mayúsculas: mismo criterio que AlcanceBuscador — nadie tipea la
 *  tilde parado en un mostrador. */
function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
}

interface BuscadorDiaSheetProps {
    open: boolean
    onClose: () => void
    /** Se creó una fila `es_extra` nueva — el caller decide qué hacer con ella (hoy:
     *  abrir el mismo flujo de propuesta que `ClienteCard.onAbrir`). */
    onExtraCreada: (cliente: IAgendaClient) => void
    /** El cliente ya tenía una fila pendiente en la zona en curso — mismo destino que
     *  `onExtraCreada`, sin crear nada nuevo. */
    onNavegarAExistente: (cliente: IAgendaClient) => void
    /** La zona (semana de rotación) que el vendedor tiene abierta ahora mismo. */
    semanaEnCurso: number
    /** La cartera contra la que se busca. Hoy: los clientes ya cargados en la agenda de
     *  la semana en curso (no hay todavía un hook de "toda la cartera del vendedor" en
     *  este repo) — ver nota de limitación en el plan. */
    clientesCartera: IVisitClientCard[]
}

type Consulta = {
    codigo: string
    nombre: string
    resultado: IConsultaBuscador
}

export function BuscadorDiaSheet({
    open,
    onClose,
    onExtraCreada,
    onNavegarAExistente,
    semanaEnCurso,
    clientesCartera,
}: BuscadorDiaSheetProps) {
    const [texto, setTexto] = useState('')
    const [consulta, setConsulta] = useState<Consulta | null>(null)
    const consultarBuscador = useConsultarBuscador()
    const confirmarExtra = useConfirmarExtra()

    // El sheet queda montado entre aperturas — sin esto la búsqueda anterior quedaría
    // pegada la próxima vez que se abre (mismo criterio que EstadoVisitaSheet).
    useEffect(() => {
        if (!open) {
            setTexto('')
            setConsulta(null)
        }
    }, [open])

    const filtrados =
        texto.trim().length === 0
            ? []
            : clientesCartera
                  .filter(c => normalizar(c.nombreCliente).includes(normalizar(texto)))
                  .slice(0, 50)

    async function handleSeleccionar(cliente: IVisitClientCard) {
        const resultado = await consultarBuscador.mutateAsync({
            codigo: cliente.codigoParticularCliente,
            semana: semanaEnCurso,
        })
        setConsulta({ codigo: cliente.codigoParticularCliente, nombre: cliente.nombreCliente, resultado })
    }

    function handleVerExistente() {
        if (!consulta?.resultado.filaExistente) return
        const cliente = consulta.resultado.filaExistente
        setConsulta(null)
        setTexto('')
        onNavegarAExistente(cliente)
        onClose()
    }

    async function handleConfirmarExtra() {
        if (!consulta) return
        const creada = await confirmarExtra.mutateAsync({ codigo: consulta.codigo, semana: semanaEnCurso })
        setConsulta(null)
        setTexto('')
        onExtraCreada(creada)
        onClose()
    }

    return (
        <BottomSheet open={open} onClose={onClose} title="Buscar cliente" altura="hasta-completa">
            {!consulta && (
                <div className="flex flex-col gap-2">
                    <div className="relative mb-1">
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A93A6]"
                            strokeWidth={2.4}
                        />
                        <input
                            className="w-full rounded-[11px] border-[1.5px] border-[#E4E8F0] py-2.5 pl-9 pr-3 text-sm font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6]"
                            placeholder="Nombre del cliente"
                            value={texto}
                            onChange={e => setTexto(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {filtrados.map(cliente => (
                            <button
                                key={cliente.codigoParticularCliente}
                                type="button"
                                disabled={consultarBuscador.isPending}
                                className="flex w-full items-center gap-2.5 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white px-3 py-2.5 text-left disabled:opacity-60"
                                onClick={() => handleSeleccionar(cliente)}
                            >
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#3B4560]">
                                    {cliente.nombreCliente}
                                </span>
                            </button>
                        ))}
                        {texto.trim().length > 0 && filtrados.length === 0 && (
                            <div className="py-6 text-center text-sm text-dsmuted">Sin resultados</div>
                        )}
                    </div>
                </div>
            )}

            {consulta && consulta.resultado.estado === 'pendiente_zona_actual' && (
                <div className="flex flex-col gap-3">
                    <p className="text-sm leading-snug text-[#182645]">
                        <b>{consulta.nombre}</b> — pendiente hoy en esta zona.
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="h-11 flex-1 rounded-lg border-[1.5px] border-[#E1E6F0] text-sm font-semibold text-[#182645]"
                            onClick={() => setConsulta(null)}
                        >
                            Volver
                        </button>
                        <button
                            type="button"
                            className="h-11 flex-1 rounded-lg bg-dsnavy text-sm font-semibold text-white"
                            onClick={handleVerExistente}
                        >
                            Ver
                        </button>
                    </div>
                </div>
            )}

            {consulta && consulta.resultado.estado === 'pendiente_otra_zona' && consulta.resultado.otraZona && (
                <div className="flex flex-col gap-3">
                    <p className="text-sm leading-snug text-[#182645]">
                        Ya está planificado el {diaLabel(consulta.resultado.otraZona.dia)} en{' '}
                        <b>
                            {consulta.resultado.otraZona.descripcionZona ??
                                `zona ${consulta.resultado.otraZona.semana}`}
                        </b>
                        .
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="h-11 flex-1 rounded-lg border-[1.5px] border-[#E1E6F0] text-sm font-semibold text-[#182645]"
                            onClick={() => setConsulta(null)}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            disabled={confirmarExtra.isPending}
                            className="h-11 flex-1 rounded-lg bg-dsnavy text-sm font-semibold text-white disabled:opacity-60"
                            onClick={handleConfirmarExtra}
                        >
                            Agregar igual
                        </button>
                    </div>
                </div>
            )}

            {consulta && consulta.resultado.estado === 'sin_fila_disponible' && (
                <div className="flex flex-col gap-3">
                    <p className="text-sm leading-snug text-[#182645]">
                        <b>{consulta.nombre}</b> no está planificado hoy. Se va a agregar como visita
                        extra.
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="h-11 flex-1 rounded-lg border-[1.5px] border-[#E1E6F0] text-sm font-semibold text-[#182645]"
                            onClick={() => setConsulta(null)}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            disabled={confirmarExtra.isPending}
                            className="h-11 flex-1 rounded-lg bg-dsgreen text-sm font-semibold text-white disabled:opacity-60"
                            onClick={handleConfirmarExtra}
                        >
                            Agregar
                        </button>
                    </div>
                </div>
            )}
        </BottomSheet>
    )
}
