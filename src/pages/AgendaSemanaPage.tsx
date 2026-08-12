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
import AppExternaSheet from '@/components/AppExternaSheet'
import { useAgendaSemana } from '@/hooks/useAgenda'
import { useCicloActual, usePreviewSemana, useSincronizar, useReacomodar } from '@/hooks/useCiclo'
import { useMotivos } from '@/hooks/useMotivos'
import { useNoVisita } from '@/hooks/useVisitas'
import { useNotificacion } from '@/hooks/useNotificacion'
import { useAppExterna } from '@/hooks/useAppExterna'
import { Notification } from '@/components/ui/Notification'
import { estaResuelto } from '@/lib/estadoCiclo'
import { errorCode } from '@/lib/apiError'
import { getWeekRangeLabel, getDiaDeHoy } from '@/lib/weekDates'
import type { Dia, IAgendaClient, SemanaAgenda } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

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
    const { user, logout } = useAuth()
    const { data: cicloActual, error: cicloActualError, isSuccess: cicloResuelto } =
        useCicloActual()
    const mensajeCuenta = mensajeDeCuenta(errorCode(cicloActualError))
    const ciclo = cicloActual?.ciclo ?? null
    const semanas = cicloActual?.semanas
    const semanasPendientes = cicloActual?.semanasPendientes
    const sincronizar = useSincronizar()
    const reacomodar = useReacomodar()
    const noVisita = useNoVisita()
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
    // La visita en curso del vendedor, independiente de qué card esté mirando ahora
    // (`visitaCliente`). Antes vivía adentro de VisitaFlow atada al cliente abierto: tocar
    // la propuesta de OTRO cliente y cerrarla la perdía, y la barra flotante desaparecía.
    const [visitaEnCurso, setVisitaEnCurso] = useState<IVisitaEnCurso | null>(null)

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
            // visita ya se resolvió por otro lado.
            if (actual && actual.estado !== 'en_curso' && actual.estado !== 'pendiente') {
                setVisitaEnCurso(null)
            }
            return
        }
        const enCurso = DIAS.flatMap(d => agenda[d] ?? []).find(c => c.estado === 'en_curso')
        if (enCurso && enCurso.visitaId !== null) {
            setVisitaEnCurso({ cliente: enCurso, visitaId: enCurso.visitaId })
        }
    }, [agenda, visitaEnCurso])

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

    async function onConfirmNoVisita(motivoIds: number[]) {
        const cliente = noVisitaCliente
        setNoVisitaCliente(null)
        if (!cliente) return
        try {
            await noVisita.mutateAsync({
                rotacionClienteId: cliente.rotacionClienteId,
                motivoIds,
            })
            mostrar('exito', 'Registrado')
        } catch (err) {
            const yaResuelto = errorCode(err) === 'CICLO_CLIENTE_YA_RESUELTO'
            mostrar(
                yaResuelto ? 'info' : 'error',
                yaResuelto
                    ? 'Este cliente ya estaba resuelto. Actualizamos tu agenda.'
                    : 'No se pudo registrar. Volvé a intentar.',
            )
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
        <div className="flex h-dvh flex-col overflow-hidden bg-[#EEF1F6]">
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
            />
            <DiaTabs activo={diaActivo} counts={counts} onSelect={setDiaActivo} />
            <AgendaBoard
                semana={semana}
                activo={diaActivo}
                modo={operable && ciclo != null ? 'operable' : 'preview'}
                hayVisitaEnCurso={visitaEnCurso !== null}
                onActivoChange={setDiaActivo}
                onAbrir={abrirPropuesta}
                onEstadoVisita={setEstadoVisitaCliente}
                onIniciarVisita={iniciarDirecto}
                onAbrirAppExterna={appExterna.abrir}
            />

            <VisitaFlow
                cliente={visitaCliente}
                visitaEnCurso={visitaEnCurso}
                directoAMapa={directoAMapa}
                onVisitaIniciada={(cliente, visitaId) => setVisitaEnCurso({ cliente, visitaId })}
                onVisitaCerrada={() => setVisitaEnCurso(null)}
                onClose={() => {
                    setVisitaCliente(null)
                    setDirectoAMapa(false)
                }}
                onGeoBloqueada={motivo => mostrar('error', MENSAJE_GEO[motivo])}
                onAviso={mostrar}
                onAbrirAppExterna={appExterna.abrir}
            />
            {visitaEnCurso && !viendoVisitaEnCurso && (
                <VisitaEnCursoBar
                    visitaId={visitaEnCurso.visitaId}
                    nombreCliente={
                        visitaEnCurso.cliente.nombreFantasia || visitaEnCurso.cliente.nombreCliente
                    }
                    onExpandir={() => abrirPropuesta(visitaEnCurso.cliente)}
                />
            )}
            <ResolucionSheet
                open={!!noVisitaCliente}
                motivos={motivosVisita}
                confirmLabel="Registrar"
                eyebrow="No visité"
                submitting={noVisita.isPending}
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
                onClose={() => setEstadoVisitaCliente(null)}
            />
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
            <Notification notificacion={notificacion} onDismiss={ocultar} />
        </div>
    )
}
