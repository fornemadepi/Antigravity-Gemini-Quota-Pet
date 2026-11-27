<div align="center">

<img src="docs/images/hero-banner-en.png" alt="Antigravity Gemini Quota Pet Banner" width="100%" />

<br />

# ✦ Antigravity Gemini Quota Pet

**A Cute Heterochromia Gemini Catgirl Companion for Google Antigravity**  
Real-time **5-Hour Rolling Quota**, **Weekly Quota** & **Per-Turn Consumption** Monitor · Runs as both a **Transparent Desktop Floating Pet** and a **Native Antigravity Sidebar Plugin**

<p align="center">
  <a href="https://github.com/fornemadepi/Antigravity-Gemini-Quota-Pet/tree/zh-CN" title="点击切换为简体中文">
    <img src="docs/images/lang-toggle-en.png" alt="Switch Language to 简体中文" height="40" />
  </a>
</p>

[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?style=flat-square&logo=windows)](https://github.com/fornemadepi/Antigravity-Gemini-Quota-Pet)
[![Host](https://img.shields.io/badge/For-Google%20Antigravity-7C4DFF?style=flat-square&logo=google)](https://antigravity.google)
[![Runtime](https://img.shields.io/badge/Runtime-Electron%20%2B%20Node.js%2020%2B-47848F?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local%20Zero%20Telemetry-10B981?style=flat-square)](#-privacy--security)
[![License: MIT](https://img.shields.io/badge/Code%20License-MIT-F59E0B?style=flat-square)](LICENSE)

</div>

---

## ⚡ Quickest Way to Get It (Copy & Paste to Antigravity!)

You don't even need to open a terminal manually — **simply copy the prompt below and send it directly to Google Antigravity to get the plugin automatically:**

```text
Please clone https://github.com/fornemadepi/Antigravity-Gemini-Quota-Pet.git, run `npm install` and `npm run install:plugin`, and set up the Gemini Quota Pet plugin and desktop launcher for me.
```

Once installed, click the **`+` menu in the top-right Auxiliary Pane → `Gemini 桌宠`** inside Antigravity (or double-click `启动桌宠(无黑框).vbs` for the standalone transparent Windows desktop pet)!

---

## 🌟 Overview

In **Google Antigravity**, model usage is governed by **5-Hour Rolling Sprint Quotas** and **7-Day Weekly Quotas**. Opening `Settings → Models` repeatedly breaks coding flow and makes it hard to tell at a glance how much quota a complex multi-step agent turn just consumed.

**Antigravity Gemini Quota Pet** brings an interactive **Gemini-personified heterochromia catgirl** companion right to your desktop and sidebar — featuring comic thought bubbles, automatic per-turn consumption popups, squishy physics, and real-time **Remaining 5-Hour / Weekly Quota** tracking:

<table>
<tr>
<td width="36%" align="center">
  <img src="docs/images/desktop-live-demo.png" alt="Live Transparent Desktop Floating Pet on Windows" height="270" />
  <br />
  <sub><b>Frameless Transparent Desktop Pet on Windows</b><br />(Pixel-accurate mouse click-through — never blocks your editor)</sub>
</td>
<td width="64%" align="center">
  <img src="assets/character-sheet.jpg" alt="Gemini Personified Catgirl Character Sheet" height="270" />
  <br />
  <sub><b>Gemini Catgirl Character Turnaround Sheet</b><br />(Pink/Amber Heterochromia · 4-Point Gemini Star Hairpin · Nebula Tail)</sub>
</td>
</tr>
</table>

---

## ✨ Key Features

### 1. 🫧 Comic Thought Bubble · 4-in-1 Interactive Cards

Left-click the comic thought bubble to cycle smoothly through 4 live information & dialogue cards:

<p align="center">
  <img src="docs/images/bubble-cards-showcase-en.png" alt="4-in-1 Interactive Thought Bubble Cards" width="100%" />
</p>

- **① Dual Quota Overview (Default)**: Smooth rolling hero digits showing your **5-Hour Remaining Quota %** and compact reset countdown, paired with a bottom indigo pill badge for **Weekly Remaining Quota %** (primary/secondary metrics can be swapped anytime).
- **② Per-Turn Usage Popup (Auto-Pop)**: Incrementally tails local Antigravity conversation transcripts and **automatically pops up a cost bubble** with starlight particles and a soft chime right after each agent turn finishes.
- **③ Dual Progress Bars & Runway Forecast**: Displays health-colored `5H` & `Weekly` bars, today's total tokens, and an active burn-rate runway forecast (`~Xh Ym left`).
- **④ Dynamic Gemini Starlight Quotes**: Context-aware cheerful lines, low-quota reminders, and late-night care messages based on your current quota level and local time.

---

### 2. 🎭 4-State Chibi Expression Machine & Desktop Physics

<p align="center">
  <img src="docs/images/expressions-showcase-en.png" alt="4-State Chibi Expression Sprites" width="100%" />
</p>

- **Automatic Mood Transitions**: Gently floats in **Idle** state; switches to **Happy** when poked/petted or when a turn finishes; automatically switches to teary-eyed **Low Quota (`<= 20%`)** when either your 5-hour or weekly quota runs low; dozes off into **Sleep** after 25 minutes of inactivity.
- **Pixel-Accurate Alpha Click-Through & Zero Top White Bar**: Offscreen canvas alpha hit-testing lets clicks pass straight through transparent areas to underlying windows, while Win32 native region clipping (`setShape`) completely eliminates Windows 11 DWM inactive caption artifacts.
- **Magnetic Edge Snapping & Auto Mirror-Flip**: Drag anywhere across monitors; snaps cleanly to screen edges and flips horizontally when docked on the left edge so the speech bubble always stays inside the screen.
- **Jelly Squish Physics & Zero-Asset Web Audio SFX**: Poking the character triggers an elastic squash-and-stretch bounce, floating Gemini stars (`✦` `✧` `♡`), and synthesized `Web Audio API` chimes (zero external audio files required).
- **Dual Surfaces**: Run as a **Standalone Always-on-Top / Window-Following Desktop Pet** (`65%–175%` scale) OR as a **Native Antigravity MCP App Plugin** inside the Side Pane.

---

## 🧠 Hybrid 3-in-1 Quota Engine

```mermaid
flowchart LR
    A["~/.gemini/antigravity/brain<br/>Incremental JSONL Tail"] --> D["QuotaEngine<br/>Hybrid Quota Core"]
    B["🎯 One-Click Calibration<br/>Official % + Reset Timer Anchor"] --> D
    C["🔌 agy CLI statusLine<br/>Official quota JSON Bridge"] --> D
    D --> E["⚡ 5-Hour Remaining % & Reset"]
    D --> F["📅 Weekly Remaining % & Reset"]
    D --> G["💬 Per-Turn Cost Bubble"]
```

1. **Zero-Config Rolling Window**: Immediately reads recent token metadata from `~/.gemini/antigravity/brain/*/.system_generated/logs/transcript.jsonl` via incremental byte offsets (`< 5ms` per poll) to estimate rolling 5-hour and 7-day usage out of the box.
2. **One-Click Official % Calibration (Recommended)**: Open the Settings & Calibration panel (`Right-Click → 🎯 打开额度校准与设置面板`) and enter your current percentages and reset timers from `Antigravity → Settings → Models` once. Subsequent turns deduct proportionally in real time, and **once the countdown hits `0`, the window automatically refills to `100%` for the next cycle!**
3. **`agy` CLI Auto-Bridge**: Includes `scripts/agy-statusline-bridge.js` — configure `/statusline` once in Antigravity CLI to automatically stream official `quota` JSON snapshots straight to the pet.

---

## 🚀 Manual Installation & Launch

### Prerequisites
- **OS**: Windows 10 / 11 (macOS / Linux also supported via `npm start`)
- **Runtime**: **[Node.js](https://nodejs.org/) 20+** (Node.js 22 / 24 LTS recommended)

```powershell
git clone https://github.com/fornemadepi/Antigravity-Gemini-Quota-Pet.git
cd Antigravity-Gemini-Quota-Pet
npm install
```

| Mode | How to Launch | Best For |
| :--- | :--- | :--- |
| **A. Silent Desktop Floating Pet (Recommended)** | Double-click **`启动桌宠(无黑框).vbs`** (no console window; create a shortcut in `shell:startup` for auto-start) | Always-on-top desktop companion or following the Antigravity window |
| **B. Auto-Setup Batch / CLI** | Double-click **`启动桌宠.bat`** or run `npm start` | First-time auto dependency check or terminal launch |
| **C. Native Antigravity Sidebar Plugin** | Double-click **`安装Antigravity侧边栏插件.bat`** or run `npm run install:plugin` | Open inside Antigravity (`+` menu → `Gemini 桌宠`) + 1-click button to pop out the desktop pet |

---

## 🔒 Privacy & Security

- **100% Local, Zero Telemetry**: Makes zero network requests to external analytics or third-party servers.
- **Read-Only Token Metadata**: Reads only token counts and model IDs from local transcripts — never reads or transmits prompt text, API keys, cookies, or OAuth credentials.

---

## 💖 Acknowledgments

This project stands on the shoulders of the open-source community. Sincere thanks to the original creator, maintainers, contributors, and community supporters of the **DeepSeek Balance Whale Widget** ecosystem *(curated from the upstream project's official acknowledgments)*:

- 🐋 **Original Creator & Inspiration**: Huge thanks to **月匠 ([@MeteorNOX](https://github.com/MeteorNOX))** for creating and open-sourcing **[MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)**, which inspired the comic thought bubble, per-turn consumption popup, squishy interaction, and edge-snapping mirror flip.
- 🖥️ **Desktop Port & Cross-Platform Pioneers**: **[@Yang-huai406](https://github.com/Yang-huai406)** for maintaining the standalone Codex desktop port **[Codex-Whale-Public](https://github.com/Yang-huai406/Codex-Whale-Public)** and pioneering window-following & calibration designs; **[@1llysviel](https://github.com/1llysviel)** for contributing the upstream macOS floating window adaptation (PR [#128](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/128)).
- 🛠️ **Upstream Code & PR Contributors**: **[@ELFsay](https://github.com/ELFsay)**, **[@Jy-EggRoll](https://github.com/Jy-EggRoll)**, **[@ztzpro](https://github.com/ztzpro)**, **[@under-the-ocean](https://github.com/under-the-ocean)**, **[@21253soursweetlemon](https://github.com/21253soursweetlemon)**, **[@fangbm](https://github.com/fangbm)**, **[@xiaolinnnnnnn](https://github.com/xiaolinnnnnnn)**.
- 🤝 **Upstream Community Bug Hunters, Testers & Supporters**: Special thanks to **[@yybai25](https://github.com/yybai25)**, **[@0Sakura721](https://github.com/0Sakura721)**, **[@VaeKaras](https://github.com/VaeKaras)**, **[@MengLs1620](https://github.com/MengLs1620)**, Bilibili user **「星丶白羽莲」**, and all the enthusiastic **QQ group members and community users** whose bug reports, root-cause analyses, and feedback helped the original Whale Widget ecosystem thrive!

---

## 📄 License & Disclaimer

- **Code & Documentation**: Licensed under the **[MIT License](LICENSE)**.
- **Character Art & Visual Assets**: Provided *as-is* solely for running and displaying this companion widget (not covered under MIT code relicensing). See **[PROVENANCE.md](PROVENANCE.md)** for details.

> **⚠️ Hobby Project Disclaimer**  
> This project was created purely out of personal interest and enthusiasm by the author together with **Google Antigravity** (non-commercial fan/hobby creation). If there is any copyright infringement or any other inappropriate content or behavior, please contact the author via [GitHub Issues](https://github.com/fornemadepi/Antigravity-Gemini-Quota-Pet/issues) and we will promptly rectify or remove the relevant content.  
> *（本项目由本人和 Antigravity 完全凭借个人兴趣而创立。如有侵权和其他不当行为，请通过 Issue 联系作者进行整改和删除。）*
