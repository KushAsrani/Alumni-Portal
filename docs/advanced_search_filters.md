# Advanced Search & Filtering — Implementation Plan

## Architecture
- **API Layer**: New `/api/alumni/search` endpoint backed by MongoDB
- **Frontend**: Astro page (SSR, `prerender=false`) with reactive client-side JS updating the grid via fetch
- **URL Sync**: All filter state reflected in URL params for shareability

## Key Components
1. `src/pages/api/alumni/search.ts` — MongoDB-backed search API with facets
2. `src/pages/alumni/profiles/index.astro` — Upgraded directory page
3. MongoDB text index on `alumni_registrations` collection

## Data Flow
1. User visits `/alumni/profiles?q=python&faculty=Software+Engineering`
2. Astro SSR reads URL params, calls MongoDB, returns initial HTML with results + facets
3. Client JS attaches listeners to all filter inputs
4. On change: fetch `/api/alumni/search?...` → update grid HTML → update URL

## MongoDB Indexes Required
```js
db.alumni_registrations.createIndex({
  name: 'text', short_bio: 'text', skills: 'text',
  company: 'text', location: 'text', faculty: 'text'
})
db.alumni_registrations.createIndex({ faculty: 1 })
db.alumni_registrations.createIndex({ year: 1 })
db.alumni_registrations.createIndex({ skills: 1 })
db.alumni_registrations.createIndex({ location: 1 })
db.alumni_registrations.createIndex({ company: 1 })
db.alumni_registrations.createIndex({ status: 1 })
```

## Skill Readiness Levels
Alumni profiles support a `skill_readiness` field:
- `beginner` | `intermediate` | `advanced` | `expert`
Shown as a colored dot next to skill tag on profile cards and in skill filters.

# Testing Guide — Advanced Search & Filtering

## 1. API Endpoint Tests (`/api/alumni/search`)

| Test | Steps | Expected Result |
|---|---|---|
| Basic text search | GET `/api/alumni/search?q=python` | Returns alumni with "python" in name/bio/skills |
| Multi-select faculty | GET `/api/alumni/search?faculty=Software+Engineering,Computer+Engineering` | Returns alumni from both faculties |
| Multi-select year | GET `/api/alumni/search?year=2022,2023` | Returns alumni from 2022 and 2023 |
| Skills filter | GET `/api/alumni/search?skills=React,Node.js` | Returns alumni with React OR Node.js skills |
| Location filter | GET `/api/alumni/search?location=Mumbai` | Returns alumni in Mumbai |
| Availability filter | GET `/api/alumni/search?availability=mentorship` | Returns alumni with `open_to_mentorship: true` |
| Combined filters | GET `/api/alumni/search?q=dev&faculty=Software+Engineering&year=2022&skills=Python` | Returns intersection of all filters |
| Pagination | GET `/api/alumni/search?page=2&limit=10` | Returns second page of 10 results |
| Facets present | Any search | Response includes `facets` with counts for faculty/skills/location/year/company |
| Empty results | GET `/api/alumni/search?q=xyznonexistent` | Returns `{ alumni: [], total: 0, ... }` |
| Status filter | Any search | Only `status: 'approved'` alumni returned |

## 2. UI Filter Tests

| Test | Steps | Expected Result |
|---|---|---|
| Multi-select faculty | Click Faculty dropdown → check "Software Engineering" + "Computer Engineering" → observe grid | Only alumni from those 2 faculties shown |
| Skills tag cloud | Click "Python" skill pill | Pill highlighted, grid updates, URL shows `skills=Python` |
| Remove chip | Click ✕ on active filter chip | Filter removed, grid updates, URL updated |
| Clear All | Click "Clear All Filters" | All filters reset, full alumni list shown |
| Search debounce | Type in search box quickly | Only one API call fired after 300ms pause |

## 3. URL Sync Tests

| Test | Steps | Expected Result |
|---|---|---|
| Filter → URL update | Apply any filter | URL query params updated in browser without page reload |
| URL → Filter pre-population | Visit `/alumni/profiles?faculty=Software+Engineering&skills=Python` directly | Faculty and skill filters pre-selected, correct results shown |
| Shareable URL | Copy URL after filtering, open in new tab | Identical results and filter state in new tab |
| Back button | Apply filters, click browser Back | Previous filter state restored |

## 4. Edge Cases

| Test | Expected Result |
|---|---|
| Special characters in search (e.g., `C++`, `C#`) | Properly escaped in query, correct results |
| Very long skill list in tag cloud | Scrollable or paginated tag cloud, no overflow |
| No MongoDB connection | API returns 500 with error message; UI shows "Search unavailable" fallback |
| Alumni with no skills | Not excluded from non-skill-filtered searches |
