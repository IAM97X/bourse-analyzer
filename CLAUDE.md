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

## Commandes utiles

```bash
npm start          # Dev local
npm run build      # Build prod (CI=false pour ignorer warnings)
git push           # Déclenche auto-deploy Vercel (~2 min)
```

Après un `git push`, attendre ~2 min puis **Cmd+Shift+R** sur Safari pour vider le cache.
