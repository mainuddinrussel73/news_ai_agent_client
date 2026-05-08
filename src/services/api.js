import axios from "axios";

export const getArticles = () =>
  axios.post("http://localhost:5000/api/crawl");
