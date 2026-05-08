import InputForm from "../components/InputForm";

export default function Home({ setData, setLoading }) {
  return (
    <div>
      <h1>News AI Analyzer</h1>
      <InputForm setData={setData} setLoading={setLoading} />
    </div>
  );
}
