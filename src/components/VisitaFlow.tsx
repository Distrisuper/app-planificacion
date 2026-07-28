import { useState } from 'react'
import PropuestaSheet from './PropuestaSheet'
import VisitaSheet from './VisitaSheet'
import { useCerrarVisita, useIniciarVisita } from '@/hooks/useVisitas'
import { capturarUbicacion, type GeoResult } from '@/lib/geolocation'
import { errorCode } from '@/lib/apiError'
import type { IAgendaClient } from '@/types/planificacion'

interface VisitaFlowProps {
    /** null = no hay flujo abierto. */
    cliente: IAgendaClient | null
    onClose: () => void
    onGeoBloqueada: (motivo: Exclude<GeoResult, { ok: true }>['motivo']) => void
    onAviso?: (mensaje: string) => void
}

/**
 * El flujo completo de una visita: propuesta → iniciar → rubros → cerrar.
 *
 * Vive fuera de AgendaSemanaPage para que la página quede como shell: acá se concentra
 * todo el estado de la visita en curso.
 */
export default function VisitaFlow({
    cliente,
    onClose,
    onGeoBloqueada,
    onAviso,
}: VisitaFlowProps) {
    const iniciar = useIniciarVisita()
    const cerrar = useCerrarVisita()

    // Se captura del response de iniciarVisita en vez de releerlo de useVisitaActiva:
    // esa query solo refresca porque la mutación la invalida, y si ESE refetch fallara
    // (bache de red, 401 transitorio) el id quedaría null sobre una visita que el
    // servidor sí creó.
    const [visitaIniciadaId, setVisitaIniciadaId] = useState<number | null>(null)

    if (!cliente) return null

    // Un cliente con visita ya abierta (o cerrada con rubros pendientes) entra derecho
    // a los rubros: la propuesta pre-visita ya no aplica, manda el snapshot.
    const visitaId = visitaIniciadaId ?? cliente.visitaId
    const enRubros = visitaId !== null && cliente.estado !== 'pendiente'
    const mostrarRubros = visitaIniciadaId !== null || enRubros

    async function conUbicacion(accion: (coord: string) => Promise<void>) {
        const geo = await capturarUbicacion()
        if (!geo.ok) {
            onGeoBloqueada(geo.motivo)
            return
        }
        await accion(geo.coord)
    }

    async function onIniciar() {
        await conUbicacion(async coord => {
            try {
                const { visitaId: id } = await iniciar.mutateAsync({
                    cicloClienteId: cliente!.cicloClienteId,
                    coordInicio: coord,
                })
                setVisitaIniciadaId(id)
            } catch (err) {
                const code = errorCode(err)
                if (code === 'VISITA_ACTIVA_EXISTENTE' || code === 'CICLO_CLIENTE_YA_RESUELTO') {
                    // La agenda estaba vieja. La invalidación del hook ya disparó el
                    // refetch; cerrar el flujo evita que siga operando sobre datos rancios.
                    onAviso?.('Este cliente ya fue resuelto. Actualizamos tu agenda.')
                    cerrarFlujo()
                    return
                }
                onAviso?.('No se pudo iniciar la visita. Volvé a intentar.')
            }
        })
    }

    async function onCerrarVisita() {
        if (visitaId === null) return
        await conUbicacion(async coord => {
            try {
                const res = await cerrar.mutateAsync({ visitaId, coordFinal: coord })
                if (res.rubrosPendientes > 0) {
                    onAviso?.(
                        `Visita cerrada. Te quedan ${res.rubrosPendientes} rubros por cargar.`,
                    )
                }
                cerrarFlujo()
            } catch (err) {
                if (errorCode(err) === 'VISITA_YA_CERRADA') {
                    // Tratar como éxito: la visita está cerrada, que es lo que se quería.
                    cerrarFlujo()
                    return
                }
                onAviso?.('No se pudo cerrar la visita. Volvé a intentar.')
            }
        })
    }

    function cerrarFlujo() {
        setVisitaIniciadaId(null)
        onClose()
    }

    const nombre = cliente.nombreFantasia || cliente.nombreCliente

    return (
        <>
            <PropuestaSheet
                open={!mostrarRubros}
                codigoCliente={cliente.codigoParticularCliente}
                nombreCliente={nombre}
                iniciando={iniciar.isPending}
                onIniciarVisita={onIniciar}
                onClose={cerrarFlujo}
            />
            {visitaId !== null && (
                <VisitaSheet
                    open={mostrarRubros}
                    visitaId={visitaId}
                    nombreCliente={nombre}
                    visitaCerrada={cliente.estado === 'visitada'}
                    cerrando={cerrar.isPending}
                    onCerrarVisita={onCerrarVisita}
                    onClose={cerrarFlujo}
                />
            )}
        </>
    )
}
