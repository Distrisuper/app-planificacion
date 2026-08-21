import { describe, expect, it } from 'vitest'
import { distanciaMetros, estaFueraDeRango, RADIO_INICIO_METROS } from './distancia'

describe('distanciaMetros', () => {
    it('es 0 para el mismo punto', () => {
        expect(distanciaMetros(-34.6, -58.4, -34.6, -58.4)).toBe(0)
    })

    it('calcula ~111 km por grado de latitud en el ecuador', () => {
        const d = distanciaMetros(0, 0, 1, 0)
        expect(d).toBeGreaterThan(110_000)
        expect(d).toBeLessThan(112_000)
    })

    it('calcula una distancia corta y realista entre dos puntos cercanos', () => {
        // ~0.001° de latitud ≈ 111 m
        const d = distanciaMetros(-34.6000, -58.4000, -34.6010, -58.4000)
        expect(d).toBeGreaterThan(100)
        expect(d).toBeLessThan(120)
    })
})

describe('estaFueraDeRango', () => {
    it('no bloquea si la distancia está dentro del radio', () => {
        expect(estaFueraDeRango(40, 10)).toBe(false)
        expect(estaFueraDeRango(RADIO_INICIO_METROS, 0)).toBe(false)
    })

    it('bloquea cuando el fix es preciso y la distancia supera el radio', () => {
        expect(estaFueraDeRango(340, 15)).toBe(true)
    })

    it('no bloquea un fix grueso aunque marque lejos: la precisión descontada lo explica', () => {
        // 400 m de distancia con 500 m de precisión: no prueba que esté fuera de rango.
        expect(estaFueraDeRango(400, 500)).toBe(false)
    })

    it('bloquea justo en el borde: distancia - precisión > radio', () => {
        expect(estaFueraDeRango(115, 10)).toBe(true) // 105 > 100
        expect(estaFueraDeRango(110, 10)).toBe(false) // 100 no es > 100
    })
})
