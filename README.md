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
4. JavaScript and MapLibre GL JS will render an interactive web map.

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

