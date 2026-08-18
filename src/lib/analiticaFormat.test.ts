import {
    TOLERANCIA_METROS,
    alertasAbsolutas,
    claseDistancia,
    esBajoPromedio,
    formatDistancia,
    formatDuracion,
    formatHoras,
    formatNumero,
    formatPct,
    formatPctEscalado,
} from './analiticaFormat'

it('la tolerancia es de 300 m', () => {
    expect(TOLERANCIA_METROS).toBe(300)
})

it('formatPct muestra s/d cuando el dato falta, nunca 0%', () => {
    expect(formatPct(null)).toBe('s/d')
    expect(formatPct(0.554)).toBe('55%')
    expect(formatPct(1)).toBe('100%')
})

it('formatNumero redondea a un decimal y respeta el null', () => {
    expect(formatNumero(6.83)).toBe('6,8')
    expect(formatNumero(34)).toBe('34')
    expect(formatNumero(null)).toBe('s/d')
})

it('formatDistancia muestra s/d cuando el cliente no tiene coords', () => {
    expect(formatDistancia(null)).toBe('s/d')
    expect(formatDistancia(45)).toBe('45 m')
    expect(formatDistancia(7307510)).toBe('7307510 m')
})

it('formatDuracion redondea a minutos enteros', () => {
    expect(formatDuracion(38)).toBe('38 min')
    expect(formatDuracion(null)).toBe('s/d')
})

it('claseDistancia pinta verde dentro de la tolerancia, inclusive en el límite', () => {
    expect(claseDistancia(299)).toBe('ok')
    expect(claseDistancia(300)).toBe('ok')
    expect(claseDistancia(301)).toBe('alerta')
})

it('claseDistancia devuelve neutro cuando no hay dato: no es culpa del vendedor', () => {
    expect(claseDistancia(null)).toBe('neutro')
})

it('esBajoPromedio marca por debajo del 70% del promedio del equipo', () => {
    expect(esBajoPromedio(6, 10)).toBe(true)
    expect(esBajoPromedio(7, 10)).toBe(false)
    expect(esBajoPromedio(12, 10)).toBe(false)
})

it('esBajoPromedio no marca nada si falta algún dato', () => {
    expect(esBajoPromedio(null, 10)).toBe(false)
    expect(esBajoPromedio(6, null)).toBe(false)
    expect(esBajoPromedio(6, 0)).toBe(false)
})

it('alertasAbsolutas detecta duración bajo 20 min', () => {
    const alertas = alertasAbsolutas({ duracionPromedioMin: 14, visitasTotales: 39, visitasNoValidadas: 2 })
    expect(alertas).toContain('duracion')
})

it('alertasAbsolutas detecta la mitad o más de visitas no validadas', () => {
    const alertas = alertasAbsolutas({ duracionPromedioMin: 33, visitasTotales: 30, visitasNoValidadas: 17 })
    expect(alertas).toContain('geo')
})

it('alertasAbsolutas no marca nada en un vendedor sano', () => {
    const alertas = alertasAbsolutas({ duracionPromedioMin: 46, visitasTotales: 41, visitasNoValidadas: 1 })
    expect(alertas).toEqual([])
})

it('alertasAbsolutas no marca geo sin visitas: 0 de 0 no es una alerta', () => {
    const alertas = alertasAbsolutas({ duracionPromedioMin: null, visitasTotales: 0, visitasNoValidadas: 0 })
    expect(alertas).toEqual([])
})

it('formatPctEscalado redondea un valor ya expresado en escala 0..100, nunca 0% por null', () => {
    expect(formatPctEscalado(null)).toBe('s/d')
    expect(formatPctEscalado(89.4)).toBe('89%')
    expect(formatPctEscalado(100)).toBe('100%')
    expect(formatPctEscalado(104)).toBe('104%')
})

it('formatHoras convierte minutos a horas con un decimal', () => {
    expect(formatHoras(null)).toBe('s/d')
    expect(formatHoras(1216)).toBe('20,3 hs')
    expect(formatHoras(60)).toBe('1 hs')
})
