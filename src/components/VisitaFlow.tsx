import { useEffect, useState } from 'react'
import PropuestaSheet from './PropuestaSheet'
import VisitaSheet from './VisitaSheet'
import IniciarVisitaMapa from './IniciarVisitaMapa'
import VisitaEnCursoBar from './VisitaEnCursoBar'
import { useCerrarVisita, useIniciarVisita } from '@/hooks/useVisitas'
import { capturarUbicacion, type GeoResult } from '@/lib/geolocation'
import { errorCode } from '@/lib/apiError'
import { limpiarInicioVisita, marcarInicioVisita } from '@/lib/visitaTimer'
import type { NotificacionTipo } from '@/components/ui/Notification'
import type { IAgendaClient, IPropuestaRubroDTO } from '@/types/planificacion'

interface VisitaFlowProps {
    /** null = no hay flujo abierto. */
    cliente: IAgendaClient | null
    onClose: () => void
    onGeoBloqueada: (motivo: Exclude<GeoResult, { ok: true }>['motivo']) => void
    onAviso?: (tipo: NotificacionTipo, mensaje: string) => void
}

/**
 * El flujo completo de una visita: propuesta → iniciar → rubros → cerrar.
 *
 * Vive fuera de AgendaSemanaPage para que la página quede como shell: acá se concentra
 * todo el estado de la visita en curso.
 */
