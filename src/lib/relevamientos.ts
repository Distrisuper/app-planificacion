/**
 * "Datos del comercio": catálogos, el seam del gate y la traducción entre el borrador del
 * formulario y los `valores` que viajan al backend (spec 2026-09-22).
 *
 * El backend ya calculó qué le falta a cada cliente (`cliente.ficha.pendientes`, contra
 * pl_ficha_campo). Acá no hay lógica de "está cargado": sólo se lee eso, y se dibujan y
 * validan los campos que ahí aparezcan.
 */
import type { IAgendaClient } from '@/types/planificacion'

/** Orden de pantalla. Coincide con `orden` de pl_ficha_campo. */
export const CAMPOS_FICHA = ['especialidad', 'monomarca_marca', 'personas', 'facturacion'] as const
export type CampoFicha = (typeof CAMPOS_FICHA)[number]

/** Qué campos obligatorios le faltan al cliente. `[]` sin ficha: un backend viejo que no
 *  la mande no tiene que bloquear el inicio de la visita. */
export function camposPendientes(cliente: Pick<IAgendaClient, 'ficha'>): string[] {
    return cliente.ficha?.pendientes ?? []
}

/** El seam del gate: lo único que VisitaFlow le pregunta antes de dejar iniciar. */
export function relevamientoPendiente(cliente: Pick<IAgendaClient, 'ficha'>): boolean {
    return camposPendientes(cliente).length > 0
}

export interface EspecialidadOpcion {
    codigo: string
    label: string
    /** true = al elegirla se habilita un campo de texto extra ("¿cuál?"). */
    pideDetalle?: boolean
}

/** Orden tal cual lo dictó el negocio. No alfabético a propósito: las primeras son las
 *  más frecuentes en la cartera, así que la mayoría resuelve sin scrollear. */
export const ESPECIALIDADES: EspecialidadOpcion[] = [
    { codigo: 'suspension', label: 'Suspensión, dirección y transmisión' },
    { codigo: 'embragues', label: 'Embragues' },
    { codigo: 'frenos', label: 'Frenos' },
    { codigo: 'motor', label: 'Motor' },
    { codigo: 'rulemanero', label: 'Rulemanero' },
    { codigo: 'generalista', label: 'Generalista' },
    { codigo: 'electricidad', label: 'Electricidad' },
    { codigo: 'agro', label: 'Agro' },
    { codigo: 'monomarca', label: 'Monomarca', pideDetalle: true },
    { codigo: 'gomeria', label: 'Gomería' },
    { codigo: 'alineadora', label: 'Alineadora' },
    { codigo: 'concesionario', label: 'Concesionario' },
    { codigo: 'lubricentro', label: 'Lubricentro' },
    { codigo: 'taller', label: 'Taller' },
    { codigo: 'estacion-servicio', label: 'Estación de servicio' },
]

export const ESPECIALIDAD_CON_DETALLE = 'monomarca'

export interface TramoFacturacion {
    /** El código viene invertido del negocio (5 = el más chico, 1 = el más grande).
     *  Se respeta tal cual para no tener que traducir al analizar. */
    codigo: number
    label: string
    /** Lo que se dibuja dentro del segmento: cinco de estos tienen que entrar en el
     *  ancho de un teléfono. El `label` completo queda como `aria-label`, así que el
     *  lector de pantalla sigue diciendo "Mayor a 30M" y no "más 30 eme". */
    labelCorto: string
}

/** De menor a mayor en pantalla, aunque el código vaya al revés: leídos de mayor a
 *  menor, los tramos dejan de parecer una escala. */
export const TRAMOS_FACTURACION: TramoFacturacion[] = [
    { codigo: 5, label: 'Menor a 10M', labelCorto: '<10M' },
    { codigo: 4, label: 'Mayor a 10M', labelCorto: '+10M' },
    { codigo: 3, label: 'Mayor a 30M', labelCorto: '+30M' },
    { codigo: 2, label: 'Mayor a 50M', labelCorto: '+50M' },
    { codigo: 1, label: 'Mayor a 100M', labelCorto: '+100M' },
]

/** Un perfil parcial, tal como vive en el estado del formulario mientras se carga. */
export interface BorradorPerfil {
    especialidades: string[]
    monomarcaDetalle: string
    personas: string
    facturacion: number | null
}

export const BORRADOR_VACIO: BorradorPerfil = {
    especialidades: [],
    monomarcaDetalle: '',
    personas: '',
    facturacion: null,
}

export const PERSONAS_MAX = 999

export function personasValidas(texto: string): boolean {
    if (!/^\d+$/.test(texto.trim())) return false
    const n = Number(texto)
    return n >= 1 && n <= PERSONAS_MAX
}

/** Qué le falta al borrador entre los campos que se están mostrando, en orden de pantalla.
 *  Lista y no booleano para poder nombrarlo en el botón. `monomarca_marca` no se pide por
 *  su nombre: cuelga de que `especialidad` esté en juego e incluya Monomarca. */
export function faltantesPerfil(b: BorradorPerfil, campos: readonly string[]): string[] {
    const faltan: string[] = []
    if (campos.includes('especialidad')) {
        if (b.especialidades.length === 0) faltan.push('la especialidad')
        else if (b.especialidades.includes(ESPECIALIDAD_CON_DETALLE) && b.monomarcaDetalle.trim() === '')
            faltan.push('qué marca')
    }
    if (campos.includes('personas') && !personasValidas(b.personas)) faltan.push('cuántas personas trabajan')
    if (campos.includes('facturacion') && b.facturacion === null) faltan.push('la facturación')
    return faltan
}

/** El body del PUT: sólo los campos pedidos, como strings con el formato del ERP. null si
 *  falta algo. `monomarca_marca` va junto con `especialidad` cuando incluye Monomarca. */
export function aValoresFicha(
    b: BorradorPerfil,
    campos: readonly string[],
): Record<string, string[]> | null {
    if (faltantesPerfil(b, campos).length > 0) return null
    const valores: Record<string, string[]> = {}
    if (campos.includes('especialidad')) {
        valores.especialidad = b.especialidades
        if (b.especialidades.includes(ESPECIALIDAD_CON_DETALLE)) {
            valores.monomarca_marca = [b.monomarcaDetalle.trim()]
        }
    }
    if (campos.includes('personas')) valores.personas = [String(Number(b.personas))]
    if (campos.includes('facturacion')) valores.facturacion = [String(b.facturacion)]
    return valores
}

/** Precarga del borrador para la edición posterior, desde `cliente.ficha.valores`. */
export function deValoresFicha(valores: Record<string, string[]> | undefined): BorradorPerfil {
    if (!valores) return BORRADOR_VACIO
    const fact = Number(valores.facturacion?.[0])
    return {
        especialidades: valores.especialidad ?? [],
        monomarcaDetalle: valores.monomarca_marca?.[0] ?? '',
        personas: valores.personas?.[0] ?? '',
        facturacion: TRAMOS_FACTURACION.some(t => t.codigo === fact) ? fact : null,
    }
}
