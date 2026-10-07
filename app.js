let DATA = null;

let state = {
  screen: "home",
  module: null,
  index: 0,
  sound: true,
  session: [],
  trial: null,

  // Response presentation mode
  presentation: "closed",

  // Cue level
  cue: "0",

  // Randomized trial order
  order: [],

  // Stores randomized options for the current session
  trialCache: {}
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];


async function init() {
  DATA = await fetch("data/training-data.json").then(r => r.json());

  bind();

  $("#soundBtn").onclick = () => {
    state.sound = !state.sound;
    $("#soundBtn").textContent = state.sound ? "🔊" : "🔇";
  };

  $("#resetBtn").onclick = reset;
  $("#newSessionBtn").onclick = newRandomSession;
  $("#repeatSessionBtn").onclick = repeatSession;

  $("#playBtn").onclick = play;
  $("#repeatBtn").onclick = play;
  $("#nextBtn").onclick = next;

  $("#presentationMode").onchange = (e) => {
    state.presentation = e.target.value;
    render();
  };

  $("#cueLevel").onchange = (e) => {
    state.cue = e.target.value;
  };

  home();
}


function bind() {
  $$(".nav,[data-screen],[data-module]").forEach((b) => {
    b.onclick = () => {
      if (b.dataset.screen) {
        show(b.dataset.screen);
      } else {
        open(b.dataset.module);
      }
    };
  });
}


function home() {
  show("home");
}


function show(id) {
  state.screen = id;
  state.module = null;
  state.index = 0;
  state.trial = null;

  $$(".screen").forEach((x) => x.classList.remove("active"));

  $("#" + id)?.classList.add("active");

  $$(".nav").forEach((x) => {
    x.classList.toggle("active", x.dataset.screen === id);
  });

  if (id === "home") {
    const n = state.session.length;
    const g = state.session.filter(x => x.correct).length;

    $("#overallScore").textContent =
      n ? Math.round((g / n) * 100) + "%" : "—";

    $("#completedCount").textContent = n;
  } else {
    screen(id.split("-")[1]);
  }
}


function open(id) {
  state.module = String(id);
  state.index = 0;
  state.trial = null;

  // New module = new randomized session
  state.order = [];
  state.trialCache = {};

  $("#home").classList.remove("active");
  $("#training").classList.add("active");

  renderModule();
}


function screen(letter) {
  state.module = "screen-" + letter;

  state.order = [];
  state.trialCache = {};

  $("#moduleTag").textContent = "SCREENING " + letter;

  $("#moduleTitle").textContent = {
    A: "Screening A — शब्द पहचान",
    B: "Screening B — वाक्य पहचान",
    C: "Screening C — sentence completion",
    D: "Screening D — open-set"
  }[letter];

  $("#moduleInstruction").textContent = {
    A: "सुना हुआ शब्द चुनें।",
    B: "सुना हुआ वाक्य चुनें।",
    C: "पूरा sentence सुनकर completion बोलें।",
    D: "पूरा वाक्य सुनें और response दें।"
  }[letter];

  render();
}


function renderModule() {
  const m = DATA.modules[state.module];

  $("#moduleTag").textContent = "MODULE " + state.module;
  $("#moduleTitle").textContent = m.title;
  $("#moduleInstruction").textContent = m.instruction || "";

  render();
}


/*
 * Create randomized trial order.
 * The random order remains fixed during Repeat Same Session.
 */
function list() {
  const base = state.module.startsWith("screen-")
    ? DATA.screening[state.module.split("-")[1]]
    : DATA.modules[state.module].items;

  if (state.order.length !== base.length) {
    state.order = base.map((_, i) => i);

    for (let i = state.order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [state.order[i], state.order[j]] =
        [state.order[j], state.order[i]];
    }
  }

  return state.order.map(i => base[i]);
}


/*
 * Randomize answer options while preserving the correct answer.
 *
 * Example:
 * Original:
 *   stimulus = चाय
 *   options = [चाय, किताब, अस्पताल]
 *   correctIndex = 0
 *
 * Randomized:
 *   options = [अस्पताल, चाय, किताब]
 *   correctIndex = 1
 */
