export default function SLABadge({ deadline, unit }) {
  if (deadline === 0) return <span className="text-xs text-gray-400">-</span>;

  const urgent = unit === "min" && deadline <= 10;
  const warning = unit === "min" && deadline <= 30;

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${urgent ? "bg-red-100 text-red-700" : warning ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
      <i className="ti ti-clock mr-1" style={{ fontSize: 11 }} />
      {deadline}
      {unit}
    </span>
  );
}
