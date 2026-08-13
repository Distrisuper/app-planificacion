import { useEffect, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import ResolucionWizard from './propuesta/ResolucionWizard'
import ResolucionWizardAcciones from './propuesta/ResolucionWizardAcciones'
import OfrecimientoTable from './propuesta/OfrecimientoTable'
import AgregarOfrecimientoSheet from './propuesta/AgregarOfrecimientoSheet'
import AccionesExternas from './AccionesExternas'
import { construirFilasVisita } from './propuesta/filas'
import { useMotivos } from '@/hooks/useMotivos'
import {
    useOfrecimientos,
    useResolverOfrecimientos,
    useAgregarOfrecimiento,
    useEliminarOfrecimiento,
} from '@/hooks/useOfrecimientos'
import { useAcciones } from '@/hooks/useAcciones'
import { useBrandCatalog } from '@/hooks/useCatalogos'
import { useRubroStatus } from '@/hooks/useRubroStatus'
import { useVisitaTimer } from '@/hooks/useVisitaTimer'
import { formatearDuracion } from '@/lib/visitaTimer'
import { motivosIguales, tieneDetalleIncompleto } from '@/lib/resolucionOfrecimiento'
import { leerBorrador, guardarBorrador, limpiarBorrador } from '@/lib/resolucionDraft'
import type { AppExterna } from '@/lib/appsExternas'
import type { IOfrecimiento, IOfrecimientoMotivo, IVisitClientCard } from '@/types/planificacion'

interface VisitaSheetProps {
    open: boolean
    visitaId: number
    nombreCliente: string
    /** true = se entró solo a completar ofrecimientos de una visita ya cerrada. */
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
    const { data: ofrecimientos = [], isSuccess: ofrecimientosCargados } = useOfrecimientos(open ? visitaId : null)
    const { data: motivos = [] } = useMotivos('ofrecimiento')
    const resolverTodos = useResolverOfrecimientos(visitaId)
    const agregar = useAgregarOfrecimiento(visitaId)
    const eliminar = useEliminarOfrecimiento(visitaId)

    const [wizard, setWizard] = useState<{ ofrecimientos: IOfrecimiento[]; index: number } | null>(null)
    // Fuente de verdad de la resolución mientras la visita está abierta: se inicializa
    // desde localStorage (o desde `ofrecimientos` si no había nada) y se persiste en cada
    // cambio. No se manda al backend hasta "Cerrar visita" — ver cerrarConBorrador.
    const [borradores, setBorradores] = useState<Record<number, IOfrecimientoMotivo[]>>({})
    const [borradorListo, setBorradorListo] = useState(false)
    const [guardandoBorrador, setGuardandoBorrador] = useState(false)
    const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
    const [expandido, setExpandido] = useState(false)
    const [altaAbierta, setAltaAbierta] = useState(false)
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
    // estado de "en vuelo" se lleva acá, por `` `${tipo}:${codigo}` `` (dos tipos
    // distintos pueden compartir código), independiente de la mutación.
    const [agregandoCodes, setAgregandoCodes] = useState<Set<string>>(new Set())
    const [eliminandoIds, setEliminandoIds] = useState<Set<number>>(new Set())

    // Se pide al abrir el sheet, no al entrar a una sub-vista: la tabla es la fuente de
    // los números en las dos pantallas y en los dos estados (colapsada/expandida).
    const { data: rubroStatus = [] } = useRubroStatus(open ? (codigoParticularCliente ?? null) : null)
    const { data: acciones = [] } = useAcciones()
    const { data: marcas = [], isLoading: marcasLoading } = useBrandCatalog(open)

    useEffect(() => {
        if (!open) {
            setWizard(null)
            setBorradores({})
            setBorradorListo(false)
            setErrorGuardado(null)
            setExpandido(false)
            setAltaAbierta(false)
            setAgregadosIds([])
            setAgregandoCodes(new Set())
            setEliminandoIds(new Set())
        }
    }, [open])

    // Corre cada vez que `ofrecimientos` cambia (primera carga, o un refetch tras
    // agregar/eliminar). La primera vez (borradores todavía vacío) arranca desde
    // localStorage; las siguientes solo completan ids nuevos, sin pisar lo que el
    // vendedor ya tildó en memoria.
    useEffect(() => {
        if (!open || !ofrecimientosCargados) return
        setBorradores(prev => {
            const base = Object.keys(prev).length > 0 ? prev : (leerBorrador(visitaId) ?? {})
            const next = { ...base }
            for (const r of ofrecimientos) if (!(r.id in next)) next[r.id] = r.motivos
            return next
        })
        setBorradorListo(true)
    }, [open, ofrecimientosCargados, visitaId, ofrecimientos])

    // Recién después de inicializar (ver arriba): si esto corriera antes, un objeto
    // vacío pisaría un borrador ya guardado de una sesión anterior.
    useEffect(() => {
        if (!open || !borradorListo) return
        guardarBorrador(visitaId, borradores)
    }, [open, borradorListo, visitaId, borradores])

    // Una visita cerrada no se reedita (se genera una visita de ajuste aparte). Ya no
    // puede cerrarse con ofrecimientos sin cargar (ver cerrarConBorrador), así que no
    // hace falta el caso "cerrada pero con un ofrecimiento sin resolver todavía".
    function esEditable(_r: IOfrecimiento) {
        return !visitaCerrada
    }

    function abrirWizard(ofrecimiento: IOfrecimiento) {
        const subset = ofrecimientos.filter(esEditable)
        const index = subset.findIndex(r => r.id === ofrecimiento.id)
        setWizard({ ofrecimientos: subset, index })
    }

    function abrirResolucion(ofrecimientoId: number) {
        const ofrecimiento = ofrecimientos.find(r => r.id === ofrecimientoId)
        if (ofrecimiento) abrirWizard(ofrecimiento)
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
        const clave = `rubro:${rubroCode}`
        setAgregandoCodes(prev => new Set(prev).add(clave))
        try {
            const result = await agregar.mutateAsync({
                tipo: 'rubro',
                codigo: item.rubroCode,
                descripcion: item.nombre,
            })
            setAgregadosIds(prev => [result.ofrecimientoId, ...prev])
        } catch {
            // Silencioso a propósito: la fila vuelve a su estado agregable y el
            // vendedor puede volver a tocarla (mismo comportamiento que antes).
        } finally {
            setAgregandoCodes(prev => {
                const next = new Set(prev)
                next.delete(clave)
                return next
            })
        }
    }

    async function agregarDesdeSheet(dto: Parameters<typeof agregar.mutateAsync>[0]) {
        const clave = `${dto.tipo}:${dto.codigo}`
        setAgregandoCodes(prev => new Set(prev).add(clave))
        try {
            const result = await agregar.mutateAsync(dto)
            setAgregadosIds(prev => [result.ofrecimientoId, ...prev])
        } catch {
            // Silencioso a propósito: mismo criterio que agregarDesdeTabla.
        } finally {
            setAgregandoCodes(prev => {
                const next = new Set(prev)
                next.delete(clave)
                return next
            })
        }
    }

    async function eliminarDesdeTabla(ofrecimientoId: number) {
        setEliminandoIds(prev => new Set(prev).add(ofrecimientoId))
        try {
            await eliminar.mutateAsync(ofrecimientoId)
        } catch {
            // Silencioso a propósito: mismo criterio que agregarDesdeTabla.
        } finally {
            setEliminandoIds(prev => {
                const next = new Set(prev)
                next.delete(ofrecimientoId)
                return next
            })
        }
    }

    // Los recién agregados van arriba de todo (en el orden en que se agregaron, el
    // último primero) para que el vendedor los encuentre sin buscarlos entre los que
    // ya estaban. Una vez ahí NO se vuelven a mover — ni siquiera al resolverlos —
    // porque el orden solo se recalcula acá, a partir de `agregadosIds`, no a partir
    // del estado de resolución de cada ofrecimiento.
    function conNuevosArriba(ofrecimientosVisita: IOfrecimiento[]): IOfrecimiento[] {
        if (agregadosIds.length === 0) return ofrecimientosVisita
        const porId = new Map(ofrecimientosVisita.map(r => [r.id, r]))
        const nuevos = agregadosIds.map(id => porId.get(id)).filter((r): r is IOfrecimiento => r != null)
        const nuevosIds = new Set(agregadosIds)
        const resto = ofrecimientosVisita.filter(r => !nuevosIds.has(r.id))
        return [...nuevos, ...resto]
    }

    // El wizard ya escribió todo en `borradores` en cada tilde (ver onCambiarBorrador
    // más abajo) — acá solo queda cerrar y volver a la lista.
    function finalizar() {
        setWizard(null)
    }

    function ofrecimientoCompleto(r: IOfrecimiento): boolean {
        const motivosDelOfrecimiento = borradores[r.id] ?? r.motivos
        return motivosDelOfrecimiento.length > 0 && !tieneDetalleIncompleto(motivos, motivosDelOfrecimiento)
    }

    const pendientes = ofrecimientos.filter(r => !ofrecimientoCompleto(r)).length

    const estadosResolucion: Record<number, { motivosCargados: number; completo: boolean }> = {}
    for (const r of ofrecimientos) {
        estadosResolucion[r.id] = {
            motivosCargados: (borradores[r.id] ?? r.motivos).length,
            completo: ofrecimientoCompleto(r),
        }
    }
    const codesVisita = new Set(ofrecimientos.map(r => r.codigo))
    const hayOtrosRubros = rubroStatus.some(s => !codesVisita.has(s.rubroCode))
    const filas = construirFilasVisita(
        conNuevosArriba(ofrecimientos),
        rubroStatus,
        estadosResolucion,
        expandido,
        !visitaCerrada,
    )
    const rubrosCatalogo = rubroStatus.map(s => ({ code: s.rubroCode, description: s.nombre }))
    const accionesCatalogo = acciones.map(a => ({ code: a.codigo, description: a.descripcion }))

    // Único punto de guardado contra el backend: junta todo lo que cambió contra lo
    // que ya tiene el servidor, lo manda en un solo batch y, si sale bien, recién ahí
    // limpia el borrador y dispara el cierre real (geolocalización + endpoint), que
    // maneja el padre (VisitaFlow) vía onCerrarVisita.
    async function cerrarConBorrador() {
        setErrorGuardado(null)
        const cambios = ofrecimientos
            .filter(r => !motivosIguales(borradores[r.id] ?? [], r.motivos))
            .map(r => ({ ofrecimientoId: r.id, motivos: borradores[r.id] ?? [] }))

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
            ofrecimientos={wizard.ofrecimientos}
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
        <>
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
                        ofrecimientos={wizard.ofrecimientos}
                        index={wizard.index}
                        motivos={motivos}
                        borradores={borradores}
                        onCambiarBorrador={(ofrecimientoId, m) =>
                            setBorradores(prev => ({ ...prev, [ofrecimientoId]: m }))
                        }
                        onVolver={() => setWizard(null)}
                    />
                ) : (
                    <div>
                        <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                            Cargá el resultado de cada rubro que ofreciste. Los que no ofreciste se
                            resuelven con <b className="font-bold text-[#182645]">"No lo ofrecí"</b>.
                        </p>

                        {!visitaCerrada && (
                            <Button
                                variant="outline"
                                onClick={() => setAltaAbierta(true)}
                                className="mb-3 h-10 w-full border-[#C9D2E3] text-[13px] font-bold text-dsnavy"
                            >
                                Agregar otra cosa
                            </Button>
                        )}

                        {filas.length === 0 ? (
                            <div className="text-sm text-dsmuted">Esta visita no tiene rubros propuestos.</div>
                        ) : (
                            <OfrecimientoTable
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

            <BottomSheet
                open={altaAbierta}
                onClose={() => setAltaAbierta(false)}
                title="Agregar otra cosa"
            >
                <AgregarOfrecimientoSheet
                    open={altaAbierta}
                    onClose={() => setAltaAbierta(false)}
                    onAgregar={dto => agregarDesdeSheet(dto)}
                    acciones={accionesCatalogo}
                    marcas={marcas}
                    rubros={rubrosCatalogo}
                    marcasLoading={marcasLoading}
                />
            </BottomSheet>
        </>
    )
}
