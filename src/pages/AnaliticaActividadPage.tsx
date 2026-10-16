import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import FiltrosAnalitica from '@/components/analitica/FiltrosAnalitica'
import FiltroCanal from '@/components/analitica/FiltroCanal'
import TablaActividad from '@/components/analitica/TablaActividad'
import DetalleVisitaPanel from '@/components/analitica/DetalleVisitaPanel'
import DetalleLlamadoPanel from '@/components/analitica/DetalleLlamadoPanel'
import { useFiltroAnalitica } from '@/hooks/useFiltroAnalitica'
import {
    useContactosPaginados,
    useCriterioVisita,
    useResumen,
    useTelevendedores,
    useVendedores,
} from '@/hooks/useAnalitica'
import { incluyeHoy, rangoHoy } from '@/lib/fechas'
import { formatNumero, formatPct } from '@/lib/analiticaFormat'
import { canalDeParam } from '@/lib/contactos'
import type { CanalContacto } from '@/types/analitica'

/** Cada cuánto se refresca cuando el rango llega hasta hoy. Un minuto alcanza para
 *  seguir la jornada sin machacar la API: una visita dura decenas de minutos. */
const REFRESCO_MS = 60_000

/** Filas por página. Los KPI no dependen de esto: vienen de los conteos del back. */
const POR_PAGINA = 100

export default function AnaliticaActividadPage() {
    const { filtro, setRango, toggleVendedor, limpiarVendedores } = useFiltroAnalitica(rangoHoy())
    const [visitaElegida, setVisitaElegida] = useState<number | null>(null)
    const [llamadoElegido, setLlamadoElegido] = useState<number | null>(null)
    // El canal y los TV viven en la URL como el resto de los filtros; ausentes = todos.
    const [params, setParams] = useSearchParams()
    const tvs = (params.get('tvs') ?? '').split(',').map(t => t.trim()).filter(Boolean)
    // Un TV no visita: con TV elegidos el canal es "Llamados", diga lo que diga la URL.
    const canal = tvs.length > 0 ? 'llamado' : canalDeParam(params.get('canal'))

    const escribir = (cambios: { canal?: CanalContacto | undefined; tvs?: string[] }) => {
        const siguiente = new URLSearchParams(params)
        if ('canal' in cambios) {
            if (cambios.canal) siguiente.set('canal', cambios.canal)
            else siguiente.delete('canal')
        }
        if (cambios.tvs) {
            if (cambios.tvs.length > 0) siguiente.set('tvs', cambios.tvs.join(','))
            else siguiente.delete('tvs')
        }
        setParams(siguiente, { replace: true })
    }
    // Pasar a "Todo" o "Visitas" suelta los TV: si no, el canal volvería a "Llamados".
    const setCanal = (c: CanalContacto | undefined) =>
        escribir(c === 'llamado' ? { canal: c } : { canal: c, tvs: [] })
    const toggleTv = (codigo: string) =>
        escribir({ tvs: tvs.includes(codigo) ? tvs.filter(t => t !== codigo) : [...tvs, codigo] })

    const enVivo = incluyeHoy(filtro.desde, filtro.hasta)
    const { data: roster } = useVendedores()
    const { data: televendedores } = useTelevendedores()
    const criterio = useCriterioVisita()
    const { data: resumen } = useResumen(filtro)
    const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useContactosPaginados(
        {
            desde: filtro.desde,
            hasta: filtro.hasta,
            vendedores: filtro.vendedores,
            ...(canal ? { canal: [canal] } : {}),
            ...(tvs.length > 0 ? { autores: tvs } : {}),
            cant: POR_PAGINA,
        },
        { refrescarCada: enVivo ? REFRESCO_MS : 0 },
    )

    const opciones = (roster ?? []).map(v => ({
        codigo: v.codigoParticularVendedor,
        nombre: v.nombreVendedor,
    }))
    const opcionesTv = (televendedores ?? []).map(t => ({
        codigo: t.codigoParticularTv,
        nombre: t.activo ? t.nombreTv : `${t.nombreTv} (inactivo)`,
    }))

    const paginas = data?.pages ?? []
    const filas = paginas.flatMap(p => p.contactos)
    const total = paginas[0]?.total ?? 0
    // Los conteos son de todo el filtro (no de la página ni del canal). Un back anterior
    // no los manda: los KPI quedan en "—" en vez de mostrar un número cortado.
    const conteos = paginas[0]?.conteos
    const cuenta = (n: number | undefined) => (n === undefined ? '—' : formatNumero(n))

    const kpis = [
        { titulo: 'Visitas cerradas', valor: cuenta(conteos?.visitasCerradas) },
        { titulo: 'En curso', valor: cuenta(conteos?.visitasEnCurso) },
        { titulo: 'No visitó', valor: cuenta(conteos?.noVisita) },
        {
            titulo: 'Llamados',
            valor: cuenta(conteos?.llamados),
            detalle: conteos
                ? `${formatNumero(conteos.llamadosAtendidos)} atendidos · ${formatNumero(conteos.llamadosConVenta)} con venta`
                : undefined,
        },
        { titulo: 'Cobertura', valor: formatPct(resumen?.promedios.cobertura ?? null) },
    ]

    return (
        <div className="min-h-screen bg-slate-50">
            <EncabezadoAnalitica>
                <FiltrosAnalitica
                    filtro={filtro}
                    vendedoresDisponibles={opciones}
                    onRango={setRango}
                    onToggleVendedor={toggleVendedor}
                    onLimpiar={limpiarVendedores}
                    televendedoresDisponibles={opcionesTv}
                    tvsElegidos={tvs}
                    onToggleTv={toggleTv}
                    onLimpiarTvs={() => escribir({ tvs: [] })}
                />
            </EncabezadoAnalitica>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    {kpis.map(k => (
                        <div
                            key={k.titulo}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                        >
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                                {k.titulo}
                            </p>
                            <p className="mt-1 text-xl font-semibold text-slate-900">{k.valor}</p>
                            {k.detalle && <p className="mt-0.5 text-xs text-slate-500">{k.detalle}</p>}
                        </div>
                    ))}
                </div>

                <FiltroCanal canal={canal} onCambiar={setCanal} />

                {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

                {isError && (
                    <p className="text-sm text-red-600">No se pudo cargar la actividad.</p>
                )}

                {data && filas.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Sin actividad entre {filtro.desde} y {filtro.hasta}.
                    </div>
                )}

                {filas.length > 0 && (
                    <div className="space-y-3">
                        <TablaActividad
                            filas={filas}
                            onElegirVisita={id => {
                                setLlamadoElegido(null)
                                setVisitaElegida(id)
                            }}
                            onElegirLlamado={id => {
                                setVisitaElegida(null)
                                setLlamadoElegido(id)
                            }}
                            toleranciaMetros={criterio?.toleranciaMetros}
                            mostrarFecha={filtro.desde !== filtro.hasta}
                        />
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">
                                Mostrando {filas.length} de {total}
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

                {llamadoElegido !== null && (
                    <DetalleLlamadoPanel
                        llamadoId={llamadoElegido}
                        onCerrar={() => setLlamadoElegido(null)}
                    />
                )}
            </main>
        </div>
    )
}
