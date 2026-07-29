const statusElement = document.querySelector("#map-status");
const categoryButtons = [...document.querySelectorAll("[data-category]")];
const activeCategories = new Set(
  categoryButtons.map((button) => button.dataset.category),
);
let resourceData = null;

const colors = {
  learn: "#68b7df",
  experience: "#d890db",
  make: "#e3aa62",
  connect: "#c8da69",
};

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/dark",
  center: [-73.97, 40.71],
  zoom: 9.7,
  attributionControl: false,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(
  new maplibregl.AttributionControl({ compact: true }),
  "bottom-right",
);

function updateFilter() {
  if (!resourceData) return;
  const visibleFeatures = resourceData.features.filter((feature) =>
    activeCategories.has(feature.properties.category),
  );
  map.getSource("design-resources").setData({
    type: "FeatureCollection",
    features: visibleFeatures,
  });
  statusElement.textContent = `${visibleFeatures.length} visible resources · ${activeCategories.size} active categories`;
}

map.on("load", async () => {
  const [dataResponse, summaryResponse] = await Promise.all([
    fetch("data/processed/design-resources.geojson"),
    fetch("data/processed/summary.json"),
  ]);
  resourceData = await dataResponse.json();
  const summary = await summaryResponse.json();

  map.addSource("design-resources", {
    type: "geojson",
    data: resourceData,
    cluster: true,
    clusterMaxZoom: 12,
    clusterRadius: 42,
  });

  map.addLayer({
    id: "resource-clusters",
    type: "circle",
    source: "design-resources",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#dce5e3",
      "circle-opacity": 0.9,
      "circle-radius": ["step", ["get", "point_count"], 15, 20, 20, 60, 26],
      "circle-stroke-color": "#0c1115",
      "circle-stroke-width": 2,
    },
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "design-resources",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 11,
    },
    paint: { "text-color": "#0c1115" },
  });

  map.addLayer({
    id: "resource-points",
    type: "circle",
    source: "design-resources",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "match",
        ["get", "category"],
        "learn",
        colors.learn,
        "experience",
        colors.experience,
        "make",
        colors.make,
        "connect",
        colors.connect,
        "#ffffff",
      ],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 8],
      "circle-stroke-color": "#0c1115",
      "circle-stroke-width": 1.5,
    },
  });

  map.on("click", "resource-points", (event) => {
    const feature = event.features[0];
    const properties = feature.properties;
    const website = properties.website
      ? `<a href="${properties.website}" target="_blank" rel="noreferrer">Visit website</a>`
      : "";
    new maplibregl.Popup({ offset: 10 })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(`
        <p class="popup-category">${properties.category}</p>
        <h2>${properties.name}</h2>
        <p>${properties.neighborhood || properties.borough || ""}</p>
        ${website}
      `)
      .addTo(map);
  });

  map.on("mouseenter", "resource-points", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "resource-points", () => {
    map.getCanvas().style.cursor = "";
  });

  statusElement.textContent = `${summary.total} preliminary resources · review required`;
});

categoryButtons.forEach((button) => {
  const category = button.dataset.category;
  button.style.setProperty("--category-color", colors[category]);
  button.setAttribute("aria-pressed", "true");
  button.addEventListener("click", () => {
    if (activeCategories.has(category)) {
      activeCategories.delete(category);
    } else {
      activeCategories.add(category);
    }
    button.setAttribute(
      "aria-pressed",
      String(activeCategories.has(category)),
    );
    updateFilter();
  });
});