function choiceTrial(raw, cacheKey) {

  const base = raw.stimulus
    ? raw
    : {
        stimulus: raw[0],
        options: raw,
        correctIndex: 0
      };

  // Repeat Same Session:
  // use exactly the same randomized trial.
  if (cacheKey && state.trialCache[cacheKey]) {
    return state.trialCache[cacheKey];
  }

  const opts = base.options.map((text, i) => ({
    text,
    originalIndex: i
  }));

  // Fisher-Yates shuffle
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [opts[i], opts[j]] =
      [opts[j], opts[i]];
  }

  const result = {
    ...base,

    options: opts.map(x => x.text),

    // Find where the original correct answer moved.
    correctIndex: opts.findIndex(
      x => x.originalIndex === base.correctIndex
    )
  };

  if (cacheKey) {
    state.trialCache[cacheKey] = result;
  }

  return result;
}


function render() {

  const area = $("#taskArea");

  const items = list();
  const raw = items[state.index];

  state.trial = null;

  $("#progressText").textContent =
    `${state.index + 1} / ${items.length}`;

  $("#progressBar").style.width =
    ((state.index + 1) / items.length * 100) + "%";

  $("#feedback").textContent = "";
  $("#feedback").className = "";


  /*
   * Determine task type.
   */
  let type;

  if (state.module.startsWith("screen-")) {

    const letter = state.module.split("-")[1];

    if (letter === "A" || letter === "B") {
      type = "choice";
    } else if (letter === "C") {
      type = "completion";
    } else {
      type = "open";
    }

  } else {

    type = DATA.modules[state.module].type;

  }


  /*
   * CLOSED-SET CHOICE TASK
   */
  if (type === "choice") {

    const key =
      state.module + ":" + state.index;

    const trial = choiceTrial(raw, key);

    state.trial = trial;

    /*
     * Closed-set mode
     */
    if (state.presentation === "closed") {

      area.innerHTML = `
        <div class="stimulus hidden">
          ${esc(trial.stimulus)}
        </div>

        <div class="hint">
          Stimulus सुनाएँ; visual text hidden है।
          नीचे दिए गए विकल्पों में सुना हुआ stimulus चुनें।
        </div>

        <div class="options">
          ${trial.options.map((x, i) => `
            <button
              class="option"
              data-i="${i}">
              ${esc(x)}
            </button>
          `).join("")}
        </div>
      `;

      $$(".option").forEach(b => {
        b.onclick = () => choose(b, trial);
      });

      return;
    }


    /*
     * AUDITORY-ONLY MODE
     */
    if (state.presentation === "auditory") {

      area.innerHTML = `
        <div class="stimulus hidden">
          ${esc(trial.stimulus)}
        </div>

        <div class="hint auditory-only">
          केवल सुनें और response बोलें।
          कोई written विकल्प नहीं दिया गया है।
          Clinician response score करें।
        </div>

        <div class="score-actions">
          <button
            class="score-correct"
            data-score="1">
            ✓ Correct
          </button>

          <button
            class="score-incorrect"
            data-score="0">
            ✗ Incorrect
          </button>
        </div>
      `;

      bindScore(trial.stimulus);

      return;
    }


    /*
     * OPEN-SET MODE
     */
    area.innerHTML = `
      <div class="stimulus hidden">
        ${esc(trial.stimulus)}
      </div>

      <div class="hint open-set">
        Listener सुना हुआ response बोले।
        Hindi typing आवश्यक नहीं है।
        Clinician response को Correct / Incorrect score करें।
      </div>

      <div class="score-actions">
        <button
          class="score-correct"
          data-score="1">
          ✓ Correct
        </button>

        <button
          class="score-incorrect"
          data-score="0">
          ✗ Incorrect
        </button>
      </div>
    `;

    bindScore(trial.stimulus);

    return;
  }


  /*
   * SAME / DIFFERENT
   */
  if (type === "same-different") {

    area.innerHTML = `
      <div class="stimulus hidden">
        ${esc(raw[0])} / ${esc(raw[1])}
      </div>

      <div class="hint">
        दोनों stimuli सुनें।
      </div>

      <div class="options">

        <button
          class="option"
          data-v="true">
          समान
        </button>

        <button
          class="option"
          data-v="false">
          अलग
        </button>

      </div>
    `;

    $$(".option").forEach(b => {

      b.onclick = () => {

        const ok =
          b.dataset.v === String(raw[2]);

        answer(
          b,
          ok,
          b.textContent,
          String(raw[2])
        );

      };

    });

    return;
  }


  /*
   * SCREENING C / COMPLETION
   */
  if (type === "completion") {

    area.innerHTML = `
      <div class="stimulus hidden">
        ${esc(raw.prompt)}
      </div>

      <div class="hint">
        पूरा sentence सुनें और listener से completion
        बोलने को कहें। Typing आवश्यक नहीं है।
      </div>

      <div class="score-actions">

        <button
          class="score-correct"
          data-score="1">
          ✓ Correct
        </button>

        <button
          class="score-incorrect"
          data-score="0">
          ✗ Incorrect
        </button>

      </div>
    `;

    bindScore(raw.answer);

    return;
  }


  /*
   * OPEN SENTENCE
   */
  if (type === "open-sentence") {

    const text = raw.text;

    area.innerHTML = `
      <div class="stimulus hidden">
        ${esc(text)}
      </div>

      <div class="hint">
        ${esc(raw.question)}
        <br><br>
        Listener उत्तर बोले।
        Hindi typing आवश्यक नहीं है।
      </div>

      <div class="score-actions">

        <button
          class="score-correct"
          data-score="1">
          ✓ Correct
        </button>

        <button
          class="score-incorrect"
          data-score="0">
          ✗ Incorrect
        </button>

      </div>
    `;

    bindScore(raw.answer || text);

    return;
  }


  /*
   * SPEECH IN NOISE
   */
  if (type === "noise") {

    const text = raw.text;

    area.innerHTML = `
      <div class="stimulus hidden">
        ${esc(text)}
      </div>

      <div class="hint">
        Clinician: noise/SNR अलग से set करें।
        <br><br>
        Listener target keyword बोले।
        Clinician response score करें।
      </div>

      <div class="score-actions">

        <button
          class="score-correct"
          data-score="1">
          ✓ Correct
        </button>

        <button
          class="score-incorrect"
          data-score="0">
          ✗ Incorrect
        </button>

      </div>
    `;

    bindScore(raw.keyword);

    return;
  }


  /*
   * GENERAL OPEN-SET TASKS
   */
  const text =
    typeof raw === "string"
      ? raw
      : raw.text;

  area.innerHTML = `
    <div class="stimulus hidden">
      ${esc(text)}
    </div>

    <div class="hint">
      Listener response बोले।
      <br>
      Hindi typing आवश्यक नहीं है।
      <br>
      Clinician response को Correct / Incorrect score करें।
    </div>

    <div class="score-actions">

      <button
        class="score-correct"
        data-score="1">
        ✓ Correct
      </button>

      <button
        class="score-incorrect"
        data-score="0">
        ✗ Incorrect
      </button>

    </div>
  `;

  bindScore(text);
}


