const https = require("https");
const fs = require("fs");
const path = require("path");

const port = process.env.PORT || 3000;
const INVENTORY_URL = "https://aymotorwayltd.gotgoodcars.com/all-inventory/";

function fetchInventoryPage() {
  return new Promise((resolve, reject) => {
    https.get(INVENTORY_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html"
      }
    }, (response) => {
      let data = "";

      response.on("data", chunk => {
        data += chunk;
      });

      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 400) {
          resolve(data);
        } else {
reject(new Error("Inventory request failed: " + response.statusCode));
        }
      });
    }).on("error", reject);
  });
}

function extractVehicleLinks(html) {
  const links = [];
  const regex = /href=["']([^"']*\/vehicles\/[^"']+)["']/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    let url = match[1];

    if (url.startsWith("/")) {
      url = "https://aymotorway.ca" + url;
    }

    if (!links.includes(url)) {
      links.push(url);
    }
  }

  return links;
}

const server = require("http").createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/inventory") {
    try {
      const html = await fetchInventoryPage();
      const vehicles = extractVehicleLinks(html);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        source: INVENTORY_URL,
        count: vehicles.length,
        vehicles
      }));

    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: false,
        error: error.message
      }));
    }

    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("AY Motorway API is running");
});

server.listen(port);
