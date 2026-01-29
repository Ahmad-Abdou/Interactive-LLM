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

    let visContainer = document.querySelector('.visualization-container');
    if (!visContainer) {
        const vizContainer = document.createElement('div');
        vizContainer.id = 'my-container'
        vizContainer.style.cssText = `
            margin-top: 15px;
            padding: 10px;
            background: #f5f5f5;
            border-radius: 8px;
            border: 1px solid #ddd;
        `
        botMsg.appendChild(vizContainer);
        
        const viz = new FittingVisualization('my-container', 600, 500)
      

  }}
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