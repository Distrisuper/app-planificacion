import { useState } from 'react'
import { Search } from 'lucide-react'
import { useTelevendedores, useVendedores } from '@/hooks/useAnalitica'
import { useVentasVendedores } from '@/hooks/useMetricasEquipo'
import {
    CLASE_TONO,
    CLASE_TONO_MES,
    formatVentas,
    sumarVendedores,
    tonoCelda,
    tonoDelMes,
    valorColumna,
    type ColumnaVentas,
    type VistaVentas,
} from '@/lib/facturacion'
import { avanceDelMes, proyectarMes } from '@/lib/proyeccionVentas'
import { clavesDeVendedores, pasaFiltro, tiposDeCartera, type FiltroTipo } from '@/lib/tipoPersona'
import { cn } from '@/lib/utils'
import type { IVentasVendedor } from '@/types/metricasEquipo'
import { CLASE_NUM, Cargando, Encabezado, ErrorBloque, Segmentado, Tarjeta, comparar, useOrden } from './ui'

type Columna = 'nombre' | ColumnaVentas

const VISTAS: { valor: VistaVentas; etiqueta: string; titulo: string }[] = [
    { valor: 'u', etiqueta: 'U', titulo: 'Ver en unidades' },
    { valor: '$', etiqueta: '$', titulo: 'Ver en pesos' },
    { valor: 'sr', etiqueta: 'SR', titulo: 'Ver super rubros con el mínimo cumplido' },
]

const COLUMNAS_PERIODO: { id: Exclude<ColumnaVentas, 'actual'>; etiqueta: string }[] = [
    { id: 'mant', etiqueta: 'M.ANT' },
    { id: 'p3m', etiqueta: 'P.3M' },
    { id: 'p6m', etiqueta: 'P.6M' },
    { id: 'p12m', etiqueta: 'P.12M' },
]

interface FacturacionVendedoresProps {
    filtroTipo: FiltroTipo
}

/**
 * Facturación por cartera, como "Vendedores · TODOS" de Versus: el mes en curso (ACTUAL, o
 * PROY = proyectado al cierre) contra el mes anterior y los promedios mensuales de 3, 6 y 12
 * meses. Cada celda se pinta contra P.6M (la referencia, que no se pinta). Las ventas son de
 * la CARTERA: lleva VENDEDOR si es de un vendedor de calle y el perfil de cada TV que la
 * atiende (ver tiposDeCartera).
 */
