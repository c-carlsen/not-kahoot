import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const EMPTY_QUESTION = {
  text: "",
  answers: ["", "", "", ""],
  correctIndex: 0
};

export default function Host() {
  const [roomCode, setRoomCode] = useState("");
  const [hostToken, setHostToken] = useState("");
  const [draft, setDraft] = useState(EMPTY_QUESTION);
  const [questions, setQuestions] = useState([]);
  const [status, setStatus] = useState("Lobby");
  const [timer, setTimer] = useState("-");
  const [currentQuestion, setCurrentQuestion] = useState("No active question");
  const [players, setPlayers] = useState([]);
  const [message, setMessage] = useState("");

  const shareLink = useMemo(() => {
    if (!roomCode) return "";
    return `${window.location.origin}/join?room=${roomCode}`;
  }, [roomCode]);

  const top3 = useMemo(() => players.slice(0, 3), [players]);

  async function api(path, method = "GET", body = null) {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : null
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function createRoom() {
    const data = await api("/api/create-room", "POST");
    setRoomCode(data.roomCode);
    setHostToken(data.hostToken);
    setMessage("");
  }

  function updateAnswer(index, value) {
    setDraft((prev) => {
      const answers = [...prev.answers];
      answers[index] = value;
      return { ...prev, answers };
    });
  }

  function addQuestion() {
    if (!draft.text.trim() || draft.answers.some((answer) => !answer.trim())) {
      setMessage("Fill in the question and all answers.");
      return;
    }
    setQuestions((prev) => [...prev, { ...draft, text: draft.text.trim() }]);
    setDraft(EMPTY_QUESTION);
    setMessage("Question added.");
  }

  async function saveQuestions() {
    if (!roomCode) {
      setMessage("Create a room first.");
      return;
    }
    if (!questions.length) {
      setMessage("Add at least one question.");
      return;
    }
    await api(`/api/room/${roomCode}/questions`, "PUT", {
      hostToken,
      questions
    });
    setMessage("Questions saved to room.");
  }

  async function startGame() {
    if (!roomCode) return;
    await api(`/api/room/${roomCode}/start`, "POST", { hostToken });
  }

  async function nextQuestion() {
    if (!roomCode) return;
    await api(`/api/room/${roomCode}/next`, "POST", { hostToken });
  }

  async function copyShareLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setMessage("Share link copied.");
    } catch (_) {
      setMessage("Copy failed. Select and copy manually.");
    }
  }

  useEffect(() => {
    if (!roomCode || !hostToken) return;
    const interval = setInterval(async () => {
      try {
        const data = await api(
          `/api/room/${roomCode}/state?hostToken=${encodeURIComponent(hostToken)}&role=host`
        );
        setStatus(data.status === "question" ? "Live" : data.status);
        setTimer(data.remainingSeconds ? data.remainingSeconds : "-");
        setCurrentQuestion(data.currentQuestionText || "No active question");
        setPlayers(data.players || []);
      } catch (_) {
      }
    }, 900);

    return () => clearInterval(interval);
  }, [roomCode, hostToken]);

  return (
    <main className="app">
      <header className="topbar">
        <span className="ey-tag">EY</span>
        <h1>Host Console</h1>
        <p>Build your quiz, share the room code, and control the flow.</p>
        <Link className="btn secondary" to="/">
          Back
        </Link>
      </header>

      <section className="grid">
        <div className="card stack">
          <div className="section-header">
            <div>
              <h2>Room setup</h2>
              <p className="muted">Create a room to generate a share link.</p>
            </div>
            <span className="pill">{roomCode || "Not created"}</span>
          </div>
          <button className="btn" onClick={createRoom}>
            Create Room
          </button>
          <div className="share-row">
            <input value={shareLink} readOnly placeholder="Share link appears here" />
            <button className="btn secondary" onClick={copyShareLink}>
              Copy
            </button>
          </div>
          <p className="muted">Players joined: {players.length}</p>

          <h2>Question builder</h2>
          <label className="muted">Question</label>
          <input
            value={draft.text}
            onChange={(event) => setDraft((prev) => ({ ...prev, text: event.target.value }))}
            placeholder="Ask something fun..."
          />
          <div className="two-col">
            {draft.answers.map((answer, index) => (
              <input
                key={`answer-${index}`}
                value={answer}
                onChange={(event) => updateAnswer(index, event.target.value)}
                placeholder={`Answer ${index + 1}`}
              />
            ))}
          </div>
          <label className="muted">Correct answer</label>
          <select
            value={draft.correctIndex}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, correctIndex: Number(event.target.value) }))
            }
          >
            <option value={0}>Answer 1</option>
            <option value={1}>Answer 2</option>
            <option value={2}>Answer 3</option>
            <option value={3}>Answer 4</option>
          </select>
          <div className="button-row">
            <button className="btn secondary" onClick={addQuestion}>
              Add Question
            </button>
            <button className="btn" onClick={saveQuestions}>
              Save to Room
            </button>
          </div>
          <p className="muted">{message}</p>

          <div>
            <h3>Question list</h3>
            <ol className="muted">
              {questions.map((question, index) => (
                <li key={`${question.text}-${index}`}>{question.text}</li>
              ))}
            </ol>
          </div>
        </div>

        <div className="card stack">
          <div className="section-header">
            <div>
              <h2>Game control</h2>
              <p className="muted">Start when everyone is in, then move questions.</p>
            </div>
            <span className="pill">{status}</span>
          </div>
          <div className="button-row">
            <button className="btn" onClick={startGame}>
              Start Game
            </button>
            <button className="btn secondary" onClick={nextQuestion}>
              Next Question
            </button>
          </div>

          <div className="info-grid">
            <div className="info-card">
              <h4>Current question</h4>
              <p className="muted">{currentQuestion}</p>
            </div>
            <div className="info-card">
              <h4>Time left</h4>
              <p>
                <strong>{timer}</strong> seconds
              </p>
            </div>
          </div>

          <div>
            <h3>Leaderboard</h3>
            <ol className="leaderboard">
              {players.map((player, index) => (
                <li key={`${player.name}-${index}`}>
                  {index + 1}. {player.name} — {player.score}
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3>Top 3</h3>
            <ol className="top3">
              {top3.map((player, index) => (
                <li key={`${player.name}-top-${index}`}>
                  #{index + 1} {player.name} — {player.score}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </main>
  );
}
