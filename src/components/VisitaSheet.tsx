import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import RubroCard from './propuesta/RubroCard'
import ResolucionRubro from './propuesta/ResolucionRubro'
import { useMotivos } from '@/hooks/useMotivos'
import { useRubros, useResolverRubro, useEliminarRubro } from '@/hooks/useRubros'
import type { IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

interface VisitaSheetProps {
    open: boolean
    visitaId: number
    nombreCliente: string
    /** true = se entró solo a completar rubros de una visita ya cerrada. */
    visitaCerrada: boolean
    onCerrarVisita: () => void
    onClose: () => void
    cerrando?: boolean
}

export default function VisitaSheet({
    open,
    visitaId,
    nombreCliente,
    visitaCerrada,
    onCerrarVisita,
    onClose,
    cerrando,
}: VisitaSheetProps) {
    const { data: rubros = [] } = useRubros(open ? visitaId : null)
    const { data: motivos = [] } = useMotivos('rubro')
    const resolver = useResolverRubro(visitaId)
    const eliminar = useEliminarRubro(visitaId)

    const [activo, setActivo] = useState<IVisitaRubro | null>(null)
    const [borrador, setBorrador] = useState<IRubroMotivo[]>([])
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) {
            setActivo(null)
            setBorrador([])
            setError(null)
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

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={nombreCliente}
            eyebrow="Propuesta comercial"
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
            ) : (
                <div>
                    <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                        Cargá el resultado de cada rubro que ofreciste. Los que no ofreciste se
                        resuelven con <b className="font-bold text-[#182645]">“No lo ofrecí”</b>.
                    </p>

                    <div className="flex flex-col gap-2.5">
                        {rubros.map(r => (
                            <div key={r.id} className="flex items-start gap-1.5">
                                <div
                                    className="min-w-0 flex-1 cursor-pointer"
                                    onClick={() => abrirRubro(r)}
                                >
                                    <RubroCard
                                        nombre={r.rubroDescripcion}
                                        motivosCargados={r.motivos.length}
                                        onResolucion={() => abrirRubro(r)}
                                    />
                                </div>
                                {/* Los de la propuesta NO se borran (RUBRO_DE_PROPUESTA):
                                    si no se ofreció, se resuelve con "No lo ofrecí". */}
                                {!r.esPropuesto && (
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
                        ))}
                        {rubros.length === 0 && (
                            <div className="text-sm text-dsmuted">
                                Esta visita no tiene rubros propuestos.
                            </div>
                        )}
                    </div>

                    {!visitaCerrada && (
                        <Button
                            onClick={onCerrarVisita}
                            disabled={cerrando}
                            className="mt-3.5 h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
                        >
                            {cerrando ? 'Cerrando…' : 'Cerrar visita'}
                        </Button>
                    )}

                    {pendientes > 0 && (
                        <p className="mt-2 text-center text-[12px] font-semibold text-[#B45309]">
                            {pendientes} {pendientes === 1 ? 'rubro' : 'rubros'} sin cargar. Podés
                            cerrar la visita y completarlos después, pero la semana no cierra
                            hasta que estén.
                        </p>
                    )}
                </div>
            )}
        </BottomSheet>
    )
}
