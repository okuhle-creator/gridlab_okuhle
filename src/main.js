/**
 * Circuit Simulator - Main Entry Point
 * Initializes all modules and wires them together
 */

import { CircuitGraph } from './core/CircuitGraph.js';
import { Canvas } from './ui/Canvas.js';
import { Toolbar } from './ui/Toolbar.js';
import { PropertyPanel } from './ui/PropertyPanel.js';
import { SimulationControls } from './ui/SimulationControls.js';
import { StateManager } from './utils/StateManager.js';
import { testMatrixSolver, MNASolver } from './simulation/index.js';
import { circuitTemplates } from './templates/index.js';

// Global instances
let circuitGraph;
let canvas;
let toolbar;
let propertyPanel;
let simulationControls;

/**
 * Initialize the application
 */
function init() {
    console.log('⚡ GridLab initializing...');

    // Create circuit graph
    circuitGraph = new CircuitGraph();

    // Initialize Canvas
    const svgElement = document.getElementById('circuit-canvas');
    if (svgElement) {
        canvas = new Canvas(svgElement, circuitGraph);
    }

    // Initialize Toolbar
    const toolbarElement = document.getElementById('toolbar');
    if (toolbarElement && canvas) {
        toolbar = new Toolbar(toolbarElement, canvas);
    }

    // Initialize Property Panel
    const propertyPanelElement = document.getElementById('property-panel');
    if (propertyPanelElement && canvas) {
        propertyPanel = new PropertyPanel(propertyPanelElement, canvas);
    }

    // Initialize Simulation Controls
    const simulationPanelElement = document.getElementById('simulation-panel');
    if (simulationPanelElement) {
        simulationControls = new SimulationControls(simulationPanelElement, circuitGraph);
        simulationControls.detectSensorMode(); // Check initial state
    }

    // Expose globals for dynamic reloading logic in presets
    window.circuitGraph = circuitGraph;
    window.canvas = canvas;
    window.propertyPanel = propertyPanel;
    window.simulationControls = simulationControls;

    // Setup header buttons
    setupHeaderButtons();
    setupAboutModal();

    // Setup collapsible panel sections
    setupCollapsibleSections();
    setupPanelDragResize();

    // ----------------------------------------------------
    // State Persistence
    // ----------------------------------------------------

    // Get experiment ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const expId = urlParams.get('expId') || urlParams.get('exp') || 'sandbox'; // Default if not provided
    console.log(`🔌 Initializing session for experiment: ${expId}`);

    const stateManager = new StateManager(expId);

    // Load previous state if available
    const savedState = stateManager.loadState();
    if (savedState && savedState.requirePresetSelection) {
        // Multi-preset experiment, user needs to select which one
        showPresetSelectionModal(savedState.presets, savedState.expId);
    } else if (savedState && savedState.circuit) {
        console.log('Restoring saved simulation state...');
        circuitGraph.deserialize(savedState.circuit);

        // Force UI update
        if (canvas) {
            canvas.renderAll();
        }

        // Show "Change Config" button if this template actually supports multiple presets
        // (Moved unifying logic outside the if/else block below)
    } else {
        // Initial save for new session
        stateManager.saveState(circuitGraph);
    }

    // Unify "Change Config" button display logic
    // This ensures it appears on page reload, regardless of whether state came from localStorage or URL initialization
    const expIdToUse = (savedState && savedState.expId) ? savedState.expId : expId;
    const template = circuitTemplates[expIdToUse] || null;
    if (template && template.presets && template.presets.length > 1) {
        const btnChangeConfig = document.getElementById('btn-change-config');
        if (btnChangeConfig) {
            btnChangeConfig.style.display = 'inline-flex';
            btnChangeConfig.onclick = () => {
                showPresetSelectionModal(template.presets, expIdToUse);
            };
        }
    }

    // Listen for circuit changes (topology)
    circuitGraph.onChange = (type, data) => {
        // Auto-save disabled per user request
        if (simulationControls) {
            simulationControls.detectSensorMode();
        }
        updateStatus(); // Ensure UI status updates
    };

    // Listen for property changes (values)
    if (propertyPanel) {
        propertyPanel.onPropertyChange = (component, prop, value) => {
            // console.log('Property changed:', prop, value);
            // Auto-save disabled per user request
            // stateManager.autosave(circuitGraph);
        };
    }

    // Expose for debugging/external control
    window.circuitSimulator.stateManager = stateManager;

    // Update status bar
    updateStatus();
    
    // Detect sensors on initial load
    if (simulationControls) {
        simulationControls.detectSensorMode();
    }

    console.log('✅ GridLab ready!');
}

