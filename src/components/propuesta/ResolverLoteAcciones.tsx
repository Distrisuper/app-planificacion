import { Button } from '@/components/ui/button'
import { motivoIncompleto } from '@/lib/resolucionRubro'
import type { IMotivo, IRubroMotivo } from '@/types/planificacion'

interface ResolverLoteAccionesProps {
    motivos: IMotivo[]
    value: IRubroMotivo[]
    cantidad: number
    onCancelar: () => void
    onAplicar: () => void
}

/** Pie fijo de ResolverLoteVista: Cancelar / Aplicar a N rubros. Bloquea Aplicar si
 *  no hay nada tildado, o si "Precio" está tildado sin marca/competidor/% —
 *  misma regla que ya usa el wizard individual. */
export default function ResolverLoteAcciones({
    motivos,
    value,
    cantidad,
    onCancelar,
    onAplicar,
}: ResolverLoteAccionesProps) {
    const bloqueante = motivoIncompleto(motivos, value)

    return (
        <div>
            <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onCancelar} className="h-12 flex-1 text-[13.5px] font-bold">
                    Cancelar
                </Button>
                <Button
                    onClick={onAplicar}
                    disabled={!!bloqueante || value.length === 0}
                    className="h-12 flex-1 bg-dsgreen text-[13.5px] hover:bg-dsgreen/90"
                >
                    Aplicar a {cantidad} {cantidad === 1 ? 'rubro' : 'rubros'}
                </Button>
            </div>

            {bloqueante && (
                <p className="mt-2 text-[12.5px] font-semibold text-[#B45309]">
                    Completá el detalle de {bloqueante.descripcion} antes de aplicar.
                </p>
            )}
        </div>
    )
}
