      const chatArea = document.getElementById('chat-area');
      const inputBox = document.getElementById('input-box');
      const inputArea = document.getElementById('input-area');

      inputArea.addEventListener('submit', function(e) {
        e.preventDefault();
        const msg = inputBox.value.trim();
        if (!msg) return;
        // Add user message
        const userMsg = document.createElement('div');
        userMsg.className = 'message user';
        userMsg.textContent = msg;
        chatArea.appendChild(userMsg);
        chatArea.scrollTop = chatArea.scrollHeight;
        inputBox.value = '';
        // Simulate bot response
        setTimeout(() => {
          const botMsg = document.createElement('div');
          botMsg.className = 'message bot';
          botMsg.textContent = "This is a bot response.";
          chatArea.appendChild(botMsg);
          chatArea.scrollTop = chatArea.scrollHeight;
        }, 800);
      });