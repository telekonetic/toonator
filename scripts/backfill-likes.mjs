#!/usr/bin/env node
/**
 * Backfill Script: Update likes count in animations table
 * This script counts the actual likes in the likes table and updates the animations table
 * Uses REST API directly via fetch
 */

const SUPABASE_URL = "https://ytyhhmwnnlkhhpvsurlm.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0eWhobXdubmxraGhwdnN1cmxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzcwNTAsImV4cCI6MjA4ODU1MzA1MH0.XZVH3j6xftSRULfhdttdq6JGIUSgHHJt9i-vXnALjH0";

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSupabase(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
      Prefer: "return=minimal",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  const text = await res.text();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch (e) {
    return [];
  }
}

async function backfillLikes() {
  console.log("🔄 Starting likes count backfill...\n");

  try {
    // Get all animations
    console.log("📥 Fetching all animations...");
    const animations = await fetchSupabase(
      "/animations?select=id,likes&order=created_at",
    );

    console.log(`📊 Found ${animations.length} animations\n`);

    if (animations.length === 0) {
      console.log("✅ No animations to process");
      return;
    }

    let updated = 0;
    let corrected = 0;
    let errors = 0;

    // Process each animation
    for (let i = 0; i < animations.length; i++) {
      const anim = animations[i];
      const progress = `[${i + 1}/${animations.length}]`;

      try {
        // Count actual likes for this animation
        const likesData = await fetchSupabase(
          `/likes?animation_id=eq.${anim.id}&select=id`,
        );
        const actualLikes = Array.isArray(likesData) ? likesData.length : 0;

        // Update if different
        if (anim.likes !== actualLikes) {
          await fetchSupabase(`/animations?id=eq.${anim.id}`, {
            method: "PATCH",
            body: JSON.stringify({ likes: actualLikes }),
          });

          console.log(
            `${progress} Fixed ${anim.id}: ${anim.likes || 0} → ${actualLikes}`,
          );
          corrected++;
        } else {
          console.log(`${progress} OK ${anim.id}: ${actualLikes} likes`);
        }

        updated++;
      } catch (err) {
        console.error(`${progress} ERROR ${anim.id}:`, err.message);
        errors++;
      }

      // Small delay to avoid rate limiting
      await sleep(50);
    }

    console.log("\n✅ Backfill complete!");
    console.log(`   Processed: ${updated}/${animations.length}`);
    console.log(`   Corrected: ${corrected}`);
    console.log(`   Errors: ${errors}`);
  } catch (err) {
    console.error("❌ Fatal error:", err.message);
    process.exit(1);
  }
}

backfillLikes();
