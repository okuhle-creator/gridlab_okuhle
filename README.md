# GridLab

### Interactive Electrical Engineering Laboratory

A professional, browser-based electrical circuit simulation and analysis tool engineered for educational instruction, laboratory experimentation, and circuit verification. Built with **zero runtime dependencies** — pure HTML, CSS, and modern JavaScript using standard ES modules. Supports DC, AC, and transient analysis with real-time waveform visualization, dual-trace oscilloscope, and pre-built experiment templates across Basic Electrical Engineering, Devices & Circuits, Active Filters, and Sensors.

---

## How It Works

### Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  Browser (index.html)                                │
│  ┌────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │Toolbar │  │  SVG Canvas  │  │  Property Panel  │  │
│  │ (keys) │  │ (drag/wire)  │  │  (edit values)   │  │
│  └────────┘  └──────┬───────┘  └──────────────────┘  │
│                     │                                │
│  ┌──────────────────▼───────────────────────────┐    │
│  │           CircuitGraph (data model)          │    │
│  │     components: Map<id, Component>           │    │
│  │     wires: Map<id, Wire>                     │    │
│  └──────────────────┬───────────────────────────┘    │
│                     │                                │
│  ┌──────────────────▼───────────────────────────┐    │
│  │         Simulation Engine                    │    │
│  │  ┌─────────┐  ┌───────────┐  ┌───────────┐   │    │
│  │  │MNASolver│  │Transient  │  │ Complex   │   │    │
│  │  │(DC + AC)│  │  Solver   │  │ + Matrix  │   │    │
│  │  └─────────┘  └───────────┘  └───────────┘   │    │
│  └──────────────────┬───────────────────────────┘    │
│                     │                                │
│  ┌──────────────────▼───────────────────────────┐    │
│  │       Visualization                          │    │
│  │  SimpleChart · OscilloscopeChart             │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

### Initialization Flow (`main.js`)

1. **Parse URL** — Reads `expId` from `?expId=<id>` (defaults to `sandbox`).
2. **StateManager** — Checks `localStorage` for saved state (`sim_state_<expId>`).
3. **Template Lookup** — If no saved state, looks up `expId` in the template registry.
4. **Preset Handling** — If the template has multiple presets (e.g., 6 op-amp configs):
   - Checks URL for `?preset=<presetId>` → loads that specific preset.
   - If no preset specified and multiple exist → shows the **Preset Selection Modal**.
   - If only one preset → auto-loads it.
5. **Deserialize** — Populates `CircuitGraph` with components and wires.
6. **Render** — SVG canvas draws all components; toolbar and property panel initialize.

### State Persistence

| Action | Behavior |
|--------|----------|
| **Page load** | Checks `localStorage` → falls back to template |
| **Manual Save** (`Ctrl+S` / Save button) | Writes current circuit to `localStorage` |
| **`?newSession=true`** | Clears saved state, forces fresh template load |
| **Reset** | `localStorage.removeItem('sim_state_<expId>')` + reload |

> Templates are **never mutated** — they act as immutable defaults. Only user-saved states go to `localStorage`.

---

## Components

15+ electrical components, each rendered as SVG with configurable properties:

| Component | Type Key | Shortcut | Terminals | Key Properties |
|-----------|----------|:--------:|-----------|----------------|
| Voltage Source | `voltage_source` | `V` | positive, negative | voltage, type (ac/dc), frequency, phase |
| Ground | `ground` | `G` | ref | — |
| Junction | `junction` | `J` | node | — |
| Resistor | `resistor` | `R` | left, right | resistance (Ω) |
| Capacitor | `capacitor` | `C` | left, right | capacitance (F) |
| Inductor | `inductor` | `L` | left, right | inductance (H) |
| Ammeter | `ammeter` | `A` | positive, negative | internal 0 V source |
| Voltmeter | `voltmeter` | `M` | positive, negative | high impedance |
| Wattmeter | `wattmeter` | `W` | M, L, C, V | 4-terminal power meter |
| Transformer | `transformer` | `T` | p1, p2, s1, s2 | Req, Xeq, Rc, Xm, turns ratio |
| 3-Phase Source | `three_phase_source` | `3` | R, Y, B, N | balanced Y-connected supply |
| Load | `load` | — | in, out | R–L series load (0–125% rated) |
| Oscilloscope | `oscilloscope` | — | ch1±, ch2± | 2-channel differential |
| Diode | `diode` | `D` | anode, cathode | Is, n, Vt |
| Op-Amp | `opamp` | `O` | in_pos, in_neg, out | A_OL, GBP, Rin, Rout, CMRR, V_sat |

