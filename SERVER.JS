const https = require("https");
const http = require("http");

const port = process.env.PORT || 3000;
const INVENTORY_URL = "https://aymotorwayltd.gotgoodcars.com/all-inventory/";

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
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
          reject(new Error("Request failed: " + response.statusCode));
        }
      });
    }).on("error", reject);
  });
}

function cleanText(value) {
  return (value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8211;/gi, "-")
    .replace(/&#038;/gi, "&")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractVehicleLinks(html) {
  const links = [];
  const regex = /href=["']([^"']*\/vehicles\/[^"'?#]+\/?)["']/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    let url = match[1];

    if (url.startsWith("/")) {
      url = "https://aymotorwayltd.gotgoodcars.com" + url;
    }

    if (!url.startsWith("http")) {
      continue;
    }

    if (!links.includes(url)) {
      links.push(url);
    }
  }

  return links;
}

function valueAfterLabel(text, label, nextLabels) {
  const start = text.toLowerCase().indexOf(label.toLowerCase());

  if (start === -1) {
    return "";
  }

  const valueStart = start + label.length;
  let end = text.length;

  for (const nextLabel of nextLabels) {
    const position = text.toLowerCase().indexOf(
      nextLabel.toLowerCase(),
      valueStart
    );

    if (position !== -1 && position < end) {
      end = position;
    }
  }

  return text.substring(valueStart, end).trim();
}

function parseVehicle(html, url) {
  const text = cleanText(html);

  const titleMatch = html.match(/<h1[^>]>([\s\S]?)<\/h1>/i);
  const priceMatch = text.match(/\$[\d,]+/);

  const labels = [
    "Mileage",
    "Trim",
    "ENGINE",
    "Transmission",
    "Drive Type",
    "Stock #",
    "Exterior Color",
    "Interior Color",
    "Fuel Type",
    "Title",
    "Description"
  ];

  return {
    name: titleMatch ? cleanText(titleMatch[1]) : "",
    price: priceMatch ? priceMatch[0] : "",
    mileage: valueAfterLabel(text, "Mileage", labels.slice(1)),
    trim: valueAfterLabel(text, "Trim", labels.slice(2)),
    engine: valueAfterLabel(text, "ENGINE", labels.slice(3)),
    transmission: valueAfterLabel(text, "Transmission", labels.slice(4)),
    driveType: valueAfterLabel(text, "Drive Type", labels.slice(5)),
    stockNumber: valueAfterLabel(text, "Stock #", labels.slice(6)),
    exteriorColor: valueAfterLabel(text, "Exterior Color", labels.slice(7)),
    interiorColor: valueAfterLabel(text, "Interior Color", labels.slice(8)),
    fuelType: valueAfterLabel(text, "Fuel Type", labels.slice(9)),
    titleStatus: valueAfterLabel(text, "Title", ["Description", "CITY", "HWY"]),
    url: url
  };
}

async function getInventory() {
  const inventoryHtml = await fetchPage(INVENTORY_URL);
  const links = extractVehicleLinks(inventoryHtml);

  const vehicles = [];

  for (const url of links) {
    try {
      const html = await fetchPage(url);
      const vehicle = parseVehicle(html, url);
      vehicles.push(vehicle);
    } catch (error) {
      vehicles.push({
        url: url,
        error: error.message
      });
    }
  }

  return vehicles;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/inventory") {
    try {
      const vehicles = await getInventory();

      res.writeHead(200, {
        "Content-Type": "application/json"
      });

      res.end(JSON.stringify({
        ok: true,
        source: INVENTORY_URL,
        count: vehicles.length,
        vehicles: vehicles
      }));

    } catch (error) {
      res.writeHead(500, {
        "Content-Type": "application/json"
      });

      res.end(JSON.stringify({
        ok: false,
        error: error.message
      }));
    }

    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("AY Motorway API is running");
});

server.listen(port);
