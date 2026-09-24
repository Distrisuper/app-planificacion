import TileMarco from './TileMarco'
import { formatearValor, formatearVariacion, variacion, type Formato } from '@/lib/metricas/formato'
import { mesAnterior, nombreDeMes } from '@/lib/metricas/mes'
import type { ValorComparacion } from '@/lib/metricas/catalogo'

interface Props { titulo: string; ayuda: string; formato: Formato; valor: ValorComparacion; mes: string }

export default function TileComparacion({ titulo, ayuda, formato, valor, mes }: Props) {
    const v = variacion(valor.actual, valor.anterior)
    const color = v === null || Math.round(v * 100) === 0 ? 'text-dsmuted' : v > 0 ? 'text-dsgreen' : 'text-dsred'
    return (
        <TileMarco titulo={titulo} ayuda={ayuda}>
            <p className="text-[26px] font-black leading-none text-dsnavytext">{formatearValor(formato, valor.actual)}</p>
            {v !== null && (
                <p className={`mt-2 text-[12px] font-semibold ${color}`}>
                    {formatearVariacion(v)} vs. {nombreDeMes(mesAnterior(mes))}
                </p>
            )}
        </TileMarco>
    )
}
