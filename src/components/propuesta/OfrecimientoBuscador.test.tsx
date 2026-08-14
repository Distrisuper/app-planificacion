import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import OfrecimientoBuscador, { type IElegidoOfrecimiento } from './OfrecimientoBuscador'

const rubros = [{ code: 'BUJES', description: 'Bujes' }]
const marcas = [{ code: 'SKF', description: 'SKF' }]

describe('OfrecimientoBuscador', () => {
    it('sin escribir nada, mezcla rubro y marca en una sola lista', () => {
        render(<OfrecimientoBuscador rubros={rubros} marcas={marcas} onSelect={vi.fn()} />)

        expect(screen.getByRole('button', { name: /bujes/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /skf/i })).toBeInTheDocument()
    })

    // Las acciones ya no se agregan como ofrecimiento: se cargan al RESOLVER un rubro
    // (ver spec de la acción comercial en la resolución).
    it('no ofrece acciones', () => {
        render(<OfrecimientoBuscador rubros={rubros} marcas={marcas} onSelect={vi.fn()} />)

        expect(screen.queryByText('Acción')).not.toBeInTheDocument()
    })

    it('cada resultado muestra su tag de tipo', () => {
        render(<OfrecimientoBuscador rubros={rubros} marcas={marcas} onSelect={vi.fn()} />)

        expect(screen.getByRole('button', { name: /bujes/i })).toHaveTextContent('Rubro')
        expect(screen.getByRole('button', { name: /skf/i })).toHaveTextContent('Marca')
    })

    it('buscar filtra sobre los dos catálogos a la vez', () => {
        render(<OfrecimientoBuscador rubros={rubros} marcas={marcas} onSelect={vi.fn()} />)

        fireEvent.change(screen.getByPlaceholderText(/buscar rubro o marca/i), {
            target: { value: 'buj' },
        })

        expect(screen.getByRole('button', { name: /bujes/i })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /skf/i })).not.toBeInTheDocument()
    })

    it('tocar un resultado de rubro dispara onSelect con tipo rubro', () => {
        const onSelect = vi.fn()
        render(<OfrecimientoBuscador rubros={rubros} marcas={marcas} onSelect={onSelect} />)

        fireEvent.click(screen.getByRole('button', { name: /bujes/i }))

        expect(onSelect).toHaveBeenCalledWith({ tipo: 'rubro', codigo: 'BUJES', descripcion: 'Bujes' })
    })

    it('tocar un resultado de marca dispara onSelect con tipo marca', () => {
        const onSelect = vi.fn()
        render(<OfrecimientoBuscador rubros={rubros} marcas={marcas} onSelect={onSelect} />)

        fireEvent.click(screen.getByRole('button', { name: /skf/i }))

        expect(onSelect).toHaveBeenCalledWith({ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' })
    })

    it('mientras marcasLoading, las marcas no aparecen pero rubros sí', () => {
        render(
            <OfrecimientoBuscador rubros={rubros} marcas={marcas} marcasLoading onSelect={vi.fn()} />,
        )

        expect(screen.getByRole('button', { name: /bujes/i })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /skf/i })).not.toBeInTheDocument()
        expect(screen.getByText(/cargando marcas/i)).toBeInTheDocument()
    })

    it('sin resultados, muestra el mensaje correspondiente', () => {
        render(<OfrecimientoBuscador rubros={rubros} marcas={marcas} onSelect={vi.fn()} />)

        fireEvent.change(screen.getByPlaceholderText(/buscar rubro o marca/i), {
            target: { value: 'zzz' },
        })

        expect(screen.getByText(/sin resultados/i)).toBeInTheDocument()
    })

    describe('colapso tras elegir', () => {
        it('sin nada elegido, arranca expandido (se ve la lista)', () => {
            render(<OfrecimientoBuscador rubros={rubros} marcas={marcas} onSelect={vi.fn()} />)

            expect(screen.getByPlaceholderText(/buscar rubro o marca/i)).toBeInTheDocument()
        })

        it('tocar un resultado colapsa la lista a un resumen', () => {
            // Componente controlado: simula al padre (AgregarOfrecimientoSheet)
            // actualizando `value` en respuesta a onSelect.
            function Wrapper() {
                const [value, setValue] = useState<IElegidoOfrecimiento | null>(null)
                return (
                    <OfrecimientoBuscador
                        rubros={rubros}
                        marcas={marcas}
                        value={value}
                        onSelect={setValue}
                    />
                )
            }
            render(<Wrapper />)

            fireEvent.click(screen.getByRole('button', { name: /skf/i }))

            expect(screen.queryByPlaceholderText(/buscar rubro o marca/i)).not.toBeInTheDocument()
            expect(screen.getByRole('button', { name: /skf/i })).toHaveTextContent('Marca')
        })

        it('con algo ya elegido (value), arranca colapsado', () => {
            render(
                <OfrecimientoBuscador
                    rubros={rubros}
                    marcas={marcas}
                    value={{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }}
                    onSelect={vi.fn()}
                />,
            )

            expect(screen.queryByPlaceholderText(/buscar rubro o marca/i)).not.toBeInTheDocument()
            expect(screen.getByRole('button', { name: /skf/i })).toBeInTheDocument()
        })

        it('tocar el resumen colapsado lo vuelve a expandir', () => {
            render(
                <OfrecimientoBuscador
                    rubros={rubros}
                    marcas={marcas}
                    value={{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }}
                    onSelect={vi.fn()}
                />,
            )

            fireEvent.click(screen.getByRole('button', { name: /skf/i }))

            expect(screen.getByPlaceholderText(/buscar rubro o marca/i)).toBeInTheDocument()
        })

        it('expandido de nuevo, lo ya elegido se marca con un tilde', () => {
            render(
                <OfrecimientoBuscador
                    rubros={rubros}
                    marcas={marcas}
                    value={{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }}
                    onSelect={vi.fn()}
                />,
            )

            fireEvent.click(screen.getByRole('button', { name: /skf/i }))

            const boton = screen.getByRole('button', { name: /skf/i })
            expect(boton.querySelector('.lucide-check')).toBeTruthy()
        })
    })
})
