# Ubicación-Asistencia de Obra

App web para controlar la asistencia de obreros por obra en GBA, CABA y Córdoba (Argentina).
El administrador carga las obras y los obreros, y a cada obrero le envía un **link único**.
Con ese link el obrero **marca su entrada y salida**, y el sistema usa el **GPS real del celular**
para verificar si estaba en la obra. Todo queda registrado y el administrador puede
**imprimir el reporte por semana o quincena** para ver asistencia y calcular la paga.

---

## Requisitos

- **Node.js 22.5 o superior** (usa el módulo SQLite nativo, sin instalar bases de datos externas).
  Descargar de https://nodejs.org (versión LTS o superior a la 22.5).

Verificar la versión instalada:

```
node --version
```

---

## Instalación (una sola vez)

Abrí una terminal **dentro de la carpeta del proyecto** y ejecutá:

```
npm install
```

Esto descarga la única dependencia (Express). No se compila nada nativo.

---

## Datos de ejemplo (opcional)

Para empezar con 3 obras y 4 obreros de prueba:

```
npm run seed
```

> Esto **borra** los datos existentes y carga los de ejemplo. Saltealo si vas a cargar tus propias obras.

---

## Iniciar la app

```
npm start
```

Vas a ver:

```
Servidor activo en  http://localhost:3000
Usuario: admin   Contraseña: obra2026
```

Abrí **http://localhost:3000** en el navegador.

> **Importante:** cada vez que se cambian los archivos del proyecto hay que **reiniciar** el
> servidor: en la terminal apretá `Ctrl + C` y volvé a correr `npm start`.

---

## Cómo se usa

### 1. Panel de administrador

Entrá con **admin** / **obra2026** (cambialas, ver más abajo).

- **Obras:** cargá nombre, localidad, encargado, fecha, días estimados, **radio de obra** (metros
  de tolerancia para el GPS) y la **ubicación en el mapa** (clic en el mapa o buscando la dirección).
- **Obreros:** agregá cada obrero y asignalo a una obra. Se genera un **link único** que enviás por
  **WhatsApp** o con **Copiar**.
- **Asistencia:** elegí *Semana*, *Quincena* o un rango, filtrá por obra y tocá **Consultar**. Vas a
  ver días trabajados, entrada, salida, horas y la **verificación de ubicación** de cada fichada.
  **Imprimir / PDF** genera el reporte para liquidar la paga.

### 2. El obrero (desde el celular)

Abre el link, ve la obra, el encargado y la fecha. Al llegar presiona **Marcar ENTRADA**: el celular
pide **permiso de ubicación** (hay que aceptarlo) y registra la entrada con la hora del servidor.
Al retirarse presiona **Marcar SALIDA**.

---

## Verificación de ubicación (anti-fraude por GPS)

Cuando el obrero ficha, el navegador toma la **ubicación real del teléfono** y el servidor calcula la
distancia hasta la obra. En el reporte del admin cada fichada muestra:

- ✔ **En obra** — el GPS coincide con la ubicación de la obra (dentro del radio configurado).
- ✖ **Lejos (X m)** — fichó pero estaba lejos de la obra. La fila se resalta en rojo y el obrero
  aparece con un aviso de "fichada(s) lejos".
- **Sin GPS** — el obrero no dio permiso de ubicación.

La **hora siempre la pone el servidor**, así que no se puede falsear. El obrero igual puede fichar,
pero queda registrado si estaba o no en la obra, para que el encargado lo controle.

> **Importante sobre el GPS:** por seguridad, los navegadores solo entregan la ubicación en
> `localhost` (tu PC) o en sitios con **HTTPS**. Si probás en tu propia computadora, el GPS será el de
> *tu* ubicación, así que es normal que aparezca "Lejos" respecto de una obra en otra ciudad: eso
> confirma que la verificación funciona. Para que los obreros fichen desde la obra con sus celulares,
> la app debe estar **publicada en internet con HTTPS** (ver abajo).

---

## Cambiar usuario y contraseña del admin

**Windows (PowerShell):**
```
$env:ADMIN_USER="miusuario"; $env:ADMIN_PASS="miclavesegura"; npm start
```

**Windows (CMD):**
```
set ADMIN_USER=miusuario && set ADMIN_PASS=miclavesegura && npm start
```

**Mac/Linux:**
```
ADMIN_USER=miusuario ADMIN_PASS=miclavesegura npm start
```

También podés cambiar el puerto con `PORT=8080`.

---

## Usar desde los celulares de los obreros

El link `http://localhost:3000/...` solo funciona en la PC donde corre la app. Para que los obreros
fichen desde la obra hay que **publicar la app en internet con HTTPS** (necesario también para el GPS).
Opciones recomendadas: **Render**, **Railway** o un VPS. Avisame y te dejo la configuración de despliegue.

---

## Estructura del proyecto

```
db.js            Base de datos y esquema (SQLite nativo)
server.js        Servidor y API (Express) + cálculo de distancia GPS
seed.js          Datos de ejemplo
public/
  login.html     Ingreso del administrador
  admin.html     Panel del administrador
  admin.js       Lógica del panel + reporte con verificación
  obrero.html    Vista del obrero (móvil)
  obrero.js      Marcado de entrada/salida con GPS real
  styles.css     Estilos
data.db          Se crea solo al iniciar (no borrar salvo que quieras reiniciar todo)
```

---

## Notas técnicas

- Mapas con **Leaflet + OpenStreetMap**: gratis, sin clave de API, cobertura de toda Argentina.
- Verificación de ubicación con la **API de geolocalización del navegador** + fórmula de Haversine
  en el servidor.
- Base de datos en un único archivo `data.db`. Copiá ese archivo para respaldar todos los registros.
- Zona horaria fija: **America/Argentina/Buenos_Aires**.
