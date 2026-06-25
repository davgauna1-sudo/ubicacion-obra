// ====== Helpers ======
const $ = (s) => document.querySelector(s);
const api = async (url, opts = {}) => {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (r.status === 401) { location.href = '/login.html'; throw new Error('no auth'); }
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Error'); }
  return r.status === 204 ? null : r.json();
};
const fechaHoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

api('/api/me').catch(() => {});
$('#salir').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.href = '/login.html'; };

// ====== Tabs ======
document.querySelectorAll('.tabs button').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('activa'));
    b.classList.add('activa');
    ['obras', 'obreros', 'asistencia', 'mapa'].forEach(t => $(`#tab-${t}`).style.display = 'none');
    $(`#tab-${b.dataset.tab}`).style.display = 'block';
    if (b.dataset.tab === 'obras') setTimeout(() => mapaObra && mapaObra.invalidateSize(), 100);
    if (b.dataset.tab === 'obreros') cargarObreros();
    if (b.dataset.tab === 'asistencia') cargarObrasEnSelect('#a-obra', true);
    if (b.dataset.tab === 'mapa') iniciarMapaVivo();
  };
});

// ====== MAPA selector de obra ======
let mapaObra, marcador, coords = null;
function initMapaObra() {
  mapaObra = L.map('mapa-obra').setView([-34.65, -58.45], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(mapaObra);
  mapaObra.on('click', (e) => fijarObra(e.latlng.lat, e.latlng.lng));
}
function fijarObra(lat, lng) {
  coords = { lat, lng };
  if (marcador) marcador.setLatLng([lat, lng]);
  else marcador = L.marker([lat, lng]).addTo(mapaObra);
  $('#o-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
$('#o-buscar-btn').onclick = async () => {
  const q = $('#o-buscar').value.trim();
  if (!q) return;
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=ar&limit=1&q=${encodeURIComponent(q)}`);
  const data = await r.json();
  if (data[0]) { const { lat, lon } = data[0]; mapaObra.setView([+lat, +lon], 16); fijarObra(+lat, +lon); }
  else alert('No se encontró la dirección. Probá con calle, número y localidad.');
};

// ====== OBRAS CRUD ======
let editObraId = null;
async function cargarObras() {
  const obras = await api('/api/obras');
  const cont = $('#tabla-obras');
  if (!obras.length) { cont.innerHTML = '<div class="vacio">Todavía no cargaste ninguna obra.</div>'; }
  else {
    cont.innerHTML = `<table><thead><tr>
      <th>Obra</th><th>Localidad</th><th>Encargado</th><th>Inicio</th><th>Días est.</th><th>Obreros</th><th>Estado</th><th></th>
    </tr></thead><tbody>${obras.map(o => `<tr>
      <td><strong>${esc(o.nombre)}</strong></td>
      <td>${esc(o.localidad)}<br><span class="hint">${esc(o.provincia)}</span></td>
      <td>${esc(o.encargado)}</td>
      <td>${o.fecha_inicio || '—'}</td>
      <td>${o.dias_estimados || '—'}</td>
      <td>${o.cant_obreros}</td>
      <td>${o.activa ? '<span class="badge verde">Activa</span>' : '<span class="badge gris">Cerrada</span>'}</td>
      <td style="white-space:nowrap">
        <button class="sec" onclick='editarObra(${o.id})'>Editar</button>
        <button class="sec peligro" onclick='borrarObra(${o.id})'>Borrar</button>
      </td></tr>`).join('')}</tbody></table>`;
  }
  cargarObrasEnSelect('#w-obra');
}

$('#o-guardar').onclick = async () => {
  if (!coords) return alert('Marcá la ubicación de la obra en el mapa.');
  const body = {
    nombre: $('#o-nombre').value.trim(),
    localidad: $('#o-localidad').value.trim(),
    provincia: $('#o-provincia').value,
    encargado: $('#o-encargado').value.trim(),
    lat: coords.lat, lng: coords.lng,
    radio: +$('#o-radio').value || 80,
    fecha_inicio: $('#o-fecha').value || null,
    dias_estimados: +$('#o-dias').value || 0,
  };
  if (!body.nombre || !body.localidad || !body.encargado) return alert('Completá nombre, localidad y encargado.');
  try {
    if (editObraId) { await api(`/api/obras/${editObraId}`, { method: 'PUT', body: JSON.stringify({ ...body, activa: 1 }) }); }
    else { await api('/api/obras', { method: 'POST', body: JSON.stringify(body) }); }
    resetFormObra(); cargarObras();
  } catch (e) { alert(e.message); }
};

window.editarObra = async (id) => {
  const obras = await api('/api/obras');
  const o = obras.find(x => x.id === id); if (!o) return;
  editObraId = id;
  $('#obra-titulo').textContent = 'Editar obra';
  $('#o-nombre').value = o.nombre; $('#o-localidad').value = o.localidad;
  $('#o-provincia').value = o.provincia; $('#o-encargado').value = o.encargado;
  $('#o-fecha').value = o.fecha_inicio || ''; $('#o-dias').value = o.dias_estimados || '';
  $('#o-radio').value = o.radio;
  mapaObra.setView([o.lat, o.lng], 16); fijarObra(o.lat, o.lng);
  $('#o-cancelar').style.display = 'inline-block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
$('#o-cancelar').onclick = resetFormObra;
function resetFormObra() {
  editObraId = null; coords = null;
  $('#obra-titulo').textContent = 'Nueva obra';
  ['o-nombre', 'o-localidad', 'o-encargado', 'o-fecha', 'o-dias', 'o-buscar'].forEach(i => $('#' + i).value = '');
  $('#o-radio').value = 80; $('#o-coords').textContent = '—';
  if (marcador) { mapaObra.removeLayer(marcador); marcador = null; }
  $('#o-cancelar').style.display = 'none';
}
window.borrarObra = async (id) => {
  if (!confirm('¿Borrar la obra y todos sus obreros y registros?')) return;
  await api(`/api/obras/${id}`, { method: 'DELETE' }); cargarObras();
};

async function cargarObrasEnSelect(sel, conTodas) {
  const obras = await api('/api/obras');
  const el = $(sel);
  const prev = el.value;
  el.innerHTML = (conTodas ? '<option value="">Todas</option>' : '') +
    obras.map(o => `<option value="${o.id}">${esc(o.nombre)} · ${esc(o.localidad)}</option>`).join('');
  if (prev) el.value = prev;
}

// ====== OBREROS CRUD ======
let editObreroId = null;
async function cargarObreros() {
  await cargarObrasEnSelect('#w-obra');
  const lista = await api('/api/obreros');
  const cont = $('#tabla-obreros');
  if (!lista.length) { cont.innerHTML = '<div class="vacio">Todavía no cargaste obreros.</div>'; return; }
  cont.innerHTML = `<table><thead><tr>
    <th>Obrero</th><th>DNI</th><th>Obra</th><th>Localidad</th><th>Encargado</th><th>Link del obrero</th><th></th>
  </tr></thead><tbody>${lista.map(w => {
    const link = `${location.origin}/o/${w.token}`;
    return `<tr>
      <td><strong>${esc(w.nombre)}</strong></td>
      <td>${esc(w.dni || '—')}</td>
      <td>${esc(w.obra_nombre)}</td>
      <td>${esc(w.localidad)}</td>
      <td>${esc(w.encargado)}</td>
      <td><div class="linkbox"><span title="${link}">/o/${w.token}</span>
        <button class="sec" onclick="copiar('${link}')">Copiar</button>
        <button class="sec" onclick="waLink('${link}','${esc(w.nombre)}')">WhatsApp</button></div></td>
      <td style="white-space:nowrap">
        <button class="sec" onclick='editarObrero(${w.id})'>Editar</button>
        <button class="sec peligro" onclick='borrarObrero(${w.id})'>Borrar</button>
      </td></tr>`;
  }).join('')}</tbody></table>`;
}

$('#w-guardar').onclick = async () => {
  const body = { nombre: $('#w-nombre').value.trim(), dni: $('#w-dni').value.trim(), obra_id: +$('#w-obra').value };
  if (!body.nombre || !body.obra_id) return alert('Completá el nombre y elegí una obra.');
  try {
    if (editObreroId) await api(`/api/obreros/${editObreroId}`, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/obreros', { method: 'POST', body: JSON.stringify(body) });
    resetFormObrero(); cargarObreros();
  } catch (e) { alert(e.message); }
};
window.editarObrero = async (id) => {
  const lista = await api('/api/obreros'); const w = lista.find(x => x.id === id); if (!w) return;
  editObreroId = id; $('#obrero-titulo').textContent = 'Editar obrero';
  $('#w-nombre').value = w.nombre; $('#w-dni').value = w.dni || ''; $('#w-obra').value = w.obra_id;
  $('#w-cancelar').style.display = 'inline-block';
};
$('#w-cancelar').onclick = resetFormObrero;
function resetFormObrero() {
  editObreroId = null; $('#obrero-titulo').textContent = 'Nuevo obrero';
  $('#w-nombre').value = ''; $('#w-dni').value = ''; $('#w-cancelar').style.display = 'none';
}
window.borrarObrero = async (id) => {
  if (!confirm('¿Borrar este obrero y sus registros?')) return;
  await api(`/api/obreros/${id}`, { method: 'DELETE' }); cargarObreros();
};
window.copiar = (t) => { navigator.clipboard.writeText(t); alert('Link copiado:\n' + t); };
window.waLink = (link, nombre) => {
  const msg = `Hola ${nombre}, este es tu link para marcar entrada y salida en la obra:\n${link}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
};

// ====== ASISTENCIA ======
$('#a-periodo').onchange = aplicarPeriodo;
function aplicarPeriodo() {
  const hoy = new Date(fechaHoy());
  const p = $('#a-periodo').value;
  if (p === 'custom') return;
  let desde, hasta;
  if (p === 'semana') {
    const dia = (hoy.getDay() + 6) % 7;
    desde = new Date(hoy); desde.setDate(hoy.getDate() - dia);
    hasta = new Date(desde); hasta.setDate(desde.getDate() + 6);
  } else {
    if (hoy.getDate() <= 15) { desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1); hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 15); }
    else { desde = new Date(hoy.getFullYear(), hoy.getMonth(), 16); hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0); }
  }
  $('#a-desde').value = iso(desde); $('#a-hasta').value = iso(hasta);
}
const iso = (d) => d.toLocaleDateString('en-CA');

