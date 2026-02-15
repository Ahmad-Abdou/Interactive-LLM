// Quiz System - Modal with Scrollable Questions
// Fixed: Question area scrolls when content is too long

class QuizSystem {
  constructor() {
    this.questions = [];
    this.currentQuestionIndex = 0;
    this.answers = {};
    this.startTime = null;
    this.timerInterval = null;
    this.timeRemaining = 300;
  }

  async startQuiz() {
    try {
      const response = await fetch('/start_quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to start quiz');
      }

      const data = await response.json();
      this.questions = data.questions;
      this.timeRemaining = data.time_limit_seconds;
      this.startTime = Date.now();

      this.showQuizModal();
      this.startTimer();
      this.displayQuestion(0);

    } catch (error) {
      console.error('Error starting quiz:', error);
      alert('Failed to start quiz. Please try again.');
    }
  }

  showQuizModal() {
    if (!document.getElementById('quiz-animations')) {
      const style = document.createElement('style');
      style.id = 'quiz-animations';
      style.textContent = `
        @keyframes quizFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes quizSlideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    // Full-screen overlay
    const overlay = document.createElement('div');
    overlay.id = 'quiz-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: quizFadeIn 0.3s ease-out;
      overflow-y: auto;
      padding: 20px;
      box-sizing: border-box;
    `;

    // Modal container
    const modal = document.createElement('div');
    modal.id = 'quiz-modal';
    modal.style.cssText = `
      background: white;
      border-radius: 12px;
      width: 900px;
      max-width: 100%;
      max-height: 95vh;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      animation: quizSlideUp 0.4s ease-out;
      display: flex;
      flex-direction: column;
      position: relative;
    `;

    // Header (fixed)
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 25px 30px;
      border-bottom: 2px solid #e0e0e0;
      background: #f8f9fa;
      border-radius: 12px 12px 0 0;
      flex-shrink: 0;
    `;
    header.innerHTML = `
      <div>
        <h2 style="margin: 0; font-size: 24px; color: #333;">Underfitting & Overfitting Quiz</h2>
        <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Test your understanding</p>
      </div>
      <div id="timer" style="
        font-size: 32px;
        font-weight: bold;
        color: #667eea;
        padding: 12px 24px;
        background: #f0f0ff;
        border-radius: 8px;
        font-family: monospace;
        min-width: 100px;
        text-align: center;
      ">5:00</div>
    `;

    // Progress (fixed)
    const progress = document.createElement('div');
    progress.id = 'quiz-progress';
    progress.style.cssText = `
      padding: 15px 30px;
      font-size: 14px;
      color: #666;
      background: white;
      border-bottom: 1px solid #e0e0e0;
      flex-shrink: 0;
    `;

    // Question container (SCROLLABLE)
    const questionContainer = document.createElement('div');
    questionContainer.id = 'question-container';
    questionContainer.style.cssText = `
      padding: 25px 30px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
    `;

    // Navigation (fixed)
    const navButtons = document.createElement('div');
    navButtons.style.cssText = `
      display: flex;
      justify-content: space-between;
      padding: 20px 30px;
      gap: 15px;
      border-top: 2px solid #e0e0e0;
      background: #f8f9fa;
      border-radius: 0 0 12px 12px;
      flex-shrink: 0;
    `;

    const prevButton = document.createElement('button');
    prevButton.id = 'prev-question';
    prevButton.textContent = '← Previous';
    prevButton.style.cssText = `
      padding: 14px 28px;
      background: white;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      color: #666;
    `;
    prevButton.addEventListener('click', () => this.previousQuestion());

    const nextButton = document.createElement('button');
    nextButton.id = 'next-question';
    nextButton.textContent = 'Next →';
    nextButton.style.cssText = `
      padding: 14px 28px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    `;
    nextButton.addEventListener('click', () => this.nextQuestion());

    navButtons.appendChild(prevButton);
    navButtons.appendChild(nextButton);

    modal.appendChild(header);
    modal.appendChild(progress);
    modal.appendChild(questionContainer);
    modal.appendChild(navButtons);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  displayQuestion(index) {
    this.currentQuestionIndex = index;
    const question = this.questions[index];

    const progress = document.getElementById('quiz-progress');
    progress.innerHTML = `<strong>Question ${index + 1}</strong> of ${this.questions.length}`;

    const container = document.getElementById('question-container');
    container.innerHTML = '';
    container.scrollTop = 0; // Scroll to top when new question loads

    // Image (constrained)
    const imageDiv = document.createElement('div');
    imageDiv.style.cssText = `
      text-align: center;
      background: #f9f9f9;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    `;
    const img = document.createElement('img');
    img.src = `/static/quiz_images/${question.image}`;
    img.style.cssText = `
      max-width: 100%;
      max-height: 300px;
      height: auto;
      border: 1px solid #ddd;
      border-radius: 4px;
      object-fit: contain;
    `;
    imageDiv.appendChild(img);
    container.appendChild(imageDiv);

    // Question text
    const questionText = document.createElement('div');
    questionText.style.cssText = `
      font-size: 16px;
      color: #333;
      margin-bottom: 20px;
      line-height: 1.6;
      font-weight: 500;
    `;
    questionText.textContent = question.question;
    container.appendChild(questionText);

    // Options
    const optionsDiv = document.createElement('div');
    optionsDiv.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;

    question.options.forEach((option, optIndex) => {
      const optionDiv = document.createElement('div');
      optionDiv.style.cssText = `
        padding: 12px 16px;
        background: white;
        border: 2px solid #e0e0e0;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 15px;
        line-height: 1.4;
      `;

      const optionLetter = option.charAt(0);
      const isSelected = this.answers[question.id] === optionLetter;

      if (isSelected) {
        optionDiv.style.background = '#667eea';
        optionDiv.style.color = 'white';
        optionDiv.style.borderColor = '#667eea';
      }

      optionDiv.addEventListener('mouseenter', () => {
        if (!isSelected) {
          optionDiv.style.background = '#f5f5ff';
          optionDiv.style.borderColor = '#667eea';
        }
      });

      optionDiv.addEventListener('mouseleave', () => {
        if (!isSelected) {
          optionDiv.style.background = 'white';
          optionDiv.style.borderColor = '#e0e0e0';
        }
      });

      optionDiv.addEventListener('click', () => {
        this.selectAnswer(question.id, optionLetter);
        this.displayQuestion(index);
      });

      optionDiv.textContent = option;
      optionsDiv.appendChild(optionDiv);
    });

    container.appendChild(optionsDiv);
    this.updateNavButtons();
  }

  selectAnswer(questionId, answer) {
    this.answers[questionId] = answer;
  }

  updateNavButtons() {
    const prevButton = document.getElementById('prev-question');
    const nextButton = document.getElementById('next-question');

    if (this.currentQuestionIndex === 0) {
      prevButton.disabled = true;
      prevButton.style.opacity = '0.5';
      prevButton.style.cursor = 'not-allowed';
    } else {
      prevButton.disabled = false;
      prevButton.style.opacity = '1';
      prevButton.style.cursor = 'pointer';
    }

    if (this.currentQuestionIndex === this.questions.length - 1) {
      nextButton.textContent = 'Submit Quiz';
      nextButton.style.background = '#4CAF50';
    } else {
      nextButton.textContent = 'Next →';
      nextButton.style.background = '#667eea';
    }
  }

  previousQuestion() {
    if (this.currentQuestionIndex > 0) {
      this.displayQuestion(this.currentQuestionIndex - 1);
    }
  }

  nextQuestion() {
    if (this.currentQuestionIndex < this.questions.length - 1) {
      this.displayQuestion(this.currentQuestionIndex + 1);
    } else {
      this.confirmSubmit();
    }
  }

  confirmSubmit() {
    const answeredCount = Object.keys(this.answers).length;
    const totalQuestions = this.questions.length;

    if (answeredCount < totalQuestions) {
      const unanswered = totalQuestions - answeredCount;
      if (!confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) {
        return;
      }
    }

    this.submitQuiz();
  }

  async submitQuiz() {
    try {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
      }

      const timeTaken = Math.floor((Date.now() - this.startTime) / 1000);

      const response = await fetch('/submit_quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: this.answers,
          time_taken_seconds: timeTaken
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit quiz');
      }

      const results = await response.json();
      this.showResults(results);

    } catch (error) {
      console.error('Error submitting quiz:', error);
      alert('Failed to submit quiz. Please try again.');
    }
  }

  showResults(results) {
    const overlay = document.getElementById('quiz-modal-overlay');
    if (!overlay) return;

    const modal = document.getElementById('quiz-modal');
    modal.innerHTML = '';
    modal.style.maxHeight = '95vh';
    modal.style.overflowY = 'auto';

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      text-align: center;
      padding: 50px 30px;
      background: ${results.passed ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'};
      color: white;
      border-radius: 12px 12px 0 0;
    `;

    const emoji = results.passed ? '🎉' : '📚';
    const message = results.passed ? 'Great Job!' : 'Keep Learning!';
    
    header.innerHTML = `
      <div style="font-size: 72px; margin-bottom: 15px;">${emoji}</div>
      <h2 style="margin: 0; font-size: 36px; font-weight: bold;">${message}</h2>
      <p style="margin: 15px 0 0 0; font-size: 20px; opacity: 0.95;">
        Score: ${results.score}/${results.total} (${results.percentage.toFixed(0)}%)
      </p>
    `;

    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = 'padding: 30px;';

    // Time
    const timeDiv = document.createElement('div');
    timeDiv.style.cssText = `
      text-align: center;
      margin-bottom: 30px;
      font-size: 16px;
      color: #666;
    `;
    const minutes = Math.floor(results.time_taken / 60);
    const seconds = results.time_taken % 60;
    timeDiv.textContent = `Completed in ${minutes}:${seconds.toString().padStart(2, '0')}`;

    // Results
    const resultsDiv = document.createElement('div');
    
    results.results.forEach((result, index) => {
      const questionDiv = document.createElement('div');
      questionDiv.style.cssText = `
        margin-bottom: 25px;
        padding: 20px;
        background: ${result.is_correct ? '#f0fff4' : '#fff5f5'};
        border-left: 4px solid ${result.is_correct ? '#4CAF50' : '#f5576c'};
        border-radius: 8px;
      `;

      const icon = result.is_correct ? '✓' : '✗';
      const iconColor = result.is_correct ? '#4CAF50' : '#f5576c';

      questionDiv.innerHTML = `
        <div style="display: flex; align-items: start; gap: 15px;">
          <div style="
            font-size: 28px;
            font-weight: bold;
            color: ${iconColor};
            flex-shrink: 0;
          ">${icon}</div>
          <div style="flex: 1;">
            <div style="font-weight: bold; margin-bottom: 10px; color: #333; font-size: 16px;">
              Question ${index + 1}: ${result.question}
            </div>
            <div style="margin-bottom: 10px; font-size: 15px;">
              <strong>Your answer:</strong> ${result.selected || 'No answer'}
              ${!result.is_correct ? `<br><strong style="color: #4CAF50;">Correct answer:</strong> ${result.correct}` : ''}
            </div>
            <div style="margin-top: 12px; padding: 15px; background: white; border-radius: 6px; font-size: 14px; line-height: 1.7;">
              <strong>Explanation:</strong> ${result.explanation}
            </div>
          </div>
        </div>
      `;

      resultsDiv.appendChild(questionDiv);
    });

    // Back button
    const buttonDiv = document.createElement('div');
    buttonDiv.style.cssText = `
      text-align: center;
      margin-top: 30px;
      padding-top: 30px;
      border-top: 2px solid #e0e0e0;
    `;

    const backButton = document.createElement('button');
    backButton.textContent = 'Back to Learning';
    backButton.style.cssText = `
      padding: 16px 40px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
    `;
    backButton.addEventListener('click', () => {
      overlay.remove();
    });
    backButton.addEventListener('mouseenter', () => {
      backButton.style.background = '#5568d3';
      backButton.style.transform = 'scale(1.05)';
    });
    backButton.addEventListener('mouseleave', () => {
      backButton.style.background = '#667eea';
      backButton.style.transform = 'scale(1)';
    });

    buttonDiv.appendChild(backButton);

    contentWrapper.appendChild(timeDiv);
    contentWrapper.appendChild(resultsDiv);
    contentWrapper.appendChild(buttonDiv);

    modal.appendChild(header);
    modal.appendChild(contentWrapper);
  }

  startTimer() {
    const timerElement = document.getElementById('timer');

    this.timerInterval = setInterval(() => {
      this.timeRemaining--;

      const minutes = Math.floor(this.timeRemaining / 60);
      const seconds = this.timeRemaining % 60;
      timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      if (this.timeRemaining <= 60) {
        timerElement.style.color = '#f5576c';
        timerElement.style.background = '#ffe0e0';
      } else if (this.timeRemaining <= 120) {
        timerElement.style.color = '#ff9800';
        timerElement.style.background = '#fff3e0';
      }

      if (this.timeRemaining <= 0) {
        clearInterval(this.timerInterval);
        alert('Time is up! Submitting your quiz now.');
        this.submitQuiz();
      }
    }, 1000);
  }
}

const quizSystem = new QuizSystem();