### Adding a New Component

1. Create `src/components/MyComponent.js` extending `Component`.
2. Define `type`, `shortcut`, terminals, SVG rendering, and property descriptors.
3. Import and add to `COMPONENTS` array in `src/components/index.js`.

---

## Analysis Modes

### DC Analysis
Steady-state operating point via **Modified Nodal Analysis (MNA)**. Solves `[G][V] = [I]` using LU decomposition. Capacitors → open, inductors → short.

### AC Analysis
Complex phasor-domain solution at a single frequency. Builds a complex admittance matrix, solves for node voltages as complex phasors. Computes RMS voltages, currents, and power readings for all instruments.

### Transient Analysis
Time-domain integration using **Backward Euler companion models**:
- Capacitor → Norton equivalent (current source + conductance)
- Inductor → Norton equivalent (current source + conductance)

Configurable: simulation time, time step, and frequency. Results feed into the waveform chart and oscilloscope in real-time.

---

## Visualization

### Waveform Chart (`SimpleChart.js`)
Canvas-rendered time-domain plots with:
- Auto-scaling Y-axis
- Labeled X-axis (time in ms/µs)
- Color-coded legend per trace
- Zoom and pan support

### Oscilloscope (`OscilloscopeChart.js`)
Emulates a real 2-channel oscilloscope:
- Per-channel enable/disable
- Color-coded traces (CH1 = cyan, CH2 = amber)
- Crosshair cursor with readout
- Adaptive units: mV/V, mA/A, ms/µs
- Supports DC flat-line, AC phasor reconstruction, and transient time-series

---

## Template System

Templates define pre-built circuits that load automatically via URL. Each template is a JavaScript object containing components and wires.

### Single-Circuit Templates

For experiments with one configuration (e.g., Superposition Theorem):

```js
export const my_template = {
    expId: "basic-ee-exp-2",
    components: [ /* ... */ ],
    wires: [ /* ... */ ]
};
```

### Multi-Preset Templates

For experiments with multiple configurations (e.g., Op-Amp Arithmetics with 6 circuits):

```js
export const opamp_arithmetics_template = {
    expId: "devices_and_circuits-exp4",
    name: "OpAmp Arithmetics",
    presets: [
        {
            presetId: "summer",
            name: "Summer",
            description: "Op-Amp configured as a summing amplifier.",
            circuit: { components: [...], wires: [...] }
        },
        {
            presetId: "subtractor",
            name: "Subtractor",
            // ...
        }
        // ... more presets
    ]
};
```

When a multi-preset template loads without a `?preset=` parameter, the simulator displays a **selection modal** with cards for each preset.

### Template Registry (`src/templates/index.js`)

Maps `expId` strings to template objects:

```js
export const circuitTemplates = {
    "basic-ee-exp-1": power_factor_correction_template,
    "basic-ee-exp-2": verification_of_superposition_theorem_template,
    // ...
    "devices_and_circuits-exp4": opamp_arithmetics_template,
    "devices_and_circuits-exp5": opamp_characteristics_template,
    "devices_and_circuits-exp6": active_filters_template
};
```

### Current Templates

