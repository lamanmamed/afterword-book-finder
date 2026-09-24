import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

const OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json";
const MODEL_ID = "onnx-community/all-MiniLM-L6-v2-ONNX";
const SEARCH_FIELDS = [
  "key",
  "title",
  "author_name",
  "cover_i",
  "first_publish_year",
  "subject",
  "isbn",
  "ratings_average",
  "ratings_count",
  "edition_count"
].join(",");

const starterBooks = [
  { key:"/works/OL5735363W", title:"Normal People", author:"Sally Rooney", cover_i:9251990, first_publish_year:2018, subjects:["Literary fiction","Relationships","Young adults"] },
  { key:"/works/OL25794322W", title:"Tomorrow, and Tomorrow, and Tomorrow", author:"Gabrielle Zevin", cover_i:12845045, first_publish_year:2022, subjects:["Literary fiction","Friendship","Video games"] },
  { key:"/works/OL19736040W", title:"Circe", author:"Madeline Miller", cover_i:8361654, first_publish_year:2018, subjects:["Mythology","Fantasy","Literary fiction"] },
  { key:"/works/OL17356805W", title:"The Seven Husbands of Evelyn Hugo", author:"Taylor Jenkins Reid", cover_i:8231190, first_publish_year:2017, subjects:["Historical fiction","Relationships","Hollywood"] },
  { key:"/works/OL17828419W", title:"Educated", author:"Tara Westover", cover_i:8258756, first_publish_year:2018, subjects:["Memoir","Family","Education"] },
  { key:"/works/OL20893680W", title:"The Midnight Library", author:"Matt Haig", cover_i:10528037, first_publish_year:2020, subjects:["Fiction","Regret","Parallel worlds"] },
  { key:"/works/OL16859568W", title:"A Little Life", author:"Hanya Yanagihara", cover_i:8235396, first_publish_year:2015, subjects:["Literary fiction","Friendship","Trauma"] },
  { key:"/works/OL27884690W", title:"Lessons in Chemistry", author:"Bonnie Garmus", cover_i:12978532, first_publish_year:2022, subjects:["Historical fiction","Women scientists","Workplace"] }
];

const selected = new Map();
const grid = document.getElementById("book-grid");
const counter = document.getElementById("counter");
const go = document.getElementById("recommend");
const searchInput = document.getElementById("book-search");
const noMatches = document.getElementById("no-matches");

let visibleBooks = starterBooks;
let searchTimer = null;
let searchController = null;
let extractorPromise = null;
let isRecommending = false;

function cover(book, size="M") {
  if (book.cover_i) return `https://covers.openlibrary.org/b/id/${book.cover_i}-${size}.jpg`;
  if (book.isbn?.length) return `https://covers.openlibrary.org/b/isbn/${book.isbn[0]}-${size}.jpg`;
  return "";
}

function normalizeBook(doc) {
  return {
    key: doc.key,
    title: doc.title || "Untitled",
    author: doc.author_name?.[0] || "Unknown author",
    cover_i: doc.cover_i || null,
    isbn: doc.isbn || [],
    first_publish_year: doc.first_publish_year || null,
    subjects: (doc.subject || []).slice(0, 12),
    ratings_average: Number(doc.ratings_average) || null,
    ratings_count: Number(doc.ratings_count) || 0,
    edition_count: Number(doc.edition_count) || 0
  };
}

function escapeHtml(value="") {
  return value.replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}

function updateCounter() {
  counter.textContent = `${selected.size} ${selected.size === 1 ? "book" : "books"} selected`;
  go.disabled = selected.size < 2 || isRecommending;
}

function renderGrid(books) {
  visibleBooks = books;
  grid.innerHTML = "";
  noMatches.hidden = books.length !== 0;

  books.forEach(book => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pick";
    button.setAttribute("aria-pressed", String(selected.has(book.key)));
    button.setAttribute("aria-label", `Select ${book.title} by ${book.author}`);

    const image = cover(book);
    const imageHtml = image
      ? `<img src="${image}" alt="Cover of ${escapeHtml(book.title)}" loading="lazy">`
      : `<span aria-hidden="true" style="font-family:'Playfair Display',serif;font-size:34px;color:#6e7168">?</span>`;

    button.innerHTML = `
      <span class="cover-wrap">
        ${imageHtml}
        <span class="check" aria-hidden="true">✓</span>
      </span>
      <span class="title">${escapeHtml(book.title)}</span>
      <span class="author">${escapeHtml(book.author)}</span>
    `;

    button.addEventListener("click", () => {
      if (selected.has(book.key)) selected.delete(book.key);
      else selected.set(book.key, book);
      button.setAttribute("aria-pressed", String(selected.has(book.key)));
      updateCounter();
    });

    grid.append(button);
  });

  updateCounter();
}

