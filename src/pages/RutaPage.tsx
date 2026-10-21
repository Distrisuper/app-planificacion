import { useMemo, useState } from 'react'
import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import HelpPopover from '@/components/analitica/HelpPopover'
import AgregarClienteExtraDialog from '@/components/ruta/AgregarClienteExtraDialog'
import AgregarClienteRutaBaseDialog from '@/components/ruta/AgregarClienteRutaBaseDialog'
import AlcanceCambioDialog from '@/components/ruta/AlcanceCambioDialog'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { TextoQuitar } from '@/components/ruta/ClienteCardRuta'
import ColaRotaciones from '@/components/ruta/ColaRotaciones'
import GridRotacion from '@/components/ruta/GridRotacion'
import PegarCodigosRutaBaseDialog from '@/components/ruta/PegarCodigosRutaBaseDialog'
import { AyudaRuta } from '@/components/ruta/ayudaRuta'
import EstadoVista from '@/components/ui/EstadoVista'
import Segmentado, { type OpcionSegmentado } from '@/components/ui/Segmentado'
import Selector from '@/components/ui/Selector'
import { useAuth } from '@/context/AuthContext'
import { useVendedores } from '@/hooks/useAnalitica'
import { errorCode, errorData } from '@/lib/apiError'
import { mensajeErrorRuta } from '@/lib/mensajesRuta'
import { rutaBaseComoGrid } from '@/lib/rutaBase'
import { titleCaseNombre } from '@/lib/textFormat'
import {
    useCancelarRotacion,
    useCrearRotacion,
    useEditarDescripcionRotacion,
    useEditarDescripcionSemana,
    useIntercambiarDias,
    useIntercambiarDiasRutaBase,
    useIntercambiarSemanas,
    useIntercambiarSemanasRutaBase,
    useMoverEnRutaBase,
    useQuitarClienteAdmin,
    useQuitarDeRutaBase,
    useReacomodarAdmin,
    useReiniciarRotacion,
    useReordenarRotacion,
    useRestaurarClienteAdmin,
    useRestaurarEnRutaBase,
    useAgregarSemanaRutaBase,
    useMoverSemanaRutaBase,
    useRotacion,
    useRotaciones,
    useRutaBase,
} from '@/hooks/useRotacionAdmin'

/**
 * Edición de la ruta (rotación) de un vendedor, para gerencia.
 *
 * Mismo encabezado que Métricas y Altas (una línea: tabs, filtros y cuenta), con un solo
 * filtro: el vendedor. Acá se opera sobre un vendedor y una rotación a la vez, no se compara.
 */
/** Sobre el fondo de la página, los estados van con borde y fondo de tarjeta. */
const RECUADRO = 'border border-linea bg-tarjeta'

type Vista = 'vuelta' | 'base'

/** "Vuelta actual" es la rotación que se está recorriendo; "Ruta base" es lo que se copia
 *  al armar cada vuelta. Las dos se editan: lo de la ruta base aplica desde la próxima. */
const OPCIONES_VISTA: OpcionSegmentado<Vista>[] = [
    { valor: 'vuelta', etiqueta: 'Vuelta actual', titulo: 'La vuelta que está recorriendo, editable' },
    { valor: 'base', etiqueta: 'Ruta base', titulo: 'La ruta que se copia al armar cada vuelta, editable desde la próxima' },
]

const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

/** Quitar de la ruta base no vuelve solo como en la vuelta: el aviso tiene que decirlo. */
const TEXTO_QUITAR_BASE: TextoQuitar = {
    donde: 'de la ruta base',
    aviso: 'No va a estar en las próximas vueltas.',
    explicacion:
        'Quitar este cliente de la ruta base. No va a estar en las próximas vueltas; se puede deshacer con Restaurar.',
    restaurar: 'Volver a poner este cliente en la ruta base, en el mismo día.',
}

