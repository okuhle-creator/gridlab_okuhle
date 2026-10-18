/**
 * Circuit Gallery Logic
 * Populates the gallery grid with circuit templates dynamically.
 */

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('galleryGrid');
    const searchInput = document.getElementById('searchInput');

    // Registry of all 27 generated circuit images with metadata
    const circuits = [
        { id: 'basic-ee-exp-1', category: 'Basic EE', name: 'Power Factor Correction', desc: 'Circuit demonstrating power factor correction techniques in AC circuits.', img: 'basic-ee-exp-1.png' },
        { id: 'basic-ee-exp-2', category: 'Basic EE', name: 'Superposition Theorem', desc: 'Verification of the Superposition Theorem using multiple independent sources.', img: 'basic-ee-exp-2.png' },
        { id: 'basic-ee-exp-3', category: 'Basic EE', name: 'Thevenin Theorem', desc: 'Verification of Thevenin\'s equivalent circuit model.', img: 'basic-ee-exp-3.png' },
        { id: 'basic-ee-exp-4', category: 'Basic EE', name: 'Transient Response RLC', desc: 'Analysis of transient behavior in a series RLC circuit.', img: 'basic-ee-exp-4.png' },
        { id: 'basic-ee-exp-5', category: 'Basic EE', name: 'Transformer OC/SC Test', desc: 'Open circuit and short circuit testing of a single-phase transformer.', img: 'basic-ee-exp-5.png' },
        { id: 'basic-ee-exp-6', category: 'Basic EE', name: 'Three Phase Connections', desc: 'Star and Delta three-phase power configurations.', img: 'basic-ee-exp-6.png' },
        { id: 'basic-ee-exp-7', category: 'Basic EE', name: 'Transformer Test', desc: 'General transformer load testing circuit.', img: 'basic-ee-exp-7.png' },
    
        { id: 'devices_and_circuits-exp3', preset: 'clipper', category: 'Devices & Circuits', name: 'Diode Clipper', desc: 'Waveform shaping utilizing diode clipping networks.', img: 'devices_and_circuits-exp3--clipper.png' },
        { id: 'devices_and_circuits-exp3', preset: 'full-wave-bridge', category: 'Devices & Circuits', name: 'Full-Wave Bridge Rectifier', desc: 'Standard bridge rectifier for AC to DC conversion.', img: 'devices_and_circuits-exp3--full-wave-bridge.png' },
        { id: 'devices_and_circuits-exp3', preset: 'half-wave', category: 'Devices & Circuits', name: 'Half-Wave Rectifier', desc: 'Simple single-diode AC rectification circuit.', img: 'devices_and_circuits-exp3--half-wave.png' },
    
        { id: 'devices_and_circuits-exp4', preset: 'antilog', category: 'OpAmp Arithmetic', name: 'Antilog Amplifier', desc: 'Operational amplifier configured to provide exponential amplification.', img: 'devices_and_circuits-exp4--antilog.png' },
        { id: 'devices_and_circuits-exp4', preset: 'differentiator', category: 'OpAmp Arithmetic', name: 'Differentiator', desc: 'OpAmp circuit that calculates the derivative of the input signal.', img: 'devices_and_circuits-exp4--differentiator.png' },
        { id: 'devices_and_circuits-exp4', preset: 'integrator', category: 'OpAmp Arithmetic', name: 'Integrator', desc: 'Precision signal integration module.', img: 'devices_and_circuits-exp4--integrator.png' },
        { id: 'devices_and_circuits-exp4', preset: 'log', category: 'OpAmp Arithmetic', name: 'Log Amplifier', desc: 'Logarithmic signal compression using a diode in the feedback loop.', img: 'devices_and_circuits-exp4--log.png' },
        { id: 'devices_and_circuits-exp4', preset: 'subtractor', category: 'OpAmp Arithmetic', name: 'Subtractor', desc: 'Differential amplifier for voltage subtraction.', img: 'devices_and_circuits-exp4--subtractor.png' },
        { id: 'devices_and_circuits-exp4', preset: 'summer', category: 'OpAmp Arithmetic', name: 'Summer', desc: 'Inverting adder circuit combining multiple voltage inputs.', img: 'devices_and_circuits-exp4--summer.png' },
    
        { id: 'devices_and_circuits-exp5', preset: 'inverting', category: 'OpAmp Characteristics', name: 'Inverting Amplifier', desc: 'Basic inverting operational amplifier topology.', img: 'devices_and_circuits-exp5--inverting.png' },
        { id: 'devices_and_circuits-exp5', preset: 'non_inverting', category: 'OpAmp Characteristics', name: 'Non-Inverting Amplifier', desc: 'Basic non-inverting operational amplifier topology.', img: 'devices_and_circuits-exp5--non_inverting.png' },
    
        { id: 'devices_and_circuits-exp6', preset: 'band_pass', category: 'Active Filters', name: 'Band Pass Filter', desc: 'Active frequency filter allowing a specific band of frequencies to pass.', img: 'devices_and_circuits-exp6--band_pass.png' },
        { id: 'devices_and_circuits-exp6', preset: 'high_pass', category: 'Active Filters', name: 'High Pass Filter', desc: 'Active filter that attenuates low frequency signals.', img: 'devices_and_circuits-exp6--high_pass.png' },
        { id: 'devices_and_circuits-exp6', preset: 'low_pass', category: 'Active Filters', name: 'Low Pass Filter', desc: 'Active filter that attenuates high frequency signals.', img: 'devices_and_circuits-exp6--low_pass.png' },
    
        { id: 'sensor_lab-instrumentation', preset: 'instrumentation_amplifier', category: 'Instrumentation', name: 'Instrumentation Amplifier', desc: 'High-precision differential amplifier for sensor signal conditioning.', img: 'sensor_lab-instrumentation--instrumentation_amplifier.png' },
        { id: 'sensor_lab-load_cell', category: 'Sensors', name: 'Load Cell', desc: 'Wheatstone bridge based load cell sensor interface.', img: 'sensor_lab-load_cell.png' },
        { id: 'sensor_lab-lvdt', category: 'Sensors', name: 'LVDT Sensor', desc: 'Linear variable differential transformer interface for positional limits.', img: 'sensor_lab-lvdt.png' },
        { id: 'sensor_lab-rtd', category: 'Sensors', name: 'RTD Sensor', desc: 'Resistance temperature detector with bridge measurement.', img: 'sensor_lab-rtd.png' },
        { id: 'sensor_lab-strain_gauge', category: 'Sensors', name: 'Strain Gauge', desc: 'Mechanical strain measurement via bridge circuit.', img: 'sensor_lab-strain_gauge.png' },
        { id: 'sensor_lab-thermistor', category: 'Sensors', name: 'Thermistor', desc: 'NTC/PTC thermistor interface for temperature logging.', img: 'sensor_lab-thermistor.png' }
    ];

    /**
     * Renders a single circuit card
     */
    function createCard(circuit) {
        const card = document.createElement('div');
        card.className = 'circuit-card';

        // Set the primary link up
        // Add newSession=true by default so clicking a gallery card guarantees a fresh load
        let simUrl = `index.html?expId=${circuit.id}&newSession=true`;
        if (circuit.preset) {
            simUrl += `&preset=${circuit.preset}`;
        }

        card.innerHTML = `
            <div class="card-image-container">
                <img src="circuit_images/${circuit.img}" alt="${circuit.name} Blueprint" class="card-image" loading="lazy" />
            </div>
            <div class="card-details">
                <div class="card-category">
                    <span class="category-dot"></span>
                    ${circuit.category}
                </div>
                <h3 class="card-title">${circuit.name}</h3>
                <p class="card-description">${circuit.desc}</p>
                <a href="${simUrl}" class="card-action">Open in GridLab</a>
            </div>
        `;

        return card;
    }

    /**
     * Renders array of circuits into the grid
     */
    function renderGallery(items) {
        grid.innerHTML = '';
        if (items.length === 0) {
            grid.innerHTML = `<p style="grid-column: 1 / -1; color: var(--text-sub); text-align: center; padding: 2rem;">No circuits matched your search.</p>`;
            return;
        }

        items.forEach(circuit => {
            grid.appendChild(createCard(circuit));
        });
    }

    // Initial render
    renderGallery(circuits);

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            renderGallery(circuits);
            return;
        }

        const filtered = circuits.filter(c => 
            c.name.toLowerCase().includes(query) || 
            c.category.toLowerCase().includes(query) ||
            c.desc.toLowerCase().includes(query)
        );

        renderGallery(filtered);
    });
});
