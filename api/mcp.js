export default async function handler(req, res) {
  // Allow requests from our Gematria website
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Simple test endpoint
  if (req.method === "GET") {
    return res.status(200).json({
      name: "Gematria AI MCP",
      status: "online",
      message: "Gematria connector is running."
    });
  }

  return res.status(405).json({
    error: "Method not allowed"
  });
}
