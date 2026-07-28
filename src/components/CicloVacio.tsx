import { CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CicloVacioProps {
    semana: number
    clientes: number
    omitidos: string[]
    abriendo?: boolean
    onAbrir: () => void
}

/**
 * Estado sin vuelta abierta. Los clientes ya se ven en el board de atrás (en preview):
 * este bloque es la decisión, no la lista.
 *
 * `omitidos` se muestra ACÁ y no después de abrir a propósito: abrir congela el plan y
 * no hay forma de descartarlo desde la app, así que enterarse de los faltantes tiene que
 * pasar antes de la única acción irreversible del flujo.
 */
export default function CicloVacio({
    semana,
    clientes,
    omitidos,
    abriendo,
    onAbrir,
}: CicloVacioProps) {
    return (
        <div className="shrink-0 border-t border-dsline bg-white px-4 py-3">
            <p className="text-[13px] font-semibold text-[#182645]">
                No tenés una semana abierta. Al abrirla se congela el plan de visitas.
            </p>
            {omitidos.length > 0 && (
                <p className="mt-1 text-[12px] font-semibold text-[#B45309]">
                    {omitidos.length}{' '}
                    {omitidos.length === 1
                        ? 'cliente asignado no existe en el padrón y no va a entrar'
                        : 'clientes asignados no existen en el padrón y no van a entrar'}
                    .
                </p>
            )}
            <Button
                onClick={onAbrir}
                disabled={abriendo || clientes === 0}
                className="mt-2.5 h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
            >
                <CalendarPlus className="h-[15px] w-[15px]" strokeWidth={2.2} />
                {abriendo ? 'Abriendo…' : `Abrir semana ${semana} · ${clientes} clientes`}
            </Button>
        </div>
    )
}
