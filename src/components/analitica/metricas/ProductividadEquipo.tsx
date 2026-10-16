import { useNavigate } from 'react-router-dom'
import { useResumen } from '@/hooks/useAnalitica'
import { useProductividadTv } from '@/hooks/useMetricasEquipo'
import { formatPct } from '@/lib/analiticaFormat'
import { tonoCumplimiento, type Tono } from '@/lib/misMetricas'
import { filaDeTv, filaDeVendedor, resumenTvs, type IFilaProductividad } from '@/lib/productividadEquipo'
import { pasaFiltro, type FiltroTipo } from '@/lib/tipoPersona'
import { cn } from '@/lib/utils'
import { BadgeTipo, CLASE_NUM, Cargando, Encabezado, ErrorBloque, Kpi, Tarjeta, comparar, useOrden } from './ui'

type Columna = 'nombre' | 'objetivo' | 'cumplimiento' | 'contactos'

const ENTERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

/** El mismo semáforo que "Mis métricas" del vendedor: ≥80% ok, ≥50% medio, resto bajo. */
const CLASE_CUMPLIMIENTO: Record<Tono, string> = {
    ok: 'bg-emerald-100 text-emerald-800',
    medio: 'bg-amber-100 text-amber-800',
    bajo: 'bg-red-100 text-red-700',
    neutro: 'text-slate-400',
}

interface ProductividadEquipoProps {
    desde: string
    hasta: string
    filtroTipo: FiltroTipo
}

