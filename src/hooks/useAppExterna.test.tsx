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
function appEspia(id = 'espia', url = vi.fn(() => 'https://ext.test/x')): AppExterna {
    return { id, label: 'Espía', icon: Wallet, token: 'ninguno', handoff: { tipo: 'url', url } }
}

function Probe({ app, appB }: { app: AppExterna; appB?: AppExterna }) {
    const { clienteActivo, montadas, appActivaId, visible, abrir, ocultar, desmontar } = useAppExterna()
    return (
        <div>
            <div data-testid="cliente">{clienteActivo?.codigoParticularCliente ?? ''}</div>
            <div data-testid="apps">{Object.keys(montadas).sort().join(',')}</div>
            <div data-testid="activa">{appActivaId ?? ''}</div>
            <div data-testid="url">{appActivaId ? montadas[appActivaId]?.handoff.url ?? '' : ''}</div>
            <div data-testid="visible">{String(visible)}</div>
            <button onClick={() => abrir(app, cliente('111'))}>abrir-111</button>
            <button onClick={() => abrir(app, cliente('222'))}>abrir-222</button>
            {appB && <button onClick={() => abrir(appB, cliente('111'))}>abrir-B-111</button>}
            <button onClick={ocultar}>ocultar</button>
            <button onClick={desmontar}>desmontar</button>
        </div>
    )
}

