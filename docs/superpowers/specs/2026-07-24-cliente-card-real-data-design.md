# Cards de agenda: reemplazar mock visual por datos reales de cliente

## Contexto

`ClienteCard` mostraba categoría, dirección, teléfono y nota rellenados por
`withMockVisualData` (`src/lib/mockAgendaData.ts`), porque la agenda todavía
no exponía esos campos. El usuario compartió la forma real de `fct_clients`
(la fuente que probablemente alimente estos campos) usando como ejemplo a
SERVETTI CARLOS HUGO (`DISTRIBUIDORA OS CAR`, distribuidora de repuestos de
auto). Comparado contra ese dato real, dos de los campos mockeados no tienen
equivalente sano:

- **`categoria`** (`Almacén`, `Kiosco`, `Supermercado`, `Fiambrería`...) es una
  taxonomía de comercio minorista/alimentos inventada para el prototipo. No
  existe un campo real equivalente — el negocio de DistriSuper en este rubro
  es repuestos de auto, no alimentos. Se elimina de la card en vez de mapear
  algo falso.
- **`nota`** salía de 3 strings fijos al azar. El campo real más cercano es
  `comment`, un bloque de texto libre de CRM que mezcla recategorización,
  marcas, contactos, horario y potencial en un solo string — no apto para
  mostrarse tal cual en una card compacta. Se elimina hasta que exista un
  campo de nota curado y específico.

`horaVisita` sigue mockeado — no es parte del dato de cliente, es un problema
aparte de la agenda (asignación de horario de visita) fuera de este cambio.

## Decisiones

1. **`direccion`** y **`telefono`** pasan a poder venir de datos reales
   (`address`, `phone` de `fct_clients`), con el mismo fallback a `barrio`
   que ya existía para dirección.
2. **`telefono` se muestra como string tal cual**, sin parsear separadores
   (`"1171473562 / 46641751"`) ni limpiar dígitos para forzar un link
   `tel:` — el dato de teléfono viene inconsistente entre clientes. El link
   `tel:` solo se arma cuando el string es un único número limpio; si no,
   se muestra como texto plano sin acción.
3. **Nuevo campo opcional `nombreFantasia`**: cuando la agenda traiga
   `trade_name` distinto del nombre principal, se usa como título de la
   card (el vendedor reconoce el local por el cartel, no por la razón
   social). Si no hay diferencia o el campo falta, se sigue usando
   `nombreCliente` tal cual.
4. **Se elimina `categoria` y toda su UI**: bloque ícono+label, y el color
   dinámico de la barra de acento / círculo de iniciales pasa a un color
   fijo (`#213D82`, el default actual).
5. **Se elimina `nota` y su UI** (botón expandible con ícono de lápiz).

## Alcance de la limpieza

- `src/types/planificacion.ts` — sacar `categoria` de `IAgendaClient` y de
  `CategoriaCliente`/su export; sacar `nota`; agregar `nombreFantasia?`.
  Actualizar el comentario que documenta qué sigue siendo mock.
- `src/lib/categoriaColors.ts` — borrar el archivo completo.
- `src/lib/mockAgendaData.ts` — sacar generación de `categoria` y `nota`
  (arrays `CATEGORIAS`, `NOTAS` y su uso).
- `src/components/ClienteCard.tsx` — sacar el bloque de categoría, sacar el
  bloque de nota, resolver el nombre a mostrar con la regla de
  `nombreFantasia`, fijar el color de acento, ajustar el render de teléfono
  para no asumir que siempre es un solo número limpio.
- `src/components/ClienteCard.test.tsx` — agregar casos para
  `nombreFantasia` y teléfono con formato sucio; confirmar que ya no se
  renderiza nada de categoría/nota.

## Fuera de alcance

- No se toca `horaVisita` ni la lógica de "atrasado" (depende de la agenda,
  no del dato de cliente).
- No se agrega ningún endpoint nuevo — se asume que la agenda existente va
  a exponer estos campos (confirmado por el usuario: "ya hay un endpoint
  que trae los clientes por semana, en ese va a traer la data").
- No se define categorización real de cliente para reemplazar la eliminada
  — si en el futuro se necesita, es una decisión de negocio aparte (qué
  campo real la representa), no una tarea de limpieza de mock data.
