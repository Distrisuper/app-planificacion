import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiClient } from './apiClient'
import {
    buscarEnCarteraAdmin,
    cancelarRotacion,
    consultarClienteAdmin,
    crearRotacion,
    editarDescripcionRotacion,
    editarDescripcionSemana,
    getRotacion,
    getRotaciones,
    getRutaBase,
    intercambiarDias,
    reacomodarAdmin,
    reordenarRotacion,
    reiniciarRotacion,
    agregarClienteExtraAdmin,
    agregarARutaBase,
    buscarEnRutaBase,
    intercambiarDiasRutaBase,
    intercambiarSemanas,
    intercambiarSemanasRutaBase,
    moverEnRutaBase,
    quitarDeRutaBase,
} from './planificacionAdmin'

vi.mock('./apiClient', () => ({
    apiClient: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}))

beforeEach(() => vi.clearAllMocks())

describe('getRotaciones', () => {
    it('desenvuelve data.data y URL-encodea el código del vendedor', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({
            data: { ok: 1, data: [{ id: 7, estado: 'abierta' }] },
        } as never)

        const cola = await getRotaciones('V 2')

        // El espacio del código tiene que viajar encodeado o el path se rompe.
        expect(apiClient.get).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones',
        )
        expect(cola).toEqual([{ id: 7, estado: 'abierta' }])
    })
})

describe('getRotacion', () => {
    it('pide el grid de una rotación puntual', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({
            data: { ok: 1, data: { id: 7, semanas: [] } },
        } as never)

        const grid = await getRotacion('V 2', 7)

        expect(apiClient.get).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7',
        )
        expect(grid).toEqual({ id: 7, semanas: [] })
    })
})

describe('getRutaBase', () => {
    it('pide la ruta base del vendedor con el código encodeado', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({
            data: { ok: 1, data: { semanas: [], omitidos: [] } },
        } as never)

        const ruta = await getRutaBase('V 2')

        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/vendedores/V%202/ruta-base')
        expect(ruta).toEqual({ semanas: [], omitidos: [] })
    })
})

describe('crearRotacion', () => {
    it('devuelve el rotacionId de la programada nueva', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({
            data: { ok: 1, data: { rotacionId: 30 } },
        } as never)

        await expect(crearRotacion('V 2')).resolves.toBe(30)
        expect(apiClient.post).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones',
        )
    })
})

describe('reiniciarRotacion', () => {
    it('postea al endpoint de reinicio con el código encodeado y devuelve la vuelta nueva', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({
            data: { ok: 1, data: { rotacionId: 31, cerrada: 7, sinVisitar: ['P001'] } },
        } as never)

        await expect(reiniciarRotacion('V 2')).resolves.toEqual({
            rotacionId: 31,
            cerrada: 7,
            sinVisitar: ['P001'],
        })
        expect(apiClient.post).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/reiniciar',
        )
    })
})

describe('reacomodarAdmin', () => {
    it('manda semana y dia al endpoint de la fila', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } } as never)

        await reacomodarAdmin('V 2', 7, 11, { semana: 3, dia: 4 })

        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/rotacion-cliente/11/reacomodar',
            { semana: 3, dia: 4 },
        )
    })

    it('sin semana manda solo el dia', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } } as never)

        await reacomodarAdmin('V 2', 7, 11, { dia: 2 })

        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/rotacion-cliente/11/reacomodar',
            { dia: 2 },
        )
    })
})

describe('reordenarRotacion', () => {
    it('manda la posición nueva', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } } as never)

        await reordenarRotacion('V 2', 32, 1)

        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/32/orden',
            { orden: 1 },
        )
    })
})

describe('cancelarRotacion', () => {
    it('pega al DELETE de la rotación', async () => {
        vi.mocked(apiClient.delete).mockResolvedValue({ data: { ok: 1 } } as never)

        await cancelarRotacion('V 2', 30)

        expect(apiClient.delete).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/30',
        )
    })
})

describe('descripciones', () => {
    it('la de la rotación va al PATCH de la rotación', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } } as never)

        await editarDescripcionRotacion('V 2', 7, 'Ronda Agosto')

        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7',
            { descripcion: 'Ronda Agosto' },
        )
    })

    it('la de la semana va al PATCH de la semana', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } } as never)

        await editarDescripcionSemana('V 2', 7, 2, 'Buenos Aires')

        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/semanas/2',
            { descripcion: 'Buenos Aires' },
        )
    })

    it('un nombre vacío se manda como null para borrarlo', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } } as never)

        await editarDescripcionSemana('V 2', 7, 2, null)

        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/semanas/2',
            { descripcion: null },
        )
    })
})

describe('intercambiarDias', () => {
    it('manda las dos celdas y devuelve cuántas filas movió', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({
            data: { ok: 1, data: { movidas: 18 } },
        } as never)

        const movidas = await intercambiarDias('V 2', 7, {
            semanaA: 1,
            diaA: 2,
            semanaB: 1,
            diaB: 4,
        })

        expect(apiClient.post).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/intercambiar-dias',
            { semanaA: 1, diaA: 2, semanaB: 1, diaB: 4 },
        )
        expect(movidas).toBe(18)
    })
})

