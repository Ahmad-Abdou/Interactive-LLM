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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let { value, done } = await reader.read();
    let buffer = '';
    let modelUsed = null;

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
        if (part.startsWith('__MODEL_META__::')) {
          try {
            const meta = JSON.parse(part.replace('__MODEL_META__::', ''));
            modelUsed = meta.model_used;
            if (modelUsed) {
              const modelInfo = document.createElement('div');
              modelInfo.className = 'model-info';
              modelInfo.style.fontSize = '11px';
              modelInfo.style.color = '#888';
              modelInfo.style.marginTop = '5px';
              modelInfo.textContent = `Model: ${modelUsed}`;
              botMsg.appendChild(modelInfo);
            }
          } catch (e) {
          }
          continue;
        }

        const span = document.createElement('span');
        span.innerHTML = renderMarkdownChunk(part);
        botMsg.appendChild(span);
        chatArea.scrollTop = chatArea.scrollHeight;
      }

      ({ value, done } = await reader.read());
    }

    if (buffer) {
      if (buffer.startsWith('__MODEL_META__::')) {
        try {
          const meta = JSON.parse(buffer.replace('__MODEL_META__::', ''));
          modelUsed = meta.model_used;
          if (modelUsed) {
            const modelInfo = document.createElement('div');
            modelInfo.className = 'model-info';
            modelInfo.style.fontSize = '11px';
            modelInfo.style.color = '#888';
            modelInfo.style.marginTop = '5px';
            modelInfo.textContent = `Model: ${modelUsed}`;
            botMsg.appendChild(modelInfo);
          }
        } catch (e) {}
      } else {
        const span = document.createElement('span');
        span.innerHTML = renderMarkdownChunk(buffer);
        botMsg.appendChild(span);
      }
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