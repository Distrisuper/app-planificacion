import { avanzarPeriodo, fechaAlCambiarModo, nombrePeriodo } from './periodo'

describe('periodo', () => {
    it('el mes avanza al día 1 del mes siguiente (un 31 no se arrastra a un mes corto)', () => {
        const siguiente = avanzarPeriodo('mes', new Date(2026, 0, 31), 1)
        expect([siguiente.getFullYear(), siguiente.getMonth(), siguiente.getDate()]).toEqual([2026, 1, 1])
    })

    it('la semana se mueve de a 7 días', () => {
        expect(avanzarPeriodo('semana', new Date(2026, 9, 14), -1).getDate()).toBe(7)
    })

    it('el día salta el fin de semana', () => {
        // Viernes 16/10/2026 → lunes 19.
        expect(avanzarPeriodo('dia', new Date(2026, 9, 16), 1).getDate()).toBe(19)
    })

    it('cambiar a Día un sábado arranca en el viernes; los otros modos, en hoy', () => {
        const sabado = new Date(2026, 9, 17)
        expect(fechaAlCambiarModo('dia', sabado).getDate()).toBe(16)
        expect(fechaAlCambiarModo('mes', sabado).getDate()).toBe(17)
    })

    it('nombra el período según el modo', () => {
        expect(nombrePeriodo('mes', new Date(2026, 9, 16))).toMatch(/octubre 2026/i)
    })
})
