# Adaptive Thermostat Card

This is the Lovelace card for the [Adaptive Thermostat integration](https://github.com/Horia73/adaptive_thermostat).

## Installation

1. Ensure you have [HACS (Home Assistant Community Store)](https://hacs.xyz/) installed.
2. Add this repository (`https://github.com/<YourGitHubUsername>/adaptive-thermostat-card`) as a custom repository in HACS under the "Frontend" category.
3. Search for "Adaptive Thermostat Card" in HACS and install it.
4. If Home Assistant doesn't automatically add it, add the resource to your Lovelace configuration:
   Go to **Settings -> Dashboards -> (three dots menu) -> Resources -> Add Resource**.
   - URL: `/hacsfiles/adaptive-thermostat-card/adaptive-thermostat-card.js`
   - Resource Type: `JavaScript Module`

## Usage

This card will be used automatically by the Adaptive Thermostat integration or can be added manually to your Lovelace dashboards if needed.
