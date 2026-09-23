/**
 * "Datos del comercio": el seam del gate y la lógica del borrador del formulario.
 *
 * **Acá ya no viven las listas de opciones.** Salen del catálogo
 * (`GET /planificacion/ficha/campos`, hook `useCamposFicha`): qué campos hay, de qué tipo y
 * con qué opciones es DATO, no código. Antes estaban duplicadas entre `pl_ficha_campo` y este
 * archivo, y el 2026-09-22 las siete especialidades de la taxonomía del ERP se agregaron dos
 * veces, a mano, en los dos lados. Spec: 2026-09-22-catalogo-de-ficha-dirigido-por-la-base.
 *
 * Lo que sí vive acá es la traducción entre el borrador del formulario y los `valores` que
 * viajan al backend, más la única regla que el catálogo no modela (ver `CAMPO_MARCA`).
 */
import type { IAgendaClient, IFichaCampoDef, IFichaOpcion } from '@/types/planificacion'

/** Qué campos obligatorios le faltan al cliente. `[]` sin ficha: un backend viejo que no
 *  la mande no tiene que bloquear el inicio de la visita. */
export function camposPendientes(cliente: Pick<IAgendaClient, 'ficha'>): string[] {
    return cliente.ficha?.pendientes ?? []
}

/** El seam del gate: lo único que VisitaFlow le pregunta antes de dejar iniciar. */
export function relevamientoPendiente(cliente: Pick<IAgendaClient, 'ficha'>): boolean {
    return camposPendientes(cliente).length > 0
}

/**
 * La ÚNICA dependencia entre campos, y sigue hardcodeada a propósito: elegir "Monomarca" en
 * `especialidad` es lo que hace aparecer la pregunta de la marca.
 *
 * No se modela en el catálogo (`depende_de`) porque eso obligaría al gate del backend a
 * entender la semántica de un campo puntual — que es justamente lo que el spec original
 * descartó al dejar `monomarca_marca` con `obligatorio = 0` y su faltante calculado acá,
 * fuera del gate.
 */
export const ESPECIALIDAD_CON_DETALLE = 'monomarca'
export const CAMPO_ESPECIALIDAD = 'especialidad'
export const CAMPO_MARCA = 'monomarca_marca'

/** Aclaraciones al pie del título que no son dato del catálogo, sino copy de pantalla. Un
 *  campo nuevo simplemente no tiene, y no pasa nada. */
export const AYUDA_POR_CAMPO: Record<string, string> = {
    personas: 'incluido el dueño',
}

/**
 * El borrador del formulario. `valores` es lo que viaja al PUT (campo → lista de valores, la
 * misma forma que `pl_ficha_valor`), y `abiertas` marca en qué campos el vendedor eligió la
 * opción de escape ("Otros") y está escribiendo texto libre.
 *
 * Hace falta el segundo mapa porque lo que se guarda para "Otros" es **el texto**, no el
 * código de la opción: sin esta marca, "Otros elegido pero todavía sin escribir" sería
 * indistinguible de "no eligió nada".
 */
export interface BorradorFicha {
    valores: Record<string, string[]>
    abiertas: Record<string, boolean>
}

export const BORRADOR_VACIO: BorradorFicha = { valores: {}, abiertas: {} }

/** La opción de escape del campo, si tiene una. */
export function opcionAbierta(def: IFichaCampoDef): IFichaOpcion | undefined {
    return def.opciones?.find(o => o.abierta)
}

/** Los campos del catálogo que hay que dibujar, en orden. `pedidos` undefined = todos
 *  (modo edición); si viene, se filtra por él (modo gate: sólo los pendientes).
 *
 *  `monomarca_marca` NUNCA entra por esta puerta: no es un campo que se pida por su nombre,
 *  se dibuja colgado de la especialidad. */
export function camposADibujar(
    catalogo: IFichaCampoDef[],
    pedidos?: readonly string[],
): IFichaCampoDef[] {
    return catalogo
        .filter(c => c.campo !== CAMPO_MARCA)
        .filter(c => pedidos === undefined || pedidos.includes(c.campo))
        .sort((a, b) => a.orden - b.orden)
}

