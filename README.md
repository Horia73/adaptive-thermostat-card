# Adaptive Thermostat Card

This is the Lovelace card for the [Adaptive Thermostat integration](https://github.com/Horia73/adaptive_thermostat).

## Features

- Compact temperature/humidity/outdoor readout with target setpoint and preset control.
- Collapsible **History** section with a combined chart overlaying current temperature,
  target temperature, and humidity on a single graph (dual °C / % axes, hover readout,
  12h / 24h / 3d ranges). Humidity is read from the climate entity's `humidity_sensor`
  attribute, so it appears automatically when a humidity sensor is configured.
  - **Heating bands:** every period where the climate entity's `hvac_action` was
    `heating` (or `zone_heater_on` was true, on integration versions without
    `hvac_action`) is drawn as a translucent orange band behind the lines, with a solid
    strip along the bottom edge. Bands are at least 2 px wide, so 2–3 minute bursts stay
    visible on the 24h and 3d axes; a burst that is still running extends to now.
  - Hover or tap a band to see its start, end and length, e.g.
    `Heating: 14:24–14:27 · 2 min 40 s`. On touch screens the tooltip stays open until you
    tap somewhere else.
  - The legend adds a **Heating** total for the visible range, e.g.
    `Heating 2 h 32 min · 26×`.
  - History is fetched with attributes and `significant_changes_only: false`, so
    attribute-only changes (heating on/off) are not lost. Results are cached for 60 s and
    range changes are debounced, so quickly switching 12h / 24h / 3d doesn't send a
    request per tap.
- Status pill: **On • Heating** while heating; **On • Coasting** when the zone is idle
  but still giving off heat from the last burst (`heat_flowing` is true,
  `cycle_tail_duration_s` > 0, or `control_reason` is *predicted peak reaches target* /
  *waiting for tail*). In that case it also shows the predicted peak, e.g. *peak 23.0°*.
  Otherwise **On • Idle**.
- Responsive controls while Home Assistant is busy:
  - Rapid **+ / −** taps update the displayed target instantly but send a single
    `climate.set_temperature` with the final value ~0.7 s after the last tap. The
    display keeps the pending value until HA reports it (or 15 s pass), so slow or
    stale updates don't make it jump back.
  - **Power** and **preset** changes show immediately with a pulsing *pending* style
    (“Turning on…”), ignore repeated taps until HA confirms (or 15 s pass), and revert
    with a short error message if the service call fails.
- Alert rows: window open (with dismiss), valve error (`valve_error`), and a **fault**
  row driven by the integration's `fault` (`sensor_stale`, `sensor_unavailable`,
  `valve_mismatch`, `valve_unavailable`, `central_unavailable`) and `fault_message`
  attributes. Older integration versions without these attributes simply show no
  fault row.

Heating start/stop also shows up in the entity's **Activity** (logbook) feed — this is
provided by the integration (v1.1.6+), not the card.

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