/*
 * Closed-set answer selection
 */
function choose(button, trial) {

  $$(".option").forEach(x => {
    x.classList.remove("correct", "incorrect", "selected");
  });

  const selectedIndex =
    Number(button.dataset.i);

  const correct =
    selectedIndex === Number(trial.correctIndex);

  button.classList.add(
    correct ? "correct" : "incorrect"
  );

  button.classList.add("selected");

  /*
   * Always reveal the correct answer.
   */
  if (!correct) {

    $$(".option").forEach((x, i) => {

      if (i === Number(trial.correctIndex)) {
        x.classList.add("correct");
      }

    });

  }

  record(
    correct,
    trial.options[selectedIndex],
    trial.stimulus
  );
}


/*
 * Same / Different answer
 */
function answer(button, correct, response, target) {

  $$(".option").forEach(x => {
    x.classList.remove("correct", "incorrect");
  });

  button.classList.add(
    correct ? "correct" : "incorrect"
  );

  record(correct, response, target);
}


/*
 * Clinician scoring
 */
function bindScore(target) {

  $(".score-actions button").forEach(button => {

    button.onclick = () => {

      const correct =
        button.dataset.score === "1";

      /*
       * Prevent repeated scoring on same trial.
       */
      $(".score-actions button").forEach(b => {
        b.disabled = true;
      });

      record(
        correct,
        "spoken",
        target
      );
    };

  });
}


