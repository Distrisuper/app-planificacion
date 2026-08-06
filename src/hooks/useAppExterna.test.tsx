import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Wallet } from 'lucide-react'
import { vi } from 'vitest'
import { useAppExterna } from './useAppExterna'
import type { AppExterna } from '@/lib/appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

function cliente(codigo: string): IVisitClientCard {
    return {
        codigoCliente: `9${codigo}`,
        codigoParticularCliente: codigo,
        nombreCliente: `CLIENTE ${codigo}`,
    }
}

/** App de prueba con el builder espiado: así se cuenta cuántas veces se ejecuta el handoff. */
function appEspia(url = vi.fn(() => 'https://ext.test/x')): AppExterna {
    return { id: 'espia', label: 'Espía', icon: Wallet, token: 'ninguno', handoff: { tipo: 'url', url } }
}

function Probe({ app }: { app: AppExterna }) {
    const { montada, visible, abrir, ocultar, desmontar } = useAppExterna()
    return (
        <div>
            <div data-testid="montada">{montada ? montada.cliente.codigoParticularCliente : ''}</div>
            <div data-testid="url">{montada?.handoff.url ?? ''}</div>
            <div data-testid="visible">{String(visible)}</div>
            <button onClick={() => abrir(app, cliente('111'))}>abrir-111</button>
            <button onClick={() => abrir(app, cliente('222'))}>abrir-222</button>
            <button onClick={ocultar}>ocultar</button>
            <button onClick={desmontar}>desmontar</button>
        </div>
    )
}

describe('useAppExterna', () => {
    it('ejecuta el handoff al abrir y expone la url resuelta', async () => {
        const url = vi.fn(() => 'https://ext.test/x')
        render(<Probe app={appEspia(url)} />)
        await userEvent.click(screen.getByText('abrir-111'))
        expect(screen.getByTestId('montada')).toHaveTextContent('111')
        expect(screen.getByTestId('url')).toHaveTextContent('https://ext.test/x')
        expect(screen.getByTestId('visible')).toHaveTextContent('true')
        expect(url).toHaveBeenCalledTimes(1)
    })

    // El bug que más caro sale: recalcular el handoff recarga el bundle de la app ajena
    // (888 KB en el caso de pagos-lupa) en cada render.
    it('NO vuelve a ejecutar el handoff al reabrir la misma app y el mismo cliente', async () => {
        const url = vi.fn(() => 'https://ext.test/x')
        render(<Probe app={appEspia(url)} />)
        await userEvent.click(screen.getByText('abrir-111'))
        await userEvent.click(screen.getByText('ocultar'))
        await userEvent.click(screen.getByText('abrir-111'))
        expect(url).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('visible')).toHaveTextContent('true')
    })

    it('vuelve a ejecutar el handoff al abrir con otro cliente', async () => {
        const url = vi.fn(() => 'https://ext.test/x')
        render(<Probe app={appEspia(url)} />)
        await userEvent.click(screen.getByText('abrir-111'))
        await userEvent.click(screen.getByText('abrir-222'))
        expect(url).toHaveBeenCalledTimes(2)
        expect(screen.getByTestId('montada')).toHaveTextContent('222')
    })

    // Ocultar ≠ desmontar: mantener la instancia viva es lo que hace instantánea la reapertura.
    it('ocultar deja la instancia montada', async () => {
        render(<Probe app={appEspia()} />)
        await userEvent.click(screen.getByText('abrir-111'))
        await userEvent.click(screen.getByText('ocultar'))
        expect(screen.getByTestId('visible')).toHaveTextContent('false')
        expect(screen.getByTestId('montada')).toHaveTextContent('111')
    })

    it('desmontar suelta la instancia', async () => {
        render(<Probe app={appEspia()} />)
        await userEvent.click(screen.getByText('abrir-111'))
        await userEvent.click(screen.getByText('desmontar'))
        expect(screen.getByTestId('visible')).toHaveTextContent('false')
        expect(screen.getByTestId('montada')).toHaveTextContent('')
    })

    it('no rompe si se oculta sin haber abierto nada', () => {
        render(<Probe app={appEspia()} />)
        act(() => {
            screen.getByText('ocultar').click()
        })
        expect(screen.getByTestId('montada')).toHaveTextContent('')
    })
})
