# URL Update Examples

Use this file as a reference when updating links throughout your application.

## Link Updates

### Profile Page Links

```html
<!-- OLD -->
<a href="/user/john">John's Profile</a>
<a href="/api/user/john">John's Profile</a>
<a href="/user/${username}/">View Profile</a>

<!-- NEW -->
<a href="/pages/profile.html?username=john">John's Profile</a>
<a href="/pages/profile.html?username=john">John's Profile</a>
<a href="/pages/profile.html?username=${encodeURIComponent(username)}"
  >View Profile</a
>
```

### Toon Page Links

```html
<!-- OLD -->
<a href="/toon/abc123">View Toon</a>
<a href="/api/toon/abc123">View Toon</a>
<a href="/toon/${toonId}">Continue</a>

<!-- NEW -->
<a href="/pages/toon.html?id=abc123">View Toon</a>
<a href="/pages/toon.html?id=abc123">View Toon</a>
<a href="/pages/toon.html?id=${toonId}">Continue</a>
```

## JavaScript URL Handling

### Building Profile URLs

```javascript
// OLD
function getProfileURL(username) {
  return `/user/${username}`;
}

// BETTER - With encoding
function getProfileURL(username) {
  return `/pages/profile.html?username=${encodeURIComponent(username)}`;
}
```

### Building Toon URLs

```javascript
// OLD
function getToonURL(id) {
  return `/toon/${id}`;
}

// NEW
function getToonURL(id) {
  return `/pages/toon.html?id=${id}`;
}
```

### Pagination Links

```javascript
// OLD
// renderPaginator builds links like: /user/john/2/
function renderPaginator(totalPages, username, currentPage) {
  items += `<li><a href="/user/${username}/${i}/">${i}</a></li>`;
}

// NEW - Using query parameters
function renderPaginator(totalPages, username, currentPage) {
  items += `<li><a href="/pages/profile.html?username=${encodeURIComponent(username)}&page=${i}">${i}</a></li>`;
}
```

### Parse URL Parameters

```javascript
// Consistent way to get parameters in new pages
function getURLParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// Usage
const username = getURLParam("username");
const toonId = getURLParam("id");
const page = parseInt(getURLParam("page") || "1");
```

## Template Updates

### In HTML Templates

```html
<!-- OLD -->
<img src="/api/toon/${id}/avatar.jpg" />

<!-- NEW - Direct Supabase access -->
<img
  src="https://ytyhhmwnnlkhhpvsurlm.supabase.co/storage/v1/object/public/previews/${id}_100.gif"
/>
```

### Toon Preview Component

```html
<!-- OLD -->
<div class="toon_preview">
  <a href="/toon/${toonId}">${title}</a>
</div>

<!-- NEW - Updated in profile.js/toon.html -->
<div class="toon_preview">
  <a href="/pages/toon.html?id=${toonId}">${title}</a>
</div>
```

## Continue/Edit Links

```javascript
// OLD
<a href="/draw/?continue=${id}">Continue Drawing</a>

// NEW - Same path, draw page doesn't change
<a href="/draw/?continue=${id}">Continue Drawing</a>

// Or with redirect from old toon page
<a id="continue_link" href="/draw/?continue=${TOON_ID}">Continue</a>
```

## Search and Replace Guide

### VS Code Find & Replace

**Profile Links:**

```
Find:    /user/(\w+)
Replace: /pages/profile.html?username=$1
Regex:   true
```

**Toon Links:**

```
Find:    /toon/([a-zA-Z0-9]+)
Replace: /pages/toon.html?id=$1
Regex:   true
```

**API Toon Links:**

```
Find:    /api/toon/([a-zA-Z0-9]+)
Replace: /pages/toon.html?id=$1
Regex:   true
```

## Server Redirect/Rewrite Rules

### Vercel (vercel.json)

```json
{
  "rewrites": [
    {
      "source": "/user/:username",
      "destination": "/pages/profile.html?username=:username"
    },
    { "source": "/toon/:id", "destination": "/pages/toon.html?id=:id" }
  ],
  "redirects": [
    {
      "source": "/api/user/:username",
      "destination": "/pages/profile.html?username=:username",
      "permanent": false
    },
    {
      "source": "/api/toon/:id",
      "destination": "/pages/toon.html?id=:id",
      "permanent": false
    }
  ]
}
```

### Nginx

