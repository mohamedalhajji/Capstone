import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL ?? "https://capstone-msv5.onrender.com";
const SESSION_KEY = "home-security-web-session";
const sensorLabels = {
  motion_hallway: "Hallway Motion Sensor",
  motion_garage: "Garage Motion Sensor",
  gas_kitchen: "Kitchen Gas Sensor",
  gas_hallway: "Hallway Gas Sensor",
  gas_living_room: "Living Room Gas Sensor",
  flame_kitchen: "Kitchen Flame Sensor",
  flame_room_1: "Room 1 Flame Sensor",
  flame_room_2: "Room 2 Flame Sensor",
  window_1_reed: "Window 1 Sensor",
  window_2_reed: "Window 2 Sensor",
  window_3_reed: "Window 3 Sensor",
  vibration_garage_door: "Garage Door Vibration Sensor",
  nfc_main_door: "Main Door NFC Reader",
};

function App() {
  const [session, setSession] = useState(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [systemState, setSystemState] = useState(null);
  const [sensors, setSensors] = useState([]);
  const [events, setEvents] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const headers = useMemo(
    () => (session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    [session]
  );

  const saveSession = (nextSession) => {
    setSession(nextSession);
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
  };

  const logout = () => {
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
  };

  const authSubmit = async () => {
    setAuthError("");
    try {
      const path = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body =
        authMode === "signup"
          ? authForm
          : { email: authForm.email, password: authForm.password };
      const { data } = await axios.post(`${API}${path}`, body);
      saveSession(data);
    } catch (err) {
      setAuthError(err.response?.data?.error || err.message || "Authentication failed");
    }
  };

  const fetchData = async () => {
    if (!session?.token) return;
    try {
      const [stateRes, sensorsRes, eventsRes, notifRes] = await Promise.all([
        axios.get(`${API}/api/system-state`, { headers }),
        axios.get(`${API}/api/sensors`, { headers }),
        axios.get(`${API}/api/events`, { headers }),
        axios.get(`${API}/api/notifications`, { headers }),
      ]);

      setSystemState(stateRes.data);
      setSensors(sensorsRes.data);
      setEvents(eventsRes.data);
      setNotifications(notifRes.data);
    } catch (err) {
      if (err.response?.status === 401) logout();
      console.error(err);
    }
  };

  const authedRequest = async (request) => {
    await request();
    fetchData();
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [session?.token]);

  if (!session?.token) {
    return (
      <div style={styles.page}>
        <div style={styles.authBox}>
          <h1>Home Security</h1>
          <p style={styles.muted}>Sign in to control the prototype dashboard.</p>
          <div style={styles.flex}>
            <Btn active={authMode === "login"} onClick={() => setAuthMode("login")}>Login</Btn>
            <Btn active={authMode === "signup"} onClick={() => setAuthMode("signup")}>Sign Up</Btn>
          </div>
          {authMode === "signup" && (
            <input style={styles.input} placeholder="Name" value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} />
          )}
          <input style={styles.input} placeholder="Email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} />
          <input style={styles.input} placeholder="Password" type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} />
          {authError && <p style={styles.error}>{authError}</p>}
          <Btn active onClick={authSubmit}>{authMode === "signup" ? "Create Account" : "Login"}</Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Home Security Dashboard</h1>
          <p style={styles.muted}>{session.user?.email}</p>
        </div>
        <Btn danger onClick={logout}>Logout</Btn>
      </div>

      {systemState && (
        <div style={styles.grid}>
          <Card title="Mode" value={systemState.current_mode.toUpperCase()} />
          <Card title="Buzzer" value={systemState.buzzer_on ? "ON" : "OFF"} />
          <Card title="Door" value={systemState.door_locked ? "LOCKED" : "OPEN"} />
          <Card title="Sprinkler" value={systemState.sprinkler_on ? "ACTIVE" : "OFF"} />
        </div>
      )}

      <Section title="System Controls">
        <div style={styles.flex}>
          <Btn onClick={() => authedRequest(() => axios.put(`${API}/api/system-mode`, { mode: "disarmed" }, { headers }))}>Disarm</Btn>
          <Btn onClick={() => authedRequest(() => axios.put(`${API}/api/system-mode`, { mode: "home" }, { headers }))}>Home</Btn>
          <Btn onClick={() => authedRequest(() => axios.put(`${API}/api/system-mode`, { mode: "away" }, { headers }))}>Away</Btn>
          <Btn danger onClick={() => authedRequest(() => axios.post(`${API}/api/reset-system`, {}, { headers }))}>Reset Sensors</Btn>
          <Btn danger onClick={() => authedRequest(() => axios.post(`${API}/api/full-reset`, {}, { headers }))}>Clear Data</Btn>
        </div>
      </Section>

      <Section title="Test Tools">
        <div style={styles.flex}>
          {[
            ["motion_hallway", "Hallway Motion"],
            ["motion_garage", "Garage Motion"],
            ["gas_kitchen", "Kitchen Gas"],
            ["gas_hallway", "Hallway Gas"],
            ["gas_living_room", "Living Gas"],
            ["flame_kitchen", "Kitchen Flame"],
            ["flame_room_1", "Room 1 Flame"],
            ["flame_room_2", "Room 2 Flame"],
            ["window_1_reed", "Window 1"],
            ["window_2_reed", "Window 2"],
            ["window_3_reed", "Window 3"],
            ["vibration_garage_door", "Garage Shock"],
          ].map(([sensor, label]) => (
            <Btn key={sensor} onClick={() => authedRequest(() => axios.post(`${API}/api/simulate-event`, { sensor_name: sensor }, { headers }))}>{label}</Btn>
          ))}
          <Btn onClick={() => authedRequest(() => axios.post(`${API}/api/simulate-nfc`, { authorized: true }, { headers }))}>NFC Success</Btn>
          <Btn danger onClick={() => authedRequest(() => axios.post(`${API}/api/simulate-nfc`, { authorized: false }, { headers }))}>NFC Fail</Btn>
        </div>
      </Section>

      <Section title="Test Tools">
        <div style={styles.flex}>
          {[
            ["motion_hallway", "Hallway Motion"],
            ["motion_garage", "Garage Motion"],
            ["gas_kitchen", "Kitchen Gas"],
            ["gas_hallway", "Hallway Gas"],
            ["gas_living_room", "Living Gas"],
            ["flame_kitchen", "Kitchen Flame"],
            ["flame_room_1", "Room 1 Flame"],
            ["flame_room_2", "Room 2 Flame"],
            ["window_1_reed", "Window 1"],
            ["window_2_reed", "Window 2"],
            ["window_3_reed", "Window 3"],
            ["vibration_garage_door", "Garage Shock"],
          ].map(([sensor, label]) => (
            <Btn key={sensor} onClick={() => authedRequest(() => axios.post(`${API}/api/simulate-event`, { sensor_name: sensor }, { headers }))}>{label}</Btn>
          ))}
          <Btn onClick={() => authedRequest(() => axios.post(`${API}/api/simulate-nfc`, { authorized: true }, { headers }))}>NFC Success</Btn>
          <Btn danger onClick={() => authedRequest(() => axios.post(`${API}/api/simulate-nfc`, { authorized: false }, { headers }))}>NFC Fail</Btn>
        </div>
      </Section>

      <div style={styles.mainGrid}>
        <Section title="Notifications">
          {notifications.length === 0 ? <p>No notifications</p> : notifications.map((n) => (
            <div key={n.id} style={styles.row}><strong>{n.title}</strong><p>{n.body}</p></div>
          ))}
        </Section>

        <Section title="Sensors">
          {sensors.map((s) => (
            <div key={s.id} style={styles.sensor}>
              <div><strong>{sensorLabels[s.sensor_name] || s.sensor_name}</strong><p>{s.location}</p></div>
              <span>{s.status}</span>
            </div>
          ))}
        </Section>
      </div>

      <Section title="Event History">
        {events.map((e) => (
          <div key={e.id} style={getEventStyle(e.severity)}>
            <strong>{e.event_type}</strong> ({e.severity})
            <div>{e.message}</div>
          </div>
        ))}
      </Section>
    </div>
  );
}

const Card = ({ title, value }) => (
  <div style={styles.card}><h4>{title}</h4><p>{value}</p></div>
);

const Section = ({ title, children }) => (
  <div style={styles.section}><h2>{title}</h2>{children}</div>
);

const Btn = ({ children, onClick, danger, active }) => (
  <button onClick={onClick} style={{ ...styles.button, background: danger ? "#ef4444" : active ? "#1282A2" : "#034078", color: active ? "#0A1128" : "#FEFCFB" }}>
    {children}
  </button>
);

const styles = {
  page: { background: "#0A1128", color: "#FEFCFB", minHeight: "100vh", padding: 28, fontFamily: "Arial" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 },
  title: { margin: 0 },
  muted: { color: "#B8CAD6" },
  error: { color: "#fb7185", fontWeight: 700 },
  authBox: { maxWidth: 420, margin: "10vh auto", background: "#001F54", padding: 24, borderRadius: 8, display: "grid", gap: 12 },
  input: { background: "#034078", border: "1px solid #0B4F7F", borderRadius: 8, color: "#FEFCFB", padding: 12, fontSize: 15 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 },
  mainGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 },
  card: { background: "#001F54", padding: 18, borderRadius: 8, textAlign: "center", border: "1px solid #0B4F7F" },
  section: { background: "#001F54", padding: 18, borderRadius: 8, marginBottom: 18, border: "1px solid #0B4F7F" },
  flex: { display: "flex", gap: 10, flexWrap: "wrap" },
  button: { padding: "10px 14px", borderRadius: 8, border: "1px solid #0B4F7F", cursor: "pointer", fontWeight: 800 },
  row: { background: "#034078", padding: 10, borderRadius: 8, marginBottom: 10 },
  sensor: { display: "flex", justifyContent: "space-between", background: "#034078", padding: 10, borderRadius: 8, marginBottom: 10 },
};

const getEventStyle = (severity) => ({
  padding: 10,
  borderRadius: 8,
  marginBottom: 10,
  background: severity === "critical" ? "#ef4444" : severity === "high" ? "#f59e0b" : "#034078",
  color: severity === "high" ? "#0A1128" : "#FEFCFB",
});

export default App;
