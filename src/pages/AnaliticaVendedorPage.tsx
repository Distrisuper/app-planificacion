import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import FiltrosAnalitica from '@/components/analitica/FiltrosAnalitica'
import TablaVisitas from '@/components/analitica/TablaVisitas'
import DetalleVisitaPanel from '@/components/analitica/DetalleVisitaPanel'
import { useResumen, useVisitasPaginadas } from '@/hooks/useAnalitica'
import { formatDuracion, formatHoras, formatNumero, formatPct } from '@/lib/analiticaFormat'
import type { ValidezVisita } from '@/types/analitica'

/** 'sin_coord' no se ofrece: no es un juicio sobre el vendedor, y ya tiene su aviso. */
type FiltroValidez = Exclude<ValidezVisita, 'sin_coord'>

function BotonValidez({
    activo,
    onClick,
    children,
}: {
    activo: boolean
    onClick: () => void
    children: ReactNode
}) {
    return (
        <button
            type="button"
            aria-pressed={activo}
            onClick={onClick}
            className={`rounded px-1 -mx-1 underline-offset-2 hover:underline ${
                activo ? 'bg-slate-900 text-white hover:no-underline' : ''
            }`}
        >
            {children}
        </button>
    )
}

export default function AnaliticaVendedorPage() {
    const { codigo = '' } = useParams()
    const [params, setParams] = useSearchParams()
    const desde = params.get('desde') ?? ''
    const hasta = params.get('hasta') ?? ''
    // El rango vive en la URL: así "Volver a la analítica" lo arrastra y el link se
    // puede compartir. `replace` para no llenar el historial con cada fecha tocada.
    const validezParam = params.get('validez')
    const validez: FiltroValidez | undefined =
        validezParam === 'valida' || validezParam === 'no_validada' ? validezParam : undefined
    const setRango = (d: string, h: string) =>
        setParams(
            { desde: d, hasta: h, ...(validez ? { validez } : {}) },
            { replace: true },
        )
    // Tocar el filtro activo lo apaga: es un toggle, no hay botón de "todas" aparte.
    const toggleValidez = (v: FiltroValidez) =>
        setParams(
            { desde, hasta, ...(validez === v ? {} : { validez: v }) },
            { replace: true },
        )
    const [visitaElegida, setVisitaElegida] = useState<number | null>(null)

    const { data: resumen } = useResumen({ desde, hasta })
    const {
        data,
        isLoading,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useVisitasPaginadas({ desde, hasta, vendedor: codigo, validez, cant: 100 })
    const visitas = data?.pages.flatMap(p => p.visitas) ?? []
    const total = data?.pages[0]?.total ?? 0

    const vendedor = resumen?.vendedores.find(v => v.codigoParticularVendedor === codigo)
    const promedios = resumen?.promedios

    return (
        <div className="min-h-screen bg-slate-50">
            <EncabezadoAnalitica
                izquierda={
                    <>
                        <Link
                            to={`/analitica?desde=${desde}&hasta=${hasta}`}
                            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Volver a la analítica
                        </Link>
                        <h1 className="mt-1 text-lg font-semibold text-slate-900">
                            {vendedor?.nombreVendedor ?? codigo}
                        </h1>
                        <p className="text-xs text-slate-500">
                            {desde} a {hasta}
                        </p>
                    </>
                }
            >
                <FiltrosAnalitica filtro={{ desde, hasta }} onRango={setRango} />
            </EncabezadoAnalitica>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                {vendedor && promedios && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        {[
                            // Visitas lleva su desglose adentro: total = válidas + no
                            // validadas + sin coordenadas (esas últimas no son culpa del
                            // vendedor y las explica el aviso de abajo). Son visitas, no
                            // filas de la tabla: la tabla también lista los "no visité".
                            {
                                titulo: 'Visitas',
                                valor: formatNumero(vendedor.visitasTotales),
                                desglose: (
                                    <span>
                                        <BotonValidez
                                            activo={validez === 'valida'}
                                            onClick={() => toggleValidez('valida')}
                                        >
                                            {formatNumero(vendedor.visitasValidas)} válidas
                                        </BotonValidez>
                                        {' · '}
                                        <BotonValidez
                                            activo={validez === 'no_validada'}
                                            onClick={() => toggleValidez('no_validada')}
                                        >
                                            {formatNumero(vendedor.visitasNoValidadas)} no validadas
                                        </BotonValidez>
                                    </span>
                                ),
                                prom: formatNumero(promedios.visitasTotales),
                            },
                            {
                                // Mismo dato y formato que "Horas (mensual)" de la tabla de
                                // efectividad operativa: si no, los dos números no cierran.
                                titulo: 'Horas',
                                valor: formatHoras(vendedor.minutosTotales),
                                prom: formatHoras(promedios.minutosTotales),
                            },
                            {
                                titulo: 'Cobertura',
                                valor: formatPct(vendedor.cobertura),
                                prom: formatPct(promedios.cobertura),
                            },
                            {
                                titulo: 'Efect. comercial',
                                valor: formatPct(vendedor.efectividadComercial),
                                prom: formatPct(promedios.efectividadComercial),
                            },
                            {
                                titulo: 'Visitas/día',
                                valor: formatNumero(vendedor.visitasPorDia),
                                prom: formatNumero(promedios.visitasPorDia),
                            },
                            {
                                titulo: 'Duración prom.',
                                valor: formatDuracion(vendedor.duracionPromedioMin),
                                prom: formatDuracion(promedios.duracionPromedioMin),
                            },
                        ].map(k => (
                            <div
                                key={k.titulo}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                            >
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    {k.titulo}
                                </p>
                                <p className="mt-1 text-xl font-semibold text-slate-900">{k.valor}</p>
                                {'desglose' in k && (
                                    <div className="text-xs text-slate-600">{k.desglose}</div>
                                )}
                                <p className="text-xs text-slate-400">equipo: {k.prom}</p>
                            </div>
                        ))}
                    </div>
                )}

                {vendedor && vendedor.visitasSinCoord > 0 && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                        {vendedor.visitasSinCoord} visitas no verificables: el cliente no tiene
                        coordenadas cargadas.
                    </p>
                )}

                {validez && (
                    <p className="flex items-center gap-2 text-xs text-slate-600">
                        Solo visitas {validez === 'valida' ? 'válidas' : 'no validadas'}
                        <button
                            type="button"
                            onClick={() => toggleValidez(validez)}
                            className="font-medium text-slate-900 underline"
                        >
                            Quitar filtro
                        </button>
                    </p>
                )}

                {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

                {data && visitas.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        {validez
                            ? `Sin visitas ${validez === 'valida' ? 'válidas' : 'no validadas'} en este rango.`
                            : 'Sin visitas en este rango.'}
                    </div>
                )}

                {data && visitas.length > 0 && (
                    <div className="space-y-3">
                        <TablaVisitas visitas={visitas} onElegirVisita={setVisitaElegida} />
                        <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>
                                Mostrando {visitas.length} de {total}
                            </span>
                            {hasNextPage && (
                                <button
                                    type="button"
                                    onClick={() => fetchNextPage()}
                                    disabled={isFetchingNextPage}
                                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                >
                                    {isFetchingNextPage ? 'Cargando…' : 'Mostrar más'}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {visitaElegida !== null && (
                    <DetalleVisitaPanel
                        visitaId={visitaElegida}
                        onCerrar={() => setVisitaElegida(null)}
                    />
                )}
            </main>
        </div>
    )
}
