// Version: 2026-06-24-1200
const LitElement = Object.getPrototypeOf(
  customElements.get("ha-panel-lovelace")
);
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;
const PENDING_TARGET_TIMEOUT_MS = 15000;

class AdaptiveThermostatCard extends LitElement {
  constructor() {
    super();
    this._presetMenuOpen = false;
    this._pendingTargetTemperature = null;
    this._pendingTargetTimestamp = 0;
    this._lastKnownTargetTemperature = null;
    this._historyOpen = false;
    this._historyHours = 24;
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
    this._pendingTargetTemperature = null;
    this._pendingTargetTimestamp = 0;
    this._lastKnownTargetTemperature = null;
  }

  _getEntityTargetTemperature(climate) {
    const entityTarget = Number(climate?.attributes?.temperature);
    if (Number.isFinite(entityTarget)) {
      this._lastKnownTargetTemperature = entityTarget;
      return entityTarget;
    }

    return null;
  }

  _syncPendingTargetTemperature(climate) {
    if (this._pendingTargetTemperature === null) {
      return;
    }

    const pendingExpired = Date.now() - this._pendingTargetTimestamp > PENDING_TARGET_TIMEOUT_MS;
    const entityTarget = this._getEntityTargetTemperature(climate);
    const targetAcknowledged = Number.isFinite(entityTarget) &&
      Math.abs(entityTarget - this._pendingTargetTemperature) < 0.0005;

    if (pendingExpired || targetAcknowledged) {
      this._pendingTargetTemperature = null;
      this._pendingTargetTimestamp = 0;
    }
  }

  _getTemperatureStep(climate) {
    const entityStep = Number(climate?.attributes?.target_temp_step);
    return Number.isFinite(entityStep) && entityStep > 0 ? entityStep : 0.1;
  }

  _getStepDecimals(step) {
    if (!Number.isFinite(step)) {
      return 1;
    }
    const stepText = String(step);
    if (!stepText.includes('.')) {
      return 0;
    }
    return stepText.split('.')[1].length;
  }

  _normalizeTemperature(value, step, minTemp, maxTemp) {
    const snapped = Math.round(value / step) * step;
    let clamped = snapped;

    if (Number.isFinite(minTemp)) {
      clamped = Math.max(minTemp, clamped);
    }
    if (Number.isFinite(maxTemp)) {
      clamped = Math.min(maxTemp, clamped);
    }

    return Number(clamped.toFixed(this._getStepDecimals(step)));
  }

  _getEffectiveTargetTemperature(climate) {
    this._syncPendingTargetTemperature(climate);

    if (this._pendingTargetTemperature !== null) {
      return this._pendingTargetTemperature;
    }

    const entityTarget = this._getEntityTargetTemperature(climate);
    if (Number.isFinite(entityTarget)) {
      return entityTarget;
    }

    if (Number.isFinite(this._lastKnownTargetTemperature)) {
      return this._lastKnownTargetTemperature;
    }

    const currentTemp = Number(climate?.attributes?.current_temperature);
    return Number.isFinite(currentTemp) ? currentTemp : 20;
  }

  _adjustTemperature(direction, e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const entityId = this.config.entity;
    const climate = this.hass.states[entityId];
    if (!climate) {
      return;
    }

    const step = this._getTemperatureStep(climate);
    const minTemp = Number(climate.attributes.min_temp);
    const maxTemp = Number(climate.attributes.max_temp);
    const currentTemp = this._getEffectiveTargetTemperature(climate);
    const nextTemp = this._normalizeTemperature(
      currentTemp + (direction * step),
      step,
      minTemp,
      maxTemp
    );

    if (Math.abs(nextTemp - currentTemp) < 0.0005) {
      return;
    }

    this._pendingTargetTemperature = nextTemp;
    this._pendingTargetTimestamp = Date.now();
    this.requestUpdate();

    const call = this.hass.callService('climate', 'set_temperature', {
      entity_id: entityId,
      temperature: nextTemp
    });

    if (call && typeof call.catch === 'function') {
      call.catch(() => {
        this._pendingTargetTemperature = null;
        this._pendingTargetTimestamp = 0;
        this.requestUpdate();
      });
    }
  }

  _increaseTemperature(e) {
    this._adjustTemperature(1, e);
  }

  _decreaseTemperature(e) {
    this._adjustTemperature(-1, e);
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
      '.preset-option',
      '.history-section'
    ];

