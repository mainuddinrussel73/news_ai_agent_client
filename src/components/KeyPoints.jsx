export default function KeyPoints({ points }) {
  return (
    <div>
      <h3>Key Points</h3>
      <ul>
        {points?.map((p, i) => <li key={i}>{p}</li>)}
      </ul>
    </div>
  );
}
