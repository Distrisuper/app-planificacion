import { estaResuelto } from './estadoCiclo'

it('pendiente no está resuelto', () => {
    expect(estaResuelto('pendiente')).toBe(false)
})

it('en_curso NO cuenta como resuelto: la visita sigue abierta', () => {
    // Si contara, el progreso mostraría trabajo terminado que todavía traba el
    // cierre de la semana.
    expect(estaResuelto('en_curso')).toBe(false)
})

it('visitada y no_visita cuentan como resueltos', () => {
    expect(estaResuelto('visitada')).toBe(true)
    expect(estaResuelto('no_visita')).toBe(true)
})
