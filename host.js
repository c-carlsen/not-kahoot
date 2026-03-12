const state = {
  roomCode: "",
  hostToken: "",
  draftQuestions: []
};

const roomPill = document.getElementById("room-pill");
const statusText = document.getElementById("status-text");
const questionList = document.getElementById("question-list");
const currentQuestion = document.getElementById("current-question");
const timer = document.getElementById("timer");
const leaderboard = document.getElementById("leaderboard");
const top3 = document.getElementById("top3");
const shareLink = document.getElementById("share-link");
const playerCount = document.getElementById("player-count");

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

function renderDraftQuestions() {
  questionList.innerHTML = "";
  state.draftQuestions.forEach((q, index) => {
    const item = document.createElement("li");
    item.textContent = `${index + 1}. ${q.text}`;
    questionList.appendChild(item);
  });
}

function getBuilderInput() {
  const text = document.getElementById("question-text").value.trim();
  const answers = [
    document.getElementById("ans-1").value.trim(),
    document.getElementById("ans-2").value.trim(),
    document.getElementById("ans-3").value.trim(),
    document.getElementById("ans-4").value.trim()
  ];
  const correctIndex = Number(document.getElementById("correct-index").value);
  return { text, answers, correctIndex };
}

function clearBuilder() {
  document.getElementById("question-text").value = "";
  document.getElementById("ans-1").value = "";
  document.getElementById("ans-2").value = "";
  document.getElementById("ans-3").value = "";
  document.getElementById("ans-4").value = "";
  document.getElementById("correct-index").value = "0";
}

async function createRoom() {
  const data = await api("/api/create-room", "POST");
  state.roomCode = data.roomCode;
  state.hostToken = data.hostToken;
  roomPill.textContent = data.roomCode;
  if (shareLink) {
    shareLink.value = `${window.location.origin}/player.html?room=${data.roomCode}`;
  }
}

async function saveQuestions() {
  if (!state.roomCode) throw new Error("Create a room first");
  if (!state.draftQuestions.length) throw new Error("Add at least one question");
  await api(`/api/room/${state.roomCode}/questions`, "PUT", {
    hostToken: state.hostToken,
    questions: state.draftQuestions
  });
}

async function startGame() {
  if (!state.roomCode) throw new Error("Create a room first");
  await api(`/api/room/${state.roomCode}/start`, "POST", { hostToken: state.hostToken });
}

async function nextQuestion() {
  if (!state.roomCode) return;
  await api(`/api/room/${state.roomCode}/next`, "POST", { hostToken: state.hostToken });
}

function renderBoard(players) {
  leaderboard.innerHTML = "";
  players.forEach((player, index) => {
    const item = document.createElement("li");
    item.textContent = `${index + 1}. ${player.name} — ${player.score}`;
    leaderboard.appendChild(item);
  });
  if (playerCount) {
    playerCount.textContent = `Players joined: ${players.length}`;
  }
}

function renderTop3(players) {
  top3.innerHTML = "";
  players.slice(0, 3).forEach((player, index) => {
    const item = document.createElement("li");
    item.textContent = `#${index + 1} ${player.name} — ${player.score}`;
    top3.appendChild(item);
  });
}

async function pollState() {
  if (!state.roomCode || !state.hostToken) return;
  try {
    const data = await api(`/api/room/${state.roomCode}/state?hostToken=${encodeURIComponent(state.hostToken)}&role=host`);
    statusText.textContent = data.status === "question" ? "Live" : data.status;
    timer.textContent = data.remainingSeconds ? data.remainingSeconds : "-";
    currentQuestion.textContent = data.currentQuestionText || "No active question";
    renderBoard(data.players || []);
    if (data.status === "ended") {
      renderTop3(data.players || []);
    }
  } catch (_) {
  }
}

document.getElementById("create-room-btn").addEventListener("click", async () => {
  try {
    await createRoom();
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("add-question-btn").addEventListener("click", () => {
  const question = getBuilderInput();
  if (!question.text || question.answers.some((answer) => !answer)) {
    alert("Fill in question and all answers");
    return;
  }
  state.draftQuestions.push(question);
  renderDraftQuestions();
  clearBuilder();
});

document.getElementById("save-questions-btn").addEventListener("click", async () => {
  try {
    await saveQuestions();
    alert("Questions saved");
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("start-game-btn").addEventListener("click", async () => {
  try {
    await startGame();
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("next-question-btn").addEventListener("click", async () => {
  try {
    await nextQuestion();
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("copy-link-btn").addEventListener("click", async () => {
  if (!shareLink.value) return;
  try {
    await navigator.clipboard.writeText(shareLink.value);
  } catch (_) {
  }
});

setInterval(pollState, 900);
