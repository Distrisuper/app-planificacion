import { CampoMotivo } from './campos'
import { registroDerivado } from './derivados'
import type { ValoresMotivo } from './validadores'
import type { ICatalogoItem, IMotivo } from '@/types/planificacion'

const TONO: Record<string, string> = {
    bueno: 'bg-[#EAFBF1] text-[#047857]',
    advertencia: 'bg-[#FEF9E8] text-[#B45309]',
}

interface DetalleMotivoProps {
    motivo: IMotivo
    valores: ValoresMotivo
    /** Recibe SOLO el campo que cambió; el llamador hace el merge. */
    onChange: (parcial: ValoresMotivo) => void
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
}

/** El detalle de un motivo, dibujado desde su declaración. Reemplaza a los cuatro Editors
 *  hardcodeados: agregar o quitar un campo dejó de ser un cambio de código. */
export default function DetalleMotivo({
    motivo,
    valores,
    onChange,
    marcas,
    marcasLoading,
}: DetalleMotivoProps) {
    // `campos` viene ordenado por el back; acá no se reordena.
    const derivar = motivo.codigo ? registroDerivado[motivo.codigo] : undefined
    const derivado = derivar ? derivar(valores) : null

    return (
        <div className="flex flex-col gap-2.5">
            {motivo.campos.map(declaracion => (
                <CampoMotivo
                    key={declaracion.campo}
                    declaracion={declaracion}
                    valor={valores[declaracion.campo] ?? null}
                    onChange={valor => onChange({ [declaracion.campo]: valor })}
                    marcas={marcas}
                    marcasLoading={marcasLoading}
                />
            ))}

            {derivado && (
                <p
                    className={`rounded-[10px] px-3 py-2 text-center text-[12.5px] font-bold ${
                        TONO[derivado.tono]
                    }`}
                >
                    {derivado.texto}
                </p>
            )}
        </div>
    )
}