async function searchOpenLibrary(query, limit=24) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    fields: SEARCH_FIELDS,
    language: "eng"
  });
  const response = await fetch(`${OPEN_LIBRARY_SEARCH}?${params.toString()}`, {
    signal: searchController?.signal
  });
  if (!response.ok) throw new Error(`Open Library search failed: ${response.status}`);
  const data = await response.json();
  return (data.docs || [])
    .filter(doc => doc.key && doc.title && doc.author_name?.length)
    .map(normalizeBook);
}

async function handleSearch() {
  const query = searchInput.value.trim();
  if (query.length < 2) {
    if (searchController) searchController.abort();
    renderGrid(starterBooks);
    return;
  }

  if (searchController) searchController.abort();
  searchController = new AbortController();

  noMatches.hidden = true;
  try {
    const results = await searchOpenLibrary(query);
    renderGrid(results);
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error(error);
    noMatches.textContent = "Search is temporarily unavailable. Try again.";
    noMatches.hidden = false;
  }
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(handleSearch, 320);
});

function cleanSubject(subject) {
  return String(subject || "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function usefulSubjects(book) {
  const blocked = new Set([
    "fiction", "accessible book", "protected daisy", "juvenile fiction",
    "large type books", "nyt:new_york_times_bestseller", "translations"
  ]);
  return (book.subjects || [])
    .map(cleanSubject)
    .filter(s => s && s.length < 45 && !blocked.has(s.toLowerCase()))
    .slice(0, 8);
}

function metadataText(book) {
  const pieces = [
    book.title,
    `by ${book.author}`,
    usefulSubjects(book).slice(0, 8).join(", "),
    book.first_publish_year ? `first published ${book.first_publish_year}` : ""
  ].filter(Boolean);
  return pieces.join(". ");
}

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_ID, {
      dtype: "q8"
    });
  }
  return extractorPromise;
}

function meanVector(vectors) {
  const out = new Array(vectors[0].length).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < vector.length; i++) out[i] += vector[i];
  }
  for (let i = 0; i < out.length; i++) out[i] /= vectors.length;
  const norm = Math.sqrt(out.reduce((sum, x) => sum + x * x, 0)) || 1;
  return out.map(x => x / norm);
}

function dot(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i] * b[i];
  return total;
}

async function embedBooks(books) {
  const extractor = await getExtractor();
  const output = await extractor(books.map(metadataText), {
    pooling: "mean",
    normalize: true
  });
  return output.tolist();
}

async function discoverCandidates(chosen) {
  const subjectCounts = new Map();
  for (const book of chosen) {
    for (const subject of usefulSubjects(book)) {
      const key = subject.toLowerCase();
      subjectCounts.set(key, { subject, count:(subjectCounts.get(key)?.count || 0) + 1 });
    }
  }

  const topSubjects = [...subjectCounts.values()]
    .sort((a,b) => b.count - a.count)
    .slice(0, 5)
    .map(x => x.subject);

  const queries = [];
  for (const subject of topSubjects) {
    queries.push(`subject:"${subject}"`);
  }
  for (const book of chosen.slice(0, 3)) {
    queries.push(`${book.author} ${usefulSubjects(book).slice(0,2).join(" ")}`);
  }

  const batches = await Promise.allSettled(
    queries.slice(0, 7).map(async query => {
      searchController = new AbortController();
      return searchOpenLibrary(query, 18);
    })
  );

  const byKey = new Map();
  for (const batch of batches) {
    if (batch.status !== "fulfilled") continue;
    for (const book of batch.value) {
      if (selected.has(book.key)) continue;
      if (!book.cover_i && !book.isbn?.length) continue;
      if (!byKey.has(book.key)) byKey.set(book.key, book);
    }
  }

  return [...byKey.values()].slice(0, 60);
}

function subjectOverlap(a, b) {
  const left = new Set(usefulSubjects(a).map(s => s.toLowerCase()));
  return usefulSubjects(b).filter(s => left.has(s.toLowerCase()));
}