describe('buscarEnCarteraAdmin', () => {
    it('busca en la cartera del vendedor dentro de una rotación', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({
            data: { ok: 1, data: [{ codigoParticularCliente: 'P001', estado: 'sin_plan' }] },
        } as never)

        const r = await buscarEnCarteraAdmin('V 2', 7, 'alma')

        expect(apiClient.get).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/buscador',
            { params: { q: 'alma' } },
        )
        expect(r[0].codigoParticularCliente).toBe('P001')
    })
})

describe('consultarClienteAdmin', () => {
    it('encodea el código del cliente y desenvuelve la consulta', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({
            data: { ok: 1, data: { yaPlanificado: false, celdas: [] } },
        } as never)

        const r = await consultarClienteAdmin('V 2', 7, 'P 001')

        expect(apiClient.get).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/buscador/cliente/P%20001',
        )
        expect(r).toEqual({ yaPlanificado: false, celdas: [] })
    })
})

describe('agregarClienteExtraAdmin', () => {
    it('manda la celda destino en el body y devuelve la fila creada', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({
            data: { ok: 1, data: { rotacionClienteId: 44, esExtra: true } },
        } as never)

        const card = await agregarClienteExtraAdmin('V 2', 7, 'P001', 2, 3)

        expect(apiClient.post).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/buscador/cliente/P001/extra',
            { semana: 2, dia: 3 },
        )
        expect(card.rotacionClienteId).toBe(44)
    })
})

describe('reacomodarAdmin con alcance', () => {
    it('manda aplicarARutaBase y devuelve qué pasó en la ruta base', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({
            data: { ok: 1, data: { rutaBase: 'no_estaba' } },
        } as never)

        const r = await reacomodarAdmin('V 2', 7, 11, { semana: 3, dia: 4, aplicarARutaBase: true })

        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/rotacion-cliente/11/reacomodar',
            { semana: 3, dia: 4, aplicarARutaBase: true },
        )
        expect(r).toEqual({ rutaBase: 'no_estaba' })
    })
})

describe('intercambiarSemanas (vuelta)', () => {
    it('manda las dos semanas y el alcance, y devuelve cuántas filas movió', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({
            data: { ok: 1, data: { movidas: 9, rutaBase: 'aplicado' } },
        } as never)

        const movidas = await intercambiarSemanas('V 2', 7, {
            semanaA: 2,
            semanaB: 4,
            aplicarARutaBase: true,
        })

        expect(apiClient.post).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/intercambiar-semanas',
            { semanaA: 2, semanaB: 4, aplicarARutaBase: true },
        )
        expect(movidas).toBe(9)
    })
})

describe('ruta base', () => {
    const BASE = '/planificacion/vendedores/V%202/ruta-base'

    it('mover pega al PATCH de la fila con semana y día', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1, data: null } } as never)

        await moverEnRutaBase('V 2', 41, { semana: 2, dia: 3 })

        expect(apiClient.patch).toHaveBeenCalledWith(`${BASE}/41`, { semana: 2, dia: 3 })
    })

    it('quitar pega al DELETE de la fila', async () => {
        vi.mocked(apiClient.delete).mockResolvedValue({ data: { ok: 1, data: null } } as never)

        await quitarDeRutaBase('V 2', 41)

        expect(apiClient.delete).toHaveBeenCalledWith(`${BASE}/41`)
    })

    it('el buscador manda el texto como q y desenvuelve los resultados', async () => {
        const resultados = [{ codigoParticularCliente: 'P1', nombreCliente: 'UNO', celdas: [] }]
        vi.mocked(apiClient.get).mockResolvedValue({ data: { ok: 1, data: resultados } } as never)

        await expect(buscarEnRutaBase('V 2', 'uno')).resolves.toEqual(resultados)
        expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/buscador`, { params: { q: 'uno' } })
    })

    it('agregar manda cliente y celda, y devuelve la fila creada', async () => {
        const fila = { id: 50, codigoParticularCliente: 'P1', nombreCliente: 'UNO', semana: 1, dia: 2 }
        vi.mocked(apiClient.post).mockResolvedValue({ data: { ok: 1, data: fila } } as never)

        await expect(
            agregarARutaBase('V 2', { codigoCliente: 'P1', semana: 1, dia: 2 }),
        ).resolves.toEqual(fila)
        expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/clientes`, {
            codigoCliente: 'P1',
            semana: 1,
            dia: 2,
        })
    })

    it('intercambiar días manda las dos celdas y devuelve cuántas filas movió', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({ data: { ok: 1, data: { movidas: 5 } } } as never)

        await expect(
            intercambiarDiasRutaBase('V 2', { semanaA: 1, diaA: 1, semanaB: 2, diaB: 3 }),
        ).resolves.toBe(5)
        expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/intercambiar-dias`, {
            semanaA: 1,
            diaA: 1,
            semanaB: 2,
            diaB: 3,
        })
    })

    it('intercambiar semanas manda las dos semanas y devuelve cuántas filas movió', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({ data: { ok: 1, data: { movidas: 12 } } } as never)

        await expect(intercambiarSemanasRutaBase('V 2', { semanaA: 1, semanaB: 3 })).resolves.toBe(12)
        expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/intercambiar-semanas`, {
            semanaA: 1,
            semanaB: 3,
        })
    })
})
