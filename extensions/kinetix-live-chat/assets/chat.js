(function () {
  var root = document.getElementById("kinetix-chat-root");
  if (!root) return;

  var roomKey = "kinetix_livechat_room";
  var profileKey = "kinetix_livechat_profile";
  var state = { open: false, config: null, messages: [], after: 0, roomId: localStorage.getItem(roomKey) || "", polling: false };

  fetch("/apps/kinetix/livechat/config", { headers: { Accept: "application/json" } })
    .then(function (response) { return response.ok ? response.json() : null; })
    .then(function (config) {
      if (!config || !config.enabled) return;
      state.config = config;
      render();
      if (state.roomId) poll();
    })
    .catch(function () {});

  function side() {
    return state.config.position === "bottom-left" ? "kx-left" : "kx-right";
  }

  function render() {
    var config = state.config;
    root.innerHTML = "";
    var button = document.createElement("button");
    button.className = "kx-bubble " + side();
    button.style.background = config.themeColor || "#7C3AED";
    button.type = "button";
    button.textContent = state.open ? "×" : "💬";
    button.onclick = function () {
      state.open = !state.open;
      render();
    };
    root.appendChild(button);
    if (!state.open) return;

    var panel = document.createElement("section");
    panel.className = "kx-panel " + side();
    panel.innerHTML =
      '<div class="kx-head"><strong></strong><span></span></div><div class="kx-body"></div>';
    panel.querySelector("strong").textContent = config.brandName || config.agentName || "Chat with us";
    panel.querySelector("span").textContent = config.tagline || config.onlineText || "";
    panel.querySelector(".kx-head").style.background = config.themeColor || "#7C3AED";
    var body = panel.querySelector(".kx-body");
    var profile = readProfile();

    if (!profile.email) {
      var form = document.createElement("form");
      form.className = "kx-form";
      form.innerHTML =
        '<input name="name" placeholder="Name" required />' +
        '<input name="email" type="email" placeholder="Email" required />' +
        '<input name="phone" placeholder="Phone" required />' +
        '<button type="submit">Start chat</button>';
      form.querySelector("button").style.background = config.themeColor || "#7C3AED";
      form.onsubmit = function (event) {
        event.preventDefault();
        var data = new FormData(form);
        localStorage.setItem(profileKey, JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
        }));
        render();
      };
      panel.appendChild(form);
    } else {
      (config.iceList || []).forEach(function (prompt) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "kx-ice";
        chip.style.background = config.themeColor || "#7C3AED";
        chip.textContent = prompt;
        chip.onclick = function () { send(prompt); };
        body.appendChild(chip);
      });
      state.messages.forEach(function (message) {
        var item = document.createElement("div");
        item.className = "kx-msg " + (message.isAgent ? "them" : "me");
        if (!message.isAgent) item.style.background = config.themeColor || "#7C3AED";
        item.textContent = message.text;
        body.appendChild(item);
      });
      var compose = document.createElement("form");
      compose.className = "kx-compose";
      compose.innerHTML = '<input name="text" placeholder="Write a message" required /><button type="submit">Send</button>';
      compose.querySelector("button").style.background = config.themeColor || "#7C3AED";
      compose.onsubmit = function (event) {
        event.preventDefault();
        var text = new FormData(compose).get("text");
        compose.reset();
        send(String(text || ""));
      };
      panel.appendChild(compose);
    }
    root.appendChild(panel);
    if (body) body.scrollTop = body.scrollHeight;
  }

  function readProfile() {
    try { return JSON.parse(localStorage.getItem(profileKey) || "{}"); } catch (e) { return {}; }
  }

  function send(text) {
    var profile = readProfile();
    fetch("/apps/kinetix/livechat/inbound", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-KMBP-Widget-Token": state.config.widgetToken || "",
      },
      body: JSON.stringify({
        text: text,
        senderName: profile.name,
        email: profile.email,
        phone: profile.phone,
        roomId: state.roomId,
        messageId: "m" + Date.now(),
      }),
    })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (data.roomId) {
          state.roomId = data.roomId;
          localStorage.setItem(roomKey, data.roomId);
        }
        poll();
      })
      .catch(function () {});
  }

  function poll() {
    if (!state.roomId) return;
    fetch("/apps/kinetix/livechat/messages?roomId=" + encodeURIComponent(state.roomId) + "&after=0", {
      headers: { Accept: "application/json" },
    })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        state.messages = data.messages || [];
        if (state.open) render();
      })
      .catch(function () {});
    if (!state.polling) {
      state.polling = true;
      window.setInterval(poll, 4000);
    }
  }
})();
