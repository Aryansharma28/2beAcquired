// poof Connector popup. All network work happens in background.js; the popup just
// renders state and sends messages. `popup.html?mock=<state>` renders with fake data
// and no chrome.* APIs (for screenshots / design review):
//   loggedout | connect | connecting | connected | success | error | relogin
import { POOF_URL } from "./config.js";
import { MP_LOGIN_URL, isValidCode, normalizeCode, normalizePoofUrl, originPattern, relativeTime } from "./lib.js";

const mock = new URLSearchParams(location.search).get("mock");
const view = document.getElementById("view");
if (mock) document.documentElement.classList.add("mock");

// ---------- transport ----------

const realApi = {
  send: (msg) => chrome.runtime.sendMessage(msg),
  openTab: (url) => chrome.tabs.create({ url }),
};

function mockApi(state) {
  const mpUser = { id: "12345678", name: "Aryan S." };
  const base = {
    poofUrl: normalizePoofUrl(POOF_URL),
    poofUrlDefault: normalizePoofUrl(POOF_URL),
    customPoofUrl: null,
    needsRelogin: false,
    mismatch: false,
  };
  const statuses = {
    loggedout: { ...base, connected: false, mp: { loggedIn: false } },
    connect: { ...base, connected: false, mp: { loggedIn: true, user: mpUser } },
    error: { ...base, connected: false, mp: { loggedIn: true, user: mpUser } },
    connecting: { ...base, connected: false, mp: { loggedIn: true, user: mpUser } },
    connected: { ...base, connected: true, name: mpUser.name, lastSync: Date.now() - 42 * 60e3, mp: { loggedIn: true, user: mpUser } },
    success: { ...base, connected: true, name: mpUser.name, lastSync: Date.now(), mp: { loggedIn: true, user: mpUser } },
    relogin: { ...base, connected: true, name: mpUser.name, lastSync: Date.now() - 7 * 3600e3, needsRelogin: true, mp: { loggedIn: false } },
  };
  let status = statuses[state] || statuses.connect;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  return {
    async send(msg) {
      switch (msg.type) {
        case "status":
          return status;
        case "claim":
          await wait(1200);
          if (msg.code === "000000") return { ok: false, error: "That code has expired. Get a new one in the poof app." };
          status = statuses.success;
          return { ok: true, name: mpUser.name, lastSync: Date.now() };
        case "sync":
          await wait(600);
          return { ok: true, lastSync: Date.now() };
        case "disconnect":
          status = statuses.connect;
          return { ok: true };
        case "setPoofUrl":
          return { ok: true, poofUrl: normalizePoofUrl(msg.url) || base.poofUrlDefault };
        default:
          return { ok: false, error: "unknown" };
      }
    },
    openTab: (url) => window.open(url, "_blank"),
  };
}

const api = mock ? mockApi(mock) : realApi;

// ---------- rendering ----------

function mount(id) {
  const node = document.getElementById(id).content.cloneNode(true);
  view.replaceChildren(node);
  return view.firstElementChild;
}

function fill(root, slot, text) {
  root.querySelectorAll(`[data-slot="${slot}"]`).forEach((el) => (el.textContent = text));
}

function showError(root, message) {
  const el = root.querySelector('[data-slot="error"]');
  if (!el) return;
  el.textContent = message || "";
  el.hidden = !message;
}

function on(root, action, fn) {
  root.querySelectorAll(`[data-action="${action}"]`).forEach((b) => b.addEventListener("click", fn));
}

function renderLoading() {
  mount("t-loading");
}

function renderLoggedOut() {
  const root = mount("t-loggedout");
  on(root, "open-login", () => api.openTab(MP_LOGIN_URL));
  on(root, "recheck", () => refreshStatus());
}

function renderConnect(status, { error = null, code = "" } = {}) {
  const root = mount("t-connect");
  fill(root, "name", status.mp.user.name);
  showError(root, error);
  const boxes = [...root.querySelectorAll(".code input")];
  const allow = root.querySelector('[data-action="allow"]');

  const current = () => boxes.map((b) => b.value).join("");
  const sync = () => {
    boxes.forEach((b) => b.classList.toggle("filled", !!b.value));
    allow.disabled = !isValidCode(current());
  };
  const spread = (digits, from) => {
    let i = from;
    for (const d of digits) {
      if (i >= boxes.length) break;
      boxes[i++].value = d;
    }
    sync();
    if (!allow.disabled) allow.focus(); // all six in: Enter/Space allows
    else boxes[Math.min(i, boxes.length - 1)].focus();
  };

  boxes.forEach((box, i) => {
    box.addEventListener("input", () => {
      const digits = normalizeCode(box.value);
      box.value = "";
      if (digits) spread(digits, i);
      else sync();
    });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && i > 0) {
        boxes[i - 1].value = "";
        boxes[i - 1].focus();
        sync();
        e.preventDefault();
      } else if (e.key === "ArrowLeft" && i > 0) boxes[i - 1].focus();
      else if (e.key === "ArrowRight" && i < boxes.length - 1) boxes[i + 1].focus();
      else if (e.key === "Enter" && !allow.disabled) allow.click();
    });
    box.addEventListener("paste", (e) => {
      e.preventDefault();
      const digits = normalizeCode(e.clipboardData?.getData("text"));
      if (digits) spread(digits, digits.length === 6 ? 0 : i);
    });
    box.addEventListener("focus", () => box.select());
  });

  if (code) spread(code, 0);
  else boxes[0].focus();
  sync();

  on(root, "allow", async () => {
    const c = current();
    if (!isValidCode(c)) return; // client-side guard; the button is disabled anyway
    renderConnecting();
    const r = await api.send({ type: "claim", code: c });
    if (r?.ok) {
      renderConnected({ ...status, connected: true, name: r.name, lastSync: r.lastSync }, { justConnected: true });
    } else {
      renderConnect(status, { error: r?.error || "Couldn't connect. Try again.", code: c });
    }
  });
}

