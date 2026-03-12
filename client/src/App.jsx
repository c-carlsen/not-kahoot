import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Join from "./pages/Join";
import Play from "./pages/Play";
import Host from "./pages/Host";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/host" element={<Host />} />
      <Route path="/join" element={<Join />} />
      <Route path="/play" element={<Play />} />
    </Routes>
  );
}
