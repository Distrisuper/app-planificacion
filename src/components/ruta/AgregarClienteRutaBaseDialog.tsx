import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Search } from 'lucide-react'
import { useAgregarARutaBase, useBuscarEnRutaBase } from '@/hooks/useRotacionAdmin'
import { mensajeErrorRuta } from '@/lib/mensajesRuta'
import { titleCaseNombre } from '@/lib/textFormat'
import type { IResultadoBuscadorRutaBase } from '@/types/planificacion'

const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

interface AgregarClienteRutaBaseDialogProps {
    open: boolean
    onClose: () => void
    codigoVendedor: string
    /** La celda destino: la fija el "+" que se tocó. */
    semana: number
    dia: number
    /** Las semanas de la ruta base con su zona, para rotular las celdas igual que el grid. */
    zonas: Array<{ semana: number; descripcion: string | null }>
}

/**
 * Sumar un cliente de la cartera a la ruta base, desde el "+" de una celda.
 *
 * La versión simple de `AgregarClienteExtraDialog`: en la ruta base no hay hechos ni
 * extras, así que la única acción es agregar. Si el cliente ya está en otras celdas se
 * muestran (un quincenal está dos veces y es correcto), y solo se bloquea la misma celda,
 * que el backend rechaza con CELDA_OCUPADA_POR_EL_MISMO_CLIENTE.
 */
