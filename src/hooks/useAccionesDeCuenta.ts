import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/** Es una acción de menú, no un botón protagonista: probar no es el trabajo diario de
 *  gerencia. Si nunca reinició, la agenda le pide la cartera al entrar. */
export function useAccionesDeCuenta() {
    const { capacidades } = useAuth()
    const navigate = useNavigate()
    return capacidades?.operaComoVendedorDePrueba
        ? [{ label: 'Probar la app del vendedor', onClick: () => navigate('/') }]
        : undefined
}
