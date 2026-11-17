/* =========================================================
   L'Oréal Product-Aware Routine Builder
   ========================================================= */

/* ---------- 1. Settings ---------- */
// 👉 Paste YOUR Cloudflare Worker URL here (the same one from Project 8)
const WORKER_URL = "https://loreal-chatbot.lbojaniniriascos.workers.dev/";

const STORAGE_KEY = "loreal-selected-products";
const DIR_KEY = "loreal-text-direction";

const SYSTEM_PROMPT = `You are a friendly, expert L'Oréal beauty advisor.

When the user shares selected products (as JSON), build a clear, step-by-step routine using ONLY those products:
- Split it into Morning (AM) and Evening (PM) when relevant, or into steps for haircare/makeup.
- Put the steps in the correct order and briefly explain why each step matters.
- If a selected product doesn't fit a routine (for example, a fragrance), explain how and when to use it.
- If something important is missing (like sunscreen in a morning skincare routine), mention it politely.

After the routine, answer follow-up questions ONLY about the user's routine or about skincare, haircare, makeup, fragrance, and related beauty topics. If the user asks about anything unrelated, politely say you can only help with beauty and their routine, and steer the conversation back.

If you have web search results, include current, relevant information about L'Oréal products or routines and cite your sources with links.

Keep answers warm, concise, and well organized with short headings and bullet points.`;

/* ---------- 2. Page elements ---------- */
const categoryFilter = document.getElementById("categoryFilter");
const searchInput = document.getElementById("productSearch");
const resultsCount = document.getElementById("resultsCount");
const productsContainer = document.getElementById("productsContainer");
const selectedList = document.getElementById("selectedProductsList");
const selectedCount = document.getElementById("selectedCount");
const clearAllBtn = document.getElementById("clearAll");
const generateBtn = document.getElementById("generateRoutine");
const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const dirToggle = document.getElementById("dirToggle");

/* ---------- 3. App state ---------- */
let allProducts = [];
let selectedIds = loadSelected(); // product ids saved as strings
let messages = [{ role: "system", content: SYSTEM_PROMPT }]; // full chat history
let isLoading = false;

/* ---------- 4. Helpers ---------- */
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function capitalize(text) {
  return String(text).replace(/(^|\s)\w/g, (c) => c.toUpperCase());
}

// Friendlier names for the category dropdown
const CATEGORY_LABELS = {
  cleanser: "Cleansers",
  moisturizer: "Moisturizers",
  skincare: "Skincare & Treatments",
  haircare: "Haircare",
  makeup: "Makeup",
  "hair color": "Hair Color",
  "hair styling": "Hair Styling",
  "men's grooming": "Men's Grooming",
  suncare: "Suncare",
  fragrance: "Fragrance",
};

// Some image file names contain special characters (like % or é),
// so we encode the URL to make sure every image loads
function imageURL(url) {
  return encodeURI(url || "");
}

function findProduct(id) {
  return allProducts.find((p) => String(p.id) === String(id));
}

function getSelectedProducts() {
  return selectedIds.map(findProduct).filter(Boolean);
}

/* ---------- 5. localStorage ---------- */
function loadSelected() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved.map(String) : [];
  } catch {
    return [];
  }
}

function saveSelected() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds));
  } catch {
    /* storage unavailable: the app still works, it just won't remember */
  }
}

/* ---------- 6. Load products ---------- */
async function loadProducts() {
  const response = await fetch("products.json");
  if (!response.ok) throw new Error(`Could not load products.json (${response.status})`);
  const data = await response.json();
  return Array.isArray(data) ? data : data.products || [];
}

function populateCategories() {
  const categories = [...new Set(allProducts.map((p) => p.category).filter(Boolean))].sort();
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = CATEGORY_LABELS[category] || capitalize(category);
    categoryFilter.appendChild(option);
  });
}

/* ---------- 7. Filtering (category + search work together) ---------- */
function getFilteredProducts() {
  const category = categoryFilter.value;
  const words = searchInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return allProducts.filter((p) => {
    const matchesCategory = category === "all" || p.category === category;
    const text = `${p.name} ${p.brand} ${p.category} ${p.description}`.toLowerCase();
    const matchesSearch = words.every((word) => text.includes(word));
    return matchesCategory && matchesSearch;
  });
}

