import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiAdmin from '@/api/planificacionAdmin'
import * as apiAnalitica from '@/api/analitica'
import RutaPage from './RutaPage'

vi.mock('@/api/planificacionAdmin')
vi.mock('@/api/analitica')
const authMock = vi.fn()
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => authMock(),
}))

function renderPage() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={['/analitica/ruta']}>
                <RutaPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

/** El vendedor se elige con el `Selector` del estándar: abrir la lista y tocar la opción. */
async function elegirEnSelector(nombre: string) {
    await userEvent.click(screen.getByRole('button', { name: 'Vendedor' }))
    await userEvent.click(await screen.findByRole('option', { name: nombre }))
}

/** Espera a que el roster haya cargado (la opción aparece en la lista) y la vuelve a cerrar. */
async function esperarRoster(nombre: string) {
    await userEvent.click(screen.getByRole('button', { name: 'Vendedor' }))
    await screen.findByRole('option', { name: nombre })
    await userEvent.keyboard('{Escape}')
}

beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockReturnValue({
        user: { name: 'Jefa', rol: 'admin' },
        logout: vi.fn(),
        capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true },
        vendedoresVisibles: null,
        vendedorDePrueba: null,
    })
    vi.mocked(apiAnalitica.getVendedores).mockResolvedValue([
        { codigoParticularVendedor: 'V 2', nombreVendedor: 'Juan Pérez' },
    ])
})

