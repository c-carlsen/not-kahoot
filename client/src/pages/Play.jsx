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
  const [feedback, setFeedback] = useState("");
  const [answered, setAnswered] = useState(false);
  const [lastQuestionIndex, setLastQuestionIndex] = useState(-1);
  const [lastPoints, setLastPoints] = useState(0);
  const [lastCorrect, setLastCorrect] = useState(null);
  const [lastAnswerIndex, setLastAnswerIndex] = useState(null);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState(null);

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
        setLastPoints(data.playerLastPoints || 0);
        setLastCorrect(data.playerLastCorrect);
        setLastAnswerIndex(data.playerLastAnswerIndex);

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
        </div>
        <p className="muted">
          Status: {status === "question" ? "Live" : status === "reveal" ? "Reveal" : status}
        </p>
        <p className="muted">{remaining === null ? "Waiting for the teacher" : `${remaining} seconds left`}</p>

        {answered && status === "question" ? (
          <div className="locked-answer">
            <span className="answer-symbol">{ANSWER_SYMBOLS[selectedAnswerIndex] || "?"}</span>
            <p className="muted">Answer locked</p>
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
                  className={`answer-btn choice-${index}${isCorrect ? " correct" : ""}${isWrong ? " wrong" : ""}`}
                  onClick={() => submitAnswer(index)}
                  disabled={answered || status !== "question"}
                >
                  <span className="answer-symbol">{ANSWER_SYMBOLS[index]}</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="muted">{feedback}</p>
      </section>
    </main>
  );
}
