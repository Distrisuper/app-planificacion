import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import ClienteNuevoSheet from './ClienteNuevoSheet'
import * as api from '@/api/planificacion'
vi.mock('@/api/planificacion')

const qc = new QueryClient()
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
const creado = { rotacionClienteId: 9, tipo: 'alta', nombreCliente: 'Piche' } as any

it('crear: el nombre es obligatorio y el resto opcional', async () => {
    const onListo = vi.fn()
    vi.mocked(api.crearAlta).mockResolvedValue(creado)
    wrap(<ClienteNuevoSheet open contexto={{ modo: 'crear', semana: 2, dia: 3 }} onClose={() => {}} onListo={onListo} onAviso={() => {}} />)
    const boton = screen.getByRole('button', { name: /agregar al miércoles/i })
    expect(boton).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/nombre del comercio/i), { target: { value: '  Autopartes Piche ' } })
    fireEvent.click(boton)
    await waitFor(() => expect(api.crearAlta).toHaveBeenCalledWith({ semana: 2, dia: 3, nombre: 'Autopartes Piche', razonSocial: undefined, direccion: undefined }))
    expect(onListo).toHaveBeenCalledWith(creado, { modo: 'crear', semana: 2, dia: 3 })
})

it('crear: se puede cambiar el día con los chips', async () => {
    vi.mocked(api.crearAlta).mockResolvedValue(creado)
    wrap(<ClienteNuevoSheet open contexto={{ modo: 'crear', semana: 2, dia: 3 }} onClose={() => {}} onListo={() => {}} onAviso={() => {}} />)
    fireEvent.change(screen.getByLabelText(/nombre del comercio/i), { target: { value: 'Piche' } })
    fireEvent.click(screen.getByRole('button', { name: /^viernes$/i }))
    fireEvent.click(screen.getByRole('button', { name: /agregar al viernes/i }))
    await waitFor(() => expect(api.crearAlta).toHaveBeenCalledWith(expect.objectContaining({ dia: 5 })))
})

it('crear: cambiar el día actualiza el eyebrow, no solo el botón', async () => {
    // Finding #4 de la revisión final: el eyebrow se armaba con `contexto.dia` (el día en
    // que se abrió el sheet) mientras el botón ya usaba el state `dia` — pasar de
    // miércoles a viernes dejaba el header diciendo "Agregar al miércoles" con el botón
    // diciendo "Agregar al viernes".
    wrap(<ClienteNuevoSheet open contexto={{ modo: 'crear', semana: 2, dia: 3 }} onClose={() => {}} onListo={() => {}} onAviso={() => {}} />)
    // Al abrir, eyebrow y botón coinciden (los dos parten de miércoles).
    expect(screen.getAllByText(/agregar al miércoles/i).length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: /^viernes$/i }))
    // Después de cambiar el día, ninguno se queda en miércoles y los dos pasan a viernes.
    expect(screen.queryByText(/agregar al miércoles/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/agregar al viernes/i).length).toBe(2)
})

it('reintentar: no edita datos, solo elige el día', async () => {
    vi.mocked(api.reintentarAlta).mockResolvedValue(creado)
    wrap(<ClienteNuevoSheet open contexto={{ modo: 'reintentar', cliente: creado, diaSugerido: 4 }} onClose={() => {}} onListo={() => {}} onAviso={() => {}} />)
    expect(screen.queryByLabelText(/nombre del comercio/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /volver a agendar el jueves/i }))
    await waitFor(() => expect(api.reintentarAlta).toHaveBeenCalledWith(9, 4))
})

it('error de red → onAviso error y el sheet sigue abierto', async () => {
    const onAviso = vi.fn(); const onClose = vi.fn()
    vi.mocked(api.crearAlta).mockRejectedValue(new Error('x'))
    wrap(<ClienteNuevoSheet open contexto={{ modo: 'crear', semana: 2, dia: 3 }} onClose={onClose} onListo={() => {}} onAviso={onAviso} />)
    fireEvent.change(screen.getByLabelText(/nombre del comercio/i), { target: { value: 'Piche' } })
    fireEvent.click(screen.getByRole('button', { name: /agregar al miércoles/i }))
    await waitFor(() => expect(onAviso).toHaveBeenCalledWith('error', expect.stringMatching(/no se pudo/i)))
    expect(onClose).not.toHaveBeenCalled()
})
