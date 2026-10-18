var GridLabApp = (() => {
  // src/core/Node.js
  var nodeIdCounter = 0;
  var Node = class {
    /**
     * @param {boolean} isGround - Whether this is the reference (ground) node
     */
    constructor(isGround = false) {
      this.id = isGround ? "gnd" : `node_${++nodeIdCounter}`;
      this.isGround = isGround;
      this.terminals = [];
      this.voltage = 0;
      this.index = isGround ? 0 : -1;
    }
    /**
     * Add a terminal to this node
     * @param {string} terminalId 
     */
    addTerminal(terminalId) {
      if (!this.terminals.includes(terminalId)) {
        this.terminals.push(terminalId);
      }
    }
    /**
     * Remove a terminal from this node
     * @param {string} terminalId 
     */
    removeTerminal(terminalId) {
      const index = this.terminals.indexOf(terminalId);
      if (index > -1) {
        this.terminals.splice(index, 1);
      }
    }
    /**
     * Check if this node has any connections
     * @returns {boolean}
     */
    hasConnections() {
      return this.terminals.length > 0;
    }
    /**
     * Get number of connections
     * @returns {number}
     */
    connectionCount() {
      return this.terminals.length;
    }
    /**
     * Merge another node into this one
     * @param {Node} other 
     */
    merge(other) {
      for (const terminalId of other.terminals) {
        this.addTerminal(terminalId);
      }
    }
    /**
     * Serialize node
     * @returns {Object}
     */
    serialize() {
      return {
        id: this.id,
        isGround: this.isGround,
        terminals: [...this.terminals]
      };
    }
  };
  function resetNodeCounter() {
    nodeIdCounter = 0;
  }

  // src/core/Component.js
  var componentIdCounter = 0;
  function generateId() {
    return `comp_${++componentIdCounter}`;
  }
  function setComponentIdCounter(count) {
    componentIdCounter = count;
  }
  var Terminal = class {
    /**
     * @param {Component} component - Parent component
     * @param {string} name - Terminal name (e.g., 'positive', 'negative')
     * @param {number} offsetX - X offset from component center
     * @param {number} offsetY - Y offset from component center
     */
    constructor(component, name, offsetX, offsetY) {
      this.id = `${component.id}_${name}`;
      this.component = component;
      this.name = name;
      this.offsetX = offsetX;
      this.offsetY = offsetY;
      this.connectedWires = [];
      this.nodeId = null;
    }
    /**
     * Get absolute position of terminal on canvas
     * @returns {{x: number, y: number}}
     */
    getPosition() {
      const cos = Math.cos(this.component.rotation * Math.PI / 180);
      const sin = Math.sin(this.component.rotation * Math.PI / 180);
      const rotatedX = this.offsetX * cos - this.offsetY * sin;
      const rotatedY = this.offsetX * sin + this.offsetY * cos;
      return {
        x: this.component.x + rotatedX,
        y: this.component.y + rotatedY
      };
    }
    /**
     * Check if a point is near this terminal
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} threshold - Distance threshold (default 10px)
     * @returns {boolean}
     */
    isNear(x, y, threshold = 10) {
      const pos = this.getPosition();
      const dx = pos.x - x;
      const dy = pos.y - y;
      return Math.sqrt(dx * dx + dy * dy) <= threshold;
    }
    /**
     * Connect a wire to this terminal
     * @param {Wire} wire 
     */
    connect(wire) {
      if (!this.connectedWires.includes(wire)) {
        this.connectedWires.push(wire);
      }
    }
    /**
     * Disconnect a wire from this terminal
     * @param {Wire} wire 
     */
    disconnect(wire) {
      const index = this.connectedWires.indexOf(wire);
      if (index > -1) {
        this.connectedWires.splice(index, 1);
      }
    }
    /**
     * Check if this terminal is connected
     * @returns {boolean}
     */
    isConnected() {
      return this.connectedWires.length > 0;
    }
  };
  var Component = class {
    /**
     * @param {string} type - Component type identifier (e.g., 'resistor', 'capacitor')
     * @param {number} x - X position on canvas
     * @param {number} y - Y position on canvas
     */
    constructor(type, x = 0, y = 0) {
      this.id = generateId();
      this.type = type;
      this.x = x;
      this.y = y;
      this.rotation = 0;
      this.selected = false;
      this.terminals = [];
      this.properties = {};
      this.element = null;
    }
    // =========== Override in subclasses ===========
    /**
     * Get display name of the component
     * @returns {string}
     */
    static get displayName() {
      return "Component";
    }
    /**
     * Get the component icon/symbol for toolbar
     * @returns {string} SVG markup
     */
    static get icon() {
      return '<rect x="4" y="8" width="24" height="8" fill="none" stroke="currentColor" stroke-width="2"/>';
    }
    /**
     * Get keyboard shortcut for this component
     * @returns {string|null}
     */
    static get shortcut() {
      return null;
    }
    /**
     * Get default properties for this component type
     * @returns {Object}
     */
    static getDefaultProperties() {
      return {};
    }
    /**
     * Get property definitions (for property panel UI)
     * @returns {Array<{name: string, label: string, type: string, unit: string}>}
     */
    static getPropertyDefinitions() {
      return [];
    }
    /**
     * Render SVG for the component body (override in subclass)
     * @returns {string} SVG markup for the component body
     */
    renderBody() {
      return '<rect class="component-body" x="-20" y="-10" width="40" height="20" rx="2"/>';
    }
    /**
     * Get the stamp for Modified Nodal Analysis (override in subclass)
     * This returns contribution to the G matrix and source vector
     * @param {Object} nodeMap - Map of terminal IDs to node indices
     * @param {number} frequency - Frequency for AC analysis (0 for DC)
     * @returns {{G: Array, z: Array}} Contributions to system matrices
     */
    getStamp(nodeMap, frequency = 0) {
      return { G: [], z: [] };
    }
    /**
     * Get companion model for transient analysis (override for L, C)
     * @param {number} dt - Time step
     * @param {Object} prevState - Previous state values
     * @returns {Object} Companion model parameters
     */
    getCompanionModel(dt, prevState) {
      return null;
    }
    // =========== Instance methods ===========
    /**
     * Move component to new position
     * @param {number} x 
     * @param {number} y 
     */
    moveTo(x, y) {
      this.x = x;
      this.y = y;
      this.updateElement();
    }
    /**
     * Move component by delta
     * @param {number} dx 
     * @param {number} dy 
     */
    moveBy(dx, dy) {
      this.x += dx;
      this.y += dy;
      this.updateElement();
    }
    /**
     * Rotate component by 90 degrees
     */
    rotate() {
      this.rotation = (this.rotation + 90) % 360;
      this.updateElement();
    }
    /**
     * Set rotation to specific angle
     * @param {number} degrees 
     */
    setRotation(degrees) {
      this.rotation = degrees % 360;
      this.updateElement();
    }
    /**
     * Select this component
     */
    select() {
      this.selected = true;
      if (this.element) {
        this.element.classList.add("selected");
      }
    }
    /**
     * Deselect this component
     */
    deselect() {
      this.selected = false;
      if (this.element) {
        this.element.classList.remove("selected");
      }
    }
    /**
     * Set a property value
     * @param {string} name 
     * @param {*} value 
     */
    setProperty(name, value) {
      this.properties[name] = value;
      this.updateElement();
    }
    /**
     * Get a property value
     * @param {string} name 
     * @returns {*}
     */
    getProperty(name) {
      return this.properties[name];
    }
    /**
     * Get terminal by name
     * @param {string} name 
     * @returns {Terminal|undefined}
     */
    getTerminal(name) {
      return this.terminals.find((t) => t.name === name);
    }
    /**
     * Find terminal near a point
     * @param {number} x 
     * @param {number} y 
     * @param {number} threshold 
     * @returns {Terminal|null}
     */
    findTerminalAt(x, y, threshold = 10) {
      for (const terminal of this.terminals) {
        if (terminal.isNear(x, y, threshold)) {
          return terminal;
        }
      }
      return null;
    }
    /**
     * Check if point is inside component bounding box
     * @param {number} x 
     * @param {number} y 
     * @returns {boolean}
     */
    containsPoint(x, y) {
      const bounds = this.getBounds();
      return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
    }
    /**
     * Get bounding box of component
     * @returns {{x: number, y: number, width: number, height: number}}
     */
    getBounds() {
      const width = 60;
      const height = 40;
      return {
        x: this.x - width / 2,
        y: this.y - height / 2,
        width,
        height
      };
    }
    /**
     * Render the complete SVG element
     * @returns {SVGGElement}
     */
    render() {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", `component-group ${this.selected ? "selected" : ""}`);
      group.setAttribute("data-id", this.id);
      group.setAttribute("data-type", this.type);
      group.setAttribute("transform", `translate(${this.x}, ${this.y}) rotate(${this.rotation})`);
      group.innerHTML = this.renderBody();
      for (const terminal of this.terminals) {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("class", "terminal");
        circle.setAttribute("data-terminal", terminal.name);
        circle.setAttribute("cx", terminal.offsetX);
        circle.setAttribute("cy", terminal.offsetY);
        circle.setAttribute("r", "4");
        group.appendChild(circle);
      }
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "component-label");
      label.setAttribute("y", this.getLabelOffset ? this.getLabelOffset() : "-15");
      label.textContent = this.getLabel();
      group.appendChild(label);
      const value = document.createElementNS("http://www.w3.org/2000/svg", "text");
      value.setAttribute("class", "component-value");
      value.setAttribute("y", this.getValueOffset ? this.getValueOffset() : "25");
      value.textContent = this.getValueString();
      group.appendChild(value);
      this.element = group;
      return group;
    }
    /**
     * Update the SVG element (call after property changes)
     */
    updateElement() {
      if (!this.element) return;
      this.element.setAttribute("transform", `translate(${this.x}, ${this.y}) rotate(${this.rotation})`);
      const valueText = this.element.querySelector(".component-value");
      if (valueText) {
        valueText.textContent = this.getValueString();
      }
    }
    /**
     * Get component label (e.g., R1, C2)
     * @returns {string}
     */
    getLabel() {
      return this.id.replace("comp_", this.type.charAt(0).toUpperCase());
    }
    /**
     * Get formatted value string (e.g., "1kΩ", "10µF")
     * @returns {string}
     */
    getValueString() {
      return "";
    }
    /**
     * Serialize component to JSON
     * @returns {Object}
     */
    serialize() {
      return {
        id: this.id,
        type: this.type,
        x: this.x,
        y: this.y,
        rotation: this.rotation,
        properties: { ...this.properties },
        state: { ...this.state }
        // Save transient state
      };
    }
    /**
     * Restore component from serialized data (override in subclass)
     * @param {Object} data 
     */
    deserialize(data) {
      this.id = data.id;
      this.x = data.x;
      this.y = data.y;
      this.rotation = data.rotation;
      this.properties = { ...data.properties };
      if (data.state) {
        this.state = { ...data.state };
      }
    }
  };
  function formatValue(value, unit = "") {
    if (value === 0) return `0${unit}`;
    const prefixes = [
      { threshold: 1e12, prefix: "T" },
      { threshold: 1e9, prefix: "G" },
      { threshold: 1e6, prefix: "M" },
      { threshold: 1e3, prefix: "k" },
      { threshold: 1, prefix: "" },
      { threshold: 1e-3, prefix: "m" },
      { threshold: 1e-6, prefix: "\xB5" },
      { threshold: 1e-9, prefix: "n" },
      { threshold: 1e-12, prefix: "p" }
    ];
    for (const { threshold, prefix } of prefixes) {
      if (Math.abs(value) >= threshold) {
        const scaled = value / threshold;
        const formatted = scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(2);
        return `${formatted}${prefix}${unit}`;
      }
    }
    return `${value.toExponential(2)}${unit}`;
  }

  // src/components/Resistor.js
  var Resistor = class extends Component {
    constructor(x = 0, y = 0) {
      super("resistor", x, y);
      this.terminals = [
        new Terminal(this, "left", -30, 0),
        new Terminal(this, "right", 30, 0)
      ];
      this.properties = {
        resistance: 1e3
      };
    }
    static get displayName() {
      return "Resistor";
    }
    static get icon() {
      return `
            <line x1="0" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2"/>
            <path d="M6 12 L8 6 L12 18 L16 6 L20 18 L24 6 L26 12" fill="none" stroke="currentColor" stroke-width="2"/>
            <line x1="26" y1="12" x2="32" y2="12" stroke="currentColor" stroke-width="2"/>
        `;
    }
    static get shortcut() {
      return "R";
    }
    static getDefaultProperties() {
      return { resistance: 1e3 };
    }
    static getPropertyDefinitions() {
      return [
        { name: "resistance", label: "Resistance", type: "number", unit: "\u03A9", min: 1e-3 }
      ];
    }
    renderBody() {
      return `
            <!-- Leads -->
            <line x1="-30" y1="0" x2="-15" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="15" y1="0" x2="30" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <!-- Zigzag resistor symbol -->
            <path class="component-body" 
                  d="M-15 0 L-12 -6 L-6 6 L0 -6 L6 6 L12 -6 L15 0" 
                  fill="none" stroke-width="2"/>
        `;
    }
    getValueString() {
      return formatValue(this.properties.resistance, "\u03A9");
    }
    /**
     * Get MNA stamp for resistor
     * Conductance G = 1/R between its two nodes
     */
    getStamp(nodeMap, frequency = 0) {
      const n1 = nodeMap.get(this.terminals[0].id);
      const n2 = nodeMap.get(this.terminals[1].id);
      const G = 1 / this.properties.resistance;
      const stamps = [];
      if (n1 !== 0) {
        stamps.push({ row: n1, col: n1, value: G });
        if (n2 !== 0) stamps.push({ row: n1, col: n2, value: -G });
      }
      if (n2 !== 0) {
        stamps.push({ row: n2, col: n2, value: G });
        if (n1 !== 0) stamps.push({ row: n2, col: n1, value: -G });
      }
      return { G: stamps, z: [] };
    }
    getBounds() {
      return {
        x: this.x - 35,
        y: this.y - 15,
        width: 70,
        height: 30
      };
    }
  };

  // src/components/Capacitor.js
  var Capacitor = class extends Component {
    constructor(x = 0, y = 0) {
      super("capacitor", x, y);
      this.terminals = [
        new Terminal(this, "left", -30, 0),
        new Terminal(this, "right", 30, 0)
      ];
      this.properties = {
        capacitance: 1e-6
      };
      this.state = {
        voltage: 0,
        current: 0
      };
    }
    static get displayName() {
      return "Capacitor";
    }
    static get icon() {
      return `
            <line x1="0" y1="12" x2="12" y2="12" stroke="currentColor" stroke-width="2"/>
            <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" stroke-width="2"/>
            <line x1="20" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2"/>
            <line x1="20" y1="12" x2="32" y2="12" stroke="currentColor" stroke-width="2"/>
        `;
    }
    static get shortcut() {
      return "C";
    }
    static getDefaultProperties() {
      return { capacitance: 1e-6 };
    }
    static getPropertyDefinitions() {
      return [
        { name: "capacitance", label: "Capacitance", type: "number", unit: "F", min: 1e-15 }
      ];
    }
    renderBody() {
      return `
            <!-- Leads -->
            <line x1="-30" y1="0" x2="-5" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="5" y1="0" x2="30" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <!-- Capacitor plates -->
            <line class="component-body" x1="-5" y1="-10" x2="-5" y2="10" stroke-width="2"/>
            <line class="component-body" x1="5" y1="-10" x2="5" y2="10" stroke-width="2"/>
        `;
    }
    getValueString() {
      return formatValue(this.properties.capacitance, "F");
    }
    /**
     * Get MNA stamp for capacitor
     * For AC analysis: Y = jωC
     * For DC: open circuit (infinite impedance)
     */
    getStamp(nodeMap, frequency = 0) {
      const n1 = nodeMap.get(this.terminals[0].id);
      const n2 = nodeMap.get(this.terminals[1].id);
      const C = this.properties.capacitance;
      const stamps = [];
      if (frequency === 0) {
        return { G: [], z: [] };
      }
      const omega = 2 * Math.PI * frequency;
      const Y = { real: 0, imag: omega * C };
      const Ymag = omega * C;
      if (n1 !== 0) {
        stamps.push({ row: n1, col: n1, value: Ymag });
        if (n2 !== 0) stamps.push({ row: n1, col: n2, value: -Ymag });
      }
      if (n2 !== 0) {
        stamps.push({ row: n2, col: n2, value: Ymag });
        if (n1 !== 0) stamps.push({ row: n2, col: n1, value: -Ymag });
      }
      return { G: stamps, z: [] };
    }
    /**
     * Get companion model for transient analysis
     * Using trapezoidal integration: C becomes a resistor + current source
     * Geq = 2C/dt, Ieq = Geq*V_prev + I_prev
     */
    getCompanionModel(dt, prevState) {
      const C = this.properties.capacitance;
      const Geq = 2 * C / dt;
      const Ieq = Geq * prevState.voltage + prevState.current;
      return {
        conductance: Geq,
        currentSource: Ieq,
        updateState: (voltage, current) => {
          this.state.voltage = voltage;
          this.state.current = current;
        }
      };
    }
    getBounds() {
      return {
        x: this.x - 35,
        y: this.y - 15,
        width: 70,
        height: 30
      };
    }
  };

  // src/components/Inductor.js
  var Inductor = class extends Component {
    constructor(x = 0, y = 0) {
      super("inductor", x, y);
      this.terminals = [
        new Terminal(this, "left", -30, 0),
        new Terminal(this, "right", 30, 0)
      ];
      this.properties = {
        inductance: 1e-3
      };
      this.state = {
        current: 0,
        voltage: 0
      };
    }
    static get displayName() {
      return "Inductor";
    }
    static get icon() {
      return `
            <line x1="0" y1="12" x2="4" y2="12" stroke="currentColor" stroke-width="2"/>
            <path d="M4 12 Q8 4, 12 12 Q16 4, 20 12 Q24 4, 28 12" fill="none" stroke="currentColor" stroke-width="2"/>
            <line x1="28" y1="12" x2="32" y2="12" stroke="currentColor" stroke-width="2"/>
        `;
    }
    static get shortcut() {
      return "L";
    }
    static getDefaultProperties() {
      return { inductance: 1e-3 };
    }
    static getPropertyDefinitions() {
      return [
        { name: "inductance", label: "Inductance", type: "number", unit: "H", min: 1e-12 }
      ];
    }
    renderBody() {
      return `
            <!-- Leads -->
            <line x1="-30" y1="0" x2="-15" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="15" y1="0" x2="30" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <!-- Coil/Inductor symbol -->
            <path class="component-body" 
                  d="M-15 0 Q-10 -8, -5 0 Q0 -8, 5 0 Q10 -8, 15 0" 
                  fill="none" stroke-width="2"/>
        `;
    }
    getValueString() {
      return formatValue(this.properties.inductance, "H");
    }
    /**
     * Get MNA stamp for inductor
     * For AC analysis: Z = jωL, so Y = 1/(jωL) = -j/(ωL)
     * For DC: short circuit (zero impedance) - requires special handling
     */
    getStamp(nodeMap, frequency = 0) {
      const n1 = nodeMap.get(this.terminals[0].id);
      const n2 = nodeMap.get(this.terminals[1].id);
      const L = this.properties.inductance;
      const stamps = [];
      if (frequency === 0) {
        const G = 1 / 1e-6;
        if (n1 !== 0) {
          stamps.push({ row: n1, col: n1, value: G });
          if (n2 !== 0) stamps.push({ row: n1, col: n2, value: -G });
        }
        if (n2 !== 0) {
          stamps.push({ row: n2, col: n2, value: G });
          if (n1 !== 0) stamps.push({ row: n2, col: n1, value: -G });
        }
        return { G: stamps, z: [] };
      }
      const omega = 2 * Math.PI * frequency;
      const Ymag = 1 / (omega * L);
      if (n1 !== 0) {
        stamps.push({ row: n1, col: n1, value: Ymag });
        if (n2 !== 0) stamps.push({ row: n1, col: n2, value: -Ymag });
      }
      if (n2 !== 0) {
        stamps.push({ row: n2, col: n2, value: Ymag });
        if (n1 !== 0) stamps.push({ row: n2, col: n1, value: -Ymag });
      }
      return { G: stamps, z: [] };
    }
    /**
     * Get companion model for transient analysis
     * Using trapezoidal integration: L becomes a resistor + voltage source
     * Req = 2L/dt, Veq = Req*I_prev + V_prev
     */
    getCompanionModel(dt, prevState) {
      const L = this.properties.inductance;
      const Req = 2 * L / dt;
      const Geq = 1 / Req;
      const Veq = Req * prevState.current + prevState.voltage;
      return {
        conductance: Geq,
        voltageSource: Veq,
        updateState: (voltage, current) => {
          this.state.voltage = voltage;
          this.state.current = current;
        }
      };
    }
    getBounds() {
      return {
        x: this.x - 35,
        y: this.y - 15,
        width: 70,
        height: 30
      };
    }
  };

  // src/components/Ground.js
  var Ground = class extends Component {
    constructor(x = 0, y = 0) {
      super("ground", x, y);
      this.terminals = [
        new Terminal(this, "ref", 0, -15)
      ];
      this.properties = {};
    }
    static get displayName() {
      return "Ground";
    }
    static get icon() {
      return `
            <line x1="16" y1="4" x2="16" y2="10" stroke="currentColor" stroke-width="2"/>
            <line x1="8" y1="10" x2="24" y2="10" stroke="currentColor" stroke-width="2"/>
            <line x1="10" y1="14" x2="22" y2="14" stroke="currentColor" stroke-width="2"/>
            <line x1="12" y1="18" x2="20" y2="18" stroke="currentColor" stroke-width="2"/>
        `;
    }
    static get shortcut() {
      return "G";
    }
    static getDefaultProperties() {
      return {};
    }
    static getPropertyDefinitions() {
      return [];
    }
    renderBody() {
      return `
            <!-- Vertical line -->
            <line x1="0" y1="-15" x2="0" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <!-- Ground symbol (3 horizontal lines) -->
            <line class="component-body" x1="-12" y1="0" x2="12" y2="0" stroke-width="2"/>
            <line class="component-body" x1="-8" y1="5" x2="8" y2="5" stroke-width="2"/>
            <line class="component-body" x1="-4" y1="10" x2="4" y2="10" stroke-width="2"/>
        `;
    }
    getValueString() {
      return "0V";
    }
    getLabel() {
      return "GND";
    }
    // Ground doesn't contribute to MNA matrix, it's the reference
    getStamp(nodeMap, frequency = 0) {
      return { G: [], z: [] };
    }
    getBounds() {
      return {
        x: this.x - 15,
        y: this.y - 20,
        width: 30,
        height: 35
      };
    }
  };

  // src/components/VoltageSource.js
  var VoltageSource = class extends Component {
    constructor(x = 0, y = 0) {
      super("voltage_source", x, y);
      this.terminals = [
        new Terminal(this, "positive", 0, -30),
        new Terminal(this, "negative", 0, 30)
      ];
      this.properties = {
        voltage: 5,
        type: "dc",
        // 'dc' or 'ac'
        frequency: 50,
        // Hz (for AC)
        phase: 0
        // degrees (for AC)
      };
    }
    static get displayName() {
      return "Voltage Source";
    }
    static get icon() {
      return `
            <circle cx="16" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
            <line x1="16" y1="6" x2="16" y2="10" stroke="currentColor" stroke-width="2"/>
            <line x1="14" y1="8" x2="18" y2="8" stroke="currentColor" stroke-width="2"/>
            <line x1="14" y1="16" x2="18" y2="16" stroke="currentColor" stroke-width="2"/>
        `;
    }
    static get shortcut() {
      return "V";
    }
    static getDefaultProperties() {
      return { voltage: 5, type: "dc", frequency: 50, phase: 0 };
    }
    static getPropertyDefinitions() {
      return [
        { name: "voltage", label: "Voltage", type: "number", unit: "V" },
        { name: "type", label: "Type", type: "select", options: ["dc", "ac"] },
        { name: "frequency", label: "Frequency", type: "number", unit: "Hz", condition: 'type === "ac"' },
        { name: "phase", label: "Phase", type: "number", unit: "\xB0", condition: 'type === "ac"' }
      ];
    }
    renderBody() {
      const isAC = this.properties.type === "ac";
      return `
            <!-- Leads -->
            <line x1="0" y1="-30" x2="0" y2="-15" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="0" y1="15" x2="0" y2="30" stroke="var(--component-stroke)" stroke-width="2"/>
            <!-- Circle -->
            <circle class="component-body" cx="0" cy="0" r="15"/>
            ${isAC ? `
                <!-- AC sine wave symbol -->
                <path d="M-8 0 Q-4 -6, 0 0 Q4 6, 8 0" fill="none" stroke="var(--component-stroke)" stroke-width="1.5"/>
            ` : `
                <!-- DC +/- symbols -->
                <line x1="-4" y1="-5" x2="4" y2="-5" stroke="var(--component-stroke)" stroke-width="2"/>
                <line x1="0" y1="-9" x2="0" y2="-1" stroke="var(--component-stroke)" stroke-width="2"/>
                <line x1="-4" y1="5" x2="4" y2="5" stroke="var(--component-stroke)" stroke-width="2"/>
            `}
        `;
    }
    getValueString() {
      const v = formatValue(this.properties.voltage, "V");
      return this.properties.type === "ac" ? `${v} ${this.properties.frequency}Hz` : v;
    }
    getLabel() {
      return this.properties.type === "ac" ? "VAC" : "VDC";
    }
    /**
     * Get MNA stamp for voltage source
     * Voltage sources require an additional row/column in MNA (for branch current)
     */
    getStamp(nodeMap, frequency = 0) {
      const n1 = nodeMap.get(this.terminals[0].id);
      const n2 = nodeMap.get(this.terminals[1].id);
      const V = this.properties.voltage;
      return {
        G: [],
        z: [],
        voltageSource: {
          positiveNode: n1,
          negativeNode: n2,
          voltage: V,
          type: this.properties.type,
          frequency: this.properties.frequency,
          phase: this.properties.phase
        }
      };
    }
    /**
     * Get instantaneous voltage at time t (for transient analysis)
     * @param {number} t - Time in seconds
     * @returns {number} Voltage
     */
    getVoltageAt(t) {
      if (this.properties.type === "dc") {
        return this.properties.voltage;
      } else {
        const omega = 2 * Math.PI * this.properties.frequency;
        const phi = this.properties.phase * Math.PI / 180;
        return this.properties.voltage * Math.sin(omega * t + phi);
      }
    }
    getBounds() {
      return {
        x: this.x - 20,
        y: this.y - 35,
        width: 40,
        height: 70
      };
    }
  };

  // src/components/Junction.js
  var Junction = class extends Component {
    constructor(x = 0, y = 0) {
      super("junction", x, y);
      this.terminals = [
        new Terminal(this, "node", 0, 0)
      ];
      this.properties = {};
    }
    static get displayName() {
      return "Junction";
    }
    static get icon() {
      return `
            <circle cx="16" cy="16" r="6" fill="currentColor"/>
        `;
    }
    static get shortcut() {
      return "J";
    }
    static getDefaultProperties() {
      return {};
    }
    static getPropertyDefinitions() {
      return [];
    }
    renderBody() {
      return `
            <!-- Junction dot -->
            <circle class="component-body" cx="0" cy="0" r="5" 
                fill="var(--component-stroke)" stroke="var(--component-stroke)" stroke-width="1"/>
        `;
    }
    getValueString() {
      return "";
    }
    getLabel() {
      return "";
    }
    // Junction doesn't contribute to MNA matrix - it's just a connection point
    getStamp(nodeMap, frequency = 0) {
      return { G: [], z: [] };
    }
    getBounds() {
      return {
        x: this.x - 10,
        y: this.y - 10,
        width: 20,
        height: 20
      };
    }
  };

  // src/components/Ammeter.js
  var Ammeter = class extends Component {
    constructor(x = 0, y = 0) {
      super("ammeter", x, y);
      this.terminals = [
        new Terminal(this, "positive", -30, 0),
        new Terminal(this, "negative", 30, 0)
      ];
      this.properties = {
        current: 0
        // Read-only value updated by simulation
      };
    }
    static get displayName() {
      return "Ammeter";
    }
    static get icon() {
      return `
            <circle cx="16" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
            <line x1="0" y1="12" x2="8" y2="12" stroke="currentColor" stroke-width="2"/>
            <line x1="24" y1="12" x2="32" y2="12" stroke="currentColor" stroke-width="2"/>
        `;
    }
    static get shortcut() {
      return "A";
    }
    static getDefaultProperties() {
      return { current: 0 };
    }
    static getPropertyDefinitions() {
      return [
        { name: "current", label: "Current", type: "number", unit: "A", readOnly: true }
      ];
    }
    renderBody() {
      return `
            <!-- Leads -->
            <line x1="-30" y1="0" x2="-15" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="15" y1="0" x2="30" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <!-- Circle -->
            <circle class="component-body" cx="0" cy="0" r="15" stroke-width="2"/>
            <!-- 'A' Symbol -->
            <text x="0" y="5" text-anchor="middle" font-size="20" fill="var(--component-stroke)" font-family="sans-serif">A</text>
        `;
    }
    getValueString() {
      return formatValue(this.properties.current, "A");
    }
    getLabel() {
      return "A";
    }
    /**
     * Get MNA stamp for Ammeter
     * Modeled as a 0V voltage source.
     * V+ - V- = 0
     * Solving for branch current I gives the reading.
     */
    getStamp(nodeMap, frequency = 0) {
      const n1 = nodeMap.get(this.terminals[0].id);
      const n2 = nodeMap.get(this.terminals[1].id);
      return {
        G: [],
        z: [],
        voltageSource: {
          positiveNode: n1,
          negativeNode: n2,
          voltage: 0,
          type: "dc",
          frequency: 0,
          phase: 0
        }
      };
    }
    /**
     * Setter for simulation to update the reading
     * @param {number} current 
     */
    setCurrent(current) {
      this.properties.current = current;
      if (this.element) {
        const valueText = this.element.querySelector(".component-value");
        if (valueText) {
          valueText.textContent = this.getValueString();
        }
      }
    }
    /**
     * Serialize
     */
    serialize() {
      return {
        id: this.id,
        type: this.type,
        x: this.x,
        y: this.y,
        rotation: this.rotation,
        properties: { ...this.properties }
      };
    }
    /**
     * Deserialize
     */
    deserialize(data) {
      this.id = data.id;
      this.x = data.x;
      this.y = data.y;
      this.rotation = data.rotation;
      this.properties = { ...data.properties, current: 0 };
    }
  };

  // src/components/Voltmeter.js
  var Voltmeter = class extends Component {
    constructor(x = 0, y = 0) {
      super("voltmeter", x, y);
      this.terminals = [
        new Terminal(this, "positive", -30, 0),
        new Terminal(this, "negative", 30, 0)
      ];
      this.properties = {
        voltage: 0
        // Read-only value updated by simulation
      };
    }
    static get displayName() {
      return "Voltmeter";
    }
    static get icon() {
      return `
            <circle cx="16" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
            <line x1="0" y1="12" x2="8" y2="12" stroke="currentColor" stroke-width="2"/>
            <line x1="24" y1="12" x2="32" y2="12" stroke="currentColor" stroke-width="2"/>
        `;
    }
    static get shortcut() {
      return "M";
    }
    static getDefaultProperties() {
      return { voltage: 0 };
    }
    static getPropertyDefinitions() {
      return [
        { name: "voltage", label: "Voltage", type: "number", unit: "V", readOnly: true }
      ];
    }
    renderBody() {
      return `
            <!-- Leads -->
            <line x1="-30" y1="0" x2="-15" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="15" y1="0" x2="30" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            
            <!-- Polarity indicators -->
            <text x="-22" y="-5" text-anchor="middle" font-size="10" fill="var(--component-stroke)" font-family="sans-serif">+</text>
            <text x="22" y="-5" text-anchor="middle" font-size="10" fill="var(--component-stroke)" font-family="sans-serif">-</text>

            <!-- Circle -->
            <circle class="component-body" cx="0" cy="0" r="15" stroke-width="2"/>
            
            <!-- 'V' Symbol -->
            <text x="0" y="5" text-anchor="middle" font-size="20" fill="var(--component-stroke)" font-family="sans-serif">V</text>
            
            <!-- Reading Display -->
            <text class="component-value" x="0" y="28" text-anchor="middle" font-size="10" fill="var(--component-text)">${this.getValueString()}</text>
        `;
    }
    getValueString() {
      return formatValue(this.properties.voltage, "V");
    }
    getLabel() {
      return "V";
    }
    /**
     * Get MNA stamp for Voltmeter
     * Modeled as a large resistor (100M Ohm)
     */
    getStamp(nodeMap, frequency = 0) {
      const n1 = nodeMap.get(this.terminals[0].id);
      const n2 = nodeMap.get(this.terminals[1].id);
      const R = 1e8;
      const g = 1 / R;
      return {
        G: [
          { row: n1, col: n1, value: g },
          { row: n1, col: n2, value: -g },
          { row: n2, col: n1, value: -g },
          { row: n2, col: n2, value: g }
        ],
        z: [],
        // No impedance in DC
        voltageSource: null
      };
    }
    /**
     * Setter for simulation to update the reading
     * @param {number} voltage 
     */
    setVoltage(voltage) {
      this.properties.voltage = voltage;
      if (this.element) {
        const valueText = this.element.querySelector(".component-value");
        if (valueText) {
          valueText.textContent = this.getValueString();
        }
      }
    }
    /**
     * Serialize
     */
    serialize() {
      return {
        id: this.id,
        type: this.type,
        x: this.x,
        y: this.y,
        rotation: this.rotation,
        properties: { ...this.properties }
      };
    }
    /**
     * Deserialize
     */
    deserialize(data) {
      this.id = data.id;
      this.x = data.x;
      this.y = data.y;
      this.rotation = data.rotation;
      this.properties = { ...data.properties, voltage: 0 };
    }
  };

  // src/components/Transformer.js
  var Transformer = class _Transformer extends Component {
    constructor(x = 0, y = 0) {
      super("transformer", x, y);
      this.terminals = [
        new Terminal(this, "primary_pos", -40, -30),
        new Terminal(this, "primary_neg", -40, 30),
        new Terminal(this, "secondary_pos", 40, -30),
        new Terminal(this, "secondary_neg", 40, 30)
      ];
      this.properties = {
        turnsRatio: 2,
        // a = N1/N2 (primary-to-secondary)
        Req: 1.15,
        // Equivalent series resistance (Ω)
        Xeq: 0.85,
        // Equivalent series reactance (Ω)
        Rc: 1200,
        // Core loss resistance (Ω)
        Xm: 1e3,
        // Magnetizing reactance (Ω)
        ratingKVA: 2,
        primaryVoltage: 240,
        secondaryVoltage: 120
      };
    }
    static get displayName() {
      return "Transformer";
    }
    static get icon() {
      return `
            <!-- Primary coil -->
            <path d="M4,4 Q10,4 10,8 Q10,12 4,12 Q10,12 10,16 Q10,20 4,20" 
                  fill="none" stroke="currentColor" stroke-width="1.5"/>
            <!-- Core lines -->
            <line x1="14" y1="2" x2="14" y2="22" stroke="currentColor" stroke-width="1.5"/>
            <line x1="18" y1="2" x2="18" y2="22" stroke="currentColor" stroke-width="1.5"/>
            <!-- Secondary coil -->
            <path d="M28,4 Q22,4 22,8 Q22,12 28,12 Q22,12 22,16 Q22,20 28,20" 
                  fill="none" stroke="currentColor" stroke-width="1.5"/>
        `;
    }
    static get shortcut() {
      return "T";
    }
    static getDefaultProperties() {
      return {
        turnsRatio: 2,
        Req: 1.15,
        Xeq: 0.85,
        Rc: 1200,
        Xm: 1e3,
        ratingKVA: 2,
        primaryVoltage: 240,
        secondaryVoltage: 120
      };
    }
    static getPropertyDefinitions() {
      return [
        { name: "turnsRatio", label: "Turns Ratio (a)", type: "number", unit: "" },
        { name: "Req", label: "R_eq", type: "number", unit: "\u03A9" },
        { name: "Xeq", label: "X_eq", type: "number", unit: "\u03A9" },
        { name: "Rc", label: "R_c", type: "number", unit: "\u03A9" },
        { name: "Xm", label: "X_m", type: "number", unit: "\u03A9" },
        { name: "ratingKVA", label: "Rating", type: "number", unit: "kVA", readOnly: true },
        { name: "primaryVoltage", label: "Primary Voltage", type: "number", unit: "V", readOnly: true },
        { name: "secondaryVoltage", label: "Secondary Voltage", type: "number", unit: "V", readOnly: true }
      ];
    }
    renderBody() {
      const a = this.properties.turnsRatio;
      return `
            <!-- Primary leads -->
            <line x1="-40" y1="-30" x2="-20" y2="-30" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="-20" y1="-30" x2="-20" y2="-20" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="-40" y1="30"  x2="-20" y2="30"  stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="-20" y1="30"  x2="-20" y2="20"  stroke="var(--component-stroke)" stroke-width="2"/>

            <!-- Primary coil (arcs) -->
            <path d="M-20,-20 Q-10,-20 -10,-14 Q-10,-8 -20,-8 Q-10,-8 -10,-2 Q-10,4 -20,4 Q-10,4 -10,10 Q-10,16 -20,16 Q-10,16 -10,20"
                  fill="none" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="-20" y1="16" x2="-20" y2="20" stroke="var(--component-stroke)" stroke-width="2"/>

            <!-- Core (two vertical bars) -->
            <line x1="-4" y1="-24" x2="-4" y2="24" stroke="var(--component-stroke)" stroke-width="2.5"/>
            <line x1="4"  y1="-24" x2="4"  y2="24" stroke="var(--component-stroke)" stroke-width="2.5"/>

            <!-- Secondary coil (arcs, mirrored) -->
            <path d="M20,-20 Q10,-20 10,-14 Q10,-8 20,-8 Q10,-8 10,-2 Q10,4 20,4 Q10,4 10,10 Q10,16 20,16 Q10,16 10,20"
                  fill="none" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="20" y1="-20" x2="20" y2="-20" stroke="var(--component-stroke)" stroke-width="2"/>

            <!-- Secondary leads -->
            <line x1="20" y1="-30" x2="40" y2="-30" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="20" y1="-30" x2="20" y2="-20" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="20" y1="30"  x2="40" y2="30"  stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="20" y1="30"  x2="20" y2="20"  stroke="var(--component-stroke)" stroke-width="2"/>

            <!-- Polarity dots -->
            <circle cx="-18" cy="-25" r="2" fill="var(--component-stroke)"/>
            <circle cx="18"  cy="-25" r="2" fill="var(--component-stroke)"/>

            <!-- Turns ratio label -->
            <text x="0" y="38" text-anchor="middle" font-size="10" fill="var(--component-text)">${a}:1</text>
        `;
    }
    getValueString() {
      const a = this.properties.turnsRatio;
      return `${a}:1  ${this.properties.ratingKVA}kVA`;
    }
    getLabel() {
      return "T";
    }
    /**
     * Get MNA stamp for transformer (DC analysis).
     * 
     * For DC steady-state:
     *   - Xeq is zero (inductor → short)
     *   - Xm  is infinite (inductor → open)
     *   - Model simplifies to: series Req + shunt Rc + ideal transformer
     * 
     * The stamp is handled directly by MNASolver.stampTransformer().
     * We return metadata here so the solver knows what to stamp.
     */
    getStamp(nodeMap, frequency = 0) {
      return {
        G: [],
        z: [],
        voltageSource: null,
        isTransformer: true,
        transformerData: {
          primaryPos: nodeMap.get(this.terminals[0].id),
          primaryNeg: nodeMap.get(this.terminals[1].id),
          secondaryPos: nodeMap.get(this.terminals[2].id),
          secondaryNeg: nodeMap.get(this.terminals[3].id),
          turnsRatio: this.properties.turnsRatio,
          Req: this.properties.Req,
          Xeq: this.properties.Xeq,
          Rc: this.properties.Rc,
          Xm: this.properties.Xm
        }
      };
    }
    /**
     * Serialize
     */
    serialize() {
      return {
        id: this.id,
        type: this.type,
        x: this.x,
        y: this.y,
        rotation: this.rotation,
        properties: { ...this.properties },
        state: { ...this.state }
      };
    }
    /**
     * Deserialize
     */
    deserialize(data) {
      this.id = data.id;
      this.x = data.x;
      this.y = data.y;
      this.rotation = data.rotation;
      this.properties = { ..._Transformer.getDefaultProperties(), ...data.properties };
      if (data.state) {
        this.state = data.state;
      }
    }
    getBounds() {
      return {
        x: this.x - 45,
        y: this.y - 35,
        width: 90,
        height: 75
      };
    }
  };

  // src/components/Wattmeter.js
  var Wattmeter = class _Wattmeter extends Component {
    constructor(x = 0, y = 0) {
      super("wattmeter", x, y);
      this.terminals = [
        new Terminal(this, "M", -40, -25),
        // 0: Current Input (Mains)
        new Terminal(this, "L", 40, -25),
        // 1: Current Output (Load)
        new Terminal(this, "C", -40, 25),
        // 2: Voltage Common
        new Terminal(this, "V", 40, 25)
        // 3: Voltage Input
      ];
      this.properties = {
        power: 0,
        // Read-only: computed W
        voltage: 0,
        // Read-only: voltage across C-V
        current: 0
        // Read-only: current through M-L
      };
    }
    static get displayName() {
      return "Wattmeter";
    }
    static get icon() {
      return `
            <circle cx="16" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
            <line x1="0" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.5"/>
            <line x1="24" y1="6" x2="32" y2="6" stroke="currentColor" stroke-width="1.5"/>
        `;
    }
    static get shortcut() {
      return "W";
    }
    static getDefaultProperties() {
      return { power: 0, voltage: 0, current: 0 };
    }
    static getPropertyDefinitions() {
      return [
        { name: "power", label: "Power", type: "number", unit: "W", readOnly: true },
        { name: "voltage", label: "Voltage", type: "number", unit: "V", readOnly: true },
        { name: "current", label: "Current", type: "number", unit: "A", readOnly: true }
      ];
    }
    renderBody() {
      return `
            <!-- Current coil leads (Top) -->
            <line x1="-40" y1="-25" x2="-22" y2="-25" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="22" y1="-25" x2="40" y2="-25" stroke="var(--component-stroke)" stroke-width="2"/>

            <!-- Current coil (Series element, Top Horizontal) -->
            <rect x="-22" y="-30" width="44" height="10" rx="2"
                  fill="none" stroke="var(--component-stroke)" stroke-width="1.5" stroke-dasharray="3,2"/>
            <path d="M -15 -25 Q 0 -35 15 -25" fill="none" stroke="var(--component-stroke)" stroke-width="1"/>

            <!-- Voltage coil leads (Bottom) -->
            <line x1="-40" y1="25" x2="-22" y2="25" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="22" y1="25" x2="40" y2="25" stroke="var(--component-stroke)" stroke-width="2"/>

            <!-- Voltage coil (Parallel element, Bottom Horizontal) -->
            <rect x="-22" y="20" width="44" height="10" rx="2"
                  fill="none" stroke="var(--component-stroke)" stroke-width="1.5" stroke-dasharray="3,2"/>
             <path d="M -15 25 Q 0 35 15 25" fill="none" stroke="var(--component-stroke)" stroke-width="1"/>

            <!-- Main body circle -->
            <circle class="component-body" cx="0" cy="0" r="18" stroke-width="2"/>

            <!-- 'W' Symbol -->
            <text x="0" y="5" text-anchor="middle" font-size="18" font-weight="bold"
                  fill="var(--component-stroke)" font-family="sans-serif">W</text>

            <!-- Terminal labels -->
            <text x="-38" y="-32" text-anchor="middle" font-size="10" font-weight="bold" fill="#e74c3c" font-family="sans-serif">M</text>
            <text x="38"  y="-32" text-anchor="middle" font-size="10" font-weight="bold" fill="#e74c3c" font-family="sans-serif">L</text>
            <text x="-38" y="35"  text-anchor="middle" font-size="10" font-weight="bold" fill="#3498db" font-family="sans-serif">C</text>
            <text x="38"  y="35"  text-anchor="middle" font-size="10" font-weight="bold" fill="#3498db" font-family="sans-serif">V</text>

            <!-- Polarity dots -->
            <circle cx="-26" cy="-25" r="2" fill="var(--component-stroke)"/> <!-- Dot near M -->
            <circle cx="-26" cy="25"  r="2" fill="var(--component-stroke)"/> <!-- Dot near C -->

            <!-- Power reading display -->
            <text class="component-value" x="0" y="34" text-anchor="middle" font-size="10"
                  fill="var(--component-text)">${this.getValueString()}</text>
        `;
    }
    getValueString() {
      return formatValue(this.properties.power, "W");
    }
    getLabel() {
      return "W";
    }
    /**
     * Get MNA stamp for Wattmeter.
     * 
     * Current coil (M-C): 0V voltage source (measures current)
     * Voltage coil (L-V): 100MΩ resistor (measures voltage)
     * 
     * The stamp is handled directly by MNASolver.
     */
    getStamp(nodeMap, frequency = 0) {
      const nM = nodeMap.get(this.terminals[0].id);
      const nC = nodeMap.get(this.terminals[1].id);
      const nL = nodeMap.get(this.terminals[2].id);
      const nV = nodeMap.get(this.terminals[3].id);
      const R = 1e8;
      const g = 1 / R;
      return {
        G: [
          { row: nL, col: nL, value: g },
          { row: nL, col: nV, value: -g },
          { row: nV, col: nL, value: -g },
          { row: nV, col: nV, value: g }
        ],
        z: [],
        // Current coil: 0V voltage source
        voltageSource: {
          positiveNode: nM,
          negativeNode: nC,
          voltage: 0,
          type: "dc",
          frequency: 0,
          phase: 0
        }
      };
    }
    /**
     * Update wattmeter readings from simulation
     */
    setReadings(voltage, current, power = null) {
      this.properties.voltage = voltage;
      this.properties.current = current;
      if (power !== null) {
        this.properties.power = power;
      } else {
        this.properties.power = voltage * current;
      }
      if (this.element) {
        const valueText = this.element.querySelector(".component-value");
        if (valueText) {
          valueText.textContent = this.getValueString();
        }
      }
    }
    /**
     * Serialize
     */
    serialize() {
      return {
        id: this.id,
        type: this.type,
        x: this.x,
        y: this.y,
        rotation: this.rotation,
        properties: { ...this.properties }
      };
    }
    /**
     * Deserialize
     */
    deserialize(data) {
      this.id = data.id;
      this.x = data.x;
      this.y = data.y;
      this.rotation = data.rotation;
      this.properties = { ..._Wattmeter.getDefaultProperties(), ...data.properties, power: 0, voltage: 0, current: 0 };
    }
    getBounds() {
      return {
        x: this.x - 45,
        y: this.y - 35,
        width: 90,
        height: 75
      };
    }
  };

  // src/components/ThreePhaseSource.js
  var ThreePhaseSource = class _ThreePhaseSource extends Component {
    constructor(x = 0, y = 0) {
      super("three_phase_source", x, y);
      this.terminals = [
        new Terminal(this, "phase_R", -30, -40),
        // Top-Left
        new Terminal(this, "phase_Y", 30, -40),
        // Top-Right
        new Terminal(this, "phase_B", 30, 40),
        // Bottom-Right
        new Terminal(this, "neutral", -30, 40)
        // Bottom-Left
      ];
      this.properties = {
        voltage: 415,
        // V_LL (RMS)
        frequency: 50,
        // Hz
        phaseShift: 0
        // Reference phase for R-phase (degrees)
      };
    }
    static get displayName() {
      return "3-Phase Source";
    }
    static get icon() {
      return `
            <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="2"/>
            <!-- Y symbol -->
            <line x1="16" y1="16" x2="16" y2="6" stroke="currentColor" stroke-width="1.5"/>
            <line x1="16" y1="16" x2="8" y2="24" stroke="currentColor" stroke-width="1.5"/>
            <line x1="16" y1="16" x2="24" y2="24" stroke="currentColor" stroke-width="1.5"/>
        `;
    }
    static get shortcut() {
      return "3";
    }
    static getDefaultProperties() {
      return { voltage: 415, frequency: 50, phaseShift: 0 };
    }
    static getPropertyDefinitions() {
      return [
        { name: "voltage", label: "Line Voltage (RMS)", type: "number", unit: "V" },
        { name: "frequency", label: "Frequency", type: "number", unit: "Hz" },
        { name: "phaseShift", label: "Phase Shift", type: "number", unit: "\xB0" }
      ];
    }
    renderBody() {
      return `
            <rect x="-30" y="-40" width="60" height="80" fill="none" class="component-body" stroke-opacity="0"/> 
            <!-- Using invisible rect for bounding, actual visual below -->
            
            <circle cx="0" cy="0" r="30" fill="none" stroke="var(--component-stroke)" stroke-width="2"/>
            
            <!-- Terminals are at corners (-30,-40 etc). Draw lines to circle? -->
            <line x1="-30" y1="-40" x2="-15" y2="-20" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="30" y1="-40" x2="15" y2="-20" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="30" y1="40" x2="15" y2="20" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="-30" y1="40" x2="-15" y2="20" stroke="var(--component-stroke)" stroke-width="2"/>

            <!-- Y Symbol inside -->
            <line x1="0" y1="0" x2="0" y2="-20" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="0" y1="0" x2="17" y2="10" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="0" y1="0" x2="-17" y2="10" stroke="var(--component-stroke)" stroke-width="2"/>
            
            <!-- Labels -->
            <text x="-35" y="-35" font-size="10" fill="#e74c3c" font-weight="bold">R</text>
            <text x="35" y="-35" font-size="10" fill="#f1c40f" font-weight="bold">Y</text>
            <text x="35" y="35" font-size="10" fill="#3498db" font-weight="bold">B</text>
            <text x="-35" y="35" font-size="10" fill="var(--component-text)" font-weight="bold">N</text>
        `;
    }
    getValueString() {
      return `${this.properties.voltage}V ${this.properties.frequency}Hz`;
    }
    getLabel() {
      return "3\u03A6";
    }
    /**
     * MNA Stamp
     * Handled by MNASolver based on component type.
     */
    getStamp(nodeMap, frequency = 0) {
      return {
        G: [],
        z: [],
        isThreePhaseSource: true,
        // Pass node IDs
        nodes: {
          R: nodeMap.get(this.terminals[0].id),
          Y: nodeMap.get(this.terminals[1].id),
          B: nodeMap.get(this.terminals[2].id),
          N: nodeMap.get(this.terminals[3].id)
        },
        voltage: this.properties.voltage,
        frequency: this.properties.frequency,
        phaseShift: this.properties.phaseShift
      };
    }
    serialize() {
      return {
        id: this.id,
        type: this.type,
        x: this.x,
        y: this.y,
        rotation: this.rotation,
        properties: { ...this.properties },
        state: { ...this.state }
      };
    }
    deserialize(data) {
      this.id = data.id;
      this.x = data.x;
      this.y = data.y;
      this.rotation = data.rotation;
      this.properties = { ..._ThreePhaseSource.getDefaultProperties(), ...data.properties };
      if (data.state) this.state = data.state;
    }
    getBounds() {
      return {
        x: this.x - 30,
        y: this.y - 40,
        width: 60,
        height: 80
      };
    }
  };

  // src/components/Load.js
  var RATED_VOLTAGE = 120;
  var RATED_CURRENT = 16.6667;
  var POWER_FACTOR = 0.8;
  var SIN_PHI = 0.6;
  var Load = class extends Component {
    constructor(x = 0, y = 0) {
      super("load", x, y);
      this.terminals = [
        new Terminal(this, "left", -40, 0),
        new Terminal(this, "right", 40, 0)
      ];
      this.properties = {
        loadPercent: 100
      };
      this.state = {
        inductorCurrent: 0,
        inductorVoltage: 0
      };
    }
    static get displayName() {
      return "Load";
    }
    static get icon() {
      return `
            <rect x="4" y="4" width="24" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 12 L10 8 L12 16 L14 8 L16 12" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M18 12 Q20 8, 22 12 Q24 8, 26 12" fill="none" stroke="currentColor" stroke-width="1.5"/>
        `;
    }
    static get shortcut() {
      return null;
    }
    static getDefaultProperties() {
      return { loadPercent: 100 };
    }
    static getPropertyDefinitions() {
      return [
        { name: "loadPercent", label: "Load %", type: "number", unit: "%", min: 0, max: 125, step: 1 }
      ];
    }
    /**
     * Compute the R and XL values from load percentage.
     * Returns { R, XL, Z, I2, k } or null if open circuit.
     */
    getLoadImpedance() {
      const k = this.properties.loadPercent / 100;
      if (k <= 0) {
        return null;
      }
      const I2 = k * RATED_CURRENT;
      const Z = RATED_VOLTAGE / I2;
      const R = Z * POWER_FACTOR;
      const XL = Z * SIN_PHI;
      return { R, XL, Z, I2, k };
    }
    renderBody() {
      return `
            <!-- Outer box -->
            <rect class="component-body" x="-35" y="-14" width="70" height="28" rx="3" 
                  fill="none" stroke-width="2"/>
            <!-- Left lead -->
            <line x1="-40" y1="0" x2="-35" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <!-- Right lead -->
            <line x1="35" y1="0" x2="40" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <!-- Resistor zigzag (left half) -->
            <path d="M-30 0 L-27 -7 L-21 7 L-15 -7 L-9 7 L-6 0" 
                  fill="none" stroke="var(--component-stroke)" stroke-width="2"/>
            <!-- Connecting line -->
            <line x1="-6" y1="0" x2="2" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <!-- Inductor coil (right half) -->
            <path d="M2 0 Q7 -9, 12 0 Q17 -9, 22 0 Q27 -9, 32 0" 
                  fill="none" stroke="var(--component-stroke)" stroke-width="2"/>
        `;
    }
    getValueString() {
      const pct = this.properties.loadPercent;
      if (pct <= 0) return "No Load";
      const imp = this.getLoadImpedance();
      if (!imp) return "No Load";
      return `${pct}% (${formatValue(imp.R, "\u03A9")} + j${formatValue(imp.XL, "\u03A9")})`;
    }
    getLabel() {
      return "Load";
    }
    /**
     * Get MNA stamp for DC analysis.
     * Load is R + jXL. For DC (ω=0), XL = 0, so only R is stamped.
     * At 0% load → open circuit (very high resistance).
     */
    getStamp(nodeMap, frequency = 0) {
      const n1 = nodeMap.get(this.terminals[0].id);
      const n2 = nodeMap.get(this.terminals[1].id);
      const stamps = [];
      const imp = this.getLoadImpedance();
      const R = imp ? imp.R : 1e9;
      const G = 1 / R;
      if (n1 !== 0) {
        stamps.push({ row: n1, col: n1, value: G });
        if (n2 !== 0) stamps.push({ row: n1, col: n2, value: -G });
      }
      if (n2 !== 0) {
        stamps.push({ row: n2, col: n2, value: G });
        if (n1 !== 0) stamps.push({ row: n2, col: n1, value: -G });
      }
      return { G: stamps, z: [] };
    }
    /**
     * Companion model for transient analysis.
     * The load is series R + L.
     * We decompose this into:
     *   - A resistor (R) — stamped as conductance
     *   - An inductor (L = XL / ω_rated) — Backward Euler companion model
     * 
     * The series combination means the same current flows through both.
     * Total companion conductance: 1 / (R + R_eq_L), where R_eq_L = 2L/dt (trapezoidal) or L/dt (BE)
     * 
     * For simplicity and consistency with the solver, we return a combined model.
     */
    getCompanionModel(dt, prevState) {
      const imp = this.getLoadImpedance();
      if (!imp) {
        return {
          conductance: 1e-12,
          currentSource: 0,
          updateState: () => {
          }
        };
      }
      const f = 50;
      const L = imp.XL / (2 * Math.PI * f);
      const R = imp.R;
      const GeqL = dt / L;
      const ReqL = 1 / GeqL;
      const totalR = R + ReqL;
      const totalG = 1 / totalR;
      const iPrev = prevState.inductorCurrent || 0;
      const Isource = totalG * ReqL * iPrev;
      return {
        conductance: totalG,
        currentSource: Isource,
        updateState: (voltage, current) => {
          this.state.inductorCurrent = current;
          this.state.inductorVoltage = voltage - current * R;
        }
      };
    }
    getBounds() {
      return {
        x: this.x - 45,
        y: this.y - 20,
        width: 90,
        height: 40
      };
    }
  };

  // src/components/Oscilloscope.js
  var Oscilloscope = class extends Component {
    constructor(x = 0, y = 0) {
      super("oscilloscope", x, y);
      this.terminals = [
        new Terminal(this, "ch1_pos", 0, -35),
        // CH1+ top
        new Terminal(this, "ch1_neg", 0, 35),
        // CH1- bottom
        new Terminal(this, "ch2_pos", -45, 0),
        // CH2+ left
        new Terminal(this, "ch2_neg", 45, 0)
        // CH2- right
      ];
      this.properties = {
        ch1Enabled: true,
        ch2Enabled: false,
        ch1Mode: "Voltage",
        ch2Mode: "Voltage",
        ch1Label: "CH1",
        ch2Label: "CH2"
      };
      this.ch1Color = "#22d3ee";
      this.ch2Color = "#f59e0b";
    }
    static get displayName() {
      return "Oscilloscope";
    }
    static get icon() {
      return `
            <rect x="4" y="4" width="24" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 12 Q12 4, 16 12 Q20 20, 24 12" fill="none" stroke="currentColor" stroke-width="1.5"/>
        `;
    }
    static get shortcut() {
      return null;
    }
    static getDefaultProperties() {
      return {
        ch1Enabled: true,
        ch2Enabled: false,
        ch1Mode: "Voltage",
        ch2Mode: "Voltage",
        ch1Label: "CH1",
        ch2Label: "CH2"
      };
    }
    static getPropertyDefinitions() {
      return [
        { name: "ch1Enabled", label: "Channel 1", type: "checkbox" },
        { name: "ch1Mode", label: "CH1 Mode", type: "select", options: ["Voltage", "Current"] },
        { name: "ch2Enabled", label: "Channel 2", type: "checkbox" },
        { name: "ch2Mode", label: "CH2 Mode", type: "select", options: ["Voltage", "Current"] },
        { name: "ch1Label", label: "CH1 Label", type: "text" },
        { name: "ch2Label", label: "CH2 Label", type: "text" }
      ];
    }
    /**
     * Get channel configuration for data extraction.
     * Returns an array of enabled channels with their terminal pairs.
     */
    getChannelConfig() {
      const channels = [];
      if (this.properties.ch1Enabled) {
        channels.push({
          id: "ch1",
          label: this.properties.ch1Label || "CH1",
          mode: this.properties.ch1Mode || "Voltage",
          posTerminal: this.terminals[0],
          // ch1_pos (top)
          negTerminal: this.terminals[1],
          // ch1_neg (bottom)
          color: this.ch1Color
        });
      }
      if (this.properties.ch2Enabled) {
        channels.push({
          id: "ch2",
          label: this.properties.ch2Label || "CH2",
          mode: this.properties.ch2Mode || "Voltage",
          posTerminal: this.terminals[2],
          // ch2_pos (left)
          negTerminal: this.terminals[3],
          // ch2_neg (right)
          color: this.ch2Color
        });
      }
      return channels;
    }
    renderBody() {
      const ch1Active = this.properties.ch1Enabled;
      const ch2Active = this.properties.ch2Enabled;
      return `
            <!-- Screen body -->
            <rect class="component-body" x="-28" y="-22" width="56" height="44" rx="4"
                  fill="rgba(13,17,23,0.8)" stroke-width="2"/>

            <!-- Screen inner -->
            <rect x="-22" y="-16" width="44" height="32" rx="2"
                  fill="rgba(13,17,23,0.95)" stroke="var(--component-stroke)" stroke-width="0.5"/>

            <!-- Grid lines on screen -->
            <line x1="-11" y1="-16" x2="-11" y2="16" stroke="rgba(88,166,255,0.15)" stroke-width="0.5"/>
            <line x1="0"   y1="-16" x2="0"   y2="16" stroke="rgba(88,166,255,0.15)" stroke-width="0.5"/>
            <line x1="11"  y1="-16" x2="11"  y2="16" stroke="rgba(88,166,255,0.15)" stroke-width="0.5"/>
            <line x1="-22" y1="0"   x2="22"  y2="0"  stroke="rgba(88,166,255,0.15)" stroke-width="0.5"/>

            <!-- CH1 waveform preview (cyan) -->
            ${ch1Active ? `
                <path d="M-20 0 Q-14 -10, -8 0 Q-2 10, 4 0 Q10 -10, 16 0"
                      fill="none" stroke="${this.ch1Color}" stroke-width="1.5" opacity="0.9"/>
            ` : ""}

            <!-- CH2 waveform preview (amber) -->
            ${ch2Active ? `
                <path d="M-20 2 Q-12 -6, -4 2 Q4 10, 12 2"
                      fill="none" stroke="${this.ch2Color}" stroke-width="1.5" opacity="0.7"/>
            ` : ""}

            <!-- CH1+ lead (top) -->
            <line x1="0" y1="-35" x2="0" y2="-22" stroke="${this.ch1Color}" stroke-width="1.5"/>
            <text x="10" y="-28" font-size="8" fill="${this.ch1Color}" font-family="sans-serif" font-weight="bold">CH1+</text>

            <!-- CH1- lead (bottom) -->
            <line x1="0" y1="22" x2="0" y2="35" stroke="${this.ch1Color}" stroke-width="1.5"/>
            <text x="10" y="32" font-size="8" fill="${this.ch1Color}" font-family="sans-serif" font-weight="bold">CH1\u2212</text>

            <!-- CH2+ lead (left) -->
            <line x1="-45" y1="0" x2="-28" y2="0" stroke="${this.ch2Color}" stroke-width="1.5"/>
            <text x="-44" y="-6" font-size="7" fill="${this.ch2Color}" font-family="sans-serif" font-weight="bold">CH2+</text>

            <!-- CH2- lead (right) -->
            <line x1="28" y1="0" x2="45" y2="0" stroke="${this.ch2Color}" stroke-width="1.5"/>
            <text x="30" y="-6" font-size="7" fill="${this.ch2Color}" font-family="sans-serif" font-weight="bold">CH2\u2212</text>
        `;
    }
    getValueString() {
      const parts = [];
      if (this.properties.ch1Enabled) parts.push(this.properties.ch1Label || "CH1");
      if (this.properties.ch2Enabled) parts.push(this.properties.ch2Label || "CH2");
      return parts.join(" | ") || "Off";
    }
    getLabel() {
      return "Scope";
    }
    /**
     * NO MNA stamp — this is a pure observer.
     */
    getStamp(nodeMap, frequency = 0) {
      return { G: [], z: [] };
    }
    /**
     * NO companion model — this is a pure observer.
     */
    getCompanionModel(dt, prevState) {
      return null;
    }
    getBounds() {
      return {
        x: this.x - 50,
        y: this.y - 40,
        width: 100,
        height: 80
      };
    }
  };

  // src/components/Diode.js
  var Diode = class _Diode extends Component {
    constructor(x = 0, y = 0) {
      super("diode", x, y);
      this.terminals = [
        new Terminal(this, "anode", -30, 0),
        new Terminal(this, "cathode", 30, 0)
      ];
      this.properties = {
        saturationCurrent: 1e-14,
        // Is (A)
        emissionCoefficient: 1,
        // n
        thermalVoltage: 0.02585
        // Vt (V) at ~300K
      };
    }
    static get displayName() {
      return "Diode";
    }
    static get icon() {
      return `
            <line x1="2" y1="12" x2="10" y2="12" stroke="currentColor" stroke-width="2"/>
            <polygon points="10,6 10,18 22,12" fill="none" stroke="currentColor" stroke-width="2"/>
            <line x1="22" y1="6" x2="22" y2="18" stroke="currentColor" stroke-width="2"/>
            <line x1="22" y1="12" x2="30" y2="12" stroke="currentColor" stroke-width="2"/>
        `;
    }
    static get shortcut() {
      return "D";
    }
    static getDefaultProperties() {
      return {
        saturationCurrent: 1e-14,
        emissionCoefficient: 1,
        thermalVoltage: 0.02585
      };
    }
    static getPropertyDefinitions() {
      return [
        { name: "saturationCurrent", label: "Is (Sat. Current)", type: "number", unit: "A", min: 1e-18 },
        { name: "emissionCoefficient", label: "n (Emission Coeff)", type: "number", unit: "", min: 0.5, max: 3 },
        { name: "thermalVoltage", label: "Vt (Thermal Voltage)", type: "number", unit: "V", min: 0.01 }
      ];
    }
    renderBody() {
      return `
            <!-- Leads -->
            <line x1="-30" y1="0" x2="-10" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="10" y1="0" x2="30" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            <!-- Triangle (anode side) -->
            <polygon class="component-body" 
                     points="-10,-10 -10,10 10,0" 
                     stroke-width="2"/>
            <!-- Bar (cathode side) -->
            <line x1="10" y1="-10" x2="10" y2="10" stroke="var(--component-stroke)" stroke-width="2.5"/>
            <!-- Polarity labels -->
            <text x="-22" y="-10" text-anchor="middle" font-size="9" fill="var(--component-text)" font-family="sans-serif">+</text>
            <text x="22" y="-10" text-anchor="middle" font-size="9" fill="var(--component-text)" font-family="sans-serif">\u2212</text>
        `;
    }
    getValueString() {
      return "Diode";
    }
    getLabel() {
      return "D";
    }
    // ─── Diode model computation (used by solvers) ───────────────────
    /**
     * Compute the linearized diode model at operating point Vd.
     * Returns { Id, Gd, Ieq } for Newton-Raphson stamping.
     * 
     * @param {number} Vd - Voltage across diode (anode - cathode)
     * @returns {{ Id: number, Gd: number, Ieq: number }}
     */
    computeDiodeModel(Vd) {
      const Is = this.properties.saturationCurrent;
      const n = this.properties.emissionCoefficient;
      const Vt = this.properties.thermalVoltage;
      const nVt = n * Vt;
      const Vcrit = nVt * Math.log(nVt / (Math.SQRT2 * Is));
      const maxArg = 40;
      const VdLimited = Math.min(Vd, maxArg * nVt);
      const expVal = Math.exp(VdLimited / nVt);
      const Id = Is * (expVal - 1);
      const Gmin = Is / nVt;
      const Gd = Math.max(Is / nVt * expVal, Gmin);
      const Ieq = Id - Gd * Vd;
      return { Id, Gd, Ieq };
    }
    /**
     * Apply voltage limiting between iterations to improve NR convergence.
     * Limits the change in Vd between iterations.
     * 
     * @param {number} VdNew - New voltage estimate
     * @param {number} VdOld - Previous iteration voltage
     * @returns {number} Limited voltage
     */
    limitVoltage(VdNew, VdOld) {
      const n = this.properties.emissionCoefficient;
      const Vt = this.properties.thermalVoltage;
      const nVt = n * Vt;
      const Vcrit = nVt * Math.log(nVt / (Math.SQRT2 * this.properties.saturationCurrent));
      if (VdNew > Vcrit && Math.abs(VdNew - VdOld) > 2 * nVt) {
        if (VdOld > 0) {
          const arg = (VdNew - VdOld) / nVt;
          if (arg > 0) {
            return VdOld + nVt * (2 + Math.log(arg) - 1);
          }
          return VdOld + nVt * 2;
        }
        return nVt * Math.log(VdNew / nVt);
      }
      return VdNew;
    }
    /**
     * MNA stamp — not used directly (solver does NR stamping).
     */
    getStamp(nodeMap, frequency = 0) {
      return { G: [], z: [] };
    }
    serialize() {
      return {
        id: this.id,
        type: this.type,
        x: this.x,
        y: this.y,
        rotation: this.rotation,
        properties: { ...this.properties }
      };
    }
    deserialize(data) {
      this.id = data.id;
      this.x = data.x;
      this.y = data.y;
      this.rotation = data.rotation;
      this.properties = { ..._Diode.getDefaultProperties(), ...data.properties };
    }
    getBounds() {
      return {
        x: this.x - 35,
        y: this.y - 15,
        width: 70,
        height: 30
      };
    }
  };

  // src/components/OpAmp.js
  var OpAmp = class _OpAmp extends Component {
    constructor(x = 0, y = 0) {
      super("opamp", x, y);
      this.terminals = [
        new Terminal(this, "in_pos", -30, 15),
        new Terminal(this, "in_neg", -30, -15),
        new Terminal(this, "out", 30, 0),
        new Terminal(this, "internal_pole", 0, 0)
      ];
      this.terminals[3].isHidden = true;
      this.properties = _OpAmp.getDefaultProperties();
    }
    static get displayName() {
      return "Operational Amplifier";
    }
    static get icon() {
      return `
            <polygon points="4,4 4,28 28,16" fill="none" stroke="currentColor" stroke-width="2"/>
            <line x1="8" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1.5"/>
            <line x1="11" y1="9" x2="11" y2="15" stroke="currentColor" stroke-width="1.5"/>
            <line x1="8" y1="20" x2="14" y2="20" stroke="currentColor" stroke-width="1.5"/>
            <line x1="28" y1="16" x2="32" y2="16" stroke="currentColor" stroke-width="2"/>
        `;
    }
    static get shortcut() {
      return "O";
    }
    static getDefaultProperties() {
      return {
        openLoopGain: 1e5,
        gbp: 1e6,
        rin: 2e6,
        rout: 75,
        offsetVoltage: 0,
        cmrr: 90,
        saturationVoltage: 15
      };
    }
    static getPropertyDefinitions() {
      return [
        { name: "openLoopGain", label: "Open-Loop Gain", type: "number", unit: "V/V", min: 1 },
        { name: "gbp", label: "Gain-Bandwidth Product", type: "number", unit: "Hz", min: 1 },
        { name: "rin", label: "Input Resistance", type: "number", unit: "\u03A9", min: 1 },
        { name: "rout", label: "Output Resistance", type: "number", unit: "\u03A9", min: 1e-3 },
        { name: "offsetVoltage", label: "Offset Voltage", type: "number", unit: "V" },
        { name: "cmrr", label: "CMRR", type: "number", unit: "dB", min: 1 },
        { name: "saturationVoltage", label: "Output Saturation (\xB1V)", type: "number", unit: "V", min: 0.1 }
      ];
    }
    renderBody() {
      return `
            <!-- Input Leads -->
            <line x1="-30" y1="-15" x2="-20" y2="-15" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="-30" y1="15" x2="-20" y2="15" stroke="var(--component-stroke)" stroke-width="2"/>
            
            <!-- Output Lead -->
            <line x1="20" y1="0" x2="30" y2="0" stroke="var(--component-stroke)" stroke-width="2"/>
            
            <!-- Triangle Symbol -->
            <polygon class="component-body" points="-20,-25 -20,25 20,0" stroke-width="2"/>
            
            <!-- Polarity Markers: (-) on top, (+) on bottom -->
            <path d="M-15 -15 L-9 -15" stroke="var(--component-stroke)" stroke-width="1.5" fill="none"/>
            <path d="M-15 15 L-9 15 M-12 12 L-12 18" stroke="var(--component-stroke)" stroke-width="1.5" fill="none"/>
        `;
    }
    getValueString() {
      return "Op-Amp";
    }
    getLabel() {
      return "U";
    }
    /**
     * Get MNA stamp for OpAmp
     * Models the non-ideal OpAmp using strictly linear VCCS and resistors 
     * to avoid singular matrices and solver convergence problems.
     */
    getStamp(nodeMap, frequency = 0) {
      const nPos = nodeMap.get(this.terminals[0].id);
      const nNeg = nodeMap.get(this.terminals[1].id);
      const nOut = nodeMap.get(this.terminals[2].id);
      const nPole = nodeMap.get(this.terminals[3].id);
      const G_stamps = [];
      const z_stamps = [];
      const props = this.properties;
      const A0 = props.openLoopGain;
      const rout = Math.max(1e-3, props.rout);
      const rin = props.rin;
      const ric = props.rin * 50;
      const cmrr_linear = Math.pow(10, props.cmrr / 20);
      const Ac = A0 / cmrr_linear;
      const g_plus = A0 + Ac / 2;
      const g_minus = -A0 + Ac / 2;
      const g_out = 1 / rout;
      const G_id = 1 / rin;
      const G_ic = 1 / ric;
      if (nPos !== 0) {
        G_stamps.push({ row: nPos, col: nPos, value: G_id + G_ic });
        if (nNeg !== 0) {
          G_stamps.push({ row: nPos, col: nNeg, value: -G_id });
        }
      }
      if (nNeg !== 0) {
        G_stamps.push({ row: nNeg, col: nNeg, value: G_id + G_ic });
        if (nPos !== 0) {
          G_stamps.push({ row: nNeg, col: nPos, value: -G_id });
        }
      }
      if (nPole !== void 0 && nPole !== 0) {
        G_stamps.push({ row: nPole, col: nPole, value: 1 });
        if (frequency > 0) {
          const fp = props.gbp / A0;
          const Cp = 1 / (2 * Math.PI * fp);
          const omega = 2 * Math.PI * frequency;
          const Ymag = omega * Cp;
          G_stamps.push({ row: nPole, col: nPole, value: Ymag });
        }
        if (nPos !== 0) G_stamps.push({ row: nPole, col: nPos, value: -g_plus });
        if (nNeg !== 0) G_stamps.push({ row: nPole, col: nNeg, value: -g_minus });
        if (props.offsetVoltage !== 0) {
          z_stamps.push({ row: nPole, value: A0 * props.offsetVoltage });
        }
      }
      if (nOut !== 0) {
        G_stamps.push({ row: nOut, col: nOut, value: g_out });
        if (nPole !== void 0 && nPole !== 0) {
          G_stamps.push({ row: nOut, col: nPole, value: -g_out });
        }
      }
      return { G: G_stamps, z: z_stamps };
    }
    serialize() {
      return {
        id: this.id,
        type: this.type,
        x: this.x,
        y: this.y,
        rotation: this.rotation,
        properties: { ...this.properties },
        state: { ...this.state }
      };
    }
    deserialize(data) {
      this.id = data.id;
      this.x = data.x;
      this.y = data.y;
      this.rotation = data.rotation;
      this.properties = { ..._OpAmp.getDefaultProperties(), ...data.properties };
      if (data.state) {
        this.state = data.state;
      }
    }
    getBounds() {
      return {
        x: this.x - 35,
        y: this.y - 30,
        width: 70,
        height: 60
      };
    }
  };

  // src/simulation/EnvironmentModels.js
  var ThermalEnvironment = class {
    /**
     * @param {Object} opts
     * @param {number} opts.ambientTemp   — ambient temperature in °C (default 25)
     * @param {number} opts.timeConstant  — thermal time constant in seconds (default 3)
     * @param {number} opts.maxTemp       — saturation temperature in °C (default 300)
     * @param {number} opts.heaterGain    — °C rise per volt of heater input (default 60)
     * @param {number} opts.noiseAmplitude — random fluctuation in °C (default 0.2)
     */
    constructor(opts = {}) {
      this.ambientTemp = opts.ambientTemp ?? 25;
      this.timeConstant = opts.timeConstant ?? 50;
      this.maxTemp = opts.maxTemp ?? 300;
      this.heaterGain = opts.heaterGain ?? 15;
      this.noiseAmplitude = opts.noiseAmplitude ?? 0.2;
      this.temperature = this.ambientTemp;
    }
    /**
     * Advance the thermal state.
     * @param {number} dt      — elapsed time in seconds
     * @param {number} voltage — heater driving voltage (absolute value used)
     * @returns {number} current temperature in °C
     */
    update(dt, voltage) {
      const power = Math.abs(voltage);
      const targetTemp = Math.min(
        this.ambientTemp + power * this.heaterGain,
        this.maxTemp
      );
      const alpha = 1 - Math.exp(-dt / this.timeConstant);
      this.temperature += (targetTemp - this.temperature) * alpha;
      this.temperature = Math.max(this.ambientTemp, Math.min(this.temperature, this.maxTemp));
      const noise = (Math.random() - 0.5) * 2 * this.noiseAmplitude;
      return this.temperature + noise;
    }
    /** Reset to ambient */
    reset() {
      this.temperature = this.ambientTemp;
    }
  };
  var MechanicalEnvironment = class {
    /**
     * @param {Object} opts
     * @param {number} opts.smoothingFactor — 0–1, how fast we approach target (default 0.15)
     * @param {number} opts.maxForce       — saturation force in N (default 100)
     * @param {number} opts.youngsModulus   — material stiffness Pa (default 200e9 — steel)
     * @param {number} opts.crossSection   — cross-section area m² (default 1e-6)
     * @param {number} opts.noiseAmplitude  — random fluctuation in strain (default 1e-7)
     */
    constructor(opts = {}) {
      this.smoothingFactor = opts.smoothingFactor ?? 0.15;
      this.maxForce = opts.maxForce ?? 100;
      this.youngsModulus = opts.youngsModulus ?? 2e11;
      this.crossSection = opts.crossSection ?? 1e-6;
      this.noiseAmplitude = opts.noiseAmplitude ?? 1e-7;
      this.currentForce = 0;
      this.strain = 0;
    }
    /**
     * @param {number} dt    — elapsed time (used for smoothing)
     * @param {number} force — target force in Newtons
     * @returns {{ force: number, strain: number }}
     */
    update(dt, force) {
      const clampedForce = Math.max(0, Math.min(force, this.maxForce));
      this.currentForce += (clampedForce - this.currentForce) * this.smoothingFactor;
      this.strain = this.currentForce / (this.youngsModulus * this.crossSection);
      const noise = (Math.random() - 0.5) * 2 * this.noiseAmplitude;
      return {
        force: this.currentForce,
        strain: this.strain + noise
      };
    }
    reset() {
      this.currentForce = 0;
      this.strain = 0;
    }
  };
  var DisplacementEnvironment = class {
    /**
     * @param {Object} opts
     * @param {number} opts.maxDisplacement — max range in mm (default 10)
     * @param {number} opts.smoothingFactor — 0–1 (default 0.2)
     * @param {number} opts.noiseAmplitude  — mm (default 0.01)
     */
    constructor(opts = {}) {
      this.maxDisplacement = opts.maxDisplacement ?? 10;
      this.smoothingFactor = opts.smoothingFactor ?? 0.2;
      this.noiseAmplitude = opts.noiseAmplitude ?? 0.01;
      this.displacement = 0;
    }
    /**
     * @param {number} dt           — elapsed time
     * @param {number} targetDisplacement — desired position in mm
     * @returns {number} current displacement in mm
     */
    update(dt, targetDisplacement) {
      const clamped = Math.max(-this.maxDisplacement, Math.min(targetDisplacement, this.maxDisplacement));
      this.displacement += (clamped - this.displacement) * this.smoothingFactor;
      const noise = (Math.random() - 0.5) * 2 * this.noiseAmplitude;
      return this.displacement + noise;
    }
    reset() {
      this.displacement = 0;
    }
  };

  // src/components/RTD.js
  var RTD = class extends Component {
    constructor(x = 0, y = 0) {
      super("rtd", x, y);
      this.terminals = [
        new Terminal(this, "exc_pos", -75, -20),
        new Terminal(this, "exc_neg", -75, 20),
        new Terminal(this, "out_pos", 75, -20),
        new Terminal(this, "out_neg", 75, 20)
      ];
      this.properties = {
        r0: 100,
        // Ω at T_ref
        alpha: 385e-5,
        // /°C
        tRef: 0,
        // reference temperature °C
        ambientTemp: 25,
        // °C
        timeConstant: 3,
        // seconds
        heaterGain: 60,
        // °C per volt
        maxTemp: 300
        // °C saturation
      };
      this.environment = new ThermalEnvironment({
        ambientTemp: this.properties.ambientTemp,
        timeConstant: this.properties.timeConstant,
        heaterGain: this.properties.heaterGain,
        maxTemp: this.properties.maxTemp
      });
      this.sensorState = {
        temperature: this.properties.ambientTemp,
        resistance: this.properties.r0 * (1 + this.properties.alpha * (this.properties.ambientTemp - this.properties.tRef))
      };
    }
    static get displayName() {
      return "RTD (Pt100)";
    }
    static get icon() {
      return `
            <rect x="6" y="4" width="20" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M12 8 L12 16 M16 8 L16 16 M20 8 L20 16" stroke="currentColor" stroke-width="1" opacity="0.5"/>
            <line x1="2" y1="8" x2="6" y2="8" stroke="currentColor" stroke-width="1.5"/>
            <line x1="2" y1="16" x2="6" y2="16" stroke="currentColor" stroke-width="1.5"/>
            <line x1="26" y1="8" x2="30" y2="8" stroke="currentColor" stroke-width="1.5"/>
            <line x1="26" y1="16" x2="30" y2="16" stroke="currentColor" stroke-width="1.5"/>
            <text x="16" y="13" text-anchor="middle" font-size="5" fill="currentColor" font-weight="bold">RTD</text>
        `;
    }
    static getDefaultProperties() {
      return { r0: 100, alpha: 385e-5, tRef: 0, ambientTemp: 25, timeConstant: 3, heaterGain: 60, maxTemp: 300 };
    }
    static getPropertyDefinitions() {
      return [
        { name: "r0", label: "R\u2080 (at T_ref)", type: "number", unit: "\u03A9", min: 1 },
        { name: "alpha", label: "\u03B1 (TCR)", type: "number", unit: "/\xB0C", min: 1e-4, step: 1e-4 },
        { name: "tRef", label: "T_ref", type: "number", unit: "\xB0C" },
        { name: "ambientTemp", label: "Ambient Temp", type: "number", unit: "\xB0C", min: -40, max: 85 },
        { name: "timeConstant", label: "Time Constant", type: "number", unit: "s", min: 0.1 },
        { name: "heaterGain", label: "Heater Gain", type: "number", unit: "\xB0C/V", min: 1 },
        { name: "maxTemp", label: "Max Temp", type: "number", unit: "\xB0C", min: 50 }
      ];
    }
    /** Called by continuous simulation loop */
    updateEnvironment(dt, heaterVoltage) {
      this.environment.ambientTemp = this.properties.ambientTemp;
      this.environment.timeConstant = this.properties.timeConstant;
      this.environment.heaterGain = this.properties.heaterGain;
      this.environment.maxTemp = this.properties.maxTemp;
      const temp = this.environment.update(dt, heaterVoltage);
      const R = this.properties.r0 * (1 + this.properties.alpha * (temp - this.properties.tRef));
      this.sensorState = { temperature: temp, resistance: Math.max(0.01, R) };
      return this.sensorState;
    }
    /** Get observation row for Note Reading */
    getObservation() {
      return {
        headers: ["Temperature (\xB0C)", "Resistance (\u03A9)"],
        values: [
          this.sensorState.temperature.toFixed(2),
          this.sensorState.resistance.toFixed(2)
        ]
      };
    }
    /** True for sensors that need the continuous loop */
    get isSensor() {
      return true;
    }
    get sensorType() {
      return "thermal";
    }
    /**
     * MNA stamp: variable resistance between out_pos and out_neg
     */
    getStamp(nodeMap, frequency = 0) {
      const n1 = nodeMap.get(this.terminals[2].id);
      const n2 = nodeMap.get(this.terminals[3].id);
      const G = 1 / this.sensorState.resistance;
      const stamps = [];
      if (n1 !== 0) {
        stamps.push({ row: n1, col: n1, value: G });
        if (n2 !== 0) stamps.push({ row: n1, col: n2, value: -G });
      }
      if (n2 !== 0) {
        stamps.push({ row: n2, col: n2, value: G });
        if (n1 !== 0) stamps.push({ row: n2, col: n1, value: -G });
      }
      const ni1 = nodeMap.get(this.terminals[0].id);
      const ni2 = nodeMap.get(this.terminals[1].id);
      const Gin = 1 / 1e5;
      if (ni1 !== 0) {
        stamps.push({ row: ni1, col: ni1, value: Gin });
        if (ni2 !== 0) stamps.push({ row: ni1, col: ni2, value: -Gin });
      }
      if (ni2 !== 0) {
        stamps.push({ row: ni2, col: ni2, value: Gin });
        if (ni1 !== 0) stamps.push({ row: ni2, col: ni1, value: -Gin });
      }
      return { G: stamps, z: [] };
    }
    renderBody() {
      const tempBar = Math.min(24, this.sensorState.temperature / 200 * 24);
      return `
            <rect class="component-body" x="-60" y="-40" width="120" height="80" rx="6"/>

            <!-- Terminals Connections -->
            <line x1="-75" y1="-20" x2="-40" y2="-20" stroke="var(--component-stroke)" stroke-width="2.5"/>
            <line x1="-75" y1="20" x2="-40" y2="20" stroke="var(--component-stroke)" stroke-width="2.5"/>
            
            <g transform="translate(0, 0) scale(1.2)">
                <!-- Heater Symbol Left -->
                <rect x="-30" y="-12" width="15" height="24" rx="2" fill="#fee2e2" stroke="#ef4444" stroke-width="1.5"/>
                <path d="M-25 -12 L-25 12 M-20 -12 L-20 12 M-15 -12 L-15 12" stroke="#ef4444" stroke-width="1" opacity="0.3"/>
                <line x1="-40" y1="-17" x2="-30" y2="-8" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <line x1="-40" y1="17" x2="-30" y2="8" stroke="var(--component-stroke)" stroke-width="1.5"/>
                
                <!-- Sensor Element Right -->
                <rect x="5" y="-12" width="25" height="24" rx="2" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
                <!-- Pt100 Zigzag -->
                <polyline points="5,-5 10,-10 15,10 20,-10 25,10 30,5" fill="none" stroke="#2563eb" stroke-width="1.5" stroke-linejoin="round"/>
                
                <line x1="30" y1="-8" x2="45" y2="-17" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <line x1="30" y1="8" x2="45" y2="17" stroke="var(--component-stroke)" stroke-width="1.5"/>

                <!-- Thermal coupling arrows -->
                <path d="M-12 -6 L2 -6 M-12 0 L2 0 M-12 6 L2 6" stroke="#f59e0b" stroke-width="1" marker-end="url(#heat-arrow)"/>
            </g>

            <defs>
                <marker id="heat-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
                </marker>
            </defs>

            <!-- Thermometer Bar -->
            <rect x="-12" y="30" width="24" height="4" rx="1" fill="#cbd5e1" opacity="0.5"/>
            <rect x="-12" y="30" width="${tempBar}" height="4" rx="1" fill="#ef4444"/>

            <text x="-50" y="-24" font-size="4" fill="#ef4444" font-weight="bold">Heater (~1.5\xB0C/s @ 5V)</text>
            <text x="25" y="-22" text-anchor="middle" font-size="6" fill="#3b82f6" font-weight="bold">RTD Pt100</text>
            <text x="0" y="38" text-anchor="middle" font-size="7" fill="#64748b">${this.sensorState.temperature.toFixed(1)}\xB0C</text>
            
            <line x1="75" y1="-20" x2="50" y2="-20" stroke="var(--component-stroke)" stroke-width="2.5"/>
            <line x1="75" y1="20" x2="50" y2="20" stroke="var(--component-stroke)" stroke-width="2.5"/>
        `;
    }
    getValueString() {
      return `R: ${this.sensorState.resistance.toFixed(2)} \u03A9`;
    }
    getBounds() {
      return { x: this.x - 85, y: this.y - 50, width: 170, height: 100 };
    }
    getLabelOffset() {
      return -47;
    }
    getValueOffset() {
      return 47;
    }
    resetSensor() {
      this.environment.reset();
      this.sensorState = {
        temperature: this.properties.ambientTemp,
        resistance: this.properties.r0 * (1 + this.properties.alpha * (this.properties.ambientTemp - this.properties.tRef))
      };
    }
  };

  // src/components/Thermistor.js
  var Thermistor = class extends Component {
    constructor(x = 0, y = 0) {
      super("thermistor", x, y);
      this.terminals = [
        new Terminal(this, "exc_pos", -75, -20),
        new Terminal(this, "exc_neg", -75, 20),
        new Terminal(this, "out_pos", 75, -20),
        new Terminal(this, "out_neg", 75, 20)
      ];
      this.properties = {
        r0: 1e4,
        // Ω at T₀
        bConstant: 3950,
        // B-parameter (K)
        t0: 25,
        // reference temperature °C
        ambientTemp: 25,
        timeConstant: 3,
        heaterGain: 60,
        maxTemp: 200
      };
      this.environment = new ThermalEnvironment({
        ambientTemp: this.properties.ambientTemp,
        timeConstant: this.properties.timeConstant,
        heaterGain: this.properties.heaterGain,
        maxTemp: this.properties.maxTemp
      });
      this.sensorState = {
        temperature: this.properties.ambientTemp,
        resistance: this.properties.r0
      };
    }
    static get displayName() {
      return "Thermistor (NTC)";
    }
    static get icon() {
      return `
            <rect x="6" y="4" width="20" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <line x1="11" y1="7" x2="21" y2="17" stroke="currentColor" stroke-width="1"/>
            <line x1="2" y1="8" x2="6" y2="8" stroke="currentColor" stroke-width="1.5"/>
            <line x1="2" y1="16" x2="6" y2="16" stroke="currentColor" stroke-width="1.5"/>
            <line x1="26" y1="8" x2="30" y2="8" stroke="currentColor" stroke-width="1.5"/>
            <line x1="26" y1="16" x2="30" y2="16" stroke="currentColor" stroke-width="1.5"/>
            <text x="16" y="13" text-anchor="middle" font-size="4.5" fill="currentColor" font-weight="bold">NTC</text>
        `;
    }
    static getDefaultProperties() {
      return { r0: 1e4, bConstant: 3950, t0: 25, ambientTemp: 25, timeConstant: 3, heaterGain: 60, maxTemp: 200 };
    }
    static getPropertyDefinitions() {
      return [
        { name: "r0", label: "R\u2080 (at T\u2080)", type: "number", unit: "\u03A9", min: 1 },
        { name: "bConstant", label: "B Constant", type: "number", unit: "K", min: 100 },
        { name: "t0", label: "T\u2080", type: "number", unit: "\xB0C" },
        { name: "ambientTemp", label: "Ambient Temp", type: "number", unit: "\xB0C", min: -40, max: 85 },
        { name: "timeConstant", label: "Time Constant", type: "number", unit: "s", min: 0.1 },
        { name: "heaterGain", label: "Heater Gain", type: "number", unit: "\xB0C/V", min: 1 },
        { name: "maxTemp", label: "Max Temp", type: "number", unit: "\xB0C", min: 50 }
      ];
    }
    /** Continuous simulation update */
    updateEnvironment(dt, heaterVoltage) {
      this.environment.ambientTemp = this.properties.ambientTemp;
      this.environment.timeConstant = this.properties.timeConstant;
      this.environment.heaterGain = this.properties.heaterGain;
      this.environment.maxTemp = this.properties.maxTemp;
      const tempC = this.environment.update(dt, heaterVoltage);
      const T_K = tempC + 273.15;
      const T0_K = this.properties.t0 + 273.15;
      const R = this.properties.r0 * Math.exp(this.properties.bConstant * (1 / T_K - 1 / T0_K));
      this.sensorState = { temperature: tempC, resistance: Math.max(0.01, R) };
      return this.sensorState;
    }
    getObservation() {
      return {
        headers: ["Temperature (\xB0C)", "Resistance (\u03A9)"],
        values: [
          this.sensorState.temperature.toFixed(2),
          this.sensorState.resistance.toFixed(2)
        ]
      };
    }
    get isSensor() {
      return true;
    }
    get sensorType() {
      return "thermal";
    }
    getStamp(nodeMap, frequency = 0) {
      const n1 = nodeMap.get(this.terminals[2].id);
      const n2 = nodeMap.get(this.terminals[3].id);
      const G = 1 / this.sensorState.resistance;
      const stamps = [];
      if (n1 !== 0) {
        stamps.push({ row: n1, col: n1, value: G });
        if (n2 !== 0) stamps.push({ row: n1, col: n2, value: -G });
      }
      if (n2 !== 0) {
        stamps.push({ row: n2, col: n2, value: G });
        if (n1 !== 0) stamps.push({ row: n2, col: n1, value: -G });
      }
      const ni1 = nodeMap.get(this.terminals[0].id);
      const ni2 = nodeMap.get(this.terminals[1].id);
      const Gin = 1 / 1e5;
      if (ni1 !== 0) {
        stamps.push({ row: ni1, col: ni1, value: Gin });
        if (ni2 !== 0) stamps.push({ row: ni1, col: ni2, value: -Gin });
      }
      if (ni2 !== 0) {
        stamps.push({ row: ni2, col: ni2, value: Gin });
        if (ni1 !== 0) stamps.push({ row: ni2, col: ni1, value: -Gin });
      }
      return { G: stamps, z: [] };
    }
    renderBody() {
      const tempBar = Math.min(24, this.sensorState.temperature / 200 * 24);
      return `
            <rect class="component-body" x="-60" y="-40" width="120" height="80" rx="6"/>

            <!-- Terminals Connections -->
            <line x1="-75" y1="-20" x2="-40" y2="-20" stroke="var(--component-stroke)" stroke-width="2.5"/>
            <line x1="-75" y1="20" x2="-40" y2="20" stroke="var(--component-stroke)" stroke-width="2.5"/>
            
            <g transform="translate(0, 0) scale(1.2)">
                <!-- Heater Symbol Left -->
                <rect x="-30" y="-12" width="15" height="24" rx="2" fill="#fee2e2" stroke="#ef4444" stroke-width="1.5"/>
                <path d="M-25 -12 L-25 12 M-20 -12 L-20 12 M-15 -12 L-15 12" stroke="#ef4444" stroke-width="1" opacity="0.3"/>
                <line x1="-40" y1="-17" x2="-30" y2="-8" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <line x1="-40" y1="17" x2="-30" y2="8" stroke="var(--component-stroke)" stroke-width="1.5"/>
                
                <!-- Sensor Element Right -->
                <rect x="5" y="-12" width="25" height="24" rx="2" fill="#f0fdf4" stroke="#22c55e" stroke-width="1.5"/>
                
                <!-- NTC Thermistor Symbol -->
                <line x1="17.5" y1="10" x2="17.5" y2="-10" stroke="#16a34a" stroke-width="1.5"/>
                <line x1="5" y1="12" x2="30" y2="-10" stroke="#16a34a" stroke-width="1.5"/>
                <path d="M12.5 -10 L17.5 -10 L17.5 10 L22.5 10" fill="none" stroke="#10b981" stroke-width="1.5"/>
                <text x="7" y="5" font-size="6" fill="#16a34a" transform="rotate(-40 7 5)">-t\xB0</text>

                <line x1="30" y1="-8" x2="45" y2="-17" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <line x1="30" y1="8" x2="45" y2="17" stroke="var(--component-stroke)" stroke-width="1.5"/>

                <!-- Thermal coupling arrows -->
                <path d="M-12 -6 L2 -6 M-12 0 L2 0 M-12 6 L2 6" stroke="#f59e0b" stroke-width="1" marker-end="url(#heat-arrow)"/>
            </g>

            <defs>
                <marker id="heat-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
                </marker>
            </defs>

            <!-- Thermometer Bar -->
            <rect x="-12" y="30" width="24" height="4" rx="1" fill="#cbd5e1" opacity="0.5"/>
            <rect x="-12" y="30" width="${tempBar}" height="4" rx="1" fill="#ef4444"/>

            <text x="-50" y="-24" font-size="4" fill="#ef4444" font-weight="bold">Heater (~1.5\xB0C/s @ 5V)</text>
            <text x="25" y="-22" text-anchor="middle" font-size="6" fill="#22c55e" font-weight="bold">Thermistor NTC</text>
            <text x="0" y="38" text-anchor="middle" font-size="7" fill="#64748b">${this.sensorState.temperature.toFixed(1)}\xB0C</text>
            
            <line x1="75" y1="-20" x2="50" y2="-20" stroke="var(--component-stroke)" stroke-width="2.5"/>
            <line x1="75" y1="20" x2="50" y2="20" stroke="var(--component-stroke)" stroke-width="2.5"/>
        `;
    }
    getValueString() {
      return `R: ${this.sensorState.resistance.toFixed(2)} \u03A9`;
    }
    getBounds() {
      return { x: this.x - 85, y: this.y - 50, width: 170, height: 100 };
    }
    getLabelOffset() {
      return -47;
    }
    getValueOffset() {
      return 47;
    }
    resetSensor() {
      this.environment.reset();
      this.sensorState = { temperature: this.properties.ambientTemp, resistance: this.properties.r0 };
    }
  };

  // src/components/LVDT.js
  var LVDT = class extends Component {
    constructor(x = 0, y = 0) {
      super("lvdt", x, y);
      this.terminals = [
        new Terminal(this, "exc_pos", -90, -35),
        new Terminal(this, "exc_neg", 90, -35),
        new Terminal(this, "out_pos", -90, 35),
        new Terminal(this, "out_neg", 90, 35)
      ];
      this.properties = {
        displacement: 0,
        // mm, user slider (-maxDisplacement to +maxDisplacement)
        sensitivity: 0.2,
        // V/mm per volt excitation
        maxDisplacement: 10
        // mm
      };
      this.environment = new DisplacementEnvironment({
        maxDisplacement: this.properties.maxDisplacement
      });
      this.sensorState = {
        displacement: 0,
        outputVoltage: 0
      };
    }
    static get displayName() {
      return "LVDT";
    }
    static get icon() {
      return `
            <rect x="4" y="3" width="24" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <line x1="16" y1="6" x2="16" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M8 6 L8 18 M12 6 L12 18 M20 6 L20 18 M24 6 L24 18" stroke="currentColor" stroke-width="0.8" opacity="0.4"/>
            <line x1="0" y1="8" x2="4" y2="8" stroke="currentColor" stroke-width="1.5"/>
            <line x1="0" y1="16" x2="4" y2="16" stroke="currentColor" stroke-width="1.5"/>
            <line x1="28" y1="8" x2="32" y2="8" stroke="currentColor" stroke-width="1.5"/>
            <line x1="28" y1="16" x2="32" y2="16" stroke="currentColor" stroke-width="1.5"/>
        `;
    }
    static getDefaultProperties() {
      return { displacement: 0, sensitivity: 0.2, maxDisplacement: 10 };
    }
    static getPropertyDefinitions() {
      return [
        {
          name: "displacement",
          label: "Displacement",
          type: "range",
          unit: "mm",
          min: -10,
          max: 10,
          step: 0.1
        },
        { name: "sensitivity", label: "Sensitivity", type: "number", unit: "V/mm/V", min: 1e-3, step: 0.01 },
        { name: "maxDisplacement", label: "Max Displacement", type: "number", unit: "mm", min: 1 }
      ];
    }
    updateEnvironment(dt, excitationVoltage) {
      this.environment.maxDisplacement = this.properties.maxDisplacement;
      const disp = this.environment.update(dt, this.properties.displacement);
      const vOut = this.properties.sensitivity * disp * Math.abs(excitationVoltage);
      this.sensorState = { displacement: disp, outputVoltage: vOut };
      return this.sensorState;
    }
    getObservation() {
      return {
        headers: ["Displacement (mm)", "Output Voltage (V)"],
        values: [
          this.sensorState.displacement.toFixed(3),
          this.sensorState.outputVoltage.toFixed(4)
        ]
      };
    }
    get isSensor() {
      return true;
    }
    get sensorType() {
      return "displacement";
    }
    /**
     * MNA stamp: excitation as high-impedance load, output as dependent voltage source.
     * For simplicity, output modelled as conductance to ground with an injected current
     * to produce the desired output voltage.
     */
    getStamp(nodeMap, frequency = 0) {
      const stamps = [];
      const zStamps = [];
      const ni1 = nodeMap.get(this.terminals[0].id);
      const ni2 = nodeMap.get(this.terminals[1].id);
      const Gin = 1 / 1e5;
      if (ni1 !== 0) {
        stamps.push({ row: ni1, col: ni1, value: Gin });
        if (ni2 !== 0) stamps.push({ row: ni1, col: ni2, value: -Gin });
      }
      if (ni2 !== 0) {
        stamps.push({ row: ni2, col: ni2, value: Gin });
        if (ni1 !== 0) stamps.push({ row: ni2, col: ni1, value: -Gin });
      }
      const no1 = nodeMap.get(this.terminals[2].id);
      const no2 = nodeMap.get(this.terminals[3].id);
      const Gout = 1 / 1e3;
      const Iout = this.sensorState.outputVoltage * Gout;
      if (no1 !== 0) {
        stamps.push({ row: no1, col: no1, value: Gout });
        if (no2 !== 0) stamps.push({ row: no1, col: no2, value: -Gout });
        zStamps.push({ row: no1, value: Iout });
      }
      if (no2 !== 0) {
        stamps.push({ row: no2, col: no2, value: Gout });
        if (no1 !== 0) stamps.push({ row: no2, col: no1, value: -Gout });
        zStamps.push({ row: no2, value: -Iout });
      }
      return { G: stamps, z: zStamps };
    }
    renderBody() {
      const coreOffset = this.sensorState.displacement / this.properties.maxDisplacement * 35;
      return `
            <rect class="component-body" x="-75" y="-55" width="150" height="110" rx="6"/>

            <!-- Excitation Labels -->
            <text x="-50" y="-40" font-size="8" fill="#f97316" font-weight="600">EXC+</text>
            <text x="50" y="-40" font-size="8" fill="#f97316" font-weight="600">EXC-</text>
            
            <!-- Output Labels -->
            <text x="-50" y="50" font-size="8" fill="#22d3ee" font-weight="600">OUT+</text>
            <text x="50" y="50" font-size="8" fill="#22d3ee" font-weight="600">OUT-</text>

            <!-- Primary Coil (Top) -->
            <line x1="-90" y1="-35" x2="-45" y2="-35" stroke="var(--component-stroke)" stroke-width="2"/>
            <line x1="90" y1="-35" x2="45" y2="-35" stroke="var(--component-stroke)" stroke-width="2"/>
            <path d="M-45 -35 Q-38 -50 -32 -35 T-15 -35 T2 -35 T19 -35 T36 -35 T45 -35"
                  fill="none" stroke="var(--component-stroke)" stroke-width="1.8"/>

            <!-- Core (moving) -->
            <rect x="${coreOffset - 35}" y="-12" width="70" height="24" rx="2"
                  fill="url(#core-gradient)" stroke="#555" stroke-width="1.5"/>
            <defs>
                <linearGradient id="core-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#444"/>
                    <stop offset="50%" stop-color="#aaa"/>
                    <stop offset="100%" stop-color="#444"/>
                </linearGradient>
            </defs>

            <!-- Secondary Coils (Bottom, series opposing) -->
            <line x1="-90" y1="35" x2="-45" y2="35" stroke="var(--component-stroke)" stroke-width="2"/>
            <path d="M-45 35 Q-38 20 -32 35 T-15 35 T-7 35"
                  fill="none" stroke="var(--component-stroke)" stroke-width="1.8"/>
            
            <!-- Wire connecting the two secondaries -->
            <path d="M-7 35 L-7 20 L7 20 L7 35" fill="none" stroke="var(--component-stroke)" stroke-width="1.5"/>
            
            <path d="M7 35 Q14 20 21 35 T38 35 T45 35"
                  fill="none" stroke="var(--component-stroke)" stroke-width="1.8"/>
            <line x1="90" y1="35" x2="45" y2="35" stroke="var(--component-stroke)" stroke-width="2"/>
        `;
    }
    getValueString() {
      return `Core: ${this.sensorState.displacement.toFixed(1)}mm  |  Vout: ${this.sensorState.outputVoltage.toFixed(3)}V`;
    }
    getBounds() {
      return { x: this.x - 95, y: this.y - 65, width: 190, height: 130 };
    }
    getLabelOffset() {
      return -62;
    }
    getValueOffset() {
      return 65;
    }
    resetSensor() {
      this.environment.reset();
      this.properties.displacement = 0;
      this.sensorState = { displacement: 0, outputVoltage: 0 };
    }
  };

  // src/components/StrainGauge.js
  var StrainGauge = class extends Component {
    constructor(x = 0, y = 0) {
      super("strain_gauge", x, y);
      this.terminals = [
        new Terminal(this, "exc_pos", 0, -90),
        new Terminal(this, "exc_neg", 0, 90),
        new Terminal(this, "out_pos", -90, 0),
        new Terminal(this, "out_neg", 90, 0)
      ];
      this.properties = {
        force: 0,
        // N, user slider
        maxForce: 100,
        // N
        gaugeFactor: 2.1,
        // typical metallic strain gauge
        nominalR: 350,
        // Ω
        youngsModulus: 2e11,
        // Pa (steel)
        crossSection: 1e-6
        // m²
      };
      this.environment = new MechanicalEnvironment({
        maxForce: this.properties.maxForce,
        youngsModulus: this.properties.youngsModulus,
        crossSection: this.properties.crossSection
      });
      this.sensorState = {
        force: 0,
        strain: 0,
        deltaR: 0,
        outputVoltage: 0
      };
    }
    static get displayName() {
      return "Strain Gauge";
    }
    static get icon() {
      return `
            <rect x="6" y="3" width="20" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M10 7 L10 10 L14 10 L14 7 L18 7 L18 10 L22 10 L22 7"
                  fill="none" stroke="currentColor" stroke-width="1"/>
            <path d="M10 14 L10 17 L14 17 L14 14 L18 14 L18 17 L22 17 L22 14"
                  fill="none" stroke="currentColor" stroke-width="1"/>
            <line x1="0" y1="8" x2="6" y2="8" stroke="currentColor" stroke-width="1.5"/>
            <line x1="0" y1="16" x2="6" y2="16" stroke="currentColor" stroke-width="1.5"/>
            <line x1="26" y1="8" x2="32" y2="8" stroke="currentColor" stroke-width="1.5"/>
            <line x1="26" y1="16" x2="32" y2="16" stroke="currentColor" stroke-width="1.5"/>
        `;
    }
    static getDefaultProperties() {
      return { force: 0, maxForce: 100, gaugeFactor: 2.1, nominalR: 350, youngsModulus: 2e11, crossSection: 1e-6 };
    }
    static getPropertyDefinitions() {
      return [
        { name: "force", label: "Applied Force", type: "range", unit: "N", min: 0, max: 100, step: 0.5 },
        { name: "gaugeFactor", label: "Gauge Factor", type: "number", unit: "", min: 0.1, step: 0.1 },
        { name: "nominalR", label: "Nominal R", type: "number", unit: "\u03A9", min: 1 },
        { name: "maxForce", label: "Max Force", type: "number", unit: "N", min: 1 }
      ];
    }
    updateEnvironment(dt, excitationVoltage) {
      this.environment.maxForce = this.properties.maxForce;
      this.environment.youngsModulus = this.properties.youngsModulus;
      this.environment.crossSection = this.properties.crossSection;
      const { force, strain } = this.environment.update(dt, this.properties.force);
      const deltaR = this.properties.gaugeFactor * strain * this.properties.nominalR;
      const vOut = this.properties.gaugeFactor * strain / 4 * Math.abs(excitationVoltage);
      this.sensorState = { force, strain, deltaR, outputVoltage: vOut };
      return this.sensorState;
    }
    getObservation() {
      return {
        headers: ["Force (N)", "Strain", "\u0394R (\u03A9)", "Output (mV)"],
        values: [
          this.sensorState.force.toFixed(2),
          this.sensorState.strain.toExponential(3),
          this.sensorState.deltaR.toFixed(4),
          (this.sensorState.outputVoltage * 1e3).toFixed(4)
        ]
      };
    }
    get isSensor() {
      return true;
    }
    get sensorType() {
      return "mechanical";
    }
    getStamp(nodeMap, frequency = 0) {
      const stamps = [];
      const zStamps = [];
      const ni1 = nodeMap.get(this.terminals[0].id);
      const ni2 = nodeMap.get(this.terminals[1].id);
      const Gin = 1 / 1e5;
      if (ni1 !== 0) {
        stamps.push({ row: ni1, col: ni1, value: Gin });
        if (ni2 !== 0) stamps.push({ row: ni1, col: ni2, value: -Gin });
      }
      if (ni2 !== 0) {
        stamps.push({ row: ni2, col: ni2, value: Gin });
        if (ni1 !== 0) stamps.push({ row: ni2, col: ni1, value: -Gin });
      }
      const no1 = nodeMap.get(this.terminals[2].id);
      const no2 = nodeMap.get(this.terminals[3].id);
      const Gout = 1 / 1e3;
      const Iout = this.sensorState.outputVoltage * Gout;
      if (no1 !== 0) {
        stamps.push({ row: no1, col: no1, value: Gout });
        if (no2 !== 0) stamps.push({ row: no1, col: no2, value: -Gout });
        zStamps.push({ row: no1, value: Iout });
      }
      if (no2 !== 0) {
        stamps.push({ row: no2, col: no2, value: Gout });
        if (no1 !== 0) stamps.push({ row: no2, col: no1, value: -Gout });
        zStamps.push({ row: no2, value: -Iout });
      }
      return { G: stamps, z: zStamps };
    }
    renderBody() {
      const forcePct = Math.min(1, this.sensorState.force / this.properties.maxForce);
      const arrowLen = 15 + forcePct * 25;
      return `
            <rect class="component-body" x="-75" y="-75" width="150" height="150" rx="8"/>

            <!-- Excitation Labels (Top/Bottom) -->
            <text x="0" y="-68" text-anchor="middle" font-size="8" fill="#f97316" font-weight="600">EXC+</text>
            <text x="0" y="73" text-anchor="middle" font-size="8" fill="#f97316" font-weight="600">EXC-</text>
            
            <!-- Output Labels (Left/Right) -->
            <text x="-65" y="-6" font-size="8" fill="#22d3ee" font-weight="600">OUT+</text>
            <text x="40" y="-6" font-size="8" fill="#22d3ee" font-weight="600">OUT-</text>

            <g transform="translate(-18, 0) scale(1.2)">
                <!-- Diamond Bridge Lines -->
                <line x1="0" y1="-40" x2="-30" y2="0" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <line x1="-30" y1="0" x2="0" y2="40" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <line x1="0" y1="-40" x2="30" y2="0" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <line x1="30" y1="0" x2="0" y2="40" stroke="var(--component-stroke)" stroke-width="1.5"/>

                <!-- Resistors -->
                <rect x="-20" y="-25" width="10" height="10" transform="rotate(-53.1 -15 -20)" fill="var(--bg-primary)" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <rect x="10" y="-25" width="10" height="10" transform="rotate(53.1 15 -20)" fill="var(--bg-primary)" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <rect x="-20" y="15" width="10" height="10" transform="rotate(53.1 -15 20)" fill="var(--bg-primary)" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <rect x="10" y="15" width="10" height="10" transform="rotate(-53.1 15 20)" fill="var(--bg-primary)" id="rg" stroke="#34d399" stroke-width="2"/>
                
                <text x="25" y="25" font-size="5" fill="#34d399">Rg</text>
            </g>

            <!-- Terminal connecting lines -->
            <line x1="0" y1="-90" x2="0" y2="-48" stroke="var(--component-stroke)" stroke-width="2.5"/>
            <line x1="0" y1="48" x2="0" y2="90" stroke="var(--component-stroke)" stroke-width="2.5"/>
            <line x1="-90" y1="0" x2="-54" y2="0" stroke="var(--component-stroke)" stroke-width="2.5"/>
            <line x1="18" y1="0" x2="90" y2="0" stroke="var(--component-stroke)" stroke-width="2.5"/>

            <!-- Physical Strain Gauge Diagram -->
            <g transform="translate(45, 0) scale(1.3)">
                <!-- Substrate -->
                <rect x="-10" y="-25" width="20" height="50" rx="3" fill="#f8fafc" opacity="0.1" stroke="#94a3b8" stroke-width="1"/>
                <!-- Gauge wire -->
                <path d="M-5 -20 L-5 20 A2 2 0 0 0 -1 20 L-1 -20 A2 2 0 0 1 3 -20 L3 20 A2 2 0 0 0 7 20 L7 -20" 
                      fill="none" stroke="#fbbf24" stroke-width="1.2"/>
                
                <!-- Force Arrows (stretch/compress based on force) -->
                ${this.sensorState.force > 0 ? `
                    <!-- Pulling arrows -->
                    <line x1="0" y1="-30" x2="0" y2="-${30 + arrowLen}" stroke="#ef4444" stroke-width="2" marker-end="url(#arrow-up)"/>
                    <line x1="0" y1="30" x2="0" y2="${30 + arrowLen}" stroke="#ef4444" stroke-width="2" marker-end="url(#arrow-down)"/>
                ` : ""}
            </g>
            
            <defs>
                <marker id="arrow-up" viewBox="0 0 10 10" refX="5" refY="0" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 10 L 5 0 L 10 10 z" fill="#ef4444" />
                </marker>
                <marker id="arrow-down" viewBox="0 0 10 10" refX="5" refY="10" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 0 L 5 10 z" fill="#ef4444" />
                </marker>
            </defs>
        `;
    }
    getValueString() {
      return `Strain: ${this.sensorState.strain.toExponential(2)}  |  Vout: ${(this.sensorState.outputVoltage * 1e3).toFixed(2)}mV`;
    }
    getBounds() {
      return { x: this.x - 95, y: this.y - 95, width: 190, height: 190 };
    }
    getLabelOffset() {
      return -82;
    }
    getValueOffset() {
      return 85;
    }
    resetSensor() {
      this.environment.reset();
      this.properties.force = 0;
      this.sensorState = { force: 0, strain: 0, deltaR: 0, outputVoltage: 0 };
    }
  };

  // src/components/LoadCell.js
  var LoadCell = class extends Component {
    constructor(x = 0, y = 0) {
      super("load_cell", x, y);
      this.terminals = [
        new Terminal(this, "exc_pos", 0, -105),
        new Terminal(this, "exc_neg", 0, 105),
        new Terminal(this, "out_pos", -120, 0),
        new Terminal(this, "out_neg", 120, 0)
      ];
      this.properties = {
        weight: 0,
        // grams, user selects from dropdown
        ratedCapacity: 5e3,
        // grams (5 kg)
        sensitivity: 2e-3,
        // V/V (2 mV/V typical)
        amplifierGain: 100
        // internal amplification
      };
      this.environment = new MechanicalEnvironment({
        maxForce: this.properties.ratedCapacity,
        smoothingFactor: 0.12,
        noiseAmplitude: 2e-3
      });
      this.sensorState = {
        weight: 0,
        loadRatio: 0,
        rawVoltage: 0,
        outputVoltage: 0
      };
    }
    static get displayName() {
      return "Load Cell";
    }
    static get icon() {
      return `
            <rect x="4" y="6" width="24" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <line x1="16" y1="3" x2="16" y2="6" stroke="currentColor" stroke-width="1.5"/>
            <line x1="16" y1="18" x2="16" y2="21" stroke="currentColor" stroke-width="1.5"/>
            <line x1="13" y1="3" x2="19" y2="3" stroke="currentColor" stroke-width="1.5"/>
            <line x1="13" y1="21" x2="19" y2="21" stroke="currentColor" stroke-width="1.5"/>
            <line x1="0" y1="10" x2="4" y2="10" stroke="currentColor" stroke-width="1.5"/>
            <line x1="0" y1="14" x2="4" y2="14" stroke="currentColor" stroke-width="1.5"/>
            <line x1="28" y1="10" x2="32" y2="10" stroke="currentColor" stroke-width="1.5"/>
            <line x1="28" y1="14" x2="32" y2="14" stroke="currentColor" stroke-width="1.5"/>
        `;
    }
    static getDefaultProperties() {
      return { weight: 0, ratedCapacity: 5e3, sensitivity: 2e-3, amplifierGain: 100 };
    }
    static getPropertyDefinitions() {
      return [
        {
          name: "weight",
          label: "Weight",
          type: "select",
          unit: "g",
          options: [
            { value: 0, label: "0 g" },
            { value: 50, label: "50 g" },
            { value: 100, label: "100 g" },
            { value: 200, label: "200 g" },
            { value: 500, label: "500 g" },
            { value: 1e3, label: "1 kg" },
            { value: 2e3, label: "2 kg" },
            { value: 5e3, label: "5 kg" }
          ]
        },
        { name: "ratedCapacity", label: "Rated Capacity", type: "number", unit: "g", min: 100 },
        { name: "sensitivity", label: "Sensitivity", type: "number", unit: "V/V", min: 1e-4, step: 1e-4 },
        { name: "amplifierGain", label: "Amplifier Gain", type: "number", unit: "\xD7", min: 1 }
      ];
    }
    updateEnvironment(dt, excitationVoltage) {
      this.environment.maxForce = this.properties.ratedCapacity;
      const { force } = this.environment.update(dt, this.properties.weight);
      const loadRatio = Math.min(force / this.properties.ratedCapacity, 1);
      const rawV = this.properties.sensitivity * loadRatio * Math.abs(excitationVoltage);
      const ampV = rawV * this.properties.amplifierGain;
      this.sensorState = {
        weight: force,
        loadRatio,
        rawVoltage: rawV,
        outputVoltage: ampV
      };
      return this.sensorState;
    }
    getObservation() {
      return {
        headers: ["Weight (g)", "Load Ratio", "Raw V (mV)", "Output V (V)"],
        values: [
          this.sensorState.weight.toFixed(1),
          this.sensorState.loadRatio.toFixed(4),
          (this.sensorState.rawVoltage * 1e3).toFixed(4),
          this.sensorState.outputVoltage.toFixed(4)
        ]
      };
    }
    get isSensor() {
      return true;
    }
    get sensorType() {
      return "mechanical";
    }
    getStamp(nodeMap, frequency = 0) {
      const stamps = [];
      const zStamps = [];
      const ni1 = nodeMap.get(this.terminals[0].id);
      const ni2 = nodeMap.get(this.terminals[1].id);
      const Gin = 1 / 1e5;
      if (ni1 !== 0) {
        stamps.push({ row: ni1, col: ni1, value: Gin });
        if (ni2 !== 0) stamps.push({ row: ni1, col: ni2, value: -Gin });
      }
      if (ni2 !== 0) {
        stamps.push({ row: ni2, col: ni2, value: Gin });
        if (ni1 !== 0) stamps.push({ row: ni2, col: ni1, value: -Gin });
      }
      const no1 = nodeMap.get(this.terminals[2].id);
      const no2 = nodeMap.get(this.terminals[3].id);
      const Gout = 1 / 1e3;
      const Iout = this.sensorState.outputVoltage * Gout;
      if (no1 !== 0) {
        stamps.push({ row: no1, col: no1, value: Gout });
        if (no2 !== 0) stamps.push({ row: no1, col: no2, value: -Gout });
        zStamps.push({ row: no1, value: Iout });
      }
      if (no2 !== 0) {
        stamps.push({ row: no2, col: no2, value: Gout });
        if (no1 !== 0) stamps.push({ row: no2, col: no1, value: -Gout });
        zStamps.push({ row: no2, value: -Iout });
      }
      return { G: stamps, z: zStamps };
    }
    renderBody() {
      const weightPct = Math.min(1, this.sensorState.weight / this.properties.ratedCapacity);
      const deflection = weightPct * 15;
      return `
            <rect class="component-body" x="-90" y="-75" width="180" height="150" rx="8"/>

            <!-- Excitation Labels (Top/Bottom) -->
            <text x="0" y="-68" text-anchor="middle" font-size="8" fill="#f97316" font-weight="600">EXC+</text>
            <text x="0" y="73" text-anchor="middle" font-size="8" fill="#f97316" font-weight="600">EXC-</text>
            
            <!-- Output Labels (Left/Right) -->
            <text x="-75" y="-6" font-size="8" fill="#22d3ee" font-weight="600">OUT+</text>
            <text x="50" y="-6" font-size="8" fill="#22d3ee" font-weight="600">OUT-</text>

            <g transform="translate(-18, 0) scale(1.2)">
                <!-- Diamond Bridge Lines -->
                <line x1="0" y1="-40" x2="-30" y2="0" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <line x1="-30" y1="0" x2="0" y2="40" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <line x1="0" y1="-40" x2="30" y2="0" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <line x1="30" y1="0" x2="0" y2="40" stroke="var(--component-stroke)" stroke-width="1.5"/>

                <!-- Resistors -->
                <rect x="-20" y="-25" width="10" height="10" transform="rotate(-53.1 -15 -20)" fill="var(--bg-primary)" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <rect x="10" y="-25" width="10" height="10" transform="rotate(53.1 15 -20)" fill="var(--bg-primary)" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <rect x="-20" y="15" width="10" height="10" transform="rotate(53.1 -15 20)" fill="var(--bg-primary)" stroke="var(--component-stroke)" stroke-width="1.5"/>
                <rect x="10" y="15" width="10" height="10" transform="rotate(-53.1 15 20)" fill="var(--bg-primary)" stroke="var(--component-stroke)" stroke-width="1.5"/>

                <path d="M-6 -5 L6 5 M-6 5 L6 -5" stroke="#34d399" stroke-width="2" opacity="0.6"/> <!-- Bridge internal marking -->
            </g>

            <!-- Terminal connecting lines -->
            <line x1="0" y1="-105" x2="0" y2="-48" stroke="var(--component-stroke)" stroke-width="2.5"/>
            <line x1="0" y1="48" x2="0" y2="105" stroke="var(--component-stroke)" stroke-width="2.5"/>
            <line x1="-120" y1="0" x2="-54" y2="0" stroke="var(--component-stroke)" stroke-width="2.5"/>
            <line x1="18" y1="0" x2="120" y2="0" stroke="var(--component-stroke)" stroke-width="2.5"/>

            <!-- Physical Load Cell Diagram (Binocular Beam) -->
            <g transform="translate(45, 0) scale(1.3)">
                <!-- Fixed Mount -->
                <rect x="-5" y="-30" width="10" height="60" fill="#334155" rx="2"/>
                <!-- Bending Beam -->
                <path d="M 5 -15 L 40 -15 Q 45 -15 45 -10 L 45 10 Q 45 15 40 15 L 5 15 Z" 
                      fill="url(#beam-gradient)" stroke="#475569" stroke-width="1"/>
                
                <defs>
                    <linearGradient id="beam-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#cbd5e1"/>
                        <stop offset="50%" stop-color="#f8fafc"/>
                        <stop offset="100%" stop-color="#94a3b8"/>
                    </linearGradient>
                </defs>

                <!-- Binocular holes -->
                <circle cx="15" cy="0" r="10" fill="var(--bg-primary)" stroke="#475569" stroke-width="1"/>
                <circle cx="30" cy="0" r="10" fill="var(--bg-primary)" stroke="#475569" stroke-width="1"/>
                <!-- Thin section (strain locations) -->
                <path d="M 20 -2 L 25 -2 M 20 2 L 25 2" stroke="#475569" stroke-width="1"/>
                
                <!-- Strain gauges (red markers) -->
                <rect x="12" y="-16" width="6" height="2" fill="#ef4444"/>
                <rect x="27" y="-16" width="6" height="2" fill="#ef4444"/>
                <rect x="12" y="14" width="6" height="2" fill="#ef4444"/>
                <rect x="27" y="14" width="6" height="2" fill="#ef4444"/>

                <!-- Load Hanger (moves down) -->
                <g transform="translate(42, ${15 + deflection})">
                    <!-- Hook -->
                    <path d="M0 0 L0 15 Q0 20 -5 20 Q-10 20 -10 15" fill="none" stroke="#64748b" stroke-width="2"/>
                    <!-- Weight Blocks based on load -->
                    ${weightPct > 0 ? `
                        <rect x="-15" y="20" width="30" height="${10 + weightPct * 15}" 
                              fill="#f59e0b" stroke="#b45309" stroke-width="1" rx="2"/>
                        <text x="0" y="${28 + weightPct * 7}" text-anchor="middle" font-size="6" fill="#0f172a" font-weight="bold">
                            ${this.properties.weight}g
                        </text>
                    ` : ""}
                </g>
            </g>
        `;
    }
    getValueString() {
      const wStr = this.sensorState.weight >= 1e3 ? `${(this.sensorState.weight / 1e3).toFixed(2)}kg` : `${this.sensorState.weight.toFixed(0)}g`;
      return `Load: ${wStr}  |  Vout: ${(this.sensorState.outputVoltage * 1e3).toFixed(2)}mV`;
    }
    getBounds() {
      return { x: this.x - 125, y: this.y - 110, width: 250, height: 220 };
    }
    getLabelOffset() {
      return -82;
    }
    getValueOffset() {
      return 82;
    }
    resetSensor() {
      this.environment.reset();
      this.properties.weight = 0;
      this.sensorState = { weight: 0, loadRatio: 0, rawVoltage: 0, outputVoltage: 0 };
    }
  };

  // src/components/index.js
  var COMPONENTS = [
    VoltageSource,
    Ground,
    Junction,
    Resistor,
    Capacitor,
    Inductor,
    Ammeter,
    Voltmeter,
    Transformer,
    Wattmeter,
    ThreePhaseSource,
    Load,
    Oscilloscope,
    Diode,
    OpAmp,
    RTD,
    Thermistor,
    LVDT,
    StrainGauge,
    LoadCell
  ];
  var COMPONENT_MAP = new Map(
    COMPONENTS.map((C) => [new C().type, C])
  );
  function createComponent(type, x = 0, y = 0) {
    const ComponentClass = COMPONENT_MAP.get(type);
    if (!ComponentClass) {
      console.warn(`Unknown component type: ${type}`);
      return null;
    }
    return new ComponentClass(x, y);
  }
  function getAllComponents() {
    return COMPONENTS;
  }

  // src/core/Wire.js
  var wireIdCounter = 0;
  var Wire = class {
    /**
     * @param {Terminal} startTerminal - Starting terminal
     * @param {Terminal} endTerminal - Ending terminal (null if wire is being drawn)
     */
    constructor(startTerminal = null, endTerminal = null) {
      this.id = `wire_${++wireIdCounter}`;
      this.startTerminal = startTerminal;
      this.endTerminal = endTerminal;
      this.selected = false;
      this.element = null;
      this.points = [];
      this.bendOffset = null;
      if (startTerminal) {
        startTerminal.connect(this);
      }
      if (endTerminal) {
        endTerminal.connect(this);
      }
      if (startTerminal && endTerminal) {
        this.updatePath();
      }
    }
    /**
     * Check if wire is complete (has both terminals)
     * @returns {boolean}
     */
    isComplete() {
      return this.startTerminal !== null && this.endTerminal !== null;
    }
    /**
     * Set the end terminal and complete the wire
     * @param {Terminal} terminal 
     */
    setEndTerminal(terminal) {
      if (this.endTerminal) {
        this.endTerminal.disconnect(this);
      }
      this.endTerminal = terminal;
      if (terminal) {
        terminal.connect(this);
      }
      this.updatePath();
    }
    /**
     * Get the other terminal (given one terminal, return the other)
     * @param {Terminal} terminal 
     * @returns {Terminal|null}
     */
    getOtherTerminal(terminal) {
      if (terminal === this.startTerminal) return this.endTerminal;
      if (terminal === this.endTerminal) return this.startTerminal;
      return null;
    }
    /**
     * Calculate wire path points
     * Uses bendOffset if set, otherwise auto-centers
     */
    updatePath() {
      if (!this.startTerminal) return;
      const start = this.startTerminal.getPosition();
      const end = this.endTerminal ? this.endTerminal.getPosition() : start;
      let bendX;
      if (this.bendOffset !== null) {
        bendX = this.bendOffset;
      } else {
        bendX = (start.x + end.x) / 2;
      }
      this.points = [
        { x: start.x, y: start.y },
        { x: bendX, y: start.y },
        { x: bendX, y: end.y },
        { x: end.x, y: end.y }
      ];
      this.updateElement();
    }
    /**
     * Set the bend X position (for dragging)
     */
    setBendX(x) {
      this.bendOffset = x;
      this.updatePath();
    }
    /**
     * Get current bend X position
     */
    getBendX() {
      if (this.bendOffset !== null) {
        return this.bendOffset;
      }
      const start = this.startTerminal.getPosition();
      const end = this.endTerminal ? this.endTerminal.getPosition() : start;
      return (start.x + end.x) / 2;
    }
    /**
     * Reset to auto-routing (clear custom bend)
     */
    resetRouting() {
      this.bendOffset = null;
      this.updatePath();
    }
    /**
     * Update path to follow cursor (during wire drawing)
     * @param {number} x - Cursor X
     * @param {number} y - Cursor Y
     */
    updatePreview(x, y) {
      if (!this.startTerminal) return;
      const start = this.startTerminal.getPosition();
      const midX = (start.x + x) / 2;
      this.points = [
        { x: start.x, y: start.y },
        { x: midX, y: start.y },
        { x: midX, y },
        { x, y }
      ];
      this.updateElement();
    }
    /**
     * Select this wire
     */
    select() {
      this.selected = true;
      if (this.element) {
        this.element.classList.add("selected");
      }
    }
    /**
     * Deselect this wire
     */
    deselect() {
      this.selected = false;
      if (this.element) {
        this.element.classList.remove("selected");
      }
    }
    /**
     * Check if a point is near the wire path
     * @param {number} x 
     * @param {number} y 
     * @param {number} threshold 
     * @returns {boolean}
     */
    isNear(x, y, threshold = 5) {
      for (let i = 0; i < this.points.length - 1; i++) {
        const p1 = this.points[i];
        const p2 = this.points[i + 1];
        if (this.pointToSegmentDistance(x, y, p1.x, p1.y, p2.x, p2.y) <= threshold) {
          return true;
        }
      }
      return false;
    }
    /**
     * Calculate distance from point to line segment
     */
    pointToSegmentDistance(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq === 0) {
        return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
      }
      let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
      t = Math.max(0, Math.min(1, t));
      const nearestX = x1 + t * dx;
      const nearestY = y1 + t * dy;
      return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
    }
    /**
     * Generate SVG path string
     * @returns {string}
     */
    getPathString() {
      if (this.points.length < 2) return "";
      const [first, ...rest] = this.points;
      return `M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(" ");
    }
    /**
     * Render wire as SVG element
     * @param {boolean} isPreview - Whether this is a preview (being drawn)
     * @returns {SVGPathElement}
     */
    render(isPreview = false) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", isPreview ? "wire-preview" : `wire ${this.selected ? "selected" : ""}`);
      path.setAttribute("data-id", this.id);
      path.setAttribute("d", this.getPathString());
      this.element = path;
      return path;
    }
    /**
     * Update SVG element
     */
    updateElement() {
      if (!this.element) return;
      this.element.setAttribute("d", this.getPathString());
    }
    /**
     * Remove wire and disconnect from terminals
     */
    remove() {
      if (this.startTerminal) {
        this.startTerminal.disconnect(this);
      }
      if (this.endTerminal) {
        this.endTerminal.disconnect(this);
      }
      if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
    }
    /**
     * Serialize wire
     * @returns {Object}
     */
    serialize() {
      return {
        id: this.id,
        startTerminal: this.startTerminal?.id || null,
        endTerminal: this.endTerminal?.id || null,
        points: this.points.map((p) => ({ x: p.x, y: p.y }))
      };
    }
  };
  function setWireIdCounter(count) {
    wireIdCounter = count;
  }

  // src/core/CircuitGraph.js
  var CircuitGraph = class {
    constructor() {
      this.components = /* @__PURE__ */ new Map();
      this.wires = /* @__PURE__ */ new Map();
      this.nodes = /* @__PURE__ */ new Map();
      this.groundNode = null;
      this.onChange = null;
    }
    /**
     * Add a component to the circuit
     * @param {Component} component 
     */
    addComponent(component) {
      this.components.set(component.id, component);
      this.notifyChange("component-added", component);
    }
    /**
     * Remove a component and its connected wires
     * @param {string} componentId 
     */
    removeComponent(componentId) {
      const component = this.components.get(componentId);
      if (!component) return;
      for (const terminal of component.terminals) {
        for (const wire of [...terminal.connectedWires]) {
          this.removeWire(wire.id);
        }
      }
      if (component.element && component.element.parentNode) {
        component.element.parentNode.removeChild(component.element);
      }
      this.components.delete(componentId);
      this.notifyChange("component-removed", component);
    }
    /**
     * Add a wire to the circuit
     * @param {Wire} wire 
     */
    addWire(wire) {
      this.wires.set(wire.id, wire);
      this.notifyChange("wire-added", wire);
    }
    /**
     * Remove a wire
     * @param {string} wireId 
     */
    removeWire(wireId) {
      const wire = this.wires.get(wireId);
      if (!wire) return;
      wire.remove();
      this.wires.delete(wireId);
      this.notifyChange("wire-removed", wire);
    }
    /**
     * Get component by ID
     * @param {string} id 
     * @returns {Component|undefined}
     */
    getComponent(id) {
      return this.components.get(id);
    }
    /**
     * Get wire by ID
     * @param {string} id 
     * @returns {Wire|undefined}
     */
    getWire(id) {
      return this.wires.get(id);
    }
    /**
     * Find component at position
     * @param {number} x 
     * @param {number} y 
     * @returns {Component|null}
     */
    findComponentAt(x, y) {
      for (const component of this.components.values()) {
        if (component.containsPoint(x, y)) {
          return component;
        }
      }
      return null;
    }
    /**
     * Find terminal at position
     * @param {number} x 
     * @param {number} y 
     * @param {number} threshold 
     * @returns {{component: Component, terminal: Terminal}|null}
     */
    findTerminalAt(x, y, threshold = 10) {
      for (const component of this.components.values()) {
        const terminal = component.findTerminalAt(x, y, threshold);
        if (terminal) {
          return { component, terminal };
        }
      }
      return null;
    }
    /**
     * Find wire at position
     * @param {number} x 
     * @param {number} y 
     * @returns {Wire|null}
     */
    findWireAt(x, y) {
      for (const wire of this.wires.values()) {
        if (wire.isNear(x, y)) {
          return wire;
        }
      }
      return null;
    }
    /**
     * Deselect all components and wires
     */
    deselectAll() {
      for (const component of this.components.values()) {
        component.deselect();
      }
      for (const wire of this.wires.values()) {
        wire.deselect();
      }
    }
    /**
     * Get all selected components
     * @returns {Component[]}
     */
    getSelectedComponents() {
      return Array.from(this.components.values()).filter((c) => c.selected);
    }
    /**
     * Get component count
     * @returns {number}
     */
    getComponentCount() {
      return this.components.size;
    }
    /**
     * Get all components as array
     * @returns {Component[]}
     */
    getAllComponents() {
      return Array.from(this.components.values());
    }
    /**
     * Clear the entire circuit
     */
    clear() {
      for (const wire of this.wires.values()) {
        wire.remove();
      }
      this.wires.clear();
      for (const component of this.components.values()) {
        if (component.element && component.element.parentNode) {
          component.element.parentNode.removeChild(component.element);
        }
      }
      this.components.clear();
      this.nodes.clear();
      this.groundNode = null;
      resetNodeCounter();
      this.notifyChange("circuit-cleared", null);
    }
    /**
     * Build nodes from connections (for circuit analysis)
     * This creates the nodal structure needed for MNA
     */
    buildNodes() {
      this.nodes.clear();
      resetNodeCounter();
      const terminalToNode = /* @__PURE__ */ new Map();
      const parent = /* @__PURE__ */ new Map();
      const find = (id) => {
        if (!parent.has(id)) parent.set(id, id);
        if (parent.get(id) !== id) {
          parent.set(id, find(parent.get(id)));
        }
        return parent.get(id);
      };
      const union = (a, b) => {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA !== rootB) {
          parent.set(rootB, rootA);
        }
      };
      for (const component of this.components.values()) {
        for (const terminal of component.terminals) {
          parent.set(terminal.id, terminal.id);
        }
      }
      for (const wire of this.wires.values()) {
        if (wire.isComplete()) {
          union(wire.startTerminal.id, wire.endTerminal.id);
        }
      }
      const groups = /* @__PURE__ */ new Map();
      for (const component of this.components.values()) {
        for (const terminal of component.terminals) {
          const root = find(terminal.id);
          if (!groups.has(root)) {
            groups.set(root, []);
          }
          groups.get(root).push(terminal);
        }
      }
      let hasGround = false;
      for (const [root, terminals] of groups) {
        const isGround = terminals.some((t) => t.component.type === "ground");
        const node = new Node(isGround);
        if (isGround) {
          this.groundNode = node;
          hasGround = true;
        }
        for (const terminal of terminals) {
          node.addTerminal(terminal.id);
          terminalToNode.set(terminal.id, node.id);
          terminal.nodeId = node.id;
        }
        this.nodes.set(node.id, node);
      }
      return { terminalToNode, hasGround };
    }
    /**
     * Validate the circuit
     * @returns {{valid: boolean, errors: string[]}}
     */
    validate() {
      const errors = [];
      if (this.components.size === 0) {
        errors.push("Circuit is empty");
        return { valid: false, errors };
      }
      const { hasGround } = this.buildNodes();
      if (!hasGround) {
        errors.push("Circuit must have a ground reference");
      }
      for (const component of this.components.values()) {
        for (const terminal of component.terminals) {
          if (!terminal.isConnected() && component.type !== "ground" && component.type !== "transformer" && component.type !== "oscilloscope") {
            if (terminal.isHidden) continue;
            errors.push(`${component.getLabel()} has unconnected terminal: ${terminal.name}`);
          }
        }
      }
      const hasSources = Array.from(this.components.values()).some(
        (c) => c.type === "voltage_source" || c.type === "current_source" || c.type === "three_phase_source"
      );
      if (!hasSources) {
        errors.push("Circuit needs at least one source");
      }
      return {
        valid: errors.length === 0,
        errors
      };
    }
    /**
     * Clear the entire circuit
     */
    clear() {
      for (const component of this.components.values()) {
        if (component.element && component.element.parentNode) {
          component.element.parentNode.removeChild(component.element);
        }
      }
      for (const wire of this.wires.values()) {
        if (wire.element && wire.element.parentNode) {
          wire.element.parentNode.removeChild(wire.element);
        }
      }
      this.components.clear();
      this.wires.clear();
      this.nodes.clear();
      this.groundNode = null;
      this.notifyChange("circuit-cleared", null);
    }
    /**
     * Generate netlist for simulation
     * @returns {Array<{type: string, nodes: string[], properties: Object}>}
     */
    generateNetlist() {
      this.buildNodes();
      const netlist = [];
      for (const component of this.components.values()) {
        if (component.type === "ground") continue;
        const nodeIds = component.terminals.map((t) => t.nodeId);
        netlist.push({
          id: component.id,
          type: component.type,
          nodes: nodeIds,
          properties: { ...component.properties }
        });
      }
      return netlist;
    }
    /**
     * Notify change listeners
     * @param {string} type 
     * @param {*} data 
     */
    notifyChange(type, data) {
      if (this.onChange) {
        this.onChange(type, data);
      }
    }
    /**
     * Serialize circuit to JSON
     * @returns {Object}
     */
    serialize() {
      return {
        components: Array.from(this.components.values()).map((c) => c.serialize()),
        wires: Array.from(this.wires.values()).map((w) => w.serialize())
      };
    }
    /**
     * Get statistics
     * @returns {Object}
     */
    getStats() {
      return {
        components: this.components.size,
        wires: this.wires.size,
        nodes: this.nodes.size
      };
    }
    /**
     * Find terminal by ID
     * @param {string} id 
     * @returns {Terminal|null}
     */
    findTerminalById(id) {
      if (!id) return null;
      for (const component of this.components.values()) {
        for (const terminal of component.terminals) {
          if (terminal.id === id) return terminal;
        }
      }
      return null;
    }
    /**
     * Deserialize circuit from JSON
     * @param {Object} data 
     */
    deserialize(data) {
      this.clear();
      if (!data || !data.components) return;
      let maxCompId = 0;
      for (const compData of data.components) {
        const component = createComponent(compData.type, compData.x, compData.y);
        if (component) {
          component.id = compData.id;
          const idNum = parseInt(component.id.replace("comp_", ""));
          if (!isNaN(idNum) && idNum > maxCompId) maxCompId = idNum;
          component.rotation = compData.rotation;
          component.properties = { ...compData.properties };
          for (const terminal of component.terminals) {
            terminal.id = `${component.id}_${terminal.name}`;
            terminal.component = component;
          }
          component.updateElement();
          this.addComponent(component);
        }
      }
      setComponentIdCounter(maxCompId);
      let maxWireId = 0;
      if (data.wires) {
        for (const wireData of data.wires) {
          const startTerm = this.findTerminalById(wireData.startTerminal);
          const endTerm = this.findTerminalById(wireData.endTerminal);
          if (startTerm && endTerm) {
            const wire = new Wire(startTerm, endTerm);
            wire.id = wireData.id;
            const idNum = parseInt(wire.id.replace("wire_", ""));
            if (!isNaN(idNum) && idNum > maxWireId) maxWireId = idNum;
            if (wireData.points && wireData.points.length > 0) {
              wire.points = wireData.points;
              if (wireData.points.length >= 2) {
                const bendX = wireData.points[1].x;
                wire.bendOffset = bendX;
              }
            }
            this.addWire(wire);
          } else {
            console.warn(`Skipping wire ${wireData.id}: Terminal not found (start=${wireData.startTerminal}, end=${wireData.endTerminal})`);
          }
        }
      }
      setWireIdCounter(maxWireId);
      this.notifyChange("circuit-loaded", null);
    }
  };

  // src/ui/Canvas.js
  var Canvas = class {
    /**
     * @param {SVGSVGElement} svgElement - The main SVG canvas
     * @param {CircuitGraph} circuitGraph - Circuit topology manager
     */
    constructor(svgElement, circuitGraph2) {
      this.svg = svgElement;
      this.circuit = circuitGraph2;
      this.componentsLayer = svgElement.querySelector("#components-layer");
      this.wiresLayer = svgElement.querySelector("#wires-layer");
      this.interactionLayer = svgElement.querySelector("#interaction-layer");
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.gridSize = 20;
      this.mode = "select";
      this.selectedComponent = null;
      this.selectedWire = null;
      this.dragging = false;
      this.dragStart = { x: 0, y: 0 };
      this.dragOffset = { x: 0, y: 0 };
      this.panning = false;
      this.panStart = { x: 0, y: 0 };
      this.panStartOffset = { x: 0, y: 0 };
      this.spaceHeld = false;
      this.placingComponent = null;
      this.placingComponentClass = null;
      this.pendingWireTerminal = null;
      this.draggingWire = null;
      this.wirePreview = null;
      this.draggingWireSegment = null;
      this.onSelectionChange = null;
      this.onComponentCountChange = null;
      this.setupEventListeners();
    }
    /**
     * Setup all event listeners
     */
    setupEventListeners() {
      this.svg.addEventListener("mousedown", this.handleMouseDown.bind(this));
      this.svg.addEventListener("mousemove", this.handleMouseMove.bind(this));
      this.svg.addEventListener("mouseup", this.handleMouseUp.bind(this));
      this.svg.addEventListener("mouseleave", this.handleMouseUp.bind(this));
      this.svg.addEventListener("dblclick", this.handleDoubleClick.bind(this));
      this.svg.addEventListener("wheel", this.handleWheel.bind(this), { passive: false });
      document.addEventListener("keydown", this.handleKeyDown.bind(this));
      document.addEventListener("keyup", (e) => {
        if (e.code === "Space") {
          this.spaceHeld = false;
          this.svg.style.cursor = "";
        }
      });
      this.svg.addEventListener("contextmenu", (e) => e.preventDefault());
      document.getElementById("btn-zoom-in")?.addEventListener("click", () => this.zoomIn());
      document.getElementById("btn-zoom-out")?.addEventListener("click", () => this.zoomOut());
      document.getElementById("btn-zoom-fit")?.addEventListener("click", () => this.zoomFit());
    }
    /**
     * Get mouse position in SVG coordinates
     */
    getMousePosition(event) {
      const rect = this.svg.getBoundingClientRect();
      const x = (event.clientX - rect.left - this.panX) / this.zoom;
      const y = (event.clientY - rect.top - this.panY) / this.zoom;
      return { x, y };
    }
    /**
     * Snap position to grid
     */
    snapToGrid(x, y) {
      return {
        x: Math.round(x / this.gridSize) * this.gridSize,
        y: Math.round(y / this.gridSize) * this.gridSize
      };
    }
    /**
     * Handle mouse down
     */
    handleMouseDown(event) {
      if (event.button === 1 || event.button === 2) {
        event.preventDefault();
        this.panning = true;
        this.panStart = { x: event.clientX, y: event.clientY };
        this.panStartOffset = { x: this.panX, y: this.panY };
        this.svg.style.cursor = "grabbing";
        return;
      }
      if (event.button !== 0) return;
      if (this.spaceHeld) {
        this.panning = true;
        this.panStart = { x: event.clientX, y: event.clientY };
        this.panStartOffset = { x: this.panX, y: this.panY };
        this.svg.style.cursor = "grabbing";
        return;
      }
      const pos = this.getMousePosition(event);
      const snapped = this.snapToGrid(pos.x, pos.y);
      const terminalHit = this.circuit.findTerminalAt(pos.x, pos.y);
      if (terminalHit) {
        this.handleTerminalClick(terminalHit.terminal);
        return;
      }
      if (this.pendingWireTerminal) {
        this.cancelWireDrawing();
      }
      const component = this.circuit.findComponentAt(pos.x, pos.y);
      if (component) {
        this.selectComponent(component);
        this.startDragging(component, pos);
        return;
      }
      const wire = this.circuit.findWireAt(pos.x, pos.y);
      if (wire) {
        this.selectWire(wire);
        this.draggingWireSegment = { wire };
        return;
      }
      this.deselectAll();
    }
    /**
     * Handle mouse move
     */
    handleMouseMove(event) {
      if (this.panning) {
        const dx = event.clientX - this.panStart.x;
        const dy = event.clientY - this.panStart.y;
        this.panX = this.panStartOffset.x + dx;
        this.panY = this.panStartOffset.y + dy;
        this.updateZoom();
        return;
      }
      const pos = this.getMousePosition(event);
      const snapped = this.snapToGrid(pos.x, pos.y);
      const statusCoords = document.getElementById("status-coords");
      if (statusCoords) {
        statusCoords.textContent = `X: ${Math.round(pos.x)}, Y: ${Math.round(pos.y)}`;
      }
      if (this.dragging && this.selectedComponent) {
        const newX = snapped.x + this.dragOffset.x;
        const newY = snapped.y + this.dragOffset.y;
        this.selectedComponent.moveTo(newX, newY);
        this.updateConnectedWires(this.selectedComponent);
      }
      if (this.draggingWireSegment) {
        this.draggingWireSegment.wire.setBendX(snapped.x);
      }
      if (this.draggingWire) {
        this.draggingWire.updatePreview(pos.x, pos.y);
      }
      if (this.placingComponent) {
        this.placingComponent.moveTo(snapped.x, snapped.y);
      }
    }
    /**
     * Handle mouse up
     */
    handleMouseUp(event) {
      if (this.panning) {
        this.panning = false;
        this.svg.style.cursor = this.spaceHeld ? "grab" : "";
        return;
      }
      const pos = this.getMousePosition(event);
      if (this.dragging) {
        this.dragging = false;
      }
      if (this.draggingWireSegment) {
        this.draggingWireSegment = null;
      }
      if (this.draggingWire) {
        const terminalHit = this.circuit.findTerminalAt(pos.x, pos.y);
        if (terminalHit && terminalHit.terminal !== this.draggingWire.startTerminal) {
          this.draggingWire.setEndTerminal(terminalHit.terminal);
          this.circuit.addWire(this.draggingWire);
          if (this.wirePreview) {
            this.wiresLayer.removeChild(this.wirePreview);
          }
          const wireElement = this.draggingWire.render();
          this.wiresLayer.appendChild(wireElement);
          this.cancelWireDrawing();
        }
      }
      if (this.placingComponent) {
        this.circuit.addComponent(this.placingComponent);
        this.updateComponentCount();
        this.selectComponent(this.placingComponent);
        this.placingComponent = null;
        this.placingComponentClass = null;
        this.mode = "select";
        this.updateStatusMode();
      }
    }
    /**
     * Handle double click (rotate component)
     */
    handleDoubleClick(event) {
      const pos = this.getMousePosition(event);
      const component = this.circuit.findComponentAt(pos.x, pos.y);
      if (component) {
        component.rotate();
        this.updateConnectedWires(component);
      }
    }
    /**
     * Handle mouse wheel for zoom (zoom centered on cursor)
     */
    handleWheel(event) {
      event.preventDefault();
      const rect = this.svg.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const zoomFactor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(0.1, Math.min(this.zoom * zoomFactor, 5));
      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;
      this.updateZoom();
    }
    /**
     * Handle keyboard shortcuts
     */
    handleKeyDown(event) {
      if (event.target.tagName === "INPUT" || event.target.tagName === "SELECT") {
        return;
      }
      switch (event.key) {
        case " ":
          if (!this.spaceHeld) {
            event.preventDefault();
            this.spaceHeld = true;
            this.svg.style.cursor = "grab";
          }
          break;
        case "Delete":
        case "Backspace":
          this.deleteSelected();
          break;
        case "Escape":
          this.cancelPlacement();
          this.cancelWireDrawing();
          this.deselectAll();
          break;
        case "r":
        case "R":
          if (this.selectedComponent) {
            this.selectedComponent.rotate();
            this.updateConnectedWires(this.selectedComponent);
          }
          break;
      }
    }
    /**
     * Start placing a component
     */
    startPlacement(ComponentClass) {
      this.cancelPlacement();
      const rect = this.svg.getBoundingClientRect();
      const centerX = (rect.width / 2 - this.panX) / this.zoom;
      const centerY = (rect.height / 2 - this.panY) / this.zoom;
      const snapped = this.snapToGrid(centerX, centerY);
      this.placingComponent = new ComponentClass(snapped.x, snapped.y);
      this.placingComponentClass = ComponentClass;
      this.mode = "place";
      const element = this.placingComponent.render();
      element.style.opacity = "0.7";
      this.componentsLayer.appendChild(element);
      this.updateStatusMode();
    }
    /**
     * Cancel component placement
     */
    cancelPlacement() {
      if (this.placingComponent && this.placingComponent.element) {
        this.componentsLayer.removeChild(this.placingComponent.element);
      }
      this.placingComponent = null;
      this.placingComponentClass = null;
      this.mode = "select";
      this.updateStatusMode();
    }
    /**
     * Place a component at specific position
     */
    placeComponentAt(ComponentClass, x, y) {
      const snapped = this.snapToGrid(x, y);
      const component = new ComponentClass(snapped.x, snapped.y);
      const element = component.render();
      this.componentsLayer.appendChild(element);
      this.circuit.addComponent(component);
      this.updateComponentCount();
      return component;
    }
    /**
     * Handle terminal click/drag for wires
     * Supports both click-to-connect and drag-to-connect
     */
    handleTerminalClick(terminal) {
      if (!this.pendingWireTerminal) {
        this.pendingWireTerminal = terminal;
        this.mode = "wire";
        this.updateStatusMode();
        if (terminal.element) {
          terminal.element.classList.add("terminal-selected");
        }
        this.draggingWire = new Wire(terminal, null);
        this.wirePreview = this.draggingWire.render(true);
        this.wiresLayer.appendChild(this.wirePreview);
      } else {
        if (terminal !== this.pendingWireTerminal) {
          const wire = new Wire(this.pendingWireTerminal, terminal);
          this.circuit.addWire(wire);
          const wireElement = wire.render();
          this.wiresLayer.appendChild(wireElement);
        }
        this.cancelWireDrawing();
      }
    }
    /**
     * Cancel wire drawing (both click and drag modes)
     */
    cancelWireDrawing() {
      if (this.pendingWireTerminal && this.pendingWireTerminal.element) {
        this.pendingWireTerminal.element.classList.remove("terminal-selected");
      }
      this.pendingWireTerminal = null;
      if (this.wirePreview && this.wirePreview.parentNode) {
        this.wirePreview.parentNode.removeChild(this.wirePreview);
      }
      this.draggingWire = null;
      this.wirePreview = null;
      this.mode = "select";
      this.updateStatusMode();
    }
    /**
     * Start a wire from a junction point on an existing wire (for parallel circuits)
     * Creates a virtual terminal at the click position
     */
    startWireFromJunction(existingWire, snappedPos) {
      const junctionTerminal = {
        id: `junction_${Date.now()}`,
        x: snappedPos.x,
        y: snappedPos.y,
        isJunction: true,
        connectedWire: existingWire,
        connectedWires: [],
        // Required Terminal interface methods
        getPosition: function() {
          return { x: this.x, y: this.y };
        },
        connect: function(wire) {
          this.connectedWires.push(wire);
        },
        disconnect: function(wire) {
          const idx = this.connectedWires.indexOf(wire);
          if (idx >= 0) this.connectedWires.splice(idx, 1);
        }
      };
      const newWire = new Wire(junctionTerminal, null);
      newWire.isFromJunction = true;
      newWire.junctionWire = existingWire;
      this.draggingWire = newWire;
      this.mode = "wire";
      this.updateStatusMode();
      this.wirePreview = document.createElementNS("http://www.w3.org/2000/svg", "g");
      this.wirePreview.classList.add("wire-preview");
      this.wiresLayer.appendChild(this.wirePreview);
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", snappedPos.x);
      dot.setAttribute("cy", snappedPos.y);
      dot.setAttribute("r", 5);
      dot.setAttribute("fill", "#3fb950");
      this.wirePreview.appendChild(dot);
    }
    /**
     * Start dragging a component
     */
    startDragging(component, mousePos) {
      this.dragging = true;
      const snapped = this.snapToGrid(mousePos.x, mousePos.y);
      this.dragOffset = {
        x: component.x - snapped.x,
        y: component.y - snapped.y
      };
    }
    /**
     * Select a component
     */
    selectComponent(component) {
      this.deselectAll();
      component.select();
      this.selectedComponent = component;
      if (this.onSelectionChange) {
        this.onSelectionChange("component", component);
      }
    }
    /**
     * Select a wire
     */
    selectWire(wire) {
      this.deselectAll();
      wire.select();
      this.selectedWire = wire;
      if (this.onSelectionChange) {
        this.onSelectionChange("wire", wire);
      }
    }
    /**
     * Deselect all
     */
    deselectAll() {
      this.circuit.deselectAll();
      this.selectedComponent = null;
      this.selectedWire = null;
      if (this.onSelectionChange) {
        this.onSelectionChange(null, null);
      }
    }
    /**
     * Delete selected component or wire
     */
    deleteSelected() {
      if (this.selectedComponent) {
        this.circuit.removeComponent(this.selectedComponent.id);
        this.selectedComponent = null;
        this.updateComponentCount();
      }
      if (this.selectedWire) {
        this.circuit.removeWire(this.selectedWire.id);
        this.selectedWire = null;
      }
      if (this.onSelectionChange) {
        this.onSelectionChange(null, null);
      }
    }
    /**
     * Update wires connected to a component
     */
    updateConnectedWires(component) {
      for (const terminal of component.terminals) {
        for (const wire of terminal.connectedWires) {
          wire.updatePath();
        }
      }
    }
    /**
     * Render a component to canvas
     */
    renderComponent(component) {
      const element = component.render();
      this.componentsLayer.appendChild(element);
    }
    /**
     * Render all elements from circuit graph
     * (Used after loading state)
     */
    renderAll() {
      this.componentsLayer.innerHTML = "";
      this.wiresLayer.innerHTML = "";
      this.interactionLayer.innerHTML = "";
      for (const component of this.circuit.components.values()) {
        this.renderComponent(component);
      }
      for (const wire of this.circuit.wires.values()) {
        const path = wire.render();
        this.wiresLayer.appendChild(path);
      }
      this.updateComponentCount();
    }
    /**
     * Clear canvas
     */
    clear() {
      this.circuit.clear();
      this.componentsLayer.innerHTML = "";
      this.wiresLayer.innerHTML = "";
      this.interactionLayer.innerHTML = "";
      this.deselectAll();
      this.updateComponentCount();
    }
    /**
     * Zoom in
     */
    zoomIn() {
      this.zoom = Math.min(this.zoom * 1.2, 3);
      this.updateZoom();
    }
    /**
     * Zoom out
     */
    zoomOut() {
      this.zoom = Math.max(this.zoom / 1.2, 0.25);
      this.updateZoom();
    }
    /**
     * Fit to view
     */
    zoomFit() {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.updateZoom();
    }
    /**
     * Update zoom transform
     */
    updateZoom() {
      const transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
      this.componentsLayer.style.transform = transform;
      this.wiresLayer.style.transform = transform;
      this.interactionLayer.style.transform = transform;
      const statusZoom = document.getElementById("status-zoom");
      if (statusZoom) {
        statusZoom.textContent = `Zoom: ${Math.round(this.zoom * 100)}%`;
      }
    }
    /**
     * Update status bar mode
     */
    updateStatusMode() {
      const statusMode = document.getElementById("status-mode");
      if (statusMode) {
        const modeText = {
          "select": "Edit",
          "place": `Placing: ${this.placingComponentClass?.displayName || "Component"}`,
          "wire": "Drawing Wire"
        };
        statusMode.textContent = `Mode: ${modeText[this.mode] || "Edit"}`;
      }
    }
    /**
     * Update component count in status bar
     */
    updateComponentCount() {
      const statusComponents = document.getElementById("status-components");
      if (statusComponents) {
        statusComponents.textContent = `Components: ${this.circuit.getComponentCount()}`;
      }
      if (this.onComponentCountChange) {
        this.onComponentCountChange(this.circuit.getComponentCount());
      }
    }
    /**
     * Export the current circuit as a high-resolution, professional PNG or SVG.
     * Overhauls aesthetics for a "clean" schematic look.
     * @param {string} format - 'svg' or 'png'
     */
    async exportAsImage(format = "png") {
      try {
        const componentsBBox = this.componentsLayer.getBBox();
        const wiresBBox = this.wiresLayer.getBBox();
        const hasComponents = this.circuit.getComponentCount() > 0;
        const hasWires = this.circuit.wires.size > 0;
        if (!hasComponents && !hasWires) {
          alert("Nothing to export! The canvas is empty.");
          return;
        }
        let x, y, w, h;
        if (hasComponents && hasWires) {
          x = Math.min(componentsBBox.x, wiresBBox.x);
          y = Math.min(componentsBBox.y, wiresBBox.y);
          w = Math.max(componentsBBox.x + componentsBBox.width, wiresBBox.x + wiresBBox.width) - x;
          h = Math.max(componentsBBox.y + componentsBBox.height, wiresBBox.y + wiresBBox.height) - y;
        } else if (hasComponents) {
          ({ x, y, width: w, height: h } = componentsBBox);
        } else {
          ({ x, y, width: w, height: h } = wiresBBox);
        }
        const padding = 80;
        const exportX = x - padding;
        const exportY = y - padding;
        const exportW = w + padding * 2;
        const exportH = h + padding * 2;
        const clone = this.svg.cloneNode(true);
        clone.setAttribute("viewBox", `${exportX} ${exportY} ${exportW} ${exportH}`);
        const exportScale = 2;
        clone.setAttribute("width", exportW * exportScale);
        clone.setAttribute("height", exportH * exportScale);
        const unwanted = clone.querySelectorAll(".grid-background, #interaction-layer, defs pattern");
        unwanted.forEach((el) => el.remove());
        const layers = clone.querySelectorAll(".components-layer, .wires-layer");
        layers.forEach((layer) => {
          layer.style.transform = "none";
          layer.removeAttribute("transform");
        });
        const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
        style.textContent = `
                :root {
                    --bg-export: #ffffff;
                    --stroke-comp: #0f172a;
                    --fill-comp: rgba(15, 23, 42, 0.02);
                    --stroke-wire: #0369a1;
                    --glow-wire: transparent;
                    --text-main: #0f172a;
                    --text-sub: #475569;
                }
                svg { 
                    background-color: var(--bg-export); 
                    font-family: 'Inter', system-ui, -apple-system, sans-serif; 
                }
                
                /* Components - Base Style */
                .component-group { 
                    stroke: var(--stroke-comp); 
                    fill: none;
                }
                
                .component-group .component-body { 
                    fill: var(--fill-comp); 
                    stroke: var(--stroke-comp); 
                    stroke-width: 2.5; 
                }
                
                /* Wires - Sharp & Connected */
                .wire { 
                    fill: none; 
                    stroke: var(--stroke-wire); 
                    stroke-width: 2.5; 
                    stroke-linecap: round;
                    stroke-linejoin: round;
                }
                
                /* Terminals - Tiny solid dots to fill any gaps */
                .component-group .terminal { 
                    display: block;
                    fill: var(--stroke-comp);
                    stroke: none;
                    r: 1.5px !important; /* Force a tiny sharp dot */
                }
                
                /* Symbols (+, -, waves, etc.) */
                .component-group line, 
                .component-group path:not(.component-body):not(.wire), 
                .component-group circle:not(.terminal) {
                    stroke: var(--stroke-comp);
                    stroke-width: 2;
                    fill: none;
                }
                
                /* Typography */
                .component-group text,
                .component-group .component-label { 
                    fill: var(--text-main); 
                    stroke: none;
                    font-size: 11px; 
                    font-weight: 700; 
                    text-anchor: middle; 
                }
                .component-group .component-value { 
                    fill: var(--text-sub); 
                    stroke: none;
                    font-size: 9px; 
                    font-weight: 500; 
                    text-anchor: middle; 
                }
                
                .component-stroke { stroke: var(--stroke-comp); stroke-width: 2.5; }
                * { vector-effect: non-scaling-stroke; }
            `;
        clone.appendChild(style);
        const svgData = new XMLSerializer().serializeToString(clone);
        if (format === "svg") {
          this._downloadFile(svgData, "image/svg+xml", `circuit_${Date.now()}.svg`);
        } else {
          await this._exportToPNG(svgData, exportW * exportScale, exportH * exportScale);
        }
      } catch (error) {
        console.error("Export failed:", error);
        alert("Export failed. Please check your circuit for invalid components.");
      }
    }
    /**
     * Internal helper to render SVG to a canvas and download as PNG
     */
    async _exportToPNG(svgData, width, height) {
      return new Promise((resolve, reject) => {
        const canvas2 = document.createElement("canvas");
        const ctx = canvas2.getContext("2d");
        canvas2.width = width;
        canvas2.height = height;
        const img = new Image();
        img.onload = () => {
          ctx.fillStyle = "#020617";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          canvas2.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `circuit_export_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            resolve();
          }, "image/png", 1);
        };
        img.onerror = reject;
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgData);
      });
    }
    /**
     * Download a string as a file
     */
    _downloadFile(content, type, filename) {
      const blob = new Blob([content], { type: `${type};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // src/ui/Toolbar.js
  var SVG_NS = "http://www.w3.org/2000/svg";
  var CATEGORIES = [
    {
      id: "sources",
      label: "Sources",
      icon: "\u26A1",
      types: ["voltage_source", "three_phase_source", "ground"]
    },
    {
      id: "passive",
      label: "Passive",
      icon: "\u{1F527}",
      types: ["resistor", "capacitor", "inductor", "junction"]
    },
    {
      id: "active",
      label: "Active",
      icon: "\u{1F50C}",
      types: ["diode", "opamp", "transformer", "load"]
    },
    {
      id: "instruments",
      label: "Instruments",
      icon: "\u{1F4CA}",
      types: ["ammeter", "voltmeter", "wattmeter", "oscilloscope"]
    },
    {
      id: "sensors",
      label: "Sensors",
      icon: "\u{1F321}\uFE0F",
      types: ["rtd", "thermistor", "lvdt", "strain_gauge", "load_cell"]
    }
  ];
  var Toolbar = class {
    /**
     * @param {HTMLElement} containerElement - The toolbar container
     * @param {Canvas} canvas - The canvas instance
     */
    constructor(containerElement, canvas2) {
      this.container = containerElement;
      this.componentList = containerElement.querySelector("#component-list") || containerElement;
      this.canvas = canvas2;
      this.searchInput = containerElement.querySelector("#component-search");
      this.render();
      this.setupEventListeners();
    }
    /**
     * Render all component items grouped by category
     */
    render() {
      this.componentList.innerHTML = "";
      const components = getAllComponents();
      const typeMap = /* @__PURE__ */ new Map();
      for (const C of components) {
        const instance = new C();
        typeMap.set(instance.type, C);
      }
      for (const category of CATEGORIES) {
        const categoryComponents = category.types.map((t) => typeMap.get(t)).filter(Boolean);
        if (categoryComponents.length === 0) continue;
        const section = document.createElement("div");
        section.className = "component-category";
        section.dataset.categoryId = category.id;
        const header = document.createElement("div");
        header.className = "category-header";
        header.innerHTML = `
                <span class="category-icon">${category.icon}</span>
                <span class="category-label">${category.label}</span>
                <svg class="category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            `;
        header.addEventListener("click", () => {
          section.classList.toggle("collapsed");
        });
        const grid = document.createElement("div");
        grid.className = "component-grid";
        for (const ComponentClass of categoryComponents) {
          const card = this.createComponentCard(ComponentClass);
          grid.appendChild(card);
        }
        section.appendChild(header);
        section.appendChild(grid);
        this.componentList.appendChild(section);
      }
    }
    /**
     * Create a component card element with proper SVG namespace
     */
    createComponentCard(ComponentClass) {
      const card = document.createElement("div");
      card.className = "component-card";
      const instance = new ComponentClass();
      card.dataset.type = instance.type;
      const iconWrap = document.createElement("div");
      iconWrap.className = "card-icon";
      const svgStr = `<svg xmlns="${SVG_NS}" viewBox="0 0 32 24">${ComponentClass.icon}</svg>`;
      iconWrap.innerHTML = svgStr;
      const name = document.createElement("span");
      name.className = "card-name";
      name.textContent = ComponentClass.displayName;
      const shortcut = document.createElement("span");
      shortcut.className = "card-shortcut";
      shortcut.textContent = ComponentClass.shortcut || "";
      card.appendChild(iconWrap);
      card.appendChild(name);
      if (ComponentClass.shortcut) {
        card.appendChild(shortcut);
      }
      card.addEventListener("click", () => {
        this.canvas.startPlacement(ComponentClass);
      });
      card._componentClass = ComponentClass;
      return card;
    }
    /**
     * Setup keyboard shortcuts and search
     */
    setupEventListeners() {
      document.addEventListener("keydown", (event) => {
        if (event.target.tagName === "INPUT" || event.target.tagName === "SELECT" || event.target.tagName === "TEXTAREA" || event.ctrlKey || event.metaKey || event.altKey) {
          return;
        }
        const key = event.key.toUpperCase();
        const components = getAllComponents();
        for (const ComponentClass of components) {
          if (ComponentClass.shortcut === key) {
            this.canvas.startPlacement(ComponentClass);
            event.preventDefault();
            break;
          }
        }
      });
      if (this.searchInput) {
        this.searchInput.addEventListener("input", () => {
          const query = this.searchInput.value.toLowerCase().trim();
          const cards = this.componentList.querySelectorAll(".component-card");
          const categories = this.componentList.querySelectorAll(".component-category");
          cards.forEach((card) => {
            const name = card.querySelector(".card-name").textContent.toLowerCase();
            const type = card.dataset.type.toLowerCase();
            const match = !query || name.includes(query) || type.includes(query);
            card.style.display = match ? "" : "none";
          });
          categories.forEach((cat) => {
            const visibleCards = cat.querySelectorAll('.component-card:not([style*="display: none"])');
            cat.style.display = visibleCards.length > 0 ? "" : "none";
            if (query) {
              cat.classList.remove("collapsed");
            }
          });
        });
      }
    }
    /**
     * Highlight active component in toolbar
     */
    setActive(componentType) {
      const cards = this.componentList.querySelectorAll(".component-card");
      cards.forEach((card) => {
        card.classList.toggle("active", card.dataset.type === componentType);
      });
    }
    /**
     * Clear active state
     */
    clearActive() {
      const cards = this.componentList.querySelectorAll(".component-card");
      cards.forEach((card) => card.classList.remove("active"));
    }
  };

  // src/ui/PropertyPanel.js
  var PropertyPanel = class {
    /**
     * @param {HTMLElement} containerElement - The property panel container
     * @param {Canvas} canvas - The canvas instance
     */
    constructor(containerElement, canvas2) {
      this.container = containerElement;
      this.content = containerElement.querySelector("#property-content") || containerElement;
      this.canvas = canvas2;
      this.currentComponent = null;
      this.onPropertyChange = null;
      if (canvas2) {
        canvas2.onSelectionChange = (type, item) => {
          if (type === "component") {
            this.showComponent(item);
          } else {
            this.showEmpty();
          }
        };
      }
    }
    /**
     * Show empty state
     */
    showEmpty() {
      this.currentComponent = null;
      this.content.innerHTML = '<p class="placeholder-text">Select a component to view properties</p>';
    }
    /**
     * Show component properties
     */
    showComponent(component) {
      this.currentComponent = component;
      this.content.innerHTML = "";
      const header = document.createElement("div");
      header.className = "property-header";
      header.innerHTML = `
            <span class="property-type">${component.constructor.displayName}</span>
            <span class="property-id">${component.getLabel()}</span>
        `;
      this.content.appendChild(header);
      const actions = document.createElement("div");
      actions.className = "property-actions";
      const rotateBtn = document.createElement("button");
      rotateBtn.className = "btn btn-secondary btn-small";
      rotateBtn.innerHTML = "\u21BB Rotate";
      rotateBtn.addEventListener("click", () => {
        component.rotate();
        this.canvas.updateConnectedWires(component);
        this.showComponent(component);
      });
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-secondary btn-small btn-danger";
      deleteBtn.innerHTML = "\u{1F5D1} Delete";
      deleteBtn.addEventListener("click", () => {
        this.canvas.deleteSelected();
      });
      actions.appendChild(rotateBtn);
      actions.appendChild(deleteBtn);
      this.content.appendChild(actions);
      const definitions = component.constructor.getPropertyDefinitions();
      if (definitions.length === 0) {
        const noProps = document.createElement("p");
        noProps.className = "placeholder-text";
        noProps.textContent = "No editable properties";
        this.content.appendChild(noProps);
      } else {
        for (const def of definitions) {
          if (def.condition) {
            const conditionMet = this.evaluateCondition(def.condition, component.properties);
            if (!conditionMet) continue;
          }
          const field = this.createPropertyField(component, def);
          this.content.appendChild(field);
        }
      }
      const posInfo = document.createElement("div");
      posInfo.className = "property-field position-info";
      posInfo.innerHTML = `
            <label>Position</label>
            <span class="position-value">X: ${component.x}, Y: ${component.y}</span>
        `;
      this.content.appendChild(posInfo);
      const rotInfo = document.createElement("div");
      rotInfo.className = "property-field";
      rotInfo.innerHTML = `
            <label>Rotation</label>
            <span class="rotation-value">${component.rotation}\xB0</span>
        `;
      this.content.appendChild(rotInfo);
    }
    /**
     * Create a property input field
     */
    createPropertyField(component, definition) {
      const field = document.createElement("div");
      field.className = "property-field";
      const label = document.createElement("label");
      label.textContent = definition.label;
      label.setAttribute("for", `prop-${definition.name}`);
      field.appendChild(label);
      let input;
      if (definition.type === "select") {
        input = document.createElement("select");
        input.className = "select-input";
        for (const opt of definition.options) {
          const option = document.createElement("option");
          if (typeof opt === "object" && opt.value !== void 0) {
            option.value = opt.value;
            option.textContent = opt.label || opt.value;
            option.selected = component.properties[definition.name] == opt.value;
          } else {
            option.value = opt;
            option.textContent = String(opt).toUpperCase();
            option.selected = component.properties[definition.name] === opt;
          }
          input.appendChild(option);
        }
      } else if (definition.type === "range") {
        const rangeWrapper = document.createElement("div");
        rangeWrapper.className = "range-wrapper";
        input = document.createElement("input");
        input.type = "range";
        input.className = "range-input";
        input.value = component.properties[definition.name];
        if (definition.min !== void 0) input.min = definition.min;
        if (definition.max !== void 0) input.max = definition.max;
        if (definition.step !== void 0) input.step = definition.step;
        const valueDisplay = document.createElement("span");
        valueDisplay.className = "range-value";
        valueDisplay.textContent = component.properties[definition.name];
        input.addEventListener("input", () => {
          valueDisplay.textContent = input.value;
        });
        rangeWrapper.appendChild(input);
        rangeWrapper.appendChild(valueDisplay);
        field.appendChild(label);
        if (definition.unit) {
          const unitSpan = document.createElement("span");
          unitSpan.className = "input-unit range-unit";
          unitSpan.textContent = definition.unit;
          rangeWrapper.appendChild(unitSpan);
        }
        field.appendChild(rangeWrapper);
        const updateRangeValue = () => {
          let value = parseFloat(input.value);
          if (isNaN(value)) return;
          component.setProperty(definition.name, value);
          if (this.onPropertyChange) {
            this.onPropertyChange(component, definition.name, value);
          }
        };
        input.addEventListener("input", updateRangeValue);
        input.addEventListener("change", updateRangeValue);
        input.id = `prop-${definition.name}`;
        return field;
      } else if (definition.type === "checkbox") {
        input = document.createElement("input");
        input.type = "checkbox";
        input.className = "checkbox-input";
        input.checked = component.properties[definition.name];
      } else {
        input = document.createElement("input");
        input.type = definition.type === "number" ? "number" : "text";
        input.className = "number-input";
        input.value = component.properties[definition.name];
        if (definition.min !== void 0) input.min = definition.min;
        if (definition.max !== void 0) input.max = definition.max;
        if (definition.step !== void 0) input.step = definition.step;
      }
      input.id = `prop-${definition.name}`;
      if (definition.unit) {
        const wrapper = document.createElement("div");
        wrapper.className = "input-with-unit";
        wrapper.appendChild(input);
        const unit = document.createElement("span");
        unit.className = "input-unit";
        unit.textContent = definition.unit;
        wrapper.appendChild(unit);
        field.appendChild(wrapper);
      } else {
        field.appendChild(input);
      }
      const updateValue = () => {
        let value;
        if (definition.type === "checkbox") {
          value = input.checked;
        } else {
          value = input.value;
          if (definition.type === "number") {
            value = parseFloat(value);
            if (isNaN(value)) return;
            if (definition.min !== void 0 && value < definition.min) value = definition.min;
            if (definition.max !== void 0 && value > definition.max) value = definition.max;
          }
        }
        component.setProperty(definition.name, value);
        if (this.onPropertyChange) {
          this.onPropertyChange(component, definition.name, value);
        }
        if (definition.name === "type") {
          this.showComponent(component);
        }
      };
      input.addEventListener("change", updateValue);
      input.addEventListener("blur", updateValue);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          updateValue();
          input.blur();
        }
      });
      return field;
    }
    /**
     * Evaluate a condition string against component properties
     * @param {string} condition - e.g. 'type === "ac"'
     * @param {Object} properties - Component properties
     * @returns {boolean}
     */
    evaluateCondition(condition, properties) {
      try {
        const match = condition.match(/(\w+)\s*(===|!==)\s*["']?(\w+)["']?/);
        if (match) {
          const [, propName, operator, value] = match;
          const propValue = properties[propName];
          if (operator === "===") {
            return propValue === value;
          } else if (operator === "!==") {
            return propValue !== value;
          }
        }
        return true;
      } catch {
        return true;
      }
    }
    /**
     * Refresh current component display
     */
    refresh() {
      if (this.currentComponent) {
        this.showComponent(this.currentComponent);
      }
    }
  };

  // src/simulation/Matrix.js
  var Matrix = class _Matrix {
    /**
     * Create a matrix
     * @param {number} rows 
     * @param {number} cols 
     * @param {number} fill - Initial value (default 0)
     */
    constructor(rows, cols, fill = 0) {
      this.rows = rows;
      this.cols = cols;
      this.data = [];
      for (let i = 0; i < rows; i++) {
        this.data[i] = [];
        for (let j = 0; j < cols; j++) {
          this.data[i][j] = fill;
        }
      }
    }
    /**
     * Get value at position
     */
    get(row, col) {
      return this.data[row][col];
    }
    /**
     * Set value at position
     */
    set(row, col, value) {
      this.data[row][col] = value;
    }
    /**
     * Add value to position (useful for stamping)
     */
    add(row, col, value) {
      this.data[row][col] += value;
    }
    /**
     * Create identity matrix
     */
    static identity(n) {
      const m = new _Matrix(n, n);
      for (let i = 0; i < n; i++) {
        m.set(i, i, 1);
      }
      return m;
    }
    /**
     * Create matrix from 2D array
     */
    static fromArray(arr) {
      const rows = arr.length;
      const cols = arr[0].length;
      const m = new _Matrix(rows, cols);
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          m.set(i, j, arr[i][j]);
        }
      }
      return m;
    }
    /**
     * Clone this matrix
     */
    clone() {
      const m = new _Matrix(this.rows, this.cols);
      for (let i = 0; i < this.rows; i++) {
        for (let j = 0; j < this.cols; j++) {
          m.set(i, j, this.get(i, j));
        }
      }
      return m;
    }
    /**
     * Convert to 2D array
     */
    toArray() {
      return this.data.map((row) => [...row]);
    }
    /**
     * Print matrix (for debugging)
     */
    print(label = "") {
      console.log(label);
      for (let i = 0; i < this.rows; i++) {
        console.log(this.data[i].map((v) => v.toFixed(4).padStart(10)).join(" "));
      }
    }
  };
  function solveLinearSystem(A, b) {
    const n = A.rows;
    const aug = new Matrix(n, n + 1);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        aug.set(i, j, A.get(i, j));
      }
      aug.set(i, n, b[i]);
    }
    for (let k = 0; k < n; k++) {
      let maxRow = k;
      let maxVal = Math.abs(aug.get(k, k));
      for (let i = k + 1; i < n; i++) {
        if (Math.abs(aug.get(i, k)) > maxVal) {
          maxVal = Math.abs(aug.get(i, k));
          maxRow = i;
        }
      }
      if (maxRow !== k) {
        for (let j = k; j <= n; j++) {
          const temp = aug.get(k, j);
          aug.set(k, j, aug.get(maxRow, j));
          aug.set(maxRow, j, temp);
        }
      }
      if (Math.abs(aug.get(k, k)) < 1e-14) {
        throw new Error(`Singular matrix at row ${k}. Circuit may have floating nodes or short circuits.`);
      }
      for (let i = k + 1; i < n; i++) {
        const factor = aug.get(i, k) / aug.get(k, k);
        for (let j = k; j <= n; j++) {
          aug.set(i, j, aug.get(i, j) - factor * aug.get(k, j));
        }
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = aug.get(i, n);
      for (let j = i + 1; j < n; j++) {
        sum -= aug.get(i, j) * x[j];
      }
      x[i] = sum / aug.get(i, i);
    }
    return x;
  }
  function testMatrixSolver() {
    console.log("=== Matrix Solver Test ===");
    const A = Matrix.fromArray([
      [2, 1],
      [1, 3]
    ]);
    const b = [5, 6];
    const x = solveLinearSystem(A, b);
    console.log("System: 2x + y = 5, x + 3y = 6");
    console.log("Solution:", x.map((v) => v.toFixed(4)));
    console.log("Expected: [1.8000, 1.4000]");
    const v1 = 2 * x[0] + x[1];
    const v2 = x[0] + 3 * x[1];
    console.log("Verification: 2x + y =", v1.toFixed(4), ", x + 3y =", v2.toFixed(4));
    const success = Math.abs(v1 - 5) < 1e-4 && Math.abs(v2 - 6) < 1e-4;
    console.log("Test:", success ? "\u2713 PASSED" : "\u2717 FAILED");
    return success;
  }

  // src/simulation/Complex.js
  var Complex = class _Complex {
    constructor(real = 0, imag = 0) {
      this.real = real;
      this.imag = imag;
    }
    // Addition
    add(other) {
      return new _Complex(
        this.real + other.real,
        this.imag + other.imag
      );
    }
    // Subtraction
    sub(other) {
      return new _Complex(
        this.real - other.real,
        this.imag - other.imag
      );
    }
    // Multiplication
    mul(other) {
      return new _Complex(
        this.real * other.real - this.imag * other.imag,
        this.real * other.imag + this.imag * other.real
      );
    }
    // Division
    div(other) {
      const denom = other.real * other.real + other.imag * other.imag;
      if (denom === 0) throw new Error("Division by zero");
      return new _Complex(
        (this.real * other.real + this.imag * other.imag) / denom,
        (this.imag * other.real - this.real * other.imag) / denom
      );
    }
    // Negate
    neg() {
      return new _Complex(-this.real, -this.imag);
    }
    // Magnitude |z|
    magnitude() {
      return Math.sqrt(this.real * this.real + this.imag * this.imag);
    }
    // Phase angle in radians
    phase() {
      return Math.atan2(this.imag, this.real);
    }
    // Phase angle in degrees
    phaseDegrees() {
      return this.phase() * 180 / Math.PI;
    }
    // Clone
    clone() {
      return new _Complex(this.real, this.imag);
    }
    // String representation
    toString() {
      if (this.imag === 0) return this.real.toFixed(4);
      if (this.real === 0) return `${this.imag.toFixed(4)}j`;
      const sign = this.imag >= 0 ? "+" : "";
      return `${this.real.toFixed(4)}${sign}${this.imag.toFixed(4)}j`;
    }
    // Polar form string
    toPolar() {
      return `${this.magnitude().toFixed(4)} \u2220 ${this.phaseDegrees().toFixed(1)}\xB0`;
    }
    // Static constructors
    static fromReal(r) {
      return new _Complex(r, 0);
    }
    static fromImag(i) {
      return new _Complex(0, i);
    }
    static fromPolar(magnitude, phaseRadians) {
      return new _Complex(
        magnitude * Math.cos(phaseRadians),
        magnitude * Math.sin(phaseRadians)
      );
    }
    static zero() {
      return new _Complex(0, 0);
    }
    static one() {
      return new _Complex(1, 0);
    }
    static j() {
      return new _Complex(0, 1);
    }
  };
  var ComplexMatrix = class _ComplexMatrix {
    constructor(rows, cols) {
      this.rows = rows;
      this.cols = cols;
      this.data = [];
      for (let i = 0; i < rows; i++) {
        this.data[i] = [];
        for (let j = 0; j < cols; j++) {
          this.data[i][j] = Complex.zero();
        }
      }
    }
    get(row, col) {
      return this.data[row][col];
    }
    set(row, col, value) {
      this.data[row][col] = value;
    }
    add(row, col, value) {
      this.data[row][col] = this.data[row][col].add(value);
    }
    clone() {
      const m = new _ComplexMatrix(this.rows, this.cols);
      for (let i = 0; i < this.rows; i++) {
        for (let j = 0; j < this.cols; j++) {
          m.set(i, j, this.get(i, j).clone());
        }
      }
      return m;
    }
    print(label = "") {
      console.log(label);
      for (let i = 0; i < this.rows; i++) {
        console.log(this.data[i].map((c) => c.toString().padStart(20)).join(" "));
      }
    }
  };
  function solveComplexSystem(A, b) {
    const n = A.rows;
    const aug = new ComplexMatrix(n, n + 1);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        aug.set(i, j, A.get(i, j).clone());
      }
      aug.set(i, n, b[i].clone());
    }
    for (let k = 0; k < n; k++) {
      let maxRow = k;
      let maxVal = aug.get(k, k).magnitude();
      for (let i = k + 1; i < n; i++) {
        const val = aug.get(i, k).magnitude();
        if (val > maxVal) {
          maxVal = val;
          maxRow = i;
        }
      }
      if (maxRow !== k) {
        for (let j = k; j <= n; j++) {
          const temp = aug.get(k, j);
          aug.set(k, j, aug.get(maxRow, j));
          aug.set(maxRow, j, temp);
        }
      }
      if (aug.get(k, k).magnitude() < 1e-12) {
        throw new Error(`Singular matrix at row ${k}`);
      }
      for (let i = k + 1; i < n; i++) {
        const factor = aug.get(i, k).div(aug.get(k, k));
        for (let j = k; j <= n; j++) {
          aug.set(i, j, aug.get(i, j).sub(factor.mul(aug.get(k, j))));
        }
      }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let sum = aug.get(i, n);
      for (let j = i + 1; j < n; j++) {
        sum = sum.sub(aug.get(i, j).mul(x[j]));
      }
      x[i] = sum.div(aug.get(i, i));
    }
    return x;
  }

  // src/simulation/MNASolver.js
  var MNASolver = class {
    constructor(circuitGraph2) {
      this.circuit = circuitGraph2;
      this.nodes = [];
      this.nodeMap = /* @__PURE__ */ new Map();
      this.voltageSources = [];
      this.transformers = [];
      this.threePhaseSources = [];
      this.result = null;
    }
    /**
     * Run DC analysis
     * Uses Newton-Raphson iteration for circuits containing nonlinear elements (diodes).
     * For purely linear circuits, converges in exactly 1 iteration.
     * @returns {{ nodeVoltages: Map, branchCurrents: Map, success: boolean, error: string }}
     */
    solveDC() {
      try {
        this.buildNodeList();
        if (this.nodes.length === 0) {
          return {
            success: false,
            error: "No nodes found. Add components to the circuit."
          };
        }
        if (!this.hasGround()) {
          return {
            success: false,
            error: "Circuit must have a ground reference. Add a Ground component."
          };
        }
        const n = this.nodes.length;
        const m = this.voltageSources.length;
        const t = this.transformers.length;
        const size = n + m + t;
        const components = this.circuit.getAllComponents();
        this.diodes = components.filter((c) => c.constructor.name === "Diode");
        const hasNonlinear = this.diodes.length > 0;
        const maxIter = hasNonlinear ? 100 : 1;
        const vtol = 1e-6;
        let solution = new Array(size).fill(0);
        if (hasNonlinear) {
          for (const diode of this.diodes) {
            const [t1] = diode.terminals;
            const nIdx = this.getNodeIndex(t1);
            if (nIdx !== null) solution[nIdx] = 0.6;
          }
        }
        console.log("=== MNA DC Analysis ===");
        console.log("Nodes:", this.nodes);
        if (hasNonlinear) console.log(`Newton-Raphson: ${this.diodes.length} diode(s) detected`);
        let converged = false;
        let iter = 0;
        for (iter = 0; iter < maxIter; iter++) {
          const { G, I } = this.buildMNASystem(solution);
          if (iter === 0) {
            console.log("G matrix:");
            G.print();
            console.log("I vector:", I);
          }
          const newSolution = solveLinearSystem(G, I);
          for (const comp of components) {
            if (comp.constructor.name === "OpAmp") {
              const vsat = comp.properties.saturationVoltage || 15;
              const nPole = this.getNodeIndex(comp.terminals[3]);
              const nOut = this.getNodeIndex(comp.terminals[2]);
              if (nPole !== null) {
                newSolution[nPole] = Math.max(-vsat, Math.min(vsat, newSolution[nPole]));
              }
              if (nOut !== null) {
                newSolution[nOut] = Math.max(-vsat, Math.min(vsat, newSolution[nOut]));
              }
            }
          }
          if (hasNonlinear) {
            let maxDiff = 0;
            for (let i = 0; i < n; i++) {
              maxDiff = Math.max(maxDiff, Math.abs(newSolution[i] - solution[i]));
            }
            solution = newSolution;
            if (maxDiff < vtol) {
              converged = true;
              console.log(`NR converged in ${iter + 1} iteration(s), max \u0394V = ${maxDiff.toExponential(2)}`);
              break;
            }
          } else {
            solution = newSolution;
            converged = true;
            break;
          }
        }
        if (!converged) {
          console.warn(`NR did not converge after ${maxIter} iterations`);
        }
        console.log("Solution:", solution);
        const nodeVoltages = /* @__PURE__ */ new Map();
        for (let i = 0; i < this.nodes.length; i++) {
          nodeVoltages.set(this.nodes[i], solution[i]);
        }
        const branchCurrents = /* @__PURE__ */ new Map();
        for (let i = 0; i < this.voltageSources.length; i++) {
          const vs = this.voltageSources[i];
          branchCurrents.set(vs.id, solution[this.nodes.length + i]);
        }
        this.result = { nodeVoltages, branchCurrents, success: true };
        return this.result;
      } catch (error) {
        console.error("MNA Solver error:", error);
        return {
          success: false,
          error: error.message
        };
      }
    }
    /**
     * Stamp non-ideal OpAmp for DC analysis
     */
    stampOpAmp(component, G, I) {
      const props = component.properties;
      const A0 = props.openLoopGain;
      const rout = Math.max(1e-3, props.rout);
      const rin = props.rin;
      const ric = props.rin * 50;
      const cmrr_linear = Math.pow(10, props.cmrr / 20);
      const Ac = A0 / cmrr_linear;
      const g_plus = A0 + Ac / 2;
      const g_minus = -A0 + Ac / 2;
      const g_out = 1 / rout;
      const G_id = 1 / rin;
      const G_ic = 1 / ric;
      const nPos = this.getNodeIndex(component.terminals[0]);
      const nNeg = this.getNodeIndex(component.terminals[1]);
      const nOut = this.getNodeIndex(component.terminals[2]);
      const nPole = this.getNodeIndex(component.terminals[3]);
      if (nPos !== null) G.add(nPos, nPos, G_id + G_ic);
      if (nNeg !== null) G.add(nNeg, nNeg, G_id + G_ic);
      if (nPos !== null && nNeg !== null) {
        G.add(nPos, nNeg, -G_id);
        G.add(nNeg, nPos, -G_id);
      }
      if (nPole !== null) {
        G.add(nPole, nPole, 1);
        if (nPos !== null) G.add(nPole, nPos, -g_plus);
        if (nNeg !== null) G.add(nPole, nNeg, -g_minus);
        if (props.offsetVoltage !== 0) {
          I[nPole] += A0 * props.offsetVoltage;
        }
      }
      if (nOut !== null) {
        G.add(nOut, nOut, g_out);
        if (nPole !== null) G.add(nOut, nPole, -g_out);
      }
    }
    /**
     * Stamp non-ideal OpAmp for AC analysis
     */
    stampACOpAmp(component, Y, I, omega) {
      const props = component.properties;
      const A0 = props.openLoopGain;
      const rout = Math.max(1e-3, props.rout);
      const rin = props.rin;
      const ric = props.rin * 50;
      const cmrr_linear = Math.pow(10, props.cmrr / 20);
      const Ac = A0 / cmrr_linear;
      const g_plus = Complex.fromReal(A0 + Ac / 2);
      const g_minus = Complex.fromReal(-A0 + Ac / 2);
      const g_out = Complex.fromReal(1 / rout);
      const G_id = Complex.fromReal(1 / rin);
      const G_ic = Complex.fromReal(1 / ric);
      const nPos = this.getNodeIndex(component.terminals[0]);
      const nNeg = this.getNodeIndex(component.terminals[1]);
      const nOut = this.getNodeIndex(component.terminals[2]);
      const nPole = this.getNodeIndex(component.terminals[3]);
      if (nPos !== null) Y.add(nPos, nPos, G_id.add(G_ic));
      if (nNeg !== null) Y.add(nNeg, nNeg, G_id.add(G_ic));
      if (nPos !== null && nNeg !== null) {
        Y.add(nPos, nNeg, G_id.neg());
        Y.add(nNeg, nPos, G_id.neg());
      }
      if (nPole !== null) {
        const fp = props.gbp / A0;
        const Cp = 1 / (2 * Math.PI * fp);
        const Ymag = omega * Cp;
        const yPole = new Complex(1, Ymag);
        Y.add(nPole, nPole, yPole);
        if (nPos !== null) Y.add(nPole, nPos, g_plus.neg());
        if (nNeg !== null) Y.add(nPole, nNeg, g_minus.neg());
        if (props.offsetVoltage !== 0) {
          const I_os = Complex.fromReal(A0 * props.offsetVoltage);
          I[nPole] = I[nPole] ? I[nPole].add(I_os) : I_os;
        }
      }
      if (nOut !== null) {
        Y.add(nOut, nOut, g_out);
        if (nPole !== null) Y.add(nOut, nPole, g_out.neg());
      }
    }
    /**
     * Run AC analysis at a given frequency
     * @param {number} frequency - Frequency in Hz
     * @returns {{ nodeVoltages: Map, branchCurrents: Map, success: boolean, error: string }}
     */
    solveAC(frequency = 1e3) {
      try {
        this.buildNodeList();
        if (this.nodes.length === 0) {
          return { success: false, error: "No nodes found." };
        }
        if (!this.hasGround()) {
          return { success: false, error: "Circuit must have a ground reference." };
        }
        const omega = 2 * Math.PI * frequency;
        const { Y, I } = this.buildACSystem(omega);
        console.log(`=== MNA AC Analysis @ ${frequency} Hz ===`);
        console.log("Nodes:", this.nodes);
        Y.print("Y matrix:");
        console.log("I vector:", I.map((c) => c.toString()));
        const solution = solveComplexSystem(Y, I);
        console.log("Solution:", solution.map((c) => c.toPolar()));
        const nodeVoltages = /* @__PURE__ */ new Map();
        for (let i = 0; i < this.nodes.length; i++) {
          nodeVoltages.set(this.nodes[i], solution[i]);
        }
        const branchCurrents = /* @__PURE__ */ new Map();
        for (let i = 0; i < this.voltageSources.length; i++) {
          const vs = this.voltageSources[i];
          branchCurrents.set(vs.id, solution[this.nodes.length + i]);
        }
        this.result = { nodeVoltages, branchCurrents, success: true, frequency };
        return this.result;
      } catch (error) {
        console.error("MNA AC Solver error:", error);
        return { success: false, error: error.message };
      }
    }
    /**
     * Build complex admittance matrix for AC analysis
     */
    buildACSystem(omega) {
      const n = this.nodes.length;
      const m = this.voltageSources.length;
      const t = this.transformers.length;
      const tp = this.threePhaseSources ? this.threePhaseSources.length : 0;
      const size = n + m + t + 3 * tp;
      const Y = new ComplexMatrix(size, size);
      const I = new Array(size).fill(null).map(() => Complex.zero());
      const components = this.circuit.getAllComponents();
      for (const component of components) {
        this.stampACComponent(component, Y, I, omega);
      }
      for (const vs of this.voltageSources) {
        if (vs._isScopeChannel) {
          this.stampACVoltageSource(vs, Y, I);
        }
      }
      return { Y, I };
    }
    /**
     * Stamp component for AC analysis
     */
    stampACComponent(component, Y, I, omega) {
      const type = component.constructor.name;
      switch (type) {
        case "Resistor":
          this.stampACResistor(component, Y);
          break;
        case "Capacitor":
          this.stampACCapacitor(component, Y, omega);
          break;
        case "Inductor":
          this.stampACInductor(component, Y, omega);
          break;
        case "VoltageSource":
        case "Ammeter":
          this.stampACVoltageSource(component, Y, I);
          break;
        case "Ground":
          break;
        case "Transformer":
          this.stampACTransformer(component, Y, I, omega);
          break;
        case "Voltmeter":
          this.stampACVoltmeter(component, Y);
          break;
        case "Wattmeter":
          this.stampACWattmeter(component, Y, I);
          break;
        case "ThreePhaseSource":
          this.stampThreePhaseSource(component, Y, I);
          break;
        case "Diode":
          this.stampACDiode(component, Y, omega);
          break;
        case "OpAmp":
          this.stampACOpAmp(component, Y, I, omega);
          break;
        case "Load":
          this.stampACLoad(component, Y, omega);
          break;
        case "Oscilloscope":
          this.stampACOscilloscope(component, Y);
          break;
      }
    }
    /**
     * Stamp resistor for AC (same as DC, but complex)
     */
    stampACResistor(component, Y) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const g = Complex.fromReal(1 / component.properties.resistance);
      if (n1 !== null) Y.add(n1, n1, g);
      if (n2 !== null) Y.add(n2, n2, g);
      if (n1 !== null && n2 !== null) {
        Y.add(n1, n2, g.neg());
        Y.add(n2, n1, g.neg());
      }
    }
    /**
     * Stamp capacitor: Y = jωC
     */
    stampACCapacitor(component, Y, omega) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const C = component.properties.capacitance;
      const y = new Complex(0, omega * C);
      if (n1 !== null) Y.add(n1, n1, y);
      if (n2 !== null) Y.add(n2, n2, y);
      if (n1 !== null && n2 !== null) {
        Y.add(n1, n2, y.neg());
        Y.add(n2, n1, y.neg());
      }
    }
    /**
     * Stamp inductor: Y = 1/(jωL) = -j/(ωL)
     */
    stampACInductor(component, Y, omega) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const L = component.properties.inductance;
      const y = new Complex(0, -1 / (omega * L));
      if (n1 !== null) Y.add(n1, n1, y);
      if (n2 !== null) Y.add(n2, n2, y);
      if (n1 !== null && n2 !== null) {
        Y.add(n1, n2, y.neg());
        Y.add(n2, n1, y.neg());
      }
    }
    /**
     * Stamp voltage source for AC
     */
    stampACVoltageSource(component, Y, I) {
      const [tPos, tNeg] = component.terminals;
      const n1 = this.getNodeIndex(tPos);
      const n2 = this.getNodeIndex(tNeg);
      const vsIndex = this.nodes.length + this.voltageSources.indexOf(component);
      let V = 0;
      let phase = 0;
      if (component.constructor.name !== "Ammeter") {
        V = component.properties.voltage;
        phase = (component.properties.phase || 0) * Math.PI / 180;
      }
      const Vphasor = Complex.fromPolar(V, phase);
      const one = Complex.one();
      if (n1 !== null) {
        Y.add(n1, vsIndex, one);
        Y.add(vsIndex, n1, one);
      }
      if (n2 !== null) {
        Y.add(n2, vsIndex, one.neg());
        Y.add(vsIndex, n2, one.neg());
      }
      I[vsIndex] = Vphasor;
    }
    /**
     * Stamp Voltmeter for AC (high resistance)
     */
    stampACVoltmeter(component, Y) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const g = Complex.fromReal(1 / 1e8);
      if (n1 !== null) Y.add(n1, n1, g);
      if (n2 !== null) Y.add(n2, n2, g);
      if (n1 !== null && n2 !== null) {
        Y.add(n1, n2, g.neg());
        Y.add(n2, n1, g.neg());
      }
    }
    /**
     * Stamp Wattmeter for AC analysis.
     * Current coil (M-L): 0V voltage source
     * Voltage coil (C-V): 100MΩ resistor
     */
    stampACWattmeter(component, Y, I) {
      const nM = this.getNodeIndex(component.terminals[0]);
      const nL = this.getNodeIndex(component.terminals[1]);
      const vsIndex = this.nodes.length + this.voltageSources.indexOf(component);
      const one = Complex.one();
      if (nM !== null) {
        Y.add(nM, vsIndex, one);
        Y.add(vsIndex, nM, one);
      }
      if (nL !== null) {
        Y.add(nL, vsIndex, one.neg());
        Y.add(vsIndex, nL, one.neg());
      }
      I[vsIndex] = Complex.zero();
      const nC = this.getNodeIndex(component.terminals[2]);
      const nV = this.getNodeIndex(component.terminals[3]);
      const g = Complex.fromReal(1 / 1e8);
      if (nC !== null) Y.add(nC, nC, g);
      if (nV !== null) Y.add(nV, nV, g);
      if (nC !== null && nV !== null) {
        Y.add(nC, nV, g.neg());
        Y.add(nV, nC, g.neg());
      }
    }
    /**
     * Stamp non-ideal transformer for AC analysis.
     * Full complex impedance model:
     *   - Series: Zeq = Req + jXeq between P+ and n_mid
     *   - Shunt:  Ysh = 1/Rc + 1/(jXm) between n_mid and P-
     *   - Ideal transformer: a:1 coupling n_mid/P- to S+/S-
     */
    stampACTransformer(component, Y, I, omega) {
      const a = component.properties.turnsRatio;
      const Req = component.properties.Req;
      const Xeq = component.properties.Xeq;
      const Rc = component.properties.Rc;
      const Xm = component.properties.Xm;
      const nPP = this.getNodeIndex(component.terminals[0]);
      const nPN = this.getNodeIndex(component.terminals[1]);
      const nSP = this.getNodeIndex(component.terminals[2]);
      const nSN = this.getNodeIndex(component.terminals[3]);
      const internalNodeId = `__xfmr_mid_${component.id}`;
      const nMid = this.nodeMap.get(internalNodeId);
      const xfmrIdx = this.transformers.indexOf(component);
      const iPrimIdx = this.nodes.length + this.voltageSources.length + xfmrIdx;
      const gleakPri = new Complex(1e-12, 0);
      const gleakSec = new Complex(1e-9, 0);
      if (nPP !== null) Y.add(nPP, nPP, gleakPri);
      if (nPN !== null) Y.add(nPN, nPN, gleakPri);
      if (nSP !== null) Y.add(nSP, nSP, gleakSec);
      if (nSN !== null) Y.add(nSN, nSN, gleakSec);
      const Zeq_re = Req;
      const Zeq_im = Xeq;
      const Zeq_mag2 = Zeq_re * Zeq_re + Zeq_im * Zeq_im;
      const Yeq = new Complex(Zeq_re / Zeq_mag2, -Zeq_im / Zeq_mag2);
      if (nPP !== null) Y.add(nPP, nPP, Yeq);
      if (nMid !== null) Y.add(nMid, nMid, Yeq);
      if (nPP !== null && nMid !== null) {
        Y.add(nPP, nMid, Yeq.neg());
        Y.add(nMid, nPP, Yeq.neg());
      }
      const Ysh = new Complex(1 / Rc, -1 / Xm);
      if (nMid !== null) Y.add(nMid, nMid, Ysh);
      if (nPN !== null) Y.add(nPN, nPN, Ysh);
      if (nMid !== null && nPN !== null) {
        Y.add(nMid, nPN, Ysh.neg());
        Y.add(nPN, nMid, Ysh.neg());
      }
      const one = Complex.one();
      const negOne = one.neg();
      const ca = Complex.fromReal(a);
      if (nMid !== null) {
        Y.add(iPrimIdx, nMid, one);
        Y.add(nMid, iPrimIdx, one);
      }
      if (nPN !== null) {
        Y.add(iPrimIdx, nPN, negOne);
        Y.add(nPN, iPrimIdx, negOne);
      }
      if (nSP !== null) {
        Y.add(iPrimIdx, nSP, ca.neg());
        Y.add(nSP, iPrimIdx, ca.neg());
      }
      if (nSN !== null) {
        Y.add(iPrimIdx, nSN, ca);
        Y.add(nSN, iPrimIdx, ca);
      }
      I[iPrimIdx] = Complex.zero();
    }
    /**
     * Build list of unique nodes from circuit
     */
    buildNodeList() {
      this.nodes = [];
      this.nodeMap = /* @__PURE__ */ new Map();
      this.voltageSources = [];
      this.transformers = [];
      const nodeSet = /* @__PURE__ */ new Set();
      const components = this.circuit.getAllComponents();
      for (const component of components) {
        if (component.constructor.name === "VoltageSource" || component.constructor.name === "Ammeter" || component.constructor.name === "Wattmeter") {
          this.voltageSources.push(component);
        }
        if (component.constructor.name === "Oscilloscope") {
          const channels = component.getChannelConfig();
          for (const ch of channels) {
            if (ch.mode === "Current" && ch.posTerminal.isConnected() && ch.negTerminal.isConnected()) {
              this.voltageSources.push({
                id: component.id + "_" + ch.id,
                _isScopeChannel: true,
                _scopeComponent: component,
                _channelId: ch.id,
                terminals: [ch.posTerminal, ch.negTerminal],
                constructor: { name: "OscilloscopeCurrentChannel" },
                properties: { voltage: 0 }
              });
            }
          }
        }
        if (component.constructor.name === "Transformer") {
          this.transformers.push(component);
        }
        if (component.constructor.name === "ThreePhaseSource") {
          this.threePhaseSources.push(component);
        }
        for (const terminal of component.terminals) {
          const nodeId = this.getNodeId(terminal);
          if (nodeId !== "ground" && nodeId !== null) {
            nodeSet.add(nodeId);
          }
        }
      }
      this.nodes = Array.from(nodeSet);
      for (let i = 0; i < this.transformers.length; i++) {
        const internalNodeId = `__xfmr_mid_${this.transformers[i].id}`;
        this.nodes.push(internalNodeId);
      }
      this.nodes.forEach((nodeId, index) => {
        this.nodeMap.set(nodeId, index);
      });
    }
    /**
     * Get unique node ID for a terminal
     * Returns 'ground' for grounded terminals
     */
    getNodeId(terminal) {
      const netTerminals = this.getNetTerminals(terminal);
      for (const t of netTerminals) {
        if (t.component.constructor.name === "Ground") {
          return "ground";
        }
      }
      let minId = terminal.id;
      for (const t of netTerminals) {
        if (t.id < minId) minId = t.id;
      }
      return minId;
    }
    /**
     * Get all terminals in the same net (connected by wires)
     */
    getNetTerminals(terminal) {
      const visited = /* @__PURE__ */ new Set();
      const queue = [terminal];
      const terminals = [];
      while (queue.length > 0) {
        const t = queue.shift();
        if (visited.has(t.id)) continue;
        visited.add(t.id);
        terminals.push(t);
        for (const wire of t.connectedWires) {
          const other = wire.getOtherTerminal(t);
          if (other && !visited.has(other.id)) {
            queue.push(other);
          }
        }
      }
      return terminals;
    }
    /**
     * Check if circuit has a ground reference
     */
    hasGround() {
      const components = this.circuit.getAllComponents();
      return components.some((c) => c.constructor.name === "Ground");
    }
    /**
     * Build MNA G matrix and I vector
     * @param {Array|null} prevSolution - Previous solution for NR linearization of nonlinear elements
     */
    buildMNASystem(prevSolution = null) {
      const n = this.nodes.length;
      const m = this.voltageSources.length;
      const t = this.transformers.length;
      const size = n + m + t;
      const G = new Matrix(size, size);
      const I = new Array(size).fill(0);
      const components = this.circuit.getAllComponents();
      for (const component of components) {
        this.stampComponent(component, G, I, prevSolution);
      }
      for (const vs of this.voltageSources) {
        if (vs._isScopeChannel) {
          this.stampVoltageSource(vs, G, I);
        }
      }
      return { G, I };
    }
    /**
     * Stamp a component into the MNA matrices
     */
    stampComponent(component, G, I, prevSolution = null) {
      const type = component.constructor.name;
      switch (type) {
        case "Resistor":
          this.stampResistor(component, G);
          break;
        case "VoltageSource":
        case "Ammeter":
          this.stampVoltageSource(component, G, I);
          break;
        case "Capacitor":
          break;
        case "Inductor":
          this.stampInductor(component, G);
          break;
        case "Ground":
          break;
        case "Transformer":
          this.stampTransformer(component, G, I);
          break;
        case "Voltmeter":
          this.stampVoltmeter(component, G);
          break;
        case "Wattmeter":
          this.stampWattmeter(component, G, I);
          break;
        case "Load":
          this.stampLoad(component, G);
          break;
        case "Oscilloscope":
          this.stampOscilloscope(component, G, I);
          break;
        case "Diode":
          this.stampDiode(component, G, I, prevSolution);
          break;
        case "OpAmp":
          this.stampOpAmp(component, G, I);
          break;
      }
    }
    /**
     * Stamp resistor: adds 1/R to diagonal, -1/R to off-diagonal
     */
    stampResistor(component, G) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const g = 1 / component.properties.resistance;
      if (n1 !== null) G.add(n1, n1, g);
      if (n2 !== null) G.add(n2, n2, g);
      if (n1 !== null && n2 !== null) {
        G.add(n1, n2, -g);
        G.add(n2, n1, -g);
      }
    }
    /**
     * Stamp inductor as short circuit for DC
     */
    stampInductor(component, G) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const g = 1e6;
      if (n1 !== null) G.add(n1, n1, g);
      if (n2 !== null) G.add(n2, n2, g);
      if (n1 !== null && n2 !== null) {
        G.add(n1, n2, -g);
        G.add(n2, n1, -g);
      }
    }
    /**
     * Stamp voltage source using MNA extra variables
     */
    stampVoltageSource(component, G, I) {
      const [tPos, tNeg] = component.terminals;
      const n1 = this.getNodeIndex(tPos);
      const n2 = this.getNodeIndex(tNeg);
      const vsIndex = this.nodes.length + this.voltageSources.indexOf(component);
      const V = component.constructor.name === "Ammeter" ? 0 : component.properties.voltage;
      if (n1 !== null) {
        G.add(n1, vsIndex, 1);
        G.add(vsIndex, n1, 1);
      }
      if (n2 !== null) {
        G.add(n2, vsIndex, -1);
        G.add(vsIndex, n2, -1);
      }
      I[vsIndex] = V;
    }
    /**
     * Stamp Voltmeter as a very high resistance
     */
    stampVoltmeter(component, G) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const g = 1 / 1e8;
      if (n1 !== null) G.add(n1, n1, g);
      if (n2 !== null) G.add(n2, n2, g);
      if (n1 !== null && n2 !== null) {
        G.add(n1, n2, -g);
        G.add(n2, n1, -g);
      }
    }
    /**
     * Stamp Oscilloscope — dual mode:
     *   Voltage mode: high-Z (100MΩ) across channel pair (parallel measurement)
     *   Current mode: 0V voltage source (series measurement, like ammeter)
     *   + tiny ground leakage on all terminals for unconnected ones
     */
    stampOscilloscope(component, G, I) {
      const gleak = 1e-12;
      for (const terminal of component.terminals) {
        const n = this.getNodeIndex(terminal);
        if (n !== null) G.add(n, n, gleak);
      }
      const channels = component.getChannelConfig();
      for (const ch of channels) {
        if (!ch.posTerminal.isConnected() || !ch.negTerminal.isConnected()) continue;
        if (ch.mode === "Voltage") {
          const g = 1 / 1e8;
          const n1 = this.getNodeIndex(ch.posTerminal);
          const n2 = this.getNodeIndex(ch.negTerminal);
          if (n1 !== null) G.add(n1, n1, g);
          if (n2 !== null) G.add(n2, n2, g);
          if (n1 !== null && n2 !== null) {
            G.add(n1, n2, -g);
            G.add(n2, n1, -g);
          }
        }
      }
    }
    /**
     * Stamp Diode for DC analysis (Newton-Raphson companion model).
     * 
     * Linearized model at operating point V_D:
     *   G_D = (Is / nVt) * exp(V_D / nVt)  — companion conductance
     *   I_eq = I_D - G_D * V_D              — companion current source
     * 
     * Matrix stamps (anode = n1, cathode = n2):
     *   G(n1,n1) += G_D,  G(n1,n2) -= G_D
     *   G(n2,n1) -= G_D,  G(n2,n2) += G_D
     *   I(n1) -= I_eq  (current out of anode)
     *   I(n2) += I_eq  (current into cathode)
     */
    stampDiode(component, G, I, prevSolution = null) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const v1 = prevSolution && n1 !== null ? prevSolution[n1] : 0;
      const v2 = prevSolution && n2 !== null ? prevSolution[n2] : 0;
      const Vd = v1 - v2;
      const { Id, Gd, Ieq } = component.computeDiodeModel(Vd);
      if (n1 !== null) G.add(n1, n1, Gd);
      if (n2 !== null) G.add(n2, n2, Gd);
      if (n1 !== null && n2 !== null) {
        G.add(n1, n2, -Gd);
        G.add(n2, n1, -Gd);
      }
      if (n1 !== null) I[n1] -= Ieq;
      if (n2 !== null) I[n2] += Ieq;
    }
    /**
     * Stamp Oscilloscope for AC analysis (same logic, complex admittance).
     */
    stampACOscilloscope(component, Y) {
      const gleak = 1e-12;
      for (const terminal of component.terminals) {
        const n = this.getNodeIndex(terminal);
        if (n !== null) Y.add(n, n, Complex.fromReal(gleak));
      }
      const channels = component.getChannelConfig();
      for (const ch of channels) {
        if (!ch.posTerminal.isConnected() || !ch.negTerminal.isConnected()) continue;
        if (ch.mode === "Voltage") {
          const g = 1 / 1e8;
          const gComplex = Complex.fromReal(g);
          const n1 = this.getNodeIndex(ch.posTerminal);
          const n2 = this.getNodeIndex(ch.negTerminal);
          if (n1 !== null) Y.add(n1, n1, gComplex);
          if (n2 !== null) Y.add(n2, n2, gComplex);
          if (n1 !== null && n2 !== null) {
            Y.add(n1, n2, gComplex.neg());
            Y.add(n2, n1, gComplex.neg());
          }
        }
      }
    }
    /**
     * Stamp Wattmeter for DC analysis.
     * Current coil (M-C, terminals[0]-terminals[1]): 0V voltage source (ammeter)
     * Voltage coil (L-V, terminals[2]-terminals[3]): 100MΩ resistor (voltmeter)
     */
    stampWattmeter(component, G, I) {
      const tM = component.terminals[0];
      const tL = component.terminals[1];
      const nM = this.getNodeIndex(tM);
      const nL = this.getNodeIndex(tL);
      const vsIndex = this.nodes.length + this.voltageSources.indexOf(component);
      if (nM !== null) {
        G.add(nM, vsIndex, 1);
        G.add(vsIndex, nM, 1);
      }
      if (nL !== null) {
        G.add(nL, vsIndex, -1);
        G.add(vsIndex, nL, -1);
      }
      I[vsIndex] = 0;
      const nC = this.getNodeIndex(component.terminals[2]);
      const nV = this.getNodeIndex(component.terminals[3]);
      const g = 1 / 1e8;
      if (nC !== null) G.add(nC, nC, g);
      if (nV !== null) G.add(nV, nV, g);
      if (nC !== null && nV !== null) {
        G.add(nC, nV, -g);
        G.add(nV, nC, -g);
      }
    }
    /**
     * Stamp non-ideal transformer for DC analysis.
     * 
     * Equivalent circuit (referred to primary):
     *   P+ ──[ Req ]── n_mid ──┬── ideal xfmr (a:1) ── S+
     *                          │
     *                          Rc (shunt)
     *                          │
     *   P− ────────────────────┴──────────────────────── S−
     * 
     * DC: Xeq = 0 (short), Xm = ∞ (open)
     * So only Req (series) and Rc (shunt) remain.
     * 
     * Ideal transformer adds 2 extra MNA rows:
     *   Row i1: KCL at n_mid includes primary current I_p
     *           V(n_mid) - V(P-) = a * (V(S+) - V(S-))
     *   Row i2: I_p + I_s/a = 0  (or equivalently, a*I_p + I_s = 0)
     *
     * We use the standard MNA ideal transformer stamp:
     *   Extra variable: I_p (primary winding current through ideal xfmr)
     *   Constraint: V(n_mid) - V(P-) - a*(V(S+) - V(S-)) = 0
     *   KCL contribution: I_p enters n_mid, a*I_p enters S+ (with sign conventions)
     */
    stampTransformer(component, G, I) {
      const a = component.properties.turnsRatio;
      const Req = component.properties.Req;
      const Rc = component.properties.Rc;
      const nPP = this.getNodeIndex(component.terminals[0]);
      const nPN = this.getNodeIndex(component.terminals[1]);
      const nSP = this.getNodeIndex(component.terminals[2]);
      const nSN = this.getNodeIndex(component.terminals[3]);
      const xfmrIdx = this.transformers.indexOf(component);
      const internalNodeId = `__xfmr_mid_${component.id}`;
      const nMid = this.nodeMap.get(internalNodeId);
      const iPrimIdx = this.nodes.length + this.voltageSources.length + xfmrIdx;
      const gleak = 1e-12;
      if (nPP !== null) G.add(nPP, nPP, gleak);
      if (nPN !== null) G.add(nPN, nPN, gleak);
      if (nSP !== null) G.add(nSP, nSP, gleak);
      if (nSN !== null) G.add(nSN, nSN, gleak);
      if (Req > 0) {
        const gReq = 1 / Req;
        if (nPP !== null) G.add(nPP, nPP, gReq);
        if (nMid !== null) G.add(nMid, nMid, gReq);
        if (nPP !== null && nMid !== null) {
          G.add(nPP, nMid, -gReq);
          G.add(nMid, nPP, -gReq);
        }
      }
      if (Rc > 0 && isFinite(Rc)) {
        const gRc = 1 / Rc;
        if (nMid !== null) G.add(nMid, nMid, gRc);
        if (nPN !== null) G.add(nPN, nPN, gRc);
        if (nMid !== null && nPN !== null) {
          G.add(nMid, nPN, -gRc);
          G.add(nPN, nMid, -gRc);
        }
      }
      if (nMid !== null) {
        G.add(iPrimIdx, nMid, 1);
        G.add(nMid, iPrimIdx, 1);
      }
      if (nPN !== null) {
        G.add(iPrimIdx, nPN, -1);
        G.add(nPN, iPrimIdx, -1);
      }
      if (nSP !== null) {
        G.add(iPrimIdx, nSP, -a);
        G.add(nSP, iPrimIdx, 1 / a);
      }
      if (nSN !== null) {
        G.add(iPrimIdx, nSN, a);
        G.add(nSN, iPrimIdx, -1 / a);
      }
      I[iPrimIdx] = 0;
    }
    /**
     * Get matrix index for a terminal's node
     * Returns null if grounded
     */
    getNodeIndex(terminal) {
      const nodeId = this.getNodeId(terminal);
      if (nodeId === "ground") return null;
      return this.nodeMap.get(nodeId) ?? null;
    }
    /**
     * Get formatted results string
     */
    getResultsString() {
      if (!this.result || !this.result.success) {
        return this.result?.error || "No results";
      }
      let output = "=== DC Analysis Results ===\n\n";
      output += "Node Voltages:\n";
      for (const [nodeId, voltage] of this.result.nodeVoltages) {
        output += `  ${nodeId}: ${voltage.toFixed(4)} V
`;
      }
      if (this.result.branchCurrents.size > 0) {
        output += "\nBranch Currents:\n";
        for (const [vsId, current] of this.result.branchCurrents) {
          output += `  ${vsId}: ${(current * 1e3).toFixed(4)} mA
`;
        }
      }
      return output;
    }
    /**
     * Stamp Three Phase Source (Star/Wye)
     * Adds 3 voltage constraints constraints (R-N, Y-N, B-N)
     */
    stampThreePhaseSource(component, Y, I) {
      const nR = this.getNodeIndex(component.terminals[0]);
      const nY = this.getNodeIndex(component.terminals[1]);
      const nB = this.getNodeIndex(component.terminals[2]);
      const nN = this.getNodeIndex(component.terminals[3]);
      const tpIdx = this.threePhaseSources.indexOf(component);
      const baseRow = this.nodes.length + this.voltageSources.length + this.transformers.length + 3 * tpIdx;
      const Vp = component.properties.voltage / Math.sqrt(3);
      const freq = component.properties.frequency;
      const phaseShift = component.properties.phaseShift || 0;
      const phases = [0, -120, 120];
      const nodeIndices = [nR, nY, nB];
      for (let k = 0; k < 3; k++) {
        const rowIdx = baseRow + k;
        const nPhase = nodeIndices[k];
        const phi = (phaseShift + phases[k]) * Math.PI / 180;
        const Vphasor = Complex.fromPolar(Vp, phi);
        const one = Complex.one();
        if (nPhase !== null) {
          Y.add(rowIdx, nPhase, one);
          Y.add(nPhase, rowIdx, one);
        }
        if (nN !== null) {
          Y.add(rowIdx, nN, one.neg());
          Y.add(nN, rowIdx, one.neg());
        }
        I[rowIdx] = Vphasor;
      }
    }
    /**
     * Stamp Load for DC analysis.
     * Load is series R + L. For DC, XL = 0, so stamp only R.
     * At 0% load → open circuit (very high resistance).
     */
    stampLoad(component, G) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const imp = component.getLoadImpedance();
      const R = imp ? imp.R : 1e9;
      const g = 1 / R;
      if (n1 !== null) G.add(n1, n1, g);
      if (n2 !== null) G.add(n2, n2, g);
      if (n1 !== null && n2 !== null) {
        G.add(n1, n2, -g);
        G.add(n2, n1, -g);
      }
    }
    /**
     * Stamp Load for AC analysis.
     * Z = R + jXL → Y = 1/(R + jXL) = (R - jXL) / (R² + XL²)
     * At 0% load → open circuit (tiny admittance).
     */
    stampACLoad(component, Y, omega) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const imp = component.getLoadImpedance();
      let y;
      if (!imp) {
        y = new Complex(1e-12, 0);
      } else {
        const R = imp.R;
        const XL = imp.XL;
        const denom = R * R + XL * XL;
        y = new Complex(R / denom, -XL / denom);
      }
      if (n1 !== null) Y.add(n1, n1, y);
      if (n2 !== null) Y.add(n2, n2, y);
      if (n1 !== null && n2 !== null) {
        Y.add(n1, n2, y.neg());
        Y.add(n2, n1, y.neg());
      }
    }
  };

  // src/simulation/TransientSolver.js
  var TransientSolver = class {
    constructor(circuitGraph2) {
      this.circuit = circuitGraph2;
      this.nodes = [];
      this.nodeMap = /* @__PURE__ */ new Map();
      this.voltageSources = [];
      this.time = 0;
      this.timeStep = 1e-4;
      this.endTime = 0.01;
      this.capacitorVoltages = /* @__PURE__ */ new Map();
      this.inductorCurrents = /* @__PURE__ */ new Map();
      this.diodeVoltages = /* @__PURE__ */ new Map();
      this.timePoints = [];
      this.results = /* @__PURE__ */ new Map();
    }
    /**
     * Run transient analysis
     * @param {number} endTime - End time in seconds
     * @param {number} timeStep - Time step in seconds
     * @returns {{ timePoints: number[], results: Map, success: boolean, error: string }}
     */
    solve(endTime = 0.01, timeStep = 1e-4) {
      try {
        this.endTime = endTime;
        this.timeStep = timeStep;
        this.time = 0;
        this.buildNodeList();
        if (this.nodes.length === 0) {
          return { success: false, error: "No nodes found." };
        }
        if (!this.hasGround()) {
          return { success: false, error: "Circuit must have a ground reference." };
        }
        this.initializeStates();
        this.timePoints = [];
        this.results = /* @__PURE__ */ new Map();
        for (const node of this.nodes) {
          this.results.set(node, []);
        }
        for (const vs of this.voltageSources) {
          this.results.set(vs.id + "_I", []);
        }
        const components = this.circuit.getAllComponents();
        this.resistors = [];
        this.capacitors = [];
        for (const comp of components) {
          if (comp.constructor.name === "Resistor") {
            this.resistors.push(comp);
            this.results.set(comp.id + "_I", []);
          } else if (comp.constructor.name === "Capacitor") {
            this.capacitors.push(comp);
            this.results.set(comp.id + "_I", []);
          } else if (comp.constructor.name === "Diode") {
            this.results.set(comp.id + "_I", []);
          }
        }
        this.diodes = components.filter((c) => c.constructor.name === "Diode");
        console.log(`=== Transient Analysis: 0 to ${endTime * 1e3}ms, step=${timeStep * 1e6}\xB5s ===`);
        while (this.time <= this.endTime) {
          const solution = this.solveTimeStep();
          for (let i = 0; i < solution.length; i++) {
            if (!isFinite(solution[i]) || Math.abs(solution[i]) > 1e15) {
              return {
                success: false,
                error: `Simulation diverged at t=${(this.time * 1e3).toFixed(4)}ms (node value: ${solution[i].toExponential(2)}). Check circuit connectivity and component values.`
              };
            }
          }
          this.timePoints.push(this.time);
          for (let i = 0; i < this.nodes.length; i++) {
            this.results.get(this.nodes[i]).push(solution[i]);
          }
          for (let i = 0; i < this.voltageSources.length; i++) {
            const vs = this.voltageSources[i];
            this.results.get(vs.id + "_I").push(solution[this.nodes.length + i]);
          }
          for (const r of this.resistors) {
            const [t1, t2] = r.terminals;
            const n1 = this.getNodeIndex(t1);
            const n2 = this.getNodeIndex(t2);
            const v1 = n1 !== null ? solution[n1] : 0;
            const v2 = n2 !== null ? solution[n2] : 0;
            const current = (v1 - v2) / r.properties.resistance;
            this.results.get(r.id + "_I").push(current);
          }
          for (const c of this.capacitors) {
            const [t1, t2] = c.terminals;
            const n1 = this.getNodeIndex(t1);
            const n2 = this.getNodeIndex(t2);
            const v1 = n1 !== null ? solution[n1] : 0;
            const v2 = n2 !== null ? solution[n2] : 0;
            const vNow = v1 - v2;
            const vPrev = this.capacitorVoltages.get(c.id) || 0;
            const current = c.properties.capacitance * (vNow - vPrev) / this.timeStep;
            this.results.get(c.id + "_I").push(current);
          }
          if (this.diodes) {
            for (const d of this.diodes) {
              const [t1, t2] = d.terminals;
              const n1 = this.getNodeIndex(t1);
              const n2 = this.getNodeIndex(t2);
              const v1 = n1 !== null ? solution[n1] : 0;
              const v2 = n2 !== null ? solution[n2] : 0;
              const Vd = v1 - v2;
              const { Id } = d.computeDiodeModel(Vd);
              this.results.get(d.id + "_I").push(Id);
            }
          }
          this.updateStates(solution);
          this.time += this.timeStep;
        }
        console.log(`Completed ${this.timePoints.length} time points`);
        return {
          success: true,
          timePoints: this.timePoints,
          results: this.results
        };
      } catch (error) {
        console.error("Transient Solver error:", error);
        return { success: false, error: error.message };
      }
    }
    /**
     * Build node list (same as MNA)
     */
    buildNodeList() {
      this.nodes = [];
      this.nodeMap = /* @__PURE__ */ new Map();
      this.voltageSources = [];
      const nodeSet = /* @__PURE__ */ new Set();
      const components = this.circuit.getAllComponents();
      for (const component of components) {
        if (component.constructor.name === "VoltageSource" || component.constructor.name === "Ammeter") {
          this.voltageSources.push(component);
        }
        if (component.constructor.name === "Oscilloscope") {
          const channels = component.getChannelConfig();
          for (const ch of channels) {
            if (ch.mode === "Current" && ch.posTerminal.isConnected() && ch.negTerminal.isConnected()) {
              this.voltageSources.push({
                id: component.id + "_" + ch.id,
                _isScopeChannel: true,
                _scopeComponent: component,
                _channelId: ch.id,
                terminals: [ch.posTerminal, ch.negTerminal],
                constructor: { name: "OscilloscopeCurrentChannel" },
                properties: { voltage: 0 }
              });
            }
          }
        }
        for (const terminal of component.terminals) {
          const nodeId = this.getNodeId(terminal);
          if (nodeId !== "ground" && nodeId !== null) {
            nodeSet.add(nodeId);
          }
        }
      }
      this.nodes = Array.from(nodeSet);
      this.nodes.forEach((nodeId, index) => {
        this.nodeMap.set(nodeId, index);
      });
    }
    /**
     * Get node ID for terminal
     */
    getNodeId(terminal) {
      const netTerminals = this.getNetTerminals(terminal);
      for (const t of netTerminals) {
        if (t.component.constructor.name === "Ground") {
          return "ground";
        }
      }
      let minId = terminal.id;
      for (const t of netTerminals) {
        if (t.id < minId) minId = t.id;
      }
      return minId;
    }
    /**
     * Get all terminals in same net
     */
    getNetTerminals(terminal) {
      const visited = /* @__PURE__ */ new Set();
      const queue = [terminal];
      const terminals = [];
      while (queue.length > 0) {
        const t = queue.shift();
        if (visited.has(t.id)) continue;
        visited.add(t.id);
        terminals.push(t);
        for (const wire of t.connectedWires) {
          const other = wire.getOtherTerminal(t);
          if (other && !visited.has(other.id)) {
            queue.push(other);
          }
        }
      }
      return terminals;
    }
    /**
     * Check for ground
     */
    hasGround() {
      const components = this.circuit.getAllComponents();
      return components.some((c) => c.constructor.name === "Ground");
    }
    /**
     * Initialize capacitor voltages and inductor currents to zero
     */
    initializeStates() {
      const components = this.circuit.getAllComponents();
      for (const component of components) {
        if (component.constructor.name === "Capacitor") {
          this.capacitorVoltages.set(component.id, 0);
        } else if (component.constructor.name === "Inductor") {
          this.inductorCurrents.set(component.id, 0);
        } else if (component.constructor.name === "Load") {
          this.inductorCurrents.set(component.id + "_L", 0);
        } else if (component.constructor.name === "Diode") {
          this.diodeVoltages.set(component.id, 0);
        }
      }
    }
    /**
     * Solve for one time step
     * Uses Newton-Raphson iteration when diodes are present.
     */
    solveTimeStep() {
      const n = this.nodes.length;
      const m = this.voltageSources.length;
      const size = n + m;
      const hasNonlinear = this.diodes && this.diodes.length > 0;
      const maxIter = hasNonlinear ? 50 : 1;
      const vtol = 1e-6;
      let solution = this._prevSolution || new Array(size).fill(0);
      for (let iter = 0; iter < maxIter; iter++) {
        const G = new Matrix(size, size);
        const I = new Array(size).fill(0);
        const components = this.circuit.getAllComponents();
        for (const component of components) {
          this.stampComponent(component, G, I, solution);
        }
        for (const vs of this.voltageSources) {
          if (vs._isScopeChannel) {
            this.stampAmmeter(vs, G, I);
          }
        }
        const newSolution = solveLinearSystem(G, I);
        for (const component of components) {
          if (component.constructor.name === "OpAmp") {
            const vsat = component.properties.saturationVoltage || 15;
            const nPole = this.getNodeIndex(component.terminals[3]);
            const nOut = this.getNodeIndex(component.terminals[2]);
            if (nPole !== null) {
              newSolution[nPole] = Math.max(-vsat, Math.min(vsat, newSolution[nPole]));
            }
            if (nOut !== null) {
              newSolution[nOut] = Math.max(-vsat, Math.min(vsat, newSolution[nOut]));
            }
          }
        }
        if (this.timePoints.length === 1 && iter === 0) {
          console.log(`--- Integrator Debug [t=${this.time}] ---`);
          G.print("Transient G Matrix:");
          console.log("Transient I Vector:", I);
          console.log("Solution V:", newSolution);
        }
        if (hasNonlinear) {
          let maxDiff = 0;
          for (let i = 0; i < n; i++) {
            maxDiff = Math.max(maxDiff, Math.abs(newSolution[i] - solution[i]));
          }
          solution = newSolution;
          if (maxDiff < vtol) break;
        } else {
          solution = newSolution;
          break;
        }
      }
      this._prevSolution = solution;
      return solution;
    }
    /**
     * Stamp component with companion model
     */
    stampComponent(component, G, I, prevSolution = null) {
      const type = component.constructor.name;
      switch (type) {
        case "Resistor":
          this.stampResistor(component, G);
          break;
        case "Capacitor":
          this.stampCapacitor(component, G, I);
          break;
        case "Inductor":
          this.stampInductor(component, G, I);
          break;
        case "VoltageSource":
          this.stampVoltageSource(component, G, I);
          break;
        case "Ammeter":
          this.stampAmmeter(component, G, I);
          break;
        case "Voltmeter":
          this.stampVoltmeter(component, G);
          break;
        case "Ground":
        case "Junction":
          break;
        case "Load":
          this.stampLoad(component, G, I);
          break;
        case "Oscilloscope":
          this.stampOscilloscope(component, G);
          break;
        case "Diode":
          this.stampDiode(component, G, I, prevSolution);
          break;
        case "OpAmp":
          this.stampOpAmp(component, G, I);
          break;
      }
    }
    /**
     * Stamp Oscilloscope — dual mode:
     *   Voltage mode: high-Z across channel pair
     *   Current mode: handled by virtual voltage source
     *   + ground leakage on all terminals
     */
    stampOscilloscope(component, G) {
      const gleak = 1e-12;
      for (const terminal of component.terminals) {
        const n = this.getNodeIndex(terminal);
        if (n !== null) G.add(n, n, gleak);
      }
      const channels = component.getChannelConfig();
      for (const ch of channels) {
        if (!ch.posTerminal.isConnected() || !ch.negTerminal.isConnected()) continue;
        if (ch.mode === "Voltage") {
          const g = 1 / 1e8;
          const n1 = this.getNodeIndex(ch.posTerminal);
          const n2 = this.getNodeIndex(ch.negTerminal);
          if (n1 !== null) G.add(n1, n1, g);
          if (n2 !== null) G.add(n2, n2, g);
          if (n1 !== null && n2 !== null) {
            G.add(n1, n2, -g);
            G.add(n2, n1, -g);
          }
        }
      }
    }
    /**
     * Stamp resistor (same as DC)
     */
    stampResistor(component, G) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const g = 1 / component.properties.resistance;
      if (n1 !== null) G.add(n1, n1, g);
      if (n2 !== null) G.add(n2, n2, g);
      if (n1 !== null && n2 !== null) {
        G.add(n1, n2, -g);
        G.add(n2, n1, -g);
      }
    }
    /**
     * Stamp capacitor using Backward Euler companion model
     * G = C/h, I_eq = C/h * v(n-1)
     */
    stampCapacitor(component, G, I) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const C = component.properties.capacitance;
      const h = this.timeStep;
      const g = C / h;
      const vPrev = this.capacitorVoltages.get(component.id) || 0;
      const iEq = g * vPrev;
      if (n1 !== null) G.add(n1, n1, g);
      if (n2 !== null) G.add(n2, n2, g);
      if (n1 !== null && n2 !== null) {
        G.add(n1, n2, -g);
        G.add(n2, n1, -g);
      }
      if (n1 !== null) I[n1] += iEq;
      if (n2 !== null) I[n2] -= iEq;
    }
    /**
     * Stamp inductor using Backward Euler companion model
     * G = h/L, I_eq = i(n-1)
     */
    stampInductor(component, G, I) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const L = component.properties.inductance;
      const h = this.timeStep;
      const g = h / L;
      const iPrev = this.inductorCurrents.get(component.id) || 0;
      if (n1 !== null) G.add(n1, n1, g);
      if (n2 !== null) G.add(n2, n2, g);
      if (n1 !== null && n2 !== null) {
        G.add(n1, n2, -g);
        G.add(n2, n1, -g);
      }
      if (n1 !== null) I[n1] -= iPrev;
      if (n2 !== null) I[n2] += iPrev;
    }
    /**
     * Stamp voltage source (time-varying for AC)
     */
    stampVoltageSource(component, G, I) {
      const [tPos, tNeg] = component.terminals;
      const n1 = this.getNodeIndex(tPos);
      const n2 = this.getNodeIndex(tNeg);
      const vsIndex = this.nodes.length + this.voltageSources.indexOf(component);
      let V = component.properties.voltage;
      if (component.properties.type === "ac") {
        const freq = component.properties.frequency || 50;
        const phase = (component.properties.phase || 0) * Math.PI / 180;
        V = V * Math.sin(2 * Math.PI * freq * this.time + phase);
      }
      if (n1 !== null) {
        G.add(n1, vsIndex, 1);
        G.add(vsIndex, n1, 1);
      }
      if (n2 !== null) {
        G.add(n2, vsIndex, -1);
        G.add(vsIndex, n2, -1);
      }
      I[vsIndex] = V;
    }
    /**
     * Stamp Ammeter as 0V voltage source (same as VoltageSource with V=0)
     */
    stampAmmeter(component, G, I) {
      const [tPos, tNeg] = component.terminals;
      const n1 = this.getNodeIndex(tPos);
      const n2 = this.getNodeIndex(tNeg);
      const vsIndex = this.nodes.length + this.voltageSources.indexOf(component);
      if (n1 !== null) {
        G.add(n1, vsIndex, 1);
        G.add(vsIndex, n1, 1);
      }
      if (n2 !== null) {
        G.add(n2, vsIndex, -1);
        G.add(vsIndex, n2, -1);
      }
      I[vsIndex] = 0;
    }
    /**
     * Stamp Voltmeter as very high resistance resistor (100MΩ)
     */
    stampVoltmeter(component, G) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const g = 1 / 1e8;
      if (n1 !== null) G.add(n1, n1, g);
      if (n2 !== null) G.add(n2, n2, g);
      if (n1 !== null && n2 !== null) {
        G.add(n1, n2, -g);
        G.add(n2, n1, -g);
      }
    }
    /**
     * Stamp Load component for transient analysis.
     * Series R-L load using Backward Euler companion model:
     *   Total companion conductance: 1 / (R + L/h)
     *   History current source: iPrev * (L/h) / (R + L/h)
     */
    stampLoad(component, G, I) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const imp = component.getLoadImpedance();
      if (!imp) {
        const g2 = 1e-12;
        if (n1 !== null) G.add(n1, n1, g2);
        if (n2 !== null) G.add(n2, n2, g2);
        if (n1 !== null && n2 !== null) {
          G.add(n1, n2, -g2);
          G.add(n2, n1, -g2);
        }
        return;
      }
      const R = imp.R;
      const f = 50;
      const L = imp.XL / (2 * Math.PI * f);
      const h = this.timeStep;
      const Rtotal = R + L / h;
      const g = 1 / Rtotal;
      const iPrev = this.inductorCurrents.get(component.id + "_L") || 0;
      const iEq = iPrev * (L / h) * g;
      if (n1 !== null) G.add(n1, n1, g);
      if (n2 !== null) G.add(n2, n2, g);
      if (n1 !== null && n2 !== null) {
        G.add(n1, n2, -g);
        G.add(n2, n1, -g);
      }
      if (n1 !== null) I[n1] -= iEq;
      if (n2 !== null) I[n2] += iEq;
    }
    /**
     * Stamp Diode for transient analysis (Newton-Raphson companion model).
     * Same linearization as DC: G_D conductance + I_eq current source.
     */
    stampDiode(component, G, I, prevSolution = null) {
      const [t1, t2] = component.terminals;
      const n1 = this.getNodeIndex(t1);
      const n2 = this.getNodeIndex(t2);
      const v1 = prevSolution && n1 !== null ? prevSolution[n1] : 0;
      const v2 = prevSolution && n2 !== null ? prevSolution[n2] : 0;
      const Vd = v1 - v2;
      const { Id, Gd, Ieq } = component.computeDiodeModel(Vd);
      if (n1 !== null) G.add(n1, n1, Gd);
      if (n2 !== null) G.add(n2, n2, Gd);
      if (n1 !== null && n2 !== null) {
        G.add(n1, n2, -Gd);
        G.add(n2, n1, -Gd);
      }
      if (n1 !== null) I[n1] -= Ieq;
      if (n2 !== null) I[n2] += Ieq;
    }
    /**
     * Stamp non-ideal OpAmp for transient analysis
     */
    stampOpAmp(component, G, I) {
      const props = component.properties;
      const A0 = props.openLoopGain;
      const rout = Math.max(1e-3, props.rout);
      const rin = props.rin;
      const ric = props.rin * 50;
      const cmrr_linear = Math.pow(10, props.cmrr / 20);
      const Ac = A0 / cmrr_linear;
      const g_plus = A0 + Ac / 2;
      const g_minus = -A0 + Ac / 2;
      const g_out = 1 / rout;
      const G_id = 1 / rin;
      const G_ic = 1 / ric;
      const nPos = this.getNodeIndex(component.terminals[0]);
      const nNeg = this.getNodeIndex(component.terminals[1]);
      const nOut = this.getNodeIndex(component.terminals[2]);
      const nPole = this.getNodeIndex(component.terminals[3]);
      if (nPos !== null) G.add(nPos, nPos, G_id + G_ic);
      if (nNeg !== null) G.add(nNeg, nNeg, G_id + G_ic);
      if (nPos !== null && nNeg !== null) {
        G.add(nPos, nNeg, -G_id);
        G.add(nNeg, nPos, -G_id);
      }
      if (nPole !== null) {
        const fp = props.gbp / A0;
        const tau = 1 / (2 * Math.PI * fp);
        const h = this.timeStep;
        const alpha = h / tau;
        const G_pole_diag = 1 + alpha;
        const vPrevPole = this.capacitorVoltages.get("__pole_" + component.id) || 0;
        G.add(nPole, nPole, G_pole_diag);
        I[nPole] += vPrevPole;
        if (nPos !== null) G.add(nPole, nPos, -alpha * g_plus);
        if (nNeg !== null) G.add(nPole, nNeg, -alpha * g_minus);
        if (props.offsetVoltage !== 0) {
          I[nPole] += alpha * A0 * props.offsetVoltage;
        }
      }
      if (nOut !== null) {
        G.add(nOut, nOut, g_out);
        if (nPole !== null) G.add(nOut, nPole, -g_out);
      }
    }
    /**
     * Get node index
     */
    getNodeIndex(terminal) {
      const nodeId = this.getNodeId(terminal);
      if (nodeId === "ground") return null;
      return this.nodeMap.get(nodeId) ?? null;
    }
    /**
     * Update capacitor voltages and inductor currents
     */
    updateStates(solution) {
      const components = this.circuit.getAllComponents();
      for (const component of components) {
        if (component.constructor.name === "Capacitor") {
          const [t1, t2] = component.terminals;
          const n1 = this.getNodeIndex(t1);
          const n2 = this.getNodeIndex(t2);
          const v1 = n1 !== null ? solution[n1] : 0;
          const v2 = n2 !== null ? solution[n2] : 0;
          this.capacitorVoltages.set(component.id, v1 - v2);
        } else if (component.constructor.name === "Inductor") {
          const [t1, t2] = component.terminals;
          const n1 = this.getNodeIndex(t1);
          const n2 = this.getNodeIndex(t2);
          const v1 = n1 !== null ? solution[n1] : 0;
          const v2 = n2 !== null ? solution[n2] : 0;
          const L = component.properties.inductance;
          const h = this.timeStep;
          const iPrev = this.inductorCurrents.get(component.id) || 0;
          const iNew = iPrev + h / L * (v1 - v2);
          this.inductorCurrents.set(component.id, iNew);
        } else if (component.constructor.name === "Load") {
          const imp = component.getLoadImpedance();
          if (imp) {
            const [t1, t2] = component.terminals;
            const n1 = this.getNodeIndex(t1);
            const n2 = this.getNodeIndex(t2);
            const v1 = n1 !== null ? solution[n1] : 0;
            const v2 = n2 !== null ? solution[n2] : 0;
            const vTotal = v1 - v2;
            const f = 50;
            const L = imp.XL / (2 * Math.PI * f);
            const R = imp.R;
            const h = this.timeStep;
            const iPrev = this.inductorCurrents.get(component.id + "_L") || 0;
            const iNew = (h * vTotal + L * iPrev) / (L + h * R);
            this.inductorCurrents.set(component.id + "_L", iNew);
          }
        } else if (component.constructor.name === "OpAmp") {
          const nPole = this.getNodeIndex(component.terminals[3]);
          const vsat = component.properties.saturationVoltage || 15;
          let vPole = nPole !== null ? solution[nPole] : 0;
          vPole = Math.max(-vsat, Math.min(vsat, vPole));
          this.capacitorVoltages.set("__pole_" + component.id, vPole);
        }
      }
    }
  };

  // src/ui/SimpleChart.js
  var SimpleChart = class {
    constructor(container, circuit = null) {
      this.container = container;
      this.circuit = circuit;
      this.canvas = null;
      this.ctx = null;
      this.data = null;
      this.colors = [
        "#1d4ed8",
        // engineering blue
        "#dc2626",
        // technical red
        "#059669",
        // technical green
        "#d97706",
        // amber
        "#7c3aed",
        // violet
        "#0284c7"
        // sky blue
      ];
      this.padding = { top: 30, right: 20, bottom: 40, left: 60 };
      this.init();
    }
    init() {
      this.canvas = document.createElement("canvas");
      this.canvas.className = "chart-canvas";
      this.container.innerHTML = "";
      this.container.appendChild(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }
    resize() {
      const rect = this.container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.canvas.style.width = rect.width + "px";
      this.canvas.style.height = rect.height + "px";
      this.ctx.scale(dpr, dpr);
      this.width = rect.width;
      this.height = rect.height;
      if (this.data) {
        this.render();
      }
    }
    /**
     * Set data and render
     * @param {number[]} timePoints - Time values (x-axis)
     * @param {Map<string, number[]>} series - Named data series
     */
    setData(timePoints, series) {
      this.data = { timePoints, series };
      this.render();
    }
    render() {
      if (!this.data || !this.ctx) return;
      const { timePoints, series } = this.data;
      const { width, height, padding, ctx } = this;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      const xMin = timePoints[0];
      const xMax = timePoints[timePoints.length - 1];
      let yMin = Infinity, yMax = -Infinity;
      for (const [name, values] of series) {
        if (name.includes("_positive") || name.includes("_negative")) continue;
        for (const v of values) {
          if (v < yMin) yMin = v;
          if (v > yMax) yMax = v;
        }
      }
      const yRange = yMax - yMin || 1;
      yMin -= yRange * 0.1;
      yMax += yRange * 0.1;
      const scaleX = (x) => padding.left + (x - xMin) / (xMax - xMin) * chartWidth;
      const scaleY = (y) => padding.top + chartHeight - (y - yMin) / (yMax - yMin) * chartHeight;
      this.drawGrid(xMin, xMax, yMin, yMax, scaleX, scaleY);
      let colorIndex = 0;
      const legend = [];
      for (const [name, values] of series) {
        if (name.includes("_positive") || name.includes("_negative")) continue;
        const color = this.colors[colorIndex % this.colors.length];
        legend.push({ name, color });
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < timePoints.length; i++) {
          const x = scaleX(timePoints[i]);
          const y = scaleY(values[i]);
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        colorIndex++;
      }
      this.drawLegend(legend);
      this.drawLabels(xMin, xMax, yMin, yMax);
    }
    drawGrid(xMin, xMax, yMin, yMax, scaleX, scaleY) {
      const { ctx, padding, width, height } = this;
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      const xTicks = 5;
      for (let i = 0; i <= xTicks; i++) {
        const x = padding.left + i / xTicks * chartWidth;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + chartHeight);
        ctx.stroke();
      }
      const yTicks = 4;
      for (let i = 0; i <= yTicks; i++) {
        const y = padding.top + i / yTicks * chartHeight;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top + chartHeight);
      ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top);
      ctx.lineTo(padding.left, padding.top + chartHeight);
      ctx.stroke();
    }
    drawLabels(xMin, xMax, yMin, yMax) {
      const { ctx, padding, width, height } = this;
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      ctx.fillStyle = "#475569";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      const xTicks = 5;
      for (let i = 0; i <= xTicks; i++) {
        const value = xMin + i / xTicks * (xMax - xMin);
        const x = padding.left + i / xTicks * chartWidth;
        ctx.fillText((value * 1e3).toFixed(1) + "ms", x, height - 10);
      }
      ctx.textAlign = "right";
      const yTicks = 4;
      for (let i = 0; i <= yTicks; i++) {
        const value = yMax - i / yTicks * (yMax - yMin);
        const y = padding.top + i / yTicks * chartHeight;
        ctx.fillText(value.toFixed(2) + "V", padding.left - 5, y + 4);
      }
      ctx.fillStyle = "#0f172a";
      ctx.font = "600 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Time", padding.left + chartWidth / 2, height - 2);
      ctx.save();
      ctx.translate(12, padding.top + chartHeight / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("Voltage (V)", 0, 0);
      ctx.restore();
    }
    drawLegend(legend) {
      const { ctx, padding, width } = this;
      ctx.font = "500 11px sans-serif";
      let x = padding.left + 10;
      const y = 15;
      for (const { name, color } of legend) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y - 8, 12, 12);
        ctx.fillStyle = "#0f172a";
        const displayName = this.formatNodeName(name);
        ctx.fillText(displayName, x + 16, y + 2);
        x += ctx.measureText(displayName).width + 30;
      }
    }
    formatNodeName(nodeId) {
      const match = nodeId.match(/^comp_(\d+)_(.+)$/);
      if (match) {
        const compId = `comp_${match[1]}`;
        const terminal = match[2];
        let typeChar = "?";
        if (this.circuit && this.circuit.components) {
          const comp = this.circuit.components.get(compId);
          if (comp) {
            const name = comp.constructor.name;
            if (name === "Resistor") typeChar = "R";
            else if (name === "Capacitor") typeChar = "C";
            else if (name === "Inductor") typeChar = "L";
            else if (name === "VoltageSource") typeChar = "V";
            else typeChar = name[0];
          }
        }
        if (terminal === "I") {
          return `I(${typeChar})`;
        }
        if (terminal === "left" || terminal === "right") {
          return `V(${typeChar})`;
        }
        if (terminal === "positive" || terminal === "negative") {
          return `V(${typeChar})`;
        }
        return terminal;
      }
      if (nodeId.endsWith("_I")) {
        const compMatch = nodeId.match(/^comp_(\d+)_I$/);
        if (compMatch) {
          const compId = `comp_${compMatch[1]}`;
          let typeChar = "?";
          if (this.circuit && this.circuit.components) {
            const comp = this.circuit.components.get(compId);
            if (comp) {
              const name = comp.constructor.name;
              if (name === "Resistor") typeChar = "R";
              else if (name === "Capacitor") typeChar = "C";
              else if (name === "Inductor") typeChar = "L";
              else if (name === "VoltageSource") typeChar = "V";
              else typeChar = name[0];
            }
          }
          return `I(${typeChar})`;
        }
        return "I";
      }
      return nodeId;
    }
    destroy() {
      window.removeEventListener("resize", this.resize);
      if (this.canvas && this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
      }
    }
  };

  // src/ui/OscilloscopeChart.js
  var OscilloscopeChart = class {
    constructor(container) {
      this.container = container;
      this.canvas = null;
      this.ctx = null;
      this.channels = [];
      this.maxPoints = 1e4;
      this.padding = { top: 36, right: 20, bottom: 45, left: 65 };
      this.width = 0;
      this.height = 0;
      this.zoomX = 1;
      this.zoomY = 1;
      this.panX = 0;
      this.panY = 0;
      this.dataXMin = 0;
      this.dataXMax = 1;
      this.dataYMin = -1;
      this.dataYMax = 1;
      this.crosshair = null;
      this.bgColor = "#0d1117";
      this.gridColor = "rgba(88, 166, 255, 0.12)";
      this.axisColor = "#444";
      this.textColor = "#8b949e";
      this.highlightColor = "#58a6ff";
      this.init();
    }
    init() {
      this.canvas = document.createElement("canvas");
      this.canvas.className = "scope-canvas";
      this.canvas.style.cursor = "crosshair";
      this.container.innerHTML = "";
      this.container.appendChild(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      this.resize();
      this._onResize = () => this.resize();
      this._onWheel = (e) => this.handleWheel(e);
      this._onMouseMove = (e) => this.handleMouseMove(e);
      this._onMouseLeave = () => this.handleMouseLeave();
      this._onDblClick = () => this.resetZoom();
      window.addEventListener("resize", this._onResize);
      this.canvas.addEventListener("wheel", this._onWheel, { passive: false });
      this.canvas.addEventListener("mousemove", this._onMouseMove);
      this.canvas.addEventListener("mouseleave", this._onMouseLeave);
      this.canvas.addEventListener("dblclick", this._onDblClick);
    }
    resize() {
      const rect = this.container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.canvas.style.width = rect.width + "px";
      this.canvas.style.height = rect.height + "px";
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
      this.width = rect.width;
      this.height = rect.height;
      if (this.channels.length > 0) {
        this.render();
      }
    }
    /**
     * Set channel data.
     * @param {Array<{label: string, color: string, timePoints: number[], values: number[]}>} channels
     */
    setData(channels) {
      this.channels = channels.map((ch) => {
        if (ch.timePoints.length > this.maxPoints) {
          const step = Math.ceil(ch.timePoints.length / this.maxPoints);
          return {
            label: ch.label,
            color: ch.color,
            timePoints: ch.timePoints.filter((_, i) => i % step === 0),
            values: ch.values.filter((_, i) => i % step === 0)
          };
        }
        return { ...ch };
      });
      this.computeDataRange();
      this.render();
    }
    computeDataRange() {
      if (this.channels.length === 0) return;
      let xMin = Infinity, xMax = -Infinity;
      let yMin = Infinity, yMax = -Infinity;
      for (const ch of this.channels) {
        if (ch.timePoints.length === 0) continue;
        xMin = Math.min(xMin, ch.timePoints[0]);
        xMax = Math.max(xMax, ch.timePoints[ch.timePoints.length - 1]);
        for (const v of ch.values) {
          if (isFinite(v)) {
            yMin = Math.min(yMin, v);
            yMax = Math.max(yMax, v);
          }
        }
      }
      if (yMin === yMax) {
        yMin -= 1;
        yMax += 1;
      }
      const yRange = yMax - yMin;
      yMin -= yRange * 0.1;
      yMax += yRange * 0.1;
      if (xMin >= xMax) {
        xMax = xMin + 1;
      }
      this.dataXMin = xMin;
      this.dataXMax = xMax;
      this.dataYMin = yMin;
      this.dataYMax = yMax;
    }
    // Get the visible data range (applying zoom/pan)
    getVisibleRange() {
      const fullXRange = this.dataXMax - this.dataXMin;
      const fullYRange = this.dataYMax - this.dataYMin;
      const visXRange = fullXRange / this.zoomX;
      const visYRange = fullYRange / this.zoomY;
      const xCenter = this.dataXMin + fullXRange * (0.5 + this.panX);
      const yCenter = this.dataYMin + fullYRange * (0.5 + this.panY);
      return {
        xMin: xCenter - visXRange / 2,
        xMax: xCenter + visXRange / 2,
        yMin: yCenter - visYRange / 2,
        yMax: yCenter + visYRange / 2
      };
    }
    render() {
      if (!this.ctx) return;
      const { width, height, padding, ctx } = this;
      if (width <= 0 || height <= 0) return;
      ctx.fillStyle = this.bgColor;
      ctx.fillRect(0, 0, width, height);
      if (this.channels.length === 0) {
        ctx.fillStyle = this.textColor;
        ctx.font = "13px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No data \u2014 run simulation with Oscilloscope connected", width / 2, height / 2);
        return;
      }
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;
      const { xMin, xMax, yMin, yMax } = this.getVisibleRange();
      const scaleX = (x) => padding.left + (x - xMin) / (xMax - xMin) * chartW;
      const scaleY = (y) => padding.top + chartH - (y - yMin) / (yMax - yMin) * chartH;
      this.drawGrid(xMin, xMax, yMin, yMax, scaleX, scaleY, chartW, chartH);
      if (yMin < 0 && yMax > 0) {
        const y0 = scaleY(0);
        ctx.strokeStyle = "rgba(88,166,255,0.25)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, y0);
        ctx.lineTo(padding.left + chartW, y0);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(padding.left, padding.top, chartW, chartH);
      ctx.clip();
      for (const ch of this.channels) {
        this.drawWaveform(ch, scaleX, scaleY);
      }
      ctx.restore();
      this.drawAxes(chartW, chartH);
      this.drawLabels(xMin, xMax, yMin, yMax, chartW, chartH);
      this.drawLegend();
      if (this.crosshair) {
        this.drawCrosshair(xMin, xMax, yMin, yMax, scaleX, scaleY, chartW, chartH);
      }
    }
    drawWaveform(ch, scaleX, scaleY) {
      const { ctx } = this;
      const { timePoints, values, color } = ch;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < timePoints.length; i++) {
        const x = scaleX(timePoints[i]);
        const y = scaleY(values[i]);
        if (!isFinite(x) || !isFinite(y)) continue;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.15;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawGrid(xMin, xMax, yMin, yMax, scaleX, scaleY, chartW, chartH) {
      const { ctx, padding } = this;
      ctx.strokeStyle = this.gridColor;
      ctx.lineWidth = 1;
      const xDivs = 8;
      for (let i = 0; i <= xDivs; i++) {
        const x = padding.left + i / xDivs * chartW;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + chartH);
        ctx.stroke();
      }
      const yDivs = 6;
      for (let i = 0; i <= yDivs; i++) {
        const y = padding.top + i / yDivs * chartH;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartW, y);
        ctx.stroke();
      }
    }
    drawAxes(chartW, chartH) {
      const { ctx, padding } = this;
      ctx.strokeStyle = this.axisColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top + chartH);
      ctx.lineTo(padding.left + chartW, padding.top + chartH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top);
      ctx.lineTo(padding.left, padding.top + chartH);
      ctx.stroke();
    }
    drawLabels(xMin, xMax, yMin, yMax, chartW, chartH) {
      const { ctx, padding, height } = this;
      ctx.fillStyle = this.textColor;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      const xDivs = 8;
      for (let i = 0; i <= xDivs; i++) {
        const value = xMin + i / xDivs * (xMax - xMin);
        const x = padding.left + i / xDivs * chartW;
        ctx.fillText(this.formatTime(value), x, height - padding.bottom + 18);
      }
      ctx.textAlign = "right";
      const yDivs = 6;
      for (let i = 0; i <= yDivs; i++) {
        const value = yMax - i / yDivs * (yMax - yMin);
        const y = padding.top + i / yDivs * chartH;
        ctx.fillText(this.formatAmplitude(value), padding.left - 6, y + 3);
      }
      ctx.fillStyle = "#aaa";
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Time", padding.left + chartW / 2, height - 4);
      ctx.save();
      ctx.translate(12, padding.top + chartH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("Amplitude", 0, 0);
      ctx.restore();
    }
    drawLegend() {
      const { ctx, padding } = this;
      ctx.font = '11px "JetBrains Mono", monospace';
      let x = padding.left + 10;
      const y = padding.top - 12;
      for (const ch of this.channels) {
        ctx.fillStyle = ch.color;
        ctx.fillRect(x, y - 5, 10, 10);
        ctx.fillStyle = "#ccc";
        ctx.textAlign = "left";
        ctx.fillText(ch.label, x + 14, y + 4);
        x += ctx.measureText(ch.label).width + 34;
      }
    }
    drawCrosshair(xMin, xMax, yMin, yMax, scaleX, scaleY, chartW, chartH) {
      const { ctx, padding, crosshair } = this;
      const { x, y } = crosshair;
      if (x < padding.left || x > padding.left + chartW || y < padding.top || y > padding.top + chartH) return;
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const dataX = xMin + (x - padding.left) / chartW * (xMax - xMin);
      const dataY = yMax - (y - padding.top) / chartH * (yMax - yMin);
      const readout = `${this.formatTime(dataX)}  |  ${this.formatAmplitude(dataY)}`;
      ctx.font = '10px "JetBrains Mono", monospace';
      const textW = ctx.measureText(readout).width + 12;
      const boxX = Math.min(x + 10, padding.left + chartW - textW - 4);
      const boxY = Math.max(y - 22, padding.top + 4);
      ctx.fillStyle = "rgba(13,17,23,0.85)";
      ctx.fillRect(boxX, boxY, textW, 18);
      ctx.strokeStyle = "rgba(88,166,255,0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX, boxY, textW, 18);
      ctx.fillStyle = "#e6edf3";
      ctx.textAlign = "left";
      ctx.fillText(readout, boxX + 6, boxY + 13);
      for (const ch of this.channels) {
        const idx = this.findNearestIndex(ch.timePoints, dataX);
        if (idx >= 0 && idx < ch.values.length) {
          const px = scaleX(ch.timePoints[idx]);
          const py = scaleY(ch.values[idx]);
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = ch.color;
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    findNearestIndex(arr, target) {
      let lo = 0, hi = arr.length - 1;
      while (lo < hi) {
        const mid = lo + hi >> 1;
        if (arr[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0 && Math.abs(arr[lo - 1] - target) < Math.abs(arr[lo] - target)) {
        return lo - 1;
      }
      return lo;
    }
    // ---- Zoom / Pan ----
    handleWheel(e) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      if (e.shiftKey) {
        this.zoomY = Math.max(0.1, Math.min(100, this.zoomY * factor));
      } else {
        this.zoomX = Math.max(0.1, Math.min(100, this.zoomX * factor));
      }
      this.render();
    }
    handleMouseMove(e) {
      const rect = this.canvas.getBoundingClientRect();
      this.crosshair = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      this.render();
    }
    handleMouseLeave() {
      this.crosshair = null;
      this.render();
    }
    resetZoom() {
      this.zoomX = 1;
      this.zoomY = 1;
      this.panX = 0;
      this.panY = 0;
      this.render();
    }
    // ---- Formatting helpers ----
    formatTime(seconds) {
      if (Math.abs(seconds) < 1e-6) return "0";
      if (Math.abs(seconds) < 1e-3) return (seconds * 1e6).toFixed(1) + "\xB5s";
      if (Math.abs(seconds) < 1) return (seconds * 1e3).toFixed(2) + "ms";
      return seconds.toFixed(4) + "s";
    }
    formatAmplitude(value) {
      if (Math.abs(value) < 1e-3) return value.toExponential(1);
      if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(2) + "k";
      return value.toFixed(2);
    }
    // ---- Cleanup ----
    destroy() {
      window.removeEventListener("resize", this._onResize);
      if (this.canvas) {
        this.canvas.removeEventListener("wheel", this._onWheel);
        this.canvas.removeEventListener("mousemove", this._onMouseMove);
        this.canvas.removeEventListener("mouseleave", this._onMouseLeave);
        this.canvas.removeEventListener("dblclick", this._onDblClick);
        if (this.canvas.parentNode) {
          this.canvas.parentNode.removeChild(this.canvas);
        }
      }
    }
  };

  // src/ui/SimulationControls.js
  var SimulationControls = class {
    /**
     * @param {HTMLElement} containerElement - The simulation panel container
     * @param {CircuitGraph} circuitGraph - The circuit topology
     */
    constructor(containerElement, circuitGraph2) {
      this.container = containerElement;
      this.circuit = circuitGraph2;
      this.btnRun = document.getElementById("btn-run");
      this.btnStop = document.getElementById("btn-stop");
      this.btnReset = document.getElementById("btn-reset");
      this.analysisType = document.getElementById("analysis-type");
      this.frequencyInput = document.getElementById("ac-frequency");
      this.simTime = document.getElementById("sim-time");
      this.timeStep = document.getElementById("time-step");
      this.outputContent = document.getElementById("output-content");
      this.chartOverlay = document.getElementById("chart-overlay");
      this.chartContainer = document.getElementById("chart-container");
      this.chartClose = document.getElementById("chart-close");
      this.chart = null;
      this.scopeOverlay = document.getElementById("scope-overlay");
      this.scopeContainer = document.getElementById("scope-container");
      this.scopeClose = document.getElementById("scope-close");
      this.scopeChart = null;
      this._setupScopeDrag();
      this.running = false;
      this.sensorMode = false;
      this.sensorAnimFrame = null;
      this.sensorLastTime = null;
      this.sensorElapsed = 0;
      this.observationTable = [];
      this.btnNoteReading = document.getElementById("btn-note-reading");
      this.btnStartSensor = document.getElementById("btn-start-sensor");
      this.btnStopSensor = document.getElementById("btn-stop-sensor");
      this.sensorLivePanel = document.getElementById("sensor-live-panel");
      this.sensorOverlay = document.getElementById("sensor-controls-overlay");
      this.onRun = null;
      this.onStop = null;
      this.onReset = null;
      this.setupEventListeners();
    }
    /**
     * Setup event listeners
     */
    setupEventListeners() {
      if (this.btnRun) {
        this.btnRun.addEventListener("click", () => this.run());
      }
      if (this.btnStop) {
        this.btnStop.addEventListener("click", () => this.stop());
      }
      if (this.btnReset) {
        this.btnReset.addEventListener("click", () => this.reset());
      }
      if (this.chartClose) {
        this.chartClose.addEventListener("click", () => this.hideChart());
      }
      if (this.scopeClose) {
        this.scopeClose.addEventListener("click", () => this.hideScope());
      }
      if (this.btnStartSensor) {
        this.btnStartSensor.addEventListener("click", () => this.startSensorSimulation());
      }
      if (this.btnStopSensor) {
        this.btnStopSensor.addEventListener("click", () => this.stopSensorSimulation());
      }
      if (this.btnNoteReading) {
        this.btnNoteReading.addEventListener("click", () => this.noteReading());
      }
    }
    /**
     * Run simulation
     */
    run() {
      const validation = this.circuit.validate();
      if (!validation.valid) {
        this.showErrors(validation.errors);
        return;
      }
      this.running = true;
      this.updateButtonStates();
      this.showOutput("Running simulation...", "info");
      const settings = this.getSettings();
      setTimeout(() => {
        try {
          if (settings.analysisType === "dc") {
            this.runDCAnalysis();
          } else if (settings.analysisType === "ac") {
            this.runACAnalysis(settings);
          } else if (settings.analysisType === "transient") {
            this.runTransientAnalysis(settings);
          }
        } catch (error) {
          this.showErrors([error.message]);
        }
        this.running = false;
        this.updateButtonStates();
      }, 100);
    }
    /**
     * Run DC analysis
     */
    runDCAnalysis() {
      const solver = new MNASolver(this.circuit);
      const result = solver.solveDC();
      if (!result.success) {
        this.showErrors([result.error]);
        return;
      }
      const voltages = {};
      for (const [nodeId, voltage] of result.nodeVoltages) {
        if (nodeId.includes("_positive") || nodeId.includes("_negative")) {
          const match = nodeId.match(/^comp_(\d+)_/);
          if (match) {
            const compId = `comp_${match[1]}`;
            const comp = this.circuit.components?.get(compId);
            if (comp?.constructor.name === "VoltageSource") continue;
          }
        }
        const displayName = this.formatNodeName(nodeId);
        voltages[displayName] = voltage;
      }
      const currents = {};
      for (const [compId, current] of result.branchCurrents) {
        const comp = this.circuit.components.get(compId);
        if (comp && (comp.constructor.name === "Wattmeter" || comp.type === "wattmeter")) continue;
        const displayName = this.formatComponentName(compId);
        const absCurrent = Math.abs(current);
        currents[displayName] = absCurrent;
        if (comp && comp.constructor.name === "Ammeter") {
          comp.setCurrent(absCurrent);
        }
      }
      const voltmeters = {};
      for (const comp of this.circuit.components.values()) {
        if (comp.constructor.name === "Voltmeter") {
          const n1Id = solver.getNodeId(comp.terminals[0]);
          const n2Id = solver.getNodeId(comp.terminals[1]);
          let v1 = 0, v2 = 0;
          if (n1Id && result.nodeVoltages.has(n1Id)) v1 = result.nodeVoltages.get(n1Id);
          if (n2Id && result.nodeVoltages.has(n2Id)) v2 = result.nodeVoltages.get(n2Id);
          const diff = v1 - v2;
          comp.setVoltage(diff);
          voltmeters[comp.id] = diff;
        }
      }
      const wattmeters = {};
      for (const comp of this.circuit.components.values()) {
        if (comp.constructor.name === "Wattmeter") {
          const nCId = solver.getNodeId(comp.terminals[2]);
          const nVId = solver.getNodeId(comp.terminals[3]);
          let vC = 0, vV = 0;
          if (nCId && result.nodeVoltages.has(nCId)) vC = result.nodeVoltages.get(nCId);
          if (nVId && result.nodeVoltages.has(nVId)) vV = result.nodeVoltages.get(nVId);
          const voltage = vC - vV;
          const currentData = result.branchCurrents.get(comp.id);
          const current = currentData ? Math.abs(currentData) : 0;
          const power = voltage * current;
          comp.setReadings(voltage, current, power);
          wattmeters[comp.id] = { voltage, current, power };
        }
      }
      this.displayResults({ voltages, currents, voltmeters, wattmeters });
      this.hideChart();
      this.feedOscilloscopesDC(solver, result);
    }
    /**
     * Run AC analysis
     */
    runACAnalysis(settings) {
      const solver = new MNASolver(this.circuit);
      const frequency = settings.frequency || 1e3;
      const result = solver.solveAC(frequency);
      if (!result.success) {
        this.showErrors([result.error]);
        return;
      }
      const voltages = {};
      for (const [nodeId, voltage] of result.nodeVoltages) {
        const displayName = this.formatNodeName(nodeId);
        voltages[displayName] = {
          magnitude: voltage.magnitude(),
          phase: voltage.phaseDegrees(),
          complex: voltage
        };
      }
      const currents = {};
      for (const [compId, current] of result.branchCurrents) {
        const comp = this.circuit.components.get(compId);
        if (comp && (comp.constructor.name === "Wattmeter" || comp.type === "wattmeter")) continue;
        const displayName = this.formatComponentName(compId);
        const magnitude = current.magnitude();
        currents[displayName] = {
          magnitude,
          phase: current.phaseDegrees(),
          complex: current
        };
        if (comp && comp.constructor.name === "Ammeter") {
          comp.setCurrent(magnitude);
        }
      }
      const voltmeters = {};
      for (const comp of this.circuit.components.values()) {
        if (comp.constructor.name === "Voltmeter") {
          const n1Id = solver.getNodeId(comp.terminals[0]);
          const n2Id = solver.getNodeId(comp.terminals[1]);
          let v1 = { re: 0, im: 0 }, v2 = { re: 0, im: 0 };
          if (n1Id && result.nodeVoltages.has(n1Id)) v1 = result.nodeVoltages.get(n1Id);
          if (n2Id && result.nodeVoltages.has(n2Id)) v2 = result.nodeVoltages.get(n2Id);
          if (v1 && v2) {
            const vdiff = v1.sub ? v1.sub(v2) : { magnitude: () => 0, phaseDegrees: () => 0 };
            const mag = vdiff.magnitude();
            comp.setVoltage(mag);
            voltmeters[comp.id] = {
              magnitude: mag,
              phase: vdiff.phaseDegrees(),
              complex: vdiff
            };
          }
        }
      }
      const wattmeters = {};
      for (const comp of this.circuit.components.values()) {
        if (comp.constructor.name === "Wattmeter") {
          const nCId = solver.getNodeId(comp.terminals[2]);
          const nVId = solver.getNodeId(comp.terminals[3]);
          let vC = { re: 0, im: 0 }, vV = { re: 0, im: 0 };
          const zero = { real: 0, imag: 0 };
          if (nCId && result.nodeVoltages.has(nCId)) vC = result.nodeVoltages.get(nCId);
          else vC = result.nodeVoltages.values().next().value.constructor.zero();
          if (nVId && result.nodeVoltages.has(nVId)) vV = result.nodeVoltages.get(nVId);
          else vV = result.nodeVoltages.values().next().value.constructor.zero();
          const vCoil = vC.sub(vV);
          const currentData = result.branchCurrents.get(comp.id);
          const iCoil = currentData || vC.constructor.zero();
          const P = vCoil.real * iCoil.real + vCoil.imag * iCoil.imag;
          const Vmag = vCoil.magnitude();
          const Imag = iCoil.magnitude();
          comp.setReadings(Vmag, Imag, P);
          wattmeters[comp.id] = {
            voltage: Vmag,
            current: Imag,
            power: P,
            complexPower: {
              real: P,
              apparent: Vmag * Imag
            }
          };
        }
      }
      this.displayACResults({ voltages, currents, frequency, wattmeters, voltmeters });
      this.feedOscilloscopesAC(solver, result, frequency, settings);
    }
    /**
     * Display AC analysis results with magnitude and phase
     */
    displayACResults(results) {
      if (!results || !this.outputContent) return;
      const freq = results.frequency;
      let html = `<div class="simulation-results">
            <div class="result-header">AC Analysis (${freq} Hz)</div>`;
      if (Object.keys(results.voltages).length > 0) {
        html += '<div class="result-section"><h4>Node Voltages (Phasor)</h4>';
        for (const [node, v] of Object.entries(results.voltages)) {
          html += `<div class="output-result">
                    <span class="result-label">${node}</span>
                    <span class="result-value">${v.magnitude.toFixed(4)} V \u2220 ${v.phase.toFixed(1)}\xB0</span>
                </div>`;
        }
        html += "</div>";
      }
      if (Object.keys(results.currents).length > 0) {
        html += '<div class="result-section"><h4>Currents (Phasor)</h4>';
        for (const [comp, i] of Object.entries(results.currents)) {
          html += `<div class="output-result">
                    <span class="result-label">${comp}</span>
                    <span class="result-value">${(i.magnitude * 1e3).toFixed(4)} mA \u2220 ${i.phase.toFixed(1)}\xB0</span>
                </div>`;
        }
        html += "</div>";
      }
      if (results.wattmeters && Object.keys(results.wattmeters).length > 0) {
        html += '<div class="result-section"><h4>\u26A1 Wattmeter Readings</h4>';
        for (const [id, data] of Object.entries(results.wattmeters)) {
          const comp = this.circuit.components.get(id);
          const label = comp ? "Wattmeter" : id;
          html += `<div class="output-result">
                    <span class="result-label">${label} (${id.replace("comp_", "")})</span>
                    <span class="result-value">${data.power.toFixed(4)} W</span>
                </div>
                <div class="output-result" style="padding-left: 16px; opacity: 0.8;">
                    <span class="result-label">V(C-V)</span>
                    <span class="result-value">${data.voltage.toFixed(4)} V</span>
                </div>
                <div class="output-result" style="padding-left: 16px; opacity: 0.8;">
                    <span class="result-label">I(M-L)</span>
                    <span class="result-value">${(data.current * 1e3).toFixed(4)} mA</span>
                </div>`;
        }
        html += "</div>";
      }
      if (results.voltmeters && Object.keys(results.voltmeters).length > 0) {
        html += '<div class="result-section"><h4>Voltmeter Readings</h4>';
        for (const [id, val] of Object.entries(results.voltmeters)) {
          const comp = this.circuit.components.get(id);
          const label = comp ? "Voltmeter" : id;
          html += `<div class="output-result">
                    <span class="result-label">${label} (${id.replace("comp_", "")})</span>
                    <span class="result-value">${val.magnitude.toFixed(4)} V \u2220 ${val.phase.toFixed(1)}\xB0</span>
                </div>`;
        }
        html += "</div>";
      }
      html += "</div>";
      this.showOutput(html, "success");
    }
    /**
     * Run transient analysis
     */
    runTransientAnalysis(settings) {
      const solver = new TransientSolver(this.circuit);
      const endTime = settings.simulationTime || 0.01;
      const timeStep = settings.timeStep || 1e-4;
      const result = solver.solve(endTime, timeStep);
      if (!result.success) {
        this.showErrors([result.error]);
        return;
      }
      this.displayTransientResults(result, solver);
    }
    /**
     * Display transient analysis results (text summary)
     */
    displayTransientResults(result, solver = null) {
      if (!result || !this.outputContent) return;
      const numPoints = result.timePoints.length;
      const endTime = result.timePoints[numPoints - 1] * 1e3;
      let html = `<div class="simulation-results">`;
      html += `<div class="result-section"><h4>Transient Analysis</h4>`;
      html += `<p>Simulated ${numPoints} points from 0 to ${endTime.toFixed(2)} ms</p></div>`;
      html += '<div class="result-section"><h4>Final Values</h4>';
      for (const [nodeId, values] of result.results) {
        if (nodeId.includes("_positive") || nodeId.includes("_negative")) continue;
        const finalValue = values[values.length - 1];
        const displayName = this.formatNodeName(nodeId);
        const unit = nodeId.endsWith("_I") ? " mA" : " V";
        const displayValue = nodeId.endsWith("_I") ? finalValue * 1e3 : finalValue;
        html += `<div class="output-result">
                <span class="result-label">${displayName}</span>
                <span class="result-value">${displayValue.toFixed(4)}${unit}</span>
            </div>`;
      }
      html += "</div>";
      html += '<div class="result-section"><h4>Peak Values</h4>';
      for (const [nodeId, values] of result.results) {
        if (nodeId.includes("_positive") || nodeId.includes("_negative")) continue;
        const peak = Math.max(...values.map(Math.abs));
        const displayName = this.formatNodeName(nodeId);
        const unit = nodeId.endsWith("_I") ? " mA peak" : " V peak";
        const displayValue = nodeId.endsWith("_I") ? peak * 1e3 : peak;
        html += `<div class="output-result">
                <span class="result-label">${displayName}</span>
                <span class="result-value">${displayValue.toFixed(4)}${unit}</span>
            </div>`;
      }
      html += "</div></div>";
      this.showOutput(html, "success");
      this.showChart(result.timePoints, result.results);
      this.feedOscilloscopesTransient(result, solver);
    }
    /**
     * Show chart with transient data
     */
    showChart(timePoints, series) {
      if (!this.chartContainer || !this.chartOverlay) return;
      this.chartOverlay.classList.add("visible");
      setTimeout(() => {
        if (!this.chart) {
          this.chart = new SimpleChart(this.chartContainer, this.circuit);
        } else {
          this.chart.resize();
        }
        this.chart.setData(timePoints, series);
      }, 50);
    }
    /**
     * Hide chart
     */
    hideChart() {
      if (this.chartOverlay) {
        this.chartOverlay.classList.remove("visible");
      }
    }
    // ---- Oscilloscope Data Feed ----
    /**
     * Find all Oscilloscope components in the circuit.
     */
    findOscilloscopes() {
      const scopes = [];
      for (const comp of this.circuit.components.values()) {
        if (comp.constructor.name === "Oscilloscope") {
          scopes.push(comp);
        }
      }
      return scopes;
    }
    /**
     * Feed oscilloscopes for DC analysis.
     * Displays a flat line at the measured differential voltage.
     */
    feedOscilloscopesDC(solver, result) {
      const scopes = this.findOscilloscopes();
      if (scopes.length === 0) {
        this.hideScope();
        return;
      }
      const allChannels = [];
      for (const scope of scopes) {
        const channels = scope.getChannelConfig();
        for (const ch of channels) {
          let value = 0;
          let unit = "V";
          if (ch.mode === "Current") {
            for (const vs of solver.voltageSources) {
              if (vs._isScopeChannel && vs._scopeComponent === scope && vs._channelId === ch.id) {
                const idx = solver.voltageSources.indexOf(vs);
                if (result.branchCurrents) {
                  for (const [compId, current] of result.branchCurrents) {
                    if (compId === vs || compId === scope.id + "_" + ch.id) {
                      value = Math.abs(current) * 1e3;
                      break;
                    }
                  }
                }
                break;
              }
            }
            unit = "mA";
          } else {
            const n1Id = solver.getNodeId(ch.posTerminal);
            const n2Id = solver.getNodeId(ch.negTerminal);
            let v1 = 0, v2 = 0;
            if (n1Id && result.nodeVoltages.has(n1Id)) v1 = result.nodeVoltages.get(n1Id);
            if (n2Id && result.nodeVoltages.has(n2Id)) v2 = result.nodeVoltages.get(n2Id);
            value = v1 - v2;
          }
          const timePoints = [0, 5e-3, 0.01];
          const values = [value, value, value];
          allChannels.push({
            label: ch.label + ` (${value.toFixed(2)}${unit})`,
            color: ch.color,
            timePoints,
            values
          });
        }
      }
      if (allChannels.length > 0) {
        this.showScope(allChannels);
      }
    }
    /**
     * Feed oscilloscopes for AC analysis.
     * Synthesizes a sinusoidal waveform from phasor magnitude and phase.
     */
    feedOscilloscopesAC(solver, result, frequency, settings = {}) {
      const scopes = this.findOscilloscopes();
      if (scopes.length === 0) {
        this.hideScope();
        return;
      }
      let plotFrequency = frequency;
      if (plotFrequency === 1e3) {
        for (const comp of this.circuit.components.values()) {
          if (comp.constructor.name === "VoltageSource" && comp.properties.type === "ac") {
            if (comp.properties.frequency) {
              plotFrequency = comp.properties.frequency;
              break;
            }
          }
        }
      }
      const allChannels = [];
      const T = 1 / plotFrequency;
      const totalTime = settings.simulationTime ? settings.simulationTime : 2 * T;
      const numCycles = totalTime / T;
      const numPoints = Math.min(1e4, Math.max(300, Math.ceil(numCycles * 50)));
      const timePoints = [];
      for (let i = 0; i < numPoints; i++) {
        timePoints.push(i / (numPoints - 1) * totalTime);
      }
      for (const scope of scopes) {
        const channels = scope.getChannelConfig();
        for (const ch of channels) {
          let mag = 0, phaseRad = 0;
          let unit = "V";
          if (ch.mode === "Current") {
            for (const vs of solver.voltageSources) {
              if (vs._isScopeChannel && vs._scopeComponent === scope && vs._channelId === ch.id) {
                for (const [compId, current] of result.branchCurrents) {
                  if (compId === vs.id || compId === vs) {
                    mag = current.magnitude() * 1e3;
                    phaseRad = Math.atan2(current.imag, current.real);
                    break;
                  }
                }
                break;
              }
            }
            unit = "mA";
          } else {
            const n1Id = solver.getNodeId(ch.posTerminal);
            const n2Id = solver.getNodeId(ch.negTerminal);
            let v1 = null, v2 = null;
            if (n1Id && result.nodeVoltages.has(n1Id)) v1 = result.nodeVoltages.get(n1Id);
            if (n2Id && result.nodeVoltages.has(n2Id)) v2 = result.nodeVoltages.get(n2Id);
            if (v1 && v2 && v1.sub) {
              const vdiff = v1.sub(v2);
              mag = vdiff.magnitude();
              phaseRad = Math.atan2(vdiff.imag, vdiff.real);
            } else if (v1) {
              mag = v1.magnitude ? v1.magnitude() : 0;
              phaseRad = v1.phase ? v1.phase() : 0;
            }
          }
          const omega = 2 * Math.PI * plotFrequency;
          const values = timePoints.map((t) => mag * Math.sin(omega * t + phaseRad));
          let displayMag = mag;
          let displayUnit = unit;
          if (unit === "mA" && mag >= 1e3) {
            displayMag = mag / 1e3;
            displayUnit = "A";
          }
          allChannels.push({
            label: ch.label + ` (${displayMag.toFixed(2)}${displayUnit})`,
            color: ch.color,
            timePoints,
            values
          });
        }
      }
      if (allChannels.length > 0) {
        this.showScope(allChannels);
      }
    }
    /**
     * Feed oscilloscopes for transient analysis.
     * Extracts differential voltage time-series from simulation results.
     */
    feedOscilloscopesTransient(result, solver = null) {
      const scopes = this.findOscilloscopes();
      if (scopes.length === 0) {
        this.hideScope();
        return;
      }
      const allChannels = [];
      for (const scope of scopes) {
        const channels = scope.getChannelConfig();
        for (const ch of channels) {
          let values;
          let label = ch.label;
          if (ch.mode === "Current") {
            const currentKey = scope.id + "_" + ch.id + "_I";
            let currentValues = null;
            for (const [nodeId, vals] of result.results) {
              if (nodeId === currentKey) {
                currentValues = vals;
                break;
              }
            }
            values = result.timePoints.map((_, i) => {
              const raw = currentValues ? currentValues[i] : 0;
              return Math.abs(raw) * 1e3;
            });
            label += " (mA)";
          } else {
            const posId = solver ? solver.getNodeId(ch.posTerminal) : ch.posTerminal.id;
            const negId = solver ? solver.getNodeId(ch.negTerminal) : ch.negTerminal.id;
            let posValues = null, negValues = null;
            for (const [nodeId, vals] of result.results) {
              if (nodeId === posId) posValues = vals;
              if (nodeId === negId) negValues = vals;
            }
            values = result.timePoints.map((_, i) => {
              const v1 = posValues ? posValues[i] : 0;
              const v2 = negValues ? negValues[i] : 0;
              return v1 - v2;
            });
          }
          allChannels.push({
            label,
            color: ch.color,
            timePoints: [...result.timePoints],
            values
          });
        }
      }
      if (allChannels.length > 0) {
        this.showScope(allChannels);
      }
    }
    /**
    * Show oscilloscope overlay with channel data.
    */
    showScope(channels) {
      if (!this.scopeContainer || !this.scopeOverlay) return;
      this.scopeOverlay.classList.add("visible");
      setTimeout(() => {
        if (!this.scopeChart) {
          this.scopeChart = new OscilloscopeChart(this.scopeContainer);
        } else {
          this.scopeChart.resize();
        }
        this.scopeChart.setData(channels);
      }, 50);
    }
    /**
     * Hide oscilloscope overlay.
     */
    hideScope() {
      if (this.scopeOverlay) {
        this.scopeOverlay.classList.remove("visible");
      }
    }
    /**
     * Setup drag-to-move for the oscilloscope overlay
     */
    _setupScopeDrag() {
      if (!this.scopeOverlay) return;
      const header = this.scopeOverlay.querySelector(".chart-header");
      if (!header) return;
      let isDragging = false;
      let startX, startY;
      let initialLeft, initialTop;
      const onMouseDown = (e) => {
        if (e.button !== 0 || e.target.closest(".chart-close")) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const style = window.getComputedStyle(this.scopeOverlay);
        initialLeft = parseInt(style.left, 10) || 0;
        initialTop = parseInt(style.top, 10) || 0;
        document.body.style.userSelect = "none";
      };
      const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        this.scopeOverlay.style.left = `${initialLeft + dx}px`;
        this.scopeOverlay.style.top = `${initialTop + dy}px`;
      };
      const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.userSelect = "";
      };
      header.addEventListener("mousedown", onMouseDown);
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }
    /**
     * Format node name for display - uses short labels matching chart
     */
    formatNodeName(nodeId) {
      const match = nodeId.match(/^comp_(\d+)_(.+)$/);
      if (match) {
        const compId = `comp_${match[1]}`;
        const terminal = match[2];
        let typeChar = "?";
        if (this.circuit && this.circuit.components) {
          const comp = this.circuit.components.get(compId);
          if (comp) {
            const name = comp.constructor.name;
            if (name === "Resistor") typeChar = "R";
            else if (name === "Capacitor") typeChar = "C";
            else if (name === "Inductor") typeChar = "L";
            else if (name === "VoltageSource") typeChar = "V";
            else typeChar = name[0];
          }
        }
        if (terminal === "I") {
          return `I(${typeChar})`;
        }
        if (terminal === "left" || terminal === "right") {
          return `V(${typeChar})`;
        }
        if (terminal === "positive" || terminal === "negative") {
          return `V(${typeChar})`;
        }
        return terminal;
      }
      if (nodeId.endsWith("_I")) {
        const compMatch = nodeId.match(/^comp_(\d+)_I$/);
        if (compMatch) {
          const compId = `comp_${compMatch[1]}`;
          let typeChar = "?";
          if (this.circuit && this.circuit.components) {
            const comp = this.circuit.components.get(compId);
            if (comp) {
              const name = comp.constructor.name;
              if (name === "Resistor") typeChar = "R";
              else if (name === "Capacitor") typeChar = "C";
              else if (name === "Inductor") typeChar = "L";
              else if (name === "VoltageSource") typeChar = "V";
              else typeChar = name[0];
            }
          }
          return `I(${typeChar})`;
        }
        return "I";
      }
      return nodeId;
    }
    /**
     * Format component name for display
     */
    formatComponentName(compId) {
      const component = this.circuit.components?.get(compId);
      if (component) {
        return component.constructor.displayName || component.type;
      }
      const match = compId.match(/^comp_(\d+)$/);
      if (match) {
        return `Source ${match[1]}`;
      }
      return compId;
    }
    /**
     * Stop simulation
     */
    stop() {
      this.running = false;
      if (this.sensorMode) {
        this.stopSensorSimulation();
        return;
      }
      this.updateButtonStates();
      this.showOutput("Simulation stopped", "info");
      if (this.onStop) {
        this.onStop();
      }
    }
    /**
     * Reset simulation
     */
    reset() {
      this.running = false;
      this.updateButtonStates();
      this.showEmpty();
      if (this.onReset) {
        this.onReset();
      }
    }
    /**
     * Get current settings
     */
    getSettings() {
      return {
        analysisType: this.analysisType?.value || "dc",
        frequency: parseFloat(this.frequencyInput?.value) || 60,
        simulationTime: parseFloat(this.simTime?.value) || 0.01,
        timeStep: parseFloat(this.timeStep?.value) || 1e-4
      };
    }
    /**
     * Update button states
     */
    updateButtonStates() {
      if (this.btnRun) {
        this.btnRun.disabled = this.running;
      }
      if (this.btnStop) {
        this.btnStop.disabled = !this.running;
      }
      const statusMode = document.getElementById("status-mode");
      if (statusMode && this.running) {
        statusMode.textContent = "Mode: Simulating";
        statusMode.classList.add("status-running");
      } else if (statusMode) {
        statusMode.classList.remove("status-running");
      }
    }
    /**
     * Show errors in output
     */
    showErrors(errors) {
      const errorHtml = errors.map(
        (e) => `<div class="output-error">\u26A0 ${e}</div>`
      ).join("");
      this.showOutput(errorHtml, "error");
    }
    /**
     * Show output content
     */
    showOutput(content, type = "info") {
      if (!this.outputContent) return;
      this.outputContent.innerHTML = content;
      this.outputContent.className = `output-content output-${type}`;
    }
    /**
     * Show empty state
     */
    showEmpty() {
      if (!this.outputContent) return;
      this.outputContent.innerHTML = '<p class="placeholder-text">Run simulation to see results</p>';
      this.outputContent.className = "output-content";
    }
    /**
     * Display simulation results
     */
    displayResults(results) {
      if (!results || !this.outputContent) return;
      let html = '<div class="simulation-results">';
      if (results.voltages && Object.keys(results.voltages).length > 0) {
        html += '<div class="result-section"><h4>Node Voltages</h4>';
        for (const [node, voltage] of Object.entries(results.voltages)) {
          html += `<div class="output-result">
                    <span class="result-label">${node}</span>
                    <span class="result-value">${voltage.toFixed(4)} V</span>
                </div>`;
        }
        html += "</div>";
      }
      if (results.currents && Object.keys(results.currents).length > 0) {
        html += '<div class="result-section"><h4>Currents</h4>';
        for (const [comp, current] of Object.entries(results.currents)) {
          html += `<div class="output-result">
                    <span class="result-label">${comp}</span>
                    <span class="result-value">${(current * 1e3).toFixed(4)} mA</span>
                </div>`;
        }
        html += "</div>";
      }
      if (results.voltmeters && Object.keys(results.voltmeters).length > 0) {
        html += '<div class="result-section"><h4>Voltmeter Readings</h4>';
        for (const [id, voltage] of Object.entries(results.voltmeters)) {
          const comp = this.circuit.components.get(id);
          const label = comp ? comp.constructor.displayName || "Volt Meter" : id;
          html += `<div class="output-result">
                    <span class="result-label">${label} (${id.replace("comp_", "")})</span>
                    <span class="result-value">${voltage.toFixed(4)} V</span>
                </div>`;
        }
        html += "</div>";
      }
      if (results.wattmeters && Object.keys(results.wattmeters).length > 0) {
        html += '<div class="result-section"><h4>\u26A1 Wattmeter Readings</h4>';
        for (const [id, data] of Object.entries(results.wattmeters)) {
          const comp = this.circuit.components.get(id);
          const label = comp ? "Wattmeter" : id;
          html += `<div class="output-result">
                    <span class="result-label">${label} (${id.replace("comp_", "")})</span>
                    <span class="result-value">${data.power.toFixed(4)} W</span>
                </div>
                <div class="output-result" style="padding-left: 16px; opacity: 0.8;">
                    <span class="result-label">V(C-V)</span>
                    <span class="result-value">${data.voltage.toFixed(4)} V</span>
                </div>
                <div class="output-result" style="padding-left: 16px; opacity: 0.8;">
                    <span class="result-label">I(M-L)</span>
                    <span class="result-value">${(data.current * 1e3).toFixed(4)} mA</span>
                </div>`;
        }
        html += "</div>";
      }
      html += "</div>";
      this.showOutput(html, "success");
    }
    // ============================
    // Sensor Simulation Subsystem
    // ============================
    /**
     * Find all sensor components in the circuit.
     */
    findSensors() {
      const sensors = [];
      for (const comp of this.circuit.components.values()) {
        if (comp.isSensor) {
          sensors.push(comp);
        }
      }
      return sensors;
    }
    /**
     * Check if circuit contains sensors and show/hide sensor controls.
     */
    detectSensorMode() {
      const sensors = this.findSensors();
      this.sensorMode = sensors.length > 0;
      if (this.sensorOverlay) {
        this.sensorOverlay.style.display = this.sensorMode ? "flex" : "none";
      } else {
        if (this.btnStartSensor) this.btnStartSensor.style.display = this.sensorMode ? "inline-flex" : "none";
        if (this.btnStopSensor) this.btnStopSensor.style.display = this.sensorMode ? "inline-flex" : "none";
        if (this.btnNoteReading) this.btnNoteReading.style.display = this.sensorMode ? "inline-flex" : "none";
      }
      return this.sensorMode;
    }
    /**
     * Start the continuous sensor simulation loop.
     */
    startSensorSimulation() {
      const sensors = this.findSensors();
      if (sensors.length === 0) {
        this.showOutput("No sensor components found in circuit.", "error");
        return;
      }
      const validation = this.circuit.validate();
      if (!validation.valid) {
        this.showErrors(validation.errors);
        return;
      }
      this.running = true;
      this.sensorMode = true;
      this.sensorLastTime = performance.now();
      this.sensorElapsed = 0;
      this.observationTable = [];
      sensors.forEach((s) => {
        if (s.resetSensor) s.resetSensor();
      });
      if (this.btnStartSensor) this.btnStartSensor.disabled = true;
      if (this.btnStopSensor) this.btnStopSensor.disabled = false;
      if (this.btnNoteReading) this.btnNoteReading.disabled = false;
      if (this.btnRun) this.btnRun.disabled = true;
      this.showOutput('<div class="sensor-running">\u{1F7E2} Sensor simulation running...</div>', "info");
      if (this.sensorLivePanel) this.sensorLivePanel.style.display = "block";
      this._sensorLoop();
    }
    /**
     * The continuous simulation frame.
     */
    _sensorLoop() {
      if (!this.running || !this.sensorMode) return;
      const now = performance.now();
      const dt = Math.min((now - this.sensorLastTime) / 1e3, 0.1);
      this.sensorLastTime = now;
      this.sensorElapsed += dt;
      const sensors = this.findSensors();
      let inputVoltages = /* @__PURE__ */ new Map();
      try {
        const solver = new MNASolver(this.circuit);
        let dcResult = null;
        try {
          dcResult = solver.solveDC();
        } catch (e) {
        }
        let hasAC = false;
        let acFreq = 50;
        for (const comp of this.circuit.components.values()) {
          if (comp.constructor.name === "VoltageSource" && comp.properties.type === "ac") {
            hasAC = true;
            acFreq = comp.properties.frequency || 50;
            break;
          }
        }
        let acResult = null;
        if (hasAC) {
          try {
            acResult = solver.solveAC(acFreq);
          } catch (e) {
          }
        }
        for (const sensor of sensors) {
          let excitationVoltage = 0;
          if (sensor.terminals.length >= 2) {
            const inPos = sensor.terminals[0];
            const inNeg = sensor.terminals[1];
            const nPos = solver.getNodeId(inPos);
            const nNeg = solver.getNodeId(inNeg);
            let vPosDc = 0, vNegDc = 0;
            if (dcResult && dcResult.success && dcResult.nodeVoltages) {
              vPosDc = nPos ? dcResult.nodeVoltages.get(nPos) || 0 : 0;
              vNegDc = nNeg ? dcResult.nodeVoltages.get(nNeg) || 0 : 0;
            }
            let vPosAcMag = 0, vNegAcMag = 0;
            if (acResult && acResult.success && acResult.nodeVoltages) {
              const cPos = nPos ? acResult.nodeVoltages.get(nPos) : null;
              const cNeg = nNeg ? acResult.nodeVoltages.get(nNeg) : null;
              vPosAcMag = cPos ? cPos.magnitude() : 0;
              vNegAcMag = cNeg ? cNeg.magnitude() : 0;
            }
            const vDc = Math.abs(vPosDc - vNegDc);
            const vAc = Math.abs(vPosAcMag - vNegAcMag);
            excitationVoltage = Math.max(vDc, vAc);
          }
          inputVoltages.set(sensor.id, excitationVoltage);
          if (dcResult && dcResult.success) {
            this._updateInstrumentReadings(solver, dcResult);
          }
        }
      } catch (e) {
        console.warn("Sensor loop MNA solve failed:", e.message);
      }
      for (const sensor of sensors) {
        const voltage = inputVoltages.get(sensor.id) || 0;
        sensor.updateEnvironment(dt, voltage);
        if (sensor.element) {
          sensor.element.innerHTML = "";
          const bodyHtml = sensor.renderBody();
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${bodyHtml}</svg>`;
          const svgContent = tempDiv.querySelector("svg");
          while (svgContent && svgContent.firstChild) {
            sensor.element.appendChild(svgContent.firstChild);
          }
          for (const terminal of sensor.terminals) {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("class", "terminal");
            circle.setAttribute("data-terminal", terminal.name);
            circle.setAttribute("cx", terminal.offsetX);
            circle.setAttribute("cy", terminal.offsetY);
            circle.setAttribute("r", "4");
            sensor.element.appendChild(circle);
          }
          const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
          label.setAttribute("class", "component-label");
          label.setAttribute("y", sensor.getLabelOffset ? sensor.getLabelOffset() : "-15");
          label.textContent = sensor.getLabel();
          sensor.element.appendChild(label);
          const value = document.createElementNS("http://www.w3.org/2000/svg", "text");
          value.setAttribute("class", "component-value");
          value.setAttribute("y", sensor.getValueOffset ? sensor.getValueOffset() : "25");
          value.textContent = sensor.getValueString();
          sensor.element.appendChild(value);
        }
      }
      if (this.sensorDataTimer === void 0) {
        this.sensorDataTimer = 2;
      } else {
        this.sensorDataTimer += dt;
      }
      if (this.sensorDataTimer >= 2) {
        this._updateSensorLivePanel(sensors);
        this.sensorDataTimer = 0;
      }
      this.sensorAnimFrame = requestAnimationFrame(() => this._sensorLoop());
    }
    /**
     * Update instrument readings (ammeters, voltmeters) from a DC solve result.
     */
    _updateInstrumentReadings(solver, result) {
      for (const comp of this.circuit.components.values()) {
        if (comp.constructor.name === "Ammeter") {
          const current = result.branchCurrents.get(comp.id);
          if (current !== void 0) comp.setCurrent(Math.abs(current));
        }
        if (comp.constructor.name === "Voltmeter") {
          const n1Id = solver.getNodeId(comp.terminals[0]);
          const n2Id = solver.getNodeId(comp.terminals[1]);
          let v1 = 0, v2 = 0;
          if (n1Id && result.nodeVoltages.has(n1Id)) v1 = result.nodeVoltages.get(n1Id);
          if (n2Id && result.nodeVoltages.has(n2Id)) v2 = result.nodeVoltages.get(n2Id);
          comp.setVoltage(v1 - v2);
        }
      }
    }
    /**
     * Update the live sensor readings panel.
     */
    _updateSensorLivePanel(sensors) {
      if (!this.sensorLivePanel) return;
      let html = `<div class="sensor-live-header">\u{1F534} LIVE \u2014 ${this.sensorElapsed.toFixed(1)}s</div>`;
      for (const sensor of sensors) {
        const obs = sensor.getObservation();
        html += `<div class="sensor-live-row">`;
        html += `<span class="sensor-live-name">${sensor.constructor.displayName}</span>`;
        for (let i = 0; i < obs.headers.length; i++) {
          html += `<span class="sensor-live-val">${obs.headers[i]}: <b>${obs.values[i]}</b></span>`;
        }
        html += `</div>`;
      }
      this.sensorLivePanel.innerHTML = html;
    }
    /**
     * Note the current sensor readings for the observation table.
     */
    noteReading() {
      const sensors = this.findSensors();
      if (sensors.length === 0) return;
      const row = { time: this.sensorElapsed.toFixed(2), readings: [] };
      for (const sensor of sensors) {
        const obs = sensor.getObservation();
        row.readings.push({
          sensorName: sensor.constructor.displayName,
          headers: obs.headers,
          values: obs.values
        });
      }
      this.observationTable.push(row);
      if (this.btnNoteReading) {
        this.btnNoteReading.classList.add("note-flash");
        setTimeout(() => this.btnNoteReading.classList.remove("note-flash"), 400);
      }
      const noteCountSpan = document.getElementById("note-count");
      if (noteCountSpan) {
        noteCountSpan.textContent = this.observationTable.length;
      }
      this.showOutput(
        `<div class="sensor-running">\u{1F7E2} Sensor simulation running... (${this.observationTable.length} readings noted)</div>`,
        "info"
      );
    }
    /**
     * Stop the continuous sensor simulation and display observations.
     */
    stopSensorSimulation() {
      this.running = false;
      this.sensorMode = false;
      this.sensorDataTimer = void 0;
      if (this.sensorAnimFrame) {
        cancelAnimationFrame(this.sensorAnimFrame);
        this.sensorAnimFrame = null;
      }
      if (this.btnStartSensor) this.btnStartSensor.disabled = false;
      if (this.btnStopSensor) this.btnStopSensor.disabled = true;
      if (this.btnNoteReading) this.btnNoteReading.disabled = true;
      if (this.btnRun) this.btnRun.disabled = false;
      if (this.sensorLivePanel) this.sensorLivePanel.style.display = "none";
      if (this.observationTable.length > 0) {
        this._displayObservationTable();
      } else {
        this.showOutput("Sensor simulation stopped. No readings were noted.", "info");
      }
      this.updateButtonStates();
    }
    /**
     * Display the accumulated observation table.
     */
    _displayObservationTable() {
      if (this.observationTable.length === 0) return;
      const firstRow = this.observationTable[0];
      let allHeaders = ["Time (s)"];
      for (const reading of firstRow.readings) {
        for (const h of reading.headers) {
          allHeaders.push(`${reading.sensorName}: ${h}`);
        }
      }
      let html = '<div class="observation-table-wrapper">';
      html += "<h4>\u{1F4CB} Observation Table</h4>";
      html += '<table class="observation-table"><thead><tr>';
      html += allHeaders.map((h) => `<th>${h}</th>`).join("");
      html += "</tr></thead><tbody>";
      for (const row of this.observationTable) {
        html += "<tr>";
        html += `<td>${row.time}</td>`;
        for (const reading of row.readings) {
          for (const val of reading.values) {
            html += `<td>${val}</td>`;
          }
        }
        html += "</tr>";
      }
      html += "</tbody></table>";
      html += `
            <div style="margin-top: 10px; display: flex; gap: 8px;">
                <button class="btn btn-secondary btn-small" id="btn-download-observations" title="Download CSV">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download CSV
                </button>
                <button class="btn btn-danger btn-small" style="background: var(--error-bg); color: var(--error-text); border: 1px solid var(--error-border);" id="btn-clear-table" title="Clear Table">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Clear Table
                </button>
            </div>
        `;
      html += "</div>";
      this.showOutput(html, "success");
      setTimeout(() => {
        const dlBtn = document.getElementById("btn-download-observations");
        if (dlBtn) {
          dlBtn.addEventListener("click", () => this._downloadObservationsCSV(allHeaders));
        }
        const btnClear = document.getElementById("btn-clear-table");
        if (btnClear) {
          btnClear.onclick = () => {
            this.observationTable = [];
            const noteCountSpan = document.getElementById("note-count");
            if (noteCountSpan) noteCountSpan.textContent = "0";
            this.showOutput("Table cleared.", "info");
          };
        }
      }, 50);
    }
    /**
     * Download observations as CSV.
     */
    _downloadObservationsCSV(headers) {
      let csv = headers.join(",") + "\n";
      for (const row of this.observationTable) {
        let line = [row.time];
        for (const reading of row.readings) {
          line.push(...reading.values);
        }
        csv += line.join(",") + "\n";
      }
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sensor_observations_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // src/templates/verification_of_superposition_theorem.js
  var verification_of_superposition_theorem_template = {
    expId: "basic-ee-exp-2",
    circuitType: "dc_linear",
    components: [
      {
        "id": "comp_13",
        "type": "voltage_source",
        "x": 340,
        "y": 260,
        "rotation": 0,
        "properties": {
          "voltage": 5,
          "type": "dc",
          "frequency": 50,
          "phase": 0
        },
        "state": {}
      },
      {
        "id": "comp_16",
        "type": "resistor",
        "x": 420,
        "y": 160,
        "rotation": 0,
        "properties": {
          "resistance": 330
        },
        "state": {}
      },
      {
        "id": "comp_17",
        "type": "resistor",
        "x": 580,
        "y": 160,
        "rotation": 0,
        "properties": {
          "resistance": 220
        },
        "state": {}
      },
      {
        "id": "comp_18",
        "type": "resistor",
        "x": 500,
        "y": 340,
        "rotation": 90,
        "properties": {
          "resistance": 1e3
        },
        "state": {}
      },
      {
        "id": "comp_19",
        "type": "voltage_source",
        "x": 660,
        "y": 260,
        "rotation": 0,
        "properties": {
          "voltage": 5,
          "type": "dc",
          "frequency": 50,
          "phase": 0
        },
        "state": {}
      },
      {
        "id": "comp_21",
        "type": "ground",
        "x": 500,
        "y": 460,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_22",
        "type": "junction",
        "x": 500,
        "y": 160,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_23",
        "type": "ammeter",
        "x": 500,
        "y": 240,
        "rotation": 90,
        "properties": {
          "current": 0
        }
      }
    ],
    wires: [
      {
        "id": "wire_2",
        "startTerminal": "comp_13_positive",
        "endTerminal": "comp_16_left",
        "points": [
          {
            "x": 340,
            "y": 230
          },
          {
            "x": 365,
            "y": 230
          },
          {
            "x": 365,
            "y": 160
          },
          {
            "x": 390,
            "y": 160
          }
        ]
      },
      {
        "id": "wire_6",
        "startTerminal": "comp_16_right",
        "endTerminal": "comp_22_node",
        "points": [
          {
            "x": 450,
            "y": 160
          },
          {
            "x": 475,
            "y": 160
          },
          {
            "x": 475,
            "y": 160
          },
          {
            "x": 500,
            "y": 160
          }
        ]
      },
      {
        "id": "wire_8",
        "startTerminal": "comp_22_node",
        "endTerminal": "comp_17_left",
        "points": [
          {
            "x": 500,
            "y": 160
          },
          {
            "x": 525,
            "y": 160
          },
          {
            "x": 525,
            "y": 160
          },
          {
            "x": 550,
            "y": 160
          }
        ]
      },
      {
        "id": "wire_12",
        "startTerminal": "comp_17_right",
        "endTerminal": "comp_19_positive",
        "points": [
          {
            "x": 610,
            "y": 160
          },
          {
            "x": 635,
            "y": 160
          },
          {
            "x": 635,
            "y": 230
          },
          {
            "x": 660,
            "y": 230
          }
        ]
      },
      {
        "id": "wire_14",
        "startTerminal": "comp_13_negative",
        "endTerminal": "comp_21_ref",
        "points": [
          {
            "x": 340,
            "y": 290
          },
          {
            "x": 420,
            "y": 290
          },
          {
            "x": 420,
            "y": 445
          },
          {
            "x": 500,
            "y": 445
          }
        ]
      },
      {
        "id": "wire_16",
        "startTerminal": "comp_21_ref",
        "endTerminal": "comp_19_negative",
        "points": [
          {
            "x": 500,
            "y": 445
          },
          {
            "x": 580,
            "y": 445
          },
          {
            "x": 580,
            "y": 290
          },
          {
            "x": 660,
            "y": 290
          }
        ]
      },
      {
        "id": "wire_18",
        "startTerminal": "comp_21_ref",
        "endTerminal": "comp_18_right",
        "points": [
          {
            "x": 500,
            "y": 445
          },
          {
            "x": 500,
            "y": 445
          },
          {
            "x": 500,
            "y": 370
          },
          {
            "x": 500,
            "y": 370
          }
        ]
      },
      {
        "id": "wire_25",
        "startTerminal": "comp_23_positive",
        "endTerminal": "comp_22_node",
        "points": [
          {
            "x": 500,
            "y": 210
          },
          {
            "x": 500,
            "y": 210
          },
          {
            "x": 500,
            "y": 160
          },
          {
            "x": 500,
            "y": 160
          }
        ]
      },
      {
        "id": "wire_27",
        "startTerminal": "comp_23_negative",
        "endTerminal": "comp_18_left",
        "points": [
          {
            "x": 500,
            "y": 270
          },
          {
            "x": 500,
            "y": 270
          },
          {
            "x": 500,
            "y": 310
          },
          {
            "x": 500,
            "y": 310
          }
        ]
      }
    ]
  };

  // src/templates/verification_of_thevenin_theorem.js
  var verification_of_thevenin_theorem_template = {
    expId: "basic-ee-exp-3",
    circuitType: "dc_linear",
    components: [
      {
        "id": "comp_17",
        "type": "voltage_source",
        "x": 240,
        "y": 300,
        "rotation": 0,
        "properties": {
          "voltage": 5,
          "type": "dc",
          "frequency": 50,
          "phase": 0
        },
        "state": {}
      },
      {
        "id": "comp_18",
        "type": "resistor",
        "x": 320,
        "y": 180,
        "rotation": 0,
        "properties": {
          "resistance": 270
        },
        "state": {}
      },
      {
        "id": "comp_19",
        "type": "resistor",
        "x": 460,
        "y": 180,
        "rotation": 0,
        "properties": {
          "resistance": 150
        },
        "state": {}
      },
      {
        "id": "comp_20",
        "type": "resistor",
        "x": 400,
        "y": 280,
        "rotation": 90,
        "properties": {
          "resistance": 220
        },
        "state": {}
      },
      {
        "id": "comp_21",
        "type": "resistor",
        "x": 560,
        "y": 360,
        "rotation": 90,
        "properties": {
          "resistance": 82
        },
        "state": {}
      },
      {
        "id": "comp_22",
        "type": "ammeter",
        "x": 560,
        "y": 240,
        "rotation": 90,
        "properties": {
          "current": 0.006355442569909869
        }
      },
      {
        "id": "comp_23",
        "type": "ground",
        "x": 400,
        "y": 460,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_24",
        "type": "junction",
        "x": 400,
        "y": 180,
        "rotation": 90,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_25",
        "type": "junction",
        "x": 560,
        "y": 180,
        "rotation": 90,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_26",
        "type": "junction",
        "x": 560,
        "y": 300,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_27",
        "type": "junction",
        "x": 560,
        "y": 420,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_28",
        "type": "junction",
        "x": 400,
        "y": 420,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_29",
        "type": "voltmeter",
        "x": 660,
        "y": 360,
        "rotation": 90,
        "properties": {
          "voltage": 0.5211462907326092
        }
      }
    ],
    "wires": [
      {
        "id": "wire_2",
        "startTerminal": "comp_17_negative",
        "endTerminal": "comp_28_node",
        "points": [
          {
            "x": 240,
            "y": 330
          },
          {
            "x": 240,
            "y": 330
          },
          {
            "x": 240,
            "y": 420
          },
          {
            "x": 400,
            "y": 420
          }
        ]
      },
      {
        "id": "wire_4",
        "startTerminal": "comp_28_node",
        "endTerminal": "comp_27_node",
        "points": [
          {
            "x": 400,
            "y": 420
          },
          {
            "x": 480,
            "y": 420
          },
          {
            "x": 480,
            "y": 420
          },
          {
            "x": 560,
            "y": 420
          }
        ]
      },
      {
        "id": "wire_6",
        "startTerminal": "comp_27_node",
        "endTerminal": "comp_21_right",
        "points": [
          {
            "x": 560,
            "y": 420
          },
          {
            "x": 560,
            "y": 420
          },
          {
            "x": 560,
            "y": 390
          },
          {
            "x": 560,
            "y": 390
          }
        ]
      },
      {
        "id": "wire_8",
        "startTerminal": "comp_21_left",
        "endTerminal": "comp_26_node",
        "points": [
          {
            "x": 560,
            "y": 330
          },
          {
            "x": 560,
            "y": 330
          },
          {
            "x": 560,
            "y": 300
          },
          {
            "x": 560,
            "y": 300
          }
        ]
      },
      {
        "id": "wire_10",
        "startTerminal": "comp_26_node",
        "endTerminal": "comp_22_negative",
        "points": [
          {
            "x": 560,
            "y": 300
          },
          {
            "x": 560,
            "y": 300
          },
          {
            "x": 560,
            "y": 270
          },
          {
            "x": 560,
            "y": 270
          }
        ]
      },
      {
        "id": "wire_12",
        "startTerminal": "comp_22_positive",
        "endTerminal": "comp_25_node",
        "points": [
          {
            "x": 560,
            "y": 210
          },
          {
            "x": 560,
            "y": 210
          },
          {
            "x": 560,
            "y": 180
          },
          {
            "x": 560,
            "y": 180
          }
        ]
      },
      {
        "id": "wire_14",
        "startTerminal": "comp_25_node",
        "endTerminal": "comp_19_right",
        "points": [
          {
            "x": 560,
            "y": 180
          },
          {
            "x": 525,
            "y": 180
          },
          {
            "x": 525,
            "y": 180
          },
          {
            "x": 490,
            "y": 180
          }
        ]
      },
      {
        "id": "wire_16",
        "startTerminal": "comp_19_left",
        "endTerminal": "comp_24_node",
        "points": [
          {
            "x": 430,
            "y": 180
          },
          {
            "x": 415,
            "y": 180
          },
          {
            "x": 415,
            "y": 180
          },
          {
            "x": 400,
            "y": 180
          }
        ]
      },
      {
        "id": "wire_18",
        "startTerminal": "comp_24_node",
        "endTerminal": "comp_18_right",
        "points": [
          {
            "x": 400,
            "y": 180
          },
          {
            "x": 375,
            "y": 180
          },
          {
            "x": 375,
            "y": 180
          },
          {
            "x": 350,
            "y": 180
          }
        ]
      },
      {
        "id": "wire_20",
        "startTerminal": "comp_18_left",
        "endTerminal": "comp_17_positive",
        "points": [
          {
            "x": 290,
            "y": 180
          },
          {
            "x": 240,
            "y": 180
          },
          {
            "x": 240,
            "y": 270
          },
          {
            "x": 240,
            "y": 270
          }
        ]
      },
      {
        "id": "wire_22",
        "startTerminal": "comp_24_node",
        "endTerminal": "comp_20_left",
        "points": [
          {
            "x": 400,
            "y": 180
          },
          {
            "x": 400,
            "y": 180
          },
          {
            "x": 400,
            "y": 250
          },
          {
            "x": 400,
            "y": 250
          }
        ]
      },
      {
        "id": "wire_24",
        "startTerminal": "comp_20_right",
        "endTerminal": "comp_28_node",
        "points": [
          {
            "x": 400,
            "y": 310
          },
          {
            "x": 400,
            "y": 310
          },
          {
            "x": 400,
            "y": 420
          },
          {
            "x": 400,
            "y": 420
          }
        ]
      },
      {
        "id": "wire_27",
        "startTerminal": "comp_26_node",
        "endTerminal": "comp_29_positive",
        "points": [
          {
            "x": 560,
            "y": 300
          },
          {
            "x": 660,
            "y": 300
          },
          {
            "x": 660,
            "y": 330
          },
          {
            "x": 660,
            "y": 330
          }
        ]
      },
      {
        "id": "wire_29",
        "startTerminal": "comp_29_negative",
        "endTerminal": "comp_27_node",
        "points": [
          {
            "x": 660,
            "y": 390
          },
          {
            "x": 660,
            "y": 390
          },
          {
            "x": 660,
            "y": 420
          },
          {
            "x": 560,
            "y": 420
          }
        ]
      },
      {
        "id": "wire_31",
        "startTerminal": "comp_28_node",
        "endTerminal": "comp_23_ref",
        "points": [
          {
            "x": 400,
            "y": 420
          },
          {
            "x": 400,
            "y": 420
          },
          {
            "x": 400,
            "y": 445
          },
          {
            "x": 400,
            "y": 445
          }
        ]
      }
    ]
  };

  // src/templates/transient_response_rlc.js
  var transient_response_rlc_template = {
    expId: "basic-ee-exp-4",
    circuitType: "transient_rlc",
    components: [
      {
        "id": "comp_19",
        "type": "voltage_source",
        "x": 180,
        "y": 260,
        "rotation": 0,
        "properties": {
          "voltage": 5,
          "type": "dc",
          "frequency": 50,
          "phase": 0
        },
        "state": {}
      },
      {
        "id": "comp_20",
        "type": "resistor",
        "x": 260,
        "y": 180,
        "rotation": 0,
        "properties": {
          "resistance": 1e3
        },
        "state": {}
      },
      {
        "id": "comp_21",
        "type": "capacitor",
        "x": 500,
        "y": 180,
        "rotation": 0,
        "properties": {
          "capacitance": 1e-7
        },
        "state": {
          "voltage": 0,
          "current": 0
        }
      },
      {
        "id": "comp_22",
        "type": "inductor",
        "x": 380,
        "y": 180,
        "rotation": 0,
        "properties": {
          "inductance": 0.01
        },
        "state": {
          "current": 0,
          "voltage": 0
        }
      },
      {
        "id": "comp_23",
        "type": "ground",
        "x": 360,
        "y": 340,
        "rotation": 0,
        "properties": {},
        "state": {}
      }
    ],
    wires: [
      {
        "id": "wire_2",
        "startTerminal": "comp_19_positive",
        "endTerminal": "comp_20_left",
        "points": [
          { "x": 180, "y": 230 },
          { "x": 180, "y": 230 },
          { "x": 180, "y": 180 },
          { "x": 230, "y": 180 }
        ]
      },
      {
        "id": "wire_4",
        "startTerminal": "comp_20_right",
        "endTerminal": "comp_22_left",
        "points": [
          { "x": 290, "y": 180 },
          { "x": 320, "y": 180 },
          { "x": 320, "y": 180 },
          { "x": 350, "y": 180 }
        ]
      },
      {
        "id": "wire_6",
        "startTerminal": "comp_22_right",
        "endTerminal": "comp_21_left",
        "points": [
          { "x": 410, "y": 180 },
          { "x": 440, "y": 180 },
          { "x": 440, "y": 180 },
          { "x": 470, "y": 180 }
        ]
      },
      {
        "id": "wire_8",
        "startTerminal": "comp_19_negative",
        "endTerminal": "comp_23_ref",
        "points": [
          { "x": 180, "y": 290 },
          { "x": 180, "y": 290 },
          { "x": 180, "y": 325 },
          { "x": 360, "y": 325 }
        ]
      },
      {
        "id": "wire_10",
        "startTerminal": "comp_23_ref",
        "endTerminal": "comp_21_right",
        "points": [
          { "x": 360, "y": 325 },
          { "x": 540, "y": 325 },
          { "x": 540, "y": 180 },
          { "x": 530, "y": 180 }
        ]
      }
    ]
  };

  // src/templates/oc_sc_test_single_phase_transformer.js
  var oc_sc_test_single_phase_transformer_template = {
    expId: "basic-ee-exp-5",
    circuitType: "oc_sc_test_single_phase_transformer",
    components: [
      {
        "id": "comp_21",
        "type": "voltage_source",
        "x": 140,
        "y": 240,
        "rotation": 0,
        "properties": {
          "voltage": 120,
          "type": "ac",
          "frequency": 50,
          "phase": 0
        },
        "state": {}
      },
      {
        "id": "comp_22",
        "type": "ammeter",
        "x": 260,
        "y": 160,
        "rotation": 0,
        "properties": {
          "current": 0.09990665847914172
        }
      },
      {
        "id": "comp_23",
        "type": "wattmeter",
        "x": 400,
        "y": 200,
        "rotation": 0,
        "properties": {
          "power": 11.988655017497006,
          "voltage": 120,
          "current": 0.09990545847914171
        }
      },
      {
        "id": "comp_24",
        "type": "voltmeter",
        "x": 540,
        "y": 240,
        "rotation": 90,
        "properties": {
          "voltage": 120
        }
      },
      {
        "id": "comp_26",
        "type": "ground",
        "x": 400,
        "y": 360,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_27",
        "type": "junction",
        "x": 540,
        "y": 160,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_29",
        "type": "transformer",
        "x": 660,
        "y": 240,
        "rotation": 0,
        "properties": {
          "turnsRatio": 0.5,
          "Req": 1.15,
          "Xeq": 0.85,
          "Rc": 1200,
          "Xm": 1e3,
          "ratingKVA": 2,
          "primaryVoltage": 120,
          "secondaryVoltage": 240
        },
        "state": {}
      }
    ],
    wires: [
      {
        "id": "wire_2",
        "startTerminal": "comp_21_positive",
        "endTerminal": "comp_22_positive",
        "points": [
          {
            "x": 140,
            "y": 210
          },
          {
            "x": 140,
            "y": 210
          },
          {
            "x": 140,
            "y": 160
          },
          {
            "x": 230,
            "y": 160
          }
        ]
      },
      {
        "id": "wire_4",
        "startTerminal": "comp_22_negative",
        "endTerminal": "comp_23_M",
        "points": [
          {
            "x": 290,
            "y": 160
          },
          {
            "x": 325,
            "y": 160
          },
          {
            "x": 325,
            "y": 175
          },
          {
            "x": 360,
            "y": 175
          }
        ]
      },
      {
        "id": "wire_7",
        "startTerminal": "comp_23_M",
        "endTerminal": "comp_23_C",
        "points": [
          {
            "x": 360,
            "y": 175
          },
          {
            "x": 360,
            "y": 175
          },
          {
            "x": 360,
            "y": 225
          },
          {
            "x": 360,
            "y": 225
          }
        ]
      },
      {
        "id": "wire_9",
        "startTerminal": "comp_21_negative",
        "endTerminal": "comp_26_ref",
        "points": [
          {
            "x": 140,
            "y": 270
          },
          {
            "x": 140,
            "y": 270
          },
          {
            "x": 140,
            "y": 345
          },
          {
            "x": 400,
            "y": 345
          }
        ]
      },
      {
        "id": "wire_11",
        "startTerminal": "comp_23_V",
        "endTerminal": "comp_26_ref",
        "points": [
          {
            "x": 440,
            "y": 225
          },
          {
            "x": 440,
            "y": 225
          },
          {
            "x": 440,
            "y": 345
          },
          {
            "x": 400,
            "y": 345
          }
        ]
      },
      {
        "id": "wire_13",
        "startTerminal": "comp_26_ref",
        "endTerminal": "comp_24_negative",
        "points": [
          {
            "x": 400,
            "y": 345
          },
          {
            "x": 540,
            "y": 345
          },
          {
            "x": 540,
            "y": 270
          },
          {
            "x": 540,
            "y": 270
          }
        ]
      },
      {
        "id": "wire_15",
        "startTerminal": "comp_23_L",
        "endTerminal": "comp_27_node",
        "points": [
          {
            "x": 440,
            "y": 175
          },
          {
            "x": 490,
            "y": 175
          },
          {
            "x": 490,
            "y": 160
          },
          {
            "x": 540,
            "y": 160
          }
        ]
      },
      {
        "id": "wire_17",
        "startTerminal": "comp_24_positive",
        "endTerminal": "comp_27_node",
        "points": [
          {
            "x": 540,
            "y": 210
          },
          {
            "x": 540,
            "y": 210
          },
          {
            "x": 540,
            "y": 160
          },
          {
            "x": 540,
            "y": 160
          }
        ]
      },
      {
        "id": "wire_19",
        "startTerminal": "comp_27_node",
        "endTerminal": "comp_29_primary_pos",
        "points": [
          {
            "x": 540,
            "y": 160
          },
          {
            "x": 620,
            "y": 160
          },
          {
            "x": 620,
            "y": 210
          },
          {
            "x": 620,
            "y": 210
          }
        ]
      },
      {
        "id": "wire_22",
        "startTerminal": "comp_29_primary_neg",
        "endTerminal": "comp_26_ref",
        "points": [
          {
            "x": 620,
            "y": 270
          },
          {
            "x": 620,
            "y": 270
          },
          {
            "x": 620,
            "y": 345
          },
          {
            "x": 400,
            "y": 345
          }
        ]
      }
    ]
  };

  // src/templates/three_phase_connections.js
  var three_phase_connections_template = {
    expId: "basic-ee-exp-6",
    circuitType: "AC",
    components: [
      {
        "id": "comp_23",
        "type": "three_phase_source",
        "x": 240,
        "y": 260,
        "rotation": 0,
        "properties": {
          "voltage": 415,
          "frequency": 50,
          "phaseShift": 0
        },
        "state": {}
      },
      {
        "id": "comp_24",
        "type": "transformer",
        "x": 560,
        "y": 140,
        "rotation": 0,
        "properties": {
          "turnsRatio": 2,
          "Req": 1.15,
          "Xeq": 0.85,
          "Rc": 1200,
          "Xm": 1e3,
          "ratingKVA": 2,
          "primaryVoltage": 240,
          "secondaryVoltage": 120
        },
        "state": {}
      },
      {
        "id": "comp_25",
        "type": "transformer",
        "x": 560,
        "y": 300,
        "rotation": 0,
        "properties": {
          "turnsRatio": 2,
          "Req": 1.15,
          "Xeq": 0.85,
          "Rc": 1200,
          "Xm": 1e3,
          "ratingKVA": 2,
          "primaryVoltage": 240,
          "secondaryVoltage": 120
        },
        "state": {}
      },
      {
        "id": "comp_26",
        "type": "transformer",
        "x": 560,
        "y": 460,
        "rotation": 0,
        "properties": {
          "turnsRatio": 2,
          "Req": 1.15,
          "Xeq": 0.85,
          "Rc": 1200,
          "Xm": 1e3,
          "ratingKVA": 2,
          "primaryVoltage": 240,
          "secondaryVoltage": 120
        },
        "state": {}
      },
      {
        "id": "comp_27",
        "type": "voltmeter",
        "x": 440,
        "y": 220,
        "rotation": 90,
        "properties": {
          "voltage": 0
        }
      },
      {
        "id": "comp_28",
        "type": "junction",
        "x": 440,
        "y": 120,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_29",
        "type": "junction",
        "x": 440,
        "y": 280,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_30",
        "type": "junction",
        "x": 680,
        "y": 320,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_31",
        "type": "voltmeter",
        "x": 620,
        "y": 220,
        "rotation": 90,
        "properties": {
          "voltage": 0
        }
      },
      {
        "id": "comp_32",
        "type": "ground",
        "x": 400,
        "y": 560,
        "rotation": 0,
        "properties": {},
        "state": {}
      }
    ],
    wires: [
      {
        "id": "wire_7",
        "startTerminal": "comp_23_phase_B",
        "endTerminal": "comp_26_primary_pos",
        "points": [
          {
            "x": 270,
            "y": 300
          },
          {
            "x": 260,
            "y": 300
          },
          {
            "x": 260,
            "y": 430
          },
          {
            "x": 520,
            "y": 430
          }
        ]
      },
      {
        "id": "wire_9",
        "startTerminal": "comp_23_neutral",
        "endTerminal": "comp_24_primary_neg",
        "points": [
          {
            "x": 210,
            "y": 300
          },
          {
            "x": 140,
            "y": 300
          },
          {
            "x": 140,
            "y": 170
          },
          {
            "x": 520,
            "y": 170
          }
        ]
      },
      {
        "id": "wire_11",
        "startTerminal": "comp_23_neutral",
        "endTerminal": "comp_25_primary_neg",
        "points": [
          {
            "x": 210,
            "y": 300
          },
          {
            "x": 140,
            "y": 300
          },
          {
            "x": 140,
            "y": 330
          },
          {
            "x": 520,
            "y": 330
          }
        ]
      },
      {
        "id": "wire_13",
        "startTerminal": "comp_23_neutral",
        "endTerminal": "comp_26_primary_neg",
        "points": [
          {
            "x": 210,
            "y": 300
          },
          {
            "x": 140,
            "y": 300
          },
          {
            "x": 140,
            "y": 490
          },
          {
            "x": 520,
            "y": 490
          }
        ]
      },
      {
        "id": "wire_17",
        "startTerminal": "comp_28_node",
        "endTerminal": "comp_24_primary_pos",
        "points": [
          {
            "x": 440,
            "y": 120
          },
          {
            "x": 480,
            "y": 120
          },
          {
            "x": 480,
            "y": 110
          },
          {
            "x": 520,
            "y": 110
          }
        ]
      },
      {
        "id": "wire_19",
        "startTerminal": "comp_28_node",
        "endTerminal": "comp_27_positive",
        "points": [
          {
            "x": 440,
            "y": 120
          },
          {
            "x": 440,
            "y": 120
          },
          {
            "x": 440,
            "y": 190
          },
          {
            "x": 440,
            "y": 190
          }
        ]
      },
      {
        "id": "wire_21",
        "startTerminal": "comp_23_phase_R",
        "endTerminal": "comp_28_node",
        "points": [
          {
            "x": 210,
            "y": 220
          },
          {
            "x": 200,
            "y": 220
          },
          {
            "x": 200,
            "y": 120
          },
          {
            "x": 440,
            "y": 120
          }
        ]
      },
      {
        "id": "wire_23",
        "startTerminal": "comp_29_node",
        "endTerminal": "comp_25_primary_pos",
        "points": [
          {
            "x": 440,
            "y": 280
          },
          {
            "x": 480,
            "y": 280
          },
          {
            "x": 480,
            "y": 270
          },
          {
            "x": 520,
            "y": 270
          }
        ]
      },
      {
        "id": "wire_25",
        "startTerminal": "comp_27_negative",
        "endTerminal": "comp_29_node",
        "points": [
          {
            "x": 440,
            "y": 250
          },
          {
            "x": 440,
            "y": 250
          },
          {
            "x": 440,
            "y": 280
          },
          {
            "x": 440,
            "y": 280
          }
        ]
      },
      {
        "id": "wire_27",
        "startTerminal": "comp_29_node",
        "endTerminal": "comp_23_phase_Y",
        "points": [
          {
            "x": 440,
            "y": 280
          },
          {
            "x": 355,
            "y": 280
          },
          {
            "x": 355,
            "y": 220
          },
          {
            "x": 270,
            "y": 220
          }
        ]
      },
      {
        "id": "wire_30",
        "startTerminal": "comp_24_secondary_neg",
        "endTerminal": "comp_30_node",
        "points": [
          {
            "x": 600,
            "y": 170
          },
          {
            "x": 680,
            "y": 170
          },
          {
            "x": 680,
            "y": 320
          },
          {
            "x": 680,
            "y": 320
          }
        ]
      },
      {
        "id": "wire_32",
        "startTerminal": "comp_30_node",
        "endTerminal": "comp_25_secondary_neg",
        "points": [
          {
            "x": 680,
            "y": 320
          },
          {
            "x": 640,
            "y": 320
          },
          {
            "x": 640,
            "y": 330
          },
          {
            "x": 600,
            "y": 330
          }
        ]
      },
      {
        "id": "wire_34",
        "startTerminal": "comp_30_node",
        "endTerminal": "comp_26_secondary_neg",
        "points": [
          {
            "x": 680,
            "y": 320
          },
          {
            "x": 680,
            "y": 320
          },
          {
            "x": 680,
            "y": 490
          },
          {
            "x": 600,
            "y": 490
          }
        ]
      },
      {
        "id": "wire_36",
        "startTerminal": "comp_31_positive",
        "endTerminal": "comp_24_secondary_pos",
        "points": [
          {
            "x": 620,
            "y": 190
          },
          {
            "x": 620,
            "y": 190
          },
          {
            "x": 620,
            "y": 110
          },
          {
            "x": 600,
            "y": 110
          }
        ]
      },
      {
        "id": "wire_38",
        "startTerminal": "comp_31_negative",
        "endTerminal": "comp_25_secondary_pos",
        "points": [
          {
            "x": 620,
            "y": 250
          },
          {
            "x": 620,
            "y": 250
          },
          {
            "x": 620,
            "y": 270
          },
          {
            "x": 600,
            "y": 270
          }
        ]
      },
      {
        "id": "wire_40",
        "startTerminal": "comp_23_neutral",
        "endTerminal": "comp_32_ref",
        "points": [
          {
            "x": 210,
            "y": 300
          },
          {
            "x": 140,
            "y": 300
          },
          {
            "x": 140,
            "y": 545
          },
          {
            "x": 400,
            "y": 545
          }
        ]
      }
    ]
  };

  // src/templates/power_factor_correction.js
  var power_factor_correction_template = {
    expId: "basic-ee-exp-1",
    circuitType: "AC",
    components: [
      {
        "id": "comp_1",
        "type": "voltage_source",
        "x": 260,
        "y": 220,
        "rotation": 0,
        "properties": {
          "voltage": 174,
          "type": "ac",
          "frequency": 50,
          "phase": 0
        },
        "state": {}
      },
      {
        "id": "comp_2",
        "type": "ammeter",
        "x": 320,
        "y": 140,
        "rotation": 0,
        "properties": {
          "current": 2.0028036587678355
        }
      },
      {
        "id": "comp_3",
        "type": "wattmeter",
        "x": 460,
        "y": 160,
        "rotation": 0,
        "properties": {
          "power": 240.67307487905,
          "voltage": 174,
          "current": 2.002802457085896
        }
      },
      {
        "id": "comp_4",
        "type": "resistor",
        "x": 640,
        "y": 140,
        "rotation": 0,
        "properties": {
          "resistance": 60
        },
        "state": {}
      },
      {
        "id": "comp_5",
        "type": "voltmeter",
        "x": 560,
        "y": 200,
        "rotation": 90,
        "properties": {
          "voltage": 174
        }
      },
      {
        "id": "comp_6",
        "type": "junction",
        "x": 560,
        "y": 140,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_7",
        "type": "ground",
        "x": 420,
        "y": 300,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_10",
        "type": "junction",
        "x": 620,
        "y": 280,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_11",
        "type": "inductor",
        "x": 720,
        "y": 220,
        "rotation": 90,
        "properties": {
          "inductance": 0.2
        },
        "state": {
          "current": 0,
          "voltage": 0
        }
      }
    ],
    wires: [
      {
        "id": "wire_1",
        "startTerminal": "comp_4_left",
        "endTerminal": "comp_6_node",
        "points": [
          {
            "x": 610,
            "y": 140
          },
          {
            "x": 585,
            "y": 140
          },
          {
            "x": 585,
            "y": 140
          },
          {
            "x": 560,
            "y": 140
          }
        ]
      },
      {
        "id": "wire_4",
        "startTerminal": "comp_3_L",
        "endTerminal": "comp_6_node",
        "points": [
          {
            "x": 500,
            "y": 135
          },
          {
            "x": 530,
            "y": 135
          },
          {
            "x": 530,
            "y": 140
          },
          {
            "x": 560,
            "y": 140
          }
        ]
      },
      {
        "id": "wire_6",
        "startTerminal": "comp_6_node",
        "endTerminal": "comp_5_positive",
        "points": [
          {
            "x": 560,
            "y": 140
          },
          {
            "x": 560,
            "y": 140
          },
          {
            "x": 560,
            "y": 170
          },
          {
            "x": 560,
            "y": 170
          }
        ]
      },
      {
        "id": "wire_8",
        "startTerminal": "comp_3_C",
        "endTerminal": "comp_3_M",
        "points": [
          {
            "x": 420,
            "y": 185
          },
          {
            "x": 420,
            "y": 185
          },
          {
            "x": 420,
            "y": 135
          },
          {
            "x": 420,
            "y": 135
          }
        ]
      },
      {
        "id": "wire_9",
        "startTerminal": "comp_3_M",
        "endTerminal": "comp_2_negative",
        "points": [
          {
            "x": 420,
            "y": 135
          },
          {
            "x": 385,
            "y": 135
          },
          {
            "x": 385,
            "y": 140
          },
          {
            "x": 350,
            "y": 140
          }
        ]
      },
      {
        "id": "wire_11",
        "startTerminal": "comp_2_positive",
        "endTerminal": "comp_1_positive",
        "points": [
          {
            "x": 290,
            "y": 140
          },
          {
            "x": 260,
            "y": 140
          },
          {
            "x": 260,
            "y": 190
          },
          {
            "x": 260,
            "y": 190
          }
        ]
      },
      {
        "id": "wire_13",
        "startTerminal": "comp_1_negative",
        "endTerminal": "comp_7_ref",
        "points": [
          {
            "x": 260,
            "y": 250
          },
          {
            "x": 260,
            "y": 250
          },
          {
            "x": 260,
            "y": 285
          },
          {
            "x": 420,
            "y": 285
          }
        ]
      },
      {
        "id": "wire_14",
        "startTerminal": "comp_7_ref",
        "endTerminal": "comp_5_negative",
        "points": [
          {
            "x": 420,
            "y": 285
          },
          {
            "x": 560,
            "y": 285
          },
          {
            "x": 560,
            "y": 230
          },
          {
            "x": 560,
            "y": 230
          }
        ]
      },
      {
        "id": "wire_18",
        "startTerminal": "comp_3_V",
        "endTerminal": "comp_7_ref",
        "points": [
          {
            "x": 500,
            "y": 185
          },
          {
            "x": 500,
            "y": 185
          },
          {
            "x": 500,
            "y": 285
          },
          {
            "x": 420,
            "y": 285
          }
        ]
      },
      {
        "id": "wire_26",
        "startTerminal": "comp_10_node",
        "endTerminal": "comp_7_ref",
        "points": [
          {
            "x": 620,
            "y": 280
          },
          {
            "x": 520,
            "y": 280
          },
          {
            "x": 520,
            "y": 285
          },
          {
            "x": 420,
            "y": 285
          }
        ]
      },
      {
        "id": "wire_30",
        "startTerminal": "comp_11_left",
        "endTerminal": "comp_4_right",
        "points": [
          {
            "x": 720,
            "y": 190
          },
          {
            "x": 695,
            "y": 190
          },
          {
            "x": 695,
            "y": 140
          },
          {
            "x": 670,
            "y": 140
          }
        ]
      },
      {
        "id": "wire_32",
        "startTerminal": "comp_11_right",
        "endTerminal": "comp_10_node",
        "points": [
          {
            "x": 720,
            "y": 250
          },
          {
            "x": 670,
            "y": 250
          },
          {
            "x": 670,
            "y": 280
          },
          {
            "x": 620,
            "y": 280
          }
        ]
      }
    ]
  };

  // src/templates/transformer_test.js
  var transformer_test_template = {
    expId: "basic-ee-exp-7",
    circuitType: "transformer_test",
    components: [
      {
        "id": "comp_27",
        "type": "voltage_source",
        "x": 160,
        "y": 180,
        "rotation": 0,
        "properties": {
          "voltage": 230,
          "type": "ac",
          "frequency": 50,
          "phase": 0
        },
        "state": {}
      },
      {
        "id": "comp_28",
        "type": "wattmeter",
        "x": 300,
        "y": 120,
        "rotation": 0,
        "properties": {
          "power": 0,
          "voltage": 0,
          "current": 0
        }
      },
      {
        "id": "comp_29",
        "type": "ground",
        "x": 300,
        "y": 280,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_30",
        "type": "junction",
        "x": 420,
        "y": 100,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_31",
        "type": "junction",
        "x": 420,
        "y": 260,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_32",
        "type": "voltmeter",
        "x": 420,
        "y": 180,
        "rotation": 90,
        "properties": {
          "voltage": 0
        }
      },
      {
        "id": "comp_33",
        "type": "transformer",
        "x": 540,
        "y": 180,
        "rotation": 0,
        "properties": {
          "turnsRatio": 2,
          "Req": 1.15,
          "Xeq": 0.85,
          "Rc": 1200,
          "Xm": 1e3,
          "ratingKVA": 2,
          "primaryVoltage": 240,
          "secondaryVoltage": 120
        },
        "state": {}
      },
      {
        "id": "comp_34",
        "type": "junction",
        "x": 640,
        "y": 100,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_35",
        "type": "junction",
        "x": 640,
        "y": 260,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_36",
        "type": "voltmeter",
        "x": 640,
        "y": 180,
        "rotation": 90,
        "properties": {
          "voltage": 0
        }
      },
      {
        "id": "comp_37",
        "type": "ammeter",
        "x": 700,
        "y": 100,
        "rotation": 0,
        "properties": {
          "current": 0
        }
      },
      {
        "id": "comp_38",
        "type": "load",
        "x": 760,
        "y": 180,
        "rotation": 90,
        "properties": {
          "loadPercent": 75
        },
        "state": {
          "inductorCurrent": 0,
          "inductorVoltage": 0
        }
      }
    ],
    wires: [
      {
        "id": "wire_2",
        "startTerminal": "comp_27_positive",
        "endTerminal": "comp_28_M",
        "points": [
          {
            "x": 160,
            "y": 150
          },
          {
            "x": 160,
            "y": 150
          },
          {
            "x": 160,
            "y": 95
          },
          {
            "x": 260,
            "y": 95
          }
        ]
      },
      {
        "id": "wire_4",
        "startTerminal": "comp_27_negative",
        "endTerminal": "comp_29_ref",
        "points": [
          {
            "x": 160,
            "y": 210
          },
          {
            "x": 160,
            "y": 210
          },
          {
            "x": 160,
            "y": 265
          },
          {
            "x": 300,
            "y": 265
          }
        ]
      },
      {
        "id": "wire_7",
        "startTerminal": "comp_29_ref",
        "endTerminal": "comp_28_V",
        "points": [
          {
            "x": 300,
            "y": 265
          },
          {
            "x": 340,
            "y": 265
          },
          {
            "x": 340,
            "y": 145
          },
          {
            "x": 340,
            "y": 145
          }
        ]
      },
      {
        "id": "wire_9",
        "startTerminal": "comp_29_ref",
        "endTerminal": "comp_31_node",
        "points": [
          {
            "x": 300,
            "y": 265
          },
          {
            "x": 360,
            "y": 265
          },
          {
            "x": 360,
            "y": 260
          },
          {
            "x": 420,
            "y": 260
          }
        ]
      },
      {
        "id": "wire_11",
        "startTerminal": "comp_28_L",
        "endTerminal": "comp_30_node",
        "points": [
          {
            "x": 340,
            "y": 95
          },
          {
            "x": 380,
            "y": 95
          },
          {
            "x": 380,
            "y": 100
          },
          {
            "x": 420,
            "y": 100
          }
        ]
      },
      {
        "id": "wire_13",
        "startTerminal": "comp_32_positive",
        "endTerminal": "comp_30_node",
        "points": [
          {
            "x": 420,
            "y": 150
          },
          {
            "x": 420,
            "y": 150
          },
          {
            "x": 420,
            "y": 100
          },
          {
            "x": 420,
            "y": 100
          }
        ]
      },
      {
        "id": "wire_15",
        "startTerminal": "comp_32_negative",
        "endTerminal": "comp_31_node",
        "points": [
          {
            "x": 420,
            "y": 210
          },
          {
            "x": 420,
            "y": 210
          },
          {
            "x": 420,
            "y": 260
          },
          {
            "x": 420,
            "y": 260
          }
        ]
      },
      {
        "id": "wire_17",
        "startTerminal": "comp_30_node",
        "endTerminal": "comp_33_primary_pos",
        "points": [
          {
            "x": 420,
            "y": 100
          },
          {
            "x": 500,
            "y": 100
          },
          {
            "x": 500,
            "y": 150
          },
          {
            "x": 500,
            "y": 150
          }
        ]
      },
      {
        "id": "wire_19",
        "startTerminal": "comp_33_primary_neg",
        "endTerminal": "comp_31_node",
        "points": [
          {
            "x": 500,
            "y": 210
          },
          {
            "x": 500,
            "y": 210
          },
          {
            "x": 500,
            "y": 260
          },
          {
            "x": 420,
            "y": 260
          }
        ]
      },
      {
        "id": "wire_21",
        "startTerminal": "comp_33_secondary_pos",
        "endTerminal": "comp_34_node",
        "points": [
          {
            "x": 580,
            "y": 150
          },
          {
            "x": 580,
            "y": 150
          },
          {
            "x": 580,
            "y": 100
          },
          {
            "x": 640,
            "y": 100
          }
        ]
      },
      {
        "id": "wire_23",
        "startTerminal": "comp_33_secondary_neg",
        "endTerminal": "comp_35_node",
        "points": [
          {
            "x": 580,
            "y": 210
          },
          {
            "x": 580,
            "y": 210
          },
          {
            "x": 580,
            "y": 260
          },
          {
            "x": 640,
            "y": 260
          }
        ]
      },
      {
        "id": "wire_25",
        "startTerminal": "comp_36_positive",
        "endTerminal": "comp_34_node",
        "points": [
          {
            "x": 640,
            "y": 150
          },
          {
            "x": 640,
            "y": 150
          },
          {
            "x": 640,
            "y": 100
          },
          {
            "x": 640,
            "y": 100
          }
        ]
      },
      {
        "id": "wire_27",
        "startTerminal": "comp_36_negative",
        "endTerminal": "comp_35_node",
        "points": [
          {
            "x": 640,
            "y": 210
          },
          {
            "x": 640,
            "y": 210
          },
          {
            "x": 640,
            "y": 260
          },
          {
            "x": 640,
            "y": 260
          }
        ]
      },
      {
        "id": "wire_29",
        "startTerminal": "comp_34_node",
        "endTerminal": "comp_37_positive",
        "points": [
          {
            "x": 640,
            "y": 100
          },
          {
            "x": 655,
            "y": 100
          },
          {
            "x": 655,
            "y": 100
          },
          {
            "x": 670,
            "y": 100
          }
        ]
      },
      {
        "id": "wire_31",
        "startTerminal": "comp_38_left",
        "endTerminal": "comp_37_negative",
        "points": [
          {
            "x": 760,
            "y": 140
          },
          {
            "x": 760,
            "y": 140
          },
          {
            "x": 760,
            "y": 100
          },
          {
            "x": 730,
            "y": 100
          }
        ]
      },
      {
        "id": "wire_33",
        "startTerminal": "comp_38_right",
        "endTerminal": "comp_35_node",
        "points": [
          {
            "x": 760,
            "y": 220
          },
          {
            "x": 760,
            "y": 220
          },
          {
            "x": 760,
            "y": 260
          },
          {
            "x": 640,
            "y": 260
          }
        ]
      },
      {
        "id": "wire_35",
        "startTerminal": "comp_28_M",
        "endTerminal": "comp_28_C",
        "points": [
          {
            "x": 260,
            "y": 95
          },
          {
            "x": 260,
            "y": 95
          },
          {
            "x": 260,
            "y": 145
          },
          {
            "x": 260,
            "y": 145
          }
        ]
      }
    ]
  };

  // src/templates/diode_rectifiers.js
  var diode_rectifiers_template = {
    expId: "devices_and_circuits-exp3",
    name: "Diode Rectifiers",
    presets: [
      {
        presetId: "half-wave",
        name: "Half-Wave Rectifier",
        description: "Single diode rectification clipping the negative half cycle.",
        circuit: {
          components: [
            { "id": "comp_29", "type": "voltage_source", "x": 200, "y": 260, "rotation": 0, "properties": { "voltage": 10, "type": "ac", "frequency": 50, "phase": 0 }, "state": {} },
            { "id": "comp_31", "type": "junction", "x": 420, "y": 180, "rotation": 0, "properties": {}, "state": {} },
            { "id": "comp_32", "type": "resistor", "x": 420, "y": 260, "rotation": 90, "properties": { "resistance": 1e3 }, "state": {} },
            { "id": "comp_34", "type": "ground", "x": 320, "y": 340, "rotation": 0, "properties": {}, "state": {} },
            { "id": "comp_35", "type": "oscilloscope", "x": 520, "y": 260, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": true, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} },
            { "id": "comp_36", "type": "diode", "x": 320, "y": 180, "rotation": 0, "properties": { "saturationCurrent": 1e-14, "emissionCoefficient": 1, "thermalVoltage": 0.02585 } },
            { "id": "comp_39", "type": "junction", "x": 420, "y": 320, "rotation": 0, "properties": {}, "state": {} },
            { "id": "comp_40", "type": "junction", "x": 440, "y": 100, "rotation": 0, "properties": {}, "state": {} },
            { "id": "comp_41", "type": "junction", "x": 440, "y": 400, "rotation": 0, "properties": {}, "state": {} }
          ],
          wires: [
            { "id": "wire_6", "startTerminal": "comp_31_node", "endTerminal": "comp_32_left", "points": [{ "x": 420, "y": 180 }, { "x": 420, "y": 180 }, { "x": 420, "y": 230 }, { "x": 420, "y": 230 }] },
            { "id": "wire_10", "startTerminal": "comp_29_negative", "endTerminal": "comp_34_ref", "points": [{ "x": 200, "y": 290 }, { "x": 200, "y": 290 }, { "x": 200, "y": 325 }, { "x": 320, "y": 325 }] },
            { "id": "wire_26", "startTerminal": "comp_36_cathode", "endTerminal": "comp_31_node", "points": [{ "x": 350, "y": 180 }, { "x": 385, "y": 180 }, { "x": 385, "y": 180 }, { "x": 420, "y": 180 }] },
            { "id": "wire_28", "startTerminal": "comp_36_anode", "endTerminal": "comp_29_positive", "points": [{ "x": 290, "y": 180 }, { "x": 200, "y": 180 }, { "x": 200, "y": 230 }, { "x": 200, "y": 230 }] },
            { "id": "wire_45", "startTerminal": "comp_39_node", "endTerminal": "comp_34_ref", "points": [{ "x": 420, "y": 320 }, { "x": 370, "y": 320 }, { "x": 370, "y": 325 }, { "x": 320, "y": 325 }] },
            { "id": "wire_47", "startTerminal": "comp_39_node", "endTerminal": "comp_32_right", "points": [{ "x": 420, "y": 320 }, { "x": 420, "y": 320 }, { "x": 420, "y": 290 }, { "x": 420, "y": 290 }] },
            { "id": "wire_51", "startTerminal": "comp_39_node", "endTerminal": "comp_35_ch1_neg", "points": [{ "x": 420, "y": 320 }, { "x": 520, "y": 320 }, { "x": 520, "y": 295 }, { "x": 520, "y": 295 }] },
            { "id": "wire_53", "startTerminal": "comp_31_node", "endTerminal": "comp_35_ch1_pos", "points": [{ "x": 420, "y": 180 }, { "x": 520, "y": 180 }, { "x": 520, "y": 225 }, { "x": 520, "y": 225 }] },
            { "id": "wire_59", "startTerminal": "comp_29_positive", "endTerminal": "comp_40_node", "points": [{ "x": 200, "y": 230 }, { "x": 200, "y": 230 }, { "x": 200, "y": 100 }, { "x": 440, "y": 100 }] },
            { "id": "wire_61", "startTerminal": "comp_40_node", "endTerminal": "comp_35_ch2_pos", "points": [{ "x": 440, "y": 100 }, { "x": 480, "y": 100 }, { "x": 480, "y": 260 }, { "x": 475, "y": 260 }] },
            { "id": "wire_63", "startTerminal": "comp_29_negative", "endTerminal": "comp_41_node", "points": [{ "x": 200, "y": 290 }, { "x": 200, "y": 290 }, { "x": 200, "y": 400 }, { "x": 440, "y": 400 }] },
            { "id": "wire_65", "startTerminal": "comp_41_node", "endTerminal": "comp_35_ch2_neg", "points": [{ "x": 440, "y": 400 }, { "x": 580, "y": 400 }, { "x": 580, "y": 260 }, { "x": 565, "y": 260 }] }
          ]
        }
      },
      {
        presetId: "full-wave-bridge",
        name: "Full-Wave Bridge Rectifier",
        description: "Four diode bridge rectifying both half cycles.",
        circuit: {
          components: [
            { "id": "vsrc", "type": "voltage_source", "x": 160, "y": 320, "rotation": 0, "properties": { "voltage": 10, "type": "ac", "frequency": 50, "phase": 0 }, "state": {} },
            { "id": "rload", "type": "resistor", "x": 650, "y": 400, "rotation": 90, "properties": { "resistance": 1e3 }, "state": {} },
            { "id": "gnd", "type": "ground", "x": 400, "y": 520, "rotation": 0, "properties": {}, "state": {} },
            { "id": "comp_1", "type": "junction", "x": 400, "y": 200, "rotation": 0, "properties": {}, "state": {} },
            { "id": "comp_2", "type": "junction", "x": 400, "y": 160, "rotation": 0, "properties": {}, "state": {} },
            { "id": "comp_4", "type": "junction", "x": 300, "y": 320, "rotation": 0, "properties": {}, "state": {} },
            { "id": "comp_5", "type": "junction", "x": 500, "y": 320, "rotation": 0, "properties": {}, "state": {} },
            { "id": "comp_6", "type": "junction", "x": 400, "y": 420, "rotation": 0, "properties": {}, "state": {} },
            { "id": "comp_7", "type": "junction", "x": 400, "y": 460, "rotation": 90, "properties": {}, "state": {} },
            { "id": "comp_8", "type": "oscilloscope", "x": 760, "y": 400, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": false, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} },
            { "id": "comp_9", "type": "junction", "x": 600, "y": 320, "rotation": 0, "properties": {}, "state": {} },
            { "id": "comp_10", "type": "junction", "x": 600, "y": 500, "rotation": 0, "properties": {}, "state": {} },
            { "id": "comp_11", "type": "diode", "x": 500, "y": 220, "rotation": 90, "properties": { "saturationCurrent": 1e-14, "emissionCoefficient": 1, "thermalVoltage": 0.02585 } },
            { "id": "comp_12", "type": "diode", "x": 500, "y": 400, "rotation": 270, "properties": { "saturationCurrent": 1e-14, "emissionCoefficient": 1, "thermalVoltage": 0.02585 } },
            { "id": "comp_14", "type": "diode", "x": 300, "y": 220, "rotation": 270, "properties": { "saturationCurrent": 1e-14, "emissionCoefficient": 1, "thermalVoltage": 0.02585 } },
            { "id": "comp_15", "type": "diode", "x": 300, "y": 400, "rotation": 90, "properties": { "saturationCurrent": 1e-14, "emissionCoefficient": 1, "thermalVoltage": 0.02585 } }
          ],
          wires: [
            { "id": "wire_10", "startTerminal": "comp_2_node", "endTerminal": "comp_1_node", "points": [{ "x": 400, "y": 160 }, { "x": 400, "y": 160 }, { "x": 400, "y": 200 }, { "x": 400, "y": 200 }] },
            { "id": "wire_12", "startTerminal": "comp_2_node", "endTerminal": "vsrc_positive", "points": [{ "x": 400, "y": 160 }, { "x": 160, "y": 160 }, { "x": 160, "y": 290 }, { "x": 160, "y": 290 }] },
            { "id": "wire_28", "startTerminal": "comp_6_node", "endTerminal": "comp_7_node", "points": [{ "x": 400, "y": 420 }, { "x": 400, "y": 420 }, { "x": 400, "y": 460 }, { "x": 400, "y": 460 }] },
            { "id": "wire_30", "startTerminal": "comp_7_node", "endTerminal": "vsrc_negative", "points": [{ "x": 400, "y": 460 }, { "x": 160, "y": 460 }, { "x": 160, "y": 350 }, { "x": 160, "y": 350 }] },
            { "id": "wire_33", "startTerminal": "comp_4_node", "endTerminal": "gnd_ref", "points": [{ "x": 300, "y": 320 }, { "x": 240, "y": 320 }, { "x": 240, "y": 505 }, { "x": 400, "y": 505 }] },
            { "id": "wire_39", "startTerminal": "comp_9_node", "endTerminal": "comp_8_ch1_pos", "points": [{ "x": 600, "y": 320 }, { "x": 760, "y": 320 }, { "x": 760, "y": 365 }, { "x": 760, "y": 365 }] },
            { "id": "wire_41", "startTerminal": "comp_9_node", "endTerminal": "rload_left", "points": [{ "x": 600, "y": 320 }, { "x": 625, "y": 320 }, { "x": 625, "y": 370 }, { "x": 650, "y": 370 }] },
            { "id": "wire_43", "startTerminal": "comp_9_node", "endTerminal": "comp_5_node", "points": [{ "x": 600, "y": 320 }, { "x": 550, "y": 320 }, { "x": 550, "y": 320 }, { "x": 500, "y": 320 }] },
            { "id": "wire_45", "startTerminal": "rload_right", "endTerminal": "comp_10_node", "points": [{ "x": 650, "y": 430 }, { "x": 625, "y": 430 }, { "x": 625, "y": 500 }, { "x": 600, "y": 500 }] },
            { "id": "wire_47", "startTerminal": "comp_10_node", "endTerminal": "comp_8_ch1_neg", "points": [{ "x": 600, "y": 500 }, { "x": 760, "y": 500 }, { "x": 760, "y": 435 }, { "x": 760, "y": 435 }] },
            { "id": "wire_49", "startTerminal": "comp_10_node", "endTerminal": "gnd_ref", "points": [{ "x": 600, "y": 500 }, { "x": 500, "y": 500 }, { "x": 500, "y": 505 }, { "x": 400, "y": 505 }] },
            { "id": "wire_51", "startTerminal": "comp_1_node", "endTerminal": "comp_11_anode", "points": [{ "x": 400, "y": 200 }, { "x": 440, "y": 200 }, { "x": 440, "y": 190 }, { "x": 500, "y": 190 }] },
            { "id": "wire_53", "startTerminal": "comp_11_cathode", "endTerminal": "comp_5_node", "points": [{ "x": 500, "y": 250 }, { "x": 500, "y": 250 }, { "x": 500, "y": 320 }, { "x": 500, "y": 320 }] },
            { "id": "wire_63", "startTerminal": "comp_14_cathode", "endTerminal": "comp_1_node", "points": [{ "x": 300, "y": 190 }, { "x": 350, "y": 190 }, { "x": 350, "y": 200 }, { "x": 400, "y": 200 }] },
            { "id": "wire_65", "startTerminal": "comp_14_anode", "endTerminal": "comp_4_node", "points": [{ "x": 300, "y": 250 }, { "x": 300, "y": 250 }, { "x": 300, "y": 320 }, { "x": 300, "y": 320 }] },
            { "id": "wire_67", "startTerminal": "comp_6_node", "endTerminal": "comp_12_anode", "points": [{ "x": 400, "y": 420 }, { "x": 450, "y": 420 }, { "x": 450, "y": 430 }, { "x": 500, "y": 430 }] },
            { "id": "wire_69", "startTerminal": "comp_12_cathode", "endTerminal": "comp_5_node", "points": [{ "x": 500, "y": 370 }, { "x": 500, "y": 370 }, { "x": 500, "y": 320 }, { "x": 500, "y": 320 }] },
            { "id": "wire_71", "startTerminal": "comp_15_cathode", "endTerminal": "comp_6_node", "points": [{ "x": 300, "y": 430 }, { "x": 350, "y": 430 }, { "x": 350, "y": 420 }, { "x": 400, "y": 420 }] },
            { "id": "wire_73", "startTerminal": "comp_15_anode", "endTerminal": "comp_4_node", "points": [{ "x": 300, "y": 370 }, { "x": 300, "y": 370 }, { "x": 300, "y": 320 }, { "x": 300, "y": 320 }] }
          ]
        }
      },
      {
        presetId: "clipper",
        name: "Clipper Circuit",
        description: "Diode clipping circuit that limits parts of an AC waveform.",
        circuit: {
          components: [
            { "id": "comp_1", "type": "voltage_source", "x": 300, "y": 320, "rotation": 0, "properties": { "voltage": 10, "type": "ac", "frequency": 50, "phase": 0 }, "state": {} },
            { "id": "comp_2", "type": "resistor", "x": 360, "y": 220, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
            { "id": "comp_3", "type": "voltage_source", "x": 460, "y": 360, "rotation": 0, "properties": { "voltage": 1.5, "type": "dc", "frequency": 50, "phase": 0 }, "state": {} },
            { "id": "comp_4", "type": "diode", "x": 460, "y": 280, "rotation": 90, "properties": { "saturationCurrent": 1e-14, "emissionCoefficient": 1, "thermalVoltage": 0.02585 } },
            { "id": "comp_5", "type": "ground", "x": 360, "y": 440, "rotation": 0, "properties": {}, "state": {} },
            { "id": "comp_6", "type": "oscilloscope", "x": 600, "y": 320, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": false, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} },
            { "id": "comp_7", "type": "junction", "x": 460, "y": 220, "rotation": 90, "properties": {}, "state": {} },
            { "id": "comp_8", "type": "junction", "x": 460, "y": 420, "rotation": 0, "properties": {}, "state": {} }
          ],
          wires: [
            { "id": "wire_3", "startTerminal": "comp_1_positive", "endTerminal": "comp_2_left", "points": [{ "x": 300, "y": 290 }, { "x": 300, "y": 290 }, { "x": 300, "y": 220 }, { "x": 330, "y": 220 }] },
            { "id": "wire_5", "startTerminal": "comp_2_right", "endTerminal": "comp_7_node", "points": [{ "x": 390, "y": 220 }, { "x": 425, "y": 220 }, { "x": 425, "y": 220 }, { "x": 460, "y": 220 }] },
            { "id": "wire_7", "startTerminal": "comp_7_node", "endTerminal": "comp_6_ch1_pos", "points": [{ "x": 460, "y": 220 }, { "x": 600, "y": 220 }, { "x": 600, "y": 285 }, { "x": 600, "y": 285 }] },
            { "id": "wire_9", "startTerminal": "comp_7_node", "endTerminal": "comp_4_anode", "points": [{ "x": 460, "y": 220 }, { "x": 460, "y": 220 }, { "x": 460, "y": 250 }, { "x": 460, "y": 250 }] },
            { "id": "wire_11", "startTerminal": "comp_3_positive", "endTerminal": "comp_4_cathode", "points": [{ "x": 460, "y": 330 }, { "x": 460, "y": 330 }, { "x": 460, "y": 310 }, { "x": 460, "y": 310 }] },
            { "id": "wire_13", "startTerminal": "comp_1_negative", "endTerminal": "comp_5_ref", "points": [{ "x": 300, "y": 350 }, { "x": 300, "y": 350 }, { "x": 300, "y": 425 }, { "x": 360, "y": 425 }] },
            { "id": "wire_16", "startTerminal": "comp_8_node", "endTerminal": "comp_5_ref", "points": [{ "x": 460, "y": 420 }, { "x": 460, "y": 420 }, { "x": 460, "y": 425 }, { "x": 360, "y": 425 }] },
            { "id": "wire_18", "startTerminal": "comp_8_node", "endTerminal": "comp_3_negative", "points": [{ "x": 460, "y": 420 }, { "x": 460, "y": 420 }, { "x": 460, "y": 390 }, { "x": 460, "y": 390 }] },
            { "id": "wire_20", "startTerminal": "comp_8_node", "endTerminal": "comp_6_ch1_neg", "points": [{ "x": 460, "y": 420 }, { "x": 600, "y": 420 }, { "x": 600, "y": 355 }, { "x": 600, "y": 355 }] }
          ]
        }
      }
    ]
  };

  // src/templates/opamp_arithmetics.js
  var summer_preset = {
    presetId: "summer",
    name: "Summer",
    description: "Op-Amp configured as a summing amplifier.",
    circuit: {
      components: [
        { "id": "comp_1", "type": "voltage_source", "x": 240, "y": 240, "rotation": 0, "properties": { "voltage": 5, "type": "dc", "frequency": 50, "phase": 0 }, "state": {} },
        { "id": "comp_2", "type": "resistor", "x": 380, "y": 160, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_3", "type": "voltage_source", "x": 300, "y": 280, "rotation": 0, "properties": { "voltage": 1, "type": "dc", "frequency": 50, "phase": 0 }, "state": {} },
        { "id": "comp_4", "type": "resistor", "x": 380, "y": 220, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_5", "type": "junction", "x": 460, "y": 180, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_6", "type": "opamp", "x": 540, "y": 180, "rotation": 0, "properties": { "openLoopGain": 1e5, "gbp": 1e6, "rin": 2e6, "rout": 75, "offsetVoltage": 0, "cmrr": 90 }, "state": {} },
        { "id": "comp_7", "type": "resistor", "x": 540, "y": 100, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_8", "type": "junction", "x": 620, "y": 180, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_9", "type": "ground", "x": 400, "y": 360, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_10", "type": "junction", "x": 300, "y": 340, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_11", "type": "oscilloscope", "x": 600, "y": 260, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": false, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} }
      ],
      wires: [
        { "id": "wire_2", "startTerminal": "comp_3_positive", "endTerminal": "comp_4_left", "points": [{ "x": 300, "y": 250 }, { "x": 300, "y": 250 }, { "x": 300, "y": 220 }, { "x": 350, "y": 220 }] },
        { "id": "wire_4", "startTerminal": "comp_1_positive", "endTerminal": "comp_2_left", "points": [{ "x": 240, "y": 210 }, { "x": 240, "y": 210 }, { "x": 240, "y": 160 }, { "x": 350, "y": 160 }] },
        { "id": "wire_6", "startTerminal": "comp_2_right", "endTerminal": "comp_5_node", "points": [{ "x": 410, "y": 160 }, { "x": 435, "y": 160 }, { "x": 435, "y": 180 }, { "x": 460, "y": 180 }] },
        { "id": "wire_8", "startTerminal": "comp_4_right", "endTerminal": "comp_5_node", "points": [{ "x": 410, "y": 220 }, { "x": 435, "y": 220 }, { "x": 435, "y": 180 }, { "x": 460, "y": 180 }] },
        { "id": "wire_11", "startTerminal": "comp_5_node", "endTerminal": "comp_6_in_neg", "points": [{ "x": 460, "y": 180 }, { "x": 460, "y": 180 }, { "x": 460, "y": 165 }, { "x": 510, "y": 165 }] },
        { "id": "wire_13", "startTerminal": "comp_5_node", "endTerminal": "comp_7_left", "points": [{ "x": 460, "y": 180 }, { "x": 460, "y": 180 }, { "x": 460, "y": 100 }, { "x": 510, "y": 100 }] },
        { "id": "wire_16", "startTerminal": "comp_7_right", "endTerminal": "comp_8_node", "points": [{ "x": 570, "y": 100 }, { "x": 620, "y": 100 }, { "x": 620, "y": 180 }, { "x": 620, "y": 180 }] },
        { "id": "wire_18", "startTerminal": "comp_6_out", "endTerminal": "comp_8_node", "points": [{ "x": 570, "y": 180 }, { "x": 595, "y": 180 }, { "x": 595, "y": 180 }, { "x": 620, "y": 180 }] },
        { "id": "wire_20", "startTerminal": "comp_3_negative", "endTerminal": "comp_10_node", "points": [{ "x": 300, "y": 310 }, { "x": 300, "y": 310 }, { "x": 300, "y": 340 }, { "x": 300, "y": 340 }] },
        { "id": "wire_23", "startTerminal": "comp_10_node", "endTerminal": "comp_9_ref", "points": [{ "x": 300, "y": 340 }, { "x": 350, "y": 340 }, { "x": 350, "y": 345 }, { "x": 400, "y": 345 }] },
        { "id": "wire_25", "startTerminal": "comp_10_node", "endTerminal": "comp_1_negative", "points": [{ "x": 300, "y": 340 }, { "x": 240, "y": 340 }, { "x": 240, "y": 270 }, { "x": 240, "y": 270 }] },
        { "id": "wire_27", "startTerminal": "comp_6_in_pos", "endTerminal": "comp_9_ref", "points": [{ "x": 510, "y": 195 }, { "x": 460, "y": 195 }, { "x": 460, "y": 345 }, { "x": 400, "y": 345 }] },
        { "id": "wire_29", "startTerminal": "comp_11_ch1_pos", "endTerminal": "comp_8_node", "points": [{ "x": 600, "y": 225 }, { "x": 620, "y": 225 }, { "x": 620, "y": 180 }, { "x": 620, "y": 180 }] },
        { "id": "wire_31", "startTerminal": "comp_11_ch1_neg", "endTerminal": "comp_9_ref", "points": [{ "x": 600, "y": 295 }, { "x": 500, "y": 295 }, { "x": 500, "y": 345 }, { "x": 400, "y": 345 }] }
      ]
    }
  };
  var subtractor_preset = {
    presetId: "subtractor",
    name: "Subtractor",
    description: "Op-Amp configured as a difference amplifier (subtractor).",
    circuit: {
      components: [
        { "id": "comp_31", "type": "voltage_source", "x": 240, "y": 260, "rotation": 0, "properties": { "voltage": 25, "type": "dc", "frequency": 50, "phase": 0 }, "state": {} },
        { "id": "comp_32", "type": "voltage_source", "x": 280, "y": 260, "rotation": 0, "properties": { "voltage": 5, "type": "dc", "frequency": 50, "phase": 0 }, "state": {} },
        { "id": "comp_33", "type": "opamp", "x": 480, "y": 180, "rotation": 0, "properties": { "openLoopGain": 1e5, "gbp": 1e6, "rin": 2e6, "rout": 75, "offsetVoltage": 0, "cmrr": 90 }, "state": {} },
        { "id": "comp_34", "type": "junction", "x": 400, "y": 160, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_35", "type": "junction", "x": 400, "y": 200, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_36", "type": "resistor", "x": 340, "y": 200, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_37", "type": "resistor", "x": 340, "y": 160, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_38", "type": "ground", "x": 400, "y": 340, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_39", "type": "resistor", "x": 400, "y": 260, "rotation": 90, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_40", "type": "resistor", "x": 480, "y": 100, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_41", "type": "junction", "x": 560, "y": 180, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_42", "type": "oscilloscope", "x": 560, "y": 260, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": false, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} }
      ],
      wires: [
        { "id": "wire_4", "startTerminal": "comp_36_right", "endTerminal": "comp_35_node", "points": [{ "x": 370, "y": 200 }, { "x": 385, "y": 200 }, { "x": 385, "y": 200 }, { "x": 400, "y": 200 }] },
        { "id": "wire_6", "startTerminal": "comp_36_left", "endTerminal": "comp_32_positive", "points": [{ "x": 310, "y": 200 }, { "x": 280, "y": 200 }, { "x": 280, "y": 230 }, { "x": 280, "y": 230 }] },
        { "id": "wire_8", "startTerminal": "comp_37_right", "endTerminal": "comp_34_node", "points": [{ "x": 370, "y": 160 }, { "x": 385, "y": 160 }, { "x": 385, "y": 160 }, { "x": 400, "y": 160 }] },
        { "id": "wire_10", "startTerminal": "comp_31_positive", "endTerminal": "comp_37_left", "points": [{ "x": 240, "y": 230 }, { "x": 240, "y": 230 }, { "x": 240, "y": 160 }, { "x": 310, "y": 160 }] },
        { "id": "wire_12", "startTerminal": "comp_32_negative", "endTerminal": "comp_38_ref", "points": [{ "x": 280, "y": 290 }, { "x": 280, "y": 290 }, { "x": 280, "y": 325 }, { "x": 400, "y": 325 }] },
        { "id": "wire_14", "startTerminal": "comp_31_negative", "endTerminal": "comp_38_ref", "points": [{ "x": 240, "y": 290 }, { "x": 240, "y": 290 }, { "x": 240, "y": 345 }, { "x": 400, "y": 345 }] },
        { "id": "wire_16", "startTerminal": "comp_39_left", "endTerminal": "comp_35_node", "points": [{ "x": 400, "y": 230 }, { "x": 400, "y": 230 }, { "x": 400, "y": 200 }, { "x": 400, "y": 200 }] },
        { "id": "wire_18", "startTerminal": "comp_39_right", "endTerminal": "comp_38_ref", "points": [{ "x": 400, "y": 290 }, { "x": 400, "y": 290 }, { "x": 400, "y": 325 }, { "x": 400, "y": 325 }] },
        { "id": "wire_20", "startTerminal": "comp_35_node", "endTerminal": "comp_33_in_pos", "points": [{ "x": 400, "y": 200 }, { "x": 425, "y": 200 }, { "x": 425, "y": 195 }, { "x": 450, "y": 195 }] },
        { "id": "wire_22", "startTerminal": "comp_34_node", "endTerminal": "comp_33_in_neg", "points": [{ "x": 400, "y": 160 }, { "x": 425, "y": 160 }, { "x": 425, "y": 165 }, { "x": 450, "y": 165 }] },
        { "id": "wire_24", "startTerminal": "comp_34_node", "endTerminal": "comp_40_left", "points": [{ "x": 400, "y": 160 }, { "x": 400, "y": 160 }, { "x": 400, "y": 100 }, { "x": 450, "y": 100 }] },
        { "id": "wire_26", "startTerminal": "comp_33_out", "endTerminal": "comp_41_node", "points": [{ "x": 510, "y": 180 }, { "x": 535, "y": 180 }, { "x": 535, "y": 180 }, { "x": 560, "y": 180 }] },
        { "id": "wire_28", "startTerminal": "comp_41_node", "endTerminal": "comp_40_right", "points": [{ "x": 560, "y": 180 }, { "x": 560, "y": 180 }, { "x": 560, "y": 100 }, { "x": 510, "y": 100 }] },
        { "id": "wire_30", "startTerminal": "comp_42_ch1_pos", "endTerminal": "comp_41_node", "points": [{ "x": 560, "y": 225 }, { "x": 560, "y": 225 }, { "x": 560, "y": 180 }, { "x": 560, "y": 180 }] },
        { "id": "wire_32", "startTerminal": "comp_42_ch1_neg", "endTerminal": "comp_38_ref", "points": [{ "x": 560, "y": 295 }, { "x": 560, "y": 295 }, { "x": 560, "y": 325 }, { "x": 400, "y": 325 }] }
      ]
    }
  };
  var integrator_preset = {
    presetId: "integrator",
    name: "Integrator",
    description: "Op-Amp configured to perform mathematical integration.",
    circuit: {
      components: [
        { "id": "comp_1", "type": "voltage_source", "x": 240, "y": 260, "rotation": 0, "properties": { "voltage": 10, "type": "ac", "frequency": 50, "phase": 0 }, "state": {} },
        { "id": "comp_2", "type": "resistor", "x": 300, "y": 200, "rotation": 0, "properties": { "resistance": 1e4 }, "state": {} },
        { "id": "comp_3", "type": "opamp", "x": 460, "y": 220, "rotation": 0, "properties": { "openLoopGain": 1e5, "gbp": 1e6, "rin": 2e6, "rout": 75, "offsetVoltage": 0, "cmrr": 90 }, "state": {} },
        { "id": "comp_4", "type": "junction", "x": 380, "y": 200, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_5", "type": "junction", "x": 380, "y": 160, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_6", "type": "junction", "x": 540, "y": 160, "rotation": 90, "properties": {}, "state": {} },
        { "id": "comp_7", "type": "junction", "x": 540, "y": 220, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_8", "type": "capacitor", "x": 460, "y": 160, "rotation": 0, "properties": { "capacitance": 1e-7 }, "state": { "voltage": 0, "current": 0 } },
        { "id": "comp_9", "type": "ground", "x": 360, "y": 340, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_11", "type": "oscilloscope", "x": 140, "y": 100, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": true, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} }
      ],
      wires: [
        { "id": "wire_2", "startTerminal": "comp_2_right", "endTerminal": "comp_4_node", "points": [{ "x": 330, "y": 200 }, { "x": 355, "y": 200 }, { "x": 355, "y": 200 }, { "x": 380, "y": 200 }] },
        { "id": "wire_4", "startTerminal": "comp_2_left", "endTerminal": "comp_1_positive", "points": [{ "x": 270, "y": 200 }, { "x": 240, "y": 200 }, { "x": 240, "y": 230 }, { "x": 240, "y": 230 }] },
        { "id": "wire_6", "startTerminal": "comp_4_node", "endTerminal": "comp_3_in_neg", "points": [{ "x": 380, "y": 200 }, { "x": 405, "y": 200 }, { "x": 405, "y": 205 }, { "x": 430, "y": 205 }] },
        { "id": "wire_8", "startTerminal": "comp_4_node", "endTerminal": "comp_5_node", "points": [{ "x": 380, "y": 200 }, { "x": 380, "y": 200 }, { "x": 380, "y": 160 }, { "x": 380, "y": 160 }] },
        { "id": "wire_10", "startTerminal": "comp_5_node", "endTerminal": "comp_8_left", "points": [{ "x": 380, "y": 160 }, { "x": 405, "y": 160 }, { "x": 405, "y": 160 }, { "x": 430, "y": 160 }] },
        { "id": "wire_13", "startTerminal": "comp_8_right", "endTerminal": "comp_6_node", "points": [{ "x": 490, "y": 160 }, { "x": 515, "y": 160 }, { "x": 515, "y": 160 }, { "x": 540, "y": 160 }] },
        { "id": "wire_15", "startTerminal": "comp_6_node", "endTerminal": "comp_7_node", "points": [{ "x": 540, "y": 160 }, { "x": 540, "y": 160 }, { "x": 540, "y": 220 }, { "x": 540, "y": 220 }] },
        { "id": "wire_17", "startTerminal": "comp_3_out", "endTerminal": "comp_7_node", "points": [{ "x": 490, "y": 220 }, { "x": 515, "y": 220 }, { "x": 515, "y": 220 }, { "x": 540, "y": 220 }] },
        { "id": "wire_19", "startTerminal": "comp_1_negative", "endTerminal": "comp_9_ref", "points": [{ "x": 240, "y": 290 }, { "x": 240, "y": 290 }, { "x": 240, "y": 325 }, { "x": 360, "y": 325 }] },
        { "id": "wire_21", "startTerminal": "comp_9_ref", "endTerminal": "comp_3_in_pos", "points": [{ "x": 360, "y": 325 }, { "x": 395, "y": 325 }, { "x": 395, "y": 235 }, { "x": 430, "y": 235 }] },
        { "id": "wire_31", "startTerminal": "comp_7_node", "endTerminal": "comp_11_ch1_pos", "points": [{ "x": 540, "y": 220 }, { "x": 600, "y": 220 }, { "x": 600, "y": 65 }, { "x": 140, "y": 65 }] },
        { "id": "wire_33", "startTerminal": "comp_11_ch1_neg", "endTerminal": "comp_9_ref", "points": [{ "x": 140, "y": 135 }, { "x": 140, "y": 135 }, { "x": 140, "y": 325 }, { "x": 360, "y": 325 }] },
        { "id": "wire_35", "startTerminal": "comp_1_positive", "endTerminal": "comp_11_ch2_pos", "points": [{ "x": 240, "y": 230 }, { "x": 100, "y": 230 }, { "x": 100, "y": 100 }, { "x": 95, "y": 100 }] },
        { "id": "wire_37", "startTerminal": "comp_1_negative", "endTerminal": "comp_11_ch2_neg", "points": [{ "x": 240, "y": 290 }, { "x": 200, "y": 290 }, { "x": 200, "y": 100 }, { "x": 185, "y": 100 }] }
      ]
    }
  };
  var differentiator_preset = {
    presetId: "differentiator",
    name: "Differentiator",
    description: "Op-Amp configured to perform mathematical differentiation.",
    circuit: {
      components: [
        { "id": "comp_1", "type": "voltage_source", "x": 240, "y": 260, "rotation": 0, "properties": { "voltage": 10, "type": "ac", "frequency": 50, "phase": 90 }, "state": {} },
        { "id": "comp_2", "type": "resistor", "x": 300, "y": 200, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_3", "type": "capacitor", "x": 420, "y": 200, "rotation": 0, "properties": { "capacitance": 1e-6 }, "state": { "voltage": 0, "current": 0 } },
        { "id": "comp_4", "type": "junction", "x": 500, "y": 200, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_5", "type": "opamp", "x": 580, "y": 220, "rotation": 0, "properties": { "openLoopGain": 1e5, "gbp": 1e6, "rin": 2e6, "rout": 75, "offsetVoltage": 0, "cmrr": 90 }, "state": {} },
        { "id": "comp_6", "type": "ground", "x": 420, "y": 360, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_7", "type": "resistor", "x": 580, "y": 140, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_8", "type": "junction", "x": 680, "y": 220, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_9", "type": "oscilloscope", "x": 160, "y": 100, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": true, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} }
      ],
      wires: [
        { "id": "wire_2", "startTerminal": "comp_1_positive", "endTerminal": "comp_2_left", "points": [{ "x": 240, "y": 230 }, { "x": 240, "y": 230 }, { "x": 240, "y": 200 }, { "x": 270, "y": 200 }] },
        { "id": "wire_4", "startTerminal": "comp_2_right", "endTerminal": "comp_3_left", "points": [{ "x": 330, "y": 200 }, { "x": 360, "y": 200 }, { "x": 360, "y": 200 }, { "x": 390, "y": 200 }] },
        { "id": "wire_6", "startTerminal": "comp_4_node", "endTerminal": "comp_5_in_neg", "points": [{ "x": 500, "y": 200 }, { "x": 525, "y": 200 }, { "x": 525, "y": 205 }, { "x": 550, "y": 205 }] },
        { "id": "wire_8", "startTerminal": "comp_4_node", "endTerminal": "comp_3_right", "points": [{ "x": 500, "y": 200 }, { "x": 475, "y": 200 }, { "x": 475, "y": 200 }, { "x": 450, "y": 200 }] },
        { "id": "wire_10", "startTerminal": "comp_1_negative", "endTerminal": "comp_6_ref", "points": [{ "x": 240, "y": 290 }, { "x": 240, "y": 290 }, { "x": 240, "y": 345 }, { "x": 420, "y": 345 }] },
        { "id": "wire_12", "startTerminal": "comp_6_ref", "endTerminal": "comp_5_in_pos", "points": [{ "x": 420, "y": 345 }, { "x": 485, "y": 345 }, { "x": 485, "y": 235 }, { "x": 550, "y": 235 }] },
        { "id": "wire_14", "startTerminal": "comp_4_node", "endTerminal": "comp_7_left", "points": [{ "x": 500, "y": 200 }, { "x": 500, "y": 200 }, { "x": 500, "y": 140 }, { "x": 550, "y": 140 }] },
        { "id": "wire_16", "startTerminal": "comp_7_right", "endTerminal": "comp_8_node", "points": [{ "x": 610, "y": 140 }, { "x": 680, "y": 140 }, { "x": 680, "y": 220 }, { "x": 680, "y": 220 }] },
        { "id": "wire_18", "startTerminal": "comp_8_node", "endTerminal": "comp_5_out", "points": [{ "x": 680, "y": 220 }, { "x": 645, "y": 220 }, { "x": 645, "y": 220 }, { "x": 610, "y": 220 }] },
        { "id": "wire_21", "startTerminal": "comp_9_ch1_neg", "endTerminal": "comp_6_ref", "points": [{ "x": 160, "y": 135 }, { "x": 160, "y": 135 }, { "x": 160, "y": 345 }, { "x": 420, "y": 345 }] },
        { "id": "wire_23", "startTerminal": "comp_9_ch1_pos", "endTerminal": "comp_8_node", "points": [{ "x": 160, "y": 65 }, { "x": 740, "y": 65 }, { "x": 740, "y": 220 }, { "x": 680, "y": 220 }] },
        { "id": "wire_25", "startTerminal": "comp_9_ch2_pos", "endTerminal": "comp_1_positive", "points": [{ "x": 115, "y": 100 }, { "x": 80, "y": 100 }, { "x": 80, "y": 230 }, { "x": 240, "y": 230 }] },
        { "id": "wire_27", "startTerminal": "comp_9_ch2_neg", "endTerminal": "comp_1_negative", "points": [{ "x": 205, "y": 100 }, { "x": 220, "y": 100 }, { "x": 220, "y": 290 }, { "x": 240, "y": 290 }] }
      ]
    }
  };
  var log_preset = {
    presetId: "log",
    name: "Log Amplifier",
    description: "Op-Amp configured as a logarithmic amplifier.",
    circuit: {
      components: [
        { "id": "comp_1", "type": "voltage_source", "x": 220, "y": 300, "rotation": 0, "properties": { "voltage": 9, "type": "dc", "frequency": 50, "phase": 0 }, "state": {} },
        { "id": "comp_2", "type": "resistor", "x": 280, "y": 220, "rotation": 0, "properties": { "resistance": 1e5 }, "state": {} },
        { "id": "comp_3", "type": "opamp", "x": 440, "y": 240, "rotation": 0, "properties": { "openLoopGain": 1e5, "gbp": 1e6, "rin": 2e6, "rout": 75, "offsetVoltage": 0, "cmrr": 90 }, "state": {} },
        { "id": "comp_4", "type": "junction", "x": 360, "y": 220, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_5", "type": "ground", "x": 340, "y": 380, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_6", "type": "diode", "x": 440, "y": 160, "rotation": 0, "properties": { "saturationCurrent": 1e-14, "emissionCoefficient": 1, "thermalVoltage": 0.02585 } },
        { "id": "comp_7", "type": "junction", "x": 520, "y": 240, "rotation": 90, "properties": {}, "state": {} },
        { "id": "comp_8", "type": "oscilloscope", "x": 520, "y": 300, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": false, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} }
      ],
      wires: [
        { "id": "wire_2", "startTerminal": "comp_2_right", "endTerminal": "comp_4_node", "points": [{ "x": 310, "y": 220 }, { "x": 335, "y": 220 }, { "x": 335, "y": 220 }, { "x": 360, "y": 220 }] },
        { "id": "wire_4", "startTerminal": "comp_4_node", "endTerminal": "comp_3_in_neg", "points": [{ "x": 360, "y": 220 }, { "x": 385, "y": 220 }, { "x": 385, "y": 225 }, { "x": 410, "y": 225 }] },
        { "id": "wire_6", "startTerminal": "comp_2_left", "endTerminal": "comp_1_positive", "points": [{ "x": 250, "y": 220 }, { "x": 220, "y": 220 }, { "x": 220, "y": 270 }, { "x": 220, "y": 270 }] },
        { "id": "wire_8", "startTerminal": "comp_1_negative", "endTerminal": "comp_5_ref", "points": [{ "x": 220, "y": 330 }, { "x": 220, "y": 330 }, { "x": 220, "y": 365 }, { "x": 340, "y": 365 }] },
        { "id": "wire_10", "startTerminal": "comp_5_ref", "endTerminal": "comp_3_in_pos", "points": [{ "x": 340, "y": 365 }, { "x": 375, "y": 365 }, { "x": 375, "y": 255 }, { "x": 410, "y": 255 }] },
        { "id": "wire_12", "startTerminal": "comp_4_node", "endTerminal": "comp_6_anode", "points": [{ "x": 360, "y": 220 }, { "x": 360, "y": 220 }, { "x": 360, "y": 160 }, { "x": 410, "y": 160 }] },
        { "id": "wire_14", "startTerminal": "comp_7_node", "endTerminal": "comp_3_out", "points": [{ "x": 520, "y": 240 }, { "x": 495, "y": 240 }, { "x": 495, "y": 240 }, { "x": 470, "y": 240 }] },
        { "id": "wire_16", "startTerminal": "comp_7_node", "endTerminal": "comp_6_cathode", "points": [{ "x": 520, "y": 240 }, { "x": 520, "y": 240 }, { "x": 520, "y": 160 }, { "x": 470, "y": 160 }] },
        { "id": "wire_18", "startTerminal": "comp_8_ch1_pos", "endTerminal": "comp_7_node", "points": [{ "x": 520, "y": 265 }, { "x": 520, "y": 265 }, { "x": 520, "y": 240 }, { "x": 520, "y": 240 }] },
        { "id": "wire_20", "startTerminal": "comp_5_ref", "endTerminal": "comp_8_ch1_neg", "points": [{ "x": 340, "y": 365 }, { "x": 520, "y": 365 }, { "x": 520, "y": 335 }, { "x": 520, "y": 335 }] }
      ]
    }
  };
  var antilog_preset = {
    presetId: "antilog",
    name: "Antilog Amplifier",
    description: "Op-Amp configured as an antilogarithmic (exponential) amplifier.",
    circuit: {
      components: [
        { "id": "comp_1", "type": "voltage_source", "x": 220, "y": 300, "rotation": 0, "properties": { "voltage": 9, "type": "dc", "frequency": 50, "phase": 0 }, "state": {} },
        { "id": "comp_2", "type": "resistor", "x": 440, "y": 160, "rotation": 0, "properties": { "resistance": 1e5 }, "state": {} },
        { "id": "comp_3", "type": "opamp", "x": 440, "y": 240, "rotation": 0, "properties": { "openLoopGain": 1e5, "gbp": 1e6, "rin": 2e6, "rout": 75, "offsetVoltage": 0, "cmrr": 90 }, "state": {} },
        { "id": "comp_4", "type": "junction", "x": 360, "y": 220, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_5", "type": "ground", "x": 340, "y": 380, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_6", "type": "diode", "x": 280, "y": 220, "rotation": 0, "properties": { "saturationCurrent": 1e-14, "emissionCoefficient": 1, "thermalVoltage": 0.02585 } },
        { "id": "comp_7", "type": "junction", "x": 520, "y": 240, "rotation": 90, "properties": {}, "state": {} },
        { "id": "comp_8", "type": "oscilloscope", "x": 520, "y": 300, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": false, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} }
      ],
      wires: [
        { "id": "wire_4", "startTerminal": "comp_4_node", "endTerminal": "comp_3_in_neg", "points": [{ "x": 360, "y": 220 }, { "x": 385, "y": 220 }, { "x": 385, "y": 225 }, { "x": 410, "y": 225 }] },
        { "id": "wire_8", "startTerminal": "comp_1_negative", "endTerminal": "comp_5_ref", "points": [{ "x": 220, "y": 330 }, { "x": 220, "y": 330 }, { "x": 220, "y": 365 }, { "x": 340, "y": 365 }] },
        { "id": "wire_10", "startTerminal": "comp_5_ref", "endTerminal": "comp_3_in_pos", "points": [{ "x": 340, "y": 365 }, { "x": 375, "y": 365 }, { "x": 375, "y": 255 }, { "x": 410, "y": 255 }] },
        { "id": "wire_14", "startTerminal": "comp_7_node", "endTerminal": "comp_3_out", "points": [{ "x": 520, "y": 240 }, { "x": 495, "y": 240 }, { "x": 495, "y": 240 }, { "x": 470, "y": 240 }] },
        { "id": "wire_18", "startTerminal": "comp_8_ch1_pos", "endTerminal": "comp_7_node", "points": [{ "x": 520, "y": 265 }, { "x": 520, "y": 265 }, { "x": 520, "y": 240 }, { "x": 520, "y": 240 }] },
        { "id": "wire_20", "startTerminal": "comp_5_ref", "endTerminal": "comp_8_ch1_neg", "points": [{ "x": 340, "y": 365 }, { "x": 520, "y": 365 }, { "x": 520, "y": 335 }, { "x": 520, "y": 335 }] },
        { "id": "wire_22", "startTerminal": "comp_4_node", "endTerminal": "comp_2_left", "points": [{ "x": 360, "y": 220 }, { "x": 360, "y": 220 }, { "x": 360, "y": 160 }, { "x": 410, "y": 160 }] },
        { "id": "wire_24", "startTerminal": "comp_2_right", "endTerminal": "comp_7_node", "points": [{ "x": 470, "y": 160 }, { "x": 520, "y": 160 }, { "x": 520, "y": 240 }, { "x": 520, "y": 240 }] },
        { "id": "wire_26", "startTerminal": "comp_6_cathode", "endTerminal": "comp_4_node", "points": [{ "x": 310, "y": 220 }, { "x": 335, "y": 220 }, { "x": 335, "y": 220 }, { "x": 360, "y": 220 }] },
        { "id": "wire_28", "startTerminal": "comp_6_anode", "endTerminal": "comp_1_positive", "points": [{ "x": 250, "y": 220 }, { "x": 220, "y": 220 }, { "x": 220, "y": 270 }, { "x": 220, "y": 270 }] }
      ]
    }
  };
  var opamp_arithmetics_template = {
    expId: "devices_and_circuits-exp4",
    name: "OpAmp Arithmetics",
    presets: [
      summer_preset,
      subtractor_preset,
      integrator_preset,
      differentiator_preset,
      log_preset,
      antilog_preset
    ]
  };

  // src/templates/opamp_characteristics.js
  var inverting_preset = {
    presetId: "inverting",
    name: "Inverting Amplifier",
    description: "Op-Amp configured as an inverting amplifier.",
    circuit: {
      components: [
        { "id": "comp_1", "type": "voltage_source", "x": 340, "y": 280, "rotation": 0, "properties": { "voltage": 10, "type": "ac", "frequency": 50, "phase": 0 }, "state": {} },
        { "id": "comp_3", "type": "resistor", "x": 400, "y": 200, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_5", "type": "junction", "x": 480, "y": 200, "rotation": 90, "properties": {}, "state": {} },
        { "id": "comp_6", "type": "opamp", "x": 560, "y": 220, "rotation": 0, "properties": { "openLoopGain": 1e5, "gbp": 1e6, "rin": 2e6, "rout": 75, "offsetVoltage": 0, "cmrr": 90, "saturationVoltage": 15 }, "state": {} },
        { "id": "comp_7", "type": "resistor", "x": 560, "y": 140, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_8", "type": "oscilloscope", "x": 240, "y": 160, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": true, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} },
        { "id": "comp_9", "type": "ground", "x": 460, "y": 380, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_10", "type": "junction", "x": 640, "y": 220, "rotation": 90, "properties": {}, "state": {} },
        { "id": "comp_11", "type": "junction", "x": 240, "y": 60, "rotation": 90, "properties": {}, "state": {} }
      ],
      wires: [
        { "id": "wire_2", "startTerminal": "comp_9_ref", "endTerminal": "comp_1_negative", "points": [{ "x": 460, "y": 365 }, { "x": 340, "y": 365 }, { "x": 340, "y": 310 }, { "x": 340, "y": 310 }] },
        { "id": "wire_4", "startTerminal": "comp_9_ref", "endTerminal": "comp_8_ch1_neg", "points": [{ "x": 460, "y": 365 }, { "x": 240, "y": 365 }, { "x": 240, "y": 195 }, { "x": 240, "y": 195 }] },
        { "id": "wire_6", "startTerminal": "comp_1_negative", "endTerminal": "comp_8_ch2_neg", "points": [{ "x": 340, "y": 310 }, { "x": 300, "y": 310 }, { "x": 300, "y": 160 }, { "x": 285, "y": 160 }] },
        { "id": "wire_8", "startTerminal": "comp_1_positive", "endTerminal": "comp_3_left", "points": [{ "x": 340, "y": 250 }, { "x": 340, "y": 250 }, { "x": 340, "y": 200 }, { "x": 370, "y": 200 }] },
        { "id": "wire_10", "startTerminal": "comp_3_right", "endTerminal": "comp_5_node", "points": [{ "x": 430, "y": 200 }, { "x": 455, "y": 200 }, { "x": 455, "y": 200 }, { "x": 480, "y": 200 }] },
        { "id": "wire_12", "startTerminal": "comp_5_node", "endTerminal": "comp_7_left", "points": [{ "x": 480, "y": 200 }, { "x": 480, "y": 200 }, { "x": 480, "y": 140 }, { "x": 530, "y": 140 }] },
        { "id": "wire_14", "startTerminal": "comp_5_node", "endTerminal": "comp_6_in_neg", "points": [{ "x": 480, "y": 200 }, { "x": 505, "y": 200 }, { "x": 505, "y": 205 }, { "x": 530, "y": 205 }] },
        { "id": "wire_16", "startTerminal": "comp_6_in_pos", "endTerminal": "comp_9_ref", "points": [{ "x": 530, "y": 235 }, { "x": 495, "y": 235 }, { "x": 495, "y": 365 }, { "x": 460, "y": 365 }] },
        { "id": "wire_18", "startTerminal": "comp_6_out", "endTerminal": "comp_10_node", "points": [{ "x": 590, "y": 220 }, { "x": 615, "y": 220 }, { "x": 615, "y": 220 }, { "x": 640, "y": 220 }] },
        { "id": "wire_20", "startTerminal": "comp_10_node", "endTerminal": "comp_7_right", "points": [{ "x": 640, "y": 220 }, { "x": 640, "y": 220 }, { "x": 640, "y": 140 }, { "x": 590, "y": 140 }] },
        { "id": "wire_22", "startTerminal": "comp_8_ch1_pos", "endTerminal": "comp_11_node", "points": [{ "x": 240, "y": 125 }, { "x": 240, "y": 125 }, { "x": 240, "y": 60 }, { "x": 240, "y": 60 }] },
        { "id": "wire_24", "startTerminal": "comp_11_node", "endTerminal": "comp_10_node", "points": [{ "x": 240, "y": 60 }, { "x": 640, "y": 60 }, { "x": 640, "y": 220 }, { "x": 640, "y": 220 }] },
        { "id": "wire_26", "startTerminal": "comp_8_ch2_pos", "endTerminal": "comp_1_positive", "points": [{ "x": 195, "y": 160 }, { "x": 180, "y": 160 }, { "x": 180, "y": 250 }, { "x": 340, "y": 250 }] }
      ]
    },
    simulation: {
      route: "default",
      simulationId: "inverting_sim",
      simulationType: "Time"
    }
  };
  var non_inverting_preset = {
    presetId: "non_inverting",
    name: "Non-Inverting Amplifier",
    description: "Op-Amp configured as a non-inverting amplifier.",
    circuit: {
      components: [
        { "id": "comp_2", "type": "resistor", "x": 620, "y": 160, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_3", "type": "resistor", "x": 460, "y": 220, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_4", "type": "junction", "x": 540, "y": 220, "rotation": 90, "properties": {}, "state": {} },
        { "id": "comp_5", "type": "opamp", "x": 620, "y": 240, "rotation": 0, "properties": { "openLoopGain": 1e5, "gbp": 1e6, "rin": 2e6, "rout": 75, "offsetVoltage": 0, "cmrr": 90, "saturationVoltage": 15 }, "state": {} },
        { "id": "comp_6", "type": "junction", "x": 700, "y": 240, "rotation": 90, "properties": {}, "state": {} },
        { "id": "comp_7", "type": "voltage_source", "x": 540, "y": 340, "rotation": 0, "properties": { "voltage": 10, "type": "ac", "frequency": 50, "phase": 0 }, "state": {} },
        { "id": "comp_8", "type": "ground", "x": 460, "y": 420, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_9", "type": "oscilloscope", "x": 760, "y": 340, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": true, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} }
      ],
      wires: [
        { "id": "wire_2", "startTerminal": "comp_3_right", "endTerminal": "comp_4_node", "points": [{ "x": 490, "y": 220 }, { "x": 515, "y": 220 }, { "x": 515, "y": 220 }, { "x": 540, "y": 220 }] },
        { "id": "wire_4", "startTerminal": "comp_4_node", "endTerminal": "comp_2_left", "points": [{ "x": 540, "y": 220 }, { "x": 540, "y": 220 }, { "x": 540, "y": 160 }, { "x": 590, "y": 160 }] },
        { "id": "wire_9", "startTerminal": "comp_5_in_neg", "endTerminal": "comp_4_node", "points": [{ "x": 590, "y": 225 }, { "x": 565, "y": 225 }, { "x": 565, "y": 220 }, { "x": 540, "y": 220 }] },
        { "id": "wire_13", "startTerminal": "comp_2_right", "endTerminal": "comp_6_node", "points": [{ "x": 650, "y": 160 }, { "x": 700, "y": 160 }, { "x": 700, "y": 240 }, { "x": 700, "y": 240 }] },
        { "id": "wire_15", "startTerminal": "comp_6_node", "endTerminal": "comp_5_out", "points": [{ "x": 700, "y": 240 }, { "x": 675, "y": 240 }, { "x": 675, "y": 240 }, { "x": 650, "y": 240 }] },
        { "id": "wire_17", "startTerminal": "comp_7_positive", "endTerminal": "comp_5_in_pos", "points": [{ "x": 540, "y": 310 }, { "x": 540, "y": 310 }, { "x": 540, "y": 255 }, { "x": 590, "y": 255 }] },
        { "id": "wire_20", "startTerminal": "comp_8_ref", "endTerminal": "comp_3_left", "points": [{ "x": 460, "y": 405 }, { "x": 380, "y": 405 }, { "x": 380, "y": 220 }, { "x": 430, "y": 220 }] },
        { "id": "wire_22", "startTerminal": "comp_8_ref", "endTerminal": "comp_7_negative", "points": [{ "x": 460, "y": 405 }, { "x": 540, "y": 405 }, { "x": 540, "y": 370 }, { "x": 540, "y": 370 }] },
        { "id": "wire_24", "startTerminal": "comp_7_positive", "endTerminal": "comp_9_ch1_pos", "points": [{ "x": 540, "y": 310 }, { "x": 650, "y": 310 }, { "x": 650, "y": 305 }, { "x": 760, "y": 305 }] },
        { "id": "wire_26", "startTerminal": "comp_7_negative", "endTerminal": "comp_9_ch1_neg", "points": [{ "x": 540, "y": 370 }, { "x": 650, "y": 370 }, { "x": 650, "y": 375 }, { "x": 760, "y": 375 }] },
        { "id": "wire_28", "startTerminal": "comp_6_node", "endTerminal": "comp_9_ch2_pos", "points": [{ "x": 700, "y": 240 }, { "x": 700, "y": 240 }, { "x": 700, "y": 340 }, { "x": 715, "y": 340 }] },
        { "id": "wire_30", "startTerminal": "comp_9_ch2_neg", "endTerminal": "comp_8_ref", "points": [{ "x": 805, "y": 340 }, { "x": 820, "y": 340 }, { "x": 820, "y": 405 }, { "x": 460, "y": 405 }] }
      ]
    },
    simulation: {
      route: "default",
      simulationId: "non_inverting_sim",
      simulationType: "Time"
    }
  };
  var opamp_characteristics_template = {
    expId: "devices_and_circuits-exp5",
    name: "Op-Amp Characteristics",
    presets: [inverting_preset, non_inverting_preset]
  };

  // src/templates/active_filters.js
  var low_pass_preset = {
    presetId: "low_pass",
    name: "Low Pass Filter",
    description: "Op-Amp configured as an active low pass filter.",
    circuit: {
      components: [
        { "id": "comp_1", "type": "voltage_source", "x": 320, "y": 280, "rotation": 0, "properties": { "voltage": 5, "type": "dc", "frequency": 50, "phase": 0 }, "state": {} },
        { "id": "comp_2", "type": "resistor", "x": 400, "y": 200, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_3", "type": "junction", "x": 480, "y": 200, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_4", "type": "opamp", "x": 560, "y": 220, "rotation": 0, "properties": { "openLoopGain": 1e5, "gbp": 1e6, "rin": 2e6, "rout": 75, "offsetVoltage": 0, "cmrr": 90, "saturationVoltage": 15 }, "state": {} },
        { "id": "comp_6", "type": "junction", "x": 660, "y": 220, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_7", "type": "capacitor", "x": 580, "y": 140, "rotation": 0, "properties": { "capacitance": 1e-6 }, "state": { "voltage": 0, "current": 0 } },
        { "id": "comp_8", "type": "ground", "x": 460, "y": 380, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_10", "type": "resistor", "x": 580, "y": 80, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_11", "type": "oscilloscope", "x": 220, "y": 140, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": false, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} },
        { "id": "comp_12", "type": "junction", "x": 220, "y": 40, "rotation": 0, "properties": {}, "state": {} }
      ],
      wires: [
        { "id": "wire_2", "startTerminal": "comp_1_positive", "endTerminal": "comp_2_left", "points": [{ "x": 320, "y": 250 }, { "x": 320, "y": 250 }, { "x": 320, "y": 200 }, { "x": 370, "y": 200 }] },
        { "id": "wire_4", "startTerminal": "comp_2_right", "endTerminal": "comp_3_node", "points": [{ "x": 430, "y": 200 }, { "x": 455, "y": 200 }, { "x": 455, "y": 200 }, { "x": 480, "y": 200 }] },
        { "id": "wire_6", "startTerminal": "comp_3_node", "endTerminal": "comp_4_in_neg", "points": [{ "x": 480, "y": 200 }, { "x": 505, "y": 200 }, { "x": 505, "y": 205 }, { "x": 530, "y": 205 }] },
        { "id": "wire_12", "startTerminal": "comp_6_node", "endTerminal": "comp_4_out", "points": [{ "x": 660, "y": 220 }, { "x": 625, "y": 220 }, { "x": 625, "y": 220 }, { "x": 590, "y": 220 }] },
        { "id": "wire_14", "startTerminal": "comp_7_left", "endTerminal": "comp_3_node", "points": [{ "x": 550, "y": 140 }, { "x": 480, "y": 140 }, { "x": 480, "y": 200 }, { "x": 480, "y": 200 }] },
        { "id": "wire_16", "startTerminal": "comp_7_right", "endTerminal": "comp_6_node", "points": [{ "x": 610, "y": 140 }, { "x": 660, "y": 140 }, { "x": 660, "y": 220 }, { "x": 660, "y": 220 }] },
        { "id": "wire_18", "startTerminal": "comp_8_ref", "endTerminal": "comp_1_negative", "points": [{ "x": 460, "y": 365 }, { "x": 320, "y": 365 }, { "x": 320, "y": 310 }, { "x": 320, "y": 310 }] },
        { "id": "wire_20", "startTerminal": "comp_8_ref", "endTerminal": "comp_4_in_pos", "points": [{ "x": 460, "y": 365 }, { "x": 520, "y": 365 }, { "x": 520, "y": 235 }, { "x": 530, "y": 235 }] },
        { "id": "wire_30", "startTerminal": "comp_10_left", "endTerminal": "comp_3_node", "points": [{ "x": 550, "y": 80 }, { "x": 480, "y": 80 }, { "x": 480, "y": 200 }, { "x": 480, "y": 200 }] },
        { "id": "wire_32", "startTerminal": "comp_10_right", "endTerminal": "comp_6_node", "points": [{ "x": 610, "y": 80 }, { "x": 660, "y": 80 }, { "x": 660, "y": 220 }, { "x": 660, "y": 220 }] },
        { "id": "wire_34", "startTerminal": "comp_11_ch2_pos", "endTerminal": "comp_1_positive", "points": [{ "x": 175, "y": 140 }, { "x": 160, "y": 140 }, { "x": 160, "y": 250 }, { "x": 320, "y": 250 }] },
        { "id": "wire_36", "startTerminal": "comp_11_ch2_neg", "endTerminal": "comp_1_negative", "points": [{ "x": 265, "y": 140 }, { "x": 280, "y": 140 }, { "x": 280, "y": 310 }, { "x": 320, "y": 310 }] },
        { "id": "wire_38", "startTerminal": "comp_11_ch1_neg", "endTerminal": "comp_8_ref", "points": [{ "x": 220, "y": 175 }, { "x": 220, "y": 175 }, { "x": 220, "y": 365 }, { "x": 460, "y": 365 }] },
        { "id": "wire_40", "startTerminal": "comp_12_node", "endTerminal": "comp_11_ch1_pos", "points": [{ "x": 220, "y": 40 }, { "x": 220, "y": 40 }, { "x": 220, "y": 105 }, { "x": 220, "y": 105 }] },
        { "id": "wire_42", "startTerminal": "comp_12_node", "endTerminal": "comp_6_node", "points": [{ "x": 220, "y": 40 }, { "x": 660, "y": 40 }, { "x": 660, "y": 220 }, { "x": 660, "y": 220 }] }
      ]
    },
    simulation: {
      route: "default",
      simulationId: "low_pass_sim",
      simulationType: "Frequency"
    }
  };
  var high_pass_preset = {
    presetId: "high_pass",
    name: "High Pass Filter",
    description: "Op-Amp configured as an active high pass filter.",
    circuit: {
      components: [
        { "id": "comp_1", "type": "voltage_source", "x": 260, "y": 280, "rotation": 0, "properties": { "voltage": 5, "type": "ac", "frequency": 50, "phase": 0 }, "state": {} },
        { "id": "comp_2", "type": "resistor", "x": 320, "y": 200, "rotation": 0, "properties": { "resistance": 5600 }, "state": {} },
        { "id": "comp_3", "type": "junction", "x": 480, "y": 200, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_4", "type": "opamp", "x": 600, "y": 220, "rotation": 0, "properties": { "openLoopGain": 1e5, "gbp": 1e6, "rin": 2e6, "rout": 75, "offsetVoltage": 0, "cmrr": 90, "saturationVoltage": 15 }, "state": {} },
        { "id": "comp_6", "type": "junction", "x": 660, "y": 220, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_8", "type": "ground", "x": 460, "y": 380, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_10", "type": "resistor", "x": 580, "y": 140, "rotation": 0, "properties": { "resistance": 56e3 }, "state": {} },
        { "id": "comp_11", "type": "oscilloscope", "x": 160, "y": 140, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": false, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} },
        { "id": "comp_12", "type": "junction", "x": 220, "y": 40, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_13", "type": "capacitor", "x": 420, "y": 200, "rotation": 0, "properties": { "capacitance": 28e-10 }, "state": { "voltage": 0, "current": 0 } }
      ],
      wires: [
        { "id": "wire_2", "startTerminal": "comp_1_positive", "endTerminal": "comp_2_left", "points": [{ "x": 260, "y": 250 }, { "x": 260, "y": 250 }, { "x": 260, "y": 200 }, { "x": 290, "y": 200 }] },
        { "id": "wire_6", "startTerminal": "comp_3_node", "endTerminal": "comp_4_in_neg", "points": [{ "x": 480, "y": 200 }, { "x": 525, "y": 200 }, { "x": 525, "y": 205 }, { "x": 570, "y": 205 }] },
        { "id": "wire_12", "startTerminal": "comp_6_node", "endTerminal": "comp_4_out", "points": [{ "x": 660, "y": 220 }, { "x": 645, "y": 220 }, { "x": 645, "y": 220 }, { "x": 630, "y": 220 }] },
        { "id": "wire_18", "startTerminal": "comp_8_ref", "endTerminal": "comp_1_negative", "points": [{ "x": 460, "y": 365 }, { "x": 260, "y": 365 }, { "x": 260, "y": 310 }, { "x": 260, "y": 310 }] },
        { "id": "wire_20", "startTerminal": "comp_8_ref", "endTerminal": "comp_4_in_pos", "points": [{ "x": 460, "y": 365 }, { "x": 520, "y": 365 }, { "x": 520, "y": 235 }, { "x": 570, "y": 235 }] },
        { "id": "wire_30", "startTerminal": "comp_10_left", "endTerminal": "comp_3_node", "points": [{ "x": 550, "y": 140 }, { "x": 480, "y": 140 }, { "x": 480, "y": 200 }, { "x": 480, "y": 200 }] },
        { "id": "wire_32", "startTerminal": "comp_10_right", "endTerminal": "comp_6_node", "points": [{ "x": 610, "y": 140 }, { "x": 660, "y": 140 }, { "x": 660, "y": 220 }, { "x": 660, "y": 220 }] },
        { "id": "wire_34", "startTerminal": "comp_11_ch2_pos", "endTerminal": "comp_1_positive", "points": [{ "x": 115, "y": 140 }, { "x": 80, "y": 140 }, { "x": 80, "y": 250 }, { "x": 260, "y": 250 }] },
        { "id": "wire_36", "startTerminal": "comp_11_ch2_neg", "endTerminal": "comp_1_negative", "points": [{ "x": 205, "y": 140 }, { "x": 220, "y": 140 }, { "x": 220, "y": 310 }, { "x": 260, "y": 310 }] },
        { "id": "wire_38", "startTerminal": "comp_11_ch1_neg", "endTerminal": "comp_8_ref", "points": [{ "x": 160, "y": 175 }, { "x": 160, "y": 175 }, { "x": 160, "y": 365 }, { "x": 460, "y": 365 }] },
        { "id": "wire_40", "startTerminal": "comp_12_node", "endTerminal": "comp_11_ch1_pos", "points": [{ "x": 220, "y": 40 }, { "x": 160, "y": 40 }, { "x": 160, "y": 105 }, { "x": 160, "y": 105 }] },
        { "id": "wire_42", "startTerminal": "comp_12_node", "endTerminal": "comp_6_node", "points": [{ "x": 220, "y": 40 }, { "x": 660, "y": 40 }, { "x": 660, "y": 220 }, { "x": 660, "y": 220 }] },
        { "id": "wire_45", "startTerminal": "comp_13_left", "endTerminal": "comp_2_right", "points": [{ "x": 390, "y": 200 }, { "x": 370, "y": 200 }, { "x": 370, "y": 200 }, { "x": 350, "y": 200 }] },
        { "id": "wire_47", "startTerminal": "comp_13_right", "endTerminal": "comp_3_node", "points": [{ "x": 450, "y": 200 }, { "x": 465, "y": 200 }, { "x": 465, "y": 200 }, { "x": 480, "y": 200 }] }
      ]
    },
    simulation: {
      route: "default",
      simulationId: "high_pass_sim",
      simulationType: "Frequency"
    }
  };
  var band_pass_preset = {
    presetId: "band_pass",
    name: "Band Pass / State Variable Filter",
    description: "Op-Amp configured as an inverting state variable or band pass filter.",
    circuit: {
      components: [
        { "id": "comp_1", "type": "voltage_source", "x": 80, "y": 280, "rotation": 0, "properties": { "voltage": 2, "type": "ac", "frequency": 50, "phase": 0 }, "state": {} },
        { "id": "comp_2", "type": "resistor", "x": 160, "y": 200, "rotation": 0, "properties": { "resistance": 15e3 }, "state": {} },
        { "id": "comp_3", "type": "opamp", "x": 280, "y": 280, "rotation": 0, "properties": { "openLoopGain": 1e5, "gbp": 1e6, "rin": 2e6, "rout": 75, "offsetVoltage": 0, "cmrr": 90, "saturationVoltage": 15 }, "state": {} },
        { "id": "comp_4", "type": "opamp", "x": 520, "y": 280, "rotation": 0, "properties": { "openLoopGain": 1e5, "gbp": 1e6, "rin": 2e6, "rout": 75, "offsetVoltage": 0, "cmrr": 90, "saturationVoltage": 15 }, "state": {} },
        { "id": "comp_5", "type": "opamp", "x": 760, "y": 280, "rotation": 0, "properties": { "openLoopGain": 1e5, "gbp": 1e6, "rin": 2e6, "rout": 75, "offsetVoltage": 0, "cmrr": 90, "saturationVoltage": 15 }, "state": {} },
        { "id": "comp_6", "type": "resistor", "x": 280, "y": 200, "rotation": 0, "properties": { "resistance": 15e3 }, "state": {} },
        { "id": "comp_8", "type": "resistor", "x": 400, "y": 200, "rotation": 0, "properties": { "resistance": 15e3 }, "state": {} },
        { "id": "comp_9", "type": "capacitor", "x": 520, "y": 200, "rotation": 0, "properties": { "capacitance": 1e-6 }, "state": { "voltage": 0, "current": 0 } },
        { "id": "comp_10", "type": "resistor", "x": 640, "y": 200, "rotation": 0, "properties": { "resistance": 15e3 }, "state": {} },
        { "id": "comp_11", "type": "capacitor", "x": 760, "y": 200, "rotation": 0, "properties": { "capacitance": 1e-6 }, "state": { "voltage": 0, "current": 0 } },
        { "id": "comp_12", "type": "resistor", "x": 460, "y": 120, "rotation": 0, "properties": { "resistance": 15e3 }, "state": {} },
        { "id": "comp_13", "type": "resistor", "x": 160, "y": 360, "rotation": 0, "properties": { "resistance": 1e3 }, "state": {} },
        { "id": "comp_14", "type": "resistor", "x": 380, "y": 360, "rotation": 0, "properties": { "resistance": 33e4 }, "state": {} },
        { "id": "comp_16", "type": "junction", "x": 220, "y": 200, "rotation": 90, "properties": {}, "state": {} },
        { "id": "comp_17", "type": "junction", "x": 340, "y": 200, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_18", "type": "junction", "x": 460, "y": 200, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_19", "type": "junction", "x": 580, "y": 200, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_20", "type": "junction", "x": 700, "y": 200, "rotation": 90, "properties": {}, "state": {} },
        { "id": "comp_21", "type": "junction", "x": 820, "y": 200, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_22", "type": "junction", "x": 220, "y": 360, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_23", "type": "junction", "x": 580, "y": 280, "rotation": 90, "properties": {}, "state": {} },
        { "id": "comp_24", "type": "ground", "x": 80, "y": 420, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_25", "type": "ground", "x": 460, "y": 320, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_26", "type": "ground", "x": 700, "y": 320, "rotation": 0, "properties": {}, "state": {} },
        { "id": "comp_27", "type": "oscilloscope", "x": 640, "y": 340, "rotation": 0, "properties": { "ch1Enabled": true, "ch2Enabled": true, "ch1Mode": "Voltage", "ch2Mode": "Voltage", "ch1Label": "CH1", "ch2Label": "CH2" }, "state": {} }
      ],
      wires: [
        { "id": "wire_2", "startTerminal": "comp_1_positive", "endTerminal": "comp_2_left", "points": [{ "x": 80, "y": 250 }, { "x": 80, "y": 250 }, { "x": 80, "y": 200 }, { "x": 130, "y": 200 }] },
        { "id": "wire_5", "startTerminal": "comp_2_right", "endTerminal": "comp_16_node", "points": [{ "x": 190, "y": 200 }, { "x": 205, "y": 200 }, { "x": 205, "y": 200 }, { "x": 220, "y": 200 }] },
        { "id": "wire_7", "startTerminal": "comp_16_node", "endTerminal": "comp_6_left", "points": [{ "x": 220, "y": 200 }, { "x": 235, "y": 200 }, { "x": 235, "y": 200 }, { "x": 250, "y": 200 }] },
        { "id": "wire_9", "startTerminal": "comp_16_node", "endTerminal": "comp_3_in_neg", "points": [{ "x": 220, "y": 200 }, { "x": 220, "y": 200 }, { "x": 220, "y": 265 }, { "x": 250, "y": 265 }] },
        { "id": "wire_11", "startTerminal": "comp_17_node", "endTerminal": "comp_3_out", "points": [{ "x": 340, "y": 200 }, { "x": 340, "y": 200 }, { "x": 340, "y": 280 }, { "x": 310, "y": 280 }] },
        { "id": "wire_13", "startTerminal": "comp_17_node", "endTerminal": "comp_6_right", "points": [{ "x": 340, "y": 200 }, { "x": 325, "y": 200 }, { "x": 325, "y": 200 }, { "x": 310, "y": 200 }] },
        { "id": "wire_15", "startTerminal": "comp_17_node", "endTerminal": "comp_8_left", "points": [{ "x": 340, "y": 200 }, { "x": 355, "y": 200 }, { "x": 355, "y": 200 }, { "x": 370, "y": 200 }] },
        { "id": "wire_17", "startTerminal": "comp_12_left", "endTerminal": "comp_16_node", "points": [{ "x": 430, "y": 120 }, { "x": 220, "y": 120 }, { "x": 220, "y": 200 }, { "x": 220, "y": 200 }] },
        { "id": "wire_19", "startTerminal": "comp_8_right", "endTerminal": "comp_18_node", "points": [{ "x": 430, "y": 200 }, { "x": 445, "y": 200 }, { "x": 445, "y": 200 }, { "x": 460, "y": 200 }] },
        { "id": "wire_21", "startTerminal": "comp_18_node", "endTerminal": "comp_9_left", "points": [{ "x": 460, "y": 200 }, { "x": 475, "y": 200 }, { "x": 475, "y": 200 }, { "x": 490, "y": 200 }] },
        { "id": "wire_23", "startTerminal": "comp_18_node", "endTerminal": "comp_4_in_neg", "points": [{ "x": 460, "y": 200 }, { "x": 460, "y": 200 }, { "x": 460, "y": 265 }, { "x": 490, "y": 265 }] },
        { "id": "wire_27", "startTerminal": "comp_19_node", "endTerminal": "comp_9_right", "points": [{ "x": 580, "y": 200 }, { "x": 565, "y": 200 }, { "x": 565, "y": 200 }, { "x": 550, "y": 200 }] },
        { "id": "wire_29", "startTerminal": "comp_19_node", "endTerminal": "comp_10_left", "points": [{ "x": 580, "y": 200 }, { "x": 595, "y": 200 }, { "x": 595, "y": 200 }, { "x": 610, "y": 200 }] },
        { "id": "wire_31", "startTerminal": "comp_10_right", "endTerminal": "comp_20_node", "points": [{ "x": 670, "y": 200 }, { "x": 685, "y": 200 }, { "x": 685, "y": 200 }, { "x": 700, "y": 200 }] },
        { "id": "wire_33", "startTerminal": "comp_11_left", "endTerminal": "comp_20_node", "points": [{ "x": 730, "y": 200 }, { "x": 715, "y": 200 }, { "x": 715, "y": 200 }, { "x": 700, "y": 200 }] },
        { "id": "wire_35", "startTerminal": "comp_20_node", "endTerminal": "comp_5_in_neg", "points": [{ "x": 700, "y": 200 }, { "x": 700, "y": 200 }, { "x": 700, "y": 265 }, { "x": 730, "y": 265 }] },
        { "id": "wire_38", "startTerminal": "comp_21_node", "endTerminal": "comp_11_right", "points": [{ "x": 820, "y": 200 }, { "x": 805, "y": 200 }, { "x": 805, "y": 200 }, { "x": 790, "y": 200 }] },
        { "id": "wire_40", "startTerminal": "comp_21_node", "endTerminal": "comp_5_out", "points": [{ "x": 820, "y": 200 }, { "x": 820, "y": 200 }, { "x": 820, "y": 280 }, { "x": 790, "y": 280 }] },
        { "id": "wire_42", "startTerminal": "comp_21_node", "endTerminal": "comp_12_right", "points": [{ "x": 820, "y": 200 }, { "x": 820, "y": 200 }, { "x": 820, "y": 120 }, { "x": 490, "y": 120 }] },
        { "id": "wire_44", "startTerminal": "comp_3_in_pos", "endTerminal": "comp_22_node", "points": [{ "x": 250, "y": 295 }, { "x": 220, "y": 295 }, { "x": 220, "y": 360 }, { "x": 220, "y": 360 }] },
        { "id": "wire_46", "startTerminal": "comp_13_right", "endTerminal": "comp_22_node", "points": [{ "x": 190, "y": 360 }, { "x": 205, "y": 360 }, { "x": 205, "y": 360 }, { "x": 220, "y": 360 }] },
        { "id": "wire_48", "startTerminal": "comp_22_node", "endTerminal": "comp_14_left", "points": [{ "x": 220, "y": 360 }, { "x": 285, "y": 360 }, { "x": 285, "y": 360 }, { "x": 350, "y": 360 }] },
        { "id": "wire_50", "startTerminal": "comp_4_out", "endTerminal": "comp_23_node", "points": [{ "x": 550, "y": 280 }, { "x": 565, "y": 280 }, { "x": 565, "y": 280 }, { "x": 580, "y": 280 }] },
        { "id": "wire_52", "startTerminal": "comp_23_node", "endTerminal": "comp_19_node", "points": [{ "x": 580, "y": 280 }, { "x": 580, "y": 280 }, { "x": 580, "y": 200 }, { "x": 580, "y": 200 }] },
        { "id": "wire_54", "startTerminal": "comp_23_node", "endTerminal": "comp_14_right", "points": [{ "x": 580, "y": 280 }, { "x": 580, "y": 280 }, { "x": 580, "y": 360 }, { "x": 410, "y": 360 }] },
        { "id": "wire_56", "startTerminal": "comp_24_ref", "endTerminal": "comp_1_negative", "points": [{ "x": 80, "y": 405 }, { "x": 80, "y": 405 }, { "x": 80, "y": 310 }, { "x": 80, "y": 310 }] },
        { "id": "wire_58", "startTerminal": "comp_24_ref", "endTerminal": "comp_13_left", "points": [{ "x": 80, "y": 405 }, { "x": 80, "y": 405 }, { "x": 80, "y": 360 }, { "x": 130, "y": 360 }] },
        { "id": "wire_60", "startTerminal": "comp_25_ref", "endTerminal": "comp_4_in_pos", "points": [{ "x": 460, "y": 305 }, { "x": 460, "y": 305 }, { "x": 460, "y": 295 }, { "x": 490, "y": 295 }] },
        { "id": "wire_62", "startTerminal": "comp_26_ref", "endTerminal": "comp_5_in_pos", "points": [{ "x": 700, "y": 305 }, { "x": 700, "y": 305 }, { "x": 700, "y": 295 }, { "x": 730, "y": 295 }] },
        { "id": "wire_66", "startTerminal": "comp_27_ch1_pos", "endTerminal": "comp_23_node", "points": [{ "x": 640, "y": 305 }, { "x": 640, "y": 305 }, { "x": 640, "y": 280 }, { "x": 580, "y": 280 }] },
        { "id": "wire_68", "startTerminal": "comp_27_ch1_neg", "endTerminal": "comp_24_ref", "points": [{ "x": 640, "y": 375 }, { "x": 640, "y": 375 }, { "x": 640, "y": 405 }, { "x": 80, "y": 405 }] }
      ]
    },
    simulation: {
      route: "default",
      simulationId: "band_pass_sim",
      simulationType: "Frequency"
    }
  };
  var active_filters_template = {
    expId: "devices_and_circuits-exp6",
    name: "Active Filters",
    presets: [low_pass_preset, high_pass_preset, band_pass_preset]
  };

  // src/templates/instrumentation_amplifier.js
  var instrumentation_amplifier_preset = {
    presetId: "instrumentation_amplifier",
    name: "Instrumentation Amplifier",
    description: "High-precision amplifier used for small differential signals.",
    circuit: {
      "components": [
        {
          "id": "comp_1",
          "type": "opamp",
          "x": 260,
          "y": 160,
          "rotation": 0,
          "properties": {
            "openLoopGain": 1e5,
            "gbp": 1e6,
            "rin": 2e6,
            "rout": 75,
            "offsetVoltage": 0,
            "cmrr": 90,
            "saturationVoltage": 15
          },
          "state": {}
        },
        {
          "id": "comp_2",
          "type": "opamp",
          "x": 260,
          "y": 540,
          "rotation": 0,
          "properties": {
            "openLoopGain": 1e5,
            "gbp": 1e6,
            "rin": 2e6,
            "rout": 75,
            "offsetVoltage": 0,
            "cmrr": 90,
            "saturationVoltage": 15
          },
          "state": {}
        },
        {
          "id": "comp_3",
          "type": "opamp",
          "x": 560,
          "y": 340,
          "rotation": 0,
          "properties": {
            "openLoopGain": 1e5,
            "gbp": 1e6,
            "rin": 2e6,
            "rout": 75,
            "offsetVoltage": 0,
            "cmrr": 90,
            "saturationVoltage": 15
          },
          "state": {}
        },
        {
          "id": "comp_4",
          "type": "voltage_source",
          "x": 60,
          "y": 280,
          "rotation": 0,
          "properties": {
            "voltage": 5,
            "type": "dc",
            "frequency": 50,
            "phase": 0
          },
          "state": {}
        },
        {
          "id": "comp_5",
          "type": "voltage_source",
          "x": 160,
          "y": 600,
          "rotation": 0,
          "properties": {
            "voltage": 5,
            "type": "dc",
            "frequency": 50,
            "phase": 0
          },
          "state": {}
        },
        {
          "id": "comp_6",
          "type": "resistor",
          "x": 360,
          "y": 220,
          "rotation": 90,
          "properties": {
            "resistance": 1e3
          },
          "state": {}
        },
        {
          "id": "comp_7",
          "type": "resistor",
          "x": 360,
          "y": 340,
          "rotation": 90,
          "properties": {
            "resistance": 1e3
          },
          "state": {}
        },
        {
          "id": "comp_8",
          "type": "resistor",
          "x": 360,
          "y": 460,
          "rotation": 90,
          "properties": {
            "resistance": 1e3
          },
          "state": {}
        },
        {
          "id": "comp_9",
          "type": "junction",
          "x": 360,
          "y": 160,
          "rotation": 90,
          "properties": {},
          "state": {}
        },
        {
          "id": "comp_10",
          "type": "junction",
          "x": 360,
          "y": 280,
          "rotation": 0,
          "properties": {},
          "state": {}
        },
        {
          "id": "comp_11",
          "type": "junction",
          "x": 360,
          "y": 400,
          "rotation": 90,
          "properties": {},
          "state": {}
        },
        {
          "id": "comp_12",
          "type": "junction",
          "x": 360,
          "y": 540,
          "rotation": 0,
          "properties": {},
          "state": {}
        },
        {
          "id": "comp_13",
          "type": "junction",
          "x": 120,
          "y": 140,
          "rotation": 0,
          "properties": {},
          "state": {}
        },
        {
          "id": "comp_14",
          "type": "junction",
          "x": 500,
          "y": 160,
          "rotation": 0,
          "properties": {},
          "state": {}
        },
        {
          "id": "comp_15",
          "type": "junction",
          "x": 500,
          "y": 540,
          "rotation": 0,
          "properties": {},
          "state": {}
        },
        {
          "id": "comp_16",
          "type": "resistor",
          "x": 440,
          "y": 160,
          "rotation": 0,
          "properties": {
            "resistance": 1e3
          },
          "state": {}
        },
        {
          "id": "comp_17",
          "type": "resistor",
          "x": 440,
          "y": 540,
          "rotation": 0,
          "properties": {
            "resistance": 1e3
          },
          "state": {}
        },
        {
          "id": "comp_18",
          "type": "resistor",
          "x": 560,
          "y": 160,
          "rotation": 0,
          "properties": {
            "resistance": 1e3
          },
          "state": {}
        },
        {
          "id": "comp_19",
          "type": "junction",
          "x": 640,
          "y": 340,
          "rotation": 0,
          "properties": {},
          "state": {}
        },
        {
          "id": "comp_20",
          "type": "resistor",
          "x": 560,
          "y": 540,
          "rotation": 0,
          "properties": {
            "resistance": 1e3
          },
          "state": {}
        },
        {
          "id": "comp_21",
          "type": "ground",
          "x": 640,
          "y": 660,
          "rotation": 0,
          "properties": {},
          "state": {}
        },
        {
          "id": "comp_22",
          "type": "oscilloscope",
          "x": 640,
          "y": 440,
          "rotation": 0,
          "properties": {
            "ch1Enabled": true,
            "ch2Enabled": false,
            "ch1Mode": "Voltage",
            "ch2Mode": "Voltage",
            "ch1Label": "CH1",
            "ch2Label": "CH2"
          },
          "state": {}
        }
      ],
      "wires": [
        {
          "id": "wire_2",
          "startTerminal": "comp_4_positive",
          "endTerminal": "comp_1_in_pos",
          "points": [
            { "x": 60, "y": 250 },
            { "x": 60, "y": 250 },
            { "x": 60, "y": 175 },
            { "x": 230, "y": 175 }
          ]
        },
        {
          "id": "wire_4",
          "startTerminal": "comp_5_positive",
          "endTerminal": "comp_2_in_pos",
          "points": [
            { "x": 160, "y": 570 },
            { "x": 160, "y": 570 },
            { "x": 160, "y": 555 },
            { "x": 230, "y": 555 }
          ]
        },
        {
          "id": "wire_15",
          "startTerminal": "comp_2_out",
          "endTerminal": "comp_12_node",
          "points": [
            { "x": 290, "y": 540 },
            { "x": 325, "y": 540 },
            { "x": 325, "y": 540 },
            { "x": 360, "y": 540 }
          ]
        },
        {
          "id": "wire_17",
          "startTerminal": "comp_1_out",
          "endTerminal": "comp_9_node",
          "points": [
            { "x": 290, "y": 160 },
            { "x": 325, "y": 160 },
            { "x": 325, "y": 160 },
            { "x": 360, "y": 160 }
          ]
        },
        {
          "id": "wire_19",
          "startTerminal": "comp_9_node",
          "endTerminal": "comp_6_left",
          "points": [
            { "x": 360, "y": 160 },
            { "x": 360, "y": 160 },
            { "x": 360, "y": 190 },
            { "x": 360, "y": 190 }
          ]
        },
        {
          "id": "wire_21",
          "startTerminal": "comp_8_right",
          "endTerminal": "comp_12_node",
          "points": [
            { "x": 360, "y": 490 },
            { "x": 360, "y": 490 },
            { "x": 360, "y": 540 },
            { "x": 360, "y": 540 }
          ]
        },
        {
          "id": "wire_24",
          "startTerminal": "comp_8_left",
          "endTerminal": "comp_11_node",
          "points": [
            { "x": 360, "y": 430 },
            { "x": 360, "y": 430 },
            { "x": 360, "y": 400 },
            { "x": 360, "y": 400 }
          ]
        },
        {
          "id": "wire_26",
          "startTerminal": "comp_7_right",
          "endTerminal": "comp_11_node",
          "points": [
            { "x": 360, "y": 370 },
            { "x": 360, "y": 370 },
            { "x": 360, "y": 400 },
            { "x": 360, "y": 400 }
          ]
        },
        {
          "id": "wire_28",
          "startTerminal": "comp_7_left",
          "endTerminal": "comp_10_node",
          "points": [
            { "x": 360, "y": 310 },
            { "x": 360, "y": 310 },
            { "x": 360, "y": 280 },
            { "x": 360, "y": 280 }
          ]
        },
        {
          "id": "wire_30",
          "startTerminal": "comp_10_node",
          "endTerminal": "comp_6_right",
          "points": [
            { "x": 360, "y": 280 },
            { "x": 360, "y": 280 },
            { "x": 360, "y": 250 },
            { "x": 360, "y": 250 }
          ]
        },
        {
          "id": "wire_32",
          "startTerminal": "comp_11_node",
          "endTerminal": "comp_2_in_neg",
          "points": [
            { "x": 360, "y": 400 },
            { "x": 120, "y": 400 },
            { "x": 120, "y": 525 },
            { "x": 230, "y": 525 }
          ]
        },
        {
          "id": "wire_38",
          "startTerminal": "comp_1_in_neg",
          "endTerminal": "comp_13_node",
          "points": [
            { "x": 230, "y": 145 },
            { "x": 180, "y": 145 },
            { "x": 180, "y": 140 },
            { "x": 120, "y": 140 }
          ]
        },
        {
          "id": "wire_40",
          "startTerminal": "comp_13_node",
          "endTerminal": "comp_10_node",
          "points": [
            { "x": 120, "y": 140 },
            { "x": 120, "y": 140 },
            { "x": 120, "y": 280 },
            { "x": 360, "y": 280 }
          ]
        },
        {
          "id": "wire_42",
          "startTerminal": "comp_16_left",
          "endTerminal": "comp_9_node",
          "points": [
            { "x": 410, "y": 160 },
            { "x": 385, "y": 160 },
            { "x": 385, "y": 160 },
            { "x": 360, "y": 160 }
          ]
        },
        {
          "id": "wire_44",
          "startTerminal": "comp_16_right",
          "endTerminal": "comp_14_node",
          "points": [
            { "x": 470, "y": 160 },
            { "x": 485, "y": 160 },
            { "x": 485, "y": 160 },
            { "x": 500, "y": 160 }
          ]
        },
        {
          "id": "wire_46",
          "startTerminal": "comp_17_left",
          "endTerminal": "comp_12_node",
          "points": [
            { "x": 410, "y": 540 },
            { "x": 385, "y": 540 },
            { "x": 385, "y": 540 },
            { "x": 360, "y": 540 }
          ]
        },
        {
          "id": "wire_48",
          "startTerminal": "comp_17_right",
          "endTerminal": "comp_15_node",
          "points": [
            { "x": 470, "y": 540 },
            { "x": 485, "y": 540 },
            { "x": 485, "y": 540 },
            { "x": 500, "y": 540 }
          ]
        },
        {
          "id": "wire_50",
          "startTerminal": "comp_14_node",
          "endTerminal": "comp_3_in_neg",
          "points": [
            { "x": 500, "y": 160 },
            { "x": 500, "y": 160 },
            { "x": 500, "y": 325 },
            { "x": 530, "y": 325 }
          ]
        },
        {
          "id": "wire_53",
          "startTerminal": "comp_3_in_pos",
          "endTerminal": "comp_15_node",
          "points": [
            { "x": 530, "y": 355 },
            { "x": 500, "y": 355 },
            { "x": 500, "y": 540 },
            { "x": 500, "y": 540 }
          ]
        },
        {
          "id": "wire_56",
          "startTerminal": "comp_18_left",
          "endTerminal": "comp_14_node",
          "points": [
            { "x": 530, "y": 160 },
            { "x": 515, "y": 160 },
            { "x": 515, "y": 160 },
            { "x": 500, "y": 160 }
          ]
        },
        {
          "id": "wire_58",
          "startTerminal": "comp_18_right",
          "endTerminal": "comp_19_node",
          "points": [
            { "x": 590, "y": 160 },
            { "x": 640, "y": 160 },
            { "x": 640, "y": 340 },
            { "x": 640, "y": 340 }
          ]
        },
        {
          "id": "wire_60",
          "startTerminal": "comp_19_node",
          "endTerminal": "comp_3_out",
          "points": [
            { "x": 640, "y": 340 },
            { "x": 615, "y": 340 },
            { "x": 615, "y": 340 },
            { "x": 590, "y": 340 }
          ]
        },
        {
          "id": "wire_62",
          "startTerminal": "comp_20_left",
          "endTerminal": "comp_15_node",
          "points": [
            { "x": 530, "y": 540 },
            { "x": 515, "y": 540 },
            { "x": 515, "y": 540 },
            { "x": 500, "y": 540 }
          ]
        },
        {
          "id": "wire_64",
          "startTerminal": "comp_20_right",
          "endTerminal": "comp_21_ref",
          "points": [
            { "x": 590, "y": 540 },
            { "x": 640, "y": 540 },
            { "x": 640, "y": 645 },
            { "x": 640, "y": 645 }
          ]
        },
        {
          "id": "wire_66",
          "startTerminal": "comp_5_negative",
          "endTerminal": "comp_21_ref",
          "points": [
            { "x": 160, "y": 630 },
            { "x": 160, "y": 630 },
            { "x": 160, "y": 645 },
            { "x": 640, "y": 645 }
          ]
        },
        {
          "id": "wire_68",
          "startTerminal": "comp_22_ch1_pos",
          "endTerminal": "comp_19_node",
          "points": [
            { "x": 640, "y": 405 },
            { "x": 640, "y": 405 },
            { "x": 640, "y": 340 },
            { "x": 640, "y": 340 }
          ]
        },
        {
          "id": "wire_70",
          "startTerminal": "comp_22_ch1_neg",
          "endTerminal": "comp_21_ref",
          "points": [
            { "x": 640, "y": 475 },
            { "x": 640, "y": 475 },
            { "x": 640, "y": 645 },
            { "x": 640, "y": 645 }
          ]
        },
        {
          "id": "wire_72",
          "startTerminal": "comp_4_negative",
          "endTerminal": "comp_21_ref",
          "points": [
            { "x": 60, "y": 310 },
            { "x": 60, "y": 310 },
            { "x": 60, "y": 645 },
            { "x": 640, "y": 645 }
          ]
        }
      ]
    }
  };
  var instrumentation_amplifier_template = {
    expId: "sensor_lab-instrumentation",
    name: "Instrumentation Amplifier Lab",
    presets: [instrumentation_amplifier_preset]
  };

  // src/templates/lvdt.js
  var lvdt_template = {
    "components": [
      {
        "id": "comp_61",
        "type": "lvdt",
        "x": 380,
        "y": 220,
        "rotation": 0,
        "properties": {
          "displacement": 0,
          "sensitivity": 0.2,
          "maxDisplacement": 10
        },
        "state": {}
      },
      {
        "id": "comp_62",
        "type": "voltage_source",
        "x": 180,
        "y": 220,
        "rotation": 0,
        "properties": {
          "voltage": 5,
          "type": "dc",
          "frequency": 50,
          "phase": 0
        },
        "state": {}
      },
      {
        "id": "comp_63",
        "type": "ground",
        "x": 340,
        "y": 400,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_64",
        "type": "voltmeter",
        "x": 560,
        "y": 220,
        "rotation": 90,
        "properties": {
          "voltage": 0
        }
      }
    ],
    "wires": [
      {
        "id": "wire_3",
        "startTerminal": "comp_62_positive",
        "endTerminal": "comp_61_exc_pos",
        "points": [
          {
            "x": 180,
            "y": 190
          },
          {
            "x": 240,
            "y": 190
          },
          {
            "x": 240,
            "y": 185
          },
          {
            "x": 290,
            "y": 185
          }
        ]
      },
      {
        "id": "wire_5",
        "startTerminal": "comp_62_negative",
        "endTerminal": "comp_61_out_pos",
        "points": [
          {
            "x": 180,
            "y": 250
          },
          {
            "x": 240,
            "y": 250
          },
          {
            "x": 240,
            "y": 255
          },
          {
            "x": 290,
            "y": 255
          }
        ]
      },
      {
        "id": "wire_7",
        "startTerminal": "comp_62_negative",
        "endTerminal": "comp_63_ref",
        "points": [
          {
            "x": 180,
            "y": 250
          },
          {
            "x": 180,
            "y": 250
          },
          {
            "x": 180,
            "y": 385
          },
          {
            "x": 340,
            "y": 385
          }
        ]
      },
      {
        "id": "wire_9",
        "startTerminal": "comp_64_positive",
        "endTerminal": "comp_61_exc_neg",
        "points": [
          {
            "x": 560,
            "y": 190
          },
          {
            "x": 510,
            "y": 190
          },
          {
            "x": 510,
            "y": 185
          },
          {
            "x": 460,
            "y": 185
          }
        ]
      },
      {
        "id": "wire_11",
        "startTerminal": "comp_64_negative",
        "endTerminal": "comp_61_out_neg",
        "points": [
          {
            "x": 560,
            "y": 250
          },
          {
            "x": 510,
            "y": 250
          },
          {
            "x": 510,
            "y": 255
          },
          {
            "x": 460,
            "y": 255
          }
        ]
      },
      {
        "id": "wire_13",
        "startTerminal": "comp_63_ref",
        "endTerminal": "comp_64_negative",
        "points": [
          {
            "x": 340,
            "y": 385
          },
          {
            "x": 560,
            "y": 385
          },
          {
            "x": 560,
            "y": 250
          },
          {
            "x": 560,
            "y": 250
          }
        ]
      }
    ]
  };

  // src/templates/strain_gauge.js
  var strain_gauge_template = {
    "components": [
      {
        "id": "comp_62",
        "type": "voltage_source",
        "x": 180,
        "y": 220,
        "rotation": 0,
        "properties": {
          "voltage": 5,
          "type": "dc",
          "frequency": 50,
          "phase": 0
        },
        "state": {}
      },
      {
        "id": "comp_63",
        "type": "ground",
        "x": 400,
        "y": 420,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_64",
        "type": "voltmeter",
        "x": 400,
        "y": 340,
        "rotation": 0,
        "properties": {
          "voltage": 0
        }
      },
      {
        "id": "comp_65",
        "type": "strain_gauge",
        "x": 400,
        "y": 200,
        "rotation": 0,
        "properties": {
          "force": 11,
          "maxForce": 100,
          "gaugeFactor": 2.1,
          "nominalR": 350,
          "youngsModulus": 2e11,
          "crossSection": 1e-6
        },
        "state": {}
      }
    ],
    "wires": [
      {
        "id": "wire_7",
        "startTerminal": "comp_62_negative",
        "endTerminal": "comp_63_ref",
        "points": [
          {
            "x": 180,
            "y": 250
          },
          {
            "x": 180,
            "y": 250
          },
          {
            "x": 180,
            "y": 405
          },
          {
            "x": 400,
            "y": 405
          }
        ]
      },
      {
        "id": "wire_15",
        "startTerminal": "comp_65_exc_pos",
        "endTerminal": "comp_62_positive",
        "points": [
          {
            "x": 400,
            "y": 110
          },
          {
            "x": 180,
            "y": 110
          },
          {
            "x": 180,
            "y": 190
          },
          {
            "x": 180,
            "y": 190
          }
        ]
      },
      {
        "id": "wire_17",
        "startTerminal": "comp_65_exc_neg",
        "endTerminal": "comp_62_negative",
        "points": [
          {
            "x": 400,
            "y": 290
          },
          {
            "x": 180,
            "y": 290
          },
          {
            "x": 180,
            "y": 250
          },
          {
            "x": 180,
            "y": 250
          }
        ]
      },
      {
        "id": "wire_20",
        "startTerminal": "comp_64_negative",
        "endTerminal": "comp_65_out_neg",
        "points": [
          {
            "x": 430,
            "y": 340
          },
          {
            "x": 520,
            "y": 340
          },
          {
            "x": 520,
            "y": 200
          },
          {
            "x": 490,
            "y": 200
          }
        ]
      },
      {
        "id": "wire_22",
        "startTerminal": "comp_64_positive",
        "endTerminal": "comp_65_out_pos",
        "points": [
          {
            "x": 370,
            "y": 340
          },
          {
            "x": 260,
            "y": 340
          },
          {
            "x": 260,
            "y": 200
          },
          {
            "x": 310,
            "y": 200
          }
        ]
      },
      {
        "id": "wire_24",
        "startTerminal": "comp_64_negative",
        "endTerminal": "comp_63_ref",
        "points": [
          {
            "x": 430,
            "y": 340
          },
          {
            "x": 520,
            "y": 340
          },
          {
            "x": 520,
            "y": 405
          },
          {
            "x": 400,
            "y": 405
          }
        ]
      }
    ]
  };

  // src/templates/load_cell.js
  var load_cell_template = {
    "components": [
      {
        "id": "comp_62",
        "type": "voltage_source",
        "x": 180,
        "y": 220,
        "rotation": 0,
        "properties": {
          "voltage": 5,
          "type": "dc",
          "frequency": 50,
          "phase": 0
        },
        "state": {}
      },
      {
        "id": "comp_63",
        "type": "ground",
        "x": 400,
        "y": 420,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_64",
        "type": "voltmeter",
        "x": 400,
        "y": 340,
        "rotation": 0,
        "properties": {
          "voltage": 0
        }
      },
      {
        "id": "comp_66",
        "type": "load_cell",
        "x": 400,
        "y": 180,
        "rotation": 0,
        "properties": {
          "weight": "1000",
          "ratedCapacity": 5e3,
          "sensitivity": 2e-3,
          "amplifierGain": 100
        },
        "state": {}
      }
    ],
    "wires": [
      {
        "id": "wire_7",
        "startTerminal": "comp_62_negative",
        "endTerminal": "comp_63_ref",
        "points": [
          {
            "x": 180,
            "y": 250
          },
          {
            "x": 180,
            "y": 250
          },
          {
            "x": 180,
            "y": 405
          },
          {
            "x": 400,
            "y": 405
          }
        ]
      },
      {
        "id": "wire_24",
        "startTerminal": "comp_64_negative",
        "endTerminal": "comp_63_ref",
        "points": [
          {
            "x": 430,
            "y": 340
          },
          {
            "x": 520,
            "y": 340
          },
          {
            "x": 520,
            "y": 405
          },
          {
            "x": 400,
            "y": 405
          }
        ]
      },
      {
        "id": "wire_26",
        "startTerminal": "comp_66_exc_pos",
        "endTerminal": "comp_62_positive",
        "points": [
          {
            "x": 400,
            "y": 75
          },
          {
            "x": 180,
            "y": 75
          },
          {
            "x": 180,
            "y": 190
          },
          {
            "x": 180,
            "y": 190
          }
        ]
      },
      {
        "id": "wire_28",
        "startTerminal": "comp_66_exc_neg",
        "endTerminal": "comp_62_negative",
        "points": [
          {
            "x": 400,
            "y": 285
          },
          {
            "x": 180,
            "y": 285
          },
          {
            "x": 180,
            "y": 250
          },
          {
            "x": 180,
            "y": 250
          }
        ]
      },
      {
        "id": "wire_30",
        "startTerminal": "comp_64_positive",
        "endTerminal": "comp_66_out_pos",
        "points": [
          {
            "x": 370,
            "y": 340
          },
          {
            "x": 260,
            "y": 340
          },
          {
            "x": 260,
            "y": 180
          },
          {
            "x": 280,
            "y": 180
          }
        ]
      },
      {
        "id": "wire_32",
        "startTerminal": "comp_64_negative",
        "endTerminal": "comp_66_out_neg",
        "points": [
          {
            "x": 430,
            "y": 340
          },
          {
            "x": 520,
            "y": 340
          },
          {
            "x": 520,
            "y": 180
          },
          {
            "x": 520,
            "y": 180
          }
        ]
      }
    ]
  };

  // src/templates/rtd.js
  var rtd_template = {
    "components": [
      {
        "id": "comp_62",
        "type": "voltage_source",
        "x": 220,
        "y": 200,
        "rotation": 0,
        "properties": {
          "voltage": 1,
          "type": "dc",
          "frequency": 50,
          "phase": 0
        },
        "state": {}
      },
      {
        "id": "comp_63",
        "type": "ground",
        "x": 400,
        "y": 320,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_64",
        "type": "voltmeter",
        "x": 560,
        "y": 200,
        "rotation": 90,
        "properties": {
          "voltage": 0
        }
      },
      {
        "id": "comp_65",
        "type": "rtd",
        "x": 400,
        "y": 200,
        "rotation": 0,
        "properties": {
          "r0": 100,
          "alpha": 385e-5,
          "tRef": 0,
          "ambientTemp": 25,
          "timeConstant": 3,
          "heaterGain": 60,
          "maxTemp": 300
        },
        "state": {}
      }
    ],
    "wires": [
      {
        "id": "wire_7",
        "startTerminal": "comp_62_negative",
        "endTerminal": "comp_63_ref",
        "points": [
          {
            "x": 220,
            "y": 230
          },
          {
            "x": 220,
            "y": 230
          },
          {
            "x": 220,
            "y": 305
          },
          {
            "x": 400,
            "y": 305
          }
        ]
      },
      {
        "id": "wire_13",
        "startTerminal": "comp_63_ref",
        "endTerminal": "comp_64_negative",
        "points": [
          {
            "x": 400,
            "y": 305
          },
          {
            "x": 560,
            "y": 305
          },
          {
            "x": 560,
            "y": 230
          },
          {
            "x": 560,
            "y": 230
          }
        ]
      },
      {
        "id": "wire_15",
        "startTerminal": "comp_62_positive",
        "endTerminal": "comp_65_exc_pos",
        "points": [
          {
            "x": 220,
            "y": 170
          },
          {
            "x": 272.5,
            "y": 170
          },
          {
            "x": 272.5,
            "y": 180
          },
          {
            "x": 325,
            "y": 180
          }
        ]
      },
      {
        "id": "wire_17",
        "startTerminal": "comp_62_negative",
        "endTerminal": "comp_65_exc_neg",
        "points": [
          {
            "x": 220,
            "y": 230
          },
          {
            "x": 272.5,
            "y": 230
          },
          {
            "x": 272.5,
            "y": 220
          },
          {
            "x": 325,
            "y": 220
          }
        ]
      },
      {
        "id": "wire_20",
        "startTerminal": "comp_65_out_pos",
        "endTerminal": "comp_64_positive",
        "points": [
          {
            "x": 475,
            "y": 180
          },
          {
            "x": 517.5,
            "y": 180
          },
          {
            "x": 517.5,
            "y": 170
          },
          {
            "x": 560,
            "y": 170
          }
        ]
      },
      {
        "id": "wire_22",
        "startTerminal": "comp_65_out_neg",
        "endTerminal": "comp_64_negative",
        "points": [
          {
            "x": 475,
            "y": 220
          },
          {
            "x": 517.5,
            "y": 220
          },
          {
            "x": 517.5,
            "y": 230
          },
          {
            "x": 560,
            "y": 230
          }
        ]
      }
    ]
  };

  // src/templates/thermistor.js
  var thermistor_template = {
    "components": [
      {
        "id": "comp_62",
        "type": "voltage_source",
        "x": 220,
        "y": 180,
        "rotation": 0,
        "properties": {
          "voltage": 1,
          "type": "dc",
          "frequency": 50,
          "phase": 0
        },
        "state": {}
      },
      {
        "id": "comp_63",
        "type": "ground",
        "x": 400,
        "y": 320,
        "rotation": 0,
        "properties": {},
        "state": {}
      },
      {
        "id": "comp_64",
        "type": "voltmeter",
        "x": 560,
        "y": 180,
        "rotation": 90,
        "properties": {
          "voltage": 0
        }
      },
      {
        "id": "comp_66",
        "type": "thermistor",
        "x": 400,
        "y": 180,
        "rotation": 0,
        "properties": {
          "r0": 1e4,
          "bConstant": 3950,
          "t0": 25,
          "ambientTemp": 25,
          "timeConstant": 3,
          "heaterGain": 60,
          "maxTemp": 200
        },
        "state": {}
      }
    ],
    "wires": [
      {
        "id": "wire_7",
        "startTerminal": "comp_62_negative",
        "endTerminal": "comp_63_ref",
        "points": [
          {
            "x": 220,
            "y": 210
          },
          {
            "x": 220,
            "y": 210
          },
          {
            "x": 220,
            "y": 305
          },
          {
            "x": 400,
            "y": 305
          }
        ]
      },
      {
        "id": "wire_13",
        "startTerminal": "comp_63_ref",
        "endTerminal": "comp_64_negative",
        "points": [
          {
            "x": 400,
            "y": 305
          },
          {
            "x": 560,
            "y": 305
          },
          {
            "x": 560,
            "y": 210
          },
          {
            "x": 560,
            "y": 210
          }
        ]
      },
      {
        "id": "wire_24",
        "startTerminal": "comp_62_positive",
        "endTerminal": "comp_66_exc_pos",
        "points": [
          {
            "x": 220,
            "y": 150
          },
          {
            "x": 272.5,
            "y": 150
          },
          {
            "x": 272.5,
            "y": 160
          },
          {
            "x": 325,
            "y": 160
          }
        ]
      },
      {
        "id": "wire_26",
        "startTerminal": "comp_66_exc_neg",
        "endTerminal": "comp_62_negative",
        "points": [
          {
            "x": 325,
            "y": 200
          },
          {
            "x": 272.5,
            "y": 200
          },
          {
            "x": 272.5,
            "y": 210
          },
          {
            "x": 220,
            "y": 210
          }
        ]
      },
      {
        "id": "wire_28",
        "startTerminal": "comp_66_out_pos",
        "endTerminal": "comp_64_positive",
        "points": [
          {
            "x": 475,
            "y": 160
          },
          {
            "x": 517.5,
            "y": 160
          },
          {
            "x": 517.5,
            "y": 150
          },
          {
            "x": 560,
            "y": 150
          }
        ]
      },
      {
        "id": "wire_30",
        "startTerminal": "comp_66_out_neg",
        "endTerminal": "comp_64_negative",
        "points": [
          {
            "x": 475,
            "y": 200
          },
          {
            "x": 517.5,
            "y": 200
          },
          {
            "x": 517.5,
            "y": 210
          },
          {
            "x": 560,
            "y": 210
          }
        ]
      }
    ]
  };

  // src/templates/index.js
  var circuitTemplates = {
    "basic-ee-exp-1": power_factor_correction_template,
    "basic-ee-exp-2": verification_of_superposition_theorem_template,
    "basic-ee-exp-3": verification_of_thevenin_theorem_template,
    "basic-ee-exp-4": transient_response_rlc_template,
    "basic-ee-exp-5": oc_sc_test_single_phase_transformer_template,
    "basic-ee-exp-6": three_phase_connections_template,
    "basic-ee-exp-7": transformer_test_template,
    "devices_and_circuits-exp3": diode_rectifiers_template,
    "devices_and_circuits-exp4": opamp_arithmetics_template,
    "devices_and_circuits-exp5": opamp_characteristics_template,
    "devices_and_circuits-exp6": active_filters_template,
    "sensor_lab-exp1": {
      name: "Basic Active Filters",
      presets: [low_pass_preset, high_pass_preset]
    },
    "sensor_lab-exp2": {
      name: "Sensor Lab 2: Op-Amp Applications",
      presets: [integrator_preset, differentiator_preset, inverting_preset, instrumentation_amplifier_preset]
    },
    "sensor_lab-instrumentation": instrumentation_amplifier_template,
    "sensor_lab-lvdt": lvdt_template,
    "sensor_lab-strain_gauge": strain_gauge_template,
    "sensor_lab-load_cell": load_cell_template,
    "sensor_lab-rtd": rtd_template,
    "sensor_lab-thermistor": thermistor_template
  };

  // src/utils/StateManager.js
  var StateManager = class {
    /**
     * @param {string} expId - Experiment identifier (e.g., 'superposition')
     */
    constructor(expId) {
      if (!expId) {
        console.warn('StateManager: No expId provided, defaulting to "sandbox"');
        this.expId = "sandbox";
      } else {
        this.expId = expId;
      }
      this.storageKey = `sim_state_${this.expId}`;
      this.autosaveTimer = null;
      this.lastSavedState = null;
    }
    /**
     * Load state from storage
     * @returns {Object|null} The parsed state or null if not found
     */
    loadState() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const isNewSession = urlParams.get("newSession") === "true";
        if (isNewSession) {
          console.log(`StateManager: Forced new session for ${this.expId}`);
          localStorage.removeItem(this.storageKey);
          urlParams.delete("newSession");
          const newQuery = urlParams.toString();
          const newUrl = window.location.pathname + (newQuery ? "?" + newQuery : "");
          window.history.replaceState({}, "", newUrl);
        } else {
          const raw = localStorage.getItem(this.storageKey);
          if (raw) {
            const state = JSON.parse(raw);
            console.log(`StateManager: Loaded persistent state for ${this.expId}`);
            return state;
          }
        }
        const template = circuitTemplates[this.expId];
        if (template) {
          console.log(`StateManager: Initializing from template for ${this.expId}`);
          const presetId = urlParams.get("preset");
          let circuitDataToLoad = null;
          if (template.presets && template.presets.length > 0) {
            if (presetId) {
              const selectedPreset = template.presets.find((p) => p.presetId === presetId);
              if (selectedPreset) {
                circuitDataToLoad = selectedPreset.circuit;
              } else {
                console.warn(`StateManager: Preset '${presetId}' not found, falling back to default.`);
              }
            }
            if (!circuitDataToLoad) {
              if (template.presets.length > 1) {
                return { requirePresetSelection: true, presets: template.presets, expId: this.expId };
              } else {
                circuitDataToLoad = template.presets[0].circuit;
              }
            }
          }
          if (!circuitDataToLoad) {
            circuitDataToLoad = template;
          }
          const initialState = {
            expId: this.expId,
            timestamp: Date.now(),
            circuit: JSON.parse(JSON.stringify(circuitDataToLoad))
          };
          return initialState;
        }
        return null;
      } catch (e) {
        console.error("StateManager: Failed to load state", e);
        return null;
      }
    }
    /**
     * Helper to save state object directly (internal use)
     */
    saveIntervalState(state) {
      try {
        const json = JSON.stringify(state);
        localStorage.setItem(this.storageKey, json);
        this.lastSavedState = json;
      } catch (e) {
        console.error("StateManager: Failed to save initial template state", e);
      }
    }
    /**
     * Save state to storage
     * @param {Object} circuitGraph - The circuit graph instance to serialize
     */
    saveState(circuitGraph2) {
      try {
        const data = circuitGraph2.serialize();
        const state = {
          expId: this.expId,
          timestamp: Date.now(),
          circuit: data
        };
        const json = JSON.stringify(state);
        if (json === this.lastSavedState) return;
        localStorage.setItem(this.storageKey, json);
        this.lastSavedState = json;
        console.log(`StateManager: Auto-saved state for ${this.expId}`);
        const saveBtn = document.getElementById("btn-save");
        if (saveBtn && !saveBtn.textContent.includes("\u2713")) {
          const original = saveBtn.innerHTML;
          saveBtn.style.opacity = "0.7";
          setTimeout(() => saveBtn.style.opacity = "1", 200);
        }
      } catch (e) {
        console.error("StateManager: Failed to save state", e);
      }
    }
    /**
     * Schedule an autosave (debounce)
     * @param {Object} circuitGraph 
     * @param {number} delayMs 
     */
    autosave(circuitGraph2, delayMs = 1e3) {
      if (this.autosaveTimer) {
        clearTimeout(this.autosaveTimer);
      }
      this.autosaveTimer = setTimeout(() => {
        this.saveState(circuitGraph2);
      }, delayMs);
    }
    /**
     * Reset state for this experiment
     */
    resetState() {
      localStorage.removeItem(this.storageKey);
      this.lastSavedState = null;
      console.log(`StateManager: Reset state for ${this.expId}`);
    }
    /**
     * Get all saved experiments (utility)
     */
    static listSavedExperiments() {
      const experiments = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith("sim_state_")) {
          experiments.push(key.replace("sim_state_", ""));
        }
      }
      return experiments;
    }
  };

  // src/main.js
  var circuitGraph;
  var canvas;
  var toolbar;
  var propertyPanel;
  var simulationControls;
  function init() {
    console.log("\u26A1 GridLab initializing...");
    circuitGraph = new CircuitGraph();
    const svgElement = document.getElementById("circuit-canvas");
    if (svgElement) {
      canvas = new Canvas(svgElement, circuitGraph);
    }
    const toolbarElement = document.getElementById("toolbar");
    if (toolbarElement && canvas) {
      toolbar = new Toolbar(toolbarElement, canvas);
    }
    const propertyPanelElement = document.getElementById("property-panel");
    if (propertyPanelElement && canvas) {
      propertyPanel = new PropertyPanel(propertyPanelElement, canvas);
    }
    const simulationPanelElement = document.getElementById("simulation-panel");
    if (simulationPanelElement) {
      simulationControls = new SimulationControls(simulationPanelElement, circuitGraph);
      simulationControls.detectSensorMode();
    }
    window.circuitGraph = circuitGraph;
    window.canvas = canvas;
    window.propertyPanel = propertyPanel;
    window.simulationControls = simulationControls;
    setupHeaderButtons();
    setupAboutModal();
    setupCollapsibleSections();
    setupPanelDragResize();
    const urlParams = new URLSearchParams(window.location.search);
    const expId = urlParams.get("expId") || urlParams.get("exp") || "sandbox";
    console.log(`\u{1F50C} Initializing session for experiment: ${expId}`);
    const stateManager = new StateManager(expId);
    const savedState = stateManager.loadState();
    if (savedState && savedState.requirePresetSelection) {
      showPresetSelectionModal(savedState.presets, savedState.expId);
    } else if (savedState && savedState.circuit) {
      console.log("Restoring saved simulation state...");
      circuitGraph.deserialize(savedState.circuit);
      if (canvas) {
        canvas.renderAll();
      }
    } else {
      stateManager.saveState(circuitGraph);
    }
    const expIdToUse = savedState && savedState.expId ? savedState.expId : expId;
    const template = circuitTemplates[expIdToUse] || null;
    if (template && template.presets && template.presets.length > 1) {
      const btnChangeConfig = document.getElementById("btn-change-config");
      if (btnChangeConfig) {
        btnChangeConfig.style.display = "inline-flex";
        btnChangeConfig.onclick = () => {
          showPresetSelectionModal(template.presets, expIdToUse);
        };
      }
    }
    circuitGraph.onChange = (type, data) => {
      if (simulationControls) {
        simulationControls.detectSensorMode();
      }
      updateStatus();
    };
    if (propertyPanel) {
      propertyPanel.onPropertyChange = (component, prop, value) => {
      };
    }
    window.circuitSimulator.stateManager = stateManager;
    updateStatus();
    if (simulationControls) {
      simulationControls.detectSensorMode();
    }
    console.log("\u2705 GridLab ready!");
  }
  function setupAboutModal() {
    const aboutBtn = document.getElementById("btn-about");
    const aboutOverlay = document.getElementById("about-modal-overlay");
    const closeBtn = document.getElementById("about-modal-close");
    const footerCloseBtn = document.getElementById("btn-about-close");
    if (!aboutOverlay) return;
    function openAbout() {
      aboutOverlay.style.display = "flex";
    }
    function closeAbout() {
      aboutOverlay.style.display = "none";
    }
    aboutBtn?.addEventListener("click", openAbout);
    closeBtn?.addEventListener("click", closeAbout);
    footerCloseBtn?.addEventListener("click", closeAbout);
    aboutOverlay.addEventListener("click", (e) => {
      if (e.target === aboutOverlay) {
        closeAbout();
      }
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && aboutOverlay.style.display === "flex") {
        closeAbout();
      }
    });
  }
  function setupHeaderButtons() {
    document.getElementById("btn-new")?.addEventListener("click", () => {
      if (circuitGraph.getComponentCount() > 0) {
        if (confirm("Clear current circuit? All unsaved changes will be lost.")) {
          canvas.clear();
        }
      }
    });
    document.getElementById("btn-save")?.addEventListener("click", () => {
      saveCircuit();
    });
    document.getElementById("btn-download")?.addEventListener("click", () => {
      downloadCircuit();
    });
    document.getElementById("btn-load")?.addEventListener("click", () => {
      loadCircuit();
    });
    document.getElementById("btn-export-image")?.addEventListener("click", () => {
      if (canvas) {
        canvas.exportAsImage("png");
        const btn = document.getElementById("btn-export-image");
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
        setTimeout(() => {
          btn.innerHTML = originalHTML;
        }, 1500);
      }
    });
  }
  function showPresetSelectionModal(presets, expId) {
    const overlay = document.getElementById("preset-modal-overlay");
    const grid = document.getElementById("preset-grid");
    if (!overlay || !grid) return;
    grid.innerHTML = "";
    presets.forEach((preset) => {
      const card = document.createElement("div");
      card.className = "preset-card";
      card.innerHTML = `
            <h3>${preset.name}</h3>
            <p>${preset.description || ""}</p>
        `;
      card.onclick = () => {
        window.loadPreset(preset.presetId, expId);
        overlay.style.display = "none";
      };
      grid.appendChild(card);
    });
    overlay.style.display = "flex";
  }
  window.loadPreset = function(presetId, currentExpId) {
    console.log(`Loading preset: ${presetId}`);
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set("preset", presetId);
    if (currentExpId) urlParams.set("expId", currentExpId);
    const newUrl = window.location.pathname + "?" + urlParams.toString();
    window.history.replaceState({}, "", newUrl);
    if (window.simulationControls) {
      if (window.simulationControls.running) {
        window.simulationControls.toggleSimulation();
      }
      window.simulationControls.hideScope();
      window.simulationControls.chart?.destroy();
      window.simulationControls.chart = null;
      document.getElementById("chart-container").style.display = "none";
      document.getElementById("output-content").innerHTML = "";
      document.getElementById("output-panel").classList.add("collapsed");
    }
    if (window.circuitGraph) {
      window.circuitGraph.clear();
    }
    if (window.canvas) {
      window.canvas.clear();
    }
    if (window.propertyPanel) {
      window.propertyPanel.showEmpty();
    }
    const sm = window.circuitSimulator.stateManager || new window.StateManager(currentExpId);
    localStorage.removeItem(sm.storageKey);
    const newState = sm.loadState();
    if (newState && newState.circuit) {
      window.circuitGraph.deserialize(newState.circuit);
      for (const component of window.circuitGraph.components.values()) {
        component.updateElement();
      }
      if (window.canvas) {
        setTimeout(() => {
          window.canvas.renderAll();
          console.log("Canvas re-rendered with new preset.");
        }, 50);
      }
      const template = circuitTemplates[currentExpId] || null;
      if (template && template.presets && template.presets.length > 1) {
        const btnChangeConfig = document.getElementById("btn-change-config");
        if (btnChangeConfig) {
          btnChangeConfig.style.display = "inline-flex";
          btnChangeConfig.onclick = () => {
            showPresetSelectionModal(template.presets, currentExpId);
          };
        }
      }
    }
    document.getElementById("property-panel").classList.remove("collapsed");
  };
  function setupCollapsibleSections() {
    const headers = document.querySelectorAll(".collapsible-header");
    headers.forEach((header) => {
      header.addEventListener("click", () => {
        const section = header.closest(".collapsible-section");
        section.classList.toggle("collapsed");
      });
    });
  }
  function setupPanelDragResize() {
    const appMain = document.querySelector(".app-main");
    const dragLeft = document.getElementById("drag-left");
    const dragRight = document.getElementById("drag-right");
    if (!appMain) return;
    function startDrag(handle, side) {
      return function(e) {
        e.preventDefault();
        handle.classList.add("dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        const startX = e.clientX;
        const mainRect = appMain.getBoundingClientRect();
        const cols = window.getComputedStyle(appMain).gridTemplateColumns.split(/\s+/);
        const leftW = parseFloat(cols[0]);
        const rightW = parseFloat(cols[4]);
        function onMove(ev) {
          const dx = ev.clientX - startX;
          const totalW = mainRect.width;
          if (side === "left") {
            const newLeft = Math.max(60, Math.min(leftW + dx, totalW * 0.4));
            appMain.style.gridTemplateColumns = `${newLeft}px 4px 1fr 4px ${rightW}px`;
          } else {
            const newRight = Math.max(200, Math.min(rightW - dx, totalW * 0.5));
            appMain.style.gridTemplateColumns = `${leftW}px 4px 1fr 4px ${newRight}px`;
          }
        }
        function onUp() {
          handle.classList.remove("dragging");
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      };
    }
    if (dragLeft) dragLeft.addEventListener("mousedown", startDrag(dragLeft, "left"));
    if (dragRight) dragRight.addEventListener("mousedown", startDrag(dragRight, "right"));
  }
  function saveCircuit() {
    try {
      window.circuitSimulator.stateManager.saveState(circuitGraph);
      const originalText = document.getElementById("btn-save").innerHTML;
      const btn = document.getElementById("btn-save");
      btn.textContent = "\u2713 Saved";
      setTimeout(() => {
        btn.innerHTML = originalText;
      }, 1e3);
      console.log("Circuit saved manually!");
    } catch (error) {
      console.error("Failed to save circuit:", error);
      alert("Failed to save circuit");
    }
  }
  function downloadCircuit() {
    try {
      const data = circuitGraph.serialize();
      const state = {
        expId: window.circuitSimulator.stateManager?.expId || "sandbox",
        timestamp: Date.now(),
        circuit: data
      };
      const json = JSON.stringify(state, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `circuit_${state.expId}_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const btn = document.getElementById("btn-download");
      if (btn) {
        const original = btn.innerHTML;
        btn.textContent = "\u2713 Downloaded";
        setTimeout(() => {
          btn.innerHTML = original;
        }, 1e3);
      }
      console.log("Circuit downloaded as JSON.");
    } catch (error) {
      console.error("Failed to download circuit:", error);
      alert("Failed to download circuit state.");
    }
  }
  function loadCircuit() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          const circuitData = data.circuit || data;
          if (!circuitData.components) {
            throw new Error("Invalid circuit file: missing components array");
          }
          canvas.clear();
          circuitGraph.deserialize(circuitData);
          canvas.renderAll();
          const btn = document.getElementById("btn-load");
          if (btn) {
            const original = btn.innerHTML;
            btn.textContent = "\u2713 Loaded";
            setTimeout(() => {
              btn.innerHTML = original;
            }, 1e3);
          }
          console.log(`Circuit loaded from file: ${file.name} (not saved to localStorage)`);
        } catch (error) {
          console.error("Failed to load circuit:", error);
          alert(`Failed to load circuit: ${error.message}`);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }
  function updateStatus() {
    const statusMode = document.getElementById("status-mode");
    const statusCoords = document.getElementById("status-coords");
    const statusZoom = document.getElementById("status-zoom");
    const statusComponents = document.getElementById("status-components");
    if (statusMode) statusMode.textContent = `Mode: ${canvas ? canvas.mode : "Edit"}`;
    if (statusCoords) statusCoords.textContent = "X: 0, Y: 0";
    if (statusZoom) statusZoom.textContent = `Zoom: ${canvas ? Math.round(canvas.zoom * 100) : 100}%`;
    if (statusComponents) statusComponents.textContent = `Components: ${circuitGraph ? circuitGraph.getComponentCount() : 0}`;
  }
  document.addEventListener("DOMContentLoaded", init);
  window.circuitSimulator = {
    get circuit() {
      return circuitGraph;
    },
    get canvas() {
      return canvas;
    },
    get toolbar() {
      return toolbar;
    },
    get propertyPanel() {
      return propertyPanel;
    },
    get simulationControls() {
      return simulationControls;
    },
    testMatrix: testMatrixSolver,
    runDC: function() {
      const solver = new MNASolver(circuitGraph);
      const result = solver.solveDC();
      console.log(solver.getResultsString());
      return result;
    }
  };
  window.gridLab = window.circuitSimulator;
})();
