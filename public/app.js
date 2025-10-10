const employeeOptions = [
  "Ayu",
  "Budi",
  "Citra",
  "Dimas",
  "Eka",
  "Farah",
  "Galih",
  "Hana",
  "Indra",
  "Joko",
  "Kirana",
  "Laras",
  "Made",
  "Nadia",
  "Oka",
  "Putri",
  "Raka",
  "Sari",
  "Tegar",
  "Wulan"
];

const QUESTIONS = {
  welcome: {
    heading: "Selamat datang di Project Vocal Review",
    copy: [
      "Review ini membutuhkan waktu sekitar 5-10 menit dan harus diselesaikan dalam satu sesi.",
      "Pada bagian umpan balik suara, browser akan meminta izin mikrofon. Silakan klik \"Allow\" untuk melanjutkan."
    ]
  },
  score: {
    heading: "Evaluasi Kuantitatif",
    copy: [
      "Seberapa puas Anda dengan performa bulan ini?",
      "Pilih angka antara 1 (perlu perbaikan) hingga 10 (sangat memuaskan)."
    ]
  },
  nominations: {
    heading: "Nominasi Rekan Kerja",
    fields: [
      { key: "bestPerformance", label: "Best Performance" },
      { key: "mostDiscipline", label: "Most Discipline" },
      { key: "mostImproved", label: "Most Improved" }
    ]
  },
  feedbackDirectors: {
    heading: "Saran untuk Directors/CEO/HR",
    helper: "Klik \"Rekam\" untuk memulai, lalu \"Stop\" setelah selesai. Anda bisa mendengarkan atau merekam ulang sebelum lanjut."
  },
  feedbackSystem: {
    heading: "Saran untuk Sistem Kenapa Creative",
    helper: "Rekam jawaban Anda, kemudian tekan \"Submit Final Review\" untuk mengirim seluruh data."
  }
};

const app = document.getElementById("app");

const searchParams = new URLSearchParams(window.location.search);
const employeeName = searchParams.get("name") || "Karyawan";
const reviewMonth = searchParams.get("month") || new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date());

document.title = `Review ${employeeName} - ${reviewMonth}`;

const state = {
  step: 0,
  name: employeeName,
  month: reviewMonth,
  score: null,
  nominations: {
    bestPerformance: "",
    mostDiscipline: "",
    mostImproved: ""
  },
  recordings: {
    directors: null,
    system: null
  },
  submission: {
    status: "idle",
    message: ""
  }
};

let mediaStream;
let mediaRecorder;
let currentChunks = [];
let recordingTarget = null;

