const http = require("http");

const fs = require("fs");

const path = require("path");

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/inventory") {

    const inventoryPath = path.join(__dirname, "inventory.json");

    fs.readFile(inventoryPath, "utf8", (err, data) => {

      if (err) {

        console.error("Inventory error:", err);

        console.error("Files in app:", fs.readdirSync(__dirname));

        res.writeHead(500, { "Content-Type": "application/json" });

        res.end(JSON.stringify({

          error: "Unable to load inventory",

          files: fs.readdirSync(__dirname)

        }));

        return;

      }

      res.writeHead(200, { "Content-Type": "application/json" });

      res.end(data);

    });

    return;

  }

  res.writeHead(200, { "Content-Type": "text/plain" });

  res.end("AY Motorway API is running");

});

server.listen(port);
