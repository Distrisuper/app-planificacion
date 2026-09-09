# Aviso de "te alejaste del cliente" con la visita abierta

Fecha: 2026-09-08

## Problema

Una vez iniciada la visita, la app deja de mirar dónde está el vendedor. `watchPosition` sólo
vive dentro de `IniciarVisitaMapa`, que se desmonta apenas la visita arranca; después el
vendedor queda en `VisitaSheet` o minimizado en `VisitaEnCursoBar`, ambos sin geolocalización.
La única captura posterior es el `capturarUbicacion()` puntual del cierre.

Consecuencia: el vendedor se va del cliente sin cerrar la visita y nada se lo dice. La visita
queda abierta, y cuando finalmente la cierra —si la cierra— la coordenada de fin se captura
donde esté en ese momento, que puede ser otro cliente.

## Qué se descartó, y por qué

**Cerrar la visita automáticamente al salir del rango.** Fue el pedido original y se descartó
por cuatro razones, todas del dominio y no de implementación:

1. **La PWA no ve nada con la pantalla apagada.** Es la misma limitación que ya justifica no
   usar Capacitor. El vendedor sale del local con el celu en el bolsillo, `watchPosition` se
   congela, y el disparo llega recién cuando reabre la app — posiblemente ya en otro cliente.
   El cierre automático se ejecutaría con `coordFinal` en el lugar equivocado, rompiendo justo
   la métrica que la geolocalización existe para alimentar (`TOLERANCIA_METROS` de efectividad).
   El escenario que la feature quería resolver es el que peor funciona.
2. **El cierre es irreversible.** `pl_resolucion` tiene `UNIQUE (rotacion_cliente_id)` y no se
   reabre. Un fix grueso de wifi/antena que marca 400 m con el vendedor parado adentro del local
   cerraría la visita para siempre, y además dispararía el seguimiento a Cromo. En el gate del
   inicio un falso "lejos" sólo molesta; acá destruye datos.
3. **Se perderían los rubros sin cargar.** El sheet de una visita cerrada es de consulta
   (`esEditable` devuelve `!visitaCerrada`). Auto-cerrar al llegar al mínimo de 2 sobre 5
   propuestos descartaría los otros 3 sin que nadie lo decida.
4. **Cerrar es un acto declarativo del vendedor.** Auto-cerrar inventa un hecho comercial que
   nadie declaró — el mismo antipatrón que "auto-resolver pendientes", ya listado como idea
   descartada en `docs/dominio/modelo.md`.

**Notificación del sistema (Notification API).** Descartada: en background la geolocalización
está congelada, así que no habría nada que dispare la notificación en el momento en que
serviría. Pide un permiso extra a cambio de cubrir sólo el caso raro de la app al frente en
otra pestaña.

**Empujar a cerrar desde el aviso** (barra que ofrezca el botón de cierre destacado si ya hay
2 rubros resueltos). Descartado a pedido: el aviso es informativo. Meterle lógica de "cierre
sugerido" agrega una regla de negocio que hoy no existe, a cambio de poco.

## Diseño

Detectar que el vendedor está lejos del cliente de la visita en curso, y decírselo. Nada más:
no cierra, no bloquea, no escribe en el backend.

### Detección

Misma definición que usa el gate del inicio: `estaFueraDeRango(distanciaM, precisionM)` de
`src/lib/distancia.ts`, con la misma constante `RADIO_INICIO_METROS`. Al descontar el margen de
error del propio fix, sólo dispara con evidencia positiva de lejanía — un fix grueso no alcanza
para avisar en falso.

`enableHighAccuracy: false` en el watch. Una visita dura media hora y el GPS fino la
tendría prendida todo ese tiempo; y como el margen de error ya se descuenta, un fix grueso
simplemente no dispara en vez de disparar mal. Para una advertencia, pecar de conservador es
lo correcto.

### Dos disparadores

1. **`watchPosition`** mientras la app está al frente — cubre "se va caminando con la app abierta".
2. **Chequeo puntual con `getCurrentPosition` en `visibilitychange`** al volver del background —
   cubre el escenario real: se fue, guardó el celu, y lo saca de nuevo en el próximo cliente.
   El aviso llega tarde, pero llega.

Sin el segundo disparador la feature no cubre su caso principal.

### Histéresis

Se **entra** en `alejado` con `estaFueraDeRango(d, precisión)` (distancia menos precisión mayor
al radio). Se **sale** sólo cuando la distancia cruda vuelve a estar dentro del radio, sin
descontar precisión. Los dos umbrales son distintos a propósito: con un solo umbral, un
vendedor parado en el borde con fixes que oscilan dispararía el toast una y otra vez.

### Dónde vive

- **`src/hooks/useAlejadoDelCliente.ts`** (nuevo). Recibe las coordenadas del cliente y si la
  visita está activa. Monta el watch y el listener de `visibilitychange`. Devuelve
  `{ alejado, distanciaM }`. Si el cliente no tiene coordenadas, queda inactivo.
- **`VisitaFlow`** lo consume. Ahí y no en `VisitaSheet`: el sheet se minimiza y desmontaría el
  watch justo cuando más se necesita. Las coordenadas salen de `visitaEnCurso.cliente`, no del
  `cliente` abierto — el vendedor puede estar mirando la propuesta de otro mientras la visita
  corre.
- **`VisitaEnCursoBar`** recibe `alejado` y pinta el estado.

Nota: se usa `cliente.latitud/longitud`, no el `clienteOverride` efímero de la reposición del
pin al iniciar. Ese override no sobrevive al inicio y no vale la pena arrastrarlo para un
aviso informativo.

### Qué ve el vendedor

- Al **cruzar de dentro a fuera**, una sola vez por cruce (no en cada tick del watch): un toast
  por el `onAviso` que ya existe — *"Te alejaste de Kiosco Rubén y la visita sigue abierta."*
- **Mientras siga lejos**, `VisitaEnCursoBar` pasa de naranja a rojo y muestra ese texto en vez
  de "Visitando a X". El cronómetro se queda. Tocarla hace lo mismo que hoy: abre el sheet.

El estado persistente en la barra es lo que hace que el aviso funcione: el toast es efímero
(`useNotificacion` lo borra solo a los pocos segundos y no tiene cola), así que por sí solo se
pierde exactamente en el caso que importa — el vendedor que no estaba mirando la pantalla.

### Fuera de alcance

No persiste el estado de `alejado`: si recarga la app, se recalcula con el primer fix. No hay
permiso nuevo — el de geolocalización ya está dado, si no la visita no habría podido iniciarse.
No toca api-vendedores: la regla vive entera en el front, igual que `RADIO_INICIO_METROS`.

## Tests

`useAlejadoDelCliente`, con el mock de `navigator.geolocation` que ya usa
`IniciarVisitaMapa.test.tsx`:

- dispara `alejado` cuando el fix está francamente lejos;
- **no** dispara con un fix grueso a distancia moderada (la precisión lo cubre);
- no re-dispara el aviso oscilando en el borde (histéresis);
- chequea la posición al volver del background (`visibilitychange`);
- queda inactivo si el cliente no tiene coordenadas;
- limpia el watch y el listener al desmontarse.

`VisitaEnCursoBar`: la variante roja con el texto de alejado, y que el cronómetro se siga
mostrando.
