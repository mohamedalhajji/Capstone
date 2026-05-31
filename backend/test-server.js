const http = require("http");

const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, path: req.url }));
});

server.listen(55000, "127.0.0.1", () => {
    console.log("Running on 55000");
});

server.on("error", (err) => {
    console.error("SERVER ERROR:", err);
});