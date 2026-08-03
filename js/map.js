const statusElement = document.querySelector("#map-status");
const categoryButtons = [...document.querySelectorAll("[data-category]")];
const resetMapButton = document.querySelector("#reset-map");
const resourceTotalElement = document.querySelector("#resource-total");
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const timeButtons = [...document.querySelectorAll("[data-minutes]")];
const resourcePanels = [...document.querySelectorAll("[data-resource-panel]")];
const neighborhoodPanels = [...document.querySelectorAll("[data-neighborhood-panel]")];
const accessPanels = [...document.querySelectorAll("[data-access-panel]")];
const clearAccessButton = document.querySelector("#clear-access");
const accessResult = document.querySelector("#access-result");
const reachableTotal = document.querySelector("#reachable-total");
const reachableLabel = document.querySelector("#reachable-label");
const tokenGate = document.querySelector("#token-gate");
const tokenForm = document.querySelector("#token-form");
const tokenInput = document.querySelector("#mapbox-token");

const colors = {
  learn: "#68b7df",
  experience: "#d890db",
  make: "#e3aa62",
  connect: "#c8da69",
};

const emptyCollection = { type: "FeatureCollection", features: [] };
const activeCategories = new Set(categoryButtons.map((button) => button.dataset.category));
let resourceData = null;
let neighborhoodData = null;
let map = null;
let mapMode = "resources";
let accessMinutes = 20;
let accessOrigin = null;
let accessRequest = null;

Object.entries(colors).forEach(([category, color]) => {
  document.querySelectorAll(`[data-access-swatch="${category}"]`).forEach((swatch) => {
    swatch.style.setProperty("--category-color", color);
  });
});

function visibleResourceFeatures() {
  if (!resourceData) return [];
  return resourceData.features.filter((feature) =>
    activeCategories.has(feature.properties.category),
  );
}

function fitToFeatures(features, animate = true) {
  if (!map || !features.length) return;
  const bounds = new mapboxgl.LngLatBounds();
  features.forEach((feature) => bounds.extend(feature.geometry.coordinates));
  map.fitBounds(bounds, {
    padding:
      window.innerWidth < 700
        ? { top: 180, right: 36, bottom: 230, left: 36 }
        : { top: 76, right: 60, bottom: 60, left: 360 },
    maxZoom: 10.5,
    duration: animate ? 650 : 0,
  });
}

function updateFilter() {
  if (!map || !map.getSource("design-resources")) return;
  const features = visibleResourceFeatures();
  map.getSource("design-resources").setData({ type: "FeatureCollection", features });
  if (mapMode === "resources") fitToFeatures(features);
  statusElement.textContent = `${features.length} visible resources · ${activeCategories.size} active categories`;
}

function setLayerVisibility(layer, visible) {
  if (map && map.getLayer(layer)) {
    map.setLayoutProperty(layer, "visibility", visible ? "visible" : "none");
  }
}

function setMapMode(mode) {
  mapMode = mode;
  document.querySelector(".map-shell").classList.toggle("is-access-mode", mode === "access");
  modeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  resourcePanels.forEach((panel) => { panel.hidden = mode !== "resources"; });
  neighborhoodPanels.forEach((panel) => { panel.hidden = mode !== "neighborhoods"; });
  accessPanels.forEach((panel) => { panel.hidden = mode !== "access"; });

  setLayerVisibility("resource-points", mode === "resources" || mode === "access");
  if (map && map.getLayer("resource-points")) {
    map.setPaintProperty("resource-points", "circle-opacity", mode === "access" ? 0.25 : 1);
  }
  setLayerVisibility("neighborhood-fill", mode === "neighborhoods");
  setLayerVisibility("neighborhood-outline", mode === "neighborhoods");
  ["isochrone-fill", "isochrone-outline", "reachable-points", "access-origin"].forEach(
    (layer) => setLayerVisibility(layer, mode === "access"),
  );

  if (!resourceData || !neighborhoodData) return;
  if (mode === "neighborhoods") {
    const analysis = neighborhoodData.analysis;
    fitToFeatures(resourceData.features);
    statusElement.textContent = `${analysis.neighborhoods_with_resources} of ${analysis.neighborhood_total} neighborhoods contain documented resources`;
  } else if (mode === "access") {
    map.getSource("design-resources").setData(resourceData);
    statusElement.textContent = accessOrigin
      ? `Click another starting location or change the walking time`
      : `Choose a walking time, then click a starting location on the map`;
  } else {
    updateFilter();
  }
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point, geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((rings) => {
    if (!pointInRing(point, rings[0])) return false;
    return !rings.slice(1).some((hole) => pointInRing(point, hole));
  });
}

