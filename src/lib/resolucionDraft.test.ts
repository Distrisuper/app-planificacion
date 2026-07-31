import { leerBorrador, guardarBorrador, limpiarBorrador } from './resolucionDraft'

beforeEach(() => {
    localStorage.clear()
})

it('devuelve null si no hay borrador guardado', () => {
    expect(leerBorrador(42)).toBeNull()
})

it('guarda y relee un borrador', () => {
    const borrador = { 7: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }] }
    guardarBorrador(42, borrador)
    expect(leerBorrador(42)).toEqual(borrador)
})

it('no mezcla borradores de visitas distintas', () => {
    guardarBorrador(42, { 7: [] })
    guardarBorrador(43, { 9: [] })
    expect(leerBorrador(42)).toEqual({ 7: [] })
    expect(leerBorrador(43)).toEqual({ 9: [] })
})

it('un JSON corrupto no rompe: devuelve null', () => {
    localStorage.setItem('visita-borrador-42', '{esto no es json')
    expect(leerBorrador(42)).toBeNull()
})

it('limpiarBorrador borra la entrada', () => {
    guardarBorrador(42, { 7: [] })
    limpiarBorrador(42)
    expect(leerBorrador(42)).toBeNull()
})
