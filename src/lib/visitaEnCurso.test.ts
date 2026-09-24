import {
    conCoordClienteDelServidor,
    guardarVisitaEnCurso,
    leerVisitaEnCurso,
    limpiarVisitaEnCurso,
} from './visitaEnCurso'
import type { IAgendaClient } from '@/types/planificacion'

const cliente = { rotacionClienteId: 7, nombreCliente: 'Kiosco Sur' } as IAgendaClient

beforeEach(() => localStorage.clear())

it('devuelve null si no hay visita en curso guardada', () => {
    expect(leerVisitaEnCurso()).toBeNull()
})

it('guarda y relee la visita en curso', () => {
    guardarVisitaEnCurso({ cliente, visitaId: 123 })
    expect(leerVisitaEnCurso()).toEqual({ cliente, visitaId: 123 })
})

it('guardar de nuevo pisa lo anterior: es singleton, no hay dos visitas en curso', () => {
    guardarVisitaEnCurso({ cliente, visitaId: 123 })
    const otroCliente = { rotacionClienteId: 9, nombreCliente: 'Almacén Norte' } as IAgendaClient
    guardarVisitaEnCurso({ cliente: otroCliente, visitaId: 456 })
    expect(leerVisitaEnCurso()).toEqual({ cliente: otroCliente, visitaId: 456 })
})

it('limpiarVisitaEnCurso borra la entrada', () => {
    guardarVisitaEnCurso({ cliente, visitaId: 123 })
    limpiarVisitaEnCurso()
    expect(leerVisitaEnCurso()).toBeNull()
})

it('un JSON corrupto no rompe: devuelve null', () => {
    localStorage.setItem('visita-en-curso', '{esto no es json')
    expect(leerVisitaEnCurso()).toBeNull()
})

describe('conCoordClienteDelServidor', () => {
    // Warehouse: Mar del Plata. Reposicionado al iniciar: Buenos Aires.
    const delWarehouse = { ...cliente, latitud: -38.0, longitud: -57.55 } as IAgendaClient
    const visita = { cliente: delWarehouse, visitaId: 123 }

    it('la coordenada que persistió el servidor al iniciar gana sobre la del card', () => {
        const r = conCoordClienteDelServidor(visita, { id: 123, coordCliente: '-34.6,-58.4' })
        expect(r!.cliente.latitud).toBe(-34.6)
        expect(r!.cliente.longitud).toBe(-58.4)
        expect(r!.visitaId).toBe(123)
    })

    it('si la activa del servidor es otra visita, no la toca', () => {
        const r = conCoordClienteDelServidor(visita, { id: 999, coordCliente: '-34.6,-58.4' })
        expect(r).toBe(visita)
    })

    it('sin coordCliente (o ilegible), deja la local', () => {
        expect(conCoordClienteDelServidor(visita, { id: 123, coordCliente: null })).toBe(visita)
        expect(conCoordClienteDelServidor(visita, { id: 123, coordCliente: 'basura' })).toBe(visita)
    })

    it('si ya coincide, devuelve la MISMA referencia (no dispara renders ni efectos)', () => {
        const r = conCoordClienteDelServidor(visita, { id: 123, coordCliente: '-38,-57.55' })
        expect(r).toBe(visita)
    })

    it('sin visita o sin respuesta, pasa derecho', () => {
        expect(conCoordClienteDelServidor(null, { id: 123, coordCliente: '-34.6,-58.4' })).toBeNull()
        expect(conCoordClienteDelServidor(visita, null)).toBe(visita)
        expect(conCoordClienteDelServidor(visita, undefined)).toBe(visita)
    })
})
