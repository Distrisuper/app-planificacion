import { useEffect, useState } from 'react'
import { ChevronLeft, Loader2, Maximize2, Plus } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import RubroCard from './propuesta/RubroCard'
import AgregarRubroVista from './propuesta/AgregarRubroVista'
import ResolucionWizard from './propuesta/ResolucionWizard'
import ResolucionWizardAcciones from './propuesta/ResolucionWizardAcciones'
import SeleccionBar from './propuesta/SeleccionBar'
import ResolverLoteVista from './propuesta/ResolverLoteVista'
import ResolverLoteAcciones from './propuesta/ResolverLoteAcciones'
import VersusTable from './propuesta/VersusTable'
import { useMotivos } from '@/hooks/useMotivos'
import { useRubros, useResolverRubros, useEliminarRubro } from '@/hooks/useRubros'
import { useRubroStatus } from '@/hooks/useRubroStatus'
import { useVisitaTimer } from '@/hooks/useVisitaTimer'
import { useBrandCatalog } from '@/hooks/useCatalogos'
import { formatearDuracion } from '@/lib/visitaTimer'
import { motivosIguales, tieneDetalleIncompleto } from '@/lib/resolucionRubro'
import { leerBorrador, guardarBorrador, limpiarBorrador } from '@/lib/resolucionDraft'
import type { IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

type Vista = 'list' | 'versus' | 'agregar' | 'resolverLote'

interface VisitaSheetProps {
    open: boolean
    visitaId: number
    nombreCliente: string
    /** true = se entró solo a completar rubros de una visita ya cerrada. */
    visitaCerrada: boolean
    /** true = la visita está en curso (no cerrada): pinta el eyebrow naranja + cronómetro. */
    enCurso?: boolean
    /** Si se pasa, habilita "Ver versus" (cómo viene comprando el cliente) durante la
     *  visita, igual que en la Propuesta previa. */
    codigoParticularCliente?: string
    onCerrarVisita: () => void
    onClose: () => void
    /** Si se pasa (y enCurso), aparece el botón de minimizar en el header. */
    onMinimize?: () => void
    cerrando?: boolean
}

export default function VisitaSheet({
    open,
    visitaId,
    nombreCliente,
    visitaCerrada,
    enCurso,
    codigoParticularCliente,
    onCerrarVisita,
    onClose,
    onMinimize,
    cerrando,
}: VisitaSheetProps) {
    const segundos = useVisitaTimer(visitaId)
    const { data: rubros = [], isSuccess: rubrosCargados } = useRubros(open ? visitaId : null)
    const { data: motivos = [] } = useMotivos('rubro')
    const resolverTodos = useResolverRubros(visitaId)
    const eliminar = useEliminarRubro(visitaId)

    const [wizard, setWizard] = useState<{ rubros: IVisitaRubro[]; index: number } | null>(null)
    // Fuente de verdad de la resolución mientras la visita está abierta: se inicializa
    // desde localStorage (o desde `rubros` si no había nada) y se persiste en cada
    // cambio. No se manda al backend hasta "Cerrar visita" — ver cerrarConBorrador.
    const [borradores, setBorradores] = useState<Record<number, IRubroMotivo[]>>({})
    const [borradorListo, setBorradorListo] = useState(false)
    const [guardandoBorrador, setGuardandoBorrador] = useState(false)
    const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
    const [vista, setVista] = useState<Vista>('list')
    const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())
    const [loteMotivos, setLoteMotivos] = useState<IRubroMotivo[]>([])

    // Solo se pide cuando el vendedor la abre: TODOS los rubros del cliente
    // (Actual/M.Ant/Prom.6M), independiente de la propuesta/lista de caídas.
    const { data: rubroStatus = [], isLoading: rubroStatusLoading } = useRubroStatus(
        vista === 'versus' ? (codigoParticularCliente ?? null) : null,
    )

    useEffect(() => {
        if (!open) {
            setWizard(null)
            setBorradores({})
            setBorradorListo(false)
            setErrorGuardado(null)
            setVista('list')
            setSeleccionados(new Set())
            setLoteMotivos([])
        }
    }, [open])

    // Corre cada vez que `rubros` cambia (primera carga, o un refetch tras agregar/
    // eliminar). La primera vez (borradores todavía vacío) arranca desde localStorage;
    // las siguientes solo completan ids nuevos, sin pisar lo que el vendedor ya tildó
    // en memoria.
    useEffect(() => {
        if (!open || !rubrosCargados) return
        setBorradores(prev => {
            const base = Object.keys(prev).length > 0 ? prev : (leerBorrador(visitaId) ?? {})
            const next = { ...base }
            for (const r of rubros) if (!(r.id in next)) next[r.id] = r.motivos
            return next
        })
        setBorradorListo(true)
    }, [open, rubrosCargados, visitaId, rubros])

    // Recién después de inicializar (ver arriba): si esto corriera antes, un objeto
    // vacío pisaría un borrador ya guardado de una sesión anterior.
    useEffect(() => {
        if (!open || !borradorListo) return
        guardarBorrador(visitaId, borradores)
    }, [open, borradorListo, visitaId, borradores])

    // Una visita cerrada no se reedita (se genera una visita de ajuste aparte). Ya no
    // puede cerrarse con rubros sin cargar (ver cerrarConBorrador), así que no hace
    // falta el caso "cerrada pero con un rubro sin resolver todavía".
    function esEditable(_r: IVisitaRubro) {
        return !visitaCerrada
    }

    function abrirWizard(rubro: IVisitaRubro) {
        const subset = rubros.filter(esEditable)
        const index = subset.findIndex(r => r.id === rubro.id)
        setWizard({ rubros: subset, index })
    }

    // El wizard ya escribió todo en `borradores` en cada tilde (ver onCambiarBorrador
    // más abajo) — acá solo queda cerrar y volver a la lista.
    function finalizar() {
        setWizard(null)
    }

    function toggleSeleccion(rubroId: number) {
        setSeleccionados(prev => {
            const next = new Set(prev)
            if (next.has(rubroId)) next.delete(rubroId)
            else next.add(rubroId)
            return next
        })
    }

    // Fusiona (por motivoId) el borrador compartido del lote en cada rubro seleccionado,
    // sin pisar los motivos que ya tuviera cargados. Igual que el wizard individual, no
    // llama al backend: el cambio queda en `borradores` (y por lo tanto en localStorage).
    function aplicarLote() {
        setBorradores(prev => {
            const next = { ...prev }
            for (const rubroId of seleccionados) {
                const actual = next[rubroId] ?? []
                const porId = new Map(actual.map(m => [m.motivoId, m]))
                for (const m of loteMotivos) porId.set(m.motivoId, m)
                next[rubroId] = [...porId.values()]
            }
            return next
        })
        setSeleccionados(new Set())
        setLoteMotivos([])
        setVista('list')
    }

    function rubroCompleto(r: IVisitaRubro): boolean {
        const motivosDelRubro = borradores[r.id] ?? r.motivos
        return motivosDelRubro.length > 0 && !tieneDetalleIncompleto(motivos, motivosDelRubro)
    }

    const pendientes = rubros.filter(r => !rubroCompleto(r)).length

    const necesitaMarcasLote = loteMotivos.some(
        m => motivos.find(cat => cat.motivoId === m.motivoId)?.requiereDetalle,
    )
    const { data: marcasLote = [], isLoading: marcasLoteLoading } = useBrandCatalog(
        vista === 'resolverLote' && necesitaMarcasLote,
    )

    // Único punto de guardado contra el backend: junta todo lo que cambió contra lo
    // que ya tiene el servidor, lo manda en un solo batch y, si sale bien, recién ahí
    // limpia el borrador y dispara el cierre real (geolocalización + endpoint), que
    // maneja el padre (VisitaFlow) vía onCerrarVisita.
    async function cerrarConBorrador() {
        setErrorGuardado(null)
        const cambios = rubros
            .filter(r => !motivosIguales(borradores[r.id] ?? [], r.motivos))
            .map(r => ({ rubroId: r.id, motivos: borradores[r.id] ?? [] }))

        if (cambios.length > 0) {
            setGuardandoBorrador(true)
            try {
                const resultados = await resolverTodos.mutateAsync(cambios)
                if (resultados.some(res => res.error)) {
                    setErrorGuardado(
                        'No se pudo guardar la resolución de algunos rubros. Volvé a intentar.',
                    )
                    return
                }
            } finally {
                setGuardandoBorrador(false)
            }
        }

        limpiarBorrador(visitaId)
        onCerrarVisita()
    }

    // El pie es fijo (fuera del scroll) tanto en list (Cerrar visita) como en el
    // wizard (Atrás/Siguiente-o-Finalizar): así no se oculta al expandir el detalle de
    // un motivo (ej. Precio), que empuja el contenido hacia abajo.
    const footer = wizard ? (
        <ResolucionWizardAcciones
            rubros={wizard.rubros}
            index={wizard.index}
            motivos={motivos}
            borradores={borradores}
            onIndexChange={index => setWizard(w => (w ? { ...w, index } : w))}
            onFinalizar={finalizar}
        />
    ) : vista === 'agregar' ? null : vista === 'resolverLote' ? (
        <ResolverLoteAcciones
            motivos={motivos}
            value={loteMotivos}
            cantidad={seleccionados.size}
            onCancelar={() => {
                setVista('list')
                setLoteMotivos([])
            }}
            onAplicar={aplicarLote}
        />
    ) : seleccionados.size > 0 ? (
        <SeleccionBar
            cantidad={seleccionados.size}
            onCancelar={() => setSeleccionados(new Set())}
            onResolver={() => setVista('resolverLote')}
        />
    ) : (
        <>
            {pendientes > 0 && (
                <p className="mb-2 text-center text-[12px] font-semibold text-[#B45309]">
                    Faltan completar {pendientes} {pendientes === 1 ? 'rubro' : 'rubros'} para
                    poder cerrar la visita.
                </p>
            )}
            {errorGuardado && (
                <p className="mb-2 text-center text-[12.5px] font-semibold text-dsred">
                    {errorGuardado}
                </p>
            )}
            {!visitaCerrada && (
                <Button
                    onClick={cerrarConBorrador}
                    disabled={pendientes > 0}
                    loading={cerrando || guardandoBorrador}
                    className="h-12 w-full bg-dsorange text-[15px] hover:bg-dsorange/90"
                >
                    {guardandoBorrador ? 'Guardando…' : cerrando ? 'Cerrando…' : 'Cerrar visita'}
                </Button>
            )}
        </>
    )

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            onMinimize={enCurso ? onMinimize : undefined}
            title={nombreCliente}
            eyebrow={enCurso ? `● En curso · ${formatearDuracion(segundos)}` : 'Propuesta comercial'}
            eyebrowClassName={enCurso ? 'text-[#B45309]' : undefined}
            footer={footer}
        >
            {wizard ? (
                <ResolucionWizard
                    rubros={wizard.rubros}
                    index={wizard.index}
                    motivos={motivos}
                    borradores={borradores}
                    onCambiarBorrador={(rubroId, m) => setBorradores(prev => ({ ...prev, [rubroId]: m }))}
                    onVolver={() => setWizard(null)}
                />
            ) : vista === 'resolverLote' ? (
                <ResolverLoteVista
                    motivos={motivos}
                    marcas={marcasLote}
                    marcasLoading={marcasLoteLoading}
                    cantidad={seleccionados.size}
                    value={loteMotivos}
                    onChange={setLoteMotivos}
                    onVolver={() => {
                        setVista('list')
                        setLoteMotivos([])
                    }}
                />
            ) : vista === 'agregar' ? (
                <AgregarRubroVista
                    visitaId={visitaId}
                    codesEnVisita={rubros.map(r => r.rubroCode)}
                    onVolver={() => setVista('list')}
                    onAgregado={() => setVista('list')}
                />
            ) : vista === 'versus' ? (
                <div>
                    <div className="mb-3.5 flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            aria-label="Volver"
                            onClick={() => setVista('list')}
                            className="h-[29px] w-[29px] border-[#E1E6F0] text-dsmuted"
                        >
                            <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                        </Button>
                        <span className="text-[13px] font-bold text-[#182645]">
                            Cómo viene comprando
                        </span>
                    </div>
                    {rubroStatusLoading ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-dsmuted">
                            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                            Cargando…
                        </div>
                    ) : (
                        <VersusTable rubros={rubroStatus} />
                    )}
                </div>
            ) : (
                <div>
                    <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                        Cargá el resultado de cada rubro que ofreciste. Los que no ofreciste se
                        resuelven con <b className="font-bold text-[#182645]">"No lo ofrecí"</b>.
                    </p>

                    <div className="flex flex-col gap-2.5">
                        {rubros.map(r => {
                            const editable = esEditable(r)
                            return (
                                <RubroCard
                                    key={r.id}
                                    nombre={r.rubroDescripcion}
                                    motivosCargados={!r.resuelto ? (borradores[r.id] ?? r.motivos).length : undefined}
                                    onResolucion={editable ? () => abrirWizard(r) : undefined}
                                    seleccionable={editable}
                                    seleccionado={seleccionados.has(r.id)}
                                    onToggleSeleccion={() => toggleSeleccion(r.id)}
                                    onEliminar={!r.esPropuesto && editable ? () => eliminar.mutate(r.id) : undefined}
                                />
                            )
                        })}
                        {rubros.length === 0 && (
                            <div className="text-sm text-dsmuted">
                                Esta visita no tiene rubros propuestos.
                            </div>
                        )}
                    </div>

                    {!visitaCerrada && (
                        <Button
                            variant="outline"
                            onClick={() => setVista('agregar')}
                            className="mt-3.5 h-[46px] w-full border-[#C9D2E3] text-[14px] font-bold text-dsnavy"
                        >
                            <Plus className="h-[15px] w-[15px]" strokeWidth={2.4} />
                            Agregar rubro
                        </Button>
                    )}

                    {codigoParticularCliente && (
                        <Button
                            variant="outline"
                            onClick={() => setVista('versus')}
                            className="mt-2.5 h-[46px] w-full border-[#C9D2E3] text-[14px] font-bold text-dsnavy"
                        >
                            <Maximize2 className="h-[15px] w-[15px]" strokeWidth={2.4} />
                            Ver versus
                        </Button>
                    )}
                </div>
            )}
        </BottomSheet>
    )
}
