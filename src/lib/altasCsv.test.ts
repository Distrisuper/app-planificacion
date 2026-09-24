import { describe, expect, it } from 'vitest'
import { filasCsvAltas, nombreArchivoAltas } from './altasCsv'
import type { IAltaRelevada } from '@/types/analitica'
import type { IEsquemaAlta } from '@/types/planificacion'

const ESQUEMA: IEsquemaAlta = {
    secciones: [{ clave: 'identidad', titulo: 'Identidad' }, { clave: 'comercial', titulo: 'Comercial' }],
    campos: [
        { clave: 'nombre', etiqueta: 'Nombre del comercio', seccion: 'identidad', tipo: 'texto', max: 120, requerido: true },
        { clave: 'condicionIva', etiqueta: 'Condición de IVA', seccion: 'comercial', tipo: 'catalogo', catalogo: 'iva' },
    ],
    catalogos: { iva: [{ codigo: 'RI', descripcion: 'Responsable Inscripto', orden: 10, activo: true }] },
}

const alta = (over: Partial<IAltaRelevada> = {}): IAltaRelevada => ({
    rotacionClienteId: 9, vendedor: { codigo: 'V 2', nombre: 'Gómez' }, estado: 'visitada', fechaVisita: '2026-09-21',
    detalle: { nombre: 'Piche', condicionIva: 'RI' }, contacto: { contacto: 'Gustavo', fechaNacimiento: '1978-03-14' },
    camposCargados: 2, camposTotal: 2, ...over,
})

describe('filasCsvAltas', () => {
    it('encabezado = etiquetas del esquema + columnas fijas; catálogo como descripción', () => {
        const filas = filasCsvAltas(ESQUEMA, [alta()])
        expect(filas[0]).toEqual(['Nombre del comercio', 'Condición de IVA', 'Vendedor', 'Estado', 'Fecha', 'Contacto de la visita', 'Cumpleaños del contacto', 'Datos cargados', 'Código Flexxus'])
        expect(filas[1]).toEqual(['Piche', 'Responsable Inscripto', 'Gómez', 'Visitada', '2026-09-21', 'Gustavo', '1978-03-14', '2/2', null])
    })
    it('detalle null y contacto null salen vacíos, y el vendedor sin nombre cae al código', () => {
        const [, fila] = filasCsvAltas(ESQUEMA, [alta({ detalle: null, contacto: null, vendedor: { codigo: 'V 9', nombre: '' }, estado: 'pendiente', fechaVisita: null, camposCargados: 0 })])
        expect(fila).toEqual([null, null, 'V 9', 'Pendiente', null, null, null, '0/2', null])
    })
})

describe('nombreArchivoAltas', () => {
    it('altas-YYYY-MM-DD.csv', () => {
        expect(nombreArchivoAltas(new Date(2026, 8, 21))).toBe('altas-2026-09-21.csv')
    })
})
