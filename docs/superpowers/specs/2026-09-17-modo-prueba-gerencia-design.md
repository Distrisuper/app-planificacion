# El vendedor de prueba: gerencia usa la app del vendedor sin ensuciar datos

**Fecha:** 2026-09-17 · **Revisado:** 2026-09-18 (verificación contra el código de api-vendedores y
app-vendedores; ver "Cambios de la revisión" al final)
**Estado:** diseño validado con el usuario, pendiente de plan de implementación
**Alcance:** dos repos — `api-vendedores` (política de roles, identidad, agenda, cartera, analítica,
Cromo, client-service, reset) y `app-planificacion` (roles, entrada, banner, reinicio con elección de
cartera, buscador, roster de ruta, textos) — más el alta del rol `tester` en el servicio de auth
**Depende de:**
[`2026-09-07-reposicionar-cliente-al-iniciar-visita-design.md`](2026-09-07-reposicionar-cliente-al-iniciar-visita-design.md)
(el `PATCH` permanente a client-service y el cupo de 3, que acá se guardan; y la corrección efímera,
que acá es el camino esperado para pasar el gate de 100 m) y
[`2026-09-17-visita-de-alta-cliente-nuevo-design.md`](2026-09-17-visita-de-alta-cliente-nuevo-design.md)
(precedente del `!esAlta` en el mismo punto donde acá entra la guarda de prueba).

> Este spec es el registro de una decisión, no documentación del sistema. El modelo del dominio y las
> tablas se describen en `docs/dominio/modelo.md` y `docs/dominio/tablas.md`, que son los documentos
> vivos. Si algo de acá quedó viejo, esos mandan.

## El problema

El comercial y los encargados quieren **usar la app tal como la usa un vendedor**: recorrer una
agenda, iniciar una visita, cargar rubros, reagendar, marcar "no visité", dar de alta un cliente
nuevo. Quieren hacerlo para ver que funciona, para probar una feature nueva, o para mostrársela a
alguien. Hoy no pueden: su rol cae en `/analitica`, y si pudieran entrar a la agenda, cada cosa que
hicieran quedaría como un hecho comercial real, contaría en cobertura y efectividad, y llegaría a
Cromo.

También hay gente que **no es gerencia** y necesita lo mismo: desarrollo, sistemas, o alguien a quien
se le quiere mostrar la app sin darle acceso a la analítica. Para eso existe el rol `tester`.

Dos restricciones fijan el diseño:

1. **Una sola entrada.** Una versión de staging con su propia URL y su propio login se descartó
   porque genera dos puertas parecidas y es fácil confundirlas. El comercial entra a la app de
   siempre, con su usuario de siempre, y prueba desde ahí.
2. **El warehouse no se toca.** Ni una columna, ni una fila, ni un código de vendedor sintético, ni
   un "campo dinámico" para la prueba. Lo carga `sync-dagster` desde otro repo y cualquier cambio es
   una dependencia externa que este proyecto evita a propósito. Todo lo de este spec vive en
   api-vendedores y en las tablas `pl_*`; el warehouse solo se lee, tal como está.

3. **api-vendedores es compartida con app-vendedores, y app-vendedores no se toca ni se rompe.**
   Todo cambio de este spec en la API tiene que ser invisible para app-vendedores: mismas rutas,
   mismas respuestas, mismos permisos para los roles que ya existen. Ver "Compatibilidad con
   app-vendedores".

Y un límite que hay que decir en la primera línea, porque cambia expectativas: **esto prueba lo que
ya está deployado.** Una feature nueva del front se prueba con un preview de Vercel contra el mismo
backend, que hereda el vendedor de prueba sin nada extra. Una feature nueva del backend necesita un
deploy: este spec no reemplaza un entorno de preview del backend.

## La decisión: un vendedor sintético por usuario de gerencia, en la misma base

El dominio ya está particionado por `codigo_particular_vendedor`: la rotación, el ciclo, la agenda,
las resoluciones y el aviso a Cromo cuelgan de ese código. Un código que **no existe en el
warehouse** tiene su propia rotación y no choca con nadie. El diseño es:

1. A cada usuario cuyo rol tiene la capacidad `operaComoVendedorDePrueba` (gerencia y `tester`) se
   le asigna un código sintético `PRUEBA-<id de usuario>`.
2. Cuando ese usuario pega a un endpoint de vendedor sin pedir otro código, el backend lo trata como
   ese vendedor.
3. Ese vendedor arranca con la **copia de la cartera de un vendedor real** que el usuario elige (o
   vacío), puede **agregar cualquier cliente de la empresa**, sus datos quedan en `pl_*` como los de
   cualquier vendedor, y **tres guardas** lo mantienen aislado: no cuenta en la analítica de
   gerencia, no dispara efectos fuera de `pl_*`, y no influye en decisiones sobre datos reales.
4. Un botón borra todo lo suyo y vuelve a arrancar, eligiendo cartera de nuevo.

### No es un "modo": es una identidad, y el prefijo es un espacio reservado

No hay flag, ni header, ni estado que el front mande o guarde. Hay una identidad. La forma correcta
de enunciarlo en el dominio es que **el espacio de códigos de vendedor tiene un prefijo reservado,
`PRUEBA-`, con dos invariantes**:

- Un código con ese prefijo **nunca existe en el warehouse**.
- Un código con ese prefijo **nunca entra en una agregación que cruce vendedores**, ni dispara un
  efecto fuera de `pl_*`.

Cada guarda de este spec es una consecuencia de esas dos reglas, no un parche suelto, y la próxima
feature tiene una sola pregunta que hacerse: "¿esto cruza vendedores o sale del dominio? entonces
pregunta `esVendedorDePrueba`". En el código y en `modelo.md` se habla de **"vendedor de prueba"**.
El banner del front puede seguir diciendo "Modo prueba", porque es el lenguaje del usuario.

### Caminos descartados