    const clickTarget = e.target;
    if (
      clickTarget instanceof Element &&
      interactiveSelectors.some(selector => clickTarget.closest(selector))
    ) {
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
    const hvacAction = climate.attributes.hvac_action;
    const currentTemp = climate.attributes.current_temperature;
    const targetTemp = this._getEffectiveTargetTemperature(climate);
    const currentPreset = climate.attributes.preset_mode;
    const presets = climate.attributes.preset_modes || [];

    const humiditySensorId = climate.attributes.humidity_sensor;
    const outdoorSensorId = climate.attributes.outdoor_sensor;
    const humiditySensor = humiditySensorId && this.hass.states[humiditySensorId]
      ? this.hass.states[humiditySensorId]
      : null;
    const outdoorSensor = outdoorSensorId && this.hass.states[outdoorSensorId]
      ? this.hass.states[outdoorSensorId]
      : null;
    const windowOpen = Boolean(climate.attributes.window_open_detected);
    const rawWindowAlert = climate.attributes.window_alert;
    const windowAlert = typeof rawWindowAlert === 'string' && rawWindowAlert.trim().length
      ? rawWindowAlert.trim()
      : '';
    const rawValveError = climate.attributes.valve_error;
    const valveError = typeof rawValveError === 'string' && rawValveError.trim().length
      ? rawValveError.trim()
      : '';

    const humidityKnown = humiditySensor && humiditySensor.state &&
      humiditySensor.state !== 'unknown' && humiditySensor.state !== 'unavailable';
    const outdoorKnown = outdoorSensor && outdoorSensor.state &&
      outdoorSensor.state !== 'unknown' && outdoorSensor.state !== 'unavailable';

    const orderedPresets = presets.length ? this._getOrderedPresets(presets) : [];
    const activePreset = currentPreset && currentPreset !== 'none' ? currentPreset : null;
    const presetLabel = activePreset ? this._formatPresetName(activePreset) : 'Preset';
    const presetIcon = activePreset ? this._getPresetIcon(activePreset) : 'mdi:shape-outline';

    const formatWithSuffix = (value, suffix) => {
      if (value === undefined || value === null) {
        if (suffix === '%') return '--%';
        if (suffix === '°C') return '--°C';
        return '--°';
      }
      const text = String(value);
      return text.includes(suffix) ? text : `${text}${suffix}`;
    };

    const indoorDisplay = formatWithSuffix(currentTemp, '°');
    const targetDisplay = formatWithSuffix(targetTemp, ' °C');
    const humidityDisplay = humidityKnown ? formatWithSuffix(humiditySensor.state, '%') : '--%';
    const outdoorDisplay = outdoorKnown ? formatWithSuffix(outdoorSensor.state, '°') : '--°';

    if (!orderedPresets.length && this._presetMenuOpen) {
      this._presetMenuOpen = false;
      document.removeEventListener('click', this._handleOutsideClick, true);
    }

    const statusSeparator = String.fromCharCode(8226);
    const toggleLabel = !isOn
      ? 'Off'
      : `On ${statusSeparator} ${hvacAction === 'heating' ? 'Heating' : 'Idle'}`;

    return html`
      <ha-card @click="${this._handleCardClick}">
        <div class="card-content">
          <div class="row header-row">
            <div class="name">${name}</div>
            <div class="metric inline">
              <ha-icon icon="mdi:thermometer" class="metric-icon"></ha-icon>
              <span>${indoorDisplay}</span>
            </div>
            ${humiditySensor ? html`
              <div class="metric inline">
                <ha-icon icon="mdi:water-percent" class="metric-icon"></ha-icon>
                <span>${humidityDisplay}</span>
              </div>
            ` : ''}
            ${outdoorSensor ? html`
              <div class="metric inline">
                <ha-icon icon="mdi:weather-partly-cloudy" class="metric-icon"></ha-icon>
                <span>${outdoorDisplay}</span>
              </div>
            ` : ''}
          </div>

          ${valveError ? html`
            <div class="row error-row">
              <ha-icon icon="mdi:alert-circle"></ha-icon>
              <span class="alert-text">${valveError}</span>
            </div>
          ` : ''}

          ${windowOpen ? html`
            <div class="row alert-row">
              <ha-icon icon="mdi:window-open-variant"></ha-icon>
              <span class="alert-text">${windowAlert || 'Open window detected. Heating paused.'}</span>
              <button class="dismiss-button" @click="${this._dismissWindowAlert}">
                <ha-icon icon="mdi:close"></ha-icon>
              </button>
            </div>
          ` : ''}

          <div class="row target-row">
            <button class="metric-control" @click="${this._decreaseTemperature}">-</button>
            <div class="target-value">${targetDisplay}</div>
            <button class="metric-control" @click="${this._increaseTemperature}">+</button>
          </div>

          <div class="row actions-row">
            <button
              class="action-button toggle-button ${isOn ? 'active' : 'inactive'}"
              @click="${this._togglePower}"
            >
              <ha-icon icon="${isOn ? 'mdi:fire' : 'mdi:power'}"></ha-icon>
              <span>${toggleLabel}</span>
            </button>
            <div class="preset-menu ${this._presetMenuOpen ? 'open' : ''}">
              <button
                class="action-button preset-button ${activePreset ? 'active' : ''}"
                @click="${this._togglePresetMenu}"
                ?disabled=${!orderedPresets.length}
              >
                <ha-icon class="preset-icon" icon="${presetIcon}"></ha-icon>
                <span class="preset-label">${presetLabel}</span>
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

          ${this._renderHistorySection(climate)}
        </div>
      </ha-card>
    `;
  }

