import { assertLocalAgentUrls } from './agentGuard'

describe('assertLocalAgentUrls', () => {
    it('no hace nada sin variables PAPERCLIP_*, aunque las URLs falten o sean remotas', () => {
        expect(() => assertLocalAgentUrls({})).not.toThrow()
        expect(() =>
            assertLocalAgentUrls({ VITE_API_URL: 'https://apidistri.distrisuper.com' }),
        ).not.toThrow()
    })

    it('rebota si es corrida de agente y falta alguna URL', () => {
        expect(() =>
            assertLocalAgentUrls({
                PAPERCLIP_RUN_ID: 'x',
                VITE_API_URL: 'http://localhost:14002/prod/vs',
            }),
        ).toThrow(/VITE_API_AUTH_URL no está definida/)
    })

    it('rebota si alguna URL no es localhost/127.0.0.1', () => {
        expect(() =>
            assertLocalAgentUrls({
                PAPERCLIP_RUN_ID: 'x',
                VITE_API_URL: 'https://apidistri.distrisuper.com',
                VITE_API_AUTH_URL: 'http://localhost:14010',
            }),
        ).toThrow(/apidistri\.distrisuper\.com/)
    })

    it('rebota con una URL mal formada', () => {
        expect(() =>
            assertLocalAgentUrls({
                PAPERCLIP_RUN_ID: 'x',
                VITE_API_URL: 'no-es-una-url',
                VITE_API_AUTH_URL: 'http://localhost:14010',
            }),
        ).toThrow(/no es una URL válida/)
    })

    it('arranca con localhost y también con 127.0.0.1', () => {
        expect(() =>
            assertLocalAgentUrls({
                PAPERCLIP_RUN_ID: 'x',
                VITE_API_URL: 'http://localhost:14002/prod/vs',
                VITE_API_AUTH_URL: 'http://127.0.0.1:14010',
            }),
        ).not.toThrow()
    })
})
