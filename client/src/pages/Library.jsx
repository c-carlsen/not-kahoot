import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const EMPTY_QUESTION = {
  text: "",
  answers: ["", "", "", ""],
  correctIndex: 0
};

export default function Library() {
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState(EMPTY_QUESTION);
  const [questions, setQuestions] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [message, setMessage] = useState("");

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

  async function loadQuizzes() {
    try {
      const data = await api("/api/quizzes");
      setQuizzes(data.quizzes || []);
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => {
    loadQuizzes();
  }, []);

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

  async function saveQuiz() {
    if (!title.trim()) {
      setMessage("Add a quiz title.");
      return;
    }
    if (!questions.length) {
      setMessage("Add at least one question.");
      return;
    }
    try {
      await api("/api/quizzes", "POST", { title, questions });
      setTitle("");
      setQuestions([]);
      setDraft(EMPTY_QUESTION);
      setMessage("Quiz saved to library.");
      loadQuizzes();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="app">
      <header className="topbar">
        <span className="ey-tag">EY</span>
        <h1>Quiz Library</h1>
        <p>Create quizzes once and reuse them anytime.</p>
        <Link className="btn secondary" to="/host">
          Back to Host
        </Link>
      </header>

      <section className="grid">
        <div className="card stack">
          <h2>Create a new quiz</h2>
          <label className="muted">Quiz title</label>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Friday quiz" />

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
            <button className="btn" onClick={saveQuiz}>
              Save Quiz
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
              <h2>Saved quizzes</h2>
              <p className="muted">Pick one in the Host page to start a game.</p>
            </div>
            <button className="btn secondary" onClick={loadQuizzes}>
              Refresh
            </button>
          </div>
          <ol className="leaderboard">
            {quizzes.map((quiz) => (
              <li key={quiz.id}>
                {quiz.title} — {quiz.questionCount} questions
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
