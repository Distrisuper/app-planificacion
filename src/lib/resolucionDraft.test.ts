import { leerBorrador, guardarBorrador, limpiarBorrador } from './resolucionDraft'

beforeEach(() => {
    localStorage.clear()
})

it('devuelve null si no hay borrador guardado', () => {
    expect(leerBorrador(42)).toBeNull()
})

it('guarda y relee un borrador', () => {
    const borrador = { 7: [{ motivoId: 10, valores: {} }] }
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

// Los teléfonos tienen guardado {marca, competidor, pctDiferencia}. Es JSON válido, así que
// el try/catch no lo ataja: hay que reconocer la forma. Si se colara, el primer render
// explota al leer `valores` de undefined.
it('descarta un borrador con la forma vieja, sin romper', () => {
    localStorage.setItem(
        'visita-borrador-42',
        JSON.stringify({ 7: [{ motivoId: 13, marca: 'X', competidor: 'Y', pctDiferencia: 12 }] }),
    )
    expect(leerBorrador(42)).toBeNull()
})

it('lee un borrador con la forma nueva', () => {
    const nuevo = { 7: [{ motivoId: 30, valores: { marca: 'Fric-Rot' } }] }
    localStorage.setItem('visita-borrador-42', JSON.stringify(nuevo))
    expect(leerBorrador(42)).toEqual(nuevo)
})

it('un borrador vacío sigue siendo válido', () => {
    localStorage.setItem('visita-borrador-42', JSON.stringify({ 7: [] }))
    expect(leerBorrador(42)).toEqual({ 7: [] })
})
