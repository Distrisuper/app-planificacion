import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    origen: 'planificacion', rotacionClienteId: 9, prospectoId: null, vendedor: { codigo: 'V 2', nombre: 'Gómez' }, estado: 'visitada', fechaVisita: '2026-09-21',
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

function mockarPortapapeles() {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    return writeText
}

it('tocar un dato lo copia al portapapeles y lo confirma en pantalla', async () => {
    const writeText = mockarPortapapeles()
    render(<DetalleAltaPanel alta={alta} esquema={ESQUEMA} onCerrar={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /copiar nombre del comercio/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Piche'))
    expect(await screen.findByText(/copiado/i)).toBeInTheDocument()
})

it('de un catálogo copia la DESCRIPCIÓN, que es lo que se ve, no el código', async () => {
    const writeText = mockarPortapapeles()
    render(<DetalleAltaPanel alta={alta} esquema={ESQUEMA} onCerrar={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /copiar condición de iva/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Responsable Inscripto'))
})

it('copia también el contacto de la visita', async () => {
    const writeText = mockarPortapapeles()
    render(<DetalleAltaPanel alta={alta} esquema={ESQUEMA} onCerrar={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /copiar con quién habló/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Gustavo'))
})

it('un campo vacío no es tocable: no hay nada que copiar', () => {
    mockarPortapapeles()
    render(<DetalleAltaPanel alta={alta} esquema={ESQUEMA} onCerrar={() => {}} />)
    expect(screen.queryByRole('button', { name: /copiar cuit/i })).not.toBeInTheDocument()
})

it('cambiar de alta vacía el código de Flexxus tipeado: no se vincula a la fila equivocada', () => {
    const { rerender } = render(<DetalleAltaPanel alta={alta} esquema={ESQUEMA} onCerrar={() => {}} onVincular={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/código de cliente en flexxus/i), { target: { value: 'C123' } })
    rerender(<DetalleAltaPanel alta={{ ...alta, rotacionClienteId: 10 }} esquema={ESQUEMA} onCerrar={() => {}} onVincular={vi.fn()} />)
    expect(screen.getByLabelText(/código de cliente en flexxus/i)).toHaveValue('')
})

it('pasar de un alta de televentas a otra vacía el código tipeado (las dos sin fila del plan)', () => {
    const deTv: IAltaRelevada = { ...alta, origen: 'televentas', rotacionClienteId: null, prospectoId: 4 }
    const { rerender } = render(<DetalleAltaPanel alta={deTv} esquema={ESQUEMA} onCerrar={() => {}} onVincular={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/código de cliente en flexxus/i), { target: { value: 'C123' } })
    rerender(<DetalleAltaPanel alta={{ ...deTv, prospectoId: 5 }} esquema={ESQUEMA} onCerrar={() => {}} onVincular={vi.fn()} />)
    expect(screen.getByLabelText(/código de cliente en flexxus/i)).toHaveValue('')
})

it('un alta de televentas muestra el origen y la ficha, con el contacto de la visita vacío', () => {
    const deTv: IAltaRelevada = {
        ...alta, origen: 'televentas', rotacionClienteId: null, prospectoId: 4, vendedor: { codigo: 'TV1', nombre: 'Lucía' },
        fechaVisita: null, contacto: null,
    }
    render(<DetalleAltaPanel alta={deTv} esquema={ESQUEMA} onCerrar={() => {}} />)
    expect(screen.getByText(/Televentas · Lucía/)).toBeInTheDocument()
    expect(screen.getByText('Responsable Inscripto')).toBeInTheDocument()
    expect(screen.getByText('Contacto de la visita')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /copiar con quién habló/i })).not.toBeInTheDocument()
})
