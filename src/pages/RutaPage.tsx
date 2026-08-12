import { useState } from 'react'
import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import AccountMenu from '@/components/AccountMenu'
import ColaRotaciones from '@/components/ruta/ColaRotaciones'
import GridRotacion from '@/components/ruta/GridRotacion'
import SelectorVendedor from '@/components/ruta/SelectorVendedor'
import { useAuth } from '@/context/AuthContext'
import { useVendedores } from '@/hooks/useAnalitica'
import { errorData } from '@/lib/apiError'
import {
    useCancelarRotacion,
    useCrearRotacion,
    useEditarDescripcionRotacion,
    useEditarDescripcionSemana,
    useIntercambiarDias,
    useReacomodarAdmin,
    useReordenarRotacion,
    useRotacion,
    useRotaciones,
} from '@/hooks/useRotacionAdmin'

/**
 * Edición de la ruta (rotación) de un vendedor, para gerencia.
 *
 * Mismo shell que las páginas de Analítica (header + tabs + AccountMenu) pero SIN
 * `FiltrosAnalitica`: ese filtro es rango de fechas + multi-vendedor, pensado para
 * reportes. Acá se opera sobre un vendedor y una rotación a la vez.
 */
export default function RutaPage() {
    const { user, logout } = useAuth()
    const [vendedor, setVendedor] = useState<string | null>(null)
    const [rotacionActivaId, setRotacionActivaId] = useState<number | null>(null)

    const { data: roster } = useVendedores()
    const { data: cola, isLoading, isError } = useRotaciones(vendedor)

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
    } = useRotacion(vendedor, rotacionElegida)
    const mover = useReacomodarAdmin(vendedor ?? '')
    const renombrarRotacion = useEditarDescripcionRotacion(vendedor ?? '')
    const renombrarSemana = useEditarDescripcionSemana(vendedor ?? '')
    const reordenar = useReordenarRotacion(vendedor ?? '')
    const intercambiar = useIntercambiarDias(vendedor ?? '')

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="flex items-center justify-between gap-4 bg-white px-6 pt-4">
                <div className="flex-1">
                    <AnaliticaTabs />
                </div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} />
            </header>

            <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 bg-white px-6 py-4">
                <SelectorVendedor
                    vendedores={roster ?? []}
                    elegido={vendedor}
                    onElegir={elegirVendedor}
                />
            </div>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                {vendedor === null && (
                    <p className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Elegí un vendedor para ver y editar su ruta.
                    </p>
                )}

                {vendedor !== null && isLoading && (
                    <p className="text-sm text-slate-500">Cargando…</p>
                )}

                {vendedor !== null && isError && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        No se pudo cargar la ruta de este vendedor. Probá de nuevo en un
                        momento.
                    </p>
                )}

                {vendedor !== null && cola && cola.length > 0 && (
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

                {vendedor !== null && cola?.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
                        <p className="text-sm text-slate-600">
                            Este vendedor todavía no tiene ninguna rotación.
                        </p>
                        <div className="mt-3 flex justify-center">
                            <ColaRotaciones
                                rotaciones={[]}
                                activaId={null}
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
                        </div>
                    </div>
                )}

                {rotacionElegida !== null && cargandoGrid && (
                    <p className="text-sm text-slate-500">Cargando la ruta…</p>
                )}

                {/* Sin esto el fallo del grid era mudo: `grid` queda undefined y la página
                    mostraba los chips sobre un vacío, indistinguible de una rotación sin
                    semanas. */}
                {rotacionElegida !== null && errorGrid && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        No se pudo cargar el plan de esta rotación. Probá de nuevo en un
                        momento.
                    </p>
                )}

                {grid && (
                    <GridRotacion
                        semanas={grid.semanas}
                        // Una rotación cerrada se ve pero no se edita: el backend contesta
                        // 409 ROTACION_CERRADA.
                        editable={grid.estado === 'abierta' || grid.estado === 'programada'}
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
                    />
                )}

                {mover.isError && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        No se pudo mover ese cliente. Puede que ya lo hayan visitado en esta
                        vuelta, o que la semana destino no exista en su ruta.
                    </p>
                )}

                {intercambiar.isError && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {(() => {
                            const data = errorData<{ clientes?: string[] }>(
                                intercambiar.error,
                            )
                            const codigos = data?.clientes ?? []
                            if (codigos.length === 0) {
                                return 'No se pudo intercambiar los días. Probá de nuevo en un momento.'
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
                    </p>
                )}

                {grid?.omitidos && grid.omitidos.length > 0 && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {grid.omitidos.length} cliente(s) del template quedaron afuera por
                        no estar en el padrón: {grid.omitidos.join(', ')}.
                    </p>
                )}
            </main>
        </div>
    )
}
