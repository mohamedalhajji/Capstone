import { useEffect, useState } from "react";
import axios from "axios";

const API = "http://localhost:5000";

function App() {
  const [systemState, setSystemState] = useState(null);
  const [sensors, setSensors] = useState([]);
  const [events, setEvents] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const fetchData = async () => {
    try {
      const [stateRes, sensorsRes, eventsRes, notifRes] = await Promise.all([
        axios.get(`${API}/api/system-state`),
        axios.get(`${API}/api/sensors`),
        axios.get(`${API}/api/events`),
        axios.get(`${API}/api/notifications`),
      ]);

      setSystemState(stateRes.data);
      setSensors(sensorsRes.data);
      setEvents(eventsRes.data);
      setNotifications(notifRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const changeMode = async (mode) => {
    await axios.put(`${API}/api/system-mode`, { mode });
    fetchData();
  };

  const simulateEvent = async (sensor_name) => {
    await axios.post(`${API}/api/simulate-event`, { sensor_name });
    fetchData();
  };

  const simulateNfc = async (authorized) => {
    await axios.post(`${API}/api/simulate-nfc`, { authorized });
    fetchData();
  };

  const resetSystem = async () => {
    await axios.post(`${API}/api/reset-system`);
    fetchData();
  };

  const fullResetSystem = async () => {
    await axios.post(`${API}/api/full-reset`);
    fetchData();
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Smart Home Security Dashboard</h1>

      {/* STATUS CARDS */}
      {systemState && (
        <div style={styles.grid}>
          <Card title="Mode" value={systemState.current_mode.toUpperCase()} />
          <Card
            title="Buzzer"
            value={systemState.buzzer_on ? "ON 🔴" : "OFF 🟢"}
          />
          <Card
            title="Door"
            value={systemState.door_locked ? "LOCKED 🔒" : "OPEN 🔓"}
          />
          <Card
            title="Sprinkler"
            value={systemState.sprinkler_on ? "ACTIVE 💧" : "OFF"}
          />
        </div>
      )}

      {/* CONTROLS */}
      <Section title="System Controls">
        <div style={styles.flex}>
          <Btn onClick={() => changeMode("disarmed")}>Disarm</Btn>
          <Btn onClick={() => changeMode("home")}>Home</Btn>
          <Btn onClick={() => changeMode("away")}>Away</Btn>
          <Btn danger onClick={resetSystem}>Reset</Btn>
          <Btn dangerDark onClick={fullResetSystem}>Full Reset</Btn>
        </div>
      </Section>

      {/* SIMULATION */}
      <Section title="Simulate Events">
        <div style={styles.flex}>
          <Btn onClick={() => simulateEvent("motion_living_room")}>Motion</Btn>
          <Btn onClick={() => simulateEvent("gas_kitchen")}>Gas</Btn>
          <Btn onClick={() => simulateEvent("flame_kitchen")}>Fire</Btn>
          <Btn onClick={() => simulateEvent("door_main")}>Main Door</Btn>
          <Btn onClick={() => simulateEvent("vibration_window")}>Window</Btn>
          <Btn onClick={() => simulateNfc(true)}>NFC Success</Btn>
          <Btn danger onClick={() => simulateNfc(false)}>NFC Fail</Btn>
        </div>
      </Section>

      {/* MAIN GRID */}
      <div style={styles.mainGrid}>
        {/* Notifications */}
        <Section title="Notifications">
          {notifications.length === 0 ? (
            <p>No notifications</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} style={styles.notification}>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
              </div>
            ))
          )}
        </Section>

        {/* Sensors */}
        <Section title="Sensors">
          {sensors.map((s) => (
            <div key={s.id} style={styles.sensor}>
              <div>
                <strong>{s.sensor_name}</strong>
                <p>{s.location}</p>
              </div>
              <div>
                <span>{s.status}</span>
              </div>
            </div>
          ))}
        </Section>
      </div>

      {/* EVENTS */}
      <Section title="Event History">
        {events.map((e) => (
          <div key={e.id} style={getEventStyle(e.severity)}>
            <div>
              <strong>{e.event_type}</strong> ({e.severity})
            </div>
            <div>{e.message}</div>
          </div>
        ))}
      </Section>
    </div>
  );
}

/* COMPONENTS */

const Card = ({ title, value }) => (
  <div style={styles.card}>
    <h4>{title}</h4>
    <p>{value}</p>
  </div>
);

const Section = ({ title, children }) => (
  <div style={styles.section}>
    <h2>{title}</h2>
    {children}
  </div>
);

const Btn = ({ children, onClick, danger, dangerDark }) => (
  <button
    onClick={onClick}
    style={{
      ...styles.button,
      background: danger ? "#d9534f" : dangerDark ? "#7a0000" : "#2a2f4a",
    }}
  >
    {children}
  </button>
);

/* STYLES */

const styles = {
  page: {
    background: "#0f1220",
    color: "white",
    minHeight: "100vh",
    padding: "40px",
    fontFamily: "Arial",
  },
  title: {
    textAlign: "center",
    marginBottom: "30px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "20px",
    marginBottom: "30px",
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    marginBottom: "20px",
  },
  card: {
    background: "#1c2035",
    padding: "20px",
    borderRadius: "12px",
    textAlign: "center",
  },
  section: {
    background: "#1c2035",
    padding: "20px",
    borderRadius: "12px",
    marginBottom: "20px",
  },
  flex: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  button: {
    padding: "10px 14px",
    borderRadius: "8px",
    border: "none",
    color: "white",
    cursor: "pointer",
  },
  notification: {
    background: "#2a2f4a",
    padding: "10px",
    borderRadius: "8px",
    marginBottom: "10px",
  },
  sensor: {
    display: "flex",
    justifyContent: "space-between",
    background: "#2a2f4a",
    padding: "10px",
    borderRadius: "8px",
    marginBottom: "10px",
  },
};

const getEventStyle = (severity) => ({
  padding: "10px",
  borderRadius: "8px",
  marginBottom: "10px",
  background:
    severity === "critical"
      ? "#ff4d4d"
      : severity === "high"
      ? "#ffcc00"
      : severity === "medium"
      ? "#3a7bd5"
      : "#2a2f4a",
});

export default App;