function renderConnecting() {
  mount("t-connecting");
}

let tick = null;
function renderConnected(status, { justConnected = false, error = null } = {}) {
  const root = mount("t-connected");
  fill(root, "name", status.name || "you");
  root.querySelector('[data-slot="success"]').hidden = !justConnected;
  root.querySelector('[data-slot="relogin"]').hidden = !status.needsRelogin;
  root.querySelector('[data-slot="mismatch"]').hidden = !status.mismatch || status.needsRelogin;
  showError(root, error);

  const setSynced = () => fill(root, "synced", relativeTime(status.lastSync));
  setSynced();
  clearInterval(tick);
  tick = setInterval(setSynced, 30e3);

  on(root, "open-login", () => api.openTab(MP_LOGIN_URL));
  on(root, "sync", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Syncing…";
    const r = await api.send({ type: "sync" });
    if (r?.ok) {
      renderConnected({ ...status, lastSync: r.lastSync, needsRelogin: false, mismatch: false });
    } else if (r?.disconnected) {
      await refreshStatus(r.error);
    } else {
      renderConnected(
        { ...status, needsRelogin: !!r?.needsRelogin || status.needsRelogin, mismatch: !!r?.mismatch },
        { error: r?.needsRelogin || r?.mismatch ? null : r?.error || "Sync failed. Try again." },
      );
    }
  });
  on(root, "disconnect", async (e) => {
    // Two-tap confirm (window.confirm is unreliable inside extension popups).
    const btn = e.currentTarget;
    if (!btn.dataset.armed) {
      btn.dataset.armed = "1";
      btn.textContent = "Tap again to disconnect. poof stops selling.";
      setTimeout(() => {
        delete btn.dataset.armed;
        btn.textContent = "Disconnect";
      }, 4000);
      return;
    }
    btn.disabled = true;
    const r = await api.send({ type: "disconnect" });
    await refreshStatus(r?.warning || null);
  });
}

async function refreshStatus(carryError = null) {
  renderLoading();
  let status;
  try {
    status = await api.send({ type: "status" });
  } catch {
    status = null;
  }
  if (!status) {
    view.replaceChildren(Object.assign(document.createElement("div"), { className: "error", textContent: "The extension's background worker didn't answer. Reopen the popup." }));
    return;
  }
  setupAdvanced(status);
  if (status.connected) return renderConnected(status, { justConnected: mock === "success", error: carryError });
  if (status.mp.loggedIn === true) {
    return renderConnect(status, {
      error: mock === "error" ? "That code has expired. Get a new one in the poof app." : carryError,
      code: mock === "error" ? "482913" : "",
    });
  }
  if (status.mp.loggedIn === false) return renderLoggedOut();
  // Couldn't tell (Marktplaats unreachable): say so, offer retry.
  const root = mount("t-loggedout");
  root.querySelector("h1").textContent = "Can't reach Marktplaats";
  root.querySelector("p").textContent = status.mp.error || "Check your connection and try again.";
  on(root, "open-login", () => api.openTab(MP_LOGIN_URL));
  on(root, "recheck", () => refreshStatus());
}

// ---------- Advanced: poof address ----------

let advancedBound = false;
function setupAdvanced(status) {
  const input = document.getElementById("poof-url");
  const msg = document.getElementById("url-msg");
  input.value = status.customPoofUrl || "";
  input.placeholder = status.poofUrlDefault;
  if (advancedBound) return;
  advancedBound = true;

  document.getElementById("save-url").addEventListener("click", async () => {
    const origin = normalizePoofUrl(input.value);
    if (!origin) {
      msg.textContent = "Use an https:// address (http://localhost is fine for testing).";
      return;
    }
    // Ask for host access to a non-default origin. Must run inside the click gesture,
    // so it's the first async call here.
    if (!mock && origin !== status.poofUrlDefault) {
      const granted = await chrome.permissions.request({ origins: [originPattern(origin)] });
      if (!granted) {
        msg.textContent = "poof Connector needs permission to talk to that address.";
        return;
      }
    }
    const r = await api.send({ type: "setPoofUrl", url: origin });
    msg.textContent = r?.ok ? `Using ${r.poofUrl}` : r?.error || "Couldn't save.";
    if (r?.ok) input.value = r.poofUrl === status.poofUrlDefault ? "" : r.poofUrl;
  });

  document.getElementById("reset-url").addEventListener("click", async () => {
    const r = await api.send({ type: "setPoofUrl", url: null });
    input.value = "";
    msg.textContent = r?.ok ? `Using ${r.poofUrl}` : "Couldn't reset.";
  });
}

// ---------- boot ----------

if (mock === "connecting") {
  setupAdvanced(await api.send({ type: "status" }));
  renderConnecting();
} else {
  refreshStatus();
}