/**
 * Setup About GridLab modal
 */
function setupAboutModal() {
    const aboutBtn = document.getElementById('btn-about');
    const aboutOverlay = document.getElementById('about-modal-overlay');
    const closeBtn = document.getElementById('about-modal-close');
    const footerCloseBtn = document.getElementById('btn-about-close');

    if (!aboutOverlay) return;

    function openAbout() {
        aboutOverlay.style.display = 'flex';
    }

    function closeAbout() {
        aboutOverlay.style.display = 'none';
    }

    aboutBtn?.addEventListener('click', openAbout);
    closeBtn?.addEventListener('click', closeAbout);
    footerCloseBtn?.addEventListener('click', closeAbout);

    aboutOverlay.addEventListener('click', (e) => {
        if (e.target === aboutOverlay) {
            closeAbout();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && aboutOverlay.style.display === 'flex') {
            closeAbout();
        }
    });
}

/**
 * Setup header button actions
 */
function setupHeaderButtons() {
    // New circuit
    document.getElementById('btn-new')?.addEventListener('click', () => {
        if (circuitGraph.getComponentCount() > 0) {
            if (confirm('Clear current circuit? All unsaved changes will be lost.')) {
                canvas.clear();
            }
        }
    });

    // Save circuit
    document.getElementById('btn-save')?.addEventListener('click', () => {
        saveCircuit();
    });

    // Download circuit state as JSON file
    document.getElementById('btn-download')?.addEventListener('click', () => {
        downloadCircuit();
    });

    // Load circuit from JSON file
    document.getElementById('btn-load')?.addEventListener('click', () => {
        loadCircuit();
    });

    // Export circuit as high-quality image (PNG)
    document.getElementById('btn-export-image')?.addEventListener('click', () => {
        if (canvas) {
            // Default to PNG as requested by user
            canvas.exportAsImage('png');

            // Visual feedback
            const btn = document.getElementById('btn-export-image');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
            setTimeout(() => { btn.innerHTML = originalHTML; }, 1500);
        }
    });
}

/**
 * Shows the preset selection modal
 */
function showPresetSelectionModal(presets, expId) {
    const overlay = document.getElementById('preset-modal-overlay');
    const grid = document.getElementById('preset-grid');
    if (!overlay || !grid) return;

    // Clear existing
    grid.innerHTML = '';

    presets.forEach(preset => {
        const card = document.createElement('div');
        card.className = 'preset-card';
        card.innerHTML = `
            <h3>${preset.name}</h3>
            <p>${preset.description || ''}</p>
        `;
        card.onclick = () => {
            window.loadPreset(preset.presetId, expId);
            overlay.style.display = 'none';
        };
        grid.appendChild(card);
    });

    overlay.style.display = 'flex';
}

/**
 * Deep reset and load a specific preset without page reload
 */
