<img src="assets/icon.svg" width="64" height="64" alt="">

# SparkBot

Created in [T3 Code](https://t3.codes).

Registration checks unlinked members for similar names before inserting. A private,
15-minute confirmation lets the user link an existing record or create a new one.
Linking preserves the existing name, hours and relationships; the Discord server
nickname uses the submitted name (with surrounding whitespace removed).

Before deploying this change, apply `migrations/0003_registration_confirmation.sql`
through your D1 migration workflow. Its unique Discord-ID index intentionally fails
if existing rows share a non-null Discord ID. Check those conflicts first:

```sql
SELECT discord_id, COUNT(*) FROM members
WHERE discord_id IS NOT NULL
GROUP BY discord_id HAVING COUNT(*) > 1;
```

Matching currently scans unlinked member names and offers the best 24 candidates,
with chapter used to rank ties. It does not merge existing duplicates automatically.
