import { useEffect, useState } from 'react'
import { Loader2, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import PropuestaSheet, { toPropuestaDTO } from './PropuestaSheet'
import VisitaSheet from './VisitaSheet'
import MapaVisita from './MapaVisita'
import { useCerrarVisita, useIniciarVisita } from '@/hooks/useVisitas'
import { usePropuesta } from '@/hooks/usePropuesta'
import { capturarUbicacion, formatearCoord, type GeoResult } from '@/lib/geolocation'
import { distanciaMetros, estaFueraDeRango } from '@/lib/distancia'
import { errorCode } from '@/lib/apiError'
import { limpiarInicioVisita, marcarInicioVisita } from '@/lib/visitaTimer'
import { guardarVisitaEnCurso, limpiarVisitaEnCurso } from '@/lib/visitaEnCurso'
import { useAlejadoDelCliente } from '@/hooks/useAlejadoDelCliente'
import type { NotificacionTipo } from '@/components/ui/Notification'
import type { AppExterna } from '@/lib/appsExternas'
import type { IAgendaClient, IPropuestaRubroDTO, IVisitClientCard } from '@/types/planificacion'

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
    /** true = el vendedor tocó "Iniciar visita" directo desde la card: se salta la
     *  propuesta y va derecho al mapa (o arranca sin más si el cliente no tiene
     *  coordenadas), igual que si hubiera confirmado la propuesta a mano. */
    directoAMapa?: boolean
    onVisitaIniciada: (cliente: IAgendaClient, visitaId: number) => void
    onVisitaCerrada: () => void
    onClose: () => void
    onGeoBloqueada: (motivo: Exclude<GeoResult, { ok: true }>['motivo']) => void
    onAviso?: (tipo: NotificacionTipo, mensaje: string) => void
    /** Si se pasa, los sheets del cliente ofrecen las apps externas. */
    onAbrirAppExterna?: (app: AppExterna, cliente: IVisitClientCard) => void
    /** true mientras el vendedor está lejos del cliente de `visitaEnCurso`, con la visita
     *  todavía abierta — ver docs/superpowers/specs/2026-09-08-aviso-alejado-del-cliente-design.md.
     *  VisitaFlow calcula el estado (nunca se desmonta mientras haya visita en curso, a
     *  diferencia de VisitaSheet, que se minimiza); quien lo renderiza es el padre, en
     *  VisitaEnCursoBar. */
    onAlejadoChange?: (alejado: boolean) => void
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
    directoAMapa,
    onVisitaIniciada,
    onVisitaCerrada,
    onClose,
    onGeoBloqueada,
    onAviso,
    onAbrirAppExterna,
    onAlejadoChange,
}: VisitaFlowProps) {
    const iniciar = useIniciarVisita()
    const cerrar = useCerrarVisita()

    // Coordenadas del cliente de LA VISITA EN CURSO, no del `cliente` que esté abierto en
    // pantalla — el vendedor puede estar mirando la propuesta de otro cliente mientras la
    // visita sigue corriendo en otro lado.
    const { alejado, evaluarFix } = useAlejadoDelCliente({
        activo: visitaEnCurso !== null,
        latitud: visitaEnCurso?.cliente.latitud,
        longitud: visitaEnCurso?.cliente.longitud,
    })
    useEffect(() => {
        onAlejadoChange?.(alejado)
    }, [alejado, onAlejadoChange])
    // Toast al CRUZAR a alejado, una sola vez por cruce: `alejado` solo cambia de valor en
    // el cruce (ver useAlejadoDelCliente), así que este efecto ya corre una vez por cruce
    // sin necesidad de un ref propio.
    useEffect(() => {
        if (!alejado || !visitaEnCurso) return
        const nombreVisita =
            visitaEnCurso.cliente.nombreFantasia || visitaEnCurso.cliente.nombreCliente
        onAviso?.('info', `Te alejaste de ${nombreVisita} y la visita sigue abierta.`)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [alejado])

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
    // Ajuste efímero del pin del cliente (MapaVisita.onReposicionar). Solo
    // importa para ESTE intento de iniciar: viaja como coordCliente y se usa en la
    // segunda verificación de distancia de acá abajo. Nunca se guarda en ningún otro
    // lado — ver docs/superpowers/specs/2026-09-07-reposicionar-cliente-al-iniciar-visita-design.md.
    const [clienteOverride, setClienteOverride] = useState<{ lat: number; lng: number } | null>(
        null,
    )
    // Mapa de consulta abierto (botón "Ver mi posición" del sheet). Nada que ver con
    // `propuestaPendiente`, que es el mapa del flujo de iniciar.
    const [verPosicion, setVerPosicion] = useState(false)

    // Sin esto, pasar de un cliente a otro sin cerrar el flujo (p.ej. tocar directo la card
    // de otro cliente) arrastraría el mapa pendiente o el error del cliente anterior.
    useEffect(() => {
        setPropuestaPendiente(null)
        setErrorIniciar(null)
        setClienteOverride(null)
    }, [cliente?.rotacionClienteId])

    // Solo el cliente de la visita en curso entra por acá. Cualquier otro cliente que el
    // vendedor mire mientras tanto queda en modo consulta: el backend igual rechazaría un
    // segundo POST /visitas con VISITA_ACTIVA_EXISTENTE (no se puede estar en dos lugares
    // a la vez), así que el bloqueo se muestra acá antes de gastar un viaje al servidor.
    const esClienteEnCurso =
        visitaEnCurso !== null && cliente !== null && visitaEnCurso.cliente.rotacionClienteId === cliente.rotacionClienteId
    const bloqueadoPorOtraVisita = visitaEnCurso !== null && !esClienteEnCurso

    // Un cliente con visita ya abierta (o cerrada con ofrecimientos pendientes) entra
    // derecho a los rubros: la propuesta pre-visita ya no aplica, manda el snapshot.
    // `visitaEnCurso` es la fuente de verdad para ESTE cliente mientras la agenda no
    // refrescó todavía (recién se inició en esta sesión); si no aplica, se usa el
    // snapshot que ya trae `cliente` del servidor.
    const visitaId = esClienteEnCurso ? visitaEnCurso!.visitaId : (cliente?.visitaId ?? null)
    const enRubros = visitaId !== null && cliente?.estado !== 'pendiente'
    const mostrarRubros = esClienteEnCurso || enRubros
    const enCurso = cliente?.estado === 'en_curso' || esClienteEnCurso
    const tieneCoords = cliente?.latitud != null && cliente?.longitud != null

    // "Iniciar visita" tocado directo desde la card: se salta la propuesta y va derecho
    // al mapa. Solo aplica con coordenadas (si no las hay, no hay mapa que mostrar, así
    // que cae al flujo normal de la propuesta). La propuesta igual hace falta pedirla acá
    // (el backend la exige para congelarla), solo que ya no se muestra en pantalla.
    const cargandoDirecto =
        !!directoAMapa && tieneCoords && !mostrarRubros && propuestaPendiente === null && !bloqueadoPorOtraVisita
    // `isError` es imprescindible, no un extra: el loader de abajo tapa toda la pantalla y
    // no tiene cómo cerrarse, así que mirando solo `data` (que ante un fallo queda
    // undefined para siempre) la app quedaba trabada en el spinner hasta reiniciarla.
    const {
        data: propuestaDirecta,
        isError: fallóPropuestaDirecta,
        refetch: reintentarPropuestaDirecta,
    } = usePropuesta(cargandoDirecto ? (cliente?.codigoParticularCliente ?? null) : null)
    useEffect(() => {
        if (!cargandoDirecto || !propuestaDirecta) return
        setPropuestaPendiente(propuestaDirecta.rubros.map(toPropuestaDTO))
    }, [cargandoDirecto, propuestaDirecta])

    if (!cliente) return null

    async function conUbicacion(accion: (geo: Extract<GeoResult, { ok: true }>) => Promise<void>) {
        const geo = await capturarUbicacion()
        if (!geo.ok) {
            onGeoBloqueada(geo.motivo)
            return
        }
        await accion(geo)
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
            await conUbicacion(async geo => {
                // Segunda verificación, con la coordenada DEFINITIVA (la que se persiste). El
                // mapa ya deshabilita el botón con el fix en vivo, pero eso solo evita el caso
                // honesto — sin este chequeo alcanzaría con tocar "Iniciar visita" en el
                // instante en que el watch marcó cerca para saltear el gate.
                if (tieneCoords) {
                    const [lat, lon] = geo.coord.split(',').map(Number)
                    const clienteLat = clienteOverride?.lat ?? (cliente!.latitud as number)
                    const clienteLng = clienteOverride?.lng ?? (cliente!.longitud as number)
                    const distanciaM = distanciaMetros(lat, lon, clienteLat, clienteLng)
                    if (estaFueraDeRango(distanciaM, geo.precisionM)) {
                        setErrorIniciar('Estás lejos del cliente. Acercate para iniciar la visita.')
                        return
                    }
                }
                try {
                    const { visitaId: id, correccionPermanenteAplicada } = await iniciar.mutateAsync({
                        rotacionClienteId: cliente!.rotacionClienteId,
                        coordInicio: geo.coord,
                        coordCliente: clienteOverride
                            ? `${formatearCoord(clienteOverride.lat)},${formatearCoord(clienteOverride.lng)}`
                            : undefined,
                        propuesta,
                    })
                    setPropuestaPendiente(null)
                    // Si se reposicionó, el ancla que queda guardada para el resto de la
                    // visita (el aviso de "te alejaste", y lo que sobrevive un reload) tiene
                    // que ser la posición NUEVA, no la del warehouse: el gate de arriba ya
                    // dejó iniciar contra el override, así que agarrar acá la coordenada
                    // vieja avisaría "te alejaste" estando parado justo donde se reposicionó.
                    const clienteParaVisita = clienteOverride
                        ? { ...cliente!, latitud: clienteOverride.lat, longitud: clienteOverride.lng }
                        : cliente!
                    onVisitaIniciada(clienteParaVisita, id)
                    marcarInicioVisita(id)
                    guardarVisitaEnCurso({ cliente: clienteParaVisita, visitaId: id })
                    onAviso?.('exito', 'Visita iniciada')
                    // El gate ya se destrabó (efímero, arriba); esto es aparte: si
                    // client-service ya tenía 3 correcciones permanentes de este
                    // cliente, el backend no volvió a tocarlo — el vendedor sigue
                    // pudiendo operar, pero alguien tiene que corregirlo por otro
                    // medio.
                    if (clienteOverride && correccionPermanenteAplicada === false) {
                        onAviso?.(
                            'info',
                            'Esta corrección ya no se guarda de forma permanente (límite alcanzado).',
                        )
                    }
                    setClienteOverride(null)
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
        // Común a "cerró bien" y a "ya estaba cerrada" (tratado como éxito, ver abajo): las
        // dos anclas locales de la visita se limpian igual, sea cual sea el motivo por el
        // que se da por cerrada. Un solo lugar para esto evita que una tercera clave que se
        // sume el día de mañana quede escrita en un call site y olvidada en el otro — que es
        // justo la familia de bugs que este mismo archivo tuvo que corregir después de
        // escrito (ver los fix posteriores al spec de "te alejaste del cliente").
        function limpiarAnclasDeLaVisita() {
            limpiarInicioVisita(visitaId!)
            limpiarVisitaEnCurso()
        }
        setCerrandoFlujo(true)
        try {
            await conUbicacion(async geo => {
                try {
                    const res = await cerrar.mutateAsync({ visitaId, coordFinal: geo.coord })
                    if (res.ofrecimientosPendientes > 0) {
                        // Resultado normal, no un error: el gate pide un mínimo de 2 rubros,
                        // así que cerrar con pendientes es esperable. Pero el aviso NO invita
                        // a cargarlos después — el sheet de una visita cerrada es read-only
                        // (`visitaCerrada` en VisitaSheet), así que esos rubros ya no se
                        // pueden completar. Decir "te quedan por cargar" mandaba al vendedor
                        // a buscar una pantalla que no existe.
                        onAviso?.(
                            'info',
                            `Visita cerrada. Quedaron ${res.ofrecimientosPendientes} rubros sin cargar.`,
                        )
                    } else {
                        onAviso?.('exito', 'Visita cerrada')
                    }
                    limpiarAnclasDeLaVisita()
                    onVisitaCerrada()
                    cerrarFlujo()
                } catch (err) {
                    if (errorCode(err) === 'VISITA_YA_CERRADA') {
                        // Tratar como éxito: la visita está cerrada, que es lo que se quería.
                        limpiarAnclasDeLaVisita()
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
        setVerPosicion(false)
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
                open={!mostrarRubros && propuestaPendiente === null && !cargandoDirecto}
                codigoCliente={cliente.codigoParticularCliente}
                nombreCliente={nombre}
                iniciando={iniciandoFlujo}
                deshabilitado={bloqueadoPorOtraVisita}
                error={errorIniciar ?? mensajeBloqueo}
                cliente={cliente}
                onAbrirAppExterna={onAbrirAppExterna}
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
                    cliente={cliente}
                    onAbrirAppExterna={onAbrirAppExterna}
                    onMinimize={cerrarFlujo}
                    cerrando={cerrandoFlujo}
                    onCerrarVisita={onCerrarVisita}
                    onClose={cerrarFlujo}
                    alejado={alejado && esClienteEnCurso}
                    onVerPosicion={() => setVerPosicion(true)}
                />
            )}
            {tieneCoords && (
                <MapaVisita
                    open={propuestaPendiente !== null}
                    nombreCliente={nombre}
                    direccion={direccionTexto}
                    latitud={cliente.latitud as number}
                    longitud={cliente.longitud as number}
                    iniciando={iniciandoFlujo}
                    error={errorIniciar}
                    onIniciar={onConfirmarEnMapa}
                    onReposicionar={setClienteOverride}
                    onCancel={() => {
                        setErrorIniciar(null)
                        setClienteOverride(null)
                        // En modo directo se salteó la propuesta a propósito, así que atrás
                        // del mapa no hay nada: cancelar es volver a la agenda. Además es lo
                        // único que corta el ciclo — limpiar solo `propuestaPendiente` vuelve
                        // a habilitar `cargandoDirecto`, y el efecto de más arriba reabre el
                        // mapa al instante con la propuesta que quedó en cache (así el mapa
                        // se volvía imposible de cerrar).
                        if (directoAMapa) {
                            cerrarFlujo()
                            return
                        }
                        setPropuestaPendiente(null)
                    }}
                />
            )}
            {verPosicion &&
                visitaEnCurso?.cliente.latitud != null &&
                visitaEnCurso.cliente.longitud != null && (
                    <MapaVisita
                        open
                        modo="consulta"
                        nombreCliente={
                            visitaEnCurso.cliente.nombreFantasia ||
                            visitaEnCurso.cliente.nombreCliente
                        }
                        direccion={visitaEnCurso.cliente.direccion || visitaEnCurso.cliente.barrio}
                        latitud={visitaEnCurso.cliente.latitud}
                        longitud={visitaEnCurso.cliente.longitud}
                        onFix={evaluarFix}
                        onCancel={() => setVerPosicion(false)}
                    />
                )}
            {cargandoDirecto &&
                !propuestaDirecta &&
                (fallóPropuestaDirecta ? (
                    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white px-8 text-center">
                        <WifiOff className="h-8 w-8 text-dsmuted" strokeWidth={2} />
                        <p className="text-[14px] font-semibold leading-snug text-[#182645]">
                            No pudimos traer la propuesta de {nombre}.
                        </p>
                        <p className="-mt-2 text-[12.5px] leading-snug text-dsmuted">
                            Fijate que tengas señal y volvé a intentar.
                        </p>
                        <Button
                            onClick={() => reintentarPropuestaDirecta()}
                            className="h-11 w-full max-w-[240px] bg-dsgreen text-[13.5px] hover:bg-dsgreen/90"
                        >
                            Volver a intentar
                        </Button>
                        <button
                            type="button"
                            onClick={cerrarFlujo}
                            className="text-[13px] font-semibold text-dsmuted underline"
                        >
                            Volver a la agenda
                        </button>
                    </div>
                ) : (
                    <div
                        data-testid="cargando-propuesta"
                        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white"
                    >
                        <Loader2 className="h-7 w-7 animate-spin text-dsnavy" strokeWidth={2.4} />
                        <p className="text-[12.5px] font-semibold text-dsmuted">
                            Buscando la propuesta…
                        </p>
                    </div>
                ))}
        </>
    )
}
