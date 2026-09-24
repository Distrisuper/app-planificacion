import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Cargando from './Cargando'
import DetalleObjecion from './DetalleObjecion'
import { apiClient } from '@/api/apiClient'
import { useObjecionDetalle, useObjecionesMetricas } from '@/hooks/useMetricas'
import { formatPct } from '@/lib/analiticaFormat'
import { razon } from '@/lib/metricas'
import type { IClienteObjecion, IFiltroMetricas } from '@/types/metricas'

interface BloqueObjecionesProps {
    filtro: IFiltroMetricas
}

export default function BloqueObjeciones({ filtro }: BloqueObjecionesProps) {
    const [rubro, setRubro] = useState<string | undefined>()
    const [abierto, setAbierto] = useState<number | null>(null)
    const [pagina, setPagina] = useState(1)
    const [orden, setOrden] = useState<keyof IClienteObjecion>('nombre')
    const [dir, setDir] = useState<'asc' | 'desc'>('asc')

    const { data, isLoading, isError, refetch } = useObjecionesMetricas(filtro, rubro)
    const detalle = useObjecionDetalle(filtro, abierto, { rubro, pagina, orden, dir })
    const { data: rubros } = useQuery({
        queryKey: ['metricas', 'rubros'],
        queryFn: () => apiClient.get('/sale/rubro/catalog').then(r => r.data.data as { code: string; description: string }[]),
        staleTime: Infinity,
    })

    const abrir = (motivoId: number) => {
        setAbierto(a => (a === motivoId ? null : motivoId))
        setPagina(1)
    }
    const ordenar = (clave: keyof IClienteObjecion) => {
        setDir(orden === clave && dir === 'asc' ? 'desc' : 'asc')
        setOrden(clave)
        setPagina(1)
    }

    return (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">Métricas de objeciones</h2>
                <select
                    aria-label="Rubro"
                    value={rubro ?? ''}
                    onChange={e => { setRubro(e.target.value || undefined); setAbierto(null) }}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
                >
                    <option value="">Todos los rubros</option>
                    {(rubros ?? []).map(r => <option key={r.code} value={r.code}>{r.description}</option>)}
                </select>
            </div>

            {isLoading && <Cargando />}
            {isError && (
                <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    No se pudieron cargar las objeciones.
                    <button type="button" onClick={() => refetch()} className="font-medium underline">Volver a intentar</button>
                </div>
            )}

            {data && data.motivos.length === 0 && <p className="text-sm text-slate-500">Sin objeciones en este período.</p>}

            {data && data.motivos.length > 0 && (
                <>
                    <div className="flex items-baseline gap-2 text-sm text-slate-600" data-testid="tasa-objeciones">
                        Tasa de objeciones:
                        <span className="font-semibold text-slate-900">{formatPct(razon(data.total, data.planificados))}</span>
                        <span className="text-xs text-slate-400">({data.total} objeciones · tocá una tarjeta para ver los clientes)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {data.motivos.map(m => (
                            <button
                                key={m.motivoId}
                                type="button"
                                aria-pressed={abierto === m.motivoId}
                                onClick={() => abrir(m.motivoId)}
                                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                                    abierto === m.motivoId ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                                }`}
                            >
                                <p className="text-2xl font-semibold text-slate-900">{m.cantidad}</p>
                                <p className="text-sm text-slate-700">{m.descripcion}</p>
                                <p className="text-xs text-slate-500">{formatPct(m.pct)}</p>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {abierto !== null && detalle.isLoading && <Cargando texto="Cargando clientes…" />}
            {abierto !== null && detalle.data && (
                <DetalleObjecion
                    detalle={detalle.data} orden={orden} dir={dir} onOrdenar={ordenar} onPagina={setPagina}
                    actualizando={detalle.isPlaceholderData}
                />
            )}
        </section>
    )
}
