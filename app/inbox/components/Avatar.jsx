export default function Avatar({ initials, color = "#6366F1", size = 36 }) {
  return (
    <div
      style={{ width: size, height: size, background: color + "22", border: `1.5px solid ${color}44`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, fontWeight: 600, color, flexShrink: 0 }}
    >
      {initials}
    </div>
  );
}