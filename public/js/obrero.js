const token = location.pathname.split('/o/')[1];
let datos = null, mapa = null, circuloObra = null, marcadorObrero = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg, ms = 3200) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

async function cargar() {
  try {
    const r = await fetch('/api/o/' + token);
    if (!r.ok) throw new Error('Link inválido o vencido.');
    datos = await r.json();
    render();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="aviso"><h2>⚠️ ${esc(e.message)}</h2><p style="margin-top:8px">Pedile al encargado que te reenvíe el link.</p></div>`;
  }
}

function fechaLarga(f) {
  const d = new Date(f + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function render() {
  const o = datos.obrero;
  const dentro = datos.estado === 'dentro';
  const app = document.getElementById('app');
  app.innerHTML = `
    <header>
      <div class="obra">${esc(o.obra)}</div>
      <div class="meta">📍 ${esc(o.localidad)} · ${esc(o.provincia)}</div>
      <div class="meta">👷 Encargado: ${esc(o.encargado)}</div>
      <div class="meta" style="text-transform:capitalize">📅 ${fechaLarga(datos.fecha)}</div>
    </header>
    <div id="mapa"></div>
    <div class="cuerpo">
      <div class="estado-card">
        <div style="font-size:13px;color:#64748b;margin-bottom:8px">Hola <strong>${esc(o.nombre)}</strong>, tu estado hoy:</div>
        <span class="estado-pill ${dentro ? 'pill-dentro' : 'pill-fuera'}">${dentro ? '🟢 EN OBRA' : '⚪ FUERA DE OBRA'}</span>
        <p class="instruccion">${dentro
          ? 'Cuando te retires de la obra, presioná el botón. Se usará la <b>ubicación de tu celular</b> para confirmar la salida.'
          : 'Al llegar a la obra, presioná el botón. Se pedirá <b>permiso de ubicación</b>: aceptalo para registrar tu entrada.'}</p>
        <button id="btn-marcar" class="btn ${dentro ? 'btn-salida' : 'btn-entrada'}">
          ${dentro ? '🔴 Marcar SALIDA' : '🟢 Marcar ENTRADA'}
        </button>
        <p class="instruccion" style="font-size:12px;margin-bottom:0">Tu ubicación queda registrada y el encargado verá si estabas en la obra.</p>
      </div>
      <div class="historial">
        <h3>Registros de hoy</h3>
        <div id="lista-hoy"></div>
      </div>
    </div>`;

  initMapa(o, dentro);
  renderHistorial();
  document.getElementById('btn-marcar').onclick = () => marcar(dentro ? 'salida' : 'entrada');
}

function initMapa(o, dentro) {
  mapa = L.map('mapa', { zoomControl: true }).setView([o.lat, o.lng], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(mapa);
  circuloObra = L.circle([o.lat, o.lng], {
    radius: o.radio || 80,
    color: dentro ? '#16a34a' : '#1d4ed8',
    fillColor: dentro ? '#16a34a' : '#3b82f6',
    fillOpacity: dentro ? 0.35 : 0.15, weight: 2,
  }).addTo(mapa).bindPopup(`<b>${esc(o.obra)}</b><br>${esc(o.localidad)}`);
  L.marker([o.lat, o.lng]).addTo(mapa).bindPopup(`Obra: ${esc(o.obra)}`);
}

// Obtiene la ubicacion real del dispositivo (GPS). Devuelve null si se niega o falla.
function obtenerGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

async function marcar(tipo) {
  const btn = document.getElementById('btn-marcar');
  const txtOriginal = btn.textContent;
  btn.disabled = true; btn.textContent = '📍 Obteniendo tu ubicación...';

  const gps = await obtenerGPS();
  if (!gps) {
    if (!confirm('No pudimos obtener tu ubicación (¿rechazaste el permiso?).\n\nSi continuás, quedará registrado SIN verificación de ubicación y el encargado lo verá así.\n\n¿Querés continuar igual?')) {
      btn.disabled = false; btn.textContent = txtOriginal; return;
    }
  }

  // Mostrar la posicion del obrero en el mapa
  if (gps && mapa) {
    if (marcadorObrero) mapa.removeLayer(marcadorObrero);
    marcadorObrero = L.circleMarker([gps.lat, gps.lng], { radius: 8, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1 })
      .addTo(mapa).bindPopup('Tu ubicación').openPopup();
  }

  const payload = { tipo };
  if (gps) { payload.lat = gps.lat; payload.lng = gps.lng; }
  try {
    const r = await fetch(`/api/o/${token}/marcar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const res = await r.json();
    if (!r.ok) throw new Error(res.error || 'No se pudo registrar');
    const accion = tipo === 'entrada' ? 'Entrada' : 'Salida';
    if (res.verificado === 'dentro') toast(`✅ ${accion} registrada a las ${res.hora}. Ubicación verificada en la obra.`);
    else if (res.verificado === 'fuera') toast(`⚠️ ${accion} registrada a las ${res.hora}, PERO estás a ${res.distancia} m de la obra. El encargado lo verá.`, 4500);
    else toast(`${accion} registrada a las ${res.hora} (sin verificación de ubicación).`, 4000);
    await cargar();
  } catch (e) {
    toast('⚠️ ' + e.message); btn.disabled = false; btn.textContent = txtOriginal;
  }
}

function badgeVerif(v, dist) {
  if (v === 'dentro') return '<span style="color:#16a34a;font-weight:600">✔ en obra</span>';
  if (v === 'fuera') return `<span style="color:#dc2626;font-weight:600">✖ lejos (${dist} m)</span>`;
  return '<span style="color:#94a3b8">sin GPS</span>';
}

function renderHistorial() {
  const cont = document.getElementById('lista-hoy');
  if (!datos.registros_hoy.length) { cont.innerHTML = '<div style="color:#94a3b8;font-size:14px">Sin registros aún.</div>'; return; }
  cont.innerHTML = datos.registros_hoy.map(r => `
    <div class="reg">
      <span class="tag ${r.tipo === 'entrada' ? 'e' : 's'}">${r.tipo === 'entrada' ? '🟢 Entrada' : '🔴 Salida'}</span>
      <span>${r.hora} hs · ${badgeVerif(r.verificado, r.distancia)}</span>
    </div>`).join('');
}

cargar();
