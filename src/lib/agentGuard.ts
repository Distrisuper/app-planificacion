const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1'])

/** Corta `npm run dev`/`build` si esta corrida es de un agente (hay alguna var
 *  `PAPERCLIP_*`) y VITE_API_URL o VITE_API_AUTH_URL no apuntan a localhost. Sin eso,
 *  un agente con un .env mal copiado puede terminar pegándole a producción. Fuera de
 *  una corrida de agente no cambia nada: en dev normal esas variables pueden faltar
 *  (apiClient/authApi caen a baseURL '') o apuntar a cualquier host. */
export function assertLocalAgentUrls(env: Record<string, string | undefined>): void {
    const esCorridaDeAgente = Object.keys(env).some(clave => clave.startsWith('PAPERCLIP_'))
    if (!esCorridaDeAgente) return

    const problemas: string[] = []
    for (const clave of ['VITE_API_URL', 'VITE_API_AUTH_URL'] as const) {
        const valor = env[clave]
        if (!valor) {
            problemas.push(`${clave} no está definida`)
            continue
        }
        let hostname: string
        try {
            hostname = new URL(valor).hostname
        } catch {
            problemas.push(`${clave}="${valor}" no es una URL válida`)
            continue
        }
        if (!HOSTS_LOCALES.has(hostname)) {
            problemas.push(`${clave}="${valor}" apunta a "${hostname}", no a localhost/127.0.0.1`)
        }
    }

    if (problemas.length > 0) {
        throw new Error(
            'Guardia de entorno de agente: se detectaron variables PAPERCLIP_*, así que ' +
                'VITE_API_URL y VITE_API_AUTH_URL tienen que apuntar a localhost/127.0.0.1 ' +
                '(esta corrida nunca debe salir a producción):\n' +
                problemas.map(p => `  - ${p}`).join('\n'),
        )
    }
}
