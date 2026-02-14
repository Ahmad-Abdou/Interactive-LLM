const chatArea = document.getElementById('chat-area');
const inputArea = document.getElementById('input-area');
const inputBox = document.getElementById('input-box');

let currentViz = null;
let attemptCount = 0;
let lastFeedback = null;

if (!document.getElementById('main-animations')) {
  const style = document.createElement('style');
  style.id = 'main-animations';
  style.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideInRight {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); box-shadow: 0 0 20px rgba(102, 126, 234, 0.6); }
    }
  `;
  document.head.appendChild(style);
}

function createVisualization(botMsg) {
  const vizId = 'viz-' + Date.now();
  const containerId = 'container-' + Date.now();
  
  const vizContainer = document.createElement('div');
  vizContainer.id = vizId;
  vizContainer.style.cssText = `
    display: flex;
    gap: 15px;
    margin-top: 15px;
    padding: 15px;
    background: #f5f5f5;
    border-radius: 8px;
    border: 1px solid #ddd;
  `;
  
  const canvasContainer = document.createElement('div');
  canvasContainer.id = containerId;
  canvasContainer.style.cssText = `flex: 1;`;
  
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'controls-panel';
  controlsContainer.style.cssText = `
    width: 280px;
    display: flex;
    flex-direction: column;
    gap: 15px;
  `;

  vizContainer.appendChild(canvasContainer);
  vizContainer.appendChild(controlsContainer);
  botMsg.appendChild(vizContainer);

  const pointCounter = document.createElement('div');
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
  controlsContainer.appendChild(pointCounter);

  const sliderControl = document.createElement('div');
  sliderControl.style.cssText = `
    background: white;
    padding: 15px;
    border-radius: 6px;
    border: 1px solid #ddd;
  `;
  const sliderId = 'degree-slider-' + Date.now();
  const degreeValueId = 'degree-value-' + Date.now();
  sliderControl.innerHTML = `
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span style="font-weight: bold; font-size: 14px;">Polynomial Degree</span>
      <span id="${degreeValueId}" style="background: #2196F3; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">1</span>
    </div>
    <input type="range" id="${sliderId}" min="1" max="6" value="1" step="1" style="width: 100%;">
    <div style="display: flex; justify-content: space-between; font-size: 11px; color: #888; margin-top: 5px;">
      <span>Simple</span>
      <span>Complex</span>
    </div>
  `;
  controlsContainer.appendChild(sliderControl);

  const checkButton = document.createElement('button');
  checkButton.className = 'check-button';
  checkButton.textContent = 'Check My Work';
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
    if (!checkButton.disabled) {
      checkButton.style.background = '#45a049';
    }
  });
  checkButton.addEventListener('mouseleave', () => {
    if (!checkButton.disabled) {
      checkButton.style.background = '#4CAF50';
    }
  });
  controlsContainer.appendChild(checkButton);

  const viewFeedbackButton = document.createElement('button');
  viewFeedbackButton.id = 'view-feedback-btn';
  viewFeedbackButton.textContent = 'View Last Feedback';
  viewFeedbackButton.style.cssText = `
    padding: 15px;
    border-radius: 6px;
    border: 1px solid #667eea;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    background: white;
    color: #667eea;
    transition: all 0.3s;
    display: none;
  `;
  viewFeedbackButton.addEventListener('mouseenter', () => {
    viewFeedbackButton.style.background = '#f0f0ff';
  });
  viewFeedbackButton.addEventListener('mouseleave', () => {
    viewFeedbackButton.style.background = 'white';
  });
  viewFeedbackButton.addEventListener('click', () => {
    if (lastFeedback) {
      displayFeedback(lastFeedback.text, lastFeedback.elapsed);
    }
  });
  controlsContainer.appendChild(viewFeedbackButton);

  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Canvas';
  resetButton.style.cssText = `
    padding: 15px;
    border-radius: 6px;
    border: 1px solid #ddd;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    background: white;
    color: #666;
    transition: all 0.3s;
  `;
  resetButton.addEventListener('mouseenter', () => {
    resetButton.style.background = '#f5f5f5';
  });
  resetButton.addEventListener('mouseleave', () => {
    resetButton.style.background = 'white';
  });
  controlsContainer.appendChild(resetButton);

  const quizButton = document.createElement('button');
  quizButton.id = 'quiz-button';
  quizButton.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
      <span style="font-size: 20px;">📝</span>
      <span>Take Quiz (${attemptCount}/3)</span>
    </div>
  `;
  quizButton.disabled = true;
  quizButton.style.cssText = `
    padding: 15px;
    border-radius: 6px;
    border: none;
    font-size: 16px;
    font-weight: bold;
    cursor: not-allowed;
    background: linear-gradient(135deg, #ccc 0%, #999 100%);
    color: white;
    transition: all 0.3s;
    opacity: 0.6;
  `;
  quizButton.title = 'Complete 3 practice attempts first';
  controlsContainer.appendChild(quizButton);

  chatArea.scrollTop = chatArea.scrollHeight;

  setTimeout(() => {
    const viz = new FittingVisualization(containerId, 600, 500);
    
    const slider = document.getElementById(sliderId);
    const degreeValue = document.getElementById(degreeValueId);
    
    slider.addEventListener('input', (e) => {
      const degree = parseInt(e.target.value);
      degreeValue.textContent = degree;
      viz.modelComplexity = degree;
      if (viz.points.length >= 2) {
        viz.drawFitLine();
      }
    });

    checkButton.addEventListener('click', async () => {
      checkButton.disabled = true;
      
      const originalText = checkButton.textContent;
      checkButton.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
          <div style="
            width: 16px;
            height: 16px;
            border: 3px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          "></div>
          <span>Analyzing...</span>
        </div>
      `;
      checkButton.style.background = '#999';
      checkButton.style.cursor = 'wait';
      
      const startTime = Date.now();
      
      try {
        const response = await fetch('/check_visualization', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: viz.points,
            degree: viz.modelComplexity
          })
        });
        
        const data = await response.json();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        
        displayFeedback(data.feedback, elapsed);
        
        lastFeedback = { text: data.feedback, elapsed: elapsed };
        
        viewFeedbackButton.style.display = 'block';
        
        attemptCount++;
        updateQuizButton(quizButton, attemptCount);
        
      } catch (error) {
        console.error('Error:', error);
        displayFeedback('Sorry, I had trouble analyzing your work. Please try again.');
      } finally {
        checkButton.disabled = false;
        checkButton.textContent = originalText;
        checkButton.style.background = '#4CAF50';
        checkButton.style.cursor = 'pointer';
      }
    });

    resetButton.addEventListener('click', () => {
      if (confirm('Clear all points and reset? This cannot be undone.')) {
        viz.points = [];
        viz.drawPoints();
        viz.g.select('.fit-line').remove();
        
        slider.value = 1;
        degreeValue.textContent = '1';
        viz.modelComplexity = 1;
        
        const pointCounter = document.getElementById('point-count');
        if (pointCounter) {
          pointCounter.textContent = '0';
        }
      }
    });

    quizButton.addEventListener('click', () => {
      if (!quizButton.disabled) {
        if (confirm('Ready to test your knowledge? You\'ll have 5 minutes to complete 5 questions.')) {
          quizSystem.startQuiz();
        }
      }
    });
    
    chatArea.scrollTop = chatArea.scrollHeight;
  }, 100);
}

function updateQuizButton(quizButton, count) {
  quizButton.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
      <span style="font-size: 20px;">📝</span>
      <span>Take Quiz (${count}/3)</span>
    </div>
  `;
  
  if (count >= 3 && quizButton.disabled) {
    quizButton.disabled = false;
    quizButton.style.cssText = `
      padding: 15px;
      border-radius: 6px;
      border: none;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      transition: all 0.3s;
      opacity: 1;
      animation: pulse 2s ease-in-out 3;
    `;
    quizButton.title = 'Ready! Click to start the quiz';
    quizButton.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
        <span style="font-size: 20px;">✅</span>
        <span>Take Quiz</span>
      </div>
    `;
  }
}

function displayFeedback(feedbackText, elapsed) {
  const existing = document.getElementById('feedback-sidebar');
  if (existing) existing.remove();
  
  const sidebar = document.createElement('div');
  sidebar.id = 'feedback-sidebar';
  sidebar.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 450px;
    height: 100vh;
    background: white;
    box-shadow: -5px 0 20px rgba(0,0,0,0.3);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    animation: slideInRight 0.3s ease-out;
    border-left: 3px solid #667eea;
  `;
  
  const header = document.createElement('div');
  header.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 20px;
    color: white;
    flex-shrink: 0;
  `;
  header.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 24px;">✨</span>
        <span style="font-weight: bold; font-size: 18px;">AI Teacher Feedback</span>
      </div>
      <button id="close-feedback" style="
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        width: 32px;
        height: 32px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      ">×</button>
    </div>
    ${elapsed ? `<div style="font-size: 12px; opacity: 0.9; margin-top: 8px;">Response time: ${elapsed}s</div>` : ''}
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    padding: 25px;
    flex: 1;
    overflow-y: auto;
    line-height: 1.8;
    font-size: 15px;
    color: #333;
  `;
  
  let formattedText = feedbackText
    .split('\n\n')
    .map(para => para.trim())
    .filter(para => para.length > 0)
    .map(para => {
      let highlighted = para
        .replace(/\b(underfitting|overfitting|balanced fit|high error|low error|too simple|too complex|rigid|flexible)\b/gi, 
                 '<strong style="color: #667eea;">$1</strong>')
        .replace(/\b(degree[\s-]?\d+|degree of \d+|\d+ degree)\b/gi, 
                 '<span style="background: #f0f0ff; padding: 2px 6px; border-radius: 3px; font-weight: 600;">$1</span>');
      return `<p style="margin-bottom: 12px;">${highlighted}</p>`;
    })
    .join('');
  
  content.innerHTML = `
    <div style="padding-left: 12px; border-left: 4px solid #667eea;">
      ${formattedText}
    </div>
  `;
  
  const footer = document.createElement('div');
  footer.style.cssText = `
    padding: 20px 25px;
    background: #f8f9fa;
    border-top: 1px solid #e0e0e0;
    flex-shrink: 0;
  `;
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Got it!';
  closeBtn.style.cssText = `
    width: 100%;
    padding: 12px 24px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
    font-size: 16px;
    transition: transform 0.2s;
  `;
  
  const closeSidebar = () => sidebar.remove();
  
  closeBtn.addEventListener('click', closeSidebar);
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.transform = 'scale(1.05)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.transform = 'scale(1)';
  });
  
  footer.appendChild(closeBtn);
  
  header.querySelector('#close-feedback').addEventListener('click', closeSidebar);
  header.querySelector('#close-feedback').addEventListener('mouseenter', (e) => {
    e.target.style.background = 'rgba(255,255,255,0.3)';
  });
  header.querySelector('#close-feedback').addEventListener('mouseleave', (e) => {
    e.target.style.background = 'rgba(255,255,255,0.2)';
  });
  
  // Assemble
  sidebar.appendChild(header);
  sidebar.appendChild(content);
  sidebar.appendChild(footer);
  
  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeSidebar();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  
  document.body.appendChild(sidebar);
}

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

  // Thinking indicator
  const thinkingMsg = document.createElement('div');
  thinkingMsg.className = 'message bot';
  thinkingMsg.id = 'thinking-indicator';
  thinkingMsg.style.cssText = `
    padding: 15px 20px;
    background: linear-gradient(90deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
    border-left: 4px solid #667eea;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 12px;
  `;
  
  const startTime = Date.now();
  
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 20px;
    height: 20px;
    border: 3px solid rgba(102, 126, 234, 0.3);
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    flex-shrink: 0;
  `;
  
  const textContainer = document.createElement('div');
  textContainer.style.cssText = 'flex: 1;';
  
  const thinkingText = document.createElement('span');
  thinkingText.style.cssText = 'color: #667eea; font-weight: 500;';
  thinkingText.textContent = 'AI is thinking';
  
  const dots = document.createElement('span');
  dots.id = 'thinking-dots';
  dots.style.cssText = 'color: #667eea;';
  
  const timer = document.createElement('span');
  timer.id = 'thinking-timer';
  timer.style.cssText = `
    margin-left: auto;
    font-size: 12px;
    color: #999;
    font-family: monospace;
    flex-shrink: 0;
  `;
  timer.textContent = '0.0s';
  
  textContainer.appendChild(thinkingText);
  textContainer.appendChild(dots);
  thinkingMsg.appendChild(spinner);
  thinkingMsg.appendChild(textContainer);
  thinkingMsg.appendChild(timer);
  chatArea.appendChild(thinkingMsg);
  chatArea.scrollTop = chatArea.scrollHeight;
  
  let dotCount = 0;
  const dotInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    dots.textContent = '.'.repeat(dotCount);
  }, 400);
  
  const timerInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    timer.textContent = `${elapsed.toFixed(1)}s`;
  }, 100);
  
  try {
    const response = await fetch('/chat_stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      clearInterval(dotInterval);
      clearInterval(timerInterval);
      thinkingMsg.remove();
      const errorMsg = document.createElement('div');
      errorMsg.className = 'message bot error';
      errorMsg.textContent = 'Error: ' + (err.error || err.response || JSON.stringify(err));
      chatArea.appendChild(errorMsg);
      chatArea.scrollTop = chatArea.scrollHeight;
      return;
    }

    clearInterval(dotInterval);
    clearInterval(timerInterval);
    thinkingMsg.remove();

    const botMsg = document.createElement('div');
    botMsg.className = 'message bot';
    botMsg.innerHTML = '';
    chatArea.appendChild(botMsg);

    const vizTypeHeader = response.headers.get('X-Visualization-Type');
    let shouldCreateViz = false;
    let vizTypes = null;
    
    if (vizTypeHeader) {
      vizTypes = vizTypeHeader.split(',').map(s => s.trim().toLowerCase());
      if (vizTypes.includes('underfitting') || vizTypes.includes('overfitting')) {
        shouldCreateViz = true;
      }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let { value, done } = await reader.read();
    let buffer = '';
    let fullResponse = '';
    let foundInstructions = false;
    let instructionText = '';

    function renderMarkdownChunk(chunk) {
      return chunk
        .replace(/###\s*(.*)/g, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
    }

    while (!done) {
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop();

      for (const part of parts) {
        if (!part) continue;
        fullResponse += part + '\n';

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
          separator.innerHTML = '🎯 Let\'s Try This Together!';
          botMsg.appendChild(separator);
          continue;
        }

        if (foundInstructions) {
          const cleanPart = part.replace('[INTERACTIVE_INSTRUCTIONS]', '').trim();
          if (cleanPart) {
            instructionText += cleanPart + '\n';
            const instructionLine = document.createElement('div');
            instructionLine.style.cssText = `
              margin: 5px 0;
              line-height: 1.8;
              color: #444;
            `;
            instructionLine.innerHTML = renderMarkdownChunk(cleanPart);
            botMsg.appendChild(instructionLine);
          }
        } else {
          const line = document.createElement('div');
          line.style.cssText = `
            margin-bottom: 8px;
            line-height: 1.6;
          `;
          line.innerHTML = renderMarkdownChunk(part);
          botMsg.appendChild(line);
        }
        
        chatArea.scrollTop = chatArea.scrollHeight;
      }

      ({ value, done } = await reader.read());
    }

    if (buffer) {
      fullResponse += buffer;
      
      if (foundInstructions) {
        const cleanBuffer = buffer.replace('[INTERACTIVE_INSTRUCTIONS]', '').trim();
        if (cleanBuffer) {
          instructionText += cleanBuffer;
          const instructionLine = document.createElement('div');
          instructionLine.style.cssText = `
            margin: 5px 0;
            line-height: 1.8;
            color: #444;
          `;
          instructionLine.innerHTML = renderMarkdownChunk(cleanBuffer);
          botMsg.appendChild(instructionLine);
        }
      } else {
        const line = document.createElement('div');
        line.style.cssText = `
          margin-bottom: 8px;
          line-height: 1.6;
        `;
        line.innerHTML = renderMarkdownChunk(buffer);
        botMsg.appendChild(line);
      }
    }

    chatArea.scrollTop = chatArea.scrollHeight;
    
    if (shouldCreateViz && instructionText) {
      createVisualization(botMsg);
    }

  } catch (error) {
    clearInterval(dotInterval);
    clearInterval(timerInterval);
    thinkingMsg.remove();
    console.error('Error:', error);
    const errorMsg = document.createElement('div');
    errorMsg.className = 'message bot error';
    errorMsg.textContent = 'Sorry, something went wrong. Please try again.';
    chatArea.appendChild(errorMsg);
    chatArea.scrollTop = chatArea.scrollHeight;
  }
});