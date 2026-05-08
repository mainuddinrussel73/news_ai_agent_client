export default function EntityTags({ entities }) {
  return (
    <div>
      <h3>Entities</h3>
      <p><strong>Countries:</strong> {entities?.countries.join(", ")}</p>
      <p><strong>Organizations:</strong> {entities?.organizations.join(", ")}</p>
      <p><strong>People:</strong> {entities?.people.join(", ")}</p>
    </div>
  );
}
