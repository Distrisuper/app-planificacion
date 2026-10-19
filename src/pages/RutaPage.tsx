import { useMemo, useState } from 'react'
import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import HelpPopover from '@/components/analitica/HelpPopover'
import AgregarClienteExtraDialog from '@/components/ruta/AgregarClienteExtraDialog'
import ColaRotaciones from '@/components/ruta/ColaRotaciones'
import GridRotacion from '@/components/ruta/GridRotacion'
import GridRutaBase from '@/components/ruta/GridRutaBase'
import { AyudaRuta } from '@/components/ruta/ayudaRuta'
import EstadoVista from '@/components/ui/EstadoVista'
import Segmentado, { type OpcionSegmentado } from '@/components/ui/Segmentado'
import Selector from '@/components/ui/Selector'
import { useAuth } from '@/context/AuthContext'
import { useVendedores } from '@/hooks/useAnalitica'
import { errorCode, errorData } from '@/lib/apiError'
import { titleCaseNombre } from '@/lib/textFormat'
import {
    useCancelarRotacion,
    useCrearRotacion,
    useEditarDescripcionRotacion,
    useEditarDescripcionSemana,
    useIntercambiarDias,
    useQuitarClienteAdmin,
    useReacomodarAdmin,
    useReordenarRotacion,
    useRestaurarClienteAdmin,
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

/** "Vuelta actual" es la rotación que se edita; "Ruta base" es lo que se copia al armar
 *  cada vuelta, de solo lectura, para comparar. */
const OPCIONES_VISTA: OpcionSegmentado<Vista>[] = [
    { valor: 'vuelta', etiqueta: 'Vuelta actual', titulo: 'La vuelta que está recorriendo, editable' },
    { valor: 'base', etiqueta: 'Ruta base', titulo: 'La ruta que se copia al armar cada vuelta' },
]

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

    const crear = useCrearRotacion(vendedor ?? '')
    const cancelar = useCancelarRotacion(vendedor ?? '')

    const elegirVendedor = (codigo: string) => {
        setVendedor(codigo === '' ? null : codigo)
        // La rotación activa era del vendedor anterior: sin esto, el grid pediría un id
        // que no le pertenece y el backend contestaría 404.
        setRotacionActivaId(null)
    }

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
    const quitar = useQuitarClienteAdmin(vendedor ?? '')
    const restaurar = useRestaurarClienteAdmin(vendedor ?? '')

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
                            onCambiar={setVista}
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
                    <EstadoVista
                        className={RECUADRO}
                        estado="vacio"
                        titulo="Este vendedor no tiene ruta base cargada."
                        texto="Sin ruta base no se le puede armar una vuelta nueva. El vendedor de prueba no tiene: arranca como copia de un vendedor real."
                    />
                )}

                {!verVuelta && rutaBase && rutaBase.semanas.length > 0 && (
                    <>
                        {/* Es lo que se copia al armar cada vuelta: los cambios hechos en la
                            vuelta actual no la modifican. */}
                        <p className="text-[13px] text-tinta-2">
                            Solo lectura: es la ruta que se copia al armar cada vuelta. Lo que se
                            cambia en la vuelta actual no la modifica.
                            {rutaBase.omitidos.length > 0 &&
                                ` ${rutaBase.omitidos.length} ${
                                    rutaBase.omitidos.length === 1
                                        ? 'cliente de la ruta no está en el padrón'
                                        : 'clientes de la ruta no están en el padrón'
                                } y no entra en la vuelta (${rutaBase.omitidos.join(', ')}).`}
                        </p>
                        <GridRutaBase semanas={rutaBase.semanas} />
                    </>
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
                            // Una rotación cerrada se ve pero no se edita: el backend
                            // contesta 409 ROTACION_CERRADA.
                            editable={
                                grid.estado === 'abierta' || grid.estado === 'programada'
                            }
                            onMover={(rotacionClienteId, semana, dia) =>
                                mover.mutate({
                                    rotacionId: grid.id,
                                    rotacionClienteId,
                                    semana,
                                    dia,
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
                                intercambiar.mutate({
                                    rotacionId: grid.id,
                                    semanaA: a.semana,
                                    diaA: a.dia,
                                    semanaB: b.semana,
                                    diaB: b.dia,
                                })
                            }
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
