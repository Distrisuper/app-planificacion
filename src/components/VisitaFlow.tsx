import { useEffect, useState } from 'react'
import PropuestaSheet from './PropuestaSheet'
import VisitaSheet from './VisitaSheet'
import IniciarVisitaMapa from './IniciarVisitaMapa'
import { useCerrarVisita, useIniciarVisita } from '@/hooks/useVisitas'
import { capturarUbicacion, type GeoResult } from '@/lib/geolocation'
import { errorCode } from '@/lib/apiError'
import { limpiarInicioVisita, marcarInicioVisita } from '@/lib/visitaTimer'
import type { NotificacionTipo } from '@/components/ui/Notification'
import type { IAgendaClient, IPropuestaRubroDTO } from '@/types/planificacion'

/** La visita que está en curso ahora mismo, sea cual sea el cliente cuyo sheet esté
 *  abierto (o ninguno) — ver comentario en VisitaFlowProps.visitaEnCurso. */
export interface IVisitaEnCurso {
    cliente: IAgendaClient
    visitaId: number
}

interface VisitaFlowProps {
    /** null = no hay flujo abierto. */
    cliente: IAgendaClient | null
    /** La visita en curso del vendedor, si hay una — INDEPENDIENTE de `cliente`. Antes este
     *  componente guardaba ese dato como state local atado a `cliente`, así que tocar la
     *  propuesta de otro cliente y cerrarla perdía la referencia y la barra flotante
     *  desaparecía. Ahora vive en el padre (AgendaSemanaPage) y sobrevive a qué cliente
     *  esté mirando el vendedor en cada momento. */
    visitaEnCurso: IVisitaEnCurso | null
    onVisitaIniciada: (cliente: IAgendaClient, visitaId: number) => void
    onVisitaCerrada: () => void
    onClose: () => void
    onGeoBloqueada: (motivo: Exclude<GeoResult, { ok: true }>['motivo']) => void
    onAviso?: (tipo: NotificacionTipo, mensaje: string) => void
}

/**
 * El flujo completo de una visita: propuesta → iniciar → rubros → cerrar.
 *
 * Vive fuera de AgendaSemanaPage para que la página quede como shell: acá se concentra
 * todo el estado de la visita en curso, salvo `visitaEnCurso` (ver arriba).
 */
