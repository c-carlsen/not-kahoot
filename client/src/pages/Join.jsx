import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function Join() {
  const query = useQuery();
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState((query.get("room") || "").toUpperCase());
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const canJoin = roomCode.trim().length >= 4 && name.trim().length >= 2;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function joinGame() {
    setMessage("");
    if (!canJoin) {
      setMessage("Add a room code and name.");
      return;
    }

    setLoading(true);
    setMessage("Connecting to the room...");
    try {
      let data = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await fetch("/api/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode, name })
        });
        data = await response.json();
        if (response.ok) break;
        if (response.status === 404 && attempt < 4) {
          setMessage("Waking up the room, please wait...");
          await wait(700);
          continue;
        }
        throw new Error(data.error || "Unable to join");
      }

      if (data?.playerId) {
        sessionStorage.setItem(
          "not-kahoot-player",
          JSON.stringify({ roomCode, playerId: data.playerId, name })
        );
        navigate("/play");
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app app-landing">
      <header className="topbar">
        <span className="ey-tag">EY</span>
        <h1>Join the Game</h1>
        <p>Enter the room code shared by your host.</p>
        <Link className="btn secondary" to="/">
          Back
        </Link>
      </header>

      <section className="card stack">
        <label className="muted">Room code</label>
        <input
          value={roomCode}
          onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
          maxLength={6}
          placeholder="ABC123"
        />
        <label className="muted">Name</label>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
        <button className="btn" onClick={joinGame} disabled={loading}>
          {loading ? "Joining..." : "Join Game"}
        </button>
        <p className="muted">{message}</p>
      </section>
    </main>
  );
}
