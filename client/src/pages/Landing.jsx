import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

export default function Landing() {
  const [roomCode, setRoomCode] = useState("");

  const joinLink = useMemo(() => {
    const trimmed = roomCode.trim().toUpperCase();
    return trimmed ? `/join?room=${encodeURIComponent(trimmed)}` : "/join";
  }, [roomCode]);

  return (
    <main className="app app-landing">
      <header className="topbar">
        <span className="ey-tag">EY</span>
        <h1>NOT KAHOOT</h1>
        <p>Run live quizzes with your own questions and real-time scoring.</p>
      </header>

      <section className="landing-grid">
        <div className="card stack">
          <h2>Host a game</h2>
          <p className="muted">Create questions, generate a room code, and run the quiz.</p>
          <Link className="btn" to="/host">
            Start Hosting
          </Link>
        </div>

        <div className="card stack">
          <h2>Join as a player</h2>
          <p className="muted">Enter the room code from the host and your name.</p>
          <label className="muted">Room code</label>
          <input
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value)}
            maxLength={6}
            placeholder="ABC123"
          />
          <Link className="btn secondary" to={joinLink}>
            Join Game
          </Link>
        </div>
      </section>

      <section className="card steps">
        <h3>How it works</h3>
        <ol>
          <li>Host creates a room and builds questions.</li>
          <li>Players join from their phones using the room code.</li>
          <li>Answer fast, track scores, and celebrate the top 3.</li>
        </ol>
      </section>
    </main>
  );
}
