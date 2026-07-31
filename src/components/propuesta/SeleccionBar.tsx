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
        <div className="flex items-center gap-2">
            <span className="flex-1 text-[13px] font-bold text-[#182645]">
                {cantidad} {cantidad === 1 ? 'seleccionado' : 'seleccionados'}
            </span>
            <Button variant="outline" onClick={onCancelar} className="h-11 text-[13px] font-bold">
                Cancelar
            </Button>
            <Button onClick={onResolver} className="h-11 bg-dsnavy text-[13px] hover:bg-dsnavy/90">
                Resolver seleccionados
            </Button>
        </div>
    )
}
