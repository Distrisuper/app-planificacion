import { useId, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { formatPct } from '@/lib/analiticaFormat'
import { formatVentas } from '@/lib/facturacion'
import { cn } from '@/lib/utils'
import type { ICupoCliente } from '@/types/planificacion'

const TRAMOS = [
    { tramo: 'nc3', texto: 'NC 3%', corto: '3%' },
    { tramo: 'nc5', texto: 'NC 5%', corto: '5%' },
] as const

interface RecuadroCupoProps {
    /** undefined = el GET carga o falló: el recuadro no se muestra y nunca frena la visita. */
    cupo: ICupoCliente | undefined
    /** El vendedor tildó Acepta (solo cuenta sin adherir). */
    acepta?: boolean
    /** Sin esto el recuadro es solo informativo: se muestra únicamente si el cliente ya está
     *  adherido (por ejemplo, en "No visité"). */
    onAcepta?: (acepta: boolean) => void
    className?: string
}

/**
 * Plan CUPO del cliente a nivel visita, el mismo diseño que "Registrar contacto" de
 * televentas: sin adherir, blanco y con el check Acepta; adherido, verde y con el
 * cumplimiento de cada objetivo. El chevron abre los objetivos del mes, que calcula el
 * back. El desplegable va debajo, en el flujo, y no flotando: vive en el pie del sheet.
 */
export default function RecuadroCupo({ cupo, acepta = false, onAcepta, className }: RecuadroCupoProps) {
    const [abierto, setAbierto] = useState(false)
    const idObjetivos = useId()
    if (!cupo) return null
    const adherido = cupo.adherido
    if (!adherido && !onAcepta) return null

    return (
        <div className={className}>
            <div
                role="group"
                aria-label="CUPO"
                className={cn(
                    'flex h-9 items-center gap-2.5 rounded-lg border-[1.5px] pl-2.5 pr-1',
                    adherido
                        ? 'border-estado-ok-texto bg-estado-ok-fondo text-estado-ok-texto'
                        : 'border-primario bg-tarjeta text-tinta',
                )}
            >
                <span className={cn('text-[13px] font-bold tracking-wide', !adherido && 'text-primario')}>
                    CUPO
                </span>
                {adherido ? (
                    <span className="text-[12.5px] font-semibold tabular-nums">
                        {TRAMOS.map(t => `${t.corto}: ${formatPct(cupo.cumplimiento[t.tramo])}`).join(' · ')}
                    </span>
                ) : (
                    <label className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-primario"
                            checked={acepta}
                            onChange={e => onAcepta?.(e.target.checked)}
                        />
                        Acepta
                    </label>
                )}
                <button
                    type="button"
                    aria-label="Objetivos del mes"
                    aria-expanded={abierto}
                    aria-controls={idObjetivos}
                    onClick={() => setAbierto(a => !a)}
                    className="ml-auto flex h-7 w-7 items-center justify-center rounded-md"
                >
                    <ChevronDown
                        className={cn('h-4 w-4 transition-transform', abierto && 'rotate-180')}
                        aria-hidden
                    />
                </button>
            </div>
            {abierto && (
                <div
                    id={idObjetivos}
                    role="region"
                    aria-label="Objetivos del mes"
                    className="mt-1.5 rounded-lg border border-linea bg-tarjeta px-3 py-2 text-[12.5px] text-tinta"
                >
                    <p className="mb-1 text-[11.5px] font-bold text-tinta-2">Objetivos del mes</p>
                    <div className="grid grid-cols-[auto_auto_auto] items-center justify-start gap-x-3 gap-y-1">
                        {TRAMOS.map(t => (
                            <div key={t.tramo} className="contents">
                                <span className="font-semibold">{t.texto}:</span>
                                <span className="text-right tabular-nums">$ {formatVentas(cupo.objetivos[t.tramo], '$')}</span>
                                {adherido ? <Cumplimiento cupo={cupo} tramo={t.tramo} /> : <span />}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

/** Cumplimiento de un objetivo; el del tramo al que llega el proyectado va marcado. */
function Cumplimiento({ cupo, tramo }: { cupo: ICupoCliente; tramo: 'nc3' | 'nc5' }) {
    const valor = formatPct(cupo.cumplimiento[tramo])
    return cupo.tramoProyectado === tramo ? (
        <span className="inline-flex items-center gap-1 text-estado-ok-texto">
            <strong className="rounded-full bg-estado-ok-texto px-2 py-0.5 text-[12px] font-bold tabular-nums text-tarjeta">
                {valor}
            </strong>
            <Check className="h-4 w-4" strokeWidth={3} role="img" aria-label="Tramo proyectado" />
        </span>
    ) : (
        <span className="text-[12px] font-semibold tabular-nums text-tinta-2">{valor}</span>
    )
}