function updateReachableResources(isochrone) {
  const reachable = resourceData.features.filter((feature) =>
    pointInPolygon(feature.geometry.coordinates, isochrone.geometry),
  );
  map.getSource("reachable-resources").setData({ type: "FeatureCollection", features: reachable });
  const counts = { learn: 0, experience: 0, make: 0, connect: 0 };
  reachable.forEach((feature) => { counts[feature.properties.category] += 1; });
  reachableTotal.textContent = reachable.length;
  reachableLabel.textContent = `resources reachable in ${accessMinutes} minutes`;
  Object.entries(counts).forEach(([category, count]) => {
    document.querySelector(`[data-reachable="${category}"]`).textContent = count;
  });
  accessResult.hidden = false;
  clearAccessButton.disabled = false;
  statusElement.textContent = `${reachable.length} documented resources estimated within a ${accessMinutes}-minute walk`;
}

function clearAccess() {
  accessOrigin = null;
  if (accessRequest) accessRequest.abort();
  if (map && map.getSource("walking-isochrone")) {
    map.getSource("walking-isochrone").setData(emptyCollection);
    map.getSource("reachable-resources").setData(emptyCollection);
    map.getSource("access-origin").setData(emptyCollection);
  }
  accessResult.hidden = true;
  clearAccessButton.disabled = true;
  if (mapMode === "access") {
    statusElement.textContent = "Choose a walking time, then click a starting location on the map";
  }
}

async function calculateIsochrone(lngLat) {
  if (accessRequest) accessRequest.abort();
  accessRequest = new AbortController();
  accessOrigin = [lngLat.lng, lngLat.lat];
  map.getSource("access-origin").setData({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: accessOrigin } }],
  });
  map.getSource("walking-isochrone").setData(emptyCollection);
  map.getSource("reachable-resources").setData(emptyCollection);
  accessResult.hidden = true;
  clearAccessButton.disabled = false;
  statusElement.textContent = `Calculating a ${accessMinutes}-minute walking area…`;

  const endpoint = new URL(
    `https://api.mapbox.com/isochrone/v1/mapbox/walking/${lngLat.lng},${lngLat.lat}`,
  );
  endpoint.searchParams.set("contours_minutes", accessMinutes);
  endpoint.searchParams.set("polygons", "true");
  endpoint.searchParams.set("denoise", "1");
  endpoint.searchParams.set("generalize", "40");
  endpoint.searchParams.set("contours_colors", "c8da69");
  endpoint.searchParams.set("access_token", mapboxgl.accessToken);

  try {
    const response = await fetch(endpoint, { signal: accessRequest.signal });
    const result = await response.json();
    if (!response.ok || !result.features?.length) {
      throw new Error(result.message || "No walking area was returned for this location.");
    }
    map.getSource("walking-isochrone").setData(result);
    updateReachableResources(result.features[0]);
  } catch (error) {
    if (error.name === "AbortError") return;
    statusElement.textContent = `Walking analysis unavailable: ${error.message}`;
  }
}

function resourcePopup(feature) {
  const properties = feature.properties;
  const website = properties.website
    ? `<a href="${properties.website}" target="_blank" rel="noreferrer">Visit website</a>`
    : '<span class="popup-note">No website listed in the source data</span>';
  const location = [properties.neighborhood, properties.borough].filter(Boolean).join(" · ");
  const address = properties.address ? `<p>${properties.address}</p>` : "";
  return `<p class="popup-category">${properties.category}</p><h2>${properties.name}</h2><p>${location}</p>${address}<p class="popup-source">Source: ${properties.source}</p>${website}`;
}