| Template ID | Experiment | Lab | Type | Presets |
|-------------|------------|-----|------|:-------:|
| `basic-ee-exp-1` | Power Factor Correction | Basic EE | AC | 1 |
| `basic-ee-exp-2` | Superposition Theorem | Basic EE | DC | 1 |
| `basic-ee-exp-3` | Thévenin's Theorem | Basic EE | DC | 1 |
| `basic-ee-exp-4` | Transient Response (RLC) | Basic EE | Transient | 1 |
| `basic-ee-exp-5` | OC & SC Test (Transformer) | Basic EE | AC | 2 |
| `basic-ee-exp-6` | Three-Phase Connections | Basic EE | AC | 2 |
| `basic-ee-exp-7` | No-Load & Load Test (Transformer) | Basic EE | AC | 1 |
| `devices_and_circuits-exp3` | Diode Rectifiers | DnC | Transient | 3 |
| `devices_and_circuits-exp4` | Op-Amp Arithmetics | DnC | DC | 6 |
| `devices_and_circuits-exp5` | Op-Amp Characteristics | DnC | Transient | 2 |
| `devices_and_circuits-exp6` | Active Filters | DnC | AC | 3 |
| `sensor_lab-exp1` | Active Filters (LP + HP) | Sensor Lab | AC | 2 |
| `sensor_lab-exp2` | Op-Amp Applications | Sensor Lab | DC | 4 |
| `sensor_lab-instrumentation` | Instrumentation Amplifier | Sensor Lab | DC | 1 |
| `sensor_lab-thermistor` | Thermistor Characteristics | Sensor Lab | Sensor | 1 |
| `sensor_lab-rtd` | RTD (Pt-100) Characteristics | Sensor Lab | Sensor | 1 |
| `sensor_lab-lvdt` | LVDT Displacement | Sensor Lab | Sensor | 1 |
| `sensor_lab-strain_gauge` | Strain Gauge | Sensor Lab | Sensor | 1 |
| `sensor_lab-load_cell` | Load Cell Characteristics | Sensor Lab | Sensor | 1 |

---

## Cross-App Integration

