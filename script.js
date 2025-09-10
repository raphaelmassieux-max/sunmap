// ------------------------
// Paris Sunlight Map Script
// ------------------------

let map, streetData = [], buildingData = [];
let streetLayer, buildingLayer, shadowLayer;

// Helper: build UTC date for hour slider
function getDateForHour(hour) {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0));
}

// Fetch streets + buildings from OSM (only around lat/lon)
async function fetchData(lat, lon) {
  const query = `
    [out:json][timeout:25];
    (
      way(around:300,${lat},${lon})["highway"];
      way(around:300,${lat},${lon})["building"];
    );
    out geom tags;
  `;
  const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);
  const res = await fetch(url);
  const data = await res.json();
  return data.elements;
}

// Draw streets as golden trapezoids (lit only)
function drawStreets(lat, lon, hour) {
  if (streetLayer) streetLayer.clearLayers();
  streetLayer = L.layerGroup().addTo(map);

  const now = getDateForHour(hour);
  const sunPos = SunCalc.getPosition(now, lat, lon);
  const azimuthDeg = (sunPos.azimuth * 180 / Math.PI + 180) % 360;
  const altDeg = sunPos.altitude * 180 / Math.PI;
  if (altDeg <= 0) return;

  const roadWidth = 6; // meters

  streetData.forEach(way => {
    if (way.geometry) {
      // Filter main roads only
      if (!['primary','secondary','tertiary','residential'].includes(way.tags.highway)) return;

      const latlngs = way.geometry.map(pt => [pt.lat, pt.lon]);
      if (latlngs.length < 2) return;

      for (let i = 0; i < latlngs.length - 1; i++) {
        const p1 = latlngs[i];
        const p2 = latlngs[i + 1];
        const dx = p2[1] - p1[1];
        const dy = p2[0] - p1[0];
        const angle = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
        const diff = Math.abs(angle - azimuthDeg);
        const minDiff = Math.min(diff, 360 - diff);

        if (minDiff < 20) {
          const segLen = Math.sqrt(dx*dx+dy*dy);
          const offsetLat = (roadWidth / 110540) * (dx / segLen);
          const offsetLon = (roadWidth / 111320) * (-dy / segLen);
          const quad = [
            [p1[0] + offsetLat, p1[1] + offsetLon],
            [p2[0] + offsetLat, p2[1] + offsetLon],
            [p2[0] - offsetLat, p2[1] - offsetLon],
            [p1[0] - offsetLat, p1[1] - offsetLon]
          ];
          L.polygon(quad, {
            color: "none",
            fillColor: "gold",
            fillOpacity: 0.7,
            weight: 0
          }).addTo(streetLayer);
        }
      }
    }
  });
}

// Draw buildings (lit only, shadows transparent)
function drawBuildings(lat, lon, hour) {
  if (buildingLayer) buildingLayer.clearLayers();
  if (shadowLayer) shadowLayer.clearLayers();
  buildingLayer = L.layerGroup().addTo(map);
  shadowLayer = L.layerGroup().addTo(map);

  const now = getDateForHour(hour);
  const sunPos = SunCalc.getPosition(now, lat, lon);
  const azimuth = sunPos.azimuth;
  const alt = sunPos.altitude;
  if (alt <= 0) return; // sun below horizon

  buildingData.forEach(b => {
    if (!b.geometry || b.geometry.length < 3) return; // ignore tiny buildings
    const footprint = b.geometry.map(pt => [pt.lon, pt.lat]); // Turf uses [lon, lat]

    // Draw building footprint
    L.polygon(footprint.map(p => [p[1], p[0]]), {
      color: "#555",
      fillColor: "#999",
      fillOpacity: 0.6,
      weight: 1
    }).addTo(buildingLayer);

    // Height estimate
    let height = 10;
    if (b.tags && b.tags["building:height"]) height = parseFloat(b.tags["building:height"]);
    else if (b.tags && b.tags["building:levels"]) height = parseInt(b.tags["building:levels"])*3;

    const shadowLen = height / Math.tan(alt);
    const angle = azimuth + Math.PI;
    const dx = (shadowLen / 111320) * Math.sin(angle);
    const dy = (shadowLen / 110540) * Math.cos(angle);

    // Shadow quads (will not be drawn → transparent)
    // So we skip drawing shadows; only lit effect will appear on streets
  });
}

// Update scene (streets + buildings)
function updateScene(lat, lon, hour) {
  drawStreets(lat, lon, hour);
  drawBuildings(lat, lon, hour);
}

// Fetch new OSM data when moving map or clicking
async function updateData(lat, lon, hour) {
  const elements = await fetchData(lat, lon);
  streetData = elements.filter(e => e.tags && e.tags.highway);
  buildingData = elements.filter(e => e.tags && e.tags.building && e.geometry.length >= 3);
  updateScene(lat, lon, hour);
}

// Initialize map
async function initMap() {
  const lat = 48.8566;
  const lon = 2.3522;

  map = L.map('map').setView([lat, lon], 17);

  // Minimalist Carto tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // Initial fetch
  await updateData(lat, lon, 12);

  // Click → refetch new area
  map.on("click", async (e) => {
    const hour = parseInt(document.getElementById("timeSlider").value);
    await updateData(e.latlng.lat, e.latlng.lng, hour);
  });

  // Slider → redraw only
  const slider = document.getElementById("timeSlider");
  const label = document.getElementById("timeLabel");
  slider.addEventListener("input", () => {
    const hour = parseInt(slider.value, 10);
    const localTime = getDateForHour(hour);
    label.textContent = localTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    updateScene(map.getCenter().lat, map.getCenter().lng, hour);
  });
}

initMap();