async function initializeMap(token) {
  mapboxgl.accessToken = token;
  tokenGate.hidden = true;
  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/dark-v11",
    center: [-73.97, 40.71],
    zoom: 9.7,
    clickTolerance: 6,
    attributionControl: false,
  });
  map.addControl(new mapboxgl.NavigationControl(), "top-right");
  map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

  map.on("load", async () => {
    try {
      const [dataResponse, summaryResponse, neighborhoodResponse] = await Promise.all([
        fetch("data/processed/design-resources.geojson"),
        fetch("data/processed/summary.json"),
        fetch("data/processed/neighborhood-resource-analysis.geojson"),
      ]);
      if (![dataResponse, summaryResponse, neighborhoodResponse].every((response) => response.ok)) {
        throw new Error("One or more project data files could not be loaded.");
      }
      resourceData = await dataResponse.json();
      const summary = await summaryResponse.json();
      neighborhoodData = await neighborhoodResponse.json();

      resourceTotalElement.textContent = summary.total;
      document.querySelector("#neighborhoods-with-resources").textContent = `${neighborhoodData.analysis.neighborhoods_with_resources} / ${neighborhoodData.analysis.neighborhood_total}`;
      document.querySelector("#neighborhood-average").textContent = `${neighborhoodData.analysis.city_average} resources`;
      Object.entries(summary.categories).forEach(([category, count]) => {
        document.querySelector(`[data-count="${category}"]`).textContent = count;
        const bar = document.querySelector(`[data-bar="${category}"]`);
        bar.style.setProperty("--bar-width", `${(count / summary.total) * 100}%`);
        bar.style.setProperty("--category-color", colors[category]);
      });

      map.addSource("neighborhood-analysis", { type: "geojson", data: neighborhoodData });
      map.addSource("walking-isochrone", { type: "geojson", data: emptyCollection });
      map.addSource("design-resources", { type: "geojson", data: resourceData });
      map.addSource("reachable-resources", { type: "geojson", data: emptyCollection });
      map.addSource("access-origin", { type: "geojson", data: emptyCollection });

      map.addLayer({ id: "neighborhood-fill", type: "fill", source: "neighborhood-analysis", layout: { visibility: "none" }, paint: { "fill-color": ["step", ["get", "resource_total"], "#1a2326", 1, "#3b4b42", 3, "#667548", 6, "#9cae55", 11, "#d9e875"], "fill-opacity": ["case", ["==", ["get", "resource_total"], 0], 0.28, 0.78] } });
      map.addLayer({ id: "neighborhood-outline", type: "line", source: "neighborhood-analysis", layout: { visibility: "none" }, paint: { "line-color": "rgba(230, 238, 230, 0.38)", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.45, 13, 1.2] } });
      map.addLayer({ id: "isochrone-fill", type: "fill", source: "walking-isochrone", layout: { visibility: "none" }, paint: { "fill-color": "#c8da69", "fill-opacity": 0.2 } });
      map.addLayer({ id: "isochrone-outline", type: "line", source: "walking-isochrone", layout: { visibility: "none" }, paint: { "line-color": "#dbea78", "line-width": 2 } });
      map.addLayer({ id: "resource-points", type: "circle", source: "design-resources", paint: { "circle-color": ["match", ["get", "category"], "learn", colors.learn, "experience", colors.experience, "make", colors.make, "connect", colors.connect, "#ffffff"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 6, 14, 10], "circle-opacity": 1, "circle-stroke-color": "#0c1115", "circle-stroke-width": 1.5 } });
      map.addLayer({ id: "reachable-points", type: "circle", source: "reachable-resources", layout: { visibility: "none" }, paint: { "circle-color": ["match", ["get", "category"], "learn", colors.learn, "experience", colors.experience, "make", colors.make, "connect", colors.connect, "#ffffff"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 7, 14, 11], "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } });
      map.addLayer({ id: "access-origin", type: "circle", source: "access-origin", layout: { visibility: "none" }, paint: { "circle-radius": 7, "circle-color": "#ffffff", "circle-stroke-color": "#0c1115", "circle-stroke-width": 3 } });

      map.on("click", "resource-points", (event) => {
        if (mapMode !== "resources") return;
        const feature = event.features[0];
        new mapboxgl.Popup({ offset: 10 }).setLngLat(feature.geometry.coordinates).setHTML(resourcePopup(feature)).addTo(map);
      });
      map.on("click", "neighborhood-fill", (event) => {
        if (mapMode !== "neighborhoods") return;
        const p = event.features[0].properties;
        new mapboxgl.Popup({ offset: 8 }).setLngLat(event.lngLat).setHTML(`<p class="popup-category">${p.borough}</p><h2>${p.neighborhood}</h2><div class="neighborhood-popup-grid"><span>Total resources</span><span>${p.resource_total}</span><span>Learn</span><span>${p.learn_count}</span><span>Experience</span><span>${p.experience_count}</span><span>Make</span><span>${p.make_count}</span><span>Connect</span><span>${p.connect_count}</span><span>Share of NYC total</span><span>${p.city_share_pct}%</span></div><p class="popup-source">${p.comparison}</p>`).addTo(map);
      });
      map.on("click", (event) => { if (mapMode === "access") calculateIsochrone(event.lngLat); });
      map.on("mouseenter", "resource-points", () => { if (mapMode === "resources") map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "resource-points", () => { if (mapMode === "resources") map.getCanvas().style.cursor = ""; });
      map.on("mouseenter", "neighborhood-fill", () => { if (mapMode === "neighborhoods") map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "neighborhood-fill", () => { if (mapMode === "neighborhoods") map.getCanvas().style.cursor = ""; });

      fitToFeatures(resourceData.features, false);
      setMapMode("resources");
      statusElement.textContent = `${summary.total} preliminary resources · click a colored point for details`;
    } catch (error) {
      statusElement.textContent = `Map data unavailable: ${error.message}`;
    }
  });

  map.on("error", (event) => {
    if (event.error?.status === 401 || event.error?.status === 403) {
      localStorage.removeItem("designResourcesMapboxToken");
      statusElement.textContent = "The Mapbox token was rejected. Reload to enter another public token.";
    }
  });
}

categoryButtons.forEach((button) => {
  const category = button.dataset.category;
  button.style.setProperty("--category-color", colors[category]);
  button.setAttribute("aria-pressed", "true");
  button.addEventListener("click", () => {
    activeCategories.has(category) ? activeCategories.delete(category) : activeCategories.add(category);
    button.setAttribute("aria-pressed", String(activeCategories.has(category)));
    updateFilter();
  });
});

modeButtons.forEach((button) => button.addEventListener("click", () => setMapMode(button.dataset.mode)));
timeButtons.forEach((button) => button.addEventListener("click", () => {
  accessMinutes = Number(button.dataset.minutes);
  timeButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  if (accessOrigin) calculateIsochrone({ lng: accessOrigin[0], lat: accessOrigin[1] });
}));
clearAccessButton.addEventListener("click", clearAccess);
resetMapButton.addEventListener("click", () => {
  if (mapMode === "access") clearAccess();
  fitToFeatures(visibleResourceFeatures());
});

tokenForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const token = tokenInput.value.trim();
  if (!token.startsWith("pk.")) {
    tokenInput.setCustomValidity("Enter a public Mapbox token beginning with pk.");
    tokenInput.reportValidity();
    return;
  }
  tokenInput.setCustomValidity("");
  localStorage.setItem("designResourcesMapboxToken", token);
  initializeMap(token);
});
tokenInput.addEventListener("input", () => tokenInput.setCustomValidity(""));

const deployedToken = window.DESIGN_RESOURCES_MAPBOX_TOKEN;
const validDeployedToken =
  deployedToken && !deployedToken.startsWith("__") ? deployedToken : null;
const storedToken =
  validDeployedToken || localStorage.getItem("designResourcesMapboxToken");
if (storedToken) {
  initializeMap(storedToken);
} else {
  tokenGate.hidden = false;
  statusElement.textContent = "Enter a public Mapbox token to load the map.";
}
