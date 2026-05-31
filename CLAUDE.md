# BourseNext — CLAUDE.md

Contexte persistant pour les sessions Claude Code. Lire AVANT toute modification.

## Stack & déploiement

- **React CRA** (Create React App, `react-scripts`)
- **Déployé sur Vercel** — auto-deploy depuis branche `main` de GitHub (`IAM97X/bourse-analyzer`)
- `CI=false react-scripts build` dans vercel.json (supprime les warnings as errors)
- **Supabase** : auth + cloud sync des données utilisateur (table `user_data`)
- **localStorage** : stockage local principal (clés `bourse_*`)
- **Pas de test runner configuré**

## Architecture

```
src/
  components/         # Tous les composants React
    HomeTab.jsx       # Accueil : résumé PF + graphique évolution
    PortfolioTab.jsx  # Tableau positions + cours + sparklines
    MarcheTab.jsx     # Marché : corrélation, perf vs indices
    HistoriqueTab.jsx # Historique : dividendes, opérations
    AutopilotIA.jsx   # IA DCA : analyse + opportunités
    ProfilTab.jsx     # Profil investisseur
    PerformanceCard.jsx  # Bloc performances YTD/mois/veille
    MiniSparkline.jsx    # SVG sparkline 48×14px
  lib/
    api.js            # fetchWithProxy, callClaude, callClaudeHaiku
    storage.js        # load/save localStorage + sync Supabase
    finance.js        # sanitizePositions, fmtEur, fmtPct
    priceHistory.js   # savePricePoint, loadPriceHistory (sparklines)
    market.js         # fetchFMPHistorical, etc.
  constants/
    config.js         # DEFAULT_POSITIONS, DEFAULT_PROFIL
    universe.js       # Univers PEA (tickers Yahoo Finance)
    theme.js          # C (couleurs), shadow
    tabs.js           # TABS enum
api/
  yahoo-proxy.js      # Vercel serverless : proxy Yahoo Finance (contourne blocage CORS)
  claude.js           # Vercel serverless : proxy Anthropic API
```

## Clés localStorage importantes

| Clé | Contenu |
|-----|---------|
| `bourse_portfolio` | Positions (array) |
| `bourse_snapshots` | Historique valorisation (array `{date, valeur, source}`) |
| `bourse_profil` | Profil investisseur (PEA/CTO, DCA, horizon…) |
| `bourse_price_history` | Historique cours par position (sparklines) |
| `bourse_evolution_csv` | CSV Boursobank importé |
| `bourse_api_keys` | Clés API (Anthropic, Google, FMP…) |
| `bourse_autopilot_result_PEA` | Dernière analyse Autopilot |

## Yahoo Finance

- En **dev** : CORS proxies publics (corsproxy.io, allorigins.win)
- En **production** : `/api/yahoo-proxy.js` (Vercel serverless, headers browser réalistes)
- `fetchWithProxy()` dans `src/lib/api.js` route automatiquement selon `NODE_ENV`

## Anthropic / Claude

- En **dev** : appel direct `https://api.anthropic.com/v1/messages` avec header `anthropic-dangerous-direct-browser-access: true`
- En **production** : `/api/claude.js` (Vercel serverless, clé API côté serveur)
- Modèles : `claude-sonnet-4-6` (standard), `claude-haiku-4-5-20251001` (fast)

## Supabase auth

- Table `user_data` : `{user_id, key, value, updated_at}` — sync bidirectionnel
- `pullFromCloud()` au login, `scheduleSync()` (debounce 1.5s) à chaque `save()`
- Reset password : utilise `redirectTo: window.location.origin + window.location.pathname`
- Configurer dans Supabase Dashboard → Auth → URL Configuration → Site URL = `https://boursenext.fr`

## Patterns importants

### Pas de lib de charts
Tous les graphiques sont en **SVG pur** (polyline, path, gradient). Pas de recharts/chart.js.

### Sanitize avant usage
Toujours passer par `sanitizePositions()` avant de lire le portfolio.

### PRU fallback
Quand pas de `dernierCours`, utiliser `p.pru` comme fallback pour valorisation.

### Performance sans snapshots
`perfDepuisAchat = (currentValue - totalInvesti) / totalInvesti * 100` — affiché si pas de snapshot YTD/mensuel.

