import {
    DURACION_MAX_VALIDA,
    DURACION_MIN_VALIDA,
    TOLERANCIA_METROS,
    alertasAbsolutas,
    claseDistancia,
    esBajoPromedio,
    esDuracionValida,
    formatDistancia,
    formatDuracion,
    formatHoras,
    formatNumero,
    formatPct,
    formatPctEscalado,
    peorDistancia,
} from './analiticaFormat'

it('la tolerancia es de 100 m', () => {
    expect(TOLERANCIA_METROS).toBe(100)
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
    expect(claseDistancia(99, 50)).toBe('ok')
    expect(claseDistancia(100, 50)).toBe('ok')
    expect(claseDistancia(101, 50)).toBe('alerta')
})

it('claseDistancia usa la peor de las dos patas', () => {
    expect(claseDistancia(20, 150)).toBe('alerta')
    expect(claseDistancia(150, 20)).toBe('alerta')
})

it('claseDistancia devuelve neutro cuando no hay ningún dato: no es culpa del vendedor', () => {
    expect(claseDistancia(null, null)).toBe('neutro')
})

it('peorDistancia devuelve la mayor de las dos, o null si no hay ninguna', () => {
    expect(peorDistancia(20, 150)).toBe(150)
    expect(peorDistancia(80, null)).toBe(80)
    expect(peorDistancia(null, null)).toBeNull()
})

it('esDuracionValida exige el rango 10-90 min inclusive', () => {
    expect(esDuracionValida(DURACION_MIN_VALIDA)).toBe(true)
    expect(esDuracionValida(DURACION_MAX_VALIDA)).toBe(true)
    expect(esDuracionValida(9)).toBe(false)
    expect(esDuracionValida(91)).toBe(false)
    expect(esDuracionValida(null)).toBe(false)
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

it('formatPctEscalado nunca muestra NaN%: un campo que la API todavía no manda cae en s/d', () => {
    expect(formatPctEscalado(undefined)).toBe('s/d')
    expect(formatPctEscalado(NaN)).toBe('s/d')
})

it('formatHoras convierte minutos a horas con un decimal', () => {
    expect(formatHoras(null)).toBe('s/d')
    expect(formatHoras(1216)).toBe('20,3 hs')
    expect(formatHoras(60)).toBe('1 hs')
})
