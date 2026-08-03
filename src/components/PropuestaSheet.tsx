import { useEffect, useState } from 'react'
import { Loader2, Maximize2, Minimize2, Play } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import RubroTable from './propuesta/RubroTable'
import { construirFilasPropuesta } from './propuesta/filas'
import { usePropuesta } from '@/hooks/usePropuesta'
import { useRubroStatus } from '@/hooks/useRubroStatus'
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
    /** true = no se puede iniciar (p.ej. hay otra visita en curso). Deshabilita el botón
     *  sin mostrar el spinner de `iniciando`. */
    deshabilitado?: boolean
    /** Mensaje del último intento fallido, o el motivo por el que está deshabilitado.
     *  Queda visible hasta el próximo intento (no es un toast de 2 segundos: si falla acá,
     *  el vendedor tiene que verlo con calma). */
    error?: string | null
}

// El backend exige -1 <= caidaPct <= 0 (0 = sin caída, -1 = -100%). Los rubros de relleno
// (isFallback) no llegaron al umbral de caída sostenida y su dropPct puede venir positivo
// (creció, no cayó) — eso no es una caída, así que se manda 0 en vez del valor crudo.
export function toPropuestaDTO(r: IRubroPropuesta): IPropuestaRubroDTO {
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
    deshabilitado,
    error,
}: PropuestaSheetProps) {
    const { data, isLoading } = usePropuesta(open ? codigoCliente : null)
    const rubros: IRubroPropuesta[] = data?.rubros ?? []

    const [expandido, setExpandido] = useState(false)

    // Antes solo se pedía al entrar a "Ver versus"; ahora la tabla ES el contenido de
    // esta pantalla, así que se pide junto con la propuesta, al abrir el sheet.
    const { data: rubroStatus = [], isLoading: rubroStatusLoading } = useRubroStatus(
        open ? codigoCliente : null,
    )

    useEffect(() => {
        if (!open) {
            setExpandido(false)
        }
    }, [open])

    const cargando = isLoading || rubroStatusLoading
    const codesPropuesta = new Set(rubros.map(r => r.rubroCode))
    const hayOtrosRubros = rubroStatus.some(s => !codesPropuesta.has(s.rubroCode))
    const filas = construirFilasPropuesta(rubros, rubroStatus, expandido)

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={nombreCliente}
            eyebrow="Propuesta comercial"
            footer={
                <>
                    {error && (
                        <p className="mb-2.5 text-[12.5px] font-semibold text-dsred">{error}</p>
                    )}
                    {/* Fijo junto al botón principal, no adentro del scroll: al expandir la
                     *  tabla con "Ver más" la lista puede crecer bastante, y si este botón
                     *  quedara al final del contenido scrolleable, minimizarla exigiría
                     *  scrollear hasta abajo de todo para volver a encontrarlo. */}
                    {!cargando && hayOtrosRubros && (
                        <Button
                            variant="outline"
                            onClick={() => setExpandido(e => !e)}
                            className="mb-2.5 h-[46px] w-full border-[#C9D2E3] text-[14px] font-bold text-dsnavy"
                        >
                            {expandido ? (
                                <Minimize2 className="h-[15px] w-[15px]" strokeWidth={2.4} />
                            ) : (
                                <Maximize2 className="h-[15px] w-[15px]" strokeWidth={2.4} />
                            )}
                            {expandido ? 'Ver menos' : 'Ver más'}
                        </Button>
                    )}
                    <Button
                        onClick={() => onIniciarVisita(rubros.map(toPropuestaDTO))}
                        disabled={deshabilitado}
                        loading={iniciando}
                        className="h-12 w-full bg-dsgreen text-[15px] shadow-[0_3px_10px_rgba(0,158,79,.32)] hover:bg-dsgreen/90"
                    >
                        {!iniciando && <Play className="h-[15px] w-[15px] fill-current" strokeWidth={0} />}
                        {iniciando ? 'Iniciando…' : 'Iniciar visita'}
                    </Button>
                </>
            }
        >
            <div>
                <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                    Cayeron los <b className="font-bold text-dsred">últimos 2 meses</b> vs. el
                    promedio de 6 meses del cliente:
                </p>

                {data && (
                    <p className="mb-2.5 text-[11px] font-semibold text-dsmuted">
                        Actual: {data.daysElapsed} de {data.totalDays} días del mes
                    </p>
                )}

                {cargando ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-dsmuted">
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                        Cargando…
                    </div>
                ) : filas.length === 0 ? (
                    <div className="text-sm text-dsmuted">Sin oportunidades destacadas.</div>
                ) : (
                    <RubroTable filas={filas} />
                )}
            </div>
        </BottomSheet>
    )
}