This simulator is designed to work alongside the **[Bhilai EE Labs Guide](https://bhilaee-labs.vercel.app)** (a Next.js app that provides experiment documentation).

### How Routing Works

```
Labs Guide (MyApp2)                          Simulator (MyApp1)
┌──────────────────────┐                    ┌────────────────────────┐
│ ExperimentLayout.js  │                    │  main.js               │
│                      │                    │                        │
│ simulationId from    │    HTTP redirect   │  ?expId=xxx            │
│ exp JSON meta ──────►├───────────────────►│  ?preset=yyy           │
│                      │                    │  ?newSession=true      │
│ "Launch Simulator"   │                    │                        │
│ button constructs:   │                    │  StateManager looks up │
│ {SIMULATOR_URL}      │                    │  circuitTemplates[xxx] │
│   ?expId=xxx         │                    │  and loads the circuit │
│   &newSession=true   │                    │                        │
└──────────────────────┘                    └────────────────────────┘
```

### "Back to Lab" Button

The simulator reads `GUIDE_URL` from `config.js` to construct a link back to the experiment page in the Labs Guide:

```js
// config.js
const CONFIG = {
    GUIDE_URL: "https://bhilaee-labs.vercel.app"
};
```

---

## URL Parameters

| Parameter | Example | Purpose |
|-----------|---------|---------|
| `expId` | `?expId=basic-ee-exp-4` | Load a specific experiment template |
| `preset` | `&preset=summer` | Load a specific preset within a multi-preset template |
| `newSession` | `&newSession=true` | Clear saved state and reload from template |

**Full example:**
```
https://bhilaee-simulator.vercel.app/?expId=devices_and_circuits-exp4&preset=summer&newSession=true
```

---

## Save / Load Circuits

- **Save to Browser** — Persists the current circuit to `localStorage` (per `expId`).
- **Download JSON** — Exports the circuit as a JSON file to disk.
- **Upload JSON** — Imports a circuit from a JSON file.
- **Change Configuration** — For multi-preset experiments, a header button re-opens the preset selection modal.

---

## Project Structure

```
├── index.html                  # App shell (toolbar, canvas, panels, modals)
├── index.css                   # Dark theme, layout, component styles
├── config.js                   # Runtime config (GUIDE_URL for cross-app link)
└── src/
    ├── main.js                 # Entry point — init, state loading, preset modal
    ├── core/
    │   ├── Component.js        # Base class, Terminal, formatValue
    │   ├── CircuitGraph.js     # Graph data model (components + wires)
    │   ├── Wire.js             # Wire routing and SVG rendering
    │   └── Node.js             # Electrical node abstraction
    ├── components/
    │   ├── index.js            # Component registry & factory
    │   ├── Resistor.js         ├── Capacitor.js
    │   ├── Inductor.js         ├── VoltageSource.js
    │   ├── Ground.js           ├── Junction.js
    │   ├── Ammeter.js          ├── Voltmeter.js
    │   ├── Wattmeter.js        ├── Transformer.js
    │   ├── ThreePhaseSource.js ├── Load.js
    │   ├── Oscilloscope.js     ├── Diode.js
    │   └── OpAmp.js
    ├── simulation/
    │   ├── index.js            # Public exports
    │   ├── MNASolver.js        # DC & AC solver (MNA + complex phasors)
    │   ├── TransientSolver.js  # Time-domain solver (Backward Euler)
    │   ├── Complex.js          # Complex number & matrix arithmetic
    │   └── Matrix.js           # Real matrix utilities (LU decomposition)
    ├── templates/
    │   ├── index.js                                # Template registry
    │   ├── power_factor_correction.js              # Basic EE Exp 1
    │   ├── verification_of_superposition_theorem.js # Basic EE Exp 2
    │   ├── verification_of_thevenin_theorem.js      # Basic EE Exp 3
    │   ├── transient_response_rlc.js               # Basic EE Exp 4
    │   ├── oc_sc_test_single_phase_transformer.js   # Basic EE Exp 5
    │   ├── three_phase_connections.js               # Basic EE Exp 6
    │   ├── transformer_test.js                      # Basic EE Exp 7
    │   ├── diode_rectifiers.js                      # DnC Exp 3
    │   ├── opamp_arithmetics.js                     # DnC Exp 4
    │   ├── opamp_characteristics.js                 # DnC Exp 5
    │   ├── active_filters.js                        # DnC Exp 6 / Sensor Exp 1
    │   ├── instrumentation_amplifier.js             # Sensor Lab
    │   ├── thermistor.js                            # Sensor Lab Exp 3
    │   ├── rtd.js                                   # Sensor Lab Exp 4
    │   ├── lvdt.js                                  # Sensor Lab Exp 7
    │   ├── strain_gauge.js                          # Sensor Lab Exp 8
    │   └── load_cell.js                             # Sensor Lab Exp 9
    ├── ui/
    │   ├── Canvas.js               # SVG canvas — drag, drop, select, wire
    │   ├── Toolbar.js              # Component palette & keyboard shortcuts
    │   ├── PropertyPanel.js        # Selected-component property editor
    │   ├── SimulationControls.js   # Run/Stop/Reset, results, chart feed
    │   ├── SimpleChart.js          # Canvas waveform chart
    │   └── OscilloscopeChart.js    # 2-channel oscilloscope overlay
    └── utils/
        └── StateManager.js         # localStorage persistence & template loading
```

---

## Getting Started

```bash
# Serve with any static file server (no build step required)
npx -y http-server . -p 3001

# Or use Python
python -m http.server 3001
```

Open `http://localhost:3001` in your browser.

### Quick Start

1. **Place components** — Click toolbar buttons or press keyboard shortcuts, then click the canvas.
2. **Wire them up** — Click a terminal (dot) then click another terminal to draw a wire.
3. **Add a Ground** — Every circuit needs at least one ground reference.
4. **Run simulation** — Select analysis type (DC/AC/Transient), configure parameters, click **Run**.
5. **View results** — Numeric output in the panel, waveforms in chart/oscilloscope.

### Load an Experiment

```
http://localhost:3001/?expId=basic-ee-exp-4
```

---

## Technology Stack

- **Pure HTML / CSS / JavaScript** — no build step, no frameworks, no bundlers
- **ES6 Modules** — native browser module loading via `<script type="module">`
- **SVG** — component rendering and interactive canvas
- **Canvas API** — waveform chart and oscilloscope rendering
- **Deployed on Vercel** as a static site

---

## License

MIT