  _renderHistorySection(climate) {
    const climateId = this.config.entity;
    const humidityId = climate.attributes.humidity_sensor || null;
    const open = this._historyOpen;
    const ranges = [
      { hours: 12, label: '12h' },
      { hours: 24, label: '24h' },
      { hours: 72, label: '3d' }
    ];

    return html`
      <div class="history-section ${open ? 'open' : ''}">
        <button class="history-toggle" @click="${this._toggleHistory}">
          <ha-icon icon="mdi:chart-line"></ha-icon>
          <span>History</span>
          <ha-icon class="chevron" icon="${open ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
        </button>
        ${open ? html`
          <div class="history-ranges">
            ${ranges.map(range => html`
              <button
                class="range-button ${this._historyHours === range.hours ? 'active' : ''}"
                @click="${() => this._setHistoryRange(range.hours)}"
              >${range.label}</button>
            `)}
          </div>
          <adaptive-thermostat-history
            .hass=${this.hass}
            .climateEntity=${climateId}
            .humidityEntity=${humidityId}
            .hours=${this._historyHours}
          ></adaptive-thermostat-history>
        ` : ''}
      </div>
    `;
  }

  _toggleHistory(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    this._historyOpen = !this._historyOpen;
    this.requestUpdate();
  }

  _setHistoryRange(hours) {
    if (this._historyHours === hours) {
      return;
    }
    this._historyHours = hours;
    this.requestUpdate();
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

  _dismissWindowAlert(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const entityId = this.config.entity;
    if (!entityId) {
      return;
    }

    this.hass.callService('adaptive_thermostat', 'dismiss_window_alert', {
      entity_id: entityId
    });
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
        overflow: visible;
        cursor: pointer;
      }

      .card-content {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
      }

      .row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .header-row {
        justify-content: space-between;
        gap: 8px;
        flex-wrap: nowrap;
      }

      .name {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-primary-color);
        margin-right: 2px;
        flex-shrink: 0;
      }

      .metric.inline {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 1rem;
        color: var(--text-primary-color);
        flex: 1;
        justify-content: center;
        white-space: nowrap;
        background: rgba(0, 0, 0, 0.05);
        padding: 4px 8px;
        border-radius: 10px;
      }

      .metric-icon {
        --mdc-icon-size: 18px;
        color: var(--secondary-text-color);
        flex-shrink: 0;
      }

