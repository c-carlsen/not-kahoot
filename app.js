const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const baseDir = path.join(__dirname);

// TODO: Put ADMIN_KEY in your .env file to protect future admin routes.
const adminKey = process.env.ADMIN_KEY || "";

const QUESTION_DURATION_SECONDS = Number(process.env.QUESTION_DURATION_SECONDS || 20);

const rooms = new Map();

app.use(express.json());
app.use(express.static(baseDir));

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function getNow() {
  return Date.now();
}

function remainingSeconds(room) {
  if (room.status !== "question" || room.currentIndex < 0) return 0;
  const elapsed = (getNow() - room.questionStart) / 1000;
  return Math.max(0, Math.floor(QUESTION_DURATION_SECONDS - elapsed));
}

function ensureQuestionAdvance(room) {
  if (room.status === "question" && remainingSeconds(room) <= 0) {
    room.status = "lobby";
  }
}

function sortedPlayers(room) {
  return [...room.players.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
}

function publicPlayers(room) {
  return sortedPlayers(room).map((player) => ({ name: player.name, score: player.score }));
}

app.post("/api/create-room", (req, res) => {
  const roomCode = makeRoomCode();
  const hostToken = crypto.randomUUID().replace(/-/g, "");
  rooms.set(roomCode, {
    hostToken,
    status: "lobby",
    questions: [],
    currentIndex: -1,
    questionStart: 0,
    players: new Map(),
    answersByQuestion: new Map()
  });

  res.json({ roomCode, hostToken });
});

app.post("/api/join", (req, res) => {
  const roomCode = String(req.body.roomCode || "").toUpperCase();
  const name = String(req.body.name || "").trim();
  if (!roomCode || !name) {
    res.status(400).json({ error: "roomCode and name required" });
    return;
  }

  const room = rooms.get(roomCode);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const playerId = crypto.randomUUID().replace(/-/g, "");
  room.players.set(playerId, { id: playerId, name: name.slice(0, 24), score: 0 });
  res.json({ playerId });
});

app.put("/api/room/:code/questions", (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const { hostToken, questions } = req.body || {};
  if (!Array.isArray(questions)) {
    res.status(400).json({ error: "questions must be a list" });
    return;
  }

  const room = rooms.get(roomCode);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  if (room.hostToken !== hostToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const normalized = [];
  for (const question of questions) {
    const text = String(question.text || "").trim();
    const answers = Array.isArray(question.answers) ? question.answers : [];
    const correctIndex = Number(question.correctIndex || 0);
    if (!text || answers.length !== 4) {
      res.status(400).json({ error: "Invalid question format" });
      return;
    }
    const cleaned = answers.map((answer) => String(answer || "").trim());
    if (cleaned.some((answer) => !answer)) {
      res.status(400).json({ error: "All answers are required" });
      return;
    }
    if (correctIndex < 0 || correctIndex > 3) {
      res.status(400).json({ error: "correctIndex must be 0-3" });
      return;
    }
    normalized.push({ text, answers: cleaned, correctIndex });
  }

  room.questions = normalized;
  room.status = "lobby";
  room.currentIndex = -1;
  room.answersByQuestion = new Map();
  res.json({ ok: true, questionCount: normalized.length });
});

app.post("/api/room/:code/start", (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const { hostToken } = req.body || {};
  const room = rooms.get(roomCode);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  if (room.hostToken !== hostToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!room.questions.length) {
    res.status(400).json({ error: "No questions saved" });
    return;
  }

  room.status = "question";
  room.currentIndex = 0;
  room.questionStart = getNow();
  room.answersByQuestion.set(0, new Map());
  res.json({ ok: true });
});

app.post("/api/room/:code/next", (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const { hostToken } = req.body || {};
  const room = rooms.get(roomCode);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  if (room.hostToken !== hostToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const nextIndex = room.currentIndex + 1;
  if (nextIndex >= room.questions.length) {
    room.status = "ended";
    room.currentIndex = -1;
  } else {
    room.status = "question";
    room.currentIndex = nextIndex;
    room.questionStart = getNow();
    room.answersByQuestion.set(nextIndex, new Map());
  }
  res.json({ ok: true });
});

app.post("/api/answer", (req, res) => {
  const roomCode = String(req.body.roomCode || "").toUpperCase();
  const playerId = String(req.body.playerId || "");
  const answerIndex = Number(req.body.answerIndex);

  const room = rooms.get(roomCode);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  if (room.status !== "question" || room.currentIndex < 0) {
    res.status(400).json({ error: "No active question" });
    return;
  }

  const player = room.players.get(playerId);
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  ensureQuestionAdvance(room);
  if (room.status !== "question") {
    res.status(400).json({ error: "Question time ended" });
    return;
  }

  const qIndex = room.currentIndex;
  const answers = room.answersByQuestion.get(qIndex) || new Map();
  if (answers.has(playerId)) {
    res.status(400).json({ error: "Already answered" });
    return;
  }

  answers.set(playerId, answerIndex);
  room.answersByQuestion.set(qIndex, answers);
  const q = room.questions[qIndex];
  if (answerIndex === Number(q.correctIndex)) {
    const points = 500 + remainingSeconds(room) * 20;
    player.score += points;
  }
  res.json({ ok: true });
});

app.get("/api/room/:code/state", (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const role = String(req.query.role || "");
  const hostToken = String(req.query.hostToken || "");
  const playerId = String(req.query.playerId || "");

  const room = rooms.get(roomCode);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  ensureQuestionAdvance(room);

  if (role === "host") {
    if (room.hostToken !== hostToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const currentQuestionText =
      room.status === "question" && room.currentIndex >= 0
        ? room.questions[room.currentIndex].text
        : "";

    res.json({
      status: room.status,
      remainingSeconds: remainingSeconds(room),
      players: publicPlayers(room),
      currentQuestionText
    });
    return;
  }

  if (role === "player") {
    const player = room.players.get(playerId);
    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    const payload = {
      status: room.status,
      remainingSeconds: remainingSeconds(room),
      playerScore: player.score,
      players: publicPlayers(room),
      currentQuestion: null
    };

    if (room.status === "question" && room.currentIndex >= 0) {
      const q = room.questions[room.currentIndex];
      payload.currentQuestion = {
        index: room.currentIndex,
        text: q.text,
        answers: q.answers
      };
    }

    res.json(payload);
    return;
  }

  res.status(400).json({ error: "Invalid role" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

module.exports = { app, adminKey };