/** Así se ofrece "Agregar semana" también cuando no hay ninguna: es como se empieza. */
const CLASE_AGREGAR_SEMANA =
    'h-8 rounded-lg border border-dashed border-linea bg-tarjeta px-2.5 text-[13px] text-tinta-2 hover:text-tinta disabled:opacity-40'

/**
 * Un reacomodo de la vuelta que espera la respuesta del diálogo de alcance. Se guarda el
 * cambio y no se manda: recién al elegir se sabe si va con `aplicarARutaBase`.
 */
type CambioVuelta = { rotacionId: number; accion: string } & (
    | { tipo: 'mover'; rotacionClienteId: number; semana: number; dia: number }
    | { tipo: 'dias'; semanaA: number; diaA: number; semanaB: number; diaB: number }
    | { tipo: 'semanas'; semanaA: number; semanaB: number }
)

/** El cartel de un reinicio rechazado, según el código del backend. */
function mensajeErrorReinicio(err: unknown, nombreVendedor: string): string {
    const code = errorCode(err)
    if (code === 'VISITA_EN_CURSO') {
        const cliente = errorData<{ nombreCliente?: string }>(err)?.nombreCliente
        if (cliente) {
            return `${nombreVendedor} está visitando a ${titleCaseNombre(cliente)}. Probá de nuevo cuando cierre la visita.`
        }
    }
    if (code === 'ROTACION_SIN_CLIENTES') {
        return 'Este vendedor no tiene ruta base cargada: no se puede armar una vuelta.'
    }
    return 'No se pudo reiniciar la vuelta. Probá de nuevo.'
}

