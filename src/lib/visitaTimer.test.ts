import {
    formatearDuracion,
    limpiarInicioVisita,
    marcarInicioVisita,
    segundosTranscurridos,
} from './visitaTimer'

beforeEach(() => localStorage.clear())

it('sin inicio marcado, segundosTranscurridos devuelve null', () => {
    expect(segundosTranscurridos(1)).toBeNull()
})

it('marca el inicio y calcula segundos transcurridos', () => {
    const antes = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(antes)
    marcarInicioVisita(1)

    vi.spyOn(Date, 'now').mockReturnValue(antes + 5000)
    expect(segundosTranscurridos(1)).toBe(5)
})

it('marcar de nuevo la misma visita pisa el inicio anterior con el nuevo', () => {
    // Regresión: un guard "si ya existe, no lo toques" parecía inofensivo (marcar la
    // MISMA visita en curso dos veces no pasa en ningún flujo real), pero si el id se
    // reutilizaba (p.ej. tras un reset del backend de dev) y quedaba una clave vieja
    // de una visita anterior sin cerrar, el cronómetro de la visita NUEVA arrancaba
    // contando desde ese timestamp de hace horas o días, sin forma de corregirse.
    const antes = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(antes)
    marcarInicioVisita(1)

    vi.spyOn(Date, 'now').mockReturnValue(antes + 3000)
    marcarInicioVisita(1)

    vi.spyOn(Date, 'now').mockReturnValue(antes + 10000)
    expect(segundosTranscurridos(1)).toBe(7)
})

it('limpiarInicioVisita borra el registro', () => {
    marcarInicioVisita(1)
    limpiarInicioVisita(1)
    expect(segundosTranscurridos(1)).toBeNull()
})

it('visitas distintas no se pisan entre sí', () => {
    const antes = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(antes)
    marcarInicioVisita(1)
    marcarInicioVisita(2)

    vi.spyOn(Date, 'now').mockReturnValue(antes + 7000)
    expect(segundosTranscurridos(1)).toBe(7)
    expect(segundosTranscurridos(2)).toBe(7)

    limpiarInicioVisita(1)
    expect(segundosTranscurridos(1)).toBeNull()
    expect(segundosTranscurridos(2)).toBe(7)
})

it('formatearDuracion arma mm:ss con ceros a la izquierda', () => {
    expect(formatearDuracion(0)).toBe('00:00')
    expect(formatearDuracion(5)).toBe('00:05')
    expect(formatearDuracion(65)).toBe('01:05')
    expect(formatearDuracion(3661)).toBe('61:01')
})
