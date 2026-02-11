const chatArea = document.getElementById('chat-area')
const inputBox = document.getElementById('input-box')
const inputArea = document.getElementById('input-area')

let currentViz = null

function createVisualization(botMsg) {
  const vizContainer = document.createElement('div')
  vizContainer.id = 'viz-wrapper'
  vizContainer.style.cssText = `
    display: flex;
    gap: 15px;
    margin-top: 15px;
    padding: 15px;
    background: #f5f5f5;
    border-radius: 8px;
    border: 1px solid #ddd;
  `
  
  const canvasContainer = document.createElement('div')
  canvasContainer.id = 'my-container'
  canvasContainer.style.cssText = `flex: 1;`
  
  const controlsContainer = document.createElement('div')
  controlsContainer.id = 'controls-panel'
  controlsContainer.style.cssText = `
    width: 280px;
    display: flex;
    flex-direction: column;
    gap: 15px;
  `;

  vizContainer.appendChild(canvasContainer)
  vizContainer.appendChild(controlsContainer)
  
  botMsg.appendChild(vizContainer)

  const pointCounter = document.createElement('div')
  pointCounter.style.cssText = `
    background: white;
    padding: 15px;
    border-radius: 6px;
    border: 1px solid #ddd;
  `;
  pointCounter.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">Points Placed</div>
    <div id="point-count" style="font-size: 24px; color: #4CAF50; font-weight: bold;">0</div>
    <div style="font-size: 12px; color: #666; margin-top: 5px;">Click canvas to add points</div>
  `;
  controlsContainer.appendChild(pointCounter)

  const sliderControl = document.createElement('div')
  sliderControl.style.cssText = `
    background: white;
    padding: 15px;
    border-radius: 6px;
    border: 1px solid #ddd;
  `;
  sliderControl.innerHTML = `
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span style="font-weight: bold; font-size: 14px;">Polynomial Degree</span>
      <span id="degree-value" style="background: #2196F3; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">1</span>
    </div>
    <input type="range" id="degree-slider" min="1" max="6" value="1" step="1" style="width: 100%;">
    <div style="display: flex; justify-content: space-between; font-size: 11px; color: #888; margin-top: 5px;">
      <span>Simple</span>
      <span>Complex</span>
    </div>
  `;
  controlsContainer.appendChild(sliderControl)

  const checkButton = document.createElement('button')
  checkButton.id = 'check-button'
  checkButton.textContent = 'Check My Work'
  checkButton.style.cssText = `
    padding: 15px;
    border-radius: 6px;
    border: none;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    background: #4CAF50;
    color: white;
    transition: all 0.3s;
  `;
  checkButton.addEventListener('mouseenter', () => {
    checkButton.style.background = '#45a049';
  });
  checkButton.addEventListener('mouseleave', () => {
    checkButton.style.background = '#4CAF50';
  });
  controlsContainer.appendChild(checkButton);

  chatArea.scrollTop = chatArea.scrollHeight;

  setTimeout(() => {
    currentViz = new FittingVisualization('my-container', 600, 500);
    
    const slider = document.getElementById('degree-slider')
    const degreeValue = document.getElementById('degree-value')
    
    slider.addEventListener('input', (e) => {
      const degree = parseInt(e.target.value)
      degreeValue.textContent = degree;
      if (currentViz.points.length >= 2) {
        currentViz.setModelComplexity(degree)
      }
    })

    const originalAddPoint = currentViz.addPoint.bind(currentViz)
    currentViz.addPoint = function(x, y) {
      originalAddPoint(x, y)
      document.getElementById('point-count').textContent = this.points.length
    };

    const originalRemovePoint = currentViz.removePoint.bind(currentViz)
    currentViz.removePoint = function(point) {
      originalRemovePoint(point)
      document.getElementById('point-count').textContent = this.points.length
    };

    checkButton.addEventListener('click', async () => {
      checkButton.disabled = true
      checkButton.textContent = 'Checking...'
      
      try {
        const response = await fetch('/check_visualization', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: currentViz.points,
            degree: currentViz.modelComplexity
          })
        });
        
        const data = await response.json()
        displayFeedback(data.feedback)
        
      } catch (error) {
        console.error('Error:', error)
        displayFeedback('Sorry, I had trouble analyzing your work. Please try again.')
      } finally {
        checkButton.disabled = false
        checkButton.textContent = 'Check My Work'
      }
    });
    
    chatArea.scrollTop = chatArea.scrollHeight
  }, 100)
}

inputArea.addEventListener('submit', async function(e) {
  e.preventDefault()
  const msg = inputBox.value.trim()
  if (!msg) return;
  
  const userMsg = document.createElement('div')
  userMsg.className = 'message user'
  userMsg.textContent = msg
  chatArea.appendChild(userMsg)
  chatArea.scrollTop = chatArea.scrollHeight
  inputBox.value = ''

  const typingMsg = document.createElement('div')
  typingMsg.className = 'message bot typing'
  typingMsg.textContent = 'Thinking...'
  chatArea.appendChild(typingMsg)
  chatArea.scrollTop = chatArea.scrollHeight
  
  try {
    const response = await fetch('/chat_stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: msg })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }))
      typingMsg.remove()
      const errorMsg = document.createElement('div')
      errorMsg.className = 'message bot error'
      errorMsg.textContent = 'Error: ' + (err.error || err.response || JSON.stringify(err))
      chatArea.appendChild(errorMsg)
      chatArea.scrollTop = chatArea.scrollHeight
      return
    }

    const botMsg = document.createElement('div')
    botMsg.className = 'message bot'
    botMsg.innerHTML = ''
    chatArea.appendChild(botMsg)

    const vizTypeHeader = response.headers.get('X-Visualization-Type')
    let shouldCreateViz = false
    let vizTypes = null
    
    if (vizTypeHeader) {
      vizTypes = vizTypeHeader.split(',').map(s => s.trim().toLowerCase())
      if (vizTypes.includes('underfitting') || vizTypes.includes('overfitting')) {
        shouldCreateViz = true;
      }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let { value, done } = await reader.read()
    let buffer = ''
    let fullResponse = ''
    let foundInstructions = false
    let instructionText = ''

    function renderMarkdownChunk(chunk) {
      let out = chunk
        .replace(/###\s*(.*)/g, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
      return out
    }

    while (!done) {
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n');
      buffer = parts.pop()

      for (const part of parts) {
        if (!part) continue

        fullResponse += part + '\n'

        if (part.includes('[INTERACTIVE_INSTRUCTIONS]')) {
          foundInstructions = true;
          const separator = document.createElement('div');
          separator.style.cssText = `
            margin: 15px 0 10px 0;
            padding: 12px 15px;
            background: linear-gradient(90deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
            border-left: 4px solid #667eea;
            border-radius: 4px;
            font-weight: 600;
            color: #667eea;
            font-size: 15px;
          `;
          separator.innerHTML = '🎯 Let\'s Try This Together!'
          botMsg.appendChild(separator)
          continue
        }

        if (foundInstructions) {
          const cleanPart = part.replace('[INTERACTIVE_INSTRUCTIONS]', '').trim()
          if (cleanPart) {
            instructionText += cleanPart + '\n';
            const instructionLine = document.createElement('div')
            instructionLine.style.cssText = `
              margin: 5px 0;
              line-height: 1.8;
              color: #444;
            `;
            instructionLine.innerHTML = renderMarkdownChunk(cleanPart)
            botMsg.appendChild(instructionLine)
          }
        } else {
          const line = document.createElement('div');
          line.style.cssText = `
            margin-bottom: 8px;
            line-height: 1.6;
          `;
          line.innerHTML = renderMarkdownChunk(part)
          botMsg.appendChild(line)
        }
        
        chatArea.scrollTop = chatArea.scrollHeight
      }

      ({ value, done } = await reader.read())
    }

    if (buffer) {
      fullResponse += buffer
      
      if (foundInstructions) {
        const cleanBuffer = buffer.replace('[INTERACTIVE_INSTRUCTIONS]', '').trim()
        if (cleanBuffer) {
          instructionText += cleanBuffer
          const instructionLine = document.createElement('div')
          instructionLine.style.cssText = `
            margin: 5px 0;
            line-height: 1.8;
            color: #444;
          `;
          instructionLine.innerHTML = renderMarkdownChunk(cleanBuffer)
          botMsg.appendChild(instructionLine)
        }
      } else {
        const line = document.createElement('div')
        line.style.cssText = `
          margin-bottom: 8px;
          line-height: 1.6;
        `;
        line.innerHTML = renderMarkdownChunk(buffer)
        botMsg.appendChild(line)
      }
    }

    typingMsg.remove()
    chatArea.scrollTop = chatArea.scrollHeight
    
    if (shouldCreateViz && instructionText) {
      createVisualization(botMsg)
    }
    
  } catch (error) {
    typingMsg.remove()
    
    const errorMsg = document.createElement('div')
    errorMsg.className = 'message bot error'
    errorMsg.textContent = 'Error: ' + error.message
    chatArea.appendChild(errorMsg)
    chatArea.scrollTop = chatArea.scrollHeight
  }
});

function displayFeedback(feedbackText) {
  const existingModal = document.getElementById('feedback-modal')
  if (existingModal) existingModal.remove()
  

  
  const modal = document.createElement('div')
  modal.id = 'feedback-modal'
  modal.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 450px;
    max-height: 80vh;
    background: white;
    border-radius: 12px;
    padding: 0;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    z-index: 10000;
    overflow: hidden;
    animation: slideIn 0.3s ease-out;
    border: 3px solid #667eea;
  `;
  
  const style = document.createElement('style')
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  const header = document.createElement('div');
  header.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 20px;
    color: white;
  `;
  header.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <span style="font-size: 24px;">✨</span>
      <span style="font-weight: bold; font-size: 18px;">AI Teacher Feedback</span>
    </div>
  `;
  
  const content = document.createElement('div')
  content.style.cssText = `
    padding: 25px;
    max-height: 400px;
    overflow-y: auto;
    line-height: 1.8;
    font-size: 15px;
    color: #333;
  `

  let formattedText = feedbackText
    .split('\n\n')
    .map(para => para.trim())
    .filter(para => para.length > 0)
    .map(para => {
      let highlighted = para
        .replace(/\b(underfitting|overfitting|balanced fit|high error|low error|too simple|too complex|rigid|flexible)\b/gi, 
                 '<strong style="color: #667eea;">$1</strong>')
        .replace(/\b(degree[\s-]?\d+|degree of \d+|\d+ degree)\b/gi, 
                 '<span style="background: #f0f0ff; padding: 2px 6px; border-radius: 3px; font-weight: 600;">$1</span>')
      
      return `<p style="margin-bottom: 12px;">${highlighted}</p>`
    })
    .join('')
  
  content.innerHTML = `
    <div style="padding-left: 12px; border-left: 4px solid #667eea;">
      ${formattedText}
    </div>
  `;
  
  const actions = document.createElement('div')
  actions.style.cssText = `
    padding: 20px 25px;
    background: #f8f9fa;
    display: flex;
    gap: 10px;
    border-top: 1px solid #e0e0e0;
  `;
  
  const closeBtn = document.createElement('button')
  closeBtn.textContent = 'Got it!'
  closeBtn.style.cssText = `
    flex: 1;
    padding: 12px 24px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
    font-size: 16px;
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  closeBtn.addEventListener('click', () => modal.remove())
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.transform = 'scale(1.05)'
    closeBtn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)'
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.transform = 'scale(1)'
    closeBtn.style.boxShadow = 'none'
  });
  
  actions.appendChild(closeBtn)
  
  modal.appendChild(header)
  modal.appendChild(content)
  modal.appendChild(actions)
  document.body.appendChild(modal)
}