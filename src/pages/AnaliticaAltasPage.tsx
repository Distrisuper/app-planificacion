import { useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import DetalleAltaPanel from '@/components/analitica/DetalleAltaPanel'
import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import FiltroPeriodo from '@/components/analitica/FiltroPeriodo'
import TablaAltas from '@/components/analitica/TablaAltas'
import Boton from '@/components/ui/Boton'
import EstadoVista from '@/components/ui/EstadoVista'
import Panel from '@/components/ui/Panel'
import Segmentado, { type OpcionSegmentado } from '@/components/ui/Segmentado'
import Selector from '@/components/ui/Selector'
import { useFiltroAnalitica } from '@/hooks/useFiltroAnalitica'
import { useAltasRelevadas, useVendedores, useVincularAlta } from '@/hooks/useAnalitica'
import { useEsquemaAlta } from '@/hooks/useEsquemaAlta'
import { errorData } from '@/lib/apiError'
import { ETIQUETA_ORIGEN_ALTA, claveAlta, filasCsvAltas, nombreArchivoAltas } from '@/lib/altasCsv'
import { aCsv, descargarCsv } from '@/lib/csv'
import { rangoMes } from '@/lib/fechas'
import { periodoDeRango, rangoDePeriodo, type ModoPeriodo } from '@/lib/periodo'
import { titleCaseNombre } from '@/lib/textFormat'
import type { OrigenAlta } from '@/types/analitica'

const corto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

type FiltroOrigen = 'todas' | OrigenAlta
const OPCIONES_ORIGEN: OpcionSegmentado<FiltroOrigen>[] = [
    { valor: 'todas', etiqueta: 'Todas' },
    { valor: 'planificacion', etiqueta: ETIQUETA_ORIGEN_ALTA.planificacion },
    { valor: 'televentas', etiqueta: ETIQUETA_ORIGEN_ALTA.televentas },
]
const esFiltroOrigen = (v: string | null): boolean => OPCIONES_ORIGEN.some(o => o.valor === v)

/**
 * Relevamiento de los clientes nuevos para administración (spec 2026-09-21): qué cargó cada
 * vendedor en "Datos del comercio", y el CSV para tenerlo al lado del ERP. Es universal: un alta
 * es un alta, venga de la visita (planificación) o de un potencial cliente de televentas. El
 * período (Día, Semana o Mes, por defecto el mes en curso), los vendedores y el origen viven en
 * la URL (`desde`/`hasta`/`vendedores`/`origen`), así un link compartido abre lo mismo. El CSV se arma en el front desde el mismo
 * payload filtrado, recorriendo el esquema: un campo nuevo en la API aparece solo.
 */
export default function AnaliticaAltasPage() {
    const mesEnCurso = useMemo(() => rangoMes(new Date()), [])
    const { filtro, setRango, setVendedores } = useFiltroAnalitica(mesEnCurso)
    const periodo = periodoDeRango(filtro.desde, filtro.hasta)
    // Lo que se pide y se exporta es el período que se VE: un link viejo con un rango libre
    // (del 5 al 20) se lee como su mes, y pide el mes entero, no el rango a medias.
    const filtroPeriodo = { ...filtro, ...rangoDePeriodo(periodo.modo, periodo.fecha) }
    // FiltroPeriodo avisa el modo y después la fecha: el modo nuevo se guarda acá para que el
    // rango que se escribe sea el del modo elegido y no el anterior.
    const modoElegido = useRef<ModoPeriodo | null>(null)

    // El origen también vive en la URL; se filtra acá porque el backend manda las dos fuentes juntas.
    const [params, setParams] = useSearchParams()
    const origen: FiltroOrigen = esFiltroOrigen(params.get('origen')) ? (params.get('origen') as FiltroOrigen) : 'todas'
    const setOrigen = (o: FiltroOrigen) => {
        const siguiente = new URLSearchParams(params)
        if (o === 'todas') siguiente.delete('origen')
        else siguiente.set('origen', o)
        setParams(siguiente, { replace: true })
    }

    // Por clave y no la fila: al vincular, el listado se refresca y el panel tiene que mostrar la
    // fila nueva (con su vínculo), no la foto de cuando se abrió. Clave y no id: los ids de las
    // dos fuentes pueden coincidir.
    const [elegidaClave, setElegidaClave] = useState<string | null>(null)
    const vincular = useVincularAlta()

    const { data: roster } = useVendedores()
    const esquema = useEsquemaAlta()
    const altas = useAltasRelevadas(filtroPeriodo)

    const opciones = (roster ?? []).map(v => ({ valor: v.codigoParticularVendedor, etiqueta: titleCaseNombre(v.nombreVendedor) }))
    const filas = useMemo(
        () => (origen === 'todas' ? altas.data : altas.data?.filter(a => a.origen === origen)),
        [altas.data, origen],
    )
    const listo = esquema.data && filas
    const elegida = filas?.find(a => claveAlta(a) === elegidaClave) ?? null
    // El backend no manda las de televentas si hay vendedores elegidos: los TV no están en ese filtro.
    const sinTeleventasPorVendedor = origen === 'televentas' && (filtro.vendedores?.length ?? 0) > 0

    async function onVincular(codigo: string): Promise<string | null> {
        if (!elegida) return null
        try {
            await vincular.mutateAsync({ alta: elegida, codigo })
            return null
        } catch (err) {
            const mensaje = errorData<{ error?: string }>(err)?.error
            return typeof mensaje === 'string' ? mensaje : 'No se pudo vincular. Volvé a intentar.'
        }
    }

    function exportar() {
        if (!esquema.data || !filas) return
        descargarCsv(nombreArchivoAltas(new Date()), aCsv(filasCsvAltas(esquema.data, filas)))
    }

    const cambiarFecha = (fecha: Date) => {
        const { desde, hasta } = rangoDePeriodo(modoElegido.current ?? periodo.modo, fecha)
        modoElegido.current = null
        setRango(desde, hasta)
    }

    return (
        <div className="min-h-screen bg-superficie">
            <EncabezadoAnalitica
                filtros={
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <Segmentado etiqueta="Origen" opciones={OPCIONES_ORIGEN} valor={origen} onCambiar={setOrigen} />
                        <span className="mx-1 h-5 w-px bg-linea" aria-hidden />
                        <Selector multiple etiqueta="Vendedores" opciones={opciones} valores={filtro.vendedores ?? []} onCambiar={setVendedores} />
                        <span className="mx-1 h-5 w-px bg-linea" aria-hidden />
                        <FiltroPeriodo
                            modo={periodo.modo}
                            fecha={periodo.fecha}
                            onCambiarModo={m => (modoElegido.current = m)}
                            onCambiarFecha={cambiarFecha}
                        />
                    </div>
                }
            />

            <main className="px-6 py-5">
                <Panel
                    titulo="Clientes nuevos"
                    ayuda={
                        <div className="space-y-2">
                            <p>
                                Los clientes nuevos del período, con lo que cargaron en "Datos del comercio": los que relevaron
                                los vendedores en la visita (<b>Planificación</b>) y los potenciales clientes que cargaron los
                                televendedores (<b>Televentas</b>). Con vendedores elegidos se ven solo los de Planificación.
                            </p>
                            <p>
                                <b>Visitada</b> (en amarillo): falta darla de alta en Flexxus. <b>En Flexxus</b>: ya está vinculada.
                                Tocá una fila para ver la ficha y vincularla.
                            </p>
                            <p><b>Datos cargados</b>: los campos completos sobre los del formulario.</p>
                        </div>
                    }
                    etiquetaAyuda="Qué muestra Clientes nuevos"
                    acciones={
                        <Boton onClick={exportar} disabled={!listo || filas.length === 0}>
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            Exportar CSV
                        </Boton>
                    }
                >
                    {(altas.isLoading || esquema.isPending) && <EstadoVista estado="cargando" />}
                    {(altas.isError || esquema.isError) && (
                        <EstadoVista
                            estado="error"
                            titulo="No se pudieron cargar los clientes nuevos."
                            texto="Puede ser la conexión. Probá de nuevo."
                            onReintentar={() => {
                                if (altas.isError) altas.refetch()
                                if (esquema.isError) esquema.refetch()
                            }}
                        />
                    )}
                    {listo && filas.length === 0 && (
                        <EstadoVista
                            estado="vacio"
                            titulo={`Sin clientes nuevos${origen === 'todas' ? '' : ` de ${ETIQUETA_ORIGEN_ALTA[origen]}`} entre el ${corto(filtroPeriodo.desde)} y el ${corto(filtroPeriodo.hasta)}.`}
                            texto={
                                sinTeleventasPorVendedor
                                    ? 'Los de Televentas no se filtran por vendedor: sacá los vendedores elegidos para verlos.'
                                    : 'Probá con otro período, con todos los vendedores o con los dos orígenes.'
                            }
                        />
                    )}
                    {listo && filas.length > 0 && (
                        <TablaAltas filas={filas} esquema={esquema.data} onElegir={a => setElegidaClave(claveAlta(a))} />
                    )}
                </Panel>

                {elegida && esquema.data && (
                    <DetalleAltaPanel alta={elegida} esquema={esquema.data} onCerrar={() => setElegidaClave(null)} onVincular={onVincular} />
                )}
            </main>
        </div>
    )
}
