/**
 * Main.js — Interactive Learning System
 * Uses the CanvasEngine to render AI-generated scenes from Scene Descriptor JSON.
 */

const chatArea = document.getElementById('chat-area');
const inputArea = document.getElementById('input-area');
const inputBox = document.getElementById('input-box');

let currentEngine = null;
let attemptCount = 0;
let lastFeedback = null;

// ─── Animation CSS ───
if (!document.getElementById('main-animations')) {
  const style = document.createElement('style');
  style.id = 'main-animations';
  style.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); box-shadow: 0 0 20px rgba(102,126,234,0.6); }
    }
  `;
  document.head.appendChild(style);
}


// ─── Scene Rendering ───

function createInteractiveScene(botMsg, sceneDescriptor) {
  // Add check, challenge & reset buttons to the descriptor's controls
  const checkBtnConfig = { type: 'button', id: 'check_btn', label: 'Check My Work', style: 'success', icon: '✔️' };
  const challengeBtnConfig = { type: 'button', id: 'challenge_btn', label: 'Challenge Me', style: 'primary', icon: '🏆' };
  const resetBtnConfig = { type: 'button', id: 'reset_btn', label: 'Reset Canvas', style: 'secondary', icon: '🔄' };
  const viewFeedbackConfig = { type: 'button', id: 'view_feedback_btn', label: 'View Last Feedback', style: 'secondary', icon: '💬' };

  if (!sceneDescriptor.controls) sceneDescriptor.controls = [];
  sceneDescriptor.controls.push(checkBtnConfig);
  sceneDescriptor.controls.push(challengeBtnConfig);
  sceneDescriptor.controls.push(viewFeedbackConfig);
  sceneDescriptor.controls.push(resetBtnConfig);

  // Create engine
  const engine = new CanvasEngine(botMsg, sceneDescriptor);
  currentEngine = engine;

  // Challenge state — shared across wires
  let activeChallenge = null;
  let challengeBanner = null;

  function showChallengeBanner(challenge) {
    // Remove existing banner
    if (challengeBanner) challengeBanner.remove();

    challengeBanner = document.createElement('div');
    challengeBanner.style.cssText = `
      margin:0 0 10px 0;padding:14px 18px;
      background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius:10px;color:white;position:relative;
      box-shadow:0 4px 15px rgba(102,126,234,0.4);
    `;

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;font-size:15px;margin-bottom:6px;';
    title.textContent = '🏆 Challenge';

    const text = document.createElement('div');
    text.style.cssText = 'font-size:14px;line-height:1.5;opacity:0.95;';
    text.textContent = challenge.challengeText;

    const hintBtn = document.createElement('button');
    hintBtn.style.cssText = `
      margin-top:8px;padding:4px 12px;border:1px solid rgba(255,255,255,0.4);
      border-radius:5px;background:transparent;color:white;font-size:12px;
      cursor:pointer;opacity:0.7;
    `;
    hintBtn.textContent = '💡 Show Hint';
    hintBtn.addEventListener('click', () => {
      hintBtn.textContent = challenge.hint || 'No hint available';
      hintBtn.style.opacity = '1';
      hintBtn.style.cursor = 'default';
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.style.cssText = `
      position:absolute;top:10px;right:12px;background:none;border:none;
      color:white;font-size:18px;cursor:pointer;opacity:0.7;line-height:1;
    `;
    dismissBtn.textContent = '✕';
    dismissBtn.addEventListener('click', () => {
      activeChallenge = null;
      challengeBanner.remove();
      challengeBanner = null;
    });

    challengeBanner.appendChild(title);
    challengeBanner.appendChild(text);
    challengeBanner.appendChild(hintBtn);
    challengeBanner.appendChild(dismissBtn);

    // Insert banner BEFORE the viz container
    const vizContainer = botMsg.querySelector('.interactive-viz-container');
    if (vizContainer) {
      vizContainer.parentElement.insertBefore(challengeBanner, vizContainer);
    } else {
      botMsg.appendChild(challengeBanner);
    }
  }

  // Wire buttons — extracted so it can be re-called after reset
  function wireSceneButtons(eng) {
    // Wire check button
    const checkCtrl = eng.getControl('check_btn');
    if (checkCtrl) {
      checkCtrl.onChange(async () => {
        checkCtrl.setLoading(true);
        const startTime = Date.now();

        try {
          const state = eng.getState();
          const checkConfig = sceneDescriptor.checkConfig || {};

          const body = { state, checkConfig };
          // Include challenge context if active
          if (activeChallenge) {
            body.challengeContext = activeChallenge;
          }

          const response = await fetch('/check_work', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          const data = await response.json();
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

          displayFeedback(data.feedback, elapsed);
          lastFeedback = { text: data.feedback, elapsed };
          attemptCount++;

          // Show view feedback button
          const vfCtrl = eng.getControl('view_feedback_btn');
          if (vfCtrl && vfCtrl.container) {
            vfCtrl.container.style.display = '';
          }

        } catch (error) {
          console.error('Check error:', error);
          displayFeedback('Sorry, I had trouble analyzing your work. Please try again.');
        } finally {
          checkCtrl.setLoading(false);
        }
      });
    }

    // Wire challenge button  
    const challengeCtrl = eng.getControl('challenge_btn');
    if (challengeCtrl) {
      challengeCtrl.onChange(async () => {
        challengeCtrl.setLoading(true);
        try {
          const summary = eng.getSceneSummary();
          const state = eng.getState();

          const response = await fetch('/generate_challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic: summary.topic,
              controls: summary.controls,
              elements: summary.elementIds,
              currentState: state
            })
          });

          const data = await response.json();
          if (data.challenge) {
            activeChallenge = data.challenge;
            showChallengeBanner(data.challenge);
          } else {
            displayFeedback('Could not generate a challenge. Please try again.');
          }
        } catch (error) {
          console.error('Challenge error:', error);
          displayFeedback('Sorry, failed to generate a challenge. Please try again.');
        } finally {
          challengeCtrl.setLoading(false);
        }
      });
    }

    // Hide view feedback initially
    const vfCtrl = eng.getControl('view_feedback_btn');
    if (vfCtrl) {
      if (vfCtrl.container) vfCtrl.container.style.display = 'none';
      vfCtrl.onChange(() => {
        if (lastFeedback) displayFeedback(lastFeedback.text, lastFeedback.elapsed);
      });
    }

    // Wire reset button
    const resetCtrl = eng.getControl('reset_btn');
    if (resetCtrl) {
      resetCtrl.onChange(() => {
        // Clear challenge on reset
        activeChallenge = null;
        if (challengeBanner) { challengeBanner.remove(); challengeBanner = null; }
        eng.reset();
      });
    }
  }

  // Wire initially
  wireSceneButtons(engine);

  // Re-wire after every reset
  engine.onReset((eng) => wireSceneButtons(eng));

  chatArea.scrollTop = chatArea.scrollHeight;
}


// ─── Feedback Sidebar ───

function displayFeedback(feedbackText, elapsed) {
  const existing = document.getElementById('feedback-sidebar');
  if (existing) existing.remove();

  const sidebar = document.createElement('div');
  sidebar.id = 'feedback-sidebar';
  sidebar.style.cssText = `
    position:fixed;top:0;right:0;width:450px;height:100vh;
    background:white;box-shadow:-5px 0 20px rgba(0,0,0,0.3);z-index:9999;
    display:flex;flex-direction:column;animation:slideInRight 0.3s ease-out;
    border-left:3px solid #667eea;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
    padding:20px;color:white;flex-shrink:0;
  `;
  header.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:24px">✨</span>
        <span style="font-weight:bold;font-size:18px">AI Teacher Feedback</span>
      </div>
      <button id="close-feedback" style="
        background:rgba(255,255,255,0.2);border:none;color:white;font-size:24px;
        cursor:pointer;width:32px;height:32px;border-radius:4px;
        display:flex;align-items:center;justify-content:center;transition:background 0.2s;
      ">×</button>
    </div>
    ${elapsed ? `<div style="font-size:12px;opacity:0.9;margin-top:8px">Response time: ${elapsed}s</div>` : ''}
  `;

  const content = document.createElement('div');
  content.style.cssText = `padding:25px;flex:1;overflow-y:auto;line-height:1.8;font-size:15px;color:#333;`;

  let formattedText = feedbackText
    .split('\n\n')
    .map(para => para.trim())
    .filter(para => para.length > 0)
    .map(para => {
      let highlighted = para
        .replace(/\b(underfitting|overfitting|balanced fit|high error|low error|too simple|too complex|BST|binary search tree|sorted|unsorted|in-order|pre-order|post-order)\b/gi,
          '<strong style="color:#667eea">$1</strong>')
        .replace(/\b(degree[\s-]?\d+|degree of \d+|\d+ degree|node[\s-]?\d+)\b/gi,
          '<span style="background:#f0f0ff;padding:2px 6px;border-radius:3px;font-weight:600">$1</span>');
      return `<p style="margin-bottom:12px">${highlighted}</p>`;
    })
    .join('');

  content.innerHTML = `<div style="padding-left:12px;border-left:4px solid #667eea">${formattedText}</div>`;

  const footer = document.createElement('div');
  footer.style.cssText = `padding:20px 25px;background:#f8f9fa;border-top:1px solid #e0e0e0;flex-shrink:0;`;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Got it!';
  closeBtn.style.cssText = `
    width:100%;padding:12px 24px;
    background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
    color:white;border:none;border-radius:6px;font-weight:bold;
    cursor:pointer;font-size:16px;transition:transform 0.2s;
  `;

  const closeSidebar = () => sidebar.remove();
  closeBtn.addEventListener('click', closeSidebar);
  closeBtn.addEventListener('mouseenter', () => { closeBtn.style.transform = 'scale(1.05)'; });
  closeBtn.addEventListener('mouseleave', () => { closeBtn.style.transform = 'scale(1)'; });
  footer.appendChild(closeBtn);

  header.querySelector('#close-feedback').addEventListener('click', closeSidebar);
  header.querySelector('#close-feedback').addEventListener('mouseenter', (e) => {
    e.target.style.background = 'rgba(255,255,255,0.3)';
  });
  header.querySelector('#close-feedback').addEventListener('mouseleave', (e) => {
    e.target.style.background = 'rgba(255,255,255,0.2)';
  });

  sidebar.appendChild(header);
  sidebar.appendChild(content);
  sidebar.appendChild(footer);

  const escHandler = (e) => {
    if (e.key === 'Escape') { closeSidebar(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
  document.body.appendChild(sidebar);
}


// ─── Chat Submission ───

inputArea.addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = inputBox.value.trim();
  if (!msg) return;

  // User message
  const userMsg = document.createElement('div');
  userMsg.className = 'message user';
  userMsg.textContent = msg;
  chatArea.appendChild(userMsg);
  chatArea.scrollTop = chatArea.scrollHeight;
  inputBox.value = '';

  // Disable input, add stop button
  inputBox.disabled = true;
  const sendButton = document.querySelector('button[type="submit"]');
  const originalSendHTML = sendButton.innerHTML;
  const originalSendStyle = sendButton.style.cssText;
  sendButton.innerHTML = '⏹ Stop';
  sendButton.type = 'button';
  sendButton.style.cssText = `
    padding:12px 24px;background:#f5576c;color:white;border:none;
    border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:all 0.2s;
  `;

  // Thinking indicator
  const thinkingMsg = document.createElement('div');
  thinkingMsg.className = 'message bot';
  thinkingMsg.id = 'thinking-indicator';
  thinkingMsg.style.cssText = `
    padding:15px 20px;
    background:linear-gradient(90deg,rgba(102,126,234,0.1),rgba(118,75,162,0.1));
    border-left:4px solid #667eea;border-radius:4px;
    display:flex;align-items:center;gap:12px;
  `;

  const startTime = Date.now();
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width:20px;height:20px;border:3px solid rgba(102,126,234,0.3);
    border-top-color:#667eea;border-radius:50%;animation:spin 1s linear infinite;flex-shrink:0;
  `;
  const textContainer = document.createElement('div');
  textContainer.style.cssText = 'flex:1';
  const thinkingText = document.createElement('span');
  thinkingText.style.cssText = 'color:#667eea;font-weight:500';
  thinkingText.textContent = 'AI is thinking';
  const dots = document.createElement('span');
  dots.style.cssText = 'color:#667eea';
  const timer = document.createElement('span');
  timer.style.cssText = `margin-left:auto;font-size:12px;color:#999;font-family:monospace;flex-shrink:0`;
  timer.textContent = '0.0s';

  textContainer.appendChild(thinkingText);
  textContainer.appendChild(dots);
  thinkingMsg.appendChild(spinner);
  thinkingMsg.appendChild(textContainer);
  thinkingMsg.appendChild(timer);
  chatArea.appendChild(thinkingMsg);
  chatArea.scrollTop = chatArea.scrollHeight;

  let dotCount = 0;
  const dotInterval = setInterval(() => { dotCount = (dotCount + 1) % 4; dots.textContent = '.'.repeat(dotCount); }, 400);
  const timerInterval = setInterval(() => { timer.textContent = `${((Date.now() - startTime) / 1000).toFixed(1)}s`; }, 100);

  const abortController = new AbortController();

  const restoreInputArea = () => {
    inputBox.disabled = false;
    sendButton.type = 'submit';
    sendButton.innerHTML = originalSendHTML;
    sendButton.style.cssText = originalSendStyle;
    inputBox.focus();
  };

  const stopHandler = () => {
    abortController.abort();
    clearInterval(dotInterval);
    clearInterval(timerInterval);
    thinkingMsg.remove();
    const stoppedMsg = document.createElement('div');
    stoppedMsg.className = 'message bot';
    stoppedMsg.style.cssText = `padding:15px;background:#fff5f5;border-left:4px solid #f5576c;border-radius:4px;color:#666;font-style:italic;`;
    stoppedMsg.textContent = '⏹ Generation stopped by user.';
    chatArea.appendChild(stoppedMsg);
    chatArea.scrollTop = chatArea.scrollHeight;
    restoreInputArea();
    sendButton.removeEventListener('click', stopHandler);
  };
  sendButton.addEventListener('click', stopHandler);

  try {
    const response = await fetch('/chat_stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
      signal: abortController.signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      clearInterval(dotInterval);
      clearInterval(timerInterval);
      thinkingMsg.remove();
      const errorMsg = document.createElement('div');
      errorMsg.className = 'message bot error';
      errorMsg.textContent = 'Error: ' + (err.error || JSON.stringify(err));
      chatArea.appendChild(errorMsg);
      chatArea.scrollTop = chatArea.scrollHeight;
      sendButton.removeEventListener('click', stopHandler);
      restoreInputArea();
      return;
    }

    clearInterval(dotInterval);
    clearInterval(timerInterval);
    thinkingMsg.remove();

    const botMsg = document.createElement('div');
    botMsg.className = 'message bot';
    botMsg.innerHTML = '';
    chatArea.appendChild(botMsg);

    // Stream & collect full response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let { value, done } = await reader.read();
    let fullResponse = '';

    function renderMarkdownText(text) {
      // Full markdown-to-HTML conversion
      let html = text
        // Headers
        .replace(/^#### (.*$)/gm, '<h4 style="margin:10px 0 5px;color:#333;">$1</h4>')
        .replace(/^### (.*$)/gm, '<h3 style="margin:10px 0 5px;color:#333;">$1</h3>')
        .replace(/^## (.*$)/gm, '<h2 style="margin:12px 0 6px;color:#333;">$1</h2>')
        .replace(/^# (.*$)/gm, '<h1 style="margin:14px 0 8px;color:#333;">$1</h1>')
        // Bold and italic
        .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:2px 5px;border-radius:3px;font-size:13px;">$1</code>')
        // Bullet points
        .replace(/^\* (.*$)/gm, '<li style="margin:3px 0;margin-left:20px;">$1</li>')
        .replace(/^- (.*$)/gm, '<li style="margin:3px 0;margin-left:20px;">$1</li>')
        // Numbered lists
        .replace(/^\d+\.\s+(.*$)/gm, '<li style="margin:3px 0;margin-left:20px;">$1</li>')
        // Math-like content: $...$
        .replace(/\$([^$]+)\$/g, '<em style="font-family:serif;">$1</em>')
        // Paragraphs (double newlines)
        .replace(/\n\n/g, '</p><p style="margin:8px 0;line-height:1.7;">')
        // Single newlines within paragraphs
        .replace(/\n/g, ' ');

      // Wrap in paragraph if not starting with a block element
      if (!html.startsWith('<h') && !html.startsWith('<li')) {
        html = '<p style="margin:8px 0;line-height:1.7;">' + html + '</p>';
      }

      return html;
    }

    // Stream text to screen for real-time UX (hide marker content)
    let hidingContent = false;
    let displayedText = '';

    while (!done) {
      const chunk = decoder.decode(value, { stream: true });
      fullResponse += chunk;

      // Check if we're inside markers (don't display that content)
      if (fullResponse.includes('[SCENE_START]') || fullResponse.includes('[SUGGESTIONS_START]')) {
        hidingContent = true;
      }

      // Display streamed text (only pre-marker content)
      if (!hidingContent) {
        displayedText += chunk;
        // Re-render the full displayed text with markdown
        const cleanText = displayedText
          .replace(/\[SCENE_START\][\s\S]*/g, '')
          .replace(/\[SUGGESTIONS_START\][\s\S]*/g, '')
          .trim();
        if (cleanText) {
          // Clear and re-render (keeps formatting consistent during streaming)
          const existingDivs = botMsg.querySelectorAll('.streamed-text');
          existingDivs.forEach(d => d.remove());

          const textContainer = document.createElement('div');
          textContainer.className = 'streamed-text';
          textContainer.style.cssText = 'color:#333;font-size:15px;';
          textContainer.innerHTML = renderMarkdownText(cleanText);
          botMsg.appendChild(textContainer);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }

      ({ value, done } = await reader.read());
    }

    // ─── Post-processing: extract markers from full response ───

    let sceneDescriptor = null;
    let suggestionsData = null;

    // Extract scene descriptor
    const sceneMatch = fullResponse.match(/\[SCENE_START\]([\s\S]*?)\[SCENE_END\]/);
    if (sceneMatch) {
      try {
        let cleanJSON = sceneMatch[1].trim();
        cleanJSON = cleanJSON.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
        sceneDescriptor = JSON.parse(cleanJSON);
      } catch (e) {
        console.error('Failed to parse scene JSON:', e, sceneMatch[1]);
      }
    }

    // Extract suggestions
    const sugMatch = fullResponse.match(/\[SUGGESTIONS_START\]([\s\S]*?)\[SUGGESTIONS_END\]/);
    if (sugMatch) {
      try {
        let cleanJSON = sugMatch[1].trim();
        cleanJSON = cleanJSON.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
        suggestionsData = JSON.parse(cleanJSON);
      } catch (e) {
        console.error('Failed to parse suggestions JSON:', e, sugMatch[1]);
      }
    }

    // Extract pre-marker text (full explanation before scene/suggestions)
    let preText = '';
    const firstMarkerIdx = Math.min(
      fullResponse.includes('[SCENE_START]') ? fullResponse.indexOf('[SCENE_START]') : Infinity,
      fullResponse.includes('[SUGGESTIONS_START]') ? fullResponse.indexOf('[SUGGESTIONS_START]') : Infinity
    );
    if (firstMarkerIdx !== Infinity) {
      preText = fullResponse.substring(0, firstMarkerIdx).trim();
    } else {
      preText = fullResponse.trim();
    }

    // Extract post-marker text (instructions after [SCENE_END] or [SUGGESTIONS_END])
    let postText = '';
    if (sceneMatch) {
      const endIdx = fullResponse.indexOf('[SCENE_END]') + '[SCENE_END]'.length;
      postText = fullResponse.substring(endIdx).trim();
    } else if (sugMatch) {
      const endIdx = fullResponse.indexOf('[SUGGESTIONS_END]') + '[SUGGESTIONS_END]'.length;
      postText = fullResponse.substring(endIdx).trim();
    }

    // ─── Clear and re-render the full pre-scene text (fix any streaming clipping) ───
    const existingStreamed = botMsg.querySelectorAll('.streamed-text');
    existingStreamed.forEach(d => d.remove());

    if (preText) {
      const preDiv = document.createElement('div');
      preDiv.className = 'streamed-text';
      preDiv.style.cssText = 'color:#333;font-size:15px;line-height:1.7;';
      preDiv.innerHTML = renderMarkdownText(preText);
      botMsg.appendChild(preDiv);
    }

    // Render scene separator
    if (sceneDescriptor) {
      const separator = document.createElement('div');
      separator.style.cssText = `
        margin:15px 0 10px 0;padding:12px 15px;
        background:linear-gradient(90deg,rgba(102,126,234,0.1),rgba(118,75,162,0.1));
        border-left:4px solid #667eea;border-radius:4px;
        font-weight:600;color:#667eea;font-size:15px;
      `;
      separator.innerHTML = '🎯 Let\'s Try This Together!';
      botMsg.appendChild(separator);
    }

    // Create interactive scene FIRST (before post-text so instructions come after)
    if (sceneDescriptor) {
      createInteractiveScene(botMsg, sceneDescriptor);
    }

    // Render post-marker instructions AFTER the interactive scene
    if (postText) {
      const instrDiv = document.createElement('div');
      instrDiv.style.cssText = 'margin:15px 0;color:#333;font-size:15px;line-height:1.7;';
      instrDiv.innerHTML = renderMarkdownText(postText);
      botMsg.appendChild(instrDiv);
    }

    // Render suggestion chips
    if (suggestionsData && suggestionsData.suggestions) {
      renderSuggestionChips(botMsg, suggestionsData.suggestions);
    }

    chatArea.scrollTop = chatArea.scrollHeight;
    sendButton.removeEventListener('click', stopHandler);
    restoreInputArea();

  } catch (error) {
    clearInterval(dotInterval);
    clearInterval(timerInterval);
    thinkingMsg.remove();
    sendButton.removeEventListener('click', stopHandler);

    if (error.name === 'AbortError') {
      console.log('Request aborted by user');
      return;
    }

    console.error('Error:', error);
    const errorMsg = document.createElement('div');
    errorMsg.className = 'message bot error';
    errorMsg.textContent = 'Sorry, something went wrong. Please try again.';
    chatArea.appendChild(errorMsg);
    chatArea.scrollTop = chatArea.scrollHeight;
    restoreInputArea();
  }
});


// ─── Suggestion Chips ───

function renderSuggestionChips(botMsg, suggestions) {
  const container = document.createElement('div');
  container.style.cssText = `
    margin-top:20px;padding:20px;
    background:linear-gradient(135deg,rgba(102,126,234,0.06),rgba(118,75,162,0.06));
    border-radius:12px;border:1px solid rgba(102,126,234,0.15);
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    font-weight:700;font-size:16px;color:#667eea;margin-bottom:14px;
    display:flex;align-items:center;gap:8px;
  `;
  header.innerHTML = '🧪 Explore Interactively';
  container.appendChild(header);

  const subtext = document.createElement('div');
  subtext.style.cssText = 'font-size:13px;color:#777;margin-bottom:14px;line-height:1.5;';
  subtext.textContent = 'Click a topic below to get an interactive visualization:';
  container.appendChild(subtext);

  const grid = document.createElement('div');
  grid.style.cssText = `
    display:flex;flex-wrap:wrap;gap:10px;
  `;

  const chipColors = [
    'linear-gradient(135deg,#667eea,#764ba2)',
    'linear-gradient(135deg,#f5576c,#ff6f91)',
    'linear-gradient(135deg,#4CAF50,#2E7D32)',
    'linear-gradient(135deg,#FF9800,#F57C00)',
    'linear-gradient(135deg,#00BCD4,#00838F)',
    'linear-gradient(135deg,#9C27B0,#7B1FA2)'
  ];

  suggestions.forEach((suggestion, i) => {
    const chip = document.createElement('button');
    chip.style.cssText = `
      padding:12px 20px;
      background:${chipColors[i % chipColors.length]};
      color:white;border:none;border-radius:25px;
      font-size:14px;font-weight:600;cursor:pointer;
      transition:all 0.3s ease;
      box-shadow:0 3px 10px rgba(0,0,0,0.15);
      display:flex;align-items:center;gap:8px;
      white-space:nowrap;
    `;

    chip.innerHTML = `<span style="font-size:18px">${suggestion.icon || '💡'}</span>${suggestion.label}`;

    chip.addEventListener('mouseenter', () => {
      chip.style.transform = 'translateY(-3px) scale(1.03)';
      chip.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
    });
    chip.addEventListener('mouseleave', () => {
      chip.style.transform = '';
      chip.style.boxShadow = '0 3px 10px rgba(0,0,0,0.15)';
    });

    chip.addEventListener('click', () => {
      // Auto-send the suggestion's query
      const query = suggestion.query || suggestion.label;
      inputBox.value = query;
      inputArea.dispatchEvent(new Event('submit', { cancelable: true }));
    });

    grid.appendChild(chip);
  });

  container.appendChild(grid);
  botMsg.appendChild(container);
  chatArea.scrollTop = chatArea.scrollHeight;
}