window.loadPreset = function (presetId, currentExpId) {
    console.log(`Loading preset: ${presetId}`);

    // Update URL without reload
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('preset', presetId);
    if (currentExpId) urlParams.set('expId', currentExpId);

    const newUrl = window.location.pathname + '?' + urlParams.toString();
    window.history.replaceState({}, '', newUrl);

    // Deep reset of simulation controls and buffers
    if (window.simulationControls) {
        // Make sure any running simulation is stopped
        if (window.simulationControls.running) {
            window.simulationControls.toggleSimulation();
        }
        window.simulationControls.hideScope();
        window.simulationControls.chart?.destroy();
        window.simulationControls.chart = null;
        document.getElementById('chart-container').style.display = 'none';
        document.getElementById('output-content').innerHTML = '';
        document.getElementById('output-panel').classList.add('collapsed');
    }

    // Reset circuit graph
    if (window.circuitGraph) {
        window.circuitGraph.clear();
    }

    if (window.canvas) {
        window.canvas.clear();
    }

    // Clear property panel
    if (window.propertyPanel) {
        window.propertyPanel.showEmpty();
    }

    // Reload state which will now pick up the preset from the URL
    // Need to use the global stateManager if available or create a new one
    const sm = window.circuitSimulator.stateManager || new window.StateManager(currentExpId);

    // Force reset local storage for this session so we start clean from the preset
    localStorage.removeItem(sm.storageKey);

    const newState = sm.loadState();

    if (newState && newState.circuit) {
        window.circuitGraph.deserialize(newState.circuit);

        // Force SVG recalculations
        for (const component of window.circuitGraph.components.values()) {
            component.updateElement();
        }

        if (window.canvas) {
            // Slight delay allows DOM to clear nodes before re-appending
            setTimeout(() => {
                window.canvas.renderAll();
                console.log("Canvas re-rendered with new preset.");
            }, 50);
        }

        // Ensure "Change Config" button is visible
        const template = circuitTemplates[currentExpId] || null;
        if (template && template.presets && template.presets.length > 1) {
            const btnChangeConfig = document.getElementById('btn-change-config');
            if (btnChangeConfig) {
                btnChangeConfig.style.display = 'inline-flex';
                btnChangeConfig.onclick = () => {
                    showPresetSelectionModal(template.presets, currentExpId);
                };
            }
        }

    }

    // Auto-open Property panel by default when preset is selected
    document.getElementById('property-panel').classList.remove('collapsed');
};

/**
 * Setup collapsible sections in the right panel
 */
function setupCollapsibleSections() {
    const headers = document.querySelectorAll('.collapsible-header');

    headers.forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.collapsible-section');
            // Just toggle collapsed class - CSS handles the rest
            section.classList.toggle('collapsed');
        });
    });
}

/**
 * Setup drag-to-resize handles for left toolbar and right panel
 */
