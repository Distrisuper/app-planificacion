import { isoLocal } from '@/lib/fechas'
import { descripcionCatalogo, valorDe } from '@/lib/camposAlta'
import type { IAltaRelevada } from '@/types/analitica'
import type { EstadoCicloCliente, IEsquemaAlta } from '@/types/planificacion'

export const ETIQUETA_ESTADO_ALTA: Record<EstadoCicloCliente, string> = {
    pendiente: 'Pendiente',
    en_curso: 'En curso',
    visitada: 'Visitada',
    no_visita: 'No visitó',
}

/** Valor de un campo tal como se muestra a gerencia: el catálogo resuelto a descripción. */
export function valorVisible(esquema: IEsquemaAlta, alta: IAltaRelevada, clave: string): string | null {
    const campo = esquema.campos.find(c => c.clave === clave)
    const v = valorDe(alta.detalle, clave)
    if (v === null) return null
    return campo?.tipo === 'catalogo' ? descripcionCatalogo(esquema.catalogos, campo.catalogo, v) : v
}

/** Una fila por alta, columnas = las del esquema (en su orden) + las fijas de la visita.
 *  Recorre el esquema: un campo nuevo en la API aparece solo en el CSV. */
export function filasCsvAltas(esquema: IEsquemaAlta, altas: IAltaRelevada[]): (string | null)[][] {
    const encabezado = [
        ...esquema.campos.map(c => c.etiqueta),
        'Vendedor', 'Estado', 'Fecha', 'Contacto de la visita', 'Cumpleaños del contacto', 'Datos cargados',
        'Código Flexxus',
    ]
    const filas = altas.map(a => [
        ...esquema.campos.map(c => valorVisible(esquema, a, c.clave)),
        a.vendedor.nombre || a.vendedor.codigo,
        ETIQUETA_ESTADO_ALTA[a.estado],
        a.fechaVisita,
        a.contacto?.contacto ?? null,
        a.contacto?.fechaNacimiento ?? null,
        `${a.camposCargados}/${a.camposTotal}`,
        a.vinculo?.codigoParticularCliente ?? null,
    ])
    return [encabezado, ...filas]
}

export function nombreArchivoAltas(hoy: Date): string {
    return `altas-${isoLocal(hoy)}.csv`
}
