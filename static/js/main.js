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
    let vizInstance = null;
    if (vizTypeHeader) {
    const vizTypes = vizTypeHeader.split(',').map(s => s.trim().toLowerCase());
    if (vizTypes.includes('underfitting') || vizTypes.includes('overfitting')) {

    let visContainer = document.querySelector('.visualization-container');
    if (!visContainer) {
      visContainer = document.createElement('div');
      visContainer.className = 'visualization-container';
    Object.assign(visContainer.style, {
      position: 'fixed',
      right: '20px',
      top: '20px',
      width: '520px',
      height: '520px',
      background: '#fff',
      border: '1px solid #ccc',
      padding: '8px',
      zIndex: 9999,
      overflow: 'auto'
    });
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = 'position:absolute;right:6px;top:6px;';
    closeBtn.addEventListener('click', () => visContainer.remove());
    visContainer.appendChild(closeBtn);
    document.body.appendChild(visContainer);
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