### Graphique évolution sans données
`syntheticPoints` : 2 points (hier/aujourd'hui) générés depuis les positions courantes si pas de CSV/snapshots/Yahoo.

## Bugs corrigés (ne pas réintroduire)

| Bug | Fix | Fichier |
|-----|-----|---------|
| `<cite>` tags dans résumé Autopilot | `.replace(/<\/?cite[^>]*>/g, "")` | AutopilotIA.jsx |
| Bouton CSV invisible quand graphique vide | Déplacer bouton dans le early return | HomeTab.jsx |
| Budget insuffisant : force 1 titre | `Math.floor()` sans `Math.max(1,...)` | AutopilotIA.jsx |
| Reset password → localhost | `redirectTo` dynamique | AuthPage.jsx |
| STM.PA → STMPA.PA | Correction ticker | universe.js |
| Répartition cible cachée | `useState(true)` | AutopilotIA.jsx |

## Charte design — à respecter impérativement

### Source de vérité : `src/constants/theme.js`
**Toujours importer `C` et `shadow` depuis ce fichier.** Ne jamais coder une couleur en dur dans un composant sans vérifier qu'elle n'existe pas déjà dans `C`.

### Palette de couleurs

| Token | Valeur | Usage |
|-------|--------|-------|
| `C.ink` | `#1C1C1E` | Texte principal |
| `C.inkSoft` | `#3C3C43` | Texte secondaire |
| `C.inkMuted` | `#6C6C70` | Texte tertiaire, labels |
| `C.inkSubtle` | `#8E8E93` | Placeholders, hints |
| `C.snow` | `#FFFFFF` | Fond card blanc |
| `C.snowOff` | `#F8F9FA` | Fond légèrement grisé |
| `C.snowDim` | `#EDF0F4` | Fond encore plus grisé |
| `C.border` | `rgba(17,18,20,0.07)` | Bordures partout |
| `C.accent` | `#2D6CB5` | Bleu principal, CTA |
| `C.accentGrad` | gradient bleu | Boutons primaires, pills actives |
| `C.navyLight` | `rgba(45,108,181,0.07)` | Fond bleu très léger |
| `C.paleBlue` | `rgba(45,108,181,0.08)` | Idem navyLight |
| `C.navyPill` | `#2D6CB5` | Pills actives |
| `C.green` | `#27AE60` | Hausse, positif |
| `C.greenLight` | `rgba(39,174,96,0.08)` | Fond vert léger |
| `C.red` | `#E74C3C` | Baisse, danger |
| `C.redLight` | `rgba(231,76,60,0.08)` | Fond rouge léger |
| `C.gold` | `#E6B800` | Neutre, attente |
| `C.goldDark` | `#B8920A` | Texte sur fond or |
| `C.goldLight` | `rgba(255,215,0,0.10)` | Fond or léger |
| `C.sb` | `#F8F9FA` | Fond sidebar |
| `C.sbText` | `#8896A8` | Texte sidebar inactif |
| `C.sbTextActive` | `#111214` | Texte sidebar actif |
| `C.sbAccent` | `#2D6CB5` | Icône sidebar actif |

**Couleurs interdites en dehors de theme.js** : ne pas utiliser `#1A3A6B`, `#0F2D5E`, `#4B9DD8` directement dans les composants — si besoin, les ajouter dans `theme.js`.

### Typographie

- **Police unique** : `'DM Sans', sans-serif` — toujours spécifier `fontFamily` dans les styles inline
- **Échelle de tailles** :
  - `9px` — labels uppercase (letterSpacing: "1px", textTransform: "uppercase", fontWeight: 700)
  - `10px` — labels secondaires
  - `11px` — petits textes, badges
  - `12px` — corps compact, boutons toolbar
  - `13px` — corps standard (taille dominante dans l'app)
  - `15–16px` — titres de section
  - `18–20px` — titres principaux (fontWeight 800, letterSpacing "-0.03em")
- **Règle** : ne pas utiliser de tailles intermédiaires non listées (14px existe mais rarement, pas 17px ou 19px)

### Rayons de bordure (borderRadius)

| Valeur | Usage |
|--------|-------|
| `8px` | Boutons toolbar, champs small, tags |
| `10px` | Cards secondaires, conteneurs |
| `12px` | Boutons CTA modaux |
| `14px` | Inputs de formulaire |
| `16px` | Cards sidebar |
| `18–20px` | Cards principales |
| `50px` | Pills, boutons primaires arrondis |

### Ombres — utiliser `shadow.*` de theme.js

| Token | Usage |
|-------|-------|
| `shadow.card` | `0 1px 3px rgba(17,18,20,0.06)` — carte au repos |
| `shadow.float` | `0 4px 16px rgba(17,18,20,0.07)` — éléments flottants |
| `shadow.hover` | `0 6px 20px rgba(30,58,95,0.10)` — survol |
| `shadow.pill` | `0 2px 8px rgba(45,108,181,0.25)` — boutons pill |

### Boutons — patterns standards

```js
// Bouton primaire (CTA principal)
{ background: C.accentGrad, border: "none", borderRadius: "50px",
  padding: "11px 22px", color: "#fff", fontSize: "12px",
  fontFamily: "'DM Sans', sans-serif", fontWeight: "700",
  cursor: "pointer", boxShadow: shadow.pill }

// Bouton toolbar secondaire
{ background: C.snowOff, border: `1px solid ${C.border}`,
  borderRadius: "8px", padding: "9px 16px", color: C.inkMuted,
  fontSize: "12px", fontFamily: "'DM Sans', sans-serif", fontWeight: "700", cursor: "pointer" }

// Bouton navy léger (analyser, actions IA)
{ background: C.navyLight, border: "1px solid rgba(30,58,95,0.12)",
  borderRadius: "8px", padding: "9px 16px", color: C.navy,
  fontSize: "12px", fontFamily: "'DM Sans', sans-serif", fontWeight: "700", cursor: "pointer" }

// Bouton danger
{ background: C.redLight, border: "1px solid rgba(220,38,38,0.2)",
  borderRadius: "8px", padding: "8px 16px", color: C.red,
  fontSize: "11px", fontFamily: "'DM Sans', sans-serif", fontWeight: "700", cursor: "pointer" }
```

### Inputs — pattern standard

```js
{ background: C.snowOff, border: `1px solid ${C.border}`,
  borderRadius: "14px", padding: "11px 16px", color: C.ink,
  fontSize: "13px", fontFamily: "'DM Sans', sans-serif",
  outline: "none", boxSizing: "border-box", width: "100%", fontWeight: "500" }
```

### Cards — pattern standard

```js
// Card standard
{ background: "#fff", border: `1px solid ${C.border}`,
  borderRadius: "18px", padding: "20px 22px", boxShadow: shadow.card }

// Card avec fond grisé
{ background: C.snowOff, border: `1px solid ${C.border}`,
  borderRadius: "10px", padding: "16px 18px", boxShadow: shadow.card }

// Card navy light (sections IA)
{ background: C.navyLight, border: "1px solid rgba(30,58,95,0.12)",
  borderRadius: "10px", padding: "16px 18px" }
```

### Fond de page

- **App principale** : `background: "#F5F5F7"` (gris Apple très léger)
- **LandingPage** : `background: "#fff"` + sections alt `background: "#F8FAFC"`
- **Sidebar** : `background: C.sb` = `"#F8F9FA"`
- **Ne jamais utiliser de fond dark** (#021024, #052659, etc.) dans l'app — uniquement dans LandingPage si explicitement demandé

### Signaux IA — depuis `config.js`

```js
import { SIGNAL_CONFIG } from "../constants/config";
// ACHAT → C.green / C.greenLight
// RENFORCER → C.navy / C.navyLight
// ATTENDRE → C.goldDark / C.goldLight
// PRUDENCE → C.red / C.redLight
// VENDRE → #DC2626 / #FFF5F5
```

### Règles générales

1. **Toujours importer `C` et `shadow`** — ne pas recréer les valeurs localement
2. **Pas de texte blanc sur fond blanc** — vérifier le contraste avant d'écrire
3. **Pas d'emojis** dans l'UI sauf si explicitement demandé — utiliser des icônes SVG
4. **Pas de `font-size: 14px`** sauf exception justifiée — la taille standard est 13px
5. **Animations** : toujours `cubic-bezier(0.16,1,0.3,1)` pour les transitions importantes, `0.15–0.2s ease` pour les hovers
6. **Mode démo** : toujours vérifier `isDemoMode()` pour masquer les actions interactives

## Commandes utiles

```bash
npm start          # Dev local
npm run build      # Build prod (CI=false pour ignorer warnings)
git push           # Déclenche auto-deploy Vercel (~2 min)
```

Après un `git push`, attendre ~2 min puis **Cmd+Shift+R** sur Safari pour vider le cache.