export default function AgregarClienteRutaBaseDialog({
    open,
    onClose,
    codigoVendedor,
    semana,
    dia,
    zonas,
}: AgregarClienteRutaBaseDialogProps) {
    const [texto, setTexto] = useState('')
    const [eleccion, setEleccion] = useState<IResultadoBuscadorRutaBase | null>(null)
    const [error, setError] = useState<string | null>(null)

    const {
        data: resultados = [],
        buscando,
        isError: fallóBusqueda,
        refetch: reintentarBusqueda,
    } = useBuscarEnRutaBase(codigoVendedor, texto)
    const agregar = useAgregarARutaBase(codigoVendedor)

    const etiquetaCelda = (s: number, d: number) => {
        const nombreDia = DIAS[d - 1] ?? String(d)
        const zona = zonas.find(z => z.semana === s)?.descripcion
        return zona ? `${nombreDia} · ${zona} (Semana ${s})` : `${nombreDia} · Semana ${s}`
    }
    const celdaDestino = etiquetaCelda(semana, dia)

    function cerrar() {
        setTexto('')
        setEleccion(null)
        setError(null)
        onClose()
    }

    async function confirmar() {
        if (!eleccion) return
        setError(null)
        try {
            await agregar.mutateAsync({
                codigoCliente: eleccion.codigoParticularCliente,
                semana,
                dia,
            })
            cerrar()
        } catch (err) {
            setError(mensajeErrorRuta(err, 'No se pudo agregar el cliente. Volvé a intentar.'))
        }
    }

    const yaEstaAca = eleccion?.celdas.some(c => c.semana === semana && c.dia === dia) ?? false
    const otrasCeldas = eleccion?.celdas.filter(c => !(c.semana === semana && c.dia === dia)) ?? []
    const nombre = eleccion ? titleCaseNombre(eleccion.nombreCliente) : ''

    return (
        <Dialog.Root open={open} onOpenChange={abierto => !abierto && cerrar()}>
            <Dialog.Portal>
                <Dialog.Overlay className="animate-fade-in fixed inset-0 z-[60] bg-black/45" />
                <Dialog.Content className="animate-dialogo-in fixed left-1/2 top-1/2 z-[60] flex max-h-[85vh] w-[92vw] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white p-5 shadow-[0_18px_44px_rgba(10,15,30,.28)]">
                    <Dialog.Title className="text-[16px] font-extrabold leading-tight text-slate-900">
                        Agregar a la ruta base
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-[13px] text-slate-500">
                        Va al {celdaDestino}, desde la próxima vuelta.
                    </Dialog.Description>

                    {!eleccion && (
                        <div className="mt-4 flex min-h-0 flex-col gap-2">
                            <div className="relative">
                                <Search
                                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                                    strokeWidth={2.4}
                                />
                                <input
                                    className="w-full rounded-lg border-[1.5px] border-slate-200 py-2 pl-9 pr-3 text-sm font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
                                    placeholder="Nombre o código del cliente"
                                    value={texto}
                                    onChange={e => setTexto(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            {buscando && <p className="px-1 text-xs text-slate-500">Buscando…</p>}
                            {/* Sin esto un GET fallado se lee como "Sin resultados". */}
                            {fallóBusqueda && !buscando && (
                                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                                    <p className="text-[13px] text-red-700">
                                        No pudimos buscar en la cartera.
                                    </p>
                                    <button
                                        type="button"
                                        className="mt-1 text-[13px] font-semibold text-red-800 underline"
                                        onClick={() => reintentarBusqueda()}
                                    >
                                        Volver a intentar
                                    </button>
                                </div>
                            )}
                            <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
                                {resultados.map(r => (
                                    <button
                                        key={r.codigoParticularCliente}
                                        type="button"
                                        className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-slate-400"
                                        onClick={() => {
                                            setError(null)
                                            setEleccion(r)
                                        }}
                                    >
                                        <span className="w-full truncate text-sm font-semibold text-slate-800">
                                            {titleCaseNombre(r.nombreCliente)}
                                        </span>
                                        <span className="text-[11px] text-slate-500">
                                            {r.codigoParticularCliente}
                                            {r.celdas.length > 0 &&
                                                ` · En la ruta base: ${r.celdas
                                                    .map(c => etiquetaCelda(c.semana, c.dia))
                                                    .join(', ')}`}
                                        </span>
                                    </button>
                                ))}
                                {texto.trim().length >= 2 &&
                                    !buscando &&
                                    !fallóBusqueda &&
                                    resultados.length === 0 && (
                                        <p className="py-6 text-center text-sm text-slate-500">
                                            Sin resultados
                                        </p>
                                    )}
                                {texto.trim().length < 2 && (
                                    <p className="py-6 text-center text-sm leading-relaxed text-slate-500">
                                        Buscá en toda la cartera del vendedor.
                                    </p>
                                )}
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    className="h-9 rounded-lg border-[1.5px] border-slate-200 px-3.5 text-[13px] font-semibold text-slate-700"
                                    onClick={cerrar}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {eleccion && (
                        <div className="mt-4 flex flex-col gap-3">
                            {yaEstaAca ? (
                                <p className="text-sm leading-snug text-slate-800">
                                    <b>{nombre}</b> ya está en la ruta base acá, en el{' '}
                                    {celdaDestino}.
                                </p>
                            ) : otrasCeldas.length > 0 ? (
                                <div className="flex flex-col gap-2">
                                    <p className="text-sm leading-snug text-slate-800">
                                        <b>{nombre}</b> ya está en la ruta base en otro día.
                                        Agregarlo acá le suma una visita más en cada vuelta; los
                                        otros días quedan como están.
                                    </p>
                                    <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
                                        {otrasCeldas.map(c => (
                                            <li
                                                key={c.id}
                                                className="px-3 py-2 text-[13px] font-semibold text-slate-800"
                                            >
                                                {etiquetaCelda(c.semana, c.dia)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <p className="text-sm leading-snug text-slate-800">
                                    <b>{nombre}</b> no está en la ruta base. Se agrega al{' '}
                                    {celdaDestino}.
                                </p>
                            )}

                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    className="h-9 rounded-lg border-[1.5px] border-slate-200 px-3.5 text-[13px] font-semibold text-slate-700"
                                    onClick={() => (yaEstaAca ? cerrar() : setEleccion(null))}
                                >
                                    {yaEstaAca ? 'Cerrar' : 'Cancelar'}
                                </button>
                                {!yaEstaAca && (
                                    <button
                                        type="button"
                                        disabled={agregar.isPending}
                                        className="h-9 rounded-lg bg-slate-900 px-3.5 text-[13px] font-semibold text-white disabled:opacity-60"
                                        onClick={confirmar}
                                    >
                                        Agregar
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {error && (
                        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                            {error}
                        </p>
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
