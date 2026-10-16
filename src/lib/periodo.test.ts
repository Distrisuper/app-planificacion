import { avanzarPeriodo, fechaAlCambiarModo, nombrePeriodo, periodoDeRango, rangoDePeriodo } from './periodo'

describe('rango ↔ período (para pantallas que guardan desde/hasta en la URL)', () => {
    it('rangoDePeriodo: el día, la semana de lunes a viernes y el mes calendario', () => {
        const viernes = new Date(2026, 9, 16)
        expect(rangoDePeriodo('dia', viernes)).toEqual({ desde: '2026-10-16', hasta: '2026-10-16' })
        expect(rangoDePeriodo('semana', viernes)).toEqual({ desde: '2026-10-12', hasta: '2026-10-16' })
        expect(rangoDePeriodo('mes', viernes)).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' })
    })

    it('periodoDeRango reconoce un día, una semana y un mes', () => {
        expect(periodoDeRango('2026-10-16', '2026-10-16')).toEqual({ modo: 'dia', fecha: new Date(2026, 9, 16) })
        expect(periodoDeRango('2026-09-21', '2026-09-25')).toEqual({ modo: 'semana', fecha: new Date(2026, 8, 21) })
        expect(periodoDeRango('2026-10-01', '2026-10-31')).toEqual({ modo: 'mes', fecha: new Date(2026, 9, 1) })
    })

    it('un rango libre de un link viejo se lee como el mes de su inicio', () => {
        expect(periodoDeRango('2026-10-05', '2026-10-20')).toEqual({ modo: 'mes', fecha: new Date(2026, 9, 5) })
    })
})

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
