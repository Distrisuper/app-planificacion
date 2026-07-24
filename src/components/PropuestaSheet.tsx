import { useEffect, useState } from 'react'
import { ChevronLeft, Maximize2, Play } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import RubroCard from './propuesta/RubroCard'
import VersusComparativo from './propuesta/VersusComparativo'
import ResolucionRubro from './propuesta/ResolucionRubro'
import { usePropuesta } from '@/hooks/usePropuesta'
import type { IRubroPropuesta } from '@/types/planificacion'

interface PropuestaSheetProps {
    open: boolean
    codigoCliente: string | null
    nombreCliente: string
    onIniciarVisita: () => void
    onClose: () => void
}

type Vista = 'list' | 'versus'

export default function PropuestaSheet({ open, codigoCliente, nombreCliente, onIniciarVisita, onClose }: PropuestaSheetProps) {
    const { data, isLoading } = usePropuesta(open ? codigoCliente : null)
    const rubros: IRubroPropuesta[] = data?.rubros ?? []

    const [vista, setVista] = useState<Vista>('list')
    const [resolviendoRubro, setResolviendoRubro] = useState<string | null>(null)
    // Ephemeral objection tagging per rubro — not persisted anywhere (see
    // IRubroPropuesta): the real seguimiento the business tracks is the
    // per-visit motivo sent to Cromo at cierre, not a per-rubro breakdown.
    const [tagsPorRubro, setTagsPorRubro] = useState<Record<string, string[]>>({})

    useEffect(() => {
        if (!open) {
            setVista('list')
            setResolviendoRubro(null)
            setTagsPorRubro({})
        }
    }, [open])

    function toggleTag(rubro: string, tag: string) {
        setTagsPorRubro(prev => {
            const cur = prev[rubro] ?? []
            const next = cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag]
            return { ...prev, [rubro]: next }
        })
    }

    return (
        <BottomSheet open={open} onClose={onClose} title={nombreCliente} eyebrow="Propuesta comercial">
            {resolviendoRubro ? (
                <ResolucionRubro
                    rubro={resolviendoRubro}
                    tags={tagsPorRubro[resolviendoRubro] ?? []}
                    onToggleTag={tag => toggleTag(resolviendoRubro, tag)}
                    onBack={() => setResolviendoRubro(null)}
                />
            ) : vista === 'versus' ? (
                <div>
                    <div className="mb-3.5 flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setVista('list')}
                            className="h-[29px] w-[29px] border-[#E1E6F0] text-dsmuted"
                        >
                            <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                        </Button>
                        <span className="text-[13px] font-bold text-[#182645]">
                            Este cliente <span className="text-dsgreen">vs</span> promedio de zona
                        </span>
                    </div>
                    <div className="flex flex-col gap-4">
                        {rubros.map(r => (
                            <VersusComparativo key={r.nombre} rubro={r} />
                        ))}
                    </div>
                </div>
            ) : (
                <div>
                    <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                        Rubros donde compra <b className="font-bold text-dsred">por debajo del promedio</b> de la zona. Oportunidad de
                        propuesta:
                    </p>
                    {isLoading ? (
                        <div className="text-sm text-dsmuted">Cargando propuesta…</div>
                    ) : (
                        <div className="flex flex-col gap-2.5">
                            {rubros.map(r => (
                                <RubroCard
                                    key={r.nombre}
                                    rubro={r}
                                    resCount={(tagsPorRubro[r.nombre] ?? []).length}
                                    onResolucion={() => setResolviendoRubro(r.nombre)}
                                />
                            ))}
                            {rubros.length === 0 && <div className="text-sm text-dsmuted">Sin oportunidades destacadas.</div>}
                        </div>
                    )}

                    {rubros.length > 0 && (
                        <Button
                            variant="outline"
                            onClick={() => setVista('versus')}
                            className="mt-3.5 h-[46px] w-full border-[#C9D2E3] text-[14px] font-bold text-dsnavy"
                        >
                            <Maximize2 className="h-[15px] w-[15px]" strokeWidth={2.4} />
                            Ver versus
                        </Button>
                    )}

                    <Button
                        onClick={onIniciarVisita}
                        className="mt-2.5 h-12 w-full bg-dsgreen text-[15px] shadow-[0_3px_10px_rgba(0,158,79,.32)] hover:bg-dsgreen/90"
                    >
                        <Play className="h-[15px] w-[15px] fill-current" strokeWidth={0} />
                        Iniciar visita
                    </Button>
                </div>
            )}
        </BottomSheet>
    )
}
