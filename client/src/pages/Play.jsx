import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const EMPTY_PLAYER = {
  roomCode: "",
  playerId: "",
  name: ""
};

const ANSWER_SYMBOLS = ["▲", "■", "●", "◆"];

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
  const [remaining, setRemaining] = useState(null);
  const [question, setQuestion] = useState(null);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [answered, setAnswered] = useState(false);
  const [lastQuestionIndex, setLastQuestionIndex] = useState(-1);
  const [lastPoints, setLastPoints] = useState(0);
  const [lastCorrect, setLastCorrect] = useState(null);
  const [lastAnswerIndex, setLastAnswerIndex] = useState(null);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState(null);
  const [rank, setRank] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

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
        setRemaining(data.status === "question" ? data.remainingSeconds : null);
        setScore(data.playerScore || 0);
        setLastPoints(data.playerLastPoints || 0);
        setLastCorrect(data.playerLastCorrect);
        setLastAnswerIndex(data.playerLastAnswerIndex);
        setRank(data.playerRank || 0);
        setTotalPlayers(data.totalPlayers || 0);

        if (data.currentQuestion && data.currentQuestion.index !== lastQuestionIndex) {
          setAnswered(false);
          setFeedback("");
          setLastQuestionIndex(data.currentQuestion.index);
          setSelectedAnswerIndex(null);
        }
        setQuestion(data.currentQuestion || null);
      } catch (_) {
      }
    }, 700);

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
      setSelectedAnswerIndex(answerIndex);
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
            <p>{remaining === null ? "Waiting" : `${remaining} seconds`}</p>
          </div>
        </div>

        {answered && status === "question" ? (
          <div className="locked-answer">
            <span className="answer-symbol">{ANSWER_SYMBOLS[selectedAnswerIndex] || "?"}</span>
            <div>
              <p className="muted">Answer locked</p>
              <h3>{question?.answers?.[selectedAnswerIndex] || ""}</h3>
            </div>
          </div>
        ) : (
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
                  <span className="answer-symbol">{ANSWER_SYMBOLS[index]}</span>
                  <span>{answer}</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="muted">{feedback}</p>
        {status === "reveal" || status === "leaderboard" ? (
          <p className="points-pill">
            {lastCorrect ? `+${lastPoints} points!` : "No points this round"}
          </p>
        ) : null}

        <div className="rank-card">
          <h3>Your rank</h3>
          <p className="rank-value">
            {rank ? `#${rank}` : "—"}
            {totalPlayers ? ` / ${totalPlayers}` : ""}
          </p>
        </div>
      </section>
    </main>
  );
}
