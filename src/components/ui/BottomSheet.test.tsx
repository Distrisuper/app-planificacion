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

/** Clases del panel (el hijo del overlay, que es quien lleva las de altura), como
 *  lista: `max-h-[90dvh]` CONTIENE a `h-[90dvh]` como substring, así que un
 *  `toContain` sobre el string entero da falsos positivos al negar. */
function clasesPanel() {
    return screen.getByText('contenido').closest('.animate-sheet-up')!.className.split(' ')
}

it('auto: el sheet mide lo que mide su contenido, hasta 85vh', () => {
    render(<BottomSheet open onClose={() => {}} title="X"><div>contenido</div></BottomSheet>)
    expect(clasesPanel()).toContain('max-h-[85vh]')
    expect(clasesPanel()).not.toContain('h-[90dvh]')
})

it('hasta-completa: crece con el contenido y recién se corta en 90dvh (sin alto fijo)', () => {
    render(
        <BottomSheet open onClose={() => {}} title="X" altura="hasta-completa">
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(clasesPanel()).toContain('max-h-[90dvh]')
    // Sin `h` fija: es lo que evita el hueco blanco cuando el contenido es corto.
    expect(clasesPanel()).not.toContain('h-[90dvh]')
})

it('completa: alto fijo de 90dvh, con tope en vh por si el navegador no entiende dvh', () => {
    render(
        <BottomSheet open onClose={() => {}} title="X" altura="completa">
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(clasesPanel()).toContain('h-[90dvh]')
    expect(clasesPanel()).toContain('max-h-[90vh]')
})

it('renders nothing when closed', () => {
    render(<BottomSheet open={false} onClose={() => {}} title="X"><div>c</div></BottomSheet>)
    expect(screen.queryByText('c')).not.toBeInTheDocument()
})