function explanation(candidate, chosen, chosenEmbeddings, candidateEmbedding) {
  let bestIndex = 0;
  let bestScore = -Infinity;
  chosenEmbeddings.forEach((embedding, index) => {
    const score = dot(embedding, candidateEmbedding);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  const nearest = chosen[bestIndex];
  const shared = subjectOverlap(nearest, candidate).slice(0, 2);

  if (shared.length >= 2) {
    return `Closest to ${nearest.title}, with shared themes around ${shared[0].toLowerCase()} and ${shared[1].toLowerCase()}.`;
  }
  if (shared.length === 1) {
    return `Semantically close to ${nearest.title}, with overlap around ${shared[0].toLowerCase()}.`;
  }
  return `Semantically close to ${nearest.title}, but with a different mix of themes for a little more discovery.`;
}

function diversify(items, limit=3) {
  const result = [];
  const usedAuthors = new Set();
  for (const item of items) {
    const authorKey = item.author.toLowerCase();
    if (usedAuthors.has(authorKey)) continue;
    result.push(item);
    usedAuthors.add(authorKey);
    if (result.length === limit) break;
  }
  if (result.length < limit) {
    for (const item of items) {
      if (!result.includes(item)) result.push(item);
      if (result.length === limit) break;
    }
  }
  return result;
}

async function buildRecommendations() {
  const chosen = [...selected.values()];
  const candidates = await discoverCandidates(chosen);
  if (candidates.length < 6) throw new Error("Not enough candidate books found.");

  const [chosenEmbeddings, candidateEmbeddings] = await Promise.all([
    embedBooks(chosen),
    embedBooks(candidates)
  ]);

  const tasteVector = meanVector(chosenEmbeddings);

  const scored = candidates.map((book, index) => {
    const semantic = dot(tasteVector, candidateEmbeddings[index]);
    const popularity = Math.log10((book.ratings_count || 0) + (book.edition_count || 0) * 5 + 10);
    const overlap = chosen.reduce((n, selectedBook) => n + subjectOverlap(selectedBook, book).length, 0);
    return {
      ...book,
      semantic,
      popularity,
      overlap,
      embedding: candidateEmbeddings[index],
      reason: explanation(book, chosen, chosenEmbeddings, candidateEmbeddings[index])
    };
  });

  const familiar = diversify(
    [...scored].sort((a,b) => (b.semantic + b.overlap * 0.01) - (a.semantic + a.overlap * 0.01)),
    3
  );

  const familiarKeys = new Set(familiar.map(x => x.key));
  const different = diversify(
    [...scored]
      .filter(x => !familiarKeys.has(x.key) && x.semantic > 0.25)
      .sort((a,b) => {
        const aScore = a.semantic - a.overlap * 0.015;
        const bScore = b.semantic - b.overlap * 0.015;
        return bScore - aScore;
      }),
    3
  );

  const used = new Set([...familiar, ...different].map(x => x.key));
  const popularityValues = scored.map(x => x.popularity).sort((a,b) => a-b);
  const medianPopularity = popularityValues[Math.floor(popularityValues.length / 2)] || 0;
  const hidden = diversify(
    [...scored]
      .filter(x => !used.has(x.key) && x.popularity <= medianPopularity && x.semantic > 0.2)
      .sort((a,b) => b.semantic - a.semantic),
    3
  );

  const fallback = diversify(
    [...scored].filter(x => !used.has(x.key)).sort((a,b) => b.semantic - a.semantic),
    3
  );

  return {
    chosen,
    sections: [
      {
        label:"Popular with readers like you",
        sub:"The closest semantic matches to the books you chose.",
        books:familiar
      },
      {
        label:"Something different",
        sub:"Still connected to your taste, with more room for discovery.",
        books:different.length ? different : fallback
      },
      {
        label:"Hidden gems",
        sub:"Strong semantic matches with a lighter popularity signal.",
        books:hidden.length ? hidden : fallback
      }
    ]
  };
}

function renderRecommendationResults(result) {
  document.getElementById("result-intro").textContent =
    `Inspired by ${result.chosen.map(b => b.title).slice(0,2).join(" and ")}${result.chosen.length > 2 ? " and more" : ""}.`;

  document.getElementById("collections").innerHTML = result.sections
    .map((section, index) => `
      <section class="collection">
        <div class="collection-head">
          <div>
            <h2>${escapeHtml(section.label)}</h2>
            <p>${escapeHtml(section.sub)}</p>
          </div>
          <span class="collection-index">0${index + 1}</span>
        </div>
        <div class="rec-grid">
          ${section.books.map(book => {
            const image = cover(book);
            return `
              <article class="rec-card">
                ${image ? `<img src="${image}" alt="Cover of ${escapeHtml(book.title)}" loading="lazy">` : ""}
                <div>
                  <span class="title">${escapeHtml(book.title)}</span>
                  <span class="author">${escapeHtml(book.author)}</span>
                  <p class="why">${escapeHtml(book.reason)}</p>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `).join("");
}

async function showRecommendations() {
  if (selected.size < 2 || isRecommending) return;

  isRecommending = true;
  go.disabled = true;
  const oldText = go.innerHTML;
  go.textContent = "Finding your books…";

  try {
    const result = await buildRecommendations();
    renderRecommendationResults(result);
    location.hash = "recommendations";
    route();
  } catch (error) {
    console.error(error);
    alert("I couldn't build recommendations just now. Please try again in a moment.");
  } finally {
    isRecommending = false;
    go.innerHTML = oldText;
    updateCounter();
  }
}

function route() {
  const result = location.hash === "#recommendations" &&
    document.getElementById("collections").children.length > 0;

  document.getElementById("landing").classList.toggle("hidden", result);
  document.getElementById("results").classList.toggle("active", result);

  if (!result && location.hash === "#recommendations") location.replace("#choose");
  if (result) window.scrollTo(0, 0);
}

go.addEventListener("click", showRecommendations);
document.getElementById("back").addEventListener("click", () => {
  location.hash = "choose";
  route();
});
window.addEventListener("hashchange", route);

renderGrid(starterBooks);
route();
