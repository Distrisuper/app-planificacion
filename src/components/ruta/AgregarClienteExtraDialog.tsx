import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Search } from 'lucide-react'
import {
    useAgregarClienteExtraAdmin,
    useBuscarEnCarteraAdmin,
    useConsultarClienteAdmin,
} from '@/hooks/useRotacionAdmin'
import { titleCaseNombre } from '@/lib/textFormat'
import type { ICeldaPlanificada, IResultadoBuscadorGeneral } from '@/types/planificacion'

const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

interface AgregarClienteExtraDialogProps {
    open: boolean
    onClose: () => void
    codigoVendedor: string
    rotacionId: number
    /** La celda destino: la fija el botón "+" que se tocó, no un selector. */
    semana: number
    dia: number
    /** El nombre de la zona de esa semana, para rotular la celda destino. */
    descripcionSemana: string | null
    /** Se creó (o restauró) la fila. Opcional: `RutaPage`, el único caller hoy, no lo pasa
     *  (el diálogo se cierra solo y el grid se actualiza vía query invalidation), pero
     *  queda disponible para un futuro caller que quiera mostrar un aviso propio. */
    onAgregado?: (nombreCliente: string) => void
}

/** Lo que se está por confirmar: el cliente elegido y qué se sabe de él en la rotación. */
interface Eleccion {
    codigo: string
    nombre: string
    celdas: ICeldaPlanificada[]
}

/**
 * El buscador que ESCRIBE, colgado del "+" de cada celda del grid de gerencia.
 *
 * Es el equivalente de `BuscadorDiaSheet` (el del vendedor) pero con dos diferencias que
 * NO son cosméticas:
 *
 *  - Va sobre `Dialog` y no sobre `BottomSheet`: el sheet que sube desde abajo es el
 *    patrón mobile del vendedor, y esto vive en la grilla de gerencia (desktop) — misma
 *    razón que documenta `ConfirmDialog`.
 *  - Ofrece SOLO "Agregar". "Traer" (mover una fila pendiente de otra zona) ya lo cubre
 *    el drag & drop del grid, que es exactamente `reacomodar`: un segundo camino para lo
 *    mismo agregaría superficie sin agregar capacidad.
 */
