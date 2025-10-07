const LitElement = Object.getPrototypeOf(
  customElements.get("ha-panel-lovelace")
);
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class AdaptiveThermostatCard extends LitElement {
  constructor() {
    super();
    this._presetMenuOpen = false;
    this._handleOutsideClick = this._handleOutsideClick.bind(this);
  }

  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object }
    };
  }

  static getConfigElement() {
    return document.createElement("adaptive-thermostat-card-editor");
  }

  static getStubConfig(hass) {
    // Find the first climate entity
    const climateEntities = Object.keys(hass.states)
      .filter(entityId => entityId.startsWith('climate.'));
    
    return { 
      entity: climateEntities.length > 0 ? climateEntities[0] : '',
      name: "" 
    };
  }

  setConfig(config) {
    if (!config.entity || !config.entity.startsWith('climate.')) {
      throw new Error('Please specify a climate entity');
    }
    this.config = config;
  }

  // Improve temperature changes to be less laggy
  _increaseTemperature(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const entityId = this.config.entity;
    const climate = this.hass.states[entityId];
    
    // If climate has no temperature attribute, set a default
    let currentTemp = climate.attributes.temperature;
    if (currentTemp === undefined) {
      currentTemp = climate.attributes.current_temperature || 20;
    }
    
    const increment = 0.1;
    const newTemp = currentTemp + increment;
    
    // If climate is on, use standard service call
    if (climate.state !== 'off') {
      this.hass.callService('climate', 'set_temperature', {
        entity_id: entityId,
        temperature: newTemp
      });
    } else {
      // If climate is off, update temperature attribute directly
      this.hass.callService('climate', 'set_temperature', {
        entity_id: entityId,
        temperature: newTemp
      });
      // The above still works for many climate integrations even when off
      // The key is NOT calling set_hvac_mode which would turn it on
    }
  }

  _decreaseTemperature(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const entityId = this.config.entity;
    const climate = this.hass.states[entityId];
    
    // If climate has no temperature attribute, set a default
    let currentTemp = climate.attributes.temperature;
    if (currentTemp === undefined) {
      currentTemp = climate.attributes.current_temperature || 20;
    }
    
    const decrement = 0.1;
    const newTemp = currentTemp - decrement;
    
    // If climate is on, use standard service call
    if (climate.state !== 'off') {
      this.hass.callService('climate', 'set_temperature', {
        entity_id: entityId,
        temperature: newTemp
      });
    } else {
      // If climate is off, update temperature attribute directly
      this.hass.callService('climate', 'set_temperature', {
        entity_id: entityId,
        temperature: newTemp
      });
      // The above still works for many climate integrations even when off
      // The key is NOT calling set_hvac_mode which would turn it on
    }
  }

  // Handle preset mode changes
  _setPreset(preset) {
    const entityId = this.config.entity;
    
    // Don't turn off for any preset, just set the preset mode
    this.hass.callService('climate', 'set_preset_mode', {
      entity_id: entityId,
      preset_mode: preset
    });
  }

  _getPresetIcon(preset) {
    switch (preset.toLowerCase()) {
      case 'home':
        return 'mdi:home';
      case 'away':
        return 'mdi:account-arrow-right';
      case 'sleep':
        return 'mdi:sleep';
      case 'eco':
      case 'economy':
        return 'mdi:leaf';
      case 'boost':
      case 'turbo':
        return 'mdi:rocket-launch';
      case 'comfort':
        return 'mdi:sofa';
      case 'auto':
      case 'automatic':
        return 'mdi:thermostat-auto';
      case 'manual':
        return 'mdi:hand-back-right';
      case 'none':
      case 'off':
        return 'mdi:power-off';
      case 'heat':
        return 'mdi:fire';
      case 'cool':
        return 'mdi:snowflake';
      default:
        return 'mdi:thermostat-box';
    }
  }

  _formatPresetName(preset) {
    return preset.charAt(0).toUpperCase() + preset.slice(1);
  }

  _handleCardClick(e) {
    const interactiveSelectors = [
      'button',
      'ha-icon',
      '.metric-control',
      '.action-button',
      '.preset-menu',
      '.preset-dropdown',
      '.preset-option'
    ];

    if (interactiveSelectors.some(selector => e.target.closest(selector))) {
      return;
    }

    // Fire the more-info event to open the entity popup
    const entityId = this.config.entity;
    const event = new CustomEvent('hass-more-info', {
      detail: { entityId },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  render() {
    if (!this.config || !this.hass) {
      return html`<ha-card><div class="loading">Loading...</div></ha-card>`;
    }

    const entityId = this.config.entity;
    const climate = this.hass.states[entityId];
    
    if (!climate) {
      return html`
        <ha-card>
          <div class="warning">Entity ${entityId} not found.</div>
        </ha-card>
      `;
    }

    const name = this.config.name || climate.attributes.friendly_name || '';
    const isOn = climate.state !== 'off';
    const isHeating = isOn && climate.attributes.hvac_action === 'heating';
    const currentTemp = climate.attributes.current_temperature;
    const targetTemp = climate.attributes.temperature;
    const currentPreset = climate.attributes.preset_mode;
    const presets = climate.attributes.preset_modes || [];

    // Get related sensor entity IDs from climate attributes
    const humiditySensorId = climate.attributes.humidity_sensor;
    const outdoorSensorId = climate.attributes.outdoor_sensor;
    // Only get sensor states if the sensors are configured and exist
    const humiditySensor = humiditySensorId && this.hass.states[humiditySensorId] 
                           ? this.hass.states[humiditySensorId] : null;
    const outdoorSensor = outdoorSensorId && this.hass.states[outdoorSensorId]
                          ? this.hass.states[outdoorSensorId] : null;

    const humidityKnown = humiditySensor && humiditySensor.state &&
      humiditySensor.state !== 'unknown' && humiditySensor.state !== 'unavailable';
    const outdoorKnown = outdoorSensor && outdoorSensor.state &&
      outdoorSensor.state !== 'unknown' && outdoorSensor.state !== 'unavailable';
    const orderedPresets = presets.length ? this._getOrderedPresets(presets) : [];
    const activePreset = currentPreset && currentPreset !== 'none' ? currentPreset : null;
    const presetLabel = activePreset ? this._formatPresetName(activePreset) : 'Preset';
    const presetIcon = activePreset ? this._getPresetIcon(activePreset) : 'mdi:shape-outline';

    if (!orderedPresets.length && this._presetMenuOpen) {
      this._presetMenuOpen = false;
      document.removeEventListener('click', this._handleOutsideClick, true);
    }

    return html`
      <ha-card @click="${this._handleCardClick}">
        <div class="card-content">
          <div class="top-row">
            <div class="info-block">
              <div class="name">${name}</div>
              <div class="power-status ${isOn ? 'on' : 'off'}">
                ${isOn
                  ? html`<span>${isHeating ? 'Heating' : 'On'}</span>`
                  : html`<span>Off</span>`}
              </div>
            </div>
            <div class="metrics-grid">
              <div class="metric">
                <div class="metric-label">Indoor</div>
                <div class="metric-value">
                  ${currentTemp !== undefined
                    ? html`${currentTemp}<span class="metric-unit">°</span>`
                    : html`--<span class="metric-unit">°</span>`}
                </div>
              </div>
              <div class="metric target-metric">
                <button class="metric-control" @click="${this._decreaseTemperature}">
                  <ha-icon icon="mdi:minus"></ha-icon>
                </button>
                <div class="target-value">
                  <div class="metric-label">Target</div>
                  <div class="metric-value">
                    ${targetTemp !== undefined
                      ? html`${targetTemp}<span class="metric-unit">°</span>`
                      : html`--<span class="metric-unit">°</span>`}
                  </div>
                </div>
                <button class="metric-control" @click="${this._increaseTemperature}">
                  <ha-icon icon="mdi:plus"></ha-icon>
                </button>
              </div>
              <div class="metric">
                <div class="metric-label">Humidity</div>
                <div class="metric-value">
                  ${humidityKnown
                    ? html`${humiditySensor.state}<span class="metric-unit">%</span>`
                    : html`--<span class="metric-unit">%</span>`}
                </div>
              </div>
              <div class="metric">
                <div class="metric-label">Outdoor</div>
                <div class="metric-value">
                  ${outdoorKnown
                    ? html`${outdoorSensor.state}<span class="metric-unit">°</span>`
                    : html`--<span class="metric-unit">°</span>`}
                </div>
              </div>
            </div>
          </div>
          <div class="bottom-row">
            <button
              class="action-button toggle-button ${isOn ? 'active' : ''}"
              @click="${this._togglePower}"
            >
              <ha-icon icon="${isOn ? 'mdi:fire' : 'mdi:power'}"></ha-icon>
              <span>${isOn ? (isHeating ? 'Heating' : 'On') : 'Off'}</span>
            </button>
            <div class="preset-menu ${this._presetMenuOpen ? 'open' : ''}">
              <button
                class="action-button preset-button ${activePreset ? 'active' : ''}"
                @click="${this._togglePresetMenu}"
                ?disabled=${!orderedPresets.length}
              >
                <ha-icon icon="${presetIcon}"></ha-icon>
                <span>${presetLabel}</span>
                <ha-icon class="chevron" icon="${this._presetMenuOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
              </button>
              ${this._presetMenuOpen && orderedPresets.length ? html`
                <div class="preset-dropdown">
                  ${orderedPresets.map(preset => html`
                    <button
                      class="preset-option ${currentPreset === preset ? 'active' : ''}"
                      @click="${e => this._handlePresetSelect(e, preset)}"
                    >
                      <ha-icon icon="${this._getPresetIcon(preset)}"></ha-icon>
                      <span>${this._formatPresetName(preset)}</span>
                    </button>
                  `)}
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }
  
  _getOrderedPresets(presets) {
    const presetOrder = ['away', 'home', 'sleep'];
    return presetOrder
      .filter(preset => presets.includes(preset))
      .concat(presets.filter(preset => !presetOrder.includes(preset)));
  }

  _togglePower(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const entityId = this.config.entity;
    const climate = this.hass.states[entityId];

    if (!climate) {
      console.log('Climate entity not found:', entityId);
      return;
    }

    const availableModes = climate.attributes.hvac_modes || [];

    if (climate.state === 'off') {
      const preferredMode = availableModes.includes('heat')
        ? 'heat'
        : availableModes.find(mode => mode !== 'off');

      if (preferredMode) {
        this.hass.callService('climate', 'set_hvac_mode', {
          entity_id: entityId,
          hvac_mode: preferredMode
        });
      }
    } else {
      this.hass.callService('climate', 'set_hvac_mode', {
        entity_id: entityId,
        hvac_mode: 'off'
      });
    }
  }

  _togglePresetMenu(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (this._presetMenuOpen) {
      this._closePresetMenu();
      return;
    }

    this._presetMenuOpen = true;
    document.addEventListener('click', this._handleOutsideClick, true);
    this.requestUpdate();
  }

  _handlePresetSelect(e, preset) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    this._setPreset(preset);
    this._closePresetMenu();
  }

  _closePresetMenu() {
    if (!this._presetMenuOpen) {
      return;
    }

    this._presetMenuOpen = false;
    document.removeEventListener('click', this._handleOutsideClick, true);
    this.requestUpdate();
  }

  _handleOutsideClick(e) {
    if (!this.shadowRoot) {
      return;
    }

    const path = e.composedPath ? e.composedPath() : [];
    const menu = this.shadowRoot.querySelector('.preset-menu');

    if (!menu) {
      this._closePresetMenu();
      return;
    }

    if (!path.includes(menu)) {
      this._closePresetMenu();
    }
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._handleOutsideClick, true);
    this._presetMenuOpen = false;
    super.disconnectedCallback();
  }

  static get styles() {
    return css`
      ha-card {
        --primary-color: var(--primary, var(--paper-item-icon-color));
        --text-primary-color: var(--primary-text-color);
        --secondary-text-color: var(--secondary-text-color);
        --accent-color: var(--primary-color, #2196f3);
        --card-border-radius: 12px;

        border-radius: var(--card-border-radius);
        padding: 0;
        overflow: hidden;
        cursor: pointer;
      }

      .card-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px;
      }

      .top-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .info-block {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 120px;
      }

      .name {
        font-size: 1.2rem;
        font-weight: 600;
        color: var(--text-primary-color);
        margin: 0;
      }

      .power-status {
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--secondary-text-color);
      }

      .power-status.on {
        color: var(--accent-color);
      }

      .metrics-grid {
        flex: 1;
        min-width: 220px;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
      }

      .metric {
        min-width: 0;
        padding: 8px;
        border-radius: 10px;
        background: rgba(var(--rgb-primary-color, 0, 134, 196), 0.08);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        text-align: center;
      }

      .metric-label {
        font-size: 0.7rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }

      .metric-value {
        display: inline-flex;
        align-items: baseline;
        gap: 2px;
        font-size: 1.2rem;
        font-weight: 600;
        color: var(--text-primary-color);
        white-space: nowrap;
      }

      .metric-unit {
        font-size: 0.75rem;
        font-weight: 500;
        opacity: 0.7;
      }

      .target-metric {
        grid-column: span 2;
        flex-direction: row;
        gap: 8px;
        padding: 8px 12px;
      }

      .target-value {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        min-width: 0;
      }

      .metric-control {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: 1px solid rgba(var(--rgb-primary-color, 0, 134, 196), 0.3);
        background: var(--card-background-color);
        color: var(--primary-color, #2196f3);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s ease, border-color 0.2s ease;
      }

      .metric-control:hover {
        background: rgba(var(--rgb-primary-color, 0, 134, 196), 0.12);
      }

      .metric-control ha-icon {
        --mdc-icon-size: 18px;
      }

      .bottom-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .action-button {
        flex: 1;
        min-height: 40px;
        border-radius: 10px;
        border: 1px solid rgba(var(--rgb-primary-color, 0, 134, 196), 0.25);
        background: var(--card-background-color);
        color: var(--text-primary-color);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 0.95rem;
        font-weight: 600;
        padding: 8px 12px;
        transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
      }

      .action-button:hover {
        border-color: rgba(var(--rgb-primary-color, 0, 134, 196), 0.4);
        background: rgba(var(--rgb-primary-color, 0, 134, 196), 0.1);
      }

      .action-button.active {
        background: var(--primary-color, #2196f3);
        border-color: var(--primary-color, #2196f3);
        color: #fff;
        box-shadow: 0 6px 16px rgba(33, 150, 243, 0.25);
      }

      .action-button[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
        box-shadow: none;
      }

      .action-button ha-icon {
        --mdc-icon-size: 20px;
      }

      .preset-menu {
        position: relative;
        flex: 1;
      }

      .preset-button {
        justify-content: space-between;
      }

      .preset-button .chevron {
        --mdc-icon-size: 18px;
      }

      .preset-dropdown {
        position: absolute;
        bottom: calc(100% + 6px);
        left: 0;
        right: 0;
        background: var(--card-background-color);
        border-radius: 10px;
        border: 1px solid rgba(var(--rgb-primary-color, 0, 134, 196), 0.25);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        z-index: 2;
      }

      .preset-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--text-primary-color);
        font-size: 0.9rem;
        font-weight: 500;
        padding: 8px 10px;
        transition: background 0.2s ease, color 0.2s ease;
      }

      .preset-option:hover {
        background: rgba(var(--rgb-primary-color, 0, 134, 196), 0.12);
      }

      .preset-option.active {
        background: var(--primary-color, #2196f3);
        color: #fff;
      }

      .preset-option ha-icon {
        --mdc-icon-size: 18px;
      }

      .warning {
        padding: 20px;
        text-align: center;
        color: var(--error-color);
      }

      .loading {
        padding: 20px;
        text-align: center;
        color: var(--secondary-text-color);
      }

      button {
        cursor: pointer;
      }

      @media (max-width: 560px) {
        .top-row {
          flex-direction: column;
          align-items: stretch;
        }

        .metrics-grid {
          width: 100%;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .target-metric {
          grid-column: span 2;
        }
      }
    `;
  }
}

// Card editor
class AdaptiveThermostatCardEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object }
    };
  }

  setConfig(config) {
    this.config = config;
  }

  render() {
    if (!this.hass || !this.config) {
      return html``;
    }

    return html`
      <ha-form
        .schema=${[
          { name: 'entity', selector: { entity: { domain: 'climate' } } },
          { name: 'name', selector: { text: {} } }
        ]}
        .data=${this.config}
        .hass=${this.hass}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  _valueChanged(ev) {
    const config = {
      ...this.config,
      ...ev.detail.value
    };
    
    const event = new CustomEvent('config-changed', {
      detail: { config },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }
}

customElements.define('adaptive-thermostat-card-editor', AdaptiveThermostatCardEditor);
customElements.define('adaptive-thermostat-card', AdaptiveThermostatCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'adaptive-thermostat-card',
  name: 'Adaptive Thermostat Card',
  description: 'A beautiful card for controlling your Adaptive Thermostat',
  preview: true,
}); 
