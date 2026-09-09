import { guardarVisitaEnCurso, leerVisitaEnCurso, limpiarVisitaEnCurso } from './visitaEnCurso'
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
