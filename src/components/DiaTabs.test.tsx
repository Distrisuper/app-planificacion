import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import DiaTabs from './DiaTabs'

it('renders each day and fires onSelect', async () => {
    const onSelect = vi.fn()
    render(
        <DiaTabs
            activo="LUN"
            onSelect={onSelect}
        />,
    )
    expect(screen.getByRole('button', { name: /^LUN \d+/ })).toBeInTheDocument()
    // Sin conteo: el X/Y del día lo dice la banda del tablero.
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^MAR/ }))
    expect(onSelect).toHaveBeenCalledWith('MAR')
})
