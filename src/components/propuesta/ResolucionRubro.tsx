import { useState } from 'react'
import { ChevronLeft, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

const TAGS = [
    'Saqué pedido', 'Pasa pedido mañana', 'Pedido en la semana', 'Precio',
    'DS', 'Flete', 'Poco trabajo', 'Estoy completo', 'Vacaciones',
]

interface ResolucionRubroProps {
    rubro: string
    tags: string[]
    onToggleTag: (tag: string) => void
    onBack: () => void
}

export default function ResolucionRubro({ rubro, tags, onToggleTag, onBack }: ResolucionRubroProps) {
    const [marca, setMarca] = useState('')
    const [competidor, setCompetidor] = useState('')
    const [diff, setDiff] = useState('')
    const precioOn = tags.includes('Precio')

    return (
        <div>
            <div className="mb-1 flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={onBack} className="h-[29px] w-[29px] border-[#E1E6F0] text-dsmuted">
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
                <span className="text-[13.5px] font-extrabold text-[#182645]">Resolución</span>
            </div>
            <div className="mb-3 ml-[38px] text-[12.5px] font-semibold text-dsmuted">{rubro}</div>

            <div className="flex flex-col gap-2">
                {TAGS.map(tag => {
                    const on = tags.includes(tag)
                    return (
                        <div key={tag} className="flex flex-col gap-0">
                            <button
                                onClick={() => onToggleTag(tag)}
                                className={`flex w-full items-center gap-2.5 rounded-[11px] border-[1.5px] px-3 py-2.5 text-left font-sans ${
                                    on ? 'border-[#B9CCEC] bg-[#EEF3FB]' : 'border-[#E4E8F0] bg-white'
                                }`}
                            >
                                <span
                                    className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-md border-[1.5px]"
                                    style={{
                                        borderColor: on ? '#213D82' : '#CBD2E0',
                                        background: on ? '#213D82' : '#fff',
                                        color: on ? '#fff' : 'transparent',
                                    }}
                                >
                                    <Check className="h-[13px] w-[13px]" strokeWidth={3.2} />
                                </span>
                                <span className={`text-sm font-bold ${on ? 'text-[#182645]' : 'text-[#3B4560]'}`}>{tag}</span>
                            </button>

                            {tag === 'Precio' && precioOn && (
                                <div className="ml-8 mt-2 mb-0.5 flex flex-col gap-2.5 rounded-[10px] border-[1.5px] border-[#B9CCEC] bg-white p-2.5">
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">Marca</span>
                                        <input
                                            value={marca}
                                            onChange={e => setMarca(e.target.value)}
                                            placeholder="Ej. Fric-Rot"
                                            className="w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none"
                                        />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">Competidor</span>
                                        <input
                                            value={competidor}
                                            onChange={e => setCompetidor(e.target.value)}
                                            placeholder="Ej. Corven"
                                            className="w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none"
                                        />
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[12.5px] font-bold text-[#3B4560]">% de diferencia</span>
                                        <div className="flex flex-1 items-center justify-end gap-1">
                                            <input
                                                value={diff}
                                                onChange={e => setDiff(e.target.value.replace(/[^0-9.-]/g, ''))}
                                                inputMode="decimal"
                                                placeholder="0"
                                                className="w-16 rounded-lg border border-[#E1E6F0] px-2 py-1.5 text-right text-sm font-extrabold text-dsnavy outline-none"
                                            />
                                            <span className="text-[15px] font-extrabold text-dsnavy">%</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <Button onClick={onBack} className="mt-4 h-[47px] w-full text-[14.5px]">
                Listo
            </Button>
        </div>
    )
}
