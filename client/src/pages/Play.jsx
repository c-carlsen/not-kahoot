import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const EMPTY_PLAYER = {
  roomCode: "",
  playerId: "",
  name: ""
};

function loadPlayer() {
  try {
    const raw = sessionStorage.getItem("not-kahoot-player");
    return raw ? JSON.parse(raw) : EMPTY_PLAYER;
  } catch (_) {
    return EMPTY_PLAYER;
  }
}

export default function Play() {
  const [player, setPlayer] = useState(loadPlayer);
  const [status, setStatus] = useState("waiting");
  const [remaining, setRemaining] = useState("-");
  const [question, setQuestion] = useState(null);
  const [players, setPlayers] = useState([]);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [answered, setAnswered] = useState(false);
  const [lastQuestionIndex, setLastQuestionIndex] = useState(-1);
  const [lastPoints, setLastPoints] = useState(0);
  const [lastCorrect, setLastCorrect] = useState(null);
  const [lastAnswerIndex, setLastAnswerIndex] = useState(null);

  const top3 = useMemo(() => players.slice(0, 3), [players]);

  useEffect(() => {
    if (!player.playerId) return;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/room/${player.roomCode}/state?role=player&playerId=${encodeURIComponent(player.playerId)}`
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load state");

        setStatus(data.status);
        setRemaining(data.remainingSeconds ? data.remainingSeconds : "-");
        setPlayers(data.players || []);
        setScore(data.playerScore || 0);
        setLastPoints(data.playerLastPoints || 0);
        setLastCorrect(data.playerLastCorrect);
        setLastAnswerIndex(data.playerLastAnswerIndex);

        if (data.currentQuestion && data.currentQuestion.index !== lastQuestionIndex) {
          setAnswered(false);
          setFeedback("");
          setLastQuestionIndex(data.currentQuestion.index);
        }
        setQuestion(data.currentQuestion || null);
      } catch (_) {
      }
    }, 900);

    return () => clearInterval(interval);
  }, [player, lastQuestionIndex]);

  async function submitAnswer(answerIndex) {
    if (answered) return;
    try {
      const response = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode: player.roomCode,
          playerId: player.playerId,
          answerIndex
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to submit");
      setAnswered(true);
      setFeedback("Answer locked");
    } catch (error) {
      setFeedback(error.message);
    }
  }

  if (!player.playerId) {
    return (
      <main className="app app-landing">
        <header className="topbar">
          <span className="ey-tag">EY</span>
          <h1>Join a game</h1>
          <p>We need your room code and name first.</p>
          <Link className="btn" to="/join">
            Go to Join
          </Link>
        </header>
      </main>
    );
  }

  return (
    <main className="app app-landing">
      <header className="topbar">
        <span className="ey-tag">EY</span>
        <h1>Player</h1>
        <p className="muted">Room {player.roomCode}</p>
      </header>

      <section className="card stack">
        <div className="meta">
          <span className="pill">{player.name}</span>
          <span className="pill">Score: {score}</span>
        </div>
        <p className="muted">
          Status: {status === "question" ? "Live" : status === "reveal" ? "Reveal" : status}
        </p>

        <div className="info-grid">
          <div className="info-card">
            <h4>Question</h4>
            <h2>{question ? question.text : "Waiting for host"}</h2>
          </div>
          <div className="info-card">
            <h4>Time left</h4>
            <p>
              <strong>{remaining}</strong> seconds
            </p>
          </div>
        </div>

        <div className="answer-list">
          {question?.answers?.map((answer, index) => {
            const isReveal = status === "reveal" || status === "leaderboard";
            const isCorrect = isReveal && question?.correctIndex === index;
            const isWrong =
              isReveal && lastAnswerIndex === index && question?.correctIndex !== index;

            return (
              <button
                key={`${answer}-${index}`}
                className={`answer-btn${isCorrect ? " correct" : ""}${isWrong ? " wrong" : ""}`}
                onClick={() => submitAnswer(index)}
                disabled={answered || status !== "question"}
              >
                {answer}
              </button>
            );
          })}
        </div>
        <p className="muted">{feedback}</p>
        {status === "reveal" || status === "leaderboard" ? (
          <p className="points-pill">
            {lastCorrect ? `+${lastPoints} points!` : "No points this round"}
          </p>
        ) : null}

        <h3>Leaderboard</h3>
        <ol className="leaderboard">
          {players.map((playerRow, index) => (
            <li key={`${playerRow.name}-${index}`}>
              {index + 1}. {playerRow.name} — {playerRow.score}
            </li>
          ))}
        </ol>

        <h3>Top 3</h3>
        <ol className="top3">
          {top3.map((playerRow, index) => (
            <li key={`${playerRow.name}-top-${index}`}>
              #{index + 1} {playerRow.name} — {playerRow.score}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
