import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import RelevamientoSheet from './RelevamientoSheet'
import * as api from '@/api/planificacion'
import type { IAgendaClient, IEsquemaAlta } from '@/types/planificacion'

vi.mock('@/api/planificacion')

const ESQUEMA: IEsquemaAlta = {
    secciones: [
        { clave: 'identidad', titulo: 'Identidad' },
        { clave: 'comercial', titulo: 'Comercial' },
        { clave: 'notas', titulo: 'Notas' },
    ],
    campos: [
        { clave: 'nombre', etiqueta: 'Nombre del comercio', seccion: 'identidad', tipo: 'texto', max: 120, requerido: true, obligatorio: true },
        { clave: 'cuit', etiqueta: 'CUIT', seccion: 'identidad', tipo: 'cuit', max: 13, obligatorio: true },
        { clave: 'condicionIva', etiqueta: 'Condición de IVA', seccion: 'comercial', tipo: 'catalogo', catalogo: 'iva', obligatorio: true },
        { clave: 'datoDeColor', etiqueta: 'Dato de color', seccion: 'notas', tipo: 'textoLargo', max: 300 },
    ],
    catalogos: { iva: [{ codigo: 'RI', descripcion: 'Responsable Inscripto', orden: 10, activo: true }] },
}

const cliente = (over: Partial<IAgendaClient> = {}): IAgendaClient => ({
    codigoCliente: 'ALTA-000009', codigoParticularCliente: 'ALTA-000009', nombreCliente: 'Autopartes Piche',
    rotacionClienteId: 9, dia: 3, estado: 'pendiente', visitaId: null, ofrecimientosPendientes: 0,
    observaciones: null, seguimiento: { estado: 'no_corresponde', motivo: null, mensaje: null },
    esExtra: true, tipo: 'alta',
    detalleAlta: { nombre: 'Autopartes Piche', razonSocial: null, direccion: null, cuit: '30-1' },
    ...over,
} as IAgendaClient)

function wrap(ui: ReactElement) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getEsquemaAlta).mockResolvedValue(ESQUEMA)
    vi.mocked(api.editarAlta).mockResolvedValue(cliente())
})

it('dibuja las secciones y campos del esquema, precargados desde detalleAlta, y cuenta los obligatorios que faltan', async () => {
    wrap(<RelevamientoSheet open cliente={cliente()} onClose={() => {}} onGuardado={() => {}} />)
    expect(await screen.findByText('Identidad')).toBeInTheDocument()
    expect(screen.getByText('Comercial')).toBeInTheDocument()
    expect(screen.getByText('Notas')).toBeInTheDocument()
    expect(screen.getByLabelText(/nombre del comercio/i)).toHaveValue('Autopartes Piche')
    expect(screen.getByLabelText(/cuit/i)).toHaveValue('30-1')
    expect(screen.getByLabelText(/condición de iva/i)).toHaveValue('')
    expect(screen.getByText(/falta 1 obligatorio/i)).toBeInTheDocument()
    // "(opcional)" sólo en lo que no es obligatorio.
    expect(screen.getByText('CUIT')).toBeInTheDocument()
    expect(screen.getByText('Dato de color (opcional)')).toBeInTheDocument()
    expect(screen.getByText('Datos del comercio')).toBeInTheDocument()
})

it('guarda SOLO el diff y avisa', async () => {
    const onGuardado = vi.fn(); const onClose = vi.fn()
    wrap(<RelevamientoSheet open cliente={cliente()} onClose={onClose} onGuardado={onGuardado} />)
    fireEvent.change(await screen.findByLabelText(/condición de iva/i), { target: { value: 'RI' } })
    expect(screen.getByText(/datos completos/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/dato de color/i), { target: { value: ' le gusta el fútbol ' } })
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    await waitFor(() => expect(api.editarAlta).toHaveBeenCalledWith(9, { condicionIva: 'RI', datoDeColor: 'le gusta el fútbol' }))
    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
})

it('sin cambios manda {} (no-op), nunca el nombre', async () => {
    wrap(<RelevamientoSheet open cliente={cliente({ detalleAlta: null })} onClose={() => {}} onGuardado={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /^guardar$/i }))
    await waitFor(() => expect(api.editarAlta).toHaveBeenCalledWith(9, {}))
})

it('nombre vacío deshabilita Guardar', async () => {
    wrap(<RelevamientoSheet open cliente={cliente()} onClose={() => {}} onGuardado={() => {}} />)
    fireEvent.change(await screen.findByLabelText(/nombre del comercio/i), { target: { value: '  ' } })
    expect(screen.getByRole('button', { name: /^guardar$/i })).toBeDisabled()
})

it('catálogos null: el select queda deshabilitado y el resto sigue operativo', async () => {
    vi.mocked(api.getEsquemaAlta).mockResolvedValue({ ...ESQUEMA, catalogos: null })
    wrap(<RelevamientoSheet open cliente={cliente()} onClose={() => {}} onGuardado={() => {}} />)
    const select = await screen.findByLabelText(/condición de iva/i)
    expect(select).toBeDisabled()
    expect(screen.getByText(/lista no disponible/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/cuit/i), { target: { value: '30-2' } })
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    await waitFor(() => expect(api.editarAlta).toHaveBeenCalledWith(9, { cuit: '30-2' }))
})

it('un valor guardado que no está activo se sigue mostrando en el select', async () => {
    wrap(<RelevamientoSheet open cliente={cliente({ detalleAlta: { nombre: 'Piche', condicionIva: 'NR' } })} onClose={() => {}} onGuardado={() => {}} />)
    const select = await screen.findByLabelText(/condición de iva/i)
    expect(select).toHaveValue('NR')
    expect(screen.getByRole('option', { name: 'NR' })).toBeInTheDocument()
})

it('esquema fallado: muestra el error con "Volver a intentar" y sin botón Guardar', async () => {
    vi.mocked(api.getEsquemaAlta).mockRejectedValue(new Error('500'))
    wrap(<RelevamientoSheet open cliente={cliente()} onClose={() => {}} onGuardado={() => {}} />)
    expect(await screen.findByRole('button', { name: /volver a intentar/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^guardar$/i })).not.toBeInTheDocument()
})

it('error de red al guardar → aviso adentro del sheet, que sigue abierto con lo tipeado', async () => {
    vi.mocked(api.editarAlta).mockRejectedValue(new Error('Network Error'))
    const onClose = vi.fn()
    wrap(<RelevamientoSheet open cliente={cliente()} onClose={onClose} onGuardado={() => {}} />)
    fireEvent.change(await screen.findByLabelText(/cuit/i), { target: { value: '30-9' } })
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/revisá la conexión/i)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/cuit/i)).toHaveValue('30-9')
})

it('dato rechazado por la API → muestra SU mensaje, y editar un campo lo limpia', async () => {
    vi.mocked(api.editarAlta).mockRejectedValue({
        response: { status: 400, data: { ok: 0, error: 'El email no tiene un formato válido.', code: 'ALTA_EMAIL_INVALIDO' } },
    })
    wrap(<RelevamientoSheet open cliente={cliente()} onClose={() => {}} onGuardado={() => {}} />)
    fireEvent.change(await screen.findByLabelText(/cuit/i), { target: { value: '30-9' } })
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El email no tiene un formato válido.')
    fireEvent.change(screen.getByLabelText(/cuit/i), { target: { value: '30-8' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
