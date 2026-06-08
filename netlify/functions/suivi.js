// netlify/functions/suivi.js
// Proxy entre l'app Pilotage et l'API Notion.
// Le NOTION_TOKEN reste côté serveur, jamais exposé au navigateur.
//
// Variables d'environnement Netlify à définir :
//   NOTION_TOKEN   -> le token de ton intégration Notion (secret_xxx)
//   NOTION_DB_ID   -> 72453d5b-4977-487f-9b43-688d7104dfc8  (data source / collection)
//
// Endpoints :
//   GET  /.netlify/functions/suivi?date=YYYY-MM-DD   -> renvoie la ligne du jour (ou null)
//   POST /.netlify/functions/suivi   body: { date, fields:{...} } -> upsert la ligne du jour

const NOTION_VERSION = "2022-06-28";

const PROP = {
  date:        { name: "Date",                type: "title" },
  coffeeNoSug: { name: "Café sans sucre",     type: "checkbox" },
  noPain:      { name: "Pain au choc évité",  type: "checkbox" },
  lunchSrc:    { name: "Déjeuner source",     type: "select" },
  dessert:     { name: "Dessert midi",        type: "checkbox" },
  velo:        { name: "Vélo",                type: "checkbox" },
  neoness:     { name: "Neoness",             type: "checkbox" },
  marche:      { name: "Marche retour",       type: "checkbox" },
  bettermen:   { name: "BetterMen",           type: "checkbox" },
  fast:        { name: "Jeûne 13-20h",        type: "select" },
  bed:         { name: "Couché 23h30",        type: "select" },
  wake:        { name: "Levé 7h15",           type: "select" },
  energy:      { name: "Énergie",             type: "number" },
  weight:      { name: "Poids",               type: "number" },
  meals:       { name: "Plats restants",      type: "number" },
  mood:        { name: "Humeur",              type: "rich_text" },
  note:        { name: "Note",                type: "rich_text" },
};

function buildProperties(fields) {
  const out = {};
  for (const key in fields) {
    const def = PROP[key];
    if (!def) continue;
    const v = fields[key];
    if (v === null || v === undefined || v === "") continue;
    switch (def.type) {
      case "title":     out[def.name] = { title: [{ text: { content: String(v) } }] }; break;
      case "rich_text": out[def.name] = { rich_text: [{ text: { content: String(v) } }] }; break;
      case "checkbox":  out[def.name] = { checkbox: !!v }; break;
      case "number":    out[def.name] = { number: Number(v) }; break;
      case "select":    out[def.name] = { select: { name: String(v) } }; break;
    }
  }
  return out;
}

async function notion(path, method, body, token) {
  const res = await fetch("https://api.notion.com/v1/" + path, {
    method,
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Notion error " + res.status);
  return data;
}

// retrouve la page (ligne) dont le titre Date == date
async function findByDate(date, token, dbId) {
  const data = await notion("databases/" + dbId + "/query", "POST", {
    filter: { property: PROP.date.name, title: { equals: date } },
    page_size: 1,
  }, token);
  return data.results && data.results[0] ? data.results[0].id : null;
}

// transforme une page Notion en objet plat pour l'app
function pageToFields(page) {
  const p = page.properties || {};
  const get = (n) => p[n] || {};
  const sel = (n) => (get(n).select ? get(n).select.name : null);
  const chk = (n) => !!get(n).checkbox;
  const num = (n) => (typeof get(n).number === "number" ? get(n).number : null);
  const txt = (n) => {
    const arr = get(n).rich_text || get(n).title || [];
    return arr.map((t) => t.plain_text).join("");
  };
  return {
    date:        txt(PROP.date.name),
    coffeeNoSug: chk(PROP.coffeeNoSug.name),
    noPain:      chk(PROP.noPain.name),
    lunchSrc:    sel(PROP.lunchSrc.name),
    dessert:     chk(PROP.dessert.name),
    velo:        chk(PROP.velo.name),
    neoness:     chk(PROP.neoness.name),
    marche:      chk(PROP.marche.name),
    bettermen:   chk(PROP.bettermen.name),
    fast:        sel(PROP.fast.name),
    bed:         sel(PROP.bed.name),
    wake:        sel(PROP.wake.name),
    energy:      num(PROP.energy.name),
    weight:      num(PROP.weight.name),
    meals:       num(PROP.meals.name),
    mood:        txt(PROP.mood.name),
    note:        txt(PROP.note.name),
  };
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const token = process.env.NOTION_TOKEN;
  const dbId  = process.env.NOTION_DB_ID;
  if (!token || !dbId) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "NOTION_TOKEN ou NOTION_DB_ID manquant" }) };
  }

  try {
    if (event.httpMethod === "GET") {
      const date = (event.queryStringParameters || {}).date;
      if (!date) return { statusCode: 400, headers, body: JSON.stringify({ error: "date requise" }) };
      const id = await findByDate(date, token, dbId);
      if (!id) return { statusCode: 200, headers, body: JSON.stringify({ found: false, fields: null }) };
      const page = await notion("pages/" + id, "GET", null, token);
      return { statusCode: 200, headers, body: JSON.stringify({ found: true, fields: pageToFields(page) }) };
    }

    if (event.httpMethod === "POST") {
      const { date, fields } = JSON.parse(event.body || "{}");
      if (!date) return { statusCode: 400, headers, body: JSON.stringify({ error: "date requise" }) };
      const props = buildProperties({ date, ...(fields || {}) });
      const existingId = await findByDate(date, token, dbId);
      if (existingId) {
        await notion("pages/" + existingId, "PATCH", { properties: props }, token);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, action: "updated" }) };
      } else {
        await notion("pages", "POST", { parent: { database_id: dbId }, properties: props }, token);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, action: "created" }) };
      }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Méthode non supportée" }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
