class FittingVisualization {
    constructor(containerId, width, height, onStateChange) {
        this.containerId = containerId;
        this.width = width;
        this.height = height;
        this.margin = { top: 50, right: 50, bottom: 50, left: 50 };
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;
        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.onStateChange = onStateChange;
        // Data storage
        this.points = [];
        this.modelComplexity = 1; // 1 = linear, higher = polynomial
        
        this.xScale = null;
        this.yScale = null;
        
        this.svg = null;
        this.g = null;

        this.lastCheckedState = null
        this.hasChangedSinceCheck = false

        this.init();
    }
    
    init() {
        const container = d3.select(`#${this.containerId}`);
        
        this.svg = container
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .style('background', '#f9f9f9')
            .style('cursor', 'crosshair');
        
        this.g = this.svg
            .append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
        
        this.initScales();
        
        this.drawAxes();
        this.drawGrid();
        
        this.svg.on('click', (event) => this.handleClick(event));
    }
    
    initScales() {
        // X scale: data range 0-100, pixel range 0-innerWidth
        this.xScale = d3.scaleLinear()
            .domain([0, 100])
            .range([0, this.innerWidth]);
        
        // Y scale: data range 0-100, pixel range innerHeight-0 (inverted for SVG coordinates)
        this.yScale = d3.scaleLinear()
            .domain([0, 100])
            .range([this.innerHeight, 0]);
    }
    
