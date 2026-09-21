import TileMarco from './TileMarco'
import { formatearValor, type Formato } from '@/lib/metricas/formato'
import type { FilaLista } from '@/lib/metricas/catalogo'

interface Props { titulo: string; ayuda: string; formato: Formato; filas: FilaLista[]; onFila?: (fila: FilaLista) => void }

export default function TileLista({ titulo, ayuda, formato, filas, onFila }: Props) {
    const max = Math.max(...filas.map(f => f.valor), 1)
    return (
        <TileMarco titulo={titulo} ayuda={ayuda} ancho="doble">
            {filas.length === 0 ? (
                <p className="text-[13px] text-dsmuted">Nada para mostrar este mes</p>
            ) : (
                <ul className="-mx-1">
                    {filas.slice(0, 5).map(f => {
                        const contenido = (
                            <>
                                <span className="w-[38%] truncate text-[13px] font-semibold text-dsnavytext">{f.etiqueta}</span>
                                <span className="h-1 flex-1 overflow-hidden rounded-full bg-dsnavy/15">
                                    <span className="block h-full rounded-full bg-dsnavy" style={{ width: `${(f.valor / max) * 100}%` }} />
                                </span>
                                <span className="min-w-[44px] text-right text-[13px] font-bold tabular-nums text-dsnavytext">
                                    {formatearValor(formato, f.valor)}
                                </span>
                                {onFila && <span aria-hidden className="text-dsmuted">›</span>}
                            </>
                        )
                        const clase = 'flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left'
                        return (
                            <li key={f.etiqueta}>
                                {onFila ? (
                                    <button type="button" className={`${clase} active:bg-black/5`} onClick={() => onFila(f)}>{contenido}</button>
                                ) : (
                                    <div className={clase}>{contenido}</div>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}
        </TileMarco>
    )
}
