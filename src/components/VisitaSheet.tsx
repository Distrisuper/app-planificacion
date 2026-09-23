import { useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, WifiOff, X } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import ResolucionWizard from './propuesta/ResolucionWizard'
import ResolucionWizardAcciones from './propuesta/ResolucionWizardAcciones'
import OfrecimientoTable from './propuesta/OfrecimientoTable'
import AgregarOfrecimientoSheet from './propuesta/AgregarOfrecimientoSheet'
import AccionesExternas from './AccionesExternas'
import { construirFilasVisita, rubrosElegibles } from './propuesta/filas'
import { conDescuentos, hayDescuentosParaMostrar } from '@/lib/descuentosMarca'
import DescuentosMarcaSheet, { ChipDescuentos } from './DescuentosMarcaSheet'
import { useMotivos } from '@/hooks/useMotivos'
import {
    useOfrecimientos,
    useResolverOfrecimientos,
    useAgregarOfrecimiento,
    useEliminarOfrecimiento,
} from '@/hooks/useOfrecimientos'
import { useBrandCatalog } from '@/hooks/useCatalogos'
import { useRubroStatus } from '@/hooks/useRubroStatus'
import { useVisitaTimer } from '@/hooks/useVisitaTimer'
import { formatearDuracion } from '@/lib/visitaTimer'
import { estadoVisitaVivo, PALETA_VISITA_VIVO, ROTULO_VISITA_VIVO } from '@/lib/estadoDuracion'
import { motivosIguales, tieneDetalleIncompleto } from '@/lib/resolucionOfrecimiento'
import { puedeCerrarAlta } from '@/lib/alta'
import {
    leerBorrador,
    guardarBorrador,
    limpiarBorrador,
    leerDetalles,
    guardarDetalles,
    limpiarDetalles,
    leerObservaciones,
    guardarObservaciones,
    limpiarObservaciones,
    leerMarcasOfrecidas,
    guardarMarcasOfrecidas,
    limpiarMarcasOfrecidas,
} from '@/lib/resolucionDraft'
import type { AppExterna } from '@/lib/appsExternas'
import type {
    IAccionComercial,
    IDetalleContactoAlta,
    IMarcaOfrecida,
    IOfrecimiento,
    IOfrecimientoMotivo,
    IVisitClientCard,
} from '@/types/planificacion'

/** Marcas ya declaradas para este ofrecimiento (alcance tipo='marca' de la propuesta
 *  congelada), para precargar el borrador y para compararlo al detectar cambios. */
function marcasDelAlcance(r: IOfrecimiento): IMarcaOfrecida[] {
    return r.alcance
        .filter(a => a.tipo === 'marca')
        .map(a => ({ codigo: a.codigo, descripcion: a.descripcion }))
}

/** Tiene que coincidir con el VARCHAR(500) de pl_resolucion.observaciones y con
 *  OBSERVACIONES_MAX del controller de api-vendedores. */
const OBSERVACIONES_MAX = 500