      .alert-row {
        width: 100%;
        background: rgba(255, 152, 0, 0.18);
        color: var(--warning-color, #f57c00);
        border-radius: 12px;
        padding: 8px 12px;
        gap: 10px;
        box-sizing: border-box;
      }

      .alert-row ha-icon {
        --mdc-icon-size: 20px;
        color: inherit;
        flex-shrink: 0;
      }

      .alert-text {
        flex: 1;
        font-weight: 600;
        font-size: 0.95rem;
        color: inherit;
      }

      .dismiss-button {
        border: none;
        background: transparent;
        color: inherit;
        padding: 2px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
      }

      .dismiss-button ha-icon {
        --mdc-icon-size: 18px;
      }

      .dismiss-button:hover {
        background: rgba(0, 0, 0, 0.08);
      }

      .error-row {
        width: 100%;
        background: rgba(244, 67, 54, 0.18);
        color: var(--error-color, #d32f2f);
        border-radius: 12px;
        padding: 8px 12px;
        gap: 10px;
        box-sizing: border-box;
      }

      .error-row ha-icon {
        --mdc-icon-size: 20px;
        color: inherit;
        flex-shrink: 0;
      }

      .target-row {
        width: 100%;
        justify-content: space-between;
        align-items: center;
        gap: 18px;
        background: rgba(0, 0, 0, 0.06);
        padding: 6px 18px;
        border-radius: 16px;
        box-sizing: border-box;
      }

      .target-value {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-primary-color);
        flex: 1;
        text-align: center;
      }

      .metric-control {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        border: none;
        background: transparent;
        color: var(--primary-text-color);
        font-size: 1.5rem;
        font-weight: 400;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
      }

      .metric-control:hover {
        background: rgba(0, 0, 0, 0.08);
        color: var(--accent-color);
      }

      .actions-row {
        width: 100%;
        gap: 10px;
        display: flex;
      }

      .actions-row > * {
        flex: 1;
        min-width: 0;
      }

      .action-button {
        height: 46px;
        border-radius: 12px;
        border: 1px solid var(--ha-card-border-color, rgba(0, 0, 0, 0.12));
        background: var(--card-background-color);
        color: var(--primary-text-color);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 0.95rem;
        font-weight: 600;
        padding: 0 12px;
        transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
      }

      .action-button:hover:not([disabled]):not(.toggle-button) {
        border-color: rgba(0, 0, 0, 0.2);
        background: rgba(0, 0, 0, 0.04);
      }

      .toggle-button.active {
        background: rgba(255, 152, 0, 0.2);
        border-color: rgba(255, 152, 0, 0.6);
        color: rgb(255, 87, 34);
      }

      .toggle-button.inactive {
        background: rgba(0, 0, 0, 0.05);
        color: var(--secondary-text-color);
      }

      .preset-button {
        background: rgba(0, 0, 0, 0.05);
        color: var(--text-primary-color);
      }

      .preset-button.active {
        color: var(--primary-color, #2196f3);
      }

      .preset-icon {
        --mdc-icon-size: 18px;
        color: var(--secondary-text-color);
      }

      .preset-menu {
        position: relative;
        display: flex;
      }

      .preset-button {
        width: 100%;
        justify-content: space-between;
      }

      .preset-button .chevron {
        --mdc-icon-size: 18px;
      }

      .preset-dropdown {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        right: auto;
        min-width: 100%;
        background: var(--card-background-color);
        border-radius: 10px;
        border: 1px solid var(--ha-card-border-color, rgba(0, 0, 0, 0.12));
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        z-index: 5;
      }

      .preset-option {
        display: flex;
        align-items: center;
        gap: 10px;
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
        background: rgba(0, 0, 0, 0.06);
      }

      .preset-option.active {
        background: rgba(var(--rgb-primary-color, 33, 150, 243), 0.15);
        color: var(--primary-color, #2196f3);
      }

      .preset-option ha-icon {
        --mdc-icon-size: 18px;
        color: var(--secondary-text-color);
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

      .history-section {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .history-toggle {
        width: 100%;
        height: 40px;
        border-radius: 12px;
        border: 1px solid var(--ha-card-border-color, rgba(0, 0, 0, 0.12));
        background: rgba(0, 0, 0, 0.05);
        color: var(--secondary-text-color);
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        font-size: 0.9rem;
        font-weight: 600;
        transition: background 0.2s ease;
      }

      .history-toggle:hover {
        background: rgba(0, 0, 0, 0.08);
      }

      .history-toggle ha-icon {
        --mdc-icon-size: 18px;
      }

      .history-toggle .chevron {
        margin-left: auto;
      }

      .history-ranges {
        display: flex;
        gap: 6px;
      }

      .range-button {
        flex: 1;
        height: 30px;
        border-radius: 8px;
        border: 1px solid var(--ha-card-border-color, rgba(0, 0, 0, 0.12));
        background: transparent;
        color: var(--secondary-text-color);
        font-size: 0.8rem;
        font-weight: 600;
        transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
      }

      .range-button:hover {
        background: rgba(0, 0, 0, 0.04);
      }

      .range-button.active {
        background: rgba(var(--rgb-primary-color, 33, 150, 243), 0.15);
        color: var(--primary-color, #2196f3);
        border-color: transparent;
      }

      @media (max-width: 560px) {
        .header-row {
          align-items: center;
        }

        .status-text {
          margin-left: auto;
        }

        .target-row {
          gap: 8px;
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

// Combined temperature + humidity history chart.
//
// Home Assistant's native climate more-info graph only plots the climate entity
// (current + target temperature) and cannot overlay a separate humidity sensor, so
// this self-contained, dependency-free SVG chart renders all three series together.
const HISTORY_SERIES_COLORS = { temp: '#2196f3', target: '#ff9800', humidity: '#26a69a' };
const HISTORY_REFRESH_MS = 300000;
const HISTORY_SVG_NS = 'http://www.w3.org/2000/svg';

class AdaptiveThermostatHistory extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      climateEntity: { type: String },
      humidityEntity: { type: String },
      hours: { type: Number },
      _data: { state: true },
      _loading: { state: true },
      _error: { state: true }
    };
  }

  constructor() {
    super();
    this.hours = 24;
    this._data = null;
    this._loading = false;
    this._error = null;
    this._fetchedOnce = false;
    this._fetching = false;
    this._refreshTimer = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._refreshTimer = setInterval(() => this._fetchHistory(), HISTORY_REFRESH_MS);
  }

  disconnectedCallback() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    super.disconnectedCallback();
  }

  updated(changed) {
    if (changed.has('climateEntity') || changed.has('humidityEntity') || changed.has('hours')) {
      this._fetchHistory();
    } else if (changed.has('hass') && !this._fetchedOnce) {
      this._fetchHistory();
    }

    if (changed.has('_data') || changed.has('_loading') || changed.has('_error')) {
      this._drawChart();
    }
  }

  async _fetchHistory() {
    if (!this.hass || !this.climateEntity || this._fetching) {
      return;
    }
    this._fetching = true;
    this._fetchedOnce = true;
    if (!this._data) {
      this._loading = true;
    }
    this._error = null;

    try {
      const end = new Date();
      const start = new Date(end.getTime() - this.hours * 3600000);
      const entityIds = [this.climateEntity];
      if (this.humidityEntity) {
        entityIds.push(this.humidityEntity);
      }

      // significant_changes_only must stay false: the setpoint step is 0.1°C and the
      // climate component treats sub-0.5° attribute changes as insignificant, so
      // filtering would drop fine temperature detail and small target adjustments —
      // exactly what the native graph shows. minimal_response must also stay false so
      // attribute (current/target temperature) changes are returned, not just states.
      const result = await this.hass.callWS({
        type: 'history/history_during_period',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: entityIds,
        minimal_response: false,
        no_attributes: false,
        significant_changes_only: false
      });

      this._data = this._processHistory(result, start.getTime(), end.getTime());
    } catch (err) {
      this._error = (err && err.message) ? err.message : 'History unavailable';
    } finally {
      this._loading = false;
      this._fetching = false;
    }
  }

  _processHistory(result, startMs, endMs) {
    const climateStates = (result && result[this.climateEntity]) || [];
    let attrs = {};
    const temp = [];
    const target = [];

    for (const point of climateStates) {
      // Compressed history only repeats attributes that changed, so carry them forward.
      if (point.a) {
        attrs = { ...attrs, ...point.a };
      }
      const ts = (point.lu != null ? point.lu : point.lc) * 1000;
      const current = Number(attrs.current_temperature);
      const setpoint = Number(attrs.temperature);
      if (Number.isFinite(current)) {
        temp.push({ t: ts, v: current });
      }
      if (Number.isFinite(setpoint)) {
        target.push({ t: ts, v: setpoint });
      }
    }

    const humidity = [];
    if (this.humidityEntity && result && result[this.humidityEntity]) {
      for (const point of result[this.humidityEntity]) {
        const ts = (point.lu != null ? point.lu : point.lc) * 1000;
        const value = Number(point.s);
        if (Number.isFinite(value)) {
          humidity.push({ t: ts, v: value });
        }
      }
    }

    return {
      temp: this._downsample(temp, 500),
      target: this._dedupeSteps(target),
      humidity: this._downsample(humidity, 500),
      startMs,
      endMs
    };
  }

  _downsample(points, max) {
    if (points.length <= max) {
      return points;
    }
    const stride = Math.ceil(points.length / max);
    const out = [];
    for (let i = 0; i < points.length; i += stride) {
      out.push(points[i]);
    }
    const last = points[points.length - 1];
    if (out[out.length - 1] !== last) {
      out.push(last);
    }
    return out;
  }

  _dedupeSteps(points) {
    // The setpoint is a step function — keep only the points where it changes.
    const out = [];
    for (const point of points) {
      if (!out.length || out[out.length - 1].v !== point.v) {
        out.push(point);
      }
    }
    return out;
  }

  _isEmpty() {
    const data = this._data;
    return !data || (!data.temp.length && !data.target.length && !data.humidity.length);
  }

  render() {
    if (this._error) {
      return html`<div class="state error">${this._error}</div>`;
    }
    if (!this._data) {
      return html`<div class="state">Loading history…</div>`;
    }
    if (this._isEmpty()) {
      return html`<div class="state">No history available</div>`;
    }

    const hasHumidity = !!this.humidityEntity && this._data.humidity.length > 0;
    return html`
      <div class="legend">
        <span class="legend-item"><i style="background:${HISTORY_SERIES_COLORS.temp}"></i>Temp</span>
        <span class="legend-item"><i style="background:${HISTORY_SERIES_COLORS.target}"></i>Target</span>
        ${hasHumidity ? html`
          <span class="legend-item"><i style="background:${HISTORY_SERIES_COLORS.humidity}"></i>Humidity</span>
        ` : ''}
      </div>
      <div class="plot"></div>
    `;
  }

  _drawChart() {
    const plot = this.renderRoot && this.renderRoot.querySelector('.plot');
    if (!plot) {
      return;
    }
    plot.textContent = '';

    const data = this._data;
    if (!data) {
      return;
    }
    const { temp, target, humidity, startMs, endMs } = data;
    const hasHumidity = !!this.humidityEntity && humidity.length > 0;
    const tempValues = [...temp.map(p => p.v), ...target.map(p => p.v)];
    if (!tempValues.length && !hasHumidity) {
      return;
    }

    const W = 380;
    const H = 196;
    const margin = { l: 30, r: hasHumidity ? 32 : 12, t: 12, b: 22 };
    const pw = W - margin.l - margin.r;
    const ph = H - margin.t - margin.b;

    let tMin = 0;
    let tMax = 1;
    if (tempValues.length) {
      tMin = Math.min(...tempValues);
      tMax = Math.max(...tempValues);
      const pad = Math.max(0.5, (tMax - tMin) * 0.1);
      tMin = Math.floor((tMin - pad) * 2) / 2;
      tMax = Math.ceil((tMax + pad) * 2) / 2;
    }
    if (tMax === tMin) {
      tMax = tMin + 1;
    }

    let hMin = 0;
    let hMax = 100;
    if (hasHumidity) {
      const hv = humidity.map(p => p.v);
      hMin = Math.min(...hv);
      hMax = Math.max(...hv);
      const pad = Math.max(2, (hMax - hMin) * 0.1);
      hMin = Math.max(0, Math.floor((hMin - pad) / 5) * 5);
      hMax = Math.min(100, Math.ceil((hMax + pad) / 5) * 5);
      if (hMax === hMin) {
        hMax = hMin + 5;
      }
    }

    const span = (endMs - startMs) || 1;
    const xOf = (t) => {
      const x = margin.l + ((t - startMs) / span) * pw;
      return Math.max(margin.l, Math.min(margin.l + pw, x));
    };
    const yTemp = (v) => margin.t + (1 - (v - tMin) / (tMax - tMin)) * ph;
    const yHum = (v) => margin.t + (1 - (v - hMin) / (hMax - hMin)) * ph;

    const mk = (name, attrs) => {
      const node = document.createElementNS(HISTORY_SVG_NS, name);
      for (const key in attrs) {
        node.setAttribute(key, attrs[key]);
      }
      return node;
    };

    const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg' });
    const style = document.createElementNS(HISTORY_SVG_NS, 'style');
    style.textContent = `
      .grid{stroke:var(--divider-color,rgba(127,127,127,0.25));stroke-width:0.75}
      .axis{fill:var(--secondary-text-color,#888);font-size:9px}
      .axis-l{text-anchor:end}
      .axis-r{text-anchor:start}
      .axis-x{text-anchor:middle}
      .series{fill:none;stroke-width:1.75;stroke-linejoin:round;stroke-linecap:round}
      .s-temp{stroke:${HISTORY_SERIES_COLORS.temp}}
      .s-target{stroke:${HISTORY_SERIES_COLORS.target}}
      .s-humidity{stroke:${HISTORY_SERIES_COLORS.humidity}}
      .f-temp{fill:${HISTORY_SERIES_COLORS.temp}}
      .f-target{fill:${HISTORY_SERIES_COLORS.target}}
      .f-humidity{fill:${HISTORY_SERIES_COLORS.humidity}}
      .crosshair{stroke:var(--secondary-text-color,#888);stroke-width:0.75;stroke-dasharray:3 3}
      .dot{stroke:var(--card-background-color,#fff);stroke-width:1.5}
      .tip-bg{fill:var(--card-background-color,#fff);stroke:var(--divider-color,rgba(127,127,127,0.4))}
      .tip-time{fill:var(--secondary-text-color,#888);font-size:8.5px}
      .tip-text{font-size:9px}
    `;
    svg.appendChild(style);

    const tempTicks = this._ticks(tMin, tMax, 4);
    const tempDecimals = (tMax - tMin) < 4 ? 1 : 0;
    for (const value of tempTicks) {
      const y = yTemp(value);
      svg.appendChild(mk('line', { class: 'grid', x1: margin.l, y1: y, x2: margin.l + pw, y2: y }));
      const label = mk('text', { class: 'axis axis-l', x: margin.l - 4, y: y + 3 });
      label.textContent = `${this._round(value, tempDecimals)}°`;
      svg.appendChild(label);
    }

    if (hasHumidity) {
      for (const value of this._ticks(hMin, hMax, 3)) {
        const label = mk('text', { class: 'axis axis-r', x: margin.l + pw + 4, y: yHum(value) + 3 });
        label.textContent = `${Math.round(value)}%`;
        svg.appendChild(label);
      }
    }

    const xTickCount = 4;
    for (let i = 0; i <= xTickCount; i++) {
      const t = startMs + (span * i) / xTickCount;
      const label = mk('text', { class: 'axis axis-x', x: margin.l + (pw * i) / xTickCount, y: H - 6 });
      label.textContent = this._formatTime(t);
      svg.appendChild(label);
    }

    if (hasHumidity) {
      svg.appendChild(this._linePath(mk, humidity, xOf, yHum, 's-humidity'));
    }
    if (temp.length) {
      svg.appendChild(this._linePath(mk, temp, xOf, yTemp, 's-temp'));
    }
    if (target.length) {
      svg.appendChild(this._stepPath(mk, target, xOf, yTemp, endMs, 's-target'));
    }

    this._attachHover(svg, mk, { temp, target, humidity }, {
      xOf, yTemp, yHum, margin, pw, ph, W, startMs, endMs, span, hasHumidity
    });

    plot.appendChild(svg);
  }

  _ticks(min, max, count) {
    const out = [];
    for (let i = 0; i <= count; i++) {
      out.push(min + ((max - min) * i) / count);
    }
    return out;
  }

  _round(value, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  _formatTime(ms) {
    const date = new Date(ms);
    if (this.hours > 48) {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  _formatTooltipTime(ms) {
    const date = new Date(ms);
    const options = this.hours > 24
      ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' };
    return date.toLocaleString(undefined, options);
  }

  _seriesLabel(key) {
    if (key === 'temp') return 'Temp';
    if (key === 'target') return 'Target';
    return 'Humidity';
  }

  _linePath(mk, points, xOf, yOf, cls) {
    const d = points
      .map((p, i) => `${i ? 'L' : 'M'}${xOf(p.t).toFixed(1)} ${yOf(p.v).toFixed(1)}`)
      .join(' ');
    return mk('path', { class: `series ${cls}`, d });
  }

  _stepPath(mk, points, xOf, yOf, endMs, cls) {
    let d = '';
    points.forEach((p, i) => {
      const x = xOf(p.t).toFixed(1);
      const y = yOf(p.v).toFixed(1);
      d += i ? ` H${x} V${y}` : `M${x} ${y}`;
    });
    d += ` H${xOf(endMs).toFixed(1)}`;
    return mk('path', { class: `series ${cls}`, d });
  }

  _attachHover(svg, mk, series, geo) {
    const { xOf, yTemp, yHum, margin, pw, ph, W, startMs, span, hasHumidity } = geo;

    const active = [];
    if (series.temp.length) {
      active.push({ key: 'temp', data: series.temp, y: yTemp, unit: '°', decimals: 1, step: false });
    }
    if (series.target.length) {
      active.push({ key: 'target', data: series.target, y: yTemp, unit: '°', decimals: 1, step: true });
    }
    if (hasHumidity && series.humidity.length) {
      active.push({ key: 'humidity', data: series.humidity, y: yHum, unit: '%', decimals: 0, step: false });
    }
    if (!active.length) {
      return;
    }

    const group = mk('g', { class: 'hover-group', visibility: 'hidden' });
    const line = mk('line', { class: 'crosshair', y1: margin.t, y2: margin.t + ph });
    group.appendChild(line);

    const dots = active.map((s) => {
      const dot = mk('circle', { class: `dot f-${s.key}`, r: 2.6 });
      group.appendChild(dot);
      return dot;
    });

    const tipBg = mk('rect', { class: 'tip-bg', rx: 4 });
    group.appendChild(tipBg);
    const tipTime = mk('text', { class: 'tip-time' });
    group.appendChild(tipTime);
    const tipTexts = active.map((s) => {
      const text = mk('text', { class: 'tip-text', style: `fill:${HISTORY_SERIES_COLORS[s.key]}` });
      group.appendChild(text);
      return text;
    });
    svg.appendChild(group);

    const overlay = mk('rect', {
      x: margin.l, y: margin.t, width: pw, height: ph, fill: 'transparent', style: 'cursor:crosshair'
    });
    svg.appendChild(overlay);

    const nearest = (arr, t) => {
      if (t <= arr[0].t) return arr[0];
      if (t >= arr[arr.length - 1].t) return arr[arr.length - 1];
      let lo = 0;
      let hi = arr.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid].t < t) lo = mid + 1; else hi = mid - 1;
      }
      const a = arr[Math.max(0, hi)];
      const b = arr[Math.min(arr.length - 1, lo)];
      return Math.abs(a.t - t) <= Math.abs(b.t - t) ? a : b;
    };
    const stepValueAt = (arr, t) => {
      let result = arr[0];
      for (const point of arr) {
        if (point.t <= t) result = point; else break;
      }
      return result;
    };

    const lineHeight = 11;
    const boxWidth = this.hours > 24 ? 108 : 82;

    const onMove = (evt) => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) {
        return;
      }
      const vbX = ((evt.clientX - rect.left) / rect.width) * W;
      const px = Math.max(margin.l, Math.min(margin.l + pw, vbX));
      const t = startMs + ((px - margin.l) / pw) * span;

      line.setAttribute('x1', px.toFixed(1));
      line.setAttribute('x2', px.toFixed(1));

      const values = active.map((s, i) => {
        const point = s.step ? stepValueAt(s.data, t) : nearest(s.data, t);
        dots[i].setAttribute('cx', px.toFixed(1));
        dots[i].setAttribute('cy', s.y(point.v).toFixed(1));
        return `${this._seriesLabel(s.key)}: ${this._round(point.v, s.decimals)}${s.unit}`;
      });

      const boxHeight = 13 + active.length * lineHeight;
      let bx = px + 8;
      if (bx + boxWidth > margin.l + pw) {
        bx = px - boxWidth - 8;
      }
      bx = Math.max(margin.l, bx);
      const by = margin.t + 2;

      tipBg.setAttribute('x', bx.toFixed(1));
      tipBg.setAttribute('y', by.toFixed(1));
      tipBg.setAttribute('width', boxWidth);
      tipBg.setAttribute('height', boxHeight);
      tipTime.setAttribute('x', (bx + 6).toFixed(1));
      tipTime.setAttribute('y', (by + 10).toFixed(1));
      tipTime.textContent = this._formatTooltipTime(t);
      active.forEach((s, i) => {
        const text = tipTexts[i];
        text.setAttribute('x', (bx + 6).toFixed(1));
        text.setAttribute('y', (by + 10 + (i + 1) * lineHeight).toFixed(1));
        text.textContent = values[i];
      });

      group.setAttribute('visibility', 'visible');
    };
    const onLeave = () => group.setAttribute('visibility', 'hidden');

    overlay.addEventListener('pointermove', onMove);
    overlay.addEventListener('pointerdown', onMove);
    overlay.addEventListener('pointerleave', onLeave);
    overlay.addEventListener('pointercancel', onLeave);
  }

  static get styles() {
    return css`
      :host {
        display: block;
      }

      .legend {
        display: flex;
        gap: 14px;
        justify-content: center;
        flex-wrap: wrap;
        margin-bottom: 6px;
      }

      .legend-item {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.72rem;
        color: var(--secondary-text-color);
      }

      .legend-item i {
        width: 12px;
        height: 3px;
        border-radius: 2px;
        display: inline-block;
      }

      .plot {
        width: 100%;
      }

      .chart-svg {
        width: 100%;
        height: auto;
        display: block;
        touch-action: none;
      }

      .state {
        padding: 18px;
        text-align: center;
        color: var(--secondary-text-color);
        font-size: 0.8rem;
      }

      .state.error {
        color: var(--error-color, #d32f2f);
      }
    `;
  }
}

customElements.define('adaptive-thermostat-history', AdaptiveThermostatHistory);
customElements.define('adaptive-thermostat-card-editor', AdaptiveThermostatCardEditor);
customElements.define('adaptive-thermostat-card', AdaptiveThermostatCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'adaptive-thermostat-card',
  name: 'Adaptive Thermostat Card',
  description: 'A beautiful card for controlling your Adaptive Thermostat',
  preview: true,
}); 
