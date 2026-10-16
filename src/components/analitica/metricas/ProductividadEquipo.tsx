import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import EstadoVista from '@/components/ui/EstadoVista'
import { FilaKpi, Kpi } from '@/components/ui/Kpi'
import Panel from '@/components/ui/Panel'
import Pill, { TONO_PILL } from '@/components/ui/Pill'
import TablaDatos from '@/components/ui/tabla/TablaDatos'
import { definirColumnas } from '@/components/ui/tabla/columnas'
import { useResumen } from '@/hooks/useAnalitica'
import { useProductividadTv } from '@/hooks/useMetricasEquipo'
import { formatPct } from '@/lib/analiticaFormat'
import { tonoCumplimiento } from '@/lib/misMetricas'
import { filaDeTv, filaDeVendedor, resumenTvs, type IFilaProductividad } from '@/lib/productividadEquipo'
import { titleCaseNombre } from '@/lib/textFormat'
import { pasaFiltro, type FiltroTipo } from '@/lib/tipoPersona'

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

/** El semáforo con texto: el mismo de "Mis métricas" del vendedor (`tonoCumplimiento`). */
const TEXTO_TONO = { ok: '80% o más', medio: 'entre 50% y 79%', bajo: 'bajo 50%', neutro: 'sin objetivo' } as const

function PillCumplimiento({ pct }: { pct: number | null }) {
    const tono = tonoCumplimiento(pct)
    return <Pill tono={TONO_PILL[tono]}>{TEXTO_TONO[tono]}</Pill>
}

interface FilaTabla extends IFilaProductividad {
    /** El nombre en title case (el backend lo manda en mayúsculas). */
    nombreVisible: string
    /** Objetivo − logrado, nunca negativo. null = sin objetivo (s/d). */
    faltan: number | null
}

const aFilaTabla = (f: IFilaProductividad): FilaTabla => ({
    ...f,
    nombreVisible: titleCaseNombre(f.nombre),
    faltan: f.objetivo === null ? null : Math.max(0, f.objetivo - f.actividad),
})

/** El objetivo, si es el mismo (redondeado) para todas las filas: va al subtítulo y no se repite en
 *  cada fila. Con una fila sin objetivo (s/d) o con objetivos distintos (los TV), queda la columna. */
function objetivoComun(filas: FilaTabla[]): number | null {
    if (filas.length === 0 || filas.some(f => f.objetivo === null)) return null
    const primero = Math.round(filas[0].objetivo!)
    return filas.every(f => Math.round(f.objetivo!) === primero) ? primero : null
}

/** Un vendedor sin objetivo no es "sin objetivo": con 0 visitas el % es 0 y el objetivo no se puede
 *  invertir. Dejarlo afuera de los totales los inflaría (40 + 40 + 0 de 120 daría 100%), así que
 *  con alguno así los totales que dependen del objetivo quedan en s/d. */
const objetivoDesconocido = (filas: FilaTabla[]) => filas.some(f => f.esVendedor && f.objetivo === null)

/** Suma de una columna que depende del objetivo, fila por fila redondeada como se ve. */
const sumaConObjetivo = (valor: (f: FilaTabla) => number | null) => (filas: FilaTabla[]) =>
    objetivoDesconocido(filas) ? null : filas.reduce((s, f) => s + Math.round(valor(f) ?? 0), 0)

/** El cumplimiento de las filas que se ven: lo logrado contra lo pedido, solo de las que tienen
 *  objetivo (no el promedio de porcentajes), como `resumenTvs`. */
