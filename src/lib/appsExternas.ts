import { BarChart3, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { IVisitClientCard } from '@/types/planificacion'

// Ausente = '' a propósito: el registro de más abajo trata la base vacía como "esta app no
// está configurada en este deploy" y no la ofrece.
const PAGOS_LUPA_URL: string = import.meta.env.VITE_PAGOS_LUPA_URL || ''
const VERSUS_URL: string = import.meta.env.VITE_VERSUS_URL || ''

/** De dónde sale la credencial que se le pasa a la app externa. 'sesion' = el
 *  access_token de esta app. Es el caso normal (las apps propias comparten el login),
 *  pero no es universal: por eso es un campo declarado y no un supuesto del código. */
export type EstrategiaToken = 'sesion' | 'ninguno'

export interface AppExternaContext {
    cliente: IVisitClientCard
    /** null si la app declara token: 'ninguno'. */
    token: string | null
}

/** CÓMO se le entrega el contexto. Union discriminada a propósito: resolverHandoff hace
 *  un switch exhaustivo, así que sumar una variante ('form' por POST al name del iframe,
 *  'postMessage' post-carga) es aditivo y el compilador marca dónde. Un header HTTP custom
 *  NO es una variante posible: no existe API para setear headers en una navegación de
 *  documento. Ver el spec. */
export type Handoff = {
    tipo: 'url'
    url: (ctx: AppExternaContext) => string
}

export interface AppExterna {
    id: string
    label: string
    icon: LucideIcon
    token: EstrategiaToken
    handoff: Handoff
}

export type HandoffResuelto = { tipo: 'url'; url: string }

/** Una app declarada + el origen ajeno del que sale su URL de handoff. La base se separa
 *  de `app` porque es lo único que depende del entorno, y es lo que se valida al armar el
 *  registro (ver APPS_EXTERNAS). */
interface AppExternaDeclarada {
    baseUrl: string
    app: AppExterna
}

const DECLARADAS: AppExternaDeclarada[] = [
    {
        baseUrl: PAGOS_LUPA_URL,
        app: {
            id: 'pagos',
            label: 'Pagos',
            icon: Wallet,
            // Camino A: no se manda credencial. El vendedor se loguea una vez dentro del iframe y
            // pagos-lupa se queda con su propia sesión en el storage particionado de ese par
            // (nuestra app, pagos-lupa). Ver "Verificación empírica" del spec.
            token: 'ninguno',
            handoff: {
                tipo: 'url',
                // Contrato verificado contra el deploy: ListPendings lee `client` de la query y,
                // si el rol es VENDEDOR, carga ese cliente. NO se usa /auth/login?token=, que
                // valida contra decode-token y rechaza nuestro token. type_operation se omite.
                url: ({ cliente }) => {
                    const params = new URLSearchParams({
                        client: cliente.codigoParticularCliente,
                    })
                    return `${PAGOS_LUPA_URL}/?${params}`
                },
            },
        },
    },
    {
        baseUrl: VERSUS_URL,
        app: {
            id: 'versus',
            label: 'Versus',
            icon: BarChart3,
            // Versus SÍ puede recibir el token por `?token=` (lo lee y lo valida contra
            // apidistri.distrisuper.com/api/auth/me, nuestro mismo emisor) — pero versus-v2
            // carga Microsoft Clarity (grabador de sesión) y el tag de Clarity corre antes de
            // que la app limpie el token de la URL. El token de vendedor tiene exp a ~3 meses:
            // mandarlo grabaría una credencial de acceso completo en la sesión de Clarity. Por
            // eso 'ninguno': la sesión la crea el vendedor logueándose una vez dentro del
            // iframe, igual que con pagos-lupa. No "optimizar" esto metiendo el token de nuevo.
            token: 'ninguno',
            handoff: {
                tipo: 'url',
                // Contrato verificado contra el repo de Versus: RubroV2Page.tsx:192 inicializa
                // el filtro con searchParams.get('q') (no `client`, no `cliente`) y :344 lo
                // re-sincroniza en navegación same-route.
                url: ({ cliente }) => {
                    const params = new URLSearchParams({
                        q: cliente.codigoParticularCliente,
                    })
                    return `${VERSUS_URL}/v2/rubro/clientes?${params}`
                },
            },
        },
    },
]

/** true si `base` es una URL absoluta con esquema http/https. Una base sin esquema
 *  (p. ej. "pagos-lupa.web.app") también reintroduce la URL relativa: `new URL` la rechaza
 *  (no tiene de dónde resolver un origen), así que cae en el catch. El chequeo de protocolo
 *  aparte hace falta porque `new URL('mailto:x')` sí parsea, pero ese esquema no sirve como
 *  base de un iframe. */
function esBaseAbsolutaHttp(base: string): boolean {
    try {
        const url = new URL(base)
        return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
        return false
    }
}

/**
 * Solo las apps que este deploy tiene configuradas correctamente. Una app sin URL base, o
 * con una base que no es una URL absoluta http/https, NO se ofrece.
 *
 * Por qué: con la variable de entorno ausente la base queda en '' y la URL de handoff sale
 * RELATIVA ('/?client=10034'). Lo mismo pasa con una base sin esquema ("pagos-lupa.web.app"
 * en vez de "https://pagos-lupa.web.app"): sigue sin ser absoluta, así que el resultado
 * ('pagos-lupa.web.app/?client=10034') también es relativo. En ambos casos el iframe la
 * resuelve contra NUESTRO origen y embebe app-planificacion dentro de app-planificacion a
 * pantalla completa; el `onLoad` dispara normal, así que el overlay se va y no hay ningún
 * error visible: el vendedor ve la agenda donde esperaba los pagos. Un éxito engañoso es
 * peor que una falla.
 *
 * Se filtra acá en vez de tirar en resolverHandoff porque la falta/invalidez de la
 * configuración es del deploy, no del tap: el vendedor en campo no puede resolverla, y un
 * botón que existe y explota al tocarlo (o que abre nuestra propia agenda) le hace perder
 * tiempo en cada cliente — que el botón no esté es la degradación entendible. Para quien
 * deploya la falla igual es ruidosa y temprana: el console.error sale al evaluar el módulo,
 * antes del primer render, sin depender de que alguien toque nada.
 */
export const APPS_EXTERNAS: AppExterna[] = DECLARADAS.filter(({ baseUrl, app }) => {
    if (!baseUrl) {
        console.error(
            `[appsExternas] la app "${app.id}" no se ofrece: falta su URL base en el entorno. ` +
                'Revisá las variables VITE_*_URL del deploy.',
        )
        return false
    }
    if (!esBaseAbsolutaHttp(baseUrl)) {
        console.error(
            `[appsExternas] la app "${app.id}" no se ofrece: su URL base ("${baseUrl}") no es ` +
                'una URL absoluta http/https. Revisá las variables VITE_*_URL del deploy ' +
                '(falta el esquema, p. ej. "https://").',
        )
        return false
    }
    return true
}).map(({ app }) => app)

/** Misma fuente de verdad que el interceptor de apiClient. AuthContext no expone el token. */
export function resolverToken(app: AppExterna): string | null {
    return app.token === 'sesion' ? localStorage.getItem('access_token') : null
}

/** Se invoca UNA vez por apertura (ver useAppExterna): re-ejecutarlo en cada render
 *  recargaría el bundle de la app ajena. */
export function resolverHandoff(app: AppExterna, cliente: IVisitClientCard): HandoffResuelto {
    const ctx: AppExternaContext = { cliente, token: resolverToken(app) }
    switch (app.handoff.tipo) {
        case 'url':
            return { tipo: 'url', url: app.handoff.url(ctx) }
        default: {
            // Se estrecha el discriminante (app.handoff.tipo), no el objeto: Handoff todavía
            // tiene un solo miembro, así que no es una unión y TypeScript no puede angostar
            // app.handoff a never. tipo sí es 'url' hoy, así que acá se angosta a never y
            // compila. Al sumar una variante a Handoff, tipo pasa a ser una unión más grande,
            // esta asignación deja de compilar y marca exactamente el lugar donde falta la rama.
            const tipoNoManejado: never = app.handoff.tipo
            throw new Error(`Handoff no soportado: ${tipoNoManejado}`)
        }
    }
}
