import { BarChart, Bar, XAxis, YAxis } from "recharts";

export default function StatsChart({ stats }) {
  const data = stats.map((s, i) => ({
    name: `S${i + 1}`,
    value: parseInt(s.match(/\d+/)) || 0
  }));

  return (
    <BarChart width={400} height={300} data={data}>
      <XAxis dataKey="name" />
      <YAxis />
      <Bar dataKey="value" />
    </BarChart>
  );
}