```nginx
# Rewrites (transparent - URL doesn't change in browser)
rewrite ^/user/([^/]+)/?$ /pages/profile.html?username=$1 last;
rewrite ^/toon/([^/]+)/?$ /pages/toon.html?id=$1 last;

# Or redirects (browser sees the change)
redirect 301 /api/user/(.*) /pages/profile.html?username=$1;
redirect 301 /api/toon/(.*) /pages/toon.html?id=$1;
```

### Apache (.htaccess)

```apache
RewriteEngine On
RewriteRule ^user/([^/]+)/?$ /pages/profile.html?username=$1 [L]
RewriteRule ^toon/([^/]+)/?$ /pages/toon.html?id=$1 [L]
RewriteRule ^api/user/(.*) /pages/profile.html?username=$1 [R=301,L]
RewriteRule ^api/toon/(.*) /pages/toon.html?id=$1 [R=301,L]
```

## Data Attribute Usage

If you're using data attributes in HTML:

```html
<!-- OLD -->
<div data-toon-id="abc123" data-username="john">...</div>

<!-- NEW - Same usage, access via JavaScript -->
<div data-toon-id="abc123" data-username="john">...</div>

<!-- In JavaScript -->
const element = document.querySelector('[data-toon-id]'); const toonId =
element.dataset.toonId; // "abc123" const username = element.dataset.username;
// "john" // Build URL const url = `/pages/toon.html?id=${toonId}`;
```

## Common Patterns

### Profile Card

```html
<!-- OLD -->
<div class="user-card">
  <a href="/user/${user.username}">${user.username}</a>
  <img src="/api/user/${user.id}/avatar.jpg" />
</div>

<!-- NEW -->
<div class="user-card">
  <a href="/pages/profile.html?username=${encodeURIComponent(user.username)}"
    >${user.username}</a
  >
  <img
    src="https://ytyhhmwnnlkhhpvsurlm.supabase.co/storage/v1/object/public/previews/${user.avatar_toon_id || 'default'}_100.gif"
  />
</div>
```

### Toon Card

```html
<!-- OLD -->
<div class="toon-card">
  <a href="/toon/${toon.id}">
    <img src="/api/toon/${toon.id}/thumb.gif" />
  </a>
  <a href="/toon/${toon.id}">${toon.title}</a>
  <a href="/user/${toon.author_username}">by ${toon.author_username}</a>
</div>

<!-- NEW -->
<div class="toon-card">
  <a href="/pages/toon.html?id=${toon.id}">
    <img
      src="https://ytyhhmwnnlkhhpvsurlm.supabase.co/storage/v1/object/public/previews/${toon.id}_100.gif"
    />
  </a>
  <a href="/pages/toon.html?id=${toon.id}">${toon.title}</a>
  <a
    href="/pages/profile.html?username=${encodeURIComponent(toon.author_username)}"
    >by ${toon.author_username}</a
  >
</div>
```

### Breadcrumb Navigation

```html
<!-- OLD -->
<nav class="breadcrumb">
  <a href="/">Home</a> &gt;
  <a href="/user/${username}">${username}</a>
</nav>

<!-- NEW -->
<nav class="breadcrumb">
  <a href="/">Home</a> &gt;
  <a href="/pages/profile.html?username=${encodeURIComponent(username)}"
    >${username}</a
  >
</nav>
```

## Query Parameter Best Practices

### Always Encode Parameters

```javascript
// ❌ WRONG - Can break with special characters
const url = `/pages/profile.html?username=${username}`;

// ✅ CORRECT - Safe with special characters
const url = `/pages/profile.html?username=${encodeURIComponent(username)}`;

// ✅ EXAMPLE - "John Doe" becomes "John%20Doe"
const username = "John Doe";
const url = `/pages/profile.html?username=${encodeURIComponent(username)}`;
// Result: /pages/profile.html?username=John%20Doe
```

### Parsing Parameters

```javascript
// ✅ CORRECT - URLSearchParams handles decoding
const params = new URLSearchParams(window.location.search);
const username = params.get("username"); // Automatically decoded

// ✅ SHORTHAND
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const username = getParam("username");
const page = parseInt(getParam("page") || "1");
```

---

**Pro Tip:** Use these patterns consistently across your app, and consider creating URL builder utility functions:

```javascript
// js/urls.js
export function profileURL(username) {
  return `/pages/profile.html?username=${encodeURIComponent(username)}`;
}

export function toonURL(id) {
  return `/pages/toon.html?id=${id}`;
}

// Usage everywhere
import { profileURL, toonURL } from '/js/urls.js';

<a href="${profileURL(user.username)}">View Profile</a>
<a href="${toonURL(toon.id)}">View Toon</a>
```
