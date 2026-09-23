import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import AppHeader from '@/components/AppHeader'
import DiaTabs from '@/components/DiaTabs'
import AgendaBoard from '@/components/AgendaBoard'
import VisitaFlow, { type IVisitaEnCurso } from '@/components/VisitaFlow'
import VisitaEnCursoBar from '@/components/VisitaEnCursoBar'
import ResolucionSheet from '@/components/ResolucionSheet'
import EstadoVisitaSheet from '@/components/EstadoVisitaSheet'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AppExternaSheet from '@/components/AppExternaSheet'
import ClienteNuevoSheet, { type ModoClienteNuevo } from '@/components/ClienteNuevoSheet'
import { BuscadorDiaSheet } from '@/components/buscador/BuscadorDiaSheet'
import { BuscadorGeneralPanel } from '@/components/buscador/BuscadorGeneralPanel'
import BannerPrueba, { ALTO_BANNER_PRUEBA } from '@/components/prueba/BannerPrueba'
import CarteraDialog from '@/components/prueba/CarteraDialog'
import { estaProbando } from '@/lib/roles'
import { useAgendaSemana } from '@/hooks/useAgenda'
import { useCicloActual, usePreviewSemana, useSincronizar, useReacomodar } from '@/hooks/useCiclo'
import { useEliminarFila } from '@/hooks/useEliminarFila'
import { useMotivos } from '@/hooks/useMotivos'
import { useNoVisita, useNoVisitaSobreVisitaAbierta, useReintentarSeguimiento } from '@/hooks/useVisitas'
import { useNotificacion } from '@/hooks/useNotificacion'
import { useAppExterna } from '@/hooks/useAppExterna'
import { abrirAppExternaEnPestana } from '@/lib/appsExternas'
import { Notification } from '@/components/ui/Notification'
import { estaResuelto } from '@/lib/estadoCiclo'
import { errorCode } from '@/lib/apiError'
import { titleCaseNombre } from '@/lib/textFormat'
import { getWeekRangeLabel, getDiaDeHoy } from '@/lib/weekDates'
import { leerVisitaEnCurso, limpiarVisitaEnCurso } from '@/lib/visitaEnCurso'
import { limpiarInicioVisita } from '@/lib/visitaTimer'
import { ALTAS_HABILITADAS } from '@/lib/flags'
import type { Dia, IAgendaClient, SemanaAgenda } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

/** Para los avisos: el vendedor lee "movido al jueves", no "movido a JUE". */
const NOMBRE_DIA: Record<Dia, string> = {
    LUN: 'lunes',
    MAR: 'martes',
    MIE: 'miércoles',
    JUE: 'jueves',
    VIE: 'viernes',
}

/** El 409 de la API traducido a algo que el vendedor pueda leer parado en la calle. */
function mensajeDeEliminar(err: unknown): string {
    switch (errorCode(err)) {
        case 'FILA_RESUELTA':
            return 'Este cliente ya se resolvió, así que no se puede sacar.'
        case 'VISITA_EN_CURSO':
            return 'Tenés la visita abierta: cerrala antes de sacarlo.'
        case 'FILA_PLANIFICADA':
            return 'Este cliente es parte de tu recorrido: para sacarlo hablá con tu supervisor.'
        default:
            return 'No se pudo sacar de tu agenda. Volvé a intentar.'
    }
}

const MENSAJE_GEO = {
    denegado:
        'Necesitamos tu ubicación para registrar la visita. Activá el permiso de ubicación y volvé a intentar.',
    sin_senal:
        'No pudimos tomar tu ubicación. Salí a un lugar con señal y volvé a intentar.',
    no_soportado:
        'Este dispositivo no puede tomar la ubicación. Avisá a sistemas.',
} as const

/**
 * Problema de configuración de la cuenta, no algo que el vendedor pueda resolver
 * reintentando: su usuario no tiene un código de vendedor resoluble. resolveSellerCode()
 * lo usan ciclo/actual, sincronizar y todas las acciones (no es exclusivo del viejo
 * abrirCiclo) — sin este chequeo, la página se queda en "Cargando…" para siempre.
 */
function mensajeDeCuenta(code: string | null): string | null {
    if (code === 'SELLER_CODE_UNRESOLVED')
        return 'Tu usuario no tiene un código de vendedor asignado. Avisá a sistemas.'
    if (code === 'SELLER_CODE_AMBIGUOUS')
        return 'Tu usuario tiene más de un código de vendedor. Avisá a sistemas.'
    return null
}

