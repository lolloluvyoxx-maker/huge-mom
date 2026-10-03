# Liability add-ons (discord.js)

Separate Node.js bot files, independent from the .NET project in this repo.

- `index.js` — the Liability bot with one added line that loads the add-ons.
- `liability-addons.js` — suggestions, reputation, Connect Four, hangman,
  anime/manga (AniList) and repeaters. Prefix `,`.

Run from this folder (needs `discord.js`, `pg`, `jimp`, `lavalink-client`):
`TOKEN=... DATABASE_URL=... node index.js`
