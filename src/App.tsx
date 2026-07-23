import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { queryClient } from '@/lib/queryClient'
import ProtectedRoute from '@/router/ProtectedRoute'
import AgendaSemanaPage from '@/pages/AgendaSemanaPage'
import AgendaDiaPage from '@/pages/AgendaDiaPage'

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <Routes>
                    <Route element={<ProtectedRoute />}>
                        <Route path="/" element={<AgendaSemanaPage />} />
                        <Route path="/dia/:dia" element={<AgendaDiaPage />} />
                    </Route>
                    <Route
                        path="/sin-acceso"
                        element={
                            <div className="min-h-full grid place-items-center p-6 text-center text-dsmuted">
                                Ingresá desde Versus para acceder a tu agenda.
                            </div>
                        }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </QueryClientProvider>
    )
}