    drawAxes() {
        this.g.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${this.innerHeight})`)
            .call(d3.axisBottom(this.xScale));
        
        this.g.append('g')
            .attr('class', 'y-axis')
            .call(d3.axisLeft(this.yScale));
        
        this.g.append('text')
            .attr('class', 'x-label')
            .attr('x', this.innerWidth / 2)
            .attr('y', this.innerHeight + 40)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .text('Feature X');
        
        this.g.append('text')
            .attr('class', 'y-label')
            .attr('transform', 'rotate(-90)')
            .attr('x', -this.innerHeight / 2)
            .attr('y', -35)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .text('Target Y');
    }
    
    drawGrid() {
        this.g.append('g')
            .attr('class', 'grid')
            .attr('transform', `translate(0,${this.innerHeight})`)
            .call(d3.axisBottom(this.xScale)
                .tickSize(-this.innerHeight)
                .tickFormat(''))
            .style('stroke', '#e0e0e0')
            .style('stroke-opacity', 0.5);
        
        this.g.append('g')
            .attr('class', 'grid')
            .call(d3.axisLeft(this.yScale)
                .tickSize(-this.innerWidth)
                .tickFormat(''))
            .style('stroke', '#e0e0e0')
            .style('stroke-opacity', 0.5);
    }
    
    handleClick(event) {
        const [mouseX, mouseY] = d3.pointer(event, this.g.node());
        
        // Convert pixel coordinates to data coordinates
        const dataX = this.xScale.invert(mouseX);
        const dataY = this.yScale.invert(mouseY);
        
        // Check if click is within bounds
        if (dataX >= 0 && dataX <= 100 && dataY >= 0 && dataY <= 100) {
            this.addPoint(dataX, dataY);
        }
    }
    
    addPoint(x, y) {
        this.points.push({ x, y })
        
        this.drawPoints()
        
        if (this.points.length >= 2) {
            this.drawFitLine();
        }
        this.hasChangedSinceCheck = true
        const pointCounter = document.getElementById('point-count')
        pointCounter.textContent = this.points.length + " / 5"
        if (this.onStateChange) {
            this.onStateChange()
        }
    }
    
    drawPoints() {
        // Bind data to circles
        const circles = this.g.selectAll('circle.data-point')
            .data(this.points);
        
        // Enter: create new circles for new data
        circles.enter()
            .append('circle')
            .attr('class', 'data-point')
            .attr('cx', d => this.xScale(d.x))
            .attr('cy', d => this.yScale(d.y))
            .attr('r', 0)
            .style('fill', '#4CAF50')
            .style('stroke', '#fff')
            .style('stroke-width', 2)
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                event.stopPropagation();
                this.removePoint(d);
            })
            .transition()
            .duration(300)
            .attr('r', 8);
        
        // Update: update existing circles
        circles
            .attr('cx', d => this.xScale(d.x))
            .attr('cy', d => this.yScale(d.y));
        
        // Exit: remove circles for removed data
        circles.exit()
            .transition()
            .duration(300)
            .attr('r', 0)
            .remove();
    }
    
    removePoint(pointToRemove) {
        this.points = this.points.filter(p => p !== pointToRemove);
        
        this.drawPoints();
        
        if (this.points.length >= 2) {
            this.drawFitLine();
        } else {
            this.g.select('.fit-line').remove();
        }

        this.hasChangedSinceCheck = true
        const pointCounter = document.getElementById('point-count')
        pointCounter.textContent = this.points.length + " / 5"
        if (this.onStateChange) {
            this.onStateChange()
        }
    }
    
    drawFitLine() {
        // Calculate polynomial regression
        const coefficients = this.calculatePolynomialRegression(this.points, this.modelComplexity);
        
        if (!coefficients) return;
        
        // Generate line points
        const linePoints = [];
        for (let x = 0; x <= 100; x += 1) {
            let y = 0;
            for (let i = 0; i <= this.modelComplexity; i++) {
                y += coefficients[i] * Math.pow(x, i);
            }
            // Clamp y to visible range
            y = Math.max(0, Math.min(100, y));
            linePoints.push({ x, y });
        }
        
        // Create line generator
        const line = d3.line()
            .x(d => this.xScale(d.x))
            .y(d => this.yScale(d.y))
            .curve(d3.curveNatural);
        
        // Remove old line
        this.g.select('.fit-line').remove();
        
        // Draw new line
        this.g.append('path')
            .datum(linePoints)
            .attr('class', 'fit-line')
            .attr('d', line)
            .style('fill', 'none')
            .style('stroke', '#2196F3')
            .style('stroke-width', 3)
            .style('opacity', 0)
            .transition()
            .duration(500)
            .style('opacity', 0.8);
    }
    
    calculatePolynomialRegression(points, degree) {
        // Simplified polynomial regression using normal equations
        // For production, you'd want a more robust implementation
        
        if (points.length < degree + 1) return null;
        
        const n = points.length;
        const X = [];
        const y = points.map(p => p.y);
        
        // Build design matrix
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j <= degree; j++) {
                row.push(Math.pow(points[i].x, j));
            }
            X.push(row);
        }
        
        // Solve using least squares (simplified)
        return this.solveLinearSystem(X, y);
    }
    
    solveLinearSystem(X, y) {
        // Simplified least squares solution
        // Calculate X'X and X'y
        const n = y.length;
        const k = X[0].length;
        
        const XtX = Array(k).fill(0).map(() => Array(k).fill(0));
        const Xty = Array(k).fill(0);
        
        for (let i = 0; i < k; i++) {
            for (let j = 0; j < k; j++) {
                for (let row = 0; row < n; row++) {
                    XtX[i][j] += X[row][i] * X[row][j];
                }
            }
            for (let row = 0; row < n; row++) {
                Xty[i] += X[row][i] * y[row];
            }
        }
        
        // Solve using Gaussian elimination
        return this.gaussianElimination(XtX, Xty);
    }
    
    gaussianElimination(A, b) {
        const n = b.length;
        const Ab = A.map((row, i) => [...row, b[i]]);
        
        // Forward elimination
        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(Ab[k][i]) > Math.abs(Ab[maxRow][i])) {
                    maxRow = k;
                }
            }
            [Ab[i], Ab[maxRow]] = [Ab[maxRow], Ab[i]];
            
            for (let k = i + 1; k < n; k++) {
                const factor = Ab[k][i] / Ab[i][i];
                for (let j = i; j <= n; j++) {
                    Ab[k][j] -= factor * Ab[i][j];
                }
            }
        }
        
        // Back substitution
        const x = Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            x[i] = Ab[i][n];
            for (let j = i + 1; j < n; j++) {
                x[i] -= Ab[i][j] * x[j];
            }
            x[i] /= Ab[i][i];
        }
        
        return x;
    }
    
    setModelComplexity(degree) {
        this.modelComplexity = degree;
        if (this.points.length >= 2) {
            this.drawFitLine();
        }
        this.hasChangedSinceCheck = true
        if (this.onStateChange) {
            this.onStateChange()
        }
    }
    
    clearPoints() {
        this.points = [];
        this.drawPoints();
        this.g.select('.fit-line').remove();
    }
    
    getPoints() {
        return this.points;
    }
    
    destroy() {
        this.svg.remove();
    }

    getCurrentState() {
        return {
            points: JSON.parse(JSON.stringify(this.points)),
            modelComplexity: this.modelComplexity
        }
    }

    hasStateChanged() {
        if (!this.lastCheckedState) {
            return true
        }

        const current = this.getCurrentState()
        const last = this.lastCheckedState

        if (current.points.length !== last.points.length) {
            return true
        }

        if (current.modelComplexity !== last.modelComplexity) {
            return true
        }

        return false
    }

    markAsChecked() {
        this.lastCheckedState = this.getCurrentState()
        this.hasChangedSinceCheck = false
    }
}