export default function FacturacionVendedores({ filtroTipo }: FacturacionVendedoresProps) {
    const [vista, setVista] = useState<VistaVentas>('$')
    const [modoMes, setModoMes] = useState<'actual' | 'proy'>('actual')
    const [buscar, setBuscar] = useState('')
    const { orden, ordenarPor } = useOrden<Columna>({ columna: 'p6m', dir: 'desc' })
    const { data, isLoading, isError, refetch } = useVentasVendedores()
    const televendedores = useTelevendedores()
    const tvs = televendedores.data
    const { data: roster } = useVendedores()
    const deCalle = clavesDeVendedores((roster ?? []).map(r => r.codigoParticularVendedor))

    const proyectado = modoMes === 'proy'
    const avance = avanceDelMes()
    const mes = (v: IVentasVendedor) => {
        const actual = valorColumna(v, 'actual', vista)
        return proyectado ? proyectarMes(actual) : actual
    }
    const valor = (v: IVentasVendedor, c: ColumnaVentas) => (c === 'actual' ? mes(v) : valorColumna(v, c, vista))

    const q = buscar.trim().toLowerCase()
    const filas = (data ?? [])
        .map(v => ({ v, tipos: tiposDeCartera(v.code, tvs, deCalle) }))
        .filter(({ tipos }) => pasaFiltro(tipos, filtroTipo))
        .filter(({ v }) => !q || v.name.toLowerCase().includes(q) || v.code.toLowerCase().includes(q))
    filas.sort((a, b) =>
        comparar(
            orden.columna === 'nombre' ? a.v.name : valor(a.v, orden.columna),
            orden.columna === 'nombre' ? b.v.name : valor(b.v, orden.columna),
            orden.dir,
        ),
    )
    const totales = sumarVendedores(filas.map(f => f.v))

    const celda = (v: IVentasVendedor, c: ColumnaVentas, fuerte = false) => {
        const n = valor(v, c)
        const esRef = c === 'p6m'
        const ref6m = valorColumna(v, 'p6m', vista)
        // El mes en curso se pinta con su proyección aunque se muestre lo vendido hasta hoy, y
        // siempre lleva color; los períodos cerrados no se pintan cerca de la referencia.
        const clase = esRef
            ? null
            : c === 'actual'
              ? CLASE_TONO_MES[tonoDelMes(valorColumna(v, 'actual', vista), ref6m)]
              : CLASE_TONO[tonoCelda(n, ref6m)]
        return (
            <td key={c} className={cn('px-2 py-1.5 text-right', esRef && 'bg-slate-50')}>
                <span
                    className={cn(
                        CLASE_NUM,
                        'inline-flex items-baseline gap-0.5 whitespace-nowrap rounded-lg px-2 py-1',
                        fuerte ? 'text-sm font-extrabold text-slate-900' : 'text-[13px]',
                        !fuerte && (clase ?? 'text-slate-700'),
                    )}
                >
                    {vista === '$' && <span className="text-[10px] font-medium opacity-60">$</span>}
                    {formatVentas(n, vista)}
                </span>
            </td>
        )
    }

    return (
        <Tarjeta
            titulo="Facturación por vendedor"
            subtitulo={
                proyectado
                    ? `PROY = el mes en curso llevado al cierre (${avance.transcurridos} de ${avance.totales} días hábiles). Los colores comparan contra P.6M.`
                    : 'El mes en curso contra el anterior y los promedios mensuales de 3, 6 y 12 meses. Los colores comparan contra P.6M.'
            }
            derecha={
                <>
                    <Segmentado
                        etiqueta="Mes en curso"
                        opciones={[
                            { valor: 'actual', etiqueta: 'Actual', titulo: 'Lo vendido en el mes hasta hoy' },
                            { valor: 'proy', etiqueta: 'PROY', titulo: 'Proyectado al cierre del mes' },
                        ]}
                        valor={modoMes}
                        onCambiar={setModoMes}
                    />
                    <Segmentado etiqueta="Unidad" opciones={VISTAS} valor={vista} onCambiar={setVista} />
                </>
            }
        >
            <label className="mb-4 flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm text-slate-500 focus-within:ring-2 focus-within:ring-dsnavy/30">
                <Search className="h-4 w-4" aria-hidden />
                <input
                    type="search"
                    value={buscar}
                    onChange={e => setBuscar(e.target.value)}
                    placeholder="Buscar vendedor o código…"
                    aria-label="Buscar vendedor"
                    className="w-full bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
            </label>

            {isLoading && <Cargando />}
            {isError && <ErrorBloque texto="No se pudo cargar la facturación." onReintentar={() => refetch()} />}
            {data && filas.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">
                    {q
                        ? `Ningún vendedor coincide con «${buscar}».`
                        : televendedores.isLoading
                          ? 'Cargando el tipo de cada cartera…'
                          : (data ?? []).every(v => tiposDeCartera(v.code, tvs, deCalle).length === 0)
                            ? 'El tipo de las carteras todavía no está disponible.'
                            : 'Sin ventas para mostrar.'}
                </p>
            )}

            {filas.length > 0 && (
                <div className="-mx-5 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="border-y border-slate-200 bg-slate-50/70">
                            <tr>
                                <th className="w-10 px-3 py-2.5" aria-label="Posición" />
                                <Encabezado columna="nombre" orden={orden} onOrdenar={ordenarPor} alinear="left">
                                    Vendedor · {filas.length}
                                </Encabezado>
                                <Encabezado columna="actual" orden={orden} onOrdenar={ordenarPor}>
                                    {proyectado ? 'PROY' : 'Actual'}
                                </Encabezado>
                                {COLUMNAS_PERIODO.map(c => (
                                    <Encabezado
                                        key={c.id}
                                        columna={c.id}
                                        orden={orden}
                                        onOrdenar={ordenarPor}
                                        className={cn(c.id === 'p6m' && 'bg-slate-100/80', c.id === 'p12m' && 'pr-5')}
                                    >
                                        {c.id === 'p6m' && (
                                            <span className="rounded bg-slate-200 px-1 py-px text-[9px] font-extrabold text-slate-600">REF</span>
                                        )}
                                        {c.etiqueta}
                                    </Encabezado>
                                ))}
                            </tr>
                            <tr className="border-t border-slate-200 bg-slate-100/60" data-testid="fila-totales">
                                <td />
                                <td className="px-3 py-2 text-left text-sm font-extrabold text-slate-900">TOTALES</td>
                                {celda(totales, 'actual', true)}
                                {COLUMNAS_PERIODO.map(c => celda(totales, c.id, true))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filas.map(({ v }, i) => (
                                <tr key={v.code} data-testid={`fila-facturacion-${v.code}`}>
                                    <td className={cn(CLASE_NUM, 'px-3 py-2 text-center text-xs text-slate-400')}>{i + 1}</td>
                                    <td className="max-w-[300px] px-3 py-2">
                                        <p title={v.name} className="truncate font-semibold text-slate-900">{v.name}</p>
                                        <p className="text-[11px] text-slate-400">{v.code}</p>
                                    </td>
                                    {celda(v, 'actual')}
                                    {COLUMNAS_PERIODO.map(c => celda(v, c.id))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Tarjeta>
    )
}
