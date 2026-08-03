# Design Resources NYC

An interactive web map documenting the concentration and variety of design-related resources across New York City.

The project begins with New York as a case study. A later phase can apply the same method to cities or regions with fewer resources, allowing comparison of how access to design education, cultural institutions, fabrication spaces, and professional communities varies geographically.

## Categories

- **Learn** — design schools, programs, libraries, and educational resources
- **Experience** — museums, galleries, archives, and cultural institutions
- **Make** — makerspaces, fabrication labs, workshops, and shared facilities
- **Connect** — organizations, communities, and recurring design programs

## Course-method connection

This project expands the course assignments on loading and visualizing spatial data, geoprocessing, and web-map visualization:

1. Public spatial data is collected and preserved in `data/raw`.
2. Python will clean, verify, categorize, and spatially join resources to NYC neighborhoods.
3. Map-ready GeoJSON will be written to `data/processed`.
4. JavaScript and Mapbox GL JS render the interactive map and request walking
   isochrones from the Mapbox Navigation API.

## Analytical purpose

The project asks: **How evenly are design-related resources distributed across
New York City?**

The website has three map modes:

- **Resources** shows individual documented locations by category.
- **Neighborhoods** aggregates those locations into the 262 NYC Neighborhood
  Tabulation Areas and maps their concentration.
- **Walking access** lets a viewer choose a 10-, 20-, or 30-minute walk and
  click a starting location. The street-network isochrone highlights and counts
  the documented resources estimated to be reachable within that time.

The neighborhood workflow is a spatial join implemented in
`scripts/process_data.py`. For every neighborhood, it calculates the total and
category-specific resource counts, share of the citywide inventory, and
difference from the NYC neighborhood average. The output is
`data/processed/neighborhood-resource-analysis.geojson`.

The analysis measures the geographic concentration of documented locations. It
does not measure affordability, eligibility, quality, capacity, opening hours,
or whether a resource is publicly accessible.

The walking analysis requires a public Mapbox access token. The interface asks
for the token when the map opens and stores it only in that browser's local
storage; no token is committed to the repository. Isochrones represent estimated
network travel time and do not account for opening hours, cost, eligibility,
capacity, or all real-world pedestrian conditions.

## Project structure

```text
design-resources-nyc/
├── index.html
├── css/style.css
├── js/map.js
├── data/raw/
├── data/processed/
├── notebooks/
├── scripts/
├── documentation/
└── assets/
```

## Local preview

Open the project in VS Code and use the Live Server extension, or run:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Data attribution

Data sources include NYC Open Data, the NYC Department of City Planning, the NYC Department of Cultural Affairs, and OpenStreetMap contributors. See `documentation/sources.md`.