interface VisitaSheetProps {
    open: boolean
    visitaId: number
    nombreCliente: string
    /** Línea de identidad bajo el título: `#10034 · DERQUI AUTOPARTES SRL`. La arma
     *  `identidadCliente` en VisitaFlow — ver ahí por qué la razón social no siempre va. */
    identidad?: string
    /** true = la visita ya está cerrada y el sheet es de CONSULTA: no se puede resolver
     *  ni agregar nada (ver `esEditable`). Los rubros se cargan durante la visita; una vez
     *  cerrada no hay forma de completar los que quedaron pendientes. */
    visitaCerrada: boolean
    /** true = la visita está en curso (no cerrada): pinta el eyebrow del semáforo +
     *  cronómetro. */
    enCurso?: boolean
    /** true = el vendedor está lejos del cliente DE ESTA visita, con la visita abierta.
     *  Lo calcula `useAlejadoDelCliente`, en VisitaFlow.
     *
     *  Alimenta dos cosas: el eyebrow pasa a rojo (igual que la barra flotante — es la
     *  misma visita vista desde el otro lado del minimizar) y aparece el aviso con
     *  "Ver mi posición" arriba de Cerrar visita.
     *
     *  El llamador tiene que asegurarse de que la visita abierta en el sheet sea la que
     *  está en curso (ver `esClienteEnCurso` en VisitaFlow): el vendedor puede estar
     *  mirando la propuesta de otro cliente mientras la visita corre en otro lado, y ahí
     *  este aviso no aplica. */
    alejado?: boolean
    /** Si se pasa, habilita la tabla "cómo viene comprando" durante la visita, igual
     *  que en la Propuesta previa. */
    codigoParticularCliente?: string
    /** true = visita de "Cliente nuevo" (spec 2026-09-17): no hay propuesta congelada,
     *  así que el gate de cierre es `puedeCerrarAlta` en vez del mínimo de 2 rubros, y
     *  el sheet suma dos campos de contacto opcionales junto a observaciones. */
    esAlta?: boolean
    /** Recibe la observación libre ya normalizada (trim, `''` → null), y — sólo para
     *  `esAlta` con algún campo cargado — el detalle de contacto; `null` en cualquier
     *  otro caso. Se manda en el PUT de cierre, que es su único punto de escritura. */
    onCerrarVisita: (observaciones: string | null, detalle: IDetalleContactoAlta | null) => void
    onClose: () => void
    /** Si se pasa (y enCurso), aparece el botón de minimizar en el header. */
    onMinimize?: () => void
    cerrando?: boolean
    /** Cliente completo, solo para las apps externas. Va junto con onAbrirAppExterna —
     *  sin las dos no se muestra la fila. */
    cliente?: IVisitClientCard
    onAbrirAppExterna?: (app: AppExterna, cliente: IVisitClientCard) => void
    /** Abre MapaVisita en modo consulta. Sólo tiene sentido junto con `alejado`. */
    onVerPosicion?: () => void
    /** Si se pasa y la visita está abierta, la línea de identidad del header ofrece "No
     *  visité". Recibe cuántos rubros llevaba completos, para que el llamador pueda
     *  avisarle al vendedor que esos no van a contar. */
    onNoVisita?: (rubrosCargados: number) => void
    /** Sólo `esAlta` con la visita abierta: abre "Datos del comercio" (RelevamientoSheet)
     *  desde la línea de identidad del header, al lado de "No visité". Con la visita
     *  cerrada no se muestra: el backend rebota FILA_RESUELTA y no hay nada que editar. */
    onDatosComercio?: () => void
    /** Sólo `esAlta`: `detalleAlta.contactoNombre`. Precarga "Con quién hablaste" si está
     *  vacío; editable, y nunca pisa lo que el vendedor ya tipeó. Dos conceptos distintos
     *  que conviven: el contacto del COMERCIO (plan) y con quién habló ESTA vez (hecho). */
    contactoSugerido?: string | null
    /** Si se pasa, el header muestra el chip "Datos del comercio" que abre la edición de la
     *  ficha. Se muestra con la visita abierta Y cerrada (es corrección, no carga de rubros).
     *  El llamador decide cuándo pasarlo (VisitaFlow: sólo si no hay pendientes, para no
     *  duplicar la puerta del gate). */
    onEditarDatosComercio?: () => void
}

