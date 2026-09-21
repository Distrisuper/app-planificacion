import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import DetalleAltaPanel from './DetalleAltaPanel'
import type { IAltaRelevada } from '@/types/analitica'
import type { IEsquemaAlta } from '@/types/planificacion'

const ESQUEMA: IEsquemaAlta = {
    secciones: [{ clave: 'identidad', titulo: 'Identidad' }, { clave: 'comercial', titulo: 'Comercial' }],
    campos: [
        { clave: 'nombre', etiqueta: 'Nombre del comercio', seccion: 'identidad', tipo: 'texto', max: 120, requerido: true },
        { clave: 'cuit', etiqueta: 'CUIT', seccion: 'identidad', tipo: 'cuit', max: 13 },
        { clave: 'condicionIva', etiqueta: 'Condición de IVA', seccion: 'comercial', tipo: 'catalogo', catalogo: 'iva' },
    ],
    catalogos: { iva: [{ codigo: 'RI', descripcion: 'Responsable Inscripto', orden: 10, activo: true }] },
}
const alta: IAltaRelevada = {
    rotacionClienteId: 9, vendedor: { codigo: 'V 2', nombre: 'Gómez' }, estado: 'visitada', fechaVisita: '2026-09-21',
    detalle: { nombre: 'Piche', condicionIva: 'RI' }, contacto: { contacto: 'Gustavo', fechaNacimiento: null },
    camposCargados: 2, camposTotal: 3,
}

it('muestra TODAS las secciones y campos del esquema, vacíos con —, catálogo como descripción, y el contacto del cierre', () => {
    render(<DetalleAltaPanel alta={alta} esquema={ESQUEMA} onCerrar={() => {}} />)
    expect(screen.getByText('Identidad')).toBeInTheDocument()
    expect(screen.getByText('Comercial')).toBeInTheDocument()
    expect(screen.getByText('CUIT')).toBeInTheDocument()
    expect(screen.getByText('Responsable Inscripto')).toBeInTheDocument()
    expect(screen.getByText('Gustavo')).toBeInTheDocument()
    // El subtítulo es un solo <p> con varios nodos de texto: regex, no exact match.
    expect(screen.getByText(/Gómez/)).toBeInTheDocument()
    expect(screen.getByText(/2 de 3 datos/)).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

it('cerrar', () => {
    const onCerrar = vi.fn()
    render(<DetalleAltaPanel alta={alta} esquema={ESQUEMA} onCerrar={onCerrar} />)
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onCerrar).toHaveBeenCalled()
})
