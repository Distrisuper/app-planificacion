import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { BuscadorDiaSheet } from './BuscadorDiaSheet'
import { useConfirmarExtra, useConsultarBuscador, useBuscarEnCartera } from '@/hooks/useBuscador'
import { useReacomodar } from '@/hooks/useCiclo'

vi.mock('@/hooks/useBuscador')
vi.mock('@/hooks/useCiclo')

beforeEach(() => {
    vi.mocked(useBuscarEnCartera).mockReturnValue({ data: [], buscando: false } as any)
    vi.mocked(useConsultarBuscador).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any)
    vi.mocked(useConfirmarExtra).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any)
    vi.mocked(useReacomodar).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any)
})

it('ofrece "Cliente nuevo" debajo de la búsqueda cuando el llamador lo pasa', () => {
    const onClienteNuevo = vi.fn()
    render(<BuscadorDiaSheet open onClose={() => {}} semana={2} dia={3} onExtraCreada={() => {}} onNavegarAExistente={() => {}} onTraido={() => {}} onAviso={() => {}} onClienteNuevo={onClienteNuevo} />)
    fireEvent.click(screen.getByRole('button', { name: /cliente nuevo/i }))
    expect(onClienteNuevo).toHaveBeenCalled()
})

it('sin onClienteNuevo no muestra el botón', () => {
    render(<BuscadorDiaSheet open onClose={() => {}} semana={2} dia={3} onExtraCreada={() => {}} onNavegarAExistente={() => {}} onTraido={() => {}} onAviso={() => {}} />)
    expect(screen.queryByRole('button', { name: /cliente nuevo/i })).not.toBeInTheDocument()
})