export default function VisitaFlow({
    cliente,
    visitaEnCurso,
    onVisitaIniciada,
    onVisitaCerrada,
    onClose,
    onGeoBloqueada,
    onAviso,
}: VisitaFlowProps) {
    const iniciar = useIniciarVisita()
    const cerrar = useCerrarVisita()

    // Propuesta ya confirmada en el sheet, esperando que se confirme en el mapa. Solo se usa
    // cuando el cliente tiene coordenadas; si no, onIniciar se llama directo.
    const [propuestaPendiente, setPropuestaPendiente] = useState<IPropuestaRubroDTO[] | null>(
        null,
    )
    // Mensaje del último intento de iniciar fallido. A diferencia del toast (que desaparece
    // solo a los 2s y puede quedar tapado por el botón de "Iniciar visita" en el mapa
    // full-screen), este queda visible hasta el próximo intento.
    const [errorIniciar, setErrorIniciar] = useState<string | null>(null)
    // Cubre TODO el handler (captura de GPS + mutación), no solo `iniciar.isPending`/
    // `cerrar.isPending`: la captura de ubicación puede tardar hasta ~23s (ver
    // capturarUbicacion) y corre ANTES de que la mutación arranque. Si el botón solo se
    // deshabilitara con isPending, quedaría habilitado durante esa espera, el vendedor lo
    // volvería a tocar creyendo que no respondió, y se dispararían llamadas concurrentes.
    const [iniciandoFlujo, setIniciandoFlujo] = useState(false)
    const [cerrandoFlujo, setCerrandoFlujo] = useState(false)

    // Sin esto, pasar de un cliente a otro sin cerrar el flujo (p.ej. tocar directo la card
    // de otro cliente) arrastraría el mapa pendiente o el error del cliente anterior.
    useEffect(() => {
        setPropuestaPendiente(null)
        setErrorIniciar(null)
    }, [cliente?.cicloClienteId])

    if (!cliente) return null

    // Solo el cliente de la visita en curso entra por acá. Cualquier otro cliente que el
    // vendedor mire mientras tanto queda en modo consulta: el backend igual rechazaría un
    // segundo POST /visitas con VISITA_ACTIVA_EXISTENTE (no se puede estar en dos lugares
    // a la vez), así que el bloqueo se muestra acá antes de gastar un viaje al servidor.
    const esClienteEnCurso =
        visitaEnCurso !== null && visitaEnCurso.cliente.cicloClienteId === cliente.cicloClienteId
    const bloqueadoPorOtraVisita = visitaEnCurso !== null && !esClienteEnCurso

    // Un cliente con visita ya abierta (o cerrada con rubros pendientes) entra derecho
    // a los rubros: la propuesta pre-visita ya no aplica, manda el snapshot.
    // `visitaEnCurso` es la fuente de verdad para ESTE cliente mientras la agenda no
    // refrescó todavía (recién se inició en esta sesión); si no aplica, se usa el
    // snapshot que ya trae `cliente` del servidor.
    const visitaId = esClienteEnCurso ? visitaEnCurso!.visitaId : cliente.visitaId
    const enRubros = visitaId !== null && cliente.estado !== 'pendiente'
    const mostrarRubros = esClienteEnCurso || enRubros
    const enCurso = cliente.estado === 'en_curso' || esClienteEnCurso
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
        if (bloqueadoPorOtraVisita) return
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
        if (iniciandoFlujo || bloqueadoPorOtraVisita) return
        setErrorIniciar(null)
        setIniciandoFlujo(true)
        try {
            await conUbicacion(async coord => {
                try {
                    const { visitaId: id } = await iniciar.mutateAsync({
                        cicloClienteId: cliente!.cicloClienteId,
                        coordInicio: coord,
                        propuesta,
                    })
                    setPropuestaPendiente(null)
                    onVisitaIniciada(cliente!, id)
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
        } finally {
            setIniciandoFlujo(false)
        }
    }

    async function onCerrarVisita() {
        if (visitaId === null || cerrandoFlujo) return
        setCerrandoFlujo(true)
        try {
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
                    onVisitaCerrada()
                    cerrarFlujo()
                } catch (err) {
                    if (errorCode(err) === 'VISITA_YA_CERRADA') {
                        // Tratar como éxito: la visita está cerrada, que es lo que se quería.
                        limpiarInicioVisita(visitaId)
                        onVisitaCerrada()
                        cerrarFlujo()
                        return
                    }
                    onAviso?.('error', 'No se pudo cerrar la visita. Volvé a intentar.')
                }
            })
        } finally {
            setCerrandoFlujo(false)
        }
    }

    // Cierra (o minimiza) el SHEET, no la visita: si `cliente` es el de la visita en curso,
    // `visitaEnCurso` la sigue sosteniendo en el padre y la barra flotante aparece sola.
    function cerrarFlujo() {
        setPropuestaPendiente(null)
        setErrorIniciar(null)
        onClose()
    }

    const nombre = cliente.nombreFantasia || cliente.nombreCliente
    const direccionTexto = cliente.direccion || cliente.barrio
    const nombreOtraVisita = bloqueadoPorOtraVisita
        ? visitaEnCurso!.cliente.nombreFantasia || visitaEnCurso!.cliente.nombreCliente
        : null
    const mensajeBloqueo = nombreOtraVisita
        ? `Ya tenés una visita en curso con ${nombreOtraVisita}. Cerrala antes de iniciar otra.`
        : null

    return (
        <>
            <PropuestaSheet
                open={!mostrarRubros && propuestaPendiente === null}
                codigoCliente={cliente.codigoParticularCliente}
                nombreCliente={nombre}
                iniciando={iniciandoFlujo}
                deshabilitado={bloqueadoPorOtraVisita}
                error={errorIniciar ?? mensajeBloqueo}
                onIniciarVisita={onConfirmarPropuesta}
                onClose={cerrarFlujo}
            />
            {visitaId !== null && (
                <VisitaSheet
                    open={mostrarRubros}
                    visitaId={visitaId}
                    nombreCliente={nombre}
                    visitaCerrada={cliente.estado === 'visitada'}
                    enCurso={enCurso}
                    codigoParticularCliente={cliente.codigoParticularCliente}
                    onMinimize={cerrarFlujo}
                    cerrando={cerrandoFlujo}
                    onCerrarVisita={onCerrarVisita}
                    onClose={cerrarFlujo}
                />
            )}
            {tieneCoords && (
                <IniciarVisitaMapa
                    open={propuestaPendiente !== null}
                    nombreCliente={nombre}
                    direccion={direccionTexto}
                    latitud={cliente.latitud as number}
                    longitud={cliente.longitud as number}
                    iniciando={iniciandoFlujo}
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