function cumplimientoTotal(filas: FilaTabla[]): number | null {
    if (objetivoDesconocido(filas)) return null
    const conObjetivo = filas.filter(f => f.objetivo !== null && f.objetivo > 0)
    const objetivo = conObjetivo.reduce((s, f) => s + f.objetivo!, 0)
    return objetivo > 0 ? conObjetivo.reduce((s, f) => s + f.actividad, 0) / objetivo : null
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

    // Un tipo por vez: con Vendedor solo cuentan las visitas; con Farmer o Hunter, los llamados.
    const verVendedores = filtroTipo === 'vendedor'
    const verTvs = !verVendedores
    const filas = useMemo(
        () =>
            [...(resumen.data?.vendedores ?? []).map(filaDeVendedor), ...(tvs.data?.tvs ?? []).map(filaDeTv)]
                .filter(f => pasaFiltro([f.tipo], filtroTipo))
                .map(aFilaTabla),
        [resumen.data, tvs.data, filtroTipo],
    )
    const tvsVisibles = (tvs.data?.tvs ?? []).filter(t => pasaFiltro([t.perfil ?? 'sin_perfil'], filtroTipo))
    const equipoTv = resumenTvs(tvsVisibles)
    const promedios = resumen.data?.promedios
    const pctVisitas = promedios?.pctCumplimientoVisitas == null ? null : promedios.pctCumplimientoVisitas / 100

    const comun = objetivoComun(filas)
    const conColumnaObjetivo = comun === null
    const columnas = useMemo(
        () =>
            definirColumnas<FilaTabla>(c => [
                c.texto('nombre', 'Persona', f => f.nombreVisible, {
                    // El código del vendedor es su alias (FEDE, VTA 1) y repite el nombre.
                    secundaria: f => (f.esVendedor ? null : f.codigo),
                }),
                ...(conColumnaObjetivo ? [c.cantidad('objetivo', 'Objetivo', f => f.objetivo, { total: sumaConObjetivo(f => f.objetivo) })] : []),
                // Lo mismo que mide el %: visitas válidas o llamados contra el objetivo. La unidad va
                // en el encabezado y no en cada fila.
                c.cantidad('actividad', verVendedores ? 'Visitas válidas' : 'Llamados', f => f.actividad, {
                    total: 'suma',
                    ancho: 136,
                }),
                c.cantidad('faltan', 'Faltan', f => f.faltan, { total: sumaConObjetivo(f => f.faltan) }),
                c.porcentaje('cumplimiento', 'Cumplimiento', f => f.cumplimiento, {
                    tono: v => TONO_PILL[tonoCumplimiento(v)],
                    total: cumplimientoTotal,
                    ancho: 124,
                }),
            ]),
        [verVendedores, conColumnaObjetivo],
    )

    // Las dos fuentes son independientes: si una falla, la otra se sigue viendo (un back
    // anterior a /televentas/productividad no puede dejar a gerencia sin las visitas).
    const fuente = verVendedores ? resumen : tvs
    const irAVendedor = (codigo: string) =>
        navigate(`/analitica/vendedor/${codigo}?${new URLSearchParams({ desde, hasta })}`)

    return (
        <div className="flex flex-col gap-4">
            <FilaKpi>
                {verVendedores && (
                    <>
                        <Kpi
                            etiqueta="Cumplimiento de visitas"
                            valor={promedios ? formatPct(pctVisitas) : '…'}
                            pie={
                                promedios ? (
                                    <>
                                        <PillCumplimiento pct={pctVisitas} /> promedio del equipo
                                    </>
                                ) : (
                                    'promedio del equipo'
                                )
                            }
                            ayuda="Promedio de lo logrado sobre el objetivo de visitas válidas del período, de todos los vendedores."
                        />
                        <Kpi
                            etiqueta="Efectividad"
                            valor={promedios ? formatPct(promedios.efectividadComercial) : '…'}
                            pie="ganados / ofrecidos"
                            ayuda="Ofrecimientos ganados sobre ofrecidos en el período."
                        />
                    </>
                )}
                {verTvs && (
                    <>
                        <Kpi
                            etiqueta="Cumplimiento de llamados"
                            valor={tvs.data ? formatPct(equipoTv.cumplimiento) : '…'}
                            pie={
                                tvs.data ? (
                                    <>
                                        <PillCumplimiento pct={equipoTv.cumplimiento} />
                                        {ENTERO.format(equipoTv.llamados)} llamados de {ENTERO.format(equipoTv.objetivo)}
                                    </>
                                ) : undefined
                            }
                            ayuda="Llamados del equipo sobre la suma de los objetivos del período, solo de los TV que tienen objetivo."
                        />
                        <Kpi
                            etiqueta="Contacto"
                            valor={tvs.data ? formatPct(equipoTv.tasaContacto) : '…'}
                            pie={tvs.data ? `atendidos / llamados · ${ENTERO.format(equipoTv.conVenta)} con venta` : undefined}
                            ayuda="Llamados atendidos sobre llamados hechos en el período."
                        />
                    </>
                )}
            </FilaKpi>

            <Panel
                titulo="Productividad por persona"
                subtitulo={
                    comun !== null
                        ? `Objetivo: ${ENTERO.format(comun)} ${verVendedores ? 'visitas válidas' : 'llamados'} por persona`
                        : verVendedores
                          ? 'Cada vendedor contra su objetivo de visitas válidas del período.'
                          : 'Cada TV contra su objetivo del período: llamar a los clientes de su parte de la cartera.'
                }
                ayuda={<AyudaObjetivo />}
                etiquetaAyuda="Cómo se calcula el objetivo"
            >
                {fuente.isLoading && <EstadoVista estado="cargando" />}
                {fuente.isError && (
                    <EstadoVista
                        estado="error"
                        titulo={
                            verVendedores
                                ? 'No se pudieron cargar las visitas de los vendedores.'
                                : 'No se pudieron cargar los llamados de Televentas.'
                        }
                        texto="El servidor no respondió. Los filtros siguen aplicados."
                        onReintentar={() => fuente.refetch()}
                    />
                )}
                {!fuente.isLoading && !fuente.isError && filas.length === 0 && (
                    <EstadoVista
                        estado="vacio"
                        titulo="Sin actividad en este período."
                        texto="Probá con otro período o con otro tipo de persona."
                    />
                )}
                {filas.length > 0 && (
                    <TablaDatos
                        datos={filas}
                        columnas={columnas}
                        getRowId={f => f.clave}
                        etiqueta="Productividad por persona"
                        numerar
                        ordenInicial={{ id: 'cumplimiento', desc: true }}
                        onClickFila={f => irAVendedor(f.codigo)}
                        // Solo el vendedor tiene detalle (/analitica/vendedor/:codigo).
                        filaClicable={f => f.esVendedor}
                        etiquetaFila={f => `Ver el detalle de ${f.nombreVisible}`}
                        testIdFila={f => `fila-productividad-${f.codigo}`}
                    />
                )}
            </Panel>
        </div>
    )
}