/** Reconstruye el borrador desde los valores vigentes del cliente. Un valor que no matchea
 *  ningún código de las opciones sólo puede venir de la opción abierta, así que se precarga
 *  como "Otros" + ese texto. */
export function borradorDesdeValores(
    catalogo: IFichaCampoDef[],
    valoresIniciales?: Record<string, string[]>,
): BorradorFicha {
    const valores: Record<string, string[]> = {}
    const abiertas: Record<string, boolean> = {}
    if (!valoresIniciales) return { valores, abiertas }
    for (const def of catalogo) {
        const actuales = valoresIniciales[def.campo]
        if (!actuales || actuales.length === 0) continue
        valores[def.campo] = [...actuales]
        if (def.tipo === 'opcion' && opcionAbierta(def)) {
            const codigos = new Set((def.opciones ?? []).map(o => o.codigo))
            if (actuales.some(v => !codigos.has(v))) abiertas[def.campo] = true
        }
    }
    return { valores, abiertas }
}

/** Si el valor cargado en ese campo es válido para su definición. No duplica la validación
 *  del backend (que es la que manda): es lo que decide si el botón del pie se habilita. */
function valorCompleto(def: IFichaCampoDef, borrador: BorradorFicha): boolean {
    const vs = (borrador.valores[def.campo] ?? []).filter(v => v.trim() !== '')
    if (vs.length === 0) return false
    if (def.tipo === 'entero') {
        return vs.every(v => {
            if (!/^\d+$/.test(v.trim())) return false
            const n = Number(v)
            return (def.minimo === null || n >= def.minimo) && (def.maximo === null || n <= def.maximo)
        })
    }
    if (def.tipo === 'texto' || borrador.abiertas[def.campo]) {
        return vs.every(
            v =>
                (def.minimo === null || v.trim().length >= def.minimo) &&
                (def.maximo === null || v.trim().length <= def.maximo),
        )
    }
    return true
}

/**
 * Qué falta cargar, como títulos del catálogo, en orden de pantalla. Lista y no booleano
 * para poder nombrarlo en el botón.
 *
 * `monomarca_marca` se evalúa aparte porque no está en `campos`: cuelga de que la
 * especialidad esté en juego e incluya Monomarca (ver `ESPECIALIDAD_CON_DETALLE`).
 */
export function faltantesFicha(
    campos: IFichaCampoDef[],
    borrador: BorradorFicha,
    defMarca?: IFichaCampoDef,
): string[] {
    const faltan: string[] = []
    for (const def of campos) {
        if (!valorCompleto(def, borrador)) {
            faltan.push(def.descripcion)
            continue
        }
        if (def.campo === CAMPO_ESPECIALIDAD && pideMarca(borrador) && defMarca) {
            if (!valorCompleto(defMarca, borrador)) faltan.push(defMarca.descripcion)
        }
    }
    return faltan
}

/** true cuando la especialidad elegida incluye Monomarca, o sea cuando hay que pedir la marca. */
export function pideMarca(borrador: BorradorFicha): boolean {
    return (borrador.valores[CAMPO_ESPECIALIDAD] ?? []).includes(ESPECIALIDAD_CON_DETALLE)
}

/** El body del PUT: sólo los campos que se estaban mostrando, trimmeados. null si falta algo.
 *  `monomarca_marca` viaja junto con `especialidad` cuando incluye Monomarca. */
export function aValoresFicha(
    campos: IFichaCampoDef[],
    borrador: BorradorFicha,
    defMarca?: IFichaCampoDef,
): Record<string, string[]> | null {
    if (faltantesFicha(campos, borrador, defMarca).length > 0) return null
    const valores: Record<string, string[]> = {}
    const agregar = (campo: string) => {
        const vs = (borrador.valores[campo] ?? []).map(v => v.trim()).filter(v => v !== '')
        if (vs.length > 0) valores[campo] = vs
    }
    for (const def of campos) agregar(def.campo)
    if (defMarca && pideMarca(borrador)) agregar(CAMPO_MARCA)
    return valores
}
