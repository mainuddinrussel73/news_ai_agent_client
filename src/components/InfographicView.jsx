export default function InfographicView({ infographic }) {
  return (
    <div>
      <h2>{infographic?.title}</h2>

      {infographic?.sections.map((sec, i) => (
        <div key={i}>
          <h4>{sec.type.toUpperCase()}</h4>
          {Array.isArray(sec.content) ? (
            <ul>
              {sec.content.map((c, idx) => <li key={idx}>{c}</li>)}
            </ul>
          ) : (
            <p>{sec.content}</p>
          )}
        </div>
      ))}
    </div>
  );
}
