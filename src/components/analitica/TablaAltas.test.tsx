import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import TablaAltas from './TablaAltas'
import type { IAltaRelevada } from '@/types/analitica'
import type { IEsquemaAlta } from '@/types/planificacion'

const ESQUEMA: IEsquemaAlta = {
    secciones: [{ clave: 'identidad', titulo: 'Identidad' }, { clave: 'ubicacion', titulo: 'Ubicación' }],
    campos: [
        { clave: 'nombre', etiqueta: 'Nombre del comercio', seccion: 'identidad', tipo: 'texto', max: 120, requerido: true },
        { clave: 'localidad', etiqueta: 'Localidad', seccion: 'ubicacion', tipo: 'texto', max: 120 },
    ],
    catalogos: null,
}
const alta: IAltaRelevada = {
    rotacionClienteId: 9, vendedor: { codigo: 'V 2', nombre: 'Gómez' }, estado: 'no_visita', fechaVisita: '2026-09-21',
    detalle: { nombre: 'Piche', localidad: 'Zárate' }, contacto: null, camposCargados: 2, camposTotal: 15,
}

it('una fila por alta con comercio, localidad, vendedor, estado, fecha y completo; tocar elige', () => {
    const onElegir = vi.fn()
    render(<TablaAltas filas={[alta]} esquema={ESQUEMA} onElegir={onElegir} />)
    expect(screen.getByText('Piche')).toBeInTheDocument()
    expect(screen.getByText('Zárate')).toBeInTheDocument()
    expect(screen.getByText('Gómez')).toBeInTheDocument()
    expect(screen.getByText('No visitó')).toBeInTheDocument()
    expect(screen.getByText('2026-09-21')).toBeInTheDocument()
    expect(screen.getByText('2/15')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Piche'))
    expect(onElegir).toHaveBeenCalledWith(alta)
})

it('sin detalle muestra "Cliente nuevo" y —', () => {
    render(<TablaAltas filas={[{ ...alta, detalle: null, fechaVisita: null, camposCargados: 0 }]} esquema={ESQUEMA} onElegir={() => {}} />)
    expect(screen.getByText('Cliente nuevo')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
})

it('una alta vinculada muestra la marca "En Flexxus" con el código', () => {
    render(
        <TablaAltas
            filas={[{ ...alta, vinculo: { codigoParticularCliente: '10034', vinculadoPor: 'admin@x.com', vinculadoEn: '2026-09-23T14:00:00.000Z' } }]}
            esquema={ESQUEMA}
            onElegir={() => {}}
        />,
    )
    expect(screen.getByText(/en flexxus · 10034/i)).toBeInTheDocument()
})
