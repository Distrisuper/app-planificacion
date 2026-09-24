import { Button } from '@/components/ui/button'
import { CATALOGO, type FilaLista, type Tile } from '@/lib/metricas/catalogo'
import { useMetricas } from '@/hooks/useMetricas'
import { fechaHoraNegocio } from '@/lib/fechas'
import type { EstadoCliente, IMetricas } from '@/types/metricas'
import TileObjetivo from './TileObjetivo'
import TileComparacion from './TileComparacion'
import TileLista from './TileLista'
import TileSinDatos from './TileSinDatos'
import TileEsqueleto from './TileEsqueleto'

export interface DetalleArgs { estado: EstadoCliente | 'caida'; titulo: string }

interface Props {
    mes: string
    vendedor?: string
    propio: boolean
    columnas?: 2 | 4
    onDetalle?: (args: DetalleArgs) => void
}

/** Recorre el catálogo y renderiza. Estados POR TILE: un `leer()` en null es "Sin datos"
 *  con el título visible; solo el fallo del endpoint entero muestra el aviso de arriba. */
export default function PanelMetricas({ mes, vendedor, propio, columnas = 2, onDetalle }: Props) {
    const { data, isLoading, isError, refetch } = useMetricas({ mes, vendedor })
    const grilla = `grid gap-2.5 ${columnas === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`
    // Antes de que `data` llegue (o si falló), `data?.sujeto.nombre` es '' y los títulos de
    // gerencia (`propio: false`) salían como " · mes" — separador pegado a un nombre vacío.
    // Mientras no hay `data`, se cae a la rama `propio` de `titulo()` (el título sin
    // prefijo de sujeto, "Mi mes"/"Mi cartera"/etc.): no es exacto para gerencia, pero es
    // un texto sensato y sin el artefacto, y en cuanto `data` llega el título real toma el
    // nombre del sujeto.
    const ctx = { propio: propio || !data, nombre: data?.sujeto.nombre ?? '' }

    return (
        <div className="space-y-5 px-4 pb-4 pt-4">
            {isError && (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-[13px] text-dsnavytext">
                    <span>{propio ? 'No pudimos cargar tus métricas.' : 'No pudimos cargar las métricas.'}</span>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>Volver a intentar</Button>
                </div>
            )}
            {CATALOGO.map(seccion => (
                <section key={seccion.id} className="space-y-2">
                    <h2 className="px-1 text-[11px] font-bold uppercase tracking-[.08em] text-dsmuted">
                        {seccion.titulo(ctx)}
                    </h2>
                    <div className={grilla}>
                        {seccion.tiles.map(tile =>
                            data && !isLoading ? renderTile(tile, data, mes, onDetalle) : (
                                <TileEsqueleto key={tile.id} ancho={tile.forma === 'lista' ? 'doble' : 'simple'} />
                            ),
                        )}
                    </div>
                </section>
            ))}
            {data && (
                <p className="py-1 text-center text-[11px] text-dsmuted">Datos actualizados: {fechaHoraNegocio(data.actualizadoEn)}</p>
            )}
        </div>
    )
}

function renderTile(tile: Tile, data: IMetricas, mes: string, onDetalle?: (a: DetalleArgs) => void) {
    // `key` se pasa como prop JSX literal en cada return, no adentro del spread: React 19
    // avisa (dev warning) cuando `key` viaja escondida dentro de un objeto spreadeado.
    const comunes = { titulo: tile.titulo, ayuda: tile.ayuda }
    const sinDatos = (
        <TileSinDatos key={tile.id} {...comunes} ancho={tile.forma === 'lista' ? 'doble' : 'simple'}
            mensaje={data.fuentes.ventas === 'no_disponible' ? 'Sin datos por ahora' : 'Sin datos'} />
    )
    switch (tile.forma) {
        case 'objetivo': {
            const v = tile.leer(data)
            return v ? <TileObjetivo key={tile.id} {...comunes} formato={tile.formato} valor={v} /> : sinDatos
        }
        case 'comparacion': {
            const v = tile.leer(data)
            return v ? <TileComparacion key={tile.id} {...comunes} formato={tile.formato} valor={v} mes={mes} /> : sinDatos
        }
        case 'lista': {
            const filas = tile.leer(data)
            if (!filas) return sinDatos
            const onFila = tile.detalle && onDetalle
                ? (f: FilaLista) => onDetalle({ estado: tile.detalle!(f), titulo: f.etiqueta })
                : undefined
            return <TileLista key={tile.id} {...comunes} formato={tile.formato} filas={filas} onFila={onFila} />
        }
    }
}
