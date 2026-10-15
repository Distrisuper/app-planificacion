import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import FiltrosAnalitica from '@/components/analitica/FiltrosAnalitica'
import HelpPopover from '@/components/analitica/HelpPopover'
import TablaVisitas from '@/components/analitica/TablaVisitas'
import {
    AYUDA_COBERTURA,
    AYUDA_DURACION_PROMEDIO,
    AYUDA_EFECTIVIDAD_COMERCIAL,
    AYUDA_HORAS,
    AYUDA_LLAMADOS,
    ayudaVisitas,
    AYUDA_VISITAS_POR_DIA,
} from '@/components/analitica/ayudaDetalleVendedor'
import DetalleVisitaPanel from '@/components/analitica/DetalleVisitaPanel'
import DetalleLlamadoPanel from '@/components/analitica/DetalleLlamadoPanel'
import FiltroCanal from '@/components/analitica/FiltroCanal'
import { useContactosPaginados, useCriterioVisita, useResumen } from '@/hooks/useAnalitica'
import { formatDuracion, formatHoras, formatNumero, formatPct } from '@/lib/analiticaFormat'
import { canalDeParam } from '@/lib/contactos'
import type { CanalContacto, ValidezVisita } from '@/types/analitica'

/** 'sin_coord' no se ofrece: no es un juicio sobre el vendedor, y ya tiene su aviso. */
type FiltroValidez = Exclude<ValidezVisita, 'sin_coord'>

/** Mismos verdes/rojos que la columna Dist. de la tabla: válida = ok, no validada = alerta. */
const TONO_VALIDEZ: Record<FiltroValidez, { punto: string; activo: string }> = {
    valida: {
        punto: 'bg-emerald-500',
        activo: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-300',
    },
    no_validada: {
        punto: 'bg-red-500',
        activo: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-300',
    },
}

/**
 * Una fila del desglose de la tarjeta Visitas: etiqueta a la izquierda, número a la
 * derecha, a todo el ancho. Se probó como pastillas lado a lado y no entran en una
 * tarjeta de 1/6 de la grilla: se partían en dos renglones desparejos. Prendida se tiñe
 * y muestra la ✕ de quitar; nunca más pesada que el total.
 */
function BotonValidez({
    validez,
    etiqueta,
    cantidad,
    activo,
    onClick,
}: {
    validez: FiltroValidez
    etiqueta: string
    cantidad: string
    activo: boolean
    onClick: () => void
}) {
    const tono = TONO_VALIDEZ[validez]
    return (
        <button
            type="button"
            aria-pressed={activo}
            aria-label={`${etiqueta} ${cantidad}`}
            title={activo ? 'Quitar filtro' : `Ver solo las ${etiqueta.toLowerCase()}`}
            onClick={onClick}
            className={`flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-xs transition-colors ${
                activo ? tono.activo : 'text-slate-600 hover:bg-slate-100'
            }`}
        >
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${tono.punto}`} />
            <span>{etiqueta}</span>
            <span className="ml-auto flex items-center gap-1 font-medium tabular-nums">
                {cantidad}
                {activo && (
                    <span aria-hidden className="text-[10px] opacity-70">
                        ✕
                    </span>
                )}
            </span>
        </button>
    )
}

/** Fila del desglose que NO filtra (las horas no tienen filtro propio): misma forma que
 *  BotonValidez para que las dos tarjetas se lean igual, sin hover ni puntero. */
function FilaDesglose({ punto, etiqueta, valor }: { punto: string; etiqueta: string; valor: string }) {
    return (
        <div className="flex w-full items-center gap-1.5 px-1.5 py-0.5 text-xs text-slate-600">
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${punto}`} />
            <span>{etiqueta}</span>
            <span className="ml-auto font-medium tabular-nums">{valor}</span>
        </div>
    )
}

