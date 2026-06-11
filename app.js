const map = L.map("map", {
  worldCopyJump: false,
  maxBounds: [[-60, -95], [-15, -45]],
  maxBoundsViscosity: 1.0
}).setView([-33.45, -70.66], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  noWrap: true,
  attribution: "© OpenStreetMap"
}).addTo(map);

const resultado = document.getElementById("resultado");
let marcadorUsuario = null;
let capasZonas = [];
const grupos = {};

const configCapas = [
  { archivo: "data/p.geojson", nombre: "Zonas Prohibidas (P)", color: "#d00000", tipo: "zona" },
  { archivo: "data/r.geojson", nombre: "Zonas Restringidas (R)", color: "#ff8800", tipo: "zona" },
  { archivo: "data/d.geojson", nombre: "Zonas Peligrosas (D)", color: "#d6b000", tipo: "zona" },
  { archivo: "data/aerodromo.geojson", nombre: "Aeródromos", color: "#2b7bff", tipo: "punto" },
  { archivo: "data/pista.geojson", nombre: "Pistas chicas", color: "#444444", tipo: "punto" }
];

const controlCapas = L.control.layers(null, null, { collapsed: false }).addTo(map);

function popupFeature(feature) {
  const p = feature.properties || {};
  return `
    <strong>${p.n || "Sin nombre"}</strong><br>
    <span class="etiqueta-zona">Categoría:</span> ${p.c || ""}<br>
    ${p.d ? `<span class="etiqueta-zona">Detalle:</span> ${p.d}<br>` : ""}
    <span class="etiqueta-zona">Fuente:</span> DGAC
  `;
}

function estiloZona(color) {
  return {
    color,
    weight: 2,
    fillOpacity: 0.22
  };
}

function crearIcono(color) {
  return L.circleMarker([0, 0], {
    radius: 6,
    color,
    fillColor: color,
    fillOpacity: 0.85,
    weight: 1
  });
}

async function cargarGeoJSON() {
  let total = 0;
  let bounds = null;

  for (const cfg of configCapas) {
    const resp = await fetch(cfg.archivo);
    const geojson = await resp.json();
    total += geojson.features.length;

    let capa;

    if (cfg.tipo === "punto") {
      capa = L.geoJSON(geojson, {
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
          radius: 5,
          color: cfg.color,
          fillColor: cfg.color,
          fillOpacity: 0.85,
          weight: 1
        }),
        onEachFeature: (feature, layer) => layer.bindPopup(popupFeature(feature))
      });
    } else {
      capa = L.geoJSON(geojson, {
        style: () => estiloZona(cfg.color),
        onEachFeature: (feature, layer) => layer.bindPopup(popupFeature(feature))
      });
      capasZonas.push(capa);
    }

    grupos[cfg.nombre] = capa;
    capa.addTo(map);
    controlCapas.addOverlay(capa, cfg.nombre);

    if (capa.getBounds && capa.getBounds().isValid()) {
      bounds = bounds ? bounds.extend(capa.getBounds()) : capa.getBounds();
    }
  }

  if (bounds) map.fitBounds(bounds, { padding: [20, 20] });
  resultado.textContent = `Capas DGAC optimizadas cargadas correctamente (${total} elementos).`;
}

function puntoEnZona(latlng) {
  const punto = turfPoint([latlng.lng, latlng.lat]);
  const hallazgos = [];

  capasZonas.forEach(capa => {
    capa.eachLayer(layer => {
      const f = layer.feature;
      if (!f) return;

      const geomType = f.geometry?.type;
      if (!["Polygon", "MultiPolygon"].includes(geomType)) return;

      if (booleanPointInPolygon(punto, f)) {
        hallazgos.push(f.properties);
      }
    });
  });

  return hallazgos;
}

// Funciones simples para evitar cargar Turf completo.
function turfPoint(coords) {
  return { type: "Feature", geometry: { type: "Point", coordinates: coords } };
}

function booleanPointInPolygon(point, polygonFeature) {
  const x = point.geometry.coordinates[0];
  const y = point.geometry.coordinates[1];
  const geom = polygonFeature.geometry;

  if (geom.type === "Polygon") return inPolygon([x, y], geom.coordinates);
  if (geom.type === "MultiPolygon") return geom.coordinates.some(poly => inPolygon([x, y], poly));
  return false;
}

function inPolygon(point, polygon) {
  let inside = false;
  const ring = polygon[0];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > point[1]) !== (yj > point[1])) &&
      (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function mostrarResultado(lat, lng, textoBase) {
  const hallazgos = puntoEnZona({ lat, lng });

  if (!hallazgos.length) {
    resultado.innerHTML = `<span class="alerta-ok">🟢 Sin coincidencia con zonas P/R/D cargadas.</span> ${textoBase}`;
    return;
  }

  const prioridad = { P: 1, R: 2, D: 3 };
  hallazgos.sort((a, b) => (prioridad[a.c] || 9) - (prioridad[b.c] || 9));

  const principal = hallazgos[0];
  const clase = principal.c === "P" ? "alerta-p" : principal.c === "R" ? "alerta-r" : "alerta-d";
  const icono = principal.c === "P" ? "🔴" : principal.c === "R" ? "🟠" : "🟡";

  resultado.innerHTML = `<span class="${clase}">${icono} Punto dentro de zona ${principal.c}: ${principal.n || "Sin nombre"}</span>. ${textoBase}`;
}

function ponerMarcador(lat, lng, popup) {
  if (marcadorUsuario) map.removeLayer(marcadorUsuario);
  marcadorUsuario = L.marker([lat, lng]).addTo(map).bindPopup(popup).openPopup();
  map.setView([lat, lng], 15);
  mostrarResultado(lat, lng, `Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
}

document.getElementById("btnUbicacion").addEventListener("click", () => {
  if (!navigator.geolocation) {
    resultado.textContent = "Este dispositivo no permite obtener ubicación.";
    return;
  }

  resultado.textContent = "Obteniendo ubicación...";

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      ponerMarcador(lat, lng, `Su ubicación aproximada:<br>${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    },
    () => resultado.textContent = "No fue posible obtener la ubicación."
  );
});

document.getElementById("btnBuscar").addEventListener("click", buscar);
document.getElementById("busqueda").addEventListener("keydown", e => {
  if (e.key === "Enter") buscar();
});

async function buscar() {
  const q = document.getElementById("busqueda").value.trim();

  if (!q) {
    resultado.textContent = "Ingrese una comuna, dirección o coordenadas.";
    return;
  }

  const coords = q.split(",").map(x => parseFloat(x.trim()));

  if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
    ponerMarcador(coords[0], coords[1], `Punto consultado:<br>${coords[0]}, ${coords[1]}`);
    return;
  }

  resultado.textContent = "Buscando ubicación...";

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q + ", Chile")}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.length) {
      resultado.textContent = "No se encontró la ubicación.";
      return;
    }

    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);

    ponerMarcador(lat, lon, data[0].display_name);
  } catch (error) {
    console.error(error);
    resultado.textContent = "Error al buscar la ubicación.";
  }
}

document.getElementById("btnGuia").addEventListener("click", () => {
  document.getElementById("modalGuia").style.display = "block";
});

document.getElementById("cerrarGuia").addEventListener("click", () => {
  document.getElementById("modalGuia").style.display = "none";
});

document.getElementById("modalGuia").addEventListener("click", (e) => {
  if (e.target.id === "modalGuia") {
    document.getElementById("modalGuia").style.display = "none";
  }
});
cargarGeoJSON().catch(err => {
  console.error(err);
  resultado.textContent = "Error al cargar las capas GeoJSON optimizadas.";
});