function setupPanelDragResize() {
    const appMain = document.querySelector('.app-main');
    const dragLeft = document.getElementById('drag-left');
    const dragRight = document.getElementById('drag-right');

    if (!appMain) return;

    function startDrag(handle, side) {
        return function (e) {
            e.preventDefault();
            handle.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const startX = e.clientX;
            const mainRect = appMain.getBoundingClientRect();
            const cols = window.getComputedStyle(appMain).gridTemplateColumns.split(/\s+/);
            const leftW = parseFloat(cols[0]);
            const rightW = parseFloat(cols[4]);

            function onMove(ev) {
                const dx = ev.clientX - startX;
                const totalW = mainRect.width;

                if (side === 'left') {
                    const newLeft = Math.max(60, Math.min(leftW + dx, totalW * 0.4));
                    appMain.style.gridTemplateColumns =
                        `${newLeft}px 4px 1fr 4px ${rightW}px`;
                } else {
                    const newRight = Math.max(200, Math.min(rightW - dx, totalW * 0.5));
                    appMain.style.gridTemplateColumns =
                        `${leftW}px 4px 1fr 4px ${newRight}px`;
                }
            }

            function onUp() {
                handle.classList.remove('dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
    }

    if (dragLeft) dragLeft.addEventListener('mousedown', startDrag(dragLeft, 'left'));
    if (dragRight) dragRight.addEventListener('mousedown', startDrag(dragRight, 'right'));
}

/**
 * Save circuit to local storage (or file)
 */
/**
 * Save circuit to local storage via StateManager
 */
function saveCircuit() {
    try {
        // Force immediate save
        window.circuitSimulator.stateManager.saveState(circuitGraph);

        // Visual feedback
        const originalText = document.getElementById('btn-save').innerHTML;
        const btn = document.getElementById('btn-save');
        btn.textContent = '✓ Saved';
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 1000);

        console.log('Circuit saved manually!');
    } catch (error) {
        console.error('Failed to save circuit:', error);
        alert('Failed to save circuit');
    }
}

/**
 * Download current circuit state as a JSON file.
 * This does NOT affect localStorage or templates.
 */
function downloadCircuit() {
    try {
        const data = circuitGraph.serialize();
        const state = {
            expId: window.circuitSimulator.stateManager?.expId || 'sandbox',
            timestamp: Date.now(),
            circuit: data
        };

        const json = JSON.stringify(state, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `circuit_${state.expId}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Visual feedback
        const btn = document.getElementById('btn-download');
        if (btn) {
            const original = btn.innerHTML;
            btn.textContent = '✓ Downloaded';
            setTimeout(() => { btn.innerHTML = original; }, 1000);
        }

        console.log('Circuit downloaded as JSON.');
    } catch (error) {
        console.error('Failed to download circuit:', error);
        alert('Failed to download circuit state.');
    }
}

/**
 * Load circuit from a JSON file.
 * Deserializes onto the canvas for immediate viewing.
 * Does NOT save to localStorage — the user must click Save explicitly.
 */
function loadCircuit() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);

                // Accept either { circuit: { components, wires } } or { components, wires } directly
                const circuitData = data.circuit || data;

                if (!circuitData.components) {
                    throw new Error('Invalid circuit file: missing components array');
                }

                // Clear existing circuit and load new state
                canvas.clear();
                circuitGraph.deserialize(circuitData);
                canvas.renderAll();

                // Visual feedback
                const btn = document.getElementById('btn-load');
                if (btn) {
                    const original = btn.innerHTML;
                    btn.textContent = '✓ Loaded';
                    setTimeout(() => { btn.innerHTML = original; }, 1000);
                }

                console.log(`Circuit loaded from file: ${file.name} (not saved to localStorage)`);
            } catch (error) {
                console.error('Failed to load circuit:', error);
                alert(`Failed to load circuit: ${error.message}`);
            }
        };
        reader.readAsText(file);
    });

    input.click();
}

/**
 * Update status bar
 */
function updateStatus() {
    const statusMode = document.getElementById('status-mode');
    const statusCoords = document.getElementById('status-coords');
    const statusZoom = document.getElementById('status-zoom');
    const statusComponents = document.getElementById('status-components');

    if (statusMode) statusMode.textContent = `Mode: ${canvas ? canvas.mode : 'Edit'}`;
    if (statusCoords) statusCoords.textContent = 'X: 0, Y: 0'; // Dynamic
    if (statusZoom) statusZoom.textContent = `Zoom: ${canvas ? Math.round(canvas.zoom * 100) : 100}%`;
    if (statusComponents) statusComponents.textContent = `Components: ${circuitGraph ? circuitGraph.getComponentCount() : 0}`;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Export for debugging
window.circuitSimulator = {
    get circuit() { return circuitGraph; },
    get canvas() { return canvas; },
    get toolbar() { return toolbar; },
    get propertyPanel() { return propertyPanel; },
    get simulationControls() { return simulationControls; },
    testMatrix: testMatrixSolver,
    runDC: function () {
        const solver = new MNASolver(circuitGraph);
        const result = solver.solveDC();
        console.log(solver.getResultsString());
        return result;
    }
};

window.gridLab = window.circuitSimulator;

