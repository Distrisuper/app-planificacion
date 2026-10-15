import { avanceDelMes, proyectarMes } from './proyeccionVentas'

// Octubre 2026: 24 días hábiles (22 L–V + 4 sábados × 0,5), feriado el lunes 12.

it('antes de las 13:00 el día de hoy todavía no cuenta', () => {
    // jueves 15/10 10:00 ART → cuenta hasta el miércoles 14
    const { transcurridos, totales } = avanceDelMes(new Date('2026-10-15T13:00:00Z'))
    // 1 (jue) 2 (vie) 3 (sáb ½) 5–9 (5) 10 (sáb ½) 12 feriado, 13–14 (2) = 10
    expect(transcurridos).toBe(10)
    expect(totales).toBe(24)
})

it('desde las 13:00 el día de hoy cuenta', () => {
    // jueves 15/10 14:00 ART
    expect(avanceDelMes(new Date('2026-10-15T17:00:00Z')).transcurridos).toBe(11)
})

it('proyecta el valor al mes completo', () => {
    expect(proyectarMes(1100, new Date('2026-10-15T17:00:00Z'))).toBeCloseTo(2400, 5)
})

it('un cero sigue siendo cero', () => {
    expect(proyectarMes(0, new Date('2026-10-15T17:00:00Z'))).toBe(0)
})

it('sin config del año usa días calendario', () => {
    const { transcurridos, totales } = avanceDelMes(new Date('2027-02-10T17:00:00Z'))
    expect(transcurridos).toBe(10)
    expect(totales).toBe(28)
})
