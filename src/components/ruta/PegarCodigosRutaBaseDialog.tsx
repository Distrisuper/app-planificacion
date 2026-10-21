import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import Segmentado, { type OpcionSegmentado } from '@/components/ui/Segmentado'
import { useSincronizarRutaBase } from '@/hooks/useRotacionAdmin'
import { mensajeErrorRuta } from '@/lib/mensajesRuta'
import { diasDeLoPegado, parsearCodigosPegados } from '@/lib/pegarCodigos'
import { titleCaseNombre } from '@/lib/textFormat'
import type { IResultadoSincronizarRutaBase } from '@/types/planificacion'

const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

const OPCIONES_DIA: OpcionSegmentado<string>[] = DIAS.map((d, i) => ({
    valor: String(i + 1),
    etiqueta: d,
}))

/** "LUN", "LUN y MAR", "LUN, MAR y JUE". */
function listarDias(dias: string[]): string {
    const nombres = dias.map(d => DIAS[Number(d) - 1] ?? d)
    if (nombres.length <= 1) return nombres.join('')
    return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

interface PegarCodigosRutaBaseDialogProps {
    open: boolean
    onClose: () => void
    codigoVendedor: string
    semana: number
    /** El nombre de la zona de la semana, para el título. */
    zona: string | null
}

/**
 * "Pegar códigos" de una semana de la ruta base: reemplaza los días incluidos con los
 * clientes pegados. Siempre en dos pasos —Revisar (vista previa, no cambia nada) y
 * Aplicar— porque lo que no esté en la lista sale de esos días, y eso tiene que verse antes.
 */
export default function PegarCodigosRutaBaseDialog({
    open,
    onClose,
    codigoVendedor,
    semana,
    zona,
}: PegarCodigosRutaBaseDialogProps) {
    const [texto, setTexto] = useState('')
    const [dia, setDia] = useState('1')
    const [previa, setPrevia] = useState<IResultadoSincronizarRutaBase | null>(null)
    const [error, setError] = useState<string | null>(null)
    const sincronizar = useSincronizarRutaBase(codigoVendedor)

    const pegado = parsearCodigosPegados(texto)
    const dias = pegado.modo === 'vacio' ? null : diasDeLoPegado(pegado, Number(dia))
    const diasIncluidos = dias ? Object.keys(dias) : []

    // La vista previa vale para lo que se revisó: cambiar el texto o el día la descarta.
    const cambiarTexto = (t: string) => {
        setTexto(t)
        setPrevia(null)
        setError(null)
    }
    const cambiarDia = (d: string) => {
        setDia(d)
        setPrevia(null)
        setError(null)
    }

    async function enviar(aplicar: boolean) {
        if (!dias) return
        setError(null)
        try {
            const r = await sincronizar.mutateAsync({ semana, dias, aplicar })
            if (aplicar) onClose()
            else setPrevia(r)
        } catch (err) {
            setError(
                mensajeErrorRuta(
                    err,
                    aplicar
                        ? 'No se pudieron aplicar los códigos. Probá de nuevo.'
                        : 'No se pudieron revisar los códigos. Probá de nuevo.',
                ),
            )
        }
    }

    const titulo = zona ? `Pegar códigos · Semana ${semana} (${zona})` : `Pegar códigos · Semana ${semana}`
    const aviso = `${diasIncluidos.length === 1 ? 'Se reemplaza' : 'Se reemplazan'} ${listarDias(
        diasIncluidos,
    )} de la semana ${semana}: lo que no esté en la lista sale de esos días.${
        diasIncluidos.length < DIAS.length ? ' Los demás días no se tocan.' : ''
    }`

    return (
        <Dialog.Root open={open} onOpenChange={abierto => !abierto && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="animate-fade-in fixed inset-0 z-[60] bg-black/45" />
                <Dialog.Content className="animate-dialogo-in fixed left-1/2 top-1/2 z-[60] flex max-h-[85vh] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white p-5 shadow-[0_18px_44px_rgba(10,15,30,.28)]">
                    <Dialog.Title className="text-[16px] font-extrabold leading-tight text-slate-900">
                        {titulo}
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-[13px] text-slate-500">
                        Pegá la grilla copiada de Excel, con una columna por día. Aplica desde la
                        próxima vuelta.
                    </Dialog.Description>

                    {!previa && (
                        <div className="mt-4 flex min-h-0 flex-col gap-3">
                            <EjemploGrilla />
                            <textarea
                                aria-label="Códigos"
                                value={texto}
                                onChange={e => cambiarTexto(e.target.value)}
                                rows={8}
                                autoFocus
                                spellCheck={false}
                                placeholder="Pegá acá…"
                                className="w-full resize-y rounded-lg border-[1.5px] border-slate-200 px-3 py-2 font-mono text-[13px] text-slate-900 outline-none placeholder:text-slate-300 focus:border-slate-400"
                            />
                            {pegado.modo === 'columna' && (
                                <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
                                    Un código por renglón, para el
                                    <Segmentado
                                        etiqueta="Día"
                                        opciones={OPCIONES_DIA}
                                        valor={dia}
                                        onCambiar={cambiarDia}
                                    />
                                </div>
                            )}
                            {pegado.modo === 'grilla' && (
                                <p className="text-[13px] text-slate-600">
                                    Grilla: {listarDias(diasIncluidos)}.
                                </p>
                            )}
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    className="h-9 rounded-lg border-[1.5px] border-slate-200 px-3.5 text-[13px] font-semibold text-slate-700"
                                    onClick={onClose}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={!dias || sincronizar.isPending}
                                    className="h-9 rounded-lg bg-slate-900 px-3.5 text-[13px] font-semibold text-white disabled:opacity-40"
                                    onClick={() => enviar(false)}
                                >
                                    {sincronizar.isPending ? 'Revisando…' : 'Revisar'}
                                </button>
                            </div>
                        </div>
                    )}

                    {previa && (
                        <div className="mt-4 flex min-h-0 flex-col gap-3">
                            <div className="min-h-0 space-y-3 overflow-y-auto text-[13px] text-slate-800">
                                <p className="text-slate-600">
                                    Entran {previa.entran.length} · Salen {previa.salen.length} ·
                                    Quedan {previa.quedan}
                                </p>
                                <ListaPrevia
                                    titulo="Entran"
                                    items={previa.entran.map(c => ({
                                        clave: `${c.codigoParticularCliente}-${c.dia}`,
                                        texto: `${titleCaseNombre(c.nombreCliente)} (${c.codigoParticularCliente}) · ${DIAS[c.dia - 1]}`,
                                    }))}
                                />
                                <ListaPrevia
                                    titulo="Salen"
                                    items={previa.salen.map(c => ({
                                        clave: String(c.id),
                                        texto: `${titleCaseNombre(c.nombreCliente)} (${c.codigoParticularCliente}) · ${DIAS[c.dia - 1]}`,
                                    }))}
                                />
                                {previa.noEncontrados.length > 0 && (
                                    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                                        No son de la cartera de este vendedor y no se cargan:{' '}
                                        {previa.noEncontrados.join(', ')}.
                                    </p>
                                )}
                                {previa.repetidos.length > 0 && (
                                    <p className="text-slate-600">
                                        Repetidos, entran una sola vez:{' '}
                                        {previa.repetidos
                                            .map(r => `${r.codigo} (${DIAS[r.dia - 1]})`)
                                            .join(', ')}
                                        .
                                    </p>
                                )}
                            </div>
                            <p className="rounded-md bg-estado-atencion-fondo px-3 py-2 text-[13px] font-medium text-estado-atencion-texto">
                                {aviso}
                            </p>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    className="h-9 rounded-lg border-[1.5px] border-slate-200 px-3.5 text-[13px] font-semibold text-slate-700"
                                    onClick={() => setPrevia(null)}
                                >
                                    Volver a editar
                                </button>
                                <button
                                    type="button"
                                    disabled={sincronizar.isPending}
                                    className="h-9 rounded-lg bg-slate-900 px-3.5 text-[13px] font-semibold text-white disabled:opacity-60"
                                    onClick={() => enviar(true)}
                                >
                                    {sincronizar.isPending ? 'Aplicando…' : 'Aplicar'}
                                </button>
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

/** Códigos inventados con forma de código real: el ejemplo no puede nombrar clientes. */
const EJEMPLO: string[][] = [
    ['00123', '00456', '00789', '01012', '01345'],
    ['00124', '', '00790', '01013', ''],
    ['00125', '', '00791', '', ''],
]

/**
 * Cómo se ve lo que hay que pegar: una grilla de verdad, con LUN..VIE arriba de cada
 * columna. Antes era el placeholder del textarea con tabs, y los huecos de los días con
 * menos clientes corrían las columnas: no se entendía qué columna era cada día.
 */
function EjemploGrilla() {
    return (
        <div className="text-[12px] text-slate-400">
            {/* Ilustración: los códigos son inventados, no hay nada que leer. */}
            <table aria-hidden className="table-fixed border-collapse font-mono">
                <thead>
                    <tr>
                        {DIAS.map(d => (
                            <th key={d} className="w-16 pb-0.5 text-left font-semibold text-slate-500">
                                {d}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {EJEMPLO.map((fila, i) => (
                        <tr key={i}>
                            {fila.map((codigo, j) => (
                                <td key={j} className="w-16 border border-slate-100 px-1 leading-5">
                                    {codigo}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="mt-1.5 font-sans">
                Un día puede tener menos clientes que otro. O pegá un código por renglón,
                eligiendo el día.
            </p>
        </div>
    )
}

function ListaPrevia({ titulo, items }: { titulo: string; items: Array<{ clave: string; texto: string }> }) {
    if (items.length === 0) return null
    return (
        <div>
            <p className="font-semibold text-slate-900">
                {titulo} ({items.length})
            </p>
            <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {items.map(i => (
                    <li key={i.clave} className="px-3 py-1.5">
                        {i.texto}
                    </li>
                ))}
            </ul>
        </div>
    )
}