export default function RutaPage() {
    const { vendedoresVisibles, vendedorDePrueba } = useAuth()
    const [vendedor, setVendedor] = useState<string | null>(null)
    const [vista, setVista] = useState<Vista>('vuelta')
    const [rotacionActivaId, setRotacionActivaId] = useState<number | null>(null)
    // La celda cuyo "+" se tocó. null = el diálogo está cerrado. Guarda la celda y no un
    // booleano porque la celda ES el destino de lo que se agregue.
    const [celdaAgregar, setCeldaAgregar] = useState<{ semana: number; dia: number } | null>(
        null,
    )
    const [cambioPendiente, setCambioPendiente] = useState<CambioVuelta | null>(null)
    const [confirmandoReinicio, setConfirmandoReinicio] = useState(false)
    // La semana de la ruta base cuyo "Pegar códigos" está abierto. null = cerrado.
    const [semanaPegar, setSemanaPegar] = useState<number | null>(null)
    const reiniciar = useReiniciarRotacion(vendedor ?? '')

    // La celda del "+" y el cambio pendiente son de la vista donde se tocaron: sin esto, el
    // "+" de la vuelta abriría el buscador de la ruta base al cambiar de vista.
    const elegirVista = (v: Vista) => {
        setVista(v)
        setCeldaAgregar(null)
        setCambioPendiente(null)
        setSemanaPegar(null)
        reiniciar.reset()
    }

    const { data: roster } = useVendedores()
    // El roster del warehouse no conoce a PRUEBA-*: se agrega a mano, al final y separado.
    // Y se acota a lo que el backend va a aceptar (`requireVendedorEnScope`): un TV futuro
    // no tiene que ver vendedores que después le rebotan con 403.
    const opcionesVendedor = useMemo(() => {
        const base = (roster ?? [])
            .filter(
                v => vendedoresVisibles === null || vendedoresVisibles.some(c => c.toUpperCase() === v.codigoParticularVendedor.toUpperCase()),
            )
            .map(v => ({ valor: v.codigoParticularVendedor, etiqueta: titleCaseNombre(v.nombreVendedor) }))
        return vendedorDePrueba ? [...base, { valor: vendedorDePrueba.codigo, etiqueta: 'Mi vendedor de prueba' }] : base
    }, [roster, vendedoresVisibles, vendedorDePrueba])
    const { data: cola, isLoading, isError, refetch: refetchCola } = useRotaciones(vendedor)
    // Solo se pide al mirarla: es una consulta al warehouse que la vista de la vuelta no usa.
    const {
        data: rutaBase,
        isLoading: cargandoBase,
        isError: errorBase,
        refetch: refetchBase,
    } = useRutaBase(vista === 'base' ? vendedor : null)
    const verVuelta = vista === 'vuelta'
    const semanasBase = useMemo(
        () => (rutaBase ? rutaBaseComoGrid(rutaBase.semanas) : []),
        [rutaBase],
    )

    const crear = useCrearRotacion(vendedor ?? '')
    const cancelar = useCancelarRotacion(vendedor ?? '')

    const elegirVendedor = (codigo: string) => {
        setVendedor(codigo === '' ? null : codigo)
        // La rotación activa era del vendedor anterior: sin esto, el grid pediría un id
        // que no le pertenece y el backend contestaría 404.
        setRotacionActivaId(null)
        // La semana a pegar era de la ruta base del vendedor anterior.
        setSemanaPegar(null)
        // El cartel de un reinicio fallido nombra al vendedor anterior.
        reiniciar.reset()
    }

    const nombreVendedor =
        opcionesVendedor.find(o => o.valor === vendedor)?.etiqueta ?? vendedor ?? ''
    // El vendedor de prueba tiene su propio "Reiniciar" (y el backend rebota este con
    // PRUEBA_USA_REINICIAR).
    const puedeReiniciar = vendedor !== null && vendedor !== vendedorDePrueba?.codigo

    // La elección solo vale si sigue estando en la cola. Cancelar la rotación elegida la
    // saca del payload pero no del estado local, y sin este chequeo el grid seguía pidiendo
    // un id que ya no existe: 404, pantalla en blanco y ningún chip marcado como activo.
    const elegidaVigente =
        rotacionActivaId !== null && cola?.some(r => r.id === rotacionActivaId)
            ? rotacionActivaId
            : null

    const rotacionElegida =
        elegidaVigente ??
        cola?.find(r => r.estado === 'abierta')?.id ??
        cola?.[0]?.id ??
        null

    const {
        data: grid,
        isLoading: cargandoGrid,
        isError: errorGrid,
        refetch: refetchGrid,
    } = useRotacion(vendedor, rotacionElegida)
    const mover = useReacomodarAdmin(vendedor ?? '')
    const renombrarRotacion = useEditarDescripcionRotacion(vendedor ?? '')
    const renombrarSemana = useEditarDescripcionSemana(vendedor ?? '')
    const reordenar = useReordenarRotacion(vendedor ?? '')
    const intercambiar = useIntercambiarDias(vendedor ?? '')
    const intercambiarSemanas = useIntercambiarSemanas(vendedor ?? '')
    const quitar = useQuitarClienteAdmin(vendedor ?? '')
    const restaurar = useRestaurarClienteAdmin(vendedor ?? '')

    const moverBase = useMoverEnRutaBase(vendedor ?? '')
    const quitarBase = useQuitarDeRutaBase(vendedor ?? '')
    const intercambiarDiasBase = useIntercambiarDiasRutaBase(vendedor ?? '')
    const intercambiarSemanasBase = useIntercambiarSemanasRutaBase(vendedor ?? '')
    const restaurarBase = useRestaurarEnRutaBase(vendedor ?? '')
    const agregarSemanaBase = useAgregarSemanaRutaBase(vendedor ?? '')
    const moverSemanaBase = useMoverSemanaRutaBase(vendedor ?? '')

    /** "LUN · Semana 2": cómo se nombra una celda en el diálogo de alcance. */
    const celda = (semana: number, dia: number) => `${DIAS[dia - 1] ?? dia} · Semana ${semana}`

    const nombreDe = (rotacionClienteId: number) => {
        for (const s of grid?.semanas ?? []) {
            for (const clientes of Object.values(s.dias)) {
                const c = clientes.find(x => x.rotacionClienteId === rotacionClienteId)
                if (c) return titleCaseNombre(c.nombreCliente)
            }
        }
        return 'el cliente'
    }

    const aplicarCambio = (aplicarARutaBase: boolean) => {
        const c = cambioPendiente
        setCambioPendiente(null)
        if (!c) return
        if (c.tipo === 'mover') {
            mover.mutate({
                rotacionId: c.rotacionId,
                rotacionClienteId: c.rotacionClienteId,
                semana: c.semana,
                dia: c.dia,
                aplicarARutaBase,
            })
        } else if (c.tipo === 'dias') {
            intercambiar.mutate({
                rotacionId: c.rotacionId,
                semanaA: c.semanaA,
                diaA: c.diaA,
                semanaB: c.semanaB,
                diaB: c.diaB,
                aplicarARutaBase,
            })
        } else {
            intercambiarSemanas.mutate({
                rotacionId: c.rotacionId,
                semanaA: c.semanaA,
                semanaB: c.semanaB,
                aplicarARutaBase,
            })
        }
    }

    // El último error de la ruta base. Uno solo a la vez: son varias acciones sobre la misma
    // grilla, y un cartel por acción apilaría avisos viejos. "Pegar códigos" no está: muestra
    // sus errores en su diálogo.
    const errorEdicionBase = [
        moverBase,
        quitarBase,
        intercambiarDiasBase,
        intercambiarSemanasBase,
        restaurarBase,
        agregarSemanaBase,
        moverSemanaBase,
    ]
        .filter(m => m.isError)
        .sort((a, b) => b.submittedAt - a.submittedAt)[0]

    return (
        <div className="min-h-screen bg-superficie">
            <EncabezadoAnalitica
                filtros={
                    <div className="ml-auto flex items-center gap-2">
                        {/* Va en la línea y no dentro del grid: lo que explica son las reglas de
                            la pantalla entera (mover vs. agregar, qué significa cada cartel, qué
                            no se puede tocar), y adentro del grid competiría con los controles. */}
                        <span className="inline-flex items-center gap-1 text-[13px] text-tinta-2">
                            Cómo funciona
                            <HelpPopover label="Cómo funciona la edición de la ruta">
                                <AyudaRuta />
                            </HelpPopover>
                        </span>
                        <span className="mx-1 h-5 w-px bg-linea" aria-hidden />
                        <Segmentado
                            etiqueta="Qué ruta ver"
                            opciones={OPCIONES_VISTA}
                            valor={vista}
                            onCambiar={elegirVista}
                        />
                        {/* Uno solo, a diferencia de los reportes: gerencia opera sobre UNA
                            rotación a la vez, no compara vendedores. */}
                        <Selector
                            etiqueta="Vendedor"
                            placeholder="Elegí un vendedor"
                            opciones={opcionesVendedor}
                            valor={vendedor}
                            onCambiar={elegirVendedor}
                        />
                    </div>
                }
            />

            <main className="space-y-4 px-6 py-5">
                {vendedor === null && (
                    <EstadoVista
                        className={RECUADRO}
                        estado="vacio"
                        titulo="Elegí un vendedor para ver y editar su ruta."
                        texto="Usá el selector de vendedor de arriba a la derecha."
                    />
                )}

                {!verVuelta && vendedor !== null && cargandoBase && <EstadoVista estado="cargando" />}

                {!verVuelta && vendedor !== null && errorBase && (
                    <EstadoVista
                        className={RECUADRO}
                        estado="error"
                        titulo="No se pudo cargar la ruta base de este vendedor."
                        texto="Puede ser la conexión. Probá de nuevo."
                        onReintentar={() => refetchBase()}
                    />
                )}

                {!verVuelta && vendedor !== null && rutaBase?.semanas.length === 0 && (
                    <>
                        <EstadoVista
                            className={RECUADRO}
                            estado="vacio"
                            titulo="Este vendedor no tiene ruta base cargada."
                            texto="Sin ruta base no se le puede armar una vuelta nueva. Se empieza agregando una semana y cargándole clientes. El vendedor de prueba no tiene: arranca como copia de un vendedor real."
                        />
                        <button
                            type="button"
                            aria-label="Agregar semana"
                            onClick={() => agregarSemanaBase.mutate()}
                            disabled={agregarSemanaBase.isPending}
                            className={CLASE_AGREGAR_SEMANA}
                        >
                            + Agregar semana
                        </button>
                    </>
                )}

                {!verVuelta && rutaBase && rutaBase.semanas.length > 0 && vendedor && (
                    <>
                        <p className="text-[13px] text-tinta-2">
                            Esta es la ruta que se copia al armar cada vuelta. Lo que cambies acá
                            aplica desde la próxima vuelta.
                            {rutaBase.omitidos.length > 0 &&
                                ` ${rutaBase.omitidos.length} ${
                                    rutaBase.omitidos.length === 1
                                        ? 'cliente de la ruta no está en el padrón'
                                        : 'clientes de la ruta no están en el padrón'
                                } y no entra en la vuelta (${rutaBase.omitidos.join(', ')}).`}
                        </p>
                        {/* El mismo grid que la vuelta, con la ruta base mapeada a su forma
                            (ver `rutaBaseComoGrid`). Sin renombrar semanas: la ruta base no
                            tiene nombres propios, los toma de la última vuelta. Sin diálogo de
                            alcance: acá todo es de la ruta base. Y con lo que solo tiene la
                            ruta base: ordenar dentro del día, agregar y mover semanas, y pegar
                            códigos. */}
                        <GridRotacion
                            // Misma razón que la `key` del grid de la vuelta: el origen de un
                            // intercambio armado no puede sobrevivir a un cambio de vendedor.
                            key={`base-${vendedor}`}
                            semanas={semanasBase}
                            ordenable
                            onMover={(id, semana, dia, posicion) =>
                                moverBase.mutate({ id, semana, dia, posicion })
                            }
                            onRestaurar={id => restaurarBase.mutate(id)}
                            onAgregarSemana={() => agregarSemanaBase.mutate()}
                            agregandoSemana={agregarSemanaBase.isPending}
                            onMoverSemana={(semana, posicion) =>
                                moverSemanaBase.mutate({ semana, posicion })
                            }
                            onPegarCodigos={setSemanaPegar}
                            onIntercambiar={(a, b) =>
                                intercambiarDiasBase.mutate({
                                    semanaA: a.semana,
                                    diaA: a.dia,
                                    semanaB: b.semana,
                                    diaB: b.dia,
                                })
                            }
                            onIntercambiarSemanas={(semanaA, semanaB) =>
                                intercambiarSemanasBase.mutate({ semanaA, semanaB })
                            }
                            onQuitar={id => quitarBase.mutate(id)}
                            textoQuitar={TEXTO_QUITAR_BASE}
                            onAgregar={(semana, dia) => setCeldaAgregar({ semana, dia })}
                        />

                        {celdaAgregar && (
                            <AgregarClienteRutaBaseDialog
                                open
                                onClose={() => setCeldaAgregar(null)}
                                codigoVendedor={vendedor}
                                semana={celdaAgregar.semana}
                                dia={celdaAgregar.dia}
                                zonas={rutaBase.semanas}
                            />
                        )}

                        {semanaPegar !== null && (
                            <PegarCodigosRutaBaseDialog
                                // Un diálogo por semana: lo pegado en otra no tiene que quedar.
                                key={semanaPegar}
                                open
                                onClose={() => setSemanaPegar(null)}
                                codigoVendedor={vendedor}
                                semana={semanaPegar}
                                zona={
                                    rutaBase.semanas.find(s => s.semana === semanaPegar)
                                        ?.descripcion ?? null
                                }
                            />
                        )}
                    </>
                )}

                {/* Afuera del bloque del grid: "Agregar semana" también se ofrece sin semanas,
                    y su error tiene que verse ahí. */}
                {!verVuelta && rutaBase && errorEdicionBase && (
                    <EstadoVista
                        className={RECUADRO}
                        estado="error"
                        titulo="No se pudo cambiar la ruta base."
                        texto={mensajeErrorRuta(
                            errorEdicionBase.error,
                            'Probá de nuevo en un momento.',
                        )}
                    />
                )}

                {verVuelta && vendedor !== null && isLoading && <EstadoVista estado="cargando" />}

                {verVuelta && vendedor !== null && isError && (
                    <EstadoVista
                        className={RECUADRO}
                        estado="error"
                        titulo="No se pudo cargar la ruta de este vendedor."
                        texto="Puede ser la conexión. Probá de nuevo."
                        onReintentar={() => refetchCola()}
                    />
                )}

                {verVuelta && vendedor !== null && cola && cola.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <ColaRotaciones
                            rotaciones={cola}
                            activaId={rotacionElegida}
                            onElegir={setRotacionActivaId}
                            onCrear={() => crear.mutate()}
                            onCancelar={id => cancelar.mutate(id)}
                            onRenombrarRotacion={(rotacionId, descripcion) =>
                                renombrarRotacion.mutate({ rotacionId, descripcion })
                            }
                            onReordenar={(rotacionId, orden) =>
                                reordenar.mutate({ rotacionId, orden })
                            }
                            creando={crear.isPending}
                        />
                        {puedeReiniciar && (
                            <button
                                type="button"
                                onClick={() => setConfirmandoReinicio(true)}
                                disabled={reiniciar.isPending}
                                title="Cerrar la vuelta actual y empezar una nueva copiada de la ruta base"
                                className="ml-auto h-8 rounded-lg border border-linea bg-tarjeta px-2.5 text-[13px] text-tinta-2 hover:text-tinta disabled:opacity-40"
                            >
                                {reiniciar.isPending ? 'Reiniciando…' : 'Reiniciar vuelta'}
                            </button>
                        )}
                    </div>
                )}

                {verVuelta && puedeReiniciar && (
                    <ConfirmDialog
                        open={confirmandoReinicio}
                        onOpenChange={setConfirmandoReinicio}
                        title={`¿Reiniciar la vuelta de ${nombreVendedor}?`}
                        description="Se cierra la vuelta actual y empieza una nueva copiada de la ruta base. Las visitas hechas no se tocan; los clientes que quedaron sin visitar cuentan como pendientes de esta vuelta."
                        confirmLabel="Reiniciar vuelta"
                        cancelLabel="Volver"
                        destructivo
                        onConfirm={() =>
                            reiniciar.mutate(undefined, {
                                onSuccess: r => setRotacionActivaId(r.rotacionId),
                            })
                        }
                    />
                )}

                {verVuelta && reiniciar.isError && (
                    <EstadoVista
                        className={RECUADRO}
                        estado="error"
                        titulo="No se pudo reiniciar la vuelta."
                        texto={mensajeErrorReinicio(reiniciar.error, nombreVendedor)}
                    />
                )}

                {/* Sin la cola vacía dentro: ese `ColaRotaciones` estaba solo para ofrecer
                    "Agregar rotación", que hoy está oculto (ver `ColaRotaciones`), así que
                    dibujaba un contenedor vacío debajo del texto. La rotación la crea el
                    vendedor al abrir su primera zona. */}
                {verVuelta && vendedor !== null && cola?.length === 0 && (
                    <EstadoVista
                        className={RECUADRO}
                        estado="vacio"
                        titulo="Este vendedor todavía no tiene ninguna rotación."
                        texto="Se crea sola cuando empieza a recorrer su primera zona."
                    />
                )}

                {verVuelta && rotacionElegida !== null && cargandoGrid && <EstadoVista estado="cargando" />}

                {/* Sin esto el fallo del grid era mudo: `grid` queda undefined y la página
                    mostraba los chips sobre un vacío, indistinguible de una rotación sin
                    semanas. */}
                {verVuelta && rotacionElegida !== null && errorGrid && (
                    <EstadoVista
                        className={RECUADRO}
                        estado="error"
                        titulo="No se pudo cargar el plan de esta rotación."
                        texto="Puede ser la conexión. Probá de nuevo."
                        onReintentar={() => refetchGrid()}
                    />
                )}

                {verVuelta && grid && (
                    <>
                        <GridRotacion
                            // La `key` NO es cosmética: `GridRotacion` guarda en estado la
                            // celda origen del intercambio armado. Sin remontar, cambiar de
                            // rotación con la otra ya en caché deja el componente montado y
                            // ese origen vivo: el próximo ⇄ permutaría ~20 clientes de la
                            // rotación NUEVA contra una celda de la vieja, sin confirmación
                            // de por medio.
                            key={grid.id}
                            semanas={grid.semanas}
                            // Desplegada la semana en curso; el resto, plegado.
                            plegarPorEstado
                            // Una rotación cerrada se ve pero no se edita: el backend
                            // contesta 409 ROTACION_CERRADA.
                            editable={
                                grid.estado === 'abierta' || grid.estado === 'programada'
                            }
                            // Mover e intercambiar preguntan el alcance (solo la vuelta, o
                            // también la ruta base) antes de mandar nada. Quitar y agregar
                            // siguen siendo solo de la vuelta.
                            onMover={(rotacionClienteId, semana, dia) =>
                                setCambioPendiente({
                                    tipo: 'mover',
                                    rotacionId: grid.id,
                                    rotacionClienteId,
                                    semana,
                                    dia,
                                    accion: `Mover a ${nombreDe(rotacionClienteId)} al ${celda(semana, dia)}`,
                                })
                            }
                            onRenombrarSemana={(semana, descripcion) =>
                                renombrarSemana.mutate({
                                    rotacionId: grid.id,
                                    semana,
                                    descripcion,
                                })
                            }
                            onIntercambiar={(a, b) =>
                                setCambioPendiente({
                                    tipo: 'dias',
                                    rotacionId: grid.id,
                                    semanaA: a.semana,
                                    diaA: a.dia,
                                    semanaB: b.semana,
                                    diaB: b.dia,
                                    accion: `Intercambiar el ${celda(a.semana, a.dia)} con el ${celda(b.semana, b.dia)}`,
                                })
                            }
                            onIntercambiarSemanas={(semanaA, semanaB) =>
                                setCambioPendiente({
                                    tipo: 'semanas',
                                    rotacionId: grid.id,
                                    semanaA,
                                    semanaB,
                                    accion: `Intercambiar la semana ${semanaA} con la semana ${semanaB}`,
                                })
                            }
                            // El backend rechaza las semanas en curso o hechas
                            // (SEMANA_NO_PENDIENTE): no se ofrece el ⇅ ahí.
                            semanaIntercambiable={s => s.estado === 'pendiente'}
                            onQuitar={rotacionClienteId =>
                                quitar.mutate({ rotacionId: grid.id, rotacionClienteId })
                            }
                            onRestaurar={rotacionClienteId =>
                                restaurar.mutate({ rotacionId: grid.id, rotacionClienteId })
                            }
                            // Cualquier rotación editable, igual que mover, quitar e
                            // intercambiar: `GridRotacion` aplica el gate de `editable`
                            // por su cuenta, así que acá no se repite la condición.
                            //
                            // El spec 2026-09-09 lo limitaba a la rotación en curso ("sin
                            // caso de uso real hoy"), pero apareció: armar la PRÓXIMA
                            // vuelta es justamente cuando hace falta sumar un cliente
                            // nuevo. El backend nunca lo restringió — `agregarExtra` valida
                            // con `requireRotacionEditableDe`, que acepta 'programada' y
                            // solo rebota 'cerrada'/'cancelada'.
                            onAgregar={(semana, dia) => setCeldaAgregar({ semana, dia })}
                        />

                        {celdaAgregar && vendedor && (
                            <AgregarClienteExtraDialog
                                open
                                onClose={() => setCeldaAgregar(null)}
                                codigoVendedor={vendedor}
                                rotacionId={grid.id}
                                semana={celdaAgregar.semana}
                                dia={celdaAgregar.dia}
                                // Todas las semanas, no solo la del "+": el diálogo también
                                // rotula las celdas donde el cliente ya está, y tienen que
                                // llamarse igual que en el grid.
                                zonas={grid.semanas}
                            />
                        )}
                    </>
                )}

                {cambioPendiente && (
                    <AlcanceCambioDialog
                        open
                        accion={cambioPendiente.accion}
                        onElegir={aplicarCambio}
                        onCancelar={() => setCambioPendiente(null)}
                    />
                )}

                {verVuelta && mover.data?.rutaBase === 'no_estaba' && (
                    <p className={`${RECUADRO} rounded-md px-3 py-2 text-[13px] text-tinta`}>
                        En la ruta base ese cliente no estaba en esa celda: se movió solo en esta
                        vuelta.
                    </p>
                )}

                {verVuelta && intercambiarSemanas.isError && (
                    <EstadoVista
                        className={RECUADRO}
                        estado="error"
                        titulo="No se pudo intercambiar las semanas."
                        texto={mensajeErrorRuta(
                            intercambiarSemanas.error,
                            'Probá de nuevo en un momento.',
                        )}
                    />
                )}

                {verVuelta && mover.isError && (
                    <EstadoVista
                        className={RECUADRO}
                        estado="error"
                        titulo="No se pudo mover ese cliente."
                        texto="Puede que ya lo hayan visitado en esta vuelta, o que la semana destino no exista en su ruta."
                    />
                )}

                {verVuelta && intercambiar.isError && (
                    <EstadoVista
                        className={RECUADRO}
                        estado="error"
                        titulo="No se pudo intercambiar los días."
                        texto={(() => {
                            const data = errorData<{ clientes?: string[] }>(
                                intercambiar.error,
                            )
                            const codigos = data?.clientes ?? []
                            if (codigos.length === 0) {
                                return 'Probá de nuevo en un momento.'
                            }
                            // El backend manda códigos; los nombres salen del grid que ya
                            // tenemos, así ese camino no vuelve a consultar el warehouse.
                            const porCodigo = new Map(
                                (grid?.semanas ?? [])
                                    .flatMap(s => Object.values(s.dias).flat())
                                    .map(c => [c.codigoParticularCliente, c.nombreCliente]),
                            )
                            const nombres = codigos.map(c => porCodigo.get(c) ?? c)
                            return `No se puede intercambiar: ${nombres.join(', ')} ya ${
                                nombres.length === 1 ? 'fue' : 'fueron'
                            } resuelto${nombres.length === 1 ? '' : 's'} en esta vuelta.`
                        })()}
                    />
                )}

                {verVuelta && quitar.isError && (
                    <EstadoVista
                        className={RECUADRO}
                        estado="error"
                        titulo="No se pudo quitar ese cliente."
                        texto={
                            errorCode(quitar.error) === 'VISITA_EN_CURSO'
                                ? 'El vendedor está visitando a ese cliente ahora mismo. Probá de nuevo cuando cierre la visita.'
                                : 'Puede que ya lo hayan visitado en esta vuelta.'
                        }
                    />
                )}

                {verVuelta && restaurar.isError && (
                    <EstadoVista className={RECUADRO} estado="error" titulo="No se pudo restaurar ese cliente." texto="Probá de nuevo en un momento." />
                )}

                {/* No hay cartel de `omitidos`: el grid de gerencia (`IRotacionAdmin` en
                    api-vendedores) no devuelve ese campo — solo lo trae `previewSemana`,
                    que es otro payload. El cartel que había acá no se podía mostrar nunca.
                    Si alguna vez el backend lo agrega, va de vuelta. */}
            </main>
        </div>
    )
}
