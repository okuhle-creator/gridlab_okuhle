/**
 * Canvas.js - Main circuit canvas
 * 
 * Handles:
 * - Component rendering and placement
 * - Wire drawing
 * - Selection and movement
 * - Zoom and pan
 */

import { Wire } from '../core/Wire.js';

export class Canvas {
    /**
     * @param {SVGSVGElement} svgElement - The main SVG canvas
     * @param {CircuitGraph} circuitGraph - Circuit topology manager
     */
    constructor(svgElement, circuitGraph) {
        this.svg = svgElement;
        this.circuit = circuitGraph;

        // Get layer groups
        this.componentsLayer = svgElement.querySelector('#components-layer');
        this.wiresLayer = svgElement.querySelector('#wires-layer');
        this.interactionLayer = svgElement.querySelector('#interaction-layer');

        // View state
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.gridSize = 20;

        // Interaction state
        this.mode = 'select'; // 'select', 'place', 'wire'
        this.selectedComponent = null;
        this.selectedWire = null;
        this.dragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.dragOffset = { x: 0, y: 0 };

        // Panning state
        this.panning = false;
        this.panStart = { x: 0, y: 0 };
        this.panStartOffset = { x: 0, y: 0 };
        this.spaceHeld = false;

        // Component placement
        this.placingComponent = null;
        this.placingComponentClass = null;

        // Wire drawing - supports both click-to-connect and drag-to-connect
        this.pendingWireTerminal = null; // First terminal clicked (for click-to-connect)
        this.draggingWire = null; // Wire being drawn by dragging
        this.wirePreview = null; // Preview element for drag mode

        // Wire segment dragging
        this.draggingWireSegment = null; // { wire, type: 'segment'|'waypoint', index }

        // Callbacks
        this.onSelectionChange = null;
        this.onComponentCountChange = null;

        this.setupEventListeners();
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Mouse events
        this.svg.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.svg.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.svg.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.svg.addEventListener('mouseleave', this.handleMouseUp.bind(this));
        this.svg.addEventListener('dblclick', this.handleDoubleClick.bind(this));

        // Mouse wheel zoom
        this.svg.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

        // Keyboard events
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.spaceHeld = false;
                this.svg.style.cursor = '';
            }
        });

        // Prevent context menu on canvas
        this.svg.addEventListener('contextmenu', (e) => e.preventDefault());

        // Zoom controls
        document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.zoomIn());
        document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.zoomOut());
        document.getElementById('btn-zoom-fit')?.addEventListener('click', () => this.zoomFit());
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
        // Middle-click or right-click → start panning
        if (event.button === 1 || event.button === 2) {
            event.preventDefault();
            this.panning = true;
            this.panStart = { x: event.clientX, y: event.clientY };
            this.panStartOffset = { x: this.panX, y: this.panY };
            this.svg.style.cursor = 'grabbing';
            return;
        }

        if (event.button !== 0) return; // Left click only from here

        // Space + left-click → start panning
        if (this.spaceHeld) {
            this.panning = true;
            this.panStart = { x: event.clientX, y: event.clientY };
            this.panStartOffset = { x: this.panX, y: this.panY };
            this.svg.style.cursor = 'grabbing';
            return;
        }

        const pos = this.getMousePosition(event);
        const snapped = this.snapToGrid(pos.x, pos.y);

        // Check if clicking on a terminal
        const terminalHit = this.circuit.findTerminalAt(pos.x, pos.y);
        if (terminalHit) {
            this.handleTerminalClick(terminalHit.terminal);
            return;
        }

        // If we were waiting for second terminal, cancel
        if (this.pendingWireTerminal) {
            this.cancelWireDrawing();
        }

        // Check if clicking on a component
        const component = this.circuit.findComponentAt(pos.x, pos.y);
        if (component) {
            this.selectComponent(component);
            this.startDragging(component, pos);
            return;
        }

        // Check if clicking on a wire
        const wire = this.circuit.findWireAt(pos.x, pos.y);
        if (wire) {
            this.selectWire(wire);

            // Start dragging the wire's bend point
            this.draggingWireSegment = { wire };
            return;
        }

        // Clicked on empty space - deselect
        this.deselectAll();
    }

    /**
     * Handle mouse move
     */
    handleMouseMove(event) {
        // Panning
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

        // Update status bar coordinates
        const statusCoords = document.getElementById('status-coords');
        if (statusCoords) {
            statusCoords.textContent = `X: ${Math.round(pos.x)}, Y: ${Math.round(pos.y)}`;
        }

        // Dragging component
        if (this.dragging && this.selectedComponent) {
            const newX = snapped.x + this.dragOffset.x;
            const newY = snapped.y + this.dragOffset.y;
            this.selectedComponent.moveTo(newX, newY);

            // Update connected wires
            this.updateConnectedWires(this.selectedComponent);
        }

        // Dragging wire bend point (horizontal only)
        if (this.draggingWireSegment) {
            this.draggingWireSegment.wire.setBendX(snapped.x);
        }

        // Dragging wire (preview follows cursor)
        if (this.draggingWire) {
            this.draggingWire.updatePreview(pos.x, pos.y);
        }

        // Placing component (following cursor)
        if (this.placingComponent) {
            this.placingComponent.moveTo(snapped.x, snapped.y);
        }
    }

    /**
     * Handle mouse up
     */
    handleMouseUp(event) {
        // End panning
        if (this.panning) {
            this.panning = false;
            this.svg.style.cursor = this.spaceHeld ? 'grab' : '';
            return;
        }

        const pos = this.getMousePosition(event);

        // End dragging component
        if (this.dragging) {
            this.dragging = false;
        }

        // End dragging wire segment
        if (this.draggingWireSegment) {
            this.draggingWireSegment = null;
        }

        // Complete drag-wire if active
        if (this.draggingWire) {
            const terminalHit = this.circuit.findTerminalAt(pos.x, pos.y);
            if (terminalHit && terminalHit.terminal !== this.draggingWire.startTerminal) {
                // Complete the wire via drag
                this.draggingWire.setEndTerminal(terminalHit.terminal);
                this.circuit.addWire(this.draggingWire);

                // Replace preview with final wire
                if (this.wirePreview) {
                    this.wiresLayer.removeChild(this.wirePreview);
                }
                const wireElement = this.draggingWire.render();
                this.wiresLayer.appendChild(wireElement);

                // Clear all wire drawing state (both click and drag)
                this.cancelWireDrawing();
            }
            // If not dropped on a valid terminal, keep the click-to-connect active
            // The user can still click a second terminal
        }

        // Place component
        if (this.placingComponent) {
            this.circuit.addComponent(this.placingComponent);
            this.updateComponentCount();
            this.selectComponent(this.placingComponent);
            this.placingComponent = null;
            this.placingComponentClass = null;
            this.mode = 'select';
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
        // Mouse position relative to the SVG container
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Determine zoom direction
        const zoomFactor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        const newZoom = Math.max(0.1, Math.min(this.zoom * zoomFactor, 5));

        // Zoom-to-point: adjust pan so the point under the cursor stays fixed
        this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
        this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
        this.zoom = newZoom;

        this.updateZoom();
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyDown(event) {
        // Don't handle if typing in input
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') {
            return;
        }

        switch (event.key) {
            case ' ':
                if (!this.spaceHeld) {
                    event.preventDefault();
                    this.spaceHeld = true;
                    this.svg.style.cursor = 'grab';
                }
                break;
            case 'Delete':
            case 'Backspace':
                this.deleteSelected();
                break;
            case 'Escape':
                this.cancelPlacement();
                this.cancelWireDrawing();
                this.deselectAll();
                break;
            case 'r':
            case 'R':
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
        // Cancel any existing placement
        this.cancelPlacement();

        // Create new component at center of visible area
        const rect = this.svg.getBoundingClientRect();
        const centerX = (rect.width / 2 - this.panX) / this.zoom;
        const centerY = (rect.height / 2 - this.panY) / this.zoom;
        const snapped = this.snapToGrid(centerX, centerY);

        this.placingComponent = new ComponentClass(snapped.x, snapped.y);
        this.placingComponentClass = ComponentClass;
        this.mode = 'place';

        // Render and add to canvas
        const element = this.placingComponent.render();
        element.style.opacity = '0.7';
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
        this.mode = 'select';
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
            // First click - store terminal for click-to-connect
            this.pendingWireTerminal = terminal;
            this.mode = 'wire';
            this.updateStatusMode();

            // Highlight the selected terminal
            if (terminal.element) {
                terminal.element.classList.add('terminal-selected');
            }

            // Also start drag-wire for drag-to-connect
            this.draggingWire = new Wire(terminal, null);
            this.wirePreview = this.draggingWire.render(true);
            this.wiresLayer.appendChild(this.wirePreview);
        } else {
            // Second click - complete the wire via click-to-connect
            if (terminal !== this.pendingWireTerminal) {
                // Create wire between terminals
                const wire = new Wire(this.pendingWireTerminal, terminal);
                this.circuit.addWire(wire);

                // Render wire
                const wireElement = wire.render();
                this.wiresLayer.appendChild(wireElement);
            }

            // Clear pending state
            this.cancelWireDrawing();
        }
    }

    /**
     * Cancel wire drawing (both click and drag modes)
     */
    cancelWireDrawing() {
        // Clear click-to-connect state
        if (this.pendingWireTerminal && this.pendingWireTerminal.element) {
            this.pendingWireTerminal.element.classList.remove('terminal-selected');
        }
        this.pendingWireTerminal = null;

        // Clear drag-to-connect state
        if (this.wirePreview && this.wirePreview.parentNode) {
            this.wirePreview.parentNode.removeChild(this.wirePreview);
        }
        this.draggingWire = null;
        this.wirePreview = null;

        this.mode = 'select';
        this.updateStatusMode();
    }

    /**
     * Start a wire from a junction point on an existing wire (for parallel circuits)
     * Creates a virtual terminal at the click position
     */
    startWireFromJunction(existingWire, snappedPos) {
        // Create a virtual junction terminal with required methods
        const junctionTerminal = {
            id: `junction_${Date.now()}`,
            x: snappedPos.x,
            y: snappedPos.y,
            isJunction: true,
            connectedWire: existingWire,
            connectedWires: [],
            // Required Terminal interface methods
            getPosition: function () { return { x: this.x, y: this.y }; },
            connect: function (wire) { this.connectedWires.push(wire); },
            disconnect: function (wire) {
                const idx = this.connectedWires.indexOf(wire);
                if (idx >= 0) this.connectedWires.splice(idx, 1);
            }
        };

        // Create new wire starting at junction
        const newWire = new Wire(junctionTerminal, null);
        newWire.isFromJunction = true;
        newWire.junctionWire = existingWire;

        // Start drag mode for the new wire
        this.draggingWire = newWire;
        this.mode = 'wire';
        this.updateStatusMode();

        // Create preview
        this.wirePreview = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.wirePreview.classList.add('wire-preview');
        this.wiresLayer.appendChild(this.wirePreview);

        // Draw junction dot
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', snappedPos.x);
        dot.setAttribute('cy', snappedPos.y);
        dot.setAttribute('r', 5);
        dot.setAttribute('fill', '#3fb950');
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
            this.onSelectionChange('component', component);
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
            this.onSelectionChange('wire', wire);
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
        // Clear SVG layers (visuals only)
        this.componentsLayer.innerHTML = '';
        this.wiresLayer.innerHTML = '';
        this.interactionLayer.innerHTML = '';

        // Render components
        for (const component of this.circuit.components.values()) {
            this.renderComponent(component);
        }

        // Render wires
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
        this.componentsLayer.innerHTML = '';
        this.wiresLayer.innerHTML = '';
        this.interactionLayer.innerHTML = '';
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

        const statusZoom = document.getElementById('status-zoom');
        if (statusZoom) {
            statusZoom.textContent = `Zoom: ${Math.round(this.zoom * 100)}%`;
        }
    }

    /**
     * Update status bar mode
     */
    updateStatusMode() {
        const statusMode = document.getElementById('status-mode');
        if (statusMode) {
            const modeText = {
                'select': 'Edit',
                'place': `Placing: ${this.placingComponentClass?.displayName || 'Component'}`,
                'wire': 'Drawing Wire'
            };
            statusMode.textContent = `Mode: ${modeText[this.mode] || 'Edit'}`;
        }
    }

    /**
     * Update component count in status bar
     */
    updateComponentCount() {
        const statusComponents = document.getElementById('status-components');
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
    async exportAsImage(format = 'png') {
        try {
            // 1. Calculate bounding box of active circuit content (handling empty layers)
            const componentsBBox = this.componentsLayer.getBBox();
            const wiresBBox = this.wiresLayer.getBBox();
            
            const hasComponents = this.circuit.getComponentCount() > 0;
            const hasWires = this.circuit.wires.size > 0;

            if (!hasComponents && !hasWires) {
                alert("Nothing to export! The canvas is empty.");
                return;
            }

            // Union of bounding boxes (only consider non-empty layers)
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

            // Professional padding
            const padding = 80;
            const exportX = x - padding;
            const exportY = y - padding;
            const exportW = w + padding * 2;
            const exportH = h + padding * 2;

            // 2. Clone the SVG and prepare for standalone use
            const clone = this.svg.cloneNode(true);
            clone.setAttribute('viewBox', `${exportX} ${exportY} ${exportW} ${exportH}`);
            
            // Set scale for high-res (2x)
            const exportScale = 2;
            clone.setAttribute('width', exportW * exportScale);
            clone.setAttribute('height', exportH * exportScale);

            // Remove clutter layers
            const unwanted = clone.querySelectorAll('.grid-background, #interaction-layer, defs pattern');
            unwanted.forEach(el => el.remove());

            // Reset view transforms on content layers
            const layers = clone.querySelectorAll('.components-layer, .wires-layer');
            layers.forEach(layer => {
                layer.style.transform = 'none';
                layer.removeAttribute('transform');
            });

            // 3. Inject Professional "WOW" CSS
            const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
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

            // 4. Serialize and Export
            const svgData = new XMLSerializer().serializeToString(clone);

            if (format === 'svg') {
                this._downloadFile(svgData, 'image/svg+xml', `circuit_${Date.now()}.svg`);
            } else {
                // High-res PNG
                await this._exportToPNG(svgData, exportW * exportScale, exportH * exportScale);
            }
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. Please check your circuit for invalid components.');
        }
    }

    /**
     * Internal helper to render SVG to a canvas and download as PNG
     */
    async _exportToPNG(svgData, width, height) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = width;
            canvas.height = height;

            const img = new Image();
            img.onload = () => {
                // Ensure a solid background for PNG
                ctx.fillStyle = '#020617';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `circuit_export_${new Date().toISOString().slice(0, 10)}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    resolve();
                }, 'image/png', 1.0);
            };
            img.onerror = reject;
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
        });
    }

    /**
     * Download a string as a file
     */
    _downloadFile(content, type, filename) {
        const blob = new Blob([content], { type: `${type};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
