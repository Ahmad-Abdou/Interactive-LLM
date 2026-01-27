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
    const response = await fetch('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: msg })
    });
    
    const data = await response.json();
    
    typingMsg.remove();
    
    const botMsg = document.createElement('div');
    botMsg.className = 'message bot';
    botMsg.textContent = data.response;
    chatArea.appendChild(botMsg);

    if (data.model_used) {
        const modelInfo = document.createElement('div');
        modelInfo.className = 'model-info';
        modelInfo.style.fontSize = '11px';
        modelInfo.style.color = '#888';
        modelInfo.style.marginTop = '5px';
        modelInfo.textContent = `Model: ${data.model_used}`;
        botMsg.appendChild(modelInfo);
}
    
    if (data.visualization) {
      const vizMsg = document.createElement('div');
      vizMsg.className = 'message bot visualization';
      vizMsg.innerHTML = '<div style="padding: 20px; background: #2d2d2d; border-radius: 8px; margin-top: 10px;">🎨 Interactive Playground would appear here!</div>';
      chatArea.appendChild(vizMsg);
    }
    
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