import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import ProtectedRoute from '@/router/ProtectedRoute'
import { puedeOperarComoVendedor, supervisa } from '@/lib/roles'
import AgendaSemanaPage from '@/pages/AgendaSemanaPage'
import AnaliticaActividadPage from '@/pages/AnaliticaActividadPage'
import AnaliticaAltasPage from '@/pages/AnaliticaAltasPage'
import AnaliticaPage from '@/pages/AnaliticaPage'
import AnaliticaVendedorPage from '@/pages/AnaliticaVendedorPage'
import LoginPage from '@/pages/LoginPage'
import AnaliticaFichasPage from '@/pages/AnaliticaFichasPage'
import RutaPage from '@/pages/RutaPage'
import SinPermisosPage from '@/pages/SinPermisosPage'

/** Cualquier ruta no reconocida manda al usuario a la pantalla de su propio rol,
 *  no siempre a "/" — un rol analítico no arranca en la agenda del vendedor. */
function RutaPorDefecto() {
    const { rutaInicial } = useAuth()
    return <Navigate to={rutaInicial ?? '/'} replace />
}

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider>
                    <Routes>
                        <Route element={<ProtectedRoute permitir={puedeOperarComoVendedor} />}>
                            <Route path="/" element={<AgendaSemanaPage />} />
                        </Route>
                        <Route element={<ProtectedRoute permitir={supervisa} />}>
                            <Route path="/analitica" element={<AnaliticaPage />} />
                            <Route
                                path="/analitica/actividad"
                                element={<AnaliticaActividadPage />}
                            />
                            <Route
                                path="/analitica/vendedor/:codigo"
                                element={<AnaliticaVendedorPage />}
                            />
                            <Route path="/analitica/ruta" element={<RutaPage />} />
                            <Route path="/analitica/altas" element={<AnaliticaAltasPage />} />
                            <Route path="/analitica/fichas" element={<AnaliticaFichasPage />} />
                        </Route>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/sin-permisos" element={<SinPermisosPage />} />
                        <Route path="*" element={<RutaPorDefecto />} />
                    </Routes>
                </AuthProvider>
            </BrowserRouter>
        </QueryClientProvider>
    )
}
