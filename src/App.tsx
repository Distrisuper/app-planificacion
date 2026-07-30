import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/context/AuthContext'
import ProtectedRoute from '@/router/ProtectedRoute'
import AgendaSemanaPage from '@/pages/AgendaSemanaPage'
import AnaliticaPage from '@/pages/AnaliticaPage'
import AnaliticaVendedorPage from '@/pages/AnaliticaVendedorPage'
import LoginPage from '@/pages/LoginPage'
import SinPermisosPage from '@/pages/SinPermisosPage'

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider>
                    <Routes>
                        <Route element={<ProtectedRoute />}>
                            <Route path="/" element={<AgendaSemanaPage />} />
                            <Route path="/analitica" element={<AnaliticaPage />} />
                            <Route
                                path="/analitica/vendedor/:codigo"
                                element={<AnaliticaVendedorPage />}
                            />
                        </Route>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/sin-permisos" element={<SinPermisosPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </AuthProvider>
            </BrowserRouter>
        </QueryClientProvider>
    )
}
