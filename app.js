/* Reel - Movie Studio */
/* Plain ASCII only. No fancy quotes. */

var STATE = {
user: null,
projectId: null,
project: null,
characters: {},
locations: {},
scenes: {},
editingId: null,
pendingImage: null,
dialogueRows: []
};

var db = null;
var storage = null;
var auth = null;

var CONFIG_KEY = “reel_firebase_config”;

/* ============ HELPERS ============ */

function $(id) { return document.getElementById(id); }

function esc(s) {
if (s == null) return “”;
return String(s)
.split(”&”).join(”&”)
.split(”<”).join(”<”)
.split(”>”).join(”>”)
.split(’”’).join(”"”)
.split(”’”).join(”'”);
}

function toast(msg, isError) {
var el = $(“toast”);
el.textContent = msg;
if (isError) el.classList.add(“error”);
else el.classList.remove(“error”);
el.classList.add(“show”);
setTimeout(function () { el.classList.remove(“show”); }, 2400);
}

function showScreen(id) {
var loading = $(“loading-screen”);
if (loading) loading.style.display = “none”;
[“auth-screen”, “setup-screen”, “app”].forEach(function (s) {
var el = $(s);
if (s === id) el.classList.remove(“hidden”);
else el.classList.add(“hidden”);
});
}

function openDrawer(id) {
$(“modal-backdrop”).classList.add(“open”);
$(id).classList.add(“open”);
document.body.style.overflow = “hidden”;
}

function closeAllDrawers() {
$(“modal-backdrop”).classList.remove(“open”);
var drawers = document.querySelectorAll(”.drawer”);
for (var i = 0; i < drawers.length; i++) drawers[i].classList.remove(“open”);
document.body.style.overflow = “”;
STATE.pendingImage = null;
}

function setUploadPreview(labelId, url) {
var el = $(labelId);
if (url) {
el.classList.add(“has-image”);
el.style.backgroundImage = “url(’” + url + “’)”;
} else {
el.classList.remove(“has-image”);
el.style.backgroundImage = “”;
}
}

/* ============ FIREBASE BOOTSTRAP ============ */

function initFirebase(config) {
try {
firebase.initializeApp(config);
auth = firebase.auth();
db = firebase.database();
storage = firebase.storage();
return true;
} catch (e) {
console.error(“Firebase init failed:”, e);
return false;
}
}

function bootstrap() {
var stored = localStorage.getItem(CONFIG_KEY);
if (!stored) {
showScreen(“setup-screen”);
return;
}
try {
var config = JSON.parse(stored);
if (!initFirebase(config)) {
showScreen(“setup-screen”);
return;
}
auth.onAuthStateChanged(function (user) {
if (user) {
STATE.user = user;
$(“auth-email-display”).textContent = user.email;
showScreen(“app”);
loadProjects();
} else {
showScreen(“auth-screen”);
}
});
} catch (e) {
console.error(e);
showScreen(“setup-screen”);
}
}

/* ============ SETUP SCREEN ============ */

function handleSaveConfig() {
var raw = $(“firebase-config-input”).value.trim();
var config;
try {
if (raw.charAt(0) !== “{”) throw new Error(“Must start with {”);
var jsonStr = raw
.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, ‘$1”$2”:’)
.replace(/’/g, ‘”’)
.replace(/,(\s*[}]])/g, “$1”);
config = JSON.parse(jsonStr);
} catch (e) {
toast(“Invalid config. Paste the full firebaseConfig object.”, true);
return;
}
if (!config.apiKey || !config.databaseURL) {
toast(“Config must include apiKey and databaseURL”, true);
return;
}
localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
location.reload();
}

/* ============ AUTH ============ */

function handleSignIn() {
var email = $(“auth-email”).value.trim();
var password = $(“auth-password”).value;
var errEl = $(“auth-error”);
errEl.textContent = “”;
if (!email || !password) {
errEl.textContent = “Email and password required.”;
return;
}
auth.signInWithEmailAndPassword(email, password).catch(function (e) {
var code = e.code || “”;
if (code === “auth/user-not-found” || code === “auth/invalid-login-credentials” || code === “auth/invalid-credential”) {
auth.createUserWithEmailAndPassword(email, password).catch(function (e2) {
errEl.textContent = e2.message;
});
} else {
errEl.textContent = e.message;
}
});
}

/* ============ NAVIGATION ============ */

function navigateHome() {
STATE.projectId = null;
STATE.project = null;
$(“view-project”).classList.add(“hidden”);
$(“view-projects”).classList.remove(“hidden”);
renderBreadcrumb();
loadProjects();
}

function renderBreadcrumb() {
var bc = $(“breadcrumb”);
if (!STATE.project) {
bc.innerHTML = ‘<span class="current">All Projects</span>’;
} else {
bc.innerHTML =
‘<button id="crumb-home">Projects</button>’ +
‘<span class="sep">/</span>’ +
‘<span class="current">’ + esc(STATE.project.title) + ‘</span>’;
var homeBtn = $(“crumb-home”);
if (homeBtn) homeBtn.onclick = navigateHome;
}
}

/* ============ DB REFS ============ */

function uid() { return STATE.user.uid; }
function projectsRef() { return db.ref(“users/” + uid() + “/projects”); }
function projectRef(pid) { return db.ref(“users/” + uid() + “/projects/” + pid); }
function entityRef(pid, type) { return db.ref(“users/” + uid() + “/data/” + pid + “/” + type); }

/* ============ PROJECTS LIST ============ */

function loadProjects() {
var grid = $(“projects-grid”);
projectsRef().once(“value”).then(function (snap) {
var data = snap.val() || {};
var entries = Object.keys(data).map(function (k) {
return [k, data[k]];
});
entries.sort(function (a, b) {
return (b[1].updatedAt || 0) - (a[1].updatedAt || 0);
});
$(“projects-count”).textContent = entries.length + “ ITEM” + (entries.length === 1 ? “” : “S”);

```
var html = "";
for (var i = 0; i < entries.length; i++) {
  var id = entries[i][0];
  var p = entries[i][1];
  var counts = p.counts || {};
  html +=
    '<button class="project-card" data-project-id="' + id + '">' +
      '<span class="tag">' + esc(p.genre || "UNTITLED GENRE") + '</span>' +
      '<h3>' + esc(p.title) + '</h3>' +
      '<p class="logline">' + esc(p.logline || "No logline yet.") + '</p>' +
      '<div class="stats">' +
        '<span><strong>' + (counts.characters || 0) + '</strong>Cast</span>' +
        '<span><strong>' + (counts.locations || 0) + '</strong>Sets</span>' +
        '<span><strong>' + (counts.scenes || 0) + '</strong>Scenes</span>' +
      '</div>' +
    '</button>';
}
html +=
  '<button class="new-project-card" id="btn-new-project">' +
    '<div class="plus-big">+</div>' +
    '<span>New Project</span>' +
  '</button>';

grid.innerHTML = html;

var cards = grid.querySelectorAll(".project-card");
for (var j = 0; j < cards.length; j++) {
  (function (card) {
    card.onclick = function () { openProject(card.getAttribute("data-project-id")); };
  })(cards[j]);
}
$("btn-new-project").onclick = function () { openProjectForm(); };
```

});
}

function openProjectForm(projectId) {
STATE.editingId = projectId || null;
var p = projectId ? STATE.project : { title: “”, logline: “”, genre: “” };
$(“drawer-project-title”).textContent = projectId ? “Edit Project” : “New Project”;
$(“project-form-title”).value = p.title || “”;
$(“project-form-logline”).value = p.logline || “”;
$(“project-form-genre”).value = p.genre || “”;
openDrawer(“drawer-project”);
}

function handleProjectSave() {
var title = $(“project-form-title”).value.trim();
if (!title) { toast(“Title is required”, true); return; }
var payload = {
title: title,
logline: $(“project-form-logline”).value.trim(),
genre: $(“project-form-genre”).value.trim(),
updatedAt: Date.now()
};

if (STATE.editingId) {
projectRef(STATE.editingId).update(payload).then(function () {
STATE.project = Object.assign({}, STATE.project, payload);
$(“project-title”).textContent = title;
$(“project-eyebrow”).textContent = payload.genre || “PROJECT”;
renderBreadcrumb();
closeAllDrawers();
toast(“Project saved.”);
}).catch(function (e) { toast(“Save failed: “ + e.message, true); });
} else {
payload.createdAt = Date.now();
payload.counts = { characters: 0, locations: 0, scenes: 0 };
var ref = projectsRef().push();
ref.set(payload).then(function () {
STATE.projectId = ref.key;
openProject(ref.key);
closeAllDrawers();
toast(“Project created.”);
}).catch(function (e) { toast(“Save failed: “ + e.message, true); });
}
}

function openProject(projectId) {
STATE.projectId = projectId;
projectRef(projectId).once(“value”).then(function (snap) {
STATE.project = snap.val();
if (!STATE.project) { toast(“Project not found”, true); return; }

```
$("view-projects").classList.add("hidden");
$("view-project").classList.remove("hidden");
$("project-title").textContent = STATE.project.title;
$("project-eyebrow").textContent = STATE.project.genre || "PROJECT";

var createdDate = STATE.project.createdAt
  ? new Date(STATE.project.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  : "\u2014";
var metaHtml = "<span>Created " + createdDate + "</span>";
if (STATE.project.logline) {
  metaHtml += '<span style="font-style:italic;font-family:Fraunces,serif;text-transform:none;letter-spacing:0;">' +
    esc(STATE.project.logline) + '</span>';
}
$("project-meta").innerHTML = metaHtml;

renderBreadcrumb();
switchTab("characters");
loadEntities();
```

});
}

function deleteCurrentProject() {
if (!confirm(“Delete project "” + STATE.project.title + “" and all its data? This cannot be undone.”)) return;
var pid = STATE.projectId;
projectRef(pid).remove().then(function () {
return db.ref(“users/” + uid() + “/data/” + pid).remove();
}).then(function () {
toast(“Project deleted.”);
navigateHome();
}).catch(function (e) { toast(“Delete failed: “ + e.message, true); });
}

/* ============ TABS ============ */

function switchTab(name) {
var btns = document.querySelectorAll(”.tab-btn”);
for (var i = 0; i < btns.length; i++) {
if (btns[i].getAttribute(“data-tab”) === name) btns[i].classList.add(“active”);
else btns[i].classList.remove(“active”);
}
var contents = document.querySelectorAll(”.tab-content”);
for (var j = 0; j < contents.length; j++) contents[j].classList.add(“hidden”);
$(“tab-” + name).classList.remove(“hidden”);
}

/* ============ LOAD ENTITIES ============ */

function loadEntities() {
var pid = STATE.projectId;
Promise.all([
entityRef(pid, “characters”).once(“value”),
entityRef(pid, “locations”).once(“value”),
entityRef(pid, “scenes”).once(“value”)
]).then(function (results) {
STATE.characters = results[0].val() || {};
STATE.locations = results[1].val() || {};
STATE.scenes = results[2].val() || {};
renderCharacters();
renderLocations();
renderScenes();
updateCounts();
});
}

function updateCounts() {
var c = Object.keys(STATE.characters).length;
var l = Object.keys(STATE.locations).length;
var s = Object.keys(STATE.scenes).length;
$(“badge-characters”).textContent = c;
$(“badge-locations”).textContent = l;
$(“badge-scenes”).textContent = s;
projectRef(STATE.projectId).update({ counts: { characters: c, locations: l, scenes: s } });
}

/* ============ CHARACTERS ============ */

function renderCharacters() {
var list = $(“characters-list”);
var ids = Object.keys(STATE.characters);
if (ids.length === 0) {
list.innerHTML =
‘<div class="empty-state">’ +
‘<h3>Cast the film.</h3>’ +
‘<p>Add each character once - name, description, personality, reference photo. Reference them by name in every scene.</p>’ +
‘<button class="btn primary" id="btn-first-char">Add First Character</button>’ +
‘</div>’;
$(“btn-first-char”).onclick = function () { openCharacterForm(); };
return;
}
var html = “”;
for (var i = 0; i < ids.length; i++) {
var id = ids[i];
var c = STATE.characters[id];
var thumbStyle = c.photoUrl ? ’ style=“background-image:url('’ + esc(c.photoUrl) + ‘')”’ : “”;
var thumbClass = c.photoUrl ? “thumb” : “thumb empty”;
html +=
‘<button class="entity-card" data-char-id="' + id + '">’ +
‘<div class=”’ + thumbClass + ‘”’ + thumbStyle + ‘></div>’ +
‘<div class="body">’ +
‘<h4>’ + esc(c.name) + ‘</h4>’ +
‘<div class="desc">’ + esc(c.appearance || c.personality || “No description.”) + ‘</div>’ +
‘</div>’ +
‘</button>’;
}
list.innerHTML = html;
var cards = list.querySelectorAll(”[data-char-id]”);
for (var j = 0; j < cards.length; j++) {
(function (card) {
card.onclick = function () { openCharacterForm(card.getAttribute(“data-char-id”)); };
})(cards[j]);
}
}

function openCharacterForm(characterId) {
STATE.editingId = characterId || null;
STATE.pendingImage = null;
var c = characterId ? STATE.characters[characterId] : {};
$(“drawer-character-title”).textContent = characterId ? “Edit Character” : “New Character”;
$(“char-form-name”).value = c.name || “”;
$(“char-form-appearance”).value = c.appearance || “”;
$(“char-form-personality”).value = c.personality || “”;
$(“char-form-voice”).value = c.voice || “”;
setUploadPreview(“char-upload-label”, c.photoUrl || null);
if (characterId) $(“char-form-delete”).classList.remove(“hidden”);
else $(“char-form-delete”).classList.add(“hidden”);
openDrawer(“drawer-character”);
}

function handleCharacterSave() {
var name = $(“char-form-name”).value.trim();
if (!name) { toast(“Name required”, true); return; }
var btn = $(“char-form-save”);
btn.disabled = true;
btn.innerHTML = ‘<span class="loader"></span> Saving…’;

var pid = STATE.projectId;
var id = STATE.editingId || entityRef(pid, “characters”).push().key;
var photoUrl = (STATE.characters[id] && STATE.characters[id].photoUrl) || null;

var uploadPromise;
if (STATE.pendingImage) {
var path = “users/” + uid() + “/data/” + pid + “/characters/” + id + “.jpg”;
var ref = storage.ref(path);
uploadPromise = ref.put(STATE.pendingImage).then(function () { return ref.getDownloadURL(); }).then(function (url) { photoUrl = url; });
} else {
uploadPromise = Promise.resolve();
}

uploadPromise.then(function () {
var payload = {
name: name,
appearance: $(“char-form-appearance”).value.trim(),
personality: $(“char-form-personality”).value.trim(),
voice: $(“char-form-voice”).value.trim(),
photoUrl: photoUrl,
updatedAt: Date.now()
};
return entityRef(pid, “characters”).child(id).update(payload).then(function () {
STATE.characters[id] = Object.assign({}, STATE.characters[id] || {}, payload);
renderCharacters();
updateCounts();
closeAllDrawers();
toast(“Character saved.”);
});
}).catch(function (e) {
toast(“Save failed: “ + e.message, true);
}).then(function () {
btn.disabled = false;
btn.textContent = “Save Character”;
});
}

function handleCharacterDelete() {
if (!confirm(“Delete this character?”)) return;
var id = STATE.editingId;
entityRef(STATE.projectId, “characters”).child(id).remove().then(function () {
delete STATE.characters[id];
renderCharacters();
updateCounts();
closeAllDrawers();
toast(“Character deleted.”);
});
}

/* ============ LOCATIONS ============ */

function renderLocations() {
var list = $(“locations-list”);
var ids = Object.keys(STATE.locations);
if (ids.length === 0) {
list.innerHTML =
‘<div class="empty-state">’ +
‘<h3>Scout your sets.</h3>’ +
‘<p>Define each location once. Scenes reuse them, so the visual language stays consistent.</p>’ +
‘<button class="btn primary" id="btn-first-loc">Add First Location</button>’ +
‘</div>’;
$(“btn-first-loc”).onclick = function () { openLocationForm(); };
return;
}
var html = “”;
for (var i = 0; i < ids.length; i++) {
var id = ids[i];
var l = STATE.locations[id];
var thumbStyle = l.photoUrl ? ’ style=“background-image:url('’ + esc(l.photoUrl) + ‘')”’ : “”;
var thumbClass = l.photoUrl ? “thumb” : “thumb empty”;
html +=
‘<button class="entity-card" data-loc-id="' + id + '">’ +
‘<div class=”’ + thumbClass + ‘”’ + thumbStyle + ‘></div>’ +
‘<div class="body">’ +
‘<h4>’ + esc(l.name) + ‘</h4>’ +
‘<div class="desc">’ + esc(l.description || l.mood || “No description.”) + ‘</div>’ +
‘</div>’ +
‘</button>’;
}
list.innerHTML = html;
var cards = list.querySelectorAll(”[data-loc-id]”);
for (var j = 0; j < cards.length; j++) {
(function (card) {
card.onclick = function () { openLocationForm(card.getAttribute(“data-loc-id”)); };
})(cards[j]);
}
}

function openLocationForm(locationId) {
STATE.editingId = locationId || null;
STATE.pendingImage = null;
var l = locationId ? STATE.locations[locationId] : {};
$(“drawer-location-title”).textContent = locationId ? “Edit Location” : “New Location”;
$(“loc-form-name”).value = l.name || “”;
$(“loc-form-description”).value = l.description || “”;
$(“loc-form-mood”).value = l.mood || “”;
$(“loc-form-timeofday”).value = l.timeOfDay || “”;
setUploadPreview(“loc-upload-label”, l.photoUrl || null);
if (locationId) $(“loc-form-delete”).classList.remove(“hidden”);
else $(“loc-form-delete”).classList.add(“hidden”);
openDrawer(“drawer-location”);
}

function handleLocationSave() {
var name = $(“loc-form-name”).value.trim();
if (!name) { toast(“Name required”, true); return; }
var btn = $(“loc-form-save”);
btn.disabled = true;
btn.innerHTML = ‘<span class="loader"></span> Saving…’;

var pid = STATE.projectId;
var id = STATE.editingId || entityRef(pid, “locations”).push().key;
var photoUrl = (STATE.locations[id] && STATE.locations[id].photoUrl) || null;

var uploadPromise;
if (STATE.pendingImage) {
var path = “users/” + uid() + “/data/” + pid + “/locations/” + id + “.jpg”;
var ref = storage.ref(path);
uploadPromise = ref.put(STATE.pendingImage).then(function () { return ref.getDownloadURL(); }).then(function (url) { photoUrl = url; });
} else {
uploadPromise = Promise.resolve();
}

uploadPromise.then(function () {
var payload = {
name: name,
description: $(“loc-form-description”).value.trim(),
mood: $(“loc-form-mood”).value.trim(),
timeOfDay: $(“loc-form-timeofday”).value,
photoUrl: photoUrl,
updatedAt: Date.now()
};
return entityRef(pid, “locations”).child(id).update(payload).then(function () {
STATE.locations[id] = Object.assign({}, STATE.locations[id] || {}, payload);
renderLocations();
updateCounts();
closeAllDrawers();
toast(“Location saved.”);
});
}).catch(function (e) {
toast(“Save failed: “ + e.message, true);
}).then(function () {
btn.disabled = false;
btn.textContent = “Save Location”;
});
}

function handleLocationDelete() {
if (!confirm(“Delete this location?”)) return;
var id = STATE.editingId;
entityRef(STATE.projectId, “locations”).child(id).remove().then(function () {
delete STATE.locations[id];
renderLocations();
updateCounts();
closeAllDrawers();
toast(“Location deleted.”);
});
}

/* ============ SCENES ============ */

function renderScenes() {
var list = $(“scenes-list”);
var ids = Object.keys(STATE.scenes);
var entries = ids.map(function (k) { return [k, STATE.scenes[k]]; });
entries.sort(function (a, b) { return (a[1].order || 0) - (b[1].order || 0); });

if (entries.length === 0) {
list.innerHTML =
‘<div class="empty-state">’ +
‘<h3>Write the screenplay.</h3>’ +
‘<p>Each scene is one clip - 5 to 15 seconds. Describe what happens, who is there, how the camera moves, what they say.</p>’ +
‘<button class="btn primary" id="btn-first-scene">Add First Scene</button>’ +
‘</div>’;
$(“btn-first-scene”).onclick = function () { openSceneForm(); };
return;
}

var html = “”;
for (var i = 0; i < entries.length; i++) {
var id = entries[i][0];
var s = entries[i][1];
var loc = s.locationId && STATE.locations[s.locationId] ? STATE.locations[s.locationId].name : null;
var charNames = [];
if (s.characterIds) {
for (var k = 0; k < s.characterIds.length; k++) {
var c = STATE.characters[s.characterIds[k]];
if (c) charNames.push(c.name);
}
}
var numStr = (i + 1 < 10 ? “0” : “”) + (i + 1);
var metaParts = [];
if (loc) metaParts.push(’<span>’ + esc(loc) + ‘</span>’);
if (charNames.length) metaParts.push(’<span>’ + esc(charNames.join(”, “)) + ‘</span>’);
if (s.camera) metaParts.push(’<span>’ + esc(s.camera) + ‘</span>’);

```
html +=
  '<button class="scene-card" data-scene-id="' + id + '">' +
    '<div class="scene-number">' + numStr + '<small>SCN</small></div>' +
    '<div class="scene-body">' +
      '<h4>' + esc(s.title || "Untitled scene") + '</h4>' +
      '<div class="scene-meta">' + metaParts.join(" / ") + '</div>' +
      '<div class="scene-action">' + esc(s.action || "") + '</div>' +
    '</div>' +
    '<div class="scene-duration">' + (s.duration || 8) + 's</div>' +
  '</button>';
```

}
list.innerHTML = html;
var cards = list.querySelectorAll(”[data-scene-id]”);
for (var j = 0; j < cards.length; j++) {
(function (card) {
card.onclick = function () { openSceneForm(card.getAttribute(“data-scene-id”)); };
})(cards[j]);
}
}

function openSceneForm(sceneId) {
STATE.editingId = sceneId || null;
var s = sceneId ? STATE.scenes[sceneId] : {};
var ids = Object.keys(STATE.scenes);
var scnNum = sceneId ? (ids.indexOf(sceneId) + 1) : (ids.length + 1);

$(“drawer-scene-title”).textContent = sceneId ? “Edit Scene” : “New Scene”;
$(“scene-form-number”).textContent = “Scene “ + (scnNum < 10 ? “0” : “”) + scnNum;
$(“scene-form-title”).value = s.title || “”;
$(“scene-form-duration”).value = s.duration || 8;
$(“scene-form-camera”).value = s.camera || “”;
$(“scene-form-action”).value = s.action || “”;
$(“scene-form-reactions”).value = s.reactions || “”;
$(“scene-form-ambient”).value = s.ambient || “”;

// Location dropdown
var locOptions = ‘<option value="">- Select -</option>’;
var locIds = Object.keys(STATE.locations);
for (var i = 0; i < locIds.length; i++) {
var lid = locIds[i];
var selected = s.locationId === lid ? “ selected” : “”;
locOptions += ‘<option value=”’ + lid + ‘”’ + selected + “>” + esc(STATE.locations[lid].name) + “</option>”;
}
$(“scene-form-location”).innerHTML = locOptions;

// Character chips
var chipBox = $(“scene-form-characters”);
var selectedChars = {};
if (s.characterIds) {
for (var j = 0; j < s.characterIds.length; j++) selectedChars[s.characterIds[j]] = true;
}
var charIds = Object.keys(STATE.characters);
if (charIds.length === 0) {
chipBox.innerHTML = ‘<span class="chip empty-hint">No characters yet - add some first</span>’;
} else {
var chipHtml = “”;
for (var m = 0; m < charIds.length; m++) {
var cid = charIds[m];
var cls = selectedChars[cid] ? “chip active” : “chip”;
chipHtml += ‘<span class="' + cls + '" data-char-id="' + cid + '">’ + esc(STATE.characters[cid].name) + “</span>”;
}
chipBox.innerHTML = chipHtml;
var chips = chipBox.querySelectorAll(”.chip”);
for (var n = 0; n < chips.length; n++) {
(function (chip) {
chip.onclick = function () { chip.classList.toggle(“active”); };
})(chips[n]);
}
}

STATE.dialogueRows = s.dialogue ? s.dialogue.slice() : [];
renderDialogueRows();

if (sceneId) $(“scene-form-delete”).classList.remove(“hidden”);
else $(“scene-form-delete”).classList.add(“hidden”);
openDrawer(“drawer-scene”);
}

function addDialogueRow() {
STATE.dialogueRows.push({ characterId: “”, line: “” });
renderDialogueRows();
}

function renderDialogueRows() {
var box = $(“scene-form-dialogue”);
if (STATE.dialogueRows.length === 0) {
box.innerHTML = ‘<div style="color:var(--ink-faint);font-size:11px;font-style:italic;padding:8px 0;">No dialogue. Tap + Line to add.</div>’;
return;
}
var charIds = Object.keys(STATE.characters);
var html = “”;
for (var i = 0; i < STATE.dialogueRows.length; i++) {
var d = STATE.dialogueRows[i];
var options = ‘<option value="">- Speaker -</option>’;
for (var j = 0; j < charIds.length; j++) {
var cid = charIds[j];
var selected = d.characterId === cid ? “ selected” : “”;
options += ‘<option value=”’ + cid + ‘”’ + selected + “>” + esc(STATE.characters[cid].name) + “</option>”;
}
html +=
‘<div class="dialogue-row">’ +
‘<button type="button" class="remove-dialogue" data-i="' + i + '">×</button>’ +
‘<select data-i="' + i + '" class="dialogue-char">’ + options + ‘</select>’ +
‘<textarea data-i="' + i + '" class="dialogue-line" placeholder="What do they say?">’ + esc(d.line || “”) + ‘</textarea>’ +
‘</div>’;
}
box.innerHTML = html;

var removeBtns = box.querySelectorAll(”.remove-dialogue”);
for (var k = 0; k < removeBtns.length; k++) {
(function (btn) {
btn.onclick = function () {
var idx = parseInt(btn.getAttribute(“data-i”), 10);
STATE.dialogueRows.splice(idx, 1);
renderDialogueRows();
};
})(removeBtns[k]);
}
var selects = box.querySelectorAll(”.dialogue-char”);
for (var m = 0; m < selects.length; m++) {
(function (sel) {
sel.onchange = function () {
var idx = parseInt(sel.getAttribute(“data-i”), 10);
STATE.dialogueRows[idx].characterId = sel.value;
};
})(selects[m]);
}
var textareas = box.querySelectorAll(”.dialogue-line”);
for (var n = 0; n < textareas.length; n++) {
(function (ta) {
ta.oninput = function () {
var idx = parseInt(ta.getAttribute(“data-i”), 10);
STATE.dialogueRows[idx].line = ta.value;
};
})(textareas[n]);
}
}

function handleSceneSave() {
var title = $(“scene-form-title”).value.trim();
var action = $(“scene-form-action”).value.trim();
if (!title) { toast(“Scene title required”, true); return; }
if (!action) { toast(“Action description required”, true); return; }

var chipEls = document.querySelectorAll(”#scene-form-characters .chip.active”);
var selectedCharIds = [];
for (var i = 0; i < chipEls.length; i++) selectedCharIds.push(chipEls[i].getAttribute(“data-char-id”));

var cleanDialogue = [];
for (var j = 0; j < STATE.dialogueRows.length; j++) {
var d = STATE.dialogueRows[j];
if (d.line && d.line.trim()) {
cleanDialogue.push({ characterId: d.characterId || null, line: d.line.trim() });
}
}

var btn = $(“scene-form-save”);
btn.disabled = true;
btn.innerHTML = ‘<span class="loader"></span> Saving…’;

var pid = STATE.projectId;
var id = STATE.editingId || entityRef(pid, “scenes”).push().key;
var existingOrder = STATE.scenes[id] && STATE.scenes[id].order;
var maxOrder = 0;
var keys = Object.keys(STATE.scenes);
for (var k = 0; k < keys.length; k++) {
var o = STATE.scenes[keys[k]].order || 0;
if (o > maxOrder) maxOrder = o;
}

var payload = {
title: title,
duration: parseInt($(“scene-form-duration”).value, 10) || 8,
locationId: $(“scene-form-location”).value || null,
characterIds: selectedCharIds,
camera: $(“scene-form-camera”).value.trim(),
action: action,
reactions: $(“scene-form-reactions”).value.trim(),
ambient: $(“scene-form-ambient”).value.trim(),
dialogue: cleanDialogue,
order: existingOrder != null ? existingOrder : maxOrder + 1,
updatedAt: Date.now()
};

entityRef(pid, “scenes”).child(id).update(payload).then(function () {
STATE.scenes[id] = Object.assign({}, STATE.scenes[id] || {}, payload);
renderScenes();
updateCounts();
closeAllDrawers();
toast(“Scene saved.”);
}).catch(function (e) {
toast(“Save failed: “ + e.message, true);
}).then(function () {
btn.disabled = false;
btn.textContent = “Save Scene”;
});
}

function handleSceneDelete() {
if (!confirm(“Delete this scene?”)) return;
var id = STATE.editingId;
entityRef(STATE.projectId, “scenes”).child(id).remove().then(function () {
delete STATE.scenes[id];
renderScenes();
updateCounts();
closeAllDrawers();
toast(“Scene deleted.”);
});
}

/* ============ PHOTO UPLOAD HANDLERS ============ */

function handlePhotoChange(labelId) {
return function (e) {
var f = e.target.files[0];
if (!f) return;
STATE.pendingImage = f;
var reader = new FileReader();
reader.onload = function () { setUploadPreview(labelId, reader.result); };
reader.readAsDataURL(f);
};
}

/* ============ WIRE UP EVERYTHING ============ */

function wireUp() {
// Setup screen
var btnSaveConfig = $(“btn-save-config”);
if (btnSaveConfig) btnSaveConfig.onclick = handleSaveConfig;

// Auth
var btnSignin = $(“btn-signin”);
if (btnSignin) btnSignin.onclick = handleSignIn;

var btnSignout = $(“btn-signout”);
if (btnSignout) btnSignout.onclick = function () { auth.signOut(); };

// Tabs
var tabs = document.querySelectorAll(”.tab-btn”);
for (var i = 0; i < tabs.length; i++) {
(function (btn) {
btn.onclick = function () { switchTab(btn.getAttribute(“data-tab”)); };
})(tabs[i]);
}

// Add buttons
var addChar = $(“btn-add-character”);
if (addChar) addChar.onclick = function () { openCharacterForm(); };
var addLoc = $(“btn-add-location”);
if (addLoc) addLoc.onclick = function () { openLocationForm(); };
var addScene = $(“btn-add-scene”);
if (addScene) addScene.onclick = function () { openSceneForm(); };
var addDialogue = $(“btn-add-dialogue”);
if (addDialogue) addDialogue.onclick = addDialogueRow;

// Save buttons
$(“project-form-save”).onclick = handleProjectSave;
$(“char-form-save”).onclick = handleCharacterSave;
$(“char-form-delete”).onclick = handleCharacterDelete;
$(“loc-form-save”).onclick = handleLocationSave;
$(“loc-form-delete”).onclick = handleLocationDelete;
$(“scene-form-save”).onclick = handleSceneSave;
$(“scene-form-delete”).onclick = handleSceneDelete;

// Delete project
var delProj = $(“btn-delete-project”);
if (delProj) delProj.onclick = deleteCurrentProject;

// Photo uploads
$(“char-form-photo”).onchange = handlePhotoChange(“char-upload-label”);
$(“loc-form-photo”).onchange = handlePhotoChange(“loc-upload-label”);

// Close buttons
var closes = document.querySelectorAll(”[data-close]”);
for (var j = 0; j < closes.length; j++) closes[j].onclick = closeAllDrawers;
$(“modal-backdrop”).onclick = closeAllDrawers;

// Keyboard
document.addEventListener(“keydown”, function (e) {
if (e.key === “Escape”) closeAllDrawers();
});
}

/* ============ START ============ */

wireUp();
bootstrap();
