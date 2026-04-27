export default async function handler(req, res) {
    const { path } = req.query;
    const base = "https://api.jup.ag";
    const url  = `${base}/${path}`;
  
    const headers = {
      "Content-Type": "application/json",
      ...(process.env.JUP_API_KEY && { "x-api-key": process.env.JUP_API_KEY }),
    };
  
    const upstream = await fetch(url, {
      method:  req.method,
      headers,
      body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
    });
  
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  }