function badgeVerif(v, dist) {
  if (v === 'dentro') return '<span class="badge verde">✔ En obra</span>';
  if (v === 'fuera') return `<span class="badge rojo">✖ Lejos (${dist} m)</span>`;
  return '<span class="badge gris">Sin GPS</span>';
}

$('#a-consultar').onclick = consultarAsistencia;
async function consultarAsistencia() {
  const desde = $('#a-desde').value, hasta = $('#a-hasta').value, obra = $('#a-obra').value;
  if (!desde || !hasta) return alert('Elegí el rango de fechas.');
  const q = new URLSearchParams({ desde, hasta }); if (obra) q.set('obra_id', obra);
  const datos = await api('/api/asistencia?' + q);
  const rep = $('#reporte');
  const obraTxt = obra ? ($('#a-obra').selectedOptions[0].textContent) : 'Todas las obras';

  if (!datos.length) { rep.innerHTML = `<div class="vacio">Sin registros entre ${desde} y ${hasta}.</div>`; return; }

  const porObrero = {};
  datos.forEach(d => {
    const k = d.obrero + '|' + (d.dni || '');
    (porObrero[k] ||= { obrero: d.obrero, dni: d.dni, dias: 0, horas: 0, lejos: 0, filas: [] });
    porObrero[k].filas.push(d);
    if (d.entrada && d.salida) porObrero[k].dias++;
    if (d.horas) porObrero[k].horas += d.horas;
    if (d.verificado === 'fuera') porObrero[k].lejos++;
  });

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div><h2 style="margin:0">Reporte de asistencia</h2>
      <div class="hint">${obraTxt} · ${desde} a ${hasta} · generado ${new Date().toLocaleString('es-AR')}</div></div></div>
      <div class="hint" style="margin-bottom:10px">Verificación de ubicación: <span class="badge verde">✔ En obra</span> el GPS coincide con la obra · <span class="badge rojo">✖ Lejos</span> fichó lejos de la obra · <span class="badge gris">Sin GPS</span> no compartió ubicación.</div>`;

  for (const k in porObrero) {
    const g = porObrero[k];
    html += `<h3 style="margin:18px 0 6px;font-size:15px">${esc(g.obrero)} ${g.dni ? `· DNI ${esc(g.dni)}` : ''}
      <span class="badge verde" style="margin-left:8px">${g.dias} días</span>
      <span class="badge gris">${g.horas.toFixed(1)} hs</span>
      ${g.lejos ? `<span class="badge rojo">⚠ ${g.lejos} fichada(s) lejos</span>` : ''}</h3>
      <table><thead><tr><th>Fecha</th><th>Obra</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Ubicación entrada</th></tr></thead><tbody>
      ${g.filas.map(f => `<tr${f.verificado === 'fuera' ? ' style="background:#fff1f2"' : ''}>
        <td>${diaSemana(f.fecha)} ${f.fecha}</td>
        <td>${esc(f.obra)}</td>
        <td>${f.entrada ? '<span class="badge verde">'+f.entrada+'</span>' : '<span class="badge rojo">falta</span>'}</td>
        <td>${f.salida || '<span class="hint">—</span>'}</td>
        <td>${f.horas != null ? f.horas.toFixed(2) : '—'}</td>
        <td>${f.entrada ? badgeVerif(f.verificado, f.distancia) : '—'}</td></tr>`).join('')}
      </tbody></table>`;
  }
  rep.innerHTML = html;
}
$('#a-imprimir').onclick = () => window.print();

// ====== Utilidades ======
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function diaSemana(f) { return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][new Date(f + 'T12:00:00').getDay()]; }

// ====== MAPA EN VIVO ======
let mapaVivo = null, mvInterval = null;
const iconObrero = (color) => L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
  iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -13]
});
const iconObra = L.divIcon({
  className: '',
  html: `<div style="width:26px;height:26px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px">🏗</div>`,
  iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -15]
});

async function cargarMapaVivo() {
  const datos = await api('/api/mapa-vivo');
  $('#mv-fecha').textContent = datos.fecha;

  const dentroCount = datos.obreros.filter(o => o.tipo === 'entrada').length;
  const totalHoy = datos.obreros.length;
  $('#mv-contador').textContent = `${dentroCount} en obra · ${totalHoy} ficharon hoy`;
  $('#mv-contador').className = 'badge ' + (dentroCount > 0 ? 'verde' : 'gris');

  // Resumen por obra
  const porObra = {};
  datos.obreros.forEach(o => {
    if (!porObra[o.obra]) porObra[o.obra] = { dentro: 0, fuera: 0 };
    o.tipo === 'entrada' ? porObra[o.obra].dentro++ : porObra[o.obra].fuera++;
  });
  $('#mv-resumen').innerHTML = Object.entries(porObra).map(([obra, c]) =>
    `<span style="background:#f1f5f9;border-radius:8px;padding:6px 12px;font-size:13px">
      <strong>${esc(obra)}</strong> — 🟢 ${c.dentro} en obra · 🔴 ${c.fuera} retirado(s)
    </span>`
  ).join('') || '<span class="hint">Sin fichadas hoy todavía.</span>';

  // Limpiar marcadores anteriores excepto tiles
  mapaVivo.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.Circle) mapaVivo.removeLayer(l); });

  const bounds = [];

  // Pines de obras (azul)
  datos.obras.forEach(o => {
    if (!o.lat || !o.lng) return;
    L.marker([o.lat, o.lng], { icon: iconObra })
      .bindPopup(`<b>🏗 ${esc(o.nombre)}</b><br>${esc(o.localidad)}<br><span style="color:#64748b">Encargado: ${esc(o.encargado)}</span>`)
      .addTo(mapaVivo);
    L.circle([o.lat, o.lng], { radius: o.radio, color: '#2563eb', fillColor: '#93c5fd', fillOpacity: 0.2, weight: 1 }).addTo(mapaVivo);
    bounds.push([o.lat, o.lng]);
  });

  // Pines de obreros
  datos.obreros.forEach(o => {
    if (!o.lat || !o.lng) return;
    const dentro = o.tipo === 'entrada';
    const color = dentro ? '#16a34a' : '#dc2626';
    const estado = dentro ? '🟢 En obra' : '🔴 Retirado';
    const distTxt = o.distancia != null ? `${o.distancia} m de la obra` : '';
    L.marker([o.lat, o.lng], { icon: iconObrero(color) })
      .bindPopup(`<b>${esc(o.obrero)}</b><br>${estado}<br><span style="color:#64748b">${esc(o.obra)} · ${esc(o.localidad)}</span><br>Última fichada: <b>${o.hora}</b>${distTxt ? '<br>' + distTxt : ''}`)
      .addTo(mapaVivo);
    bounds.push([o.lat, o.lng]);
  });

  if (bounds.length) mapaVivo.fitBounds(bounds, { padding: [40, 40] });
}

function iniciarMapaVivo() {
  if (!mapaVivo) {
    mapaVivo = L.map('mapa-vivo').setView([-34.65, -58.45], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(mapaVivo);
  }
  setTimeout(() => mapaVivo.invalidateSize(), 100);
  cargarMapaVivo();
  clearInterval(mvInterval);
  mvInterval = setInterval(cargarMapaVivo, 30000); // refresco automático cada 30 seg
}

$('#mv-refrescar').onclick = cargarMapaVivo;

// ====== Init ======
initMapaObra();
cargarObras();
aplicarPeriodo();
