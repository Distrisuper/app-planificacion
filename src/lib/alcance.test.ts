import { describe, expect, it } from 'vitest'
import { claveAlcance, resumenAlcance, toggleAlcance } from './alcance'
import type { IAlcance } from '@/types/planificacion'

const skf: IAlcance = { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }
const rodam: IAlcance = { tipo: 'rubro', codigo: 'RODAM', descripcion: 'Rodamientos' }

describe('claveAlcance', () => {
    it('combina tipo y código: el mismo código en dos tipos son destinos distintos', () => {
        expect(claveAlcance(skf)).toBe('marca:SKF')
        expect(claveAlcance({ ...skf, tipo: 'rubro' })).toBe('rubro:SKF')
    })
})

describe('toggleAlcance', () => {
    it('agrega un destino que no estaba', () => {
        expect(toggleAlcance([], skf)).toEqual([skf])
    })

    it('saca un destino que ya estaba', () => {
        expect(toggleAlcance([skf, rodam], skf)).toEqual([rodam])
    })

    it('no duplica: togglear dos veces vuelve al estado inicial', () => {
        expect(toggleAlcance(toggleAlcance([], skf), skf)).toEqual([])
    })
})

describe('resumenAlcance', () => {
    it('sin destinos dice que la oferta es para todo el cliente', () => {
        expect(resumenAlcance([])).toBe('Todo el cliente')
    })

    it('con un destino muestra su descripción', () => {
        expect(resumenAlcance([skf])).toBe('SKF')
    })

    it('con varios destinos los junta', () => {
        expect(resumenAlcance([skf, rodam])).toBe('SKF · Rodamientos')
    })

    // Parado en un mostrador nadie lee ocho nombres en una línea.
    it('con más de tres corta y cuenta el resto', () => {
        const muchos: IAlcance[] = [
            skf,
            rodam,
            { tipo: 'marca', codigo: 'C', descripcion: 'Corven' },
            { tipo: 'marca', codigo: 'D', descripcion: 'Dana' },
            { tipo: 'marca', codigo: 'E', descripcion: 'Elring' },
        ]
        expect(resumenAlcance(muchos)).toBe('SKF · Rodamientos · Corven +2')
    })
})
