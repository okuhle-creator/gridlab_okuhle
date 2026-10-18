/**
 * SimpleChart.js - Lightweight canvas-based chart for simulation results
 * 
 * Renders time-series data as line charts
 */

export class SimpleChart {
    constructor(container, circuit = null) {
        this.container = container;
        this.circuit = circuit;
        this.canvas = null;
        this.ctx = null;
        this.data = null;

        // Chart styling - professional engineering palette
        this.colors = [
            '#1d4ed8', // engineering blue
            '#dc2626', // technical red
            '#059669', // technical green
            '#d97706', // amber
            '#7c3aed', // violet
            '#0284c7'  // sky blue
        ];

        this.padding = { top: 30, right: 20, bottom: 40, left: 60 };

        this.init();
    }

    init() {
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'chart-canvas';
        this.container.innerHTML = '';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        // Handle resize
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

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

        // Clear background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Chart area
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        // Find data bounds
        const xMin = timePoints[0];
        const xMax = timePoints[timePoints.length - 1];
        let yMin = Infinity, yMax = -Infinity;

        for (const [name, values] of series) {
            // Skip voltage source terminals
            if (name.includes('_positive') || name.includes('_negative')) continue;

            for (const v of values) {
                if (v < yMin) yMin = v;
                if (v > yMax) yMax = v;
            }
        }

        // Add padding to y range
        const yRange = yMax - yMin || 1;
        yMin -= yRange * 0.1;
        yMax += yRange * 0.1;

        // Scale functions
        const scaleX = (x) => padding.left + ((x - xMin) / (xMax - xMin)) * chartWidth;
        const scaleY = (y) => padding.top + chartHeight - ((y - yMin) / (yMax - yMin)) * chartHeight;

        // Draw grid
        this.drawGrid(xMin, xMax, yMin, yMax, scaleX, scaleY);

        // Draw series
        let colorIndex = 0;
        const legend = [];

        for (const [name, values] of series) {
            // Skip voltage source terminals (positive/negative)
            if (name.includes('_positive') || name.includes('_negative')) continue;

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

        // Draw legend
        this.drawLegend(legend);

        // Draw axes labels
        this.drawLabels(xMin, xMax, yMin, yMax);
    }

    drawGrid(xMin, xMax, yMin, yMax, scaleX, scaleY) {
        const { ctx, padding, width, height } = this;
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;

        // Vertical grid lines
        const xTicks = 5;
        for (let i = 0; i <= xTicks; i++) {
            const x = padding.left + (i / xTicks) * chartWidth;
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, padding.top + chartHeight);
            ctx.stroke();
        }

        // Horizontal grid lines
        const yTicks = 4;
        for (let i = 0; i <= yTicks; i++) {
            const y = padding.top + (i / yTicks) * chartHeight;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();
        }

        // Axes
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;

        // X axis
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top + chartHeight);
        ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
        ctx.stroke();

        // Y axis
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, padding.top + chartHeight);
        ctx.stroke();
    }

    drawLabels(xMin, xMax, yMin, yMax) {
        const { ctx, padding, width, height } = this;
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        ctx.fillStyle = '#475569';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';

        // X axis labels
        const xTicks = 5;
        for (let i = 0; i <= xTicks; i++) {
            const value = xMin + (i / xTicks) * (xMax - xMin);
            const x = padding.left + (i / xTicks) * chartWidth;
            ctx.fillText((value * 1000).toFixed(1) + 'ms', x, height - 10);
        }

        // Y axis labels
        ctx.textAlign = 'right';
        const yTicks = 4;
        for (let i = 0; i <= yTicks; i++) {
            const value = yMax - (i / yTicks) * (yMax - yMin);
            const y = padding.top + (i / yTicks) * chartHeight;
            ctx.fillText(value.toFixed(2) + 'V', padding.left - 5, y + 4);
        }

        // Axis titles
        ctx.fillStyle = '#0f172a';
        ctx.font = '600 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Time', padding.left + chartWidth / 2, height - 2);

        ctx.save();
        ctx.translate(12, padding.top + chartHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Voltage (V)', 0, 0);
        ctx.restore();
    }

    drawLegend(legend) {
        const { ctx, padding, width } = this;

        ctx.font = '500 11px sans-serif';
        let x = padding.left + 10;
        const y = 15;

        for (const { name, color } of legend) {
            // Color box
            ctx.fillStyle = color;
            ctx.fillRect(x, y - 8, 12, 12);

            // Label
            ctx.fillStyle = '#0f172a';
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

            // Try to get component type from circuit
            let typeChar = '?';
            if (this.circuit && this.circuit.components) {
                const comp = this.circuit.components.get(compId);
                if (comp) {
                    const name = comp.constructor.name;
                    if (name === 'Resistor') typeChar = 'R';
                    else if (name === 'Capacitor') typeChar = 'C';
                    else if (name === 'Inductor') typeChar = 'L';
                    else if (name === 'VoltageSource') typeChar = 'V';
                    else typeChar = name[0];
                }
            }

            // Current trace (e.g. comp_13_I)
            if (terminal === 'I') {
                return `I(${typeChar})`;
            }
            // Voltage labels
            if (terminal === 'left' || terminal === 'right') {
                return `V(${typeChar})`;
            }
            if (terminal === 'positive' || terminal === 'negative') {
                return `V(${typeChar})`;
            }
            return terminal;
        }
        // Current traces (format: comp_X_I)
        if (nodeId.endsWith('_I')) {
            const compMatch = nodeId.match(/^comp_(\d+)_I$/);
            if (compMatch) {
                const compId = `comp_${compMatch[1]}`;
                // Try to get component type
                let typeChar = '?';
                if (this.circuit && this.circuit.components) {
                    const comp = this.circuit.components.get(compId);
                    if (comp) {
                        const name = comp.constructor.name;
                        if (name === 'Resistor') typeChar = 'R';
                        else if (name === 'Capacitor') typeChar = 'C';
                        else if (name === 'Inductor') typeChar = 'L';
                        else if (name === 'VoltageSource') typeChar = 'V';
                        else typeChar = name[0];
                    }
                }
                return `I(${typeChar})`;
            }
            return 'I';
        }
        return nodeId;
    }

    destroy() {
        window.removeEventListener('resize', this.resize);
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
}
