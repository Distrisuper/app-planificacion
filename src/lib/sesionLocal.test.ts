import { queryClient } from '@/lib/queryClient'
import { adoptarTokenDeUrl, cerrarSesionLocal, limpiarStorageSesion } from './sesionLocal'

function sembrarSesion() {
    localStorage.setItem('access_token', 'tok-A')
    localStorage.setItem('visita-en-curso', JSON.stringify({ visitaId: 7 }))
    localStorage.setItem('visita-borrador-7', '{}')
    localStorage.setItem('visita-detalles-7', '{}')
    localStorage.setItem('visita-observaciones-7', 'texto')
    localStorage.setItem('visita-marcas-7', '{}')
    localStorage.setItem('visita-inicio-7', '123')
    // Algo que NO es de la sesión: tiene que sobrevivir.
    localStorage.setItem('otra-cosa', 'queda')
}

beforeEach(() => {
    localStorage.clear()
    queryClient.clear()
})

describe('limpiarStorageSesion', () => {
    it('borra el token, el puntero de visita en curso y todo lo de visitas; deja lo demás', () => {
        sembrarSesion()
        limpiarStorageSesion()
        expect(localStorage.getItem('access_token')).toBeNull()
        expect(localStorage.getItem('visita-en-curso')).toBeNull()
        expect(localStorage.getItem('visita-borrador-7')).toBeNull()
        expect(localStorage.getItem('visita-detalles-7')).toBeNull()
        expect(localStorage.getItem('visita-observaciones-7')).toBeNull()
        expect(localStorage.getItem('visita-marcas-7')).toBeNull()
        expect(localStorage.getItem('visita-inicio-7')).toBeNull()
        expect(localStorage.getItem('otra-cosa')).toBe('queda')
    })

    it('borra todas las claves de visita aunque sean muchas (no saltea al iterar)', () => {
        for (let i = 0; i < 20; i++) localStorage.setItem(`visita-inicio-${i}`, '1')
        limpiarStorageSesion()
        expect(localStorage.length).toBe(0)
    })
})

describe('cerrarSesionLocal', () => {
    it('además del storage, vacía la caché de React Query (la agenda del anterior no se reusa)', () => {
        sembrarSesion()
        queryClient.setQueryData(['agenda', 'semana'], { lunes: [{ codigo: 'CLIENTE-DE-A' }] })
        queryClient.setQueryData(['ciclo', 'actual'], { id: 1 })
        cerrarSesionLocal()
        expect(queryClient.getQueryData(['agenda', 'semana'])).toBeUndefined()
        expect(queryClient.getQueryData(['ciclo', 'actual'])).toBeUndefined()
        expect(localStorage.getItem('visita-en-curso')).toBeNull()
    })
})

describe('adoptarTokenDeUrl', () => {
    it('con un token distinto al guardado, limpia lo de la sesión anterior antes de guardarlo', () => {
        sembrarSesion()
        adoptarTokenDeUrl('tok-B')
        expect(localStorage.getItem('access_token')).toBe('tok-B')
        expect(localStorage.getItem('visita-en-curso')).toBeNull()
        expect(localStorage.getItem('visita-borrador-7')).toBeNull()
    })

    it('con el mismo token (recargar el link), no toca nada', () => {
        sembrarSesion()
        adoptarTokenDeUrl('tok-A')
        expect(localStorage.getItem('access_token')).toBe('tok-A')
        expect(localStorage.getItem('visita-en-curso')).not.toBeNull()
        expect(localStorage.getItem('visita-borrador-7')).toBe('{}')
    })

    it('sin sesión previa, solo guarda el token', () => {
        adoptarTokenDeUrl('tok-B')
        expect(localStorage.getItem('access_token')).toBe('tok-B')
    })
})
