import { useNavigate } from 'react-router-dom'
import HelpPopover from '@/components/analitica/HelpPopover'
import { useResumen } from '@/hooks/useAnalitica'
import { useProductividadTv } from '@/hooks/useMetricasEquipo'
import { formatPct } from '@/lib/analiticaFormat'
import { tonoCumplimiento, type Tono } from '@/lib/misMetricas'
import { filaDeTv, filaDeVendedor, resumenTvs, type IFilaProductividad } from '@/lib/productividadEquipo'
import { pasaFiltro, type FiltroTipo } from '@/lib/tipoPersona'
import { cn } from '@/lib/utils'
import { CLASE_NUM, Cargando, Encabezado, ErrorBloque, Kpi, Tarjeta, comparar, useOrden } from './ui'

type Columna = 'nombre' | 'objetivo' | 'actividad' | 'cumplimiento'

/** Cómo sale el objetivo de cada uno según el período (Día, Semana, Mes). */
function AyudaObjetivo() {
    return (
        <div className="space-y-2">
            <p>
                <b>Vendedor:</b> su objetivo de visitas válidas del mes. En Semana o Día, la parte de esos
                días hábiles sobre un mes típico de 22 (un día pide 1/22).
            </p>
            <p><b>TV:</b></p>
            <ul className="list-disc space-y-1 pl-4">
                <li>Día: su meta diaria (15 Farmer, 35 Hunter).</li>
                <li>Semana: la meta diaria por los días hábiles de la semana (lunes a viernes).</li>
                <li>
                    Mes: llamar a los clientes de sus carteras (sin VNA). Si un Farmer y un Hunter comparten
                    una cartera, se la reparten según su meta diaria: el Hunter se lleva más clientes.
                </li>
            </ul>
            <p>No cuentan los días anteriores al arranque de Televentas.</p>
            <p>El mes en curso pide el mes entero, no solo los días que pasaron: el % sube a medida que avanza.</p>
        </div>
    )
}

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

    // Un tipo por vez: con Vendedor solo cuentan las visitas; con Farmer o Hunter, los llamados.
    const verVendedores = filtroTipo === 'vendedor'
    const verTvs = !verVendedores
    const tvsVisibles = (tvs.data?.tvs ?? []).filter(t => pasaFiltro([t.perfil ?? 'sin_perfil'], filtroTipo))
    const equipoTv = resumenTvs(tvsVisibles)
    const promedios = resumen.data?.promedios

    // Las dos fuentes son independientes: si una falla, la otra se sigue viendo (un back
    // anterior a /televentas/productividad no puede dejar a gerencia sin las visitas).
    const fuente = verVendedores ? resumen : tvs
    const cargando = fuente.isLoading
    const irAVendedor = (codigo: string) =>
        navigate(`/analitica/vendedor/${codigo}?${new URLSearchParams({ desde, hasta })}`)

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
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
                subtitulo={
                    verVendedores
                        ? 'Cada vendedor contra su objetivo de visitas válidas del período.'
                        : 'Cada TV contra su objetivo del período: llamar a los clientes de su parte de la cartera.'
                }
                derecha={
                    <HelpPopover label="Cómo se calcula el objetivo">
                        <AyudaObjetivo />
                    </HelpPopover>
                }
            >
                {cargando && <Cargando />}
                {resumen.isError && verVendedores && (
                    <ErrorBloque texto="No se pudieron cargar las visitas de los vendedores." onReintentar={() => resumen.refetch()} />
                )}
                {tvs.isError && verTvs && (
                    <ErrorBloque texto="No se pudieron cargar los llamados de Televentas." onReintentar={() => tvs.refetch()} />
                )}
                {!cargando && filas.length === 0 && !fuente.isError && (
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
                                    <Encabezado columna="actividad" orden={orden} onOrdenar={ordenarPor}>Logrado</Encabezado>
                                    <Encabezado columna="cumplimiento" orden={orden} onOrdenar={ordenarPor} className="pr-5">Cumplimiento</Encabezado>
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
                                            <p className="truncate font-semibold text-slate-900">{f.nombre}</p>
                                            {/* El código del vendedor es su alias (FEDE, VTA 1) y repite el nombre. */}
                                            {!f.esVendedor && <p className="text-[11px] text-slate-400">{f.codigo}</p>}
                                        </td>
                                        <td className={cn(CLASE_NUM, 'px-3 py-2.5 text-right')}>
                                            <span className="text-slate-900">
                                                {f.objetivo === null ? 's/d' : ENTERO.format(f.objetivo)}
                                            </span>
                                        </td>
                                        {/* Lo mismo que mide el %: visitas válidas o llamados contra el objetivo. */}
                                        <td className={cn(CLASE_NUM, 'px-3 py-2.5 text-right')}>
                                            <span className="font-semibold text-slate-900">{ENTERO.format(f.actividad)}</span>
                                            <p className="text-[11px] text-slate-400">{f.esVendedor ? 'visitas válidas' : 'llamados'}</p>
                                        </td>
                                        <td className="px-3 py-2.5 pr-5 text-right">
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