export default function AgregarClienteExtraDialog({
    open,
    onClose,
    codigoVendedor,
    rotacionId,
    semana,
    dia,
    descripcionSemana,
    onAgregado,
}: AgregarClienteExtraDialogProps) {
    const [texto, setTexto] = useState('')
    const [eleccion, setEleccion] = useState<Eleccion | null>(null)
    const [error, setError] = useState<string | null>(null)

    const { data: resultados = [], buscando } = useBuscarEnCarteraAdmin(
        codigoVendedor,
        rotacionId,
        texto,
    )
    const consultar = useConsultarClienteAdmin(codigoVendedor)
    const agregar = useAgregarClienteExtraAdmin(codigoVendedor)

    const nombreDia = DIAS[dia - 1] ?? String(dia)
    const celdaDestino = descripcionSemana
        ? `${nombreDia} · ${descripcionSemana} (Semana ${semana})`
        : `${nombreDia} · Semana ${semana}`

    // Deja el diálogo limpio si algún día se lo deja montado al cerrarlo: sin esto, el
    // texto de la búsqueda anterior reaparecería en la próxima apertura.
    useEffect(() => {
        if (!open) {
            setTexto('')
            setEleccion(null)
            setError(null)
        }
    }, [open])

    function cerrar() {
        setTexto('')
        setEleccion(null)
        setError(null)
        onClose()
    }

    async function elegir(r: IResultadoBuscadorGeneral) {
        setError(null)
        try {
            const consulta = await consultar.mutateAsync({
                rotacionId,
                codigoCliente: r.codigoParticularCliente,
            })
            setEleccion({
                codigo: r.codigoParticularCliente,
                nombre: titleCaseNombre(r.nombreCliente),
                celdas: consulta.celdas,
            })
        } catch {
            setError('No pudimos consultar este cliente. Volvé a intentar.')
        }
    }

    async function confirmar() {
        if (!eleccion) return
        setError(null)
        try {
            await agregar.mutateAsync({
                rotacionId,
                codigoCliente: eleccion.codigo,
                semana,
                dia,
            })
            const nombre = eleccion.nombre
            cerrar()
            onAgregado?.(nombre)
        } catch {
            setError('No se pudo agregar el cliente. Volvé a intentar.')
        }
    }

    const enEstaCelda = eleccion?.celdas.find(c => c.semana === semana && c.dia === dia)
    // Solo las filas VIVAS de otras celdas cuentan como "ya planificado": una quitada no
    // está en la vuelta, así que no hay nada de qué avisar.
    const enOtraCelda = eleccion?.celdas.filter(
        c => !c.eliminado && !(c.semana === semana && c.dia === dia),
    )

    const yaEstaAcaViva = enEstaCelda !== undefined && !enEstaCelda.eliminado
    const estaQuitadaAca = enEstaCelda !== undefined && enEstaCelda.eliminado
    const hayEnOtraCelda = (enOtraCelda?.length ?? 0) > 0
    const trabajando = agregar.isPending

    return (
        <Dialog.Root open={open} onOpenChange={abierto => !abierto && cerrar()}>
            <Dialog.Portal>
                <Dialog.Overlay className="animate-fade-in fixed inset-0 z-[60] bg-black/45" />
                <Dialog.Content className="animate-dialogo-in fixed left-1/2 top-1/2 z-[60] flex max-h-[85vh] w-[92vw] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white p-5 shadow-[0_18px_44px_rgba(10,15,30,.28)]">
                    <Dialog.Title className="text-[16px] font-extrabold leading-tight text-slate-900">
                        Agregar cliente
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-[13px] text-slate-500">
                        Va al {celdaDestino}, marcado como agregado.
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
                            <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
                                {resultados.map(r => (
                                    <button
                                        key={r.codigoParticularCliente}
                                        type="button"
                                        disabled={consultar.isPending}
                                        className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-slate-400 disabled:opacity-60"
                                        onClick={() => elegir(r)}
                                    >
                                        <span className="w-full truncate text-sm font-semibold text-slate-800">
                                            {titleCaseNombre(r.nombreCliente)}
                                        </span>
                                        <span className="text-[11px] text-slate-500">
                                            {r.codigoParticularCliente}
                                        </span>
                                    </button>
                                ))}
                                {texto.trim().length >= 2 && !buscando && resultados.length === 0 && (
                                    <p className="py-6 text-center text-sm text-slate-500">
                                        Sin resultados
                                    </p>
                                )}
                                {texto.trim().length < 2 && (
                                    <p className="py-6 text-center text-sm leading-relaxed text-slate-500">
                                        Buscá en toda la cartera del vendedor,
                                        <br />
                                        esté o no en esta vuelta.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {eleccion && (
                        <div className="mt-4 flex flex-col gap-3">
                            {yaEstaAcaViva && (
                                <p className="text-sm leading-snug text-slate-800">
                                    <b>{eleccion.nombre}</b> ya está planificado acá, en el{' '}
                                    {celdaDestino}.
                                </p>
                            )}

                            {!yaEstaAcaViva && estaQuitadaAca && (
                                <p className="text-sm leading-snug text-slate-800">
                                    <b>{eleccion.nombre}</b> está quitado de este día. Agregarlo lo
                                    vuelve a poner en el {celdaDestino}.
                                </p>
                            )}

                            {!yaEstaAcaViva && !estaQuitadaAca && hayEnOtraCelda && (
                                <p className="text-sm leading-snug text-slate-800">
                                    <b>{eleccion.nombre}</b> ya está planificado el{' '}
                                    {enOtraCelda!
                                        .map(c => `${DIAS[c.dia - 1] ?? c.dia} · Semana ${c.semana}`)
                                        .join(', ')}{' '}
                                    de esta vuelta. ¿Agregar igual otra visita el {celdaDestino}?
                                </p>
                            )}

                            {!yaEstaAcaViva && !estaQuitadaAca && !hayEnOtraCelda && (
                                <p className="text-sm leading-snug text-slate-800">
                                    <b>{eleccion.nombre}</b> no está en esta vuelta. Se agrega al{' '}
                                    {celdaDestino} como visita extra.
                                </p>
                            )}

                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    className="h-9 rounded-lg border-[1.5px] border-slate-200 px-3.5 text-[13px] font-semibold text-slate-700"
                                    onClick={() => (yaEstaAcaViva ? cerrar() : setEleccion(null))}
                                >
                                    {yaEstaAcaViva ? 'Cerrar' : 'Cancelar'}
                                </button>
                                {!yaEstaAcaViva && (
                                    <button
                                        type="button"
                                        disabled={trabajando}
                                        className="h-9 rounded-lg bg-slate-900 px-3.5 text-[13px] font-semibold text-white disabled:opacity-60"
                                        onClick={confirmar}
                                    >
                                        {hayEnOtraCelda ? 'Agregar de todos modos' : 'Agregar'}
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
