const questions = [
  {
    question: "Which language runs in the browser?",
    answers: ["Python", "JavaScript", "C", "Java"],
    correctIndex: 1
  },
  {
    question: "What does CSS control?",
    answers: ["Styling", "Databases", "Server routing", "Version control"],
    correctIndex: 0
  },
  {
    question: "HTML stands for?",
    answers: [
      "Hyperlinks and Text Markup Language",
      "Home Tool Markup Language",
      "HyperText Markup Language",
      "Hyper Trainer Marking Language"
    ],
    correctIndex: 2
  }
];

const startScreen = document.getElementById("start-screen");
const quizScreen = document.getElementById("quiz-screen");
const resultScreen = document.getElementById("result-screen");
const questionCount = document.getElementById("question-count");
const timerText = document.getElementById("timer");
const questionText = document.getElementById("question-text");
const answersBox = document.getElementById("answers");
const feedback = document.getElementById("feedback");
const scoreText = document.getElementById("score-text");
const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");

let currentQuestion = 0;
let score = 0;
let timeLeft = 15;
let timer = null;

function showScreen(screen) {
  startScreen.classList.add("hidden");
  quizScreen.classList.add("hidden");
  resultScreen.classList.add("hidden");
  screen.classList.remove("hidden");
}

function startGame() {
  currentQuestion = 0;
  score = 0;
  showScreen(quizScreen);
  renderQuestion();
}

function renderQuestion() {
  clearInterval(timer);
  const q = questions[currentQuestion];
  questionCount.textContent = `Question ${currentQuestion + 1}/${questions.length}`;
  questionText.textContent = q.question;
  feedback.textContent = "";
  answersBox.innerHTML = "";
  timeLeft = 15;
  timerText.textContent = `${timeLeft}s`;

  q.answers.forEach((answer, index) => {
    const button = document.createElement("button");
    button.className = "answer-btn";
    button.textContent = answer;
    button.addEventListener("click", () => selectAnswer(index));
    answersBox.appendChild(button);
  });

  timer = setInterval(() => {
    timeLeft -= 1;
    timerText.textContent = `${timeLeft}s`;
    if (timeLeft <= 0) {
      clearInterval(timer);
      feedback.textContent = "Time is up!";
      lockAnswers();
      setTimeout(nextQuestion, 900);
    }
  }, 1000);
}

function lockAnswers() {
  const buttons = [...document.querySelectorAll(".answer-btn")];
  buttons.forEach((button) => {
    button.disabled = true;
  });
}

function selectAnswer(index) {
  clearInterval(timer);
  const q = questions[currentQuestion];
  const buttons = [...document.querySelectorAll(".answer-btn")];
  buttons.forEach((button, btnIndex) => {
    button.disabled = true;
    if (btnIndex === q.correctIndex) button.classList.add("correct");
  });

  if (index === q.correctIndex) {
    const earned = 500 + timeLeft * 20;
    score += earned;
    feedback.textContent = `Correct! +${earned} points`;
  } else {
    buttons[index].classList.add("wrong");
    feedback.textContent = "Wrong answer";
  }

  setTimeout(nextQuestion, 900);
}

function nextQuestion() {
  currentQuestion += 1;
  if (currentQuestion < questions.length) {
    renderQuestion();
  } else {
    finishGame();
  }
}

function finishGame() {
  clearInterval(timer);
  showScreen(resultScreen);
  scoreText.textContent = `Your final score is ${score}.`;
}

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);
