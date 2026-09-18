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

      response.on("data", (chunk) => {
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

function decodeHtml(value) {
  return (value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8211;/gi, "-")
    .replace(/&#8212;/gi, "-")
    .replace(/&#038;/gi, "&")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanText(value) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
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

    url = url.replace("https://aymotorway.ca", "https://aymotorwayltd.gotgoodcars.com");

    if (!links.includes(url)) {
      links.push(url);
    }
  }

  return links;
}

function getMeta(html, property) {
  const patterns = [
    new RegExp('<meta[^>]+property=["\']' + property + '["\'][^>]+content=["\']([^"\']*)["\']', "i"),
    new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+property=["\']' + property + '["\']', "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return cleanText(match[1]);
    }
  }

  return "";
}

function getTitle(html) {
  const h1 = html.match(/<h1[^>]>([\s\S]?)<\/h1>/i);

  if (h1) {
    return cleanText(h1[1]);
  }

  const ogTitle = getMeta(html, "og:title");

  if (ogTitle) {
    return ogTitle;
  }

  const title = html.match(/<title[^>]>([\s\S]?)<\/title>/i);

  return title ? cleanText(title[1]) : "";
}

function findValue(text, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const patterns = [
      new RegExp(escaped + "\\s*[:#-]?\\s*([^|]{1,100}?)(?=\\s+(?:Mileage|Kilometers|Kilometres|Odometer|Trim|Engine|Transmission|Drive Type|Drivetrain|Stock|Exterior|Interior|Fuel Type|VIN|Title|Status)\\b|$)", "i"),
      new RegExp(escaped + "\\s*[:#-]?\\s*([^\\n\\r|]{1,100})", "i")
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);

      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }

  return "";
}

function findPrice(text, html) {
  const patterns = [
    /\$\s*[\d,]+(?:\.\d{2})?/,
    /CA\$\s*[\d,]+(?:\.\d{2})?/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return match[0];
    }
  }

  const metaPrice =
    getMeta(html, "product:price:amount") ||
    getMeta(html, "og:price:amount");

  return metaPrice ? "$" + metaPrice : "";
}

function parseVehicle(html, url) {
  const text = cleanText(html);

  return {
    name: getTitle(html),
    price: findPrice(text, html),
    mileage: findValue(text, ["Mileage", "Kilometers", "Kilometres", "Odometer"]),
    trim: findValue(text, ["Trim"]),
    engine: findValue(text, ["Engine"]),
    transmission: findValue(text, ["Transmission"]),
    driveType: findValue(text, ["Drive Type", "Drivetrain"]),
    stockNumber: findValue(text, ["Stock #", "Stock Number", "Stock"]),
    exteriorColor: findValue(text, ["Exterior Color", "Exterior Colour"]),
    interiorColor: findValue(text, ["Interior Color", "Interior Colour"]),
    fuelType: findValue(text, ["Fuel Type", "Fuel"]),
    titleStatus: findValue(text, ["Title Status", "Title", "Status"]),
    url: url.replace(
      "https://aymotorwayltd.gotgoodcars.com",
      "https://aymotorway.ca"
    )
  };
}

async function getInventory() {
  const vehicles = [];
  const seen = new Set();

  for (let page = 1; page <= 20; page++) {
    const pageUrl =
      page === 1
        ? INVENTORY_URL
        : INVENTORY_URL + "?paged=" + page;

    let inventoryHtml;

    try {
      inventoryHtml = await fetchPage(pageUrl);
    } catch (error) {
      break;
    }

    const links = extractVehicleLinks(inventoryHtml);
    let newLinks = 0;

    for (const url of links) {
      if (seen.has(url)) continue;

      seen.add(url);
      newLinks++;

      try {
        const html = await fetchPage(url);
        vehicles.push(parseVehicle(html, url));
      } catch (error) {
        vehicles.push({
          url: url.replace(
            "https://aymotorwayltd.gotgoodcars.com",
            "https://aymotorway.ca"
          ),
          error: error.message
        });
      }
    }

    if (newLinks === 0) break;
  }

  return vehicles;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/inventory") {
    try {
      const vehicles = await getInventory();

      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8"
      });

      res.end(JSON.stringify({
        ok: true,
        source: INVENTORY_URL,
        count: vehicles.length,
        vehicles: vehicles
      }));

    } catch (error) {
      res.writeHead(500, {
        "Content-Type": "application/json; charset=utf-8"
      });

      res.end(JSON.stringify({
        ok: false,
        error: error.message
      }));
    }

    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("AY Motorway API is running");
});

server.listen(port);
