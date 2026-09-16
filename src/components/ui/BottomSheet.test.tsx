import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import BottomSheet from './BottomSheet'
import { useViewportTeclado } from '@/hooks/useViewportTeclado'

vi.mock('@/hooks/useViewportTeclado', () => ({
    useViewportTeclado: vi.fn(() => ({ tapado: 0, desplazado: 0 })),
}))

beforeEach(() => {
    vi.mocked(useViewportTeclado).mockReturnValue({ tapado: 0, desplazado: 0 })
})

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
 *  lista: `max-h-[96%]` CONTIENE a `h-[96%]` como substring, así que un
 *  `toContain` sobre el string entero da falsos positivos al negar. */
function clasesPanel() {
    return screen.getByText('contenido').closest('.animate-sheet-up')!.className.split(' ')
}

function overlay() {
    return screen.getByText('contenido').closest('.animate-fade-in') as HTMLElement
}

/* Las tres alturas van en % del overlay —no en dvh/vh— porque el overlay se achica
   con el teclado (padding) y el viewport de iOS no. Ver el comentario en BottomSheet. */

it('auto: el sheet mide lo que mide su contenido, hasta el 85% de la franja visible', () => {
    render(<BottomSheet open onClose={() => {}} title="X"><div>contenido</div></BottomSheet>)
    expect(clasesPanel()).toContain('max-h-[85%]')
    expect(clasesPanel()).not.toContain('h-[96%]')
})

