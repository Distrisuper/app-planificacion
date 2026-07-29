import { useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import AppHeader from '@/components/AppHeader'
import DiaTabs from '@/components/DiaTabs'
import AgendaBoard from '@/components/AgendaBoard'
import CicloVacio from '@/components/CicloVacio'
import VisitaFlow from '@/components/VisitaFlow'
import ResolucionSheet from '@/components/ResolucionSheet'
import EstadoVisitaSheet from '@/components/EstadoVisitaSheet'
import CerrarSemanaSheet from '@/components/CerrarSemanaSheet'
import { useAgendaSemana } from '@/hooks/useAgenda'
import { useCicloActual, useCicloPreview, useAbrirCiclo, useReagendar } from '@/hooks/useCiclo'
import { useMotivos } from '@/hooks/useMotivos'
import { useNoVisita } from '@/hooks/useVisitas'
import { useNotificacion } from '@/hooks/useNotificacion'
import { Notification } from '@/components/ui/Notification'
import { estaResuelto } from '@/lib/estadoCiclo'
import { errorCode } from '@/lib/apiError'
import { getWeekRangeLabel } from '@/lib/weekDates'
import type { Dia, IAgendaClient, SemanaAgenda } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']
const SEMANAS = 5

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
 * reintentando: su usuario no tiene un código de vendedor resoluble. Merece un mensaje
 * distinto para que no siga tocando el botón.
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
    const { data: ciclo } = useCicloActual()
    const abrir = useAbrirCiclo()
    const reagendar = useReagendar()
    const noVisita = useNoVisita()
    const { data: motivosVisita = [] } = useMotivos('visita')
    const { notificacion, mostrar, ocultar } = useNotificacion()

    // La semana que se está MIRANDO. null hasta que se sepa cuál: con vuelta abierta es
    // la suya; sin vuelta, la que proponga el preview.
    const [semanaVista, setSemanaVista] = useState<number | null>(null)
    const semanaEfectiva = semanaVista ?? ciclo?.semana ?? null
    const operable = ciclo != null && semanaEfectiva === ciclo.semana

    const { data: agenda } = useAgendaSemana(operable)
    const { data: preview } = useCicloPreview(
        semanaEfectiva ?? undefined,
        ciclo !== undefined && !operable,
    )

    // Sin vuelta abierta y sin haber tocado las flechas todavía, semanaEfectiva es null:
    // no hay `ciclo.semana` de dónde arrancar. La única semana conocida en ese momento es
    // la que el backend ya propuso en el preview "propuesta" (sin filtro). Se usa SOLO
    // como base para calcular hacia dónde moverse — no se vuelca a semanaVista, porque
    // eso cambiaría la query key de useCicloPreview (de "propuesta" a un número) y
    // tumbaría el preview ya cargado durante el refetch, ocultando momentáneamente el CTA.
    const semanaBase = semanaEfectiva ?? preview?.semana ?? null

    const [diaActivo, setDiaActivo] = useState<Dia>('LUN')
    const [visitaCliente, setVisitaCliente] = useState<IAgendaClient | null>(null)
    const [noVisitaCliente, setNoVisitaCliente] = useState<IAgendaClient | null>(null)
    const [estadoVisitaCliente, setEstadoVisitaCliente] = useState<IAgendaClient | null>(null)
    const [cerrandoSemana, setCerrandoSemana] = useState(false)

    // Las cards del preview no tienen cicloClienteId ni estado, así que se adaptan a la
    // forma de la agenda SOLO para render. El board queda en modo preview, sin acciones,
    // de modo que estos valores de relleno nunca llegan a una mutación.
    const semana: SemanaAgenda | undefined = useMemo(() => {
        if (operable) return agenda
        if (!preview) return undefined
        const out = {} as SemanaAgenda
        for (const d of DIAS) {
            out[d] = (preview.dias[d] ?? []).map(c => ({
                ...c,
                cicloClienteId: -1,
                estado: 'pendiente' as const,
                visitaId: null,
                rubrosPendientes: 0,
            }))
        }
        return out
    }, [operable, agenda, preview])

    const counts = useMemo(() => {
        const c = {} as Record<Dia, { done: number; total: number }>
        for (const d of DIAS) {
            const clientes = semana?.[d] ?? []
            c[d] = {
                done: operable ? clientes.filter(x => estaResuelto(x.estado)).length : 0,
                total: clientes.length,
            }
        }
        return c
    }, [semana, operable])

    const totalClientes = DIAS.reduce((n, d) => n + (semana?.[d]?.length ?? 0), 0)
    const totalDone = DIAS.reduce((n, d) => n + counts[d].done, 0)

    function moverSemana(delta: number) {
        const base = semanaBase ?? 1
        // Wrap 1..5: la rotación es circular, así que las flechas nunca quedan sin salida.
        setSemanaVista(((base - 1 + delta + SEMANAS) % SEMANAS) + 1)
    }

    async function onAbrirSemana() {
        try {
            const res = await abrir.mutateAsync(semanaBase ?? undefined)
            setSemanaVista(res.semana)
            mostrar('exito', `Semana ${res.semana} abierta con ${res.clientes} clientes`)
        } catch (err) {
            const code = errorCode(err)
            if (code === 'CICLO_ABIERTO_EXISTENTE') {
                // Otra pestaña o un doble tap ganaron: el hook ya invalidó cicloActual.
                setSemanaVista(null)
                return
            }
            const deCuenta = mensajeDeCuenta(code)
            mostrar(
                'error',
                deCuenta ??
                    (code === 'CICLO_SIN_CLIENTES'
                        ? 'Esa semana ya no tiene clientes asignados.'
                        : 'No se pudo abrir la semana. Volvé a intentar.'),
            )
        }
    }

    async function onElegirDia(dia: Dia) {
        const cliente = estadoVisitaCliente
        setEstadoVisitaCliente(null)
        if (!cliente) return
        try {
            await reagendar.mutateAsync({
                cicloClienteId: cliente.cicloClienteId,
                dia: DIAS.indexOf(dia) + 1,
            })
            // Reagendar mueve el día y deja al cliente PENDIENTE: no lo resuelve.
            mostrar('exito', 'Cliente reagendado')
        } catch {
            mostrar('error', 'No se pudo reagendar. Volvé a intentar.')
        }
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
            await noVisita.mutateAsync({ cicloClienteId: cliente.cicloClienteId, motivoIds })
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

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-[#EEF1F6]">
            <AppHeader
                vendedorNombre={user?.name ?? ''}
                completadas={totalDone}
                total={totalClientes}
                tituloSemana={
                    semanaBase
                        ? `Semana ${semanaBase}${operable ? ` · ${getWeekRangeLabel()}` : ''}`
                        : 'Cargando…'
                }
                modo={operable ? 'operable' : 'preview'}
                onLogout={logout}
                onCerrarSemana={operable ? () => setCerrandoSemana(true) : undefined}
                onPrevWeek={() => moverSemana(-1)}
                onNextWeek={() => moverSemana(1)}
            />
            <DiaTabs activo={diaActivo} counts={counts} onSelect={setDiaActivo} />
            <AgendaBoard
                semana={semana}
                activo={diaActivo}
                modo={operable ? 'operable' : 'preview'}
                onActivoChange={setDiaActivo}
                onAbrir={setVisitaCliente}
                onEstadoVisita={setEstadoVisitaCliente}
                onCargarRubros={setVisitaCliente}
            />

            {ciclo === null && preview && (
                <CicloVacio
                    semana={preview.semana}
                    clientes={preview.clientes}
                    omitidos={preview.omitidos}
                    abriendo={abrir.isPending}
                    onAbrir={onAbrirSemana}
                />
            )}

            <VisitaFlow
                cliente={visitaCliente}
                onClose={() => setVisitaCliente(null)}
                onGeoBloqueada={motivo => mostrar('error', MENSAJE_GEO[motivo])}
                onAviso={mostrar}
            />
            <ResolucionSheet
                open={!!noVisitaCliente}
                motivos={motivosVisita}
                confirmLabel="Registrar"
                eyebrow="No visité"
                submitting={noVisita.isPending}
                onConfirm={onConfirmNoVisita}
                onClose={() => setNoVisitaCliente(null)}
            />
            <EstadoVisitaSheet
                open={!!estadoVisitaCliente}
                nombreCliente={estadoVisitaCliente?.nombreCliente ?? ''}
                diaActual={estadoVisitaCliente ? DIAS[estadoVisitaCliente.dia - 1] : null}
                estadoActual={estadoVisitaCliente?.estado ?? null}
                onElegirDia={onElegirDia}
                onElegirNoVisita={onElegirNoVisita}
                onClose={() => setEstadoVisitaCliente(null)}
            />
            <CerrarSemanaSheet
                open={cerrandoSemana}
                onClose={() => setCerrandoSemana(false)}
                onCerrado={() => {
                    setCerrandoSemana(false)
                    setSemanaVista(null)
                    mostrar('exito', 'Semana cerrada')
                }}
            />
            <Notification notificacion={notificacion} onDismiss={ocultar} />
        </div>
    )
}
