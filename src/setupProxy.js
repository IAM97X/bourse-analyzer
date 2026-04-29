const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/anthropic",
    createProxyMiddleware({
      target: "https://api.anthropic.com",
      changeOrigin: true,
      pathRewrite: { "^/anthropic": "" },
      onProxyReq: (proxyReq) => {
        proxyReq.setHeader("x-api-key", process.env.REACT_APP_ANTHROPIC_API_KEY);
        proxyReq.setHeader("anthropic-version", "2023-06-01");
        proxyReq.setHeader("anthropic-beta", "interleaved-thinking-2025-05-14");
        proxyReq.setHeader("anthropic-dangerous-direct-browser-access", "true");
      },
    })
  );
};
