import BottomSheet from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/button'
import { useMetricasClientes } from '@/hooks/useMetricas'
import { formatearValor, formatearVariacion } from '@/lib/metricas/formato'
import type { DetalleArgs } from './PanelMetricas'

interface Props { detalle: DetalleArgs | null; mes: string; vendedor?: string; onClose: () => void }

const TITULO: Record<DetalleArgs['estado'], string> = {
    Activo: 'Clientes activos', Pasivo: 'Clientes pasivos', Inactivo: 'Clientes inactivos', 'Crítico': 'Clientes críticos', caida: 'Clientes en caída',
}

/** El listado que el panel de referencia desplegaba al tocar una categoría; acá en sheet
 *  porque en mobile no hay ancho para una tabla inline. Solo lectura. */
export default function DetalleClientesSheet({ detalle, mes, vendedor, onClose }: Props) {
    const estado = detalle?.estado ?? 'Activo'
    const { data, isLoading, isError, refetch } = useMetricasClientes({ mes, vendedor, estado }, { enabled: detalle !== null })

    return (
        <BottomSheet open={detalle !== null} onClose={onClose} title={TITULO[estado]}
            subtitle="Facturación del mes vs. promedio de los 6 meses anteriores" altura="hasta-completa">
            {isLoading && <div className="space-y-2 p-4">{[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-[#E7E9F0]" />)}</div>}
            {isError && (
                <div className="flex items-center justify-between gap-3 p-4 text-[13px]">
                    <span>No pudimos cargar el listado.</span>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>Volver a intentar</Button>
                </div>
            )}
            {data && data.length === 0 && <p className="p-4 text-[13px] text-dsmuted">No hay clientes en este grupo</p>}
            {data && data.length > 0 && (
                <>
                    <ul className="divide-y divide-dsline px-4">
                        {data.map(c => {
                            const v = c.variacion
                            const color = v === null ? '' : Math.round(v * 100) === 0 ? 'text-dsmuted' : v > 0 ? 'text-dsgreen' : 'text-dsred'
                            return (
                                <li key={c.codigoParticularCliente} className="flex items-center justify-between gap-3 py-2.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-[13px] font-semibold text-dsnavytext">{c.nombre}</p>
                                        <p className="text-[11px] text-dsmuted">{c.codigoParticularCliente}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-[13px] font-bold tabular-nums text-dsnavytext">{formatearValor('pesosMillones', c.actual)}</p>
                                        <p className="text-[11px] text-dsmuted">
                                            prom. {formatearValor('pesosMillones', c.promedio6m)}
                                            {v !== null && <span className={`ml-1.5 font-semibold ${color}`}>{formatearVariacion(v)}</span>}
                                        </p>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                    <p className="px-4 py-3 text-center text-[11px] text-dsmuted">{data.length} clientes</p>
                </>
            )}
        </BottomSheet>
    )
}
