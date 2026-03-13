import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

export default function Host() {
  const [roomCode, setRoomCode] = useState("");
  const [hostToken, setHostToken] = useState("");
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuizId, setSelectedQuizId] = useState("");
  const [loadedQuizTitle, setLoadedQuizTitle] = useState("");
  const [loadedQuestionCount, setLoadedQuestionCount] = useState(0);
  const [status, setStatus] = useState("lobby");
  const [timer, setTimer] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState("No active question");
  const [currentAnswers, setCurrentAnswers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [message, setMessage] = useState("");
  const [view, setView] = useState("setup");

  const shareLink = useMemo(() => {
    if (!roomCode) return "";
    return `${window.location.origin}/join?room=${roomCode}`;
  }, [roomCode]);

  const qrSrc = useMemo(() => {
    if (!shareLink) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(shareLink)}`;
  }, [shareLink]);

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
    setLoadedQuizTitle("");
    setLoadedQuestionCount(0);
    setMessage("");
    setView("setup");
  }

  async function loadQuizzes() {
    try {
      const data = await api("/api/quizzes");
      setQuizzes(data.quizzes || []);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadSelectedQuiz() {
    if (!roomCode) {
      setMessage("Create a room first.");
      return;
    }
    if (!selectedQuizId) {
      setMessage("Select a quiz from the library.");
      return;
    }
    const data = await api(`/api/room/${roomCode}/load-quiz`, "POST", {
      hostToken,
      quizId: selectedQuizId
    });
    setLoadedQuizTitle(data.quizTitle || "");
    setLoadedQuestionCount(data.questionCount || 0);
    setMessage("Quiz loaded into room.");
    setView("setup");
  }

  async function startGame() {
    if (!roomCode) return;
    await api(`/api/room/${roomCode}/start`, "POST", { hostToken });
  }

  async function nextQuestion() {
    if (!roomCode) return;
    await api(`/api/room/${roomCode}/next`, "POST", { hostToken });
  }

  async function enterLiveView() {
    if (!roomCode || !loadedQuestionCount) return;
    setView("live");
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
    loadQuizzes();
  }, []);

  useEffect(() => {
    if (!roomCode || !hostToken) return;
    const interval = setInterval(async () => {
      try {
        const data = await api(
          `/api/room/${roomCode}/state?hostToken=${encodeURIComponent(hostToken)}&role=host`
        );
        setStatus(data.status || "lobby");
        setTimer(data.status === "question" ? data.remainingSeconds : null);
        setCurrentQuestion(data.currentQuestionText || "No active question");
        setCurrentAnswers(data.currentQuestionAnswers || []);
        setPlayers(data.players || []);
        setLoadedQuizTitle(data.quizTitle || "");
        setTotalPlayers(data.totalPlayers || 0);
        setAnsweredCount(data.answeredCount || 0);
      } catch (_) {
      }
    }, 700);

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

      {view === "setup" ? (
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
            {qrSrc ? (
              <div className="qr-box">
                <img src={qrSrc} alt="Join QR code" />
                <p className="muted">Scan to join from a phone.</p>
              </div>
            ) : null}
            <p className="muted">Players can join now. Start the game whenever everyone is in.</p>

            <h2>Quiz library</h2>
            <p className="muted">Choose a saved quiz for this room.</p>
            <select value={selectedQuizId} onChange={(event) => setSelectedQuizId(event.target.value)}>
              <option value="">Select a quiz</option>
              {quizzes.map((quiz) => (
                <option key={quiz.id} value={quiz.id}>
                  {quiz.title} ({quiz.questionCount})
                </option>
              ))}
            </select>
            <div className="button-row">
              <button className="btn secondary" onClick={loadQuizzes}>
                Refresh list
              </button>
              <button className="btn" onClick={loadSelectedQuiz}>
                Load quiz to room
              </button>
            </div>
            <p className="muted">Loaded quiz: {loadedQuizTitle || "None"}</p>
            <p className="muted">Questions: {loadedQuestionCount || 0}</p>
            <Link className="btn secondary" to="/library">
              Create / edit quizzes
            </Link>
            <button
              className="btn"
              onClick={enterLiveView}
              disabled={!roomCode || !loadedQuestionCount}
            >
              Go to live host view
            </button>
            <p className="muted">{message}</p>
          </div>

          <div className="card stack">
            <div className="section-header">
              <div>
                <h2>What happens next</h2>
                <p className="muted">Move into live mode to start the quiz.</p>
              </div>
              <span className="pill">Setup</span>
            </div>
            <ol className="muted">
              <li>Create a room.</li>
              <li>Pick a saved quiz.</li>
              <li>Go to live host view to start.</li>
            </ol>
          </div>
        </section>
      ) : (
        <section className="grid">
          <div className="card stack">
            <div className="section-header">
              <div>
                <h2>Live game</h2>
                <p className="muted">Players join with the QR code.</p>
              </div>
              <span className="pill">{roomCode || "No room"}</span>
            </div>
            {qrSrc ? (
              <div className="qr-box">
                <img src={qrSrc} alt="Join QR code" />
                <p className="muted">Scan to join from a phone.</p>
              </div>
            ) : null}
            <div className="player-metrics">
              <div>
                <h4>Players joined</h4>
                <p className="metric-value">{totalPlayers}</p>
              </div>
              <div>
                <h4>Answered</h4>
                <p className="metric-value">{answeredCount}</p>
              </div>
              <div>
                <h4>Remaining</h4>
                <p className="metric-value">{Math.max(totalPlayers - answeredCount, 0)}</p>
              </div>
            </div>
            <div>
              <h3>Lobby</h3>
              <ol className="leaderboard">
                {players.map((player, index) => (
                  <li key={`${player.name}-${index}`}>{player.name}</li>
                ))}
              </ol>
            </div>
            <button className="btn secondary" onClick={() => setView("setup")}>
              Back to setup
            </button>
          </div>

          <div className="card stack">
            <div className="section-header">
              <div>
                <h2>Live quiz</h2>
                <p className="muted">Show this screen to the class.</p>
              </div>
              <span className="pill">{status === "question" ? "Live" : status}</span>
            </div>
            <div className="button-row">
              <button className="btn" onClick={startGame} disabled={status !== "lobby"}>
                Start Game
              </button>
              <button className="btn secondary" onClick={nextQuestion} disabled={status === "lobby"}>
                Next Question
              </button>
            </div>
            <div className="info-grid">
              <div className="info-card">
                <h4>Question</h4>
                <h2>{status === "question" ? currentQuestion : "Waiting to start"}</h2>
              </div>
              <div className="info-card">
                <h4>Answered</h4>
                <p className="metric-value">{answeredCount} / {totalPlayers}</p>
              </div>
              <div className="info-card">
                <h4>Time left</h4>
                <p>{timer === null ? "Waiting" : `${timer} seconds`}</p>
              </div>
            </div>
            <div className="answer-list">
              {currentAnswers.map((answer, index) => (
                <button
                  key={`${answer}-${index}`}
                  className={`answer-btn choice-${index}`}
                  disabled
                >
                  <span className="answer-symbol">{["▲", "■", "●", "◆"][index]}</span>
                  <span>{answer}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
