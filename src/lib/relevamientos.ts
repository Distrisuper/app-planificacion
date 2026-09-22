/**
 * Catálogos del relevamiento "Perfil del comercio" — el primer formulario que se le
 * pide al vendedor ANTES de abrir la visita (ver el diseño en curso: gate genérico +
 * formulario concreto).
 *
 * MOCK: por ahora esto es sólo el front. No hay tabla ni endpoint todavía; el perfil
 * cargado se descarta al confirmar. Cuando exista el backend, lo único que cambia acá
 * es de dónde salen los catálogos (probablemente sigan hardcodeados: son cerrados y
 * chicos) y a dónde se manda `IPerfilComercio`.
 */

/**
 * ¿Hay algún relevamiento sin cargar para este cliente? Es el seam del gate: lo único
 * que `VisitaFlow` le pregunta al dominio antes de dejar iniciar la visita.
 *
 * MOCK: devuelve true siempre, porque todavía no hay dónde consultar si el cliente ya
 * fue perfilado. Cuando exista el backend, acá se mira el campo que lo diga (o la
 * lista de relevamientos pendientes, cuando haya más de uno) y el sheet deja de
 * aparecer en los clientes ya cargados.
 */
export function relevamientoPendiente(_rotacionClienteId: number): boolean {
    return true
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

export interface IPerfilComercio {
    especialidades: string[]
    /** Sólo cuando `especialidades` incluye 'monomarca'. Texto libre: el catálogo de
     *  marcas no cubre las que no vendemos, y acá lo que importa es de qué marca es el
     *  taller, no qué marca le vendemos. */
    monomarcaDetalle?: string
    personas: number
    facturacion: number
}

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

/** Qué le falta al borrador para poder confirmarse, en orden de aparición en pantalla.
 *  Se devuelve la lista entera (y no un booleano) para poder decirle al vendedor qué
 *  falta en el botón, igual que hace el cierre de visita con los rubros. */
export function faltantesPerfil(b: BorradorPerfil): string[] {
    const faltan: string[] = []
    if (b.especialidades.length === 0) faltan.push('la especialidad')
    if (b.especialidades.includes(ESPECIALIDAD_CON_DETALLE) && b.monomarcaDetalle.trim() === '')
        faltan.push('qué marca')
    if (!personasValidas(b.personas)) faltan.push('cuántas personas trabajan')
    if (b.facturacion === null) faltan.push('la facturación')
    return faltan
}

export function personasValidas(texto: string): boolean {
    if (!/^\d+$/.test(texto.trim())) return false
    const n = Number(texto)
    return n >= 1 && n <= PERSONAS_MAX
}

/** El borrador ya validado, listo para mandar. Devuelve null si falta algo. */
export function aPerfil(b: BorradorPerfil): IPerfilComercio | null {
    if (faltantesPerfil(b).length > 0) return null
    return {
        especialidades: b.especialidades,
        monomarcaDetalle: b.especialidades.includes(ESPECIALIDAD_CON_DETALLE)
            ? b.monomarcaDetalle.trim()
            : undefined,
        personas: Number(b.personas),
        facturacion: b.facturacion as number,
    }
}
