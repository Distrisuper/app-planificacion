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
 *  lista: `max-h-[96dvh]` CONTIENE a `h-[96dvh]` como substring, así que un
 *  `toContain` sobre el string entero da falsos positivos al negar. */
function clasesPanel() {
    return screen.getByText('contenido').closest('.animate-sheet-up')!.className.split(' ')
}

it('auto: el sheet mide lo que mide su contenido, hasta 85vh', () => {
    render(<BottomSheet open onClose={() => {}} title="X"><div>contenido</div></BottomSheet>)
    expect(clasesPanel()).toContain('max-h-[85vh]')
    expect(clasesPanel()).not.toContain('h-[96dvh]')
})

it('hasta-completa: crece con el contenido y recién se corta en 90dvh (sin alto fijo)', () => {
    render(
        <BottomSheet open onClose={() => {}} title="X" altura="hasta-completa">
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(clasesPanel()).toContain('max-h-[90dvh]')
    // Sin `h` fija: es lo que evita el hueco blanco cuando el contenido es corto.
    expect(clasesPanel()).not.toContain('h-[96dvh]')
})

it('completa: alto fijo de 96dvh, con tope en vh por si el navegador no entiende dvh', () => {
    render(
        <BottomSheet open onClose={() => {}} title="X" altura="completa">
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(clasesPanel()).toContain('h-[96dvh]')
    expect(clasesPanel()).toContain('max-h-[96vh]')
})

it('renders nothing when closed', () => {
    render(<BottomSheet open={false} onClose={() => {}} title="X"><div>c</div></BottomSheet>)
    expect(screen.queryByText('c')).not.toBeInTheDocument()
})

it('sin `acciones` no dibuja el botón de menú', () => {
    render(<BottomSheet open onClose={() => {}} title="X"><div>contenido</div></BottomSheet>)
    expect(screen.queryByLabelText('Más acciones')).not.toBeInTheDocument()
})

it('con `acciones` abre el popover al tocar el menú', async () => {
    render(
        <BottomSheet open onClose={() => {}} title="X" acciones={<button>No visité</button>}>
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(screen.queryByText('No visité')).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Más acciones'))
    expect(screen.getByText('No visité')).toBeInTheDocument()
})

// El overlay del sheet cierra EL SHEET al click. Sin stopPropagation en el catcher del
// popover, tocar afuera del menú cerraría la visita entera.
it('tocar fuera del popover lo cierra sin cerrar el sheet', async () => {
    const onClose = vi.fn()
    render(
        <BottomSheet open onClose={onClose} title="X" acciones={<button>No visité</button>}>
            <div>contenido</div>
        </BottomSheet>,
    )
    await userEvent.click(screen.getByLabelText('Más acciones'))
    await userEvent.click(screen.getByTestId('cerrar-menu-acciones'))

    expect(screen.queryByText('No visité')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
})
