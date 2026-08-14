import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import BottomSheet from '@/components/ui/BottomSheet'
import { useConfirmarExtra, useConsultarBuscador, useBuscarEnCartera } from '@/hooks/useBuscador'
import { useReacomodar } from '@/hooks/useCiclo'
import { diaLabel, etiquetaEstado, zonaLabel } from './etiquetas'
import type { NotificacionTipo } from '@/components/ui/Notification'
import type {
    IAgendaClient,
    IConsultaBuscador,
    IResultadoBuscadorGeneral,
} from '@/types/planificacion'

interface BuscadorDiaSheetProps {
    open: boolean
    onClose: () => void
    /** La zona (semana de rotación) en curso y el día del "+" que se tocó: la celda
     *  destino de todo lo que hace este sheet. */
    semana: number
    dia: number
    /** Se creó una fila `es_extra` nueva en la celda destino. */
    onExtraCreada: (cliente: IAgendaClient) => void
    /** El cliente ya tenía una fila pendiente y se decidió ir a verla en vez de crear. */
    onNavegarAExistente: (cliente: IAgendaClient) => void
    /** Se movió una fila existente a la celda destino (reacomodar, no crear). */
    onTraido: () => void
    onAviso: (tipo: NotificacionTipo, mensaje: string) => void
}

type Consulta = {
    codigo: string
    nombre: string
    resultado: IConsultaBuscador
}

/**
 * El buscador que ESCRIBE, colgado del "+" del encabezado de cada día.
 *
 * Dos salidas, y la elección es del vendedor porque el sistema no puede distinguirlas
 * (ver "Corregir el plan y registrar un hecho son cosas distintas" en CLAUDE.md):
 *
 *  - **Traer**: el cliente cambia de lugar en el plan. Mueve la fila con `reacomodar`,
 *    queda auditado en `pl_reacomodacion` y el denominador no se mueve.
 *  - **Agregar**: pasada puntual fuera de plan. Crea una fila `es_extra` y deja la fila
 *    planificada donde estaba, todavía pendiente.
 *
 * Lo que NUNCA ofrece es resolver la fila de otra zona sin moverla: eso es lo que
 * rompe la cadencia sin dejar rastro, y es el agujero que este buscador vino a tapar
 * (spec 2026-08-12).
 */
