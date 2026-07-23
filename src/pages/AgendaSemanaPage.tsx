import { useMemo, useState } from 'react'
import AppHeader from '@/components/AppHeader'
import DiaTabs from '@/components/DiaTabs'
import ClienteCard from '@/components/ClienteCard'
import PropuestaSheet from '@/components/PropuestaSheet'
import ResolucionSheet from '@/components/ResolucionSheet'
import { useAgendaSemana } from '@/hooks/useAgenda'
import { useMotivos } from '@/hooks/useMotivos'
import { useIniciarVisita, useCerrarVisita, useVisitaActiva } from '@/hooks/useVisitas'
import { getCurrentCoord } from '@/hooks/useGeolocation'
import type { Dia, IAgendaClient } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

export default function AgendaSemanaPage() {
    const { data: semana } = useAgendaSemana()
    const { data: motivos = [] } = useMotivos()
    const { data: visitaActiva } = useVisitaActiva()
    const iniciar = useIniciarVisita()
    const cerrar = useCerrarVisita()

    const [diaActivo, setDiaActivo] = useState<Dia>('LUN')
    const [propuestaCliente, setPropuestaCliente] = useState<IAgendaClient | null>(null)
    const [resolviendo, setResolviendo] = useState(false)
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
    const clientesDia = semana?.[diaActivo] ?? []

    async function abrirCliente(codigo: string) {
        const cliente = clientesDia.find(c => c.codigoParticularCliente === codigo) ?? null
        setPropuestaCliente(cliente)
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

    return (
        <div className="min-h-full">
            <AppHeader vendedorNombre="" completadas={totalDone} total={totalClientes} rangoSemana="" />
            <DiaTabs activo={diaActivo} counts={counts} onSelect={setDiaActivo} />
            <div className="flex flex-col gap-3 px-3 pb-24">
                {clientesDia.map(c => (
                    <ClienteCard key={c.codigoParticularCliente} cliente={c} onAbrir={abrirCliente} />
                ))}
                {clientesDia.length === 0 && (
                    <div className="mt-8 text-center text-sm text-dsmuted">Sin clientes para {diaActivo}.</div>
                )}
            </div>

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
        </div>
    )
}
