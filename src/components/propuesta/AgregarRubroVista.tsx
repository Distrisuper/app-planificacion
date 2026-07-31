import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CatalogoPicker from './CatalogoPicker'
import { useRubroCatalog } from '@/hooks/useCatalogos'
import { useAgregarRubro } from '@/hooks/useRubros'
import type { ICatalogoItem } from '@/types/planificacion'

interface AgregarRubroVistaProps {
    visitaId: number
    /** Codes ya presentes en la visita. El backend NO deduplica
     *  (VisitaRubroRepository.crearFueraDePropuesta hace un INSERT ciego, sin índice
     *  único): dos "Filtros" serían dos pendientes distintos y ambos trabarían el
     *  cierre de la semana. El front es el único que puede evitarlo. */
    codesEnVisita: string[]
    onVolver: () => void
    onAgregado: () => void
}

/** Alta de un rubro fuera de la propuesta. Se queda con su propia mutación en vez de
 *  subirla a VisitaSheet, que ya tiene cinco piezas de estado propias. */
export default function AgregarRubroVista({
    visitaId,
    codesEnVisita,
    onVolver,
    onAgregado,
}: AgregarRubroVistaProps) {
    // El catálogo se pide al montar, y esta vista solo se monta cuando el vendedor
    // abre el buscador: no hay que pagarlo en cada visita.
    const { data: catalogo = [], isLoading } = useRubroCatalog()
    const agregar = useAgregarRubro(visitaId)
    const [error, setError] = useState<string | null>(null)
    const [pendingCode, setPendingCode] = useState<string | null>(null)

    async function elegir(item: ICatalogoItem) {
        setError(null)
        setPendingCode(item.code)
        try {
            await agregar.mutateAsync({
                rubroCode: item.code,
                rubroDescripcion: item.description,
            })
            onAgregado()
        } catch {
            setError('Sin conexión. Volvé a intentar; no se perdió lo que cargaste.')
        } finally {
            setPendingCode(null)
        }
    }

    return (
        <div>
            <div className="mb-3.5 flex items-center gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    aria-label="Volver"
                    onClick={onVolver}
                    className="h-[29px] w-[29px] border-[#E1E6F0] text-dsmuted"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
                <span className="text-[13px] font-bold text-[#182645]">Agregar rubro</span>
            </div>

            {error && (
                <p className="mb-2.5 rounded-[10px] bg-[#FEECEC] px-3 py-2 text-[12.5px] font-semibold text-dsred">
                    {error}
                </p>
            )}

            <CatalogoPicker
                items={catalogo}
                loading={isLoading}
                excluir={codesEnVisita}
                pendingCode={pendingCode}
                onSelect={elegir}
                placeholder="Buscar rubro…"
                autoFocus
            />
        </div>
    )
}
