export const PRESENCE_STYLES = {
  online: { label: "Online", dot: "bg-green-500" },
  away: { label: "Away", dot: "bg-amber-400" },
  offline: { label: "Offline", dot: "bg-gray-300" },
};

export default function PresenceDot({ presence = "offline", className = "" }) {
  const style = PRESENCE_STYLES[presence] || PRESENCE_STYLES.offline;
  return (
    <span
      title={style.label}
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${style.dot} ${className}`}
    />
  );
}
