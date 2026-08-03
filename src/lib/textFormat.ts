/**
 * Filas viejas quedaron guardadas con la conexión MySQL en el charset por
 * defecto (latin1): el backend recibió bytes UTF-8, los leyó como latin1 y
 * volvió a guardarlos re-codificados como UTF-8 — "é" quedó como "Ã©". Arreglar
 * el charset de la conexión (ya hecho en api-vendedores) no repara esas filas
 * ya guardadas mal, así que esto revierte la corrupción al mostrar el texto:
 * toma cada char como un byte latin1 y decodifica esa secuencia como UTF-8.
 * Texto ya bien codificado no decodifica como UTF-8 válido de un solo byte
 * (ej. "é" sola es 0xE9, que requiere continuación) y se devuelve sin tocar.
 */
export function fixMojibake(texto: string): string {
    if (!/^[ -ÿ]*$/.test(texto)) return texto
    try {
        const bytes = Uint8Array.from([...texto].map(c => c.charCodeAt(0)))
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
        return texto
    }
}

const LOWERCASE_JOINERS = new Set(['y', 'de', 'del', 'la', 'las', 'los', 'el'])
const KEEP_UPPER = new Set(['SRL', 'SA', 'SH', 'SAICF', 'SACI', 'SACIF', 'SCA', 'SC', 'CIA', 'SAIC'])

/**
 * The backend sends legal names in ALL CAPS. Shouted text is measurably
 * slower to scan (no ascender/descender shape), so we present a title-cased
 * version — keeping known legal suffixes (SRL, SA...) and Spanish joiners
 * (y, de, del...) in their conventional case instead of naively capitalizing
 * every word.
 */
export function titleCaseNombre(nombre: string): string {
    return nombre
        .split(' ')
        .map((word, i) => {
            if (!word) return word
            if (/^\(.*\)$/.test(word)) return word
            const clean = word.replace(/[().]/g, '').toUpperCase()
            if (KEEP_UPPER.has(clean)) return word.toUpperCase()
            const lower = word.toLowerCase()
            if (i > 0 && LOWERCASE_JOINERS.has(lower)) return lower
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        })
        .join(' ')
}

export function initialsOfCliente(nombre: string): string {
    const words = nombre
        .split(/\s+/)
        .filter(w => w && !LOWERCASE_JOINERS.has(w.toLowerCase()) && !/^\(.*\)$/.test(w))
    const initials = words
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase())
        .join('')
    return initials || '?'
}
