import { Button } from '@/components/ui/button'

interface SeleccionBarProps {
    cantidad: number
    onCancelar: () => void
    onResolver: () => void
}

/** Pie fijo del sheet mientras hay rubros seleccionados en la lista — reemplaza al pie
 *  normal (Cerrar visita), igual que el wizard reemplaza el suyo. */
export default function SeleccionBar({ cantidad, onCancelar, onResolver }: SeleccionBarProps) {
    return (
        <div>
            <p className="mb-2 text-center text-[12.5px] font-bold text-[#182645]">
                {cantidad} {cantidad === 1 ? 'seleccionado' : 'seleccionados'}
            </p>
            <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onCancelar} className="h-12 flex-1 text-[13.5px] font-bold">
                    Cancelar
                </Button>
                <Button onClick={onResolver} className="h-12 flex-1 bg-dsnavy text-[13.5px] hover:bg-dsnavy/90">
                    Resolver seleccionados
                </Button>
            </div>
        </div>
    )
}