| camino | por qué no |
|---|---|
| **Staging con base y URL propias** | Dos entradas, dos logins. Descartado por el usuario: es fácil confundirlas. Exige un usuario vendedor en auth, que es un servicio externo. Y el realismo sale del warehouse compartido, así que una base aparte para `pl_*` ganaría poco aislamiento y perdería la única entrada. |
| **Marca `es_prueba` en las filas** | La identidad del vendedor se resuelve contra el warehouse (`allowed_vendor_codes` / `vendor_code`), así que un usuario de prueba con marca terminaría **compartiendo la rotación de un vendedor real** (la rotación es por código, no por usuario). Y cada query nueva tendría que recordar filtrar la marca. |
| **Base distinta elegida por request** | Sequelize ata los modelos a una conexión; habría que enrutar cada repositorio por usuario. `pl_*` ya vive en su propia base `planificacion`, así que esto no es "una conexión más", es rehacer cómo se atan los modelos. |
| **Usuario vendedor de prueba en auth con `codigoparticular` propio** | Necesita que ese código resuelva en el warehouse. Viola la restricción 2. |
| **Usar la visita de alta como "tipo prueba"** | El alta es un concepto de negocio: va a Cromo al genérico 09895 con etiqueta `ALTA` y cuenta en actividad y efectividad. Tampoco cubre el flujo normal con propuesta y mapa, que es lo que quieren probar. |
| **Que gerencia opere "como" un vendedor real (patrón de app-vendedores)** | app-vendedores deja que gerencia elija cualquier vendedor y **mire** sus datos, porque todo es lectura sobre el warehouse. Acá lo que se quiere es **escribir**: cada acción sería un hecho comercial verdadero a nombre de ese vendedor y llegaría a Cromo. Es exactamente el problema. Ese patrón sí sirve para la identidad (ver abajo) y para una fase 2 de solo lectura. |
| **Lista blanca en analítica (contar solo códigos del roster del warehouse) en vez de excluir el prefijo** | El roster degrada a vacío cuando el warehouse está caído, y ese caso ya se diseñó para que la analítica siga respondiendo. Una lista blanca la dejaría en cero. |

**Un vendedor por usuario y no uno compartido:** cuando sale una feature nueva es justo cuando dos
personas van a probar a la vez. Con uno compartido compartirían la visita abierta y el reset de uno
borraría lo del otro. Y la cartera que eligió uno no la hereda otro: cada admin tiene la suya.

## Quién puede: una capacidad en la política de roles, y el rol `tester`

