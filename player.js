const params = new URLSearchParams(window.location.search);
const prefRoom = params.get("room") || "";

const roomInput = document.getElementById("room-input");
const nameInput = document.getElementById("name-input");
const joinBtn = document.getElementById("join-btn");
const joinMessage = document.getElementById("join-message");
const joinCard = document.getElementById("join-card");
const playCard = document.getElementById("play-card");
const playerName = document.getElementById("player-name");
const playerScore = document.getElementById("player-score");
const gameStatus = document.getElementById("game-status");
const questionText = document.getElementById("question-text");
const timer = document.getElementById("timer");
const answers = document.getElementById("answers");
const feedback = document.getElementById("feedback");
const leaderboard = document.getElementById("leaderboard");
const top3 = document.getElementById("top3");

const state = {
  roomCode: prefRoom.toUpperCase(),
  playerId: "",
  name: "",
  lastQuestionId: -1,
  answered: false
};

roomInput.value = state.roomCode;

async function api(path, method = "GET", body = null) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Request failed");
  }
  return response.json();
}

function renderLeaderboard(players) {
  leaderboard.innerHTML = "";
  players.forEach((player, index) => {
    const item = document.createElement("li");
    item.textContent = `${index + 1}. ${player.name} — ${player.score}`;
    leaderboard.appendChild(item);
  });
}

function renderTop3(players) {
  top3.innerHTML = "";
  players.slice(0, 3).forEach((player, index) => {
    const item = document.createElement("li");
    item.textContent = `#${index + 1} ${player.name} — ${player.score}`;
    top3.appendChild(item);
  });
}

function renderQuestion(question) {
  if (!question || question.index !== state.lastQuestionId) {
    state.lastQuestionId = question ? question.index : -1;
    state.answered = false;
    feedback.textContent = "";
  }

  answers.innerHTML = "";
  if (!question) {
    questionText.textContent = "Waiting for next question...";
    return;
  }

  questionText.textContent = question.text;
  question.answers.forEach((answer, answerIndex) => {
    const button = document.createElement("button");
    button.className = "answer-btn";
    button.textContent = answer;
    button.disabled = state.answered;
    button.addEventListener("click", async () => {
      if (state.answered) return;
      try {
        await api("/api/answer", "POST", {
          roomCode: state.roomCode,
          playerId: state.playerId,
          answerIndex
        });
        state.answered = true;
        feedback.textContent = "Answer locked";
        renderQuestion(question);
      } catch (error) {
        feedback.textContent = error.message;
      }
    });
    answers.appendChild(button);
  });
}

async function joinGame() {
  const roomCode = roomInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();
  if (!roomCode || !name) {
    joinMessage.textContent = "Add room code and name";
    return;
  }

  try {
    const data = await api("/api/join", "POST", { roomCode, name });
    state.roomCode = roomCode;
    state.playerId = data.playerId;
    state.name = name;
    playerName.textContent = name;
    joinCard.classList.add("hidden");
    playCard.classList.remove("hidden");
  } catch (error) {
    joinMessage.textContent = error.message;
  }
}

async function pollState() {
  if (!state.playerId || !state.roomCode) return;
  try {
    const data = await api(`/api/room/${state.roomCode}/state?role=player&playerId=${encodeURIComponent(state.playerId)}`);
    playerScore.textContent = `Score: ${data.playerScore}`;
    gameStatus.textContent = data.status === "question" ? "Status: Live" : `Status: ${data.status}`;
    timer.textContent = data.remainingSeconds ? data.remainingSeconds : "-";
    renderLeaderboard(data.players || []);

    if (data.status === "question") {
      renderQuestion(data.currentQuestion);
    } else if (data.status === "ended") {
      questionText.textContent = "Game finished";
      answers.innerHTML = "";
      renderTop3(data.players || []);
    } else {
      questionText.textContent = "Waiting for host to start";
      answers.innerHTML = "";
    }
  } catch (error) {
    gameStatus.textContent = error.message;
  }
}

joinBtn.addEventListener("click", joinGame);
setInterval(pollState, 900);
