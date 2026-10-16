import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fechaHoraNegocio } from '@/lib/fechas'
import type { IAltaRelevada } from '@/types/analitica'

interface VinculoFlexxusProps {
    alta: IAltaRelevada
    /** Sin handler (solo lectura) no se ofrece vincular. Devuelve el mensaje de error, o null si salió bien. */
    onVincular?: (codigo: string) => Promise<string | null>
}

/**
 * "Cliente en Flexxus" (spec api-vendedores 2026-09-23-vincular-alta): administración pega el
 * código del cliente que creó en Flexxus y la API mueve la ficha del alta a ese cliente. Tres
 * estados: vinculada (código, quién, cuándo), visitada sin vincular (input), y el resto (se
 * vincula después de la visita). Sin desvincular: fuera de alcance.
 */
export default function VinculoFlexxus({ alta, onVincular }: VinculoFlexxusProps) {
    const [codigo, setCodigo] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [vinculando, setVinculando] = useState(false)

    async function vincular() {
        if (!onVincular || codigo.trim() === '') return
        setVinculando(true)
        setError(null)
        const mensaje = await onVincular(codigo.trim())
        setVinculando(false)
        setError(mensaje)
    }

    return (
        <section>
            <h3 className="mb-2 text-[13px] font-semibold text-tinta-2">Cliente en Flexxus</h3>
            <div className="rounded-lg border border-linea px-3 py-3 text-sm">
                {alta.vinculo ? (
                    <div className="flex items-start gap-2">
                        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-estado-ok-texto" />
                        <div>
                            <p className="font-medium text-tinta">Vinculada al cliente {alta.vinculo.codigoParticularCliente}</p>
                            <p className="text-xs text-tinta-2">
                                {alta.vinculo.vinculadoPor} · {fechaHoraNegocio(alta.vinculo.vinculadoEn)}
                            </p>
                        </div>
                    </div>
                ) : alta.estado !== 'visitada' ? (
                    <p className="text-tinta-2">Se vincula después de la visita.</p>
                ) : onVincular ? (
                    <div className="space-y-2">
                        <p className="text-tinta-2">
                            Cuando lo des de alta en Flexxus, pegá acá su código: la ficha del comercio pasa al cliente.
                        </p>
                        <div className="flex gap-2">
                            <label htmlFor="vinculo-codigo" className="sr-only">Código de cliente en Flexxus</label>
                            <input
                                id="vinculo-codigo"
                                value={codigo}
                                onChange={e => setCodigo(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') void vincular() }}
                                maxLength={50}
                                placeholder="Código de cliente"
                                className="min-w-0 flex-1 rounded-md h-8 border border-linea bg-tarjeta px-2.5 text-sm text-tinta outline-none focus-visible:ring-2 focus-visible:ring-primario"
                            />
                            <Button onClick={vincular} disabled={vinculando || codigo.trim() === ''} loading={vinculando}>
                                Vincular
                            </Button>
                        </div>
                        {error && <p role="alert" className="text-xs text-estado-mal-texto">{error}</p>}
                    </div>
                ) : (
                    <p className="text-tinta-2">Sin vincular.</p>
                )}
            </div>
        </section>
    )
}