"Puede operar como vendedor de prueba" **no es una lista de roles**: es una capacidad más de la
política que cada rol ya declara en `api-vendedores/src/config/roles.ts`. Ese archivo es la única
fuente de verdad de permisos del backend (el propio encabezado dice "para agregar un rol, agregá una
entrada acá y todo se ajusta"), y tiene el helper `rolesWhere(predicate)` para derivar listas.

Y lo mismo vale para "puede supervisar vendedores" (entrar a `/analitica`, editar la ruta de otro,
mirar la agenda de otro): hoy es la const `ROLES_GERENCIA` hardcodeada en `routes/planificacion.ts`
y espejada en el front. La próxima feature suma el rol **TV**, que tiene vendedores asignados y tiene
que poder controlarlos, y con una lista eso son tres archivos a tocar. Se resuelve igual: una
capacidad. **A quiénes** supervisa no lo dice la capacidad sino el `sellerScope`, que ya existe y ya
resuelve `null` (todos) para gerencia y la lista del grupo para TV. Se agregan dos propiedades a
`RolePolicy`:

```ts
export interface RolePolicy {
    sellerScope: ScopeType
    monetaryDataVisible: boolean
    canCreateNotas: boolean
    isNotaAdmin: boolean
    canManageNotasEntidad: boolean
    /** Puede entrar a la app del vendedor y operar como su vendedor sintético PRUEBA-<id>.
     *  Es independiente de sellerScope: probar no implica ver datos reales de otros. */
    operaComoVendedorDePrueba: boolean
    /** Puede supervisar vendedores: /analitica, edición de ruta, agenda de otro en solo lectura.
     *  A CUÁLES los supervisa lo dice sellerScope (null = todos; tv-group = los de su grupo). */
    superviseVendedores: boolean
}
```

| rol | `sellerScope` | `operaComoVendedorDePrueba` | `superviseVendedores` | qué ve de otros |
|---|---|---|---|---|
| `admin`, `versus-ger`, `supervisor` | `unrestricted` | **sí** | **sí** | a todos |
| **`tester`** (nuevo) | `vendor-scoped` | **sí** | no | a nadie |
| `tv` (próxima feature) | `tv-group` | no (se prende si lo piden) | **sí** | a los de su grupo |
| `vendedor` | `vendor-scoped` | no | no | a nadie |
| `marketing`, `sistema` | `unrestricted` | no | no | nada de planificación |
| `client` | `client-scoped` | no | no | nada de planificación |

- La fila de `tester` es: `{ sellerScope: 'vendor-scoped', monetaryDataVisible: true,
  canCreateNotas: false, isNotaAdmin: false, canManageNotasEntidad: false,
  operaComoVendedorDePrueba: true, superviseVendedores: false }`. `vendor-scoped` con
  `codigoparticular` nulo resuelve a vacío, que es lo que queremos: un tester **no tiene** cartera
  real, y en ventas ni analítica ve nada.
- `ROLES_CON_VENDEDOR_DE_PRUEBA = rolesWhere(p => p.operaComoVendedorDePrueba)` y
  `ROLES_SUPERVISAN = rolesWhere(p => p.superviseVendedores)`. La segunda **reemplaza** a la const
  local `ROLES_GERENCIA` en las 14 rutas de gerencia y en las de analítica. Sumar TV pasa a ser
  poner `superviseVendedores: true` en su fila: las rutas, el scope de la analítica y el
  middleware de scope (ver abajo) ya lo tratan bien.
- **El rol lo crea el servicio de auth**, que es externo: api-vendedores solo declara qué hace un
  rol que le llega con ese nombre en el token. Hay que pedir el alta de `tester` y asignarlo. Hasta
  que exista, el resto del spec funciona igual para gerencia.
- Por qué no basta con `sellerScope === 'unrestricted'` para ninguna de las dos: `marketing` y
  `sistema` lo tienen y no deben ni probar ni supervisar planificación. Y por qué no listas: son la
  tercera copia de lo mismo, y el próximo rol vuelve a tocar tres archivos.
- **Advertencia para la feature de TV**, que no es de este spec: las asignaciones TV→vendedores
  viven en `config/tvAssignments.ts`, un archivo estático. Con eso, cada cambio de grupo es un
  deploy. Este spec no lo resuelve; solo deja el scope como el único lugar que lo lee.

## Identidad

### `vendedorPrueba.ts` — el único lugar que sabe qué es "de prueba"

Módulo nuevo en `api-vendedores/src/services/planificacion/vendedorPrueba.ts`:

```ts
export const PREFIJO_VENDEDOR_PRUEBA = 'PRUEBA-'
export const codigoVendedorPrueba = (userId: string) => `${PREFIJO_VENDEDOR_PRUEBA}${userId}`
export const esVendedorDePrueba = (codigo: string) => codigo.startsWith(PREFIJO_VENDEDOR_PRUEBA)
export const puedeOperarComoVendedorDePrueba = (rol: string) =>
    getRolePolicy(rol)?.operaComoVendedorDePrueba === true
```

Toda guarda de este spec pregunta acá. El prefijo no colisiona con ningún código real: los códigos
de vendedor del warehouse son cortos y no llevan guion con ese prefijo (`V 2`, `NACHO`, `VP1`).
`req.user.id` es el id numérico del servicio de auth convertido a string, así que `PRUEBA-123`
entra sobrado en el `VARCHAR(50)` de `pl_rotacion.codigo_particular_vendedor` y `pl_ciclo_semana`.
El código es por **usuario**, no por rol: dos testers tienen dos vendedores de prueba distintos, igual
que dos gerentes.

### `resolveSellerCode(user, solicitado?)`: la forma de app-vendedores, con default seguro

Hoy `resolveSellerCode(user)` resuelve por warehouse y para un rol sin cartera falla con
`SELLER_CODE_UNRESOLVED`. Pasa a tener la forma que ya usa `SalesDataScopeResolver` para las
ventas: el front puede pedir un código, y el backend decide si lo acepta según la política del rol.
Reglas, en este orden:

- **Rol `vendedor`** → igual que hoy, por warehouse, y el parámetro **se ignora**. Un vendedor real
  nunca puede pedir otro código ni caer en el sintético, ni aunque el warehouse le devuelva vacío:
  en ese caso sigue fallando con `SELLER_CODE_UNRESOLVED`.
- **Rol con `operaComoVendedorDePrueba` y sin parámetro** → `codigoVendedorPrueba(user.id)`. Es el
  default para gerencia y para `tester`, y es lo que hace imposible que una prueba caiga sobre
  datos reales por un estado mal seteado.
- **Rol con `superviseVendedores` y con parámetro** → ese código **si está dentro de su scope**
  (`allowedSellerCodes === null`, o la lista lo incluye), y **solo en endpoints de lectura**. Es la
  misma pregunta que ya responde `SalesDataScopeResolver`: gerencia mira a todos, TV mira a los de
  su grupo, y un rol futuro con otro scope entra sin tocar `resolveSellerCode`. Fuera del scope →
  `403 VENDEDOR_FUERA_DE_SCOPE`. Cualquier escritura con un código que no sea el propio de prueba
  rebota con `403 SOLO_LECTURA_SUPERVISION`. Escribir sobre el plan de un vendedor real ya tiene su
  puerta: `/analitica/ruta`, con `origen: 'gerencia'` en `pl_reacomodacion`.
- **Rol sin `superviseVendedores` y con parámetro** (el `tester`) → lo **ignora** y cae en su
  sintético: probar y ver datos reales de otros son dos capacidades distintas.
- **Cualquier otro rol** → `SELLER_CODE_UNRESOLVED`, como hoy.

**No** se escribe la regla como "rol `unrestricted` puede pedir cualquier código": eso funciona hoy
porque todos los que supervisan son `unrestricted`, y se rompe con TV.

El parámetro nace en la firma **aunque el front todavía no lo use**: así la fase 2 ("ver la agenda
de Juan tal como Juan la ve, solo lectura", con un selector como el `SearchBarSellers` de
app-vendedores) es un query param y un componente, no una reescritura de identidad. Esa fase 2
queda fuera de este spec.

### Rutas: `authorize('vendedor')` pasa a `authorizeVendedor`

Las 28 rutas de vendedor de `routes/planificacion.ts` llevan `authorize('vendedor')`, que hoy
rebota a cualquier otro rol con 403. Se reemplazan por un helper `authorizeVendedor` definido una
vez como `authorize('vendedor', ...ROLES_CON_VENDEDOR_DE_PRUEBA)`. Es un cambio mecánico, y deja
un solo lugar que dice quién puede operar como vendedor. Las 14 rutas de gerencia
(`/vendedores/:codigo/...`) pasan de `authorize(...ROLES_GERENCIA)` a `authorize(...ROLES_SUPERVISAN)`
y **no** incluyen al `tester`.

### Rutas de gerencia: el `:codigo` de la URL se valida contra el scope

Hueco encontrado en la revisión: las 14 rutas `/vendedores/:codigo/rotaciones/...` chequean solo el
rol; el código viaja en la URL y `GerenciaRotacionService` lo usa tal cual, sin mirar
`allowedSellerCodes`. Hoy no importa porque todos los que pasan son `unrestricted`. Con TV importa:
un TV podría editar la rotación de un vendedor de otro grupo con solo cambiar la URL.

Se agrega un middleware `requireVendedorEnScope` que resuelve `SalesDataScopeResolver.resolve(user)`
y compara `req.params.codigo` contra `allowedSellerCodes` (`null` pasa; lista → tiene que incluirlo,
case-insensitive como hace la analítica). Fuera → `403 VENDEDOR_FUERA_DE_SCOPE`. Va en las 14 rutas
**ahora**, cuando todavía es una verificación que siempre pasa, y no junto con la feature que lo
necesita. El código `PRUEBA-<id>` propio del usuario también pasa (es el caso del roster de ruta):
el middleware lo acepta si `codigo === codigoVendedorPrueba(user.id)`, y ningún otro `PRUEBA-*`.

## Agenda: arranca como copia de la cartera de un vendedor real

`RotacionService.leerTemplate(vendedor)` lee `agendaMock.json` por el código del vendedor. El mock
ya tiene el plan de 13 vendedores reales. **No se agrega una clave `PRUEBA` con un dataset
artificial**: el vendedor de prueba arranca como **foto del plan de un vendedor real** que el
usuario elige al reiniciar, o vacío.

- `leerTemplate` y `materializar` ganan un parámetro opcional `plantillaDe: string`. Para un vendedor
  real no se pasa y todo sigue igual. Para el vendedor de prueba, el reset materializa **en el
  momento** con la plantilla del origen elegido, en vez de esperar al próximo `GET`.
- El origen se valida en el backend contra las claves del mock. `GET /planificacion/me` devuelve
  en `vendedorDePrueba.origenesDisponibles` (los códigos con plantilla) y el front les pone nombre con el roster de
  `/planificacion/analitica/vendedores`, que sale del warehouse y solo se lee.
- La rotación de prueba se crea con `pl_rotacion.descripcion = 'Cartera de <origen>'` (o
  `'Sin cartera'`). Esa columna es exactamente para eso, el nombre que gerencia le pone a una
  rotación, y es lo que el banner muestra sin parsear nada.
- Si el origen tiene una rotación abierta con zonas nombradas, se copian los
  `pl_rotacion_semana.descripcion`. Así la prueba dice "Zárate" y no "Zona 3". Si no las tiene, la
  UI muestra el número como fallback, igual que con cualquier zona que nunca se nombró.
- La copia es una **foto**. Si el vendedor real cambia su plan después, la prueba no lo sigue. Para
  verlo actualizado, se reinicia de nuevo. Y es **copia, no vista**: el admin opera sobre su rotación
  `PRUEBA-<id>`, nunca sobre la de V 2.

Usar clientes reales es deliberado y es seguro:

- La card, las coordenadas, la propuesta, las marcas y los descuentos salen del warehouse por
  **código de cliente**, no por vendedor (`getVisitCardsByParticularCodes`). Es lo que hace realista
  la prueba: el gate de los 100 metros contra una dirección real, la propuesta contra historial real.
- El unique del plan es `(rotacion_id, codigo_particular_cliente, semana, dia)` y la rotación es por
  vendedor: el mismo cliente puede estar en la rotación de `V 2` y en la de `PRUEBA-7` sin chocar.
  `pl_resolucion` es única por fila del plan, no por cliente, así que los hechos tampoco se cruzan.
  **Nada de lo que haga el vendedor de prueba toca la fila ni la resolución del vendedor real.**

Si algún día la asignación cliente→`sNdM` pasa al campo "visita" del warehouse, el vendedor de
prueba **sigue leyendo del mock**: es la única plantilla que no tiene sentido cargar en el
warehouse, y el seam `findVisitAssignments` ya es donde se decide la fuente.

## Cartera: el vendedor de prueba puede agregar a cualquier cliente

Hueco encontrado en la revisión: el buscador (`BuscadorService`, `BuscadorCarteraService`) resuelve
la cartera con `ClientRepository.getByVendor(vendedor)`, una query al warehouse por `vendor_code`.
Para `PRUEBA-*` devuelve cero filas: la búsqueda no encuentra nada y "agregar al plan" rebota con
404 "no está en la cartera". Es justo uno de los flujos que gerencia quiere probar.

La restricción de cartera existe para que un vendedor no se meta clientes ajenos. Para el vendedor
de prueba no tiene sentido, y la regla es la misma que app-vendedores aplica a gerencia: **su
cartera es toda la base de clientes**, el scope `unrestricted` que ese rol ya tiene, llevado al
dominio de planificación. Esto es independiente de la cartera con la que arrancó: elegiste V 2 para
tener una agenda realista sin cargar nada a mano, y después agregás a quien quieras.

- Seam nuevo `carteraDe(vendedor)`: para un código real llama a `getByVendor` como hoy; para
  `PRUEBA-*` busca sobre todos los clientes de `fct_clients`.
- El buscador real carga la cartera entera y filtra en memoria. Con toda la base eso no sirve: para
  prueba la búsqueda va con el texto en la query del warehouse y `LIMIT 50`, que es lo que un
  autocompletar necesita.
- La validación "está en la cartera" al agregar se reemplaza, para prueba, por "existe en
  `fct_clients`": basta con que la card resuelva.
- Todo es lectura del warehouse. Ninguna tabla ni columna nueva.

## Las tres guardas

### 1. Lecturas de gerencia: la analítica lo excluye en un solo punto (y se cierra la rama que lo esquiva)

Toda la analítica sale de `AnaliticaRepository`, y el filtro por vendedor está centralizado en
`fragmentoVendedores(vendedores, alias)`. Hoy, con scope sin restricción y sin filtro pedido,
devuelve cláusula vacía y las queries traen todo lo que haya en `pl_*`. Ahí entraría el vendedor de
prueba en cobertura, promedios, actividad y motivos.

El cambio: `fragmentoVendedores` agrega **siempre** `AND <alias>.codigo_particular_vendedor NOT
LIKE 'PRUEBA-%'`, tenga o no lista de vendedores. Con lista también, para que una lista que llegue
por query param con un código de prueba tampoco lo cuele. El replacement del prefijo sale de
`PREFIJO_VENDEDOR_PRUEBA`, no de un literal repetido.

**Rama que hoy esquiva el fragmento:** el listado de visitas tiene una rama `filtro.vendedor`
singular que escribe `AND cs.codigo_particular_vendedor = :vendedor` directo. Un usuario de gerencia
que entre a `/analitica/vendedor/PRUEBA-7` vería sus datos de prueba. Esa rama también excluye el
prefijo (o pasa por el fragmento con lista de uno), para que "no cuenta" sea literal. Ver datos de
prueba en analítica queda fuera de alcance, ver abajo.

**Test de contrato, acotado a lo que corresponde.** La versión original ("`FROM pl_` ≤ usos de
`fragmentoVendedores`") falla hoy mismo: hay más de diez `FROM pl_` y siete usos, y las que no lo
usan son legítimas (`findVisitaContext`, `findMotivosDeVisitas`, `findMotivosDeNoVisitas` filtran
por id de resolución, no por rango). El test cuenta sobre los métodos que reciben
`IFiltroVendedores` o un rango de fechas, o lleva una lista blanca explícita de los que van por id.
Una query futura por rango que no pase por el fragmento rompe el build, no la analítica.

Esta exclusión es una **lista negra** y se acepta con los ojos abiertos: cada query nueva que cruce
vendedores tiene que recordar el prefijo, y la rama `filtro.vendedor` muestra que la deriva ya pasa.
Con el dominio en un solo repo y el test de contrato, es el costo correcto. La regla escrita en
`modelo.md` es: **toda query que agrupe o filtre entre vendedores pasa por `fragmentoVendedores`**.

Fuera de ese mecanismo, y que **no necesitan cambio**:

- El roster de vendedores para los filtros de `/analitica` sale del warehouse
  (`getSellersWithZones`), donde `PRUEBA-*` no existe. No aparece solo.
- Las vistas del propio vendedor (agenda, ciclo, visita activa) filtran siempre por su código. Un
  vendedor real jamás ve lo de `PRUEBA-*`, y un usuario de gerencia solo ve el suyo.
- `pl_objetivo` resuelve por código o `NULL` (objetivo general). El vendedor de prueba toma el
  general, que es lo que se quiere ver.

### 2. Efectos fuera de `pl_*`: no salen

Hay exactamente dos escrituras que salen del dominio, y se verificó por grep que no hay otras.

**Cromo.** `CrmEventoVisitaService.notificar` es el único punto de entrada al aviso y ya cubre los
cuatro disparadores. Se agrega, antes de buscar el mapeo, la guarda `esVendedorDePrueba(vendedorCode)`
→ `marcarSeguimientoPendiente(resolucion.id, 'MODO_PRUEBA', '')` y `return { enviado: false, motivo:
'MODO_PRUEBA' }`. Hoy ya no enviaría porque `PRUEBA-*` no tiene fila en `pl_vendedor_cromo`
(`VENDEDOR_SIN_MAPEO`), pero se hace explícito para que el estado diga la verdad y no parezca un
error de configuración. `MODO_PRUEBA` se suma al motivo de `ISeguimiento` con mensaje en
`mensajeDeSeguimiento`: *"En modo prueba el seguimiento no se manda a Cromo."*
`reintentarSeguimiento` pasa por el mismo `notificar`, así que el reintento manual devuelve lo mismo
y nunca llega a Cromo.

**client-service.** En `VisitasService.iniciar`, la condición que dispara el `PATCH` permanente de
coordenada pasa de `coordClienteAjustada && !esAlta` a `coordClienteAjustada && !esAlta &&
!esVendedorDePrueba(vendedor)`. El ajuste **efímero** (`pl_resolucion.coord_cliente`,
`coord_cliente_ajustada = 1`) sigue funcionando igual, y la coordenada del cliente real no se toca.
En modo prueba `correccionPermanenteAplicada` vuelve `false`.

**Sobre el gate de 100 m.** Un comercial en la oficina nunca va a estar a 100 m de un cliente real.
El camino esperado es **reposicionar el cliente en el mapa** en cada visita, que funciona porque la
corrección efímera se conserva. Se documenta a propósito para que nadie proponga relajar el gate por
rol: eso taparía justo la feature que quieren probar.

### 3. Decisiones sobre datos reales: no las influye

`ResolucionRepository.contarCoordClienteAjustada(codigoCliente)` cuenta filas con
`coord_cliente_ajustada = 1` de ese cliente **sin mirar de qué vendedor son**, y con ese número se
decide si al vendedor real todavía le queda cupo de corrección permanente (límite 3). Tres
reposicionamientos en modo prueba le agotarían el cupo a un vendedor real. La cuenta pasa a hacer
join con `pl_rotacion` y excluir `codigo_particular_vendedor LIKE 'PRUEBA-%'`.

Regla que queda para el futuro: **los datos de prueba no solo no deben escribir afuera, tampoco
deben influir en decisiones sobre datos reales.** Hoy la única es el cupo. Si aparece otra
agregación por cliente que cruce vendedores, lleva la misma exclusión.

## Endpoints de prueba

### `GET /planificacion/me`: el front deja de espejar la tabla de roles

El front hoy mantiene en `src/lib/roles.ts` una copia de qué rol puede qué, con un comentario
cruzado que dice "si allá se agrega uno, hay que sumarlo acá". Ya pasó que las dos tablas se
desalinearon (ver la nota del vault sobre roles de front y back). Con dos capacidades nuevas y dos
roles nuevos en camino (`tester`, TV), el espejo crece y el bug se vuelve cuestión de tiempo.

Se corta de raíz: api-vendedores expone **`GET /planificacion/me`** (cualquier rol autenticado) que
devuelve lo que el front necesita para decidir, derivado de `ROLE_POLICIES` y del scope:

```json
{
  "rol": "tv",
  "capacidades": { "operaComoVendedor": false, "operaComoVendedorDePrueba": false, "superviseVendedores": true },
  "vendedoresVisibles": ["V 2", "V 7", "NACHO"],
  "vendedorDePrueba": null
}
```

- `operaComoVendedor` es `rol === 'vendedor'`; las otras dos salen de la política.
- `vendedoresVisibles` es `allowedSellerCodes` (`null` = todos). Es lo que la analítica ya usa para
  acotar; acá se expone para que el roster del front no muestre a quien el backend después va a
  rebotar.
- `vendedorDePrueba` es `{ codigo, descripcion, origenesDisponibles }` si el rol puede probar, o
  `null`. Absorbe al `GET /planificacion/prueba` del diseño anterior: un endpoint menos.

El front lo pide una vez al autenticarse (junto al `me` de auth, en `AuthContext`) y lo guarda en el
contexto. `roles.ts` queda reducido a `rutaInicialPara(capacidades)`: vendedor → `/`, supervisa →
`/analitica`, solo prueba → `/`, nada → sin acceso. **Ninguna lista de roles en el front.** Si mañana
se agrega un rol o se prende una capacidad, el front lo respeta sin deploy.

## Compatibilidad con app-vendedores

api-vendedores es la API de **dos** frontends: app-vendedores (Versus, desktop, ventas y notas) y
esta app. Nada de este spec puede cambiar lo que app-vendedores ve. Regla operativa: **todo lo que
se toque fuera de `src/services/planificacion`, `src/repositories/*Planificacion*|Analitica*|
Rotacion*|Resolucion*|Ofrecimiento*|Agenda*`, `src/routes/planificacion.ts` y
`src/controllers/planificacionController.ts` tiene que ser aditivo**, y se lista acá con su
justificación. Hoy son exactamente estos puntos de contacto:

| qué se toca | por qué no afecta a app-vendedores |
|---|---|
| `config/roles.ts`: dos propiedades nuevas en `RolePolicy` | Es aditivo: las cinco propiedades existentes (`sellerScope`, `monetaryDataVisible`, `canCreateNotas`, `isNotaAdmin`, `canManageNotasEntidad`) **no cambian de valor para ningún rol existente**. `getRolePolicy`, `rolesWhere`, `ALL_ROLES` y `SalesDataScopeResolver` siguen leyendo lo mismo. Ninguna ruta de ventas ni de notas mira las propiedades nuevas. |
| `config/roles.ts`: fila nueva `tester` | Un rol nuevo en la tabla no cambia el comportamiento de los que ya están. Para las rutas de ventas y notas, `tester` es `vendor-scoped` con `codigoparticular` nulo → cartera vacía, `canCreateNotas: false`: si alguien entra a app-vendedores con ese rol ve datos vacíos, que es lo que hoy pasa con cualquier rol que app-vendedores no conoce (su `ALLOWED_ROLES` no lo incluye y no se le agrega). |
| `ClientRepository.getByVendor` | **No se modifica.** La cartera de prueba se resuelve en un seam nuevo del dominio de planificación (`carteraDe`) que llama a `getByVendor` para códigos reales y a una query nueva para `PRUEBA-*`. Cualquier query nueva sobre `fct_clients` es un método nuevo, no un cambio de firma. |
| `middleware/authorize.ts` | **No se modifica.** `authorizeVendedor` y `requireVendedorEnScope` son helpers nuevos que lo usan. |
| `SalesDataScopeResolver`, `TVPortfolioResolver` | **No se modifican.** `resolveSellerCode` y `requireVendedorEnScope` los consumen tal cual. |
| Rutas | Todo lo nuevo vive bajo `/planificacion/*`, un namespace que app-vendedores no llama. Ninguna ruta de `/sale/*`, `/notas/*`, `/crm/*`, `/sellers/*` cambia de firma, de autorización ni de respuesta. |
| `CrmEventoVisitaService`, `ClientServiceCoordPatchService` | Son del dominio de planificación (los llama solo `VisitasService` / `OfrecimientosService`). app-vendedores usa `CrmService` directo para sus propios eventos, que no se toca. |

Lo que **está prohibido** aunque parezca cómodo: cambiar el default de una propiedad existente de
`RolePolicy`; renombrar o reordenar roles; hacer que `authorize` acepte capacidades en vez de
strings (cambiaría el contrato de todas las rutas de ventas); mover `getByVendor` a un scope
distinto; y agregar `tester` a `ALLOWED_ROLES` de app-vendedores.

**Verificación en el PR de api-vendedores**, además de los tests nuevos:

- La suite completa de Jest en verde, no solo los specs de planificación: los tests de
  `SalesDataScope`, `authorize`, notas y ventas son los que detectan una regresión acá.
- `git diff --stat` del PR revisado contra la lista de arriba: cualquier archivo fuera del dominio
  de planificación que no esté en la tabla es una pregunta que hay que responder antes de mergear.
- Smoke manual en app-vendedores contra el backend con el PR deployado en preview: login con
  `vendedor`, `versus-ger` y `tv`; una vista de rubros, el planning de notas, y el selector de
  vendedores. Sin cambios visibles.

## Endpoints de prueba

Rutas nuevas bajo `/planificacion/prueba`, con `authorize(...ROLES_CON_VENDEDOR_DE_PRUEBA)`
(gerencia y `tester`; **no** `authorizeVendedor`, un vendedor real no tiene nada que reiniciar). En
todas el código se deriva de `req.user`, **nunca se acepta por parámetro**. Esa es la garantía de que no pueden tocar datos de
nadie más, y se fija con un test.

- La **lectura** del vendedor de prueba (`codigo`, `descripcion`, `origenesDisponibles`) viaja en
  `GET /planificacion/me` como `vendedorDePrueba`, ver arriba. `codigo` es `PRUEBA-<id>`, para que el
  front pueda sumarlo al roster de `/analitica/ruta`. `descripcion` es la de la rotación abierta
  (`'Cartera de V 2'`), o `null` si nunca se reinició. `origenesDisponibles` son las claves del mock.
- **`POST /planificacion/prueba/reiniciar`** con body `{ origen?: string }`. Borra todo lo del
  vendedor de prueba del usuario, en una transacción, y materializa la rotación nueva con la
  plantilla de `origen` (o vacía, solo el set de semanas, si no viene). Reemplaza al `DELETE` del
  diseño original porque ahora también crea. Devuelve 201 con el `vendedorDePrueba` actualizado.
- El borrado es explícito, de hoja a raíz, porque el DDL no tiene `ON DELETE CASCADE`:
  `pl_ofrecimiento_alcance`, `pl_ofrecimiento_motivo_campo`, `pl_ofrecimiento_motivo`,
  `pl_ofrecimiento`, `pl_resolucion_motivo`, `pl_resolucion`, `pl_reacomodacion`,
  `pl_rotacion_cliente`, `pl_rotacion_semana`, `pl_ciclo_semana` por código, y `pl_rotacion`. Todas
  las cláusulas terminan filtrando por `codigo_particular_vendedor = :codigo` (directo o vía join a
  `pl_rotacion`), y el servicio verifica `esVendedorDePrueba(codigo)` antes de borrar aunque el
  código venga de la identidad: doble candado para el único `DELETE` masivo del dominio. No se toca
  ningún catálogo: `pl_motivo`, `pl_motivo_campo`, `pl_accion` (es el catálogo de acciones
  comerciales, no cuelga del vendedor), `pl_objetivo`, `pl_vendedor_cromo`. Once tablas borradas +
  cuatro catálogos intactos = los 15 modelos de `src/models/planificacion`.

## Frontend

El front **no sabe de roles ni de códigos `PRUEBA-*`**: sabe lo que le dice `GET /planificacion/me`,
capacidades y, si corresponde, su `vendedorDePrueba`. Con eso alcanza porque el backend ya decidió
la identidad y el alcance.

- **Roles.** `src/lib/roles.ts` deja de ser una tabla de roles. `esRolGerencia` / `esRolVendedor` se
  reemplazan por predicados sobre `capacidades`: `puedeOperarComoVendedor = operaComoVendedor ||
  operaComoVendedorDePrueba`, `supervisa = superviseVendedores`, `estaProbando =
  !operaComoVendedor && operaComoVendedorDePrueba`. `rutaInicialPara(capacidades)`: supervisa →
  `/analitica`; si no, puede operar → `/`; si no, `null` (sin acceso). Sin listas, sin comentario
  cruzado. `AuthContext` pide `/planificacion/me` después del `me` de auth y expone `capacidades` y
  `vendedorDePrueba` junto con `user`.
- **Entrada.** Para quien supervisa **y** puede probar (gerencia), en el header de `/analitica`
  (`AppHeader` / `AccountMenu`, donde ya viven las acciones de cuenta) una acción **"Probar la app
  del vendedor"**. Es una acción de menú, no un botón protagonista: no es parte del trabajo diario
  de gerencia. Si `vendedorDePrueba.descripcion` es `null` (nunca se reinició), abre el diálogo de
  elección de cartera antes de navegar a `/`. Para quien solo puede probar (`tester`) no hay
  entrada: **arranca directo en `/`**, y si nunca se reinició, la agenda vacía muestra el mismo
  diálogo como primera pantalla.
- **Rutas.** El grupo de rutas de vendedor pasa de `permitirRol={esRolVendedor}` a
  `permitir={c => puedeOperarComoVendedor(c)}`; el grupo `/analitica` a `permitir={c =>
  c.superviseVendedores}`. `ProtectedRoute` recibe capacidades, no rol. Un `tester` **no** entra a
  `/analitica`; un TV futuro sí, sin tocar el front.
- **Banner.** Cuando `estaProbando(capacidades)` y la ruta es de vendedor, una franja fija arriba de
  todo, siempre visible, con fondo distinto al de la app (ámbar, el color que ya usa el semáforo
  para "atención", no rojo, que está reservado para `alejado`): **"Modo prueba · Cartera de V 2 ·
  nada de esto cuenta ni llega a Cromo"** (la descripción sale de `vendedorDePrueba`), con las
  acciones a la derecha: **"Reiniciar"** siempre, y **"Volver a analítica"** solo si además
  `superviseVendedores` (el `tester` no tiene adónde volver). El banner es lo que resuelve la confusión que motivó
  descartar el staging. Está también en la vista de la visita abierta (`VisitaSheet`,
  `MapaVisita`), no solo en la agenda.
- **Reiniciar.** Un diálogo con dos partes: la elección de cartera (lista de `origenesDisponibles`
  con nombre del roster, más "Arrancar vacío") y la confirmación ("Se borran todas tus visitas de
  prueba y la agenda vuelve a empezar con la cartera de V 2. Los datos reales no se tocan."). Llama al
  `POST /reiniciar`, invalida todas las queries de planificación y vuelve a `/`.
- **Buscador.** Sin cambios de UI: el mismo buscador de cartera, que ahora devuelve clientes de toda
  la empresa porque el backend resolvió la cartera del vendedor de prueba como toda la base.
- **Roster de `/analitica/ruta`.** Las rutas de gerencia `/vendedores/:codigo/rotaciones/...`
  aceptan cualquier código por URL y no validan contra el warehouse, así que la API **ya permite**
  editar la rotación de prueba (con `requireVendedorEnScope`, que acepta el propio `PRUEBA-<id>`).
  Solo falta que el roster del front sume una entrada "Mi vendedor de prueba" con
  `vendedorDePrueba.codigo`, al final de la lista y visualmente separada. Con eso el admin puede
  probar también la edición de ruta con drag&drop sobre su propia prueba. Es solo para quien
  supervisa y prueba: el `tester` no ve `/analitica/ruta`. Y el roster real se acota con
  `vendedoresVisibles`, para que un TV futuro no vea vendedores que el backend le va a rebotar.
- **Textos que cambian en modo prueba.** El aviso de la corrección de coordenada
  (`correccionPermanenteAplicada === false`) hoy dice "límite alcanzado"; en modo prueba dice *"En
  modo prueba la corrección no se guarda de forma permanente."* El estado de seguimiento con motivo
  `MODO_PRUEBA` muestra el mensaje del backend y **no ofrece "Reintentar"**.
- Ningún componente nuevo de negocio. El vendedor real no ve ningún cambio. No hay borradores en
  `localStorage` que sobrevivan al reinicio: los ofrecimientos se guardan por id de visita y los ids
  no se reusan.

## Datos

Ninguna tabla ni columna nueva. Ninguna migración. Ningún cambio en `agendaMock.json`. Ningún cambio
en el warehouse, en ninguna forma.

## Testing

Backend (Jest, en los specs existentes de cada módulo):

- `roles.spec.ts` (config): `tester` existe, tiene `operaComoVendedorDePrueba: true`,
  `superviseVendedores: false` y `sellerScope: 'vendor-scoped'`; `ROLES_CON_VENDEDOR_DE_PRUEBA` es
  exactamente `['admin', 'versus-ger', 'supervisor', 'tester']`; `ROLES_SUPERVISAN` es exactamente
  `['admin', 'versus-ger', 'supervisor']` (TV se suma en su feature); `marketing`, `sistema`,
  `client` y `vendedor` tienen las dos capacidades en `false`.
- `requireVendedorEnScope`: `unrestricted` pasa con cualquier código; `tv-group` pasa con uno del
  grupo y rebota `VENDEDOR_FUERA_DE_SCOPE` con uno de otro grupo; el propio `PRUEBA-<id>` pasa y
  otro `PRUEBA-*` no; comparación case-insensitive.
- `GET /planificacion/me`: gerencia → las dos capacidades, `vendedoresVisibles: null`,
  `vendedorDePrueba` con código; `tester` → solo prueba, `vendedoresVisibles: []`; `vendedor` →
  `operaComoVendedor`, sin `vendedorDePrueba`; `marketing` → todo en `false`, `vendedorDePrueba:
  null`; un rol simulado `tv` → `superviseVendedores` con la lista de su grupo.
- `vendedorPrueba.spec.ts`: prefijo, derivación por `userId`, `esVendedorDePrueba` verdadero/falso,
  `puedeOperarComoVendedorDePrueba` por rol (gerencia y `tester` sí; el resto y un rol desconocido
  no).
- `sellerIdentity.spec.ts`: gerencia sin parámetro → sintético; `tester` sin parámetro → sintético;
  gerencia con parámetro en lectura → ese código; gerencia con parámetro en escritura →
  `SOLO_LECTURA_SUPERVISION`; un `tv` simulado con parámetro de su grupo → ese código, con uno de
  otro grupo → `VENDEDOR_FUERA_DE_SCOPE`; `tester` con parámetro → lo ignora y cae en su sintético;
  vendedor con
  parámetro → lo ignora; vendedor con warehouse vacío → sigue fallando `SELLER_CODE_UNRESOLVED`,
  nunca sintético; `marketing` → `SELLER_CODE_UNRESOLVED`.
- Rutas: `tester` pasa `authorizeVendedor` y las rutas de `/prueba`; rebota con 403 en las 14 rutas
  de gerencia.
- `RotacionService`: `materializar(vendedor, plantillaDe)` lee la plantilla del origen y crea la
  rotación a nombre del vendedor; sin `plantillaDe` se comporta como hoy; copia los nombres de zona
  si el origen los tiene.
- Cartera: `carteraDe('PRUEBA-7')` busca sobre toda la base con `LIMIT`; `carteraDe('V 2')` sigue
  llamando a `getByVendor`; agregar un cliente de otro vendedor al plan de prueba no rebota.
- `AnaliticaRepository.spec.ts`: el fragmento lleva `NOT LIKE` en los tres casos (undefined, lista,
  lista vacía); la rama `filtro.vendedor` singular también excluye; test de contrato acotado a los
  métodos por rango.
- `CrmEventoVisitaService.spec.ts`: vendedor de prueba → `MODO_PRUEBA`, no consulta el mapeo, no
  llama a Cromo; reintento devuelve lo mismo.
- `VisitasService.spec.ts`: vendedor de prueba con `coordCliente` → no llama a
  `ClientServiceCoordPatchService.aplicar`, `correccionPermanenteAplicada === false`, la
  coordenada efímera sí se guarda.
- `ResolucionRepository`: `contarCoordClienteAjustada` ignora filas de rotaciones `PRUEBA-*`.
- Reiniciar: borra solo lo del código derivado del usuario, rechaza (500 de invariante) si el código
  no es de prueba, rechaza un `origen` que no esté en el mock, deja intactas filas de otro vendedor
  con el mismo cliente, y deja la rotación nueva con la `descripcion` esperada.

Front (Vitest):

- `roles.ts`: `rutaInicialPara` sobre capacidades: supervisa → `/analitica`; solo prueba → `/`;
  solo vendedor → `/`; nada → `null`. No existe ninguna lista de roles en el módulo (test que lea el
  fuente y falle si aparece `'admin'`, `'versus-ger'`, `'tester'` o `'tv'` como literal).
- `AuthContext`: pide `/planificacion/me` tras el `me` de auth; si falla, el usuario queda
  `unauthorized` (no se adivina nada por rol).
- `ProtectedRoute`: con capacidades de gerencia entra a `/` y a `/analitica`; con las de `tester`
  entra a `/` y no a `/analitica`; con las de vendedor entra a `/` y no a `/analitica`; con las de
  un TV simulado entra a `/analitica` y no a `/`.
- Banner presente en rutas de vendedor cuando `estaProbando`, con la descripción de la cartera;
  "Volver a analítica" solo si además supervisa; ausente con capacidades de vendedor y en
  `/analitica`.
- Roster de `/analitica/ruta`: acotado a `vendedoresVisibles` cuando no es `null`.
- Reiniciar: elige cartera, confirma, llama al `POST`, invalida queries.
- Roster de ruta: con rol gerencia incluye "Mi vendedor de prueba".
- Seguimiento `MODO_PRUEBA` sin botón de reintentar.

## Documentación a actualizar en el mismo PR

- `docs/dominio/modelo.md`: sección nueva **"El vendedor de prueba"**: el prefijo reservado y sus dos
  invariantes, las tres guardas, la regla "toda query que cruce vendedores pasa por
  `fragmentoVendedores`", y la regla "no escribe afuera, no influye en decisiones sobre datos
  reales".
- `CLAUDE.md` de esta app: bullet en decisiones no obvias, **corregir** el bloque del ecosistema
  que dice que `pl_*` usa `sequelizeWrite` de `distriap_distri` (hoy viven en la base propia
  `planificacion` con la conexión `sequelizeWritePlanificacion`), y reforzar que el warehouse no se
  modifica ni se extiende bajo ninguna forma.
- `api-vendedores/CLAUDE.md` o `AGENTS.md`: `esVendedorDePrueba` como pregunta obligatoria ante
  cualquier efecto externo nuevo o agregación que cruce vendedores; que "quién puede probar" y
  "quién supervisa" se leen de `config/roles.ts`, nunca de una lista; y que toda ruta con `:codigo`
  de vendedor en la URL lleva `requireVendedorEnScope`.
- `CLAUDE.md` de esta app, además: el front **no tiene tabla de roles**; decide con las capacidades
  de `GET /planificacion/me`. Si una pantalla nueva necesita saber "quién puede", la respuesta es una
  capacidad nueva en el backend, no un `if (rol === ...)` en el front.
- Pedido al servicio de auth (fuera de los repos): alta del rol `tester` y asignación a las
  personas que lo necesiten.

## Fuera de alcance

- Que gerencia vea sus datos de prueba en `/analitica` (un filtro "incluir datos de prueba"). Se
  agrega si lo piden; hoy complicaría la exclusión.
- **Fase 2: selector de vendedor real en la app móvil, solo lectura** ("Viendo a Juan · solo
  lectura", en gris). La identidad ya la soporta con el parámetro; falta el componente y el modo
  sin CTAs en el front.
- Probar features **antes** de que estén en producción. Ver el límite al principio.
- Dar la capacidad de prueba a roles existentes que no son de gerencia (`tv`, `marketing`). Si
  alguien de esos equipos necesita probar, se le asigna además el rol `tester`, o se prende la
  capacidad en su fila de `roles.ts`: es una línea, pero es una decisión de negocio, no de este spec.
- **La feature de TV en sí**: prender `superviseVendedores` en su fila, decidir dónde viven las
  asignaciones TV→vendedores (hoy `config/tvAssignments.ts`, estático), y qué ve un TV en
  `/analitica` además de lo que ya acota el scope. Este spec deja la identidad, el scope en las
  rutas, la analítica y el front listos para que eso sea una fila y una decisión de datos.
- Relajar el gate de 100 m por rol.

## Cambios de la revisión del 2026-09-18

Qué cambió respecto del diseño original del 17, y por qué:

- **Encuadre:** de "modo" a "vendedor de prueba" con prefijo reservado e invariantes. La solución
  es la misma; el enunciado hace que cada guarda sea una consecuencia y no un parche.
- **Restricción explícita del warehouse**, reafirmada por el usuario: nada se modifica ni agrega.
- **Identidad con parámetro opcional de solo lectura**, tomado del patrón de app-vendedores
  (`SalesDataScopeResolver` + selector de vendedor), para que la fase 2 no sea una reescritura.
- **"Quién puede probar" es una capacidad de la política de roles** (`operaComoVendedorDePrueba`
  en `config/roles.ts`), no una lista. Primero se había propuesto reusar `ROLES_GERENCIA`; después
  se vio que probar y ser gerencia son cosas distintas, y que una lista era la tercera copia del
  mismo dato.
- **Rol `tester`**: para quien no es gerencia (desarrollo, sistemas, demos). Opera como su propio
  `PRUEBA-<id>`, arranca en `/`, no ve `/analitica` ni puede pedir el código de un vendedor real. El
  alta del rol es en el servicio de auth, externo a los dos repos.
- **Preparación para TV** (segunda revisión del 18): TV tiene vendedores asignados y va a tener que
  controlarlos, y el spec tal como estaba escalaba mal en tres lugares. (a) La regla del parámetro
  de solo lectura pasa de "rol `unrestricted`" a "código dentro de `allowedSellerCodes`", que es lo
  que el scope ya calcula para gerencia y para TV. (b) Las 14 rutas `/vendedores/:codigo/...` ganan
  `requireVendedorEnScope`: hoy solo miraban el rol, y un TV podría editar a un vendedor de otro
  grupo cambiando la URL. (c) `ROLES_GERENCIA` deja de ser una lista y pasa a ser la capacidad
  `superviseVendedores`, hermana de `operaComoVendedorDePrueba`.
- **Compatibilidad con app-vendedores como restricción explícita**: api-vendedores es compartida,
  y todo lo que se toca fuera del dominio de planificación (hoy solo `config/roles.ts`, de forma
  aditiva) queda listado con su justificación, más una verificación de regresión en el PR.
- **`GET /planificacion/me`** reemplaza la tabla de roles espejada en el front, que ya se había
  desalineado una vez y con `tester` y TV iba a volver a pasar. Absorbe al `GET /prueba`. El front
  decide con capacidades y `vendedoresVisibles`, y un rol nuevo no requiere deploy del front.
- **Agenda inicial = copia de la cartera de un vendedor real (o vacío)** en vez de una clave `PRUEBA`
  artificial en el mock. Menos datos que mantener, más realismo, zonas con nombre.
- **Cartera del vendedor de prueba = toda la base.** Hueco encontrado: el buscador daba vacío y
  agregar rebotaba con 404. Además desacopla "con qué arranco" de "a quién puedo agregar".
- **Rama `filtro.vendedor` singular** en analítica, que esquivaba el fragmento: se cierra.
- **Test de contrato acotado**: la versión original fallaba hoy mismo por las queries por id.
- **`DELETE /prueba` → `POST /prueba/reiniciar` + lectura en `GET /me`**, porque ahora también materializa
  y el front necesita el código para el roster de ruta.
- **Editar la rotación de prueba desde `/analitica/ruta` pasa de "fuera de alcance" a "en alcance"**:
  la API ya lo permitía, solo faltaba el roster.
- **Gate de 100 m**: documentado el camino esperado (reposicionar) y cerrado el atajo por rol.
