const map = L.map('map').setView([-33.45, -70.66], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

const colores = { P:'#b71c1c', R:'#e67e22', D:'#f1c40f', AERODROMO:'#1565c0', PISTA:'#455a64', OTRO:'#00796b' };
const layerGroups = {};
const featureStore = [];
let markerConsulta = null;

function estilo(feature){
  const t = feature.properties.tipo || 'OTRO';
  return { color: colores[t] || colores.OTRO, weight: 2, fillOpacity: 0.18 };
}
function pointStyle(feature, latlng){
  const t = feature.properties.tipo || 'OTRO';
  return L.circleMarker(latlng, { radius: 6, color: colores[t] || colores.OTRO, fillOpacity: .85 });
}
function popup(feature){
  const p = feature.properties;
  return `<b>${p.nombre || 'Sin nombre'}</b><br><b>Tipo:</b> ${p.tipo || 'N/D'}<br><small>${(p.descripcion || '').replaceAll('\n','<br>')}</small>`;
}

async function cargarGeoJSON(){
  const resp = await fetch('data/zonas_dgac.geojson');
  if(!resp.ok) throw new Error('No se pudo cargar data/zonas_dgac.geojson');
  const data = await resp.json();
  data.features.forEach(f => featureStore.push(f));
  const gj = L.geoJSON(data, { style: estilo, pointToLayer: pointStyle, onEachFeature: (f,l)=>l.bindPopup(popup(f)) });
  gj.eachLayer(l => {
    const t = l.feature?.properties?.tipo || 'OTRO';
    if(!layerGroups[t]) layerGroups[t] = L.layerGroup().addTo(map);
    layerGroups[t].addLayer(l);
  });
}

function setResultado(html, clase='neutral'){
  const box = document.getElementById('resultado');
  box.className = `resultado ${clase}`;
  box.innerHTML = html;
}
function consultarPunto(lat, lng){
  const pt = turf.point([lng, lat]);
  const hits = featureStore.filter(f => {
    if(!f.geometry) return false;
    const type = f.geometry.type;
    if(type.includes('Polygon')) return turf.booleanPointInPolygon(pt, f);
    if(type.includes('LineString')) return turf.pointToLineDistance(pt, f, {units:'kilometers'}) <= 0.2;
    if(type === 'Point' || type === 'MultiPoint') return turf.distance(pt, f, {units:'kilometers'}) <= 1.0;
    return false;
  });
  if(markerConsulta) map.removeLayer(markerConsulta);
  markerConsulta = L.marker([lat,lng]).addTo(map).bindPopup('Punto consultado').openPopup();
  map.setView([lat,lng], 14);
  const prioridad = {P:1,R:2,D:3,AERODROMO:4,PISTA:5,OTRO:9};
  hits.sort((a,b)=>(prioridad[a.properties.tipo]||9)-(prioridad[b.properties.tipo]||9));
  if(!hits.length){ setResultado(`🟢 <b>Fuera de zonas P/R/D detectadas</b><br>Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 'ok'); return; }
  const principal = hits[0].properties;
  const clase = principal.tipo === 'P' ? 'bad' : 'warn';
  setResultado(`⚠️ <b>Coincidencia encontrada</b><br><b>${principal.nombre || 'Zona DGAC'}</b><br>Tipo: ${principal.tipo}<br>Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, clase);
}

async function buscarTexto(q){
  const coord = q.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if(coord){ consultarPunto(parseFloat(coord[1]), parseFloat(coord[2])); return; }
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&q=${encodeURIComponent(q)}`;
  const r = await fetch(url);
  const data = await r.json();
  if(!data.length){ setResultado('No encontré la dirección o comuna consultada.', 'bad'); return; }
  consultarPunto(parseFloat(data[0].lat), parseFloat(data[0].lon));
}

document.getElementById('btnSearch').addEventListener('click', ()=>{
  const q = document.getElementById('searchInput').value.trim();
  if(q) buscarTexto(q);
});
document.getElementById('btnLocate').addEventListener('click', ()=>{
  navigator.geolocation.getCurrentPosition(
    pos => consultarPunto(pos.coords.latitude, pos.coords.longitude),
    () => setResultado('No fue posible obtener la ubicación. Revise permisos del navegador.', 'bad'),
    { enableHighAccuracy:true, timeout:10000 }
  );
});
document.querySelectorAll('[data-layer]').forEach(chk=>chk.addEventListener('change', e=>{
  const t=e.target.dataset.layer, g=layerGroups[t];
  if(!g) return;
  e.target.checked ? g.addTo(map) : map.removeLayer(g);
}));

L.control({position:'bottomright'}).onAdd = function(){
  const div=L.DomUtil.create('div','legend');
  div.innerHTML=`<b>Capas</b><br><span class="dot" style="background:${colores.P}"></span>Prohibida<br><span class="dot" style="background:${colores.R}"></span>Restringida<br><span class="dot" style="background:${colores.D}"></span>Peligrosa<br><span class="dot" style="background:${colores.AERODROMO}"></span>Aeródromo`;
  return div;
}.addTo(map);

cargarGeoJSON().then(()=>setResultado('Base DGAC cargada. Consulte una ubicación.', 'neutral')).catch(err=>setResultado(err.message, 'bad'));
