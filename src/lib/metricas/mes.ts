const pad = (n: number) => String(n).padStart(2, '0')
/** YYYY-MM de hoy, en TZ de negocio (misma TZ que `src/lib/fechas.ts`). */
export function mesActual(hoy: Date = new Date()): string {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' }).formatToParts(hoy)
    return `${p.find(x => x.type === 'year')!.value}-${p.find(x => x.type === 'month')!.value}`
}
export function mesAnterior(mes: string): string {
    const [a, m] = mes.split('-').map(Number)
    return m === 1 ? `${a - 1}-12` : `${a}-${pad(m - 1)}`
}
