import { MOCK_RESUMEN, MOCK_VISITAS, MOCK_DETALLES, MOCK_OBJECIONES } from './analiticaMock'

it('tiene al menos 8 vendedores para que la tabla se vea poblada', () => {
    expect(MOCK_RESUMEN.vendedores.length).toBeGreaterThanOrEqual(8)
})

it('la fila de promedios se identifica y no tiene código de vendedor', () => {
    expect(MOCK_RESUMEN.promedios.nombreVendedor).toBe('PROMEDIOS')
    expect(MOCK_RESUMEN.promedios.codigoParticularVendedor).toBe('')
})

it('incluye un vendedor con ciclo en curso y cobertura parcial', () => {
    const v = MOCK_RESUMEN.vendedores.find(v => v.ciclosEnCurso > 0)
    expect(v).toBeDefined()
    expect(v!.cobertura).toBeLessThan(0.6)
})

it('incluye un vendedor con más de la mitad de las visitas no validadas', () => {
    const v = MOCK_RESUMEN.vendedores.find(
        v => v.visitasTotales > 0 && v.visitasNoValidadas >= v.visitasTotales * 0.5,
    )
    expect(v).toBeDefined()
})

it('incluye un vendedor con duración promedio bajo el piso de 20 min', () => {
    const v = MOCK_RESUMEN.vendedores.find(
        v => v.duracionPromedioMin !== null && v.duracionPromedioMin < 20,
    )
    expect(v).toBeDefined()
})

it('incluye un vendedor sin rubros ofrecidos: efectividad null, nunca 0', () => {
    const v = MOCK_RESUMEN.vendedores.find(v => v.rubrosOfrecidos === 0)
    expect(v).toBeDefined()
    expect(v!.efectividadComercial).toBeNull()
})

it('incluye un vendedor sin objetivo vigente', () => {
    const v = MOCK_RESUMEN.vendedores.find(v => v.efectividadOperativa === null)
    expect(v).toBeDefined()
    expect(v!.pctCumplimientoClientes).toBeNull()
})

it('incluye visitas sin coord del cliente, con distancia null', () => {
    const todas = Object.values(MOCK_VISITAS).flat()
    expect(todas.some(v => v.distanciaMetros === null)).toBe(true)
})

it('incluye una visita fuera de la tolerancia de 300 m', () => {
    const todas = Object.values(MOCK_VISITAS).flat()
    expect(todas.some(v => v.distanciaMetros !== null && v.distanciaMetros > 300)).toBe(true)
})

it('todo vendedor del resumen tiene visitas cargadas', () => {
    for (const v of MOCK_RESUMEN.vendedores) {
        expect(MOCK_VISITAS[v.codigoParticularVendedor]).toBeDefined()
    }
})

it('toda visita listada tiene su detalle para el nivel 3', () => {
    const todas = Object.values(MOCK_VISITAS).flat()
    for (const v of todas) {
        expect(MOCK_DETALLES[v.visitaId]).toBeDefined()
    }
})

it('los porcentajes de objeciones suman aproximadamente 1', () => {
    const suma = MOCK_OBJECIONES.motivos.reduce((acc, m) => acc + m.pct, 0)
    expect(suma).toBeGreaterThan(0.98)
    expect(suma).toBeLessThan(1.02)
})

it('los seis buckets de cada vendedor suman planificados', () => {
    for (const v of MOCK_RESUMEN.vendedores) {
        const suma = v.visitados + v.enCurso + v.noVisita + v.reagendados + v.pendientes
        expect(suma).toBe(v.planificados)
    }
})

it('hay al menos un vendedor con una visita en curso', () => {
    expect(MOCK_RESUMEN.vendedores.some(v => v.enCurso > 0)).toBe(true)
})