it('hasta-completa: crece con el contenido y recién se corta en 90% (sin alto fijo)', () => {
    render(
        <BottomSheet open onClose={() => {}} title="X" altura="hasta-completa">
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(clasesPanel()).toContain('max-h-[90%]')
    // Sin `h` fija: es lo que evita el hueco blanco cuando el contenido es corto.
    expect(clasesPanel()).not.toContain('h-[96%]')
})

it('completa: alto fijo del 96% de la franja visible', () => {
    render(
        <BottomSheet open onClose={() => {}} title="X" altura="completa">
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(clasesPanel()).toContain('h-[96%]')
})

// Ninguna de las tres puede volver a expresarse en viewport units: son lo que hacía
// que el sheet se desbordara por arriba con el teclado de iOS abierto (el layout
// viewport no se achica, así que 96dvh seguía siendo 96% de la pantalla ENTERA).
it.each(['auto', 'hasta-completa', 'completa'] as const)('%s: ninguna altura en dvh/vh', altura => {
    render(
        <BottomSheet open onClose={() => {}} title="X" altura={altura}>
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(clasesPanel().filter(c => /^(max-)?h-\[.*(dvh|vh)\]$/.test(c))).toEqual([])
})

// El overlay es `fixed`, o sea anclado al LAYOUT viewport: los dos padding son lo que
// lo recorta a la franja que el usuario realmente ve.
it('el overlay se recorta a la franja visible: padding abajo por el teclado y arriba por el paneo', () => {
    vi.mocked(useViewportTeclado).mockReturnValue({ tapado: 300, desplazado: 20 })
    render(<BottomSheet open onClose={() => {}} title="X"><div>contenido</div></BottomSheet>)
    expect(overlay().style.paddingBottom).toBe('300px')
    expect(overlay().style.paddingTop).toBe('20px')
})

it('renders nothing when closed', () => {
    render(<BottomSheet open={false} onClose={() => {}} title="X"><div>c</div></BottomSheet>)
    expect(screen.queryByText('c')).not.toBeInTheDocument()
})

it('sin `acciones` no agrega nada a la línea del subtitle', () => {
    render(
        <BottomSheet open onClose={() => {}} title="X" subtitle="#10034">
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(screen.queryByText('No visité')).not.toBeInTheDocument()
})

// Sin menú intermedio: visible de entrada, un solo toque.
it('con `acciones` lo pinta directo, sin popover', () => {
    render(
        <BottomSheet open onClose={() => {}} title="X" subtitle="#10034" acciones={<button>No visité</button>}>
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(screen.getByText('No visité')).toBeInTheDocument()
})

it('`acciones` funciona también sin `subtitle`', () => {
    render(
        <BottomSheet open onClose={() => {}} title="X" acciones={<button>No visité</button>}>
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(screen.getByText('No visité')).toBeInTheDocument()
})

describe('botón de ayuda ("?")', () => {
    it('sin onHelp, no aparece', () => {
        render(<BottomSheet open onClose={() => {}} title="X"><div>contenido</div></BottomSheet>)
        expect(screen.queryByLabelText(/cómo funciona esta pantalla/i)).not.toBeInTheDocument()
    })

    it('con onHelp, aparece primero (antes de Minimizar y Cerrar)', () => {
        render(
            <BottomSheet open onClose={() => {}} onMinimize={() => {}} onHelp={() => {}} title="X">
                <div>contenido</div>
            </BottomSheet>,
        )
        const botones = screen.getAllByRole('button').filter(b => ['Cómo funciona esta pantalla', 'Minimizar', 'Cerrar'].includes(b.getAttribute('aria-label') ?? ''))
        expect(botones.map(b => b.getAttribute('aria-label'))).toEqual(['Cómo funciona esta pantalla', 'Minimizar', 'Cerrar'])
    })

    it('tocarlo llama a onHelp', async () => {
        const onHelp = vi.fn()
        render(<BottomSheet open onClose={() => {}} onHelp={onHelp} title="X"><div>contenido</div></BottomSheet>)
        await userEvent.click(screen.getByLabelText(/cómo funciona esta pantalla/i))
        expect(onHelp).toHaveBeenCalled()
    })

    it('sin ayudaAbierta, el panel no se ve aunque haya ayudaContenido', () => {
        render(
            <BottomSheet open onClose={() => {}} onHelp={() => {}} ayudaContenido={<span>Tocá el rubro</span>} title="X">
                <div>contenido</div>
            </BottomSheet>,
        )
        expect(screen.queryByText('Tocá el rubro')).not.toBeInTheDocument()
    })

    it('con ayudaAbierta, flota el panel — no empuja el contenido de abajo', () => {
        render(
            <BottomSheet
                open
                onClose={() => {}}
                onHelp={() => {}}
                ayudaAbierta
                ayudaContenido={<span>Tocá el rubro</span>}
                title="X"
            >
                <div>contenido</div>
            </BottomSheet>,
        )
        const panel = screen.getByText('Tocá el rubro').closest('div')!
        expect(panel.className).toContain('absolute')
        expect(screen.getByText('contenido')).toBeInTheDocument()
    })

    it('tocar afuera del panel (pero dentro del sheet) llama a onHelp para cerrarlo, sin cerrar el sheet', async () => {
        const onHelp = vi.fn()
        const onClose = vi.fn()
        render(
            <BottomSheet open onClose={onClose} onHelp={onHelp} ayudaAbierta ayudaContenido={<span>Tocá el rubro</span>} title="X">
                <div>contenido</div>
            </BottomSheet>,
        )
        await userEvent.click(screen.getByTestId('overlay-ayuda'))
        expect(onHelp).toHaveBeenCalled()
        expect(onClose).not.toHaveBeenCalled()
    })

    it('sin ayudaAbierta, no hay capa que intercepte los clicks del contenido', () => {
        render(<BottomSheet open onClose={() => {}} onHelp={() => {}} title="X"><div>contenido</div></BottomSheet>)
        expect(screen.queryByTestId('overlay-ayuda')).not.toBeInTheDocument()
    })

    // La capa de "tocar afuera cierra la ayuda" es `absolute` (posicionada) y pinta por
    // encima de cualquier caja estática del mismo nivel, sin importar el orden en el DOM
    // — así que Minimizar/Cerrar necesitan estar TAMBIÉN posicionados (mismo `z-30` que el
    // popover) para no quedar tapados debajo mientras la ayuda está abierta. RTL no hace
    // hit-testing real, así que esto se verifica por clase en vez de simulando el click.
    it('Minimizar/Cerrar viven en un contenedor posicionado por encima de la capa de ayuda (z-30 vs. z-20)', () => {
        render(
            <BottomSheet open onClose={() => {}} onMinimize={() => {}} onHelp={() => {}} title="X">
                <div>contenido</div>
            </BottomSheet>,
        )
        const fila = screen.getByLabelText('Cerrar').closest('div')!
        expect(fila.className).toContain('relative')
        expect(fila.className).toContain('z-30')
    })
})
