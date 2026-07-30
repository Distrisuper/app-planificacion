import { useEffect, useState } from 'react'
import { ChevronLeft, Loader2, Maximize2, Trash2 } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import RubroCard from './propuesta/RubroCard'
import ResolucionWizard from './propuesta/ResolucionWizard'
import VersusTable from './propuesta/VersusTable'
import { useMotivos } from '@/hooks/useMotivos'
import { useRubros, useResolverRubros, useEliminarRubro } from '@/hooks/useRubros'
import { useRubroStatus } from '@/hooks/useRubroStatus'
import { useVisitaTimer } from '@/hooks/useVisitaTimer'
import { formatearDuracion } from '@/lib/visitaTimer'
import { motivosIguales } from '@/lib/resolucionRubro'
import type { IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

type Vista = 'list' | 'versus'

interface VisitaSheetProps {
    open: boolean
    visitaId: number
    nombreCliente: string
    /** true = se entró solo a completar rubros de una visita ya cerrada. */
    visitaCerrada: boolean
    /** true = la visita está en curso (no cerrada): pinta el eyebrow naranja + cronómetro. */
    enCurso?: boolean
    /** Si se pasa, habilita "Ver versus" (cómo viene comprando el cliente) durante la
     *  visita, igual que en la Propuesta previa. */
    codigoParticularCliente?: string
    onCerrarVisita: () => void
    onClose: () => void
    /** Si se pasa (y enCurso), aparece el botón de minimizar en el header. */
    onMinimize?: () => void
    cerrando?: boolean
}

export default function VisitaSheet({
    open,
    visitaId,
    nombreCliente,
    visitaCerrada,
    enCurso,
    codigoParticularCliente,
    onCerrarVisita,
    onClose,
    onMinimize,
    cerrando,
}: VisitaSheetProps) {
    const segundos = useVisitaTimer(visitaId)
    const { data: rubros = [] } = useRubros(open ? visitaId : null)
    const { data: motivos = [] } = useMotivos('rubro')
    const resolverTodos = useResolverRubros(visitaId)
    const eliminar = useEliminarRubro(visitaId)

    const [wizard, setWizard] = useState<{ rubros: IVisitaRubro[]; index: number } | null>(null)
    const [borradores, setBorradores] = useState<Record<number, IRubroMotivo[]>>({})
    const [guardados, setGuardados] = useState<Record<number, IRubroMotivo[]>>({})
    const [fallidos, setFallidos] = useState<Record<number, string>>({})
    const [vista, setVista] = useState<Vista>('list')

    // Solo se pide cuando el vendedor la abre: TODOS los rubros del cliente
    // (Actual/M.Ant/Prom.6M), independiente de la propuesta/lista de caídas.
    const { data: rubroStatus = [], isLoading: rubroStatusLoading } = useRubroStatus(
        vista === 'versus' ? (codigoParticularCliente ?? null) : null,
    )

    useEffect(() => {
        if (!open) {
            setWizard(null)
            setBorradores({})
            setGuardados({})
            setFallidos({})
            setVista('list')
        }
    }, [open])

    // Una visita cerrada no se reedita (se genera una visita de ajuste aparte) — salvo
    // los rubros que quedaron sin cargar, que es justamente lo que el aviso de "rubros
    // sin cargar" invita a venir a completar acá mismo.
    function esEditable(r: IVisitaRubro) {
        return !visitaCerrada || !r.resuelto
    }

    function abrirWizard(rubro: IVisitaRubro) {
        const subset = rubros.filter(esEditable)
        const index = subset.findIndex(r => r.id === rubro.id)
        setBorradores(prev => {
            const next = { ...prev }
            for (const r of subset) if (!(r.id in next)) next[r.id] = r.motivos
            return next
        })
        setGuardados(prev => {
            const next = { ...prev }
            for (const r of subset) if (!(r.id in next)) next[r.id] = r.motivos
            return next
        })
        setWizard({ rubros: subset, index })
    }

    async function guardarTodo() {
        if (!wizard) return
        const cambios = wizard.rubros
            .filter(r => !motivosIguales(borradores[r.id] ?? [], guardados[r.id] ?? []))
            .map(r => ({ rubroId: r.id, motivos: borradores[r.id] ?? [] }))
        if (cambios.length === 0) return

        const resultados = await resolverTodos.mutateAsync(cambios)

        setFallidos(prev => {
            const next = { ...prev }
            for (const res of resultados) {
                if (res.error) next[res.rubroId] = res.error
                else delete next[res.rubroId]
            }
            return next
        })
        setGuardados(prev => {
            const next = { ...prev }
            for (const res of resultados) {
                if (!res.error) next[res.rubroId] = borradores[res.rubroId] ?? []
            }
            return next
        })
    }

    const pendientes = rubros.filter(r => !r.resuelto).length

    // El pie (Cerrar visita) se mantiene fijo en list/versus; en el wizard no aplica —
    // esa vista tiene su propio flujo de guardado (Guardar todo, dentro del contenido).
    const footer =
        !wizard ? (
            <>
                {pendientes > 0 && (
                    <p className="mb-2 text-center text-[12px] font-semibold text-[#B45309]">
                        {pendientes} {pendientes === 1 ? 'rubro' : 'rubros'} sin cargar. Podés
                        cerrar la visita y completarlos después, pero la semana no cierra
                        hasta que estén.
                    </p>
                )}
                {!visitaCerrada && (
                    <Button
                        onClick={onCerrarVisita}
                        loading={cerrando}
                        className="h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
                    >
                        {cerrando ? 'Cerrando…' : 'Cerrar visita'}
                    </Button>
                )}
            </>
        ) : undefined

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            onMinimize={enCurso ? onMinimize : undefined}
            title={nombreCliente}
            eyebrow={enCurso ? `● En curso · ${formatearDuracion(segundos)}` : 'Propuesta comercial'}
            eyebrowClassName={enCurso ? 'text-[#B45309]' : undefined}
            footer={footer}
        >
            {wizard ? (
                <ResolucionWizard
                    rubros={wizard.rubros}
                    index={wizard.index}
                    motivos={motivos}
                    borradores={borradores}
                    guardados={guardados}
                    fallidos={fallidos}
                    guardando={resolverTodos.isPending}
                    onIndexChange={index => setWizard(w => (w ? { ...w, index } : w))}
                    onCambiarBorrador={(rubroId, m) => setBorradores(prev => ({ ...prev, [rubroId]: m }))}
                    onGuardarTodo={guardarTodo}
                    onVolver={() => setWizard(null)}
                />
            ) : vista === 'versus' ? (
                <div>
                    <div className="mb-3.5 flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            aria-label="Volver"
                            onClick={() => setVista('list')}
                            className="h-[29px] w-[29px] border-[#E1E6F0] text-dsmuted"
                        >
                            <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                        </Button>
                        <span className="text-[13px] font-bold text-[#182645]">
                            Cómo viene comprando
                        </span>
                    </div>
                    {rubroStatusLoading ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-dsmuted">
                            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                            Cargando…
                        </div>
                    ) : (
                        <VersusTable rubros={rubroStatus} />
                    )}
                </div>
            ) : (
                <div>
                    <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                        Cargá el resultado de cada rubro que ofreciste. Los que no ofreciste se
                        resuelven con <b className="font-bold text-[#182645]">“No lo ofrecí”</b>.
                    </p>

                    <div className="flex flex-col gap-2.5">
                        {rubros.map(r => {
                            const editable = esEditable(r)
                            return (
                                <div key={r.id} className="flex items-start gap-1.5">
                                    <div
                                        className={`min-w-0 flex-1 ${editable ? 'cursor-pointer' : ''}`}
                                        onClick={editable ? () => abrirWizard(r) : undefined}
                                    >
                                        <RubroCard
                                            nombre={r.rubroDescripcion}
                                            motivosCargados={r.motivos.length}
                                            onResolucion={editable ? () => abrirWizard(r) : undefined}
                                        />
                                    </div>
                                    {/* Los de la propuesta NO se borran (RUBRO_DE_PROPUESTA):
                                        si no se ofreció, se resuelve con "No lo ofrecí". */}
                                    {!r.esPropuesto && editable && (
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            aria-label={`Quitar ${r.rubroDescripcion}`}
                                            onClick={() => eliminar.mutate(r.id)}
                                            className="mt-1 h-9 w-9 shrink-0 border-[#E1E6F0] text-dsmuted"
                                        >
                                            <Trash2 className="h-[15px] w-[15px]" strokeWidth={2} />
                                        </Button>
                                    )}
                                </div>
                            )
                        })}
                        {rubros.length === 0 && (
                            <div className="text-sm text-dsmuted">
                                Esta visita no tiene rubros propuestos.
                            </div>
                        )}
                    </div>

                    {codigoParticularCliente && (
                        <Button
                            variant="outline"
                            onClick={() => setVista('versus')}
                            className="mt-3.5 h-[46px] w-full border-[#C9D2E3] text-[14px] font-bold text-dsnavy"
                        >
                            <Maximize2 className="h-[15px] w-[15px]" strokeWidth={2.4} />
                            Ver versus
                        </Button>
                    )}
                </div>
            )}
        </BottomSheet>
    )
}