export default function AgendaSemanaPage() {
    const { user, logout, capacidades, vendedorDePrueba } = useAuth()
    const probando = estaProbando(capacidades)
    const [eligiendoCartera, setEligiendoCartera] = useState(false)
    const { data: cicloActual, error: cicloActualError, isSuccess: cicloResuelto } =
        useCicloActual()
    const mensajeCuenta = mensajeDeCuenta(errorCode(cicloActualError))
    const ciclo = cicloActual?.ciclo ?? null
    const semanas = cicloActual?.semanas
    const semanasPendientes = cicloActual?.semanasPendientes
    const sincronizar = useSincronizar()
    const reacomodar = useReacomodar()
    const noVisita = useNoVisita()
    const noVisitaAbierta = useNoVisitaSobreVisitaAbierta()
    const eliminarFila = useEliminarFila()
    const reintentarSeguimiento = useReintentarSeguimiento()
    const { data: motivosVisita = [] } = useMotivos('visita')
    const { notificacion, mostrar, ocultar } = useNotificacion()
    const { desmontar: desmontarAppExterna, ...appExterna } = useAppExterna()

    // La posición que el vendedor está mirando (semana + día) vive en la URL, no en
    // useState: al recargar la página — o cuando la PWA se resume desde cero — un useState
    // volvía a LUN de la vuelta abierta y le hacía perder dónde estaba.
    //
    // Deliberadamente NO se escribe la URL al montar: `/` queda limpio, así abrir la app
    // de cero siempre significa "hoy" y un bookmark no congela un día viejo. Y la semana
    // sigue siendo `null` por defecto, cayendo a `ciclo.semana` — el backend sigue siendo
    // la autoridad sobre cuál es la vuelta abierta (ver "Decisiones no obvias" en
    // CLAUDE.md: no hay ancla local que pueda desincronizarse en silencio).
    const [searchParams, setSearchParams] = useSearchParams()

    // `replace` y no `push`: AgendaBoard emite onActivoChange en CADA evento de scroll al
    // swipear entre columnas, así que apilar historial llenaría el back stack con decenas
    // de entradas tras unos pocos swipes.
    function actualizarPosicion(cambios: { dia?: Dia; semana?: number | null }) {
        setSearchParams(
            prev => {
                const next = new URLSearchParams(prev)
                if (cambios.dia !== undefined) next.set('dia', cambios.dia)
                if (cambios.semana !== undefined) {
                    if (cambios.semana === null) next.delete('semana')
                    else next.set('semana', String(cambios.semana))
                }
                return next
            },
            { replace: true },
        )
    }

    // Se llama UNA vez al montar y cada vez que la PWA vuelve a primer plano — nunca por
    // acción del usuario. Cierra la semana vencida (si la hay) y sincroniza el padrón; nunca
    // abre nada, así que no hace falta esperarla para pintar la página.
    useEffect(() => {
        function correr() {
            sincronizar.mutateAsync().then(res => {
                // Un solo `mostrar`: `useNotificacion` no tiene cola —una notificación nueva
                // reemplaza a la anterior— y los dos avisos salen en el mismo tick. El lunes
                // típico dispara los dos a la vez (semana cerrada + padrón movido), y el
                // segundo borraba el primero: el vendedor nunca se enteraba de que su semana
                // había cerrado con clientes sin visitar.
                // Sin lenguaje de cierre ("cerramos"/"cerrada"): el vendedor no ve que algo se
                // cerró (spec 2026-08-12, "El vendedor no ve ciclos ni rotaciones"). Y cuenta
                // VISITAS, no clientes — `sinVisitar` viene sin DISTINCT, así que un quincenal
                // con dos filas pendientes en la misma zona aparece dos veces a propósito: es
                // el denominador real, no un bug. El nombre de zona sale de la MISMA fuente que
                // el header (`RotacionSemanaRepository.findDescripciones`, vía
                // `descripcionSemanaCerrada`): sin esto el aviso decía "Zona 2" mientras el
                // header, dos taps después, ya decía "Zárate" para la misma zona.
                const avisos: string[] = []
                if (res.semanaCerrada !== null) {
                    const nombre = res.descripcionSemanaCerrada ?? `Zona ${res.semanaCerrada}`
                    avisos.push(
                        nombre +
                            (res.sinVisitar.length > 0
                                ? `: ${res.sinVisitar.length} visitas quedaron sin hacer`
                                : ''),
                    )
                }
                if (res.altas.length > 0 || res.bajas.length > 0) {
                    avisos.push(
                        `Tu ruta cambió: ${res.altas.length} clientes nuevos, ${res.bajas.length} de baja`,
                    )
                }
                if (avisos.length > 0) mostrar('info', `${avisos.join('. ')}.`)
            }).catch(() => {})
        }
        correr()
        function onVisible() {
            if (document.visibilityState === 'visible') correr()
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => document.removeEventListener('visibilitychange', onVisible)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Si la semana/día de la URL ganan, o si al abrir la app siempre se aterriza en lo
    // activo. Falso al montar SIEMPRE (es un `useRef`, no algo que la URL pueda pre-
    // sembrar): una semana/día que sobrevivió en la URL de un montaje anterior —
    // recargar, o la PWA resumida desde cero — no cuenta como navegación de ESTA sesión,
    // así que no gana hasta que el vendedor toque una flecha o un tab de día EN VIVO acá.
    //
    // Es lo que hace que, con una zona activa, abrir la app aterrice siempre ahí con el
    // día de hoy: antes de esto, corregir la URL con un efecto DESPUÉS del primer render
    // dejaba un flash real — la agenda alcanzaba a pedir el preview de la zona vieja por
    // la red antes de que el efecto la corrigiera.
    const navegoEnSesion = useRef(false)

    // La semana que se está MIRANDO. null hasta que se sepa cuál: con vuelta abierta es
    // la suya; sin vuelta, la primera pendiente/conocida del backend.
    const semanaParam = Number(searchParams.get('semana'))
    const semanaVista =
        navegoEnSesion.current &&
        Number.isInteger(semanaParam) &&
        (semanas ?? []).some(z => z.semana === semanaParam)
            ? semanaParam
            : null
    const setSemanaVista = (semana: number | null) => {
        navegoEnSesion.current = true
        actualizarPosicion({ semana })
    }

    // Con ciclo abierto, esa es la semana. Sin ciclo (standby, de pie casi todos los lunes),
    // arranca en la primera semana PENDIENTE si se conoce — es la que `asegurar` abriría de
    // todas formas ante la primera acción real — y si no, en la primera semana conocida.
    const semanaEfectiva =
        semanaVista ?? ciclo?.semana ?? semanasPendientes?.[0] ?? semanas?.[0]?.semana ?? null
    const operable = ciclo == null || semanaEfectiva === ciclo.semana

    // Se puede AGREGAR en cualquier zona que todavía falte hacer —la en curso incluida—,
    // y en ninguna de las ya cerradas. No es una restricción de permisos (el backend
    // acepta cualquier semana del set, y "Reagendar" ya movía filas a donde sea): es que
    // una fila agregada a una zona hecha no vuelve a aparecer nunca. Su ciclo ya cerró y
    // `proponerSemana` solo propone entre las pendientes, así que el vendedor programaría
    // una visita que el sistema no le muestra más. `semanasPendientes` son justamente las
    // que no tienen ciclo cerrado en esta rotación.
    const zonaPlanificable =
        semanaEfectiva !== null && (semanasPendientes ?? []).includes(semanaEfectiva)

    // El vendedor no ve "semana": ve la zona por su nombre ("Zárate"). `descripcion` puede
    // ser null (zona sin nombrar todavía) — ahí, y solo ahí, cae al número.
    const nombreZona = semanas?.find(z => z.semana === semanaEfectiva)?.descripcion || null

    const { data: agenda } = useAgendaSemana(operable && ciclo != null)
    const { data: preview } = usePreviewSemana(
        semanaEfectiva ?? undefined,
        semanaEfectiva !== null && !(operable && ciclo != null),
    )

    // Sin `?dia=` DE ESTA SESIÓN, arranca en HOY y no en LUN: un jueves, LUN obligaba a
    // swipear cuatro columnas para llegar a lo que el vendedor está recorriendo. El fin
    // de semana no hay "hoy" en la agenda (es lunes a viernes), así que ahí sí cae a LUN.
    const diaParam = searchParams.get('dia')
    const diaActivo: Dia =
        navegoEnSesion.current && DIAS.includes(diaParam as Dia)
            ? (diaParam as Dia)
            : (getDiaDeHoy() ?? 'LUN')
    const setDiaActivo = (dia: Dia) => {
        navegoEnSesion.current = true
        actualizarPosicion({ dia })
    }

    // Puramente cosmético: pisa la URL visible con lo que ya se está mostrando, para que
    // un bookmark tomado en este momento (o mirar la barra de direcciones) refleje la
    // realidad. No hace falta para que `semanaEfectiva`/`diaActivo` estén bien — eso ya
    // lo garantiza `navegoEnSesion` arriba, sin esperar a este efecto.
    // Se re-corrige por cada semana de ciclo distinta (incluyendo null→abierto): un
    // vendedor en standby que arranca una visita abre el ciclo a mitad de sesión, y esa
    // transición también tiene que pisar la URL — no solo la primera resolución.
    const cicloCorregido = useRef<number | null | undefined>(undefined)
    useEffect(() => {
        if (!cicloResuelto) return
        const semanaCiclo = ciclo?.semana ?? null
        if (cicloCorregido.current === semanaCiclo) return
        cicloCorregido.current = semanaCiclo
        if (ciclo) actualizarPosicion({ semana: semanaEfectiva ?? ciclo.semana, dia: diaActivo })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cicloResuelto, ciclo])
    const [visitaCliente, setVisitaCliente] = useState<IAgendaClient | null>(null)
    // true = se abrió el flujo tocando "Iniciar visita" en la card (no "Propuesta"): se
    // salta la propuesta y va derecho al mapa. Ver VisitaFlow.directoAMapa.
    const [directoAMapa, setDirectoAMapa] = useState(false)
    const [noVisitaCliente, setNoVisitaCliente] = useState<IAgendaClient | null>(null)
    const [estadoVisitaCliente, setEstadoVisitaCliente] = useState<IAgendaClient | null>(null)
    const [eliminarCliente, setEliminarCliente] = useState<IAgendaClient | null>(null)
    // El día destino del "+" que se tocó. null = sheet cerrado. Es el día del ENCABEZADO,
    // no `diaActivo`: el board scrollea entre columnas y los dos pueden diferir por un
    // instante mientras el swipe se asienta.
    const [diaAAgregar, setDiaAAgregar] = useState<Dia | null>(null)
    // "Cliente nuevo": null = sheet cerrado. Comparte el mismo sheet para crear (desde el
    // "+" del día), editar (desde la card de una fila `es_alta`) y reintentar (después de
    // "No visité" sobre una fila `es_alta`) — el modo lo decide quien lo abre.
    const [clienteNuevo, setClienteNuevo] = useState<ModoClienteNuevo | null>(null)
    // Búsqueda general: null = no se está buscando. El texto vive acá y no adentro del
    // header porque el panel de resultados es hermano del header, no hijo.
    const [textoBusqueda, setTextoBusqueda] = useState<string | null>(null)
    // La visita en curso del vendedor, independiente de qué card esté mirando ahora
    // (`visitaCliente`). Antes vivía adentro de VisitaFlow atada al cliente abierto: tocar
    // la propuesta de OTRO cliente y cerrarla la perdía, y la barra flotante desaparecía.
    // Arranca desde localStorage, no en null: sin esto, recargar la app sin señal deja a
    // `agenda` en falla y la barra flotante desaparece aunque la visita siga abierta en el
    // servidor — ver docs/superpowers/specs/2026-09-08-aviso-alejado-del-cliente-design.md,
    // sección 0. El efecto de acá abajo reconcilia contra el servidor apenas la agenda llega.
    const [visitaEnCurso, setVisitaEnCurso] = useState<IVisitaEnCurso | null>(() => leerVisitaEnCurso())
    // rotacionClienteId de TODAS las visitas que se soltaron (resueltas según el servidor,
    // o cerradas explícitamente por el vendedor) en esta sesión — vetadas de re-adopción,
    // no la app entera. Sin esto: cerrar una visita invalida la agenda (useVisitas.ts,
    // onSuccess), y si un refetch que ya estaba en vuelo ANTES del cierre resuelve DESPUÉS
    // (con el cliente todavía 'en_curso' en esa foto vieja), la rama de adopción de más
    // abajo la revivía — "te alejaste" volvía a mostrarse con la visita ya cerrada. Es un
    // Set y no un solo id: un ref simple pierde el veto del primer cliente si se cierra un
    // SEGUNDO antes de que el refetch viejo del primero llegue a resolver — el mismo bug,
    // con dos visitas en vuelo en vez de una. Es por id específico y no un "ya adopté una
    // vez, no más" global: cada id vetado nunca puede volver a estar genuinamente en_curso
    // en esta rotación (una fila resuelta no se reabre, ver docs/dominio/modelo.md), así que
    // vetarlo es seguro — pero otro cliente que arranque una visita nueva sí tiene que poder
    // adoptarse igual si gana la misma carrera (ver el test de arriba).
    const rotacionesClienteSueltas = useRef<Set<number>>(new Set())
    // El vendedor está lejos del cliente de `visitaEnCurso`, con la visita todavía abierta.
    // VisitaFlow es quien lo calcula (no se desmonta mientras haya visita en curso); acá
    // solo se sostiene para pintar VisitaEnCursoBar.
    const [alejado, setAlejado] = useState(false)

    // La instancia embebida es del cliente que se estaba mirando. Al cambiar de día — o de
    // semana, que es el mismo tipo de cambio de contexto: el cliente deja de estar en
    // pantalla — ese contexto ya no aplica: se suelta la memoria en vez de quedar una app
    // React ajena viva.
    useEffect(() => {
        desmontarAppExterna()
    }, [diaActivo, semanaEfectiva, desmontarAppExterna])

    // Mantiene `visitaEnCurso` sincronizada con el servidor:
    // - Si no hay puntero local (recién se abrió la app) pero la agenda ya trae un cliente
    //   en curso, lo adopta para que la barra flotante aparezca tras un reload.
    // - Si el cliente que teníamos como en curso ya no lo está en el servidor (se cerró
    //   desde otro dispositivo/pestaña), suelta el puntero.
    useEffect(() => {
        if (!agenda) return
        if (visitaEnCurso) {
            const actual = DIAS.flatMap(d => agenda[d] ?? []).find(
                c => c.rotacionClienteId === visitaEnCurso.cliente.rotacionClienteId,
            )
            // 'pendiente' es el hueco entre iniciar y que el refetch de la agenda catchee:
            // no se toca acá. Cualquier otro estado que no sea 'en_curso' significa que la
            // visita ya se resolvió por otro lado — y que NO aparezca en absoluto (`actual`
            // undefined) cuenta igual: pasa si otro vendedor se loguea en el mismo
            // dispositivo, con clientes completamente distintos. Sin este caso, la barra
            // quedaba fantasma para siempre — tocarla abría la propuesta de un cliente que
            // ni siquiera está en los datos de quien está logueado ahora.
            if (!actual || (actual.estado !== 'en_curso' && actual.estado !== 'pendiente')) {
                rotacionesClienteSueltas.current.add(visitaEnCurso.cliente.rotacionClienteId)
                setVisitaEnCurso(null)
                limpiarVisitaEnCurso()
            }
            return
        }
        const enCurso = DIAS.flatMap(d => agenda[d] ?? []).find(c => c.estado === 'en_curso')
        if (
            enCurso &&
            enCurso.visitaId !== null &&
            !rotacionesClienteSueltas.current.has(enCurso.rotacionClienteId)
        ) {
            // El servidor confirma "en_curso" pero su card sale del snapshot del warehouse —
            // no sabe nada de un reposicionamiento del pin al iniciar (esa corrección es
            // asíncrona del lado de client-service). Si iniciarVisita ya escribió el ancla
            // correcta acá — pasa siempre, es síncrono — y ESTE efecto corre antes de que
            // React llegue a procesar el setVisitaEnCurso de onVisitaIniciada (invalidateQueries
            // del onSuccess de la mutación puede ganarle esa carrera, ver
            // docs/superpowers/specs/2026-09-08-aviso-alejado-del-cliente-design.md), adoptar
            // el snapshot del servidor sin más pisaría la posición reposicionada con la vieja.
            const persistido = leerVisitaEnCurso()
            const clienteAAdoptar =
                persistido && persistido.cliente.rotacionClienteId === enCurso.rotacionClienteId
                    ? persistido.cliente
                    : enCurso
            setVisitaEnCurso({ cliente: clienteAAdoptar, visitaId: enCurso.visitaId })
        }
    }, [agenda, visitaEnCurso])

    // "Reiniciar" (modo prueba) borra las visitas en el backend y el storage local
    // (useReiniciarPrueba), pero `visitaEnCurso` vive en memoria, y el efecto de arriba no
    // la suelta: tras el reinicio la rotación queda sin ciclo y la agenda ni se pide. Lo que
    // cambia seguro es `vendedorDePrueba` (refrescarMe devuelve un objeto nuevo): si para
    // entonces el ancla local ya no está, la visita en memoria es fantasma.
    useEffect(() => {
        if (leerVisitaEnCurso() === null) setVisitaEnCurso(null)
    }, [vendedorDePrueba])

    // Barra flotante visible siempre que haya una visita en curso Y el sheet abierto ahora
    // no sea justo el de esa visita (incluye "sheet cerrado del todo").
    const viendoVisitaEnCurso =
        visitaEnCurso !== null &&
        visitaCliente !== null &&
        visitaCliente.rotacionClienteId === visitaEnCurso.cliente.rotacionClienteId

    // Con ciclo abierto y coincidente, la fuente es la agenda real. Cualquier otra
    // semana —incluido el standby, que también usa esta rama— sale del preview: trae el
    // mismo estado real (visitada/no_visita/pendiente/en_curso), sea esa semana la que
    // sea, incluso una ya cerrada — no hace falta ningún relleno acá.
    const semana: SemanaAgenda | undefined =
        operable && ciclo != null ? agenda : preview?.dias

    const counts = useMemo(() => {
        const c = {} as Record<Dia, { done: number; total: number }>
        for (const d of DIAS) {
            const clientes = semana?.[d] ?? []
            c[d] = { done: clientes.filter(x => estaResuelto(x.estado)).length, total: clientes.length }
        }
        return c
    }, [semana])

    const totalClientes = DIAS.reduce((n, d) => n + (semana?.[d]?.length ?? 0), 0)
    const totalDone = DIAS.reduce((n, d) => n + counts[d].done, 0)

    function moverSemana(delta: number) {
        if (!semanas || semanas.length === 0) return
        const base = semanaEfectiva ?? semanas[0].semana
        const idx = semanas.findIndex(z => z.semana === base)
        const nextIdx = ((idx === -1 ? 0 : idx) + delta + semanas.length) % semanas.length
        setSemanaVista(semanas[nextIdx].semana)
    }

    async function onReagendar(semanaDestino: number, dia: Dia) {
        const cliente = estadoVisitaCliente
        setEstadoVisitaCliente(null)
        if (!cliente) return
        try {
            await reacomodar.mutateAsync({
                rotacionClienteId: cliente.rotacionClienteId,
                semana: semanaDestino,
                dia: DIAS.indexOf(dia) + 1,
            })
            // Reacomodar mueve semana/día y deja al cliente PENDIENTE: no lo resuelve.
            mostrar(
                'exito',
                semanaDestino === semanaEfectiva
                    ? 'Cliente reagendado'
                    : `Cliente movido a la semana ${semanaDestino}`,
            )
        } catch {
            mostrar('error', 'No se pudo reagendar. Volvé a intentar.')
        }
    }

    function abrirPropuesta(cliente: IAgendaClient) {
        setDirectoAMapa(false)
        setVisitaCliente(cliente)
    }

    function iniciarDirecto(cliente: IAgendaClient) {
        setDirectoAMapa(true)
        setVisitaCliente(cliente)
    }

    function onElegirNoVisita() {
        const cliente = estadoVisitaCliente
        setEstadoVisitaCliente(null)
        setNoVisitaCliente(cliente)
    }

    function onElegirEliminar() {
        const cliente = estadoVisitaCliente
        setEstadoVisitaCliente(null)
        setEliminarCliente(cliente)
    }

    async function onConfirmEliminar() {
        const cliente = eliminarCliente
        if (!cliente) return
        try {
            await eliminarFila.mutateAsync(cliente.rotacionClienteId)
            mostrar('exito', 'Lo sacamos de tu agenda')
        } catch (err) {
            mostrar('error', mensajeDeEliminar(err))
        }
    }

    // El visitaId no puede salir sólo del snapshot de la agenda: si la visita se inició en
    // esta sesión, la card todavía puede decir `pendiente`. `visitaEnCurso` es la fuente
    // de verdad para ese caso (mismo criterio que VisitaFlow). Devuelve null cuando no hay
    // visita abierta que convertir — ahí "No visité" registra un hecho nuevo, no cierra
    // nada.
    function visitaAbiertaDe(cliente: IAgendaClient): number | null {
        if (visitaEnCurso?.cliente.rotacionClienteId === cliente.rotacionClienteId) {
            return visitaEnCurso.visitaId
        }
        return cliente.estado === 'en_curso' ? cliente.visitaId : null
    }

    async function onConfirmNoVisita(motivoIds: number[]) {
        const cliente = noVisitaCliente
        setNoVisitaCliente(null)
        if (!cliente) return
        // La visita abierta NO se puede registrar con el endpoint de siempre: la fila ya
        // tiene resolución y el backend rebota con VISITA_ACTIVA_EXISTENTE — que es lo que
        // hasta ahora le mostraba al vendedor un "No se pudo registrar" genérico.
        const enCurso = visitaAbiertaDe(cliente)
        try {
            if (enCurso !== null) {
                await noVisitaAbierta.mutateAsync({ visitaId: enCurso, motivoIds })
                limpiarInicioVisita(enCurso)
                limpiarVisitaEnCurso()
                if (visitaEnCurso) {
                    rotacionesClienteSueltas.current.add(visitaEnCurso.cliente.rotacionClienteId)
                    setVisitaEnCurso(null)
                }
            } else {
                await noVisita.mutateAsync({
                    rotacionClienteId: cliente.rotacionClienteId,
                    motivoIds,
                })
            }
            mostrar('exito', 'Registrado')
        } catch (err) {
            const code = errorCode(err)
            const yaResuelto = code === 'CICLO_CLIENTE_YA_RESUELTO' || code === 'VISITA_YA_CERRADA'
            mostrar(
                yaResuelto ? 'info' : 'error',
                yaResuelto
                    ? 'Este cliente ya estaba resuelto. Actualizamos tu agenda.'
                    : 'No se pudo registrar. Volvé a intentar.',
            )
        }
    }

    // El aviso a Cromo (visita/no_visita) es fire-and-forget del lado del backend: nunca
    // bloquea al vendedor mientras trabaja, así que la primera vez que puede enterarse de
    // que falló es acá, en el listado de clientes a visitar (spec 2026-08-21 §6.3). El
    // mensaje sale del mismo `mensaje` que ya trae la respuesta — nunca se arma en el front,
    // para no desincronizarse del vocabulario de motivos que vive en el backend.
    async function onReintentarSincronizacion(cliente: IAgendaClient) {
        if (cliente.visitaId === null) return
        try {
            const res = await reintentarSeguimiento.mutateAsync(cliente.visitaId)
            mostrar(res.enviado ? 'exito' : 'error', res.enviado ? 'Sincronizado con Cromo' : (res.mensaje ?? 'No pudimos conectar con el CRM. Probá de nuevo.'))
        } catch {
            mostrar('error', 'No pudimos conectar con el CRM. Probá de nuevo.')
        }
    }

    if (mensajeCuenta) {
        return (
            <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[#EEF1F6] px-8 text-center">
                <p className="text-[14px] font-semibold leading-snug text-[#182645]">{mensajeCuenta}</p>
                <button
                    type="button"
                    onClick={logout}
                    className="text-[13px] font-semibold text-dsmuted underline"
                >
                    Cerrar sesión
                </button>
            </div>
        )
    }

    // Sin rotación materializada no hay NADA que mostrar: `getCicloActual` responde
    // `{ ciclo: null }` a secas (el controller arma `{ ciclo, ...contexto }` y `contexto` es
    // null), así que `semanas` no viaja y `semanaEfectiva` se queda en null para siempre.
    // Sin este corte el header decía "Cargando…" eternamente, con las flechas muertas y
    // cinco columnas de "Sin visitas este día" — indistinguible de una falla de red.
    // El `cicloResuelto` es lo que separa este caso del "todavía está cargando" real.
    if (cicloResuelto && semanaEfectiva === null) {
        if (probando) {
            return (
                <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[#EEF1F6] px-8 text-center" style={{ paddingTop: ALTO_BANNER_PRUEBA }}>
                    <BannerPrueba />
                    <p className="text-[14px] font-semibold leading-snug text-[#182645]">
                        Tu vendedor de prueba todavía no tiene agenda.
                    </p>
                    <button
                        type="button"
                        onClick={() => setEligiendoCartera(true)}
                        className="rounded-xl bg-dsnavy px-4 py-2.5 text-[13px] font-bold text-white"
                    >
                        Elegir cartera
                    </button>
                    <CarteraDialog open={eligiendoCartera} onOpenChange={setEligiendoCartera} onReiniciado={() => setEligiendoCartera(false)} />
                </div>
            )
        }
        return (
            <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[#EEF1F6] px-8 text-center">
                <p className="text-[14px] font-semibold leading-snug text-[#182645]">
                    Todavía no tenés una ruta asignada.
                </p>
                <p className="text-[13px] leading-snug text-dsmuted">
                    Cuando gerencia cargue tu rotación, tu agenda aparece acá.
                </p>
                <button
                    type="button"
                    onClick={logout}
                    className="text-[13px] font-semibold text-dsmuted underline"
                >
                    Cerrar sesión
                </button>
            </div>
        )
    }

    return (
        <div
            className="flex h-dvh flex-col overflow-hidden bg-[#EEF1F6]"
            style={probando ? { paddingTop: ALTO_BANNER_PRUEBA } : undefined}
        >
            <BannerPrueba />
            <AppHeader
                vendedorNombre={user?.name ?? ''}
                completadas={totalDone}
                total={totalClientes}
                tituloSemana={
                    semanaEfectiva
                        ? `${nombreZona ?? `Semana ${semanaEfectiva}`}${operable && ciclo != null ? ` · ${getWeekRangeLabel()}` : ''}`
                        : 'Cargando…'
                }
                modo={operable && ciclo != null ? 'operable' : 'preview'}
                onLogout={logout}
                onPrevWeek={() => moverSemana(-1)}
                onNextWeek={() => moverSemana(1)}
                buscando={textoBusqueda !== null}
                textoBusqueda={textoBusqueda ?? ''}
                onAbrirBusqueda={() => setTextoBusqueda('')}
                onCambiarBusqueda={setTextoBusqueda}
                onCerrarBusqueda={() => setTextoBusqueda(null)}
            />
            {/* Buscar REEMPLAZA la agenda en vez de taparla con un modal: los resultados
                son de toda la vuelta, no del día que quedó abajo, y así el vendedor
                vuelve con la X del header en vez de tener que cerrar algo encima. */}
            {textoBusqueda !== null ? (
                <BuscadorGeneralPanel
                    texto={textoBusqueda}
                    onVerZona={semana => {
                        setSemanaVista(semana)
                        setTextoBusqueda(null)
                    }}
                />
            ) : (
                <>
                    <DiaTabs activo={diaActivo} counts={counts} onSelect={setDiaActivo} />
                    <AgendaBoard
                        semana={semana}
                        activo={diaActivo}
                        modo={operable && ciclo != null ? 'operable' : 'preview'}
                        hayVisitaEnCurso={visitaEnCurso !== null}
                        reintentandoId={reintentarSeguimiento.isPending ? (reintentarSeguimiento.variables ?? null) : null}
                        onActivoChange={setDiaActivo}
                        onAgregarCliente={zonaPlanificable ? setDiaAAgregar : undefined}
                        onAbrir={abrirPropuesta}
                        onEstadoVisita={setEstadoVisitaCliente}
                        onIniciarVisita={iniciarDirecto}
                        onAbrirAppExterna={abrirAppExternaEnPestana}
                        onReintentarSeguimiento={onReintentarSincronizacion}
                        onEditarAlta={cliente => setClienteNuevo({ modo: 'editar', cliente })}
                        onReintentarAlta={cliente =>
                            setClienteNuevo({ modo: 'reintentar', cliente, diaSugerido: cliente.dia })
                        }
                    />
                </>
            )}

            <VisitaFlow
                cliente={visitaCliente}
                visitaEnCurso={visitaEnCurso}
                directoAMapa={directoAMapa}
                onVisitaIniciada={(cliente, visitaId) => setVisitaEnCurso({ cliente, visitaId })}
                onVisitaCerrada={() => {
                    // Mismo veto de re-adopción que la resolución detectada por polling —
                    // ver el comentario de rotacionesClienteSueltas más arriba. Sin esto, un
                    // refetch de agenda ya en vuelo desde antes del cierre (que cerrarVisita
                    // también dispara, useVisitas.ts) puede resolver después con el cliente
                    // todavía 'en_curso' y revivir la visita ya cerrada.
                    if (visitaEnCurso) {
                        rotacionesClienteSueltas.current.add(visitaEnCurso.cliente.rotacionClienteId)
                    }
                    setVisitaEnCurso(null)
                }}
                onClose={() => {
                    setVisitaCliente(null)
                    setDirectoAMapa(false)
                }}
                onGeoBloqueada={motivo => mostrar('error', MENSAJE_GEO[motivo])}
                onAviso={mostrar}
                onAbrirAppExterna={abrirAppExternaEnPestana}
                onAlejadoChange={setAlejado}
            />
            {visitaEnCurso && !viendoVisitaEnCurso && (
                <VisitaEnCursoBar
                    visitaId={visitaEnCurso.visitaId}
                    nombreCliente={
                        visitaEnCurso.cliente.nombreFantasia || visitaEnCurso.cliente.nombreCliente
                    }
                    alejado={alejado}
                    onExpandir={() => abrirPropuesta(visitaEnCurso.cliente)}
                />
            )}
            <ResolucionSheet
                open={!!noVisitaCliente}
                motivos={motivosVisita}
                // "Cerrar visita" cuando hay una visita abierta de por medio (se está
                // convirtiendo esa resolución) — "Registrar" cuando el cliente sigue
                // pendiente y esto es la primera declaración del hecho, no un cierre.
                confirmLabel={
                    noVisitaCliente && visitaAbiertaDe(noVisitaCliente) !== null
                        ? 'Cerrar visita'
                        : 'Registrar'
                }
                eyebrow="No visité"
                submitting={noVisita.isPending || noVisitaAbierta.isPending}
                onConfirm={motivoIds => onConfirmNoVisita(motivoIds)}
                onClose={() => setNoVisitaCliente(null)}
            />
            <EstadoVisitaSheet
                open={!!estadoVisitaCliente}
                nombreCliente={estadoVisitaCliente?.nombreCliente ?? ''}
                diaActual={estadoVisitaCliente ? DIAS[estadoVisitaCliente.dia - 1] : null}
                estadoActual={estadoVisitaCliente?.estado ?? null}
                semanaActual={semanaEfectiva ?? 1}
                semanasDisponibles={semanas ?? []}
                onReagendar={onReagendar}
                onElegirNoVisita={onElegirNoVisita}
                // Solo lo que el vendedor agregó a mano y sigue pendiente: lo planificado
                // es la línea de base (lo saca gerencia desde /analitica/ruta), y una fila
                // resuelta o en curso la rebota la API igual.
                onEliminar={
                    estadoVisitaCliente?.esExtra &&
                    estadoVisitaCliente.estado === 'pendiente' &&
                    !visitaAbiertaDe(estadoVisitaCliente)
                        ? onElegirEliminar
                        : undefined
                }
                onClose={() => setEstadoVisitaCliente(null)}
            />
            {eliminarCliente && (
                <ConfirmDialog
                    open
                    onOpenChange={abierto => {
                        if (!abierto) setEliminarCliente(null)
                    }}
                    title={`¿Sacar a ${titleCaseNombre(eliminarCliente.nombreFantasia || eliminarCliente.nombreCliente)} de tu agenda?`}
                    description="Solo se saca de esta vuelta."
                    confirmLabel="Sacar"
                    destructivo
                    onConfirm={onConfirmEliminar}
                />
            )}
            {/* `ocultar` y no `desmontar`: cerrar deja las instancias vivas para que reabrir
                el mismo cliente sea instantáneo. */}
            {appExterna.clienteActivo && Object.keys(appExterna.montadas).length > 0 && (
                /* La `key` NO es cosmética: sin ella React reusa el mismo sheet al abrir otro
                   cliente. Cambiar de tab (app) ya no remonta nada — pasa DENTRO del sheet,
                   cambiando appActivaId — así que la key solo depende del cliente. Cada
                   AppExternaFrame lleva además su propia key `app.id:cliente` en el sheet, que
                   es la que remonta el iframe correspondiente si el cliente cambia. */
                <AppExternaSheet
                    key={appExterna.clienteActivo.codigoParticularCliente}
                    cliente={appExterna.clienteActivo}
                    montadas={appExterna.montadas}
                    appActivaId={appExterna.appActivaId}
                    visible={appExterna.visible}
                    onSeleccionarApp={app => {
                        if (appExterna.clienteActivo) appExterna.abrir(app, appExterna.clienteActivo)
                    }}
                    onClose={appExterna.ocultar}
                />
            )}
            {/* `semanaEfectiva` y NO `ciclo.semana`: el "+" vive en el encabezado del día de
                la zona que está EN PANTALLA, y el caso central es planificar la zona que
                viene. Con la del ciclo, tocar el "+" mirando otra zona escribía la fila en
                la zona en curso sin avisar. */}
            {zonaPlanificable && semanaEfectiva != null && diaAAgregar != null && (
                <BuscadorDiaSheet
                    open
                    onClose={() => setDiaAAgregar(null)}
                    semana={semanaEfectiva}
                    dia={DIAS.indexOf(diaAAgregar) + 1}
                    onExtraCreada={() => {
                        setDiaActivo(diaAAgregar)
                        mostrar('exito', `Cliente agregado al ${NOMBRE_DIA[diaAAgregar]}`)
                    }}
                    onTraido={() => {
                        setDiaActivo(diaAAgregar)
                        mostrar('exito', `Cliente movido al ${NOMBRE_DIA[diaAAgregar]}`)
                    }}
                    onNavegarAExistente={abrirPropuesta}
                    onAviso={mostrar}
                    onClienteNuevo={
                        /* Apagado temporal: sin el handler el botón no se pinta (ver
                           ALTAS_HABILITADAS). Es el único punto de entrada a crear un alta. */
                        ALTAS_HABILITADAS
                            ? () =>
                                  setClienteNuevo({ modo: 'crear', semana: semanaEfectiva, dia: DIAS.indexOf(diaAAgregar) + 1 })
                            : undefined
                    }
                />
            )}
            <ClienteNuevoSheet
                open={clienteNuevo !== null}
                contexto={clienteNuevo}
                onClose={() => setClienteNuevo(null)}
                onAviso={mostrar}
                onListo={(cliente, ctx) => {
                    setDiaActivo(DIAS[cliente.dia - 1])
                    mostrar(
                        'exito',
                        ctx.modo === 'editar' ? 'Datos guardados' : `Cliente nuevo agendado el ${NOMBRE_DIA[DIAS[cliente.dia - 1]]}`,
                    )
                }}
            />
            <Notification notificacion={notificacion} onDismiss={ocultar} />
        </div>
    )
}
