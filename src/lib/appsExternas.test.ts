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
})
