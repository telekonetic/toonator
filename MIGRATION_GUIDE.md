# Migration Guide: Serverless → HTML Template Structure

## Overview

Your Toonator application has been migrated from a serverless API-based structure to a clean HTML template architecture with separated concerns (HTML, CSS, JavaScript).

## New Directory Structure

```
/pages
├── profile.html              # User profile page
└── toon.html                 # Individual toon viewer

/js
├── api.js                    # Centralized API & Supabase functions
├── profile.js                # Profile page logic
├── paginator.js              # Pagination utilities
├── config.js                 # Existing config (unchanged)
├── auth.js                   # Existing auth (unchanged)
├── color-username.js         # Existing utilities (unchanged)
├── main.js                   # Existing main (unchanged)
└── ... other existing files

/templates
└── toon-preview.html         # Reusable toon preview component

/includes
├── header.html               # Existing includes (unchanged)
├── footer.html
├── auth-modal.html
└── donate.html

/api
├── user.js                   # API redirect/bridge handler
└── toon/
    └── [id].js               # (old, can be deprecated)
```

## What Changed

### Before (Serverless):

- `/api/user/[username].js` - Generated full HTML server-side
- `/api/toon/[id].js` - Generated full HTML server-side
- Business logic mixed with HTML template strings

### After (HTML Templates):

- Clean separation of concerns
- HTML files contain only markup
- All data fetching and logic in JavaScript modules
- Reusable API functions in `api.js`
- Page-specific logic in separate modules (`profile.js`, etc.)

## URL Routing

### Profile Pages

**Old:** `/api/user/[username]` or `/user/[username]`  
**New:** `/pages/profile.html?username=[username]`

For cleaner URLs, you can configure your server to rewrite:

- `/user/[username]` → `/pages/profile.html?username=[username]`

### Toon Pages

**Old:** `/api/toon/[id]` or `/toon/[id]`  
**New:** `/pages/toon.html?id=[id]`

For cleaner URLs, configure your server to rewrite:

- `/toon/[id]` → `/pages/toon.html?id=[id]`

## Vercel Configuration

If using Vercel, update `vercel.json` to add rewrites:

```json
{
  "rewrites": [
    {
      "source": "/user/:username",
      "destination": "/pages/profile.html?username=:username"
    },
    {
      "source": "/toon/:id",
      "destination": "/pages/toon.html?id=:id"
    }
  ]
}
```

## Module Usage

### Import the API module

```javascript
import {
  getProfileByUsername,
  getUserToons,
  getToonById,
  getToonComments,
  escapeHTML,
} from "/js/api.js";
```

### Import the paginator module

```javascript
import {
  renderPaginator,
  calculateTotalPages,
  getCurrentPageFromURL,
} from "/js/paginator.js";
```

### Import profile logic

```javascript
import { initProfile } from "/js/profile.js";
```

## Key API Functions

### Profile Functions

- `getProfileByUsername(username)` - Get user profile data
- `getProfileStats(userId)` - Get user statistics (toons, drafts, comments)
- `getUserToons(userId, page, perPage)` - Get user's toons with pagination
- `updateUserAvatar(username, toonId)` - Update user avatar

### Toon Functions

- `getToonById(id)` - Get toon data
- `getAuthorData(userId)` - Get toon author info
- `getContinuedFromInfo(toonId)` - Get original toon info if continued
- `getToonComments(toonId)` - Load toon comments with author data
- `postComment(toonId, text)` - Post a comment
- `getToonLikes(toonId)` - Get like count
- `toggleToonLike(toonId)` - Like/unlike a toon

### Utility Functions

- `loadIncludes()` - Load header/footer/modal HTML
- `escapeHTML(str)` - XSS protection helper
- `formatDate(iso)` - Format dates

## Database & Supabase

All Supabase configuration is in `/js/config.js`. The API keys are shared across modules.

```javascript
import { db } from "/js/config.js";
```

The database client is expected to be initialized in `config.js`:

```javascript
export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

## Migration Checklist

- [ ] Update internal links from `/toon/[id]` to `/pages/toon.html?id=[id]`
- [ ] Update internal links from `/user/[username]` to `/pages/profile.html?username=[username]`
- [ ] Configure server rewrites (Vercel/Nginx/etc.) for clean URLs
- [ ] Test profile pages with pagination
- [ ] Test toon pages with comments, likes, and continue functionality
- [ ] Update any hardcoded links in HTML files
- [ ] Remove or disable old `/api/user/[username].js` and `/api/toon/[id].js` if no longer needed
- [ ] Update analytics/tracking if applicable
- [ ] Test authentication flows

## Testing the New Pages

### Profile Page

```
http://localhost:3000/pages/profile.html?username=testuser
```

### Toon Page

```
http://localhost:3000/pages/toon.html?id=toon123
```

## Common Issues & Solutions

### Issue: Pages show "Loading..." indefinitely

**Solution:** Check browser console for errors. Ensure API keys in `config.js` are valid.

### Issue: Links between pages don't work

**Solution:** Update all internal links to use new URL patterns:

- Change `/toon/123` to `/pages/toon.html?id=123`
- Change `/user/username` to `/pages/profile.html?username=username`

### Issue: Avatar images not loading

**Solution:** Verify the Supabase URL and image paths in `api.js` are correct.

### Issue: Modules not found

**Solution:** Ensure ES6 module imports have `.js` extension and correct paths.

## Performance Improvements

The new structure provides several benefits:

- **Static HTML**: Pages can be cached and served faster
- **Client-side rendering**: Reduces server load
- **Modular code**: Easier to maintain and extend
- **Reusable components**: Template and pagination logic can be shared
- **Better XSS protection**: Centralized escaping in `api.js`

## Next Steps

1. **Update routing** - Configure server to rewrite old URLs to new paths
2. **Update links** - Find and replace hardcoded URLs in all HTML files
3. **Test thoroughly** - Verify all features work with the new structure
4. **Deploy gradually** - Consider A/B testing or gradual rollout
5. **Monitor logs** - Watch for 404s or API errors in production

## Questions?

Refer to:

- Individual page files for HTML structure
- `js/api.js` for all API functions
- `js/profile.js` for profile-specific logic
- `js/paginator.js` for pagination utilities
