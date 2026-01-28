class fittingVisualization{
    constructor(id, width, height){
        this.id = id
        this.width = width
        this.height = height
        this.margin = {top:50, right : 50, bottom: 50, left: 50}
        this.innerheight = this.height - this.margin.bottom - this.margin.top
        this.innerwidth = this.width - this.margin.right - this.margin.left
        this.svg = d3.select('.visualization-container')
        .append('svg')
        .attr('id', this.id)
        .attr('width', this.width)
        .attr('height', this.height)
        this.rect = null
        this.xScale = null
        this.yScale = null
    }
}