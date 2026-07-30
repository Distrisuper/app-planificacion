import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ResolucionRubro from './ResolucionRubro'
import { motivoIncompleto, motivosIguales } from '@/lib/resolucionRubro'
import type { IMotivo, IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

interface ResolucionWizardProps {
    /** Subconjunto fijo de rubros que se está recorriendo (ya filtrado por el llamador). */
    rubros: IVisitaRubro[]
    /** Posición actual dentro de `rubros`. */
    index: number
    motivos: IMotivo[]
    /** Borrador en memoria por rubroId — lo que el vendedor tildó, guardado o no. */
    borradores: Record<number, IRubroMotivo[]>
    /** Última versión CONFIRMADA por el servidor por rubroId — contra esto se calculan
     *  los cambios pendientes. */
    guardados: Record<number, IRubroMotivo[]>
    /** rubroId -> mensaje de error, para los que fallaron en el último intento de guardado. */
    fallidos: Record<number, string>
    guardando?: boolean
    onIndexChange: (index: number) => void
    onCambiarBorrador: (rubroId: number, motivos: IRubroMotivo[]) => void
    onGuardarTodo: () => void
    onVolver: () => void
}

export default function ResolucionWizard({
    rubros,
    index,
    motivos,
    borradores,
    guardados,
    fallidos,
    guardando,
    onIndexChange,
    onCambiarBorrador,
    onGuardarTodo,
    onVolver,
}: ResolucionWizardProps) {
    const rubro = rubros[index]

    // Contra `guardados`, no contra `rubros[i].motivos`: ese último queda congelado al
    // abrir el wizard, así que un guardado exitoso a mitad de recorrido no lo actualiza.
    const pendientes = rubros.filter(r => !motivosIguales(borradores[r.id] ?? [], guardados[r.id] ?? []))

    let bloqueado: IVisitaRubro | null = null
    let motivoBloqueante: IMotivo | null = null
    for (const r of pendientes) {
        const m = motivoIncompleto(motivos, borradores[r.id] ?? [])
        if (m) {
            bloqueado = r
            motivoBloqueante = m
            break
        }
    }
    const bloqueadoIndex = bloqueado ? rubros.findIndex(r => r.id === bloqueado!.id) : -1

    const fallidosRubros = rubros.filter(r => fallidos[r.id])
    const hayFallidos = fallidosRubros.length > 0
    const puedeGuardar = pendientes.length > 0 && !bloqueado

    return (
        <div>
            <div className="mb-1 flex items-center justify-between gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={onVolver}
                    aria-label="Volver"
                    className="h-[29px] w-[29px] border-[#E1E6F0] text-dsmuted"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
                <span className="text-[12.5px] font-bold text-dsmuted">
                    {index + 1} de {rubros.length}
                </span>
            </div>

            <ResolucionRubro
                rubro={rubro}
                motivos={motivos}
                value={borradores[rubro.id] ?? []}
                onChange={m => onCambiarBorrador(rubro.id, m)}
            />

            <div className="mt-4 flex items-center gap-2">
                <Button
                    variant="outline"
                    disabled={index === 0}
                    onClick={() => onIndexChange(index - 1)}
                    className="h-11 flex-1 text-[13.5px] font-bold"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                    Atrás
                </Button>
                <Button
                    variant="outline"
                    disabled={index === rubros.length - 1}
                    onClick={() => onIndexChange(index + 1)}
                    className="h-11 flex-1 text-[13.5px] font-bold"
                >
                    Siguiente
                    <ChevronRight className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
            </div>

            {bloqueado && motivoBloqueante && (
                <p className="mt-2 text-[12.5px] font-semibold text-[#B45309]">
                    Completá el detalle de {motivoBloqueante.descripcion} en {bloqueado.rubroDescripcion} (rubro{' '}
                    {bloqueadoIndex + 1} de {rubros.length}).
                </p>
            )}

            {hayFallidos && (
                <p className="mt-2 text-[12.5px] font-semibold text-dsred">
                    No se pudo guardar: {fallidosRubros.map(r => r.rubroDescripcion).join(', ')}.
                </p>
            )}

            <Button
                onClick={onGuardarTodo}
                disabled={!puedeGuardar}
                loading={guardando}
                className={`mt-2 h-12 w-full text-[14.5px] ${
                    hayFallidos ? 'bg-dsred hover:bg-dsred/90' : 'bg-dsgreen hover:bg-dsgreen/90'
                }`}
            >
                {guardando
                    ? 'Guardando…'
                    : hayFallidos
                      ? `Reintentar (${pendientes.length})`
                      : pendientes.length > 0
                        ? `Guardar todo (${pendientes.length})`
                        : 'Guardar todo'}
            </Button>
        </div>
    )
}