export default function VisitaFlow({ cliente, onClose, onGeoBloqueada, onAviso }: VisitaFlowProps) {
    const iniciar = useIniciarVisita()
    const cerrar = useCerrarVisita()

    // Se captura del response de iniciarVisita en vez de releerlo de useVisitaActiva:
    // esa query solo refresca porque la mutación la invalida, y si ESE refetch fallara
    // (bache de red, 401 transitorio) el id quedaría null sobre una visita que el
    // servidor sí creó.
    const [visitaIniciadaId, setVisitaIniciadaId] = useState<number | null>(null)
    // Propuesta ya confirmada en el sheet, esperando que se confirme en el mapa. Solo se usa
    // cuando el cliente tiene coordenadas; si no, onIniciar se llama directo.
    const [propuestaPendiente, setPropuestaPendiente] = useState<IPropuestaRubroDTO[] | null>(
        null,
    )
    const [minimizado, setMinimizado] = useState(false)
    // Mensaje del último intento de iniciar fallido. A diferencia del toast (que desaparece
    // solo a los 2s y puede quedar tapado por el botón de "Iniciar visita" en el mapa
    // full-screen), este queda visible hasta el próximo intento.
    const [errorIniciar, setErrorIniciar] = useState<string | null>(null)

    // Sin esto, pasar de un cliente a otro sin cerrar el flujo (p.ej. tocar directo la card
    // de otro cliente) arrastraría el mapa pendiente o el minimizado del cliente anterior.
    useEffect(() => {
        setPropuestaPendiente(null)
        setMinimizado(false)
        setErrorIniciar(null)
    }, [cliente?.cicloClienteId])

    if (!cliente) return null

    // Un cliente con visita ya abierta (o cerrada con rubros pendientes) entra derecho
    // a los rubros: la propuesta pre-visita ya no aplica, manda el snapshot.
    const visitaId = visitaIniciadaId ?? cliente.visitaId
    const enRubros = visitaId !== null && cliente.estado !== 'pendiente'
    const mostrarRubros = visitaIniciadaId !== null || enRubros
    // `cliente` es una foto tomada al tocar la card: si la visita se inició EN esta sesión,
    // ese estado sigue diciendo 'pendiente' hasta que se cierre el flujo y se reabra (recién
    // ahí la agenda ya refrescó). visitaIniciadaId cubre ese hueco sin depender del refetch.
    const enCurso = cliente.estado === 'en_curso' || visitaIniciadaId !== null
    const tieneCoords = cliente.latitud != null && cliente.longitud != null

    async function conUbicacion(accion: (coord: string) => Promise<void>) {
        const geo = await capturarUbicacion()
        if (!geo.ok) {
            onGeoBloqueada(geo.motivo)
            return
        }
        await accion(geo.coord)
    }

    // Solo con coordenadas del cliente vale la pena mostrar el mapa (confirmar cercanía);
    // sin ellas se arranca directo, igual que antes.
    function onConfirmarPropuesta(propuesta: IPropuestaRubroDTO[]) {
        if (tieneCoords) {
            setPropuestaPendiente(propuesta)
        } else {
            onIniciar(propuesta)
        }
    }

    function onConfirmarEnMapa() {
        onIniciar(propuestaPendiente ?? [])
    }

    async function onIniciar(propuesta: IPropuestaRubroDTO[]) {
        setErrorIniciar(null)
        await conUbicacion(async coord => {
            try {
                const { visitaId: id } = await iniciar.mutateAsync({
                    cicloClienteId: cliente!.cicloClienteId,
                    coordInicio: coord,
                    propuesta,
                })
                setPropuestaPendiente(null)
                setVisitaIniciadaId(id)
                marcarInicioVisita(id)
                onAviso?.('exito', 'Visita iniciada')
            } catch (err) {
                const code = errorCode(err)
                if (code === 'VISITA_ACTIVA_EXISTENTE' || code === 'CICLO_CLIENTE_YA_RESUELTO') {
                    // La agenda estaba vieja. La invalidación del hook ya disparó el
                    // refetch; cerrar el flujo evita que siga operando sobre datos rancios.
                    onAviso?.('info', 'Este cliente ya fue resuelto. Actualizamos tu agenda.')
                    cerrarFlujo()
                    return
                }
                setErrorIniciar('No se pudo iniciar la visita. Volvé a intentar.')
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
                        'info',
                        `Visita cerrada. Te quedan ${res.rubrosPendientes} rubros por cargar.`,
                    )
                } else {
                    onAviso?.('exito', 'Visita cerrada')
                }
                limpiarInicioVisita(visitaId)
                cerrarFlujo()
            } catch (err) {
                if (errorCode(err) === 'VISITA_YA_CERRADA') {
                    // Tratar como éxito: la visita está cerrada, que es lo que se quería.
                    limpiarInicioVisita(visitaId)
                    cerrarFlujo()
                    return
                }
                onAviso?.('error', 'No se pudo cerrar la visita. Volvé a intentar.')
            }
        })
    }

    function cerrarFlujo() {
        setVisitaIniciadaId(null)
        setPropuestaPendiente(null)
        setMinimizado(false)
        setErrorIniciar(null)
        onClose()
    }

    const nombre = cliente.nombreFantasia || cliente.nombreCliente
    const direccionTexto = cliente.direccion || cliente.barrio

    return (
        <>
            <PropuestaSheet
                open={!mostrarRubros && propuestaPendiente === null}
                codigoCliente={cliente.codigoParticularCliente}
                nombreCliente={nombre}
                iniciando={iniciar.isPending}
                error={errorIniciar}
                onIniciarVisita={onConfirmarPropuesta}
                onClose={cerrarFlujo}
            />
            {visitaId !== null && !minimizado && (
                <VisitaSheet
                    open={mostrarRubros}
                    visitaId={visitaId}
                    nombreCliente={nombre}
                    visitaCerrada={cliente.estado === 'visitada'}
                    enCurso={enCurso}
                    onMinimize={() => setMinimizado(true)}
                    cerrando={cerrar.isPending}
                    onCerrarVisita={onCerrarVisita}
                    onClose={cerrarFlujo}
                />
            )}
            {visitaId !== null && minimizado && (
                <VisitaEnCursoBar
                    visitaId={visitaId}
                    nombreCliente={nombre}
                    onExpandir={() => setMinimizado(false)}
                />
            )}
            {tieneCoords && (
                <IniciarVisitaMapa
                    open={propuestaPendiente !== null}
                    nombreCliente={nombre}
                    direccion={direccionTexto}
                    latitud={cliente.latitud as number}
                    longitud={cliente.longitud as number}
                    iniciando={iniciar.isPending}
                    error={errorIniciar}
                    onIniciar={onConfirmarEnMapa}
                    onCancel={() => {
                        setPropuestaPendiente(null)
                        setErrorIniciar(null)
                    }}
                />
            )}
        </>
    )
}