export default function ProductividadEquipo({ desde, hasta, filtroTipo }: ProductividadEquipoProps) {
    const navigate = useNavigate()
    const resumen = useResumen({ desde, hasta })
    const tvs = useProductividadTv(desde, hasta)
    const { orden, ordenarPor } = useOrden<Columna>({ columna: 'cumplimiento', dir: 'desc' })

    const filas: IFilaProductividad[] = [
        ...(resumen.data?.vendedores ?? []).map(filaDeVendedor),
        ...(tvs.data?.tvs ?? []).map(filaDeTv),
    ].filter(f => pasaFiltro([f.tipo], filtroTipo))
    filas.sort((a, b) => comparar(a[orden.columna], b[orden.columna], orden.dir))

    const verVendedores = filtroTipo === 'todos' || filtroTipo === 'vendedor'
    const verTvs = filtroTipo !== 'vendedor'
    const tvsVisibles = (tvs.data?.tvs ?? []).filter(t => pasaFiltro([t.perfil ?? 'sin_perfil'], filtroTipo))
    const equipoTv = resumenTvs(tvsVisibles)
    const promedios = resumen.data?.promedios

    const cargando = resumen.isLoading || tvs.isLoading
    // Las dos fuentes son independientes: si una falla, la otra se sigue viendo (un back
    // anterior a /televentas/productividad no puede dejar a gerencia sin las visitas).
    const irAVendedor = (codigo: string) =>
        navigate(`/analitica/vendedor/${codigo}?${new URLSearchParams({ desde, hasta })}`)

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {verVendedores && (
                    <>
                        <Kpi
                            titulo="Vendedores · visitas"
                            valor={promedios ? formatPct(promedios.pctCumplimientoVisitas === null ? null : promedios.pctCumplimientoVisitas / 100) : '…'}
                            pie="cumplimiento promedio del objetivo de visitas"
                        />
                        <Kpi
                            titulo="Vendedores · efectividad"
                            valor={promedios ? formatPct(promedios.efectividadComercial) : '…'}
                            pie="ofrecimientos ganados / ofrecidos"
                        />
                    </>
                )}
                {verTvs && (
                    <>
                        <Kpi
                            titulo="Televentas · llamados"
                            valor={tvs.data ? formatPct(equipoTv.cumplimiento) : '…'}
                            pie={tvs.data ? `${ENTERO.format(equipoTv.llamados)} llamados · objetivo ${ENTERO.format(equipoTv.objetivo)}` : undefined}
                        />
                        <Kpi
                            titulo="Televentas · contacto"
                            valor={tvs.data ? formatPct(equipoTv.tasaContacto) : '…'}
                            pie={tvs.data ? `atendidos / llamados · ${ENTERO.format(equipoTv.conVenta)} con venta` : undefined}
                        />
                    </>
                )}
            </div>

            <Tarjeta
                titulo="Productividad por persona"
                subtitulo="Cada uno contra su objetivo: el vendedor por visitas válidas, el TV por llamados (la meta diaria de su perfil). No se suman entre sí."
            >
                {cargando && <Cargando />}
                {resumen.isError && (
                    <ErrorBloque texto="No se pudieron cargar las visitas de los vendedores." onReintentar={() => resumen.refetch()} />
                )}
                {tvs.isError && verTvs && (
                    <ErrorBloque texto="No se pudieron cargar los llamados de Televentas." onReintentar={() => tvs.refetch()} />
                )}
                {!cargando && filas.length === 0 && !resumen.isError && !(tvs.isError && verTvs) && (
                    <p className="py-8 text-center text-sm text-slate-500">Sin actividad en este período.</p>
                )}
                {filas.length > 0 && (
                    <div className="-mx-5 overflow-x-auto">
                        <table className="w-full min-w-[600px] text-sm">
                            <thead className="border-y border-slate-200 bg-slate-50/70">
                                <tr>
                                    <th className="w-10 px-3 py-2.5" aria-label="Posición" />
                                    <Encabezado columna="nombre" orden={orden} onOrdenar={ordenarPor} alinear="left">Persona</Encabezado>
                                    <Encabezado columna="objetivo" orden={orden} onOrdenar={ordenarPor}>Objetivo</Encabezado>
                                    <Encabezado columna="cumplimiento" orden={orden} onOrdenar={ordenarPor}>Cumplimiento</Encabezado>
                                    <Encabezado columna="contactos" orden={orden} onOrdenar={ordenarPor} className="pr-5">Contactos</Encabezado>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filas.map((f, i) => (
                                    <tr
                                        key={f.clave}
                                        data-testid={`fila-productividad-${f.codigo}`}
                                        onClick={f.esVendedor ? () => irAVendedor(f.codigo) : undefined}
                                        className={cn(f.esVendedor && 'cursor-pointer hover:bg-slate-50')}
                                    >
                                        <td className={cn(CLASE_NUM, 'px-3 py-2.5 text-center text-xs text-slate-400')}>{i + 1}</td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate font-semibold text-slate-900">{f.nombre}</span>
                                                <BadgeTipo tipo={f.tipo} />
                                            </div>
                                            {/* El código del vendedor es su alias (FEDE, VTA 1) y repite el nombre. */}
                                            {!f.esVendedor && <p className="text-[11px] text-slate-400">{f.codigo}</p>}
                                        </td>
                                        <td className={cn(CLASE_NUM, 'px-3 py-2.5 text-right')}>
                                            <span className="font-semibold text-slate-900">
                                                {f.objetivo === null ? 's/d' : ENTERO.format(f.objetivo)}
                                            </span>
                                            <p className="text-[11px] text-slate-400">{f.esVendedor ? 'visitas válidas' : 'llamados'}</p>
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                            <span
                                                className={cn(
                                                    CLASE_NUM,
                                                    'inline-flex rounded-lg px-2 py-0.5 font-bold',
                                                    CLASE_CUMPLIMIENTO[tonoCumplimiento(f.cumplimiento)],
                                                )}
                                            >
                                                {formatPct(f.cumplimiento)}
                                            </span>
                                        </td>
                                        <td className={cn(CLASE_NUM, 'px-3 py-2.5 pr-5 text-right')}>
                                            <span className="text-slate-900">{ENTERO.format(f.contactos)}</span>
                                            <p className="text-[11px] text-slate-400">{f.esVendedor ? 'clientes' : 'atendidos'}</p>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Tarjeta>
        </div>
    )
}
