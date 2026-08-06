import { vi } from 'vitest'
import {
    APPS_EXTERNAS,
    resolverHandoff,
    resolverToken,
    type AppExterna,
} from './appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

const CLIENTE: IVisitClientCard = {
    codigoCliente: '900123',
    codigoParticularCliente: '05519',
    nombreCliente: 'AMATUCCI CARLOS',
}

function appDePagos(): AppExterna {
    const app = APPS_EXTERNAS.find(a => a.id === 'pagos')
    if (!app) throw new Error('la app "pagos" tiene que estar registrada')
    return app
}

function appDeVersus(): AppExterna {
    const app = APPS_EXTERNAS.find(a => a.id === 'versus')
    if (!app) throw new Error('la app "versus" tiene que estar registrada')
    return app
}

describe('appsExternas', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('registra pagos-lupa sin credencial en el handoff', () => {
        const app = appDePagos()
        expect(app.label).toBe('Pagos')
        // Camino A: la sesión la crea el vendedor una vez dentro del iframe. No se puede
        // escribir en el localStorage de otro origen.
        expect(app.token).toBe('ninguno')
        expect(app.handoff.tipo).toBe('url')
    })

    // Sin la variable de entorno la base queda vacía y la URL saldría relativa: el iframe la
    // resolvería contra nuestro propio origen y embebería app-planificacion dentro de
    // app-planificacion, con el onLoad disparando normal. La app no se ofrece y la falta se
    // grita por consola al cargar el módulo, antes de que el vendedor toque nada.
    it('no ofrece una app cuya URL base falta en el entorno', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.stubEnv('VITE_PAGOS_LUPA_URL', '')
        vi.resetModules()
        try {
            const { APPS_EXTERNAS: sinConfigurar } = await import('./appsExternas')
            expect(sinConfigurar.find(a => a.id === 'pagos')).toBeUndefined()
            expect(error).toHaveBeenCalledWith(expect.stringContaining('"pagos"'))
        } finally {
            vi.unstubAllEnvs()
            vi.resetModules()
            error.mockRestore()
        }
    })

    // Una base sin esquema ("pagos-lupa.web.app" en vez de "https://pagos-lupa.web.app")
    // pasa el filtro de "no vacía" pero sigue produciendo una URL relativa: mismo
    // auto-embebido que la base ausente, solo que con un typo de deploy distinto.
    it('no ofrece una app cuya URL base no tiene esquema http/https', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.stubEnv('VITE_PAGOS_LUPA_URL', 'pagos-lupa.web.app')
        vi.resetModules()
        try {
            const { APPS_EXTERNAS: baseInvalida } = await import('./appsExternas')
            expect(baseInvalida.find(a => a.id === 'pagos')).toBeUndefined()
            expect(error).toHaveBeenCalledWith(expect.stringContaining('"pagos"'))
        } finally {
            vi.unstubAllEnvs()
            vi.resetModules()
            error.mockRestore()
        }
    })

    it('ofrece la app cuando la URL base es absoluta con esquema https', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.stubEnv('VITE_PAGOS_LUPA_URL', 'https://pagos-lupa.web.app')
        vi.resetModules()
        try {
            const { APPS_EXTERNAS: baseValida } = await import('./appsExternas')
            expect(baseValida.find(a => a.id === 'pagos')).toBeDefined()
            expect(error).not.toHaveBeenCalled()
        } finally {
            vi.unstubAllEnvs()
            vi.resetModules()
            error.mockRestore()
        }
    })

    it('arma la URL de handoff con el client en la raíz', () => {
        const resuelto = resolverHandoff(appDePagos(), CLIENTE)
        expect(resuelto.tipo).toBe('url')
        const url = new URL(resuelto.url)
        expect(url.pathname).toBe('/')
        expect(url.searchParams.get('client')).toBe('05519')
    })

    // pagos-lupa carga Microsoft Clarity (grabador de sesión): un token en la query string
    // quedaría grabado. El camino A no lo necesita, y así se cierra el riesgo 4 del spec.
    it('no filtra el token en la URL', () => {
        localStorage.setItem('access_token', 'tok-123')
        const { url } = resolverHandoff(appDePagos(), CLIENTE)
        expect(url).not.toContain('tok-123')
        expect(new URL(url).searchParams.has('token')).toBe(false)
    })

    // type_operation se omite a propósito (ver Global Constraints del plan).
    it('no manda type_operation', () => {
        const { url } = resolverHandoff(appDePagos(), CLIENTE)
        expect(new URL(url).searchParams.has('type_operation')).toBe(false)
    })

    // El seam que mantiene vivo el camino B y las apps futuras: de dónde sale la credencial
    // es un campo declarado por app, no un supuesto del código.
    it("resolverToken lee el access_token cuando la app declara 'sesion'", () => {
        localStorage.setItem('access_token', 'tok-123')
        const app: AppExterna = { ...appDePagos(), token: 'sesion' }
        expect(resolverToken(app)).toBe('tok-123')
    })

    it("resolverToken devuelve null cuando la app declara 'ninguno'", () => {
        localStorage.setItem('access_token', 'tok-123')
        expect(resolverToken(appDePagos())).toBeNull()
    })

    // El código sale de la API. Si alguna vez trajera un caracter reservado, concatenar a
    // mano rompería el param.
    it('escapa el código de cliente en vez de concatenarlo crudo', () => {
        const raro: IVisitClientCard = { ...CLIENTE, codigoParticularCliente: 'a&b=c' }
        const { url } = resolverHandoff(appDePagos(), raro)
        expect(new URL(url).searchParams.get('client')).toBe('a&b=c')
    })

    it('registra versus sin credencial en el handoff', () => {
        const app = appDeVersus()
        expect(app.label).toBe('Versus')
        // Versus podría recibir el token por ?token=, pero se decidió no mandarlo por Clarity.
        expect(app.token).toBe('ninguno')
        expect(app.handoff.tipo).toBe('url')
    })

    it('arma la URL de handoff de versus con q en /v2/rubro/clientes', () => {
        const { url } = resolverHandoff(appDeVersus(), CLIENTE)
        const parsed = new URL(url)
        expect(parsed.pathname).toBe('/v2/rubro/clientes')
        expect(parsed.searchParams.get('q')).toBe('05519')
    })

    // Mismo riesgo que pagos-lupa: versus-v2 carga Microsoft Clarity, así que un token en la
    // query quedaría grabado. token: 'ninguno' asegura que resolverToken no lo aporte.
    it('no filtra el token en la URL de versus', () => {
        localStorage.setItem('access_token', 'tok-123')
        const { url } = resolverHandoff(appDeVersus(), CLIENTE)
        expect(url).not.toContain('tok-123')
        expect(new URL(url).searchParams.has('token')).toBe(false)
    })

    it('escapa el código de cliente en el handoff de versus', () => {
        const raro: IVisitClientCard = { ...CLIENTE, codigoParticularCliente: 'a&b=c' }
        const { url } = resolverHandoff(appDeVersus(), raro)
        expect(new URL(url).searchParams.get('q')).toBe('a&b=c')
    })
})