describe('RutaPage', () => {
    it('sin vendedor elegido no pide ninguna rotación', async () => {
        renderPage()
        await esperarRoster('Juan Pérez')
        expect(apiAdmin.getRotaciones).not.toHaveBeenCalled()
    })

    it('pide la cola del vendedor recién elegido', async () => {
        vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([])
        renderPage()
        await elegirEnSelector('Juan Pérez')

        expect(apiAdmin.getRotaciones).toHaveBeenCalledWith('V 2')
    })

    it('invita a elegir un vendedor mientras no haya ninguno', async () => {
        renderPage()
        // Regex más específico que "/elegí un vendedor/i": ese matchea también la opción
        // placeholder del <select> ("Elegí un vendedor…"), lo que da "multiple elements".
        expect(
            await screen.findByText(/elegí un vendedor para ver y editar su ruta/i),
        ).toBeInTheDocument()
    })

    it('muestra los chips de la cola y preselecciona la rotación vigente', async () => {
        vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([
            {
                id: 7,
                codigoParticularVendedor: 'V 2',
                estado: 'abierta',
                fechaInicio: '2026-08-03T12:00:00.000Z',
                fechaFin: null,
                descripcion: 'Ronda Agosto',
                orden: null,
            },
            {
                id: 30,
                codigoParticularVendedor: 'V 2',
                estado: 'programada',
                fechaInicio: null,
                fechaFin: null,
                descripcion: null,
                orden: 1,
            },
        ])
        vi.mocked(apiAdmin.getRotacion).mockResolvedValue({
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta',
            fechaInicio: '2026-08-03T12:00:00.000Z',
            fechaFin: null,
            descripcion: 'Ronda Agosto',
            orden: null,
            semanas: [],
        })

        renderPage()
        await elegirEnSelector('Juan Pérez')

        // Nombres exactos: la card activa también tiene un botón "Nombrar Ronda Agosto"
        // (DescripcionInline) y "Cancelar Programada #1" que colisionan por substring con
        // estas regexes (ver la misma nota en ColaRotaciones.test.tsx).
        expect(await screen.findByRole('button', { name: 'Ronda Agosto' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Programada #1' })).toBeInTheDocument()
    })

    it('al cancelar la rotación elegida vuelve a la vigente, sin pedir el id muerto', async () => {
        const vigente = {
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta' as const,
            fechaInicio: '2026-08-03T12:00:00.000Z',
            fechaFin: null,
            descripcion: 'Ronda Agosto',
            orden: null,
        }
        const programada = {
            id: 30,
            codigoParticularVendedor: 'V 2',
            estado: 'programada' as const,
            fechaInicio: null,
            fechaFin: null,
            descripcion: null,
            orden: 1,
        }
        // Después de cancelar, la cola ya no trae la #30: es el estado que deja el backend.
        vi.mocked(apiAdmin.getRotaciones)
            .mockResolvedValueOnce([vigente, programada])
            .mockResolvedValue([vigente])
        vi.mocked(apiAdmin.getRotacion).mockImplementation(async (_codigo, rotacionId) => ({
            ...vigente,
            id: rotacionId,
            semanas: [],
        }))
        vi.mocked(apiAdmin.cancelarRotacion).mockResolvedValue(undefined)

        renderPage()
        await elegirEnSelector('Juan Pérez')

        await userEvent.click(await screen.findByRole('button', { name: 'Programada #1' }))
        await userEvent.click(screen.getByRole('button', { name: 'Cancelar Programada #1' }))
        await userEvent.click(screen.getByRole('button', { name: 'Cancelar rotación' }))

        // El id 30 ya no existe: seguir pidiéndolo devuelve 404 y deja el grid en blanco.
        await screen.findByRole('button', { name: 'Ronda Agosto' })
        expect(apiAdmin.getRotacion).toHaveBeenLastCalledWith('V 2', 7)
    })

    it('cambiar de rotación desarma el intercambio a medio hacer', async () => {
        const vigente = {
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta' as const,
            fechaInicio: '2026-08-03T12:00:00.000Z',
            fechaFin: null,
            descripcion: 'Ronda Agosto',
            orden: null,
        }
        const programada = {
            id: 30,
            codigoParticularVendedor: 'V 2',
            estado: 'programada' as const,
            fechaInicio: null,
            fechaFin: null,
            descripcion: 'Ronda Septiembre',
            orden: 1,
        }
        vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([vigente, programada])
        const semanaVacia = { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] }
        vi.mocked(apiAdmin.getRotacion).mockImplementation(async (_codigo, rotacionId) => ({
            ...vigente,
            id: rotacionId,
            semanas: [{ semana: 1, descripcion: null, dias: semanaVacia }],
        }))

        renderPage()
        await elegirEnSelector('Juan Pérez')

        // Primero se visitan las DOS rotaciones para dejarlas en caché. Es lo que hace que
        // el bug sea alcanzable: con la rotación destino ya cacheada, React Query entrega
        // `data` en el mismo render y `GridRotacion` nunca se desmonta — sin caché hay un
        // hueco con `grid` undefined que limpia el estado por accidente y tapa el problema.
        await screen.findByRole('button', { name: 'Ronda Agosto' })
        await userEvent.click(screen.getByRole('button', { name: 'Ronda Septiembre' }))
        await screen.findByRole('button', { name: 'Intercambiar este día: semana 1, LUN' })
        await userEvent.click(screen.getByRole('button', { name: 'Ronda Agosto' }))

        // Se arma un intercambio en la rotación vigente…
        await userEvent.click(
            await screen.findByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )
        expect(
            screen.getByRole('button', { name: 'Cancelar intercambio: semana 1, LUN' }),
        ).toBeInTheDocument()

        // …y sin confirmarlo se pasa a la otra rotación, que ahora sí está cacheada.
        await userEvent.click(screen.getByRole('button', { name: 'Ronda Septiembre' }))

        // El origen viejo no puede seguir armado: tocar otra celda permutaría los clientes
        // de la rotación nueva contra una celda de la anterior, sin confirmación.
        await waitFor(() => {
            expect(
                screen.queryByRole('button', { name: /^Cancelar intercambio/ }),
            ).not.toBeInTheDocument()
        })
        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, MAR' }),
        )
        expect(apiAdmin.intercambiarDias).not.toHaveBeenCalled()
    })

    it('avisa cuando el grid de la rotación no se pudo cargar', async () => {
        vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([
            {
                id: 7,
                codigoParticularVendedor: 'V 2',
                estado: 'abierta',
                fechaInicio: '2026-08-03T12:00:00.000Z',
                fechaFin: null,
                descripcion: 'Ronda Agosto',
                orden: null,
            },
        ])
        vi.mocked(apiAdmin.getRotacion).mockRejectedValue(new Error('404'))

        renderPage()
        await elegirEnSelector('Juan Pérez')

        expect(await screen.findByText(/no se pudo cargar el plan/i)).toBeInTheDocument()
    })

    /** Cola + grid de un vendedor, con el estado de la rotación como parámetro. */
    function montarRotacion(estado: 'abierta' | 'programada' | 'cerrada') {
        const rotacion = {
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado,
            fechaInicio: estado === 'programada' ? null : '2026-09-01T12:00:00.000Z',
            fechaFin: estado === 'cerrada' ? '2026-09-05T21:00:00.000Z' : null,
            descripcion: 'Ronda Septiembre',
            orden: estado === 'programada' ? 1 : null,
        }
        vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([rotacion])
        vi.mocked(apiAdmin.getRotacion).mockResolvedValue({
            ...rotacion,
            semanas: [
                {
                    semana: 1,
                    descripcion: 'Zárate',
                    dias: { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] },
                },
            ],
        })
    }

    async function elegirVendedor() {
        renderPage()
        await elegirEnSelector('Juan Pérez')
    }

    it('ofrece agregar clientes en la rotación abierta', async () => {
        montarRotacion('abierta')
        await elegirVendedor()

        expect(
            await screen.findByLabelText('Agregar cliente: semana 1, MAR'),
        ).toBeInTheDocument()
    })

    // Armar la próxima vuelta es justamente cuando hace falta sumar un cliente nuevo, y
    // el backend nunca lo restringió (`requireRotacionEditableDe` acepta programada).
    it('ofrece agregar clientes en una rotación programada', async () => {
        montarRotacion('programada')
        await elegirVendedor()

        expect(
            await screen.findByLabelText('Agregar cliente: semana 1, MAR'),
        ).toBeInTheDocument()
    })

    it('no ofrece agregar clientes en una rotación cerrada', async () => {
        montarRotacion('cerrada')
        await elegirVendedor()

        await screen.findByText(/Semana 1/)
        expect(screen.queryByLabelText(/^Agregar cliente:/)).not.toBeInTheDocument()
    })

    it('agregar un cliente desde una celda lo manda a esa celda', async () => {
        montarRotacion('abierta')
        vi.mocked(apiAdmin.buscarEnCarteraAdmin).mockResolvedValue([
            {
                codigoParticularCliente: 'P001',
                nombreCliente: 'ALMACEN ZARATE',
                estado: 'sin_plan',
                semana: null,
                dia: null,
                descripcionZona: null,
                fecha: null,
                motivo: null,
            },
        ])
        vi.mocked(apiAdmin.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: false,
            celdas: [],
        })
        vi.mocked(apiAdmin.agregarClienteExtraAdmin).mockResolvedValue({
            rotacionClienteId: 44,
        } as never)

        await elegirVendedor()
        await userEvent.click(await screen.findByLabelText('Agregar cliente: semana 1, MAR'))
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))
        await userEvent.click(await screen.findByRole('button', { name: 'Agregar' }))

        await waitFor(() =>
            expect(apiAdmin.agregarClienteExtraAdmin).toHaveBeenCalledWith(
                'V 2',
                7,
                'P001',
                1,
                2,
            ),
        )
    })

    /** La ruta base con dos semanas: la 2 tiene a Kiosco Nueve el MAR. */
    function montarRutaBase() {
        const vacia = { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] }
        vi.mocked(apiAdmin.getRutaBase).mockResolvedValue({
            semanas: [
                { semana: 1, descripcion: 'Zárate', dias: vacia },
                {
                    semana: 2,
                    descripcion: 'Campana',
                    dias: {
                        ...vacia,
                        MAR: [{ id: 41, codigoParticularCliente: 'P009', nombreCliente: 'KIOSCO NUEVE' }],
                    },
                },
            ],
            omitidos: ['P404'],
        })
    }

    async function verRutaBase() {
        await elegirVendedor()
        await screen.findByLabelText('Agregar cliente: semana 1, MAR')
        await userEvent.click(screen.getByRole('button', { name: 'Ruta base' }))
        await screen.findByText(/Kiosco Nueve/i)
    }

    // Cambió a propósito: la ruta base era de solo lectura y ahora se edita igual que la
    // vuelta. Sigue sin la cola de rotaciones y sin editor de nombre de semana.
    it('con "Ruta base" muestra la ruta que se copia en cada vuelta, editable y sin la cola', async () => {
        montarRotacion('abierta')
        montarRutaBase()
        await elegirVendedor()
        await screen.findByLabelText('Agregar cliente: semana 1, MAR')
        expect(apiAdmin.getRutaBase).not.toHaveBeenCalled()

        await userEvent.click(screen.getByRole('button', { name: 'Ruta base' }))

        expect(await screen.findByText(/Kiosco Nueve/i)).toBeInTheDocument()
        expect(apiAdmin.getRutaBase).toHaveBeenCalledWith('V 2')
        expect(screen.getByText('Campana')).toBeInTheDocument()
        expect(screen.getByText(/1 cliente de la ruta no está en el padrón/)).toBeInTheDocument()
        expect(screen.getByText(/Lo que cambies acá aplica desde la próxima vuelta/)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Ronda Septiembre' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Nombrar semana/ })).not.toBeInTheDocument()
        expect(screen.getByLabelText('Agregar cliente: semana 2, MAR')).toBeInTheDocument()
    })

    it('en la ruta base, quitar pega al endpoint de la ruta base', async () => {
        montarRotacion('abierta')
        montarRutaBase()
        vi.mocked(apiAdmin.quitarDeRutaBase).mockResolvedValue(undefined)
        await verRutaBase()

        await userEvent.click(screen.getByRole('button', { name: 'Quitar de la ruta base: Kiosco Nueve' }))
        expect(screen.getByText('No va a estar en las próximas vueltas.')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Quitar' }))

        await waitFor(() => expect(apiAdmin.quitarDeRutaBase).toHaveBeenCalledWith('V 2', 41))
        expect(apiAdmin.quitarClienteAdmin).not.toHaveBeenCalled()
    })

    it('en la ruta base, ⇄ intercambia días de la ruta base sin preguntar el alcance', async () => {
        montarRotacion('abierta')
        montarRutaBase()
        vi.mocked(apiAdmin.intercambiarDiasRutaBase).mockResolvedValue(1)
        await verRutaBase()

        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar este día: semana 2, MAR' }))
        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar con este día: semana 1, VIE' }))

        await waitFor(() =>
            expect(apiAdmin.intercambiarDiasRutaBase).toHaveBeenCalledWith('V 2', {
                semanaA: 2,
                diaA: 2,
                semanaB: 1,
                diaB: 5,
            }),
        )
        expect(screen.queryByText('¿Dónde aplicar el cambio?')).not.toBeInTheDocument()
        expect(apiAdmin.intercambiarDias).not.toHaveBeenCalled()
    })

    it('en la ruta base, ⇅ intercambia semanas de la ruta base', async () => {
        montarRotacion('abierta')
        montarRutaBase()
        vi.mocked(apiAdmin.intercambiarSemanasRutaBase).mockResolvedValue(1)
        await verRutaBase()

        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar esta semana: semana 1' }))
        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar con esta semana: semana 2' }))

        await waitFor(() =>
            expect(apiAdmin.intercambiarSemanasRutaBase).toHaveBeenCalledWith('V 2', {
                semanaA: 1,
                semanaB: 2,
            }),
        )
    })

    it('en la ruta base, el "+" abre el buscador de la ruta base', async () => {
        montarRotacion('abierta')
        montarRutaBase()
        await verRutaBase()

        await userEvent.click(screen.getByLabelText('Agregar cliente: semana 1, LUN'))

        expect(await screen.findByText('Agregar a la ruta base')).toBeInTheDocument()
        expect(screen.getByText(/Va al LUN · Zárate \(Semana 1\)/)).toBeInTheDocument()
    })

    it('en la ruta base, un rechazo del backend se explica con su código', async () => {
        montarRotacion('abierta')
        montarRutaBase()
        vi.mocked(apiAdmin.intercambiarDiasRutaBase).mockRejectedValue({
            response: { status: 409, data: { code: 'CLIENTE_EN_AMBAS_CELDAS' } },
        })
        await verRutaBase()

        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar este día: semana 2, MAR' }))
        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar con este día: semana 1, MAR' }))

        expect(await screen.findByText(/Un cliente está en los dos días/)).toBeInTheDocument()
    })

    /** Una vuelta abierta con la semana 1 en curso y la 2 y la 3 pendientes. */
    function montarVueltaConEstados() {
        const rotacion = {
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta' as const,
            fechaInicio: '2026-09-01T12:00:00.000Z',
            fechaFin: null,
            descripcion: 'Ronda Septiembre',
            orden: null,
        }
        const vacia = { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] }
        vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([rotacion])
        vi.mocked(apiAdmin.getRotacion).mockResolvedValue({
            ...rotacion,
            semanas: [
                { semana: 1, descripcion: 'Zárate', estado: 'en_curso', fechaLunes: '2026-10-13', dias: vacia },
                { semana: 2, descripcion: 'Campana', estado: 'pendiente', fechaLunes: null, dias: vacia },
                { semana: 3, descripcion: null, estado: 'pendiente', fechaLunes: null, dias: vacia },
            ],
        })
    }

    it('la vuelta arranca con solo la semana en curso desplegada; la ruta base, toda desplegada', async () => {
        montarVueltaConEstados()
        montarRutaBase()
        await elegirVendedor()

        expect(await screen.findByRole('button', { name: 'Plegar semana 1' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Desplegar semana 2' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Desplegar semana 3' })).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Ruta base' }))
        await screen.findByText(/Kiosco Nueve/i)
        expect(screen.queryByRole('button', { name: /^Desplegar semana/ })).not.toBeInTheDocument()
    })

    it('en la vuelta, ⇄ pregunta el alcance y manda aplicarARutaBase', async () => {
        montarVueltaConEstados()
        vi.mocked(apiAdmin.intercambiarDias).mockResolvedValue(0)
        await elegirVendedor()
        // Las semanas que no están en curso arrancan plegadas: sin celdas no hay ⇄.
        await userEvent.click(await screen.findByRole('button', { name: 'Desplegar todas' }))

        await userEvent.click(await screen.findByRole('button', { name: 'Intercambiar este día: semana 2, LUN' }))
        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar con este día: semana 3, JUE' }))
        expect(apiAdmin.intercambiarDias).not.toHaveBeenCalled()
        await userEvent.click(await screen.findByRole('button', { name: 'Esta vuelta y la ruta base' }))

        await waitFor(() =>
            expect(apiAdmin.intercambiarDias).toHaveBeenCalledWith('V 2', 7, {
                semanaA: 2,
                diaA: 1,
                semanaB: 3,
                diaB: 4,
                aplicarARutaBase: true,
            }),
        )
    })

    it('en la vuelta, cancelar el diálogo de alcance no intercambia nada', async () => {
        montarVueltaConEstados()
        await elegirVendedor()
        await userEvent.click(await screen.findByRole('button', { name: 'Desplegar todas' }))

        await userEvent.click(await screen.findByRole('button', { name: 'Intercambiar este día: semana 2, LUN' }))
        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar con este día: semana 3, JUE' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))

        await waitFor(() => expect(screen.queryByText('¿Dónde aplicar el cambio?')).not.toBeInTheDocument())
        expect(apiAdmin.intercambiarDias).not.toHaveBeenCalled()
    })

    it('en la vuelta, ⇅ se ofrece solo en semanas pendientes y pregunta el alcance', async () => {
        montarVueltaConEstados()
        vi.mocked(apiAdmin.intercambiarSemanas).mockResolvedValue(0)
        await elegirVendedor()

        await screen.findByRole('button', { name: 'Intercambiar esta semana: semana 2' })
        expect(screen.queryByRole('button', { name: 'Intercambiar esta semana: semana 1' })).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar esta semana: semana 2' }))
        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar con esta semana: semana 3' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Solo esta vuelta' }))

        await waitFor(() =>
            expect(apiAdmin.intercambiarSemanas).toHaveBeenCalledWith('V 2', 7, {
                semanaA: 2,
                semanaB: 3,
                aplicarARutaBase: false,
            }),
        )
    })

    it('en la vuelta, un ⇅ rechazado se explica con su código', async () => {
        montarVueltaConEstados()
        vi.mocked(apiAdmin.intercambiarSemanas).mockRejectedValue({
            response: { status: 409, data: { code: 'SEMANA_CON_RESUELTOS' } },
        })
        await elegirVendedor()

        await userEvent.click(await screen.findByRole('button', { name: 'Intercambiar esta semana: semana 2' }))
        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar con esta semana: semana 3' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Solo esta vuelta' }))

        expect(await screen.findByText(/ya tiene clientes visitados o no visitados/)).toBeInTheDocument()
    })

    describe('reiniciar la vuelta', () => {
        const vigente = {
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta' as const,
            fechaInicio: '2026-09-01T12:00:00.000Z',
            fechaFin: null,
            descripcion: 'Ronda Septiembre',
            orden: null,
        }
        const programada = {
            id: 30,
            codigoParticularVendedor: 'V 2',
            estado: 'programada' as const,
            fechaInicio: null,
            fechaFin: null,
            descripcion: 'Ronda Octubre',
            orden: 1,
        }
        const nueva = { ...vigente, id: 31, descripcion: 'Ronda Nueva' }

        function montarCola() {
            vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([vigente, programada])
            vi.mocked(apiAdmin.getRotacion).mockImplementation(async (_codigo, rotacionId) => ({
                ...vigente,
                id: rotacionId,
                semanas: [
                    { semana: 1, descripcion: 'Zárate', dias: { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] } },
                ],
            }))
        }

        async function confirmarReinicio() {
            await userEvent.click(await screen.findByRole('button', { name: 'Reiniciar vuelta' }))
            await userEvent.click(
                within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reiniciar vuelta' }),
            )
        }

        it('pide confirmación, reinicia y deja elegida la vuelta nueva', async () => {
            montarCola()
            vi.mocked(apiAdmin.reiniciarRotacion).mockImplementation(async () => {
                // Lo que deja el backend: la vieja cerrada (fuera de la cola) y la nueva abierta.
                vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([nueva, programada])
                return { rotacionId: 31, cerrada: 7, sinVisitar: [] }
            })
            await elegirVendedor()
            // Se mira la programada: al reiniciar, la elegida tiene que pasar a la nueva.
            await userEvent.click(await screen.findByRole('button', { name: 'Ronda Octubre' }))
            await waitFor(() => expect(apiAdmin.getRotacion).toHaveBeenCalledWith('V 2', 30))

            await userEvent.click(screen.getByRole('button', { name: 'Reiniciar vuelta' }))
            const dialogo = await screen.findByRole('alertdialog')
            expect(within(dialogo).getByText('¿Reiniciar la vuelta de Juan Pérez?')).toBeInTheDocument()
            expect(within(dialogo).getByText(/empieza una nueva copiada de la ruta base/)).toBeInTheDocument()
            expect(apiAdmin.reiniciarRotacion).not.toHaveBeenCalled()
            await userEvent.click(within(dialogo).getByRole('button', { name: 'Reiniciar vuelta' }))

            await waitFor(() => expect(apiAdmin.reiniciarRotacion).toHaveBeenCalledWith('V 2'))
            await waitFor(() => expect(apiAdmin.getRotacion).toHaveBeenCalledWith('V 2', 31))
            // El chip activo es el que lleva el anillo.
            expect((await screen.findByRole('button', { name: 'Ronda Nueva' })).parentElement).toHaveClass(
                'ring-primario',
            )
        })

        it('con una visita en curso explica a quién está visitando', async () => {
            montarCola()
            vi.mocked(apiAdmin.reiniciarRotacion).mockRejectedValue({
                response: {
                    status: 409,
                    data: {
                        code: 'VISITA_EN_CURSO',
                        codigoParticularCliente: 'P001',
                        nombreCliente: 'ALMACEN ZARATE',
                    },
                },
            })
            await elegirVendedor()
            await confirmarReinicio()

            expect(
                await screen.findByText(
                    'Juan Pérez está visitando a Almacen Zarate. Probá de nuevo cuando cierre la visita.',
                ),
            ).toBeInTheDocument()
        })

        it('sin ruta base explica que no se puede armar una vuelta', async () => {
            montarCola()
            vi.mocked(apiAdmin.reiniciarRotacion).mockRejectedValue({
                response: { status: 422, data: { code: 'ROTACION_SIN_CLIENTES' } },
            })
            await elegirVendedor()
            await confirmarReinicio()

            expect(
                await screen.findByText(
                    'Este vendedor no tiene ruta base cargada: no se puede armar una vuelta.',
                ),
            ).toBeInTheDocument()
        })

        it('cualquier otro error pide probar de nuevo', async () => {
            montarCola()
            vi.mocked(apiAdmin.reiniciarRotacion).mockRejectedValue(new Error('500'))
            await elegirVendedor()
            await confirmarReinicio()

            expect(
                await screen.findByText('No se pudo reiniciar la vuelta. Probá de nuevo.'),
            ).toBeInTheDocument()
        })

        it('no se ofrece en la vista Ruta base', async () => {
            montarCola()
            montarRutaBase()
            await elegirVendedor()
            await screen.findByRole('button', { name: 'Reiniciar vuelta' })

            await userEvent.click(screen.getByRole('button', { name: 'Ruta base' }))
            await screen.findByText(/Kiosco Nueve/i)
            expect(screen.queryByRole('button', { name: 'Reiniciar vuelta' })).not.toBeInTheDocument()
        })

        it('no se ofrece con el vendedor de prueba (tiene su propio "Reiniciar")', async () => {
            authMock.mockReturnValue({
                user: { name: 'Ana' }, logout: vi.fn(),
                capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true },
                vendedoresVisibles: null,
                vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: 'Cartera de V 2', origenesDisponibles: [] },
            })
            montarCola()
            renderPage()
            await elegirEnSelector('Mi vendedor de prueba')

            await screen.findByRole('button', { name: 'Ronda Septiembre' })
            expect(apiAdmin.getRotaciones).toHaveBeenCalledWith('PRUEBA-42')
            expect(screen.queryByRole('button', { name: 'Reiniciar vuelta' })).not.toBeInTheDocument()
        })
    })

    it('el selector suma "Mi vendedor de prueba" al final, y acota el roster a vendedoresVisibles', async () => {
        authMock.mockReturnValue({
            user: { name: 'Ana' }, logout: vi.fn(),
            capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true },
            vendedoresVisibles: ['V 2'],
            vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: 'Cartera de V 2', origenesDisponibles: [] },
        })
        vi.mocked(apiAnalitica.getVendedores).mockResolvedValue([
            { codigoParticularVendedor: 'V 2', nombreVendedor: 'ROSSI' },
            { codigoParticularVendedor: 'NACHO', nombreVendedor: 'NACHO' },
        ])
        renderPage()
        await userEvent.click(screen.getByRole('button', { name: 'Vendedor' }))
        // Los nombres van con formato de nombre, no en las MAYÚSCULAS del backend.
        await screen.findByRole('option', { name: 'Rossi' })
        const opciones = screen.getAllByRole('option').map(o => o.textContent)
        expect(opciones).toContain('Rossi')
        expect(opciones).not.toContain('Nacho')
        expect(opciones[opciones.length - 1]).toBe('Mi vendedor de prueba')
    })
})
