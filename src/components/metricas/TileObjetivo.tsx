import TileMarco from './TileMarco'
import { formatearValor, semaforo, type Formato } from '@/lib/metricas/formato'
import type { ValorObjetivo } from '@/lib/metricas/catalogo'

const COLOR = { rojo: 'bg-dsred', ambar: 'bg-dsorange', verde: 'bg-dsgreen' } as const
const sinSufijo = (s: string) => s.replace(/ hs$| u\.$/, '')

interface Props { titulo: string; ayuda: string; formato: Formato; valor: ValorObjetivo }

export default function TileObjetivo({ titulo, ayuda, formato, valor }: Props) {
    const { actual, objetivo } = valor
    const pct = objetivo ? Math.min(actual / objetivo, 1) * 100 : 0
    return (
        <TileMarco titulo={titulo} ayuda={ayuda}>
            <p className="text-[26px] font-black leading-none text-dsnavytext">{formatearValor(formato, actual)}</p>
            {objetivo ? (
                <>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E7E9F0]">
                        <div data-testid="barra-objetivo" className={`h-full rounded-full ${COLOR[semaforo(actual, objetivo)]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[12px] text-dsmuted">
                        {sinSufijo(formatearValor(formato, actual))} de {formatearValor(formato, objetivo)}
                    </p>
                </>
            ) : (
                <p className="mt-2 text-[12px] text-dsmuted">Sin objetivo cargado</p>
            )}
        </TileMarco>
    )
}
