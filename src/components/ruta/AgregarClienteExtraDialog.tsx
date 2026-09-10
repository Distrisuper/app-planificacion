import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Search } from 'lucide-react'
import {
    useAgregarClienteExtraAdmin,
    useBuscarEnCarteraAdmin,
    useConsultarClienteAdmin,
    useReacomodarAdmin,
} from '@/hooks/useRotacionAdmin'
import { titleCaseNombre } from '@/lib/textFormat'
import type { ICeldaPlanificada, IResultadoBuscadorGeneral } from '@/types/planificacion'

const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

/** El estado del cliente en la vuelta, en palabras. `sin_plan` no se rotula: es la
 *  ausencia de fila, y en la lista se lee como "solo el código". */
const ESTADO_BUSCADOR: Record<IResultadoBuscadorGeneral['estado'], string> = {
    pendiente: 'Pendiente',
    visitado: 'Visitado',
    no_visita: 'No visitado',
    sin_plan: '',
}

interface AgregarClienteExtraDialogProps {
    open: boolean
    onClose: () => void
    codigoVendedor: string
    rotacionId: number
    /** La celda destino: la fija el botón "+" que se tocó, no un selector. */
    semana: number
    dia: number
    /**
     * Las semanas de la rotación con su nombre de zona. Se usan para rotular tanto la
     * celda destino como cada celda donde el cliente ya está: sin esto, las filas de
     * "traer" decían "Semana 4" mientras el encabezado decía "Norte (Semana 4)", y eran
     * la misma zona con dos nombres.
     */
    zonas: Array<{ semana: number; descripcion: string | null }>
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
 *  - Cuando el cliente ya está en la vuelta, ofrece las dos salidas del dominio, una por
 *    celda: **traer** esa visita (mueve el plan, `reacomodar`, queda auditado en
 *    `pl_reacomodacion`) o **agregar otra** (crea una fila extra y deja la de allá
 *    pendiente). Traer es la primaria: mover el plan es lo correcto cuando el cliente
 *    cambió de lugar, y la extra es para la pasada puntual — misma jerarquía que usa
 *    `BuscadorDiaSheet` con el vendedor.
 *
 * El spec 2026-09-09 había descartado "traer" acá ("ya lo cubre el drag & drop"), pero
 * con cinco semanas el arrastre cruza una grilla que scrollea, y elegir de una lista es
 * más barato que acertarle a la celda. Un botón por celda y no un selector + confirmar:
 * el drag también elige y mueve en un solo gesto.
 */
export default function AgregarClienteExtraDialog({
    open,
    onClose,
    codigoVendedor,
    rotacionId,
    semana,
    dia,
    zonas,
    onAgregado,
}: AgregarClienteExtraDialogProps) {
    const [texto, setTexto] = useState('')
    const [eleccion, setEleccion] = useState<Eleccion | null>(null)
    const [error, setError] = useState<string | null>(null)

    const {
        data: resultados = [],
        buscando,
        isError: fallóBusqueda,
        refetch: reintentarBusqueda,
    } = useBuscarEnCarteraAdmin(codigoVendedor, rotacionId, texto)
    const consultar = useConsultarClienteAdmin(codigoVendedor)
    const agregar = useAgregarClienteExtraAdmin(codigoVendedor)
    const traer = useReacomodarAdmin(codigoVendedor)

    /**
     * Cómo se nombra una celda en todo el diálogo: `LUN · Norte (Semana 4)`, y sin el
     * nombre de zona cae al número pelado — mismo criterio que el grid, donde una semana
     * sin nombrar muestra "Sin zona".
     */
    const etiquetaCelda = (s: number, d: number) => {
        const nombreDia = DIAS[d - 1] ?? String(d)
        const zona = zonas.find(z => z.semana === s)?.descripcion
        return zona ? `${nombreDia} · ${zona} (Semana ${s})` : `${nombreDia} · Semana ${s}`
    }

    const celdaDestino = etiquetaCelda(semana, dia)

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

    /**
     * Mueve una fila que ya existe a la celda del "+". Es exactamente lo que hace el
     * drag & drop del grid (`reacomodar`), con la misma bitácora: acá se elige de una
     * lista en vez de arrastrar por una grilla que scrollea.
     */
    async function traerCelda(celda: ICeldaPlanificada) {
        setError(null)
        try {
            await traer.mutateAsync({
                rotacionId,
                rotacionClienteId: celda.rotacionClienteId,
                semana,
                dia,
            })
            cerrar()
        } catch {
            // El 409 esperable (FILA_RESUELTA, si alguien la resolvió entre la consulta y
            // el click) no se distingue del resto a propósito: el texto sirve para los dos
            // y la lista se rearma sola al reabrir.
            setError('No se pudo mover esa visita. Volvé a intentar.')
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
    // Al menos una de esas filas se puede mover. Una resuelta no: `reacomodar` la rechaza
    // (409 FILA_RESUELTA), así que con todas resueltas la única salida es agregar otra.
    const hayTraibles = enOtraCelda?.some(c => !c.resuelto) ?? false

    /**
     * Qué se puede hacer en ESTA celda con el cliente elegido. Un solo valor derivado, y
     * de él salen el texto y la jerarquía del botón.
     *
     * Antes el botón se decidía por `hayEnOtraCelda` a secas, y eso mentía en la
     * combinación "quitado acá + vivo en otra celda": la única acción posible era
     * revivirlo acá, pero el botón decía "Agregar otra visita" y se pintaba secundario,
     * como si lo importante estuviera en otra parte.
     *
     *  - `nada`      ya está planificado/visitado acá: no hay nada que ofrecer.
     *  - `restaurar` hay una fila quitada en esta celda: agregar la revive.
     *  - `otra`      está vivo en otra celda Y esa se puede traer: agregar es la
     *                alternativa a traer, y va segundo.
     *  - `agregar`   único camino: crear la fila acá.
     */
    const accion: 'nada' | 'restaurar' | 'otra' | 'agregar' = yaEstaAcaViva
        ? 'nada'
        : estaQuitadaAca
          ? 'restaurar'
          : hayTraibles
            ? 'otra'
            : 'agregar'
    const trabajando = agregar.isPending || traer.isPending

    return (
        <Dialog.Root open={open} onOpenChange={abierto => !abierto && cerrar()}>
            <Dialog.Portal>
                <Dialog.Overlay className="animate-fade-in fixed inset-0 z-[60] bg-black/45" />
                <Dialog.Content className="animate-dialogo-in fixed left-1/2 top-1/2 z-[60] flex max-h-[85vh] w-[92vw] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white p-5 shadow-[0_18px_44px_rgba(10,15,30,.28)]">
                    <Dialog.Title className="text-[16px] font-extrabold leading-tight text-slate-900">
                        Agregar cliente
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-[13px] text-slate-500">
                        {/* Sin la elección hecha, el único camino posible es agregar. Después
                            puede aparecer "Traer acá", que MUEVE una fila del plan y no la
                            marca como agregada: prometer "marcado como agregado" ahí sería
                            falso, y esto es lo que anuncia el lector de pantalla. */}
                        {eleccion
                            ? `Celda destino: ${celdaDestino}.`
                            : `Va al ${celdaDestino}, marcado como agregado.`}
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
                            {/* Sin esto, un GET fallado deja `resultados` en [] y la pantalla
                                dice "Sin resultados": gerencia concluye que el cliente no es
                                de la cartera del vendedor cuando en realidad no se preguntó
                                nada. Es la misma trampa que CLAUDE.md documenta para los
                                ofrecimientos: mirar solo `data` no distingue vacío de fallo. */}
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
                                        disabled={consultar.isPending}
                                        className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-slate-400 disabled:opacity-60"
                                        onClick={() => elegir(r)}
                                    >
                                        <span className="w-full truncate text-sm font-semibold text-slate-800">
                                            {titleCaseNombre(r.nombreCliente)}
                                        </span>
                                        <span className="text-[11px] text-slate-500">
                                            {/* `estado`/`semana` vienen en el resultado y el
                                                endpoint ya los calculó (una query por cliente):
                                                mostrarlos evita tener que elegir el cliente solo
                                                para enterarse de que ya está en la vuelta. */}
                                            {r.codigoParticularCliente}
                                            {r.estado !== 'sin_plan' &&
                                            r.semana !== null &&
                                            r.dia !== null
                                                ? ` · ${ESTADO_BUSCADOR[r.estado]} el ${etiquetaCelda(r.semana, r.dia)}`
                                                : ''}
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
                                        Buscá en toda la cartera del vendedor,
                                        <br />
                                        esté o no en esta vuelta.
                                    </p>
                                )}
                            </div>
                            {/* Escape y el overlay cierran, pero el resto de los diálogos del
                                repo ofrecen la salida explícita (ver ConfirmDialog). */}
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
                            {accion === 'nada' && (
                                <p className="text-sm leading-snug text-slate-800">
                                    <b>{eleccion.nombre}</b>{' '}
                                    {/* Una visita ya resuelta NO es "está planificado": eso
                                        suena a pendiente, y es un hecho que ya ocurrió. La
                                        distinción plan/hecho es la del dominio (ver CLAUDE.md),
                                        y esta pantalla es donde gerencia la lee. */}
                                    {enEstaCelda?.resuelto
                                        ? `ya se resolvió acá, en el ${celdaDestino}.`
                                        : `ya está planificado acá, en el ${celdaDestino}.`}
                                </p>
                            )}

                            {/* Gana sobre la lista de "traer" a propósito, y no solo por
                                prioridad de mensaje: la fila quitada sigue ocupando la clave
                                `(rotación, cliente, semana, día)`, así que traer OTRA fila a
                                esta celda chocaría contra el UNIQUE. Agregar acá es el único
                                camino que funciona, y de paso la revive. */}
                            {accion === 'restaurar' && (
                                <p className="text-sm leading-snug text-slate-800">
                                    <b>{eleccion.nombre}</b> está quitado de este día. Agregarlo lo
                                    vuelve a poner en el {celdaDestino}.
                                </p>
                            )}

                            {!yaEstaAcaViva && !estaQuitadaAca && hayEnOtraCelda && (
                                <div className="flex flex-col gap-2">
                                    <p className="text-sm leading-snug text-slate-800">
                                        <b>{eleccion.nombre}</b> ya está en esta vuelta.{' '}
                                        {!hayTraibles
                                            ? // Todas resueltas: prometer "traer" sería ofrecer
                                              // algo que ninguna fila de la lista habilita.
                                              'Esas visitas ya se resolvieron, así que no se pueden mover — lo único posible es agregar otra acá.'
                                            : enOtraCelda!.length === 1
                                              ? `Podés traer esa visita al ${celdaDestino} —la mueve de lugar— o agregar otra y dejar la de allá pendiente.`
                                              : `Podés traer una de esas visitas al ${celdaDestino} —la mueve de lugar— o agregar otra y dejarlas donde están.`}
                                    </p>
                                    {/* Una fila por celda, cada una con su propio botón: con un
                                        quincenal (dos filas en la vuelta) hay que poder elegir
                                        cuál se trae, y un selector + confirmar sería un paso de
                                        más para lo que el drag hace en un gesto. */}
                                    <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
                                        {enOtraCelda!.map(c => {
                                            const etiqueta = etiquetaCelda(c.semana, c.dia)
                                            return (
                                                <li
                                                    key={c.rotacionClienteId}
                                                    className="flex items-center justify-between gap-3 px-3 py-2"
                                                >
                                                    <span className="text-[13px] font-semibold text-slate-800">
                                                        {etiqueta}
                                                    </span>
                                                    {c.resuelto ? (
                                                        // `reacomodar` la rechaza con 409
                                                        // FILA_RESUELTA: ofrecer el botón sería
                                                        // ofrecer una acción que siempre falla.
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                                            Ya resuelta
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled={trabajando}
                                                            // El nombre accesible lleva la celda:
                                                            // con dos filas, dos botones "Traer
                                                            // acá" son indistinguibles para un
                                                            // lector de pantalla y para los tests.
                                                            aria-label={`Traer acá la visita del ${etiqueta}`}
                                                            className="h-8 shrink-0 rounded-lg bg-slate-900 px-3 text-[12px] font-semibold text-white disabled:opacity-60"
                                                            onClick={() => traerCelda(c)}
                                                        >
                                                            Traer acá
                                                        </button>
                                                    )}
                                                </li>
                                            )
                                        })}
                                    </ul>
                                </div>
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
                                    onClick={() =>
                                        accion === 'nada' ? cerrar() : setEleccion(null)
                                    }
                                >
                                    {accion === 'nada' ? 'Cerrar' : 'Cancelar'}
                                </button>
                                {accion !== 'nada' && (
                                    <button
                                        type="button"
                                        disabled={trabajando}
                                        // Secundario SOLO cuando hay un "Traer acá" arriba con
                                        // el que competir: mover el plan es lo correcto si el
                                        // cliente cambió de lugar, y la extra es para la pasada
                                        // puntual. En cualquier otro caso es la única salida, y
                                        // una única salida no se pinta como alternativa.
                                        className={
                                            accion === 'otra'
                                                ? 'h-9 rounded-lg border-[1.5px] border-slate-200 px-3.5 text-[13px] font-semibold text-slate-700 disabled:opacity-60'
                                                : 'h-9 rounded-lg bg-slate-900 px-3.5 text-[13px] font-semibold text-white disabled:opacity-60'
                                        }
                                        onClick={confirmar}
                                    >
                                        {accion === 'otra' ? 'Agregar otra visita' : 'Agregar'}
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
