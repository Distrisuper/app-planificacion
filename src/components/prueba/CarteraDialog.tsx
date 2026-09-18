import { useState } from 'react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/context/AuthContext'
import { useVendedores } from '@/hooks/useAnalitica'
import { useReiniciarPrueba } from '@/hooks/usePrueba'
import { errorCode } from '@/lib/apiError'
import { supervisa } from '@/lib/roles'

interface CarteraDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Después de reiniciar con éxito (el caller navega/cierra). */
    onReiniciado: () => void
}

/**
 * "¿Con qué cartera querés arrancar?": el vendedor de prueba nace como FOTO del plan de un
 * vendedor real, o vacío. Sirve para la primera entrada y para cada "Reiniciar".
 *
 * El roster (nombres) solo lo tiene quien supervisa — `/analitica/vendedores` es de gerencia.
 * Un tester ve los códigos pelados, que alcanzan para elegir.
 */
export default function CarteraDialog({ open, onOpenChange, onReiniciado }: CarteraDialogProps) {
    const { capacidades, vendedorDePrueba } = useAuth()
    const puedeVerRoster = supervisa(capacidades)
    const { data: roster } = useVendedores({ enabled: puedeVerRoster })
    const reiniciar = useReiniciarPrueba()
    const origenes = vendedorDePrueba?.origenesDisponibles ?? []
    const [elegido, setElegido] = useState<string | null>(null)
    // Derivado, no snapshot: el diálogo está montado (cerrado) desde el primer render y
    // `origenesDisponibles` puede cambiar después (refrescarMe tras un reinicio). Si el
    // elegido dejó de existir, el <select> mostraría la primera opción mientras el estado
    // guardaba otra, y "Reiniciar" copiaría una cartera distinta de la que se ve.
    const origen = elegido !== null && (elegido === '' || origenes.includes(elegido)) ? elegido : origenes[0] ?? ''
    const [error, setError] = useState<string | null>(null)

    const nombreDe = (codigo: string) => {
        if (!puedeVerRoster) return codigo
        const v = roster?.find(r => r.codigoParticularVendedor.toUpperCase() === codigo.toUpperCase())
        return v ? `${v.nombreVendedor} (${codigo})` : codigo
    }

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="¿Con qué cartera querés arrancar?"
            confirmLabel="Reiniciar"
            destructivo
            onConfirm={async () => {
                setError(null)
                try {
                    await reiniciar.mutateAsync(origen === '' ? null : origen)
                } catch (e) {
                    // ORIGEN_INVALIDO: la cartera elegida dejó de tener plantilla entre que se
                    // abrió el diálogo y se confirmó. Lo demás es red/servidor.
                    setError(
                        errorCode(e) === 'ORIGEN_INVALIDO'
                            ? 'Esa cartera ya no está disponible. Elegí otra.'
                            : 'No pudimos reiniciar la prueba. Probá de nuevo.',
                    )
                    throw e // ConfirmDialog lo lee como "quedate abierto"
                }
                onReiniciado()
            }}
            description={
                <div className="space-y-3 text-left">
                    <label className="flex flex-col gap-1 text-[13px] font-semibold text-[#182645]">
                        Cartera
                        <select
                            aria-label="Cartera"
                            value={origen}
                            onChange={e => setElegido(e.target.value)}
                            className="rounded-md border border-dsline px-2 py-2 text-sm font-normal text-[#182645]"
                        >
                            {origenes.map(c => (
                                <option key={c} value={c}>{nombreDe(c)}</option>
                            ))}
                            <option value="">Arrancar vacío</option>
                        </select>
                    </label>
                    <p className="text-[13px] leading-snug text-dsmuted">
                        Se borran todas tus visitas de prueba y la agenda vuelve a empezar. Los datos
                        reales no se tocan.
                    </p>
                    {error && (
                        <p role="alert" className="text-[13px] font-semibold text-dsred">
                            {error}
                        </p>
                    )}
                </div>
            }
        />
    )
}
