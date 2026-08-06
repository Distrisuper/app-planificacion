import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Wallet } from 'lucide-react'
import { vi } from 'vitest'
import AppExternaSheet from './AppExternaSheet'
import type { AppExternaMontada } from '@/hooks/useAppExterna'

const MONTADA: AppExternaMontada = {
    app: {
        id: 'pagos',
        label: 'Pagos',
        icon: Wallet,
        token: 'sesion',
        handoff: { tipo: 'url', url: () => 'https://ext.test/x' },
    },
    cliente: {
        codigoCliente: '900123',
        codigoParticularCliente: '12345',
        nombreCliente: 'KIOSCO RUBEN SRL',
        nombreFantasia: 'Kiosco Rubén',
    },
    // La URL es arbitraria (el componente es genérico), pero refleja el contrato real: el
    // cliente por query en la raíz y NADA de token en la URL — /auth/login?token= es
    // justamente la forma que la verificación empírica del spec descartó.
    handoff: { tipo: 'url', url: 'https://ext.test/?client=12345' },
}

function renderSheet(over: Partial<Parameters<typeof AppExternaSheet>[0]> = {}) {
    const onClose = vi.fn()
    render(<AppExternaSheet montada={MONTADA} visible onClose={onClose} {...over} />)
    return { onClose }
}

describe('AppExternaSheet', () => {
    it('embebe la app externa en la url resuelta', () => {
        renderSheet()
        const iframe = screen.getByTitle('Pagos')
        expect(iframe).toHaveAttribute('src', 'https://ext.test/?client=12345')
    })

    // El vendedor tiene que saber de quién está viendo los pagos.
    it('muestra el nombre del cliente y la app en el header', () => {
        renderSheet()
        expect(screen.getByText('Kiosco Rubén')).toBeInTheDocument()
        expect(screen.getByText('Pagos')).toBeInTheDocument()
    })

    // Gancho para la variante de handoff 'form' (POST al iframe por su name). Va desde v1
    // porque agregarlo después obliga a tocar el contenedor.
    it('le pone name al iframe', () => {
        renderSheet()
        expect(screen.getByTitle('Pagos')).toHaveAttribute('name', 'app-externa-pagos')
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