export default function VisitaSheet({
    open,
    visitaId,
    nombreCliente,
    identidad,
    visitaCerrada,
    enCurso,
    alejado,
    codigoParticularCliente,
    esAlta = false,
    onCerrarVisita,
    onClose,
    onMinimize,
    cerrando,
    cliente,
    onAbrirAppExterna,
    onVerPosicion,
    onNoVisita,
    onDatosComercio,
    contactoSugerido = null,
    onEditarDatosComercio,
}: VisitaSheetProps) {
    const segundos = useVisitaTimer(visitaId)
    const estadoVivo = estadoVisitaVivo(segundos, alejado)
    // `isError`/`refetch` no son un extra: con `data` en undefined, un default `[]` hace que
    // el gate de cierre calcule "0 rubros exigidos" y habilite "Cerrar visita" (así se
    // cerró la visita 923 con sus 5 rubros sin resolver). Mismo criterio que
    // `fallóPropuestaDirecta` en VisitaFlow.
    const {
        data: ofrecimientosData,
        isError: fallóOfrecimientos,
        refetch: reintentarOfrecimientos,
    } = useOfrecimientos(open ? visitaId : null)
    // Deliberadamente NO se usa `isSuccess` para esto. En React Query v5 un refetch fallido
    // pone `status: 'error'` (isSuccess = false) pero CONSERVA `data`: con `isSuccess` como
    // gate, perder señal a mitad de la visita — el refetch de `refetchOnWindowFocus` al
    // volver a la app — borraba de pantalla rubros que seguían en memoria y escondía el
    // botón de cerrar. La pregunta correcta es "¿tengo la lista?", no "¿anduvo el último
    // fetch?": `undefined` es "todavía no sé", y `[]` es "sé que no tiene rubros".
    const ofrecimientos = ofrecimientosData ?? []
    const ofrecimientosCargados = ofrecimientosData !== undefined
    const { data: motivos = [] } = useMotivos('ofrecimiento')
    const resolverTodos = useResolverOfrecimientos(visitaId)
    const agregar = useAgregarOfrecimiento(visitaId)
    const eliminar = useEliminarOfrecimiento(visitaId)

    const [wizard, setWizard] = useState<{ ofrecimientos: IOfrecimiento[]; index: number } | null>(null)
    // Fuente de verdad de la resolución mientras la visita está abierta: se inicializa
    // desde localStorage (o desde `ofrecimientos` si no había nada) y se persiste en cada
    // cambio. No se manda al backend hasta "Cerrar visita" — ver cerrarConBorrador.
    const [borradores, setBorradores] = useState<Record<number, IOfrecimientoMotivo[]>>({})
    const [detalles, setDetalles] = useState<Record<number, IAccionComercial | null>>({})
    const [marcasOfrecidas, setMarcasOfrecidas] = useState<Record<number, IMarcaOfrecida[]>>({})
    const [observaciones, setObservaciones] = useState('')
    // Sólo para `esAlta`: datos de contacto del prospecto, se completan al cerrar la
    // visita (no al crearla). No tienen borrador en localStorage — a diferencia de
    // observaciones, se pierden si se cierra la app a mitad de carga, y se acepta:
    // son opcionales y el flujo de alta es corto.
    const [contacto, setContacto] = useState('')
    const [fechaNacimiento, setFechaNacimiento] = useState('')
    // Al abrir (y si el sugerido cambia), sólo si el campo está vacío. `contacto` no está en
    // las deps a propósito: si estuviera, borrar el campo lo volvería a llenar.
    useEffect(() => {
        if (!open || !esAlta || !contactoSugerido) return
        setContacto(prev => (prev.trim() === '' ? contactoSugerido : prev))
    }, [open, esAlta, contactoSugerido])
    const [borradorListo, setBorradorListo] = useState(false)
    const [descuentosAbierto, setDescuentosAbierto] = useState(false)
    const [guardandoBorrador, setGuardandoBorrador] = useState(false)
    const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
    const [altaAbierta, setAltaAbierta] = useState(false)
    const [mostrarAyuda, setMostrarAyuda] = useState(false)
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
    // Id del ofrecimiento recién agregado (desde el catálogo o desde "Agregar otra
    // cosa"), a la espera de que el refetch de `ofrecimientos` lo traiga para abrirle
    // el wizard. No se puede abrir en el `await` del agregar: ahí el ofrecimiento
    // todavía no existe en la lista que el wizard recorre.
    const [abrirAlLlegar, setAbrirAlLlegar] = useState<number | null>(null)

    // Se pide al abrir el sheet, no al entrar a una sub-vista: la tabla es la fuente de
    // los números en las dos pantallas y en los dos estados (colapsada/expandida).
    const { data: rubroStatus = [] } = useRubroStatus(open ? (codigoParticularCliente ?? null) : null)
    const { data: marcas = [], isLoading: marcasLoading } = useBrandCatalog(open)
    // El mismo universo que las filas de la tabla (el 80/20 mezclado con el historial),
    // y no `rubroStatus`: un cliente sin movimientos no tiene historial, y derivar de ahí
    // los rubros elegibles dejaba el buscador vacío justo donde más importa ofrecer algo.
    const rubrosCatalogo = useMemo(() => rubrosElegibles(rubroStatus), [rubroStatus])

    useEffect(() => {
        if (!open) {
            setWizard(null)
            setBorradores({})
            setDetalles({})
            setMarcasOfrecidas({})
            setObservaciones('')
            setContacto('')
            setFechaNacimiento('')
            setBorradorListo(false)
            setErrorGuardado(null)
            setAltaAbierta(false)
            setAgregadosIds([])
            setAgregandoCodes(new Set())
            setEliminandoIds(new Set())
            setAbrirAlLlegar(null)
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
        setDetalles(prev => (Object.keys(prev).length > 0 ? prev : (leerDetalles(visitaId) ?? {})))
        setMarcasOfrecidas(prev => {
            const base = Object.keys(prev).length > 0 ? prev : (leerMarcasOfrecidas(visitaId) ?? {})
            const next = { ...base }
            for (const r of ofrecimientos) if (!(r.id in next)) next[r.id] = marcasDelAlcance(r)
            return next
        })
        setObservaciones(prev => (prev !== '' ? prev : (leerObservaciones(visitaId) ?? '')))
        setBorradorListo(true)
    }, [open, ofrecimientosCargados, visitaId, ofrecimientos])

    // El catálogo se itera dando de baja motivos (`pl_motivo.activo = 0`), y un borrador
    // guardado antes de esa baja sigue apuntando al motivo viejo. Eso no se puede dejar
    // pasar: el backend rechaza el cierre con 400 MOTIVO_INEXISTENTE (el catálogo que valida
    // filtra por activo), y el checklist tampoco dibuja ese motivo, así que el vendedor no
    // tiene forma de destildarlo — queda sin poder cerrar la visita.
    //
    // Va en su propio efecto y no en la inicialización de arriba porque el catálogo puede
    // llegar después que los ofrecimientos. Con `motivos` vacío no poda nada: filtrar contra
    // un catálogo que todavía no cargó vaciaría el borrador entero.
    //
    // Y NO se poda una visita cerrada: sus motivos son historia, no un borrador. No hay nada
    // que mandar (el botón de cerrar no existe), así que no hay 400 del que protegerse —
    // podarlos solo mostraría como pendiente un rubro que se resolvió con un motivo que
    // después se dio de baja. Mismo criterio que `incluirInactivos` en la analítica: lo
    // histórico se lee como se guardó.
    useEffect(() => {
        if (!open || visitaCerrada || !borradorListo || motivos.length === 0) return
        const vivos = new Set(motivos.map(m => m.motivoId))
        setBorradores(prev => {
            let podado = false
            const next: Record<number, IOfrecimientoMotivo[]> = {}
            for (const [id, lista] of Object.entries(prev)) {
                const vigentes = lista.filter(m => vivos.has(m.motivoId))
                if (vigentes.length !== lista.length) podado = true
                next[Number(id)] = vigentes
            }
            // Devolver `prev` cuando no hubo poda es lo que corta el re-render en loop.
            return podado ? next : prev
        })
    }, [open, visitaCerrada, borradorListo, motivos])

    // Recién después de inicializar (ver arriba): si esto corriera antes, un objeto
    // vacío pisaría un borrador ya guardado de una sesión anterior.
    useEffect(() => {
        if (!open || !borradorListo) return
        guardarBorrador(visitaId, borradores)
        guardarDetalles(visitaId, detalles)
        guardarMarcasOfrecidas(visitaId, marcasOfrecidas)
        guardarObservaciones(visitaId, observaciones)
    }, [open, borradorListo, visitaId, borradores, detalles, marcasOfrecidas, observaciones])

    // Abre el wizard del ofrecimiento recién agregado, en cuanto el refetch de
    // `ofrecimientos` lo trae. Se resuelve acá y no en `agregarDesdeTabla`/
    // `agregarDesdeSheet` porque entre el POST y la lista actualizada hay un refetch
    // de por medio. El ofrecimiento agregado sube al principio de la lista (ver
    // conNuevosArriba), que con el catálogo abierto queda a decenas de filas de scroll
    // de donde el vendedor está parado — abrirle el wizard directo evita ese viaje.
    useEffect(() => {
        if (abrirAlLlegar == null) return
        const nuevo = ofrecimientos.find(r => r.id === abrirAlLlegar)
        if (!nuevo) return
        setAbrirAlLlegar(null)
        // Mismo subset que abrirWizard (`esEditable`): en una visita cerrada no hay nada
        // que resolver, pero tampoco se puede agregar, así que no se llega hasta acá.
        const subset = visitaCerrada ? [] : ofrecimientos
        setWizard({ ofrecimientos: subset, index: subset.findIndex(r => r.id === nuevo.id) })
    }, [abrirAlLlegar, ofrecimientos, visitaCerrada])

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
    // Contra `rubrosCatalogo` y no contra `rubroStatus`: las filas agregables ya no son
    // sólo las del historial del cliente, y resolver la descripción ahí dejaba el ＋ de
    // una fila del catálogo como un botón muerto (el `return` de abajo).
    async function agregarDesdeTabla(rubroCode: string) {
        const item = rubrosCatalogo.find(c => c.code === rubroCode)
        if (!item) return
        const clave = `rubro:${rubroCode}`
        setAgregandoCodes(prev => new Set(prev).add(clave))
        try {
            const result = await agregar.mutateAsync({
                tipo: 'rubro',
                codigo: item.code,
                descripcion: item.description,
            })
            setAgregadosIds(prev => [result.ofrecimientoId, ...prev])
            setAbrirAlLlegar(result.ofrecimientoId)
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
            setAbrirAlLlegar(result.ofrecimientoId)
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

    // Alcanza con un mínimo de 2 rubros completos (o menos, si la propuesta trae menos de 2
    // en total — el mínimo nunca pide más de lo que hay). Es deliberado: con 5 rubros
    // propuestos, resolver 2 habilita el cierre.
    //
    // Y es deliberado a pesar de que los rubros NO se pueden cargar después de cerrar la
    // visita (el sheet pasa a read-only, ver `esEditable`): los que queden sin tocar se
    // pierden. Se acepta ese costo para no trabar al vendedor en el local. Lo que NO se
    // acepta es cerrar con CERO — de ahí el mínimo, y de ahí que el gate dependa también
    // de `ofrecimientosCargados` (ver el pie): sobre una lista vacía, `min(2, 0)` es 0 y
    // el mínimo se auto-satisface. Así se cerró la visita 923 con sus 5 rubros en cero.
    const completos = ofrecimientos.filter(ofrecimientoCompleto).length
    const minimoRequerido = Math.min(2, ofrecimientos.length)
    const faltanParaMinimo = Math.max(0, minimoRequerido - completos)

    // Una visita de alta no tiene propuesta congelada: el `min(2, ofrecidos)` de arriba
    // se auto-satisface en 0 (como pasó con la visita 923), así que ese gate no sirve
    // acá. `puedeCerrarAlta` pide que haya quedado ALGO — un ofrecimiento completo o una
    // observación — en su lugar. Ver src/lib/alta.ts.
    const cierreHabilitado = esAlta ? puedeCerrarAlta(completos, observaciones) : faltanParaMinimo === 0

    // En la línea de identidad del header (junto a `#10034 · FERNANDEZ MARIA ISABEL`) y
    // NO detrás de un menú: un control de un solo ítem escondido atrás de un "⋯" le suma
    // un toque de más a algo que el vendedor necesita encontrar rápido, parado en la
    // puerta de un local cerrado. Tampoco en el pie: es el recurso más escaso del sheet
    // (entran 5 filas de rubros), y una segunda salida del tamaño de un CTA al lado de
    // "Cerrar visita" se lee como el atajo para no cargar rubros. El sheet de una visita
    // cerrada es de consulta, así que ahí no va nada.
    //
    // Mismas proporciones que el botón "Reagendar" de ClienteCard (rectángulo
    // `rounded-lg` con ícono + texto, NO píldora redondeada): una píldora rellena de
    // color se lee como ESTADO en esta app (así son los badges de "Visitado" o
    // seguimiento pendiente) — probado y descartado, se leía como una etiqueta, no como
    // algo tocable. El rectángulo gris-rojizo es el mismo lenguaje que ya usa Reagendar,
    // sólo que en rojo para distinguirlo como la salida negativa.
    // Va en la línea de identidad del header por la misma razón que "No visité": es donde
    // el vendedor lo encuentra rápido, parado en el local. Pero a diferencia de "No
    // visité", se muestra TAMBIÉN con la visita cerrada — es consulta, no edición, y el
    // sheet de una visita cerrada es justamente de consulta. El resto del criterio
    // (cuándo aparece, por qué no va en AccionesExternas) vive en `ChipDescuentos`.
    const chipDescuentos = hayDescuentosParaMostrar(cliente) ? (
        <ChipDescuentos onAbrir={() => setDescuentosAbierto(true)} />
    ) : null

    const botonNoVisita =
        !visitaCerrada && onNoVisita ? (
            <button
                type="button"
                onClick={() => onNoVisita(completos)}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-dsred/25 bg-dsred/8 px-2 text-[11px] font-bold text-dsred"
            >
                <X className="h-[12px] w-[12px]" strokeWidth={2.6} />
                No visité
            </button>
        ) : null

    // Mismo estilo que ChipDescuentos (consulta/edición, no la salida negativa), y ANTES de
    // "No visité": lo negativo queda al borde. Sin menú intermedio (ver comentario de arriba).
    const botonDatos =
        esAlta && !visitaCerrada && onDatosComercio ? (
            <button
                type="button"
                onClick={onDatosComercio}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 text-[11px] font-bold text-violet-700"
            >
                <Pencil className="h-[12px] w-[12px]" strokeWidth={2.4} />
                Datos
            </button>
        ) : null

    const chipDatosComercio = onEditarDatosComercio ? (
        <button
            type="button"
            onClick={onEditarDatosComercio}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-[#C9D2E3] bg-[#F1F4F9] px-2 text-[11px] font-bold text-dsnavy"
        >
            Datos del comercio
        </button>
    ) : null

    // Descuentos primero (consulta), después los datos (relevamiento del alta / corrección
    // de la ficha), y la salida negativa al borde.
    const acciones =
        chipDescuentos || botonDatos || chipDatosComercio || botonNoVisita ? (
            <div className="flex items-center gap-1.5">
                {chipDescuentos}
                {botonDatos}
                {chipDatosComercio}
                {botonNoVisita}
            </div>
        ) : undefined

    const estadosResolucion: Record<number, { motivosCargados: number; completo: boolean }> = {}
    for (const r of ofrecimientos) {
        estadosResolucion[r.id] = {
            motivosCargados: (borradores[r.id] ?? r.motivos).length,
            completo: ofrecimientoCompleto(r),
        }
    }
    // Siempre expandida: los "otros rubros del cliente" ya vienen cargados con el sheet,
    // y el botón "Ver más" que los escondía costaba 56px del pie fijo — más que una fila
    // de la tabla que iba a mostrar.
    const filas = construirFilasVisita(
        conNuevosArriba(ofrecimientos),
        conDescuentos(rubroStatus, cliente),
        estadosResolucion,
        true,
        !visitaCerrada,
    )
    // Por código de rubro, para precargar los chips de "¿Qué marca ofreciste?" en el
    // wizard con el mismo desglose que ya muestra la tabla.
    const marcasPorRubro = useMemo(
        () => Object.fromEntries(rubroStatus.map(s => [s.rubroCode, s.marcas])),
        [rubroStatus],
    )

    /**
     * Si el `detalle` de este ofrecimiento se puede guardar. Acción Comercial se sacó
     * del formulario (spec 2026-08-19); `detalle.marca` también dejó de escribirse (spec
     * 2026-09-16: la marca ofrecida ahora vive en el alcance, ver `marcasCambiaron`) —
     * se conserva la comprobación de `accion` porque el objeto sigue vivo en el resto del
     * código y un futuro que reponga Acción Comercial no debería tener que volver a tocar
     * esto.
     *
     * Importa para DOS cosas, y por eso es una sola función:
     *  1. No ensuciar el ofrecimiento. Un rubro cuyos motivos no cambiaron Y sin acción no
     *     entra al batch: sería un PUT que no persiste nada (cinco rubros sin tocar son
     *     cinco requests de más con datos móviles).
     *  2. No mandar `detalle: null`. `undefined` es "no toques lo guardado" en el DTO;
     *     `null` es "borralo", y borraría un detalle viejo que este formulario ni muestra.
     */
    function esPersistible(ofrecimientoId: number): boolean {
        return !!detalles[ofrecimientoId]?.accion
    }

    /** Si las marcas ofrecidas de este rubro cambiaron respecto de lo que ya está en el
     *  alcance de la propuesta congelada — comparado por código, sin importar el orden. */
    function marcasCambiaron(r: IOfrecimiento): boolean {
        const a = (marcasOfrecidas[r.id] ?? []).map(m => m.codigo).sort()
        const b = marcasDelAlcance(r).map(m => m.codigo).sort()
        return a.length !== b.length || a.some((c, i) => c !== b[i])
    }

    // Único punto de guardado contra el backend: junta todo lo que cambió contra lo
    // que ya tiene el servidor, lo manda en un solo batch y, si sale bien, recién ahí
    // limpia el borrador y dispara el cierre real (geolocalización + endpoint), que
    // maneja el padre (VisitaFlow) vía onCerrarVisita.
    async function cerrarConBorrador() {
        setErrorGuardado(null)
        const cambios = ofrecimientos
            .filter(
                r =>
                    !motivosIguales(borradores[r.id] ?? [], r.motivos) ||
                    esPersistible(r.id) ||
                    marcasCambiaron(r),
            )
            .map(r => ({
                ofrecimientoId: r.id,
                motivos: borradores[r.id] ?? [],
                ...(esPersistible(r.id) ? { detalle: detalles[r.id] } : {}),
                ...(marcasCambiaron(r) ? { marcas: marcasOfrecidas[r.id] ?? [] } : {}),
            }))

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
        limpiarDetalles(visitaId)
        limpiarMarcasOfrecidas(visitaId)
        limpiarObservaciones(visitaId)
        // Trimmeado del lado del front además del backend: así "   " no viaja como si
        // fuera una observación. null y no '' — es el mismo valor que la columna.
        const texto = observaciones.trim()
        const detalle: IDetalleContactoAlta | null =
            esAlta && (contacto.trim() || fechaNacimiento)
                ? { contacto: contacto.trim() || null, fechaNacimiento: fechaNacimiento || null }
                : null
        onCerrarVisita(texto === '' ? null : texto, detalle)
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
            {errorGuardado && (
                <p className="mb-2 text-center text-[12.5px] font-semibold text-dsred">
                    {errorGuardado}
                </p>
            )}
            {/* Salida manual del aviso de "te alejaste": el vendedor dice que está parado
             *  en el cliente y el sistema le dice que no. El mapa corre un watch de alta
             *  precisión y le reporta cada fix al hook, así que si tiene razón el aviso se
             *  apaga solo a los pocos segundos de abrirlo. Va acá, pegado a "Cerrar visita",
             *  porque ese es el momento en que aparece el desacuerdo. No es parte del flujo
             *  normal: sólo se renderiza con el aviso activo. */}
            {alejado && !visitaCerrada && onVerPosicion && (
                <div className="mb-3.5 flex items-center justify-between gap-2 rounded-md border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2">
                    <span className="min-w-0 text-[12.5px] font-semibold text-dsred">
                        Te alejaste del cliente
                    </span>
                    <button
                        type="button"
                        onClick={onVerPosicion}
                        className="shrink-0 text-[12.5px] font-semibold text-[#213D82] underline"
                    >
                        Ver mi posición
                    </button>
                </div>
            )}
            {/* En el pie FIJO y no al final del cuerpo scrolleable: así el vendedor ve
             *  siempre si dejó observación o no, sin scrollear debajo de un catálogo que
             *  puede tener docenas de filas. Es una decisión tomada sabiendo su costo —
             *  ~56px del pie, que es el recurso más escaso del sheet, y el riesgo del
             *  teclado en iOS (ver el spec y el meta viewport de index.html).
             *
             *  `ofrecimientosCargados` es parte del gate por la misma razón que en el
             *  botón de cerrar: con el GET en vuelo o fallado, `ofrecimientos` es [] y
             *  min(2, 0) es 0, así que el mínimo se auto-satisface. */}
            {!visitaCerrada && ofrecimientosCargados && (esAlta || faltanParaMinimo === 0) && (
                <div className="mb-3.5">
                    <div className="mb-1 flex items-baseline justify-between">
                        <label
                            htmlFor="visita-observaciones"
                            className="text-[9.5px] font-bold uppercase tracking-wide text-dsmuted"
                        >
                            Observaciones (opcional)
                        </label>
                        <span className="text-[10px] font-semibold tabular-nums text-dsmuted">
                            {observaciones.length}/{OBSERVACIONES_MAX}
                        </span>
                    </div>
                    {/* `rows={2}` fijo, sin auto-grow: un textarea que crece dentro de un
                     *  pie fijo mueve el botón de cerrar mientras el vendedor tipea. */}
                    <textarea
                        id="visita-observaciones"
                        rows={2}
                        maxLength={OBSERVACIONES_MAX}
                        value={observaciones}
                        onChange={e => setObservaciones(e.target.value)}
                        placeholder="Algo para agregar de esta visita…"
                        className="w-full resize-none rounded-md border border-[#E4E8F0] bg-white px-2.5 py-1.5 text-[12.5px] font-semibold leading-snug text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6] focus:border-dsnavy"
                    />
                    {/* Sólo alta: datos de contacto del prospecto, opcionales — no hay
                     *  cliente en fct_clients del que sacarlos. Van pegados a
                     *  observaciones porque se completan en el mismo momento, al
                     *  cerrar. */}
                    {esAlta && (
                        <div className="mt-2 flex gap-2">
                            <div className="flex-1">
                                <label
                                    htmlFor="visita-contacto"
                                    className="mb-1 block text-[9.5px] font-bold uppercase tracking-wide text-dsmuted"
                                >
                                    Con quién hablaste (opcional)
                                </label>
                                <input
                                    id="visita-contacto"
                                    type="text"
                                    maxLength={80}
                                    value={contacto}
                                    onChange={e => setContacto(e.target.value)}
                                    placeholder="Nombre"
                                    className="w-full rounded-md border border-[#E4E8F0] bg-white px-2.5 py-1.5 text-[12.5px] font-semibold leading-snug text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6] focus:border-dsnavy"
                                />
                            </div>
                            <div className="flex-1">
                                <label
                                    htmlFor="visita-cumple"
                                    className="mb-1 block text-[9.5px] font-bold uppercase tracking-wide text-dsmuted"
                                >
                                    Cumpleaños (opcional)
                                </label>
                                <input
                                    id="visita-cumple"
                                    type="date"
                                    value={fechaNacimiento}
                                    onChange={e => setFechaNacimiento(e.target.value)}
                                    className="w-full rounded-md border border-[#E4E8F0] bg-white px-2.5 py-1.5 text-[12.5px] font-semibold leading-snug text-[#182645] outline-none focus:border-dsnavy"
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
            {/* Visita cerrada: solo lectura, y solo si hay algo que leer. `pl_resolucion`
             *  es inmutable, así que no hay forma de agregarla ni editarla después del
             *  cierre — de ahí que sea texto plano, sin textarea, sin contador y sin
             *  ningún afórdance de edición. Y si no dejó ninguna no se muestra nada: un
             *  campo vacío deshabilitado se lee como "todavía lo podés llenar". */}
            {visitaCerrada && cliente?.observaciones && (
                // bg-white (no bg-[#FAFBFD]) a propósito: el pie fijo ahora usa ese mismo
                // gris de fondo, así que este bloque necesita el blanco para seguir
                // leyéndose como una tarjeta propia en vez de fundirse con el pie.
                <div className="mb-3.5 rounded-md border border-dsline bg-white px-2.5 py-2">
                    <p className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wide text-dsmuted">
                        Observaciones
                    </p>
                    <p className="whitespace-pre-wrap text-[12.5px] font-semibold leading-snug text-[#182645]">
                        {cliente.observaciones}
                    </p>
                </div>
            )}
            {/* Pegado arriba de "Cerrar visita", en el pie fijo: es la última acción a
             *  mano antes de cerrar, para un vistazo de último momento a pagos/cuenta sin
             *  scrollear hasta arriba a buscarlo. Mismo criterio que antes sobre el wizard
             *  (no se muestra ahí): este bloque solo se arma en la rama de lista. */}
            {cliente && onAbrirAppExterna && (
                <div className="mb-3.5">
                    <AccionesExternas cliente={cliente} variante="fila" onAbrir={onAbrirAppExterna} />
                </div>
            )}
            {/* `ofrecimientosCargados` es parte del gate, no un detalle de carga: sin él,
             *  mientras el GET está en vuelo (o si falló) `ofrecimientos` es `[]`, no falta
             *  ningún rubro y el botón se ofrece habilitado. El cuerpo del sheet muestra
             *  mientras tanto el spinner o el error con "Volver a intentar". */}
            {!visitaCerrada && ofrecimientosCargados && (
                <Button
                    onClick={cerrarConBorrador}
                    disabled={!cierreHabilitado}
                    loading={cerrando || guardandoBorrador}
                    // El naranja queda reservado para "ya podés cerrar". Mientras falten
                    // rubros va gris con texto navy, y NO el naranja al 40% de opacidad
                    // que daba el `disabled:` del variant: eso se veía como un CTA roto
                    // — del tamaño del botón principal, gritando "tocame", ilegible por
                    // el bajo contraste del blanco sobre naranja lavado, y sin comunicar
                    // que el que falta es el vendedor. Gris + navy se lee como ESTADO, y
                    // de paso el salto a naranja se vuelve una señal de progreso.
                    //
                    // `disabled:opacity-100` es necesario: el 40% del variant también
                    // lavaría el gris y dejaría el texto del faltante ilegible, que es
                    // justo el único texto que el vendedor necesita leer en ese momento.
                    className={
                        !cierreHabilitado
                            ? 'h-12 w-full border border-[#D8DEEA] bg-[#F1F4F9] text-[15px] text-dsnavy disabled:opacity-100'
                            : 'h-12 w-full bg-dsorange text-[15px] hover:bg-dsorange/90'
                    }
                >
                    {/* El faltante va DENTRO del botón deshabilitado, no en una línea
                     *  aparte arriba: dice lo mismo, en el único lugar donde el vendedor
                     *  ya está mirando (el botón que no lo deja avanzar), y no gasta una
                     *  línea del pie fijo en cada render. En alta no hay un número que
                     *  contar (no hay mínimo de rubros), así que el texto es genérico. */}
                    {guardandoBorrador
                        ? 'Guardando…'
                        : cerrando
                          ? 'Cerrando…'
                          : !cierreHabilitado
                            ? esAlta
                                ? 'Cargá lo que ofreciste o dejá una observación'
                                : `Cargá ${faltanParaMinimo} ${faltanParaMinimo === 1 ? 'rubro' : 'rubros'} más`
                            : 'Cerrar visita'}
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
                onHelp={() => setMostrarAyuda(v => !v)}
                ayudaAbierta={mostrarAyuda}
                ayudaContenido={
                    <ul className="list-disc space-y-1 pl-4">
                        <li>Tocá el rubro para cargar el resultado.</li>
                        <li>Tocá los números para ver sus marcas.</li>
                        <li>$/U cambia entre pesos y unidades.</li>
                    </ul>
                }
                acciones={acciones}
                title={nombreCliente}
                subtitle={identidad}
                eyebrow={
                    enCurso
                        ? `● ${ROTULO_VISITA_VIVO[estadoVivo]} · ${formatearDuracion(segundos)}`
                        : esAlta
                          ? 'Cliente nuevo'
                          : 'Propuesta comercial'
                }
                eyebrowClassName={enCurso ? PALETA_VISITA_VIVO[estadoVivo].eyebrow : undefined}
                altura="completa"
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
                        detalles={detalles}
                        onCambiarAccion={(ofrecimientoId, accion) =>
                            setDetalles(prev => ({ ...prev, [ofrecimientoId]: accion }))
                        }
                        marcasPorRubro={marcasPorRubro}
                        marcasOfrecidas={marcasOfrecidas}
                        onCambiarMarcasOfrecidas={(ofrecimientoId, m) =>
                            setMarcasOfrecidas(prev => ({ ...prev, [ofrecimientoId]: m }))
                        }
                        onVolver={() => setWizard(null)}
                    />
                ) : !ofrecimientosCargados ? (
                    /* Sin esto, la pantalla afirmaba "no tiene rubros propuestos" cuando en
                     * realidad no había podido traerlos, y el pie ofrecía cerrar la visita. */
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                        {fallóOfrecimientos ? (
                            <>
                                <WifiOff className="h-7 w-7 text-dsmuted" strokeWidth={2} />
                                <p className="text-[13.5px] font-semibold leading-snug text-[#182645]">
                                    No pudimos traer los rubros de esta visita.
                                </p>
                                <p className="-mt-1 text-[12.5px] leading-snug text-dsmuted">
                                    Fijate que tengas señal. Los rubros se cargan durante la visita:
                                    después de cerrarla ya no se pueden cargar.
                                </p>
                                <Button
                                    onClick={() => reintentarOfrecimientos()}
                                    className="mt-1 h-11 w-full max-w-[240px] bg-dsgreen text-[13.5px] hover:bg-dsgreen/90"
                                >
                                    Volver a intentar
                                </Button>
                            </>
                        ) : (
                            <>
                                <Loader2 className="h-7 w-7 animate-spin text-dsnavy" strokeWidth={2.4} />
                                <p className="text-[12.5px] font-semibold text-dsmuted">
                                    Buscando los rubros…
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    /* Sin párrafo introductorio a propósito: los ~54px que costaba el
                     * "Cargá el resultado de cada rubro que ofreciste…" valían más como
                     * filas de la tabla (entran ~5 en la pantalla, y hay que resolver 2
                     * para poder cerrar). Lo único accionable que decía —que se toca la
                     * fila para cargar— se mudó al header sticky de la tabla, donde el
                     * ojo ya está y sigue a la vista con el catálogo scrolleado. */
                    <div>
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
                    marcas={marcas}
                    rubros={rubrosCatalogo}
                    marcasLoading={marcasLoading}
                />
            </BottomSheet>

            {cliente && (
                <DescuentosMarcaSheet
                    open={descuentosAbierto}
                    onClose={() => setDescuentosAbierto(false)}
                    cliente={cliente}
                />
            )}
        </>
    )
}
