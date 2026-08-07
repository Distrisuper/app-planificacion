import { useEffect, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import ResolucionWizard from './propuesta/ResolucionWizard'
import ResolucionWizardAcciones from './propuesta/ResolucionWizardAcciones'
import RubroTable from './propuesta/RubroTable'
import AccionesExternas from './AccionesExternas'
import { construirFilasVisita } from './propuesta/filas'
import { useMotivos } from '@/hooks/useMotivos'
import { useRubros, useResolverRubros, useAgregarRubro, useEliminarRubro } from '@/hooks/useRubros'
import { useRubroStatus } from '@/hooks/useRubroStatus'
import { useVisitaTimer } from '@/hooks/useVisitaTimer'
import { formatearDuracion } from '@/lib/visitaTimer'
import { motivosIguales, tieneDetalleIncompleto } from '@/lib/resolucionRubro'
import { leerBorrador, guardarBorrador, limpiarBorrador } from '@/lib/resolucionDraft'
import type { AppExterna } from '@/lib/appsExternas'
import type { IRubroMotivo, IVisitaRubro, IVisitClientCard } from '@/types/planificacion'

interface VisitaSheetProps {
    open: boolean
    visitaId: number
    nombreCliente: string
    /** true = se entró solo a completar rubros de una visita ya cerrada. */
    visitaCerrada: boolean
    /** true = la visita está en curso (no cerrada): pinta el eyebrow naranja + cronómetro. */
    enCurso?: boolean
    /** Si se pasa, habilita la tabla "cómo viene comprando" durante la visita, igual
     *  que en la Propuesta previa. */
    codigoParticularCliente?: string
    onCerrarVisita: () => void
    onClose: () => void
    /** Si se pasa (y enCurso), aparece el botón de minimizar en el header. */
    onMinimize?: () => void
    cerrando?: boolean
    /** Cliente completo, solo para las apps externas. Va junto con onAbrirAppExterna —
     *  sin las dos no se muestra la fila. */
    cliente?: IVisitClientCard
    onAbrirAppExterna?: (app: AppExterna, cliente: IVisitClientCard) => void
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
    cliente,
    onAbrirAppExterna,
}: VisitaSheetProps) {
    const segundos = useVisitaTimer(visitaId)
    const { data: rubros = [], isSuccess: rubrosCargados } = useRubros(open ? visitaId : null)
    const { data: motivos = [] } = useMotivos('rubro')
    const resolverTodos = useResolverRubros(visitaId)
    const agregar = useAgregarRubro(visitaId)
    const eliminar = useEliminarRubro(visitaId)

    const [wizard, setWizard] = useState<{ rubros: IVisitaRubro[]; index: number } | null>(null)
    // Fuente de verdad de la resolución mientras la visita está abierta: se inicializa
    // desde localStorage (o desde `rubros` si no había nada) y se persiste en cada
    // cambio. No se manda al backend hasta "Cerrar visita" — ver cerrarConBorrador.
    const [borradores, setBorradores] = useState<Record<number, IRubroMotivo[]>>({})
    const [borradorListo, setBorradorListo] = useState(false)
    const [guardandoBorrador, setGuardandoBorrador] = useState(false)
    const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
    const [expandido, setExpandido] = useState(false)
    // Los ids que se agregaron dinámicamente esta sesión, más reciente primero — se
    // usan para insertarlos arriba de todo en la lista al agregarlos (ver
    // `conNuevosArriba`). Es una decisión deliberada que NO se generaliza a "reordenar
    // por estado": si además reordenara al resolver, la fila saltaría de posición justo
    // cuando el vendedor la está completando (ver nota en `construirFilasVisita`).
    const [agregadosIds, setAgregadosIds] = useState<number[]>([])
    // Ambas mutaciones (agregar/eliminar) son una sola instancia compartida por todas
    // las filas de la tabla: `agregar.isPending`/`agregar.variables` solo reflejan la
    // ÚLTIMA llamada a `.mutate()`, no todas las que puedan estar en vuelo a la vez. Si
    // el vendedor toca dos filas agregables antes de que la primera request vuelva, el
    // spinner/disabled de la primera se apagaría solo aunque siga en curso. Por eso el
    // estado de "en vuelo" se lleva acá, por rubroCode/id, independiente de la mutación.
    const [agregandoCodes, setAgregandoCodes] = useState<Set<string>>(new Set())
    const [eliminandoIds, setEliminandoIds] = useState<Set<number>>(new Set())

    // Se pide al abrir el sheet, no al entrar a una sub-vista: la tabla es la fuente de
    // los números en las dos pantallas y en los dos estados (colapsada/expandida).
    const { data: rubroStatus = [] } = useRubroStatus(open ? (codigoParticularCliente ?? null) : null)

    useEffect(() => {
        if (!open) {
            setWizard(null)
            setBorradores({})
            setBorradorListo(false)
            setErrorGuardado(null)
            setExpandido(false)
            setAgregadosIds([])
            setAgregandoCodes(new Set())
            setEliminandoIds(new Set())
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

    function abrirResolucion(visitaRubroId: number) {
        const rubro = rubros.find(r => r.id === visitaRubroId)
        if (rubro) abrirWizard(rubro)
    }

    // mutateAsync (no mutate) a propósito: los callbacks que se pasan como segundo
    // argumento de `.mutate()` viven en un solo campo del observer, compartido por
    // toda la vida del hook — una segunda llamada concurrente pisa los callbacks de
    // la primera antes de que termine, y su "en vuelo" queda deshabilitado para
    // siempre. mutateAsync devuelve una promesa propia de CADA llamada, así que el
    // try/finally de acá sí queda atado a la request correcta.
    async function agregarDesdeTabla(rubroCode: string) {
        const item = rubroStatus.find(s => s.rubroCode === rubroCode)
        if (!item) return
        setAgregandoCodes(prev => new Set(prev).add(rubroCode))
        try {
            const result = await agregar.mutateAsync({ rubroCode: item.rubroCode, rubroDescripcion: item.nombre })
            setAgregadosIds(prev => [result.visitaRubroId, ...prev])
        } catch {
            // Silencioso a propósito: la fila vuelve a su estado agregable y el
            // vendedor puede volver a tocarla (mismo comportamiento que antes).
        } finally {
            setAgregandoCodes(prev => {
                const next = new Set(prev)
                next.delete(rubroCode)
                return next
            })
        }
    }

    async function eliminarDesdeTabla(visitaRubroId: number) {
        setEliminandoIds(prev => new Set(prev).add(visitaRubroId))
        try {
            await eliminar.mutateAsync(visitaRubroId)
        } catch {
            // Silencioso a propósito: mismo criterio que agregarDesdeTabla.
        } finally {
            setEliminandoIds(prev => {
                const next = new Set(prev)
                next.delete(visitaRubroId)
                return next
            })
        }
    }

    // Los recién agregados van arriba de todo (en el orden en que se agregaron, el
    // último primero) para que el vendedor los encuentre sin buscarlos entre los que
    // ya estaban. Una vez ahí NO se vuelven a mover — ni siquiera al resolverlos —
    // porque el orden solo se recalcula acá, a partir de `agregadosIds`, no a partir
    // del estado de resolución de cada rubro.
    function conNuevosArriba(rubrosVisita: IVisitaRubro[]): IVisitaRubro[] {
        if (agregadosIds.length === 0) return rubrosVisita
        const porId = new Map(rubrosVisita.map(r => [r.id, r]))
        const nuevos = agregadosIds.map(id => porId.get(id)).filter((r): r is IVisitaRubro => r != null)
        const nuevosIds = new Set(agregadosIds)
        const resto = rubrosVisita.filter(r => !nuevosIds.has(r.id))
        return [...nuevos, ...resto]
    }

    // El wizard ya escribió todo en `borradores` en cada tilde (ver onCambiarBorrador
    // más abajo) — acá solo queda cerrar y volver a la lista.
    function finalizar() {
        setWizard(null)
    }

    function rubroCompleto(r: IVisitaRubro): boolean {
        const motivosDelRubro = borradores[r.id] ?? r.motivos
        return motivosDelRubro.length > 0 && !tieneDetalleIncompleto(motivos, motivosDelRubro)
    }

    const pendientes = rubros.filter(r => !rubroCompleto(r)).length

    const estadosResolucion: Record<number, { motivosCargados: number; completo: boolean }> = {}
    for (const r of rubros) {
        estadosResolucion[r.id] = {
            motivosCargados: (borradores[r.id] ?? r.motivos).length,
            completo: rubroCompleto(r),
        }
    }
    const codesVisita = new Set(rubros.map(r => r.rubroCode))
    const hayOtrosRubros = rubroStatus.some(s => !codesVisita.has(s.rubroCode))
    const filas = construirFilasVisita(
        conNuevosArriba(rubros),
        rubroStatus,
        estadosResolucion,
        expandido,
        !visitaCerrada,
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
            {/* Fijo junto al botón principal, no adentro del scroll: al expandir la
             *  tabla con "Ver más" la lista puede crecer bastante, y si este botón
             *  quedara al final del contenido scrolleable, minimizarla exigiría
             *  scrollear hasta abajo de todo para volver a encontrarlo. */}
            {hayOtrosRubros && (
                <Button
                    variant="outline"
                    onClick={() => setExpandido(e => !e)}
                    className="mb-2.5 h-[46px] w-full border-[#C9D2E3] text-[14px] font-bold text-dsnavy"
                >
                    {expandido ? (
                        <Minimize2 className="h-[15px] w-[15px]" strokeWidth={2.4} />
                    ) : (
                        <Maximize2 className="h-[15px] w-[15px]" strokeWidth={2.4} />
                    )}
                    {expandido ? 'Ver menos' : 'Ver más'}
                </Button>
            )}
            {/* Pegado arriba de "Cerrar visita", en el pie fijo: es la última acción a
             *  mano antes de cerrar, para un vistazo de último momento a pagos/cuenta sin
             *  scrollear hasta arriba a buscarlo. Mismo criterio que antes sobre el wizard
             *  (no se muestra ahí): este bloque solo se arma en la rama de lista. */}
            {cliente && onAbrirAppExterna && (
                <div className="mb-2.5">
                    <AccionesExternas cliente={cliente} variante="fila" onAbrir={onAbrirAppExterna} />
                </div>
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
                    visitaId={visitaId}
                    rubros={wizard.rubros}
                    index={wizard.index}
                    motivos={motivos}
                    borradores={borradores}
                    onCambiarBorrador={(rubroId, m) => setBorradores(prev => ({ ...prev, [rubroId]: m }))}
                    onVolver={() => setWizard(null)}
                />
            ) : (
                <div>
                    <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                        Cargá el resultado de cada rubro que ofreciste. Los que no ofreciste se
                        resuelven con <b className="font-bold text-[#182645]">"No lo ofrecí"</b>.
                    </p>

                    {filas.length === 0 ? (
                        <div className="text-sm text-dsmuted">Esta visita no tiene rubros propuestos.</div>
                    ) : (
                        <RubroTable
                            filas={filas}
                            onResolucion={abrirResolucion}
                            onAgregar={agregarDesdeTabla}
                            onEliminar={eliminarDesdeTabla}
                            agregandoCodes={agregandoCodes}
                            eliminandoIds={eliminandoIds}
                        />
                    )}
                </div>
            )}
        </BottomSheet>
    )
}
