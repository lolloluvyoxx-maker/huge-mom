// ═══════════════════════════════════════════════════════════════════════════
// LIABILITY ADD-ONS — original implementations of features the bot didn't have:
//   Suggestions · Reputation · Connect Four · Hangman · Anime/Manga (AniList) · Repeaters
// Loaded from index.js via:  require("./liability-addons.js")({ ...helpers })
// Prefix: ","   Persistence: uses the bot's existing Postgres key/value helpers.
// ═══════════════════════════════════════════════════════════════════════════
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");

module.exports = function initLiabilityAddons(ctx) {
  const { client, PINK, ok, err, dbGet, scheduleSave } = ctx;
  const KEY = "liability_addons";
  const FOOT = (m) => ({ text: `Liability • Module: ${m}` });

  // ── persistent state ──────────────────────────────────────────────────────
  const state = { suggest: {}, rep: {}, repeaters: [], repeaterNext: 1 };
  const save = () => scheduleSave(KEY, () => state);
  let loaded = false;
  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      const saved = await dbGet(KEY);
      if (saved && typeof saved === "object") Object.assign(state, saved);
    } catch (e) { console.error("[Liability] load failed:", e.message); }
  }
  client.once("clientReady", load);
  client.once("ready", load);

  const can = (m, flag) => m.member?.permissions.has(flag);

  // ══════════════════════════════════════════════════════════════════════════
  // CONNECT FOUR
  // ══════════════════════════════════════════════════════════════════════════
  const c4Games = new Map();
  const ROWS = 6, COLS = 7;
  const C4_EMOJI = ["🔴", "🟡"];

  function c4Render(g) {
    const head = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣"].join("");
    const body = g.board.map(r => r.map(c => (c === null ? "⚪" : C4_EMOJI[c])).join("")).join("\n");
    return `${head}\n${body}`;
  }
  function c4Buttons(g) {
    const mk = (c) => new ButtonBuilder()
      .setCustomId(`c4:${g.id}:${c}`).setLabel(String(c + 1)).setStyle(ButtonStyle.Secondary)
      .setDisabled(g.over || g.board[0][c] !== null);
    return [
      new ActionRowBuilder().addComponents([0, 1, 2, 3].map(mk)),
      new ActionRowBuilder().addComponents([4, 5, 6].map(mk)),
    ];
  }
  function c4Win(board, r, c, p) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      let n = 1;
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr][cc] === p) { n++; rr += dr * s; cc += dc * s; }
      }
      if (n >= 4) return true;
    }
    return false;
  }
  function c4Embed(g, footer) {
    const status = g.over
      ? (g.winner === null ? "It's a draw!" : `${C4_EMOJI[g.winner]} <@${g.players[g.winner]}> wins!`)
      : `${C4_EMOJI[g.turn]} <@${g.players[g.turn]}>'s turn`;
    return {
      color: PINK, title: "Connect Four",
      description: `${c4Render(g)}\n\n${status}`,
      fields: [{ name: "Players", value: `${C4_EMOJI[0]} <@${g.players[0]}>  vs  ${C4_EMOJI[1]} <@${g.players[1]}>` }],
      footer: FOOT(footer || "Games"),
    };
  }

  client.on("interactionCreate", async (i) => {
    try {
      if (!i.isButton() || !i.customId.startsWith("c4:")) return;
      const [, gid, colStr] = i.customId.split(":");
      const g = c4Games.get(gid);
      if (!g || g.over) return i.update({ components: [] }).catch(() => {});
      if (i.user.id !== g.players[g.turn]) return i.reply({ content: "It's not your turn.", flags: 64 });
      const c = Number(colStr);
      let r = -1;
      for (let row = ROWS - 1; row >= 0; row--) if (g.board[row][c] === null) { r = row; break; }
      if (r === -1) return i.reply({ content: "That column is full.", flags: 64 });
      g.board[r][c] = g.turn;
      if (c4Win(g.board, r, c, g.turn)) { g.over = true; g.winner = g.turn; }
      else if (g.board[0].every(x => x !== null)) { g.over = true; g.winner = null; }
      else g.turn = 1 - g.turn;
      if (g.over) c4Games.delete(gid);
      await i.update({ embeds: [c4Embed(g)], components: g.over ? [] : c4Buttons(g) });
    } catch (e) { console.error("[Liability c4]", e.message); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // HANGMAN
  // ══════════════════════════════════════════════════════════════════════════
  const hangmen = new Map(); // channelId -> game
  const WORDS = ["discord", "keyboard", "dragon", "galaxy", "puzzle", "thunder", "library", "rainbow", "volcano",
    "penguin", "pyramid", "compass", "diamond", "mystery", "jungle", "lantern", "meteor", "orchestra", "treasure",
    "umbrella", "whisper", "zeppelin", "harvest", "blizzard", "carnival", "festival", "horizon", "illusion",
    "journey", "kingdom", "labyrinth", "marathon", "notebook", "octopus", "paradox", "quantum", "reactor", "sapphire"];
  const STAGES = [
    "```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```",
    "```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```",
    "```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```",
    "```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```",
    "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```",
    "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```",
    "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```",
  ];
  function hmEmbed(g, end) {
    const shown = [...g.word].map(ch => (g.guessed.has(ch) ? ch : "_")).join(" ");
    const wrong = [...g.guessed].filter(ch => !g.word.includes(ch));
    let status = `Type a single letter to guess. Lives left: **${6 - g.wrong}**`;
    if (end === "win") status = "🎉 You got it!";
    if (end === "lose") status = `💀 Out of lives! The word was **${g.word}**.`;
    return {
      color: PINK, title: "Hangman",
      description: `${STAGES[g.wrong]}\n\`${shown}\`\n\n${status}`,
      fields: [{ name: "Wrong letters", value: wrong.length ? wrong.join(" ") : "none" }],
      footer: FOOT("Games"),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ANILIST (anime / manga)
  // ══════════════════════════════════════════════════════════════════════════
  async function anilist(type, search) {
    const query = `query($s:String,$t:MediaType){Media(search:$s,type:$t){
      title{romaji english} description(asHtml:false) episodes chapters volumes status averageScore
      genres siteUrl format startDate{year} coverImage{large}}}`;
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { s: search, t: type } }),
    });
    const json = await res.json();
    return json?.data?.Media || null;
  }
  const clean = (s) => (s || "No description.").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  // ══════════════════════════════════════════════════════════════════════════
  // REPEATERS
  // ══════════════════════════════════════════════════════════════════════════
  setInterval(async () => {
    const now = Date.now();
    for (const r of state.repeaters) {
      if (now < r.nextAt) continue;
      r.nextAt = now + r.intervalMin * 60000;
      try {
        const ch = await client.channels.fetch(r.channelId).catch(() => null);
        if (!ch?.send) continue;
        if (r.lastMessageId) await ch.messages.delete(r.lastMessageId).catch(() => {});
        const sent = await ch.send({ content: r.text, allowedMentions: { parse: [] } });
        r.lastMessageId = sent.id;
      } catch (e) { console.error("[Liability repeater]", e.message); }
    }
    if (state.repeaters.length) save();
  }, 30000).unref?.();

  // ══════════════════════════════════════════════════════════════════════════
  // COMMANDS
  // ══════════════════════════════════════════════════════════════════════════
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;
    try {
      // Hangman letter guesses (no prefix)
      const hg = hangmen.get(message.channel.id);
      const trimmed = message.content.trim().toLowerCase();
      if (hg && /^[a-z]$/.test(trimmed)) {
        if (hg.guessed.has(trimmed)) return;
        hg.guessed.add(trimmed);
        if (!hg.word.includes(trimmed)) hg.wrong++;
        const won = [...hg.word].every(ch => hg.guessed.has(ch));
        const lost = hg.wrong >= 6;
        if (won || lost) hangmen.delete(message.channel.id);
        const end = won ? "win" : lost ? "lose" : null;
        const m = await message.channel.messages.fetch(hg.messageId).catch(() => null);
        if (m) await m.edit({ embeds: [hmEmbed(hg, end)] }).catch(() => {});
        message.react(hg.word.includes(trimmed) ? "✅" : "❌").catch(() => {});
        return;
      }

      if (!message.content.startsWith(",")) return;
      const args = message.content.slice(1).trim().split(/ +/);
      const command = (args.shift() || "").toLowerCase();
      const gid = message.guild.id;

      // ── Suggestions ───────────────────────────────────────────────────────
      if (command === "suggestchannel") {
        if (!can(message, PermissionFlagsBits.ManageGuild)) return err(message, "you need **Manage Server** for that.");
        const ch = message.mentions.channels.first();
        if (!ch) return err(message, "usage: `,suggestchannel #channel`");
        const s = (state.suggest[gid] ||= { channelId: null, nextId: 1, items: {} });
        s.channelId = ch.id; save();
        return ok(message, `suggestions will now be posted in ${ch}.`);
      }
      if (command === "suggest") {
        const s = state.suggest[gid];
        if (!s?.channelId) return err(message, "no suggestion channel set. An admin can use `,suggestchannel #channel`.");
        const text = args.join(" ").trim();
        if (!text) return err(message, "usage: `,suggest <your idea>`");
        const ch = await message.guild.channels.fetch(s.channelId).catch(() => null);
        if (!ch?.send) return err(message, "the suggestion channel no longer exists.");
        const id = s.nextId++;
        const sent = await ch.send({ embeds: [{
          color: PINK, title: `Suggestion #${id}`, description: clip(text, 3500),
          author: { name: message.author.tag, icon_url: message.author.displayAvatarURL() },
          fields: [{ name: "Status", value: "⏳ Pending" }], footer: FOOT("Suggestions"),
        }] });
        await sent.react("👍").catch(() => {}); await sent.react("👎").catch(() => {});
        s.items[id] = { messageId: sent.id, authorId: message.author.id, text, status: "pending" };
        save();
        return ok(message, `suggestion **#${id}** posted in ${ch}.`);
      }
      if (["suggestaccept", "suggestdeny", "suggestconsider"].includes(command)) {
        if (!can(message, PermissionFlagsBits.ManageMessages)) return err(message, "you need **Manage Messages** for that.");
        const s = state.suggest[gid];
        const id = Number(args[0]);
        const item = s?.items?.[id];
        if (!item) return err(message, `usage: \`,${command} <id> [reason]\` — suggestion not found.`);
        const [label, color] = {
          suggestaccept: ["✅ Accepted", 0x57F287],
          suggestdeny: ["❌ Denied", 0xED4245],
          suggestconsider: ["🤔 Under consideration", 0xFEE75C],
        }[command];
        item.status = command.replace("suggest", "");
        const reason = args.slice(1).join(" ").trim();
        const ch = await message.guild.channels.fetch(s.channelId).catch(() => null);
        const m = await ch?.messages.fetch(item.messageId).catch(() => null);
        if (!m) return err(message, "I couldn't find that suggestion's message.");
        const old = m.embeds[0]?.toJSON?.() || {};
        await m.edit({ embeds: [{ ...old, color, fields: [
          { name: "Status", value: label },
          ...(reason ? [{ name: `Reason (${message.author.tag})`, value: clip(reason, 1000) }] : []),
        ] }] });
        save();
        return ok(message, `suggestion **#${id}** marked as ${label}.`);
      }

      // ── Reputation ────────────────────────────────────────────────────────
      if (command === "rep") {
        const target = message.mentions.users.first();
        if (!target || target.bot || target.id === message.author.id) return err(message, "usage: `,rep @user` (not yourself, not a bot).");
        const g = (state.rep[gid] ||= { counts: {}, given: {} });
        const last = g.given[message.author.id] || 0;
        const wait = 24 * 3600 * 1000 - (Date.now() - last);
        if (wait > 0) return err(message, `you can give rep again <t:${Math.floor((Date.now() + wait) / 1000)}:R>.`);
        g.given[message.author.id] = Date.now();
        g.counts[target.id] = (g.counts[target.id] || 0) + 1;
        save();
        return ok(message, `gave +1 rep to ${target}. They now have **${g.counts[target.id]}**.`);
      }
      if (command === "reps") {
        const target = message.mentions.users.first() || message.author;
        const n = state.rep[gid]?.counts?.[target.id] || 0;
        return message.reply({ embeds: [{ color: PINK, description: `${target} has **${n}** reputation point(s).`, footer: FOOT("Reputation") }] });
      }
      if (command === "replb" || command === "replead") {
        const top = Object.entries(state.rep[gid]?.counts || {}).sort((a, b) => b[1] - a[1]).slice(0, 10)
          .map(([u, n], i) => `**${i + 1}.** <@${u}> — ${n}`).join("\n");
        return message.reply({ embeds: [{ color: PINK, title: `${message.guild.name} Reputation`, description: top || "Nobody has any rep yet.", footer: FOOT("Reputation") }] });
      }

      // ── Connect Four ──────────────────────────────────────────────────────
      if (command === "connect4" || command === "c4") {
        const opp = message.mentions.users.first();
        if (!opp || opp.bot || opp.id === message.author.id) return err(message, "usage: `,connect4 @user` (pick a real opponent).");
        const g = {
          id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
          players: [message.author.id, opp.id], turn: 0, over: false, winner: null,
          board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
        };
        c4Games.set(g.id, g);
        setTimeout(() => c4Games.delete(g.id), 15 * 60 * 1000).unref?.();
        return message.channel.send({ embeds: [c4Embed(g)], components: c4Buttons(g) });
      }

      // ── Hangman ───────────────────────────────────────────────────────────
      if (command === "hangman") {
        if (args[0]?.toLowerCase() === "end") {
          const g = hangmen.get(message.channel.id);
          if (!g) return err(message, "no hangman game is running here.");
          hangmen.delete(message.channel.id);
          return ok(message, `game ended. The word was **${g.word}**.`);
        }
        if (hangmen.has(message.channel.id)) return err(message, "a game is already running in this channel.");
        const g = { word: WORDS[Math.floor(Math.random() * WORDS.length)], guessed: new Set(), wrong: 0, messageId: null };
        const sent = await message.channel.send({ embeds: [hmEmbed(g)] });
        g.messageId = sent.id;
        hangmen.set(message.channel.id, g);
        return;
      }

      // ── Anime / Manga ─────────────────────────────────────────────────────
      if (command === "anime" || command === "manga") {
        const q = args.join(" ").trim();
        if (!q) return err(message, `usage: \`,${command} <title>\``);
        const media = await anilist(command.toUpperCase(), q).catch(() => null);
        if (!media) return err(message, "nothing found (or AniList is unreachable right now).");
        const fields = [
          { name: "Format", value: media.format || "?", inline: true },
          { name: "Status", value: media.status || "?", inline: true },
          { name: "Score", value: media.averageScore ? `${media.averageScore}/100` : "N/A", inline: true },
          command === "anime"
            ? { name: "Episodes", value: String(media.episodes ?? "?"), inline: true }
            : { name: "Chapters", value: String(media.chapters ?? "?"), inline: true },
          { name: "Year", value: String(media.startDate?.year ?? "?"), inline: true },
          { name: "Genres", value: (media.genres || []).slice(0, 5).join(", ") || "?", inline: true },
        ];
        return message.reply({ embeds: [{
          color: PINK, title: media.title.english || media.title.romaji, url: media.siteUrl,
          description: clip(clean(media.description), 500), thumbnail: { url: media.coverImage?.large },
          fields, footer: FOOT(command === "anime" ? "Anime" : "Manga"),
        }] });
      }

      // ── Repeaters ─────────────────────────────────────────────────────────
      if (command === "repeater") {
        if (!can(message, PermissionFlagsBits.ManageMessages)) return err(message, "you need **Manage Messages** for that.");
        const sub = args[0]?.toLowerCase();
        const mine = state.repeaters.filter(r => r.guildId === gid);
        if (sub === "add") {
          const mins = Number(args[1]);
          const ch = message.mentions.channels.first();
          const text = args.slice(3).join(" ").trim();
          if (!Number.isFinite(mins) || mins < 1 || mins > 10080 || !ch || !text)
            return err(message, "usage: `,repeater add <minutes 1-10080> #channel <message>`");
          if (mine.length >= 5) return err(message, "this server already has 5 repeaters.");
          const id = state.repeaterNext++;
          state.repeaters.push({ id, guildId: gid, channelId: ch.id, intervalMin: mins, text: clip(text, 1900), nextAt: Date.now() + mins * 60000, lastMessageId: null });
          save();
          return ok(message, `repeater **#${id}** will post in ${ch} every **${mins}** minute(s).`);
        }
        if (sub === "remove") {
          const id = Number(args[1]);
          const idx = state.repeaters.findIndex(r => r.id === id && r.guildId === gid);
          if (idx === -1) return err(message, "repeater not found.");
          state.repeaters.splice(idx, 1); save();
          return ok(message, `repeater **#${id}** removed.`);
        }
        if (sub === "list" || !sub) {
          const lines = mine.map(r => `**#${r.id}** — <#${r.channelId}> every ${r.intervalMin}m — ${clip(r.text, 60)}`).join("\n");
          return message.reply({ embeds: [{ color: PINK, title: "Repeaters", description: lines || "None set.\nUse `,repeater add <minutes> #channel <message>`", footer: FOOT("Repeaters") }] });
        }
        return err(message, "usage: `,repeater add|list|remove`");
      }
    } catch (e) {
      console.error("[Liability addons]", e);
    }
  });

  console.log("[Liability] add-ons loaded: suggest, rep, connect4, hangman, anime/manga, repeater");
};
