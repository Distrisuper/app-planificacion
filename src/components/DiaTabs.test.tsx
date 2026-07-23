import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import DiaTabs from './DiaTabs'

it('renders each day with its count and fires onSelect', async () => {
    const onSelect = vi.fn()
    render(
        <DiaTabs
            activo="LUN"
            counts={{ LUN: { done: 3, total: 8 }, MAR: { done: 0, total: 8 }, MIE: { done: 0, total: 8 }, JUE: { done: 0, total: 8 }, VIE: { done: 0, total: 8 } }}
            onSelect={onSelect}
        />,
    )
    expect(screen.getByText('LUN')).toBeInTheDocument()
    await userEvent.click(screen.getByText('MAR'))
    expect(onSelect).toHaveBeenCalledWith('MAR')
})
