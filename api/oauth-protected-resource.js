export default function handler(req, res) {
  const domain = process.env.AUTH0_DOMAIN;

  if (!domain) {
    return res.status(500).json({
      error: "AUTH0_DOMAIN is not configured."
    });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  return res.status(200).json({
    resource: "https://gematria-ai-gray.vercel.app/api/mcp",
    authorization_servers: [
      `https://${domain}/`
    ],
    bearer_methods_supported: [
      "header"
    ]
  });
}
