import { Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { IVisitClientCard } from '@/types/planificacion'

const PAGOS_LUPA_URL: string = import.meta.env.VITE_PAGOS_LUPA_URL || ''

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

export const APPS_EXTERNAS: AppExterna[] = [
    {
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
]

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
