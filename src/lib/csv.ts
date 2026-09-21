/**
 * CSV para Excel en español (spec 2026-09-21): separador `;` (el Excel regional usa la coma
 * como decimal y rompe con `,`), BOM UTF-8 (sin él las tildes salen mal al doble click) y
 * escapado RFC 4180. No hay otro CSV en el repo: si aparece otro, sale de acá.
 */
export const SEPARADOR_CSV = ';'
const BOM = '﻿'

export function escaparCeldaCsv(v: string | null | undefined): string {
    if (v === null || v === undefined) return ''
    const necesita = v.includes(SEPARADOR_CSV) || v.includes('"') || v.includes('\n') || v.includes('\r')
    return necesita ? `"${v.replace(/"/g, '""')}"` : v
}

export function aCsv(filas: (string | null | undefined)[][]): string {
    return BOM + filas.map(f => f.map(escaparCeldaCsv).join(SEPARADOR_CSV)).join('\r\n')
}

/** Dispara la descarga en el navegador. No se testea: es DOM puro. */
export function descargarCsv(nombreArchivo: string, contenido: string): void {
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreArchivo
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}
