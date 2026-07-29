const statusElement = document.querySelector("#map-status");

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

map.on("load", () => {
  statusElement.textContent =
    "Base map loaded. Processed resource layers will be added next.";
});

document.querySelectorAll("[data-category]").forEach((button) => {
  button.setAttribute("aria-pressed", "true");
  button.addEventListener("click", () => {
    const isActive = button.getAttribute("aria-pressed") === "true";
    button.setAttribute("aria-pressed", String(!isActive));
  });
});

