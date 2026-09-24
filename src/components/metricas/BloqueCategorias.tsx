import { useState } from 'react'
import Cargando from './Cargando'
import ClientesDeTramo from './ClientesDeTramo'
import { claveDelFiltro, useCategoriasMetricas, useClientesDeTramo } from '@/hooks/useMetricas'
import { nombreMes, rangoMes } from '@/lib/fechas'
import type { IClienteTramo, IFiltroMetricas, Tramo } from '@/types/metricas'

const ETIQUETA_TRAMO: Record<Tramo, string> = {
    sinCompras: 'Sin compras', menos1M: '< $1M', entre1y3M: '$1-3M', entre3y5M: '$3-5M', mas5M: '> $5M',
}

interface BloqueCategoriasProps {
    filtro: IFiltroMetricas
}

export default function BloqueCategorias({ filtro }: BloqueCategoriasProps) {
    const [tramo, setTramo] = useState<Tramo | null>(null)
    const [pagina, setPagina] = useState(1)
    const [orden, setOrden] = useState<keyof IClienteTramo>('actual')
    const [dir, setDir] = useState<'asc' | 'desc'>('desc')

    // Un recorte nuevo invalida lo abierto: la categoría abierta puede no existir en él, y la página N
    // de la lista anterior puede no existir en la nueva ("Página 4 de 2", tabla vacía). Se
    // ajusta durante el render (patrón de React para estado derivado de props), no en un
    // efecto, para no dibujar un cuadro con el estado viejo.
    const [filtroVisto, setFiltroVisto] = useState(() => claveDelFiltro(filtro))
    if (filtroVisto !== claveDelFiltro(filtro)) {
        setFiltroVisto(claveDelFiltro(filtro))
        setTramo(null)
        setPagina(1)
    }

    const { data, isLoading, isError, refetch } = useCategoriasMetricas(filtro)
    const clientes = useClientesDeTramo(filtro, tramo, { pagina, orden, dir })

    const [anio, mes] = filtro.hasta.split('-').map(Number)
    const mesDelHasta = new Date(anio, mes - 1, 1)
    const esMesCompleto = rangoMes(mesDelHasta).desde === filtro.desde && rangoMes(mesDelHasta).hasta === filtro.hasta

    const ordenar = (clave: keyof IClienteTramo) => {
        setDir(orden === clave && dir === 'desc' ? 'asc' : 'desc')
        setOrden(clave)
        setPagina(1)
    }

    return (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
            <div>
                <h2 className="text-sm font-semibold text-slate-900">Clientes por categoría</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                    Según lo que facturó cada cliente en {nombreMes(mesDelHasta)}
                    {!esMesCompleto && ' (el mes de la fecha hasta)'}.
                </p>
            </div>

            {isLoading && <Cargando />}
            {isError && (
                <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    No se pudieron cargar las categorías.
                    <button type="button" onClick={() => refetch()} className="font-medium underline">Volver a intentar</button>
                </div>
            )}

            {data && (
                <>
                    <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">▲ {data.subieron} subieron</span>
                        <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">▼ {data.bajaron} bajaron</span>
                        <span className="text-slate-400">vs. mes anterior</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {data.tramos.map(t => (
                            <button
                                key={t.tramo}
                                type="button"
                                aria-pressed={tramo === t.tramo}
                                onClick={() => { setTramo(x => (x === t.tramo ? null : t.tramo)); setPagina(1) }}
                                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                                    tramo === t.tramo ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                                }`}
                            >
                                <p className="text-2xl font-semibold text-slate-900">{t.cantidad}</p>
                                <p className="text-sm text-slate-700">{ETIQUETA_TRAMO[t.tramo]}</p>
                            </button>
                        ))}
                    </div>
                    {tramo === null && <p className="text-xs text-slate-400">Tocá una categoría para ver el listado de clientes.</p>}
                </>
            )}

            {tramo !== null && clientes.isLoading && <Cargando texto="Cargando clientes…" />}
            {tramo !== null && clientes.data && (
                <ClientesDeTramo
                    datos={clientes.data} orden={orden} dir={dir} onOrdenar={ordenar} onPagina={setPagina}
                    actualizando={clientes.isPlaceholderData}
                />
            )}
        </section>
    )
}
