import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BarChart3, Wallet } from 'lucide-react'
import { vi } from 'vitest'
import AppExternaSheet from './AppExternaSheet'
import type { AppExternaMontada } from '@/hooks/useAppExterna'

const CLIENTE = {
    codigoCliente: '900123',
    codigoParticularCliente: '12345',
    nombreCliente: 'KIOSCO RUBEN SRL',
    nombreFantasia: 'Kiosco Rubén',
}

// La URL es arbitraria (el componente es genérico), pero refleja el contrato real: el
// cliente por query en la raíz y NADA de token en la URL — /auth/login?token= es
// justamente la forma que la verificación empírica del spec descartó.
const MONTADA_PAGOS: AppExternaMontada = {
    app: { id: 'pagos', label: 'Pagos', icon: Wallet, token: 'sesion', handoff: { tipo: 'url', url: () => 'https://ext.test/x' } },
    cliente: CLIENTE,
    handoff: { tipo: 'url', url: 'https://ext.test/?client=12345' },
}

const MONTADA_VERSUS: AppExternaMontada = {
    app: { id: 'versus', label: 'Versus', icon: BarChart3, token: 'ninguno', handoff: { tipo: 'url', url: () => 'https://ext2.test/x' } },
    cliente: CLIENTE,
    handoff: { tipo: 'url', url: 'https://ext2.test/?q=12345' },
}

function renderSheet(over: Partial<Parameters<typeof AppExternaSheet>[0]> = {}) {
    const onClose = vi.fn()
    const onSeleccionarApp = vi.fn()
    render(
        <AppExternaSheet
            cliente={CLIENTE}
            montadas={{ pagos: MONTADA_PAGOS }}
            appActivaId="pagos"
            visible
            onSeleccionarApp={onSeleccionarApp}
            onClose={onClose}
            {...over}
        />,
    )
    return { onClose, onSeleccionarApp }
}

describe('AppExternaSheet', () => {
    it('embebe la app activa en la url resuelta', () => {
        renderSheet()
        const iframe = screen.getByTitle('Pagos')
        expect(iframe).toHaveAttribute('src', 'https://ext.test/?client=12345')
    })

    // El vendedor tiene que saber de quién está viendo los pagos.
    it('muestra el nombre del cliente y las tabs de las apps del registro', () => {
        renderSheet()
        expect(screen.getByText('Kiosco Rubén')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Pagos' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Versus' })).toBeInTheDocument()
    })

    it('le pone name al iframe', () => {
        renderSheet()
        expect(screen.getByTitle('Pagos')).toHaveAttribute('name', 'app-externa-pagos')
    })

    it('tocar la tab de otra app llama a onSeleccionarApp con esa app', async () => {
        const { onSeleccionarApp } = renderSheet()
        await userEvent.click(screen.getByRole('button', { name: 'Versus' }))
        expect(onSeleccionarApp).toHaveBeenCalledTimes(1)
        expect(onSeleccionarApp.mock.calls[0][0]).toMatchObject({ id: 'versus' })
    })

    // El corazón del pedido: cambiar de tab no desmonta el iframe de la app anterior.
    it('cambiar a una segunda app montada mantiene viva la primera, oculta', () => {
        const { rerender } = render(
            <AppExternaSheet
                cliente={CLIENTE}
                montadas={{ pagos: MONTADA_PAGOS, versus: MONTADA_VERSUS }}
                appActivaId="pagos"
                visible
                onSeleccionarApp={vi.fn()}
                onClose={vi.fn()}
            />,
        )
        const framePagos = screen.getByTitle('Pagos')
        expect(screen.getByTitle('Versus')).toBeInTheDocument()

        rerender(
            <AppExternaSheet
                cliente={CLIENTE}
                montadas={{ pagos: MONTADA_PAGOS, versus: MONTADA_VERSUS }}
                appActivaId="versus"
                visible
                onSeleccionarApp={vi.fn()}
                onClose={vi.fn()}
            />,
        )

        // Mismo nodo: no se recreó al cambiar de tab.
        expect(screen.getByTitle('Pagos')).toBe(framePagos)
        expect(screen.getByTitle('Pagos').closest('div')?.className).toContain('invisible')
    })

    // El bundle de pagos-lupa pesa 888 KB: sin overlay parece que se colgó.
    it('muestra el overlay de carga hasta el onLoad del iframe', () => {
        renderSheet()
        expect(screen.getByTestId('app-externa-cargando')).toBeInTheDocument()
        fireEvent.load(screen.getByTitle('Pagos'))
        expect(screen.queryByTestId('app-externa-cargando')).not.toBeInTheDocument()
    })

    it('cierra con el botón de cerrar', async () => {
        const { onClose } = renderSheet()
        await userEvent.click(screen.getByLabelText('Cerrar'))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    // El botón chico del header no es el único punto de salida: "Volver" ocupa el mismo
    // lugar que "Cerrar visita" en VisitaSheet, al alcance del pulgar.
    it('cierra con el botón Volver del pie', async () => {
        const { onClose } = renderSheet()
        await userEvent.click(screen.getByRole('button', { name: 'Volver' }))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    // onError no cubre todo (un frame bloqueado por CSP "carga" a una página vacía sin
    // disparar error), pero sí cubre la falla de red/DNS real: no puede quedar en spinner.
    it('muestra el estado de error si el iframe dispara onError', () => {
        renderSheet()
        fireEvent.error(screen.getByTitle('Pagos'))
        expect(screen.queryByTestId('app-externa-cargando')).not.toBeInTheDocument()
        expect(screen.getByTestId('app-externa-error')).toBeInTheDocument()
    })

    // El caso que onError no ve: un frame bloqueado por X-Frame-Options/CSP nunca dispara
    // onLoad ni onError. Sin este timeout el spinner gira para siempre.
    it('si no llega onLoad ni onError, cae en error por timeout', () => {
        vi.useFakeTimers()
        try {
            renderSheet()
            act(() => {
                vi.advanceTimersByTime(15000)
            })
            expect(screen.getByTestId('app-externa-error')).toBeInTheDocument()
        } finally {
            vi.useRealTimers()
        }
    })

    it('el botón Recargar (header) vuelve a mostrar el overlay de carga de la app activa y cambia el src', async () => {
        renderSheet()
        fireEvent.load(screen.getByTitle('Pagos'))
        expect(screen.queryByTestId('app-externa-cargando')).not.toBeInTheDocument()

        await userEvent.click(screen.getByLabelText('Recargar'))

        expect(screen.getByTestId('app-externa-cargando')).toBeInTheDocument()
        expect(screen.getByTitle('Pagos')).toHaveAttribute(
            'src',
            'https://ext.test/?client=12345&_reintento=1',
        )
    })

    it('Reintentar desde el estado de error vuelve a cargar', async () => {
        renderSheet()
        fireEvent.error(screen.getByTitle('Pagos'))

        await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

        expect(screen.getByTestId('app-externa-cargando')).toBeInTheDocument()
        expect(screen.queryByTestId('app-externa-error')).not.toBeInTheDocument()
    })

    // Oculto pero montado: es lo que hace instantánea la reapertura. El iframe tiene que
    // seguir en el DOM y no puede interceptar taps de la agenda que está debajo.
    it('cuando no es visible sigue montado, invisible y sin capturar taps', () => {
        renderSheet({ visible: false })
        expect(screen.getByTitle('Pagos')).toBeInTheDocument()
        const contenedor = screen.getByTestId('app-externa-contenedor')
        expect(contenedor.className).toContain('invisible')
        expect(contenedor.className).toContain('pointer-events-none')
    })
})