interface Tarjeta {
    titulo: string
    valor: string
    prom: string
    ayuda: ReactNode
    /** Se muestra al lado del número, con la tarjeta más ancha. */
    desglose?: ReactNode
}

export default function AnaliticaVendedorPage() {
    const { codigo = '' } = useParams()
    const [params, setParams] = useSearchParams()
    const desde = params.get('desde') ?? ''
    const hasta = params.get('hasta') ?? ''
    // El rango vive en la URL: así "Volver a la analítica" lo arrastra y el link se
    // puede compartir. `replace` para no llenar el historial con cada fecha tocada.
    const canal = canalDeParam(params.get('canal'))
    const validezParam = params.get('validez')
    // La validez es de visitas: con "Llamados" no aplica (una URL armada a mano con las dos
    // cosas manda el canal).
    const validez: FiltroValidez | undefined =
        canal !== 'llamado' && (validezParam === 'valida' || validezParam === 'no_validada')
            ? validezParam
            : undefined
    const escribir = (cambios: { desde?: string; hasta?: string; validez?: FiltroValidez; canal?: CanalContacto }) =>
        setParams(
            {
                desde: cambios.desde ?? desde,
                hasta: cambios.hasta ?? hasta,
                ...(cambios.validez ? { validez: cambios.validez } : {}),
                ...(cambios.canal ? { canal: cambios.canal } : {}),
            },
            { replace: true },
        )
    const setRango = (d: string, h: string) => escribir({ desde: d, hasta: h, validez, canal })
    // Tocar el filtro activo lo apaga: es un toggle, no hay botón de "todas" aparte. La
    // validez es de visitas: prenderla pasa el canal a "Visitas" (un llamado no se valida),
    // así el selector muestra lo que trae la tabla. Apagarla deja el canal como estaba.
    const toggleValidez = (v: FiltroValidez) =>
        validez === v ? escribir({ canal }) : escribir({ validez: v, canal: 'visita' })
    // Y elegir "Llamados" apaga la validez, por lo mismo.
    const setCanal = (c: CanalContacto | undefined) =>
        escribir({ canal: c, validez: c === 'llamado' ? undefined : validez })
    const [visitaElegida, setVisitaElegida] = useState<number | null>(null)
    const [llamadoElegido, setLlamadoElegido] = useState<number | null>(null)

    const { data: resumen } = useResumen({ desde, hasta })
    const criterio = useCriterioVisita()
    const {
        data,
        isLoading,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useContactosPaginados({
        desde,
        hasta,
        vendedor: codigo,
        validez,
        ...(canal ? { canal: [canal] } : {}),
        cant: 100,
    })
    const visitas = data?.pages.flatMap(p => p.contactos) ?? []
    const total = data?.pages[0]?.total ?? 0

    const vendedor = resumen?.vendedores.find(v => v.codigoParticularVendedor === codigo)
    const promedios = resumen?.promedios

    return (
        <div className="min-h-screen bg-slate-50">
            <EncabezadoAnalitica
                izquierda={
                    <>
                        <Link
                            to={`/analitica?desde=${desde}&hasta=${hasta}`}
                            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Volver a la analítica
                        </Link>
                        <h1 className="mt-1 text-lg font-semibold text-slate-900">
                            {vendedor?.nombreVendedor ?? codigo}
                        </h1>
                        <p className="text-xs text-slate-500">
                            {desde} a {hasta}
                        </p>
                    </>
                }
            >
                <FiltrosAnalitica filtro={{ desde, hasta }} onRango={setRango} />
            </EncabezadoAnalitica>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                {vendedor && promedios && (
                    // Fila de tarjetas a su ancho natural, no una grilla: con columnas fijas
                    // cada tarjeta se estiraba al ancho de la pantalla (números perdidos en
                    // cajas enormes) y, si Horas llegaba sin desglose, quedaba un hueco.
                    // `flex-wrap` las baja de renglón en pantallas chicas.
                    <div className="flex flex-wrap gap-3">
                        {([
                            // Visitas lleva su desglose adentro: total = válidas + no
                            // validadas + sin coordenadas (esas últimas no son culpa del
                            // vendedor y las explica el aviso de abajo). Son visitas, no
                            // filas de la tabla: la tabla también lista los "no visité".
                            {
                                titulo: 'Visitas',
                                valor: formatNumero(vendedor.visitasTotales),
                                ayuda: ayudaVisitas(criterio),
                                desglose: (
                                    <div className="-mx-1.5 space-y-0.5">
                                        <BotonValidez
                                            validez="valida"
                                            etiqueta="Válidas"
                                            cantidad={formatNumero(vendedor.visitasValidas)}
                                            activo={validez === 'valida'}
                                            onClick={() => toggleValidez('valida')}
                                        />
                                        <BotonValidez
                                            validez="no_validada"
                                            etiqueta="No validadas"
                                            cantidad={formatNumero(vendedor.visitasNoValidadas)}
                                            activo={validez === 'no_validada'}
                                            onClick={() => toggleValidez('no_validada')}
                                        />
                                    </div>
                                ),
                                prom: formatNumero(promedios.visitasTotales),
                            },
                            {
                                // Mismo dato y formato que "Horas (mensual)" de la tabla de
                                // efectividad operativa: si no, los dos números no cierran.
                                titulo: 'Horas',
                                valor: formatHoras(vendedor.minutosTotales),
                                prom: formatHoras(promedios.minutosTotales),
                                ayuda: AYUDA_HORAS,
                                // Sin minutosValidos (backend anterior a #137) la tarjeta queda
                                // simple: mejor sin desglose que con un "0 hs válidas" falso.
                                desglose: vendedor.minutosValidos !== undefined && (
                                    <div className="-mx-1.5 space-y-0.5">
                                        <FilaDesglose
                                            punto="bg-emerald-500"
                                            etiqueta="Válidas"
                                            valor={formatHoras(vendedor.minutosValidos)}
                                        />
                                        <FilaDesglose
                                            punto="bg-slate-300"
                                            etiqueta="Resto"
                                            valor={formatHoras(
                                                vendedor.minutosTotales - vendedor.minutosValidos,
                                            )}
                                        />
                                    </div>
                                ),
                            },
                            {
                                titulo: 'Cobertura',
                                ayuda: AYUDA_COBERTURA,
                                valor: formatPct(vendedor.cobertura),
                                prom: formatPct(promedios.cobertura),
                            },
                            {
                                titulo: 'Efect. comercial',
                                ayuda: AYUDA_EFECTIVIDAD_COMERCIAL,
                                valor: formatPct(vendedor.efectividadComercial),
                                prom: formatPct(promedios.efectividadComercial),
                            },
                            {
                                titulo: 'Visitas/día',
                                ayuda: AYUDA_VISITAS_POR_DIA,
                                valor: formatNumero(vendedor.visitasPorDia),
                                prom: formatNumero(promedios.visitasPorDia),
                            },
                            {
                                titulo: 'Duración prom.',
                                ayuda: AYUDA_DURACION_PROMEDIO,
                                valor: formatDuracion(vendedor.duracionPromedioMin),
                                prom: formatDuracion(promedios.duracionPromedioMin),
                            },
                            // Los llamados de Televentas a sus clientes, aparte: no suman a
                            // ninguna de las tarjetas de arriba. Sin el dato (backend anterior)
                            // la tarjeta no aparece, en vez de mostrar un 0 falso.
                            ...(vendedor.llamados !== undefined
                                ? [
                                      {
                                          titulo: 'Llamados',
                                          ayuda: AYUDA_LLAMADOS,
                                          valor: formatNumero(vendedor.llamados),
                                          prom: formatNumero(promedios.llamados ?? null),
                                          desglose: (
                                              <div className="-mx-1.5 space-y-0.5">
                                                  <FilaDesglose
                                                      punto="bg-sky-500"
                                                      etiqueta="Atendidos"
                                                      valor={formatNumero(vendedor.llamadosAtendidos ?? null)}
                                                  />
                                                  <FilaDesglose
                                                      punto="bg-emerald-500"
                                                      etiqueta="Con venta"
                                                      valor={formatNumero(vendedor.llamadosConVenta ?? null)}
                                                  />
                                              </div>
                                          ),
                                      },
                                  ]
                                : []),
                        ] satisfies Tarjeta[]).map((k: Tarjeta) => (
                            <div
                                key={k.titulo}
                                data-testid={`tarjeta-${k.titulo}`}
                                // El desglose va AL LADO del número: debajo hacía la tarjeta
                                // más alta, y la fila estiraba las demás a esa altura.
                                className={`min-w-[9.5rem] rounded-lg border border-slate-200 bg-white px-4 py-3 ${
                                    k.desglose ? 'flex items-center gap-4' : ''
                                }`}
                            >
                                <div className="shrink-0">
                                    <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
                                        {k.titulo}
                                        <HelpPopover label={`Qué significa ${k.titulo}`} align="left">
                                            {k.ayuda}
                                        </HelpPopover>
                                    </p>
                                    <p className="mt-1 text-xl font-semibold text-slate-900">{k.valor}</p>
                                    <p className="text-xs text-slate-400">equipo: {k.prom}</p>
                                </div>
                                {k.desglose && (
                                    <div className="w-36 border-l border-slate-100 pl-4">
                                        {k.desglose}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {vendedor && vendedor.visitasSinCoord > 0 && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                        {vendedor.visitasSinCoord} visitas no verificables: el cliente no tiene
                        coordenadas cargadas.
                    </p>
                )}

                {validez && (
                    <p className="flex items-center gap-2 text-xs text-slate-600">
                        Solo visitas {validez === 'valida' ? 'válidas' : 'no validadas'}
                        <button
                            type="button"
                            onClick={() => toggleValidez(validez)}
                            className="font-medium text-slate-900 underline"
                        >
                            Quitar filtro
                        </button>
                    </p>
                )}

                <FiltroCanal canal={canal} onCambiar={setCanal} />

                {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

                {data && visitas.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        {validez
                            ? `Sin visitas ${validez === 'valida' ? 'válidas' : 'no validadas'} en este rango.`
                            : canal === 'llamado'
                              ? 'Sin llamados en este rango.'
                              : canal === 'visita'
                                ? 'Sin visitas en este rango.'
                                : 'Sin visitas ni llamados en este rango.'}
                    </div>
                )}

                {data && visitas.length > 0 && (
                    <div className="space-y-3">
                        <TablaVisitas
                            visitas={visitas}
                            onElegirVisita={id => {
                                setLlamadoElegido(null)
                                setVisitaElegida(id)
                            }}
                            onElegirLlamado={id => {
                                setVisitaElegida(null)
                                setLlamadoElegido(id)
                            }}
                            toleranciaMetros={criterio?.toleranciaMetros}
                        />
                        <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>
                                Mostrando {visitas.length} de {total}
                            </span>
                            {hasNextPage && (
                                <button
                                    type="button"
                                    onClick={() => fetchNextPage()}
                                    disabled={isFetchingNextPage}
                                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                >
                                    {isFetchingNextPage ? 'Cargando…' : 'Mostrar más'}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {visitaElegida !== null && (
                    <DetalleVisitaPanel
                        visitaId={visitaElegida}
                        onCerrar={() => setVisitaElegida(null)}
                    />
                )}

                {llamadoElegido !== null && (
                    <DetalleLlamadoPanel
                        llamadoId={llamadoElegido}
                        onCerrar={() => setLlamadoElegido(null)}
                    />
                )}
            </main>
        </div>
    )
}
