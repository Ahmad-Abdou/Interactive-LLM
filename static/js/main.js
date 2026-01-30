const chatArea = document.getElementById('chat-area');
const inputBox = document.getElementById('input-box');
const inputArea = document.getElementById('input-area');

inputArea.addEventListener('submit', async function(e) {
  e.preventDefault();
  const msg = inputBox.value.trim();
  if (!msg) return;
  
  const userMsg = document.createElement('div');
  userMsg.className = 'message user';
  userMsg.textContent = msg;
  chatArea.appendChild(userMsg);
  chatArea.scrollTop = chatArea.scrollHeight;
  inputBox.value = '';

  const typingMsg = document.createElement('div');
  typingMsg.className = 'message bot typing';
  typingMsg.textContent = 'Thinking...';
  chatArea.appendChild(typingMsg);
  chatArea.scrollTop = chatArea.scrollHeight;
  
  try {
    const response = await fetch('/chat_stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: msg })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      typingMsg.remove();
      const errorMsg = document.createElement('div');
      errorMsg.className = 'message bot error';
      errorMsg.textContent = 'Error: ' + (err.error || err.response || JSON.stringify(err));
      chatArea.appendChild(errorMsg);
      chatArea.scrollTop = chatArea.scrollHeight;
      return;
    }

    const botMsg = document.createElement('div');
    botMsg.className = 'message bot';
    botMsg.innerHTML = '';
    chatArea.appendChild(botMsg);

    const vizTypeHeader = response.headers.get('X-Visualization-Type');
    if (vizTypeHeader) {
    const vizTypes = vizTypeHeader.split(',').map(s => s.trim().toLowerCase());
    if (vizTypes.includes('underfitting') || vizTypes.includes('overfitting')) {
      const vizContainer = document.createElement('div');
      vizContainer.id = 'viz-wrapper';
      vizContainer.style.cssText = `
          display: flex;
          gap: 15px;
          margin-top: 15px;
          padding: 15px;
          background: #f5f5f5;
          border-radius: 8px;
          border: 1px solid #ddd;
      `;
      
      const canvasContainer = document.createElement('div')
      canvasContainer.id = 'my-container';
      canvasContainer.style.cssText = `
          flex: 1;
      `
      const controlsContainer = document.createElement('div')
      controlsContainer.id = 'controls-panel';
      controlsContainer.style.cssText = `
          width: 250px;
          display: flex;
          flex-direction: column;
          gap: 15px;
      `

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
          <div id="point-count" style="font-size: 24px; color: #4CAF50; font-weight: bold;">0 / 5</div>
          <div style="font-size: 12px; color: #666; margin-top: 5px;">Click canvas to add points</div>
      `
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
              <span>Linear</span>
              <span>Complex</span>
          </div>
      `
      controlsContainer.appendChild(sliderControl)

      const slider = document.getElementById('degree-slider')
      const degreeValue = document.getElementById('degree-value')

      const sliderFeedback = document.createElement('div')
      sliderFeedback.id = 'slider-feedback';
      sliderFeedback.style.cssText = `
          font-size: 12px;
          padding: 8px;
          border-radius: 4px;
          margin-top: 8px;
          display: none;
      `
      sliderControl.appendChild(sliderFeedback);

      // Function to update Check button state
      function updateCheckButton() {
          const hasChanged = viz.hasStateChanged()
          const hasEnoughPoints = viz.points.length >= 5
          
          if (hasChanged && hasEnoughPoints) {
              checkButton.disabled = false
              checkButton.style.cursor = 'pointer'
              checkButton.style.background = '#4CAF50'
              checkButton.style.color = 'white'
          } else {
              checkButton.disabled = true
              checkButton.style.cursor = 'not-allowed'
              checkButton.style.background = '#ccc'
              checkButton.style.color = '#666'
          }
      }

      const viz = new FittingVisualization('my-container', 600, 500, updateCheckButton)
      
      slider.addEventListener('input', (e) => {
          const degree = parseInt(e.target.value)
          const pointsNeeded = degree + 1
          const currentPoints = viz.points.length
          
          degreeValue.textContent = degree
          
          if (currentPoints >= pointsNeeded) {
              viz.setModelComplexity(degree)
              sliderFeedback.style.display = 'none'
          } else {
              sliderFeedback.style.display = 'block'
              sliderFeedback.style.background = '#fff3cd'
              sliderFeedback.style.color = '#856404'
              sliderFeedback.style.border = '1px solid #ffc107'
              sliderFeedback.textContent = `⚠️ Need ${pointsNeeded} points for degree ${degree}. You have ${currentPoints}. (Rule: points ≥ degree + 1)`
          }
      })
      const checkButton = document.createElement('button')
      checkButton.id = 'check-button'
      checkButton.textContent = 'Check My Work'
      checkButton.disabled = true
      checkButton.style.cssText = `
          padding: 15px;
          border-radius: 6px;
          border: none;
          font-size: 16px;
          font-weight: bold;
          cursor: not-allowed;
          background: #ccc;
          color: #666;
          transition: all 0.3s;
      `;
      controlsContainer.appendChild(checkButton);
    }
  }


    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let { value, done } = await reader.read();
    let buffer = '';

    function renderMarkdownChunk(chunk) {
      let out = chunk
        .replace(/###\s*(.*)/g, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
      return out;
    }

    while (!done) {
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop();

      for (const part of parts) {
        if (!part) continue;

        const span = document.createElement('span');
        span.innerHTML = renderMarkdownChunk(part);
        botMsg.appendChild(span);
        chatArea.scrollTop = chatArea.scrollHeight;
      }

      ({ value, done } = await reader.read());
    }

    typingMsg.remove();
    chatArea.scrollTop = chatArea.scrollHeight;
    
  } catch (error) {
    typingMsg.remove();
    
    const errorMsg = document.createElement('div');
    errorMsg.className = 'message bot error';
    errorMsg.textContent = 'Error: ' + error.message;
    chatArea.appendChild(errorMsg);
    chatArea.scrollTop = chatArea.scrollHeight;
  }
});

