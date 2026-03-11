# New Project Structure - Quick Reference

## File Tree

```
toonator/
├── pages/
│   ├── profile.html          ← User profile - Load via: /pages/profile.html?username=john
│   └── toon.html             ← Toon viewer - Load via: /pages/toon.html?id=abc123
│
├── js/
│   ├── api.js                ← All API calls to Supabase (NEW)
│   ├── profile.js            ← Profile page logic (NEW)
│   ├── paginator.js          ← Pagination utilities (NEW)
│   ├── config.js             ← Supabase config (UPDATED)
│   ├── auth.js               ← Auth logic (existing)
│   ├── color-username.js     ← Utilities (existing)
│   └── ... other files
│
├── templates/
│   └── toon-preview.html     ← Reusable toon preview template (NEW)
│
├── includes/
│   ├── header.html           ← (existing)
│   ├── footer.html           ← (existing)
│   ├── auth-modal.html       ← (existing)
│   └── donate.html           ← (existing)
│
├── api/
│   ├── user.js               ← Redirect handler for /api/user/:username (UPDATED)
│   └── toon/
│       └── [id].js           ← (old, deprecated)
│
├── css/, img/, other files   ← (unchanged)
└── MIGRATION_GUIDE.md        ← Full migration documentation (NEW)
```

## URL Mapping

### Old URLs → New URLs

```
Old (Serverless)           New (HTML Template)
─────────────────────────────────────────────────────────
/api/user/john       →     /pages/profile.html?username=john
/user/john           →     /pages/profile.html?username=john
/api/toon/abc123     →     /pages/toon.html?id=abc123
/toon/abc123         →     /pages/toon.html?id=abc123
```

For clean URLs (without query params), configure server rewrites:

### Vercel Rewrites

```json
// vercel.json
{
  "rewrites": [
    {
      "source": "/user/:username",
      "destination": "/pages/profile.html?username=:username"
    },
    { "source": "/toon/:id", "destination": "/pages/toon.html?id=:id" }
  ]
}
```

### Nginx Rewrites

```nginx
location /user/(.+) {
  rewrite ^/user/(.+)$ /pages/profile.html?username=$1 last;
}

location /toon/(.+) {
  rewrite ^/toon/(.+)$ /pages/toon.html?id=$1 last;
}
```

## Key Changes

### Separation of Concerns

| Before                                 | After                   |
| -------------------------------------- | ----------------------- |
| Serverless function with embedded HTML | Clean HTML file         |
| Template strings for HTML generation   | Separate template files |
| Hard to reuse code                     | Modular JS functions    |
| Everything in one large file           | Organized by feature    |

### Key Files Created

1. **`/js/api.js`** (310+ lines)
   - All Supabase API functions
   - Generic utilities (escape, format date)
   - Named exports for easy importing
   - Handles all data fetching

2. **`/js/profile.js`** (80+ lines)
   - Profile page initialization
   - Toon rendering logic
   - User stats display
   - Avatar management

3. **`/js/paginator.js`** (20+ lines)
   - Pagination rendering
   - Page calculation utilities
   - URL parameter parsing

4. **`/pages/profile.html`** (Clean HTML)
   - No template strings
   - Simple layout markup
   - Only imports logic via modules

5. **`/pages/toon.html`** (Clean HTML)
   - No template strings
   - Player container
   - Comments section
   - Metadata fields

6. **`/templates/toon-preview.html`**
   - Reusable card component
   - Template variables for easy cloning/population

## Import Examples

### Profile Page (pages/profile.html)

```javascript
import { initProfile } from "/js/profile.js";
import { db } from "/js/config.js";

const username = new URLSearchParams(window.location.search).get("username");
initProfile(username);
```

### API Module (js/api.js)

```javascript
import { getProfileByUsername, getToonById, getToonComments } from "/js/api.js";
import { renderPaginator } from "/js/paginator.js";
import { db } from "/js/config.js";
```

## Data Flow

### Old (Serverless)

```
User Request
    ↓
Serverless Function Handler
    ↓ (Executes Node.js code)
Query Database
    ↓ (Build entire HTML server-side)
Generate HTML string
    ↓
Send response
```

### New (HTML Template)

```
User Request
    ↓
Static HTML File
    ↓
JS Modules Load
    ↓
Call Supabase from Browser
    ↓
Populate DOM with data
```

## Performance Benefits

✅ **Faster initial page load** - Static HTML doesn't need server processing  
✅ **Better caching** - CSS & JS can be cached aggressively  
✅ **Reduced server load** - No server-side rendering needed  
✅ **Easier debugging** - Client-side code is visible in DevTools  
✅ **Better SEO** - Can use static site generation or SSG

## Backward Compatibility

The old API route `/api/user/:username` still works:

- Redirects to `/pages/profile.html?username=:username`
- Allows gradual migration of links

Once all links are updated, you can remove:

- `/api/user/[username].js`
- `/api/toon/[id].js`

## What Stayed the Same

- `/js/config.js` - Supabase setup
- `/js/auth.js` - Authentication logic
- `/includes/` - Header, footer, modals
- `/css/`, `/img/` - Styles and assets
- All other existing JavaScript files

## Next Steps

1. ✅ **Verify structure** - All files created successfully
2. 📋 **Update links** - Change all hardcoded URLs to new patterns
3. 🔗 **Configure rewrites** - Set up clean URLs on your server
4. 🧪 **Test thoroughly** - Visit all profile and toon pages
5. 🚀 **Deploy** - Push to production with confidence

---

See `MIGRATION_GUIDE.md` for detailed migration instructions and troubleshooting.