/* ---------- 8. Render product grid ---------- */
function renderProducts() {
  const products = getFilteredProducts();
  resultsCount.textContent = `Showing ${products.length} of ${allProducts.length} products`;

  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products found. Try a different search or category.
      </div>`;
    return;
  }

  productsContainer.innerHTML = products.map((p) => {
    const id = escapeHTML(p.id);
    const isSelected = selectedIds.includes(String(p.id));
    return `
      <article class="product-card ${isSelected ? "selected" : ""}" data-id="${id}">
        <span class="check-badge" aria-hidden="true">✓</span>
        <div class="product-img">
          <img src="${escapeHTML(imageURL(p.image))}" alt="${escapeHTML(p.name)}" loading="lazy" />
        </div>
        <div class="product-info">
          <p class="product-brand">${escapeHTML(p.brand)}</p>
          <h3 class="product-name">${escapeHTML(p.name)}</h3>
          <p class="product-category">${escapeHTML(CATEGORY_LABELS[p.category] || capitalize(p.category || ""))}</p>
          <div class="product-desc" id="desc-${id}" hidden>
            ${escapeHTML(p.description)}
          </div>
          <div class="card-actions">
            <button type="button" class="info-btn" aria-expanded="false" aria-controls="desc-${id}">
              Details
            </button>
            <button type="button" class="select-btn" aria-pressed="${isSelected}">
              ${isSelected ? "Selected ✓" : "Add"}
            </button>
          </div>
        </div>
      </article>`;
  }).join("");
}

// Updates one card without re-drawing the grid (keeps open descriptions open)
function updateCardState(id) {
  const card = productsContainer.querySelector(`.product-card[data-id="${CSS.escape(String(id))}"]`);
  if (!card) return;
  const isSelected = selectedIds.includes(String(id));
  card.classList.toggle("selected", isSelected);
  const btn = card.querySelector(".select-btn");
  btn.setAttribute("aria-pressed", isSelected);
  btn.textContent = isSelected ? "Selected ✓" : "Add";
}

/* ---------- 9. Selecting products ---------- */
function toggleProduct(id) {
  id = String(id);
  if (selectedIds.includes(id)) {
    selectedIds = selectedIds.filter((x) => x !== id);
  } else {
    selectedIds.push(id);
  }
  saveSelected();
  updateCardState(id);
  renderSelected();
}

function renderSelected() {
  const products = getSelectedProducts();
  selectedCount.textContent = products.length;
  clearAllBtn.disabled = products.length === 0;

  if (products.length === 0) {
    selectedList.innerHTML = `
      <p class="empty-message">No products selected yet. Click a product card to add it.</p>`;
    return;
  }

  selectedList.innerHTML = products.map((p) => `
    <div class="chip">
      <img src="${escapeHTML(imageURL(p.image))}" alt="" />
      <span class="chip-text">
        <span class="chip-brand">${escapeHTML(p.brand)}</span>
        <span class="chip-name">${escapeHTML(p.name)}</span>
      </span>
      <button type="button" class="remove-btn" data-id="${escapeHTML(p.id)}"
        aria-label="Remove ${escapeHTML(p.name)}">×</button>
    </div>`).join("");
}

// Click on a card (event delegation)
productsContainer.addEventListener("click", (e) => {
  const card = e.target.closest(".product-card");
  if (!card) return;

  // "Details" button: show/hide the description, do NOT select
  const infoBtn = e.target.closest(".info-btn");
  if (infoBtn) {
    const desc = card.querySelector(".product-desc");
    const open = infoBtn.getAttribute("aria-expanded") === "true";
    infoBtn.setAttribute("aria-expanded", !open);
    infoBtn.textContent = open ? "Details" : "Hide details";
    desc.hidden = open;
    card.classList.toggle("expanded", !open);
    return;
  }

  // Clicking inside the description lets people read/copy text without selecting
  if (e.target.closest(".product-desc")) return;

  toggleProduct(card.dataset.id);
});

// Hide broken images
productsContainer.addEventListener("error", (e) => {
  if (e.target.tagName === "IMG") e.target.classList.add("img-broken");
}, true);

// Remove from the selected list
selectedList.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove-btn");
  if (btn) toggleProduct(btn.dataset.id);
});

// Clear all
clearAllBtn.addEventListener("click", () => {
  if (selectedIds.length === 0) return;
  if (!confirm("Remove all selected products?")) return;
  const oldIds = [...selectedIds];
  selectedIds = [];
  saveSelected();
  oldIds.forEach(updateCardState);
  renderSelected();
});

categoryFilter.addEventListener("change", renderProducts);
searchInput.addEventListener("input", renderProducts);

/* ---------- 10. Chat display ---------- */
// Turns the AI's markdown-style text into safe HTML
function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}

function formatAI(text) {
  const lines = escapeHTML(text).split("\n");
  let html = "";
  let listType = null;
  const closeList = () => {
    if (listType) { html += `</${listType}>`; listType = null; }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    let match;
    if (!line) { closeList(); continue; }
    if (/^-{3,}$/.test(line)) { closeList(); html += "<hr />"; continue; }

    if ((match = line.match(/^#{1,6}\s+(.*)/))) {
      closeList();
      html += `<h4>${inlineFormat(match[1])}</h4>`;
    } else if ((match = line.match(/^[-*•]\s+(.*)/))) {
      if (listType !== "ul") { closeList(); html += "<ul>"; listType = "ul"; }
      html += `<li>${inlineFormat(match[1])}</li>`;
    } else if ((match = line.match(/^\d+[.)]\s+(.*)/))) {
      if (listType !== "ol") { closeList(); html += "<ol>"; listType = "ol"; }
      html += `<li>${inlineFormat(match[1])}</li>`;
    } else {
      closeList();
      html += `<p>${inlineFormat(line)}</p>`;
    }
  }
  closeList();
  return html;
}

function addMessage(role, content, citations = []) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;

  if (role === "assistant") {
    msg.innerHTML = formatAI(content);
    if (citations.length) {
      const sources = document.createElement("div");
      sources.className = "citations";
      sources.innerHTML = `<p class="citations-title">Sources</p><ol>${citations
        .map((c) => `<li><a href="${escapeHTML(c.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(c.title || c.url)}</a></li>`)
        .join("")}</ol>`;
      msg.appendChild(sources);
    }
  } else {
    msg.textContent = content;
  }

  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return msg;
}

function addLoading(text) {
  const msg = document.createElement("div");
  msg.className = "msg assistant loading";
  msg.innerHTML = `<span class="dots"><span></span><span></span><span></span></span> ${escapeHTML(text)}`;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return msg;
}

function setLoading(state) {
  isLoading = state;
  generateBtn.disabled = state;
  sendBtn.disabled = state;
}

/* ---------- 11. Talking to the AI (through the Worker) ---------- */
// Web search LevelUp: collects citation links if the model returns them
function extractCitations(message) {
  const seen = new Set();
  return (message.annotations || [])
    .filter((a) => a.type === "url_citation" && a.url_citation?.url)
    .map((a) => a.url_citation)
    .filter((c) => !seen.has(c.url) && seen.add(c.url));
}

async function callAI() {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `Request failed (${response.status})`);
  }

  const message = data.choices?.[0]?.message;
  if (!message?.content) throw new Error("The AI returned an empty response.");
  return { content: message.content, citations: extractCitations(message) };
}

async function sendToAI(loadingText) {
  setLoading(true);
  const loader = addLoading(loadingText);
  try {
    const { content, citations } = await callAI();
    loader.remove();
    messages.push({ role: "assistant", content });
    addMessage("assistant", content, citations);
  } catch (error) {
    loader.remove();
    messages.pop(); // remove the user message that failed so history stays clean
    console.error(error);
    addMessage("error", `Sorry, something went wrong: ${error.message}. Please try again.`);
  } finally {
    setLoading(false);
  }
}

/* ---------- 12. Generate routine ---------- */
generateBtn.addEventListener("click", async () => {
  if (isLoading) return;
  const selected = getSelectedProducts();

  if (selected.length === 0) {
    addMessage("assistant", "Please select at least one product first, then click **Generate Routine**.");
    return;
  }

  // Send only the useful fields for each selected product
  const productData = selected.map(({ name, brand, category, description }) => ({
    name, brand, category, description,
  }));

  addMessage("user", `Create a routine with my ${selected.length} selected product${selected.length > 1 ? "s" : ""}.`);
  messages.push({
    role: "user",
    content: `Here are the products I selected (JSON):\n${JSON.stringify(productData, null, 2)}\n\nPlease create a personalized routine using only these products.`,
  });

  await sendToAI("Building your routine…");
});

/* ---------- 13. Follow-up questions ---------- */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = userInput.value.trim();
  if (!question || isLoading) return;

  userInput.value = "";
  addMessage("user", question);
  messages.push({ role: "user", content: question });
  await sendToAI("Thinking…");
  userInput.focus();
});

/* ---------- 14. RTL toggle (LevelUp) ---------- */
function applyDirection(dir) {
  document.documentElement.setAttribute("dir", dir);
  dirToggle.textContent = dir === "rtl" ? "LTR" : "RTL";
  dirToggle.setAttribute("aria-pressed", dir === "rtl");
  try { localStorage.setItem(DIR_KEY, dir); } catch { /* ignore */ }
}

dirToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("dir");
  applyDirection(current === "rtl" ? "ltr" : "rtl");
});

/* ---------- 15. Start the app ---------- */
async function init() {
  let savedDir = "ltr";
  try { savedDir = localStorage.getItem(DIR_KEY) || "ltr"; } catch { /* ignore */ }
  applyDirection(savedDir);

  addMessage(
    "assistant",
    "Hi! 👋 I'm your L'Oréal beauty advisor. Select products above and click **Generate Routine**, or ask me anything about skincare, haircare, makeup, or fragrance."
  );

  try {
    allProducts = await loadProducts();
  } catch (error) {
    console.error(error);
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Couldn't load products. If you're working locally, open the site with
        Live Server (right-click index.html → Open with Live Server).
      </div>`;
    return;
  }

  // Drop saved ids that no longer exist
  selectedIds = selectedIds.filter((id) => findProduct(id));
  saveSelected();

  populateCategories();
  renderProducts();
  renderSelected();
}

init();
