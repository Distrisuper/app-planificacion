import { Fragment } from 'react'
import { Loader2 } from 'lucide-react'
import { fmtAmount } from '@/lib/fmtAmount'
import { totalesDe, type IRubroFila } from './filas'

interface RubroTableProps {
    filas: IRubroFila[]
    onResolucion?: (visitaRubroId: number) => void
    onAgregar?: (rubroCode: string) => void
    /** rubroCode cuya mutación de "agregar" está en vuelo: ese ＋ muestra spinner
     *  y queda deshabilitado. */
    agregandoCode?: string | null
}

function fmtCelda(valor: number | null) {
    return valor == null ? '–' : fmtAmount(valor)
}

function cae(valor: number | null, promedio6m: number | null): boolean {
    return promedio6m != null && promedio6m > 0 && valor != null && valor < promedio6m
}

function Celda({
    valor,
    promedio6m,
    referencia,
    emphasized,
}: {
    valor: number | null
    promedio6m: number | null
    referencia?: boolean
    emphasized?: boolean
}) {
    const rojo = !referencia && cae(valor, promedio6m)
    return (
        <td className="px-2 py-2.5 text-right">
            <span
                className={`inline-block rounded-md px-1.5 py-0.5 lining-nums tabular-nums slashed-zero whitespace-nowrap text-right ${
                    emphasized ? 'text-[13px] font-extrabold' : 'text-[12.5px] font-semibold'
                } ${referencia ? 'text-dsmuted' : rojo ? 'bg-[#FEECEC] text-dsred' : 'bg-[#F1F3F8] text-[#182645]'}`}
            >
                {fmtCelda(valor)}
            </span>
        </td>
    )
}

/** Tabla RUBRO · ACTUAL · M.ANT · PROM.6M compartida por la propuesta y la visita.
 *  Presentacional pura: no conoce visitas ni mutaciones, solo `filas` (ver
 *  `filas.ts`) y callbacks. */
export default function RubroTable({ filas, onResolucion, onAgregar, agregandoCode }: RubroTableProps) {
    const totales = totalesDe(filas)
    const mostrarColumnaAgregar = filas.some(f => f.agregable)
    const primerIndexNoDestacado = filas.findIndex(f => !f.destacada)

    return (
        <div className="overflow-hidden rounded-xl border border-dsline">
            <table className="w-full border-collapse text-[12.5px]">
                <thead>
                    <tr className="border-b border-dsline bg-[#F7F8FB] text-[10px] font-extrabold uppercase tracking-wide text-dsmuted">
                        <th className="px-2.5 py-2 text-left">Rubro</th>
                        <th className="px-2 py-2 text-right">Actual</th>
                        <th className="px-2 py-2 text-right">M.Ant</th>
                        <th className="px-2.5 py-2 text-right">
                            Prom.6M
                            <span className="ml-1 rounded bg-[#EEF1F6] px-1 py-0.5 text-[8.5px] font-extrabold text-dsmuted">
                                REF
                            </span>
                        </th>
                        {mostrarColumnaAgregar && <th className="w-8" />}
                    </tr>
                </thead>
                <tbody>
                    <tr className="border-b border-dsline bg-[#F7F8FB]">
                        <td className="px-2.5 py-2.5 text-[11px] font-extrabold uppercase tracking-wide text-[#182645]">
                            Totales
                        </td>
                        <Celda valor={totales.actual} promedio6m={totales.promedio6m} emphasized />
                        <Celda valor={totales.mesAnterior} promedio6m={totales.promedio6m} emphasized />
                        <Celda valor={totales.promedio6m} promedio6m={totales.promedio6m} referencia emphasized />
                        {mostrarColumnaAgregar && <td />}
                    </tr>

                    {filas.map((fila, i) => {
                        const separador = i === primerIndexNoDestacado && primerIndexNoDestacado > 0

                        return (
                            <Fragment key={fila.rubroCode}>
                                <tr className={`border-b border-dsline last:border-0 ${separador ? 'border-t-2 border-t-[#C7CEDC]' : ''}`}>
                                    <td
                                        className={`max-w-[110px] truncate px-2.5 py-2.5 text-[#182645] ${
                                            fila.destacada ? 'shadow-[inset_3px_0_0_0_#213D82] font-bold' : 'font-medium'
                                        }`}
                                    >
                                        {fila.nombre}
                                    </td>
                                    <Celda valor={fila.actual} promedio6m={fila.promedio6m} />
                                    <Celda valor={fila.mesAnterior} promedio6m={fila.promedio6m} />
                                    <Celda valor={fila.promedio6m} promedio6m={fila.promedio6m} referencia />
                                    {mostrarColumnaAgregar && (
                                        <td className="px-1 text-center">
                                            {fila.agregable && (
                                                <button
                                                    type="button"
                                                    aria-label={`Agregar ${fila.nombre}`}
                                                    disabled={agregandoCode === fila.rubroCode}
                                                    onClick={() => onAgregar?.(fila.rubroCode)}
                                                    className="grid h-7 w-7 place-items-center rounded-full border border-[#C9D2E3] text-dsnavy disabled:opacity-50"
                                                >
                                                    {agregandoCode === fila.rubroCode ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.4} />
                                                    ) : (
                                                        '+'
                                                    )}
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                                {fila.resolucion && (
                                    <tr className="border-b border-dsline last:border-0">
                                        <td colSpan={mostrarColumnaAgregar ? 5 : 4} className="px-2.5 pb-2.5">
                                            <button
                                                type="button"
                                                aria-label={`Resolución de ${fila.nombre}`}
                                                onClick={() => onResolucion?.(fila.resolucion!.visitaRubroId)}
                                                className={`h-9 w-full rounded-lg border text-[12px] font-bold ${
                                                    fila.resolucion.completo
                                                        ? 'border-[#BFE6CE] bg-[#F3FAF5] text-dsgreen'
                                                        : 'border-[#D8DEEA] text-dsnavy'
                                                }`}
                                            >
                                                {fila.resolucion.completo
                                                    ? `✓ ${fila.resolucion.motivosCargados} ${fila.resolucion.motivosCargados === 1 ? 'motivo' : 'motivos'} cargado${fila.resolucion.motivosCargados === 1 ? '' : 's'}`
                                                    : 'Resolución'}
                                            </button>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
