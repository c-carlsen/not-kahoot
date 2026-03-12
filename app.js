const express = require("express");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const baseDir = path.join(__dirname);
const clientDist = path.join(baseDir, "client", "dist");

// TODO: Put ADMIN_KEY in your .env file to protect future admin routes.
const adminKey = process.env.ADMIN_KEY || "";

// TODO: Add your Supabase project URL + service key in .env and Vercel env vars.
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || "";
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

const QUESTION_DURATION_SECONDS = Number(process.env.QUESTION_DURATION_SECONDS || 20);
const REVEAL_DURATION_SECONDS = Number(process.env.REVEAL_DURATION_SECONDS || 6);

const rooms = new Map();

app.use(express.json());

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}
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
  if (room.status !== "question" || room.currentIndex < 0) return;
  const answers = room.answersByQuestion.get(room.currentIndex) || new Map();
  const allAnswered = room.players.size > 0 && answers.size >= room.players.size;
  if (remainingSeconds(room) <= 0 || allAnswered) {
    room.status = "reveal";
    room.revealStart = getNow();
  }
}

function ensureRevealAdvance(room) {
  if (room.status !== "reveal") return;
  const elapsed = (getNow() - room.revealStart) / 1000;
  if (elapsed >= REVEAL_DURATION_SECONDS) {
    room.status = "leaderboard";
  }
}

function resetPlayerRound(room) {
  room.players.forEach((player) => {
    player.lastPoints = 0;
    player.lastCorrect = null;
    player.lastAnswerIndex = null;
  });
}

function requireSupabase(res) {
  if (!supabase) {
    res.status(500).json({ error: "Supabase is not configured" });
    return false;
  }
  return true;
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
    revealStart: 0,
    players: new Map(),
    answersByQuestion: new Map(),
    quizId: null,
    quizTitle: ""
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
  room.players.set(playerId, {
    id: playerId,
    name: name.slice(0, 24),
    score: 0,
    lastPoints: 0,
    lastCorrect: null,
    lastAnswerIndex: null
  });
  res.json({ playerId });
});

app.get("/api/quizzes", async (req, res) => {
  if (!requireSupabase(res)) return;
  const { data, error } = await supabase
    .from("quizzes")
    .select("id,title,questions")
    .order("created_at", { ascending: false });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const formatted = (data || []).map((quiz) => ({
    id: quiz.id,
    title: quiz.title,
    questionCount: Array.isArray(quiz.questions) ? quiz.questions.length : 0
  }));
  res.json({ quizzes: formatted });
});

app.get("/api/quizzes/:id", async (req, res) => {
  if (!requireSupabase(res)) return;
  const { data, error } = await supabase.from("quizzes").select("id,title,questions").eq("id", req.params.id).single();
  if (error || !data) {
    res.status(404).json({ error: "Quiz not found" });
    return;
  }
  res.json({ quiz: data });
});

app.post("/api/quizzes", async (req, res) => {
  if (!requireSupabase(res)) return;
  const title = String(req.body.title || "").trim();
  const questions = Array.isArray(req.body.questions) ? req.body.questions : [];
  if (!title) {
    res.status(400).json({ error: "title is required" });
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

  const { data, error } = await supabase
    .from("quizzes")
    .insert({ title, questions: normalized })
    .select("id,title")
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ quiz: data });
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
  room.quizId = null;
  room.quizTitle = "";
  res.json({ ok: true, questionCount: normalized.length });
});

app.post("/api/room/:code/load-quiz", async (req, res) => {
  if (!requireSupabase(res)) return;
  const roomCode = req.params.code.toUpperCase();
  const { hostToken, quizId } = req.body || {};
  const room = rooms.get(roomCode);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  if (room.hostToken !== hostToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!quizId) {
    res.status(400).json({ error: "quizId is required" });
    return;
  }

  const { data, error } = await supabase.from("quizzes").select("id,title,questions").eq("id", quizId).single();
  if (error || !data) {
    res.status(404).json({ error: "Quiz not found" });
    return;
  }

  room.questions = Array.isArray(data.questions) ? data.questions : [];
  room.quizId = data.id;
  room.quizTitle = data.title;
  room.status = "lobby";
  room.currentIndex = -1;
  room.answersByQuestion = new Map();
  res.json({ ok: true, quizTitle: data.title, questionCount: room.questions.length });
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
  room.revealStart = 0;
  resetPlayerRound(room);
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
    room.revealStart = 0;
    resetPlayerRound(room);
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
    player.lastPoints = points;
    player.lastCorrect = true;
  } else {
    player.lastPoints = 0;
    player.lastCorrect = false;
  }
  player.lastAnswerIndex = answerIndex;

  ensureQuestionAdvance(room);
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
  ensureRevealAdvance(room);

  if (role === "host") {
    if (room.hostToken !== hostToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const currentQuestionText =
      room.status === "question" && room.currentIndex >= 0
        ? room.questions[room.currentIndex].text
        : "";
    const totalPlayers = room.players.size;
    const answerCounts = [0, 0, 0, 0];
    let answeredCount = 0;
    const roundLeaders = [...room.players.values()]
      .map((player) => ({
        name: player.name,
        score: player.score,
        lastPoints: player.lastPoints || 0
      }))
      .sort((a, b) => {
        if (b.lastPoints !== a.lastPoints) return b.lastPoints - a.lastPoints;
        if (b.score !== a.score) return b.score - a.score;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 5);

    if (room.currentIndex >= 0) {
      const answers = room.answersByQuestion.get(room.currentIndex) || new Map();
      answeredCount = answers.size;
      answers.forEach((answerIndex) => {
        if (typeof answerIndex === "number" && answerIndex >= 0 && answerIndex < answerCounts.length) {
          answerCounts[answerIndex] += 1;
        }
      });
    }

    res.json({
      status: room.status,
      remainingSeconds: remainingSeconds(room),
      players: publicPlayers(room),
      currentQuestionText,
      quizTitle: room.quizTitle,
      totalPlayers,
      answeredCount,
      answerCounts,
      roundLeaders
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
      currentQuestion: null,
      playerLastPoints: player.lastPoints,
      playerLastCorrect: player.lastCorrect,
      playerLastAnswerIndex: player.lastAnswerIndex,
      totalPlayers: room.players.size,
      playerRank: 0
    };

    const rankIndex = sortedPlayers(room).findIndex((row) => row.id === player.id);
    payload.playerRank = rankIndex >= 0 ? rankIndex + 1 : 0;

    if (room.status === "question" && room.currentIndex >= 0) {
      const q = room.questions[room.currentIndex];
      payload.currentQuestion = {
        index: room.currentIndex,
        text: q.text,
        answers: q.answers
      };
    }

    if ((room.status === "reveal" || room.status === "leaderboard") && room.currentIndex >= 0) {
      const q = room.questions[room.currentIndex];
      payload.currentQuestion = {
        index: room.currentIndex,
        text: q.text,
        answers: q.answers,
        correctIndex: q.correctIndex
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

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.includes(".")) {
    next();
    return;
  }

  if (fs.existsSync(clientDist)) {
    res.sendFile(path.join(clientDist, "index.html"));
    return;
  }

  res.sendFile(path.join(baseDir, "index.html"));
});

module.exports = { app, adminKey };
