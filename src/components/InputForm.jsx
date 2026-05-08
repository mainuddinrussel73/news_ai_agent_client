import { useState } from "react";
import { analyzeNews } from "../services/api";

export default function InputForm({ setData, setLoading }) {
  const [url, setUrl] = useState("");

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const result = await analyzeNews(url);
      setData(result);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter article URL"
      />
      <button onClick={handleSubmit}>Analyze</button>
    </div>
  );
}
