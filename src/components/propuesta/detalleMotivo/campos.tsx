import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import CatalogoPicker from '../CatalogoPicker'
import { useCampoNumero } from './numero'
import type { ValoresMotivo } from './validadores'
import type { ICampoMotivo, ICatalogoItem } from '@/types/planificacion'

const INPUT =
    'w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none'
const LABEL = 'text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]'

export interface IPropsCampo {
    declaracion: ICampoMotivo
    valor: ValoresMotivo[string]
    onChange: (valor: string | number | null) => void
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
}

/** El label, con la unidad entre paréntesis cuando la declaración la trae: "Mi precio ($)".
 *  Es lo único que consume `unidad` hoy. */
function textoLabel(declaracion: ICampoMotivo): string {
    return declaracion.unidad
        ? `${declaracion.label} (${declaracion.unidad})`
        : declaracion.label
}

// Cada tipo es su propio componente a propósito: `useCampoNumero` y el `useState` del
// buscador son hooks, y llamarlos desde un switch dentro de un .map violaría las reglas de
// hooks (el orden de llamada cambiaría según los campos declarados).
function CampoNumero({ declaracion, valor, onChange }: IPropsCampo) {
    const [texto, onChangeTexto] = useCampoNumero(valor as number | null, onChange)

    return (
        <label className="flex min-w-0 flex-col gap-1">
            <span className={LABEL}>{textoLabel(declaracion)}</span>
            <input
                value={texto}
                onChange={e => onChangeTexto(e.target.value)}
                inputMode="decimal"
                placeholder={declaracion.placeholder ?? undefined}
                className={INPUT}
            />
        </label>
    )
}

function CampoTexto({ declaracion, valor, onChange }: IPropsCampo) {
    return (
        <label className="flex flex-col gap-1">
            <span className={LABEL}>{textoLabel(declaracion)}</span>
            <input
                value={(valor as string) ?? ''}
                onChange={e => onChange(e.target.value)}
                placeholder={declaracion.placeholder ?? undefined}
                className={INPUT}
            />
        </label>
    )
}

function CampoTextarea({ declaracion, valor, onChange }: IPropsCampo) {
    return (
        <label className="flex flex-col gap-1">
            <span className={LABEL}>{textoLabel(declaracion)}</span>
            <textarea
                value={(valor as string) ?? ''}
                onChange={e => onChange(e.target.value)}
                placeholder={declaracion.placeholder ?? undefined}
                rows={2}
                className={INPUT}
            />
        </label>
    )
}

/** La marca sale del catálogo y no de un input libre: restringirla es lo único que hace
 *  agregable esa columna (con texto libre conviven "Fric Rot", "fricrot" y "FRIC-ROT"). */
function CampoCatalogoMarca({
    declaracion,
    valor,
    onChange,
    marcas,
    marcasLoading,
}: IPropsCampo) {
    const [buscadorAbierto, setBuscadorAbierto] = useState(false)

    return (
        <div className="flex flex-col gap-1">
            <span className={LABEL}>{textoLabel(declaracion)}</span>
            {buscadorAbierto ? (
                <CatalogoPicker
                    items={marcas}
                    loading={marcasLoading}
                    value={(valor as string) ?? null}
                    onSelect={item => {
                        onChange(item.description)
                        setBuscadorAbierto(false)
                    }}
                    placeholder="Buscar marca…"
                    autoFocus
                    ocultarContadorRestantes
                />
            ) : (
                <button
                    type="button"
                    aria-label={textoLabel(declaracion)}
                    onClick={() => setBuscadorAbierto(true)}
                    className="flex w-full items-center gap-2 rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-left"
                >
                    <span
                        className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                            valor ? 'text-[#182645]' : 'text-[#8A93A6]'
                        }`}
                    >
                        {(valor as string) ?? 'Elegí una marca'}
                    </span>
                    {valor && (
                        <Check className="h-4 w-4 shrink-0 text-[#213D82]" strokeWidth={3} />
                    )}
                    <ChevronDown className="h-4 w-4 shrink-0 text-dsmuted" strokeWidth={2.4} />
                </button>
            )}
        </div>
    )
}

/** Un input según el `tipo` declarado. Un tipo desconocido devuelve `null`: la declaración va
 *  por delante de este deploy, y no dibujarlo es mejor que dibujarlo mal — un `numero`
 *  renderizado como texto aterrizaría en la columna equivocada. */
export function CampoMotivo(props: IPropsCampo) {
    switch (props.declaracion.tipo) {
        case 'numero':
            return <CampoNumero {...props} />
        case 'texto':
            return <CampoTexto {...props} />
        case 'textarea':
            return <CampoTextarea {...props} />
        case 'catalogo_marca':
            return <CampoCatalogoMarca {...props} />
        default:
            return null
    }
}
