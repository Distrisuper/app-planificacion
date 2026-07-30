import { useEffect, useState } from 'react'
import { ChevronLeft, Loader2, Maximize2, Trash2 } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import RubroCard from './propuesta/RubroCard'
import ResolucionRubro from './propuesta/ResolucionRubro'
import VersusTable from './propuesta/VersusTable'
import { useMotivos } from '@/hooks/useMotivos'
import { useRubros, useResolverRubro, useEliminarRubro } from '@/hooks/useRubros'
import { useRubroStatus } from '@/hooks/useRubroStatus'
import { useVisitaTimer } from '@/hooks/useVisitaTimer'
import { formatearDuracion } from '@/lib/visitaTimer'
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
    const resolver = useResolverRubro(visitaId)
    const eliminar = useEliminarRubro(visitaId)

    const [activo, setActivo] = useState<IVisitaRubro | null>(null)
    const [borrador, setBorrador] = useState<IRubroMotivo[]>([])
    const [error, setError] = useState<string | null>(null)
    const [vista, setVista] = useState<Vista>('list')

    // Solo se pide cuando el vendedor la abre: TODOS los rubros del cliente
    // (Actual/M.Ant/Prom.6M), independiente de la propuesta/lista de caídas.
    const { data: rubroStatus = [], isLoading: rubroStatusLoading } = useRubroStatus(
        vista === 'versus' ? (codigoParticularCliente ?? null) : null,
    )

    useEffect(() => {
        if (!open) {
            setActivo(null)
            setBorrador([])
            setError(null)
            setVista('list')
        }
    }, [open])

    function abrirRubro(rubro: IVisitaRubro) {
        setActivo(rubro)
        setBorrador(rubro.motivos)
        setError(null)
    }

    async function guardar() {
        if (!activo) return
        setError(null)
        try {
            await resolver.mutateAsync({ rubroId: activo.id, motivos: borrador })
            setActivo(null)
        } catch {
            // Deliberadamente NO se cierra la vista ni se limpia el borrador: el vendedor
            // pudo haber tipeado marca/competidor/% y perder eso por un bache de señal lo
            // entrena a no volver a cargarlo.
            setError('Sin conexión. Volvé a intentar; no se perdió lo que cargaste.')
        }
    }

    const pendientes = rubros.filter(r => !r.resuelto).length

    // El pie (Cerrar visita) se mantiene fijo en list/versus; al editar un rubro
    // (`activo`) no aplica — esa vista tiene su propio flujo de guardado.
    const footer =
        !activo ? (
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
            {activo ? (
                <div>
                    <ResolucionRubro
                        rubro={activo}
                        motivos={motivos}
                        value={borrador}
                        onChange={setBorrador}
                        onGuardar={guardar}
                        onBack={() => setActivo(null)}
                        guardando={resolver.isPending}
                    />
                    {error && (
                        <p className="mt-2 text-[12.5px] font-semibold text-dsred">{error}</p>
                    )}
                </div>
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
                            // Una visita cerrada no se reedita (se genera una visita de ajuste
                            // aparte) — salvo los rubros que quedaron sin cargar, que es
                            // justamente lo que el aviso de "rubros sin cargar" invita a venir
                            // a completar acá mismo.
                            const editable = !visitaCerrada || !r.resuelto
                            return (
                                <div key={r.id} className="flex items-start gap-1.5">
                                    <div
                                        className={`min-w-0 flex-1 ${editable ? 'cursor-pointer' : ''}`}
                                        onClick={editable ? () => abrirRubro(r) : undefined}
                                    >
                                        <RubroCard
                                            nombre={r.rubroDescripcion}
                                            motivosCargados={r.motivos.length}
                                            onResolucion={editable ? () => abrirRubro(r) : undefined}
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
