import { useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import DetalleAltaPanel from '@/components/analitica/DetalleAltaPanel'
import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import FiltroPeriodo from '@/components/analitica/FiltroPeriodo'
import TablaAltas from '@/components/analitica/TablaAltas'
import Boton from '@/components/ui/Boton'
import EstadoVista from '@/components/ui/EstadoVista'
import Panel from '@/components/ui/Panel'
import Selector from '@/components/ui/Selector'
import { useFiltroAnalitica } from '@/hooks/useFiltroAnalitica'
import { useAltasRelevadas, useVendedores, useVincularAlta } from '@/hooks/useAnalitica'
import { useEsquemaAlta } from '@/hooks/useEsquemaAlta'
import { errorData } from '@/lib/apiError'
import { filasCsvAltas, nombreArchivoAltas } from '@/lib/altasCsv'
import { aCsv, descargarCsv } from '@/lib/csv'
import { rangoMes } from '@/lib/fechas'
import { periodoDeRango, rangoDePeriodo, type ModoPeriodo } from '@/lib/periodo'
import { titleCaseNombre } from '@/lib/textFormat'

const corto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Relevamiento de los clientes nuevos para administración (spec 2026-09-21): qué cargó cada
 * vendedor en "Datos del comercio", y el CSV para tenerlo al lado del ERP. El período (Día,
 * Semana o Mes, por defecto el mes en curso) y los vendedores viven en la URL (`desde`/`hasta`/
 * `vendedores`), así un link compartido abre lo mismo. El CSV se arma en el front desde el mismo
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

    // Por id y no la fila: al vincular, el listado se refresca y el panel tiene que mostrar la
    // fila nueva (con su vínculo), no la foto de cuando se abrió.
    const [elegidaId, setElegidaId] = useState<number | null>(null)
    const vincular = useVincularAlta()

    const { data: roster } = useVendedores()
    const esquema = useEsquemaAlta()
    const altas = useAltasRelevadas(filtroPeriodo)

    const opciones = (roster ?? []).map(v => ({ valor: v.codigoParticularVendedor, etiqueta: titleCaseNombre(v.nombreVendedor) }))
    const listo = esquema.data && altas.data
    const elegida = altas.data?.find(a => a.rotacionClienteId === elegidaId) ?? null

    async function onVincular(codigo: string): Promise<string | null> {
        if (!elegida) return null
        try {
            await vincular.mutateAsync({ rotacionClienteId: elegida.rotacionClienteId, codigo })
            return null
        } catch (err) {
            const mensaje = errorData<{ error?: string }>(err)?.error
            return typeof mensaje === 'string' ? mensaje : 'No se pudo vincular. Volvé a intentar.'
        }
    }

    function exportar() {
        if (!esquema.data || !altas.data) return
        descargarCsv(nombreArchivoAltas(new Date()), aCsv(filasCsvAltas(esquema.data, altas.data)))
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
                            <p>Los clientes nuevos que relevaron los vendedores en el período, con lo que cargaron en "Datos del comercio".</p>
                            <p>
                                <b>Visitada</b> (en amarillo): falta darla de alta en Flexxus. <b>En Flexxus</b>: ya está vinculada.
                                Tocá una fila para ver la ficha y vincularla.
                            </p>
                            <p><b>Datos cargados</b>: los campos completos sobre los del formulario.</p>
                        </div>
                    }
                    etiquetaAyuda="Qué muestra Clientes nuevos"
                    acciones={
                        <Boton onClick={exportar} disabled={!listo || altas.data.length === 0}>
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
                    {listo && altas.data.length === 0 && (
                        <EstadoVista
                            estado="vacio"
                            titulo={`Sin clientes nuevos entre el ${corto(filtroPeriodo.desde)} y el ${corto(filtroPeriodo.hasta)}.`}
                            texto="Probá con otro período o con todos los vendedores."
                        />
                    )}
                    {listo && altas.data.length > 0 && (
                        <TablaAltas filas={altas.data} esquema={esquema.data} onElegir={a => setElegidaId(a.rotacionClienteId)} />
                    )}
                </Panel>

                {elegida && esquema.data && (
                    <DetalleAltaPanel alta={elegida} esquema={esquema.data} onCerrar={() => setElegidaId(null)} onVincular={onVincular} />
                )}
            </main>
        </div>
    )
}
