import { useState } from 'react'
import { Pencil } from 'lucide-react'

interface DescripcionInlineProps {
    valor: string | null
    placeholder: string
    /** Nombre accesible del botón de editar, ej. "Nombrar semana 2". */
    etiquetaAccesible: string
    /** null = borrar el nombre. */
    onGuardar: (descripcion: string | null) => void
    /** false = mostrar solo el lápiz, sin repetir el valor. Para cuando quien nos usa YA
     *  muestra ese texto: el chip de la rotación activa lo pone como su etiqueta, y sin
     *  esto el nombre salía dos veces ("Ronda Septiembre #2 Ronda Septiembre ✎"). */
    mostrarValor?: boolean
}

/**
 * Nombre editable en el lugar, para la rotación ("Ronda Agosto") y para cada semana
 * ("Buenos Aires").
 *
 * Un input inline y no un modal: son nombres de una línea que gerencia va a escribir
 * varias veces seguidas al armar una rotación, y un diálogo por cada uno sería un
 * ida y vuelta innecesario.
 */
export default function DescripcionInline({
    valor,
    placeholder,
    etiquetaAccesible,
    onGuardar,
    mostrarValor,
}: DescripcionInlineProps) {
    const [editando, setEditando] = useState(false)
    const [borrador, setBorrador] = useState('')
    // Escape desmonta el input desde onKeyDown, y React puede disparar onBlur en el
    // proceso: sin esta bandera, ese blur guardaría igual lo que el usuario canceló.
    const [cancelado, setCancelado] = useState(false)

    const abrir = () => {
        setBorrador(valor ?? '')
        setEditando(true)
        setCancelado(false)
    }

    const guardar = () => {
        if (cancelado) {
            setCancelado(false)
            return
        }
        const limpio = borrador.trim()
        // Vacío = borrar el nombre, no guardar un string vacío: la columna es nullable y
        // "sin nombre" y "nombre vacío" tienen que ser el mismo estado.
        onGuardar(limpio === '' ? null : limpio)
        setEditando(false)
    }

    if (editando) {
        return (
            <input
                autoFocus
                value={borrador}
                maxLength={120}
                onChange={e => setBorrador(e.target.value)}
                onBlur={guardar}
                onKeyDown={e => {
                    if (e.key === 'Enter') guardar()
                    if (e.key === 'Escape') {
                        setCancelado(true)
                        setEditando(false)
                    }
                }}
                className="w-40 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-900"
            />
        )
    }

    return (
        <span className="inline-flex items-center gap-1">
            {(mostrarValor ?? true) && (
                <span className={valor ? 'text-slate-500' : 'text-slate-400 italic'}>
                    {valor ?? placeholder}
                </span>
            )}
            <button
                type="button"
                aria-label={etiquetaAccesible}
                onClick={abrir}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
                <Pencil className="h-3 w-3" />
            </button>
        </span>
    )
}
