import type { CategoriaCliente, IAgendaClient } from '@/types/planificacion'

const CATEGORIAS: CategoriaCliente[] = [
    'Almacén', 'Kiosco', 'Autoservicio', 'Supermercado', 'Despensa', 'Minimercado', 'Fiambrería', 'Panadería',
]
const CALLES = [
    'Av. San Martín', 'Belgrano', 'Rivadavia', 'Bv. Mitre', 'Sarmiento',
    'Av. Colón', '9 de Julio', 'Vélez Sarsfield', 'Duarte Quirós', 'La Rioja',
]
const HORAS = ['08:30', '09:15', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00']
const NOTAS = [
    'Pide que pase después de las 10, cierra al mediodía.',
    'Reclamó la última entrega incompleta, revisar.',
    'Paga con cheque a 30 días.',
]

function hashCode(s: string): number {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return Math.abs(h)
}

function formatPhone(h: number): string {
    const digits = String(6000000 + (h % 3900000))
    return `(0351) 15-${digits.slice(0, 3)}-${digits.slice(3)}`
}

/**
 * The agenda backend doesn't expose category/address/phone/time/note yet.
 * Fills them in deterministically (stable per client code, not random on
 * every render) so the card design can exist ahead of the real data.
 * Delete once the backend adds these fields — see IAgendaClient.
 */
export function withMockVisualData(cliente: IAgendaClient): IAgendaClient {
    const h = hashCode(cliente.codigoParticularCliente)
    return {
        ...cliente,
        categoria: cliente.categoria ?? CATEGORIAS[h % CATEGORIAS.length],
        direccion: cliente.direccion ?? `${CALLES[h % CALLES.length]} ${100 + (h % 1800)}`,
        telefono: cliente.telefono ?? formatPhone(h),
        horaVisita: cliente.horaVisita ?? HORAS[h % HORAS.length],
        nota: cliente.nota ?? (h % 5 === 0 ? NOTAS[h % NOTAS.length] : undefined),
    }
}
