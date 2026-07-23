import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import BottomSheet from './BottomSheet'

it('renders children when open and fires onClose', async () => {
    const onClose = vi.fn()
    render(
        <BottomSheet open onClose={onClose} title="Propuesta">
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(screen.getByText('contenido')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Cerrar'))
    expect(onClose).toHaveBeenCalled()
})

it('renders nothing when closed', () => {
    render(<BottomSheet open={false} onClose={() => {}} title="X"><div>c</div></BottomSheet>)
    expect(screen.queryByText('c')).not.toBeInTheDocument()
})