function cleanupRecorder() {
  if (mediaRecorder) {
    mediaRecorder.onstop = null;
    mediaRecorder.ondataavailable = null;
    mediaRecorder = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  currentChunks = [];
  recordingTarget = null;
}

async function startRecording(target) {
  try {
    if (!navigator.mediaDevices) {
      throw new Error("Browser tidak mendukung perekaman audio.");
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    currentChunks = [];
    recordingTarget = target;
    mediaRecorder = new MediaRecorder(mediaStream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        currentChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(currentChunks, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      state.recordings[target] = { blob, url };
      cleanupRecorder();
      render();
    };

    mediaRecorder.start();
    render();
  } catch (error) {
    alert(error.message || "Tidak dapat mengakses mikrofon. Mohon cek pengaturan browser.");
    cleanupRecorder();
    render();
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

function cancelRecording(target) {
  if (state.recordings[target]) {
    URL.revokeObjectURL(state.recordings[target].url);
  }
  state.recordings[target] = null;
  cleanupRecorder();
  render();
}

function renderWelcome() {
  return `
    <header>
      <span class="badge">${state.month} Review</span>
      <h1>Halo, ${state.name}! 👋</h1>
    </header>
    <section class="content">
      ${QUESTIONS.welcome.copy.map((line) => `<p>${line}</p>`).join("")}
    </section>
  `;
}

function renderScore() {
  return `
    <header>
      <span class="badge">Langkah 2 dari 5</span>
      <h2>${QUESTIONS.score.heading}</h2>
      <p>${QUESTIONS.score.copy[0]}</p>
      <p>${QUESTIONS.score.copy[1]}</p>
    </header>
    <section class="content">
      <div class="likert-grid">
        ${Array.from({ length: 10 }, (_, index) => index + 1)
          .map((value) => `<button type="button" class="${state.score === value ? "active" : ""}" data-score="${value}">${value}</button>`)
          .join("")}
      </div>
    </section>
  `;
}

function renderNominations() {
  const options = ["", ...employeeOptions.filter((name) => name !== state.name)];
  return `
    <header>
      <span class="badge">Langkah 3 dari 5</span>
      <h2>${QUESTIONS.nominations.heading}</h2>
    </header>
    <section class="content">
      ${QUESTIONS.nominations.fields
        .map((field) => {
          const currentValue = state.nominations[field.key];
          return `
            <label class="field">
              <p>${field.label}</p>
              <select name="${field.key}">
                ${options
                  .map((name) => `<option value="${name}" ${currentValue === name ? "selected" : ""}>${name || "Pilih nama"}</option>`)
                  .join("")}
              </select>
            </label>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderRecordingStep(stepKey, badgeText) {
  const recording = state.recordings[stepKey];
  const isRecording = mediaRecorder && mediaRecorder.state === "recording" && recordingTarget === stepKey;
  const helperText = stepKey === "directors" ? QUESTIONS.feedbackDirectors.helper : QUESTIONS.feedbackSystem.helper;
  const heading = stepKey === "directors" ? QUESTIONS.feedbackDirectors.heading : QUESTIONS.feedbackSystem.heading;

  const statusCopy = isRecording
    ? "Sedang merekam..."
    : recording
    ? "Rekaman siap dikirim."
    : "Belum ada rekaman.";

  return `
    <header>
      <span class="badge">${badgeText}</span>
      <h2>${heading}</h2>
      <p>${helperText}</p>
    </header>
    <section class="content">
      <div class="recording-card">
        <div class="record-controls">
          <button type="button" class="primary" data-action="record" data-target="${stepKey}" ${isRecording ? "disabled" : ""}>
            ${isRecording ? "Merekam..." : "Rekam"}
          </button>
          <button type="button" class="secondary" data-action="stop" data-target="${stepKey}" ${isRecording ? "" : "disabled"}>Stop</button>
          <button type="button" class="secondary" data-action="redo" data-target="${stepKey}" ${recording ? "" : "disabled"}>Rekam Ulang</button>
        </div>
        ${recording ? `<audio controls src="${recording.url}" preload="metadata"></audio>` : ""}
        <p class="status">${statusCopy}</p>
      </div>
    </section>
  `;
}

function renderSuccess() {
  return `
    <header>
      <h1>Terima kasih! 🎉</h1>
    </header>
    <section class="content">
      <p>Review Anda telah kami terima. Silakan tutup tab ini.</p>
    </section>
  `;
}

function renderFooter() {
  const isFirstStep = state.step === 0;
  const buttonLabel =
    state.step === 3
      ? "Confirm & Next"
      : state.step === steps.length - 2
      ? "Submit Final Review"
      : "Next";
  const canProceed = validations[state.step]();
  const submissionState = state.submission.status;
  const feedbackMessage = state.submission.message;

  return `
    <footer>
      <div>
        ${submissionState === "success" ? `<span class="success">${feedbackMessage}</span>` : ""}
        ${submissionState === "error" ? `<span class="error">${feedbackMessage}</span>` : ""}
      </div>
      <div class="actions">
        <button type="button" class="secondary" data-nav="prev" ${isFirstStep ? "disabled" : ""}>Back</button>
        <button type="button" class="primary" data-nav="next" ${!canProceed || submissionState === "loading" ? "disabled" : ""}>
          ${submissionState === "loading" ? "Mengirim..." : buttonLabel}
        </button>
      </div>
    </footer>
  `;
}

const steps = [
  renderWelcome,
  renderScore,
  renderNominations,
  () => renderRecordingStep("directors", "Langkah 4 dari 5"),
  () => renderRecordingStep("system", "Langkah 5 dari 5"),
  renderSuccess
];

const validations = [
  () => true,
  () => typeof state.score === "number",
  () => Object.values(state.nominations).every((value) => value),
  () => Boolean(state.recordings.directors),
  () => Boolean(state.recordings.system),
  () => true
];

function render() {
  const stepTemplate = steps[state.step]();
  const footerTemplate = state.step === steps.length - 1 ? "" : renderFooter();
  app.innerHTML = `
    ${stepTemplate}
    ${footerTemplate}
  `;
}

function handleScoreSelection(target) {
  if (target.matches("button[data-score]")) {
    state.score = Number(target.dataset.score);
    render();
  }
}

function handleNominationsChange(target) {
  if (target.matches("select[name]")) {
    state.nominations[target.name] = target.value;
  }
}

async function submitData() {
  const formData = new FormData();
  formData.append("name", state.name);
  formData.append("month", state.month);
  formData.append("score", String(state.score));
  formData.append("bestPerformance", state.nominations.bestPerformance);
  formData.append("mostDiscipline", state.nominations.mostDiscipline);
  formData.append("mostImproved", state.nominations.mostImproved);

  const directorsBlob = state.recordings.directors.blob;
  const systemBlob = state.recordings.system.blob;

  formData.append(
    "audioDirectors",
    directorsBlob,
    `${state.name.toLowerCase()}_${state.month.toLowerCase()}_saran_direksi.webm`
  );
  formData.append(
    "audioSystem",
    systemBlob,
    `${state.name.toLowerCase()}_${state.month.toLowerCase()}_saran_sistem.webm`
  );

  state.submission = { status: "loading", message: "" };
  render();

  try {
    const response = await fetch("/api/reviews", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error("Gagal mengirim data, silakan coba lagi.");
    }

    state.submission = { status: "success", message: "Review berhasil dikirim." };
    state.step = steps.length - 1;
    render();
  } catch (error) {
    state.submission = { status: "error", message: error.message };
    render();
  }
}

app.addEventListener("click", (event) => {
  const target = event.target;

  if (target.dataset.score) {
    handleScoreSelection(target);
    return;
  }

  if (target.dataset.nav === "prev") {
    if (state.step > 0) {
      state.step -= 1;
      cleanupRecorder();
      render();
    }
    return;
  }

  if (target.dataset.nav === "next") {
    if (state.step === steps.length - 2) {
      submitData();
      return;
    }

    if (state.step < steps.length - 1) {
      state.step += 1;
      cleanupRecorder();
      render();
    }
    return;
  }

  const action = target.dataset.action;
  const recordTarget = target.dataset.target;

  if (action === "record" && recordTarget) {
    startRecording(recordTarget);
    return;
  }

  if (action === "stop" && recordTarget) {
    stopRecording();
    return;
  }

  if (action === "redo" && recordTarget) {
    cancelRecording(recordTarget);
  }
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("select[name]")) {
    handleNominationsChange(target);
    render();
  }
});

window.addEventListener("beforeunload", () => {
  Object.values(state.recordings).forEach((recording) => {
    if (recording?.url) {
      URL.revokeObjectURL(recording.url);
    }
  });
});

render();
