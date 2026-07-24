import { Store, Newspaper, ShoppingCart, ShoppingBasket, Package, ShoppingBag, Beef, Croissant } from 'lucide-react'
import type { CategoriaCliente } from '@/types/planificacion'

export const CATEGORIA_COLORS: Record<CategoriaCliente, string> = {
    Almacén: '#213D82',
    Kiosco: '#B45309',
    Autoservicio: '#009E4F',
    Supermercado: '#3259C3',
    Despensa: '#7C3AED',
    Minimercado: '#0D7377',
    Fiambrería: '#BE123C',
    Panadería: '#A16207',
}

export const CATEGORIA_ICONS: Record<CategoriaCliente, typeof Store> = {
    Almacén: Store,
    Kiosco: Newspaper,
    Autoservicio: ShoppingCart,
    Supermercado: ShoppingBasket,
    Despensa: Package,
    Minimercado: ShoppingBag,
    Fiambrería: Beef,
    Panadería: Croissant,
}

export const CATEGORIA_COLOR_DEFAULT = '#213D82'
