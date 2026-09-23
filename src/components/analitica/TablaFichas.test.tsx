import { render, screen } from '@testing-library/react'
import TablaFichas from './TablaFichas'
import type { IFichaCampoDef } from '@/types/planificacion'
import type { IFichaRelevadaFila } from '@/types/analitica'

const base = { minimo: null, maximo: null, obligatorio: true, multiple: false, opciones: null }

const CATALOGO: IFichaCampoDef[] = [
    {
        ...base, campo: 'especialidad', descripcion: 'Especialidad', tipo: 'opcion',
        multiple: true, orden: 1,
        opciones: [
            { codigo: 'frenos', label: 'Frenos' },
            { codigo: 'monomarca', label: 'Monomarca' },
        ],
    },
    {
        ...base, campo: 'monomarca_marca', descripcion: '¿De qué marca?', tipo: 'opcion',
        obligatorio: false, orden: 2,
        opciones: [{ codigo: 'ford', label: 'Ford' }, { codigo: 'otros', label: 'Otros', abierta: true }],
    },
    { ...base, campo: 'personas', descripcion: 'Personas que trabajan', tipo: 'entero', orden: 3 },
    {
        ...base, campo: 'facturacion', descripcion: 'Facturación mensual', tipo: 'opcion', orden: 4,
        opciones: [{ codigo: '3', label: 'Mayor a 30M', labelCorto: '+30M' }],
    },
]

const fila = (over: Partial<IFichaRelevadaFila> = {}): IFichaRelevadaFila => ({
    codigoParticularCliente: '06856',
    nombreCliente: 'NONNO SUSPENSION',
    valores: { especialidad: ['frenos'], personas: ['4'], facturacion: ['3'] },
    codigoParticularVendedor: 'V 2',
    nombreVendedor: 'PEREZ JUAN',
    relevadoEn: '2026-09-22T17:30:00.000Z',
    ...over,
})

const dibujar = (fichas: IFichaRelevadaFila[]) =>
    render(<TablaFichas fichas={fichas} catalogo={CATALOGO} />)

it('traduce los códigos con el CATÁLOGO, no con una constante del front', () => {
    dibujar([fila()])
    expect(screen.getByText('Mayor a 30M')).toBeInTheDocument()
    expect(screen.getByText('Frenos')).toBeInTheDocument()
    // El código crudo no se muestra en ningún lado.
    expect(screen.queryByText('3')).not.toBeInTheDocument()
})

it('las columnas y sus títulos salen del catálogo, en su orden, sin la marca', () => {
    dibujar([fila()])
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent)
    // `monomarca_marca` no tiene columna propia: cuelga de la especialidad.
    expect(headers).toEqual([
        'Cliente', 'Especialidad', 'Personas que trabajan', 'Facturación mensual',
        'Vendedor', 'Relevado',
    ])
})

it('Monomarca arrastra su marca entre paréntesis', () => {
    dibujar([fila({ valores: { especialidad: ['monomarca'], monomarca_marca: ['ford'] } })])
    expect(screen.getByText('Monomarca (Ford)')).toBeInTheDocument()
})

it('un valor fuera de la lista es el texto de la opción abierta: se muestra tal cual', () => {
    dibujar([fila({ valores: { especialidad: ['monomarca'], monomarca_marca: ['Chery'] } })])
    expect(screen.getByText('Monomarca (Chery)')).toBeInTheDocument()
})

it('varias especialidades se juntan, y un campo sin cargar muestra un guión', () => {
    dibujar([fila({ valores: { especialidad: ['frenos', 'monomarca'] } })])
    expect(screen.getByText('Frenos, Monomarca')).toBeInTheDocument()
    // Personas y facturación vacías: la ficha a medias también se muestra.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
})

it('la fecha sale en TZ de negocio, no cortando el ISO', () => {
    // 2026-09-23T01:00Z son las 22:00 del 22/09 en Argentina: cortar el ISO mostraría 23/09.
    dibujar([fila({ relevadoEn: '2026-09-23T01:00:00.000Z' })])
    expect(screen.getByText('22/09 22:00')).toBeInTheDocument()
})

it('sin nombre de cliente (warehouse caído) la fila igual se dibuja, con su código', () => {
    dibujar([fila({ nombreCliente: '' })])
    expect(screen.getByText('#06856')).toBeInTheDocument()
    expect(screen.getByText('Mayor a 30M')).toBeInTheDocument()
})

it('sin nombre de vendedor cae al código', () => {
    dibujar([fila({ nombreVendedor: '' })])
    expect(screen.getByText('V 2')).toBeInTheDocument()
})

it('cada celda es de UNA línea: el texto completo queda en el title para cuando se corta', () => {
    dibujar([fila({ valores: { especialidad: ['frenos', 'monomarca'] } })])
    const celda = screen.getByText('Frenos, Monomarca')
    expect(celda).toHaveClass('truncate')
    expect(celda).toHaveAttribute('title', 'Frenos, Monomarca')
    expect(screen.getByText(/NONNO SUSPENSION/)).toHaveAttribute(
        'title',
        '#06856 NONNO SUSPENSION',
    )
})
