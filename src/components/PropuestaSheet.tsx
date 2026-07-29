import { useEffect, useState } from 'react'
import { ChevronLeft, Maximize2, Play } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import RubroCard from './propuesta/RubroCard'
import VersusComparativo from './propuesta/VersusComparativo'
import { usePropuesta } from '@/hooks/usePropuesta'
import type { IPropuestaRubroDTO, IRubroPropuesta } from '@/types/planificacion'

interface PropuestaSheetProps {
    open: boolean
    codigoCliente: string | null
    nombreCliente: string
    /** Manda la propuesta tal como se mostró, para que el back la congele. */
    onIniciarVisita: (propuesta: IPropuestaRubroDTO[]) => void
    onClose: () => void
    /** true = la mutación de iniciar visita está en curso. */
    iniciando?: boolean
    /** Mensaje del último intento fallido. Queda visible hasta el próximo intento (no es un
     *  toast de 2 segundos: si falla acá, el vendedor tiene que verlo con calma). */
    error?: string | null
}

type Vista = 'list' | 'versus'

// El backend exige -1 <= caidaPct <= 0 (0 = sin caída, -1 = -100%). Los rubros de relleno
// (isFallback) no llegaron al umbral de caída sostenida y su dropPct puede venir positivo
// (creció, no cayó) — eso no es una caída, así que se manda 0 en vez del valor crudo.
function toPropuestaDTO(r: IRubroPropuesta): IPropuestaRubroDTO {
    return {
        rubroCode: r.rubroCode,
        pesosPerdidos: r.pesosPerdidos,
        caidaPct: Math.min(0, Math.max(-1, r.caidaPct ?? 0)),
    }
}

export default function PropuestaSheet({
    open,
    codigoCliente,
    nombreCliente,
    onIniciarVisita,
    onClose,
    iniciando,
    error,
}: PropuestaSheetProps) {
    const { data, isLoading } = usePropuesta(open ? codigoCliente : null)
    const rubros: IRubroPropuesta[] = data?.rubros ?? []

    const [vista, setVista] = useState<Vista>('list')

    useEffect(() => {
        if (!open) {
            setVista('list')
        }
    }, [open])

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={nombreCliente}
            eyebrow="Propuesta comercial"
        >
            {vista === 'versus' ? (
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
                            Este mes <span className="text-dsgreen">vs</span> tu promedio (6M)
                        </span>
                    </div>
                    <div className="flex flex-col gap-4">
                        {rubros.map(r => (
                            <VersusComparativo key={r.rubroCode} rubro={r} />
                        ))}
                    </div>
                </div>
            ) : (
                <div>
                    <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                        Cayeron los <b className="font-bold text-dsred">últimos 2 meses</b> vs. el
                        promedio de 6 meses del cliente:
                    </p>
                    {isLoading ? (
                        <div className="text-sm text-dsmuted">Cargando propuesta…</div>
                    ) : (
                        <div className="flex flex-col gap-2.5">
                            {rubros.map(r => (
                                <RubroCard
                                    key={r.rubroCode}
                                    nombre={r.nombre}
                                    caidaPct={r.caidaPct}
                                    pesosPerdidos={r.pesosPerdidos}
                                    isFallback={r.isFallback}
                                />
                            ))}
                            {rubros.length === 0 && (
                                <div className="text-sm text-dsmuted">
                                    Sin oportunidades destacadas.
                                </div>
                            )}
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

                    {error && (
                        <p className="mt-2.5 text-[12.5px] font-semibold text-dsred">{error}</p>
                    )}
                    <Button
                        onClick={() => onIniciarVisita(rubros.map(toPropuestaDTO))}
                        disabled={iniciando}
                        className="mt-2.5 h-12 w-full bg-dsgreen text-[15px] shadow-[0_3px_10px_rgba(0,158,79,.32)] hover:bg-dsgreen/90"
                    >
                        <Play className="h-[15px] w-[15px] fill-current" strokeWidth={0} />
                        {iniciando ? 'Iniciando…' : 'Iniciar visita'}
                    </Button>
                </div>
            )}
        </BottomSheet>
    )
}
