import {
    leerBorrador,
    guardarBorrador,
    limpiarBorrador,
    leerObservaciones,
    guardarObservaciones,
    limpiarObservaciones,
} from './resolucionDraft'

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

describe('borrador de observaciones', () => {
    beforeEach(() => localStorage.clear())

    it('guarda y lee el texto de una visita', () => {
        guardarObservaciones(42, 'Pidió lista de precios')
        expect(leerObservaciones(42)).toBe('Pidió lista de precios')
    })

    it('null si no hay nada guardado', () => {
        expect(leerObservaciones(42)).toBeNull()
    })

    it('cada visita tiene su propio borrador', () => {
        guardarObservaciones(42, 'de la 42')
        guardarObservaciones(43, 'de la 43')
        expect(leerObservaciones(42)).toBe('de la 42')
        expect(leerObservaciones(43)).toBe('de la 43')
    })

    it('limpiar borra solo el de esa visita', () => {
        guardarObservaciones(42, 'de la 42')
        guardarObservaciones(43, 'de la 43')
        limpiarObservaciones(42)
        expect(leerObservaciones(42)).toBeNull()
        expect(leerObservaciones(43)).toBe('de la 43')
    })

    it('no comparte clave con el borrador de motivos ni con el de detalles', () => {
        // Clave propia a propósito: cambiar la forma del borrador de motivos dejaría
        // ilegibles los borradores ya guardados de las visitas en curso (leerBorrador
        // descarta lo que no matchea su forma). Misma razón que `detalles`.
        guardarObservaciones(42, 'texto')
        expect(localStorage.getItem('visita-observaciones-42')).toBe('texto')
        expect(localStorage.getItem('visita-borrador-42')).toBeNull()
        expect(localStorage.getItem('visita-detalles-42')).toBeNull()
    })

    it('el texto se guarda tal cual, sin JSON.stringify', () => {
        // Es un string, no una estructura: guardarlo crudo hace que no haya forma de
        // que un JSON corrupto lo vuelva ilegible, que es el caso que leerBorrador
        // tiene que manejar con try/catch.
        guardarObservaciones(42, 'con "comillas" y \\ barras')
        expect(leerObservaciones(42)).toBe('con "comillas" y \\ barras')
    })
})