describe('useAppExterna', () => {
    it('ejecuta el handoff al abrir y expone la url resuelta', async () => {
        const url = vi.fn(() => 'https://ext.test/x')
        render(<Probe app={appEspia('espia', url)} />)
        await userEvent.click(screen.getByText('abrir-111'))
        expect(screen.getByTestId('cliente')).toHaveTextContent('111')
        expect(screen.getByTestId('apps')).toHaveTextContent('espia')
        expect(screen.getByTestId('activa')).toHaveTextContent('espia')
        expect(screen.getByTestId('url')).toHaveTextContent('https://ext.test/x')
        expect(screen.getByTestId('visible')).toHaveTextContent('true')
        expect(url).toHaveBeenCalledTimes(1)
    })

    // El bug que más caro sale: recalcular el handoff recarga el bundle de la app ajena
    // (888 KB en el caso de pagos-lupa) en cada render.
    it('NO vuelve a ejecutar el handoff al reabrir la misma app y el mismo cliente', async () => {
        const url = vi.fn(() => 'https://ext.test/x')
        render(<Probe app={appEspia('espia', url)} />)
        await userEvent.click(screen.getByText('abrir-111'))
        await userEvent.click(screen.getByText('ocultar'))
        await userEvent.click(screen.getByText('abrir-111'))
        expect(url).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('visible')).toHaveTextContent('true')
    })

    it('vuelve a ejecutar el handoff al abrir con otro cliente, y descarta las montadas anteriores', async () => {
        const url = vi.fn(() => 'https://ext.test/x')
        render(<Probe app={appEspia('espia', url)} appB={appEspia('espia-b')} />)
        await userEvent.click(screen.getByText('abrir-111'))
        await userEvent.click(screen.getByText('abrir-B-111')) // segunda app viva para el mismo cliente
        expect(screen.getByTestId('apps')).toHaveTextContent('espia,espia-b')

        await userEvent.click(screen.getByText('abrir-222'))

        expect(url).toHaveBeenCalledTimes(2)
        expect(screen.getByTestId('cliente')).toHaveTextContent('222')
        // Cambiar de cliente descarta TODO lo anterior, no solo la app que se tocó.
        expect(screen.getByTestId('apps')).toHaveTextContent('espia')
    })

    // El comportamiento nuevo: dos apps distintas para el mismo cliente conviven.
    it('abrir una segunda app para el mismo cliente conserva ambas instancias', async () => {
        const urlA = vi.fn(() => 'https://ext.test/a')
        const urlB = vi.fn(() => 'https://ext.test/b')
        render(<Probe app={appEspia('espia', urlA)} appB={appEspia('espia-b', urlB)} />)

        await userEvent.click(screen.getByText('abrir-111'))
        await userEvent.click(screen.getByText('abrir-B-111'))

        expect(screen.getByTestId('apps')).toHaveTextContent('espia,espia-b')
        expect(screen.getByTestId('activa')).toHaveTextContent('espia-b')
        expect(urlA).toHaveBeenCalledTimes(1)
        expect(urlB).toHaveBeenCalledTimes(1)

        // Volver a la primera no le vuelve a pegar al handoff.
        await userEvent.click(screen.getByText('abrir-111'))
        expect(urlA).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('activa')).toHaveTextContent('espia')
    })

    // Ocultar ≠ desmontar: mantener la instancia viva es lo que hace instantánea la reapertura.
    it('ocultar deja la instancia montada', async () => {
        render(<Probe app={appEspia()} />)
        await userEvent.click(screen.getByText('abrir-111'))
        await userEvent.click(screen.getByText('ocultar'))
        expect(screen.getByTestId('visible')).toHaveTextContent('false')
        expect(screen.getByTestId('apps')).toHaveTextContent('espia')
    })

    it('desmontar suelta todas las instancias', async () => {
        render(<Probe app={appEspia('espia')} appB={appEspia('espia-b')} />)
        await userEvent.click(screen.getByText('abrir-111'))
        await userEvent.click(screen.getByText('abrir-B-111'))
        await userEvent.click(screen.getByText('desmontar'))
        expect(screen.getByTestId('visible')).toHaveTextContent('false')
        expect(screen.getByTestId('apps')).toHaveTextContent('')
        expect(screen.getByTestId('cliente')).toHaveTextContent('')
        expect(screen.getByTestId('activa')).toHaveTextContent('')
    })

    it('no rompe si se oculta sin haber abierto nada', () => {
        render(<Probe app={appEspia()} />)
        act(() => {
            screen.getByText('ocultar').click()
        })
        expect(screen.getByTestId('apps')).toHaveTextContent('')
    })

    // La PWA en segundo plano (`document.hidden`), no el sheet oculto por `ocultar()`: son
    // ejes distintos. Ver spec "Liberación de memoria en segundo plano".
    describe('desmontaje por segundo plano prolongado', () => {
        const descriptorOriginal = Object.getOwnPropertyDescriptor(document, 'hidden')

        function pasarASegundoPlano() {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
            document.dispatchEvent(new Event('visibilitychange'))
        }

        function volverAlFrente() {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
            document.dispatchEvent(new Event('visibilitychange'))
        }

        beforeEach(() => {
            vi.useFakeTimers()
        })

        afterEach(() => {
            vi.useRealTimers()
            if (descriptorOriginal) Object.defineProperty(document, 'hidden', descriptorOriginal)
        })

        it('una hora entera en segundo plano desmonta todo', async () => {
            render(<Probe app={appEspia()} />)
            await act(async () => {
                screen.getByText('abrir-111').click()
            })

            act(() => {
                pasarASegundoPlano()
                vi.advanceTimersByTime(60 * 60 * 1000)
            })

            expect(screen.getByTestId('apps')).toHaveTextContent('')
            expect(screen.getByTestId('visible')).toHaveTextContent('false')
        })

        it('volver antes de la hora cancela el desmontaje', async () => {
            render(<Probe app={appEspia()} />)
            await act(async () => {
                screen.getByText('abrir-111').click()
            })

            act(() => {
                pasarASegundoPlano()
                vi.advanceTimersByTime(59 * 60 * 1000)
                volverAlFrente()
                vi.advanceTimersByTime(60 * 60 * 1000) // si no se canceló, acá dispararía
            })

            expect(screen.getByTestId('apps')).toHaveTextContent('espia')
        })

        it('sin nada montado, pasar a segundo plano no rompe', () => {
            render(<Probe app={appEspia()} />)
            act(() => {
                pasarASegundoPlano()
                vi.advanceTimersByTime(60 * 60 * 1000)
            })
            expect(screen.getByTestId('apps')).toHaveTextContent('')
        })
    })
})
