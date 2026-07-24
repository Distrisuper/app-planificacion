import { useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import AppHeader from '@/components/AppHeader'
import DiaTabs from '@/components/DiaTabs'
import AgendaBoard from '@/components/AgendaBoard'
import PropuestaSheet from '@/components/PropuestaSheet'
import ResolucionSheet from '@/components/ResolucionSheet'
import ReagendarSheet from '@/components/ReagendarSheet'
import { useAgendaSemana } from '@/hooks/useAgenda'
import { useMotivos } from '@/hooks/useMotivos'
import { useIniciarVisita, useCerrarVisita, useVisitaActiva, useNoVisita } from '@/hooks/useVisitas'
import { getCurrentCoord } from '@/hooks/useGeolocation'
import { useToast } from '@/hooks/useToast'
import { Toast } from '@/components/ui/toast'
import { getWeekRangeLabel } from '@/lib/weekDates'
import type { Dia, IAgendaClient } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

export default function AgendaSemanaPage() {
    const { user, logout } = useAuth()
    const { data: semana } = useAgendaSemana()
    const { data: motivos = [] } = useMotivos()
    const { data: visitaActiva } = useVisitaActiva()
    const iniciar = useIniciarVisita()
    const cerrar = useCerrarVisita()
    // Kept for the "no visité" flow (registrarNoVisita), not currently reachable
    // from the UI: the mock this screen was translated from only models
    // Propuesta/Reagendar per card, so this action has no card entry point yet.
    const noVisita = useNoVisita()
    const { message: toastMessage, showToast } = useToast()

    const [diaActivo, setDiaActivo] = useState<Dia>('LUN')
    const [propuestaCliente, setPropuestaCliente] = useState<IAgendaClient | null>(null)
    const [resolviendo, setResolviendo] = useState(false)
    const [noVisitaCliente, setNoVisitaCliente] = useState<IAgendaClient | null>(null)
    const [reagendarCliente, setReagendarCliente] = useState<IAgendaClient | null>(null)
    // Captured directly from iniciarVisita's response rather than re-read from
    // useVisitaActiva: that query only refetches because iniciarVisita's onSuccess
    // invalidates it, and if that refetch itself fails (network blip, transient 401),
    // visitaActiva would still be null/stale here — silently no-op'ing onCerrar on a
    // visit that was actually created server-side.
    const [visitaActivaId, setVisitaActivaId] = useState<number | null>(null)

    const counts = useMemo(() => {
        const c = {} as Record<Dia, { done: number; total: number }>
        for (const d of DIAS) {
            const clientes = semana?.[d] ?? []
            c[d] = { done: clientes.filter(x => x.resuelto).length, total: clientes.length }
        }
        return c
    }, [semana])

    const totalClientes = DIAS.reduce((n, d) => n + (semana?.[d]?.length ?? 0), 0)
    const totalDone = DIAS.reduce((n, d) => n + (semana?.[d]?.filter(x => x.resuelto).length ?? 0), 0)

    function findCliente(codigo: string): IAgendaClient | null {
        for (const d of DIAS) {
            const found = semana?.[d]?.find(c => c.codigoParticularCliente === codigo)
            if (found) return found
        }
        return null
    }

    function abrirCliente(codigo: string) {
        setPropuestaCliente(findCliente(codigo))
    }

    function abrirReagendar(codigo: string) {
        setReagendarCliente(findCliente(codigo))
    }

    function onPickReagendar() {
        // No hay mutación de reagendado en el backend todavía (ver CLAUDE.md:
        // "Reagendar no mueve estructuralmente al cliente de día"). El componente
        // existe y es funcional en su UI, pero la acción real queda pendiente.
        setReagendarCliente(null)
        showToast('Reagendar aún no está disponible')
    }

    async function onIniciarVisita() {
        if (!propuestaCliente) return
        const coord = await getCurrentCoord()
        const { visitaId } = await iniciar.mutateAsync({
            codigoParticularCliente: propuestaCliente.codigoParticularCliente,
            nombreCliente: propuestaCliente.nombreCliente,
            coordInicio: coord,
        })
        setVisitaActivaId(visitaId)
        setResolviendo(true)
    }

    async function onCerrar(motivoIds: number[]) {
        // Prefer the id captured directly from iniciarVisita's response; fall back to
        // the useVisitaActiva query for the case where the page was reloaded mid-visit
        // (visitaActivaId resets on remount, but the server still has one open).
        const visitaId = visitaActivaId ?? visitaActiva?.visitaId
        if (!visitaId) return
        const coord = await getCurrentCoord()
        const res = await cerrar.mutateAsync({ visitaId, coordFinal: coord, motivoIds })
        setVisitaActivaId(null)
        setResolviendo(false)
        setPropuestaCliente(null)
        if (res.seguimientoPendiente) {
            window.alert('Visita cerrada. El seguimiento en Cromo quedó pendiente de sincronizar.')
        }
    }

    async function onConfirmNoVisita(motivoIds: number[]) {
        if (!noVisitaCliente) return
        const res = await noVisita.mutateAsync({
            codigoParticularCliente: noVisitaCliente.codigoParticularCliente,
            nombreCliente: noVisitaCliente.nombreCliente,
            motivoIds,
        })
        setNoVisitaCliente(null)
        if (res.seguimientoPendiente) {
            window.alert('Registrado. El seguimiento en Cromo quedó pendiente de sincronizar.')
        }
    }

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-[#EEF1F6]">
            <AppHeader
                vendedorNombre={user?.name ?? ''}
                completadas={totalDone}
                total={totalClientes}
                rangoSemana={getWeekRangeLabel()}
                onLogout={logout}
                onPrevWeek={() => showToast('Estás en la semana en curso')}
                onNextWeek={() => showToast('Planificación disponible sólo para esta semana')}
            />
            <DiaTabs activo={diaActivo} counts={counts} onSelect={setDiaActivo} />
            <AgendaBoard
                semana={semana}
                activo={diaActivo}
                onActivoChange={setDiaActivo}
                onAbrir={abrirCliente}
                onReagendar={abrirReagendar}
            />

            <PropuestaSheet
                open={!!propuestaCliente && !resolviendo}
                codigoCliente={propuestaCliente?.codigoParticularCliente ?? null}
                nombreCliente={propuestaCliente?.nombreCliente ?? ''}
                onIniciarVisita={onIniciarVisita}
                onClose={() => setPropuestaCliente(null)}
            />
            <ResolucionSheet
                open={resolviendo}
                motivos={motivos}
                confirmLabel="Cerrar visita"
                submitting={cerrar.isPending}
                onConfirm={onCerrar}
                onClose={() => setResolviendo(false)}
            />
            <ResolucionSheet
                open={!!noVisitaCliente}
                motivos={motivos}
                confirmLabel="Registrar"
                eyebrow="No visita"
                submitting={noVisita.isPending}
                onConfirm={onConfirmNoVisita}
                onClose={() => setNoVisitaCliente(null)}
            />
            <ReagendarSheet
                open={!!reagendarCliente}
                nombreCliente={reagendarCliente?.nombreCliente ?? ''}
                diaActual={diaActivo}
                onPick={onPickReagendar}
                onClose={() => setReagendarCliente(null)}
            />
            <Toast message={toastMessage} />
        </div>
    )
}