/*
 * Record response
 */
function record(correct, response, target) {

  state.session.push({
    module: state.module,
    index: state.index,
    correct,
    response,
    target,
    presentation: state.presentation
  });

  $("#feedback").textContent =
    correct
      ? "✓ सही"
      : "✗ Incorrect";

  $("#feedback").className =
    correct
      ? "good"
      : "bad";
}


/*
 * Legacy text-input support, if an input exists.
 * Hindi typing is NOT required by the current UI.
 */
function submit() {

  const input =
    $("#responseInput");

  if (!input || !input.value.trim()) {
    return false;
  }

  const value =
    input.value.trim();

  const target =
    $("#taskArea").dataset.target || "";

  const normalize = (s) =>
    String(s)
      .replace(/[।,.!?]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  record(
    normalize(value) === normalize(target),
    value,
    target
  );

  return true;
}


/*
 * Determine what should be spoken.
 */
function speech() {

  const items = list();
  const raw = items[state.index];

  /*
   * Screening
   */
  if (state.module.startsWith("screen-")) {

    const letter =
      state.module.split("-")[1];

    if (letter === "A" || letter === "B") {

      const trial =
        state.trial ||
        choiceTrial(
          raw,
          state.module + ":" + state.index
        );

      state.trial = trial;

      return trial.stimulus;
    }

    if (letter === "C") {
      return raw.prompt + " " + raw.answer;
    }

    return raw.text || raw;
  }


  /*
   * Modules
   */
  const module =
    DATA.modules[state.module];

  const type =
    module.type;


  if (type === "choice") {

    const trial =
      state.trial ||
      choiceTrial(
        raw,
        state.module + ":" + state.index
      );

    state.trial = trial;

    return trial.stimulus;
  }


  if (type === "same-different") {
    return raw[0] + " … " + raw[1];
  }


  if (type === "completion") {
    return raw.prompt + " " + raw.answer;
  }


  return typeof raw === "string"
    ? raw
    : raw.text;
}


/*
 * Hindi text-to-speech
 */
function play() {

  if (!state.sound) {
    return;
  }

  const text =
    speech();

  if (!text) {
    return;
  }

  speechSynthesis.cancel();

  const utterance =
    new SpeechSynthesisUtterance(text);

  utterance.lang = "hi-IN";

  utterance.rate = 0.9;

  utterance.pitch = 1;

  speechSynthesis.speak(utterance);
}


/*
 * Next trial
 */
function next() {

  const items = list();

  if (state.index < items.length - 1) {

    state.index++;

    render();

  } else {

    $("#feedback").textContent =
      "✓ Module complete";

    $("#feedback").className =
      "good";

    home();
  }
}


/*
 * Start a completely new randomized session
 */
function newRandomSession() {

  if (!state.module) {

    alert(
      "पहले कोई screening/module खोलें।"
    );

    return;
  }

  state.index = 0;
  state.session = [];
  state.trial = null;

  /*
   * New trial order
   * New option order
   */
  state.order = [];
  state.trialCache = {};

  render();
}


/*
 * Repeat Same Session
 *
 * IMPORTANT:
 * We do NOT clear order or trialCache.
 *
 * Therefore:
 * - same trial order
 * - same option order
 */
function repeatSession() {

  if (!state.module) {

    alert(
      "पहले कोई screening/module खोलें।"
    );

    return;
  }

  state.index = 0;
  state.session = [];
  state.trial = null;

  /*
   * DO NOT reset:
   * state.order
   * state.trialCache
   */

  render();
}


/*
 * Reset everything
 */
function reset() {

  if (!confirm(
    "Session progress reset करें?"
  )) {
    return;
  }

  state = {
    screen: "home",
    module: null,
    index: 0,
    sound: true,
    session: [],
    trial: null,
    presentation: "closed",
    cue: "0",
    order: [],
    trialCache: {}
  };

  home();
}


/*
 * HTML escaping
 */
function esc(s) {

  return String(s).replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m])
  );
}


document.addEventListener(
  "DOMContentLoaded",
  init
);
