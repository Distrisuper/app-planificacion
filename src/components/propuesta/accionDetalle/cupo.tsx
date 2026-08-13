import { DollarSign, Percent, Plus, Trash2 } from 'lucide-react'

export interface ICupoTramo {
    umbral: number
    descuentoPct: number
}

export interface ICupoDetalle {
    tramos: ICupoTramo[]
}

const FMT_UMBRAL = new Intl.NumberFormat('es-AR')
const TRAMO_VACIO: ICupoTramo = { umbral: 0, descuentoPct: 0 }

function tramoValido(t: ICupoTramo): boolean {
    return t.umbral > 0 && t.descuentoPct > 0
}

/** Al menos un tramo, y todos válidos: un tramo a medio cargar no debería habilitar
 *  "Agregar" en AgregarOfrecimientoSheet. */
export function esValidoCupo(detalle: ICupoDetalle | undefined): boolean {
    return !!detalle && detalle.tramos.length > 0 && detalle.tramos.every(tramoValido)
}

/** "$2.500.000→3% · $3.200.000→5%". Se llama solo con `detalle` ya cargado (ver
 *  OfrecimientoTable), así que no contempla formatear tramos incompletos. */
export function resumenCupo(detalle: ICupoDetalle): string {
    return detalle.tramos
        .map(t => `$${FMT_UMBRAL.format(t.umbral)}→${t.descuentoPct}%`)
        .join(' · ')
}

interface EditorCupoProps {
    value: ICupoDetalle | undefined
    onChange: (detalle: ICupoDetalle) => void
}

/** Lista editable de tramos (umbral → % descuento). Arranca con un tramo vacío la
 *  primera vez que se muestra: el vendedor no tiene que tocar "Agregar tramo" para
 *  cargar el caso más común (un solo tramo, según la evidencia de Cromo).
 *
 *  Una fila por tramo, con íconos ($ / %) en vez de un label de texto por campo: con
 *  varios tramos, "Tramo N · Alcanza $" / "Tramo N · Descuento" repetido se comía la
 *  pantalla. El texto sigue disponible como aria-label, no se pierde para lectores de
 *  pantalla ni para los tests que buscan por label. */
export function EditorCupo({ value, onChange }: EditorCupoProps) {
    const tramos = value?.tramos ?? [TRAMO_VACIO]

    function actualizar(i: number, campo: keyof ICupoTramo, valor: string) {
        const siguiente = tramos.map((t, idx) =>
            idx === i
                ? { ...t, [campo]: valor === '' ? 0 : Number(valor.replace(/[^0-9.]/g, '')) }
                : t,
        )
        onChange({ tramos: siguiente })
    }

    function agregar() {
        onChange({ tramos: [...tramos, TRAMO_VACIO] })
    }

    function quitar(i: number) {
        const siguiente = tramos.filter((_, idx) => idx !== i)
        onChange({ tramos: siguiente.length > 0 ? siguiente : [TRAMO_VACIO] })
    }

    return (
        <div className="mt-2 flex flex-col gap-1.5 rounded-[10px] border-[1.5px] border-[#E4E8F0] bg-white p-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                Tramos del cupo
            </span>
            {tramos.map((tramo, i) => (
                <div key={i} className="flex items-center gap-1.5">
                    <span className="w-3.5 shrink-0 text-center text-[11px] font-bold text-dsmuted">
                        {i + 1}
                    </span>
                    <div className="flex flex-1 items-center gap-1 rounded-lg border border-[#E1E6F0] px-2 py-1.5">
                        <DollarSign className="h-3.5 w-3.5 shrink-0 text-dsmuted" strokeWidth={2.4} />
                        <input
                            aria-label={`Tramo ${i + 1} · Alcanza $`}
                            value={tramo.umbral || ''}
                            onChange={e => actualizar(i, 'umbral', e.target.value)}
                            inputMode="decimal"
                            placeholder="Alcanza"
                            className="w-full min-w-0 bg-transparent text-right text-sm font-extrabold text-dsnavy outline-none placeholder:font-semibold placeholder:text-dsmuted"
                        />
                    </div>
                    <div className="flex w-[64px] shrink-0 items-center gap-1 rounded-lg border border-[#E1E6F0] px-2 py-1.5">
                        <input
                            aria-label={`Tramo ${i + 1} · Descuento`}
                            value={tramo.descuentoPct || ''}
                            onChange={e => actualizar(i, 'descuentoPct', e.target.value)}
                            inputMode="decimal"
                            placeholder="0"
                            className="w-full min-w-0 bg-transparent text-right text-sm font-extrabold text-dsnavy outline-none"
                        />
                        <Percent className="h-3.5 w-3.5 shrink-0 text-dsmuted" strokeWidth={2.4} />
                    </div>
                    {tramos.length > 1 && (
                        <button
                            type="button"
                            aria-label={`Quitar tramo ${i + 1}`}
                            onClick={() => quitar(i)}
                            className="shrink-0 text-dsred"
                        >
                            <Trash2 className="h-4 w-4" strokeWidth={2} />
                        </button>
                    )}
                </div>
            ))}
            <button
                type="button"
                onClick={agregar}
                className="flex items-center justify-center gap-1 text-[12.5px] font-bold text-dsnavy"
            >
                <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                Agregar tramo
            </button>
        </div>
    )
}
