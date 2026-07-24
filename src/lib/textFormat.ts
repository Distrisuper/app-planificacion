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
