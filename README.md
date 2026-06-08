# Pilotage — app de suivi quotidien

App web mono-fichier (santé / sport / nutrition / mental) avec backend Notion via Netlify Function.
Même pattern que RUSHUP / Réel Média.

## Architecture
```
index.html  ──>  /.netlify/functions/suivi  ──>  API Notion  ──>  base "Pilotage — Suivi quotidien"
```
- Le `NOTION_TOKEN` reste dans la Function (jamais exposé au navigateur).
- Upsert : une ligne par jour, recherchée par date. Existe → update, sinon → create.
- Fallback `localStorage` : l'app loggue même si Notion est hors ligne, et resynchronise au save suivant.

## Base Notion (déjà créée)
- **Database ID :** `eb0cfde5-eeef-4528-b9c8-5810800421f6`
- **Data source / collection ID :** `72453d5b-4977-487f-9b43-688d7104dfc8`
- URL : https://app.notion.com/p/eb0cfde5eeef4528b9c85810800421f6

## Setup (3 étapes)

### 1. Connecter l'intégration à la base
Dans Notion, ouvre la base → menu `•••` (en haut à droite) → **Connexions** → ajoute ton intégration.
Sans ça, la Function reçoit une erreur 404/permission.

### 2. Variables d'environnement Netlify
Dans Netlify → Site settings → Environment variables :
| Clé | Valeur |
|---|---|
| `NOTION_TOKEN` | le token secret de ton intégration (`secret_…` ou `ntn_…`) |
| `NOTION_DB_ID` | `72453d5b-4977-487f-9b43-688d7104dfc8` |

> ⚠️ `NOTION_DB_ID` = le **data source ID** (la collection), pas l'URL de la page.

### 3. Déployer
- Repo : `David-f10/pilotage`
- Push → Netlify build auto. La Function est à `/.netlify/functions/suivi`.

## Test rapide de la Function
```bash
# lire un jour
curl "https://<ton-site>.netlify.app/.netlify/functions/suivi?date=2026-06-07"
# écrire un jour
curl -X POST "https://<ton-site>.netlify.app/.netlify/functions/suivi" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-06-07","fields":{"velo":true,"energy":4,"weight":97}}'
```

## Champs (mapping app → Notion)
| App | Notion | Type |
|---|---|---|
| coffeeNoSug | Café sans sucre | checkbox |
| noPain | Pain au choc évité | checkbox |
| lunchSrc | Déjeuner source | select |
| dessert | Dessert midi | checkbox |
| velo / neoness / marche / bettermen | Vélo / Neoness / Marche retour / BetterMen | checkbox |
| fast / bed / wake | Jeûne 13-20h / Couché 23h30 / Levé 7h15 | select (Oui/À peu près/Non) |
| energy | Énergie | number (1-5) |
| weight | Poids | number |
| meals | Plats restants | number |
| mood | Humeur | text |
| note | Note | text |

## Lien avec le projet Claude coach
Une fois en ligne, le projet Claude (connecteur Notion) peut lire cette même base pour générer les bilans hebdo automatiquement.
