import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import FiltrosAnalitica from '@/components/analitica/FiltrosAnalitica'
import FiltroCanal from '@/components/analitica/FiltroCanal'
import TablaActividad from '@/components/analitica/TablaActividad'
import DetalleVisitaPanel from '@/components/analitica/DetalleVisitaPanel'
import DetalleLlamadoPanel from '@/components/analitica/DetalleLlamadoPanel'
import { useFiltroAnalitica } from '@/hooks/useFiltroAnalitica'
import { useContactos, useCriterioVisita, useResumen, useVendedores } from '@/hooks/useAnalitica'
import { incluyeHoy, rangoHoy } from '@/lib/fechas'
import { formatNumero, formatPct } from '@/lib/analiticaFormat'
import { canalDeParam } from '@/lib/contactos'
import type { CanalContacto } from '@/types/analitica'

/** Cada cuánto se refresca cuando el rango llega hasta hoy. Un minuto alcanza para
 *  seguir la jornada sin machacar la API: una visita dura decenas de minutos. */
const REFRESCO_MS = 60_000

export default function AnaliticaActividadPage() {
    const { filtro, setRango, toggleVendedor, limpiarVendedores } = useFiltroAnalitica(rangoHoy())
    const [visitaElegida, setVisitaElegida] = useState<number | null>(null)
    const [llamadoElegido, setLlamadoElegido] = useState<number | null>(null)
    // El canal vive en la URL como el resto de los filtros; ausente = "Todo".
    const [params, setParams] = useSearchParams()
    const canal = canalDeParam(params.get('canal'))
    const setCanal = (c: CanalContacto | undefined) => {
        const siguiente = new URLSearchParams(params)
        if (c) siguiente.set('canal', c)
        else siguiente.delete('canal')
        setParams(siguiente, { replace: true })
    }

    const enVivo = incluyeHoy(filtro.desde, filtro.hasta)
    const { data: roster } = useVendedores()
    const criterio = useCriterioVisita()
    const { data: resumen } = useResumen(filtro)
    const { data: pagina, isLoading, isError } = useContactos(
        {
            desde: filtro.desde,
            hasta: filtro.hasta,
            vendedores: filtro.vendedores,
            ...(canal ? { canal: [canal] } : {}),
        },
        { refrescarCada: enVivo ? REFRESCO_MS : 0 },
    )

    const opciones = (roster ?? []).map(v => ({
        codigo: v.codigoParticularVendedor,
        nombre: v.nombreVendedor,
    }))

    const filas = pagina?.contactos ?? []
    const visitas = filas.flatMap(f => (f.canal === 'visita' ? [f] : []))
    const cerradas = visitas.filter(f => f.tipo === 'visita' && f.fechaFin !== null).length
    const enCurso = visitas.filter(f => f.tipo === 'visita' && f.fechaFin === null).length
    const noVisitas = visitas.filter(f => f.tipo === 'no_visita').length
    // Los llamados se cuentan aparte: no son visitas ni suman a la cobertura.
    const llamados = filas.length - visitas.length

    const kpis = [
        { titulo: 'Visitas cerradas', valor: formatNumero(cerradas) },
        { titulo: 'En curso', valor: formatNumero(enCurso) },
        { titulo: 'No visitó', valor: formatNumero(noVisitas) },
        { titulo: 'Llamados', valor: formatNumero(llamados) },
        { titulo: 'Cobertura', valor: formatPct(resumen?.promedios.cobertura ?? null) },
    ]

    return (
        <div className="min-h-screen bg-slate-50">
            <EncabezadoAnalitica enVivo={enVivo}>
                <FiltrosAnalitica
                    filtro={filtro}
                    vendedoresDisponibles={opciones}
                    onRango={setRango}
                    onToggleVendedor={toggleVendedor}
                    onLimpiar={limpiarVendedores}
                />
            </EncabezadoAnalitica>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    {kpis.map(k => (
                        <div
                            key={k.titulo}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                        >
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                                {k.titulo}
                            </p>
                            <p className="mt-1 text-xl font-semibold text-slate-900">{k.valor}</p>
                        </div>
                    ))}
                </div>

                <FiltroCanal canal={canal} onCambiar={setCanal} />

                {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

                {isError && (
                    <p className="text-sm text-red-600">No se pudo cargar la actividad.</p>
                )}

                {pagina && filas.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Sin actividad entre {filtro.desde} y {filtro.hasta}.
                    </div>
                )}

                {filas.length > 0 && (
                    <TablaActividad
                        filas={filas}
                        onElegirVisita={setVisitaElegida}
                        onElegirLlamado={setLlamadoElegido}
                        toleranciaMetros={criterio?.toleranciaMetros}
                    />
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
