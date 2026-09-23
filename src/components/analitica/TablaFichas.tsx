import type { ReactNode } from 'react'
import { fechaHoraNegocio } from '@/lib/fechas'
import { CAMPO_ESPECIALIDAD, CAMPO_MARCA, ESPECIALIDAD_CON_DETALLE } from '@/lib/relevamientos'
import type { IFichaCampoDef } from '@/types/planificacion'
import type { IFichaRelevadaFila } from '@/types/analitica'

/** Todo en una línea: lo que no entra se corta con "…" y el texto completo va en el `title`.
 *  El corte va en un bloque ADENTRO de la celda: un `max-width` sobre el `<td>` mismo no lo
 *  respetan los navegadores con el layout automático de tabla. */
function Linea({ ancho, title, children }: { ancho?: string; title?: string; children: ReactNode }) {
    return (
        <div className={`truncate ${ancho ?? ''}`} title={title}>
            {children}
        </div>
    )
}

interface TablaFichasProps {
    fichas: IFichaRelevadaFila[]
    /** El catálogo: de acá salen los labels. Sin él no se dibuja la tabla (ver la página). */
    catalogo: IFichaCampoDef[]
}

/**
 * Lo que se cargó de "Datos del comercio", una fila por cliente.
 *
 * **Los labels salen del catálogo, no de una constante de este archivo.** `pl_ficha_valor`
 * guarda el código (`'3'`, `'ford'`) y el texto vive en `pl_ficha_campo.opciones`, que es lo
 * mismo que lee el formulario del vendedor. Repetir las listas acá volvería a partir el dato
 * en dos lugares, que es justo lo que el spec del catálogo vino a cerrar.
 */
export default function TablaFichas({ fichas, catalogo }: TablaFichasProps) {
    // campo → (código → label). Una vez, no por celda.
    const labels = new Map<string, Map<string, string>>(
        catalogo.map(c => [c.campo, new Map((c.opciones ?? []).map(o => [o.codigo, o.label]))]),
    )
    /** Un valor que no matchea ningún código es el texto que cargó la opción abierta
     *  ("Otros"): se muestra tal cual, sin decoración. Es el mismo criterio con el que el
     *  formulario lo relee. */
    const label = (campo: string, codigo: string) => labels.get(campo)?.get(codigo) ?? codigo

    const columnas = catalogo
        .filter(c => c.campo !== CAMPO_MARCA)
        .sort((a, b) => a.orden - b.orden)

    /** La especialidad arrastra la marca entre paréntesis: `monomarca_marca` no se entiende
     *  suelto, y por eso no tiene columna propia. */
    function celda(f: IFichaRelevadaFila, def: IFichaCampoDef): string {
        const vs = f.valores[def.campo] ?? []
        if (vs.length === 0) return '—'
        const textos = vs.map(v => {
            const base = label(def.campo, v)
            if (def.campo !== CAMPO_ESPECIALIDAD || v !== ESPECIALIDAD_CON_DETALLE) return base
            const marca = f.valores[CAMPO_MARCA]?.[0]
            return marca ? `${base} (${label(CAMPO_MARCA, marca)})` : base
        })
        return textos.join(', ')
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="whitespace-nowrap px-3 py-2 text-left">Cliente</th>
                        {columnas.map(c => (
                            <th key={c.campo} className="px-3 py-2 text-left">
                                {c.descripcion}
                            </th>
                        ))}
                        <th className="whitespace-nowrap px-3 py-2 text-left">Vendedor</th>
                        <th className="whitespace-nowrap px-3 py-2 text-left">Relevado</th>
                    </tr>
                </thead>
                <tbody>
                    {fichas.map(f => (
                        <tr
                            key={f.codigoParticularCliente}
                            className="border-b border-slate-100 hover:bg-blue-50"
                        >
                            <td className="px-3 py-2 text-slate-900">
                                <Linea
                                    ancho="max-w-xs"
                                    title={`#${f.codigoParticularCliente} ${f.nombreCliente}`.trim()}
                                >
                                    <span className="text-slate-400">#{f.codigoParticularCliente}</span>{' '}
                                    {f.nombreCliente || '—'}
                                </Linea>
                            </td>
                            {columnas.map(c => {
                                const texto = celda(f, c)
                                return (
                                    <td key={c.campo} className="px-3 py-2 text-slate-700">
                                        <Linea ancho="max-w-[16rem]" title={texto}>
                                            {texto}
                                        </Linea>
                                    </td>
                                )
                            })}
                            <td className="px-3 py-2 text-slate-600">
                                <Linea
                                    ancho="max-w-[12rem]"
                                    title={f.nombreVendedor || f.codigoParticularVendedor}
                                >
                                    {f.nombreVendedor || f.codigoParticularVendedor}
                                </Linea>
                            </td>
                            {/* `fechaHoraNegocio` y no un slice sobre el ISO: el backend
                                manda UTC, así que cortar el string muestra Greenwich — y no
                                sólo corre la hora, también el DÍA (un relevamiento de las
                                22:00 argentinas cae al día siguiente en UTC). */}
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                                {fechaHoraNegocio(f.relevadoEn)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