export function BuscadorDiaSheet({
    open,
    onClose,
    semana,
    dia,
    onExtraCreada,
    onNavegarAExistente,
    onTraido,
    onAviso,
}: BuscadorDiaSheetProps) {
    const [texto, setTexto] = useState('')
    const [consulta, setConsulta] = useState<Consulta | null>(null)
    const { data: resultados = [], buscando } = useBuscarEnCartera(texto)
    const consultarBuscador = useConsultarBuscador()
    const confirmarExtra = useConfirmarExtra()
    const reacomodar = useReacomodar()

    const nombreDia = diaLabel(dia)
    const trabajando = confirmarExtra.isPending || reacomodar.isPending

    // Hoy la página desmonta el sheet al cerrarlo, así que el estado se limpia solo;
    // esto lo deja igual de correcto si algún día se lo deja montado, sin que el texto
    // de la búsqueda anterior reaparezca en la próxima apertura.
    useEffect(() => {
        if (!open) {
            setTexto('')
            setConsulta(null)
        }
    }, [open])

    function cerrar() {
        setTexto('')
        setConsulta(null)
        onClose()
    }

    async function handleSeleccionar(r: IResultadoBuscadorGeneral) {
        try {
            const resultado = await consultarBuscador.mutateAsync({
                codigo: r.codigoParticularCliente,
                semana,
            })
            setConsulta({ codigo: r.codigoParticularCliente, nombre: r.nombreCliente, resultado })
        } catch {
            onAviso('error', 'No pudimos consultar este cliente. Volvé a intentar.')
        }
    }

    function handleVerExistente() {
        const cliente = consulta?.resultado.filaExistente
        if (!cliente) return
        cerrar()
        onNavegarAExistente(cliente)
    }

    async function handleTraer(rotacionClienteId: number) {
        try {
            await reacomodar.mutateAsync({ rotacionClienteId, semana, dia })
            cerrar()
            onTraido()
        } catch {
            onAviso('error', 'No se pudo mover el cliente. Volvé a intentar.')
        }
    }

    async function handleAgregarExtra() {
        if (!consulta) return
        try {
            const creada = await confirmarExtra.mutateAsync({ codigo: consulta.codigo, semana, dia })
            cerrar()
            onExtraCreada(creada)
        } catch {
            onAviso('error', 'No se pudo agregar el cliente. Volvé a intentar.')
        }
    }

    const fila = consulta?.resultado.filaExistente
    // Ya está pendiente en esta zona pero en OTRO día: traerlo acá es reagendar dentro
    // de la zona, que es una decisión táctica del vendedor. Si ya está en este mismo
    // día no hay nada que mover — solo queda verlo.
    const enOtroDiaDeEstaZona = fila != null && fila.dia !== dia

    return (
        <BottomSheet
            open={open}
            onClose={cerrar}
            eyebrow="Agregar al"
            title={nombreDia}
            /* Altura FIJA mientras se busca: con 'hasta-completa' el sheet se estiraba y
               encogía con cada tecla —cada resultado que entra o sale mueve el alto— y el
               input se iba corriendo bajo el dedo. La lista scrollea adentro. Al pasar a
               confirmar sí baja a 'auto': ahí el contenido es un párrafo y dos botones, y
               es un cambio de paso deliberado, no un salto mientras se tipea. */
            altura={consulta ? 'auto' : 'completa'}
        >
            {!consulta && (
                <div className="flex flex-col gap-2">
                    <div className="relative mb-1">
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A93A6]"
                            strokeWidth={2.4}
                        />
                        <input
                            className="w-full rounded-[11px] border-[1.5px] border-[#E4E8F0] py-2.5 pl-9 pr-3 text-sm font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6]"
                            placeholder="Nombre o código del cliente"
                            value={texto}
                            onChange={e => setTexto(e.target.value)}
                            autoFocus
                        />
                    </div>
                    {buscando && <p className="px-1 text-sm text-dsmuted">Buscando…</p>}
                    <div className="flex flex-col gap-1.5">
                        {resultados.map(r => (
                            <button
                                key={r.codigoParticularCliente}
                                type="button"
                                disabled={consultarBuscador.isPending}
                                className="flex w-full flex-col items-start gap-0.5 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white px-3 py-2.5 text-left disabled:opacity-60"
                                onClick={() => handleSeleccionar(r)}
                            >
                                <span className="w-full truncate text-sm font-bold text-[#3B4560]">
                                    {r.nombreCliente}
                                </span>
                                <span className="text-xs text-dsmuted">{etiquetaEstado(r)}</span>
                            </button>
                        ))}
                        {texto.trim().length >= 2 && !buscando && resultados.length === 0 && (
                            <div className="py-6 text-center text-sm text-dsmuted">Sin resultados</div>
                        )}
                        {texto.trim().length < 2 && (
                            <div className="py-6 text-center text-sm leading-relaxed text-dsmuted">
                                Buscá en toda tu cartera,
                                <br />
                                esté o no en la hoja de ruta.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {consulta && consulta.resultado.estado === 'pendiente_zona_actual' && (
                <div className="flex flex-col gap-3">
                    <p className="text-sm leading-snug text-[#182645]">
                        <b>{consulta.nombre}</b>{' '}
                        {enOtroDiaDeEstaZona
                            ? `ya está en tu ruta el ${diaLabel(fila!.dia)} de esta zona.`
                            : `ya está en tu ruta el ${nombreDia}.`}
                    </p>
                    <div className="flex flex-col gap-2">
                        {enOtroDiaDeEstaZona && (
                            <button
                                type="button"
                                disabled={trabajando}
                                className="h-11 w-full rounded-lg bg-dsnavy text-sm font-semibold text-white disabled:opacity-60"
                                onClick={() => handleTraer(fila!.rotacionClienteId)}
                            >
                                Traerlo al {nombreDia}
                            </button>
                        )}
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
                                className={`h-11 flex-1 rounded-lg text-sm font-semibold ${
                                    enOtroDiaDeEstaZona
                                        ? 'border-[1.5px] border-[#E1E6F0] text-[#182645]'
                                        : 'bg-dsnavy text-white'
                                }`}
                                onClick={handleVerExistente}
                            >
                                Ver cliente
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {consulta &&
                consulta.resultado.estado === 'pendiente_otra_zona' &&
                consulta.resultado.otraZona && (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm leading-snug text-[#182645]">
                            <b>{consulta.nombre}</b> ya está planificado el{' '}
                            {diaLabel(consulta.resultado.otraZona.dia)} en{' '}
                            <b>
                                {zonaLabel(
                                    consulta.resultado.otraZona.descripcionZona,
                                    consulta.resultado.otraZona.semana,
                                )}
                            </b>
                            .
                        </p>
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                disabled={trabajando}
                                className="h-11 w-full rounded-lg bg-dsnavy text-sm font-semibold text-white disabled:opacity-60"
                                onClick={() => handleTraer(consulta.resultado.otraZona!.rotacionClienteId)}
                            >
                                Traerlo al {nombreDia}
                            </button>
                            {/* Segundo, y sin color de acción principal: mover el plan es lo
                                correcto cuando el cliente cambió de lugar; la extra es para la
                                pasada puntual, y deja la visita de la otra zona pendiente. */}
                            <button
                                type="button"
                                disabled={trabajando}
                                className="h-11 w-full rounded-lg border-[1.5px] border-[#E1E6F0] text-sm font-semibold text-[#182645] disabled:opacity-60"
                                onClick={handleAgregarExtra}
                            >
                                Agregar igual, sin sacarlo de ahí
                            </button>
                            <button
                                type="button"
                                className="h-11 w-full text-sm font-semibold text-dsmuted"
                                onClick={() => setConsulta(null)}
                            >
                                Volver
                            </button>
                        </div>
                    </div>
                )}

            {consulta && consulta.resultado.estado === 'sin_fila_disponible' && (
                <div className="flex flex-col gap-3">
                    <p className="text-sm leading-snug text-[#182645]">
                        <b>{consulta.nombre}</b> no está pendiente en ningún día de esta vuelta. Se
                        agrega al {nombreDia} como visita extra.
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
                            disabled={trabajando}
                            className="h-11 flex-1 rounded-lg bg-dsgreen text-sm font-semibold text-white disabled:opacity-60"
                            onClick={handleAgregarExtra}
                        >
                            Agregar
                        </button>
                    </div>
                </div>
            )}
        </BottomSheet>
    )
}
