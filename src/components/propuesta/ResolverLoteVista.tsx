import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ResolucionRubro from './ResolucionRubro'
import type { ICatalogoItem, IMotivo, IRubroMotivo } from '@/types/planificacion'

interface ResolverLoteVistaProps {
    motivos: IMotivo[]
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
    cantidad: number
    /** Borrador ÚNICO compartido por todos los rubros seleccionados — no uno por
     *  rubro, a diferencia del wizard individual. */
    value: IRubroMotivo[]
    onChange: (motivos: IRubroMotivo[]) => void
    onVolver: () => void
}

/** Mismo checklist que el wizard individual (ResolucionRubro), pero con un solo
 *  borrador compartido: lo que se tilde acá se fusiona en los N rubros seleccionados
 *  al confirmar (ver VisitaSheet.aplicarLote). */
export default function ResolverLoteVista({
    motivos,
    marcas,
    marcasLoading,
    cantidad,
    value,
    onChange,
    onVolver,
}: ResolverLoteVistaProps) {
    return (
        <div>
            <div className="sticky top-0 z-10 -mx-[18px] mb-3 flex items-center gap-2 border-b border-[#EEF0F5] bg-white px-[18px] pb-2.5">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={onVolver}
                    aria-label="Volver"
                    className="h-[29px] w-[29px] shrink-0 border-[#E1E6F0] text-dsmuted"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
                <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-[#182645]">
                    Resolver {cantidad} {cantidad === 1 ? 'rubro' : 'rubros'}
                </span>
            </div>

            <ResolucionRubro
                motivos={motivos}
                marcas={marcas}
                marcasLoading={marcasLoading}
                value={value}
                onChange={onChange}
            />
        </div>
    )
}
