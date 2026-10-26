import { useMemo } from 'react'
import TablaDatos from '@/components/ui/tabla/TablaDatos'
import { definirColumnas } from '@/components/ui/tabla/columnas'
import type { TonoPill } from '@/components/ui/Pill'
import { ETIQUETA_ESTADO_ALTA, ETIQUETA_ORIGEN_ALTA, claveAlta, valorVisible } from '@/lib/altasCsv'
import { titleCaseNombre } from '@/lib/textFormat'
import type { IAltaRelevada } from '@/types/analitica'
import type { EstadoCicloCliente, IEsquemaAlta } from '@/types/planificacion'

interface TablaAltasProps {
    filas: IAltaRelevada[]
    esquema: IEsquemaAlta
    onElegir: (alta: IAltaRelevada) => void
}

type EstadoFila = EstadoCicloCliente | 'en_flexxus'

/**
 * La única métrica con color es el estado. Lo que le queda a administración es lo visitado SIN
 * vínculo (atención: falta darla de alta en Flexxus); lo ya vinculado está ok. El resto, neutro.
 * `orden` pone primero lo que hay que hacer.
 */
const ESTADOS_ALTA: Record<EstadoFila, { etiqueta: string; tono: TonoPill; orden: number }> = {
    visitada: { etiqueta: ETIQUETA_ESTADO_ALTA.visitada, tono: 'atencion', orden: 1 },
    en_curso: { etiqueta: ETIQUETA_ESTADO_ALTA.en_curso, tono: 'neutro', orden: 2 },
    pendiente: { etiqueta: ETIQUETA_ESTADO_ALTA.pendiente, tono: 'neutro', orden: 3 },
    no_visita: { etiqueta: ETIQUETA_ESTADO_ALTA.no_visita, tono: 'neutro', orden: 4 },
    en_flexxus: { etiqueta: 'En Flexxus', tono: 'ok', orden: 5 },
}

const estadoDe = (a: IAltaRelevada): EstadoFila => (a.vinculo ? 'en_flexxus' : a.estado)

/** "Comercio" y "Localidad" son las claves `nombre` y `localidad` si el esquema las trae. El
 *  vendedor va debajo del comercio, con la localidad: el filtro de arriba ya elige vendedores. */
export default function TablaAltas({ filas, esquema, onElegir }: TablaAltasProps) {
    const columnas = useMemo(
        () =>
            definirColumnas<IAltaRelevada>(c => [
                c.texto('comercio', 'Comercio', a => valorVisible(esquema, a, 'nombre') ?? 'Cliente nuevo', {
                    secundaria: a =>
                        [
                            valorVisible(esquema, a, 'localidad'),
                            titleCaseNombre(a.vendedor.nombre || a.vendedor.codigo),
                            a.vinculo && `Flexxus ${a.vinculo.codigoParticularCliente}`,
                        ]
                            .filter(Boolean)
                            .join(' · '),
                }),
                c.texto('origen', 'Origen', a => ETIQUETA_ORIGEN_ALTA[a.origen], { ancho: 120 }),
                c.estado('estado', 'Estado', estadoDe, ESTADOS_ALTA),
                c.fecha('visita', 'Visita', a => a.fechaVisita),
                c.porcentaje('datos', 'Datos cargados', a => (a.camposTotal > 0 ? a.camposCargados / a.camposTotal : null), {
                    ancho: 120,
                }),
            ]),
        [esquema],
    )

    return (
        <TablaDatos
            datos={filas}
            columnas={columnas}
            getRowId={claveAlta}
            etiqueta="Clientes nuevos"
            unidad={{ singular: 'cliente nuevo', plural: 'clientes nuevos' }}
            buscar={{ placeholder: 'Buscar comercio, localidad o vendedor…' }}
            ordenInicial={{ id: 'estado', desc: false }}
            onClickFila={onElegir}
            etiquetaFila={a => `Ver ${valorVisible(esquema, a, 'nombre') ?? 'cliente nuevo'}`}
            testIdFila={a => `fila-alta-${claveAlta(a)}`}
        />
    )
}
